//! เรียกเครื่องมือเบื้องหลัง mkvmerge mkvextract mkvpropedit ffmpeg ffprobe MediaInfo
//! เครื่องมืออยู่ในโฟลเดอร์ tools ที่แนบไปกับโปรแกรม (tauri.conf.json bundle.resources)
//! ตอนทดสอบด้วย tauri dev โฟลเดอร์นี้ถูกคัดลอกไปไว้ที่ target/debug/tools

use std::ffi::OsStr;
use std::io::Read;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitStatus, Output, Stdio};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// ไม่ให้หน้าต่างดำของเครื่องมือเด้งขึ้นมาทุกครั้งที่เรียก
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// ชื่อเครื่องมือทั้ง 6 ตัว กับคำสั่งถามเลขรุ่น
pub const TOOLS: [(&str, &str); 6] = [
    ("mkvmerge", "--version"),
    ("mkvextract", "--version"),
    ("mkvpropedit", "--version"),
    ("ffmpeg", "-version"),
    ("ffprobe", "-version"),
    ("MediaInfo", "--Version"),
];

/// เวลารอสูงสุดของคำสั่งสั้น เช่นถามเลขรุ่น · ครั้งแรกที่ Defender สแกน ffmpeg.exe 228 MB อาจช้าหลายวินาที
pub const SHORT_TIMEOUT: Duration = Duration::from_secs(30);

/// ที่อยู่โฟลเดอร์เครื่องมือของโปรแกรมที่กำลังรัน
pub fn tools_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("หาโฟลเดอร์ของโปรแกรมไม่เจอ: {e}"))?
        .join("tools");
    Ok(dunce::simplified(&dir).to_path_buf())
}

/// เตรียมคำสั่งของเครื่องมือหนึ่งตัว
/// ส่งที่อยู่ไฟล์แบบเต็มเสมอ (ชื่อที่ขึ้นต้นด้วย @ หรือ - เครื่องมือจะอ่านเป็นคำสั่ง · TECH-REVIEW ข้อ 9)
/// ไม่ตั้งโฟลเดอร์ทำงานเป็นโฟลเดอร์เครื่องมือ ไม่งั้นที่อยู่แบบสั้นที่ส่งพลาดไป จะไปเขียนไฟล์ลงโฟลเดอร์ติดตั้ง
/// (MediaInfo หา LIBCURL.DLL ข้างตัวมันเองได้อยู่แล้ว ไม่ต้องพึ่งโฟลเดอร์ทำงาน)
pub fn tool_command<I, S>(dir: &Path, name: &str, args: I) -> Command
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut cmd = Command::new(dir.join(format!("{name}.exe")));
    cmd.args(args).stdin(Stdio::null()).creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// รันเครื่องมือหนึ่งตัวจนจบ รับผลทั้งหมดกลับมา · ไม่มีเวลาหมด ใช้ในเทสกับคำสั่งที่รู้ว่าจบเร็ว
#[cfg_attr(not(test), allow(dead_code))]
pub fn run_tool<I, S>(dir: &Path, name: &str, args: I) -> std::io::Result<Output>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    tool_command(dir, name, args).output()
}

/// รันเครื่องมือแล้วรอไม่เกิน `timeout` · เกินเวลาตัดทิ้ง ไม่ให้หน้าจอค้าง "กำลังเช็ก…" ตลอดไป
/// (เช่นไฟล์อยู่บนไดรฟ์ USB หรือเครือข่ายที่หลุด) · อ่านท่อผลทั้งสองพร้อมกัน ท่อเต็มแล้วเครื่องมือจะไม่ค้าง
pub fn run_tool_timeout<I, S>(dir: &Path, name: &str, args: I, timeout: Duration) -> Result<Output, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut child = tool_command(dir, name, args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("เปิด {name} ไม่ได้: {e}"))?;
    // โปรแกรมปิดหรือพังเมื่อไหร่ เครื่องมือตายตาม ไม่ค้างถือไฟล์ (TECH-REVIEW ข้อ 9)
    crate::winutil::kill_with_app(&child);
    let mut out_pipe = child.stdout.take().expect("ท่อผล");
    let mut err_pipe = child.stderr.take().expect("ท่อข้อผิดพลาด");
    let out_reader = std::thread::spawn(move || { let mut b = Vec::new(); let _ = out_pipe.read_to_end(&mut b); b });
    let err_reader = std::thread::spawn(move || { let mut b = Vec::new(); let _ = err_pipe.read_to_end(&mut b); b });
    let start = Instant::now();
    let status = loop {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(s) => break s,
            None if start.elapsed() > timeout => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{name} ไม่ตอบภายใน {} วินาที", timeout.as_secs()));
            }
            None => std::thread::sleep(Duration::from_millis(30)),
        }
    };
    Ok(Output {
        status,
        stdout: out_reader.join().unwrap_or_default(),
        stderr: err_reader.join().unwrap_or_default(),
    })
}

/// เครื่องมือตอบว่าทำสำเร็จไหม · แต่ละตัวใช้รหัสจบงานต่างกัน (TECH-REVIEW ข้อ 2)
/// MKVToolNix 0 = สำเร็จ · 1 = สำเร็จแต่มีคำเตือน · 2 = พัง
/// ffmpeg ffprobe MediaInfo 0 = สำเร็จ · อย่างอื่น = พัง
/// ห้ามตีรหัส 1 ของ MKVToolNix ว่าพังแล้วย้อนงาน ไม่งั้นจะลบไฟล์ที่เพิ่งเขียนสำเร็จ
pub fn tool_succeeded(name: &str, status: &ExitStatus) -> bool {
    match status.code() {
        Some(0) => true,
        Some(1) => name.starts_with("mkv"),
        _ => false,
    }
}

/// รหัสจบงานเป็นข้อความให้คนอ่าน
pub fn exit_text(status: &ExitStatus) -> String {
    status.code().map_or("ไม่มีรหัส (โดนปิดกลางคัน)".to_string(), |c| c.to_string())
}

/// บรรทัดแรกที่ไม่ว่างของผลลัพธ์
fn first_line(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or("")
        .to_string()
}

#[derive(Serialize, Clone, Debug)]
pub struct ToolCheck {
    pub name: String,
    pub ok: bool,
    pub version: String,
}

/// เช็กว่าเครื่องมือทั้ง 6 ตัวพร้อมใช้ไหม พร้อมเลขรุ่น
pub fn check_all(dir: &Path) -> Vec<ToolCheck> {
    TOOLS
        .iter()
        .map(|(name, arg)| match run_tool_timeout(dir, name, [arg], SHORT_TIMEOUT) {
            Ok(out) if tool_succeeded(name, &out.status) => {
                let mut version = first_line(&out.stdout);
                // MediaInfo พิมพ์ชื่อโปรแกรมบรรทัดแรก เลขรุ่นอยู่บรรทัดถัดไป
                if *name == "MediaInfo" {
                    version = String::from_utf8_lossy(&out.stdout)
                        .lines()
                        .map(str::trim)
                        .filter(|l| !l.is_empty())
                        .collect::<Vec<_>>()
                        .join(" ");
                }
                ToolCheck { name: name.to_string(), ok: true, version }
            }
            Ok(out) => ToolCheck {
                name: name.to_string(),
                ok: false,
                version: format!("ตอบรหัส {} {}", exit_text(&out.status), first_line(&out.stderr)),
            },
            Err(e) => ToolCheck { name: name.to_string(), ok: false, version: e },
        })
        .collect()
}

#[tauri::command]
pub async fn check_tools(app: AppHandle) -> Result<Vec<ToolCheck>, String> {
    let dir = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || check_all(&dir))
        .await
        .map_err(|e| e.to_string())
}

/// ลง Icaros แล้วหรือยัง · ดูไฟล์ IcarosConfig.exe ในโฟลเดอร์ติดตั้งมาตรฐาน (Program Files ทั้งสองแบบ)
/// Icaros ทำให้ Windows โชว์โปสเตอร์ใน MKV เป็นไอคอนไฟล์ ไม่ลงก็ใช้โปรแกรมนี้ได้ครบ (สเปกข้อ 9 · ข้อ 10)
pub fn icaros_installed() -> bool {
    ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"].iter()
        .filter_map(|k| std::env::var_os(k))
        .any(|d| Path::new(&d).join("Icaros").join("IcarosConfig.exe").exists())
}

#[tauri::command]
pub fn check_icaros() -> bool {
    icaros_installed()
}

/// เปิดหน้าเว็บของผู้พัฒนา Icaros ในเบราว์เซอร์หลัก · ที่อยู่ตายตัว หน้าจอส่งที่อยู่อื่นมาเปิดไม่ได้
#[tauri::command]
pub fn open_icaros_page(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url("https://github.com/Xanashi/Icaros", None::<&str>).map_err(|e| format!("เปิดหน้าเว็บไม่ได้: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dev_tools_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }

    /// ไฟล์ทดสอบชื่อไทย · ไม่มีไฟล์ = เทสล้มพร้อมบอกวิธีสร้าง ห้ามผ่านเงียบ ๆ (ผลตรวจขั้น 0 โค้ดข้อ 3)
    /// อยากข้ามจริง ๆ ต้องตั้ง MOVIE_SHELF_SKIP_MEDIA=1 ให้เห็นชัดว่าตั้งใจข้าม
    fn thai_file() -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("test-media")
            .join("สร้าง")
            .join("หนัง")
            .join("ดาวเหนือ (2023).mkv");
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }

    /// ไฟล์หรือโฟลเดอร์ชั่วคราวที่ลบตัวเองตอนจบ แม้เทสล้มกลางทาง
    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            if self.0.is_dir() {
                let _ = std::fs::remove_dir_all(&self.0);
            } else {
                let _ = std::fs::remove_file(&self.0);
            }
        }
    }

    #[test]
    fn all_six_tools_answer_their_version() {
        let checks = check_all(&dev_tools_dir());
        assert_eq!(checks.len(), 6);
        for c in &checks {
            assert!(c.ok, "{} ไม่พร้อม: {}", c.name, c.version);
        }
        // ต้องเป็นรุ่นที่แนบไว้ใน vendor/README.md ไม่ใช่แค่ตอบอะไรก็ได้
        let want = [("mkvmerge", "v103.0"), ("mkvextract", "v103.0"), ("mkvpropedit", "v103.0"),
                    ("ffmpeg", "9.0.2"), ("ffprobe", "9.0.2"), ("MediaInfo", "26.10")];
        for (name, ver) in want {
            let c = checks.iter().find(|c| c.name == name).unwrap();
            assert!(c.version.contains(ver), "{name} ไม่ใช่รุ่น {ver}: {}", c.version);
        }
    }

    #[test]
    fn exit_codes_are_read_per_tool() {
        use std::os::windows::process::ExitStatusExt;
        let s = |c: u32| ExitStatus::from_raw(c);
        assert!(tool_succeeded("mkvmerge", &s(0)));
        assert!(tool_succeeded("mkvpropedit", &s(1)), "MKVToolNix รหัส 1 = สำเร็จแต่มีคำเตือน");
        assert!(!tool_succeeded("mkvmerge", &s(2)));
        assert!(!tool_succeeded("ffmpeg", &s(1)));
        assert_eq!(exit_text(&s(2)), "2");
    }

    #[test]
    fn tools_are_tied_to_the_app_job() {
        use windows_sys::Win32::System::JobObjects::IsProcessInJob;
        use std::os::windows::io::AsRawHandle;
        let child = tool_command(&dev_tools_dir(), "ffmpeg", ["-hide_banner", "-nostdin", "-re", "-f", "lavfi", "-i", "anullsrc", "-f", "null", "-"])
            .stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        let mut child = child;
        assert!(crate::winutil::kill_with_app(&child), "ผูกเครื่องมือเข้า Job Object ไม่ได้");
        let mut inside = 0;
        unsafe { IsProcessInJob(child.as_raw_handle() as _, std::ptr::null_mut(), &mut inside) };
        let _ = child.kill();
        let _ = child.wait();
        assert!(inside != 0, "เครื่องมือไม่ได้อยู่ใน Job Object ของโปรแกรม");
    }

    #[test]
    fn timeout_kills_a_hung_tool() {
        // ffmpeg อ่านจากอุปกรณ์จำลองที่ไม่มีวันจบ = เครื่องมือค้าง
        let r = run_tool_timeout(&dev_tools_dir(), "ffmpeg", [
            "-hide_banner", "-nostdin", "-re", "-f", "lavfi", "-i", "anullsrc", "-f", "null", "-",
        ], Duration::from_secs(2));
        let e = r.expect_err("ต้องหมดเวลา");
        assert!(e.contains("ไม่ตอบภายใน 2 วินาที"), "{e}");
    }

    /// เครื่องมือทุกตัวต้องอ่านไฟล์ชื่อภาษาไทยได้ และชื่อที่พิมพ์กลับมาต้องไม่เพี้ยน
    #[test]
    fn tools_read_thai_file_names() {
        let Some(file) = thai_file() else { return };
        let dir = dev_tools_dir();
        let name = file.to_string_lossy().to_string();

        let out = run_tool(&dir, "mkvmerge", [OsStr::new("-J"), file.as_os_str()]).unwrap();
        let j: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(j["file_name"].as_str().unwrap(), name, "mkvmerge อ่านชื่อกลับมาไม่ตรง");
        assert_eq!(j["tracks"].as_array().unwrap().len(), 5);

        let out = run_tool(&dir, "ffprobe", [
            OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
            OsStr::new("-show_format"), file.as_os_str(),
        ]).unwrap();
        let j: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(j["format"]["filename"].as_str().unwrap(), name, "ffprobe อ่านชื่อกลับมาไม่ตรง");

        let out = run_tool(&dir, "MediaInfo", [file.as_os_str()]).unwrap();
        let text = String::from_utf8(out.stdout).expect("MediaInfo ส่งข้อความที่ไม่ใช่ UTF-8");
        assert!(text.contains("ดาวเหนือ (2023).mkv"), "MediaInfo พิมพ์ชื่อไทยเพี้ยน");

        let out = run_tool(&dir, "ffmpeg", [
            OsStr::new("-hide_banner"), OsStr::new("-nostdin"), OsStr::new("-v"), OsStr::new("error"),
            OsStr::new("-i"), file.as_os_str(), OsStr::new("-t"), OsStr::new("1"),
            OsStr::new("-f"), OsStr::new("null"), OsStr::new("-"),
        ]).unwrap();
        assert!(out.status.success(), "ffmpeg เปิดไฟล์ชื่อไทยไม่ได้: {}", String::from_utf8_lossy(&out.stderr));

        let out = run_tool(&dir, "mkvextract", [file.as_os_str(), OsStr::new("chapters"), OsStr::new("--simple")]).unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        assert!(text.contains("Chapter 01"), "mkvextract อ่านบทหนังไม่ได้: {text}");

        // mkvpropedit แก้ไฟล์จริง จึงทำกับสำเนาชื่อไทยในโฟลเดอร์ชั่วคราว ไม่แตะไฟล์ทดสอบ · ลบเองตอนจบแม้ล้มกลางทาง
        let copy = Temp(std::env::temp_dir().join("ชั้นหนัง ทดสอบชื่อไทย.mkv"));
        std::fs::copy(&file, &copy.0).unwrap();
        let out = run_tool(&dir, "mkvpropedit", [
            copy.0.as_os_str(), OsStr::new("--edit"), OsStr::new("info"), OsStr::new("--set"), OsStr::new("title=ทดสอบชื่อเรื่อง"),
        ]).unwrap();
        assert!(tool_succeeded("mkvpropedit", &out.status), "mkvpropedit แก้ไฟล์ชื่อไทยไม่ได้: {}", String::from_utf8_lossy(&out.stdout));
        let out = run_tool(&dir, "mkvmerge", [OsStr::new("-J"), copy.0.as_os_str()]).unwrap();
        let j: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        assert_eq!(j["container"]["properties"]["title"].as_str(), Some("ทดสอบชื่อเรื่อง"), "ชื่อเรื่องภาษาไทยที่เขียนลงไฟล์เพี้ยน");
    }

    /// ตัวติดตั้งวางเครื่องมือไว้ใต้โฟลเดอร์ชื่อไทย ...\ชั้นหนัง\tools · เครื่องมือต้องเปิดได้จากที่นั่น (ผลตรวจขั้น 0 สเปกข้อ 23)
    /// ใช้ฮาร์ดลิงก์ ไม่คัดลอก ffmpeg 228 MB ซ้ำ (โฟลเดอร์ชั่วคราวอยู่ไดรฟ์เดียวกันเมื่อเรียกผ่าน dev.ps1) · ทำไม่ได้ค่อยคัดลอก
    #[test]
    fn tools_run_from_a_thai_folder() {
        let src = dev_tools_dir();
        let root = Temp(std::env::temp_dir().join(format!("ชั้นหนัง เทส {}", std::process::id())));
        let dir = root.0.join("ชั้นหนัง").join("tools");
        std::fs::create_dir_all(&dir).unwrap();
        for f in ["mkvmerge.exe", "mkvextract.exe", "mkvpropedit.exe", "ffmpeg.exe", "ffprobe.exe", "MediaInfo.exe", "LIBCURL.DLL"] {
            let (a, b) = (src.join(f), dir.join(f));
            if std::fs::hard_link(&a, &b).is_err() {
                std::fs::copy(&a, &b).unwrap();
            }
        }
        for c in check_all(&dir) {
            assert!(c.ok, "{} เปิดจากโฟลเดอร์ชื่อไทยไม่ได้: {}", c.name, c.version);
        }
        if let Some(file) = thai_file() {
            let out = run_tool(&dir, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-show_format"), file.as_os_str()]).unwrap();
            assert!(out.status.success(), "ffprobe ในโฟลเดอร์ชื่อไทยอ่านไฟล์ชื่อไทยไม่ได้");
        }
    }
}
