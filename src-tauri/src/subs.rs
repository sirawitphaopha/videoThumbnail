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

pub(crate) fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
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
/// ซับข้อความชนิดที่ ffmpeg อ่านได้แต่ตัวอ่านของโปรแกรมไม่รู้จัก · เปิดแล้วแปลงเป็น ASS ด้วย ffmpeg สีกับตัวเอียงตามแท็กเดิมไม่หาย
/// (พี่กันสั่ง 15 พ.ย. 2569 "เราอยากให้มันแปลงจาก text sub ตัวอื่นมา PGS ได้") · .sub ที่เป็นซับภาพของ DVD ไปตัวดูซับภาพ ไม่มาถึงตรงนี้
pub const FF_TEXT: &[&str] = &["smi", "sami", "lrc", "rt", "jss", "aqt", "pjs", "mpl", "sub", "scc"];
/// ซับข้อความที่ ffmpeg ไม่มีตัวอ่าน โปรแกรมแปลงเป็น SRT เอง (subconv.rs)
pub const OWN_TEXT: &[&str] = &["sbv", "ttml", "dfxp"];

pub fn bytes_of(tools: &Path, work: &Path, path: &Path, in_movie: bool, tid: u64, ff: u64) -> Result<(Vec<u8>, String), String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // อ่านตรงเฉพาะไฟล์ซับข้อความ · ไฟล์ห่อที่เพิ่ม (MKS MKA MP4) ดึงแทร็กด้วยเครื่องมือแบบซับในหนัง
    // (ผู้ช่วยตรวจขั้น 10 ข้อ 6 · เดิมอ่าน MKS ทั้งไฟล์เป็นข้อความ ได้อักษรขยะ 0 บรรทัด)
    let plain = matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt");
    if !in_movie && OWN_TEXT.contains(&ext.as_str()) {
        let raw = std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?;
        return Ok((crate::subconv::to_srt(&ext, &decode_text(&raw).0)?.into_bytes(), "srt".into()));
    }
    if !in_movie && FF_TEXT.contains(&ext.as_str()) {
        // ffmpeg อ่านซับข้อความเป็น UTF-8 · ไฟล์ไทยแบบเก่าบอกชุดอักษรที่เดาได้ก่อน
        let raw = std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?;
        let cs = guess_charset(&raw);
        let mut args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into()];
        if cs != "UTF-8" && !raw.starts_with(&[0xFF, 0xFE]) && !raw.starts_with(&[0xFE, 0xFF]) { args.push("-sub_charenc".into()); args.push(cs.into()); }
        args.extend(["-i".into(), path.into(), "-map".into(), "0:s:0".into(), "-c:s".into(), "ass".into(), "-f".into(), "ass".into(), "-".into()]);
        let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120))?;
        if !tool_succeeded("ffmpeg", &o.status) || o.stdout.is_empty() {
            let why = String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
            return Err(format!("แปลงซับ .{ext} ไม่สำเร็จ {why}"));
        }
        return Ok((o.stdout, "ass".into()));
    }
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

/// ภาพหนังหนึ่งภาพ เป็นไบต์ JPEG · ใช้ตัวดึงภาพตรงเฟรมของหน้าแก้ซับ (vidframes.rs) ตัวเดียวกัน
/// เลือกภาพแรกที่ไม่ใช่รูปปก เดิมไม่ระบุ ไฟล์ MP4 ที่มีปกใหญ่กว่าภาพหนัง ffmpeg หยิบปกมาแทนภาพหนัง
fn frame_jpg(tools: &Path, movie: &Path, t: f64, h: u32) -> Result<Vec<u8>, String> {
    crate::vidframes::frames_jpg(tools, movie, t, 1, h)?.into_iter().next().ok_or_else(|| "ดึงภาพหนังไม่ได้".into())
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
    /// ซับบังคับ (forced) · ซับรูปที่ ffmpeg วาดให้ไม่รู้ค่านี้ เป็น false
    #[serde(default)]
    pub forced: bool,
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

pub(crate) fn cache_key(path: &Path, ff: u64) -> String {
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

/// ภาพซับหนึ่งภาพที่อ่านจากไฟล์ .sup · ตำแหน่งบนจอกับภาพเฉพาะกรอบที่มีตัวหนังสือ
/// forced คือซับบังคับ (ธงในส่วนองค์ประกอบของ PGS) ไว้ใช้กับตัวกรองเฉพาะซับบังคับของ OCR
pub struct SupShow { pub start: f64, pub end: Option<f64>, pub canvas: (u32, u32), pub at: (u32, u32), pub img: image::RgbaImage, pub forced: bool }

/// ถอดภาพตามแบบ RLE ของ PGS · ไบต์ไม่ศูนย์คือสีหนึ่งจุด · 0 ตามด้วยตัวบอกความยาวและสี · 0 0 จบแถว
fn pgs_rle(data: &[u8], w: usize, h: usize, pal: &[[u8; 4]; 256]) -> image::RgbaImage {
    let mut img = image::RgbaImage::new(w as u32, h as u32);
    let (mut x, mut y, mut i) = (0usize, 0usize, 0usize);
    let mut put = |x: &mut usize, y: usize, n: usize, c: u8| {
        for _ in 0..n { if *x < w && y < h { img.put_pixel(*x as u32, y as u32, image::Rgba(pal[c as usize])); } *x += 1; }
    };
    while i < data.len() && y < h {
        let b = data[i]; i += 1;
        if b != 0 { put(&mut x, y, 1, b); continue; }
        let Some(&f) = data.get(i) else { break }; i += 1;
        if f == 0 { x = 0; y += 1; continue; }
        let mut n = (f & 0x3F) as usize;
        if f & 0x40 != 0 { let Some(&lo) = data.get(i) else { break }; i += 1; n = (n << 8) | lo as usize; }
        let c = if f & 0x80 != 0 { let Some(&c) = data.get(i) else { break }; i += 1; c } else { 0 };
        put(&mut x, y, n, c);
    }
    img
}

/// อ่านไฟล์ซับรูป PGS (.sup) ตรง ๆ ได้ภาพกับเวลาจากในไฟล์ · ไม่ต้องให้ ffmpeg วาดภาพเต็มจอทุกครั้งที่ซับเปลี่ยน
/// เดิมเปิดดูซับ PGS ของหนังหนึ่งเรื่องนานมาก (พี่กันทัก 15 พ.ย. 2569 "เราเปิดดู PGS นานมากกก")
/// ภาพที่เหมือนภาพก่อนหน้า (แสดงซ้ำ) รวมเป็นภาพเดียว · สีแปลงตาม BT.709 เมื่อจอสูงตั้งแต่ 720 นอกนั้น BT.601 แบบ pgs::rgb_of
pub fn parse_sup(data: &[u8]) -> Vec<SupShow> {
    let be16 = |p: &[u8], i: usize| -> usize { p.get(i..i + 2).map(|b| ((b[0] as usize) << 8) | b[1] as usize).unwrap_or(0) };
    let mut out: Vec<SupShow> = Vec::new();
    let mut pals: std::collections::HashMap<u8, [[u8; 4]; 256]> = Default::default();
    let mut objs: std::collections::HashMap<u16, (usize, usize, Vec<u8>)> = Default::default();
    // องค์ประกอบของชุดแสดงที่กำลังอ่าน (เวลา จอ จานสี และวัตถุพร้อมตำแหน่ง)
    let mut pcs: Option<(f64, (u32, u32), u8, Vec<(u16, u32, u32)>, bool)> = None;
    let mut i = 0usize;
    while i + 13 <= data.len() {
        if &data[i..i + 2] != b"PG" { break; }
        let pts = u32::from_be_bytes([data[i + 2], data[i + 3], data[i + 4], data[i + 5]]) as f64 / 90000.0;
        let kind = data[i + 10];
        let size = be16(data, i + 11);
        let p = data.get(i + 13..i + 13 + size).unwrap_or(&[]);
        i += 13 + size;
        match kind {
            0x16 => {
                let (w, h) = (be16(p, 0) as u32, be16(p, 2) as u32);
                let pal_id = p.get(9).copied().unwrap_or(0);
                let n = p.get(10).copied().unwrap_or(0) as usize;
                let mut list = Vec::new();
                let mut forced = false;
                let mut o = 11;
                for _ in 0..n {
                    if o + 8 > p.len() { break; }
                    let id = be16(p, o) as u16;
                    let cropped = p[o + 3] & 0x80 != 0;
                    forced |= p[o + 3] & 0x40 != 0;
                    list.push((id, be16(p, o + 4) as u32, be16(p, o + 6) as u32));
                    o += if cropped { 16 } else { 8 };
                }
                pcs = Some((pts, (w, h), pal_id, list, forced));
            }
            0x14 => {
                let bt709 = pcs.as_ref().map(|c| c.1 .1 >= 720).unwrap_or(true);
                let id = p.first().copied().unwrap_or(0);
                let pal = pals.entry(id).or_insert([[0; 4]; 256]);
                for e in p.get(2..).unwrap_or(&[]).chunks_exact(5) {
                    let [r, g, b] = crate::pgs::rgb_of(e[1], e[2], e[3], bt709);
                    pal[e[0] as usize] = [r, g, b, e[4]];
                }
            }
            0x15 => {
                let id = be16(p, 0) as u16;
                let seq = p.get(3).copied().unwrap_or(0);
                if seq & 0x80 != 0 {
                    let (w, h) = (be16(p, 7), be16(p, 9));
                    objs.insert(id, (w, h, p.get(11..).unwrap_or(&[]).to_vec()));
                } else if let Some(o) = objs.get_mut(&id) {
                    o.2.extend_from_slice(p.get(4..).unwrap_or(&[]));
                }
            }
            0x80 => {
                let Some((t, canvas, pal_id, list, forced)) = pcs.take() else { continue };
                // ชุดแสดงที่ไม่มีวัตถุคือซับหาย ปิดภาพก่อนหน้า
                if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
                if list.is_empty() { continue; }
                let pal = pals.get(&pal_id).copied().unwrap_or([[0; 4]; 256]);
                let parts: Vec<(u32, u32, image::RgbaImage)> = list.iter().filter_map(|(id, x, y)| objs.get(id).map(|(w, h, d)| (*x, *y, pgs_rle(d, *w, *h, &pal)))).collect();
                if parts.is_empty() { continue; }
                let x0 = parts.iter().map(|p| p.0).min().unwrap();
                let y0 = parts.iter().map(|p| p.1).min().unwrap();
                let x1 = parts.iter().map(|p| p.0 + p.2.width()).max().unwrap();
                let y1 = parts.iter().map(|p| p.1 + p.2.height()).max().unwrap();
                let mut img = image::RgbaImage::new(x1 - x0, y1 - y0);
                for (x, y, part) in &parts { image::imageops::overlay(&mut img, part, (*x - x0) as i64, (*y - y0) as i64); }
                if img.pixels().all(|p| p[3] <= 8) { continue; }
                // ภาพเดิมแสดงซ้ำ (เริ่ม epoch ใหม่) ต่อเวลาภาพเดิม ไม่นับเป็นภาพใหม่
                if let Some(prev) = out.last_mut() {
                    if prev.end == Some(t) && prev.at == (x0, y0) && prev.img == img { prev.end = None; continue; }
                }
                out.push(SupShow { start: t, end: None, canvas, at: (x0, y0), img, forced });
            }
            _ => {}
        }
    }
    out
}

/// ตัดภาพให้เหลือเฉพาะตัวหนังสือแล้วเผื่อขอบ 4 จุด · ภาพที่ PGS กับ VobSub ให้มามีขอบใสรอบตัวหนังสือ หน้าจอวางภาพที่ตำแหน่งเดิม
/// ภาพไม่มีหมึกเลยคืน None
pub(crate) fn crop_ink(img: &image::RgbaImage, at: (u32, u32), canvas: (u32, u32)) -> Option<((u32, u32), image::RgbaImage)> {
    let (iw, ih) = img.dimensions();
    let (mut x0, mut y0, mut x1, mut y1) = (iw, ih, 0u32, 0u32);
    for (x, y, p) in img.enumerate_pixels() { if p[3] > 8 { x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y); } }
    if x1 < x0 { return None; }
    let pad = 4u32;
    let (cx, cy) = ((at.0 + x0).saturating_sub(pad), (at.1 + y0).saturating_sub(pad));
    let (ex, ey) = ((at.0 + x1 + pad + 1).min(canvas.0.max(at.0 + iw)), (at.1 + y1 + pad + 1).min(canvas.1.max(at.1 + ih)));
    let mut out = image::RgbaImage::new(ex - cx, ey - cy);
    image::imageops::overlay(&mut out, img, at.0 as i64 - cx as i64, at.1 as i64 - cy as i64);
    Some(((cx, cy), out))
}

/// ความยาวของไฟล์ (วินาที) ไว้คิดเปอร์เซ็นต์ของ ffmpeg · ไม่รู้คืน 0
fn duration_of(tools: &Path, path: &Path) -> f64 { crate::vobsub::stream_codec(tools, path, u64::MAX).1 }

/// ทางเร็วของซับรูป PGS · ลอกแทร็กออกมาเป็น .sup (ไม่ถอดภาพหนัง) แล้วอ่านเอง · อ่านไม่ได้หรือไม่ใช่ PGS คืน None ให้ใช้ทางเดิม
/// การลอกแทร็กอ่านไฟล์หนังทั้งไฟล์ บอกเปอร์เซ็นต์ตามเวลาที่ ffmpeg อ่านถึง (BUGS ข้อ 144)
fn images_from_sup(tools: &Path, dir: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Option<Vec<SubImg>> {
    let is_sup = path.extension().map(|e| e.eq_ignore_ascii_case("sup")).unwrap_or(false);
    let data = if is_sup && ff == 0 {
        std::fs::read(path).ok()?
    } else {
        let sup = dir.join("track.sup");
        let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-nostats".into(), "-y".into(), "-progress".into(), "pipe:1".into(), "-copyts".into(), "-i".into(), path.into(),
            "-map".into(), format!("0:{ff}").into(), "-c".into(), "copy".into(), "-f".into(), "sup".into(), sup.clone().into()];
        let (ok, _, _) = crate::vobsub::run_progress(tools, "ffmpeg", &args, duration_of(tools, path), &|p| on(p * 0.95)).ok()?;
        if !ok { let _ = std::fs::remove_file(&sup); return None; }
        let d = std::fs::read(&sup).ok()?;
        let _ = std::fs::remove_file(&sup);
        d
    };
    let shows = parse_sup(&data);
    if shows.is_empty() { return None; }
    let mut out = Vec::with_capacity(shows.len());
    for s in shows.into_iter() {
        let Some((at, img)) = crop_ink(&s.img, s.at, s.canvas) else { continue };
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        img.save(&file).ok()?;
        // เวลาจบห่างเกิน 60 วินาที (ภาพค้างท้ายไฟล์) ถือว่าไม่รู้เวลาจบ เหมือนทางเดิม
        let end = s.end.filter(|e| *e >= s.start && e - s.start <= 60.0).map(|e| (e * 1000.0).round() / 1000.0);
        out.push(SubImg { n, start: (s.start * 1000.0).round() / 1000.0, end, w: img.width(), h: img.height(), canvas: [s.canvas.0, s.canvas.1], at: [at.0, at.1], forced: s.forced, file });
    }
    Some(out)
}

/// ซับรูป VobSub อ่านเอง (vobsub.rs) · ไฟล์ .idx กับ .sub ที่เปิดตรงอ่านทันที · ซับในหนังดึงคู่ไฟล์ออกมาเก็บในโฟลเดอร์ของผลก่อน
/// คู่ไฟล์ที่ดึงมาเก็บไว้กับภาพ (track.idx track.sub) ให้ OCR วาดภาพใหม่ด้วยสีที่เลือกได้ ไม่ต้องดึงจากหนังซ้ำ · ไม่ใช่ VobSub คืน Ok(None)
fn images_from_vobsub(tools: &Path, dir: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Option<Vec<SubImg>>, String> {
    let (idx, sub) = if let (Some(pair), 0) = (crate::vobsub::pair_of(path), ff) {
        pair
    } else if crate::vobsub::is_vobsub_stream(tools, path, ff) {
        crate::vobsub::extract_pair(tools, dir, path, ff, &|p| on(p * 0.9))?
    } else {
        return Ok(None);
    };
    let text = std::fs::read(&idx).map_err(|e| format!("อ่านไฟล์ .idx ไม่ได้ {e}"))?;
    let data = std::fs::read(&sub).map_err(|e| format!("อ่านไฟล์ .sub ไม่ได้ {e}"))?;
    let file = crate::vobsub::parse_idx(&decode_text(&text).0);
    let shows = crate::vobsub::read(&file, &data, 0, &|p| on(90.0 + p * 0.1));
    if shows.is_empty() { return Err("อ่านภาพในซับ VobSub ไม่ได้สักภาพ ไฟล์ .sub อาจไม่ตรงกับไฟล์ .idx".into()); }
    let mut out = Vec::with_capacity(shows.len());
    for s in shows {
        let Some((at, img)) = crop_ink(&s.img, s.at, s.canvas) else { continue };
        let n = out.len() + 1;
        let f = dir.join(format!("c{n:06}.png"));
        img.save(&f).map_err(|e| format!("เก็บภาพซับไม่ได้ {e}"))?;
        let r = |v: f64| (v * 1000.0).round() / 1000.0;
        out.push(SubImg { n, start: r(s.start), end: s.end.map(r), w: img.width(), h: img.height(), canvas: [s.canvas.0, s.canvas.1], at: [at.0, at.1], forced: s.forced, file: f });
    }
    Ok(Some(out))
}

/// ถอดแบบไม่รายงานความคืบหน้า ใช้ในเทส
#[cfg(test)]
pub fn images(tools: &Path, work: &Path, path: &Path, ff: u64) -> Result<Vec<SubImg>, String> {
    images_with(tools, work, path, ff, &|_| {})
}

/// ถอดซับรูปทั้งแทร็กพร้อมบอกความคืบหน้า 0–100 · หนังยาวส่วนที่นานคืออ่านไฟล์หนังทั้งไฟล์ (BUGS ข้อ 144)
pub fn images_with(tools: &Path, work: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Vec<SubImg>, String> {
    // ซับ HD DVD ffmpeg อ่านไม่ได้ ถอดจากไฟล์ PGS ที่ BDSup2Sub++ แปลงไว้ในโฟลเดอร์ทำงานแทน (BUGS ข้อ 129)
    let hd;
    let (path, ff) = if crate::imgconv::is_hddvd_sup(path) { hd = crate::imgconv::hddvd_pgs(tools, work, path)?.0; (hd.as_path(), 0) } else { (path, ff) };
    let key = cache_key(path, ff);
    // v2 ใส่ -copyts แล้ว ผลที่ถอดไว้ก่อนหน้านี้เวลาเริ่มที่ศูนย์ผิด ใช้ชื่อใหม่ไม่ให้หยิบของเก่า (BUGS ข้อ 125 เจอ 15 พ.ย. 2569)
    // v3 อ่าน VobSub เองและเก็บธงซับบังคับ ผลเก่าของ VobSub เป็นภาพที่ ffmpeg วาด ไม่มีคู่ไฟล์ให้ OCR วาดสีใหม่ (แผน OCR ขั้น 1)
    let dir = work.join(format!("subimg-v3-{key}"));
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
    on(0.0);
    let save = |out: Vec<SubImg>| -> Result<Vec<SubImg>, String> {
        let _ = std::fs::remove_dir_all(&raw);
        let _ = std::fs::write(&idx, serde_json::to_string(&out).unwrap_or_default());
        on(100.0);
        Ok(out)
    };
    // VobSub อ่านเองตามตำแหน่งในไฟล์ .idx (BUGS ข้อ 144) · ล้มกลางทางบอกสาเหตุ ไม่ไปวาดด้วย ffmpeg ซ้ำอีกรอบที่นานกว่า
    if let Some(out) = images_from_vobsub(tools, &dir, path, ff, on).inspect_err(|_| { let _ = std::fs::remove_dir_all(&dir); })? { return save(out); }
    // ซับ PGS อ่านจากไฟล์ .sup ตรง ๆ เร็วกว่าให้ ffmpeg วาดภาพเต็มจอหลายเท่า · ชนิดอื่นหรืออ่านไม่ได้ใช้ทางเดิมข้างล่าง
    if let Some(out) = images_from_sup(tools, &dir, path, ff, on) { return save(out); }
    let out = images_by_render(tools, &dir, &raw, path, ff, on)?;
    save(out)
}

/// ทางเดิม ให้ ffmpeg วาดซับแบบ sub2video เป็นภาพเต็มจอทุกครั้งที่ซับเปลี่ยน แล้วหากรอบตัวหนังสือ · ใช้กับ DVB DivX และไฟล์ที่ทางเร็วอ่านไม่ได้
pub(crate) fn images_by_render(tools: &Path, dir: &Path, raw: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Vec<SubImg>, String> {
    // sub2video ได้ภาพทุกครั้งที่ซับเปลี่ยน · showinfo บอกเวลาของแต่ละภาพ
    // -copyts คงเวลาจริงของไฟล์ เดิมไม่ใส่ ffmpeg เลื่อนภาพแรกให้เริ่มที่ศูนย์ ซับที่ภาพแรกอยู่ 2:12.48 ขึ้นว่า 0:00.0 (เจอตอนทำหน้าต่างแปลงซับภาพ 15 พ.ย. 2569)
    // -progress pipe:1 บอกเวลาที่อ่านถึงทางช่องออก ใช้คิดเปอร์เซ็นต์ (BUGS ข้อ 144) · showinfo ยังออกทางช่องผิดพลาดเหมือนเดิม
    let args: Vec<OsString> = vec!["-v".into(), "info".into(), "-nostdin".into(), "-nostats".into(), "-progress".into(), "pipe:1".into(), "-copyts".into(), "-i".into(), path.into(),
        "-filter_complex".into(), format!("[0:{ff}]format=rgba,showinfo[v]").into(), "-map".into(), "[v]".into(), "-fps_mode".into(), "passthrough".into(),
        "-f".into(), "image2".into(), raw.join("%06d.png").into()];
    let (_, _, log) = crate::vobsub::run_progress(tools, "ffmpeg", &args, duration_of(tools, path), &|p| on(p * 0.9))?;
    let times: Vec<f64> = log.lines().filter(|l| l.contains("Parsed_showinfo") && l.contains(" n:")).filter_map(|l| {
        let p = l.split("pts_time:").nth(1)?;
        p.split_whitespace().next()?.parse::<f64>().ok()
    }).collect();
    if times.is_empty() {
        let _ = std::fs::remove_dir_all(dir);
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
        out.push(SubImg { n, start: (t * 1000.0).round() / 1000.0, end: None, w: cw, h: ch, canvas: [w, h], at: [cx, cy], forced: false, file });
    }
    // ภาพสุดท้ายที่ไม่มีภาพว่างตามมา หรือเวลาจบห่างเกิน 60 วินาที (ภาพปิดท้ายไฟล์) ไม่รู้เวลาจบ
    for i in out.iter_mut() { if let Some(e) = i.end { if e - i.start > 60.0 || e < i.start { i.end = None; } else { i.end = Some((e * 1000.0).round() / 1000.0); } } }
    let _ = std::fs::remove_dir_all(&raw);
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

/// ความคืบหน้าของการถอดซับรูปทั้งแทร็ก ส่งทางเหตุการณ์ subimg-progress { path ff percent } เมื่อเปอร์เซ็นต์เต็มเปลี่ยน
/// หน้าจอใช้แสดงแถบความคืบหน้ากับเวลาที่เดินระหว่างรอ (BUGS ข้อ 144)
pub(crate) fn progress_to(app: &AppHandle, path: &str, ff: u64) -> impl Fn(f64) + Send + Sync + use<> {
    let app = app.clone();
    let path = path.to_string();
    let last = std::sync::atomic::AtomicI64::new(-1);
    move |p: f64| {
        let v = p.clamp(0.0, 100.0).floor() as i64;
        if last.swap(v, std::sync::atomic::Ordering::Relaxed) != v {
            let _ = tauri::Emitter::emit(&app, "subimg-progress", serde_json::json!({ "path": path, "ff": ff, "percent": v }));
        }
    }
}

/// ซับรูปทีละหน้า · ครั้งแรกถอดทั้งแทร็ก (หนังยาวใช้เวลา เพราะต้องอ่านทั้งไฟล์)
#[tauri::command]
pub async fn sub_images(app: AppHandle, path: String, ff: u64, page: usize, per: usize) -> Result<ImgPage, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    let on = progress_to(&app, &path, ff);
    tauri::async_runtime::spawn_blocking(move || {
        let all = images_with(&tools, &work, &need(&path)?, ff, &on)?;
        let per = per.clamp(1, 48);
        let items = all.iter().skip(page * per).take(per).map(|i| {
            let png = std::fs::read(&i.file).map(|b| format!("data:image/png;base64,{}", crate::audiograph::b64(&b))).unwrap_or_default();
            ImgItem { img: i.clone(), png }
        }).collect();
        Ok(ImgPage { total: all.len(), items })
    }).await.map_err(|e| e.to_string())?
}

/// เวลาของทุกภาพในซับรูป ไม่มีตัวภาพ ไว้ทำรายการเวลาด้านซ้ายของตัวดูซับรูปให้กดไปภาพนั้น
/// (BUGS ข้อ 141 พี่กันขอ 15 พ.ย. 2569 "ขอฝั่งซ้าย มีเวลาให้กดได้") · ใช้ผลถอดชุดเดียวกับ sub_images ไม่ถอดซ้ำ
#[tauri::command]
pub async fn sub_image_times(app: AppHandle, path: String, ff: u64) -> Result<Vec<SubImg>, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    let on = progress_to(&app, &path, ff);
    tauri::async_runtime::spawn_blocking(move || images_with(&tools, &work, &need(&path)?, ff, &on))
        .await.map_err(|e| e.to_string())?
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

    /// ซับรูป .sup ที่ภาพแรกไม่ได้อยู่ที่ศูนย์ เวลาของภาพต้องเป็นเวลาจริงของไฟล์ · ให้ ffmpeg เลื่อนซับตัวอย่างไปเริ่มที่ 100 วินาที
    /// (เดิมไม่ใส่ -copyts ffmpeg เลื่อนภาพแรกเป็น 0 วินาที ตัวดูซับรูปกับหน้าต่างแปลงซับภาพบอกเวลาผิดทุกภาพ เจอ 15 พ.ย. 2569
    ///  ไฟล์ VobSub ตัวอย่างไม่โดนเลื่อนเพราะเวลาเริ่มของไฟล์เป็นศูนย์ ใช้พิสูจน์บั๊กนี้ไม่ได้)
    /// ตัวอ่าน PGS ตรง ๆ ได้ภาพชุดเดียวกับทางเดิมที่ให้ ffmpeg วาด · จำนวนภาพ เวลาเริ่ม เวลาจบ ตำแหน่ง ขนาด ตรงกัน
    /// (พี่กันทัก 15 พ.ย. 2569 "เราเปิดดู PGS นานมากกก") · ไฟล์ .sup ตัวอย่างของ ffmpeg กับแทร็ก PGS ในหนังทดสอบซับรูป
    #[test]
    fn sup_reader_matches_render() {
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media");
        for (path, ff) in [(base.join("ซับตัวอย่าง-ffmpeg").join("pgs_sub.sup"), 0u64), (base.join("สร้าง").join("เสียงซับ").join("ซับรูป (2024).mkv"), 2)] {
            if !path.exists() { continue; }
            let w = work().join(format!("supcmp-{ff}"));
            let _ = std::fs::remove_dir_all(&w);
            std::fs::create_dir_all(w.join("raw")).unwrap();
            let fast = images_from_sup(&tools(), &w, &path, ff, &|_| {}).expect("ทางเร็วต้องอ่าน PGS ได้");
            let slow = images_by_render(&tools(), &w, &w.join("raw"), &path, ff, &|_| {}).unwrap();
            assert_eq!(fast.len(), slow.len(), "{} จำนวนภาพ", path.display());
            for (a, b) in fast.iter().zip(&slow) {
                assert!((a.start - b.start).abs() < 0.05, "เริ่ม {} กับ {}", a.start, b.start);
                assert_eq!(a.end.is_some(), b.end.is_some(), "ภาพ {} เวลาจบ {:?} กับ {:?}", a.n, a.end, b.end);
                if let (Some(x), Some(y)) = (a.end, b.end) { assert!((x - y).abs() < 0.05, "จบ {x} กับ {y}"); }
                assert_eq!(a.canvas, b.canvas);
                // ทางเดิมเผื่อขอบ 4 จุดรอบตัวหนังสือ ตำแหน่งกับขนาดจึงต่างได้ไม่เกินนั้น
                assert!(a.at[0].abs_diff(b.at[0]) <= 8 && a.at[1].abs_diff(b.at[1]) <= 8, "ตำแหน่ง {:?} กับ {:?}", a.at, b.at);
                assert!(a.w.abs_diff(b.w) <= 16 && a.h.abs_diff(b.h) <= 16, "ขนาด {}×{} กับ {}×{}", a.w, a.h, b.w, b.h);
            }
            let _ = std::fs::remove_dir_all(&w);
        }
    }

    /// วัดเวลากับไฟล์จริงที่ส่งมา (ตั้ง MOVIE_SHELF_SUP เป็นที่อยู่ไฟล์ .sup) · อ่านอย่างเดียว ไม่แตะไฟล์
    #[test]
    fn sup_reader_speed_on_real_file() {
        let Ok(p) = std::env::var("MOVIE_SHELF_SUP") else { return };
        let path = PathBuf::from(p);
        let w = work().join("supspeed");
        let _ = std::fs::remove_dir_all(&w);
        std::fs::create_dir_all(w.join("raw")).unwrap();
        let t = std::time::Instant::now();
        let fast = images_from_sup(&tools(), &w, &path, 0, &|_| {}).expect("ทางเร็วต้องอ่านได้");
        let tf = t.elapsed().as_secs_f64();
        eprintln!("ทางใหม่ {} ภาพ {:.1} วินาที", fast.len(), tf);
        if std::env::var("MOVIE_SHELF_SUP_SLOW").is_ok() {
            let t = std::time::Instant::now();
            let slow = images_by_render(&tools(), &w, &w.join("raw"), &path, 0, &|_| {}).unwrap();
            eprintln!("ทางเดิม {} ภาพ {:.1} วินาที", slow.len(), t.elapsed().as_secs_f64());
        }
        let _ = std::fs::remove_dir_all(&w);
    }

    #[test]
    fn image_times_are_real_file_times() {
        let sup = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("ซับตัวอย่าง-ffmpeg").join("pgs_sub.sup");
        if !sup.exists() { return; }
        let w = work().join("imgtime");
        let _ = std::fs::remove_dir_all(&w);
        std::fs::create_dir_all(&w).unwrap();
        let late = w.join("late.sup");
        let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-y".into(), "-itsoffset".into(), "100".into(), "-i".into(), sup.into(),
            "-map".into(), "0:s".into(), "-c".into(), "copy".into(), "-f".into(), "sup".into(), late.clone().into()];
        run_tool_timeout(&tools(), "ffmpeg", &args, Duration::from_secs(60)).unwrap();
        let v = images(&tools(), &w, &late, 0).unwrap();
        assert!(!v.is_empty());
        assert!((v[0].start - 100.0).abs() < 0.1, "ภาพแรก {} ต้องราว 100 วินาที", v[0].start);
        let _ = std::fs::remove_dir_all(&w);
    }

    /// VobSub ในหนัง MKV อ่านเองด้วย vobsub.rs ได้ภาพชุดเดียวกับทางเดิมที่ให้ ffmpeg วาด (BUGS ข้อ 144)
    /// จำนวนภาพ เวลาเริ่ม ตำแหน่ง ตรงกัน · ความคืบหน้าไปถึง 100 · ผลเก็บคู่ไฟล์ track.idx track.sub ไว้ให้ OCR
    #[test]
    fn vobsub_in_movie_matches_render() {
        let Some(mkv) = av("ซับรูป (2024).mkv") else { return };
        let ff = (0..8u64).find(|i| crate::vobsub::is_vobsub_stream(&tools(), &mkv, *i)).expect("หนังทดสอบต้องมีแทร็ก VobSub");
        let w = work().join("vobmkv");
        let _ = std::fs::remove_dir_all(&w);
        std::fs::create_dir_all(&w).unwrap();
        let top = std::sync::atomic::AtomicI64::new(-1);
        let t = std::time::Instant::now();
        let fast = images_with(&tools(), &w, &mkv, ff, &|p| { top.fetch_max(p as i64, std::sync::atomic::Ordering::Relaxed); }).unwrap();
        eprintln!("ทางใหม่ {} ภาพ ใน {:.2} วินาที", fast.len(), t.elapsed().as_secs_f64());
        assert_eq!(top.load(std::sync::atomic::Ordering::Relaxed), 100, "ความคืบหน้าต้องจบที่ 100");
        assert!(fast[0].file.parent().unwrap().join("track.idx").is_file(), "ต้องเก็บคู่ไฟล์ไว้ให้ OCR");
        let raw = w.join("slow");
        std::fs::create_dir_all(raw.join("raw")).unwrap();
        let slow = images_by_render(&tools(), &raw, &raw.join("raw"), &mkv, ff, &|_| {}).unwrap();
        eprintln!("ทางเดิม {} ภาพ", slow.len());
        // ทุกภาพของทางเดิมต้องมีในทางใหม่ เวลากับตำแหน่งตรงกัน · ทางใหม่นับตามไฟล์ .idx แบบ Subtitle Edit
        // ภาพที่ทางเดิมไม่มีต้องเป็นภาพสั้นกว่า 0.1 วินาทีที่ ffmpeg รวมกับภาพข้าง ๆ (ไฟล์ทดสอบมีคู่ภาพห่างกันราว 10 มิลลิวินาที)
        for b in &slow {
            let a = fast.iter().find(|a| (a.start - b.start).abs() < 0.05).unwrap_or_else(|| panic!("ทางใหม่ไม่มีภาพที่ {} วินาที", b.start));
            assert!(a.at[0].abs_diff(b.at[0]) <= 2 && a.at[1].abs_diff(b.at[1]) <= 2, "ภาพ {} ตำแหน่ง {:?} กับ {:?}", a.n, a.at, b.at);
        }
        for a in &fast {
            if slow.iter().any(|b| (a.start - b.start).abs() < 0.05) { continue; }
            let near = |v: &[SubImg]| v.iter().filter(|x| (x.start - a.start).abs() < 4.0).map(|x| (x.start, x.end, x.at, x.w, x.h)).collect::<Vec<_>>();
            assert!(a.end.is_some_and(|e| e - a.start < 0.1), "ภาพ {} ที่ {} วินาทีมีแค่ทางใหม่ และไม่ใช่ภาพสั้น · ทางใหม่ใกล้ ๆ {:?} · ทางเดิมใกล้ ๆ {:?}", a.n, a.start, near(&fast), near(&slow));
        }
        let _ = std::fs::remove_dir_all(&w);
    }

    /// ซับ VobSub ไทย 720 × 480 ที่ make-test-media สร้างพร้อมคำตอบ · เปิดไฟล์ .idx ตรงได้ครบทุกภาพ ขนาดจอตามไฟล์ ทุกภาพมีเวลาจบ
    #[test]
    fn vobsub_pair_file_reads_all() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
        let idx = dir.join("th-480.idx");
        if !idx.exists() {
            assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี {} รัน node scripts/make-test-media.mjs ก่อน", idx.display());
            return;
        }
        let want = std::fs::read_to_string(dir.join("th-480.truth.txt")).unwrap().lines().filter(|l| !l.trim().is_empty()).count();
        let w = work().join("vobpair");
        let _ = std::fs::remove_dir_all(&w);
        let v = images(&tools(), &w, &idx, 0).unwrap();
        assert_eq!(v.len(), want, "จำนวนภาพต้องเท่าคำตอบ");
        assert!(v.iter().all(|i| i.canvas == [720, 480] && i.end.is_some_and(|e| e > i.start)));
        let _ = std::fs::remove_dir_all(&w);
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
