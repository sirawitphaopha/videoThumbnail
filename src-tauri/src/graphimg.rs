//! บันทึกรูปกราฟเสียงตามค่าที่ตั้งในหน้าตั้งค่า (พี่กันสั่ง 9 พ.ย. 2569 "bit dpi เลือกได้ เราขอละเอียดแบบเนิร์ดไปเลย")
//! หน้าจอวาดกราฟลงผ้าใบ ส่งมาเป็น PNG ไม่เสียคุณภาพ ที่นี่แปลงเป็นชนิด ความลึกสี และ DPI ที่ตั้งไว้
//! ผ้าใบของเบราว์เซอร์วาดได้ 8 bit ต่อช่องสี 16 bit จึงเป็นการเก็บในไฟล์ 16 bit รายละเอียดสีไม่ได้เพิ่ม หน้าตั้งค่าบอกเรื่องนี้แล้ว
//! DPI ไม่เปลี่ยนจำนวนพิกเซล เป็นแค่ค่าบอกขนาดตอนพิมพ์ · PNG ใส่ช่อง pHYs · JPG ใส่ใน JFIF · TIFF แก้ค่าที่ตัวเข้ารหัสเขียนไว้ · WebP กับ HEIC ไม่มีที่เก็บ

use std::io::Cursor;
use std::path::Path;

use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct GraphImg {
    /// ความกว้างเป็นพิกเซล · 0 = ตามจอ
    pub width: u32,
    /// "png" | "jpg" | "webp" | "heic" | "tiff"
    pub format: String,
    /// 8 | 16 · ใช้ได้กับ PNG และ TIFF
    pub bits: u8,
    pub gray: bool,
    pub dpi: u32,
    /// คุณภาพ JPG 1 ถึง 100
    pub quality: u8,
    /// JPG "444" | "420"
    pub subsampling: String,
    /// PNG "fast" | "default" | "best"
    pub compress: String,
    /// แถบหัวรูป ชื่อไฟล์กับช่วงเวลา
    pub title: bool,
    /// ชื่อไฟล์ใส่ชื่อกราฟต่อท้าย
    pub name_graph: bool,
    /// ที่เก็บรูป "beside" ข้างไฟล์ที่ดูอยู่ | "folder" โฟลเดอร์ที่เลือก · ฝั่งหน้าจอเป็นคนต่อที่อยู่
    pub dir_mode: String,
    pub dir: String,
    /// เปิดกล่องเลือกที่เก็บทุกครั้ง
    pub ask: bool,
}

impl Default for GraphImg {
    // แคลร์ตั้ง · ใหญ่พอดูบนจอ 2K คมทั้งตัวหนังสือและเส้น พิมพ์ได้ที่ 300 dpi
    fn default() -> Self {
        Self { width: 2560, format: "png".into(), bits: 8, gray: false, dpi: 300, quality: 92, subsampling: "444".into(), compress: "default".into(), title: true, name_graph: true, dir_mode: "beside".into(), dir: String::new(), ask: true }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImg {
    pub path: String,
    pub size: u64,
    pub width: u32,
    pub height: u32,
}

fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= b as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xedb8_8320 ^ (c >> 1) } else { c >> 1 };
        }
    }
    !c
}

/// แทรกช่อง pHYs ต่อจาก IHDR · หน่วยจุดต่อเมตร
fn png_set_dpi(png: Vec<u8>, dpi: u32) -> Vec<u8> {
    let ppm = (dpi as f64 / 0.0254).round() as u32;
    let mut body = b"pHYs".to_vec();
    body.extend(ppm.to_be_bytes());
    body.extend(ppm.to_be_bytes());
    body.push(1);
    let mut out = Vec::with_capacity(png.len() + 21);
    out.extend(&png[..33]); // ลายเซ็น 8 ไบต์ กับ IHDR 25 ไบต์
    out.extend(9u32.to_be_bytes());
    out.extend(&body);
    out.extend(crc32(&body).to_be_bytes());
    out.extend(&png[33..]);
    out
}

/// แก้ค่า XResolution YResolution ResolutionUnit ที่ตัวเข้ารหัส TIFF เขียนไว้ 1/1 ไม่มีหน่วย
fn tiff_set_dpi(tif: &mut [u8], dpi: u32) -> Result<(), String> {
    let bad = || "อ่านโครงไฟล์ TIFF ไม่ได้".to_string();
    let u16at = |b: &[u8], i: usize| b.get(i..i + 2).map(|x| u16::from_le_bytes([x[0], x[1]]));
    let u32at = |b: &[u8], i: usize| b.get(i..i + 4).map(|x| u32::from_le_bytes([x[0], x[1], x[2], x[3]]));
    if tif.get(0..2) != Some(b"II") { return Err(bad()); }
    let ifd = u32at(tif, 4).ok_or_else(bad)? as usize;
    let n = u16at(tif, ifd).ok_or_else(bad)? as usize;
    let mut done = 0;
    for k in 0..n {
        let e = ifd + 2 + k * 12;
        match u16at(tif, e).ok_or_else(bad)? {
            282 | 283 => {
                let at = u32at(tif, e + 8).ok_or_else(bad)? as usize;
                let cell = tif.get_mut(at..at + 8).ok_or_else(bad)?;
                cell[..4].copy_from_slice(&dpi.to_le_bytes());
                cell[4..].copy_from_slice(&1u32.to_le_bytes());
                done += 1;
            }
            296 => {
                tif.get_mut(e + 8..e + 10).ok_or_else(bad)?.copy_from_slice(&2u16.to_le_bytes());
                done += 1;
            }
            _ => {}
        }
    }
    if done == 3 { Ok(()) } else { Err(bad()) }
}

/// แปลง PNG จากหน้าจอเป็นไฟล์ตามค่าที่ตั้ง
pub fn encode_image(png: &[u8], o: &GraphImg) -> Result<(Vec<u8>, u32, u32), String> {
    let src = image::load_from_memory_with_format(png, ImageFormat::Png).map_err(|e| format!("อ่านรูปจากหน้าจอไม่ได้: {e}"))?;
    let (w, h) = (src.width(), src.height());
    let dpi = o.dpi.clamp(1, 9600);
    let deep = o.bits == 16;
    let img = match (o.gray, deep) {
        (true, true) => DynamicImage::ImageLuma16(src.to_luma16()),
        (true, false) => DynamicImage::ImageLuma8(src.to_luma8()),
        (false, true) => DynamicImage::ImageRgb16(src.to_rgb16()),
        (false, false) => DynamicImage::ImageRgb8(src.to_rgb8()),
    };
    let mut buf = Vec::new();
    match o.format.as_str() {
        "jpg" => {
            if w > u16::MAX as u32 || h > u16::MAX as u32 { return Err(format!("รูปใหญ่เกินที่ JPG รับได้ ({w} × {h} px)")); }
            let mut enc = jpeg_encoder::Encoder::new(&mut buf, o.quality.clamp(1, 100));
            enc.set_density(jpeg_encoder::Density::Inch { x: dpi.min(65535) as u16, y: dpi.min(65535) as u16 });
            enc.set_sampling_factor(if o.subsampling == "420" { jpeg_encoder::SamplingFactor::R_4_2_0 } else { jpeg_encoder::SamplingFactor::R_4_4_4 });
            enc.set_optimized_huffman_tables(true);
            let res = if o.gray {
                enc.encode(src.to_luma8().as_raw(), w as u16, h as u16, jpeg_encoder::ColorType::Luma)
            } else {
                enc.encode(src.to_rgb8().as_raw(), w as u16, h as u16, jpeg_encoder::ColorType::Rgb)
            };
            res.map_err(|e| format!("เข้ารหัส JPG ไม่สำเร็จ: {e}"))?;
        }
        "webp" => {
            // WebP ในตัวเป็นแบบไม่เสียคุณภาพ 8 bit เท่านั้น
            let eight = if o.gray { DynamicImage::ImageLuma8(src.to_luma8()) } else { DynamicImage::ImageRgb8(src.to_rgb8()) };
            eight.write_with_encoder(image::codecs::webp::WebPEncoder::new_lossless(&mut buf)).map_err(|e| format!("เข้ารหัส WebP ไม่สำเร็จ: {e}"))?;
        }
        "tiff" => {
            img.write_with_encoder(image::codecs::tiff::TiffEncoder::new(Cursor::new(&mut buf))).map_err(|e| format!("เข้ารหัส TIFF ไม่สำเร็จ: {e}"))?;
            tiff_set_dpi(&mut buf, dpi)?;
        }
        _ => {
            use image::codecs::png::{CompressionType, FilterType, PngEncoder};
            let level = match o.compress.as_str() { "fast" => CompressionType::Fast, "best" => CompressionType::Best, _ => CompressionType::Default };
            img.write_with_encoder(PngEncoder::new_with_quality(&mut buf, level, FilterType::Adaptive)).map_err(|e| format!("เข้ารหัส PNG ไม่สำเร็จ: {e}"))?;
            buf = png_set_dpi(buf, dpi);
        }
    }
    Ok((buf, w, h))
}

/// เรียก heif.dll ของ libheif ตัวจริงที่แนบในโฟลเดอร์เครื่องมือ (พี่กันเลือก 9 พ.ย. 2569) · ที่มาของไฟล์ดู vendor/README.md
/// ชนิดฟังก์ชันตรงกับ libheif/heif.h รุ่น 1.23 · เขียนไฟล์ผ่านตัวรับข้อมูล ไม่ส่งที่อยู่ให้ DLL เพราะที่อยู่มีภาษาไทยได้
mod heif {
    use std::ffi::{c_char, c_int, c_void, CStr, OsStr};
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::ptr::{null, null_mut};
    use std::sync::OnceLock;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct HeifError { code: c_int, subcode: c_int, message: *const c_char }
    #[repr(C)]
    struct Writer { api_version: c_int, write: unsafe extern "C" fn(*mut c_void, *const c_void, usize, *mut c_void) -> HeifError }

    const COMPRESSION_HEVC: c_int = 1;
    const COLORSPACE_RGB: c_int = 1;
    const CHROMA_INTERLEAVED_RGB: c_int = 10;
    const CHANNEL_INTERLEAVED: c_int = 10;

    struct Lib {
        ctx_alloc: unsafe extern "C" fn() -> *mut c_void,
        ctx_free: unsafe extern "C" fn(*mut c_void),
        get_encoder: unsafe extern "C" fn(*mut c_void, c_int, *mut *mut c_void) -> HeifError,
        set_quality: unsafe extern "C" fn(*mut c_void, c_int) -> HeifError,
        encoder_release: unsafe extern "C" fn(*mut c_void),
        image_create: unsafe extern "C" fn(c_int, c_int, c_int, c_int, *mut *mut c_void) -> HeifError,
        add_plane: unsafe extern "C" fn(*mut c_void, c_int, c_int, c_int, c_int) -> HeifError,
        get_plane: unsafe extern "C" fn(*mut c_void, c_int, *mut c_int) -> *mut u8,
        image_release: unsafe extern "C" fn(*mut c_void),
        encode_image: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void, *const c_void, *mut *mut c_void) -> HeifError,
        write: unsafe extern "C" fn(*mut c_void, *const Writer, *mut c_void) -> HeifError,
    }

    // เปิดครั้งเดียวแล้วค้างไว้จนปิดโปรแกรม ไม่เปิดจนกว่าจะบันทึก HEIC ครั้งแรก · ถอด DLL ตัวเข้ารหัสออกระหว่างทำงานไม่ปลอดภัย
    static LIB: OnceLock<Lib> = OnceLock::new();

    fn lib(dir: &Path) -> Result<&'static Lib, String> {
        use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH};
        if let Some(l) = LIB.get() { return Ok(l); }
        let p = dir.join("heif.dll");
        if !p.exists() { return Err("ไม่มี heif.dll ในโฟลเดอร์เครื่องมือ".into()); }
        let wide: Vec<u16> = OsStr::new(p.as_os_str()).encode_wide().chain(std::iter::once(0)).collect();
        // หาไฟล์ที่ heif.dll ต้องใช้ในโฟลเดอร์เดียวกันก่อน
        let h = unsafe { LoadLibraryExW(wide.as_ptr(), null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH) };
        if h.is_null() { return Err(format!("เปิด heif.dll ไม่ได้ (รหัส {})", std::io::Error::last_os_error().raw_os_error().unwrap_or(0))); }
        let need = |n: &str| -> Result<*const (), String> {
            let z = format!("{n}\0");
            unsafe { GetProcAddress(h, z.as_ptr()) }.map(|f| f as *const ()).ok_or_else(|| format!("heif.dll ไม่มีคำสั่ง {n}"))
        };
        let l = unsafe {
            let init: unsafe extern "C" fn(*mut c_void) -> HeifError = std::mem::transmute(need("heif_init")?);
            check(init(null_mut()), "เริ่ม libheif")?;
            Lib {
                ctx_alloc: std::mem::transmute(need("heif_context_alloc")?),
                ctx_free: std::mem::transmute(need("heif_context_free")?),
                get_encoder: std::mem::transmute(need("heif_context_get_encoder_for_format")?),
                set_quality: std::mem::transmute(need("heif_encoder_set_lossy_quality")?),
                encoder_release: std::mem::transmute(need("heif_encoder_release")?),
                image_create: std::mem::transmute(need("heif_image_create")?),
                add_plane: std::mem::transmute(need("heif_image_add_plane")?),
                get_plane: std::mem::transmute(need("heif_image_get_plane")?),
                image_release: std::mem::transmute(need("heif_image_release")?),
                encode_image: std::mem::transmute(need("heif_context_encode_image")?),
                write: std::mem::transmute(need("heif_context_write")?),
            }
        };
        Ok(LIB.get_or_init(|| l))
    }

    /// ข้อความของ libheif อยู่ในกล่องของมัน ต้องอ่านก่อนคืนกล่อง
    fn check(e: HeifError, what: &str) -> Result<(), String> {
        if e.code == 0 { return Ok(()); }
        let msg = if e.message.is_null() { String::new() } else { unsafe { CStr::from_ptr(e.message) }.to_string_lossy().into_owned() };
        Err(format!("{what} ไม่สำเร็จ: {msg} (รหัส {}.{})", e.code, e.subcode))
    }

    unsafe extern "C" fn collect(_ctx: *mut c_void, data: *const c_void, size: usize, out: *mut c_void) -> HeifError {
        unsafe { (&mut *(out as *mut Vec<u8>)).extend_from_slice(std::slice::from_raw_parts(data as *const u8, size)) };
        HeifError { code: 0, subcode: 0, message: c"Success".as_ptr() }
    }

    fn run(l: &Lib, ctx: *mut c_void, enc: &mut *mut c_void, img: &mut *mut c_void, rgb: &[u8], w: u32, h: u32, quality: i32) -> Result<Vec<u8>, String> {
        let mut out: Vec<u8> = Vec::new();
        unsafe {
            check((l.get_encoder)(ctx, COMPRESSION_HEVC, enc), "เปิดตัวเข้ารหัส x265")?;
            check((l.set_quality)(*enc, quality), "ตั้งคุณภาพ")?;
            check((l.image_create)(w as c_int, h as c_int, COLORSPACE_RGB, CHROMA_INTERLEAVED_RGB, img), "เตรียมรูป")?;
            check((l.add_plane)(*img, CHANNEL_INTERLEAVED, w as c_int, h as c_int, 8), "เตรียมพื้นที่รูป")?;
            let mut stride: c_int = 0;
            let plane = (l.get_plane)(*img, CHANNEL_INTERLEAVED, &mut stride);
            if plane.is_null() { return Err("เตรียมพื้นที่รูปไม่สำเร็จ".into()); }
            let row = w as usize * 3;
            for y in 0..h as usize {
                std::ptr::copy_nonoverlapping(rgb[y * row..].as_ptr(), plane.add(y * stride as usize), row);
            }
            check((l.encode_image)(ctx, *img as *const c_void, *enc, null(), null_mut()), "เข้ารหัส HEIC")?;
            let writer = Writer { api_version: 1, write: collect };
            check((l.write)(ctx, &writer, &mut out as *mut Vec<u8> as *mut c_void), "เขียนไฟล์ HEIC")?;
        }
        Ok(out)
    }

    /// รับรูป RGB 8 bit คืนไฟล์ HEIC ทั้งไฟล์ · libheif แปลงเป็น YCbCr 4:2:0 กับจัดการด้านคี่เอง
    pub fn encode(dir: &Path, rgb: &[u8], w: u32, h: u32, quality: i32) -> Result<Vec<u8>, String> {
        if rgb.len() != w as usize * h as usize * 3 { return Err("ขนาดข้อมูลรูปไม่ตรงกับความกว้างและความสูง".into()); }
        let l = lib(dir)?;
        unsafe {
            let ctx = (l.ctx_alloc)();
            if ctx.is_null() { return Err("เปิด libheif ไม่สำเร็จ".into()); }
            let (mut enc, mut img) = (null_mut(), null_mut());
            let r = run(l, ctx, &mut enc, &mut img, rgb, w, h, quality);
            if !img.is_null() { (l.image_release)(img); }
            if !enc.is_null() { (l.encoder_release)(enc); }
            (l.ctx_free)(ctx);
            r
        }
    }
}

/// 8 bit 4:2:0 โปรแกรมดูรูปทั่วไปเปิดได้ · ขาวดำเก็บเป็นสีที่ทุกช่องเท่ากัน เพราะ HEVC แบบขาวดำล้วนหลายโปรแกรมเปิดไม่ได้
fn encode_heic(tools: &Path, png: &[u8], o: &GraphImg) -> Result<(Vec<u8>, u32, u32), String> {
    let src = image::load_from_memory_with_format(png, ImageFormat::Png).map_err(|e| format!("อ่านรูปจากหน้าจอไม่ได้: {e}"))?;
    let (w, h) = (src.width(), src.height());
    let rgb = if o.gray { src.grayscale().to_rgb8() } else { src.to_rgb8() };
    Ok((heif::encode(tools, rgb.as_raw(), w, h, o.quality.clamp(1, 100) as i32)?, w, h))
}

#[tauri::command]
pub async fn graph_save_image(app: tauri::AppHandle, path: String, b64: String, opt: GraphImg) -> Result<SavedImg, String> {
    let tools = crate::tools::tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let png = crate::audiograph::unb64(b64.split(',').next_back().unwrap_or(""))?;
        let (data, width, height) = if opt.format == "heic" { encode_heic(&tools, &png, &opt)? } else { encode_image(&png, &opt)? };
        let saved = crate::audiograph::write_unique(Path::new(&path), &data)?;
        Ok(SavedImg { path: saved, size: data.len() as u64, width, height })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
