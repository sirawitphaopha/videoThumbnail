//! เทสของ winutil.rs
use super::*;

/// AUDIT ข้อ 134 · ข้อความคลิปบอร์ดอ่านถึงตัวจบ 0 ตัวแรก ไม่มีตัวจบก็หยุดที่ขอบก้อน ไม่อ่านเลย
#[test]
fn clipboard_text_stops_at_nul_or_end() {
    let with_nul: Vec<u16> = "abc\0ทิ้ง".encode_utf16().collect();
    assert_eq!(utf16_until_nul(&with_nul), "abc");
    let no_nul: Vec<u16> = "ค่า hash".encode_utf16().collect();
    assert_eq!(utf16_until_nul(&no_nul), "ค่า hash");
    assert_eq!(utf16_until_nul(&[]), "");
}
