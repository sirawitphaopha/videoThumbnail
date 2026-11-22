//! เทสของ vidplay.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn play_args_seek_and_size() {
    // 12.3456785 ในเลขฐานสองเก็บได้ต่ำกว่าเล็กน้อย ปัดได้ .345678 จึงใช้ค่าที่ปัดชัดเจน
    let s = play_args("D:\\หนัง\\a.mkv", 12.3456789, 541).join(" ");
    assert!(s.contains("-ss 12.345679 "), "{s}");
    assert!(s.contains("scale=-2:540"), "ความสูงเป็นเลขคู่ {s}");
    assert!(s.contains("-fps_mode passthrough"), "ทุกเฟรมตามไฟล์ ไม่เพิ่มไม่ทิ้ง {s}");
    assert!(play_args("a.mkv", -5.0, 9999).join(" ").contains("-ss 0.000000 "));
    assert!(play_args("a.mkv", 0.0, 9999).join(" ").contains("scale=-2:1080"));
}

#[test]
fn take_jpegs_keeps_partial_image() {
    // ภาพเล็กสองภาพ ภาพที่สองยังมาไม่ครบ
    let img: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9];
    let mut b = img.clone();
    b.extend_from_slice(&img[..5]);
    let (v, used) = take_jpegs(&b);
    assert_eq!(v.len(), 1);
    assert_eq!(used, img.len());
}
