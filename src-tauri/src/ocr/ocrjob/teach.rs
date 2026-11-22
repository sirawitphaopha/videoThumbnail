//! งาน OCR สอนตัวอักษร คำที่ไม่รู้จัก
//! แยกจาก ocrjob/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

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
                    let b = crate::ocr::binocr::teach_bitmap(&p.pieces, p.letter, n, &text, italic).ok_or("สร้างภาพตัวอักษรไม่ได้")?;
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
                    crate::ocr::ownocr::teach(db, &p.pieces, &group, &text, italic, cfg.lines, cfg.algo, rng).ok_or("สร้างตัวอักษรไม่ได้")?;
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
            let preview = if n <= 1 { p.pieces.get(p.letter).and_then(|x| x.bmp.clone()) } else { crate::ocr::nocr_train::Group::create(&p.parent, &p.pieces, p.letter, n).map(|g| g.preview) };
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
        let g = crate::ocr::nocr_train::Group::create(parent, pieces, letter, n)?;
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

