//! รูปโปสเตอร์ (แผนขั้น 4 · สเปกข้อ 7 หน้าต่างครอปกับแปลงชนิดรูป · TECH-REVIEW ข้อ 10)
//! อ่านรูป → หมุนตามข้อมูลกล้อง → แปลงสีตามโปรไฟล์ในรูปเป็น sRGB → หมุน พลิก ครอป หรือเติมขอบ → 1000 × 1500 → JPG หรือ PNG
//! JPG PNG WebP BMP TIFF อ่านด้วย image · HEIC HEIF ให้ ffmpeg ถอดเป็น PNG ก่อน (ffmpeg ทิ้งโปรไฟล์สี จึงดึงโปรไฟล์จากไฟล์ HEIC เอง)
//! 🔴 รูปเดิมในเครื่องไม่ถูกแก้เด็ดขาด อ่านอย่างเดียว ของที่สร้างอยู่ในโฟลเดอร์ของโปรแกรม
//! ขนาดไฟล์ที่บอกบนจอมาจากการเข้ารหัสจริง ไม่ใช่การเดา

use std::path::{Path, PathBuf};
use std::time::Duration;

use image::{imageops, DynamicImage, ImageDecoder, ImageReader, Rgb, RgbImage};
use serde::{Deserialize, Serialize};

pub const OUT_W: u32 = 1000;
pub const OUT_H: u32 = 1500;
/// ส่วนที่ครอปเล็กกว่านี้ ปกจะเบลอบนจอใหญ่ (แผน ค่าที่ต้นแบบยังไม่กำหนด)
pub const SMALL_W: u32 = 600;
pub const SMALL_H: u32 = 900;
/// รูปที่แนบใน MKV ตรง ๆ ได้
pub const ATTACHABLE: [&str; 3] = ["jpg", "jpeg", "png"];
/// รูปที่รับ (สเปกข้อ 10)
pub const ACCEPTED: [&str; 9] = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];

pub fn ext_of(p: &Path) -> String {
    p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// รูปที่อ่านแล้ว หมุนตามข้อมูลกล้องแล้ว สีเป็น sRGB แล้ว
pub struct Decoded {
    pub img: RgbImage,
    /// ค่าหมุนตามข้อมูลกล้องที่เจอ (1 = ไม่หมุน · 6 = หมุนขวา 90 ฯลฯ ตามมาตรฐาน EXIF)
    pub exif_orientation: u8,
    /// มีโปรไฟล์สีในรูป และแปลงเป็น sRGB แล้ว
    pub icc_converted: bool,
}

/// ดึงโปรไฟล์สีจากไฟล์ HEIC เอง · กล่อง colr ชนิด prof (ISO 23008-12) · ffmpeg ถอดภาพได้แต่ทิ้งโปรไฟล์นี้
pub fn heic_icc(bytes: &[u8]) -> Option<Vec<u8>> {
    let pos = bytes.windows(8).position(|w| w == b"colrprof")?;
    if pos < 4 {
        return None;
    }
    let size = u32::from_be_bytes(bytes[pos - 4..pos].try_into().ok()?) as usize;
    let start = pos + 8;
    let end = pos - 4 + size;
    if size < 12 || end > bytes.len() {
        return None;
    }
    Some(bytes[start..end].to_vec())
}

/// แปลงสีตามโปรไฟล์ไปเป็น sRGB · โปรไฟล์อ่านไม่ได้ปล่อยตามเดิม
fn to_srgb(img: &mut RgbImage, icc: &[u8]) -> bool {
    let Some(src) = qcms::Profile::new_from_slice(icc, false) else { return false };
    let dst = qcms::Profile::new_sRGB();
    let Some(t) = qcms::Transform::new(&src, &dst, qcms::DataType::RGB8, qcms::Intent::Perceptual) else { return false };
    t.apply(img.as_mut());
    true
}

/// รูปมีพื้นโปร่ง วางบนพื้นขาว (JPG เก็บพื้นโปร่งไม่ได้)
fn flatten(img: DynamicImage) -> RgbImage {
    if !img.color().has_alpha() {
        return img.to_rgb8();
    }
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (o, p) in out.pixels_mut().zip(rgba.pixels()) {
        let a = p[3] as u32;
        *o = Rgb([0, 1, 2].map(|i| ((p[i] as u32 * a + 255 * (255 - a)) / 255) as u8));
    }
    out
}

/// อ่านรูปหนึ่งรูป · work = โฟลเดอร์ชั่วคราวของโปรแกรม (ไว้ให้ ffmpeg เขียน PNG ของ HEIC)
pub fn decode(tools: &Path, work: &Path, path: &Path) -> Result<Decoded, String> {
    let ext = ext_of(path);
    if !ACCEPTED.contains(&ext.as_str()) {
        return Err(format!("ไฟล์ .{ext} ใช้ไม่ได้ · รูปที่รับ JPG PNG WebP BMP TIFF HEIC"));
    }
    if ext == "heic" || ext == "heif" {
        let icc = std::fs::read(path).ok().and_then(|b| heic_icc(&b));
        return decode_ffmpeg(tools, work, path, icc);
    }
    match decode_native(path) {
        Ok(d) => Ok(d),
        // ตัวอ่านของ image ไม่รองรับบางแบบ (TIFF บางชนิดสี) ให้ ffmpeg ช่วย (TECH-REVIEW ข้อ 10)
        Err(first) => decode_ffmpeg(tools, work, path, None).map_err(|_| first),
    }
}

fn decode_native(path: &Path) -> Result<Decoded, String> {
    let reader = ImageReader::open(path).map_err(|e| format!("เปิดรูปไม่ได้: {e}"))?
        .with_guessed_format().map_err(|e| format!("อ่านรูปไม่ได้: {e}"))?;
    let mut dec = reader.into_decoder().map_err(|e| format!("รูปนี้อ่านไม่ได้ ไฟล์อาจเสีย: {e}"))?;
    let icc = dec.icc_profile().ok().flatten();
    let orientation = dec.orientation().unwrap_or(image::metadata::Orientation::NoTransforms);
    let mut img = DynamicImage::from_decoder(dec).map_err(|e| format!("รูปนี้อ่านไม่ได้ ไฟล์อาจเสีย: {e}"))?;
    img.apply_orientation(orientation);
    let mut rgb = flatten(img);
    let icc_converted = icc.map(|p| to_srgb(&mut rgb, &p)).unwrap_or(false);
    Ok(Decoded { img: rgb, exif_orientation: orientation_code(orientation), icc_converted })
}

fn orientation_code(o: image::metadata::Orientation) -> u8 {
    use image::metadata::Orientation::*;
    match o {
        NoTransforms => 1, FlipHorizontal => 2, Rotate180 => 3, FlipVertical => 4,
        Rotate90FlipH => 5, Rotate90 => 6, Rotate270FlipH => 7, Rotate270 => 8,
    }
}

/// ให้ ffmpeg ถอดเป็น PNG แล้วอ่านต่อ · HEIC ffmpeg ต่อตารางชิ้นภาพชุดใหญ่สุดให้เอง แต่ทิ้งโปรไฟล์สี จึงส่งโปรไฟล์ที่ดึงเองมา
fn decode_ffmpeg(tools: &Path, work: &Path, path: &Path, icc: Option<Vec<u8>>) -> Result<Decoded, String> {
    std::fs::create_dir_all(work).map_err(|e| e.to_string())?;
    let png = work.join(format!("decode-{}-{}.png", std::process::id(), unique()));
    let args: [&std::ffi::OsStr; 14] = [
        "-hide_banner".as_ref(), "-nostdin".as_ref(), "-n".as_ref(), "-loglevel".as_ref(), "error".as_ref(),
        "-i".as_ref(), path.as_os_str(), "-frames:v".as_ref(), "1".as_ref(), "-update".as_ref(), "1".as_ref(),
        "-pix_fmt".as_ref(), "rgb24".as_ref(), png.as_os_str(),
    ];
    let out = crate::tools::run_tool_timeout(tools, "ffmpeg", args, Duration::from_secs(90))?;
    let result = (|| {
        if !out.status.success() || !png.exists() {
            return Err(format!("ถอดรูปไม่สำเร็จ: {}", String::from_utf8_lossy(&out.stderr).trim()));
        }
        let img = image::open(&png).map_err(|e| format!("อ่านรูปที่ถอดแล้วไม่ได้: {e}"))?;
        let mut rgb = img.to_rgb8();
        let icc_converted = icc.map(|p| to_srgb(&mut rgb, &p)).unwrap_or(false);
        Ok(Decoded { img: rgb, exif_orientation: 1, icc_converted })
    })();
    let _ = std::fs::remove_file(&png);
    result
}

pub fn unique() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
    t * 1000 + N.fetch_add(1, Ordering::Relaxed) % 1000
}

/// ค่าที่ผู้ใช้ตั้งในหน้าต่างครอป · กรอบเป็นสัดส่วน 0–1 ของรูปหลังหมุนและพลิกแล้ว
#[derive(Deserialize, Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Geometry {
    /// 0 90 180 270 หมุนตามเข็มนาฬิกา
    pub rotate: u16,
    /// พลิกซ้ายขวา (ทำหลังหมุน)
    pub flip: bool,
    /// "crop" ตัดให้พอดี 2 : 3 · "pad" เติมขอบ · "original" ตามรูปเดิม คงสัดส่วน (ปกแนวนอนเป็นแนวนอน)
    pub mode: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// สีขอบตอนเติมขอบ "#rrggbb"
    pub pad: String,
    /// ปรับเอียงกี่องศา ตามเข็มนาฬิกา ทำหลังหมุนและพลิก ขยายภาพให้เต็มกรอบไม่มีมุมว่าง (แผนจับคู่รูปปก · หน้าจออื่นไม่ส่งค่านี้ได้ 0)
    #[serde(default)]
    pub tilt: f64,
    /// ตอนตัดให้พอดี "wide" กรอบ 16 : 9 ได้รูป 1920 × 1080 · ว่าง กรอบ 2 : 3 แบบเดิม (ปกนอนของระบบจับคู่รูปปก)
    #[serde(default)]
    pub aspect: String,
}

/// ปกนอนที่ตัดกรอบ 16 : 9
pub const WIDE_W: u32 = 1920;
pub const WIDE_H: u32 = 1080;

/// ปรับเอียง ขยายภาพจากจุดกลางพอให้เต็มกรอบเดิมไม่มีมุมว่าง · หน้าต่างครอปใช้สูตรขยายเดียวกันในตัวอย่าง (CropDialog tiltScale)
/// เดินทุกจุดของรูปผลลัพธ์ หาจุดในรูปเดิมด้วยการหมุนกลับ เฉลี่ยสี่จุดรอบ ๆ
pub fn tilt_fill(src: &RgbImage, deg: f64) -> RgbImage {
    let (w, h) = src.dimensions();
    let (fw, fh) = (w as f64, h as f64);
    let th = deg.to_radians();
    let (sin, cos) = th.sin_cos();
    let k = ((fw * cos.abs() + fh * sin.abs()) / fw).max((fw * sin.abs() + fh * cos.abs()) / fh);
    let (cx, cy) = (fw / 2.0, fh / 2.0);
    let raw = src.as_raw();
    let stride = w as usize * 3;
    let mut out = RgbImage::new(w, h);
    for (y, row) in out.as_mut().chunks_exact_mut(stride).enumerate() {
        let dy = y as f64 + 0.5 - cy;
        for (x, px) in row.chunks_exact_mut(3).enumerate() {
            let dx = x as f64 + 0.5 - cx;
            let sx = (cx + (dx * cos + dy * sin) / k - 0.5).clamp(0.0, fw - 1.0);
            let sy = (cy + (-dx * sin + dy * cos) / k - 0.5).clamp(0.0, fh - 1.0);
            let (x0, y0) = (sx.floor() as usize, sy.floor() as usize);
            let (x1, y1) = ((x0 + 1).min(w as usize - 1), (y0 + 1).min(h as usize - 1));
            let (ax, ay) = (sx - x0 as f64, sy - y0 as f64);
            for (c, v) in px.iter_mut().enumerate() {
                let at = |xx: usize, yy: usize| raw[yy * stride + xx * 3 + c] as f64;
                let top = at(x0, y0) * (1.0 - ax) + at(x1, y0) * ax;
                let bot = at(x0, y1) * (1.0 - ax) + at(x1, y1) * ax;
                *v = (top * (1.0 - ay) + bot * ay).round() as u8;
            }
        }
    }
    out
}

fn parse_color(s: &str) -> Rgb<u8> {
    let h = s.trim_start_matches('#');
    let v = |i: usize| u8::from_str_radix(h.get(i..i + 2).unwrap_or("ff"), 16).unwrap_or(255);
    Rgb([v(0), v(2), v(4)])
}

/// ด้านยาวสูงสุดที่ยอมคงขนาดเดิมตอนปิดสวิตช์ย่อรูป · ใหญ่กว่านี้ย่อเป็นขนาดปกติ
pub const KEEP_MAX: u32 = 6000;

/// หมุน พลิก ครอปหรือเติมขอบ ทำเป็น 1000 × 1500 · คืนรูปกับขนาดส่วนที่ครอปจริงในรูปต้นฉบับ (พิกเซล)
/// shrink = สวิตช์ ย่อรูปโปสเตอร์ที่ใหญ่เกิน ในหน้าตั้งค่า · ปิด รูปที่ใหญ่กว่า 1000 × 1500 คงความละเอียดเดิม สัดส่วนเดิม
/// รูปที่เล็กกว่ายังขยายเป็น 1000 × 1500 ทั้งสองแบบ
pub fn render(src: &RgbImage, g: &Geometry, shrink: bool) -> (RgbImage, (u32, u32)) {
    let turned: RgbImage = match g.rotate % 360 {
        90 => imageops::rotate90(src),
        180 => imageops::rotate180(src),
        270 => imageops::rotate270(src),
        _ => src.clone(),
    };
    let turned = if g.flip { imageops::flip_horizontal(&turned) } else { turned };
    let turned = if g.tilt.abs() > 0.001 { tilt_fill(&turned, g.tilt) } else { turned };
    let (w, h) = turned.dimensions();
    // รูปใหญ่มาก (ด้านยาวเกิน KEEP_MAX) ย่อเสมอแม้ปิดสวิตช์ · เติมขอบภาพพาโนรามาแล้วกรอบใหญ่เกินที่ JPG รับได้ (65,535 px) และกินหน่วยความจำหลายร้อย MB
    let shrink = shrink || w.max(h) > KEEP_MAX;
    if g.mode == "original" {
        // ตามรูปเดิม ไม่ตัด ไม่เติมขอบ คงสัดส่วน ด้านยาวย่อหรือขยายเป็น 1500 เท่าด้านยาวของปก 2:3
        // ปกแนวนอนจึงเป็นแนวนอน (พี่กัน 7 พ.ย. 2569 *"ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*)
        let side = if shrink { OUT_H } else { OUT_H.max(w.max(h)) };
        if side == w.max(h) { return (turned, (w, h)); }
        let scale = side as f64 / w.max(h) as f64;
        let (nw, nh) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
        return (imageops::resize(&turned, nw, nh, imageops::FilterType::Lanczos3), (w, h));
    }
    if g.mode == "pad" {
        // ทั้งรูปอยู่ในกรอบ 2 : 3 ไม่ตัดส่วนไหนเลย ที่ว่างเติมสีขอบ · ไม่ย่อ กรอบใหญ่ตามรูปเดิม
        let k = if shrink { 1.0 } else { (w as f64 / OUT_W as f64).max(h as f64 / OUT_H as f64).max(1.0) };
        let (cw, ch) = ((OUT_W as f64 * k).round() as u32, (OUT_H as f64 * k).round() as u32);
        let scale = (cw as f64 / w as f64).min(ch as f64 / h as f64);
        let (nw, nh) = (((w as f64 * scale).round() as u32).clamp(1, cw), ((h as f64 * scale).round() as u32).clamp(1, ch));
        let small = if (nw, nh) == (w, h) { turned } else { imageops::resize(&turned, nw, nh, imageops::FilterType::Lanczos3) };
        let mut canvas = RgbImage::from_pixel(cw, ch, parse_color(&g.pad));
        imageops::overlay(&mut canvas, &small, ((cw - nw) / 2) as i64, ((ch - nh) / 2) as i64);
        return (canvas, (w, h));
    }
    let cx = ((g.x.clamp(0.0, 1.0) * w as f64).round() as u32).min(w - 1);
    let cy = ((g.y.clamp(0.0, 1.0) * h as f64).round() as u32).min(h - 1);
    let cw = ((g.w.clamp(0.0, 1.0) * w as f64).round() as u32).clamp(1, w - cx);
    let ch = ((g.h.clamp(0.0, 1.0) * h as f64).round() as u32).clamp(1, h - cy);
    let part = imageops::crop_imm(&turned, cx, cy, cw, ch).to_image();
    // ไม่ย่อ ส่วนที่ครอปใหญ่กว่า 1000 × 1500 คงขนาดเดิม (กรอบเป็น 2 : 3 อยู่แล้ว ปัดให้พอดี 2 : 3) · ปกนอนเทียบกับ 1920 × 1080 แบบเดียวกัน
    let (bw, bh) = if g.aspect == "wide" { (WIDE_W, WIDE_H) } else { (OUT_W, OUT_H) };
    let (ow, oh) = if !shrink && cw > bw { (cw, ((cw as f64) * bh as f64 / bw as f64).round() as u32) } else { (bw, bh) };
    (imageops::resize(&part, ow, oh, imageops::FilterType::Lanczos3), (cw, ch))
}

/// กรอบ 16 : 9 ใหญ่สุดที่อยู่กลางรูป · ค่าเป็นสัดส่วนของรูปหลังหมุน
pub fn default_crop_wide(w: u32, h: u32) -> (f64, f64, f64, f64) {
    let target = WIDE_W as f64 / WIDE_H as f64;
    let ratio = w as f64 / h as f64;
    if ratio > target {
        let cw = target / ratio;
        ((1.0 - cw) / 2.0, 0.0, cw, 1.0)
    } else {
        let ch = ratio / target;
        (0.0, (1.0 - ch) / 2.0, 1.0, ch)
    }
}

/// กรอบ 2 : 3 ใหญ่สุดที่อยู่กลางรูป (ซูม 100%) · ค่าเป็นสัดส่วนของรูปหลังหมุน
pub fn default_crop(w: u32, h: u32) -> (f64, f64, f64, f64) {
    let target = OUT_W as f64 / OUT_H as f64;
    let ratio = w as f64 / h as f64;
    if ratio > target {
        let cw = target / ratio;
        ((1.0 - cw) / 2.0, 0.0, cw, 1.0)
    } else {
        let ch = ratio / target;
        (0.0, (1.0 - ch) / 2.0, 1.0, ch)
    }
}

/// เข้ารหัสจริง · คุณภาพใช้กับ JPG เท่านั้น
pub fn encode(img: &RgbImage, format: &str, quality: u8) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    if format == "png" {
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new_with_quality(&mut buf, image::codecs::png::CompressionType::Best, image::codecs::png::FilterType::Adaptive)
            .write_image(img.as_raw(), img.width(), img.height(), image::ExtendedColorType::Rgb8)
            .map_err(|e| format!("เข้ารหัส PNG ไม่สำเร็จ: {e}"))?;
    } else {
        // JPG เก็บขนาดได้ไม่เกิน 65,535 px ต่อด้าน · เดิมตัดเลขเงียบ ๆ ได้ไฟล์เสีย
        if img.width() > u16::MAX as u32 || img.height() > u16::MAX as u32 {
            return Err(format!("รูปใหญ่เกินที่ JPG รับได้ ({} × {} px) เลือก PNG หรือเปิดสวิตช์ย่อรูปในหน้าตั้งค่า", img.width(), img.height()));
        }
        let mut enc = jpeg_encoder::Encoder::new(&mut buf, quality.clamp(1, 100));
        enc.set_optimized_huffman_tables(true);
        enc.encode(img.as_raw(), img.width() as u16, img.height() as u16, jpeg_encoder::ColorType::Rgb)
            .map_err(|e| format!("เข้ารหัส JPG ไม่สำเร็จ: {e}"))?;
    }
    Ok(buf)
}

/// บอกสัดส่วนรูปเป็นคำ (สเปก รูปนี้เป็นภาพแนวนอน 16 : 9)
pub fn aspect_label(w: u32, h: u32) -> String {
    let r = w as f64 / h as f64;
    if (r - 2.0 / 3.0).abs() / (2.0 / 3.0) < 0.02 {
        return "2 : 3".into();
    }
    let known: &[(u32, u32)] = if w > h { &[(16, 9), (3, 2), (4, 3), (5, 4), (21, 9), (2, 1)] } else if w < h { &[(9, 16), (3, 4), (4, 5), (1, 2)] } else { &[(1, 1)] };
    let kind = if w > h { "ภาพแนวนอน" } else if w < h { "ภาพแนวตั้ง" } else { "ภาพจัตุรัส" };
    for (a, b) in known {
        let k = *a as f64 / *b as f64;
        if (r - k).abs() / k < 0.03 {
            return format!("{kind} {a} : {b}");
        }
    }
    if w > h { format!("{kind} {:.2} : 1", r) } else { format!("{kind} 1 : {:.2}", 1.0 / r) }
}

/// ภาพเล็กสำหรับโชว์บนจอ (หน้าต่างครอป รายการรูป) · ด้านยาวไม่เกิน max · JPG ลงโฟลเดอร์ previews ของโปรแกรม
pub fn write_preview(img: &RgbImage, max: u32, dir: &Path, prefix: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let scale = (max as f64 / w.max(h) as f64).min(1.0);
    let small = if scale < 1.0 {
        imageops::resize(img, ((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1), imageops::FilterType::Triangle)
    } else {
        img.clone()
    };
    let bytes = encode(&small, "jpg", 88)?;
    let p = dir.join(format!("{prefix}-{}.jpg", unique()));
    std::fs::write(&p, bytes).map_err(|e| e.to_string())?;
    Ok(p)
}

#[cfg(test)]
mod tests {
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
        assert!(aspect_label(w, h).starts_with("ภาพแนวนอน"), "{}", aspect_label(w, h));
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
        assert_eq!(aspect_label(1920, 1080), "ภาพแนวนอน 16 : 9");
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
}
