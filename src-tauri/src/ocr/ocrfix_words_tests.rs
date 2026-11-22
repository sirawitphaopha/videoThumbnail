//! เทสของ ocrfix_words.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn split_and_two_letter() {
    let w: Vec<String> = ["so", "proud", "of", "you", "pro", "ud"].iter().map(|s| s.to_string()).collect();
    assert_eq!(split_word(&w, "soproudofyou", "eng"), "so proud of you");
    assert_eq!(split_word(&w, "Andy", "eng"), "Andy");
    assert_eq!(two_letter("eng"), "en");
    assert_eq!(two_letter("tha"), "th");
    assert_eq!(xml_tags("<names><blacklist><name>Bill</name></blacklist><name>AT&amp;T</name></names>", "name"), vec!["Bill", "AT&T"]);
}

/// รายชื่อกับคำของ Subtitle Edit ภาษาอังกฤษที่แนบมา
#[test]
fn english_lists_load() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Dictionaries");
    if !dir.join("en_names.xml").exists() { return; }
    let tmp = std::env::temp_dir().join("movie-shelf-ocrfix-words");
    let w = WordLists::load(&dir, &tmp, "en_US");
    assert!(w.has_name("Aarav"));
    assert!(!w.has_name("Bill"), "Bill อยู่บัญชีดำ");
    assert!(w.has_user_word("'cause"));
    assert!(w.has_name_extended("AARAV", ""));
    assert!(load_abbreviations(&dir, "en_US").contains("mr."));
    assert!(load_split_list(&dir, "eng", &w.all_names()).len() > 1000);
}
