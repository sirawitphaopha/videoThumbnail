//! เทสของ ocrfix_list.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn helpers() {
    assert_eq!(net_replacement("$1I$3"), "${1}I${3}");
    assert_eq!(replace_word("i'm here", "i'm", "I'm"), "I'm here");
    assert_eq!(replace_word("film", "il", "XX"), "film");
    assert_eq!(fix_i_or_1_inside_lower("heIlo"), "hello");
    assert_eq!(fix_i_or_1_inside_lower("McIntyre"), "McIntyre");
    assert_eq!(fix_0_inside_lower("g0t"), "got");
    assert_eq!(fix_lower_l_inside_upper("SCARLETTl"), "SCARLETTI");
    assert_eq!(strip_affixes("\"(hello!)\""), ("\"(".to_string(), "hello".to_string(), "!)\"".to_string()));
    assert_eq!(add_space_before_french_punctuation("Quoi?"), "Quoi ?");
    assert_eq!(attr("RegEx find=\"a&amp;b\" replaceWith='x'", "replaceWith").as_deref(), Some("x"));
}

/// รายการของภาษาอังกฤษที่แนบมาเปิดได้ทุกหมวด นิพจน์คอมไพล์ผ่านเกือบทั้งหมด และแก้คำตามรายการได้
#[test]
fn english_list() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Dictionaries");
    if !dir.join("eng_OCRFixReplaceList.xml").exists() { return; }
    let l = ReplaceList::from_lang(&dir, &std::env::temp_dir().join("movie-shelf-ocrfix-list"), "eng");
    eprintln!("คำ {} ส่วนคำ {} ส่วนบรรทัด {} นิพจน์ {} นิพจน์สะกดถูก {}", l.words.len(), l.partial_words.len(), l.partial_lines.len(), l.regex.len(), l.spell_regex.len());
    // นิพจน์ทุกตัวในไฟล์ต้องคอมไพล์ผ่านทั้งสองหมวด (fancy-regex อ่านนิพจน์แบบ .NET ของรายการได้หมด)
    let in_file = std::fs::read_to_string(dir.join("eng_OCRFixReplaceList.xml")).unwrap().matches("<RegEx ").count();
    assert!(l.words.len() > 1000);
    assert_eq!(l.regex.len() + l.spell_regex.len(), in_file, "นิพจน์บางตัวคอมไพล์ไม่ผ่าน");
    let (from, to) = l.words[0].clone();
    assert_eq!(l.fix_common_word_errors(&from), to);
}

/// เปลี่ยนทั้งหมดซ้ำด้วยคำใหม่ คู่ใหม่แทนคู่เดิมทั้งในงานและในไฟล์ · เขียนไฟล์ไม่ได้คืนผิดพลาด (ผู้ช่วยตรวจทาน R13)
#[test]
fn user_pair_replaced_and_write_error_reported() {
    let ud = std::env::temp_dir().join(format!("movie-shelf-r13-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&ud);
    let mut l = ReplaceList::from_lang(&ud, &ud, "tst");
    assert_eq!(l.add_word_or_partial("Tbe", "The"), Ok(true));
    assert_eq!(l.add_word_or_partial("Tbe", "The"), Ok(false));
    assert_eq!(l.add_word_or_partial("Tbe", "Tbe."), Ok(true));
    let doc = std::fs::read_to_string(ud.join("tst_OCRFixReplaceList_User.xml")).unwrap();
    assert_eq!(doc.matches("from=\"Tbe\"").count(), 1, "{doc}");
    assert!(doc.contains("to=\"Tbe.\""), "{doc}");
    assert_eq!(l.words.iter().filter(|p| p.0 == "Tbe").map(|p| p.1.as_str()).collect::<Vec<_>>(), ["Tbe."]);
    // ที่เก็บของผู้ใช้เป็นไฟล์ ไม่ใช่โฟลเดอร์ เขียนไม่ได้
    let blocked = ud.join("เป็นไฟล์");
    std::fs::write(&blocked, b"x").unwrap();
    let mut l2 = ReplaceList::from_lang(&ud, &blocked.join("ใน"), "tst");
    assert!(l2.add_word_or_partial("rn", "m").is_err());
    let _ = std::fs::remove_dir_all(&ud);
}
