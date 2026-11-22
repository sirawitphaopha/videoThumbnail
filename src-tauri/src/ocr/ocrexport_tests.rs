//! เทสของ ocrexport.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn row(start: f64, end: Option<f64>, text: &str, an: &[u8]) -> ExpRow { ExpRow { start, end, text: text.into(), an: an.to_vec() } }
fn req(rows: Vec<ExpRow>, fmt: &str, top: &str) -> ExpReq { ExpReq { rows, fmt: fmt.into(), top: top.into(), italic: true, enc: "utf8bom".into(), canvas: [1920, 1080] } }

/// ป้ายบนจอกับบทพูดล่างจอในภาพเดียว แยกเป็นสองแถวเวลาเดียวกัน ป้ายติด {\an8} · รวมไว้ล่างจอได้แถวเดียวไม่มีแท็ก
/// เวลาจบที่ไม่รู้ใช้เวลาเริ่มของภาพถัดไปไม่เกิน 5 วินาที · ภาพไม่มีข้อความไม่ถูกเขียน · ปิดตัวเอียงแล้วแท็ก i หาย
#[test]
fn alignment_groups_and_end_times() {
    let rows = vec![
        row(1.0, Some(2.5), "Kobe Street\nI'm here.\n<i>Hello.</i>", &[8, 2, 2]),
        row(3.0, None, "No end time", &[2]),
        row(4.0, None, "   ", &[2]),
        row(20.0, None, "Last", &[]),
    ];
    let t = lines_of(&req(rows.clone(), SRT, "tag"));
    assert_eq!(t, vec![
        (1000, 2500, "{\\an8}Kobe Street".to_string()),
        (1000, 2500, "I'm here.\n<i>Hello.</i>".to_string()),
        (3000, 4000, "No end time".to_string()),
        (20000, 25000, "Last".to_string()),
    ]);
    // ตัวเอียงคร่อมป้ายกับบทพูด ปิดเปิดแท็กครบทั้งสองแถว (T6) · ลบบรรทัดป้ายแล้วตำแหน่งไม่เลื่อนไปบทพูด (T10)
    let tagged = lines_of(&req(vec![row(1.0, Some(2.0), "<i>ป้าย\nบทพูด</i>", &[8, 2])], SRT, "tag"));
    assert_eq!(tagged.iter().map(|x| x.2.clone()).collect::<Vec<_>>(), vec!["{\\an8}<i>ป้าย</i>".to_string(), "<i>บทพูด</i>".to_string()]);
    let edited = lines_of(&req(vec![row(1.0, Some(2.0), "บทพูดหนึ่ง\nบทพูดสอง", &[8, 2, 2])], SRT, "tag"));
    assert_eq!(edited, vec![(1000, 2000, "บทพูดหนึ่ง\nบทพูดสอง".to_string())]);
    let d = lines_of(&req(rows.clone(), SRT, "down"));
    assert_eq!(d[0], (1000, 2500, "Kobe Street\nI'm here.\n<i>Hello.</i>".to_string()));
    assert_eq!(d.len(), 3);
    let mut r = req(rows, SRT, "tag");
    r.italic = false;
    assert_eq!(lines_of(&r)[1].2, "I'm here.\nHello.");
}

/// SRT เขียนเลขลำดับ เวลา และแท็ก {\an8} · ASS ได้ PlayRes ตามจอของซับรูป แท็กตำแหน่งยังอยู่ ตัวเอียงเป็น {\i1}
#[test]
fn srt_and_ass_text() {
    let rows = vec![row(1.0, Some(2.0), "Top\n<i>Bottom</i>", &[8, 2])];
    let srt = subdoc::render(&doc_of(&req(rows.clone(), SRT, "tag")));
    assert!(srt.contains("1\r\n00:00:01,000 --> 00:00:02,000\r\n{\\an8}Top\r\n"), "{srt}");
    assert!(srt.contains("2\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Bottom</i>"), "{srt}");
    let mut r = req(rows, ASS, "tag");
    r.canvas = [720, 480];
    let ass = subdoc::render(&doc_of(&r));
    assert!(ass.contains("PlayResX: 720") && ass.contains("PlayResY: 480"), "{ass}");
    assert!(ass.contains(",{\\an8}Top") && ass.contains(",{\\i1}Bottom{\\i}"), "{ass}");
}

/// เขียนไฟล์จริงสามรหัสอักษร · ไฟล์มีอยู่แล้วไม่ทับ · ชนิดของ SeConv (WebVTT) แปลงได้ ตัดหรือเก็บ BOM ตามที่เลือก · TIS-620 อ่านกลับเป็นไทยเดิม
#[test]
fn export_files_and_seconv() {
    let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    // โฟลเดอร์ทำงานไว้ใต้ LOCALAPPDATA (ไดรฟ์ C แบบโปรแกรมจริง) · dev.ps1 ตั้งโฟลเดอร์ชั่วคราวไว้ไดรฟ์ D ใช้ตัวนั้นแล้วไม่เคยย้ายข้ามไดรฟ์
    let work = std::env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir()).join("movie-shelf-test-ocrexp");
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).unwrap();
    let rows = vec![row(1.0, Some(2.0), "สวัสดีครับ\nบรรทัดสอง", &[2, 2]), row(3.0, Some(4.0), "ชื่อสถานที่", &[8])];
    let srt = work.join("a.srt");
    let mut r = req(rows.clone(), SRT, "tag");
    r.enc = "utf8".into();
    let out = export(&tools, &work, &r, &srt).unwrap();
    assert_eq!(out.lines, 2);
    let b = std::fs::read(&srt).unwrap();
    assert!(!b.starts_with(&[0xEF, 0xBB, 0xBF]) && String::from_utf8_lossy(&b).contains("{\\an8}ชื่อสถานที่"));
    assert_eq!(export(&tools, &work, &r, &srt).unwrap_err(), "exists");
    r.enc = "tis".into();
    let tis = work.join("b.srt");
    export(&tools, &work, &r, &tis).unwrap();
    let (text, enc) = subdoc::decode(&std::fs::read(&tis).unwrap());
    assert!(text.contains("สวัสดีครับ"), "{} {text}", enc.charset);
    r.enc = "utf16".into();
    let u16f = work.join("c.srt");
    export(&tools, &work, &r, &u16f).unwrap();
    assert!(std::fs::read(&u16f).unwrap().starts_with(&[0xFF, 0xFE]));
    if crate::subtitle::pgs::seconv_exe(&tools).exists() {
        let mut v = req(rows, "WebVTT", "tag");
        v.enc = "utf8".into();
        // ที่เก็บคนละไดรฟ์กับโฟลเดอร์ทำงาน (โฟลเดอร์ทำงานอยู่ไดรฟ์ C โปรเจกต์อยู่ไดรฟ์ D) · เดิมย้ายข้ามไดรฟ์ไม่ได้ ขึ้นเปลี่ยนชื่อไม่สำเร็จ
        let far = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target").join("ocrexp-test");
        let _ = std::fs::remove_dir_all(&far);
        std::fs::create_dir_all(&far).unwrap();
        let vtt = far.join("d.vtt");
        export(&tools, &work, &v, &vtt).unwrap();
        let b = std::fs::read(&vtt).unwrap();
        let s = String::from_utf8_lossy(&b);
        assert!(!b.starts_with(&[0xEF, 0xBB, 0xBF]) && s.starts_with("WEBVTT") && s.contains("สวัสดีครับ"), "{s}");
        let p = preview(&tools, &work, &v).unwrap();
        assert!(p.starts_with("WEBVTT") && p.contains("ชื่อสถานที่"), "{p}");
        let f = formats(&tools);
        assert!(f.len() > 100 && f[0].id == SRT && f[1].id == ASS && f.iter().any(|x| x.id == "WebVTT"), "{}", f.len());
        // ไม่มีงานค้างในโฟลเดอร์ชั่วคราว
        assert!(std::fs::read_dir(&work).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with("ocrexp-")));
        assert_eq!(std::fs::read_dir(&far).unwrap().count(), 1, "ไม่มีไฟล์ชั่วคราวค้างข้างที่เก็บ");
        let _ = std::fs::remove_dir_all(&far);
    }
    let _ = std::fs::remove_dir_all(&work);
}

/// ภาพพร้อมหน้า HTML · โฟลเดอร์ใหม่ไม่ทับของเดิม ภาพครบตามชื่อ หน้ามีข้อความที่เข้ารหัสแล้ว ภาพไม่มีข้อความติดป้าย
#[test]
fn html_index() {
    let dir = std::env::temp_dir().join("movie-shelf-ocrhtml");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let src = dir.join("src.png");
    image::RgbaImage::from_pixel(4, 3, image::Rgba([255, 255, 255, 255])).save(&src).unwrap();
    let files = vec![(src.clone(), 1.0, Some(2.5), 4, 3), (src.clone(), 3.0, None, 4, 3)];
    let texts = vec!["<i>A & B</i>\nสอง".to_string(), String::new()];
    std::fs::create_dir_all(dir.join("ซับ OCR")).unwrap();
    let out = save_html(&files, &texts, &dir, "D:/x/ซับ.sup", &|_| {}).unwrap();
    assert_eq!((out.images, out.empty), (2, 1));
    assert!(out.folder.ends_with("ซับ OCR (2)"), "{}", out.folder);
    let html = std::fs::read_to_string(&out.html).unwrap();
    assert!(html.contains("<i>A &amp; B</i><br />สอง") && html.contains("ภาพนี้ยังไม่มีข้อความ") && html.contains("2 ภาพ ไม่มีข้อความ 1 ภาพ"));
    assert!(Path::new(&out.folder).join("images").join("0002.png").is_file());
    assert!(save_html(&files, &texts[..1], &dir, "x.sup", &|_| {}).is_err());
    let _ = std::fs::remove_dir_all(&dir);
}
