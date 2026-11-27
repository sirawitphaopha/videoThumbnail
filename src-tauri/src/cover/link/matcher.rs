//! จับคู่รูปปก ตัวจับคู่อัตโนมัติ (match_core)
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ตัวจับคู่อัตโนมัติ (ฟังก์ชันล้วน เทสได้โดยไม่ต้องอ่านดิสก์)

#[derive(Clone, Debug, PartialEq, Default)]
pub struct ImgIn {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
}

impl ImgIn {
    fn stem(&self) -> String {
        Path::new(&self.name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    }
    fn pick(&self) -> Pick {
        Pick { path: self.path.clone(), name: self.name.clone(), folder: self.folder.clone(), width: self.width, height: self.height, thumb: self.thumb.clone(), geo: None, crop_thumb: None }
    }
}

#[derive(Clone, Debug, Default)]
pub struct MovieIn {
    pub id: String,
    pub path: String,
    pub stem: String,
    pub title: Title,
    pub has_cover: bool,
    /// เลข IMDb จากชื่อไฟล์หรือไฟล์ .nfo ข้างหนัง
    pub imdb: Option<String>,
    /// รูปในโฟลเดอร์เดียวกับไฟล์หนัง
    pub beside: Vec<ImgIn>,
    /// โฟลเดอร์นี้มีหนังเรื่องเดียว ชื่อทั่วไปอย่าง folder.jpg จึงเป็นของเรื่องนี้แน่
    pub alone: bool,
}

pub(crate) fn pct(s: f64) -> u8 {
    (s * 100.0).round().clamp(0.0, 100.0) as u8
}

/// รูปนี้เป็นรูปข้างไฟล์ของหนังเรื่องนี้ไหม · ชื่อเหมือนไฟล์หนัง หรือลงท้าย -poster -landscape แบบที่ Kodi อ่าน
fn is_beside_art(img_stem: &str, m: &MovieIn) -> bool {
    let (i, s) = (img_stem.to_lowercase(), m.stem.to_lowercase());
    if i == s {
        return true;
    }
    if let Some(rest) = i.strip_prefix(&s) {
        let rest = rest.trim_start_matches(['-', '.', '_', ' ']);
        if rest != i.as_str() && ["poster", "cover", "landscape", "fanart", "thumb", "folder"].contains(&rest) {
            return true;
        }
    }
    m.alone && GENERIC_ART.contains(&i.as_str())
}

/// จับคู่ทั้งชุด · ลำดับตามกล่องอธิบายในมอคอัป
/// ① รูปข้างไฟล์หนัง ② เลข IMDb ③ ชื่อกับปีตรง ④ ชื่อตรง ฝั่งใดฝั่งหนึ่งไม่มีปี และไม่ซ้ำกับเรื่องอื่น ⑤ ชื่อคล้าย
/// รูปหนึ่งรูปได้หนังเรื่องเดียว · `shelf` คือชื่อหนังทั้งชั้น ไว้ดูว่าชื่อซ้ำไหม (ภาคต่อ รีเมก) · `taken` รูปที่จับคู่เองไปแล้ว
pub fn match_core(movies: &[MovieIn], shelf: &[Title], images: &[ImgIn], taken: &HashSet<String>) -> Vec<Row> {
    let lower = |p: &str| p.to_lowercase();
    let mut used: HashSet<String> = taken.iter().map(|p| lower(p)).collect();
    let mut rows: Vec<Row> = movies.iter().map(|m| Row {
        id: m.id.clone(), movie: m.path.clone(), title: if m.title.pretty.is_empty() { m.stem.clone() } else { m.title.pretty.clone() },
        has_cover: m.has_cover, status: "none".into(), reason: "หาคู่ไม่เจอ".into(), via: "auto".into(), ..Default::default()
    }).collect();
    let titles: Vec<Title> = images.iter().map(|i| parse_title(&i.stem())).collect();
    let dup = |key: &str| shelf.iter().filter(|t| t.key == key).count() > 1;

    // ใส่รูป · ช่องนั้นมีรูปจริงแล้วไม่ทับ รูปนั้นเหลือไว้บนกระดาน · เหตุผลใช้ของรูปแรก
    fn give(row: &mut Row, img: &ImgIn, reason: &str, tick: bool, used: &mut HashSet<String>) -> bool {
        let wide = img.width > img.height;
        if (wide && row.wide.is_some()) || (!wide && row.tall.is_some() && !row.derived_tall) {
            return false;
        }
        assign(row, img.pick());
        used.insert(img.path.to_lowercase());
        if row.status != "sure" {
            row.status = "sure".into();
            row.reason = reason.to_string();
            row.score = 100;
            row.ticked = tick;
        } else if !tick && row.ticked {
            // อีกช่องได้จากกฎที่ไม่ติ๊ก (④ ชื่อตรงไม่มีปี) เอาติ๊กออกให้กดยืนยันเอง และบอกในเหตุผล
            // (AUDIT ข้อ 76 ② · เดิมแถวยังติ๊กจากขั้น ③ ปกนอนที่อาจเป็นของภาคอื่นถูกยืนยันไปพร้อมกัน)
            row.ticked = false;
            row.reason = format!("{} แต่อีกแนว{}", row.reason, reason.trim_start_matches("ชื่อตรง "));
        }
        true
    }

    // ① รูปข้างไฟล์หนัง
    for (r, m) in rows.iter_mut().zip(movies) {
        for img in &m.beside {
            if !used.contains(&lower(&img.path)) && is_beside_art(&img.stem(), m) {
                give(r, img, "รูปอยู่ข้างไฟล์หนัง", true, &mut used);
            }
        }
    }
    // ② เลข IMDb
    for (r, m) in rows.iter_mut().zip(movies) {
        let Some(id) = &m.imdb else { continue };
        for (img, t) in images.iter().zip(&titles) {
            if t.imdb.as_ref() == Some(id) && !used.contains(&lower(&img.path)) {
                give(r, img, "เลข IMDb ตรงกัน", true, &mut used);
            }
        }
    }
    // ③ ชื่อกับปีตรง
    for (r, m) in rows.iter_mut().zip(movies) {
        if m.title.key.is_empty() || m.title.year.is_none() { continue; }
        for (img, t) in images.iter().zip(&titles) {
            if t.key == m.title.key && t.year == m.title.year && !used.contains(&lower(&img.path)) {
                give(r, img, "ชื่อกับปีตรง", true, &mut used);
            }
        }
    }
    // ④ ชื่อตรง ฝั่งใดฝั่งหนึ่งไม่มีปี · ใส่รูปให้แต่ไม่ติ๊ก (มอคอัป คู่ที่ชื่อกับปีตรงกันเท่านั้นที่ติ๊กไว้ให้)
    // ไม่กล้าตัดสิน เป็นไม่แน่ใจพร้อมรูปให้เลือก · ชื่อซ้ำกับเรื่องอื่นบนชั้น · หนังไม่มีปีแต่รูปชื่อนี้มีหลายปี · เลขท้ายชื่ออาจเป็นส่วนของชื่อเรื่อง
    for (r, m) in rows.iter_mut().zip(movies) {
        if m.title.key.is_empty() { continue; }
        let years: HashSet<Option<u32>> = images.iter().zip(&titles).filter(|(img, t)| t.key == m.title.key && !used.contains(&lower(&img.path))).map(|(_, t)| t.year).collect();
        let many_years = m.title.year.is_none() && years.len() > 1;
        for (img, t) in images.iter().zip(&titles) {
            let no_year = t.year.is_none() || m.title.year.is_none();
            if t.key != m.title.key || !no_year || used.contains(&lower(&img.path)) { continue; }
            let why_unsure = if dup(&m.title.key) { Some("ชื่อซ้ำกับเรื่องอื่น รูปไม่มีปี") }
                else if many_years { Some("รูปชื่อนี้มีหลายปี เลือกเอง") }
                else if t.loose_year || m.title.loose_year { Some("เลขท้ายชื่ออาจเป็นส่วนของชื่อเรื่อง เลือกเอง") }
                else { None };
            if let Some(why) = why_unsure {
                if !r.has_image() && !r.candidates.iter().any(|c| c.path == img.path) {
                    r.candidates.push(img.pick());
                    r.status = "unsure".into();
                    r.reason = why.into();
                    r.score = 100;
                }
            } else {
                let why = if t.year.is_none() { "ชื่อตรง ไม่มีปีในชื่อรูป" } else { "ชื่อตรง ไม่มีปีในชื่อไฟล์หนัง" };
                give(r, img, why, false, &mut used);
            }
        }
    }
    // ⑤ ชื่อคล้าย · ไม่ติ๊กให้ ต้องกดเลือกเอง
    for (r, m) in rows.iter_mut().zip(movies) {
        if r.has_image() || !r.candidates.is_empty() || m.title.key.is_empty() { continue; }
        let mut near: Vec<(f64, &ImgIn)> = images.iter().zip(&titles)
            .filter(|(img, _)| !used.contains(&lower(&img.path)))
            .map(|(img, t)| (similarity(&m.title.key, &t.key), img))
            .filter(|(s, _)| *s >= UNSURE_MIN)
            .collect();
        near.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        if let Some((best, _)) = near.first() {
            r.status = "unsure".into();
            r.score = pct(*best);
            r.reason = format!("ไม่แน่ใจ ชื่อคล้าย {}%", r.score);
            r.candidates = near.iter().take(3).map(|(_, i)| i.pick()).collect();
        }
    }
    rows
}

