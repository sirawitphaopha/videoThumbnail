//! แท็กตัวเอียง รวมช่วงตัวเอียง และเว้นวรรคของตัวเอียง
//! แยกจาก nocr_text/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- แท็กตัวเอียง

#[derive(Clone, Copy, PartialEq)]
enum Slant { Whitespace, Neutral, Tie, Italic, Upright }

pub(crate) struct Seg { pub(crate) text: String, pub(crate) italic: bool, ws: bool }

/// ประกอบข้อความพร้อมแท็กตัวเอียงทีละคำ · มีแต่ตัวอักษรกับตัวเลขที่ออกเสียง เครื่องหมายวรรคตอนหน้าตาเหมือนกันทั้งตัวตรงและตัวเอียง
/// คำที่ไม่มีตัวอักษรตามคำใกล้ที่สุดในบรรทัด คำที่เสมอกันตามคำรอบข้าง แล้วแก้ 0 กับ O · ตาม ItalicTextMerger.MergeWithItalicTags
pub fn merge_italic(hits: &[Hit]) -> String {
    if hits.is_empty() { return String::new(); }
    // จัดเป็นคำกับช่องว่างสลับกัน
    let mut words: Vec<(Vec<&Hit>, bool)> = vec![];
    let mut cur: Vec<&Hit> = vec![];
    let mut in_ws = false;
    for h in hits {
        let ws = h.text.chars().all(char::is_whitespace);
        if ws != in_ws {
            if !cur.is_empty() { words.push((std::mem::take(&mut cur), in_ws)); }
            in_ws = ws;
        }
        cur.push(h);
    }
    if !cur.is_empty() { words.push((cur, in_ws)); }

    let slants: Vec<Slant> = words.iter().map(|(c, ws)| slant(c, *ws)).collect();
    let mut italic: Vec<bool> = slants.iter().map(|s| *s == Slant::Italic).collect();
    for i in 0..words.len() {
        if slants[i] == Slant::Tie {
            italic[i] = find_italic(&words, &slants, &italic, i, -1, false, false).or_else(|| find_italic(&words, &slants, &italic, i, 1, false, false)).unwrap_or(false);
        }
    }
    for i in 0..words.len() {
        if slants[i] == Slant::Neutral {
            let d = if closing_punct(&words[i].0) { -1 } else { 1 };
            italic[i] = find_italic(&words, &slants, &italic, i, d, true, true).or_else(|| find_italic(&words, &slants, &italic, i, -d, true, true)).unwrap_or(false);
        }
    }
    let mut segs: Vec<Seg> = vec![];
    for (i, (chars, _)) in words.iter().enumerate() {
        let joined: String = chars.iter().map(|h| h.text.as_str()).collect();
        if slants[i] == Slant::Whitespace { segs.push(Seg { text: joined, italic: false, ws: true }); continue; }
        if !chars.iter().any(|h| has_italic_tag(&h.text)) { segs.push(Seg { text: joined, italic: italic[i], ws: false }); continue; }
        for h in chars {
            if has_italic_tag(&h.text) { tagged_runs(&mut segs, &h.text); } else { segs.push(Seg { text: h.text.clone(), italic: italic[i], ws: false }); }
        }
    }
    // ช่องว่างอยู่ในตัวเอียงเมื่อข้อความทั้งสองข้างเป็นตัวเอียง
    for i in 0..segs.len() {
        if segs[i].ws { segs[i].italic = i > 0 && i + 1 < segs.len() && segs[i - 1].italic && segs[i + 1].italic; }
    }
    let mut out = String::new();
    let mut on = false;
    for s in &segs {
        if s.italic && !on { out.push_str("<i>"); on = true; } else if !s.italic && on { out.push_str("</i>"); on = false; }
        out.push_str(&s.text);
    }
    if on { out.push_str("</i>"); }
    digit_letter_fix(&out)
}

fn has_italic_tag(t: &str) -> bool { let l = t.to_lowercase(); l.contains("<i>") || l.contains("</i>") }

/// ตัวที่สอนพร้อมแท็กในข้อความ ("<i>i</i>t") กำหนดตัวเอียงของตัวเอง · ตาม AddTaggedRuns
pub(crate) fn tagged_runs(segs: &mut Vec<Seg>, text: &str) {
    // หาแท็กบนข้อความเดิมแบบไม่สนตัวพิมพ์ทีละไบต์ (แท็กเป็น ASCII) · เดิมหาบนข้อความที่แปลงเป็นตัวเล็ก ตัวอย่าง İ ยาวขึ้นหนึ่งไบต์ ตำแหน่งเลื่อนแล้วตัดกลางตัวอักษรจนโปรแกรมพัง (ผู้ช่วยตรวจทาน T16)
    let b = text.as_bytes();
    let at = |i: usize, p: &[u8]| b.get(i..i + p.len()).is_some_and(|s| s.eq_ignore_ascii_case(p));
    let (mut on, mut start, mut i) = (false, 0usize, 0usize);
    while i < b.len() {
        let tag = if at(i, b"<i>") { 3 } else if at(i, b"</i>") { 4 } else { 0 };
        if tag == 0 { i += 1; continue; }
        if i > start { segs.push(Seg { text: text[start..i].into(), italic: on, ws: false }); }
        on = tag == 3;
        i += tag;
        start = i;
    }
    if start < b.len() { segs.push(Seg { text: text[start..].into(), italic: on, ws: false }); }
}

fn slant(chars: &[&Hit], ws: bool) -> Slant {
    if ws { return Slant::Whitespace; }
    let (mut it, mut up) = (0, 0);
    for h in chars {
        if !h.text.chars().any(is_letter_or_digit) || has_italic_tag(&h.text) { continue; }
        if h.italic { it += 1 } else { up += 1 }
    }
    if it == 0 && up == 0 { Slant::Neutral } else if it == up { Slant::Tie } else if it > up { Slant::Italic } else { Slant::Upright }
}

fn find_italic(words: &[(Vec<&Hit>, bool)], slants: &[Slant], italic: &[bool], idx: usize, dir: i64, ties: bool, stop_at_break: bool) -> Option<bool> {
    let mut i = idx as i64 + dir;
    while i >= 0 && (i as usize) < words.len() {
        let k = i as usize;
        match slants[k] {
            Slant::Whitespace => { if stop_at_break && words[k].0.iter().any(|h| h.text.contains('\n')) { return None; } }
            Slant::Italic | Slant::Upright => return Some(italic[k]),
            Slant::Tie if ties => return Some(italic[k]),
            _ => {}
        }
        i += dir;
    }
    None
}

fn closing_punct(chars: &[&Hit]) -> bool {
    let mut any = false;
    for h in chars { for c in h.text.chars() { if !".,:;!?…)]}".contains(c) { return false; } any = true; } }
    any
}

// ---------------------------------------------------------------- เว้นวรรคในตัวเอียง

/// ตัวเอียงเอนข้ามช่องเว้นคำ ตัวแยกที่ตัดตามแนวตั้งจึงนับช่องขาด · วัดช่องระหว่างตัวที่จับคู่แล้วตามแนวเอียง แล้วใส่เว้นวรรคที่ขาด
/// ผู้เรียกเก็บผลนี้เมื่อได้คำที่ไม่รู้จักน้อยกว่าเท่านั้น (Subtitle Edit ใช้ค่าเอียง 0.33) · ตาม ItalicSpaceFixer.GetTextWithMoreSpacesInItalic
pub fn more_italic_spaces(hits: &[Hit], list: &[Piece], parent: &Bmp, factor: f64, px: i32) -> String { more_italic_spaces_with(hits, list, parent, factor, px, true) }

/// cap เป็นเท็จสำหรับ Binary OCR ที่ Subtitle Edit ใช้เกณฑ์จุดเว้นวรรคตามที่ตั้งตรง ๆ ไม่จำกัดด้วยความสูงตัว (รุ่น CompareMatch ของ GetTextWithMoreSpacesInItalic)
pub fn more_italic_spaces_with(hits: &[Hit], list: &[Piece], parent: &Bmp, factor: f64, px: i32, cap: bool) -> String {
    let mut hits = hits.to_vec();
    let px = if cap { italic_space_threshold(list, px) } else { px };
    let mut could = vec![false; list.len()];
    for i in 0..hits.len().saturating_sub(1) {
        let (m, n) = (&hits[i], &hits[i + 1]);
        if !m.italic || n.text == "," || m.text.trim().is_empty() || n.text.trim().is_empty() { continue; }
        let (Some(mi), Some(ni)) = (m.piece, n.piece) else { continue };
        let mut blank = angled_blank_columns(parent, &list[mi], &list[ni], factor);
        if m.text == "f" || m.text == "," || n.text.starts_with('y') || n.text.starts_with('j') { blank += 1; }
        if blank >= px { could[ni] = true; }
    }
    let mut j = 1;
    while j < hits.len() {
        if let Some(p) = hits[j].piece.filter(|&p| could[p]) {
            could[p] = false;
            if hits[j - 1].italic { hits.insert(j, Hit::text(" ", None)); j += 1; }
        }
        j += 1;
    }
    merge_italic(&hits).trim().to_string()
}

/// กล่องเอียงของบรรทัดตัวเอียงซ้อนกัน ตัวตรวจเว้นวรรคจึงเห็นช่องน้อยจนเกณฑ์ออกมาเท่าสองช่อง · จำกัดไม่เกิน 0.22 ของตัวที่สูงที่สุด · ตาม GetItalicSpaceThreshold
fn italic_space_threshold(list: &[Piece], px: i32) -> i32 {
    let max_h = list.iter().filter_map(|p| p.bmp.as_ref()).map(|b| b.height() as i32).max().unwrap_or(0);
    if max_h == 0 { px } else { px.min(2.max(round_away(max_h as f64 * 0.22))) }
}

/// นับคอลัมน์เอียงที่ใสทั้งเส้นจากขวาของชิ้นแรกไปกลางชิ้นถัดไป เจอหมึกหลังนับได้แล้วหยุด · ตาม IsVerticalAngledLineTransparent
fn angled_blank_columns(parent: &Bmp, m: &Piece, n: &Piece, factor: f64) -> i32 {
    let (Some(mb), Some(nb)) = (&m.bmp, &n.bmp) else { return 0 };
    let (pw, ph) = (parent.width() as i32, parent.height() as i32);
    let mut blanks = 0;
    for sx in m.x + mb.width() as i32..n.x + nb.width() as i32 / 2 {
        let mut blank = true;
        for y in m.y..m.y + mb.height() as i32 {
            let x = sx as f64 - (y - m.y) as f64 * factor;
            if x >= 0.0 && x < pw as f64 && y < ph {
                // ปัดแบบ Math.Round (เลขคู่) · ปัดได้เท่าความกว้างอ่านจุดแรกของแถวถัดไปแบบดัชนีเรียง
                let rx = x.round_ties_even() as i32;
                let i = y * pw + rx;
                let a = if i >= 0 && i < pw * ph { parent.get_pixel((i % pw) as u32, (i / pw) as u32)[3] } else { 0 };
                if a != 0 { blank = false; if blanks > 0 { return blanks; } }
            }
        }
        if blank { blanks += 1; }
    }
    blanks
}
