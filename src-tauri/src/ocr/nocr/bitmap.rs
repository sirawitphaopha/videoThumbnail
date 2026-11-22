//! ตัวช่วยภาพ อ่านความทึบ ตัดกรอบ ตัดขอบ แก้ตัวเอียง
//! แยกจาก nocr/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

#[inline]
pub(crate) fn alpha(b: &Bmp, x: i32, y: i32) -> u8 { b.get_pixel(x as u32, y as u32)[3] }
#[inline]
pub(crate) fn inside(b: &Bmp, x: i32, y: i32) -> bool { x >= 0 && y >= 0 && x < b.width() as i32 && y < b.height() as i32 }

/// คัดลอกส่วนของภาพ ส่วนที่เลยขอบตัดทิ้ง · ตาม CopyRectangle
pub fn copy_rect(b: &Bmp, x: i32, y: i32, w: i32, h: i32) -> Bmp {
    let w = w.min(b.width() as i32 - x).max(0);
    let h = h.min(b.height() as i32 - y).max(0);
    image::imageops::crop_imm(b, x.max(0) as u32, y.max(0) as u32, w as u32, h as u32).to_image()
}

/// ตัดคอลัมน์ใสทั้งคอลัมน์ทางซ้ายและขวาออก แถวไม่แตะ · ตาม CropTransparentSides
pub fn crop_sides(b: &Bmp) -> Bmp {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let col = |x: i32| (0..h).any(|y| alpha(b, x, y) > 0);
    let Some(l) = (0..w).find(|x| col(*x)) else { return RgbaImage::new(0, h as u32) };
    let r = (0..w).rev().find(|x| col(*x)).unwrap_or(l);
    copy_rect(b, l, 0, r - l + 1, h)
}

/// บิดภาพเอียงให้ตั้งตรง แถวที่ y เลื่อนขวา round(y × factor) จุด แล้วตัดคอลัมน์ใสสองข้าง · ตาม UnItalic
pub fn un_italic(b: &Bmp, factor: f64) -> Bmp {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let max_shift = (h as f64 * factor) as i32;
    let mut out = RgbaImage::new((w + max_shift + 4).max(1) as u32, h as u32);
    for y in 0..h {
        let s = round_away(y as f64 * factor);
        for x in 0..w { let nx = x + s; if nx >= 0 && nx < out.width() as i32 { out.put_pixel(nx as u32, y as u32, *b.get_pixel(x as u32, y as u32)); } }
    }
    crop_sides(&out)
}

