//! ตัวจับคู่ภาพกับฐาน binary เทียบความต่าง หาภาพที่ใกล้สุด ตัวพิมพ์เล็กใหญ่
//! แยกจาก binocr/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

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

