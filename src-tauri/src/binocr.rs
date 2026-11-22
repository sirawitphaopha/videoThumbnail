//! Binary OCR (แผน OCR ขั้น 6 · BUGS ข้อ 143) ตัวอ่านแบบเทียบภาพทั้งตัว ฐานเก็บภาพขาวดำของตัวอักษรที่สอนไว้ ไฟล์ .db ของ Subtitle Edit
//! ตรงพอดีใช้ค่า hash · ไม่ตรงพอดีเทียบทีละจุดกับภาพขนาดเท่ากันหรือต่างกันหนึ่งถึงสามจุด ยอมจุดผิดเป็นเปอร์เซ็นต์ · ฐาน Latin เดาจุด จุลภาค
//! อะพอสทรอฟี i j l ทวิภาค อัศเจรีย์ ขีด จากรูปทรงเมื่อไม่มีในฐาน · ฐานสำรองข้ามตัวอ่าน nOCR อ่านไม่ออกให้ Binary OCR ลอง หรือกลับกัน
//!
//! แปลจาก src/libuilogic/Ocr/BinaryOcrBitmap.cs BinaryOcrDb.cs BinaryOcrMatcher.cs IsBitmapsAlike ใน NikseBitmapImageSplitter2.cs
//! src/libse/Common/MurMurHash3.cs (public domain) กับขั้นอ่านใน src/seconv/Core/BinaryOcrOcrEngine.cs และ
//! src/ui/Features/Ocr/OcrViewModel.cs (RunBinaryImageCompareOcrLoop) ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

use crate::nocr::{copy_rect, Bmp, Piece};
use crate::nocr_split::split_letters;
use crate::nocr_text::{crop_top, merge_italic, Fallback, Hit, LineHeightTracker, LineRead, ReadOut};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// MurmurHash3 แบบ 32 บิต ค่าตั้งต้น 144 · ตาม MurMurHash3.Hash
pub fn murmur3(arr: &[u8]) -> u32 {
    const C1: u32 = 0xcc9e2d51;
    const C2: u32 = 0x1b873593;
    let mut h1: u32 = 144;
    let mix = |k: u32| k.wrapping_mul(C1).rotate_left(15).wrapping_mul(C2);
    let n = arr.len() / 4;
    for i in 0..n {
        let k = u32::from_le_bytes([arr[i * 4], arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]]);
        h1 ^= mix(k);
        h1 = h1.rotate_left(13).wrapping_mul(5).wrapping_add(0xe6546b64);
    }
    let tail = &arr[n * 4..];
    let k = match tail.len() {
        3 => tail[0] as u32 | (tail[1] as u32) << 8 | (tail[2] as u32) << 16,
        2 => tail[0] as u32 | (tail[1] as u32) << 8,
        1 => tail[0] as u32,
        _ => 0,
    };
    if !tail.is_empty() { h1 ^= mix(k); }
    h1 ^= arr.len() as u32;
    h1 ^= h1 >> 16;
    h1 = h1.wrapping_mul(0x85ebca6b);
    h1 ^= h1 >> 13;
    h1 = h1.wrapping_mul(0xc2b2ae35);
    h1 ^ (h1 >> 16)
}

// ---------------------------------------------------------------- ภาพขาวดำ

/// ภาพหนึ่งตัวในฐาน หนึ่งไบต์ต่อหนึ่งจุด (1 หมึก 0 พื้น) · ตาม BinaryOcrBitmap
#[derive(Debug, Clone, Default)]
pub struct BBmp {
    pub w: i32,
    pub h: i32,
    pub x: i32,
    pub y: i32,
    pub colored: i32,
    pub hash: u32,
    pub italic: bool,
    pub expand: i32,
    pub text: Option<String>,
    pub colors: Vec<u8>,
    /// ภาพที่ตามมาของตัวขยายจับ (ไม่มีข้อความ)
    pub expanded: Vec<BBmp>,
}

impl BBmp {
    /// จากภาพสองสี จุดที่ความทึบตั้งแต่ 100 เป็นหมึก
    pub fn from_bmp(b: &Bmp) -> Self {
        let (w, h) = (b.width() as i32, b.height() as i32);
        let colors: Vec<u8> = b.pixels().map(|p| (p[3] >= 100) as u8).collect();
        let colored = colors.iter().filter(|c| **c > 0).count() as i32;
        BBmp { w, h, colored, hash: murmur3(&colors), colors, ..Default::default() }
    }

    /// กุญแจของภาพที่หน้าต่างประวัติใช้ · ตาม Key
    pub fn key(&self) -> String { format!("{}|#|{}_{}x{}_{}", self.text.as_deref().unwrap_or(""), self.hash, self.w, self.h, self.colored) }

    /// อ่านหนึ่งภาพ หัว 16 ไบต์ ข้อความ UTF-8 แล้วจุดทีละไบต์ · อ่านไม่ครบคืน None
    fn read(buf: &[u8], pos: &mut usize) -> Option<BBmp> {
        let h = buf.get(*pos..*pos + 16)?;
        let be16 = |i: usize| (h[i] as i32) << 8 | h[i + 1] as i32;
        let mut b = BBmp {
            w: be16(0), h: be16(2), x: be16(4), y: be16(6), colored: be16(8),
            italic: h[10] & 0x80 != 0, expand: (h[10] & 0x7f) as i32,
            hash: u32::from_be_bytes([h[11], h[12], h[13], h[14]]), ..Default::default()
        };
        let tl = h[15] as usize;
        *pos += 16;
        if tl > 0 {
            let t = buf.get(*pos..(*pos + tl).min(buf.len()))?;
            b.text = Some(String::from_utf8_lossy(t).to_string());
            *pos += tl;
        }
        let n = (b.w as usize) * (b.h as usize);
        // ไฟล์ฐานเสียบอกขนาดเกินไบต์ที่เหลือในไฟล์ ถือว่าเสีย หยุดอ่าน ไม่จองหน่วยความจำมหึมา (ผู้ช่วยตรวจทาน R10)
        if n > buf.len().saturating_sub(*pos) + 16 { return None; }
        let end = (*pos + n).min(buf.len());
        b.colors = buf[*pos..end].to_vec();
        b.colors.resize(n, 0);
        *pos = end;
        Some(b)
    }

    fn write(&self, out: &mut Vec<u8>) {
        for v in [self.w, self.h, self.x, self.y, self.colored] { out.extend_from_slice(&(v as u16).to_be_bytes()); }
        out.push((self.expand & 0x7f) as u8 + if self.italic { 0x80 } else { 0 });
        out.extend_from_slice(&self.hash.to_be_bytes());
        // ความยาวเก็บหนึ่งไบต์ ข้อความยาวเกิน 255 ไบต์ตัดที่ขอบอักษร · เดิมความยาววนรอบ ภาพหลังจากนั้นเพี้ยนทั้งไฟล์ (ผู้ช่วยตรวจทาน R12)
        match &self.text {
            Some(t) => { let mut n = t.len().min(255); while !t.is_char_boundary(n) { n -= 1; } out.push(n as u8); out.extend_from_slice(&t.as_bytes()[..n]); }
            None => out.push(0),
        }
        out.extend_from_slice(&self.colors);
    }

    pub fn px(&self, x: i32, y: i32) -> u8 { self.colors[(self.w * y + x) as usize] }
    pub fn colors_equal(&self, o: &BBmp) -> bool { self.colors == o.colors }
    fn hor_clear(&self) -> Vec<bool> { (0..self.h).map(|y| (0..self.w).all(|x| self.px(x, y) == 0)).collect() }
    fn ver_clear(&self) -> Vec<bool> { (0..self.w).map(|x| (0..self.h).all(|y| self.px(x, y) == 0)).collect() }

    // ---- รูปทรงที่เดาได้โดยไม่มีในฐาน (ฐาน Latin)

    pub fn is_period(&self) -> bool {
        if self.expand > 0 || self.y < 20 { return false; }
        if self.small_dot() { return true; }
        !(self.w < self.h || self.w < 5 || self.w > 10 || self.h < 3 || self.h > 9)
    }
    fn small_dot(&self) -> bool {
        (self.w == 4 && self.h == 5 && self.colored == 20) || (self.w == 5 && self.h == 6 && self.colored >= 28) || (self.w == 6 && self.h == 7 && self.colored >= 40)
    }
    pub fn is_period_at_top(&self, lowercase_h: i32) -> bool {
        if self.expand > 0 || self.y as f64 > lowercase_h as f64 * 0.7 { return false; }
        if self.small_dot() { return true; }
        !(self.w < self.h || self.w < 5 || self.w > 10 || self.h < 3 || self.h > 9)
    }
    pub fn is_comma(&self) -> bool { !(self.expand > 0 || self.y < 20 || self.h < self.w || self.w < 4 || self.w > 12 || self.h < 8 || self.h > 15) }
    pub fn is_apostrophe(&self) -> bool {
        if self.expand > 0 || self.y > 10 || self.h < self.w - 2 || self.w < 4 || self.w > 12 || self.h < 8 || self.h > 16 { return false; }
        if self.w as f64 * self.h as f64 / self.colored as f64 > 1.2 { return false; }
        self.h as f64 / self.w as f64 >= 2.0
    }
    /// ตัว i เล็ก และเป็นตัวเอียงไหม · ตาม IsLowercaseI
    pub fn is_lowercase_i(&self) -> (bool, bool) {
        let mut italic = false;
        if self.expand > 0 || self.y > 20 || self.h < self.w + 10 || self.w < 3 || self.w > 20 || self.h < 21 || self.h > 60 { return (false, false); }
        if (self.h as f64 / self.w as f64) < 2.2 { return (false, false); }
        let (w, h) = (self.w, self.h);
        if w > h / 4 {
            if self.px(1, 1) == 0 && self.px(2, 2) == 0 && self.px(w - 1, h - 1) == 0 && self.px(w - 2, h - 2) == 0 { italic = true; }
            if h > 40 && (self.px(3, 3) == 1 || self.px(w - 3, h - 3) == 1) { italic = false; }
        }
        let t = self.hor_clear();
        if t[0] || t[1] { return (false, italic); }
        if (0..h / 2).any(|i| t[(h - i - 1) as usize]) { return (false, italic); }
        let top = h / 7;
        ((0..6).any(|i| t[(top + i) as usize]), italic)
    }
    /// ตัว j เล็กตัวตรง · ตาม IsLowercaseJ
    pub fn is_lowercase_j(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y > 20 || h < w * 2 || w < 5 || w > 25 || h < 21 || h > 70 { return false; }
        let t = self.hor_clear();
        if t[0] || t[1] { return false; }
        if (0..h / 2).any(|i| t[(h - i - 1) as usize]) { return false; }
        let mut top = h / 7;
        for i in 0..6 {
            if t[(top + i) as usize] {
                top += i;
                let free = (0..w).take_while(|&x| self.px(x, h / 2) == 0).count() as i32;
                if free < 3 || free as f64 > w as f64 * 0.67 { return false; }
                let mut y = top;
                while (y as f64) < h as f64 * 0.67 {
                    if (0..free).any(|x| self.px(x, y) != 0) { return false; }
                    y += 1;
                }
                return true;
            }
        }
        false
    }
    pub fn is_colon(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y < 5 || self.y > 45 || w > h / 2 || w < 3 || w > 18 || h < 14 || h > 45 { return false; }
        if self.colored * 2 > w * h { return false; }
        let t = self.hor_clear();
        if t[0] || t[1] || t[2] || t[(h - 1) as usize] || t[(h - 2) as usize] || t[(h - 3) as usize] { return false; }
        let (start, end) = (h / 4 + 1, h / 4 * 3 - 1);
        (start..end).all(|y| t[y as usize])
    }
    pub fn is_dash(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y < 13 || h as f64 * 2.3 > w as f64 || w < 10 || w > 25 || h < 3 || h > 7 { return false; }
        if self.colored + 7 < w * h { return false; }
        !self.hor_clear().iter().any(|c| *c) && !self.ver_clear().iter().any(|c| *c)
    }
    pub fn is_exclamation(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y > 20 || h < w + 10 || w < 3 || w > 17 || h < 21 || h > 50 { return false; }
        if (h as f64 / w as f64) < 2.3 { return false; }
        let t = self.hor_clear();
        if t[(h - 1) as usize] || t[(h - 2) as usize] { return false; }
        if (0..h / 2).any(|i| t[i as usize]) { return false; }
        let bottom = h - h / 7;
        (0..6).any(|i| t[(bottom - i) as usize])
    }
    pub fn is_lowercase_l(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y > 20 || h < w + 10 || w < 4 || w > 17 || h < 21 || h > 50 { return false; }
        !self.hor_clear().iter().any(|c| *c)
    }
    fn round_corners_clear(&self) -> bool {
        let (w, h) = (self.w, self.h);
        self.px(1, 1) == 0 && self.px(1, h - 1) == 0 && self.px(w - 1, 0) == 0 && self.px(w - 2, h - 2) == 0
    }
    pub fn is_c(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y > 20 || h < w + 1 || w < 12 || w > 49 || h < 15 || h > 55 { return false; }
        if !self.round_corners_clear() || self.hor_clear().iter().any(|c| *c) || self.ver_clear().iter().any(|c| *c) { return false; }
        // halfHeightM1 = halfHeight-- ใน C# ได้ค่าเดิม แล้ว halfHeight ลดลงหนึ่ง
        let (hw, hm1, hh) = (w / 2 - 1, h / 2, h / 2 - 1);
        (hw..w).all(|x| self.px(x, hh) == 0 && self.px(x, hm1) == 0)
    }
    pub fn is_o(&self) -> bool {
        let (w, h) = (self.w, self.h);
        if self.expand > 0 || self.y > 20 || (h - w).abs() > (h as f64 / 6.0).round_ties_even() as i32 || w < 12 || w > 49 || h < 15 || h > 55 { return false; }
        if !self.round_corners_clear() || self.hor_clear().iter().any(|c| *c) || self.ver_clear().iter().any(|c| *c) { return false; }
        let (hw, hh, rl) = (w / 2 - 1, h / 2, w / 6);
        (hw - rl..hw + rl).all(|x| self.px(x, hh - 1) == 0 && self.px(x, hh) == 0 && self.px(x, hh + 1) == 0)
    }
}

// ---------------------------------------------------------------- เทียบภาพ

#[inline]
fn raw_alpha(b: &Bmp, i: usize) -> u8 { *b.as_raw().get(i).unwrap_or(&0) }

/// จุดหมึกของภาพในฐานที่ภาพจริงไม่มีหมึก (ความทึบต่ำกว่า 100) เดินตามขนาดภาพในฐาน · ตาม IsBitmapsAlike(BinaryOcrBitmap, NikseBitmap2)
pub fn alike_bn(b: &BBmp, n: &Bmp) -> i32 {
    let max = b.w * b.h / 5;
    let w4 = n.width() as usize * 4;
    let mut d = 0;
    for y in 0..b.h {
        for x in 0..b.w {
            if b.px(x, y) > 0 && raw_alpha(n, y as usize * w4 + x as usize * 4 + 3) < 100 {
                d += 1;
                if d > max { return d + 10; }
            }
        }
    }
    d
}

/// จุดที่ภาพจริงไม่มีหมึกแต่ภาพในฐานมี เดินตามขนาดภาพจริง ข้ามแถวแรกกับคอลัมน์แรก · ตาม IsBitmapsAlike(NikseBitmap2, BinaryOcrBitmap)
pub fn alike_nb(n: &Bmp, b: &BBmp) -> i32 {
    let (w, h) = (n.width() as i32, n.height() as i32);
    let max = w * h / 5;
    let mut d = 0;
    for y in 1..h {
        for x in 1..w {
            if raw_alpha(n, ((y * w + x) * 4 + 3) as usize) < 100 && *b.colors.get((y * b.w + x) as usize).unwrap_or(&0) > 0 {
                d += 1;
                if d > max { return d + 10; }
            }
        }
    }
    d
}

/// จุดที่ต่างกันของสองภาพในฐาน · ตาม IsBitmapsAlike(BinaryOcrBitmap, BinaryOcrBitmap)
pub fn alike_bb(a: &BBmp, b: &BBmp) -> i32 {
    let max = a.w * a.h / 5;
    let mut d = 0;
    for i in 0..(a.w * a.h) as usize {
        if a.colors[i] != *b.colors.get(i).unwrap_or(&0) { d += 1; if d > max { return d + 10; } }
    }
    d
}

// ---------------------------------------------------------------- ฐาน

const MAX_COMMA_QUOTE_TOP_DIFF: i32 = 15;

/// จุลภาคกับอะพอสทรอฟีภาพเดียวกัน ต่างแค่ตำแหน่งบน · ตาม AllowEqual
pub fn allow_equal(m: &BBmp, nb: &BBmp) -> bool {
    !matches!(m.text.as_deref(), Some(",") | Some("'")) || (m.y - nb.y).abs() <= MAX_COMMA_QUOTE_TOP_DIFF
}

/// ลำดับภาพในฐานตอนนี้ (ตัวจับคู่เลื่อนภาพที่ตรงพอดีบ่อยขึ้นหน้า) กับดัชนีตามขนาดที่สร้างใหม่เมื่อลำดับเปลี่ยน
#[derive(Default)]
struct Order { list: Vec<u32>, by_size: Option<HashMap<(i32, i32), Vec<u32>>> }

/// ฐาน Binary OCR ไฟล์ .db (gzip) · ตาม BinaryOcrDb
pub struct BinDb {
    pub file: PathBuf,
    pub images: Vec<BBmp>,
    pub expanded: Vec<BBmp>,
    order: Mutex<Order>,
}

impl BinDb {
    pub fn empty(file: &Path) -> Self { BinDb { file: file.into(), images: vec![], expanded: vec![], order: Mutex::new(Order::default()) } }

    pub fn load(file: &Path) -> Result<Self, String> {
        let mut db = Self::empty(file);
        if !file.is_file() { return Ok(db); }
        let raw = std::fs::read(file).map_err(|e| format!("อ่านไฟล์ฐาน Binary OCR ไม่ได้ {e}"))?;
        let mut buf = vec![];
        flate2::read::GzDecoder::new(&raw[..]).read_to_end(&mut buf).map_err(|_| "ไฟล์ฐาน Binary OCR เสีย ถอดไฟล์ที่บีบไว้ไม่ได้".to_string())?;
        let mut pos = 0;
        while let Some(mut b) = BBmp::read(&buf, &mut pos) {
            if b.expand > 0 {
                for _ in 1..b.expand { match BBmp::read(&buf, &mut pos) { Some(s) => b.expanded.push(s), None => break } }
                db.expanded.push(b);
            } else {
                db.images.push(b);
            }
        }
        db.reset_order();
        Ok(db)
    }

    fn reset_order(&self) { *self.order.lock().unwrap() = Order { list: (0..self.images.len() as u32).collect(), by_size: None }; }

    pub fn save(&self) -> Result<(), String> {
        let mut raw = vec![];
        for i in self.order.lock().unwrap().list.iter() { self.images[*i as usize].write(&mut raw); }
        for b in &self.expanded {
            b.write(&mut raw);
            for s in &b.expanded { s.write(&mut raw); }
        }
        let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        enc.write_all(&raw).map_err(|e| e.to_string())?;
        let gz = enc.finish().map_err(|e| e.to_string())?;
        if let Some(d) = self.file.parent() { std::fs::create_dir_all(d).map_err(|e| format!("สร้างโฟลเดอร์ฐานไม่ได้ {e}"))?; }
        let part = PathBuf::from(format!("{}.partial", self.file.display()));
        std::fs::write(&part, gz).map_err(|e| format!("เขียนไฟล์ฐาน Binary OCR ไม่ได้ {e}"))?;
        crate::app::outfile::replace_often(&part, &self.file)
    }

    pub fn total(&self) -> usize { self.images.len() + self.expanded.len() }

    /// ภาพในฐานที่ขนาดตรงนี้ ตามลำดับปัจจุบัน · ตาม GetCompareImagesBySize
    fn by_size(&self, w: i32, h: i32) -> Vec<u32> {
        let mut o = self.order.lock().unwrap();
        if o.by_size.is_none() {
            let mut m: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
            for &i in &o.list { let b = &self.images[i as usize]; m.entry((b.w, b.h)).or_default().push(i); }
            o.by_size = Some(m);
        }
        o.by_size.as_ref().unwrap().get(&(w, h)).cloned().unwrap_or_default()
    }

    /// ภาพที่ตรงพอดีตัวแรกตามลำดับ · ตาม FindExactMatchItem
    pub fn find_exact(&self, bob: &BBmp) -> Option<u32> {
        self.by_size(bob.w, bob.h).into_iter().find(|&i| { let b = &self.images[i as usize]; b.hash == bob.hash && b.colored == bob.colored && allow_equal(b, bob) })
    }

    /// อยู่ใน 201 ภาพแรกไหม ไม่อยู่เลื่อนขึ้นหน้าสุด · ตาม MoveToFront ที่ FindBestMatch เรียก
    fn hot(&self, i: u32) {
        let mut o = self.order.lock().unwrap();
        let n = o.list.len().min(201);
        if o.list[..n].contains(&i) { return; }
        if let Some(p) = o.list.iter().position(|x| *x == i) { o.list.remove(p); o.list.insert(0, i); o.by_size = None; }
    }

    /// เพิ่มภาพที่สอน · มีอยู่แล้วตอบผิดพลาด · ตาม Add
    pub fn add(&mut self, b: BBmp) -> Result<(), String> {
        if b.expand > 0 {
            if b.expanded.len() as i32 != b.expand - 1 { return Err(format!("ภาพขยายจับต้องมีภาพตามมา {} ภาพ", b.expand - 1)); }
            let dup = self.expanded.iter().any(|e| e.hash == b.hash && e.w == b.w && e.h == b.h && e.colored == b.colored && e.expand == b.expand
                && e.colors_equal(&b) && e.expanded.iter().zip(&b.expanded).all(|(x, y)| x.hash == y.hash && x.colors_equal(y)));
            if dup { return Err("ภาพนี้มีในฐานแล้ว".into()); }
            self.expanded.push(b);
        } else {
            if self.images.iter().any(|e| e.hash == b.hash && e.w == b.w && e.h == b.h && e.colored == b.colored && allow_equal(e, &b)) { return Err("ภาพนี้มีในฐานแล้ว".into()); }
            self.images.push(b);
            let mut o = self.order.lock().unwrap();
            o.list.push(self.images.len() as u32 - 1);
            o.by_size = None;
        }
        Ok(())
    }

    /// เอาภาพออก (ตัวเดียวหรือตัวขยายจับ) ตามกุญแจ
    pub fn remove(&mut self, key: &str) {
        if let Some(p) = self.expanded.iter().position(|b| b.key() == key) { self.expanded.remove(p); return; }
        if let Some(p) = self.images.iter().position(|b| b.key() == key) {
            self.images.remove(p);
            self.reset_order();
        }
    }
}

/// ฐานที่มีในโฟลเดอร์ (ไฟล์ .db) · ตาม GetDatabases
pub fn databases(dir: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(dir).into_iter().flatten().flatten().filter_map(|e| {
        let p = e.path();
        p.extension().is_some_and(|x| x.eq_ignore_ascii_case("db")).then(|| p.file_stem().unwrap().to_string_lossy().to_string())
    }).collect();
    v.sort();
    v
}

// ---------------------------------------------------------------- ตัวจับคู่

/// ผลจับคู่ · ตาม CompareMatch
#[derive(Debug, Clone)]
pub struct BMatch { pub text: String, pub italic: bool, pub expand: i32, pub name: Option<String> }

fn bm(b: &BBmp) -> BMatch { BMatch { text: b.text.clone().unwrap_or_default(), italic: b.italic, expand: b.expand, name: Some(b.key()) } }
fn guess(t: &str, italic: bool) -> BMatch { BMatch { text: t.into(), italic, expand: 0, name: None } }

/// ตัวจับคู่หนึ่งงาน จำความสูงตัวเล็กตัวใหญ่ไว้แก้ตัวพิมพ์ · ตาม BinaryOcrMatcher
#[derive(Default)]
pub struct Matcher { pub latin: bool, lo_total: i64, lo_n: i32, up_total: i64, up_n: i32 }

const UPPER_LIKE: &[&str] = &["V", "W", "U", "S", "Z", "O", "X", "Ø", "C"];
const LOWER_LIKE: &[&str] = &["v", "w", "u", "s", "z", "o", "x", "ø", "c"];

impl Matcher {
    pub fn new(latin: bool) -> Self { Matcher { latin, ..Default::default() } }

    /// จับคู่ชิ้นที่ idx · คืนผลกับตัวที่ใกล้ที่สุดแต่เกินจุดผิดที่ยอม · ตาม GetCompareMatch
    pub fn compare(&mut self, list: &[Piece], idx: usize, db: &BinDb, max_err: f64) -> (Option<BMatch>, Option<BMatch>) {
        let item = &list[idx];
        let Some(target) = item.bmp.as_ref() else { return (None, None) };
        let mut bob = BBmp::from_bmp(target);
        bob.x = item.x;
        bob.y = item.top;
        let mut follow: HashMap<usize, BBmp> = HashMap::new();
        let mut following = |i: usize| -> BBmp { follow.entry(i).or_insert_with(|| BBmp::from_bmp(list[idx + i + 1].bmp.as_ref().unwrap())).clone() };
        let has_next = |i: usize| idx + i + 1 < list.len() && list[idx + i + 1].bmp.is_some();
        // ตัวขยายจับตรงพอดี
        for b in &db.expanded {
            if bob.hash == b.hash && bob.w == b.w && bob.h == b.h && bob.colored == b.colored {
                let mut ok = false;
                for (i, s) in b.expanded.iter().enumerate() {
                    if has_next(i) && s.hash == following(i).hash { ok = true; } else { ok = false; break; }
                }
                if ok { return (Some(bm(b)), None); }
            }
        }
        // ตัวขยายจับยอมจุดผิด
        for b in &db.expanded {
            if (bob.w - b.w).abs() < 3 && (bob.h - b.h).abs() < 3 && (bob.colored - b.colored).abs() < 5 && dif_pct(b, &bob, target, max_err) <= max_err {
                let mut ok = false;
                for (i, s) in b.expanded.iter().enumerate() {
                    if !has_next(i) { ok = false; break; }
                    let nb = following(i);
                    if s.hash == nb.hash || ((s.y - nb.y).abs() < 6 && dif_pct(s, &nb, list[idx + i + 1].bmp.as_ref().unwrap(), max_err) <= max_err) { ok = true; } else { ok = false; break; }
                }
                if ok { return (Some(bm(b)), None); }
            }
        }
        let (tw, th) = (target.width() as i32, target.height() as i32);
        let mut smallest = 10000;
        let mut hit = find_best(&mut smallest, target, db, &bob, max_err);
        if max_err > 0.0 {
            // ไม่เจอหรือผิดเกิน ลองตัดแถวบน คอลัมน์ซ้าย คอลัมน์ขวาออกทีละแบบ
            for (x, y, w, h) in [(0, 1, tw, th), (1, 0, tw, th), (0, 0, tw - 1, th)] {
                if tw > 16 && th > 16 && (hit.is_none() || smallest as f64 * 100.0 / (tw * th) as f64 > max_err) {
                    let t2 = copy_rect(target, x, y, w, h);
                    hit = find_best(&mut smallest, &t2, db, &bob, max_err);
                }
            }
        }
        let mut second = None;
        if let Some(hi) = hit {
            let hb = &db.images[hi as usize];
            let pct = smallest as f64 * 100.0 / (tw * th) as f64;
            let mut keep = true;
            if pct <= max_err {
                let orig = hb.text.clone().unwrap_or_default();
                let mut text = orig.clone();
                if smallest > 0 {
                    let h = hb.h as i64;
                    if UPPER_LIKE.contains(&text.as_str()) {
                        if self.lo_total > 10 && ((h - self.lo_total / self.lo_n as i64) as f64) < 2.0 { text = text.to_lowercase(); }
                    } else if LOWER_LIKE.contains(&text.as_str()) && self.up_total > 10 && self.up_total / self.up_n as i64 - h < 2 {
                        text = text.to_uppercase();
                    }
                } else {
                    self.set_heights(hb.h, &text);
                }
                if pct > 0.0 {
                    if matches!(orig.as_str(), "l" | "!") && bob.is_lowercase_i().0 { keep = false; }
                    else if matches!(orig.as_str(), "i" | "!") && bob.is_lowercase_l() { keep = false; }
                    else if matches!(orig.as_str(), "o" | "O") && bob.is_c() { return (Some(guess(if orig == "o" { "c" } else { "C" }, false)), None); }
                    else if matches!(orig.as_str(), "c" | "C") && !bob.is_c() && bob.is_o() { return (Some(guess(if orig == "c" { "o" } else { "O" }, false)), None); }
                }
                if keep {
                    if pct < 9.0 && matches!(text.as_str(), "e" | "d" | "a") { self.lo_n += 1; self.lo_total += bob.h as i64; }
                    return (Some(BMatch { text, italic: hb.italic, expand: hb.expand, name: Some(hb.key()) }), None);
                }
            }
            if keep { second = Some(bm(hb)); }
        }
        if max_err > 1.0 && self.latin {
            let next = list.get(idx + 1).and_then(|n| n.bmp.as_ref().map(|b| { let mut nb = BBmp::from_bmp(b); nb.x = n.x; nb.y = n.top; nb }));
            let lh = self.last_lowercase_height();
            // จุดที่ตามด้วยจุดบน คือทวิภาคตัวเอียง · จุลภาคที่ตามด้วยจุดบน คืออัฒภาคตัวเอียง
            if bob.is_period() && next.as_ref().is_none_or(|n| !n.is_period_at_top(lh)) { return (Some(guess(".", false)), second); }
            if bob.is_comma() && next.as_ref().is_none_or(|n| !n.is_period_at_top(lh)) { return (Some(guess(",", false)), second); }
            if bob.is_apostrophe() { return (Some(guess("'", false)), second); }
            if bob.is_lowercase_j() { return (Some(guess("j", false)), second); }
            let (i, it) = bob.is_lowercase_i();
            if i { return (Some(guess("i", it)), second); }
            if bob.is_colon() { return (Some(guess(":", false)), second); }
            if bob.is_exclamation() { return (Some(guess("!", false)), second); }
            if bob.is_dash() { return (Some(guess("-", false)), second); }
        }
        (None, second)
    }

    fn set_heights(&mut self, h: i32, text: &str) {
        if matches!(text, "e" | "a") { self.lo_n += 1; self.lo_total += h as i64; }
        if matches!(text, "E" | "H" | "R" | "D" | "T") { self.up_n += 1; self.up_total += h as i64; }
    }

    fn last_lowercase_height(&self) -> i32 { if self.lo_n > 5 { (self.lo_total as f64 / self.lo_n as f64).round_ties_even() as i32 } else { 25 } }
}

/// เปอร์เซ็นต์จุดที่ต่างของภาพขยายจับเทียบภาพจริง ขนาดต่างกันได้หนึ่งจุด · ตาม GetPixelDifPercentage
fn dif_pct(e: &BBmp, nb: &BBmp, n: &Bmp, max: f64) -> f64 {
    let dcp = (e.colored - nb.colored).abs() as f64 * 100.0 / (nb.w * nb.h) as f64;
    if (dcp > 1.0 && e.w < 3) || nb.w < 3 { return 100.0; }
    let mut dif = i32::MAX;
    if e.h == nb.h && e.w == nb.w { dif = alike_nb(n, e); }
    else if max > 0.0 {
        if e.h == nb.h && e.w == nb.w + 1 { dif = alike_nb(n, e); }
        else if e.h == nb.h && e.w == nb.w - 1 { dif = alike_bn(e, n); }
        else if e.w == nb.w && e.h == nb.h + 1 { dif = alike_nb(n, e); }
        else if e.w == nb.w && e.h == nb.h - 1 { dif = alike_bn(e, n); }
    }
    dif as f64 * 100.0 / (nb.w * nb.h) as f64
}

/// หาภาพในฐานที่ใกล้ที่สุด ขนาดเท่ากันก่อน แล้วขนาดต่างหนึ่งถึงสามจุด · smallest ใช้ต่อข้ามรอบ คืนเฉพาะที่ดีกว่าเดิม (เหมือน out ของ C# ที่ล้างทุกรอบ)
/// ตรงพอดีและไม่อยู่ใน 201 ภาพแรก เลื่อนขึ้นหน้า · ตาม FindBestMatch
fn find_best(smallest: &mut i32, target: &Bmp, db: &BinDb, bob: &BBmp, max: f64) -> Option<u32> {
    if let Some(e) = db.find_exact(bob) { *smallest = 0; return Some(e); }
    let (tw, th) = (target.width() as i32, target.height() as i32);
    if max < 0.2 || tw < 3 || th < 5 { return None; }
    let n = bob.colored;
    let mut hit = None;
    // ขนาด (w h) ตัวเทียบ (ฐานก่อนหรือภาพจริงก่อน) เกณฑ์จุดหมึกต่าง เลิกเมื่อต่างไม่ถึงเท่าไร
    let scan = |w: i32, h: i32, base_first: bool, color_tol: i32, stop_below: i32, smallest: &mut i32, hit: &mut Option<u32>| {
        for i in db.by_size(w, h) {
            let c = &db.images[i as usize];
            if (c.colored - n).abs() >= color_tol { continue; }
            let dif = if base_first { alike_bn(c, target) } else { alike_nb(target, c) };
            if dif < *smallest {
                if !allow_equal(c, bob) { continue; }
                *smallest = dif;
                *hit = Some(i);
                if dif < stop_below { break; }
            }
        }
    };
    scan(tw, th, true, 3, 3, smallest, &mut hit);
    if *smallest > 1 { scan(tw, th, true, 40, 1, smallest, &mut hit); }
    if tw > 16 && th > 16 && *smallest > 2 {
        scan(tw, th - 1, true, 90, 1, smallest, &mut hit);
        if *smallest > 2 { scan(tw, th + 1, false, 90, 1, smallest, &mut hit); }
        if *smallest > 3 { scan(tw + 1, th + 1, false, 90, 1, smallest, &mut hit); }
        if *smallest > 5 { scan(tw - 1, th - 1, true, 90, 1, smallest, &mut hit); }
        if *smallest > 5 { scan(tw + 1, th, false, 90, 1, smallest, &mut hit); }
        if *smallest > 9 && tw > 11 { scan(tw - 2, th, true, 90, 1, smallest, &mut hit); }
        if *smallest > 9 && tw > 14 { scan(tw - 3, th, true, 90, 1, smallest, &mut hit); }
        if *smallest > 9 && tw > 14 { scan(tw, th - 3, true, 90, 1, smallest, &mut hit); }
        if *smallest > 9 && tw > 14 { scan(tw + 2, th, false, 90, 1, smallest, &mut hit); }
    }
    if *smallest == 0 { if let Some(h) = hit { db.hot(h); } }
    hit
}

// ---------------------------------------------------------------- ตัวอ่านทีละภาพ

/// ค่าที่ใช้อ่าน · ค่าตั้งต้นตาม SeConv (จุดเว้นวรรค 12 จุดผิด 0.5%)
#[derive(Clone)]
pub struct BinOpts { pub space_px: i32, pub max_err: f64, pub teach: bool }
impl Default for BinOpts { fn default() -> Self { BinOpts { space_px: 12, max_err: 0.5, teach: false } } }

/// ตัวอ่าน Binary OCR หนึ่งงาน · ตาม RunBinaryImageCompareOcrLoop กับ BinaryOcrOcrEngine.Recognize
pub struct BinReader { pub tracker: LineHeightTracker, pub matcher: Mutex<Matcher> }

impl BinReader {
    /// latin ตามชื่อฐานที่มีคำว่า Latin (เปิดการเดาเครื่องหมายจากรูปทรง)
    pub fn new(db_name: &str) -> Self { BinReader { tracker: LineHeightTracker::default(), matcher: Mutex::new(Matcher::new(db_name.to_lowercase().contains("latin"))) } }

    /// อ่านภาพซับหนึ่งภาพ · ภาพสองสีเกณฑ์ 200 ตัดแถวใสบน แบ่งชิ้นตามจุดเว้นวรรคที่ตั้ง จับคู่ แล้วประกอบแท็กตัวเอียง
    /// fallback คือ nOCR ที่ใช้เมื่อ Binary OCR อ่านไม่ออก (ผู้เรียกใส่ตัวแก้ตัวพิมพ์ของ nOCR ไว้ในนั้นแล้ว)
    pub fn read(&self, db: &BinDb, img: &Bmp, o: &BinOpts, skip: &HashSet<usize>, run_once: &HashMap<usize, String>, fallback: Option<Fallback>) -> ReadOut {
        if img.width() == 0 || img.height() == 0 {
            return ReadOut::Done(LineRead { text: String::new(), hits: vec![], pieces: vec![], parent: img.clone(), space_px: o.space_px, unknown: 0 });
        }
        let two = crate::ocrprep::make_two_color(img, 200);
        let (parent, _) = crop_top(&two);
        let letters = split_letters(&parent, o.space_px, false, true, self.tracker.min_line_height(), true, self.tracker.average());
        self.tracker.update(&letters);
        let mut hits = vec![];
        let mut unknown = 0;
        let mut i = 0;
        while i < letters.len() {
            let item = &letters[i];
            if item.bmp.is_none() {
                // Subtitle Edit ไม่ผูกเว้นวรรคกับชิ้นในงานนี้ ตัวเติมเว้นวรรคในตัวเอียงจึงข้ามมัน
                if let Some(s) = &item.special { hits.push(Hit::text(s, None)); }
                i += 1;
                continue;
            }
            let (m, _) = self.matcher.lock().unwrap().compare(&letters, i, db, o.max_err);
            if m.is_none() {
                if let Some((text, italic, expand)) = fallback.and_then(|f| f(&parent, &letters, i)).filter(|r| !r.0.is_empty()) {
                    hits.push(Hit { text, italic, expand_count: expand, piece: Some(i), ..Default::default() });
                    i += expand.max(1) as usize;
                    continue;
                }
                if o.teach {
                    if skip.contains(&i) { hits.push(Hit::text("*", None)); unknown += 1; i += 1; continue; }
                    if let Some(t) = run_once.get(&i) { hits.push(Hit::text(t, None)); i += 1; continue; }
                    return ReadOut::Teach { letter: i, parent, pieces: letters };
                }
            }
            match m {
                None => { hits.push(Hit::text("*", None)); unknown += 1; }
                Some(c) => {
                    let first = i;
                    if c.expand > 0 { i += c.expand as usize - 1; }
                    hits.push(Hit { text: c.text, italic: c.italic, expand_count: c.expand, piece: Some(first), ..Default::default() });
                }
            }
            i += 1;
        }
        let text = merge_italic(&hits).trim().to_string();
        ReadOut::Done(LineRead { text, hits, pieces: letters, parent, space_px: o.space_px, unknown })
    }

    pub fn read_text(&self, db: &BinDb, img: &Bmp, o: &BinOpts) -> LineRead {
        let o = BinOpts { teach: false, ..o.clone() };
        match self.read(db, img, &o, &HashSet::new(), &HashMap::new(), None) { ReadOut::Done(r) => r, ReadOut::Teach { .. } => unreachable!() }
    }
}

/// ผลที่ใส่เว้นวรรคในตัวเอียงเพิ่มของ Binary OCR (เกณฑ์จุดเว้นวรรคตามที่ตั้ง ไม่จำกัดด้วยความสูง)
pub fn italic_retry(r: &LineRead) -> Option<String> {
    if !r.text.contains("<i>") { return None; }
    Some(crate::nocr_text::more_italic_spaces_with(&r.hits, &r.pieces, &r.parent, 0.33, r.space_px, false))
}

/// ภาพที่สอนจากชิ้นในบรรทัด · count มากกว่าหนึ่งเป็นตัวขยายจับ ชิ้นตามมาเก็บเป็นภาพย่อยไม่มีข้อความ
/// ตาม BinaryOcrBitmap(nbmp, italic, expandCount, text, x, y) กับ ExpandedOcrGroup.CreateBinaryOcrBitmap
pub fn teach_bitmap(list: &[Piece], idx: usize, count: usize, text: &str, italic: bool) -> Option<BBmp> {
    let p = list.get(idx)?;
    let mut b = BBmp::from_bmp(p.bmp.as_ref()?);
    b.x = p.x;
    b.y = p.top;
    b.text = Some(text.into());
    b.italic = italic;
    if count > 1 {
        b.expand = count as i32;
        for q in list.get(idx + 1..idx + count)? {
            let mut s = BBmp::from_bmp(q.bmp.as_ref()?);
            s.x = q.x;
            s.y = q.top;
            b.expanded.push(s);
        }
    }
    Some(b)
}

/// nOCR เป็นฐานสำรองของ Binary OCR · ทางสุดท้ายเปิด แก้ตัวพิมพ์ด้วยตัวแก้ของ nOCR · ตาม RunBinaryImageCompareOcrLoop
pub fn nocr_fallback<'a>(db: &'a crate::nocr::NOcrDb, case: &'a Mutex<crate::nocr_text::CaseFixer>, max_wrong: i32, italic: f64)
    -> impl Fn(&Bmp, &[Piece], usize) -> Option<(String, bool, i32)> + 'a {
    move |parent, list, i| {
        let m = db.get_match(parent, list, i, list[i].top, true, max_wrong, true, italic)?;
        if m.text.is_empty() { return None; }
        let hit = Hit { text: m.text.clone(), italic: m.italic, expand_count: m.expand_count, piece: Some(i), margin_top: m.margin_top, height: m.height };
        let text = case.lock().unwrap().fix(&list[i], &hit);
        Some((text, m.italic, m.expand_count))
    }
}

/// Binary OCR เป็นฐานสำรองของ nOCR · จุดผิดตามที่ตั้งของ Binary OCR · ตาม RunNOcrLoop
pub fn binary_fallback<'a>(db: &'a BinDb, matcher: &'a Mutex<Matcher>, max_err: f64) -> impl Fn(&Bmp, &[Piece], usize) -> Option<(String, bool, i32)> + 'a {
    move |_, list, i| {
        let (m, _) = matcher.lock().unwrap().compare(list, i, db, max_err);
        m.filter(|m| !m.text.is_empty()).map(|m| (m.text, m.italic, m.expand))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn latin() -> Option<BinDb> {
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.db");
        p.exists().then(|| BinDb::load(&p).unwrap())
    }

    /// ค่า hash ตรงกับที่ Subtitle Edit เก็บในฐาน Latin ทุกภาพ (คิดใหม่จากจุดของภาพเอง)
    #[test]
    fn murmur_matches_se_db() {
        let Some(db) = latin() else { return };
        assert!(db.images.len() > 500, "ฐาน Latin มี {} ภาพ", db.images.len());
        let bad = db.images.iter().filter(|b| murmur3(&b.colors) != b.hash).count();
        assert_eq!(bad, 0, "hash ไม่ตรง {bad} ภาพ");
    }

    /// บันทึกแล้วเปิดใหม่ได้ภาพเท่าเดิมทุกภาพ
    #[test]
    fn db_roundtrip() {
        let Some(db) = latin() else { return };
        let dir = std::env::temp_dir().join("movie-shelf-binocr-rt");
        let _ = std::fs::create_dir_all(&dir);
        let mut copy = BinDb::load(&db.file).unwrap();
        copy.file = dir.join("t.db");
        copy.save().unwrap();
        let back = BinDb::load(&copy.file).unwrap();
        assert_eq!((back.images.len(), back.expanded.len()), (db.images.len(), db.expanded.len()));
        assert!(back.images.iter().zip(&db.images).all(|(a, b)| a.colors == b.colors && a.text == b.text && a.hash == b.hash && a.y == b.y));
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn bar(img: &mut RgbaImage, x0: u32, y0: u32, w: u32, h: u32) { for y in y0..y0 + h { for x in x0..x0 + w { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } } }

    /// ภาพที่สอนแล้วอ่านกลับได้ตรงพอดี · ภาพเดิมสอนซ้ำตอบว่ามีแล้ว
    #[test]
    fn teach_and_read_back() {
        let mut img = RgbaImage::new(80, 40);
        bar(&mut img, 5, 5, 6, 25);
        bar(&mut img, 30, 5, 18, 25);
        let reader = BinReader::new("Test");
        let mut db = BinDb::empty(Path::new("t.db"));
        let r = reader.read_text(&db, &img, &BinOpts::default());
        assert_eq!(r.unknown, 2);
        let first = r.pieces.iter().position(|p| p.bmp.is_some()).unwrap();
        let last = r.pieces.iter().rposition(|p| p.bmp.is_some()).unwrap();
        db.add(teach_bitmap(&r.pieces, first, 1, "l", false).unwrap()).unwrap();
        db.add(teach_bitmap(&r.pieces, last, 1, "I", true).unwrap()).unwrap();
        assert!(db.add(teach_bitmap(&r.pieces, first, 1, "l", false).unwrap()).is_err());
        let r2 = reader.read_text(&db, &img, &BinOpts::default());
        assert_eq!(r2.text, "l <i>I</i>");
    }

    /// ฐานสำรองข้ามตัวอ่านทั้งสองทาง · ตัวที่ตัวอ่านหลักไม่รู้จักแต่อีกตัวรู้จัก ต้องอ่านออก ไม่เหลือ *
    #[test]
    fn fallbacks_fill_unknowns() {
        let mut img = RgbaImage::new(80, 40);
        bar(&mut img, 5, 5, 6, 25);
        bar(&mut img, 30, 5, 18, 25);
        // Binary OCR รู้จักทั้งสองตัว · nOCR ฐานว่าง
        let probe = BinReader::new("Test").read_text(&BinDb::empty(Path::new("t.db")), &img, &BinOpts::default());
        let glyphs: Vec<usize> = probe.pieces.iter().enumerate().filter(|p| p.1.bmp.is_some()).map(|p| p.0).collect();
        let mut bdb = BinDb::empty(Path::new("t.db"));
        bdb.add(teach_bitmap(&probe.pieces, glyphs[0], 1, "l", false).unwrap()).unwrap();
        bdb.add(teach_bitmap(&probe.pieces, glyphs[1], 1, "I", false).unwrap()).unwrap();
        let ndb = crate::nocr::NOcrDb::empty(Path::new("t.nocr"));
        let reader = crate::nocr_text::NOcrReader::default();
        let alone = reader.read_text(&ndb, &img, &crate::nocr_text::ReadOpts::default());
        assert_eq!(alone.unknown, 2, "nOCR ฐานว่างต้องอ่านไม่ออก {:?}", alone.text);
        let m = Mutex::new(Matcher::new(false));
        let fb = binary_fallback(&bdb, &m, 0.5);
        let out = match reader.read(&ndb, &img, &crate::nocr_text::ReadOpts::default(), &HashSet::new(), &HashMap::new(), Some(&fb)) { ReadOut::Done(r) => r, _ => panic!("ไม่ควรหยุดสอน") };
        assert_eq!((out.unknown, out.text.replace(' ', "")), (0, "lI".to_string()), "nOCR ใช้ Binary OCR สำรอง");
        // nOCR รู้จักทั้งสองตัว · Binary OCR ฐานว่าง
        let mut ndb = crate::nocr::NOcrDb::empty(Path::new("t.nocr"));
        for (k, t) in [(glyphs[0], "l"), (glyphs[1], "I")] {
            let p = &probe.pieces[k];
            let b = p.bmp.as_ref().unwrap();
            let mut c = crate::nocr::NChar { text: t.into(), width: b.width() as i32, height: b.height() as i32, margin_top: p.top, ..Default::default() };
            crate::nocr_lines::generate(60, false, &mut c, b, crate::nocr_lines::Algo::Random, &mut crate::nocr_lines::Rng::new(3));
            ndb.add(c);
        }
        let case = Mutex::new(crate::nocr_text::CaseFixer::default());
        let fb = nocr_fallback(&ndb, &case, 25, 0.0);
        let out = match BinReader::new("Test").read(&BinDb::empty(Path::new("t.db")), &img, &BinOpts::default(), &HashSet::new(), &HashMap::new(), Some(&fb)) { ReadOut::Done(r) => r, _ => panic!("ไม่ควรหยุดสอน") };
        assert_eq!((out.unknown, out.text.replace(' ', "")), (0, "lI".to_string()), "Binary OCR ใช้ nOCR สำรอง");
    }

    /// เจอตัวที่ไม่รู้จักตอนเปิดสอน หยุดคืนชิ้นนั้น · กดข้ามใส่ * · ใช้ครั้งเดียวใส่ข้อความที่พิมพ์
    #[test]
    fn teach_skip_and_run_once() {
        let mut img = RgbaImage::new(80, 40);
        bar(&mut img, 5, 5, 6, 25);
        bar(&mut img, 30, 5, 18, 25);
        let db = BinDb::empty(Path::new("t.db"));
        let r = BinReader::new("Test");
        let o = BinOpts { teach: true, ..Default::default() };
        let ReadOut::Teach { letter, .. } = r.read(&db, &img, &o, &HashSet::new(), &HashMap::new(), None) else { panic!("ต้องหยุดสอน") };
        let skip: HashSet<usize> = [letter].into();
        let once: HashMap<usize, String> = [(letter + 2, "X".to_string())].into();
        let ReadOut::Done(d) = r.read(&db, &img, &o, &skip, &once, None) else { panic!("ต้องอ่านจบ") };
        assert_eq!(d.text, "* X");
    }

    /// รูปทรงที่เดาได้ จุด ขีด ทวิภาค
    #[test]
    fn shape_guesses() {
        let mk = |w: i32, h: i32, y: i32, f: &dyn Fn(i32, i32) -> bool| {
            let colors: Vec<u8> = (0..h).flat_map(|yy| (0..w).map(move |xx| (xx, yy))).map(|(xx, yy)| f(xx, yy) as u8).collect();
            BBmp { w, h, y, colored: colors.iter().filter(|c| **c > 0).count() as i32, colors, ..Default::default() }
        };
        assert!(mk(6, 5, 30, &|_, _| true).is_period());
        assert!(mk(14, 4, 20, &|_, _| true).is_dash());
        assert!(mk(5, 20, 10, &|_, y| y < 5 || y >= 15).is_colon());
        assert!(!mk(5, 20, 10, &|_, _| true).is_colon());
    }

    fn srt_cues(p: &str) -> Vec<(f64, String)> {
        let s = std::fs::read_to_string(p).unwrap().replace('\u{feff}', "").replace("\r\n", "\n");
        s.split("\n\n").filter_map(|b| {
            let mut l = b.lines();
            l.next()?;
            let hms = l.next()?.split(" --> ").next()?.to_string();
            let v: Vec<f64> = hms.replace(',', ":").split(':').filter_map(|x| x.trim().parse().ok()).collect();
            if v.len() != 4 { return None; }
            Some((v[0] * 3600.0 + v[1] * 60.0 + v[2] + v[3] / 1000.0, l.collect::<Vec<_>>().join("\n")))
        }).collect()
    }

    /// แปลมาถูกไหม อ่านซับ ACCA ทั้งไฟล์ด้วยฐาน Latin.db ค่าแบบ SeConv เทียบผล SeConv ทีละบรรทัดตามเวลาเริ่ม
    /// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_SECONV_BIN (SRT ที่ SeConv อ่านด้วย Latin.db) · ห้ามขึ้น git
    #[test]
    fn acca_same_as_seconv() {
        let (Ok(sup), Ok(se)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_SECONV_BIN")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
        let Some(db) = latin() else { return };
        let cues = srt_cues(&se);
        let shows = crate::subs::parse_sup(&std::fs::read(sup).unwrap());
        let reader = BinReader::new("Latin");
        let t = std::time::Instant::now();
        let (mut same, mut n, mut diff) = (0, 0, vec![]);
        for (k, s) in shows.iter().enumerate() {
            let got = reader.read_text(&db, &s.img, &BinOpts::default()).text;
            let near: Vec<&(f64, String)> = cues.iter().filter(|c| (c.0 - s.start).abs() < 0.03).collect();
            if near.is_empty() { continue; }
            n += 1;
            if near.iter().any(|c| c.1 == got) { same += 1; } else { diff.push((k + 1, got, near[0].1.clone())); }
        }
        eprintln!("ACCA Binary OCR ตรงกับ SeConv {same} จาก {n} บรรทัด ใน {:.1} วินาที", t.elapsed().as_secs_f64());
        for d in diff.iter().take(40) { eprintln!("ภาพ {} ของเรา {:?} SeConv {:?}", d.0, d.1, d.2); }
        assert!(n - same <= 1, "ต่างจาก SeConv {} บรรทัด", n - same);
    }
}
