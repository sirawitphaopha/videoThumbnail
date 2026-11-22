//! เดาการแยกคำที่เขียนติดกันจากตัวอักษร (แผน OCR ขั้น 8 · BUGS ข้อ 143) คำเล็กที่พบบ่อย คำเติมหน้าหลัง และรอยต่อพยัญชนะ
//! ผลเป็นแค่ตัวเลือก ตัวแก้คำรับเฉพาะตัวที่พจนานุกรมรู้จัก
//!
//! แปลจาก src/libuilogic/Ocr/FixEngine/UnknownWordGuesser.cs ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

const VOWELS: &str = "aeiouæøåöüäéèêëàâîïôûùyąęół";
const RESTRICTED: [&str; 6] = ["dan", "eng", "swe", "deu", "pol", "fra"];
const COMPOUNDING: [&str; 16] = ["nld", "dut", "deu", "ger", "afr", "dan", "nor", "nob", "nno", "swe", "isl", "ice", "fin", "fao", "fry", "ltz"];
const COMPOUNDING2: [&str; 2] = ["hun", "est"];

fn affixes(l: &str) -> &'static [&'static str] {
    match l {
        "eng" => &["ing", "ed", "ly", "ment", "ness", "pre", "anti", "tion", "sion"],
        "deu" => &["ung", "keit", "heit", "schaft", "ent", "ge", "be", "ver"],
        "pol" => &["ski", "ska", "czy", "nie", "cze", "ość", "ania", "enia"],
        "fra" => &["ment", "tion", "age", "ance", "ence", "able", "isme"],
        "dan" => &["else", "ning", "hed", "skab", "ende"],
        "swe" => &["ning", "het", "skap", "ande", "else"],
        _ => &[],
    }
}

fn particles(l: &str) -> &'static [&'static str] {
    match l { "eng" => &["of", "the", "to", "in", "it", "is", "and"], "dan" => &["og", "af", "er", "en", "et", "de"], "deu" => &["der", "die", "das", "und", "zu", "in"], _ => &[] }
}

fn vowel(c: char) -> bool { c.to_lowercase().next().is_some_and(|l| VOWELS.contains(l)) }

fn insert_space(c: &[char], at: usize) -> String { c[..at].iter().chain(std::iter::once(&' ')).chain(c[at..].iter()).collect() }

fn starts_ci(c: &[char], p: &str) -> bool { let p: Vec<char> = p.chars().collect(); c.len() >= p.len() && c[..p.len()].iter().collect::<String>().to_lowercase() == p.iter().collect::<String>().to_lowercase() }
fn ends_ci(c: &[char], p: &str) -> bool { let p: Vec<char> = p.chars().collect(); c.len() >= p.len() && c[c.len() - p.len()..].iter().collect::<String>().to_lowercase() == p.iter().collect::<String>().to_lowercase() }

/// ตัวเลือกการแยกคำ · ตาม CreateGuessesFromLetters
pub fn guesses_from_letters(word: &str, lang3: &str) -> Vec<String> {
    let c: Vec<char> = word.chars().collect();
    if word.trim().is_empty() || c.len() < 4 { return vec![]; }
    if c[0].is_uppercase() && c.len() < 10 && c[1..].iter().all(|x| x.is_lowercase()) { return vec![]; }
    let lang = lang3.to_lowercase();
    let mut res: Vec<String> = vec![];
    let mut push = |s: String| { if !res.iter().any(|x| x.to_lowercase() == s.to_lowercase()) { res.push(s); } };
    for p in particles(&lang) {
        let n = p.chars().count();
        if c.len() >= n + 2 {
            if starts_ci(&c, p) { push(insert_space(&c, n)); }
            if ends_ci(&c, p) { push(insert_space(&c, c.len() - n)); }
        }
    }
    for a in affixes(&lang) {
        let n = a.chars().count();
        if c.len() > n + 2 {
            if ends_ci(&c, a) { push(insert_space(&c, c.len() - n)); }
            if starts_ci(&c, a) { push(insert_space(&c, n)); }
        }
    }
    if c.len() > 7 && !COMPOUNDING.contains(&lang.as_str()) && !COMPOUNDING2.contains(&lang.as_str()) {
        for i in 3..c.len().saturating_sub(3) {
            if !c[i].is_alphabetic() || !c[i - 1].is_alphabetic() { continue; }
            let (v, pv) = (vowel(c[i]), vowel(c[i - 1]));
            if (!v && !pv) || ((c[i - 1] == 's' || c[i - 1] == 'n') && !v) { push(insert_space(&c, i)); }
        }
    }
    if RESTRICTED.contains(&lang.as_str()) {
        res.retain(|s| s.split(' ').filter(|p| !p.is_empty()).all(|p| { let mut it = p.chars(); !matches!((it.next(), it.next()), (Some(ch), None) if ch.is_alphabetic() && !vowel(ch)) }));
    }
    res
}

#[cfg(test)]
#[path = "ocrfix_guess_tests.rs"]
mod tests;
