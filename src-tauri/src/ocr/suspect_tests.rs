//! เทสของ suspect.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
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
    let mut db = crate::ocr::nocr::NOcrDb::empty(&work.join("th.nocr"));
    let mut rng = crate::ocr::nocr_lines::Rng::new(11);
    for (size, italic) in [(64.0, false), (52.0, false), (64.0, true)] {
        crate::ocr::ownocr::train_font(&tools, &work, &mut db, "Leelawadee UI", size, false, italic, 60, crate::ocr::nocr_lines::Algo::Random, &mut rng).unwrap();
    }
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
    let want: Vec<String> = std::fs::read_to_string(dir.join("th.truth.txt")).unwrap().lines().map(|l| l.replace('¶', "\n")).collect();
    let o = crate::ocr::paddle::PaddleOpts { lang: "th".into(), ..Default::default() };
    let (mut n_bad, mut caught, mut false_flags, mut confs_bad, mut confs_ok) = (0, 0, 0, vec![], vec![]);
    for (s, w) in shows.iter().zip(&want) {
        let (p, conf) = crate::ocr::paddle::read_text(&ocr_dir(), &s.img, &o).unwrap();
        let own = crate::ocr::ownocr::OwnReader.read_text(&db, &s.img, &crate::ocr::ownocr::OwnOpts::default()).text;
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
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let want: Vec<String> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
        .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).replace(" ¶ ", "\n").replace('¶', "\n")).collect();
    let work = std::env::temp_dir().join("movie-shelf-suspect-acca");
    std::fs::create_dir_all(&work).unwrap();
    let to = crate::ocr::tesseract::TessOpts::default();
    // ตัวแก้คำ OCR ภาษาอังกฤษกับพจนานุกรม en_US แบบที่ตัวคุมงานใช้ · ข้อความที่ผู้ใช้เห็นคือข้อความหลังแก้
    let dict = ocr_dir().join("Dictionaries");
    let hun = ocr_dir().join("hunspell");
    let spell = crate::ocr::ocrfix::Hunspell::open(&hun.join("en_US.aff"), &hun.join("en_US.dic")).unwrap();
    let fx = crate::ocr::ocrfix::FixEngine::new(&dict, &work.join("user"), "eng", "en_US", Box::new(spell));
    let mut prev: Option<String> = None;
    let mut rows = vec![];
    for (k, s) in shows.iter().enumerate() {
        let (p, conf) = crate::ocr::paddle::read_text(&ocr_dir(), &s.img, &crate::ocr::paddle::PaddleOpts::default()).unwrap();
        let t = crate::ocr::tesseract::read(&ocr_dir(), &work, &work, &s.img, &to, None).map(|x| x.text).unwrap_or_default();
        let lf = fx.fix(k, &p, &crate::ocr::ocrfix::Ctx { prev: prev.as_deref(), next_soon_lower: false }, false);
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
