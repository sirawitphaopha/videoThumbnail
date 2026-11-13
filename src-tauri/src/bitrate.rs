//! หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer (พี่กันสั่ง 9 พ.ย. 2569 "สร้าง bitrate viewer จากรูปที่ให้ไป UI UX เหมือนกัน")
//! 10 พ.ย. 2569 พี่กันสั่ง "แปลงระบบการรันบิตเรต ตามเขาเลย" · "เอามาให้หมด ปรับเป็นของเรา"
//! ส่งข้อมูลทีละเฟรม (เวลา ขนาด ชนิด) ให้หน้าจอคิดเองได้ทั้ง 4 วิธีของตัวจริง ต่อวินาที ต่อ GOP GOP แบบถ่วง ต่อเฟรม
//! สองแบบอ่าน
//! - `pkt` อ่านแพ็กเก็ต ไม่ถอดภาพ เร็ว รู้แค่คีย์เฟรม (K) · ใช้กับต่อวินาทีและ GOP
//! - `frm` ถอดภาพเพื่อเอาชนิดเฟรม I P B · ช้ากว่า ใช้กับต่อเฟรม (ตัวจริงก็อ่านไฟล์ใหม่ตอนสลับวิธีเหมือนกัน)
//! แทร็กเสียงอ่านได้ด้วย (พี่กันถาม 10 พ.ย. 2569 "ทำไมเราดูบิตเรตของเสียงไม่ได้") · เลือกแทร็ก v หรือ a0 a1 … · ไฟล์ไม่มีวิดีโอเปิดแทร็กเสียงแรกให้เอง
//!   เสียงอ่านแพ็กเก็ตอย่างเดียว ไม่มีคีย์เฟรมกับชนิดเฟรม ทุกแพ็กเก็ตส่งชนิดเป็น _
//! หน้าจอวาดจากซ้ายไปขวาตามที่อ่าน (พี่กันบอก "ตอนที่มันรัน มันจะค่อย ๆ อ่านจากซ้ายมาขวา") · อ่านอย่างเดียว ไม่แตะไฟล์

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// รอบอ่านล่าสุด · เริ่มไฟล์ใหม่หรือกดหยุด เลขเปลี่ยน รอบเก่าหยุดเอง
static RUN: AtomicU64 = AtomicU64::new(0);

/// แทร็กที่เลือกได้ · id เป็น v หรือ a0 a1 … · label ชื่อบนปุ่ม
#[derive(Serialize, Clone, Default, Debug)]
pub struct BrTrack {
    pub id: String,
    pub label: String,
}

#[derive(Serialize, Clone, Default, Debug)]
pub struct BrInfo {
    pub run: u64,
    /// video หรือ audio · แทร็กที่อ่านอยู่ (v a0 a1 …) · แทร็กทั้งหมดที่เลือกได้
    pub kind: String,
    pub track: String,
    pub tracks: Vec<BrTrack>,
    /// ของแทร็กเสียง · อัตราสุ่ม (Hz) จำนวนช่อง ผังลำโพง ภาษา
    pub sample_rate: u32,
    pub channels: u32,
    pub layout: String,
    pub lang: String,
    pub duration: f64,
    pub size: u64,
    pub codec: String,
    pub tag: String,
    pub profile: String,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video: usize,
    pub audio: usize,
    /// รูปแบบพิกเซล เช่น yuv420p10le · ความลึกสี (บิต ไม่รู้เป็น 0)
    pub pix_fmt: String,
    pub bit_depth: u32,
    /// มาตรฐานสี เช่น bt709 bt2020 · การแปลงแสง smpte2084 (HDR10 PQ) arib-std-b67 (HLG)
    pub primaries: String,
    pub transfer: String,
    /// progressive tt bb tb bt · ไม่รู้เป็นค่าว่าง
    pub field_order: String,
    /// บิตเรตของแทร็กวิดีโอที่ไฟล์เขียนไว้ (บิตต่อวินาที ไม่มีเป็น 0)
    pub stream_bitrate: u64,
}

fn rate(s: &str) -> f64 {
    let mut it = s.split('/');
    match (it.next().and_then(|a| a.parse::<f64>().ok()), it.next().and_then(|b| b.parse::<f64>().ok())) {
        (Some(a), Some(b)) if b > 0.0 => a / b,
        (Some(a), None) => a,
        _ => 0.0,
    }
}

/// ชื่อ codec เสียงแบบสั้นบนปุ่มเลือกแทร็ก
fn acodec(c: &str) -> String {
    match c { "aac" => "AAC", "mp3" => "MP3", "flac" => "FLAC", "opus" => "Opus", "vorbis" => "Vorbis", "ac3" => "AC-3", "eac3" => "E-AC-3", "dts" => "DTS", "truehd" => "TrueHD", "alac" => "ALAC", "ape" => "APE", "tak" => "TAK", "wavpack" => "WavPack", _ if c.starts_with("pcm") => "PCM", _ => return c.to_uppercase() }.to_string()
}
/// ชื่อชนิดวิดีโอแบบที่คนรู้จัก (ชื่อเดียวกับ codecName ในหน้าบิตเรต)
fn vcodec(c: &str) -> String {
    match c { "h264" => "H.264", "hevc" => "HEVC", "av1" => "AV1", "vp9" => "VP9", "vp8" => "VP8", "mpeg2video" => "MPEG-2", "mpeg1video" => "MPEG-1", "mpeg4" => "MPEG-4", "vc1" => "VC-1", "" => "", _ => return c.to_uppercase() }.to_string()
}

/// ข้อมูลไฟล์กับแทร็กที่จะอ่าน · track ว่างหรือ auto = วิดีโอถ้ามี ไม่มีใช้เสียงแทร็กแรก · คืนข้อมูลกับตัวเลือกแทร็กของ ffprobe (V:0 a:1)
fn info(tools: &Path, path: &Path, track: &str) -> Result<(BrInfo, String), String> {
    let out = crate::tools::run_tool_timeout(tools, "ffprobe", [
        "-v".as_ref(), "error".as_ref(), "-print_format".as_ref(), "json".as_ref(), "-show_format".as_ref(), "-show_streams".as_ref(), path.as_os_str(),
    ], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|_| "อ่านข้อมูลไฟล์ไม่ได้".to_string())?;
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let vids: Vec<&Value> = streams.iter().filter(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() != Some(1)).collect();
    let auds: Vec<&Value> = streams.iter().filter(|s| s["codec_type"] == "audio").collect();
    let want = match track { "" | "auto" => if vids.is_empty() { "a0" } else { "v" }, t => t };
    let (kind, v, sel) = if want == "v" {
        ("video", *vids.first().ok_or("ไฟล์นี้ไม่มีแทร็กวิดีโอ")?, "V:0".to_string())
    } else {
        let n: usize = want.trim_start_matches('a').parse().unwrap_or(0);
        ("audio", *auds.get(n).ok_or(if auds.is_empty() { "ไฟล์นี้ไม่มีทั้งวิดีโอและเสียง" } else { "ไม่มีแทร็กเสียงนี้ในไฟล์" })?, format!("a:{n}"))
    };
    let want = if kind == "video" { "v".to_string() } else { format!("a{}", sel.trim_start_matches("a:")) };
    let num = |x: &Value| x.as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| x.as_f64());
    // ป้ายแทร็กวิดีโอบอกชนิดกับขนาดภาพ แบบเดียวกับป้ายเสียงที่บอกชนิดกับช่อง (พี่กันสั่ง 13 พ.ย. 2569 "วิดีโอ เขียนชนิดด้วย")
    let mut tracks: Vec<BrTrack> = vids.first().map(|x| {
        let size = match (x["width"].as_u64(), x["height"].as_u64()) { (Some(w), Some(h)) if w > 0 && h > 0 => format!("{w} × {h}"), _ => String::new() };
        let parts: Vec<String> = [vcodec(x["codec_name"].as_str().unwrap_or("")), size].into_iter().filter(|s| !s.is_empty()).collect();
        BrTrack { id: "v".into(), label: if parts.is_empty() { "วิดีโอ".into() } else { format!("วิดีโอ {}", parts.join(" ")) } }
    }).into_iter().collect();
    for (i, a) in auds.iter().enumerate() {
        let ch = a["channels"].as_u64().unwrap_or(0);
        let lay = match ch { 1 => "1.0 ch".to_string(), 2 => "2.0 ch".to_string(), 6 => "5.1 ch".to_string(), 8 => "7.1 ch".to_string(), 0 => String::new(), n => format!("{n} ch") };
        let lang = a["tags"]["language"].as_str().filter(|l| *l != "und").unwrap_or("");
        let parts: Vec<String> = [acodec(a["codec_name"].as_str().unwrap_or("")), lay, lang.to_string()].into_iter().filter(|x| !x.is_empty()).collect();
        tracks.push(BrTrack { id: format!("a{i}"), label: format!("เสียง {} {}", i + 1, parts.join(" ")) });
    }
    let duration = num(&j["format"]["duration"]).or_else(|| num(&v["duration"])).unwrap_or(0.0);
    let audio = kind == "audio";
    Ok((BrInfo {
        run: 0,
        kind: kind.into(),
        track: want,
        tracks,
        sample_rate: if audio { num(&v["sample_rate"]).unwrap_or(0.0) as u32 } else { 0 },
        channels: if audio { v["channels"].as_u64().unwrap_or(0) as u32 } else { 0 },
        layout: if audio { v["channel_layout"].as_str().unwrap_or("").to_string() } else { String::new() },
        lang: v["tags"]["language"].as_str().filter(|l| *l != "und").unwrap_or("").to_string(),
        duration,
        size: num(&j["format"]["size"]).unwrap_or(0.0) as u64,
        codec: v["codec_name"].as_str().unwrap_or("").to_string(),
        tag: v["codec_tag_string"].as_str().unwrap_or("").to_string(),
        profile: v["profile"].as_str().unwrap_or("").to_string(),
        format: j["format"]["format_name"].as_str().unwrap_or("").split(',').next().unwrap_or("").to_string(),
        width: v["width"].as_u64().unwrap_or(0) as u32,
        height: v["height"].as_u64().unwrap_or(0) as u32,
        fps: if audio { 0.0 } else { rate(v["avg_frame_rate"].as_str().unwrap_or("")).max(0.0) },
        video: vids.len(),
        audio: auds.len(),
        pix_fmt: v["pix_fmt"].as_str().unwrap_or("").to_string(),
        bit_depth: num(&v["bits_per_raw_sample"]).filter(|b| *b > 0.0).or_else(|| num(&v["bits_per_sample"]).filter(|b| *b > 0.0)).map(|b| b as u32).or_else(|| {
            if audio { return None; }
            // ไม่มีค่าตรง ๆ เดาจากชื่อรูปแบบพิกเซล p10 p12 p16
            let p = v["pix_fmt"].as_str().unwrap_or("");
            ["16", "14", "12", "10"].iter().find(|b| p.contains(&format!("p{b}"))).and_then(|b| b.parse().ok()).or(if p.is_empty() { None } else { Some(8) })
        }).unwrap_or(0),
        primaries: v["color_primaries"].as_str().unwrap_or("").to_string(),
        transfer: v["color_transfer"].as_str().unwrap_or("").to_string(),
        field_order: v["field_order"].as_str().unwrap_or("").to_string(),
        stream_bitrate: num(&v["bit_rate"]).or_else(|| num(&v["tags"]["BPS"])).unwrap_or(0.0) as u64,
    }, sel))
}

/// บรรทัดของ ffprobe แบบ compact · คืน (เวลา, ไบต์, ชนิด)
/// แพ็กเก็ต `pts_time=1.234|dts_time=1.200|size=5120|flags=K__` ชนิดเป็น K หรือ _
/// เฟรม `best_effort_timestamp_time=1.234|pkt_dts_time=..|pkt_size=5120|pict_type=I` ชนิดเป็น I P B (ไม่รู้เป็น ?)
/// ใช้เวลาแสดงก่อน ไม่มีค่อยใช้เวลาถอด · ไม่มีเวลาหรือขนาด คืน None
pub fn parse_line(l: &str) -> Option<(f64, u64, char)> {
    let (mut pts, mut dts, mut size, mut typ) = (None, None, None, '_');
    for kv in l.trim().split('|') {
        let Some((k, v)) = kv.split_once('=') else { continue };
        match k {
            "pts_time" | "best_effort_timestamp_time" => pts = pts.or(v.parse::<f64>().ok()),
            "dts_time" | "pkt_dts_time" => dts = v.parse::<f64>().ok(),
            "size" | "pkt_size" => size = v.parse::<u64>().ok(),
            "flags" => typ = if v.starts_with('K') { 'K' } else { '_' },
            "pict_type" => typ = match v { "I" | "P" | "B" => v.chars().next().unwrap(), _ => '?' },
            _ => {}
        }
    }
    Some((pts.or(dts)?, size?, typ))
}

/// ผลที่อ่าน เรียงตามลำดับในไฟล์
/// keep = false เก็บเฉพาะก้อนที่ยังไม่ได้ส่ง ส่งแล้วล้างทิ้ง (ใช้ตอนส่งให้หน้าจอ) · total นับทุกเฟรมที่อ่านได้ · first = ลำดับของเฟรมแรกในก้อนนี้
/// exit_ok = ffprobe จบโดยไม่รายงานผิดพลาด (AUDIT ข้อ 118 ไฟล์เสียกลางทาง ffprobe หยุดส่งบรรทัด เดิมไม่ดูรหัสจบ หน้าจอเข้าใจว่าอ่านครบ)
#[derive(Default, Debug)]
pub struct Frames {
    pub t: Vec<f64>,
    pub s: Vec<u64>,
    pub k: String,
    pub read_to: f64,
    pub total: usize,
    pub first: usize,
    pub exit_ok: bool,
}

/// อ่านทั้งไฟล์ · sel ตัวเลือกแทร็กของ ffprobe (V:0 หรือ a:N) · frames = ถอดภาพเอาชนิดเฟรม (เฉพาะวิดีโอ)
/// on ถูกเรียกระหว่างอ่าน · stop() จริง = หยุด คืน None · แทร็กเสียงส่งชนิดเป็น _ ทุกแพ็กเก็ต เพราะเสียงไม่มีคีย์เฟรมแบบวิดีโอ
/// keep = false หลังเรียก on แล้วล้างก้อนที่ส่งไป ไม่เก็บทั้งไฟล์ซ้ำกับหน้าจอ (AUDIT ข้อ 119 · TrueHD หนังสองชั่วโมงราว 8 ล้านแพ็กเก็ต)
pub fn read_frames(tools: &Path, path: &Path, sel: &str, frames: bool, keep: bool, stop: &dyn Fn() -> bool, on: &mut dyn FnMut(&Frames)) -> Result<Option<Frames>, String> {
    let audio = sel.starts_with('a');
    let frames = frames && !audio;
    let what = if frames { "frame=best_effort_timestamp_time,pkt_dts_time,pkt_size,pict_type" } else { "packet=pts_time,dts_time,size,flags" };
    let mut child = crate::tools::tool_command(tools, "ffprobe", [
        "-v".as_ref(), "error".as_ref(), "-select_streams".as_ref(), sel.as_ref(),
        "-show_entries".as_ref(), what.as_ref(), "-of".as_ref(), "compact=p=0".as_ref(), path.as_os_str(),
    ]).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("เรียก ffprobe ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().ok_or("อ่านผลของ ffprobe ไม่ได้")?;
    let mut f = Frames::default();
    let mut last = Instant::now();
    for line in BufReader::new(out).lines() {
        if stop() { let _ = child.kill(); let _ = child.wait(); return Ok(None); }
        let Ok(line) = line else { break };
        if let Some((t, s, k)) = parse_line(&line) {
            f.t.push(t); f.s.push(s); f.k.push(if audio { '_' } else { k });
            f.total += 1;
            if t > f.read_to { f.read_to = t; }
        }
        if last.elapsed() >= Duration::from_millis(120) { on(&f); if !keep { drain(&mut f); } last = Instant::now(); }
    }
    f.exit_ok = child.wait().map(|s| s.success()).unwrap_or(false);
    on(&f);
    if !keep { drain(&mut f); }
    if f.total == 0 { return Err(if audio { "อ่านข้อมูลแทร็กเสียงไม่ได้" } else { "อ่านเฟรมวิดีโอไม่ได้" }.into()); }
    Ok(Some(f))
}

/// ล้างก้อนที่ส่งไปแล้ว · ลำดับของเฟรมแรกในก้อนถัดไปเท่ากับจำนวนที่อ่านแล้วทั้งหมด
fn drain(f: &mut Frames) {
    f.t.clear(); f.s.clear(); f.k.clear(); f.first = f.total;
}

/// เริ่มอ่านไฟล์ · mode `pkt` หรือ `frm` · คืนข้อมูลไฟล์ทันที แล้วส่ง bitrate-progress ระหว่างอ่าน และ bitrate-done ตอนจบ
/// run เลขรอบที่หน้าจอกำหนดเอง · หน้าจอรู้เลขก่อนข้อมูลก้อนแรกมาถึง ไฟล์สั้นมากอ่านจบก่อนคำสั่งนี้ตอบกลับ ข้อมูลก็ไม่ถูกทิ้ง
/// (เจอ 10 พ.ย. 2569 กดดูบิตเรตไฟล์ทดสอบ 2 วินาทีจากชั้นวาง กราฟว่าง เพราะหน้าจอทิ้งข้อมูลที่เลขรอบยังไม่ตรง)
#[tauri::command]
/// track v หรือ a0 a1 … · ไม่ส่งหรือ auto = วิดีโอถ้ามี ไม่มีใช้เสียงแทร็กแรก
pub async fn bitrate_start(app: AppHandle, path: String, mode: Option<String>, run: Option<u64>, track: Option<String>) -> Result<BrInfo, String> {
    let tools = crate::tools::tools_dir(&app)?;
    let run = match run { Some(r) => { RUN.store(r, Ordering::SeqCst); r } None => RUN.fetch_add(1, Ordering::SeqCst) + 1 };
    let frm = mode.as_deref() == Some("frm");
    let p = std::path::PathBuf::from(&path);
    let t2 = tools.clone();
    let trk = track.unwrap_or_default();
    let (mut inf, sel) = tauri::async_runtime::spawn_blocking(move || info(&t2, &p, &trk)).await.map_err(|e| e.to_string())??;
    inf.run = run;
    let p = std::path::PathBuf::from(&path);
    std::thread::spawn(move || {
        let stop = || RUN.load(Ordering::SeqCst) != run;
        // ส่งเฉพาะก้อนใหม่ · from คือลำดับของเฟรมแรกในก้อน หน้าจอใช้ต่อท้ายข้อมูลเดิม
        let mut on = |f: &Frames| {
            if f.t.is_empty() { return; }
            let _ = app.emit("bitrate-progress", json!({ "run": run, "from": f.first, "t": &f.t, "s": &f.s, "k": &f.k, "readTo": f.read_to }));
        };
        let r = read_frames(&tools, &p, &sel, frm, false, &stop, &mut on);
        let _ = match r {
            // partial = ffprobe จบโดยรายงานผิดพลาด หน้าจอขึ้นป้ายอ่านไม่ถึงท้ายไฟล์ (AUDIT ข้อ 118)
            Ok(Some(f)) => app.emit("bitrate-done", json!({ "run": run, "ok": true, "frames": f.total, "partial": !f.exit_ok, "readTo": f.read_to })),
            Ok(None) => app.emit("bitrate-done", json!({ "run": run, "ok": false, "stopped": true })),
            Err(e) => app.emit("bitrate-done", json!({ "run": run, "ok": false, "error": e })),
        };
    });
    Ok(inf)
}

/// รายชื่อแทร็กที่ดูบิตเรตได้ · หน้าจอใช้ถามก่อนเปิด เมื่อไฟล์มีมากกว่าหนึ่งแทร็ก
/// (พี่กันสั่ง 10 พ.ย. 2569 "ถ้าไฟล์ที่มีทั้งเสียงและภาพ … จะให้เลือกก่อนว่าจะดูภาพ หรือเสียงตัวไหน")
#[tauri::command]
pub async fn bitrate_tracks(app: AppHandle, path: String) -> Result<Vec<BrTrack>, String> {
    let tools = crate::tools::tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || info(&tools, std::path::Path::new(&path), "auto").map(|(i, _)| i.tracks)).await.map_err(|e| e.to_string())?
}

/// หยุดรอบที่อ่านอยู่
#[tauri::command]
pub fn bitrate_stop() {
    RUN.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    #[test]
    fn parses_compact_lines() {
        assert_eq!(parse_line("pts_time=1.500000|dts_time=1.460000|size=5120|flags=K__"), Some((1.5, 5120, 'K')));
        assert_eq!(parse_line("pts_time=N/A|dts_time=2.000000|size=10|flags=___"), Some((2.0, 10, '_')));
        assert_eq!(parse_line("pts_time=N/A|dts_time=N/A|size=10|flags=___"), None);
        assert_eq!(parse_line("best_effort_timestamp_time=0.040000|pkt_dts_time=0.000000|pkt_size=812|pict_type=B"), Some((0.04, 812, 'B')));
        assert_eq!(parse_line("best_effort_timestamp_time=N/A|pkt_dts_time=1.0|pkt_size=9|pict_type=?"), Some((1.0, 9, '?')));
        assert_eq!(parse_line(""), None);
    }

    /// คลิป 3 วินาที 25 เฟรมต่อวินาที คีย์เฟรมทุก 25 เฟรม มี B เฟรม
    /// แบบแพ็กเก็ตได้ 75 เฟรม คีย์เฟรม 3 · แบบถอดภาพได้ 75 เฟรม I 3 มีทั้ง P และ B · ขนาดรวมสองแบบเท่ากัน
    #[test]
    fn reads_packets_and_frame_types() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรต-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("คลิป บิตเรต.mkv");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=25", "-c:v", "libx264", "-g", "25", "-keyint_min", "25", "-sc_threshold", "0", "-bf", "2", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let (inf, sel) = info(&tools(), &f, "auto").unwrap();
        assert_eq!((inf.kind.as_str(), inf.track.as_str(), sel.as_str(), inf.tracks.len()), ("video", "v", "V:0", 1));
        assert_eq!((inf.width, inf.height, inf.codec.as_str(), inf.video, inf.audio, inf.format.as_str()), (320, 240, "h264", 1, 0, "matroska"));
        assert!((inf.fps - 25.0).abs() < 0.01 && (inf.duration - 3.0).abs() < 0.1, "{inf:?}");
        assert_eq!((inf.pix_fmt.as_str(), inf.bit_depth), ("yuv444p", 8), "{inf:?}");
        let mut calls = 0;
        let p = read_frames(&tools(), &f, "V:0", false, true, &|| false, &mut |_| calls += 1).unwrap().unwrap();
        let fr = read_frames(&tools(), &f, "V:0", true, true, &|| false, &mut |_| {}).unwrap().unwrap();
        // แบบส่งให้หน้าจอ ไม่เก็บทั้งไฟล์ · รวมทุกก้อนที่ส่งได้ครบ 75 เฟรม ลำดับต่อกันไม่ขาด ขนาดรวมเท่าแบบเก็บ · ffprobe จบปกติ (AUDIT ข้อ 118 119)
        let (mut got, mut bytes, mut next) = (0usize, 0u64, 0usize);
        let dr = read_frames(&tools(), &f, "V:0", false, false, &|| false, &mut |c| { if c.t.is_empty() { return; } assert_eq!(c.first, next); next += c.t.len(); got += c.t.len(); bytes += c.s.iter().sum::<u64>(); }).unwrap().unwrap();
        assert_eq!((got, dr.total, dr.t.len()), (75, 75, 0));
        assert_eq!(bytes, p.s.iter().sum::<u64>());
        assert!(dr.exit_ok && p.exit_ok);
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(p.t.len(), 75);
        assert_eq!(p.k.chars().filter(|c| *c == 'K').count(), 3, "{}", p.k);
        assert!(calls >= 1 && p.read_to > 2.8);
        assert_eq!(fr.t.len(), 75);
        assert_eq!(fr.k.chars().filter(|c| *c == 'I').count(), 3, "{}", fr.k);
        assert!(fr.k.contains('P') && fr.k.contains('B'), "{}", fr.k);
        assert_eq!(p.s.iter().sum::<u64>(), fr.s.iter().sum::<u64>());
    }

    /// ไฟล์มีวิดีโอกับเสียงสองแทร็ก · ถามแทร็กได้ครบสามตัว · อ่านเสียงแทร็กที่สองได้ ชนิดเป็น _ ทุกแพ็กเก็ต
    /// ไฟล์เสียงล้วน ไม่ส่งแทร็กมา เปิดเสียงแทร็กแรกเอง · ขอแทร็กวิดีโอจากไฟล์เสียงล้วน บอกว่าไม่มี
    #[test]
    fn reads_audio_tracks() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรตเสียง-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("หนัง สองเสียง.mkv");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-f", "lavfi", "-i", "sine=frequency=880:duration=3:sample_rate=48000",
            "-map", "0", "-map", "1", "-map", "2", "-c:v", "libx264", "-c:a", "flac", "-metadata:s:a:1", "language=tha", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let (all, _) = info(&tools(), &f, "auto").unwrap();
        let ids: Vec<&str> = all.tracks.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["v", "a0", "a1"]);
        assert_eq!(all.tracks[0].label, "วิดีโอ H.264 160 × 120");
        assert_eq!(all.tracks[2].label, "เสียง 2 FLAC 1.0 ch tha");
        let (a, sel) = info(&tools(), &f, "a1").unwrap();
        assert_eq!((a.kind.as_str(), a.track.as_str(), sel.as_str(), a.sample_rate, a.channels, a.codec.as_str(), a.lang.as_str()), ("audio", "a1", "a:1", 48000, 1, "flac", "tha"));
        assert_eq!(a.fps, 0.0);
        let p = read_frames(&tools(), &f, &sel, true, true, &|| false, &mut |_| {}).unwrap().unwrap();
        assert!(p.t.len() > 10 && p.k.chars().all(|c| c == '_'), "{} {}", p.t.len(), p.k);
        assert!(p.read_to > 2.5);
        assert!(info(&tools(), &f, "a5").is_err());
        let m = dir.join("เพลง.flac");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=2", m.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let (b, sel2) = info(&tools(), &m, "").unwrap();
        assert_eq!((b.kind.as_str(), b.track.as_str(), sel2.as_str(), b.tracks.len(), b.video), ("audio", "a0", "a:0", 1, 0));
        assert!(info(&tools(), &m, "v").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn stop_returns_none() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรตหยุด-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("หยุด.mkv");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=25", "-c:v", "libx264", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let r = read_frames(&tools(), &f, "V:0", false, true, &|| true, &mut |_| {}).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert!(r.is_none());
    }
}
