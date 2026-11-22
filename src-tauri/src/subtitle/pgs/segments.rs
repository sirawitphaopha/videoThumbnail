//! ส่งออก PGS เขียนส่วนของ PGS (PCS WDS PDS ODS END) สีแบบ BT.601 การเตรียมซับ
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- เขียนส่วนของ PGS

/// รหัสอัตราเฟรมใน PCS · 23.976 24 25 29.97 50 59.94
pub fn fps_code(num: u32, den: u32) -> u8 {
    let f = num as f64 / den.max(1) as f64;
    [(23.976, 0x10), (24.0, 0x20), (25.0, 0x30), (29.97, 0x40), (50.0, 0x60), (59.94, 0x70)].iter()
        .min_by(|a, b| (a.0 - f).abs().partial_cmp(&(b.0 - f).abs()).unwrap()).map(|x| x.1).unwrap_or(0x10)
}

/// สี RGB เป็น Y Cr Cb ช่วงสีแบบทีวี (16 ถึง 235)
pub fn ycrcb(r: u8, g: u8, b: u8, bt709: bool) -> (u8, u8, u8) {
    let (kr, kb) = if bt709 { (0.2126, 0.0722) } else { (0.299, 0.114) };
    let (r, g, b) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let y = kr * r + (1.0 - kr - kb) * g + kb * b;
    let cb = (b - y) / (2.0 * (1.0 - kb));
    let cr = (r - y) / (2.0 * (1.0 - kr));
    let q = |v: f64| v.round().clamp(0.0, 255.0) as u8;
    (q(16.0 + 219.0 * y), q(128.0 + 224.0 * cr), q(128.0 + 224.0 * cb))
}

/// Y Cr Cb ช่วงทีวีกลับเป็น RGB แบบที่ตัวเล่นถอดจานสีของ PGS
pub fn rgb_of(y: u8, cr: u8, cb: u8, bt709: bool) -> [u8; 3] {
    let (kr, kb) = if bt709 { (0.2126, 0.0722) } else { (0.299, 0.114) };
    let yf = (y as f64 - 16.0) / 219.0;
    let (crf, cbf) = ((cr as f64 - 128.0) / 224.0, (cb as f64 - 128.0) / 224.0);
    let r = yf + 2.0 * (1.0 - kr) * crf;
    let b = yf + 2.0 * (1.0 - kb) * cbf;
    let g = (yf - kr * r - kb * b) / (1.0 - kr - kb);
    let q = |v: f64| (v * 255.0).round().clamp(0.0, 255.0) as u8;
    [q(r), q(g), q(b)]
}

/// สีที่ตัวเล่นแสดงจริงเมื่อซับบอกว่าเป็น TV.601 แต่ภาพเป็น BT.709 (mpv ทำแบบ VSFilter) · แปลงเป็น YCbCr ด้วย BT.601 แล้วถอดด้วย BT.709
pub fn mangle601(c: [u8; 3]) -> [u8; 3] {
    let (y, cr, cb) = ycrcb(c[0], c[1], c[2], false);
    rgb_of(y, cr, cb, true)
}

/// ซับบอกตารางสีเป็น TV.601 ไหม · ไม่มีบรรทัด YCbCr Matrix นับเป็น TV.601 แบบ libass กับ mpv (ค่าเดิมของ VSFilter)
/// PlayResY ของซับ ASS · ไม่มีใช้ 288 แบบ libass
pub fn script_play_res_y(doc: &SubDoc) -> f64 {
    use crate::subtitle::subdoc::Item;
    doc.skeleton.iter().find_map(|it| match it {
        Item::Line { t, .. } => t.trim_start_matches('\u{FEFF}').trim().to_ascii_lowercase().strip_prefix("playresy:").and_then(|v| v.trim().parse::<f64>().ok()),
        _ => None,
    }).filter(|&v| v > 0.0).unwrap_or(288.0)
}

/// ระยะแนวตั้งที่ข้อความของ \move(x1,y1,x2,y2…) วิ่ง หน่วยของสคริปต์ ค่าบวกคือวิ่งลง (BUGS ข้อ 126)
pub fn move_dy(text: &str) -> Option<f64> {
    let t = tags_of(text);
    let i = t.find("\\move(")?;
    let rest = &t[i + 6..];
    let a: Vec<f64> = rest[..rest.find(')')?].split(',').filter_map(|s| s.trim().parse().ok()).collect();
    (a.len() >= 4).then(|| a[3] - a[1])
}

pub fn script_tv601(doc: &SubDoc) -> bool {
    use crate::subtitle::subdoc::Item;
    let v = doc.skeleton.iter().find_map(|it| match it {
        Item::Line { t, .. } => { let s = t.trim_start_matches('\u{FEFF}').trim(); s.to_ascii_lowercase().strip_prefix("ycbcr matrix:").map(|v| v.trim().to_string()) }
        _ => None,
    });
    v.is_none_or(|v| v == "tv.601")
}

/// ตั้งบรรทัด YCbCr Matrix เป็น None ให้ libass วาดสีตรงตามสไตล์ · ไม่มีบรรทัดนี้ใส่ต่อจาก [Script Info]
/// ตัวกรอง subtitles ของ ffmpeg วาดซับ TV.601 TV.709 หรือไม่มีบรรทัดนี้ลงภาพ RGB แล้วบีบสีเหลือช่วง 16 ถึง 235 สีจึงหม่น
/// (วัดแล้ว 14 พ.ย. 2569 สีเหลือง 255,215,0 ได้ 235,201,16 เท่าสูตร 16 + สี × 219 ÷ 255 · ตั้ง None หรือ PC.709 ได้ 255,215,0)
pub fn set_matrix_none(doc: &mut SubDoc) {
    use crate::subtitle::subdoc::Item;
    let eol = doc.eol.clone();
    let mut found = false;
    for it in doc.skeleton.iter_mut() {
        if let Item::Line { t, .. } = it {
            if t.trim_start_matches('\u{FEFF}').trim().to_ascii_lowercase().starts_with("ycbcr matrix:") { *t = "YCbCr Matrix: None".into(); found = true; }
        }
    }
    if found { return; }
    let at = doc.skeleton.iter().position(|it| matches!(it, Item::Line { t, .. } if t.trim_start_matches('\u{FEFF}').trim().eq_ignore_ascii_case("[script info]")));
    match at {
        Some(i) => doc.skeleton.insert(i + 1, Item::Line { t: "YCbCr Matrix: None".into(), e: eol }),
        None => {
            doc.skeleton.insert(0, Item::Line { t: "[Script Info]".into(), e: eol.clone() });
            doc.skeleton.insert(1, Item::Line { t: "YCbCr Matrix: None".into(), e: eol });
        }
    }
}

/// #RRGGBB กับความโปร่งใส (0 ทึบ 255 ใส) เป็นสีแบบ ASS &HAABBGGRR · อ่านไม่ออกได้ขาว
fn ass_col(hex: &str, alpha: u8) -> String {
    let h = hex.trim().trim_start_matches('#');
    let v = if h.len() == 6 { u32::from_str_radix(h, 16).unwrap_or(0xFFFFFF) } else { 0xFFFFFF };
    let (r, g, b) = ((v >> 16) & 255, (v >> 8) & 255, v & 255);
    format!("&H{alpha:02X}{b:02X}{g:02X}{r:02X}")
}

/// สไตล์ Default ของซับ SRT ตามที่ตั้งในหน้าต่างส่งออก · ช่องเรียงตาม Format ของ [V4+ Styles] ใน subdoc.rs (23 ช่อง)
pub fn srt_style(st: &SrtStyle) -> crate::subtitle::subdoc::Style {
    let n = |v: f64, lo: f64, hi: f64| { let v = if v.is_finite() { v.clamp(lo, hi) } else { lo }; let s = format!("{v:.2}"); s.trim_end_matches('0').trim_end_matches('.').to_string() };
    let font = { let f = st.font.replace(',', " "); if f.trim().is_empty() { "Tahoma".to_string() } else { f.trim().to_string() } };
    let shadow_a = (255.0 * (1.0 - st.shadow_opacity.min(100) as f64 / 100.0)).round() as u8;
    let b = |on: bool| if on { "-1" } else { "0" }.to_string();
    let fields = vec![
        "Default".into(), font, n(st.size, 8.0, 300.0), ass_col(&st.color, 0), "&H000000FF".into(), ass_col(&st.outline_color, 0), ass_col(&st.shadow_color, shadow_a),
        b(st.bold), b(st.italic), "0".into(), "0".into(), "100".into(), "100".into(), "0".into(), "0".into(), "1".into(),
        n(st.outline, 0.0, 20.0), n(st.shadow, 0.0, 20.0), st.align.clamp(1, 9).to_string(), n(st.margin_h, 0.0, 900.0), n(st.margin_h, 0.0, 900.0), n(st.margin_v, 0.0, 500.0), "1".into(),
    ];
    crate::subtitle::subdoc::Style { id: 1, fields, ..Default::default() }
}

/// เอกสารที่ส่งให้ libass วาด กับข้อมูลสีของซับ
pub struct Prepared {
    pub doc: SubDoc,
    /// ซับบอก TV.601 (หรือไม่บอก) ใช้คิดสีแบบตัวเล่นเมื่อภาพเป็น BT.709
    pub tv601: bool,
}

/// ASS SSA ตั้ง YCbCr Matrix เป็น None · SRT VTT แปลงเป็น ASS ภาพสูง 1080 ตามสัดส่วนภาพ ใช้สไตล์ที่ตั้งไว้ (ไม่ส่งมาใช้ค่าตั้งต้น)
pub fn prepare(doc: &SubDoc, req: &PgsReq) -> Prepared {
    if doc.kind == "ass" || doc.kind == "ssa" {
        let tv601 = script_tv601(doc);
        let mut d = doc.clone();
        set_matrix_none(&mut d);
        return Prepared { doc: d, tv601 };
    }
    let (w, h) = (req.w.max(16) as f64, req.h.max(16) as f64);
    let mut d = crate::subtitle::subdoc::to_ass(doc, (((1080.0 * w / h).round() as u32).max(16), 1080));
    set_matrix_none(&mut d);
    d.styles = vec![srt_style(&req.style.clone().unwrap_or_default())];
    Prepared { doc: d, tv601: false }
}

/// ตารางสีของจานสี PGS กับตารางที่ใช้แปลงสีของซับ · (ตัวเล่นถอดด้วยแบบไหน, เข้ารหัสด้วยแบบไหน) จริงคือ BT.709
pub fn matrices(opts: &PgsOpts, h: u32, tv601: bool) -> (bool, bool) {
    let out709 = match opts.matrix.as_str() { "709" => true, "601" => false, _ => h > 576 };
    let coef709 = if opts.vsfilter && tv601 && out709 { false } else { out709 };
    (out709, coef709)
}

/// ภาพเลขสีแบบ RLE ของ PGS ทีละแถว จบแถวด้วย 00 00 · สีที่ 0 เขียนแบบนับจำนวนเสมอ
pub fn rle(px: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut o = Vec::with_capacity(px.len() / 4 + h * 2);
    for y in 0..h {
        let row = &px[y * w..(y + 1) * w];
        let mut i = 0;
        while i < w {
            let c = row[i];
            let mut n = 1;
            while i + n < w && row[i + n] == c && n < 16383 { n += 1; }
            if c == 0 {
                if n < 64 { o.extend([0, n as u8]); } else { o.extend([0, 0x40 | (n >> 8) as u8, (n & 0xff) as u8]); }
            } else if n < 3 {
                for _ in 0..n { o.push(c); }
            } else if n < 64 {
                o.extend([0, 0x80 | n as u8, c]);
            } else {
                o.extend([0, 0xC0 | (n >> 8) as u8, (n & 0xff) as u8, c]);
            }
            i += n;
        }
        o.extend([0, 0]);
    }
    o
}

/// หนึ่งส่วน (segment) พร้อมเวลาแสดง (PTS) กับเวลาเริ่มถอด (DTS) หน่วย 90 kHz
fn seg_d(o: &mut Vec<u8>, pts: u32, dts: u32, kind: u8, data: &[u8]) {
    o.extend(b"PG");
    o.extend(pts.to_be_bytes());
    o.extend(dts.min(pts).to_be_bytes());
    o.push(kind);
    o.extend((data.len() as u16).to_be_bytes());
    o.extend(data);
}
fn be16(v: &mut Vec<u8>, x: u16) { v.extend(x.to_be_bytes()); }

/// สถานะของชุดตามมาตรฐาน PGS · เริ่ม epoch ใหม่ (ล้างจอและความจำของตัวถอด) · จุดเริ่มอ่าน (ส่งข้อมูลครบแต่ใช้กรอบเดิม ไม่ล้างจอ) · ปกติ
pub const EPOCH_START: u8 = 0x80;
pub const ACQUISITION: u8 = 0x40;
pub const NORMAL: u8 = 0x00;

/// หัวของหนึ่งชุด
#[derive(Clone, Copy, Debug)]
pub struct Head { pub pts: u32, pub dts: u32, pub comp: u16, pub w: u16, pub h: u16, pub fps: u8, pub state: u8 }

/// ความเร็วของตัวถอดตามแบบจำลองของเครื่องเล่น Blu-ray · ถอดภาพ 16 ล้านไบต์ต่อวินาที (Rd 128 Mbps) · วาดลงจอและล้างจอ 32 ล้านไบต์ต่อวินาที (Rc 256 Mbps)
const RD: u64 = 16_000_000;
const RC: u64 = 32_000_000;
fn ticks(bytes: u64, rate: u64) -> u32 { (bytes * 90_000).div_ceil(rate).min(u32::MAX as u64) as u32 }

/// เวลาที่ตัวถอดต้องใช้ก่อนแสดงชุดนี้ได้ (หน่วย 90 kHz) · ล้างจอทั้งจอตอนเริ่ม epoch · ถอดทุกภาพที่ส่งมา · วาดทุกกรอบ
pub fn decode_ticks(state: u8, w: u16, h: u16, objs: &[(u16, u16)], wins: &[(u16, u16, u16, u16)]) -> u32 {
    let init = if state == EPOCH_START { ticks(w as u64 * h as u64, RC) } else { 0 };
    let dec: u32 = objs.iter().map(|&(ow, oh)| ticks(ow as u64 * oh as u64, RD)).sum();
    let draw: u32 = wins.iter().map(|&(_, _, ww, hh)| ticks(ww as u64 * hh as u64, RC)).sum();
    init + dec + draw
}

fn pcs_bytes(hd: &Head, pal_update: bool, comp_objs: &[(u16, u8, u16, u16)]) -> Vec<u8> {
    let mut pcs = vec![];
    be16(&mut pcs, hd.w); be16(&mut pcs, hd.h); pcs.push(hd.fps); be16(&mut pcs, hd.comp);
    pcs.extend([hd.state, if pal_update { 0x80 } else { 0x00 }, 0x00, comp_objs.len() as u8]);
    for &(id, win, x, y) in comp_objs { be16(&mut pcs, id); pcs.push(win); pcs.push(0); be16(&mut pcs, x); be16(&mut pcs, y); }
    pcs
}
fn wds_bytes(wins: &[(u16, u16, u16, u16)]) -> Vec<u8> {
    let mut wds = vec![wins.len() as u8];
    for (i, (x, y, ww, hh)) in wins.iter().enumerate() { wds.push(i as u8); be16(&mut wds, *x); be16(&mut wds, *y); be16(&mut wds, *ww); be16(&mut wds, *hh); }
    wds
}
fn pds_bytes(palette: &[[u8; 4]], ver: u8, bt709: bool) -> Vec<u8> {
    let mut pds = vec![0u8, ver];
    for (i, c) in palette.iter().enumerate() {
        let (y, cr, cb) = if c[3] == 0 { (16, 128, 128) } else { ycrcb(c[0], c[1], c[2], bt709) };
        pds.extend([i as u8, y, cr, cb, c[3]]);
    }
    pds
}

/// กรอบที่ภาพอยู่ข้างใน (เลขกรอบ) · ภาพต้องอยู่ในกรอบทั้งภาพ
fn win_of(o: &Obj, wins: &[(u16, u16, u16, u16)]) -> Option<u8> {
    wins.iter().position(|&(x, y, ww, hh)| o.x >= x && o.y >= y && o.x + o.w <= x + ww && o.y + o.h <= y + hh).map(|i| i as u8)
}
/// ทุกภาพอยู่ในกรอบชุดเดิมได้ คนละกรอบกัน
pub fn fits(img: &Image, wins: &[(u16, u16, u16, u16)]) -> bool {
    let mut used = vec![false; wins.len()];
    for o in &img.objs {
        match win_of(o, wins) { Some(k) if !used[k as usize] => used[k as usize] = true, _ => return false }
    }
    true
}
/// กรอบของ epoch ใหม่ กว้างเต็มจอตามแนวนอน และเผื่อบนล่างอย่างละหนึ่งในแปดของความสูงภาพ (อย่างน้อย 8 จุด)
/// ภาพเคลื่อน ภาพที่โตขึ้นนิดหน่อย หรือบรรทัดถัดไปที่ยาวไม่เท่ากัน ยังอยู่ในกรอบเดิมได้ ไม่ต้องล้างจอใหม่
/// (เจอ 15 พ.ย. 2569 คาราโอเกะที่ตัวอักษรตกลงมาจากขอบบน ภาพสูงขึ้นทีละจุดทุกเฟรม กรอบพอดีภาพต้องเริ่ม epoch ใหม่ทุกเฟรม เครื่องเล่น Blu-ray ถอดไม่ทัน 5 ชุด)
/// moving คือเริ่ม epoch ใหม่กลางภาพเคลื่อนไหว (ภาพก่อนหน้ายังขึ้นอยู่) เผื่อครึ่งหนึ่งของความสูงภาพ (อย่างน้อย 32 จุด) ภาพที่โตต่อจะใช้กรอบนี้ได้อีกหลายเฟรม
/// สองกรอบไม่ทับกัน เส้นแบ่งอยู่กึ่งกลางระหว่างสองภาพ
/// travel คือระยะที่ข้อความของบรรทัด \move ที่ขึ้นอยู่จะวิ่งขึ้นและวิ่งลง (จุดบนจอ) เผื่อกรอบตามนั้น ข้อความวิ่งจบในกรอบเดียว ไม่ต้องเริ่ม epoch ใหม่ระหว่างทาง
pub fn epoch_windows(img: &Image, w: u16, h: u16, moving: bool, travel: (i32, i32)) -> Vec<(u16, u16, u16, u16)> {
    let mut v: Vec<(i32, i32)> = img.objs.iter().map(|o| {
        let pad = if moving { (o.h as i32 / 2).max(32) } else { (o.h as i32 / 8).max(8) };
        let (up, down) = (pad.max(if travel.0 > 0 { travel.0 + 8 } else { 0 }), pad.max(if travel.1 > 0 { travel.1 + 8 } else { 0 }));
        ((o.y as i32 - up).max(0), (o.y as i32 + o.h as i32 + down).min(h as i32))
    }).collect();
    for i in 1..v.len() {
        let (a_end, b_start) = (img.objs[i - 1].y as i32 + img.objs[i - 1].h as i32, img.objs[i].y as i32);
        if v[i - 1].1 > v[i].0 { let mid = (a_end + b_start) / 2; v[i - 1].1 = mid.max(a_end); v[i].0 = mid.max(a_end).min(b_start); }
    }
    v.iter().map(|&(y0, y1)| (0, y0 as u16, w, (y1 - y0).max(1) as u16)).collect()
}

/// ชุดแสดงภาพเต็ม PCS WDS PDS ODS END · ใช้ตอนเริ่ม epoch หรือจุดเริ่มอ่าน · obj_ver คือรุ่นของภาพในกรอบเดิม (เพิ่มทุกครั้งที่ส่งภาพใหม่ใน epoch เดียวกัน)
pub fn show_set_x(hd: &Head, img: &Image, wins: &[(u16, u16, u16, u16)], pal_ver: u8, obj_ver: u8, bt709: bool) -> Vec<u8> {
    let mut o = vec![];
    let comp_objs: Vec<(u16, u8, u16, u16)> = img.objs.iter().enumerate().map(|(i, ob)| (i as u16, win_of(ob, wins).unwrap_or(i as u8), ob.x, ob.y)).collect();
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, false, &comp_objs));
    seg_d(&mut o, hd.pts, hd.dts, 0x17, &wds_bytes(wins));
    seg_d(&mut o, hd.pts, hd.dts, 0x14, &pds_bytes(&img.palette, pal_ver, bt709));
    // เวลาเริ่มถอดของแต่ละภาพต่อกันตามลำดับ หลังล้างจอ (ถ้าเริ่ม epoch)
    let mut at = hd.dts.saturating_add(if hd.state == EPOCH_START { ticks(hd.w as u64 * hd.h as u64, RC) } else { 0 });
    for (i, ob) in img.objs.iter().enumerate() {
        let data = rle(&ob.px, ob.w as usize, ob.h as usize);
        // ส่วนแรกมีหัว 11 ไบต์ ส่วนต่อมา 4 ไบต์ · ขนาดข้อมูลรวม 24 บิตนับความกว้างความสูงด้วย
        let first_max = 65535 - 11;
        let mut pos = 0;
        let mut first = true;
        while first || pos < data.len() {
            let room = if first { first_max } else { 65535 - 4 };
            let end = (pos + room).min(data.len());
            let last = end >= data.len();
            let mut d = vec![];
            be16(&mut d, i as u16);
            d.push(obj_ver);
            d.push(match (first, last) { (true, true) => 0xC0, (true, false) => 0x80, (false, true) => 0x40, _ => 0x00 });
            if first {
                let n = data.len() + 4;
                d.extend([(n >> 16) as u8, (n >> 8) as u8, n as u8]);
                be16(&mut d, ob.w); be16(&mut d, ob.h);
            }
            d.extend(&data[pos..end]);
            seg_d(&mut o, hd.pts, at, 0x15, &d);
            pos = end;
            first = false;
        }
        at = at.saturating_add(ticks(ob.w as u64 * ob.h as u64, RD));
    }
    seg_d(&mut o, hd.pts, at, 0x80, &[]);
    o
}

/// ชุดเปลี่ยนแค่จานสี PCS (ธง palette update) PDS END · ภาพเดิมในตัวถอดใช้ต่อ ไม่ส่งซ้ำ (ภาพเฟด สีเปลี่ยน)
pub fn palette_set(hd: &Head, img: &Image, wins: &[(u16, u16, u16, u16)], palette: &[[u8; 4]], pal_ver: u8, bt709: bool) -> Vec<u8> {
    let mut o = vec![];
    let comp_objs: Vec<(u16, u8, u16, u16)> = img.objs.iter().enumerate().map(|(i, ob)| (i as u16, win_of(ob, wins).unwrap_or(i as u8), ob.x, ob.y)).collect();
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, true, &comp_objs));
    seg_d(&mut o, hd.pts, hd.dts, 0x14, &pds_bytes(palette, pal_ver, bt709));
    seg_d(&mut o, hd.pts, hd.dts, 0x80, &[]);
    o
}

/// ชุดแสดงภาพแบบเดิม เริ่ม epoch ใหม่ กรอบเท่าภาพ (ใช้ในตัวคาดขนาดและเทส)
pub fn show_set(pts: u32, comp: u16, w: u16, h: u16, fps: u8, img: &Image, bt709: bool) -> Vec<u8> {
    let wins: Vec<(u16, u16, u16, u16)> = img.objs.iter().map(|o| (o.x, o.y, o.w, o.h)).collect();
    show_set_x(&Head { pts, dts: 0, comp, w, h, fps, state: EPOCH_START }, img, &wins, 0, 0, bt709)
}

/// ชุดล้างจอ PCS ไม่มีภาพ กรอบของ epoch END
pub fn clear_set_x(hd: &Head, wins: &[(u16, u16, u16, u16)]) -> Vec<u8> {
    let mut o = vec![];
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, false, &[]));
    seg_d(&mut o, hd.pts, hd.dts, 0x17, &wds_bytes(wins));
    seg_d(&mut o, hd.pts, hd.dts, 0x80, &[]);
    o
}

