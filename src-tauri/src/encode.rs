//! ตัวแปลงเสียง (แผนเสียงและซับ ขั้น 3) · ใช้ในหน้าเสียงและซับ (แปลงชนิดเสียงตอนรวม) และหน้ากราฟเสียง (แปลงเป็นคิว ขั้น 8)
//! ① ตัวแปลงของผู้ทำ codec เป็นค่าตั้งต้น ffmpeg ถอดเสียงเป็นเสียงดิบ (WAV 24 บิต) ส่งทางท่อให้ opusenc lame flac wavpack qaac fdkaac
//! ② ffmpeg ล้วนเป็นตัวรอง (และเป็นตัวเดียวของ AC-3 E-AC-3 ที่ไม่มีตัวแปลงต้นฉบับ)
//! คำสั่งสร้างจากค่าในการ์ดที่เดียวที่นี่ หน้าจอเรียก encode_preview มาแสดง คำสั่งที่เห็นคือคำสั่งที่รันจริง (มอคอัป *"คำสั่งที่จะรัน"*)
//! ความเร็วเสียง ยืดด้วย rubberband ใน ffmpeg ระดับเสียงไม่เพี้ยน · Gain ด้วย volume · ปรับความดังมาตรฐาน EBU R128 ด้วย loudnorm
//! 🔴 ไฟล์ปลายทางเขียนลงโฟลเดอร์ชั่วคราวของโปรแกรมเสมอ ไม่เขียนข้างไฟล์หนัง · ตัวแปลงตายตามโปรแกรมด้วย Job Object

use std::ffi::OsStr;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::tools::tool_command;

/// ค่าในแผงตั้งค่าเสียงของแทร็กหนึ่งแทร็ก · p เก็บค่าของการ์ดแต่ละใบ ชื่อเดียวกับมอคอัป
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct EncodeSpec {
    /// opus aac mp3 ac3 eac3 flac wv
    pub codec: String,
    /// native (ตัวต้นฉบับ) · ffmpeg · qaac · fdkaac
    pub encoder: String,
    /// จำนวนช่องในไฟล์ใหม่ · ไม่มี = ตามต้นฉบับ
    pub channels: Option<u32>,
    /// 16 = ลดเป็น 16 บิตพร้อม dither · ไม่มี = ตามต้นฉบับ
    pub bits: Option<u32>,
    /// อัตราสุ่มใหม่ · ไม่มี = ตามต้นฉบับ
    pub rate: Option<u32>,
    /// ปรับความดัง dB
    pub gain: f64,
    /// ปรับความดังมาตรฐาน EBU R128 (−23 LUFS)
    pub loudnorm: bool,
    /// ความเร็วเสียง [จาก, เป็น] เช่น [25, 23.976] · ไม่มี = ไม่เปลี่ยน
    pub speed: Option<[f64; 2]>,
    /// ค่าของการ์ดแต่ละใบ เช่น bitrate mode comp framesize tune quality level verify
    pub p: serde_json::Map<String, Value>,
}

impl EncodeSpec {
    fn s(&self, k: &str, d: &str) -> String {
        match self.p.get(k) {
            Some(Value::String(s)) => s.clone(),
            Some(Value::Number(n)) => n.to_string(),
            Some(Value::Bool(b)) => if *b { "On".into() } else { "Off".into() },
            _ => d.to_string(),
        }
    }
    fn n(&self, k: &str, d: f64) -> f64 {
        match self.p.get(k) {
            Some(Value::Number(n)) => n.as_f64().unwrap_or(d),
            Some(Value::String(s)) => s.trim().trim_end_matches(" ms").parse().unwrap_or(d),
            _ => d,
        }
    }
    fn on(&self, k: &str, d: bool) -> bool {
        match self.p.get(k) {
            Some(Value::Bool(b)) => *b,
            Some(Value::String(s)) => s == "On",
            _ => d,
        }
    }
    /// นามสกุลไฟล์ที่ได้
    pub fn ext(&self) -> &'static str {
        match self.codec.as_str() {
            "opus" => "opus",
            "aac" => "m4a",
            "mp3" => "mp3",
            "ac3" => "ac3",
            "eac3" => "eac3",
            "flac" => "flac",
            "wv" => "wv",
            _ => "mka",
        }
    }
    /// ชื่อ codec ที่ ffprobe จะเห็นในไฟล์ที่ได้ (ใช้ตรวจไฟล์ใหม่)
    pub fn probe_codec(&self) -> &'static str {
        match self.codec.as_str() {
            "opus" => "opus",
            "aac" => "aac",
            "mp3" => "mp3",
            "ac3" => "ac3",
            "eac3" => "eac3",
            "flac" => "flac",
            "wv" => "wavpack",
            _ => "",
        }
    }
}

/// ขั้นหนึ่งของงานแปลง · เครื่องมือกับอาร์กิวเมนต์ · ขั้นแรกส่งเสียงทางท่อให้ขั้นที่สองเมื่อ piped
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub tool: String,
    pub args: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub steps: Vec<Step>,
    /// ขั้นแรกส่งเสียงทางท่อให้ขั้นที่สอง
    pub piped: bool,
    /// คำสั่งทั้งชุดแบบที่พิมพ์ใน Command Prompt ได้ (หน้าจอแสดงกับปุ่มคัดลอก)
    pub text: String,
    /// คำอธิบายใต้คำสั่ง
    pub note: String,
}

/// ตัวกรองเสียงของ ffmpeg ตามลำดับ ความเร็ว ความดัง ความดังมาตรฐาน ลดบิต
fn filters(spec: &EncodeSpec, dither16: bool) -> Vec<String> {
    let mut f = vec![];
    if let Some([from, to]) = spec.speed {
        if from > 0.0 && to > 0.0 && (from - to).abs() > 1e-6 {
            // เสียงจาก 25 fps เร็วกว่าหนัง 23.976 · ยืดให้ช้าลง tempo = 23.976 / 25 · rubberband คงระดับเสียง
            f.push(format!("rubberband=tempo={:.6}", to / from));
        }
    }
    if spec.gain.abs() > 1e-9 {
        f.push(format!("volume={}dB", fmt_num(spec.gain)));
    }
    if spec.loudnorm {
        f.push("loudnorm=I=-23:TP=-1".into());
    }
    if let Some(r) = spec.rate {
        f.push(format!("aresample={r}"));
    }
    if dither16 {
        f.push("aresample=osf=s16:dither_method=triangular".into());
    }
    f
}

fn fmt_num(v: f64) -> String {
    if v.fract().abs() < 1e-9 { format!("{}", v as i64) } else { format!("{v}") }
}

/// คำสั่ง ffmpeg ส่วนอ่านต้นทาง ถึงตัวกรอง · stream = เลขสตรีมเสียงในไฟล์ต้นทาง (ffprobe)
fn ff_head(src: &str, stream: u64, spec: &EncodeSpec, dither16: bool, channels_cap: Option<u32>) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:2", "-nostats", "-i"].iter().map(|s| s.to_string()).collect();
    a.push(src.into());
    a.extend(["-map".into(), format!("0:{stream}"), "-vn".into(), "-sn".into(), "-dn".into()]);
    let ch = match (spec.channels, channels_cap) {
        (Some(c), Some(cap)) => Some(c.min(cap)),
        (Some(c), None) => Some(c),
        (None, cap) => cap,
    };
    if let Some(c) = ch {
        a.extend(["-ac".into(), c.to_string()]);
    }
    let f = filters(spec, dither16);
    if !f.is_empty() {
        a.extend(["-af".into(), f.join(",")]);
    }
    a
}

/// ส่วนท้ายของ ffmpeg ที่ส่งเสียงดิบทางท่อ
fn ff_pipe_tail(a: &mut Vec<String>, dither16: bool) {
    a.extend(["-c:a".into(), if dither16 { "pcm_s16le".into() } else { "pcm_s24le".into() }, "-f".into(), "wav".into(), "-".into()]);
}

/// แปลงค่าในการ์ดเป็นขั้นตอนจริง · out = ไฟล์ปลายทางในโฟลเดอร์ชั่วคราว · src_channels = ช่องของต้นทาง (MP3 รับได้ 2 ช่อง)
pub fn build(spec: &EncodeSpec, src: &str, stream: u64, out: &str, src_channels: Option<u32>) -> Result<Plan, String> {
    let dither16 = spec.bits == Some(16) && matches!(spec.codec.as_str(), "flac" | "wv");
    let native = spec.encoder.is_empty() || spec.encoder == "native";
    let (steps, piped, note): (Vec<Step>, bool, String) = match (spec.codec.as_str(), native, spec.encoder.as_str()) {
        ("opus", true, _) => {
            let mut ff = ff_head(src, stream, spec, false, None);
            ff_pipe_tail(&mut ff, false);
            let mode = match spec.s("mode", "VBR").as_str() { "Constrained VBR" => "--cvbr", "Hard CBR" => "--hard-cbr", _ => "--vbr" };
            let mut e = vec!["--quiet".to_string(), "--ignorelength".into(), "--bitrate".into(), fmt_num(spec.n("bitrate", 160.0)), mode.into(), "--comp".into(), fmt_num(spec.n("comp", 10.0)),
                "--framesize".into(), fmt_num(spec.n("framesize", 20.0))];
            match spec.s("tune", "Auto").as_str() { "Music" => e.push("--music".into()), "Speech" => e.push("--speech".into()), _ => {} }
            e.extend(["-".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "opusenc".into(), args: e }], true, "ffmpeg ถอดเสียงเป็นเสียงดิบ ส่งทางท่อให้ opusenc บีบ".into())
        }
        ("opus", false, _) => {
            let mut ff = ff_head(src, stream, spec, false, None);
            let vbr = match spec.s("mode", "VBR").as_str() { "Constrained VBR" => "constrained", "Hard CBR" => "off", _ => "on" };
            ff.extend(["-c:a".into(), "libopus".into(), "-b:a".into(), format!("{}k", fmt_num(spec.n("bitrate", 160.0))), "-vbr".into(), vbr.into(),
                "-compression_level".into(), fmt_num(spec.n("comp", 10.0)), "-frame_duration".into(), fmt_num(spec.n("framesize", 20.0))]);
            match spec.s("tune", "Auto").as_str() { "Music" => ff.extend(["-application".into(), "audio".into()]), "Speech" => ff.extend(["-application".into(), "voip".into()]), _ => {} }
            ff.extend(["-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, "ffmpeg ถอดและบีบในคำสั่งเดียว ใช้ libopus ข้างใน".into())
        }
        ("mp3", true, _) => {
            // MP3 เก็บได้สูงสุด 2 ช่อง ffmpeg รวม 5.1 เป็น 2 ช่องก่อน
            let mono = spec.s("stereo", "Joint stereo") == "Mono";
            let mut ff = ff_head(src, stream, spec, false, Some(if mono { 1 } else { 2 }.min(src_channels.unwrap_or(2).max(1))));
            // lame รับเสียงดิบ 16 บิต
            ff.extend(["-c:a".into(), "pcm_s16le".into(), "-f".into(), "wav".into(), "-".into()]);
            let mut e = vec!["--quiet".to_string()];
            match spec.s("mode", "VBR").as_str() {
                "ABR" => e.extend(["--abr".into(), fmt_num(spec.n("bitrate", 192.0))]),
                "CBR" => e.extend(["-b".into(), fmt_num(spec.n("bitrate", 192.0)), "--cbr".into()]),
                _ => e.extend(["-V".into(), fmt_num(spec.n("vbrq", 2.0))]),
            }
            let st = match spec.s("stereo", "Joint stereo").as_str() { "Stereo" => "s", "Mono" => "m", _ => "j" };
            e.extend(["-q".into(), fmt_num(spec.n("quality", 2.0)), "-m".into(), st.into(), "-".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "lame".into(), args: e }], true, "MP3 เก็บได้สูงสุด 2 ช่อง ffmpeg รวมช่องก่อน แล้วส่งเสียงดิบให้ lame".into())
        }
        ("mp3", false, _) => {
            let mono = spec.s("stereo", "Joint stereo") == "Mono";
            let mut ff = ff_head(src, stream, spec, false, Some(if mono { 1 } else { 2 }.min(src_channels.unwrap_or(2).max(1))));
            ff.extend(["-c:a".into(), "libmp3lame".into()]);
            match spec.s("mode", "VBR").as_str() {
                "ABR" => ff.extend(["-abr".into(), "1".into(), "-b:a".into(), format!("{}k", fmt_num(spec.n("bitrate", 192.0)))]),
                "CBR" => ff.extend(["-b:a".into(), format!("{}k", fmt_num(spec.n("bitrate", 192.0)))]),
                _ => ff.extend(["-q:a".into(), fmt_num(spec.n("vbrq", 2.0))]),
            }
            ff.extend(["-compression_level".into(), fmt_num(spec.n("quality", 2.0)), "-joint_stereo".into(), if spec.s("stereo", "Joint stereo") == "Joint stereo" { "1".into() } else { "0".into() }, "-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, "ffmpeg ใช้ LAME ข้างใน ค่าเหมือนตัวต้นฉบับ".into())
        }
        ("flac", true, _) => {
            let mut ff = ff_head(src, stream, spec, dither16, None);
            ff_pipe_tail(&mut ff, dither16);
            let mut e = vec!["--silent".to_string(), "--ignore-chunk-sizes".into(), format!("-{}", fmt_num(spec.n("level", 8.0))), "-j".into(), fmt_num(spec.n("threads", 4.0))];
            if spec.on("verify", true) { e.push("-V".into()); }
            e.extend(["-".into(), "-o".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "flac".into(), args: e }], true,
             if dither16 { "ลดเป็น 16 บิตที่ ffmpeg ก่อน ใส่ dither ให้".into() } else { "ffmpeg ส่งเสียงดิบ 24 บิตให้ flac ครบทุกบิต".into() })
        }
        ("flac", false, _) => {
            let mut ff = ff_head(src, stream, spec, dither16, None);
            ff.extend(["-c:a".into(), "flac".into(), "-compression_level".into(), fmt_num(spec.n("level", 8.0))]);
            if dither16 { ff.extend(["-sample_fmt".into(), "s16".into()]); }
            ff.extend(["-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, "FLAC ของ ffmpeg ไม่มีช่อง Threads กับ Verify".into())
        }
        ("wv", true, _) => {
            let mut ff = ff_head(src, stream, spec, dither16, None);
            ff_pipe_tail(&mut ff, dither16);
            let mut e = vec!["-q".to_string(), "-i".into()];
            match spec.s("mode", "Normal").as_str() { "Fast" => e.push("-f".into()), "High" => e.push("-h".into()), "Very High" => e.push("-hh".into()), _ => {} }
            let x = spec.n("extra", 0.0) as i64;
            if x > 0 { e.push(format!("-x{x}")); }
            if spec.on("verify", false) { e.push("-v".into()); }
            e.extend(["-".into(), "-o".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "wavpack".into(), args: e }], true, "ffmpeg ถอดเสียงส่งทางท่อให้ wavpack บีบ".into())
        }
        ("wv", false, _) => {
            let mut ff = ff_head(src, stream, spec, dither16, None);
            let cl = match spec.s("mode", "Normal").as_str() { "Fast" => 1, "High" => 3, "Very High" => 4, _ => 2 };
            ff.extend(["-c:a".into(), "wavpack".into(), "-compression_level".into(), cl.to_string()]);
            if dither16 { ff.extend(["-sample_fmt".into(), "s16p".into()]); }
            ff.extend(["-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, "WavPack ของ ffmpeg ไม่มี Hybrid กับ Verify".into())
        }
        ("ac3" | "eac3", _, _) => {
            let mut ff = ff_head(src, stream, spec, false, Some(6.min(src_channels.unwrap_or(6).max(1))));
            let cm = match spec.s("cmix", "−4.5 dB").as_str() { "−3 dB" => "0.707", "−6 dB" => "0.500", _ => "0.595" };
            let sm = match spec.s("smix", "−6 dB").as_str() { "−3 dB" => "0.707", "Off" => "0.000", _ => "0.500" };
            let rt = match spec.s("room", "Not indicated").as_str() { "Large" => "large", "Small" => "small", _ => "notindicated" };
            ff.extend(["-c:a".into(), spec.codec.clone(), "-b:a".into(), format!("{}k", fmt_num(spec.n("bitrate", 640.0))), "-dialnorm".into(), fmt_num(spec.n("dialnorm", -31.0)),
                "-center_mixlev".into(), cm.into(), "-surround_mixlev".into(), sm.into()]);
            // ffmpeg ตั้งชนิดห้องได้เฉพาะคู่กับระดับเสียงห้อง (ลองแล้วขึ้น mixing_level must be set if room_type is set) · ไม่ระบุห้อง ไม่ส่งทั้งคู่
            if rt != "notindicated" {
                ff.extend(["-mixing_level".into(), "105".into(), "-room_type".into(), rt.into()]);
            }
            ff.extend(["-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, format!("{} ไม่มีตัวต้นฉบับ ffmpeg บีบเอง", if spec.codec == "ac3" { "AC-3" } else { "E-AC-3" }))
        }
        ("aac", _, "qaac") => {
            let mut ff = ff_head(src, stream, spec, false, None);
            ff_pipe_tail(&mut ff, false);
            let mut e = vec!["--silent".to_string(), "--ignorelength".into()];
            match spec.s("mode", "TVBR").as_str() {
                "CVBR" => e.extend(["--cvbr".into(), fmt_num(spec.n("bitrate", 256.0))]),
                "ABR" => e.extend(["--abr".into(), fmt_num(spec.n("bitrate", 256.0))]),
                "CBR" => e.extend(["--cbr".into(), fmt_num(spec.n("bitrate", 256.0))]),
                _ => e.extend(["--tvbr".into(), fmt_num(spec.n("tvbr", 91.0))]),
            }
            if spec.s("profile", "AAC-LC") != "AAC-LC" { e.push("--he".into()); }
            e.extend(["--quality".into(), fmt_num(spec.n("quality", 2.0)), "-".into(), "-o".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "qaac64".into(), args: e }], true, "ffmpeg ถอดเสียงส่งทางท่อให้ qaac บีบด้วยตัวของ Apple".into())
        }
        ("aac", _, "fdkaac") => {
            let mut ff = ff_head(src, stream, spec, false, None);
            ff_pipe_tail(&mut ff, false);
            let mut e = vec!["--silent".to_string(), "--ignorelength".into()];
            match spec.s("mode", "VBR").as_str() {
                "CBR" => e.extend(["-b".into(), fmt_num(spec.n("bitrate", 256.0))]),
                _ => e.extend(["-m".into(), fmt_num(spec.n("vbr", 5.0))]),
            }
            if spec.s("profile", "AAC-LC") != "AAC-LC" { e.extend(["-p".into(), "5".into()]); }
            e.extend(["-o".into(), out.into(), "-".into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }, Step { tool: "fdkaac".into(), args: e }], true, "ffmpeg ถอดเสียงส่งทางท่อให้ fdkaac บีบด้วยตัวของ Fraunhofer".into())
        }
        ("aac", _, _) => {
            // AAC ของ ffmpeg ไม่มี TVBR ใช้บิตเรตเฉลี่ย
            let mut ff = ff_head(src, stream, spec, false, None);
            ff.extend(["-c:a".into(), "aac".into(), "-b:a".into(), format!("{}k", fmt_num(spec.n("bitrate", 256.0))), "-n".into(), out.into()]);
            (vec![Step { tool: "ffmpeg".into(), args: ff }], false, "AAC ของ ffmpeg ไม่มี TVBR ใช้บิตเรตเฉลี่ย".into())
        }
        (c, _, _) => return Err(format!("ยังแปลงเป็นชนิด {c} ไม่ได้")),
    };
    let text = steps.iter().map(|s| format!("{} {}", s.tool, s.args.iter().map(|a| quote(a)).collect::<Vec<_>>().join(" "))).collect::<Vec<_>>().join(" |\n  ");
    Ok(Plan { steps, piped, text, note })
}

fn quote(a: &str) -> String {
    if a.is_empty() || a.contains([' ', '"', '|', '&', '(', ')', ',', ';']) { format!("\"{}\"", a.replace('"', "\\\"")) } else { a.to_string() }
}

// ---------------------------------------------------------------- รัน

pub enum Done {
    Ok,
    Cancelled,
    Failed(String),
}

/// รันงานแปลง · dir_of = โฟลเดอร์ของตัวแปลงแต่ละตัว (ตัวที่แนบมา หรือโฟลเดอร์ตัวแปลงที่ใส่เอง) · progress รับเปอร์เซ็นต์ (ต้องรู้ความยาวต้นทาง)
/// stop = กดหยุด · ไฟล์ปลายทางที่ทำค้าง คนเรียกลบเอง
pub fn run(dir_of: &dyn Fn(&str) -> PathBuf, plan: &Plan, total_secs: Option<f64>, stop: &dyn Fn() -> bool, progress: &mut dyn FnMut(f64)) -> Result<Done, String> {
    let mut ff = tool_command(&dir_of(&plan.steps[0].tool), &plan.steps[0].tool, plan.steps[0].args.iter().map(OsStr::new))
        .stdout(if plan.piped { Stdio::piped() } else { Stdio::null() }).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก {} ไม่ได้: {e}", plan.steps[0].tool))?;
    crate::winutil::kill_with_app(&ff);
    let mut enc = if plan.piped {
        let pipe = ff.stdout.take().ok_or("ต่อท่อเสียงไม่ได้")?;
        let s = &plan.steps[1];
        let child = match tool_command(&dir_of(&s.tool), &s.tool, s.args.iter().map(OsStr::new)).stdin(Stdio::from(pipe)).stdout(Stdio::null()).stderr(Stdio::piped()).spawn() {
            Ok(c) => c,
            Err(e) => { let _ = ff.kill(); let _ = ff.wait(); return Err(format!("เรียก {} ไม่ได้: {e}", s.tool)); }
        };
        crate::winutil::kill_with_app(&child);
        Some(child)
    } else {
        None
    };
    // ffmpeg เขียนความคืบหน้าลงช่องข้อผิดพลาด (-progress pipe:2) · อ่านทีละบรรทัดอีกเส้นทาง
    let err = ff.stderr.take().unwrap();
    let (tx, rx) = mpsc::channel::<String>();
    let reader = std::thread::spawn(move || {
        let mut other = String::new();
        for line in BufReader::new(err).split(b'\n').flatten() {
            let l = String::from_utf8_lossy(&line).trim_end_matches('\r').to_string();
            if l.starts_with("out_time_us=") { let _ = tx.send(l); } else if !l.contains('=') || l.starts_with("[") { other.push_str(&l); other.push('\n'); }
        }
        other
    });
    let enc_err = enc.as_mut().and_then(|c| c.stderr.take()).map(|mut e| std::thread::spawn(move || { let mut s = String::new(); let _ = e.read_to_string(&mut s); s }));
    let mut last = Instant::now() - Duration::from_secs(1);
    let status = loop {
        while let Ok(l) = rx.try_recv() {
            if let (Some(us), Some(total)) = (l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()), total_secs) {
                if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    progress((us / 1e6 / total * 100.0).clamp(0.0, 100.0));
                }
            }
        }
        if stop() {
            let _ = ff.kill();
            if let Some(e) = enc.as_mut() { let _ = e.kill(); }
            let _ = ff.wait();
            if let Some(e) = enc.as_mut() { let _ = e.wait(); }
            return Ok(Done::Cancelled);
        }
        let ff_done = ff.try_wait().map_err(|e| e.to_string())?;
        let enc_done = match enc.as_mut() { Some(e) => e.try_wait().map_err(|e| e.to_string())?.map(Some), None => Some(None) };
        match (ff_done, enc_done) {
            (Some(a), Some(b)) => break (a, b),
            // ตัวแปลงตายก่อน ffmpeg จะค้างเขียนลงท่อที่ไม่มีคนอ่าน · ฆ่า ffmpeg ด้วย
            (None, Some(Some(b))) if !b.success() => { let _ = ff.kill(); let a = ff.wait().map_err(|e| e.to_string())?; break (a, Some(b)); }
            _ => std::thread::sleep(Duration::from_millis(40)),
        }
    };
    let ff_msg = reader.join().unwrap_or_default();
    let enc_msg = enc_err.and_then(|h| h.join().ok()).unwrap_or_default();
    let (a, b) = status;
    if !a.success() {
        return Ok(Done::Failed(format!("ffmpeg ถอดเสียงไม่สำเร็จ {}", ff_msg.lines().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(160).collect::<String>())));
    }
    if let Some(b) = b {
        if !b.success() {
            return Ok(Done::Failed(format!("{} บีบเสียงไม่สำเร็จ {}", plan.steps[1].tool, enc_msg.lines().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(160).collect::<String>())));
        }
    }
    progress(100.0);
    Ok(Done::Ok)
}

// ---------------------------------------------------------------- ทะเบียนตัวแปลง

/// ตัวแปลงที่โปรแกรมรู้จัก (ชื่อไฟล์ ชนิด คำสั่งถามรุ่น แนบมากับโปรแกรมไหม) · ตัวที่สัญญาอนุญาตไม่ให้แจก ผู้ใช้วางเองในโฟลเดอร์ตัวแปลง
pub const ENCODERS: [(&str, &str, &str, bool); 7] = [
    ("flac", "FLAC", "--version", true),
    ("opusenc", "Opus", "--version", true),
    ("lame", "MP3", "--version", true),
    ("wavpack", "WavPack", "--version", true),
    ("qaac64", "AAC · ALAC", "--check", false),
    ("fdkaac", "AAC · HE-AAC", "--help", false),
    ("ffmpeg", "ทุกชนิดที่แปลงได้ (ตัวรอง)", "-version", true),
];

/// โฟลเดอร์ตัวแปลงที่ใส่เอง · AppData\Local\ชั้นหนัง\ตัวแปลง (มอคอัปหน้าตั้งค่า)
pub fn user_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().local_data_dir().map_err(|e| e.to_string())?.join("ชั้นหนัง").join("ตัวแปลง"))
}

/// เลขรุ่นจากข้อความที่ตัวแปลงตอบ · opusenc บอกรุ่นของ libopus ข้างใน
pub fn version_of(name: &str, text: &str) -> Option<String> {
    let pick = |s: &str| -> Option<String> {
        let start = s.find(|c: char| c.is_ascii_digit())?;
        let v: String = s[start..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        let v = v.trim_end_matches('.').to_string();
        v.contains('.').then_some(v)
    };
    if name == "opusenc" {
        if let Some(i) = text.find("libopus ") { return pick(&text[i + 8..]).map(|v| format!("libopus {v}")); }
    }
    let line = text.lines().find(|l| !l.trim().is_empty())?;
    let after = line.find("version").map(|i| &line[i..]).unwrap_or(line);
    pick(after)
}

fn ver_key(v: &str) -> Vec<u64> {
    v.trim_start_matches("libopus ").split('.').map(|x| x.parse().unwrap_or(0)).collect()
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
    pub name: String,
    pub codecs: String,
    /// bundled แนบมากับโปรแกรม · user โฟลเดอร์ตัวแปลง · missing ไม่เจอ
    pub source: String,
    pub version: Option<String>,
    pub ok: bool,
    pub problem: Option<String>,
    pub dir: String,
}

fn probe_one(dir: &Path, name: &str, arg: &str) -> Result<String, String> {
    let exe = dir.join(format!("{name}.exe"));
    if !exe.exists() { return Err("missing".into()); }
    let out = crate::tools::run_tool_timeout(dir, name, [arg], crate::tools::SHORT_TIMEOUT)?;
    let mut t = String::from_utf8_lossy(&out.stdout).to_string();
    t.push_str(&String::from_utf8_lossy(&out.stderr));
    // Windows ตอบ 0xC0000135 = หา DLL ที่ต้องใช้ไม่เจอ (ลองแล้วกับ flac ที่ไม่มี libFLAC.dll)
    if out.status.code() == Some(-1073741515) { return Err("ขาดไฟล์ประกอบ (DLL) วางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์เดียวกัน".into()); }
    Ok(t)
}

/// สถานะตัวแปลงทุกตัว · ตัวที่อยู่ทั้งสองที่ ใช้ตัวที่รุ่นใหม่กว่า
pub fn status(tools: &Path, user: &Path) -> Vec<EncoderInfo> {
    ENCODERS.iter().map(|(name, codecs, arg, bundled)| {
        let b = if *bundled { probe_one(tools, name, arg).ok().map(|t| (version_of(name, &t), tools.to_path_buf())) } else { None };
        let u = probe_one(user, name, arg);
        let u_ok = u.as_ref().ok().map(|t| (version_of(name, t), user.to_path_buf()));
        let use_user = match (&b, &u_ok) {
            (None, Some(_)) => true,
            (Some((bv, _)), Some((uv, _))) => ver_key(uv.as_deref().unwrap_or("0")) > ver_key(bv.as_deref().unwrap_or("0")),
            _ => false,
        };
        let pick = if use_user { u_ok.clone() } else { b.clone() };
        let problem = match (&pick, &u) { (None, Err(e)) if e != "missing" => Some(e.clone()), _ => None };
        EncoderInfo {
            name: name.to_string(), codecs: codecs.to_string(),
            source: match (&pick, use_user) { (None, _) => "missing".into(), (Some(_), true) => "user".into(), _ => "bundled".into() },
            version: pick.as_ref().and_then(|p| p.0.clone()), ok: pick.is_some(), problem,
            dir: pick.map(|p| p.1.to_string_lossy().to_string()).unwrap_or_default(),
        }
    }).collect()
}

/// โฟลเดอร์ของตัวแปลงที่จะใช้จริง · ไม่เจอที่ไหนใช้โฟลเดอร์เครื่องมือ (เรียกแล้วจะบอกว่าเรียกไม่ได้)
pub fn dir_for(list: &[EncoderInfo], tools: &Path, name: &str) -> PathBuf {
    list.iter().find(|e| e.name == name && e.ok).map(|e| PathBuf::from(&e.dir)).unwrap_or_else(|| tools.to_path_buf())
}

#[tauri::command]
pub async fn encoders_status(app: tauri::AppHandle) -> Result<Vec<EncoderInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::tools::tools_dir(&app)?;
        let user = user_dir(&app)?;
        let _ = std::fs::create_dir_all(&user);
        Ok(status(&tools, &user))
    }).await.map_err(|e| e.to_string())?
}

/// ที่อยู่โฟลเดอร์ตัวแปลงที่ใส่เอง ให้หน้าตั้งค่าแสดง (ไม่เปิด Explorer)
#[tauri::command]
pub fn encoders_user_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(user_dir(&app)?.to_string_lossy().to_string())
}

/// เปิดโฟลเดอร์ตัวแปลงที่ใส่เองใน Explorer (หน้าตั้งค่า) · สร้างให้ก่อนถ้ายังไม่มี
#[tauri::command]
pub fn encoders_open_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let user = user_dir(&app)?;
    std::fs::create_dir_all(&user).map_err(|e| e.to_string())?;
    app.opener().open_path(user.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(user.to_string_lossy().to_string())
}

/// คำสั่งที่จะรันจริงของค่าในการ์ด · หน้าจอแสดงในกล่องคำสั่งพร้อมปุ่มคัดลอก (ชื่อไฟล์เป็นตัวอย่าง ของจริงเป็นที่อยู่เต็มในโฟลเดอร์ชั่วคราว)
#[tauri::command]
pub fn encode_preview(spec: EncodeSpec, src_name: String, stream: u64, channels: Option<u32>) -> Result<Plan, String> {
    let out = format!("เสียง {}.{}", stream, spec.ext());
    build(&spec, &src_name, stream, &out, channels)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;

    fn tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }
    fn av(name: &str) -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join(name);
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }
    fn spec(codec: &str, encoder: &str, p: Value) -> EncodeSpec {
        EncodeSpec { codec: codec.into(), encoder: encoder.into(), p: p.as_object().cloned().unwrap_or_default(), ..Default::default() }
    }

    #[test]
    fn commands_follow_cards() {
        let s = spec("opus", "native", json!({"bitrate": 160, "mode": "VBR", "comp": 10, "framesize": "20 ms", "tune": "Music"}));
        let p = build(&s, "M.mkv", 2, "O.opus", Some(6)).unwrap();
        assert!(p.piped);
        assert_eq!(p.steps[1].args.join(" "), "--quiet --ignorelength --bitrate 160 --vbr --comp 10 --framesize 20 --music - O.opus");
        assert!(p.steps[0].args.join(" ").contains("-map 0:2 -vn -sn -dn -c:a pcm_s24le -f wav -"), "{:?}", p.steps[0].args);
        // MP3 5.1 รวมเป็น 2 ช่อง · lame รับ 16 บิต
        let m = build(&spec("mp3", "native", json!({"mode": "VBR", "vbrq": 0, "quality": 2, "stereo": "Joint stereo"})), "M.mkv", 1, "O.mp3", Some(6)).unwrap();
        assert!(m.steps[0].args.join(" ").contains("-ac 2"), "{:?}", m.steps[0].args);
        assert_eq!(m.steps[1].args.join(" "), "--quiet -V 0 -q 2 -m j - O.mp3");
        // FLAC ลด 16 บิตพร้อม dither
        let mut f = spec("flac", "native", json!({"level": 8, "threads": 4, "verify": "On"}));
        f.bits = Some(16);
        let fp = build(&f, "M.mkv", 1, "O.flac", Some(2)).unwrap();
        assert!(fp.steps[0].args.join(" ").contains("aresample=osf=s16:dither_method=triangular -c:a pcm_s16le"), "{:?}", fp.steps[0].args);
        assert_eq!(fp.steps[1].args.join(" "), "--silent --ignore-chunk-sizes -8 -j 4 -V - -o O.flac");
        // AC-3 ffmpeg ล้วน ความเร็ว 25 → 23.976 กับ Gain −3 dB กับ loudnorm
        let mut a = spec("ac3", "ffmpeg", json!({"bitrate": 640, "dialnorm": -31, "cmix": "−3 dB", "smix": "Off", "room": "Large"}));
        a.speed = Some([25.0, 23.976]);
        a.gain = -3.0;
        a.loudnorm = true;
        let ap = build(&a, "M.mkv", 1, "O.ac3", Some(6)).unwrap();
        let s = ap.steps[0].args.join(" ");
        assert!(!ap.piped);
        assert!(s.contains("-af rubberband=tempo=0.959040,volume=-3dB,loudnorm=I=-23:TP=-1"), "{s}");
        assert!(s.contains("-c:a ac3 -b:a 640k -dialnorm -31 -center_mixlev 0.707 -surround_mixlev 0.000 -mixing_level 105 -room_type large -n O.ac3"), "{s}");
        assert!(ap.text.starts_with("ffmpeg -hide_banner"), "{}", ap.text);
        // WavPack โหมด High extra 4 verify
        let w = build(&spec("wv", "native", json!({"mode": "High", "extra": 4, "verify": "On"})), "M.mkv", 1, "O.wv", Some(2)).unwrap();
        assert_eq!(w.steps[1].args.join(" "), "-q -i -h -x4 -v - -o O.wv");
        // คำสั่งที่แสดงใส่เครื่องหมายคำพูดให้ชื่อที่มีเว้นวรรค
        let t = build(&spec("opus", "ffmpeg", json!({"bitrate": 128})), "D:\\หนัง\\ดาวตก (2024).mkv", 1, "เสียง 1.opus", None).unwrap();
        assert!(t.text.contains("\"D:\\หนัง\\ดาวตก (2024).mkv\""), "{}", t.text);
        assert!(build(&spec("ape", "native", json!({})), "M", 1, "O", None).is_err());
    }

    #[test]
    fn versions_and_registry() {
        assert_eq!(version_of("flac", "flac 1.5.0\n").as_deref(), Some("1.5.0"));
        assert_eq!(version_of("lame", "LAME 64bits version 4.0 (https://lame.sourceforge.io)").as_deref(), Some("4.0"));
        assert_eq!(version_of("opusenc", "opusenc opus-tools 0.2-52-g5f894e9 (using libopus 1.6.1-11-g788cc89)").as_deref(), Some("libopus 1.6.1"));
        assert_eq!(version_of("wavpack", "wavpack 5.9.0\nlibwavpack 5.9.0").as_deref(), Some("5.9.0"));
        assert_eq!(version_of("ffmpeg", "ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026").as_deref(), Some("9.0.2"));
        // โฟลเดอร์ที่ใส่เองว่าง ใช้ตัวที่แนบมา · qaac fdkaac ไม่เจอ
        let empty = std::env::temp_dir().join(format!("movie-shelf-enc-empty-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&empty);
        let st = status(&tools(), &empty);
        let by = |n: &str| st.iter().find(|e| e.name == n).unwrap().clone();
        assert_eq!((by("flac").source.as_str(), by("flac").version.as_deref()), ("bundled", Some("1.5.0")));
        assert_eq!(by("lame").version.as_deref(), Some("4.0"));
        assert_eq!(by("opusenc").version.as_deref(), Some("libopus 1.6.1"));
        assert_eq!((by("qaac64").source.as_str(), by("qaac64").ok), ("missing", false));
        // วาง flac.exe ไว้โฟลเดอร์ที่ใส่เองโดยไม่มี libFLAC.dll · ตัวที่แนบมายังใช้ได้ ไม่ถูกตัวที่พังแทน
        std::fs::copy(tools().join("flac.exe"), empty.join("flac.exe")).unwrap();
        let st2 = status(&tools(), &empty);
        let f = st2.iter().find(|e| e.name == "flac").unwrap();
        assert_eq!(f.source, "bundled");
        assert_eq!(dir_for(&st2, &tools(), "flac"), tools());
        let _ = std::fs::remove_dir_all(&empty);
    }

    /// แปลงจริงทุกชนิดกับเสียงอังกฤษของดาวตก (60 วินาที) · ffprobe ชนิดตรง ความยาวตรง บิตเรตใกล้ค่า
    #[test]
    fn real_encodes() {
        let Some(movie) = av("ดาวตก (2024).mkv") else { return };
        let dir = std::env::temp_dir().join(format!("movie-shelf-encode-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let cases = [
            spec("opus", "native", json!({"bitrate": 128})),
            spec("opus", "ffmpeg", json!({"bitrate": 96})),
            spec("mp3", "native", json!({"mode": "CBR", "bitrate": 192})),
            spec("mp3", "ffmpeg", json!({"mode": "VBR", "vbrq": 2})),
            spec("flac", "native", json!({"level": 5})),
            spec("flac", "ffmpeg", json!({"level": 5})),
            spec("wv", "native", json!({"mode": "Normal"})),
            spec("wv", "ffmpeg", json!({"mode": "Normal"})),
            spec("ac3", "ffmpeg", json!({"bitrate": 384})),
            spec("ac3", "ffmpeg", json!({"bitrate": 448, "room": "Large", "cmix": "−3 dB"})),
            spec("eac3", "ffmpeg", json!({"bitrate": 256})),
            spec("aac", "ffmpeg", json!({"bitrate": 160})),
        ];
        let src = movie.to_string_lossy().to_string();
        for (i, s) in cases.iter().enumerate() {
            let out = dir.join(format!("{i}.{}", s.ext()));
            let plan = build(s, &src, 1, &out.to_string_lossy(), Some(2)).unwrap();
            let mut seen = 0.0;
            let r = run(&|_| tools(), &plan, Some(60.0), &|| false, &mut |p| seen = p).unwrap();
            assert!(matches!(r, Done::Ok), "{} {} ไม่สำเร็จ {}", s.codec, s.encoder, match r { Done::Failed(m) => m, _ => String::new() });
            assert_eq!(seen, 100.0);
            let j = crate::outfile::ffprobe_json(&tools(), &out).unwrap();
            let st = &j["streams"][0];
            assert_eq!(st["codec_name"].as_str(), Some(s.probe_codec()), "{} {}", s.codec, s.encoder);
            let d = crate::outfile::duration_of(&j).unwrap();
            assert!((d - 60.0).abs() < 0.2, "{} {} ยาว {d}", s.codec, s.encoder);
            // บิตเรตเป๊ะเฉพาะโหมดบิตเรตคงที่ · VBR ตัวเข้ารหัสใช้บิตตามเนื้อเสียง (เสียงซ่าทดสอบ Opus VBR 96 ได้ราว 62) เช็กแค่ไม่เกิน
            if let Some(k) = s.p.get("bitrate").and_then(|v| v.as_f64()) {
                let size = std::fs::metadata(&out).unwrap().len() as f64;
                let kbps = size * 8.0 / d / 1000.0;
                let cbr = matches!(s.codec.as_str(), "ac3" | "eac3" | "aac") || s.s("mode", "VBR") == "CBR";
                assert!(kbps <= k * 1.35 && (!cbr || (kbps - k).abs() / k < 0.35), "{} {} บิตเรต {kbps:.0} ตั้ง {k}", s.codec, s.encoder);
            }
        }
        // ความเร็ว 25 → 23.976 ยืดเสียง 57.57 วินาทีให้ยาว 60 วินาที
        let pal = av("ดาวตก (2024) PAL 25fps.ac3").unwrap();
        let mut s = spec("flac", "native", json!({"level": 5}));
        s.speed = Some([25.0, 23.976]);
        let out = dir.join("pal.flac");
        let plan = build(&s, &pal.to_string_lossy(), 0, &out.to_string_lossy(), Some(2)).unwrap();
        assert!(matches!(run(&|_| tools(), &plan, Some(57.6), &|| false, &mut |_| {}).unwrap(), Done::Ok));
        let d = crate::outfile::duration_of(&crate::outfile::ffprobe_json(&tools(), &out).unwrap()).unwrap();
        assert!((d - 60.03).abs() < 0.1, "ยืดแล้วยาว {d}");
        // กดหยุด
        let out = dir.join("stop.flac");
        let plan = build(&spec("flac", "native", json!({})), &src, 1, &out.to_string_lossy(), Some(2)).unwrap();
        assert!(matches!(run(&|_| tools(), &plan, Some(60.0), &|| true, &mut |_| {}).unwrap(), Done::Cancelled));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
