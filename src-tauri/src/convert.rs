//! แปลงไฟล์เสียงเป็นคิวที่หน้ากราฟเสียง (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7)
//! หน้าจอถือคิว (src/lib/convertJob.ts) เรียก convert_one ทีละไฟล์ตามลำดับ · หยุดทั้งคิว = convert_cancel แล้วหน้าจอไม่เรียกไฟล์ถัดไป
//! ไฟล์ใหม่วางข้างไฟล์เดิม หรือโฟลเดอร์ที่เลือก ชื่อเดิมนามสกุลใหม่ ชื่อชนต่อท้าย (2) ไม่เขียนทับ · ไฟล์เดิมไม่ถูกแตะ
//! ทำงานลงไฟล์ .partial ข้างปลายทาง ตรวจด้วย ffprobe ผ่านแล้วค่อยย้ายชื่อแบบไม่เขียนทับ · หยุดหรือพัง ไฟล์ทำค้างลบเอง
//! ข้อมูลเพลงกับรูปปกติดไป · FLAC MP3 M4A ให้ ffmpeg ใส่หลังแปลง · Opus ส่งให้ opusenc ตอนแปลง
//! WavPack Monkey's Audio TAK เขียนแท็ก APEv2 เอง (ape.rs) · AC-3 ไม่มีที่เก็บ บอกในผล

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::encode::{self, EncodeSpec};
use crate::outfile::{drive_letter, fail, fmt_gb, free_name, free_space, scopeguard, ApplyProblem};
use crate::tools::{run_tool_timeout, tool_succeeded};

#[derive(Default)]
pub struct ConvertState {
    cancel: AtomicBool,
    running: AtomicBool,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    /// ชื่อกลาง title artist album album_artist date track disc genre composer comment replaygain_*
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverInfo {
    /// mjpeg png bmp ตามที่ ffprobe เห็น
    pub codec: String,
    pub width: u32,
    pub height: u32,
    /// เลขสตรีมของรูปปกในไฟล์
    pub stream: u64,
}

/// ข้อมูลไฟล์เสียงหนึ่งไฟล์ในคิว · แทร็กเสียงแรกของไฟล์
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AudioFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub duration: f64,
    pub audio_only: bool,
    /// เลขสตรีมเสียงในไฟล์ (ffprobe) ที่จะแปลง
    pub stream: u64,
    /// ชื่อ codec ของ ffprobe เช่น flac pcm_s16le dts
    pub codec: String,
    pub profile: String,
    pub layout: String,
    pub channels: u32,
    pub rate: u32,
    pub bits: Option<u32>,
    pub bitrate: Option<u64>,
    pub tags: Vec<Tag>,
    /// ข้อมูลเพลงอยู่ในแทร็กเสียง (Ogg Opus Vorbis) ไม่ใช่ระดับไฟล์
    pub tags_in_stream: bool,
    pub cover: Option<CoverInfo>,
}

/// ชื่อกลางของข้อมูลเพลง กับชื่อที่ ffprobe อาจใช้ (ID3 MP4 Vorbis comment APE เรียกไม่เหมือนกัน)
const CANON: [(&str, &[&str]); 14] = [
    ("title", &["title"]),
    ("artist", &["artist"]),
    ("album", &["album"]),
    ("album_artist", &["album_artist", "albumartist", "album artist"]),
    ("date", &["date", "year"]),
    ("track", &["track", "tracknumber"]),
    ("disc", &["disc", "discnumber"]),
    ("genre", &["genre"]),
    ("composer", &["composer"]),
    ("comment", &["comment", "description"]),
    ("replaygain_track_gain", &["replaygain_track_gain"]),
    ("replaygain_track_peak", &["replaygain_track_peak"]),
    ("replaygain_album_gain", &["replaygain_album_gain"]),
    ("replaygain_album_peak", &["replaygain_album_peak"]),
];

pub fn canon_tags(obj: &Value) -> Vec<Tag> {
    let Some(map) = obj.as_object() else { return vec![] };
    let mut out = vec![];
    for (canon, alias) in CANON {
        if let Some(v) = map.iter().find(|(k, _)| alias.contains(&k.to_lowercase().as_str())).and_then(|(_, v)| v.as_str()) {
            let v = v.trim();
            if !v.is_empty() { out.push(Tag { key: canon.into(), value: v.into() }); }
        }
    }
    out
}

/// ชื่อช่องในแท็ก APEv2 (WavPack Monkey's Audio TAK)
pub fn ape_key(canon: &str) -> String {
    match canon {
        "title" => "Title", "artist" => "Artist", "album" => "Album", "album_artist" => "Album Artist", "date" => "Year",
        "track" => "Track", "disc" => "Disc", "genre" => "Genre", "composer" => "Composer", "comment" => "Comment",
        other => return other.to_uppercase(),
    }.into()
}

/// ชื่อช่องของ Vorbis comment (Opus)
pub fn vorbis_key(canon: &str) -> String {
    match canon {
        "album_artist" => "ALBUMARTIST".into(), "track" => "TRACKNUMBER".into(), "disc" => "DISCNUMBER".into(),
        other => other.to_uppercase(),
    }
}

pub fn parse_file(path: &Path, j: &Value) -> Result<AudioFile, String> {
    let g = crate::audiograph::parse_info(j);
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let st = streams.iter().find(|s| s["codec_type"] == "audio").ok_or("ไฟล์นี้ไม่มีแทร็กเสียง")?;
    let t = g.tracks.first().ok_or("ไฟล์นี้ไม่มีแทร็กเสียง")?;
    let mut tags = canon_tags(&j["format"]["tags"]);
    let mut in_stream = false;
    if tags.is_empty() {
        tags = canon_tags(&st["tags"]);
        in_stream = !tags.is_empty();
    }
    let cover = streams.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() == Some(1)).map(|s| CoverInfo {
        codec: s["codec_name"].as_str().unwrap_or("").into(),
        width: s["width"].as_u64().unwrap_or(0) as u32,
        height: s["height"].as_u64().unwrap_or(0) as u32,
        stream: s["index"].as_u64().unwrap_or(0),
    });
    Ok(AudioFile {
        path: path.to_string_lossy().into(),
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size: g.size,
        duration: g.duration,
        audio_only: g.audio_only,
        stream: st["index"].as_u64().unwrap_or(0),
        codec: st["codec_name"].as_str().unwrap_or("").into(),
        profile: st["profile"].as_str().unwrap_or("").into(),
        layout: t.layout.clone(),
        channels: t.names.len().max(1) as u32,
        rate: t.rate,
        bits: t.bits,
        bitrate: t.bitrate,
        tags,
        tags_in_stream: in_stream,
        cover,
    })
}

pub fn probe(tools: &Path, path: &Path) -> Result<AudioFile, String> {
    let out = run_tool_timeout(tools, "ffprobe", [
        OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
        OsStr::new("-show_format"), OsStr::new("-show_streams"), path.as_os_str(),
    ], Duration::from_secs(60))?;
    if !tool_succeeded("ffprobe", &out.status) {
        let msg = String::from_utf8_lossy(&out.stderr);
        return Err(format!("อ่านไฟล์ไม่ได้ {}", msg.lines().last().unwrap_or("").trim()));
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))?;
    parse_file(path, &j)
}

/// ไบต์ของรูปปก (ดึงด้วย ffmpeg ไม่แปลง)
pub fn cover_bytes(tools: &Path, path: &Path, stream: u64) -> Result<Vec<u8>, String> {
    let map = format!("0:{stream}");
    let out = run_tool_timeout(tools, "ffmpeg", [
        OsStr::new("-hide_banner"), OsStr::new("-nostdin"), OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), path.as_os_str(),
        OsStr::new("-map"), OsStr::new(&map), OsStr::new("-c"), OsStr::new("copy"), OsStr::new("-frames:v"), OsStr::new("1"), OsStr::new("-f"), OsStr::new("image2pipe"), OsStr::new("-"),
    ], Duration::from_secs(60))?;
    if !tool_succeeded("ffmpeg", &out.status) || out.stdout.is_empty() {
        return Err(format!("ดึงรูปปกไม่ได้ {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("").trim()));
    }
    Ok(out.stdout)
}

fn cover_ext(codec: &str) -> &'static str {
    match codec { "png" => "png", "bmp" => "bmp", _ => "jpg" }
}

fn tools_of(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let work = local.join("tmp");
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    Ok((crate::tools::tools_dir(app)?, work))
}

#[tauri::command]
pub async fn convert_probe(app: AppHandle, path: String) -> Result<AudioFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()); }
        probe(&tools, &p)
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverData {
    pub url: String,
    pub bytes: u64,
    pub codec: String,
    pub width: u32,
    pub height: u32,
}

/// รูปปกของไฟล์ให้หน้าจอดู (data URL) · ไม่มีรูปปก = None
#[tauri::command]
pub async fn convert_cover(app: AppHandle, path: String) -> Result<Option<CoverData>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        let p = PathBuf::from(&path);
        let f = probe(&tools, &p)?;
        let Some(c) = f.cover else { return Ok(None) };
        let b = cover_bytes(&tools, &p, c.stream)?;
        let mime = match c.codec.as_str() { "png" => "image/png", "bmp" => "image/bmp", _ => "image/jpeg" };
        Ok(Some(CoverData { url: format!("data:{mime};base64,{}", crate::audiograph::b64(&b)), bytes: b.len() as u64, codec: c.codec, width: c.width, height: c.height }))
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- แปลงหนึ่งไฟล์

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConvReq {
    /// เลขแถวในคิวของหน้าจอ ส่งกลับมากับความคืบหน้า
    pub id: String,
    pub path: String,
    pub spec: EncodeSpec,
    /// โฟลเดอร์ที่เลือก · ไม่มี = ข้างไฟล์เดิม
    pub out_dir: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConvResult {
    pub out: String,
    pub size: u64,
    pub src_size: u64,
    /// จำนวนช่องข้อมูลเพลงที่ใส่ในไฟล์ใหม่
    pub tags: usize,
    pub cover: bool,
    pub notes: Vec<String>,
    /// ตัวแปลงที่ใช้จริงพร้อมรุ่น เช่น opusenc libopus 1.6.1
    pub tool: String,
    /// คำสั่งที่รันจริง
    pub cmd: String,
    pub secs: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    id: String,
    percent: f64,
    eta: Option<f64>,
    phase: String,
}

#[tauri::command]
pub fn convert_cancel(st: State<'_, ConvertState>) {
    st.cancel.store(true, Ordering::SeqCst);
}

/// แปลงไฟล์เดียว · คืนผลเมื่อเสร็จ · ความคืบหน้าส่งทางเหตุการณ์ convert-progress
#[tauri::command]
pub async fn convert_one(app: AppHandle, req: ConvReq) -> Result<ConvResult, ApplyProblem> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<ConvertState>();
        if st.running.swap(true, Ordering::SeqCst) {
            return Err(fail("other", "กำลังแปลงไฟล์อื่นอยู่", vec!["รอให้เสร็จก่อน".into()]));
        }
        st.cancel.store(false, Ordering::SeqCst);
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let r = convert(&app, &req, &jobs);
        st.running.store(false, Ordering::SeqCst);
        r
    }).await.map_err(|e| fail("other", "แปลงไม่สำเร็จ", vec![e.to_string()]))?
}

/// แทรกอาร์กิวเมนต์ก่อนตัวแรกที่ตรง `before` · ไม่เจอต่อท้าย
fn insert_before(args: &mut Vec<String>, before: &str, add: Vec<String>) {
    let at = args.iter().position(|a| a == before).unwrap_or(args.len());
    args.splice(at..at, add);
}

/// เมื่อไหร่ต้องให้ ffmpeg ใส่ข้อมูลเพลงกับปกหลังแปลง (ชนิดที่ ffmpeg เขียนปกได้)
fn remux_kind(codec: &str) -> bool {
    matches!(codec, "flac" | "mp3" | "aac")
}

/// คำสั่ง ffmpeg ใส่ข้อมูลเพลงกับปกจากไฟล์เดิมลงไฟล์ที่แปลงแล้ว · ไม่แปลงเสียงซ้ำ (-c copy)
pub fn remux_args(enc: &str, src: &str, out: &str, codec: &str, f: &AudioFile, with_cover: bool) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-nostdin", "-v", "error", "-i", enc, "-i", src, "-map", "0:a:0"].iter().map(|s| s.to_string()).collect();
    if with_cover { if let Some(c) = &f.cover { a.extend(["-map".into(), format!("1:{}", c.stream)]); } }
    a.extend(["-c".into(), "copy".into(), "-map_metadata".into(), if f.tags_in_stream { format!("1:s:{}", f.stream) } else { "1".into() }]);
    if with_cover && f.cover.is_some() {
        a.extend(["-disposition:v:0".into(), "attached_pic".into(), "-metadata:s:v:0".into(), "comment=Cover (front)".into()]);
    }
    if codec == "mp3" { a.extend(["-id3v2_version".into(), "3".into()]); }
    a.extend(["-n".into(), out.into()]);
    a
}

fn convert(app: &AppHandle, req: &ConvReq, jobs: &Arc<crate::jobs::Jobs>) -> Result<ConvResult, ApplyProblem> {
    let st = app.state::<ConvertState>();
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>| {
        let _ = app.emit("convert-progress", Progress { id: req.id.clone(), percent, eta, phase: phase.into() });
    };
    let t_start = Instant::now();
    let (tools, work) = tools_of(app).map_err(|e| fail("other", "แปลงไม่สำเร็จ", vec![e]))?;
    let src = PathBuf::from(&req.path);
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {name} ไม่ถูกแตะ");
    if !src.exists() {
        return Err(fail("missing", "หาไฟล์ไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]));
    }
    let f = probe(&tools, &src).map_err(|e| fail("badsource", "อ่านไฟล์เสียงไม่ได้", vec![e, untouched.clone()]))?;
    let spec = &req.spec;
    let codec = spec.codec.as_str();
    let dir = match &req.out_dir { Some(d) if !d.is_empty() => PathBuf::from(d), _ => src.parent().map(Path::to_path_buf).unwrap_or_default() };
    if !dir.is_dir() {
        return Err(fail("other", "หาโฟลเดอร์ที่เก็บไม่เจอ", vec![dir.to_string_lossy().to_string(), untouched]));
    }
    let ext = spec.ext();
    let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    // ที่ว่าง · ไม่เสียคุณภาพคิดจากเสียงดิบ 24 บิต (ไฟล์จริงเล็กกว่านี้) · เสียคุณภาพคิดเผื่อ 1 Mbps
    let speedk = spec.speed.map(|[a, b]| if a > 0.0 && b > 0.0 { a / b } else { 1.0 }).unwrap_or(1.0);
    let secs = f.duration * speedk;
    let mut ch = spec.channels.unwrap_or(f.channels).max(1);
    if codec == "mp3" { ch = ch.min(2); }
    if codec == "ac3" || codec == "eac3" { ch = ch.min(6); }
    let rate = spec.rate.unwrap_or(f.rate).max(8000);
    let lossless = matches!(codec, "flac" | "wv" | "ape" | "tak");
    let need = if lossless { secs * rate as f64 * ch as f64 * 3.0 } else { secs * 1_000_000.0 / 8.0 } as u64 + 16 * 1024 * 1024;
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("ที่ว่างในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องใช้ราว {} มีว่าง {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }

    let user = encode::user_dir(app).unwrap_or_default();
    let encs = encode::status(&tools, &user);
    let partial = dir.join(format!("{stem}.partial-{}.{ext}", crate::poster_image::unique()));
    let _g1 = scopeguard(partial.clone());
    let opus_native = codec == "opus" && (spec.encoder.is_empty() || spec.encoder == "native");
    let own_tag = matches!(codec, "wv" | "ape" | "tak");
    // รูปปกสำหรับ opusenc กับแท็ก APEv2 · ดึงลงโฟลเดอร์ชั่วคราวของโปรแกรม เสร็จแล้วลบ
    let mut cover_file: Option<(PathBuf, Vec<u8>)> = None;
    let mut _g2 = None;
    if let Some(c) = &f.cover {
        if opus_native || own_tag {
            if let Ok(b) = cover_bytes(&tools, &src, c.stream) {
                let p = work.join(format!("conv-cover-{}.{}", crate::poster_image::unique(), cover_ext(&c.codec)));
                if std::fs::write(&p, &b).is_ok() { _g2 = Some(scopeguard(p.clone())); cover_file = Some((p, b)); }
            }
        }
    }

    let mut spec_r = spec.clone();
    spec_r.src_rate = Some(f.rate);
    let mut plan = encode::build(&spec_r, &req.path, f.stream, &partial.to_string_lossy(), Some(f.channels), f.bits)
        .map_err(|e| fail("tool", "ตั้งค่าแปลงเสียงไม่ถูก", vec![e, untouched.clone()]))?;
    // ชนิดที่โปรแกรมใส่ข้อมูลเพลงเอง ให้ ffmpeg ไม่ส่งต่อข้อมูลเดิม (ไม่ซ้อนสองชุด และ WavPack ไม่เก็บหัว WAV ที่มีข้อมูลเพลงติดไป)
    if own_tag || opus_native {
        insert_before(&mut plan.steps[0].args, "-vn", vec!["-map_metadata".into(), "-1".into()]);
    }
    if opus_native && plan.steps.len() > 1 {
        let mut add = vec![];
        for t in &f.tags { add.extend(["--comment".to_string(), format!("{}={}", vorbis_key(&t.key), t.value)]); }
        if let Some((p, _)) = &cover_file { add.extend(["--picture".to_string(), p.to_string_lossy().to_string()]); }
        insert_before(&mut plan.steps[1].args, "-", add);
    }
    let cmd = encode::text_of(&plan.steps);
    let main_tool = plan.steps.get(1).map(|s| s.tool.clone()).unwrap_or_else(|| "ffmpeg".into());
    let tool = match encs.iter().find(|e| e.name == main_tool).and_then(|e| e.version.clone()) {
        Some(v) if main_tool == "opusenc" => format!("opusenc · {v}"),
        Some(v) if main_tool == "MACDll64" => format!("Monkey's Audio {v} (MACDll64.dll)"),
        Some(v) => format!("{main_tool} {v}"),
        None => main_tool.clone(),
    };

    let phase = format!("กำลังแปลงเป็น {}", match codec { "wv" => "WavPack".to_string(), "ape" => "Monkey's Audio".into(), c => c.to_uppercase() });
    emit(&phase, 0.0, None);
    let t0 = Instant::now();
    let eta = |p: f64| if p > 3.0 { Some(t0.elapsed().as_secs_f64() * (100.0 - p) / p) } else { None };
    let r = encode::run(&|n| encode::dir_for(&encs, &tools, n), &plan, Some(f.duration), &stop, &mut |p| emit(&phase, p * 0.96, eta(p)))
        .map_err(|e| fail("tool", "แปลงไม่สำเร็จ", vec![e, untouched.clone()]))?;
    match r {
        encode::Done::Ok => {}
        encode::Done::Cancelled => return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])),
        encode::Done::Failed(m) => return Err(fail("tool", "แปลงไม่สำเร็จ", vec![m, untouched])),
    }
    if stop() { return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])); }

    // ข้อมูลเพลงกับปก
    emit("กำลังใส่ข้อมูลเพลง", 97.0, None);
    let mut notes = vec![];
    let mut tags_n = 0usize;
    let mut cover_ok = false;
    let mut final_tmp = partial.clone();
    let mut _g3 = None;
    let has_meta = !f.tags.is_empty() || f.cover.is_some();
    if remux_kind(codec) && has_meta {
        let p2 = dir.join(format!("{stem}.partial-{}.{ext}", crate::poster_image::unique()));
        _g3 = Some(scopeguard(p2.clone()));
        let cover_fits = f.cover.as_ref().is_some_and(|c| matches!(c.codec.as_str(), "mjpeg" | "png"));
        let try_once = |with_cover: bool| -> bool {
            let _ = std::fs::remove_file(&p2);
            let a = remux_args(&partial.to_string_lossy(), &req.path, &p2.to_string_lossy(), codec, &f, with_cover);
            // ฟังตัวหยุดระหว่างคัดลอกเสียงลงไฟล์ชั่วคราวที่สอง · ปิดโปรแกรมแล้วงานจบเอง ลบไฟล์ทำค้างได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 10 · เดิมรอได้ถึง 600 วินาที)
            let a: Vec<std::ffi::OsString> = a.iter().map(std::ffi::OsString::from).collect();
            matches!(crate::outfile::run_live(&tools, "ffmpeg", &a, &stop, &mut |_| {}), Ok(crate::outfile::Run::Done(st, _)) if tool_succeeded("ffmpeg", &st))
        };
        if try_once(cover_fits) { cover_ok = cover_fits; tags_n = f.tags.len(); final_tmp = p2.clone(); }
        else if cover_fits && try_once(false) { tags_n = f.tags.len(); final_tmp = p2.clone(); notes.push("ใส่รูปปกไม่ได้ ใส่แค่ข้อมูลเพลง".into()); }
        else { notes.push("ใส่ข้อมูลเพลงกับรูปปกไม่ได้ ไฟล์ใหม่ไม่มีข้อมูลเพลง".into()); }
        if f.cover.is_some() && !cover_fits { notes.push(format!("รูปปกเดิมเป็น {} ไฟล์ชนิดนี้เก็บได้แค่ JPG กับ PNG", f.cover.as_ref().map(|c| c.codec.to_uppercase()).unwrap_or_default())); }
    } else if codec == "opus" {
        tags_n = f.tags.len();
        if opus_native { cover_ok = cover_file.is_some(); }
        else if f.cover.is_some() { notes.push("Opus ที่แปลงด้วย ffmpeg ใส่รูปปกไม่ได้ · ใช้ตัวต้นฉบับ opusenc ถ้าอยากได้รูปปก".into()); }
    } else if own_tag && has_meta {
        if crate::ape::has_ape_tag(&final_tmp) {
            notes.push("ตัวแปลงเขียนข้อมูลเพลงไว้แล้ว ไม่เขียนซ้อน".into());
        } else {
            let mut items: Vec<crate::ape::ApeItem> = f.tags.iter().map(|t| crate::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
            if let Some((p, b)) = &cover_file {
                let mut v = format!("cover.{}", p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into())).into_bytes();
                v.push(0);
                v.extend_from_slice(b);
                items.push(crate::ape::ApeItem { key: "Cover Art (Front)".into(), value: v, binary: true });
            }
            match crate::ape::append_tag(&final_tmp, &items) {
                Ok(()) => { tags_n = f.tags.len(); cover_ok = cover_file.is_some(); }
                Err(e) => notes.push(e),
            }
        }
    } else if has_meta && matches!(codec, "ac3" | "eac3") {
        notes.push(format!("{} ไม่มีที่เก็บข้อมูลเพลงกับรูปปก", if codec == "ac3" { "AC-3" } else { "E-AC-3" }));
    }

    // ตรวจไฟล์ใหม่ · ชนิดตรง ความยาวตรง (เผื่อ 1 วินาที หรือ 1%)
    emit("กำลังตรวจไฟล์ใหม่", 99.0, None);
    let g = probe(&tools, &final_tmp).map_err(|e| fail("verify", "ไฟล์ใหม่อ่านไม่ได้", vec![e, "ลบไฟล์ใหม่แล้ว".into(), untouched.clone()]))?;
    if g.codec != spec.probe_codec() {
        return Err(fail("verify", "ไฟล์ใหม่ไม่ใช่ชนิดที่ตั้ง", vec![format!("ได้ {} แทน {}", g.codec, spec.probe_codec()), "ลบไฟล์ใหม่แล้ว".into(), untouched]));
    }
    let want = f.duration * speedk;
    if f.duration > 0.0 && (g.duration - want).abs() > (want * 0.01).max(1.0) {
        return Err(fail("verify", "ไฟล์ใหม่ยาวไม่เท่าต้นฉบับ", vec![format!("ได้ {:.1} วินาที ควรได้ {:.1} วินาที", g.duration, want), "ลบไฟล์ใหม่แล้ว".into(), untouched]));
    }

    // กดหยุดระหว่างใส่ข้อมูลเพลงหรือตรวจ ไม่ตั้งชื่อไฟล์ใหม่ (ผู้ช่วยตรวจขั้น 10 ข้อ 9)
    if stop() { return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])); }
    // ย้ายชื่อแบบไม่เขียนทับ · ระหว่างแปลงมีไฟล์ชื่อนี้โผล่มา ใช้ชื่อถัดไป
    let mut dest = free_name(&dir, Path::new(&format!("{stem}.{ext}")));
    if let Err(p) = crate::rename::move_no_replace(&final_tmp, &dest) {
        if p.kind == "duplicate" {
            dest = free_name(&dir, Path::new(&format!("{stem}.{ext}")));
            crate::rename::move_no_replace(&final_tmp, &dest).map_err(|p| fail("other", "ตั้งชื่อไฟล์ใหม่ไม่ได้", vec![p.title, untouched.clone()]))?;
        } else {
            return Err(fail("other", "ตั้งชื่อไฟล์ใหม่ไม่ได้", vec![p.title, untouched]));
        }
    }
    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    emit("เสร็จ", 100.0, Some(0.0));
    Ok(ConvResult { out: dest.to_string_lossy().into(), size, src_size: f.size, tags: tags_n, cover: cover_ok, notes, tool, cmd, secs: t_start.elapsed().as_secs_f64() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tags_from_id3_flac_and_ogg_names() {
        let id3 = json!({"title": "ฝนแรก", "artist": "วง", "album_artist": "รวม", "track": "3/10", "TXXX": "x", "REPLAYGAIN_TRACK_GAIN": "-6.80 dB", "encoder": "Lavf"});
        let t = canon_tags(&id3);
        assert_eq!(t.iter().map(|x| x.key.as_str()).collect::<Vec<_>>(), ["title", "artist", "album_artist", "track", "replaygain_track_gain"]);
        let vorbis = json!({"TITLE": "A", "ALBUMARTIST": "B", "TRACKNUMBER": "2", "DATE": "2025", "DESCRIPTION": "c"});
        let t = canon_tags(&vorbis);
        assert_eq!(t, vec![
            Tag { key: "title".into(), value: "A".into() }, Tag { key: "album_artist".into(), value: "B".into() },
            Tag { key: "date".into(), value: "2025".into() }, Tag { key: "track".into(), value: "2".into() }, Tag { key: "comment".into(), value: "c".into() },
        ]);
        assert_eq!(ape_key("date"), "Year");
        assert_eq!(ape_key("replaygain_album_gain"), "REPLAYGAIN_ALBUM_GAIN");
        assert_eq!(vorbis_key("track"), "TRACKNUMBER");
    }

    #[test]
    fn remux_keeps_audio_and_copies_tags_and_cover() {
        let f = AudioFile {
            path: "a.flac".into(), name: "a.flac".into(), size: 1, duration: 1.0, audio_only: true, stream: 0, codec: "flac".into(), profile: String::new(),
            layout: "2.0".into(), channels: 2, rate: 48000, bits: Some(24), bitrate: None, tags: vec![], tags_in_stream: false,
            cover: Some(CoverInfo { codec: "mjpeg".into(), width: 10, height: 10, stream: 1 }),
        };
        let a = remux_args("enc.mp3", "a.flac", "out.mp3", "mp3", &f, true).join(" ");
        assert!(a.contains("-map 0:a:0 -map 1:1 -c copy -map_metadata 1 -disposition:v:0 attached_pic"), "{a}");
        assert!(a.ends_with("-id3v2_version 3 -n out.mp3"), "{a}");
        let mut g = f.clone();
        g.tags_in_stream = true;
        assert!(remux_args("e", "s", "o", "flac", &g, false).join(" ").contains("-map_metadata 1:s:0 -n o"));
    }

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

    /// FLAC ทดสอบมีแท็กกับปก (make-test-media) · แปลงเป็น Monkey's Audio ผ่าน DLL จริง แท็กกับปกติดไป
    #[test]
    fn flac_to_ape_with_tags_and_cover_real() {
        let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
        let f = probe(&tools(), &src).unwrap();
        assert!(!f.tags.is_empty() && f.cover.is_some(), "ไฟล์ทดสอบต้องมีแท็กกับปก {:?}", f.tags);
        let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("ape.ape");
        let spec = EncodeSpec { codec: "ape".into(), p: json!({"level": "High"}).as_object().cloned().unwrap(), ..Default::default() };
        let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
        assert_eq!(plan.steps[1].tool, "MACDll64");
        assert!(plan.steps[1].args.contains(&"3000".to_string()));
        let mut last = 0.0;
        let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |p| last = p).unwrap();
        assert!(matches!(r, encode::Done::Ok), "แปลงสำเร็จ");
        assert_eq!(last, 100.0);
        let cover = cover_bytes(&tools(), &src, f.cover.as_ref().unwrap().stream).unwrap();
        let mut items: Vec<crate::ape::ApeItem> = f.tags.iter().map(|t| crate::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
        let mut v = b"cover.jpg\0".to_vec();
        v.extend_from_slice(&cover);
        items.push(crate::ape::ApeItem { key: "Cover Art (Front)".into(), value: v, binary: true });
        crate::ape::append_tag(&out, &items).unwrap();
        let g = probe(&tools(), &out).unwrap();
        assert_eq!(g.codec, "ape");
        assert_eq!(g.channels, f.channels);
        assert_eq!(g.rate, f.rate);
        assert!((g.duration - f.duration).abs() < 0.1, "ยาว {} เทียบ {}", g.duration, f.duration);
        assert_eq!(g.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), f.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), "ชื่อเพลงภาษาไทยติดไป");
        assert!(g.cover.is_some(), "รูปปกติดไป");
        // ถอดกลับได้เสียงตรงต้นฉบับทุกตัวอย่าง (เทียบ MD5 ของเสียงดิบ)
        let md5 = |p: &Path| {
            let o = crate::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), p.as_os_str(), OsStr::new("-map"), OsStr::new("0:a:0"), OsStr::new("-c:a"), OsStr::new("pcm_s24le"), OsStr::new("-f"), OsStr::new("md5"), OsStr::new("-")]).unwrap();
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        };
        assert_eq!(md5(&out), md5(&src), "ไม่เสียคุณภาพ");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// FLAC 96 kHz 24 บิต แปลงเป็น TAK ด้วย Takc ที่แตกจากชุดที่แนบมา · แท็กกับปกติดไปแบบ APEv2 · ถอดกลับเสียงตรงทุกตัวอย่าง
    /// (8 พ.ย. 2569 · ก่อนหน้านี้ไม่เคยลอง TAK กับตัวแปลงจริง)
    #[test]
    fn flac_to_tak_with_tags_real() {
        let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
        let f = probe(&tools(), &src).unwrap();
        let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let tak = dir.join("TAK 2.3.3");
        encode::ensure_tak(&tools(), &tak).expect("แตก Takc.exe จาก zip ที่แนบมาได้");
        let out = dir.join("t.tak");
        let spec = EncodeSpec { codec: "tak".into(), p: json!({"preset": 4, "eval": "Max"}).as_object().cloned().unwrap(), ..Default::default() };
        let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
        assert_eq!(plan.steps[1].tool, "Takc");
        assert!(plan.steps[1].args.contains(&"-p4m".to_string()), "{:?}", plan.steps[1].args);
        let mut last = 0.0;
        let r = encode::run(&|n: &str| if n == "Takc" { tak.clone() } else { tools() }, &plan, Some(f.duration), &|| false, &mut |p| last = p).unwrap();
        assert!(matches!(r, encode::Done::Ok), "แปลงสำเร็จ");
        assert_eq!(last, 100.0);
        let items: Vec<crate::ape::ApeItem> = f.tags.iter().map(|t| crate::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
        crate::ape::append_tag(&out, &items).unwrap();
        let g = probe(&tools(), &out).unwrap();
        assert_eq!((g.codec.as_str(), g.channels, g.rate), ("tak", f.channels, f.rate));
        assert!((g.duration - f.duration).abs() < 0.1, "ยาว {} เทียบ {}", g.duration, f.duration);
        assert_eq!(g.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), f.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), "ชื่อเพลงภาษาไทยติดไป");
        let md5 = |p: &Path| {
            let o = crate::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), p.as_os_str(), OsStr::new("-map"), OsStr::new("0:a:0"), OsStr::new("-c:a"), OsStr::new("pcm_s24le"), OsStr::new("-f"), OsStr::new("md5"), OsStr::new("-")]).unwrap();
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        };
        assert_eq!(md5(&out), md5(&src), "ไม่เสียคุณภาพ");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// เปิด Loudness normalize แล้วอัตราสุ่มต้องเท่าต้นทาง (ผู้ช่วยตรวจขั้น 10 ข้อ 3 · เดิมได้ 192 kHz)
    #[test]
    fn loudnorm_keeps_source_rate() {
        let Some(src) = av("เพลงทดสอบ.wav") else { return };
        let f = probe(&tools(), &src).unwrap();
        assert_eq!(f.rate, 44100);
        let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("ln.flac");
        let spec = EncodeSpec { codec: "flac".into(), loudnorm: true, src_rate: Some(f.rate), ..Default::default() };
        let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
        assert!(plan.text.contains("loudnorm=I=-23:TP=-1,aresample=44100"), "{}", plan.text);
        let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |_| {}).unwrap();
        assert!(matches!(r, encode::Done::Ok));
        assert_eq!(probe(&tools(), &out).unwrap().rate, 44100, "อัตราสุ่มเท่าต้นทาง");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// หยุดกลางทาง ไม่ค้างไฟล์ (คนเรียกลบ) และคืน Cancelled
    #[test]
    fn ape_stop_returns_cancelled() {
        let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
        let f = probe(&tools(), &src).unwrap();
        let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("stop.ape");
        let spec = EncodeSpec { codec: "ape".into(), ..Default::default() };
        let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
        let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| true, &mut |_| {}).unwrap();
        assert!(matches!(r, encode::Done::Cancelled));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
