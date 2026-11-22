//! เทสของ nocr_text.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::{Rgba, RgbaImage};

/// 0 เป็น o เฉพาะคำละติน · ญี่ปุ่นกับไทยเลขศูนย์คงเดิม (T15) · แท็กตัวเอียงกับตัวที่ตัวเล็กยาวกว่าตัวใหญ่ ไม่พัง แยกช่วงถูก (T16)
#[test]
fn zero_only_latin_and_tags_by_bytes() {
    assert_eq!(words_with_zero("H0me"), "Home");
    assert_eq!(words_with_zero("第0話"), "第0話");
    assert_eq!(words_with_zero("ห้อง0"), "ห้อง0");
    let mut segs = vec![];
    tagged_runs(&mut segs, "<I>İ</I>t");
    assert_eq!(segs.iter().map(|s| (s.text.as_str(), s.italic)).collect::<Vec<_>>(), vec![("İ", true), ("t", false)]);
}

fn hit(t: &str, italic: bool) -> Hit { Hit { text: t.into(), italic, ..Default::default() } }

/// ตัวอย่างในคำอธิบายของ OcrDigitLetterFixer ทุกตัว
#[test]
fn digit_letter_cases() {
    for (a, b) in [("5O", "50"), ("1O:3O", "10:30"), ("1,OOO", "1,000"), ("think 0f it", "think of it"), ("0f course", "Of course"), ("g0t", "got"), ("7o/o", "7%"), ("7 o/o", "7%"),
        ("З000", "З000"), ("D00-wah", "Doo-wah"), ("Hello. 0kay", "Hello. Okay"), ("G00D", "GOOD"), ("OK", "OK"), ("1O.3Ox", "10.3Ox")] {
        assert_eq!(digit_letter_fix(a), b, "{a}");
    }
}

/// คำเครื่องหมายตามคำที่มีตัวอักษร ขีดนำหน้าตามคำหลัง จุดท้ายตามคำหน้า ช่องว่างเอียงเมื่อสองข้างเอียง
#[test]
fn italic_tags_per_word() {
    let mk = |s: &[(&str, bool)]| s.iter().map(|(t, i)| hit(t, *i)).collect::<Vec<_>>();
    let h = mk(&[("-", false), (" ", false), ("H", true), ("i", true), (" ", false), ("y", true), ("o", true), ("u", true), (".", false)]);
    assert_eq!(merge_italic(&h), "<i>- Hi you.</i>");
    let h = mk(&[("M", false), ("A", false), ("N", false), (" ", false), (":", false), (" ", false), ("H", true), ("e", true), ("y", true)]);
    assert_eq!(merge_italic(&h), "MAN : <i>Hey</i>");
    let h = mk(&[("a", true), ("b", false), (" ", false), ("c", true), ("d", true)]);
    assert_eq!(merge_italic(&h), "<i>ab cd</i>");
    let h = mk(&[("y", true), ("<i>i</i>t", false)]);
    assert_eq!(merge_italic(&h), "<i>yi</i>t");
}

fn block(w: u32, h: u32) -> Bmp { RgbaImage::from_pixel(w, h, Rgba([255, 255, 255, 255])) }

/// ช่องระหว่างตัว 2 จุด ช่องเว้นคำ 9 จุด บรรทัดสูง 20 · ตัดช่องเล็กออก เก็บช่องใหญ่ ได้เกณฑ์ราว 0.22 ถึง 0.45 ของความสูง
#[test]
fn space_detector_keeps_word_gaps() {
    let mut l = vec![];
    let mut x = 0;
    for (k, gap) in [2, 2, 9, 2, 2].iter().enumerate() {
        let mut g = Piece::glyph(x, 0, block(8, 20)); g.top = 0; l.push(g);
        x += 8;
        let mut s = Piece::special(" "); s.space_pixels = *gap; l.push(s);
        x += gap;
        if k == 4 { let mut g = Piece::glyph(x, 0, block(8, 20)); g.top = 0; l.push(g); }
    }
    let d = SpaceDetector::default();
    let (out, px) = d.remove_false_spaces(l);
    assert_eq!(out.iter().filter(|p| is_space(p)).count(), 1);
    assert!((3..=9).contains(&px), "{px}");
}

/// 1 ตามด้วยเว้นวรรคแคบแล้วตัวเลข เอาเว้นวรรคออก · 1 ตามด้วยคำ เว้นวรรคกว้างเก็บไว้
#[test]
fn spaces_in_numbers() {
    let mut sp = Piece::special(" "); sp.space_pixels = 10;
    let list = vec![Piece::default(), sp.clone(), Piece::default()];
    let mut hits = vec![Hit::text("1", Some(0)), Hit::text(" ", Some(1)), Hit::text("5", Some(2))];
    remove_false_spaces_in_numbers(&mut hits, &list, 6);
    assert_eq!(hits.len(), 2);
    let mut hits = vec![Hit::text("1", Some(0)), Hit::text(" ", Some(1)), Hit::text("v", Some(2))];
    remove_false_spaces_in_numbers(&mut hits, &list, 6);
    assert_eq!(hits.len(), 3);
}

/// p ที่ห้อยใต้เส้นฐานเป็นตัวเล็ก ที่นั่งบนเส้นฐานเป็นตัวใหญ่
#[test]
fn case_fixer_p() {
    let mut f = CaseFixer::default();
    let mut p = Piece::glyph(0, 0, block(8, 20)); p.top = 6; p.baseline = Some(20);
    assert_eq!(f.fix(&p, &hit("P", false)), "p");
    p.top = 0;
    assert_eq!(f.fix(&p, &hit("p", false)), "P");
}

#[test]
fn crop_top_and_tracker() {
    let mut b = RgbaImage::new(4, 10);
    b.put_pixel(1, 3, Rgba([255, 255, 255, 255]));
    let (c, n) = crop_top(&b);
    assert_eq!((c.height(), n), (7, 3));
    let t = LineHeightTracker::default();
    assert_eq!(t.min_line_height(), 12);
    let l: Vec<Piece> = (0..21).map(|_| Piece::glyph(0, 0, block(2, 30))).collect();
    t.update(&l);
    assert_eq!(t.min_line_height(), 27);
}

fn srt_cues(p: &str) -> Vec<(f64, String)> {
    let s = std::fs::read_to_string(p).unwrap().replace('\u{feff}', "").replace("\r\n", "\n");
    s.split("\n\n").filter_map(|b| {
        let mut l = b.lines();
        l.next()?;
        let t = l.next()?;
        let hms = t.split(" --> ").next()?;
        let v: Vec<f64> = hms.replace(',', ":").split(':').filter_map(|x| x.trim().parse().ok()).collect();
        if v.len() != 4 { return None; }
        Some((v[0] * 3600.0 + v[1] * 60.0 + v[2] + v[3] / 1000.0, l.collect::<Vec<_>>().join("\n")))
    }).collect()
}

/// แปลมาถูกไหม อ่านซับ ACCA ทั้งไฟล์ด้วยฐาน Latin ค่าแบบ SeConv (จุดผิด 25 ทางสุดท้ายเปิด ไม่บิดตัวเอียง) เทียบผล SeConv ทีละบรรทัดตามเวลาเริ่ม
/// ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_SECONV_NOCR (SRT ที่ SeConv อ่านด้วย Latin.nocr) · ห้ามขึ้น git
#[test]
fn acca_same_as_seconv() {
    let (Ok(sup), Ok(se)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_SECONV_NOCR")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let db = NOcrDb::load(&std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.nocr")).unwrap();
    let cues = srt_cues(&se);
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let reader = NOcrReader::default();
    let o = ReadOpts { max_wrong: 25, italic: 0.0, space_px: 0, last_ditch: true, teach: false };
    let t = std::time::Instant::now();
    let (mut same, mut n, mut diff) = (0, 0, vec![]);
    for (k, s) in shows.iter().enumerate() {
        let got = reader.read_text(&db, &s.img, &o).text;
        // บางเวลามีสองบรรทัดเริ่มพร้อมกัน (SeConv รวมภาพที่ซ้อนกัน) ตรงบรรทัดไหนก็นับ
        let near: Vec<&(f64, String)> = cues.iter().filter(|c| (c.0 - s.start).abs() < 0.03).collect();
        if near.is_empty() { continue; }
        n += 1;
        if near.iter().any(|c| c.1 == got) { same += 1; } else { diff.push((k + 1, got, near[0].1.clone())); }
    }
    eprintln!("ACCA ตรงกับ SeConv {same} จาก {n} บรรทัด (ภาพ {} SeConv {}) ใน {:.1} วินาที", shows.len(), cues.len(), t.elapsed().as_secs_f64());
    for d in diff.iter().take(40) { eprintln!("ภาพ {} ของเรา {:?} SeConv {:?}", d.0, d.1, d.2); }
    // ที่ต่างได้มีบรรทัดเดียว คือภาพ 430 ที่ SeConv รวมภาพซ้อนกันคนละแบบกับตัวถอด PGS ของเรา (คำตอบที่อ่านจากภาพตรงกับของเรา) · ก่อนแก้จุดเดียวไปคอลัมน์ 0 ได้ 431
    assert!(n - same <= 1, "ต่างจาก SeConv {} บรรทัด", n - same);
}

/// อ่านภาพซับไทยทดสอบด้วยฐาน Latin ของ Subtitle Edit ไม่ล้ม ได้ผลเป็นข้อความ (ความแม่นวัดในขั้น 13)
#[test]
fn reads_with_se_latin_db() {
    let db_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools/ocr/Ocr/Latin.nocr");
    if !db_path.exists() { return; }
    let db = NOcrDb::load(&db_path).unwrap();
    let mut img = RgbaImage::new(60, 30);
    for y in 5..25 { for x in 10..14 { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } }
    let r = NOcrReader::default().read_text(&db, &img, &ReadOpts { last_ditch: true, ..Default::default() });
    assert!(!r.text.is_empty());
}
