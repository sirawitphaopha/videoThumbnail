//! แหล่งภาพของระบบ OCR ซับรูป (แผน OCR ขั้น 1 · BUGS ข้อ 143)
//! รวมซับรูปทุกชนิดเป็นรายการเดียว เวลาเริ่ม เวลาจบ ภาพ ตำแหน่งบนจอ ขนาดจอ ซับบังคับ และตำแหน่งแบบ ASS (\an1 ถึง \an9)
//!   PGS กับ VobSub อ่านเองด้วย subs.rs กับ vobsub.rs (ใช้ผลถอดชุดเดียวกับตัวดูซับรูป ไม่ถอดซ้ำ)
//!   BDN XML อ่านด้วย parse_bdn ของ imgconv.rs ภาพ PNG อยู่ข้างไฟล์ XML
//!   ภาพ PNG ทีละไฟล์ เวลาจากชื่อไฟล์แบบที่ Subtitle Edit อ่าน (ImportImageItem.cs)
//!   DVB DivX และชนิดอื่นให้ ffmpeg วาด (images_by_render)
//! ตำแหน่งแบบ ASS แปลจาก OcrAssaAlignment.cs ของ Subtitle Edit (MIT · Copyright (c) 2001-2026 Nikolaj Lynge Olsson
//! and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs) · ภาพสูงที่มีหลายก้อนห่างกันแยกตำแหน่งทีละบรรทัดในขั้น 2 ที่มีตัวแบ่งบรรทัดแล้ว
//! อ่านอย่างเดียว ไม่แตะไฟล์หนังและไฟล์ซับ ภาพที่ได้อยู่ในโฟลเดอร์ทำงานของโปรแกรม

use crate::subtitle::subs::SubImg;
use crate::app::tools::tools_dir;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// ภาพหนึ่งบรรทัดของ OCR
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrItem {
    #[serde(flatten)]
    pub img: SubImg,
    /// ตำแหน่งแบบ ASS 1–9 (เลขแป้นตัวเลข 2 คือกลางล่าง) · ไม่รู้ขนาดจอเป็น 2
    pub an: u8,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OcrSource {
    /// pgs vobsub bdn png other
    pub kind: String,
    pub items: Vec<OcrItem>,
    /// คู่ไฟล์ .idx .sub ของ VobSub ไว้วาดภาพใหม่ด้วยสีที่เลือก (หน้าต่างสีของ VobSub ขั้น 11)
    #[serde(skip)]
    #[allow(dead_code)] // ใช้ในหน้าต่างสีของ VobSub แผน OCR ขั้น 11
    pub vobsub: Option<(PathBuf, PathBuf)>,
}

/// ตำแหน่งบนจอแบบสัมพัทธ์ (0 ซ้ายบน 1 ขวาล่าง) เป็นช่องตาราง 3 × 3 ของ ASS · ตาม GetAssaPositionFromScreen
/// ข้อความที่ยื่นเข้าหนึ่งในสี่บนหรือล่างของจอ นับเป็นบนหรือล่าง แม้กลางข้อความอยู่แถวกลาง (สามบรรทัดของบทพูดข้างล่าง) · ยื่นเข้าทั้งสองฝั่งใช้กึ่งกลาง
pub fn an_from_screen(rel_x: f64, rel_top: f64, rel_bottom: f64) -> u8 {
    const OUTER: f64 = 0.25;
    let at_top = rel_top < OUTER;
    let at_bottom = rel_bottom > 1.0 - OUTER;
    let rel_y = if at_top == at_bottom { (rel_top + rel_bottom) / 2.0 } else if at_top { 0.0 } else { 1.0 };
    let col = if rel_x < 0.33 { 0 } else if rel_x > 0.67 { 2 } else { 1 };
    let row = if rel_y < 0.33 { 2 } else if rel_y > 0.67 { 0 } else { 1 };
    (row * 3 + col + 1) as u8
}

/// ตำแหน่งแบบ ASS ของภาพหนึ่งภาพทั้งก้อน · ภาพเต็มจอ (DVB) ใช้กรอบหมึกที่ครอปไว้แล้ว ตำแหน่งที่ได้จึงตรง
pub fn an_of(i: &SubImg) -> u8 {
    let (sw, sh) = (i.canvas[0] as f64, i.canvas[1] as f64);
    if sw <= 0.0 || sh <= 0.0 { return 2; }
    an_from_screen((i.at[0] as f64 + i.w as f64 / 2.0) / sw, i.at[1] as f64 / sh, (i.at[1] + i.h) as f64 / sh)
}

/// ภาพสูงที่มีก้อนบรรทัดวางห่างกัน (ป้ายบนจอกับบทพูดข้างล่างในภาพเดียว) ตำแหน่งแบบ ASS ทีละบรรทัดของข้อความที่อ่านได้
/// ภาพสูงไม่เกินหนึ่งในสามของจอ หรือเป็นก้อนเดียว หรือข้อความบรรทัดเดียว คืน None ให้ใช้ an_of ทั้งภาพ
/// ก้อนแยกกันเมื่อช่องว่างระหว่างบรรทัดเกิน 15% ของความสูงจอ · ข้อความมีจำนวนบรรทัดไม่เท่าภาพ จับคู่บรรทัดแรกกับแรก สุดท้ายกับสุดท้าย
/// ตาม GetImageLineBlocks กับ DetectFromPlacedImage ของ OcrAssaAlignment.cs ใน Subtitle Edit
#[allow(dead_code)] // ตัวคุมงาน OCR เรียกหลังอ่านข้อความได้ (ขั้น 10)
pub fn an_lines(img: &image::RgbaImage, i: &SubImg, text_lines: usize) -> Option<Vec<u8>> {
    let (sw, sh) = (i.canvas[0] as f64, i.canvas[1] as f64);
    if sw <= 0.0 || sh <= 0.0 || text_lines < 2 || img.height() as f64 / sh <= 0.33 { return None; }
    let one = crate::ocr::ocrprep::make_one_color(img, image::Rgba([255, 255, 255, 255]));
    let mut lines = crate::ocr::ocrprep::split_lines_transparent_or_black(&one);
    if lines.len() < 2 { lines = crate::ocr::ocrprep::split_lines_se(&one, 20); }
    if lines.is_empty() { return None; }
    let min_gap = sh * 0.15;
    let mut blocks = vec![(0f64, 0f64); lines.len()];
    let mut start = 0usize;
    for k in 1..=lines.len() {
        let bottom = (lines[k - 1].y + lines[k - 1].h) as f64;
        if k < lines.len() && lines[k].y as f64 - bottom <= min_gap { continue; }
        for b in blocks.iter_mut().take(k).skip(start) { *b = (lines[start].y as f64, bottom); }
        start = k;
    }
    if blocks[0] == blocks[blocks.len() - 1] { return None; }
    let rel_x = (i.at[0] as f64 + img.width() as f64 / 2.0) / sw;
    Some((0..text_lines).map(|t| {
        let k = (t as f64 * (blocks.len() as f64 - 1.0) / (text_lines as f64 - 1.0)).round() as usize;
        let (top, bottom) = blocks[k.min(blocks.len() - 1)];
        an_from_screen(rel_x, (i.at[1] as f64 + top) / sh, (i.at[1] as f64 + bottom) / sh)
    }).collect())
}

/// ภาพที่มีก้อนบรรทัดวางห่างกัน (ป้ายบนจอกับบทพูดข้างล่าง) ไม่ตัดบรรทัดใหม่ · HasSeparatedBlocks ของ OcrAssaAlignment.cs
pub fn has_separated_blocks(img: &image::RgbaImage, i: &SubImg) -> bool { an_lines(img, i, 2).is_some() }

fn items_of(v: Vec<SubImg>) -> Vec<OcrItem> { v.into_iter().map(|img| OcrItem { an: an_of(&img), img }).collect() }

/// ชนิดของซับรูปที่เปิด ดูจากนามสกุลกับชนิดสตรีม
fn kind_of(tools: &Path, path: &Path, ff: u64) -> &'static str {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if crate::subtitle::vobsub::pair_of(path).is_some() { return "vobsub"; }
    if ext == "sup" { return "pgs"; }
    match crate::subtitle::vobsub::stream_codec(tools, path, ff).0.as_str() {
        "hdmv_pgs_subtitle" => "pgs",
        "dvd_subtitle" => "vobsub",
        _ => "other",
    }
}

/// เปิดซับรูปเป็นรายการภาพของ OCR · progress 0–100
pub fn open(tools: &Path, work: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<OcrSource, String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if ext == "xml" { return from_bdn(work, path); }
    let kind = kind_of(tools, path, ff);
    let imgs = crate::subtitle::subs::images_with(tools, work, path, ff, on)?;
    // คู่ไฟล์ของ VobSub · เปิดไฟล์ .idx ตรงใช้คู่เดิม · ซับในหนังใช้คู่ที่ดึงไว้ในโฟลเดอร์ของผลถอด
    let vobsub = if kind == "vobsub" {
        crate::subtitle::vobsub::pair_of(path).or_else(|| {
            let dir = imgs.first()?.file.parent()?.to_path_buf();
            let (i, s) = (dir.join("track.idx"), dir.join("track.sub"));
            (i.is_file() && s.is_file()).then_some((i, s))
        })
    } else { None };
    Ok(OcrSource { kind: kind.into(), items: items_of(imgs), vobsub })
}

/// โฟลเดอร์เก็บภาพของแหล่งที่ไม่ได้ผ่านตัวถอดของตัวดูซับ (BDN PNG) · ตั้งชื่อตามไฟล์ ไฟล์เปลี่ยนได้โฟลเดอร์ใหม่
fn own_dir(work: &Path, key: &str) -> Result<PathBuf, String> {
    let d = work.join(format!("ocrsrc-{key}"));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// BDN XML กับภาพ PNG ข้างไฟล์ · เหตุการณ์ที่มีหลายภาพรวมเป็นภาพเดียวตามตำแหน่ง แล้วครอปเหลือตัวหนังสือ
pub fn from_bdn(work: &Path, xml: &Path) -> Result<OcrSource, String> {
    let raw = std::fs::read(xml).map_err(|e| format!("อ่านไฟล์ BDN XML ไม่ได้ {e}"))?;
    let (canvas, events) = crate::subtitle::imgconv::parse_bdn(&crate::subtitle::subs::decode_text(&raw).0);
    if events.is_empty() { return Err("ไฟล์ XML นี้ไม่มีภาพซับแบบ BDN".into()); }
    let base = xml.parent().unwrap_or(Path::new("."));
    let dir = own_dir(work, &crate::subtitle::subs::cache_key(xml, 0))?;
    let mut out = Vec::new();
    for ev in events {
        let mut parts = Vec::new();
        for (f, x, y, _, _) in &ev.graphics {
            if let Ok(i) = image::open(base.join(f)) { parts.push((*x, *y, i.to_rgba8())); }
        }
        if parts.is_empty() { continue; }
        let x0 = parts.iter().map(|p| p.0).min().unwrap();
        let y0 = parts.iter().map(|p| p.1).min().unwrap();
        let x1 = parts.iter().map(|p| p.0 + p.2.width()).max().unwrap();
        let y1 = parts.iter().map(|p| p.1 + p.2.height()).max().unwrap();
        let mut img = image::RgbaImage::new(x1 - x0, y1 - y0);
        for (x, y, p) in &parts { image::imageops::overlay(&mut img, p, (*x - x0) as i64, (*y - y0) as i64); }
        let cv = if canvas.0 > 0 { canvas } else { (x1.max(1920), y1.max(1080)) };
        let Some((at, img)) = crate::subtitle::subs::crop_ink(&img, (x0, y0), cv) else { continue };
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        img.save(&file).map_err(|e| format!("เก็บภาพซับไม่ได้ {e}"))?;
        out.push(SubImg { n, start: ev.start as f64 / 1000.0, end: Some(ev.end as f64 / 1000.0).filter(|e| *e > ev.start as f64 / 1000.0), w: img.width(), h: img.height(), canvas: [cv.0, cv.1], at: [at.0, at.1], forced: ev.forced, file });
    }
    if out.is_empty() { return Err("เปิดภาพในไฟล์ BDN XML ไม่ได้สักภาพ ภาพ PNG ต้องอยู่โฟลเดอร์เดียวกับไฟล์ XML".into()); }
    Ok(OcrSource { kind: "bdn".into(), items: items_of(out), vobsub: None })
}

/// เวลาเริ่มและจบจากชื่อไฟล์ภาพ (มิลลิวินาที) · ตาม ImportImageItem.cs ของ Subtitle Edit
/// แบบ ชื่อ_1000-to-2500 (มิลลิวินาที) · แบบ 0_00_01_234__0_00_03_456 (ชั่วโมง นาที วินาที มิลลิวินาที) ท้ายมีเลขภาพต่อได้
pub fn png_times(stem: &str) -> Option<(f64, f64)> {
    if stem.contains("-to-") {
        let a: Vec<&str> = stem.split("-to-").collect();
        if a.len() == 2 {
            let s = a[0].rsplit('_').next()?.parse::<f64>().ok()?;
            let e = a[1].split('_').next()?.parse::<f64>().ok()?;
            return Some((s / 1000.0, e / 1000.0));
        }
        return None;
    }
    let (l, r) = stem.split_once("__")?;
    let a: Vec<f64> = l.split('_').map(|x| x.parse().ok()).collect::<Option<_>>()?;
    let b: Vec<f64> = r.split('_').map(|x| x.parse().ok()).collect::<Option<_>>()?;
    if a.len() != 4 || b.len() < 4 { return None; }
    let t = |v: &[f64]| v[0] * 3600.0 + v[1] * 60.0 + v[2] + v[3] / 1000.0;
    Some((t(&a), t(&b[..4])))
}

/// ภาพ PNG ทีละไฟล์ เรียงตามชื่อ · ไม่รู้ตำแหน่งบนจอกับขนาดจอ (แบบ Subtitle Edit) ตำแหน่งเป็นกลางล่าง
/// ชื่อไฟล์ไม่บอกเวลา เวลาเป็นศูนย์ทุกภาพให้ผู้ใช้ตั้งเองในหน้าแก้ซับ
pub fn from_pngs(work: &Path, files: &[PathBuf]) -> Result<OcrSource, String> {
    let mut files = files.to_vec();
    files.sort_by_key(|f| f.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default());
    let key = format!("png-{}", crate::subtitle::subs::cache_key(files.first().ok_or("ยังไม่ได้เลือกภาพ")?, files.len() as u64));
    let dir = own_dir(work, &key)?;
    let mut out = Vec::new();
    for f in &files {
        let img = image::open(f).map_err(|e| format!("เปิดภาพ {} ไม่ได้ {e}", f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()))?.to_rgba8();
        let (st, en) = png_times(&f.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()).unwrap_or((0.0, 0.0));
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        img.save(&file).map_err(|e| format!("เก็บภาพซับไม่ได้ {e}"))?;
        out.push(SubImg { n, start: st, end: (en > st).then_some(en), w: img.width(), h: img.height(), canvas: [0, 0], at: [0, 0], forced: false, file });
    }
    Ok(OcrSource { kind: "png".into(), items: items_of(out), vobsub: None })
}

/// เปิดซับรูปให้หน้า OCR · ความคืบหน้าทางเหตุการณ์ subimg-progress ตัวเดียวกับตัวดูซับรูป
#[tauri::command]
pub async fn ocr_source(app: AppHandle, path: String, ff: u64) -> Result<OcrSource, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subs::work_dir(&app)?;
    let on = crate::subtitle::subs::progress_to(&app, &path, ff);
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
        let src = open(&tools, &work, &p, ff, &on)?;
        crate::ocr::ocrjob::set_source(src.items.clone());
        Ok(src)
    }).await.map_err(|e| e.to_string())?
}

/// นำเข้าภาพ PNG ทีละไฟล์ให้หน้า OCR
#[tauri::command]
pub async fn ocr_source_pngs(app: AppHandle, files: Vec<String>) -> Result<OcrSource, String> {
    let work = crate::subtitle::subs::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let src = from_pngs(&work, &files.iter().map(PathBuf::from).collect::<Vec<_>>())?;
        crate::ocr::ocrjob::set_source(src.items.clone());
        Ok(src)
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "ocrsrc_tests.rs"]
mod tests;
