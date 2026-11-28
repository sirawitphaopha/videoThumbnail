//! ซับรูป ถอดภาพจาก PGS VobSub และทางเดิมที่ให้ ffmpeg วาด เขียนภาพ ตัดหมึก
//! แยกจาก subs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ซับรูป

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubImg {
    pub n: usize,
    pub start: f64,
    pub end: Option<f64>,
    pub w: u32,
    pub h: u32,
    /// ขนาดภาพเต็มของซับ (จอที่ซับวางอยู่)
    pub canvas: [u32; 2],
    /// ตำแหน่งบนจอ x y
    pub at: [u32; 2],
    /// ซับบังคับ (forced) · ซับรูปที่ ffmpeg วาดให้ไม่รู้ค่านี้ เป็น false
    #[serde(default)]
    pub forced: bool,
    #[serde(skip)]
    pub file: PathBuf,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImgPage {
    pub total: usize,
    pub items: Vec<ImgItem>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImgItem {
    #[serde(flatten)]
    pub img: SubImg,
    /// data URL ของภาพที่ครอปแล้ว
    pub png: String,
}

pub(crate) fn cache_key(path: &Path, ff: u64) -> String {
    let meta = std::fs::metadata(path).ok();
    let mt = meta.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let mut h: u64 = 1469598103934665603;
    for b in format!("{}|{}|{}|{ff}", path.display(), meta.map(|m| m.len()).unwrap_or(0), mt).bytes() { h ^= b as u64; h = h.wrapping_mul(1099511628211); }
    format!("{h:016x}")
}

/// ถอดซับรูปทั้งแทร็กเป็นภาพ · ใช้ผลที่ถอดไว้แล้วถ้ามี
/// ซับรูปที่กำลังถอดอยู่ (ตาม cache_key) · คำขอที่สองของซับเดียวกันรอผลของงานแรก ไม่ลบโฟลเดอร์แล้วถอดซ้อน
/// (ผู้ช่วยตรวจขั้น 10 ข้อ 5 · เดิมปิดหน้าต่างแล้วเปิดซ้ำระหว่างถอด ffmpeg สองตัวเขียนโฟลเดอร์เดียวกัน ผลที่เก็บไว้เพี้ยนถาวร)
static IMG_BUSY: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<String>>> = std::sync::OnceLock::new();
struct BusyGuard(String);
impl Drop for BusyGuard {
    fn drop(&mut self) { IMG_BUSY.get_or_init(Default::default).lock().unwrap().remove(&self.0); }
}

/// ภาพซับหนึ่งภาพที่อ่านจากไฟล์ .sup · ตำแหน่งบนจอกับภาพเฉพาะกรอบที่มีตัวหนังสือ
/// forced คือซับบังคับ (ธงในส่วนองค์ประกอบของ PGS) ไว้ใช้กับตัวกรองเฉพาะซับบังคับของ OCR
pub struct SupShow { pub start: f64, pub end: Option<f64>, pub canvas: (u32, u32), pub at: (u32, u32), pub img: image::RgbaImage, pub forced: bool }

/// ถอดภาพตามแบบ RLE ของ PGS · ไบต์ไม่ศูนย์คือสีหนึ่งจุด · 0 ตามด้วยตัวบอกความยาวและสี · 0 0 จบแถว
fn pgs_rle(data: &[u8], w: usize, h: usize, pal: &[[u8; 4]; 256]) -> image::RgbaImage {
    let mut img = image::RgbaImage::new(w as u32, h as u32);
    let (mut x, mut y, mut i) = (0usize, 0usize, 0usize);
    let mut put = |x: &mut usize, y: usize, n: usize, c: u8| {
        for _ in 0..n { if *x < w && y < h { img.put_pixel(*x as u32, y as u32, image::Rgba(pal[c as usize])); } *x += 1; }
    };
    while i < data.len() && y < h {
        let b = data[i]; i += 1;
        if b != 0 { put(&mut x, y, 1, b); continue; }
        let Some(&f) = data.get(i) else { break }; i += 1;
        if f == 0 { x = 0; y += 1; continue; }
        let mut n = (f & 0x3F) as usize;
        if f & 0x40 != 0 { let Some(&lo) = data.get(i) else { break }; i += 1; n = (n << 8) | lo as usize; }
        let c = if f & 0x80 != 0 { let Some(&c) = data.get(i) else { break }; i += 1; c } else { 0 };
        put(&mut x, y, n, c);
    }
    img
}

/// อ่านไฟล์ซับรูป PGS (.sup) ตรง ๆ ได้ภาพกับเวลาจากในไฟล์ · ไม่ต้องให้ ffmpeg วาดภาพเต็มจอทุกครั้งที่ซับเปลี่ยน
/// เดิมเปิดดูซับ PGS ของหนังหนึ่งเรื่องนานมาก (พี่กันทัก 15 พ.ย. 2569 "เราเปิดดู PGS นานมากกก")
/// ภาพที่เหมือนภาพก่อนหน้า (แสดงซ้ำ) รวมเป็นภาพเดียว · สีแปลงตาม BT.709 เมื่อจอสูงตั้งแต่ 720 นอกนั้น BT.601 แบบ pgs::rgb_of
pub fn parse_sup(data: &[u8]) -> Vec<SupShow> {
    let be16 = |p: &[u8], i: usize| -> usize { p.get(i..i + 2).map(|b| ((b[0] as usize) << 8) | b[1] as usize).unwrap_or(0) };
    let mut out: Vec<SupShow> = Vec::new();
    let mut pals: std::collections::HashMap<u8, [[u8; 4]; 256]> = Default::default();
    let mut objs: std::collections::HashMap<u16, (usize, usize, Vec<u8>)> = Default::default();
    // องค์ประกอบของชุดแสดงที่กำลังอ่าน (เวลา จอ จานสี และวัตถุพร้อมตำแหน่ง)
    let mut pcs: Option<(f64, (u32, u32), u8, Vec<(u16, u32, u32)>, bool)> = None;
    let mut i = 0usize;
    while i + 13 <= data.len() {
        if &data[i..i + 2] != b"PG" { break; }
        let pts = u32::from_be_bytes([data[i + 2], data[i + 3], data[i + 4], data[i + 5]]) as f64 / 90000.0;
        let kind = data[i + 10];
        let size = be16(data, i + 11);
        let p = data.get(i + 13..i + 13 + size).unwrap_or(&[]);
        i += 13 + size;
        match kind {
            0x16 => {
                let (w, h) = (be16(p, 0) as u32, be16(p, 2) as u32);
                let pal_id = p.get(9).copied().unwrap_or(0);
                let n = p.get(10).copied().unwrap_or(0) as usize;
                let mut list = Vec::new();
                let mut forced = false;
                let mut o = 11;
                for _ in 0..n {
                    if o + 8 > p.len() { break; }
                    let id = be16(p, o) as u16;
                    let cropped = p[o + 3] & 0x80 != 0;
                    forced |= p[o + 3] & 0x40 != 0;
                    list.push((id, be16(p, o + 4) as u32, be16(p, o + 6) as u32));
                    o += if cropped { 16 } else { 8 };
                }
                pcs = Some((pts, (w, h), pal_id, list, forced));
            }
            0x14 => {
                let bt709 = pcs.as_ref().map(|c| c.1 .1 >= 720).unwrap_or(true);
                let id = p.first().copied().unwrap_or(0);
                let pal = pals.entry(id).or_insert([[0; 4]; 256]);
                for e in p.get(2..).unwrap_or(&[]).chunks_exact(5) {
                    let [r, g, b] = crate::subtitle::pgs::rgb_of(e[1], e[2], e[3], bt709);
                    pal[e[0] as usize] = [r, g, b, e[4]];
                }
            }
            0x15 => {
                let id = be16(p, 0) as u16;
                let seq = p.get(3).copied().unwrap_or(0);
                if seq & 0x80 != 0 {
                    let (w, h) = (be16(p, 7), be16(p, 9));
                    // ไฟล์เสียบอกขนาดเป็นขยะได้ถึง 65535 × 65535 จองหน่วยความจำไม่ได้แล้วโปรแกรมปิดตัว · ข้ามวัตถุที่ใหญ่เกินจอ 4K (ผู้ช่วยตรวจทาน R10)
                    if w == 0 || h == 0 || w > 4096 || h > 2304 { continue; }
                    objs.insert(id, (w, h, p.get(11..).unwrap_or(&[]).to_vec()));
                } else if let Some(o) = objs.get_mut(&id) {
                    o.2.extend_from_slice(p.get(4..).unwrap_or(&[]));
                }
            }
            0x80 => {
                let Some((t, canvas, pal_id, list, forced)) = pcs.take() else { continue };
                // ชุดแสดงที่ไม่มีวัตถุคือซับหาย ปิดภาพก่อนหน้า
                if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
                if list.is_empty() { continue; }
                let pal = pals.get(&pal_id).copied().unwrap_or([[0; 4]; 256]);
                let parts: Vec<(u32, u32, image::RgbaImage)> = list.iter().filter_map(|(id, x, y)| objs.get(id).map(|(w, h, d)| (*x, *y, pgs_rle(d, *w, *h, &pal)))).collect();
                if parts.is_empty() { continue; }
                let x0 = parts.iter().map(|p| p.0).min().unwrap();
                let y0 = parts.iter().map(|p| p.1).min().unwrap();
                let x1 = parts.iter().map(|p| p.0 + p.2.width()).max().unwrap();
                let y1 = parts.iter().map(|p| p.1 + p.2.height()).max().unwrap();
                if x1 - x0 > 4096 || y1 - y0 > 2304 { continue; }
                let mut img = image::RgbaImage::new(x1 - x0, y1 - y0);
                for (x, y, part) in &parts { image::imageops::overlay(&mut img, part, (*x - x0) as i64, (*y - y0) as i64); }
                if img.pixels().all(|p| p[3] <= 8) { continue; }
                // ภาพเดิมแสดงซ้ำ (เริ่ม epoch ใหม่) ต่อเวลาภาพเดิม ไม่นับเป็นภาพใหม่
                if let Some(prev) = out.last_mut() {
                    if prev.end == Some(t) && prev.at == (x0, y0) && prev.img == img { prev.end = None; continue; }
                }
                out.push(SupShow { start: t, end: None, canvas, at: (x0, y0), img, forced });
            }
            _ => {}
        }
    }
    out
}

/// ตัดภาพให้เหลือเฉพาะตัวหนังสือแล้วเผื่อขอบ 4 จุด · ภาพที่ PGS กับ VobSub ให้มามีขอบใสรอบตัวหนังสือ หน้าจอวางภาพที่ตำแหน่งเดิม
/// ภาพไม่มีหมึกเลยคืน None
pub(crate) fn crop_ink(img: &image::RgbaImage, at: (u32, u32), canvas: (u32, u32)) -> Option<((u32, u32), image::RgbaImage)> {
    let (iw, ih) = img.dimensions();
    let (mut x0, mut y0, mut x1, mut y1) = (iw, ih, 0u32, 0u32);
    for (x, y, p) in img.enumerate_pixels() { if p[3] > 8 { x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y); } }
    if x1 < x0 { return None; }
    let pad = 4u32;
    let (cx, cy) = ((at.0 + x0).saturating_sub(pad), (at.1 + y0).saturating_sub(pad));
    let (ex, ey) = ((at.0 + x1 + pad + 1).min(canvas.0.max(at.0 + iw)), (at.1 + y1 + pad + 1).min(canvas.1.max(at.1 + ih)));
    let mut out = image::RgbaImage::new(ex - cx, ey - cy);
    image::imageops::overlay(&mut out, img, at.0 as i64 - cx as i64, at.1 as i64 - cy as i64);
    Some(((cx, cy), out))
}

/// เขียนภาพซับทีละไฟล์แบบสี่เธรดพร้อมกัน · on บอกสัดส่วนที่เขียนแล้ว 0–1 ทุก 1% (BUGS ข้อ 151)
/// ซับยาวเป็นพันภาพ เขียนทีละไฟล์ทีละภาพช่วงนี้ไม่มีความคืบหน้า แถบค้าง 100% ระหว่างที่ยังเขียนภาพอยู่
/// on ถูกเรียกจากเธรดที่เรียกฟังก์ชันนี้เท่านั้น (ตัวรับความคืบหน้าไม่ต้องข้ามเธรดได้)
pub(crate) fn save_pngs(items: Vec<(PathBuf, image::RgbaImage)>, on: &dyn Fn(f64)) -> Result<(), String> {
    let total = items.len();
    if total == 0 { return Ok(()); }
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2).clamp(1, 4);
    let mut lanes: Vec<Vec<(PathBuf, image::RgbaImage)>> = (0..threads).map(|_| Vec::new()).collect();
    for (k, it) in items.into_iter().enumerate() { lanes[k % threads].push(it); }
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    std::thread::scope(|sc| {
        for lane in lanes {
            let tx = tx.clone();
            sc.spawn(move || {
                for (f, img) in lane {
                    // เขียนไฟล์ชั่วคราวแล้วแทนทีเดียว · วาดสีใหม่ทับภาพเดิมระหว่างที่ตัวอ่านเปิดไฟล์เดียวกันอยู่ ตัวอ่านไม่ได้ไฟล์ครึ่งไฟล์ (ผู้ช่วยตรวจทาน R1)
                    let tmp = f.with_extension("png.part");
                    let r = img.save_with_format(&tmp, image::ImageFormat::Png).and_then(|_| std::fs::rename(&tmp, &f).map_err(image::ImageError::IoError))
                        .map_err(|e| { let _ = std::fs::remove_file(&tmp); format!("เก็บภาพซับไม่ได้ {e}") });
                    let bad = r.is_err();
                    if tx.send(r).is_err() || bad { return; }
                }
            });
        }
        drop(tx);
        let (mut done, mut last) = (0usize, usize::MAX);
        for r in rx {
            r?;
            done += 1;
            let pct = done * 100 / total;
            if pct != last { last = pct; on(done as f64 / total as f64); }
        }
        if done < total { return Err("เก็บภาพซับไม่ครบ".to_string()); }
        Ok(())
    })
}

/// ความยาวของไฟล์ (วินาที) ไว้คิดเปอร์เซ็นต์ของ ffmpeg · ไม่รู้คืน 0
fn duration_of(tools: &Path, path: &Path) -> f64 { crate::subtitle::vobsub::stream_codec(tools, path, u64::MAX).1 }

/// ทางเร็วของซับรูป PGS · ลอกแทร็กออกมาเป็น .sup (ไม่ถอดภาพหนัง) แล้วอ่านเอง · อ่านไม่ได้หรือไม่ใช่ PGS คืน None ให้ใช้ทางเดิม
/// การลอกแทร็กอ่านไฟล์หนังทั้งไฟล์ บอกเปอร์เซ็นต์ตามเวลาที่ ffmpeg อ่านถึง (BUGS ข้อ 144)
pub(crate) fn images_from_sup(tools: &Path, dir: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Option<Vec<SubImg>> {
    let is_sup = path.extension().map(|e| e.eq_ignore_ascii_case("sup")).unwrap_or(false);
    let data = if is_sup && ff == 0 {
        std::fs::read(path).ok()?
    } else {
        let sup = dir.join("track.sup");
        let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-nostats".into(), "-y".into(), "-progress".into(), "pipe:1".into(), "-copyts".into(), "-i".into(), path.into(),
            "-map".into(), format!("0:{ff}").into(), "-c".into(), "copy".into(), "-f".into(), "sup".into(), sup.clone().into()];
        let (ok, _, _) = crate::subtitle::vobsub::run_progress(tools, "ffmpeg", &args, duration_of(tools, path), &|p| on(p * 0.85)).ok()?;
        if !ok { let _ = std::fs::remove_file(&sup); return None; }
        let d = std::fs::read(&sup).ok()?;
        let _ = std::fs::remove_file(&sup);
        d
    };
    let shows = parse_sup(&data);
    if shows.is_empty() { return None; }
    let mut out = Vec::with_capacity(shows.len());
    let mut pics = Vec::with_capacity(shows.len());
    for s in shows.into_iter() {
        let Some((at, img)) = crop_ink(&s.img, s.at, s.canvas) else { continue };
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        // เวลาจบห่างเกิน 60 วินาที (ภาพค้างท้ายไฟล์) ถือว่าไม่รู้เวลาจบ เหมือนทางเดิม
        let end = s.end.filter(|e| *e >= s.start && e - s.start <= 60.0).map(|e| (e * 1000.0).round() / 1000.0);
        out.push(SubImg { n, start: (s.start * 1000.0).round() / 1000.0, end, w: img.width(), h: img.height(), canvas: [s.canvas.0, s.canvas.1], at: [at.0, at.1], forced: s.forced, file: file.clone() });
        pics.push((file, img));
    }
    save_pngs(pics, &|f| on(85.0 + f * 15.0)).ok()?;
    Some(out)
}

/// ซับรูป VobSub อ่านเอง (vobsub.rs) · ไฟล์ .idx กับ .sub ที่เปิดตรงอ่านทันที · ซับในหนังดึงคู่ไฟล์ออกมาเก็บในโฟลเดอร์ของผลก่อน
/// คู่ไฟล์ที่ดึงมาเก็บไว้กับภาพ (track.idx track.sub) ให้ OCR วาดภาพใหม่ด้วยสีที่เลือกได้ ไม่ต้องดึงจากหนังซ้ำ · ไม่ใช่ VobSub คืน Ok(None)
fn images_from_vobsub(tools: &Path, dir: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Option<Vec<SubImg>>, String> {
    let (idx, sub) = if let (Some(pair), 0) = (crate::subtitle::vobsub::pair_of(path), ff) {
        pair
    } else if crate::subtitle::vobsub::is_vobsub_stream(tools, path, ff) {
        crate::subtitle::vobsub::extract_pair(tools, dir, path, ff, &|p| on(p * 0.8))?
    } else {
        return Ok(None);
    };
    let text = std::fs::read(&idx).map_err(|e| format!("อ่านไฟล์ .idx ไม่ได้ {e}"))?;
    let data = std::fs::read(&sub).map_err(|e| format!("อ่านไฟล์ .sub ไม่ได้ {e}"))?;
    let file = crate::subtitle::vobsub::parse_idx(&decode_text(&text).0);
    let t0 = std::time::Instant::now();
    let shows = crate::subtitle::vobsub::read(&file, &data, 0, &|p| on(80.0 + p * 0.05));
    if shows.is_empty() { return Err("อ่านภาพในซับ VobSub ไม่ได้สักภาพ ไฟล์ .sub อาจไม่ตรงกับไฟล์ .idx".into()); }
    let t1 = t0.elapsed();
    let out = save_vob_shows(dir, &shows, None, None, &|f| on(85.0 + f * 15.0));
    // เวลาของแต่ละช่วงไว้ไล่ข้อ 151 ตอนพี่กันลองกับไฟล์จริง (ขึ้นในบันทึกของโหมดพัฒนา)
    eprintln!("[ซับรูป VobSub] {} ภาพ อ่าน {:?} เก็บภาพ {:?}", shows.len(), t1, t0.elapsed() - t1);
    out.map(Some)
}

/// เก็บภาพของ VobSub ทีละภาพเป็น c000001.png · ภาพที่ครอปด้วยสีจากจานสีแล้วว่างตัดทิ้ง (ลำดับภาพจึงตรงกันทุกครั้ง)
/// custom สีสี่ช่องที่ผู้ใช้เลือก (พื้น ตัว เน้น 1 เน้น 2) วาดใหม่จากข้อมูลดิบ ครอปแล้วว่างใช้ทั้งกรอบ · only เก็บเฉพาะภาพลำดับนั้น ไม่เขียนไฟล์
pub(crate) fn save_vob_shows(dir: &Path, shows: &[crate::subtitle::vobsub::VobShow], custom: Option<[[u8; 4]; 4]>, only: Option<usize>, on: &dyn Fn(f64)) -> Result<Vec<SubImg>, String> {
    let mut out = Vec::with_capacity(shows.len());
    let mut pics = Vec::with_capacity(shows.len());
    let mut n = 0usize;
    for s in shows {
        let Some((at0, img0)) = crop_ink(&s.img, s.at, s.canvas) else { continue };
        n += 1;
        if only.is_some_and(|k| k != n) { continue; }
        let (at, img) = match (custom, crate::subtitle::vobsub::parse_spu(&s.spu)) {
            (Some(c), Some(spu)) => {
                let full = crate::subtitle::vobsub::render(&s.spu, &spu, c);
                crop_ink(&full, s.at, s.canvas).unwrap_or((s.at, full))
            }
            _ => (at0, img0),
        };
        let f = dir.join(format!("c{n:06}.png"));
        let r = |v: f64| (v * 1000.0).round() / 1000.0;
        out.push(SubImg { n, start: r(s.start), end: s.end.map(r), w: img.width(), h: img.height(), canvas: [s.canvas.0, s.canvas.1], at: [at.0, at.1], forced: s.forced, file: f.clone() });
        if only.is_some() { img.save(&f).ok(); } else { pics.push((f, img)); }
    }
    save_pngs(pics, on)?;
    Ok(out)
}

/// คู่ไฟล์ .idx .sub กับโฟลเดอร์ภาพของซับรูปที่เปิด · ไฟล์ .idx ที่เปิดตรงใช้คู่เดิม ซับในหนังใช้คู่ที่ดึงเก็บไว้ตอนถอดภาพ (ไม่ดึงจากหนังซ้ำ)
fn vob_pair(work: &Path, path: &Path, ff: u64) -> Result<(PathBuf, PathBuf, PathBuf), String> {
    let dir = work.join(format!("subimg-v3-{}", cache_key(path, ff)));
    let (i, s) = match (crate::subtitle::vobsub::pair_of(path), ff) {
        (Some(p), 0) => p,
        _ => (dir.join("track.idx"), dir.join("track.sub")),
    };
    if !i.is_file() || !s.is_file() { return Err("ซับนี้ไม่ใช่ VobSub หรือยังไม่ได้อ่านภาพ เปิดซับใหม่ในหน้า OCR".into()); }
    Ok((i, s, dir))
}

pub(crate) fn vob_shows(idx: &Path, sub: &Path) -> Result<Vec<crate::subtitle::vobsub::VobShow>, String> {
    let text = std::fs::read(idx).map_err(|e| format!("อ่านไฟล์ .idx ไม่ได้ {e}"))?;
    let data = std::fs::read(sub).map_err(|e| format!("อ่านไฟล์ .sub ไม่ได้ {e}"))?;
    Ok(crate::subtitle::vobsub::read(&crate::subtitle::vobsub::parse_idx(&decode_text(&text).0), &data, 0, &|_| {}))
}

/// วาดภาพทั้งไฟล์ของ VobSub ใหม่ด้วยสีที่เลือก (None กลับไปใช้จานสีของไฟล์) เขียนทับภาพชั่วคราวกับรายการภาพ · ตาม PickVobSubColors แล้ว RefreshOcrSubtitleItemBitmaps
pub fn vobsub_recolor(work: &Path, path: &Path, ff: u64, custom: Option<[[u8; 4]; 4]>) -> Result<Vec<SubImg>, String> {
    let (i, s, dir) = vob_pair(work, path, ff)?;
    let shows = vob_shows(&i, &s)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = save_vob_shows(&dir, &shows, custom, None, &|_| {})?;
    std::fs::write(dir.join("index.json"), serde_json::to_string(&out).unwrap_or_default()).map_err(|e| e.to_string())?;
    Ok(out)
}

/// ภาพตัวอย่างลำดับ n ที่วาดด้วยสีที่เลือก ไม่เขียนทับรายการ · หน้าต่างสีของ VobSub
pub fn vobsub_preview(work: &Path, path: &Path, ff: u64, n: usize, custom: Option<[[u8; 4]; 4]>) -> Result<String, String> {
    let (i, s, _) = vob_pair(work, path, ff)?;
    let shows = vob_shows(&i, &s)?;
    let tmp = work.join("vobcolor-preview");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let v = save_vob_shows(&tmp, &shows, custom, Some(n.max(1)), &|_| {})?;
    let f = v.first().ok_or("ไม่มีภาพลำดับนี้")?.file.clone();
    let b = std::fs::read(&f).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b)))
}

/// ถอดแบบไม่รายงานความคืบหน้า ใช้ในเทส
#[cfg(test)]
pub fn images(tools: &Path, work: &Path, path: &Path, ff: u64) -> Result<Vec<SubImg>, String> {
    images_with(tools, work, path, ff, &|_| {})
}

/// ถอดซับรูปทั้งแทร็กพร้อมบอกความคืบหน้า 0–100 · หนังยาวส่วนที่นานคืออ่านไฟล์หนังทั้งไฟล์ (BUGS ข้อ 144)
pub fn images_with(tools: &Path, work: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Vec<SubImg>, String> {
    // ซับ HD DVD ffmpeg อ่านไม่ได้ ถอดจากไฟล์ PGS ที่ BDSup2Sub++ แปลงไว้ในโฟลเดอร์ทำงานแทน (BUGS ข้อ 129)
    let hd;
    let (path, ff) = if crate::subtitle::imgconv::is_hddvd_sup(path) { hd = crate::subtitle::imgconv::hddvd_pgs(tools, work, path)?.0; (hd.as_path(), 0) } else { (path, ff) };
    let key = cache_key(path, ff);
    // v2 ใส่ -copyts แล้ว ผลที่ถอดไว้ก่อนหน้านี้เวลาเริ่มที่ศูนย์ผิด ใช้ชื่อใหม่ไม่ให้หยิบของเก่า (BUGS ข้อ 125 เจอ 15 พ.ย. 2569)
    // v3 อ่าน VobSub เองและเก็บธงซับบังคับ ผลเก่าของ VobSub เป็นภาพที่ ffmpeg วาด ไม่มีคู่ไฟล์ให้ OCR วาดสีใหม่ (แผน OCR ขั้น 1)
    let dir = work.join(format!("subimg-v3-{key}"));
    let idx = dir.join("index.json");
    let cached = || -> Option<Vec<SubImg>> {
        let mut v = serde_json::from_str::<Vec<SubImg>>(&std::fs::read_to_string(&idx).ok()?).ok()?;
        for i in v.iter_mut() { i.file = dir.join(format!("c{:06}.png", i.n)); }
        Some(v)
    };
    // คำขอใหม่เริ่มนับใหม่ ตัวหยุดของรอบที่ยกเลิกไปแล้วไม่ค้าง (BUGS ข้อ 162.8)
    if cached().is_none() { crate::subtitle::vobsub::IMG_STOP.store(false, std::sync::atomic::Ordering::SeqCst); }
    let _busy = loop {
        if let Some(v) = cached() { return Ok(v); }
        if crate::subtitle::vobsub::img_stopped() { return Err(crate::subtitle::vobsub::IMG_CANCELLED.into()); }
        let mut set = IMG_BUSY.get_or_init(Default::default).lock().unwrap();
        if set.insert(key.clone()) { break BusyGuard(key.clone()); }
        drop(set);
        std::thread::sleep(Duration::from_millis(300));
    };
    if let Some(v) = cached() { return Ok(v); }
    let raw = dir.join("raw");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&raw).map_err(|e| e.to_string())?;
    on(0.0);
    let save = |out: Vec<SubImg>| -> Result<Vec<SubImg>, String> {
        let _ = std::fs::remove_dir_all(&raw);
        let _ = std::fs::write(&idx, serde_json::to_string(&out).unwrap_or_default());
        on(100.0);
        Ok(out)
    };
    // VobSub อ่านเองตามตำแหน่งในไฟล์ .idx (BUGS ข้อ 144) · ล้มกลางทางบอกสาเหตุ ไม่ไปวาดด้วย ffmpeg ซ้ำอีกรอบที่นานกว่า
    if let Some(out) = images_from_vobsub(tools, &dir, path, ff, on).inspect_err(|_| { let _ = std::fs::remove_dir_all(&dir); })? { return save(out); }
    // ซับ PGS อ่านจากไฟล์ .sup ตรง ๆ เร็วกว่าให้ ffmpeg วาดภาพเต็มจอหลายเท่า · ชนิดอื่นหรืออ่านไม่ได้ใช้ทางเดิมข้างล่าง
    if let Some(out) = images_from_sup(tools, &dir, path, ff, on) { return save(out); }
    // ยกเลิกระหว่างลอกแทร็ก ทางเร็วคืน None ไม่ไปวาดด้วย ffmpeg ต่อ
    if crate::subtitle::vobsub::img_stopped() { let _ = std::fs::remove_dir_all(&dir); return Err(crate::subtitle::vobsub::IMG_CANCELLED.into()); }
    let out = images_by_render(tools, &dir, &raw, path, ff, on).inspect_err(|_| { let _ = std::fs::remove_dir_all(&dir); })?;
    save(out)
}

/// ทางเดิม ให้ ffmpeg วาดซับแบบ sub2video เป็นภาพเต็มจอทุกครั้งที่ซับเปลี่ยน แล้วหากรอบตัวหนังสือ · ใช้กับ DVB DivX และไฟล์ที่ทางเร็วอ่านไม่ได้
pub(crate) fn images_by_render(tools: &Path, dir: &Path, raw: &Path, path: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<Vec<SubImg>, String> {
    // sub2video ได้ภาพทุกครั้งที่ซับเปลี่ยน · showinfo บอกเวลาของแต่ละภาพ
    // -copyts คงเวลาจริงของไฟล์ เดิมไม่ใส่ ffmpeg เลื่อนภาพแรกให้เริ่มที่ศูนย์ ซับที่ภาพแรกอยู่ 2:12.48 ขึ้นว่า 0:00.0 (เจอตอนทำหน้าต่างแปลงซับภาพ 15 พ.ย. 2569)
    // -progress pipe:1 บอกเวลาที่อ่านถึงทางช่องออก ใช้คิดเปอร์เซ็นต์ (BUGS ข้อ 144) · showinfo ยังออกทางช่องผิดพลาดเหมือนเดิม
    let args: Vec<OsString> = vec!["-v".into(), "info".into(), "-nostdin".into(), "-nostats".into(), "-progress".into(), "pipe:1".into(), "-copyts".into(), "-i".into(), path.into(),
        "-filter_complex".into(), format!("[0:{ff}]format=rgba,showinfo[v]").into(), "-map".into(), "[v]".into(), "-fps_mode".into(), "passthrough".into(),
        "-f".into(), "image2".into(), raw.join("%06d.png").into()];
    let (_, _, log) = crate::subtitle::vobsub::run_progress(tools, "ffmpeg", &args, duration_of(tools, path), &|p| on(p * 0.9))?;
    let times: Vec<f64> = log.lines().filter(|l| l.contains("Parsed_showinfo") && l.contains(" n:")).filter_map(|l| {
        let p = l.split("pts_time:").nth(1)?;
        p.split_whitespace().next()?.parse::<f64>().ok()
    }).collect();
    if times.is_empty() {
        let _ = std::fs::remove_dir_all(dir);
        return Err(format!("ถอดซับรูปไม่ได้  {}", log.lines().filter(|l| l.contains("rror")).last().unwrap_or("ffmpeg ไม่ได้ภาพ")));
    }
    let mut out: Vec<SubImg> = Vec::new();
    let mut last_sig: Option<(u32, u32, u32, u32, u64)> = None;
    for (i, &t) in times.iter().enumerate() {
        let f = raw.join(format!("{:06}.png", i + 1));
        let Ok(img) = image::open(&f) else { continue };
        let img = img.to_rgba8();
        let (w, h) = img.dimensions();
        let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0u32, 0u32);
        let mut sum: u64 = 0;
        for (x, y, p) in img.enumerate_pixels() {
            if p[3] > 8 {
                x0 = x0.min(x); y0 = y0.min(y); x1 = x1.max(x); y1 = y1.max(y);
                sum = sum.wrapping_add((p[0] as u64) ^ ((p[1] as u64) << 8) ^ ((p[2] as u64) << 16)).wrapping_add((x as u64) << 32 ^ y as u64);
            }
        }
        // ภาพว่างคือตอนซับหาย · ปิดภาพก่อนหน้า
        if x1 < x0 {
            if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
            last_sig = None;
            continue;
        }
        let sig = (x0, y0, x1, y1, sum);
        // ภาพเดิมซ้ำ (ซับเดิมยังขึ้นอยู่) ไม่นับเป็นภาพใหม่
        if last_sig == Some(sig) { continue; }
        if let Some(prev) = out.last_mut() { if prev.end.is_none() { prev.end = Some(t); } }
        last_sig = Some(sig);
        let pad = 4;
        let (cx, cy) = (x0.saturating_sub(pad), y0.saturating_sub(pad));
        let (cw, ch) = ((x1 + pad + 1).min(w) - cx, (y1 + pad + 1).min(h) - cy);
        let crop = image::imageops::crop_imm(&img, cx, cy, cw, ch).to_image();
        let n = out.len() + 1;
        let file = dir.join(format!("c{n:06}.png"));
        crop.save(&file).map_err(|e| format!("เก็บภาพซับไม่ได้ {e}"))?;
        out.push(SubImg { n, start: (t * 1000.0).round() / 1000.0, end: None, w: cw, h: ch, canvas: [w, h], at: [cx, cy], forced: false, file });
    }
    // ภาพสุดท้ายที่ไม่มีภาพว่างตามมา หรือเวลาจบห่างเกิน 60 วินาที (ภาพปิดท้ายไฟล์) ไม่รู้เวลาจบ
    for i in out.iter_mut() { if let Some(e) = i.end { if e - i.start > 60.0 || e < i.start { i.end = None; } else { i.end = Some((e * 1000.0).round() / 1000.0); } } }
    let _ = std::fs::remove_dir_all(&raw);
    Ok(out)
}

