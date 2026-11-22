//! เทสของ players.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
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
