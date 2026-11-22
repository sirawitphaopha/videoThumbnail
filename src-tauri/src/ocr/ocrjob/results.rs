//! งาน OCR ผลอ่านหนึ่งภาพ ตัวแก้คำ ตัวชี้จุดสงสัย
//! แยกจาก ocrjob/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

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
    format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&v.into_inner()))
}

pub(crate) fn teach_req(s: &Session, cfg: &OcrCfg, index: usize, letter: usize, parent: &Bmp, pieces: &[Piece]) -> TeachReq {
    let boxes: Vec<Option<[i32; 4]>> = pieces.iter().map(|p| p.bmp.as_ref().map(|b| [p.x, p.y, b.width() as i32, b.height() as i32])).collect();
    let expand_max = pieces.iter().skip(letter + 1).take_while(|p| p.bmp.is_some()).count().min(10);
    let p = &pieces[letter];
    let db_name = match cfg.engine.as_str() { "binary" => &cfg.bin_db, "own" => &cfg.own_db, _ => &cfg.nocr_db };
    // ตัวที่ใกล้ที่สุด ใช้ทางสุดท้ายแบบไม่จำกัดจุดผิด (เฉพาะฐานแบบเส้น)
    let guess = match (cfg.engine.as_str(), p.bmp.as_ref()) {
        ("nocr", Some(b)) => s.nocr.as_ref().and_then(|n| n.1.match_single(b, p.top, true, 999, true, false, crate::ocr::nocr::Placement::Unknown).0).map(|c| c.text).unwrap_or_default(),
        ("own", Some(b)) => s.own.as_ref().and_then(|n| n.1.match_single(b, p.top, true, 999, true, false, crate::ocr::nocr::Placement::Unknown).0).map(|c| c.text).unwrap_or_default(),
        _ => String::new(),
    };
    TeachReq { index, engine: cfg.engine.clone(), db: db_name.clone(), letter, image: png_url(parent), width: parent.width(), height: parent.height(), boxes, expand_max, top: p.top, guess }
}

/// อ่านภาพลำดับ i หนึ่งภาพ
pub fn read(s: &mut Session, d: &Dirs, cfg: &OcrCfg, i: usize) -> Result<ReadResult, String> {
    let item = s.items.get(i).ok_or("ไม่มีภาพลำดับนี้ เปิดซับรูปใหม่")?.clone();
    let raw_img = image::open(&item.img.file).map_err(|e| format!("เปิดภาพซับลำดับที่ {} ไม่ได้ {e}", i + 1))?.to_rgba8();
    let img = crate::ocr::ocrprep::preprocess(&raw_img, &cfg.prep);
    s.ensure(d, cfg)?;
    s.pending = None;
    let t0 = std::time::Instant::now();
    let matcher = MATCHERS.contains(&cfg.engine.as_str());
    let (raw, conf, unreadable, lr): (String, Option<f32>, usize, Option<LineRead>) = match cfg.engine.as_str() {
        "paddle" => { let (t, c) = crate::ocr::paddle::read_text(&d.ocr, &img, &cfg.paddle)?; (tidy_free(&t), Some(c), 0, None) }
        "tesseract" => { let o = crate::ocr::tesseract::read(&d.ocr, &d.user.join("tessdata"), &d.work, &img, &cfg.tess, None)?; (tidy_free(&o.text), Some(o.conf), 0, None) }
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
    let broke = if cfg.auto_break && crate::ocr::ocrbreak::number_of_lines(&raw) > crate::ocr::ocrbreak::MAX_LINES && !crate::ocr::ocrsrc::has_separated_blocks(&raw_img, &item.img) {
        Some(crate::ocr::ocrbreak::auto_break_line(&raw, &crate::ocr::ocrbreak::lang_of_text(&raw, &crate::ocr::ocrbreak::lang_of_dict(&cfg.dict))))
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
            if let Some(alt) = lr.as_ref().and_then(|r| if cfg.engine == "binary" { crate::ocr::binocr::italic_retry(r) } else if cfg.engine == "nocr" { crate::ocr::nocr_text::italic_retry(r) } else { None }) {
                if !lf.unknown().is_empty() {
                    let alt = if broke.is_some() { crate::ocr::ocrbreak::auto_break_line(&alt, &crate::ocr::ocrbreak::lang_of_dict(&cfg.dict)) } else { alt };
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
    let reasons = crate::ocr::suspect::check_line(&text, if cfg.engine == "paddle" { conf } else { None }, &helpers, &unknown, cfg.conf_min);
    let an_lines = crate::ocr::ocrsrc::an_lines(&raw_img, &item.img, text.lines().count());
    s.texts.insert(i, text.clone());
    s.skip.remove(&i);
    s.once.remove(&i);
    Ok(ReadResult::Done(LineOut { index: i, text, raw, conf, reasons, unknown, guesses, fixes, helpers, an: item.an, an_lines, unreadable, ms: t0.elapsed().as_millis() as u64 }))
}

