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
    crate::app::winutil::kill_with_app(&child);
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

/// เครื่องมือทำไม่สำเร็จ (BUGS ข้อ 150 พี่กันสั่ง "เขียนเป็นภาษาคนด้วยว่ามันจากสาเหตุอะไร ไม่ใช่เเค่บอกว่าไม่สำเร็จ")
/// why ประโยคไทยบอกสาเหตุ · detail บรรทัดสุดท้ายที่เครื่องมือพิมพ์ หน้าจอใส่ในปุ่ม ⓘ · known เป็นเท็จเมื่อแปลสาเหตุไม่ได้
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ToolFail {
    pub why: String,
    pub detail: Option<String>,
    pub known: bool,
}

impl From<String> for ToolFail {
    fn from(why: String) -> Self {
        ToolFail { why, detail: None, known: true }
    }
}

impl From<&str> for ToolFail {
    fn from(why: &str) -> Self {
        why.to_string().into()
    }
}

impl ToolFail {
    /// ข้อความบรรทัดเดียวสำหรับจุดที่ไม่มีปุ่ม ⓘ · แปลไม่ได้ต่อท้ายข้อความของเครื่องมือในวงเล็บ
    pub fn line(&self) -> String {
        match (&self.detail, self.known) {
            (Some(d), false) => format!("{} ({d})", self.why),
            _ => self.why.clone(),
        }
    }
}

/// บรรทัดที่เครื่องมือพิมพ์ ไม่นับความคืบหน้า · ตัดป้าย #GUI#error #GUI#warning ของ MKVToolNix แบบ --gui-mode และคำนำหน้า Error: Warning: ออก
pub fn tool_lines(text: &str) -> Vec<String> {
    text.split(['\n', '\r'])
        .flat_map(|l| l.split("Progress: "))
        .map(str::trim)
        .filter(|l| !l.is_empty() && !l.starts_with("#GUI#progress") && !l.starts_with("#GUI#begin_scanning") && !l.starts_with("#GUI#end_scanning") && !l.trim_end_matches('%').chars().all(|c| c.is_ascii_digit()))
        .map(|l| {
            let l = l.strip_prefix("#GUI#error ").or_else(|| l.strip_prefix("#GUI#warning ")).unwrap_or(l);
            let l = l.strip_prefix("Error: ").or_else(|| l.strip_prefix("Warning: ")).unwrap_or(l);
            l.trim().to_string()
        })
        .filter(|l| !l.is_empty())
        .collect()
}

/// ที่อยู่ไฟล์ในข้อความของเครื่องมือเหลือแค่ชื่อไฟล์ · ที่อยู่ยาวตัดบรรทัดไม่ได้ กล่อง ⓘ กระจายตัวอักษรจนถ่าง (เจอ 16 พ.ย. 2569)
/// ในเครื่องหมาย ' ' แบบ mkvextract กับคำที่ขึ้นต้นด้วยไดรฟ์แบบ ffmpeg
pub fn short_paths(line: &str) -> String {
    let base = |p: &str| p.rsplit(['/', '\\']).next().unwrap_or(p).to_string();
    let is_path = |p: &str| p.len() > 3 && p.as_bytes()[1] == b':' && matches!(p.as_bytes()[2], b'/' | b'\\');
    let quoted: Vec<String> = line.split('\'').enumerate().map(|(i, s)| if i % 2 == 1 && (s.contains('/') || s.contains('\\')) { base(s) } else { s.to_string() }).collect();
    quoted.join("'").split(' ').map(|w| { let t = w.trim_end_matches([':', '.', ',']); if is_path(t) { format!("{}{}", base(t), &w[t.len()..]) } else { w.to_string() } }).collect::<Vec<_>>().join(" ")
}

/// แปลสาเหตุที่ mkvextract mkvmerge ffmpeg ffprobe ทำไม่สำเร็จเป็นประโยคไทย จากข้อความที่มันพิมพ์ (BUGS ข้อ 150)
/// status None = เครื่องมือจบปกติแต่ไม่ได้ไฟล์ที่ควรได้ · เดิมขึ้นแค่รหัส เช่น "แยกไม่สำเร็จ (รหัส 0)" ซึ่งขัดกันเอง เพราะรหัส 0 แปลว่าจบปกติ
pub fn explain_fail(tool: &str, lines: &[String], status: Option<&ExitStatus>) -> ToolFail {
    let all = lines.join("\n").to_lowercase();
    let has = |keys: &[&str]| keys.iter().any(|k| all.contains(k));
    let detail = lines.last().map(|l| short_paths(l)).or_else(|| status.map(|s| format!("{tool} ตอบรหัส {}", exit_text(s))));
    let known = |why: String| ToolFail { why, detail: detail.clone(), known: true };
    if has(&["no space left", "not enough space", "disk full", "disk is full", "enospc"]) {
        return known("พื้นที่ในไดรฟ์ที่เก็บเต็ม ลบไฟล์ที่ไม่ใช้หรือเปลี่ยนที่เก็บ แล้วลองใหม่".into());
    }
    if has(&["permission denied", "access is denied", "access denied", "operation not permitted"]) {
        return known("Windows ไม่ให้เขียนไฟล์ลงที่เก็บนี้ ซึ่งโฟลเดอร์อาจตั้งเป็นอ่านอย่างเดียว หรือโปรแกรมอื่นถือไฟล์ไว้ ลองเปลี่ยนที่เก็บ".into());
    }
    if has(&["device is not ready", "network name is no longer available", "network path was not found", "input/output error", "i/o error", "semaphore timeout", "device does not recognize", "write protected", "cyclic redundancy"]) {
        return known("อ่านหรือเขียนไดรฟ์ไม่ได้กลางคัน ไดรฟ์อาจหลุดหรือถูกถอดออก เสียบให้แน่นแล้วลองใหม่".into());
    }
    if has(&["filename too long", "file name too long", "path too long", "name is too long"]) {
        return known("ที่อยู่ไฟล์ยาวเกินที่ Windows รับ เปลี่ยนที่เก็บเป็นโฟลเดอร์ที่สั้นกว่า แล้วลองใหม่".into());
    }
    if has(&["out of memory", "cannot allocate memory", "bad_alloc", "not enough memory"]) {
        return known("หน่วยความจำของเครื่องไม่พอ ปิดโปรแกรมอื่นแล้วลองใหม่".into());
    }
    if has(&["no track with the id", "matches no streams"]) {
        return known("ไม่เจอแทร็กนี้ในไฟล์ ไฟล์อาจถูกแก้หลังจากที่เปิดอ่าน ลองเปิดไฟล์ใหม่อีกครั้ง".into());
    }
    if has(&["not supported", "unsupported", "could not find tag for codec", "not currently supported in container", "unable to choose an output format", "not a suitable output format", "unknown codec"]) {
        return known(format!("แทร็กนี้เป็นชนิดที่ {tool} แยกออกเป็นไฟล์แบบนี้ไม่ได้"));
    }
    // ข้อความจริง mkvextract "Failed to create the file '…': 0 (create_directory() failed)" · ffmpeg "Error opening output files: No such file or directory"
    if has(&["failed to create the file", "create_directory", "could not be opened for writing", "could not open output", "error opening output", "open file error"]) {
        return known("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้ โฟลเดอร์ที่เก็บอาจหายไปหรือเขียนไม่ได้ หรือโปรแกรมอื่นเปิดไฟล์ชื่อนี้อยู่".into());
    }
    if has(&["end of file", "invalid data found", "exceeds containing master element", "error in the matroska", "ebml", "truncat", "corrupt", "moov atom not found", "premature", "unexpected end", "error while decoding"]) {
        return known("ไฟล์หนังเสียหรือดาวน์โหลดมาไม่ครบ ข้อมูลบางช่วงในไฟล์ขาดหรือผิดรูปแบบ".into());
    }
    if has(&["no such file or directory", "could not be found", "cannot find the file", "cannot find the path"]) {
        return known("หาไฟล์หนังหรือโฟลเดอร์ที่เก็บไม่เจอ ไฟล์อาจถูกย้าย ถูกลบ หรือไดรฟ์ถูกถอดออก".into());
    }
    match status {
        None => known(format!("{tool} ทำงานจบแล้วแต่ไม่ได้ไฟล์ออกมา")),
        // Windows ให้รหัสเสมอ โปรแกรมที่พังหรือโดนปิดได้รหัสแบบ 0xC0000005 0xC000013A
        Some(s) if s.code().is_none_or(|c| (c as u32) >= 0xC000_0000) => known(format!("{tool} พังหรือถูกปิดกลางคัน เช่น โดนโปรแกรมป้องกันไวรัสหยุด หรือหน่วยความจำของเครื่องไม่พอ")),
        Some(_) => ToolFail { why: format!("{tool} หยุดเพราะเจอปัญหาที่โปรแกรมแปลเป็นภาษาไทยไม่ได้"), detail, known: false },
    }
}

/// สาเหตุเป็นประโยคไทยจากผลของเครื่องมือที่รันจบแล้ว (stdout กับ stderr) · made = ได้ไฟล์ที่ควรได้ไหม จบปกติแต่ไม่ได้ไฟล์บอกตรง ๆ (BUGS ข้อ 150)
pub fn output_fail(tool: &str, out: &Output, made: bool) -> String {
    let mut lines = tool_lines(&String::from_utf8_lossy(&out.stdout));
    lines.extend(tool_lines(&String::from_utf8_lossy(&out.stderr)));
    let status = if tool_succeeded(tool, &out.status) && !made { None } else { Some(&out.status) };
    explain_fail(tool, &lines, status).line()
}

/// รหัสของ Windows เป็นประโยคไทย (BUGS ข้อ 150) · รหัสที่ไม่รู้จักใช้ข้อความของ Windows เอง
pub fn win_reason(code: i32) -> String {
    match code {
        2 | 3 => "หาไฟล์หรือโฟลเดอร์ไม่เจอ ไดรฟ์อาจถูกถอดออก หรือไฟล์ถูกย้ายไปแล้ว".into(),
        5 => "Windows ไม่อนุญาต ไฟล์อาจตั้งเป็นอ่านอย่างเดียว หรือโปรแกรมอื่นถือไฟล์ไว้".into(),
        19 => "ไดรฟ์นี้กันเขียนอยู่".into(),
        21 => "ไดรฟ์ยังไม่พร้อม อาจถูกถอดออกหรือหลุด".into(),
        23 | 1117 => "อ่านหรือเขียนไดรฟ์ไม่ได้ ไดรฟ์อาจหลุดหรือเสีย".into(),
        32 | 33 => "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น ปิดโปรแกรมนั้นก่อน".into(),
        39 | 112 => "พื้นที่ในไดรฟ์เต็ม".into(),
        206 => "ชื่อหรือที่อยู่ไฟล์ยาวเกินที่ Windows รับ".into(),
        c => format!("Windows ตอบว่า {}", std::io::Error::from_raw_os_error(c)),
    }
}

/// เปิดไฟล์ DLL ที่แนบมาไม่ได้ เป็นประโยคไทยจากรหัสของ Windows ล่าสุด (BUGS ข้อ 150) · เรียกต่อจาก LoadLibrary ทันที
pub fn dll_reason(name: &str) -> String {
    match std::io::Error::last_os_error().raw_os_error().unwrap_or(0) {
        126 => format!("Windows หาไฟล์ {name} หรือไฟล์ที่มันต้องใช้ไม่เจอ ลองติดตั้งโปรแกรมใหม่"),
        193 => format!("ไฟล์ {name} เสียหรือเป็นรุ่นที่ใช้กับเครื่องนี้ไม่ได้ ลองติดตั้งโปรแกรมใหม่"),
        5 => format!("Windows ไม่ให้เปิดไฟล์ {name} ซึ่งโปรแกรมป้องกันไวรัสอาจกันไว้"),
        1114 => format!("ไฟล์ {name} เริ่มทำงานไม่ได้ ลองติดตั้งโปรแกรมใหม่"),
        c => format!("{} ลองติดตั้งโปรแกรมใหม่", win_reason(c)),
    }
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
                version: output_fail(name, &out, true),
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
#[path = "tools_tests.rs"]
mod tests;
