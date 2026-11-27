//! โปรแกรมเล่นหนังในเครื่อง (หน้าตั้งค่า การ์ดเปิดเล่นหนัง · พี่กันสั่ง 9 พ.ย. 2569 *"โดย defult จะคือ mpc hc เเต่ตั้งค่าจะไปดูในเครื่องว่ามีโปรแกรมเล่นไหนมั่ง เเละมีปุ่มเปลี่ยนค่าตั้งต้น มีปุ่มเพิ่มโปรแกรม"*)
//!
//! หาจาก โฟลเดอร์ติดตั้งมาตรฐาน ลึกสองชั้น · ทะเบียน App Paths ผ่าน AssocQueryString · โปรแกรมหลักของไฟล์วิดีโอ · PATH
//! แอปแบบ Store หาไม่ได้ เพราะไม่มีไฟล์ exe ให้สั่ง ใช้ผ่านแถวโปรแกรมหลักของ Windows

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::app::store::SettingsStore;

/// ค่าใน player_path ที่แปลว่าใช้โปรแกรมหลักของ Windows · ว่าง = โปรแกรมเลือกเอง MPC-HC ก่อน
pub const SYSTEM: &str = "system";

/// ไฟล์ของโปรแกรมเล่นที่รู้จัก เรียงตามลำดับที่แสดง
const KNOWN: &[(&str, &str)] = &[
    ("mpc-hc64.exe", "MPC-HC"), ("mpc-hc.exe", "MPC-HC"),
    ("mpc-be64.exe", "MPC-BE"), ("mpc-be.exe", "MPC-BE"),
    ("vlc.exe", "VLC"),
    ("PotPlayerMini64.exe", "PotPlayer"), ("PotPlayerMini.exe", "PotPlayer"),
    ("mpv.exe", "mpv"), ("smplayer.exe", "SMPlayer"),
    ("KMPlayer64.exe", "KMPlayer"), ("KMPlayer.exe", "KMPlayer"),
    ("GOM.exe", "GOM Player"), ("kodi.exe", "Kodi"),
    ("wmplayer.exe", "Windows Media Player"),
];

/// โปรแกรมหลักของไฟล์วิดีโอที่ไม่ใช่โปรแกรมเล่น เช่น หน้าต่างถามว่าจะเปิดด้วยอะไร
const NOT_PLAYER: &[&str] = &["openwith.exe", "applicationframehost.exe", "explorer.exe", "rundll32.exe", "dllhost.exe"];

const VIDEO_EXT: &[&str] = &[".mkv", ".mp4", ".avi", ".ts", ".webm", ".mov"];

fn file_name_of(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()
}

fn known_rank(p: &Path) -> usize {
    let name = file_name_of(p);
    KNOWN.iter().position(|(n, _)| n.eq_ignore_ascii_case(&name)).unwrap_or(KNOWN.len())
}

/// ชื่อที่แสดง · ไม่รู้จักใช้ชื่อไฟล์
pub fn display_name(p: &Path) -> String {
    match KNOWN.get(known_rank(p)) {
        Some((_, n)) => (*n).to_string(),
        None => p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
    }
}

/// เดินโฟลเดอร์ลงไม่เกิน depth ชั้น · โฟลเดอร์ที่เปิดไม่ได้ เช่น WindowsApps ข้ามไป · ไม่ตามทางลัดของโฟลเดอร์
fn scan_dir(dir: &Path, depth: u8, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let Ok(t) = e.file_type() else { continue };
        if t.is_dir() {
            if depth > 0 {
                scan_dir(&e.path(), depth - 1, out);
            }
        } else if t.is_file() && known_rank(&e.path()) < KNOWN.len() {
            out.push(e.path());
        }
    }
}

/// เรียงตาม KNOWN ตัดตัวซ้ำโดยไม่สนตัวพิมพ์เล็กใหญ่
/// ไฟล์ชื่อเดียวกันในโฟลเดอร์ชื่อเดียวกันนับเป็นโปรแกรมเดียว เหลือตัวแรก เช่น Windows Media Player มีทั้งใน Program Files กับ Program Files (x86) (เจอบนเครื่องพี่กัน 9 พ.ย. 2569)
fn sorted_unique(mut found: Vec<PathBuf>) -> Vec<PathBuf> {
    found.sort_by_key(|p| known_rank(p));
    let mut seen = std::collections::HashSet::new();
    found.retain(|p| {
        let folder = p.parent().and_then(|d| d.file_name()).map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        seen.insert((folder, file_name_of(p).to_lowercase()))
    });
    found
}

/// ตัดโฟลเดอร์ซ้ำ ไม่สนตัวพิมพ์ใหญ่เล็กและขีดท้าย ไม่สนว่าซ้ำติดกันไหม
/// (AUDIT ข้อ 40 · เครื่อง 64 บิต ProgramFiles กับ ProgramW6432 เป็นโฟลเดอร์เดียวกันแต่มี ProgramFiles(x86) คั่นกลาง
///  dedup ตัดเฉพาะตัวที่ติดกัน จึงเดิน Program Files สองรอบ)
pub(crate) fn unique_roots(roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = std::collections::HashSet::new();
    roots.into_iter().filter(|r| seen.insert(r.to_string_lossy().trim_end_matches(['\\', '/']).to_lowercase())).collect()
}

/// โปรแกรมเล่นทุกตัวที่หาเจอในเครื่อง
pub fn scan() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| std::env::var_os(k).map(PathBuf::from)).collect();
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(l).join("Programs"));
    }
    let roots = unique_roots(roots);
    let mut found = vec![];
    // K-Lite Codec Pack วาง MPC-HC ไว้ลึกสองชั้น Program Files (x86)\K-Lite Codec Pack\MPC-HC64 (เจอบนเครื่องพี่กัน 7 พ.ย. 2569)
    for r in &roots {
        scan_dir(r, 2, &mut found);
    }
    for (exe, _) in KNOWN {
        found.extend(crate::app::winutil::app_path_for(exe));
    }
    for ext in VIDEO_EXT {
        if let Some(p) = crate::app::winutil::default_app_for(ext) {
            if !NOT_PLAYER.iter().any(|n| n.eq_ignore_ascii_case(&file_name_of(&p))) {
                found.push(p);
            }
        }
    }
    if let Some(path) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&path) {
            for (exe, _) in KNOWN {
                let c = d.join(exe);
                if c.is_file() {
                    found.push(c);
                }
            }
        }
    }
    sorted_unique(found)
}

/// MPC-HC ตัวแรกในรายการ · ค่าตั้งต้นของโปรแกรม
pub fn mpc_hc(found: &[PathBuf]) -> Option<PathBuf> {
    found.iter().find(|p| file_name_of(p).to_lowercase().starts_with("mpc-hc")).cloned()
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerInfo {
    path: String,
    name: String,
    /// ไฟล์ยังอยู่ไหม โปรแกรมที่เพิ่มเองอาจถูกย้ายหรือถอนไปแล้ว
    exists: bool,
    /// เพิ่มเอง เอาออกจากรายการได้ · ตัวที่หาเจอในเครื่องเอาออกไม่ได้
    added: bool,
    is_default: bool,
    /// ไอคอนในไฟล์โปรแกรม แบบเดียวกับที่เห็นบนเดสก์ท็อป · ไม่มีใช้ไอคอนกลางของหน้าจอ
    icon: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerList {
    players: Vec<PlayerInfo>,
    /// กดเปิดเล่นแล้วใช้โปรแกรมหลักของ Windows
    system_default: bool,
    /// ไอคอนของโปรแกรมที่ Windows ตั้งไว้เปิดไฟล์ MKV
    system_icon: Option<String>,
}

/// รวมตัวที่หาเจอ ตัวที่เพิ่มเอง และตัวที่ตั้งไว้ · ตั้งไว้แต่ไม่อยู่ในรายการก็ต้องขึ้น ไม่งั้นพี่กันไม่เห็นว่าค่าตั้งต้นคือตัวไหน
fn rows(found: &[PathBuf], added: &[String], set: &str, auto: Option<&Path>, exists: &dyn Fn(&Path) -> bool) -> Vec<PlayerInfo> {
    let set = set.trim();
    let chosen = if set == SYSTEM { String::new() } else if set.is_empty() { auto.map(|p| p.to_string_lossy().to_string()).unwrap_or_default() } else { set.to_string() };
    let mut list: Vec<(String, bool)> = found.iter().map(|p| (p.to_string_lossy().to_string(), false)).collect();
    let extra = added.iter().map(String::as_str).chain((!chosen.is_empty()).then_some(chosen.as_str()));
    for a in extra {
        let a = a.trim();
        if !a.is_empty() && !list.iter().any(|(p, _)| p.eq_ignore_ascii_case(a)) {
            list.push((a.to_string(), true));
        }
    }
    list.into_iter().map(|(path, is_added)| {
        let p = Path::new(&path);
        let added_here = is_added || added.iter().any(|a| a.trim().eq_ignore_ascii_case(&path));
        PlayerInfo { name: display_name(p), exists: exists(p), added: added_here, is_default: !chosen.is_empty() && path.eq_ignore_ascii_case(&chosen), icon: None, path }
    }).collect()
}

/// รายการในหน้าตั้งค่า · async ไม่ให้หน้าต่างค้างระหว่างเดินโฟลเดอร์
#[tauri::command(async)]
pub fn list_players(app: AppHandle) -> PlayerList {
    let s = app.state::<SettingsStore>().current.lock().unwrap().clone();
    let found = scan();
    let auto = crate::media::check::auto_player(&found, Path::new("x.mkv"));
    let mut players = rows(&found, &s.players, &s.player_path, auto.as_deref(), &|p| p.is_file());
    for p in &mut players {
        p.icon = exe_icon(Path::new(&p.path));
    }
    let system_default = !players.iter().any(|p| p.is_default);
    let system_icon = crate::app::winutil::default_app_for(".mkv").and_then(|p| exe_icon(&p));
    PlayerList { players, system_default, system_icon }
}

/// เลือกภาพจากกลุ่มไอคอน (RT_GROUP_ICON) ตัวเล็กสุดที่กว้างตั้งแต่ 48 สีมากสุด ไม่มีเอาตัวใหญ่สุด · คืน 12 ไบต์แรกของแถวกับเลขภาพ
fn pick_icon(group: &[u8]) -> Option<([u8; 12], u16)> {
    let count = u16::from_le_bytes([*group.get(4)?, *group.get(5)?]) as usize;
    (0..count).filter_map(|i| group.get(6 + i * 14..6 + (i + 1) * 14)).max_by_key(|e| {
        let w = if e[0] == 0 { 256 } else { e[0] as i32 };
        (w >= 48, if w >= 48 { -w } else { w }, u16::from_le_bytes([e[6], e[7]]))
    }).map(|e| {
        let mut head = [0u8; 12];
        head.copy_from_slice(&e[..12]);
        (head, u16::from_le_bytes([e[12], e[13]]))
    })
}

/// ห่อภาพเดียวเป็นไฟล์ ICO · ภาพข้างในเป็น PNG หรือ DIB ตามที่อยู่ในไฟล์โปรแกรม
fn build_ico(head: &[u8; 12], data: &[u8]) -> Vec<u8> {
    let mut out = vec![0, 0, 1, 0, 1, 0];
    out.extend_from_slice(&head[..8]);
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    out.extend_from_slice(&22u32.to_le_bytes());
    out.extend_from_slice(data);
    out
}

/// อ่านข้อมูลทรัพยากรในไฟล์ที่เปิดไว้ · name เป็นเลขหรือชื่อตามที่ Windows ส่งมา
unsafe fn resource(h: windows_sys::Win32::Foundation::HMODULE, name: *const u16, kind: usize) -> Option<Vec<u8>> {
    use windows_sys::Win32::System::LibraryLoader::{FindResourceW, LoadResource, LockResource, SizeofResource};
    unsafe {
        let r = FindResourceW(h, name, kind as *const u16);
        if r.is_null() { return None; }
        let g = LoadResource(h, r);
        if g.is_null() { return None; }
        let p = LockResource(g) as *const u8;
        if p.is_null() { return None; }
        Some(std::slice::from_raw_parts(p, SizeofResource(h, r) as usize).to_vec())
    }
}

/// ไอคอนหลักในไฟล์ exe เป็น data URL · เปิดแบบไฟล์ข้อมูล ไม่รันโค้ดของโปรแกรมนั้น · ไฟล์ไม่มีไอคอนหรือเปิดไม่ได้ได้ None
fn exe_icon(path: &Path) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{FreeLibrary, HMODULE};
    use windows_sys::Win32::System::LibraryLoader::{EnumResourceNamesW, LoadLibraryExW, LOAD_LIBRARY_AS_DATAFILE, LOAD_LIBRARY_AS_IMAGE_RESOURCE};
    const RT_ICON: usize = 3;
    const RT_GROUP_ICON: usize = 14;
    // ชื่อกลุ่มใช้ได้แค่ในตัวรับ จึงอ่านข้อมูลกลุ่มแรกแล้วหยุด
    unsafe extern "system" fn first(h: HMODULE, _kind: *const u16, name: *const u16, out: isize) -> i32 {
        unsafe { *(out as *mut Option<Vec<u8>>) = resource(h, name, RT_GROUP_ICON); }
        0
    }
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let h = LoadLibraryExW(wide.as_ptr(), std::ptr::null_mut(), LOAD_LIBRARY_AS_DATAFILE | LOAD_LIBRARY_AS_IMAGE_RESOURCE);
        if h.is_null() { return None; }
        let mut group: Option<Vec<u8>> = None;
        EnumResourceNamesW(h, RT_GROUP_ICON as *const u16, Some(first), &mut group as *mut _ as isize);
        let ico = group.as_deref().and_then(pick_icon).and_then(|(head, id)| resource(h, id as usize as *const u16, RT_ICON).map(|d| build_ico(&head, &d)));
        FreeLibrary(h);
        ico.map(|b| format!("data:image/x-icon;base64,{}", crate::audio::audiograph::b64(&b)))
    }
}

#[cfg(test)]
#[path = "players_tests.rs"]
mod tests;
