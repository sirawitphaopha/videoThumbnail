//! เทสของ nocr_train.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::{Rgba, RgbaImage};

#[test]
fn multi_part_rules() {
    assert!(can_be_multi_part("é") && can_be_multi_part("%") && can_be_multi_part("ø") && can_be_multi_part("\""));
    assert!(!can_be_multi_part("f") && !can_be_multi_part("m") && !can_be_multi_part("ab"));
}

/// o กับ c ภาพเดียวกันเกือบหมด ต่างแค่ช่องเปิดด้านขวา · ตัว o ที่มีเส้นน้อยต้องได้เส้นแยกจนภาพ c ผิดอย่างน้อย 8 จุด
#[test]
fn discriminative_lines_split_lookalike() {
    let ring = |open: bool| {
        let mut b = RgbaImage::new(20, 20);
        for y in 0..20 { for x in 0..20 {
            let d = (((x as f64 - 9.5).powi(2) + (y as f64 - 9.5).powi(2)) as f64).sqrt();
            if (6.0..9.5).contains(&d) && !(open && x > 13 && (7..13).contains(&y)) { b.put_pixel(x, y, Rgba([255, 255, 255, 255])); }
        } }
        b
    };
    let (o, c) = (ring(false), ring(true));
    let mut ch = NChar { text: "o".into(), width: 20, height: 20, ..Default::default() };
    ch.fg.push(NLine::new(2, 9, 2, 11));
    let mut rng = Rng::new(3);
    add_discriminative_lines(&mut ch, &o, &c, &mut rng);
    let (e, _) = count_errors(&ch, &c);
    assert!(e >= 8, "จุดผิด {e}");
    assert_eq!(count_errors(&ch, &o).0, 0);
}

/// ฝึกจากฟอนต์ Arial จริงผ่าน libass แล้วฐานที่ฝึกต้องอ่านตัวที่ฝึกได้ · ต้องมี ffmpeg ที่แนบมา
#[test]
fn train_from_arial_and_read_back() {
    let tools = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
    if !tools.join("ffmpeg.exe").exists() { return; }
    let work = std::env::temp_dir().join("movie-shelf-nocr-train");
    std::fs::create_dir_all(&work).unwrap();
    let mut db = NOcrDb::empty(&work.join("t.nocr"));
    let o = TrainOpts { fonts: vec!["Arial".into()], size: 40.0, chars: "abcdeHxo%".into(), seed: Some(7), ..Default::default() };
    // ภาพที่วาดต้องแบ่งได้ [H][เว้นวรรค][ตัว] พอดี · ภาพสูงเกินเคยได้บรรทัดว่างปลอมนำหน้า ฝึกไม่ได้สักตัว
    let probe = render(&tools, &work, &["a".into()], "Arial", 40.0, false, false).unwrap();
    assert!(probe[0].as_ref().unwrap().target().is_some(), "ภาพที่วาดแบ่งเป็น [H][เว้นวรรค][ตัว] ไม่ได้");
    // วาดทีละ 64 ข้อความ ชุดใหญ่กว่า 64 ต้องได้ครบทุกภาพ (ทีละ 100 ffmpeg ฟ้องหน่วยความจำไม่พอ)
    let many: Vec<String> = DEFAULT_CHARS.chars().map(|c| c.to_string()).collect();
    assert_eq!(render(&tools, &work, &many, "Arial", 30.0, false, false).unwrap().len(), many.len());
    let n = train(&tools, &work, &o, &mut db, &|| false, &|_| {}).unwrap();
    eprintln!("ฝึกได้ {n} ตัว");
    assert!(n >= 8, "ฝึกได้ {n} ตัว");
    let r = render(&tools, &work, &["abcde".into()], "Arial", 40.0, false, false).unwrap();
    let rd = r[0].as_ref().unwrap();
    let text: String = (0..rd.pieces.len()).filter(|&i| rd.pieces[i].bmp.is_some())
        .map(|i| db.get_match(&rd.two, &rd.pieces, i, rd.pieces[i].top, true, 25, false, 0.0).map(|c| c.text).unwrap_or("*".into())).collect();
    assert_eq!(text, "Habcde");
    // ย่อฐาน ตัวที่เส้นเกินขั้นต่ำต้องเหลือเส้นไม่มากกว่าเดิม และยังอ่านได้เหมือนเดิม
    let (glyphs, fonts) = validation_glyphs(&tools, &work, &db, &OptimizeOpts { fonts: vec!["Arial".into()], sizes: vec![40.0], min_lines: 20, ..Default::default() }).unwrap();
    let res = optimize(&mut db, &glyphs, fonts, &OptimizeOpts { min_lines: 20, ..Default::default() }, &|| false, &|_, _| {}).unwrap();
    eprintln!("ย่อฐาน {} ตัว เส้น {} เหลือ {} ตัวตรวจ {} ภาพ", res.entries, res.lines_before, res.lines_after, res.glyphs);
    assert!(res.lines_after <= res.lines_before);
    let text2: String = (0..rd.pieces.len()).filter(|&i| rd.pieces[i].bmp.is_some())
        .map(|i| db.get_match(&rd.two, &rd.pieces, i, rd.pieces[i].top, true, 25, false, 0.0).map(|c| c.text).unwrap_or("*".into())).collect();
    assert_eq!(text2, "Habcde");
    let _ = std::fs::remove_dir_all(&work);
}
