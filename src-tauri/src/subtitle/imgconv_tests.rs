//! เทสของ imgconv.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }
fn media() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("ซับตัวอย่าง-ffmpeg") }
fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("movie-shelf-imgconv-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn req(src: &Path, kind: &str, target: &Path) -> ImgReq { ImgReq { src: src.display().to_string(), kind: kind.into(), target: target.display().to_string(), ..Default::default() } }
fn ready() -> bool {
    let ok = bdsup_exe(&tools()).exists() && media().join("pgs_sub.sup").exists();
    if !ok { eprintln!("ข้าม ยังไม่มี tools\\bdsup2sub หรือไฟล์ซับตัวอย่าง"); }
    ok
}
fn none() -> bool { false }

/// ซับ HD DVD (Subpictures_20.sup ในชุดทดสอบของ ffmpeg) หัวไฟล์ SP · ffmpeg กับ mkvmerge อ่านไม่ได้ (BUGS ข้อ 129)
/// รู้จักจากหัวไฟล์ แปลงเป็น PGS ได้ 630 ภาพ ตัวดูซับรูปถอดภาพได้ หน้าซับไตเติลเปิดได้ หน้ารวมไฟล์บอกว่าใส่ในหนังไม่ได้
/// หน้าต่างแปลงซับภาพแปลงต้นฉบับได้ และไฟล์ต้นฉบับไม่ถูกแตะ
#[test]
fn hddvd_sup_opens_for_view_and_converts() {
    if !ready() { return; }
    let src = media().join("Subpictures_20.sup");
    let before = std::fs::read(&src).unwrap();
    assert!(is_hddvd_sup(&src));
    assert!(!is_hddvd_sup(&media().join("pgs_sub.sup")), "PGS ของ Blu-ray ไม่ใช่ HD DVD");
    assert!(!is_hddvd_sup(&media().join("vobsub.sub")));
    let w = tmp("hddvd");
    let (pgs, n) = hddvd_pgs(&tools(), &w, &src).unwrap();
    assert_eq!(n, 630);
    assert_eq!(probe(&tools(), &pgs).map(|p| p.0), Some("hdmv_pgs_subtitle".to_string()));
    // ครั้งที่สองใช้ของที่แปลงไว้ ไม่แปลงซ้ำ
    let mt = std::fs::metadata(&pgs).unwrap().modified().unwrap();
    assert_eq!(hddvd_pgs(&tools(), &w, &src).unwrap(), (pgs.clone(), 630));
    assert_eq!(std::fs::metadata(&pgs).unwrap().modified().unwrap(), mt);
    let imgs = crate::subtitle::subs::images(&tools(), &w, &src, 0).unwrap();
    assert!(imgs.len() > 50 && imgs.iter().all(|i| i.w > 0 && i.h > 0), "ภาพ {}", imgs.len());
    let v = crate::merge::merge::add_file_view(&tools(), &w, &src).unwrap();
    assert_eq!((v.tracks.len(), v.tracks[0].codec.as_str(), v.tracks[0].frames, v.tracks[0].kind.as_str()), (1, "hddvd_sup", Some(630), "subtitle"));
    let e = crate::merge::merge::add_file(&tools(), &src, None).unwrap_err();
    assert!(e.contains("HD DVD") && e.contains("หน้าซับไตเติล"), "{e}");
    // ไฟล์อื่นผ่านทางเปิดเพื่อดูได้เหมือนเดิม
    assert_eq!(crate::merge::merge::add_file_view(&tools(), &w, &media().join("pgs_sub.sup")).unwrap().tracks[0].codec, "hdmv_pgs_subtitle");
    let out = convert(&tools(), &w, &req(&src, "pgs", &w.join("จาก HD DVD.sup")), &|_, _| {}, &none).unwrap();
    assert_eq!((out.images, out.w, out.h), (630, 720, 576));
    assert_eq!(std::fs::read(&src).unwrap(), before, "ไฟล์ต้นฉบับต้องไม่ถูกแตะ");
    let _ = std::fs::remove_dir_all(&w);
}

/// ตัวเลือกส่งครบและ -o กับต้นทางอยู่ท้ายเสมอ (ไม่ส่ง -o โปรแกรมเปิดหน้าต่างขึ้นจอ)
#[test]
fn args_always_end_with_output_and_input() {
    let mut r = ImgReq { resolution: "720".into(), fps_target: "25".into(), delay: -250, forced: "only".into(), force_all: "clear".into(), scale_x: 1.25, language: "EN".into(),
        move_y: "inside".into(), ratio: 2.4, move_y_offset: 10, move_x: "center".into(), crop_y: 4, alpha_thr: 100, ..Default::default() };
    let a: Vec<String> = bdsup_args(&r, Path::new("in.sup"), Path::new("out.idx"), "idx").unwrap().iter().map(|x| x.to_string_lossy().to_string()).collect();
    let n = a.len();
    assert_eq!(&a[n - 3..], &["--output", "out.idx", "in.sup"]);
    for w in [["--resolution", "720"], ["--fps-target", "25"], ["--delay", "-250"], ["--force-all", "clear"], ["--scale-x", "1.250"], ["--language", "en"],
        ["--move-in-ratio", "2.400"], ["--move-y-offset", "10"], ["--move-x", "center"], ["--crop-y", "4"], ["--alpha-thr", "100"]] {
        assert!(a.windows(2).any(|p| p[0] == w[0] && p[1] == w[1]), "ขาด {w:?} ใน {a:?}");
    }
    assert!(a.contains(&"--forced-only".to_string()) && !a.iter().any(|x| x == "--fps-source"));
    // เวลาขั้นต่ำส่งเฉพาะตอนเปิดแก้ภาพที่ขึ้นสั้นเกิน เพราะ --minimum-time เปิดการแก้ไปด้วยในตัว (ซอร์ส setFixShortFrames(true))
    assert!(!a.iter().any(|x| x == "--minimum-time"), "ปิดอยู่ต้องไม่ส่ง --minimum-time");
    r.fix_short = true;
    let a2: Vec<String> = bdsup_args(&r, Path::new("in.sup"), Path::new("o.sup"), "sup").unwrap().iter().map(|x| x.to_string_lossy().to_string()).collect();
    assert!(a2.windows(2).any(|p| p[0] == "--minimum-time" && p[1] == "500") && !a2.iter().any(|x| x == "--alpha-thr"), "{a2:?}");
    r.ratio = 1.5;
    assert!(bdsup_args(&r, Path::new("a"), Path::new("b.sup"), "sup").is_err(), "สัดส่วนไม่เกิน 16:9 ต้องปฏิเสธก่อน ไม่งั้นโปรแกรมออกเงียบ");
    r.ratio = 2.35;
    r.resolution = "4k".into();
    assert!(bdsup_args(&r, Path::new("a"), Path::new("b.sup"), "sup").is_err(), "ค่าที่ไม่รู้จักต้องปฏิเสธ ไม่ส่งต่อให้โปรแกรม");
}

/// PGS เป็น VobSub แล้วกลับเป็น PGS ขนาด 720 พร้อมเลื่อนเวลา 500 ms · ไฟล์ต้นทางไม่ถูกแตะ
#[test]
fn pgs_to_vobsub_and_back_scaled_and_delayed() {
    if !ready() { return; }
    let dir = tmp("round");
    let src = media().join("pgs_sub.sup");
    let before = std::fs::read(&src).unwrap();
    let vob = convert(&tools(), &dir, &req(&src, "pgs", &dir.join("แปลง.idx")), &|_, _| {}, &none).unwrap();
    assert_eq!(vob.files.len(), 2);
    assert!(dir.join("แปลง.idx").exists() && dir.join("แปลง.sub").exists() && vob.images >= 1, "{vob:?}");
    let mut r = req(&dir.join("แปลง.idx"), "vobsub", &dir.join("กลับ.sup"));
    r.resolution = "720".into();
    r.delay = 500;
    let pgs = convert(&tools(), &dir, &r, &|_, _| {}, &none).unwrap();
    assert_eq!((pgs.w, pgs.h), (1280, 720), "{pgs:?}");
    let t0 = crate::subtitle::pgs::first_shown(&before).unwrap();
    let t1 = crate::subtitle::pgs::first_shown(&std::fs::read(dir.join("กลับ.sup")).unwrap()).unwrap();
    assert!((t1 - t0 - 500).abs() <= 45, "ภาพแรกเดิม {t0} ms ได้ {t1} ms ต้องช้ากว่า 500 ms");
    assert_eq!(std::fs::read(&src).unwrap(), before, "ไฟล์ต้นทางต้องไม่ถูกแตะ");
    let leftover: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(".imgconv")).collect();
    assert!(leftover.is_empty(), "โฟลเดอร์ชั่วคราวค้าง");
    let _ = std::fs::remove_dir_all(&dir);
}

/// อ่าน BDN XML · เวลาแบบ 23.976 นับนาฬิกา 24 แล้วคูณ 1.001 · เหตุการณ์มีสองภาพได้
#[test]
fn bdn_reads_times_positions() {
    let x = r#"<BDN><Description><Format VideoFormat="1080p" FrameRate="23.976" DropFrame="False"/></Description><Events>
<Event Forced="True" InTC="00:00:01:00" OutTC="00:00:02:12"><Graphic Width="100" Height="20" X="10" Y="900">a_0001_0.png</Graphic><Graphic Width="50" Height="10" X="5" Y="50">a_0001_1.png</Graphic></Event>
<Event Forced="False" InTC="00:01:00:00" OutTC="00:01:01:00"><Graphic Width="1" Height="2" X="3" Y="4">b.png</Graphic></Event></Events></BDN>"#;
    let ((w, h), ev) = parse_bdn(x);
    assert_eq!((w, h, ev.len()), (1920, 1080, 2));
    assert_eq!((ev[0].start, ev[0].end, ev[0].forced), (1001, 2503, true));
    assert_eq!(ev[0].graphics[1], ("a_0001_1.png".to_string(), 5, 50, 50, 10));
    assert_eq!(ev[1].start, 60060);
}

/// ตัดไฟล์ PGS เหลือภาพเดียวตามเวลา (BUGS ข้อ 142) · เริ่มจากต้นยุคของภาพนั้น จบที่ชุดที่ปิดภาพ · ภาพเดิมที่ส่งซ้ำอยู่ในไฟล์เล็กด้วย ไม่นับเป็นภาพใหม่
#[test]
fn sup_cut_by_time_keeps_epoch_and_end() {
    // ชุดแสดงหนึ่งชุด PCS (เวลา สถานะ จำนวนวัตถุ) แล้ว END
    let set = |sec: f64, state: u8, objs: u8| -> Vec<u8> {
        let pts = ((sec * 90000.0) as u32).to_be_bytes();
        let mut pcs = vec![0x07, 0x80, 0x04, 0x38, 0x10, 0, 0, state, 0, 0, objs];
        for _ in 0..objs { pcs.extend_from_slice(&[0, 0, 0, 0, 0, 10, 0, 10]); }
        let mut v = b"PG".to_vec(); v.extend_from_slice(&pts); v.extend_from_slice(&[0; 4]); v.push(0x16); v.extend_from_slice(&(pcs.len() as u16).to_be_bytes()); v.extend(pcs);
        v.extend_from_slice(b"PG"); v.extend_from_slice(&pts); v.extend_from_slice(&[0; 4]); v.push(0x80); v.extend_from_slice(&[0, 0]);
        v
    };
    let a = set(1.0, 0x80, 1); // ยุคใหม่ มีภาพ
    let b = set(2.0, 0x00, 0); // ล้างจอ
    let c = set(3.0, 0x00, 1); // ภาพในยุคเดิม
    let c2 = set(3.5, 0x40, 1); // ภาพเดิมส่งซ้ำ (จุดเริ่มอ่าน) ตัวแปลงนับเป็นภาพเดียวกับ c
    let d = set(4.0, 0x00, 0); // ล้างจอ
    let e = set(5.0, 0x40, 1); // จุดเริ่มอ่าน มีภาพ
    let all = [a.clone(), b.clone(), c.clone(), c2.clone(), d.clone(), e.clone()].concat();
    assert_eq!(super::sup_cut(&all, 3.0, Some(4.0)).unwrap(), [a.clone(), b.clone(), c.clone(), c2.clone(), d.clone()].concat(), "ภาพ c เริ่มจากต้นยุค มีชุดที่ส่งซ้ำ จบที่ชุดล้างจอ");
    assert_eq!(super::sup_cut(&all, 5.0, None).unwrap(), e.clone(), "ภาพสุดท้ายเริ่มจุดเริ่มอ่านของตัวเอง ไม่มีชุดถัดไป");
    assert_eq!(super::sup_cut(&all, 1.0, Some(2.0)).unwrap(), [a, b].concat());
    assert!(super::sup_cut(&all, 9.0, None).is_none(), "เวลาที่ไม่มีภาพไม่ตัดผิดภาพ");
    assert!(super::sup_cut(b"", 0.0, None).is_none(), "ไฟล์ว่างไม่พัง");
}

/// ไฟล์ .sup จริงที่ส่งภาพเดิมซ้ำหลายชุด (ตั้ง MOVIE_SHELF_SUP) · ภาพตัวอย่างทีละภาพต้องได้จำนวนภาพและภาพตรงกับแปลงทั้งไฟล์
/// (เดิมนับชุดแสดงที่มีภาพได้ 699 แทน 439 และภาพผลเลื่อนไปคนละภาพกับต้นฉบับ เจอกับไฟล์ ACCA 16 พ.ย. 2569)
#[test]
fn preview_one_matches_full_on_real_file() {
    let Ok(p) = std::env::var("MOVIE_SHELF_SUP") else { return };
    if !ready() { return; }
    let dir = tmp("prevreal");
    let r = req(Path::new(&p), "pgs", &dir.join("x.sup"));
    let full0 = super::preview_full(&tools(), &dir, &r, 0, &none).unwrap();
    let step = (full0.total / 25).max(1);
    for i in (0..full0.total).step_by(step) {
        let one = preview(&tools(), &dir, &r, i, &none).unwrap();
        let full = super::preview_full(&tools(), &dir, &r, i, &none).unwrap();
        let geo = |p: &ImgPreview| p.graphics.iter().map(|g| (g.x, g.y, g.w, g.h)).collect::<Vec<_>>();
        assert_eq!((one.total, geo(&one)), (full.total, geo(&full)), "ภาพที่ {i}");
        assert!((one.start - full.start).abs() <= 1 && (one.end - full.end).abs() <= 1, "เวลาภาพที่ {i} ทีละภาพ {}–{} ทั้งไฟล์ {}–{}", one.start, one.end, full.start, full.end);
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// ภาพตัวอย่างตรงกับผลจริง · ย่อเป็น 720 แล้วจอเป็น 1280 × 720 ภาพอยู่ในจอ เวลาเลื่อนตาม · เปลี่ยนแค่ภาพที่ดูใช้ผลเดิม
#[test]
fn preview_matches_options() {
    if !ready() { return; }
    let dir = tmp("prev");
    let mut r = req(&media().join("pgs_sub.sup"), "pgs", &dir.join("x.idx"));
    r.resolution = "720".into();
    r.delay = 1000;
    let p = preview(&tools(), &dir, &r, 0, &none).unwrap();
    assert_eq!((p.w, p.h), (1280, 720), "{p:?}");
    assert!(p.total >= 1 && !p.graphics.is_empty() && p.graphics.iter().all(|g| g.x + g.w <= 1280 && g.y + g.h <= 720 && g.png.starts_with("data:image/png")), "{:?}", p.graphics.iter().map(|g| (g.x, g.y, g.w, g.h)).collect::<Vec<_>>());
    let t0 = crate::subtitle::pgs::first_shown(&std::fs::read(media().join("pgs_sub.sup")).unwrap()).unwrap();
    assert!((p.start - t0 - 1000).abs() <= 45, "เวลาเริ่ม {} เดิม {t0}", p.start);
    // ซับ PGS แปลงทีละภาพ (BUGS ข้อ 142) ผลต้องตรงกับแปลงทั้งไฟล์ทุกภาพ ทั้งจอ เวลา ตำแหน่ง ขนาดภาพ และจำนวนภาพทั้งไฟล์
    let count = |p: &str| std::fs::read_dir(&dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(p)).count();
    assert_eq!(count("imgconv-prev-"), 0, "ซับ PGS ไม่แปลงทั้งไฟล์แล้ว");
    let full0 = super::preview_full(&tools(), &dir, &r, 0, &none).unwrap();
    for i in 0..full0.total.min(8) {
        let one = preview(&tools(), &dir, &r, i, &none).unwrap();
        let full = super::preview_full(&tools(), &dir, &r, i, &none).unwrap();
        let geo = |p: &ImgPreview| p.graphics.iter().map(|g| (g.x, g.y, g.w, g.h)).collect::<Vec<_>>();
        assert_eq!((one.total, one.index, one.w, one.h, geo(&one)), (full.total, full.index, full.w, full.h, geo(&full)), "ภาพที่ {i}");
        assert!((one.start - full.start).abs() <= 1 && (one.end - full.end).abs() <= 1, "เวลาภาพที่ {i} ทีละภาพ {}–{} ทั้งไฟล์ {}–{}", one.start, one.end, full.start, full.end);
    }
    let n = count("imgconv-one-");
    let _ = preview(&tools(), &dir, &r, 0, &none).unwrap();
    assert_eq!(count("imgconv-one-"), n, "ดูภาพเดิมซ้ำใช้ผลที่เก็บไว้ ไม่แปลงใหม่");
    let _ = std::fs::remove_dir_all(&dir);
}

/// BDN XML ได้โฟลเดอร์ชื่อเดียวกับไฟล์ ข้างในมี xml กับภาพ PNG
#[test]
fn pgs_to_bdn_xml_folder() {
    if !ready() { return; }
    let dir = tmp("xml");
    let r = convert(&tools(), &dir, &req(&media().join("pgs_sub.sup"), "pgs", &dir.join("ซับ.xml")), &|_, _| {}, &none).unwrap();
    let f = dir.join("ซับ");
    assert!(f.is_dir() && f.join("ซับ.xml").exists(), "{r:?}");
    assert!(std::fs::read_dir(&f).unwrap().flatten().any(|e| e.path().extension().is_some_and(|x| x == "png")));
    let _ = std::fs::remove_dir_all(&dir);
}

/// ไฟล์ที่ BDSup2Sub++ พัง (VobSub ตัวอย่างของ ffmpeg) บอกตรง ๆ ให้ลอง Subtitle Edit ไม่ค้าง แล้ว SeConv แปลงได้
#[test]
fn crash_says_try_subtitle_edit_and_seconv_works() {
    if !ready() || !media().join("vobsub.idx").exists() { return; }
    let dir = tmp("crash");
    let e = convert(&tools(), &dir, &req(&media().join("vobsub.idx"), "vobsub", &dir.join("v.sup")), &|_, _| {}, &none).unwrap_err();
    assert!(e.contains("Subtitle Edit"), "{e}");
    assert!(!dir.join("v.sup").exists());
    if crate::subtitle::pgs::seconv_exe(&tools()).exists() {
        let mut r = req(&media().join("vobsub.idx"), "vobsub", &dir.join("v.sup"));
        r.engine = "seconv".into();
        let o = convert(&tools(), &dir, &r, &|_, _| {}, &none).unwrap();
        assert!(o.images >= 40, "{o:?}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// Subtitle Edit แปลงเป็น VobSub กับ BDN XML ได้ไฟล์ตรงที่ตั้ง และภาพตัวอย่างของทั้งสามชนิดขึ้น
/// (เดิมส่งชื่อ .idx ให้ SeConv มันเขียนไฟล์ .sub ลงชื่อนั้นแล้วล้ม · BDN XML ได้โฟลเดอร์ชื่อ t.xml ที่มี index.xml ตัวแปลงหาไฟล์ไม่เจอ เจอ 15 พ.ย. 2569)
#[test]
fn seconv_vobsub_and_bdn() {
    if !ready() || !crate::subtitle::pgs::seconv_exe(&tools()).exists() { return; }
    let dir = tmp("seconv");
    let mut r = req(&media().join("pgs_sub.sup"), "pgs", &dir.join("ผล.idx"));
    r.engine = "seconv".into();
    let o = convert(&tools(), &dir, &r, &|_, _| {}, &none).unwrap();
    assert!(dir.join("ผล.idx").is_file() && dir.join("ผล.sub").is_file() && o.images >= 1, "{o:?}");
    assert_eq!(probe(&tools(), &dir.join("ผล.idx")).map(|p| p.0).as_deref(), Some("dvd_subtitle"));
    r.target = dir.join("ผล.xml").display().to_string();
    let o = convert(&tools(), &dir, &r, &|_, _| {}, &none).unwrap();
    let x = dir.join("ผล").join("ผล.xml");
    let pngs = std::fs::read_dir(dir.join("ผล")).unwrap().flatten().filter(|e| e.path().extension().is_some_and(|x| x == "png")).count();
    assert!(x.is_file() && pngs >= 1 && o.images >= 1 && !dir.join("ผล").join("ผล").exists(), "{o:?} {pngs}");
    let work = dir.join("work");
    std::fs::create_dir_all(&work).unwrap();
    for ext in ["sup", "idx", "xml"] {
        r.target = dir.join(format!("ตัวอย่าง.{ext}")).display().to_string();
        let p = preview(&tools(), &work, &r, 0, &none).unwrap_or_else(|e| panic!("{ext} {e}"));
        assert!(p.total >= 1 && !p.graphics.is_empty(), "{ext} {p:?}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// ไม่เขียนทับ · ปลายทางมีอยู่แล้วตอบ exists ไฟล์เดิมเหมือนเดิม
#[test]
fn never_overwrites() {
    if !ready() { return; }
    let dir = tmp("exists");
    std::fs::write(dir.join("มี.sub"), b"old").unwrap();
    let e = convert(&tools(), &dir, &req(&media().join("pgs_sub.sup"), "pgs", &dir.join("มี.idx")), &|_, _| {}, &none).unwrap_err();
    assert_eq!(e, "exists");
    assert_eq!(std::fs::read(dir.join("มี.sub")).unwrap(), b"old");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ซับ PGS ในหนัง MKV ดึงออกมาแปลงได้ · หนังทดสอบ ซับรูป (2024).mkv มี PGS กับ VobSub
#[test]
fn pgs_inside_mkv() {
    let movie = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join("ซับรูป (2024).mkv");
    if !ready() || !movie.exists() { return; }
    let j = crate::merge::merge::mkv_json(&tools(), &movie).unwrap();
    let tid = j["tracks"].as_array().unwrap().iter().find(|t| t["codec"].as_str().is_some_and(|c| c.contains("PGS"))).and_then(|t| t["id"].as_u64()).unwrap();
    let dir = tmp("mkv");
    let mut r = req(&movie, "pgs", &dir.join("จากหนัง.sup"));
    r.in_movie = true;
    r.tid = tid;
    let o = convert(&tools(), &dir, &r, &|_, _| {}, &none).unwrap();
    assert!(o.images >= 1 && dir.join("จากหนัง.sup").exists(), "{o:?}");
    let _ = std::fs::remove_dir_all(&dir);
}
