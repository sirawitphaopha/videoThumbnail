//! เทสของ ocrjob.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn dirs(tag: &str) -> Dirs {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let tmp = std::env::temp_dir().join(format!("movie-shelf-ocrjob-{tag}"));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    Dirs { ocr: root.join("ocr"), tools: root, user: tmp.join("user"), work: tmp.join("work") }
}

fn th_items(d: &Dirs) -> Option<Vec<OcrItem>> {
    let sup = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr").join("th.sup");
    if !sup.exists() || !d.tools.join("ffmpeg.exe").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return None; }
    std::fs::create_dir_all(&d.work).unwrap();
    let src = crate::ocr::ocrsrc::open(&d.tools, &d.work, &sup, 0, &|_: f64| {}).unwrap();
    Some(src.items)
}

/// หน้าต่างตรวจบรรทัด ฐานว่างไม่มีคู่ เพิ่มคู่ที่ดีกว่าผ่านหน้าต่างสอน วาดเส้นใหม่ บันทึกข้อความกับเส้น ลบ · Binary กับตัวสอนเองเปิดได้ PaddleOCR ไม่ได้
#[test]
fn inspect_window_flow() {
    let d = dirs("inspect");
    let Some(items) = th_items(&d) else { return };
    let mut s = Session::with_items(items);
    let cfg = OcrCfg { engine: "nocr".into(), nocr_db: "ทดสอบ".into(), fix: false, teach: false, ..Default::default() };
    // ฐานว่าง ทุกชิ้นไม่มีคู่ เพิ่มคู่ที่ดีกว่าให้ชิ้นแรกผ่านหน้าต่างสอน
    let v = inspect(&mut s, &d, &cfg, 0).unwrap();
    assert!(v.sentence.starts_with("data:image/png") && v.letters.len() > 3);
    let first = v.letters.iter().position(|l| l.special.is_none()).unwrap();
    assert!(v.letters.iter().all(|l| l.m.is_none()), "ฐานว่างต้องไม่มีคู่");
    let req = inspect_teach(&mut s, &cfg, first).unwrap();
    assert_eq!(req.letter, first);
    teach(&mut s, &cfg, TeachAnswer::Learn { text: "ก".into(), italic: false, expand: 0, lines: None }).unwrap();
    let v = ocr_inspect_reload_with(&mut s, &cfg);
    let m = v.letters[first].m.clone().expect("สอนแล้วต้องจับคู่ได้");
    assert!(m.text == "ก" && m.in_db && !m.fg.is_empty());
    // วาดใหม่ได้เส้น แล้วบันทึกข้อความใหม่พร้อมเส้น ฐานเปลี่ยนตาม
    let (fg, bg) = inspect_draw(&mut s, &cfg, first, 30).unwrap();
    assert!(!fg.is_empty() || !bg.is_empty());
    let v = inspect_update(&mut s, &cfg, first, "ข", true, Some(&DrawnLines { fg: fg.clone(), bg: bg.clone() })).unwrap();
    let m = v.letters[first].m.clone().expect("แก้แล้วยังจับคู่ได้");
    assert!(m.text == "ข" && m.italic);
    let file = d.user.join("nocr").join("ทดสอบ.nocr");
    let db = NOcrDb::load(&file).unwrap();
    assert!(db.chars.iter().any(|c| c.text == "ข" && c.italic && c.fg.len() == fg.len()), "เส้นที่วาดต้องบันทึก");
    assert!(inspect_update(&mut s, &cfg, first, "", false, None).is_err());
    // ลบแล้วชิ้นนั้นไม่มีคู่ ฐานว่าง
    let v = inspect_delete(&mut s, &cfg, first).unwrap();
    assert!(v.letters[first].m.is_none());
    assert_eq!(NOcrDb::load(&file).unwrap().total(), 0);
    assert!(inspect_delete(&mut s, &cfg, first).is_err(), "ไม่มีคู่แล้วลบไม่ได้");
    // Binary OCR กับตัวสอนเองเปิดได้ · ตัวอ่าน PaddleOCR ตรวจบรรทัดไม่ได้
    let vb = inspect(&mut s, &d, &OcrCfg { engine: "binary".into(), bin_db: "ทดสอบ".into(), ..cfg.clone() }, 0).unwrap();
    assert!(vb.letters.iter().any(|l| l.special.is_none()) && vb.engine == "binary");
    let vo = inspect(&mut s, &d, &OcrCfg { engine: "own".into(), own_db: "ทดสอบ".into(), ..cfg.clone() }, 0).unwrap();
    assert!(vo.letters.iter().any(|l| l.special.is_none()));
    assert!(inspect(&mut s, &d, &OcrCfg { engine: "paddle".into(), ..cfg.clone() }, 0).is_err());
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ผลของตัวอ่านข้อความอิสระ ขีดบทพูดต่อกลับเข้าบรรทัด เว้นวรรคระหว่างอักษรญี่ปุ่นตัดทิ้ง ไทยกับอังกฤษคงเดิม (ผู้ช่วยตรวจทาน T8 T14)
#[test]
fn tidy_free_text() {
    assert_eq!(tidy_free("ゴ ジ ラ が\n来る"), "ゴジラが\n来る");
    assert_eq!(tidy_free("สวัสดี ครับ Hello world"), "สวัสดี ครับ Hello world");
    assert_eq!(tidy_free("咆哮　が"), "咆哮　が");
    assert_eq!(tidy_free("-\nHello\n-\nBye"), crate::ocr::ocrfix::fix_lone_dashes("-\nHello\n-\nBye"));
    assert_ne!(tidy_free("-\nHello\n-\nBye"), "-\nHello\n-\nBye");
}

/// วาดสีใหม่หลังลบบรรทัด ภาพตามเลขภาพ ไม่ตามลำดับ (ผู้ช่วยตรวจทาน R1)
#[test]
fn images_follow_file_not_order() {
    // ลบบรรทัดที่ 2 แล้ววาดสีใหม่ทั้งไฟล์ (ได้ภาพครบทุกเลข) ภาพของบรรทัดที่เหลือต้องเป็นเลขเดิมของตัวเอง ไม่เลื่อน (ผู้ช่วยตรวจทาน R1)
    let d = dirs("apply");
    let Some(items) = th_items(&d) else { return };
    let mut s = Session::with_items(items.clone());
    remove_items(&mut s, &[1]);
    let mut fresh: Vec<crate::subtitle::subs::SubImg> = items.iter().map(|i| i.img.clone()).collect();
    for f in fresh.iter_mut() { f.w += 1000; }
    apply_images(&mut s, &fresh);
    assert_eq!(s.items.len(), items.len() - 1);
    for it in &s.items { assert_eq!(it.img.w, items.iter().find(|x| x.img.n == it.img.n).unwrap().img.w + 1000, "ภาพที่ {} ต้องได้ภาพของตัวเอง", it.img.n); }
    assert!(s.items.iter().all(|it| it.img.n != items[1].img.n));
    // ภาพของซับอื่น (ไฟล์คนละที่) ไม่แตะ
    let mut other = fresh.clone();
    for f in other.iter_mut() { f.file = std::path::PathBuf::from("Z:/อื่น").join(f.file.file_name().unwrap()); f.w = 1; }
    apply_images(&mut s, &other);
    assert!(s.items.iter().all(|it| it.img.w > 1000));
}

/// ลบภาพลำดับ 1 กับ 3 ข้อความของภาพอื่นเลื่อนลำดับตาม ประวัติของภาพที่ลบหายไป
#[test]
fn remove_items_shifts_state() {
    let d = dirs("remove");
    let Some(items) = th_items(&d) else { return };
    let n = items.len();
    let mut s = Session::with_items(items);
    for k in 0..5 { s.texts.insert(k, format!("t{k}")); }
    s.history.push(Taught { index: 3, engine: "nocr".into(), db: "x".into(), text: "a".into(), italic: false, pieces: 1, png: String::new(), at: 0, key: HistKey::None });
    s.history.push(Taught { index: 4, engine: "nocr".into(), db: "x".into(), text: "b".into(), italic: false, pieces: 1, png: String::new(), at: 0, key: HistKey::None });
    remove_items(&mut s, &[1, 3, 999]);
    assert_eq!(s.items.len(), n - 2);
    assert_eq!((s.texts[&0].as_str(), s.texts[&1].as_str(), s.texts[&2].as_str()), ("t0", "t2", "t4"));
    assert!(s.texts.get(&3).is_none());
    assert_eq!(s.history.len(), 1);
    assert_eq!((s.history[0].text.as_str(), s.history[0].index), ("b", 2));
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

fn ocr_inspect_reload_with(s: &mut Session, cfg: &OcrCfg) -> InspView { s.insp_match(cfg).unwrap(); s.insp_view().unwrap() }

/// ฐาน nOCR ว่าง เปิดหยุดสอน · ภาพแรกต้องได้คำขอสอน ข้ามทุกตัวจนได้ผลที่เป็น * ทั้งหมด
/// สอนตัวแรกแล้วฐานบันทึกลงโฟลเดอร์ของผู้ใช้ เปิดฐานใหม่เจอตัวที่สอน · ใช้ครั้งเดียวได้ข้อความนั้นในผล · หยุดล้างคำตอบ
#[test]
fn teach_loop_with_empty_nocr_db() {
    let d = dirs("teach");
    let Some(items) = th_items(&d) else { return };
    let mut s = Session::with_items(items);
    let cfg = OcrCfg { engine: "nocr".into(), nocr_db: "ทดสอบ".into(), fix: false, ..Default::default() };
    // ข้ามทุกตัว
    let mut asked = 0;
    let out = loop {
        match read(&mut s, &d, &cfg, 0).unwrap() {
            ReadResult::Teach(r) => {
                assert!(r.image.starts_with("data:image/png;base64,") && r.boxes[r.letter].is_some());
                asked += 1;
                assert!(asked < 200, "ถามไม่จบ");
                teach(&mut s, &cfg, TeachAnswer::Skip).unwrap();
            }
            ReadResult::Done(o) => break o,
        }
    };
    assert!(asked > 3, "ภาพไทยต้องมีหลายชิ้น ได้ {asked}");
    assert_eq!(out.unreadable, asked);
    assert!(out.reasons.contains(&Reason::Unreadable), "{:?}", out.reasons);
    // ครั้งใหม่ ถามตัวแรกอีก สอนเป็น "ก"
    let ReadResult::Teach(r) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ต้องถามสอนอีกครั้ง") };
    assert_eq!(r.letter, 0);
    teach(&mut s, &cfg, TeachAnswer::Learn { text: "ก".into(), italic: false, expand: 0, lines: None }).unwrap();
    let file = d.user.join("nocr").join("ทดสอบ.nocr");
    assert!(file.is_file(), "ฐานต้องบันทึกลงโฟลเดอร์ของผู้ใช้");
    assert_eq!(NOcrDb::load(&file).unwrap().chars.iter().filter(|c| c.text == "ก").count(), 1);
    assert_eq!(s.history.len(), 1);
    // หน้าต่างตัวที่สอนไปแล้ว มีภาพ แก้ข้อความกับตัวเอียงแล้วฐานเปลี่ยนตาม ข้อความว่างไม่บันทึก
    assert!(s.history[0].png.starts_with("data:image/png") && s.history[0].at > 0);
    history_update(&mut s, 0, "ข", true).unwrap();
    let f = NOcrDb::load(&file).unwrap();
    assert!(f.chars.iter().any(|c| c.text == "ข" && c.italic) && !f.chars.iter().any(|c| c.text == "ก"));
    assert!(s.history[0].text == "ข" && s.history[0].italic);
    assert!(history_update(&mut s, 0, "", false).is_err());
    assert!(history_update(&mut s, 5, "x", false).is_err());
    // อ่านซ้ำ ตัวแรกจับคู่ได้แล้ว ตัวที่ถามต้องไม่ใช่ตัวแรก แล้วใช้ครั้งเดียว "x" กับตัวนั้น หยุดทั้งงาน
    let ReadResult::Teach(r2) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ยังมีตัวที่ไม่รู้จัก") };
    assert!(r2.letter > 0, "ตัวที่สอนแล้วต้องไม่ถามซ้ำ");
    teach(&mut s, &cfg, TeachAnswer::Once { text: "x".into(), expand: 0 }).unwrap();
    assert_eq!(s.once.get(&0).and_then(|m| m.get(&r2.letter)).map(String::as_str), Some("x"));
    let ReadResult::Teach(_) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ยังมีตัวที่ไม่รู้จัก") };
    teach(&mut s, &cfg, TeachAnswer::Stop).unwrap();
    assert!(s.once.get(&0).is_none() && s.skip.get(&0).is_none() && s.pending.is_none());
    assert!(teach(&mut s, &cfg, TeachAnswer::Skip).is_err(), "ไม่มีตัวที่รอสอนแล้ว");
    // เปิดงานใหม่ ฐานของผู้ใช้ถูกเปิดแทนฐานว่าง
    let s2 = load_nocr(&d, "nocr", "ทดสอบ").unwrap();
    assert_eq!(s2.chars.len(), 1);
    // ลบจากหน้าต่างตัวที่สอนไปแล้ว ฐานกับประวัติไม่มีตัวนั้น
    history_delete(&mut s, 0).unwrap();
    assert!(s.history.is_empty());
    assert_eq!(NOcrDb::load(&file).unwrap().chars.len(), 0);
    assert!(load_nocr(&d, "nocr", "../x").is_err());
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ฐานที่แนบมาเปิดได้ แต่ที่บันทึกเป็นโฟลเดอร์ของผู้ใช้ · ฐานของผู้ใช้ชื่อเดียวกันมาก่อน
#[test]
fn bundled_db_saves_to_user_dir() {
    let d = dirs("paths");
    if !d.ocr.join("Ocr").join("Latin.nocr").is_file() { return; }
    let (from, to) = db_paths(&d, "nocr", "Latin");
    assert_eq!(from, d.ocr.join("Ocr").join("Latin.nocr"));
    assert_eq!(to, d.user.join("nocr").join("Latin.nocr"));
    let db = load_nocr(&d, "nocr", "Latin").unwrap();
    assert!(db.chars.len() > 100 && db.file == to);
    std::fs::create_dir_all(to.parent().unwrap()).unwrap();
    db.save().unwrap();
    assert_eq!(db_paths(&d, "nocr", "Latin").0, to);
    let l = db_list(&d);
    assert!(l.nocr.contains(&"Latin".to_string()) && l.binary.contains(&"Latin".to_string()));
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ซับไทย ตัวหลัก PaddleOCR th ตัวช่วย PaddleOCR th ขนาดอื่นไม่มี จึงใช้ตัวสอนเองฐานว่างเป็นตัวช่วย (อ่านได้ * ทุกตัว ต้องถูกชี้)
/// ตัวแก้คำไทยไม่มีพจนานุกรม ไม่มีคำที่ไม่รู้จัก · ตำแหน่งแบบ ASS ของภาพที่มีป้ายบนจอกับบทพูดแยกทีละบรรทัด
#[test]
fn paddle_thai_with_helper_and_fix() {
    let d = dirs("thai");
    let Some(items) = th_items(&d) else { return };
    let n = items.len();
    let mut s = Session::with_items(items);
    let cfg = OcrCfg { paddle: PaddleOpts { lang: "th".into(), ..Default::default() }, helpers: vec!["own".into(), "paddle:small".into()], lang3: "tha".into(), dict: String::new(), ..Default::default() };
    let mut any_split = false;
    for i in 0..n {
        let ReadResult::Done(o) = read(&mut s, &d, &cfg, i).unwrap() else { panic!("PaddleOCR ไม่หยุดสอน") };
        assert!(o.conf.is_some() && o.unknown.is_empty(), "{o:?}");
        assert_eq!(o.helpers.len(), 1, "paddle:small ซ้ำกับตัวหลัก ต้องข้าม");
        assert_eq!(o.helpers[0].0, "ตัวสอนเอง");
        if !o.text.is_empty() { assert!(o.reasons.iter().any(|r| matches!(r, Reason::Disagree { .. })), "ภาพ {} {:?}", i + 1, o.reasons); }
        if o.an_lines.as_ref().is_some_and(|v| v.first() != v.last()) { any_split = true; }
    }
    eprintln!("ซับไทย {n} ภาพ มีภาพที่ตำแหน่งแยกทีละบรรทัด {any_split}");
    assert_eq!(s.texts.len(), n);
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ภาพซับไทยสามภาพวางซ้อนเป็นภาพเดียวสามบรรทัด (ห่างกัน 10 จุด ก้อนเดียวกัน) อ่านจริงด้วย PaddleOCR
/// เปิดตัดบรรทัดเองได้สองบรรทัด ข้อความครบ · ปิดได้สามบรรทัดตามภาพ (ocrbreak.rs AutoBreakIfNeeded)
#[test]
fn auto_break_three_line_image() {
    let d = dirs("autobreak");
    let Some(items) = th_items(&d) else { return };
    // ภาพบรรทัดเดียว ครอปส่วนใสออก (ภาพบางภาพของไฟล์ทดสอบมีป้ายบนจอแยกจากบทพูด)
    let parts: Vec<image::RgbaImage> = items.iter().map(|it| crate::ocr::ocrprep::crop_transparent(&image::open(&it.img.file).unwrap().to_rgba8()).0).filter(|p| p.height() < 110).take(3).collect();
    assert_eq!(parts.len(), 3, "ซับไทยทดสอบต้องมีภาพบรรทัดเดียวอย่างน้อยสามภาพ");
    let w = parts.iter().map(|p| p.width()).max().unwrap();
    let h = parts.iter().map(|p| p.height()).sum::<u32>() + 20;
    let mut big = image::RgbaImage::new(w, h);
    let mut y = 0;
    for p in &parts {
        image::imageops::overlay(&mut big, p, ((w - p.width()) / 2) as i64, y as i64);
        y += p.height() + 10;
    }
    let file = d.work.join("three.png");
    big.save(&file).unwrap();
    let first = &items[0].img;
    let img = crate::subtitle::subs::SubImg { n: 1, start: first.start, end: first.end, w, h, canvas: first.canvas, at: [first.canvas[0].saturating_sub(w) / 2, first.canvas[1].saturating_sub(h + 40)], forced: false, file };
    eprintln!("จอ {:?} ภาพ {w}x{h}", first.canvas);
    assert!(!crate::ocr::ocrsrc::has_separated_blocks(&big, &img), "สามบรรทัดชิดกันต้องเป็นก้อนเดียว");
    let base = OcrCfg { paddle: PaddleOpts { lang: "th".into(), ..Default::default() }, lang3: "tha".into(), dict: String::new(), fix: false, ..Default::default() };
    let run = |auto: bool| {
        let mut s = Session::with_items(vec![OcrItem { an: 2, img: img.clone() }]);
        let ReadResult::Done(o) = read(&mut s, &d, &OcrCfg { auto_break: auto, ..base.clone() }, 0).unwrap() else { panic!() };
        o
    };
    let off = run(false);
    let on = run(true);
    eprintln!("ปิด {:?}\nเปิด {:?}", off.text, on.text);
    assert!(crate::ocr::ocrbreak::number_of_lines(&off.text) >= 3, "{:?}", off.text);
    assert_eq!(crate::ocr::ocrbreak::number_of_lines(&on.text), 2, "{:?}", on.text);
    let squash = |t: &str| t.split_whitespace().collect::<String>();
    assert_eq!(squash(&on.text), squash(&off.text), "ตัดบรรทัดแล้วข้อความต้องครบ");
    assert_eq!(on.raw, off.raw, "ข้อความดิบของตัวอ่านไม่ถูกแก้");
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}

/// ACCA 30 ภาพแรก ตัวหลัก PaddleOCR ตัวช่วย Tesseract กับตัวแก้คำภาษาอังกฤษ · ตั้ง MOVIE_SHELF_OCR_SUP
#[test]
fn acca_paddle_tesseract_fix() {
    let Ok(sup) = std::env::var("MOVIE_SHELF_OCR_SUP") else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let d = dirs("acca");
    std::fs::create_dir_all(&d.work).unwrap();
    let src = crate::ocr::ocrsrc::open(&d.tools, &d.work, Path::new(&sup), 0, &|_: f64| {}).unwrap();
    assert_eq!(src.items.len(), 439);
    let mut s = Session::with_items(src.items);
    let cfg = OcrCfg { helpers: vec!["tesseract".into()], ..Default::default() };
    let (mut flagged, mut ms) = (0, 0);
    for i in 0..30 {
        let ReadResult::Done(o) = read(&mut s, &d, &cfg, i).unwrap() else { panic!() };
        assert!(!o.text.is_empty() && o.helpers.len() == 1 && o.helpers[0].0 == "Tesseract");
        if !o.reasons.is_empty() { flagged += 1; }
        ms += o.ms;
    }
    eprintln!("ACCA 30 ภาพ ถูกชี้ {flagged} ภาพ เฉลี่ย {} ms ต่อภาพ", ms / 30);
    // ชื่อสองแบบดูทั้งไฟล์
    let lines: Vec<String> = (0..30).map(|i| s.texts[&i].clone()).collect();
    assert_eq!(ocr_names(lines).len(), 30);
    let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
}
