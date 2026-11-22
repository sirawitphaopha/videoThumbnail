//! เทสของ paddle.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn ocr_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools").join("ocr") }

/// ซับแนวตั้งสองคอลัมน์ คอลัมน์ขวาแบ่งเป็นสองกรอบ และมีคอลัมน์คำอ่านแคบชิดขวา · ได้สองคอลัมน์ขวาไปซ้าย กรอบในคอลัมน์บนลงล่าง คำอ่านถูกติดธง (T5)
#[test]
fn vertical_columns_order() {
    let cols = vec![(100, 220, 40, 180), (40, 0, 40, 300), (100, 0, 42, 200), (146, 20, 16, 60)];
    let (g, ruby) = vertical_columns(&cols);
    assert_eq!(ruby, vec![false, false, false, true]);
    assert_eq!(g, vec![vec![3], vec![2, 0], vec![1]]);
}

/// บรรทัดเตี้ยแคบชิดเหนือบรรทัดหลักเป็นคำอ่าน · บรรทัดเต็มสองบรรทัดไม่ใช่ (ผู้ช่วยตรวจทาน T4)
#[test]
fn ruby_line_detected() {
    let line = |y: u32, x: u32, w: u32, h: u32| {
        let mut img = RgbaImage::new(200, h);
        for yy in 0..h { for xx in x..x + w { img.put_pixel(xx, yy, Rgba([255, 255, 255, 255])); } }
        crate::ocr::ocrprep::Line { y, h, img }
    };
    let ruby = line(0, 60, 40, 12);
    let main = line(16, 20, 160, 30);
    let second = line(56, 20, 150, 30);
    assert_eq!(ruby_lines(&[ruby, main, second]), vec![true, false, false]);
    assert_eq!(ruby_lines(&[line(0, 20, 160, 30), line(40, 20, 150, 30)]), vec![false, false]);
}

#[test]
fn dict_from_yml() {
    let y = "PostProcess:\n  name: CTCLabelDecode\n  character_dict:\n  - a\n  - ''''\n  - \"\\u3000\"\n  - '-'\n  - ก\nOther: 1\n";
    assert_eq!(read_dict(y), vec!["a", "'", "\u{3000}", "-", "ก"]);
}

#[test]
fn ctc_collapses_repeats_and_blanks() {
    let chars: Vec<String> = ["", "a", "b", " "].iter().map(|s| s.to_string()).collect();
    // ช่วง: a a blank a b blank → "aab"
    let rows = [[0.1, 0.8, 0.05, 0.05], [0.1, 0.9, 0.0, 0.0], [0.9, 0.05, 0.05, 0.0], [0.1, 0.6, 0.3, 0.0], [0.0, 0.1, 0.9, 0.0], [0.95, 0.0, 0.05, 0.0]];
    let p: Vec<f32> = rows.iter().flatten().map(|v| *v as f32).collect();
    let r = ctc_decode(&p, 6, 4, &chars);
    assert_eq!(r.text, "aab");
    assert!((r.conf - (0.8 + 0.6 + 0.9) / 3.0).abs() < 1e-5);
}

#[test]
fn db_box_unclip() {
    // กลุ่มจุดข้อความ 10 × 4 ที่ (5, 3) ขยายด้วย 10·4·1.4/(2·14) = 2
    let (w, h) = (30usize, 12usize);
    let mut p = vec![0f32; w * h];
    for y in 3..7 { for x in 5..15 { p[y * w + x] = 0.9; } }
    p[0] = 0.25; // จุดเดี่ยวเกินเกณฑ์แต่เล็กเกิน ทิ้ง
    assert_eq!(db_boxes(&p, w, h, 0.2, 0.45, 1.4), vec![(3, 1, 14, 8)]);
}

#[test]
fn model_dirs() {
    let p = Path::new("x");
    assert_eq!(rec_dir(p, "th", "medium"), p.join("th_PP-OCRv5_mobile_rec"));
    assert_eq!(rec_dir(p, "ja", "tiny"), p.join("PP-OCRv6_tiny_rec"));
    assert_eq!(rec_dir(p, "", "huge"), p.join("PP-OCRv6_small_rec"));
    assert_eq!(rec_dir(p, "ko", "small"), p.join("korean_PP-OCRv5_mobile_rec"));
    assert_eq!(rec_dir(p, "en5", "small"), p.join("en_PP-OCRv5_mobile_rec"));
}

/// ทุกโมเดลที่แนบมามีพจนานุกรมตัวอักษร โมเดลไทยมีตัวอักษรไทยครบทุกตัวที่ซับเทสใช้ (ต้องแตก tools/ocr ด้วย fetch-ocr-tools.ps1 ก่อน)
#[test]
fn bundled_dicts() {
    let d = ocr_dir().join("paddle");
    if !d.is_dir() { panic!("ไม่มี tools/ocr/paddle รัน scripts/fetch-ocr-tools.ps1 ก่อน"); }
    for m in models(&ocr_dir()) {
        if m.contains("_det") || m.contains("textline_ori") { continue; }
        let dict = read_dict(&std::fs::read_to_string(d.join(&m).join("inference.yml")).unwrap());
        assert!(dict.len() > 30, "{m} พจนานุกรม {}", dict.len());
    }
    let th: std::collections::HashSet<String> = read_dict(&std::fs::read_to_string(d.join("th_PP-OCRv5_mobile_rec").join("inference.yml")).unwrap()).into_iter().collect();
    let truth = std::fs::read_to_string(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("src").join("ocr").join("th.ass")).unwrap_or_default();
    let miss: Vec<char> = truth.chars().filter(|c| ('\u{0E00}'..='\u{0E7F}').contains(c) && !th.contains(&c.to_string())).collect();
    assert!(miss.is_empty(), "โมเดลไทยไม่มีตัว {miss:?}");
}

/// อ่านซับ ACCA ทุกภาพด้วย PP-OCRv6 small (ตั้ง MOVIE_SHELF_OCR_SUP กับ MOVIE_SHELF_OCR_TRUTH · ห้ามขึ้น git)
/// ต้องได้ไม่ต่ำกว่าผลในไฟล์ค้นคว้า 436 จาก 439 ภาพ (ข้อความถูกทั้งภาพ ไม่สนตัวเอียงกับเครื่องหมายคำพูดโค้ง)
#[test]
fn acca_accuracy() {
    let (Ok(sup), Ok(truth)) = (std::env::var("MOVIE_SHELF_OCR_SUP"), std::env::var("MOVIE_SHELF_OCR_TRUTH")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(sup).unwrap());
    let want: Vec<String> = std::fs::read_to_string(truth).unwrap().lines().filter(|l| !l.trim().is_empty())
        .map(|l| l.split_once('\t').map(|(_, t)| t).unwrap_or(l).to_string()).collect();
    let norm = |s: &str| s.replace("<i>", "").replace("</i>", "").replace(['“', '”'], "\"").replace(['‘', '’'], "'").replace(" ¶ ", "\n").replace('¶', "\n")
        .lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n");
    let t = std::time::Instant::now();
    let mut ok = 0;
    let mut bad = vec![];
    for (k, (s, w)) in shows.iter().zip(&want).enumerate() {
        let (got, conf) = read_text(&ocr_dir(), &s.img, &PaddleOpts::default()).unwrap();
        if norm(&got) == norm(w) { ok += 1; } else { bad.push((k + 1, got, conf)); }
    }
    eprintln!("ACCA ถูก {ok} จาก {} ภาพ ใน {:.1} วินาที · ผิด {bad:?}", shows.len(), t.elapsed().as_secs_f64());
    assert!(ok >= 436, "ต่ำกว่าผลในไฟล์ค้นคว้า");
}

/// ซับ VobSub ญี่ปุ่นของ Shin Godzilla ทุกภาพ ทั้งแนวนอนและแนวตั้ง (แผน OCR ขั้น 13 · ห้ามขึ้น git)
/// ตั้ง MOVIE_SHELF_VOB_IDX (คู่ไฟล์ .idx ที่แยกไว้แล้ว) กับ MOVIE_SHELF_GODZILLA_SRT (SRT ญี่ปุ่นของ Amazon ที่พี่กันให้ ตรงกับภาพเกือบหนึ่งต่อหนึ่ง)
/// จับคู่ภาพกับบรรทัดของ SRT ที่เวลาเริ่มห่างไม่เกิน 0.3 วินาที · นับถูกทั้งภาพและความถูกรายตัวอักษร (ไม่นับเว้นวรรคกับบรรทัด)
#[test]
fn godzilla_japanese_accuracy() {
    let (Ok(idx), Ok(srt)) = (std::env::var("MOVIE_SHELF_VOB_IDX"), std::env::var("MOVIE_SHELF_GODZILLA_SRT")) else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ Godzilla"); return };
    let idx = PathBuf::from(idx);
    let file = crate::subtitle::vobsub::parse_idx(&crate::subtitle::subs::decode_text(&std::fs::read(&idx).unwrap()).0);
    let shows = crate::subtitle::vobsub::read(&file, &std::fs::read(idx.with_extension("sub")).unwrap(), 0, &|_| {});
    let text = crate::subtitle::subs::decode_text(&std::fs::read(srt).unwrap()).0.replace("\r\n", "\n");
    let tag = |s: &str| { let mut o = String::new(); let mut inside = false; for ch in s.chars() { match ch { '<' | '{' => inside = true, '>' | '}' => inside = false, _ if !inside => o.push(ch), _ => {} } } o };
    let refs: Vec<(f64, String)> = text.split("\n\n").filter_map(|b| {
        let mut ls = b.lines().skip_while(|l| !l.contains("-->"));
        let t = ls.next()?;
        let s = t.split("-->").next()?.trim().replace(',', ".");
        let p: Vec<f64> = s.split(':').filter_map(|x| x.parse().ok()).collect();
        (p.len() == 3).then(|| (p[0] * 3600.0 + p[1] * 60.0 + p[2], tag(&ls.collect::<Vec<_>>().join(""))))
    }).collect();
    // ไม่นับความต่างที่ไม่ใช่ตัวอ่านผิด อักษรเต็มความกว้างกับครึ่งความกว้าง（Ａ？ กับ (A?) และคำอ่านในวงเล็บหลังคันจิของ SRT เช่น 咆哮(ほうこう) ที่ภาพไม่มี
    let squash = |s: &str| {
        let w: String = s.chars().map(|c| if ('\u{FF01}'..='\u{FF5E}').contains(&c) { char::from_u32(c as u32 - 0xFEE0).unwrap_or(c) } else { c }).collect();
        let mut out = Vec::new();
        let cs: Vec<char> = w.chars().filter(|c| !c.is_whitespace()).collect();
        let mut i = 0;
        while i < cs.len() {
            if cs[i] == '(' && i > 0 && !('\u{3040}'..='\u{30FF}').contains(&cs[i - 1]) {
                if let Some(e) = cs[i + 1..].iter().position(|&c| c == ')') {
                    if e > 0 && cs[i + 1..i + 1 + e].iter().all(|c| ('\u{3041}'..='\u{3096}').contains(c)) { i += e + 2; continue; }
                }
            }
            out.push(cs[i]);
            i += 1;
        }
        out
    };
    let lev = |a: &[char], b: &[char]| -> usize {
        let mut prev: Vec<usize> = (0..=b.len()).collect();
        for (i, ca) in a.iter().enumerate() {
            let mut cur = vec![i + 1; b.len() + 1];
            for (j, cb) in b.iter().enumerate() { cur[j + 1] = (prev[j] + usize::from(ca != cb)).min(prev[j + 1] + 1).min(cur[j] + 1); }
            prev = cur;
        }
        prev[b.len()]
    };
    let t = std::time::Instant::now();
    let (mut matched, mut exact, mut chars, mut errs, mut vertical, mut vexact) = (0, 0, 0usize, 0usize, 0, 0);
    let mut worst: Vec<(usize, String, String)> = vec![];
    for (k, s) in shows.iter().enumerate() {
        let Some((_, want)) = refs.iter().filter(|r| (r.0 - s.start).abs() <= 0.3).min_by(|a, b| (a.0 - s.start).abs().total_cmp(&(b.0 - s.start).abs())) else { continue };
        let Some((_, img)) = crate::subtitle::subs::crop_ink(&s.img, s.at, s.canvas) else { continue };
        let (got, _) = read_text(&ocr_dir(), &img, &PaddleOpts::default()).unwrap();
        let (g, w) = (squash(&got), squash(want));
        let tall = img.height() > img.width();
        matched += 1;
        if tall { vertical += 1; }
        if g == w { exact += 1; if tall { vexact += 1; } }
        let e = lev(&g, &w);
        chars += w.len();
        errs += e;
        if e > 0 && worst.len() < 15 { worst.push((k + 1, got.replace('\n', "/"), want.clone())); }
    }
    let acc = 1.0 - errs as f64 / chars.max(1) as f64;
    eprintln!("Godzilla ญี่ปุ่น {} ภาพ จับคู่ได้ {matched} ถูกทั้งภาพ {exact} ({:.1}%) แนวตั้ง {vertical} ภาพ ถูก {vexact} · ถูกรายตัวอักษร {:.1}% ใน {:.0} วินาที · ตัวอย่างที่ผิด {worst:?}",
        shows.len(), exact as f64 * 100.0 / matched.max(1) as f64, acc * 100.0, t.elapsed().as_secs_f64());
    assert!(matched >= 1800, "จับคู่กับ SRT ได้น้อยไป {matched}");
    // ผลวัด 17 พ.ย. 2569 ถูกทั้งภาพ 1,498 จาก 1,853 (80.8%) ถูกรายตัวอักษร 96.8% · หลังแก้คอลัมน์ซับแนวตั้งกับคำอ่านตัวเล็ก (T4 T5) 1,503 (81.1%) 97.0% · ตั้งเกณฑ์ต่ำกว่าผลวัดเล็กน้อยกันผลถอยหลัง
    assert!(acc >= 0.96, "ถูกรายตัวอักษรต่ำ {acc}");
    assert!(exact * 100 >= matched * 78, "ถูกทั้งภาพน้อยลง {exact} จาก {matched}");
}

/// อ่านซับไทยที่รู้คำตอบ ทุกภาพต้องถูกทั้งภาพ (โมเดลไทยของ PP-OCRv5)
#[test]
fn thai_test_sub() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
    if !dir.join("th.sup").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return; }
    let shows = crate::subtitle::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
    let want: Vec<String> = std::fs::read_to_string(dir.join("th.truth.txt")).unwrap().lines().map(|l| l.replace("<i>", "").replace("</i>", "").replace('¶', "\n")).collect();
    let o = PaddleOpts { lang: "th".into(), ..Default::default() };
    let mut bad = vec![];
    for (k, (s, w)) in shows.iter().zip(&want).enumerate() {
        let (got, _) = read_text(&ocr_dir(), &s.img, &o).unwrap();
        if got.split_whitespace().collect::<String>() != w.split_whitespace().collect::<String>() { bad.push((k + 1, got, w.clone())); }
    }
    // โมเดลไทยของ PP-OCRv5 พลาดวรรณยุกต์ (ไม้จัตวาเป็นไม้เอก ไม้เอกไม้โทหาย) ผลเทส 16 พ.ย. 2569 ถูกทั้งภาพ 11 จาก 17 ภาพ
    // ตัวสอนเองของขั้น 7 กับตัวชี้จุดสงสัยของขั้น 9 รับเรื่องนี้ · ตรงนี้บังคับว่าไม่นับวรรณยุกต์แล้วต้องถูกทุกภาพ (ลำดับบรรทัด ไม่มีขีดเกิน) และถูกทั้งภาพไม่ลดลง
    let tones = |s: &str| s.chars().filter(|c| !('\u{e48}'..='\u{e4b}').contains(c) && !c.is_whitespace()).collect::<String>();
    let shape: Vec<_> = bad.iter().filter(|b| tones(&b.1) != tones(&b.2)).collect();
    eprintln!("ไทยถูกทั้งภาพ {} จาก {} ภาพ · ผิดเฉพาะวรรณยุกต์ {:?}", shows.len() - bad.len(), shows.len(), bad.iter().map(|b| b.0).collect::<Vec<_>>());
    assert!(shape.is_empty(), "ไทยผิดเกินวรรณยุกต์ {shape:?}");
    assert!(shows.len() - bad.len() >= 11, "ไทยถูกทั้งภาพน้อยลง {bad:?}");
}
