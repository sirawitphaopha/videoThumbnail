//! หน้าแก้ซับ ตัวอ่าน ASS SSA (ass_parser.cpp ass_dialogue.cpp) กับ SRT VTT (subtitle_format_srt.cpp)
//! แยกจาก subdoc/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ASS SSA (ass_parser.cpp ass_dialogue.cpp ass_style.cpp)

pub(crate) const EVENT_FORMAT: [&str; 10] = ["Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"];
pub(crate) const STYLE_FORMAT: [&str; 23] = ["Name", "Fontname", "Fontsize", "PrimaryColour", "SecondaryColour", "OutlineColour", "BackColour", "Bold", "Italic",
    "Underline", "StrikeOut", "ScaleX", "ScaleY", "Spacing", "Angle", "BorderStyle", "Outline", "Shadow", "Alignment", "MarginL", "MarginR", "MarginV", "Encoding"];

pub(crate) fn fmt_list(s: &str) -> Vec<String> {
    s.split(',').map(|x| x.trim().to_string()).collect()
}

/// แยกช่องของบรรทัด Dialogue หรือ Comment ตามบรรทัด Format · ข้อความคือทุกอย่างหลังจุลภาคตัวที่ (ช่อง − 1)
/// ตัด "Dialogue:" กับอีกหนึ่งไบต์ถ้ามี แบบ AssDialogue::Parse · ช่องไม่ครบ = None (เก็บเป็นบรรทัดอ่านไม่ออก)
pub(crate) fn parse_event_line(t: &str, format: &[String]) -> Option<Event> {
    let (comment, rest) = if let Some(r) = t.strip_prefix("Dialogue:") { (false, r) } else if let Some(r) = t.strip_prefix("Comment:") { (true, r) } else { return None };
    let rest = rest.strip_prefix(' ').unwrap_or(rest);
    let n = format.len().max(1);
    let parts: Vec<&str> = rest.splitn(n, ',').collect();
    if parts.len() < n { return None; }
    let mut e = Event { comment, ..Default::default() };
    let mut has_start = false;
    for (name, v) in format.iter().zip(parts.iter()) {
        let v = *v;
        match name.to_ascii_lowercase().as_str() {
            // ช่องเลเยอร์ที่เป็น Marked= อ่านเป็นเลเยอร์ 0 แบบ AssDialogue::Parse ของ Aegisub ไม่ดูบรรทัด Format (ผู้ช่วยตรวจทาน R8)
            "layer" => e.layer = if v.trim().starts_with("Marked=") { 0 } else { v.trim().parse().ok()? },
            "marked" => {}
            "start" => { e.start = parse_time(v.trim()); has_start = true; }
            "end" => e.end = parse_time(v.trim()),
            "style" => e.style = v.trim().into(),
            "name" | "actor" => e.actor = v.trim().into(),
            "marginl" => e.margin_l = v.trim().parse::<i32>().ok()?.clamp(-9999, 99999),
            "marginr" => e.margin_r = v.trim().parse::<i32>().ok()?.clamp(-9999, 99999),
            "marginv" => e.margin_v = v.trim().parse::<i32>().ok()?.clamp(-9999, 99999),
            "effect" => e.effect = v.trim().into(),
            "text" => e.text = v.into(),
            _ => {}
        }
    }
    // SSA เก่า ช่องแรกเป็น Marked=0 แทนเลเยอร์
    if format.first().is_some_and(|f| f.eq_ignore_ascii_case("marked")) { e.layer = 0; }
    has_start.then_some(e)
}

/// ช่องจุลภาคในสไตล์ ตัวละคร เอฟเฟกต์ เปลี่ยนเป็น ; แบบ append_unsafe_str · ข้อความตัดตัวขึ้นบรรทัดจริงออก
pub(crate) fn write_event_line(e: &Event, format: &[String], ssa: bool) -> String {
    let safe = |s: &str| s.replace(',', ";");
    let mut out = String::from(if e.comment { "Comment: " } else { "Dialogue: " });
    let cols: Vec<String> = format.iter().map(|name| match name.to_ascii_lowercase().as_str() {
        "layer" => e.layer.to_string(),
        "marked" => "Marked=0".into(),
        "start" => ass_time(e.start),
        "end" => ass_time(e.end),
        "style" => safe(&e.style),
        "name" | "actor" => safe(&e.actor),
        "marginl" => if ssa { format!("{:04}", e.margin_l) } else { e.margin_l.to_string() },
        "marginr" => if ssa { format!("{:04}", e.margin_r) } else { e.margin_r.to_string() },
        "marginv" => if ssa { format!("{:04}", e.margin_v) } else { e.margin_v.to_string() },
        "effect" => safe(&e.effect),
        "text" => e.text.chars().filter(|c| *c != '\n' && *c != '\r').collect(),
        _ => String::new(),
    }).collect();
    out.push_str(&cols.join(","));
    out
}

pub(crate) fn parse_style_line(t: &str) -> Option<Vec<String>> {
    let rest = t.strip_prefix("Style:")?;
    Some(rest.split(',').map(|x| x.trim().to_string()).collect())
}

pub(crate) fn write_style_line(s: &Style) -> String {
    format!("Style: {}", s.fields.iter().map(|f| f.replace(',', ";")).collect::<Vec<_>>().join(","))
}

pub(crate) fn section_of(t: &str) -> Option<String> {
    let t = t.trim();
    (t.starts_with('[') && t.ends_with(']')).then(|| t[1..t.len() - 1].trim().to_ascii_lowercase())
}

pub(crate) fn parse_ass(lines: Vec<Raw>, kind: &str) -> (Vec<Item>, Vec<String>, Vec<String>, Vec<Style>, Vec<Event>, usize) {
    let mut sk = Vec::new();
    let (mut sfmt, mut efmt): (Vec<String>, Vec<String>) = (STYLE_FORMAT.iter().map(|s| s.to_string()).collect(), EVENT_FORMAT.iter().map(|s| s.to_string()).collect());
    if kind == "ssa" {
        efmt = ["Marked", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"].iter().map(|s| s.to_string()).collect();
    }
    let (mut styles, mut events) = (Vec::<Style>::new(), Vec::<Event>::new());
    let (mut s_anchor, mut e_anchor) = (false, false);
    let mut pending: Vec<Raw> = Vec::new();
    let mut section = String::new();
    let mut bad = 0;
    let mut id = 0u32;
    let line = |r: &Raw| Item::Line { t: r.t.clone(), e: r.e.clone() };
    let in_styles = |s: &str| s.contains("styles");
    for r in lines {
        let t = r.t.trim_start_matches('\u{FEFF}');
        if let Some(sec) = section_of(t) {
            // จบส่วนก่อนหน้า บรรทัดที่ค้างหลังรายการสุดท้ายอยู่ต่อจากจุดรายการ
            sk.extend(pending.drain(..).map(|p| line(&p)));
            section = sec;
            sk.push(line(&r));
            continue;
        }
        if in_styles(&section) {
            if let Some(f) = t.strip_prefix("Format:") { if !s_anchor { sfmt = fmt_list(f); } }
            if let Some(fields) = parse_style_line(t) {
                if !s_anchor { s_anchor = true; sk.extend(pending.drain(..).map(|p| line(&p))); sk.push(Item::Styles); }
                id += 1;
                styles.push(Style { id, fields, pre: std::mem::take(&mut pending), raw: vec![r] });
                continue;
            }
        } else if section == "events" {
            if let Some(f) = t.strip_prefix("Format:") { if !e_anchor { efmt = fmt_list(f); } }
            if t.starts_with("Dialogue:") || t.starts_with("Comment:") {
                if let Some(mut e) = parse_event_line(t, &efmt) {
                    if !e_anchor { e_anchor = true; sk.extend(pending.drain(..).map(|p| line(&p))); sk.push(Item::Events); }
                    id += 1;
                    e.id = id;
                    e.pre = std::mem::take(&mut pending);
                    e.raw = vec![r];
                    events.push(e);
                    continue;
                }
                bad += 1;
            }
        }
        if (in_styles(&section) && s_anchor) || (section == "events" && e_anchor) { pending.push(r); } else { sk.push(line(&r)); }
    }
    sk.extend(pending.drain(..).map(|p| line(&p)));
    (sk, sfmt, efmt, styles, events, bad)
}

// ---------------------------------------------------------------- SRT VTT (subtitle_format_srt.cpp)

/// บรรทัดเวลา "เริ่ม --> จบ ข้อความต่อท้าย" · SRT รับทั้งจุลภาคและจุด VTT ไม่มีชั่วโมงได้
fn parse_timing(t: &str) -> Option<(i64, i64, String)> {
    let (a, b) = t.split_once("-->")?;
    let a = a.trim();
    let b_trim = b.trim_start();
    let end_len = b_trim.find(|c: char| c.is_whitespace()).unwrap_or(b_trim.len());
    let bt = &b_trim[..end_len];
    let ok = |s: &str| !s.is_empty() && s.contains(':') && s.chars().all(|c| c.is_ascii_digit() || matches!(c, ':' | ',' | '.'));
    if !ok(a) || !ok(bt) { return None; }
    Some((parse_time(a), parse_time(bt), b_trim[end_len..].to_string()))
}

/// ช่องของหนึ่งบล็อก (ชื่อหรือเลขลำดับ เวลา ข้อความ) จากบรรทัดเดิม ไว้เทียบว่าค่าในช่องยังตรงกับของเดิมไหม
pub(crate) fn parse_block(raw: &[Raw]) -> Option<(Option<String>, i64, i64, String, String)> {
    let (ident, at) = match raw.first().and_then(|r| parse_timing(r.t.trim())) {
        Some(_) => (None, 0),
        None => (Some(raw.first()?.t.clone()), 1),
    };
    let (s, e, suf) = parse_timing(raw.get(at)?.t.trim())?;
    let text = raw[at + 1..].iter().map(|r| r.t.as_str()).collect::<Vec<_>>().join("\n");
    Some((ident, s, e, suf, text))
}

fn is_vtt_block(t: &str) -> bool {
    t.starts_with("NOTE") || t.starts_with("STYLE") || t.starts_with("REGION") || t.starts_with("WEBVTT")
}

/// SRT กับ VTT · บล็อกคือ (ชื่อ) บรรทัดเวลา ข้อความจนเจอบรรทัดว่าง · บรรทัดว่างก่อนบล็อกเป็น pre ของบล็อกนั้น
/// บรรทัดที่ไม่ใช่เลขลำดับหรือเวลาต่อจากบรรทัดว่างใน SRT นับเป็นข้อความต่อของบรรทัดก่อน (ParseState::LAST_WAS_BLANK ของ Aegisub)
pub(crate) fn parse_timed(lines: Vec<Raw>, kind: &str) -> (Vec<Item>, Vec<Event>, usize) {
    let mut sk = Vec::new();
    let mut events: Vec<Event> = Vec::new();
    let mut pending: Vec<Raw> = Vec::new();
    let mut bad = 0;
    let mut i = 0;
    let n = lines.len();
    let ts = |k: usize| k < n && parse_timing(lines[k].t.trim()).is_some();
    let mut anchor = false;
    while i < n {
        let t = lines[i].t.trim().trim_start_matches('\u{FEFF}');
        if t.is_empty() { pending.push(lines[i].clone()); i += 1; continue; }
        let start_at = if ts(i) { Some(i) } else if ts(i + 1) && (kind == "vtt" || t.chars().all(|c| c.is_ascii_digit())) { Some(i + 1) } else { None };
        if let Some(tline) = start_at {
            let mut j = tline + 1;
            while j < n && !lines[j].t.trim().is_empty() { j += 1; }
            let raw: Vec<Raw> = lines[i..j].to_vec();
            if let Some((ident, s, e, suffix, text)) = parse_block(&raw) {
                if !anchor {
                    anchor = true;
                    sk.extend(pending.drain(..).map(|p| Item::Line { t: p.t, e: p.e }));
                    sk.push(Item::Events);
                }
                events.push(Event { id: events.len() as u32 + 1, start: s, end: e, text, ident, suffix, pre: std::mem::take(&mut pending), raw, ..Default::default() });
                i = j;
                continue;
            }
        }
        // ไม่ใช่บล็อก · VTT หัวไฟล์ NOTE STYLE ทั้งก้อนเก็บตามเดิม · SRT ต่อจากบล็อกก่อนเป็นข้อความต่อ
        let mut j = i;
        while j < n && !lines[j].t.trim().is_empty() { j += 1; }
        if kind == "srt" && !events.is_empty() && pending.iter().all(|p| p.t.trim().is_empty()) && !is_vtt_block(t) {
            let last = events.last_mut().unwrap();
            last.raw.extend(pending.drain(..));
            last.raw.extend(lines[i..j].iter().cloned());
            last.text = parse_block(&last.raw).map(|b| b.4).unwrap_or_default();
        } else {
            if kind == "srt" { bad += 1; }
            if anchor { pending.extend(lines[i..j].iter().cloned()); } else { sk.extend(pending.drain(..).map(|p| Item::Line { t: p.t, e: p.e })); sk.extend(lines[i..j].iter().map(|p| Item::Line { t: p.t.clone(), e: p.e.clone() })); }
        }
        i = j;
    }
    if !anchor { sk.push(Item::Events); }
    sk.extend(pending.into_iter().map(|p| Item::Line { t: p.t, e: p.e }));
    (sk, events, bad)
}

