//! เทสของ tesseract.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn ocr_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools").join("ocr") }

#[test]
fn hocr_lines_italic_and_conf() {
    let h = "<div class='ocr_page'><span class='ocr_line' id='line_1_1'><span class='ocrx_word' id='w1' title='bbox 1 1 2 2; x_wconf 96'>Hello</span> \
<span class='ocrx_word' id='w2' title='bbox 3 3 4 4; x_wconf 61'><em>there</em></span></span>\
<span class='ocr_line' id='line_1_2'><span class='ocrx_word' id='w3' title='bbox 5 5 6 6; x_wconf 90'>Tom&amp;Jerry&#39;s</span></span></div>";
    let o = parse_hocr(h);
    assert_eq!(o.text, "Hello <i>there</i>\nTom&Jerry's");
    assert!((o.conf - 0.61).abs() < 1e-6);
    assert_eq!(parse_hocr("<html></html>"), TessOut::default());
}

/// คำไทยกับญี่ปุ่นที่ Tesseract แบ่งเป็นหลายคำต่อชิดกัน คำอังกฤษยังเว้นวรรค · ระหว่างไทยกับอังกฤษเว้นวรรคเดิม (ผู้ช่วยตรวจทาน T2)
#[test]
fn hocr_no_spaces_inside_thai_and_japanese() {
    let w = |t: &str| format!("<span class='ocrx_word' id='w' title='bbox 1 1 2 2; x_wconf 90'>{t}</span> ");
    let h = format!("<span class='ocr_line' id='l1'>{}{}{}</span><span class='ocr_line' id='l2'>{}{}</span><span class='ocr_line' id='l3'>{}{}</span>",
        w("สวัสดี"), w("ครับ"), w("OK"), w("咆哮が"), w("<em>聞こえる</em>"), w("Hello"), w("world"));
    assert_eq!(parse_hocr(&h).text, "สวัสดีครับ OK\n咆哮が<i>聞こえる</i>\nHello world");
}

#[test]
fn prepare_black_on_white_with_margin() {
    let mut img = RgbaImage::new(4, 2);
    img.put_pixel(0, 0, Rgba([255, 255, 0, 255])); // เหลืองยังเป็นตัวหนังสือ
    img.put_pixel(1, 0, Rgba([40, 40, 40, 255]));  // มืด เป็นพื้น
    img.put_pixel(2, 0, Rgba([255, 255, 255, 50])); // จางเกิน เป็นพื้น
    let p = prepare(&img, 1, 1);
    assert_eq!(p.dimensions(), (24, 22));
    assert_eq!(p.get_pixel(10, 10), &Rgba([0, 0, 0, 255]));
    assert_eq!(p.get_pixel(11, 10), &Rgba([255, 255, 255, 255]));
    assert_eq!(p.get_pixel(12, 10), &Rgba([255, 255, 255, 255]));
    assert_eq!(p.get_pixel(0, 0), &Rgba([255, 255, 255, 255]));
    assert_eq!(prepare(&img, 3, 2).dimensions(), (72, 44));
}

#[test]
fn retry_merge_rules() {
    assert!(retry_adds_digit("18 months", "718 months"));
    assert!(!retry_adds_digit("18 months", "81 months"));
    let unk = vec!["diedq".to_string()];
    assert_eq!(merge_unknown("He diedq, 18 months", "He died, 718 months", &unk).as_deref(), Some("He died, 18 months"));
    assert_eq!(merge_unknown("a  b", "a b", &unk), None, "ช่องว่างไม่ตรงกัน");
    assert_eq!(merge_unknown("a b", "a c", &[]), None);
    // คำที่ไม่รู้จักสั้น "l" ไม่ไปแทนคำที่ถูกทั้งประโยค
    assert_eq!(merge_unknown("hello world", "hallo warld", &["l".to_string()]), None);
}

#[test]
fn langs_and_dirs() {
    assert!(LANGS.iter().any(|(c, _)| *c == "tha") && LANGS.len() > 120);
    let user = std::env::temp_dir().join(format!("ms-tess-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&user);
    assert_eq!(data_dir_for(&ocr_dir(), &user, "tha"), Some(bundled_data(&ocr_dir())));
    assert_eq!(data_dir_for(&ocr_dir(), &user, "deu"), None);
    let have: Vec<String> = installed(&ocr_dir(), &user).into_iter().map(|(c, _)| c).collect();
    assert_eq!(have, vec!["eng", "jpn", "jpn_vert", "tha"]);
}

/// อ่านภาพจริงด้วย tesseract.exe ที่แนบมา · ซับไทยที่รู้คำตอบ ภาพแรก "สวัสดีครับ ผู้ใหญ่บ้านอยู่ไหม" (ไม่สนเว้นวรรค)
#[test]
fn reads_thai_test_sub() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
    if !dir.join("th.sup").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return; }
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
    let work = std::env::temp_dir();
    let user = work.join("ms-tess-none");
    let o = TessOpts { lang: "tha".into(), ..Default::default() };
    let r = read(&ocr_dir(), &user, &work, &shows[0].img, &o, None).unwrap();
    assert_eq!(r.text.split_whitespace().collect::<String>(), "สวัสดีครับผู้ใหญ่บ้านอยู่ไหม", "{r:?}");
    assert!(r.conf > 0.5);
}
