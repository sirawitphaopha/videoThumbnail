//! เทสของ nocr.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::Rgba;

#[test]
fn line_points_match_se() {
    assert_eq!(NLine::new(0, 0, 3, 1).points(), vec![Pt { x: 0, y: 0 }, Pt { x: 1, y: 0 }, Pt { x: 2, y: 1 }, Pt { x: 3, y: 1 }]);
    assert_eq!(NLine::new(2, 5, 2, 2).points().len(), 4);
    // เส้นจุดเดียว Subtitle Edit ได้ NaN แล้ว .NET แปลงเป็น 0 จุดอยู่คอลัมน์ 0
    assert_eq!(NLine::new(1, 1, 1, 1).points(), vec![Pt { x: 0, y: 1 }]);
}

#[test]
fn char_roundtrip_short_and_long() {
    let a = NChar { text: "ก".into(), width: 20, height: 30, margin_top: 5, italic: true, fg: vec![NLine::new(1, 2, 3, 4)], bg: vec![NLine::new(0, 0, 19, 29)], expand_count: 0 };
    let b = NChar { text: "W".into(), width: 300, height: 40, margin_top: 2, italic: false, fg: vec![NLine::new(0, 0, 299, 39)], bg: vec![], expand_count: 2 };
    let mut buf = vec![];
    a.write(&mut buf);
    b.write(&mut buf);
    let mut p = 0;
    assert_eq!(NChar::read(&mut p, &buf, true), Some(a.clone()));
    assert_eq!(NChar::read(&mut p, &buf, true), Some(b.clone()));
    assert_eq!(NChar::read(&mut p, &buf, true), None);
    // ตัวใหญ่เกินจอ 1080p อ่านได้แต่ใช้ไม่ได้ · ฐานที่มีตัวนี้หน้าสุดยังเปิดได้ตัวอื่นครบ (ผู้ช่วยตรวจทาน R3)
    let mut big = a.clone();
    big.width = 2000;
    assert!(!big.is_valid());
    let dir = std::env::temp_dir().join("movie-shelf-nocr-big");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("big.nocr");
    let mut raw = b"V2".to_vec();
    big.write(&mut raw);
    b.write(&mut raw);
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    std::io::Write::write_all(&mut enc, &raw).unwrap();
    std::fs::write(&f, enc.finish().unwrap()).unwrap();
    let db = NOcrDb::load(&f).unwrap();
    assert_eq!(db.total(), 1, "ตัวถัดไปต้องอ่านได้");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ภาพสี่เหลี่ยมทึบ 10 × 20 กับตัวอักษรที่สอนจากภาพเดียวกัน (เส้นหน้าตามแนวตั้ง เส้นหลังรอบนอก) ต้องตรงพอดี
#[test]
fn exact_and_scaled_match() {
    let mut db = NOcrDb::empty(Path::new("x.nocr"));
    let bar = NChar { text: "l".into(), width: 10, height: 20, margin_top: 0, fg: vec![NLine::new(5, 0, 5, 19), NLine::new(2, 10, 7, 10)], bg: vec![], ..Default::default() };
    db.add(bar);
    let img = RgbaImage::from_pixel(10, 20, Rgba([255, 255, 255, 255]));
    assert_eq!(db.match_single(&img, 0, false, 10, false, false, Placement::Unknown).0.map(|c| c.text), Some("l".into()));
    // ภาพใหญ่ขึ้นเล็กน้อยยังเข้ากันในชั้นที่ยอมให้ขนาดต่าง
    let big = RgbaImage::from_pixel(12, 23, Rgba([255, 255, 255, 255]));
    let (m, r) = db.match_single(&big, 0, false, 10, false, false, Placement::Unknown);
    assert_eq!(m.map(|c| c.text), Some("l".into()));
    assert_eq!(r, 0.0);
}

#[test]
fn harmonize_and_unitalic() {
    let a = RgbaImage::new(5, 10);
    assert_eq!(harmonize_case("r", "S", &a, &a, 0, 0), "rs");
    assert_eq!(harmonize_case("r", "S", &a, &RgbaImage::new(5, 20), 0, 0), "rS");
    let mut it = RgbaImage::new(4, 10);
    for y in 0..10 { it.put_pixel(0, y, Rgba([255, 255, 255, 255])); }
    assert_eq!(un_italic(&it, 0.3).width(), 1 + 3, "แนวตั้งตรงบิดแล้วเป็นแนวเอียง กว้างขึ้นเท่าการเลื่อนสูงสุด");
}

/// ฐาน Latin.nocr ของ Subtitle Edit ที่แนบมาเปิดได้ บันทึกแล้วได้ข้อมูลเดิมทุกตัว (เปิดใน Subtitle Edit ได้)
#[test]
fn se_latin_db_roundtrip() {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools").join("ocr").join("Ocr").join("Latin.nocr");
    if !p.is_file() { panic!("ไม่มี {} รัน scripts/fetch-ocr-tools.ps1 ก่อน", p.display()); }
    let db = NOcrDb::load(&p).unwrap();
    assert!(db.total() > 1000, "ตัวอักษรน้อยผิดปกติ {}", db.total());
    let tmp = std::env::temp_dir().join(format!("ms-nocr-{}.nocr", std::process::id()));
    let mut copy = NOcrDb::empty(&tmp);
    copy.chars = db.chars.clone();
    copy.expanded = db.expanded.clone();
    copy.save().unwrap();
    let back = NOcrDb::load(&tmp).unwrap();
    assert_eq!(back.chars, db.chars);
    assert_eq!(back.expanded, db.expanded);
    let _ = std::fs::remove_file(&tmp);
}
