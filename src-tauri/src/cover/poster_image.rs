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
        return Err(format!("ไฟล์ .{ext} ใช้ไม่ได้  รับรูป JPG PNG WebP BMP TIFF และ HEIC"));
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
    let out = crate::app::tools::run_tool_timeout(tools, "ffmpeg", args, Duration::from_secs(90))?;
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
    // ปกนอนเฉพาะเมื่อกรอบที่ตัดเป็น 16 : 9 จริง (คลาดได้ 3%) · เดิมเชื่อค่า aspect อย่างเดียว กรอบ 2 : 3 ที่ติดค่าปกนอนมาถูกบีบลง 1920 × 1080 (AUDIT 12 พ.ย. 2569 ข้อ 8)
    let wide = g.aspect == "wide" && ((cw as f64 / ch as f64) / (WIDE_W as f64 / WIDE_H as f64) - 1.0).abs() < 0.03;
    let (bw, bh) = if wide { (WIDE_W, WIDE_H) } else { (OUT_W, OUT_H) };
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

/// บอกสัดส่วนรูปเป็นคำ (สเปก รูปนี้เป็นรูปแนวนอน 16 : 9 · BUGS ข้อ 59 ต่อ ใช้คำว่า รูป คำเดียว เพราะ ภาพ หมายถึงแทร็กวิดีโอ)
pub fn aspect_label(w: u32, h: u32) -> String {
    let r = w as f64 / h as f64;
    if (r - 2.0 / 3.0).abs() / (2.0 / 3.0) < 0.02 {
        return "2 : 3".into();
    }
    let known: &[(u32, u32)] = if w > h { &[(16, 9), (3, 2), (4, 3), (5, 4), (21, 9), (2, 1)] } else if w < h { &[(9, 16), (3, 4), (4, 5), (1, 2)] } else { &[(1, 1)] };
    let kind = if w > h { "รูปแนวนอน" } else if w < h { "รูปแนวตั้ง" } else { "รูปจัตุรัส" };
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
#[path = "poster_image_tests.rs"]
mod tests;
