//! เทสของ graphimg.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// รหัสของ libheif เป็นประโยคไทย ไม่ขึ้นแค่รหัส ข้อความของ libheif อยู่ท้ายในวงเล็บ (BUGS ข้อ 150)
#[test]
fn heif_errors_in_thai() {
    assert_eq!(heif::heif_fail("บันทึกรูป", 9, "Encoder plugin generated an error"), "บันทึกรูป ไม่สำเร็จ บีบภาพเป็น HEIC ไม่สำเร็จ (Encoder plugin generated an error)");
    assert_eq!(heif::heif_fail("บันทึกรูป", 6, ""), "บันทึกรูป ไม่สำเร็จ หน่วยความจำของเครื่องไม่พอ");
    for c in 1..=13 { assert!(!heif::heif_fail("x", c, "").contains("รหัส"), "{c}"); }
}

fn sample_png() -> Vec<u8> {
    let img = image::RgbImage::from_fn(32, 16, |x, y| image::Rgb([(x * 7) as u8, (y * 15) as u8, 90]));
    let mut b = Vec::new();
    DynamicImage::ImageRgb8(img).write_with_encoder(image::codecs::png::PngEncoder::new(&mut b)).unwrap();
    b
}
fn opt(format: &str, bits: u8, gray: bool) -> GraphImg { GraphImg { format: format.into(), bits, gray, dpi: 300, ..GraphImg::default() } }

#[test]
fn png_keeps_size_bits_and_dpi() {
    for (bits, gray, want) in [(8u8, false, image::ColorType::Rgb8), (16, false, image::ColorType::Rgb16), (8, true, image::ColorType::L8), (16, true, image::ColorType::L16)] {
        let (d, w, h) = encode_image(&sample_png(), &opt("png", bits, gray)).unwrap();
        assert_eq!((w, h), (32, 16));
        let back = image::load_from_memory(&d).unwrap();
        assert_eq!(back.color(), want);
        assert_eq!(&d[37..41], b"pHYs");
        assert_eq!(u32::from_be_bytes([d[41], d[42], d[43], d[44]]), 11811); // 300 dpi
    }
}

/// พื้นโปร่งใส · PNG WebP TIFF เก็บช่องโปร่งใส จุดที่โปร่งใสยังโปร่งใส · ปิดไว้ได้รูปไม่มีช่องโปร่งใสเหมือนเดิม · JPG ไม่พัง
#[test]
fn transparent_keeps_alpha() {
    let img = image::RgbaImage::from_fn(8, 4, |x, _| image::Rgba([200, 50, 90, if x < 4 { 0 } else { 255 }]));
    let mut png = Vec::new();
    DynamicImage::ImageRgba8(img).write_with_encoder(image::codecs::png::PngEncoder::new(&mut png)).unwrap();
    for (f, bits, gray, want) in [("png", 8u8, false, image::ColorType::Rgba8), ("png", 16, false, image::ColorType::Rgba16), ("png", 8, true, image::ColorType::La8), ("webp", 8, false, image::ColorType::Rgba8), ("tiff", 8, false, image::ColorType::Rgba8)] {
        let o = GraphImg { transparent: true, ..opt(f, bits, gray) };
        let (d, ..) = encode_image(&png, &o).unwrap();
        let back = image::load_from_memory(&d).unwrap();
        assert_eq!(back.color(), want, "{f} {bits} {gray}");
        let px = back.to_rgba8();
        assert_eq!((px.get_pixel(0, 0)[3], px.get_pixel(7, 0)[3]), (0, 255), "{f}");
    }
    let (d, ..) = encode_image(&png, &opt("png", 8, false)).unwrap();
    assert_eq!(image::load_from_memory(&d).unwrap().color(), image::ColorType::Rgb8);
    assert!(encode_image(&png, &GraphImg { transparent: true, ..opt("jpg", 8, false) }).is_ok());
}

#[test]
fn jpg_writes_density() {
    let (d, ..) = encode_image(&sample_png(), &opt("jpg", 8, false)).unwrap();
    assert_eq!(&d[6..10], b"JFIF");
    assert_eq!(d[13], 1); // หน่วยนิ้ว
    assert_eq!(u16::from_be_bytes([d[14], d[15]]), 300);
    assert!(image::load_from_memory(&d).is_ok());
}

#[test]
fn tiff_writes_dpi_and_depth() {
    let (d, ..) = encode_image(&sample_png(), &opt("tiff", 16, false)).unwrap();
    assert_eq!(image::load_from_memory(&d).unwrap().color(), image::ColorType::Rgb16);
    let ifd = u32::from_le_bytes([d[4], d[5], d[6], d[7]]) as usize;
    let n = u16::from_le_bytes([d[ifd], d[ifd + 1]]) as usize;
    let mut seen = 0;
    for k in 0..n {
        let e = ifd + 2 + k * 12;
        if u16::from_le_bytes([d[e], d[e + 1]]) == 282 {
            let at = u32::from_le_bytes([d[e + 8], d[e + 9], d[e + 10], d[e + 11]]) as usize;
            assert_eq!(u32::from_le_bytes([d[at], d[at + 1], d[at + 2], d[at + 3]]), 300);
            seen += 1;
        }
    }
    assert_eq!(seen, 1);
}

/// ใช้ heif.dll ตัวจริง ต้องแตกเครื่องมือก่อน (scripts/fetch-tools.ps1) · ด้านคี่ต้องได้ขนาดเดิม
#[test]
fn heic_uses_real_libheif() {
    let tools = Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
    assert!(tools.join("heif.dll").exists(), "ไม่มี heif.dll รัน scripts/fetch-tools.ps1 ก่อน");
    let img = image::RgbImage::from_fn(33, 17, |x, y| image::Rgb([(x * 7) as u8, (y * 15) as u8, 90]));
    let mut png = Vec::new();
    DynamicImage::ImageRgb8(img).write_with_encoder(image::codecs::png::PngEncoder::new(&mut png)).unwrap();
    for gray in [false, true] {
        let (d, w, h) = encode_heic(&tools, &png, &opt("heic", 8, gray)).unwrap();
        assert_eq!((w, h), (33, 17));
        assert_eq!(&d[4..12], b"ftypheic");
        assert!(d.windows(4).any(|w| w == b"hvcC"));
        assert!(d.windows(4).any(|w| w == b"mdat"));
    }
}

#[test]
fn webp_opens() {
    let (d, ..) = encode_image(&sample_png(), &opt("webp", 16, false)).unwrap();
    assert!(image::load_from_memory(&d).is_ok());
}
