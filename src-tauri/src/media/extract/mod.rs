//! แยกไฟล์ออกจากไฟล์หนัง (แผนขั้น 5 · สเปกข้อ 6 แถบแยกไฟล์)
//! MKV ใช้ MKVToolNix (ภาพ → mkvmerge เป็น .mkv · เสียง ซับ → mkvextract tracks · บท → chapters · ไฟล์แนบ → attachments)
//! ไฟล์อื่นใช้ ffmpeg -c copy ไม่แปลงใหม่
//! ชื่อแบบ ดาวเหนือ (2023).Audio1.th.ac3 · ลงโฟลเดอร์ <ชื่อหนัง> แยกไฟล์ ข้างไฟล์หนัง (ตัวอ่านโฟลเดอร์ข้ามโฟลเดอร์นี้)
//! 🔴 ไม่เขียนทับ · เขียนเป็น .partial ก่อนแล้วย้ายด้วย move_no_replace · ชื่อชนให้ผู้ใช้เลือกข้ามหรือต่อท้ายเลข
//! 🔴 ไฟล์หนังเดิมไม่ถูกแตะ อ่านอย่างเดียว · กดหยุดแล้วลบไฟล์ที่ทำค้าง ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ

use std::ffi::{OsStr, OsString};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app::tools::{run_tool_timeout, tool_command, tool_succeeded, ToolFail};

#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// video audio text menu attachment
    pub kind: String,
    /// ลำดับในชนิดเดียวกัน เริ่ม 1 (Audio #2 = 2)
    pub nth: usize,
    pub ext: String,
    pub lang: Option<String>,
    /// ไฟล์แนบใช้ชื่อเดิมของมัน
    pub name: Option<String>,
    /// ชิ้นเวลาของแต่ละเฟรม (timestamps) บอกว่าเป็นของแทร็กชนิดไหน video audio text (BUGS ข้อ 130)
    #[serde(default)]
    pub of: Option<String>,
}

/// รูปแบบชื่อตั้งต้น ได้ชื่อเหมือนเดิม ดาวเหนือ (2023).Audio1.th.ac3 และเติม DELAY 120ms เมื่อเสียงมีดีเลย์
pub const DEFAULT_PATTERN: &str = "{Filename}.{Type}{Number}.{Language}{Delay}";

/// ชื่อแทร็กตามรูปแบบแบบ gMKVExtractGUI (BUGS ข้อ 130 พี่กันสั่ง "เอาเข้าคิว" · README ของที่เก็บ Gpower2/gMKVExtractGUI)
/// ตัวแทนว่างไม่ทิ้งจุดซ้อน อักษรที่ Windows ห้ามเปลี่ยนเป็นขีดล่าง · ดีเลย์เขียนแบบ DELAY -120ms ที่หน้าเสียงและซับอ่านกลับได้ (merge::delay_from_name)
pub fn pattern_name(pattern: &str, stem: &str, it: &Item, delay: Option<i64>, track_name: Option<&str>) -> String {
    let kind = if it.kind == "timestamps" { it.of.as_deref().unwrap_or("video") } else { it.kind.as_str() };
    let ty = match kind { "video" => "Video", "audio" => "Audio", _ => "Text" };
    let lang = it.lang.clone().unwrap_or_default();
    let d = match delay { Some(v) if v != 0 => format!(" DELAY {v}ms"), _ => String::new() };
    let tn: String = track_name.unwrap_or("").chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let p = if pattern.trim().is_empty() { DEFAULT_PATTERN } else { pattern };
    // ชื่อหนังใส่ตอนท้ายสุด ตัวเก็บกวาดไม่แตะ · เดิม "Dept. (2017)" กลายเป็น "Dept (2017)" เพราะลบจุดหน้าเว้นวรรค (พี่กันเจอ 15 พ.ย. 2569)
    const STEM: &str = "\u{E000}";
    let mut s = p.replace("{Filename}", STEM).replace("{Type}", ty).replace("{Number}", &it.nth.to_string()).replace("{Language}", &lang).replace("{Delay}", &d).replace("{TrackName}", tn.trim());
    s = s.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    while s.contains("..") { s = s.replace("..", "."); }
    while s.contains(". ") { s = s.replace(". ", " "); }
    // ตัวแทนว่างระหว่างเว้นวรรค เช่น " - {Language} - " ไม่ทิ้งเว้นวรรคซ้อน
    while s.contains("  ") { s = s.replace("  ", " "); }
    let s = s.trim().trim_matches('.').trim().replace(STEM, stem);
    let s = if s.is_empty() { format!("{stem}.{ty}{}", it.nth) } else { s };
    if it.kind == "timestamps" { format!("{s}.timestamps.txt") } else { format!("{s}.{}", it.ext) }
}

/// ชื่อไฟล์ที่แยกออกมาด้วยรูปแบบตั้งต้น · ดาวเหนือ (2023).Audio1.th.ac3 · ดาวเหนือ (2023).cover.jpg · ดาวเหนือ (2023).chapters.xml (เทสใช้)
#[cfg(test)]
pub fn out_name(stem: &str, it: &Item) -> String {
    out_name_with(stem, it, DEFAULT_PATTERN, None, None)
}

pub fn out_name_with(stem: &str, it: &Item, pattern: &str, delay: Option<i64>, track_name: Option<&str>) -> String {
    match it.kind.as_str() {
        "video" | "audio" | "text" | "timestamps" => pattern_name(pattern, stem, it, delay, track_name),
        "menu" => format!("{stem}.chapters.xml"),
        // แท็กเป็น XML · chapter แบบ OGM เป็นข้อความ CHAPTER01=… · CUE sheet ของไฟล์เพลงที่มี chapter (BUGS ข้อ 130)
        "tags" => format!("{stem}.tags.xml"),
        "ogm" => format!("{stem}.chapters.txt"),
        "cue" => format!("{stem}.cue"),
        _ => format!("{stem}.{}", safe_att_name(it)),
    }
}

/// ข้อมูลของไฟล์ MKV ที่หน้าเสียงและซับใช้บอกว่าแยกอะไรได้บ้าง (BUGS ข้อ 130)
#[derive(Serialize, Clone, Default, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInfo {
    pub mkv: bool,
    pub tags: bool,
    pub chapters: bool,
    /// ดีเลย์ของแทร็กเสียงลำดับที่ n (เริ่ม 1) เทียบกับภาพ มิลลิวินาที แบบ gMKVExtractGUI FindAndSetDelays
    pub delays: Vec<i64>,
}

fn mkv_json(tools: &Path, file: &Path) -> Result<Value, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    tool_json("mkvmerge", &out)
}

/// ผล JSON ของ mkvmerge -J หรือ ffprobe · อ่านไฟล์ไม่ได้บอกสาเหตุเป็นประโยคไทย (BUGS ข้อ 150) เดิมขึ้นข้อความภาษาอังกฤษของตัวอ่าน JSON
/// mkvmerge บอกปัญหาในช่อง errors ของ JSON ส่วน ffprobe บอกทาง stderr
fn tool_json(tool: &str, out: &std::process::Output) -> Result<Value, String> {
    let j: Option<Value> = serde_json::from_slice(&out.stdout).ok();
    let mut lines: Vec<String> = j.as_ref().and_then(|j| j["errors"].as_array()).map(|a| a.iter().filter_map(|e| e.as_str().map(String::from)).collect()).unwrap_or_default();
    match j {
        Some(j) if tool_succeeded(tool, &out.status) && lines.is_empty() => Ok(j),
        _ => {
            lines.extend(crate::app::tools::tool_lines(&String::from_utf8_lossy(&out.stderr)));
            Err(crate::app::tools::explain_fail(tool, &lines, Some(&out.status)).line())
        }
    }
}

/// แท็ก chapter และดีเลย์จาก mkvmerge -J · ดีเลย์ = เวลาแรกของเสียงลบเวลาแรกของภาพ (minimum_timestamp หน่วยนาโนวินาที) · ไม่มีภาพนับจากศูนย์
pub fn info_of(j: &Value) -> ExtractInfo {
    let count = |k: &str| j[k].as_array().map(|a| a.iter().map(|x| x["num_entries"].as_u64().unwrap_or(1)).sum::<u64>()).unwrap_or(0);
    let tracks = j["tracks"].as_array().cloned().unwrap_or_default();
    let ms = |t: &Value| t["properties"]["minimum_timestamp"].as_i64().map(|ns| ns / 1_000_000);
    let video = tracks.iter().find(|t| t["type"] == "video").and_then(ms).unwrap_or(0);
    let delays = tracks.iter().filter(|t| t["type"] == "audio").map(|t| ms(t).map(|a| a - video).unwrap_or(0)).collect();
    ExtractInfo { mkv: true, tags: count("global_tags") + count("track_tags") > 0, chapters: count("chapters") > 0, delays }
}

mod one;
pub use one::*;

#[cfg(test)]
mod tests;

// ---------------------------------------------------------------- คำสั่งให้หน้าจอเรียก

static STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
/// กำลังแยกอยู่ · กดแยกซ้อนอีกงาน (เปลี่ยนหน้าแล้วกลับมากดใหม่) ไม่ให้เริ่ม เพราะใช้ตัวหยุดตัวเดียวกันและ .partial ชื่อเดียวกัน (ผู้ช่วยตรวจโค้ดเจอ)
static RUNNING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
pub fn extract_running() -> bool {
    RUNNING.load(std::sync::atomic::Ordering::SeqCst)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractReq {
    path: String,
    /// ว่าง = <ชื่อหนัง> แยกไฟล์ ข้างไฟล์หนัง
    folder: Option<String>,
    items: Vec<Item>,
    /// ต่อชิ้น ask = ชื่อชนให้ถาม · skip = ข้ามไฟล์นี้ · number = ตั้งชื่อใหม่ต่อท้ายเลข 2
    policy: Vec<String>,
    /// รูปแบบชื่อแทร็ก (ค่าตั้ง extractPattern) · ว่าง = แบบตั้งต้น
    #[serde(default)]
    pattern: Option<String>,
    /// แยกแบบเดียวกันจากไฟล์อื่น · หาเลขแทร็ก นามสกุล และภาษาของไฟล์นี้ใหม่ ชิ้นที่ไฟล์นี้ไม่มีขึ้นว่าไม่มี (BUGS ข้อ 130)
    #[serde(default)]
    batch: bool,
}

#[tauri::command]
pub async fn extract_info(app: tauri::AppHandle, path: String) -> Result<ExtractInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::app::tools::tools_dir(&app)?;
        let p = PathBuf::from(&path);
        if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("mkv")) { return Ok(ExtractInfo::default()); }
        Ok(info_of(&mkv_json(&tools, &p)?))
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    folder: String,
    /// ต่อชิ้น done skipped conflict failed cancelled queued
    states: Vec<String>,
    files: Vec<Option<String>>,
    /// ไฟล์ที่สองของชิ้นเดียวกัน · ซับ VobSub ได้ .idx ใน files กับ .sub ในช่องนี้ (BUGS ข้อ 150)
    pair: Vec<Option<String>>,
    error: Option<String>,
    /// บรรทัดสุดท้ายที่เครื่องมือพิมพ์ตอนไม่สำเร็จ หน้าจอใส่ในปุ่ม ⓘ (BUGS ข้อ 150)
    detail: Option<String>,
    /// เรื่องที่ควรรู้ เช่น ตัดชื่อให้สั้นลง
    notes: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractProgress {
    index: usize,
    percent: f64,
}

/// ชื่อชิ้นแบบหัวข้อ MediaInfo บนจอ · Audio #2 · ไฟล์แนบใช้ชื่อของมัน · เดิมข้อความผิดพลาดบอกชนิดภาษาอังกฤษตัวเล็ก (audio) ไม่ตรงกับหัวข้อบนจอ (ผู้ช่วยตรวจสเปกเจอ)
fn title_of(it: &Item) -> String {
    match it.kind.as_str() {
        "video" => "Video".to_string(), "audio" => format!("Audio #{}", it.nth), "text" => format!("Text #{}", it.nth), "menu" => "Menu".into(),
        "tags" => "แท็ก".into(), "ogm" => "Chapter แบบ OGM".into(), "cue" => "CUE sheet".into(), "timestamps" => format!("เวลาของแต่ละเฟรม {}", title_of(&Item { kind: it.of.clone().unwrap_or_default(), ..it.clone() })),
        _ => it.name.clone().unwrap_or_default(),
    }
}

/// ปรับชิ้นให้ตรงกับไฟล์นี้ตอนแยกหลายไฟล์ · คืน None เมื่อไฟล์นี้ไม่มีชิ้นนั้น
fn fit_item(j: &Value, info: &ExtractInfo, it: &Item) -> Option<Item> {
    let mut x = it.clone();
    let track_kind = if it.kind == "timestamps" { it.of.clone().unwrap_or_default() } else { it.kind.clone() };
    match it.kind.as_str() {
        "menu" | "ogm" | "cue" => return info.chapters.then_some(x),
        "tags" => return info.tags.then_some(x),
        "video" | "audio" | "text" | "timestamps" => {}
        _ => return None,
    }
    let want = match track_kind.as_str() { "video" => "video", "audio" => "audio", _ => "subtitles" };
    let t = j["tracks"].as_array()?.iter().filter(|t| t["type"] == want).nth(it.nth.checked_sub(1)?)?;
    x.lang = short_lang(t["properties"]["language_ietf"].as_str().or(t["properties"]["language"].as_str()).unwrap_or(""));
    if it.kind != "timestamps" {
        let raw = if is_raw_video(&it.ext) { Some(it.ext.as_str()) } else { None };
        x.ext = ext_of_codec(&track_kind, t["properties"]["codec_id"].as_str().unwrap_or(""), raw);
    }
    Some(x)
}

/// โฟลเดอร์ "แยกไฟล์" ข้างไฟล์หนัง · ไฟล์ที่แยกขึ้นต้นด้วยชื่อหนังอยู่แล้ว หลายเรื่องอยู่โฟลเดอร์เดียวกันได้
/// เดิม "<ชื่อหนัง> แยกไฟล์" ชื่อหนังซ้ำสองรอบในที่อยู่ ซีรีส์ที่โฟลเดอร์ยาวเกิน 259 ตัว แยกไม่ได้เลย (พี่กันเจอ 15 พ.ย. 2569 "เเล้วจะเอาชื่อโฟลเด้อมาตั้งทำไมมมม")
pub fn default_folder(movie: &Path) -> PathBuf {
    movie.parent().unwrap_or(Path::new("")).join("แยกไฟล์")
}

/// ชื่อไฟล์ที่ไม่ทำให้ที่อยู่ (รวม .partial) ยาวเกินที่ Windows รับ · ยาวเกินตัดท้ายชื่อหนังลงจนพอดี ส่วนแทร็ก ภาษา นามสกุลคงไว้
/// คืน (ชื่อ, ตัดไหม) · โฟลเดอร์ยาวจนชื่อหนังเหลือไม่ถึง 8 ตัวอักษร คืนชื่อเต็มให้ตัวตรวจความยาวบอกว่าไม่สำเร็จ
/// งานจริงใช้ fit_name_with ที่บอกความยาวของชื่อชั่วคราวเอง (เทสใช้)
#[cfg(test)]
pub fn fit_name(dir: &Path, stem: &str, name_of: &dyn Fn(&str) -> String) -> (String, bool) {
    fit_name_with(dir, stem, ".partial".len(), name_of)
}

/// extra ความยาวที่ชื่อชั่วคราวยาวกว่าชื่อจริง · VobSub ใช้ .partial.sub กับ .partial.idx (BUGS ข้อ 150)
pub fn fit_name_with(dir: &Path, stem: &str, extra: usize, name_of: &dyn Fn(&str) -> String) -> (String, bool) {
    let len = |n: &str| dir.join(n).to_string_lossy().encode_utf16().count() + extra;
    let full = name_of(stem);
    let over = len(&full).saturating_sub(crate::cover::rename::MAX_PATH_LEN);
    if over == 0 { return (full, false); }
    let chars: Vec<char> = stem.chars().collect();
    let mut keep = chars.len().saturating_sub(over + 1);
    while keep >= 8 {
        let short: String = chars[..keep].iter().collect::<String>().trim_end_matches([' ', '.', '-', '_']).to_string() + "…";
        let n = name_of(&short);
        if len(&n) <= crate::cover::rename::MAX_PATH_LEN { return (n, true); }
        keep -= 1;
    }
    (full, false)
}

#[tauri::command]
pub fn extract_default_folder(path: String) -> String {
    default_folder(Path::new(&path)).to_string_lossy().to_string()
}

#[tauri::command]
pub fn extract_cancel() {
    STOP.store(true, std::sync::atomic::Ordering::SeqCst);
}

pub enum Placed {
    /// ไฟล์ปลายทางที่ได้ · VobSub เรียง .idx ก่อน .sub
    Done(Vec<PathBuf>),
    Cancelled,
}

/// แยกหนึ่งชิ้นลงไฟล์ชั่วคราวแล้วย้ายเข้าชื่อจริงแบบไม่เขียนทับ · target ชื่อจริงของชิ้น (VobSub คือไฟล์ .sub ส่วน .idx อยู่ข้างกัน)
/// ย้ายไม่ครบ ลบไฟล์ที่ย้ายไปแล้วกับไฟล์ชั่วคราวที่เหลือ ไม่ทิ้งไว้ครึ่งคู่ (BUGS ข้อ 150)
pub fn place_item(tools: &Path, src: &Path, it: &Item, target: &Path, vobsub: bool, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Placed, ToolFail> {
    let partial = partial_of(target, vobsub);
    let temps = if vobsub { vobsub_outputs(&partial) } else { vec![partial.clone()] };
    for t in &temps { let _ = std::fs::remove_file(t); }
    // จดไว้ ไฟดับกลางทางแล้วตอนเปิดครั้งหน้าลบไฟล์ที่แยกไม่เสร็จข้างหนัง (BUGS ข้อ 162.4)
    let _tracked: Vec<_> = temps.iter().map(|t| crate::app::inflight::track(t, None, crate::app::inflight::Kind::Temp)).collect();
    let made = match extract_one(tools, src, it, &partial, on, stop)? {
        Done::Cancelled => return Ok(Placed::Cancelled),
        Done::Ok(made) => made,
    };
    // ชนิดแทร็กจริงเป็น VobSub แต่หน้าจอส่งนามสกุลอื่นมา ก็ยังได้คู่ชื่อเดียวกับชิ้นนี้
    let finals: Vec<PathBuf> = if made.len() == 1 { vec![target.to_path_buf()] } else { made.iter().map(|m| target.with_extension(m.extension().unwrap_or_default())).collect() };
    let mut moved: Vec<PathBuf> = vec![];
    for (m, f) in made.iter().zip(&finals) {
        if let Err(p) = crate::cover::rename::move_no_replace(m, f) {
            for x in moved.iter().chain(made.iter()) { let _ = std::fs::remove_file(x); }
            return Err(p.title.into());
        }
        moved.push(f.clone());
    }
    Ok(Placed::Done(finals))
}

/// แยกชิ้นที่ติ๊กทีละชิ้นตามลำดับ · ความคืบหน้าทางเหตุการณ์ extract-progress · ชื่อชนไม่ทำ บอกกลับให้ถาม
#[tauri::command]
pub async fn extract_start(app: tauri::AppHandle, req: ExtractReq) -> Result<ExtractResult, String> {
    use tauri::{Emitter, Manager};
    use std::sync::atomic::Ordering;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("กำลังแยกไฟล์อีกงานอยู่ รอให้เสร็จก่อน หรือกดหยุดงานนั้น".into());
    }
    STOP.store(false, Ordering::SeqCst);
    struct Release;
    impl Drop for Release { fn drop(&mut self) { RUNNING.store(false, std::sync::atomic::Ordering::SeqCst); } }
    let _release = Release;
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::app::tools::tools_dir(&app)?;
        let jobs = app.state::<std::sync::Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let src = PathBuf::from(&req.path);
        let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let dir = req.folder.clone().filter(|f| !f.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| default_folder(&src));
        // สาเหตุเป็นประโยคไทย ไม่ใช่ข้อความภาษาอังกฤษของ Windows (BUGS ข้อ 150)
        std::fs::create_dir_all(&dir).map_err(|e| format!("สร้างโฟลเดอร์ที่เก็บไม่ได้ {}", e.raw_os_error().map(crate::app::tools::win_reason).unwrap_or_else(|| e.to_string())))?;
        let n = req.items.len();
        let mut r = ExtractResult { folder: dir.to_string_lossy().to_string(), states: vec!["queued".into(); n], files: vec![None; n], pair: vec![None; n], ..Default::default() };
        let src_size = std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
        let src_mkv = src.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false);
        // ข้อมูลแทร็กของไฟล์นี้ ใช้ทำดีเลย์ในชื่อเสียง ชื่อแทร็ก และแยกหลายไฟล์ (BUGS ข้อ 130)
        let j = if src_mkv { mkv_json(&tools, &src).ok() } else { None };
        let info = j.as_ref().map(info_of).unwrap_or_default();
        if req.batch && !src_mkv { return Err("แยกหลายไฟล์ทำได้เฉพาะไฟล์ MKV".into()); }
        let pattern = req.pattern.clone().unwrap_or_default();
        for (i, it0) in req.items.iter().enumerate() {
            let mut it_fixed = it0.clone();
            if req.batch {
                match j.as_ref().and_then(|j| fit_item(j, &info, it0)) { Some(x) => it_fixed = x, None => { r.states[i] = "missing".into(); continue; } }
            }
            if !src_mkv { fix_ext_for_ffmpeg(&mut it_fixed); }
            let it = &it_fixed;
            let delay = if it.kind == "audio" { info.delays.get(it.nth.saturating_sub(1)).copied() } else { None };
            let track_name = j.as_ref().and_then(|j| {
                let k = if it.kind == "timestamps" { it.of.as_deref().unwrap_or("") } else { it.kind.as_str() };
                let want = match k { "video" => "video", "audio" => "audio", "text" => "subtitles", _ => return None };
                j["tracks"].as_array()?.iter().filter(|t| t["type"] == want).nth(it.nth.checked_sub(1)?)?["properties"]["track_name"].as_str().map(String::from)
            });
            let vobsub = is_vobsub(src_mkv, it);
            let extra = partial_of(Path::new(""), vobsub).to_string_lossy().encode_utf16().count();
            let (name, cut) = fit_name_with(&dir, &stem, extra, &|st| out_name_with(st, it, &pattern, delay, track_name.as_deref()));
            if cut { r.notes.push(format!("{} ชื่อยาวเกินที่ Windows รับ จึงตัดท้ายชื่อหนังเป็น {name}", title_of(it))); }
            let mut target = dir.join(name);
            // ไฟล์ที่แยกต้องอยู่ในโฟลเดอร์ที่เลือกเท่านั้น · กันชื่อที่หลุดตัวกรอง
            if target.parent() != Some(dir.as_path()) {
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {} ไม่สำเร็จ ชื่อไฟล์ไม่ปลอดภัย  ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it)));
                break;
            }
            // VobSub เช็กชื่อชนทั้ง .idx และ .sub (BUGS ข้อ 150)
            if let Some(hit) = finals_of(&target, vobsub).into_iter().find(|f| f.exists()) {
                match req.policy.get(i).map(String::as_str).unwrap_or("ask") {
                    "skip" => { r.states[i] = "skipped".into(); continue; }
                    "number" => target = numbered_free(&target, vobsub),
                    // ชื่อไฟล์ที่มีอยู่แล้ว ส่งกลับให้การ์ดบอกว่าไฟล์ไหนชน (ต้นแบบ ในที่เก็บมีไฟล์ … อยู่แล้ว)
                    _ => { r.states[i] = "conflict".into(); r.files[i] = Some(hit.to_string_lossy().to_string()); continue; }
                }
            }
            // ที่ว่างในไดรฟ์ · ภาพต้องการราวขนาดไฟล์หนัง · เสียง ซับ บท ไฟล์แนบ ไม่เกินขนาดไฟล์หนัง เผื่ออย่างน้อย 64 MB
            let need = if it.kind == "video" { src_size } else { (src_size / 4).max(64 << 20).min(src_size + (64 << 20)) };
            let free = crate::app::outfile::free_space(&dir);
            if free < need {
                let title = title_of(it);
                let drive = dir.to_string_lossy().chars().next().unwrap_or('?').to_ascii_uppercase();
                let gb = |b: u64| if b >= 1 << 30 { format!("{:.1} GB", b as f64 / 1073741824.0) } else { format!("{:.0} MB", b as f64 / 1048576.0) };
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {title} ไม่สำเร็จ พื้นที่ในไดรฟ์ {drive} ไม่พอ  ต้องการ {} แต่เหลือ {}  ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", gb(need), gb(free)));
                break;
            }
            let partial = partial_of(&target, vobsub);
            // ที่อยู่ยาวเกินที่ Windows รับ · บอกตรงสาเหตุก่อนเริ่ม (เดิมเครื่องมือหรือตัวย้ายล้มแล้วขึ้นว่าหาไฟล์ไม่เจอ ผู้ช่วยตรวจโค้ดเจอ · TECH-REVIEW ข้อ 16)
            if partial.to_string_lossy().encode_utf16().count() > crate::cover::rename::MAX_PATH_LEN {
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {} ไม่สำเร็จ โฟลเดอร์ที่เก็บยาวเกินไป  กดเปลี่ยนที่เก็บเป็นโฟลเดอร์ที่สั้นกว่า แล้วลองใหม่  ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it)));
                continue;
            }
            let stop = || STOP.load(std::sync::atomic::Ordering::SeqCst) || jobs.cancelled();
            match place_item(&tools, &src, it, &target, vobsub, &|p| { let _ = app.emit("extract-progress", ExtractProgress { index: i, percent: p }); }, &stop) {
                // VobSub ได้สองไฟล์ files เก็บ .idx ที่โปรแกรมอื่นเปิด pair เก็บ .sub (BUGS ข้อ 150)
                Ok(Placed::Done(fs)) => {
                    r.states[i] = "done".into();
                    r.files[i] = fs.first().map(|f| f.to_string_lossy().to_string());
                    r.pair[i] = fs.get(1).map(|f| f.to_string_lossy().to_string());
                }
                Ok(Placed::Cancelled) => {
                    r.states[i] = "cancelled".into();
                    break;
                }
                // ข้อความบนการ์ดเป็นสาเหตุภาษาไทย ข้อความของเครื่องมือไปอยู่ในปุ่ม ⓘ
                Err(e) => { r.states[i] = "failed".into(); r.error = Some(format!("แยก {} ไม่สำเร็จ  {}  ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it), e.why)); r.detail = e.detail; break; }
            }
        }
        Ok(r)
    }).await.map_err(|e| e.to_string())?
}
