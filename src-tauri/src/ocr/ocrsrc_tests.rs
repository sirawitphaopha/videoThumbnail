//! เทสของ ocrsrc.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn assa_position_grid() {
    // กลางล่าง กลางบน ซ้ายกลาง ขวาบน
    assert_eq!(an_from_screen(0.5, 0.85, 0.95), 2);
    assert_eq!(an_from_screen(0.5, 0.05, 0.15), 8);
    assert_eq!(an_from_screen(0.1, 0.45, 0.55), 4);
    assert_eq!(an_from_screen(0.9, 0.02, 0.1), 9);
    // สามบรรทัดของบทพูดข้างล่าง กลางก้อนอยู่แถวกลางแต่ยื่นเข้าหนึ่งในสี่ล่าง นับเป็นล่าง (#16501 ของ Subtitle Edit)
    assert_eq!(an_from_screen(0.5, 0.55, 0.9), 2);
    // ภาพสูงเกือบเต็มจอ ยื่นเข้าทั้งบนและล่าง ใช้กึ่งกลาง
    assert_eq!(an_from_screen(0.5, 0.1, 0.9), 5);
    // ซับแนวตั้งญี่ปุ่นชิดขวา สูงกลางจอ
    assert_eq!(an_from_screen(0.92, 0.3, 0.7), 6);
}

#[test]
fn an_of_unknown_screen_is_bottom_center() {
    let i = SubImg { n: 1, start: 0.0, end: None, w: 10, h: 10, canvas: [0, 0], at: [0, 0], forced: false, file: PathBuf::new() };
    assert_eq!(an_of(&i), 2);
    let top = SubImg { canvas: [1920, 1080], at: [700, 40], w: 520, h: 60, ..i };
    assert_eq!(an_of(&top), 8);
}

/// ภาพเดียวมีป้ายบนจอกับบทพูดสองบรรทัดข้างล่าง ต้องได้ \an8 กับ \an2 \an2 · ภาพเตี้ยหรือก้อนเดียวคืน None (BUGS ข้อ 143 ACCA มี 68 ภาพแบบนี้)
#[test]
fn an_per_block() {
    let mut img = image::RgbaImage::new(600, 900);
    let mut bar = |y0: u32, h: u32| for y in y0..y0 + h { for x in 50..550 { img.put_pixel(x, y, image::Rgba([255, 255, 255, 255])); } };
    bar(0, 40);
    bar(780, 40);
    bar(840, 40);
    let i = SubImg { n: 1, start: 0.0, end: None, w: 600, h: 900, canvas: [1920, 1080], at: [660, 60], forced: false, file: PathBuf::new() };
    assert_eq!(an_lines(&img, &i, 3), Some(vec![8, 2, 2]));
    // ข้อความอ่านได้แค่สองบรรทัด บรรทัดแรกคู่ก้อนบน บรรทัดสุดท้ายคู่ก้อนล่าง
    assert_eq!(an_lines(&img, &i, 2), Some(vec![8, 2]));
    assert_eq!(an_lines(&img, &i, 1), None);
    let short = image::RgbaImage::new(600, 120);
    assert_eq!(an_lines(&short, &SubImg { h: 120, ..i.clone() }, 2), None);
}

#[test]
fn png_names_give_times() {
    assert_eq!(png_times("sub_1000-to-2500"), Some((1.0, 2.5)));
    assert_eq!(png_times("0_00_01_234__0_00_03_456"), Some((1.234, 3.456)));
    assert_eq!(png_times("0_00_01_234__0_00_03_456_7"), Some((1.234, 3.456)));
    assert_eq!(png_times("ภาพที่ 1"), None);
}
