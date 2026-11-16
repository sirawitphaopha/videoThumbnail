//! ตัวอ่านภาพของ nOCR (แผน OCR ขั้น 5 · BUGS ข้อ 143) ประกอบชิ้นตัวอักษรที่จับคู่แล้วเป็นข้อความ
//! ตัดสินเว้นวรรคจากระยะห่างเทียบความสูงบรรทัด ใส่แท็กตัวเอียงทีละคำ แก้ตัวพิมพ์ใหญ่เล็กจากความสูง แก้ 0 กับ O จากตัวข้าง ๆ
//! ตัวอ่านทีละภาพหยุดคืนชิ้นที่ฐานไม่รู้จักให้หน้าต่างสอนตัวอักษรได้ แบบ RunNOcrLoop ของ Subtitle Edit
//!
//! แปลจาก src/libuilogic/Ocr/NOcrSpaceDetector.cs ItalicTextMerger.cs OcrDigitLetterFixer.cs NOcrCaseFixer.cs ItalicSpaceFixer.cs
//! OcrLineHeightTracker.cs ImageBaselineFinder.cs NikseBitmap2.CropTop กับขั้นอ่านใน src/seconv/Core/NOcrOcrEngine.cs และ
//! src/ui/Features/Ocr/OcrViewModel.cs (RunNOcrLoop SplitNOcrLetters) ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

use crate::nocr::{Bmp, NOcrDb, Piece};
use crate::nocr_split::split_letters;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

fn round_away(v: f64) -> i32 { if v >= 0.0 { (v + 0.5).floor() as i32 } else { -((-v + 0.5).floor() as i32) } }

fn is_space(p: &Piece) -> bool { p.bmp.is_none() && p.special.as_deref() == Some(" ") }

#[inline]
fn alpha(b: &Bmp, x: i32, y: i32) -> u8 { if x < 0 || y < 0 || x >= b.width() as i32 || y >= b.height() as i32 { 0 } else { b.get_pixel(x as u32, y as u32)[3] } }

/// ตัวเลขฐานสิบทุกระบบที่พบบ่อย แทน char.IsDigit ของ .NET (Unicode Nd)
pub fn is_digit(c: char) -> bool {
    c.is_ascii_digit()
        || ('\u{0660}'..='\u{0669}').contains(&c)
        || ('\u{06F0}'..='\u{06F9}').contains(&c)
        || ('\u{0966}'..='\u{096F}').contains(&c)
        || ('\u{0E50}'..='\u{0E59}').contains(&c)
        || ('\u{FF10}'..='\u{FF19}').contains(&c)
}
fn is_letter(c: char) -> bool { c.is_alphabetic() && !is_digit(c) }
fn is_letter_or_digit(c: char) -> bool { is_letter(c) || is_digit(c) }

// ---------------------------------------------------------------- ผลจับคู่หนึ่งชิ้น

/// ตัวอักษรหนึ่งชิ้นที่อ่านได้ ชี้กลับไปที่ชิ้นในภาพ (เว้นวรรคที่ใส่เพิ่มไม่มีชิ้น) · ตาม NOcrChar ที่ผูก ImageSplitterItem
#[derive(Debug, Clone, Default)]
pub struct Hit {
    pub text: String,
    pub italic: bool,
    pub expand_count: i32,
    /// ลำดับชิ้นในรายการชิ้นของบรรทัด
    pub piece: Option<usize>,
    /// ระยะบนกับความสูงของตัวในฐานที่จับคู่ได้ ตัวแก้ตัวพิมพ์ซีริลลิกใช้
    pub margin_top: i32,
    pub height: i32,
}

impl Hit {
    pub fn text(t: &str, piece: Option<usize>) -> Self { Hit { text: t.into(), piece, ..Default::default() } }
}

// ---------------------------------------------------------------- เว้นวรรค

const SPLIT_PIXELS_ARE_SPACE: i32 = 1;
const DEFAULT_RELATIVE_THRESHOLD: f64 = 0.22;
const MIN_JUMP_RATIO: f64 = 1.5;
const MIN_JUMP_SIZE: f64 = 0.08;
const MIN_SPACE: f64 = 0.18;
const MAX_LETTER_GAP: f64 = 0.5;
const MAX_HISTORY: usize = 100;
const BODY_GAP_WEIGHT: f64 = 0.25;
const WIDE_BODY_GAP_WEIGHT: f64 = 0.5;
const WIDE_BOX_GAP_SHARE: f64 = 0.6;
const MIN_OVERHANG_SHARE: f64 = 0.1;

/// ตัดสินว่าช่องไหนเป็นเว้นวรรคจริง เทียบกับความสูงของตัวอักษร ไม่ใช้จำนวนจุดตายตัว
/// ซับ DVD เว้นคำราว 7–9 จุด ส่วนซับ Blu-ray ตัวใหญ่ห่างตัวช่องระหว่างตัวอักษรก็ 12 จุดแล้ว · วัดจากซับจริง ช่องระหว่างตัวไม่เกินราว 0.19 ของความสูงบรรทัด
/// เว้นคำเริ่มราว 0.22 จึงหาเกณฑ์ทีละภาพจากช่วงกระโดดที่ใหญ่ที่สุดของช่องที่เรียงแล้ว ภาพคำเดียวใช้ค่ากลางของภาพก่อน ๆ · ตาม NOcrSpaceDetector
#[derive(Default)]
pub struct SpaceDetector { history: Mutex<Vec<f64>> }

impl SpaceDetector {
    /// เอาชิ้นเว้นวรรคที่เป็นแค่ช่องระหว่างตัวอักษรออก · คืนรายการใหม่กับเกณฑ์เป็นจุดของบรรทัดแรก (ไม่มีบรรทัดได้ 12) · ตาม RemoveFalseSpaces
    pub fn remove_false_spaces(&self, letters: Vec<Piece>) -> (Vec<Piece>, i32) {
        let lines = get_lines(&letters);
        let rel = self.find_relative_threshold(&letters, &lines);
        let mut keep = vec![false; letters.len()];
        let mut px = -1;
        for &(start, end, height) in &lines {
            let threshold = 2.max(round_away(height as f64 * rel));
            if px < 0 && height > 0 { px = threshold; }
            let gaps = effective_gaps(&letters, start, end, height, threshold);
            for i in start..end { keep[i] = !(is_space(&letters[i]) && gaps[i - start] < threshold as f64); }
            if end < letters.len() { keep[end] = true; }
        }
        if px < 0 { px = 12; }
        (letters.into_iter().zip(keep).filter(|(_, k)| *k).map(|(p, _)| p).collect(), px)
    }

    fn find_relative_threshold(&self, letters: &[Piece], lines: &[(usize, usize, i32)]) -> f64 {
        let mut gaps = vec![];
        for &(start, end, height) in lines {
            if height <= 0 { continue; }
            for p in &letters[start..end] { if is_space(p) { gaps.push(p.space_pixels as f64 / height as f64); } }
        }
        gaps.sort_by(|a, b| a.total_cmp(b));
        let (mut best_ratio, mut best) = (0.0, -1.0);
        for w in gaps.windows(2) {
            let (low, high) = (w[0], w[1]);
            if high < MIN_SPACE || low > MAX_LETTER_GAP || high - low < MIN_JUMP_SIZE { continue; }
            let ratio = high / low.max(0.02);
            if ratio > best_ratio { best_ratio = ratio; best = (low + high) / 2.0; }
        }
        let mut h = self.history.lock().unwrap();
        if best_ratio >= MIN_JUMP_RATIO {
            if h.len() >= MAX_HISTORY { h.remove(0); }
            h.push(best);
            return best;
        }
        if !h.is_empty() {
            let mut s = h.clone();
            s.sort_by(|a, b| a.total_cmp(b));
            return s[s.len() / 2];
        }
        DEFAULT_RELATIVE_THRESHOLD
    }
}

/// ช่วงชิ้นของแต่ละบรรทัด (ไม่รวมชิ้นขึ้นบรรทัดใหม่) กับความสูงหมึกของบรรทัด · ตาม GetLines
fn get_lines(letters: &[Piece]) -> Vec<(usize, usize, i32)> {
    let mut lines = vec![];
    let mut start = 0;
    loop {
        let (mut end, mut top, mut bottom) = (start, i32::MAX, i32::MIN);
        while end < letters.len() && !letters[end].is_newline() {
            if let Some(b) = &letters[end].bmp { top = top.min(letters[end].top); bottom = bottom.max(letters[end].top + b.height() as i32); }
            end += 1;
        }
        lines.push((start, end, if bottom > top { bottom - top } else { 0 }));
        if end >= letters.len() { break; }
        start = end + 1;
    }
    lines
}

/// ความกว้างช่องของบรรทัดหนึ่ง บวกส่วนหนึ่งของที่ว่างระหว่างเนื้อตัวอักษรสองข้าง · หาง y j ขอ f คาน T ยื่นเข้าไปในช่อง กรอบจึงบอกช่องแคบกว่าจริง
/// นับหนึ่งในสี่ ตัวที่จิกกันในคำ (To Ty) จึงยังเป็นช่องระหว่างตัว · กรอบห่างเกินครึ่งเกณฑ์แล้วและมีตัวยื่นจริง นับครึ่ง · ตาม GetEffectiveGaps
fn effective_gaps(letters: &[Piece], start: usize, end: usize, height: i32, threshold: i32) -> Vec<f64> {
    let mut gaps = vec![0.0; end - start];
    for i in start..end {
        let item = &letters[i];
        if !is_space(item) { continue; }
        gaps[i - start] = item.space_pixels as f64;
        let mut before = i as i64 - 1;
        while before >= start as i64 && letters[before as usize].bmp.is_none() { before -= 1; }
        let mut after = i + 1;
        while after < end && letters[after].bmp.is_none() { after += 1; }
        if before < start as i64 || after >= end { continue; }
        let (l, r) = (&letters[before as usize], &letters[after]);
        let (lb, rb) = (l.bmp.as_ref().unwrap(), r.bmp.as_ref().unwrap());
        if !letter_sized(lb, height) || !letter_sized(rb, height) { continue; }
        let body = body_gap(l, r);
        if body > item.space_pixels {
            let mut w = BODY_GAP_WEIGHT;
            if item.space_pixels as f64 >= threshold as f64 * WIDE_BOX_GAP_SHARE
                && (right_overhang(lb) + left_overhang(rb)) as f64 >= 2f64.max(height as f64 * MIN_OVERHANG_SHARE)
            { w = WIDE_BODY_GAP_WEIGHT; }
            gaps[i - start] = item.space_pixels as f64 + w * (body - item.space_pixels) as f64;
        }
    }
    gaps
}

/// กรอบยื่นขวาเลยหมึกในครึ่งล่างเท่าไร (แขน f r t คาน T ปากบนของ V W) · ตาม RightOverhang
fn right_overhang(b: &Bmp) -> i32 {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let mut right = -1;
    for y in h / 2..h {
        let mut x = w - 1;
        while x > right { if alpha(b, x, y) > 150 { right = x; break; } x -= 1; }
    }
    if right < 0 { 0 } else { w - 1 - right }
}

/// กรอบยื่นซ้ายเลยหมึกในครึ่งบนเท่าไร (ขอของ j J ใต้ก้าน) · ตาม LeftOverhang
fn left_overhang(b: &Bmp) -> i32 {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let mut left = i32::MAX;
    for y in 0..h / 2 {
        let mut x = 0;
        while x < left && x < w { if alpha(b, x, y) > 150 { left = x; break; } x += 1; }
    }
    if left == i32::MAX { 0 } else { left }
}

/// สูงอย่างน้อย 45% ของบรรทัดและมีหมึกอย่างน้อยสามในสี่ของแถว · ตาม IsLetterSized
fn letter_sized(b: &Bmp, line_h: i32) -> bool {
    let h = b.height() as i32;
    if h * 100 < line_h * 45 { return false; }
    let ink = (0..h).filter(|&y| (0..b.width() as i32).any(|x| alpha(b, x, y) > 150)).count() as i32;
    ink * 4 >= h * 3
}

/// ระยะแนวนอนที่ใกล้ที่สุดระหว่างหมึกของสองชิ้นในแถวที่มีหมึกทั้งคู่ ไม่มีแถวร่วมได้ −1 · ตาม BodyGap
fn body_gap(l: &Piece, r: &Piece) -> i32 {
    let (a, b) = (l.bmp.as_ref().unwrap(), r.bmp.as_ref().unwrap());
    let top = l.top.max(r.top);
    let bottom = (l.top + a.height() as i32).min(r.top + b.height() as i32);
    let mut best = i32::MAX;
    for y in top..bottom {
        let edge = (0..a.width() as i32).rev().find(|&x| alpha(a, x, y - l.top) > 150).map(|x| l.x + x);
        let Some(edge) = edge else { continue };
        if let Some(x) = (0..b.width() as i32).find(|&x| alpha(b, x, y - r.top) > 150) { best = best.min(r.x + x - edge - 1); }
    }
    if best == i32::MAX { -1 } else { best }
}

/// เอาเว้นวรรคในตัวเลขออก · เลข 1 ผอมเหลือที่ว่างสองข้าง ช่องข้าง 1 จึงเกินเกณฑ์ทั้งที่ตัวเลขอื่นในจำนวนเดียวกันไม่เกิน ("1 5" "1 940")
/// ระหว่างตัวเลขสองตัว และจาก 1 ตัวตรงไปจุด จุลภาค ทวิภาค ยอมถึงสองเท่าของเกณฑ์ · จาก 1 ไปอย่างอื่นยอมเกินนิดเดียว · ตาม RemoveFalseSpacesInNumbers
pub fn remove_false_spaces_in_numbers(hits: &mut Vec<Hit>, list: &[Piece], px: i32) {
    let mut del = vec![];
    for i in 0..hits.len().saturating_sub(1) {
        let m = &hits[i];
        if !m.text.chars().last().is_some_and(is_digit) { continue; }
        let Some(space) = hits[i + 1].piece.and_then(|k| list.get(k)) else { continue };
        if !is_space(space) { continue; }
        let ends_one = m.text.ends_with('1');
        let next = hits.get(i + 2).and_then(|h| h.text.chars().next()).unwrap_or('\0');
        let limit = if is_digit(next) && (ends_one || next == '1') { px * 2 }
            else if m.italic || !ends_one { continue }
            else if matches!(next, '.' | ',' | ':') { px * 2 }
            else { px + 1.max(round_away(px as f64 * 0.3)) };
        if space.space_pixels < limit { del.push(i + 1); }
    }
    for k in del.into_iter().rev() { hits.remove(k); }
}

// ---------------------------------------------------------------- แท็กตัวเอียง

#[derive(Clone, Copy, PartialEq)]
enum Slant { Whitespace, Neutral, Tie, Italic, Upright }

struct Seg { text: String, italic: bool, ws: bool }

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
fn tagged_runs(segs: &mut Vec<Seg>, text: &str) {
    let lower = text.to_lowercase();
    let (lb, b) = (lower.as_bytes(), text.as_bytes());
    let (mut on, mut start, mut i) = (false, 0usize, 0usize);
    while i < b.len() {
        let tag = if lb[i..].starts_with(b"<i>") { 3 } else if lb[i..].starts_with(b"</i>") { 4 } else { 0 };
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

// ---------------------------------------------------------------- 0 กับ O

const DIGIT_LOOKALIKES: &str = "ЗзOoIlSsBbZzбg";

/// 0 กับ O เป็นวงเดียวกันในฟอนต์ซับส่วนใหญ่ ตัวข้าง ๆ เป็นคนตัดสิน · ตัวเลขติดกันเป็นจำนวน ("5O" เป็น "50" "1O:3O" เป็น "10:30")
/// 0 ในคำที่เป็นตัวอักษรเป็นตัว o ("0f" เป็น "of") · เปอร์เซ็นต์ที่แยกเป็นวง ทับ วง ("7o/o" เป็น "7%") · ตาม OcrDigitLetterFixer.Fix
pub fn digit_letter_fix(text: &str) -> String {
    let mut t = text.to_string();
    if t.contains('/') { t = split_percent(&t); }
    if t.contains('O') { t = number_like_runs(&t); }
    if t.contains('0') { t = words_with_zero(&t); }
    t
}

/// (?<=\d) ?[oO0]/[oO0](?![\p{L}\d]) แทนด้วย %
fn split_percent(t: &str) -> String {
    let c: Vec<char> = t.chars().collect();
    let ring = |x: char| matches!(x, 'o' | 'O' | '0');
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if i > 0 && is_digit(c[i - 1]) {
            let s = if c[i] == ' ' { i + 1 } else { i };
            if s + 3 <= c.len() && ring(c[s]) && c[s + 1] == '/' && ring(c[s + 2]) && !c.get(s + 3).is_some_and(|&x| is_letter_or_digit(x)) {
                out.push('%');
                i = s + 3;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// (?<![\p{L}\d])[\dO]+(?:[.,:][\dO]+)*(?![\p{L}\d]) ที่มีทั้ง O และตัวเลข เปลี่ยน O เป็น 0
fn number_like_runs(t: &str) -> String {
    let c: Vec<char> = t.chars().collect();
    let run = |x: char| is_digit(x) || x == 'O';
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if run(c[i]) && !(i > 0 && is_letter_or_digit(c[i - 1])) {
            let mut j = i;
            while j < c.len() && run(c[j]) { j += 1; }
            // ปลายที่เป็นไปได้ หลังกลุ่มแรก แล้วหลังทุกกลุ่ม [.,:][\dO]+ ที่ตามมา · regex ถอยไปปลายที่ยาวที่สุดที่ตัวถัดไปไม่ใช่ตัวอักษรหรือตัวเลข
            let mut ends = vec![j];
            let mut k = j;
            while k + 1 < c.len() && matches!(c[k], '.' | ',' | ':') && run(c[k + 1]) {
                k += 1;
                while k < c.len() && run(c[k]) { k += 1; }
                ends.push(k);
            }
            if let Some(&e) = ends.iter().rev().find(|&&e| !c.get(e).is_some_and(|&x| is_letter_or_digit(x))) {
                let m: String = c[i..e].iter().collect();
                if m.contains('O') && m.chars().any(is_digit) { out.push_str(&m.replace('O', "0")); } else { out.push_str(&m); }
                i = e;
                continue;
            }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// (?<![\p{L}\d])[\p{L}0]*0[\p{L}0]*(?![\p{L}\d]) คำของตัวอักษรที่มี 0 ปน เปลี่ยน 0 เป็น o หรือ O
fn words_with_zero(t: &str) -> String {
    let c: Vec<char> = t.chars().collect();
    let part = |x: char| is_letter(x) || x == '0';
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if part(c[i]) && !(i > 0 && is_letter_or_digit(c[i - 1])) {
            let mut j = i;
            while j < c.len() && part(c[j]) { j += 1; }
            let word = &c[i..j];
            if word.contains(&'0') && !c.get(j).is_some_and(|&x| is_letter_or_digit(x)) {
                let letters: Vec<char> = word.iter().copied().filter(|&x| is_letter(x)).collect();
                let zeros = word.iter().filter(|&&x| x == '0').count();
                if letters.is_empty() || (zeros > letters.len() && letters.iter().all(|&x| DIGIT_LOOKALIKES.contains(x))) {
                    out.extend(word);
                } else {
                    let upper = letters.len() > 1 && letters.iter().all(|x| x.is_uppercase());
                    let before: String = c[..i].iter().collect();
                    for (k, &x) in word.iter().enumerate() {
                        if x != '0' { out.push(x); continue; }
                        let cap = upper || (k == 0 && letters.len() == 1 && letters[0].is_uppercase()) || (k == 0 && sentence_start_before(&before));
                        out.push(if cap { 'O' } else { 'o' });
                    }
                }
                i = j;
                continue;
            }
            out.extend(&c[i..j]);
            i = j;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// (?:^|[.!?])[\s\-–—"'“‘]*(?:<[^>]+>[\s\-–—"'“‘]*)*$ · ข้อความก่อนหน้าจบประโยค หรือว่าง ไม่นับช่องว่าง ขีด เครื่องหมายคำพูด แท็ก
fn sentence_start_before(s: &str) -> bool {
    let mut c: Vec<char> = s.chars().collect();
    let q = |x: char| x.is_whitespace() || "-–—\"'“‘".contains(x);
    loop {
        match c.last() {
            Some(&x) if q(x) => { c.pop(); }
            Some('>') => {
                let lt = c.iter().rposition(|&x| x == '<');
                match lt { Some(p) if p + 1 < c.len() - 1 && !c[p + 1..c.len() - 1].contains(&'>') => c.truncate(p), _ => break }
            }
            _ => break,
        }
    }
    c.last().is_none_or(|&x| matches!(x, '.' | '!' | '?'))
}

// ---------------------------------------------------------------- ตัวพิมพ์ใหญ่เล็ก

/// ซีริลลิกที่ตัวเล็กเป็นตัวใหญ่ย่อส่วนในฟอนต์ซับทั่วไป คู่ตัวเล็กกับตัวใหญ่ · ตาม NOcrCaseFixer.CyrillicCaseTwins
pub const CYRILLIC_CASE_TWINS: &str = "вВгГдДжЖзЗиИкКлЛмМнНоОпПсСтТуУхХцЦчЧшШщЩъЪыЫьЬэЭюЮяЯєЄѕЅљЉњЊџЏ";
const UPPER_LIKE_LOWER: &[&str] = &["V", "W", "U", "S", "Z", "O", "X", "Ø", "C"];
const LOWER_LIKE_UPPER: &[&str] = &["v", "w", "u", "s", "z", "o", "x", "ø", "c"];
const UPPER_ACCENT: &[&str] = &["Č", "Š", "Ž", "Ś", "Ż", "Ö", "Ü", "Ú", "Ï", "Í", "Ç", "Ì", "Ò", "Ù", "Ó", "Й"];
const LOWER_ACCENT: &[&str] = &["č", "š", "ž", "ś", "ż", "ö", "ü", "ú", "ï", "í", "ç", "ì", "ò", "ù", "ó", "й"];

/// แก้ตัวพิมพ์ใหญ่เล็กของตัวที่หน้าตาเหมือนกันทั้งสองแบบ (ไม่รวม I กับ l) จากความสูงเทียบตัวอ้างอิงที่เห็นมาแล้วในงานเดียวกัน · ตาม NOcrCaseFixer
#[derive(Default)]
pub struct CaseFixer { lo_total: i64, lo_n: i32, up_total: i64, up_n: i32, x_total: i64, x_n: i32, cap_total: i64, cap_n: i32 }

impl CaseFixer {
    pub fn fix(&mut self, item: &Piece, r: &Hit) -> String {
        let Some(bmp) = &item.bmp else { return r.text.clone() };
        let h = bmp.height() as i64;
        let t = r.text.as_str();
        // p กับ P หน้าตาเดียวกัน มีแต่ p ที่ห้อยใต้เส้นฐาน
        if matches!(t, "p" | "P") { if let Some(base) = item.baseline {
            let descent = item.top + h as i32 - base;
            return if descent > 2.max(base / 10) { "p".into() } else { "P".into() };
        } }
        let lower_ref = matches!(t, "e" | "a" | "d" | "t" | "а" | "е");
        let upper_ref = matches!(t, "E" | "H" | "R" | "D" | "T" | "M" | "Б" | "Е" | "Р" | "А");
        if lower_ref {
            self.lo_n += 1; self.lo_total += h;
            if self.up_n < 3 { self.up_n += 1; self.up_total += h + 10; }
        }
        if upper_ref {
            self.up_n += 1; self.up_total += h;
            if self.lo_n < 3 && h > 20 { self.lo_n += 1; self.lo_total += h - 10; }
        }
        if matches!(t, "e" | "a" | "а" | "е") { self.x_total += item.height_above_baseline() as i64; self.x_n += 1; }
        else if upper_ref { self.cap_total += item.height_above_baseline() as i64; self.cap_n += 1; }

        if !t.is_empty() && t.chars().all(|c| CYRILLIC_CASE_TWINS.contains(c)) && (t.chars().all(char::is_lowercase) || t.chars().all(char::is_uppercase)) {
            return self.cyrillic(item, r);
        }
        if self.lo_n <= 2 || self.up_n <= 2 { return r.text.clone(); }
        let (avg_lo, avg_up) = (self.lo_total / self.lo_n as i64, self.up_total / self.up_n as i64);
        if UPPER_LIKE_LOWER.contains(&t) { return if (avg_lo - h).abs() < (avg_up - h).abs() { t.to_lowercase() } else { r.text.clone() }; }
        if LOWER_LIKE_UPPER.contains(&t) { return if (avg_lo - h).abs() > (avg_up - h).abs() { t.to_uppercase() } else { r.text.clone() }; }
        let accent_up = UPPER_ACCENT.contains(&t);
        let accent_lo = LOWER_ACCENT.contains(&t);
        if accent_up || accent_lo { if let Some(s) = self.accent_from_baseline(item, t) { return s; } }
        let avg_up_f = self.up_total as f64 / self.up_n as f64;
        if accent_up { return if (h as f64) < avg_up_f + 3.0 { t.to_lowercase() } else { r.text.clone() }; }
        if accent_lo && h as f64 > avg_up_f + 4.0 { return t.to_uppercase(); }
        r.text.clone()
    }

    /// สระบนตัวใหญ่สูงเลยความสูงตัวใหญ่ไปมาก สระบนตัวเล็กสูงราวตัวใหญ่ · เครื่องหมายใต้ตัว (เซดิลลา) ดูตัวเนื้อว่าใกล้ความสูงตัวเล็กหรือตัวใหญ่ · ตาม FixAccentedCaseFromBaseline
    fn accent_from_baseline(&self, item: &Piece, t: &str) -> Option<String> {
        if self.cap_n <= 2 || self.x_n <= 2 || item.baseline.is_none() { return None; }
        let cap = self.cap_total as f64 / self.cap_n as f64;
        let x = self.x_total as f64 / self.x_n as f64;
        let h = item.height_above_baseline() as f64;
        let below = matches!(t, "Ç" | "ç");
        let upper = if below { (h - cap).abs() < (h - x).abs() } else { h > cap * 1.18 };
        Some(if upper { t.to_uppercase() } else { t.to_lowercase() })
    }

    /// ซีริลลิกคู่แฝด เลือกตัวเล็กหรือใหญ่จากความสูงเหนือเส้นฐานเทียบตัวอ้างอิง · ตัวเล็กที่สอนไว้สูงเท่าตัวใหญ่ (д แบบ ∂) คงตัวเล็ก · ตาม FixCyrillicCase
    fn cyrillic(&self, item: &Piece, r: &Hit) -> String {
        let t = &r.text;
        if self.x_n <= 2 || self.cap_n <= 2 || (t.chars().next().is_some_and(char::is_lowercase) && r.margin_top * 10 <= r.height) { return t.clone(); }
        let x = self.x_total as f64 / self.x_n as f64;
        let cap = self.cap_total as f64 / self.cap_n as f64;
        let h = item.height_above_baseline() as f64;
        if (h - x).abs() < (h - cap).abs() { t.to_lowercase() } else { t.to_uppercase() }
    }
}

// ---------------------------------------------------------------- เว้นวรรคในตัวเอียง

/// ตัวเอียงเอนข้ามช่องเว้นคำ ตัวแยกที่ตัดตามแนวตั้งจึงนับช่องขาด · วัดช่องระหว่างตัวที่จับคู่แล้วตามแนวเอียง แล้วใส่เว้นวรรคที่ขาด
/// ผู้เรียกเก็บผลนี้เมื่อได้คำที่ไม่รู้จักน้อยกว่าเท่านั้น (Subtitle Edit ใช้ค่าเอียง 0.33) · ตาม ItalicSpaceFixer.GetTextWithMoreSpacesInItalic
pub fn more_italic_spaces(hits: &[Hit], list: &[Piece], parent: &Bmp, factor: f64, px: i32) -> String {
    let mut hits = hits.to_vec();
    let px = italic_space_threshold(list, px);
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

// ---------------------------------------------------------------- ความสูงบรรทัด

/// จำความสูงเฉลี่ยของตัวอักษรตลอดงาน ให้ตัวแบ่งบรรทัดได้ความสูงขั้นต่ำที่ปรับตามซับ · ค่าตายตัวใหญ่ไปสำหรับ DVD (สองบรรทัดรวมเป็นหนึ่ง)
/// และเล็กไปสำหรับ 4K (แถบสระบนแยกเป็นบรรทัดปลอม) · ตาม OcrLineHeightTracker
pub struct LineHeightTracker { sum: Mutex<(i64, i32)>, pub fallback_min: i32 }

impl Default for LineHeightTracker { fn default() -> Self { LineHeightTracker { sum: Mutex::new((0, 0)), fallback_min: 12 } } }

impl LineHeightTracker {
    const MAX_SAMPLES: i32 = 1000;
    pub fn update(&self, letters: &[Piece]) {
        let mut s = self.sum.lock().unwrap();
        if s.1 >= Self::MAX_SAMPLES { return; }
        for p in letters { if let Some(b) = &p.bmp { s.0 += b.height() as i64; s.1 += 1; } }
    }
    pub fn min_line_height(&self) -> i32 {
        let s = self.sum.lock().unwrap();
        if s.1 > 20 { (s.0 as f64 / s.1 as f64 * 0.9).round_ties_even() as i32 } else { self.fallback_min }
    }
    /// ความสูงเฉลี่ย ยังเห็นไม่พอได้ −1
    pub fn average(&self) -> f64 { let s = self.sum.lock().unwrap(); if s.1 > 20 { s.0 as f64 / s.1 as f64 } else { -1.0 } }
}

// ---------------------------------------------------------------- เส้นฐาน

/// บรรทัดสุดท้ายของภาพห้อยใต้เส้นฐานกี่จุด ไม่มีหางหรือบอกไม่ได้ได้ 0 · ใช้วางซับแบบชิดล่างตามเส้นฐาน "abc" กับ "jabc" จะได้อยู่ระดับเดียวกัน
/// ใช้ตัวแยกตัวอักษรของ nOCR ไม่ต้องมีฐาน · min_h 25 สำหรับภาพขนาด Blu-ray ที่เหลือ 12 · ตาม ImageBaselineFinder.GetDescent
pub fn baseline_descent(img: &Bmp, min_h: i32) -> i32 {
    if img.width() == 0 || img.height() == 0 { return 0; }
    let mut d = descent_at(img, 200, min_h);
    if d < 0 { d = descent_at(img, 0, min_h); }
    d.max(0)
}

fn descent_at(img: &Bmp, min_rgb: u32, min_h: i32) -> i32 {
    let two = crate::ocrprep::make_two_color(img, min_rgb);
    let letters = split_letters(&two, 1, false, true, min_h, true, -1.0);
    let Some(last) = letters.iter().rposition(|p| p.bmp.is_some()) else { return -1 };
    let start = letters[..=last].iter().rposition(|p| p.is_newline()).map_or(0, |k| k + 1);
    let glyphs: Vec<(i32, i32, i32)> = letters[start..].iter().filter_map(|p| p.bmp.as_ref().map(|b| (p.top, p.top + b.height() as i32, b.height() as i32))).collect();
    let max_h = glyphs.iter().map(|g| g.2).max().unwrap_or(0);
    let bottoms: Vec<i32> = glyphs.iter().filter(|g| g.2 * 100 >= max_h * 45).map(|g| g.1).collect();
    if bottoms.is_empty() { return 0; }
    // ตัวที่ไม่มีหางนั่งบนเส้นฐาน ขอบล่างที่สูงที่สุดของตัวอักษรจึงเป็นเส้นฐาน แม้บรรทัดที่ห้อยเกือบทั้งบรรทัด ("gypsy")
    let base = *bottoms.iter().min().unwrap();
    let bottom = glyphs.iter().map(|g| g.1).max().unwrap();
    let top = glyphs.iter().map(|g| g.0).min().unwrap();
    let d = bottom - base;
    if d as f64 > (bottom - top) as f64 * 0.35 { 0 } else { d }
}

/// ตัดแถวใสด้านบนออก คืนภาพกับจำนวนแถวที่ตัด · ตาม NikseBitmap2.CropTop(0, ใส)
pub fn crop_top(b: &Bmp) -> (Bmp, i32) {
    let top = (0..b.height()).find(|&y| (0..b.width()).any(|x| b.get_pixel(x, y)[3] != 0)).unwrap_or(0);
    if top == 0 { return (b.clone(), 0); }
    (image::imageops::crop_imm(b, 0, top, b.width(), b.height() - top).to_image(), top as i32)
}

// ---------------------------------------------------------------- ตัวอ่านทีละภาพ

/// ค่าที่ใช้อ่าน · ค่าตั้งต้นตาม Subtitle Edit
#[derive(Clone)]
pub struct ReadOpts {
    /// จุดผิดที่ยอม (หน้าจอเลือก ค่าตั้งต้น 25 ของ SeConv)
    pub max_wrong: i32,
    /// ค่าเอียงที่ใช้บิดตั้งตรงตอนจับคู่ไม่ได้ (0.2 ของ Subtitle Edit) · 0 ไม่ลอง
    pub italic: f64,
    /// จุดที่นับเป็นเว้นวรรค 0 ให้ตัดสินเองตามความสูงตัว
    pub space_px: i32,
    /// ทางสุดท้ายเดาตัวที่ใกล้ที่สุด (SeConv เปิด หน้าจอของ Subtitle Edit ปิด)
    pub last_ditch: bool,
    /// เจอชิ้นที่ฐานไม่รู้จัก หยุดคืนชิ้นนั้นให้สอน (วาดข้อความที่ไม่รู้จัก) · ปิดใส่ *
    pub teach: bool,
}

impl Default for ReadOpts { fn default() -> Self { ReadOpts { max_wrong: 25, italic: 0.2, space_px: 0, last_ditch: false, teach: false } } }

/// ผลอ่านหนึ่งภาพ เก็บชิ้นกับภาพสองสีไว้ให้หน้าต่างตรวจบรรทัด ตัวเติมเว้นวรรคในตัวเอียง และตัวสอน
pub struct LineRead {
    pub text: String,
    pub hits: Vec<Hit>,
    pub pieces: Vec<Piece>,
    pub parent: Bmp,
    pub space_px: i32,
    /// จำนวนชิ้นที่ไม่รู้จัก (ใส่ *)
    pub unknown: usize,
}

pub enum ReadOut {
    Done(LineRead),
    /// หยุดรอสอน · letter คือลำดับชิ้นที่ไม่รู้จัก ภาพกับชิ้นทั้งหมดส่งให้หน้าต่างสอนตัวอักษร
    Teach { letter: usize, parent: Bmp, pieces: Vec<Piece> },
}

/// ฐานสำรองข้ามตัวอ่าน (ขั้น 6) · ได้ชิ้นที่ไม่รู้จักกับลำดับ คืนข้อความ ตัวเอียง จำนวนชิ้นที่ขยายจับ
pub type Fallback<'a> = &'a dyn Fn(&Bmp, &[Piece], usize) -> Option<(String, bool, i32)>;

/// ตัวอ่าน nOCR หนึ่งงาน · ตัวจำความสูงบรรทัด ตัวตรวจเว้นวรรค ตัวแก้ตัวพิมพ์ จำค่าข้ามภาพ ใช้ตัวเดียวตลอดไฟล์
#[derive(Default)]
pub struct NOcrReader {
    pub tracker: LineHeightTracker,
    pub spaces: SpaceDetector,
    pub case: Mutex<CaseFixer>,
}

impl NOcrReader {
    /// แบ่งภาพสองสีเป็นชิ้น · จุดเว้นวรรค 0 แบ่งทุกช่องแล้วให้ตัวตรวจเว้นวรรคตัดสิน · ตาม SplitNOcrLetters
    pub fn split(&self, parent: &Bmp, space_px: i32) -> (Vec<Piece>, i32) {
        let auto = space_px <= 0;
        let letters = split_letters(parent, if auto { SPLIT_PIXELS_ARE_SPACE } else { space_px }, false, true, self.tracker.min_line_height(), true, self.tracker.average());
        if auto { self.spaces.remove_false_spaces(letters) } else { (letters, space_px) }
    }

    /// อ่านภาพซับหนึ่งภาพ · skip ชิ้นที่ผู้ใช้กดข้าม (ใส่ *) run_once ชิ้นที่ผู้ใช้พิมพ์ใช้ครั้งเดียว ทั้งสองชี้ด้วยลำดับชิ้น
    /// ทำภาพสองสี ตัดแถวใสบน แบ่งชิ้น จับคู่ทีละชิ้น แก้ตัวพิมพ์ เอาเว้นวรรคในตัวเลขออก แล้วประกอบแท็กตัวเอียง · ตาม RunNOcrLoop กับ NOcrOcrEngine.Recognize
    pub fn read(&self, db: &NOcrDb, img: &Bmp, o: &ReadOpts, skip: &HashSet<usize>, run_once: &HashMap<usize, String>, fallback: Option<Fallback>) -> ReadOut {
        if img.width() == 0 || img.height() == 0 {
            return ReadOut::Done(LineRead { text: String::new(), hits: vec![], pieces: vec![], parent: img.clone(), space_px: 12, unknown: 0 });
        }
        let two = crate::ocrprep::make_two_color(img, crate::ocrprep::two_color_threshold(img));
        let (parent, _) = crop_top(&two);
        let (letters, px) = self.split(&parent, o.space_px);
        self.tracker.update(&letters);
        let mut hits = vec![];
        let mut unknown = 0;
        let mut i = 0;
        while i < letters.len() {
            let item = &letters[i];
            if item.bmp.is_none() {
                if let Some(s) = &item.special { hits.push(Hit::text(s, Some(i))); }
                i += 1;
                continue;
            }
            let m = db.get_match(&parent, &letters, i, item.top, true, o.max_wrong, o.last_ditch, o.italic);
            if m.is_none() {
                if let Some((text, italic, expand)) = fallback.and_then(|f| f(&parent, &letters, i)).filter(|r| !r.0.is_empty()) {
                    hits.push(Hit { text, italic, expand_count: expand, piece: Some(i), ..Default::default() });
                    i += expand.max(1) as usize;
                    continue;
                }
                if o.teach {
                    if skip.contains(&i) { hits.push(Hit::text("*", Some(i))); unknown += 1; i += 1; continue; }
                    if let Some(t) = run_once.get(&i) { hits.push(Hit::text(t, Some(i))); i += 1; continue; }
                    return ReadOut::Teach { letter: i, parent, pieces: letters };
                }
            }
            match m {
                None => { hits.push(Hit::text("*", Some(i))); unknown += 1; }
                Some(c) => {
                    if c.expand_count > 0 { i += c.expand_count as usize - 1; }
                    let raw = Hit { text: c.text.clone(), italic: c.italic, expand_count: c.expand_count, piece: Some(i), margin_top: c.margin_top, height: c.height };
                    // ตัวแก้ตัวพิมพ์ดูชิ้นแรกของกลุ่มที่ขยายจับ แบบ Subtitle Edit ที่ส่ง splitterItem ตัวแรก
                    let first = i + 1 - c.expand_count.max(1) as usize;
                    let text = self.case.lock().unwrap().fix(&letters[first], &raw);
                    hits.push(Hit { text, piece: Some(first), ..raw });
                }
            }
            i += 1;
        }
        remove_false_spaces_in_numbers(&mut hits, &letters, px);
        let text = merge_italic(&hits).trim().to_string();
        ReadOut::Done(LineRead { text, hits, pieces: letters, parent, space_px: px, unknown })
    }

    /// อ่านแบบไม่หยุดสอน ไม่มีฐานสำรอง (แบบ SeConv)
    pub fn read_text(&self, db: &NOcrDb, img: &Bmp, o: &ReadOpts) -> LineRead {
        let o = ReadOpts { teach: false, ..o.clone() };
        match self.read(db, img, &o, &HashSet::new(), &HashMap::new(), None) { ReadOut::Done(r) => r, ReadOut::Teach { .. } => unreachable!() }
    }
}

/// ผลที่ใส่เว้นวรรคในตัวเอียงเพิ่ม ผู้เรียกเลือกใช้เมื่อคำที่ไม่รู้จักน้อยกว่า (Subtitle Edit ลองเมื่อมีแท็ก <i> และมีคำที่ไม่รู้จัก ค่าเอียง 0.33)
pub fn italic_retry(r: &LineRead) -> Option<String> {
    if !r.text.contains("<i>") { return None; }
    Some(more_italic_spaces(&r.hits, &r.pieces, &r.parent, 0.33, r.space_px))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn hit(t: &str, italic: bool) -> Hit { Hit { text: t.into(), italic, ..Default::default() } }

    /// ตัวอย่างในคำอธิบายของ OcrDigitLetterFixer ทุกตัว
    #[test]
    fn digit_letter_cases() {
        for (a, b) in [("5O", "50"), ("1O:3O", "10:30"), ("1,OOO", "1,000"), ("think 0f it", "think of it"), ("0f course", "Of course"), ("g0t", "got"), ("7o/o", "7%"), ("7 o/o", "7%"),
            ("З000", "З000"), ("D00-wah", "Doo-wah"), ("Hello. 0kay", "Hello. Okay"), ("G00D", "GOOD"), ("OK", "OK"), ("1O.3Ox", "10.3Ox")] {
            assert_eq!(digit_letter_fix(a), b, "{a}");
        }
    }

    /// คำเครื่องหมายตามคำที่มีตัวอักษร ขีดนำหน้าตามคำหลัง จุดท้ายตามคำหน้า ช่องว่างเอียงเมื่อสองข้างเอียง
    #[test]
    fn italic_tags_per_word() {
        let mk = |s: &[(&str, bool)]| s.iter().map(|(t, i)| hit(t, *i)).collect::<Vec<_>>();
        let h = mk(&[("-", false), (" ", false), ("H", true), ("i", true), (" ", false), ("y", true), ("o", true), ("u", true), (".", false)]);
        assert_eq!(merge_italic(&h), "<i>- Hi you.</i>");
        let h = mk(&[("M", false), ("A", false), ("N", false), (" ", false), (":", false), (" ", false), ("H", true), ("e", true), ("y", true)]);
        assert_eq!(merge_italic(&h), "MAN : <i>Hey</i>");
        let h = mk(&[("a", true), ("b", false), (" ", false), ("c", true), ("d", true)]);
        assert_eq!(merge_italic(&h), "<i>ab cd</i>");
        let h = mk(&[("y", true), ("<i>i</i>t", false)]);
        assert_eq!(merge_italic(&h), "<i>yi</i>t");
    }

    fn block(w: u32, h: u32) -> Bmp { RgbaImage::from_pixel(w, h, Rgba([255, 255, 255, 255])) }

    /// ช่องระหว่างตัว 2 จุด ช่องเว้นคำ 9 จุด บรรทัดสูง 20 · ตัดช่องเล็กออก เก็บช่องใหญ่ ได้เกณฑ์ราว 0.22 ถึง 0.45 ของความสูง
    #[test]
    fn space_detector_keeps_word_gaps() {
        let mut l = vec![];
        let mut x = 0;
        for (k, gap) in [2, 2, 9, 2, 2].iter().enumerate() {
            let mut g = Piece::glyph(x, 0, block(8, 20)); g.top = 0; l.push(g);
            x += 8;
            let mut s = Piece::special(" "); s.space_pixels = *gap; l.push(s);
            x += gap;
            if k == 4 { let mut g = Piece::glyph(x, 0, block(8, 20)); g.top = 0; l.push(g); }
        }
        let d = SpaceDetector::default();
        let (out, px) = d.remove_false_spaces(l);
        assert_eq!(out.iter().filter(|p| is_space(p)).count(), 1);
        assert!((3..=9).contains(&px), "{px}");
    }

    /// 1 ตามด้วยเว้นวรรคแคบแล้วตัวเลข เอาเว้นวรรคออก · 1 ตามด้วยคำ เว้นวรรคกว้างเก็บไว้
    #[test]
    fn spaces_in_numbers() {
        let mut sp = Piece::special(" "); sp.space_pixels = 10;
        let list = vec![Piece::default(), sp.clone(), Piece::default()];
        let mut hits = vec![Hit::text("1", Some(0)), Hit::text(" ", Some(1)), Hit::text("5", Some(2))];
        remove_false_spaces_in_numbers(&mut hits, &list, 6);
        assert_eq!(hits.len(), 2);
        let mut hits = vec![Hit::text("1", Some(0)), Hit::text(" ", Some(1)), Hit::text("v", Some(2))];
        remove_false_spaces_in_numbers(&mut hits, &list, 6);
        assert_eq!(hits.len(), 3);
    }

    /// p ที่ห้อยใต้เส้นฐานเป็นตัวเล็ก ที่นั่งบนเส้นฐานเป็นตัวใหญ่
    #[test]
    fn case_fixer_p() {
        let mut f = CaseFixer::default();
        let mut p = Piece::glyph(0, 0, block(8, 20)); p.top = 6; p.baseline = Some(20);
        assert_eq!(f.fix(&p, &hit("P", false)), "p");
        p.top = 0;
        assert_eq!(f.fix(&p, &hit("p", false)), "P");
    }

    #[test]
    fn crop_top_and_tracker() {
        let mut b = RgbaImage::new(4, 10);
        b.put_pixel(1, 3, Rgba([255, 255, 255, 255]));
        let (c, n) = crop_top(&b);
        assert_eq!((c.height(), n), (7, 3));
        let t = LineHeightTracker::default();
        assert_eq!(t.min_line_height(), 12);
        let l: Vec<Piece> = (0..21).map(|_| Piece::glyph(0, 0, block(2, 30))).collect();
        t.update(&l);
        assert_eq!(t.min_line_height(), 27);
    }

    fn srt_cues(p: &str) -> Vec<(f64, String)> {
        let s = std::fs::read_to_string(p).unwrap().replace('\u{feff}', "").replace("\r\n", "\n");
        s.split("\n\n").filter_map(|b| {
            let mut l = b.lines();
            l.next()?;
            let t = l.next()?;
            let hms = t.split(" --> ").next()?;
            let v: Vec<f64> = hms.replace(',', ":").split(':').filter_map(|x| x.trim().parse().ok()).collect();
            if v.len() != 4 { return None; }
            Some((v[0] * 3600.0 + v[1] * 60.0 + v[2] + v[3] / 1000.0, l.collect::<Vec<_>>().join("\n")))
        }).collect()
    }

    /// แปลมาถูกไหม อ่านซับ ACCA ทั้งไฟล์ด้วยฐาน Latin ค่าแบบ SeConv (จุดผิด 25 ทางสุดท้ายเปิด ไม่บิดตัวเอียง) เทียบผล SeConv ทีละบรรทัดตามเวลาเริ่ม
    /// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_SECONV_NOCR (SRT ที่ SeConv อ่านด้วย Latin.nocr) · ห้ามขึ้น git
    #[test]
    fn acca_same_as_seconv() {
        let (Ok(sup), Ok(se)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_SECONV_NOCR")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
        let db = NOcrDb::load(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.nocr")).unwrap();
        let cues = srt_cues(&se);
        let shows = crate::subs::parse_sup(&std::fs::read(sup).unwrap());
        let reader = NOcrReader::default();
        let o = ReadOpts { max_wrong: 25, italic: 0.0, space_px: 0, last_ditch: true, teach: false };
        let t = std::time::Instant::now();
        let (mut same, mut n, mut diff) = (0, 0, vec![]);
        for (k, s) in shows.iter().enumerate() {
            let got = reader.read_text(&db, &s.img, &o).text;
            // บางเวลามีสองบรรทัดเริ่มพร้อมกัน (SeConv รวมภาพที่ซ้อนกัน) ตรงบรรทัดไหนก็นับ
            let near: Vec<&(f64, String)> = cues.iter().filter(|c| (c.0 - s.start).abs() < 0.03).collect();
            if near.is_empty() { continue; }
            n += 1;
            if near.iter().any(|c| c.1 == got) { same += 1; } else { diff.push((k + 1, got, near[0].1.clone())); }
        }
        eprintln!("ACCA ตรงกับ SeConv {same} จาก {n} บรรทัด (ภาพ {} SeConv {}) ใน {:.1} วินาที", shows.len(), cues.len(), t.elapsed().as_secs_f64());
        for d in diff.iter().take(40) { eprintln!("ภาพ {} ของเรา {:?} SeConv {:?}", d.0, d.1, d.2); }
        // ที่ต่างได้มีบรรทัดเดียว คือภาพ 430 ที่ SeConv รวมภาพซ้อนกันคนละแบบกับตัวถอด PGS ของเรา (คำตอบที่อ่านจากภาพตรงกับของเรา) · ก่อนแก้จุดเดียวไปคอลัมน์ 0 ได้ 431
        assert!(n - same <= 1, "ต่างจาก SeConv {} บรรทัด", n - same);
    }

    /// อ่านภาพซับไทยทดสอบด้วยฐาน Latin ของ Subtitle Edit ไม่ล้ม ได้ผลเป็นข้อความ (ความแม่นวัดในขั้น 13)
    #[test]
    fn reads_with_se_latin_db() {
        let db_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.nocr");
        if !db_path.exists() { return; }
        let db = NOcrDb::load(&db_path).unwrap();
        let mut img = RgbaImage::new(60, 30);
        for y in 5..25 { for x in 10..14 { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } }
        let r = NOcrReader::default().read_text(&db, &img, &ReadOpts { last_ditch: true, ..Default::default() });
        assert!(!r.text.is_empty());
    }
}
