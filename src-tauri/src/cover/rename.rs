//! เปลี่ยนชื่อไฟล์หนังจากในโปรแกรม (แผนขั้น 3 · สเปกข้อ 2 · TECH-REVIEW ข้อ 1 ข้อ 16)
//! 🔴 ห้ามเขียนทับไฟล์อื่นเด็ดขาด · ย้ายด้วย MoveFileExW ไม่ใส่ตัวเลือกแทนที่
//!    (std::fs::rename ของ Rust บน Windows ใส่ MOVEFILE_REPLACE_EXISTING ไว้ เจอชื่อซ้ำเขียนทับเงียบ ห้ามใช้กับไฟล์หนัง)
//! ตัวเช็กชื่อมีที่เดียวตรงนี้ หน้าจอเรียก check_rename ทุกครั้งที่พิมพ์ ตัวเปลี่ยนชื่อเช็กซ้ำอีกรอบก่อนย้ายจริง
//! เปลี่ยนแค่ตัวพิมพ์เล็กใหญ่ได้ (ไฟล์เดียวกัน เลขประจำไฟล์เดียวกัน ไม่นับว่าชื่อซ้ำ)
//! เลขประจำไฟล์ไม่เปลี่ยนตอนเปลี่ยนชื่อ ประวัติตรวจไฟล์จึงตามชื่อใหม่ไปเอง

use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::library::{LibraryStore, Movie};
use crate::media::probe;

/// เหตุที่เปลี่ยนชื่อไม่ได้ ส่งให้หน้าจอเลือกว่าจะขึ้นใต้ช่องพิมพ์ (ชื่อผิดกติกา ชื่อซ้ำ) หรือการ์ดแดง (ไฟล์ถูกเปิดอยู่)
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RenameProblem {
    /// empty · chars · invisible · reserved · trailing · long · duplicate · inuse · denied · missing · busy · other
    pub kind: &'static str,
    pub title: String,
    pub detail: Option<String>,
}

fn problem(kind: &'static str, title: impl Into<String>, detail: Option<String>) -> RenameProblem {
    RenameProblem { kind, title: title.into(), detail }
}

const FORBIDDEN: [char; 9] = ['\\', '/', ':', '*', '?', '"', '<', '>', '|'];
/// ชื่อที่ Windows สงวนไว้ ใช้เป็นชื่อไฟล์ไม่ได้แม้มีนามสกุลต่อท้าย (CON.mkv ก็ไม่ได้)
const RESERVED: [&str; 30] = [
    "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    "COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³",
];
/// ตัวอักษรที่มองไม่เห็น · ตัวควบคุม 0–31 Windows ห้าม · ตัวกลับทิศทางข้อความกับช่องว่างไร้ความกว้างทำให้ชื่อที่เห็นไม่ตรงกับชื่อจริง
fn invisible(c: char) -> bool {
    (c as u32) < 32 || matches!(c, '\u{200B}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}')
}
/// ที่อยู่ไฟล์ยาวได้ไม่เกินนี้ (MAX_PATH 260 รวมตัวปิดท้าย) · เกินแล้ว Explorer กับโปรแกรมเล่นหนังหลายตัวเปิดไม่ได้
pub const MAX_PATH_LEN: usize = 259;
const MAX_NAME_LEN: usize = 255;

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// เช็กชื่อใหม่ (ไม่รวมนามสกุล) · ผ่านแล้วได้ที่อยู่ใหม่ · ext คือนามสกุลเดิมพร้อมจุด ตัวพิมพ์ตามไฟล์จริง
/// ลำดับ ว่าง → ตัวอักษรต้องห้าม → มองไม่เห็น → ชื่อสงวน → ลงท้ายจุดหรือเว้นวรรค → ยาวเกิน → ชื่อซ้ำ
pub fn check_name(old: &Path, stem: &str) -> Result<PathBuf, RenameProblem> {
    let dir = old.parent().unwrap_or(Path::new(""));
    let ext = old.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();

    if stem.trim().is_empty() {
        return Err(problem("empty", "ชื่อไฟล์ว่างไม่ได้", Some("พิมพ์ชื่อไฟล์ก่อน แล้วกดบันทึกชื่อ".into())));
    }
    let mut bad: Vec<char> = vec![];
    for c in stem.chars() {
        if FORBIDDEN.contains(&c) && !bad.contains(&c) {
            bad.push(c);
        }
    }
    if !bad.is_empty() {
        let list: Vec<String> = bad.iter().map(|c| c.to_string()).collect();
        let now = if list.len() == 1 { list[0].clone() } else { format!("{} กับ {}", list[..list.len() - 1].join(" "), list[list.len() - 1]) };
        return Err(problem("chars", "ชื่อไฟล์ใช้ตัวอักษร \\ / : * ? \" < > | ไม่ได้", Some(format!("ตอนนี้มี {now}"))));
    }
    if stem.chars().any(invisible) {
        return Err(problem("invisible", "ชื่อไฟล์มีตัวอักษรที่มองไม่เห็น", Some("มักติดมาตอนคัดลอกชื่อจากที่อื่น ลบชื่อแล้วพิมพ์ใหม่".into())));
    }
    let base = stem.split('.').next().unwrap_or("").trim_end_matches(' ').to_uppercase();
    if RESERVED.contains(&base.as_str()) {
        return Err(problem("reserved", format!("ชื่อ {} ใช้ไม่ได้", stem.split('.').next().unwrap_or("").trim_end()), Some("Windows สงวนชื่อนี้ไว้ใช้เอง ตั้งชื่ออื่น".into())));
    }
    if stem.ends_with('.') || stem.ends_with(' ') {
        return Err(problem("trailing", "ชื่อไฟล์ลงท้ายด้วยจุดหรือเว้นวรรคไม่ได้", Some("ลบจุดหรือเว้นวรรคท้ายชื่อออก".into())));
    }
    let file_name = format!("{stem}{ext}");
    let name_len = utf16_len(&file_name);
    if name_len > MAX_NAME_LEN {
        return Err(problem("long", "ชื่อไฟล์ยาวเกินไป", Some(format!("ยาวได้ไม่เกิน {MAX_NAME_LEN} ตัวอักษร ตอนนี้ {name_len} ตัว"))));
    }
    let new = dir.join(&file_name);
    let path_len = utf16_len(&new.to_string_lossy());
    if path_len > MAX_PATH_LEN {
        return Err(problem("long", "ชื่อยาวเกินไป", Some(format!("ที่อยู่ไฟล์ยาวได้ไม่เกิน {MAX_PATH_LEN} ตัวอักษร ต้องสั้นลงอีก {} ตัว", path_len - MAX_PATH_LEN))));
    }
    if new.as_os_str() != old.as_os_str() && std::fs::symlink_metadata(&new).is_ok() {
        // มีของชื่อนี้อยู่แล้ว · ถ้าเป็นไฟล์เดียวกัน (เปลี่ยนแค่ตัวพิมพ์เล็กใหญ่) ยอมให้เปลี่ยน
        let same = match (crate::app::winutil::file_id(old), crate::app::winutil::file_id(&new)) {
            (Some(a), Some(b)) => a == b,
            _ => false,
        };
        if !same {
            return Err(problem("duplicate", "ในโฟลเดอร์นี้มีไฟล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น", None));
        }
    }
    Ok(new)
}

fn wide(p: &Path) -> Vec<u16> {
    p.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}

/// ที่อยู่สำหรับคำสั่งของ Windows ที่ต้องรับที่อยู่ยาวเกิน 259 ตัว (MAX_PATH) · ยาวแล้วเติม \\?\ (หรือ \\?\UNC\ ของที่อยู่บนเครือข่าย)
/// std::fs ของ Rust เติมให้เองอยู่แล้ว แต่ MoveFileExW ที่เรียกตรงไม่เติม · ไฟล์ซับชื่อยาวเขียนไฟล์ชั่วคราวได้แต่ย้ายมาแทนไม่ได้
/// หลังส่งไฟล์เดิมลงถังขยะไปแล้ว ซับหายจากโฟลเดอร์ (ผู้ช่วยตรวจทาน R2)
pub(crate) fn wide_long(p: &Path) -> Vec<u16> {
    let s = p.as_os_str().to_string_lossy();
    if s.encode_utf16().count() < 248 || !p.is_absolute() || s.starts_with(r"\\?\") { return wide(p); }
    let b = s.replace('/', "\\");
    let v = match b.strip_prefix(r"\\") { Some(rest) => format!(r"\\?\UNC\{rest}"), None => format!(r"\\?\{b}") };
    std::ffi::OsStr::new(&v).encode_wide().chain(std::iter::once(0)).collect()
}

/// ย้ายชื่อแบบไม่เขียนทับ · ปลายทางมีไฟล์อยู่แล้ว Windows ปฏิเสธเอง (ERROR_ALREADY_EXISTS) ไม่มีจังหวะให้ทับ
/// แม้ไฟล์ปลายทางโผล่มาหลังเช็กชื่อ
pub fn move_no_replace(old: &Path, new: &Path) -> Result<(), RenameProblem> {
    use windows_sys::Win32::Storage::FileSystem::MoveFileExW;
    let ok = unsafe { MoveFileExW(wide_long(old).as_ptr(), wide_long(new).as_ptr(), 0) };
    if ok != 0 {
        return Ok(());
    }
    let code = std::io::Error::last_os_error().raw_os_error().unwrap_or(0);
    Err(match code {
        32 | 33 => problem("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", Some("ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่  แถบนี้ไม่หายเอง".into())),
        80 | 183 => problem("duplicate", "ในโฟลเดอร์นี้มีไฟล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น", None),
        2 | 3 => problem("missing", "หาไฟล์ไม่เจอ", Some("ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว  กดอ่านโฟลเดอร์ใหม่  แถบนี้ไม่หายเอง".into())),
        5 => problem("denied", "เปลี่ยนชื่อไม่ได้ Windows ไม่อนุญาต", Some("ไฟล์อาจตั้งเป็นอ่านอย่างเดียว หรือโปรแกรมอื่นถือไฟล์ไว้  แถบนี้ไม่หายเอง".into())),
        19 => problem("denied", "ไดรฟ์นี้กันเขียนอยู่", Some("ปลดตัวกันเขียนของไดรฟ์ก่อน แล้วกดลองใหม่  แถบนี้ไม่หายเอง".into())),
        206 => problem("long", "ชื่อยาวเกินไป", Some("ตั้งชื่อให้สั้นลง".into())),
        // รหัสอื่นเป็นประโยคไทย ไม่ใช่แค่รหัส (BUGS ข้อ 150)
        _ => problem("other", "เปลี่ยนชื่อไม่สำเร็จ", Some(format!("{}  ไฟล์ยังชื่อเดิม  แถบนี้ไม่หายเอง", crate::app::tools::win_reason(code)))),
    })
}

/// เช็กชื่อตอนพิมพ์ · ไม่มีปัญหา = None · ชื่อเหมือนเดิมก็ None (บันทึกแล้วแค่ปิดช่องพิมพ์)
#[tauri::command]
pub fn check_rename(lib: State<'_, Arc<LibraryStore>>, id: String, stem: String) -> Option<RenameProblem> {
    let path = lib.movies.lock().unwrap().iter().find(|m| m.id == id).map(|m| PathBuf::from(&m.path))?;
    check_name(&path, &stem).err()
}

/// ระหว่างเปลี่ยนชื่อ ห้ามเริ่มอ่านโฟลเดอร์ (ผลอ่านโฟลเดอร์จะเขียนทับคลังด้วยชื่อเก่า) · หลุดขอบเขตแล้วปลดเอง
struct Exclusive<'a>(&'a LibraryStore);
impl Drop for Exclusive<'_> {
    fn drop(&mut self) {
        self.0.end_exclusive();
    }
}

/// เปลี่ยนชื่อไฟล์จริงแล้วแก้คลัง · คืนหนังเรื่องนั้นที่ชื่อใหม่ · ชื่อเหมือนเดิมคืนของเดิมโดยไม่แตะไฟล์
pub fn rename_in_library(lib: &LibraryStore, id: &str, stem: &str) -> Result<(Movie, bool), RenameProblem> {
    let Some(m) = lib.movies.lock().unwrap().iter().find(|m| m.id == id).cloned() else {
        return Err(problem("missing", "ไม่เจอเรื่องนี้ในชั้น", Some("กดอ่านโฟลเดอร์ใหม่ แล้วลองอีกครั้ง".into())));
    };
    if m.missing {
        return Err(problem("missing", "หาไฟล์ไม่เจอ", Some("ไดรฟ์อาจถอดออกอยู่ เสียบไดรฟ์แล้วกดอ่านโฟลเดอร์ใหม่  แถบนี้ไม่หายเอง".into())));
    }
    if !lib.try_begin_exclusive() {
        return Err(problem("busy", "กำลังอ่านโฟลเดอร์อยู่", Some("รอให้อ่านเสร็จก่อน แล้วกดลองใหม่".into())));
    }
    let _guard = Exclusive(lib);
    let old = PathBuf::from(&m.path);
    let new = check_name(&old, stem)?;
    if new.as_os_str() == old.as_os_str() {
        return Ok((m, false));
    }
    move_no_replace(&old, &new)?;
    let updated = lib.update_movie(id, |x| {
        x.path = new.to_string_lossy().to_string();
        x.name = stem.to_string();
        x.year = probe::year_of(stem);
    });
    Ok((updated.unwrap_or(m), true))
}

#[tauri::command]
pub fn rename_movie(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, id: String, stem: String) -> Result<Movie, RenameProblem> {
    // ระหว่างยืนยันปกหรือย้ายที่เก็บ เปลี่ยนชื่อแล้วรูปจะออกมาเป็นชื่อเก่า (ผู้ช่วยตรวจขั้น 8)
    if app.try_state::<Arc<crate::cover::link::LinkStore>>().is_some_and(|s| s.is_busy()) {
        return Err(problem("inuse", "กำลังยืนยันปกจับคู่อยู่ รอให้เสร็จก่อน", None));
    }
    let res = rename_in_library(&lib, &id, &stem);
    // คำสั่งอ่านโฟลเดอร์ที่มาระหว่างเปลี่ยนชื่อ (เช่นงานห่อเป็น MKV จบพอดี) สั่งอ่านต่อที่นี่ ทั้งเปลี่ยนชื่อสำเร็จและไม่สำเร็จ (AUDIT ข้อ 51)
    if lib.take_rescan() {
        let _ = crate::app::library::scan_library(app.clone(), app.state::<Arc<LibraryStore>>());
    }
    let (mut m, changed) = res?;
    if changed {
        // รูปที่โปรแกรมคัดลอกไว้ข้างไฟล์หนัง เปลี่ยนชื่อตาม (แผนจับคู่รูปปก)
        if !m.linked.is_empty() {
            let new_path = PathBuf::from(&m.path);
            if let Some(up) = lib.update_movie(&id, |x| crate::cover::link::rename_beside(x, &new_path)) { m = up; }
        }
        let _ = app.emit("movie-updated", &m);
        // ไฟล์เปลี่ยนชื่อแล้วจริง · บันทึกคลังไม่สำเร็จก็ยังนับว่าเปลี่ยนชื่อสำเร็จ อ่านโฟลเดอร์ครั้งหน้าคลังตามทันเอง (จำด้วยเลขประจำไฟล์)
        if let Err(e) = lib.save() {
            let _ = app.emit("library-error", e);
        }
    }
    Ok(m)
}

#[cfg(test)]
#[path = "rename_tests.rs"]
mod tests;
