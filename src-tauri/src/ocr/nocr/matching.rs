//! ตัวช่วยเทียบภาพตัวอักษร รวมชิ้น ขยายชิ้น เส้นฐาน กรองรอบ นับจุดต่าง ตัวพิมพ์เล็กใหญ่ ตัดหาง
//! แยกจาก nocr/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

/// ทุกชิ้นที่ตัวอักษรหลายชิ้นอ้าง ต้องมีส่วนบนของชิ้นอื่นอยู่เหนือตัวหลัก (ตัวมีเครื่องหมายเช่น û) · ตาม IsPlausibleGroup
pub(crate) fn plausible_group(oc: &NChar, list: &[Piece], idx: usize) -> bool {
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
pub(crate) fn scale_sane(t: i32, c: i32) -> bool { t > 0 && c > 0 && t.max(c) * 2 <= t.min(c) * 5 }

/// ชิ้นที่มีหมึกที่ (x, y) ในกลุ่มที่อ้าง นับจากชิ้นแรกของกลุ่ม · ไม่มีคืน None · ตาม GroupForegroundPiece
fn group_piece(list: &[Piece], idx: usize, count: i32, x: i32, y: i32) -> Option<usize> {
    let end = list.len().min(idx + count.max(0) as usize);
    (idx..end).find(|i| { let it = &list[*i]; it.bmp.as_ref().is_some_and(|b| { let (lx, ly) = (x - it.x, y - it.y); inside(b, lx, ly) && alpha(b, lx, ly) > 150 }) }).map(|i| i - idx)
}

pub(crate) fn expanded_exact(oc: &NChar, item: &Piece, parent: &Bmp, list: &[Piece], idx: usize) -> bool {
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
pub(crate) fn expanded_scaled(oc: &NChar, item: &Piece, parent: &Bmp, tw: i32, th: i32, list: &[Piece], idx: usize) -> bool {
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
pub(crate) fn total_size(idx: usize, list: &[Piece], count: i32) -> (i32, i32) {
    if idx + count as usize > list.len() { return (-100, -100); }
    let (mut x0, mut x1, mut y0, mut y1) = (i32::MAX, i32::MIN, i32::MAX, i32::MIN);
    for it in &list[idx..idx + count as usize] {
        let Some(b) = it.bmp.as_ref() else { return (-100, -100) };
        y0 = y0.min(it.y); y1 = y1.max(it.y + b.height() as i32); x0 = x0.min(it.x); x1 = x1.max(it.x + b.width() as i32);
    }
    (x1 - x0, y1 - y0)
}

/// ชิ้นห้อยใต้เส้นฐานเกินหนึ่งในยี่สิบของความสูงบรรทัด (หางของจุลภาค) · ตาม HangsBelowBaseline
pub(crate) fn hangs_below(it: &Piece) -> bool {
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
pub(crate) fn fits_placement(oc: &NChar, p: Placement) -> bool {
    match p {
        Placement::OnBaseline => !matches!(oc.text.as_str(), "-" | "‐" | "–" | "—" | "°" | "^"),
        Placement::AboveBaseline => !matches!(oc.text.as_str(), "." | "…" | "_"),
        Placement::Unknown => true,
    }
}

/// จุลภาคเหนือเส้นฐานคืออะพอสทรอฟี เครื่องหมายคำพูดบนเส้นฐานคือจุลภาค จุลภาคที่ไม่ห้อยและกว้างพอคือจุด · ตาม PlaceMark
pub(crate) fn place_mark(m: Option<NChar>, p: Placement, item: &Piece) -> Option<NChar> {
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
pub(crate) fn by_baseline(b: &Bmp, oc: &NChar, p: Placement) -> bool { p == Placement::OnBaseline && ((b.width() * b.height()) as i32) < SMALL_AREA && is_baseline_mark(&oc.text) }

pub(crate) fn pass_filter(b: &Bmp, h2w: f64, oc: &NChar, top: i32, pass: &Pass, place: Placement) -> bool {
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
pub(crate) fn resolve_case_twin(best: Option<NChar>, br: f64, up: Option<NChar>, ur: f64, lo: Option<NChar>, lr: f64, h: i32, top: i32) -> Option<NChar> {
    let (Some(b), Some(u), Some(l)) = (best.as_ref(), up.as_ref(), lo.as_ref()) else { return best };
    if !is_case_twin(&b.text) || u.text.to_lowercase() != l.text.to_lowercase() || ur.max(lr) > br + CASE_TWIN_MARGIN { return best; }
    let d = |oc: &NChar| (oc.margin_top as f64 * h as f64 / oc.height as f64 - top as f64).abs();
    if d(u) <= d(l) { up } else { lo }
}

/// แถวที่ว่างหรือคอคอดระหว่างส่วนบนกับส่วนที่เหลือ (จุดของ i) · ตาม HasGapOrNeck
pub(crate) fn has_gap_or_neck(b: &Bmp) -> bool {
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
pub(crate) fn points_upper(oc: &NChar, w: i32, h: i32) -> i32 {
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
pub(crate) fn trim_to_ink(b: &Bmp) -> Option<(Bmp, i32)> {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, -1, -1);
    for y in 0..h { for x in 0..w { if alpha(b, x, y) > 150 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x1 < 0 || x1 - x0 + 1 < 3 || y1 - y0 + 1 < h / 3 { return None; }
    Some((copy_rect(b, x0, y0, x1 - x0 + 1, y1 - y0 + 1), y0))
}

/// ปลายเส้นของตัวซ้ายที่เลยรอยตัดไปทางขวา (แขนของ f ขีดของ t) ส่งกลับให้ครึ่งซ้าย · คืน None เมื่อไม่มีอะไรต้องย้าย · ตาม ReturnStrokeEnds
pub(crate) fn return_stroke_ends(whole: &Bmp, cut: i32, left: &Bmp, right: &mut Bmp) -> Option<Bmp> {
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

