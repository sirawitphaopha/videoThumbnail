//! ตัวคุมงาน OCR (แผน OCR ขั้น 10 · BUGS ข้อ 143)
//! หน้าจอเดินทีละภาพแบบงานแปลงเสียง (convert.rs) Rust อ่านหนึ่งภาพต่อหนึ่งคำสั่ง จึงหยุดชั่วคราว อ่านต่อ และอ่านเฉพาะบรรทัดที่เลือก ได้จากฝั่งหน้าจอ
//! ตัวอ่านแบบเทียบภาพ (nOCR Binary OCR ตัวสอนเอง) ที่เปิดหยุดสอนไว้ เจอตัวที่ฐานไม่รู้จัก คืนคำขอสอนแทนผล หน้าจอเปิดหน้าต่างสอนแล้วส่งคำตอบกลับ
//!   จำตัวนี้ ใช้ครั้งเดียว ข้ามใส่ * หยุด แล้วหน้าจออ่านภาพเดิมซ้ำ · ตาม RunNOcrLoop กับ RunBinaryImageCompareOcrLoop ของ Subtitle Edit
//! ฐานที่สอนบันทึกทันทีลงโฟลเดอร์ของผู้ใช้ (app_local_data/ocr) ฐานที่แนบมาในตัวติดตั้งไม่ถูกแก้ ครั้งต่อไปเปิดฐานของผู้ใช้ก่อน
//! หลังอ่าน ตัวแก้คำ OCR (ocrfix.rs) แก้ข้อความ ตัวชี้จุดสงสัย (suspect.rs) ติดเหตุ และหาตำแหน่งแบบ ASS ทีละบรรทัด (ocrsrc.rs an_lines)
//! อ่านภาพจากโฟลเดอร์ทำงานของโปรแกรมอย่างเดียว ไม่แตะไฟล์หนังและไฟล์ซับ

use crate::ocr::binocr::{BinDb, BinOpts, BinReader};
use crate::ocr::nocr::{Bmp, NChar, NLine, NOcrDb, Piece};
use crate::ocr::nocr_lines::{generate, Algo, Rng};
use crate::ocr::nocr_text::{LineRead, NOcrReader, ReadOpts, ReadOut};
use crate::ocr::ocrfix::{Ctx, FixEngine, Hunspell, NoSpell, Spell};
use crate::ocr::ocrprep::Prep;
use crate::ocr::ocrsrc::OcrItem;
use crate::ocr::ownocr::{OwnOpts, OwnReader};
use crate::ocr::paddle::PaddleOpts;
use crate::ocr::suspect::Reason;
use crate::ocr::tesseract::TessOpts;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

// ---------------------------------------------------------------- ค่าตั้ง

/// ค่าตั้งของงาน OCR ที่หน้าจอส่งมาทุกคำสั่ง · ค่าตั้งต้นตาม SeOcr ของ Subtitle Edit เว้นที่บอกว่าแคลร์ตั้ง
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct OcrCfg {
    /// ตัวหลัก paddle tesseract nocr binary own · ค่าตั้งต้น paddle (แม่นสุดในผลเทียบ ACCA)
    pub engine: String,
    pub paddle: PaddleOpts,
    pub tess: TessOpts,
    /// ชื่อฐาน nOCR ไม่มีนามสกุล
    pub nocr_db: String,
    /// จุดผิดที่ยอมของ nOCR และตัวสอนเอง
    pub max_wrong: i32,
    /// ลองบิดตัวเอียงตอนจับคู่ไม่ได้
    pub italic: bool,
    /// จุดที่นับเป็นเว้นวรรคของ nOCR · 0 ตัดสินเอง
    pub space_px: i32,
    /// ทางสุดท้ายเดาตัวที่ใกล้ที่สุด (หน้าจอของ Subtitle Edit ปิด)
    pub last_ditch: bool,
    pub bin_db: String,
    /// เปอร์เซ็นต์ผิดสูงสุดของ Binary OCR (0–1)
    pub bin_max_err: f64,
    pub bin_space_px: i32,
    /// ชื่อฐานของตัวสอนเอง
    pub own_db: String,
    /// ฐานสำรองข้ามตัวอ่าน nOCR กับ Binary OCR
    pub fallback: bool,
    /// เจอตัวที่ไม่รู้จักหยุดให้สอน · ปิดใส่ * แทน
    pub teach: bool,
    /// จำนวนเส้นที่วาดเองตอนสอน (NOcrNoOfLinesToAutoDraw) กับวิธีวาด
    pub lines: usize,
    pub algo: Algo,
    /// ตัวช่วยตรวจ paddle:tiny paddle:small paddle:medium tesseract nocr binary own · ชี้จุดอย่างเดียว ไม่แก้ข้อความ
    pub helpers: Vec<String>,
    pub prep: Prep,
    /// ใช้ตัวแก้คำ OCR
    pub fix: bool,
    /// ภาษาของรายการแก้คำ (รหัสสามตัว eng tha)
    pub lang3: String,
    /// พจนานุกรม Hunspell (en_US) · ว่างคือไม่ตรวจคำ
    pub dict: String,
    /// เดาคำที่ไม่รู้จัก
    pub guess: bool,
    /// เกณฑ์ค่าความมั่นใจของ PaddleOCR (suspect.rs CONF_MIN)
    pub conf_min: f32,
    /// ตัดบรรทัดเองเมื่ออ่านได้เกินสองบรรทัด (DoAutoBreak ของ Subtitle Edit ค่าตั้งต้นเปิด · ocrbreak.rs)
    pub auto_break: bool,
}

impl Default for OcrCfg {
    fn default() -> Self {
        OcrCfg {
            engine: "paddle".into(), paddle: PaddleOpts::default(), tess: TessOpts::default(),
            nocr_db: "Latin".into(), max_wrong: 25, italic: true, space_px: 0, last_ditch: false,
            bin_db: "Latin".into(), bin_max_err: 0.5, bin_space_px: 12, own_db: "Thai".into(),
            fallback: false, teach: true, lines: 60, algo: Algo::Random, helpers: vec![], prep: Prep::default(),
            fix: true, lang3: "eng".into(), dict: "en_US".into(), guess: true, conf_min: crate::ocr::suspect::CONF_MIN,
            auto_break: true,
        }
    }
}

/// โฟลเดอร์ที่ตัวคุมงานใช้ · ocr ของที่แนบมา (tools/ocr) · user ของผู้ใช้ (ฐานที่สอน ชุดภาษาที่โหลด พจนานุกรมของผู้ใช้) · work ภาพชั่วคราว
#[derive(Clone)]
pub struct Dirs {
    /// ffmpeg ที่ใช้วาดตัวอักษรตอนฝึกจากฟอนต์ (หน้าต่างฝึกจากฟอนต์ ขั้น 11)
    #[allow(dead_code)]
    pub tools: PathBuf,
    pub ocr: PathBuf,
    pub user: PathBuf,
    pub work: PathBuf,
}

impl Dirs {
    pub fn of(app: &tauri::AppHandle) -> Result<Dirs, String> {
        use tauri::Manager;
        let tools = crate::app::tools::tools_dir(app)?;
        let user = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ocr");
        // โมเดลภาษาของ PaddleOCR ที่ผู้ใช้โหลดเอง (BUGS ข้อ 152)
        crate::ocr::paddle::set_user_dir(user.join("paddle"));
        Ok(Dirs { ocr: tools.join("ocr"), tools, user, work: crate::subtitle::subs::work_dir(app)? })
    }
}

// ---------------------------------------------------------------- ฐาน

/// ชนิดฐาน nocr binary own → โฟลเดอร์ย่อยกับนามสกุล
fn db_kind(kind: &str) -> (&'static str, &'static str) {
    match kind { "binary" => ("binary", "db"), "own" => ("own", "nocr"), _ => ("nocr", "nocr") }
}

/// ชื่อฐานต้องเป็นชื่อไฟล์ล้วน กันชื่อที่พาออกนอกโฟลเดอร์
pub(crate) fn check_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") { return Err(format!("ชื่อฐาน \"{name}\" ใช้ไม่ได้")); }
    Ok(())
}

/// ที่เปิดกับที่บันทึกของฐาน · มีฐานของผู้ใช้เปิดฐานของผู้ใช้ ไม่มีเปิดฐานที่แนบมา · บันทึกลงโฟลเดอร์ของผู้ใช้เสมอ
pub fn db_paths(d: &Dirs, kind: &str, name: &str) -> (PathBuf, PathBuf) {
    let (sub, ext) = db_kind(kind);
    let user = d.user.join(sub).join(format!("{name}.{ext}"));
    let bundled = d.ocr.join("Ocr").join(format!("{name}.{ext}"));
    (if user.is_file() || !bundled.is_file() { user.clone() } else { bundled }, user)
}

pub(crate) fn load_nocr(d: &Dirs, kind: &str, name: &str) -> Result<NOcrDb, String> {
    check_name(name)?;
    let (from, to) = db_paths(d, kind, name);
    let mut db = if from.is_file() { NOcrDb::load(&from)? } else { NOcrDb::empty(&to) };
    db.file = to;
    Ok(db)
}

pub(crate) fn load_bin(d: &Dirs, name: &str) -> Result<BinDb, String> {
    check_name(name)?;
    let (from, to) = db_paths(d, "binary", name);
    let mut db = if from.is_file() { BinDb::load(&from)? } else { BinDb::empty(&to) };
    db.file = to;
    Ok(db)
}

pub(crate) fn ensure_parent(f: &Path) -> Result<(), String> {
    if let Some(p) = f.parent() { std::fs::create_dir_all(p).map_err(|e| format!("สร้างโฟลเดอร์เก็บฐานไม่ได้ {e}"))?; }
    Ok(())
}

/// รายชื่อฐานที่มี ทั้งที่แนบมาและของผู้ใช้
#[derive(Serialize, Clone, Debug, Default)]
pub struct DbList { pub nocr: Vec<String>, pub binary: Vec<String>, pub own: Vec<String> }

pub fn db_list(d: &Dirs) -> DbList {
    let merge = |mut a: Vec<String>, b: Vec<String>| { for x in b { if !a.contains(&x) { a.push(x); } } a.sort(); a };
    DbList {
        nocr: merge(crate::ocr::nocr::databases(&d.ocr.join("Ocr")), crate::ocr::nocr::databases(&d.user.join("nocr"))),
        binary: merge(crate::ocr::binocr::databases(&d.ocr.join("Ocr")), crate::ocr::binocr::databases(&d.user.join("binary"))),
        own: crate::ocr::nocr::databases(&d.user.join("own")),
    }
}

// ---------------------------------------------------------------- พจนานุกรม

/// พจนานุกรม Hunspell · ของผู้ใช้ก่อน (โหลดเพิ่ม) แล้วที่แนบมา (tools/ocr/hunspell ชุด LibreOffice)
/// ไม่ใช้ชุดในโฟลเดอร์ Dictionaries ของ Subtitle Edit เพราะ spellbook อ่านเครื่องหมายคำแบบตัวเลขของชุดนั้นไม่ครบ (เทส bundled_hunspell_knows_inflected_words)
fn open_spell(d: &Dirs, five: &str) -> Option<Box<dyn Spell>> {
    if five.is_empty() || five.contains(['/', '\\']) { return None; }
    for dir in [d.user.join("hunspell"), d.ocr.join("hunspell")] {
        let (aff, dic) = (dir.join(format!("{five}.aff")), dir.join(format!("{five}.dic")));
        if aff.is_file() && dic.is_file() {
            if let Ok(h) = Hunspell::open(&aff, &dic) { return Some(Box::new(h)); }
        }
    }
    None
}

// ---------------------------------------------------------------- คำสั่งของหน้าจอ

fn with_session<T>(f: impl FnOnce(&mut Session) -> Result<T, String>) -> Result<T, String> {
    let mut g = session();
    let s = g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?;
    f(s)
}

/// อ่านภาพลำดับ index (นับจาก 0) · ผลหรือคำขอสอน
#[tauri::command]
pub async fn ocr_read(app: tauri::AppHandle, index: usize, cfg: OcrCfg) -> Result<ReadResult, String> {
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || with_session(|s| read(s, &d, &cfg, index))).await.map_err(|e| e.to_string())?
}

/// คำตอบของหน้าต่างสอน
#[tauri::command]
pub async fn ocr_teach(answer: TeachAnswer, cfg: OcrCfg) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || with_session(|s| teach(s, &cfg, answer))).await.map_err(|e| e.to_string())?
}

/// ปุ่มของหน้าต่างคำที่ไม่รู้จัก
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_word(action: String, word: String, to: Option<String>) -> Result<(), String> {
    with_session(|s| self::word(s, &action, &word, to.as_deref()))
}

/// คำแนะนำของคำที่ไม่รู้จัก
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_suggest(word: String) -> Result<Vec<String>, String> {
    with_session(|s| Ok(s.fix.as_ref().map(|f| f.1.suggestions(&word)).unwrap_or_default()))
}

/// ชื่อเดียวกันเขียนสองแบบ ดูทั้งไฟล์ · หน้าจอเรียกหลังอ่านครบหรือหลังแก้ข้อความ
#[tauri::command]
pub fn ocr_names(lines: Vec<String>) -> Vec<Vec<Reason>> { crate::ocr::suspect::name_variants(&lines) }

/// รายชื่อฐานที่มี
#[tauri::command]
pub fn ocr_dbs(app: tauri::AppHandle) -> Result<DbList, String> { Ok(db_list(&Dirs::of(&app)?)) }

/// ตัวที่สอนไปแล้วในงานนี้ ใหม่สุดก่อน · ตัวที่ไม่อยู่ในฐานที่โหลดแล้ว (ลบไปจากหน้าต่างอื่น) ตัดออกแบบ ClearNotInOcrDb ของ Subtitle Edit
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_history() -> Vec<Taught> {
    let mut g = session();
    let Some(s) = g.as_mut() else { return vec![] };
    let keep: Vec<bool> = s.history.iter().map(|t| s.taught_alive(t)).collect();
    let mut it = keep.into_iter();
    s.history.retain(|_| it.next().unwrap_or(true));
    s.history.clone()
}

impl Session {
    /// ตัวที่สอนยังอยู่ในฐานที่โหลดอยู่ไหม · ฐานไม่ได้โหลดหรือไม่มีกุญแจ ถือว่ายังอยู่ (ไม่ตัดทิ้งเอง)
    fn taught_alive(&self, t: &Taught) -> bool {
        match (&t.key, t.engine.as_str()) {
            (HistKey::N(c), "own") => self.own.as_ref().filter(|o| o.0 == t.db).map(|o| o.1.chars.contains(c) || o.1.expanded.contains(c)).unwrap_or(true),
            (HistKey::N(c), _) => self.nocr.as_ref().filter(|o| o.0 == t.db).map(|o| o.1.chars.contains(c) || o.1.expanded.contains(c)).unwrap_or(true),
            (HistKey::B(k), _) => self.bin.as_ref().filter(|o| o.0 == t.db).map(|o| o.1.images.iter().chain(&o.1.expanded).any(|b| b.key() == *k)).unwrap_or(true),
            (HistKey::None, _) => true,
        }
    }

    /// ฐาน nOCR หรือตัวสอนเองของรายการประวัติ
    fn hist_ndb(&mut self, t: &Taught) -> Result<&mut NOcrDb, String> {
        let slot = if t.engine == "own" { &mut self.own } else { &mut self.nocr };
        slot.as_mut().filter(|o| o.0 == t.db).map(|o| &mut o.1).ok_or_else(|| format!("ฐาน {} ไม่ได้โหลดอยู่ เลือกฐานนี้ในแถวตัวอ่านก่อน", t.db))
    }
}

/// แก้ข้อความกับตัวเอียงของตัวที่สอนไปแล้วลำดับ k แล้วบันทึกฐาน · ตาม Update ของ NOcrCharacterHistoryViewModel
pub fn history_update(s: &mut Session, k: usize, text: &str, italic: bool) -> Result<(), String> {
    if text.is_empty() { return Err("ข้อความของตัวอักษรว่างไม่ได้".into()); }
    let t = s.history.get(k).cloned().ok_or("หาตัวนี้ในประวัติไม่เจอ เปิดหน้าต่างใหม่")?;
    let key = match &t.key {
        HistKey::N(c) => {
            let db = s.hist_ndb(&t)?;
            let slot = db.chars.iter_mut().chain(db.expanded.iter_mut()).find(|x| *x == c).ok_or("ตัวนี้ไม่อยู่ในฐานแล้ว")?;
            slot.text = text.into();
            slot.italic = italic;
            let nk = slot.clone();
            db.clear_cache();
            ensure_parent(&db.file)?;
            db.save()?;
            HistKey::N(nk)
        }
        HistKey::B(kk) => {
            let (_, db) = s.bin.as_mut().filter(|o| o.0 == t.db).ok_or_else(|| format!("ฐาน {} ไม่ได้โหลดอยู่ เลือกฐานนี้ในแถวตัวอ่านก่อน", t.db))?;
            let b = db.images.iter_mut().chain(db.expanded.iter_mut()).find(|b| b.key() == *kk).ok_or("ตัวนี้ไม่อยู่ในฐานแล้ว")?;
            b.text = Some(text.into());
            b.italic = italic;
            let nk = b.key();
            ensure_parent(&db.file)?;
            db.save()?;
            HistKey::B(nk)
        }
        HistKey::None => return Err("ตัวนี้สอนก่อนเปิดหน้าต่าง แก้จากหน้าต่างฐานตัวอักษรแทน".into()),
    };
    let h = &mut s.history[k];
    h.text = text.into();
    h.italic = italic;
    h.key = key;
    Ok(())
}

/// ลบตัวที่สอนไปแล้วลำดับ k ออกจากฐานและประวัติ · ตาม Delete ของ NOcrCharacterHistoryViewModel
pub fn history_delete(s: &mut Session, k: usize) -> Result<(), String> {
    let t = s.history.get(k).cloned().ok_or("หาตัวนี้ในประวัติไม่เจอ เปิดหน้าต่างใหม่")?;
    match &t.key {
        HistKey::N(c) => {
            let db = s.hist_ndb(&t)?;
            if let Some(i) = db.chars.iter().position(|x| x == c) { db.chars.remove(i); } else if let Some(i) = db.expanded.iter().position(|x| x == c) { db.expanded.remove(i); } else { return Err("ตัวนี้ไม่อยู่ในฐานแล้ว".into()); }
            db.clear_cache();
            ensure_parent(&db.file)?;
            db.save()?;
        }
        HistKey::B(kk) => {
            let (_, db) = s.bin.as_mut().filter(|o| o.0 == t.db).ok_or_else(|| format!("ฐาน {} ไม่ได้โหลดอยู่ เลือกฐานนี้ในแถวตัวอ่านก่อน", t.db))?;
            db.remove(kk);
            ensure_parent(&db.file)?;
            db.save()?;
        }
        HistKey::None => return Err("ตัวนี้สอนก่อนเปิดหน้าต่าง ลบจากหน้าต่างฐานตัวอักษรแทน".into()),
    }
    s.history.remove(k);
    Ok(())
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_history_update(k: usize, text: String, italic: bool) -> Result<(), String> {
    let mut g = session();
    history_update(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, k, &text, italic)
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_history_delete(k: usize) -> Result<(), String> {
    let mut g = session();
    history_delete(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, k)
}


#[tauri::command]
pub async fn ocr_inspect(app: tauri::AppHandle, index: usize, cfg: OcrCfg) -> Result<InspView, String> {
    let d = Dirs::of(&app)?;
    tauri::async_runtime::spawn_blocking(move || { let mut g = session(); inspect(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &d, &cfg, index) }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ocr_inspect_update(li: usize, text: String, italic: bool, lines: Option<DrawnLines>, cfg: OcrCfg) -> Result<InspView, String> {
    tauri::async_runtime::spawn_blocking(move || { let mut g = session(); inspect_update(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &cfg, li, &text, italic, lines.as_ref()) }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ocr_inspect_delete(li: usize, cfg: OcrCfg) -> Result<InspView, String> {
    tauri::async_runtime::spawn_blocking(move || { let mut g = session(); inspect_delete(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &cfg, li) }).await.map_err(|e| e.to_string())?
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_inspect_draw(li: usize, lines: usize, cfg: OcrCfg) -> Result<DrawnLines, String> {
    let mut g = session();
    let (fg, bg) = inspect_draw(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &cfg, li, lines)?;
    Ok(DrawnLines { fg, bg })
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_inspect_teach(li: usize, cfg: OcrCfg) -> Result<TeachReq, String> {
    let mut g = session();
    inspect_teach(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &cfg, li)
}

/// ตรวจบรรทัดใหม่หลังสอนคู่ที่ดีกว่า (ฐานเปลี่ยนแล้ว) · ตาม ReloadMatches
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_inspect_reload(cfg: OcrCfg) -> Result<InspView, String> {
    let mut g = session();
    let s = g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?;
    s.insp_match(&cfg)?;
    s.insp_view()
}

/// ภาพที่แต่งแล้วของภาพลำดับ index ให้หน้าต่างแต่งภาพก่อนอ่านดู (PNG data URL)
#[tauri::command]
pub async fn ocr_prep_preview(index: usize, prep: Prep) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file = session().as_ref().and_then(|s| s.items.get(index)).map(|it| it.img.file.clone()).ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?;
        let img = image::open(&file).map_err(|e| format!("เปิดภาพซับไม่ได้ {e}"))?.to_rgba8();
        Ok(png_url(&crate::ocr::ocrprep::preprocess(&img, &prep)))
    }).await.map_err(|e| e.to_string())?
}

/// โมเดล PaddleOCR ที่แนบมา (ชื่อโฟลเดอร์ที่มี inference.onnx)
#[tauri::command]
pub fn ocr_paddle_models(app: tauri::AppHandle) -> Result<Vec<String>, String> { Ok(crate::ocr::paddle::models(&Dirs::of(&app)?.ocr)) }

/// ลบฐานของผู้ใช้ลงถังขยะ (หน้าต่างตั้งค่า nOCR ปุ่มลบ) · ฐานที่แนบมาลบไม่ได้ · ฐานที่โหลดอยู่ในงานนี้ปิดก่อน
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_delete(app: tauri::AppHandle, kind: String, name: String) -> Result<(), String> {
    check_name(&name)?;
    let d = Dirs::of(&app)?;
    let (_, user) = db_paths(&d, &kind, &name);
    if !user.is_file() { return Err(format!("ฐาน {name} เป็นฐานที่แนบมากับโปรแกรม ลบไม่ได้")); }
    crate::app::outfile::to_trash(&user)?;
    forget_db(&kind, &name);
    Ok(())
}

/// ฐานที่โหลดค้างในงานนี้ปิดทิ้ง ให้อ่านครั้งต่อไปโหลดจากไฟล์ใหม่ (หลังลบ เปลี่ยนชื่อ แก้ฐานจากหน้าต่างอื่น)
pub(crate) fn forget_db(kind: &str, name: &str) {
    if let Some(s) = session().as_mut() {
        if s.nocr.as_ref().is_some_and(|x| x.0 == name) && kind == "nocr" { s.nocr = None; }
        if s.bin.as_ref().is_some_and(|x| x.0 == name) && kind == "binary" { s.bin = None; }
        if s.own.as_ref().is_some_and(|x| x.0 == name) && kind == "own" { s.own = None; }
    }
}

/// คัดลอกภาพซับลงคลิปบอร์ด (dest copy) หรือบันทึกเป็น PNG ที่ path (dest save) · ปุ่มคัดลอกภาพ บันทึกภาพ ของ Subtitle Edit
/// บันทึกไม่เขียนทับ ชื่อชนต่อท้ายเลข คืนที่อยู่ไฟล์ที่ได้ · dry ไม่แตะคลิปบอร์ด (ตัวตรวจ ห้ามแตะคลิปบอร์ดของคนที่ใช้คอม)
#[tauri::command]
pub async fn ocr_image_out(app: tauri::AppHandle, index: usize, dest: String, path: Option<String>, dry: bool) -> Result<String, String> {
    use tauri::Manager;
    let hwnd = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || {
        let file = session().as_ref().and_then(|s| s.items.get(index)).map(|it| it.img.file.clone()).ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?;
        let png = std::fs::read(&file).map_err(|e| format!("อ่านภาพซับไม่ได้ {e}"))?;
        if dest == "copy" {
            let img = image::load_from_memory(&png).map_err(|e| format!("อ่านภาพซับไม่ได้ {e}"))?.to_rgba8();
            if !dry { crate::app::winutil::clipboard_image(hwnd, &png, &img)?; }
            return Ok(String::new());
        }
        let want = PathBuf::from(path.ok_or("ยังไม่ได้เลือกที่เก็บ")?);
        let dir = want.parent().filter(|d| d.is_dir()).ok_or("หาโฟลเดอร์ที่เก็บไม่เจอ")?.to_path_buf();
        let out = crate::app::outfile::free_name(&dir, &want);
        // เขียนไฟล์ชั่วคราวแล้วย้ายแบบไม่ทับ ตามกฎไฟล์ของโปรแกรม (ผู้ช่วยตรวจทาน R14 · เดิมเขียนตรงที่ชื่อว่าง)
        let part = crate::subtitle::subdoc::partial_of(&out);
        std::fs::write(&part, &png).map_err(|e| format!("บันทึกภาพไม่ได้ {e}"))?;
        crate::cover::rename::move_no_replace(&part, &out).map_err(|p| { let _ = std::fs::remove_file(&part); format!("บันทึกภาพไม่ได้ {}", p.title) })?;
        Ok(out.display().to_string())
    }).await.map_err(|e| e.to_string())?
}

/// หยุดงาน · ล้างตัวที่รอสอนกับคำตอบที่ผูกกับภาพ
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_stop() {
    if let Some(s) = session().as_mut() { s.pending = None; s.skip.clear(); s.once.clear(); }
}

mod inspect;
pub use inspect::*;

mod teach;
pub use teach::*;

mod results;
pub use results::*;

mod session;
pub use session::*;

#[cfg(test)]
mod tests;
