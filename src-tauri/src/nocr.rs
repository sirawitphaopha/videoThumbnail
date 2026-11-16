//! nOCR ตัวอ่านแบบจับคู่เส้นของ Subtitle Edit (แผน OCR ขั้น 5 · BUGS ข้อ 143) ส่วนฐานตัวอักษรกับตัวจับคู่
//! ตัวอักษรหนึ่งตัวในฐานคือชุดเส้นตรง เส้นหน้า (ต้องทับหมึก) กับเส้นหลัง (ต้องอยู่บนพื้นใส) ย่อขยายตามขนาดภาพที่จะจับคู่
//! ไฟล์ฐาน .nocr บีบด้วย gzip รูปแบบเดียวกับ Subtitle Edit เปิดฐานของ Subtitle Edit ได้ และฐานที่ชั้นหนังบันทึกเปิดใน Subtitle Edit ได้
//!
//! แปลจาก src/libuilogic/Ocr/NOcrDb.cs NOcrChar.cs NOcrLine.cs ImageSplitterItem2.cs และ UnItalic CopyRectangle ของ NikseBitmap2.cs
//! ใน Subtitle Edit สัญญา MIT · Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//! ตัวจับคู่ทำตามลำดับเดิมทุกขั้น ตรงขนาดพอดีไม่ผิดสักจุดก่อน แล้วตัวอักษรหลายชิ้น (เช่นเครื่องหมายคำพูดสองขีด) แล้วไล่ชั้นความเข้มงวดเจ็ดชั้น
//! เลือกตัวที่สัดส่วนจุดผิดต่ำสุดในชั้น ตัวพิมพ์ใหญ่เล็กที่หน้าตาเหมือนกันตัดสินด้วยตำแหน่งบน ตัวเอียงลองบิดภาพตั้งตรงแล้วจับคู่ใหม่
//! ตัวอักษรสองตัวที่เขียนติดกัน ตัดตามคอลัมน์ที่บางที่สุดแล้วจับคู่ทีละครึ่ง · จุด จุลภาค เครื่องหมายคำพูด ตัดสินด้วยเส้นฐานของบรรทัด

// ตัวคุมงาน OCR (ขั้น 10) เป็นคนเรียก ระหว่างนี้ยังไม่มีผู้ใช้นอกเทส
#![allow(dead_code)]

use image::RgbaImage;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub type Bmp = RgbaImage;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Pt { pub x: i32, pub y: i32 }

/// เส้นหนึ่งเส้นของตัวอักษร
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct NLine { pub start: Pt, pub end: Pt }

fn round_away(v: f64) -> i32 { if v >= 0.0 { (v + 0.5).floor() as i32 } else { -((-v + 0.5).floor() as i32) } }

impl NLine {
    pub fn new(sx: i32, sy: i32, ex: i32, ey: i32) -> Self { NLine { start: Pt { x: sx, y: sy }, end: Pt { x: ex, y: ey } } }
    pub fn is_empty(&self) -> bool { self.start == self.end }

    /// จุดทุกจุดบนเส้น · ด้านที่ยาวกว่าเดินทีละหนึ่ง อีกด้านปัดแบบห่างจากศูนย์ · ตาม GetPoints กับ LinePointWalker
    pub fn points_of(start: Pt, end: Pt) -> Vec<Pt> {
        let (dx, dy) = (end.x - start.x, end.y - start.y);
        let mut out = vec![];
        if dx.abs() > dy.abs() {
            let (x1, y1, x2, y2) = if dx > 0 { (start.x, start.y, end.x, end.y) } else { (end.x, end.y, start.x, start.y) };
            let f = (y2 - y1) as f64 / (x2 - x1) as f64;
            for i in x1..=x2 { out.push(Pt { x: i, y: round_away(y1 as f64 + f * (i - x1) as f64) }); }
        } else {
            let (x1, y1, x2, y2) = if dy > 0 { (start.x, start.y, end.x, end.y) } else { (end.x, end.y, start.x, start.y) };
            // เส้นที่เหลือจุดเดียว (มักเกิดตอนย่อเส้นสั้นลงภาพเล็ก) Subtitle Edit หาร 0 ด้วย 0 ได้ NaN แล้ว .NET 9 ขึ้นไปแปลง NaN เป็นจำนวนเต็มได้ 0
            // จุดที่ตรวจจึงอยู่คอลัมน์ 0 ไม่ใช่จุดเดิม · ทำตามเพื่อให้ผลเท่า SeConv (พิสูจน์กับซับ ACCA 16 พ.ย. 2569 ' ในตัวเอียงเคยเป็น #)
            if y2 == y1 { out.push(Pt { x: 0, y: y1 }); return out; }
            let f = (x2 - x1) as f64 / (y2 - y1) as f64;
            for i in y1..=y2 { out.push(Pt { x: round_away(x1 as f64 + f * (i - y1) as f64), y: i }); }
        }
        out
    }
    pub fn points(&self) -> Vec<Pt> { Self::points_of(self.start, self.end) }

    pub fn scaled_start(&self, c: &NChar, w: i32, h: i32) -> Pt {
        Pt { x: round_away(self.start.x as f64 * w as f64 / c.width as f64), y: round_away(self.start.y as f64 * h as f64 / c.height as f64) }
    }
    pub fn scaled_end(&self, c: &NChar, w: i32, h: i32) -> Pt {
        Pt { x: round_away(self.end.x as f64 * w as f64 / c.width as f64), y: round_away(self.end.y as f64 * h as f64 / c.height as f64) }
    }
    pub fn scaled_points(&self, c: &NChar, w: i32, h: i32) -> Vec<Pt> { Self::points_of(self.scaled_start(c, w, h), self.scaled_end(c, w, h)) }
}

/// ตัวอักษรหนึ่งตัวในฐาน · expand_count มากกว่า 0 คือตัวที่ประกอบจากหลายชิ้นในภาพ
#[derive(Debug, Clone, PartialEq, Default)]
pub struct NChar {
    pub text: String,
    pub width: i32,
    pub height: i32,
    pub margin_top: i32,
    pub italic: bool,
    pub fg: Vec<NLine>,
    pub bg: Vec<NLine>,
    pub expand_count: i32,
}

impl NChar {
    pub fn named(text: &str) -> Self { NChar { text: text.into(), ..Default::default() } }
    /// ความสูงเป็นร้อยละของความกว้าง ใช้กรองสัดส่วนก่อนเทียบจุด
    pub fn h2w(&self) -> f64 { self.height as f64 * 100.0 / self.width as f64 }
    /// ตัวที่หน้าตาคล้ายกันมาก (O o 0 ' - : ") ได้งบจุดผิดของตัวเอง
    pub fn is_sensitive(&self) -> bool { matches!(self.text.as_str(), "O" | "o" | "0" | "'" | "-" | ":" | "\"") }
    /// สำเนาแบบ NOcrChar(NOcrChar old) ไม่คัด expand_count
    pub fn copy(&self) -> Self { NChar { expand_count: 0, ..self.clone() } }

    /// อ่านหนึ่งตัวจากไฟล์ที่ตำแหน่ง pos · คืน None เมื่อจบไฟล์หรือข้อมูลเสีย · ตาม NOcrChar(ref position, file, isVersion2)
    pub fn read(pos: &mut usize, f: &[u8], v2: bool) -> Option<NChar> {
        let b = |p: &mut usize| -> Option<i32> { let v = *f.get(*p)? as i32; *p += 1; Some(v) };
        let w16 = |p: &mut usize| -> Option<i32> { let hi = b(p)?; let lo = b(p)?; Some(hi << 8 | lo) };
        let mut c = NChar::default();
        let short;
        if v2 {
            if *pos + 4 >= f.len() { return None; }
            short = f[*pos] & 0b0001_0000 > 0;
            c.italic = f[*pos] & 0b0010_0000 > 0;
            if short {
                c.expand_count = b(pos)? & 0b1111;
                c.width = b(pos)?; c.height = b(pos)?; c.margin_top = b(pos)?;
            } else {
                *pos += 1;
                c.expand_count = b(pos)?;
                c.width = w16(pos)?; c.height = w16(pos)?; c.margin_top = w16(pos)?;
            }
        } else {
            if *pos + 9 > f.len() { return None; }
            short = false;
            c.width = w16(pos)?; c.height = w16(pos)?; c.margin_top = w16(pos)?;
            c.italic = b(pos)? != 0;
            c.expand_count = b(pos)?;
        }
        let len = b(pos)? as usize;
        if len > 0 { c.text = String::from_utf8_lossy(f.get(*pos..*pos + len)?).to_string(); *pos += len; }
        let lines = |p: &mut usize| -> Option<Vec<NLine>> {
            let n = if short { b(p)? } else { w16(p)? };
            let mut v = Vec::with_capacity(n as usize);
            for _ in 0..n {
                v.push(if short { NLine::new(b(p)?, b(p)?, b(p)?, b(p)?) } else { NLine::new(w16(p)?, w16(p)?, w16(p)?, w16(p)?) });
            }
            Some(v)
        };
        c.fg = lines(pos)?;
        c.bg = lines(pos)?;
        (c.width > 0 && c.height > 0 && c.width <= 1920 && c.height <= 1080 && !c.text.contains('\0')).then_some(c)
    }

    fn all_byte(&self) -> bool {
        let ok = |l: &[NLine]| l.len() <= 255 && l.iter().all(|p| [p.start.x, p.start.y, p.end.x, p.end.y].iter().all(|v| (0..=255).contains(v)));
        self.width <= 255 && self.height <= 255 && self.margin_top <= 255 && self.expand_count < 16 && ok(&self.fg) && ok(&self.bg)
    }

    /// เขียนตัวอักษรลงไฟล์ · ค่าทุกค่าไม่เกินหนึ่งไบต์ใช้แบบสั้น ไม่งั้นแบบสองไบต์ · ตาม Save
    pub fn write(&self, out: &mut Vec<u8>) {
        let text = self.text.as_bytes();
        let tlen = text.len().min(255);
        if self.all_byte() {
            out.push((0b0001_0000 | if self.italic { 0b0010_0000 } else { 0 } | (self.expand_count.max(0) as u8)) as u8);
            out.extend([self.width as u8, self.height as u8, self.margin_top as u8, tlen as u8]);
            out.extend(&text[..tlen]);
            for l in [&self.fg, &self.bg] {
                out.push(l.len() as u8);
                for p in l.iter() { out.extend([p.start.x as u8, p.start.y as u8, p.end.x as u8, p.end.y as u8]); }
            }
        } else {
            let w16 = |o: &mut Vec<u8>, v: i32| o.extend([((v as u32 >> 8) & 0xFF) as u8, (v as u32 & 0xFF) as u8]);
            out.push(if self.italic { 0b0010_0000 } else { 0 });
            out.push(self.expand_count as u8);
            w16(out, self.width); w16(out, self.height); w16(out, self.margin_top);
            out.push(tlen as u8);
            out.extend(&text[..tlen]);
            for l in [&self.fg, &self.bg] {
                w16(out, l.len() as i32);
                for p in l.iter() { w16(out, p.start.x); w16(out, p.start.y); w16(out, p.end.x); w16(out, p.end.y); }
            }
        }
    }
}

/// ชิ้นในภาพที่ตัวแยกตัวอักษรตัดออกมา หรือเครื่องหมายพิเศษ (ขึ้นบรรทัดใหม่ เว้นวรรค) · ตาม ImageSplitterItem2
#[derive(Debug, Clone, Default)]
pub struct Piece {
    pub x: i32,
    pub y: i32,
    pub parent_y: i32,
    pub top: i32,
    pub space_pixels: i32,
    pub bmp: Option<Bmp>,
    pub special: Option<String>,
    pub could_be_space_before: bool,
    /// เส้นฐานของบรรทัดในพิกัดเดียวกับ top · ไม่รู้เป็น None
    pub baseline: Option<i32>,
}

impl Piece {
    pub fn glyph(x: i32, y: i32, bmp: Bmp) -> Self { Piece { x, y, bmp: Some(bmp), ..Default::default() } }
    pub fn special(s: &str) -> Self { Piece { special: Some(s.into()), ..Default::default() } }
    pub fn is_newline(&self) -> bool { self.special.as_deref() == Some("\n") }
    /// ความสูงเหนือเส้นฐาน ไม่รู้เส้นฐานใช้ความสูงทั้งชิ้น
    pub fn height_above_baseline(&self) -> i32 {
        match (&self.baseline, &self.bmp) { (Some(b), Some(m)) => (m.height() as i32).min(b - self.top), (_, Some(m)) => m.height() as i32, _ => 0 }
    }
}

#[inline]
fn alpha(b: &Bmp, x: i32, y: i32) -> u8 { b.get_pixel(x as u32, y as u32)[3] }
#[inline]
fn inside(b: &Bmp, x: i32, y: i32) -> bool { x >= 0 && y >= 0 && x < b.width() as i32 && y < b.height() as i32 }

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

/// เส้นฐานของชิ้นเทียบกับบรรทัด
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement { Unknown, OnBaseline, AboveBaseline }

/// ชั้นความเข้มงวดหนึ่งชั้นของการจับคู่ · ค่า i32::MAX คือไม่ตรวจข้อนั้น · ตาม MatchPass
struct Pass {
    min_allowance: i32,
    deep_seek: bool,
    last_ditch: bool,
    aspect_max: i32,
    size_max: i32,
    top_max: i32,
    min_lines: usize,
    errors: fn(i32) -> i32,
    errors_sensitive: Option<fn(i32) -> i32>,
    aspect_sensitive: i32,
}

const NO: i32 = i32::MAX;
const PASSES: [Pass; 7] = [
    // แม่นมาก ขนาดกับสัดส่วนใกล้ ไม่ผิดสักจุด
    Pass { min_allowance: 0, deep_seek: false, last_ditch: false, aspect_max: 15, size_max: 5, top_max: 5, min_lines: 0, errors: |_| 0, errors_sensitive: None, aspect_sensitive: 0 },
    // ขนาดต่างไม่เกิน 4 จุด ผิดได้ 1
    Pass { min_allowance: 1, deep_seek: false, last_ditch: false, aspect_max: NO, size_max: 4, top_max: 8, min_lines: 0, errors: |_| 1, errors_sensitive: None, aspect_sensitive: 0 },
    // ขนาดต่างไม่เกิน 8 จุด ผิดได้ 1
    Pass { min_allowance: 1, deep_seek: false, last_ditch: false, aspect_max: NO, size_max: 8, top_max: 8, min_lines: 0, errors: |_| 1, errors_sensitive: None, aspect_sensitive: 0 },
    // ดูแค่สัดส่วน ผิดได้ไม่เกิน 3
    Pass { min_allowance: 2, deep_seek: false, last_ditch: false, aspect_max: 20, size_max: NO, top_max: 15, min_lines: 0, errors: |m| m.min(3), errors_sensitive: None, aspect_sensitive: 0 },
    // กว้าง ต้องมีเส้นมาก ผิดได้ไม่เกิน 20 ตัวที่หน้าตาคล้ายกันผิดได้ 10 สัดส่วนต่างได้ 30
    Pass { min_allowance: 10, deep_seek: false, last_ditch: false, aspect_max: 20, size_max: NO, top_max: 15, min_lines: 41, errors: |m| m.min(20), errors_sensitive: Some(|_| 10), aspect_sensitive: 30 },
    // ค้นลึก สัดส่วนกว้างมาก ผิดได้ตามที่ตั้ง
    Pass { min_allowance: 0, deep_seek: true, last_ditch: false, aspect_max: 60, size_max: NO, top_max: 17, min_lines: 51, errors: |m| m, errors_sensitive: None, aspect_sensitive: 0 },
    // ทางสุดท้าย (แปลงทีเดียวทั้งไฟล์) เดาตัวที่ใกล้ที่สุดแทนเครื่องหมาย * ผิดได้สองเท่า
    Pass { min_allowance: 0, deep_seek: false, last_ditch: true, aspect_max: 80, size_max: NO, top_max: 25, min_lines: 15, errors: |m| m * 2, errors_sensitive: None, aspect_sensitive: 0 },
];

const SMALL_AREA: i32 = 150;
const SMALL_MAX_ASPECT: f64 = 2.0;
const SMALL_MAX_AREA_RATIO: i32 = 5;
const CASE_TWIN_MARGIN: f64 = 0.01;
const UNACCENTED_MARGIN: f64 = 0.02;
const UNPLACED_MARK_MAX: f64 = 0.15;
const ITALIC_CHALLENGE_MIN: f64 = 0.02;
const ITALIC_CHALLENGE_RATIO: f64 = 1.5;
const ITALIC_STEEPER: f64 = 1.5;
const MATCH_CACHE_MAX: usize = 5000;
pub const CYRILLIC_CASE_TWINS: &str = "вВгГдДжЖзЗиИкКлЛмМнНоОпПсСтТуУхХцЦчЧшШщЩъЪыЫьЬэЭюЮяЯєЄѕЅљЉњЊџЏ";
const SAME_SHAPE_CAPITALS: &str = "CKOPSUVWXZ";

fn is_case_twin(t: &str) -> bool {
    let mut c = t.chars();
    matches!((c.next(), c.next()), (Some(ch), None) if "cCoOsSuUvVwWxXzZøØ".contains(ch) || CYRILLIC_CASE_TWINS.contains(ch))
}
fn first_char(t: &str) -> char { t.chars().next().unwrap_or(' ') }
fn all_letter_digit(t: &str) -> bool { t.chars().all(char::is_alphanumeric) }
fn is_dotted_i(t: &str) -> bool { let mut c = t.chars(); matches!((c.next(), c.next()), (Some(ch), None) if "iìíîïjĵÌÍÎÏĴ".contains(ch)) }
fn is_baseline_mark(t: &str) -> bool { matches!(t, "." | "…" | "," | "„" | "_") }

/// ฐานตัวอักษรของ nOCR
pub struct NOcrDb {
    pub file: PathBuf,
    pub chars: Vec<NChar>,
    pub expanded: Vec<NChar>,
    cache: Mutex<HashMap<CacheKey, (Option<NChar>, Option<NChar>)>>,
}

#[derive(Hash, PartialEq, Eq)]
struct CacheKey { px: Vec<u8>, w: u32, top: i32, max: i32, deep: bool, last: bool, italic: u64, place: u8 }

impl NOcrDb {
    pub fn empty(file: &Path) -> Self { NOcrDb { file: file.into(), chars: vec![], expanded: vec![], cache: Mutex::new(HashMap::new()) } }

    /// เปิดไฟล์ฐาน · ไม่มีไฟล์ได้ฐานว่าง · ตาม LoadOcrCharacters
    pub fn load(file: &Path) -> Result<Self, String> {
        let mut db = Self::empty(file);
        if !file.is_file() { return Ok(db); }
        let raw = std::fs::read(file).map_err(|e| format!("อ่านไฟล์ฐาน nOCR ไม่ได้ {e}"))?;
        let mut buf = vec![];
        flate2::read::GzDecoder::new(&raw[..]).read_to_end(&mut buf).map_err(|_| "ไฟล์ฐาน nOCR เสีย ถอดไฟล์ที่บีบไว้ไม่ได้".to_string())?;
        let v2 = buf.starts_with(b"V2");
        let mut pos = if v2 { 2 } else { 0 };
        while let Some(c) = NChar::read(&mut pos, &buf, v2) {
            if c.expand_count > 0 { db.expanded.push(c); } else { db.chars.push(c); }
        }
        Ok(db)
    }

    /// บันทึกลงชื่อชั่วคราวแล้วย้ายทับไฟล์เดิม (ไฟล์เดิมลงถังขยะ) · ตาม Save
    pub fn save(&self) -> Result<(), String> {
        let mut raw = b"V2".to_vec();
        for c in self.chars.iter().chain(&self.expanded) { c.write(&mut raw); }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&raw).map_err(|e| e.to_string())?;
        let gz = enc.finish().map_err(|e| e.to_string())?;
        if let Some(d) = self.file.parent() { std::fs::create_dir_all(d).map_err(|e| format!("สร้างโฟลเดอร์ฐานไม่ได้ {e}"))?; }
        let part = PathBuf::from(format!("{}.partial", self.file.display()));
        std::fs::write(&part, gz).map_err(|e| format!("เขียนไฟล์ฐาน nOCR ไม่ได้ {e}"))?;
        crate::outfile::replace_with(&part, &self.file)?;
        self.cache.lock().unwrap().clear();
        Ok(())
    }

    pub fn total(&self) -> usize { self.chars.len() + self.expanded.len() }

    /// เพิ่มตัวอักษรไว้หน้าสุด (ตัวที่สอนล่าสุดชนะเมื่อดีเท่ากัน) · ตาม Add
    pub fn add(&mut self, c: NChar) {
        if c.expand_count > 0 { self.expanded.insert(0, c); } else { self.chars.insert(0, c); }
        self.cache.lock().unwrap().clear();
    }

    pub fn remove(&mut self, c: &NChar) {
        let list = if c.expand_count > 0 { &mut self.expanded } else { &mut self.chars };
        if let Some(i) = list.iter().position(|x| x == c) { list.remove(i); }
        self.cache.lock().unwrap().clear();
    }

    pub fn clear_cache(&self) { self.cache.lock().unwrap().clear(); }

    // ------------------------------------------------------------ จับคู่ตัวอักษรหลายชิ้น

    /// ตัวอักษรที่ประกอบจากหลายชิ้นเริ่มที่ชิ้น idx · ตาม GetMatchExpanded
    pub fn match_expanded(&self, parent: &Bmp, list: &[Piece], idx: usize) -> Option<NChar> {
        let item = list.get(idx)?;
        let w = item.bmp.as_ref()?.width() as i32;
        for oc in &self.expanded {
            if oc.expand_count > 1 && oc.width > w && item.x + oc.width < parent.width() as i32 && oc.fg.len() + oc.bg.len() >= 1 {
                if expanded_exact(oc, item, parent, list, idx) {
                    let (sx, sy) = total_size(idx, list, oc.expand_count);
                    if (sx - oc.width).abs() < 3 && (sy - oc.height).abs() < 3 && plausible_group(oc, list, idx) { return Some(oc.clone()); }
                }
            }
        }
        for oc in &self.expanded {
            if oc.expand_count > 1 && oc.width > w && item.x + oc.width < parent.width() as i32 && oc.fg.len() + oc.bg.len() >= 1 {
                let (sx, sy) = total_size(idx, list, oc.expand_count);
                if sx <= 0 || sy <= 0 { continue; }
                let h2w = sy as f64 * 100.0 / sx as f64;
                if (h2w - oc.h2w()).abs() < 15.0 && (sx - oc.width).abs() < 25 && (sy - oc.height).abs() < 20
                    && scale_sane(sx, oc.width) && scale_sane(sy, oc.height) && expanded_scaled(oc, item, parent, sx, sy, list, idx) && plausible_group(oc, list, idx) {
                    return Some(oc.clone());
                }
            }
        }
        None
    }

    // ------------------------------------------------------------ จับคู่หลัก

    /// จับคู่ชิ้นหนึ่งในบรรทัด · italic มากกว่าศูนย์ ลองบิดภาพตั้งตรงเมื่อจับคู่ตัวตรงไม่ได้หรือได้แบบหลวม · ตาม GetMatch
    pub fn get_match(&self, parent: &Bmp, list: &[Piece], idx: usize, top_margin: i32, deep: bool, max_wrong: i32, last_ditch: bool, italic: f64) -> Option<NChar> {
        let item = list.get(idx)?;
        let bmp = item.bmp.as_ref()?;
        let place = baseline_placement(list, idx);
        let mut m = self.match_inner(parent, list, idx, top_margin, deep, max_wrong, last_ditch, italic, place);
        if place == Placement::OnBaseline && m.as_ref().is_some_and(|c| c.text == "„" && c.expand_count == 2) {
            // จุลภาคกับจุดติดกัน (",..") ก็เข้ากับเครื่องหมายคำพูดล่างสองชิ้น ชิ้นถัดไปไม่ห้อยใต้เส้นฐานให้อ่านชิ้นแรกตัวเดียว
            if list.get(idx + 1).is_some_and(|n| !hangs_below(n)) { m = self.match_single(bmp, top_margin, deep, max_wrong, last_ditch, false, place).0; }
        }
        let m = m.or_else(|| self.match_unplaced_mark(item, place));
        place_mark(m, place, item)
    }

    fn match_inner(&self, parent: &Bmp, list: &[Piece], idx: usize, top: i32, deep: bool, max_wrong: i32, last_ditch: bool, italic: f64, place: Placement) -> Option<NChar> {
        let item = &list[idx];
        let bmp = item.bmp.as_ref().unwrap();
        let key = CacheKey { px: bmp.as_raw().clone(), w: bmp.width(), top, max: max_wrong, deep, last: last_ditch, italic: italic.to_bits(), place: place as u8 };
        if let Some((exact, single)) = self.cache.lock().unwrap().get(&key).cloned() {
            if let Some(e) = exact { return self.compose_yery(Some(e), list, idx, deep, max_wrong, last_ditch); }
            return self.match_expanded(parent, list, idx).or_else(|| self.compose_yery(single, list, idx, deep, max_wrong, last_ditch));
        }
        if let Some(e) = self.exact_single(bmp, top, place) {
            self.cache_put(key, (Some(e.clone()), None));
            return self.compose_yery(Some(e), list, idx, deep, max_wrong, last_ditch);
        }
        if let Some(x) = self.match_expanded(parent, list, idx) { return Some(x); }
        let (mut single, rate) = self.match_single(bmp, top, deep, max_wrong, false, true, place);
        // ตัวเอียงมักเข้ากับตัวตรงบางตัวแบบหลวม (t เอียงเป็น f) ลองภาพที่บิดตั้งตรงทั้งแบบตามค่าและชันกว่า เก็บตัวที่เข้ากันดีกว่าชัดเจน
        if let Some(s) = single.as_ref() {
            if italic > 0.0 && rate > ITALIC_CHALLENGE_MIN && (bmp.width() * bmp.height()) as i32 >= SMALL_AREA {
                let mut best: Option<(NChar, f64)> = None;
                for f in [italic, italic * ITALIC_STEEPER] {
                    let st = un_italic(bmp, f);
                    if st.width() == 0 || st.height() == 0 { continue; }
                    if let (Some(c), r) = self.match_single(&st, top, deep, max_wrong, false, false, place) { if best.as_ref().is_none_or(|b| r < b.1) { best = Some((c, r)); } }
                }
                if let Some((c, r)) = best {
                    if r * ITALIC_CHALLENGE_RATIO <= rate && (all_letter_digit(&s.text) || all_letter_digit(&c.text)) { single = Some(NChar { italic: true, ..c.copy() }); }
                }
            }
        }
        // ตัวอักษรสองตัวเขียนติดกัน อ่านเป็นสองตัว เว้นแต่ทางสุดท้ายเจอตัวเดียวที่เข้ากันดีกว่าครึ่งที่แย่กว่า
        if single.is_none() {
            let (pair, pr) = self.touching(bmp, top, max_wrong, 0, false);
            let (guess, gr) = if last_ditch { self.match_single(bmp, top, deep, max_wrong, true, true, place) } else { (None, f64::MAX) };
            single = match (pair, guess) { (Some(p), g) if g.is_none() || pr < gr => Some(p), (_, g) => g };
        }
        // ไม่เข้ากับอะไรเลยแบบตัวตรง บิดตั้งตรงแล้วลองอีกครั้ง ทั้งตัวเดียวและตัวติดกัน ได้แล้วติดป้ายตัวเอียง
        if single.is_none() && italic > 0.0 {
            let st = un_italic(bmp, italic);
            if st.width() > 0 && st.height() > 0 {
                let m = self.match_single(&st, top, deep, max_wrong, last_ditch, false, place).0.or_else(|| self.touching(&st, top, max_wrong, 0, true).0);
                if let Some(m) = m { single = Some(NChar { italic: true, ..m.copy() }); }
            }
        }
        self.cache_put(key, (None, single.clone()));
        self.compose_yery(single, list, idx, deep, max_wrong, last_ditch)
    }

    fn cache_put(&self, k: CacheKey, v: (Option<NChar>, Option<NChar>)) {
        let mut c = self.cache.lock().unwrap();
        if c.len() >= MATCH_CACHE_MAX { c.clear(); }
        c.insert(k, v);
    }

    /// เครื่องหมายเล็กที่ไม่เข้ากับอะไร ลองกับจุลภาคและอะพอสทรอฟีโดยไม่สนตำแหน่งที่สอน แล้วให้ตำแหน่งตัดสิน · ตาม MatchUnplacedMark
    fn match_unplaced_mark(&self, item: &Piece, place: Placement) -> Option<NChar> {
        let (bmp, base) = (item.bmp.as_ref()?, item.baseline?);
        if place == Placement::Unknown || bmp.height() as i32 * 2 > base { return None; }
        let (c, cr) = self.best_by_text(bmp, ",", UNPLACED_MARK_MAX);
        let (a, ar) = self.best_by_text(bmp, "'", UNPLACED_MARK_MAX);
        if c.is_some() && (a.is_none() || cr <= ar) { c } else { a }
    }

    /// ตัวอักษรสองตัวเขียนติดกัน ตัดที่คอลัมน์บางที่สุดของครึ่งกลาง (ลองไม่เกินสามที่) จับคู่สองครึ่งแบบเข้มงวด · ตาม MatchTouchingLetters
    fn touching(&self, b: &Bmp, top: i32, max_wrong: i32, depth: i32, return_ends: bool) -> (Option<NChar>, f64) {
        let (w, h) = (b.width() as i32, b.height() as i32);
        if w < 10 || w * 10 < h * 7 { return (None, f64::MAX); }
        let ink: Vec<i32> = (0..w).map(|x| (0..h).filter(|y| alpha(b, x, *y) > 150).count() as i32).collect();
        let mut cuts: Vec<i32> = (w / 4..w / 4 + w / 2 + 1).filter(|x| *x > 0 && *x < w - 1).collect();
        cuts.sort_by_key(|x| (ink[*x as usize], (x - w / 2).abs()));
        let mut tried: Vec<i32> = vec![];
        let (mut best, mut best_rate) = (None, f64::MAX);
        for cut in cuts {
            if tried.len() == 3 { break; }
            if tried.iter().any(|t| (t - cut).abs() <= 2) { continue; }
            tried.push(cut);
            let pl = copy_rect(b, 0, 0, cut, h);
            let pr = copy_rect(b, cut + 1, 0, w - cut - 1, h);
            let mut rr = pr.clone();
            let rl = if return_ends { return_stroke_ends(b, cut, &pl, &mut rr) } else { None };
            let attempts: Vec<(Bmp, Bmp)> = match rl { Some(l) => vec![(l, rr), (pl, pr)], None => vec![(pl, pr)] };
            for (lh, rh) in attempts {
                let (Some((left, lt)), Some((right, rt))) = (trim_to_ink(&lh), trim_to_ink(&rh)) else { continue };
                let (lm, lr) = self.letter_or_pair(&left, top + lt, max_wrong, depth, return_ends);
                let Some(lm) = lm else { continue };
                if lr >= best_rate { continue; }
                let (rm, rr2) = self.letter_or_pair(&right, top + rt, max_wrong, depth, return_ends);
                let Some(rm) = rm else { continue };
                // ตัวอักษรติดกัน หรือตัวเลขติดกัน ไม่ใช่อย่างละตัว (M ที่ตัดสองครึ่งอ่านเป็น b1)
                if lm.text.chars().all(|c| c.is_ascii_digit()) != rm.text.chars().all(|c| c.is_ascii_digit()) { continue; }
                let ar = lr.max(rr2);
                if ar >= best_rate { continue; }
                let t = match harmonize_case(&lm.text, &rm.text, &left, &right, lt, rt).as_str() { "vv" => "w".to_string(), "VV" => "W".to_string(), p => p.to_string() };
                best_rate = ar;
                best = Some(NChar { text: t, width: w, height: h, margin_top: top, italic: lm.italic && rm.italic, ..Default::default() });
            }
        }
        (best, best_rate)
    }

    fn letter_or_pair(&self, part: &Bmp, top: i32, max_wrong: i32, depth: i32, return_ends: bool) -> (Option<NChar>, f64) {
        let (m, r) = self.match_single(part, top, false, max_wrong, false, false, Placement::Unknown);
        if let Some(m) = m { return if all_letter_digit(&m.text) { (Some(m), r) } else { (None, r) }; }
        if depth == 0 { self.touching(part, top, max_wrong, depth + 1, return_ends) } else { (None, f64::MAX) }
    }

    /// ь ъ ตามด้วยขีดตั้งที่สูงและบนเท่ากันคือ ы · ตาม ComposeYery
    fn compose_yery(&self, soft: Option<NChar>, list: &[Piece], idx: usize, deep: bool, max_wrong: i32, last_ditch: bool) -> Option<NChar> {
        let s = soft?;
        let item = &list[idx];
        let (Some(b), true) = (item.bmp.as_ref(), matches!(s.text.as_str(), "ь" | "Ь" | "ъ" | "Ъ")) else { return Some(s) };
        let Some(next) = list.get(idx + 1) else { return Some(s) };
        let Some(nb) = next.bmp.as_ref() else { return Some(s) };
        let h = b.height() as i32;
        let tol = 2.max(h / 8);
        if (nb.height() as i32 - h).abs() > tol || (next.top - item.top).abs() > tol || nb.width() >= b.width() { return Some(s); }
        let bar = self.match_single(nb, next.top, deep, max_wrong, last_ditch, false, Placement::Unknown).0;
        if !bar.is_some_and(|c| matches!(c.text.as_str(), "І" | "і" | "Ї" | "ї" | "l" | "I" | "|" | "/" | "1")) { return Some(s); }
        let t = if matches!(s.text.as_str(), "ь" | "ъ") { "ы" } else { "Ы" };
        Some(NChar { text: t.into(), expand_count: 2, ..s.copy() })
    }

    /// ตรงขนาดพอดีและไม่ผิดสักจุด (ตัวที่ผู้ใช้สอนไว้สำหรับภาพนี้) · ตาม GetExactMatchSingle
    fn exact_single(&self, b: &Bmp, top: i32, place: Placement) -> Option<NChar> {
        let (w, h) = (b.width() as i32, b.height() as i32);
        self.chars.iter().find(|oc| oc.width == w && oc.height == h && ((oc.margin_top - top).abs() < 5 || by_baseline(b, oc, place)) && fits_placement(oc, place) && is_match(b, oc, 0)).cloned()
    }

    /// จับคู่ตัวเดียวตามชั้นความเข้มงวด คืนตัวที่ได้กับสัดส่วนจุดผิด (0 คือตรงพอดี f64::MAX คือไม่เจอ) · ตาม GetMatchSingle
    pub fn match_single(&self, b: &Bmp, top: i32, deep: bool, max_wrong: i32, last_ditch: bool, skip_exact: bool, place: Placement) -> (Option<NChar>, f64) {
        if !skip_exact { if let Some(e) = self.exact_single(b, top, place) { return (Some(e), 0.0); } }
        let (w, h) = (b.width() as i32, b.height() as i32);
        if w == 0 || h == 0 { return (None, f64::MAX); }
        let h2w = h as f64 * 100.0 / w as f64;
        let area_cap = 8.max(w * h / 8);
        let gap = has_gap_or_neck(b);
        for pass in &PASSES {
            if (pass.deep_seek && !deep) || (pass.last_ditch && !last_ditch) || max_wrong < pass.min_allowance { continue; }
            let allowed = (pass.errors)(max_wrong);
            let (mut best, mut best_rate): (Option<&NChar>, f64) = (None, f64::MAX);
            let (mut up, mut up_rate): (Option<NChar>, f64) = (None, f64::MAX);
            let (mut lo, mut lo_rate): (Option<NChar>, f64) = (None, f64::MAX);
            for oc in &self.chars {
                if !pass_filter(b, h2w, oc, top, pass, place) || !fits_placement(oc, place) || (!gap && is_dotted_i(&oc.text)) { continue; }
                let mut cand = match pass.errors_sensitive { Some(f) if oc.is_sensitive() => f(max_wrong), _ => allowed };
                let scale = h as f64 / oc.height as f64;
                if scale > 1.0 { cand = (cand as f64 * scale).round_ties_even() as i32; }
                let mut budget = cand.min(area_cap);
                if best.is_some() {
                    let maxp = points_upper(oc, w, h);
                    budget = budget.min(((best_rate + CASE_TWIN_MARGIN) * maxp as f64).ceil() as i32 - 1);
                }
                if let Some((err, pts)) = count_errors(b, oc, budget) {
                    if pts == 0 { continue; }
                    let rate = err as f64 / pts as f64;
                    if is_case_twin(&oc.text) {
                        let ch = first_char(&oc.text);
                        if ch.is_uppercase() && rate < up_rate { up = Some(oc.clone()); up_rate = rate; } else if ch.is_lowercase() && rate < lo_rate { lo = Some(oc.clone()); lo_rate = rate; }
                    }
                    if rate < best_rate {
                        best = Some(oc);
                        best_rate = rate;
                        if err == 0 && !is_case_twin(&oc.text) { break; }
                    }
                }
            }
            let mut best = best.cloned();
            if let Some(bt) = best.as_ref() {
                if is_case_twin(&bt.text) && (up.is_none() || lo.is_none()) {
                    let ch = first_char(&bt.text);
                    let twin: String = if ch.is_uppercase() { bt.text.to_lowercase() } else { bt.text.to_uppercase() };
                    let (t, tr) = self.best_by_text(b, &twin, best_rate + CASE_TWIN_MARGIN);
                    if first_char(&twin).is_uppercase() { up = t; up_rate = tr; } else { lo = t; lo_rate = tr; }
                }
            }
            best = resolve_case_twin(best, best_rate, up, up_rate, lo, lo_rate, h, top);
            best = self.prefer_unaccented(b, best, best_rate);
            if best.is_some() { return (best, best_rate); }
        }
        (None, f64::MAX)
    }

    /// ì Ì ต้องชนะ i I อย่างชัดเจน ไม่งั้นใช้ตัวไม่มีเครื่องหมาย · ตาม PreferUnaccented
    fn prefer_unaccented(&self, b: &Bmp, best: Option<NChar>, rate: f64) -> Option<NChar> {
        let plain = match best.as_ref().map(|c| c.text.as_str()) { Some("ì") => "i", Some("Ì") => "I", _ => return best };
        self.best_by_text(b, plain, rate + UNACCENTED_MARGIN).0.or(best)
    }

    /// ตัวที่ข้อความนี้และสัดส่วนใกล้กันที่เข้ากับภาพที่สุด ถ้าสัดส่วนจุดผิดต่ำกว่า max_rate · ตาม FindBestByText
    pub(crate) fn best_by_text(&self, b: &Bmp, text: &str, max_rate: f64) -> (Option<NChar>, f64) {
        let (w, h) = (b.width() as i32, b.height() as i32);
        let h2w = h as f64 * 100.0 / w.max(1) as f64;
        let (mut best, mut br) = (None, max_rate);
        for oc in &self.chars {
            if oc.text != text || (h2w - oc.h2w()).abs() * 100.0 / h2w.min(oc.h2w()) >= 30.0 { continue; }
            let maxp = points_upper(oc, w, h);
            if let Some((e, p)) = count_errors(b, oc, (br * maxp as f64).ceil() as i32) {
                if p > 0 && e as f64 / p as f64 <= br { best = Some(oc.clone()); br = e as f64 / p as f64; }
            }
        }
        (best, br)
    }
}

/// ทุกชิ้นที่ตัวอักษรหลายชิ้นอ้าง ต้องมีส่วนบนของชิ้นอื่นอยู่เหนือตัวหลัก (ตัวมีเครื่องหมายเช่น û) · ตาม IsPlausibleGroup
fn plausible_group(oc: &NChar, list: &[Piece], idx: usize) -> bool {
    use unicode_normalization_lite::decomposed_len;
    let mut ch = oc.text.chars();
    let one = matches!((ch.next(), ch.next()), (Some(c), None) if c.is_alphabetic());
    if !one || decomposed_len(&oc.text) < 2 || idx + oc.expand_count as usize > list.len() { return true; }
    let parts = &list[idx..idx + oc.expand_count as usize];
    if parts.iter().any(|p| p.bmp.is_none()) { return true; }
    let (li, letter) = parts.iter().enumerate().max_by_key(|(_, p)| p.bmp.as_ref().unwrap().height()).unwrap();
    let lh = letter.bmp.as_ref().unwrap().height() as i32;
    let tol = 2.max(lh / 6);
    parts.iter().enumerate().all(|(i, p)| i == li || p.top + p.bmp.as_ref().unwrap().height() as i32 <= letter.top + tol)
}

/// ย่อขยายตัวหลายชิ้นได้ไม่เกิน 2.5 เท่า · ตาม IsScaleRatioSane
fn scale_sane(t: i32, c: i32) -> bool { t > 0 && c > 0 && t.max(c) * 2 <= t.min(c) * 5 }

/// ชิ้นที่มีหมึกที่ (x, y) ในกลุ่มที่อ้าง นับจากชิ้นแรกของกลุ่ม · ไม่มีคืน None · ตาม GroupForegroundPiece
fn group_piece(list: &[Piece], idx: usize, count: i32, x: i32, y: i32) -> Option<usize> {
    let end = list.len().min(idx + count.max(0) as usize);
    (idx..end).find(|i| { let it = &list[*i]; it.bmp.as_ref().is_some_and(|b| { let (lx, ly) = (x - it.x, y - it.y); inside(b, lx, ly) && alpha(b, lx, ly) > 150 }) }).map(|i| i - idx)
}

fn expanded_exact(oc: &NChar, item: &Piece, parent: &Bmp, list: &[Piece], idx: usize) -> bool {
    for op in &oc.fg {
        for p in op.points() {
            let (x, y) = (p.x + item.x, p.y + item.y - oc.margin_top);
            if !inside(parent, x, y) || group_piece(list, idx, oc.expand_count, x, y).is_none() { return false; }
        }
    }
    for op in &oc.bg {
        for p in op.points() {
            let (x, y) = (p.x + item.x, p.y + item.y - oc.margin_top);
            if inside(parent, x, y) && alpha(parent, x, y) > 150 { return false; }
        }
    }
    true
}

/// ตัวหลายชิ้นย่อขยายตามกรอบจริงของกลุ่ม · ทุกชิ้นที่อ้างต้องมีเส้นหน้าแตะ · จุดผิดไม่เกินราว 5% ของจุดที่เดิน · ตาม IsExpandedLineMatchScaled
fn expanded_scaled(oc: &NChar, item: &Piece, parent: &Bmp, tw: i32, th: i32, list: &[Piece], idx: usize) -> bool {
    let (mut err, mut pts) = (0, 0);
    let mt = round_away(oc.margin_top as f64 * th as f64 / oc.height.max(1) as f64);
    let oy = item.y - mt;
    let n = (oc.expand_count as usize).min(list.len() - idx);
    let mut touched = vec![false; n];
    for op in &oc.fg {
        for p in op.scaled_points(oc, tw, th) {
            pts += 1;
            let (x, y) = (p.x + item.x, p.y + oy);
            match if inside(parent, x, y) { group_piece(list, idx, oc.expand_count, x, y) } else { None } { Some(i) => touched[i] = true, None => err += 1 }
        }
    }
    if (0..n).any(|i| !touched[i] && list[idx + i].bmp.is_some()) { return false; }
    for op in &oc.bg {
        for p in op.scaled_points(oc, tw, th) {
            pts += 1;
            let (x, y) = (p.x + item.x, p.y + oy);
            if inside(parent, x, y) && alpha(parent, x, y) > 150 { err += 1; }
        }
    }
    err <= 4.max(pts / 20)
}

/// กรอบรวมของ count ชิ้นเริ่มที่ idx · ไม่ครบคืน (-100, -100) · ตาม GetTotalSize
fn total_size(idx: usize, list: &[Piece], count: i32) -> (i32, i32) {
    if idx + count as usize > list.len() { return (-100, -100); }
    let (mut x0, mut x1, mut y0, mut y1) = (i32::MAX, i32::MIN, i32::MAX, i32::MIN);
    for it in &list[idx..idx + count as usize] {
        let Some(b) = it.bmp.as_ref() else { return (-100, -100) };
        y0 = y0.min(it.y); y1 = y1.max(it.y + b.height() as i32); x0 = x0.min(it.x); x1 = x1.max(it.x + b.width() as i32);
    }
    (x1 - x0, y1 - y0)
}

/// ชิ้นห้อยใต้เส้นฐานเกินหนึ่งในยี่สิบของความสูงบรรทัด (หางของจุลภาค) · ตาม HangsBelowBaseline
fn hangs_below(it: &Piece) -> bool {
    matches!((it.baseline, it.bmp.as_ref()), (Some(b), Some(m)) if it.top + m.height() as i32 - b > 1.max(b / 20))
}

/// ตำแหน่งของเครื่องหมายเล็กเทียบเส้นฐาน · ต้องมีชิ้นที่สูงกว่าครึ่งเท่าอย่างน้อยสามชิ้นในบรรทัด · ตาม GetBaselinePlacement
pub fn baseline_placement(list: &[Piece], idx: usize) -> Placement {
    let item = &list[idx];
    let (Some(base), Some(b)) = (item.baseline, item.bmp.as_ref()) else { return Placement::Unknown };
    if base <= 0 { return Placement::Unknown; }
    let mut start = idx;
    while start > 0 && !list[start - 1].is_newline() { start -= 1; }
    let taller = list[start..].iter().take_while(|p| !p.is_newline()).filter(|p| p.bmp.as_ref().is_some_and(|m| m.height() * 2 >= b.height() * 3)).count();
    if taller < 3 { return Placement::Unknown; }
    let gap = base - (item.top + b.height() as i32);
    if gap <= 2.max(base / 10) { Placement::OnBaseline } else if gap >= 3.max(base / 5) { Placement::AboveBaseline } else { Placement::Unknown }
}

/// ขีดกับองศาไม่อยู่บนเส้นฐาน จุดกับขีดล่างไม่ลอยเหนือ · ตาม FitsBaselinePlacement
fn fits_placement(oc: &NChar, p: Placement) -> bool {
    match p {
        Placement::OnBaseline => !matches!(oc.text.as_str(), "-" | "‐" | "–" | "—" | "°" | "^"),
        Placement::AboveBaseline => !matches!(oc.text.as_str(), "." | "…" | "_"),
        Placement::Unknown => true,
    }
}

/// จุลภาคเหนือเส้นฐานคืออะพอสทรอฟี เครื่องหมายคำพูดบนเส้นฐานคือจุลภาค จุลภาคที่ไม่ห้อยและกว้างพอคือจุด · ตาม PlaceMark
fn place_mark(m: Option<NChar>, p: Placement, item: &Piece) -> Option<NChar> {
    let mc = m.as_ref()?;
    let b = item.bmp.as_ref()?;
    let t = match (p, mc.text.as_str()) {
        (Placement::OnBaseline, ",") if !hangs_below(item) && b.height() * 2 <= b.width() * 3 => ".",
        (Placement::AboveBaseline, ",") => "'",
        (Placement::AboveBaseline, "„") => "\"",
        (Placement::OnBaseline, "'" | "’" | "‘" | "`" | "´") => ",",
        (Placement::OnBaseline, "\"" | "“" | "”") => "„",
        _ => return m,
    };
    Some(NChar { text: t.into(), expand_count: mc.expand_count, ..mc.copy() })
}

/// จุด จุลภาค เครื่องหมายคำพูดล่าง บนเส้นฐาน จับคู่ด้วยตำแหน่งนั้นแทนตำแหน่งบนที่สอน · ตาม MatchesByBaseline
fn by_baseline(b: &Bmp, oc: &NChar, p: Placement) -> bool { p == Placement::OnBaseline && ((b.width() * b.height()) as i32) < SMALL_AREA && is_baseline_mark(&oc.text) }

fn pass_filter(b: &Bmp, h2w: f64, oc: &NChar, top: i32, pass: &Pass, place: Placement) -> bool {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (area, oa) = (w * h, oc.width * oc.height);
    let small = area.min(oa);
    if small < SMALL_AREA && area.max(oa) > small * SMALL_MAX_AREA_RATIO { return false; }
    if area < SMALL_AREA {
        let (big, sm) = (h2w.max(oc.h2w()), h2w.min(oc.h2w()));
        if sm <= 0.0 || big / sm > SMALL_MAX_ASPECT { return false; }
    } else {
        let amax = if oc.is_sensitive() && pass.aspect_sensitive != 0 { pass.aspect_sensitive } else { pass.aspect_max };
        let delta = (h2w - oc.h2w()).abs() * 100.0 / h2w.min(oc.h2w());
        if amax != NO && delta >= amax as f64 { return false; }
    }
    if pass.size_max != NO && ((w - oc.width).abs() >= pass.size_max || (h - oc.height).abs() >= pass.size_max) { return false; }
    let scale = h as f64 / oc.height as f64;
    if (oc.margin_top as f64 * scale - top as f64).abs() >= pass.top_max as f64 * scale.max(1.0) && !by_baseline(b, oc, place) { return false; }
    !(pass.min_lines > 0 && oc.fg.len() + oc.bg.len() < pass.min_lines)
}

/// ตัวที่หน้าตาเหมือนกันทั้งพิมพ์ใหญ่เล็ก ถ้าอีกแบบเข้ากันใกล้เคียง เลือกแบบที่ตำแหน่งบนที่สอนใกล้ตำแหน่งจริงกว่า · ตาม ResolveCaseTwin
fn resolve_case_twin(best: Option<NChar>, br: f64, up: Option<NChar>, ur: f64, lo: Option<NChar>, lr: f64, h: i32, top: i32) -> Option<NChar> {
    let (Some(b), Some(u), Some(l)) = (best.as_ref(), up.as_ref(), lo.as_ref()) else { return best };
    if !is_case_twin(&b.text) || u.text.to_lowercase() != l.text.to_lowercase() || ur.max(lr) > br + CASE_TWIN_MARGIN { return best; }
    let d = |oc: &NChar| (oc.margin_top as f64 * h as f64 / oc.height as f64 - top as f64).abs();
    if d(u) <= d(l) { up } else { lo }
}

/// แถวที่ว่างหรือคอคอดระหว่างส่วนบนกับส่วนที่เหลือ (จุดของ i) · ตาม HasGapOrNeck
fn has_gap_or_neck(b: &Bmp) -> bool {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let counts: Vec<i32> = (0..h).map(|y| (0..w).filter(|x| alpha(b, *x, y) > 150).count() as i32).collect();
    let mut max_above = counts.first().copied().unwrap_or(0);
    for y in 1..(h as usize).saturating_sub(1) {
        if counts[y] == 0 || counts[y] * 10 <= max_above.min(counts[y + 1]) * 4 { return true; }
        max_above = max_above.max(counts[y]);
    }
    false
}

/// จำนวนจุดที่จะเดินถ้าไม่มีจุดตกขอบ · ตาม CountPointsUpperBound
fn points_upper(oc: &NChar, w: i32, h: i32) -> i32 {
    oc.fg.iter().chain(&oc.bg).map(|op| { let (s, e) = (op.scaled_start(oc, w, h), op.scaled_end(oc, w, h)); (e.x - s.x).abs().max((e.y - s.y).abs()) + 1 }).sum()
}

/// นับจุดผิดกับจำนวนจุดที่เดิน · เกินงบคืน None · ตาม TryCountErrors
pub fn count_errors(b: &Bmp, oc: &NChar, allowed: i32) -> Option<(i32, i32)> {
    if allowed < 0 || oc.fg.len() + oc.bg.len() < 1 { return None; }
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut err, mut pts) = (0, 0);
    for (lines, fg) in [(&oc.fg, true), (&oc.bg, false)] {
        for op in lines {
            for p in op.scaled_points(oc, w, h) {
                if p.x >= 0 && p.y >= 0 && p.x < w && p.y < h {
                    pts += 1;
                    let on = alpha(b, p.x, p.y) > 150;
                    if on != fg { err += 1; if err > allowed { return None; } }
                }
            }
        }
    }
    Some((err, pts))
}

/// เข้ากันโดยผิดไม่เกิน allowed จุด · ตาม IsMatch
pub fn is_match(b: &Bmp, oc: &NChar, allowed: i32) -> bool { count_errors(b, oc, allowed).is_some() }

/// สองครึ่งที่สูงและบนเท่ากันเป็นตัวพิมพ์แบบเดียวกัน · ตาม HarmonizeCase
pub fn harmonize_case(l: &str, r: &str, lb: &Bmp, rb: &Bmp, lt: i32, rt: i32) -> String {
    let (mut lc, mut rc) = (l.chars(), r.chars());
    let (Some(a), None, Some(c), None) = (lc.next(), lc.next(), rc.next(), rc.next()) else { return format!("{l}{r}") };
    let (lh, rh) = (lb.height() as i32, rb.height() as i32);
    let tol = 2.max(lh.max(rh) / 8);
    if (lh - rh).abs() > tol || (lt - rt).abs() > tol { return format!("{l}{r}"); }
    let (mut a, mut c) = (a, c);
    if a.is_lowercase() && c.is_uppercase() && SAME_SHAPE_CAPITALS.contains(c) { c = c.to_lowercase().next().unwrap_or(c); }
    else if a.is_uppercase() && c.is_lowercase() && SAME_SHAPE_CAPITALS.contains(a) { a = a.to_lowercase().next().unwrap_or(a); }
    format!("{a}{c}")
}

/// ส่วนที่มีหมึกของภาพกับจำนวนแถวที่ตัดออกด้านบน · เล็กเกินเป็นตัวอักษรคืน None · ตาม TrimToInk
fn trim_to_ink(b: &Bmp) -> Option<(Bmp, i32)> {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, -1, -1);
    for y in 0..h { for x in 0..w { if alpha(b, x, y) > 150 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x1 < 0 || x1 - x0 + 1 < 3 || y1 - y0 + 1 < h / 3 { return None; }
    Some((copy_rect(b, x0, y0, x1 - x0 + 1, y1 - y0 + 1), y0))
}

/// ปลายเส้นของตัวซ้ายที่เลยรอยตัดไปทางขวา (แขนของ f ขีดของ t) ส่งกลับให้ครึ่งซ้าย · คืน None เมื่อไม่มีอะไรต้องย้าย · ตาม ReturnStrokeEnds
fn return_stroke_ends(whole: &Bmp, cut: i32, left: &Bmp, right: &mut Bmp) -> Option<Bmp> {
    let (w, h) = (right.width() as i32, right.height() as i32);
    if w <= 0 || h <= 0 { return None; }
    let mut label = vec![0usize; (w * h) as usize];
    let (mut sizes, mut cont, mut maxx, mut miny, mut maxy) = (vec![0i32], vec![false], vec![0i32], vec![0i32], vec![0i32]);
    let mut stack = vec![];
    for s in 0..(w * h) as usize {
        let (sx, sy) = (s as i32 % w, s as i32 / w);
        if label[s] != 0 || alpha(right, sx, sy) <= 150 { continue; }
        let id = sizes.len();
        sizes.push(0); cont.push(false); maxx.push(0); miny.push(h); maxy.push(0);
        label[s] = id;
        stack.push(s);
        while let Some(i) = stack.pop() {
            let (x, y) = (i as i32 % w, i as i32 / w);
            sizes[id] += 1; maxx[id] = maxx[id].max(x); miny[id] = miny[id].min(y); maxy[id] = maxy[id].max(y);
            if x == 0 && alpha(whole, cut, y) > 150 { cont[id] = true; }
            for dy in -1..=1 { for dx in -1..=1 {
                let (nx, ny) = (x + dx, y + dy);
                if nx < 0 || ny < 0 || nx >= w || ny >= h { continue; }
                let n = (ny * w + nx) as usize;
                if label[n] == 0 && alpha(right, nx, ny) > 150 { label[n] = id; stack.push(n); }
            } }
        }
    }
    if sizes.len() <= 2 { return None; }
    let main = (1..sizes.len()).max_by_key(|i| (sizes[*i], std::cmp::Reverse(*i))).unwrap();
    let mut extent = 0;
    for id in 1..sizes.len() {
        if id != main && cont[id] && (maxy[id] - miny[id] + 1) * 4 <= h && sizes[id] * 4 <= sizes[main] { extent = extent.max(maxx[id] + 1); } else { cont[id] = false; }
    }
    if extent == 0 { return None; }
    let mut wide = RgbaImage::new((cut + 1 + extent) as u32, h as u32);
    for y in 0..h { for x in 0..cut.min(left.width() as i32) { let p = *left.get_pixel(x as u32, y as u32); if p[3] > 0 { wide.put_pixel(x as u32, y as u32, p); } } }
    for (i, &id) in label.iter().enumerate() {
        if id == 0 || id == main || !cont[id] { continue; }
        let (x, y) = (i as i32 % w, i as i32 / w);
        wide.put_pixel((cut + 1 + x) as u32, y as u32, *right.get_pixel(x as u32, y as u32));
        right.get_pixel_mut(x as u32, y as u32)[3] = 0;
        if x == 0 && alpha(whole, cut, y) > 150 { wide.put_pixel(cut as u32, y as u32, *whole.get_pixel(cut as u32, y as u32)); }
    }
    Some(wide)
}

/// ฐานที่มีในโฟลเดอร์ (ชื่อไม่มีนามสกุล เรียงตามชื่อ) · ตาม GetDatabases
pub fn databases(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir).into_iter().flatten().flatten().filter_map(|e| {
        let p = e.path();
        (p.extension().is_some_and(|x| x.eq_ignore_ascii_case("nocr"))).then(|| p.file_stem().unwrap().to_string_lossy().to_string())
    }).collect();
    v.sort();
    v
}

/// ตัวอักษรที่ตัดเครื่องหมายได้ (NFD ยาวกว่าหนึ่ง) แบบย่อ ไม่พึ่งห้องสมุดเพิ่ม · ใช้ตัดสินว่าเป็นตัวมีเครื่องหมายเช่น û é
pub(crate) mod unicode_normalization_lite {
    pub fn decomposed_len(s: &str) -> usize {
        // ช่วงตัวอักษรละตินที่มีเครื่องหมาย (Latin-1 Supplement ถึง Latin Extended Additional) กับซีริลลิกที่มีเครื่องหมาย ถือว่าแตกได้สองส่วน
        s.chars().map(|c| match c as u32 {
            0xC0..=0xFF if c != '×' && c != '÷' && c != 'ß' && c != 'Æ' && c != 'æ' && c != 'Ø' && c != 'ø' && c != 'Ð' && c != 'ð' && c != 'Þ' && c != 'þ' => 2,
            0x100..=0x17F | 0x1E00..=0x1EFF | 0x400..=0x40F | 0x450..=0x45F | 0x4C1..=0x4FF => 2,
            _ => 1,
        }).sum()
    }
}

#[cfg(test)]
mod tests {
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
        assert_eq!(NChar::read(&mut p, &buf, true), Some(a));
        assert_eq!(NChar::read(&mut p, &buf, true), Some(b));
        assert_eq!(NChar::read(&mut p, &buf, true), None);
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
}
