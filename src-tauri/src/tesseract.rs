//! ตัวอ่าน Tesseract (แผน OCR ขั้น 4 · BUGS ข้อ 143)
//! Tesseract 5.5.3 แบบไม่ต้องติดตั้งแนบมาใน tools/ocr/tesseract พร้อมชุดภาษา eng tha jpn jpn_vert osd แบบ best (ขั้น 0)
//! ภาษาอื่นโหลดเพิ่มในโปรแกรมได้ (คำเคาะ ②) เก็บในโฟลเดอร์ของโปรแกรม ไม่แตะโฟลเดอร์ที่แนบมา · ออกเน็ตเฉพาะตอนกดโหลด
//!
//! แปลจาก TesseractOcr.cs TesseractEngineModeItem.cs ของ Subtitle Edit และ RetryTesseractIfNeededAsync ใน OcrViewModel.cs
//! กับ TesseractDictionary.cs (รายการภาษาและที่อยู่โหลด) สัญญา MIT
//!   Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//!   ① เตรียมภาพ เผื่อขอบ 10 จุด แล้วทำเป็นตัวดำบนพื้นขาว จุดที่ทึบตั้งแต่ 100 และสว่างสุดของ RGB ตั้งแต่ 90 เป็นตัวหนังสือ (MakeBlackAndWhiteForOcr)
//!      ยืดภาพได้ (ลองซ้ำ 3 × 2 เท่ากับ 4 × 2 เท่า) ด้วยตัวย่อขยายแบบลูกบาศก์
//!   ② เรียก tesseract.exe แบบ --tessdata-dir -l --psm --oem กับ -c tessedit_create_hocr=1 ได้ไฟล์ hOCR
//!   ③ อ่าน hOCR ทีละบรรทัดทีละคำ <em> เป็นตัวเอียง ถอดตัวหนีของ HTML · ของชั้นหนังเพิ่ม เก็บค่าความมั่นใจของคำ (x_wconf) ให้ระบบชี้จุดสงสัย
//!   ④ ผลแรกว่างหรือมีคำที่ไม่รู้จัก ลองซ้ำบนภาพยืด 3 × 2 เท่าแบบหาเค้าโครงเอง ว่างอีกลอง 4 × 2 เท่าแบบบรรทัดเดียว
//!      รับผลซ้ำเมื่อคำที่ไม่รู้จักน้อยลง คำที่ถูกไม่น้อยลง และไม่มีตัวเลขที่ผลแรกไม่มี · ไม่งั้นเอาเฉพาะคำที่ไม่รู้จักจากผลซ้ำมาแทนทีละคำ
//!      ตัวนับคำมาจากตัวแก้คำในขั้น 8 ส่งเข้ามาเป็นฟังก์ชัน ไม่มีตัวนับ (ไม่ใช้พจนานุกรม) ลองซ้ำเฉพาะผลที่ว่าง แบบ Subtitle Edit
//! ซับญี่ปุ่นแนวตั้งใช้ชุดภาษา jpn_vert กับการแบ่งหน้าแบบข้อความแนวตั้ง (psm 5)

// ตัวคุมงาน OCR (ขั้น 10) เป็นคนเรียกตัวอ่าน ระหว่างนี้ยังไม่มีผู้ใช้นอกเทส
#![allow(dead_code)]

use crate::tools::{run_tool_timeout, tool_command};
use image::{Rgba, RgbaImage};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// เผื่อขอบขาวรอบตัวหนังสือ ตัวชิดขอบภาพ Tesseract อ่านพลาด ("In" แทน "in")
pub const MARGIN: u32 = 10;
/// การแบ่งหน้า ก้อนข้อความก้อนเดียว (รอบแรก) · หาเค้าโครงเอง (ลองซ้ำ) · บรรทัดเดียว (ลองครั้งสุดท้าย) · ข้อความแนวตั้ง
pub const PSM_BLOCK: u32 = 6;
pub const PSM_AUTO: u32 = 3;
pub const PSM_LINE: u32 = 7;
pub const PSM_VERTICAL: u32 = 5;

/// โหมดเครื่องยนต์ (--oem) 0 แบบเก่า 1 แบบโครงข่ายประสาท 2 ทั้งสองแบบ 3 ค่าตั้งต้นของ Tesseract
pub const ENGINE_MODES: [(u32, &str); 4] = [(0, "Legacy"), (1, "LSTM"), (2, "Legacy + LSTM"), (3, "Default")];

/// ที่อยู่โหลดชุดภาษาแบบที่ Subtitle Edit ใช้ (tessdata มาตรฐาน มีทั้งเครื่องยนต์แบบเก่าและแบบใหม่)
pub const DOWNLOAD_URL: &str = "https://raw.githubusercontent.com/tesseract-ocr/tessdata/main/{}.traineddata";

/// ภาษาที่โหลดได้ (รายการของ TesseractDictionary.cs) กับชื่อภาษาอังกฤษ
pub const LANGS: &[(&str, &str)] = &[
    ("afr", "Afrikaans"), ("amh", "Amharic"), ("ara", "Arabic"), ("asm", "Assamese"), ("aze", "Azerbaijani"), ("aze_cyrl", "Azerbaijani (Cyrillic)"),
    ("bel", "Belarusian"), ("ben", "Bengali"), ("bod", "Tibetan"), ("bos", "Bosnian"), ("bre", "Breton"), ("bul", "Bulgarian"), ("cat", "Catalan"),
    ("ceb", "Cebuano"), ("ces", "Czech"), ("chi_sim", "Chinese Simplified"), ("chi_sim_vert", "Chinese Simplified (vertical)"),
    ("chi_tra", "Chinese Traditional"), ("chi_tra_vert", "Chinese Traditional (vertical)"), ("chr", "Cherokee"), ("cos", "Corsican"), ("cym", "Welsh"),
    ("dan", "Danish"), ("deu", "German"), ("div", "Dhivehi"), ("dzo", "Dzongkha"), ("ell", "Greek"), ("eng", "English"), ("enm", "Middle English"),
    ("epo", "Esperanto"), ("equ", "Math / equation"), ("est", "Estonian"), ("eus", "Basque"), ("fao", "Faroese"), ("fas", "Persian"), ("fil", "Filipino"),
    ("fin", "Finnish"), ("fra", "French"), ("frk", "Fraktur"), ("frm", "Middle French"), ("fry", "Western Frisian"), ("gla", "Scottish Gaelic"),
    ("gle", "Irish"), ("glg", "Galician"), ("grc", "Ancient Greek"), ("guj", "Gujarati"), ("hat", "Haitian"), ("heb", "Hebrew"), ("hin", "Hindi"),
    ("hrv", "Croatian"), ("hun", "Hungarian"), ("hye", "Armenian"), ("iku", "Inuktitut"), ("ind", "Indonesian"), ("isl", "Icelandic"), ("ita", "Italian"),
    ("jav", "Javanese"), ("jpn", "Japanese"), ("jpn_vert", "Japanese (vertical)"), ("kan", "Kannada"), ("kat", "Georgian"), ("kaz", "Kazakh"),
    ("khm", "Khmer"), ("kir", "Kyrgyz"), ("kor", "Korean"), ("kor_vert", "Korean (vertical)"), ("kur", "Kurdish"), ("kur_ara", "Kurdish (Arabic)"),
    ("lao", "Lao"), ("lat", "Latin"), ("lav", "Latvian"), ("lit", "Lithuanian"), ("ltz", "Luxembourgish"), ("mal", "Malayalam"), ("mar", "Marathi"),
    ("mkd", "Macedonian"), ("mlt", "Maltese"), ("mon", "Mongolian"), ("mri", "Maori"), ("msa", "Malay"), ("mya", "Burmese"), ("nep", "Nepali"),
    ("nld", "Dutch"), ("nor", "Norwegian"), ("oci", "Occitan"), ("ori", "Odia"), ("osd", "Orientation and script"), ("pan", "Punjabi"), ("pol", "Polish"),
    ("por", "Portuguese"), ("pus", "Pashto"), ("que", "Quechua"), ("ron", "Romanian"), ("rus", "Russian"), ("san", "Sanskrit"), ("sin", "Sinhala"),
    ("slk", "Slovak"), ("slv", "Slovenian"), ("snd", "Sindhi"), ("spa", "Spanish"), ("sqi", "Albanian"), ("srp", "Serbian"), ("srp_latn", "Serbian (Latin)"),
    ("sun", "Sundanese"), ("swa", "Swahili"), ("swe", "Swedish"), ("syr", "Syriac"), ("tam", "Tamil"), ("tat", "Tatar"), ("tel", "Telugu"), ("tgk", "Tajik"),
    ("tgl", "Tagalog"), ("tha", "Thai"), ("tir", "Tigrinya"), ("ton", "Tongan"), ("tur", "Turkish"), ("uig", "Uyghur"), ("ukr", "Ukrainian"), ("urd", "Urdu"),
    ("uzb", "Uzbek"), ("uzb_cyrl", "Uzbek (Cyrillic)"), ("vie", "Vietnamese"), ("yid", "Yiddish"), ("yor", "Yoruba"),
];

pub fn exe(ocr: &Path) -> PathBuf { ocr.join("tesseract").join("tesseract.exe") }
pub fn bundled_data(ocr: &Path) -> PathBuf { ocr.join("tesseract").join("tessdata") }

/// โฟลเดอร์ชุดภาษาที่มีภาษานี้ · ที่โหลดเองก่อน (อาจใหม่กว่า หรือเป็นแบบมาตรฐานที่มีเครื่องยนต์แบบเก่า) แล้วที่แนบมา · ภาษาผสมแบบ eng+tha ต้องอยู่ที่เดียวกันทุกตัว
pub fn data_dir_for(ocr: &Path, user: &Path, lang: &str) -> Option<PathBuf> {
    let has = |d: &Path| lang.split('+').all(|l| d.join(format!("{l}.traineddata")).is_file());
    [user.to_path_buf(), bundled_data(ocr)].into_iter().find(|d| has(d))
}

/// ภาษาที่มีอยู่ในเครื่อง (ไม่นับ osd) กับที่มาของแต่ละภาษา
pub fn installed(ocr: &Path, user: &Path) -> Vec<(String, &'static str)> {
    let mut out: Vec<(String, &'static str)> = vec![];
    for (d, from) in [(user.to_path_buf(), "downloaded"), (bundled_data(ocr), "bundled")] {
        for e in std::fs::read_dir(&d).into_iter().flatten().flatten() {
            let n = e.file_name().to_string_lossy().to_string();
            if let Some(code) = n.strip_suffix(".traineddata") {
                if code != "osd" && !out.iter().any(|(c, _)| c == code) { out.push((code.to_string(), from)); }
            }
        }
    }
    out.sort();
    out
}

/// ภาพที่ส่งให้ Tesseract · เผื่อขอบใส 10 จุด แล้วทำเป็นตัวดำบนพื้นขาว (ทึบตั้งแต่ 100 และค่าสว่างสุดของ RGB ตั้งแต่ 90 คือตัวหนังสือ)
/// ดูค่าสว่างสุดของสามช่อง ซับสีเหลืองหรือแดงจึงไม่หาย · ยืดภาพ sx × sy เท่าด้วยตัวย่อขยายแบบลูกบาศก์ · ตาม PrepareImage
pub fn prepare(img: &RgbaImage, sx: u32, sy: u32) -> RgbaImage {
    let (w, h) = img.dimensions();
    let mut out = RgbaImage::from_pixel(w + MARGIN * 2, h + MARGIN * 2, Rgba([255, 255, 255, 255]));
    for (x, y, p) in img.enumerate_pixels() {
        let text = p[3] >= 100 && p[0].max(p[1]).max(p[2]) >= 90;
        out.put_pixel(x + MARGIN, y + MARGIN, if text { Rgba([0, 0, 0, 255]) } else { Rgba([255, 255, 255, 255]) });
    }
    if sx <= 1 && sy <= 1 { return out; }
    image::imageops::resize(&out, out.width() * sx.max(1), out.height() * sy.max(1), image::imageops::FilterType::CatmullRom)
}

/// ผลอ่านของ Tesseract ข้อความ (บรรทัดคั่นด้วยขึ้นบรรทัดใหม่ ตัวเอียงเป็น <i>) กับความมั่นใจต่ำสุดของคำ 0–1
#[derive(Debug, Clone, PartialEq, Default)]
pub struct TessOut {
    pub text: String,
    pub conf: f32,
}

/// อ่าน hOCR ทีละบรรทัดทีละคำ · ตาม ParseHOcr ของ Subtitle Edit บวกค่า x_wconf ของคำ
pub fn parse_hocr(html: &str) -> TessOut {
    let mut sb = String::new();
    let mut confs: Vec<f32> = vec![];
    let find = |s: &str, pat: &str, from: usize| s.get(from..).and_then(|t| t.find(pat)).map(|i| i + from);
    let line_pat = "<span class='ocr_line'";
    let word_pat = "<span class='ocrx_word'";
    let mut line = find(html, line_pat, 0);
    if let Some(h) = find(html, "<span class='ocr_header'", 0) { if line.is_none_or(|l| h < l) { line = Some(h); } }
    while let Some(ls) = line {
        let max = find(html, line_pat, ls + 1).unwrap_or(html.len());
        let mut ws = find(html, word_pat, ls);
        while let Some(w) = ws.filter(|w| *w <= max) {
            if let Some(gt) = find(html, ">", w + 1) {
                let head = &html[w..gt];
                if let Some(c) = head.split("x_wconf ").nth(1).and_then(|v| v.split(|ch: char| !ch.is_ascii_digit()).next()).and_then(|v| v.parse::<f32>().ok()) { confs.push(c / 100.0); }
                if let Some(end) = find(html, "</span>", gt + 1) {
                    sb.push_str(html[gt + 1..end].trim());
                    sb.push(' ');
                }
            }
            ws = find(html, word_pat, w + 1);
        }
        sb.push('\n');
        line = find(html, line_pat, ls + 1);
    }
    let mut t = sb.replace("<em>", "<i>").replace("</em>", "</i>").replace("<strong>", "").replace("</strong>", "").replace("</i> <i>", " ").replace("</i><i>", "");
    for (a, b) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""), ("&#39;", "'"), ("&apos;", "'")] { t = t.replace(a, b); }
    t = t.replace("</i>\n<i>", "\n").replace(" \n", "\n");
    let conf = if confs.is_empty() { 0.0 } else { confs.iter().cloned().fold(f32::INFINITY, f32::min) };
    TessOut { text: t.trim().to_string(), conf }
}

/// อ่านภาพหนึ่งครั้ง · work โฟลเดอร์ทำงานของโปรแกรม (ไฟล์ภาพกับ hOCR ชั่วคราว ลบเมื่อจบ)
pub fn ocr_once(ocr: &Path, data: &Path, work: &Path, img: &RgbaImage, lang: &str, oem: u32, psm: u32, sx: u32, sy: u32) -> Result<TessOut, String> {
    let exe = exe(ocr);
    if !exe.is_file() { return Err("ไม่มี tesseract.exe ในโฟลเดอร์เครื่องมือ ลองติดตั้งโปรแกรมใหม่".into()); }
    let id = crate::poster_image::unique();
    let png = work.join(format!("tess-{id}.png"));
    let base = work.join(format!("tess-{id}"));
    prepare(img, sx, sy).save(&png).map_err(|e| format!("เขียนภาพให้ Tesseract ไม่ได้ {e}"))?;
    let args: Vec<OsString> = vec![png.clone().into(), base.clone().into(), "--tessdata-dir".into(), data.into(), "-l".into(), lang.into(),
        "--psm".into(), psm.to_string().into(), "--oem".into(), oem.to_string().into(), "-c".into(), "tessedit_create_hocr=1".into(), "-c".into(), "tessedit_create_txt=0".into()];
    // tesseract.exe อยู่โฟลเดอร์ของตัวเองพร้อม DLL ที่ต้องใช้ · เรียกด้วยที่อยู่เต็ม ไม่ผ่านโฟลเดอร์เครื่องมือหลัก
    let r = run_tool_timeout(&exe.parent().unwrap_or(Path::new(".")).to_path_buf(), "tesseract", &args, Duration::from_secs(120));
    let _ = std::fs::remove_file(&png);
    let o = r?;
    let hocr = ["hocr", "html"].iter().map(|e| base.with_extension(e)).find(|p| p.is_file());
    let text = hocr.as_ref().and_then(|p| std::fs::read_to_string(p).ok());
    for e in ["hocr", "html"] { let _ = std::fs::remove_file(base.with_extension(e)); }
    if !crate::tools::tool_succeeded("tesseract", &o.status) {
        let lines = crate::tools::tool_lines(&String::from_utf8_lossy(&o.stderr));
        let all = lines.join(" ").to_lowercase();
        if all.contains("legacy") || all.contains("tessedit_ocr_engine_mode") {
            return Err(format!("ชุดภาษา {lang} ไม่มีเครื่องยนต์แบบเก่า (Legacy) โหลดชุดภาษาแบบมาตรฐานเพิ่ม หรือเลือกโหมด LSTM"));
        }
        if all.contains("failed loading language") || all.contains("couldn't load any languages") {
            return Err(format!("ไม่มีชุดภาษา {lang} ในเครื่อง โหลดเพิ่มในหน้าต่างตัวอ่านและชุดภาษา"));
        }
        return Err(format!("Tesseract อ่านไม่สำเร็จ {}", crate::tools::explain_fail("tesseract", &lines, Some(&o.status)).line()));
    }
    Ok(text.map(|t| parse_hocr(&t)).unwrap_or_default())
}

/// ตัวนับคำของผลอ่าน (คำที่ไม่รู้จัก, คำที่ถูก, รายการคำที่ไม่รู้จัก) จากตัวแก้คำ (ขั้น 8) · None = ไม่ได้ใช้พจนานุกรม
pub type Scorer<'a> = &'a dyn Fn(&str) -> Option<(usize, usize, Vec<String>)>;

/// ผลซ้ำมีตัวเลขที่ผลแรกไม่มี (ภาพยืดอ่านจุดขอบเป็น 7 "18 months" เป็น "718 months") · ตาม RetryIntroducesDigit
pub fn retry_adds_digit(first: &str, retry: &str) -> bool {
    retry.chars().any(|c| c.is_ascii_digit() && !first.contains(c))
}

/// แยกข้อความเป็นคำสลับกับช่องว่าง (ช่องว่างอยู่ตำแหน่งคี่) แบบ Regex.Split(@"(\s+)")
fn tokens(s: &str) -> Vec<String> {
    let mut out = vec![String::new()];
    let mut ws = false;
    for c in s.chars() {
        if c.is_whitespace() != ws { out.push(String::new()); ws = !ws; }
        out.last_mut().unwrap().push(c);
    }
    out
}

/// คำของ token (ช่วงตัวอักษร ตัวเลข ' ’ -) ตรงกับคำที่ไม่รู้จักทั้งคำ · ตาม ContainsUnknownWord
fn has_unknown(token: &str, unknown: &[String]) -> bool {
    let is_w = |c: char| c.is_alphanumeric() || c == '\'' || c == '’' || c == '-';
    token.split(|c: char| !is_w(c)).filter(|w| !w.is_empty()).any(|w| unknown.iter().any(|u| u == w || u == w.trim_matches(['\'', '’', '-'])))
}

/// เอาคำจากผลซ้ำมาแทนเฉพาะคำที่ผลแรกไม่รู้จัก · สองผลแยกคำไม่ตรงกัน หรือไม่มีคำที่เปลี่ยน คืน None · ตาม MergeRetryUnknownWords
pub fn merge_unknown(first: &str, retry: &str, unknown: &[String]) -> Option<String> {
    if unknown.is_empty() { return None; }
    let (mut a, b) = (tokens(first), tokens(retry));
    if a.len() != b.len() { return None; }
    let mut changed = false;
    for i in 0..a.len() {
        if a[i] == b[i] { continue; }
        if i % 2 == 1 { return None; }
        if !has_unknown(&a[i], unknown) { continue; }
        a[i] = b[i].clone();
        changed = true;
    }
    changed.then(|| a.concat())
}

/// ค่าตั้งของตัวอ่าน Tesseract
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TessOpts {
    pub lang: String,
    pub oem: u32,
    /// อ่านทีละบรรทัด (แบ่งด้วย ocrprep) แทนอ่านทั้งภาพ · ผลเทียบกับซับ ACCA ทีละบรรทัดแม่นกว่าเล็กน้อย
    pub per_line: bool,
    /// แนวตั้ง auto on off · ภาษาญี่ปุ่นแนวตั้งใช้ jpn_vert
    pub vertical: String,
}

impl Default for TessOpts {
    fn default() -> Self { TessOpts { lang: "eng".into(), oem: 3, per_line: false, vertical: "auto".into() } }
}

/// อ่านทั้งภาพตามวิธีของ Subtitle Edit พร้อมลองซ้ำ (RetryTesseractIfNeededAsync)
pub fn read(ocr: &Path, user: &Path, work: &Path, img: &RgbaImage, o: &TessOpts, score: Option<Scorer>) -> Result<TessOut, String> {
    let vertical = crate::paddle::is_vertical(img, &o.vertical);
    let lang = if vertical && o.lang == "jpn" { "jpn_vert".to_string() } else { o.lang.clone() };
    let data = data_dir_for(ocr, user, &lang).ok_or_else(|| format!("ไม่มีชุดภาษา {lang} ในเครื่อง โหลดเพิ่มในหน้าต่างตัวอ่านและชุดภาษา"))?;
    if o.per_line && !vertical {
        let mut lines = vec![];
        let mut conf = f32::INFINITY;
        for l in crate::ocrprep::split_lines(img) {
            let r = retry(ocr, &data, work, &l.img, &lang, o.oem, PSM_LINE, score)?;
            if !r.text.is_empty() { conf = conf.min(r.conf); lines.push(r.text); }
        }
        return Ok(TessOut { text: lines.join("\n"), conf: if lines.is_empty() { 0.0 } else { conf } });
    }
    retry(ocr, &data, work, img, &lang, o.oem, if vertical { PSM_VERTICAL } else { PSM_BLOCK }, score)
}

fn retry(ocr: &Path, data: &Path, work: &Path, img: &RgbaImage, lang: &str, oem: u32, psm: u32, score: Option<Scorer>) -> Result<TessOut, String> {
    let first = ocr_once(ocr, data, work, img, lang, oem, psm, 1, 1)?;
    let blank = first.text.trim().is_empty();
    let s1 = if blank { None } else { score.and_then(|f| f(&first.text)) };
    if !blank && s1.as_ref().is_none_or(|s| s.0 == 0 && s.1 > 0) { return Ok(first); }
    let mut again = ocr_once(ocr, data, work, img, lang, oem, PSM_AUTO, 3, 2)?;
    if again.text.trim().is_empty() { again = ocr_once(ocr, data, work, img, lang, oem, PSM_LINE, 4, 2)?; }
    if again.text.trim().is_empty() { return Ok(first); }
    if blank { return Ok(again); }
    let (Some(s1), Some(f)) = (s1, score) else { return Ok(first) };
    let Some(s2) = f(&again.text) else { return Ok(first) };
    if s2.0 < s1.0 && s2.1 >= s1.1 && !retry_adds_digit(&first.text, &again.text) { return Ok(again); }
    if let Some(m) = merge_unknown(&first.text, &again.text, &s1.2) {
        if let Some(s3) = f(&m) { if s3.0 < s1.0 && s3.1 >= s1.1 { return Ok(TessOut { text: m, conf: first.conf.min(again.conf) }); } }
    }
    Ok(first)
}

// ---------------------------------------------------------------- โหลดชุดภาษาเพิ่ม

/// โหลดชุดภาษาจาก tessdata ของ Tesseract ลงโฟลเดอร์ของโปรแกรม · โหลดลงชื่อชั่วคราวแล้วย้ายเข้าชื่อจริง
/// ความคืบหน้าจากขนาดไฟล์ที่โหลดได้เทียบขนาดที่เว็บบอก · stop = กดหยุด
pub fn download(user: &Path, code: &str, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<PathBuf, String> {
    if !LANGS.iter().any(|(c, _)| *c == code) { return Err(format!("ไม่รู้จักชุดภาษา {code}")); }
    std::fs::create_dir_all(user).map_err(|e| format!("สร้างโฟลเดอร์ชุดภาษาไม่ได้ {e}"))?;
    let url = DOWNLOAD_URL.replace("{}", code);
    let sys = PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into())).join("System32");
    // ขนาดไฟล์จากหัวของคำตอบ ไว้คิดเปอร์เซ็นต์
    let head = run_tool_timeout(&sys, "curl", ["-sIL", "--max-time", "20", url.as_str()], Duration::from_secs(25)).ok();
    let total: f64 = head.map(|o| String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").and_then(|v| v.trim().parse::<f64>().ok())).last().unwrap_or(0.0)).unwrap_or(0.0);
    let part = user.join(format!("{code}.traineddata.partial"));
    let _ = std::fs::remove_file(&part);
    let mut child = tool_command(&sys, "curl", [OsString::from("-sSLf"), "--max-time".into(), "900".into(), "-o".into(), part.clone().into(), url.clone().into()])
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped())
        .spawn().map_err(|e| format!("เรียก curl ไม่ได้ {e}"))?;
    crate::winutil::kill_with_app(&child);
    let st = loop {
        if stop() { let _ = child.kill(); let _ = child.wait(); let _ = std::fs::remove_file(&part); return Err("หยุดโหลดแล้ว".into()); }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? { break st; }
        if total > 0.0 { on((std::fs::metadata(&part).map(|m| m.len() as f64).unwrap_or(0.0) / total * 100.0).min(99.0)); }
        std::thread::sleep(Duration::from_millis(250));
    };
    let mut err = String::new();
    if let Some(mut e) = child.stderr.take() { let _ = std::io::Read::read_to_string(&mut e, &mut err); }
    if !st.success() || !part.is_file() {
        let _ = std::fs::remove_file(&part);
        return Err(match st.code() {
            Some(6) | Some(7) | Some(28) => "ต่อเน็ตไม่ได้ หรือเว็บไม่ตอบ ลองใหม่อีกครั้ง".into(),
            Some(22) => format!("เว็บไม่มีชุดภาษา {code} ({})", err.trim()),
            Some(23) => "เขียนไฟล์ชุดภาษาไม่ได้ ไดรฟ์อาจเต็ม".into(),
            _ => format!("โหลดชุดภาษาไม่สำเร็จ ({})", err.trim()),
        });
    }
    let dest = user.join(format!("{code}.traineddata"));
    crate::outfile::replace_with(&part, &dest)?;
    on(100.0);
    Ok(dest)
}

// ---------------------------------------------------------------- คำสั่งให้หน้าจอ

/// โฟลเดอร์ชุดภาษาที่โหลดเอง ในโฟลเดอร์ของโปรแกรม
pub fn user_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ocr").join("tessdata"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TessLang { code: String, name: String, have: String }

/// ทุกภาษาที่โหลดได้ กับสถานะ bundled (แนบมา) downloaded (โหลดแล้ว) หรือว่าง (ยังไม่มี)
#[tauri::command]
pub fn ocr_tess_langs(app: tauri::AppHandle) -> Result<Vec<TessLang>, String> {
    let ocr = crate::tools::tools_dir(&app)?.join("ocr");
    let have = installed(&ocr, &user_dir(&app)?);
    Ok(LANGS.iter().filter(|(c, _)| *c != "osd").map(|(c, n)| TessLang {
        code: c.to_string(), name: n.to_string(), have: have.iter().find(|(h, _)| h == c).map(|(_, f)| f.to_string()).unwrap_or_default(),
    }).collect())
}

static STOP_DL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// โหลดชุดภาษาเพิ่ม · ความคืบหน้าทางเหตุการณ์ ocr-tess-progress { code percent }
#[tauri::command]
pub async fn ocr_tess_download(app: tauri::AppHandle, code: String) -> Result<(), String> {
    let user = user_dir(&app)?;
    STOP_DL.store(false, std::sync::atomic::Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let c2 = code.clone();
        download(&user, &code, &|p| { let _ = tauri::Emitter::emit(&app, "ocr-tess-progress", serde_json::json!({ "code": c2, "percent": p })); },
            &|| STOP_DL.load(std::sync::atomic::Ordering::SeqCst)).map(|_| ())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ocr_tess_cancel() { STOP_DL.store(true, std::sync::atomic::Ordering::SeqCst); }

#[cfg(test)]
mod tests {
    use super::*;

    fn ocr_dir() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools").join("ocr") }

    #[test]
    fn hocr_lines_italic_and_conf() {
        let h = "<div class='ocr_page'><span class='ocr_line' id='line_1_1'><span class='ocrx_word' id='w1' title='bbox 1 1 2 2; x_wconf 96'>Hello</span> \
<span class='ocrx_word' id='w2' title='bbox 3 3 4 4; x_wconf 61'><em>there</em></span></span>\
<span class='ocr_line' id='line_1_2'><span class='ocrx_word' id='w3' title='bbox 5 5 6 6; x_wconf 90'>Tom&amp;Jerry&#39;s</span></span></div>";
        let o = parse_hocr(h);
        assert_eq!(o.text, "Hello <i>there</i>\nTom&Jerry's");
        assert!((o.conf - 0.61).abs() < 1e-6);
        assert_eq!(parse_hocr("<html></html>"), TessOut::default());
    }

    #[test]
    fn prepare_black_on_white_with_margin() {
        let mut img = RgbaImage::new(4, 2);
        img.put_pixel(0, 0, Rgba([255, 255, 0, 255])); // เหลืองยังเป็นตัวหนังสือ
        img.put_pixel(1, 0, Rgba([40, 40, 40, 255]));  // มืด เป็นพื้น
        img.put_pixel(2, 0, Rgba([255, 255, 255, 50])); // จางเกิน เป็นพื้น
        let p = prepare(&img, 1, 1);
        assert_eq!(p.dimensions(), (24, 22));
        assert_eq!(p.get_pixel(10, 10), &Rgba([0, 0, 0, 255]));
        assert_eq!(p.get_pixel(11, 10), &Rgba([255, 255, 255, 255]));
        assert_eq!(p.get_pixel(12, 10), &Rgba([255, 255, 255, 255]));
        assert_eq!(p.get_pixel(0, 0), &Rgba([255, 255, 255, 255]));
        assert_eq!(prepare(&img, 3, 2).dimensions(), (72, 44));
    }

    #[test]
    fn retry_merge_rules() {
        assert!(retry_adds_digit("18 months", "718 months"));
        assert!(!retry_adds_digit("18 months", "81 months"));
        let unk = vec!["diedq".to_string()];
        assert_eq!(merge_unknown("He diedq, 18 months", "He died, 718 months", &unk).as_deref(), Some("He died, 18 months"));
        assert_eq!(merge_unknown("a  b", "a b", &unk), None, "ช่องว่างไม่ตรงกัน");
        assert_eq!(merge_unknown("a b", "a c", &[]), None);
        // คำที่ไม่รู้จักสั้น "l" ไม่ไปแทนคำที่ถูกทั้งประโยค
        assert_eq!(merge_unknown("hello world", "hallo warld", &["l".to_string()]), None);
    }

    #[test]
    fn langs_and_dirs() {
        assert!(LANGS.iter().any(|(c, _)| *c == "tha") && LANGS.len() > 120);
        let user = std::env::temp_dir().join(format!("ms-tess-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&user);
        assert_eq!(data_dir_for(&ocr_dir(), &user, "tha"), Some(bundled_data(&ocr_dir())));
        assert_eq!(data_dir_for(&ocr_dir(), &user, "deu"), None);
        let have: Vec<String> = installed(&ocr_dir(), &user).into_iter().map(|(c, _)| c).collect();
        assert_eq!(have, vec!["eng", "jpn", "jpn_vert", "tha"]);
    }

    /// อ่านภาพจริงด้วย tesseract.exe ที่แนบมา · ซับไทยที่รู้คำตอบ ภาพแรก "สวัสดีครับ ผู้ใหญ่บ้านอยู่ไหม" (ไม่สนเว้นวรรค)
    #[test]
    fn reads_thai_test_sub() {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr");
        if !dir.join("th.sup").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return; }
        let shows = crate::subs::parse_sup(&std::fs::read(dir.join("th.sup")).unwrap());
        let work = std::env::temp_dir();
        let user = work.join("ms-tess-none");
        let o = TessOpts { lang: "tha".into(), ..Default::default() };
        let r = read(&ocr_dir(), &user, &work, &shows[0].img, &o, None).unwrap();
        assert_eq!(r.text.split_whitespace().collect::<String>(), "สวัสดีครับผู้ใหญ่บ้านอยู่ไหม", "{r:?}");
        assert!(r.conf > 0.5);
    }
}
