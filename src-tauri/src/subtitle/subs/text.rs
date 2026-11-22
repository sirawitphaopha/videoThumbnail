//! ซับข้อความ รหัสอักษร แยกบรรทัด SRT VTT ASS ดึงซับจากไฟล์ และภาพหนังหนึ่งภาพ
//! แยกจาก subs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- รหัสอักษร

/// CP874 (Windows ไทย) ช่วง 0x80–0x9F ที่ต่างจาก TIS-620 · ที่เหลือ 0xA1–0xFB = U+0E01–U+0E5B
pub(crate) fn cp874(b: u8) -> char {
    match b {
        0x00..=0x7F => b as char,
        0x80 => '€',
        0x85 => '…',
        0x91 => '\u{2018}',
        0x92 => '\u{2019}',
        0x93 => '\u{201C}',
        0x94 => '\u{201D}',
        0x95 => '•',
        0x96 => '–',
        0x97 => '—',
        0xA0 => '\u{00A0}',
        0xA1..=0xDA | 0xDF..=0xFB => char::from_u32(b as u32 + 0x0D60).unwrap_or('\u{FFFD}'),
        _ => '\u{FFFD}',
    }
}

/// ไบต์ของไฟล์ซับเป็นข้อความ · BOM ก่อน · UTF-8 ที่ถูกต้อง · ไม่ใช่ = ไทยแบบเก่า
/// เดาชุดอักษรของซับที่ไม่มี BOM · UTF-8 (ยอมเศษตัวอักษรที่ขาดท้ายบัฟเฟอร์) · CP874 เฉพาะเมื่อไบต์สูงเกือบทั้งหมดเป็นอักษรไทยจริง
/// และมีพยัญชนะไทยพอ · นอกนั้นถือเป็น Windows-1252 (ซับฝรั่งเศส สเปน เยอรมันแบบเก่า)
/// (ผู้ช่วยตรวจขั้น 10 ข้อ 4 · เดิมไม่ใช่ UTF-8 และมีไบต์ 0xA1–0xFB สักตัว = TIS-620 ซับฝรั่งเศส é กลายเป็นวรรณยุกต์ไทย)
pub fn guess_charset(b: &[u8]) -> &'static str {
    match std::str::from_utf8(b) {
        Ok(_) => return "UTF-8",
        Err(e) if e.error_len().is_none() && e.valid_up_to() > 0 => return "UTF-8",
        Err(_) => {}
    }
    let (mut high, mut thai, mut cons) = (0usize, 0usize, 0usize);
    for &c in b {
        if c < 0x80 { continue; }
        high += 1;
        if (0xA1..=0xDA).contains(&c) || (0xDF..=0xFB).contains(&c) { thai += 1; }
        if (0xA1..=0xCE).contains(&c) { cons += 1; }
    }
    if high > 0 && thai * 10 >= high * 9 && cons * 10 >= high * 3 { "CP874" } else { "CP1252" }
}

/// Windows-1252 ช่วง 0x80–0x9F (นอกนั้นตรงกับ Latin-1)
pub(crate) fn cp1252(b: u8) -> char {
    const T: [u16; 32] = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
        0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
    if (0x80..=0x9F).contains(&b) { char::from_u32(T[(b - 0x80) as usize] as u32).unwrap_or('�') } else { b as char }
}

pub fn decode_text(b: &[u8]) -> (String, String) {
    if let Some(r) = b.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(r).into_owned(), "UTF-8".into());
    }
    let u16s = |r: &[u8], le: bool| -> String {
        let v: Vec<u16> = r.chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
        String::from_utf16_lossy(&v)
    };
    if let Some(r) = b.strip_prefix(&[0xFF, 0xFE]) { return (u16s(r, true), "UTF-16".into()); }
    if let Some(r) = b.strip_prefix(&[0xFE, 0xFF]) { return (u16s(r, false), "UTF-16".into()); }
    match guess_charset(b) {
        "UTF-8" => (String::from_utf8_lossy(b).into_owned(), "UTF-8".into()),
        "CP874" => (b.iter().map(|&x| cp874(x)).collect(), "TIS-620".into()),
        _ => (b.iter().map(|&x| cp1252(x)).collect(), "Windows-1252".into()),
    }
}

// ---------------------------------------------------------------- แยกบรรทัด

/// เวลา 00:01:02,345 · 00:01:02.345 · 01:02.345 · 0:01:02.34 (ASS ทศนิยมสองหลัก)
fn time(s: &str) -> Option<f64> {
    let s = s.trim().replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    let (h, m, sec) = match parts.as_slice() {
        [h, m, sec] => (h.parse::<f64>().ok()?, m.parse::<f64>().ok()?, sec.parse::<f64>().ok()?),
        [m, sec] => (0.0, m.parse::<f64>().ok()?, sec.parse::<f64>().ok()?),
        _ => return None,
    };
    Some(h * 3600.0 + m * 60.0 + sec)
}

/// เอาแท็กออก <i> </font> {\an8} · \N \n เป็นขึ้นบรรทัด \h เป็นเว้นวรรค
fn clean(t: &str) -> String {
    let mut out = String::new();
    let mut depth_angle = false;
    let mut depth_brace = false;
    let t = t.replace("\\N", "\n").replace("\\n", "\n").replace("\\h", " ");
    for c in t.chars() {
        match c {
            '<' if !depth_brace => depth_angle = true,
            '>' if depth_angle => depth_angle = false,
            '{' => depth_brace = true,
            '}' if depth_brace => depth_brace = false,
            _ if !depth_angle && !depth_brace => out.push(c),
            _ => {}
        }
    }
    out.lines().map(|l| l.trim_end()).collect::<Vec<_>>().join("\n").trim().to_string()
}

pub fn kind_of(raw: &str, ext: &str) -> &'static str {
    let head = raw.trim_start_matches('\u{FEFF}').trim_start();
    if head.starts_with("WEBVTT") || ext == "vtt" { "vtt" }
    else if raw.contains("[Events]") || raw.contains("\nDialogue:") || matches!(ext, "ass" | "ssa") { "ass" }
    else { "srt" }
}

/// SRT กับ VTT · บล็อกที่มีบรรทัด --> คือหนึ่งบรรทัดซับ ข้อความคือบรรทัดถัดไปจนบรรทัดว่าง
fn parse_timed(raw: &str) -> Vec<Cue> {
    let lines: Vec<&str> = raw.lines().collect();
    let mut cues = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let l = lines[i];
        if let Some((a, b)) = l.split_once("-->") {
            let b = b.split_whitespace().next().unwrap_or("");
            if let (Some(s), Some(e)) = (time(a), time(b)) {
                let mut text = Vec::new();
                i += 1;
                while i < lines.len() && !lines[i].trim().is_empty() {
                    text.push(lines[i]);
                    i += 1;
                }
                cues.push(Cue { n: cues.len() + 1, start: s, end: e, text: clean(&text.join("\n")) });
                continue;
            }
        }
        i += 1;
    }
    cues
}

/// ASS SSA · ใช้บรรทัด Format ของ [Events] หาว่า Start End Text อยู่ช่องไหน
fn parse_ass(raw: &str) -> Vec<Cue> {
    let mut fields: Vec<String> = vec!["layer", "start", "end", "style", "name", "marginl", "marginr", "marginv", "effect", "text"].into_iter().map(String::from).collect();
    let mut in_events = false;
    let mut out = Vec::new();
    for l in raw.lines() {
        let t = l.trim();
        if t.starts_with('[') { in_events = t.eq_ignore_ascii_case("[events]"); continue; }
        if !in_events { continue; }
        if let Some(f) = t.strip_prefix("Format:") {
            fields = f.split(',').map(|x| x.trim().to_lowercase()).collect();
        } else if let Some(d) = t.strip_prefix("Dialogue:") {
            let parts: Vec<&str> = d.splitn(fields.len(), ',').collect();
            let at = |k: &str| fields.iter().position(|f| f == k).and_then(|i| parts.get(i)).map(|s| s.trim());
            if let (Some(s), Some(e), Some(tx)) = (at("start").and_then(time), at("end").and_then(time), fields.iter().position(|f| f == "text").and_then(|i| parts.get(i))) {
                out.push(Cue { n: 0, start: s, end: e, text: clean(tx) });
            }
        }
    }
    out.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    for (i, c) in out.iter_mut().enumerate() { c.n = i + 1; }
    out
}

pub fn parse(raw: &str, kind: &str) -> Vec<Cue> {
    if kind == "ass" { parse_ass(raw) } else { parse_timed(raw) }
}

// ---------------------------------------------------------------- ดึงซับ

fn is_mkv(p: &Path) -> bool {
    matches!(p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("mkv" | "mka" | "mks" | "mk3d" | "webm"))
}

pub(crate) fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// ข้อความของซับ · ไฟล์ที่เพิ่มอ่านตรง · ซับในหนัง MKV ดึงด้วย mkvextract · MP4 ให้ ffmpeg แปลงเป็น SRT
pub fn text_of(tools: &Path, work: &Path, path: &Path, in_movie: bool, tid: u64, ff: u64) -> Result<SubText, String> {
    let (bytes, hint) = bytes_of(tools, work, path, in_movie, tid, ff)?;
    let (raw, charset) = decode_text(&bytes);
    let kind = kind_of(&raw, &hint).to_string();
    let cues = parse(&raw, &kind);
    Ok(SubText { raw, kind, charset, cues })
}

/// ไบต์ของซับตามที่อยู่ในไฟล์ กับนามสกุลที่ใช้ช่วยเดาชนิด (ว่าง = ดูจากเนื้อ) · ตัวแก้ซับ (subdoc.rs) ใช้ร่วม
/// ซับข้อความชนิดที่ ffmpeg อ่านได้แต่ตัวอ่านของโปรแกรมไม่รู้จัก · เปิดแล้วแปลงเป็น ASS ด้วย ffmpeg สีกับตัวเอียงตามแท็กเดิมไม่หาย
/// (พี่กันสั่ง 15 พ.ย. 2569 "เราอยากให้มันแปลงจาก text sub ตัวอื่นมา PGS ได้") · .sub ที่เป็นซับภาพของ DVD ไปตัวดูซับภาพ ไม่มาถึงตรงนี้
pub const FF_TEXT: &[&str] = &["smi", "sami", "lrc", "rt", "jss", "aqt", "pjs", "mpl", "sub", "scc"];
/// ซับข้อความที่ ffmpeg ไม่มีตัวอ่าน โปรแกรมแปลงเป็น SRT เอง (subconv.rs)
pub const OWN_TEXT: &[&str] = &["sbv", "ttml", "dfxp"];

pub fn bytes_of(tools: &Path, work: &Path, path: &Path, in_movie: bool, tid: u64, ff: u64) -> Result<(Vec<u8>, String), String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // อ่านตรงเฉพาะไฟล์ซับข้อความ · ไฟล์ห่อที่เพิ่ม (MKS MKA MP4) ดึงแทร็กด้วยเครื่องมือแบบซับในหนัง
    // (ผู้ช่วยตรวจขั้น 10 ข้อ 6 · เดิมอ่าน MKS ทั้งไฟล์เป็นข้อความ ได้อักษรขยะ 0 บรรทัด)
    let plain = matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt");
    if !in_movie && OWN_TEXT.contains(&ext.as_str()) {
        let raw = std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?;
        return Ok((crate::subtitle::subconv::to_srt(&ext, &decode_text(&raw).0)?.into_bytes(), "srt".into()));
    }
    if !in_movie && FF_TEXT.contains(&ext.as_str()) {
        // ffmpeg อ่านซับข้อความเป็น UTF-8 · ไฟล์ไทยแบบเก่าบอกชุดอักษรที่เดาได้ก่อน
        let raw = std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?;
        let cs = guess_charset(&raw);
        let mut args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into()];
        if cs != "UTF-8" && !raw.starts_with(&[0xFF, 0xFE]) && !raw.starts_with(&[0xFE, 0xFF]) { args.push("-sub_charenc".into()); args.push(cs.into()); }
        args.extend(["-i".into(), path.into(), "-map".into(), "0:s:0".into(), "-c:s".into(), "ass".into(), "-f".into(), "ass".into(), "-".into()]);
        let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120))?;
        if !tool_succeeded("ffmpeg", &o.status) || o.stdout.is_empty() {
            let why = String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
            return Err(format!("แปลงซับ .{ext} ไม่สำเร็จ {why}"));
        }
        return Ok((o.stdout, "ass".into()));
    }
    let bytes = if !in_movie && plain {
        std::fs::read(path).map_err(|e| format!("อ่านไฟล์ซับไม่ได้ {e}"))?
    } else if is_mkv(path) {
        let out = work.join(format!("sub-{}.txt", crate::cover::poster_image::unique()));
        let args: Vec<OsString> = vec!["--ui-language".into(), "en".into(), "tracks".into(), path.into(), format!("{tid}:{}", out.display()).into()];
        let o = run_tool_timeout(tools, "mkvextract", &args, Duration::from_secs(600))?;
        let b = std::fs::read(&out);
        let _ = std::fs::remove_file(&out);
        if !tool_succeeded("mkvextract", &o.status) || b.is_err() {
            return Err(format!("ดึงซับจากหนังไม่ได้  {}", String::from_utf8_lossy(&o.stdout).lines().filter(|l| l.contains("Error")).last().unwrap_or("")));
        }
        b.unwrap()
    } else {
        let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-i".into(), path.into(), "-map".into(), format!("0:{ff}").into(), "-f".into(), "srt".into(), "-".into()];
        let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(600))?;
        if !tool_succeeded("ffmpeg", &o.status) { return Err("ดึงซับจากหนังไม่ได้".into()); }
        o.stdout
    };
    let hint = if plain && !in_movie { ext } else if is_mkv(path) { String::new() } else { "srt".into() };
    Ok((bytes, hint))
}

/// ภาพหนังหนึ่งภาพที่เวลา t สูง h จุด เป็น data URL (JPEG)
pub fn frame(tools: &Path, movie: &Path, t: f64, h: u32) -> Result<String, String> {
    Ok(format!("data:image/jpeg;base64,{}", crate::audio::audiograph::b64(&frame_jpg(tools, movie, t, h)?)))
}

/// ภาพหนังหนึ่งภาพ เป็นไบต์ JPEG · ใช้ตัวดึงภาพตรงเฟรมของหน้าแก้ซับ (vidframes.rs) ตัวเดียวกัน
/// เลือกภาพแรกที่ไม่ใช่รูปปก เดิมไม่ระบุ ไฟล์ MP4 ที่มีปกใหญ่กว่าภาพหนัง ffmpeg หยิบปกมาแทนภาพหนัง
pub(crate) fn frame_jpg(tools: &Path, movie: &Path, t: f64, h: u32) -> Result<Vec<u8>, String> {
    crate::video::vidframes::frames_jpg(tools, movie, t, 1, h)?.into_iter().next().ok_or_else(|| "ดึงภาพหนังไม่ได้".into())
}

/// เวลาที่จะดึงภาพ · อยู่ช่วง 12% ถึง 87% ของเรื่อง เลี่ยงโลโก้ต้นเรื่องกับเครดิตท้ายเรื่อง · ลองรอบใหม่ได้เวลาใหม่
pub(crate) fn frame_time(duration: f64, seed: u64, attempt: u64) -> f64 {
    if duration <= 0.0 { return 1.0; }
    let n = seed.wrapping_add(attempt.wrapping_mul(37)) % 76;
    duration * (0.12 + n as f64 / 100.0)
}

/// ภาพมืดหรือภาพเรียบมาก JPEG จะเล็กผิดปกติ ลองเวลาใหม่ได้ภาพที่ดูรู้เรื่องกว่า
pub(crate) const FRAME_MIN_BYTES: usize = 9000;

