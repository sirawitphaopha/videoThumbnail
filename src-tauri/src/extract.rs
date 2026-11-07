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

use crate::tools::{run_tool_timeout, tool_command, tool_succeeded};

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
}

/// ชื่อไฟล์ที่แยกออกมา · ดาวเหนือ (2023).Audio1.th.ac3 · ดาวเหนือ (2023).cover.jpg · ดาวเหนือ (2023).chapters.xml
pub fn out_name(stem: &str, it: &Item) -> String {
    let lang = it.lang.as_ref().map(|l| format!(".{l}")).unwrap_or_default();
    match it.kind.as_str() {
        "video" => format!("{stem}.Video{}.{}", it.nth, it.ext),
        "audio" => format!("{stem}.Audio{}{lang}.{}", it.nth, it.ext),
        "text" => format!("{stem}.Text{}{lang}.{}", it.nth, it.ext),
        "menu" => format!("{stem}.chapters.xml"),
        _ => format!("{stem}.{}", safe_att_name(it)),
    }
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
        _ => return None,
    })
}

/// ไฟล์ที่ไม่ใช่ MKV แยกด้วย ffmpeg · นามสกุลที่ ffmpeg เขียนแยกเดี่ยวไม่ได้ (เช่น ซับ VobSub .sub) เปลี่ยนเป็นไฟล์ Matroska ตามชนิด
/// เดิมเขียนข้างในเป็น Matroska ใต้นามสกุลเดิม ได้ไฟล์ .sup .thd ที่ข้างในเป็น MKV เปิดไม่ได้ (ผู้ช่วยตรวจโค้ดเจอ)
pub fn fix_ext_for_ffmpeg(it: &mut Item) {
    if ff_format(&it.ext).is_none() {
        it.ext = match it.kind.as_str() { "audio" => "mka", "text" => "mks", _ => "mkv" }.into();
    }
}

/// ชื่อชนต่อท้าย 2 3 (ตั้งชื่อใหม่ต่อท้ายเลข 2)
pub fn numbered(p: &Path) -> PathBuf {
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let dir = p.parent().unwrap_or(Path::new(""));
    (2..).map(|n| dir.join(format!("{stem} {n}{ext}"))).find(|x| !x.exists()).unwrap()
}

/// เลขแทร็กของ mkvmerge (เริ่ม 0) ของแทร็กลำดับที่ nth ในชนิดนั้น
fn mkv_track_id(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<u64, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let want = match kind { "video" => "video", "audio" => "audio", _ => "subtitles" };
    j["tracks"].as_array().and_then(|t| t.iter().filter(|x| x["type"] == want).nth(nth - 1)).and_then(|x| x["id"].as_u64())
        .ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

fn mkv_attachment_id(tools: &Path, file: &Path, nth: usize) -> Result<u64, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    j["attachments"].as_array().and_then(|a| a.get(nth - 1)).and_then(|x| x["id"].as_u64()).ok_or_else(|| "ไม่เจอไฟล์แนบ".into())
}

/// เลขสตรีมของ ffmpeg กับชนิดข้อมูล ของแทร็กลำดับที่ nth ในชนิดนั้น (ไม่นับรูปปก)
fn ff_stream(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<(u64, String), String> {
    let out = run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"), OsStr::new("-show_streams"), file.as_os_str()], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let want = match kind { "video" => "video", "audio" => "audio", _ => "subtitle" };
    j["streams"].as_array().and_then(|s| s.iter().filter(|x| x["codec_type"] == want && x["disposition"]["attached_pic"].as_i64() != Some(1)).nth(nth - 1))
        .and_then(|x| Some((x["index"].as_u64()?, x["codec_name"].as_str().unwrap_or("").to_string()))).ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

pub enum Done {
    Ok,
    Cancelled,
}

/// แยกหนึ่งชิ้นลง partial · ความคืบหน้า 0–100 · stop = กดหยุด
pub fn extract_one(tools: &Path, file: &Path, it: &Item, partial: &Path, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Done, String> {
    let mkv = file.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false);
    let (tool, args): (&str, Vec<OsString>) = if mkv {
        match it.kind.as_str() {
            "video" => {
                let id = mkv_track_id(tools, file, "video", it.nth)?;
                ("mkvmerge", vec!["--gui-mode".into(), "-o".into(), partial.into(), "-A".into(), "-S".into(), "-M".into(), "-B".into(), "--no-chapters".into(), "-d".into(), id.to_string().into(), file.into()])
            }
            "menu" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "chapters".into(), partial.into()]),
            "attachment" => {
                let id = mkv_attachment_id(tools, file, it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "attachments".into(), t])
            }
            k => {
                let id = mkv_track_id(tools, file, k, it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "tracks".into(), t])
            }
        }
    } else {
        let (idx, codec) = ff_stream(tools, file, &it.kind, it.nth)?;
        let fmt = ff_format(&it.ext).unwrap_or("matroska");
        // ซับตัวหนังสือของ MP4 (mov_text) ตัวเขียน srt ของ ffmpeg รับแบบ copy ไม่ได้ ต้องแปลงตัวหนังสือเป็น SRT (ไม่ใช่ภาพหรือเสียง ไม่เสียคุณภาพ)
        let codec_arg = if fmt == "srt" && codec != "subrip" && codec != "text" { "srt" } else { "copy" };
        ("ffmpeg", vec!["-hide_banner".into(), "-nostdin".into(), "-n".into(), "-v".into(), "error".into(), "-i".into(), file.into(), "-map".into(), format!("0:{idx}").into(),
            "-c".into(), codec_arg.into(), "-f".into(), fmt.into(), partial.into()])
    };
    let mut child = tool_command(tools, tool, &args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null())
        .spawn().map_err(|e| format!("เรียก {tool} ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let reader = std::thread::spawn(move || {
        for l in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
                let _ = tx.send(p);
            }
        }
    });
    loop {
        while let Ok(p) = rx.try_recv() {
            on(p);
        }
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            let _ = std::fs::remove_file(partial);
            return Ok(Done::Cancelled);
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            let _ = reader.join();
            if !tool_succeeded(tool, &st) || !partial.exists() {
                let _ = std::fs::remove_file(partial);
                return Err(format!("{tool} แยกไม่สำเร็จ (รหัส {})", crate::tools::exit_text(&st)));
            }
            on(100.0);
            return Ok(Done::Ok);
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
        let it = |kind: &str, nth, ext: &str, lang: Option<&str>, name: Option<&str>| Item { kind: kind.into(), nth, ext: ext.into(), lang: lang.map(String::from), name: name.map(String::from) };
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("audio", 1, "ac3", Some("th"), None)), "ดาวเหนือ (2023).Audio1.th.ac3");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("text", 1, "srt", Some("th"), None)), "ดาวเหนือ (2023).Text1.th.srt");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("attachment", 1, "jpg", None, Some("cover.jpg"))), "ดาวเหนือ (2023).cover.jpg");
        assert_eq!(out_name("ดาวเหนือ (2023)", &it("video", 1, "mkv", None, None)), "ดาวเหนือ (2023).Video1.mkv");
    }

    /// ชื่อไฟล์แนบที่ตั้งใจทำมาให้หลุดโฟลเดอร์ เหลือแค่ชื่อส่วนท้ายที่ปลอดภัย (ผู้ช่วยตรวจโค้ดข้อ 5)
    #[test]
    fn attachment_names_cannot_escape_the_folder() {
        let att = |name: &str| Item { kind: "attachment".into(), nth: 3, ext: "bin".into(), lang: None, name: Some(name.into()) };
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
    fn ffmpeg_extensions_match_what_is_written() {
        let fx = |kind: &str, ext: &str| { let mut it = Item { kind: kind.into(), nth: 1, ext: ext.into(), lang: None, name: None }; fix_ext_for_ffmpeg(&mut it); it.ext };
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
        let it = Item { kind: "text".into(), nth: 1, ext: "srt".into(), lang: None, name: None };
        assert!(matches!(extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false).unwrap(), Done::Ok));
        let t = std::fs::read_to_string(&out).unwrap();
        assert!(t.contains("-->") && t.trim_start().starts_with('1'), "ต้องได้ SRT จริง: {}", t.chars().take(80).collect::<String>());
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
            let it = Item { kind: kind.into(), nth, ext: ext.into(), lang: None, name: None };
            let mine = d.join(format!("mine-{kind}{nth}.{ext}"));
            assert!(matches!(extract_one(&tools(), &src, &it, &mine, &|_| {}, &|| false).unwrap(), Done::Ok));
            // ดึงเองด้วย mkvextract เลขแทร็ก mkvmerge (วิดีโอ 0 · เสียง 1 2 · ซับ 3 4)
            let id = match (kind, nth) { ("audio", 2) => 2, ("text", 1) => 3, _ => 4 };
            let theirs = d.join(format!("theirs-{id}.{ext}"));
            let mut t = OsString::from(format!("{id}:"));
            t.push(theirs.as_os_str());
            crate::tools::run_tool(&tools(), "mkvextract", [src.as_os_str(), OsStr::new("tracks"), &t]).unwrap();
            assert_eq!(sha(&mine), sha(&theirs), "{kind}{nth} ไม่ตรงกับที่ดึงด้วย mkvextract เอง");
        }
        let ch = d.join("chapters.xml");
        assert!(matches!(extract_one(&tools(), &src, &Item { kind: "menu".into(), nth: 1, ext: "xml".into(), lang: None, name: None }, &ch, &|_| {}, &|| false).unwrap(), Done::Ok));
        assert!(std::fs::read_to_string(&ch).unwrap().contains("<Chapters>"), "บทต้องออกมาเป็น XML");
        let v = d.join("video.mkv");
        assert!(matches!(extract_one(&tools(), &src, &Item { kind: "video".into(), nth: 1, ext: "mkv".into(), lang: None, name: None }, &v, &|_| {}, &|| false).unwrap(), Done::Ok));
        let j: Value = serde_json::from_slice(&crate::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-J"), v.as_os_str()]).unwrap().stdout).unwrap();
        assert_eq!(j["tracks"].as_array().unwrap().len(), 1, "แยกภาพต้องได้แทร็กภาพอย่างเดียว");
        assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
        // ชื่อชนต่อท้ายเลข 2 ไม่ทับ
        assert_eq!(numbered(&v), d.join("video 2.mkv"));
        let _ = std::fs::remove_dir_all(&d);
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
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    folder: String,
    /// ต่อชิ้น done skipped conflict failed cancelled queued
    states: Vec<String>,
    files: Vec<Option<String>>,
    error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExtractProgress {
    index: usize,
    percent: f64,
}

/// ชื่อชิ้นแบบหัวข้อ MediaInfo บนจอ · Audio #2 · ไฟล์แนบใช้ชื่อของมัน · เดิมข้อความผิดพลาดบอกชนิดภาษาอังกฤษตัวเล็ก (audio) ไม่ตรงกับหัวข้อบนจอ (ผู้ช่วยตรวจสเปกเจอ)
fn title_of(it: &Item) -> String {
    match it.kind.as_str() { "video" => "Video".to_string(), "audio" => format!("Audio #{}", it.nth), "text" => format!("Text #{}", it.nth), "menu" => "Menu".into(), _ => it.name.clone().unwrap_or_default() }
}

pub fn default_folder(movie: &Path) -> PathBuf {
    let stem = movie.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    movie.parent().unwrap_or(Path::new("")).join(format!("{stem} แยกไฟล์"))
}

#[tauri::command]
pub fn extract_default_folder(path: String) -> String {
    default_folder(Path::new(&path)).to_string_lossy().to_string()
}

#[tauri::command]
pub fn extract_cancel() {
    STOP.store(true, std::sync::atomic::Ordering::SeqCst);
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
        std::fs::create_dir_all(&dir).map_err(|e| format!("สร้างโฟลเดอร์ที่เก็บไม่ได้: {e}"))?;
        let n = req.items.len();
        let mut r = ExtractResult { folder: dir.to_string_lossy().to_string(), states: vec!["queued".into(); n], files: vec![None; n], error: None };
        let src_size = std::fs::metadata(&src).map(|m| m.len()).unwrap_or(0);
        let src_mkv = src.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false);
        for (i, it0) in req.items.iter().enumerate() {
            let mut it_fixed = it0.clone();
            if !src_mkv { fix_ext_for_ffmpeg(&mut it_fixed); }
            let it = &it_fixed;
            let mut target = dir.join(out_name(&stem, it));
            // ไฟล์ที่แยกต้องอยู่ในโฟลเดอร์ที่เลือกเท่านั้น · กันชื่อที่หลุดตัวกรอง
            if target.parent() != Some(dir.as_path()) {
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {} ไม่สำเร็จ ชื่อไฟล์ไม่ปลอดภัย · ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it)));
                break;
            }
            if target.exists() {
                match req.policy.get(i).map(String::as_str).unwrap_or("ask") {
                    "skip" => { r.states[i] = "skipped".into(); continue; }
                    "number" => target = numbered(&target),
                    // ชื่อไฟล์ที่มีอยู่แล้ว ส่งกลับให้การ์ดบอกว่าไฟล์ไหนชน (ต้นแบบ ในที่เก็บมีไฟล์ … อยู่แล้ว)
                    _ => { r.states[i] = "conflict".into(); r.files[i] = Some(target.to_string_lossy().to_string()); continue; }
                }
            }
            // ที่ว่างในไดรฟ์ · ภาพต้องการราวขนาดไฟล์หนัง · เสียง ซับ บท ไฟล์แนบ ไม่เกินขนาดไฟล์หนัง เผื่ออย่างน้อย 64 MB
            let need = if it.kind == "video" { src_size } else { (src_size / 4).max(64 << 20).min(src_size + (64 << 20)) };
            let free = crate::poster::free_space(&dir);
            if free < need {
                let title = title_of(it);
                let drive = dir.to_string_lossy().chars().next().unwrap_or('?').to_ascii_uppercase();
                let gb = |b: u64| if b >= 1 << 30 { format!("{:.1} GB", b as f64 / 1073741824.0) } else { format!("{:.0} MB", b as f64 / 1048576.0) };
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {title} ไม่สำเร็จ พื้นที่ในไดรฟ์ {drive} ไม่พอ · ต้องการ {} แต่เหลือ {} · ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", gb(need), gb(free)));
                break;
            }
            let partial = PathBuf::from(format!("{}.partial", target.to_string_lossy()));
            // ที่อยู่ยาวเกินที่ Windows รับ · บอกตรงสาเหตุก่อนเริ่ม (เดิมเครื่องมือหรือตัวย้ายล้มแล้วขึ้นว่าหาไฟล์ไม่เจอ ผู้ช่วยตรวจโค้ดเจอ · TECH-REVIEW ข้อ 16)
            if partial.to_string_lossy().encode_utf16().count() > crate::rename::MAX_PATH_LEN {
                r.states[i] = "failed".into();
                r.error = Some(format!("แยก {} ไม่สำเร็จ ที่อยู่ไฟล์ยาวเกินไป · เลือกที่เก็บที่สั้นกว่า หรือเปลี่ยนชื่อไฟล์หนังให้สั้นลง · ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it)));
                break;
            }
            let _ = std::fs::remove_file(&partial);
            let stop = || STOP.load(std::sync::atomic::Ordering::SeqCst) || jobs.cancelled();
            match extract_one(&tools, &src, it, &partial, &|p| { let _ = app.emit("extract-progress", ExtractProgress { index: i, percent: p }); }, &stop) {
                Ok(Done::Ok) => match crate::rename::move_no_replace(&partial, &target) {
                    Ok(()) => { r.states[i] = "done".into(); r.files[i] = Some(target.to_string_lossy().to_string()); }
                    Err(p) => { let _ = std::fs::remove_file(&partial); r.states[i] = "failed".into(); r.error = Some(p.title); break; }
                },
                Ok(Done::Cancelled) => {
                    r.states[i] = "cancelled".into();
                    break;
                }
                Err(e) => { r.states[i] = "failed".into(); r.error = Some(format!("แยก {} ไม่สำเร็จ · {e} · ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ", title_of(it))); break; }
            }
        }
        Ok(r)
    }).await.map_err(|e| e.to_string())?
}
