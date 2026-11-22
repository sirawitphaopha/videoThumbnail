//! เทสของ binocr.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::{Rgba, RgbaImage};

fn latin() -> Option<BinDb> {
    let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.db");
    p.exists().then(|| BinDb::load(&p).unwrap())
}

/// ค่า hash ตรงกับที่ Subtitle Edit เก็บในฐาน Latin ทุกภาพ (คิดใหม่จากจุดของภาพเอง)
#[test]
fn murmur_matches_se_db() {
    let Some(db) = latin() else { return };
    assert!(db.images.len() > 500, "ฐาน Latin มี {} ภาพ", db.images.len());
    let bad = db.images.iter().filter(|b| murmur3(&b.colors) != b.hash).count();
    assert_eq!(bad, 0, "hash ไม่ตรง {bad} ภาพ");
}

/// บันทึกแล้วเปิดใหม่ได้ภาพเท่าเดิมทุกภาพ
#[test]
fn db_roundtrip() {
    let Some(db) = latin() else { return };
    let dir = std::env::temp_dir().join("movie-shelf-binocr-rt");
    let _ = std::fs::create_dir_all(&dir);
    let mut copy = BinDb::load(&db.file).unwrap();
    copy.file = dir.join("t.db");
    copy.save().unwrap();
    let back = BinDb::load(&copy.file).unwrap();
    assert_eq!((back.images.len(), back.expanded.len()), (db.images.len(), db.expanded.len()));
    assert!(back.images.iter().zip(&db.images).all(|(a, b)| a.colors == b.colors && a.text == b.text && a.hash == b.hash && a.y == b.y));
    let _ = std::fs::remove_dir_all(&dir);
}

fn bar(img: &mut RgbaImage, x0: u32, y0: u32, w: u32, h: u32) { for y in y0..y0 + h { for x in x0..x0 + w { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } } }

/// ภาพที่สอนแล้วอ่านกลับได้ตรงพอดี · ภาพเดิมสอนซ้ำตอบว่ามีแล้ว
#[test]
fn teach_and_read_back() {
    let mut img = RgbaImage::new(80, 40);
    bar(&mut img, 5, 5, 6, 25);
    bar(&mut img, 30, 5, 18, 25);
    let reader = BinReader::new("Test");
    let mut db = BinDb::empty(Path::new("t.db"));
    let r = reader.read_text(&db, &img, &BinOpts::default());
    assert_eq!(r.unknown, 2);
    let first = r.pieces.iter().position(|p| p.bmp.is_some()).unwrap();
    let last = r.pieces.iter().rposition(|p| p.bmp.is_some()).unwrap();
    db.add(teach_bitmap(&r.pieces, first, 1, "l", false).unwrap()).unwrap();
    db.add(teach_bitmap(&r.pieces, last, 1, "I", true).unwrap()).unwrap();
    assert!(db.add(teach_bitmap(&r.pieces, first, 1, "l", false).unwrap()).is_err());
    let r2 = reader.read_text(&db, &img, &BinOpts::default());
    assert_eq!(r2.text, "l <i>I</i>");
}

/// ฐานสำรองข้ามตัวอ่านทั้งสองทาง · ตัวที่ตัวอ่านหลักไม่รู้จักแต่อีกตัวรู้จัก ต้องอ่านออก ไม่เหลือ *
#[test]
fn fallbacks_fill_unknowns() {
    let mut img = RgbaImage::new(80, 40);
    bar(&mut img, 5, 5, 6, 25);
    bar(&mut img, 30, 5, 18, 25);
    // Binary OCR รู้จักทั้งสองตัว · nOCR ฐานว่าง
    let probe = BinReader::new("Test").read_text(&BinDb::empty(Path::new("t.db")), &img, &BinOpts::default());
    let glyphs: Vec<usize> = probe.pieces.iter().enumerate().filter(|p| p.1.bmp.is_some()).map(|p| p.0).collect();
    let mut bdb = BinDb::empty(Path::new("t.db"));
    bdb.add(teach_bitmap(&probe.pieces, glyphs[0], 1, "l", false).unwrap()).unwrap();
    bdb.add(teach_bitmap(&probe.pieces, glyphs[1], 1, "I", false).unwrap()).unwrap();
    let ndb = crate::ocr::nocr::NOcrDb::empty(Path::new("t.nocr"));
    let reader = crate::ocr::nocr_text::NOcrReader::default();
    let alone = reader.read_text(&ndb, &img, &crate::ocr::nocr_text::ReadOpts::default());
    assert_eq!(alone.unknown, 2, "nOCR ฐานว่างต้องอ่านไม่ออก {:?}", alone.text);
    let m = Mutex::new(Matcher::new(false));
    let fb = binary_fallback(&bdb, &m, 0.5);
    let out = match reader.read(&ndb, &img, &crate::ocr::nocr_text::ReadOpts::default(), &HashSet::new(), &HashMap::new(), Some(&fb)) { ReadOut::Done(r) => r, _ => panic!("ไม่ควรหยุดสอน") };
    assert_eq!((out.unknown, out.text.replace(' ', "")), (0, "lI".to_string()), "nOCR ใช้ Binary OCR สำรอง");
    // nOCR รู้จักทั้งสองตัว · Binary OCR ฐานว่าง
    let mut ndb = crate::ocr::nocr::NOcrDb::empty(Path::new("t.nocr"));
    for (k, t) in [(glyphs[0], "l"), (glyphs[1], "I")] {
        let p = &probe.pieces[k];
        let b = p.bmp.as_ref().unwrap();
        let mut c = crate::ocr::nocr::NChar { text: t.into(), width: b.width() as i32, height: b.height() as i32, margin_top: p.top, ..Default::default() };
        crate::ocr::nocr_lines::generate(60, false, &mut c, b, crate::ocr::nocr_lines::Algo::Random, &mut crate::ocr::nocr_lines::Rng::new(3));
        ndb.add(c);
    }
    let case = Mutex::new(crate::ocr::nocr_text::CaseFixer::default());
    let fb = nocr_fallback(&ndb, &case, 25, 0.0);
    let out = match BinReader::new("Test").read(&BinDb::empty(Path::new("t.db")), &img, &BinOpts::default(), &HashSet::new(), &HashMap::new(), Some(&fb)) { ReadOut::Done(r) => r, _ => panic!("ไม่ควรหยุดสอน") };
    assert_eq!((out.unknown, out.text.replace(' ', "")), (0, "lI".to_string()), "Binary OCR ใช้ nOCR สำรอง");
}

/// เจอตัวที่ไม่รู้จักตอนเปิดสอน หยุดคืนชิ้นนั้น · กดข้ามใส่ * · ใช้ครั้งเดียวใส่ข้อความที่พิมพ์
#[test]
fn teach_skip_and_run_once() {
    let mut img = RgbaImage::new(80, 40);
    bar(&mut img, 5, 5, 6, 25);
    bar(&mut img, 30, 5, 18, 25);
    let db = BinDb::empty(Path::new("t.db"));
    let r = BinReader::new("Test");
    let o = BinOpts { teach: true, ..Default::default() };
    let ReadOut::Teach { letter, .. } = r.read(&db, &img, &o, &HashSet::new(), &HashMap::new(), None) else { panic!("ต้องหยุดสอน") };
    let skip: HashSet<usize> = [letter].into();
    let once: HashMap<usize, String> = [(letter + 2, "X".to_string())].into();
    let ReadOut::Done(d) = r.read(&db, &img, &o, &skip, &once, None) else { panic!("ต้องอ่านจบ") };
    assert_eq!(d.text, "* X");
}

/// รูปทรงที่เดาได้ จุด ขีด ทวิภาค
#[test]
fn shape_guesses() {
    let mk = |w: i32, h: i32, y: i32, f: &dyn Fn(i32, i32) -> bool| {
        let colors: Vec<u8> = (0..h).flat_map(|yy| (0..w).map(move |xx| (xx, yy))).map(|(xx, yy)| f(xx, yy) as u8).collect();
        BBmp { w, h, y, colored: colors.iter().filter(|c| **c > 0).count() as i32, colors, ..Default::default() }
    };
    assert!(mk(6, 5, 30, &|_, _| true).is_period());
    assert!(mk(14, 4, 20, &|_, _| true).is_dash());
    assert!(mk(5, 20, 10, &|_, y| y < 5 || y >= 15).is_colon());
    assert!(!mk(5, 20, 10, &|_, _| true).is_colon());
}

fn srt_cues(p: &str) -> Vec<(f64, String)> {
    let s = std::fs::read_to_string(p).unwrap().replace('\u{feff}', "").replace("\r\n", "\n");
    s.split("\n\n").filter_map(|b| {
        let mut l = b.lines();
        l.next()?;
        let hms = l.next()?.split(" --> ").next()?.to_string();
        let v: Vec<f64> = hms.replace(',', ":").split(':').filter_map(|x| x.trim().parse().ok()).collect();
        if v.len() != 4 { return None; }
        Some((v[0] * 3600.0 + v[1] * 60.0 + v[2] + v[3] / 1000.0, l.collect::<Vec<_>>().join("\n")))
    }).collect()
}

/// แปลมาถูกไหม อ่านซับ ACCA ทั้งไฟล์ด้วยฐาน Latin.db ค่าแบบ SeConv เทียบผล SeConv ทีละบรรทัดตามเวลาเริ่ม
/// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_SECONV_BIN (SRT ที่ SeConv อ่านด้วย Latin.db) · ห้ามขึ้น git
#[test]
fn acca_same_as_seconv() {
    let (Ok(sup), Ok(se)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_SECONV_BIN")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let Some(db) = latin() else { return };
    let cues = srt_cues(&se);
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let reader = BinReader::new("Latin");
    let t = std::time::Instant::now();
    let (mut same, mut n, mut diff) = (0, 0, vec![]);
    for (k, s) in shows.iter().enumerate() {
        let got = reader.read_text(&db, &s.img, &BinOpts::default()).text;
        let near: Vec<&(f64, String)> = cues.iter().filter(|c| (c.0 - s.start).abs() < 0.03).collect();
        if near.is_empty() { continue; }
        n += 1;
        if near.iter().any(|c| c.1 == got) { same += 1; } else { diff.push((k + 1, got, near[0].1.clone())); }
    }
    eprintln!("ACCA Binary OCR ตรงกับ SeConv {same} จาก {n} บรรทัด ใน {:.1} วินาที", t.elapsed().as_secs_f64());
    for d in diff.iter().take(40) { eprintln!("ภาพ {} ของเรา {:?} SeConv {:?}", d.0, d.1, d.2); }
    assert!(n - same <= 1, "ต่างจาก SeConv {} บรรทัด", n - same);
}
