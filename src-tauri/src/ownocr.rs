//! ตัวสอนเองของชั้นหนัง (แผน OCR ขั้น 7 · BUGS ข้อ 143 คำเคาะ ⑪) อ่านภาษาที่มีสระวรรณยุกต์ซ้อนบนล่างอย่างภาษาไทย
//! nOCR กับ Binary OCR ตัดตัวอักษรตามแนวตั้ง พยัญชนะกับสระบนวรรณยุกต์ที่ซ้อนกันจึงกลายเป็นชิ้นเดียว จำนวนแบบที่ต้องสอนบานตามทุกคู่ที่ซ้อน
//! ตัวนี้แยกทีละก้อนหมึก จัดว่าก้อนไหนเป็นตัวหลัก ก้อนไหนอยู่เหนือหรือใต้แถบตัวอักษร ผูกก้อนบนล่างกับตัวหลักที่อยู่ใต้หรือเหนือมัน
//! เทียบทีละก้อนด้วยเส้นแบบ nOCR (ฐานเป็นไฟล์ .nocr ใช้ตัวจับคู่ หน้าต่างสอน และหน้าต่างแก้ฐานชุดเดียวกับ nOCR)
//! แล้วเรียงเป็นข้อความตามลำดับที่ภาษาไทยเก็บ ตัวหลัก สระล่าง สระบน วรรณยุกต์ · นิคหิตกับสระอาต่อเป็นสระอำ
//! ฝึกจากฟอนต์ได้เอง วาดพยางค์ที่รู้ว่าก้อนไหนคืออะไร (พยัญชนะกับสระบนสองชั้น) แล้วสอนทีละก้อน
//! ไม่ได้แปลจากโปรแกรมอื่น ใช้ตัวจับคู่ nOCR (nocr.rs) และตัวสร้างเส้น (nocr_lines.rs) ที่แปลจาก Subtitle Edit

#![allow(dead_code)]

use crate::nocr::{Bmp, NChar, NOcrDb, Piece, Placement};
use crate::nocr_lines::{generate, Algo, Rng};
use crate::nocr_text::{merge_italic, Hit, LineRead, ReadOut};
use image::RgbaImage;
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// ก้อนหมึกหนึ่งก้อน พิกัดในภาพของบรรทัด ภาพมีแต่หมึกของก้อนนี้
#[derive(Clone, Debug)]
pub struct Blob { pub x0: i32, pub y0: i32, pub x1: i32, pub y1: i32, pub bmp: Bmp }

impl Blob {
    fn w(&self) -> i32 { self.x1 - self.x0 }
    fn h(&self) -> i32 { self.y1 - self.y0 }
    fn cx(&self) -> i32 { (self.x0 + self.x1) / 2 }
}

/// ก้อนหมึกแปดทิศของภาพสองสี (จุดที่มีความทึบ) เรียงซ้ายไปขวา
pub fn blobs(img: &Bmp) -> Vec<Blob> {
    let (w, h) = img.dimensions();
    let mut seen = vec![false; (w * h) as usize];
    let mut out = vec![];
    for sy in 0..h {
        for sx in 0..w {
            let i = (sy * w + sx) as usize;
            if seen[i] || img.get_pixel(sx, sy)[3] == 0 { continue; }
            seen[i] = true;
            let mut stack = vec![(sx, sy)];
            let mut px = vec![];
            let (mut x0, mut y0, mut x1, mut y1) = (sx, sy, sx, sy);
            while let Some((x, y)) = stack.pop() {
                px.push((x, y));
                x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y);
                for dy in -1i32..=1 { for dx in -1i32..=1 {
                    let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                    if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { continue; }
                    let j = (ny as u32 * w + nx as u32) as usize;
                    if !seen[j] && img.get_pixel(nx as u32, ny as u32)[3] != 0 { seen[j] = true; stack.push((nx as u32, ny as u32)); }
                } }
            }
            let mut bmp = RgbaImage::new(x1 - x0 + 1, y1 - y0 + 1);
            for (x, y) in px { bmp.put_pixel(x - x0, y - y0, *img.get_pixel(x, y)); }
            out.push(Blob { x0: x0 as i32, y0: y0 as i32, x1: x1 as i32 + 1, y1: y1 as i32 + 1, bmp });
        }
    }
    out.sort_by_key(|b| (b.x0, b.y0));
    out
}

// ---------------------------------------------------------------- จัดตำแหน่ง

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Zone { Base, Above, Below }

/// ก้อนหลักหนึ่งกลุ่ม (ตัวหลักที่ซ้อนกันในแนวตั้ง เช่น ทวิภาค อัศเจรีย์ นับเป็นกลุ่มเดียว) กับก้อนเหนือใต้ที่ผูกอยู่
#[derive(Clone, Debug, Default)]
pub struct Group { pub bases: Vec<usize>, pub above: Vec<usize>, pub below: Vec<usize> }

/// ผังของหนึ่งบรรทัด · แถบตัวอักษรคือขอบบนกับเส้นฐานที่ตัวหลักส่วนใหญ่อยู่
pub struct Layout { pub blobs: Vec<Blob>, pub zones: Vec<Zone>, pub groups: Vec<Group>, pub body_top: i32, pub baseline: i32 }

impl Layout {
    pub fn body(&self) -> i32 { (self.baseline - self.body_top).max(1) }
    /// ตำแหน่งบนที่เก็บในฐาน นับจากขอบบนของแถบ บวกความสูงแถบหนึ่งช่วงให้ก้อนที่อยู่เหนือแถบไม่ติดลบ
    pub fn margin(&self, b: &Blob) -> i32 { (b.y0 - self.body_top + self.body()).max(0) }
    fn span(&self, g: &Group) -> (i32, i32) {
        let all = g.bases.iter().chain(&g.above).chain(&g.below);
        (all.clone().map(|&i| self.blobs[i].x0).min().unwrap_or(0), all.map(|&i| self.blobs[i].x1).max().unwrap_or(0))
    }
}

fn median(mut v: Vec<i32>) -> i32 { if v.is_empty() { return 0; } v.sort(); v[v.len() / 2] }

/// จัดก้อนของหนึ่งบรรทัด · ก้อนที่สูงอย่างน้อย 45% ของก้อนสูงสุดเป็นตัวหลัก ขอบบนแถบกับเส้นฐานคือค่ากลางของตัวหลัก
/// ก้อนเล็กที่อยู่เหนือขอบบนแถบเป็นก้อนบน ใต้เส้นฐานเป็นก้อนล่าง ที่เหลือเป็นตัวหลัก (จุด จุลภาค)
/// ก้อนบนล่างผูกกับตัวหลักที่ซ้อนในแนวนอนมากที่สุด ไม่ซ้อนเลยเป็นตัวหลักของตัวเอง (เครื่องหมายคำพูดก่อนคำ)
pub fn layout(blobs: Vec<Blob>) -> Layout {
    let hmax = blobs.iter().map(|b| b.h()).max().unwrap_or(0);
    let main: Vec<bool> = blobs.iter().map(|b| b.h() * 100 >= hmax * 45).collect();
    let body_top = median(blobs.iter().zip(&main).filter(|x| *x.1).map(|x| x.0.y0).collect());
    let baseline = median(blobs.iter().zip(&main).filter(|x| *x.1).map(|x| x.0.y1).collect());
    let tol = 1.max((baseline - body_top) / 8);
    // ก้อนที่อยู่เหนือแถบหรือใต้แถบทั้งก้อนเป็นก้อนบนก้อนล่างไม่ว่าจะสูงเท่าไร · สระบนกับวรรณยุกต์ที่ติดกันสูงเกินเกณฑ์ตัวหลักได้
    // (เจอตอนเทส 16 พ.ย. 2569 ึ้ ิ้ ็ ถูกนับเป็นตัวหลัก อ่านไม่ออกและไปอยู่ผิดที่)
    let mut zones: Vec<Zone> = blobs.iter().map(|b| {
        if b.y1 <= body_top + tol { Zone::Above } else if b.y0 >= baseline - tol { Zone::Below } else { Zone::Base }
    }).collect();
    // ตัวหลักที่ซ้อนในแนวตั้งและทับกันในแนวนอนเกินครึ่งของตัวที่แคบกว่า รวมเป็นกลุ่มเดียว (: ; ! ?)
    let base_idx: Vec<usize> = (0..blobs.len()).filter(|&i| zones[i] == Zone::Base).collect();
    let xov = |a: &Blob, b: &Blob| (a.x1.min(b.x1) - a.x0.max(b.x0)).max(0);
    let mut groups: Vec<Group> = vec![];
    for &i in &base_idx {
        let b = &blobs[i];
        let into = groups.iter_mut().find(|g| g.bases.iter().any(|&j| {
            let o = &blobs[j];
            let vgap = b.y0 >= o.y1 || o.y0 >= b.y1;
            vgap && xov(b, o) * 2 > b.w().min(o.w())
        }));
        match into { Some(g) => g.bases.push(i), None => groups.push(Group { bases: vec![i], ..Default::default() }) }
    }
    for i in 0..blobs.len() {
        if zones[i] == Zone::Base { continue; }
        let b = &blobs[i];
        let best = groups.iter().enumerate().map(|(k, g)| (k, g.bases.iter().map(|&j| xov(b, &blobs[j])).max().unwrap_or(0))).max_by_key(|x| (x.1, std::cmp::Reverse(x.0)));
        match best {
            Some((k, ov)) if ov > 0 => { if zones[i] == Zone::Above { groups[k].above.push(i) } else { groups[k].below.push(i) } }
            _ => { zones[i] = Zone::Base; groups.push(Group { bases: vec![i], ..Default::default() }); }
        }
    }
    for g in &mut groups {
        g.bases.sort_by_key(|&i| blobs[i].y0);
        g.below.sort_by_key(|&i| blobs[i].x0);
        // ก้อนบนเรียงจากล่างขึ้นบน สระบนก่อนวรรณยุกต์
        g.above.sort_by_key(|&i| std::cmp::Reverse(blobs[i].y1));
    }
    groups.sort_by_key(|g| g.bases.iter().map(|&i| blobs[i].cx()).min().unwrap_or(0));
    Layout { blobs, zones, groups, body_top, baseline }
}

// ---------------------------------------------------------------- ข้อความ

/// นิคหิตตามด้วยวรรณยุกต์แล้วสระอา คือสระอำ ("นํ้า" เป็น "น้ำ") · อักขระที่ต้องเรียงตามที่ภาษาไทยเก็บ
pub fn normalize_thai(s: &str) -> String {
    let c: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '\u{e4d}' {
            let tone = c.get(i + 1).filter(|t| ('\u{e48}'..='\u{e4b}').contains(*t)).copied();
            let k = i + 1 + tone.is_some() as usize;
            if c.get(k) == Some(&'\u{e32}') {
                if let Some(t) = tone { out.push(t); }
                out.push('\u{e33}');
                i = k + 1;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// ค่าที่ใช้อ่าน
#[derive(Clone)]
pub struct OwnOpts { pub max_wrong: i32, pub teach: bool }
impl Default for OwnOpts { fn default() -> Self { OwnOpts { max_wrong: 25, teach: false } } }

/// ช่องระหว่างกลุ่มที่นับเป็นเว้นวรรค เทียบความสูงแถบ · หาช่วงกระโดดใหญ่สุดของช่องที่เรียงแล้วแบบตัวตรวจเว้นวรรคของ nOCR ไม่เจอใช้ 0.35
fn space_threshold(gaps: &[f64]) -> f64 {
    let mut g = gaps.to_vec();
    g.sort_by(|a, b| a.total_cmp(b));
    let (mut best, mut thr) = (0.0, 0.35);
    for w in g.windows(2) {
        let (lo, hi) = (w[0], w[1]);
        if hi < 0.25 || lo > 0.9 || hi - lo < 0.1 { continue; }
        let r = hi / lo.max(0.03);
        if r > best { best = r; thr = (lo + hi) / 2.0; }
    }
    if best >= 1.5 { thr } else { 0.35 }
}

/// ภาพบรรทัดเป็นชิ้นตามลำดับการอ่าน (ใช้กับหน้าต่างสอน) · ชิ้นของกลุ่มเรียง ตัวหลัก ก้อนล่าง ก้อนบน
pub fn line_pieces(l: &Layout, y_off: i32) -> Vec<(Piece, usize)> {
    let mut v = vec![];
    for g in &l.groups {
        for &i in g.bases.iter().chain(&g.below).chain(&g.above) {
            let b = &l.blobs[i];
            let mut p = Piece::glyph(b.x0, b.y0 + y_off, b.bmp.clone());
            p.top = l.margin(b);
            v.push((p, i));
        }
    }
    v
}

/// ตัวอ่านของตัวสอนเอง
#[derive(Default)]
pub struct OwnReader;

impl OwnReader {
    /// อ่านภาพซับหนึ่งภาพ · ภาพสองสี แบ่งบรรทัดทีละก้อนหมึก (ocrprep) จัดผังแต่ละบรรทัด เทียบทีละก้อน แล้วเรียงเป็นข้อความ
    /// pieces ของผลคือทุกก้อนทุกบรรทัดตามลำดับการอ่าน letter ของการหยุดสอนชี้ในรายการนี้ · skip กับ run_once ชี้ด้วยลำดับเดียวกัน
    pub fn read(&self, db: &NOcrDb, img: &Bmp, o: &OwnOpts, skip: &HashSet<usize>, run_once: &HashMap<usize, String>) -> ReadOut {
        let empty = || ReadOut::Done(LineRead { text: String::new(), hits: vec![], pieces: vec![], parent: img.clone(), space_px: 0, unknown: 0 });
        if img.width() == 0 || img.height() == 0 { return empty(); }
        // แบ่งบรรทัดจากภาพเดิมด้วยตัวแบ่งที่ใช้กับ PaddleOCR ก่อน แล้วค่อยทำภาพสองสีทีละบรรทัด
        // (แบ่งจากภาพสองสีแล้วสระบนบางตัวแยกเป็นบรรทัดของตัวเอง เจอตอนเทส 16 พ.ย. 2569)
        let thr2 = crate::ocrprep::two_color_threshold(img);
        let parent = crate::ocrprep::make_two_color(img, thr2);
        let lines = crate::ocrprep::split_lines(img);
        let mut pieces: Vec<Piece> = vec![];
        let mut hits: Vec<Hit> = vec![];
        let mut unknown = 0;
        for (li, line) in lines.iter().enumerate() {
            if li > 0 { hits.push(Hit::text("\n", None)); }
            let l = layout(blobs(&crate::ocrprep::make_two_color(&line.img, thr2)));
            let start = pieces.len();
            let lp = line_pieces(&l, line.y as i32);
            let order: HashMap<usize, usize> = lp.iter().enumerate().map(|(k, (_, bi))| (*bi, start + k)).collect();
            pieces.extend(lp.into_iter().map(|x| x.0));
            let gaps: Vec<f64> = l.groups.windows(2).map(|w| (l.span(&w[1]).0 - l.span(&w[0]).1) as f64 / l.body() as f64).collect();
            let thr = space_threshold(&gaps);
            for (gi, g) in l.groups.iter().enumerate() {
                if gi > 0 && gaps[gi - 1] >= thr { hits.push(Hit::text(" ", None)); }
                // กลุ่มทั้งกลุ่มตรงกับตัวที่สอนเป็นกลุ่ม (ะ ทวิภาค i) ใช้ทั้งกลุ่ม · ไม่ตรง ลองตัวหลักกับก้อนล่าง (ญ ฐ ที่หางแยก) แล้วก้อนบนทีละก้อน
                let parts: Vec<usize> = g.bases.iter().chain(&g.below).chain(&g.above).copied().collect();
                let mut rest = parts.clone();
                if parts.len() > 1 {
                    if let Some(c) = match_group(db, &l, &parts, o.max_wrong) {
                        hits.push(Hit { text: c.text, italic: c.italic, piece: Some(order[&parts[0]]), ..Default::default() });
                        continue;
                    }
                    let low: Vec<usize> = g.bases.iter().chain(&g.below).copied().collect();
                    if low.len() > 1 && !g.above.is_empty() {
                        if let Some(c) = match_group(db, &l, &low, o.max_wrong) {
                            hits.push(Hit { text: c.text, italic: c.italic, piece: Some(order[&low[0]]), ..Default::default() });
                            rest = g.above.clone();
                        }
                    }
                }
                for &bi in &rest {
                    let k = order[&bi];
                    let b = &l.blobs[bi];
                    let (mut m, _) = db.match_single(&b.bmp, l.margin(b), true, o.max_wrong, false, false, Placement::Unknown);
                    // ก้อนที่อยู่เหนือหรือใต้ตัวหลักต้องเป็นสระวรรณยุกต์ของตำแหน่งนั้น · ไม้เอกกับอะพอสทรอฟีรูปเดียวกันในหลายฟอนต์
                    // (เจอตอนเทส 16 พ.ย. 2569 ไม้เอกทุกตัวอ่านเป็น ') ผลที่ไม่ใช่ของตำแหน่งนั้นหรือหาไม่เจอ เลือกตัวที่ใกล้ที่สุดในตำแหน่งนั้น
                    let set = match l.zones[bi] { Zone::Above => THAI_ABOVE, Zone::Below => THAI_BELOW, Zone::Base => "" };
                    if !set.is_empty() && m.as_ref().is_none_or(|c| c.text.is_empty() || !c.text.chars().all(|ch| set.contains(ch))) {
                        m = zone_best(db, &b.bmp, set).or(m.filter(|c| c.text.is_empty()));
                    }
                    match m {
                        Some(c) => { if !c.text.is_empty() { hits.push(Hit { text: c.text, italic: c.italic, piece: Some(k), ..Default::default() }); } }
                        None if o.teach && !skip.contains(&k) && !run_once.contains_key(&k) => return ReadOut::Teach { letter: k, parent, pieces },
                        None => match run_once.get(&k) {
                            Some(t) => hits.push(Hit::text(t, Some(k))),
                            None => { hits.push(Hit::text("*", Some(k))); unknown += 1; }
                        },
                    }
                }
            }
        }
        let text = normalize_thai(&join_quotes(&merge_italic(&hits)).replace("เเ", "แ")).trim().to_string();
        ReadOut::Done(LineRead { text, hits, pieces, parent, space_px: 0, unknown })
    }

    pub fn read_text(&self, db: &NOcrDb, img: &Bmp, o: &OwnOpts) -> LineRead {
        let o = OwnOpts { teach: false, ..o.clone() };
        match self.read(db, img, &o, &HashSet::new(), &HashMap::new()) { ReadOut::Done(r) => r, ReadOut::Teach { .. } => unreachable!() }
    }
}

/// ตัวในฐานที่ข้อความเป็นอักขระของตำแหน่งนั้นล้วน ที่สัดส่วนจุดผิดต่ำสุดไม่เกิน 0.15
fn zone_best(db: &NOcrDb, b: &Bmp, set: &str) -> Option<NChar> {
    let mut texts: Vec<&str> = db.chars.iter().map(|c| c.text.as_str()).filter(|t| !t.is_empty() && t.chars().all(|ch| set.contains(ch))).collect();
    texts.sort();
    texts.dedup();
    texts.into_iter().map(|t| db.best_by_text(b, t, 0.15)).filter(|r| r.0.is_some()).min_by(|a, b| a.1.total_cmp(&b.1)).and_then(|r| r.0)
}

/// ภาพรวมของหลายก้อนในกรอบที่ครอบทุกก้อน
fn union(l: &Layout, parts: &[usize]) -> (Bmp, i32) {
    let (x0, y0) = (parts.iter().map(|&i| l.blobs[i].x0).min().unwrap(), parts.iter().map(|&i| l.blobs[i].y0).min().unwrap());
    let (x1, y1) = (parts.iter().map(|&i| l.blobs[i].x1).max().unwrap(), parts.iter().map(|&i| l.blobs[i].y1).max().unwrap());
    let mut im = RgbaImage::new((x1 - x0) as u32, (y1 - y0) as u32);
    for &i in parts {
        let b = &l.blobs[i];
        for (x, y, p) in b.bmp.enumerate_pixels() { if p[3] > 0 { im.put_pixel(x + (b.x0 - x0) as u32, y + (b.y0 - y0) as u32, *p); } }
    }
    (im, (y0 - l.body_top + l.body()).max(0))
}

/// เทียบทั้งกลุ่มกับตัวที่สอนเป็นกลุ่ม (expand_count เท่าจำนวนก้อน) · สัดส่วนต่างไม่เกิน 25% ขนาดต่างไม่เกินสองเท่า ผิดไม่เกินงบ เลือกสัดส่วนจุดผิดต่ำสุด
fn match_group(db: &NOcrDb, l: &Layout, parts: &[usize], max_wrong: i32) -> Option<NChar> {
    let (im, _) = union(l, parts);
    let (w, h) = (im.width() as i32, im.height() as i32);
    let h2w = h as f64 * 100.0 / w as f64;
    let mut best: Option<(&NChar, f64)> = None;
    for oc in db.expanded.iter().filter(|c| c.expand_count == parts.len() as i32) {
        if (h2w - oc.h2w()).abs() * 100.0 / h2w.min(oc.h2w()) > 25.0 { continue; }
        if h.max(oc.height) > 2 * h.min(oc.height) { continue; }
        let scale = (h as f64 / oc.height as f64).max(1.0);
        let budget = ((max_wrong as f64 * scale).round_ties_even() as i32).min(8.max(w * h / 8));
        if let Some((e, p)) = crate::nocr::count_errors(&im, oc, budget) {
            if p == 0 { continue; }
            let r = e as f64 / p as f64;
            if best.is_none_or(|b| r < b.1) { best = Some((oc, r)); }
        }
    }
    best.map(|b| b.0.clone())
}

// ---------------------------------------------------------------- สอน

/// สอนหนึ่งก้อน (หรือหลายก้อนเป็นกลุ่มเดียวเมื่อ group มีหลายตัว) ข้อความว่างคือก้อนที่ให้ข้ามตอนอ่าน (จุดของ i ที่สอนแยก)
/// pieces กับลำดับมาจาก ReadOut::Teach · top ของชิ้นคือตำแหน่งที่เก็บในฐานอยู่แล้ว
pub fn teach(db: &mut NOcrDb, pieces: &[Piece], group: &[usize], text: &str, italic: bool, lines: usize, algo: Algo, rng: &mut Rng) -> Option<()> {
    let ps: Vec<&Piece> = group.iter().map(|&i| pieces.get(i)).collect::<Option<_>>()?;
    let (bmp, top) = if ps.len() == 1 { (ps[0].bmp.clone()?, ps[0].top) } else {
        let x0 = ps.iter().map(|p| p.x).min()?;
        let y0 = ps.iter().map(|p| p.y).min()?;
        let x1 = ps.iter().map(|p| p.x + p.bmp.as_ref().map_or(0, |b| b.width() as i32)).max()?;
        let y1 = ps.iter().map(|p| p.y + p.bmp.as_ref().map_or(0, |b| b.height() as i32)).max()?;
        let mut im = RgbaImage::new((x1 - x0) as u32, (y1 - y0) as u32);
        for p in &ps { for (x, y, c) in p.bmp.as_ref()?.enumerate_pixels() { if c[3] > 0 { im.put_pixel(x + (p.x - x0) as u32, y + (p.y - y0) as u32, *c); } } }
        let top = ps.iter().map(|p| p.top - (p.y - y0)).min()?;
        (im, top.max(0))
    };
    let mut c = NChar { text: text.into(), width: bmp.width() as i32, height: bmp.height() as i32, margin_top: top, italic, expand_count: if ps.len() > 1 { ps.len() as i32 } else { 0 }, ..Default::default() };
    generate(lines, false, &mut c, &bmp, algo, rng);
    db.add(c);
    Some(())
}

// ---------------------------------------------------------------- ฝึกจากฟอนต์

/// ตัวหลักของไทย (พยัญชนะ สระหน้า สระหลัง เลข เครื่องหมาย) · ก้อนล่าง · ก้อนบน
pub const THAI_BASES: &str = "กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรฤลฦวศษสหฬอฮะาเแโใไๅ๐๑๒๓๔๕๖๗๘๙ๆฯ";
pub const THAI_BELOW: &str = "\u{e38}\u{e39}\u{e3a}";
pub const THAI_ABOVE: &str = "\u{e31}\u{e34}\u{e35}\u{e36}\u{e37}\u{e47}\u{e48}\u{e49}\u{e4a}\u{e4b}\u{e4c}\u{e4d}";

/// พยางค์ที่ใช้ฝึก · ตัวหลักเดี่ยวทุกตัว พยัญชนะกับสระล่าง สระบน วรรณยุกต์ สระบนซ้อนวรรณยุกต์ (วรรณยุกต์ชั้นบน) และสระอำ
pub fn thai_clusters() -> Vec<String> {
    let mut v: Vec<String> = THAI_BASES.chars().map(|c| c.to_string()).collect();
    for m in THAI_BELOW.chars().chain(THAI_ABOVE.chars()) { v.push(format!("ก{m}")); }
    for up in ['\u{e34}', '\u{e35}', '\u{e36}', '\u{e37}'] {
        for t in ['\u{e48}', '\u{e49}', '\u{e4a}', '\u{e4b}', '\u{e4c}'] { v.push(format!("ก{up}{t}")); }
    }
    for t in ['\u{e48}', '\u{e49}', '\u{e4a}', '\u{e4b}'] { v.push(format!("ป{t}")); v.push(format!("น{t}\u{e33}")); }
    v.push("กำ".into());
    v.push("ป\u{e38}\u{e48}".into());
    v.push("'".into());
    v.push("\"".into());
    v
}

/// แยกพยางค์เป็นตัวหลัก ก้อนล่าง ก้อนบน (บนเรียงจากล่างขึ้นบน) · สระอำเป็นนิคหิตบนกับสระอาหลัก
pub fn split_cluster(s: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let (mut b, mut lo, mut up) = (vec![], vec![], vec![]);
    let mut tail = vec![];
    for c in s.chars() {
        if c == '\u{e33}' { up.push("\u{e4d}".to_string()); tail.push("\u{e32}".to_string()); }
        else if THAI_BELOW.contains(c) { lo.push(c.to_string()); }
        else if THAI_ABOVE.contains(c) { up.push(c.to_string()); }
        else { b.push(c.to_string()); }
    }
    // นิคหิตของสระอำอยู่ใต้วรรณยุกต์ (นิคหิตก่อน)
    if up.len() > 1 && up.last().map(|s| s.as_str()) == Some("\u{e4d}") { let n = up.pop().unwrap(); up.insert(0, n); }
    b.extend(tail);
    (b, lo, up)
}

/// ฝึกจากฟอนต์ · วาดแต่ละพยางค์ จัดผัง แล้วจับคู่ก้อนกับตัวอักษรตามตำแหน่ง ก้อนที่ฐานยังอ่านไม่ออกเป็นตัวนั้นสอนเพิ่ม
/// ก้อนบนก้อนล่างที่ไม่ผูกกับตัวหลักหรือจำนวนก้อนไม่ตรงที่คาด ข้ามพยางค์นั้น · คืนจำนวนก้อนที่สอนกับพยางค์ที่ข้าม
pub fn train_font(tools: &Path, work: &Path, db: &mut NOcrDb, font: &str, size: f32, bold: bool, italic: bool, lines: usize, algo: Algo, rng: &mut Rng) -> Result<(usize, Vec<String>), String> {
    let clusters = thai_clusters();
    // นำด้วย ก สามตัว แถบตัวอักษรของภาพจึงเป็นแถบของพยัญชนะไทยแบบตอนอ่าน (นำด้วย H แล้วแถบเพี้ยน ไ ใ ป ฝ จับคู่ไม่ได้ เจอตอนเทส 16 พ.ย. 2569)
    let renders = crate::nocr_train::render_with(tools, work, &clusters, "กกก   ", 1.7, font, size, bold, italic)?;
    let mut learned = 0;
    let mut skipped = vec![];
    let mut made: Vec<(String, Bmp)> = vec![];
    for (s, r) in clusters.iter().zip(renders) {
        let Some(r) = r else { skipped.push(s.clone()); continue };
        let l = layout(blobs(&r.two));
        if l.groups.len() < 3 { skipped.push(s.clone()); continue; }
        let groups = &l.groups[3..];
        let (eb, el, eu) = split_cluster(s);
        // แ วาดเป็น เ สองก้อน ตัวอ่านต่อ เเ เป็น แ · เครื่องหมายคำพูดสองขีดสอนเป็นอะพอสทรอฟีสองตัว ตัวอ่านต่อเป็นเครื่องหมายคำพูด
        let eb: Vec<String> = match s.as_str() { "แ" => vec!["เ".into(), "เ".into()], "\"" => vec!["'".into(), "'".into()], _ => eb };
        if groups.len() != eb.len() { skipped.push(s.clone()); continue; }
        let mut todo: Vec<(Vec<usize>, String)> = vec![];
        for (g, t) in groups.iter().zip(&eb) {
            let mut part = g.bases.clone();
            // หางที่แยกเป็นก้อนล่างของ ญ ฐ (พยางค์ไม่มีสระล่าง) เป็นส่วนของตัวหลัก
            if el.is_empty() { part.extend(&g.below); }
            todo.push((part, t.clone()));
        }
        let below: Vec<usize> = if el.is_empty() { vec![] } else { groups.iter().flat_map(|g| g.below.iter().copied()).collect() };
        let above: Vec<usize> = groups.iter().flat_map(|g| g.above.iter().copied()).collect();
        // สระบนกับวรรณยุกต์ที่ติดกันเป็นก้อนเดียว สอนเป็นก้อนคู่ (ข้อความสองอักขระเรียงล่างขึ้นบน)
        let eu: Vec<String> = if above.len() == 1 && eu.len() > 1 { vec![eu.concat()] } else { eu };
        if below.len() != el.len() || above.len() != eu.len() { skipped.push(s.clone()); continue; }
        todo.extend(below.iter().zip(&el).chain(above.iter().zip(&eu)).map(|(i, t)| (vec![*i], t.clone())));
        for (parts, t) in todo {
            if parts.len() == 1 {
                let b = &l.blobs[parts[0]];
                let top = l.margin(b);
                if db.match_single(&b.bmp, top, true, 25, false, false, Placement::Unknown).0.is_some_and(|m| m.text == t) { continue; }
                let mut c = NChar { text: t.clone(), width: b.w(), height: b.h(), margin_top: top, italic, ..Default::default() };
                generate(lines, false, &mut c, &b.bmp, algo, rng);
                made.push((t.clone(), b.bmp.clone()));
                db.add(c);
            } else {
                // ตัวที่มีหลายก้อน (ะ ญ ฐ ที่หางแยก) สอนเป็นกลุ่ม
                if match_group(db, &l, &parts, 25).is_some_and(|m| m.text == t) { continue; }
                let (bmp, top) = union(&l, &parts);
                let mut c = NChar { text: t.clone(), width: bmp.width() as i32, height: bmp.height() as i32, margin_top: top, italic, expand_count: parts.len() as i32, ..Default::default() };
                generate(lines + 20, false, &mut c, &bmp, algo, rng);
                db.add(c);
            }
            learned += 1;
        }
    }
    // วรรณยุกต์กับสระบนรูปคล้ายกัน (ไม้เอก ไม้จัตวา) เพิ่มเส้นตรงจุดที่ต่างจากตัวคล้าย
    for c in db.chars.iter_mut() {
        let Some((_, own)) = made.iter().find(|m| m.0 == c.text && m.1.width() as i32 == c.width && m.1.height() as i32 == c.height) else { continue };
        for (t, other) in &made { if *t != c.text { crate::nocr_train::add_discriminative_lines(c, own, other, rng); } }
    }
    db.clear_cache();
    Ok((learned, skipped))
}

/// อะพอสทรอฟีสองตัวติดกันเป็นเครื่องหมายคำพูด
pub fn join_quotes(s: &str) -> String { s.replace("''", "\"") }

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    fn levenshtein(a: &[char], b: &[char]) -> usize {
        let mut prev: Vec<usize> = (0..=b.len()).collect();
        for (i, ca) in a.iter().enumerate() {
            let mut cur = vec![i + 1; b.len() + 1];
            for (j, cb) in b.iter().enumerate() { cur[j + 1] = (prev[j] + (ca != cb) as usize).min(prev[j + 1] + 1).min(cur[j] + 1); }
            prev = cur;
        }
        prev[b.len()]
    }

    #[test]
    fn thai_order_and_sara_am() {
        assert_eq!(normalize_thai("น\u{e4d}\u{e49}า"), "น้ำ");
        assert_eq!(normalize_thai("ก\u{e4d}า"), "กำ");
        let (b, lo, up) = split_cluster("น้ำ");
        assert_eq!((b, lo, up), (vec!["น".to_string(), "า".to_string()], vec![], vec!["\u{e4d}".to_string(), "\u{e49}".to_string()]));
        let (b, lo, up) = split_cluster("ปู่");
        assert_eq!((b.len(), lo, up), (1, vec!["\u{e39}".to_string()], vec!["\u{e48}".to_string()]));
    }

    fn bar(img: &mut RgbaImage, x0: u32, y0: u32, w: u32, h: u32) { for y in y0..y0 + h { for x in x0..x0 + w { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } } }

    /// ตัวหลักสองตัว ก้อนบนสองชั้นเหนือตัวแรก ก้อนล่างใต้ตัวที่สอง ขีดลอยซ้ายสุดที่ไม่ซ้อนตัวไหนเป็นตัวหลักของตัวเอง
    #[test]
    fn layout_zones_and_groups() {
        let mut img = RgbaImage::new(120, 80);
        bar(&mut img, 2, 5, 3, 8);     // ขีดลอยซ้ายไม่ซ้อนตัวไหน
        bar(&mut img, 10, 25, 20, 30); // ตัวหลัก 1
        bar(&mut img, 15, 17, 10, 5);  // สระบน
        bar(&mut img, 18, 8, 6, 6);    // วรรณยุกต์
        bar(&mut img, 40, 25, 20, 30); // ตัวหลัก 2
        bar(&mut img, 45, 58, 8, 6);   // สระล่าง
        let l = layout(blobs(&img));
        assert_eq!(l.groups.len(), 3, "{:?}", l.groups);
        let g1 = &l.groups[1];
        assert_eq!(g1.above.len(), 2);
        assert!(l.blobs[g1.above[0]].y0 > l.blobs[g1.above[1]].y0, "สระบนต้องมาก่อนวรรณยุกต์");
        assert_eq!(l.groups[2].below.len(), 1);
    }

    /// ฝึกจาก Leelawadee UI แล้วอ่านซับไทยทดสอบเทียบคำตอบ · ต้องมีไฟล์ทดสอบไทยของ make-test-media กับ ffmpeg ที่แนบมา
    #[test]
    fn thai_test_sub_after_font_training() {
        let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
        if !tools.join("ffmpeg.exe").exists() || !dir.join("th.sup").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return; }
        let work = std::env::temp_dir().join("movie-shelf-ownocr");
        std::fs::create_dir_all(&work).unwrap();
        let mut db = NOcrDb::empty(&work.join("th.nocr"));
        let mut rng = Rng::new(11);
        let mut learned = 0;
        for (size, italic) in [(64.0, false), (52.0, false), (64.0, true)] {
            let (n, skipped) = train_font(&tools, &work, &mut db, "Leelawadee UI", size, false, italic, 60, Algo::Random, &mut rng).unwrap();
            eprintln!("ฝึก {size} ตัวเอียง {italic} ได้ {n} ก้อน ข้าม {skipped:?}");
            learned += n;
        }
        assert!(learned > 100);
        let shows = crate::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
        let want: Vec<String> = std::fs::read_to_string(dir.join("th.truth.txt")).unwrap().lines().map(|l| l.replace('¶', "\n")).collect();
        let reader = OwnReader;
        let (mut ok, mut bad, mut edits, mut total) = (0, vec![], 0, 0);
        for (k, (s, w)) in shows.iter().zip(&want).enumerate() {
            let got = reader.read_text(&db, &s.img, &OwnOpts::default()).text;
            let plain = |x: &str| x.replace("<i>", "").replace("</i>", "");
            let (g, t): (Vec<char>, Vec<char>) = (plain(&got).chars().collect(), plain(w).chars().collect());
            edits += levenshtein(&g, &t);
            total += t.len();
            if g == t { ok += 1; } else { bad.push((k + 1, got, w.clone())); }
        }
        let cer = edits as f64 * 100.0 / total as f64;
        eprintln!("ตัวสอนเองอ่านซับไทยถูกทั้งภาพ {ok} จาก {} ภาพ อักขระผิด {edits} จาก {total} ({cer:.2}%) · ผิด {bad:?}", shows.len());
        let _ = std::fs::remove_dir_all(&work);
        // ผลวันที่เขียน 16 พ.ย. 2569 ถูกทั้งภาพ 9 จาก 17 · ตัวคล้าย (ึ ื, ้ ๊ บนสระ, ช ซ, ก ค ขนาดเล็ก) กับตัวเอียงยังพลาด เกณฑ์กันผลแย่ลง
        assert!(ok >= 9 && cer <= 3.0, "ตัวสอนเองแย่ลง ถูก {ok} อักขระผิด {cer:.2}%");
    }
}
