//! เทสของ tools.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn dev_tools_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}

/// รหัสของ Windows กับผลของเครื่องมือเป็นประโยคไทย ไม่มีแค่รหัส (BUGS ข้อ 150)
#[test]
fn reasons_in_thai() {
    assert!(win_reason(32).contains("ถูกเปิดอยู่ในโปรแกรมอื่น"));
    assert!(win_reason(112).contains("พื้นที่ในไดรฟ์เต็ม"));
    assert!(win_reason(2).starts_with("หาไฟล์หรือโฟลเดอร์ไม่เจอ"));
    assert!(win_reason(1392).starts_with("Windows ตอบว่า") && !win_reason(1392).contains("(รหัส"), "{}", win_reason(1392));
    // ffprobe เปิดไฟล์ที่ไม่มีจริง ได้สาเหตุภาษาไทย
    let out = run_tool(&dev_tools_dir(), "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new(r"D:\ไม่มีไฟล์นี้จริง\x.mkv")]).unwrap();
    let s = output_fail("ffprobe", &out, true);
    assert!(s.starts_with("หาไฟล์หนังหรือโฟลเดอร์ที่เก็บไม่เจอ") && !s.contains("รหัส"), "{s}");
    // จบปกติแต่ไม่ได้ไฟล์ บอกตรง ๆ ไม่บอกรหัส 0
    let ok = Output { status: { use std::os::windows::process::ExitStatusExt; ExitStatus::from_raw(0) }, stdout: vec![], stderr: vec![] };
    assert_eq!(output_fail("ffprobe", &ok, false), "ffprobe ทำงานจบแล้วแต่ไม่ได้ไฟล์ออกมา");
    // เปิด DLL ที่ไม่มีจริง Windows ตอบ 126 ได้ประโยคไทย
    let w: Vec<u16> = std::os::windows::ffi::OsStrExt::encode_wide(OsStr::new(r"D:\ไม่มีไฟล์นี้จริง\x.dll")).chain(Some(0)).collect();
    let h = unsafe { windows_sys::Win32::System::LibraryLoader::LoadLibraryW(w.as_ptr()) };
    assert!(h.is_null());
    let s = dll_reason("x.dll");
    assert!(s.starts_with("Windows หาไฟล์ x.dll หรือไฟล์ที่มันต้องใช้ไม่เจอ") && !s.contains("รหัส"), "{s}");
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
    // ต้องเป็นรุ่นที่แนบไว้ใน vendor/README.md ไม่ใช่แค่ตอบอะไรก็ได้ · ffmpeg 9.0.2 → 9.1 วันที่ 24 พ.ย. 2569 (BUGS ข้อ 158)
    let want = [("mkvmerge", "v103.0"), ("mkvextract", "v103.0"), ("mkvpropedit", "v103.0"),
                ("ffmpeg", "version 9.1-"), ("ffprobe", "version 9.1-"), ("MediaInfo", "26.10")];
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
    assert!(crate::app::winutil::kill_with_app(&child), "ผูกเครื่องมือเข้า Job Object ไม่ได้");
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
