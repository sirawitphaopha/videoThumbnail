//! เทสของ nocr_split.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn rect(b: &mut Bmp, x0: u32, y0: u32, w: u32, h: u32) { for y in y0..y0 + h { for x in x0..x0 + w { b.put_pixel(x, y, Rgba([255, 255, 255, 255])); } } }

/// สองบรรทัด บรรทัดละสามตัว มีช่องว่างคำ · ต้องได้ ตัว ตัว เว้นวรรค ตัว ขึ้นบรรทัด ตัว ตัว ตัว และเส้นฐานของแต่ละบรรทัด
#[test]
fn letters_spaces_and_lines() {
    let mut b = RgbaImage::new(120, 80);
    for (x, w) in [(5, 8), (18, 8), (45, 8)] { rect(&mut b, x, 5, w, 25); }
    for (x, w) in [(5, 8), (18, 8), (31, 8)] { rect(&mut b, x, 45, w, 25); }
    let l = split_letters(&b, 12, false, true, 10, true, -1.0);
    let kinds: Vec<String> = l.iter().map(|p| p.special.clone().unwrap_or_else(|| "g".into())).collect();
    assert_eq!(kinds, vec!["g", "g", " ", "g", "\n", "g", "g", "g"], "{kinds:?}");
    assert_eq!(l[0].bmp.as_ref().unwrap().dimensions(), (8, 25));
    assert_eq!(l[0].baseline, Some(30));
    assert_eq!(l[5].top, 0);
    assert_eq!(l[5].baseline, Some(25));
}

#[test]
fn crop_and_heights() {
    let mut b = RgbaImage::new(10, 20);
    rect(&mut b, 2, 6, 3, 8);
    let (c, top) = crop_top_bottom(&b);
    assert_eq!((c.height(), top), (8, 6));
    assert_eq!(non_clear_height(&b), 8);
    assert_eq!(bitmaps_alike(&b, &b), 0);
}
