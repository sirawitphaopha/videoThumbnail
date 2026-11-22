//! เทสของ ocrfix_guess.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
#[test]
fn guesses() {
    let g = guesses_from_letters("ofit", "eng");
    assert!(g.contains(&"of it".to_string()), "{g:?}");
    assert!(guesses_from_letters("Andy", "eng").is_empty());
    assert!(guesses_from_letters("thecatsat", "eng").iter().any(|s| s == "the catsat"));
}
