//! รายการแก้คำ OCR (แผน OCR ขั้น 8 · BUGS ข้อ 143) ไฟล์ <ภาษา>_OCRFixReplaceList.xml ของ Subtitle Edit แปดหมวด
//! WholeWords PartialWordsAlways PartialWords PartialLines PartialLinesAlways BeginLines EndLines WholeLines กับนิพจน์ RegularExpressions
//! และ RegularExpressionsIfSpelledCorrectly (ใช้เมื่อผลสะกดถูก) · คู่ที่ผู้ใช้เพิ่มเก็บในไฟล์ <ภาษา>_OCRFixReplaceList_User.xml ในโฟลเดอร์ของโปรแกรม
//! นิพจน์เป็นแบบ .NET (มองหน้า มองหลัง) ใช้ห้องสมุด fancy-regex
//!
//! แปลจาก src/libuilogic/Ocr/FixEngine/OcrFixReplaceList2.cs SpellCheckRegex.cs และ Utilities.AddSpaceBeforeFrenchPunctuation
//! ของ Subtitle Edit สัญญา MIT · Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

use crate::ocrfix::Spell;
use fancy_regex::Regex;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------- XML

/// ถอดตัวหนีของค่าใน XML รวมเลขอักขระ (&#10; &#xD;)
fn unescape(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(a) = rest.find('&') {
        out.push_str(&rest[..a]);
        let after = &rest[a..];
        let Some(semi) = after.find(';') else { out.push_str(after); return out };
        let ent = &after[1..semi];
        let rep = match ent {
            "amp" => Some('&'), "lt" => Some('<'), "gt" => Some('>'), "quot" => Some('"'), "apos" => Some('\''),
            _ if ent.starts_with("#x") || ent.starts_with("#X") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
            _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match rep { Some(c) => { out.push(c); rest = &after[semi + 1..]; } None => { out.push('&'); rest = &after[1..]; } }
    }
    out.push_str(rest);
    out
}

/// ค่าของคุณสมบัติในแท็ก (find="…" หรือ find='…')
fn attr(tag: &str, name: &str) -> Option<String> {
    let mut i = 0;
    while let Some(p) = tag[i..].find(name) {
        let at = i + p;
        let before_ok = at == 0 || tag.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = tag[at + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let v = rest[1..].trim_start();
            let q = v.chars().next()?;
            if q == '"' || q == '\'' { let end = v[1..].find(q)?; return Some(unescape(&v[1..1 + end])); }
        }
        i = at + name.len();
    }
    None
}

/// แท็กลูกทุกตัวในหมวดชื่อนี้ (ทุกหมวดชื่อซ้ำ) เป็นข้อความของแท็กเปิด
fn section_items(doc: &str, section: &str) -> Vec<String> {
    let (open, close) = (format!("<{section}>"), format!("</{section}>"));
    let mut out = vec![];
    let mut rest = doc;
    while let Some(a) = rest.find(&open) {
        let after = &rest[a + open.len()..];
        let Some(b) = after.find(&close) else { break };
        let body = &after[..b];
        let mut r = body;
        while let Some(lt) = r.find('<') {
            let Some(gt) = r[lt..].find('>') else { break };
            let tag = &r[lt + 1..lt + gt];
            if !tag.starts_with('/') && !tag.starts_with('!') { out.push(tag.trim_end_matches('/').to_string()); }
            r = &r[lt + gt + 1..];
        }
        rest = &after[b + close.len()..];
    }
    out
}

fn has_section(doc: &str, section: &str) -> bool { doc.contains(&format!("<{section}>")) || doc.contains(&format!("<{section} ")) }

/// รายการคู่ from to ไม่ซ้ำคีย์ ตามลำดับในไฟล์ · from กับ to ต้องต่างกัน · ตาม LoadReplaceList
/// เอาแท็กที่ from ตรงกับคำนี้ออกจากหมวดในไฟล์ของผู้ใช้ (ก่อนใส่คู่ใหม่ของคำเดียวกัน)
fn remove_items(doc: &mut String, section: &str, from: &str) {
    let (open, close) = (format!("<{section}>"), format!("</{section}>"));
    let mut from_at = 0;
    while let Some(a) = doc[from_at..].find(&open).map(|x| x + from_at + open.len()) {
        let Some(end) = doc[a..].find(&close).map(|x| x + a) else { break };
        let mut i = a;
        let mut stop = end;
        while let Some(lt) = doc[i..stop].find('<').map(|x| x + i) {
            let Some(gt) = doc[lt..stop].find('>').map(|x| x + lt) else { break };
            let tag = doc[lt + 1..gt].trim_end_matches('/').to_string();
            if !tag.starts_with('/') && attr(&tag, "from").as_deref() == Some(from) {
                doc.replace_range(lt..=gt, "");
                stop -= gt + 1 - lt;
                i = lt;
            } else { i = gt + 1; }
        }
        from_at = stop + close.len();
    }
}

fn load_pairs(doc: &str, section: &str, unique_key: bool) -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = vec![];
    if !has_section(doc, section) { return v; }
    for t in section_items(doc, section) {
        let (Some(f), Some(to)) = (attr(&t, "from"), attr(&t, "to")) else { continue };
        if f == to { continue; }
        let dup = if unique_key { v.iter().any(|p| p.0 == f) } else { v.iter().any(|p| p.0 == f && p.1 == to) };
        if !dup { v.push((f, to)); }
    }
    v
}

/// แปลงแม่แบบการแทนแบบ .NET ($1 ตามด้วยอักษร) เป็นแบบ fancy-regex (${1})
pub fn net_replacement(r: &str) -> String {
    let c: Vec<char> = r.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < c.len() {
        if c[i] == '$' && i + 1 < c.len() {
            if c[i + 1] == '$' { out.push_str("$$"); i += 2; continue; }
            if c[i + 1].is_ascii_digit() {
                let mut j = i + 1;
                while j < c.len() && c[j].is_ascii_digit() { j += 1; }
                out.push_str("${");
                out.extend(&c[i + 1..j]);
                out.push('}');
                i = j;
                continue;
            }
            if c[i + 1] == '{' { if let Some(e) = (i..c.len()).find(|&k| c[k] == '}') { out.extend(&c[i..=e]); i = e + 1; continue; } }
        }
        out.push(c[i]);
        i += 1;
    }
    out
}

/// นิพจน์ที่ใช้ได้ (คอมไพล์ผ่าน) · ตาม RegexUtils.IsValidRegex
fn valid_regex(p: &str) -> bool { Regex::new(p).is_ok() }

fn load_regex_list(doc: &str, section: &str) -> Vec<(String, String)> {
    let mut v: Vec<(String, String)> = vec![];
    if !has_section(doc, section) { return v; }
    for t in section_items(doc, section) {
        let (Some(f), Some(r)) = (attr(&t, "find"), attr(&t, "replaceWith")) else { continue };
        if f.is_empty() || !valid_regex(&f) { continue; }
        if !v.iter().any(|p| p.0 == f) { v.push((f, r)); }
    }
    v
}

// ---------------------------------------------------------------- นิพจน์ที่ใช้เมื่อสะกดถูก

/// นิพจน์ที่แทนเมื่อคำที่ได้ผ่านพจนานุกรมเท่านั้น · ตาม SpellCheckRegex
pub struct SpellRegex { pub find: String, re: Regex, spell: String, replace_with: String, all_from: String, all_to: String }

impl SpellRegex {
    /// คำที่ตรงและยังไม่ถูก ลองแทน ผลผ่านตัวตรวจจึงแทนและจดคำเดิมไว้ข้าม · ตาม Apply
    pub fn apply(&self, input: &str, ignore: &mut Vec<String>, known: &dyn Fn(&str) -> bool, dict: &dyn Fn(&str) -> bool) -> String {
        let mut out = String::new();
        let mut last = 0;
        let mut pos = 0;
        while pos <= input.len() {
            let Ok(Some(caps)) = self.re.captures_from_pos(input, pos) else { break };
            let m = caps.get(0).unwrap();
            out.push_str(&input[last..m.start()]);
            let v = m.as_str();
            let mut rep = v.to_string();
            if !known(v.trim_start_matches('[').trim_end_matches(']')) {
                let mut word = String::new();
                caps.expand(&net_replacement(&self.spell), &mut word);
                if !self.all_from.is_empty() { word = word.replace(&self.all_from, &self.all_to); }
                if dict(word.trim_start_matches('[').trim_end_matches(']')) {
                    ignore.push(v.to_string());
                    rep = if !self.all_from.is_empty() { v.replace(&self.all_from, &self.all_to) } else { let mut r = String::new(); caps.expand(&net_replacement(&self.replace_with), &mut r); r };
                }
            }
            out.push_str(&rep);
            last = m.end();
            pos = if m.end() > m.start() { m.end() } else { m.end() + input[m.end()..].chars().next().map_or(1, |c| c.len_utf8()) };
        }
        out.push_str(&input[last.min(input.len())..]);
        out
    }

    fn load(doc: &str, section: &str) -> Vec<SpellRegex> {
        let mut v = vec![];
        for t in section_items(doc, section) {
            let (Some(f), Some(s), Some(r)) = (attr(&t, "find"), attr(&t, "spellCheck"), attr(&t, "replaceWith")) else { continue };
            if f.is_empty() || s.is_empty() || r.is_empty() { continue; }
            let Ok(re) = Regex::new(&f) else { continue };
            v.push(SpellRegex { find: f, re, spell: s, replace_with: r, all_from: attr(&t, "replaceAllFrom").unwrap_or_default(), all_to: attr(&t, "replaceAllTo").unwrap_or_default() });
        }
        v
    }
}

// ---------------------------------------------------------------- รายการแก้คำ

/// รายการแก้คำของหนึ่งภาษา · ตาม OcrFixReplaceList2
#[derive(Default)]
pub struct ReplaceList {
    pub words: Vec<(String, String)>,
    pub partial_lines: Vec<(String, String)>,
    partial_lines_always: Vec<(String, String)>,
    begin_lines: Vec<(String, String)>,
    end_lines: Vec<(String, String)>,
    whole_lines: Vec<(String, String)>,
    partial_words_always: Vec<(String, String)>,
    partial_words: Vec<(String, String)>,
    regex: Vec<(String, String, Regex)>,
    spell_regex: Vec<SpellRegex>,
    greek: bool,
    user_file: PathBuf,
    pub hardcoded: bool,
}

fn merge(base: &mut Vec<(String, String)>, removed: Vec<(String, String)>, added: Vec<(String, String)>) {
    for r in removed { base.retain(|p| p.0 != r.0); }
    for a in added { if !base.iter().any(|p| p.0 == a.0) { base.push(a); } }
}

fn get<'a>(v: &'a [(String, String)], k: &str) -> Option<&'a str> { v.iter().find(|p| p.0 == k).map(|p| p.1.as_str()) }

impl ReplaceList {
    /// เปิดรายการของภาษา (รหัสสามตัว) · ไม่มีไฟล์ได้รายการว่าง (ภาษาไทยยังไม่มีรายการของ Subtitle Edit)
    pub fn from_lang(dict_dir: &Path, user_dir: &Path, lang3: &str) -> Self {
        let file = dict_dir.join(format!("{lang3}_OCRFixReplaceList.xml"));
        let user_file = user_dir.join(format!("{lang3}_OCRFixReplaceList_User.xml"));
        let read = |p: &Path| std::fs::read_to_string(p).map(|s| s.trim_start_matches('\u{feff}').to_string()).unwrap_or_default();
        let (doc, user) = (read(&file), read(&user_file));
        let mut l = ReplaceList { greek: lang3 == "ell", user_file, hardcoded: true, ..Default::default() };
        l.words = load_pairs(&doc, "WholeWords", true);
        l.partial_words_always = load_pairs(&doc, "PartialWordsAlways", true);
        l.partial_words = load_pairs(&doc, "PartialWords", false);
        l.partial_lines = load_pairs(&doc, "PartialLines", true);
        l.partial_lines_always = load_pairs(&doc, "PartialLinesAlways", true);
        l.begin_lines = load_pairs(&doc, "BeginLines", true);
        l.end_lines = load_pairs(&doc, "EndLines", true);
        l.whole_lines = load_pairs(&doc, "WholeLines", true);
        merge(&mut l.words, load_pairs(&user, "RemovedWholeWords", true), load_pairs(&user, "WholeWords", true));
        merge(&mut l.partial_lines, load_pairs(&user, "RemovedPartialLines", true), load_pairs(&user, "PartialLines", true));
        for r in load_pairs(&user, "RemovedPartialWords", true) { l.partial_words.retain(|p| p.0 != r.0); }
        for a in load_pairs(&user, "PartialWords", false) { if !l.partial_words.contains(&a) { l.partial_words.push(a); } }
        merge(&mut l.partial_words_always, load_pairs(&user, "RemovedPartialWordsAlways", true), load_pairs(&user, "PartialWordsAlways", true));
        merge(&mut l.partial_lines_always, load_pairs(&user, "RemovedPartialLinesAlways", true), load_pairs(&user, "PartialLinesAlways", true));
        merge(&mut l.begin_lines, load_pairs(&user, "RemovedBeginLines", true), load_pairs(&user, "BeginLines", true));
        merge(&mut l.end_lines, load_pairs(&user, "RemovedEndLines", true), load_pairs(&user, "EndLines", true));
        merge(&mut l.whole_lines, load_pairs(&user, "RemovedWholeLines", true), load_pairs(&user, "WholeLines", true));
        let mut rx = load_regex_list(&doc, "RegularExpressions");
        for a in load_regex_list(&user, "RegularExpressions") { if !rx.iter().any(|p| p.0 == a.0) { rx.push(a); } }
        for r in load_regex_list(&user, "RemovedRegularExpressions") { rx.retain(|p| p.0 != r.0); }
        // นิพจน์ทั้งรายการใช้แบบหลายบรรทัด (RegexOptions.Multiline)
        l.regex = rx.into_iter().filter_map(|(f, r)| Regex::new(&format!("(?m){f}")).ok().map(|re| (f, net_replacement(&r), re))).collect();
        let mut sr = SpellRegex::load(&doc, "RegularExpressionsIfSpelledCorrectly");
        for s in SpellRegex::load(&user, "RegularExpressionsIfSpelledCorrectly") { if !sr.iter().any(|x| x.find == s.find) { sr.push(s); } }
        let removed: Vec<String> = section_items(&user, "RemovedRegularExpressionsIfSpelledCorrectly").iter().filter_map(|t| attr(t, "find")).collect();
        sr.retain(|s| !removed.contains(&s.find));
        l.spell_regex = sr;
        l
    }

    /// แก้ทั้งบรรทัด ทั้งบรรทัดตรงพอดี ขึ้นต้นบรรทัด ลงท้ายบรรทัด ส่วนของบรรทัดตามขอบคำ ส่วนของบรรทัดเสมอ นิพจน์ แล้วนิพจน์ที่ใช้เมื่อสะกดถูก
    /// skip_end ลงท้ายที่เติมจุดไม่ต้องเติม เพราะบรรทัดถัดไปขึ้นภายใน 600 ms ด้วยตัวเล็ก · ตาม FixOcrErrorViaLineReplaceList
    #[allow(clippy::too_many_arguments)]
    pub fn fix_line(&self, input: &str, skip_end: bool, _index: usize, spell: &dyn Spell, ignore: &mut Vec<String>, spelled_ok: bool, known: &dyn Fn(&str) -> bool) -> String {
        if let Some(w) = get(&self.whole_lines, input) { return w.into(); }
        let mut t = input.to_string();
        let mut pre = String::new();
        if t.starts_with("<i>") { pre.push_str("<i>"); t = t[3..].to_string(); }
        while t.chars().count() > 1 && " -\"['¶(".contains(t.chars().next().unwrap()) { let c = t.remove(0); pre.push(c); }
        if t.starts_with("<i>") { pre.push_str("<i>"); t = t[3..].to_string(); }
        let mut lines: Vec<String> = vec![];
        for l in t.split("\r\n").flat_map(|x| x.split(['\r', '\n'])) {
            let mut s = l.to_string();
            for (from, with) in &self.begin_lines {
                if !s.contains(from.as_str()) { continue; }
                if s.starts_with(from.as_str()) { s = format!("{with}{}", &s[from.len()..]); }
                for p in [". ", "! ", "? "] { s = s.replace(&format!("{p}{from}"), &format!("{p}{with}")); }
                if s.starts_with(&format!("\"{from}")) && !from.starts_with('"') { s = s.replace(&format!("\"{from}"), &format!("\"{with}")); }
            }
            lines.push(s);
        }
        let mut t = format!("{pre}{}", lines.join("\n").trim_end_matches(['\r', '\n']));
        let mut post = "";
        if t.ends_with("</i>") { t.truncate(t.len() - 4); post = "</i>"; }
        for (from, to) in &self.end_lines {
            if t.ends_with(from.as_str()) && !(skip_end && to.ends_with('.') && !from.ends_with('.')) {
                let p = t.len() - from.len();
                t = format!("{}{to}", &t[..p]);
            }
        }
        t.push_str(post);
        for (from, to) in &self.partial_lines { if t.contains(from.as_str()) { t = replace_word(&t, from, to); } }
        for (from, to) in &self.partial_lines_always { if t.contains(from.as_str()) { t = t.replace(from.as_str(), to); } }
        for (_, rep, re) in &self.regex { t = re.replace_all(&t, rep.as_str()).into_owned(); }
        if !spelled_ok {
            let dict = |w: &str| spell.correct(w);
            for sr in &self.spell_regex { t = sr.apply(&t, ignore, known, &dict); }
        }
        t
    }

    /// แก้หนึ่งคำ อักษรควบ อะพอสทรอฟีโค้ง ทั้งคำ ส่วนของคำเสมอ ? กลางคำ I 1 0 l ในคำ · ตาม FixCommonWordErrors
    pub fn fix_common_word_errors(&self, input: &str) -> String {
        let mut word = input.to_string();
        if self.hardcoded {
            word = word.replace('ﬀ', "ff").replace('ﬁ', "fi").replace('ﬂ', "fl").replace('ﬃ', "ffi").replace('ﬄ', "ffl");
            if !self.greek { word = word.replace('ν', "v"); }
            word = word.replace(['’', '`', '´', '‘'], "'");
        }
        let (wp, ww, wq) = strip_affixes(&word);
        if !ww.is_empty() { if let Some(r) = self.replace_word_lookup(&wp, &ww, &wq) { return r; } }
        for (k, v) in &self.partial_words_always { word = word.replace(k.as_str(), v); }
        let (pre, mut w, post) = strip_affixes(&word);
        let whole = format!("{pre}{w}{post}");
        if w.is_empty() { return whole; }
        if w.contains('?') {
            let c: Vec<char> = w.chars().collect();
            let letter = |x: char| "ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅÄÖÉÈÀÙÂÊÎÔÛËÏabcdefghijklmnopqrstuvwxyzæøåäöéèàùâêîôûëï".contains(x);
            if let Some(i) = (1..c.len().saturating_sub(1)).find(|&i| !c[i - 1].is_whitespace() && c[i] == '?' && letter(c[i + 1])) {
                let mut cc = c.clone();
                cc.insert(i + 1, ' ');
                w = cc.iter().collect();
            }
        }
        if let Some(r) = self.replace_word_lookup(&pre, &w, &post) { return r; }
        let old = w.clone();
        if self.hardcoded {
            w = fix_i_or_1_inside_lower(&w);
            w = fix_0_inside_lower(&w);
            w = fix_i_or_1_inside_lower(&w);
            w = fix_lower_l_inside_upper(&w);
        }
        if old != w { if let Some(r) = self.replace_word_lookup(&pre, &w, &post) { return r; } }
        whole
    }

    fn replace_word_lookup(&self, pre: &str, w: &str, post: &str) -> Option<String> {
        if pre.is_empty() && post.is_empty() { return get(&self.words, w).map(String::from); }
        if let Some(r) = get(&self.words, &format!("{pre}{w}{post}")) { return Some(r.into()); }
        if let Some(r) = get(&self.words, &format!("{pre}{w}")) { return Some(format!("{r}{post}")); }
        if let Some(r) = get(&self.words, &format!("{w}{post}")) { return Some(format!("{pre}{r}")); }
        get(&self.words, w).map(|r| format!("{pre}{r}{post}"))
    }

    /// ตัวเลือกจากคู่ PartialWords (ตัวเอียงอ่าน l เป็น i) · ภาษาเดนมาร์ก อังกฤษ สวีเดน ตัดตัวเลือกที่มีพยัญชนะเดี่ยว · ตาม CreateGuessesFromLetters
    pub fn guesses_from_letters(&self, word: &str, lang3: &str) -> Vec<String> {
        let mut list: Vec<String> = vec![];
        let add = |list: &mut Vec<String>, g: String| { if !g.is_empty() && !list.contains(&g) { list.push(g); } };
        let wc: Vec<char> = word.chars().collect();
        let mut prev = 0;
        for (letter, rep) in &self.partial_words {
            let lc: Vec<char> = letter.chars().collect();
            let at = |s: &[char], i: usize| s.len() >= i + lc.len() && s[i..i + lc.len()] == lc[..];
            let splice = |s: &[char], i: usize| -> String { s[..i].iter().collect::<String>() + rep + &s[i + lc.len()..].iter().collect::<String>() };
            let mut idx = vec![];
            for i in 0..=(wc.len().saturating_sub(lc.len())) {
                if wc.len() < lc.len() { break; }
                if at(&wc, i) {
                    if !(i == wc.len() - lc.len() && !rep.contains(' ')) { idx.push(i); }
                    add(&mut list, splice(&wc, i));
                }
            }
            if idx.len() > 1 {
                if !rep.contains(' ') {
                    let mut multi: Vec<char> = wc.clone();
                    for &i in idx.iter().rev() {
                        let s = splice(&multi, i);
                        multi = s.chars().collect();
                        add(&mut list, s);
                    }
                    add(&mut list, word.replace(letter.as_str(), rep));
                }
            } else if !idx.is_empty() {
                add(&mut list, word.replace(letter.as_str(), rep));
            }
            for &i in idx.iter().rev() { if i > 1 && i + 2 < wc.len() { add(&mut list, splice(&wc, i)); } }
            for g in 0..prev {
                let pg: Vec<char> = list[g].chars().collect();
                for i in 0..=(pg.len().saturating_sub(lc.len())) { if pg.len() >= lc.len() && at(&pg, i) { let s = splice(&pg, i); add(&mut list, s); } }
            }
            prev = list.len();
        }
        if !matches!(lang3, "dan" | "eng" | "swe") { return list; }
        list.into_iter().filter(|s| s.split(' ').all(|w| { let mut it = w.chars(); !matches!((it.next(), it.next()), (Some(c), None) if c.is_alphabetic() && !"aeiouæøåöüäAEIOUÆØÅÖÜÄ".contains(c)) })).collect()
    }

    /// คู่แก้ที่ผู้ใช้เพิ่ม · มีเว้นวรรคเป็นส่วนของบรรทัด ไม่มีเป็นทั้งคำ · บันทึกลงไฟล์ของผู้ใช้ · ตาม AddWordOrPartial
    /// คืน false เมื่อมีคู่เดียวกันอยู่แล้ว · คำเดิมที่เคยแก้เป็นคำอื่น แทนด้วยคำใหม่ทั้งในงานและในไฟล์ · เขียนไฟล์ไม่ได้คืนผิดพลาด
    /// (ผู้ช่วยตรวจทาน R13 · เดิมคู่แรกชนะตลอด และเขียนไม่ได้ก็ตอบว่าสำเร็จ)
    pub fn add_word_or_partial(&mut self, from: &str, to: &str) -> Result<bool, String> {
        let (section, element) = if from.contains(' ') { ("PartialLines", "LinePart") } else { ("WholeWords", "Word") };
        let mut doc = std::fs::read_to_string(&self.user_file).unwrap_or_else(|_| "<ReplaceList></ReplaceList>".into());
        match load_pairs(&doc, section, true).into_iter().find(|p| p.0 == from) {
            Some(p) if p.1 == to => return Ok(false),
            Some(_) => remove_items(&mut doc, section, from),
            None => {}
        }
        let list = if from.contains(' ') { &mut self.partial_lines } else { &mut self.words };
        match list.iter_mut().find(|p| p.0 == from) { Some(p) => p.1 = to.into(), None => list.push((from.into(), to.into())) }
        let item = format!("<{element} from=\"{}\" to=\"{}\" />", crate::ocrfix_words::xml_escape(from).replace('"', "&quot;"), crate::ocrfix_words::xml_escape(to).replace('"', "&quot;"));
        let close = format!("</{section}>");
        if let Some(p) = doc.find(&close) { doc.insert_str(p, &item); }
        else if let Some(p) = doc.rfind("</") { doc.insert_str(p, &format!("<{section}>{item}</{section}>")); }
        if let Some(d) = self.user_file.parent() { std::fs::create_dir_all(d).map_err(|e| format!("สร้างโฟลเดอร์ {} ไม่ได้ {e}", d.display()))?; }
        let part = PathBuf::from(format!("{}.partial", self.user_file.display()));
        std::fs::write(&part, &doc).map_err(|e| format!("เขียนไฟล์ {} ไม่ได้ {e}", self.user_file.display()))?;
        crate::app::outfile::replace_often(&part, &self.user_file)?;
        Ok(true)
    }
}

/// ตัดเครื่องหมายหน้าหลังคำออก (แท็ก ขีด จุด เครื่องหมายคำพูด วงเล็บ) · ตาม StripAffixes
pub fn strip_affixes(input: &str) -> (String, String, String) {
    let mut w = input.to_string();
    let (mut pre, mut post) = (String::new(), String::new());
    if w.starts_with("<i>") { pre.push_str("<i>"); w = w[3..].to_string(); }
    while w.len() > 2 && w.starts_with("\r\n") { pre.push_str("\r\n"); w = w[2..].to_string(); }
    for ch in ['-', '.', '"'] { while w.chars().count() > 1 && w.starts_with(ch) { pre.push(ch); w.remove(0); } }
    if w.chars().count() > 1 && w.starts_with('(') { pre.push('('); w.remove(0); }
    if w.starts_with("<i>") { pre.push_str("<i>"); w = w[3..].to_string(); }
    while w.len() > 2 && w.ends_with("\r\n") { post.insert_str(0, "\r\n"); w.truncate(w.len() - 2); }
    if w.ends_with("</i>") { post.insert_str(0, "</i>"); w.truncate(w.len() - 4); }
    while w.chars().count() > 1 && w.chars().last().is_some_and(|c| "\".,!?)]:;".contains(c)) { let c = w.pop().unwrap(); post.insert(0, c); }
    if w.ends_with("</i>") { post.insert_str(0, "</i>"); w.truncate(w.len() - 4); }
    (pre, w, post)
}

fn starts_ends_number(w: &str) -> bool { let c: Vec<char> = w.chars().collect(); c.len() >= 3 && c[0].is_ascii_digit() && c[c.len() - 1].is_ascii_digit() }
fn hex_number(w: &str) -> bool { let s = w.strip_prefix('#').unwrap_or(w); !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit()) }
fn small(c: char) -> bool { "abcdefghijklmnopqrstuvwxyzæøåöäéèàùâêîôûëï".contains(c) }

/// l ในคำที่ตัวใหญ่ล้วน (ไม่นับ l) เป็น I · ตาม FixLowerCaseLInsideUpperCaseWord
pub fn fix_lower_l_inside_upper(w: &str) -> String {
    if w.chars().count() > 3 {
        let no_l: String = w.chars().filter(|c| *c != 'l').collect();
        if no_l.to_uppercase() == no_l && !w.contains('<') && !w.contains('>') && !w.contains('\'') { return w.replace('l', "I"); }
    }
    w.into()
}

/// I หรือ 1 หลังตัวเล็กเป็น l (ไม่แตะ Mc Mac ตัวเลข เลขฐานสิบหก) · ตาม FixIor1InsideLowerCaseWord
pub fn fix_i_or_1_inside_lower(w: &str) -> String {
    if starts_ends_number(w) || w.chars().any(|c| ('2'..='9').contains(&c)) || hex_number(w) { return w.into(); }
    let mut c: Vec<char> = w.chars().collect();
    if !c.iter().skip(1).any(|x| *x == 'I' || *x == '1') { return w.into(); }
    let mut i = 0;
    while i + 1 < c.len() {
        if small(c[i]) && (c[i + 1] == 'I' || c[i + 1] == '1') {
            let mc = c[i + 1] == 'I' && i >= 1 && c[i - 1] == 'M' && c[i] == 'c';
            let mac = c[i + 1] == 'I' && i >= 2 && c[i - 2] == 'M' && c[i - 1] == 'a' && c[i] == 'c';
            if !mc && !mac { c[i + 1] = 'l'; }
        }
        i += 1;
    }
    c.iter().collect()
}

/// 0 ติดตัวเล็กเป็น o (ไม่แตะเวลา am pm ตัวเลข) · ตาม Fix0InsideLowerCaseWord
pub fn fix_0_inside_lower(w: &str) -> String {
    if starts_ends_number(w) || w.chars().any(|c| ('1'..='9').contains(&c)) || ["a.m", "p.m", "am", "pm"].iter().any(|e| w.ends_with(e)) || hex_number(w) { return w.into(); }
    let mut c: Vec<char> = w.chars().collect();
    if !c.iter().skip(1).any(|x| *x == '0') { return w.into(); }
    loop {
        let Some(i) = (0..c.len().saturating_sub(1)).find(|&i| small(c[i]) && c[i + 1] == '0') else { break };
        c[i + 1] = 'o';
    }
    let mut i = 0;
    while i + 1 < c.len() {
        if c[i] == '0' && small(c[i + 1]) && (i == 0 || !"123456789".contains(c[i - 1])) { c[i] = 'o'; }
        i += 1;
    }
    c.iter().collect()
}

const WORD_SEPARATORS: &str = " ¡¿<>-\"”“()[]'‘`´¶♪¿¡.…—!?,:;/";

/// แทนคำที่ตรงตามขอบคำ (หน้าหลังเป็นเครื่องหมาย ช่องว่าง หรือขอบบรรทัด) · ตาม ReplaceWord
pub fn replace_word(text: &str, word: &str, new: &str) -> String {
    if text.is_empty() || word.is_empty() { return text.into(); }
    // ต้นฉบับคืนข้อความว่างเมื่อไม่มีคำนี้ ผู้เรียกทุกที่เช็กก่อนว่ามี จึงคืนข้อความเดิมแทน
    if !text.contains(word) { return text.into(); }
    let t: Vec<char> = text.chars().collect();
    let w: Vec<char> = word.chars().collect();
    let sep = |c: char| c.is_ascii_punctuation() || is_punct(c) || c.is_whitespace() || WORD_SEPARATORS.contains(c);
    let mut out = String::new();
    let mut from = 0;
    for i in 0..t.len() {
        if i >= from && t.len() >= i + w.len() && t[i..i + w.len()] == w[..] {
            let start_ok = i == 0 || sep(t[i - 1]) || word.starts_with(' ');
            if start_ok {
                let end_ok = i + w.len() == t.len() || sep(t[i + w.len()]) || new.ends_with(' ');
                if end_ok { out.push_str(new); from = i + w.len(); }
            }
        }
        if i >= from { out.push(t[i]); }
    }
    out
}

/// เครื่องหมายวรรคตอนแบบ char.IsPunctuation ที่พบบ่อยนอก ASCII
fn is_punct(c: char) -> bool { matches!(c, '¡' | '¿' | '«' | '»' | '“' | '”' | '„' | '‘' | '’' | '…' | '–' | '—' | '·' | '§' | '¶' | '‹' | '›' | '、' | '。' | '「' | '」' | '『' | '』' | '・' | '！' | '？' | '：' | '；' | '，' | '（' | '）') }

/// เว้นวรรคหน้า ! ? : ; ที่ติดตัวอักษร (ภาษาฝรั่งเศส) · ตาม Utilities.AddSpaceBeforeFrenchPunctuation
pub fn add_space_before_french_punctuation(t: &str) -> String {
    let c: Vec<char> = t.chars().collect();
    let mut out = String::new();
    for (j, &ch) in c.iter().enumerate() {
        if j > 0 && "!?:;".contains(ch) && c[j - 1].is_alphabetic() { out.push(' '); }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn helpers() {
        assert_eq!(net_replacement("$1I$3"), "${1}I${3}");
        assert_eq!(replace_word("i'm here", "i'm", "I'm"), "I'm here");
        assert_eq!(replace_word("film", "il", "XX"), "film");
        assert_eq!(fix_i_or_1_inside_lower("heIlo"), "hello");
        assert_eq!(fix_i_or_1_inside_lower("McIntyre"), "McIntyre");
        assert_eq!(fix_0_inside_lower("g0t"), "got");
        assert_eq!(fix_lower_l_inside_upper("SCARLETTl"), "SCARLETTI");
        assert_eq!(strip_affixes("\"(hello!)\""), ("\"(".to_string(), "hello".to_string(), "!)\"".to_string()));
        assert_eq!(add_space_before_french_punctuation("Quoi?"), "Quoi ?");
        assert_eq!(attr("RegEx find=\"a&amp;b\" replaceWith='x'", "replaceWith").as_deref(), Some("x"));
    }

    /// รายการของภาษาอังกฤษที่แนบมาเปิดได้ทุกหมวด นิพจน์คอมไพล์ผ่านเกือบทั้งหมด และแก้คำตามรายการได้
    #[test]
    fn english_list() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Dictionaries");
        if !dir.join("eng_OCRFixReplaceList.xml").exists() { return; }
        let l = ReplaceList::from_lang(&dir, &std::env::temp_dir().join("movie-shelf-ocrfix-list"), "eng");
        eprintln!("คำ {} ส่วนคำ {} ส่วนบรรทัด {} นิพจน์ {} นิพจน์สะกดถูก {}", l.words.len(), l.partial_words.len(), l.partial_lines.len(), l.regex.len(), l.spell_regex.len());
        // นิพจน์ทุกตัวในไฟล์ต้องคอมไพล์ผ่านทั้งสองหมวด (fancy-regex อ่านนิพจน์แบบ .NET ของรายการได้หมด)
        let in_file = std::fs::read_to_string(dir.join("eng_OCRFixReplaceList.xml")).unwrap().matches("<RegEx ").count();
        assert!(l.words.len() > 1000);
        assert_eq!(l.regex.len() + l.spell_regex.len(), in_file, "นิพจน์บางตัวคอมไพล์ไม่ผ่าน");
        let (from, to) = l.words[0].clone();
        assert_eq!(l.fix_common_word_errors(&from), to);
    }

    /// เปลี่ยนทั้งหมดซ้ำด้วยคำใหม่ คู่ใหม่แทนคู่เดิมทั้งในงานและในไฟล์ · เขียนไฟล์ไม่ได้คืนผิดพลาด (ผู้ช่วยตรวจทาน R13)
    #[test]
    fn user_pair_replaced_and_write_error_reported() {
        let ud = std::env::temp_dir().join(format!("movie-shelf-r13-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ud);
        let mut l = ReplaceList::from_lang(&ud, &ud, "tst");
        assert_eq!(l.add_word_or_partial("Tbe", "The"), Ok(true));
        assert_eq!(l.add_word_or_partial("Tbe", "The"), Ok(false));
        assert_eq!(l.add_word_or_partial("Tbe", "Tbe."), Ok(true));
        let doc = std::fs::read_to_string(ud.join("tst_OCRFixReplaceList_User.xml")).unwrap();
        assert_eq!(doc.matches("from=\"Tbe\"").count(), 1, "{doc}");
        assert!(doc.contains("to=\"Tbe.\""), "{doc}");
        assert_eq!(l.words.iter().filter(|p| p.0 == "Tbe").map(|p| p.1.as_str()).collect::<Vec<_>>(), ["Tbe."]);
        // ที่เก็บของผู้ใช้เป็นไฟล์ ไม่ใช่โฟลเดอร์ เขียนไม่ได้
        let blocked = ud.join("เป็นไฟล์");
        std::fs::write(&blocked, b"x").unwrap();
        let mut l2 = ReplaceList::from_lang(&ud, &blocked.join("ใน"), "tst");
        assert!(l2.add_word_or_partial("rn", "m").is_err());
        let _ = std::fs::remove_dir_all(&ud);
    }
}
