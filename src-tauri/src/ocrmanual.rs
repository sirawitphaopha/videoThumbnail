//! ระบบแมนนวลของหน้า OCR (แผน OCR ขั้น 11 · BUGS ข้อ 143) จัดการฐานตัวอักษร ฐานใหม่ เปลี่ยนชื่อ แก้ตัวอักษรในฐาน ลบตัวอักษร
//! ฐานที่แก้บันทึกลงโฟลเดอร์ของผู้ใช้เสมอ ฐานที่แนบมากับโปรแกรมไม่ถูกเขียนทับ (แก้แล้วได้สำเนาในโฟลเดอร์ของผู้ใช้ชื่อเดียวกัน)
//!
//! ทำตาม ShowNOcrSettings ShowBinaryOcrSettings ของ OcrViewModel NOcrSettingsViewModel NOcrDbNewViewModel
//! NOcrDbEditViewModel BinaryOcrSettingsViewModel BinaryOcrDbEditViewModel (src/ui/Features/Ocr) ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs

use crate::ocrjob::{check_name, db_paths, ensure_parent, forget_db, load_bin, load_nocr, png_url, Dirs};
use serde::Serialize;

/// ชนิดฐานที่หน้าจอส่งมา
fn kind_ok(kind: &str) -> Result<(), String> {
    if matches!(kind, "nocr" | "binary" | "own") { Ok(()) } else { Err(format!("ไม่รู้จักชนิดฐาน {kind}")) }
}

/// มีฐานชื่อนี้แล้วไหม ทั้งของผู้ใช้และที่แนบมา
fn exists(d: &Dirs, kind: &str, name: &str) -> bool {
    let (from, user) = db_paths(d, kind, name);
    from.is_file() || user.is_file()
}

/// สร้างฐานว่างในโฟลเดอร์ของผู้ใช้ · ชื่อซ้ำไม่สร้าง แบบ NewPressed ของ Subtitle Edit
pub fn db_new(d: &Dirs, kind: &str, name: &str) -> Result<(), String> {
    kind_ok(kind)?;
    let name = name.trim();
    check_name(name)?;
    if exists(d, kind, name) { return Err(format!("มีฐานชื่อ {name} อยู่แล้ว ตั้งชื่ออื่น")); }
    let (_, user) = db_paths(d, kind, name);
    ensure_parent(&user)?;
    if kind == "binary" { crate::binocr::BinDb::empty(&user).save() } else { crate::nocr::NOcrDb::empty(&user).save() }
}

/// เปลี่ยนชื่อฐานของผู้ใช้ · ฐานที่แนบมาเปลี่ยนไม่ได้ ชื่อใหม่ซ้ำไม่เปลี่ยน แบบ RenamePressed
pub fn db_rename(d: &Dirs, kind: &str, from: &str, to: &str) -> Result<(), String> {
    kind_ok(kind)?;
    let to = to.trim();
    check_name(from)?;
    check_name(to)?;
    if from == to { return Ok(()); }
    let (_, old) = db_paths(d, kind, from);
    if !old.is_file() { return Err(format!("ฐาน {from} เป็นฐานที่แนบมากับโปรแกรม เปลี่ยนชื่อไม่ได้")); }
    if exists(d, kind, to) { return Err(format!("มีฐานชื่อ {to} อยู่แล้ว ตั้งชื่ออื่น")); }
    let (_, new) = db_paths(d, kind, to);
    // ย้ายแบบไม่ทับ · std::fs::rename บน Windows ทับไฟล์ปลายทางที่มีอยู่ (ผู้ช่วยตรวจทาน R14)
    crate::cover::rename::move_no_replace(&old, &new).map_err(|p| format!("เปลี่ยนชื่อฐานไม่ได้ {}", p.title))?;
    forget_db(kind, from);
    Ok(())
}

/// ตัวอักษรหนึ่งรูปแบบในฐาน · key คือลำดับในรายการรวม (ตัวเดี่ยวก่อน ตัวขยายจับตามหลัง แบบ OcrCharactersCombined)
/// fg bg เส้นเทียบของ nOCR ในพิกัดของตัวอักษร · png ภาพของ Binary OCR
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DbItem {
    pub key: usize,
    pub text: String,
    pub w: i32,
    pub h: i32,
    pub top: i32,
    pub italic: bool,
    pub expand: i32,
    pub fg: Vec<[i32; 4]>,
    pub bg: Vec<[i32; 4]>,
    pub png: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DbChars {
    pub name: String,
    pub total: usize,
    /// ฐานที่แนบมา ยังไม่มีสำเนาของผู้ใช้ (แก้แล้วจะได้สำเนาในโฟลเดอร์ของผู้ใช้)
    pub bundled: bool,
    /// มีไฟล์ของผู้ใช้แล้ว (เปลี่ยนชื่อและลบได้) · ฐานที่ยังไม่เคยสอนไม่มีไฟล์
    pub saved: bool,
    pub items: Vec<DbItem>,
}

fn lines(v: &[crate::nocr::NLine]) -> Vec<[i32; 4]> { v.iter().map(|l| [l.start.x, l.start.y, l.end.x, l.end.y]).collect() }

/// ภาพสองสีของ Binary OCR เป็น PNG หมึกขาวบนพื้นดำ · ตัวขยายจับวาดทุกชิ้นตามตำแหน่ง x y ของแต่ละชิ้น แบบ ToOldBitmap ของ Subtitle Edit
fn bbmp_png(b: &crate::binocr::BBmp) -> (String, i32, i32) {
    let all: Vec<&crate::binocr::BBmp> = std::iter::once(b).chain(&b.expanded).collect();
    let (x0, y0) = (all.iter().map(|p| p.x).min().unwrap_or(0), all.iter().map(|p| p.y).min().unwrap_or(0));
    let x1 = all.iter().map(|p| p.x + p.w).max().unwrap_or(1);
    let y1 = all.iter().map(|p| p.y + p.h).max().unwrap_or(1);
    let (w, h) = ((x1 - x0).max(1), (y1 - y0).max(1));
    let mut img = image::RgbaImage::from_pixel(w as u32, h as u32, image::Rgba([0, 0, 0, 255]));
    for p in &all {
        for y in 0..p.h.max(0) { for x in 0..p.w.max(0) {
            if p.colors.get((y * p.w + x) as usize).is_some_and(|c| *c > 0) {
                img.put_pixel((p.x - x0 + x) as u32, (p.y - y0 + y) as u32, image::Rgba([255, 255, 255, 255]));
            }
        } }
    }
    (png_url(&img), w, h)
}

/// ทุกรูปแบบในฐาน เรียงตามข้อความ · หน้าต่างแก้ฐานเลือกตัวอักษรแล้วเห็นทุกรูปแบบของตัวนั้น แบบ NOcrDbEditViewModel
pub fn db_chars(d: &Dirs, kind: &str, name: &str) -> Result<DbChars, String> {
    kind_ok(kind)?;
    let (from, user) = db_paths(d, kind, name);
    let saved = user.is_file();
    let bundled = !saved && from.is_file();
    let items: Vec<DbItem> = if kind == "binary" {
        let db = load_bin(d, name)?;
        db.images.iter().chain(&db.expanded).enumerate().map(|(key, b)| {
            let (png, w, h) = bbmp_png(b);
            DbItem { key, text: b.text.clone().unwrap_or_default(), w, h, top: b.y, italic: b.italic, expand: b.expand, fg: vec![], bg: vec![], png: Some(png) }
        }).collect()
    } else {
        let db = load_nocr(d, kind, name)?;
        db.chars.iter().chain(&db.expanded).enumerate().map(|(key, c)| DbItem {
            key, text: c.text.clone(), w: c.width, h: c.height, top: c.margin_top, italic: c.italic, expand: c.expand_count, fg: lines(&c.fg), bg: lines(&c.bg), png: None,
        }).collect()
    };
    Ok(DbChars { name: name.into(), total: items.len(), bundled, saved, items })
}

/// แก้ข้อความกับตัวเอียงของรูปแบบที่ key · ข้อความว่างไม่บันทึก แบบ Update ของ NOcrDbEditViewModel
/// text_was ต้องตรงกับข้อความเดิม กันฐานเปลี่ยนไประหว่างเปิดหน้าต่าง
pub fn db_char_update(d: &Dirs, kind: &str, name: &str, key: usize, text_was: &str, text: &str, italic: bool) -> Result<(), String> {
    kind_ok(kind)?;
    if text.trim().is_empty() { return Err("ข้อความของตัวอักษรว่างไม่ได้".into()); }
    if kind == "binary" {
        let mut db = load_bin(d, name)?;
        let n = db.images.len();
        let b = if key < n { db.images.get_mut(key) } else { db.expanded.get_mut(key - n) }.ok_or("หาตัวนี้ในฐานไม่เจอ เปิดหน้าต่างใหม่")?;
        if b.text.as_deref().unwrap_or("") != text_was { return Err("ฐานเปลี่ยนไประหว่างเปิดหน้าต่าง เปิดหน้าต่างใหม่".into()); }
        b.text = Some(text.into());
        b.italic = italic;
        ensure_parent(&db.file)?;
        db.save()?;
    } else {
        let mut db = load_nocr(d, kind, name)?;
        let n = db.chars.len();
        let c = if key < n { db.chars.get_mut(key) } else { db.expanded.get_mut(key - n) }.ok_or("หาตัวนี้ในฐานไม่เจอ เปิดหน้าต่างใหม่")?;
        if c.text != text_was { return Err("ฐานเปลี่ยนไประหว่างเปิดหน้าต่าง เปิดหน้าต่างใหม่".into()); }
        c.text = text.into();
        c.italic = italic;
        ensure_parent(&db.file)?;
        db.save()?;
    }
    forget_db(kind, name);
    Ok(())
}

/// ลบรูปแบบที่ key ออกจากฐาน แบบ Delete ของ NOcrDbEditViewModel
pub fn db_char_delete(d: &Dirs, kind: &str, name: &str, key: usize, text_was: &str) -> Result<(), String> {
    kind_ok(kind)?;
    if kind == "binary" {
        let mut db = load_bin(d, name)?;
        let n = db.images.len();
        let k = if key < n { db.images.get(key) } else { db.expanded.get(key - n) }.ok_or("หาตัวนี้ในฐานไม่เจอ เปิดหน้าต่างใหม่")?;
        if k.text.as_deref().unwrap_or("") != text_was { return Err("ฐานเปลี่ยนไประหว่างเปิดหน้าต่าง เปิดหน้าต่างใหม่".into()); }
        db.remove(&k.key());
        ensure_parent(&db.file)?;
        db.save()?;
    } else {
        let mut db = load_nocr(d, kind, name)?;
        let n = db.chars.len();
        let c = if key < n { db.chars.get(key) } else { db.expanded.get(key - n) }.ok_or("หาตัวนี้ในฐานไม่เจอ เปิดหน้าต่างใหม่")?;
        if c.text != text_was { return Err("ฐานเปลี่ยนไประหว่างเปิดหน้าต่าง เปิดหน้าต่างใหม่".into()); }
        if key < n { db.chars.remove(key); } else { db.expanded.remove(key - n); }
        db.clear_cache();
        ensure_parent(&db.file)?;
        db.save()?;
    }
    forget_db(kind, name);
    Ok(())
}

// ---------------------------------------------------------------- ฝึกจากฟอนต์ ย่อฐาน

static STOP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// ค่าของหน้าต่างฝึกจากฟอนต์ · ตาม NOcrTrainViewModel · base ว่างคือเริ่มจากฐานว่าง · kind own ใช้ชุดพยางค์ไทยของตัวสอนเอง (ไม่ใช้ chars merged)
#[derive(serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrainReq {
    pub kind: String,
    pub name: String,
    pub base: String,
    pub overwrite: bool,
    pub fonts: Vec<String>,
    pub sizes: Vec<f32>,
    pub bold: bool,
    pub italic: bool,
    pub lines: usize,
    pub chars: String,
    pub merged: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrainTick { pub percent: f64, pub font: String, pub size: f32, pub text: String, pub learned: usize, pub skipped: usize }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrainDone { pub name: String, pub learned: usize, pub skipped: usize, pub total: usize, pub stopped: bool }

/// ขนาดฟอนต์จากข้อความ "30, 40" · 10 ถึง 200 ไม่ซ้ำ · ตาม ParseFontSizes
/// หน้าต่างฝึกจากฟอนต์ (OcrTrainDialog.tsx) แยกขนาดด้วยกติกาเดียวกันแล้วส่งเป็นตัวเลข ตัวนี้เหลือไว้เป็นต้นแบบให้เทสเทียบ จึงสร้างเฉพาะตอนเทส (ตัวจริงเตือนว่าไม่ถูกเรียก)
#[cfg(test)]
pub fn parse_sizes(s: &str) -> Vec<f32> {
    let mut v: Vec<f32> = vec![];
    for t in s.split([',', ';', ' ']) {
        if let Ok(x) = t.trim().parse::<f32>() { if (10.0..=200.0).contains(&x) && !v.contains(&x) { v.push(x); } }
    }
    v
}

/// ฝึกฐานจากฟอนต์ในเครื่อง ทุกขนาดที่ตั้ง แล้วบันทึกฐาน (หยุดกลางทางบันทึกเท่าที่ได้ แบบ Subtitle Edit) · ตาม StartOrAbortTraining
pub fn train(d: &Dirs, r: &TrainReq, tick: &dyn Fn(&TrainTick)) -> Result<TrainDone, String> {
    if !matches!(r.kind.as_str(), "nocr" | "own") { return Err("ฝึกจากฟอนต์ได้เฉพาะฐาน nOCR กับตัวสอนเอง".into()); }
    let name = r.name.trim();
    check_name(name)?;
    if r.fonts.is_empty() { return Err("เลือกฟอนต์อย่างน้อยหนึ่งตัว".into()); }
    if r.sizes.is_empty() { return Err("ใส่ขนาดฟอนต์ 10 ถึง 200 อย่างน้อยหนึ่งขนาด คั่นด้วยจุลภาค".into()); }
    let (_, user) = db_paths(d, &r.kind, name);
    if user.is_file() && !r.overwrite && r.base != name { return Err(format!("มีฐานชื่อ {name} อยู่แล้ว")); }
    let stamp0 = stamp(&user);
    let mut db = if r.base.is_empty() { crate::nocr::NOcrDb::empty(&user) } else { let mut b = load_nocr(d, &r.kind, &r.base)?; b.file = user.clone(); b };
    std::fs::create_dir_all(&d.work).map_err(|e| e.to_string())?;
    STOP.store(false, std::sync::atomic::Ordering::SeqCst);
    let stop = || STOP.load(std::sync::atomic::Ordering::SeqCst);
    let (mut learned, mut skipped) = (0usize, 0usize);
    if r.kind == "own" {
        let steps = (r.fonts.len() * r.sizes.len()).max(1);
        let mut rng = crate::nocr_lines::Rng::from_time();
        let mut done = 0;
        'outer: for size in &r.sizes {
            for font in &r.fonts {
                if stop() { break 'outer; }
                tick(&TrainTick { percent: done as f64 * 100.0 / steps as f64, font: font.clone(), size: *size, text: String::new(), learned, skipped });
                let (n, sk) = crate::ownocr::train_font(&d.tools, &d.work, &mut db, font, *size, r.bold, r.italic, r.lines, crate::nocr_lines::Algo::Random, &mut rng)?;
                learned += n;
                skipped += sk.len();
                done += 1;
            }
        }
    } else {
        let per = r.chars.chars().filter(|c| !c.is_whitespace()).count() + r.merged.split(' ').filter(|m| m.trim().chars().count() > 1).count();
        let total = (per * r.fonts.len() * r.sizes.len()).max(1);
        let step = std::cell::Cell::new(0usize);
        for size in &r.sizes {
            if stop() { break; }
            let o = crate::nocr_train::TrainOpts { fonts: r.fonts.clone(), size: *size, bold: r.bold, italic: r.italic, lines: r.lines, chars: r.chars.clone(), merged: r.merged.clone(), ..Default::default() };
            let (l0, s0) = (learned, skipped);
            let last = std::cell::Cell::new((0usize, 0usize));
            crate::nocr_train::train(&d.tools, &d.work, &o, &mut db, &stop, &|p| {
                step.set(step.get() + 1);
                last.set((p.learned, p.skipped));
                tick(&TrainTick { percent: (step.get() as f64 * 100.0 / total as f64).min(100.0), font: p.font.clone(), size: *size, text: p.text.clone(), learned: l0 + p.learned, skipped: s0 + p.skipped });
            })?;
            learned = l0 + last.get().0;
            skipped = s0 + last.get().1;
        }
    }
    ensure_parent(&user)?;
    unchanged(&user, stamp0)?;
    db.save()?;
    forget_db(&r.kind, name);
    Ok(TrainDone { name: name.into(), learned, skipped, total: db.total(), stopped: stop() })
}

/// ภาพตัวอย่างของฟอนต์ที่ชี้ · วาดตัวอักษรแรก ๆ ของชุดที่ฝึกด้วยตัววาดเดียวกับตอนฝึก
pub fn train_preview(d: &Dirs, font: &str, size: f32, bold: bool, italic: bool, text: &str) -> Result<String, String> {
    std::fs::create_dir_all(&d.work).map_err(|e| e.to_string())?;
    let t: String = text.chars().filter(|c| !c.is_whitespace()).take(26).collect();
    if t.is_empty() { return Err("ยังไม่มีตัวอักษรที่จะฝึก".into()); }
    let r = crate::nocr_train::render_with(&d.tools, &d.work, &[t], "", 1.0, font, size.clamp(10.0, 60.0), bold, italic)?;
    let two = r.into_iter().next().flatten().map(|x| x.two).ok_or("วาดตัวอย่างของฟอนต์นี้ไม่ได้")?;
    // ภาพที่วาดกว้างกว่าตัวอักษรมาก ตัดส่วนใสรอบตัวออก ตัวอย่างจึงไม่ถูกย่อจนเล็ก
    Ok(png_url(&crate::ocrprep::crop_transparent(&two).0))
}

/// ย่อฐาน nOCR · สำรองไฟล์เดิมเป็น .bak ชื่อที่ยังว่างก่อน แล้วเอาเส้นที่ไม่ช่วยแยกตัวคล้ายออก · ตาม OptimizeNOcrDb
pub fn optimize(d: &Dirs, name: &str, max_wrong: i32, tick: &(dyn Fn(usize, usize) + Sync)) -> Result<(crate::nocr_train::OptimizeResult, String), String> {
    check_name(name)?;
    let (from, user) = db_paths(d, "nocr", name);
    if !from.is_file() { return Err(format!("ฐาน {name} ยังไม่มีไฟล์ ไม่มีอะไรให้ย่อ")); }
    ensure_parent(&user)?;
    let backup = crate::nocr_train::free_backup_name(&user);
    std::fs::copy(&from, &backup).map_err(|e| format!("สำรองฐานก่อนย่อไม่ได้ {e}"))?;
    let stamp0 = stamp(&user);
    let mut db = load_nocr(d, "nocr", name)?;
    let o = crate::nocr_train::OptimizeOpts { max_wrong: crate::nocr_train::OptimizeOpts::default().max_wrong.max(max_wrong * 2), ..Default::default() };
    std::fs::create_dir_all(&d.work).map_err(|e| e.to_string())?;
    let (glyphs, fonts) = crate::nocr_train::validation_glyphs(&d.tools, &d.work, &db, &o)?;
    STOP.store(false, std::sync::atomic::Ordering::SeqCst);
    let res = crate::nocr_train::optimize(&mut db, &glyphs, fonts, &o, &|| STOP.load(std::sync::atomic::Ordering::SeqCst), tick).ok_or("หยุดย่อฐานแล้ว ฐานไม่เปลี่ยน")?;
    unchanged(&user, stamp0)?;
    db.save()?;
    forget_db("nocr", name);
    Ok((res, backup.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default()))
}

/// ขนาดกับเวลาแก้ของไฟล์ฐาน · ไม่มีไฟล์คือ None
fn stamp(p: &std::path::Path) -> Option<(u64, std::time::SystemTime)> {
    std::fs::metadata(p).ok().and_then(|m| Some((m.len(), m.modified().ok()?)))
}

/// ฝึกหรือย่อฐานใช้เวลาหลายนาที ถือสำเนาที่โหลดตอนเริ่ม · ระหว่างนั้นฐานถูกบันทึกจากที่อื่น (สอนตัวอักษรจากหน้า OCR) ไม่บันทึกทับ บอกให้ทำใหม่
/// เดิมบันทึกทับ ตัวที่สอนระหว่างนั้นหาย (ผู้ช่วยตรวจทาน R9)
fn unchanged(p: &std::path::Path, at_start: Option<(u64, std::time::SystemTime)>) -> Result<(), String> {
    if stamp(p) != at_start { return Err("ฐานนี้ถูกบันทึกจากที่อื่นระหว่างทำงาน (เช่นสอนตัวอักษรจากหน้า OCR) ไม่บันทึกทับ ทำใหม่อีกครั้ง".into()); }
    Ok(())
}

// ---------------------------------------------------------------- คำสั่งของหน้าจอ

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_new(app: tauri::AppHandle, kind: String, name: String) -> Result<(), String> { db_new(&Dirs::of(&app)?, &kind, &name) }

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_rename(app: tauri::AppHandle, kind: String, from: String, to: String) -> Result<(), String> { db_rename(&Dirs::of(&app)?, &kind, &from, &to) }

#[tauri::command]
pub async fn ocr_db_chars(app: tauri::AppHandle, kind: String, name: String) -> Result<DbChars, String> {
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || db_chars(&d, &kind, &name)).await.map_err(|e| e.to_string())?
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_char_update(app: tauri::AppHandle, kind: String, name: String, key: usize, was: String, text: String, italic: bool) -> Result<(), String> {
    db_char_update(&Dirs::of(&app)?, &kind, &name, key, &was, &text, italic)
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_char_delete(app: tauri::AppHandle, kind: String, name: String, key: usize, was: String) -> Result<(), String> {
    db_char_delete(&Dirs::of(&app)?, &kind, &name, key, &was)
}


#[tauri::command]
pub async fn ocr_train(app: tauri::AppHandle, req: TrainReq) -> Result<TrainDone, String> {
    use tauri::Emitter;
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || train(&d, &req, &|t| { let _ = app.emit("ocr-train-progress", t); })).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ocr_train_cancel() { STOP.store(true, std::sync::atomic::Ordering::SeqCst); }

#[tauri::command]
pub async fn ocr_train_preview(app: tauri::AppHandle, font: String, size: f32, bold: bool, italic: bool, text: String) -> Result<String, String> {
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || train_preview(&d, &font, size, bold, italic, &text)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeDone { pub lines_before: usize, pub lines_after: usize, pub entries: usize, pub backup: String }

#[tauri::command]
pub async fn ocr_db_optimize(app: tauri::AppHandle, name: String, max_wrong: i32) -> Result<OptimizeDone, String> {
    use tauri::Emitter;
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (r, backup) = optimize(&d, &name, max_wrong, &|done, total| { if done % 50 == 0 || done == total { let _ = app.emit("ocr-optimize-progress", (done, total)); } })?;
        Ok(OptimizeDone { lines_before: r.lines_before, lines_after: r.lines_after, entries: r.entries, backup })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn dirs(tag: &str) -> Dirs {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        let tmp = std::env::temp_dir().join(format!("movie-shelf-ocrmanual-{tag}"));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        Dirs { ocr: root.join("ocr"), tools: root, user: tmp.join("user"), work: tmp.join("work") }
    }

    /// ฝึกฐานใหม่จากฟอนต์ Arial ตัวอักษรไม่กี่ตัว ได้ไฟล์ของผู้ใช้ ชื่อซ้ำไม่ทับเว้นสั่งทับ · ขนาดฟอนต์จากข้อความ · ย่อฐานสำรองไฟล์เดิม
    #[test]
    fn train_and_optimize_small_db() {
        let d = dirs("train");
        if !d.tools.join("ffmpeg.exe").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี ffmpeg"); return; }
        assert_eq!(parse_sizes("30, 40;40 5 300 x 24.5"), vec![30.0, 40.0, 24.5]);
        let req = TrainReq { kind: "nocr".into(), name: "ฝึก".into(), base: String::new(), overwrite: false, fonts: vec!["Arial".into()], sizes: vec![30.0], bold: false, italic: false, lines: 30, chars: "abcXYZ1".into(), merged: String::new() };
        let ticks = std::cell::Cell::new(0);
        let r = train(&d, &req, &|_| ticks.set(ticks.get() + 1)).unwrap();
        assert!(r.learned >= 5 && r.total == r.learned && !r.stopped && ticks.get() >= 7, "{r:?} {}", ticks.get());
        assert!(d.user.join("nocr").join("ฝึก.nocr").is_file());
        assert!(train(&d, &req, &|_| {}).unwrap_err().contains("อยู่แล้ว"));
        assert!(train(&d, &TrainReq { fonts: vec![], ..req.clone() }, &|_| {}).is_err());
        assert!(train(&d, &TrainReq { kind: "binary".into(), ..req.clone() }, &|_| {}).is_err());
        // ต่อจากฐานเดิม ตัวที่อ่านได้แล้วไม่ฝึกซ้ำ
        let r2 = train(&d, &TrainReq { base: "ฝึก".into(), ..req.clone() }, &|_| {}).unwrap();
        assert!(r2.learned < r.learned, "{r2:?}");
        assert!(train_preview(&d, "Arial", 30.0, false, false, "abc").unwrap().starts_with("data:image/png"));
        let (o, backup) = optimize(&d, "ฝึก", 25, &|_, _| {}).unwrap();
        assert!(o.lines_after <= o.lines_before && backup.ends_with(".bak"), "{o:?} {backup}");
        assert!(d.user.join("nocr").join(&backup).is_file());
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ฐานใหม่ ชื่อซ้ำ ชื่อพาออกนอกโฟลเดอร์ เปลี่ยนชื่อ ฐานที่แนบมาเปลี่ยนชื่อไม่ได้
    #[test]
    fn new_and_rename() {
        let d = dirs("new");
        let none = db_chars(&d, "own", "ยังไม่มี").unwrap();
        assert!(!none.bundled && !none.saved && none.total == 0, "ฐานที่ยังไม่มีไฟล์ไม่ใช่ฐานที่แนบมา");
        db_new(&d, "nocr", "ทดสอบ").unwrap();
        assert!(d.user.join("nocr").join("ทดสอบ.nocr").is_file());
        assert!(db_chars(&d, "nocr", "ทดสอบ").unwrap().saved);
        assert!(db_new(&d, "nocr", "ทดสอบ").unwrap_err().contains("อยู่แล้ว"));
        assert!(db_new(&d, "nocr", "Latin").unwrap_err().contains("อยู่แล้ว"), "ชื่อเดียวกับฐานที่แนบมา");
        assert!(db_new(&d, "nocr", "../x").is_err());
        assert!(db_new(&d, "nocr", "  ").is_err());
        db_new(&d, "binary", "ทดสอบ").unwrap();
        assert!(d.user.join("binary").join("ทดสอบ.db").is_file());
        db_rename(&d, "nocr", "ทดสอบ", "ใหม่").unwrap();
        assert!(!d.user.join("nocr").join("ทดสอบ.nocr").exists() && d.user.join("nocr").join("ใหม่.nocr").is_file());
        assert!(db_rename(&d, "nocr", "Latin", "อื่น").unwrap_err().contains("แนบมา"));
        db_new(&d, "nocr", "สอง").unwrap();
        assert!(db_rename(&d, "nocr", "ใหม่", "สอง").unwrap_err().contains("อยู่แล้ว"));
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ฐาน Latin ที่แนบมา แก้ตัวแรกแล้วได้สำเนาในโฟลเดอร์ของผู้ใช้ ฐานที่แนบมาไม่ถูกแตะ · ลบแล้วจำนวนลดหนึ่ง
    #[test]
    fn edit_bundled_db_writes_user_copy() {
        let d = dirs("edit");
        let bundled = d.ocr.join("Ocr").join("Latin.nocr");
        if !bundled.is_file() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มีฐาน Latin"); return; }
        let before = std::fs::read(&bundled).unwrap();
        let a = db_chars(&d, "nocr", "Latin").unwrap();
        assert!(a.bundled && !a.saved && a.total > 100);
        let first = a.items[0].clone();
        assert!(!first.fg.is_empty() || !first.bg.is_empty(), "nOCR มีเส้นเทียบ");
        assert!(db_char_update(&d, "nocr", "Latin", 0, "ไม่ใช่ข้อความเดิม", "Q", false).is_err());
        assert!(db_char_update(&d, "nocr", "Latin", 0, &first.text, " ", false).is_err());
        db_char_update(&d, "nocr", "Latin", 0, &first.text, "Q", true).unwrap();
        let b = db_chars(&d, "nocr", "Latin").unwrap();
        assert!(!b.bundled && b.saved && b.items[0].text == "Q" && b.items[0].italic && b.total == a.total);
        assert_eq!(std::fs::read(&bundled).unwrap(), before, "ฐานที่แนบมาต้องไม่ถูกเขียนทับ");
        db_char_delete(&d, "nocr", "Latin", 0, "Q").unwrap();
        assert_eq!(db_chars(&d, "nocr", "Latin").unwrap().total, a.total - 1);
        // Binary OCR ฐาน Latin มีภาพ
        let bi = db_chars(&d, "binary", "Latin").unwrap();
        assert!(bi.total > 100 && bi.items[0].png.as_deref().is_some_and(|p| p.starts_with("data:image/png")));
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }
}
