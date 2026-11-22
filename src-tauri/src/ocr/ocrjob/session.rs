//! งาน OCR งานหนึ่งไฟล์ อ่านภาพทีละภาพด้วยตัวอ่านที่เลือก
//! แยกจาก ocrjob/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- งานหนึ่งไฟล์

/// ตัวที่รอสอน · ชิ้นทั้งหมดของภาพกับภาพสองสีที่ตัวอ่านเห็น
pub(crate) struct Pending { pub(crate) index: usize, pub(crate) engine: String, pub(crate) letter: usize, pub(crate) parent: Bmp, pub(crate) pieces: Vec<Piece> }

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
    pub(crate) items: Vec<OcrItem>,
    pub(crate) nocr: Option<(String, NOcrDb)>,
    pub(crate) bin: Option<(String, BinDb)>,
    pub(crate) own: Option<(String, NOcrDb)>,
    pub(crate) nreader: NOcrReader,
    pub(crate) breader: Option<BinReader>,
    pub(crate) oreader: OwnReader,
    help_n: NOcrReader,
    help_b: Option<BinReader>,
    pub(crate) fix: Option<(String, FixEngine)>,
    pub(crate) skip: HashMap<usize, HashSet<usize>>,
    pub(crate) once: HashMap<usize, HashMap<usize, String>>,
    pub(crate) pending: Option<Pending>,
    /// ข้อความหลังแก้ของภาพที่อ่านแล้ว ตัวแก้คำใช้บรรทัดก่อนหน้า
    pub(crate) texts: HashMap<usize, String>,
    pub(crate) history: Vec<Taught>,
    pub(crate) rng: Option<Rng>,
    /// หน้าต่างตรวจบรรทัดที่เปิดอยู่ (ocr_inspect)
    pub(crate) insp: Option<Insp>,
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
    let t = crate::ocr::ocrfix::fix_lone_dashes(t);
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

pub fn update_images(v: &[crate::subtitle::subs::SubImg]) {
    if let Some(s) = session().as_mut() { apply_images(s, v); }
}
pub(crate) fn apply_images(s: &mut Session, v: &[crate::subtitle::subs::SubImg]) {
    let by: HashMap<&std::path::Path, &crate::subtitle::subs::SubImg> = v.iter().map(|i| (i.file.as_path(), i)).collect();
    for it in s.items.iter_mut() {
        if let Some(img) = by.get(it.img.file.as_path()) { it.an = crate::ocr::ocrsrc::an_of(img); it.img = (*img).clone(); }
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

pub(crate) const MATCHERS: [&str; 3] = ["nocr", "binary", "own"];

impl Session {
    #[cfg(test)]
    pub fn with_items(items: Vec<OcrItem>) -> Self { Session { items, ..Default::default() } }

    /// ภาพของงานตามลำดับบรรทัดในหน้า OCR (บันทึกภาพพร้อมหน้า HTML ขั้น 12)
    pub fn items(&self) -> &[OcrItem] { &self.items }

    /// โหลดฐาน ตัวอ่าน และตัวแก้คำที่ค่าตั้งนี้ต้องใช้ · ชื่อฐานเปลี่ยน โหลดใหม่และเริ่มตัวอ่านใหม่
    pub(crate) fn ensure(&mut self, d: &Dirs, cfg: &OcrCfg) -> Result<(), String> {
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
    pub(crate) fn read_matcher(&self, cfg: &OcrCfg, i: usize, img: &Bmp) -> Result<ReadOut, String> {
        let empty_s = HashSet::new();
        let empty_o = HashMap::new();
        let skip = self.skip.get(&i).unwrap_or(&empty_s);
        let once = self.once.get(&i).unwrap_or(&empty_o);
        match cfg.engine.as_str() {
            "nocr" => {
                let db = &self.nocr.as_ref().ok_or("ยังไม่ได้โหลดฐาน nOCR")?.1;
                let fbf = match (&self.bin, &self.breader) {
                    (Some(b), Some(r)) if cfg.fallback => Some(crate::ocr::binocr::binary_fallback(&b.1, &r.matcher, cfg.bin_max_err)),
                    _ => None,
                };
                Ok(self.nreader.read(db, img, &Self::read_opts(cfg, cfg.teach), skip, once, fbf.as_ref().map(|f| f as crate::ocr::nocr_text::Fallback)))
            }
            "binary" => {
                let db = &self.bin.as_ref().ok_or("ยังไม่ได้โหลดฐาน Binary OCR")?.1;
                let r = self.breader.as_ref().ok_or("ยังไม่ได้เตรียมตัวอ่าน Binary OCR")?;
                let fbf = match &self.nocr {
                    Some(n) if cfg.fallback => Some(crate::ocr::binocr::nocr_fallback(&n.1, &self.nreader.case, cfg.max_wrong, if cfg.italic { 0.2 } else { 0.0 })),
                    _ => None,
                };
                Ok(r.read(db, img, &BinOpts { space_px: cfg.bin_space_px, max_err: cfg.bin_max_err, teach: cfg.teach }, skip, once, fbf.as_ref().map(|f| f as crate::ocr::nocr_text::Fallback)))
            }
            _ => {
                let db = &self.own.as_ref().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?.1;
                Ok(self.oreader.read(db, img, &OwnOpts { max_wrong: cfg.max_wrong, teach: cfg.teach }, skip, once))
            }
        }
    }

    /// ข้อความของตัวช่วยหนึ่งตัว · อ่านไม่ได้คืน None (ตัวช่วยพังไม่ทำให้งานหลักหยุด)
    pub(crate) fn helper_text(&self, d: &Dirs, cfg: &OcrCfg, h: &str, img: &Bmp) -> Option<String> {
        if let Some(size) = h.strip_prefix("paddle:") {
            let o = PaddleOpts { size: size.into(), ..cfg.paddle.clone() };
            return crate::ocr::paddle::read_text(&d.ocr, img, &o).ok().map(|x| x.0);
        }
        match h {
            "paddle" => crate::ocr::paddle::read_text(&d.ocr, img, &cfg.paddle).ok().map(|x| tidy_free(&x.0)),
            "tesseract" => crate::ocr::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, img, &cfg.tess, None).ok().map(|x| tidy_free(&x.text)),
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
pub(crate) fn same_as_primary(cfg: &OcrCfg, h: &str) -> bool {
    h == cfg.engine || (cfg.engine == "paddle" && h.strip_prefix("paddle:") == Some(cfg.paddle.size.as_str()))
}

