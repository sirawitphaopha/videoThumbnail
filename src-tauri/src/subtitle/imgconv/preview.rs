//! ภาพตัวอย่างก่อนแปลงซับภาพ อ่าน BDN XML ตัด SUP ทีละภาพ
//! แยกจาก imgconv/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ภาพตัวอย่าง

/// ภาพหนึ่งชิ้นของซับหนึ่งภาพ (ซับหนึ่งภาพมีได้สองชิ้นตามสองกรอบของ PGS) · png เป็น data URL
#[derive(Serialize, Debug, Clone)]
pub struct PrevGraphic { pub png: String, pub x: u32, pub y: u32, pub w: u32, pub h: u32 }

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImgPreview {
    /// จำนวนภาพทั้งหมดของผลที่จะได้ กับภาพที่ส่งมา
    pub total: usize,
    pub index: usize,
    /// ขนาดจอของผล
    pub w: u32,
    pub h: u32,
    pub start: i64,
    pub end: i64,
    pub forced: bool,
    pub graphics: Vec<PrevGraphic>,
    pub warnings: Vec<String>,
}

/// เหตุการณ์หนึ่งใน BDN XML · ไฟล์ภาพกับตำแหน่ง
#[derive(Debug, Clone, PartialEq)]
pub struct BdnEvent { pub start: i64, pub end: i64, pub forced: bool, pub graphics: Vec<(String, u32, u32, u32, u32)> }

fn attr(tag: &str, k: &str) -> Option<String> {
    let i = tag.find(&format!("{k}=\""))? + k.len() + 2;
    Some(tag[i..].split('"').next()?.to_string())
}

/// อ่าน BDN XML ที่ BDSup2Sub++ เขียน · ขนาดจอจาก VideoFormat · เวลา HH:MM:SS:FF คิดด้วย FrameRate
pub fn parse_bdn(xml: &str) -> ((u32, u32), Vec<BdnEvent>) {
    let fmt = xml.find("<Format").map(|i| &xml[i..xml[i..].find('>').map_or(xml.len(), |j| i + j)]).unwrap_or("");
    let canvas = match attr(fmt, "VideoFormat").unwrap_or_default().to_ascii_lowercase().as_str() {
        "1080p" | "1080i" => (1920, 1080), "720p" => (1280, 720), "576i" | "576p" => (720, 576), "480i" | "480p" => (720, 480), "1440x1080" => (1440, 1080), _ => (0, 0),
    };
    let fps: f64 = attr(fmt, "FrameRate").and_then(|v| v.parse().ok()).filter(|v: &f64| *v > 1.0).unwrap_or(25.0);
    let tc = |s: &str| -> i64 {
        let p: Vec<f64> = s.split(':').filter_map(|x| x.parse().ok()).collect();
        if p.len() != 4 { return 0; }
        // เฟรมเรตแบบ 23.976 ใช้นาฬิกา 24 เฟรมต่อวินาทีตามที่ BDN นับ แล้วคูณ 1.001 กลับเป็นเวลาจริง
        let nominal = fps.round().max(1.0);
        let frames = ((p[0] * 3600.0 + p[1] * 60.0 + p[2]) * nominal + p[3]) as f64;
        (frames * 1000.0 / fps).round() as i64
    };
    let mut out = vec![];
    for chunk in xml.split("<Event ").skip(1) {
        let head = &chunk[..chunk.find('>').unwrap_or(0)];
        let mut ev = BdnEvent { start: tc(&attr(head, "InTC").unwrap_or_default()), end: tc(&attr(head, "OutTC").unwrap_or_default()), forced: attr(head, "Forced").is_some_and(|v| v.eq_ignore_ascii_case("true")), graphics: vec![] };
        let body = &chunk[..chunk.find("</Event>").unwrap_or(chunk.len())];
        for g in body.split("<Graphic").skip(1) {
            let gh = &g[..g.find('>').unwrap_or(0)];
            let file = g[g.find('>').map_or(0, |i| i + 1)..].split('<').next().unwrap_or("").trim().to_string();
            let n = |k: &str| attr(gh, k).and_then(|v| v.parse().ok()).unwrap_or(0u32);
            if !file.is_empty() { ev.graphics.push((file, n("X"), n("Y"), n("Width"), n("Height"))); }
        }
        out.push(ev);
    }
    (canvas, out)
}

pub(crate) static PREVIEW_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// ภาพตัวอย่างของผลที่จะได้ ภาพที่ index · แปลงทั้งไฟล์ด้วยตัวเลือกเดียวกับตอนแปลงจริงลงโฟลเดอร์ชั่วคราว แล้วให้ BDSup2Sub++ แปลงผลนั้นต่อเป็น BDN XML กับ PNG
/// (palette keep resolution keep ภาพจึงเป็นพิกเซลของผลจริง รวม VobSub ที่เหลือ 4 สี) · เก็บผลไว้ตามตัวเลือก เปลี่ยนแค่ภาพที่ดูไม่ต้องแปลงใหม่

/// ชุดแสดงของไฟล์ PGS ทีละชุด (ตำแหน่งเริ่ม ตำแหน่งจบ มีภาพไหม เริ่มยุคใหม่ไหม เวลาวินาที) · ชุดหนึ่งคือ PCS ไปจนถึง END
fn sup_sets(data: &[u8]) -> Vec<(usize, usize, bool, bool, f64)> {
    let mut out = vec![];
    let mut cur: Option<(usize, bool, bool, f64)> = None;
    let mut i = 0usize;
    while i + 13 <= data.len() && &data[i..i + 2] == b"PG" {
        let kind = data[i + 10];
        let size = ((data[i + 11] as usize) << 8) | data[i + 12] as usize;
        let p = data.get(i + 13..i + 13 + size).unwrap_or(&[]);
        if kind == 0x16 {
            let pts = u32::from_be_bytes([data[i + 2], data[i + 3], data[i + 4], data[i + 5]]) as f64 / 90000.0;
            // สถานะ 0x80 เริ่มยุคใหม่ 0x40 จุดเริ่มอ่าน ทั้งสองแบบมีวัตถุครบในตัว ไม่พึ่งชุดก่อนหน้า
            let state = p.get(7).copied().unwrap_or(0);
            cur = Some((i, p.get(10).copied().unwrap_or(0) > 0, state & 0xC0 != 0, pts));
        }
        i += 13 + size;
        if kind == 0x80 { if let Some((s, has, ep, pts)) = cur.take() { out.push((s, i, has, ep, pts)); } }
    }
    out
}

/// ตัดไฟล์ PGS ให้เหลือภาพที่ขึ้นเวลา start จนถึงชุดที่ปิดภาพนั้นตอน end เริ่มจากต้นยุคของภาพ เพราะวัตถุอาจนิยามไว้ในชุดก่อนหน้า
/// เลือกจากเวลา ไม่ใช่ลำดับชุด เพราะไฟล์จริงส่งภาพเดิมซ้ำได้หลายชุด (เปลี่ยนจานสี จุดเริ่มอ่าน) ตัวแปลงนับเป็นภาพเดียว
pub(crate) fn sup_cut(data: &[u8], start: f64, end: Option<f64>) -> Option<Vec<u8>> {
    let sets = sup_sets(data);
    let near = |a: f64, b: f64| (a - b).abs() < 0.0015;
    let j = sets.iter().position(|s| s.2 && near(s.4, start))?;
    let e = (0..=j).rev().find(|&k| sets[k].3).unwrap_or(0);
    let k = end.and_then(|te| (j + 1..sets.len()).find(|&k| near(sets[k].4, te))).unwrap_or((j + 1).min(sets.len() - 1));
    Some(data[sets[e].0..sets[k].1].to_vec())
}

/// เวลาขึ้นกับเวลาหายของทุกภาพในไฟล์ PGS จากตัวอ่านของตัวดูซับ (subs::parse_sup นับภาพเดิมที่ส่งซ้ำเป็นภาพเดียว ได้เท่ากับ BDSup2Sub++)
/// ตัวอ่านถอดภาพทุกภาพ ไฟล์ 439 ภาพราว 2 วินาที จึงจำผลไว้ข้างไฟล์ที่ดึงมา ไฟล์เปลี่ยนแล้วอ่านใหม่
fn sup_shows(work: &Path, src: &Path, data: &[u8]) -> Vec<(f64, Option<f64>)> {
    let meta = std::fs::metadata(src).ok();
    let stamp = format!("{}|{:?}|{:?}", src.display(), meta.as_ref().map(|m| m.len()), meta.and_then(|m| m.modified().ok()));
    let mut h: u64 = 0xcbf29ce484222325;
    for b in stamp.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    let keep = work.join(format!("imgconv-shows-{h:016x}.txt"));
    if let Ok(s) = std::fs::read_to_string(&keep) {
        return s.lines().filter_map(|l| { let mut it = l.split(' '); Some((it.next()?.parse().ok()?, it.next().and_then(|e| e.parse().ok()))) }).collect();
    }
    let shows: Vec<(f64, Option<f64>)> = crate::subtitle::subs::parse_sup(data).into_iter().map(|s| (s.start, s.end)).collect();
    let text: Vec<String> = shows.iter().map(|(a, b)| format!("{a} {}", b.map(|b| b.to_string()).unwrap_or_default())).collect();
    let _ = std::fs::write(&keep, text.join("\n"));
    shows
}

/// แทร็ก PGS ในหนังดึงออกมาครั้งเดียวแล้วเก็บไว้ ภาพตัวอย่างครั้งต่อไปไม่ต้องอ่านหนังทั้งไฟล์อีก · ไฟล์หนังเปลี่ยน (ขนาดหรือเวลาแก้ไข) ดึงใหม่
fn sup_source(tools: &Path, work: &Path, req: &ImgReq) -> Result<PathBuf, String> {
    let src = PathBuf::from(&req.src);
    if !req.in_movie { return Ok(src); }
    let meta = std::fs::metadata(&src).map_err(|_| "หาไฟล์ต้นทางไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?;
    let stamp = format!("{}|{}|{}|{}|{:?}", req.src, req.tid, req.ff, meta.len(), meta.modified().ok());
    let mut h: u64 = 0xcbf29ce484222325;
    for b in stamp.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    let keep = work.join(format!("imgconv-src-{h:016x}.sup"));
    if keep.exists() { return Ok(keep); }
    let (input, _tmp) = input_file(tools, work, req)?;
    std::fs::copy(&input, &keep).map_err(|e| e.to_string())?;
    // เก็บไว้ 3 แทร็กล่าสุด
    let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-src-") && e.path() != keep)
        .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in v.into_iter().skip(2) { let _ = std::fs::remove_file(p); }
    Ok(keep)
}

/// ภาพตัวอย่างของซับ PGS แปลงเฉพาะภาพที่ดูอยู่ (BUGS ข้อ 142 พี่กันทัก 16 พ.ย. 2569 "ช้ามากตรงนี้ มันควรแปลเเค่ภาพที่ดูอยู่ไหม")
/// เดิมแปลงทั้งไฟล์แล้วแปลงกลับเป็น BDN อีกรอบ ไฟล์ 439 ภาพรอนาน · ซับ VobSub และการเปลี่ยนอัตราเฟรมที่ให้เดาอัตราเฟรมต้นทางเอง ยังแปลงทั้งไฟล์
fn preview_one(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<Option<ImgPreview>, String> {
    if req.kind == "vobsub" || (req.fps_source == "auto" && req.fps_target != "keep") { return Ok(None); }
    let src = sup_source(tools, work, req)?;
    if !src.extension().is_some_and(|e| e.eq_ignore_ascii_case("sup")) { return Ok(None); }
    let data = std::fs::read(&src).map_err(|e| e.to_string())?;
    let shows = sup_shows(work, &src, &data);
    let total = shows.len();
    if total == 0 { return Ok(None); }
    let i = index.min(total - 1);
    let (t, te) = shows[i];
    let Some(one) = sup_cut(&data, t, te) else { return Ok(None) };
    // เวลาที่ภาพนี้ควรขึ้นในผล ใช้เลือกภาพจากผลของไฟล์เล็ก (ไฟล์เล็กอาจมีภาพก่อนหน้าในยุคเดียวกันหรือภาพที่ขึ้นต่อทันที)
    let factor = match (req.fps_source.parse::<f64>(), req.fps_target.parse::<f64>()) { (Ok(a), Ok(b)) if b > 0.0 => a / b, _ => 1.0 };
    let want = (t * 1000.0 * factor) as i64 + req.delay;
    let target = PathBuf::from(&req.target);
    let kind = out_kind(&target)?;
    let key = {
        let mut r = req.clone();
        r.target = format!("x.{kind}");
        // v2 เลือกภาพจากเวลา ผลของรุ่นแรกที่นับชุดแสดงผิดใช้ไม่ได้
        let s = format!("v2|{r:?}|{}|{i}", src.display());
        let mut h: u64 = 0xcbf29ce484222325;
        for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
        format!("{h:016x}")
    };
    let dir = work.join(format!("imgconv-one-{key}"));
    let xml = dir.join("bdn").join("prev.xml");
    let log_file = dir.join("warnings.txt");
    if !dir.join(".ok").exists() {
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("bdn")).map_err(|e| e.to_string())?;
        let input = dir.join("one.sup");
        std::fs::write(&input, &one).map_err(|e| e.to_string())?;
        let cfg = work.join("bdsup2sub-cfg");
        let _ = std::fs::create_dir_all(&cfg);
        let out = dir.join(format!("t.{kind}"));
        let args = if req.engine == "seconv" { seconv_args(req, &input, &out, kind) } else { bdsup_args(req, &input, &out, kind)? };
        let log = run(tools, &cfg, &req.engine, &args, &|_, _| {}, cancel)?;
        if req.engine == "seconv" { seconv_settle(kind, &out)?; }
        let warns: Vec<String> = log.iter().map(|l| l.trim()).filter(|l| l.starts_with("WARNING")).map(|l| l.trim_start_matches("WARNING:").trim().to_string()).collect();
        let _ = std::fs::write(&log_file, warns.join("\n"));
        let back: Vec<OsString> = vec!["--resolution".into(), "keep".into(), "--palette-mode".into(), "keep".into(), "--no-export-palette".into(), "--output".into(), xml.clone().into(), out.into()];
        run(tools, &cfg, "bdsup", &back, &|_, _| {}, cancel)?;
        std::fs::write(dir.join(".ok"), b"").map_err(|e| e.to_string())?;
        // เก็บภาพตัวอย่างทีละภาพไว้ 60 ภาพล่าสุด กดย้อนกลับไปภาพเดิมได้ทันที
        let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-one-") && e.path() != dir)
            .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
        v.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in v.into_iter().skip(59) { let _ = std::fs::remove_dir_all(p); }
    }
    let s = std::fs::read_to_string(&xml).map_err(|_| "ทำภาพตัวอย่างไม่ได้")?;
    let ((w, h), evs) = parse_bdn(&s);
    let Some(ev) = evs.iter().min_by_key(|e| (e.start - want).abs()) else { return Ok(Some(ImgPreview { w, h, total, index: i, ..Default::default() })) };
    let mut graphics = vec![];
    for (f, x, y, gw, gh) in &ev.graphics {
        let b = std::fs::read(dir.join("bdn").join(f)).map_err(|e| format!("อ่านภาพตัวอย่างไม่ได้ {e}"))?;
        graphics.push(PrevGraphic { png: format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b)), x: *x, y: *y, w: *gw, h: *gh });
    }
    let warnings = std::fs::read_to_string(&log_file).unwrap_or_default().lines().filter(|l| !l.is_empty()).map(str::to_string).collect();
    Ok(Some(ImgPreview { total, index: i, w, h, start: ev.start, end: ev.end, forced: ev.forced, graphics, warnings }))
}

pub fn preview(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<ImgPreview, String> {
    // แปลงทีละภาพไม่สำเร็จ ลองแบบทั้งไฟล์ต่อ ยกเว้นคนกดเปลี่ยนภาพหรือปิดหน้าต่างไปแล้ว
    match preview_one(tools, work, req, index, cancel) {
        Ok(Some(r)) => return Ok(r),
        Err(e) if cancel() => return Err(e),
        _ => {}
    }
    preview_full(tools, work, req, index, cancel)
}

/// ภาพตัวอย่างแบบแปลงทั้งไฟล์แล้วแปลงกลับเป็น BDN (ทางเดิม) เก็บผลไว้ เปลี่ยนภาพที่ดูไม่ต้องแปลงใหม่
pub(crate) fn preview_full(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<ImgPreview, String> {
    let target = PathBuf::from(&req.target);
    let kind = out_kind(&target)?;
    let key = {
        let mut r = req.clone();
        r.target = format!("x.{kind}");
        let s = format!("{r:?}");
        let mut h: u64 = 0xcbf29ce484222325;
        for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
        format!("{h:016x}")
    };
    let dir = work.join(format!("imgconv-prev-{key}"));
    let xml = dir.join("bdn").join("prev.xml");
    let log_file = dir.join("warnings.txt");
    if !dir.join(".ok").exists() {
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("bdn")).map_err(|e| e.to_string())?;
        let (input, _in_dir) = input_file(tools, work, req)?;
        let cfg = work.join("bdsup2sub-cfg");
        let _ = std::fs::create_dir_all(&cfg);
        let out = dir.join(format!("t.{kind}"));
        let args = if req.engine == "seconv" { seconv_args(req, &input, &out, kind) } else { bdsup_args(req, &input, &out, kind)? };
        let log = run(tools, &cfg, &req.engine, &args, &|_, _| {}, cancel)?;
        if req.engine == "seconv" { seconv_settle(kind, &out)?; }
        let warns: Vec<String> = log.iter().map(|l| l.trim()).filter(|l| l.starts_with("WARNING")).map(|l| l.trim_start_matches("WARNING:").trim().to_string()).collect();
        let _ = std::fs::write(&log_file, warns.join("\n"));
        let back: Vec<OsString> = vec!["--resolution".into(), "keep".into(), "--palette-mode".into(), "keep".into(), "--no-export-palette".into(), "--output".into(), xml.clone().into(), out.into()];
        run(tools, &cfg, "bdsup", &back, &|_, _| {}, cancel)?;
        std::fs::write(dir.join(".ok"), b"").map_err(|e| e.to_string())?;
        // เก็บผลภาพตัวอย่างไว้ 3 ชุดล่าสุด
        let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-prev-") && e.path() != dir)
            .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
        v.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in v.into_iter().skip(2) { let _ = std::fs::remove_dir_all(p); }
    }
    let s = std::fs::read_to_string(&xml).map_err(|_| "ทำภาพตัวอย่างไม่ได้")?;
    let ((w, h), evs) = parse_bdn(&s);
    if evs.is_empty() { return Ok(ImgPreview { w, h, ..Default::default() }); }
    let i = index.min(evs.len() - 1);
    let ev = &evs[i];
    let mut graphics = vec![];
    for (f, x, y, gw, gh) in &ev.graphics {
        let b = std::fs::read(dir.join("bdn").join(f)).map_err(|e| format!("อ่านภาพตัวอย่างไม่ได้ {e}"))?;
        graphics.push(PrevGraphic { png: format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b)), x: *x, y: *y, w: *gw, h: *gh });
    }
    let warnings = std::fs::read_to_string(&log_file).unwrap_or_default().lines().filter(|l| !l.is_empty()).map(str::to_string).collect();
    Ok(ImgPreview { total: evs.len(), index: i, w, h, start: ev.start, end: ev.end, forced: ev.forced, graphics, warnings })
}

