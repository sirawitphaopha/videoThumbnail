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
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};

    #[test]
    fn reasons_and_names() {
        let r = check_line("<i>He's here</i>", Some(0.95), &[("Tesseract".into(), "He’s  here".into())], &[], CONF_MIN);
        assert!(r.is_empty(), "{r:?}");
        let r = check_line("Hc*s", Some(0.5), &[("Tesseract".into(), "He's".into())], &["Hc".into()], CONF_MIN);
        assert_eq!(r.len(), 4, "{r:?}");
        let lines: Vec<String> = ["I met Jean yesterday.", "Did Jean call?", "Ask Jeam about it.", "Jean is late."].iter().map(|s| s.to_string()).collect();
        let v = name_variants(&lines);
        assert!(v[2].iter().any(|x| matches!(x, Reason::NameVariant { word, other, .. } if word == "Jeam" && other == "Jean")), "{v:?}");
        assert!(v[0].is_empty() && v[1].is_empty() && v[3].is_empty());
    }

    fn ocr_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools").join("ocr") }

    /// ผิดจากคำตอบไหม นับเว้นวรรคด้วย (ไม่นับแท็กตัวเอียงกับรูปเครื่องหมายคำพูด) เข้มกว่าที่ใช้เทียบตัวอ่านสองตัว
    fn wrong(got: &str, want: &str) -> bool {
        let f = |s: &str| remove_tags(s).replace(['“', '”'], "\"").replace(['‘', '’'], "'").lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n");
        f(got) != f(want)
    }

    /// ไทย ตัวหลัก PaddleOCR th ตัวช่วย ตัวสอนเองที่ฝึกจาก Leelawadee UI · ภาพที่ตัวหลักผิดต้องถูกชี้ทุกภาพ
    #[test]
    fn thai_wrong_lines_are_flagged() {
        let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
        if !dir.join("th.sup").exists() || !tools.join("ffmpeg.exe").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1")); return; }
        let work = std::env::temp_dir().join("movie-shelf-suspect");
        std::fs::create_dir_all(&work).unwrap();
        let mut db = crate::nocr::NOcrDb::empty(&work.join("th.nocr"));
        let mut rng = crate::nocr_lines::Rng::new(11);
        for (size, italic) in [(64.0, false), (52.0, false), (64.0, true)] {
            crate::ownocr::train_font(&tools, &work, &mut db, "Leelawadee UI", size, false, italic, 60, crate::nocr_lines::Algo::Random, &mut rng).unwrap();
        }
        let shows = crate::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
        let want: Vec<String> = std::fs::read_to_string(dir.join("th.truth.txt")).unwrap().lines().map(|l| l.replace('¶', "\n")).collect();
        let o = crate::paddle::PaddleOpts { lang: "th".into(), ..Default::default() };
        let (mut n_bad, mut caught, mut false_flags, mut confs_bad, mut confs_ok) = (0, 0, 0, vec![], vec![]);
        for (s, w) in shows.iter().zip(&want) {
            let (p, conf) = crate::paddle::read_text(&ocr_dir(), &s.img, &o).unwrap();
            let own = crate::ownocr::OwnReader.read_text(&db, &s.img, &crate::ownocr::OwnOpts::default()).text;
            let r = check_line(&p, Some(conf), &[("ตัวสอนเอง".into(), own)], &[], CONF_MIN);
            let bad = wrong(&p, w);
            if bad { n_bad += 1; confs_bad.push(conf); if !r.is_empty() { caught += 1; } } else { confs_ok.push(conf); if !r.is_empty() { false_flags += 1; } }
        }
        eprintln!("ไทย ตัวหลักผิด {n_bad} ภาพ ชี้ได้ {caught} · ภาพที่ถูกแต่ถูกชี้ {false_flags} จาก {} · ความมั่นใจภาพผิด {confs_bad:?} ภาพถูก {confs_ok:?}", shows.len() - n_bad);
        let _ = std::fs::remove_dir_all(&work);
        assert_eq!(caught, n_bad, "ภาพที่ตัวหลักผิดต้องถูกชี้ทุกภาพ");
    }

    /// ACCA ตัวหลัก PaddleOCR v6 small ตัวช่วย Tesseract eng · ภาพที่ตัวหลักผิดต้องถูกชี้ · ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_TRUTH
    #[test]
    fn acca_wrong_lines_are_flagged() {
        let (Ok(sup), Ok(truth)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_TRUTH")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
        let shows = crate::subs::parse_sup(&std::fs::read(sup).unwrap());
        let want: Vec<String> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
            .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).replace(" ¶ ", "\n").replace('¶', "\n")).collect();
        let work = std::env::temp_dir().join("movie-shelf-suspect-acca");
        std::fs::create_dir_all(&work).unwrap();
        let to = crate::tesseract::TessOpts::default();
        // ตัวแก้คำ OCR ภาษาอังกฤษกับพจนานุกรม en_US แบบที่ตัวคุมงานใช้ · ข้อความที่ผู้ใช้เห็นคือข้อความหลังแก้
        let dict = ocr_dir().join("Dictionaries");
        let hun = ocr_dir().join("hunspell");
        let spell = crate::ocrfix::Hunspell::open(&hun.join("en_US.aff"), &hun.join("en_US.dic")).unwrap();
        let fx = crate::ocrfix::FixEngine::new(&dict, &work.join("user"), "eng", "en_US", Box::new(spell));
        let mut prev: Option<String> = None;
        let mut rows = vec![];
        for (k, s) in shows.iter().enumerate() {
            let (p, conf) = crate::paddle::read_text(&ocr_dir(), &s.img, &crate::paddle::PaddleOpts::default()).unwrap();
            let t = crate::tesseract::read(&ocr_dir(), &work, &work, &s.img, &to, None).map(|x| x.text).unwrap_or_default();
            let lf = fx.fix(k, &p, &crate::ocrfix::Ctx { prev: prev.as_deref(), next_soon_lower: false }, false);
            let text = lf.text();
            let unknown: Vec<String> = lf.unknown().iter().map(|x| x.word.clone()).collect();
            let r = check_line(&text, Some(conf), &[("Tesseract".into(), t)], &unknown, CONF_MIN);
            prev = Some(text.clone());
            rows.push((text, conf, r));
        }
        let names = name_variants(&rows.iter().map(|r| r.0.clone()).collect::<Vec<_>>());
        let (mut bad, mut caught, mut flagged): (Vec<(usize, f32)>, _, _) = (vec![], 0, 0);
        let mut by = [0usize; 4];
        for (k, ((text, conf, mut r), w)) in rows.into_iter().zip(&want).enumerate() {
            r.extend(names[k].iter().cloned());
            if !r.is_empty() { flagged += 1; }
            for x in &r { by[match x { Reason::Disagree { .. } => 0, Reason::Unknown { .. } => 1, Reason::NameVariant { .. } => 2, _ => 3 }] += 1; }
            if wrong(&text, w) { eprintln!("ภาพ {} ข้อความ {text:?} คำตอบ {w:?} เหตุ {r:?}", k + 1); bad.push((k + 1, conf)); if !r.is_empty() { caught += 1; } }
        }
        eprintln!("ACCA ผิด {bad:?} ชี้ได้ {caught} · ภาพที่ถูกชี้ทั้งหมด {flagged} จาก {} ภาพ · ตัวช่วยอ่านไม่ตรง {} คำที่ไม่รู้จัก {} ชื่อสองแบบ {} อื่น {}", shows.len(), by[0], by[1], by[2], by[3]);
        let _ = std::fs::remove_dir_all(&work);
        assert_eq!(caught, bad.len(), "ภาพที่ผิดต้องถูกชี้ทุกภาพ");
    }
}
