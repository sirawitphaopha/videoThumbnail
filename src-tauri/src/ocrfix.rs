//! ตัวแก้คำ OCR (แผน OCR ขั้น 8 · BUGS ข้อ 143) แก้ข้อความที่ตัวอ่านพลาดด้วยรายการแก้คำกับพจนานุกรม Hunspell แล้วบอกคำที่ไม่รู้จัก
//! แก้ทั้งบรรทัดด้วยรายการแก้คำ (ocrfix_list.rs) แยกคำ แล้วตรวจทีละคำ คำที่ไม่รู้จักลองแก้แบบที่ตัวจับคู่ภาพพลาดบ่อย
//! (l กับ i ตัวเอียง สระมีเครื่องหมายที่คล้ายกัน # แทนอะพอสทรอฟี / แทน l คำติดกัน * ที่อ่านไม่ออก) รับเฉพาะผลที่พจนานุกรมหรือรายชื่อรู้จัก
//! ภาษาที่ไม่มีพจนานุกรม (ไทย) แก้ได้แค่รายการแก้คำ ไม่ชี้คำที่ไม่รู้จัก (คำเคาะ ㉘ ตรวจคำผิดไทยทำทีหลัง)
//!
//! แปลจาก src/libuilogic/Ocr/FixEngine/OcrFixEngine.cs OcrFixLineResult.cs OcrFixLinePartResult.cs และ StrippableText
//! (src/libse/Common/StrippableText.cs) ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

use crate::ocrfix_list::ReplaceList;
use crate::ocrfix_words::WordLists;
use std::collections::{HashMap, HashSet};
use std::path::Path;

// ---------------------------------------------------------------- ตัวตรวจคำ

/// ตัวตรวจคำ · ตาม ISpellChecker
pub trait Spell: Send + Sync {
    fn correct(&self, w: &str) -> bool;
    fn suggest(&self, w: &str) -> Vec<String>;
}

/// พจนานุกรม Hunspell (.aff .dic) ผ่านห้องสมุด spellbook
pub struct Hunspell(spellbook::Dictionary);

impl Hunspell {
    pub fn open(aff: &Path, dic: &Path) -> Result<Self, String> {
        let a = std::fs::read_to_string(aff).map_err(|e| format!("อ่านไฟล์พจนานุกรม {} ไม่ได้ {e}", aff.display()))?;
        let d = std::fs::read_to_string(dic).map_err(|e| format!("อ่านไฟล์พจนานุกรม {} ไม่ได้ {e}", dic.display()))?;
        spellbook::Dictionary::new(&a, &d).map(Hunspell).map_err(|e| format!("ไฟล์พจนานุกรมอ่านไม่ออก {e}"))
    }
}

impl Spell for Hunspell {
    fn correct(&self, w: &str) -> bool { !w.is_empty() && self.0.check(w) }
    fn suggest(&self, w: &str) -> Vec<String> { let mut v = vec![]; self.0.suggest(w, &mut v); v }
}

/// ไม่มีพจนานุกรม ไม่มีคำไหนผ่าน (แบบ Subtitle Edit ที่ไม่ได้เลือกพจนานุกรม)
pub struct NoSpell;
impl Spell for NoSpell {
    fn correct(&self, _: &str) -> bool { false }
    fn suggest(&self, _: &str) -> Vec<String> { vec![] }
}

// ---------------------------------------------------------------- ผลแก้

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PartKind { Word, Whitespace, Tag, Special }

/// ชิ้นหนึ่งของบรรทัด · ตาม OcrFixLinePartResult
#[derive(Clone, Debug)]
pub struct Part {
    pub kind: PartKind,
    pub index: usize,
    pub word: String,
    pub fixed: String,
    pub ok: Option<bool>,
    pub guess_used: bool,
    /// คู่ที่รายการแก้คำเปลี่ยน (เดิม ใหม่)
    pub replacement: Option<(String, String)>,
}

/// ผลแก้หนึ่งบรรทัด · ตาม OcrFixLineResult
#[derive(Clone, Debug, Default)]
pub struct LineFix { pub line: usize, pub parts: Vec<Part>, pub replacement: Option<(String, String)> }

impl LineFix {
    pub fn text(&self) -> String { self.parts.iter().map(|p| if p.fixed.is_empty() { p.word.as_str() } else { p.fixed.as_str() }).collect() }
    /// คำที่ไม่รู้จัก
    pub fn unknown(&self) -> Vec<&Part> { self.parts.iter().filter(|p| p.kind == PartKind::Word && p.ok == Some(false)).collect() }
    /// คำที่เดาแก้
    pub fn guesses(&self) -> Vec<(&str, &str)> { self.parts.iter().filter(|p| p.guess_used).map(|p| (p.word.as_str(), p.fixed.as_str())).collect() }
}

/// บรรทัดรอบข้างที่ตัวแก้ต้องรู้ · prev ข้อความของบรรทัดก่อนที่อ่านแล้ว (ตัวพิมพ์ใหญ่ต้นประโยค)
/// next_soon_lower บรรทัดถัดไปขึ้นภายใน 600 ms และขึ้นต้นด้วยตัวเล็ก (กฎลงท้ายบรรทัดไม่เติมจุด · ตาม SkipAddLineEnding)
#[derive(Default, Clone, Copy)]
pub struct Ctx<'a> { pub prev: Option<&'a str>, pub next_soon_lower: bool }

impl<'a> Ctx<'a> {
    /// จากเวลาของบรรทัดนี้กับบรรทัดถัดไป (มิลลิวินาที) และข้อความถัดไป
    pub fn new(prev: Option<&'a str>, end_ms: f64, next: Option<(f64, &str)>) -> Self {
        let next_soon_lower = next.is_some_and(|(start, t)| {
            let t = remove_tags(t);
            start - end_ms <= 600.0 && t.chars().next().is_some_and(|c| c.is_alphabetic() && c.to_lowercase().next() == Some(c))
        });
        Ctx { prev, next_soon_lower }
    }
}

// ---------------------------------------------------------------- ข้อความตัดหัวท้าย

/// ข้อความที่ตัดเครื่องหมายกับแท็กหน้าหลังออก · ตาม StrippableText
pub struct Strippable { pub pre: String, pub text: String, pub post: String }

impl Strippable {
    pub fn new(input: &str) -> Self { Self::with(input, " >-\"„”“['‘`´¶(♪¿¡.…—", " -\"”“]'`´¶)♪.!?:…—؛،؟") }
    pub fn with(input: &str, s_start: &str, s_end: &str) -> Self {
        let c: Vec<char> = input.chars().collect();
        let (mut start, mut end) = (0usize, c.len());
        let find = |ch: char, from: usize| (from..c.len()).find(|&i| c[i] == ch);
        if end > 0 && (c[0] == '<' || c[0] == '{' || s_start.contains(c[0])) {
            loop {
                let begin = start;
                while start < end && s_start.contains(c[start]) { start += 1; }
                if let Some(e) = find('}', start) {
                    if e > start && start + 1 < end && c[start] == '{' && c[start + 1] == '\\' {
                        let next = if start + 2 < end { find('{', start + 2) } else { None };
                        if next.is_none_or(|n| n > e) { start = e + 1; }
                    }
                }
                if start < end && c[start] == '<' { if let Some(e) = find('>', start) { if e - start >= 2 { start = e + 1; } } }
                if start <= begin { break; }
            }
        }
        let ends_with = |end: usize, tag: &str| { let t: Vec<char> = tag.chars().collect(); end >= t.len() && c[end - t.len()..end] == t[..] };
        if end > start && (c[end - 1] == '>' || s_end.contains(c[end - 1])) {
            loop {
                let begin = end;
                while end > start && s_end.contains(c[end - 1]) { end -= 1; }
                if end > start && c[end - 1] == '>' {
                    if end - start >= 4 && (ends_with(end, "</i>") || ends_with(end, "</b>") || ends_with(end, "</u>")) { end -= 4; }
                    if end - start >= 7 && ends_with(end, "</font>") { end -= 7; }
                    if end > start && c[end - 1] == '>' {
                        if let Some(lt) = (start..end - 1).rev().find(|&i| c[i] == '<') {
                            let tag: String = c[lt + 1..end - 1].iter().collect();
                            if tag.starts_with("/c.") && !tag.contains(' ') && !tag.contains('\n') { end = lt; }
                        }
                    }
                }
                if end >= begin { break; }
            }
        }
        Strippable { pre: c[..start].iter().collect(), text: c[start..end].iter().collect(), post: c[end..].iter().collect() }
    }
}

/// คำแรกเริ่มด้วยที่อยู่เว็บ · ตาม HtmlUtil.StartsWithUrl
fn starts_with_url(t: &str) -> bool {
    let w = t.trim().trim_end_matches('.').split_whitespace().next().unwrap_or("").to_lowercase();
    w.starts_with("http://") || w.starts_with("https://") || w.starts_with("www.")
}

fn is_letter(c: char) -> bool { c.is_alphabetic() && !crate::nocr_text::is_digit(c) }
fn is_lod(c: char) -> bool { c.is_alphanumeric() }

// ---------------------------------------------------------------- ตัวแก้

/// ตัวแก้คำหนึ่งงาน · ตาม OcrFixEngine
pub struct FixEngine {
    pub lang3: String,
    pub lang2: String,
    spell: Box<dyn Spell>,
    pub lists: WordLists,
    pub replace: ReplaceList,
    split_list: Vec<String>,
    abbreviations: HashSet<String>,
    skip: HashSet<String>,
    change_all: HashMap<String, String>,
    /// เติม * ในคำเมื่อมีตัวอักษรเดียวที่ทำให้เป็นคำในพจนานุกรม (ใช้กับ nOCR Binary OCR)
    pub fill_unknown: bool,
    /// แก้ที่ตัวจับคู่ภาพพลาด # แทนอะพอสทรอฟี / แทน l ช่องหลังจุดพันในตัวเลข (ใช้กับ nOCR Binary OCR)
    pub image_misreads: bool,
    /// กฎในโค้ด (อะพอสทรอฟีโค้ง จุดสามจุดที่เว้นห่าง) · ค่าตั้งต้นเปิด
    pub hardcoded: bool,
    /// แยกคำติดด้วยรายการคำ · ค่าตั้งต้นปิดแบบ Subtitle Edit
    pub word_split: bool,
    /// มีพจนานุกรม (ไม่ใช่ NoSpell) · ไม่มีไม่ชี้คำที่ไม่รู้จัก
    pub dictionary: bool,
}

impl FixEngine {
    /// เตรียมตัวแก้ของภาษา (รหัสสามตัว เช่น eng tha) · dict_dir โฟลเดอร์รายการแก้คำและรายชื่อ · five ชื่อพจนานุกรม (en_US) ว่างคือไม่มี
    pub fn new(dict_dir: &Path, user_dir: &Path, lang3: &str, five: &str, spell: Box<dyn Spell>) -> Self {
        let lang2 = crate::ocrfix_words::two_letter(lang3);
        let lists = WordLists::load(dict_dir, user_dir, five);
        let split_list = crate::ocrfix_words::load_split_list(dict_dir, lang3, &lists.all_names());
        FixEngine {
            lang3: lang3.into(), lang2, spell, lists,
            replace: ReplaceList::from_lang(dict_dir, user_dir, lang3),
            split_list, abbreviations: crate::ocrfix_words::load_abbreviations(dict_dir, five),
            skip: HashSet::new(), change_all: HashMap::new(),
            fill_unknown: false, image_misreads: false, hardcoded: true, word_split: false, dictionary: !five.is_empty(),
        }
    }

    pub fn spell(&self) -> &dyn Spell { self.spell.as_ref() }

    /// แก้หนึ่งบรรทัด · ctx บรรทัดก่อนกับบรรทัดถัดไป · guess ลองเดาคำที่ไม่รู้จัก · ตาม FixOcrErrors
    pub fn fix(&self, index: usize, text: &str, ctx: &Ctx, guess: bool) -> LineFix {
        let prev = ctx.prev;
        let mut ignore: Vec<String> = vec![];
        let mut t = text.to_string();
        if self.fill_unknown { t = self.fill_unknown_chars(&t); }
        if self.image_misreads {
            t = self.fix_hash(&t);
            t = self.fix_slash(&t);
            t = fix_spaced_thousands(&t);
            t = fix_space_before_closing_quote(&t, matches!(self.lang3.as_str(), "fra" | "fre"));
        }
        let mut line = self.replace_line(index, &t, ctx.next_soon_lower, &mut ignore);
        if self.hardcoded { line = normalize_apostrophes(&line); line = normalize_spaced_ellipses(&line); }
        line = self.upper_after_sentence_end(&line, prev);
        let mut res = split_line(&line, index);
        if line != text { res.replacement = Some((text.into(), line.clone())); }
        for i in 0..res.parts.len() {
            if res.parts[i].kind != PartKind::Word {
                res.parts[i].fixed = res.parts[i].word.clone();
                res.parts[i].ok = Some(true);
                continue;
            }
            // ภาษาที่ไม่มีพจนานุกรม (ไทย) แก้ได้แค่รายการแก้คำ ไม่ชี้คำที่ไม่รู้จัก (คำเคาะ ㉘ ตรวจคำผิดไทยทำทีหลัง)
            if !self.dictionary {
                res.parts[i].fixed = self.replace.fix_common_word_errors(&res.parts[i].word);
                res.parts[i].ok = Some(true);
                continue;
            }
            if ignore.contains(&res.parts[i].word) { res.parts[i].ok = Some(true); continue; }
            self.check_word(&mut res, i, guess);
        }
        res
    }

    fn known(&self, w: &str, line: &str) -> bool {
        self.skip.contains(w) || self.spelled(w) || self.lists.has_name(w) || self.lists.has_user_word(w) || self.lists.has_name_extended(w, line)
    }

    fn replace_line(&self, index: usize, text: &str, next_soon_lower: bool, ignore: &mut Vec<String>) -> String {
        let ok = self.spelled(text);
        let line = self.replace.fix_line(text, next_soon_lower, index, self.spell(), ignore, ok, &|w| self.known(w, text));
        if self.lang2 == "fr" { crate::ocrfix_list::add_space_before_french_punctuation(&line) } else { line }
    }

    /// บรรทัดที่ตามหลังประโยคที่จบแล้วขึ้นต้นด้วยตัวใหญ่ เฉพาะเมื่อมั่นใจ · ตาม FixStartWithUppercaseLetterAfterSentenceEnd
    fn upper_after_sentence_end(&self, text: &str, prev: Option<&str>) -> String {
        if text.is_empty() { return text.into(); }
        let Some(prev) = prev else { return text.into() };
        if !self.confident_end(prev) { return text.into(); }
        let st = Strippable::new(text);
        let first_lower = st.text.chars().next().is_some_and(|c| c.is_lowercase());
        if st.text.is_empty() || !first_lower || st.pre.ends_with('[') || st.pre.ends_with('(') || st.pre.ends_with('\'')
            || st.pre.contains("...") || st.pre.contains('…') || starts_with_url(&st.text) { return text.into(); }
        let fw = first_word(&st.text);
        let mut up = fw.chars().next().unwrap().to_uppercase().next().unwrap();
        if up == 'L' && (fw == "l" || fw.starts_with("l'")) { up = 'I'; }
        let rest: String = fw.chars().skip(1).collect();
        let mut fixed = format!("{up}{rest}");
        if !self.spell.correct(&fixed) && !self.lists.has_name(&fixed) {
            let fc: Vec<char> = fw.chars().collect();
            let after = st.text.chars().nth(fc.len());
            if up != 'L' || fc.len() < 2 || !fc[1].is_lowercase() || after.is_some_and(is_lod) { return text.into(); }
            let iw = format!("I{rest}");
            if !self.spell.correct(&iw) && !self.lists.has_name(&iw) { return text.into(); }
            fixed = iw;
        }
        let tail: String = st.text.chars().skip(fw.chars().count()).collect();
        format!("{}{}{}{}", st.pre, fixed, tail, st.post)
    }

    fn confident_end(&self, prev: &str) -> bool {
        if prev.trim().is_empty() { return false; }
        let last = remove_tags(prev);
        let last = last.trim_matches(|c| matches!(c, '♪' | '♫' | ' '));
        if last.chars().count() < 2 || last.ends_with("...") { return false; }
        let l = last.chars().last().unwrap();
        if !matches!(l, '.' | '!' | '?') { return false; }
        l != '.' || !self.ends_with_abbreviation(last)
    }

    fn ends_with_abbreviation(&self, last: &str) -> bool {
        if self.abbreviations.is_empty() { return false; }
        let w = last.rsplit(' ').next().unwrap_or(last);
        self.abbreviations.contains(&w.to_lowercase())
    }

    /// ตรวจและแก้หนึ่งคำ · ตาม CheckAndFixWord
    fn check_word(&self, res: &mut LineFix, idx: usize, guess: bool) {
        let s = res.parts[idx].word.clone();
        let mut ok;
        let mut result;
        if let Some(c) = self.change_all.get(&s) {
            result = c.clone();
            ok = true;
        } else {
            result = self.replace.fix_common_word_errors(&s);
            if result != s { res.parts[idx].replacement = Some((s.clone(), result.clone())); }
            ok = self.spell.correct(&result);
            if result.contains(' ') {
                res.parts[idx].ok = Some(self.spelled(&result));
                res.parts[idx].fixed = result;
                return;
            }
            if !ok && (self.skip.contains(&s) || self.skip.contains(&result) || self.lists.has_user_word(&result) || self.lists.has_name(&result)) { ok = true; }
            let line = if ok { String::new() } else { res.text() };
            if !ok && self.lists.has_name_extended(&result, &line) { ok = true; }
            let mut w = result.trim_matches('-').to_string();
            let alt_ok = |w: &str| self.skip.contains(w) || self.spell.correct(w) || self.lists.has_name(w) || self.lists.has_name_extended(w, &line);
            if !ok && w != result && alt_ok(&w) { ok = true; }
            w = result.trim_matches('\'').to_string();
            if !ok && w != result && alt_ok(&w) { ok = true; }
            w = result.trim_matches(|c| matches!(c, '\'' | '"' | '-')).to_string();
            if !ok && w != result && alt_ok(&w) { ok = true; }
            if !ok && self.hyphenated_parts_ok(&result, &line) { ok = true; }
            if !ok { if let Some(f) = self.l_misread_as_i(&result) { result = f; res.parts[idx].guess_used = true; ok = true; } }
            if !ok && self.dutch_capital_accent(&result) { ok = true; }
            if !ok { if let Some(f) = self.accent_misread(&result) { result = f; res.parts[idx].guess_used = true; ok = true; } }
            if !result.is_empty() && !ok {
                let mut guesses: Vec<String> = vec![];
                let standalone = standalone(res, idx);
                if w.chars().count() > 4 && standalone && self.word_split {
                    let skip_in = self.lang3 == "eng" && w.ends_with("in") && result.contains(&format!("{w}'")) && self.do_spell(&format!("{w}g"));
                    if !skip_in {
                        let sw = crate::ocrfix_words::split_word(&self.split_list, &w, &self.lang3);
                        if sw != w && !self.misplaced_upper(&sw) { guesses.push(sw); }
                    }
                }
                if guess && standalone && self.word_split { guesses.extend(crate::ocrfix_guess::guesses_from_letters(&result, &self.lang3)); }
                if guess && w.chars().count() > 4 { guesses.extend(self.replace.guesses_from_letters(&result, &self.lang3)); }
                for g in guesses {
                    let gw = g.trim_matches(|c| matches!(c, '\'' | '"' | '-'));
                    if self.spelled(&g) || self.spelled(gw) || self.lists.has_name(gw) {
                        result = g;
                        res.parts[idx].guess_used = true;
                        ok = true;
                        break;
                    }
                }
            }
        }
        if !ok && self.image_misreads {
            if let Some(f) = bar_misread_by_case(&result) {
                result = f;
                res.parts[idx].guess_used = true;
                ok = self.spelled(&result) || self.lists.has_name(result.trim_matches(|c| matches!(c, '\'' | '-')));
            }
        }
        if !ok && self.image_misreads {
            if let Some(f) = self.split_at_overhang(&result) { result = f; res.parts[idx].guess_used = true; ok = true; }
        }
        res.parts[idx].fixed = result;
        res.parts[idx].ok = Some(ok);
    }

    fn split_at_overhang(&self, word: &str) -> Option<String> {
        let c: Vec<char> = word.chars().collect();
        if c.len() < 4 || !c.iter().all(|x| is_letter(*x)) { return None; }
        for i in 2.max(c.len().saturating_sub(3))..=c.len() - 2 {
            let (b, a) = (c[i - 1].to_lowercase().next().unwrap(), c[i].to_lowercase().next().unwrap());
            if !matches!(b, 'f' | 'r' | 't') || !matches!(a, 'j' | 'v' | 'w') { continue; }
            let (l, r): (String, String) = (c[..i].iter().collect(), c[i..].iter().collect());
            if self.word_or_name(&l) && self.word_or_name(&r) { return Some(format!("{l} {r}")); }
        }
        None
    }

    /// ทุกชุดของ i I ที่เปลี่ยนเป็น l (เปลี่ยนน้อยก่อน) รับชุดแรกที่พจนานุกรมหรือรายชื่อรู้จัก · คำห้าตัวขึ้นไป · ตาม TryFixLMisreadAsI
    fn l_misread_as_i(&self, word: &str) -> Option<String> {
        let c: Vec<char> = word.chars().collect();
        if c.len() < 5 { return None; }
        let mut pos = vec![];
        for (i, &ch) in c.iter().enumerate() {
            if ch == 'i' || ch == 'I' { pos.push(i); } else if !is_letter(ch) && ch != '\'' && ch != '-' { return None; }
        }
        if pos.is_empty() { return None; }
        let accept = |swap: &[usize]| -> Option<String> {
            let mut cc = c.clone();
            for &i in swap { cc[i] = 'l'; }
            let cand: String = cc.iter().collect();
            (self.spelled(&cand) || self.lists.has_name(cand.trim_matches(|x| matches!(x, '\'' | '-')))).then_some(cand)
        };
        if pos.len() > 6 {
            for &p in &pos { if let Some(f) = accept(&[p]) { return Some(f); } }
            return accept(&pos);
        }
        let total = 1u32 << pos.len();
        for size in 1..=pos.len() as u32 {
            for mask in 1..total {
                if mask.count_ones() != size { continue; }
                let swap: Vec<usize> = (0..pos.len()).filter(|b| mask & (1 << b) != 0).map(|b| pos[b]).collect();
                if let Some(f) = accept(&swap) { return Some(f); }
            }
        }
        None
    }

    fn dutch_capital_accent(&self, word: &str) -> bool {
        let c: Vec<char> = word.chars().collect();
        if self.lang2 != "nl" || c.len() < 3 || !"AEIOU".contains(c[0]) || (c[1] as u32) <= 127 || !c[1].is_lowercase() { return false; }
        if base_letter(c[1]) != c[0].to_lowercase().next().unwrap() { return false; }
        let rest: String = c[1..].iter().collect::<String>().to_lowercase();
        self.spelled(&format!("{}{}", c[1], rest))
    }

    fn accent_lookalikes(&self, c: char) -> Vec<char> {
        let mut v: Vec<char> = vec![];
        for g in ACCENT_GROUPS.iter().chain(ACCENT_CROSS.iter()) { if g.contains(c) { v.extend(g.chars()); } }
        let mut seen = HashSet::new();
        let v: Vec<char> = v.into_iter().filter(|x| *x != c && seen.insert(*x)).collect();
        let mut out: Vec<char> = v.iter().copied().filter(|x| (*x as u32) > 127).chain(v.iter().copied().filter(|x| (*x as u32) <= 127)).collect();
        if ["en", "id", "ms"].contains(&self.lang2.as_str()) && !"ìíîÌÍÎ".contains(c) { out.retain(|x| (*x as u32) > 127); }
        out
    }

    /// ลองสระมีเครื่องหมายที่คล้ายกัน (เปลี่ยนน้อยก่อน ไม่เกินสามตำแหน่ง) · ตาม TryFixAccentMisread
    fn accent_misread(&self, word: &str) -> Option<String> {
        let c: Vec<char> = word.chars().collect();
        if c.len() < 2 { return None; }
        let mut pos = vec![];
        for (i, &ch) in c.iter().enumerate() {
            if (ch as u32) > 127 && is_letter(ch) && !self.accent_lookalikes(ch).is_empty() { pos.push(i); }
            else if !is_letter(ch) && ch != '\'' && ch != '-' { return None; }
        }
        if pos.is_empty() || pos.len() > 3 { return None; }
        let alts: Vec<Vec<char>> = pos.iter().map(|&p| self.accent_lookalikes(c[p])).collect();
        let mut cc = c.clone();
        fn search(e: &FixEngine, c: &[char], cc: &mut Vec<char>, pos: &[usize], alts: &[Vec<char>], from: usize, changes: usize) -> Option<String> {
            if changes == 0 {
                let cand: String = cc.iter().collect();
                return (e.spelled(&cand) || e.lists.has_name(cand.trim_matches(|x| matches!(x, '\'' | '-')))).then_some(cand);
            }
            for k in from..pos.len() {
                for &a in &alts[k] { cc[pos[k]] = a; if let Some(f) = search(e, c, cc, pos, alts, k + 1, changes - 1) { return Some(f); } }
                cc[pos[k]] = c[pos[k]];
            }
            None
        }
        (1..=pos.len()).find_map(|n| search(self, &c, &mut cc, &pos, &alts, 0, n))
    }

    /// * กลางคำลองทุกตัวอักษร เปลี่ยนเมื่อมีคำในพจนานุกรมคำเดียว · * ท้ายคำไม่แตะ ช่องเกินสองหรืออักษรน้อยกว่าสามไม่แตะ · ตาม FillUnknownCharactersInWords
    pub fn fill_unknown_chars(&self, text: &str) -> String {
        if !text.contains('*') { return text.into(); }
        let c: Vec<char> = text.chars().collect();
        let part = |x: char| is_lod(x) || x == '\'' || x == '*';
        let mut out = String::new();
        let mut i = 0;
        while i < c.len() {
            if !part(c[i]) { out.push(c[i]); i += 1; continue; }
            let mut j = i;
            while j < c.len() && part(c[j]) { j += 1; }
            let m: String = c[i..j].iter().collect();
            i = j;
            if !m.contains('*') { out.push_str(&m); continue; }
            let word = m.trim_end_matches('*').to_string();
            let trailing = &m[word.len()..];
            let (mut gaps, mut letters, mut digit) = (0, 0, false);
            for ch in word.chars() { if ch == '*' { gaps += 1 } else if is_letter(ch) { letters += 1 } else if crate::nocr_text::is_digit(ch) { digit = true } }
            if digit || gaps == 0 || gaps > 2 || letters < 3 { out.push_str(&m); continue; }
            let mut chars: Vec<char> = word.chars().collect();
            let mut found: Option<String> = None;
            if !self.fill_gap(&mut chars, 0, &mut found) || found.is_none() { out.push_str(&m); continue; }
            out.push_str(&found.unwrap());
            out.push_str(trailing);
        }
        out
    }

    fn fill_gap(&self, chars: &mut Vec<char>, start: usize, found: &mut Option<String>) -> bool {
        let Some(gap) = (start..chars.len()).find(|&k| chars[k] == '*') else {
            let cand: String = chars.iter().collect();
            if cand.starts_with('\'') || cand.ends_with('\'') || !self.do_spell(&cand) { return true; }
            if let Some(f) = found { return f.to_lowercase() == cand.to_lowercase(); }
            *found = Some(cand);
            return true;
        };
        let set = if gap == 0 { "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" } else { "abcdefghijklmnopqrstuvwxyz'" };
        for ch in set.chars() {
            chars[gap] = ch;
            if !self.fill_gap(chars, gap + 1, found) { chars[gap] = '*'; return false; }
        }
        chars[gap] = '*';
        true
    }

    fn misplaced_upper(&self, split: &str) -> bool {
        split.split(' ').skip(1).any(|p| p.chars().next().is_some_and(|c| c.is_uppercase()) && p != "I" && !p.starts_with("I'") && !self.lists.has_name(p))
    }

    fn hyphenated_parts_ok(&self, word: &str, line: &str) -> bool {
        if word.find('-').is_none_or(|i| i == 0) { return false; }
        let parts: Vec<&str> = word.split('-').filter(|p| !p.is_empty()).collect();
        parts.len() >= 2 && parts.iter().all(|p| self.skip.contains(*p) || self.spell.correct(p) || self.lists.has_name(p) || self.lists.has_name_extended(p, line))
    }

    /// คำ หรือหลายคำที่คั่นด้วยเว้นวรรคหรือขีด ผ่านพจนานุกรมทุกส่วน · ตาม IsSpelledCorrect
    pub fn spelled(&self, s: &str) -> bool {
        if self.spell.correct(s) { return true; }
        if s.contains(' ') || s.contains('\n') {
            const TRIM: &[char] = &['¡', '¿', ',', '.', '!', '?', ':', ';', '(', ')', '[', ']', '{', '}', '+', '-', '£', '\\', '"', '”', '„', '“', '«', '»', '#', '&', '%', '\r', '\n', '؟'];
            return s.split([' ', '\r', '\n']).filter(|p| !p.is_empty()).all(|p| self.spell.correct(p.trim_matches(TRIM)));
        }
        if s.contains('-') { return s.split('-').filter(|p| !p.is_empty()).all(|p| self.spell.correct(p)); }
        false
    }

    fn word_or_name(&self, cand: &str) -> bool {
        let bare = cand.trim_matches(|c| matches!(c, '\'' | '’'));
        bare.chars().count() > 1 && (self.spelled(bare) || self.lists.has_name(bare))
    }

    pub fn do_spell(&self, w: &str) -> bool { self.spell.correct(w) }

    /// คำแนะนำ · คำที่ตัวใหญ่เกินครึ่งใส่คำแนะนำแรกแบบตัวใหญ่ไว้หน้า · ตาม GetSpellCheckSuggestions
    pub fn suggestions(&self, w: &str) -> Vec<String> {
        let mut s = self.spell.suggest(w);
        let letters = w.chars().filter(|c| is_letter(*c)).count();
        let upper = w.chars().filter(|c| c.is_uppercase()).count();
        if !s.is_empty() && upper > letters / 2 {
            let uc = s[0].to_uppercase();
            if !s.contains(&uc) { s.insert(0, uc); }
        }
        s
    }

    pub fn change_all(&mut self, from: &str, to: &str) {
        self.change_all.entry(from.into()).or_insert_with(|| to.into());
        self.replace.add_word_or_partial(from, to);
    }
    pub fn skip_all(&mut self, w: &str) { if !w.trim().is_empty() { self.skip.insert(w.into()); } }
    pub fn add_name(&mut self, n: &str) { if !n.trim().is_empty() { self.lists.add_name(n.trim()); } }
    /// เพิ่มคำลงพจนานุกรมของผู้ใช้ (บันทึกลงไฟล์ของผู้ใช้) · ตาม AddToUserDictionary
    pub fn add_user_word(&mut self, w: &str) -> bool { self.lists.add_user_word(w) }

    // ---- ที่ตัวจับคู่ภาพพลาด

    /// # ระหว่างตัวอักษรคืออะพอสทรอฟีตัวเอียง เมื่อพจนานุกรมหรือรายชื่อรู้จักผล · ตาม FixHashMisreadAsApostrophe
    fn fix_hash(&self, text: &str) -> String {
        if !text.contains('#') { return text.into(); }
        replace_tokens(text, |c, i| !(i > 0 && (is_lod(c[i - 1]) || matches!(c[i - 1], '#' | '/' | '\'' | '’'))), |x| is_letter(x) || matches!(x, '\'' | '’' | '/' | '#'),
            |t| { let c: Vec<char> = t.chars().collect(); (1..c.len().saturating_sub(1)).any(|k| c[k] == '#' && (is_letter(c[k - 1]) || c[k - 1] == '/') && (is_letter(c[k + 1]) || c[k + 1] == '/')) },
            |m| {
                let cand = m.replace('#', "'");
                if cand.contains('/') { return cand; }
                let bare = cand.trim_matches(|c| matches!(c, '\'' | '’'));
                if bare.chars().count() > 1 && (self.spelled(bare) || self.lists.has_name(bare)) { cand } else { m.into() }
            })
    }

    /// / ที่ติดตัวอักษรคือ l i I ตัวเอียง · / ยืนเดี่ยวคือ I · ตาม FixSlashMisreadAsL
    fn fix_slash(&self, text: &str) -> String {
        if !text.contains('/') { return text.into(); }
        let mut text = text.to_string();
        if self.spelled("I") && has_lone_slash(&text) {
            let c: Vec<char> = text.chars().collect();
            let mut out = String::new();
            for (i, &ch) in c.iter().enumerate() {
                let lone = ch == '/' && (i == 0 || c[i - 1].is_whitespace() || c[i - 1] == '>') && (i + 1 == c.len() || c[i + 1].is_whitespace() || c[i + 1] == '<');
                if lone && !separator_slash(&c, i) { out.push('I'); } else { out.push(ch); }
            }
            text = out;
        }
        let snapshot = text.clone();
        let cs: Vec<char> = snapshot.chars().collect();
        replace_tokens(&snapshot, |c, i| !(i > 0 && (is_lod(c[i - 1]) || matches!(c[i - 1], '/' | '\'' | '’' | '<'))), |x| is_letter(x) || matches!(x, '\'' | '’' | '/'),
            |t| { let c: Vec<char> = t.chars().collect(); (0..c.len()).any(|k| (k > 0 && c[k] == '/' && is_letter(c[k - 1])) || (c[k] == '/' && (c.get(k + 1).is_some_and(|x| is_letter(*x)) || (c.get(k + 1).is_some_and(|x| matches!(x, '\'' | '’')) && c.get(k + 2).is_some_and(|x| is_letter(*x)))))) },
            |token| self.slash_token(token, &cs, &snapshot))
    }

    fn slash_token(&self, token: &str, _cs: &[char], text: &str) -> String {
        let idx = text.find(token).unwrap_or(0);
        if token.starts_with("//") || (idx > 0 && text[..idx].ends_with(':')) { return token.into(); }
        let parts: Vec<&str> = token.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() > 1 && parts.iter().all(|p| p.chars().count() > 1 && self.spelled(p)) { return token.into(); }
        let tc: Vec<char> = token.chars().collect();
        let mut chars: Vec<char> = tc.iter().map(|&c| if c == '/' { 'l' } else { c }).collect();
        for i in 1..chars.len() { if chars[i] == 'I' && chars[i - 1].is_lowercase() { chars[i] = 'l'; } }
        let cand: String = chars.iter().collect();
        if self.word_or_name(&cand) { return cand; }
        let slashes: Vec<usize> = (0..tc.len()).filter(|&i| tc[i] == '/').collect();
        if slashes.len() > 4 { return token.into(); }
        let start = sentence_start(text, idx);
        let readings: Vec<&str> = slashes.iter().map(|&s| if s != 0 { "li" } else if start { "lIi" } else { "liI" }).collect();
        let mut picks = vec![0usize; readings.len()];
        loop {
            for (k, &s) in slashes.iter().enumerate() { chars[s] = readings[k].chars().nth(picks[k]).unwrap(); }
            let cand: String = chars.iter().collect();
            if self.word_or_name(&cand) { return cand; }
            let mut p = picks.len() as i64 - 1;
            while p >= 0 { picks[p as usize] += 1; if picks[p as usize] == readings[p as usize].chars().count() { picks[p as usize] = 0; p -= 1; } else { break; } }
            if p < 0 { break; }
        }
        token.into()
    }
}

const ACCENT_GROUPS: [&str; 29] = ["aàáâãäåā", "AÀÁÂÃÄÅĀ", "eèéêëēěęė", "EÈÉÊËĒĚĘĖ", "iìíîïī", "IÌÍÎÏĪ", "oòóôõöøō", "OÒÓÔÕÖØŌ",
    "uùúûüūů", "UÙÚÛÜŪŮ", "cçčć", "CÇČĆ", "sšśş", "SŠŚŞ", "zžźż", "ZŽŹŻ", "nñńň", "NÑŃŇ", "yýÿ", "YÝŸ", "rř", "RŘ", "dď", "DĎ", "tť", "TŤ", "lł", "LŁ", "gğ"];
const ACCENT_CROSS: [&str; 6] = ["Bß", "čë", "ČË", "šë", "žä", "ŽÄ"];

/// ตัวอักษรพื้นของสระมีเครื่องหมาย (แบบ NFD ตัวแรก) สำหรับภาษาละติน
fn base_letter(c: char) -> char {
    for g in ACCENT_GROUPS { if g.contains(c) { return g.chars().next().unwrap(); } }
    c
}

fn remove_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() { match c { '<' => in_tag = true, '>' if in_tag => in_tag = false, _ if !in_tag => out.push(c), _ => {} } }
    out
}

fn first_word(t: &str) -> String {
    let w: String = t.chars().take_while(|c| is_letter(*c) || matches!(c, '\'' | '’')).collect();
    if w.is_empty() { t.chars().take(1).collect() } else { w }
}

/// แทนทุกชิ้นที่ขึ้นต้นตรงตำแหน่งที่ start_ok ยอม ประกอบด้วยอักขระที่ part ยอม และ want ยอมทั้งชิ้น · ใช้แทน regex ที่มองย้อนหลัง
fn replace_tokens(text: &str, start_ok: impl Fn(&[char], usize) -> bool, part: impl Fn(char) -> bool, want: impl Fn(&str) -> bool, f: impl Fn(&str) -> String) -> String {
    let c: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if part(c[i]) && start_ok(&c, i) {
            let mut j = i;
            while j < c.len() && part(c[j]) { j += 1; }
            let tok: String = c[i..j].iter().collect();
            if want(&tok) { out.push_str(&f(&tok)); } else { out.push_str(&tok); }
            i = j;
            continue;
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

fn has_lone_slash(t: &str) -> bool {
    let c: Vec<char> = t.chars().collect();
    (0..c.len()).any(|i| c[i] == '/' && (i == 0 || c[i - 1].is_whitespace() || c[i - 1] == '>') && (i + 1 == c.len() || c[i + 1].is_whitespace() || c[i + 1] == '<'))
}

/// / ข้างตัวเลข หรือระหว่างคำตัวใหญ่ล้วนสองคำ คือตัวคั่น · ตาม IsSeparatorSlash
fn separator_slash(c: &[char], idx: usize) -> bool {
    let (b, a) = (neighbour(c, idx, -1), neighbour(c, idx, 1));
    if b.chars().any(crate::nocr_text::is_digit) || a.chars().any(crate::nocr_text::is_digit) { return true; }
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

fn sentence_start(text: &str, byte_idx: usize) -> bool {
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
fn standalone(res: &LineFix, idx: usize) -> bool {
    let ok = |i: i64| -> bool {
        if i < 0 || i as usize >= res.parts.len() { return true; }
        let p = &res.parts[i as usize];
        p.kind != PartKind::Special || p.word.chars().all(|c| STANDALONE_NEIGHBOURS.contains(c))
    };
    ok(idx as i64 - 1) && ok(idx as i64 + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lev(a: &[char], b: &[char]) -> usize {
        let mut prev: Vec<usize> = (0..=b.len()).collect();
        for (i, ca) in a.iter().enumerate() {
            let mut cur = vec![i + 1; b.len() + 1];
            for (j, cb) in b.iter().enumerate() { cur[j + 1] = (prev[j] + (ca != cb) as usize).min(prev[j + 1] + 1).min(cur[j] + 1); }
            prev = cur;
        }
        prev[b.len()]
    }

    /// ผลที่ nOCR อ่าน ACCA ด้วยฐาน Latin ผ่านตัวแก้คำกับพจนานุกรม en_US แล้วต้องใกล้คำตอบขึ้น (ถูกทั้งภาพมากขึ้น อักขระผิดน้อยลง)
    /// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_TRUTH · ห้ามขึ้น git
    #[test]
    fn acca_nocr_text_gets_closer() {
        let (Ok(sup), Ok(truth)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_TRUTH")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr");
        let dict = root.join("Dictionaries");
        let db = crate::nocr::NOcrDb::load(&root.join("Ocr/Latin.nocr")).unwrap();
        let hun = root.join("hunspell");
        let spell = Hunspell::open(&hun.join("en_US.aff"), &hun.join("en_US.dic")).unwrap();
        let mut fx = FixEngine::new(&dict, &std::env::temp_dir().join("movie-shelf-ocrfix-acca"), "eng", "en_US", Box::new(spell));
        fx.image_misreads = true;
        fx.fill_unknown = true;
        let shows = crate::subs::parse_sup(&std::fs::read(sup).unwrap());
        let want: Vec<String> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
            .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).replace(" ¶ ", "\n").replace('¶', "\n")).collect();
        let plain = |s: &str| remove_tags(s).replace(['“', '”'], "\"").replace(['‘', '’'], "'").lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n");
        let reader = crate::nocr_text::NOcrReader::default();
        let o = crate::nocr_text::ReadOpts { max_wrong: 25, italic: 0.0, space_px: 0, last_ditch: true, teach: false };
        let t = std::time::Instant::now();
        let (mut ok_raw, mut ok_fix, mut e_raw, mut e_fix, mut total) = (0, 0, 0, 0, 0);
        let mut prev: Option<String> = None;
        let mut samples = vec![];
        for (k, (s, w)) in shows.iter().zip(&want).enumerate() {
            let raw = reader.read_text(&db, &s.img, &o).text;
            let fixed = fx.fix(k, &raw, &Ctx { prev: prev.as_deref(), next_soon_lower: false }, true).text();
            let (r, f, tw) = (plain(&raw), plain(&fixed), plain(w));
            let tc: Vec<char> = tw.chars().collect();
            e_raw += lev(&r.chars().collect::<Vec<_>>(), &tc);
            e_fix += lev(&f.chars().collect::<Vec<_>>(), &tc);
            total += tc.len();
            ok_raw += (r == tw) as usize;
            ok_fix += (f == tw) as usize;
            if r != f && samples.len() < 12 { samples.push((k + 1, r, f)); }
            prev = Some(fixed);
        }
        eprintln!("ACCA nOCR ฐาน Latin ก่อนแก้ ถูก {ok_raw} อักขระผิด {e_raw} · หลังแก้ ถูก {ok_fix} อักขระผิด {e_fix} จาก {total} ตัว ใน {:.1} วินาที", t.elapsed().as_secs_f64());
        for s in &samples { eprintln!("ภาพ {} ก่อน {:?} หลัง {:?}", s.0, s.1, s.2); }
        assert!(ok_fix > ok_raw && e_fix < e_raw, "ตัวแก้คำไม่ได้ทำให้ใกล้คำตอบขึ้น");
    }

    /// พจนานุกรมที่แนบมา (LibreOffice ใน tools/ocr/hunspell) รู้จักคำที่เติมท้าย · ชุด en_US ในโฟลเดอร์ Dictionaries ของ Subtitle Edit
    /// เขียนเครื่องหมายคำเป็นตัวเลขกับตารางย่อ spellbook อ่านไม่ครบ ไม่รู้จัก including business rounds (เจอตอนเทสขั้น 9 วันที่ 16 พ.ย. 2569)
    #[test]
    fn bundled_hunspell_knows_inflected_words() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/hunspell");
        for five in ["en_US", "en_GB"] {
            let Ok(h) = Hunspell::open(&root.join(format!("{five}.aff")), &root.join(format!("{five}.dic"))) else { return };
            for w in ["including", "business", "rounds", "nationally", "managing", "Constables", "wrongdoing", "you're"] { assert!(h.correct(w), "{five} ไม่รู้จัก {w}"); }
            for w in ["Mais", "Dowa", "wronqdoing"] { assert!(!h.correct(w), "{five} ไม่ควรรู้จัก {w}"); }
        }
    }

    #[test]
    fn small_rules() {
        assert_eq!(fix_spaced_thousands("klim tot 19. 000 voet en 1940. 300"), "klim tot 19.000 voet en 1940. 300");
        assert_eq!(fix_space_before_closing_quote("voorbij. ' Kom", false), "voorbij.' Kom");
        assert_eq!(normalize_apostrophes("didn’t"), "didn't");
        assert_eq!(normalize_apostrophes("La lettera ‘E’"), "La lettera ‘E’");
        assert_eq!(normalize_spaced_ellipses("voor. . . en"), "voor... en");
        assert_eq!(bar_misread_by_case("FIight").as_deref(), Some("Flight"));
        assert_eq!(bar_misread_by_case("JUNl").as_deref(), Some("JUNI"));
        assert_eq!(bar_misread_by_case("McIntyre"), None);
        assert_eq!(fix_lone_dashes("-\nHello\n-\nHi"), "- Hello\n- Hi");
        assert_eq!(fix_lone_dashes("- Yes\n-\nNo"), "- Yes\n- No");
        // ไทยไม่มีพจนานุกรม ไม่มีคำที่ไม่รู้จัก ข้อความผ่านตามเดิม
        let tmp = std::env::temp_dir().join("movie-shelf-ocrfix-th");
        let th = FixEngine::new(&tmp, &tmp, "tha", "", Box::new(NoSpell));
        let r = th.fix(0, "สวัสดีครับ ผู้ใหญ่บ้าน", &Ctx::default(), true);
        assert!(r.unknown().is_empty());
        assert_eq!(r.text(), "สวัสดีครับ ผู้ใหญ่บ้าน");
        let s = Strippable::new("<i>- hello...</i>");
        assert_eq!((s.pre.as_str(), s.text.as_str(), s.post.as_str()), ("<i>- ", "hello", "...</i>"));
        let l = split_line("<i>He's</i> 10 - ok!", 0);
        let kinds: Vec<PartKind> = l.parts.iter().map(|p| p.kind).collect();
        assert_eq!(kinds, vec![PartKind::Tag, PartKind::Word, PartKind::Tag, PartKind::Whitespace, PartKind::Word, PartKind::Whitespace, PartKind::Special, PartKind::Whitespace, PartKind::Word, PartKind::Special]);
    }
}
