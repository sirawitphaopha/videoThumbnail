//! ตัวอ่าน PaddleOCR ผ่าน ONNX Runtime ที่แนบมา (แผน OCR ขั้น 3 · BUGS ข้อ 143)
//! โมเดลของ PaddlePaddle แบบ ONNX ทุกตัวอยู่ tools/ocr/paddle (ขั้น 0) · ONNX Runtime อยู่ tools/ocr/onnxruntime โหลดเองตอนใช้ครั้งแรก
//! ทุกอย่างทำงานในเครื่อง ไม่ส่งภาพออกเน็ต (คำเคาะ ⑦)
//!
//! อ่านทีละบรรทัดตามสูตรที่ลองกับซับ ACCA แล้ว PP-OCRv6 small ถูก 436 จาก 439 ภาพ (docs/research/ocr-ซับรูป.md)
//!   แบ่งบรรทัดด้วย ocrprep::split_lines → วางบนพื้นดำเผื่อขอบ 8 จุด → ย่อขยายให้สูง 48 จุด → สลับเป็น BGR
//!   → (ค่า/255 − 0.5)/0.5 → โมเดลอ่าน → ถอดแบบ CTC (เลือกตัวที่ค่าสูงสุดทีละช่วง ตัดตัวซ้ำติดกันกับช่องว่างของ CTC)
//! พจนานุกรมตัวอักษรอ่านจาก character_dict ใน inference.yml ของแต่ละโมเดล บวกช่องว่างของ CTC ข้างหน้า และเว้นวรรคต่อท้าย
//! ค่าความมั่นใจของบรรทัด = ค่าเฉลี่ยความน่าจะเป็นของตัวที่เลือก (แบบ CTCLabelDecode ของ PaddleOCR) ใช้กับระบบชี้จุดสงสัยในขั้น 9
//!
//! ซับญี่ปุ่นแนวตั้ง (คำเคาะ ㉓) ใช้ตัวหาบรรทัด (det) ของ PP-OCRv6 หาคอลัมน์ แล้วหมุนแต่ละคอลัมน์ 90 องศาทวนเข็มให้ตัวอ่านอ่านจากบนลงล่าง
//! เรียงคอลัมน์จากขวาไปซ้ายตามการอ่านภาษาญี่ปุ่น · ค่าของตัวหาบรรทัด (thresh 0.2 box_thresh 0.45 unclip_ratio 1.4) อ่านจาก inference.yml
//! โมเดลหมุนบรรทัด (PP-LCNet textline_ori) บอกว่าบรรทัดกลับหัวไหม (0 หรือ 180 องศา) เปิดได้เป็นตัวเลือก
//!
//! ห้องสมุด ort แบบ load-dynamic เรียก onnxruntime.dll ที่แนบมา ไม่ดาวน์โหลดอะไรตอนสร้างหรือตอนใช้

// ตัวคุมงาน OCR (ขั้น 10) เป็นคนเรียก ระหว่างนี้ยังไม่มีผู้ใช้นอกเทส
#![allow(dead_code)]

use image::{Rgba, RgbaImage};
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Tensor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use crate::ocr::paddle_cache::{clear, on_release, Slot};

/// ขนาดโมเดลของ PP-OCRv6 (คำเคาะ ㉒ ค่าตั้งต้น small)
pub const SIZES: [&str; 3] = ["tiny", "small", "medium"];

/// ภาษาที่มีโมเดลอ่านเฉพาะของ PP-OCRv5 · ภาษาอื่น (ญี่ปุ่น จีน อังกฤษ) ใช้ PP-OCRv6 ที่อ่านได้หลายภาษาในตัวเดียว
pub const V5_LANGS: [(&str, &str); 11] = [
    ("th", "th"), ("en", "en"), ("latin", "latin"), ("ko", "korean"), ("ru", "cyrillic"), ("ar", "arabic"),
    ("hi", "devanagari"), ("el", "el"), ("uk", "eslav"), ("ta", "ta"), ("te", "te"),
];

/// โฟลเดอร์โมเดลที่ผู้ใช้โหลดเอง (BUGS ข้อ 152) · ตัวคุมงานตั้งตอนเปิดคำสั่ง OCR (ocrjob::Dirs::of)
static USER_DIR: OnceLock<PathBuf> = OnceLock::new();
pub fn set_user_dir(p: PathBuf) { let _ = USER_DIR.set(p); }

/// โมเดลชื่อนี้ หาในที่แนบมาก่อน แล้วในที่ผู้ใช้โหลด · ไม่มีทั้งสองที่คืนที่แนบมา (ข้อความผิดพลาดบอกให้โหลด)
fn resolve(paddle: &Path, name: &str) -> PathBuf {
    let b = paddle.join(name);
    if b.join("inference.onnx").is_file() { return b; }
    match USER_DIR.get().map(|u| u.join(name)) { Some(u) if u.join("inference.onnx").is_file() => u, _ => b }
}

/// โฟลเดอร์โมเดลอ่านของภาษาและขนาดนี้ · ไทยใช้ th_PP-OCRv5_mobile_rec เสมอ (PP-OCRv6 ไม่มีตัวอักษรไทย)
/// ภาษาอังกฤษเลือกได้ทั้ง PP-OCRv6 (ค่าตั้งต้น แม่นกว่าในผลเทียบ) หรือ en_PP-OCRv5 ผ่านรหัส en5
pub fn rec_dir(paddle: &Path, lang: &str, size: &str) -> PathBuf {
    let size = if SIZES.contains(&size) { size } else { "small" };
    let lang = lang.to_ascii_lowercase();
    let v5 = |code: &str| V5_LANGS.iter().find(|(l, _)| *l == code).map(|(_, d)| resolve(paddle, &format!("{d}_PP-OCRv5_mobile_rec")));
    match lang.as_str() {
        "th" | "tha" => v5("th").unwrap(),
        "en5" => v5("en").unwrap(),
        "ja" | "jpn" | "zh" | "chi" | "en" | "eng" | "" => paddle.join(format!("PP-OCRv6_{size}_rec")),
        l => v5(l).unwrap_or_else(|| paddle.join(format!("PP-OCRv6_{size}_rec"))),
    }
}

pub fn det_dir(paddle: &Path, size: &str) -> PathBuf {
    let size = if SIZES.contains(&size) { size } else { "small" };
    paddle.join(format!("PP-OCRv6_{size}_det"))
}

/// โหลด ONNX Runtime ครั้งเดียวทั้งโปรแกรม · ไฟล์ DLL หาย หรือเปิดไม่ได้ บอกสาเหตุเป็นประโยคไทย
/// จำเฉพาะตอนโหลดสำเร็จ ไม่สำเร็จครั้งแรก (ไฟล์ยังแตกไม่ครบ) ลองใหม่ได้โดยไม่ต้องปิดเปิดโปรแกรม (ผู้ช่วยตรวจทาน R16 · BUGS ข้อ 162.7)
static ENV: Mutex<bool> = Mutex::new(false);

fn ensure_env(ocr: &Path) -> Result<(), String> {
    let mut ok = ENV.lock().unwrap();
    if *ok { return Ok(()); }
    let dll = ocr.join("onnxruntime").join("onnxruntime.dll");
    if !dll.is_file() { return Err("ไม่มี onnxruntime.dll ในโฟลเดอร์เครื่องมือ ลองติดตั้งโปรแกรมใหม่".into()); }
    let b = ort::init_from(&dll).map_err(|e| format!("เปิด ONNX Runtime ไม่ได้ ลองติดตั้งโปรแกรมใหม่ ({e:?})"))?;
    b.with_name("movie-shelf").commit();
    *ok = true;
    Ok(())
}

/// จำนวนเธรดของตัวอ่านต่อโมเดล · เครื่องพี่กันแรม 8 GB 12 เธรด ใช้ไม่เกินครึ่งแบบ dev.ps1 และไม่เกิน 4
fn threads() -> usize {
    std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).div_ceil(2).clamp(1, 4)
}

fn open_session(model: &Path) -> Result<Session, String> {
    let file = model.join("inference.onnx");
    if !file.is_file() { return Err(format!("ไม่มีโมเดล {} ในโฟลเดอร์เครื่องมือ ลองติดตั้งโปรแกรมใหม่", model.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())); }
    let fail = |e: String| format!("เปิดโมเดล {} ไม่ได้ ไฟล์อาจเสีย ลองติดตั้งโปรแกรมใหม่ ({e})", model.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
    Session::builder().map_err(|e| fail(e.to_string()))?
        .with_optimization_level(GraphOptimizationLevel::Level3).map_err(|e| fail(e.to_string()))?
        .with_intra_threads(threads()).map_err(|e| fail(e.to_string()))?
        .commit_from_file(&file).map_err(|e| fail(e.to_string()))
}

/// พจนานุกรมตัวอักษรจาก inference.yml · บรรทัดใต้ character_dict ที่ขึ้นต้นด้วย "- " · ค่าในเครื่องหมายคำพูดเดี่ยวหรือคู่ถอดแบบ YAML
pub fn read_dict(yml: &str) -> Vec<String> {
    let lines: Vec<&str> = yml.lines().collect();
    let Some(i) = lines.iter().position(|l| l.trim() == "character_dict:") else { return vec![] };
    let mut out = vec![];
    for l in &lines[i + 1..] {
        let t = l.trim_start();
        let Some(v) = t.strip_prefix("- ").or_else(|| (t == "-").then_some("")) else { break };
        let v = if v.len() >= 2 && v.starts_with('\'') && v.ends_with('\'') {
            v[1..v.len() - 1].replace("''", "'")
        } else if v.len() >= 2 && v.starts_with('"') && v.ends_with('"') {
            unescape(&v[1..v.len() - 1])
        } else {
            v.to_string()
        };
        out.push(v);
    }
    out
}

/// ถอดตัวหนีแบบ YAML ในเครื่องหมายคำพูดคู่ (\\ \" \n \t \uXXXX \UXXXXXXXX \xXX)
fn unescape(s: &str) -> String {
    let mut out = String::new();
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c != '\\' { out.push(c); continue; }
        let hex = |it: &mut std::iter::Peekable<std::str::Chars>, n: usize| -> Option<char> {
            let h: String = (0..n).filter_map(|_| it.next()).collect();
            u32::from_str_radix(&h, 16).ok().and_then(char::from_u32)
        };
        match it.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('0') => out.push('\0'),
            Some('x') => if let Some(c) = hex(&mut it, 2) { out.push(c) },
            Some('u') => if let Some(c) = hex(&mut it, 4) { out.push(c) },
            Some('U') => if let Some(c) = hex(&mut it, 8) { out.push(c) },
            Some(o) => out.push(o),
            None => {}
        }
    }
    out
}

/// โมเดลอ่านหนึ่งตัว
pub struct Rec {
    session: Mutex<Session>,
    /// ตัวที่ 0 คือช่องว่างของ CTC · ตัวท้ายคือเว้นวรรค
    chars: Vec<String>,
    pub name: String,
}

/// ผลอ่านหนึ่งบรรทัด
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct LineText {
    pub text: String,
    /// 0–1
    pub conf: f32,
}

impl Rec {
    pub fn load(ocr: &Path, model: &Path) -> Result<Rec, String> {
        ensure_env(ocr)?;
        let yml = std::fs::read_to_string(model.join("inference.yml")).map_err(|_| format!("ไม่มีไฟล์ตั้งค่าของโมเดล {} ลองติดตั้งโปรแกรมใหม่", model.display()))?;
        let dict = read_dict(&yml);
        if dict.is_empty() { return Err("อ่านพจนานุกรมตัวอักษรของโมเดลไม่ได้".into()); }
        let mut chars = Vec::with_capacity(dict.len() + 2);
        chars.push(String::new());
        chars.extend(dict);
        chars.push(" ".into());
        Ok(Rec { session: Mutex::new(open_session(model)?), chars, name: model.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default() })
    }

    /// อ่านภาพหนึ่งบรรทัด (RGBA จากซับ) · ภาพเปล่าคืนข้อความว่างความมั่นใจ 0
    pub fn line(&self, img: &RgbaImage) -> Result<LineText, String> {
        if img.width() == 0 || img.height() == 0 { return Ok(LineText { text: String::new(), conf: 0.0 }); }
        // ตัดเหลือส่วนที่มีหมึกก่อน · บรรทัดสั้นที่ได้ภาพกว้างเท่าบรรทัดยาว พื้นดำว่างสองข้าง โมเดลไทยอ่านเป็นขีด "-----" (เจอตอนเทส 16 พ.ย. 2569)
        // เกณฑ์ alpha 40 เท่าตัวแบ่งบรรทัด · จุดจางของบรรทัดอื่นที่ตัวแบ่งไม่ลบ ไม่ยืดกรอบจนเหลือพื้นดำข้างเดียว (ผู้ช่วยตรวจทาน T11)
        let Some((x, y, w, h)) = crate::ocr::ocrprep::ink_bounds(img, 40).or_else(|| crate::ocr::ocrprep::ink_bounds(img, 0)) else { return Ok(LineText { text: String::new(), conf: 0.0 }) };
        let ink = image::imageops::crop_imm(img, x, y, w, h).to_image();
        let rgb = crate::ocr::ocrprep::on_black(&ink, 8);
        self.line_rgb(&rgb)
    }

    /// อ่านภาพหนึ่งบรรทัดที่วางบนพื้นแล้ว · ย่อขยายสูง 48 กว้างตามสัดส่วนอย่างน้อย 16 · BGR · (ค่า/255 − 0.5)/0.5
    pub fn line_rgb(&self, rgb: &image::RgbImage) -> Result<LineText, String> {
        let (w, h) = rgb.dimensions();
        let nw = ((w as f64 * 48.0 / h as f64).round() as u32).max(16);
        let im = image::imageops::resize(rgb, nw, 48, image::imageops::FilterType::Triangle);
        let plane = (48 * nw) as usize;
        let mut data = vec![0f32; 3 * plane];
        for (x, y, p) in im.enumerate_pixels() {
            let i = (y * nw + x) as usize;
            // BGR ตามที่โมเดลของ PaddleOCR อ่านภาพด้วย OpenCV
            for (c, v) in [p[2], p[1], p[0]].into_iter().enumerate() { data[c * plane + i] = (v as f32 / 255.0 - 0.5) / 0.5; }
        }
        let input = Tensor::from_array(([1usize, 3, 48, nw as usize], data)).map_err(|e| e.to_string())?;
        let mut s = self.session.lock().unwrap();
        let out = s.run(ort::inputs![input]).map_err(|e| format!("PaddleOCR อ่านภาพไม่สำเร็จ ({e})"))?;
        let (shape, probs) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        let (t, c) = (shape[1] as usize, shape[2] as usize);
        Ok(ctc_decode(probs, t, c, &self.chars))
    }
}

/// ถอดผลแบบ CTC · ทีละช่วงเวลาเลือกตัวที่ค่าสูงสุด ตัดตัวที่ซ้ำกับช่วงก่อนและช่องว่าง (ตัวที่ 0)
/// ความมั่นใจ = ค่าเฉลี่ยของค่าสูงสุดในช่วงที่เลือกตัว · ตาม CTCLabelDecode ของ PaddleOCR
pub fn ctc_decode(probs: &[f32], t: usize, c: usize, chars: &[String]) -> LineText {
    let mut text = String::new();
    let (mut sum, mut n) = (0f32, 0usize);
    let mut prev = 0usize;
    for k in 0..t {
        let row = &probs[k * c..(k + 1) * c];
        let (best, p) = row.iter().enumerate().fold((0usize, f32::MIN), |a, (i, v)| if *v > a.1 { (i, *v) } else { a });
        if best != 0 && best != prev && best < chars.len() { text.push_str(&chars[best]); sum += p; n += 1; }
        prev = best;
    }
    LineText { text: text.trim().to_string(), conf: if n > 0 { sum / n as f32 } else { 0.0 } }
}

// ---------------------------------------------------------------- ตัวหาบรรทัด (det) สำหรับซับแนวตั้ง

pub struct Det {
    session: Mutex<Session>,
    thresh: f32,
    box_thresh: f32,
    unclip: f32,
}

/// กรอบข้อความที่หาได้ในภาพ x y กว้าง สูง
pub type Rect = (u32, u32, u32, u32);

fn yml_num(yml: &str, key: &str, def: f32) -> f32 {
    yml.lines().find_map(|l| l.trim().strip_prefix(&format!("{key}:")).and_then(|v| v.trim().parse().ok())).unwrap_or(def)
}

impl Det {
    pub fn load(ocr: &Path, model: &Path) -> Result<Det, String> {
        ensure_env(ocr)?;
        let yml = std::fs::read_to_string(model.join("inference.yml")).unwrap_or_default();
        Ok(Det { session: Mutex::new(open_session(model)?), thresh: yml_num(&yml, "thresh", 0.2), box_thresh: yml_num(&yml, "box_thresh", 0.45), unclip: yml_num(&yml, "unclip_ratio", 1.4) })
    }

    /// หากรอบข้อความ · ภาพวางบนพื้นดำเผื่อขอบ 16 จุด ย่อให้ด้านยาวไม่เกิน 960 แล้วปัดทั้งสองด้านเป็นพหุคูณของ 32
    /// ปรับค่าแบบ ImageNet (ลำดับ BGR ตามที่ PaddleOCR อ่าน) · แผนที่ความน่าจะเป็นเกิน thresh เป็นจุดข้อความ หากลุ่มที่ติดกัน
    /// กลุ่มที่ค่าเฉลี่ยไม่ถึง box_thresh ทิ้ง · ขยายกรอบด้วยระยะ พื้นที่ × unclip ÷ เส้นรอบรูป แบบ DBPostProcess
    pub fn boxes(&self, img: &RgbaImage) -> Result<Vec<Rect>, String> {
        let pad = 16u32;
        let rgb = crate::ocr::ocrprep::on_black(img, pad);
        let (w0, h0) = rgb.dimensions();
        let scale = (960.0 / w0.max(h0) as f64).min(1.0);
        let r32 = |v: f64| (((v / 32.0).round() as u32).max(1)) * 32;
        let (w, h) = (r32(w0 as f64 * scale), r32(h0 as f64 * scale));
        let im = image::imageops::resize(&rgb, w, h, image::imageops::FilterType::Triangle);
        let plane = (w * h) as usize;
        let mut data = vec![0f32; 3 * plane];
        let (mean, std) = ([0.485f32, 0.456, 0.406], [0.229f32, 0.224, 0.225]);
        for (x, y, p) in im.enumerate_pixels() {
            let i = (y * w + x) as usize;
            for (c, v) in [p[2], p[1], p[0]].into_iter().enumerate() { data[c * plane + i] = (v as f32 / 255.0 - mean[c]) / std[c]; }
        }
        let input = Tensor::from_array(([1usize, 3, h as usize, w as usize], data)).map_err(|e| e.to_string())?;
        let mut s = self.session.lock().unwrap();
        let out = s.run(ort::inputs![input]).map_err(|e| format!("ตัวหาบรรทัดของ PaddleOCR ทำงานไม่สำเร็จ ({e})"))?;
        let (shape, prob) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        let (ph, pw) = (shape[shape.len() - 2] as usize, shape[shape.len() - 1] as usize);
        let found = db_boxes(prob, pw, ph, self.thresh, self.box_thresh, self.unclip);
        // กลับเป็นพิกัดของภาพเดิม (หักขอบที่เผื่อ)
        let (sx, sy) = (w0 as f64 / pw as f64, h0 as f64 / ph as f64);
        Ok(found.into_iter().filter_map(|(x, y, bw, bh)| {
            let x0 = ((x as f64 * sx) as i64 - pad as i64).max(0) as u32;
            let y0 = ((y as f64 * sy) as i64 - pad as i64).max(0) as u32;
            // ค่าติดลบ (กรอบอยู่ในขอบที่เผื่อ) แปลงเป็น u32 แล้ววนเป็นเลขใหญ่มาก จึงหนีบไว้ในภาพ (ผู้ช่วยตรวจทาน R17)
            let x1 = (((x + bw) as f64 * sx) as i64 - pad as i64).clamp(0, img.width() as i64) as u32;
            let y1 = (((y + bh) as f64 * sy) as i64 - pad as i64).clamp(0, img.height() as i64) as u32;
            (x1 > x0 + 2 && y1 > y0 + 2).then_some((x0, y0, x1 - x0, y1 - y0))
        }).collect())
    }
}

/// หากลุ่มจุดข้อความจากแผนที่ความน่าจะเป็น (ติดกันสี่ทิศ) เป็นกรอบตั้งตรง · ตาม DBPostProcess แบบกรอบสี่เหลี่ยม (ซับไม่เอียง)
pub fn db_boxes(prob: &[f32], w: usize, h: usize, thresh: f32, box_thresh: f32, unclip: f32) -> Vec<Rect> {
    let mut seen = vec![false; w * h];
    let mut out = vec![];
    let mut stack = vec![];
    for start in 0..w * h {
        if seen[start] || prob[start] <= thresh { continue; }
        seen[start] = true;
        stack.push(start);
        let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0usize, 0usize);
        let (mut sum, mut n) = (0f32, 0usize);
        while let Some(i) = stack.pop() {
            let (x, y) = (i % w, i / w);
            x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y);
            sum += prob[i]; n += 1;
            let mut push = |j: usize| if !seen[j] && prob[j] > thresh { seen[j] = true; stack.push(j); };
            if x > 0 { push(i - 1); }
            if x + 1 < w { push(i + 1); }
            if y > 0 { push(i - w); }
            if y + 1 < h { push(i + w); }
        }
        let (bw, bh) = ((x1 - x0 + 1) as f32, (y1 - y0 + 1) as f32);
        if bw.min(bh) < 3.0 || sum / (n as f32) < box_thresh { continue; }
        let d = bw * bh * unclip / (2.0 * (bw + bh));
        let nx0 = (x0 as f32 - d).max(0.0) as u32;
        let ny0 = (y0 as f32 - d).max(0.0) as u32;
        let nx1 = ((x1 + 1) as f32 + d).min(w as f32) as u32;
        let ny1 = ((y1 + 1) as f32 + d).min(h as f32) as u32;
        out.push((nx0, ny0, nx1 - nx0, ny1 - ny0));
    }
    out
}

// ---------------------------------------------------------------- โมเดลหมุนบรรทัด

pub struct Ori {
    session: Mutex<Session>,
}

impl Ori {
    pub fn load(ocr: &Path, model: &Path) -> Result<Ori, String> {
        ensure_env(ocr)?;
        Ok(Ori { session: Mutex::new(open_session(model)?) })
    }

    /// บรรทัดนี้กลับหัวไหม · ย่อขยายเป็น 160 × 80 ปรับค่าแบบ ImageNet · คลาส 0 คือ 0 องศา 1 คือ 180 องศา นับว่ากลับหัวเมื่อมั่นใจเกิน 0.9
    pub fn upside_down(&self, img: &RgbaImage) -> Result<bool, String> {
        let rgb = crate::ocr::ocrprep::on_black(img, 4);
        let im = image::imageops::resize(&rgb, 160, 80, image::imageops::FilterType::Triangle);
        let plane = 160 * 80;
        let mut data = vec![0f32; 3 * plane];
        let (mean, std) = ([0.485f32, 0.456, 0.406], [0.229f32, 0.224, 0.225]);
        for (x, y, p) in im.enumerate_pixels() {
            let i = (y * 160 + x) as usize;
            for (c, v) in [p[2], p[1], p[0]].into_iter().enumerate() { data[c * plane + i] = (v as f32 / 255.0 - mean[c]) / std[c]; }
        }
        let input = Tensor::from_array(([1usize, 3, 80, 160], data)).map_err(|e| e.to_string())?;
        let mut s = self.session.lock().unwrap();
        let out = s.run(ort::inputs![input]).map_err(|e| e.to_string())?;
        let (_, p) = out[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok(p.len() >= 2 && p[1] > p[0] && p[1] > 0.9)
    }
}

// ---------------------------------------------------------------- อ่านทั้งภาพ

/// ค่าตั้งของตัวอ่าน PaddleOCR
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PaddleOpts {
    /// รหัสภาษา (ja en th ko …) · ว่างคือ PP-OCRv6 อ่านได้หลายภาษา
    pub lang: String,
    /// tiny small medium
    pub size: String,
    /// แนวตั้ง auto (ภาพสูงกว่ากว้าง) on off
    pub vertical: String,
    /// ใช้โมเดลหมุนบรรทัด
    pub orientation: bool,
}

impl Default for PaddleOpts {
    fn default() -> Self { PaddleOpts { lang: String::new(), size: "small".into(), vertical: "auto".into(), orientation: false } }
}

/// โมเดลที่โหลดแล้ว เก็บไว้ใช้ซ้ำทุกภาพ · โหลดใหม่ใช้เวลาราววินาที · เก็บไม่เกินสองตัวล่าสุดต่อชนิด ว่างสามนาทีปล่อยหมด (paddle_cache.rs · BUGS ข้อ 162.7)
pub(crate) static RECS: Slot<Rec> = OnceLock::new();
pub(crate) static DETS: Slot<Det> = OnceLock::new();
pub(crate) static ORIS: Slot<Ori> = OnceLock::new();

fn release() { clear(&RECS); clear(&DETS); clear(&ORIS); }

fn cached<T: Send + Sync + 'static>(slot: &'static Slot<T>, key: &Path, load: impl FnOnce() -> Result<T, String>) -> Result<Arc<T>, String> {
    on_release(release);
    crate::ocr::paddle_cache::cached(slot, key, load)
}

pub fn rec_for(ocr: &Path, lang: &str, size: &str) -> Result<Arc<Rec>, String> {
    let dir = rec_dir(&ocr.join("paddle"), lang, size);
    // ภาษาที่ไม่ได้แนบมาและยังไม่ได้โหลด บอกให้โหลด ไม่ใช่บอกให้ติดตั้งใหม่ (BUGS ข้อ 152)
    if !dir.join("inference.onnx").is_file() {
        if let Some(m) = dir.file_name().and_then(|n| crate::ocr::paddle_dl::find_dir(&n.to_string_lossy())) {
            return Err(format!("ยังไม่ได้โหลดโมเดลภาษา{} ({:.1} MB) กดโหลดได้ที่ปุ่มตัวอ่านและชุดภาษาในแถบล่าง", m.name, m.bytes() as f64 / 1048576.0));
        }
    }
    cached(&RECS, &dir, || Rec::load(ocr, &dir))
}

/// ภาพนี้เป็นซับแนวตั้งไหม · auto ดูว่าภาพสูงกว่ากว้างครึ่งเท่าขึ้นไป (คอลัมน์เดียวหรือสองคอลัมน์ของซับญี่ปุ่น)
pub fn is_vertical(img: &RgbaImage, mode: &str) -> bool {
    // ภาพสูงกว่ากว้างเพราะมีป้ายบนจอด้านบนกับบทพูดด้านล่างก็ได้ (เจอตอนเทส 16 พ.ย. 2569 ซับไทยสองก้อนถูกอ่านเป็นแนวตั้ง บรรทัดสลับกัน)
    // จึงต้องไม่มีบรรทัดไหนที่หมึกยาวตามแนวนอนเกินสี่เท่าของความสูง · คอลัมน์ญี่ปุ่นแบ่งตามแถวได้ทีละตัวหรือสองตัวข้ามคอลัมน์ ไม่ยาวขนาดนั้น
    match mode {
        "on" => true,
        "off" => false,
        _ => img.height() as f64 > img.width() as f64 * 1.5
            && !crate::ocr::ocrprep::split_lines(img).iter().any(|l| crate::ocr::ocrprep::ink_bounds(&l.img, 40).is_some_and(|(_, _, w, h)| w > h * 4)),
    }
}

/// อ่านทั้งภาพ คืนทีละบรรทัดตามลำดับการอ่าน · แนวนอนแบ่งบรรทัดด้วย ocrprep · แนวตั้งหาคอลัมน์ด้วยตัวหาบรรทัด เรียงขวาไปซ้าย
pub fn read(ocr: &Path, img: &RgbaImage, o: &PaddleOpts) -> Result<Vec<LineText>, String> {
    let rec = rec_for(ocr, &o.lang, &o.size)?;
    let ori = if o.orientation {
        let d = ocr.join("paddle").join(if o.size == "medium" { "PP-LCNet_x1_0_textline_ori" } else { "PP-LCNet_x0_25_textline_ori" });
        Some(cached(&ORIS, &d, || Ori::load(ocr, &d))?)
    } else { None };
    let read_one = |line: RgbaImage| -> Result<LineText, String> {
        let line = match &ori { Some(r) if r.upside_down(&line)? => image::imageops::rotate180(&line), _ => line };
        rec.line(&line)
    };
    if is_vertical(img, &o.vertical) {
        let dd = det_dir(&ocr.join("paddle"), &o.size);
        let det = cached(&DETS, &dd, || Det::load(ocr, &dd))?;
        let cols = det.boxes(img)?;
        if !cols.is_empty() {
            // จัดกรอบเป็นคอลัมน์ ขวาไปซ้าย ในคอลัมน์บนลงล่าง ต่อข้อความเป็นบรรทัดเดียว · คอลัมน์คำอ่านตัวเล็กทางขวาทิ้งเมื่ออ่านได้คานะล้วน
            // (ผู้ช่วยตรวจทาน T5 · เดิมเรียงด้วยกึ่งกลางแนวนอนอย่างเดียว คำอ่านขึ้นหน้าประโยค และคอลัมน์ที่แบ่งเป็นสองกรอบสลับบนล่างได้)
            let (groups, ruby) = vertical_columns(&cols);
            let mut out = Vec::with_capacity(groups.len());
            for g in groups {
                let mut text = String::new();
                let mut conf = f32::INFINITY;
                for &k in &g {
                    let (x, y, w, h) = cols[k];
                    let crop = image::imageops::crop_imm(img, x, y, w, h).to_image();
                    // คอลัมน์หมุน 90 องศาทวนเข็ม ตัวบนสุดไปอยู่ซ้ายสุด ตัวอ่านอ่านจากซ้ายไปขวาจึงได้ลำดับบนลงล่าง
                    let t = read_one(if h as f64 > w as f64 * 1.5 { image::imageops::rotate270(&crop) } else { crop })?;
                    if ruby[k] && !t.text.is_empty() && t.text.chars().all(|c| ('\u{3040}'..='\u{30FF}').contains(&c) || c.is_whitespace()) { continue; }
                    if t.text.is_empty() { continue; }
                    text.push_str(&t.text);
                    conf = conf.min(t.conf);
                }
                if !text.is_empty() { out.push(LineText { text, conf }); }
            }
            return Ok(out);
        }
    }
    let lines = crate::ocr::ocrprep::split_lines(img);
    let ruby = if matches!(o.lang.as_str(), "" | "ja" | "zh" | "ch") { ruby_lines(&lines) } else { vec![false; lines.len()] };
    let mut out = Vec::with_capacity(lines.len());
    for (k, l) in lines.into_iter().enumerate() {
        let t = read_one(l.img)?;
        // บรรทัดคำอ่านตัวเล็กเหนือคันจิ (ฟุริงานะ) ทิ้งเมื่ออ่านได้คานะล้วน · อ่านได้อย่างอื่นแปลว่าไม่ใช่คำอ่าน เก็บไว้
        if ruby[k] && !t.text.is_empty() && t.text.chars().all(|c| ('\u{3040}'..='\u{30FF}').contains(&c) || c.is_whitespace()) { continue; }
        out.push(t);
    }
    Ok(out)
}

/// กรอบข้อความของซับแนวตั้ง (x y w h) จัดเป็นคอลัมน์ · คืนลำดับกรอบของแต่ละคอลัมน์ (ขวาไปซ้าย ในคอลัมน์บนลงล่าง) กับธงคอลัมน์คำอ่าน
/// คอลัมน์คำอ่าน แคบกว่า 0.6 เท่าของความกว้างกลาง อยู่ชิดขวาของคอลัมน์ที่กว้างกว่า (ห่างไม่ถึงครึ่งความกว้างกลาง) และช่วงแนวตั้งอยู่ในคอลัมน์นั้น
pub(crate) fn vertical_columns(cols: &[(u32, u32, u32, u32)]) -> (Vec<Vec<usize>>, Vec<bool>) {
    let mut ws: Vec<u32> = cols.iter().map(|c| c.2).collect();
    ws.sort_unstable();
    let mw = ws.get(ws.len() / 2).copied().unwrap_or(1) as f64;
    let ruby: Vec<bool> = cols.iter().map(|c| {
        (c.2 as f64) < mw * 0.6 && cols.iter().any(|d| {
            (d.2 as f64) >= mw * 0.8 && c.0 as f64 >= d.0 as f64 + d.2 as f64 / 2.0 && (c.0 as f64) <= (d.0 + d.2) as f64 + mw * 0.5
                && c.1 as f64 >= d.1 as f64 - mw * 0.5 && ((c.1 + c.3) as f64) <= (d.1 + d.3) as f64 + mw * 0.5
        })
    }).collect();
    // กรอบที่ช่วงแนวนอนซ้อนกันเกินครึ่งของกรอบที่แคบกว่าอยู่คอลัมน์เดียวกัน · คำอ่านอยู่กลุ่มของตัวเอง
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut order: Vec<usize> = (0..cols.len()).collect();
    order.sort_by_key(|&k| std::cmp::Reverse(cols[k].0 + cols[k].2 / 2));
    for k in order {
        let c = cols[k];
        let same = groups.iter_mut().find(|g| g.iter().all(|&j| ruby[j] == ruby[k]) && g.iter().any(|&j| {
            let d = cols[j];
            let ov = (c.0 + c.2).min(d.0 + d.2) as i64 - c.0.max(d.0) as i64;
            ov as f64 > c.2.min(d.2) as f64 * 0.5
        }));
        match same { Some(g) => g.push(k), None => groups.push(vec![k]) }
    }
    for g in groups.iter_mut() { g.sort_by_key(|&k| cols[k].1); }
    (groups, ruby)
}

/// บรรทัดที่น่าจะเป็นคำอ่านตัวเล็กเหนือคันจิ (ฟุริงานะ) ของซับญี่ปุ่น · ผู้ช่วยตรวจทาน T4
/// เตี้ยกว่า 0.6 เท่าของความสูงกลางของบรรทัด อยู่ชิดเหนือบรรทัดถัดไป (ห่างไม่เกินครึ่งความสูงกลาง) อยู่ในช่วงแนวนอนของบรรทัดนั้นและแคบกว่า 0.8 เท่า
/// เดิมอ่านเป็นบรรทัดแรกของข้อความ เช่น ほうこう นำหน้า 咆哮が聞こえる · ไม่ใช้กับไทย เพราะสระบนวรรณยุกต์ของไทยเป็นแถบเตี้ยเหมือนกัน
pub(crate) fn ruby_lines(lines: &[crate::ocr::ocrprep::Line]) -> Vec<bool> {
    let b: Vec<Option<(u32, u32, u32, u32)>> = lines.iter().map(|l| crate::ocr::ocrprep::ink_bounds(&l.img, 40).map(|(x, y, w, h)| (x, l.y + y, w, h))).collect();
    let mut hs: Vec<u32> = b.iter().flatten().map(|r| r.3).collect();
    let mut out = vec![false; lines.len()];
    if hs.len() < 2 { return out; }
    hs.sort_unstable();
    let mid = hs[hs.len() / 2] as f64;
    for k in 0..lines.len().saturating_sub(1) {
        let (Some(a), Some(n)) = (b[k], b[k + 1]) else { continue };
        let short = (a.3 as f64) < mid * 0.6;
        let close = (n.1 as f64) - ((a.1 + a.3) as f64) <= mid * 0.5;
        let inside = (a.0 as f64) >= n.0 as f64 - mid * 0.5 && ((a.0 + a.2) as f64) <= (n.0 + n.2) as f64 + mid * 0.5;
        let narrow = (a.2 as f64) < n.2 as f64 * 0.8;
        out[k] = short && close && inside && narrow && n.3 as f64 >= mid * 0.8;
    }
    out
}

/// ข้อความของทั้งภาพ บรรทัดคั่นด้วยขึ้นบรรทัดใหม่ บรรทัดที่อ่านไม่ได้ข้าม · ความมั่นใจต่ำสุดของบรรทัดที่มีข้อความ
pub fn read_text(ocr: &Path, img: &RgbaImage, o: &PaddleOpts) -> Result<(String, f32), String> {
    let lines = read(ocr, img, o)?;
    let kept: Vec<&LineText> = lines.iter().filter(|l| !l.text.is_empty()).collect();
    let conf = kept.iter().map(|l| l.conf).fold(f32::INFINITY, f32::min);
    Ok((kept.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n"), if kept.is_empty() { 0.0 } else { conf }))
}

/// รายชื่อโมเดลที่มี (ชื่อโฟลเดอร์ที่มี inference.onnx) ทั้งที่แนบมาและที่ผู้ใช้โหลด ให้หน้าต่างตัวอ่านแสดงว่ามีอะไรบ้าง
pub fn models(ocr: &Path) -> Vec<String> {
    let list = |p: &Path| std::fs::read_dir(p).map(|d| d.filter_map(|e| e.ok())
        .filter(|e| e.path().join("inference.onnx").is_file()).map(|e| e.file_name().to_string_lossy().to_string()).collect::<Vec<_>>()).unwrap_or_default();
    let mut v = list(&ocr.join("paddle"));
    if let Some(u) = USER_DIR.get() { for m in list(u) { if !v.contains(&m) { v.push(m); } } }
    v.sort();
    v
}

/// ทำให้ภาพเป็นสีขาวบนพื้นใส ใช้กับภาพตัวอักษรสีอื่นที่ตัวอ่านอ่านพลาด (เช่นซับเหลือง) · ตัวคุมงานเลือกใช้
pub fn whiten(img: &RgbaImage) -> RgbaImage {
    let mut out = img.clone();
    for p in out.pixels_mut() { let v = p[0].max(p[1]).max(p[2]); *p = Rgba([v, v, v, p[3]]); }
    out
}

#[cfg(test)]
#[path = "paddle_tests.rs"]
mod tests;
