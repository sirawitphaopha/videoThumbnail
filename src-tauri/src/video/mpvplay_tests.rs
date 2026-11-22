//! เทสของ mpvplay.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// ทุกรหัสใน mpv_error ของ client.h (vendor/mpv) มีประโยคไทย ไม่ขึ้นแค่รหัส (BUGS ข้อ 150)
#[test]
fn mpv_codes_in_thai() {
    for c in -19..=-1 {
        let s = mpv_reason(c);
        assert!(!s.contains("รหัส"), "{c} {s}");
    }
    assert!(mpv_reason(-13).starts_with("mpv เปิดไฟล์ไม่ได้"));
    assert!(mpv_reason(-20).contains("ตอบรหัส -20"));
}
