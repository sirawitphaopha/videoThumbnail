//! เล่นหนังในหน้าแก้ซับด้วย mpv แบบ Subtitle Edit (BUGS ข้อ 111 · พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้")
//! เรียก libmpv-2.dll ตรง (โหลดตอนใช้ครั้งแรกแบบ MACDll64.dll ใน ape.rs ไม่ต้องมีไฟล์ .lib ตอนสร้าง) · mpv ถอดภาพด้วยการ์ดจอ เต็มความละเอียด
//! เสียงออกลำโพงจาก mpv เอง วาดซับ ASS เองแบบโปรแกรมเล่นจริง
//! ภาพ: หน้าต่างลูก (child window) ของหน้าต่างโปรแกรม วางทับตรงกรอบวิดีโอของหน้าแก้ซับ อยู่เหนือหน้าจอของโปรแกรม (WebView2) ให้ mpv วาดลงไป (ตัวเลือก wid)
//!   หน้าต่างลูกกับหน้าต่างที่ mpv สร้างข้างในตั้งเป็นแบบปิดรับเมาส์ (WS_DISABLED) คลิกโดนภาพแล้วไม่แย่งโฟกัสคีย์บอร์ดไปจากหน้าจอโปรแกรม คีย์ลัดยังใช้ได้
//!   หน้าจอส่งตำแหน่งกรอบมาทุกครั้งที่ขยับ ภาพที่ซูมเกินกรอบส่งค่าซูมกับเลื่อนภาพมาด้วย ให้ภาพตรงกับภาพนิ่ง
//! ซับ: ข้อความทั้งไฟล์ของซับที่กำลังแก้ ส่งให้ mpv ผ่าน memory:// ในหน่วยความจำ ไม่เขียนไฟล์
//! ไม่เขียนไฟล์ ไม่แปลงไฟล์ ไม่แก้ภาพหรือเสียงของหนัง (พี่กันย้ำ) · mpv ไม่อ่านค่าตั้งของผู้ใช้ (config=no) ไม่โหลดซับหรือเสียงข้างไฟล์เอง ไม่จำตำแหน่ง
//! mpv หนึ่งตัวใช้ตลอดโปรแกรม เปิดครั้งแรกที่กดเล่น · หยุดแล้วซ่อนหน้าต่าง ไม่ปิด mpv · ไฟล์เดิมเล่นต่อด้วยการ seek ไม่เปิดไฟล์ใหม่
//! กุญแจ: ที่จับของ mpv เป็นของคัดลอกได้ ถือกุญแจแค่ตอนหยิบ (คำสั่งที่รันบนเธรดหลักไม่รอคำสั่งเล่นที่กำลังเปิดไฟล์)
//!   การย้ายหน้าต่างจากเธรดอื่นใช้ SWP_ASYNCWINDOWPOS ไม่รอเธรดหลัก

use std::ffi::{c_char, c_int, c_void, CStr, CString, OsStr};
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use windows_sys::Win32::Foundation::{HMODULE, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, EnumChildWindows, GetWindowLongPtrW, RegisterClassW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, HTTRANSPARENT, HWND_TOP,
    SWP_ASYNCWINDOWPOS, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_SHOWWINDOW, WM_NCHITTEST, WNDCLASSW, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_DISABLED,
};

use crate::tools::tools_dir;

type FCreate = unsafe extern "C" fn() -> *mut c_void;
type FInit = unsafe extern "C" fn(*mut c_void) -> c_int;
type FSetStr = unsafe extern "C" fn(*mut c_void, *const c_char, *const c_char) -> c_int;
type FCmd = unsafe extern "C" fn(*mut c_void, *mut *const c_char) -> c_int;
type FGetStr = unsafe extern "C" fn(*mut c_void, *const c_char) -> *mut c_char;
type FFree = unsafe extern "C" fn(*mut c_void);

/// ที่จับของ mpv กับคำสั่งที่ใช้ · คัดลอกได้ ถือกุญแจแค่ตอนหยิบ
#[derive(Clone, Copy)]
struct Mpv {
    h: *mut c_void,
    set_prop: FSetStr,
    cmd: FCmd,
    get: FGetStr,
    free: FFree,
    /// หน้าต่างลูกที่ mpv วาดภาพ (HWND เป็นเลข)
    wnd: isize,
}
// client API ของ mpv ปลอดภัยต่อเธรด เรียกจากหลายเธรดพร้อมกันได้
unsafe impl Send for Mpv {}

static MPV: OnceLock<Mutex<Option<Mpv>>> = OnceLock::new();
fn slot() -> &'static Mutex<Option<Mpv>> { MPV.get_or_init(|| Mutex::new(None)) }
/// ที่จับของ mpv ที่เปิดแล้ว (ยังไม่เคยกดเล่น = None)
fn cur() -> Option<Mpv> { *slot().lock().ok()? }

/// เลขแทร็กซับที่เพิ่มจากซับที่กำลังแก้ ไว้เอาออกก่อนใส่ฉบับใหม่
static SUB_ID: Mutex<Option<i64>> = Mutex::new(None);
/// คำสั่งเล่นทำทีละคำสั่ง (กดเล่นซ้ำเร็ว ๆ ไม่เปิดไฟล์ซ้อนกัน) · คำสั่งอื่นไม่รอกุญแจนี้
static PLAY: Mutex<()> = Mutex::new(());

fn wide(s: &OsStr) -> Vec<u16> { s.encode_wide().chain(std::iter::once(0)).collect() }
fn cs(s: &str) -> CString { CString::new(s.replace('\0', "")).unwrap_or_default() }

impl Mpv {
    fn set(&self, name: &str, v: &str) -> Result<(), String> {
        let r = unsafe { (self.set_prop)(self.h, cs(name).as_ptr(), cs(v).as_ptr()) };
        if r < 0 { Err(format!("ตั้งค่า {name} ของ mpv ไม่ได้ (รหัส {r})")) } else { Ok(()) }
    }
    fn get(&self, name: &str) -> Option<String> {
        let p = unsafe { (self.get)(self.h, cs(name).as_ptr()) };
        if p.is_null() { return None; }
        let s = unsafe { CStr::from_ptr(p) }.to_string_lossy().to_string();
        unsafe { (self.free)(p as *mut c_void) };
        Some(s)
    }
    fn command(&self, args: &[&str]) -> Result<(), String> {
        let owned: Vec<CString> = args.iter().map(|a| cs(a)).collect();
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        let r = unsafe { (self.cmd)(self.h, ptrs.as_mut_ptr()) };
        if r < 0 { Err(format!("mpv ทำคำสั่ง {} ไม่ได้ (รหัส {r})", args.first().copied().unwrap_or(""))) } else { Ok(()) }
    }
    /// ซูมกับเลื่อนภาพ (ภาพที่ซูมเกินกรอบ หน้าจอคิดมาให้) · zoom เป็น log2 ของตัวคูณ pan เป็นสัดส่วนของความกว้างหรือสูงของภาพ
    fn view(&self, zoom: f64, pan_x: f64, pan_y: f64) {
        let _ = self.set("video-zoom", &format!("{zoom:.5}"));
        let _ = self.set("video-pan-x", &format!("{pan_x:.5}"));
        let _ = self.set("video-pan-y", &format!("{pan_y:.5}"));
    }
}

/// เมาส์ที่ชี้บนหน้าต่างลูกผ่านลงไป
unsafe extern "system" fn wnd_proc(h: HWND, msg: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    if msg == WM_NCHITTEST { return HTTRANSPARENT as LRESULT; }
    unsafe { DefWindowProcW(h, msg, w, l) }
}

/// หน้าต่างลูกพื้นดำของหน้าต่างโปรแกรม (สร้างบนเธรดหลักที่มีวงรับข้อความ) ซ่อนไว้ก่อน ปิดรับเมาส์และคีย์บอร์ด
fn create_child(parent: isize) -> isize {
    unsafe {
        let class = wide(OsStr::new("MovieShelfMpvView"));
        let inst = GetModuleHandleW(std::ptr::null());
        let wc = WNDCLASSW {
            style: 0, lpfnWndProc: Some(wnd_proc), cbClsExtra: 0, cbWndExtra: 0, hInstance: inst, hIcon: std::ptr::null_mut(), hCursor: std::ptr::null_mut(),
            hbrBackground: windows_sys::Win32::Graphics::Gdi::GetStockObject(windows_sys::Win32::Graphics::Gdi::BLACK_BRUSH) as _,
            lpszMenuName: std::ptr::null(), lpszClassName: class.as_ptr(),
        };
        RegisterClassW(&wc);
        let title = wide(OsStr::new("mpv"));
        CreateWindowExW(0, class.as_ptr(), title.as_ptr(), WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | WS_DISABLED, 0, 0, 16, 9, parent as HWND, std::ptr::null_mut(), inst, std::ptr::null()) as isize
    }
}

/// หน้าต่างที่ mpv สร้างไว้ข้างในหน้าต่างลูก ปิดรับเมาส์ด้วย (หน้าต่างที่ปิดรับ Windows ส่งคลิกต่อให้หน้าต่างแม่ ไม่ย้ายโฟกัส)
unsafe extern "system" fn disable_one(h: HWND, _: LPARAM) -> i32 {
    unsafe {
        let s = GetWindowLongPtrW(h, GWL_STYLE);
        if s & WS_DISABLED as isize == 0 { SetWindowLongPtrW(h, GWL_STYLE, s | WS_DISABLED as isize); }
    }
    1
}

fn load(app: &AppHandle) -> Result<Mpv, String> {
    let dir = tools_dir(app)?;
    let dll = dir.join("libmpv-2.dll");
    if !dll.exists() { return Err("ไม่มี libmpv-2.dll ในโฟลเดอร์เครื่องมือ ใช้ตัวเล่นแบบ Aegisub แทนได้ในหน้าตั้งค่า".into()); }
    let lib: HMODULE = unsafe { LoadLibraryExW(wide(dll.as_os_str()).as_ptr(), std::ptr::null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH) };
    if lib.is_null() { return Err(format!("เปิด libmpv-2.dll ไม่ได้ (รหัส {})", std::io::Error::last_os_error().raw_os_error().unwrap_or(0))); }
    let sym = |n: &[u8]| unsafe { GetProcAddress(lib, n.as_ptr()) }.ok_or_else(|| format!("libmpv-2.dll ไม่มีคำสั่ง {}", String::from_utf8_lossy(&n[..n.len() - 1])));
    // ชนิดฟังก์ชันตรงกับ include/mpv/client.h ของชุดที่แนบ (cdecl บน 64 บิตเป็นแบบเดียวกับ system)
    let (create, init, set_opt, set_prop, cmd, get, free): (FCreate, FInit, FSetStr, FSetStr, FCmd, FGetStr, FFree) = unsafe {
        (
            std::mem::transmute(sym(b"mpv_create\0")?), std::mem::transmute(sym(b"mpv_initialize\0")?), std::mem::transmute(sym(b"mpv_set_option_string\0")?),
            std::mem::transmute(sym(b"mpv_set_property_string\0")?), std::mem::transmute(sym(b"mpv_command\0")?), std::mem::transmute(sym(b"mpv_get_property_string\0")?),
            std::mem::transmute(sym(b"mpv_free\0")?),
        )
    };
    let parent = app.get_webview_window("main").ok_or("หาหน้าต่างโปรแกรมไม่เจอ")?.hwnd().map_err(|e| e.to_string())?.0 as isize;
    // หน้าต่างลูกต้องสร้างบนเธรดหลัก (เธรดนั้นรับข้อความของหน้าต่าง)
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || { let _ = tx.send(create_child(parent)); }).map_err(|e| e.to_string())?;
    let wnd = rx.recv_timeout(Duration::from_secs(5)).map_err(|_| "สร้างกรอบภาพของ mpv ไม่ได้".to_string())?;
    if wnd == 0 { return Err("สร้างกรอบภาพของ mpv ไม่ได้".into()); }
    let h = unsafe { create() };
    if h.is_null() { return Err("เปิด mpv ไม่ได้".into()); }
    let opt = |k: &str, v: &str| unsafe { set_opt(h, cs(k).as_ptr(), cs(v).as_ptr()) };
    for (k, v) in [
        ("config", "no"), ("terminal", "no"), ("idle", "yes"), ("keep-open", "yes"), ("osc", "no"), ("osd-level", "0"),
        ("input-default-bindings", "no"), ("input-vo-keyboard", "no"), ("input-cursor", "no"), ("input-cursor-passthrough", "yes"), ("cursor-autohide", "no"),
        ("hwdec", "auto-safe"), ("sub-auto", "no"), ("audio-file-auto", "no"), ("cover-art-auto", "no"), ("save-position-on-quit", "no"),
        ("ytdl", "no"), ("embeddedfonts", "yes"), ("keepaspect", "yes"), ("background-color", "#000000"), ("volume-max", "200"),
        // ซับที่กำลังแก้แสดงทุกบรรทัดตามเวลาในไฟล์ ไม่ย้ายหนีขอบภาพเอง (ตรงกับที่ผู้แก้เห็นในโปรแกรมเล่นทั่วไป)
        ("sub-visibility", "yes"),
    ] { opt(k, v); }
    opt("wid", &wnd.to_string());
    let r = unsafe { init(h) };
    if r < 0 { return Err(format!("เริ่ม mpv ไม่ได้ (รหัส {r})")); }
    Ok(Mpv { h, set_prop, cmd, get, free, wnd })
}

/// วางหน้าต่างภาพ (จุดจริงของจอ เทียบมุมซ้ายบนของหน้าต่างโปรแกรม) · เรียกจากเธรดไหนก็ได้ ไม่รอเธรดหลัก
fn place(wnd: isize, x: i32, y: i32, w: i32, h: i32, show: bool) {
    unsafe {
        SetWindowPos(wnd as HWND, HWND_TOP, x, y, w.max(1), h.max(1), SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS | if show { SWP_SHOWWINDOW } else { SWP_HIDEWINDOW });
        EnumChildWindows(wnd as HWND, Some(disable_one), 0);
    }
}

/// แทร็กเสียงของ mpv ที่ตรงกับเลขสตรีมของไฟล์ (ff-index) หรือแทร็กเสียงที่มาจากไฟล์เสียงแยก
fn audio_id(m: &Mpv, ff: Option<i64>, external: bool) -> Option<String> {
    let n: i64 = m.get("track-list/count")?.parse().ok()?;
    (0..n).rev().find_map(|i| {
        if m.get(&format!("track-list/{i}/type")).as_deref() != Some("audio") { return None; }
        let ext = m.get(&format!("track-list/{i}/external")).as_deref() == Some("yes");
        let ok = if external { ext } else { !ext && ff.is_some() && m.get(&format!("track-list/{i}/ff-index")).and_then(|v| v.parse::<i64>().ok()) == ff };
        if ok { m.get(&format!("track-list/{i}/id")) } else { None }
    })
}

/// ใส่ซับที่กำลังแก้ (ข้อความทั้งไฟล์) แทนฉบับเดิม · ผ่าน memory:// ไม่เขียนไฟล์
fn put_sub(m: &Mpv, text: Option<&str>) -> Result<(), String> {
    let mut id = SUB_ID.lock().map_err(|_| "ตัวเล่น mpv ค้าง".to_string())?;
    if let Some(old) = id.take() { let _ = m.command(&["sub-remove", &old.to_string()]); }
    let Some(t) = text.filter(|t| !t.trim().is_empty()) else { return m.set("sid", "no") };
    m.command(&["sub-add", &format!("memory://{t}"), "select", "ซับที่กำลังแก้"])?;
    *id = m.get("sid").and_then(|v| v.parse().ok());
    Ok(())
}

#[derive(Serialize)]
pub struct MpvState { t: Option<f64>, eof: bool, paused: bool }

/// เล่นหนังจาก t0 วินาที (นับแบบ ffmpeg -ss จาก start_time ของไฟล์) · ภาพวาดในหน้าต่างลูกตรงตำแหน่ง x y w h
/// audio_ff เลขสตรีมเสียงในไฟล์หนัง (แทร็กเดียวกับคลื่นเสียงของหน้าแก้ซับ) · audio_file ไฟล์เสียงแยกที่เปิดไว้
/// sub ข้อความทั้งไฟล์ของซับที่กำลังแก้ · sub_delay วินาทีที่เลื่อนซับ (ดีเลย์ของแทร็กซับกับฐานเวลาของเฟรมแรก)
/// volume 0 ถึง 200 แบบ mpv (ยกกำลังสามในตัว ตรงกับความดังแบบ Aegisub ของหน้าแก้ซับ) · zoom pan ภาพที่ซูมเกินกรอบ
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn mpv_play(
    app: AppHandle, movie: String, t0: f64, audio_ff: Option<i64>, audio_file: Option<String>, sub: Option<String>, sub_delay: f64,
    x: i32, y: i32, w: i32, h: i32, zoom: f64, pan_x: f64, pan_y: f64, volume: f64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !Path::new(&movie).exists() { return Err("หาไฟล์หนังไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string()); }
        let _one = PLAY.lock().map_err(|_| "ตัวเล่น mpv ค้าง".to_string())?;
        let m = match cur() {
            Some(m) => m,
            None => { let m = load(&app)?; *slot().lock().map_err(|_| "ตัวเล่น mpv ค้าง".to_string())? = Some(m); m }
        };
        m.set("pause", "yes")?;
        m.set("volume", &format!("{:.1}", volume.clamp(0.0, 200.0)))?;
        m.view(zoom, pan_x, pan_y);
        let t0 = t0.max(0.0);
        // รอไฟล์เปิดเสร็จ (รายการแทร็กมาแล้ว) ไม่เกิน 10 วินาที
        let ready = |m: &Mpv| -> bool {
            let t = Instant::now();
            while m.get("track-list/count").and_then(|v| v.parse::<i64>().ok()).unwrap_or(0) == 0 {
                if t.elapsed() > Duration::from_secs(10) { return false; }
                std::thread::sleep(Duration::from_millis(30));
            }
            true
        };
        // ไฟล์เดิมยังเปิดอยู่ (ย้ายภาพระหว่างเล่น) ไปเวลาใหม่แบบตรงเฟรม ไม่ต้องเปิดไฟล์ใหม่
        // ไฟล์ที่กำลังเปิดอยู่ (กดเล่นแล้วเลือกบรรทัดทันที) รอให้เปิดเสร็จก่อน ไม่งั้นคำสั่ง seek ล้ม · seek ไม่ได้ เปิดไฟล์ใหม่จากเวลานั้นแทน
        let loaded = m.get("path").as_deref() == Some(movie.as_str()) && m.get("idle-active").as_deref() == Some("no");
        let sought = loaded && ready(&m) && m.command(&["seek", &format!("{t0:.4}"), "absolute+exact"]).is_ok();
        if !sought {
            *SUB_ID.lock().map_err(|_| "ตัวเล่น mpv ค้าง".to_string())? = None;
            m.set("start", &format!("{t0:.4}"))?;
            m.set("sid", "no")?;
            m.command(&["loadfile", &movie, "replace"])?;
            if !ready(&m) { return Err("mpv เปิดไฟล์หนังไม่สำเร็จ".into()); }
        }
        if let Some(f) = audio_file.as_deref().filter(|f| Path::new(f).exists()) {
            let have = audio_id(&m, None, true);
            match have {
                Some(id) if m.get("current-tracks/audio/external-filename").as_deref() == Some(f) => { let _ = m.set("aid", &id); }
                _ => { m.command(&["audio-add", f, "select"])?; if let Some(id) = audio_id(&m, None, true) { let _ = m.set("aid", &id); } }
            }
        } else if let Some(id) = audio_id(&m, audio_ff, false) { let _ = m.set("aid", &id); }
        let _ = m.set("sub-delay", &format!("{sub_delay:.4}"));
        put_sub(&m, sub.as_deref())?;
        place(m.wnd, x, y, w, h, true);
        m.set("pause", "no")?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

/// เวลาที่เล่นถึง (วินาทีของไฟล์ นับจาก start_time) จบเรื่องหรือยัง หยุดอยู่ไหม · รันนอกเธรดหลัก หน้าจอถามถี่ได้
#[tauri::command(async)]
pub fn mpv_state() -> MpvState {
    let Some(m) = cur() else { return MpvState { t: None, eof: false, paused: true } };
    MpvState { t: m.get("time-pos").and_then(|v| v.parse().ok()), eof: m.get("eof-reached").as_deref() == Some("yes"), paused: m.get("pause").as_deref() != Some("no") }
}

/// ย้ายหรือซ่อนกรอบภาพ (หน้าจอส่งมาเมื่อกรอบวิดีโอขยับ เปลี่ยนขนาด ซูม หรือมีของอื่นเปิดทับ)
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn mpv_rect(x: i32, y: i32, w: i32, h: i32, show: bool, zoom: f64, pan_x: f64, pan_y: f64) {
    if let Some(m) = cur() { m.view(zoom, pan_x, pan_y); place(m.wnd, x, y, w, h, show); }
}

/// ซับที่กำลังแก้เปลี่ยนระหว่างเล่น ใส่ฉบับใหม่
#[tauri::command(async)]
pub fn mpv_sub(sub: Option<String>, sub_delay: f64) -> Result<(), String> {
    match cur() {
        Some(m) => { let _ = m.set("sub-delay", &format!("{sub_delay:.4}")); put_sub(&m, sub.as_deref()) }
        None => Ok(()),
    }
}

/// ความดังของ mpv 0 ถึง 200
#[tauri::command(async)]
pub fn mpv_volume(volume: f64) {
    if let Some(m) = cur() { let _ = m.set("volume", &format!("{:.1}", volume.clamp(0.0, 200.0))); }
}

/// หยุดเล่น ซ่อนกรอบภาพ คืนเวลาที่เล่นถึง · unload ปิดไฟล์ด้วย (เปลี่ยนหนังหรือออกจากหน้า) ไม่งั้นไฟล์ยังเปิดค้างไว้ กดเล่นต่อได้ทันที
#[tauri::command]
pub fn mpv_stop(unload: bool) -> Option<f64> {
    let m = cur()?;
    let _ = m.set("pause", "yes");
    let t = m.get("time-pos").and_then(|v| v.parse().ok());
    place(m.wnd, 0, 0, 1, 1, false);
    if unload {
        let _ = m.command(&["stop"]);
        if let Ok(mut id) = SUB_ID.lock() { *id = None; }
    }
    t
}

/// มี libmpv-2.dll ให้ใช้ไหม (หน้าตั้งค่าบอก และหน้าแก้ซับเลือกตัวเล่น)
#[tauri::command]
pub fn mpv_available(app: AppHandle) -> bool {
    tools_dir(&app).map(|d| d.join("libmpv-2.dll").exists()).unwrap_or(false)
}

/// รุ่นทดสอบเท่านั้น ให้ตัวตรวจอ่านค่าของ mpv ตรง ๆ (แทร็กเสียงที่เลือก ซับ ซูม หน้าต่างแสดงอยู่ไหม)
#[cfg(debug_assertions)]
#[tauri::command(async)]
pub fn mpv_dev_props(names: Vec<String>) -> Vec<Option<String>> {
    let Some(m) = cur() else { return names.iter().map(|_| None).collect() };
    names.iter().map(|n| {
        if n == "@visible" { return Some(unsafe { windows_sys::Win32::UI::WindowsAndMessaging::IsWindowVisible(m.wnd as HWND) != 0 }.to_string()); }
        if n == "@rect" {
            // ตำแหน่งเทียบมุมซ้ายบนของพื้นที่หน้าต่างโปรแกรม (จุดจริงของจอ) ให้เทียบกับกรอบบนหน้าจอได้ตรง
            use windows_sys::Win32::Foundation::{POINT, RECT};
            let mut r = RECT { left: 0, top: 0, right: 0, bottom: 0 };
            let mut p = POINT { x: 0, y: 0 };
            unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::GetWindowRect(m.wnd as HWND, &mut r);
                let parent = windows_sys::Win32::UI::WindowsAndMessaging::GetParent(m.wnd as HWND);
                windows_sys::Win32::Graphics::Gdi::ClientToScreen(parent, &mut p);
            }
            return Some(format!("{},{},{},{}", r.left - p.x, r.top - p.y, r.right - r.left, r.bottom - r.top));
        }
        m.get(n)
    }).collect()
}
#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn mpv_dev_props(names: Vec<String>) -> Vec<Option<String>> { names.iter().map(|_| None).collect() }

/// รุ่นทดสอบเท่านั้น ให้ตัวตรวจถ่ายภาพที่ mpv วาดอยู่ (ภาพกับซับ) ลงไฟล์ในโฟลเดอร์ทดสอบ · ภาพหน้าจอผ่าน CDP มองไม่เห็นหน้าต่างของ mpv
#[cfg(debug_assertions)]
#[tauri::command(async)]
pub fn mpv_dev_shot(path: String) -> Result<(), String> {
    let m = cur().ok_or("ยังไม่ได้เปิด mpv")?;
    m.command(&["screenshot-to-file", &path, "subtitles"])
}
#[cfg(not(debug_assertions))]
#[tauri::command]
pub fn mpv_dev_shot(_path: String) -> Result<(), String> { Err("ใช้ได้เฉพาะรุ่นทดสอบ".into()) }
