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
        Some(c)
    }

    /// ตัวที่ใช้ได้ ขนาดไม่เกินจอ 1080p และข้อความไม่มี \0 · ตาม NOcrChar.cs ของ Subtitle Edit
    pub fn is_valid(&self) -> bool { self.width > 0 && self.height > 0 && self.width <= 1920 && self.height <= 1080 && !self.text.contains('\0') }

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

/// เส้นฐานของชิ้นเทียบกับบรรทัด
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Placement { Unknown, OnBaseline, AboveBaseline }

/// ชั้นความเข้มงวดหนึ่งชั้นของการจับคู่ · ค่า i32::MAX คือไม่ตรวจข้อนั้น · ตาม MatchPass
pub(crate) struct Pass {
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
        // ตัวที่ใช้ไม่ได้ข้ามไปอ่านตัวถัดไป · เดิมเจอตัวเสียตัวแรกแล้วหยุดทั้งไฟล์ ตัวที่สอนใหม่อยู่หน้าสุด เปิดฐานจึงได้ฐานว่างแล้วบันทึกทับจนหาย (ผู้ช่วยตรวจทาน R3)
        while let Some(c) = NChar::read(&mut pos, &buf, v2) {
            if !c.is_valid() { continue; }
            if c.expand_count > 0 { db.expanded.push(c); } else { db.chars.push(c); }
        }
        Ok(db)
    }

    /// บันทึกลงชื่อชั่วคราวแล้วย้ายทับไฟล์เดิม (ไฟล์เดิมลงถังขยะ) · ตาม Save
    pub fn save(&self) -> Result<(), String> {
        let mut raw = b"V2".to_vec();
        // ตัวที่เปิดฐานแล้วใช้ไม่ได้ (ใหญ่เกิน 1920 × 1080) ไม่บันทึก · ใช้ได้ในรอบนี้แต่ไม่ทำให้ฐานเสีย (ผู้ช่วยตรวจทาน R3)
        for c in self.chars.iter().chain(&self.expanded).filter(|c| c.is_valid()) { c.write(&mut raw); }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&raw).map_err(|e| e.to_string())?;
        let gz = enc.finish().map_err(|e| e.to_string())?;
        if let Some(d) = self.file.parent() { std::fs::create_dir_all(d).map_err(|e| format!("สร้างโฟลเดอร์ฐานไม่ได้ {e}"))?; }
        let part = PathBuf::from(format!("{}.partial", self.file.display()));
        std::fs::write(&part, gz).map_err(|e| format!("เขียนไฟล์ฐาน nOCR ไม่ได้ {e}"))?;
        crate::app::outfile::replace_often(&part, &self.file)?;
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

mod matching;
pub use matching::*;

mod bitmap;
pub use bitmap::*;

#[cfg(test)]
mod tests;
