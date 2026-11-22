//! เทสของ ocrfix.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// คำไทย ญี่ปุ่น จีน เกาหลี ไม่นับเป็นคำที่ไม่รู้จัก คำอังกฤษยังตรวจตามพจนานุกรม (ผู้ช่วยตรวจทาน T3)
#[test]
fn cjk_and_thai_words_are_not_unknown() {
    for w in ["咆哮が聞こえる", "ゴジラ", "สวัสดี", "안녕"] { assert!(no_dict_script(w), "{w}"); }
    for w in ["Hello", "Beets", "123"] { assert!(!no_dict_script(w), "{w}"); }
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

/// ผลที่ nOCR อ่าน ACCA ด้วยฐาน Latin ผ่านตัวแก้คำกับพจนานุกรม en_US แล้วต้องใกล้คำตอบขึ้น (ถูกทั้งภาพมากขึ้น อักขระผิดน้อยลง)
/// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_TRUTH · ห้ามขึ้น git
#[test]
fn acca_nocr_text_gets_closer() {
    let (Ok(sup), Ok(truth)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_TRUTH")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr");
    let dict = root.join("Dictionaries");
    let db = crate::ocr::nocr::NOcrDb::load(&root.join("Ocr/Latin.nocr")).unwrap();
    let hun = root.join("hunspell");
    let spell = Hunspell::open(&hun.join("en_US.aff"), &hun.join("en_US.dic")).unwrap();
    let mut fx = FixEngine::new(&dict, &std::env::temp_dir().join("movie-shelf-ocrfix-acca"), "eng", "en_US", Box::new(spell));
    fx.image_misreads = true;
    fx.fill_unknown = true;
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let want: Vec<String> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
        .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).replace(" ¶ ", "\n").replace('¶', "\n")).collect();
    let plain = |s: &str| remove_tags(s).replace(['“', '”'], "\"").replace(['‘', '’'], "'").lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n");
    let reader = crate::ocr::nocr_text::NOcrReader::default();
    let o = crate::ocr::nocr_text::ReadOpts { max_wrong: 25, italic: 0.0, space_px: 0, last_ditch: true, teach: false };
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

/// / ที่อ่านพลาดในคำซ้ำ ตัดสินต้นประโยคจากตำแหน่งของคำนั้นเอง ไม่ใช่ของคำแรกที่หน้าตาเหมือนกัน (ผู้ช่วยตรวจทาน R22)
#[test]
fn slash_uses_own_position() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr");
    let hun = root.join("hunspell");
    let Ok(spell) = Hunspell::open(&hun.join("en_US.aff"), &hun.join("en_US.dic")) else { return };
    let fx = FixEngine::new(&root.join("Dictionaries"), &std::env::temp_dir().join("movie-shelf-ocrfix-r22"), "eng", "en_US", Box::new(spell));
    assert_eq!(fx.fix_slash("/t's fine. Yes, /t's me"), "It's fine. Yes, it's me");
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
