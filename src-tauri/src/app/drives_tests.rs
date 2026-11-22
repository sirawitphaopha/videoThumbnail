//! เทสของ drives.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
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
