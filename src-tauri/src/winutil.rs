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
use windows_sys::Win32::UI::WindowsAndMessaging::{
    SetWindowPos, ShowWindow, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
};

/// แสดงหน้าต่างโดยไม่แย่งโฟกัส แล้วส่งไปอยู่หลังหน้าต่างอื่นทั้งหมด
/// ใช้ตอนแคลร์เปิดโปรแกรมเทส (scripts/dev-app.ps1) ไม่ให้เด้งขึ้นมาบังงานของพี่กัน (พี่กันขอ 6 พ.ย. 2569)
/// ตัวติดตั้งจริงไม่ใช้ เปิดแล้วขึ้นหน้าตามปกติ
pub fn show_behind(w: &tauri::WebviewWindow) {
    match w.hwnd() {
        Ok(h) => unsafe {
            let h = h.0 as HWND;
            ShowWindow(h, SW_SHOWNOACTIVATE);
            SetWindowPos(h, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        },
        Err(_) => {
            let _ = w.show();
        }
    }
}
