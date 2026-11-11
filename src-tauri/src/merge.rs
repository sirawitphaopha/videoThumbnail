//! หน้าเสียงและซับ (แผนเสียงและซับ ขั้น 1) · รวมเสียง ซับ โปสเตอร์ ที่โหลดแยกเข้าไฟล์หนังรอบเดียว
//! ① ไฟล์ที่ได้เป็น MKV → mkvmerge คำสั่งเดียว เลือกแทร็ก เรียงลำดับ ภาษา ชื่อ ธงหลัก ดีเลย์ (--sync) ไฟล์แนบเดิม ปกตั้ง ปกนอน
//! ② ไฟล์ที่ได้เป็น MP4 → ffmpeg ไม่แปลงภาพเสียง ดีเลย์ด้วย -itsoffset ของไฟล์ต้นทาง · ภาษา ชื่อ ธงหลัก ปกตั้ง
//! ลำดับงานแบบหน้าใส่โปสเตอร์ (poster.rs apply) เช็กไฟล์ถูกเปิด เช็กที่ว่าง ทำไฟล์ .partial ตรวจไฟล์ใหม่เทียบที่สั่ง แล้วค่อยเป็นไฟล์จริง
//! 🔴 ไฟล์เดิมไม่ถูกแตะจนกว่าไฟล์ใหม่ตรวจผ่าน · ไม่เขียนทับไฟล์ใด · กดหยุด ไฟล์ทำค้างถูกลบ · ffmpeg ใช้ -n ไม่ใช้ -y
//! 🔴 ดีเลย์ติดลบ = เสียงหรือซับมาเร็วขึ้น (ชื่อไฟล์แบบ eac3to "DELAY -120ms" = ต้องเลื่อน −120 ms) · mkvmerge --sync ใช้เครื่องหมายเดียวกัน

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::outfile::{
    cancelled, count, drive_letter, duration_of, eta, fail, ffprobe_json, finish_output, fmt_gb, free_space, kind_word, mp4_fit,
    not_in_use, run_live, scopeguard, streams_of, ApplyProblem, Counts, Run,
};
use crate::rename::MAX_PATH_LEN;
use crate::tools::{run_tool_timeout, tool_succeeded};

// ---------------------------------------------------------------- สถานะของหน้า

#[derive(Default)]
pub struct MergeState {
    cancel: AtomicBool,
    running: AtomicBool,
    /// รูปปกใหม่ที่ครอปแล้ว แยกตามช่อง cover (ปกตั้ง) · cover_land (ปกนอน) → (ไบต์, jpg | png)
    pub covers: Mutex<HashMap<String, (Vec<u8>, String)>>,
    /// ภาพปกเดิมที่ดึงออกมาให้หน้าจอดู แยกตามช่อง · ดึงใหม่แล้วลบของเก่า ไม่ให้กองในเครื่อง
    previews: Mutex<HashMap<String, PathBuf>>,
}

// ---------------------------------------------------------------- แทร็ก

/// แทร็กหนึ่งแทร็ก ทั้งแทร็กในหนังและในไฟล์ที่เพิ่ม · หน้าจอแก้ภาษา ชื่อ ธงหลัก ดีเลย์ เอาออก แล้วส่งกลับมาทั้งรายการตามลำดับใหม่
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Track {
    /// ไฟล์ที่แทร็กนี้อยู่
    pub src: String,
    /// เลขแทร็กของ mkvmerge (ใช้กับ --sync --language --track-order)
    pub tid: u64,
    /// เลขสตรีมของ ffprobe ใช้ตอนทำ MP4 · ไม่มี = จับคู่สองเครื่องมือไม่ได้ ทำ MP4 ไม่ได้
    pub ff: Option<u64>,
    /// video audio subtitle
    pub kind: String,
    /// ชื่อ codec แบบ ffprobe เช่น ac3 subrip hdmv_pgs_subtitle
    pub codec: String,
    pub profile: Option<String>,
    /// รหัสภาษา ISO 639-2 สามตัว · und = ไม่ระบุ
    pub lang: String,
    pub name: String,
    pub default: bool,
    pub forced: bool,
    pub channels: Option<u64>,
    pub layout: Option<String>,
    pub rate: Option<u64>,
    pub bits: Option<u64>,
    /// บิตเรต บิตต่อวินาที
    pub bitrate: Option<u64>,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub fps: Option<f64>,
    pub duration: Option<f64>,
    pub bytes: Option<u64>,
    /// ซับ = จำนวนบรรทัดหรือจำนวนภาพ
    pub frames: Option<u64>,
    /// ok ใส่ MP4 ได้ · style ได้แต่สีกับฟอนต์หาย · no ไม่ได้
    pub mp4: String,
    pub why: Option<String>,
    /// ชุดอักษรของซับตัวหนังสือที่ส่งให้ mkvmerge (UTF-8 · CP874 คือไทยแบบเก่า TIS-620)
    pub charset: Option<String>,
    /// ดีเลย์ มิลลิวินาที
    pub delay: i64,
    /// เอาไว้ในไฟล์ใหม่ไหม · false = เอาออก
    pub keep: bool,
    /// แทร็กในหนัง (true) หรือไฟล์ที่เพิ่ม (false)
    pub in_movie: bool,
    /// แปลงชนิดเสียงตอนรวม (ค่าในแผงตั้งค่าเสียง) · ไม่มี = ไม่แปลง เสียงเดิมทุกไบต์
    pub convert: Option<crate::encode::EncodeSpec>,
    /// แทร็กในหนังที่แปลง · true เพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) · false แทนที่แทร็กเดิม
    pub pair: bool,
    /// ชื่อแทร็กใหม่ที่ได้จากการแปลงแบบเพิ่มคู่ · ว่าง = ชื่อเดิมต่อด้วยชนิดใหม่
    pub conv_name: String,
}

/// ffprobe codec_name จากรหัส codec ของ mkvmerge · ใช้ตอนจับคู่ ffprobe ไม่ได้
fn codec_from_mkv(codec_id: &str, codec: &str) -> String {
    let c = match codec_id {
        "A_AC3" => "ac3", "A_EAC3" => "eac3", "A_DTS" => "dts", "A_TRUEHD" | "A_MLP" => "truehd", "A_AAC" => "aac", "A_OPUS" => "opus",
        "A_MPEG/L3" => "mp3", "A_MPEG/L2" => "mp2", "A_VORBIS" => "vorbis", "A_FLAC" => "flac", "A_PCM/INT/LIT" | "A_PCM/INT/BIG" => "pcm_s16le",
        "A_WAVPACK4" => "wavpack", "A_TTA1" => "tta", "A_ALAC" => "alac",
        "S_TEXT/UTF8" => "subrip", "S_TEXT/ASS" | "S_TEXT/SSA" => "ass", "S_TEXT/WEBVTT" => "webvtt", "S_HDMV/PGS" => "hdmv_pgs_subtitle", "S_VOBSUB" => "dvd_subtitle",
        "V_MPEG4/ISO/AVC" => "h264", "V_MPEGH/ISO/HEVC" => "hevc", "V_AV1" => "av1", "V_VP9" => "vp9", "V_MPEG2" => "mpeg2video",
        _ => "",
    };
    if !c.is_empty() {
        return c.into();
    }
    match codec {
        "AC-3" => "ac3", "E-AC-3" => "eac3", "AAC" => "aac", "SubRip/SRT" => "subrip", "SubStationAlpha" => "ass", "WebVTT" => "webvtt",
        "HDMV PGS" => "hdmv_pgs_subtitle", "VobSub" => "dvd_subtitle", "FLAC" => "flac", "Opus" => "opus", "MP3" => "mp3",
        _ => "",
    }.to_string()
}

fn kind_of_mkv(t: &str) -> &'static str {
    match t { "video" => "video", "audio" => "audio", "subtitles" => "subtitle", _ => "" }
}

/// เวลาแบบ 00:01:00.021000000 เป็นวินาที
fn hms(s: &str) -> Option<f64> {
    let mut parts = s.split(':').rev();
    let sec: f64 = parts.next()?.parse().ok()?;
    let min: f64 = parts.next().and_then(|m| m.parse().ok()).unwrap_or(0.0);
    let hr: f64 = parts.next().and_then(|h| h.parse().ok()).unwrap_or(0.0);
    Some(hr * 3600.0 + min * 60.0 + sec)
}

fn num(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

pub fn mkv_json(tools: &Path, file: &Path) -> Result<Value, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ mkvmerge ไม่ได้: {e}"))?;
    if !tool_succeeded("mkvmerge", &out.status) || j["container"]["recognized"].as_bool() == Some(false) || j["container"]["supported"].as_bool() == Some(false) {
        return Err("ไฟล์ชนิดนี้ใส่ในไฟล์หนังไม่ได้ (mkvmerge อ่านไม่ได้)".into());
    }
    Ok(j)
}

/// แทร็กทั้งหมดของไฟล์ · เลขแทร็กกับธงจาก mkvmerge (ใช้ตอนรวม) รายละเอียดเสียงภาพจาก ffprobe
/// จับคู่สองเครื่องมือตามลำดับแทร็ก ชนิดต้องตรงกันทุกคู่ ไม่ตรง = ไม่ใส่เลข ffprobe (ทำ MP4 ไม่ได้ ทำ MKV ได้)
pub fn probe_source(tools: &Path, file: &Path, in_movie: bool) -> Result<Vec<Track>, String> {
    let mk = mkv_json(tools, file)?;
    let ff = ffprobe_json(tools, file).ok();
    let empty = vec![];
    let mk_tracks: Vec<&Value> = mk["tracks"].as_array().unwrap_or(&empty).iter().filter(|t| !kind_of_mkv(t["type"].as_str().unwrap_or("")).is_empty()).collect();
    let ff_streams: Vec<&Value> = ff.as_ref().and_then(|j| j["streams"].as_array()).unwrap_or(&empty).iter()
        .filter(|s| matches!(s["codec_type"].as_str(), Some("video" | "audio" | "subtitle")) && s["disposition"]["attached_pic"].as_i64() != Some(1))
        .collect();
    let paired = mk_tracks.len() == ff_streams.len()
        && mk_tracks.iter().zip(&ff_streams).all(|(m, f)| kind_of_mkv(m["type"].as_str().unwrap_or("")) == f["codec_type"].as_str().unwrap_or("-"));
    let src = file.to_string_lossy().to_string();
    Ok(mk_tracks.iter().enumerate().map(|(i, m)| {
        let p = &m["properties"];
        let f = if paired { ff_streams[i] } else { &Value::Null };
        let kind = kind_of_mkv(m["type"].as_str().unwrap_or("")).to_string();
        let codec = f["codec_name"].as_str().map(String::from)
            .unwrap_or_else(|| codec_from_mkv(p["codec_id"].as_str().unwrap_or(""), m["codec"].as_str().unwrap_or("")));
        let (fit, why) = mp4_fit(&kind, &codec);
        let tags = &f["tags"];
        let fps = f["avg_frame_rate"].as_str().and_then(|r| {
            let (a, b) = r.split_once('/')?;
            let (a, b): (f64, f64) = (a.parse().ok()?, b.parse().ok()?);
            (b > 0.0 && a > 0.0).then(|| a / b)
        });
        let lang = p["language"].as_str().unwrap_or("und").to_string();
        Track {
            src: src.clone(),
            tid: m["id"].as_u64().unwrap_or(0),
            ff: paired.then(|| f["index"].as_u64()).flatten(),
            kind,
            profile: f["profile"].as_str().map(String::from),
            lang: if lang.is_empty() { "und".into() } else { lang },
            name: p["track_name"].as_str().unwrap_or("").to_string(),
            default: p["default_track"].as_bool().unwrap_or(false),
            forced: p["forced_track"].as_bool().unwrap_or(false),
            channels: p["audio_channels"].as_u64().or_else(|| f["channels"].as_u64()),
            layout: f["channel_layout"].as_str().map(String::from),
            rate: p["audio_sampling_frequency"].as_u64().or_else(|| num(&f["sample_rate"])),
            bits: p["audio_bits_per_sample"].as_u64().or_else(|| num(&f["bits_per_raw_sample"])).filter(|b| *b > 0),
            bitrate: num(&f["bit_rate"]).or_else(|| num(&tags["BPS"])).or_else(|| num(&p["tag_bps"])),
            width: f["width"].as_u64(),
            height: f["height"].as_u64(),
            fps,
            duration: tags["DURATION"].as_str().and_then(hms).or_else(|| f["duration"].as_str().and_then(|d| d.parse().ok()))
                .or_else(|| p["tag_duration"].as_str().and_then(hms)),
            bytes: num(&tags["NUMBER_OF_BYTES"]).or_else(|| num(&p["tag_number_of_bytes"])),
            frames: num(&tags["NUMBER_OF_FRAMES"]).or_else(|| num(&p["tag_number_of_frames"])),
            mp4: fit.into(),
            why,
            charset: None,
            delay: 0,
            keep: true,
            in_movie,
            codec,
            convert: None,
            pair: true,
            conv_name: String::new(),
        }
    }).collect())
}

/// ดีเลย์จากชื่อไฟล์ แบบที่ eac3to กับคนแจกเสียงเขียน "DELAY -120ms" "delay 250 ms" "Delay_-48ms"
pub fn delay_from_name(name: &str) -> Option<i64> {
    let low = name.to_lowercase();
    let mut from = 0;
    while let Some(at) = low[from..].find("delay") {
        let rest = &low[from + at + 5..];
        let rest = rest.trim_start_matches([' ', '_', '=', ':']);
        let (sign, digits) = match rest.chars().next() {
            Some('-') => (-1, &rest[1..]),
            Some('+') => (1, &rest[1..]),
            _ => (1, rest),
        };
        let n: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !n.is_empty() {
            let after = digits[n.len()..].trim_start_matches([' ', '_']);
            // ต้องตามด้วย ms หรือจบคำ · กันชื่อแบบ "delay2" ที่ไม่ใช่ดีเลย์
            if after.starts_with("ms") || after.is_empty() || after.starts_with(['.', ')', ']', ' ']) {
                return n.parse::<i64>().ok().map(|v| sign * v).filter(|v| v.abs() <= 600_000);
            }
        }
        from += at + 5;
    }
    None
}

/// ภาษาจากชื่อไฟล์ · คำไทย (พากย์ไทย ซับไทย อังกฤษ) หรือรหัสท้ายชื่อ (.th. .tha. .eng.) หรือชื่ออังกฤษ (Thai English)
/// รหัสสองตัวที่ชนคำอังกฤษบ่อย (it my no) ดูเฉพาะคำท้ายสุด
pub fn lang_from_name(stem: &str) -> Option<&'static str> {
    const THAI_WORDS: [(&str, &str); 6] = [("ไทย", "tha"), ("อังกฤษ", "eng"), ("ญี่ปุ่น", "jpn"), ("เกาหลี", "kor"), ("จีน", "chi"), ("ฝรั่งเศส", "fre")];
    if let Some((_, c)) = THAI_WORDS.iter().find(|(w, _)| stem.contains(w)) {
        return Some(c);
    }
    let code = |t: &str| -> Option<&'static str> {
        Some(match t {
            "th" | "tha" | "thai" => "tha", "en" | "eng" | "english" => "eng", "ja" | "jpn" | "jap" | "japanese" => "jpn",
            "ko" | "kor" | "korean" => "kor", "zh" | "chi" | "zho" | "chs" | "cht" | "chinese" => "chi", "fr" | "fre" | "fra" | "french" => "fre",
            "de" | "ger" | "deu" | "german" => "ger", "es" | "spa" | "spanish" => "spa", "ita" | "italian" => "ita", "ru" | "rus" | "russian" => "rus",
            "pt" | "por" | "portuguese" => "por", "vi" | "vie" | "vietnamese" => "vie", "ind" | "indonesian" => "ind", "may" | "msa" | "malay" => "may",
            "hin" | "hindi" => "hin", "ara" | "arabic" => "ara", "lao" => "lao", "khm" | "khmer" => "khm", "bur" | "burmese" => "bur",
            _ => return None,
        })
    };
    let low = stem.to_lowercase();
    let tokens: Vec<&str> = low.split(|c: char| !c.is_ascii_alphanumeric()).filter(|t| !t.is_empty()).collect();
    let skip = |t: &str| t.chars().all(|c| c.is_ascii_digit()) || matches!(t, "forced" | "sdh" | "cc" | "default" | "full" | "delay" | "ms" | "tis620" | "cp874" | "utf8")
        || (t.ends_with("ms") && t.starts_with(|c: char| c.is_ascii_digit()));
    // คำท้ายสุดที่มีความหมาย
    if let Some(last) = tokens.iter().rev().find(|t| !skip(t)) {
        if let Some(c) = code(last) {
            return Some(c);
        }
    }
    // ชื่ออังกฤษเต็ม (thai english japanese) อยู่ตรงไหนก็ได้
    tokens.iter().find_map(|t| if t.len() >= 4 { code(t) } else { None })
}

/// ชุดอักษรของไฟล์ซับตัวหนังสือ · มี BOM ไม่ต้องบอก (mkvmerge อ่านเอง) · UTF-8 ถูกต้อง = UTF-8 · มีอักษรช่วงไทยของ TIS-620 = CP874
pub fn sub_charset(path: &Path) -> Option<String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt") {
        return None;
    }
    let mut b = std::fs::read(path).ok()?;
    b.truncate(8 << 20);
    if b.starts_with(&[0xEF, 0xBB, 0xBF]) || b.starts_with(&[0xFF, 0xFE]) || b.starts_with(&[0xFE, 0xFF]) {
        return None;
    }
    // กติกาเดียวกับตัวดูซับ · ไม่ใช่ไทยจริงถือเป็น Windows-1252 ไม่เดาเป็นไทย (ผู้ช่วยตรวจขั้น 10 ข้อ 4)
    Some(crate::subs::guess_charset(&b).into())
}

// ---------------------------------------------------------------- เปิดไฟล์หนัง · เพิ่มไฟล์

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: u64,
    pub name: String,
    pub mime: String,
    pub size: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeMovie {
    path: String,
    name: String,
    ext: String,
    size: u64,
    duration: Option<f64>,
    tracks: Vec<Track>,
    attachments: Vec<Attachment>,
    free: u64,
    drive: String,
    /// ทำ MP4 ได้ไหม (จับคู่แทร็กของสองเครื่องมือได้ครบ)
    mp4_ok: bool,
}

fn attachments_of(j: &Value) -> Vec<Attachment> {
    j["attachments"].as_array().map(|a| a.iter().map(|x| Attachment {
        id: x["id"].as_u64().unwrap_or(0),
        name: x["file_name"].as_str().unwrap_or("").to_string(),
        mime: x["content_type"].as_str().unwrap_or("").to_string(),
        size: x["size"].as_u64().unwrap_or(0),
    }).collect()).unwrap_or_default()
}

fn tools_of(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((crate::tools::tools_dir(app)?, local.join("tmp")))
}

pub fn inspect(tools: &Path, p: &Path) -> Result<MergeMovie, String> {
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !crate::library::ACCEPTED.contains(&ext.as_str()) {
        return Err(format!("ไฟล์ .{ext} ไม่ใช่ไฟล์หนังที่ใช้ได้"));
    }
    let size = std::fs::metadata(p).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
    let mk = mkv_json(tools, p)?;
    let tracks = probe_source(tools, p, true)?;
    let ff = ffprobe_json(tools, p).ok();
    let dir = p.parent().unwrap_or(Path::new(""));
    Ok(MergeMovie {
        path: p.to_string_lossy().to_string(),
        name: p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        ext,
        size,
        duration: ff.as_ref().and_then(duration_of).or_else(|| mk["container"]["properties"]["duration"].as_u64().map(|ns| ns as f64 / 1e9)),
        mp4_ok: tracks.iter().all(|t| t.ff.is_some()),
        tracks,
        attachments: attachments_of(&mk),
        free: free_space(dir),
        drive: drive_letter(dir),
    })
}

#[tauri::command]
pub async fn merge_inspect(app: AppHandle, path: String) -> Result<MergeMovie, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        inspect(&tools, Path::new(&path))
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddedFile {
    path: String,
    name: String,
    ext: String,
    size: u64,
    tracks: Vec<Track>,
    /// ดีเลย์ที่อ่านจากชื่อไฟล์
    delay_from_name: Option<i64>,
    /// ภาษาที่เดาจากชื่อไฟล์
    lang_from_name: Option<String>,
    /// ยาวกว่าหนังกี่วินาที (บวก = ยาวกว่า) · ไม่รู้ความยาวไม่บอก
    longer_by: Option<f64>,
    notes: Vec<String>,
    /// ซับ ASS SSA · ฟอนต์ที่ซับใช้กับไฟล์ฟอนต์ที่หาเจอ (fonts.rs)
    fonts: Vec<crate::fonts::FontHit>,
}

pub fn add_file(tools: &Path, path: &Path, movie_duration: Option<f64>) -> Result<AddedFile, String> {
    let mut p = path.to_path_buf();
    let mut notes = vec![];
    let mut ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // ซับ DVD สองไฟล์คู่กัน .idx บอกเวลา .sub เก็บรูป · ลาก .sub มาก็ใช้ .idx ข้าง ๆ (mkvmerge อ่านจาก .idx)
    if ext == "sub" {
        let idx = p.with_extension("idx");
        if idx.exists() {
            p = idx;
            ext = "idx".into();
            notes.push("ซับ DVD ใช้ไฟล์ .idx คู่กับ .sub".into());
        }
    }
    if matches!(ext.as_str(), "ape" | "tak") {
        return Err(format!("ไฟล์ .{ext} ใส่ในไฟล์หนังไม่ได้ ต้องแปลงเป็นชนิดอื่นก่อน (ตั้งค่าแปลงในแถวเสียง)"));
    }
    let size = std::fs::metadata(&p).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
    let mut tracks = probe_source(tools, &p, false)?;
    if tracks.is_empty() {
        return Err("ไฟล์นี้ไม่มีเสียงหรือซับ".into());
    }
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stem = p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let delay = delay_from_name(&name);
    let lang = lang_from_name(&stem);
    let charset = sub_charset(&p);
    if charset.as_deref() == Some("CP874") {
        notes.push("ซับเข้ารหัสภาษาไทยแบบเก่า (TIS-620) โปรแกรมแปลงให้".into());
    }
    // ซับตัวหนังสือในไฟล์แยก ffprobe ไม่รู้จำนวนบรรทัด นับเอง (ไฟล์เล็ก)
    let count_subs = tracks.iter().any(|t| t.kind == "subtitle" && t.frames.is_none());
    let packets = if count_subs {
        run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-select_streams"), OsStr::new("s"),
            OsStr::new("-count_packets"), OsStr::new("-show_entries"), OsStr::new("stream=nb_read_packets"), OsStr::new("-of"), OsStr::new("csv=p=0"), p.as_os_str()],
            Duration::from_secs(60)).ok().map(|o| String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| l.trim().trim_end_matches(',').parse::<u64>().ok()).collect::<Vec<_>>())
    } else {
        None
    };
    let mut si = 0;
    for t in tracks.iter_mut() {
        t.delay = delay.unwrap_or(0);
        if t.lang == "und" {
            if let Some(l) = lang { t.lang = l.into(); }
        }
        t.default = false;
        t.forced = false;
        if t.kind == "subtitle" {
            t.charset = charset.clone();
            if t.frames.is_none() {
                t.frames = packets.as_ref().and_then(|v| v.get(si).copied());
            }
            si += 1;
        }
    }
    let dur = tracks.iter().filter(|t| t.kind == "audio").filter_map(|t| t.duration).fold(None, |m: Option<f64>, d| Some(m.map_or(d, |x| x.max(d))));
    let longer_by = match (dur, movie_duration) { (Some(a), Some(m)) if m > 0.0 => Some(a - m), _ => None };
    // ซับ ASS บอกแค่ชื่อฟอนต์ · หาไฟล์ฟอนต์ให้ ไว้ฝังไปกับไฟล์ใหม่ (พี่กันสั่ง 8 พ.ย. 2569)
    let fonts = if matches!(ext.as_str(), "ass" | "ssa") {
        std::fs::read(&p).ok().map(|b| crate::fonts::find(&p, &crate::fonts::ass_fonts(&crate::subs::decode_text(&b).0))).unwrap_or_default()
    } else {
        vec![]
    };
    Ok(AddedFile {
        path: p.to_string_lossy().to_string(), name, ext, size, tracks, delay_from_name: delay, lang_from_name: lang.map(String::from), longer_by, notes, fonts,
    })
}

#[tauri::command]
pub async fn merge_add_file(app: AppHandle, path: String, movie_duration: Option<f64>) -> Result<AddedFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        add_file(&tools, Path::new(&path), movie_duration)
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- ช่องปก

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverPreview {
    preview: String,
    width: u32,
    height: u32,
    bytes: u64,
}

/** ภาพของปกเดิมในหนัง (ไฟล์แนบเลข id) ให้หน้าจอดูในช่องปก · ดึงลงโฟลเดอร์ภาพตัวอย่างของโปรแกรม (หน้าจอเปิดรูปได้เฉพาะโฟลเดอร์นี้) */
#[tauri::command]
pub async fn merge_cover_preview(app: AppHandle, path: String, id: u64, slot: String) -> Result<CoverPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // slot เป็นส่วนของชื่อไฟล์ รับเฉพาะสองช่องนี้ (ผู้ช่วยตรวจขั้น 10 ข้อ 22 · แบบ poster_render)
        if slot != "cover" && slot != "cover_land" { return Err("ช่องปกไม่ถูกต้อง".into()); }
        let (tools, _) = tools_of(&app)?;
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("previews");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let out = dir.join(format!("merge-old-{slot}-{}", crate::poster_image::unique()));
        let src = Path::new(&path);
        let ok = if is_matroska(src) {
            let mut target = OsString::from(format!("{id}:"));
            target.push(out.as_os_str());
            let r = run_tool_timeout(&tools, "mkvextract", [OsStr::new(&path), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
            tool_succeeded("mkvextract", &r.status)
        } else {
            // ปกที่ฝังใน MP4 MOV mkvextract เปิดไม่ได้ ดึงสตรีมรูปปกด้วย ffmpeg ไม่แปลง
            match attached_pic_index(&tools, src) {
                Some(ix) => {
                    let map = format!("0:{ix}");
                    let r = run_tool_timeout(&tools, "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-nostdin"), OsStr::new("-n"), OsStr::new("-i"), src.as_os_str(),
                        OsStr::new("-map"), OsStr::new(&map), OsStr::new("-c"), OsStr::new("copy"), OsStr::new("-frames:v"), OsStr::new("1"), OsStr::new("-f"), OsStr::new("image2"), out.as_os_str()], Duration::from_secs(120))?;
                    tool_succeeded("ffmpeg", &r.status)
                }
                None => false,
            }
        };
        if !ok || !out.exists() {
            let _ = std::fs::remove_file(&out);
            return Err("ดึงรูปปกเดิมออกมาไม่ได้".into());
        }
        let bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
        let (width, height) = image::ImageReader::open(&out).ok().and_then(|r| r.with_guessed_format().ok()).and_then(|r| r.into_dimensions().ok()).unwrap_or((0, 0));
        if let Some(old) = app.state::<MergeState>().previews.lock().unwrap().insert(slot, out.clone()) {
            let _ = std::fs::remove_file(old);
        }
        Ok(CoverPreview { preview: out.to_string_lossy().to_string(), width, height, bytes })
    }).await.map_err(|e| e.to_string())?
}

/// เอารูปปกใหม่ที่ครอปไว้ในช่องนั้นออก (ปุ่มเอาออกของรูปใหม่ · ล้างทั้งหมด)
#[tauri::command]
pub fn merge_cover_drop(st: State<'_, MergeState>, slot: Option<String>) {
    let mut c = st.covers.lock().unwrap();
    match slot {
        Some(s) => { c.remove(&s); }
        None => c.clear(),
    }
}

// ---------------------------------------------------------------- คำสั่งรวม

/// ปกตั้ง ปกนอน · keep ใช้ของเดิมในหนัง (ถ้ามี) · remove เอาออก · new ใช้รูปที่ครอปไว้ในช่องนั้น
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverPlan {
    pub portrait: String,
    pub land: String,
}

impl Default for CoverPlan {
    fn default() -> Self {
        CoverPlan { portrait: "keep".into(), land: "keep".into() }
    }
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeReq {
    pub movie: String,
    /// ทุกแทร็กตามลำดับในไฟล์ใหม่ · keep false = เอาออก
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub covers: CoverPlan,
    /// mkv | mp4
    pub output: String,
    /// keep | trash
    pub original: String,
    #[serde(default)]
    pub check_source: bool,
    #[serde(default = "yes")]
    pub check_output: bool,
    /// ไฟล์ฟอนต์ของซับ ASS ที่จะฝังเป็นไฟล์แนบ (fonts.rs · ผู้ใช้ติ๊กเลือกในการ์ดฟอนต์) · MP4 ใส่ไม่ได้
    #[serde(default)]
    pub fonts: Vec<String>,
}

fn yes() -> bool {
    true
}

/// ขนาดคร่าว ๆ ของเสียงที่แปลง · แบบเสียคุณภาพจากบิตเรตที่ตั้ง (ไม่มีบิตเรต เช่น MP3 VBR AAC TVBR คิด 320 kbps)
/// แบบไม่เสียคุณภาพคิด 60% ของเสียงดิบ 24 บิต · ไม่รู้ความยาว คิดไม่ได้ ไม่บวก
pub fn conv_estimate(t: &Track) -> Option<u64> {
    let spec = t.convert.as_ref()?;
    let secs = t.duration?;
    let ch = spec.channels.map(|c| c as u64).or(t.channels).unwrap_or(2) as f64;
    let rate = spec.rate.map(|r| r as u64).or(t.rate).unwrap_or(48000) as f64;
    let secs = match spec.speed { Some([a, b]) if a > 0.0 && b > 0.0 => secs * a / b, _ => secs };
    let bytes = match spec.codec.as_str() {
        "flac" | "alac" | "wv" => secs * rate * ch * 3.0 * 0.6,
        _ => {
            let kbps = spec.p.get("bitrate").and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(320.0);
            secs * kbps * 1000.0 / 8.0
        }
    };
    Some(bytes as u64)
}

/// ไฟล์รูปปกใหม่ที่เขียนลงโฟลเดอร์ชั่วคราวแล้ว
#[derive(Clone, Debug)]
pub struct NewCover {
    pub name: String,
    pub mime: String,
    pub file: PathBuf,
    pub sha: String,
}

/// ไฟล์ต้นทางของคำสั่งรวม ตามลำดับที่ส่งให้ mkvmerge · หนังมาก่อนเสมอ
fn inputs_of(movie: &str, tracks: &[Track]) -> Vec<String> {
    let mut v = vec![movie.to_string()];
    for t in tracks.iter().filter(|t| t.keep) {
        if !v.iter().any(|s| s == &t.src) {
            v.push(t.src.clone());
        }
    }
    v
}

fn flag(b: bool) -> &'static str {
    if b { "1" } else { "0" }
}

/// คำสั่ง mkvmerge ทั้งชุด · movie_atts = เลขไฟล์แนบของหนังที่เก็บไว้ · other_atts = ไฟล์แนบของไฟล์ที่เพิ่มที่เก็บไว้ (ฟอนต์ของซับ ASS)
/// covers = รูปปกใหม่ · fonts = ไฟล์ฟอนต์ของซับ ASS ที่หาเจอในเครื่อง (fonts.rs) แนบเป็นไฟล์ใหม่
pub fn mkv_args(movie: &str, tracks: &[Track], movie_atts: &[u64], other_atts: &HashMap<String, Vec<u64>>, covers: &[NewCover], fonts: &[NewCover], out: &Path) -> Vec<OsString> {
    let mut a: Vec<OsString> = ["--gui-mode", "--ui-language", "en", "-o"].iter().map(OsString::from).collect();
    a.push(out.as_os_str().to_owned());
    let inputs = inputs_of(movie, tracks);
    for (fi, src) in inputs.iter().enumerate() {
        let mine: Vec<&Track> = tracks.iter().filter(|t| t.keep && &t.src == src).collect();
        for (kind, sel, none) in [("video", "-d", "-D"), ("audio", "-a", "-A"), ("subtitle", "-s", "-S")] {
            let ids: Vec<String> = mine.iter().filter(|t| t.kind == kind).map(|t| t.tid.to_string()).collect();
            if ids.is_empty() {
                a.push(none.into());
            } else {
                a.push(sel.into());
                a.push(ids.join(",").into());
            }
        }
        let atts: &[u64] = if fi == 0 { movie_atts } else { other_atts.get(src).map(|v| v.as_slice()).unwrap_or(&[]) };
        if atts.is_empty() {
            a.push("--no-attachments".into());
        } else {
            a.push("--attachments".into());
            a.push(atts.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",").into());
        }
        if fi > 0 {
            // บทกับป้ายข้อมูลรวมของไฟล์ที่เพิ่มไม่เอามาปนกับของหนัง
            a.extend(["--no-chapters", "--no-global-tags"].iter().map(OsString::from));
        }
        for t in &mine {
            a.push("--language".into());
            a.push(format!("{}:{}", t.tid, if t.lang.is_empty() { "und" } else { &t.lang }).into());
            a.push("--track-name".into());
            a.push(format!("{}:{}", t.tid, t.name).into());
            a.push("--default-track-flag".into());
            a.push(format!("{}:{}", t.tid, flag(t.default)).into());
            a.push("--forced-display-flag".into());
            a.push(format!("{}:{}", t.tid, flag(t.forced)).into());
            if t.delay != 0 {
                a.push("--sync".into());
                a.push(format!("{}:{}", t.tid, t.delay).into());
            }
            if let Some(cs) = &t.charset {
                a.push("--sub-charset".into());
                a.push(format!("{}:{cs}", t.tid).into());
            }
        }
        a.push(src.into());
    }
    for c in covers.iter().chain(fonts) {
        a.extend(["--attachment-name".into(), c.name.clone().into(), "--attachment-mime-type".into(), c.mime.clone().into(), "--attach-file".into(), c.file.as_os_str().to_owned()]);
    }
    let order: Vec<String> = tracks.iter().filter(|t| t.keep)
        .map(|t| format!("{}:{}", inputs.iter().position(|s| s == &t.src).unwrap_or(0), t.tid)).collect();
    if !order.is_empty() {
        a.push("--track-order".into());
        a.push(order.join(",").into());
    }
    a
}

/// ปกของไฟล์ MP4 · ไฟล์รูปแยก หรือรูปปกที่ฝังในหนัง MP4 อยู่แล้ว (เลขสตรีม)
pub enum Mp4Cover {
    File(PathBuf),
    Stream(u64),
}

/// คำสั่ง ffmpeg ทำ MP4 · ไฟล์ต้นทางแยกตาม (ไฟล์, ดีเลย์, ชุดอักษร) เพราะ -itsoffset ใช้ได้ทั้งไฟล์
/// หนังที่ไม่มีดีเลย์อยู่ช่องแรกเสมอ ข้อมูลรวมกับบทของหนังมาจากช่องนี้
pub fn mp4_args(movie: &str, tracks: &[Track], cover: Option<&Mp4Cover>, out: &Path) -> Vec<OsString> {
    let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-progress", "pipe:1", "-nostats"].iter().map(OsString::from).collect();
    let mut inputs: Vec<(String, i64, Option<String>)> = vec![(movie.to_string(), 0, None)];
    let key = |t: &Track| (t.src.clone(), t.delay, if t.in_movie { None } else { t.charset.clone().filter(|_| t.kind == "subtitle") });
    for t in tracks.iter().filter(|t| t.keep) {
        let k = key(t);
        if !inputs.contains(&k) {
            inputs.push(k);
        }
    }
    for (src, delay, cs) in &inputs {
        if *delay != 0 {
            a.push("-itsoffset".into());
            a.push(format!("{:.3}", *delay as f64 / 1000.0).into());
        }
        if let Some(cs) = cs {
            a.push("-sub_charenc".into());
            a.push(cs.into());
        }
        a.push("-i".into());
        a.push(src.into());
    }
    let cover_input = match cover {
        Some(Mp4Cover::File(f)) => {
            a.push("-i".into());
            a.push(f.as_os_str().to_owned());
            Some(inputs.len())
        }
        _ => None,
    };
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    for t in &kept {
        let ii = inputs.iter().position(|k| k == &key(t)).unwrap_or(0);
        a.push("-map".into());
        a.push(format!("{ii}:{}", t.ff.unwrap_or(t.tid)).into());
    }
    match (cover, cover_input) {
        (Some(Mp4Cover::File(_)), Some(ci)) => { a.push("-map".into()); a.push(format!("{ci}:0").into()); }
        (Some(Mp4Cover::Stream(s)), _) => { a.push("-map".into()); a.push(format!("0:{s}").into()); }
        _ => {}
    }
    a.extend(["-c", "copy", "-c:s", "mov_text"].iter().map(OsString::from));
    for (i, t) in kept.iter().enumerate() {
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("language={}", if t.lang.is_empty() { "und" } else { &t.lang }).into());
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("title={}", t.name).into());
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("handler_name={}", t.name).into());
        if t.kind != "video" {
            a.push(format!("-disposition:{i}").into());
            a.push((if t.default { "default" } else { "0" }).into());
        }
    }
    if cover.is_some() {
        a.push(format!("-disposition:{}", kept.len()).into());
        a.push("attached_pic".into());
    }
    a.extend(["-map_metadata", "0", "-map_chapters", "0", "-f", "mp4"].iter().map(OsString::from));
    a.push(out.as_os_str().to_owned());
    a
}

// ---------------------------------------------------------------- ตรวจไฟล์ใหม่

/// ตรวจไฟล์ MKV ใหม่เทียบที่สั่ง · ลำดับ ชนิด codec ภาษา ชื่อ ธงหลัก ไฟล์แนบ รูปปก ความยาว
pub fn verify_mkv(tools: &Path, work: &Path, file: &Path, tracks: &[Track], att_names: &[String], covers: &[NewCover], movie_duration: Option<f64>) -> Result<Counts, Vec<String>> {
    let mut why = vec![];
    let mk = mkv_json(tools, file).map_err(|e| vec![e])?;
    let ff = ffprobe_json(tools, file).map_err(|e| vec![e])?;
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    let got = streams_of(&ff);
    let want_k: Vec<(String, String)> = kept.iter().map(|t| (t.kind.clone(), t.codec.clone())).collect();
    let got_k: Vec<(String, String)> = got.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
    if want_k != got_k {
        let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
        why.push(format!("แทร็กไม่ตรงที่สั่ง ที่สั่ง {} แต่ไฟล์ใหม่ {}", show(&want_k), show(&got_k)));
    }
    let empty = vec![];
    let mt: Vec<&Value> = mk["tracks"].as_array().unwrap_or(&empty).iter().collect();
    for (i, t) in kept.iter().enumerate() {
        let Some(m) = mt.get(i) else { break };
        let p = &m["properties"];
        let lang = p["language"].as_str().unwrap_or("und");
        if lang != t.lang && !(t.lang.is_empty() && lang == "und") {
            why.push(format!("แทร็กที่ {} ภาษา {lang} ที่สั่ง {}", i + 1, t.lang));
        }
        if p["track_name"].as_str().unwrap_or("") != t.name {
            why.push(format!("แทร็กที่ {} ชื่อ \"{}\" ที่สั่ง \"{}\"", i + 1, p["track_name"].as_str().unwrap_or(""), t.name));
        }
        if p["default_track"].as_bool().unwrap_or(false) != t.default {
            why.push(format!("แทร็กที่ {} ธงหลักไม่ตรงที่สั่ง", i + 1));
        }
    }
    let mut want_atts: Vec<String> = att_names.iter().map(|n| n.to_lowercase()).collect();
    want_atts.extend(covers.iter().map(|c| c.name.to_lowercase()));
    want_atts.sort();
    let mut got_atts: Vec<String> = attachments_of(&mk).iter().map(|a| a.name.to_lowercase()).collect();
    got_atts.sort();
    if want_atts != got_atts {
        why.push(format!("ไฟล์แนบไม่ตรง ที่สั่ง {want_atts:?} แต่ไฟล์ใหม่ {got_atts:?}"));
    } else {
        for c in covers {
            if let Err(e) = cover_matches(tools, work, file, &mk, c) {
                why.push(e);
            }
        }
    }
    if let (Some(a), Some(b)) = (movie_duration, duration_of(&ff)) {
        if b + 0.2 < a {
            why.push(format!("ไฟล์ใหม่สั้นกว่าหนัง {:.2} กับ {:.2} วินาที", b, a));
        }
    }
    if why.is_empty() { Ok(count(&got)) } else { Err(why) }
}

/// รูปปกในไฟล์ดึงออกมาแล้ว hash ตรงกับรูปที่ใส่
fn cover_matches(tools: &Path, work: &Path, file: &Path, mk: &Value, c: &NewCover) -> Result<(), String> {
    let att = attachments_of(mk).into_iter().find(|a| a.name.eq_ignore_ascii_case(&c.name)).ok_or(format!("ไม่เจอ {} ในไฟล์ใหม่", c.name))?;
    if att.mime != c.mime {
        return Err(format!("{} ชนิด {} ที่ใส่ {}", c.name, att.mime, c.mime));
    }
    std::fs::create_dir_all(work).map_err(|e| e.to_string())?;
    let out = work.join(format!("merge-verify-{}", crate::poster_image::unique()));
    let mut target = OsString::from(format!("{}:", att.id));
    target.push(out.as_os_str());
    let r = run_tool_timeout(tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
    let got = std::fs::read(&out).map(|b| crate::probe::hex(&Sha256::digest(&b)));
    let _ = std::fs::remove_file(&out);
    if !tool_succeeded("mkvextract", &r.status) || got.as_deref().ok() != Some(c.sha.as_str()) {
        return Err(format!("{} ที่ดึงออกมาไม่ตรงกับรูปที่ใส่", c.name));
    }
    Ok(())
}

/// ตรวจไฟล์ MP4 ใหม่ · ลำดับ ชนิด (ซับเป็น mov_text) ภาษา ธงหลัก ปก ความยาว
pub fn verify_mp4(tools: &Path, file: &Path, tracks: &[Track], want_cover: bool, movie_duration: Option<f64>) -> Result<Counts, Vec<String>> {
    let mut why = vec![];
    let ff = ffprobe_json(tools, file).map_err(|e| vec![e])?;
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    let got = streams_of(&ff);
    let want_k: Vec<(String, String)> = kept.iter().map(|t| (t.kind.clone(), if t.kind == "subtitle" { "mov_text".into() } else { t.codec.clone() })).collect();
    let got_k: Vec<(String, String)> = got.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
    if want_k != got_k {
        let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
        why.push(format!("แทร็กไม่ตรงที่สั่ง ที่สั่ง {} แต่ไฟล์ใหม่ {}", show(&want_k), show(&got_k)));
    }
    let empty = vec![];
    let fs: Vec<&Value> = ff["streams"].as_array().unwrap_or(&empty).iter()
        .filter(|s| matches!(s["codec_type"].as_str(), Some("video" | "audio" | "subtitle")) && s["disposition"]["attached_pic"].as_i64() != Some(1)).collect();
    let no_main = |k: &str| !kept.iter().any(|t| t.kind == k && t.default);
    for (i, t) in kept.iter().enumerate() {
        let Some(s) = fs.get(i) else { break };
        let first_of_kind = kept.iter().position(|x| x.kind == t.kind) == Some(i);
        let lang = s["tags"]["language"].as_str().unwrap_or("und");
        if lang != t.lang && !(t.lang.is_empty() && lang == "und") {
            why.push(format!("แทร็กที่ {} ภาษา {lang} ที่สั่ง {}", i + 1, t.lang));
        }
        // ไม่ได้เลือกหลักของชนิดนี้ ตัวเขียน MP4 ตั้งแทร็กแรกของชนิดนั้นเป็นหลักเอง ไม่นับว่าผิด
        let want_default = t.default || (first_of_kind && no_main(&t.kind));
        if t.kind != "video" && (s["disposition"]["default"].as_i64() == Some(1)) != want_default {
            why.push(format!("แทร็กที่ {} ธงหลักไม่ตรงที่สั่ง", i + 1));
        }
    }
    if want_cover && !crate::outfile::has_attached_pic(&ff) {
        why.push("ไม่เจอปกในไฟล์ใหม่".into());
    }
    if let (Some(a), Some(b)) = (movie_duration, duration_of(&ff)) {
        if b + 0.2 < a {
            why.push(format!("ไฟล์ใหม่สั้นกว่าหนัง {:.2} กับ {:.2} วินาที", b, a));
        }
    }
    if why.is_empty() { Ok(count(&got)) } else { Err(why) }
}

// ---------------------------------------------------------------- ทำไฟล์ใหม่

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: String,
    percent: f64,
    eta: Option<f64>,
    next: Option<String>,
}

pub struct Produced {
    pub counts: Counts,
    pub verified: bool,
}

/// ปกตั้ง (cover) หรือปกนอน (cover_land) ของไฟล์แนบชื่อนี้
/// ไฟล์ Matroska ไหม (mkvextract ใช้ได้เฉพาะ Matroska) · ดูหัวไฟล์ EBML ไม่เชื่อนามสกุล
fn is_matroska(p: &Path) -> bool {
    use std::io::Read;
    let mut b = [0u8; 4];
    std::fs::File::open(p).and_then(|mut f| f.read_exact(&mut b)).is_ok() && b == [0x1A, 0x45, 0xDF, 0xA3]
}

/// เลขสตรีมรูปปกที่ฝังในไฟล์ (attached_pic ของ ffprobe)
fn attached_pic_index(tools: &Path, p: &Path) -> Option<u64> {
    ffprobe_json(tools, p).ok().and_then(|j| j["streams"].as_array().and_then(|a| a.iter()
        .find(|s| s["disposition"]["attached_pic"].as_i64() == Some(1)).and_then(|s| s["index"].as_u64())))
}

/// แทร็กนี้ทำให้ไฟล์ MP4 ไม่ได้ไหม · แทร็กที่ตั้งแปลงดูชนิดหลังแปลง · แทร็กในหนังแบบเพิ่มคู่ แทร็กเดิมยังอยู่ ต้องใส่ได้ด้วย
/// กติกาเดียวกับหน้าจอ (AvPage mp4Of) · เดิมดูชนิดเดิมเสมอ TrueHD ที่ตั้งแปลงแบบแทนที่ทำ MP4 ไม่ได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 2)
pub fn mp4_unfit(t: &Track) -> bool {
    let orig_bad = t.mp4 == "no" || t.ff.is_none();
    match t.convert.as_ref().filter(|_| t.kind == "audio") {
        Some(spec) => mp4_fit("audio", spec.probe_codec()).0 == "no" || (t.in_movie && t.pair && orig_bad),
        None => orig_bad,
    }
}

fn cover_slot(name: &str) -> Option<&'static str> {
    match crate::probe::att_stem(name).as_str() {
        "cover" => Some("cover"),
        "cover_land" => Some("cover_land"),
        _ => None,
    }
}

/// ทำไฟล์ใหม่ลง partial แล้วตรวจ · ไม่แตะไฟล์เดิม ไม่ย้ายอะไร (ส่วนที่ใช้ได้ในเทสโดยไม่ต้องเปิดโปรแกรม)
#[allow(clippy::too_many_arguments)]
pub fn produce(
    tools: &Path, work: &Path, req: &MergeReq, new_covers: &HashMap<String, (Vec<u8>, String)>, partial: &Path,
    stop: &dyn Fn() -> bool, emit: &dyn Fn(&str, f64, Option<f64>, Option<&str>), notes: &mut Vec<String>, untouched: &str,
) -> Result<Produced, ApplyProblem> {
    let movie = Path::new(&req.movie);
    let mk = mkv_json(tools, movie).map_err(|e| fail("badsource", "อ่านไฟล์หนังไม่ได้", vec![e, untouched.into()]))?;
    let movie_atts = attachments_of(&mk);
    let movie_duration = ffprobe_json(tools, movie).ok().as_ref().and_then(duration_of);
    let mp4 = req.output == "mp4";
    let mut tracks = req.tracks.clone();

    std::fs::create_dir_all(work).map_err(|e| fail("other", "สร้างโฟลเดอร์ชั่วคราวไม่ได้", vec![e.to_string()]))?;
    let mut guards = vec![];
    // ซับ VTT จากไฟล์แยก แปลงเป็น SRT ก่อนใส่ MKV · mkvmerge เก็บ VTT เป็น S_TEXT/WEBVTT ที่ ffmpeg 9 อ่านไม่ได้
    // (ลองแล้ว ffprobe ขึ้น unknown codec · โปรแกรมเล่นที่ใช้ ffmpeg เช่น mpv จะไม่เห็นซับ) · MP4 แปลงเป็น mov_text เองอยู่แล้ว
    if !mp4 {
        for t in tracks.iter_mut().filter(|t| t.keep && !t.in_movie && t.codec == "webvtt") {
            let srt = work.join(format!("merge-vtt-{}.srt", crate::poster_image::unique()));
            let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-i"].iter().map(OsString::from)
                .chain([OsString::from(&t.src)]).chain(["-map".into(), format!("0:{}", t.ff.unwrap_or(0)).into(), "-c:s".into(), "srt".into()])
                .chain([srt.as_os_str().to_owned()]).collect();
            let ok = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120)).map(|o| o.status.success()).unwrap_or(false);
            if !ok || !srt.exists() {
                return Err(fail("tool", "แปลงซับ VTT เป็น SRT ไม่สำเร็จ", vec![t.src.clone(), untouched.into()]));
            }
            guards.push(scopeguard(srt.clone()));
            notes.push(format!("ซับ {} แปลงเป็น SRT ก่อนใส่ MKV เพราะโปรแกรมเล่นหลายตัวยังไม่รู้จัก VTT ใน MKV", Path::new(&t.src).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()));
            t.src = srt.to_string_lossy().to_string();
            t.tid = 0;
            t.ff = Some(0);
            t.codec = "subrip".into();
            t.charset = Some("UTF-8".into());
        }
    }

    // แปลงชนิดเสียงก่อนรวม (ช่วงที่นานสุด) · ไฟล์ที่แปลงอยู่โฟลเดอร์ชั่วคราว รวมเสร็จแล้วลบเอง
    // แทร็กในหนังแบบเพิ่มคู่ เก็บแทร็กเดิมไว้ แทร็กใหม่ต่อท้ายแทร็กเดิม · แบบแทนที่และไฟล์ที่เพิ่ม ใช้แทร็กใหม่แทน
    let total_conv = tracks.iter().filter(|t| t.keep && t.kind == "audio" && t.convert.is_some()).count();
    if total_conv > 0 {
        // ตัวแปลงที่ใส่เองในโฟลเดอร์ตัวแปลง (qaac fdkaac หรือรุ่นใหม่กว่า) · ไม่มีโฟลเดอร์ก็ใช้ตัวที่แนบมา
        let user = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("ชั้นหนัง").join("ตัวแปลง")).unwrap_or_default();
        let encs = crate::encode::status(tools, &user);
        let mut n = 0;
        let mut list = vec![];
        for t in tracks.into_iter() {
            let Some(spec) = t.convert.clone().filter(|_| t.keep && t.kind == "audio") else { list.push(t); continue };
            n += 1;
            let out = work.join(format!("merge-conv-{}.{}", crate::poster_image::unique(), spec.ext()));
            let mut spec = spec;
            spec.src_rate = t.rate.map(|r| r as u32);
            let plan = crate::encode::build(&spec, &t.src, t.ff.unwrap_or(t.tid), &out.to_string_lossy(), t.channels.map(|c| c as u32), t.bits.map(|b| b as u32))
                .map_err(|e| fail("tool", "ตั้งค่าแปลงเสียงไม่ถูก", vec![e, untouched.into()]))?;
            let ft = spec.codec.to_uppercase();
            let phase = format!("กำลังแปลงเสียง {n} จาก {total_conv} เป็น {ft}");
            let next = if n < total_conv { "แปลงเสียงถัดไป" } else { "รวมเข้าไฟล์ใหม่" };
            emit(&phase, 0.0, None, Some(next));
            let t0 = Instant::now();
            guards.push(scopeguard(out.clone()));
            let r = crate::encode::run(&|name| crate::encode::dir_for(&encs, tools, name), &plan, t.duration.or(movie_duration), stop, &mut |p| emit(&phase, p, eta(t0, p), Some(next)))
                .map_err(|e| fail("tool", "แปลงเสียงไม่สำเร็จ", vec![e, untouched.into()]))?;
            match r {
                crate::encode::Done::Ok => {}
                crate::encode::Done::Cancelled => return Err(cancelled(untouched, None)),
                crate::encode::Done::Failed(m) => return Err(fail("tool", "แปลงเสียงไม่สำเร็จ", vec![m, untouched.into()])),
            }
            let mut nt = t.clone();
            nt.src = out.to_string_lossy().to_string();
            nt.tid = 0;
            nt.ff = Some(0);
            nt.codec = spec.probe_codec().to_string();
            let (fit, why) = mp4_fit("audio", &nt.codec);
            nt.mp4 = fit.into();
            nt.why = why;
            nt.in_movie = false;
            nt.convert = None;
            nt.charset = None;
            if t.in_movie && t.pair {
                nt.default = false;
                nt.name = if t.conv_name.trim().is_empty() { format!("{} {ft}", t.name).trim().to_string() } else { t.conv_name.clone() };
                let mut old = t;
                old.convert = None;
                list.push(old);
                notes.push(format!("แปลงเสียงเป็น {ft} เพิ่มคู่กับแทร็กเดิม"));
            } else {
                notes.push(format!("แปลงเสียงเป็น {ft}"));
            }
            list.push(nt);
        }
        tracks = list;
    }

    // รูปปกใหม่เขียนลงโฟลเดอร์ชั่วคราว
    let mut covers: Vec<NewCover> = vec![];
    for (slot, plan) in [("cover", &req.covers.portrait), ("cover_land", &req.covers.land)] {
        if plan != "new" {
            continue;
        }
        let Some((bytes, fmt)) = new_covers.get(slot) else {
            return Err(fail("nocover", "ยังไม่ได้ใส่รูปปก", vec![format!("ช่อง{} ตั้งว่าใช้รูปใหม่ แต่ยังไม่มีรูป", if slot == "cover" { "ปกตั้ง" } else { "ปกนอน" }), untouched.into()]));
        };
        let fmt = if fmt == "png" { "png" } else { "jpg" };
        let file = work.join(format!("merge-{slot}-{}.{fmt}", crate::poster_image::unique()));
        std::fs::write(&file, bytes).map_err(|e| fail("other", "เขียนรูปปกไม่ได้", vec![e.to_string()]))?;
        guards.push(scopeguard(file.clone()));
        covers.push(NewCover {
            name: format!("{slot}.{fmt}"), mime: if fmt == "png" { "image/png".into() } else { "image/jpeg".into() }, file, sha: crate::probe::hex(&Sha256::digest(bytes)),
        });
    }
    // ไฟล์แนบของหนังที่เก็บไว้ · ปกช่องที่ใส่ใหม่หรือเอาออก ไม่เก็บ · ไฟล์แนบอื่น (ฟอนต์ของซับ ASS) เก็บทั้งหมด
    let drop_slot = |slot: &str| if slot == "cover" { req.covers.portrait != "keep" } else { req.covers.land != "keep" };
    let kept_atts: Vec<&Attachment> = movie_atts.iter().filter(|a| cover_slot(&a.name).map(|s| !drop_slot(s)).unwrap_or(true)).collect();
    for a in movie_atts.iter().filter(|a| cover_slot(&a.name).map(drop_slot).unwrap_or(false)) {
        let replaced = covers.iter().any(|c| cover_slot(&c.name) == cover_slot(&a.name));
        notes.push(if replaced { format!("รูปปก {} เดิมเปลี่ยนเป็นรูปใหม่", a.name) } else { format!("เอารูปปก {} ออก", a.name) });
    }
    // ไฟล์แนบของไฟล์ที่เพิ่ม (เช่น MKS ที่มีฟอนต์ของซับ) เก็บเฉพาะที่ไม่ใช่รูปปก
    let mut other_atts: HashMap<String, Vec<u64>> = HashMap::new();
    let mut other_names: Vec<String> = vec![];
    for src in inputs_of(&req.movie, &tracks).iter().skip(1) {
        let ext = Path::new(src).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if matches!(ext.as_str(), "mkv" | "mka" | "mks" | "mk3d" | "webm") {
            if let Ok(j) = mkv_json(tools, Path::new(src)) {
                let keep: Vec<Attachment> = attachments_of(&j).into_iter().filter(|a| cover_slot(&a.name).is_none()).collect();
                other_names.extend(keep.iter().map(|a| a.name.clone()));
                other_atts.insert(src.clone(), keep.iter().map(|a| a.id).collect());
            }
        }
    }

    // ฟอนต์ของซับ ASS ที่เลือกฝัง (fonts.rs · พี่กันสั่ง 8 พ.ย. 2569) · ชื่อไฟล์ซ้ำกับไฟล์แนบที่มีอยู่แล้วไม่ใส่ซ้ำ · MP4 ใส่ไม่ได้
    let mut fonts: Vec<NewCover> = vec![];
    if !mp4 {
        for f in &req.fonts {
            let p = PathBuf::from(f);
            let is_font = p.extension().map(|e| crate::fonts::FONT_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false);
            if !is_font || !p.is_file() {
                return Err(fail("other", "หาไฟล์ฟอนต์ไม่เจอ", vec![f.clone(), "เอาฟอนต์นี้ออกจากการ์ดฟอนต์ หรือลากไฟล์ฟอนต์มาใหม่".into(), untouched.into()]));
            }
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let taken = kept_atts.iter().any(|a| a.name.eq_ignore_ascii_case(&name)) || other_names.iter().any(|n| n.eq_ignore_ascii_case(&name)) || fonts.iter().any(|c| c.name.eq_ignore_ascii_case(&name));
            if taken {
                notes.push(format!("ฟอนต์ {name} มีในไฟล์แนบอยู่แล้ว ไม่ใส่ซ้ำ"));
                continue;
            }
            fonts.push(NewCover { name, mime: crate::fonts::mime_of(&p).into(), file: p, sha: String::new() });
        }
        if !fonts.is_empty() {
            notes.push(format!("ฝังฟอนต์ของซับ {} ไฟล์ {}", fonts.len(), fonts.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(" ")));
        }
    }

    let total = movie_duration.unwrap_or(0.0);
    let (tool, args, mp4_cover) = if mp4 {
        // MP4 เก็บปกได้รูปเดียว ใช้ปกตั้ง · ปกนอนกับฟอนต์ใส่ไม่ได้ บอกในผล
        let cover = if let Some(c) = covers.iter().find(|c| c.name.starts_with("cover.")) {
            Some(Mp4Cover::File(c.file.clone()))
        } else if req.covers.portrait == "keep" {
            // mkvmerge รายงานปกที่ฝังใน MP4 เป็นไฟล์แนบชื่อ cover.jpg ด้วย แต่ mkvextract เปิดได้เฉพาะ Matroska
            // (ผู้ช่วยตรวจขั้น 10 ข้อ 1 · ลองแล้ว mkvextract กับ MP4 ตอบ Not a valid Matroska file รหัส 2 · เดิมปกหายเงียบ ตรวจไฟล์ใหม่ผ่าน)
            let had_cover = kept_atts.iter().any(|a| cover_slot(&a.name) == Some("cover"));
            let found = if let Some(a) = kept_atts.iter().find(|a| cover_slot(&a.name) == Some("cover")).filter(|_| is_matroska(movie)) {
                // ปกเดิมที่เป็นไฟล์แนบของ MKV ดึงออกมาเป็นไฟล์ก่อน
                let out = work.join(format!("merge-oldcover-{}.{}", crate::poster_image::unique(), Path::new(&a.name).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or("jpg".into())));
                let mut target = OsString::from(format!("{}:", a.id));
                target.push(out.as_os_str());
                let ok = run_tool_timeout(tools, "mkvextract", [movie.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))
                    .map(|r| tool_succeeded("mkvextract", &r.status)).unwrap_or(false);
                guards.push(scopeguard(out.clone()));
                ok.then_some(Mp4Cover::File(out))
            } else {
                // หนัง MP4 MOV ที่มีปกฝังอยู่แล้ว ใช้สตรีมรูปปกของ ffprobe
                attached_pic_index(tools, movie).map(Mp4Cover::Stream)
            };
            // หนังมีปกแต่ดึงไม่ได้ ไม่ทำต่อเงียบ ๆ ให้ปกหายจากไฟล์ใหม่
            if had_cover && found.is_none() {
                return Err(fail("tool", "ดึงรูปปกเดิมของหนังไม่ได้", vec!["ไม่ได้รวม เพื่อไม่ให้ปกหายจากไฟล์ใหม่".into(), "เลือกเอาปกออก หรือใส่รูปปกใหม่ แล้วรวมอีกครั้ง".into(), untouched.into()]));
            }
            found
        } else {
            None
        };
        if covers.iter().any(|c| c.name.starts_with("cover_land")) || kept_atts.iter().any(|a| cover_slot(&a.name) == Some("cover_land")) {
            notes.push("MP4 เก็บรูปปกได้รูปเดียว ใช้ปกตั้ง ปกนอนไม่ได้ใส่".into());
        }
        if kept_atts.iter().any(|a| cover_slot(&a.name).is_none()) || !other_names.is_empty() || !req.fonts.is_empty() {
            notes.push("MP4 เก็บไฟล์แนบไม่ได้ ฟอนต์ของซับไม่ได้ใส่".into());
        }
        // MP4 ตั้งแทร็กแรกของแต่ละชนิดเป็นหลักเอง เมื่อไม่ได้เลือกแทร็กหลักของชนิดนั้น (กติกาของตัวเขียน MP4 ใน ffmpeg)
        if tracks.iter().any(|t| t.keep && t.kind == "subtitle") && !tracks.iter().any(|t| t.keep && t.kind == "subtitle" && t.default) {
            notes.push("ไม่ได้เลือกซับหลัก MP4 ตั้งซับแรกเป็นหลักเอง โปรแกรมเล่นบางตัวจะเปิดซับนี้ให้".into());
        }
        let args = mp4_args(&req.movie, &tracks, cover.as_ref(), partial);
        ("ffmpeg", args, cover.is_some())
    } else {
        let ids: Vec<u64> = kept_atts.iter().map(|a| a.id).collect();
        ("mkvmerge", mkv_args(&req.movie, &tracks, &ids, &other_atts, &covers, &fonts, partial), false)
    };

    let _ = std::fs::remove_file(partial); // .partial ของรอบก่อนที่ค้าง เป็นของโปรแกรมเอง
    let phase = if mp4 { "กำลังรวมเป็น MP4" } else { "กำลังรวมเข้าไฟล์ใหม่" };
    let next = req.check_output.then_some("ตรวจไฟล์ใหม่");
    emit(phase, 0.0, None, next);
    let t0 = Instant::now();
    let mut last = Instant::now() - Duration::from_secs(1);
    let mut tool_errors: Vec<String> = vec![];
    let r = run_live(tools, tool, &args, stop, &mut |l| {
        let pct = if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
            Some(p)
        } else if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
            (total > 0.0).then(|| (us / 1e6 / total * 100.0).clamp(0.0, 100.0))
        } else {
            if l.starts_with("#GUI#error") || l.starts_with("Error:") { tool_errors.push(l.to_string()); }
            None
        };
        if let Some(p) = pct {
            if last.elapsed() >= Duration::from_millis(100) {
                last = Instant::now();
                emit(phase, p, eta(t0, p), next);
            }
        }
    }).map_err(|e| { let _ = std::fs::remove_file(partial); fail("tool", "เรียกเครื่องมือไม่ได้", vec![e, untouched.into()]) })?;
    match r {
        Run::Cancelled => {
            let _ = std::fs::remove_file(partial);
            return Err(cancelled(untouched, Some(partial)));
        }
        Run::Done(status, stderr) => {
            if !tool_succeeded(tool, &status) || !partial.exists() {
                let _ = std::fs::remove_file(partial);
                let msg = tool_errors.first().cloned().or_else(|| stderr.lines().find(|l| !l.trim().is_empty()).map(String::from)).unwrap_or_default();
                return Err(fail("tool", if mp4 { "รวมเป็น MP4 ไม่สำเร็จ" } else { "รวมเข้าไฟล์ใหม่ไม่สำเร็จ" }, vec![msg.chars().take(200).collect(), untouched.into()]));
            }
        }
    }
    emit(phase, 100.0, Some(0.0), next);

    let mut att_names: Vec<String> = kept_atts.iter().map(|a| a.name.clone()).collect();
    att_names.extend(other_names);
    att_names.extend(fonts.iter().map(|c| c.name.clone()));
    if req.check_output {
        emit("กำลังตรวจไฟล์ใหม่", 100.0, None, None);
        let r = if mp4 { verify_mp4(tools, partial, &tracks, mp4_cover, movie_duration) } else { verify_mkv(tools, work, partial, &tracks, &att_names, &covers, movie_duration) };
        match r {
            Ok(counts) => Ok(Produced { counts, verified: true }),
            Err(mut why) => {
                let _ = std::fs::remove_file(partial);
                why.push("ลบไฟล์ใหม่ที่ไม่ผ่านแล้ว".into());
                why.push(untouched.into());
                Err(fail("verify", "ไฟล์ใหม่ตรวจไม่ผ่าน", why))
            }
        }
    } else {
        let counts = ffprobe_json(tools, partial).map(|j| count(&streams_of(&j))).unwrap_or_default();
        Ok(Produced { counts, verified: false })
    }
}

// ---------------------------------------------------------------- คำสั่งของหน้าจอ

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    /// mkv | mp4
    mode: String,
    output: String,
    counts: Counts,
    verified: bool,
    /// kept | trash | none
    original: String,
    original_to: Option<String>,
    notes: Vec<String>,
}

#[tauri::command]
pub fn merge_cancel(st: State<'_, MergeState>) {
    st.cancel.store(true, Ordering::SeqCst);
}

/// รวมตามที่ตั้ง · คืนผลเมื่อเสร็จ ความคืบหน้าส่งทางเหตุการณ์ merge-progress
#[tauri::command]
pub async fn merge_apply(app: AppHandle, req: MergeReq) -> Result<MergeResult, ApplyProblem> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<MergeState>();
        if st.running.swap(true, Ordering::SeqCst) {
            return Err(fail("other", "กำลังรวมไฟล์อีกเรื่องอยู่", vec!["รอให้เสร็จก่อน".into()]));
        }
        st.cancel.store(false, Ordering::SeqCst);
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let r = apply(&app, &req, &jobs);
        st.running.store(false, Ordering::SeqCst);
        r
    }).await.map_err(|e| fail("other", "รวมไฟล์ไม่สำเร็จ", vec![e.to_string()]))?
}

fn apply(app: &AppHandle, req: &MergeReq, jobs: &Arc<crate::jobs::Jobs>) -> Result<MergeResult, ApplyProblem> {
    let st = app.state::<MergeState>();
    let (tools, work) = tools_of(app).map_err(|e| fail("other", "รวมไฟล์ไม่สำเร็จ", vec![e]))?;
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>, next: Option<&str>| {
        let _ = app.emit("merge-progress", Progress { phase: phase.into(), percent, eta, next: next.map(String::from) });
    };
    let src = PathBuf::from(&req.movie);
    let src_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {src_name} ไม่ถูกแตะ");
    let dir = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let src_size = std::fs::metadata(&src).map_err(|_| fail("other", "หาไฟล์หนังไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]))?.len();
    let mp4 = req.output == "mp4";
    let kept: Vec<&Track> = req.tracks.iter().filter(|t| t.keep).collect();
    if !kept.iter().any(|t| t.kind == "video") {
        return Err(fail("other", "ไฟล์ใหม่ต้องมีภาพ", vec!["เอาแทร็กภาพกลับมาก่อน".into(), untouched]));
    }
    // ไฟล์ที่เพิ่มต้องยังอยู่
    for s in inputs_of(&req.movie, &req.tracks).iter().skip(1) {
        if !Path::new(s).exists() {
            return Err(fail("other", "หาไฟล์ที่เพิ่มไม่เจอ", vec![s.clone(), "ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้าย".into(), untouched]));
        }
    }
    if !not_in_use(&src) {
        return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched]));
    }
    // MP4 · แทร็กที่ใส่ไม่ได้ต้องเอาออกก่อน (หน้าจอถามแล้วเอาออกให้)
    if mp4 {
        let bad: Vec<String> = kept.iter().filter(|t| mp4_unfit(t))
            .map(|t| format!("{} {} {}", kind_word(&t.kind), t.codec, t.why.clone().unwrap_or_else(|| "ใส่ใน MP4 ไม่ได้".into()))).collect();
        if !bad.is_empty() {
            let mut d = bad;
            d.push(untouched);
            return Err(fail("mp4", format!("มีแทร็กที่ใส่ใน MP4 ไม่ได้ {} อัน", d.len() - 1), d));
        }
    }
    let target = dir.join(format!("{}.{}", src.file_stem().unwrap_or_default().to_string_lossy(), if mp4 { "mp4" } else { "mkv" }));
    let same_name = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if !same_name && target.exists() {
        return Err(fail("exists", "มีไฟล์ชื่อนี้อยู่แล้ว ไม่เขียนทับ", vec![target.to_string_lossy().to_string(), untouched]));
    }
    let partial = PathBuf::from(format!("{}.partial", target.to_string_lossy()));
    if target.to_string_lossy().encode_utf16().count() + 8 > MAX_PATH_LEN {
        return Err(fail("other", "ที่อยู่ไฟล์ยาวเกินไป", vec!["เปลี่ยนชื่อไฟล์ให้สั้นลงก่อน".into(), untouched]));
    }
    // ที่ว่าง · ราวขนาดหนัง บวกไฟล์ที่เพิ่ม บวกรูปปก บวกเสียงที่แปลง
    let added: u64 = inputs_of(&req.movie, &req.tracks).iter().skip(1).filter_map(|s| std::fs::metadata(s).ok()).map(|m| m.len()).sum();
    let cover_bytes: u64 = st.covers.lock().unwrap().values().map(|c| c.0.len() as u64).sum::<u64>()
        + req.fonts.iter().filter_map(|f| std::fs::metadata(f).ok()).map(|m| m.len()).sum::<u64>();
    let conv: u64 = req.tracks.iter().filter(|t| t.keep && t.kind == "audio").filter_map(conv_estimate).sum();
    let need = src_size + added + cover_bytes + conv + 64 * 1024 * 1024;
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }
    // เสียงที่แปลงเขียนลงโฟลเดอร์ชั่วคราวของโปรแกรม (ไดรฟ์ C) ก่อนรวม · ไดรฟ์นั้นต้องมีที่พอด้วย
    if conv > 0 {
        let wfree = free_space(work.parent().unwrap_or(&work));
        let wneed = conv + 64 * 1024 * 1024;
        // ไดรฟ์เดียวกับหนัง เสียงที่แปลงอยู่ในโฟลเดอร์ชั่วคราวพร้อมไฟล์ใหม่ที่มีเสียงนี้ ต้องใช้สองเท่า (ผู้ช่วยตรวจขั้น 10 ข้อ 12)
        if drive_letter(&work) == drive_letter(&dir) && free < need + conv {
            return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} (รวมไฟล์เสียงที่แปลงในโฟลเดอร์ชั่วคราว) แต่เหลือ {}", fmt_gb(need + conv), fmt_gb(free)), untouched]));
        }
        if drive_letter(&work) != drive_letter(&dir) && wfree < wneed {
            return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอสำหรับไฟล์เสียงที่แปลง", drive_letter(&work)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(wneed), fmt_gb(wfree)), untouched]));
        }
    }
    // ตรวจไฟล์ต้นทางก่อน · อ่านทุกแพ็กเก็ตโดยไม่ถอดภาพ (แบบหน้าใส่โปสเตอร์)
    if req.check_source {
        let total = ffprobe_json(&tools, &src).ok().as_ref().and_then(duration_of).unwrap_or(0.0);
        emit("กำลังตรวจไฟล์ต้นทาง", 0.0, None, Some("รวมเข้าไฟล์ใหม่"));
        let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from)
            .chain([src.as_os_str().to_owned()]).chain(["-map", "0", "-c", "copy", "-f", "null", "-"].iter().map(OsString::from)).collect();
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let r = run_live(&tools, "ffmpeg", &args, &stop, &mut |l| {
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
                if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    let pct = (us / 1e6 / total * 100.0).clamp(0.0, 100.0);
                    emit("กำลังตรวจไฟล์ต้นทาง", pct, eta(t0, pct), Some("รวมเข้าไฟล์ใหม่"));
                }
            }
        }).map_err(|e| fail("tool", "ตรวจไฟล์ต้นทางไม่สำเร็จ", vec![e, untouched.clone()]))?;
        match r {
            Run::Cancelled => return Err(cancelled(&untouched, None)),
            Run::Done(status, stderr) => {
                let errs: Vec<&str> = stderr.lines().map(str::trim)
                    .filter(|l| !l.is_empty() && !l.contains("non monotonically increasing dts") && !l.contains("Timestamps are unset")).collect();
                if !status.success() || !errs.is_empty() {
                    return Err(fail("badsource", "ไฟล์ต้นทางมีที่เสียอยู่แล้ว", vec![
                        errs.first().map(|e| e.chars().take(120).collect()).unwrap_or_else(|| "อ่านไฟล์ไม่จบ".into()),
                        "ปิดตัวเลือก ตรวจไฟล์ต้นทางก่อน ถ้าต้องการทำต่อ".into(), untouched,
                    ]));
                }
            }
        }
    }

    let mut notes = vec![];
    let new_covers = st.covers.lock().unwrap().clone();
    let made = produce(&tools, &work, req, &new_covers, &partial, &stop, &emit, &mut notes, &untouched)?;
    // กดหยุดระหว่างตรวจไฟล์ใหม่ · หยุดจริงก่อนแตะไฟล์เดิม ตามที่ข้อความยืนยันหยุดบอก (ผู้ช่วยตรวจขั้น 10 ข้อ 9)
    if stop() {
        let _ = std::fs::remove_file(&partial);
        return Err(cancelled(&untouched, None));
    }
    // การจับคู่เก็บไว้กับเรื่องเดิม · ไฟล์ใหม่คนละชื่อ (เช่น MP4 เป็น MKV) การจับคู่ไม่ตามไป บอกในผล (ข้อ 13)
    let old_pairs = { let lib = app.state::<Arc<crate::library::LibraryStore>>(); let k = src.to_string_lossy().to_lowercase(); lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == k).map(|m| m.pairs.len()).unwrap_or(0) };
    // เช็กซ้ำก่อนย้ายไฟล์เดิม · ระหว่างรวมผู้ใช้อาจเปิดหนังเรื่องนี้ดู
    let (original, original_to) = finish_output(app, &src, &target, &partial, &req.original, made.verified, &untouched, &mut notes)?;
    if old_pairs > 0 && !target.to_string_lossy().eq_ignore_ascii_case(&src.to_string_lossy()) {
        notes.push(format!("เรื่องเดิมจับคู่เสียงหรือซับไว้ {old_pairs} ไฟล์  ไฟล์ใหม่ชื่อนามสกุลต่างจากเดิม การจับคู่จึงไม่ตามไป แต่จับคู่ใหม่ได้ที่หน้านี้"));
    }
    // ไฟล์ใหม่ชื่อเดิม จดขนาดกับค่า hash ใหม่เป็นงานของโปรแกรมเอง ไม่ให้ชั้นวางขึ้นว่าไฟล์ถูกเปลี่ยนหลังตรวจ (ข้อ 14 · แบบหน้าใส่โปสเตอร์)
    if target.to_string_lossy().eq_ignore_ascii_case(&src.to_string_lossy()) {
        emit("กำลังจดข้อมูลไฟล์ใหม่", 100.0, None, None);
        crate::library::refresh_own_edit(app, &target, &|pct| emit("กำลังจดค่า hash ใหม่", pct, None, None));
    }
    // ใส่รูปปกใหม่เข้าไฟล์แล้ว ล้างช่องรูป ไม่ให้ติดไปเรื่องถัดไป
    st.covers.lock().unwrap().clear();
    let lib = app.state::<Arc<crate::library::LibraryStore>>();
    let _ = crate::library::scan_library(app.clone(), lib);
    Ok(MergeResult {
        mode: req.output.clone(), output: target.to_string_lossy().to_string(), counts: made.counts, verified: made.verified, original, original_to, notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::outfile::mkv_attachments;

    fn tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }

    /// ไฟล์ทดสอบชุดเสียงซับ · ไม่มีไฟล์ = เทสล้มพร้อมบอกวิธีสร้าง · ตั้ง MOVIE_SHELF_SKIP_MEDIA=1 ถ้าตั้งใจข้าม
    fn av(name: &str) -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join(name);
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }

    /// โฟลเดอร์ชั่วคราวที่ลบตัวเองตอนจบ แม้เทสล้ม
    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn temp_dir(tag: &str) -> TempDir {
        let d = std::env::temp_dir().join(format!("movie-shelf-merge-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        TempDir(d)
    }

    fn run(req: &MergeReq, covers: &HashMap<String, (Vec<u8>, String)>, out: &Path, work: &Path) -> (Result<Produced, ApplyProblem>, Vec<String>) {
        let mut notes = vec![];
        let r = produce(&tools(), work, req, covers, out, &|| false, &|_, _, _, _| {}, &mut notes, "ไม่แตะ");
        (r, notes)
    }

    fn req(movie: &Path, tracks: Vec<Track>, output: &str) -> MergeReq {
        MergeReq { movie: movie.to_string_lossy().to_string(), tracks, covers: CoverPlan::default(), output: output.into(), original: "keep".into(), check_source: false, check_output: true, fonts: vec![] }
    }

    /// เวลาของแพ็กเก็ตแรกที่มีเนื้อ · ข้ามแพ็กเก็ตว่าง (ซับ mov_text ใน MP4 มีแพ็กเก็ตว่าง 2 ไบต์คั่นช่วงที่ไม่มีซับ เริ่มที่วินาที 0)
    fn first_packet(file: &Path, sel: &str) -> f64 {
        let o = crate::tools::run_tool(&tools(), "ffprobe", ["-v", "error", "-select_streams", sel, "-show_entries", "packet=pts_time,size", "-of", "csv=p=0"].iter().map(OsString::from).chain([file.as_os_str().to_owned()])).unwrap();
        String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| {
            let mut it = l.trim().trim_end_matches(',').split(',');
            let t: f64 = it.next()?.parse().ok()?;
            let size: u64 = it.next()?.parse().ok()?;
            (size > 2).then_some(t)
        }).next().unwrap_or(f64::NAN)
    }

    #[test]
    fn delay_words_from_file_names() {
        assert_eq!(delay_from_name("ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), Some(-120));
        assert_eq!(delay_from_name("Movie.T01 3_2ch 448Kbps DELAY 250ms.ac3"), Some(250));
        assert_eq!(delay_from_name("movie delay +48 ms.dts"), Some(48));
        assert_eq!(delay_from_name("movie_Delay_-1001ms.eac3"), Some(-1001));
        assert_eq!(delay_from_name("movie DELAY 0ms.ac3"), Some(0));
        assert_eq!(delay_from_name("Delayed Gratification (2020).ac3"), None);
        assert_eq!(delay_from_name("movie.delay2x.ac3"), None);
        assert_eq!(delay_from_name("movie.th.srt"), None);
        assert_eq!(delay_from_name("movie DELAY 9999999ms.ac3"), None, "เกิน 10 นาทีไม่เชื่อ");
    }

    #[test]
    fn language_from_file_names() {
        assert_eq!(lang_from_name("ดาวตก (2024) พากย์ไทย DELAY -120ms"), Some("tha"));
        assert_eq!(lang_from_name("ดาวตก (2024).th"), Some("tha"));
        assert_eq!(lang_from_name("ดาวตก (2024).tis620.th"), Some("tha"));
        assert_eq!(lang_from_name("Polaris.2023.eng.forced"), Some("eng"));
        assert_eq!(lang_from_name("Polaris.2023.en"), Some("eng"));
        assert_eq!(lang_from_name("Polaris 2023 Thai Dub"), Some("tha"));
        assert_eq!(lang_from_name("Polaris.2023.JPN"), Some("jpn"));
        assert_eq!(lang_from_name("ซับอังกฤษ"), Some("eng"));
        assert_eq!(lang_from_name("It Follows (2014)"), None, "it ต้นชื่อไม่ใช่ภาษาอิตาลี");
        assert_eq!(lang_from_name("Polaris.2023.Commentary"), None);
        assert_eq!(lang_from_name("My Neighbor (1988)"), None);
    }

    #[test]
    fn subtitle_charsets() {
        let Some(utf) = av("เสียงซับ/ดาวตก (2024).th.srt") else { return };
        let tis = av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap();
        assert_eq!(sub_charset(&utf).as_deref(), Some("UTF-8"));
        assert_eq!(sub_charset(&tis).as_deref(), Some("CP874"));
        assert_eq!(sub_charset(&av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap()), None, "ไฟล์เสียงไม่มีชุดอักษร");
    }

    fn t(src: &str, tid: u64, kind: &str, codec: &str) -> Track {
        Track { src: src.into(), tid, ff: Some(tid), kind: kind.into(), codec: codec.into(), lang: "und".into(), keep: true, mp4: "ok".into(), ..Default::default() }
    }

    #[test]
    fn mkvmerge_command_order_flags_delay() {
        let mut v = t("M.mkv", 0, "video", "h264");
        v.in_movie = true;
        let mut a1 = t("M.mkv", 1, "audio", "aac");
        a1.in_movie = true;
        a1.lang = "eng".into();
        let mut s_old = t("M.mkv", 2, "subtitle", "hdmv_pgs_subtitle");
        s_old.in_movie = true;
        s_old.keep = false;
        let mut dub = t("D.ac3", 0, "audio", "ac3");
        dub.lang = "tha".into();
        dub.name = "พากย์ไทย 5.1".into();
        dub.default = true;
        dub.delay = -120;
        let mut sub = t("S.srt", 0, "subtitle", "subrip");
        sub.lang = "tha".into();
        sub.delay = 500;
        sub.charset = Some("CP874".into());
        // ลำดับใหม่ ภาพ พากย์ไทย อังกฤษ ซับไทย (ซับรูปเดิมเอาออก)
        let tracks = vec![v, dub, a1, s_old, sub];
        let cover = NewCover { name: "cover_land.jpg".into(), mime: "image/jpeg".into(), file: PathBuf::from("C.jpg"), sha: String::new() };
        let font = NewCover { name: "f01.ttf".into(), mime: "font/ttf".into(), file: PathBuf::from("F.ttf"), sha: String::new() };
        let args: Vec<String> = mkv_args("M.mkv", &tracks, &[3], &HashMap::new(), &[cover], &[font], Path::new("OUT.mkv.partial")).iter().map(|a| a.to_string_lossy().to_string()).collect();
        let s = args.join(" ");
        assert!(s.starts_with("--gui-mode --ui-language en -o OUT.mkv.partial -d 0 -a 1 -S --attachments 3 --language 0:und"), "{s}");
        assert!(s.contains("--track-name 1: --default-track-flag 1:0 --forced-display-flag 1:0 M.mkv"), "ชื่อว่างกับธงของเสียงเดิม {s}");
        assert!(s.contains("-D -a 0 -S --no-attachments --no-chapters --no-global-tags --language 0:tha --track-name 0:พากย์ไทย 5.1 --default-track-flag 0:1 --forced-display-flag 0:0 --sync 0:-120 D.ac3"), "{s}");
        assert!(s.contains("-D -A -s 0 --no-attachments --no-chapters --no-global-tags --language 0:tha --track-name 0: --default-track-flag 0:0 --forced-display-flag 0:0 --sync 0:500 --sub-charset 0:CP874 S.srt"), "{s}");
        assert!(s.contains("--attachment-name cover_land.jpg --attachment-mime-type image/jpeg --attach-file C.jpg --attachment-name f01.ttf --attachment-mime-type font/ttf --attach-file F.ttf"), "ฟอนต์ของซับแนบต่อจากปก {s}");
        assert!(s.ends_with("--track-order 0:0,1:0,0:1,2:0"), "ลำดับ ภาพ พากย์ไทย อังกฤษ ซับ {s}");
        // ไม่มีไฟล์แนบเหลือ → --no-attachments
        let args2: Vec<String> = mkv_args("M.mkv", &tracks, &[], &HashMap::new(), &[], &[], Path::new("O")).iter().map(|a| a.to_string_lossy().to_string()).collect();
        assert!(args2.join(" ").contains("-d 0 -a 1 -S --no-attachments --language"));
    }

    #[test]
    fn ffmpeg_mp4_command_offsets_per_input() {
        let mut v = t("M.mkv", 0, "video", "h264");
        v.in_movie = true;
        let mut a1 = t("M.mkv", 1, "audio", "aac");
        a1.in_movie = true;
        a1.delay = 200; // เสียงเดิมของหนังเลื่อน ต้องเปิดหนังเป็นไฟล์ต้นทางอีกช่องที่มี -itsoffset
        let mut dub = t("D.ac3", 0, "audio", "ac3");
        dub.delay = -120;
        dub.default = true;
        let mut sub = t("S.srt", 0, "subtitle", "subrip");
        sub.charset = Some("CP874".into());
        sub.lang = "tha".into();
        let args: Vec<String> = mp4_args("M.mkv", &[v, a1, dub, sub], Some(&Mp4Cover::File(PathBuf::from("C.jpg"))), Path::new("O.mp4.partial"))
            .iter().map(|a| a.to_string_lossy().to_string()).collect();
        let s = args.join(" ");
        assert!(s.contains("-n -v error"), "ไม่เขียนทับ {s}");
        assert!(s.contains("-i M.mkv -itsoffset 0.200 -i M.mkv -itsoffset -0.120 -i D.ac3 -sub_charenc CP874 -i S.srt -i C.jpg"), "{s}");
        assert!(s.contains("-map 0:0 -map 1:1 -map 2:0 -map 3:0 -map 4:0 -c copy -c:s mov_text"), "{s}");
        assert!(s.contains("-metadata:s:3 language=tha"), "{s}");
        assert!(s.contains("-disposition:2 default"), "{s}");
        assert!(s.contains("-disposition:1 0"), "{s}");
        assert!(s.contains("-disposition:4 attached_pic"), "{s}");
        assert!(s.ends_with("-map_metadata 0 -map_chapters 0 -f mp4 O.mp4.partial"), "{s}");
    }

    #[test]
    fn probe_movie_and_added_files() {
        let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
        let m = inspect(&tools(), &movie).unwrap();
        assert_eq!(m.tracks.len(), 2);
        assert!(m.mp4_ok);
        assert_eq!((m.tracks[0].kind.as_str(), m.tracks[0].codec.as_str(), m.tracks[0].ff), ("video", "h264", Some(0)));
        assert_eq!((m.tracks[1].kind.as_str(), m.tracks[1].codec.as_str(), m.tracks[1].lang.as_str(), m.tracks[1].name.as_str()), ("audio", "aac", "eng", "English"));
        assert!((m.duration.unwrap() - 60.0).abs() < 0.1);
        let dub = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap();
        assert_eq!(dub.delay_from_name, Some(-120));
        assert_eq!(dub.lang_from_name.as_deref(), Some("tha"));
        let a = &dub.tracks[0];
        assert_eq!((a.kind.as_str(), a.codec.as_str(), a.channels, a.delay, a.lang.as_str(), a.in_movie), ("audio", "ac3", Some(6), -120, "tha", false));
        assert!((dub.longer_by.unwrap() - 0.107).abs() < 0.05, "ยาวกว่าหนังราว 0.1 วินาที ได้ {:?}", dub.longer_by);
        let tis = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap(), m.duration).unwrap();
        assert_eq!(tis.tracks[0].charset.as_deref(), Some("CP874"));
        assert_eq!(tis.tracks[0].lang, "tha");
        assert_eq!(tis.tracks[0].frames, Some(3), "th.srt มี 3 บรรทัด");
        let vtt = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024).en.vtt").unwrap(), m.duration).unwrap();
        assert_eq!((vtt.tracks[0].codec.as_str(), vtt.tracks[0].lang.as_str()), ("webvtt", "eng"));
        let img = inspect(&tools(), &av("เสียงซับ/ซับรูป (2024).mkv").unwrap()).unwrap();
        let subs: Vec<&str> = img.tracks.iter().filter(|t| t.kind == "subtitle").map(|t| t.codec.as_str()).collect();
        assert_eq!(subs, ["hdmv_pgs_subtitle", "dvd_subtitle"]);
    }

    /// ดาวตก + พากย์ไทย 5.1 (DELAY -120) + ซับไทย UTF-8 (+500) + ซับไทย TIS-620 + ซับอังกฤษ VTT + ปกตั้งใหม่ → MKV
    #[test]
    fn merge_to_mkv_real_files() {
        let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
        let dir = temp_dir("mkv");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        let mut tracks = m.tracks.clone();
        tracks[1].delay = 120; // เสียงอังกฤษเดิมเลื่อนไปหลัง 120 ms วัดจากเวลาเริ่มของแพ็กเก็ตแรก
        let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
        dub.name = "พากย์ไทย 5.1".into();
        dub.default = true;
        let mut th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
        th.delay = 500;
        th.default = true;
        th.name = "ไทย".into();
        let tis = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
        let vtt = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).en.vtt").unwrap(), m.duration).unwrap().tracks.remove(0);
        // ลำดับใหม่ ภาพ พากย์ไทย อังกฤษ ซับไทย ซับไทยเก่า ซับอังกฤษ
        let order = vec![tracks[0].clone(), dub, tracks[1].clone(), th, tis, vtt];
        let mut r = req(&movie, order, "mkv");
        r.covers.portrait = "new".into();
        let poster = std::fs::read(av("รูป/poster.jpg").unwrap()).unwrap();
        let covers = HashMap::from([("cover".to_string(), (poster.clone(), "jpg".to_string()))]);
        let out = dir.0.join("ดาวตก (2024).mkv.partial");
        let (res, _notes) = run(&r, &covers, &out, &dir.0);
        let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert!(made.verified);
        assert_eq!(made.counts, Counts { video: 1, audio: 2, subs: 3 });
        // ลำดับ ภาษา ชื่อ ธงหลัก
        let j = mkv_json(&tl, &out).unwrap();
        let got: Vec<(String, String, String, bool)> = j["tracks"].as_array().unwrap().iter().map(|t| (
            t["codec"].as_str().unwrap().to_string(), t["properties"]["language"].as_str().unwrap_or("").to_string(),
            t["properties"]["track_name"].as_str().unwrap_or("").to_string(), t["properties"]["default_track"].as_bool().unwrap_or(false),
        )).collect();
        assert_eq!(got[1], ("AC-3".into(), "tha".into(), "พากย์ไทย 5.1".into(), true));
        assert_eq!(got[2], ("AAC".into(), "eng".into(), "English".into(), false));
        assert_eq!(got[3], ("SubRip/SRT".into(), "tha".into(), "ไทย".into(), true));
        assert_eq!(got[4], ("SubRip/SRT".into(), "tha".into(), "".into(), false));
        assert_eq!(got[5].0, "SubRip/SRT", "VTT แปลงเป็น SRT ก่อนใส่ MKV");
        assert!(_notes.iter().any(|n| n.contains("แปลงเป็น SRT")), "{_notes:?}");
        // ดีเลย์ · เสียงอังกฤษ +120 ms เริ่มที่ 0.120 · ซับไทย +500 ms บรรทัดแรก 1.0 → 1.5 วินาที
        // เสียง AAC ต้นทางเริ่มที่ −0.021 (หัวของตัวเข้ารหัส AAC) วัดส่วนต่างจากต้นทาง
        let a_eng = first_packet(&out, "a:1") - first_packet(&movie, "a:0");
        assert!((a_eng - 0.120).abs() <= 0.005, "เสียงอังกฤษเลื่อน {a_eng}");
        let s_th = first_packet(&out, "s:0");
        assert!((s_th - 1.5).abs() <= 0.005, "ซับไทยบรรทัดแรก {s_th}");
        // พากย์ไทย −120 ms · เฟรมแรกที่เหลืออยู่ภายใน 32 ms (เฟรม AC-3 ยาว 32 ms) และแทร็กสั้นลงราว 120 ms
        let a_dub = first_packet(&out, "a:0");
        assert!((0.0..0.033).contains(&a_dub), "พากย์ไทยเริ่มที่ {a_dub}");
        // ซับ TIS-620 อ่านเป็นภาษาไทยถูก
        let o = crate::tools::run_tool(&tl, "ffmpeg", ["-v", "error", "-i"].iter().map(OsString::from).chain([out.as_os_str().to_owned()])
            .chain(["-map", "0:s:1", "-f", "srt", "-"].iter().map(OsString::from))).unwrap();
        let text = String::from_utf8_lossy(&o.stdout).to_string();
        assert!(text.contains("สวัสดีค่ะ นี่คือซับไตเติลภาษาไทย"), "ซับ TIS-620 อ่านได้ {text}");
        // ปก
        let atts = mkv_attachments(&tl, &out).unwrap();
        assert_eq!(atts.iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["cover.jpg"]);
        // ไฟล์ต้นทางไม่ถูกแตะ
        assert!(movie.exists());
    }

    /// MP4 · พากย์ไทย −120 + ซับไทย +500 + ปกตั้งใหม่ · ซับรูปใส่ไม่ได้ต้องถูกกันก่อนเริ่ม (กันที่ apply ทดสอบตัวสร้างคำสั่งแทน)
    #[test]
    fn merge_to_mp4_real_files() {
        let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
        let dir = temp_dir("mp4");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
        dub.default = true;
        let mut th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
        th.delay = 500;
        let mut eng = m.tracks[1].clone();
        eng.default = false;
        let mut r = req(&movie, vec![m.tracks[0].clone(), dub, eng, th], "mp4");
        r.covers.portrait = "new".into();
        let poster = std::fs::read(av("รูป/poster.jpg").unwrap()).unwrap();
        let covers = HashMap::from([("cover".to_string(), (poster, "jpg".to_string()))]);
        let out = dir.0.join("ดาวตก (2024).mp4.partial");
        let (res, notes) = run(&r, &covers, &out, &dir.0);
        let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert!(made.verified);
        assert_eq!(made.counts, Counts { video: 1, audio: 2, subs: 1 });
        assert!(notes.iter().any(|n| n.contains("MP4 ตั้งซับแรกเป็นหลักเอง")), "{notes:?}");
        let s_th = first_packet(&out, "s:0");
        assert!((s_th - 1.5).abs() <= 0.01, "ซับไทยบรรทัดแรก {s_th}");
        let j = ffprobe_json(&tl, &out).unwrap();
        let st = j["streams"].as_array().unwrap();
        assert_eq!(st[1]["codec_name"], "ac3");
        assert_eq!(st[1]["tags"]["language"], "tha");
        assert_eq!(st[1]["disposition"]["default"], 1);
        assert_eq!(st[2]["disposition"]["default"], 0);
        assert_eq!(st[3]["codec_name"], "mov_text");
        assert!(crate::outfile::has_attached_pic(&j));
    }

    /// ฟอนต์ที่แนบในหนังต้องติดไปด้วย · เพิ่มซับไทยเข้าไป
    #[test]
    fn fonts_stay_after_merge() {
        let Some(movie) = av("เสียงซับ/ฟอนต์แนบ (2024).mkv") else { return };
        let dir = temp_dir("font");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        assert_eq!(m.attachments.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["tahoma.ttf"]);
        let th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
        let mut tracks = m.tracks.clone();
        tracks.push(th);
        let out = dir.0.join("f.mkv.partial");
        let (res, _) = run(&req(&movie, tracks, "mkv"), &HashMap::new(), &out, &dir.0);
        let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert_eq!(made.counts.subs, 2);
        assert_eq!(mkv_attachments(&tl, &out).unwrap().iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["tahoma.ttf"]);
    }

    /// ซับ ASS ที่เพิ่มเข้าไป หาไฟล์ฟอนต์ที่ซับใช้ แล้วฝังไปกับไฟล์ใหม่ (พี่กันสั่ง 8 พ.ย. 2569)
    /// ฟอนต์ในโฟลเดอร์ข้างซับมาก่อน ฟอนต์ของ Windows ตามมา · ชื่อซ้ำกับฟอนต์ที่หนังมีอยู่แล้วไม่ใส่ซ้ำ · ฟอนต์ที่ไม่มีในเครื่องบอกว่าไม่เจอ
    #[test]
    fn ass_fonts_are_found_and_embedded() {
        let Some(movie) = av("เสียงซับ/ฟอนต์แนบ (2024).mkv") else { return };
        let dir = temp_dir("assfont");
        let tl = tools();
        let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
        std::fs::create_dir_all(dir.0.join("fonts")).unwrap();
        std::fs::copy(win.join("georgia.ttf"), dir.0.join("fonts").join("f01.ttf")).unwrap();
        let ass = dir.0.join("ป้าย.th.ass");
        std::fs::write(&ass, "\u{feff}[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Tahoma,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,222\nStyle: Sign,Georgia,40,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,8,20,20,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\fnComic Sans MS}สวัสดี\nDialogue: 0,0:00:04.00,0:00:06.00,Sign,,0,0,0,,{\\fnฟอนต์ไม่มีในเครื่อง}ป้าย\n").unwrap();
        let m = inspect(&tl, &movie).unwrap();
        let added = add_file(&tl, &ass, m.duration).unwrap();
        let f: Vec<(String, String, Option<String>)> = added.fonts.iter().map(|h| (h.name.clone(), h.from.clone(), h.file.as_ref().and_then(|p| Path::new(p).file_name()).map(|n| n.to_string_lossy().to_lowercase()))).collect();
        assert_eq!(f, [
            ("Tahoma".into(), "system".into(), Some("tahoma.ttf".into())),
            ("Georgia".into(), "folder".into(), Some("f01.ttf".into())),
            ("Comic Sans MS".into(), "system".into(), Some("comic.ttf".into())),
            ("ฟอนต์ไม่มีในเครื่อง".into(), "".into(), None),
        ], "{:?}", added.fonts);
        let mut tracks = m.tracks.clone();
        tracks.extend(added.tracks);
        let mut r = req(&movie, tracks, "mkv");
        r.fonts = added.fonts.iter().filter_map(|h| h.file.clone()).collect();
        let out = dir.0.join("af.mkv.partial");
        let (res, notes) = run(&r, &HashMap::new(), &out, &dir.0);
        res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        let mut atts: Vec<(String, String)> = mkv_attachments(&tl, &out).unwrap().into_iter().map(|a| (a.0.to_lowercase(), a.1)).collect();
        atts.sort();
        assert_eq!(atts.iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["comic.ttf", "f01.ttf", "tahoma.ttf"], "tahoma.ttf มีในหนังแล้วไม่ใส่ซ้ำ");
        assert!(atts.iter().filter(|a| a.0 != "tahoma.ttf").all(|a| a.1 == "font/ttf"), "{atts:?}");
        assert!(notes.iter().any(|n| n.contains("ไม่ใส่ซ้ำ")) && notes.iter().any(|n| n.contains("ฝังฟอนต์ของซับ 2 ไฟล์")), "{notes:?}");
        // MP4 ใส่ฟอนต์ไม่ได้ บอกในผล · ฟอนต์ที่ไม่มีไฟล์แล้ว หยุดพร้อมบอก ไม่รวมต่อเงียบ ๆ
        let mut bad = r.clone();
        bad.fonts = vec![dir.0.join("หายไปแล้ว.ttf").to_string_lossy().to_string()];
        let (res, _) = run(&bad, &HashMap::new(), &dir.0.join("bad.mkv.partial"), &dir.0);
        assert_eq!(res.err().map(|p| p.title), Some("หาไฟล์ฟอนต์ไม่เจอ".to_string()));
    }

    /// หนัง MP4 ที่มีปกฝัง รวมซับออกเป็น MP4 ปกต้องยังอยู่ (ผู้ช่วยตรวจขั้น 10 ข้อ 1 · เดิมดึงปกด้วย mkvextract ซึ่งเปิด MP4 ไม่ได้ ปกหายเงียบ)
    #[test]
    fn mp4_cover_stays_when_merging_to_mp4() {
        let (Some(srt), Some(poster)) = (av("เสียงซับ/ดาวตก (2024).th.srt"), av("รูป/poster.jpg")) else { return };
        let dir = temp_dir("mp4cover");
        let tl = tools();
        let movie = dir.0.join("มีปก.mp4");
        let o = crate::tools::run_tool(&tl, "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3"].iter().map(OsString::from)
            .chain([OsString::from("-i"), poster.into_os_string()])
            .chain(["-map", "0:v", "-map", "1:a", "-map", "2:v", "-c:v:0", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:v:1", "copy", "-disposition:v:1", "attached_pic"].iter().map(OsString::from))
            .chain([movie.clone().into_os_string()])).unwrap();
        assert!(o.status.success(), "ทำไฟล์ทดสอบไม่ได้ {}", String::from_utf8_lossy(&o.stderr));
        let m = inspect(&tl, &movie).unwrap();
        assert!(m.attachments.iter().any(|a| a.name == "cover.jpg"), "mkvmerge รายงานปกของ MP4 เป็นไฟล์แนบ");
        let mut tracks = m.tracks.clone();
        tracks.push(add_file(&tl, &srt, m.duration).unwrap().tracks.remove(0));
        let out = dir.0.join("ใหม่.mp4.partial");
        let (res, _) = run(&req(&movie, tracks, "mp4"), &HashMap::new(), &out, &dir.0);
        res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert!(attached_pic_index(&tl, &out).is_some(), "ไฟล์ MP4 ใหม่ต้องมีปก");
        assert!(!is_matroska(&movie) && is_matroska(&av("เสียงซับ/ดาวตก (2024).mkv").unwrap()));
    }

    /// เอาปกเดิมออก · เอาซับรูป VobSub ออก เหลือ PGS
    #[test]
    fn remove_cover_and_image_sub() {
        let Some(harbor) = av("หนัง/Harbor Lights (2021).mkv") else { return };
        let dir = temp_dir("rm");
        let tl = tools();
        let m = inspect(&tl, &harbor).unwrap();
        assert_eq!(m.attachments[0].name, "cover.jpg");
        let mut r = req(&harbor, m.tracks.clone(), "mkv");
        r.covers.portrait = "remove".into();
        let out = dir.0.join("h.mkv.partial");
        let (res, notes) = run(&r, &HashMap::new(), &out, &dir.0);
        res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert!(mkv_attachments(&tl, &out).unwrap().is_empty());
        assert!(notes.iter().any(|n| n.contains("เอารูปปก cover.jpg ออก")), "{notes:?}");

        let img = av("เสียงซับ/ซับรูป (2024).mkv").unwrap();
        let m2 = inspect(&tl, &img).unwrap();
        let mut tracks = m2.tracks.clone();
        tracks.iter_mut().filter(|t| t.codec == "dvd_subtitle").for_each(|t| t.keep = false);
        let out2 = dir.0.join("i.mkv.partial");
        let (res2, _) = run(&req(&img, tracks.clone(), "mkv"), &HashMap::new(), &out2, &dir.0);
        let made = res2.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert_eq!(made.counts.subs, 1);
        let codecs: Vec<String> = streams_of(&ffprobe_json(&tl, &out2).unwrap()).into_iter().filter(|s| s.kind == "subtitle").map(|s| s.codec).collect();
        assert_eq!(codecs, ["hdmv_pgs_subtitle"]);
    }

    /// ตัวตรวจจับของผิดได้ · สั่งภาษาหนึ่ง แต่ไฟล์ที่ได้เป็นอีกภาษา ต้องไม่ผ่าน
    #[test]
    fn verify_catches_wrong_language() {
        let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
        let dir = temp_dir("bad");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        let mut wrong = m.tracks.clone();
        wrong[1].lang = "jpn".into();
        let e = verify_mkv(&tl, &dir.0, &movie, &wrong, &[], &[], m.duration).unwrap_err();
        assert!(e.iter().any(|w| w.contains("ภาษา eng ที่สั่ง jpn")), "{e:?}");
        let mut order = m.tracks.clone();
        order.swap(0, 1);
        let e2 = verify_mkv(&tl, &dir.0, &movie, &order, &[], &[], m.duration).unwrap_err();
        assert!(e2.iter().any(|w| w.contains("แทร็กไม่ตรงที่สั่ง")), "{e2:?}");
    }

    /// แปลงเสียงตอนรวม · พากย์ไทย AC-3 แทนที่เป็น Opus · เสียงอังกฤษ AAC ในหนังเพิ่มคู่เป็น FLAC
    #[test]
    fn convert_while_merging() {
        let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
        let dir = temp_dir("conv");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
        dub.convert = Some(crate::encode::EncodeSpec { codec: "opus".into(), encoder: "native".into(), p: serde_json::json!({"bitrate": 256}).as_object().cloned().unwrap(), ..Default::default() });
        dub.name = "พากย์ไทย Opus".into();
        let mut eng = m.tracks[1].clone();
        eng.convert = Some(crate::encode::EncodeSpec { codec: "flac".into(), encoder: "native".into(), ..Default::default() });
        eng.pair = true;
        let out = dir.0.join("c.mkv.partial");
        let (res, notes) = run(&req(&movie, vec![m.tracks[0].clone(), dub, eng], "mkv"), &HashMap::new(), &out, &dir.0);
        let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
        assert!(made.verified);
        let codecs: Vec<String> = streams_of(&ffprobe_json(&tl, &out).unwrap()).into_iter().map(|s| s.codec).collect();
        assert_eq!(codecs, ["h264", "opus", "aac", "flac"], "{notes:?}");
        let j = mkv_json(&tl, &out).unwrap();
        assert_eq!(j["tracks"][1]["properties"]["track_name"], "พากย์ไทย Opus");
        assert_eq!(j["tracks"][3]["properties"]["track_name"], "English FLAC");
        assert_eq!(j["tracks"][1]["properties"]["audio_channels"], 6, "Opus เก็บ 5.1 ครบ");
        assert!(notes.iter().any(|n| n.contains("เพิ่มคู่กับแทร็กเดิม")), "{notes:?}");
        // ไฟล์ชั่วคราวของการแปลงถูกลบหมด
        assert!(std::fs::read_dir(&dir.0).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with("merge-conv-")));
    }

    #[test]
    fn converted_size_estimates() {
        let mut t = Track { kind: "audio".into(), duration: Some(7680.0), channels: Some(6), rate: Some(48000), keep: true, ..Default::default() };
        assert_eq!(conv_estimate(&t), None, "ไม่แปลง ไม่บวก");
        t.convert = Some(crate::encode::EncodeSpec { codec: "opus".into(), p: serde_json::json!({"bitrate": 384}).as_object().cloned().unwrap(), ..Default::default() });
        // 384 kbps 7,680 วินาที = 368,640,000 ไบต์ (ราว 352 MB ตรงกับมอคอัป 1 kbps ≈ 0.96 MB)
        assert_eq!(conv_estimate(&t), Some(368_640_000));
        t.convert = Some(crate::encode::EncodeSpec { codec: "flac".into(), ..Default::default() });
        // 5.1 24 บิต 48 kHz 7,680 วินาที เสียงดิบ 6.6 พันล้านไบต์ (มอคอัป WAV ราว 6.2 GB) 60% ราว 3.98 พันล้าน
        assert_eq!(conv_estimate(&t), Some((7680.0 * 48000.0 * 6.0 * 3.0 * 0.6) as u64));
        t.convert = Some(crate::encode::EncodeSpec { codec: "mp3".into(), channels: Some(2), speed: Some([25.0, 23.976]), ..Default::default() });
        // MP3 VBR ไม่มีบิตเรต คิด 320 · ยืดความเร็วแล้วยาวขึ้น
        assert_eq!(conv_estimate(&t), Some((7680.0 * 25.0 / 23.976 * 320_000.0 / 8.0) as u64));
    }

    /// กดหยุดกลางทาง ไฟล์ทำค้างถูกลบ
    #[test]
    fn cancel_removes_partial() {
        let Some(movie) = av("เสียงซับ/ซับรูป (2024).mkv") else { return };
        let dir = temp_dir("stop");
        let tl = tools();
        let m = inspect(&tl, &movie).unwrap();
        let out = dir.0.join("s.mkv.partial");
        let mut notes = vec![];
        let r = produce(&tl, &dir.0, &req(&movie, m.tracks.clone(), "mkv"), &HashMap::new(), &out, &|| true, &|_, _, _, _| {}, &mut notes, "ไม่แตะ");
        let p = r.err().expect("ต้องหยุด");
        assert_eq!(p.kind, "cancelled");
        assert!(!out.exists(), "ไฟล์ทำค้างต้องถูกลบ");
    }
}
