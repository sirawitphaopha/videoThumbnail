//! เทสของ ocrprep.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn bar(img: &mut RgbaImage, x0: u32, y0: u32, w: u32, h: u32) {
    for y in y0..y0 + h { for x in x0..x0 + w { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } }
}

/// ซับตัวเหลือง (ช่องน้ำเงินศูนย์) ยังนับเป็นหมึก · จุดใสหรือดำสนิทไม่นับ (ผู้ช่วยตรวจทาน T7 · เดิมดูแค่ช่องน้ำเงิน ภาพว่างทั้งภาพ)
#[test]
fn one_color_counts_yellow_ink() {
    let mut img = RgbaImage::new(3, 1);
    img.put_pixel(0, 0, Rgba([255, 255, 0, 255]));
    img.put_pixel(1, 0, Rgba([0, 0, 0, 255]));
    img.put_pixel(2, 0, Rgba([255, 255, 255, 0]));
    let one = make_one_color(&img, Rgba([255, 255, 255, 255]));
    assert_eq!(one.pixels().map(|p| p[3]).collect::<Vec<_>>(), vec![255, 0, 0]);
}

/// บรรทัดไทยสองบรรทัด บรรทัดบนมีวรรณยุกต์ลอยเหนือ บรรทัดล่างมีสระล่างห้อยใต้ แยกจากตัวด้วยแถวใส
/// ต้องได้สองบรรทัด และแถบบางอยู่ในบรรทัดของมัน ไม่ถูกทิ้ง ไม่เป็นบรรทัดของตัวเอง
#[test]
fn thai_marks_join_their_line() {
    let mut img = RgbaImage::new(200, 120);
    bar(&mut img, 20, 4, 6, 4);    // วรรณยุกต์เหนือบรรทัด 1 (y 4–8)
    bar(&mut img, 10, 11, 150, 30); // บรรทัด 1 (y 11–41)
    bar(&mut img, 10, 60, 150, 30); // บรรทัด 2 (y 60–90)
    bar(&mut img, 40, 93, 5, 5);    // สระล่างใต้บรรทัด 2 (y 93–98)
    let l = split_lines(&img);
    assert_eq!(l.len(), 2, "{:?}", l.iter().map(|x| (x.y, x.h)).collect::<Vec<_>>());
    assert_eq!((l[0].y, l[0].h), (4, 37));
    assert_eq!((l[1].y, l[1].h), (60, 38));
}

/// สระล่างของบรรทัดบนกับสระบนของบรรทัดล่างอยู่แถวเดียวกัน ไม่มีแถวใสคั่น · ต้องได้สองบรรทัด สระบนอยู่กับบรรทัดล่าง และภาพบรรทัดบนไม่มีสระบนนั้น
#[test]
fn marks_sharing_rows_go_to_their_own_line() {
    let mut img = RgbaImage::new(300, 120);
    bar(&mut img, 100, 10, 80, 30);  // บรรทัด 1 สั้น อยู่กลาง (y 10–40)
    bar(&mut img, 120, 42, 6, 10);   // สระล่างของบรรทัด 1 (y 42–52)
    bar(&mut img, 20, 50, 6, 8);     // สระบนของบรรทัด 2 ทางซ้าย นอกแนวบรรทัด 1 (y 50–58) แถวซ้อนกับสระล่าง
    bar(&mut img, 10, 60, 280, 30);  // บรรทัด 2 ยาว (y 60–90)
    let l = split_lines(&img);
    assert_eq!(l.len(), 2, "{:?}", l.iter().map(|x| (x.y, x.h)).collect::<Vec<_>>());
    assert_eq!((l[0].y, l[0].y + l[0].h), (10, 52));
    assert_eq!((l[1].y, l[1].y + l[1].h), (50, 90));
    assert!(ink_bounds(&l[0].img, 40).unwrap().0 >= 100, "ภาพบรรทัดบนต้องไม่มีสระบนของบรรทัดล่าง");
}

/// แถบบางที่อยู่ห่างทุกบรรทัด (บรรทัดที่มีแต่ขีดหรือจุด) เป็นบรรทัดของตัวเอง ไม่ถูกดึงเข้าบรรทัดอื่น
#[test]
fn far_thin_strip_stays_alone() {
    assert_eq!(merge_marks(&[(0, 30), (80, 84)]), vec![(0, 30), (80, 84)]);
    // ใกล้บรรทัดบนกว่า ต่อเข้าบรรทัดบน
    assert_eq!(merge_marks(&[(0, 30), (33, 37), (60, 90)]), vec![(0, 37), (60, 90)]);
    // เท่ากันเลือกบรรทัดล่าง
    assert_eq!(merge_marks(&[(0, 30), (35, 40), (45, 75)]), vec![(0, 30), (35, 75)]);
}

/// ตัวแบ่งของ Subtitle Edit ต่อจุดของ i ที่สูงไม่เกิน min เข้าบรรทัดถัดไป
#[test]
fn se_splitter_keeps_i_dot() {
    let mut img = RgbaImage::new(60, 80);
    bar(&mut img, 5, 2, 4, 4);   // จุด
    bar(&mut img, 5, 8, 4, 20);  // ตัว i
    bar(&mut img, 5, 50, 30, 20); // บรรทัดสอง
    let l = split_lines_se(&img, 10);
    assert_eq!(l.len(), 2, "{:?}", l.iter().map(|x| (x.y, x.h)).collect::<Vec<_>>());
    assert!(l[0].y <= 2 && l[0].y + l[0].h >= 28);
}

#[test]
fn preprocess_steps() {
    let mut img = RgbaImage::new(40, 20);
    bar(&mut img, 10, 5, 8, 6);
    img.put_pixel(12, 7, Rgba([60, 60, 60, 255]));
    let c = preprocess(&img, &Prep { crop_transparent: true, ..Default::default() });
    assert_eq!(c.dimensions(), (8, 6));
    let o = one_color(&c, 128);
    assert_eq!(o.get_pixel(2, 2)[3], 0, "จุดมืดกลายเป็นใส");
    assert_eq!(o.get_pixel(0, 0), &Rgba([255, 255, 255, 255]));
    let mut i = c.clone();
    invert(&mut i);
    assert_eq!(i.get_pixel(0, 0), &Rgba([0, 0, 0, 255]));
    assert_eq!(remove_border(&c, 1).dimensions(), (6, 4));
    assert_eq!(remove_border(&c, 3).dimensions(), (8, 6), "ขอบกินทั้งภาพ คืนภาพเดิม");
    let u = preprocess(&img, &Prep { crop_transparent: true, upscale_to: 24, ..Default::default() });
    assert_eq!(u.dimensions(), (32, 24), "บรรทัดสูง 6 ขยาย 4 เท่าให้ถึง 24");
    assert_eq!(on_black(&c, 8).dimensions(), (24, 22));
}

/// จำนวนบรรทัดที่แบ่งได้เทียบคำตอบ (นับ ¶ บวกหนึ่ง) ทุกภาพของไฟล์ .sup · คืนภาพที่ไม่ตรง (เลขภาพ ได้ ควรได้)
fn line_mismatch(sup: &std::path::Path, truth: &std::path::Path) -> (usize, Vec<(usize, usize, usize)>) {
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let want: Vec<usize> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
        .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).matches('¶').count() + 1).collect();
    assert_eq!(shows.len(), want.len(), "จำนวนภาพไม่เท่าคำตอบ");
    let bad = shows.iter().zip(&want).enumerate().filter_map(|(k, (s, w))| {
        let got = split_lines(&s.img).len();
        (got != *w).then_some((k + 1, got, *w))
    }).collect();
    (shows.len(), bad)
}

/// ซับรูปไทย 1920 × 1080 ที่ make-test-media สร้างจากข้อความที่รู้คำตอบ · ทุกภาพต้องแบ่งบรรทัดได้เท่าคำตอบ สระวรรณยุกต์ไม่แตกเป็นบรรทัดเกิน
#[test]
fn thai_test_sub_line_counts() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
    if !dir.join("th.sup").exists() {
        assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup รัน node scripts/make-test-media.mjs ก่อน");
        return;
    }
    let (n, bad) = line_mismatch(&dir.join("th.sup"), &dir.join("th.truth.txt"));
    assert!(bad.is_empty(), "{n} ภาพ แบ่งบรรทัดไม่ตรง {bad:?}");
}

/// ซับ PGS ของ ACCA ที่พี่กันให้ (ห้ามขึ้น git) · ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_TRUTH · ต้องแบ่งบรรทัดตรงคำตอบทุกภาพ
#[test]
fn acca_line_counts() {
    let (Ok(sup), Ok(truth)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_TRUTH")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let (n, bad) = line_mismatch(std::path::Path::new(&sup), std::path::Path::new(&truth));
    eprintln!("ACCA {n} ภาพ แบ่งบรรทัดไม่ตรง {} ภาพ {bad:?}", bad.len());
    assert!(bad.is_empty());
}

/// เกณฑ์สองสี ซับขาวขอบดำปกติได้ 200 · ซับที่มีเงาเทากว้างได้เกณฑ์ของ Otsu ที่สูงกว่า
#[test]
fn two_color_threshold_shadow() {
    let mut normal = RgbaImage::new(20, 10);
    for (x, _, p) in normal.enumerate_pixels_mut() { *p = if x < 10 { Rgba([255, 255, 255, 255]) } else { Rgba([0, 0, 0, 255]) }; }
    assert_eq!(two_color_threshold(&normal), 200);
    let mut shadow = RgbaImage::new(30, 10);
    for (x, _, p) in shadow.enumerate_pixels_mut() { *p = if x < 10 { Rgba([255, 255, 255, 255]) } else if x < 22 { Rgba([80, 80, 80, 255]) } else { Rgba([0, 0, 0, 255]) }; }
    let t = two_color_threshold(&shadow);
    assert!(t > 240, "เงาเทา 240 ต้องได้เกณฑ์สูงกว่า ได้ {t}");
    let two = make_two_color(&shadow, t);
    assert_eq!(two.get_pixel(15, 0)[3], 0, "เงาเทาต้องเป็นพื้น");
    assert_eq!(two.get_pixel(5, 0)[3], 255);
}
