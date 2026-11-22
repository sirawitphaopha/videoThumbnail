//! ระบบชี้จุดสงสัย (แผน OCR ขั้น 9 · BUGS ข้อ 143 คำเคาะ ㉝) บอกบรรทัดที่ควรตรวจก่อนบันทึก ตัวหลักเป็นตัวสร้างไฟล์ ตัวอื่นชี้จุดอย่างเดียว
//! ① ตัวช่วยอ่านภาพเดียวกันได้ไม่ตรงกับตัวหลัก ② คำที่ตัวแก้คำไม่รู้จัก ③ ชื่อเดียวกันเขียนสองแบบในไฟล์เดียวกัน ④ ค่าความมั่นใจต่ำ ⑤ มี * ที่อ่านไม่ออก
//! ไม่ได้แปลจากโปรแกรมอื่น เป็นของที่ชั้นหนังเพิ่มเอง

#![allow(dead_code)]

use serde::Serialize;
use std::collections::HashMap;

/// เหตุที่บรรทัดนี้น่าสงสัย
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Reason {
    /// ตัวช่วยชื่อ engine อ่านได้ text
    Disagree { engine: String, text: String },
    /// คำที่ไม่รู้จัก
    Unknown { words: Vec<String> },
    /// คำนี้คล้ายชื่อ other ที่พบบ่อยกว่าในไฟล์ (count ครั้ง)
    NameVariant { word: String, other: String, count: usize },
    /// ค่าความมั่นใจของตัวหลัก (0 ถึง 1)
    LowConf { conf: f32 },
    /// มี * ที่ตัวอ่านใส่แทนตัวที่อ่านไม่ออก
    Unreadable,
    /// อ่านไม่ได้ข้อความเลย
    Empty,
}

/// เกณฑ์ค่าความมั่นใจตั้งต้นของ PaddleOCR · วัดวันที่ 16 พ.ย. 2569 ค่าความมั่นใจแยกภาพผิดกับภาพถูกไม่ออก
/// ACCA ภาพผิด 9 ภาพได้ 0.977 ถึง 0.9999 · ซับไทยภาพผิด 6 ภาพได้ 0.878 ถึง 0.994 ภาพถูก 11 ภาพได้ 0.898 ถึง 0.994
/// เกณฑ์จึงเป็นตาข่ายชั้นสุดท้ายสำหรับภาพที่ต่ำผิดปกติเท่านั้น (ACCA ต่ำกว่าเกณฑ์ 1 ภาพ ไทย 2 ภาพ) ตัวจับหลักคือตัวช่วยอ่านไม่ตรงกับคำที่ไม่รู้จัก
pub const CONF_MIN: f32 = 0.90;

fn remove_tags(s: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in s.chars() { match c { '<' => tag = true, '>' if tag => tag = false, _ if !tag => out.push(c), _ => {} } }
    out
}

/// ข้อความสำหรับเทียบ ไม่นับแท็ก ช่องว่าง (ไทยไม่เว้นวรรคระหว่างคำ ตัวอ่านเว้นไม่เท่ากัน) และรูปเครื่องหมายคำพูด
pub fn norm(s: &str) -> String {
    remove_tags(s).replace(['“', '”', '„'], "\"").replace(['‘', '’', '`', '´'], "'").replace('…', "...").chars().filter(|c| !c.is_whitespace()).collect()
}

/// สองตัวอ่านได้ข้อความเดียวกันไหม
pub fn same_text(a: &str, b: &str) -> bool { norm(a) == norm(b) }

/// ชี้เหตุของหนึ่งบรรทัด · helpers ผลของตัวช่วยแต่ละตัว (ชื่อ ข้อความ) · unknown คำที่ไม่รู้จักจากตัวแก้คำ · conf ค่าความมั่นใจของตัวหลัก
pub fn check_line(primary: &str, conf: Option<f32>, helpers: &[(String, String)], unknown: &[String], conf_min: f32) -> Vec<Reason> {
    let mut r = vec![];
    if norm(primary).is_empty() { r.push(Reason::Empty); }
    if primary.contains('*') { r.push(Reason::Unreadable); }
    if !unknown.is_empty() { r.push(Reason::Unknown { words: unknown.to_vec() }); }
    if let Some(c) = conf { if c < conf_min { r.push(Reason::LowConf { conf: c }); } }
    for (engine, text) in helpers {
        if !same_text(primary, text) { r.push(Reason::Disagree { engine: engine.clone(), text: text.clone() }); }
    }
    r
}

fn lev(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() { cur[j + 1] = (prev[j] + (ca != cb) as usize).min(prev[j + 1] + 1).min(cur[j] + 1); }
        prev = cur;
    }
    prev[b.len()]
}

/// คำที่ขึ้นต้นตัวใหญ่ซึ่งไม่ได้อยู่ต้นประโยค (น่าจะเป็นชื่อ) ของหนึ่งบรรทัด
fn name_like(line: &str) -> Vec<String> {
    let t = remove_tags(line);
    let mut out = vec![];
    let mut sentence_start = true;
    for w in t.split_whitespace() {
        let core: String = w.chars().filter(|c| c.is_alphabetic() || *c == '\'').collect::<String>().trim_matches('\'').to_string();
        let first_upper = core.chars().next().is_some_and(|c| c.is_uppercase());
        let all_upper = core.chars().all(|c| !c.is_lowercase());
        if !sentence_start && first_upper && !all_upper && core.chars().count() >= 4 { out.push(core.trim_end_matches("'s").to_string()); }
        sentence_start = w.ends_with(['.', '!', '?', ':']) || w.trim_start_matches(['-', '"']).is_empty();
    }
    out
}

/// ชื่อเดียวกันเขียนสองแบบในไฟล์ · คำคล้ายชื่อที่ต่างกันหนึ่งตัวอักษร (สองตัวเมื่อยาวตั้งแต่ 8) ตัวแรกเหมือนกัน
/// แบบที่พบน้อยกว่าถูกชี้ เท่ากันชี้ทั้งคู่ · คืนเหตุของทุกบรรทัดตามลำดับ (ภาษาที่ไม่มีตัวใหญ่ไม่มีผล)
pub fn name_variants(lines: &[String]) -> Vec<Vec<Reason>> {
    let per: Vec<Vec<String>> = lines.iter().map(|l| name_like(l)).collect();
    let mut count: HashMap<String, usize> = HashMap::new();
    for ws in &per { for w in ws { *count.entry(w.clone()).or_default() += 1; } }
    let words: Vec<(String, usize)> = count.into_iter().collect();
    let mut flag: HashMap<String, (String, usize)> = HashMap::new();
    for (a, ca) in &words {
        for (b, cb) in &words {
            if a == b { continue; }
            let (ac, bc): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
            if ac[0].to_lowercase().ne(bc[0].to_lowercase()) { continue; }
            let limit = if ac.len().max(bc.len()) >= 8 { 2 } else { 1 };
            if lev(&ac, &bc) > limit { continue; }
            if ca <= cb && flag.get(a).is_none_or(|f| f.1 < *cb) { flag.insert(a.clone(), (b.clone(), *cb)); }
        }
    }
    per.iter().map(|ws| {
        let mut r = vec![];
        for w in ws { if let Some((o, c)) = flag.get(w) { let x = Reason::NameVariant { word: w.clone(), other: o.clone(), count: *c }; if !r.contains(&x) { r.push(x); } } }
        r
    }).collect()
}

#[cfg(test)]
#[path = "suspect_tests.rs"]
mod tests;
