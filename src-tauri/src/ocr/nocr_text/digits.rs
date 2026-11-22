//! แก้เลขศูนย์กับตัว O และตัวที่หน้าตาเหมือนตัวเลข
//! แยกจาก nocr_text/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

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
pub(crate) fn words_with_zero(t: &str) -> String {
    let c: Vec<char> = t.chars().collect();
    // นับเป็นคำเฉพาะอักษรละติน กรีก ซีริลลิก ที่ 0 กับ O หน้าเหมือนกัน · 第0話 กับ ห้อง0 ไม่เปลี่ยนเลขศูนย์เป็น o (ผู้ช่วยตรวจทาน T15)
    let latin = |x: char| is_letter(x) && (x as u32) < 0x0530;
    let part = |x: char| latin(x) || x == '0';
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

