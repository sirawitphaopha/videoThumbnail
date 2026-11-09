//! โปรแกรมเล่นหนังในเครื่อง (หน้าตั้งค่า การ์ดเปิดเล่นหนัง · พี่กันสั่ง 9 พ.ย. 2569 *"โดย defult จะคือ mpc hc เเต่ตั้งค่าจะไปดูในเครื่องว่ามีโปรแกรมเล่นไหนมั่ง เเละมีปุ่มเปลี่ยนค่าตั้งต้น มีปุ่มเพิ่มโปรแกรม"*)
//!
//! หาจาก โฟลเดอร์ติดตั้งมาตรฐาน ลึกสองชั้น · ทะเบียน App Paths ผ่าน AssocQueryString · โปรแกรมหลักของไฟล์วิดีโอ · PATH
//! แอปแบบ Store หาไม่ได้ เพราะไม่มีไฟล์ exe ให้สั่ง ใช้ผ่านแถวโปรแกรมหลักของ Windows

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::store::SettingsStore;

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

/// โปรแกรมเล่นทุกตัวที่หาเจอในเครื่อง
pub fn scan() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| std::env::var_os(k).map(PathBuf::from)).collect();
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(l).join("Programs"));
    }
    roots.dedup();
    let mut found = vec![];
    // K-Lite Codec Pack วาง MPC-HC ไว้ลึกสองชั้น Program Files (x86)\K-Lite Codec Pack\MPC-HC64 (เจอบนเครื่องพี่กัน 7 พ.ย. 2569)
    for r in &roots {
        scan_dir(r, 2, &mut found);
    }
    for (exe, _) in KNOWN {
        found.extend(crate::winutil::app_path_for(exe));
    }
    for ext in VIDEO_EXT {
        if let Some(p) = crate::winutil::default_app_for(ext) {
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
    let auto = crate::check::auto_player(&found, Path::new("x.mkv"));
    let mut players = rows(&found, &s.players, &s.player_path, auto.as_deref(), &|p| p.is_file());
    for p in &mut players {
        p.icon = exe_icon(Path::new(&p.path));
    }
    let system_default = !players.iter().any(|p| p.is_default);
    let system_icon = crate::winutil::default_app_for(".mkv").and_then(|p| exe_icon(&p));
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
        ico.map(|b| format!("data:image/x-icon;base64,{}", crate::audiograph::b64(&b)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MPC: &str = r"C:\K-Lite Codec Pack\MPC-HC64\mpc-hc64.exe";
    const VLC: &str = r"C:\VideoLAN\VLC\vlc.exe";

    fn found() -> Vec<PathBuf> { vec![PathBuf::from(MPC), PathBuf::from(VLC)] }
    fn yes(_: &Path) -> bool { true }

    #[test]
    fn names_and_order() {
        assert_eq!(display_name(Path::new(MPC)), "MPC-HC");
        assert_eq!(display_name(Path::new(r"C:\x\POTPLAYERMINI64.EXE")), "PotPlayer");
        assert_eq!(display_name(Path::new(r"C:\x\โปรแกรมเล่นของฉัน.exe")), "โปรแกรมเล่นของฉัน");
        let got = sorted_unique(vec![PathBuf::from(VLC), PathBuf::from(MPC), PathBuf::from(r"C:\videolan\vlc\VLC.EXE")]);
        assert_eq!(got, found(), "MPC-HC ขึ้นก่อน ตัวซ้ำที่ต่างแค่ตัวพิมพ์เหลือตัวเดียว");
        let wmp = sorted_unique(vec![PathBuf::from(r"C:\Program Files\Windows Media Player\wmplayer.exe"), PathBuf::from(r"C:\Program Files (x86)\Windows Media Player\wmplayer.exe")]);
        assert_eq!(wmp, [PathBuf::from(r"C:\Program Files\Windows Media Player\wmplayer.exe")], "รุ่น 64 บิตกับ 32 บิตเหลือแถวเดียว ตัวแรก");
        let two = sorted_unique(vec![PathBuf::from(r"C:\K-Lite Codec Pack\MPC-HC64\mpc-hc64.exe"), PathBuf::from(r"D:\พกพา\mpc-hc64.exe")]);
        assert_eq!(two.len(), 2, "คนละโฟลเดอร์ยังขึ้นทั้งคู่");
    }

    #[test]
    fn mpc_hc_is_found_only_when_present() {
        assert_eq!(mpc_hc(&found()), Some(PathBuf::from(MPC)));
        assert_eq!(mpc_hc(&[PathBuf::from(VLC), PathBuf::from(r"C:\x\mpc-be64.exe")]), None, "MPC-BE ไม่ใช่ MPC-HC");
    }

    #[test]
    fn default_follows_setting() {
        let def = |r: Vec<PlayerInfo>| r.into_iter().filter(|p| p.is_default).map(|p| p.name).collect::<Vec<_>>();
        // ไม่ได้ตั้ง ใช้ตัวที่โปรแกรมเลือก
        assert_eq!(def(rows(&found(), &[], "", Some(Path::new(MPC)), &yes)), ["MPC-HC"]);
        // เครื่องไม่มี MPC-HC โปรแกรมเลือกตัวอื่น
        assert_eq!(def(rows(&found()[1..], &[], "", Some(Path::new(VLC)), &yes)), ["VLC"]);
        // ไม่มีอะไรเลย ไม่มีแถวไหนเป็นค่าตั้งต้น หน้าจอติดป้ายที่แถวโปรแกรมหลักของ Windows
        assert!(rows(&[], &[], "", None, &yes).is_empty());
        // เลือกโปรแกรมหลักของ Windows แม้เครื่องมี MPC-HC
        assert!(def(rows(&found(), &[], SYSTEM, Some(Path::new(MPC)), &yes)).is_empty());
        // ตั้ง VLC ไว้ ตัวพิมพ์ต่างกันก็ยังตรง
        assert_eq!(def(rows(&found(), &[], &VLC.to_uppercase(), Some(Path::new(MPC)), &yes)), ["VLC"]);
    }

    #[test]
    fn added_and_missing_players_stay_visible() {
        let mine = r"D:\เล่นหนัง\my player.exe".to_string();
        let r = rows(&found(), &[mine.clone(), MPC.to_string()], "", Some(Path::new(MPC)), &|p| p != Path::new(&mine));
        assert_eq!(r.len(), 3, "MPC-HC ที่เพิ่มซ้ำไม่ขึ้นสองแถว");
        assert!(r[0].added, "เพิ่มซ้ำกับตัวที่หาเจอ เอาออกได้");
        assert!(!r[1].added, "ตัวที่หาเจอเอาออกไม่ได้");
        assert!(r[2].added && !r[2].exists && r[2].name == "my player");
        let gone = r"C:\ไม่มีโปรแกรมนี้\vlc.exe";
        let r = rows(&found(), &[], gone, Some(Path::new(MPC)), &|p| p != Path::new(gone));
        let last = r.last().unwrap();
        assert!(last.is_default && !last.exists && last.added, "ตั้งไว้แล้วหาไม่เจอยังขึ้นในรายการพร้อมป้าย");
    }

    #[test]
    fn icon_group_picks_nearest_size_and_builds_ico() {
        let row = |w: u8, bits: u16, id: u16| { let mut r = vec![w, w, 0, 0, 1, 0]; r.extend_from_slice(&bits.to_le_bytes()); r.extend_from_slice(&999u32.to_le_bytes()); r.extend_from_slice(&id.to_le_bytes()); r };
        let group = |rows: &[Vec<u8>]| { let mut g = vec![0, 0, 1, 0, rows.len() as u8, 0]; for r in rows { g.extend_from_slice(r); } g };
        assert_eq!(pick_icon(&group(&[row(16, 32, 1), row(48, 8, 2), row(48, 32, 3), row(0, 32, 4)])).unwrap().1, 3, "48 จุดสีมากสุด");
        assert_eq!(pick_icon(&group(&[row(0, 32, 4)])).unwrap().1, 4, "มีแต่ 256");
        assert_eq!(pick_icon(&group(&[row(16, 32, 1), row(32, 32, 2)])).unwrap().1, 2, "ไม่ถึง 48 เอาตัวใหญ่สุด");
        assert!(pick_icon(&[0, 0, 1]).is_none());
        let g = group(&[row(48, 32, 3)]);
        let (head, _) = pick_icon(&g).unwrap();
        let ico = build_ico(&head, &[7, 8, 9]);
        assert_eq!(&ico[..6], &[0, 0, 1, 0, 1, 0]);
        assert_eq!(u32::from_le_bytes(ico[14..18].try_into().unwrap()), 3, "ขนาดภาพจริง ไม่ใช่เลขเดิมในกลุ่ม");
        assert_eq!(u32::from_le_bytes(ico[18..22].try_into().unwrap()), 22);
        assert_eq!(&ico[22..], &[7, 8, 9]);
    }

    #[test]
    fn exe_icon_reads_real_programs_only() {
        let explorer = PathBuf::from(std::env::var_os("WINDIR").unwrap()).join("explorer.exe");
        let url = exe_icon(&explorer).expect("explorer.exe มีไอคอน");
        assert!(url.starts_with("data:image/x-icon;base64,") && url.len() > 200);
        let blank = std::env::temp_dir().join(format!("players-blank-{}.exe", std::process::id()));
        std::fs::write(&blank, b"").unwrap();
        assert!(exe_icon(&blank).is_none(), "ไฟล์เปล่า");
        std::fs::remove_file(&blank).unwrap();
        assert!(exe_icon(Path::new(r"D:\ไม่มีโปรแกรมนี้\gone.exe")).is_none(), "ไฟล์หาย");
    }

    #[test]
    fn scan_dir_walks_two_levels_only() {
        let root = std::env::temp_dir().join(format!("players-{}", std::process::id()));
        let deep = root.join("a").join("b");
        std::fs::create_dir_all(deep.join("c")).unwrap();
        std::fs::write(root.join("a").join("vlc.exe"), b"").unwrap();
        std::fs::write(deep.join("mpv.exe"), b"").unwrap();
        std::fs::write(deep.join("c").join("mpc-hc64.exe"), b"").unwrap();
        std::fs::write(deep.join("notepad.exe"), b"").unwrap();
        let mut out = vec![];
        scan_dir(&root, 2, &mut out);
        std::fs::remove_dir_all(&root).unwrap();
        let mut names: Vec<_> = out.iter().map(|p| file_name_of(p)).collect();
        names.sort();
        assert_eq!(names, ["mpv.exe", "vlc.exe"]);
    }
}
