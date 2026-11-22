//! ตัวช่วยข้อความของตัวแก้ OCR ตัวอักษรมีเครื่องหมาย แท็ก แทนคำ ขีด ทับ จุดพัน เครื่องหมายคำพูด แยกบรรทัดเป็นคำ
//! แยกจาก ocrfix/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

pub(crate) const ACCENT_GROUPS: [&str; 29] = ["aàáâãäåā", "AÀÁÂÃÄÅĀ", "eèéêëēěęė", "EÈÉÊËĒĚĘĖ", "iìíîïī", "IÌÍÎÏĪ", "oòóôõöøō", "OÒÓÔÕÖØŌ",
    "uùúûüūů", "UÙÚÛÜŪŮ", "cçčć", "CÇČĆ", "sšśş", "SŠŚŞ", "zžźż", "ZŽŹŻ", "nñńň", "NÑŃŇ", "yýÿ", "YÝŸ", "rř", "RŘ", "dď", "DĎ", "tť", "TŤ", "lł", "LŁ", "gğ"];
pub(crate) const ACCENT_CROSS: [&str; 6] = ["Bß", "čë", "ČË", "šë", "žä", "ŽÄ"];

/// ตัวอักษรพื้นของสระมีเครื่องหมาย (แบบ NFD ตัวแรก) สำหรับภาษาละติน
pub(crate) fn base_letter(c: char) -> char {
    for g in ACCENT_GROUPS { if g.contains(c) { return g.chars().next().unwrap(); } }
    c
}

pub(crate) fn remove_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() { match c { '<' => in_tag = true, '>' if in_tag => in_tag = false, _ if !in_tag => out.push(c), _ => {} } }
    out
}

pub(crate) fn first_word(t: &str) -> String {
    let w: String = t.chars().take_while(|c| is_letter(*c) || matches!(c, '\'' | '’')).collect();
    if w.is_empty() { t.chars().take(1).collect() } else { w }
}

/// แทนทุกชิ้นที่ขึ้นต้นตรงตำแหน่งที่ start_ok ยอม ประกอบด้วยอักขระที่ part ยอม และ want ยอมทั้งชิ้น · ใช้แทน regex ที่มองย้อนหลัง
pub(crate) fn replace_tokens(text: &str, start_ok: impl Fn(&[char], usize) -> bool, part: impl Fn(char) -> bool, want: impl Fn(&str) -> bool, f: impl Fn(&str) -> String) -> String {
    replace_tokens_at(text, start_ok, part, want, |t, _| f(t))
}

/// แบบเดียวกับ replace_tokens แต่ส่งตำแหน่งอักษรแรกของชิ้นให้ด้วย · คำซ้ำในบรรทัดเดียวกันจึงไม่ไปใช้ตำแหน่งของคำแรก (ผู้ช่วยตรวจทาน R22)
pub(crate) fn replace_tokens_at(text: &str, start_ok: impl Fn(&[char], usize) -> bool, part: impl Fn(char) -> bool, want: impl Fn(&str) -> bool, f: impl Fn(&str, usize) -> String) -> String {
    let c: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if part(c[i]) && start_ok(&c, i) {
            let mut j = i;
            while j < c.len() && part(c[j]) { j += 1; }
            let tok: String = c[i..j].iter().collect();
            if want(&tok) { out.push_str(&f(&tok, i)); } else { out.push_str(&tok); }
            i = j;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

pub(crate) fn has_lone_slash(t: &str) -> bool {
    let c: Vec<char> = t.chars().collect();
    (0..c.len()).any(|i| c[i] == '/' && (i == 0 || c[i - 1].is_whitespace() || c[i - 1] == '>') && (i + 1 == c.len() || c[i + 1].is_whitespace() || c[i + 1] == '<'))
}

/// / ข้างตัวเลข หรือระหว่างคำตัวใหญ่ล้วนสองคำ คือตัวคั่น · ตาม IsSeparatorSlash
pub(crate) fn separator_slash(c: &[char], idx: usize) -> bool {
    let (b, a) = (neighbour(c, idx, -1), neighbour(c, idx, 1));
    if b.chars().any(crate::ocr::nocr_text::is_digit) || a.chars().any(crate::ocr::nocr_text::is_digit) { return true; }
    let caps = |w: &str| w.chars().any(|x| x.is_uppercase()) && w.chars().all(|x| !x.is_lowercase() || x == 'l');
    caps(&b) && caps(&a)
}

fn neighbour(c: &[char], idx: usize, dir: i64) -> String {
    let mut i = idx as i64 + dir;
    while i >= 0 && (i as usize) < c.len() {
        let ch = c[i as usize];
        if ch.is_whitespace() { i += dir; }
        else if dir < 0 && ch == '>' { match (0..i as usize).rev().find(|&k| c[k] == '<') { Some(o) => i = o as i64 - 1, None => break } }
        else if dir > 0 && ch == '<' { match (i as usize..c.len()).find(|&k| c[k] == '>') { Some(cl) => i = cl as i64 + 1, None => break } }
        else { break; }
    }
    let mut end = i;
    while end >= 0 && (end as usize) < c.len() && !c[end as usize].is_whitespace() && c[end as usize] != '<' && c[end as usize] != '>' { end += dir; }
    if dir < 0 { if i < 0 { return String::new(); } c[(end + 1) as usize..=i as usize].iter().collect() } else { if i as usize >= c.len() { return String::new(); } c[i as usize..end as usize].iter().collect() }
}

pub(crate) fn sentence_start(text: &str, byte_idx: usize) -> bool {
    let c: Vec<char> = text[..byte_idx].chars().collect();
    let mut i = c.len() as i64 - 1;
    while i >= 0 {
        let ch = c[i as usize];
        if ch == '>' { match (0..i as usize).rev().find(|&k| c[k] == '<') { Some(o) => { i = o as i64 - 1; continue; } None => return false } }
        if ch.is_whitespace() || matches!(ch, '-' | '–' | '"' | '\'' | '“' | '‘' | '«' | '(' | '[') { i -= 1; continue; }
        return matches!(ch, '.' | '!' | '?' | '…' | ':');
    }
    true
}

/// ในชุดตัวใหญ่ l เป็น I · ไม่เช่นนั้น I หลังตัวเล็ก หรือตัวที่สองระหว่างตัวใหญ่กับตัวเล็ก เป็น l (Mc Mac ยกเว้น) · ตาม TryFixBarMisreadByCase
pub fn bar_misread_by_case(word: &str) -> Option<String> {
    if !word.contains('I') && !word.contains('l') { return None; }
    let mut c: Vec<char> = word.chars().collect();
    let mut start = 0;
    while start < c.len() {
        if !is_letter(c[start]) { start += 1; continue; }
        let mut end = start;
        while end < c.len() && is_letter(c[end]) { end += 1; }
        fix_bars(&mut c, start, end);
        start = end;
    }
    let f: String = c.iter().collect();
    (f != word).then_some(f)
}

fn fix_bars(c: &mut [char], s: usize, e: usize) {
    let (mut up, mut lo, mut bars) = (0, 0, 0);
    for &ch in &c[s..e] { if ch == 'l' { bars += 1 } else if ch.is_uppercase() { up += 1 } else if ch.is_lowercase() { lo += 1 } }
    if bars > 0 && lo == 0 && (up >= 2 || (up == 1 && c[s] == 'l')) { for ch in &mut c[s..e] { if *ch == 'l' { *ch = 'I'; } } return; }
    if lo == 0 && bars == 0 { return; }
    for i in s..e {
        if c[i] != 'I' { continue; }
        if i > s && c[i - 1].is_lowercase() {
            let mc = i - s >= 2 && c[i - 2] == 'M' && c[i - 1] == 'c';
            let mac = i - s >= 3 && c[i - 3] == 'M' && c[i - 2] == 'a' && c[i - 1] == 'c';
            if !mc && !mac { c[i] = 'l'; }
        } else if i == s + 1 && c[s].is_uppercase() {
            let mut j = i;
            while j < e && c[j] == 'I' { j += 1; }
            if j < e && c[j].is_lowercase() { for ch in &mut c[i..j] { *ch = 'l'; } }
        }
    }
}

/// "20. 000" เป็น "20.000" · ตาม FixSpacedThousandsSeparator
pub fn fix_spaced_thousands(t: &str) -> String {
    if !t.contains(". ") { return t.into(); }
    let c: Vec<char> = t.chars().collect();
    let d = |i: usize| c.get(i).is_some_and(|x| x.is_ascii_digit());
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '.' && c.get(i + 1) == Some(&' ') && d(i + 2) && d(i + 3) && d(i + 4) && !d(i + 5) {
            let mut k = i;
            while k > 0 && c[k - 1].is_ascii_digit() { k -= 1; }
            let n = i - k;
            let before_ok = k == 0 || !(c[k - 1].is_ascii_digit() || c[k - 1] == '.' || c[k - 1] == ',');
            if (1..=3).contains(&n) && before_ok { out.push('.'); i += 2; continue; }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// ช่องหน้าเครื่องหมายคำพูดปิดหลังจบประโยค · ฝรั่งเศสคงช่องหน้า » · ตาม FixSpaceBeforeClosingQuote
pub fn fix_space_before_closing_quote(t: &str, french: bool) -> String {
    if !t.contains(' ') { return t.into(); }
    let keep = french || t.contains('«');
    let c: Vec<char> = t.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if matches!(c[i], '.' | '!' | '?' | '…') && c.get(i + 1) == Some(&' ') && c.get(i + 2).is_some_and(|q| matches!(q, '"' | '\'' | '”' | '’' | '»'))
            && c.get(i + 3).is_none_or(|n| n.is_whitespace() || *n == '<') && !(keep && c[i + 2] == '»') {
            out.push(c[i]);
            out.push(c[i + 2]);
            i += 3;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// อะพอสทรอฟีโค้งเป็นตัวตรง เว้นแต่มีทั้งเปิดและปิด (อัญประกาศ) · ตาม NormalizeApostrophes
pub fn normalize_apostrophes(t: &str) -> String {
    if t.contains('‘') == t.contains('’') { return t.into(); }
    t.replace("'‘", "'").replace("‘'", "'").replace("'’", "'").replace("’'", "'").replace(['‘', '’'], "'")
}

/// ". . ." เป็น "..." ที่ไม่ติดจุดอื่น · ตาม NormalizeSpacedEllipses
pub fn normalize_spaced_ellipses(t: &str) -> String {
    if !t.contains(". . .") { return t.into(); }
    let c: Vec<char> = t.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        let hit = i + 5 <= c.len() && c[i..i + 5] == ['.', ' ', '.', ' ', '.'] && !(i > 0 && matches!(c[i - 1], '.' | '…')) && !c.get(i + 5).is_some_and(|x| matches!(x, '.' | '…'));
        if hit { out.push_str("..."); i += 5; continue; }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// แยกบรรทัดเป็นคำ ช่องว่าง แท็ก และเครื่องหมาย · ตาม SplitLine
pub fn split_line(line: &str, index: usize) -> LineFix {
    let mut res = LineFix { line: index, ..Default::default() };
    let c: Vec<char> = line.chars().collect();
    let mk = |kind, idx, s: &[char]| Part { kind, index: idx, word: s.iter().collect(), fixed: String::new(), ok: None, guess_used: false, replacement: None };
    let mut i = 0;
    while i < c.len() {
        if c[i] == '<' {
            if let Some(e) = (i + 1..c.len()).find(|&k| c[k] == '>') { res.parts.push(mk(PartKind::Tag, i, &c[i..=e])); i = e + 1; continue; }
        }
        if i + 1 < c.len() && c[i] == '{' && c[i + 1] == '\\' {
            if let Some(e) = (i..c.len()).find(|&k| c[k] == '}') { res.parts.push(mk(PartKind::Tag, i, &c[i..=e])); i = e + 1; continue; }
        }
        if c[i].is_whitespace() {
            let s = i;
            while i < c.len() && c[i].is_whitespace() { i += 1; }
            res.parts.push(mk(PartKind::Whitespace, s, &c[s..i]));
            continue;
        }
        if is_lod(c[i]) && c[i] != '"' {
            let s = i;
            while i < c.len() && (is_lod(c[i]) || matches!(c[i], '\'' | '’' | '-')) { i += 1; }
            res.parts.push(mk(PartKind::Word, s, &c[s..i]));
            continue;
        }
        let s = i;
        i += 1;
        while i < c.len() && !is_lod(c[i]) && !c[i].is_whitespace() && c[i] != '<' && !(i + 1 < c.len() && c[i] == '{' && c[i + 1] == '\\') { i += 1; }
        res.parts.push(mk(PartKind::Special, s, &c[s..i]));
    }
    res
}

/// คำที่มีอักษรไทย คานะ คันจิ หรือฮันกึล · ไม่มีพจนานุกรมที่ตรวจคำแบบนี้ได้ (ไทยไม่เว้นวรรคระหว่างคำ ญี่ปุ่นจีนต่อกันทั้งวลี) จึงนับว่ารู้จัก
/// เดิม PaddleOCR แบบหลายภาษาได้พจนานุกรม en_US ซับญี่ปุ่นทุกบรรทัดเป็นคำที่ไม่รู้จัก ตัวชี้จุดสงสัยแยกบรรทัดที่ผิดจริงไม่ออก (ผู้ช่วยตรวจทาน T3)
pub fn no_dict_script(w: &str) -> bool {
    w.chars().any(|c| matches!(c, '\u{0E00}'..='\u{0E7F}' | '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7AF}' | '\u{FF66}'..='\u{FF9F}'))
}

/// ขีดหน้าบทพูดที่ตัวอ่านทีละบรรทัดแยกเป็นบรรทัดของตัวเอง ต่อกลับเข้าบรรทัดข้อความ · จำนวนขีดเท่าบรรทัดที่ขาดขีด เติมทุกบรรทัดที่ขาด
/// ไม่เท่า ต่อเข้าบรรทัดถัดไป · ตาม OcrLoneDashFixer.FixLoneDashes (Subtitle Edit ใช้กับ Google Lens · ชั้นหนังใช้กับ PaddleOCR Tesseract)
pub fn fix_lone_dashes(text: &str) -> String {
    if !text.contains('-') { return text.into(); }
    let lines: Vec<&str> = text.split("\r\n").flat_map(|l| l.split(['\r', '\n'])).collect();
    let lone = |l: &str| l.trim() == "-";
    let dashes = lines.iter().filter(|l| lone(l)).count();
    if dashes == 0 { return text.into(); }
    let texts: Vec<&str> = lines.iter().copied().filter(|l| !lone(l)).collect();
    if texts.is_empty() { return text.into(); }
    let missing = texts.iter().filter(|l| !l.trim_start().starts_with('-')).count();
    if dashes == missing {
        return texts.iter().map(|l| if l.trim_start().starts_with('-') { l.to_string() } else { format!("- {}", l.trim_start()) }).collect::<Vec<_>>().join("\n");
    }
    let mut out: Vec<String> = vec![];
    let mut i = 0;
    while i < lines.len() {
        if lone(lines[i]) && i + 1 < lines.len() && !lone(lines[i + 1]) { out.push(format!("- {}", lines[i + 1].trim_start())); i += 2; continue; }
        out.push(lines[i].to_string());
        i += 1;
    }
    out.join("\n")
}

const STANDALONE_NEIGHBOURS: &str = ".,!?:;\"'()[]-…♪♫¿¡“”„‘’«»—–";

/// คำที่ล้อมด้วยช่องว่าง แท็ก ขอบบรรทัด หรือเครื่องหมายวรรคตอนธรรมดา · ตาม IsStandaloneWord
pub(crate) fn standalone(res: &LineFix, idx: usize) -> bool {
    let ok = |i: i64| -> bool {
        if i < 0 || i as usize >= res.parts.len() { return true; }
        let p = &res.parts[i as usize];
        p.kind != PartKind::Special || p.word.chars().all(|c| STANDALONE_NEIGHBOURS.contains(c))
    };
    ok(idx as i64 - 1) && ok(idx as i64 + 1)
}

