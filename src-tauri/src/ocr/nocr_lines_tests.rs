//! เทสของ nocr_lines.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::{Rgba, RgbaImage};

/// ตัว L 20 × 30 ทุกวิธีต้องได้เส้นหน้าที่ทับหมึกจริงและเส้นหลังที่อยู่บนพื้นจริง และจับคู่กับภาพเดิมได้ไม่ผิดสักจุด
#[test]
fn every_algorithm_makes_valid_lines() {
    let mut b = RgbaImage::new(20, 30);
    for y in 0..30 { for x in 2..7 { b.put_pixel(x, y, Rgba([255, 255, 255, 255])); } }
    for y in 24..30 { for x in 2..18 { b.put_pixel(x, y, Rgba([255, 255, 255, 255])); } }
    for algo in [Algo::Random, Algo::SkeletonDistance, Algo::EdgeHough] {
        let mut c = NChar { text: "L".into(), width: 20, height: 30, ..Default::default() };
        generate(20, false, &mut c, &b, algo, &mut Rng::new(42));
        assert!(!c.fg.is_empty() && !c.bg.is_empty(), "{algo:?} {} {}", c.fg.len(), c.bg.len());
        assert!(crate::ocr::nocr::is_match(&b, &c, 0), "{algo:?} เส้นต้องเข้ากับภาพที่สอน");
        // ภาพอื่น (ตัว I เต็มกรอบ) ต้องไม่เข้ากันแบบไม่ผิดเลย
        let full = RgbaImage::from_pixel(20, 30, Rgba([255, 255, 255, 255]));
        assert!(!crate::ocr::nocr::is_match(&full, &c, 0), "{algo:?}");
    }
}

#[test]
fn duplicate_and_similar_removed() {
    let mut v = vec![NLine::new(3, 0, 3, 10), NLine::new(3, 2, 3, 8), NLine::new(0, 5, 9, 5), NLine::new(1, 5, 4, 5)];
    remove_duplicates(&mut v);
    assert_eq!(v, vec![NLine::new(3, 0, 3, 10), NLine::new(0, 5, 9, 5)]);
    let mut s = vec![NLine::new(0, 0, 20, 0), NLine::new(0, 1, 20, 1)];
    remove_similar(&mut s, 30, 30);
    assert_eq!(s.len(), 1);
}
