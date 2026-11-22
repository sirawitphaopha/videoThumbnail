//! เช็กรุ่นล่าสุดของตัวแปลงเสียงจากหน้าเว็บทางการของผู้ทำ
//! พี่กันสั่ง 8 พ.ย. 2569 "ระบบ codec เสียงทุกอัน เราอยากให้มันสามารถกดเเล้วโปรแกรมมันจะไปเช็คมาว่าล่าสุดหรือยัง"
//! ออกเน็ตเฉพาะตอนกดปุ่มในหน้าตั้งค่า · อ่านอย่างเดียว ไม่โหลดตัวแปลงมาเปลี่ยนเอง (ตัวแปลงต้องเช็ก hash กับลายเซ็นก่อนใช้ · vendor/README.md)
//! ไม่ส่งข้อมูลของผู้ใช้ไปไหน ส่งแค่คำขอหน้าเว็บธรรมดา · ดึงด้วย curl.exe ของ Windows ไม่ต้องเพิ่มห้องสมุด ไม่มีหน้าต่างขึ้น
//! แต่ละตัวอ่านจากที่เดียวกับที่โหลดตัวที่แนบมา (ลองดึงจริง 8 พ.ย. 2569) · opusenc อ่านรุ่น libopus จากหน้า RareWares
//! เพราะ GitHub ของ libopus ขึ้นแค่ 1.5.2 ทั้งที่ชุดของ RareWares ที่เราใช้เป็น 1.6.1 แล้ว

use std::ffi::OsStr;
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;

use crate::audio::encode::EncoderInfo;

/// อ่านเลขรุ่นจากหน้าเว็บแบบไหน
#[derive(Clone, Copy)]
enum How {
    /// ช่อง tag_name ของ GitHub releases/latest
    GithubLatest,
    /// ช่อง name ทุกตัวของ GitHub tags เลือกรุ่นสูงสุด
    GithubTags,
    /// เลขรุ่นที่ตามหลังคำ prefix (และตามด้วย suffix ถ้าให้) ทุกที่ในหน้า เลือกรุ่นสูงสุด
    After(&'static str, &'static str),
    /// ทั้งหน้าคือเลขรุ่น
    Plain,
}

/// ตัวแปลง · ที่อ่านรุ่น · หน้าโหลดที่ให้กดเปิด · วิธีอ่าน · บอกผู้ใช้ว่าอ่านจากไหน
struct Source { name: &'static str, check: &'static str, page: &'static str, how: How, from: &'static str }

const SOURCES: [Source; 10] = [
    Source { name: "flac", check: "https://api.github.com/repos/xiph/flac/releases/latest", page: "https://xiph.org/flac/download.html", how: How::GithubLatest, from: "Xiph" },
    Source { name: "opusenc", check: "https://www.rarewares.org/files/opus/", page: "https://www.rarewares.org/files/opus/", how: How::After("using libopus ", ""), from: "RareWares (รุ่น libopus ในชุด)" },
    Source { name: "lame", check: "https://www.rarewares.org/files/mp3/", page: "https://www.rarewares.org/files/mp3/", how: How::After("lame-", "-x64.zip"), from: "RareWares" },
    Source { name: "wavpack", check: "https://api.github.com/repos/dbry/WavPack/releases/latest", page: "https://github.com/dbry/WavPack/releases", how: How::GithubLatest, from: "WavPack (GitHub)" },
    Source { name: "MACDll64", check: "https://www.monkeysaudio.com/download.html", page: "https://www.monkeysaudio.com/download.html", how: How::After("Monkey's Audio ", ""), from: "Monkey's Audio" },
    Source { name: "qaac64", check: "https://api.github.com/repos/nu774/qaac/releases/latest", page: "https://github.com/nu774/qaac/releases", how: How::GithubLatest, from: "qaac (GitHub)" },
    // refalac มากับชุด qaac รุ่นเดียวกัน
    Source { name: "refalac64", check: "https://api.github.com/repos/nu774/qaac/releases/latest", page: "https://github.com/nu774/qaac/releases", how: How::GithubLatest, from: "qaac (GitHub)" },
    Source { name: "fdkaac", check: "https://api.github.com/repos/nu774/fdkaac/tags", page: "https://github.com/nu774/fdkaac", how: How::GithubTags, from: "fdkaac (GitHub)" },
    // เว็บ TAK มีแต่ http (https ต่อไม่ได้ · ลอง 8 พ.ย. 2569) · อ่านอย่างเดียว ไม่โหลดไฟล์
    Source { name: "Takc", check: "http://www.thbeck.de/Tak/Tak.html", page: "http://www.thbeck.de/Tak/Tak.html", how: How::After("TAK_", ".zip"), from: "TAK (Thomas Becker)" },
    Source { name: "ffmpeg", check: "https://www.gyan.dev/ffmpeg/builds/release-version", page: "https://www.gyan.dev/ffmpeg/builds/", how: How::Plain, from: "gyan.dev (ชุด full build ที่แนบมา)" },
];

/// เลขรุ่นที่ขึ้นต้นข้อความ เช่น "1.5.0-rc1" ได้ "1.5.0" · ต้องมีจุดอย่างน้อยหนึ่งตัว
fn lead_ver(s: &str) -> Option<String> {
    let v: String = s.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let v = v.trim_end_matches('.').to_string();
    (v.contains('.') && v.starts_with(|c: char| c.is_ascii_digit())).then_some(v)
}

/// ตัด .0 ท้ายก่อนเทียบ 1.5 กับ 1.5.0 คือรุ่นเดียวกัน (AUDIT ข้อ 131 · เดิมได้ [1,5] กับ [1,5,0] เทียบแล้วขึ้นมีรุ่นใหม่ตลอด)
fn ver_key(v: &str) -> Vec<u64> {
    let mut k: Vec<u64> = v.trim_start_matches("libopus ").split('.').map(|x| x.parse().unwrap_or(0)).collect();
    while k.len() > 1 && k.last() == Some(&0) { k.pop(); }
    k
}

/// ค่าแบบข้อความของช่อง key ทุกตัวใน JSON (ไม่ต้องใช้ตัวอ่าน JSON เต็ม · รับทั้งแบบมีและไม่มีช่องว่างหลัง :)
fn json_strings(text: &str, key: &str) -> Vec<String> {
    let pat = format!("\"{key}\"");
    let mut out = vec![];
    for (i, _) in text.match_indices(&pat) {
        let rest = text[i + pat.len()..].trim_start();
        let Some(rest) = rest.strip_prefix(':') else { continue };
        let Some(rest) = rest.trim_start().strip_prefix('"') else { continue };
        if let Some(end) = rest.find('"') { out.push(rest[..end].to_string()); }
    }
    out
}

/// อ่านเลขรุ่นล่าสุดจากเนื้อหน้าเว็บ
fn parse(how: How, text: &str) -> Option<String> {
    let best = |vs: Vec<String>| vs.into_iter().max_by(|a, b| ver_key(a).cmp(&ver_key(b)));
    match how {
        How::GithubLatest => json_strings(text, "tag_name").first().and_then(|t| lead_ver(t.trim_start_matches(['v', 'V']))),
        How::GithubTags => best(json_strings(text, "name").iter().filter_map(|t| lead_ver(t.trim_start_matches(['v', 'V']))).collect()),
        How::After(prefix, suffix) => best(text.match_indices(prefix).filter_map(|(i, _)| {
            let rest = &text[i + prefix.len()..];
            let v = lead_ver(rest)?;
            (suffix.is_empty() || rest[v.len()..].starts_with(suffix)).then_some(v)
        }).collect()),
        How::Plain => lead_ver(text.trim()),
    }
}

/// ดึงหน้าเว็บด้วย curl.exe ของ Windows · หัวแบบเบราว์เซอร์ (เว็บ Monkey's Audio ตอบ 406 ถ้าไม่มี) · ไม่เกิน 20 วินาที
fn fetch(url: &str) -> Result<String, String> {
    let sys = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("System32");
    let args = ["-sS", "-L", "--fail", "--compressed", "--max-time", "20",
        "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
        "-H", "Accept: text/html,application/json;q=0.9,*/*;q=0.8", "-H", "Accept-Language: en-US,en;q=0.9", url];
    let out = crate::app::tools::run_tool_timeout(&sys, "curl", args.iter().map(OsStr::new), Duration::from_secs(25))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(match out.status.code() {
            Some(6) => "หาเว็บไม่เจอ ไม่ได้ต่อเน็ตหรือเปล่า".into(),
            Some(7) | Some(28) => "ต่อเว็บไม่ได้หรือรอนานเกิน".into(),
            // GitHub ให้ถามได้ชั่วโมงละ 60 ครั้งต่อเน็ตหนึ่งที่ ถามถี่เกินตอบ 403 หรือ 429 บอกให้รอ ไม่ใช่บอกว่าเว็บผิดปกติ (AUDIT ข้อ 131)
            Some(22) if url.contains("api.github.com") && (err.ends_with("403") || err.ends_with("429")) => "GitHub ให้เช็กได้ชั่วโมงละ 60 ครั้ง รอราวหนึ่งชั่วโมงแล้วกดใหม่".into(),
            Some(22) => format!("เว็บตอบผิดปกติ {}", err.rsplit(' ').next().unwrap_or("")),
            // รหัสของ curl เป็นประโยคไทย ไม่ใช่แค่รหัส (BUGS ข้อ 150) · ตารางรหัสจากคู่มือ curl หัวข้อ EXIT CODES
            Some(35) | Some(51) | Some(58) | Some(60) => "ต่อเว็บแบบปลอดภัยไม่ได้ วันเวลาของเครื่องอาจผิด หรือเน็ตที่ใช้ดักการเชื่อมต่อไว้".into(),
            Some(5) => "หาพร็อกซีของเน็ตที่ตั้งไว้ไม่เจอ".into(),
            Some(23) => "เขียนข้อมูลที่ดึงมาไม่ได้ ไดรฟ์อาจเต็ม".into(),
            Some(52) | Some(56) => "เว็บตัดการเชื่อมต่อกลางคัน ลองกดใหม่".into(),
            c => format!("ดึงหน้าเว็บไม่ได้ ซึ่งโปรแกรมแปลสาเหตุเป็นภาษาไทยไม่ได้ (curl {} {err})", c.map(|c| c.to_string()).unwrap_or_default()),
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LatestInfo {
    pub name: String,
    /// รุ่นที่ใช้อยู่ (ไม่มี = ยังไม่ได้ใส่)
    pub installed: Option<String>,
    pub latest: Option<String>,
    /// ok ตรงกับล่าสุด · new มีรุ่นใหม่กว่า · ahead ที่ใช้อยู่ใหม่กว่าหน้าเว็บ · missing ยังไม่ได้ใส่ · error เช็กไม่ได้
    pub state: String,
    pub from: String,
    pub error: Option<String>,
}

/// เทียบรุ่นที่ใช้อยู่กับรุ่นล่าสุด · opusenc ตัด "libopus " ก่อนเทียบ
pub fn compare(installed: Option<&str>, latest: Option<&str>) -> &'static str {
    match (installed, latest) {
        (_, None) => "error",
        (None, Some(_)) => "missing",
        (Some(i), Some(l)) => match ver_key(i).cmp(&ver_key(l)) {
            std::cmp::Ordering::Less => "new",
            std::cmp::Ordering::Equal => "ok",
            std::cmp::Ordering::Greater => "ahead",
        },
    }
}

/// ที่อยู่ที่ต้องดึงจริง ที่อยู่ซ้ำกันดึงครั้งเดียว (qaac กับ refalac อ่านหน้าเดียวกัน) · คืนลำดับตัวแรกของแต่ละที่อยู่
fn unique_checks() -> Vec<usize> {
    (0..SOURCES.len()).filter(|&i| SOURCES[..i].iter().all(|s| s.check != SOURCES[i].check)).collect()
}

/// เช็กทุกตัวพร้อมกัน (ที่อยู่ละเธรด) · ใช้เวลาเท่าตัวที่ช้าที่สุด
/// ที่อยู่ซ้ำดึงครั้งเดียวแล้วแบ่งผลให้ทุกตัวที่ใช้ที่อยู่นั้น กด 1 ครั้งถาม GitHub 4 ครั้งแทน 5 (AUDIT ข้อ 131)
pub fn check_all(status: &[EncoderInfo]) -> Vec<LatestInfo> {
    let pages: Vec<(&'static str, Result<String, String>)> = std::thread::scope(|s| {
        let hs: Vec<_> = unique_checks().into_iter().map(|i| {
            let url = SOURCES[i].check;
            s.spawn(move || (url, fetch(url)))
        }).collect();
        hs.into_iter().filter_map(|h| h.join().ok()).collect()
    });
    let got = SOURCES.iter().enumerate().filter_map(|(i, src)| {
        let page = pages.iter().find(|(u, _)| *u == src.check)?;
        Some((i, page.1.clone().and_then(|t| parse(src.how, &t).ok_or_else(|| "หาเลขรุ่นในหน้าเว็บไม่เจอ หน้าเว็บอาจเปลี่ยนแบบ".to_string()))))
    });
    got.map(|(i, r)| {
        let src = &SOURCES[i];
        let installed = status.iter().find(|e| e.name == src.name && e.ok).and_then(|e| e.version.clone());
        let (latest, error) = match r { Ok(v) => (Some(v), None), Err(e) => (None, Some(e)) };
        LatestInfo { name: src.name.into(), state: compare(installed.as_deref(), latest.as_deref()).into(), installed, latest, from: src.from.into(), error }
    }).collect()
}

#[tauri::command]
pub async fn encoders_latest(app: tauri::AppHandle) -> Result<Vec<LatestInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::app::tools::tools_dir(&app)?;
        let user = crate::audio::encode::user_dir(&app)?;
        Ok(check_all(&crate::audio::encode::status(&tools, &user)))
    }).await.map_err(|e| e.to_string())?
}

/// เปิดหน้าโหลดของตัวแปลงในเบราว์เซอร์หลัก · ที่อยู่ตายตัวในรายการข้างบน หน้าจอส่งที่อยู่อื่นมาเปิดไม่ได้ (แบบเดียวกับ open_icaros_page)
#[tauri::command]
pub fn encoders_open_page(app: tauri::AppHandle, name: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let src = SOURCES.iter().find(|s| s.name == name).ok_or("ไม่รู้จักตัวแปลงนี้")?;
    app.opener().open_url(src.page, None::<&str>).map_err(|e| format!("เปิดหน้าเว็บไม่ได้: {e}"))
}

/// เปิดหน้าโหลด iTunes ของ Apple หน้าภาษาไทย (พี่กันส่งลิงก์ 10 พ.ย. 2569 "ลิ้งโหลดนี้ ให้มันเด้งไปโหลดได้") · qaac ต้องใช้ไฟล์ของ Apple ที่มากับ iTunes · ที่อยู่ตายตัว (หน้านี้มีปุ่มโหลดสำหรับ Windows · เช็ก 10 พ.ย. 2569)
#[tauri::command]
pub fn open_itunes_page(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url("https://www.apple.com/th/itunes/", None::<&str>).map_err(|e| format!("เปิดหน้าเว็บไม่ได้: {e}"))
}

/// ลิงก์ในหน้าขอบคุณ ข้อความบนการ์ดกับที่อยู่จริง · รับเฉพาะรายการนี้ หน้าจอส่งที่อยู่อื่นมาเปิดไม่ได้ (พี่กันสั่ง 9 พ.ย. 2569 "ลิงก์ที่ใส่ในการ์ดขอบคุณ ขอให้มันกดเปิดได้ที")
const THANK_LINKS: &[(&str, &str)] = &[
    ("github.com/alexkay/spek", "https://github.com/alexkay/spek"),
    ("videohelp.com/software/Bitrate-Viewer", "https://www.videohelp.com/software/Bitrate-Viewer"),
    ("audacityteam.org", "https://www.audacityteam.org/"),
    ("aegisub.org", "https://aegisub.org/"),
    ("github.com/SubtitleEdit/subtitleedit", "https://github.com/SubtitleEdit/subtitleedit"),
    ("mpv.io", "https://mpv.io/"),
    ("github.com/cubicibo/SUPer", "https://github.com/cubicibo/SUPer"),
    ("github.com/TheGreatMcPain/BDSup2SubPlusPlus", "https://github.com/TheGreatMcPain/BDSup2SubPlusPlus"),
    // วิธีแยกไฟล์แบบ gMKVExtractGUI (BUGS ข้อ 130 พี่กันสั่ง "เอาอันนี้เข้าขอบคุณด้วยนะ")
    ("github.com/Gpower2/gMKVExtractGUI", "https://github.com/Gpower2/gMKVExtractGUI"),
    ("kodi.tv", "https://kodi.tv/"),
    ("claude.ai", "https://claude.ai/"),
    ("ffmpeg.org", "https://ffmpeg.org/"),
    ("mkvtoolnix.download", "https://mkvtoolnix.download/"),
    ("mediaarea.net", "https://mediaarea.net/en/MediaInfo"),
    ("xiph.org/flac", "https://xiph.org/flac/"),
    ("lame.sourceforge.io", "https://lame.sourceforge.io/"),
    ("opus-codec.org", "https://opus-codec.org/"),
    ("wavpack.com", "https://www.wavpack.com/"),
    ("github.com/nu774/qaac", "https://github.com/nu774/qaac"),
    ("monkeysaudio.com", "https://www.monkeysaudio.com/"),
    ("thbeck.de/Tak", "http://www.thbeck.de/Tak/Tak.html"),
    ("github.com/strukturag/libheif", "https://github.com/strukturag/libheif"),
    ("bitbucket.org/multicoreware/x265_git", "https://bitbucket.org/multicoreware/x265_git"),
    ("aomedia.org", "https://aomedia.org/"),
    ("videolan.org", "https://www.videolan.org/projects/dav1d.html"),
    ("chromium.googlesource.com/webm/libwebp", "https://chromium.googlesource.com/webm/libwebp"),
    ("microsoft.com", "https://www.microsoft.com/"),
    ("rust-lang.org", "https://www.rust-lang.org/"),
    ("github.com/fifonik/FFBitrateViewer", "https://github.com/fifonik/FFBitrateViewer"),
    ("claude.com/claude-code", "https://claude.com/claude-code"),
    ("typescriptlang.org", "https://www.typescriptlang.org/"),
    ("vite.dev", "https://vite.dev/"),
    ("crates.io", "https://crates.io/"),
    ("simpleicons.org", "https://simpleicons.org/"),
    ("icons8.com", "https://icons8.com/"),
    ("commons.wikimedia.org", "https://commons.wikimedia.org/"),
    ("tauri.app", "https://tauri.app/"),
    ("react.dev", "https://react.dev/"),
    ("github.com/image-rs/image", "https://github.com/image-rs/image"),
    ("fonts.google.com/specimen/Sarabun", "https://fonts.google.com/specimen/Sarabun"),
    // ระบบ OCR ซับรูป (แผน OCR ขั้น 12 · BUGS ข้อ 143)
    ("github.com/PaddlePaddle/PaddleOCR", "https://github.com/PaddlePaddle/PaddleOCR"),
    ("onnxruntime.ai", "https://onnxruntime.ai/"),
    ("github.com/tesseract-ocr/tesseract", "https://github.com/tesseract-ocr/tesseract"),
    ("github.com/LibreOffice/dictionaries", "https://github.com/LibreOffice/dictionaries"),
];

fn thank_url(link: &str) -> Option<&'static str> {
    THANK_LINKS.iter().find(|(k, _)| *k == link).map(|(_, u)| *u)
}

/// เปิดลิงก์จากหน้าขอบคุณในเบราว์เซอร์หลัก
#[tauri::command]
pub fn thanks_open(app: tauri::AppHandle, link: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = thank_url(&link).ok_or("ไม่รู้จักลิงก์นี้")?;
    app.opener().open_url(url, None::<&str>).map_err(|e| format!("เปิดหน้าเว็บไม่ได้: {e}"))
}

#[cfg(test)]
#[path = "latest_tests.rs"]
mod tests;
