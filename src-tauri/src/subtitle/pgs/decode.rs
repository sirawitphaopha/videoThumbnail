//! ส่งออก PGS ถอดไฟล์ .sup กับสีแบบตัวเล่น (ใช้ตรวจผลกับภาพตัวอย่าง)
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ถอดไฟล์ .sup กับสีแบบตัวเล่น

/// ภาพเลขสีจาก RLE ของ PGS (กลับด้านของ rle)
pub fn unrle(data: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut px: Vec<u8> = Vec::with_capacity(w * h);
    let mut i = 0;
    while i < data.len() {
        let b = data[i];
        i += 1;
        if b != 0 { px.push(b); continue; }
        let Some(&f) = data.get(i) else { break };
        i += 1;
        if f == 0 {
            let rem = if w > 0 { px.len() % w } else { 0 };
            if rem != 0 { px.resize(px.len() + w - rem, 0); }
            continue;
        }
        let mut n = (f & 0x3F) as usize;
        if f & 0x40 != 0 { n = (n << 8) | *data.get(i).unwrap_or(&0) as usize; i += 1; }
        let c = if f & 0x80 != 0 { let c = *data.get(i).unwrap_or(&0); i += 1; c } else { 0 };
        px.extend(std::iter::repeat_n(c, n));
    }
    px.resize(w * h, 0);
    px
}

/// ถอดไฟล์ .sup เป็นภาพ RGBA แบบไม่คูณความโปร่งใส ณ ชุดสุดท้ายที่เวลาไม่เกิน at ms · ถอดจานสีแบบตัวเล่น (BT.709 เมื่อ bt709)
/// ใช้ทำภาพตัวอย่างของ SUPer และเทสว่าไฟล์ที่เขียนได้ภาพตรง
pub fn decode_at(b: &[u8], at: i64, w: usize, h: usize, bt709: bool) -> Vec<u8> {
    let be = |d: &[u8], p: usize| u16::from_be_bytes([d[p], d[p + 1]]);
    let mut out = vec![0u8; w * h * 4];
    let mut pal = [[0u8; 4]; 256];
    let mut objs: HashMap<u16, (usize, usize, Vec<u8>)> = HashMap::new();
    let mut part: HashMap<u16, (usize, usize, Vec<u8>)> = HashMap::new();
    let mut comp: Vec<(u16, usize, usize)> = vec![];
    let mut i = 0;
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) as i64 / 90;
        let kind = b[i + 10];
        let n = be(b, i + 11) as usize;
        if i + 13 + n > b.len() || pts > at { break; }
        let d = &b[i + 13..i + 13 + n];
        match kind {
            0x16 if d.len() >= 11 => {
                if d[7] & 0x80 != 0 { objs.clear(); pal = [[0u8; 4]; 256]; }
                comp.clear();
                let mut p = 11;
                for _ in 0..d[10] {
                    if p + 8 > d.len() { break; }
                    comp.push((be(d, p), be(d, p + 4) as usize, be(d, p + 6) as usize));
                    p += 8 + if d[p + 3] & 0x80 != 0 { 8 } else { 0 };
                }
            }
            0x14 => {
                let mut p = 2;
                while p + 5 <= d.len() {
                    let c = rgb_of(d[p + 1], d[p + 2], d[p + 3], bt709);
                    pal[d[p] as usize] = [c[0], c[1], c[2], d[p + 4]];
                    p += 5;
                }
            }
            0x15 if d.len() >= 4 => {
                let id = be(d, 0);
                let flag = d[3];
                if flag & 0x80 != 0 && d.len() >= 11 { part.insert(id, (be(d, 7) as usize, be(d, 9) as usize, d[11..].to_vec())); }
                else if let Some(e) = part.get_mut(&id) { e.2.extend_from_slice(&d[4..]); }
                if flag & 0x40 != 0 {
                    if let Some((ow, oh, data)) = part.remove(&id) { let px = unrle(&data, ow, oh); objs.insert(id, (ow, oh, px)); }
                }
            }
            0x80 => {
                out.fill(0);
                for &(id, x, y) in &comp {
                    let Some((ow, oh, px)) = objs.get(&id) else { continue };
                    for yy in 0..*oh { for xx in 0..*ow {
                        let k = px[yy * ow + xx] as usize;
                        let (px_x, px_y) = (x + xx, y + yy);
                        // สีช่องที่ 0 ไม่ได้โปร่งใสเสมอ ตัวทำไฟล์บางตัวใช้เป็นสีทึบ (SeConv ใช้เป็นสีตัวอักษร) ดูความทึบจากจานสีแทน
                        // ช่องที่ไม่ได้ตั้งในจานสีเป็นโปร่งใส (ค่าเริ่ม 0 0 0 0) · เดิมข้ามช่องที่ 0 ตัวอักษรของ SeConv หายทั้งตัว (เจอ 15 พ.ย. 2569)
                        if px_x >= w || px_y >= h { continue; }
                        let c = pal[k];
                        if c[3] == 0 { continue; }
                        out[(px_y * w + px_x) * 4..(px_y * w + px_x) * 4 + 4].copy_from_slice(&c);
                    } }
                }
            }
            _ => {}
        }
        i += 13 + n;
    }
    out
}

/// เวลา ms ของชุดแรกที่มีภาพในไฟล์ .sup
pub fn first_shown(b: &[u8]) -> Option<i64> {
    let mut i = 0;
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        if b[i + 10] == 0x16 && n >= 11 && b[i + 13 + 10] > 0 { return Some(u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) as i64 / 90); }
        i += 13 + n;
    }
    None
}

/// ภาพของ PGS แบบที่ตัวเล่นแสดง · จานสีแปลงเป็น YCbCr ด้วยตาราง coef709 (ที่เขียนลงไฟล์) แล้วถอดด้วยตาราง out709 (ที่ตัวเล่นใช้)
pub fn image_rgba(img: &Image, w: usize, h: usize, coef709: bool, out709: bool) -> Vec<u8> {
    let pal: Vec<[u8; 4]> = img.palette.iter().map(|c| {
        if c[3] == 0 { return [0, 0, 0, 0]; }
        let (y, cr, cb) = ycrcb(c[0], c[1], c[2], coef709);
        let r = rgb_of(y, cr, cb, out709);
        [r[0], r[1], r[2], c[3]]
    }).collect();
    let mut out = vec![0u8; w * h * 4];
    for o in &img.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            let (x, y) = (o.x as usize + xx, o.y as usize + yy);
            if k == 0 || x >= w || y >= h { continue; }
            out[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&pal[k]);
        } }
    }
    out
}

/// สีแบบไม่คูณความโปร่งใสของทุกจุด · mangle คิดสีแบบตัวเล่น (ซับ TV.601 บนภาพ BT.709) · viv เพิ่มความสด
pub fn straight_px(rgba: &[u8], mangle: bool, viv: f64) -> Vec<u8> {
    let mut out = vec![0u8; rgba.len()];
    for (i, p) in rgba.chunks_exact(4).enumerate() {
        if p[3] == 0 { continue; }
        let mut c = straight(p);
        if viv > 0.0 { c = vivid(c, viv); }
        let mut b = c.to_le_bytes();
        if mangle { let m = mangle601([b[0], b[1], b[2]]); b[..3].copy_from_slice(&m); }
        out[i * 4..i * 4 + 4].copy_from_slice(&b);
    }
    out
}

/// วาดซับไฟล์ sub หนึ่งภาพที่เวลา t_us (ไมโครวินาที) ขนาด w × h ของหนังขนาดจริง ow × oh ได้ RGBA แบบคูณความโปร่งใส (ภาพนิ่งของหน้าแก้ซับ)
#[allow(clippy::too_many_arguments)]
pub(crate) fn render_pair(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, ow: u32, oh: u32, t_us: i64) -> Result<Vec<u8>, String> {
    let (mut c, mut o) = spawn_pair(tools, sub, fonts, w, h, ow, oh, &[t_us])?;
    let mut buf = vec![0u8; (w * h * 4) as usize];
    if let Err(e) = read_frame(&mut o, &mut vec![], &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
    let _ = c.wait();
    Ok(buf)
}

/// วาดซับหนึ่งภาพที่เวลา t ได้ RGBA แบบคูณความโปร่งใส (แบบที่ ffmpeg ให้มา)
pub(crate) fn render_one(tools: &Path, work: &Path, doc: &SubDoc, fonts: Option<&Path>, w: u32, h: u32, t: i64) -> Result<Vec<u8>, String> {
    let sub = crate::subtitle::subshot::TmpSub::new(work, doc)?;
    let (mut c, mut o) = spawn_batch(tools, &sub.0, fonts, w, h, &[t])?;
    let mut buf = vec![0u8; (w * h * 4) as usize];
    if let Err(e) = read_frame(&mut o, &mut vec![], &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
    let _ = c.wait();
    Ok(buf)
}

/// วาดซับทุกเวลาใน times ทีละชุดไม่เกิน BATCH ภาพ ส่งภาพให้ on ทีละภาพตามลำดับ · กดหยุดตอบ stopped
pub(crate) fn render_all(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, times: &[i64], on: &mut dyn FnMut(usize, &[u8]) -> Result<(), String>, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let mut pair: Vec<u8> = vec![];
    let mut k = 0;
    for chunk in times.chunks(BATCH) {
        let (mut c, mut o) = spawn_batch(tools, sub, fonts, w, h, chunk)?;
        for _ in chunk {
            if cancel() { let _ = c.kill(); let _ = c.wait(); return Err("stopped".into()); }
            if let Err(e) = read_frame(&mut o, &mut pair, &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
            if let Err(e) = on(k, &buf) { let _ = c.kill(); let _ = c.wait(); return Err(e); }
            k += 1;
        }
        let ok = c.wait().map(|s| crate::app::tools::tool_succeeded("ffmpeg", &s)).unwrap_or(false);
        if !ok { return Err(ffmpeg_err(&mut c)); }
    }
    Ok(())
}

