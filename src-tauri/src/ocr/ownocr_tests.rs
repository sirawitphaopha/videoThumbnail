//! เทสของ ownocr.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use image::Rgba;

fn levenshtein(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1; b.len() + 1];
        for (j, cb) in b.iter().enumerate() { cur[j + 1] = (prev[j] + (ca != cb) as usize).min(prev[j + 1] + 1).min(cur[j] + 1); }
        prev = cur;
    }
    prev[b.len()]
}

#[test]
fn thai_order_and_sara_am() {
    assert_eq!(normalize_thai("น\u{e4d}\u{e49}า"), "น้ำ");
    assert_eq!(normalize_thai("ก\u{e4d}า"), "กำ");
    let (b, lo, up) = split_cluster("น้ำ");
    assert_eq!((b, lo, up), (vec!["น".to_string(), "า".to_string()], vec![], vec!["\u{e4d}".to_string(), "\u{e49}".to_string()]));
    let (b, lo, up) = split_cluster("ปู่");
    assert_eq!((b.len(), lo, up), (1, vec!["\u{e39}".to_string()], vec!["\u{e48}".to_string()]));
}

fn bar(img: &mut RgbaImage, x0: u32, y0: u32, w: u32, h: u32) { for y in y0..y0 + h { for x in x0..x0 + w { img.put_pixel(x, y, Rgba([255, 255, 255, 255])); } } }

/// ตัวหลักสองตัว ก้อนบนสองชั้นเหนือตัวแรก ก้อนล่างใต้ตัวที่สอง ขีดลอยซ้ายสุดที่ไม่ซ้อนตัวไหนเป็นตัวหลักของตัวเอง
#[test]
fn layout_zones_and_groups() {
    let mut img = RgbaImage::new(120, 80);
    bar(&mut img, 2, 5, 3, 8);     // ขีดลอยซ้ายไม่ซ้อนตัวไหน
    bar(&mut img, 10, 25, 20, 30); // ตัวหลัก 1
    bar(&mut img, 15, 17, 10, 5);  // สระบน
    bar(&mut img, 18, 8, 6, 6);    // วรรณยุกต์
    bar(&mut img, 40, 25, 20, 30); // ตัวหลัก 2
    bar(&mut img, 45, 58, 8, 6);   // สระล่าง
    let l = layout(blobs(&img));
    assert_eq!(l.groups.len(), 3, "{:?}", l.groups);
    let g1 = &l.groups[1];
    assert_eq!(g1.above.len(), 2);
    assert!(l.blobs[g1.above[0]].y0 > l.blobs[g1.above[1]].y0, "สระบนต้องมาก่อนวรรณยุกต์");
    assert_eq!(l.groups[2].below.len(), 1);
}

/// ฝึกจาก Leelawadee UI แล้วอ่านซับไทยทดสอบเทียบคำตอบ · ต้องมีไฟล์ทดสอบไทยของ make-test-media กับ ffmpeg ที่แนบมา
#[test]
fn thai_test_sub_after_font_training() {
    let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
    if !tools.join("ffmpeg.exe").exists() || !dir.join("th.sup").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return; }
    let work = std::env::temp_dir().join("movie-shelf-ownocr");
    std::fs::create_dir_all(&work).unwrap();
    let mut db = NOcrDb::empty(&work.join("th.nocr"));
    let mut rng = Rng::new(11);
    let mut learned = 0;
    for (size, italic) in [(64.0, false), (52.0, false), (64.0, true)] {
        let (n, skipped) = train_font(&tools, &work, &mut db, "Leelawadee UI", size, false, italic, 60, Algo::Random, &mut rng).unwrap();
        eprintln!("ฝึก {size} ตัวเอียง {italic} ได้ {n} ก้อน ข้าม {skipped:?}");
        learned += n;
    }
    assert!(learned > 100);
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
    let want: Vec<String> = std::fs::read_to_string(dir.join("th.truth.txt")).unwrap().lines().map(|l| l.replace('¶', "\n")).collect();
    let reader = OwnReader;
    let (mut ok, mut bad, mut edits, mut total) = (0, vec![], 0, 0);
    for (k, (s, w)) in shows.iter().zip(&want).enumerate() {
        let got = reader.read_text(&db, &s.img, &OwnOpts::default()).text;
        let plain = |x: &str| x.replace("<i>", "").replace("</i>", "");
        let (g, t): (Vec<char>, Vec<char>) = (plain(&got).chars().collect(), plain(w).chars().collect());
        edits += levenshtein(&g, &t);
        total += t.len();
        if g == t { ok += 1; } else { bad.push((k + 1, got, w.clone())); }
    }
    let cer = edits as f64 * 100.0 / total as f64;
    eprintln!("ตัวสอนเองอ่านซับไทยถูกทั้งภาพ {ok} จาก {} ภาพ อักขระผิด {edits} จาก {total} ({cer:.2}%) · ผิด {bad:?}", shows.len());
    let _ = std::fs::remove_dir_all(&work);
    // ผลวันที่เขียน 16 พ.ย. 2569 ถูกทั้งภาพ 9 จาก 17 · ตัวคล้าย (ึ ื, ้ ๊ บนสระ, ช ซ, ก ค ขนาดเล็ก) กับตัวเอียงยังพลาด เกณฑ์กันผลแย่ลง
    assert!(ok >= 9 && cer <= 3.0, "ตัวสอนเองแย่ลง ถูก {ok} อักขระผิด {cer:.2}%");
}
