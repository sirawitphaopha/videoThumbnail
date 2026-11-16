//! รายการคำของตัวแก้คำ OCR (แผน OCR ขั้น 8 · BUGS ข้อ 143) รายชื่อเฉพาะ คำของผู้ใช้ คำย่อ และตัวแยกคำที่เขียนติดกัน
//! ไฟล์ที่แนบมาอยู่โฟลเดอร์ tools/ocr/Dictionaries (en_names.xml en_US_se.xml en_abbreviations.xml eng_WordSplitList.txt)
//! คำที่ผู้ใช้เพิ่มเก็บในโฟลเดอร์ของโปรแกรม (user_dir) ชื่อไฟล์แบบเดียวกับ Subtitle Edit (en_names_user.xml en_US_user.xml)
//!
//! แปลจาก src/libuilogic/SpellCheck/SpellCheckWordLists.cs src/libse/Dictionaries/NameList.cs StringWithoutSpaceSplitToWords.cs
//! AbbreviationList.cs และ Iso639Dash2LanguageCode ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// ถอดตัวหนีของ XML
pub fn xml_unescape(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&apos;", "'").replace("&amp;", "&")
}

pub fn xml_escape(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }

/// ข้อความในทุกแท็กชื่อนี้ (<name>…</name>) ตามลำดับ · ตัวอ่าน XML อย่างง่ายสำหรับรายการคำ
pub fn xml_tags(doc: &str, tag: &str) -> Vec<String> {
    let (open, close) = (format!("<{tag}>"), format!("</{tag}>"));
    let mut out = vec![];
    let mut rest = doc;
    while let Some(a) = rest.find(&open) {
        let after = &rest[a + open.len()..];
        let Some(b) = after.find(&close) else { break };
        out.push(xml_unescape(after[..b].trim()));
        rest = &after[b + close.len()..];
    }
    out
}

/// ส่วนของเอกสารระหว่างแท็กเปิดปิด (ไม่มีคืนว่าง) กับเอกสารที่เอาส่วนนั้นออก
fn xml_section<'a>(doc: &'a str, tag: &str) -> (&'a str, String) {
    let (open, close) = (format!("<{tag}>"), format!("</{tag}>"));
    match (doc.find(&open), doc.find(&close)) {
        (Some(a), Some(b)) if b > a => (&doc[a + open.len()..b], format!("{}{}", &doc[..a], &doc[b + close.len()..])),
        _ => ("", doc.to_string()),
    }
}

fn read(p: &Path) -> Option<String> { std::fs::read_to_string(p).ok().map(|s| s.trim_start_matches('\u{feff}').to_string()) }

/// รหัสภาษาสองตัวจากรหัสสามตัว · ตาม Iso639Dash2LanguageCode.GetTwoLetterCodeFromThreeLetterCode
pub fn two_letter(lang3: &str) -> String {
    const MAP: &[(&str, &str)] = &[
        ("eng", "en"), ("tha", "th"), ("jpn", "ja"), ("fra", "fr"), ("fre", "fr"), ("deu", "de"), ("ger", "de"), ("spa", "es"), ("ita", "it"),
        ("por", "pt"), ("nld", "nl"), ("dut", "nl"), ("dan", "da"), ("swe", "sv"), ("nor", "no"), ("nob", "nb"), ("nno", "nn"), ("fin", "fi"),
        ("pol", "pl"), ("ces", "cs"), ("cze", "cs"), ("hun", "hu"), ("rus", "ru"), ("ukr", "uk"), ("ell", "el"), ("gre", "el"), ("tur", "tr"),
        ("ara", "ar"), ("heb", "he"), ("kor", "ko"), ("zho", "zh"), ("chi", "zh"), ("vie", "vi"), ("ind", "id"), ("msa", "ms"), ("may", "ms"),
        ("hrv", "hr"), ("srp", "sr"), ("slv", "sl"), ("slk", "sk"), ("slo", "sk"), ("ron", "ro"), ("rum", "ro"), ("bul", "bg"), ("bos", "bs"),
        ("cat", "ca"), ("eus", "eu"), ("baq", "eu"), ("glg", "gl"), ("isl", "is"), ("ice", "is"), ("lit", "lt"), ("lav", "lv"), ("est", "et"),
        ("fas", "fa"), ("per", "fa"), ("hin", "hi"), ("mkd", "mk"), ("mac", "mk"), ("khm", "km"), ("lao", "lo"), ("mya", "my"), ("bur", "my"),
    ];
    MAP.iter().find(|m| m.0 == lang3).map(|m| m.1.to_string()).unwrap_or_else(|| lang3.chars().take(2).collect())
}

// ---------------------------------------------------------------- รายชื่อเฉพาะ

/// รายชื่อเฉพาะของภาษา · ไฟล์ของผู้ใช้ก่อน แล้วไฟล์ภาษา ไฟล์ภาษากับประเทศ และ names.xml · ชื่อในบัญชีดำเอาออก · ตาม NameList
#[derive(Default)]
pub struct NameList { pub names: HashSet<String>, pub multi: HashSet<String>, multi_upper: HashSet<String>, black: HashSet<String>, user_file: PathBuf, part_index: HashMap<String, Vec<String>> }

impl NameList {
    pub fn load(dict_dir: &Path, user_dir: &Path, five: &str) -> Self {
        let two: String = five.chars().take(2).collect::<String>().to_lowercase();
        let mut n = NameList { user_file: user_dir.join(format!("{two}_names_user.xml")), ..Default::default() };
        let files = [n.user_file.clone(), dict_dir.join(format!("{two}_names.xml")), dict_dir.join(format!("{five}_names.xml")), dict_dir.join("names.xml")];
        for f in files.iter() {
            let Some(doc) = read(f) else { continue };
            let (black, rest) = xml_section(&doc, "blacklist");
            n.black.extend(xml_tags(black, "name"));
            for name in xml_tags(&rest, "name") {
                if name.is_empty() { continue; }
                if name.contains(' ') { n.multi.insert(name); } else { n.names.insert(name); }
            }
        }
        for b in &n.black { n.names.remove(b); n.multi.remove(b); }
        n.multi_upper = n.multi.iter().map(|m| m.to_uppercase()).collect();
        for m in &n.multi { for p in m.split(' ').filter(|p| !p.is_empty()) { n.part_index.entry(p.to_string()).or_default().push(m.clone()); } }
        n
    }

    pub fn all(&self) -> Vec<String> { self.names.iter().chain(&self.multi).cloned().collect() }

    /// คำนี้เป็นส่วนของชื่อหลายคำที่อยู่ในข้อความไหม · ตาม IsInNamesMultiWordList
    pub fn in_multi(&self, input: &str, word: &str) -> bool {
        if input.is_empty() || word.is_empty() { return false; }
        if self.multi.contains(word) || self.multi_upper.contains(word) { return true; }
        let Some(c) = self.part_index.get(word) else { return false };
        let text = input.replace("\r\n", " ").replace('\n', " ").split_whitespace().collect::<Vec<_>>().join(" ");
        c.iter().any(|m| text.contains(m.as_str()))
    }

    /// เพิ่มชื่อลงไฟล์ของผู้ใช้ (ไฟล์เดิมลงถังขยะ) · ตาม NameList.Add
    pub fn add(&mut self, name: &str) {
        self.black.remove(name);
        if name.contains(' ') { self.multi.insert(name.into()); } else { self.names.insert(name.into()); }
        let mut doc = read(&self.user_file).unwrap_or_else(|| "<names><blacklist></blacklist></names>".into());
        if !xml_tags(&doc, "name").iter().any(|x| x == name) {
            if let Some(p) = doc.rfind("</names>") { doc.insert_str(p, &format!("<name>{}</name>", xml_escape(name))); }
            let _ = write_user(&self.user_file, &doc);
        }
    }
}

fn write_user(file: &Path, doc: &str) -> Result<(), String> {
    if let Some(d) = file.parent() { std::fs::create_dir_all(d).map_err(|e| format!("สร้างโฟลเดอร์ไม่ได้ {e}"))?; }
    let part = PathBuf::from(format!("{}.partial", file.display()));
    std::fs::write(&part, doc).map_err(|e| format!("เขียนไฟล์ {} ไม่ได้ {e}", file.display()))?;
    crate::outfile::replace_with(&part, file)
}

// ---------------------------------------------------------------- รายชื่อกับคำของผู้ใช้

const PERIOD_AND_DASH: [char; 2] = ['.', '-'];

/// รายชื่อเฉพาะ คำของผู้ใช้ วลี และชื่อที่มีจุดหรือขีด · ตาม SpellCheckWordLists
#[derive(Default)]
pub struct WordLists {
    lang: String,
    pub names: NameList,
    upper: HashSet<String>,
    apostrophe: HashSet<String>,
    dashed: HashSet<String>,
    dashed_by_part: HashMap<String, Vec<String>>,
    user_words: HashSet<String>,
    user_phrases: HashSet<String>,
    removed: HashSet<String>,
    user_file: PathBuf,
}

impl WordLists {
    /// five ชื่อพจนานุกรม (en_US) ว่างคือไม่มีภาษา
    pub fn load(dict_dir: &Path, user_dir: &Path, five: &str) -> Self {
        let names = NameList::load(dict_dir, user_dir, five);
        let mut w = WordLists { lang: five.into(), user_file: user_dir.join(format!("{five}_user.xml")), ..Default::default() };
        w.upper = names.names.iter().map(|n| n.to_uppercase()).collect();
        if five.to_lowercase().starts_with("en_") {
            for n in &names.names {
                if !n.ends_with('s') { w.apostrophe.insert(format!("{n}'s")); w.apostrophe.insert(format!("{n}’s")); }
                else if !n.ends_with('\'') { w.apostrophe.insert(format!("{n}'")); }
            }
        }
        let two: String = five.chars().take(2).collect::<String>().to_lowercase();
        let mut paths = vec![user_dir.join(format!("{five}_user.xml")), dict_dir.join(format!("{five}_se.xml")), user_dir.join(format!("{two}_user.xml")), dict_dir.join(format!("{two}_se.xml"))];
        paths.dedup();
        let (mut user_file_words, mut shipped_removed, mut user_removed) = (HashSet::new(), HashSet::new(), HashSet::new());
        for p in &paths {
            let Some(doc) = read(p) else { continue };
            let is_user = p.to_string_lossy().to_lowercase().ends_with("_user.xml");
            let (removed, rest) = xml_section(&doc, "removed");
            for word in xml_tags(&rest, "word") {
                if word.contains(' ') { w.user_phrases.insert(word); } else { if is_user { user_file_words.insert(word.clone()); } w.user_words.insert(word); }
            }
            let r: HashSet<String> = xml_tags(removed, "word").into_iter().collect();
            if is_user { user_removed.extend(r) } else { shipped_removed.extend(r) }
        }
        for u in &user_file_words { shipped_removed.remove(u); }
        w.removed.extend(user_removed);
        w.removed.extend(shipped_removed);
        for r in &w.removed { w.user_words.remove(r); }
        let all: Vec<String> = names.multi.iter().chain(&names.names).chain(&w.user_words).chain(&w.user_phrases).cloned().collect();
        for word in all { if word.contains(PERIOD_AND_DASH) { w.add_dashed(&word); } }
        w.names = names;
        w
    }

    fn add_dashed(&mut self, word: &str) {
        if !self.dashed.insert(word.into()) { return; }
        for p in word.split(PERIOD_AND_DASH).filter(|p| !p.is_empty()) { self.dashed_by_part.entry(p.into()).or_default().push(word.into()); }
    }

    pub fn all_names(&self) -> Vec<String> { self.names.all() }

    pub fn has_name(&self, w: &str) -> bool {
        self.names.names.contains(w) || ((w.starts_with('\'') || w.ends_with('\'')) && self.names.names.contains(w.trim_matches('\'')))
    }

    /// ชื่อตัวใหญ่ล้วน ชื่อที่มี 's ส่วนของชื่อหลายคำ หรือส่วนของชื่อที่มีจุดหรือขีด ที่อยู่ในข้อความ · ตาม HasNameExtended
    pub fn has_name_extended(&self, w: &str, text: &str) -> bool {
        self.upper.contains(w) || self.apostrophe.contains(w) || self.names.in_multi(text, w)
            || (!w.is_empty() && self.dashed_by_part.get(w).is_some_and(|c| c.iter().any(|x| text.contains(x.as_str()))))
    }

    pub fn has_user_word(&self, w: &str) -> bool {
        if self.user_words.is_empty() { return false; }
        let s = normalize_user_word(w);
        self.user_words.contains(&s) || ((s.starts_with('\'') || s.ends_with('\'')) && self.user_words.contains(s.trim_matches('\'')))
    }

    /// เพิ่มชื่อ · ภาษาอังกฤษเพิ่มรูป s และ 's ให้ด้วย · ตาม AddName
    pub fn add_name(&mut self, w: &str) -> bool {
        if w.is_empty() || self.names.names.contains(w) { return false; }
        self.names.names.insert(w.into());
        self.upper.insert(w.to_uppercase());
        if self.lang.starts_with("en_") && !w.ends_with('s') { self.names.names.insert(format!("{w}s")); self.upper.insert(format!("{}S", w.to_uppercase())); }
        if !w.ends_with('s') { self.apostrophe.insert(format!("{w}'s")); self.upper.insert(format!("{}'S", w.to_uppercase())); }
        if !w.ends_with('\'') { self.apostrophe.insert(format!("{w}'")); }
        if w.contains(PERIOD_AND_DASH) { self.add_dashed(w); }
        self.names.add(w);
        true
    }

    /// เพิ่มคำลงพจนานุกรมของผู้ใช้ · ตาม AddUserWord
    pub fn add_user_word(&mut self, w: &str) -> bool {
        let w = normalize_user_word(w);
        if w.is_empty() || self.user_words.contains(&w) { return false; }
        if w.contains(' ') { self.user_phrases.insert(w.clone()); } else { self.user_words.insert(w.clone()); }
        self.removed.remove(&w);
        let mut doc = read(&self.user_file).unwrap_or_else(|| "<words></words>".into());
        if let Some(p) = doc.rfind("</words>") { doc.insert_str(p, &format!("<word>{}</word>", xml_escape(&w))); }
        let _ = write_user(&self.user_file, &doc);
        true
    }
}

/// อะพอสทรอฟีโค้งเป็นตัวตรง ตัดช่องว่างหัวท้าย · ตาม Utilities.NormalizeUserDictionaryWord
pub fn normalize_user_word(w: &str) -> String { w.trim().replace(['’', '‘'], "'") }

// ---------------------------------------------------------------- คำย่อ

/// คำย่อของภาษา (จบด้วยจุด) เก็บเป็นตัวเล็ก · ตาม AbbreviationList.Load
pub fn load_abbreviations(dict_dir: &Path, five: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    if five.is_empty() { return set; }
    let two: String = five.chars().take(2).collect();
    let mut files = vec![dict_dir.join(format!("{two}_abbreviations.xml"))];
    if five.chars().count() > 2 { files.push(dict_dir.join(format!("{five}_abbreviations.xml"))); }
    for f in files {
        let Some(doc) = read(&f) else { continue };
        for a in xml_tags(&doc, "Item") { if a.chars().count() > 1 && a.ends_with('.') { set.insert(a.to_lowercase()); } }
    }
    set
}

// ---------------------------------------------------------------- คำที่เขียนติดกัน

/// รายการคำสำหรับแยกคำติด เรียงยาวก่อน รวมชื่อที่ยาวเกินสี่ตัว · ตาม LoadWordSplitList
pub fn load_split_list(dict_dir: &Path, lang3: &str, names: &[String]) -> Vec<String> {
    let Some(doc) = read(&dict_dir.join(format!("{lang3}_WordSplitList.txt"))) else { return vec![] };
    let mut v: Vec<String> = doc.lines().filter(|l| !l.trim().is_empty()).map(|l| l.to_string()).collect();
    if lang3 == "eng" {
        v.extend(["Andor", "honour", "honours", "putain", "whoah", "eastside", "Starpath", "comlink", "Taamet", "Atwater", "Lakeview", "Glassman", "Starfleet",
            "Coulda", "Woulda", "percenters", "starbase", "damnit", "Goddamnit", "Goodfellas", "Stillwater", "ahold", "Coldplay"].map(String::from));
    }
    v.extend(names.iter().filter(|n| n.chars().count() > 4).cloned());
    v.sort_by_key(|w| std::cmp::Reverse(w.chars().count()));
    v
}

/// ชื่อเฉพาะตัวใหญ่หน้าที่ไม่ควรแยก · ตาม IsProperCaseToKeep
fn proper_case_to_keep(input: &str, lang3: &str) -> bool {
    let c: Vec<char> = input.chars().collect();
    if c.len() > 1 && c[0].is_uppercase() && input != input.to_lowercase() && input != input.to_uppercase() && c.len() < 12 {
        if input.starts_with("Mc") || input.starts_with("Mac") { return true; }
        return !((c[0] == 'I' || c[0] == 'A') && lang3 == "eng");
    }
    false
}

/// แยกคำที่เขียนติดกันเป็นคำในรายการ จำนวนคำน้อยที่สุด เสมอกันเลือกคำยาวก่อน · ไม่ได้คืนเดิม · ตาม SplitWord
pub fn split_word(words: &[String], input: &str, lang3: &str) -> String {
    if input.is_empty() { return input.into(); }
    let set: HashSet<&str> = words.iter().map(|s| s.as_str()).collect();
    if set.contains(input) || proper_case_to_keep(input, lang3) { return input.into(); }
    let c: Vec<char> = input.chars().collect();
    let n = c.len();
    let max_len = words.iter().map(|w| w.chars().count()).max().unwrap_or(0).min(n.saturating_sub(1));
    let mut count = vec![usize::MAX; n + 1];
    let mut len_at = vec![0usize; n + 1];
    count[n] = 0;
    for i in (0..n).rev() {
        for len in (1..=max_len.min(n - i)).rev() {
            let rest = count[i + len];
            if rest == usize::MAX || rest + 1 >= count[i] { continue; }
            let sub: String = c[i..i + len].iter().collect();
            if set.contains(sub.as_str()) { count[i] = rest + 1; len_at[i] = len; }
        }
    }
    if count[0] == usize::MAX { return input.into(); }
    let mut out = String::new();
    let mut i = 0;
    while i < n {
        if i > 0 { out.push(' '); }
        out.extend(&c[i..i + len_at[i]]);
        i += len_at[i];
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_and_two_letter() {
        let w: Vec<String> = ["so", "proud", "of", "you", "pro", "ud"].iter().map(|s| s.to_string()).collect();
        assert_eq!(split_word(&w, "soproudofyou", "eng"), "so proud of you");
        assert_eq!(split_word(&w, "Andy", "eng"), "Andy");
        assert_eq!(two_letter("eng"), "en");
        assert_eq!(two_letter("tha"), "th");
        assert_eq!(xml_tags("<names><blacklist><name>Bill</name></blacklist><name>AT&amp;T</name></names>", "name"), vec!["Bill", "AT&T"]);
    }

    /// รายชื่อกับคำของ Subtitle Edit ภาษาอังกฤษที่แนบมา
    #[test]
    fn english_lists_load() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Dictionaries");
        if !dir.join("en_names.xml").exists() { return; }
        let tmp = std::env::temp_dir().join("movie-shelf-ocrfix-words");
        let w = WordLists::load(&dir, &tmp, "en_US");
        assert!(w.has_name("Aarav"));
        assert!(!w.has_name("Bill"), "Bill อยู่บัญชีดำ");
        assert!(w.has_user_word("'cause"));
        assert!(w.has_name_extended("AARAV", ""));
        assert!(load_abbreviations(&dir, "en_US").contains("mr."));
        assert!(load_split_list(&dir, "eng", &w.all_names()).len() > 1000);
    }
}
