//! เรื่องเฉพาะของ Windows ที่ Tauri ไม่มีให้

use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use std::path::Path;
use std::sync::OnceLock;

use windows_sys::Win32::Foundation::{HANDLE, HWND};
use windows_sys::Win32::Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION};
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

/// Job Object ตัวเดียวของโปรแกรม ปิดโปรแกรม (หรือโปรแกรมพัง) = Windows ปิด handle ให้ = เครื่องมือในนี้ตายหมด
/// กัน ffmpeg ค้างถือไฟล์ .partial หลังโปรแกรมพัง (TECH-REVIEW ข้อ 9)
/// ใส่เฉพาะเครื่องมือเบื้องหลัง ไม่ใส่โปรแกรมเล่นหนังที่เปิดให้ผู้ใช้ ไม่งั้นปิดชั้นหนังแล้วหนังที่ดูอยู่ปิดตาม
fn tool_job() -> HANDLE {
    *JOB.get_or_init(|| unsafe {
        let h = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(
            h,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        h as usize
    }) as HANDLE
}
static JOB: OnceLock<usize> = OnceLock::new();

/// ผูกเครื่องมือที่เพิ่งเปิดไว้กับโปรแกรม โปรแกรมปิดเมื่อไหร่ เครื่องมือตายตาม
pub fn kill_with_app(child: &std::process::Child) -> bool {
    unsafe { AssignProcessToJobObject(tool_job(), child.as_raw_handle() as HANDLE) != 0 }
}

/// เลขประจำไฟล์ของ Windows (เลขไดรฟ์ + เลขไฟล์) คงเดิมแม้เปลี่ยนชื่อหรือย้ายในไดรฟ์เดียวกัน
/// ใช้จำว่าไฟล์ที่ชื่อเปลี่ยนใน Explorer คือเรื่องเดิม ประวัติไม่หาย (TECH-REVIEW ข้อ 12)
/// เปิดแบบขออ่านแค่ข้อมูลไฟล์ ยอมให้โปรแกรมอื่นอ่าน เขียน ลบ ไม่ไปกันใคร
pub fn file_id(path: &Path) -> Option<String> {
    const FILE_READ_ATTRIBUTES: u32 = 0x80;
    let f = std::fs::OpenOptions::new().access_mode(FILE_READ_ATTRIBUTES).share_mode(7).open(path).ok()?;
    unsafe {
        let mut info: BY_HANDLE_FILE_INFORMATION = std::mem::zeroed();
        if GetFileInformationByHandle(f.as_raw_handle() as HANDLE, &mut info) == 0 {
            return None;
        }
        Some(format!("{:08x}-{:08x}{:08x}", info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow))
    }
}

/// ไฟล์ exe ของโปรแกรมหลักที่ Windows ใช้เปิดไฟล์นามสกุลนี้ เช่น ".mkv" (TECH-REVIEW ข้อ 14)
/// None = ไม่ได้ตั้งโปรแกรมหลัก · ถามไม่ได้ · หรือได้ของที่ไม่ใช่ไฟล์ exe ที่มีอยู่จริง (แอปแบบ Store บางตัว)
pub fn default_app_for(ext: &str) -> Option<std::path::PathBuf> {
    use std::os::windows::ffi::OsStrExt;
    // ASSOCF_INIT_IGNOREUNKNOWN ไม่ได้ตั้งโปรแกรมไว้ให้ตอบว่าไม่มี · ไม่ใส่ Windows ตอบเป็นหน้าต่างเลือกโปรแกรมที่จะเปิด (เจอตอนเทส 7 พ.ย. 2569)
    use windows_sys::Win32::UI::Shell::{AssocQueryStringW, ASSOCF_INIT_IGNOREUNKNOWN, ASSOCF_NOTRUNCATE, ASSOCSTR_EXECUTABLE};
    let ext: Vec<u16> = std::ffi::OsStr::new(ext).encode_wide().chain(Some(0)).collect();
    let mut buf = vec![0u16; 2048];
    let mut len = buf.len() as u32;
    let hr = unsafe { AssocQueryStringW(ASSOCF_NOTRUNCATE | ASSOCF_INIT_IGNOREUNKNOWN, ASSOCSTR_EXECUTABLE, ext.as_ptr(), std::ptr::null(), buf.as_mut_ptr(), &mut len) };
    if hr != 0 {
        return None;
    }
    let n = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let p = std::path::PathBuf::from(String::from_utf16_lossy(&buf[..n]).trim());
    let is_exe = p.extension().map(|e| e.eq_ignore_ascii_case("exe")).unwrap_or(false);
    (is_exe && p.is_file()).then_some(p)
}

use windows_sys::Win32::UI::WindowsAndMessaging::{SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE};

/// แสดงหน้าต่างโดยไม่แย่งโฟกัส แล้วส่งไปอยู่หลังหน้าต่างอื่นทั้งหมด
/// ใช้ตอนแคลร์เปิดโปรแกรมเทส (scripts/dev-app.ps1) ไม่ให้เด้งขึ้นมาบังงานของพี่กัน (พี่กันขอ 6 พ.ย. 2569)
/// ตัวติดตั้งจริงไม่ใช้ เปิดแล้วขึ้นหน้าตามปกติ
///
/// 🔴 ต้องให้ Tauri เป็นคนแสดงหน้าต่าง (w.show) ห้ามใช้ ShowWindow ของ Windows ตรง ๆ
/// ตัวจัดหน้าต่าง tao จำเองว่าหน้าต่างเปิดอยู่ไหม แสดงตรง ๆ แล้ว tao ยังจำว่าซ่อน
/// พอกดขยายหรือย่อ tao เขียนค่าหน้าต่างใหม่แล้วสั่ง SW_HIDE ตามที่จำไว้ หน้าต่างหายไปเหมือนโปรแกรมปิด
/// (tao window_state.rs apply_diff · พี่กันเจอ 7 พ.ย. 2569 *"จริงๆนะะ เรากดขยายจอ เเล้วมันปิดโปรแกรมมมม"*)
/// ไม่ให้แย่งโฟกัส ตั้งหน้าต่างเป็นแบบกดแล้วไม่รับโฟกัสก่อนแสดง (WS_EX_NOACTIVATE) · ยังขึ้นแถบงาน กดที่แถบงานแล้วพิมพ์ได้
pub fn show_behind(w: &tauri::WebviewWindow) {
    let _ = w.set_focusable(false);
    let _ = w.show();
    if let Ok(h) = w.hwnd() {
        unsafe {
            SetWindowPos(h.0 as HWND, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}
