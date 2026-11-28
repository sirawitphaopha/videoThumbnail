//! เทสของ subdoc.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn media(name: &str) -> Option<PathBuf> {
    if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return None; }
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join(name);
    assert!(p.exists(), "ไม่มีไฟล์ทดสอบ {} · รัน node scripts/make-test-media.mjs ก่อน (หรือตั้ง MOVIE_SHELF_SKIP_MEDIA=1)", p.display());
    Some(p)
}

fn roundtrip(bytes: &[u8], hint: &str) -> SubDoc {
    let doc = parse_doc(bytes, hint, None);
    assert!(doc.exact, "เข้ารหัสกลับต้องได้ไบต์เดิม");
    let (out, _, bad) = to_bytes(&doc);
    assert_eq!(bad, None);
    assert!(out == bytes, "เปิดแล้วบันทึกโดยไม่แก้ต้องเหมือนเดิมทุกไบต์\nได้\n{}", String::from_utf8_lossy(&out));
    // ส่งผ่านหน้าจอ (JSON) แล้วกลับมายังเหมือนเดิม
    let back: SubDoc = serde_json::from_str(&serde_json::to_string(&doc).unwrap()).unwrap();
    assert!(to_bytes(&back).0 == bytes);
    doc
}

#[test]
fn time_like_aegisub() {
    assert_eq!(parse_time("0:00:04.07"), 4070);
    assert_eq!(parse_time("00:00:04,070"), 4070);
    assert_eq!(parse_time("00:00:10,04"), 10040);
    assert_eq!(parse_time("01:02.5"), 62500);
    // ช่องเลเยอร์ที่เป็น Marked=0 ในไฟล์ ASS อ่านเป็นเลเยอร์ 0 แบบ Aegisub ไม่เป็นบรรทัดอ่านไม่ออก (R8)
    let fmt: Vec<String> = EVENT_FORMAT.iter().map(|s| s.to_string()).collect();
    let m = parse_event_line("Dialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,สวัสดี", &fmt).expect("ต้องอ่านได้");
    assert_eq!((m.layer, m.start, m.text.as_str()), (0, 1000, "สวัสดี"));
    // ตัวเลขยาวเกิน 19 หลักไม่ทำให้โปรแกรมพัง ได้เวลาสูงสุด (R14)
    assert_eq!(parse_time("99999999999999999999999:00:00.00"), MAX_MS);
    assert_eq!(parse_time("0:00:00.999999999999999999999999"), 999);
    assert_eq!(ass_time(4074), "0:00:04.07");
    assert_eq!(ass_time(4075), "0:00:04.08");
    assert_eq!(srt_time(3_723_004, ','), "01:02:03,004");
    assert_eq!(srt_time(3_723_004, '.'), "01:02:03.004");
}

/// ข้อ R5 ไฟล์ที่บรรทัดสุดท้ายไม่มีตัวขึ้นบรรทัด เพิ่มบรรทัดต่อท้าย หรือย้ายบรรทัดสุดท้ายขึ้นไปก่อน แล้วอ่านกลับต้องได้จำนวนบรรทัดและข้อความครบ
#[test]
fn no_final_newline_then_add_or_reorder() {
    let cases: [(&str, &str); 2] = [
        ("ass", "[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,สวัสดี\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,ลาก่อน"),
        ("srt", "1\n00:00:01,000 --> 00:00:02,000\nสวัสดี\n\n2\n00:00:03,000 --> 00:00:04,000\nลาก่อน"),
    ];
    for (kind, text) in cases {
        let d = parse_doc(text.as_bytes(), kind, None);
        assert_eq!(render(&d), text, "{kind} ไม่แก้ได้ไบต์เดิม");
        // เพิ่มบรรทัดต่อท้าย
        let mut add = d.clone();
        let mut e = add.events[1].clone();
        e.id = 99; e.start = 5000; e.end = 6000; e.text = "ใหม่".into(); e.raw = vec![]; e.pre = vec![]; e.ident = None;
        add.events.push(e);
        let back = parse_doc(render(&add).as_bytes(), kind, None);
        assert_eq!(back.events.iter().map(|x| x.text.as_str()).collect::<Vec<_>>(), ["สวัสดี", "ลาก่อน", "ใหม่"], "{kind} เพิ่มท้าย {:?}", render(&add));
        // ย้ายบรรทัดสุดท้ายขึ้นไปก่อน
        let mut mv = d.clone();
        mv.events.swap(0, 1);
        let back = parse_doc(render(&mv).as_bytes(), kind, None);
        assert_eq!(back.events.iter().map(|x| x.text.as_str()).collect::<Vec<_>>(), ["ลาก่อน", "สวัสดี"], "{kind} เรียงใหม่ {:?}", render(&mv));
    }
}

#[test]
fn inline_roundtrips() {
    // ASS ตัวจบบรรทัดปน ไม่มีขึ้นบรรทัดท้ายไฟล์ บรรทัดเสีย บรรทัดความเห็น
    let ass = "[Script Info]\r\n; x\r\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: A,Arial,20\n\nStyle: B , Tahoma ,30\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,A,,0,0,0,,a, b\\Nc\nDialogue: broken\nComment: 1,0:00:03.00,0:00:04.00,B,x,0010,0,0,,cm";
    let d = roundtrip(ass.as_bytes(), "ass");
    assert_eq!(d.styles.len(), 2);
    assert_eq!(d.events.len(), 2);
    assert_eq!(d.bad, 1);
    assert_eq!(d.events[0].text, "a, b\\Nc");
    assert!(d.events[1].comment);
    assert_eq!(d.events[1].margin_l, 10);
    // SRT บรรทัดว่างกลางข้อความ ไม่มีเลขลำดับ ขึ้นต้นด้วยบรรทัดว่าง
    let srt = "\n1\n00:00:01,000 --> 00:00:02,000\nบรรทัด\n\nต่อ\n\n00:00:03,000 --> 00:00:04,500  X1:10\nไม่มีเลข\n\n\n";
    let d = roundtrip(srt.as_bytes(), "srt");
    assert_eq!(d.events.len(), 2);
    assert_eq!(d.events[0].text, "บรรทัด\n\nต่อ");
    assert_eq!(d.events[1].ident, None);
    assert_eq!(d.events[1].suffix, "  X1:10");
    // VTT หัวไฟล์ NOTE ชื่อบรรทัด ค่าตั้งตำแหน่ง
    let vtt = "WEBVTT\n\nNOTE ทดสอบ\nสองบรรทัด\n\nintro\n00:01.000 --> 00:02.000 align:start\nhi\n";
    let d = roundtrip(vtt.as_bytes(), "vtt");
    assert_eq!(d.events.len(), 1);
    assert_eq!(d.events[0].ident.as_deref(), Some("intro"));
    assert_eq!(d.events[0].start, 1000);
}

#[test]
fn edit_one_line_keeps_the_rest() {
    let ass = "[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0000,0000,0000,,one\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0000,0000,0000,,two\n";
    let mut d = parse_doc(ass.as_bytes(), "ass", None);
    d.events[1].text = "สอง".into();
    d.events[1].start = 3456;
    d.events[1].actor = "a,b".into();
    let out = render(&d);
    assert!(out.contains("Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0000,0000,0000,,one\n"), "บรรทัดที่ไม่ได้แก้ต้องเหมือนเดิม");
    assert!(out.contains("Dialogue: 0,0:00:03.46,0:00:04.00,Default,a;b,0,0,0,,สอง\n"), "{out}");
    // ลบบรรทัดแรก เพิ่มบรรทัดใหม่ท้าย
    d.events.remove(0);
    d.events.push(Event { id: 99, start: 5000, end: 6000, style: "Default".into(), text: "ใหม่".into(), ..Default::default() });
    let out = render(&d);
    assert!(!out.contains(",one"));
    assert!(out.ends_with("Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,ใหม่\n"), "{out}");
    // SRT แก้ข้อความบรรทัดเดียว เลขลำดับเรียงใหม่ตอนลบ
    let srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nหนึ่ง\r\n\r\n2\r\n00:00:03,000-->00:00:04,000\r\nสอง\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nสาม\r\n";
    let mut d = parse_doc(srt.as_bytes(), "srt", None);
    d.events[2].text = "สาม\nสี่".into();
    let out = render(&d);
    assert!(out.contains("00:00:03,000-->00:00:04,000\r\nสอง"), "บรรทัดเวลาที่ไม่ได้แก้คงรูปเดิม");
    assert!(out.ends_with("3\r\n00:00:05,000 --> 00:00:06,000\r\nสาม\r\nสี่\r\n"), "{out:?}");
    d.events.remove(0);
    let out = render(&d);
    assert!(out.starts_with("1\r\n00:00:03,000-->00:00:04,000\r\nสอง\r\n\r\n2\r\n"), "{out:?}");
    // เลขเดิมไม่เรียง (ไฟล์ตัดต่อมา) คงเลขเดิมทุกบรรทัด บรรทัดใหม่ได้เลขตามตำแหน่ง
    let odd = "82\n00:00:01,000 --> 00:00:02,000\nก\n\n57\n00:00:03,000 --> 00:00:04,000\nข\n";
    let mut d = parse_doc(odd.as_bytes(), "srt", None);
    assert!(!d.renumber);
    d.events.remove(0);
    d.events.push(Event { id: 9, start: 5000, end: 6000, text: "ค".into(), ..Default::default() });
    assert_eq!(render(&d), "57\n00:00:03,000 --> 00:00:04,000\nข\n\n2\n00:00:05,000 --> 00:00:06,000\nค\n");
}

#[test]
fn charsets_keep_bytes() {
    // ตัวพิเศษของ CP874 (… “ ”) เข้ารหัสไปกลับได้
    let sp = Enc { charset: "TIS-620".into(), bom: false };
    assert_eq!(decode_as(&encode("ไทย … “x”", &sp).unwrap(), "TIS-620").0, "ไทย … “x”");
    let th = "1\r\n00:00:01,000 --> 00:00:02,000\r\nสวัสดีชาวไทยทุกคน\r\n";
    let enc = Enc { charset: "TIS-620".into(), bom: false };
    let b = encode(th, &enc).unwrap();
    let d = roundtrip(&b, "srt");
    assert_eq!(d.enc, enc);
    let u16 = encode(th, &Enc { charset: "UTF-16LE".into(), bom: true }).unwrap();
    assert_eq!(roundtrip(&u16, "srt").enc.charset, "UTF-16LE");
    let be = encode(th, &Enc { charset: "UTF-16BE".into(), bom: true }).unwrap();
    assert_eq!(roundtrip(&be, "srt").enc.charset, "UTF-16BE");
    let fr = encode("1\n00:00:01,000 --> 00:00:02,000\nÉté à Paris — œuvre\n", &Enc { charset: "Windows-1252".into(), bom: false }).unwrap();
    assert_eq!(roundtrip(&fr, "srt").enc.charset, "Windows-1252");
    // ตัวที่ TIS-620 เก็บไม่ได้ บันทึกเป็น UTF-8 มี BOM แล้วบอกตัวนั้น
    let mut d = parse_doc(&b, "srt", None);
    d.events[0].text = "ไทย 日本".into();
    let (out, enc, bad) = to_bytes(&d);
    assert_eq!(bad, Some('日'));
    assert_eq!(enc.charset, "UTF-8");
    assert!(out.starts_with(&[0xEF, 0xBB, 0xBF]));
    // ไฟล์ที่มีไบต์เสียเข้ารหัสกลับไม่ได้ไบต์เดิม ต้องติดป้าย
    let mut bad_th = encode("1\n00:00:01,000 --> 00:00:02,000\nสวัสดีครับผมชื่อดาว", &enc).unwrap();
    bad_th.push(0xDB);
    assert!(!parse_doc(&bad_th, "srt", None).exact, "ไบต์ 0xDB ไม่มีใน TIS-620 เข้ารหัสกลับไม่ได้ ต้องเตือน");
}

#[test]
fn tags_between_srt_and_ass() {
    assert_eq!(srt_to_ass_text("<i>เอียง</i> <b>หนา</b>\nสอง"), "{\\i1}เอียง{\\i} {\\b1}หนา{\\b}\\Nสอง");
    assert_eq!(srt_to_ass_text("<font color=\"#FFA000\">ส้ม</font>"), "{\\c&H00A0FF&}ส้ม{\\c}");
    assert_eq!(srt_to_ass_text("<font face='Leelawadee UI'><font size=\"30\">x</font></font>"), "{\\fnLeelawadee UI\\fs30}x{\\fs\\fn}");
    assert_eq!(srt_to_ass_text("a <unknown> b"), "a <unknown> b");
    assert_eq!(ass_to_srt_text("{\\i1}เอียง{\\i0} และ{\\b1\\fs40}หนา\\Nบรรทัด"), "<i>เอียง</i> และ<b>หนา\nบรรทัด</b>");
    assert_eq!(ass_to_srt_text("{\\pos(1,2)\\bord3\\blur2}ป้าย{\\p1}m 0 0 l 1 1{\\p0} จบ"), "ป้าย จบ");
}

#[test]
fn ass_to_srt_reports_loss() {
    let Some(p) = media("ฉากตัด (2025).th.ass") else { return };
    let d = parse_doc(&std::fs::read(&p).unwrap(), "ass", None);
    let (s, lost) = to_srt(&d);
    let keys: Vec<&str> = lost.iter().map(|l| l.key.as_str()).collect();
    for k in ["comment", "actor", "layer", "style", "effect", "margin", "tags", "fonts"] { assert!(keys.contains(&k), "ต้องเตือนว่า {k} หาย ได้ {keys:?}"); }
    assert_eq!(s.events.len(), 6, "บรรทัดความคิดเห็นหาย เหลือ 6");
    assert!(s.events.windows(2).all(|w| w[0].start <= w[1].start), "เรียงตามเวลาเริ่ม");
    let out = render(&s);
    assert!(out.starts_with("1\r\n00:00:00,500 --> 00:00:03,400\r\nสวัสดีค่ะ"), "{out}");
    assert!(out.contains("ฉากที่สอง<i>ตัวเอียง</i> และ<b>ตัวหนา</b>\r\nขึ้นบรรทัดใหม่"));
    // SRT กลับเป็น ASS อ่านซ้ำได้ ตัวหนาตัวเอียงยังอยู่
    let a = to_ass(&s, (1280, 720));
    let back = parse_doc(render(&a).as_bytes(), "ass", None);
    assert_eq!(back.events.len(), 6);
    assert!(back.events.iter().any(|e| e.text.contains("{\\i1}ตัวเอียง{\\i}")));
    assert!(render(&a).contains("PlayResY: 720"));
}

#[test]
fn test_media_roundtrips() {
    for name in ["ฉากตัด (2025).th.ass", "ฉากตัด (2025).bom-crlf.th.ass", "ฉากตัด (2025).th.srt", "ฉากตัด (2025).utf16.th.srt", "ฉากตัด (2025).tis620.th.srt", "ยาว 2000 บรรทัด.th.srt"] {
        let Some(p) = media(name) else { return };
        let ext = p.extension().unwrap().to_string_lossy().to_string();
        let d = roundtrip(&std::fs::read(&p).unwrap(), &ext);
        assert_eq!(d.bad, 0, "{name} อ่านออกทุกบรรทัด");
        match name {
            n if n.contains("2000") => assert_eq!(d.events.len(), 2000),
            n if n.ends_with(".ass") => {
                assert_eq!((d.styles.len(), d.events.len()), (3, 7), "{name}");
                assert_eq!(d.styles[1].fields[0], "ป้ายในฉาก");
                let e = &d.events[4];
                assert_eq!((e.actor.as_str(), e.margin_l, e.margin_r, e.margin_v), ("ดาว", 25, 30, 48));
                assert_eq!(d.events[5].effect, "Banner;12;0;30");
                assert_eq!(d.events[5].layer, 2);
                assert!(d.events[3].comment);
                assert!(d.skeleton.iter().any(|i| matches!(i, Item::Line { t, .. } if t == "[Aegisub Extradata]")));
            }
            _ => {
                assert_eq!(d.events.len(), 5, "{name}");
                assert_eq!(d.events[1].text, "ฉากที่สอง<i>ตัวเอียง</i> และ<b>ตัวหนา</b>\nขึ้นบรรทัดใหม่");
            }
        }
    }
    // ไฟล์ซับตัวอย่างของ FFmpeg ถ้ามี (ไม่ขึ้น git) · ไฟล์ที่เข้ารหัสกลับได้ต้องบันทึกกลับเหมือนเดิม ไฟล์ที่ไม่ได้ต้องติดป้าย exact
    let ff = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("ซับตัวอย่าง-ffmpeg");
    let (mut same, mut flagged) = (Vec::new(), Vec::new());
    if let Ok(rd) = std::fs::read_dir(&ff) {
        for f in rd.flatten() {
            let p = f.path();
            let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt") { continue; }
            let b = std::fs::read(&p).unwrap();
            let d = parse_doc(&b, &ext, None);
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            if d.exact { assert!(to_bytes(&d).0 == b, "{name} เปิดแล้วบันทึกต้องเหมือนเดิม"); same.push(format!("{name} {} บรรทัด", d.events.len())); } else { flagged.push(name); }
        }
        println!("ไฟล์ตัวอย่าง FFmpeg บันทึกกลับเหมือนเดิม {} ไฟล์ {same:?} · ติดป้ายเข้ารหัสกลับไม่ได้ {flagged:?}", same.len());
        assert!(!same.is_empty());
    }
}

/// ซับในหนังดึงด้วย mkvextract แล้วบันทึกกลับต้องได้ข้อความเดียวกับที่ดึงออกมาทุกไบต์ (ไม่ใช่ไฟล์ต้นทาง ดู test-media/README.md)
#[test]
fn movie_tracks_roundtrip() {
    let Some(m) = media("ฉากตัด (2025).mkv") else { return };
    let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let work = std::env::temp_dir();
    for (tid, kind, n) in [(2, "ass", 7), (3, "srt", 5)] {
        let (b, hint) = crate::subtitle::subs::bytes_of(&tools, &work, &m, true, tid, 0).unwrap();
        let d = roundtrip(&b, &hint);
        assert_eq!((d.kind.as_str(), d.events.len()), (kind, n), "แทร็ก {tid}");
    }
}

#[test]
fn save_replaces_and_keeps_others() {
    if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return; }
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-subdoc-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("ทดสอบ.th.srt");
    std::fs::write(&f, "1\r\n00:00:01,000 --> 00:00:02,000\r\nเดิม\r\n").unwrap();
    let other = dir.join("ทดสอบ (2).th.srt");
    std::fs::write(&other, "ห้ามโดนทับ").unwrap();
    let mut d = parse_doc(&std::fs::read(&f).unwrap(), "srt", None);
    let (size, mtime) = stamp(&f);
    d.source = Some(Source { path: f.display().to_string(), in_movie: false, size, mtime, tid: None });
    d.events[0].text = "ใหม่".into();
    // ไฟล์ใหม่ชื่อชน ต้องไม่ทับ
    assert_eq!(save(&d, &other, "new", false).unwrap_err(), "exists");
    assert_eq!(std::fs::read_to_string(&other).unwrap(), "ห้ามโดนทับ");
    // ไฟล์ถูกแก้จากที่อื่นหลังเปิด ต้องถามก่อน
    std::thread::sleep(std::time::Duration::from_millis(20));
    std::fs::write(&f, "1\r\n00:00:01,000 --> 00:00:02,000\r\nมีคนแก้\r\n").unwrap();
    assert_eq!(save(&d, &f, "replace", false).unwrap_err(), "changed");
    let s = save(&d, &f, "replace", true).unwrap();
    assert_eq!(std::fs::read_to_string(&f).unwrap(), "1\r\n00:00:01,000 --> 00:00:02,000\r\nใหม่\r\n");
    assert_eq!(s.enc.charset, "UTF-8");
    // บันทึกเป็นไฟล์ใหม่ได้ ไม่มีไฟล์ .partial ค้าง
    let n = dir.join("ใหม่.ass");
    let a = to_ass(&d, (1920, 1080));
    save(&a, &n, "new", false).unwrap();
    assert!(n.exists());
    assert!(std::fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".partial")));
    // ซับในหนังบันทึกทับไม่ได้
    let mut m = d.clone();
    m.source = Some(Source { path: f.display().to_string(), in_movie: true, size: 0, mtime: 0, tid: Some(2) });
    assert!(save(&m, &f, "replace", false).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn autosave_quota_per_path_charset_and_total_cap() {
    // BUGS ข้อ 162.10 (ROADMAP R11 ข้อ 2 ถึง 4)
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-autosave162-{}", crate::cover::poster_image::unique()));
    let auto = dir.join("autosave");
    std::fs::create_dir_all(&auto).unwrap();
    let srt = "1\n00:00:01,000 --> 00:00:02,000\nก\n";
    let doc_at = |folder: &str| {
        let f = dir.join(folder);
        std::fs::create_dir_all(&f).unwrap();
        let p = f.join("เดิม.th.srt");
        std::fs::write(&p, srt).unwrap();
        let mut d = parse_doc(srt.as_bytes(), "srt", None);
        let (size, mtime) = stamp(&p);
        d.source = Some(Source { path: p.display().to_string(), in_movie: false, size, mtime, tid: None });
        d
    };
    // ① ซับชื่อเดียวกันคนละโฟลเดอร์ ไม่แย่งโควตากัน
    let (a, b) = (doc_at("ก"), doc_at("ข"));
    for _ in 0..3 { autosave_to(&auto, &b, "เดิม.th.srt").unwrap(); }
    for _ in 0..12 { autosave_to(&auto, &a, "เดิม.th.srt").unwrap(); }
    let list = list_autosaves(&auto);
    let of = |d: &SubDoc| list.iter().filter(|x| x.source.as_ref().map(|s| &s.path) == d.source.as_ref().map(|s| &s.path)).count();
    assert_eq!((of(&a), of(&b)), (10, 3), "นับโควตาตามที่อยู่ไฟล์ ไม่ใช่ชื่อ");
    // ซับในหนังเดียวกันคนละแทร็กก็แยกโควตา
    let mut m3 = a.clone();
    m3.source = Some(Source { path: dir.join("หนัง.mkv").display().to_string(), in_movie: true, size: 0, mtime: 0, tid: Some(3) });
    let mut m4 = m3.clone();
    m4.source.as_mut().unwrap().tid = Some(4);
    assert_ne!(autosave_to(&auto, &m3, "หนัง.mkv").unwrap().key, autosave_to(&auto, &m4, "หนัง.mkv").unwrap().key);
    // ② จดรหัสอักษร ซับไทย TIS-620 เปิดคืนแล้วได้ TIS-620 กับข้อความเดิม
    let tis: Vec<u8> = b"1\r\n00:00:01,000 --> 00:00:02,000\r\n".iter().copied().chain([0xA1, 0xD2, 0xC3]).chain(*b"\r\n").collect();
    let t = parse_doc(&tis, "srt", Some("TIS-620"));
    let it = autosave_to(&auto, &t, "ไทย.srt").unwrap();
    assert_eq!(it.charset.as_deref(), Some("TIS-620"));
    let back = open_autosave(&auto, Path::new(&it.path)).unwrap();
    assert_eq!(back.enc.charset, "TIS-620");
    assert_eq!(back.events[0].text, "การ");
    // ฉบับรุ่นก่อนที่ไม่มี key กับ charset ยังอ่านได้ และนับโควตาตามชื่อ
    let j = format!("{}.json", it.path);
    let mut v: serde_json::Value = serde_json::from_slice(&std::fs::read(&j).unwrap()).unwrap();
    v.as_object_mut().unwrap().remove("key");
    v.as_object_mut().unwrap().remove("charset");
    std::fs::write(&j, serde_json::to_vec(&v).unwrap()).unwrap();
    let old = list_autosaves(&auto).into_iter().find(|x| x.path == it.path).unwrap();
    assert_eq!((old.key.as_str(), old.charset.as_deref()), ("", None));
    // ③ เพดานรวมจำนวน เก็บฉบับใหม่สุด ลบเก่าสุดก่อน
    let total = list_autosaves(&auto).len();
    let newest = autosave_capped(&auto, &t, "อีก.srt", 5, u64::MAX).unwrap();
    let left = list_autosaves(&auto);
    assert!(total > 5);
    assert_eq!(left.len(), 5);
    assert_eq!(left[0].path, newest.path, "ฉบับที่เพิ่งเขียนต้องอยู่");
    // ③ เพดานรวมขนาด ส่งเพดานเท่าฉบับเดียว เหลือแค่ฉบับใหม่
    let one = autosave_capped(&auto, &t, "ขนาด.srt", 200, 1).unwrap();
    let left = list_autosaves(&auto);
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].path, one.path);
    assert_eq!((MAX_AUTOSAVES, MAX_AUTOSAVE_BYTES), (200, 100 * 1024 * 1024));
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn autosave_keeps_ten_and_reopens_to_the_original() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-autosave-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let orig = dir.join("เดิม.th.srt");
    std::fs::write(&orig, "1\n00:00:01,000 --> 00:00:02,000\nก\n").unwrap();
    let mut d = parse_doc(&std::fs::read(&orig).unwrap(), "srt", None);
    let (size, mtime) = stamp(&orig);
    d.source = Some(Source { path: orig.display().to_string(), in_movie: false, size, mtime, tid: None });
    let auto = dir.join("autosave");
    std::fs::create_dir_all(&auto).unwrap();
    for k in 0..12 {
        d.events[0].text = format!("แก้ครั้งที่ {k}");
        autosave_to(&auto, &d, "เดิม.th.srt").unwrap();
    }
    // อีกไฟล์เป็นซับใหม่ที่ยังไม่มีไฟล์ของตัวเอง โควตาแยกจากไฟล์เดิม (ตั้งแต่ BUGS ข้อ 162.10 นับโควตาตามที่อยู่ไฟล์)
    let mut fresh = d.clone();
    fresh.source = None;
    let other = autosave_to(&auto, &fresh, "อีกไฟล์.ass").unwrap();
    let list = list_autosaves(&auto);
    assert_eq!(list.iter().filter(|a| a.name == "เดิม.th.srt").count(), 10, "เก็บ 10 ฉบับล่าสุดต่อไฟล์");
    assert_eq!(list[0].path, other.path, "ใหม่สุดก่อน");
    let newest = list.iter().find(|a| a.name == "เดิม.th.srt").unwrap();
    // เปิดฉบับใหม่สุด ได้ข้อความล่าสุด ที่มาเป็นไฟล์เดิม
    let back = open_autosave(&auto, Path::new(&newest.path)).unwrap();
    assert_eq!(back.events[0].text, "แก้ครั้งที่ 11");
    assert_eq!(back.source.as_ref().unwrap().path, orig.display().to_string());
    assert!(!back.source.as_ref().unwrap().in_movie);
    // ไฟล์นอกโฟลเดอร์บันทึกอัตโนมัติเปิดผ่านทางนี้ไม่ได้
    assert!(open_autosave(&auto, &orig).is_err());
    // ไฟล์เดิมหายไป ยังเป็นไฟล์ซับ (ไม่ใช่ซับในหนัง) บันทึกทับได้ "missing" หน้าจอพาไปบันทึกเป็นไฟล์ใหม่ (R1)
    std::fs::remove_file(&orig).unwrap();
    let gone = open_autosave(&auto, Path::new(&newest.path)).unwrap();
    let gs = gone.source.clone().unwrap();
    assert!(!gs.in_movie);
    assert_eq!((gs.size, gs.mtime), (0, 0));
    assert_eq!(save(&gone, &orig, "replace", false).unwrap_err(), "missing");
    // ฉบับบันทึกอัตโนมัติของซับในหนังจำเลขแทร็กไว้ (F18)
    let mut mv = d.clone();
    mv.source = Some(Source { path: dir.join("หนัง.mkv").display().to_string(), in_movie: true, size: 0, mtime: 0, tid: Some(3) });
    let ma = autosave_to(&auto, &mv, "หนัง.mkv แทร็ก 3").unwrap();
    let back_movie = open_autosave(&auto, Path::new(&ma.path)).unwrap().source.unwrap();
    assert!(back_movie.in_movie);
    assert_eq!(back_movie.tid, Some(3));
    // นาฬิกาเครื่องถอยหลัง ฉบับเก่ามีลำดับมากกว่าฉบับใหม่ ฉบับที่เพิ่งเขียนต้องยังอยู่ และยังเก็บรวม 10 ฉบับ (R11)
    for a in list_autosaves(&auto) {
        let j = format!("{}.json", a.path);
        let mut v: serde_json::Value = serde_json::from_slice(&std::fs::read(&j).unwrap()).unwrap();
        v["seq"] = serde_json::json!(u64::MAX / 2 + a.seq);
        std::fs::write(&j, serde_json::to_vec(&v).unwrap()).unwrap();
    }
    let back_clock = autosave_to(&auto, &d, "เดิม.th.srt").unwrap();
    assert!(Path::new(&back_clock.path).exists(), "ฉบับที่เพิ่งเขียนถูกลบ");
    assert_eq!(list_autosaves(&auto).iter().filter(|a| a.name == "เดิม.th.srt").count(), 10);
    let _ = std::fs::remove_dir_all(&dir);
}
