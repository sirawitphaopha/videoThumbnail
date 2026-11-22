//! ส่งออก PGS ภาพตัวอย่างกับเทียบสีของซับ ASS กับภาพ PGS
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ภาพตัวอย่างกับเทียบสี

/// สีหลักสีหนึ่งของซับ ASS กับสีเดียวกันใน PGS
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ColorPair {
    /// #RRGGBB
    pub ass: String,
    pub pgs: String,
    /// ความต่างของสีแบบ ΔE (CIE76) · ไม่ถึง 2 ตาแทบมองไม่ออก
    pub de: f64,
    /// สัดส่วนของจุดทึบในซับ (%)
    pub share: f64,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsPreview {
    /// ภาพซับ ASS แบบที่ตัวเล่นแสดง ครอปเฉพาะบริเวณซับ PNG แบบ data URL · ซับ SRT ไม่มี
    pub ass: Option<String>,
    /// ภาพ PGS ที่จะได้ บริเวณเดียวกัน
    pub pgs: String,
    /// ภาพ PGS บริเวณเดียวกันแบบพื้นโปร่งใส (PNG มีความโปร่งใส) ให้หน้าจอวางบนพื้นมืดกับพื้นสว่างเอง (ใช้กับ SRT)
    pub pgs_alpha: String,
    pub w: u32,
    pub h: u32,
    pub colors: Vec<ColorPair>,
    /// ต่างเฉลี่ยต่อช่องสีในบริเวณซับ (0 ถึง 255) กับต่างมากสุด
    pub mean: f64,
    pub max: u32,
    /// สีในภาพก่อนลด กับสีในจานสีของ PGS
    pub before: usize,
    pub after: usize,
    /// พื้นหลังเป็นภาพหนัง (movie) หรือพื้นเทา (plain)
    pub bg: String,
    /// เวลานั้นไม่มีซับบนภาพ
    pub empty: bool,
    /// ซับบอก TV.601 และคิดสีแบบตัวเล่นอยู่
    pub mangled: bool,
}

fn lab(c: [u8; 3]) -> [f64; 3] {
    let lin = |v: u8| { let v = v as f64 / 255.0; if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    let (x, y, z) = ((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    let f = |t: f64| if t > 0.008856 { t.cbrt() } else { 7.787 * t + 16.0 / 116.0 };
    [116.0 * f(y) - 16.0, 500.0 * (f(x) - f(y)), 200.0 * (f(y) - f(z))]
}
/// ΔE แบบ CIE76
pub fn delta_e(a: [u8; 3], b: [u8; 3]) -> f64 { let (p, q) = (lab(a), lab(b)); ((p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2) + (p[2] - q[2]).powi(2)).sqrt() }
fn hex(c: [u8; 3]) -> String { format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2]) }

/// ภาพหนังที่เวลา t ขนาด w × h แบบ RGB · อ่านไม่ได้ได้ None (ใช้พื้นเทาแทน)
fn movie_rgb(tools: &Path, movie: &str, t: i64, w: u32, h: u32) -> Option<Vec<u8>> {
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.3}", t.max(0) as f64 / 1000.0).into(), "-i".into(), movie.into(),
        "-frames:v".into(), "1".into(), "-vf".into(), format!("scale={w}:{h}").into(), "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into()];
    let o = crate::app::tools::run_tool_timeout(tools, "ffmpeg", &args, std::time::Duration::from_secs(20)).ok()?;
    (o.status.success() && o.stdout.len() == (w * h * 3) as usize).then_some(o.stdout)
}

/// ภาพสองภาพ (สีแบบไม่คูณความโปร่งใส) วางบนพื้น ครอปบริเวณที่มีซับ แล้วเทียบสี
pub fn compare(asspx: &[u8], pgspx: &[u8], bg: &[u8], w: usize, h: usize) -> (Option<(Vec<u8>, Vec<u8>, Vec<u8>, usize, usize)>, Vec<ColorPair>, f64, u32) {
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0, 0);
    for y in 0..h { for x in 0..w { let i = (y * w + x) * 4; if asspx[i + 3] > 0 || pgspx[i + 3] > 0 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x0 > x1 { return (None, vec![], 0.0, 0); }
    let pad = 16;
    let (x0, y0, x1, y1) = (x0.saturating_sub(pad), y0.saturating_sub(pad), (x1 + pad).min(w - 1), (y1 + pad).min(h - 1));
    let (cw, ch) = (x1 + 1 - x0, y1 + 1 - y0);
    let over = |fg: &[u8], i: usize, j: usize| -> [u8; 3] { let a = fg[i + 3] as u32; [0, 1, 2].map(|k| ((fg[i + k] as u32 * a + bg[j + k] as u32 * (255 - a) + 127) / 255) as u8) };
    let (mut ia, mut ip) = (Vec::with_capacity(cw * ch * 3), Vec::with_capacity(cw * ch * 3));
    let mut alpha = Vec::with_capacity(cw * ch * 4);
    for y in y0..=y1 { alpha.extend_from_slice(&pgspx[(y * w + x0) * 4..(y * w + x1 + 1) * 4]); }
    let (mut sum, mut n, mut max) = (0u64, 0u64, 0u32);
    let mut groups: HashMap<[u8; 3], HashMap<[u8; 3], u32>> = HashMap::new();
    let mut opaque = 0u32;
    for y in y0..=y1 { for x in x0..=x1 {
        let (i, j) = ((y * w + x) * 4, (y * w + x) * 3);
        let (a, p) = (over(asspx, i, j), over(pgspx, i, j));
        ia.extend_from_slice(&a);
        ip.extend_from_slice(&p);
        for k in 0..3 { let d = (a[k] as i32 - p[k] as i32).unsigned_abs(); sum += d as u64; max = max.max(d); }
        n += 3;
        if asspx[i + 3] == 255 {
            opaque += 1;
            *groups.entry([asspx[i], asspx[i + 1], asspx[i + 2]]).or_default().entry([pgspx[i], pgspx[i + 1], pgspx[i + 2]]).or_insert(0) += 1;
        }
    } }
    let mut g: Vec<([u8; 3], u32, [u8; 3])> = groups.into_iter().map(|(c, m)| { let tot = m.values().sum(); let best = m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or(c); (c, tot, best) }).collect();
    g.sort_by(|a, b| b.1.cmp(&a.1));
    let pairs = g.into_iter().take(6).filter(|x| opaque > 0 && x.1 as f64 / opaque as f64 >= 0.01)
        .map(|(c, cnt, p)| ColorPair { ass: hex(c), pgs: hex(p), de: (delta_e(c, p) * 10.0).round() / 10.0, share: (cnt as f64 * 1000.0 / opaque as f64).round() / 10.0 }).collect();
    (Some((ia, ip, alpha, cw, ch)), pairs, if n > 0 { sum as f64 / n as f64 } else { 0.0 }, max)
}

fn png_rgba_url(rgba: Vec<u8>, w: usize, h: usize) -> Result<String, String> {
    let img = image::RgbaImage::from_raw(w as u32, h as u32, rgba).ok_or("ทำภาพตัวอย่างไม่ได้")?;
    let mut v = std::io::Cursor::new(Vec::new());
    img.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&v.into_inner())))
}

fn png_url(rgb: Vec<u8>, w: usize, h: usize) -> Result<String, String> {
    let img = image::RgbImage::from_raw(w as u32, h as u32, rgb).ok_or("ทำภาพตัวอย่างไม่ได้")?;
    let mut v = std::io::Cursor::new(Vec::new());
    img.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&v.into_inner())))
}

/// ภาพตัวอย่างหนึ่งเวลา · ASS ได้ภาพ ASS ตอนเล่นเทียบกับ PGS ที่จะได้พร้อมสีหลักทีละสี · SRT ได้ภาพ PGS ตามสไตล์ที่ตั้ง
/// sample คือประโยคตัวอย่างที่พิมพ์เอง แทนบรรทัดของไฟล์ (ใช้กับ SRT) · cancel บอกว่ามีคำขอภาพใหม่แล้ว ภาพตัวอย่างของ SUPer ปิด SUPer ตัวเก่าทิ้ง
pub fn preview(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, at: i64, sample: Option<&str>, cancel: &dyn Fn() -> bool) -> Result<PgsPreview, String> {
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let is_ass = doc.kind == "ass" || doc.kind == "ssa";
    let mut prep = prepare(doc, req);
    let mut at = at.max(0);
    if let Some(s) = sample.filter(|s| !s.trim().is_empty() && !is_ass) {
        prep.doc.events = vec![crate::subtitle::subdoc::Event { id: 1, start: 0, end: 10_000, style: "Default".into(), text: crate::subtitle::subdoc::srt_to_ass_text(s), ..Default::default() }];
        at = 5_000;
    }
    let (out709, coef709) = matrices(&req.opts, h, prep.tv601);
    let mangle = req.opts.vsfilter && prep.tv601 && out709;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let buf = render_one(tools, work, &prep.doc, fonts.as_deref(), w, h, at)?;
    let (wu, hu) = (w as usize, h as usize);
    let asspx = straight_px(&buf, mangle, 0.0);
    let (pgspx, before, after) = if req.engine == "super" {
        let (vf, (rate, base)) = (video_format(w, h, req.fps_num, req.fps_den).ok_or("SUPer รับเฉพาะขนาดภาพของ Blu-ray")?, bdn_rate(req.fps_num, req.fps_den));
        if !super_exe(tools).exists() { return Err("ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือ".into()); }
        let dir = TmpDir(work.join(format!("pgs-prev-{}", crate::cover::poster_image::unique())));
        std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
        let px = straight_px(&buf, mangle, req.opts.vivid.min(100) as f64 / 100.0);
        let Some((x, y, cw, ch)) = write_png(&dir.0, "00000000.png", &px, wu, hu)? else { return Ok(PgsPreview { empty: true, ..Default::default() }) };
        let f = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
        let s = (frame_no(at, req.fps_num, req.fps_den) as f64 * f).round() as i64;
        let ev = [BdnEvent { start: s, end: s + (f * 24.0) as i64, file: "00000000.png".into(), x, y, w: cw, h: ch }];
        let bdn = write_bdn(&dir.0, &ev, vf, rate, base, req.fps_num, req.fps_den)?;
        let out = dir.0.join("prev.sup");
        run_super(tools, &bdn, &out, &req.opts, out709, &|_, _, _| {}, cancel)?;
        let b = std::fs::read(&out).map_err(|e| e.to_string())?;
        let t0 = first_shown(&b).unwrap_or(0);
        let dec = decode_at(&b, t0, wu, hu, out709);
        let after = { let mut s = std::collections::HashSet::new(); for p in dec.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        let before = { let mut s = std::collections::HashSet::new(); for p in px.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        (dec, before, after)
    } else if req.engine == "seconv" {
        // ภาพที่ SeConv วาดจริง · ไฟล์ซับเล็ก ๆ ที่มีแค่บรรทัดที่ขึ้นตอนนั้น (หรือประโยคตัวอย่าง) ชนิดเดียวกับไฟล์เดิม แล้วถอดไฟล์ .sup ที่ได้
        if !seconv_exe(tools).exists() { return Err("ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือ".into()); }
        let mut mini = doc.clone();
        match sample.filter(|s| !s.trim().is_empty() && !is_ass) {
            Some(s) => {
                mini = crate::subtitle::subdoc::parse_doc(format!("1\r\n00:00:00,000 --> 00:00:10,000\r\n{}\r\n", s.trim()).as_bytes(), "srt", None);
            }
            None => mini.events.retain(|e| !e.comment && e.start <= at && at < e.end),
        }
        if mini.events.is_empty() { return Ok(PgsPreview { empty: true, ..Default::default() }); }
        let dir = TmpDir(work.join(format!("pgs-prev-{}", crate::cover::poster_image::unique())));
        std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
        let input = dir.0.join(format!("prev.{}", kind_ext(&mini.kind)));
        std::fs::write(&input, crate::subtitle::subdoc::render(&mini)).map_err(|e| e.to_string())?;
        let out = dir.0.join("prev.sup");
        run_seconv(tools, &input, &out, w, h, req, cancel)?;
        let b = std::fs::read(&out).map_err(|e| e.to_string())?;
        let dec = decode_at(&b, first_shown(&b).unwrap_or(0), wu, hu, out709);
        let count = |px: &[u8]| { let mut s = std::collections::HashSet::new(); for p in px.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        let before = count(&asspx);
        let after = count(&dec);
        (dec, before, after)
    } else {
        match image_of(&buf, wu, hu, &Enc::of(&req.opts)) {
            Some(img) => { let after = img.palette.len() - 1; (image_rgba(&img, wu, hu, coef709, out709), img.colors, after) }
            None => return Ok(PgsPreview { empty: true, ..Default::default() }),
        }
    };
    let movie_bg = req.movie.as_deref().filter(|m| !m.is_empty() && is_ass).and_then(|m| movie_rgb(tools, m, at, w, h));
    let bg_kind = if movie_bg.is_some() { "movie" } else { "plain" };
    let bg = movie_bg.unwrap_or_else(|| vec![0x5a; wu * hu * 3]);
    let (crop, colors, mean, max) = compare(&asspx, &pgspx, &bg, wu, hu);
    let Some((ia, ip, alpha, cw, ch)) = crop else { return Ok(PgsPreview { empty: true, ..Default::default() }) };
    Ok(PgsPreview {
        ass: if is_ass { Some(png_url(ia, cw, ch)?) } else { None },
        pgs: png_url(ip, cw, ch)?, pgs_alpha: png_rgba_url(alpha, cw, ch)?, w: cw as u32, h: ch as u32,
        colors: if is_ass { colors } else { vec![] }, mean: (mean * 100.0).round() / 100.0, max, before, after, bg: bg_kind.into(), empty: false, mangled: mangle,
    })
}

