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
fn check_name(name: &str) -> Result<(), String> {
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

fn load_nocr(d: &Dirs, kind: &str, name: &str) -> Result<NOcrDb, String> {
    check_name(name)?;
    let (from, to) = db_paths(d, kind, name);
    let mut db = if from.is_file() { NOcrDb::load(&from)? } else { NOcrDb::empty(&to) };
    db.file = to;
    Ok(db)
}

fn load_bin(d: &Dirs, name: &str) -> Result<BinDb, String> {
    check_name(name)?;
    let (from, to) = db_paths(d, "binary", name);
    let mut db = if from.is_file() { BinDb::load(&from)? } else { BinDb::empty(&to) };
    db.file = to;
    Ok(db)
}

fn ensure_parent(f: &Path) -> Result<(), String> {
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
pub struct Taught { pub index: usize, pub engine: String, pub db: String, pub text: String, pub italic: bool, pub pieces: usize }

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
}

static SESSION: Mutex<Option<Session>> = Mutex::new(None);

fn session() -> MutexGuard<'static, Option<Session>> { SESSION.lock().unwrap_or_else(|e| e.into_inner()) }

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
            "paddle" => crate::paddle::read_text(&d.ocr, img, &cfg.paddle).ok().map(|x| x.0),
            "tesseract" => crate::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, img, &cfg.tess, None).ok().map(|x| x.text),
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

fn png_url(img: &Bmp) -> String {
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
        "paddle" => { let (t, c) = crate::paddle::read_text(&d.ocr, &img, &cfg.paddle)?; (t, Some(c), 0, None) }
        "tesseract" => { let o = crate::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, &img, &cfg.tess, None)?; (o.text, Some(o.conf), 0, None) }
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
        Some(crate::ocrbreak::auto_break_line(&raw, &crate::ocrbreak::lang_of_dict(&cfg.dict)))
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
#[derive(Deserialize, Clone, Debug)]
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
            let db_name = match p.engine.as_str() {
                "binary" => {
                    let (name, db) = s.bin.as_mut().ok_or("ยังไม่ได้โหลดฐาน Binary OCR")?;
                    let b = crate::binocr::teach_bitmap(&p.pieces, p.letter, n, &text, italic).ok_or("สร้างภาพตัวอักษรไม่ได้")?;
                    db.add(b)?;
                    ensure_parent(&db.file)?;
                    db.save()?;
                    name.clone()
                }
                "own" => {
                    let (name, db) = s.own.as_mut().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?;
                    let group: Vec<usize> = (p.letter..p.letter + n).collect();
                    crate::ownocr::teach(db, &p.pieces, &group, &text, italic, cfg.lines, cfg.algo, rng).ok_or("สร้างตัวอักษรไม่ได้")?;
                    ensure_parent(&db.file)?;
                    db.save()?;
                    name.clone()
                }
                _ => {
                    let (name, db) = s.nocr.as_mut().ok_or("ยังไม่ได้โหลดฐาน nOCR")?;
                    let c = nocr_char(&p.parent, &p.pieces, p.letter, n, &text, italic, lines.as_ref(), cfg, rng).ok_or("สร้างตัวอักษรไม่ได้")?;
                    db.add(c);
                    ensure_parent(&db.file)?;
                    db.save()?;
                    name.clone()
                }
            };
            s.history.push(Taught { index: p.index, engine: p.engine.clone(), db: db_name, text, italic, pieces: n });
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
    match action {
        "changeAll" => fx.change_all(w, to.ok_or("ไม่มีคำที่จะเปลี่ยน")?),
        "skipAll" => fx.skip_all(w),
        "addName" => fx.add_name(w),
        "addWord" => { fx.add_user_word(w); }
        x => return Err(format!("ไม่รู้จักคำสั่ง {x}")),
    }
    Ok(())
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
#[tauri::command]
pub fn ocr_word(action: String, word: String, to: Option<String>) -> Result<(), String> {
    with_session(|s| self::word(s, &action, &word, to.as_deref()))
}

/// คำแนะนำของคำที่ไม่รู้จัก
#[tauri::command]
pub fn ocr_suggest(word: String) -> Result<Vec<String>, String> {
    with_session(|s| Ok(s.fix.as_ref().map(|f| f.1.suggestions(&word)).unwrap_or_default()))
}

/// ชื่อเดียวกันเขียนสองแบบ ดูทั้งไฟล์ · หน้าจอเรียกหลังอ่านครบหรือหลังแก้ข้อความ
#[tauri::command]
pub fn ocr_names(lines: Vec<String>) -> Vec<Vec<Reason>> { crate::suspect::name_variants(&lines) }

/// รายชื่อฐานที่มี
#[tauri::command]
pub fn ocr_dbs(app: tauri::AppHandle) -> Result<DbList, String> { Ok(db_list(&Dirs::of(&app)?)) }

/// ตัวที่สอนไปแล้วในงานนี้
#[tauri::command]
pub fn ocr_history() -> Vec<Taught> { session().as_ref().map(|s| s.history.clone()).unwrap_or_default() }

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
#[tauri::command]
pub fn ocr_db_delete(app: tauri::AppHandle, kind: String, name: String) -> Result<(), String> {
    check_name(&name)?;
    let d = Dirs::of(&app)?;
    let (_, user) = db_paths(&d, &kind, &name);
    if !user.is_file() { return Err(format!("ฐาน {name} เป็นฐานที่แนบมากับโปรแกรม ลบไม่ได้")); }
    crate::outfile::to_trash(&user)?;
    if let Some(s) = session().as_mut() {
        if s.nocr.as_ref().is_some_and(|x| x.0 == name) && kind == "nocr" { s.nocr = None; }
        if s.bin.as_ref().is_some_and(|x| x.0 == name) && kind == "binary" { s.bin = None; }
        if s.own.as_ref().is_some_and(|x| x.0 == name) && kind == "own" { s.own = None; }
    }
    Ok(())
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
        std::fs::write(&out, &png).map_err(|e| format!("บันทึกภาพไม่ได้ {e}"))?;
        Ok(out.display().to_string())
    }).await.map_err(|e| e.to_string())?
}

/// หยุดงาน · ล้างตัวที่รอสอนกับคำตอบที่ผูกกับภาพ
#[tauri::command]
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
