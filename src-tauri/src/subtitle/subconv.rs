//! แปลงซับข้อความชนิดที่ ffmpeg อ่านไม่ได้เป็น SRT ให้หน้าแก้ซับเปิดได้แล้วส่งออก PGS ต่อได้
//! พี่กันสั่ง 15 พ.ย. 2569 "เราอยากให้มันแปลงจาก text sub ตัวอื่นมา PGS ได้"
//! ชนิดที่ ffmpeg อ่านได้ (SAMI MicroDVD LRC RealText JACOsub และอื่น ๆ) แปลงด้วย ffmpeg เป็น ASS ใน subs.rs bytes_of
//! ไฟล์นี้ทำสองชนิดที่ ffmpeg ไม่มีตัวอ่าน คือ SBV ของ YouTube กับ TTML (DFXP) · อ่านอย่างเดียว ไม่เขียนกลับเป็นชนิดเดิม

/// เวลา ms เป็นเวลาแบบ SRT
fn srt_time(ms: i64) -> String {
    let ms = ms.max(0);
    format!("{:02}:{:02}:{:02},{:03}", ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, ms % 1000)
}

/// บรรทัดซับ (เริ่ม จบ ข้อความหลายบรรทัด) เป็นข้อความ SRT
fn to_srt_text(items: &[(i64, i64, String)]) -> String {
    let mut out = String::new();
    for (n, (s, e, t)) in items.iter().filter(|x| x.1 > x.0 && !x.2.trim().is_empty()).enumerate() {
        out.push_str(&format!("{}\r\n{} --> {}\r\n{}\r\n\r\n", n + 1, srt_time(*s), srt_time(*e), t.trim().replace('\n', "\r\n")));
    }
    out
}

/// เวลาแบบ ชม:นาที:วินาที.มิลลิวินาที (ชั่วโมงไม่ต้องมีก็ได้) · อ่านไม่ออกได้ None
fn clock(t: &str) -> Option<i64> {
    let t = t.trim().replace(',', ".");
    let parts: Vec<&str> = t.split(':').collect();
    let (h, m, s) = match parts.as_slice() { [h, m, s] => (*h, *m, *s), [m, s] => ("0", *m, *s), _ => return None };
    let sec: f64 = s.parse().ok()?;
    Some(h.parse::<i64>().ok()? * 3_600_000 + m.parse::<i64>().ok()? * 60_000 + (sec * 1000.0).round() as i64)
}

/// SBV ของ YouTube · บล็อกละบรรทัดเวลา "0:00:01.000,0:00:03.500" ตามด้วยข้อความ คั่นบล็อกด้วยบรรทัดว่าง
pub fn sbv_to_srt(text: &str) -> Result<String, String> {
    let mut items = vec![];
    let mut cur: Option<(i64, i64, Vec<String>)> = None;
    for line in text.trim_start_matches('\u{FEFF}').lines().map(|l| l.trim_end_matches('\r')) {
        if let Some((a, b)) = line.split_once(',').filter(|(a, b)| a.contains(':') && b.contains(':')) {
            if let (Some(s), Some(e)) = (clock(a), clock(b)) {
                if let Some((s0, e0, t)) = cur.take() { items.push((s0, e0, t.join("\n"))); }
                cur = Some((s, e, vec![]));
                continue;
            }
        }
        if line.trim().is_empty() {
            if let Some((s0, e0, t)) = cur.take() { items.push((s0, e0, t.join("\n"))); }
        } else if let Some(c) = cur.as_mut() {
            c.2.push(line.replace("[br]", "\n"));
        }
    }
    if let Some((s0, e0, t)) = cur.take() { items.push((s0, e0, t.join("\n"))); }
    if items.is_empty() { return Err("อ่านไฟล์ SBV ไม่ออก ไม่เจอบรรทัดเวลาแบบ 0:00:01.000,0:00:03.000".into()); }
    Ok(to_srt_text(&items))
}

/// ค่าของแอตทริบิวต์ในแท็ก เช่น begin="1s" · ไม่สนคำนำหน้าเนมสเปซ (ttp:frameRate frameRate)
fn attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let mut rest = tag;
    while let Some(i) = rest.find(name) {
        let before = rest[..i].chars().last();
        let after = &rest[i + name.len()..];
        let ok_before = before.is_none_or(|c| c.is_whitespace() || c == ':');
        if ok_before {
            let a = after.trim_start();
            if let Some(a) = a.strip_prefix('=') {
                let a = a.trim_start();
                let q = a.chars().next()?;
                if q == '"' || q == '\'' {
                    let body = &a[1..];
                    return body.find(q).map(|j| &body[..j]);
                }
            }
        }
        rest = &rest[i + name.len()..];
    }
    None
}

/// เวลาของ TTML · ชม:นาที:วินาที(.ส่วน) · ชม:นาที:วินาที:เฟรม · ตัวเลขตามด้วยหน่วย h m s ms f t
fn ttml_time(t: &str, fps: f64, tick: f64) -> Option<i64> {
    let t = t.trim();
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() == 4 {
        let f: f64 = parts[3].parse().ok()?;
        return Some(clock(&parts[..3].join(":"))? + (f / fps * 1000.0).round() as i64);
    }
    if parts.len() >= 2 { return clock(t); }
    let unit_at = t.find(|c: char| c.is_ascii_alphabetic())?;
    let (n, u) = t.split_at(unit_at);
    let n: f64 = n.parse().ok()?;
    let ms = match u { "h" => n * 3_600_000.0, "m" => n * 60_000.0, "s" => n * 1000.0, "ms" => n, "f" => n / fps * 1000.0, "t" => n / tick * 1000.0, _ => return None };
    Some(ms.round() as i64)
}

fn unescape(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let tail = &rest[i..];
        let Some(j) = tail.find(';').filter(|&j| j <= 10) else { out.push('&'); rest = &tail[1..]; continue };
        let ent = &tail[1..j];
        let ch = match ent {
            "amp" => Some('&'), "lt" => Some('<'), "gt" => Some('>'), "quot" => Some('"'), "apos" => Some('\''), "nbsp" => Some('\u{a0}'),
            _ if ent.starts_with("#x") || ent.starts_with("#X") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
            _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
            _ => None,
        };
        match ch { Some(c) => { out.push(c); rest = &tail[j + 1..]; } None => { out.push('&'); rest = &tail[1..]; } }
    }
    out.push_str(rest);
    out
}

/// ข้อความใน <p> ของ TTML · <br/> เป็นขึ้นบรรทัด · span ตัวเอียง ตัวหนา เป็นแท็ก <i> <b> ของ SRT · แท็กอื่นทิ้ง
fn ttml_text(body: &str) -> String {
    let mut out = String::new();
    let mut stack: Vec<&'static str> = vec![];
    let mut rest = body;
    while let Some(i) = rest.find('<') {
        out.push_str(&rest[..i].replace(['\r', '\n'], " "));
        let Some(j) = rest[i..].find('>') else { break };
        let tag = &rest[i + 1..i + j];
        let name = tag.trim_start_matches('/').split(|c: char| c.is_whitespace() || c == '/').next().unwrap_or("").rsplit(':').next().unwrap_or("").to_ascii_lowercase();
        if name == "br" {
            out.push('\n');
        } else if name == "span" {
            if tag.starts_with('/') {
                if let Some(close) = stack.pop() { out.push_str(close); }
            } else if !tag.ends_with('/') {
                let it = attr(tag, "fontStyle").is_some_and(|v| v.eq_ignore_ascii_case("italic"));
                let bo = attr(tag, "fontWeight").is_some_and(|v| v.eq_ignore_ascii_case("bold"));
                let mut close = String::new();
                if it { out.push_str("<i>"); close.insert_str(0, "</i>"); }
                if bo { out.push_str("<b>"); close.insert_str(0, "</b>"); }
                stack.push(Box::leak(close.into_boxed_str()));
            }
        }
        rest = &rest[i + j + 1..];
    }
    out.push_str(&rest.replace(['\r', '\n'], " "));
    let text = unescape(&out);
    text.lines().map(|l| l.split_whitespace().collect::<Vec<_>>().join(" ")).collect::<Vec<_>>().join("\n")
}

/// TTML หรือ DFXP · อ่านทุก <p> ที่มีเวลา begin กับ end หรือ dur · อัตราเฟรมกับ tickRate อ่านจากแท็กราก
pub fn ttml_to_srt(text: &str) -> Result<String, String> {
    let root = text.find("<tt").map(|i| &text[i..i + text[i..].find('>').unwrap_or(0)]).unwrap_or("");
    let fps = attr(root, "frameRate").and_then(|v| v.parse::<f64>().ok()).unwrap_or(30.0)
        * attr(root, "frameRateMultiplier").and_then(|v| { let (a, b) = v.split_once(' ')?; Some(a.parse::<f64>().ok()? / b.parse::<f64>().ok()?) }).unwrap_or(1.0);
    let tick = attr(root, "tickRate").and_then(|v| v.parse::<f64>().ok()).unwrap_or(10_000_000.0);
    let mut items = vec![];
    let mut rest = text;
    while let Some(i) = rest.find("<p") {
        let after = &rest[i..];
        // <p ต้องเป็นแท็ก p จริง ไม่ใช่ <param หรือ <pre
        if !after[2..].starts_with(|c: char| c.is_whitespace() || c == '>') { rest = &after[2..]; continue; }
        let Some(open_end) = after.find('>') else { break };
        let tag = &after[2..open_end];
        let Some(close) = after.find("</p>") else { break };
        let body = &after[open_end + 1..close];
        let b = attr(tag, "begin").and_then(|v| ttml_time(v, fps, tick));
        let e = attr(tag, "end").and_then(|v| ttml_time(v, fps, tick)).or_else(|| Some(b? + attr(tag, "dur").and_then(|v| ttml_time(v, fps, tick))?));
        if let (Some(b), Some(e)) = (b, e) { items.push((b, e, ttml_text(body))); }
        rest = &after[close + 4..];
    }
    if items.is_empty() { return Err("อ่านไฟล์ TTML ไม่ออก ไม่เจอบรรทัด <p> ที่มีเวลา begin กับ end".into()); }
    items.sort_by_key(|x| x.0);
    Ok(to_srt_text(&items))
}

/// แปลงตามนามสกุล sbv ttml dfxp เป็น SRT
pub fn to_srt(ext: &str, text: &str) -> Result<String, String> {
    match ext { "sbv" => sbv_to_srt(text), "ttml" | "dfxp" => ttml_to_srt(text), _ => Err(format!("ไฟล์ .{ext} ยังแปลงไม่ได้")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sbv_reads_blocks() {
        let s = sbv_to_srt("0:00:01.000,0:00:03.500\nสวัสดีค่ะ\nบรรทัดสอง\n\n0:00:04.250,0:00:06.000\nHello[br]World\n").unwrap();
        assert_eq!(s, "1\r\n00:00:01,000 --> 00:00:03,500\r\nสวัสดีค่ะ\r\nบรรทัดสอง\r\n\r\n2\r\n00:00:04,250 --> 00:00:06,000\r\nHello\r\nWorld\r\n\r\n");
        assert!(sbv_to_srt("ไม่มีเวลา").is_err());
    }

    #[test]
    fn ttml_reads_times_breaks_spans() {
        let t = r#"<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:frameRate="25" ttp:tickRate="10000000">
<body><div>
<p begin="00:00:01.500" end="00:00:03.000">สวัสดี<br/>บรรทัด &amp; สอง</p>
<p begin="00:00:04:05" dur="2s"><span tts:fontStyle="italic">ตัวเอียง</span> ปกติ</p>
<p begin="70000000t" end="90000000t">Tick</p>
<param begin="1s" end="2s"/>
</div></body></tt>"#;
        let s = ttml_to_srt(t).unwrap();
        assert_eq!(s, "1\r\n00:00:01,500 --> 00:00:03,000\r\nสวัสดี\r\nบรรทัด & สอง\r\n\r\n2\r\n00:00:04,200 --> 00:00:06,200\r\n<i>ตัวเอียง</i> ปกติ\r\n\r\n3\r\n00:00:07,000 --> 00:00:09,000\r\nTick\r\n\r\n");
        assert!(ttml_to_srt("<tt><body></body></tt>").is_err());
    }
}
