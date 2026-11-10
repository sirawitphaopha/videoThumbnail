//! หน้าข้อมูลไฟล์ (แผนขั้น 5 · สเปกข้อ 6) · ข้อความ MediaInfo แยกเป็นหัวข้อ · ค่า hash
//! ข้อความเป็นภาษาอังกฤษแบบหน้า Text ของ MediaInfo (สเปก) · แต่ละหัวข้อบอกนามสกุลที่จะได้ถ้าแยกออกมา
//! ไฟล์แนบใน MKV MediaInfo ไม่แยกหัวข้อให้ อ่านจาก mkvmerge -J เพิ่มเอง
//! 🔴 อ่านอย่างเดียว ไฟล์หนังเดิมไม่ถูกแตะ

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

use crate::hashes::{self, Hashes, Outcome};
use crate::tools::{run_tool_timeout, tool_succeeded};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    /// หัวข้อแบบ MediaInfo เช่น General · Video · Audio #1 · Text #2 · Menu · Attachment #1
    pub title: String,
    /// general video audio text menu attachment
    pub kind: String,
    pub rows: Vec<(String, String)>,
    /// นามสกุลที่จะได้ถ้าแยกหัวข้อนี้ออกมา · General ไม่มี (แยกไม่ได้)
    pub ext: Option<String>,
    /// ภาษาแบบสั้น เช่น th en ใช้ตั้งชื่อไฟล์ที่แยก
    pub lang: Option<String>,
}

/// นามสกุลของแทร็กเสียงตามชนิด (Format ของ MediaInfo)
fn audio_ext(format: &str) -> &'static str {
    let f = format.to_lowercase();
    if f.starts_with("e-ac-3") { "eac3" } else if f.starts_with("ac-3") { "ac3" } else if f.starts_with("aac") { "aac" }
    else if f.starts_with("dts") { "dts" } else if f.starts_with("mlp fba") || f.contains("truehd") { "thd" } else if f.starts_with("flac") { "flac" }
    else if f.starts_with("opus") { "opus" } else if f.starts_with("vorbis") { "ogg" } else if f.starts_with("pcm") { "wav" }
    else if f.starts_with("mpeg audio") { "mp3" } else if f.starts_with("wma") { "wma" } else { "mka" }
}

fn text_ext(format: &str, codec: &str) -> &'static str {
    let f = format.to_lowercase();
    let c = codec.to_uppercase();
    if f == "ass" || c.contains("S_TEXT/ASS") { "ass" } else if f == "ssa" { "ssa" } else if f == "pgs" { "sup" }
    else if f == "vobsub" { "sub" } else if f.contains("webvtt") { "vtt" } else { "srt" }
}

fn short_lang(l: &str) -> Option<String> {
    let s = match l.to_lowercase().as_str() { "thai" => "th", "english" => "en", "japanese" => "ja", "korean" => "ko", "chinese" => "zh", "french" => "fr", "" => return None, _ => return Some(l.to_lowercase()) };
    Some(s.into())
}

/// แยกข้อความ Text ของ MediaInfo เป็นหัวข้อ (บรรทัดว่างคั่น · บรรทัดแรกคือชื่อหัวข้อ · แถว ชื่อ : ค่า)
pub fn parse(text: &str) -> Vec<Section> {
    let mut out = vec![];
    for block in text.replace("\r\n", "\n").split("\n\n") {
        let mut lines = block.lines().filter(|l| !l.trim().is_empty());
        let Some(title) = lines.next().map(|t| t.trim().to_string()) else { continue };
        let rows: Vec<(String, String)> = lines.filter_map(|l| l.split_once(" : ").map(|(a, b)| (a.trim().to_string(), b.trim().to_string()))).collect();
        let get = |k: &str| rows.iter().find(|r| r.0 == k).map(|r| r.1.clone()).unwrap_or_default();
        let kind = title.split(' ').next().unwrap_or("").to_lowercase();
        let ext = match kind.as_str() {
            "video" => Some("mkv".to_string()),
            "audio" => Some(audio_ext(&get("Format")).to_string()),
            "text" => Some(text_ext(&get("Format"), &get("Codec ID")).to_string()),
            "menu" => Some("xml".to_string()),
            _ => None,
        };
        out.push(Section { lang: short_lang(&get("Language")), title, kind, rows, ext });
    }
    out
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfoReply {
    /// ข้อความทั้งหมดสำหรับปุ่มคัดลอกข้อมูลเป็นข้อความ
    text: String,
    sections: Vec<Section>,
}

/// ข้อความ MediaInfo ของไฟล์ แยกหัวข้อ · ต่อหัวข้อไฟล์แนบจาก mkvmerge
#[tauri::command]
pub async fn media_info(app: AppHandle, path: String) -> Result<MediaInfoReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::tools::tools_dir(&app)?;
        let p = PathBuf::from(&path);
        let out = run_tool_timeout(&tools, "MediaInfo", [p.as_os_str()], Duration::from_secs(60))?;
        if !out.status.success() {
            return Err(format!("MediaInfo อ่านไฟล์ไม่ได้ {}", String::from_utf8_lossy(&out.stderr).trim()));
        }
        let mut text = String::from_utf8_lossy(&out.stdout).replace("\r\n", "\n").trim_end().to_string();
        let mut sections = parse(&text);
        if p.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false) {
            let work = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
            for (i, a) in attachments(&tools, &p).into_iter().enumerate() {
                let title = format!("Attachment #{}", i + 1);
                let ext = Path::new(&a.0).extension().map(|e| e.to_string_lossy().to_lowercase());
                let mut rows = vec![("File name".into(), a.0.clone()), ("MIME type".into(), a.1.clone()), ("Size".into(), human(a.2))];
                // ขนาดรูป · ดึงไฟล์แนบออกมาไว้ในโฟลเดอร์ชั่วคราวของโปรแกรม อ่านแค่หัวรูป แล้วลบทิ้ง (สเปก Dimensions)
                if a.1.starts_with("image/") {
                    if let Some((w, h)) = attachment_size(&tools, &p, a.3, &work) {
                        rows.push(("Dimensions".into(), format!("{w} × {h} pixels")));
                    }
                }
                text.push_str(&format!("\n\n{title}\n{}", rows.iter().map(|(k, v)| format!("{k:<41}: {v}")).collect::<Vec<_>>().join("\n")));
                sections.push(Section { title, kind: "attachment".into(), rows, ext, lang: None });
            }
        }
        Ok(MediaInfoReply { text, sections })
    }).await.map_err(|e| e.to_string())?
}

fn human(b: u64) -> String {
    if b >= 1 << 20 { format!("{:.1} MiB", b as f64 / 1048576.0) } else { format!("{:.0} KiB", b as f64 / 1024.0) }
}

/// ไฟล์แนบใน MKV (ชื่อ ชนิด ขนาด เลขของ mkvmerge)
fn attachments(tools: &Path, file: &Path) -> Vec<(String, String, u64, u64)> {
    let Ok(out) = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60)) else { return vec![] };
    if !tool_succeeded("mkvmerge", &out.status) {
        return vec![];
    }
    let j: Value = serde_json::from_slice(&out.stdout).unwrap_or(Value::Null);
    j["attachments"].as_array().map(|a| a.iter().map(|x| (
        x["file_name"].as_str().unwrap_or("").to_string(), x["content_type"].as_str().unwrap_or("").to_string(), x["size"].as_u64().unwrap_or(0), x["id"].as_u64().unwrap_or(0),
    )).collect()).unwrap_or_default()
}

/// กว้าง สูง ของรูปที่แนบ · ดึงออกมาไว้ในโฟลเดอร์ชั่วคราวของโปรแกรม อ่านหัวรูป แล้วลบ
fn attachment_size(tools: &Path, file: &Path, id: u64, work: &Path) -> Option<(u32, u32)> {
    std::fs::create_dir_all(work).ok()?;
    let out = work.join(format!("att-{}-{id}", crate::poster_image::unique()));
    let mut t = std::ffi::OsString::from(format!("{id}:"));
    t.push(out.as_os_str());
    let r = run_tool_timeout(tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &t], Duration::from_secs(60)).ok();
    // ไฟล์ที่ดึงออกมาไม่มีนามสกุล ต้องเดาชนิดจากเนื้อไฟล์ (image_dimensions เดาจากนามสกุล อ่านไม่ได้)
    let dims = r.filter(|r| tool_succeeded("mkvextract", &r.status))
        .and_then(|_| image::ImageReader::open(&out).ok()?.with_guessed_format().ok()?.into_dimensions().ok());
    let _ = std::fs::remove_file(&out);
    dims
}

// ---------------------------------------------------------------- ค่า hash

static HASH_STOP: AtomicBool = AtomicBool::new(false);
static HASH_RUNNING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn hash_running() -> bool {
    HASH_RUNNING.load(Ordering::SeqCst)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct HashProgress {
    done: u64,
    total: u64,
}

/// คิดค่า hash ที่ติ๊ก · ความคืบหน้าทางเหตุการณ์ hash-progress · กดหยุดได้ (คืน None) · SHA-256 จดไว้ในคลังใช้ตอนตรวจแบบเร็ว
#[tauri::command]
pub async fn hash_file(app: AppHandle, path: String, algos: Vec<String>) -> Result<Option<Hashes>, String> {
    // คิดซ้อนสองงาน (เปลี่ยนหน้าแล้วกลับมากดใหม่) งานหลังล้างตัวหยุดของงานแรก กดหยุดแล้วหยุดทั้งคู่ไม่ได้ · ไม่ให้เริ่มซ้อน (ผู้ช่วยตรวจโค้ดเจอ)
    if HASH_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("กำลังคิดค่า hash อีกไฟล์อยู่ รอให้เสร็จก่อน หรือกดหยุดงานนั้น".into());
    }
    struct Release;
    impl Drop for Release { fn drop(&mut self) { HASH_RUNNING.store(false, Ordering::SeqCst); } }
    let _release = Release;
    HASH_STOP.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let p = PathBuf::from(&path);
        let r = hashes::compute(&p, &algos, &|done, total| { let _ = app.emit("hash-progress", HashProgress { done, total }); },
            &|| HASH_STOP.load(Ordering::SeqCst) || jobs.cancelled())?;
        let Outcome::Done(h) = r else { return Ok(None) };
        if let Some(sha) = &h.sha256 {
            // จดเป็นค่าอ้างอิงเฉพาะตอนยังไม่มี · มีแล้วไม่ตรง = ไฟล์ถูกเปลี่ยนหรือเสีย ตั้งสถานะ changed คงค่าเดิมไว้เทียบ แบบตรวจแบบเร็ว (check.rs quick)
            // เดิมจดทับทุกครั้ง ไฟล์ที่เสียแล้วกลายเป็นค่าอ้างอิงใหม่ ตรวจแบบเร็วครั้งหน้าขึ้นสมบูรณ์ (ผู้ช่วยตรวจทั้งสองตัวเจอ)
            let lib = app.state::<Arc<crate::library::LibraryStore>>();
            let id = lib.movies.lock().unwrap().iter().find(|m| m.path.eq_ignore_ascii_case(&path)).map(|m| m.id.clone());
            let remember = |m: &mut crate::library::Movie| match m.sha256.as_deref() {
                None => m.sha256 = Some(sha.clone()),
                Some(old) if old.eq_ignore_ascii_case(sha) => {}
                Some(_) => { if m.status != "bad" { m.status = "changed".into(); } }
            };
            if let Some(m) = id.and_then(|id| lib.update_movie(&id, remember)) {
                let _ = app.emit("movie-updated", &m);
                if let Err(e) = lib.save() { let _ = app.emit("library-error", e); }
            }
        }
        Ok(Some(h))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn hash_cancel() {
    HASH_STOP.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn hash_compare(pasted: String, hashes: Hashes) -> hashes::Compare {
    hashes::compare(&pasted, &hashes)
}

#[tauri::command]
pub fn hash_save(path: String, sha256: String) -> Result<String, String> {
    hashes::save_sha256(Path::new(&path), &sha256).map(|p| p.to_string_lossy().to_string())
}

/// ชื่อตัวเข้ารหัส เช่น LAME4.0 เป็น LAME 4.0 · Lavf63.1.102 เป็น Lavf 63.1.102
fn split_lib(lib: &str) -> String {
    let t = lib.trim().trim_end_matches('.'); // บางไฟล์เขียนจุดค้างท้าย เช่น Lavc63.1.
    match t.find(|c: char| c.is_ascii_digit()) {
        Some(i) if i > 0 && !t[..i].ends_with(' ') => format!("{} {}", &t[..i], &t[i..]),
        _ => t.to_string(),
    }
}

/// รายละเอียด codec หนึ่งแทร็กจากข้อมูล JSON ของ MediaInfo · MPEG Audio เป็น MPEG-1 Layer 3 · อื่น ๆ เป็นชื่อรูปแบบกับโปรไฟล์ เช่น AAC LC
/// มีชื่อตัวเข้ารหัสต่อท้ายในวงเล็บ เช่น (LAME 3.99r)
pub fn codec_detail(t: &Value) -> Option<String> {
    let g = |k: &str| t[k].as_str().map(str::trim).filter(|v| !v.is_empty());
    let fmt = g("Format")?;
    let mut s = if fmt == "MPEG Audio" {
        match (g("Format_Version"), g("Format_Profile")) {
            (Some(v), Some(p)) => format!("MPEG-{} {}", v.trim_start_matches("Version ").trim(), p),
            (None, Some(p)) => format!("MPEG {}", p),
            _ => fmt.to_string(),
        }
    } else {
        match g("Format_Profile").or(g("Format_AdditionalFeatures")) { Some(p) => format!("{} {}", fmt, p), None => fmt.to_string() }
    };
    let lib = match (g("Encoded_Library_Name"), g("Encoded_Library_Version")) {
        (Some(n), Some(v)) => Some(format!("{} {}", n, v)),
        _ => g("Encoded_Library").map(split_lib),
    };
    if let Some(l) = lib { s = format!("{} ({})", s, l); }
    Some(s)
}

/// รายละเอียด codec ของแทร็กเสียงทุกแทร็ก เรียงตามลำดับแทร็กเสียงในไฟล์ · อ่านไม่ได้คืนรายการว่าง หน้าจอใช้ชื่อสั้นจาก ffprobe แทน
#[tauri::command]
pub async fn audio_codec_detail(app: AppHandle, path: String) -> Result<Vec<Option<String>>, String> {
    let tools = crate::tools::tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        let out = run_tool_timeout(&tools, "MediaInfo", [OsStr::new("--Output=JSON"), p.as_os_str()], Duration::from_secs(60))?;
        let j: Value = serde_json::from_slice(&out.stdout).map_err(|_| "อ่านผลของ MediaInfo ไม่ได้".to_string())?;
        let tracks = j["media"]["track"].as_array().cloned().unwrap_or_default();
        Ok(tracks.iter().filter(|t| t["@type"] == "Audio").map(codec_detail).collect())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codec_detail_reads_mediainfo_fields() {
        let mp3 = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "LAME3.99r" });
        assert_eq!(codec_detail(&mp3).as_deref(), Some("MPEG-1 Layer 3 (LAME 3.99r)"));
        let lame4 = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "LAME4.0 " });
        assert_eq!(codec_detail(&lame4).as_deref(), Some("MPEG-1 Layer 3 (LAME 4.0)"));
        let flac = serde_json::json!({ "Format": "FLAC", "Encoded_Library": "Lavf63.1.102" });
        assert_eq!(codec_detail(&flac).as_deref(), Some("FLAC (Lavf 63.1.102)"));
        let dot = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "Lavc63.1." });
        assert_eq!(codec_detail(&dot).as_deref(), Some("MPEG-1 Layer 3 (Lavc 63.1)"));
        let aac = serde_json::json!({ "Format": "AAC", "Format_AdditionalFeatures": "LC" });
        assert_eq!(codec_detail(&aac).as_deref(), Some("AAC LC"));
        assert_eq!(codec_detail(&serde_json::json!({})), None);
    }

    #[test]
    fn mediainfo_text_splits_into_sections() {
        let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
        assert!(p.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
        let out = run_tool_timeout(&tools, "MediaInfo", [p.as_os_str()], Duration::from_secs(60)).unwrap();
        let text = String::from_utf8_lossy(&out.stdout).to_string();
        let s = parse(&text);
        let titles: Vec<&str> = s.iter().map(|x| x.title.as_str()).collect();
        assert_eq!(titles, ["General", "Video", "Audio #1", "Audio #2", "Text #1", "Text #2", "Menu"], "หัวข้อไม่ครบ");
        let exts: Vec<Option<&str>> = s.iter().map(|x| x.ext.as_deref()).collect();
        assert_eq!(exts, [None, Some("mkv"), Some("aac"), Some("ac3"), Some("srt"), Some("ass"), Some("xml")]);
        assert_eq!(s[2].lang.as_deref(), Some("th"));
        assert_eq!(s[3].lang.as_deref(), Some("en"));
        // ทุกบรรทัด ชื่อ : ค่า ของ MediaInfo อยู่ในหัวข้อครบ ไม่หายสักบรรทัด
        let rows_in_text = text.lines().filter(|l| l.contains(" : ")).count();
        assert_eq!(s.iter().map(|x| x.rows.len()).sum::<usize>(), rows_in_text);
    }
}
