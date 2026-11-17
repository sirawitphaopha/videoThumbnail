//! ตัวคุมงาน OCR (แผน OCR ขั้น 10 · BUGS ข้อ 143)
//! หน้าจอเดินทีละภาพแบบงานแปลงเสียง (convert.rs) Rust อ่านหนึ่งภาพต่อหนึ่งคำสั่ง จึงหยุดชั่วคราว อ่านต่อ และอ่านเฉพาะบรรทัดที่เลือก ได้จากฝั่งหน้าจอ
//! ตัวอ่านแบบเทียบภาพ (nOCR Binary OCR ตัวสอนเอง) ที่เปิดหยุดสอนไว้ เจอตัวที่ฐานไม่รู้จัก คืนคำขอสอนแทนผล หน้าจอเปิดหน้าต่างสอนแล้วส่งคำตอบกลับ
//!   จำตัวนี้ ใช้ครั้งเดียว ข้ามใส่ * หยุด แล้วหน้าจออ่านภาพเดิมซ้ำ · ตาม RunNOcrLoop กับ RunBinaryImageCompareOcrLoop ของ Subtitle Edit
//! ฐานที่สอนบันทึกทันทีลงโฟลเดอร์ของผู้ใช้ (app_local_data/ocr) ฐานที่แนบมาในตัวติดตั้งไม่ถูกแก้ ครั้งต่อไปเปิดฐานของผู้ใช้ก่อน
//! หลังอ่าน ตัวแก้คำ OCR (ocrfix.rs) แก้ข้อความ ตัวชี้จุดสงสัย (suspect.rs) ติดเหตุ และหาตำแหน่งแบบ ASS ทีละบรรทัด (ocrsrc.rs an_lines)
//! อ่านภาพจากโฟลเดอร์ทำงานของโปรแกรมอย่างเดียว ไม่แตะไฟล์หนังและไฟล์ซับ

use crate::binocr::{BinDb, BinOpts, BinReader};
use crate::nocr::{Bmp, NChar, NLine, NOcrDb, Piece};
use crate::nocr_lines::{generate, Algo, Rng};
use crate::nocr_text::{LineRead, NOcrReader, ReadOpts, ReadOut};
use crate::ocrfix::{Ctx, FixEngine, Hunspell, NoSpell, Spell};
use crate::ocrprep::Prep;
use crate::ocrsrc::OcrItem;
use crate::ownocr::{OwnOpts, OwnReader};
use crate::paddle::PaddleOpts;
use crate::suspect::Reason;
use crate::tesseract::TessOpts;
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
            fix: true, lang3: "eng".into(), dict: "en_US".into(), guess: true, conf_min: crate::suspect::CONF_MIN,
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
        let tools = crate::tools::tools_dir(app)?;
        let user = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ocr");
        Ok(Dirs { ocr: tools.join("ocr"), tools, user, work: crate::subs::work_dir(app)? })
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
        nocr: merge(crate::nocr::databases(&d.ocr.join("Ocr")), crate::nocr::databases(&d.user.join("nocr"))),
        binary: merge(crate::binocr::databases(&d.ocr.join("Ocr")), crate::binocr::databases(&d.user.join("binary"))),
        own: crate::nocr::databases(&d.user.join("own")),
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

// ---------------------------------------------------------------- งานหนึ่งไฟล์

/// ตัวที่รอสอน · ชิ้นทั้งหมดของภาพกับภาพสองสีที่ตัวอ่านเห็น
struct Pending { index: usize, engine: String, letter: usize, parent: Bmp, pieces: Vec<Piece> }

/// ตัวที่สอนไปแล้วในงานนี้ (หน้าต่างดูที่สอนไปแล้ว)
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Taught {
    pub index: usize, pub engine: String, pub db: String, pub text: String, pub italic: bool, pub pieces: usize,
    /// ภาพตัวที่สอน (ชิ้นเดียวหรือหลายชิ้นรวมกัน) PNG data URL · เวลาที่สอน มิลลิวินาที
    pub png: String,
    pub at: u64,
    /// ตัวที่เพิ่มเข้าฐาน ไว้หาในฐานตอนแก้หรือลบจากหน้าต่างตัวที่สอนไปแล้ว (NOcrAddHistoryItem.NOcrChar)
    #[serde(skip)]
    pub key: HistKey,
}

/// ตัวในฐานของประวัติหนึ่งรายการ · nOCR กับตัวสอนเองเก็บตัวทั้งตัว Binary OCR เก็บกุญแจของภาพ
#[derive(Clone, Debug, Default)]
pub enum HistKey { #[default] None, N(NChar), B(String) }

#[derive(Default)]
pub struct Session {
    items: Vec<OcrItem>,
    nocr: Option<(String, NOcrDb)>,
    bin: Option<(String, BinDb)>,
    own: Option<(String, NOcrDb)>,
    nreader: NOcrReader,
    breader: Option<BinReader>,
    oreader: OwnReader,
    help_n: NOcrReader,
    help_b: Option<BinReader>,
    fix: Option<(String, FixEngine)>,
    skip: HashMap<usize, HashSet<usize>>,
    once: HashMap<usize, HashMap<usize, String>>,
    pending: Option<Pending>,
    /// ข้อความหลังแก้ของภาพที่อ่านแล้ว ตัวแก้คำใช้บรรทัดก่อนหน้า
    texts: HashMap<usize, String>,
    history: Vec<Taught>,
    rng: Option<Rng>,
    /// หน้าต่างตรวจบรรทัดที่เปิดอยู่ (ocr_inspect)
    insp: Option<Insp>,
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

pub(crate) fn session() -> MutexGuard<'static, Option<Session>> { SESSION.lock().unwrap_or_else(|e| e.into_inner()) }

/// ภาพของงานถูกวาดใหม่ (สีของ VobSub) · ตั้งภาพ ขนาด ตำแหน่งตามภาพใหม่ ข้อความ คำตอบ และประวัติที่ผูกกับลำดับภาพคงไว้
/// จับคู่ด้วยที่อยู่ไฟล์ภาพ (โฟลเดอร์ของซับนี้กับเลขภาพ) ไม่ใช่ลำดับ · ลบบรรทัดไปแล้วภาพไม่เลื่อนไปบรรทัดอื่น
/// และงานเป็นของซับอื่นแล้ว (เปิดไฟล์อื่นระหว่างวาดสีใหม่) ไม่มีไฟล์ไหนตรง จึงไม่แตะ (ผู้ช่วยตรวจทาน R1 · เดิมจับคู่ตามลำดับ)
/// เก็บกวาดผลของ PaddleOCR กับ Tesseract ที่อ่านเป็นข้อความอิสระ
/// ① ขีดบทพูดที่แยกเป็นบรรทัดของตัวเองต่อกลับเข้าบรรทัด (OcrLoneDashFixer · ผู้ช่วยตรวจทาน T14 เดิมไม่ถูกเรียก)
/// ② เว้นวรรคครึ่งความกว้างระหว่างอักษร CJK สองตัวตัดทิ้ง ภาษาญี่ปุ่นจีนไม่เว้นวรรคระหว่างคำ คงเว้นวรรคเต็มความกว้าง (ผู้ช่วยตรวจทาน T8)
pub fn tidy_free(t: &str) -> String {
    let t = crate::ocrfix::fix_lone_dashes(t);
    let cjk = |c: char| matches!(c, '\u{3001}'..='\u{30FF}' | '\u{3400}'..='\u{9FFF}' | '\u{FF01}'..='\u{FF5E}');
    let cs: Vec<char> = t.chars().collect();
    let mut out = String::with_capacity(t.len());
    for (k, &c) in cs.iter().enumerate() {
        if c == ' ' {
            let prev = cs[..k].iter().rev().find(|x| **x != ' ').copied();
            let next = cs[k + 1..].iter().find(|x| **x != ' ').copied();
            if prev.is_some_and(cjk) && next.is_some_and(cjk) { continue; }
        }
        out.push(c);
    }
    out
}

pub fn update_images(v: &[crate::subs::SubImg]) {
    if let Some(s) = session().as_mut() { apply_images(s, v); }
}
pub(crate) fn apply_images(s: &mut Session, v: &[crate::subs::SubImg]) {
    let by: HashMap<&std::path::Path, &crate::subs::SubImg> = v.iter().map(|i| (i.file.as_path(), i)).collect();
    for it in s.items.iter_mut() {
        if let Some(img) = by.get(it.img.file.as_path()) { it.an = crate::ocrsrc::an_of(img); it.img = (*img).clone(); }
    }
}

/// ลบภาพลำดับที่ระบุออกจากงาน (ปุ่มลบบรรทัด) · ข้อความ ตัวที่ข้าม คำตอบใช้ครั้งเดียว และประวัติเลื่อนลำดับตาม · ตาม DeleteSelectedLines
pub fn remove_items(s: &mut Session, idx: &[usize]) {
    let n = s.items.len();
    let gone: HashSet<usize> = idx.iter().copied().filter(|i| *i < n).collect();
    if gone.is_empty() { return; }
    let map: Vec<Option<usize>> = { let mut k = 0; (0..n).map(|i| if gone.contains(&i) { None } else { k += 1; Some(k - 1) }).collect() };
    let mut i = 0;
    s.items.retain(|_| { let keep = !gone.contains(&i); i += 1; keep });
    s.texts = s.texts.drain().filter_map(|(k, v)| map.get(k).copied().flatten().map(|nk| (nk, v))).collect();
    s.skip = s.skip.drain().filter_map(|(k, v)| map.get(k).copied().flatten().map(|nk| (nk, v))).collect();
    s.once = s.once.drain().filter_map(|(k, v)| map.get(k).copied().flatten().map(|nk| (nk, v))).collect();
    s.history.retain(|t| map.get(t.index).copied().flatten().is_some());
    for t in s.history.iter_mut() { t.index = map[t.index].unwrap(); }
    s.pending = None;
    s.insp = None;
}

// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_remove_items(idx: Vec<usize>) -> Result<(), String> {
    let mut g = session();
    remove_items(g.as_mut().ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?, &idx);
    Ok(())
}

/// เปิดซับรูปใหม่ · ฐานกับตัวแก้คำที่โหลดไว้ใช้ต่อ ค่าที่ผูกกับภาพเดิมล้างทิ้ง
pub fn set_source(items: Vec<OcrItem>) {
    let mut g = session();
    let mut s = g.take().unwrap_or_default();
    s.items = items;
    s.nreader = NOcrReader::default();
    s.help_n = NOcrReader::default();
    s.breader = s.bin.as_ref().map(|b| BinReader::new(&b.0));
    s.help_b = s.bin.as_ref().map(|b| BinReader::new(&b.0));
    s.skip.clear();
    s.once.clear();
    s.pending = None;
    s.texts.clear();
    s.history.clear();
    *g = Some(s);
}

const MATCHERS: [&str; 3] = ["nocr", "binary", "own"];

impl Session {
    #[cfg(test)]
    pub fn with_items(items: Vec<OcrItem>) -> Self { Session { items, ..Default::default() } }

    /// ภาพของงานตามลำดับบรรทัดในหน้า OCR (บันทึกภาพพร้อมหน้า HTML ขั้น 12)
    pub fn items(&self) -> &[OcrItem] { &self.items }

    /// โหลดฐาน ตัวอ่าน และตัวแก้คำที่ค่าตั้งนี้ต้องใช้ · ชื่อฐานเปลี่ยน โหลดใหม่และเริ่มตัวอ่านใหม่
    fn ensure(&mut self, d: &Dirs, cfg: &OcrCfg) -> Result<(), String> {
        let uses = |k: &str| cfg.engine == k || cfg.helpers.iter().any(|h| h == k);
        let fb = cfg.fallback && (cfg.engine == "nocr" || cfg.engine == "binary");
        if (uses("nocr") || fb) && self.nocr.as_ref().is_none_or(|x| x.0 != cfg.nocr_db) {
            self.nocr = Some((cfg.nocr_db.clone(), load_nocr(d, "nocr", &cfg.nocr_db)?));
            self.nreader = NOcrReader::default();
            self.help_n = NOcrReader::default();
        }
        if (uses("binary") || fb) && self.bin.as_ref().is_none_or(|x| x.0 != cfg.bin_db) {
            self.bin = Some((cfg.bin_db.clone(), load_bin(d, &cfg.bin_db)?));
            self.breader = Some(BinReader::new(&cfg.bin_db));
            self.help_b = Some(BinReader::new(&cfg.bin_db));
        }
        if uses("own") && self.own.as_ref().is_none_or(|x| x.0 != cfg.own_db) {
            self.own = Some((cfg.own_db.clone(), load_nocr(d, "own", &cfg.own_db)?));
        }
        let key = format!("{}|{}", cfg.lang3, cfg.dict);
        if cfg.fix && self.fix.as_ref().is_none_or(|x| x.0 != key) {
            let spell = open_spell(d, &cfg.dict);
            let has = spell.is_some();
            let mut fx = FixEngine::new(&d.ocr.join("Dictionaries"), &d.user.join("dict"), &cfg.lang3, &cfg.dict, spell.unwrap_or_else(|| Box::new(NoSpell)));
            // ไม่มีพจนานุกรมของภาษานี้ ไม่ชี้คำที่ไม่รู้จัก (ไม่งั้นทุกคำไม่รู้จัก)
            if !has { fx.dictionary = false; }
            self.fix = Some((key, fx));
        }
        if self.rng.is_none() { self.rng = Some(Rng::from_time()); }
        Ok(())
    }

    fn read_opts(cfg: &OcrCfg, teach: bool) -> ReadOpts {
        ReadOpts { max_wrong: cfg.max_wrong, italic: if cfg.italic { 0.2 } else { 0.0 }, space_px: cfg.space_px, last_ditch: cfg.last_ditch, teach }
    }

    /// อ่านด้วยตัวอ่านแบบเทียบภาพที่เป็นตัวหลัก
    fn read_matcher(&self, cfg: &OcrCfg, i: usize, img: &Bmp) -> Result<ReadOut, String> {
        let empty_s = HashSet::new();
        let empty_o = HashMap::new();
        let skip = self.skip.get(&i).unwrap_or(&empty_s);
        let once = self.once.get(&i).unwrap_or(&empty_o);
        match cfg.engine.as_str() {
            "nocr" => {
                let db = &self.nocr.as_ref().ok_or("ยังไม่ได้โหลดฐาน nOCR")?.1;
                let fbf = match (&self.bin, &self.breader) {
                    (Some(b), Some(r)) if cfg.fallback => Some(crate::binocr::binary_fallback(&b.1, &r.matcher, cfg.bin_max_err)),
                    _ => None,
                };
                Ok(self.nreader.read(db, img, &Self::read_opts(cfg, cfg.teach), skip, once, fbf.as_ref().map(|f| f as crate::nocr_text::Fallback)))
            }
            "binary" => {
                let db = &self.bin.as_ref().ok_or("ยังไม่ได้โหลดฐาน Binary OCR")?.1;
                let r = self.breader.as_ref().ok_or("ยังไม่ได้เตรียมตัวอ่าน Binary OCR")?;
                let fbf = match &self.nocr {
                    Some(n) if cfg.fallback => Some(crate::binocr::nocr_fallback(&n.1, &self.nreader.case, cfg.max_wrong, if cfg.italic { 0.2 } else { 0.0 })),
                    _ => None,
                };
                Ok(r.read(db, img, &BinOpts { space_px: cfg.bin_space_px, max_err: cfg.bin_max_err, teach: cfg.teach }, skip, once, fbf.as_ref().map(|f| f as crate::nocr_text::Fallback)))
            }
            _ => {
                let db = &self.own.as_ref().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?.1;
                Ok(self.oreader.read(db, img, &OwnOpts { max_wrong: cfg.max_wrong, teach: cfg.teach }, skip, once))
            }
        }
    }

    /// ข้อความของตัวช่วยหนึ่งตัว · อ่านไม่ได้คืน None (ตัวช่วยพังไม่ทำให้งานหลักหยุด)
    fn helper_text(&self, d: &Dirs, cfg: &OcrCfg, h: &str, img: &Bmp) -> Option<String> {
        if let Some(size) = h.strip_prefix("paddle:") {
            let o = PaddleOpts { size: size.into(), ..cfg.paddle.clone() };
            return crate::paddle::read_text(&d.ocr, img, &o).ok().map(|x| x.0);
        }
        match h {
            "paddle" => crate::paddle::read_text(&d.ocr, img, &cfg.paddle).ok().map(|x| tidy_free(&x.0)),
            "tesseract" => crate::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, img, &cfg.tess, None).ok().map(|x| tidy_free(&x.text)),
            "nocr" => self.nocr.as_ref().map(|n| self.help_n.read_text(&n.1, img, &Self::read_opts(cfg, false)).text),
            "binary" => match (&self.bin, &self.help_b) {
                (Some(b), Some(r)) => Some(r.read_text(&b.1, img, &BinOpts { space_px: cfg.bin_space_px, max_err: cfg.bin_max_err, teach: false }).text),
                _ => None,
            },
            "own" => self.own.as_ref().map(|o| self.oreader.read_text(&o.1, img, &OwnOpts { max_wrong: cfg.max_wrong, teach: false }).text),
            _ => None,
        }
    }
}

/// ชื่อตัวอ่านบนจอ
pub fn engine_label(h: &str) -> String {
    if let Some(size) = h.strip_prefix("paddle:") { return format!("PaddleOCR {size}"); }
    match h { "paddle" => "PaddleOCR", "tesseract" => "Tesseract", "nocr" => "nOCR", "binary" => "Binary OCR", "own" => "ตัวสอนเอง", x => x }.into()
}

/// ตัวช่วยที่ซ้ำกับตัวหลัก (PaddleOCR ขนาดเดียวกัน) ไม่ต้องอ่านซ้ำ
fn same_as_primary(cfg: &OcrCfg, h: &str) -> bool {
    h == cfg.engine || (cfg.engine == "paddle" && h.strip_prefix("paddle:") == Some(cfg.paddle.size.as_str()))
}

// ---------------------------------------------------------------- ผลอ่าน

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LineOut {
    pub index: usize,
    /// ข้อความหลังตัวแก้คำ (ข้อความที่ใช้)
    pub text: String,
    /// ข้อความที่ตัวหลักอ่านได้ก่อนแก้
    pub raw: String,
    /// ค่าความมั่นใจ 0–1 ของ PaddleOCR และ Tesseract
    pub conf: Option<f32>,
    pub reasons: Vec<Reason>,
    /// คำที่พจนานุกรมไม่รู้จัก (หน้าต่างคำที่ไม่รู้จัก)
    pub unknown: Vec<String>,
    /// คำที่เดา (เดิม ใหม่) กับคู่ที่รายการแก้คำเปลี่ยน
    pub guesses: Vec<(String, String)>,
    pub fixes: Vec<(String, String)>,
    /// ผลของตัวช่วยแต่ละตัว (ชื่อบนจอ ข้อความ)
    pub helpers: Vec<(String, String)>,
    /// ตำแหน่งแบบ ASS ของทั้งภาพ กับทีละบรรทัดของภาพที่มีหลายก้อน
    pub an: u8,
    pub an_lines: Option<Vec<u8>>,
    /// ชิ้นที่อ่านไม่ออก (ใส่ *)
    pub unreadable: usize,
    pub ms: u64,
}

/// คำขอสอนหนึ่งตัว · ภาพสองสีของภาพที่ตัวอ่านเห็นกับกรอบของทุกชิ้น หน้าต่างสอนวาดกรอบ หด ขยาย และครอปเองจากข้อมูลนี้
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TeachReq {
    pub index: usize,
    pub engine: String,
    pub db: String,
    /// ลำดับชิ้นที่ไม่รู้จัก
    pub letter: usize,
    /// PNG data URL ตัวสีขาวบนพื้นใส
    pub image: String,
    pub width: u32,
    pub height: u32,
    /// กรอบของทุกชิ้น x y กว้าง สูง · เว้นวรรคกับขึ้นบรรทัดเป็น None
    pub boxes: Vec<Option<[i32; 4]>>,
    /// ขยายกรอบรวมชิ้นถัดไปได้อีกกี่ชิ้น (ชิ้นที่เป็นภาพติดกัน ไม่ข้ามเว้นวรรค)
    pub expand_max: usize,
    /// ระยะจากบนบรรทัดของชิ้นนี้
    pub top: i32,
    /// ตัวในฐานที่ใกล้ที่สุด ไว้เติมช่องพิมพ์ · ไม่มีเป็นว่าง
    pub guess: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadResult {
    Done(LineOut),
    Teach(TeachReq),
}

pub(crate) fn png_url(img: &Bmp) -> String {
    let mut v = std::io::Cursor::new(Vec::new());
    let _ = img.write_to(&mut v, image::ImageFormat::Png);
    format!("data:image/png;base64,{}", crate::audiograph::b64(&v.into_inner()))
}

fn teach_req(s: &Session, cfg: &OcrCfg, index: usize, letter: usize, parent: &Bmp, pieces: &[Piece]) -> TeachReq {
    let boxes: Vec<Option<[i32; 4]>> = pieces.iter().map(|p| p.bmp.as_ref().map(|b| [p.x, p.y, b.width() as i32, b.height() as i32])).collect();
    let expand_max = pieces.iter().skip(letter + 1).take_while(|p| p.bmp.is_some()).count().min(10);
    let p = &pieces[letter];
    let db_name = match cfg.engine.as_str() { "binary" => &cfg.bin_db, "own" => &cfg.own_db, _ => &cfg.nocr_db };
    // ตัวที่ใกล้ที่สุด ใช้ทางสุดท้ายแบบไม่จำกัดจุดผิด (เฉพาะฐานแบบเส้น)
    let guess = match (cfg.engine.as_str(), p.bmp.as_ref()) {
        ("nocr", Some(b)) => s.nocr.as_ref().and_then(|n| n.1.match_single(b, p.top, true, 999, true, false, crate::nocr::Placement::Unknown).0).map(|c| c.text).unwrap_or_default(),
        ("own", Some(b)) => s.own.as_ref().and_then(|n| n.1.match_single(b, p.top, true, 999, true, false, crate::nocr::Placement::Unknown).0).map(|c| c.text).unwrap_or_default(),
        _ => String::new(),
    };
    TeachReq { index, engine: cfg.engine.clone(), db: db_name.clone(), letter, image: png_url(parent), width: parent.width(), height: parent.height(), boxes, expand_max, top: p.top, guess }
}

/// อ่านภาพลำดับ i หนึ่งภาพ
pub fn read(s: &mut Session, d: &Dirs, cfg: &OcrCfg, i: usize) -> Result<ReadResult, String> {
    let item = s.items.get(i).ok_or("ไม่มีภาพลำดับนี้ เปิดซับรูปใหม่")?.clone();
    let raw_img = image::open(&item.img.file).map_err(|e| format!("เปิดภาพซับลำดับที่ {} ไม่ได้ {e}", i + 1))?.to_rgba8();
    let img = crate::ocrprep::preprocess(&raw_img, &cfg.prep);
    s.ensure(d, cfg)?;
    s.pending = None;
    let t0 = std::time::Instant::now();
    let matcher = MATCHERS.contains(&cfg.engine.as_str());
    let (raw, conf, unreadable, lr): (String, Option<f32>, usize, Option<LineRead>) = match cfg.engine.as_str() {
        "paddle" => { let (t, c) = crate::paddle::read_text(&d.ocr, &img, &cfg.paddle)?; (tidy_free(&t), Some(c), 0, None) }
        "tesseract" => { let o = crate::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, &img, &cfg.tess, None)?; (tidy_free(&o.text), Some(o.conf), 0, None) }
        e if MATCHERS.contains(&e) => match s.read_matcher(cfg, i, &img)? {
            ReadOut::Done(r) => (r.text.clone(), None, r.unknown, Some(r)),
            ReadOut::Teach { letter, parent, pieces } => {
                let req = teach_req(s, cfg, i, letter, &parent, &pieces);
                s.pending = Some(Pending { index: i, engine: cfg.engine.clone(), letter, parent, pieces });
                return Ok(ReadResult::Teach(req));
            }
        },
        e => return Err(format!("ไม่รู้จักตัวอ่าน {e}")),
    };
    let mut helpers = vec![];
    for h in &cfg.helpers {
        if same_as_primary(cfg, h) { continue; }
        if let Some(t) = s.helper_text(d, cfg, h, &img) { helpers.push((engine_label(h), t)); }
    }
    // ตัดบรรทัดเองก่อนตัวแก้คำ เมื่อเกินสองบรรทัดและไม่ใช่ภาพที่มีก้อนบนกับก้อนล่างแยกกัน · AutoBreakIfNeeded ของ OcrViewModel
    let broke = if cfg.auto_break && crate::ocrbreak::number_of_lines(&raw) > crate::ocrbreak::MAX_LINES && !crate::ocrsrc::has_separated_blocks(&raw_img, &item.img) {
        Some(crate::ocrbreak::auto_break_line(&raw, &crate::ocrbreak::lang_of_text(&raw, &crate::ocrbreak::lang_of_dict(&cfg.dict))))
    } else { None };
    let src = broke.as_deref().unwrap_or(&raw);
    // ตัวแก้คำ · แก้ภาพที่ตัวจับคู่ภาพพลาด (# / |) เฉพาะตัวอ่านแบบเทียบภาพ แบบ Subtitle Edit
    let (text, unknown, guesses, fixes) = match s.fix.as_mut() {
        Some((_, fx)) if cfg.fix => {
            fx.image_misreads = matcher;
            fx.fill_unknown = matcher;
            let prev = if i > 0 { s.texts.get(&(i - 1)).cloned() } else { None };
            let next = s.items.get(i + 1).map(|n| n.img.start * 1000.0);
            let end_ms = item.img.end.unwrap_or(item.img.start) * 1000.0;
            let ctx = Ctx::new(prev.as_deref(), end_ms, next.map(|t| (t, "")));
            let mut lf = fx.fix(i, src, &ctx, cfg.guess);
            // ตัวเอียงที่เว้นวรรคหาย ลองใส่เว้นวรรคเพิ่ม ใช้เมื่อคำที่ไม่รู้จักน้อยกว่า · ตาม Subtitle Edit
            if let Some(alt) = lr.as_ref().and_then(|r| if cfg.engine == "binary" { crate::binocr::italic_retry(r) } else if cfg.engine == "nocr" { crate::nocr_text::italic_retry(r) } else { None }) {
                if !lf.unknown().is_empty() {
                    let alt = if broke.is_some() { crate::ocrbreak::auto_break_line(&alt, &crate::ocrbreak::lang_of_dict(&cfg.dict)) } else { alt };
                    let lf2 = fx.fix(i, &alt, &ctx, cfg.guess);
                    if lf2.unknown().len() < lf.unknown().len() { lf = lf2; }
                }
            }
            let unknown: Vec<String> = lf.unknown().iter().map(|p| p.word.clone()).collect();
            let guesses: Vec<(String, String)> = lf.guesses().into_iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
            let fixes: Vec<(String, String)> = lf.parts.iter().filter_map(|p| p.replacement.clone()).chain(lf.replacement.clone()).collect();
            (lf.text(), unknown, guesses, fixes)
        }
        _ => (src.to_string(), vec![], vec![], vec![]),
    };
    // ค่าความมั่นใจวัดเกณฑ์ไว้กับ PaddleOCR เท่านั้น (suspect.rs) · Tesseract ส่งค่าไปให้หน้าจอแต่ไม่ใช้ติดเหตุ
    let reasons = crate::suspect::check_line(&text, if cfg.engine == "paddle" { conf } else { None }, &helpers, &unknown, cfg.conf_min);
    let an_lines = crate::ocrsrc::an_lines(&raw_img, &item.img, text.lines().count());
    s.texts.insert(i, text.clone());
    s.skip.remove(&i);
    s.once.remove(&i);
    Ok(ReadResult::Done(LineOut { index: i, text, raw, conf, reasons, unknown, guesses, fixes, helpers, an: item.an, an_lines, unreadable, ms: t0.elapsed().as_millis() as u64 }))
}

// ---------------------------------------------------------------- สอน

/// เส้นที่ผู้ใช้วาดเอง (พิกัดในตัวอักษร x1 y1 x2 y2) · ไม่ส่งมาให้วาดเองตามจำนวนเส้นที่ตั้ง
#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct DrawnLines { pub fg: Vec<[i32; 4]>, pub bg: Vec<[i32; 4]> }

/// คำตอบของหน้าต่างสอน · expand คือจำนวนชิ้นถัดไปที่รวมเป็นตัวเดียวกัน (0 คือชิ้นเดียว)
#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TeachAnswer {
    Learn { text: String, #[serde(default)] italic: bool, #[serde(default)] expand: usize, #[serde(default)] lines: Option<DrawnLines> },
    Once { text: String, #[serde(default)] expand: usize },
    Skip,
    Stop,
}

/// รับคำตอบของตัวที่รอสอน · หน้าจออ่านภาพเดิมซ้ำต่อ (ยกเว้นหยุด)
pub fn teach(s: &mut Session, cfg: &OcrCfg, ans: TeachAnswer) -> Result<(), String> {
    let p = s.pending.take().ok_or("ไม่มีตัวที่รอสอน")?;
    let room = p.pieces.iter().skip(p.letter + 1).take_while(|x| x.bmp.is_some()).count();
    match ans {
        TeachAnswer::Stop => { s.skip.remove(&p.index); s.once.remove(&p.index); }
        TeachAnswer::Skip => { s.skip.entry(p.index).or_default().insert(p.letter); }
        TeachAnswer::Once { text, expand } => {
            let m = s.once.entry(p.index).or_default();
            m.insert(p.letter, text);
            // ชิ้นที่รวมเข้าตัวนี้ใส่ข้อความว่าง ไม่ถามซ้ำ
            for k in 1..=expand.min(room) { m.insert(p.letter + k, String::new()); }
        }
        TeachAnswer::Learn { text, italic, expand, lines } => {
            let n = 1 + expand.min(room);
            let rng = s.rng.get_or_insert_with(Rng::from_time);
            let (db_name, key) = match p.engine.as_str() {
                "binary" => {
                    let (name, db) = s.bin.as_mut().ok_or("ยังไม่ได้โหลดฐาน Binary OCR")?;
                    let b = crate::binocr::teach_bitmap(&p.pieces, p.letter, n, &text, italic).ok_or("สร้างภาพตัวอักษรไม่ได้")?;
                    let key = b.key();
                    db.add(b)?;
                    ensure_parent(&db.file)?;
                    db.save()?;
                    (name.clone(), HistKey::B(key))
                }
                "own" => {
                    let (name, db) = s.own.as_mut().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?;
                    let group: Vec<usize> = (p.letter..p.letter + n).collect();
                    let ex = db.expanded.len();
                    crate::ownocr::teach(db, &p.pieces, &group, &text, italic, cfg.lines, cfg.algo, rng).ok_or("สร้างตัวอักษรไม่ได้")?;
                    // add ใส่ตัวใหม่ไว้หน้าสุดของรายการตัวเดี่ยวหรือตัวขยายจับ
                    let added = if db.expanded.len() > ex { db.expanded.first() } else { db.chars.first() }.cloned();
                    ensure_parent(&db.file)?;
                    db.save()?;
                    (name.clone(), added.map(HistKey::N).unwrap_or_default())
                }
                _ => {
                    let (name, db) = s.nocr.as_mut().ok_or("ยังไม่ได้โหลดฐาน nOCR")?;
                    let c = nocr_char(&p.parent, &p.pieces, p.letter, n, &text, italic, lines.as_ref(), cfg, rng).ok_or("สร้างตัวอักษรไม่ได้")?;
                    db.add(c.clone());
                    ensure_parent(&db.file)?;
                    db.save()?;
                    (name.clone(), HistKey::N(c))
                }
            };
            let preview = if n <= 1 { p.pieces.get(p.letter).and_then(|x| x.bmp.clone()) } else { crate::nocr_train::Group::create(&p.parent, &p.pieces, p.letter, n).map(|g| g.preview) };
            let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
            s.history.push(Taught { index: p.index, engine: p.engine.clone(), db: db_name, text, italic, pieces: n, png: preview.map(|b| png_url(&b)).unwrap_or_default(), at, key });
        }
    }
    Ok(())
}

/// ตัว nOCR จากชิ้นเดียวหรือหลายชิ้น · ตาม NOcrCharacterAddViewModel (ขนาด ระยะบน เส้นที่วาดเองหรือวาดตามจำนวนที่ตั้ง)
#[allow(clippy::too_many_arguments)]
fn nocr_char(parent: &Bmp, pieces: &[Piece], letter: usize, n: usize, text: &str, italic: bool, lines: Option<&DrawnLines>, cfg: &OcrCfg, rng: &mut Rng) -> Option<NChar> {
    let (mut c, bmp) = if n <= 1 {
        let p = pieces.get(letter)?;
        let b = p.bmp.clone()?;
        (NChar { width: b.width() as i32, height: b.height() as i32, margin_top: p.top, ..Default::default() }, b)
    } else {
        let g = crate::nocr_train::Group::create(parent, pieces, letter, n)?;
        let c = g.nchar(pieces);
        (c, g.preview)
    };
    c.text = text.into();
    c.italic = italic;
    match lines {
        Some(l) => {
            c.fg = l.fg.iter().map(|a| NLine::new(a[0], a[1], a[2], a[3])).collect();
            c.bg = l.bg.iter().map(|a| NLine::new(a[0], a[1], a[2], a[3])).collect();
        }
        None => generate(cfg.lines, false, &mut c, &bmp, cfg.algo, rng),
    }
    Some(c)
}

// ---------------------------------------------------------------- คำที่ไม่รู้จัก

/// ปุ่มของหน้าต่างคำที่ไม่รู้จัก · ตาม PromptUnknownWordWindow ของ Subtitle Edit
/// changeAll เปลี่ยนทั้งหมด (จำไว้ในรายการแก้คำของผู้ใช้) · skipAll ข้ามทั้งหมดในงานนี้ · addName เพิ่มชื่อ · addWord เพิ่มพจนานุกรมของผู้ใช้
pub fn word(s: &mut Session, action: &str, w: &str, to: Option<&str>) -> Result<(), String> {
    let fx = &mut s.fix.as_mut().ok_or("ยังไม่ได้เปิดตัวแก้คำ")?.1;
    let saved = match action {
        "changeAll" => fx.change_all(w, to.ok_or("ไม่มีคำที่จะเปลี่ยน")?),
        "skipAll" => { fx.skip_all(w); Ok(()) }
        "addName" => fx.add_name(w),
        "addWord" => fx.add_user_word(w).map(|_| ()),
        x => return Err(format!("ไม่รู้จักคำสั่ง {x}")),
    };
    // ใช้ในงานนี้แล้วเสมอ เขียนไฟล์ไม่ได้บอกหน้าจอ (ผู้ช่วยตรวจทาน R13 · เดิมตอบว่าสำเร็จเสมอ)
    saved.map_err(|e| format!("ใช้ในงานนี้แล้ว แต่บันทึกลงไฟล์ของผู้ใช้ไม่ได้ {e}"))
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
pub fn ocr_names(lines: Vec<String>) -> Vec<Vec<Reason>> { crate::suspect::name_variants(&lines) }

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

// ---------------------------------------------------------------- ตรวจบรรทัด

/// สถานะของหน้าต่างตรวจบรรทัด · ชิ้นของบรรทัดกับตัวในฐานที่จับคู่ได้ทีละชิ้น (ชิ้นที่ถูกตัวขยายจับกินไปชี้ตัวเดียวกัน)
pub struct Insp { index: usize, engine: String, db: String, parent: Bmp, letters: Vec<Piece>, nm: Vec<Option<NChar>>, bm: Vec<Option<crate::binocr::BMatch>> }

/// ตัวที่จับคู่ได้ของชิ้นหนึ่ง · fg bg เส้นเทียบในพิกัดของภาพที่แสดง (ภาพชิ้นหรือภาพรวมของตัวขยายจับ) · in_db ตัวนี้มาจากฐาน แก้หรือลบได้
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InspMatch { pub text: String, pub italic: bool, pub w: i32, pub h: i32, pub top: i32, pub expand: i32, pub fg: Vec<[i32; 4]>, pub bg: Vec<[i32; 4]>, pub in_db: bool }

/// ชิ้นหนึ่งของบรรทัด · special เว้นวรรคหรือขึ้นบรรทัด · cont ชิ้นที่ตัวขยายจับก่อนหน้ากินไป (หน้าต่างไม่แสดงปุ่มแยก แบบ OnLoaded)
/// x y w h กรอบที่แสดงในภาพบรรทัด (ตัวขยายจับใช้กรอบรวม) · png ภาพที่แสดง · top ระยะบนของภาพที่แสดง
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InspLetter { pub special: Option<String>, pub cont: bool, pub x: i32, pub y: i32, pub w: i32, pub h: i32, pub top: i32, pub png: String, pub m: Option<InspMatch> }

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InspView { pub index: usize, pub engine: String, pub db: String, pub sentence: String, pub sent_w: u32, pub sent_h: u32, pub letters: Vec<InspLetter> }

fn nlines_scaled(v: &[NLine], c: &NChar, w: i32, h: i32) -> Vec<[i32; 4]> {
    v.iter().map(|l| { let (a, b) = (l.scaled_start(c, w, h), l.scaled_end(c, w, h)); [a.x, a.y, b.x, b.y] }).collect()
}

impl Session {
    /// ภาพที่แสดงของชิ้น i · ตัวขยายจับ n ชิ้นใช้ภาพรวม (ExpandedOcrGroup) · คืนภาพ กรอบ ระยะบน
    fn insp_display(p: &Insp, i: usize, n: usize) -> Option<(Bmp, (i32, i32, i32, i32), i32)> {
        let it = p.letters.get(i)?;
        if n > 1 {
            if let Some(g) = crate::nocr_train::Group::create(&p.parent, &p.letters, i, n) {
                let (x0, y0, x1, y1) = g.bounds;
                return Some((g.preview.clone(), (x0, y0, x1 - x0, y1 - y0), g.top_margin(&p.letters)));
            }
        }
        let b = it.bmp.clone()?;
        let (w, h) = (b.width() as i32, b.height() as i32);
        Some((b, (it.x, it.y, w, h), it.top))
    }

    /// สร้างผลให้หน้าจอจากสถานะ
    fn insp_view(&self) -> Result<InspView, String> {
        let p = self.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?;
        let mut letters = vec![];
        for (i, it) in p.letters.iter().enumerate() {
            if it.bmp.is_none() {
                letters.push(InspLetter { special: Some(it.special.clone().unwrap_or_default()), cont: false, x: 0, y: 0, w: 0, h: 0, top: 0, png: String::new(), m: None });
                continue;
            }
            let (n, cont) = if p.engine == "binary" {
                let m = p.bm.get(i).cloned().flatten();
                let cont = i > 0 && m.as_ref().is_some_and(|x| x.expand > 1) && p.bm[i - 1].as_ref().is_some_and(|y| y.name == m.as_ref().unwrap().name && y.expand > 1);
                (m.map(|x| x.expand.max(1) as usize).unwrap_or(1), cont)
            } else {
                let m = p.nm.get(i).cloned().flatten();
                let cont = i > 0 && m.as_ref().is_some_and(|x| x.expand_count > 1) && p.nm[i - 1].as_ref() == m.as_ref();
                (m.map(|x| x.expand_count.max(1) as usize).unwrap_or(1), cont)
            };
            let Some((img, (x, y, w, h), top)) = Self::insp_display(p, i, if cont { 1 } else { n }) else { continue };
            let m = if p.engine == "binary" {
                p.bm[i].as_ref().map(|b| InspMatch { text: b.text.clone(), italic: b.italic, w, h, top, expand: b.expand, fg: vec![], bg: vec![], in_db: b.name.is_some() })
            } else {
                p.nm[i].as_ref().map(|c| InspMatch { text: c.text.clone(), italic: c.italic, w: c.width, h: c.height, top: c.margin_top, expand: c.expand_count,
                    fg: nlines_scaled(&c.fg, c, w, h), bg: nlines_scaled(&c.bg, c, w, h), in_db: true })
            };
            letters.push(InspLetter { special: None, cont, x, y, w, h, top, png: png_url(&img), m });
        }
        Ok(InspView { index: p.index, engine: p.engine.clone(), db: p.db.clone(), sentence: png_url(&p.parent), sent_w: p.parent.width(), sent_h: p.parent.height(), letters })
    }

    /// จับคู่ทุกชิ้นใหม่ด้วยฐานตอนนี้ · nOCR ตาม InspectLineNOcr (ตัวขยายจับกินชิ้นถัดไป) Binary ตาม InspectLineBinaryImageCompareOcr ตัวสอนเองเทียบทีละก้อน
    fn insp_match(&mut self, cfg: &OcrCfg) -> Result<(), String> {
        let mut p = self.insp.take().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?;
        let n = p.letters.len();
        p.nm = vec![None; n];
        p.bm = vec![None; n];
        match p.engine.as_str() {
            "binary" => {
                let db = &self.bin.as_ref().ok_or("ยังไม่ได้โหลดฐาน Binary OCR")?.1;
                let r = self.breader.as_ref().ok_or("ยังไม่ได้เตรียมตัวอ่าน Binary OCR")?;
                for i in 0..n {
                    if p.letters[i].bmp.is_none() { continue; }
                    p.bm[i] = r.matcher.lock().unwrap().compare(&p.letters, i, db, cfg.bin_max_err).0;
                }
            }
            "own" => {
                let db = &self.own.as_ref().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?.1;
                for (i, it) in p.letters.iter().enumerate() {
                    if let Some(b) = &it.bmp { p.nm[i] = db.match_single(b, it.top, true, cfg.max_wrong, false, false, crate::nocr::Placement::Unknown).0; }
                }
            }
            _ => {
                let db = &self.nocr.as_ref().ok_or("ยังไม่ได้โหลดฐาน nOCR")?.1;
                let mut i = 0;
                while i < n {
                    if p.letters[i].bmp.is_none() { i += 1; continue; }
                    let m = db.get_match(&p.parent, &p.letters, i, p.letters[i].top, true, cfg.max_wrong, cfg.last_ditch, if cfg.italic { 0.2 } else { 0.0 });
                    let ex = m.as_ref().map(|c| c.expand_count).unwrap_or(0);
                    if ex > 1 {
                        for k in 0..ex as usize { if i + k < n { p.nm[i + k] = m.clone(); } }
                        i += ex as usize;
                    } else { p.nm[i] = m; i += 1; }
                }
            }
        }
        self.insp = Some(p);
        Ok(())
    }

    /// ตัวในฐานที่ชิ้น li จับคู่ได้ (nOCR ตัวสอนเอง) · คืนฐานกับตำแหน่งในรายการรวม
    fn insp_ndb(&mut self, li: usize) -> Result<(&mut NOcrDb, usize), String> {
        let p = self.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?;
        let c = p.nm.get(li).cloned().flatten().ok_or("ตัวนี้ไม่มีคู่ในฐาน")?;
        let own = p.engine == "own";
        let db = if own { self.own.as_mut().map(|o| &mut o.1) } else { self.nocr.as_mut().map(|o| &mut o.1) }.ok_or("ฐานไม่ได้โหลดอยู่ เปิดหน้าต่างตรวจบรรทัดใหม่")?;
        let k = db.chars.iter().chain(db.expanded.iter()).position(|x| *x == c).ok_or("ตัวนี้ไม่อยู่ในฐานแล้ว เปิดหน้าต่างตรวจบรรทัดใหม่")?;
        Ok((db, k))
    }
}

/// เปิดหน้าต่างตรวจบรรทัดของภาพลำดับ index · แต่งภาพตามที่ตั้งแล้วแบ่งชิ้นแบบเดียวกับตอนอ่าน · ตาม InspectLine ของ OcrViewModel
pub fn inspect(s: &mut Session, d: &Dirs, cfg: &OcrCfg, index: usize) -> Result<InspView, String> {
    if !MATCHERS.contains(&cfg.engine.as_str()) { return Err("ตรวจบรรทัดได้เฉพาะตัวอ่านที่สอนเอง nOCR Binary OCR และตัวสอนเองของชั้นหนัง".into()); }
    let item = s.items.get(index).ok_or("ไม่มีภาพลำดับนี้ เปิดซับรูปใหม่")?.clone();
    let raw = image::open(&item.img.file).map_err(|e| format!("เปิดภาพซับลำดับที่ {} ไม่ได้ {e}", index + 1))?.to_rgba8();
    let img = crate::ocrprep::preprocess(&raw, &cfg.prep);
    s.ensure(d, cfg)?;
    let (parent, letters, db) = match cfg.engine.as_str() {
        "binary" => {
            let two = crate::ocrprep::make_two_color(&img, 200);
            let (parent, _) = crate::nocr_text::crop_top(&two);
            let r = s.breader.as_ref().ok_or("ยังไม่ได้เตรียมตัวอ่าน Binary OCR")?;
            let letters = crate::nocr_split::split_letters(&parent, cfg.bin_space_px, false, true, r.tracker.min_line_height(), true, r.tracker.average());
            (parent, letters, cfg.bin_db.clone())
        }
        "own" => {
            let db = &s.own.as_ref().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?.1;
            let r = s.oreader.read_text(db, &img, &OwnOpts { max_wrong: cfg.max_wrong, teach: false });
            (r.parent, r.pieces, cfg.own_db.clone())
        }
        _ => {
            let two = crate::ocrprep::make_two_color(&img, crate::ocrprep::two_color_threshold(&img));
            let (parent, _) = crate::nocr_text::crop_top(&two);
            let (letters, _) = s.nreader.split(&parent, cfg.space_px);
            (parent, letters, cfg.nocr_db.clone())
        }
    };
    s.insp = Some(Insp { index, engine: cfg.engine.clone(), db, parent, letters, nm: vec![], bm: vec![] });
    s.insp_match(cfg)?;
    s.insp_view()
}

/// บันทึกข้อความ ตัวเอียง และเส้นที่วาด (พิกัดของภาพที่แสดง) ของตัวที่ชิ้น li จับคู่ได้ · ตาม Update ของ NOcrInspectViewModel
/// Binary OCR บันทึกข้อความกับตัวเอียง (BinaryOcrInspectViewModel)
pub fn inspect_update(s: &mut Session, cfg: &OcrCfg, li: usize, text: &str, italic: bool, lines: Option<&DrawnLines>) -> Result<InspView, String> {
    if text.is_empty() { return Err("ข้อความของตัวอักษรว่างไม่ได้".into()); }
    let engine = s.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?.engine.clone();
    if engine == "binary" {
        let key = s.insp.as_ref().and_then(|p| p.bm.get(li).cloned().flatten()).and_then(|m| m.name).ok_or("ตัวนี้ไม่มีคู่ในฐาน")?;
        let (_, db) = s.bin.as_mut().ok_or("ฐานไม่ได้โหลดอยู่ เปิดหน้าต่างตรวจบรรทัดใหม่")?;
        let b = db.images.iter_mut().chain(db.expanded.iter_mut()).find(|b| b.key() == key).ok_or("ตัวนี้ไม่อยู่ในฐานแล้ว")?;
        b.text = Some(text.into());
        b.italic = italic;
        ensure_parent(&db.file)?;
        db.save()?;
    } else {
        let disp = { let p = s.insp.as_ref().unwrap(); let n = p.nm.get(li).cloned().flatten().map(|c| c.expand_count.max(1) as usize).unwrap_or(1); Session::insp_display(p, li, n).map(|x| (x.1 .2, x.1 .3)) };
        let (db, k) = s.insp_ndb(li)?;
        let nc = db.chars.len();
        let c = if k < nc { &mut db.chars[k] } else { &mut db.expanded[k - nc] };
        c.text = text.into();
        c.italic = italic;
        // เส้นที่วาดในพิกัดภาพที่แสดง แปลงเป็นพิกัดของตัว ปัดครึ่งออกจากศูนย์แบบ MidpointRounding.AwayFromZero
        if let (Some(l), Some((bw, bh))) = (lines, disp) {
            let sx = |v: i32| ((v as f64) * c.width as f64 / bw.max(1) as f64).round() as i32;
            let sy = |v: i32| ((v as f64) * c.height as f64 / bh.max(1) as f64).round() as i32;
            c.fg = l.fg.iter().map(|a| NLine::new(sx(a[0]), sy(a[1]), sx(a[2]), sy(a[3]))).collect();
            c.bg = l.bg.iter().map(|a| NLine::new(sx(a[0]), sy(a[1]), sx(a[2]), sy(a[3]))).collect();
        }
        db.clear_cache();
        ensure_parent(&db.file)?;
        db.save()?;
    }
    s.insp_match(cfg)?;
    s.insp_view()
}

/// ลบตัวที่ชิ้น li จับคู่ได้ออกจากฐาน แล้วจับคู่ใหม่ · ตาม Delete ของ NOcrInspectViewModel
pub fn inspect_delete(s: &mut Session, cfg: &OcrCfg, li: usize) -> Result<InspView, String> {
    let engine = s.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?.engine.clone();
    if engine == "binary" {
        let key = s.insp.as_ref().and_then(|p| p.bm.get(li).cloned().flatten()).and_then(|m| m.name).ok_or("ตัวนี้ไม่มีคู่ในฐาน")?;
        let (_, db) = s.bin.as_mut().ok_or("ฐานไม่ได้โหลดอยู่ เปิดหน้าต่างตรวจบรรทัดใหม่")?;
        db.remove(&key);
        ensure_parent(&db.file)?;
        db.save()?;
    } else {
        let (db, k) = s.insp_ndb(li)?;
        let nc = db.chars.len();
        if k < nc { db.chars.remove(k); } else { db.expanded.remove(k - nc); }
        db.clear_cache();
        ensure_parent(&db.file)?;
        db.save()?;
    }
    s.insp_match(cfg)?;
    s.insp_view()
}

/// วาดเส้นเทียบใหม่ตามจำนวนที่ตั้ง บนภาพที่แสดงของชิ้น li · ยังไม่บันทึก กดบันทึกจึงเก็บ · ตาม DrawAgain
pub fn inspect_draw(s: &mut Session, cfg: &OcrCfg, li: usize, n_lines: usize) -> Result<(Vec<[i32; 4]>, Vec<[i32; 4]>), String> {
    let p = s.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?;
    let n = p.nm.get(li).cloned().flatten().map(|c| c.expand_count.max(1) as usize).unwrap_or(1);
    let (img, (_, _, w, h), _) = Session::insp_display(p, li, n).ok_or("ชิ้นนี้ไม่มีภาพ")?;
    let mut c = NChar { width: w, height: h, ..Default::default() };
    let rng = s.rng.get_or_insert_with(Rng::from_time);
    generate(n_lines, false, &mut c, &img, cfg.algo, rng);
    let f = |v: &[NLine]| v.iter().map(|l| [l.start.x, l.start.y, l.end.x, l.end.y]).collect();
    Ok((f(&c.fg), f(&c.bg)))
}

/// เพิ่มคู่ที่ดีกว่าให้ชิ้น li · ตั้งตัวที่รอสอนแล้วคืนคำขอสอนให้หน้าต่างสอนตัวอักษร ตอบผ่าน ocr_teach ตามปกติ · ตาม AddBetterMatch
pub fn inspect_teach(s: &mut Session, cfg: &OcrCfg, li: usize) -> Result<TeachReq, String> {
    let p = s.insp.as_ref().ok_or("ยังไม่ได้เปิดหน้าต่างตรวจบรรทัด")?;
    if p.letters.get(li).and_then(|x| x.bmp.as_ref()).is_none() { return Err("ชิ้นนี้ไม่มีภาพ".into()); }
    let (index, engine, parent, pieces) = (p.index, p.engine.clone(), p.parent.clone(), p.letters.clone());
    let c2 = OcrCfg { engine: engine.clone(), ..cfg.clone() };
    let req = teach_req(s, &c2, index, li, &parent, &pieces);
    s.pending = Some(Pending { index, engine, letter: li, parent, pieces });
    Ok(req)
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
        Ok(png_url(&crate::ocrprep::preprocess(&img, &prep)))
    }).await.map_err(|e| e.to_string())?
}

/// โมเดล PaddleOCR ที่แนบมา (ชื่อโฟลเดอร์ที่มี inference.onnx)
#[tauri::command]
pub fn ocr_paddle_models(app: tauri::AppHandle) -> Result<Vec<String>, String> { Ok(crate::paddle::models(&Dirs::of(&app)?.ocr)) }

/// ลบฐานของผู้ใช้ลงถังขยะ (หน้าต่างตั้งค่า nOCR ปุ่มลบ) · ฐานที่แนบมาลบไม่ได้ · ฐานที่โหลดอยู่ในงานนี้ปิดก่อน
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_db_delete(app: tauri::AppHandle, kind: String, name: String) -> Result<(), String> {
    check_name(&name)?;
    let d = Dirs::of(&app)?;
    let (_, user) = db_paths(&d, &kind, &name);
    if !user.is_file() { return Err(format!("ฐาน {name} เป็นฐานที่แนบมากับโปรแกรม ลบไม่ได้")); }
    crate::outfile::to_trash(&user)?;
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
            if !dry { crate::winutil::clipboard_image(hwnd, &png, &img)?; }
            return Ok(String::new());
        }
        let want = PathBuf::from(path.ok_or("ยังไม่ได้เลือกที่เก็บ")?);
        let dir = want.parent().filter(|d| d.is_dir()).ok_or("หาโฟลเดอร์ที่เก็บไม่เจอ")?.to_path_buf();
        let out = crate::outfile::free_name(&dir, &want);
        // เขียนไฟล์ชั่วคราวแล้วย้ายแบบไม่ทับ ตามกฎไฟล์ของโปรแกรม (ผู้ช่วยตรวจทาน R14 · เดิมเขียนตรงที่ชื่อว่าง)
        let part = crate::subdoc::partial_of(&out);
        std::fs::write(&part, &png).map_err(|e| format!("บันทึกภาพไม่ได้ {e}"))?;
        crate::rename::move_no_replace(&part, &out).map_err(|p| { let _ = std::fs::remove_file(&part); format!("บันทึกภาพไม่ได้ {}", p.title) })?;
        Ok(out.display().to_string())
    }).await.map_err(|e| e.to_string())?
}

/// หยุดงาน · ล้างตัวที่รอสอนกับคำตอบที่ผูกกับภาพ
// รันนอกเธรดหลักของหน้าต่าง · คำสั่งนี้รอล็อกของงานอ่านได้ระหว่างอ่านภาพ บนเธรดหลักหน้าต่างค้าง (ผู้ช่วยตรวจทาน R5)
#[tauri::command(async)]
pub fn ocr_stop() {
    if let Some(s) = session().as_mut() { s.pending = None; s.skip.clear(); s.once.clear(); }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dirs(tag: &str) -> Dirs {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        let tmp = std::env::temp_dir().join(format!("movie-shelf-ocrjob-{tag}"));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        Dirs { ocr: root.join("ocr"), tools: root, user: tmp.join("user"), work: tmp.join("work") }
    }

    fn th_items(d: &Dirs) -> Option<Vec<OcrItem>> {
        let sup = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("ocr").join("th.sup");
        if !sup.exists() || !d.tools.join("ffmpeg.exe").exists() { assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มี th.sup"); return None; }
        std::fs::create_dir_all(&d.work).unwrap();
        let src = crate::ocrsrc::open(&d.tools, &d.work, &sup, 0, &|_: f64| {}).unwrap();
        Some(src.items)
    }

    /// หน้าต่างตรวจบรรทัด ฐานว่างไม่มีคู่ เพิ่มคู่ที่ดีกว่าผ่านหน้าต่างสอน วาดเส้นใหม่ บันทึกข้อความกับเส้น ลบ · Binary กับตัวสอนเองเปิดได้ PaddleOCR ไม่ได้
    #[test]
    fn inspect_window_flow() {
        let d = dirs("inspect");
        let Some(items) = th_items(&d) else { return };
        let mut s = Session::with_items(items);
        let cfg = OcrCfg { engine: "nocr".into(), nocr_db: "ทดสอบ".into(), fix: false, teach: false, ..Default::default() };
        // ฐานว่าง ทุกชิ้นไม่มีคู่ เพิ่มคู่ที่ดีกว่าให้ชิ้นแรกผ่านหน้าต่างสอน
        let v = inspect(&mut s, &d, &cfg, 0).unwrap();
        assert!(v.sentence.starts_with("data:image/png") && v.letters.len() > 3);
        let first = v.letters.iter().position(|l| l.special.is_none()).unwrap();
        assert!(v.letters.iter().all(|l| l.m.is_none()), "ฐานว่างต้องไม่มีคู่");
        let req = inspect_teach(&mut s, &cfg, first).unwrap();
        assert_eq!(req.letter, first);
        teach(&mut s, &cfg, TeachAnswer::Learn { text: "ก".into(), italic: false, expand: 0, lines: None }).unwrap();
        let v = ocr_inspect_reload_with(&mut s, &cfg);
        let m = v.letters[first].m.clone().expect("สอนแล้วต้องจับคู่ได้");
        assert!(m.text == "ก" && m.in_db && !m.fg.is_empty());
        // วาดใหม่ได้เส้น แล้วบันทึกข้อความใหม่พร้อมเส้น ฐานเปลี่ยนตาม
        let (fg, bg) = inspect_draw(&mut s, &cfg, first, 30).unwrap();
        assert!(!fg.is_empty() || !bg.is_empty());
        let v = inspect_update(&mut s, &cfg, first, "ข", true, Some(&DrawnLines { fg: fg.clone(), bg: bg.clone() })).unwrap();
        let m = v.letters[first].m.clone().expect("แก้แล้วยังจับคู่ได้");
        assert!(m.text == "ข" && m.italic);
        let file = d.user.join("nocr").join("ทดสอบ.nocr");
        let db = NOcrDb::load(&file).unwrap();
        assert!(db.chars.iter().any(|c| c.text == "ข" && c.italic && c.fg.len() == fg.len()), "เส้นที่วาดต้องบันทึก");
        assert!(inspect_update(&mut s, &cfg, first, "", false, None).is_err());
        // ลบแล้วชิ้นนั้นไม่มีคู่ ฐานว่าง
        let v = inspect_delete(&mut s, &cfg, first).unwrap();
        assert!(v.letters[first].m.is_none());
        assert_eq!(NOcrDb::load(&file).unwrap().total(), 0);
        assert!(inspect_delete(&mut s, &cfg, first).is_err(), "ไม่มีคู่แล้วลบไม่ได้");
        // Binary OCR กับตัวสอนเองเปิดได้ · ตัวอ่าน PaddleOCR ตรวจบรรทัดไม่ได้
        let vb = inspect(&mut s, &d, &OcrCfg { engine: "binary".into(), bin_db: "ทดสอบ".into(), ..cfg.clone() }, 0).unwrap();
        assert!(vb.letters.iter().any(|l| l.special.is_none()) && vb.engine == "binary");
        let vo = inspect(&mut s, &d, &OcrCfg { engine: "own".into(), own_db: "ทดสอบ".into(), ..cfg.clone() }, 0).unwrap();
        assert!(vo.letters.iter().any(|l| l.special.is_none()));
        assert!(inspect(&mut s, &d, &OcrCfg { engine: "paddle".into(), ..cfg.clone() }, 0).is_err());
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ผลของตัวอ่านข้อความอิสระ ขีดบทพูดต่อกลับเข้าบรรทัด เว้นวรรคระหว่างอักษรญี่ปุ่นตัดทิ้ง ไทยกับอังกฤษคงเดิม (ผู้ช่วยตรวจทาน T8 T14)
    #[test]
    fn tidy_free_text() {
        assert_eq!(tidy_free("ゴ ジ ラ が\n来る"), "ゴジラが\n来る");
        assert_eq!(tidy_free("สวัสดี ครับ Hello world"), "สวัสดี ครับ Hello world");
        assert_eq!(tidy_free("咆哮　が"), "咆哮　が");
        assert_eq!(tidy_free("-\nHello\n-\nBye"), crate::ocrfix::fix_lone_dashes("-\nHello\n-\nBye"));
        assert_ne!(tidy_free("-\nHello\n-\nBye"), "-\nHello\n-\nBye");
    }

    /// วาดสีใหม่หลังลบบรรทัด ภาพตามเลขภาพ ไม่ตามลำดับ (ผู้ช่วยตรวจทาน R1)
    #[test]
    fn images_follow_file_not_order() {
        // ลบบรรทัดที่ 2 แล้ววาดสีใหม่ทั้งไฟล์ (ได้ภาพครบทุกเลข) ภาพของบรรทัดที่เหลือต้องเป็นเลขเดิมของตัวเอง ไม่เลื่อน (ผู้ช่วยตรวจทาน R1)
        let d = dirs("apply");
        let Some(items) = th_items(&d) else { return };
        let mut s = Session::with_items(items.clone());
        remove_items(&mut s, &[1]);
        let mut fresh: Vec<crate::subs::SubImg> = items.iter().map(|i| i.img.clone()).collect();
        for f in fresh.iter_mut() { f.w += 1000; }
        apply_images(&mut s, &fresh);
        assert_eq!(s.items.len(), items.len() - 1);
        for it in &s.items { assert_eq!(it.img.w, items.iter().find(|x| x.img.n == it.img.n).unwrap().img.w + 1000, "ภาพที่ {} ต้องได้ภาพของตัวเอง", it.img.n); }
        assert!(s.items.iter().all(|it| it.img.n != items[1].img.n));
        // ภาพของซับอื่น (ไฟล์คนละที่) ไม่แตะ
        let mut other = fresh.clone();
        for f in other.iter_mut() { f.file = std::path::PathBuf::from("Z:/อื่น").join(f.file.file_name().unwrap()); f.w = 1; }
        apply_images(&mut s, &other);
        assert!(s.items.iter().all(|it| it.img.w > 1000));
    }

    /// ลบภาพลำดับ 1 กับ 3 ข้อความของภาพอื่นเลื่อนลำดับตาม ประวัติของภาพที่ลบหายไป
    #[test]
    fn remove_items_shifts_state() {
        let d = dirs("remove");
        let Some(items) = th_items(&d) else { return };
        let n = items.len();
        let mut s = Session::with_items(items);
        for k in 0..5 { s.texts.insert(k, format!("t{k}")); }
        s.history.push(Taught { index: 3, engine: "nocr".into(), db: "x".into(), text: "a".into(), italic: false, pieces: 1, png: String::new(), at: 0, key: HistKey::None });
        s.history.push(Taught { index: 4, engine: "nocr".into(), db: "x".into(), text: "b".into(), italic: false, pieces: 1, png: String::new(), at: 0, key: HistKey::None });
        remove_items(&mut s, &[1, 3, 999]);
        assert_eq!(s.items.len(), n - 2);
        assert_eq!((s.texts[&0].as_str(), s.texts[&1].as_str(), s.texts[&2].as_str()), ("t0", "t2", "t4"));
        assert!(s.texts.get(&3).is_none());
        assert_eq!(s.history.len(), 1);
        assert_eq!((s.history[0].text.as_str(), s.history[0].index), ("b", 2));
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    fn ocr_inspect_reload_with(s: &mut Session, cfg: &OcrCfg) -> InspView { s.insp_match(cfg).unwrap(); s.insp_view().unwrap() }

    /// ฐาน nOCR ว่าง เปิดหยุดสอน · ภาพแรกต้องได้คำขอสอน ข้ามทุกตัวจนได้ผลที่เป็น * ทั้งหมด
    /// สอนตัวแรกแล้วฐานบันทึกลงโฟลเดอร์ของผู้ใช้ เปิดฐานใหม่เจอตัวที่สอน · ใช้ครั้งเดียวได้ข้อความนั้นในผล · หยุดล้างคำตอบ
    #[test]
    fn teach_loop_with_empty_nocr_db() {
        let d = dirs("teach");
        let Some(items) = th_items(&d) else { return };
        let mut s = Session::with_items(items);
        let cfg = OcrCfg { engine: "nocr".into(), nocr_db: "ทดสอบ".into(), fix: false, ..Default::default() };
        // ข้ามทุกตัว
        let mut asked = 0;
        let out = loop {
            match read(&mut s, &d, &cfg, 0).unwrap() {
                ReadResult::Teach(r) => {
                    assert!(r.image.starts_with("data:image/png;base64,") && r.boxes[r.letter].is_some());
                    asked += 1;
                    assert!(asked < 200, "ถามไม่จบ");
                    teach(&mut s, &cfg, TeachAnswer::Skip).unwrap();
                }
                ReadResult::Done(o) => break o,
            }
        };
        assert!(asked > 3, "ภาพไทยต้องมีหลายชิ้น ได้ {asked}");
        assert_eq!(out.unreadable, asked);
        assert!(out.reasons.contains(&Reason::Unreadable), "{:?}", out.reasons);
        // ครั้งใหม่ ถามตัวแรกอีก สอนเป็น "ก"
        let ReadResult::Teach(r) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ต้องถามสอนอีกครั้ง") };
        assert_eq!(r.letter, 0);
        teach(&mut s, &cfg, TeachAnswer::Learn { text: "ก".into(), italic: false, expand: 0, lines: None }).unwrap();
        let file = d.user.join("nocr").join("ทดสอบ.nocr");
        assert!(file.is_file(), "ฐานต้องบันทึกลงโฟลเดอร์ของผู้ใช้");
        assert_eq!(NOcrDb::load(&file).unwrap().chars.iter().filter(|c| c.text == "ก").count(), 1);
        assert_eq!(s.history.len(), 1);
        // หน้าต่างตัวที่สอนไปแล้ว มีภาพ แก้ข้อความกับตัวเอียงแล้วฐานเปลี่ยนตาม ข้อความว่างไม่บันทึก
        assert!(s.history[0].png.starts_with("data:image/png") && s.history[0].at > 0);
        history_update(&mut s, 0, "ข", true).unwrap();
        let f = NOcrDb::load(&file).unwrap();
        assert!(f.chars.iter().any(|c| c.text == "ข" && c.italic) && !f.chars.iter().any(|c| c.text == "ก"));
        assert!(s.history[0].text == "ข" && s.history[0].italic);
        assert!(history_update(&mut s, 0, "", false).is_err());
        assert!(history_update(&mut s, 5, "x", false).is_err());
        // อ่านซ้ำ ตัวแรกจับคู่ได้แล้ว ตัวที่ถามต้องไม่ใช่ตัวแรก แล้วใช้ครั้งเดียว "x" กับตัวนั้น หยุดทั้งงาน
        let ReadResult::Teach(r2) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ยังมีตัวที่ไม่รู้จัก") };
        assert!(r2.letter > 0, "ตัวที่สอนแล้วต้องไม่ถามซ้ำ");
        teach(&mut s, &cfg, TeachAnswer::Once { text: "x".into(), expand: 0 }).unwrap();
        assert_eq!(s.once.get(&0).and_then(|m| m.get(&r2.letter)).map(String::as_str), Some("x"));
        let ReadResult::Teach(_) = read(&mut s, &d, &cfg, 0).unwrap() else { panic!("ยังมีตัวที่ไม่รู้จัก") };
        teach(&mut s, &cfg, TeachAnswer::Stop).unwrap();
        assert!(s.once.get(&0).is_none() && s.skip.get(&0).is_none() && s.pending.is_none());
        assert!(teach(&mut s, &cfg, TeachAnswer::Skip).is_err(), "ไม่มีตัวที่รอสอนแล้ว");
        // เปิดงานใหม่ ฐานของผู้ใช้ถูกเปิดแทนฐานว่าง
        let s2 = load_nocr(&d, "nocr", "ทดสอบ").unwrap();
        assert_eq!(s2.chars.len(), 1);
        // ลบจากหน้าต่างตัวที่สอนไปแล้ว ฐานกับประวัติไม่มีตัวนั้น
        history_delete(&mut s, 0).unwrap();
        assert!(s.history.is_empty());
        assert_eq!(NOcrDb::load(&file).unwrap().chars.len(), 0);
        assert!(load_nocr(&d, "nocr", "../x").is_err());
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ฐานที่แนบมาเปิดได้ แต่ที่บันทึกเป็นโฟลเดอร์ของผู้ใช้ · ฐานของผู้ใช้ชื่อเดียวกันมาก่อน
    #[test]
    fn bundled_db_saves_to_user_dir() {
        let d = dirs("paths");
        if !d.ocr.join("Ocr").join("Latin.nocr").is_file() { return; }
        let (from, to) = db_paths(&d, "nocr", "Latin");
        assert_eq!(from, d.ocr.join("Ocr").join("Latin.nocr"));
        assert_eq!(to, d.user.join("nocr").join("Latin.nocr"));
        let db = load_nocr(&d, "nocr", "Latin").unwrap();
        assert!(db.chars.len() > 100 && db.file == to);
        std::fs::create_dir_all(to.parent().unwrap()).unwrap();
        db.save().unwrap();
        assert_eq!(db_paths(&d, "nocr", "Latin").0, to);
        let l = db_list(&d);
        assert!(l.nocr.contains(&"Latin".to_string()) && l.binary.contains(&"Latin".to_string()));
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ซับไทย ตัวหลัก PaddleOCR th ตัวช่วย PaddleOCR th ขนาดอื่นไม่มี จึงใช้ตัวสอนเองฐานว่างเป็นตัวช่วย (อ่านได้ * ทุกตัว ต้องถูกชี้)
    /// ตัวแก้คำไทยไม่มีพจนานุกรม ไม่มีคำที่ไม่รู้จัก · ตำแหน่งแบบ ASS ของภาพที่มีป้ายบนจอกับบทพูดแยกทีละบรรทัด
    #[test]
    fn paddle_thai_with_helper_and_fix() {
        let d = dirs("thai");
        let Some(items) = th_items(&d) else { return };
        let n = items.len();
        let mut s = Session::with_items(items);
        let cfg = OcrCfg { paddle: PaddleOpts { lang: "th".into(), ..Default::default() }, helpers: vec!["own".into(), "paddle:small".into()], lang3: "tha".into(), dict: String::new(), ..Default::default() };
        let mut any_split = false;
        for i in 0..n {
            let ReadResult::Done(o) = read(&mut s, &d, &cfg, i).unwrap() else { panic!("PaddleOCR ไม่หยุดสอน") };
            assert!(o.conf.is_some() && o.unknown.is_empty(), "{o:?}");
            assert_eq!(o.helpers.len(), 1, "paddle:small ซ้ำกับตัวหลัก ต้องข้าม");
            assert_eq!(o.helpers[0].0, "ตัวสอนเอง");
            if !o.text.is_empty() { assert!(o.reasons.iter().any(|r| matches!(r, Reason::Disagree { .. })), "ภาพ {} {:?}", i + 1, o.reasons); }
            if o.an_lines.as_ref().is_some_and(|v| v.first() != v.last()) { any_split = true; }
        }
        eprintln!("ซับไทย {n} ภาพ มีภาพที่ตำแหน่งแยกทีละบรรทัด {any_split}");
        assert_eq!(s.texts.len(), n);
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ภาพซับไทยสามภาพวางซ้อนเป็นภาพเดียวสามบรรทัด (ห่างกัน 10 จุด ก้อนเดียวกัน) อ่านจริงด้วย PaddleOCR
    /// เปิดตัดบรรทัดเองได้สองบรรทัด ข้อความครบ · ปิดได้สามบรรทัดตามภาพ (ocrbreak.rs AutoBreakIfNeeded)
    #[test]
    fn auto_break_three_line_image() {
        let d = dirs("autobreak");
        let Some(items) = th_items(&d) else { return };
        // ภาพบรรทัดเดียว ครอปส่วนใสออก (ภาพบางภาพของไฟล์ทดสอบมีป้ายบนจอแยกจากบทพูด)
        let parts: Vec<image::RgbaImage> = items.iter().map(|it| crate::ocrprep::crop_transparent(&image::open(&it.img.file).unwrap().to_rgba8()).0).filter(|p| p.height() < 110).take(3).collect();
        assert_eq!(parts.len(), 3, "ซับไทยทดสอบต้องมีภาพบรรทัดเดียวอย่างน้อยสามภาพ");
        let w = parts.iter().map(|p| p.width()).max().unwrap();
        let h = parts.iter().map(|p| p.height()).sum::<u32>() + 20;
        let mut big = image::RgbaImage::new(w, h);
        let mut y = 0;
        for p in &parts {
            image::imageops::overlay(&mut big, p, ((w - p.width()) / 2) as i64, y as i64);
            y += p.height() + 10;
        }
        let file = d.work.join("three.png");
        big.save(&file).unwrap();
        let first = &items[0].img;
        let img = crate::subs::SubImg { n: 1, start: first.start, end: first.end, w, h, canvas: first.canvas, at: [first.canvas[0].saturating_sub(w) / 2, first.canvas[1].saturating_sub(h + 40)], forced: false, file };
        eprintln!("จอ {:?} ภาพ {w}x{h}", first.canvas);
        assert!(!crate::ocrsrc::has_separated_blocks(&big, &img), "สามบรรทัดชิดกันต้องเป็นก้อนเดียว");
        let base = OcrCfg { paddle: PaddleOpts { lang: "th".into(), ..Default::default() }, lang3: "tha".into(), dict: String::new(), fix: false, ..Default::default() };
        let run = |auto: bool| {
            let mut s = Session::with_items(vec![OcrItem { an: 2, img: img.clone() }]);
            let ReadResult::Done(o) = read(&mut s, &d, &OcrCfg { auto_break: auto, ..base.clone() }, 0).unwrap() else { panic!() };
            o
        };
        let off = run(false);
        let on = run(true);
        eprintln!("ปิด {:?}\nเปิด {:?}", off.text, on.text);
        assert!(crate::ocrbreak::number_of_lines(&off.text) >= 3, "{:?}", off.text);
        assert_eq!(crate::ocrbreak::number_of_lines(&on.text), 2, "{:?}", on.text);
        let squash = |t: &str| t.split_whitespace().collect::<String>();
        assert_eq!(squash(&on.text), squash(&off.text), "ตัดบรรทัดแล้วข้อความต้องครบ");
        assert_eq!(on.raw, off.raw, "ข้อความดิบของตัวอ่านไม่ถูกแก้");
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }

    /// ACCA 30 ภาพแรก ตัวหลัก PaddleOCR ตัวช่วย Tesseract กับตัวแก้คำภาษาอังกฤษ · ตั้ง MOVIE_SHELF_OCR_SUP
    #[test]
    fn acca_paddle_tesseract_fix() {
        let Ok(sup) = std::env::var("MOVIE_SHELF_OCR_SUP") else { eprintln!("ข้าม ไม่ได้ตั้งไฟล์ ACCA"); return };
        let d = dirs("acca");
        std::fs::create_dir_all(&d.work).unwrap();
        let src = crate::ocrsrc::open(&d.tools, &d.work, Path::new(&sup), 0, &|_: f64| {}).unwrap();
        assert_eq!(src.items.len(), 439);
        let mut s = Session::with_items(src.items);
        let cfg = OcrCfg { helpers: vec!["tesseract".into()], ..Default::default() };
        let (mut flagged, mut ms) = (0, 0);
        for i in 0..30 {
            let ReadResult::Done(o) = read(&mut s, &d, &cfg, i).unwrap() else { panic!() };
            assert!(!o.text.is_empty() && o.helpers.len() == 1 && o.helpers[0].0 == "Tesseract");
            if !o.reasons.is_empty() { flagged += 1; }
            ms += o.ms;
        }
        eprintln!("ACCA 30 ภาพ ถูกชี้ {flagged} ภาพ เฉลี่ย {} ms ต่อภาพ", ms / 30);
        // ชื่อสองแบบดูทั้งไฟล์
        let lines: Vec<String> = (0..30).map(|i| s.texts[&i].clone()).collect();
        assert_eq!(ocr_names(lines).len(), 30);
        let _ = std::fs::remove_dir_all(d.user.parent().unwrap());
    }
}
