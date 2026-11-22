//! แต่งภาพซับก่อนอ่าน และแบ่งภาพเป็นบรรทัด (แผน OCR ขั้น 2 · BUGS ข้อ 143)
//! ① แต่งภาพตามหน้าต่างแต่งภาพของ Subtitle Edit ครอปส่วนใส ลบขอบ กลับสี สีเดียวตามระดับความมืด ขาวดำแบบ Otsu
//!    ของชั้นหนังเพิ่ม ขยายภาพเล็ก (ซับ VobSub 480p ตัวหนังสือสูงไม่กี่จุด ตัวอ่านแยกตัวอักษรไม่ออก)
//! ② แบ่งบรรทัดจากแถวที่ใสทั้งแถว แบบที่ลองกับซับ ACCA แล้ว PP-OCRv6 small อ่านถูก 436 จาก 439 ภาพ (docs/research/ocr-ซับรูป.md)
//!    ของชั้นหนังเพิ่ม สระบน สระล่าง วรรณยุกต์ไทย จุดของ i และเครื่องหมายบนตัวอักษรที่แยกเป็นแถบบางเหนือหรือใต้บรรทัด ต่อกลับเข้าบรรทัดของมัน
//!    เดิมตอนลอง แถบที่เตี้ยกว่า 6 จุดถูกทิ้ง ภาษาไทยจะเสียวรรณยุกต์ไปทั้งแถว
//! ③ ตัวแบ่งบรรทัดของ Subtitle Edit (ใช้กับ nOCR ในขั้น 5 และหาก้อนบรรทัดที่วางห่างกันเพื่อใส่ตำแหน่งทีละก้อน)
//!    กรอบหมึก (BitmapInkBounds) และเกณฑ์ขาวดำก่อนจับคู่ (OcrTwoColorThreshold)
//!
//! แปลจากซอร์ส Subtitle Edit (src/ui/Features/Ocr/PreProcessingSettings.cs · src/libuilogic/Ocr/OcrTwoColorThreshold.cs
//! BitmapInkBounds.cs NikseBitmap2.cs NikseBitmapImageSplitter2.cs) สัญญา MIT
//!   Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//! ตัวหาเส้นฐาน (ImageBaselineFinder.cs) ใช้ตัวแยกตัวอักษรของ nOCR จึงทำในขั้น 5 พร้อมตัวแยกตัวอักษร

// ตัวอ่านทุกตัว (ขั้น 3 ถึง 7) กับตัวคุมงาน (ขั้น 10) เป็นคนเรียก ระหว่างนี้ยังไม่มีผู้ใช้นอกเทส
#![allow(dead_code)]

use image::{Rgba, RgbaImage};

/// ค่าตั้งของการแต่งภาพ ตาม PreProcessingSettings ของ Subtitle Edit บวกการขยายภาพของชั้นหนัง
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Prep {
    pub crop_transparent: bool,
    pub invert: bool,
    pub binarize: bool,
    pub remove_borders: bool,
    pub border_size: u32,
    pub to_one_color: bool,
    /// 0–255 จุดที่สว่างไม่เกินค่านี้กลายเป็นใส ที่สว่างกว่ากลายเป็นสีขาว
    pub one_color_threshold: u8,
    /// ขยายภาพจนบรรทัดสูงอย่างน้อยเท่านี้ (จุด) · 0 คือไม่ขยาย
    pub upscale_to: u32,
}

impl Default for Prep {
    fn default() -> Self {
        Prep { crop_transparent: false, invert: false, binarize: false, remove_borders: false, border_size: 2, to_one_color: false, one_color_threshold: 128, upscale_to: 0 }
    }
}

/// แต่งภาพตามลำดับของ PreProcess ใน Subtitle Edit · ครอปส่วนใส ลบขอบ (แล้วครอปซ้ำ) กลับสี สีเดียว ขาวดำ แล้วขยายภาพเล็กเป็นขั้นสุดท้าย
pub fn preprocess(img: &RgbaImage, p: &Prep) -> RgbaImage {
    let mut b = img.clone();
    if p.crop_transparent { b = crop_transparent(&b).0; }
    if p.remove_borders {
        b = remove_border(&b, p.border_size);
        if p.crop_transparent { b = crop_transparent(&b).0; }
    }
    if p.invert { invert(&mut b); }
    if p.to_one_color { b = one_color(&b, p.one_color_threshold); }
    if p.binarize { b = binarize_otsu(&b); }
    if p.upscale_to > 0 {
        let f = upscale_factor(&split_lines(&b), p.upscale_to);
        if f > 1 { b = upscale(&b, f); }
    }
    b
}

/// ครอปให้เหลือกรอบของจุดที่ไม่ใสเลย (alpha > 0) · ไม่มีจุดเลยคืนภาพเดิม · คืนตำแหน่งที่ครอปด้วย
pub fn crop_transparent(img: &RgbaImage) -> (RgbaImage, (u32, u32)) {
    match ink_bounds(img, 0) {
        Some((x, y, w, h)) => (image::imageops::crop_imm(img, x, y, w, h).to_image(), (x, y)),
        None => (img.clone(), (0, 0)),
    }
}

/// กรอบเล็กที่สุดที่คลุมทุกจุดที่ alpha มากกว่า min (x y กว้าง สูง) · ไม่มีคืน None · ตาม BitmapInkBounds.Get (min 0)
pub fn ink_bounds(img: &RgbaImage, min: u8) -> Option<(u32, u32, u32, u32)> {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0u32, 0u32);
    let mut any = false;
    for (x, y, p) in img.enumerate_pixels() {
        if p[3] > min { any = true; x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y); }
    }
    any.then(|| (x0, y0, x1 - x0 + 1, y1 - y0 + 1))
}

/// ตัดขอบรอบภาพออก n จุดทุกด้าน · ภาพเล็กเกินคืนภาพเดิม · ตาม RemoveBorder
pub fn remove_border(img: &RgbaImage, n: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    if n == 0 || n * 2 >= w || n * 2 >= h { return img.clone(); }
    image::imageops::crop_imm(img, n, n, w - n * 2, h - n * 2).to_image()
}

/// กลับสี RGB คง alpha · ตาม InvertColors
pub fn invert(img: &mut RgbaImage) {
    for p in img.pixels_mut() { p[0] = 255 - p[0]; p[1] = 255 - p[1]; p[2] = 255 - p[2]; }
}

/// ความสว่างแบบ 0.299 0.587 0.114 ตามที่ Subtitle Edit ใช้
fn luma(p: &Rgba<u8>) -> u8 { (0.299 * p[0] as f64 + 0.587 * p[1] as f64 + 0.114 * p[2] as f64) as u8 }

/// จุดที่สว่างกว่าเกณฑ์เป็นขาวทึบ ที่เหลือเป็นใส · ตาม ConvertToOneColor
pub fn one_color(img: &RgbaImage, threshold: u8) -> RgbaImage {
    let mut out = img.clone();
    for p in out.pixels_mut() {
        *p = if p[3] != 0 && luma(p) > threshold { Rgba([255, 255, 255, 255]) } else { Rgba([0, 0, 0, 0]) };
    }
    out
}

/// ขาวดำด้วยเกณฑ์ของ Otsu จากฮิสโตแกรมความสว่างทุกจุด (รวมจุดใส) คง alpha · ตาม BinarizeOtsu
pub fn binarize_otsu(img: &RgbaImage) -> RgbaImage {
    let total = (img.width() * img.height()) as f64;
    let mut hist = [0f64; 256];
    for p in img.pixels() { hist[luma(p) as usize] += 1.0; }
    let sum: f64 = (0..256).map(|i| i as f64 * hist[i]).sum();
    let (mut sum_b, mut w_b, mut best, mut thr) = (0f64, 0f64, 0f64, 0usize);
    for i in 0..256 {
        w_b += hist[i];
        if w_b == 0.0 { continue; }
        let w_f = total - w_b;
        if w_f == 0.0 { break; }
        sum_b += i as f64 * hist[i];
        let (m_b, m_f) = (sum_b / w_b, (sum - sum_b) / w_f);
        let v = w_b * w_f * (m_b - m_f) * (m_b - m_f);
        if v > best { best = v; thr = i; }
    }
    let mut out = img.clone();
    for p in out.pixels_mut() {
        let v = if luma(p) as usize >= thr { 255 } else { 0 };
        *p = Rgba([v, v, v, p[3]]);
    }
    out
}

/// เกณฑ์ผลรวม R+G+B ก่อนทำภาพสองสีให้ตัวจับคู่ (nOCR Binary OCR) · ปกติ 200 เก็บตัวขาวหรือเหลือง ทิ้งขอบดำ
/// ซับที่มีเงาเทา (ตัวสามมิติ) ผลรวมของเงาอยู่ราว 190–290 จะติดกับตัวอักษร ถ้าส่วนที่ 200 เก็บไว้เป็นเทากลางที่ Otsu นับเป็นฝั่งมืดเกิน 20% ใช้เกณฑ์ของ Otsu แทน
/// ตาม OcrTwoColorThreshold.Get
pub fn two_color_threshold(img: &RgbaImage) -> u32 {
    const DEFAULT: usize = 200;
    let mut hist = vec![0f64; 766];
    for p in img.pixels() {
        if p[3] == 0 { continue; }
        hist[p[0] as usize + p[1] as usize + p[2] as usize] += p[3] as f64 / 255.0;
    }
    let total: f64 = hist.iter().sum();
    let sum_all: f64 = hist.iter().enumerate().map(|(i, v)| i as f64 * v).sum();
    let (mut w_b, mut s_b, mut best, mut otsu) = (0f64, 0f64, -1f64, DEFAULT);
    for i in 0..hist.len() {
        w_b += hist[i];
        if w_b == 0.0 { continue; }
        let w_f = total - w_b;
        if w_f <= 0.0 { break; }
        s_b += i as f64 * hist[i];
        let (m_b, m_f) = (s_b / w_b, (sum_all - s_b) / w_f);
        let v = w_b * w_f * (m_b - m_f) * (m_b - m_f);
        if v > best { best = v; otsu = i + 1; }
    }
    if otsu <= DEFAULT { return DEFAULT as u32; }
    let kept: f64 = hist[DEFAULT..].iter().sum();
    let shadow: f64 = hist[DEFAULT..otsu.min(hist.len())].iter().sum();
    if kept > 0.0 && shadow / kept > 0.2 { otsu as u32 } else { DEFAULT as u32 }
}

/// ภาพสองสี จุดใสหรือผลรวม R+G+B ต่ำกว่าเกณฑ์เป็นพื้นใส ที่เหลือเป็นขาวทึบ · ตาม NikseBitmap2.MakeTwoColor(minRgb)
pub fn make_two_color(img: &RgbaImage, min_rgb: u32) -> RgbaImage {
    let mut out = img.clone();
    for p in out.pixels_mut() {
        let s = p[0] as u32 + p[1] as u32 + p[2] as u32;
        *p = if p[3] < 1 || s < min_rgb { Rgba([0, 0, 0, 0]) } else { Rgba([255, 255, 255, 255]) };
    }
    out
}

/// ทุกจุดที่มีหมึก (ไม่ใสและสีช่องใดช่องหนึ่งเกิน 20) เป็นสีที่ให้ ที่เหลือใส · จาก NikseBitmap2.MakeOneColor (ใช้ก่อนแบ่งก้อนบรรทัดของตำแหน่ง ASS)
/// Subtitle Edit ดูแค่ช่องน้ำเงิน ซับตัวเหลือง (255 255 0) ว่างทั้งภาพ ป้ายบนจอเสียตำแหน่งและถูกรวมเข้าบทพูด (ผู้ช่วยตรวจทาน T7)
pub fn make_one_color(img: &RgbaImage, c: Rgba<u8>) -> RgbaImage {
    let mut out = img.clone();
    for p in out.pixels_mut() { *p = if p[3] > 20 && p[0].max(p[1]).max(p[2]) > 20 { c } else { Rgba([0, 0, 0, 0]) }; }
    out
}

// ---------------------------------------------------------------- แบ่งบรรทัด

/// บรรทัดหนึ่งในภาพ · y คือแถวบนสุดในภาพเดิม · img กว้างเท่าภาพเดิม
#[derive(Debug, Clone)]
pub struct Line {
    pub y: u32,
    pub h: u32,
    pub img: RgbaImage,
}

/// แถวที่มีจุดทึบเกิน 40 อย่างน้อยหนึ่งจุด (ค่าเดียวกับตอนลองกับซับ ACCA)
fn ink_rows(img: &RgbaImage, min_alpha: u8) -> Vec<bool> {
    (0..img.height()).map(|y| (0..img.width()).any(|x| img.get_pixel(x, y)[3] > min_alpha)).collect()
}

/// ช่วงแถวที่มีหมึกติดกัน (เริ่ม, สิ้นสุดแบบไม่รวม)
fn runs(rows: &[bool]) -> Vec<(u32, u32)> {
    let mut out = vec![];
    let mut y = 0usize;
    while y < rows.len() {
        if !rows[y] { y += 1; continue; }
        let s = y;
        while y < rows.len() && rows[y] { y += 1; }
        out.push((s as u32, y as u32));
    }
    out
}

/// ต่อแถบบางเข้าบรรทัดของมัน · แถบที่สูงไม่ถึง 45% ของแถบที่สูงที่สุด (เกณฑ์เดียวกับเครื่องหมายลอยในตัวหาเส้นฐานของ Subtitle Edit)
/// คือสระบน วรรณยุกต์ สระล่าง จุด หรือเครื่องหมายเหนือตัวอักษร · ต่อเข้าบรรทัดหลักที่ช่องว่างใกล้กว่า เท่ากันเลือกบรรทัดล่าง (ของที่ลอยเหนือบรรทัดพบบ่อยกว่า)
/// ช่องว่างไกลเกินครึ่งความสูงของบรรทัดหลักนั้น ไม่ต่อ เป็นบรรทัดของตัวเอง (บรรทัดที่มีแต่จุดสามจุด ขีด)
pub fn merge_marks(runs: &[(u32, u32)]) -> Vec<(u32, u32)> {
    if runs.len() < 2 { return runs.to_vec(); }
    let tallest = runs.iter().map(|r| r.1 - r.0).max().unwrap_or(0);
    let main: Vec<bool> = runs.iter().map(|r| (r.1 - r.0) * 100 >= tallest * 45).collect();
    let mut groups: Vec<(u32, u32)> = runs.iter().zip(&main).filter(|(_, m)| **m).map(|(r, _)| *r).collect();
    if groups.is_empty() { return runs.to_vec(); }
    let mut alone: Vec<(u32, u32)> = vec![];
    for (r, m) in runs.iter().zip(&main) {
        if *m { continue; }
        // บรรทัดหลักที่อยู่ใต้กับเหนือแถบนี้
        let below = groups.iter().enumerate().filter(|(_, g)| g.0 >= r.1).min_by_key(|(_, g)| g.0 - r.1).map(|(i, g)| (i, g.0 - r.1, g.1 - g.0));
        let above = groups.iter().enumerate().filter(|(_, g)| g.1 <= r.0).min_by_key(|(_, g)| r.0 - g.1).map(|(i, g)| (i, r.0 - g.1, g.1 - g.0));
        let pick = match (below, above) {
            (Some(b), Some(a)) => if b.1 <= a.1 { Some(b) } else { Some(a) },
            (b, a) => b.or(a),
        };
        match pick {
            Some((i, gap, h)) if gap * 2 <= h.max(4) => { let g = &mut groups[i]; g.0 = g.0.min(r.0); g.1 = g.1.max(r.1); }
            _ => alone.push(*r),
        }
    }
    groups.extend(alone);
    groups.sort();
    groups
}

/// แบ่งภาพเป็นบรรทัดจากแถวที่ใส แล้วต่อแถบบางเข้าบรรทัดของมัน (merge_marks) · ใช้ก่อนส่งให้ PaddleOCR กับ Tesseract
pub fn split_lines(img: &RgbaImage) -> Vec<Line> {
    split_lines_alpha(img, 40)
}

/// แบ่งทีละก้อนหมึกทั้งภาพ แทนการแบ่งทีละแถวแบบเดิม (merge_marks) · สระล่างของบรรทัดบนกับสระบนวรรณยุกต์ของบรรทัดล่างอยู่แถวเดียวกันได้
/// โดยไม่มีแถวใสคั่น แบ่งทีละแถวแล้วสระบนของบรรทัดล่างไปติดบรรทัดบน · ภาพของแต่ละบรรทัดลบหมึกของบรรทัดอื่นออกแล้ว
/// (เจอตอนเทส 16 พ.ย. 2569 ซับไทย "ปู่ของฉันเล่าว่า" ได้สระบนของบรรทัดล่างติดมา PaddleOCR อ่านเป็นขีดสองข้าง)
pub fn split_lines_alpha(img: &RgbaImage, min_alpha: u8) -> Vec<Line> {
    split_by_components(img, min_alpha).into_iter().map(|(y, im)| Line { y, h: im.height(), img: im }).collect()
}

/// ก้อนหมึกที่ติดกัน (8 ทิศ) กรอบ (x0 y0 x1 y1 แบบไม่รวมปลาย) กับจุดทั้งหมด
struct Blob { y0: u32, y1: u32, px: Vec<(u32, u32)> }

fn blobs(img: &RgbaImage, min_alpha: u8) -> Vec<Blob> {
    let (w, h) = img.dimensions();
    let mut seen = vec![false; (w * h) as usize];
    let mut out = vec![];
    for sy in 0..h {
        for sx in 0..w {
            let i = (sy * w + sx) as usize;
            if seen[i] || img.get_pixel(sx, sy)[3] <= min_alpha { continue; }
            seen[i] = true;
            let mut stack = vec![(sx, sy)];
            let mut b = Blob { y0: sy, y1: sy + 1, px: vec![] };
            while let Some((x, y)) = stack.pop() {
                b.px.push((x, y));
                b.y0 = b.y0.min(y);
                b.y1 = b.y1.max(y + 1);
                for dy in -1i32..=1 { for dx in -1i32..=1 {
                    let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { continue; }
                    let j = (ny as u32 * w + nx as u32) as usize;
                    if !seen[j] && img.get_pixel(nx as u32, ny as u32)[3] > min_alpha { seen[j] = true; stack.push((nx as u32, ny as u32)); }
                } }
            }
            out.push(b);
        }
    }
    out
}

/// แบ่งภาพเป็นบรรทัดด้วยก้อนหมึก · ก้อนที่สูงอย่างน้อย 45% ของก้อนที่สูงที่สุดเป็นตัวหลัก (เกณฑ์เดียวกับเครื่องหมายลอยในตัวหาเส้นฐานของ Subtitle Edit)
/// ตัวหลักที่แถวซ้อนกันอย่างน้อยครึ่งของตัวที่เตี้ยกว่าอยู่บรรทัดเดียวกัน · ก้อนเล็ก (สระ วรรณยุกต์ จุด) อยู่กับบรรทัดที่แถวซ้อนกันมากที่สุด
/// ไม่ซ้อนอยู่กับบรรทัดที่ช่องว่างใกล้กว่า เท่ากันเลือกบรรทัดล่าง (ของที่ลอยเหนือบรรทัดพบบ่อยกว่า) · ช่องว่างไกลเกินครึ่งความสูงของบรรทัดนั้น
/// เป็นบรรทัดของตัวเอง (บรรทัดที่มีแต่จุดสามจุดหรือขีด) · คืนตำแหน่งบนกับภาพของแต่ละบรรทัดที่ลบหมึกของบรรทัดอื่นออกแล้ว เรียงบนลงล่าง
fn split_by_components(img: &RgbaImage, min_alpha: u8) -> Vec<(u32, RgbaImage)> {
    let bl = blobs(img, min_alpha);
    let hmax = bl.iter().map(|b| b.y1 - b.y0).max().unwrap_or(0);
    if hmax == 0 { return vec![]; }
    let is_main: Vec<bool> = bl.iter().map(|b| (b.y1 - b.y0) * 100 >= hmax * 45).collect();
    let mut mains: Vec<(u32, u32)> = bl.iter().zip(&is_main).filter(|(_, m)| **m).map(|(b, _)| (b.y0, b.y1)).collect();
    mains.sort();
    let mut lines: Vec<(u32, u32)> = vec![];
    for (a, b) in mains {
        if let Some(l) = lines.last_mut() {
            let ov = l.1.min(b).saturating_sub(l.0.max(a));
            if ov * 2 >= (l.1 - l.0).min(b - a) { l.0 = l.0.min(a); l.1 = l.1.max(b); continue; }
        }
        lines.push((a, b));
    }
    // ก้อนไหนอยู่บรรทัดไหน · usize::MAX คือก้อนที่ห่างทุกบรรทัด
    let mut owner: Vec<usize> = bl.iter().zip(&is_main).map(|(b, m)| {
        let best = lines.iter().enumerate().map(|(i, l)| (i, l.1.min(b.y1).saturating_sub(l.0.max(b.y0)))).max_by_key(|x| (x.1, x.0)).unwrap();
        if best.1 > 0 || *m { return best.0; }
        let (i, gap) = lines.iter().enumerate().map(|(i, l)| (i, if l.0 >= b.y1 { l.0 - b.y1 } else { b.y0.saturating_sub(l.1) }))
            .min_by_key(|x| (x.1, std::cmp::Reverse(x.0))).unwrap();
        if gap * 2 <= (lines[i].1 - lines[i].0).max(4) { i } else { usize::MAX }
    }).collect();
    // ก้อนที่ห่างทุกบรรทัด รวมกลุ่มตามแถวที่ซ้อนหรือติดกัน แล้วเป็นบรรทัดของตัวเอง
    let mut alone: Vec<(u32, u32)> = bl.iter().zip(&owner).filter(|(_, o)| **o == usize::MAX).map(|(b, _)| (b.y0, b.y1)).collect();
    alone.sort();
    let mut groups: Vec<(u32, u32)> = vec![];
    for (a, b) in alone {
        match groups.last_mut() { Some(g) if a <= g.1 => g.1 = g.1.max(b), _ => groups.push((a, b)) }
    }
    for (k, o) in owner.iter_mut().enumerate() {
        if *o == usize::MAX { *o = lines.len() + groups.iter().position(|g| bl[k].y0 >= g.0 && bl[k].y1 <= g.1).unwrap(); }
    }
    lines.extend(groups);
    let (w, _) = img.dimensions();
    let mut out: Vec<(u32, RgbaImage)> = (0..lines.len()).filter_map(|li| {
        let mine: Vec<&Blob> = bl.iter().zip(&owner).filter(|(_, o)| **o == li).map(|(b, _)| b).collect();
        let top = mine.iter().map(|b| b.y0).min()?;
        let bottom = mine.iter().map(|b| b.y1).max()?;
        let mut im = image::imageops::crop_imm(img, 0, top, w, bottom - top).to_image();
        for (b, o) in bl.iter().zip(&owner) {
            if *o == li || b.y1 <= top || b.y0 >= bottom { continue; }
            for &(x, y) in &b.px { if y >= top && y < bottom { im.put_pixel(x, y - top, image::Rgba([0, 0, 0, 0])); } }
        }
        Some((top, im))
    }).collect();
    out.sort_by_key(|x| x.0);
    out
}

/// แถวนี้ใสทั้งแถว (alpha เป็น 0 ทุกจุด) · ตาม NikseBitmap2.IsLineTransparent
fn row_clear(img: &RgbaImage, y: u32) -> bool { y >= img.height() || (0..img.width()).all(|x| img.get_pixel(x, y)[3] == 0) }

fn copy_rows(img: &RgbaImage, y: u32, h: u32) -> Line {
    let h = h.min(img.height().saturating_sub(y));
    Line { y, h, img: image::imageops::crop_imm(img, 0, y, img.width(), h).to_image() }
}

/// ตัวแบ่งบรรทัดของ Subtitle Edit นับแถวที่ไม่ใสหรือไม่ดำ (alpha > 20 และ R+G+B > 20) · ส่วนบนที่สูงไม่เกิน 15 จุดต่อเข้าบรรทัดถัดไป
/// ตาม NikseBitmapImageSplitter2.SplitToLinesTransparentOrBlack
pub fn split_lines_transparent_or_black(img: &RgbaImage) -> Vec<Line> {
    let (mut start, mut size) = (0u32, 0u32);
    let mut parts = vec![];
    for y in 0..img.height() {
        let clear = (0..img.width()).all(|x| { let c = img.get_pixel(x, y); !(c[3] > 20 && c[0] as u32 + c[1] as u32 + c[2] as u32 > 20) });
        if clear {
            if size > 2 && size <= 15 {
                size += 1;
            } else {
                if size > 8 { parts.push(copy_rows(img, start, size + 1)); }
                size = 0;
                start = y;
            }
        } else {
            size += 1;
        }
    }
    if size > 2 { parts.push(if size == img.height() { Line { y: start, h: size, img: img.clone() } } else { copy_rows(img, start, size + 1) }); }
    parts
}

/// ตัวแบ่งบรรทัดของ Subtitle Edit · ส่วนบนที่สูงไม่เกิน min_line_height (จุดของ i) ต่อเข้าบรรทัดถัดไป
/// ส่วนห้อยใต้บรรทัด (หางของ g ที่แยกแถว) ต่อเข้าบรรทัดเดิม · ภาพเป็นบรรทัดเดียวสูงเกิน 100 ใช้ตัวแบ่งแบบไม่ใสหรือไม่ดำ
/// ตาม NikseBitmapImageSplitter2.SplitToLines (average_line_height ไม่ใช้ แบบแบ่งเข้มขึ้นทำในขั้น 5 ถ้าจำเป็น)
pub fn split_lines_se(img: &RgbaImage, min_line_height: u32) -> Vec<Line> { split_lines_se_ex(img, min_line_height).0 }

/// เหมือน split_lines_se และบอกด้วยว่าไปทางภาพทึบทั้งภาพ (split_lines_transparent_or_black) ไหม · ทางนั้น Subtitle Edit ไม่ลองแบ่งแบบเข้มต่อ
pub fn split_lines_se_ex(img: &RgbaImage, min_line_height: u32) -> (Vec<Line>, bool) {
    let h = img.height();
    let (mut start, mut size) = (0u32, 0u32);
    let mut parts = vec![];
    for y in 0..h {
        if row_clear(img, y) {
            let mut appendix = y + min_line_height >= h;
            if !appendix && y + 10 < h && size > min_line_height && min_line_height > 15 {
                let near = (1..=5).all(|k| row_clear(img, y + k));
                if !near && (6..=9).all(|k| row_clear(img, y + k)) { appendix = true; }
            }
            if appendix || (size > 1 && size <= min_line_height) {
                size += 1;
            } else {
                if size > 1 { parts.push(copy_rows(img, start, size + 1)); }
                size = 0;
                start = y;
            }
        } else {
            size += 1;
        }
    }
    if size > 1 {
        if size == h {
            if size > 100 { return (split_lines_transparent_or_black(img), true); }
            parts.push(Line { y: start, h: size, img: img.clone() });
        } else {
            parts.push(copy_rows(img, start, size + 1));
        }
    }
    (parts, false)
}

// ---------------------------------------------------------------- ขยายภาพเล็ก

/// ตัวคูณที่ทำให้บรรทัดที่สูงที่สุดสูงอย่างน้อย target จุด ไม่เกิน 4 เท่า · ไม่มีบรรทัดหรือสูงพอแล้วคืน 1
pub fn upscale_factor(lines: &[Line], target: u32) -> u32 {
    let tall = lines.iter().map(|l| l.h).max().unwrap_or(0);
    if tall == 0 || tall >= target { return 1; }
    target.div_ceil(tall).clamp(1, 4)
}

/// ขยายภาพ f เท่าด้วย Lanczos3 ขอบตัวหนังสือเรียบกว่าขยายแบบจุดต่อจุด ตัวอ่านแยกเส้นได้ดีกว่า
pub fn upscale(img: &RgbaImage, f: u32) -> RgbaImage {
    if f <= 1 { return img.clone(); }
    image::imageops::resize(img, img.width() * f, img.height() * f, image::imageops::FilterType::Lanczos3)
}

/// ภาพบนพื้นดำเผื่อขอบ pad จุดทุกด้าน สีคูณด้วยความทึบ · สูตรที่ลองกับ PaddleOCR แล้วแม่นที่สุด (ขั้น 3 ใช้)
pub fn on_black(img: &RgbaImage, pad: u32) -> image::RgbImage {
    let (w, h) = img.dimensions();
    let mut out = image::RgbImage::new(w + pad * 2, h + pad * 2);
    for (x, y, p) in img.enumerate_pixels() {
        let a = p[3] as u32;
        out.put_pixel(x + pad, y + pad, image::Rgb([(p[0] as u32 * a / 255) as u8, (p[1] as u32 * a / 255) as u8, (p[2] as u32 * a / 255) as u8]));
    }
    out
}

#[cfg(test)]
#[path = "ocrprep_tests.rs"]
mod tests;
