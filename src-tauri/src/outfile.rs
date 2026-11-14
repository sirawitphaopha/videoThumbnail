//! เครื่องช่วยของงานที่ทำไฟล์ใหม่ข้างไฟล์หนัง ใช้ร่วมกันระหว่างหน้าใส่โปสเตอร์ (poster.rs) กับหน้าเสียงและซับ (merge.rs)
//! ย้ายมาจาก poster.rs ทั้งก้อนตอนเริ่มงานเสียงและซับ (แผนขั้น 0) ไม่ได้แก้พฤติกรรม
//! อ่านแทร็กด้วย ffprobe · ที่ว่างในไดรฟ์ · ไฟล์ถูกเปิดอยู่ไหม · ถังขยะ · ชื่อไม่ชน · โฟลเดอร์ไฟล์เดิม · เรียกเครื่องมือพร้อมความคืบหน้าและตัวหยุด

use std::ffi::{OsStr, OsString};
use std::io::{BufRead, BufReader, Read};
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::tools::{run_tool_timeout, tool_command, tool_succeeded};

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub index: u64,
    /// video audio subtitle
    pub kind: String,
    pub codec: String,
    pub lang: Option<String>,
    /// ok ใส่ใน MP4 ได้ · style ได้แต่สีกับฟอนต์หาย · no ใส่ไม่ได้
    pub mp4: String,
    /// คำอธิบายว่าเป็นแทร็กอะไร ทำไมใส่ MP4 ไม่ได้
    pub why: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Counts {
    pub video: usize,
    pub audio: usize,
    pub subs: usize,
}

/// ภาษาเป็นคำไทย
pub fn lang_word(code: &str) -> Option<String> {
    let w = match code {
        "tha" | "th" => "ไทย", "eng" | "en" => "อังกฤษ", "jpn" | "ja" => "ญี่ปุ่น", "kor" | "ko" => "เกาหลี",
        "chi" | "zho" | "zh" => "จีน", "fre" | "fra" | "fr" => "ฝรั่งเศส", "" | "und" => return None, _ => return Some(code.to_string()),
    };
    Some(w.to_string())
}

/// แทร็กนี้ใส่ใน MP4 แบบไม่แปลงภาพเสียงใหม่ได้ไหม (ffmpeg ตัวเก็บไฟล์ MP4)
pub fn mp4_fit(kind: &str, codec: &str) -> (&'static str, Option<String>) {
    match kind {
        "video" => match codec {
            "h264" | "hevc" | "av1" | "vp9" | "mpeg4" | "mpeg2video" | "mpeg1video" => ("ok", None),
            c => ("no", Some(format!("ภาพชนิด {c} ใส่ใน MP4 ไม่ได้"))),
        },
        "audio" => match codec {
            "aac" | "mp3" | "ac3" | "eac3" | "opus" | "flac" | "alac" | "mp2" | "dts" => ("ok", None),
            "wmav1" | "wmav2" | "wmapro" => ("no", Some("เป็นเสียงแบบ Windows Media".into())),
            "vorbis" => ("no", Some("เป็นเสียงแบบ Vorbis".into())),
            "truehd" => ("no", Some("เป็นเสียงแบบ Dolby TrueHD".into())),
            c if c.starts_with("pcm_") => ("no", Some("เป็นเสียงแบบไม่บีบอัด (PCM)".into())),
            c => ("no", Some(format!("เป็นเสียงชนิด {c}"))),
        },
        "subtitle" => match codec {
            "mov_text" | "subrip" | "webvtt" | "text" => ("ok", None),
            "ass" | "ssa" => ("style", Some("ซับ ASS ใน MP4 สีกับฟอนต์หาย เหลือตัวหนังสือล้วน".into())),
            "hdmv_pgs_subtitle" => ("no", Some("เป็นซับแบบภาพจากแผ่นบลูเรย์".into())),
            "dvd_subtitle" => ("no", Some("เป็นซับแบบภาพจากแผ่น DVD".into())),
            "dvb_subtitle" => ("no", Some("เป็นซับแบบภาพจากทีวีดิจิทัล".into())),
            c => ("no", Some(format!("เป็นซับชนิด {c}"))),
        },
        _ => ("no", None),
    }
}

pub fn ffprobe_json(tools: &Path, file: &Path) -> Result<Value, String> {
    let out = run_tool_timeout(tools, "ffprobe", [
        OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
        OsStr::new("-show_format"), OsStr::new("-show_streams"), file.as_os_str(),
    ], Duration::from_secs(60))?;
    if !tool_succeeded("ffprobe", &out.status) {
        return Err(format!("อ่านข้อมูลไฟล์ไม่ได้ {}", String::from_utf8_lossy(&out.stderr).lines().last().unwrap_or("").trim()));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))
}

/// แทร็กภาพ เสียง ซับ ของไฟล์ (ไม่นับรูปปกที่ติดมา)
pub fn streams_of(j: &Value) -> Vec<StreamInfo> {
    let empty = vec![];
    j["streams"].as_array().unwrap_or(&empty).iter().filter_map(|st| {
        let kind = st["codec_type"].as_str().unwrap_or("");
        if !matches!(kind, "video" | "audio" | "subtitle") || st["disposition"]["attached_pic"].as_i64() == Some(1) {
            return None;
        }
        let codec = st["codec_name"].as_str().unwrap_or("").to_string();
        let (fit, why) = mp4_fit(kind, &codec);
        Some(StreamInfo {
            index: st["index"].as_u64().unwrap_or(0), kind: kind.into(), lang: lang_word(st["tags"]["language"].as_str().unwrap_or("")),
            mp4: fit.into(), why, codec,
        })
    }).collect()
}

pub fn count(streams: &[StreamInfo]) -> Counts {
    Counts {
        video: streams.iter().filter(|s| s.kind == "video").count(),
        audio: streams.iter().filter(|s| s.kind == "audio").count(),
        subs: streams.iter().filter(|s| s.kind == "subtitle").count(),
    }
}

pub fn duration_of(j: &Value) -> Option<f64> {
    j["format"]["duration"].as_str().and_then(|d| d.parse().ok())
}

/// ตัวหลอกที่ว่างในไดรฟ์ ใช้ในเทส (0 = ไม่หลอก) · ตัวติดตั้งจริงตั้งค่านี้ไม่ได้
pub static FAKE_FREE: AtomicU64 = AtomicU64::new(0);

pub fn wide(p: &Path) -> Vec<u16> {
    p.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}

pub fn free_space(dir: &Path) -> u64 {
    let fake = FAKE_FREE.load(Ordering::SeqCst);
    if fake > 0 {
        return fake;
    }
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let mut free: u64 = 0;
    let ok = unsafe { GetDiskFreeSpaceExW(wide(dir).as_ptr(), &mut free, std::ptr::null_mut(), std::ptr::null_mut()) };
    if ok == 0 { u64::MAX } else { free }
}

pub fn drive_letter(dir: &Path) -> String {
    let s = dir.to_string_lossy();
    if s.len() >= 2 && s.as_bytes()[1] == b':' { s[..1].to_uppercase() } else { s.to_string() }
}

pub fn drive_is_fixed(dir: &Path) -> bool {
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    let s = dir.to_string_lossy();
    if s.len() < 2 || s.as_bytes()[1] != b':' {
        return false;
    }
    let root: Vec<u16> = format!("{}:\\", &s[..1]).encode_utf16().chain(std::iter::once(0)).collect();
    unsafe { GetDriveTypeW(root.as_ptr()) == 3 } // DRIVE_FIXED
}

/// เปิดแบบห้ามคนอื่นแตะได้ไหม · ไม่ได้ = มีโปรแกรมอื่นเปิดไฟล์อยู่ (ล็อกแบบยอมให้เขียนยังผ่าน mkvpropedit ได้ จึงต้องเช็กแบบนี้ · ผลลองขั้นเตรียม)
pub fn not_in_use(p: &Path) -> bool {
    use std::os::windows::fs::OpenOptionsExt;
    std::fs::OpenOptions::new().read(true).share_mode(0).open(p).is_ok()
}

/// ส่งไฟล์ลงถังขยะของ Windows · ไฟล์ที่ใหญ่เกินถังรับ Windows ถามก่อนลบถาวร (FOF_WANTNUKEWARNING) ไม่ลบถาวรเงียบ ๆ
pub fn to_trash(p: &Path) -> Result<(), String> {
    use windows_sys::Win32::UI::Shell::{SHFileOperationW, FOF_ALLOWUNDO, FOF_NOCONFIRMATION, FOF_NOERRORUI, FOF_SILENT, FOF_WANTNUKEWARNING, FO_DELETE, SHFILEOPSTRUCTW};
    let mut from: Vec<u16> = p.as_os_str().encode_wide().collect();
    from.push(0);
    from.push(0);
    let mut op: SHFILEOPSTRUCTW = unsafe { std::mem::zeroed() };
    op.wFunc = FO_DELETE;
    op.pFrom = from.as_ptr();
    op.fFlags = (FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_SILENT | FOF_NOERRORUI | FOF_WANTNUKEWARNING) as _;
    let r = unsafe { SHFileOperationW(&mut op) };
    // ทุกไฟล์ที่โปรแกรมส่งลงถังขยะจดลงบันทึกการใช้งาน ทั้งสำเร็จและไม่สำเร็จ · ทางนี้ทางเดียวทั้งโปรแกรม
    if r != 0 || op.fAnyOperationsAborted != 0 || p.exists() {
        crate::actlog::note("ส่งลงถังขยะไม่สำเร็จ", &format!("{} รหัส {r}", p.display()));
        return Err(format!("ส่งไฟล์เดิมลงถังขยะไม่สำเร็จ (รหัส {r})"));
    }
    crate::actlog::note("ลงถังขยะ", &p.display().to_string());
    Ok(())
}

/// เอาไฟล์ใหม่ที่เขียนเสร็จแล้ว (partial) มาแทน target · target เดิมลงถังขยะก่อน (กู้คืนได้ด้วยชื่อจริง)
/// ย้ายไม่สำเร็จหลังไฟล์เดิมลงถังขยะไปแล้ว ห้ามลบไฟล์ใหม่ บอกที่อยู่ของทั้งสองไฟล์ · เดิมลบไฟล์ใหม่ทิ้ง ทั้งเดิมทั้งใหม่หาย (ผู้ช่วยตรวจทาน R10)
pub fn replace_with(partial: &Path, target: &Path) -> Result<(), String> {
    let had = target.exists();
    if had { to_trash(target).map_err(|e| { let _ = std::fs::remove_file(partial); e })?; }
    crate::rename::move_no_replace(partial, target).map_err(|p| {
        if had { format!("เอาไฟล์ใหม่มาแทนไม่สำเร็จ {}  ไฟล์เดิมอยู่ในถังขยะ ไฟล์ใหม่อยู่ที่ {}", p.title, partial.display()) }
        else { let _ = std::fs::remove_file(partial); p.title }
    })
}

/// ที่เก็บไฟล์เดิมที่ชื่อไม่ชนใคร · ชื่อซ้ำต่อท้าย (2) (3) ไม่เขียนทับ
pub fn free_name(dir: &Path, file: &Path) -> PathBuf {
    let stem = file.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let first = dir.join(format!("{stem}{ext}"));
    if !first.exists() {
        return first;
    }
    (2..).map(|n| dir.join(format!("{stem} ({n}){ext}"))).find(|p| !p.exists()).unwrap()
}

pub fn fmt_gb(b: u64) -> String {
    let gb = b as f64 / 1024f64.powi(3);
    if gb >= 1.0 { format!("{gb:.1} GB") } else { format!("{:.0} MB", b as f64 / 1024f64.powi(2)) }
}

// ---------------------------------------------------------------- เรียกเครื่องมือพร้อมความคืบหน้า

pub enum Run {
    Done(std::process::ExitStatus, String),
    Cancelled,
}

/// เรียกเครื่องมือ อ่านทีละบรรทัดจากช่องผลปกติ · กดหยุดแล้วฆ่าเครื่องมือทันที · อ่านช่องข้อผิดพลาดพร้อมกันไม่ให้ท่อเต็ม
pub fn run_live(tools: &Path, name: &str, args: &[OsString], stop: &dyn Fn() -> bool, on_line: &mut dyn FnMut(&str)) -> Result<Run, String> {
    let mut child = tool_command(tools, name, args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก {name} ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().unwrap();
    let mut err = child.stderr.take().unwrap();
    let (tx, rx) = mpsc::channel::<String>();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(out).split(b'\n').flatten() {
            if tx.send(String::from_utf8_lossy(&line).trim_end_matches('\r').to_string()).is_err() {
                break;
            }
        }
    });
    let err_reader = std::thread::spawn(move || {
        let mut s = Vec::new();
        let _ = err.read_to_end(&mut s);
        String::from_utf8_lossy(&s).to_string()
    });
    loop {
        while let Ok(l) = rx.try_recv() {
            on_line(&l);
        }
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            let _ = err_reader.join();
            return Ok(Run::Cancelled);
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let _ = reader.join();
            while let Ok(l) = rx.try_recv() {
                on_line(&l);
            }
            let stderr = err_reader.join().unwrap_or_default();
            return Ok(Run::Done(status, stderr));
        }
        if let Ok(l) = rx.recv_timeout(Duration::from_millis(100)) {
            on_line(&l);
        }
    }
}

pub fn kind_word(k: &str) -> &'static str {
    match k { "video" => "ภาพ", "audio" => "เสียง", _ => "ซับ" }
}

pub fn eta(t0: Instant, pct: f64) -> Option<f64> {
    (pct > 1.0).then(|| t0.elapsed().as_secs_f64() * (100.0 - pct) / pct)
}

/// โฟลเดอร์เก็บไฟล์เดิม · ตั้งไว้ในหน้าตั้งค่า (ต้องอยู่ไดรฟ์เดียวกัน ย้ายข้ามไดรฟ์ = คัดลอกแล้วลบ พังกลางทางได้) · ไม่ตั้ง = ไฟล์เดิม ข้างไฟล์หนัง
pub fn originals_dir(app: &AppHandle, dir: &Path) -> PathBuf {
    let set = app.state::<crate::store::SettingsStore>().current.lock().unwrap().originals_folder.clone();
    if !set.trim().is_empty() && drive_letter(Path::new(&set)) == drive_letter(dir) {
        PathBuf::from(set)
    } else {
        dir.join("ไฟล์เดิม")
    }
}

/// ไฟล์แนบใน MKV (ชื่อ ชนิด เลข) จาก mkvmerge -J
pub fn mkv_attachments(tools: &Path, file: &Path) -> Result<Vec<(String, String, u64)>, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    if !tool_succeeded("mkvmerge", &out.status) {
        return Err("mkvmerge อ่านไฟล์ไม่ได้".into());
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    Ok(j["attachments"].as_array().map(|a| a.iter().map(|x| (
        x["file_name"].as_str().unwrap_or("").to_string(), x["content_type"].as_str().unwrap_or("").to_string(), x["id"].as_u64().unwrap_or(0),
    )).collect()).unwrap_or_default())
}

pub fn has_attached_pic(j: &Value) -> bool {
    j["streams"].as_array().map(|a| a.iter().any(|s| s["disposition"]["attached_pic"].as_i64() == Some(1))).unwrap_or(false)
}

/// ลบไฟล์ชั่วคราวตอนหลุดขอบเขต
pub struct TempFile(PathBuf);
impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
pub fn scopeguard(p: PathBuf) -> TempFile {
    TempFile(p)
}

// ---------------------------------------------------------------- ผลไม่สำเร็จ กับการจัดการไฟล์เดิม (ใช้ร่วมหน้าใส่โปสเตอร์กับหน้าเสียงและซับ)

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProblem {
    /// space inuse exists badsource verify cancelled mp4 tool nocover other
    pub kind: String,
    pub title: String,
    pub detail: Vec<String>,
}

pub fn fail(kind: &str, title: impl Into<String>, detail: Vec<String>) -> ApplyProblem {
    ApplyProblem { kind: kind.into(), title: title.into(), detail }
}

pub fn cancelled(untouched: &str, partial: Option<&Path>) -> ApplyProblem {
    let mut d = vec![];
    if partial.is_some() {
        d.push("ไฟล์ใหม่ที่ทำค้างถูกลบแล้ว".to_string());
    }
    d.push(untouched.to_string());
    fail("cancelled", "หยุดแล้ว", d)
}

/// ไฟล์ใหม่ที่ทำเสร็จ (.partial) เป็นชื่อจริง แล้วจัดการไฟล์เดิม · คืน (kept | trash, ที่ย้ายไป)
/// ย้ายไปโฟลเดอร์ไฟล์เดิม หรือลงถังขยะเฉพาะหลังตรวจผ่าน บนไดรฟ์ที่มีถังขยะ · ไฟล์เดิมถูกเปิดอยู่ ไม่ย้าย ไม่ลบ
/// ชื่อเดียวกัน (MKV เป็น MKV · MP4 เป็น MP4) ต้องย้ายไฟล์เดิมออกก่อน แล้วค่อยเปลี่ยน .partial เป็นชื่อจริง · เปลี่ยนไม่สำเร็จ ย้ายไฟล์เดิมกลับที่เดิม
/// ย้ายมาจาก poster.rs apply() ทั้งก้อนตอนทำหน้าเสียงและซับ (แผนเสียงและซับ ขั้น 1) ไม่ได้แก้พฤติกรรม
pub fn finish_output(
    app: &AppHandle, src: &Path, target: &Path, partial: &Path, original_mode: &str, verified: bool, untouched: &str, notes: &mut Vec<String>,
) -> Result<(String, Option<String>), ApplyProblem> {
    use crate::rename::move_no_replace;
    let dir = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let same_name = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    let mut original = "none".to_string();
    let mut original_to = None;
    let finish_partial = || -> Result<(), ApplyProblem> {
        move_no_replace(partial, target).map_err(|p| fail("other", "เปลี่ยนไฟล์ใหม่เป็นชื่อจริงไม่สำเร็จ", vec![p.title, format!("ไฟล์ใหม่อยู่ที่ {}", partial.display())]))
    };
    if !same_name {
        finish_partial()?;
    }
    let trash = original_mode == "trash" && verified && drive_is_fixed(&dir) && src.to_string_lossy().encode_utf16().count() < 260;
    if original_mode == "trash" && !trash {
        notes.push(if !verified { "ไม่ได้ตรวจไฟล์ใหม่ จึงไม่ลบไฟล์เดิม ย้ายไปโฟลเดอร์ไฟล์เดิมแทน".into() } else { "ไดรฟ์นี้ไม่มีถังขยะ ย้ายไฟล์เดิมไปโฟลเดอร์ไฟล์เดิมแทน".into() });
    }
    // ไฟล์เดิมถูกเปิดระหว่างทำ · ไม่ย้าย ไม่ลบ ทิ้งไว้ที่เดิม (เช็กซ้ำตรงจังหวะที่ย้ายจริง)
    let moved = if !not_in_use(src) {
        Err("ไฟล์เดิมถูกเปิดอยู่ในโปรแกรมอื่น".to_string())
    } else if trash {
        to_trash(src).map(|_| { original = "trash".into(); })
    } else {
        let keep_dir = originals_dir(app, &dir);
        std::fs::create_dir_all(&keep_dir).map_err(|e| e.to_string())
            .and_then(|_| { let to = free_name(&keep_dir, src); move_no_replace(src, &to).map_err(|p| p.title).map(|_| to) })
            .map(|to| { original = "kept".into(); original_to = Some(to.to_string_lossy().to_string()); })
    };
    if let Err(e) = moved {
        if same_name {
            // ชื่อเดียวกัน ย้ายไฟล์เดิมไม่ได้ ไฟล์ใหม่จึงยังเป็น .partial · ไฟล์เดิมอยู่ที่เดิมครบ
            return Err(fail("other", "ย้ายไฟล์เดิมไม่สำเร็จ", vec![e, format!("ไฟล์ใหม่ที่ตรวจผ่านแล้วอยู่ที่ {}", partial.display()), untouched.to_string()]));
        }
        notes.push(format!("ย้ายไฟล์เดิมไม่สำเร็จ {e}  ไฟล์เดิมยังอยู่ที่เดิม"));
    } else if same_name {
        // ย้ายไฟล์เดิมออกไปแล้ว ถ้าเปลี่ยน .partial เป็นชื่อจริงไม่สำเร็จ ย้ายไฟล์เดิมกลับที่เดิม ไม่ให้ที่เดิมว่าง (ผู้ช่วยตรวจโค้ดเจอ)
        if let Err(mut p) = finish_partial() {
            if let Some(to) = &original_to {
                if move_no_replace(Path::new(to), src).is_ok() { p.detail.push("ไฟล์เดิมย้ายกลับที่เดิมแล้ว".into()); }
            } else if original == "trash" {
                // ส่งลงถังขยะแล้วย้ายกลับเองไม่ได้ · บอกให้รู้ว่าไฟล์เดิมอยู่ไหน (ผู้ช่วยตรวจขั้น 10 ข้อ 23)
                p.detail.push("ไฟล์เดิมอยู่ในถังขยะของ Windows อย่าเพิ่งล้างถังขยะ  กู้คืนจากถังขยะ หรือเปลี่ยนชื่อไฟล์ .partial ที่ตรวจผ่านแล้วเป็นชื่อจริงเอง".into());
            }
            return Err(p);
        }
    }
    Ok((original, original_to))
}

/// SHA-256 ทั้งไฟล์ อ่านทีละ 4 MB บอกความคืบหน้า
pub fn sha256_file(p: &Path, on: &dyn Fn(f64)) -> Result<String, String> {
    let mut f = std::fs::File::open(p).map_err(|e| e.to_string())?;
    let total = f.metadata().map(|m| m.len()).unwrap_or(0).max(1);
    let mut h = Sha256::new();
    let mut buf = vec![0u8; 4 << 20];
    let mut done = 0u64;
    let mut last = Instant::now();
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(100) {
            last = Instant::now();
            on(done as f64 / total as f64 * 100.0);
        }
    }
    Ok(crate::probe::hex(&h.finalize()))
}
