//! ส่งออก PGS ตัวสร้าง SUPer กับตัวสร้าง Subtitle Edit (SeConv)
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ตัวสร้าง SUPer

/// SUPer ในโฟลเดอร์เครื่องมือ (fetch-tools แตกไว้ที่ tools\super) · SUPer ของ cubicibo ทำ .sup ตามมาตรฐาน Blu-ray จากไฟล์ BDN XML กับภาพ PNG
pub fn super_exe(tools: &Path) -> PathBuf { tools.join("super").join("SUPer_CLI.exe") }

/// รูปแบบภาพใน BDN XML · SUPer รับเฉพาะขนาดของ Blu-ray
pub fn video_format(w: u32, h: u32, num: u32, den: u32) -> Option<&'static str> {
    let f = num as f64 / den.max(1) as f64;
    match (w, h) {
        (1920, 1080) => Some(if f < 24.5 { "1080p" } else { "1080i" }),
        (1280, 720) => Some("720p"),
        (720, 576) => Some("576i"),
        (720, 480) => Some("480i"),
        _ => None,
    }
}

/// อัตราเฟรมแบบที่ BDN XML เขียน กับฐานของเลขเฟรมในเวลา (23.976 นับเฟรมแบบ 24 แล้ว SUPer คูณเวลา 1.001 เอง)
pub fn bdn_rate(num: u32, den: u32) -> (&'static str, u32) {
    match fps_code(num, den) { 0x20 => ("24", 24), 0x30 => ("25", 25), 0x40 => ("29.97", 30), 0x60 => ("50", 50), 0x70 => ("59.94", 60), _ => ("23.976", 24) }
}

/// เลขเฟรมของเวลา t ms
pub fn frame_no(t: i64, num: u32, den: u32) -> i64 { (t.max(0) as f64 * num as f64 / (den.max(1) as f64 * 1000.0)).round() as i64 }

/// เวลาแบบ ชม:นาที:วินาที:เฟรม ของ BDN XML
pub fn bdn_tc(n: i64, base: u32) -> String {
    let b = base.max(1) as i64;
    let s = n / b;
    format!("{:02}:{:02}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60, n % b)
}

/// ภาพหนึ่งภาพของ BDN XML
pub(crate) struct BdnEvent { pub(crate) start: i64, pub(crate) end: i64, pub(crate) file: String, pub(crate) x: usize, pub(crate) y: usize, pub(crate) w: usize, pub(crate) h: usize }

/// ครอปภาพตรงที่มีซับ เขียนเป็น PNG สีแบบไม่คูณความโปร่งใส · ไม่มีซับคืน None
pub(crate) fn write_png(dir: &Path, name: &str, px: &[u8], w: usize, h: usize) -> Result<Option<(usize, usize, usize, usize)>, String> {
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0, 0);
    for y in 0..h { for x in 0..w { if px[(y * w + x) * 4 + 3] > 0 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x0 > x1 { return Ok(None); }
    let (cw, ch) = (x1 + 1 - x0, y1 + 1 - y0);
    let mut c = Vec::with_capacity(cw * ch * 4);
    for y in y0..=y1 { c.extend_from_slice(&px[(y * w + x0) * 4..(y * w + x1 + 1) * 4]); }
    let img = image::RgbaImage::from_raw(cw as u32, ch as u32, c).ok_or("ทำภาพ PNG ไม่ได้")?;
    img.save_with_format(dir.join(name), image::ImageFormat::Png).map_err(|e| format!("เขียนภาพ PNG ไม่ได้ {e}"))?;
    Ok(Some((x0, y0, cw, ch)))
}

pub(crate) fn write_bdn(dir: &Path, ev: &[BdnEvent], vf: &str, rate: &str, base: u32, num: u32, den: u32) -> Result<PathBuf, String> {
    let tc = |t: i64| bdn_tc(frame_no(t, num, den), base);
    let mut x = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<BDN Version=\"0.93\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:noNamespaceSchemaLocation=\"BD-03-006-0093b BDN File Format.xsd\">\n  <Description>\n    <Name Title=\"movie-shelf\" Content=\"\"/>\n    <Language Code=\"und\"/>\n");
    x.push_str(&format!("    <Format VideoFormat=\"{vf}\" FrameRate=\"{rate}\" DropFrame=\"False\"/>\n"));
    let (first, last) = (ev.first().map(|e| tc(e.start)).unwrap_or_default(), ev.last().map(|e| tc(e.end)).unwrap_or_default());
    x.push_str(&format!("    <Events LastEventOutTC=\"{last}\" FirstEventInTC=\"{first}\" ContentInTC=\"{first}\" ContentOutTC=\"{last}\" NumberofEvents=\"{}\" Type=\"Graphic\"/>\n  </Description>\n  <Events>\n", ev.len()));
    for e in ev {
        x.push_str(&format!("    <Event Forced=\"False\" InTC=\"{}\" OutTC=\"{}\">\n      <Graphic Width=\"{}\" Height=\"{}\" X=\"{}\" Y=\"{}\">{}</Graphic>\n    </Event>\n", tc(e.start), tc(e.end), e.w, e.h, e.x, e.y, e.file));
    }
    x.push_str("  </Events>\n</BDN>\n");
    let p = dir.join("bdn.xml");
    std::fs::write(&p, x).map_err(|e| format!("เขียน BDN XML ไม่ได้ {e}"))?;
    Ok(p)
}

/// ลบโฟลเดอร์ทำงานของ SUPer ตอนจบเสมอ
pub(crate) struct TmpDir(pub(crate) PathBuf);
impl Drop for TmpDir {
    // ตั้งตัวแปร PGS_KEEP ไว้ไล่ปัญหา โฟลเดอร์ภาพกับ bdn.xml ไม่ถูกลบ
    fn drop(&mut self) { if std::env::var_os("PGS_KEEP").is_none() { let _ = std::fs::remove_dir_all(&self.0); } }
}

/// รัน SUPer ทำ .sup จาก bdn.xml · ความคืบหน้าอ่านจากแถบของ SUPer (เลขภาพที่หากรอบแล้ว จากภาพทั้งหมด) · กดหยุดปิด SUPer
pub(crate) fn run_super(tools: &Path, bdn: &Path, out: &Path, opts: &PgsOpts, bt709: bool, progress: &dyn Fn(usize, usize, &str), cancel: &dyn Fn() -> bool) -> Result<(), String> {
    use std::io::BufRead;
    let mut args: Vec<OsString> = vec![
        "-i".into(), bdn.as_os_str().to_owned(), "-c".into(), opts.compression.min(100).to_string().into(), "-q".into(), opts.quantizer.min(3).to_string().into(),
        "--layout".into(), opts.layout.min(2).to_string().into(), "-b".into(), (if bt709 { "709" } else { "601" }).into(),
        // เครื่องพี่กันแรม 8 GB ซีพียู 12 เธรด ให้ SUPer ใช้ไม่เกิน 4 เธรด เครื่องไม่กระตุก (CLAUDE.md)
        "-t".into(), "4".into(),
    ];
    if opts.redraw > 0.0 { args.push("--redraw-period".into()); args.push(format!("{:.1}", opts.redraw.clamp(1.0, 60.0)).into()); }
    if opts.max_kbps > 0 { args.push("-m".into()); args.push(opts.max_kbps.to_string().into()); }
    if opts.allow_normal { args.push("-n".into()); }
    if opts.ahead { args.push("-d".into()); }
    args.push("-y".into());
    args.push(out.as_os_str().to_owned());
    let dir = tools.join("super");
    // config.ini กับ lib/libimagequant.dll ของ SUPer อ้างที่อยู่จากโฟลเดอร์ของมันเอง · ที่อยู่ไฟล์ที่ส่งเป็นแบบเต็มทั้งหมด
    // PYOPENCL_NO_CACHE ไม่ใช้แคชคอมไพล์ของ pyopencl ใน AppData · เดิม SUPer ที่โดนปิดกลางทางทิ้งไฟล์ล็อกค้าง ทุกรอบถัดไปรอล็อกราวหนึ่งนาทีแล้วพัง
    // "Encoder died: Empty@get" (เจอ 15 พ.ย. 2569) · config.ini ตั้ง use_gpu=0 ด้วย (fetch-tools) ใช้ซีพียูเร็วพอกัน (8 กับ 9 วินาที) ไม่พึ่งไดรเวอร์ OpenCL ของการ์ดจอในตัว
    let mut child = tool_command(&dir, "SUPer_CLI", &args).current_dir(&dir).env("PYOPENCL_NO_CACHE", "1").stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด SUPer ไม่ได้ {e}"))?;
    let err = child.stderr.take().ok_or("อ่านผลของ SUPer ไม่ได้")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut r = std::io::BufReader::new(err);
        let mut buf = vec![];
        // แถบความคืบหน้าของ SUPer เขียนทับบรรทัดเดิมด้วย \r
        loop {
            buf.clear();
            match r.read_until(b'\r', &mut buf) { Ok(0) | Err(_) => break, Ok(_) => {} }
            for l in String::from_utf8_lossy(&buf).split(['\r', '\n']) { if !l.trim().is_empty() && tx.send(l.to_string()).is_err() { return; } }
        }
    });
    // ข้อความของ SUPer ที่ไม่ใช่แถบความคืบหน้า เก็บไว้บอกเหตุผลตอนไม่สำเร็จ และเขียนลง super-last.log ในโฟลเดอร์ทำงานไว้ไล่ดู
    let mut log: Vec<String> = vec![];
    let take = |l: &str, log: &mut Vec<String>| { if !l.contains('%') && !l.trim().is_empty() { log.push(l.trim().to_string()); } };
    loop {
        if cancel() { let _ = child.kill(); let _ = child.wait(); return Err("stopped".into()); }
        while let Ok(l) = rx.try_recv() {
            // "Finding epochs and layouts:  45%|... | 41/92 [..."
            if let Some(p) = l.find(" [") { if let Some(s) = l[..p].rsplit(' ').next() { if let Some((a, b)) = s.split_once('/') { if let (Ok(a), Ok(b)) = (a.parse::<usize>(), b.parse::<usize>()) { progress(a, b, "super"); } } } }
            take(&l, &mut log);
        }
        match child.try_wait() {
            Ok(Some(st)) => {
                std::thread::sleep(std::time::Duration::from_millis(80));
                while let Ok(l) = rx.try_recv() { take(&l, &mut log); }
                if st.success() && out.exists() { return Ok(()); }
                if let Some(d) = bdn.parent().and_then(|p| p.parent()) { let _ = std::fs::write(d.join("super-last.log"), log.join("\n")); }
                // บรรทัดที่บอกต้นเหตุ ขึ้นต้น ERROR หรือมีคำว่า Error ก่อน ไม่มีใช้บรรทัดสุดท้าย
                let why = log.iter().find(|l| l.contains("ERROR") || l.contains("Error") || l.contains("Exception")).or(log.last()).cloned().unwrap_or_default();
                return Err(format!("SUPer ทำไฟล์ไม่สำเร็จ {}", why.trim_start_matches("SUPer").trim()));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(80)),
            Err(e) => return Err(format!("SUPer ทำไฟล์ไม่สำเร็จ {e}")),
        }
    }
}

/// ตัวสร้าง SUPer · วาดภาพด้วย libass แบบเดียวกับตัวในโปรแกรม เขียนเป็น PNG กับ BDN XML แล้วให้ SUPer ทำไฟล์ .sup
pub(crate) fn export_super(tools: &Path, work: &Path, prep: &Prepared, req: &PgsReq, progress: &dyn Fn(usize, usize, &str)) -> Result<PgsOut, String> {
    let exe = super_exe(tools);
    if !exe.exists() { return Err("ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือ".into()); }
    let target = PathBuf::from(&req.target);
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let vf = video_format(w, h, req.fps_num, req.fps_den).ok_or("SUPer รับเฉพาะขนาดภาพของ Blu-ray คือ 1920 × 1080 1280 × 720 720 × 576 หรือ 720 × 480")?;
    let (rate, base) = bdn_rate(req.fps_num, req.fps_den);
    let (out709, _) = matrices(&req.opts, h, prep.tv601);
    let mangle = req.opts.vsfilter && prep.tv601 && out709;
    let viv = req.opts.vivid.min(100) as f64 / 100.0;
    let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
    let doc = &prep.doc;
    let pts = change_points(doc, frame_ms);
    let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(doc, pts[i]) && i + 1 < pts.len()).collect();
    let total = need.len();
    let dir = TmpDir(work.join(format!("pgs-super-{}", crate::cover::poster_image::unique())));
    std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
    let sub = crate::subtitle::subshot::TmpSub::new(work, doc)?;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let times: Vec<i64> = need.iter().map(|&i| pts[i]).collect();
    let mut ev: Vec<BdnEvent> = vec![];
    let mut prev: Option<Vec<u8>> = None;
    progress(0, total, "draw");
    render_all(tools, &sub.0, fonts.as_deref(), w, h, &times, &mut |k: usize, buf: &[u8]| {
        let (start, end) = (pts[need[k]], pts[need[k] + 1]);
        let px = straight_px(buf, mangle, viv);
        if (k + 1) % 4 == 0 || k + 1 == total { progress(k + 1, total, "draw"); }
        // ภาพเดิมต่อกัน ยืดเวลาจบของภาพก่อน
        if let (Some(p), Some(last)) = (&prev, ev.last_mut()) { if *p == px && last.end == start { last.end = end; return Ok(()); } }
        if frame_no(end, req.fps_num, req.fps_den) <= frame_no(start, req.fps_num, req.fps_den) { return Ok(()); }
        let file = format!("{:08}.png", ev.len());
        if let Some((x, y, cw, ch)) = write_png(&dir.0, &file, &px, w as usize, h as usize)? { ev.push(BdnEvent { start, end, file, x, y, w: cw, h: ch }); }
        prev = Some(px);
        Ok(())
    }, &|| STOP.load(Ordering::SeqCst))?;
    drop(sub);
    if ev.is_empty() { return Err("ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ จึงไม่มีภาพให้ส่งออก".into()); }
    let bdn = write_bdn(&dir.0, &ev, vf, rate, base, req.fps_num, req.fps_den)?;
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = target.with_file_name(format!("{name}.{}.partial.sup", crate::cover::poster_image::unique()));
    let r = run_super(tools, &bdn, &tmp, &req.opts, out709, progress, &|| STOP.load(Ordering::SeqCst));
    if let Err(e) = r { let _ = std::fs::remove_file(&tmp); return Err(e); }
    if let Err(p) = crate::cover::rename::move_no_replace(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    let bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(PgsOut { path: target.display().to_string(), images: ev.len(), bytes, ..Default::default() })
}

// ---------------------------------------------------------------- ตัวสร้าง Subtitle Edit (SeConv)

/// SeConv ตัวแปลงซับแบบบรรทัดคำสั่งของ Subtitle Edit (fetch-tools แตกไว้ที่ tools\seconv)
/// พี่กันสั่ง 15 พ.ย. 2569 "เอามาด้วยก็ดีนะ เเต่ใส่หมายเหตุ เเละภาพตัวอย่างอยู่เเล้วว่ามันจะหายหมด เเต่ถ้าเอามาแปลงเเค่ srt ก็ใช้ได้"
/// วาดด้วยตัววาดของมันเอง (SkiaSharp) ไม่อ่านสไตล์ ตำแหน่ง และเอฟเฟกต์ของ ASS ใช้หน้าตาเดียวทั้งไฟล์ตามที่ตั้งในหน้าต่าง
pub fn seconv_exe(tools: &Path) -> PathBuf { tools.join("seconv").join("seconv.exe") }

/// ตัวเลือกหน้าตาซับของ SeConv · ขนาด ขอบ เงา ระยะ ในหน้าต่างคิดที่ภาพสูง 1080 ย่อขยายตามภาพจริง (ตัวเลือกของ SeConv เป็นจุดบนภาพ)
/// SeConv ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แท็ก <i> ในบรรทัดยังใช้ได้
fn seconv_style_args(st: &SrtStyle, h: u32) -> Vec<OsString> {
    let k = h.max(16) as f64 / 1080.0;
    let n = |v: f64| { let v = if v.is_finite() { (v * k).max(0.0) } else { 0.0 }; let s = format!("{v:.1}"); s.trim_end_matches('0').trim_end_matches('.').to_string() };
    let hex = |s: &str| { let x = s.trim().trim_start_matches('#'); if x.len() == 6 && x.chars().all(|c| c.is_ascii_hexdigit()) { x.to_uppercase() } else { "FFFFFF".into() } };
    let font = { let f = st.font.trim(); if f.is_empty() { "Tahoma" } else { f } };
    let shadow_a = (255.0 * st.shadow_opacity.min(100) as f64 / 100.0).round() as u8;
    let mut a: Vec<OsString> = vec![
        format!("--font-name:{font}").into(), format!("--font-size:{}", n(st.size)).into(), format!("--font-color:#{}", hex(&st.color)).into(),
        format!("--outline-color:#{}", hex(&st.outline_color)).into(), format!("--outline-width:{}", n(st.outline)).into(),
        format!("--shadow-color:#{shadow_a:02X}{}", hex(&st.shadow_color)).into(), format!("--shadow-width:{}", n(st.shadow)).into(),
        format!("--bottom-top-margin:{}", (st.margin_v.max(0.0) * k).round() as i64).into(),
        format!("--left-right-margin:{}", (st.margin_h.max(0.0) * k).round() as i64).into(),
        format!("--alignment:{}", ["bottom-left", "bottom-center", "bottom-right", "middle-left", "middle-center", "middle-right", "top-left", "top-center", "top-right"][st.align.clamp(1, 9) as usize - 1]).into(),
        format!("--content-alignment:{}", match st.content_align.as_str() { "left" | "right" | "from-alignment" => st.content_align.as_str(), _ => "center" }).into(),
        format!("--line-spacing:{}", st.line_spacing.clamp(0.0, 200.0).round() as i64).into(),
    ];
    if st.bold { a.push("--font-bold".into()); }
    if matches!(st.box_type.as_str(), "one-box" | "box-per-line") {
        let box_a = (255.0 * st.box_opacity.min(100) as f64 / 100.0).round() as u8;
        a.push(format!("--box-type:{}", st.box_type).into());
        a.push(format!("--background-color:#{box_a:02X}{}", hex(&st.box_color)).into());
        a.push(format!("--box-padding:{}", (st.box_padding.max(0.0) * k).round() as i64).into());
        a.push(format!("--background-corner-radius:{}", (st.box_radius.max(0.0) * k).round() as i64).into());
    }
    a
}

/// รัน SeConv ทำ .sup จากไฟล์ซับ input ลง out (ชื่อไฟล์ในโฟลเดอร์ของ out) · cancel บอกให้หยุด
pub(crate) fn run_seconv(tools: &Path, input: &Path, out: &Path, w: u32, h: u32, req: &PgsReq, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    let (dir, name) = (out.parent().ok_or("ที่เก็บไม่ถูกต้อง")?, out.file_name().ok_or("ที่เก็บไม่ถูกต้อง")?.to_string_lossy().to_string());
    let (rate, _) = bdn_rate(req.fps_num, req.fps_den);
    let mut args: Vec<OsString> = vec![
        input.as_os_str().to_owned(), "bluraysup".into(), format!("--resolution:{w}x{h}").into(), format!("--fps:{rate}").into(),
        format!("--output-folder:{}", dir.display()).into(), format!("--output-filename:{name}").into(), "--overwrite".into(), "--quiet".into(),
    ];
    args.extend(seconv_style_args(&req.style.clone().unwrap_or_default(), h));
    let mut child = tool_command(&tools.join("seconv"), "seconv", &args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด SeConv ไม่ได้ {e}"))?;
    loop {
        if cancel() { let _ = child.kill(); let _ = child.wait(); return Err("stopped".into()); }
        match child.try_wait() {
            Ok(Some(st)) => {
                let mut msg = String::new();
                if let Some(mut s) = child.stdout.take() { let _ = s.read_to_string(&mut msg); }
                if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut msg); }
                if st.success() && out.exists() { return Ok(()); }
                let why = msg.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with(['│', '┌', '└', '─', '╭', '╰'])).last().unwrap_or("").to_string();
                return Err(format!("SeConv ทำไฟล์ไม่สำเร็จ {why}"));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(80)),
            Err(e) => return Err(format!("SeConv ทำไฟล์ไม่สำเร็จ {e}")),
        }
    }
}

/// นามสกุลของไฟล์ซับที่เขียนให้ SeConv อ่าน ตามชนิดของเอกสาร
pub(crate) fn kind_ext(kind: &str) -> &'static str { match kind { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" } }

/// จำนวนชุดที่มีภาพในไฟล์ .sup
pub fn shown_sets(b: &[u8]) -> usize {
    let (mut i, mut n) = (0, 0);
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let len = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        if b[i + 10] == 0x16 && len >= 11 && b.get(i + 13 + 10).is_some_and(|&c| c > 0) { n += 1; }
        i += 13 + len;
    }
    n
}

/// ตัวสร้าง SeConv · เขียนซับเป็นไฟล์ชั่วคราวชนิดเดิม แล้วให้ SeConv วาดและทำ .sup เอง
pub(crate) fn export_seconv(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, progress: &dyn Fn(usize, usize, &str)) -> Result<PgsOut, String> {
    if !seconv_exe(tools).exists() { return Err("ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือ".into()); }
    let target = PathBuf::from(&req.target);
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let input = work.join(format!("seconv-{}.{}", crate::cover::poster_image::unique(), kind_ext(&doc.kind)));
    std::fs::write(&input, crate::subtitle::subdoc::render(doc)).map_err(|e| e.to_string())?;
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = target.with_file_name(format!("{name}.{}.partial.sup", crate::cover::poster_image::unique()));
    progress(0, 1, "seconv");
    let r = run_seconv(tools, &input, &tmp, w, h, req, &|| STOP.load(Ordering::SeqCst));
    let _ = std::fs::remove_file(&input);
    if let Err(e) = r { let _ = std::fs::remove_file(&tmp); return Err(e); }
    progress(1, 1, "seconv");
    let images = std::fs::read(&tmp).map(|b| shown_sets(&b)).unwrap_or(0);
    if let Err(p) = crate::cover::rename::move_no_replace(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    let bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(PgsOut { path: target.display().to_string(), images, bytes, ..Default::default() })
}

