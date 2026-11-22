//! เทสของ outfile.rs (mod trash_tests) · แยกออกจากไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// บันทึกฐานซ้ำในรอบเดียว ครั้งที่สองแทนที่ตรง ๆ ไม่ผ่านถังขยะ ข้อความใหม่ทุกครั้ง ไม่มีไฟล์ชั่วคราวค้าง (ผู้ช่วยตรวจทาน R2)
/// ครั้งแรกเป็นไฟล์ใหม่ (ไม่มีของเดิมให้ลงถังขยะ) ครั้งที่สองกับสามต้องไม่เรียกตัวลงถังขยะ วัดจากบันทึกการใช้งานไม่ได้ จึงวัดว่าไม่ผิดพลาดและไฟล์ถูก
#[test]
fn replace_often_second_save_replaces_in_place() {
    let dir = std::env::temp_dir().join("movie-shelf-replace-often");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("db.nocr");
    for (k, t) in ["หนึ่ง", "สอง", "สาม"].iter().enumerate() {
        let part = dir.join(format!("db.nocr.{k}.partial"));
        std::fs::write(&part, t).unwrap();
        // ครั้งแรกของไฟล์นี้ในรอบ ไฟล์ยังไม่มี ไม่มีอะไรลงถังขยะ · ครั้งถัดไปแทนที่ตรง ๆ
        replace_often(&part, &f).unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), *t);
        assert!(!part.exists());
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// ส่งลงถังขยะไม่สำเร็จบอกสาเหตุเป็นภาษาไทย ไม่ขึ้นแค่รหัส (BUGS ข้อ 150)
#[test]
fn trash_reasons_in_thai() {
    assert!(trash_reason(0, true).contains("ยังอยู่ที่เดิม"));
    assert!(trash_reason(0x75, false).contains("ยกเลิก"));
    assert!(trash_reason(0x78, true).starts_with("Windows ไม่อนุญาต"));
    assert!(trash_reason(0x402, true).starts_with("ที่อยู่ไฟล์ใช้ไม่ได้"));
    assert!(trash_reason(32, true).contains("ถูกเปิดอยู่ในโปรแกรมอื่น"));
    for r in [0, 0x75, 0x78, 0x7C, 0x402, 2, 5, 32] { assert!(!trash_reason(r, true).contains("รหัส"), "{r}"); }
}
