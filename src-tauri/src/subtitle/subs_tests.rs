//! เทสของ subs.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
/// จับเวลาเปิด VobSub ยาว (BUGS ข้อ 151) แยกช่วงอ่านภาพกับช่วงครอปและบันทึก PNG · ตั้ง MOVIE_SHELF_VOB_IDX
#[test]
fn vobsub_open_timing() {
    let Ok(idx) = std::env::var("MOVIE_SHELF_VOB_IDX") else { eprintln!("ข้าม ไม่ได้ตั้ง MOVIE_SHELF_VOB_IDX"); return };
    let idx = PathBuf::from(idx);
    let sub = idx.with_extension("sub");
    let t0 = std::time::Instant::now();
    let shows = vob_shows(&idx, &sub).unwrap();
    let t1 = t0.elapsed();
    let dir = std::env::temp_dir().join("movie-shelf-vobtiming");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let t2 = std::time::Instant::now();
    let out = save_vob_shows(&dir, &shows, None, None, &|_| {}).unwrap();
    let t3 = t2.elapsed();
    eprintln!("ภาพ {} อ่าน {:?} ครอปและบันทึก {:?}", out.len(), t1, t3);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ตัวเก็บภาพหลายเธรด (BUGS ข้อ 151) · เขียนครบทุกไฟล์ ภาพตรงชื่อ ความคืบหน้าเพิ่มขึ้นทีละขั้นจนถึง 1 · เขียนไม่ได้บอกผิดพลาด
#[test]
fn save_pngs_writes_all_with_progress() {
    let dir = std::env::temp_dir().join("movie-shelf-savepngs");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let items: Vec<_> = (1..=250u32).map(|k| (dir.join(format!("c{k:06}.png")), image::RgbaImage::from_pixel(k, 3, image::Rgba([k as u8, 0, 0, 255])))).collect();
    let seen = std::cell::RefCell::new(Vec::new());
    save_pngs(items, &|f| seen.borrow_mut().push(f)).unwrap();
    let seen = seen.into_inner();
    assert!(seen.windows(2).all(|w| w[0] < w[1]), "ความคืบหน้าต้องเพิ่มขึ้นเสมอ");
    assert_eq!(seen.last().copied(), Some(1.0));
    assert!(seen.len() >= 50 && seen.len() <= 101, "บอกทุก 1% {}", seen.len());
    for k in [1u32, 77, 250] {
        let img = image::open(dir.join(format!("c{k:06}.png"))).unwrap().to_rgba8();
        assert_eq!((img.width(), img.get_pixel(0, 0)[0]), (k, k as u8), "ภาพที่ {k} ต้องตรงชื่อ");
    }
    let bad = vec![(dir.join("ไม่มีโฟลเดอร์").join("x.png"), image::RgbaImage::new(2, 2))];
    assert!(save_pngs(bad, &|_| {}).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

/// สีของ VobSub · ซับไทยทดสอบ 480p วาดใหม่ด้วยตัวแดงบนพื้นใส จำนวนภาพเท่าเดิม ภาพเป็นสีแดง · คืนจานสีของไฟล์แล้วภาพกลับเหมือนเดิม
#[test]
fn vobsub_custom_colors() {
    let idx = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr").join("th-480.idx");
    if !idx.exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th-480.idx"); return; }
    let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let work = std::env::temp_dir().join("movie-shelf-vobcolor");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).unwrap();
    let first = images_with(&tools, &work, &idx, 0, &|_| {}).unwrap();
    let before = std::fs::read(&first[0].file).unwrap();
    let red = [[0, 0, 0, 0], [255, 0, 0, 255], [255, 0, 0, 255], [255, 0, 0, 255]];
    let v = vobsub_recolor(&work, &idx, 0, Some(red)).unwrap();
    assert_eq!(v.len(), first.len(), "จำนวนภาพต้องเท่าเดิม");
    let img = image::open(&v[0].file).unwrap().to_rgba8();
    let reds = img.pixels().filter(|p| p[3] > 0).all(|p| p[0] == 255 && p[1] == 0 && p[2] == 0);
    assert!(reds && img.pixels().any(|p| p[3] > 0), "ภาพต้องเป็นสีแดงทั้งหมด");
    // รายการภาพที่อ่านจากที่เก็บได้ภาพใหม่
    assert_eq!(images_with(&tools, &work, &idx, 0, &|_| {}).unwrap().len(), first.len());
    assert!(vobsub_preview(&work, &idx, 0, 1, Some(red)).unwrap().starts_with("data:image/png"));
    let back = vobsub_recolor(&work, &idx, 0, None).unwrap();
    assert_eq!(std::fs::read(&back[0].file).unwrap(), before, "คืนจานสีของไฟล์แล้วภาพเหมือนเดิม");
    assert!(vobsub_recolor(&work, &PathBuf::from("ไม่มี.idx"), 0, None).is_err());
    let _ = std::fs::remove_dir_all(&work);
}

#[test]
fn frame_time_stays_inside_the_movie() {
    for seed in [0u64, 1, 75, 76, 12345, u64::MAX] {
        for attempt in 0..3 {
            let t = super::frame_time(1000.0, seed, attempt);
            assert!((120.0..=870.0).contains(&t), "seed {seed} รอบ {attempt} ได้ {t}");
        }
    }
    assert_ne!(super::frame_time(1000.0, 5, 0), super::frame_time(1000.0, 5, 1), "ลองรอบใหม่ต้องได้เวลาใหม่");
    assert_eq!(super::frame_time(0.0, 5, 0), 1.0, "ไม่รู้ความยาวเรื่อง ใช้วินาทีแรก");
}

use super::*;

/// เดาชุดอักษร · ไทย TIS-620 จริง · ฝรั่งเศส Windows-1252 ไม่โดนเดาเป็นไทย · UTF-8 ที่ขาดกลางตัวอักษรท้ายบัฟเฟอร์ยังเป็น UTF-8 (ผู้ช่วยตรวจขั้น 10 ข้อ 4)
#[test]
fn charset_guess_thai_french_truncated_utf8() {
    let thai: Vec<u8> = vec![0xCA, 0xC7, 0xD1, 0xCA, 0xB4, 0xD5, b' ', 0xA4, 0xE8, 0xD0]; // สวัสดี ค่ะ
    assert_eq!(guess_charset(&thai), "CP874");
    let french = b"Caf\xE9 \xE0 l'\xE9t\xE9 tr\xE8s \xE7a";
    assert_eq!(guess_charset(french), "CP1252");
    assert_eq!(decode_text(french).0, "Café à l'été très ça");
    let utf8 = "สวัสดี".as_bytes();
    assert_eq!(guess_charset(&utf8[..utf8.len() - 1]), "UTF-8", "ขาดไบต์ท้ายยังเป็น UTF-8");
    assert_eq!(decode_text(&thai).1, "TIS-620");
}

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn av(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}
fn work() -> PathBuf {
    let d = std::env::temp_dir().join(format!("movie-shelf-subs-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    d
}

/// ซับรูป .sup ที่ภาพแรกไม่ได้อยู่ที่ศูนย์ เวลาของภาพต้องเป็นเวลาจริงของไฟล์ · ให้ ffmpeg เลื่อนซับตัวอย่างไปเริ่มที่ 100 วินาที
/// (เดิมไม่ใส่ -copyts ffmpeg เลื่อนภาพแรกเป็น 0 วินาที ตัวดูซับรูปกับหน้าต่างแปลงซับภาพบอกเวลาผิดทุกภาพ เจอ 15 พ.ย. 2569
///  ไฟล์ VobSub ตัวอย่างไม่โดนเลื่อนเพราะเวลาเริ่มของไฟล์เป็นศูนย์ ใช้พิสูจน์บั๊กนี้ไม่ได้)
/// ตัวอ่าน PGS ตรง ๆ ได้ภาพชุดเดียวกับทางเดิมที่ให้ ffmpeg วาด · จำนวนภาพ เวลาเริ่ม เวลาจบ ตำแหน่ง ขนาด ตรงกัน
/// (พี่กันทัก 15 พ.ย. 2569 "เราเปิดดู PGS นานมากกก") · ไฟล์ .sup ตัวอย่างของ ffmpeg กับแทร็ก PGS ในหนังทดสอบซับรูป
#[test]
fn sup_reader_matches_render() {
    let base = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media");
    for (path, ff) in [(base.join("ซับตัวอย่าง-ffmpeg").join("pgs_sub.sup"), 0u64), (base.join("สร้าง").join("เสียงซับ").join("ซับรูป (2024).mkv"), 2)] {
        if !path.exists() { continue; }
        let w = work().join(format!("supcmp-{ff}"));
        let _ = std::fs::remove_dir_all(&w);
        std::fs::create_dir_all(w.join("raw")).unwrap();
        let fast = images_from_sup(&tools(), &w, &path, ff, &|_| {}).expect("ทางเร็วต้องอ่าน PGS ได้");
        let slow = images_by_render(&tools(), &w, &w.join("raw"), &path, ff, &|_| {}).unwrap();
        assert_eq!(fast.len(), slow.len(), "{} จำนวนภาพ", path.display());
        for (a, b) in fast.iter().zip(&slow) {
            assert!((a.start - b.start).abs() < 0.05, "เริ่ม {} กับ {}", a.start, b.start);
            assert_eq!(a.end.is_some(), b.end.is_some(), "ภาพ {} เวลาจบ {:?} กับ {:?}", a.n, a.end, b.end);
            if let (Some(x), Some(y)) = (a.end, b.end) { assert!((x - y).abs() < 0.05, "จบ {x} กับ {y}"); }
            assert_eq!(a.canvas, b.canvas);
            // ทางเดิมเผื่อขอบ 4 จุดรอบตัวหนังสือ ตำแหน่งกับขนาดจึงต่างได้ไม่เกินนั้น
            assert!(a.at[0].abs_diff(b.at[0]) <= 8 && a.at[1].abs_diff(b.at[1]) <= 8, "ตำแหน่ง {:?} กับ {:?}", a.at, b.at);
            assert!(a.w.abs_diff(b.w) <= 16 && a.h.abs_diff(b.h) <= 16, "ขนาด {}×{} กับ {}×{}", a.w, a.h, b.w, b.h);
        }
        let _ = std::fs::remove_dir_all(&w);
    }
}

/// วัดเวลากับไฟล์จริงที่ส่งมา (ตั้ง MOVIE_SHELF_SUP เป็นที่อยู่ไฟล์ .sup) · อ่านอย่างเดียว ไม่แตะไฟล์
#[test]
fn sup_reader_speed_on_real_file() {
    let Ok(p) = std::env::var("MOVIE_SHELF_SUP") else { return };
    let path = PathBuf::from(p);
    let w = work().join("supspeed");
    let _ = std::fs::remove_dir_all(&w);
    std::fs::create_dir_all(w.join("raw")).unwrap();
    let t = std::time::Instant::now();
    let fast = images_from_sup(&tools(), &w, &path, 0, &|_| {}).expect("ทางเร็วต้องอ่านได้");
    let tf = t.elapsed().as_secs_f64();
    eprintln!("ทางใหม่ {} ภาพ {:.1} วินาที", fast.len(), tf);
    if std::env::var("MOVIE_SHELF_SUP_SLOW").is_ok() {
        let t = std::time::Instant::now();
        let slow = images_by_render(&tools(), &w, &w.join("raw"), &path, 0, &|_| {}).unwrap();
        eprintln!("ทางเดิม {} ภาพ {:.1} วินาที", slow.len(), t.elapsed().as_secs_f64());
    }
    let _ = std::fs::remove_dir_all(&w);
}

#[test]
fn image_times_are_real_file_times() {
    let sup = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("ซับตัวอย่าง-ffmpeg").join("pgs_sub.sup");
    if !sup.exists() { return; }
    let w = work().join("imgtime");
    let _ = std::fs::remove_dir_all(&w);
    std::fs::create_dir_all(&w).unwrap();
    let late = w.join("late.sup");
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-y".into(), "-itsoffset".into(), "100".into(), "-i".into(), sup.into(),
        "-map".into(), "0:s".into(), "-c".into(), "copy".into(), "-f".into(), "sup".into(), late.clone().into()];
    run_tool_timeout(&tools(), "ffmpeg", &args, Duration::from_secs(60)).unwrap();
    let v = images(&tools(), &w, &late, 0).unwrap();
    assert!(!v.is_empty());
    assert!((v[0].start - 100.0).abs() < 0.1, "ภาพแรก {} ต้องราว 100 วินาที", v[0].start);
    let _ = std::fs::remove_dir_all(&w);
}

/// VobSub ในหนัง MKV อ่านเองด้วย vobsub.rs ได้ภาพชุดเดียวกับทางเดิมที่ให้ ffmpeg วาด (BUGS ข้อ 144)
/// จำนวนภาพ เวลาเริ่ม ตำแหน่ง ตรงกัน · ความคืบหน้าไปถึง 100 · ผลเก็บคู่ไฟล์ track.idx track.sub ไว้ให้ OCR
#[test]
fn vobsub_in_movie_matches_render() {
    let Some(mkv) = av("ซับรูป (2024).mkv") else { return };
    let ff = (0..8u64).find(|i| crate::subtitle::vobsub::is_vobsub_stream(&tools(), &mkv, *i)).expect("หนังทดสอบต้องมีแทร็ก VobSub");
    let w = work().join("vobmkv");
    let _ = std::fs::remove_dir_all(&w);
    std::fs::create_dir_all(&w).unwrap();
    let top = std::sync::atomic::AtomicI64::new(-1);
    let t = std::time::Instant::now();
    let fast = images_with(&tools(), &w, &mkv, ff, &|p| { top.fetch_max(p as i64, std::sync::atomic::Ordering::Relaxed); }).unwrap();
    eprintln!("ทางใหม่ {} ภาพ ใน {:.2} วินาที", fast.len(), t.elapsed().as_secs_f64());
    assert_eq!(top.load(std::sync::atomic::Ordering::Relaxed), 100, "ความคืบหน้าต้องจบที่ 100");
    assert!(fast[0].file.parent().unwrap().join("track.idx").is_file(), "ต้องเก็บคู่ไฟล์ไว้ให้ OCR");
    let raw = w.join("slow");
    std::fs::create_dir_all(raw.join("raw")).unwrap();
    let slow = images_by_render(&tools(), &raw, &raw.join("raw"), &mkv, ff, &|_| {}).unwrap();
    eprintln!("ทางเดิม {} ภาพ", slow.len());
    // ทุกภาพของทางเดิมต้องมีในทางใหม่ เวลากับตำแหน่งตรงกัน · ทางใหม่นับตามไฟล์ .idx แบบ Subtitle Edit
    // ภาพที่ทางเดิมไม่มีต้องเป็นภาพสั้นกว่า 0.1 วินาทีที่ ffmpeg รวมกับภาพข้าง ๆ (ไฟล์ทดสอบมีคู่ภาพห่างกันราว 10 มิลลิวินาที)
    for b in &slow {
        let a = fast.iter().find(|a| (a.start - b.start).abs() < 0.05).unwrap_or_else(|| panic!("ทางใหม่ไม่มีภาพที่ {} วินาที", b.start));
        assert!(a.at[0].abs_diff(b.at[0]) <= 2 && a.at[1].abs_diff(b.at[1]) <= 2, "ภาพ {} ตำแหน่ง {:?} กับ {:?}", a.n, a.at, b.at);
    }
    for a in &fast {
        if slow.iter().any(|b| (a.start - b.start).abs() < 0.05) { continue; }
        let near = |v: &[SubImg]| v.iter().filter(|x| (x.start - a.start).abs() < 4.0).map(|x| (x.start, x.end, x.at, x.w, x.h)).collect::<Vec<_>>();
        assert!(a.end.is_some_and(|e| e - a.start < 0.1), "ภาพ {} ที่ {} วินาทีมีแค่ทางใหม่ และไม่ใช่ภาพสั้น · ทางใหม่ใกล้ ๆ {:?} · ทางเดิมใกล้ ๆ {:?}", a.n, a.start, near(&fast), near(&slow));
    }
    let _ = std::fs::remove_dir_all(&w);
}

/// ซับ VobSub ไทย 720 × 480 ที่ make-test-media สร้างพร้อมคำตอบ · เปิดไฟล์ .idx ตรงได้ครบทุกภาพ ขนาดจอตามไฟล์ ทุกภาพมีเวลาจบ
#[test]
fn vobsub_pair_file_reads_all() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
    let idx = dir.join("th-480.idx");
    if !idx.exists() {
        assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี {} รัน node scripts/make-test-media.mjs ก่อน", idx.display());
        return;
    }
    let want = std::fs::read_to_string(dir.join("th-480.truth.txt")).unwrap().lines().filter(|l| !l.trim().is_empty()).count();
    let w = work().join("vobpair");
    let _ = std::fs::remove_dir_all(&w);
    let v = images(&tools(), &w, &idx, 0).unwrap();
    assert_eq!(v.len(), want, "จำนวนภาพต้องเท่าคำตอบ");
    assert!(v.iter().all(|i| i.canvas == [720, 480] && i.end.is_some_and(|e| e > i.start)));
    let _ = std::fs::remove_dir_all(&w);
}

#[test]
fn decodes_and_parses() {
    // TIS-620 ส ว ั ส ด ี
    let (s, cs) = decode_text(&[0xCA, 0xC7, 0xD1, 0xCA, 0xB4, 0xD5]);
    assert_eq!((s.as_str(), cs.as_str()), ("สวัสดี", "TIS-620"));
    let (u, cu) = decode_text(&[0xFF, 0xFE, b'A', 0, 0x01, 0x0E]);
    assert_eq!((u.as_str(), cu.as_str()), ("Aก", "UTF-16"));
    assert_eq!(decode_text("ดาว".as_bytes()).1, "UTF-8");
    let srt = "1\r\n00:00:01,000 --> 00:00:04,500\r\n<i>สวัสดี</i>\r\nบรรทัดสอง\r\n\r\n2\r\n00:01:02,250 --> 00:01:03,000\r\nB\r\n";
    let c = parse(srt, kind_of(srt, "srt"));
    assert_eq!(c.len(), 2);
    assert_eq!(c[0], Cue { n: 1, start: 1.0, end: 4.5, text: "สวัสดี\nบรรทัดสอง".into() });
    assert!((c[1].start - 62.25).abs() < 1e-9);
    let vtt = "WEBVTT\n\nNOTE ทดสอบ\n\n00:01.000 --> 00:04.000 align:start\n<c.red>Hello</c>\n\nx\n01:00:00.500 --> 01:00:01.000\nB";
    let v = parse(vtt, kind_of(vtt, "txt"));
    assert_eq!((v.len(), v[0].text.as_str(), v[1].start), (2, "Hello", 3600.5));
    let ass = "[Script Info]\nTitle: x\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:05.00,0:00:06.50,Default,,0,0,0,,{\\c&H0000FF&}สอง, มีจุลภาค\\Nบรรทัด\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,หนึ่ง";
    let a = parse(ass, kind_of(ass, "ass"));
    assert_eq!(a.len(), 2);
    assert_eq!((a[0].n, a[0].text.as_str(), a[1].text.as_str(), a[1].end), (1, "หนึ่ง", "สอง, มีจุลภาค\nบรรทัด", 6.5));
}

/// ไฟล์ MKV ที่เพิ่มเข้ามา (ไม่ใช่หนังในหน้า) ดึงแทร็กซับด้วย mkvextract ไม่อ่านไบต์ทั้งไฟล์ (ผู้ช่วยตรวจขั้น 10 ข้อ 6)
#[test]
fn added_container_sub_is_extracted() {
    let Some(mkv) = av("ฟอนต์แนบ (2024).mkv") else { return };
    let o = crate::app::tools::run_tool(&tools(), "mkvmerge", [std::ffi::OsStr::new("-J"), mkv.as_os_str()]).unwrap();
    let j: serde_json::Value = serde_json::from_slice(&o.stdout).unwrap();
    let tid = j["tracks"].as_array().unwrap().iter().find(|t| t["type"] == "subtitles" && t["codec"].as_str().unwrap_or("") == "SubStationAlpha").and_then(|t| t["id"].as_u64()).expect("หนังทดสอบมีซับ ASS");
    let s = text_of(&tools(), &work(), &mkv, false, tid, tid).unwrap();
    assert!(!s.cues.is_empty() && s.charset == "UTF-8" && s.kind == "ass", "{} บรรทัด {} {}", s.cues.len(), s.charset, s.kind);
}

/// ไฟล์ทดสอบ SRT ไทย · TIS-620 ได้ข้อความเดียวกัน · ASS เอาแท็กสีออก · VTT · ซับในหนังดึงด้วย mkvextract
#[test]
fn real_files() {
    let Some(th) = av("ดาวตก (2024).th.srt") else { return };
    let w = work();
    let a = text_of(&tools(), &w, &th, false, 0, 0).unwrap();
    let b = text_of(&tools(), &w, &av("ดาวตก (2024).tis620.th.srt").unwrap(), false, 0, 0).unwrap();
    assert_eq!((a.charset.as_str(), b.charset.as_str(), a.cues.len()), ("UTF-8", "TIS-620", 3));
    assert_eq!(a.cues, b.cues);
    assert!(a.cues[0].text.contains("ซับไตเติลภาษาไทย"));
    let s = text_of(&tools(), &w, &av("ดาวตก (2024).en.ass").unwrap(), false, 0, 0).unwrap();
    assert_eq!((s.kind.as_str(), s.cues.len()), ("ass", 2));
    assert!(!s.cues.iter().any(|c| c.text.contains('{')), "{:?}", s.cues);
    let v = text_of(&tools(), &w, &av("ดาวตก (2024).en.vtt").unwrap(), false, 0, 0).unwrap();
    assert_eq!((v.kind.as_str(), v.cues.len(), v.cues[0].start), ("vtt", 2, 1.0));
    // ซับรูปในหนัง PGS ไทย 1 ภาพ (ขึ้น 1.001 หาย 9.009) · VobSub อังกฤษ 46 แพ็กเก็ต เห็นเป็นภาพ 42 ภาพ (อีก 4 แพ็กเก็ตไม่มีรูป ยาว 0.008–0.017 วินาทีหรือภาพว่าง)
    let img = av("ซับรูป (2024).mkv").unwrap();
    let p = images(&tools(), &w, &img, 2).unwrap();
    assert_eq!(p.len(), 1, "{p:?}");
    assert!((p[0].start - 1.001).abs() < 0.01 && p[0].end.is_some_and(|e| (e - 9.009).abs() < 0.05) && p[0].canvas == [1280, 720] && p[0].w < 1280, "{p:?}");
    let d = images(&tools(), &w, &img, 3).unwrap();
    assert_eq!(d.len(), 42);
    assert!(d.windows(2).all(|x| x[0].start < x[1].start) && d.iter().all(|i| i.file.exists() && i.w > 0));
    // ครั้งที่สองใช้ผลที่เก็บไว้
    let t0 = std::time::Instant::now();
    assert_eq!(images(&tools(), &w, &img, 3).unwrap().len(), 42);
    assert!(t0.elapsed().as_millis() < 500);
    let f = frame(&tools(), &av("ดาวตก (2024).mkv").unwrap(), 5.0, 240).unwrap();
    assert!(f.starts_with("data:image/jpeg;base64,") && f.len() > 2000);
    let _ = std::fs::remove_dir_all(&w);
}
