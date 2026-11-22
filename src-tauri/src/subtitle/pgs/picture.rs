//! ส่งออก PGS ภาพหนึ่งชุด ตัวแบ่งภาพ ตารางสี ตัวลดสี
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ภาพหนึ่งชุด

/// กรอบหนึ่งกรอบกับภาพในกรอบ เลขสีของทุกจุด
#[derive(Clone, Debug, PartialEq)]
pub struct Obj { pub x: u16, pub y: u16, pub w: u16, pub h: u16, pub px: Vec<u8> }

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Image {
    /// สี RGBA แบบไม่คูณความโปร่งใส · สีที่ 0 โปร่งใสเสมอ
    pub palette: Vec<[u8; 4]>,
    pub objs: Vec<Obj>,
    /// สีก่อนลด
    pub colors: usize,
    /// ซับอยู่เกินสองที่ รวมกรอบแล้ว
    pub merged: bool,
    /// สีของจุดที่ใช้เลขสีนั้นต่างจากสีในจานได้มากสุดเท่าไหร่ (แบบคูณความโปร่งใส 0 ถึง 255) · ใช้ตัดสินว่าภาพถัดไปเปลี่ยนแค่จานสีได้ไหม (BUGS ข้อ 126)
    pub spread: Vec<u8>,
}

/// ความต่างของสองสีแบบคูณความโปร่งใส ค่ามากสุดของสี่ช่อง
fn pm_diff(c: [u8; 4], p: [u8; 4]) -> u8 {
    let pm = |v: u8, a: u8| v as i32 * a as i32 / 255;
    [(pm(c[0], c[3]) - pm(p[0], p[3])).abs(), (pm(c[1], c[3]) - pm(p[1], p[3])).abs(), (pm(c[2], c[3]) - pm(p[2], p[3])).abs(), (c[3] as i32 - p[3] as i32).abs()]
        .into_iter().max().unwrap_or(0).min(255) as u8
}

/// แถวต่อแถวที่มีซับ แบ่งเป็นช่วงแถว · ช่วงเกิน max รวมคู่ที่ห่างกันน้อยที่สุดจนเหลือ max (มาตรฐาน Blu-ray ไม่เกินสอง)
pub(crate) fn row_groups(used: &[bool], max: usize) -> (Vec<(usize, usize)>, bool) {
    let max = max.clamp(1, 2);
    let mut g: Vec<(usize, usize)> = vec![];
    let mut y = 0;
    while y < used.len() {
        if used[y] {
            let s = y;
            while y < used.len() && used[y] { y += 1; }
            g.push((s, y - 1));
        } else { y += 1; }
    }
    let merged = g.len() > max;
    while g.len() > max {
        let k = (0..g.len() - 1).min_by_key(|&i| g[i + 1].0 - g[i].1).unwrap();
        g[k].1 = g[k + 1].1;
        g.remove(k + 1);
    }
    (g, merged)
}

/// สีของจุดแบบไม่คูณความโปร่งใส · ตัวกรอง subtitles ของ ffmpeg ผสมซับลงพื้นดำโปร่งใส สีที่ได้คูณความโปร่งใสมาแล้ว
/// (พิสูจน์แล้ว ขอบตัวอักษรขาวทึบ 76 ได้สี 70) แต่จานสีของ PGS ใช้สีแบบไม่คูณ ไม่หารกลับแล้วขอบตัวอักษรมืดกว่าตอนเล่น
pub fn straight(p: &[u8]) -> u32 {
    let a = p[3] as u32;
    if a == 0 || a == 255 { return u32::from_le_bytes([p[0], p[1], p[2], p[3]]); }
    let f = |c: u8| ((c as u32 * 255 + a / 2) / a).min(255) as u8;
    u32::from_le_bytes([f(p[0]), f(p[1]), f(p[2]), p[3]])
}

/// ค่าที่ใช้ทำภาพของตัวในโปรแกรม จาก PgsOpts
#[derive(Clone, Copy, Debug)]
pub struct Enc {
    /// สีต่อภาพไม่เกิน
    pub k: usize,
    pub dither: bool,
    /// เพิ่มความสด 0.0 ถึง 1.0
    pub vivid: f64,
    pub windows: usize,
}
impl Default for Enc {
    fn default() -> Self { Self { k: 255, dither: false, vivid: 0.0, windows: 2 } }
}
impl Enc {
    pub fn of(o: &PgsOpts) -> Self {
        Self { k: (o.colors as usize).clamp(2, 255), dither: o.dither, vivid: o.vivid.min(100) as f64 / 100.0, windows: (o.windows as usize).clamp(1, 2) }
    }
}

/// เพิ่มความสด ดันสีออกจากเทาที่ความสว่างเดิม (BT.709) · สีเทาขาวดำเหมือนเดิม
pub fn vivid(c: u32, s: f64) -> u32 {
    let [r, g, b, a] = c.to_le_bytes();
    let y = 0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64;
    let f = |v: u8| (y + (v as f64 - y) * (1.0 + s)).round().clamp(0.0, 255.0) as u8;
    u32::from_le_bytes([f(r), f(g), f(b), a])
}

/// สีในจานสีที่ใกล้ที่สุด · เทียบแบบคูณความโปร่งใส สีของจุดที่เกือบใสจึงไม่มีน้ำหนักเกินจริง · คืนเลขสีเริ่มที่ 1
fn nearest(pal: &[[u8; 4]], c: [f64; 4]) -> u8 {
    let pm = |p: &[u8; 4]| { let a = p[3] as f64 / 255.0; [p[0] as f64 * a, p[1] as f64 * a, p[2] as f64 * a, p[3] as f64] };
    let ca = c[3] / 255.0;
    let q = [c[0] * ca, c[1] * ca, c[2] * ca, c[3]];
    let mut best = (f64::MAX, 0usize);
    for (i, p) in pal.iter().enumerate() {
        let v = pm(p);
        let d = (v[0] - q[0]).powi(2) + (v[1] - q[1]).powi(2) + (v[2] - q[2]).powi(2) + (v[3] - q[3]).powi(2) * 2.0;
        if d < best.0 { best = (d, i); }
    }
    (best.1 + 1) as u8
}

/// ภาพ RGBA เต็มจอ เป็นภาพของ PGS · ไม่มีซับเลยได้ None
/// สีเกินจำนวนที่ตั้ง ลดด้วย median cut แล้วให้ทุกจุดใช้สีในจานที่ใกล้ที่สุด (เดิมใช้สีของกล่องที่สีนั้นตกอยู่ ซึ่งไม่ใช่สีที่ใกล้ที่สุดเสมอ)
pub fn image_of(rgba: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Image> {
    let a = |x: usize, y: usize| rgba[(y * w + x) * 4 + 3];
    let used: Vec<bool> = (0..h).map(|y| (0..w).any(|x| a(x, y) > 0)).collect();
    let (groups, merged) = row_groups(&used, enc.windows);
    if groups.is_empty() { return None; }
    // กรอบของแต่ละกลุ่ม กว้างสูงอย่างน้อย 8 จุดตามมาตรฐาน ขยายไม่เกินขอบภาพ และไม่ทับกรอบอื่น
    let mut boxes: Vec<(usize, usize, usize, usize)> = groups.iter().map(|&(y0, y1)| {
        let (mut x0, mut x1) = (w, 0);
        for y in y0..=y1 { for x in 0..w { if a(x, y) > 0 { x0 = x0.min(x); x1 = x1.max(x); } } }
        (x0, y0, x1, y1)
    }).collect();
    for b in boxes.iter_mut() {
        while b.2 + 1 - b.0 < 8 { if b.2 + 1 < w { b.2 += 1; } else if b.0 > 0 { b.0 -= 1; } else { break; } }
    }
    for i in 0..boxes.len() {
        let lo = if i > 0 { boxes[i - 1].3 + 1 } else { 0 };
        let hi = if i + 1 < boxes.len() { boxes[i + 1].1 - 1 } else { h - 1 };
        let b = &mut boxes[i];
        while b.3 + 1 - b.1 < 8 { if b.3 < hi { b.3 += 1; } else if b.1 > lo { b.1 -= 1; } else { break; } }
    }
    // สีแบบไม่คูณความโปร่งใส ปรับความสดแล้ว · จุดที่โปร่งใสทั้งหมดเป็นสีที่ 0
    let col = |i: usize| -> u32 { let c = straight(&rgba[i..i + 4]); if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c } };
    let mut hist: HashMap<u32, u32> = HashMap::new();
    for &(x0, y0, x1, y1) in &boxes {
        for y in y0..=y1 { for x in x0..=x1 {
            let i = (y * w + x) * 4;
            if rgba[i + 3] == 0 { continue; }
            *hist.entry(col(i)).or_insert(0) += 1;
        } }
    }
    let colors = hist.len();
    let k = enc.k.clamp(2, 255);
    let reduced = colors > k;
    let (pal, map) = reduce(hist, k);
    let mut near: HashMap<u32, u8> = HashMap::new();
    let objs: Vec<Obj> = boxes.iter().map(|&(x0, y0, x1, y1)| {
        let (bw, bh) = (x1 + 1 - x0, y1 + 1 - y0);
        let mut px = vec![0u8; bw * bh];
        if reduced && enc.dither {
            // กระจายส่วนต่างของสีไปจุดข้าง ๆ (Floyd–Steinberg) เฉพาะจุดที่มีซับ จุดโปร่งใสรอบตัวอักษรไม่โดนจุดสีกระเด็นใส่
            let mut err = vec![[0f64; 4]; bw * bh];
            for y in 0..bh { for x in 0..bw {
                let i = ((y0 + y) * w + x0 + x) * 4;
                if rgba[i + 3] == 0 { continue; }
                let c = col(i).to_le_bytes();
                let e = err[y * bw + x];
                let want = [0, 1, 2, 3].map(|n| (c[n] as f64 + e[n]).clamp(0.0, 255.0));
                let k = nearest(&pal, want);
                px[y * bw + x] = k;
                let got = pal[k as usize - 1];
                let d = [0, 1, 2, 3].map(|n| want[n] - got[n] as f64);
                let mut push = |xx: isize, yy: usize, f: f64| {
                    if xx < 0 || xx as usize >= bw || yy >= bh { return; }
                    let j = (y0 + yy) * w + x0 + xx as usize;
                    if rgba[j * 4 + 3] == 0 { return; }
                    let t = &mut err[yy * bw + xx as usize];
                    for n in 0..4 { t[n] += d[n] * f; }
                };
                push(x as isize + 1, y, 7.0 / 16.0);
                push(x as isize - 1, y + 1, 3.0 / 16.0);
                push(x as isize, y + 1, 5.0 / 16.0);
                push(x as isize + 1, y + 1, 1.0 / 16.0);
            } }
        } else {
            for y in 0..bh { for x in 0..bw {
                let i = ((y0 + y) * w + x0 + x) * 4;
                if rgba[i + 3] == 0 { continue; }
                let c = col(i);
                px[y * bw + x] = if reduced {
                    *near.entry(c).or_insert_with(|| { let b = c.to_le_bytes(); nearest(&pal, [b[0] as f64, b[1] as f64, b[2] as f64, b[3] as f64]) })
                } else { map[&c] };
            } }
        }
        Obj { x: x0 as u16, y: y0 as u16, w: bw as u16, h: bh as u16, px }
    }).collect();
    let mut palette = vec![[0u8, 0, 0, 0]];
    palette.extend(pal);
    let mut spread = vec![0u8; palette.len()];
    for o in &objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let d = pm_diff(col(i).to_le_bytes(), palette[k]);
            if d > spread[k] { spread[k] = d; }
        } }
    }
    Some(Image { palette, objs, colors, merged, spread })
}

/// ภาพใหม่ที่ทุกจุดยังใช้เลขสีเดิมของภาพที่ขึ้นอยู่ได้ เช่นภาพเฟดหรือสีเปลี่ยนทั้งก้อน คืนจานสีใหม่ ไม่ต้องส่งภาพซ้ำ (BUGS ข้อ 126)
/// เขียนเองตามมาตรฐาน PGS ชุดเปลี่ยนจานสี (palette update) ไม่ได้แปลโค้ดของ SUPer
/// ได้ None เมื่อ มีจุดโผล่นอกกรอบเดิม · จุดที่เคยใสกลับมีสี · สีในเลขเดียวกันต่างกันเกินกว่าที่ภาพเดิมต่างอยู่แล้ว · ภาพใสทั้งภาพ
pub fn palette_update(prev: &Image, rgba: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Vec<[u8; 4]>> {
    if prev.objs.is_empty() || rgba.len() < w * h * 4 { return None; }
    let col = |i: usize| -> [u8; 4] { let c = straight(&rgba[i..i + 4]); (if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c }).to_le_bytes() };
    // จุดนอกกรอบเดิมต้องใสทั้งหมด
    let inside = |x: usize, y: usize| prev.objs.iter().any(|o| x >= o.x as usize && x < (o.x + o.w) as usize && y >= o.y as usize && y < (o.y + o.h) as usize);
    let mut any = false;
    for y in 0..h {
        let row_in = prev.objs.iter().any(|o| y >= o.y as usize && y < (o.y + o.h) as usize);
        for x in 0..w {
            if rgba[(y * w + x) * 4 + 3] == 0 { continue; }
            any = true;
            if !row_in || !inside(x, y) { return None; }
        }
    }
    if !any { return None; }
    // รอบแรก ค่าเฉลี่ยแบบคูณความโปร่งใสของแต่ละเลขสี
    let n = prev.palette.len();
    let mut sum = vec![[0f64; 4]; n];
    let mut cnt = vec![0u32; n];
    for o in &prev.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if k == 0 { if rgba[i + 3] != 0 { return None; } continue; }
            let c = col(i);
            let a = c[3] as f64;
            for ch in 0..3 { sum[k][ch] += c[ch] as f64 * a / 255.0; }
            sum[k][3] += a;
            cnt[k] += 1;
        } }
    }
    let mut pal = prev.palette.clone();
    for k in 1..n {
        if cnt[k] == 0 { continue; }
        let a = sum[k][3] / cnt[k] as f64;
        pal[k] = if a < 0.5 { [0, 0, 0, 0] } else {
            let f = |ch: usize| ((sum[k][ch] / cnt[k] as f64) * 255.0 / a).round().clamp(0.0, 255.0) as u8;
            [f(0), f(1), f(2), a.round().clamp(0.0, 255.0) as u8]
        };
    }
    // รอบสอง ทุกจุดต้องใกล้สีใหม่ของเลขตัวเอง ไม่เกินที่ภาพเดิมต่างอยู่แล้วบวกเผื่อ 6
    for o in &prev.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let lim = prev.spread.get(k).copied().unwrap_or(0) as u16 + 6;
            if pm_diff(col(i), pal[k]) as u16 > lim { return None; }
        } }
    }
    Some(pal)
}

/// ลดสีเหลือไม่เกิน k สีด้วย median cut (ถ่วงตามจำนวนจุด) · คืนสีที่ใช้กับเลขสีของทุกสีเดิม (เริ่มที่ 1)
pub fn reduce(hist: HashMap<u32, u32>, k: usize) -> (Vec<[u8; 4]>, HashMap<u32, u8>) {
    let all: Vec<([u8; 4], u32, u32)> = hist.into_iter().map(|(c, n)| (c.to_le_bytes(), n, c)).collect();
    if all.len() <= k {
        let pal = all.iter().map(|x| x.0).collect();
        let map = all.iter().enumerate().map(|(i, x)| (x.2, (i + 1) as u8)).collect();
        return (pal, map);
    }
    let mut boxes: Vec<Vec<([u8; 4], u32, u32)>> = vec![all];
    while boxes.len() < k {
        // กล่องที่ช่วงสีกว้างที่สุด แบ่งตามสีช่องนั้นที่จุดกึ่งกลางของจำนวนจุด
        let pick = boxes.iter().enumerate().filter(|(_, b)| b.len() > 1).map(|(i, b)| {
            let (ch, range) = (0..4).map(|c| { let lo = b.iter().map(|x| x.0[c]).min().unwrap(); let hi = b.iter().map(|x| x.0[c]).max().unwrap(); (c, hi - lo) }).max_by_key(|x| x.1).unwrap();
            (i, ch, range)
        }).max_by_key(|x| x.2);
        let Some((i, ch, _)) = pick else { break };
        let mut b = boxes.swap_remove(i);
        b.sort_by_key(|x| x.0[ch]);
        let total: u64 = b.iter().map(|x| x.1 as u64).sum();
        let mut acc = 0u64;
        let mut cut = 1;
        for (j, x) in b.iter().enumerate() {
            acc += x.1 as u64;
            if acc * 2 >= total { cut = (j + 1).clamp(1, b.len() - 1); break; }
        }
        let rest = b.split_off(cut);
        boxes.push(b);
        boxes.push(rest);
    }
    let mut pal = vec![];
    let mut map = HashMap::new();
    for (i, b) in boxes.iter().enumerate() {
        let n: u64 = b.iter().map(|x| x.1 as u64).sum::<u64>().max(1);
        let mut s = [0u64; 4];
        for x in b { for c in 0..4 { s[c] += x.0[c] as u64 * x.1 as u64; } }
        pal.push([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8, (s[3] / n) as u8]);
        for x in b { map.insert(x.2, (i + 1) as u8); }
    }
    (pal, map)
}

/// median cut แบบเดียวกับ reduce แต่แบ่งตามแปดช่อง (สีตอนทึบสี่ช่องกับสีตอนกลางเฟดสี่ช่อง) · คืนกลุ่มไม่เกิน k กลุ่ม
fn cut8(all: Vec<([u8; 8], u32, u64)>, k: usize) -> Vec<Vec<([u8; 8], u32, u64)>> {
    if all.len() <= k { return all.into_iter().map(|x| vec![x]).collect(); }
    let mut boxes = vec![all];
    while boxes.len() < k {
        let pick = boxes.iter().enumerate().filter(|(_, b)| b.len() > 1).map(|(i, b)| {
            let (ch, range) = (0..8).map(|c| { let lo = b.iter().map(|x| x.0[c]).min().unwrap(); let hi = b.iter().map(|x| x.0[c]).max().unwrap(); (c, hi - lo) }).max_by_key(|x| x.1).unwrap();
            (i, ch, range)
        }).max_by_key(|x| x.2);
        let Some((i, ch, _)) = pick else { break };
        let mut b = boxes.swap_remove(i);
        b.sort_by_key(|x| x.0[ch]);
        let total: u64 = b.iter().map(|x| x.1 as u64).sum();
        let mut acc = 0u64;
        let mut cut = 1;
        for (j, x) in b.iter().enumerate() {
            acc += x.1 as u64;
            if acc * 2 >= total { cut = (j + 1).clamp(1, b.len() - 1); break; }
        }
        let rest = b.split_off(cut);
        boxes.push(b);
        boxes.push(rest);
    }
    boxes
}

/// ภาพฐานของบรรทัดที่เฟด แยกเลขสีตามสีตอนทึบ (base) คู่กับสีตอนกลางเฟด (probe) (BUGS ข้อ 126)
/// ตัวหนังสือทับเงาครึ่งทึบ ตอนทึบสีเดียวกับตัวหนังสือที่ไม่ทับเงา แต่ตอนเฟดจางไม่เท่ากัน (ความทึบของสองชั้นที่ซ้อนกันไม่ลดตามสัดส่วน)
/// ถ้าใช้เลขเดียวกัน เฟรมเฟดต้องส่งภาพเต็มใหม่ · แยกเลขตามคู่สีแล้ว ทุกเฟรมของการเฟดเปลี่ยนแค่จานสีได้ เพราะความทึบของจุดในกลุ่มเดียวกันขึ้นกับค่าเฟดแบบเดียวกัน
/// ภาพกลางเฟดมีจุดนอกกรอบของภาพทึบ (ภาพคนละแบบ) ได้ None
pub fn image_of_pair(base: &[u8], probe: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Image> {
    let geo = image_of(base, w, h, enc)?;
    if probe.len() < w * h * 4 { return None; }
    let inside = |x: usize, y: usize| geo.objs.iter().any(|o| x >= o.x as usize && x < (o.x + o.w) as usize && y >= o.y as usize && y < (o.y + o.h) as usize);
    for y in 0..h { for x in 0..w { if probe[(y * w + x) * 4 + 3] > 0 && !inside(x, y) { return None; } } }
    let col = |buf: &[u8], i: usize| -> u32 { let c = straight(&buf[i..i + 4]); if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c } };
    let key = |i: usize| ((col(base, i) as u64) << 32) | col(probe, i) as u64;
    let mut hist: HashMap<u64, u32> = HashMap::new();
    for o in &geo.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if base[i + 3] == 0 { continue; }
            *hist.entry(key(i)).or_insert(0) += 1;
        } }
    }
    let items: Vec<([u8; 8], u32, u64)> = hist.into_iter().map(|(kk, n)| {
        let (a, b) = (((kk >> 32) as u32).to_le_bytes(), (kk as u32).to_le_bytes());
        ([a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]], n, kk)
    }).collect();
    let groups = cut8(items, enc.k.clamp(2, 255));
    let mut palette = vec![[0u8, 0, 0, 0]];
    // สีเฉลี่ยของกลุ่มตอนกลางเฟด ใช้วัดว่าสีในกลุ่มต่างกันได้แค่ไหนตอนเฟด
    let mut probe_pal = vec![[0u8, 0, 0, 0]];
    let mut map: HashMap<u64, u8> = HashMap::new();
    for (gi, g) in groups.iter().enumerate() {
        let n: u64 = g.iter().map(|x| x.1 as u64).sum::<u64>().max(1);
        let mut s = [0u64; 8];
        for x in g { for c in 0..8 { s[c] += x.0[c] as u64 * x.1 as u64; } }
        palette.push([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8, (s[3] / n) as u8]);
        probe_pal.push([(s[4] / n) as u8, (s[5] / n) as u8, (s[6] / n) as u8, (s[7] / n) as u8]);
        for x in g { map.insert(x.2, (gi + 1) as u8); }
    }
    let objs: Vec<Obj> = geo.objs.iter().map(|o| {
        let mut px = vec![0u8; o.w as usize * o.h as usize];
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if base[i + 3] == 0 { continue; }
            px[yy * o.w as usize + xx] = map[&key(i)];
        } }
        Obj { px, ..o.clone() }
    }).collect();
    let mut spread = vec![0u8; palette.len()];
    for o in &objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let d = pm_diff(col(base, i).to_le_bytes(), palette[k]).max(pm_diff(col(probe, i).to_le_bytes(), probe_pal[k]));
            if d > spread[k] { spread[k] = d; }
        } }
    }
    Some(Image { palette, objs, colors: geo.colors, merged: geo.merged, spread })
}

