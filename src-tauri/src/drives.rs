//! ความจุไดรฟ์ที่โฟลเดอร์หนังอยู่ กับไดรฟ์ที่โปรแกรมเก็บข้อมูลของตัวเอง (BUGS ข้อ 88 พี่กันแทรก 13 พ.ย. 2569
//! "เราขอเพิ่มที่หน้าตั้งค่า หัวข้อโฟลเด้อหนัง เเสดงความจุของไดรฟ์ที่ฟลเด้ออหนังใช้อยู่ด้วย เเละถ้าเนื้อที่เหลือ 10% ไปเตือนที่หน้าชั้นวาง")
//! อ่านอย่างเดียว ไม่เขียนอะไรลงไดรฟ์ · ไดรฟ์ที่ถอดออกอยู่ข้ามไป หน้าจอบอกเรื่องโฟลเดอร์หายเองอยู่แล้ว

use std::path::Path;

use serde::Serialize;
use tauri::Manager;

use crate::outfile::wide;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveSpace {
    /// รากของไดรฟ์ เช่น "D:\" หรือ "\\NAS\หนัง\"
    pub root: String,
    pub total: u64,
    pub free: u64,
    /// โฟลเดอร์หนังที่อยู่บนไดรฟ์นี้ ตามลำดับในหน้าตั้งค่า
    pub folders: Vec<String>,
    /// ไดรฟ์นี้เป็นที่โปรแกรมเก็บค่าตั้ง คลังหนัง และภาพปก
    pub app: bool,
}

/// รากของไดรฟ์ที่ที่อยู่นี้อยู่ · ใช้ GetVolumePathNameW ไดรฟ์ที่ต่อเป็นโฟลเดอร์ก็ได้รากที่ถูก
fn volume_root(p: &Path) -> Option<String> {
    use windows_sys::Win32::Storage::FileSystem::GetVolumePathNameW;
    let mut buf = [0u16; 1024];
    let ok = unsafe { GetVolumePathNameW(wide(p).as_ptr(), buf.as_mut_ptr(), buf.len() as u32) };
    if ok == 0 { return None; }
    let n = buf.iter().position(|&c| c == 0).unwrap_or(0);
    Some(String::from_utf16_lossy(&buf[..n]))
}

/// ที่ว่างกับความจุทั้งหมด · อ่านไม่ได้ (ไดรฟ์ถอดออก) คืน None
fn space_of(root: &str) -> Option<(u64, u64)> {
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
    let (mut free, mut total) = (0u64, 0u64);
    let ok = unsafe { GetDiskFreeSpaceExW(wide(Path::new(root)).as_ptr(), &mut free, &mut total, std::ptr::null_mut()) };
    (ok != 0 && total > 0).then_some((free, total))
}

/// รวมโฟลเดอร์ที่อยู่ไดรฟ์เดียวกันเป็นแถวเดียว ไดรฟ์ของโปรแกรมต่อท้ายถ้ายังไม่มี
pub fn drives_for(folders: &[String], app_dir: Option<&Path>) -> Vec<DriveSpace> {
    let mut out: Vec<DriveSpace> = vec![];
    let mut add = |root: String, folder: Option<&String>, app: bool| {
        let i = match out.iter().position(|d| d.root.eq_ignore_ascii_case(&root)) {
            Some(i) => i,
            None => {
                let Some((free, total)) = space_of(&root) else { return };
                out.push(DriveSpace { root, total, free, folders: vec![], app: false });
                out.len() - 1
            }
        };
        if let Some(f) = folder { out[i].folders.push(f.clone()); }
        out[i].app |= app;
    };
    for f in folders {
        if !Path::new(f).is_dir() { continue; }
        if let Some(r) = volume_root(Path::new(f)) { add(r, Some(f), false); }
    }
    if let Some(r) = app_dir.and_then(volume_root) { add(r, None, true); }
    out
}

#[tauri::command]
pub async fn drive_space(app: tauri::AppHandle, folders: Vec<String>) -> Result<Vec<DriveSpace>, String> {
    let app_dir = app.path().app_data_dir().ok();
    tauri::async_runtime::spawn_blocking(move || drives_for(&folders, app_dir.as_deref())).await.map_err(|e| e.to_string())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FreeInfo {
    pub free: u64,
    /// ตัวอักษรไดรฟ์ เช่น "D"
    pub drive: String,
}

/// ที่ว่างของไดรฟ์ที่จะเขียนไฟล์ ใช้เตือนข้างปุ่มเริ่มก่อนกด (BUGS ข้อ 94 พี่กันสั่ง 13 พ.ย. 2569 "ถ้ารันไฟล์ไปแล้วเนื้อที่เต็มแน่ ๆ ต้องบอกนะ")
/// ส่งได้ทั้งไฟล์และโฟลเดอร์ ไฟล์ใช้โฟลเดอร์ของมัน โฟลเดอร์ที่ยังไม่มีใช้โฟลเดอร์แม่ที่มีอยู่ · ใช้ free_space ตัวเดียวกับที่งานเช็กตอนเริ่ม ตัวเลขจึงตรงกัน
#[tauri::command]
pub fn drive_free(path: String) -> FreeInfo {
    let mut p = std::path::PathBuf::from(&path);
    if p.is_file() { p.pop(); }
    while !p.as_os_str().is_empty() && !p.is_dir() { if !p.pop() { break; } }
    FreeInfo { free: crate::outfile::free_space(&p), drive: crate::outfile::drive_letter(&p) }
}

/// เปิดรากไดรฟ์ใน Explorer จากคำเตือนไดรฟ์ใกล้เต็มบนชั้นวาง (BUGS ข้อ 88 พี่กันสั่ง 13 พ.ย. 2569 "ให้กดเเล้วเปิดโฟลเด้อไดรฟื C เลย")
/// เปิดได้เฉพาะรากไดรฟ์ที่โฟลเดอร์หนังหรือโปรแกรมใช้อยู่ หน้าจอส่งที่อยู่อื่นมาเปิดไม่ได้ (แบบเดียวกับ encoders_open_page)
#[tauri::command]
pub fn drive_open(app: tauri::AppHandle, store: tauri::State<'_, crate::store::SettingsStore>, root: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let folders = store.current.lock().unwrap().folders.clone();
    let app_dir = app.path().app_data_dir().ok();
    let ok = drives_for(&folders, app_dir.as_deref()).into_iter().any(|d| d.root.eq_ignore_ascii_case(&root));
    if !ok { return Err("ไดรฟ์นี้ไม่ได้อยู่ในรายการความจุไดรฟ์".into()); }
    app.opener().open_path(&root, None::<&str>).map_err(|e| format!("เปิดไดรฟ์ไม่ได้: {e}"))
}

/// ข้อผิดพลาดตอนเขียนไฟล์ที่เกิดจากไดรฟ์เต็ม (ERROR_DISK_FULL 112 · ERROR_HANDLE_DISK_FULL 39) · ใช้บอกผู้ใช้ตรง ๆ ว่าไดรฟ์เต็ม (BUGS ข้อ 88 ①)
pub fn is_disk_full(e: &std::io::Error) -> bool {
    matches!(e.raw_os_error(), Some(112) | Some(39)) || e.kind() == std::io::ErrorKind::StorageFull
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn groups_folders_by_drive_and_skips_missing() {
        let tmp = std::env::temp_dir();
        let a = tmp.join(format!("ชั้นหนัง-ไดรฟ์-ก-{}", std::process::id()));
        let b = tmp.join(format!("ชั้นหนัง-ไดรฟ์-ข-{}", std::process::id()));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        let fa = a.to_string_lossy().to_string();
        let fb = b.to_string_lossy().to_string();
        let gone = "Q:\\ไม่มีไดรฟ์นี้\\หนัง".to_string();
        let ds = drives_for(&[fa.clone(), gone, fb.clone()], Some(&tmp));
        assert_eq!(ds.len(), 1, "สองโฟลเดอร์ไดรฟ์เดียวกันกับไดรฟ์ของโปรแกรมรวมเป็นแถวเดียว ไดรฟ์ที่ไม่มีข้ามไป");
        assert_eq!(ds[0].folders, vec![fa, fb]);
        assert!(ds[0].app);
        assert!(ds[0].total > 0 && ds[0].free <= ds[0].total);
        assert!(ds[0].root.ends_with('\\'));
        let _ = std::fs::remove_dir_all(&a);
        let _ = std::fs::remove_dir_all(&b);
    }

    #[test]
    fn detects_disk_full_errors() {
        assert!(is_disk_full(&std::io::Error::from_raw_os_error(112)));
        assert!(is_disk_full(&std::io::Error::from_raw_os_error(39)));
        assert!(!is_disk_full(&std::io::Error::from_raw_os_error(5)));
    }
}
