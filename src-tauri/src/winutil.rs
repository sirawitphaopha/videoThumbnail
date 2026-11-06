//! เรื่องเฉพาะของ Windows ที่ Tauri ไม่มีให้

use windows_sys::Win32::Foundation::HWND;
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
