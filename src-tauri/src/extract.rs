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

use crate::tools::{run_tool_timeout, tool_command, tool_succeeded, ToolFail};

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
            lines.extend(crate::tools::tool_lines(&String::from_utf8_lossy(&out.stderr)));
            Err(crate::tools::explain_fail(tool, &lines, Some(&out.status)).line())
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

/// รหัสภาษาสามตัวของ mkvmerge เป็นสองตัวแบบที่หน้า MediaInfo ส่งมา · und ไม่ใส่
fn short_lang(l: &str) -> Option<String> {
    let l = l.to_lowercase();
    let s = match l.as_str() { "" | "und" => return None, "tha" => "th", "eng" => "en", "jpn" => "ja", "kor" => "ko", "chi" | "zho" => "zh", "fre" | "fra" => "fr", "ger" | "deu" => "de", "spa" => "es", "ita" => "it", "rus" => "ru", "por" => "pt", "vie" => "vi", _ => return Some(l) };
    Some(s.into())
}

/// นามสกุลของแทร็กตาม codec id ของ Matroska · ใช้ตอนแยกหลายไฟล์ แต่ละไฟล์อาจเป็นเสียงคนละชนิด
fn ext_of_codec(kind: &str, codec_id: &str, raw_video: Option<&str>) -> String {
    let c = codec_id.to_uppercase();
    if kind == "video" {
        return match raw_video { Some(_) if c.starts_with("V_MPEG4/ISO/AVC") => "h264".into(), Some(_) if c.starts_with("V_MPEGH/ISO/HEVC") => "h265".into(), _ => "mkv".into() };
    }
    let e = if c.starts_with("A_AC3") { "ac3" } else if c.starts_with("A_EAC3") { "eac3" } else if c.starts_with("A_DTS") { "dts" } else if c.starts_with("A_TRUEHD") { "thd" }
        else if c.starts_with("A_MLP") { "mlp" } else if c.starts_with("A_FLAC") { "flac" } else if c.starts_with("A_AAC") { "aac" } else if c.starts_with("A_OPUS") { "opus" }
        else if c.starts_with("A_VORBIS") { "ogg" } else if c == "A_MPEG/L3" { "mp3" } else if c == "A_MPEG/L2" { "mp2" } else if c.starts_with("A_PCM") { "wav" } else if c.starts_with("A_WAVPACK") { "wv" } else if c.starts_with("A_TTA") { "tta" }
        else if c == "S_TEXT/UTF8" || c == "S_TEXT/ASCII" { "srt" } else if c == "S_TEXT/ASS" { "ass" } else if c == "S_TEXT/SSA" { "ssa" } else if c == "S_TEXT/WEBVTT" { "vtt" }
        else if c == "S_HDMV/PGS" { "sup" } else if c == "S_VOBSUB" { "sub" } else if kind == "audio" { "mka" } else { "mks" };
    e.into()
}

/// ชื่อไฟล์แนบใน MKV เป็นข้อความอะไรก็ได้ (เช่น `x\..\..\Startup\a.cmd`) · เอาเฉพาะชื่อส่วนท้าย ตัดอักษรที่ Windows ห้ามในชื่อไฟล์และอักษรควบคุม
/// ชื่อว่าง ชื่อสงวน หรือเหลือแต่จุด ใช้ attachment<n>.<ext> แทน · เดิมใช้ชื่อตรง ๆ แยกแล้วไฟล์ไปโผล่นอกโฟลเดอร์ที่เลือกได้ (ผู้ช่วยตรวจโค้ดเจอ)
fn safe_att_name(it: &Item) -> String {
    let fallback = || format!("attachment{}.{}", it.nth, it.ext);
    let Some(raw) = it.name.as_deref() else { return fallback() };
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = last.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let clean = clean.trim().trim_end_matches(['.', ' ']).to_string();
    let stem = clean.split('.').next().unwrap_or("").trim().to_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit());
    if clean.is_empty() || clean.chars().all(|c| c == '.') || reserved { fallback() } else { clean }
}

/// ชนิดไฟล์ปลายทางของ ffmpeg ตามนามสกุล · ไม่รู้จัก = None (ตั้งนามสกุลเป็น mka mks mkv ตามจริงแทน)
fn ff_format(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "mkv" | "mka" | "mks" => "matroska", "aac" => "adts", "ac3" => "ac3", "eac3" => "eac3", "mp3" => "mp3", "dts" => "dts", "flac" => "flac",
        "thd" => "truehd", "wav" => "wav", "ogg" | "opus" => "ogg", "wma" => "asf",
        "srt" => "srt", "ass" | "ssa" => "ass", "sup" => "sup", "vtt" => "webvtt",
        // ภาพแบบสตรีมล้วน ไม่มีกล่องไฟล์ (BUGS ข้อ 35 ต่อ) · ffmpeg ใส่ตัวแปลงรูปแบบสตรีมจาก MP4 เป็นแบบ Annex B ให้เองตอนเขียน
        "h264" => "h264", "h265" | "hevc" => "hevc",
        _ => return None,
    })
}

/// ไฟล์ที่ไม่ใช่ MKV แยกด้วย ffmpeg · นามสกุลที่ ffmpeg เขียนแยกเดี่ยวไม่ได้ (เช่น ซับ VobSub .sub) เปลี่ยนเป็นไฟล์ Matroska ตามชนิด
/// เดิมเขียนข้างในเป็น Matroska ใต้นามสกุลเดิม ได้ไฟล์ .sup .thd ที่ข้างในเป็น MKV เปิดไม่ได้ (ผู้ช่วยตรวจโค้ดเจอ)
pub fn fix_ext_for_ffmpeg(it: &mut Item) {
    // บทเขียนเป็น XML เองไม่ผ่าน ffmpeg (AUDIT ข้อ 17)
    if it.kind == "menu" { return; }
    if ff_format(&it.ext).is_none() {
        it.ext = match it.kind.as_str() { "audio" => "mka", "text" => "mks", _ => "mkv" }.into();
    }
}

/// ชื่อชนต่อท้าย 2 3 (ตั้งชื่อใหม่ต่อท้ายเลข 2) · งานจริงใช้ numbered_free (เทสใช้)
#[cfg(test)]
pub fn numbered(p: &Path) -> PathBuf {
    numbered_free(p, false)
}

/// ไฟล์ปลายทางทุกไฟล์ของชิ้นนี้ · VobSub คือ .idx กับ .sub ชื่อเดียวกัน (BUGS ข้อ 150) · ชิ้นอื่นไฟล์เดียว
pub fn finals_of(target: &Path, vobsub: bool) -> Vec<PathBuf> {
    if vobsub { vec![target.with_extension("idx"), target.with_extension("sub")] } else { vec![target.to_path_buf()] }
}

/// ต่อท้ายเลขจนชื่อว่าง · VobSub ต้องว่างทั้ง .idx และ .sub ไม่งั้นได้คู่ที่ไฟล์หนึ่งเป็นของเรื่องอื่น
pub fn numbered_free(p: &Path, vobsub: bool) -> PathBuf {
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let dir = p.parent().unwrap_or(Path::new(""));
    (2..).map(|n| dir.join(format!("{stem} {n}{ext}"))).find(|x| finals_of(x, vobsub).iter().all(|f| !f.exists())).unwrap()
}

/// เลขแทร็กของ mkvmerge (เริ่ม 0) ของแทร็กลำดับที่ nth ในชนิดนั้น
fn mkv_track_id(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<u64, String> {
    mkv_track(tools, file, kind, nth).map(|(id, _)| id)
}

/// เลขแทร็กของ mkvmerge กับ codec id ของ Matroska (ซับ VobSub คือ S_VOBSUB · BUGS ข้อ 150)
fn mkv_track(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<(u64, String), String> {
    let j = mkv_json(tools, file)?;
    let want = match kind { "video" => "video", "audio" => "audio", _ => "subtitles" };
    j["tracks"].as_array().and_then(|t| t.iter().filter(|x| x["type"] == want).nth(nth.checked_sub(1)?))
        .and_then(|x| Some((x["id"].as_u64()?, x["properties"]["codec_id"].as_str().unwrap_or("").to_string())))
        .ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

fn mkv_attachment_id(tools: &Path, file: &Path, nth: usize) -> Result<u64, String> {
    let j = mkv_json(tools, file)?;
    j["attachments"].as_array().and_then(|a| a.get(nth - 1)).and_then(|x| x["id"].as_u64()).ok_or_else(|| "ไม่เจอไฟล์แนบ".into())
}

/// เลขสตรีมของ ffmpeg กับชนิดข้อมูล ของแทร็กลำดับที่ nth ในชนิดนั้น (ไม่นับรูปปก)
fn ff_stream(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<(u64, String), String> {
    let out = run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"), OsStr::new("-show_streams"), file.as_os_str()], Duration::from_secs(60))?;
    let j = tool_json("ffprobe", &out)?;
    // ชนิดอื่น (บท ไฟล์แนบ) ไม่ใช่สตรีมของ ffmpeg · เดิมนับเป็นซับ ติ๊กบทของ MP4 ได้ซับแทร็กแรกใต้ชื่อ .chapters.xml (AUDIT 12 พ.ย. 2569 ข้อ 17)
    let want = match kind { "video" => "video", "audio" => "audio", "text" => "subtitle", k => return Err(format!("แยก {k} จากไฟล์ที่ไม่ใช่ MKV ด้วยวิธีนี้ไม่ได้")) };
    j["streams"].as_array().and_then(|s| s.iter().filter(|x| x["codec_type"] == want && x["disposition"]["attached_pic"].as_i64() != Some(1)).nth(nth - 1))
        .and_then(|x| Some((x["index"].as_u64()?, x["codec_name"].as_str().unwrap_or("").to_string()))).ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

/// ภาพแบบสตรีมล้วน ไม่มีกล่องไฟล์ · หน้าเสียงและซับเลือกได้เฉพาะภาพ AVC (H.264) กับ HEVC (H.265)
pub fn is_raw_video(ext: &str) -> bool {
    matches!(ext, "h264" | "h265" | "hevc")
}

pub enum Done {
    /// ไฟล์ที่เครื่องมือเขียนจริง · ซับ VobSub ได้สองไฟล์ .idx กับ .sub ชิ้นอื่นได้ไฟล์เดียวตามชื่อที่ส่งไป
    Ok(Vec<PathBuf>),
    Cancelled,
}

/// ซับ VobSub ในไฟล์ MKV (BUGS ข้อ 150) · หน้าเสียงและซับตั้งนามสกุล sub ให้แทร็ก S_VOBSUB เท่านั้น (fileinfo.rs กับ ext_of_codec)
/// ไฟล์อื่นแยกด้วย ffmpeg เป็น Matroska ไฟล์เดียว (fix_ext_for_ffmpeg)
pub fn is_vobsub(src_mkv: bool, it: &Item) -> bool {
    src_mkv && it.kind == "text" && it.ext.eq_ignore_ascii_case("sub")
}

/// ไฟล์ที่ mkvextract เขียนจริงเมื่อส่งชื่อ p ให้แยก VobSub · มันเปลี่ยนนามสกุลท้ายของชื่อที่ส่งไปเป็น .idx กับ .sub เอง
/// ส่ง a.sub.partial ได้ a.sub.idx กับ a.sub.sub (ลองจริงกับ mkvextract ที่แนบมา 16 พ.ย. 2569) · .idx ก่อน .sub
pub fn vobsub_outputs(p: &Path) -> Vec<PathBuf> {
    vec![p.with_extension("idx"), p.with_extension("sub")]
}

/// ชื่อชั่วคราวที่ส่งให้เครื่องมือ · VobSub ใช้ <ชื่อ>.partial.sub จึงได้ <ชื่อ>.partial.idx กับ <ชื่อ>.partial.sub ที่ดูออกว่ายังไม่เสร็จ
/// ชิ้นอื่นใช้ <ชื่อ>.partial แบบเดิม
pub fn partial_of(target: &Path, vobsub: bool) -> PathBuf {
    PathBuf::from(format!("{}.partial{}", target.to_string_lossy(), if vobsub { ".sub" } else { "" }))
}

/// ข้อความที่เครื่องมือพิมพ์ เก็บไว้ 60 บรรทัดท้าย ใช้บอกสาเหตุตอนไม่สำเร็จ
fn keep_tail(buf: &std::sync::Mutex<Vec<String>>, text: &str) {
    let mut b = buf.lock().unwrap();
    b.extend(crate::tools::tool_lines(text));
    let n = b.len();
    if n > 60 { b.drain(..n - 60); }
}

/// แยกหนึ่งชิ้นลง partial · ความคืบหน้า 0–100 · stop = กดหยุด
/// ซับ VobSub ของ MKV ได้สองไฟล์ตาม vobsub_outputs(partial) · ไม่สำเร็จบอกสาเหตุเป็นประโยคไทยจากข้อความของเครื่องมือ (BUGS ข้อ 150)
pub fn extract_one(tools: &Path, file: &Path, it: &Item, partial: &Path, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Done, ToolFail> {
    let mkv = file.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false);
    let mut outs = vec![partial.to_path_buf()];
    let (tool, args): (&str, Vec<OsString>) = if mkv {
        match it.kind.as_str() {
            // ภาพที่เลือกแบบสตรีมล้วน (.h264 .h265) ใช้ mkvextract แบบเดียวกับเสียงและซับ ได้สตรีมดิบที่ MKVToolNix กับโปรแกรมรวมไฟล์อื่นรับได้ (BUGS ข้อ 35 ต่อ)
            "video" if is_raw_video(&it.ext) => {
                let id = mkv_track_id(tools, file, "video", it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "tracks".into(), t])
            }
            "video" => {
                let id = mkv_track_id(tools, file, "video", it.nth)?;
                ("mkvmerge", vec!["--gui-mode".into(), "-o".into(), partial.into(), "-A".into(), "-S".into(), "-M".into(), "-B".into(), "--no-chapters".into(), "-d".into(), id.to_string().into(), file.into()])
            }
            "menu" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "chapters".into(), partial.into()]),
            // แท็ก chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรม แบบ gMKVExtractGUI (BUGS ข้อ 130 · ชื่อโหมดตามซอร์ส MkvExtractModes.cs)
            "tags" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "tags".into(), partial.into()]),
            "ogm" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "chapters".into(), "--simple".into(), partial.into()]),
            "cue" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "cuesheet".into(), partial.into()]),
            "timestamps" => {
                let id = mkv_track_id(tools, file, it.of.as_deref().unwrap_or("video"), it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "timestamps_v2".into(), t])
            }
            "attachment" => {
                let id = mkv_attachment_id(tools, file, it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "attachments".into(), t])
            }
            k => {
                let (id, codec) = mkv_track(tools, file, k, it.nth)?;
                // ดูจากชนิดแทร็กจริง ไม่พึ่งนามสกุลที่หน้าจอส่งมา
                if codec.eq_ignore_ascii_case("S_VOBSUB") { outs = vobsub_outputs(partial); }
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "tracks".into(), t])
            }
        }
    } else if matches!(it.kind.as_str(), "tags" | "ogm" | "cue" | "timestamps") {
        return Err("แยกชิ้นนี้ได้เฉพาะไฟล์ MKV".into());
    } else if it.kind == "menu" {
        // บทของ MP4 และไฟล์อื่น อ่านด้วย ffprobe แล้วเขียนเป็น Matroska XML แบบที่ mkvextract เขียน (AUDIT ข้อ 17)
        let chs = crate::chapters::read(tools, file)?;
        if chs.is_empty() { return Err("ไฟล์นี้ไม่มีบทของหนัง".into()); }
        let dur = crate::probe::probe(tools, file).ok().and_then(|x| x.duration);
        std::fs::write(partial, crate::chapters::xml_text(&chs, dur)).map_err(|e| format!("เขียนไฟล์บทไม่ได้: {e}"))?;
        on(100.0);
        return Ok(Done::Ok(outs));
    } else {
        let (idx, codec) = ff_stream(tools, file, &it.kind, it.nth)?;
        let fmt = ff_format(&it.ext).unwrap_or("matroska");
        // ซับตัวหนังสือของ MP4 (mov_text) ตัวเขียน srt ของ ffmpeg รับแบบ copy ไม่ได้ ต้องแปลงตัวหนังสือเป็น SRT (ไม่ใช่ภาพหรือเสียง ไม่เสียคุณภาพ)
        let codec_arg = if fmt == "srt" && codec != "subrip" && codec != "text" { "srt" } else { "copy" };
        ("ffmpeg", vec!["-hide_banner".into(), "-nostdin".into(), "-n".into(), "-v".into(), "error".into(), "-i".into(), file.into(), "-map".into(), format!("0:{idx}").into(),
            "-c".into(), codec_arg.into(), "-f".into(), fmt.into(), partial.into()])
    };
    // ข้อความผิดพลาดของ mkvextract แบบ --gui-mode ออกทาง stdout (#GUI#error) ของ ffmpeg ออกทาง stderr · เดิมทิ้ง stderr จึงบอกได้แค่รหัส (BUGS ข้อ 150)
    let mut child = tool_command(tools, tool, &args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก {tool} ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let msgs = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let m1 = msgs.clone();
    let reader = std::thread::spawn(move || {
        for l in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
                let _ = tx.send(p);
            } else {
                keep_tail(&m1, &l);
            }
        }
    });
    let m2 = msgs.clone();
    let err_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut BufReader::new(err), &mut buf);
        keep_tail(&m2, &String::from_utf8_lossy(&buf));
    });
    let clean = |outs: &[PathBuf]| for p in outs { let _ = std::fs::remove_file(p); };
    loop {
        while let Ok(p) = rx.try_recv() {
            on(p);
        }
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            let _ = err_reader.join();
            clean(&outs);
            return Ok(Done::Cancelled);
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            let _ = reader.join();
            let _ = err_reader.join();
            let lines = msgs.lock().unwrap().clone();
            if !tool_succeeded(tool, &st) {
                clean(&outs);
                return Err(crate::tools::explain_fail(tool, &lines, Some(&st)));
            }
            // เครื่องมือจบปกติแต่ไม่ได้ไฟล์ครบ · เดิมขึ้น "แยกไม่สำเร็จ (รหัส 0)" ที่ขัดกันเอง
            if let Some(miss) = outs.iter().find(|p| !p.exists()) {
                let got: Vec<String> = outs.iter().filter(|p| p.exists()).filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string())).collect();
                clean(&outs);
                let name = miss.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let mut f = crate::tools::explain_fail(tool, &lines, None);
                if f.why.ends_with("ไม่ได้ไฟล์ออกมา") {
                    f.why = format!("{tool} ทำงานจบแล้วแต่ไม่พบไฟล์ {name} ที่ควรได้");
                    if !got.is_empty() { f.detail = Some(format!("ได้แค่ {}", got.join(" และ "))); }
                }
                return Err(f);
            }
            on(100.0);
            return Ok(Done::Ok(outs));
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::Digest;

    fn tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }
    fn movie() -> PathBuf {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
        assert!(p.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
        p
    }
    fn sha(p: &Path) -> String {
        crate::probe::hex(&sha2::Sha256::digest(std::fs::read(p).unwrap()))
    }

    #[test]
    fn names_follow_the_mockup() {
        let it = |kind: &str, nth, ext: &str, lang: Option<&str>, name: Option<&str>| Item { kind: kind.into(), nth, ext: ext.into(), lang: lang.map(String::from), name: name.map(String::from), of: None };
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("audio", 1, "ac3", Some("th"), None)), "ดาวเหนือ (2023).Audio1.th.ac3");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("text", 1, "srt", Some("th"), None)), "ดาวเหนือ (2023).Text1.th.srt");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("attachment", 1, "jpg", None, Some("cover.jpg"))), "ดาวเหนือ (2023).cover.jpg");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("video", 1, "mkv", None, None)), "ดาวเหนือ (2023).Video1.mkv");
    }

    /// รูปแบบชื่อแบบ gMKVExtractGUI (BUGS ข้อ 130) · ค่าตั้งต้นได้ชื่อเดิม ดีเลย์ต่อท้ายแบบที่หน้าเสียงและซับอ่านกลับได้ ตัวแทนว่างไม่ทิ้งจุดซ้อน
    #[test]
    fn pattern_names() {
        let it = |kind: &str, nth, ext: &str, lang: Option<&str>| Item { kind: kind.into(), nth, ext: ext.into(), lang: lang.map(String::from), name: None, of: None };
        let s = "ดาวเหนือ (2023)";
        assert_eq!(pattern_name(DEFAULT_PATTERN, s, &it("audio", 1, "ac3", Some("th")), None, None), "ดาวเหนือ (2023).Audio1.th.ac3");
        assert_eq!(pattern_name(DEFAULT_PATTERN, s, &it("audio", 2, "ac3", None), Some(0), None), "ดาวเหนือ (2023).Audio2.ac3");
        let d = pattern_name(DEFAULT_PATTERN, s, &it("audio", 1, "ac3", Some("th")), Some(-120), None);
        assert_eq!(d, "ดาวเหนือ (2023).Audio1.th DELAY -120ms.ac3");
        assert_eq!(crate::merge::delay_from_name(&d), Some(-120), "หน้าเสียงและซับต้องอ่านดีเลย์จากชื่อกลับได้");
        assert_eq!(pattern_name("{Type}{Number} - {Language} - {Filename}", s, &it("text", 3, "srt", Some("en")), None, None), "Text3 - en - ดาวเหนือ (2023).srt");
        assert_eq!(pattern_name("{Filename} [{TrackName}]", s, &it("audio", 1, "aac", None), None, Some("พากย์ไทย: 5.1/ใหม่")), "ดาวเหนือ (2023) [พากย์ไทย_ 5.1_ใหม่].aac");
        assert_eq!(pattern_name("", s, &it("video", 1, "mkv", None), None, None), "ดาวเหนือ (2023).Video1.mkv", "รูปแบบว่างใช้แบบตั้งต้น");
        assert_eq!(pattern_name("{Language}", s, &it("video", 1, "mkv", None), None, None), "ดาวเหนือ (2023).Video1.mkv", "รูปแบบที่ได้ชื่อว่างใช้ชื่อหนังกับชนิดแทน");
        assert_eq!(pattern_name("{Type}{Number}  - {Language} - {Filename}", s, &it("audio", 1, "ogg", None), None, None), "Audio1 - - ดาวเหนือ (2023).ogg", "เว้นวรรคซ้อนยุบเหลือช่องเดียว");
        let ts = Item { kind: "timestamps".into(), of: Some("audio".into()), ..it("timestamps", 2, "txt", Some("en")) };
        assert_eq!(out_name_with(s, &ts, DEFAULT_PATTERN, None, None), "ดาวเหนือ (2023).Audio2.en.timestamps.txt");
        assert_eq!(out_name(s, &it("tags", 1, "xml", None)), "ดาวเหนือ (2023).tags.xml");
        assert_eq!(out_name(s, &it("ogm", 1, "txt", None)), "ดาวเหนือ (2023).chapters.txt");
        assert_eq!(out_name(s, &it("cue", 1, "cue", None)), "ดาวเหนือ (2023).cue");
    }

    /// พี่กันเจอ 15 พ.ย. 2569 แยกซับของซีรีส์ ACCA ไม่ได้ ขึ้นที่อยู่ยาวเกิน ทั้งที่ชื่อไม่ยาว
    /// เดิมโฟลเดอร์ "<ชื่อหนัง> แยกไฟล์" ชื่อหนังซ้ำสองรอบ ที่อยู่ยาว 291 ตัว · ชื่อ "Dept. (2017)" โดนลบจุด
    #[test]
    fn long_series_paths_fit_and_names_keep_dots() {
        let dir = Path::new(r"D:\ACCA 13-Territory Inspection Dept. (2017) [Season 1+OVA] [BD 1080p HEVC OPUS] [Dual-Audio]\Season 1");
        let stem = "ACCA 13-Territory Inspection Dept. (2017) - S01E01 - Jean the Cigarette-Peddler";
        let movie = dir.join(format!("{stem}.mkv"));
        let out = default_folder(&movie);
        assert_eq!(out, dir.join("แยกไฟล์"), "โฟลเดอร์ตั้งต้นไม่ซ้ำชื่อหนัง");
        let it = Item { kind: "text".into(), nth: 1, ext: "ass".into(), lang: Some("en".into()), name: None, of: None };
        let name_of = |st: &str| out_name_with(st, &it, DEFAULT_PATTERN, None, None);
        let (name, cut) = fit_name(&out, stem, &name_of);
        assert_eq!(name, format!("{stem}.Text1.en.ass"), "ชื่อเต็มคงจุดหลัง Dept");
        assert!(!cut);
        assert!(out.join(&name).to_string_lossy().encode_utf16().count() + 8 <= crate::rename::MAX_PATH_LEN);
        // โฟลเดอร์ที่ผู้ใช้เลือกยาวมาก ตัดท้ายชื่อหนังให้พอดี ส่วนแทร็ก ภาษา นามสกุลคงไว้
        let deep = dir.join("โฟลเดอร์ที่เลือกเองซึ่งยาวมากเป็นพิเศษสำหรับทดสอบการตัดชื่อไฟล์ให้พอดีกับที่ Windows รับได้ครบทุกตัว");
        let (short, cut2) = fit_name(&deep, stem, &name_of);
        assert!(cut2 && short.ends_with("….Text1.en.ass") && short.starts_with("ACCA 13"), "{short}");
        assert!(deep.join(&short).to_string_lossy().encode_utf16().count() + 8 <= crate::rename::MAX_PATH_LEN, "{}", deep.join(&short).display());
        // โฟลเดอร์ยาวจนไม่เหลือที่ให้ชื่อ คืนชื่อเต็มให้ตัวตรวจความยาวบอกว่าไม่สำเร็จ
        let huge = PathBuf::from(format!(r"D:\{}", "ก".repeat(250)));
        assert!(!fit_name(&huge, stem, &name_of).1);
    }

    /// แยกแท็ก chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรมจากหนังทดสอบได้ไฟล์จริง · ดีเลย์ของเสียงจาก minimum_timestamp · ปรับชิ้นตอนแยกหลายไฟล์ (BUGS ข้อ 130)
    #[test]
    fn gmkv_style_extras() {
        let src = movie();
        let before = sha(&src);
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกแบบ-gmkv-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let j = mkv_json(&tools(), &src).unwrap();
        let info = info_of(&j);
        assert!(info.mkv && info.tags && info.chapters, "{info:?}");
        assert_eq!(info.delays, vec![0, 0]);
        let x = |kind: &str, ext: &str, of: Option<&str>| Item { kind: kind.into(), nth: 1, ext: ext.into(), lang: None, name: None, of: of.map(String::from) };
        for (it, want) in [(x("tags", "xml", None), "<Tags>"), (x("ogm", "txt", None), "CHAPTER01="), (x("cue", "cue", None), "TRACK 01"), (x("timestamps", "txt", Some("audio")), "format v2")] {
            let out = d.join(out_name("t", &it));
            assert!(matches!(extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false).unwrap(), Done::Ok(_)), "{}", it.kind);
            let t = std::fs::read_to_string(&out).unwrap();
            assert!(t.contains(want), "{} ต้องมี {want}: {}", it.kind, t.chars().take(200).collect::<String>());
        }
        // ไฟล์ที่ไม่ใช่ MKV ไม่มีชิ้นพวกนี้
        let mp4 = src.parent().unwrap().join("The Last Orchard (2022).mp4");
        assert!(extract_one(&tools(), &mp4, &x("tags", "xml", None), &d.join("x.xml"), &|_| {}, &|| false).is_err());
        // เสียงเลื่อนไป 120 ms (mkvmerge --sync) ได้ดีเลย์ 120 แล้วชื่อไฟล์ต่อท้าย DELAY 120ms
        let late = d.join("เสียงช้า.mkv");
        crate::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-o"), late.as_os_str(), OsStr::new("--sync"), OsStr::new("1:120"), src.as_os_str()]).unwrap();
        let li = info_of(&mkv_json(&tools(), &late).unwrap());
        assert_eq!(li.delays[0], 120, "{li:?}");
        let a1 = Item { kind: "audio".into(), nth: 1, ext: "aac".into(), lang: Some("th".into()), name: None, of: None };
        assert_eq!(out_name_with("เสียงช้า", &a1, DEFAULT_PATTERN, li.delays.first().copied(), None), "เสียงช้า.Audio1.th DELAY 120ms.aac");
        // แยกหลายไฟล์ หาเลขแทร็ก นามสกุล และภาษาของไฟล์นั้นใหม่ · ชิ้นที่ไฟล์นั้นไม่มีได้ None
        let other = src.parent().unwrap().join("Vorbis Test (2010).mkv");
        let oj = mkv_json(&tools(), &other).unwrap();
        let oi = info_of(&oj);
        let fa = fit_item(&oj, &oi, &Item { kind: "audio".into(), nth: 1, ext: "ac3".into(), lang: Some("th".into()), name: None, of: None }).unwrap();
        assert_eq!(fa.ext, "ogg", "เสียงของไฟล์นั้นเป็น Vorbis");
        assert!(fit_item(&oj, &oi, &Item { kind: "audio".into(), nth: 9, ext: "ac3".into(), lang: None, name: None, of: None }).is_none());
        assert_eq!(fit_item(&j, &info, &Item { kind: "text".into(), nth: 2, ext: "srt".into(), lang: None, name: None, of: None }).unwrap().ext, "ass");
        assert_eq!(fit_item(&j, &info, &Item { kind: "audio".into(), nth: 1, ext: "x".into(), lang: None, name: None, of: None }).unwrap().lang.as_deref(), Some("th"));
        assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// ชื่อไฟล์แนบที่ตั้งใจทำมาให้หลุดโฟลเดอร์ เหลือแค่ชื่อส่วนท้ายที่ปลอดภัย (ผู้ช่วยตรวจโค้ดข้อ 5)
    #[test]
    fn attachment_names_cannot_escape_the_folder() {
        let att = |name: &str| Item { kind: "attachment".into(), nth: 3, ext: "bin".into(), lang: None, name: Some(name.into()), of: None };
        let stem = "ดาวเหนือ (2023)";
        assert_eq!(out_name(stem, &att(r"x\..\..\..\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\a.cmd")), "ดาวเหนือ (2023).a.cmd");
        assert_eq!(out_name(stem, &att("../../evil.ttf")), "ดาวเหนือ (2023).evil.ttf");
        assert_eq!(out_name(stem, &att("font:stream.ttf")), "ดาวเหนือ (2023).font_stream.ttf");
        assert_eq!(out_name(stem, &att("..")), "ดาวเหนือ (2023).attachment3.bin");
        assert_eq!(out_name(stem, &att("CON.txt")), "ดาวเหนือ (2023).attachment3.bin");
        assert_eq!(out_name(stem, &att("a\u{7}b.ttf ")), "ดาวเหนือ (2023).a_b.ttf");
        let dir = Path::new(r"D:\หนัง\ดาวเหนือ (2023) แยกไฟล์");
        for n in [r"..\..\x.cmd", "/abs/y.ttf", r"C:\z.ttf", "ok.ttf"] {
            assert_eq!(dir.join(out_name(stem, &att(n))).parent(), Some(dir), "{n} ต้องอยู่ในโฟลเดอร์ที่เลือก");
        }
    }

    /// ไฟล์ที่ไม่ใช่ MKV · นามสกุลที่ ffmpeg เขียนเดี่ยวไม่ได้กลายเป็น mka mks · ที่เขียนได้คงเดิม (ผู้ช่วยตรวจโค้ดข้อ 7)
    #[test]
    fn raw_video_names_and_formats() {
        let it = Item { kind: "video".into(), nth: 1, ext: "h264".into(), lang: None, name: None, of: None };
        assert_eq!(out_name("ดาวเหนือ (2023)", &it), "ดาวเหนือ (2023).Video1.h264");
        assert!(is_raw_video("h264") && is_raw_video("h265") && !is_raw_video("mkv"));
        let mut a = it.clone(); fix_ext_for_ffmpeg(&mut a); assert_eq!(a.ext, "h264");
        let mut b = Item { ext: "h265".into(), ..it }; fix_ext_for_ffmpeg(&mut b); assert_eq!(b.ext, "h265");
    }

    #[test]
    fn ffmpeg_extensions_match_what_is_written() {
        let fx = |kind: &str, ext: &str| { let mut it = Item { kind: kind.into(), nth: 1, ext: ext.into(), lang: None, name: None, of: None }; fix_ext_for_ffmpeg(&mut it); it.ext };
        assert_eq!(fx("text", "sub"), "mks");
        assert_eq!(fx("audio", "weird"), "mka");
        for (k, e) in [("text", "sup"), ("audio", "thd"), ("text", "vtt"), ("text", "ssa"), ("audio", "wma"), ("audio", "ac3"), ("text", "srt")] {
            assert_eq!(fx(k, e), e, "{e} ffmpeg เขียนได้ ต้องคงนามสกุลเดิม");
        }
        assert_eq!(ff_format("sup"), Some("sup"));
        assert_eq!(ff_format("thd"), Some("truehd"));
        assert_eq!(ff_format("vtt"), Some("webvtt"));
    }

    /// ซับ mov_text ใน MP4 แยกเป็น SRT ได้ไฟล์ SRT จริง (เดิม -c copy ตัวเขียน srt ไม่รับ mov_text)
    #[test]
    fn mp4_mov_text_extracts_as_real_srt() {
        let src = movie().parent().unwrap().join("The Last Orchard (2022).mp4");
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกซับ-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let out = d.join("sub.srt");
        let it = Item { kind: "text".into(), nth: 1, ext: "srt".into(), lang: None, name: None, of: None };
        assert!(matches!(extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
        let t = std::fs::read_to_string(&out).unwrap();
        assert!(t.contains("-->") && t.trim_start().starts_with('1'), "ต้องได้ SRT จริง: {}", t.chars().take(80).collect::<String>());
        let _ = std::fs::remove_dir_all(&d);
    }

    /// AUDIT 12 พ.ย. 2569 ข้อ 17 หนัง MP4 ที่มีบทและมีซับ แยกบทต้องได้ Matroska XML ที่ mkvmerge อ่านได้ครบทุกบท
    /// เดิมได้ซับแทร็กแรกเป็นไฟล์ Matroska ใต้ชื่อ .chapters.xml · ชนิดที่ไม่ใช่สตรีม (ไฟล์แนบ) ต้องบอกว่าแยกไม่ได้ ไม่หยิบซับมาแทน
    #[test]
    fn mp4_chapters_extract_as_matroska_xml() {
        let src = movie().parent().unwrap().join("The Last Orchard (2022).mp4");
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกบท-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let meta = d.join("meta.txt");
        std::fs::write(&meta, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=4000\ntitle=เปิดเรื่อง\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=4000\nEND=8000\ntitle=ฉาก <สอง> & จบ\n").unwrap();
        let mp4 = d.join("มีบท.mp4");
        let o = crate::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), src.as_os_str(), OsStr::new("-f"), OsStr::new("ffmetadata"), OsStr::new("-i"), meta.as_os_str(),
            OsStr::new("-map"), OsStr::new("0"), OsStr::new("-map_chapters"), OsStr::new("1"), OsStr::new("-c"), OsStr::new("copy"), mp4.as_os_str()]).unwrap();
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
        let mut it = Item { kind: "menu".into(), nth: 1, ext: "xml".into(), lang: None, name: None, of: None };
        fix_ext_for_ffmpeg(&mut it);
        assert_eq!(it.ext, "xml", "บทไม่ผ่าน ffmpeg นามสกุลต้องคงเป็น xml");
        let ch = d.join("บท.chapters.xml");
        assert!(matches!(extract_one(&tools(), &mp4, &it, &ch, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
        let t = std::fs::read_to_string(&ch).expect("ไฟล์บทต้องเป็นข้อความ ไม่ใช่ Matroska");
        assert!(t.starts_with("<?xml") && t.matches("<ChapterAtom>").count() == 2 && t.contains("เปิดเรื่อง") && t.contains("ฉาก &lt;สอง&gt; &amp; จบ"), "{t}");
        // mkvmerge อ่านไฟล์บทนี้ได้ครบสองบท
        let back = d.join("ใส่บทกลับ.mkv");
        let o = crate::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-o"), back.as_os_str(), OsStr::new("--chapters"), ch.as_os_str(), src.as_os_str()]).unwrap();
        assert!(o.status.code().unwrap_or(9) <= 1, "{}", String::from_utf8_lossy(&o.stdout));
        let j: Value = serde_json::from_slice(&crate::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-J"), back.as_os_str()]).unwrap().stdout).unwrap();
        assert_eq!(j["chapters"][0]["num_entries"].as_u64(), Some(2), "{}", j["chapters"]);
        // หนัง MP4 ที่ไม่มีบท บอกตรง ๆ ว่าไม่มีบท
        let e = extract_one(&tools(), &src, &it, &d.join("ไม่มีบท.xml"), &|_| {}, &|| false).err().unwrap_or_default().why;
        assert!(e.contains("ไม่มีบท"), "{e}");
        // ไฟล์แนบของไฟล์ที่ไม่ใช่ MKV ไม่หยิบซับมาแทน
        let e = extract_one(&tools(), &mp4, &Item { kind: "attachment".into(), nth: 1, ext: "ttf".into(), lang: None, name: Some("a.ttf".into()), of: None }, &d.join("a.ttf"), &|_| {}, &|| false).err().unwrap_or_default().why;
        assert!(e.contains("ไม่ใช่ MKV"), "{e}");
        assert!(!d.join("a.ttf").exists());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn extracted_tracks_match_mkvextract_and_source_untouched() {
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยก-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let src = movie();
        let before = sha(&src);
        for (kind, nth, ext) in [("audio", 2, "ac3"), ("text", 1, "srt"), ("text", 2, "ass")] {
            let it = Item { kind: kind.into(), nth, ext: ext.into(), lang: None, name: None, of: None };
            let mine = d.join(format!("mine-{kind}{nth}.{ext}"));
            assert!(matches!(extract_one(&tools(), &src, &it, &mine, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
            // ดึงเองด้วย mkvextract เลขแทร็ก mkvmerge (วิดีโอ 0 · เสียง 1 2 · ซับ 3 4)
            let id = match (kind, nth) { ("audio", 2) => 2, ("text", 1) => 3, _ => 4 };
            let theirs = d.join(format!("theirs-{id}.{ext}"));
            let mut t = OsString::from(format!("{id}:"));
            t.push(theirs.as_os_str());
            crate::tools::run_tool(&tools(), "mkvextract", [src.as_os_str(), OsStr::new("tracks"), &t]).unwrap();
            assert_eq!(sha(&mine), sha(&theirs), "{kind}{nth} ไม่ตรงกับที่ดึงด้วย mkvextract เอง");
        }
        let ch = d.join("chapters.xml");
        assert!(matches!(extract_one(&tools(), &src, &Item { kind: "menu".into(), nth: 1, ext: "xml".into(), lang: None, name: None, of: None }, &ch, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
        assert!(std::fs::read_to_string(&ch).unwrap().contains("<Chapters>"), "บทต้องออกมาเป็น XML");
        let v = d.join("video.mkv");
        assert!(matches!(extract_one(&tools(), &src, &Item { kind: "video".into(), nth: 1, ext: "mkv".into(), lang: None, name: None, of: None }, &v, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
        let j: Value = serde_json::from_slice(&crate::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-J"), v.as_os_str()]).unwrap().stdout).unwrap();
        assert_eq!(j["tracks"].as_array().unwrap().len(), 1, "แยกภาพต้องได้แทร็กภาพอย่างเดียว");
        assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
        // ชื่อชนต่อท้ายเลข 2 ไม่ทับ
        assert_eq!(numbered(&v), d.join("video 2.mkv"));
        let _ = std::fs::remove_dir_all(&d);
    }

    fn names_in(d: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
        v.sort();
        v
    }

    /// BUGS ข้อ 150 พี่กันแยกซับญี่ปุ่น VobSub ของ Shin Godzilla ขึ้น "mkvextract แยกไม่สำเร็จ (รหัส 0)" แล้วเหลือไฟล์ชื่อผิด .sub.idx กับ .sub.sub
    /// mkvextract เขียน VobSub เป็นสองไฟล์โดยเปลี่ยนนามสกุลท้ายของชื่อที่ส่งไปเอง · โค้ดเดิมรอไฟล์ .partial ไฟล์เดียว (เทสนี้แดงกับโค้ดเดิม 16 พ.ย. 2569)
    /// ต้องได้ .idx กับ .sub ชื่อถูก เนื้อไฟล์ตรงกับที่ mkvextract แยกเอง ไม่มีไฟล์ชั่วคราวค้าง ไฟล์หนังไม่ถูกแตะ
    #[test]
    fn vobsub_extracts_as_idx_and_sub_pair() {
        let src = movie().parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
        assert!(src.exists(), "ไม่มีไฟล์ทดสอบ ซับรูป (2024).mkv รัน node scripts/make-test-media.mjs ก่อน");
        let before = sha(&src);
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกvobsub-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let it = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: Some("en".into()), name: None, of: None };
        assert!(is_vobsub(true, &it) && !is_vobsub(false, &it), "ไฟล์ที่ไม่ใช่ MKV แยกด้วย ffmpeg เป็น Matroska ไฟล์เดียว");
        let name = out_name("ซับรูป (2024)", &it);
        assert_eq!(name, "ซับรูป (2024).Text2.en.sub");
        let target = d.join(&name);
        assert_eq!(partial_of(&target, true), d.join("ซับรูป (2024).Text2.en.sub.partial.sub"));
        let got = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) {
            Ok(Placed::Done(fs)) => fs,
            Ok(Placed::Cancelled) => panic!("ไม่ได้กดหยุด"),
            Err(e) => panic!("แยก VobSub ต้องสำเร็จ ได้ {e:?} ไฟล์ที่ค้าง {:?}", names_in(&d)),
        };
        assert_eq!(got, vec![d.join("ซับรูป (2024).Text2.en.idx"), d.join("ซับรูป (2024).Text2.en.sub")]);
        assert_eq!(names_in(&d), vec!["ซับรูป (2024).Text2.en.idx", "ซับรูป (2024).Text2.en.sub"], "ต้องเหลือแค่สองไฟล์ ไม่มีไฟล์ชั่วคราว");
        let idx = std::fs::read_to_string(&got[0]).unwrap();
        assert!(idx.contains("VobSub index file") && idx.contains("timestamp:"), "ไฟล์ .idx ต้องเป็นดัชนีของ VobSub: {}", idx.chars().take(120).collect::<String>());
        // เทียบกับที่ mkvextract แยกเอง (แทร็ก 3 ของไฟล์นี้คือ S_VOBSUB)
        let theirs = d.join("เทียบ").join("x.sub");
        std::fs::create_dir_all(theirs.parent().unwrap()).unwrap();
        let mut t = OsString::from("3:");
        t.push(theirs.as_os_str());
        crate::tools::run_tool(&tools(), "mkvextract", [src.as_os_str(), OsStr::new("tracks"), &t]).unwrap();
        assert_eq!(sha(&got[1]), sha(&theirs), ".sub ต้องตรงกับที่ mkvextract แยกเอง");
        assert_eq!(std::fs::read_to_string(&got[0]).unwrap().replace("x.sub", ""), std::fs::read_to_string(theirs.with_extension("idx")).unwrap().replace("x.sub", ""), ".idx ต้องตรงกับที่ mkvextract แยกเอง");
        // แยกหลายไฟล์แบบ gMKVExtractGUI (BUGS ข้อ 130) หานามสกุลจาก codec ได้ sub จึงเข้าทาง VobSub เดียวกัน
        let j = mkv_json(&tools(), &src).unwrap();
        let fx = fit_item(&j, &info_of(&j), &Item { ext: "srt".into(), ..it.clone() }).unwrap();
        assert!(fx.ext == "sub" && is_vobsub(true, &fx), "{fx:?}");
        // หน้าจอส่งนามสกุลผิดมา ตัวแยกดูชนิดแทร็กจริงแล้วยังได้คู่ .idx .sub ชื่อเดียวกับชิ้นนี้
        let odd = d.join("นามสกุลผิด.mks");
        match place_item(&tools(), &src, &Item { ext: "mks".into(), ..it.clone() }, &odd, false, &|_| {}, &|| false) {
            Ok(Placed::Done(fs)) => assert_eq!(fs, vec![d.join("นามสกุลผิด.idx"), d.join("นามสกุลผิด.sub")]),
            _ => panic!("ต้องแยกได้"),
        }
        assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
        let _ = std::fs::remove_dir_all(&d);
    }

    /// BUGS ข้อ 150 กับไฟล์จริงของพี่กัน Shin Godzilla ซับ VobSub อังกฤษ (Text #1) กับญี่ปุ่น (Text #2) · ไฟล์ใหญ่ ไม่ขึ้น git รันเฉพาะตอนตั้งตัวแปร
    /// MOVIE_SHELF_GODZILLA ที่อยู่ไฟล์หนัง (อ่านอย่างเดียว) · ผลลง MOVIE_SHELF_GODZILLA_OUT ค่าตั้งต้น D:\dev\tmp\ocr-test\godzilla ซึ่งเป็นไฟล์เทส OCR ภาษาญี่ปุ่น
    #[test]
    fn godzilla_vobsub_pair() {
        let Ok(src) = std::env::var("MOVIE_SHELF_GODZILLA") else { return };
        let src = PathBuf::from(src);
        let out = PathBuf::from(std::env::var("MOVIE_SHELF_GODZILLA_OUT").unwrap_or_else(|_| r"D:\dev\tmp\ocr-test\godzilla".into()));
        std::fs::create_dir_all(&out).unwrap();
        let meta = |p: &Path| { let m = std::fs::metadata(p).unwrap(); (m.len(), m.modified().unwrap()) };
        let before = meta(&src);
        for (nth, lang) in [(1, "en"), (2, "ja")] {
            let it = Item { kind: "text".into(), nth, ext: "sub".into(), lang: Some(lang.into()), name: None, of: None };
            let target = out.join(out_name("shin godzilla", &it));
            for f in finals_of(&target, true) { let _ = std::fs::remove_file(f); }
            let fs = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) { Ok(Placed::Done(fs)) => fs, Ok(_) => panic!("ไม่ได้กดหยุด"), Err(e) => panic!("Text #{nth} {e:?}") };
            assert_eq!(fs, finals_of(&target, true));
            let idx = std::fs::read_to_string(&fs[0]).unwrap();
            assert!(idx.contains("VobSub index file") && idx.matches("timestamp:").count() > 100, "Text #{nth} .idx ต้องมีภาพหลายร้อยภาพ");
            assert!(std::fs::metadata(&fs[1]).unwrap().len() > 1 << 20, "Text #{nth} .sub ต้องมีข้อมูลภาพ");
            eprintln!("Text #{nth} ได้ {} ({} ภาพ) กับ {} ({} ไบต์)", fs[0].display(), idx.matches("timestamp:").count(), fs[1].display(), std::fs::metadata(&fs[1]).unwrap().len());
        }
        assert!(std::fs::read_dir(&out).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().contains("partial")), "ไม่มีไฟล์ชั่วคราวค้าง");
        assert_eq!(meta(&src), before, "ไฟล์หนังของพี่กันต้องไม่ถูกแตะ");
    }

    /// VobSub เช็กชื่อชนทั้งสองไฟล์ ต่อท้ายเลขจนว่างทั้งคู่ · ย้ายไม่ได้กลางทาง ลบไฟล์ของเราที่ย้ายไปแล้วและไฟล์ชั่วคราว ไม่แตะไฟล์ที่มีอยู่ก่อน (BUGS ข้อ 150)
    #[test]
    fn vobsub_conflicts_check_both_files() {
        let src = movie().parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกvobsub-ชน-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let target = d.join("ก.Text2.en.sub");
        assert_eq!(finals_of(&target, true), vec![d.join("ก.Text2.en.idx"), target.clone()]);
        assert_eq!(finals_of(&target, false), vec![target.clone()]);
        // มีแค่ .idx ของเดิม ก็ถือว่าชน
        std::fs::write(d.join("ก.Text2.en.idx"), "ของเดิม").unwrap();
        assert!(finals_of(&target, true).iter().any(|f| f.exists()));
        assert_eq!(numbered_free(&target, true), d.join("ก.Text2.en 2.sub"));
        std::fs::write(d.join("ก.Text2.en 2.idx"), "ของเดิม").unwrap();
        assert_eq!(numbered_free(&target, true), d.join("ก.Text2.en 3.sub"), "เลข 2 มี .idx แล้ว ต้องข้ามไปเลข 3");
        assert_eq!(numbered(&target), d.join("ก.Text2.en 2.sub"), "ชิ้นอื่นดูแค่ไฟล์เดียวแบบเดิม");
        // ไฟล์ .idx โผล่มาก่อนย้าย ย้ายไม่ทับ ไม่เหลือ .sub ครึ่งคู่ ไม่มีไฟล์ชั่วคราวค้าง ไฟล์ของเดิมไม่ถูกแตะ
        let it = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: Some("en".into()), name: None, of: None };
        let e = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) { Err(e) => e, _ => panic!("ต้องย้ายไม่ได้") };
        assert!(e.why.contains("มีไฟล์ชื่อนี้อยู่แล้ว"), "{e:?}");
        assert_eq!(names_in(&d), vec!["ก.Text2.en 2.idx", "ก.Text2.en.idx"]);
        assert_eq!(std::fs::read_to_string(d.join("ก.Text2.en.idx")).unwrap(), "ของเดิม");
        // กดหยุดตั้งแต่ต้น ไม่เหลือไฟล์ชั่วคราว
        let t2 = d.join("ข.sub");
        assert!(matches!(place_item(&tools(), &src, &it, &t2, true, &|_| {}, &|| true), Ok(Placed::Cancelled)));
        assert_eq!(names_in(&d), vec!["ก.Text2.en 2.idx", "ก.Text2.en.idx"]);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// เครื่องมือล้มจริง ข้อความบนการ์ดเป็นประโยคไทย ไม่มีแค่รหัส และมีข้อความของเครื่องมือไว้ใส่ปุ่ม ⓘ (BUGS ข้อ 150)
    #[test]
    fn tool_failures_explain_in_thai() {
        let src = movie();
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกพัง-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        // ที่เก็บเป็นไฟล์ ไม่ใช่โฟลเดอร์ เครื่องมือสร้างไฟล์ปลายทางไม่ได้
        let blk = d.join("ไม่ใช่โฟลเดอร์");
        std::fs::write(&blk, "x").unwrap();
        let it = Item { kind: "text".into(), nth: 1, ext: "srt".into(), lang: None, name: None, of: None };
        let out = blk.join("ก.srt");
        let e = match extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false) { Err(e) => e, Ok(_) => panic!("ต้องแยกไม่ได้") };
        assert!(e.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้") && !e.why.contains("รหัส"), "mkvextract {e:?}");
        assert!(e.detail.as_deref().is_some_and(|x| x.contains("Failed to create the file")), "ปุ่ม ⓘ ต้องมีข้อความของ mkvextract {e:?}");
        // ไฟล์ .mp4 แยกด้วย ffmpeg
        let mp4 = src.parent().unwrap().join("The Last Orchard (2022).mp4");
        let e = match extract_one(&tools(), &mp4, &Item { kind: "audio".into(), nth: 1, ext: "aac".into(), lang: None, name: None, of: None }, &blk.join("ก.aac"), &|_| {}, &|| false) { Err(e) => e, Ok(_) => panic!("ต้องแยกไม่ได้") };
        assert!(e.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้") && e.detail.as_deref().is_some_and(|x| x.contains("Error opening output")), "ffmpeg {e:?}");
        // ซับ VobSub ล้มแล้วไม่เหลือไฟล์ชั่วคราวทั้งสองไฟล์
        let img = src.parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
        let vs = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: None, name: None, of: None };
        assert!(place_item(&tools(), &img, &vs, &blk.join("ข.sub"), true, &|_| {}, &|| false).is_err());
        assert_eq!(names_in(&d), vec!["ไม่ใช่โฟลเดอร์"]);
        let _ = std::fs::remove_dir_all(&d);
    }

    /// ข้อความจริงที่เครื่องมือพิมพ์ (จับจาก mkvextract กับ ffmpeg ที่แนบมา 16 พ.ย. 2569) แปลเป็นสาเหตุภาษาไทยได้ · แปลไม่ได้ใส่บรรทัดสุดท้ายไว้ให้ปุ่ม ⓘ
    #[test]
    fn explain_tool_messages() {
        use crate::tools::{explain_fail, tool_lines};
        let st = |code: u32| -> std::process::ExitStatus { use std::os::windows::process::ExitStatusExt; std::process::ExitStatus::from_raw(code) };
        let l = tool_lines("#GUI#error No track with the ID 9 was found in the source file.\n");
        assert_eq!(l, vec!["No track with the ID 9 was found in the source file."]);
        assert!(explain_fail("mkvextract", &l, Some(&st(2))).why.starts_with("ไม่เจอแทร็กนี้ในไฟล์"));
        let ff = tool_lines("[in#0 @ 000002a2594d5dc0] Element at 0x45 ending at 0x34e05 exceeds containing master element ending at 0x13f1\r\nError opening input file D:/x.mkv.\nError opening input files: End of file\n");
        let f = explain_fail("ffmpeg", &ff, Some(&st(1)));
        assert!(f.known && f.why.starts_with("ไฟล์หนังเสีย") && f.detail.as_deref() == Some("Error opening input files: End of file"), "{f:?}");
        assert!(explain_fail("ffmpeg", &tool_lines("D:/a.aac: No space left on device"), Some(&st(1))).why.starts_with("พื้นที่ในไดรฟ์ที่เก็บเต็ม"));
        assert!(explain_fail("mkvextract", &tool_lines("#GUI#error The file 'D:\\a.srt' could not be opened for writing: Permission denied."), Some(&st(2))).why.starts_with("Windows ไม่ให้เขียน"));
        assert!(explain_fail("mkvextract", &tool_lines("#GUI#warning x\n#GUI#error The device is not ready."), Some(&st(2))).why.starts_with("อ่านหรือเขียนไดรฟ์ไม่ได้กลางคัน"));
        assert!(explain_fail("ffmpeg", &tool_lines("Could not find tag for codec dvd_subtitle in stream #0, codec not currently supported in container"), Some(&st(1))).why.contains("แยกออกเป็นไฟล์แบบนี้ไม่ได้"));
        // ความคืบหน้าของ mkvextract แบบไม่ใช้ --gui-mode ไม่นับเป็นข้อความ
        assert!(tool_lines("Progress: 1%Progress: 3%Progress: 100%\n").is_empty());
        // แปลไม่ได้ บอกว่าแปลไม่ได้ เก็บบรรทัดสุดท้ายไว้ และข้อความบรรทัดเดียวต่อท้ายให้เอง
        let u = explain_fail("ffmpeg", &tool_lines("something odd\nweird thing happened"), Some(&st(1)));
        assert!(!u.known && u.detail.as_deref() == Some("weird thing happened") && u.line().ends_with("(weird thing happened)"), "{u:?}");
        assert!(!u.why.contains("รหัส"));
        // ไม่มีข้อความเลย ปุ่ม ⓘ บอกรหัสแทน · จบปกติแต่ไม่ได้ไฟล์ ไม่บอกว่ารหัส 0
        let z = explain_fail("mkvextract", &[], Some(&st(2)));
        assert_eq!(z.detail.as_deref(), Some("mkvextract ตอบรหัส 2"));
        let n = explain_fail("mkvextract", &[], None);
        assert!(n.why.contains("ทำงานจบแล้วแต่ไม่ได้ไฟล์ออกมา") && !n.why.contains("รหัส 0"), "{n:?}");
        assert!(explain_fail("ffmpeg", &[], Some(&st(0xC000013A))).why.contains("พังหรือถูกปิดกลางคัน"));
        // ที่อยู่ในข้อความของเครื่องมือเหลือแค่ชื่อไฟล์ กล่อง ⓘ ไม่กระจายตัวอักษรจนถ่าง
        let v = explain_fail("mkvextract", &tool_lines("#GUI#error Failed to create the VobSub data file 'D:/dev/tmp/ชั้นแยกVobSub\\แยกไฟล์\\ซับรูป (2024).Text2.en.sub.partial.sub': open file error"), Some(&st(2)));
        assert!(v.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"), "{v:?}");
        assert_eq!(v.detail.as_deref(), Some("Failed to create the VobSub data file 'ซับรูป (2024).Text2.en.sub.partial.sub': open file error"));
        assert_eq!(crate::tools::short_paths("Error opening output D:/dev/tmp/x/o.aac: No such file or directory"), "Error opening output o.aac: No such file or directory");
        assert_eq!(crate::tools::short_paths("Error opening output files: No such file or directory"), "Error opening output files: No such file or directory");
        assert!(explain_fail("mkvextract", &tool_lines("#GUI#error Failed to create the file 'D:/a/o.srt': 0 (create_directory() failed)"), Some(&st(2))).why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"));
        assert!(explain_fail("ffmpeg", &tool_lines("Error opening output files: No such file or directory"), Some(&st(1))).why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"), "ปลายทางเปิดไม่ได้ ไม่ใช่หาไฟล์หนังไม่เจอ");
    }
}

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
        let tools = crate::tools::tools_dir(&app)?;
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
    let over = len(&full).saturating_sub(crate::rename::MAX_PATH_LEN);
    if over == 0 { return (full, false); }
    let chars: Vec<char> = stem.chars().collect();
    let mut keep = chars.len().saturating_sub(over + 1);
    while keep >= 8 {
        let short: String = chars[..keep].iter().collect::<String>().trim_end_matches([' ', '.', '-', '_']).to_string() + "…";
        let n = name_of(&short);
        if len(&n) <= crate::rename::MAX_PATH_LEN { return (n, true); }
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
    let made = match extract_one(tools, src, it, &partial, on, stop)? {
        Done::Cancelled => return Ok(Placed::Cancelled),
        Done::Ok(made) => made,
    };
    // ชนิดแทร็กจริงเป็น VobSub แต่หน้าจอส่งนามสกุลอื่นมา ก็ยังได้คู่ชื่อเดียวกับชิ้นนี้
    let finals: Vec<PathBuf> = if made.len() == 1 { vec![target.to_path_buf()] } else { made.iter().map(|m| target.with_extension(m.extension().unwrap_or_default())).collect() };
    let mut moved: Vec<PathBuf> = vec![];
    for (m, f) in made.iter().zip(&finals) {
        if let Err(p) = crate::rename::move_no_replace(m, f) {
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
        let tools = crate::tools::tools_dir(&app)?;
        let jobs = app.state::<std::sync::Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let src = PathBuf::from(&req.path);
        let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let dir = req.folder.clone().filter(|f| !f.trim().is_empty()).map(PathBuf::from).unwrap_or_else(|| default_folder(&src));
        // สาเหตุเป็นประโยคไทย ไม่ใช่ข้อความภาษาอังกฤษของ Windows (BUGS ข้อ 150)
        std::fs::create_dir_all(&dir).map_err(|e| format!("สร้างโฟลเดอร์ที่เก็บไม่ได้ {}", e.raw_os_error().map(crate::tools::win_reason).unwrap_or_else(|| e.to_string())))?;
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
            let free = crate::outfile::free_space(&dir);
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
            if partial.to_string_lossy().encode_utf16().count() > crate::rename::MAX_PATH_LEN {
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
