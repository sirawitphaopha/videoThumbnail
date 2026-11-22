//! สร้างเส้นของตัวอักษรตอนสอน nOCR (แผน OCR ขั้น 5 · BUGS ข้อ 143) วิธีวาดเส้นสามแบบให้เลือกแบบ Subtitle Edit
//!   Random (ค่าตั้งต้น) สุ่มเส้น เส้นตั้ง เส้นนอน เส้นยาว กลาง สั้น ตรวจทีละเส้นว่าทับหมึกหรือพื้นจริง
//!   SkeletonDistance ทำโครงกระดูกของตัวด้วย Zhang-Suen แล้วไล่เส้นทางย่อด้วย Douglas-Peucker บวกเส้นตามแถวคอลัมน์ทแยงที่ยาวที่สุด
//!     เส้นหลังจากช่องว่างที่ลึกที่สุด (Chamfer distance transform) บวกเส้นตัดมุม
//!   EdgeHough หาเส้นตรงด้วย Hough transform บนหมึกและบนพื้น เก็บช่วงที่ยาวที่สุดตามเส้น บวกเส้นตัดมุม
//! ทุกแบบตัดเส้นซ้ำและเส้นที่ใกล้กันมาก (มุมต่างไม่ถึง 5 องศา จุดกลางใกล้กัน) เก็บเส้นที่ยาวกว่า
//!
//! แปลจาก src/libuilogic/Ocr/NOcrLineGenerator.cs กับ GenerateLineSegmentsRandom IsMatchPointForeGround IsMatchPointBackGround RemoveDuplicates
//! ใน NOcrChar.cs ของ Subtitle Edit สัญญา MIT · Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//! ตัวสุ่มเป็น xorshift ใส่เมล็ดได้ ผลซ้ำได้ในเทส (Subtitle Edit ใช้ Random.Shared)

#![allow(dead_code)]

use crate::ocr::nocr::{Bmp, NChar, NLine, Pt};

const FG: u8 = 150;

/// วิธีวาดเส้น
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, Default)]
pub enum Algo { #[default] Random, SkeletonDistance, EdgeHough }

/// ตัวสุ่มแบบ xorshift64* · next(n) ให้ค่า 0 ถึง n − 1 แบบ Random.Next(n)
pub struct Rng(u64);
impl Rng {
    pub fn new(seed: u64) -> Self { Rng(seed.max(1).wrapping_mul(0x9E3779B97F4A7C15) | 1) }
    pub fn from_time() -> Self { Rng::new(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7)) }
    pub fn next(&mut self, n: i32) -> i32 {
        if n <= 0 { return 0; }
        self.0 ^= self.0 >> 12; self.0 ^= self.0 << 25; self.0 ^= self.0 >> 27;
        ((self.0.wrapping_mul(0x2545F4914F6CDD1D) >> 33) % n as u64) as i32
    }
}

#[inline]
fn alpha(b: &Bmp, x: i32, y: i32) -> u8 { b.get_pixel(x as u32, y as u32)[3] }

/// สร้างเส้นให้ตัวอักษรตามวิธีที่เลือก · max เส้นหน้าและเส้นหลังอย่างละไม่เกินค่านี้โดยประมาณ · ตาม GenerateLineSegments
pub fn generate(max: usize, very_precise: bool, c: &mut NChar, b: &Bmp, algo: Algo, rng: &mut Rng) {
    match algo {
        Algo::SkeletonDistance => skeleton_distance(max, very_precise, c, b, rng),
        Algo::EdgeHough => edge_hough(max, very_precise, c, b, rng),
        Algo::Random => random_lines(max, very_precise, c, b, rng),
    }
}

/// เส้นหน้าต้องทับหมึกทุกจุด · หลวม (loose) ตรวจจุดข้างเคียงสี่ทิศด้วยเมื่อภาพกว้างหรือสูงเกิน 10 · ตาม IsMatchPointForeGround
pub fn fg_ok(op: &NLine, loose: bool, b: &Bmp, c: &NChar) -> bool {
    if (op.start.x - op.end.x).abs() < 2 && (op.end.y - op.start.y).abs() < 2 { return false; }
    let (w, h) = (b.width() as i32, b.height() as i32);
    for p in op.scaled_points(c, w, h) {
        if p.x < 0 || p.y < 0 || p.x >= w || p.y >= h { continue; }
        if alpha(b, p.x, p.y) <= FG { return false; }
        if !loose { continue; }
        if w > 10 && p.x + 1 < w && alpha(b, p.x + 1, p.y) <= FG { return false; }
        if w > 10 && p.x >= 1 && alpha(b, p.x - 1, p.y) <= FG { return false; }
        if h > 10 && p.y + 1 < h && alpha(b, p.x, p.y + 1) <= FG { return false; }
        if h > 10 && p.y >= 1 && alpha(b, p.x, p.y - 1) <= FG { return false; }
    }
    true
}

/// เส้นหลังต้องอยู่บนพื้นทุกจุด · หลวมตรวจจุดข้างเคียงสี่ทิศด้วย · ตาม IsMatchPointBackGround
pub fn bg_ok(op: &NLine, loose: bool, b: &Bmp, c: &NChar) -> bool {
    let (w, h) = (b.width() as i32, b.height() as i32);
    for p in op.scaled_points(c, w, h) {
        if p.x < 0 || p.y < 0 || p.x >= w || p.y >= h { continue; }
        if alpha(b, p.x, p.y) > FG { return false; }
        if !loose { continue; }
        if w > 10 && p.x + 1 < w && alpha(b, p.x + 1, p.y) > FG { return false; }
        if w > 10 && p.x >= 1 && alpha(b, p.x - 1, p.y) > FG { return false; }
        if h > 10 && p.y + 1 < h && alpha(b, p.x, p.y + 1) > FG { return false; }
        if h > 10 && p.y >= 1 && alpha(b, p.x, p.y - 1) > FG { return false; }
    }
    true
}

/// เส้นตั้งที่ x เดียวกันหรือเส้นนอนที่ y เดียวกันที่อยู่ในช่วงของอีกเส้น ตัดทิ้ง · ตาม RemoveDuplicates
pub fn remove_duplicates(lines: &mut Vec<NLine>) {
    let mut del = vec![false; lines.len()];
    for i in 0..lines.len() {
        let o = lines[i];
        for j in 0..lines.len() {
            if j == i || del[j] { continue; }
            let n = lines[j];
            if n.start.x == n.end.x && o.start.x == o.end.x && n.start.x == o.start.x {
                if n.start.y.max(n.end.y) <= o.start.y.max(o.end.y) && n.start.y.min(n.end.y) >= o.start.y.min(o.end.y) { del[j] = true; }
            } else if n.start.y == n.end.y && o.start.y == o.end.y && n.start.y == o.start.y
                && n.start.x.max(n.end.x) <= o.start.x.max(o.end.x) && n.start.x.min(n.end.x) >= o.start.x.min(o.end.x) { del[j] = true; }
        }
    }
    let mut k = 0;
    lines.retain(|_| { k += 1; !del[k - 1] });
}

fn angle(l: &NLine) -> f64 {
    let mut a = ((l.end.y - l.start.y) as f64).atan2((l.end.x - l.start.x) as f64);
    if a < 0.0 { a += std::f64::consts::PI; }
    if a >= std::f64::consts::PI { a -= std::f64::consts::PI; }
    a
}
fn len2(l: &NLine) -> i32 { let (dx, dy) = (l.end.x - l.start.x, l.end.y - l.start.y); dx * dx + dy * dy }
fn axis_dist(a: f64) -> f64 { let pi = std::f64::consts::PI; a.min(pi - a).min((a - pi / 2.0).abs()) }

/// เส้นคู่ที่มุมต่างไม่ถึง 5 องศาและจุดกลางใกล้กัน เก็บเส้นที่ยาวกว่า ยาวพอกันเก็บเส้นที่ตรงแกนกว่า · ตาม RemoveSimilarLines
pub fn remove_similar(lines: &mut Vec<NLine>, w: i32, h: i32) {
    if lines.len() < 2 { return; }
    let thr = std::f64::consts::PI * 5.0 / 180.0;
    let md = 2.0f64.max(w.min(h) as f64 / 8.0);
    let ang: Vec<f64> = lines.iter().map(angle).collect();
    let mid: Vec<(f64, f64)> = lines.iter().map(|l| ((l.start.x + l.end.x) as f64 / 2.0, (l.start.y + l.end.y) as f64 / 2.0)).collect();
    let ln: Vec<i32> = lines.iter().map(len2).collect();
    let mut rm = vec![false; lines.len()];
    for i in 0..lines.len() {
        if rm[i] { continue; }
        for j in i + 1..lines.len() {
            if rm[j] { continue; }
            let mut d = (ang[i] - ang[j]).abs();
            if d > std::f64::consts::PI / 2.0 { d = std::f64::consts::PI - d; }
            if d > thr { continue; }
            let (dx, dy) = (mid[i].0 - mid[j].0, mid[i].1 - mid[j].1);
            if dx * dx + dy * dy > md * md { continue; }
            let maxl = ln[i].max(ln[j]);
            let drop_j = if ((ln[i] - ln[j]).abs() as f64) <= maxl as f64 * 0.25 {
                let (ai, aj) = (axis_dist(ang[i]), axis_dist(ang[j]));
                if ai != aj { ai <= aj } else { ln[j] <= ln[i] }
            } else { ln[j] <= ln[i] };
            if drop_j { rm[j] = true; } else { rm[i] = true; break; }
        }
    }
    let mut k = 0;
    lines.retain(|_| { k += 1; !rm[k - 1] });
}

// ---------------------------------------------------------------- แบบสุ่ม

/// ตาม GenerateLineSegmentsRandom กับ GenerateLines
pub fn random_lines(max: usize, very_precise: bool, c: &mut NChar, b: &Bmp, r: &mut Rng) {
    const GIVE_UP: i32 = 15_000;
    for fg in [true, false] {
        let (mut count, mut hits) = (0, 0usize);
        let mut tvp = very_precise;
        let (mut vx, mut hy) = (2, 2);
        let (w, h) = (c.width, c.height);
        while hits < max && count < GIVE_UP {
            let mut s = Pt { x: r.next(w), y: r.next(h) };
            let mut e = Pt { x: r.next(w), y: r.next(h) };
            let big = w > 4 && h > 4;
            let ok_fn = |op: &NLine, loose: bool, c: &NChar| if fg { fg_ok(op, loose, b, c) } else { bg_ok(op, loose, b, c) };
            if count == 1 && !fg && big { s = Pt { x: 0, y: 4 }; e = Pt { x: 4, y: 0 }; }
            else if count == 2 && !fg && big { s = Pt { x: 0, y: 2 }; e = Pt { x: 2, y: 0 }; }
            else if count == 3 && !fg && big { s = Pt { x: w, y: 4 }; e = Pt { x: w - 4, y: 0 }; }
            else if count == 4 && !fg && big { s = Pt { x: w, y: 2 }; e = Pt { x: w - 2, y: 0 }; }
            else if fg && hits < 5 && count < 200 && big {
                s = Pt::default(); e = Pt::default();
                while vx < w - 3 {
                    s = Pt { x: vx, y: 2 }; e = Pt { x: vx, y: h - 3 };
                    if ok_fn(&NLine { start: s, end: e }, true, c) { vx += 1; break; }
                    vx += 1;
                }
            } else if hits < 10 && count < (if fg { 400 } else { 1000 }) && big {
                s = Pt::default(); e = Pt::default();
                while hy < h - 3 {
                    s = Pt { x: 2, y: hy }; e = Pt { x: w - if fg { 3 } else { 2 }, y: hy };
                    if ok_fn(&NLine { start: s, end: e }, true, c) { hy += 1; break; }
                    hy += 1;
                }
            } else if hits < (if fg { 20 } else { 10 }) && count < (if fg { 2000 } else { 1000 }) {
                for _ in 0..500 { if (s.x - e.x).abs() + (s.y - e.y).abs() > h / 2 { break; } e = Pt { x: r.next(w), y: r.next(h) }; }
            } else if hits < 30 && count < (if fg { 3000 } else { 2000 }) {
                for _ in 0..500 { if (s.x - e.x).abs() + (s.y - e.y).abs() < 15 { break; } e = Pt { x: r.next(w), y: r.next(h) }; }
            } else {
                let min_len = if fg { 15 } else { 5 };
                for _ in 0..500 { if (s.x - e.x).abs() + (s.y - e.y).abs() < min_len { break; } e = Pt { x: r.next(w), y: r.next(h) }; }
            }
            let op = NLine { start: s, end: e };
            let list = if fg { &c.fg } else { &c.bg };
            let ok = !list.contains(&op) && s != e;
            if ok && ok_fn(&op, !tvp, c) {
                if fg { c.fg.push(op); } else { c.bg.push(op); }
                hits += 1;
            }
            count += 1;
            if count > GIVE_UP - 100 && !tvp { tvp = true; }
        }
    }
    remove_duplicates(&mut c.fg);
    remove_duplicates(&mut c.bg);
    let (w, h) = (c.width, c.height);
    remove_similar(&mut c.fg, w, h);
    remove_similar(&mut c.bg, w, h);
}

// ---------------------------------------------------------------- ตัวช่วยของสองแบบที่มีโครงสร้าง

fn mask(b: &Bmp) -> Vec<Vec<bool>> { (0..b.width() as i32).map(|x| (0..b.height() as i32).map(|y| alpha(b, x, y) > FG).collect()).collect() }

/// เส้นหน้าตามแกนกลาง ยอมจุดพื้นได้ไม่เกิน min(2, จำนวนจุด/15) จากขอบเรียบของตัวอักษร · ตาม IsFgCenterline
fn fg_center(op: &NLine, b: &Bmp, c: &NChar) -> bool {
    if (op.start.x - op.end.x).abs() < 2 && (op.end.y - op.start.y).abs() < 2 { return false; }
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut total, mut bg) = (0, 0);
    for p in op.scaled_points(c, w, h) {
        if p.x < 0 || p.y < 0 || p.x >= w || p.y >= h { continue; }
        total += 1;
        if alpha(b, p.x, p.y) <= FG { bg += 1; }
    }
    total > 0 && bg <= 2.min(total / 15)
}

/// เส้นหลังตามแกนกลาง ต้องอยู่บนพื้นทุกจุด · ตาม IsBgCenterline
fn bg_center(op: &NLine, b: &Bmp, c: &NChar) -> bool {
    if (op.start.x - op.end.x).abs() < 2 && (op.end.y - op.start.y).abs() < 2 { return false; }
    let (w, h) = (b.width() as i32, b.height() as i32);
    op.scaled_points(c, w, h).into_iter().all(|p| p.x < 0 || p.y < 0 || p.x >= w || p.y >= h || alpha(b, p.x, p.y) <= FG)
}

fn to_nocr(x: i32, y: i32, c: &NChar, b: &Bmp) -> Pt {
    if b.width() as i32 == c.width && b.height() as i32 == c.height { return Pt { x, y }; }
    Pt { x: (x as f64 * c.width as f64 / b.width() as f64).round_ties_even() as i32, y: (y as f64 * c.height as f64 / b.height() as f64).round_ties_even() as i32 }
}

fn make_line(x1: i32, y1: i32, x2: i32, y2: i32, c: &NChar, b: &Bmp) -> Option<NLine> {
    if x1 == x2 && y1 == y2 { return None; }
    let (s, e) = (to_nocr(x1, y1, c, b), to_nocr(x2, y2, c, b));
    (s != e).then_some(NLine { start: s, end: e })
}

/// เส้นตัดมุมหกเส้นแบบที่แบบสุ่มใช้ในรอบแรกของเส้นหลัง · ตาม AddCornerCuts
fn corner_cuts(c: &mut NChar, b: &Bmp, max: usize) {
    let (w, h) = (c.width, c.height);
    if w <= 4 || h <= 4 { return; }
    for (x1, y1, x2, y2) in [(0, 4, 4, 0), (0, 2, 2, 0), (w, 4, w - 4, 0), (w, 2, w - 2, 0), (0, h - 4, 4, h), (w, h - 4, w - 4, h)] {
        if c.bg.len() >= max { return; }
        let l = NLine::new(x1, y1, x2, y2);
        if bg_center(&l, b, c) { c.bg.push(l); }
    }
}

fn finish(c: &mut NChar) {
    remove_duplicates(&mut c.fg);
    remove_duplicates(&mut c.bg);
    let (w, h) = (c.width, c.height);
    remove_similar(&mut c.fg, w, h);
    remove_similar(&mut c.bg, w, h);
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind { Row, Col, Diag, Anti }
#[derive(Clone, Copy)]
struct Cand { kind: Kind, len: i32, x1: i32, y1: i32, x2: i32, y2: i32, coord: i32 }

/// เลือกเส้นจากยาวไปสั้น เว้นระยะต่อชนิด · ตาม EmitGreedyByLength
fn emit_greedy(mut cands: Vec<Cand>, w: i32, h: i32, c: &mut NChar, b: &Bmp, cap: usize, fg: bool) {
    cands.sort_by_key(|x| std::cmp::Reverse(x.len));
    let (sx, sy, sd) = (2.max(w / 10), 2.max(h / 10), 2.max(w.min(h) / 6));
    let mut picked: [Vec<i32>; 4] = Default::default();
    for cd in cands {
        if (if fg { c.fg.len() } else { c.bg.len() }) >= cap { break; }
        let (k, sp) = match cd.kind { Kind::Row => (0, sy), Kind::Col => (1, sx), Kind::Diag => (2, sd), Kind::Anti => (3, sd) };
        if picked[k].iter().any(|p| (p - cd.coord).abs() < sp) { continue; }
        let Some(l) = make_line(cd.x1, cd.y1, cd.x2, cd.y2, c, b) else { continue };
        if if fg { fg_center(&l, b, c) } else { bg_center(&l, b, c) } {
            if fg { c.fg.push(l); } else { c.bg.push(l); }
            picked[k].push(cd.coord);
        }
    }
}

/// เส้นทแยงที่ยาวที่สุดของจุดชนิดที่ต้องการในแต่ละเส้นทแยง (ยาวอย่างน้อย 5) · ตาม CollectFgDiagonalCandidates กับ CollectBgDiagonalCandidates
fn diag_cands(m: &[Vec<bool>], w: i32, h: i32, anti: bool, want: bool, out: &mut Vec<Cand>) {
    let (lo, hi) = if anti { (0, w + h - 2) } else { (-(h - 1), w - 1) };
    for cc in lo..=hi {
        let (mut x, mut y) = if anti { let x = 0.max(cc - (h - 1)); (x, cc - x) } else { let x = 0.max(-cc); (x, x + cc) };
        let (mut best, mut bs, mut be) = (0, (0, 0), (0, 0));
        let (mut run, mut rs) = (0, (0, 0));
        while x >= 0 && y >= 0 && x < w && y < h {
            if m[x as usize][y as usize] == want {
                if run == 0 { rs = (x, y); }
                run += 1;
                if run > best { best = run; bs = rs; be = (x, y); }
            } else { run = 0; }
            if anti { x += 1; y -= 1; } else { x += 1; y += 1; }
        }
        if best >= 5 { out.push(Cand { kind: if anti { Kind::Anti } else { Kind::Diag }, len: best, x1: bs.0, y1: bs.1, x2: be.0, y2: be.1, coord: cc }); }
    }
}

// ---------------------------------------------------------------- SkeletonDistance

fn zhang_suen(mut im: Vec<Vec<bool>>, w: i32, h: i32) -> Vec<Vec<bool>> {
    let (w, h) = (w as usize, h as usize);
    let mut changed = true;
    let mut iter = 200;
    while changed && iter > 0 {
        iter -= 1;
        changed = false;
        for step in 0..2 {
            let mut rm = vec![];
            for y in 1..h.saturating_sub(1) {
                for x in 1..w.saturating_sub(1) {
                    if !im[x][y] { continue; }
                    let (p2, p3, p4, p5, p6, p7, p8, p9) = (im[x][y - 1], im[x + 1][y - 1], im[x + 1][y], im[x + 1][y + 1], im[x][y + 1], im[x - 1][y + 1], im[x - 1][y], im[x - 1][y - 1]);
                    let bsum = [p2, p3, p4, p5, p6, p7, p8, p9].iter().filter(|v| **v).count();
                    if !(2..=6).contains(&bsum) { continue; }
                    let seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
                    if seq.windows(2).filter(|w| !w[0] && w[1]).count() != 1 { continue; }
                    if step == 0 { if (p2 && p4 && p6) || (p4 && p6 && p8) { continue; } } else if (p2 && p4 && p8) || (p2 && p6 && p8) { continue; }
                    rm.push((x, y));
                }
            }
            if !rm.is_empty() { changed = true; for (x, y) in rm { im[x][y] = false; } }
        }
    }
    im
}

fn neighbors(m: &[Vec<bool>], x: i32, y: i32, w: i32, h: i32) -> usize {
    let mut n = 0;
    for dy in -1..=1 { for dx in -1..=1 { if dx == 0 && dy == 0 { continue; } let (nx, ny) = (x + dx, y + dy); if nx >= 0 && ny >= 0 && nx < w && ny < h && m[nx as usize][ny as usize] { n += 1; } } }
    n
}

/// ไล่เส้นทางของโครงกระดูก ที่ทางแยกเลือกทางที่ต่อแนวเดิม · ตาม TraceFrom
fn trace(m: &[Vec<bool>], vis: &mut [Vec<bool>], sx: i32, sy: i32, w: i32, h: i32) -> Vec<(i32, i32)> {
    const DX: [i32; 8] = [1, -1, 0, 0, 1, 1, -1, -1];
    const DY: [i32; 8] = [0, 0, 1, -1, 1, -1, 1, -1];
    let (mut x, mut y) = (sx, sy);
    let mut path = vec![(x, y)];
    vis[x as usize][y as usize] = true;
    let (mut ldx, mut ldy) = (0, 0);
    loop {
        let mut best: Option<(i32, i32, i32)> = None;
        for i in 0..8 {
            let (dx, dy) = (DX[i], DY[i]);
            let (nx, ny) = (x + dx, y + dy);
            if nx < 0 || ny < 0 || nx >= w || ny >= h || !m[nx as usize][ny as usize] || vis[nx as usize][ny as usize] { continue; }
            let score = if ldx == 0 && ldy == 0 { -(i as i32) } else { (dx * ldx + dy * ldy) * 100 + if dx == 0 || dy == 0 { 10 } else { 0 } - i as i32 };
            if best.is_none_or(|b| score > b.0) { best = Some((score, dx, dy)); }
        }
        let Some((_, dx, dy)) = best else { break };
        x += dx; y += dy;
        vis[x as usize][y as usize] = true;
        path.push((x, y));
        ldx = dx; ldy = dy;
    }
    path
}

fn dp_indices(path: &[(i32, i32)], eps: f64) -> Vec<usize> {
    if path.is_empty() { return vec![]; }
    if path.len() == 1 { return vec![0]; }
    let mut keep = vec![false; path.len()];
    keep[0] = true;
    let last = path.len() - 1;
    keep[last] = true;
    fn rec(p: &[(i32, i32)], i: usize, j: usize, eps: f64, keep: &mut [bool]) {
        if j < i + 2 { return; }
        let (a, b) = (p[i], p[j]);
        let (dx, dy) = ((b.0 - a.0) as f64, (b.1 - a.1) as f64);
        let len = (dx * dx + dy * dy).sqrt();
        let (mut md, mut mi) = (0.0, None);
        for (k, q) in p.iter().enumerate().take(j).skip(i + 1) {
            let d = if len < 1e-9 { (((q.0 - a.0) * (q.0 - a.0) + (q.1 - a.1) * (q.1 - a.1)) as f64).sqrt() } else { (dy * q.0 as f64 - dx * q.1 as f64 + (b.0 * a.1) as f64 - (b.1 * a.0) as f64).abs() / len };
            if d > md { md = d; mi = Some(k); }
        }
        if let Some(k) = mi { if md > eps { keep[k] = true; rec(p, i, k, eps, keep); rec(p, k, j, eps, keep); } }
    }
    if path.len() >= 3 { rec(path, 0, last, eps, &mut keep); }
    (0..path.len()).filter(|i| keep[*i]).collect()
}

fn emit_segment(path: &[(i32, i32)], lo: usize, hi: usize, c: &mut NChar, b: &Bmp, max: usize) {
    if lo >= hi || c.fg.len() >= max { return; }
    if let Some(l) = make_line(path[lo].0, path[lo].1, path[hi].0, path[hi].1, c, b) { if fg_center(&l, b, c) { c.fg.push(l); return; } }
    if hi - lo <= 1 { return; }
    let mid = (lo + hi) / 2;
    emit_segment(path, lo, mid, c, b, max);
    emit_segment(path, mid, hi, c, b, max);
}

fn skeleton_distance(max: usize, very_precise: bool, c: &mut NChar, b: &Bmp, rng: &mut Rng) {
    let (w, h) = (b.width() as i32, b.height() as i32);
    if w < 4 || h < 4 { return random_lines(max, very_precise, c, b, rng); }
    let fg = mask(b);
    let skel = zhang_suen(fg.clone(), w, h);
    // เส้นตามแถวคอลัมน์ทแยงก่อน จับเส้นตรงแกนได้แน่นอน
    let mut cands = vec![];
    for y in 0..h {
        let xs: Vec<i32> = (0..w).filter(|x| fg[*x as usize][y as usize]).collect();
        if let (Some(&f), Some(&l)) = (xs.first(), xs.last()) { if l - f + 1 >= 4 { cands.push(Cand { kind: Kind::Row, len: l - f + 1, x1: f, y1: y, x2: l, y2: y, coord: y }); } }
    }
    for x in 0..w {
        let ys: Vec<i32> = (0..h).filter(|y| fg[x as usize][*y as usize]).collect();
        if let (Some(&f), Some(&l)) = (ys.first(), ys.last()) { if l - f + 1 >= 4 { cands.push(Cand { kind: Kind::Col, len: l - f + 1, x1: x, y1: f, x2: x, y2: l, coord: x }); } }
    }
    diag_cands(&fg, w, h, false, true, &mut cands);
    diag_cands(&fg, w, h, true, true, &mut cands);
    emit_greedy(cands, w, h, c, b, max, true);
    // โครงกระดูกเติมเส้นโค้งกับเส้นเอียงอื่น
    let mut vis = vec![vec![false; h as usize]; w as usize];
    let mut paths = vec![];
    for pass in 0..2 {
        for y in 0..h { for x in 0..w {
            if skel[x as usize][y as usize] && !vis[x as usize][y as usize] && (pass == 1 || neighbors(&skel, x, y, w, h) == 1) {
                let p = trace(&skel, &mut vis, x, y, w, h);
                if p.len() >= 2 { paths.push(p); }
            }
        } }
    }
    for p in paths {
        if c.fg.len() >= max { break; }
        let k = dp_indices(&p, 1.0);
        for i in 0..k.len().saturating_sub(1) { if c.fg.len() >= max { break; } emit_segment(&p, k[i], k[i + 1], c, b, max); }
    }
    // เส้นหลังจากช่องว่างที่ลึกและยาว
    let dt = chamfer(&fg, w, h);
    let mut bc = vec![];
    for y in 0..h {
        let (mut best, mut bs, mut be, mut x) = (0, -1, -1, 0);
        while x < w {
            if fg[x as usize][y as usize] { x += 1; continue; }
            let s = x;
            while x < w && !fg[x as usize][y as usize] { x += 1; }
            if x - s > best { best = x - s; bs = s; be = x - 1; }
        }
        if best >= 4 { let d = dt[((bs + be) / 2) as usize][y as usize]; bc.push(Cand { kind: Kind::Row, len: best.max(d * best), x1: bs, y1: y, x2: be, y2: y, coord: y }); }
    }
    for x in 0..w {
        let (mut best, mut bs, mut be, mut y) = (0, -1, -1, 0);
        while y < h {
            if fg[x as usize][y as usize] { y += 1; continue; }
            let s = y;
            while y < h && !fg[x as usize][y as usize] { y += 1; }
            if y - s > best { best = y - s; bs = s; be = y - 1; }
        }
        if best >= 4 { let d = dt[x as usize][((bs + be) / 2) as usize]; bc.push(Cand { kind: Kind::Col, len: best.max(d * best), x1: x, y1: bs, x2: x, y2: be, coord: x }); }
    }
    diag_cands(&fg, w, h, false, false, &mut bc);
    diag_cands(&fg, w, h, true, false, &mut bc);
    emit_greedy(bc, w, h, c, b, max, false);
    corner_cuts(c, b, max);
    finish(c);
}

/// ระยะถึงหมึกที่ใกล้ที่สุด ตั้งฉาก 3 ทแยง 4 สองรอบ · ตาม ChamferDistanceTransform
fn chamfer(fg: &[Vec<bool>], w: i32, h: i32) -> Vec<Vec<i32>> {
    let (w, h) = (w as usize, h as usize);
    let mut d: Vec<Vec<i32>> = (0..w).map(|x| (0..h).map(|y| if fg[x][y] { 0 } else { 1_000_000 }).collect()).collect();
    for y in 0..h { for x in 0..w {
        if d[x][y] == 0 { continue; }
        let mut v = d[x][y];
        if x > 0 { v = v.min(d[x - 1][y] + 3); }
        if y > 0 { v = v.min(d[x][y - 1] + 3); }
        if x > 0 && y > 0 { v = v.min(d[x - 1][y - 1] + 4); }
        if x + 1 < w && y > 0 { v = v.min(d[x + 1][y - 1] + 4); }
        d[x][y] = v;
    } }
    for y in (0..h).rev() { for x in (0..w).rev() {
        if d[x][y] == 0 { continue; }
        let mut v = d[x][y];
        if x + 1 < w { v = v.min(d[x + 1][y] + 3); }
        if y + 1 < h { v = v.min(d[x][y + 1] + 3); }
        if x + 1 < w && y + 1 < h { v = v.min(d[x + 1][y + 1] + 4); }
        if x > 0 && y + 1 < h { v = v.min(d[x - 1][y + 1] + 4); }
        d[x][y] = v;
    } }
    d
}

// ---------------------------------------------------------------- EdgeHough

fn edge_hough(max: usize, very_precise: bool, c: &mut NChar, b: &Bmp, rng: &mut Rng) {
    let (w, h) = (b.width() as i32, b.height() as i32);
    if w < 6 || h < 6 { return random_lines(max, very_precise, c, b, rng); }
    let fg = mask(b);
    // ขอบแบบ Sobel บนภาพหมึก ใช้เพิ่มน้ำหนักจุดขอบตอนลงคะแนน
    let mut edges = vec![vec![false; h as usize]; w as usize];
    for y in 1..h - 1 { for x in 1..w - 1 {
        let v = |xx: i32, yy: i32| fg[xx as usize][yy as usize] as i32;
        let gx = -v(x - 1, y - 1) - 2 * v(x - 1, y) - v(x - 1, y + 1) + v(x + 1, y - 1) + 2 * v(x + 1, y) + v(x + 1, y + 1);
        let gy = -v(x - 1, y - 1) - 2 * v(x, y - 1) - v(x + 1, y - 1) + v(x - 1, y + 1) + 2 * v(x, y + 1) + v(x + 1, y + 1);
        edges[x as usize][y as usize] = gx.abs() + gy.abs() > 0;
    } }
    let min_run = 3.max(w.min(h) / 4);
    for want in [true, false] {
        let peaks = hough_peaks(&fg, &edges, w, h, want, (max * 3).max(60));
        for (theta, rho) in peaks {
            if (if want { c.fg.len() } else { c.bg.len() }) >= max { break; }
            let Some((x1, y1, x2, y2)) = longest_run(theta, rho, &fg, w, h, want, min_run) else { continue };
            if let Some(l) = make_line(x1, y1, x2, y2, c, b) {
                if want && fg_center(&l, b, c) { c.fg.push(l); } else if !want && bg_center(&l, b, c) { c.bg.push(l); }
            }
        }
    }
    corner_cuts(c, b, max);
    finish(c);
}

/// จุดยอดของ Hough ทีละ 2 องศา ระงับจุดที่ไม่ใช่ค่าสูงสุดในกรอบ ±4 องศา ±2 จุด · ตาม HoughPeaksOnMask
fn hough_peaks(fg: &[Vec<bool>], edges: &[Vec<bool>], w: i32, h: i32, want: bool, max_peaks: usize) -> Vec<(f64, i32)> {
    const T: usize = 90;
    let diag = ((w * w + h * h) as f64).sqrt().ceil() as i32;
    let rc = (2 * diag + 1) as usize;
    let (sin, cos): (Vec<f64>, Vec<f64>) = (0..T).map(|t| { let a = std::f64::consts::PI * t as f64 / T as f64; (a.sin(), a.cos()) }).unzip();
    let mut acc = vec![vec![0i32; rc]; T];
    for y in 0..h { for x in 0..w {
        if fg[x as usize][y as usize] != want { continue; }
        let wt = 1 + edges[x as usize][y as usize] as i32;
        for t in 0..T { let r = (x as f64 * cos[t] + y as f64 * sin[t]).round_ties_even() as i32 + diag; if r >= 0 && (r as usize) < rc { acc[t][r as usize] += wt; } }
    } }
    let min_votes = 4.max(w.min(h) / 3);
    let mut peaks: Vec<(f64, i32, i32)> = vec![];
    for t in 0..T { for r in 1..rc - 1 {
        let v = acc[t][r];
        if v < min_votes { continue; }
        let mut peak = true;
        'n: for dt in -2i32..=2 { for dr in -2i32..=2 {
            if dt == 0 && dr == 0 { continue; }
            let tt = ((t as i32 + dt + T as i32) % T as i32) as usize;
            let rr = r as i32 + dr;
            if rr < 0 || rr as usize >= rc { continue; }
            let o = acc[tt][rr as usize];
            if o > v || (o == v && (tt < t || (tt == t && (rr as usize) < r))) { peak = false; break 'n; }
        } }
        if peak { peaks.push((std::f64::consts::PI * t as f64 / T as f64, r as i32 - diag, v)); }
    } }
    peaks.sort_by_key(|p| std::cmp::Reverse(p.2));
    peaks.truncate(max_peaks);
    peaks.into_iter().map(|p| (p.0, p.1)).collect()
}

/// ช่วงที่ยาวที่สุดของจุดชนิดที่ต้องการตามเส้นของจุดยอด · ตาม LongestRunAlongLine
fn longest_run(theta: f64, rho: i32, fg: &[Vec<bool>], w: i32, h: i32, want: bool, min_run: i32) -> Option<(i32, i32, i32, i32)> {
    let (ct, st) = (theta.cos(), theta.sin());
    let diag = ((w * w + h * h) as f64).sqrt().ceil() as i32;
    let (mut best, mut bs, mut be) = (0, (0, 0), (0, 0));
    let (mut inrun, mut run, mut rs, mut re, mut last_in) = (false, 0, (0, 0), (0, 0), false);
    for t in -diag..=diag {
        let x = (rho as f64 * ct - t as f64 * st).round_ties_even() as i32;
        let y = (rho as f64 * st + t as f64 * ct).round_ties_even() as i32;
        let inside = x >= 0 && y >= 0 && x < w && y < h;
        if inside && last_in && (x, y) == re && inrun { continue; }
        if inside && fg[x as usize][y as usize] == want {
            if !inrun { inrun = true; run = 1; rs = (x, y); } else { run += 1; }
            re = (x, y);
        } else {
            if inrun && run > best { best = run; bs = rs; be = re; }
            inrun = false;
            run = 0;
        }
        last_in = inside;
    }
    if inrun && run > best { best = run; bs = rs; be = re; }
    (best >= min_run).then_some((bs.0, bs.1, be.0, be.1))
}

#[cfg(test)]
#[path = "nocr_lines_tests.rs"]
mod tests;
