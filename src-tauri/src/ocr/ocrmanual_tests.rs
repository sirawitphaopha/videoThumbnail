//! เทสของ ocrmanual.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::path::PathBuf;

fn dirs(tag: &str) -> Dirs {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let tmp = std::env::temp_dir().join(format!("movie-shelf-ocrmanual-{tag}"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    Dirs { ocr: root.join("ocr"), tools: root, user: tmp.join("user"), work: tmp.join("work") }
}

/// ฝึกฐานใหม่จากฟอนต์ Arial ตัวอักษรไม่กี่ตัว ได้ไฟล์ของผู้ใช้ ชื่อซ้ำไม่ทับเว้นสั่งทับ · ขนาดฟอนต์จากข้อความ · ย่อฐานสำรองไฟล์เดิม
#[test]
fn train_and_optimize_small_db() {
    let d = dirs("train");
    if !d.tools.join("ffmpeg.exe").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี ffmpeg"); return; }
    assert_eq!(parse_sizes("30, 40;40 5 300 x 24.5"), vec![30.0, 40.0, 24.5]);
    let req = TrainReq { kind: "nocr".into(), name: "ฝึก".into(), base: String::new(), overwrite: false, fonts: vec!["Arial".into()], sizes: vec![30.0], bold: false, italic: false, lines: 30, chars: "abcXYZ1".into(), merged: String::new() };
    let ticks = std::cell::Cell::new(0);
    let r = train(&d, &req, &|_| ticks.set(ticks.get() + 1)).unwrap();
    assert!(r.learned >= 5 && r.total == r.learned && !r.stopped && ticks.get() >= 7, "{r:?} {}", ticks.get());
    assert!(d.user.join("nocr").join("ฝึก.nocr").is_file());
    assert!(train(&d, &req, &|_| {}).unwrap_err().contains("อยู่แล้ว"));
    assert!(train(&d, &TrainReq { fonts: vec![], ..req.clone() }, &|_| {}).is_err());
    assert!(train(&d, &TrainReq { kind: "binary".into(), ..req.clone() }, &|_| {}).is_err());
    // ต่อจากฐานเดิม ตัวที่อ่านได้แล้วไม่ฝึกซ้ำ
    let r2 = train(&d, &TrainReq { base: "ฝึก".into(), ..req.clone() }, &|_| {}).unwrap();
    assert!(r2.learned < r.learned, "{r2:?}");
    assert!(train_preview(&d, "Arial", 30.0, false, false, "abc").unwrap().starts_with("data:image/png"));
    let (o, backup) = optimize(&d, "ฝึก", 25, &|_, _| {}).unwrap();
    assert!(o.lines_after <= o.lines_before && backup.ends_with(".bak"), "{o:?} {backup}");
    assert!(d.user.join("nocr").join(&backup).is_file());
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ฐานใหม่ ชื่อซ้ำ ชื่อพาออกนอกโฟลเดอร์ เปลี่ยนชื่อ ฐานที่แนบมาเปลี่ยนชื่อไม่ได้
#[test]
fn new_and_rename() {
    let d = dirs("new");
    let none = db_chars(&d, "own", "ยังไม่มี").unwrap();
    assert!(!none.bundled && !none.saved && none.total == 0, "ฐานที่ยังไม่มีไฟล์ไม่ใช่ฐานที่แนบมา");
    db_new(&d, "nocr", "ทดสอบ").unwrap();
    assert!(d.user.join("nocr").join("ทดสอบ.nocr").is_file());
    assert!(db_chars(&d, "nocr", "ทดสอบ").unwrap().saved);
    assert!(db_new(&d, "nocr", "ทดสอบ").unwrap_err().contains("อยู่แล้ว"));
    assert!(db_new(&d, "nocr", "Latin").unwrap_err().contains("อยู่แล้ว"), "ชื่อเดียวกับฐานที่แนบมา");
    assert!(db_new(&d, "nocr", "../x").is_err());
    assert!(db_new(&d, "nocr", "  ").is_err());
    db_new(&d, "binary", "ทดสอบ").unwrap();
    assert!(d.user.join("binary").join("ทดสอบ.db").is_file());
    db_rename(&d, "nocr", "ทดสอบ", "ใหม่").unwrap();
    assert!(!d.user.join("nocr").join("ทดสอบ.nocr").exists() && d.user.join("nocr").join("ใหม่.nocr").is_file());
    assert!(db_rename(&d, "nocr", "Latin", "อื่น").unwrap_err().contains("แนบมา"));
    db_new(&d, "nocr", "สอง").unwrap();
    assert!(db_rename(&d, "nocr", "ใหม่", "สอง").unwrap_err().contains("อยู่แล้ว"));
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ฐาน Latin ที่แนบมา แก้ตัวแรกแล้วได้สำเนาในโฟลเดอร์ของผู้ใช้ ฐานที่แนบมาไม่ถูกแตะ · ลบแล้วจำนวนลดหนึ่ง
#[test]
fn edit_bundled_db_writes_user_copy() {
    let d = dirs("edit");
    let bundled = d.ocr.join("Ocr").join("Latin.nocr");
    if !bundled.is_file() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มีฐาน Latin"); return; }
    let before = std::fs::read(&bundled).unwrap();
    let a = db_chars(&d, "nocr", "Latin").unwrap();
    assert!(a.bundled && !a.saved && a.total > 100);
    let first = a.items[0].clone();
    assert!(!first.fg.is_empty() || !first.bg.is_empty(), "nOCR มีเส้นเทียบ");
    assert!(db_char_update(&d, "nocr", "Latin", 0, "ไม่ใช่ข้อความเดิม", "Q", false).is_err());
    assert!(db_char_update(&d, "nocr", "Latin", 0, &first.text, " ", false).is_err());
    db_char_update(&d, "nocr", "Latin", 0, &first.text, "Q", true).unwrap();
    let b = db_chars(&d, "nocr", "Latin").unwrap();
    assert!(!b.bundled && b.saved && b.items[0].text == "Q" && b.items[0].italic && b.total == a.total);
    assert_eq!(std::fs::read(&bundled).unwrap(), before, "ฐานที่แนบมาต้องไม่ถูกเขียนทับ");
    db_char_delete(&d, "nocr", "Latin", 0, "Q").unwrap();
    assert_eq!(db_chars(&d, "nocr", "Latin").unwrap().total, a.total - 1);
    // Binary OCR ฐาน Latin มีภาพ
    let bi = db_chars(&d, "binary", "Latin").unwrap();
    assert!(bi.total > 100 && bi.items[0].png.as_deref().is_some_and(|p| p.starts_with("data:image/png")));
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}
