//! ร่องรอยตัวเข้ารหัสในไฟล์เสียง กับปุ่มตรวจ FLAC ด้วย MD5 (BUGS ข้อ 164.2 · ROADMAP ข้อ 48 · พี่กันเคาะเลข 32 "32 ทำเลย")
//! ① อ่านจาก MediaInfo ชื่อตัวเข้ารหัส ค่าที่ใช้เข้ารหัส โปรแกรมที่สร้างไฟล์ โหมดบิตเรต และ MD5 ของเสียงที่ FLAC ฝังไว้
//!    เป็นข้อความระบุผู้สร้างในส่วนแท็ก โปรแกรมแก้แท็กเขียนทับได้ จึงเป็นเบาะแส ไม่ใช่หลักฐานเด็ดขาด (หน้าจอบอกในปุ่ม ⓘ)
//! ② ตรวจ FLAC ด้วย flac -t ที่แนบมาอยู่แล้ว ถอดเสียงทั้งไฟล์แล้วเทียบกับ MD5 ในหัวไฟล์ ตรงกันคือเสียงไม่เสียแม้แต่บิตเดียว
//!    หัวไฟล์ไม่มี MD5 (ศูนย์ทั้งหมด) บอกว่าตรวจไม่ได้ ไม่บอกว่าผ่าน · อ่านอย่างเดียว ไม่แตะไฟล์

use std::ffi::OsStr;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

use crate::app::tools::{run_tool_timeout, tool_succeeded, tools_dir};

#[derive(Serialize, Default, Clone, Debug, PartialEq)]
pub struct EncInfo {
    /// ชื่อและรุ่นตัวเข้ารหัส เช่น LAME 3.100 · reference libFLAC 1.4.3
    pub library: Option<String>,
    /// ค่าที่ตัวเข้ารหัสจดไว้ เช่น -m j -V 0 -q 0
    pub settings: Option<String>,
    /// โปรแกรมที่สร้างไฟล์ เช่น qaac 2.80, CoreAudioToolbox 7.10.9.0
    pub app: Option<String>,
    /// VBR หรือ CBR ตามที่ MediaInfo บอก
    pub mode: Option<String>,
    /// MD5 ของเสียงล้วนที่ FLAC ฝังในหัวไฟล์ (ตัวพิมพ์เล็ก) · ศูนย์ทั้งหมดคือไม่ได้ฝัง
    pub md5: Option<String>,
    /// สรุปเป็นประโยคไทย เช่น LAME โหมด VBR ระดับ V0
    pub hint: Option<String>,
}

fn s(v: &Value, k: &str) -> Option<String> {
    v[k].as_str().map(str::trim).filter(|x| !x.is_empty()).map(String::from)
}

/// เลขหลังตัวเลือก เช่น "-V 0" หรือ "-V0" ได้ 0
fn opt_num(settings: &str, flag: &str) -> Option<String> {
    let parts: Vec<&str> = settings.split_whitespace().collect();
    for (i, p) in parts.iter().enumerate() {
        if *p == flag { return parts.get(i + 1).map(|x| x.to_string()); }
        if let Some(rest) = p.strip_prefix(flag) { if !rest.is_empty() && rest.chars().next().is_some_and(|c| c.is_ascii_digit()) { return Some(rest.to_string()); } }
    }
    None
}

/// สรุปเบาะแสเป็นประโยคไทย · ไม่รู้จักคืน None
pub fn hint_of(format: &str, e: &EncInfo) -> Option<String> {
    let lib = e.library.clone().unwrap_or_default();
    let app = e.app.clone().unwrap_or_default();
    let set = e.settings.clone().unwrap_or_default();
    let low = |x: &str| x.to_lowercase();
    if lib.starts_with("LAME") {
        if let Some(v) = opt_num(&set, "-V") { return Some(format!("LAME โหมด VBR ระดับ V{v}")); }
        if let Some(b) = opt_num(&set, "--abr") { return Some(format!("LAME โหมด ABR {b} kbps")); }
        if let Some(b) = opt_num(&set, "-b") { if e.mode.as_deref() == Some("CBR") || set.contains("--cbr") { return Some(format!("LAME โหมด CBR {b} kbps")); } }
        return Some(match e.mode.as_deref() { Some("VBR") => "LAME โหมด VBR".into(), Some("CBR") => "LAME โหมด CBR".into(), _ => "LAME".into() });
    }
    if format == "MPEG Audio" && !lib.is_empty() { return Some(format!("ไม่ได้มาจาก LAME ({lib})")); }
    if format == "AAC" {
        if low(&app).contains("qaac") { return Some("qaac ใช้เอนจินของ Apple".into()); }
        if low(&app).contains("itunes") || low(&lib).contains("itunes") { return Some("iTunes ใช้เอนจินของ Apple".into()); }
        if low(&app).contains("fdk") || low(&lib).contains("fdk") { return Some("FDK AAC".into()); }
        if low(&app).contains("nero") || low(&lib).contains("nero") { return Some("Nero AAC".into()); }
        if lib.starts_with("Lavc") || lib.starts_with("Lavf") || low(&app).starts_with("lavf") { return Some("ตัวเข้ารหัสในตัวของ ffmpeg".into()); }
    }
    if format == "FLAC" {
        if low(&lib).contains("libflac") { return Some("ตัวเข้ารหัส FLAC ต้นฉบับ".into()); }
        if lib.starts_with("Lavf") || lib.starts_with("Lavc") { return Some("ผ่าน ffmpeg".into()); }
    }
    None
}

/// ร่องรอยของแทร็กเสียงหนึ่งแทร็ก · general คือส่วน General ของไฟล์ (โปรแกรมที่สร้างไฟล์มักอยู่ที่นั่น)
pub fn enc_info(general: &Value, t: &Value) -> EncInfo {
    let library = match (s(t, "Encoded_Library_Name"), s(t, "Encoded_Library_Version")) {
        (Some(n), Some(v)) => Some(format!("{n} {v}")),
        _ => s(t, "Encoded_Library"),
    };
    // MediaInfo เขียนช่องที่ไม่ใช่ช่องมาตรฐานไว้ใต้ extra
    let md5 = s(t, "MD5_Unencoded").or_else(|| t["extra"]["MD5_Unencoded"].as_str().map(String::from)).map(|m| m.to_lowercase());
    let mut e = EncInfo {
        library,
        settings: s(t, "Encoded_Library_Settings"),
        app: s(t, "Encoded_Application").or_else(|| s(general, "Encoded_Application")),
        mode: s(t, "BitRate_Mode"),
        md5,
        hint: None,
    };
    e.hint = hint_of(&s(t, "Format").unwrap_or_default(), &e);
    e
}

/// ร่องรอยตัวเข้ารหัสของแทร็กเสียงทุกแทร็ก เรียงตามลำดับแทร็กเสียงในไฟล์
#[tauri::command]
pub async fn audio_encoder_info(app: AppHandle, path: String) -> Result<Vec<EncInfo>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        let out = run_tool_timeout(&tools, "MediaInfo", [OsStr::new("--Output=JSON"), p.as_os_str()], Duration::from_secs(60))?;
        let j: Value = serde_json::from_slice(&out.stdout).map_err(|_| "อ่านผลของ MediaInfo ไม่ได้".to_string())?;
        let tracks = j["media"]["track"].as_array().cloned().unwrap_or_default();
        let general = tracks.iter().find(|t| t["@type"] == "General").cloned().unwrap_or(Value::Null);
        Ok(tracks.iter().filter(|t| t["@type"] == "Audio").map(|t| enc_info(&general, t)).collect())
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct FlacCheck {
    /// ok เสียงตรงกับ MD5 ทุกบิต · bad ถอดไม่ได้หรือ MD5 ไม่ตรง · nomd5 หัวไฟล์ไม่มี MD5 ตรวจไม่ได้ · unsupported ไม่ใช่ไฟล์ FLAC
    pub status: String,
    pub detail: String,
    pub secs: f64,
}

/// แปลผลของ flac -t · ok คือ flac จบด้วยสำเร็จ · stderr คือข้อความของ flac
pub fn read_flac_test(ok: bool, stderr: &str) -> (String, String) {
    let lines: Vec<&str> = stderr.split(['\r', '\n']).map(str::trim).filter(|l| !l.is_empty()).collect();
    let low = stderr.to_lowercase();
    if low.contains("cannot check md5") || low.contains("md5 signature was unset") || low.contains("unset in the streaminfo") {
        return ("nomd5".into(), "หัวไฟล์ไม่ได้ฝัง MD5 ไว้ ส่วนการถอดเสียงทั้งไฟล์ผ่าน".into());
    }
    if ok { return ("ok".into(), "ถอดเสียงทั้งไฟล์มาเทียบแล้ว".into()); }
    let why = lines.iter().rev().find(|l| l.to_lowercase().contains("error") || l.to_lowercase().contains("mismatch")).or(lines.last()).copied().unwrap_or("flac ถอดไฟล์ไม่ได้");
    let head = if low.contains("mismatch") { "เสียงเปลี่ยนไปจากตอนเข้ารหัส" } else { "ถอดเสียงไม่ได้ทั้งไฟล์ ไฟล์อาจเสีย" };
    ("bad".into(), format!("{head}  {why}"))
}

/// ตรวจไฟล์ FLAC ด้วย flac -t (ถอดเสียงทั้งไฟล์ เทียบ MD5 ในหัวไฟล์) · ไม่ใช่ .flac หรือ .oga ตอบว่าไม่รองรับ
#[tauri::command]
pub async fn flac_verify(app: AppHandle, path: String) -> Result<FlacCheck, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string()); }
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "flac" && ext != "oga" {
            return Ok(FlacCheck { status: "unsupported".into(), detail: "ปุ่มนี้ตรวจได้เฉพาะไฟล์ .flac เพราะ FLAC ในไฟล์อื่น เช่น MKV ไม่มีหัวไฟล์ของ FLAC ให้ flac อ่าน".into(), secs: 0.0 });
        }
        let t0 = Instant::now();
        let o = run_tool_timeout(&tools, "flac", [OsStr::new("-t"), p.as_os_str()], Duration::from_secs(3600))?;
        let (status, detail) = read_flac_test(tool_succeeded("flac", &o.status), &String::from_utf8_lossy(&o.stderr));
        Ok(FlacCheck { status, detail, secs: t0.elapsed().as_secs_f64() })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "encinfo_tests.rs"]
mod tests;
