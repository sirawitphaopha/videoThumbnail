//! งาน OCR ตรวจบรรทัด ดูตัวอักษรทีละตัวกับตัวที่ตรงในฐาน
//! แยกจาก ocrjob/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ตรวจบรรทัด

/// สถานะของหน้าต่างตรวจบรรทัด · ชิ้นของบรรทัดกับตัวในฐานที่จับคู่ได้ทีละชิ้น (ชิ้นที่ถูกตัวขยายจับกินไปชี้ตัวเดียวกัน)
pub struct Insp { index: usize, engine: String, db: String, parent: Bmp, letters: Vec<Piece>, nm: Vec<Option<NChar>>, bm: Vec<Option<crate::ocr::binocr::BMatch>> }

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
            if let Some(g) = crate::ocr::nocr_train::Group::create(&p.parent, &p.letters, i, n) {
                let (x0, y0, x1, y1) = g.bounds;
                return Some((g.preview.clone(), (x0, y0, x1 - x0, y1 - y0), g.top_margin(&p.letters)));
            }
        }
        let b = it.bmp.clone()?;
        let (w, h) = (b.width() as i32, b.height() as i32);
        Some((b, (it.x, it.y, w, h), it.top))
    }

    /// สร้างผลให้หน้าจอจากสถานะ
    pub(crate) fn insp_view(&self) -> Result<InspView, String> {
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
    pub(crate) fn insp_match(&mut self, cfg: &OcrCfg) -> Result<(), String> {
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
                    if let Some(b) = &it.bmp { p.nm[i] = db.match_single(b, it.top, true, cfg.max_wrong, false, false, crate::ocr::nocr::Placement::Unknown).0; }
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
    let img = crate::ocr::ocrprep::preprocess(&raw, &cfg.prep);
    s.ensure(d, cfg)?;
    let (parent, letters, db) = match cfg.engine.as_str() {
        "binary" => {
            let two = crate::ocr::ocrprep::make_two_color(&img, 200);
            let (parent, _) = crate::ocr::nocr_text::crop_top(&two);
            let r = s.breader.as_ref().ok_or("ยังไม่ได้เตรียมตัวอ่าน Binary OCR")?;
            let letters = crate::ocr::nocr_split::split_letters(&parent, cfg.bin_space_px, false, true, r.tracker.min_line_height(), true, r.tracker.average());
            (parent, letters, cfg.bin_db.clone())
        }
        "own" => {
            let db = &s.own.as_ref().ok_or("ยังไม่ได้โหลดฐานของตัวสอนเอง")?.1;
            let r = s.oreader.read_text(db, &img, &OwnOpts { max_wrong: cfg.max_wrong, teach: false });
            (r.parent, r.pieces, cfg.own_db.clone())
        }
        _ => {
            let two = crate::ocr::ocrprep::make_two_color(&img, crate::ocr::ocrprep::two_color_threshold(&img));
            let (parent, _) = crate::ocr::nocr_text::crop_top(&two);
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
