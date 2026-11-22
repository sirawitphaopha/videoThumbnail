//! ตัดบรรทัดเองหลังอ่าน OCR (แผน OCR ขั้น 11 · BUGS ข้อ 143) ข้อความที่อ่านได้เกินจำนวนบรรทัดที่ตั้ง (สองบรรทัด) รวมเป็นบรรทัดเดียวแล้วหาจุดตัดใหม่
//! บทพูดสองคน (ขีดนำหน้าทั้งสองบรรทัด) กับเพลง (♪) ไม่ตัดใหม่ · ข้อความสั้นกว่า 33 ตัวรวมเป็นบรรทัดเดียว
//! จุดตัดเลือกจากความกว้างเป็นพิกเซลที่สองบรรทัดใกล้กันที่สุด แต่ละบรรทัดไม่เกิน 43 ตัว และให้บรรทัดล่างยาวกว่านิดหน่อย
//!
//! แปลจาก Utilities.AutoBreakLine AutoBreakLinePrivate CanBreak RemoveLineBreaks ReInsertHtmlTags (src/libse/Common/Utilities.cs)
//! TextSplit.cs TextSplitResult.cs DialogSplitMerge.IsDialog StringExtensions.HasSentenceEnding HtmlUtil.FixUpperTags
//! CalcAll.CountCharacters ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//!
//! ค่าตั้งต้นของ Subtitle Edit ที่ใช้ SubtitleLineMaximumLength 43 MergeLinesShorterThan 33 MaxNumberOfLines 2
//! AutoBreakDashEarly เปิด AutoBreakLineEndingEarly ปิด AutoBreakCommaBreakEarly ปิด AutoBreakUsePixelWidth เปิด
//! AutoBreakPreferBottomHeavy เปิด 5% UseNoLineBreakAfter ปิด (จึงเหลือเช็กแค่ mr. กับ dr.) DialogStyle ไม่มีผลกับการตัด
//! ความกว้างพิกเซล Subtitle Edit วัดด้วย SKFont ขนาด 12 ฟอนต์ตั้งต้นของ Skia ซึ่งบน Windows คือ Segoe UI
//! ชั้นหนังวัดด้วย GDI ฟอนต์ Segoe UI สูง 12 จุด ได้ความกว้างเป็นจำนวนเต็มต่อบรรทัด (Skia ได้ทศนิยม) จุดตัดที่สองแบบเท่ากันพอดีอาจต่างกันได้

use std::collections::HashMap;

pub const MAX_LEN: usize = 43;
pub const MERGE_SHORTER: usize = 33;
pub const MAX_LINES: usize = 2;
const DASH_EARLY: bool = true;
const COMMA_EARLY: bool = false;
const PREFER_BOTTOM_PERCENT: f64 = 5.0;
const END_LINE_CHARS: &str = ".!?…؟。？！";
const COMMAS: &str = ",،，、";

// ---------------------------------------------------------------- ตัวช่วยข้อความ

/// แยกบรรทัดแบบ SplitToLines (\r\n \n \r)
pub fn split_to_lines(s: &str) -> Vec<String> {
    s.replace("\r\n", "\n").replace('\r', "\n").split('\n').map(String::from).collect()
}

/// จำนวนบรรทัดแบบ Utilities.GetNumberOfLines
pub fn number_of_lines(s: &str) -> usize {
    if s.is_empty() { 0 } else { s.matches('\n').count() + 1 }
}

/// ลบแท็กของ ASS {\...} แบบ Utilities.RemoveSsaTags
fn remove_ssa_tags(s: &str) -> String {
    let mut out = s.to_string();
    while let Some(a) = out.find("{\\") {
        match out[a..].find('}') {
            Some(b) => out.replace_range(a..a + b + 1, ""),
            None => break,
        }
    }
    out
}

/// ลบแท็กที่ซับใช้ <i> <b> <u> <font> <box> และแท็ก v c ของ WebVTT · also_ssa ลบ {\...} ด้วย · แบบ HtmlUtil.RemoveHtmlTags
pub fn remove_html_tags(input: &str, also_ssa: bool) -> String {
    if input.chars().count() < 3 { return input.to_string(); }
    let s = if also_ssa { remove_ssa_tags(input) } else { input.to_string() };
    if !s.contains('<') { return s; }
    let cs: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == '<' {
            if let Some(end) = cs[i..].iter().position(|&c| c == '>') {
                let tag: String = cs[i + 1..i + end].iter().collect::<String>().to_lowercase();
                let name = tag.strip_prefix('/').unwrap_or(&tag);
                let known = matches!(name, "i" | "b" | "u" | "box" | "v" | "c" | "font")
                    || name.starts_with("font ") || name.starts_with("v ") || name.starts_with("v.") || name.starts_with("c.");
                if known { i += end + 1; continue; }
            }
        }
        out.push(cs[i]);
        i += 1;
    }
    out
}

/// ตัวควบคุมทิศทางกับช่องว่างไม่ตัดบรรทัด แบบ Utilities.RemoveUnicodeControlChars
fn remove_unicode_control_chars(s: &str) -> String {
    s.chars().filter(|c| !matches!(c, '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}')).map(|c| if c == '\u{a0}' { ' ' } else { c }).collect()
}

/// แท็กตัวใหญ่ <I> <U> <B> <FONT </I> </U> </B> </FONT เป็นตัวเล็ก แบบ HtmlUtil.FixUpperTags
fn fix_upper_tags(input: &str) -> String {
    if !input.contains('<') { return input.to_string(); }
    let mut cs: Vec<char> = input.chars().collect();
    let starts_upper = |c: &[char], i: usize| -> bool {
        let rem = c.len() - i;
        if rem < 3 { return false; }
        match c[i + 1] {
            'I' | 'U' | 'B' => c[i + 2] == '>',
            'F' => rem >= 5 && c[i + 2] == 'O' && c[i + 3] == 'N' && c[i + 4] == 'T',
            '/' if rem >= 4 => match c[i + 2] {
                'I' | 'U' | 'B' => c[i + 3] == '>',
                'F' => rem >= 6 && c[i + 3] == 'O' && c[i + 4] == 'N' && c[i + 5] == 'T',
                _ => false,
            },
            _ => false,
        }
    };
    let mut i = 0;
    while i < cs.len() {
        if cs[i] == '<' && starts_upper(&cs, i) {
            let Some(end) = cs[i + 2..].iter().position(|&c| c == '>').map(|p| p + i + 2) else { break };
            for c in cs.iter_mut().take(end).skip(i) { *c = c.to_ascii_lowercase(); }
            i = end + 1;
            continue;
        }
        i += 1;
    }
    cs.into_iter().collect()
}

fn is_closing_quote(c: char) -> bool {
    matches!(c, '"' | '\u{201C}' | '\u{201D}' | '\u{AB}' | '\u{BB}' | '\'' | '\u{2018}' | '\u{2019}' | '\u{300D}' | '\u{300F}')
}

/// ประโยคจบที่ท้ายข้อความไหม แบบ StringExtensions.HasSentenceEnding
pub fn has_sentence_ending(value: &str, lang: &str) -> bool {
    let v: Vec<char> = value.chars().collect();
    if v.is_empty() { return false; }
    let mut k = v.len() as isize - 1;
    while k >= 0 && (is_closing_quote(v[k as usize]) || matches!(v[k as usize], '\u{a0}' | '\u{202f}')) { k -= 1; }
    if k < 0 { return false; }
    let mut c = v[k as usize];
    // เครื่องหมายจบประโยคที่ติดแท็กปิด เช่น </i> {\i0}
    while c == '>' || c == '}' {
        let open = if c == '>' { '<' } else { '{' };
        k = match v[..=k as usize].iter().rposition(|&x| x == open) { Some(p) => p as isize - 1, None => -2 };
        if k < 0 { return false; }
        c = v[k as usize];
    }
    if c == '-' { return k > 1 && v[(k - 2) as usize].is_alphabetic() && v[(k - 1) as usize] == '-'; }
    if c == '—' { return k > 0 && v[(k - 1) as usize].is_alphabetic(); }
    let greek = lang.eq_ignore_ascii_case("el");
    matches!(c, '.' | '!' | '?' | ']' | ')' | '…' | '♪' | '؟' | '。' | '？') || (greek && (c == '\u{37e}' || c == ';'))
}

/// อักษรที่ซ้อนบนตัวหน้า ไม่นับเป็นตัวแยก (สระบนล่างและวรรณยุกต์ไทย เครื่องหมายเสียงของละติน ญี่ปุ่น)
/// Subtitle Edit นับเป็นกลุ่มตัวอักษร (StringInfo) ซึ่งรวมอักษรเหล่านี้กับตัวหน้าเป็นหนึ่ง
fn is_combining(c: char) -> bool {
    matches!(c, '\u{0300}'..='\u{036F}' | '\u{0E31}' | '\u{0E34}'..='\u{0E3A}' | '\u{0E47}'..='\u{0E4E}' | '\u{3099}' | '\u{309A}' | '\u{FE00}'..='\u{FE0F}')
}

/// จำนวนตัวอักษรแบบ CalcAll (ค่าตั้งต้น CpsLineLengthStrategy) ไม่นับแท็ก ตัวควบคุม ช่องว่างไร้ความกว้าง
pub fn count_characters(text: &str) -> usize {
    remove_html_tags(text, true).chars().filter(|&c| !c.is_control() && !is_combining(c)
        && !matches!(c, '\u{200B}' | '\u{FEFF}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}')).count()
}

fn starts_dash(s: &str) -> bool {
    let t = s.trim_start();
    t.starts_with('-') || t.starts_with('\u{2010}')
}

/// ภาษาที่ไม่ใช้จุดจบประโยค (LanguageAutoDetect.IsLanguageWithoutPeriods)
fn without_periods(lang: &str) -> bool { matches!(lang, "ko" | "zh" | "ja" | "th") }

/// บทพูดสองคนไหม แบบ DialogSplitMerge.IsDialog
pub fn is_dialog(lines: &[String], lang: &str) -> bool {
    if lines.len() < 2 || lines.len() > 3 { return false; }
    let l0 = remove_html_tags(&lines[0], false);
    let l1 = remove_html_tags(&lines[1], true);
    let no_end = without_periods(lang);
    let hse = |s: &str| has_sentence_ending(s, lang);
    if lines.len() == 2 {
        if (hse(&l0) || no_end) && starts_dash(&l1) { return true; }
        if starts_dash(&l0) && l0.ends_with("--") && !l0.ends_with("---") && starts_dash(&l1) {
            let trimmed = l0.trim_end_matches('-').trim_end();
            if trimmed.chars().last().is_some_and(|c| c.is_alphanumeric()) { return true; }
        }
    }
    if lines.len() == 3 {
        let l2 = remove_html_tags(&lines[2], true);
        // บรรทัดสองเป็นต่อของบรรทัดแรก แล้วบรรทัดสามขึ้นคนใหม่
        if !hse(&l0) && hse(&l1) && !starts_dash(&l1) && starts_dash(&l2) { return true; }
        // บรรทัดแรกคนเดียว บรรทัดสองสามเป็นของคนที่สอง
        if hse(&l0) && starts_dash(&l1) && !hse(&l1) && !starts_dash(&l2) { return true; }
        if (hse(&l0) || no_end) && starts_dash(&l1) && (hse(&l1) || no_end) && starts_dash(&l2) { return true; }
    }
    false
}

/// ตัดหลังช่องว่างตำแหน่ง index ได้ไหม แบบ Utilities.CanBreak (UseNoLineBreakAfter ปิดตามค่าตั้งต้น)
fn can_break(s: &[char], index: usize, lang: &str) -> bool {
    let Some(&next) = s.get(index) else { return false };
    if !matches!(next, ' ' | '\r' | '\n' | '\t') { return false; }
    let head: String = s[..index].iter().collect();
    let low = head.to_lowercase();
    if low.ends_with(" mr.") || low.ends_with(" dr.") { return false; }
    if head.ends_with("? -") || head.ends_with("! -") || head.ends_with(". -") { return false; }
    if next == ' ' && lang == "fr" && index + 1 < s.len() && matches!(s[index + 1], '?' | '!' | '.') { return false; }
    true
}

// ---------------------------------------------------------------- ความกว้างพิกเซล

/// ความกว้างของข้อความแบบ TextSplitResult.GetWidth · ยาวเกิน 128 ตัวหรือวัดไม่ได้ใช้ ความยาว × 5
fn get_width(t: &str) -> f32 {
    let n = t.chars().count();
    if n > 128 { return (n * 5) as f32; }
    measure(t).unwrap_or((n * 5) as f32)
}

/// ยาวเกิน 1000 ตัวประมาณ ความยาว × 7 แบบ EstimateOrMeasure
fn estimate_or_measure(t: &str) -> f32 {
    let n = t.chars().count();
    if n > 1000 { (n * 7) as f32 } else { get_width(t) }
}

#[cfg(windows)]
fn measure(t: &str) -> Option<f32> {
    use std::sync::{Mutex, OnceLock};
    use windows_sys::Win32::Foundation::SIZE;
    use windows_sys::Win32::Graphics::Gdi::{CreateCompatibleDC, CreateFontIndirectW, GetTextExtentPoint32W, SelectObject, LOGFONTW};
    static DC: OnceLock<Mutex<usize>> = OnceLock::new();
    let dc = DC.get_or_init(|| unsafe {
        let dc = CreateCompatibleDC(std::ptr::null_mut());
        if dc.is_null() { return Mutex::new(0); }
        let mut lf: LOGFONTW = std::mem::zeroed();
        lf.lfHeight = -12;
        for (k, u) in "Segoe UI".encode_utf16().enumerate() { lf.lfFaceName[k] = u; }
        let font = CreateFontIndirectW(&lf);
        if font.is_null() { return Mutex::new(0); }
        SelectObject(dc, font);
        Mutex::new(dc as usize)
    });
    let g = dc.lock().ok()?;
    if *g == 0 { return None; }
    let w: Vec<u16> = t.encode_utf16().collect();
    if w.is_empty() { return Some(0.0); }
    let mut sz = SIZE { cx: 0, cy: 0 };
    let ok = unsafe { GetTextExtentPoint32W(*g as _, w.as_ptr(), w.len() as i32, &mut sz) };
    if ok == 0 { None } else { Some(sz.cx as f32) }
}

#[cfg(not(windows))]
fn measure(_t: &str) -> Option<f32> { None }

// ---------------------------------------------------------------- TextSplit

/// จุดตัดหนึ่งจุด สองบรรทัด แบบ TextSplitResult
struct Split { l1: String, l2: String, n1: usize, n2: usize, px: std::cell::OnceCell<(f32, f32)> }

impl Split {
    fn new(l1: String, l2: String) -> Split {
        Split { n1: l1.chars().count(), n2: l2.chars().count(), l1, l2, px: std::cell::OnceCell::new() }
    }
    fn px(&self) -> (f32, f32) { *self.px.get_or_init(|| (estimate_or_measure(&self.l1), estimate_or_measure(&self.l2))) }
    fn line_len_ok(&self, max: usize) -> bool { self.n1 <= max && self.n2 <= max }
    fn diff_avg(&self) -> f64 {
        let avg = (self.n1 + self.n2) as f64 / 2.0;
        (avg - self.n1 as f64).abs() + (avg - self.n2 as f64).abs()
    }
    /// ผลรวมแบบ float ของ Subtitle Edit แล้วลบความกว้างเว้นวรรคหนึ่งช่อง
    fn total_px(&self, space: f32) -> f32 { let (a, b) = self.px(); ((a as f64 + b as f64) as f32) - space }
    fn diff_avg_px(&self, space: f32) -> f64 {
        let (a, b) = self.px();
        let avg = self.total_px(space) as f64 / 2.0;
        (avg - a as f64).abs() + (avg - b as f64).abs()
    }
    fn diff_avg_px_bottom(&self, space: f32) -> f64 {
        let (a, b) = self.px();
        let avg = self.total_px(space) as f64 / 2.0;
        let bd = avg * (PREFER_BOTTOM_PERCENT / 100.0);
        (avg - bd - a as f64).abs() + (avg + bd - b as f64).abs()
    }
    /// บรรทัดล่างยาวกว่าหรือเท่ากัน ยอมต่าง 2 จุด
    fn bottom_heavy(&self) -> bool { let (a, b) = self.px(); b + 2.0 > a }
    fn joined(&self) -> String { format!("{}\n{}", self.l1, self.l2) }
}

/// ตัวแรกที่ค่าน้อยที่สุด (น้อยกว่าเท่านั้น ค่าเท่ากันเอาตัวก่อน) แบบ TextSplit.MinBy
fn min_by<'a>(v: &'a [&'a Split], filter: impl Fn(&Split) -> bool, key: impl Fn(&Split) -> f64) -> Option<&'a Split> {
    let mut best: Option<&Split> = None;
    let mut best_d = f64::MAX;
    for p in v {
        if !filter(p) { continue; }
        let d = key(p);
        if d < best_d { best_d = d; best = Some(p); }
    }
    best
}

fn trim_quotes_end(s: &str) -> &str { s.trim_end_matches(['"', '\'']) }
fn trim_quotes_start(s: &str) -> &str { s.trim_start_matches(['"', '\'']) }

/// แบ่งข้อความบรรทัดเดียวเป็นสองบรรทัด แบบ TextSplit.AutoBreak
fn text_split(text: &str, max: usize, lang: &str, line_ending_early: bool) -> Option<String> {
    let cs: Vec<char> = text.chars().collect();
    let cjk = matches!(lang, "zh" | "ja" | "ko");
    let mut all: Vec<Split> = vec![];
    let mut ok: Vec<bool> = vec![];
    for i in 1..cs.len().saturating_sub(1) {
        if cs[i] == ' ' {
            let l1: String = cs[..i].iter().collect::<String>().trim().to_string();
            let l2: String = cs[i + 1..].iter().collect::<String>().trim().to_string();
            all.push(Split::new(l1, l2));
            ok.push(can_break(&cs, i, lang));
        } else if cjk && "，。？、?".contains(cs[i]) {
            let l1: String = cs[..=i].iter().collect::<String>().trim().to_string();
            let l2: String = cs[i + 1..].iter().collect::<String>().trim().to_string();
            all.push(Split::new(l1, l2));
            ok.push(true);
        }
    }
    let splits: Vec<&Split> = all.iter().zip(&ok).filter(|&(_, &k)| k).map(|(s, _)| s).collect();
    let all_refs: Vec<&Split> = all.iter().collect();
    let space = get_width(" ");
    let ends_with = |p: &Split, chars: &str| trim_quotes_end(&p.l1).chars().last().is_some_and(|c| chars.contains(c));
    if DASH_EARLY {
        let dialog = |p: &Split| {
            let a = trim_quotes_end(&p.l1);
            let b = trim_quotes_start(&p.l2);
            b.starts_with('-') && a.chars().last().is_some_and(|c| END_LINE_CHARS.contains(c))
        };
        if let Some(b) = min_by(&splits, dialog, |p| p.diff_avg_px(space)) { return Some(b.joined()); }
    }
    if line_ending_early {
        if let Some(b) = min_by(&splits, |p| p.line_len_ok(max) && ends_with(p, END_LINE_CHARS), |p| p.diff_avg_px(space)) { return Some(b.joined()); }
    }
    if COMMA_EARLY {
        if let Some(b) = min_by(&splits, |p| p.line_len_ok(max) && ends_with(p, COMMAS), |p| p.diff_avg_px(space)) { return Some(b.joined()); }
    }
    // ใช้ความกว้างพิกเซล (AutoBreakUsePixelWidth) · ถ้าจุดที่ได้บรรทัดบนยาวกว่า ลองแบบเอียงให้บรรทัดล่างยาวกว่า 5%
    let mut best = min_by(&splits, |p| p.line_len_ok(max), |p| p.diff_avg_px(space));
    if let Some(b) = best {
        if !b.bottom_heavy() {
            best = min_by(&splits, |p| p.line_len_ok(max), |p| p.diff_avg_px_bottom(space)).or(best);
        }
    }
    if let Some(b) = best { return Some(b.joined()); }
    if let Some(b) = min_by(&splits, |_| true, |p| p.diff_avg()) { return Some(b.joined()); }
    min_by(&all_refs, |_| true, |p| p.diff_avg()).map(|b| b.joined())
}

// ---------------------------------------------------------------- AutoBreakLine

/// รวมบรรทัดเป็นบรรทัดเดียว ย้ายแท็กปิดที่หัวบรรทัดไปท้ายบรรทัดก่อน แบบ Utilities.RemoveLineBreaks
pub fn remove_line_breaks(input: &str) -> String {
    let mut s = fix_upper_tags(input);
    if !s.contains('\n') { return s.trim().to_string(); }
    for (a, b) in [
        ("</i> \n<i>", "\n"), ("</i>\n <i>", "\n"), ("</i>\n<i>", "\n"),
        ("\n </i>", "</i>\n"), ("\n </b>", "</b>\n"), ("\n </u>", "</u>\n"), ("\n </font>", "</font>\n"),
        (" \n</i>", "</i>\n"), (" \n</b>", "</b>\n"), (" \n</u>", "</u>\n"), (" \n</font>", "</font>\n"),
        ("\n</i>", "</i>\n"), ("\n</b>", "</b>\n"), ("\n</u>", "</u>\n"), ("\n</font>", "</font>\n"),
    ] {
        s = s.replace(a, b);
    }
    while s.contains(" \n") { s = s.replace(" \n", "\n"); }
    while s.contains("\n ") { s = s.replace("\n ", "\n"); }
    s.replace('\n', " ").trim().to_string()
}

/// ใส่แท็กที่ถอดไว้กลับตามลำดับตัวอักษร (ไม่นับตัวขึ้นบรรทัด) แบบ Utilities.ReInsertHtmlTags
fn reinsert_html_tags(s: &str, tags: &HashMap<usize, String>) -> String {
    if tags.is_empty() { return s.to_string(); }
    let mut out = String::with_capacity(s.len() + 16);
    let mut six = 0usize;
    for c in s.chars() {
        if c == '\r' || c == '\n' { out.push(c); continue; }
        if let Some(t) = tags.get(&six) { out.push_str(t); }
        out.push(c);
        six += 1;
    }
    for k in 0..15 { if let Some(t) = tags.get(&(six + k)) { out.push_str(t); } }
    out
}

fn is_cjk(lang: &str) -> bool { matches!(lang, "zh" | "ja" | "ko") }

/// แทนช่องว่างที่ติดกันหลายช่องด้วยช่องเดียว
fn collapse_spaces(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev = false;
    for c in s.chars() {
        if c == ' ' { if prev { continue; } prev = true; } else { prev = false; }
        out.push(c);
    }
    out
}

fn ends_one_of(s: &str, set: &str) -> bool { s.chars().last().is_some_and(|c| set.contains(c)) }

/// ตัดบรรทัดใหม่ แบบ Utilities.AutoBreakLinePrivate · ข้อความใช้ \n คั่นบรรทัด
pub fn auto_break_line_private(input: &str, max_len: usize, merge_shorter: usize, lang: &str, line_ending_early: bool) -> String {
    if input.chars().count() < 3 { return input.to_string(); }
    let text = input.replace('\u{a0}', " ");
    if !(text.contains(' ') || text.contains('\n')) && !is_cjk(lang) { return input.to_string(); }

    // บทพูดสองคนกับเพลงไม่ตัดใหม่
    if text.contains('\n') && (text.contains('-') || text.contains('♪')) {
        let lines = split_to_lines(&remove_unicode_control_chars(&remove_html_tags(&text, true)));
        if lines.len() == 2 {
            let arr0 = trim_quotes_end(lines[0].trim()).trim_end().to_string();
            let n0 = arr0.chars().count();
            let ends_mark = ends_one_of(&arr0, ".?!)]♪؟");
            if lang == "ar" {
                let starts_mark = arr0.chars().next().is_some_and(|c| ".?!)]♪؟".contains(c));
                if arr0.ends_with('-') && lines[1].trim_start().ends_with('-') && n0 > 1 && (starts_mark || arr0.starts_with("--") || arr0.starts_with('–')) && DASH_EARLY {
                    return input.to_string();
                }
            } else if arr0.starts_with('-') && lines[1].trim_start().starts_with('-') && n0 > 1
                && (ends_mark || arr0.ends_with("--") || arr0.ends_with('–') || arr0 == "- _" || arr0 == "-_") && DASH_EARLY {
                return input.to_string();
            }
            let (s0, s1) = (&lines[0], &lines[1]);
            if (s0.starts_with('♪') && s0.ends_with('♪')) || (s1.starts_with('♪') && s1.ends_with('♪')) { return input.to_string(); }
            if s0.starts_with('[') && s0.chars().count() > 1 && ends_mark && (s1.starts_with('-') || s1.starts_with('[')) { return input.to_string(); }
            if s0.starts_with('-') && s0.chars().count() > 1 && ends_mark && (s1.starts_with('-') || s1.starts_with('[')) && DASH_EARLY { return input.to_string(); }
        }
        if DASH_EARLY && is_dialog(&lines, lang) && lines.len() <= MAX_LINES { return input.to_string(); }
    }

    // ภาษาที่ไม่เว้นวรรคระหว่างคำ (จีน ญี่ปุ่น เกาหลี) ต่อบรรทัดชิดกัน ไม่แทรกเว้นวรรคตรงรอยต่อ (ผู้ช่วยตรวจทาน T1)
    let mut s = if is_cjk(lang) { remove_line_breaks(&text.split('\n').map(str::trim).collect::<Vec<_>>().join("")) } else { remove_line_breaks(&text) };
    if s.contains("  ") { s = collapse_spaces(&s); }

    // ข้อความสั้นรวมเป็นบรรทัดเดียว · ถ้ามีขีดขึ้นคนที่สองหลังประโยคจบ ตัดตรงนั้น
    if count_characters(&s) < merge_shorter {
        let cs: Vec<char> = s.chars().collect();
        let last_dash = (0..cs.len().saturating_sub(1)).rev().find(|&k| cs[k] == ' ' && cs[k + 1] == '-');
        if let Some(k) = last_dash {
            let head: String = cs[..k].iter().collect();
            if DASH_EARLY && k > 4 && has_sentence_ending(&head, lang) {
                let tail: String = cs[k + 1..].iter().collect();
                return format!("{head}\n{tail}");
            }
        }
        return s;
    }

    // ถอดแท็กออกก่อนหาจุดตัด จำตำแหน่งไว้ใส่กลับ
    let mut tags: HashMap<usize, String> = HashMap::new();
    let cs: Vec<char> = s.chars().collect();
    let mut plain = String::with_capacity(s.len());
    let mut n_plain = 0usize;
    let mut i = 0usize;
    let starts_ci = |at: usize, p: &str| -> bool {
        let pc: Vec<char> = p.chars().collect();
        at + pc.len() <= cs.len() && cs[at..at + pc.len()].iter().zip(&pc).all(|(a, b)| a.to_ascii_lowercase() == *b)
    };
    while i < cs.len() {
        let c = cs[i];
        if c == '<' && ["<font", "</font", "<u", "</u", "<b", "</b", "<i", "</i"].iter().any(|p| starts_ci(i, p)) {
            if let Some(e) = cs[i + 1..].iter().position(|&x| x == '>').map(|p| p + i + 1) {
                let tag: String = cs[i..=e].iter().collect();
                tags.entry(n_plain).and_modify(|t| t.push_str(&tag)).or_insert(tag);
                i = e + 1;
                continue;
            }
        } else if c == '{' && cs.get(i + 1) == Some(&'\\') {
            if let Some(e) = cs[i..].iter().position(|&x| x == '}').map(|p| p + i) {
                let tag: String = cs[i..=e].iter().collect();
                tags.entry(n_plain).and_modify(|t| t.push_str(&tag)).or_insert(tag);
                i = e + 1;
                continue;
            }
        }
        plain.push(c);
        n_plain += 1;
        i += 1;
    }
    let mut s = text_split(&plain, max_len, lang, line_ending_early).unwrap_or(plain);
    s = reinsert_html_tags(&s.replace('\n', " \n"), &tags);
    // แท็กปิดที่ตกไปหัวบรรทัดล่าง ย้ายกลับไปท้ายบรรทัดบน
    if let Some(idx) = s.find("\n</") {
        if s[..idx].chars().count() > 2 {
            if let Some(end) = s[idx + 2..].find('>').map(|p| p + idx + 2) {
                let tag = s[idx + 1..=end].to_string();
                s.insert_str(idx, &tag);
                let from = idx + tag.len() + 1;
                s.replace_range(from..from + tag.len(), "");
            }
        }
    }
    s.replace(" \n", "\n").replace("\n ", "\n").trim_end().to_string()
}

/// ตัดบรรทัดตามค่าตั้งต้นของ Subtitle Edit (43 ตัว รวมเมื่อสั้นกว่า 33 ตัว ไม่ตัดหลังจบประโยคก่อน)
pub fn auto_break_line(text: &str, lang: &str) -> String {
    auto_break_line_private(&text.replace("\r\n", "\n"), MAX_LEN, MERGE_SHORTER, lang, false)
}

/// ภาษาสองตัวจากชื่อพจนานุกรม (en_US → en) แบบ GetAutoBreakLanguage · ไม่มีพจนานุกรมคือว่าง
pub fn lang_of_dict(dict: &str) -> String {
    dict.split(['_', '-']).next().unwrap_or("").to_lowercase()
}

/// ภาษาจากตัวอักษรในข้อความ · คานะเป็นญี่ปุ่น ฮันกึลเป็นเกาหลี มีแต่คันจิเป็นจีน อักษรไทยเป็นไทย ไม่ใช่ทั้งหมดใช้ภาษาจากพจนานุกรม
/// PaddleOCR แบบหลายภาษา (อังกฤษ ญี่ปุ่น จีน) ใช้พจนานุกรม en_US ซับญี่ปุ่นเลยได้ภาษา en ตัวตัดบรรทัดรวมบรรทัดแล้วแทรกเว้นวรรค (ผู้ช่วยตรวจทาน T1)
pub fn lang_of_text(text: &str, fallback: &str) -> String {
    let has = |a: char, b: char| text.chars().any(|c| (a..=b).contains(&c));
    if has('\u{3040}', '\u{30FF}') { return "ja".into(); }
    if has('\u{AC00}', '\u{D7AF}') { return "ko".into(); }
    if has('\u{4E00}', '\u{9FFF}') { return "zh".into(); }
    if has('\u{0E00}', '\u{0E7F}') { return "th".into(); }
    fallback.to_string()
}

#[cfg(test)]
#[path = "ocrbreak_tests.rs"]
mod tests;
