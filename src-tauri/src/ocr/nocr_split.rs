//! ตัวแยกตัวอักษรของ nOCR (แผน OCR ขั้น 5 · BUGS ข้อ 143) แบ่งภาพเป็นบรรทัด แล้วตัดแต่ละบรรทัดเป็นชิ้นตัวอักษร พร้อมเว้นวรรคกับเส้นฐาน
//! เส้นตัดระหว่างตัวอักษรไม่ต้องตรง ไต่อ้อมหมึกซ้ายขวาได้ไม่เกินหนึ่งในสี่ของความสูง ตัวเอียงที่ซ้อนกันจึงยังแยกได้
//! บรรทัดที่แบ่งด้วยแถวใสไม่ได้ (ตัวห้อยของบรรทัดบนแตะตัวสูงของบรรทัดล่าง) ใช้เส้นตัดที่ไต่ขึ้นลงได้
//!
//! แปลจาก src/libuilogic/Ocr/NikseBitmapImageSplitter2.cs (SplitBitmapToLettersNew SetBaseline SplitToLinesByMinTransparentHorizontalLines
//! SplitToLinesNew SplitHorizontalNew RemoveCrumbs IsVerticalLineTransparent CropTopAndBottom IsBitmapsAlike) กับตัวช่วยใน NikseBitmap2.cs
//! ของ Subtitle Edit สัญญา MIT · Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//! ตัวแบ่งบรรทัดตามแถวใส (SplitToLines) อยู่ใน ocrprep::split_lines_se

#![allow(dead_code)]

use crate::ocr::nocr::{copy_rect, Bmp, Piece};
use image::{Rgba, RgbaImage};

#[inline]
fn a(b: &Bmp, x: i32, y: i32) -> u8 { if x < 0 || y < 0 || x >= b.width() as i32 || y >= b.height() as i32 { 0 } else { b.get_pixel(x as u32, y as u32)[3] } }
fn clear_px(b: &mut Bmp, x: i32, y: i32) { if x >= 0 && y >= 0 && x < b.width() as i32 && y < b.height() as i32 { b.put_pixel(x as u32, y as u32, Rgba([0, 0, 0, 0])); } }
fn row_clear(b: &Bmp, y: i32, thr: u8) -> bool { (0..b.width() as i32).all(|x| a(b, x, y) <= thr) }
fn only_clear(b: &Bmp) -> bool { b.pixels().all(|p| p[3] == 0) }

/// ความสูงส่วนที่ไม่ใส (ตัดแถวใสบนกับล่าง) · ตาม GetNonTransparentHeight
pub fn non_clear_height(b: &Bmp) -> i32 {
    let h = b.height() as i32;
    let (mut start, mut bottom) = (0, 0);
    for y in 0..h {
        let c = row_clear(b, y, 0);
        if start == y && c { start += 1; continue; }
        if c { bottom += 1; } else { bottom = 0; }
    }
    h - start - bottom
}

/// ตัดแถวใสด้านบน (alpha ไม่เกิน 10) คืนจำนวนแถวที่ตัด · ตาม CropTopTransparent(0)
fn crop_top_clear(b: &mut Bmp) -> i32 {
    let h = b.height() as i32;
    let Some(top) = (0..h).find(|y| !row_clear(b, *y, 10)) else { return 0 };
    if top == 0 { return 0; }
    *b = copy_rect(b, 0, top, b.width() as i32, h - top);
    top
}

/// ตัดแถวใสบนและล่างของชิ้นตัวอักษร · ตาม CropTopAndBottom(bmp, out topCropping)
pub fn crop_top_bottom(b: &Bmp) -> (Bmp, i32) {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let mut start = 0;
    for y in 0..(h - 2).max(0) { if (0..w).any(|x| a(b, x, y) != 0) { break; } start += 1; }
    let mut hh = h;
    let mut y = h - 1;
    while y > 3 {
        let done = (0..w).any(|x| a(b, x, y) != 0);
        hh = y;
        if done { break; }
        y -= 1;
    }
    if hh - start + 1 <= 0 { return (RgbaImage::new(0, 0), start); }
    (copy_rect(b, 0, start, w, hh - start + 1), start)
}

/// แบ่งบรรทัดตามแถวใสที่ติดกันอย่างน้อย min_clear แถว · ตาม SplitToLinesByMinTransparentHorizontalLines
pub fn split_by_clear_rows(b: &Bmp, min_h: i32, min_clear: i32) -> Vec<Piece> {
    let h = b.height() as i32;
    let w = b.width() as i32;
    let mut parts = vec![];
    let (mut start, mut last_clear, mut seq) = (0, -1, 0);
    let mut y = min_h;
    while y < h - min_h {
        let c = row_clear(b, y, 0);
        if start == y && c { start += 1; y += 1; continue; }
        if c {
            if last_clear == y - 1 { if seq == 0 { seq += 1; } seq += 1; }
            if seq >= min_clear && last_clear - start > min_h {
                let mut part = copy_rect(b, 0, start, w, last_clear - start - 1);
                if !only_clear(&part) && non_clear_height(&part) as f64 + seq as f64 * 0.4 >= min_h as f64 {
                    let ct = crop_top_clear(&mut part);
                    parts.push(Piece::glyph(0, start + ct, part));
                    start = last_clear + 1;
                }
            }
            last_clear = y;
        } else { seq = 0; last_clear = -1; }
        y += 1;
    }
    if h - start > 1 {
        let mut part = copy_rect(b, 0, start, w, h - start);
        if !only_clear(&part) { let ct = crop_top_clear(&mut part); parts.push(Piece::glyph(0, start + ct, part)); }
    }
    parts
}

fn can_down(b: &Bmp, x: i32, y: i32, s: i32) -> bool { (0..=s + 1).all(|i| a(b, x - 1, y + i) < 150) && (s..=s + 1).all(|i| a(b, x, y + i) < 150) }
fn can_up(b: &Bmp, x: i32, y: i32, s: i32) -> bool { (0..=s + 1).all(|i| a(b, x - 1, y - i) < 150) && (s..=s + 1).all(|i| a(b, x, y - i) < 150) }
fn can_up_right(b: &Bmp, up: i32, right: i32, x: i32, y: i32, min_h: i32) -> bool {
    if y - up < 0 || x + right >= b.width() as i32 || y + min_h > b.height() as i32 { return false; }
    let mut my = y;
    while my > y - up && my > 1 { if a(b, x, my) > 150 { return false; } my -= 1; }
    (x..(x + right).min(b.width() as i32)).all(|mx| a(b, mx, y - up) <= 150)
}

/// แบ่งบรรทัดด้วยเส้นตัดที่ไต่ขึ้นลงอ้อมหมึกได้ ใช้เมื่อบรรทัดบนกับล่างแตะกัน · แบ่งไม่ได้คืนชิ้นเดิม · ตาม SplitToLinesNew
pub fn split_lines_new(item: &Piece, min_h: i32) -> Vec<Piece> {
    let Some(src) = item.bmp.as_ref() else { return vec![item.clone()] };
    let mut bmp = src.clone();
    let (w, h) = (bmp.width() as i32, bmp.height() as i32);
    let mut split: Vec<(i32, Vec<(i32, i32)>)> = vec![];
    let mut start = 0;
    let half = min_h / 2;
    let mut started = false;
    let mut y = min_h;
    while y < h - min_h {
        if start == y && row_clear(&bmp, y, 0) { start += 1; y += 1; continue; }
        let mut pts: Vec<(i32, i32)> = vec![];
        let (mut dy, mut completed, mut back, mut x) = (0i32, false, 0, 0i32);
        let max_up = 10.min(half);
        while x < w {
            let cy = y + dy;
            if cy < 0 || cy >= h { started = true; break; }
            let (a1, a2) = (a(&bmp, x, cy), if cy + 1 < h { a(&bmp, x, cy + 1) } else { 0 });
            if a1 > 150 || a2 > 150 {
                if x > 1 && dy < 8 && cy + 3 < h && can_down(&bmp, x, cy, 2) { dy += 2; }
                else if x > 1 && dy < 8 && cy + 4 < h && can_down(&bmp, x, cy, 3) { dy += 3; }
                else if x > 1 && dy < 7 && cy + 5 < h && can_down(&bmp, x, cy, 4) { dy += 4; }
                else if x > 1 && dy > -7 && cy - 3 >= 0 && can_up(&bmp, x, cy, 2) { dy -= 2; }
                else if x > 1 && dy > -7 && cy - 4 >= 0 && can_up(&bmp, x, cy, 3) { dy -= 3; }
                else if x > 1 && dy > -7 && cy - 5 >= 0 && can_up(&bmp, x, cy, 4) { dy -= 4; }
                else if x > 10 && back < 3 && dy > -7 {
                    let mut done = false;
                    'f: for i in 1..max_up {
                        for k in 1..9 {
                            if can_up_right(&bmp, i, 12, x - k, cy, min_h) {
                                back += 1; x -= k; pts.retain(|p| p.0 <= x); dy -= i + 1; done = true; break 'f;
                            }
                        }
                    }
                    if !done { started = true; break; }
                } else { started = true; break; }
            }
            if started { pts.push((x, cy)); }
            completed = x == w - 1;
            x += 1;
        }
        if completed { split.push((y, pts)); }
        y += 1;
    }
    let mut parts = vec![];
    for (key, pts) in split {
        if key - start > min_h && !pts.is_empty() {
            let max_y = pts.iter().map(|p| p.1).max().unwrap();
            let min_y = pts.iter().map(|p| p.1).min().unwrap();
            let mut part = copy_rect(&bmp, 0, start, w, max_y - start);
            for &(px, py) in &pts { for yy in (py - 1)..(start + part.height() as i32) { clear_px(&mut part, px, yy - start); } }
            if !only_clear(&part) && non_clear_height(&part) >= min_h {
                for &(px, py) in &pts { let mut yy = py; while yy >= min_y { clear_px(&mut bmp, px, yy); yy -= 1; } }
                let ct = crop_top_clear(&mut part);
                parts.push(Piece::glyph(item.x, start + ct + item.y, part));
                start = key + 1;
            }
        }
    }
    if h - start > 1 && !parts.is_empty() {
        let mut part = copy_rect(&bmp, 0, start, w, h - start);
        if !only_clear(&part) { let ct = crop_top_clear(&mut part); parts.push(Piece::glyph(item.x, start + ct + item.y, part)); }
    }
    if parts.len() <= 1 { vec![item.clone()] } else { parts }
}

/// เส้นตัดแนวตั้งที่คอลัมน์ x · ไต่อ้อมหมึกซ้ายขวาได้ · คืน (จุดของเส้น, เลื่อนขวา, คอลัมน์ใสทั้งหมด) หรือ None ถ้าตัดไม่ได้ · ตาม IsVerticalLineTransparent
fn vertical_cut(b: &Bmp, x0: i32) -> Option<(Vec<(i32, i32)>, bool, bool)> {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut right, mut clean) = (false, true);
    let (mut lc, mut rc) = (0, 0);
    let mut pts: Vec<(i32, i32)> = vec![];
    let max_slide = h / 4;
    let (mut x, mut y) = (x0, 0);
    while y < h {
        if a(b, x, y) > 100 {
            clean = false;
            if x == 0 { return None; }
            let mut left = false;
            if x < w - 1 && y < h - 1 && a(b, x + 1, y) == 0 && a(b, x + 1, y + 1) == 0 {
                if a(b, x - 1, y) > 0 { x += 1; right = true; } else { x -= 1; left = true; }
            } else if x < w - 1 && y == h - 1 && a(b, x + 1, y) == 0 && a(b, x + 1, y - 1) == 0 {
                if a(b, x - 1, y) > 0 { x += 1; right = true; } else { return None; }
            } else if a(b, x - 1, y) == 0 {
                x -= 1; left = true;
            } else if y > 5 && a(b, x - 1, y - 1) == 0 {
                x -= 1; y -= 1; left = true;
                while pts.last().is_some_and(|p| p.1 > y) { pts.pop(); }
            } else if y > 5 && a(b, x - 1, y - 2) == 0 {
                x -= 1; y -= 2; left = true;
                while pts.last().is_some_and(|p| p.1 > y) { pts.pop(); }
            } else { return None; }
            // ตัวนับซ้ายนับต่อเนื่องเมื่อเคยเลื่อนซ้ายแล้ว แบบตัวแปร left ของ Subtitle Edit ที่ไม่ถูกล้าง
            if left || lc > 0 { lc += 1; }
            if right { rc += 1; }
            if lc > max_slide || rc > max_slide { return None; }
        } else {
            pts.push((x, y));
            y += 1;
        }
    }
    Some((pts, right, clean))
}

/// ชิ้นเล็กมากที่แตะกรอบของตัวข้าง ๆ (เท้าของ a R ที่หลุดออกมา) ทิ้งไป · ตาม RemoveCrumbs กับ IsCrumbOf
fn remove_crumbs(parts: &mut Vec<Piece>) {
    let crumb_of = |parts: &[Piece], i: usize, dir: i32| -> bool {
        let mut j = i as i32 + dir;
        while j >= 0 && (j as usize) < parts.len() && parts[j as usize].bmp.is_none() { j += dir; }
        if j < 0 || j as usize >= parts.len() { return false; }
        let (c, g) = (&parts[i], &parts[j as usize]);
        let (ab, bb) = (c.bmp.as_ref().unwrap(), g.bmp.as_ref().unwrap());
        let (aw, ah, bw, bh) = (ab.width() as i32, ab.height() as i32, bb.width() as i32, bb.height() as i32);
        if aw * ah * 100 > bw * bh || aw * 4 > bw || ah * 4 > bh { return false; }
        let gap = if dir < 0 { c.x - (g.x + bw) } else { g.x - (c.x + aw) };
        gap <= 0 && c.y <= g.y + bh && g.y <= c.y + ah
    };
    let mut i = parts.len();
    while i > 0 {
        i -= 1;
        if parts[i].bmp.is_none() || (!crumb_of(parts, i, -1) && !crumb_of(parts, i, 1)) { continue; }
        let crumb = parts.remove(i);
        if i > 0 && i < parts.len() && parts[i - 1].bmp.is_none() && parts[i].bmp.is_none() && parts[i - 1].special.as_deref() == Some(" ") && parts[i].special.as_deref() == Some(" ") {
            let extra = parts[i].space_pixels + crumb.bmp.as_ref().unwrap().width() as i32;
            parts[i - 1].space_pixels += extra;
            parts.remove(i);
        }
    }
}

/// ตัดบรรทัดเป็นชิ้นตัวอักษร คั่นด้วยชิ้นเว้นวรรคเมื่อช่องว่างตั้งแต่ space_px คอลัมน์ · ตาม SplitHorizontalNew
pub fn split_horizontal(line: &Piece, space_px: i32) -> Vec<Piece> {
    let Some(src) = line.bmp.as_ref() else { return vec![] };
    let mut bmp = RgbaImage::new(src.width() + 1, src.height());
    image::imageops::overlay(&mut bmp, src, 0, 0);
    let (w, h) = (bmp.width() as i32, bmp.height() as i32);
    let mut parts: Vec<Piece> = vec![];
    let (mut start_x, mut width, mut space, mut sub_space) = (0i32, 0i32, 0i32, 0i32);
    let mut cleared = vec![0i32; h as usize];
    let blank = |b: &mut Bmp, xs: i32, xe: i32, y: i32| { if y < 0 || y >= b.height() as i32 { return; } for x in xs.max(0)..=xe.min(b.width() as i32 - 1) { b.put_pixel(x as u32, y as u32, Rgba([0, 0, 0, 0])); } };
    for x in 0..w {
        let cut = vertical_cut(&bmp, x);
        let (pts, right, clean) = match &cut { Some((p, r, c)) => (Some(p), *r, *c), None => (None, false, false) };
        if pts.is_some() && clean { space += 1; }
        if let (true, Some(p)) = (right, pts) {
            let add = p.iter().map(|q| q.0).fold(x, i32::max) - x;
            width += add;
            sub_space = add;
        }
        let new_start = pts.map(|p| p.iter().map(|q| q.0).fold(x, i32::min)).unwrap_or(0);
        match pts {
            None => width += 1,
            Some(p) if width > 0 && new_start > start_x + 1 => {
                width = p.iter().map(|q| q.0).fold(x, i32::max) - start_x - 1;
                start_x += 1;
                let mut b1 = copy_rect(&bmp, start_x, 0, width, h);
                let bw = b1.width() as i32;
                if bw > 0 {
                    for (idx, q) in p.iter().enumerate() {
                        let (xs, xe) = (q.0 - start_x, q.0 + idx as i32 - start_x);
                        if xe < 0 || xs >= bw { continue; }
                        blank(&mut b1, xs, xe, q.1);
                    }
                }
                let (b1, add_y) = crop_top_bottom(&b1);
                if space >= space_px && !parts.is_empty() {
                    parts.push(Piece { y: add_y + line.y, space_pixels: space, ..Piece::special(" ") });
                }
                if b1.width() > 0 && b1.height() > 0 { parts.push(Piece::glyph(start_x + line.x, add_y + line.y, b1)); }
                for q in p {
                    if q.1 < 0 || q.1 >= h { blank(&mut bmp, 0, q.0, q.1); continue; }
                    let c = cleared[q.1 as usize];
                    if q.0 >= c { blank(&mut bmp, c, q.0, q.1); cleared[q.1 as usize] = q.0.min(w - 1) + 1; }
                }
                width = 1;
                start_x = p.iter().map(|q| q.0).fold(x, i32::min);
                space = -sub_space;
                sub_space = 0;
            }
            Some(_) if clean => { width = 1; start_x = new_start; }
            _ => {}
        }
    }
    remove_crumbs(&mut parts);
    parts
}

/// เส้นฐานของบรรทัด ค่ากลางล่างของขอบล่างทุกชิ้น · บรรทัดสั้นที่มีขีดหรือเครื่องหมายคำพูดลอยมากกว่าตัวอักษร ไม่นับเครื่องหมายลอย · ตาม SetBaseline
fn set_baseline(list: &mut [Piece], start: usize) {
    let max_h = list[start..].iter().filter_map(|p| p.bmp.as_ref()).map(|b| b.height() as i32).max().unwrap_or(0);
    let mut g: Vec<(i32, bool)> = list[start..].iter().filter_map(|p| p.bmp.as_ref().map(|b| (p.top + b.height() as i32, (b.height() as i32) * 20 < max_h * 9))).collect();
    if g.is_empty() { return; }
    g.sort_by_key(|x| x.0);
    let med = g[(g.len() - 1) / 2];
    let mut base = med.0;
    let letters: Vec<i32> = g.iter().filter(|x| !x.1).map(|x| x.0).collect();
    let tol = 1.max(max_h / 20);
    if med.1 && !letters.is_empty() {
        let lmin = *letters.iter().min().unwrap();
        if med.0 < lmin - tol {
            let gr: Vec<&(i32, bool)> = g.iter().filter(|x| x.0 >= lmin - tol).collect();
            base = gr[(gr.len() - 1) / 2].0;
        }
    }
    for p in list[start..].iter_mut() { if p.bmp.is_some() { p.baseline = Some(base); } }
}

/// แบ่งภาพทั้งภาพเป็นชิ้นตัวอักษรเรียงตามลำดับการอ่าน คั่นบรรทัดด้วยชิ้นขึ้นบรรทัดใหม่ · ตาม SplitBitmapToLettersNew
/// avg_h ความสูงเฉลี่ยของตัวอักษรจากภาพก่อน ๆ (LineHeightTracker) ยังไม่รู้ส่ง −1 · รู้แล้วภาพบรรทัดเดียวที่สูงเกินสามเท่าลองแบ่งแบบเข้ม
pub fn split_letters(b: &Bmp, space_px: i32, rtl: bool, top_to_bottom: bool, min_h: i32, auto_height: bool, avg_h: f64) -> Vec<Piece> {
    let (se, dark) = crate::ocr::ocrprep::split_lines_se_ex(b, min_h.max(0) as u32);
    let mut old: Vec<Piece> = se.into_iter().map(|l| Piece::glyph(0, l.y as i32, l.img)).collect();
    if !dark && old.len() == 1 && avg_h > 5.0 && b.height() as f64 > avg_h * 3.0 { old = split_lines_aggressive(b, min_h, avg_h); }
    let mut lines = if auto_height {
        let s3 = split_by_clear_rows(b, min_h, 3);
        let s4 = split_by_clear_rows(b, min_h, 4);
        let blank = if s3.len() == s4.len() { s4 } else { s3 };
        let mut l = if old.len() > blank.len() { old } else { blank };
        if l.len() == 1 && l[0].bmp.as_ref().is_some_and(|m| non_clear_height(m) as f64 > min_h as f64 * 2.2) {
            let split = split_lines_new(&l[0], min_h);
            if split.len() < 2 || split.iter().all(|p| p.bmp.as_ref().is_some_and(|m| non_clear_height(m) >= min_h / 2)) { l = split; }
        }
        l
    } else { old };
    if !top_to_bottom { lines.reverse(); }
    let mut list: Vec<Piece> = vec![];
    for (i, line) in lines.iter().enumerate() {
        if i > 0 { list.push(Piece::special("\n")); }
        let start = list.len();
        let mut hs = split_horizontal(line, space_px);
        if rtl { hs.reverse(); }
        for mut it in hs {
            it.top = if i > 0 { it.y - line.y } else { it.y };
            it.parent_y = it.y;
            list.push(it);
        }
        set_baseline(&mut list, start);
    }
    list
}

/// ความทึบแบบดัชนีเรียงของ NikseBitmap2 · x เท่าความกว้างคือจุดแรกของแถวถัดไป (Subtitle Edit อ่านเลยขอบแบบนี้ในตัวแบ่งแบบเข้ม)
fn a_lin(b: &Bmp, x: i32, y: i32) -> u8 {
    let w = b.width() as i32;
    let i = y * w + x;
    if i < 0 || i >= w * b.height() as i32 { 0 } else { b.get_pixel((i % w) as u32, (i / w) as u32)[3] }
}

/// แบ่งบรรทัดที่ตัวห้อยของบรรทัดบนแตะตัวสูงของบรรทัดล่าง จนไม่มีแถวใสคั่น · เมื่อสูงเกินความสูงเฉลี่ยแล้ว แถวที่หมึกของแถวนี้กับแถวก่อนไม่ซ้อนกันในแนวนอนนับเป็นแถวใส
/// ตาม SplitToLinesAggressive
fn split_lines_aggressive(b: &Bmp, min_h: i32, avg: f64) -> Vec<Piece> {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut start, mut size) = (0i32, 0i32);
    let mut parts = vec![];
    let left = |row: i32| { let mut x = 0; while x < w && a_lin(b, x, row) == 0 { x += 1; } x };
    let right = |row: i32| { let mut x = w; while x > 0 && a_lin(b, x, row) == 0 { x -= 1; } x };
    for y in 0..h {
        let mut clear = row_clear(b, y, 0);
        if size > 5 && size >= min_h && size as f64 > avg && !clear && w > 50 && y < h - 5 {
            if left(y) >= right(y - 1) { clear = true; }
            if left(y - 1) >= right(y) { clear = true; }
        }
        if clear {
            if size > 2 && size <= min_h { size += 1; } else {
                if size > 2 { parts.push(Piece::glyph(0, start, copy_rect(b, 0, start, w, size + 1))); }
                size = 0;
                start = y;
            }
        } else { size += 1; }
    }
    if size > 2 {
        if size == h {
            if size > 100 { return crate::ocr::ocrprep::split_lines_transparent_or_black(b).into_iter().map(|l| Piece::glyph(0, l.y as i32, l.img)).collect(); }
            parts.push(Piece::glyph(0, start, b.clone()));
        } else { parts.push(Piece::glyph(0, start, copy_rect(b, 0, start, w, size + 1))); }
    }
    parts
}

/// จำนวนจุดที่ต่างกันของสองภาพขนาดเท่ากัน · ต่างเกินหนึ่งในห้าบวกสิบ · ตาม IsBitmapsAlike (ใช้ตรวจตัวที่สอนซ้ำ)
pub fn bitmaps_alike(b1: &Bmp, b2: &Bmp) -> i32 {
    let (w, h) = (b1.width().min(b2.width()) as i32, b1.height().min(b2.height()) as i32);
    let max = (b1.width() * b1.height()) as i32 / 5;
    let mut diff = 0;
    for y in 0..h { for x in 0..w {
        let (p, q) = (b1.get_pixel(x as u32, y as u32), b2.get_pixel(x as u32, y as u32));
        let close = (p[3] < 120 && q[3] < 120) || {
            (p[3] as i32 - q[3] as i32).abs() <= 50 && ((p[3] > 250 && q[3] > 250 && p.0[..3].iter().all(|v| *v > 90) && q.0[..3].iter().all(|v| *v > 90))
                || ((p[0] as i32 + p[1] as i32 + p[2] as i32) - (q[0] as i32 + q[1] as i32 + q[2] as i32)).abs() <= 20)
        };
        if !close { diff += 1; }
    } }
    if diff > max { diff + 10 } else { diff }
}

#[cfg(test)]
mod tests {
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
}
