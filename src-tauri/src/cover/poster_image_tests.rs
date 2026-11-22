//! เทสของ poster_image.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn img_dir() -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("รูป");
    dunce::canonicalize(&p).unwrap_or_else(|e| panic!("ไม่มีรูปทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()))
}
fn work() -> PathBuf {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-รูป-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn at(img: &RgbImage, fx: f64, fy: f64) -> [u8; 3] {
    let p = img.get_pixel((fx * img.width() as f64) as u32, (fy * img.height() as f64) as u32);
    [p[0], p[1], p[2]]
}
fn near(a: [u8; 3], b: [u8; 3]) -> bool {
    a.iter().zip(b).all(|(x, y)| (*x as i32 - y as i32).abs() < 40)
}
fn distinct4(c: [[u8; 3]; 4]) -> bool {
    (0..4).all(|i| (0..4).all(|j| i == j || !near(c[i], c[j])))
}

/// สวิตช์ ย่อรูปโปสเตอร์ที่ใหญ่เกิน · เปิด ทุกแบบได้ 1000 × 1500 (ตามรูปเดิมด้านยาว 1500) · ปิด รูปใหญ่คงความละเอียดเดิม รูปเล็กยังขยาย
#[test]
fn shrink_switch_keeps_large_images_when_off() {
    let g = |mode: &str, w: f64, h: f64| Geometry { rotate: 0, flip: false, mode: mode.into(), x: 0.0, y: 0.0, w, h, pad: "#000000".into(), ..Default::default() };
    let tall = RgbImage::new(3000, 4500);
    assert_eq!(render(&tall, &g("crop", 1.0, 1.0), true).0.dimensions(), (1000, 1500));
    assert_eq!(render(&tall, &g("crop", 1.0, 1.0), false).0.dimensions(), (3000, 4500));
    let wide = RgbImage::new(4000, 2000);
    assert_eq!(render(&wide, &g("pad", 1.0, 1.0), true).0.dimensions(), (1000, 1500));
    assert_eq!(render(&wide, &g("pad", 1.0, 1.0), false).0.dimensions(), (4000, 6000));
    assert_eq!(render(&wide, &g("original", 1.0, 1.0), true).0.dimensions(), (1500, 750));
    assert_eq!(render(&wide, &g("original", 1.0, 1.0), false).0.dimensions(), (4000, 2000));
    let small = RgbImage::new(500, 750);
    assert_eq!(render(&small, &g("crop", 1.0, 1.0), false).0.dimensions(), (1000, 1500), "รูปเล็กยังขยายเป็น 1000 × 1500");
    // พาโนรามาด้านยาวเกิน KEEP_MAX ย่อเสมอ ไม่ทำกรอบเติมขอบ 9,000 × 13,500
    let pano = RgbImage::new(9000, 1000);
    assert_eq!(render(&pano, &g("pad", 1.0, 1.0), false).0.dimensions(), (1000, 1500));
    assert_eq!(render(&pano, &g("original", 1.0, 1.0), false).0.dimensions(), (1500, 167));
}

#[test]
fn exif_rotation_is_applied_before_crop() {
    // quad.png ไม่มีป้ายหมุน · quad-ป้ายหมุน6.jpg เก็บพิกเซลแบบหมุนซ้าย แล้วติดป้าย 6 ให้หมุนขวากลับ ต้องได้หน้าตาเดียวกัน
    let w = work();
    let plain = decode(&tools(), &w, &img_dir().join("quad.png")).unwrap();
    let tagged = decode(&tools(), &w, &img_dir().join("quad-ป้ายหมุน6.jpg")).unwrap();
    assert_eq!(tagged.exif_orientation, 6, "ต้องอ่านป้ายหมุนได้");
    assert_eq!(plain.img.dimensions(), tagged.img.dimensions(), "หมุนแล้วกว้างยาวต้องเท่ารูปที่ไม่มีป้าย");
    for (fx, fy) in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)] {
        assert!(near(at(&plain.img, fx, fy), at(&tagged.img, fx, fy)), "มุม {fx},{fy} สีไม่ตรง");
    }
}

#[test]
fn rotate_and_flip_move_each_corner() {
    let src = decode(&tools(), &work(), &img_dir().join("quad.png")).unwrap().img;
    let q = [at(&src, 0.25, 0.25), at(&src, 0.75, 0.25), at(&src, 0.25, 0.75), at(&src, 0.75, 0.75)];
    let [tl, tr, bl, br] = q;
    assert!(distinct4(q), "รูปทดสอบต้องเป็นสี่สีไม่ซ้ำ {q:?}");
    let pad = |rotate, flip| Geometry { rotate, flip, mode: "pad".into(), x: 0.0, y: 0.0, w: 1.0, h: 1.0, pad: "#808080".into(), ..Default::default() };
    // เติมขอบแล้วรูปอยู่กลาง หาขอบเขตรูปจริงจากแถวกลางกับคอลัมน์กลาง ไม่ให้ขอบเทาปน
    let corners = |img: &RgbImage| {
        let (w, h) = img.dimensions();
        let grey = |p: &Rgb<u8>| near([p[0], p[1], p[2]], [128, 128, 128]);
        let cols: Vec<u32> = (0..w).filter(|&x| !grey(img.get_pixel(x, h / 2))).collect();
        let rows: Vec<u32> = (0..h).filter(|&y| !grey(img.get_pixel(w / 2, y))).collect();
        let (x0, x1, y0, y1) = (cols[0] as f64, *cols.last().unwrap() as f64, rows[0] as f64, *rows.last().unwrap() as f64);
        let p = |fx: f64, fy: f64| { let q = img.get_pixel((x0 + (x1 - x0) * fx) as u32, (y0 + (y1 - y0) * fy) as u32); [q[0], q[1], q[2]] };
        [p(0.25, 0.25), p(0.75, 0.25), p(0.25, 0.75), p(0.75, 0.75)]
    };
    // หมุนขวา 90 · ซ้ายบนเดิมไปอยู่ขวาบน ซ้ายล่างเดิมขึ้นมาซ้ายบน
    let r = corners(&render(&src, &pad(90, false), true).0);
    assert!(near(r[1], tl) && near(r[3], tr) && near(r[0], bl) && near(r[2], br), "หมุนขวาผิด {r:?}");
    // หมุนซ้าย 90 (270) · ซ้ายบนเดิมไปซ้ายล่าง
    let l = corners(&render(&src, &pad(270, false), true).0);
    assert!(near(l[2], tl) && near(l[0], tr) && near(l[3], bl) && near(l[1], br), "หมุนซ้ายผิด {l:?}");
    // พลิกซ้ายขวา · ซ้ายบนไปขวาบน
    let f = corners(&render(&src, &pad(0, true), true).0);
    assert!(near(f[1], tl) && near(f[0], tr) && near(f[3], bl) && near(f[2], br), "พลิกผิด {f:?}");
    // หมุน 180 · ซ้ายบนไปขวาล่าง
    let h = corners(&render(&src, &pad(180, false), true).0);
    assert!(near(h[3], tl) && near(h[0], br), "หมุน 180 ผิด {h:?}");
}

#[test]
fn output_is_exactly_1000x1500_and_crop_is_centered() {
    let wide = decode(&tools(), &work(), &img_dir().join("wide.jpg")).unwrap().img;
    let (w, h) = wide.dimensions();
    assert!(w > h, "wide.jpg ต้องเป็นภาพแนวนอน");
    assert!(aspect_label(w, h).starts_with("รูปแนวนอน"), "{}", aspect_label(w, h));
    let (x, y, cw, ch) = default_crop(w, h);
    assert!((x - (1.0 - cw) / 2.0).abs() < 1e-9 && y == 0.0 && ch == 1.0, "กรอบตั้งต้นต้องอยู่กลางภาพ เต็มความสูง");
    let g = Geometry { rotate: 0, flip: false, mode: "crop".into(), x, y, w: cw, h: ch, pad: "#ffffff".into(), ..Default::default() };
    let (out, (pw, ph)) = render(&wide, &g, true);
    assert_eq!(out.dimensions(), (OUT_W, OUT_H));
    assert!(((pw as f64 / ph as f64) - 2.0 / 3.0).abs() < 0.01, "ส่วนที่ครอปต้องเป็น 2 : 3 ได้ {pw} × {ph}");
    let gp = Geometry { mode: "pad".into(), pad: "#f6dbe5".into(), ..g.clone() };
    let (padded, _) = render(&wide, &gp, true);
    assert_eq!(padded.dimensions(), (OUT_W, OUT_H));
    assert_eq!(padded.get_pixel(5, 5).0, [0xf6, 0xdb, 0xe5], "ขอบต้องเป็นสีที่เลือก");
    assert_eq!(padded.get_pixel(OUT_W - 5, OUT_H - 5).0, [0xf6, 0xdb, 0xe5]);
    assert_eq!(aspect_label(1000, 1500), "2 : 3");
    assert_eq!(aspect_label(1920, 1080), "รูปแนวนอน 16 : 9");
    // ตามรูปเดิม คงสัดส่วนแนวนอน ด้านยาว 1500 ไม่มีขอบเติม
    let go = Geometry { mode: "original".into(), ..g };
    let (orig, (ow, oh)) = render(&wide, &go, true);
    let (rw, rh) = orig.dimensions();
    assert_eq!(rw, OUT_H, "ด้านยาวต้องเป็น 1500 ได้ {rw} × {rh}");
    assert!(((rw as f64 / rh as f64) - (w as f64 / h as f64)).abs() < 0.01, "ต้องคงสัดส่วนเดิม ได้ {rw} × {rh} จาก {w} × {h}");
    assert_eq!((ow, oh), (w, h), "ใช้ทั้งรูป ไม่ตัด");
}

#[test]
fn jpg_size_shrinks_with_quality_and_png_is_lossless() {
    let src = decode(&tools(), &work(), &img_dir().join("poster.jpg")).unwrap().img;
    let (x, y, w, h) = default_crop(src.width(), src.height());
    let (out, _) = render(&src, &Geometry { rotate: 0, flip: false, mode: "crop".into(), x, y, w, h, pad: "#ffffff".into(), ..Default::default() }, true);
    let sizes: Vec<usize> = [100u8, 90, 75, 50].iter().map(|q| encode(&out, "jpg", *q).unwrap().len()).collect();
    assert!(sizes.windows(2).all(|p| p[0] > p[1]), "คุณภาพยิ่งต่ำไฟล์ยิ่งเล็ก {sizes:?}");
    let png = encode(&out, "png", 90).unwrap();
    let back = image::load_from_memory(&png).unwrap().to_rgb8();
    assert_eq!(back.as_raw(), out.as_raw(), "PNG ต้องไม่ลดคุณภาพ");
    let jpg = encode(&out, "jpg", 90).unwrap();
    assert_eq!(image::load_from_memory(&jpg).unwrap().to_rgb8().dimensions(), (OUT_W, OUT_H));
}

/// ปรับเอียงไม่มีมุมว่าง สีตามมุมเดิม · ไม่เอียงได้ไบต์เท่าเดิม · กรอบ 16 : 9 ได้ 1920 × 1080 (แผนจับคู่รูปปก)
#[test]
fn tilt_fills_corners_and_wide_crop() {
    let quad = decode(&tools(), &work(), &img_dir().join("quad.png")).unwrap().img;
    let plain = Geometry { rotate: 0, flip: false, mode: "crop".into(), x: 0.0, y: 0.0, w: 1.0, h: 1.0, pad: "#ffffff".into(), ..Default::default() };
    let (base, _) = render(&quad, &plain, true);
    // ค่าใหม่ที่เป็นศูนย์ ต้องเท่าของเดิมทุกไบต์ (หน้าใส่โปสเตอร์กับเสียงและซับไม่ได้ส่งค่านี้)
    let json: Geometry = serde_json::from_str(r##"{"rotate":0,"flip":false,"mode":"crop","x":0,"y":0,"w":1,"h":1,"pad":"#ffffff"}"##).unwrap();
    assert_eq!(json, plain, "ของเดิมที่ไม่ส่งปรับเอียงต้องอ่านได้");
    assert_eq!(render(&quad, &Geometry { tilt: 0.0, ..plain.clone() }, true).0.as_raw(), base.as_raw());
    for deg in [10.0, -10.0, 0.5] {
        let (out, _) = render(&quad, &Geometry { tilt: deg, ..plain.clone() }, true);
        assert_eq!(out.dimensions(), (OUT_W, OUT_H));
        // ซ้ายบนแดง ขวาบนเขียว ซ้ายล่างน้ำเงิน ขวาล่างเหลือง · มุมต้องยังเป็นสีเดิม ไม่มีมุมว่าง
        assert!(near(at(&out, 0.01, 0.01), [255, 0, 0]), "ซ้ายบน {deg}° {:?}", at(&out, 0.01, 0.01));
        assert!(near(at(&out, 0.98, 0.01), [0, 255, 0]), "ขวาบน {deg}° {:?}", at(&out, 0.98, 0.01));
        assert!(near(at(&out, 0.01, 0.98), [0, 0, 255]), "ซ้ายล่าง {deg}° {:?}", at(&out, 0.01, 0.98));
        assert!(near(at(&out, 0.98, 0.98), [255, 255, 0]), "ขวาล่าง {deg}° {:?}", at(&out, 0.98, 0.98));
    }
    // เอียงตามเข็ม เส้นแบ่งแดงเขียวด้านบนต้องเลื่อนไปทางขวา (รูปหมุนตามเข็ม ของด้านบนไปทางขวา)
    let (cw, _) = render(&quad, &Geometry { tilt: 10.0, ..plain.clone() }, true);
    assert!(near(at(&cw, 0.53, 0.08), [255, 0, 0]), "ทิศเอียงต้องตรงกับที่หน้าจอวาด {:?}", at(&cw, 0.53, 0.08));

    // กรอบ 16 : 9 จากรูปตั้งกับรูปนอน
    let (x, y, w, h) = default_crop_wide(1000, 1500);
    assert!((h * 1500.0 / (w * 1000.0) - 9.0 / 16.0).abs() < 1e-6 && x == 0.0 && (y - (1.0 - h) / 2.0).abs() < 1e-9);
    let (out, _) = render(&quad, &Geometry { x, y, w, h, aspect: "wide".into(), ..plain.clone() }, true);
    assert_eq!(out.dimensions(), (WIDE_W, WIDE_H));
    let big = RgbImage::new(3840, 2160);
    let (bx, by, bw, bh) = default_crop_wide(3840, 2160);
    assert_eq!((bx, by, bw, bh), (0.0, 0.0, 1.0, 1.0));
    let g = Geometry { x: bx, y: by, w: bw, h: bh, aspect: "wide".into(), ..plain };
    assert_eq!(render(&big, &g, true).0.dimensions(), (WIDE_W, WIDE_H));
    assert_eq!(render(&big, &g, false).0.dimensions(), (3840, 2160), "ปิดสวิตช์ย่อ คงขนาดเดิม");
    // AUDIT 12 พ.ย. 2569 ข้อ 8 กรอบ 2 : 3 กลางรูปนอนที่ยังติดค่าปกนอนมา ต้องได้ปกตั้ง 2 : 3 ไม่ถูกบีบลง 1920 × 1080
    let (tx, ty, tw, th) = default_crop(3840, 2160);
    let bad = Geometry { x: tx, y: ty, w: tw, h: th, aspect: "wide".into(), ..g.clone() };
    assert_eq!(render(&big, &bad, true).0.dimensions(), (OUT_W, OUT_H), "กรอบ 2 : 3 ต้องเป็นปกตั้ง");
}

#[test]
fn every_accepted_format_decodes() {
    let w = work();
    for f in ["poster.jpg", "poster.png", "poster.webp", "scan.bmp", "scan.tiff", "small.jpg"] {
        let d = decode(&tools(), &w, &img_dir().join(f)).unwrap_or_else(|e| panic!("{f}: {e}"));
        assert!(d.img.width() > 0, "{f}");
    }
    assert!(decode(&tools(), &w, Path::new("x.wmv")).err().unwrap().contains(".wmv ใช้ไม่ได้"));
}

#[test]
fn heic_full_size_and_display_p3_is_converted() {
    let p = img_dir().join("IMG_4149.HEIC");
    assert!(p.exists(), "ไม่มีรูป HEIC ของพี่กันในไฟล์ทดสอบ · คัดลอก test-media/จากพี่กัน/IMG_4149.HEIC ไป test-media/สร้าง/รูป/ (ไฟล์นี้ไม่ขึ้น git)");
    let bytes = std::fs::read(&p).unwrap();
    let icc = heic_icc(&bytes).expect("ต้องดึงโปรไฟล์สีจาก HEIC ได้");
    assert!(icc.len() > 128 && &icc[36..40] == b"acsp", "โปรไฟล์ที่ดึงได้ต้องเป็น ICC จริง");
    let t0 = std::time::Instant::now();
    let d = decode(&tools(), &work(), &p).unwrap();
    assert_eq!(d.img.dimensions(), (5712, 4284), "ต้องได้ความละเอียดเต็ม");
    assert!(d.icc_converted, "ต้องแปลง Display P3 เป็น sRGB");
    assert!(t0.elapsed() < Duration::from_secs(20), "ถอด HEIC ช้าเกิน {:?}", t0.elapsed());
}
