//! ตัวดูซับ (แผนเสียงและซับ ขั้น 6 · มอคอัปหัวข้อ 4)
//! ซับตัวหนังสือ SRT ASS SSA VTT · อ่านจากไฟล์ที่เพิ่ม หรือดึงจากหนัง (MKV ใช้ mkvextract ได้ไฟล์ต้นฉบับทุกตัวอักษร · MP4 ใช้ ffmpeg แปลงเป็น SRT)
//! อ่านรหัสอักษร UTF-8 UTF-16 (มี BOM) และไทยแบบเก่า TIS-620 / CP874 ให้อ่านได้ · ดูอย่างเดียว ไม่แก้ไฟล์
//! ภาพหนังตรงเวลานั้น (ffmpeg 1 ภาพ) · คลื่นเสียงช่วงนั้น (ตัวถอดเสียงเดียวกับตัวช่วยหาดีเลย์)
//! ซับรูป PGS VobSub ถอดด้วย ffmpeg แบบ sub2video ได้ภาพทุกครั้งที่ซับเปลี่ยน · ตัดภาพว่าง (ตอนซับหาย) กับภาพซ้ำออก ครอปเฉพาะส่วนที่มีตัวหนังสือ เก็บไว้ในโฟลเดอร์ชั่วคราว

use crate::tools::{run_tool_timeout, tool_succeeded, tools_dir};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub n: usize,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubText {
    /// ข้อความไฟล์ทุกตัวอักษร (แบบ notepad)
    pub raw: String,
    /// srt ass vtt
    pub kind: String,
    /// UTF-8 · UTF-16 · TIS-620
    pub charset: String,
    pub cues: Vec<Cue>,
}

// ---------------------------------------------------------------- รหัสอักษร

/// CP874 (Windows ไทย) ช่วง 0x80–0x9F ที่ต่างจาก TIS-620 · ที่เหลือ 0xA1–0xFB = U+0E01–U+0E5B
pub(crate) fn cp874(b: u8) -> char {
    match b {
        0x00..=0x7F => b as char,
        0x80 => '€',
        0x85 => '…',
        0x91 => '\u{2018}',
        0x92 => '\u{2019}',
        0x93 => '\u{201C}',
        0x94 => '\u{201D}',
        0x95 => '•',
        0x96 => '–',
        0x97 => '—',
        0xA0 => '\u{00A0}',
        0xA1..=0xDA | 0xDF..=0xFB => char::from_u32(b as u32 + 0x0D60).unwrap_or('\u{FFFD}'),
        _ => '\u{FFFD}',
    }
}

/// ไบต์ของไฟล์ซับเป็นข้อความ · BOM ก่อน · UTF-8 ที่ถูกต้อง · ไม่ใช่ = ไทยแบบเก่า
/// เดาชุดอักษรของซับที่ไม่มี BOM · UTF-8 (ยอมเศษตัวอักษรที่ขาดท้ายบัฟเฟอร์) · CP874 เฉพาะเมื่อไบต์สูงเกือบทั้งหมดเป็นอักษรไทยจริง
/// และมีพยัญชนะไทยพอ · นอกนั้นถือเป็น Windows-1252 (ซับฝรั่งเศส สเปน เยอรมันแบบเก่า)
/// (ผู้ช่วยตรวจขั้น 10 ข้อ 4 · เดิมไม่ใช่ UTF-8 และมีไบต์ 0xA1–0xFB สักตัว = TIS-620 ซับฝรั่งเศส é กลายเป็นวรรณยุกต์ไทย)
pub fn guess_charset(b: &[u8]) -> &'static str {
    match std::str::from_utf8(b) {
        Ok(_) => return "UTF-8",
        Err(e) if e.error_len().is_none() && e.valid_up_to() > 0 => return "UTF-8",
        Err(_) => {}
    }
    let (mut high, mut thai, mut cons) = (0usize, 0usize, 0usize);
    for &c in b {
        if c < 0x80 { continue; }
        high += 1;
        if (0xA1..=0xDA).contains(&c) || (0xDF..=0xFB).contains(&c) { thai += 1; }
        if (0xA1..=0xCE).contains(&c) { cons += 1; }
    }
    if high > 0 && thai * 10 >= high * 9 && cons * 10 >= high * 3 { "CP874" } else { "CP1252" }
}

/// Windows-1252 ช่วง 0x80–0x9F (นอกนั้นตรงกับ Latin-1)
pub(crate) fn cp1252(b: u8) -> char {
    const T: [u16; 32] = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
        0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
    if (0x80..=0x9F).contains(&b) { char::from_u32(T[(b - 0x80) as usize] as u32).unwrap_or('�') } else { b as char }
}

pub fn decode_text(b: &[u8]) -> (String, String) {
    if let Some(r) = b.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(r).into_owned(), "UTF-8".into());
    }
    let u16s = |r: &[u8], le: bool| -> String {
        let v: Vec<u16> = r.chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
        String::from_utf16_lossy(&v)
    };
    if let Some(r) = b.strip_prefix(&[0xFF, 0xFE]) { return (u16s(r, true), "UTF-16".into()); }
    if let Some(r) = b.strip_prefix(&[0xFE, 0xFF]) { return (u16s(r, false), "UTF-16".into()); }
    match guess_charset(b) {
        "UTF-8" => (String::from_utf8_lossy(b).into_owned(), "UTF-8".into()),
        "CP874" => (b.iter().map(|&x| cp874(x)).collect(), "TIS-620".into()),
        _ => (b.iter().map(|&x| cp1252(x)).collect(), "Windows-1252".into()),
    }
}

// ---------------------------------------------------------------- แยกบรรทัด

/// เวลา 00:01:02,345 · 00:01:02.345 · 01:02.345 · 0:01:02.34 (ASS ทศนิยมสองหลัก)
fn time(s: &str) -> Option<f64> {
    let s = s.trim().replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    let (h, m, sec) = match parts.as_slice() {
        [h, m, sec] => (h.parse::<f64>().ok()?, m.parse::<f64>().ok()?, sec.parse::<f64>().ok()?),
        [m, sec] => (0.0, m.parse::<f64>().ok()?, sec.parse::<f64>().ok()?),
        _ => return None,
    };
    Some(h * 3600.0 + m * 60.0 + sec)
}

/// เอาแท็กออก <i> </font> {\an8} · \N \n เป็นขึ้นบรรทัด \h เป็นเว้นวรรค
fn clean(t: &str) -> String {
    let mut out = String::new();
    let mut depth_angle = false;
    let mut depth_brace = false;
    let t = t.replace("\\N", "\n").replace("\\n", "\n").replace("\\h", " ");
    for c in t.chars() {
        match c {
            '<' if !depth_brace => depth_angle = true,
            '>' if depth_angle => depth_angle = false,
            '{' => depth_brace = true,
            '}' if depth_brace => depth_brace = false,
            _ if !depth_angle && !depth_brace => out.push(c),
            _ => {}
        }
    }
    out.lines().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n").trim().to_string()
}

pub fn kind_of(raw: &str, ext: &str) -> &'static str {
    let head = raw.trim_start_matches('\u{FEFF}').trim_start();
    if head.starts_with("WEBVTT") || ext == "vtt" { "vtt" }
    else if raw.contains("[Events]") || raw.contains("\nDialogue:") || matches!(ext, "ass" | "ssa") { "ass" }
    else { "srt" }
}

/// SRT กับ VTT · บล็อกที่มีบรรทัด --> คือหนึ่งบรรทัดซับ ข้อความคือบรรทัดถัดไปจนบรรทัดว่าง
fn parse_timed(raw: &str) -> Vec<Cue> {
    let lines: Vec<&str> = raw.lines().collect();
    let mut cues = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let l = lines[i];
        if let Some((a, b)) = l.split_once("-->") {
            let b = b.split_whitespace().next().unwrap_or("");
            if let (Some(s), Some(e)) = (time(a), time(b)) {
                let mut text = Vec::new();
                i += 1;
                while i < lines.len() && !lines[i].trim().is_empty() {
                    text.push(lines[i]);
                    i += 1;
                }
                cues.push(Cue { n: cues.len() + 1, start: s, end: e, text: clean(&text.join("\n")) });
                continue;
            }
        }
        i += 1;
    }
    cues
}

/// ASS SSA · ใช้บรรทัด Format ของ [Events] หาว่า Start End Text อยู่ช่องไหน
fn parse_ass(raw: &str) -> Vec<Cue> {
    let mut fields: Vec<String> = vec!["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"].into_iter().map(String::from).collect();
    let mut in_events = false;
    let mut out = Vec::new();
    for l in raw.lines() {
        let t = l.trim();
        if t.starts_with('[') { in_events = t.eq_ignore_ascii_case("[events]"); continue; }
        if !in_events { continue; }
        if let Some(f) = t.strip_prefix("Format:") {
            fields = f.split(',').map(|x| x.trim().to_lowercase()).collect();
        } else if let Some(d) = t.strip_prefix("Dialogue:") {
            let parts: Vec<&str> = d.splitn(fields.len(), ',').collect();
            let at = |k: &str| fields.iter().position(|f| f == k).and_then(|i| parts.get(i)).map(|s| s.trim());
            if let (Some(s), Some(e), Some(tx)) = (at("start").and_then(time), at("end").and_then(time), fields.iter().position(|f| f == "text").and_then(|i| parts.get(i))) {
                out.push(Cue { n: 0, start: s, end: e, text: clean(tx) });
            }
        }
    }
    out.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    for (i, c) in out.iter_mut().enumerate() { c.n = i + 1; }
    out
}

pub fn parse(raw: &str, kind: &str) -> Vec<Cue> {
    if kind == "ass" { parse_ass(raw) } else { parse_timed(raw) }
}

// ---------------------------------------------------------------- ดึงซับ

fn is_mkv(p: &Path) -> bool {
    matches!(p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("mkv" | "mka" | "mks" | "mk3d" | "webm"))
}

fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// ข้อความของซับ · ไฟล์ที่เพิ่มอ่านตรง · ซับในหนัง MKV ดึงด้วย mkvextract · MP4 ให้ ffmpeg แปลงเป็น SRT
pub fn text_of(tools: &Path, work: &Path, path: &Path, in_movie: bool, tid: u64, ff: u64) -> Result<SubText, String> {
    let (bytes, hint) = bytes_of(tools, work, path, in_movie, tid, ff)?;
    let (raw, charset) = decode_text(&bytes);
    let kind = kind_of(&raw, &hint).to_string();
    let cues = parse(&raw, &kind);
    Ok(SubText { raw, kind, charset, cues })
}

/// ไบต์ของซับตามที่อยู่ในไฟล์ กับนามสกุลที่ใช้ช่วยเดาชนิด (ว่าง = ดูจากเนื้อ) · ตัวแก้ซับ (subdoc.rs) ใช้ร่วม
pub fn bytes_of(tools: &Path, work: &Path, path: &Path, in_movie: bool, tid: u64, ff: u64) -> Result<(Vec<u8>, String), String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // อ่านตรงเฉพาะไฟล์ซับข้อความ · ไฟล์ห่อที่เพิ่ม (MKS MKA MP4) ดึงแทร็กด้วยเครื่องมือแบบซับในหนัง
    // (ผู้ช่วยตรวจขั้น 10 ข้อ 6 · เดิมอ่าน MKS ทั้งไฟล์เป็นข้อความ ได้อักษรขยะ 0 บรรทัด)
    let plain = matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt");
    let bytes = if !in_movie && plain {
        std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?
    } else if is_mkv(path) {
        let out = work.join(format!("sub-{}.txt", crate::poster_image::unique()));
        let args: Vec<OsString> = vec!["--ui-language".into(), "en".into(), "tracks".into(), path.into(), format!("{tid}:{}", out.display()).into()];
        let o = run_tool_timeout(tools, "mkvextract", &args, Duration::from_secs(600))?;
        let b = std::fs::read(&out);
        let _ = std::fs::remove_file(&out);
        if !tool_succeeded("mkvextract", &o.status) || b.is_err() {
            return Err(format!("ดึงซับจากหนังไม่ได้  {}", String::from_utf8_lossy(&o.stdout).lines().filter(|l| l.contains("Error")).last().unwrap_or("")));
        }
        b.unwrap()
    } else {
        let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-i".into(), path.into(), "-map".into(), format!("0:{ff}").into(), "-f".into(), "srt".into(), "-".into()];
        let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(600))?;
        if !tool_succeeded("ffmpeg", &o.status) { return Err("ดึงซับจากหนังไม่ได้".into()); }
        o.stdout
    };
    let hint = if plain && !in_movie { ext } else if is_mkv(path) { String::new() } else { "srt".into() };
    Ok((bytes, hint))
}

/// ภาพหนังหนึ่งภาพที่เวลา t สูง h จุด เป็น data URL (JPEG)
pub fn frame(tools: &Path, movie: &Path, t: f64, h: u32) -> Result<String, String> {
    Ok(format!("data:image/jpeg;base64,{}", crate::audiograph::b64(&frame_jpg(tools, movie, t, h)?)))
}

/// ภาพหนังหนึ่งภาพ เป็นไบต์ JPEG
fn frame_jpg(tools: &Path, movie: &Path, t: f64, h: u32) -> Result<Vec<u8>, String> {
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.3}", t.max(0.0)).into(), "-i".into(), movie.into(),
        "-frames:v".into(), "1".into(), "-vf".into(), format!("scale=-2:{h}").into(), "-f".into(), "image2pipe".into(), "-c:v".into(), "mjpeg".into(), "-q:v".into(), "4".into(), "-".into()];
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(60))?;
    if !tool_succeeded("ffmpeg", &o.status) || o.stdout.is_empty() { return Err("ดึงภาพหนังไม่ได้".into()); }
    Ok(o.stdout)
}

/// เวลาที่จะดึงภาพ · อยู่ช่วง 12% ถึง 87% ของเรื่อง เลี่ยงโลโก้ต้นเรื่องกับเครดิตท้ายเรื่อง · ลองรอบใหม่ได้เวลาใหม่
fn frame_time(duration: f64, seed: u64, attempt: u64) -> f64 {
    if duration <= 0.0 { return 1.0; }
    let n = seed.wrapping_add(attempt.wrapping_mul(37)) % 76;
    duration * (0.12 + n as f64 / 100.0)
}

/// ภาพมืดหรือภาพเรียบมาก JPEG จะเล็กผิดปกติ ลองเวลาใหม่ได้ภาพที่ดูรู้เรื่องกว่า
const FRAME_MIN_BYTES: usize = 9000;

/// ภาพสุ่มจากหนัง แสดงแทนแถบทะแยงในเรื่องที่ยังไม่มีปก (พี่กันสั่ง 9 พ.ย. 2569)
/// เก็บในโฟลเดอร์ frames ของโปรแกรม ไม่แตะไฟล์หนัง · ไฟล์เดิมได้ภาพเดิม ไฟล์เปลี่ยนจึงสุ่มใหม่ · ไม่ใช่ปก ไม่นับในตัวกรอง
#[tauri::command]
pub async fn movie_frame(app: AppHandle, path: String, duration: f64) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    let tools = tools_dir(&app)?;
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("frames");
    tauri::async_runtime::spawn_blocking(move || {
        let movie = need(&path)?;
        let meta = std::fs::metadata(&movie).map_err(|e| e.to_string())?;
        let mut h = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut h);
        meta.len().hash(&mut h);
        meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).hash(&mut h);
        let key = h.finish();
        let out = dir.join(format!("{key:016x}.jpg"));
        if out.exists() { return Ok(Some(out.to_string_lossy().to_string())); }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut best: Option<Vec<u8>> = None;
        for attempt in 0..3 {
            let Ok(jpg) = frame_jpg(&tools, &movie, frame_time(duration, key, attempt), 540) else { continue };
            let enough = jpg.len() >= FRAME_MIN_BYTES;
            if best.as_ref().map(|b| jpg.len() > b.len()).unwrap_or(true) { best = Some(jpg); }
            if enough { break; }
        }
        // ดึงภาพไม่ได้ (ไฟล์ไม่มีภาพ หรือเสีย) ยังเป็นแถบทะแยงตามเดิม ไม่ถือว่าผิดพลาด
        let Some(jpg) = best else { return Ok(None) };
        crate::store::write_atomic(&out, &jpg, false).map_err(|e| e.to_string())?;
        Ok(Some(out.to_string_lossy().to_string()))
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- ซับรูป

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubImg {
    pub n: usize,
    pub start: f64,
    pub end: Option<f64>,
    pub w: u32,
    pub h: u32,
    /// ขนาดภาพเต็มของซับ (จอที่ซับวางอยู่)
    pub canvas: [u32; 2],
    /// ตำแหน่งบนจอ x y
    pub at: [u32; 2],
    #[serde(skip)]
    pub file: PathBuf,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImgPage {
    pub total: usize,
    pub items: Vec<ImgItem>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImgItem {
    #[serde(flatten)]
    pub img: SubImg,
    /// data URL ของภาพที่ครอปแล้ว
    pub png: String,
}

fn cache_key(path: &Path, ff: u64) -> String {
    let meta = std::fs::metadata(path).ok();
    let mt = meta.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let mut h: u64 = 1469598103934665603;
    for b in format!("{}|{}|{}|{ff}", path.display(), meta.map(|m| m.len()).unwrap_or(0), mt).bytes() { h ^= b as u64; h = h.wrapping_mul(1099511628211); }
    format!("{h:016x}")
}

/// ถอดซับรูปทั้งแทร็กเป็นภาพ · ใช้ผลที่ถอดไว้แล้วถ้ามี
/// ซับรูปที่กำลังถอดอยู่ (ตาม cache_key) · คำขอที่สองของซับเดียวกันรอผลของงานแรก ไม่ลบโฟลเดอร์แล้วถอดซ้อน
/// (ผู้ช่วยตรวจขั้น 10 ข้อ 5 · เดิมปิดหน้าต่างแล้วเปิดซ้ำระหว่างถอด ffmpeg สองตัวเขียนโฟลเดอร์เดียวกัน ผลที่เก็บไว้เพี้ยนถาวร)
static IMG_BUSY: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::OnceLock::new();
struct BusyGuard(String);
impl Drop for BusyGuard {
    fn drop(&mut self) { IMG_BUSY.get_or_init(Default::default).lock().unwrap().remove(&self.0); }
}

pub fn images(tools: &Path, work: &Path, path: &Path, ff: u64) -> Result<Vec<SubImg>, String> {
    let key = cache_key(path, ff);
    let dir = work.join(format!("subimg-{key}"));
    let idx = dir.join("index.json");
    let cached = || -> Option<Vec<SubImg>> {
        let mut v = serde_json::from_str::<Vec<SubImg>>(&std::fs::read_to_string(&idx).ok()?).ok()?;
        for i in v.iter_mut() { i.file = dir.join(format!("c{:06}.png", i.n)); }
        Some(v)
    };
    let _busy = loop {
        if let Some(v) = cached() { return Ok(v); }
        let mut set = IMG_BUSY.get_or_init(Default::default).lock().unwrap();
        if set.insert(key.clone()) { break BusyGuard(key.clone()); }
        drop(set);
        std::thread::sleep(Duration::from_millis(300));
    };
    if let Some(v) = cached() { return Ok(v); }
    let raw = dir.join("raw");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&raw).map_err(|e| e.to_string())?;
    // sub2video ได้ภาพทุกครั้งที่ซับเปลี่ยน · showinfo บอกเวลาของแต่ละภาพ
    let args: Vec<OsString> = vec!["-v".into(), "info".into(), "-nostdin".into(), "-nostats".into(), "-i".into(), path.into(),
        "-filter_complex".into(), format!("[0:{ff}]format=rgba,showinfo[v]").into(), "-map".into(), "[v]".into(), "-fps_mode".into(), "passthrough".into(),
        "-f".into(), "image2".into(), raw.join("%06d.png").into()];
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(1800))?;
    let log = String::from_utf8_lossy(&o.stderr);
    let times: Vec<f64> = log.lines().filter(|l| l.contains("Parsed_showinfo") && l.contains(" n:")).filter_map(|l| {
        let p = l.split("pts_time:").nth(1)?;
        p.split_whitespace().next()?.parse::<f64>().ok()
    }).collect();
    if times.is_empty() {
        let _ = std::fs::remove_dir_all(&dir);
        return Err(format!("ถอดซับรูปไม่ได้  {}", log.lines().filter(|l| l.contains("rror")).last().unwrap_or("ffmpeg ไม่ได้ภาพ")));
    }
    let mut out: Vec<SubImg> = Vec::new();
    let mut last_sig: Option<(u32, u32, u32, u32, u64)> = None;
    for (i, &t) in times.iter().enumerate() {
        let f = raw.join(format!("{:06}.png", i + 1));
        let Ok(img) = image::open(&f) else { continue };
        let img = img.to_rgba8();
        let (w, h) = img.dimensions();
        let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0u32, 0u32);
        let mut sum: u64 = 0;
        for (x, y, p) in img.enumerate_pixels() {
            if p[3] > 8 {
                x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y);
                sum = sum.wrapping_add((p[0] as u64) ^ ((p[1] as u64) << 8) ^ ((p[2] as u64) << 16)).wrapping_add((x as u64) << 32 ^ y as u64);
            }
        }
        // ภาพว่างคือตอนซับหาย · ปิดภาพก่อนหน้า
        if x1 < x0 {
            if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
            last_sig = None;
            continue;
        }
        let sig = (x0, y0, x1, y1, sum);
        // ภาพเดิมซ้ำ (ซับเดิมยังขึ้นอยู่) ไม่นับเป็นภาพใหม่
        if last_sig == Some(sig) { continue; }
        if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
        last_sig = Some(sig);
        let pad = 4;
        let (cx, cy) = (x0.saturating_sub(pad), y0.saturating_sub(pad));
        let (cw, ch) = ((x1 + pad + 1).min(w) - cx, (y1 + pad + 1).min(h) - cy);
        let crop = image::imageops::crop_imm(&img, cx, cy, cw, ch).to_image();
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        crop.save(&file).map_err(|e| format!("เก็บภาพซับไม่ได้ {e}"))?;
        out.push(SubImg { n, start: (t * 1000.0).round() / 1000.0, end: None, w: cw, h: ch, canvas: [w, h], at: [cx, cy], file });
    }
    // ภาพสุดท้ายที่ไม่มีภาพว่างตามมา หรือเวลาจบห่างเกิน 60 วินาที (ภาพปิดท้ายไฟล์) ไม่รู้เวลาจบ
    for i in out.iter_mut() { if let Some(e) = i.end { if e - i.start > 60.0 || e < i.start { i.end = None; } else { i.end = Some((e * 1000.0).round() / 1000.0); } } }
    let _ = std::fs::remove_dir_all(&raw);
    let _ = std::fs::write(&idx, serde_json::to_string(&out).unwrap_or_default());
    Ok(out)
}

fn need(p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.exists() { Ok(pb) } else { Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()) }
}

#[tauri::command]
pub async fn sub_text(app: AppHandle, path: String, in_movie: bool, tid: u64, ff: u64) -> Result<SubText, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || text_of(&tools, &work, &need(&path)?, in_movie, tid, ff)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sub_frame(app: AppHandle, movie: String, t: f64, h: Option<u32>) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || frame(&tools, &need(&movie)?, t, h.unwrap_or(360).clamp(120, 1080))).await.map_err(|e| e.to_string())?
}

/// คลื่นเสียงช่วง [t0, t1] ของแทร็กเสียงในหนัง ทีละคอลัมน์ 0–1
#[tauri::command]
pub async fn sub_wave(app: AppHandle, movie: String, stream: u64, t0: f64, t1: f64, cols: usize) -> Result<Vec<f32>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let x = crate::delay::decode(&tools, &need(&movie)?, stream, t0, (t1 - t0).max(0.2))?;
        Ok(crate::delay::peaks(&x, (x.len() / cols.max(50)).max(1)))
    }).await.map_err(|e| e.to_string())?
}

/// ซับรูปทีละหน้า · ครั้งแรกถอดทั้งแทร็ก (หนังยาวใช้เวลา เพราะต้องอ่านทั้งไฟล์)
#[tauri::command]
pub async fn sub_images(app: AppHandle, path: String, ff: u64, page: usize, per: usize) -> Result<ImgPage, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let all = images(&tools, &work, &need(&path)?, ff)?;
        let per = per.clamp(1, 48);
        let items = all.iter().skip(page * per).take(per).map(|i| {
            let png = std::fs::read(&i.file).map(|b| format!("data:image/png;base64,{}", crate::audiograph::b64(&b))).unwrap_or_default();
            ImgItem { img: i.clone(), png }
        }).collect();
        Ok(ImgPage { total: all.len(), items })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    #[test]
    fn frame_time_stays_inside_the_movie() {
        for seed in [0u64, 1, 75, 76, 12345, u64::MAX] {
            for attempt in 0..3 {
                let t = super::frame_time(1000.0, seed, attempt);
                assert!((120.0..=870.0).contains(&t), "seed {seed} รอบ {attempt} ได้ {t}");
            }
        }
        assert_ne!(super::frame_time(1000.0, 5, 0), super::frame_time(1000.0, 5, 1), "ลองรอบใหม่ต้องได้เวลาใหม่");
        assert_eq!(super::frame_time(0.0, 5, 0), 1.0, "ไม่รู้ความยาวเรื่อง ใช้วินาทีแรก");
    }

    use super::*;

    /// เดาชุดอักษร · ไทย TIS-620 จริง · ฝรั่งเศส Windows-1252 ไม่โดนเดาเป็นไทย · UTF-8 ที่ขาดกลางตัวอักษรท้ายบัฟเฟอร์ยังเป็น UTF-8 (ผู้ช่วยตรวจขั้น 10 ข้อ 4)
    #[test]
    fn charset_guess_thai_french_truncated_utf8() {
        let thai: Vec<u8> = vec![0xCA, 0xC7, 0xD1, 0xCA, 0xB4, 0xD5, b' ', 0xA4, 0xE8, 0xD0]; // สวัสดี ค่ะ
        assert_eq!(guess_charset(&thai), "CP874");
        let french = b"Caf\xE9 \xE0 l'\xE9t\xE9 tr\xE8s \xE7a";
        assert_eq!(guess_charset(french), "CP1252");
        assert_eq!(decode_text(french).0, "Café à l'été très ça");
        let utf8 = "สวัสดี".as_bytes();
        assert_eq!(guess_charset(&utf8[..utf8.len() - 1]), "UTF-8", "ขาดไบต์ท้ายยังเป็น UTF-8");
        assert_eq!(decode_text(&thai).1, "TIS-620");
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
    fn work() -> PathBuf {
        let d = std::env::temp_dir().join(format!("movie-shelf-subs-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn decodes_and_parses() {
        // TIS-620 ส ว ั ส ด ี
        let (s, cs) = decode_text(&[0xCA, 0xC7, 0xD1, 0xCA, 0xB4, 0xD5]);
        assert_eq!((s.as_str(), cs.as_str()), ("สวัสดี", "TIS-620"));
        let (u, cu) = decode_text(&[0xFF, 0xFE, b'A', 0, 0x01, 0x0E]);
        assert_eq!((u.as_str(), cu.as_str()), ("Aก", "UTF-16"));
        assert_eq!(decode_text("ดาว".as_bytes()).1, "UTF-8");
        let srt = "1\r\n00:00:01,000 --> 00:00:04,500\r\n<i>สวัสดี</i>\r\nบรรทัดสอง\r\n\r\n2\r\n00:01:02,250 --> 00:01:03,000\r\nB\r\n";
        let c = parse(srt, kind_of(srt, "srt"));
        assert_eq!(c.len(), 2);
        assert_eq!(c[0], Cue { n: 1, start: 1.0, end: 4.5, text: "สวัสดี\nบรรทัดสอง".into() });
        assert!((c[1].start - 62.25).abs() < 1e-9);
        let vtt = "WEBVTT\n\nNOTE ทดสอบ\n\n00:01.000 --> 00:04.000 align:start\n<c.red>Hello</c>\n\nx\n01:00:00.500 --> 01:00:01.000\nB";
        let v = parse(vtt, kind_of(vtt, "txt"));
        assert_eq!((v.len(), v[0].text.as_str(), v[1].start), (2, "Hello", 3600.5));
        let ass = "[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:05.00,0:00:06.50,Default,,0,0,0,,{\\c&H0000FF&}สอง, มีจุลภาค\\Nบรรทัด\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,หนึ่ง";
        let a = parse(ass, kind_of(ass, "ass"));
        assert_eq!(a.len(), 2);
        assert_eq!((a[0].n, a[0].text.as_str(), a[1].text.as_str(), a[1].end), (1, "หนึ่ง", "สอง, มีจุลภาค\nบรรทัด", 6.5));
    }

    /// ไฟล์ MKV ที่เพิ่มเข้ามา (ไม่ใช่หนังในหน้า) ดึงแทร็กซับด้วย mkvextract ไม่อ่านไบต์ทั้งไฟล์ (ผู้ช่วยตรวจขั้น 10 ข้อ 6)
    #[test]
    fn added_container_sub_is_extracted() {
        let Some(mkv) = av("ฟอนต์แนบ (2024).mkv") else { return };
        let o = crate::tools::run_tool(&tools(), "mkvmerge", [std::ffi::OsStr::new("-J"), mkv.as_os_str()]).unwrap();
        let j: serde_json::Value = serde_json::from_slice(&o.stdout).unwrap();
        let tid = j["tracks"].as_array().unwrap().iter().find(|t| t["type"] == "subtitles" && t["codec"].as_str().unwrap_or("") == "SubStationAlpha").and_then(|t| t["id"].as_u64()).expect("หนังทดสอบมีซับ ASS");
        let s = text_of(&tools(), &work(), &mkv, false, tid, tid).unwrap();
        assert!(!s.cues.is_empty() && s.charset == "UTF-8" && s.kind == "ass", "{} บรรทัด {} {}", s.cues.len(), s.charset, s.kind);
    }

    /// ไฟล์ทดสอบ SRT ไทย · TIS-620 ได้ข้อความเดียวกัน · ASS เอาแท็กสีออก · VTT · ซับในหนังดึงด้วย mkvextract
    #[test]
    fn real_files() {
        let Some(th) = av("ดาวตก (2024).th.srt") else { return };
        let w = work();
        let a = text_of(&tools(), &w, &th, false, 0, 0).unwrap();
        let b = text_of(&tools(), &w, &av("ดาวตก (2024).tis620.th.srt").unwrap(), false, 0, 0).unwrap();
        assert_eq!((a.charset.as_str(), b.charset.as_str(), a.cues.len()), ("UTF-8", "TIS-620", 3));
        assert_eq!(a.cues, b.cues);
        assert!(a.cues[0].text.contains("ซับไตเติลภาษาไทย"));
        let s = text_of(&tools(), &w, &av("ดาวตก (2024).en.ass").unwrap(), false, 0, 0).unwrap();
        assert_eq!((s.kind.as_str(), s.cues.len()), ("ass", 2));
        assert!(!s.cues.iter().any(|c| c.text.contains('{')), "{:?}", s.cues);
        let v = text_of(&tools(), &w, &av("ดาวตก (2024).en.vtt").unwrap(), false, 0, 0).unwrap();
        assert_eq!((v.kind.as_str(), v.cues.len(), v.cues[0].start), ("vtt", 2, 1.0));
        // ซับรูปในหนัง PGS ไทย 1 ภาพ (ขึ้น 1.001 หาย 9.009) · VobSub อังกฤษ 46 แพ็กเก็ต เห็นเป็นภาพ 42 ภาพ (อีก 4 แพ็กเก็ตไม่มีรูป ยาว 0.008–0.017 วินาทีหรือภาพว่าง)
        let img = av("ซับรูป (2024).mkv").unwrap();
        let p = images(&tools(), &w, &img, 2).unwrap();
        assert_eq!(p.len(), 1, "{p:?}");
        assert!((p[0].start - 1.001).abs() < 0.01 && p[0].end.is_some_and(|e| (e - 9.009).abs() < 0.05) && p[0].canvas == [1280, 720] && p[0].w < 1280, "{p:?}");
        let d = images(&tools(), &w, &img, 3).unwrap();
        assert_eq!(d.len(), 42);
        assert!(d.windows(2).all(|x| x[0].start < x[1].start) && d.iter().all(|i| i.file.exists() && i.w > 0));
        // ครั้งที่สองใช้ผลที่เก็บไว้
        let t0 = std::time::Instant::now();
        assert_eq!(images(&tools(), &w, &img, 3).unwrap().len(), 42);
        assert!(t0.elapsed().as_millis() < 500);
        let f = frame(&tools(), &av("ดาวตก (2024).mkv").unwrap(), 5.0, 240).unwrap();
        assert!(f.starts_with("data:image/jpeg;base64,") && f.len() > 2000);
        let _ = std::fs::remove_dir_all(&w);
    }
}
