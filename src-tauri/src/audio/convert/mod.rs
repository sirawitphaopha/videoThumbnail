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

use crate::audio::encode::{self, EncodeSpec};
use crate::app::outfile::{drive_letter, fail, fmt_gb, free_name, free_space, scopeguard, ApplyProblem};
use crate::app::tools::{run_tool_timeout, tool_succeeded};

#[derive(Default)]
pub struct ConvertState {
    cancel: AtomicBool,
    running: AtomicBool,
}

/// ถือธงกำลังแปลง · ออกจากขอบเขตแล้วคืนธงเสมอ รวมตอนโค้ดแปลงพังกลางทาง (panic)
/// (AUDIT ข้อ 116 · เดิมคืนธงหลังบรรทัดแปลง พังครั้งเดียวแล้วคิวขึ้นว่ากำลังแปลงไฟล์อื่นอยู่ทุกไฟล์จนปิดโปรแกรม)
pub(crate) struct Running<'a>(&'a AtomicBool);
impl<'a> Running<'a> {
    /// จองธง · มีงานถืออยู่แล้วได้ None
    pub(crate) fn take(flag: &'a AtomicBool) -> Option<Self> {
        (!flag.swap(true, Ordering::SeqCst)).then_some(Running(flag))
    }
}
impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    /// ชื่อกลาง title artist album album_artist date track disc genre composer comment replaygain_*
    pub key: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverInfo {
    /// mjpeg png bmp ตามที่ ffprobe เห็น
    pub codec: String,
    pub width: u32,
    pub height: u32,
    /// เลขสตรีมของรูปปกในไฟล์
    pub stream: u64,
}

/// ข้อมูลไฟล์เสียงหนึ่งไฟล์ในคิว · แทร็กเสียงที่เลือก (ค่าตั้งต้นแทร็กแรก)
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
    /// ลำดับแทร็กเสียงที่แปลง นับจาก 0 · tracks จำนวนแทร็กเสียงทั้งไฟล์ ให้หน้าจอบอกว่าแปลงแทร็กไหน (AUDIT 12 พ.ย. 2569 ข้อ 22)
    pub track: usize,
    pub tracks: usize,
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

/// track ลำดับแทร็กเสียงนับจาก 0 · เดิมเลือกแทร็กเสียงแรกเสมอ ดูเสียง 2 ในหน้ากราฟแล้วกดแปลงเสียง ได้เสียง 1 (AUDIT 12 พ.ย. 2569 ข้อ 22)
pub fn parse_file(path: &Path, j: &Value, track: usize) -> Result<AudioFile, String> {
    let g = crate::audio::audiograph::parse_info(j);
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let audio: Vec<&Value> = streams.iter().filter(|s| s["codec_type"] == "audio").collect();
    if audio.is_empty() { return Err("ไฟล์นี้ไม่มีแทร็กเสียง".into()); }
    let st = *audio.get(track).ok_or_else(|| format!("ไฟล์นี้มีแทร็กเสียง {} แทร็ก ไม่มีแทร็กที่ {}", audio.len(), track + 1))?;
    let t = g.tracks.get(track).ok_or("ไฟล์นี้ไม่มีแทร็กเสียง")?;
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
        track,
        tracks: audio.len(),
    })
}

pub fn probe(tools: &Path, path: &Path) -> Result<AudioFile, String> {
    probe_track(tools, path, 0)
}

/// อ่านไฟล์โดยเลือกแทร็กเสียงลำดับ track (นับจาก 0)
pub fn probe_track(tools: &Path, path: &Path, track: usize) -> Result<AudioFile, String> {
    let out = run_tool_timeout(tools, "ffprobe", [
        OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
        OsStr::new("-show_format"), OsStr::new("-show_streams"), path.as_os_str(),
    ], Duration::from_secs(60))?;
    if !tool_succeeded("ffprobe", &out.status) {
        let msg = String::from_utf8_lossy(&out.stderr);
        return Err(format!("อ่านไฟล์ไม่ได้ {}", msg.lines().last().unwrap_or("").trim()));
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))?;
    parse_file(path, &j, track)
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
    Ok((crate::app::tools::tools_dir(app)?, work))
}

/// ขนาดที่คาดจากการลองแปลงจริง (BUGS ข้อ 120)
/// เดิมแผงตั้งค่าเสียงคิดจากเสียงดิบคูณเปอร์เซ็นต์ตายตัว ไฟล์ FLAC 96 kHz ที่บีบได้แค่ 66% ขึ้นว่าเล็กลง 20% แต่แปลงจริงเล็กลง 0.9%
/// วิธีนี้ลองแปลงด้วยขั้นตอนเดียวกับงานแปลงจริง 4 ช่วง ช่วงละ 10 วินาที (กลางแต่ละส่วนสี่ของเพลง) แล้วคูณขยายตามความยาว · เพลงไม่เกิน 60 วินาทีแปลงทั้งเพลง
/// เทสกับไฟล์ในภาพ คลาดจากของจริงไม่เกิน 3% ใช้เวลาราว 0.4 วินาที (ผลเทสใน ROADMAP) · ไม่เขียนข้อมูลเพลงกับปกลงไฟล์ลอง ปกนับแยก (cover) เฉพาะหน้าแปลงเสียง
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeProbe { bytes: f64, cover: u64, whole: bool }

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn convert_size_probe(app: AppHandle, path: String, stream: u64, spec: EncodeSpec, channels: Option<u32>, bits: Option<u32>, rate: Option<u32>, duration: f64, with_cover: bool) -> Result<SizeProbe, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, work) = tools_of(&app)?;
        let src = PathBuf::from(&path);
        if !src.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
        let user = encode::user_dir(&app).unwrap_or_default();
        let encs = encode::status(&tools, &user);
        let (bytes, whole) = size_probe(&work, &|n| encode::dir_for(&encs, &tools, n), &path, stream, &spec, channels, bits, rate, duration)?;
        let cover = if with_cover {
            probe(&tools, &src).ok().and_then(|f| f.cover).and_then(|c| cover_bytes(&tools, &src, c.stream).ok()).map(|b| b.len() as u64).unwrap_or(0)
        } else { 0 };
        Ok(SizeProbe { bytes, cover, whole })
    }).await.map_err(|e| e.to_string())?
}

/// ตัวลองแปลงของ convert_size_probe · แยกไว้ให้เทสเรียกตรง · คืน (ขนาดเสียงที่คาดทั้งเพลง ไบต์, แปลงทั้งเพลงไหม)
#[allow(clippy::too_many_arguments)]
pub fn size_probe(work: &Path, dir_of: &dyn Fn(&str) -> PathBuf, path: &str, stream: u64, spec: &EncodeSpec, channels: Option<u32>, bits: Option<u32>, rate: Option<u32>, duration: f64) -> Result<(f64, bool), String> {
    {
        let mut spec_r = spec.clone();
        if spec_r.src_rate.is_none() { spec_r.src_rate = rate; }
        let whole = duration <= 60.0;
        let segs: Vec<(f64, f64)> = if whole { vec![(0.0, duration.max(0.1))] } else { (0..4).map(|i| ((duration * (i as f64 + 0.5) / 4.0 - 5.0).max(0.0), 10.0)).collect() };
        let (mut bytes, mut secs) = (0u64, 0.0f64);
        for (at, len) in &segs {
            let out = work.join(format!("sizeprobe-{}.{}", crate::cover::poster_image::unique(), spec.ext()));
            let _g = scopeguard(out.clone());
            let mut plan = encode::build(&spec_r, path, stream, &out.to_string_lossy(), channels, bits)?;
            if !whole { insert_before(&mut plan.steps[0].args, "-i", vec!["-ss".into(), format!("{at:.3}"), "-t".into(), format!("{len:.3}")]); }
            insert_before(&mut plan.steps[0].args, "-vn", vec!["-map_metadata".into(), "-1".into()]);
            match encode::run(dir_of, &plan, Some(*len), &|| false, &mut |_| {})? {
                encode::Done::Ok => {}
                encode::Done::Cancelled => return Err("หยุดแล้ว".into()),
                encode::Done::Failed(m) => return Err(m),
            }
            bytes += std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
            secs += len;
        }
        let est = if whole || secs <= 0.0 { bytes as f64 } else { bytes as f64 * duration / secs };
        Ok((est, whole))
    }
}

#[tauri::command]
pub async fn convert_probe(app: AppHandle, path: String, track: Option<usize>) -> Result<AudioFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()); }
        probe_track(&tools, &p, track.unwrap_or(0))
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

/// โฟลเดอร์ที่ลากมาเข้าคิวแปลง ขยายเป็นไฟล์เสียงข้างใน ลึกสองชั้น (แผ่น 1 แผ่น 2) เรียงตามที่อยู่ ไฟล์ตรง ๆ ส่งต่อตามเดิม
/// (AUDIT ข้อ 115 · เดิมโฟลเดอร์เข้าคิวทั้งก้อน ได้แถวเดียวที่บอกว่าไฟล์เสียหรือไม่มีแทร็กเสียง) · ไม่เกิน 2,000 ไฟล์ต่อครั้ง
#[tauri::command]
pub fn convert_expand(paths: Vec<String>, exts: Vec<String>) -> Vec<String> {
    expand_paths(&paths, &exts, 2000)
}

pub(crate) fn expand_paths(paths: &[String], exts: &[String], max: usize) -> Vec<String> {
    fn walk(dir: &Path, depth: u32, exts: &[String], out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        let mut items: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        items.sort_by_key(|p| p.to_string_lossy().to_lowercase());
        for p in items {
            if p.is_dir() {
                if depth > 0 { walk(&p, depth - 1, exts, out); }
            } else if p.extension().and_then(|e| e.to_str()).is_some_and(|e| exts.iter().any(|x| x.eq_ignore_ascii_case(e))) {
                out.push(p);
            }
        }
    }
    let mut out = vec![];
    for p in paths {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            let mut got = vec![];
            walk(&pb, 1, exts, &mut got);
            out.extend(got.into_iter().map(|g| g.to_string_lossy().to_string()));
        } else {
            out.push(p.clone());
        }
    }
    out.truncate(max);
    out
}

/// รูปปกของไฟล์ให้หน้าจอดู (data URL) · ไม่มีรูปปก = None
/// known = ข้อมูลปกที่ convert_probe อ่านไว้แล้ว ไม่ต้องอ่านไฟล์ซ้ำ (AUDIT ข้อ 24)
/// thumb = ย่อด้านยาวไม่เกินเท่านี้จุดสำหรับคิว (AUDIT ข้อ 114 · เดิมทุกแถวเก็บรูปเต็มขนาด 0.5 ถึง 3 MB ทั้งที่แสดง 40 จุด)
#[tauri::command]
pub async fn convert_cover(app: AppHandle, path: String, known: Option<CoverInfo>, thumb: Option<u32>) -> Result<Option<CoverData>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        let p = PathBuf::from(&path);
        let c = match known {
            Some(c) => c,
            None => { let Some(c) = probe(&tools, &p)?.cover else { return Ok(None) }; c }
        };
        let b = cover_bytes(&tools, &p, c.stream)?;
        let small = thumb.and_then(|px| small_cover(&b, px));
        let (mime, data) = match &small {
            Some(s) => ("image/jpeg", s.as_slice()),
            None => (match c.codec.as_str() { "png" => "image/png", "bmp" => "image/bmp", _ => "image/jpeg" }, b.as_slice()),
        };
        Ok(Some(CoverData { url: format!("data:{mime};base64,{}", crate::audio::audiograph::b64(data)), bytes: b.len() as u64, codec: c.codec, width: c.width, height: c.height }))
    }).await.map_err(|e| e.to_string())?
}

/// ย่อรูปปกเป็น JPEG ด้านยาวไม่เกิน px · อ่านไม่ได้ได้ None ใช้รูปเต็มแทน
pub(crate) fn small_cover(bytes: &[u8], px: u32) -> Option<Vec<u8>> {
    let img = image::load_from_memory(bytes).ok()?.to_rgb8();
    let img = if img.width().max(img.height()) > px { image::DynamicImage::ImageRgb8(img).thumbnail(px, px).to_rgb8() } else { img };
    let mut out = std::io::Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 85).encode_image(&img).ok()?;
    Some(out.into_inner())
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
    /// ลำดับแทร็กเสียงที่แปลง นับจาก 0 · ไม่ส่ง = แทร็กแรก (AUDIT ข้อ 22)
    #[serde(default)]
    pub track: usize,
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
    /// เสียงตรงกับต้นฉบับทุกบิตไหม (BUGS ข้อ 121) · None ไม่ได้เทียบ (แปลงแบบเสียคุณภาพ ต้นฉบับเสียคุณภาพ หรือตั้งให้เสียงเปลี่ยน) เหตุผลอยู่ same_note
    pub same: Option<bool>,
    pub same_note: String,
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
        let Some(_running) = Running::take(&st.running) else {
            return Err(fail("other", "กำลังแปลงไฟล์อื่นอยู่", vec!["รอให้เสร็จก่อน".into()]));
        };
        st.cancel.store(false, Ordering::SeqCst);
        let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        convert(&app, &req, &jobs)
    }).await.map_err(|e| fail("other", "แปลงไม่สำเร็จ", vec![e.to_string()]))?
}

mod run;
pub use run::*;

#[cfg(test)]
mod tests;
