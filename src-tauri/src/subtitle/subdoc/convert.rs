//! หน้าแก้ซับ แปลงชนิดซับ ASS SSA SRT VTT (ยกจาก Aegisub)
//! แยกจาก subdoc/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- แปลงชนิด

/// สิ่งที่หายตอนเปลี่ยน ASS เป็น SRT · คีย์ไว้ให้หน้าจอแปลเป็นประโยค กับจำนวนบรรทัดที่โดน
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lost {
    pub key: String,
    pub n: usize,
}

/// แท็กใน {} แยกเป็นชื่อกับค่า · \b1 → ("b","1") · \fnArial → ("fn","Arial") · \pos(1,2) → ("pos","(1,2)")
fn tags_of(block: &str) -> Vec<(String, String)> {
    block.split('\\').filter(|t| !t.is_empty()).map(|t| {
        let name_len = t.find(|c: char| !c.is_ascii_alphabetic()).unwrap_or(t.len());
        let (mut name, mut val) = (t[..name_len].to_string(), t[name_len..].to_string());
        // ชื่อที่มีตัวเลขต่อท้ายเป็นส่วนของชื่อ (\1c \2a) ตัวเลขนำหน้าชื่อ
        if name.is_empty() {
            let d = t.find(|c: char| !c.is_ascii_digit()).unwrap_or(t.len());
            let rest = &t[d..];
            let l = rest.find(|c: char| !c.is_ascii_alphabetic()).unwrap_or(rest.len());
            name = format!("{}{}", &t[..d], &rest[..l]);
            val = rest[l..].to_string();
        }
        (name, val.trim().to_string())
    }).collect()
}

/// ข้อความ ASS เป็น SRT · เก็บได้แค่ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า แบบ SRTSubtitleFormat::ConvertTags
/// \N \n เป็นขึ้นบรรทัด \h เป็นเว้นวรรค · ส่วนที่เป็นรูปวาด (\p1) ทิ้ง · ปิดแท็กที่ค้างท้ายบรรทัด
pub fn ass_to_srt_text(text: &str) -> String {
    let mut out = String::new();
    let mut state = [('b', false), ('i', false), ('s', false), ('u', false)];
    let mut drawing = false;
    let mut rest = text;
    while !rest.is_empty() {
        if let Some(stripped) = rest.strip_prefix('{') {
            let close = stripped.find('}');
            let block = &stripped[..close.unwrap_or(stripped.len())];
            for (name, val) in tags_of(block) {
                if name == "p" { drawing = val.parse::<i32>().unwrap_or(0) > 0; continue; }
                if name.len() != 1 { continue; }
                let ch = name.chars().next().unwrap();
                if let Some(st) = state.iter_mut().find(|s| s.0 == ch) {
                    let on = val.parse::<i32>().map(|v| v != 0).unwrap_or(false);
                    if on && !st.1 { out.push_str(&format!("<{ch}>")); }
                    if !on && st.1 { out.push_str(&format!("</{ch}>")); }
                    st.1 = on;
                }
            }
            rest = match close { Some(k) => &stripped[k + 1..], None => "" };
        } else {
            let k = rest.find('{').unwrap_or(rest.len());
            if !drawing { out.push_str(&rest[..k].replace("\\N", "\n").replace("\\n", "\n").replace("\\h", " ")); }
            rest = &rest[k..];
        }
    }
    for (ch, on) in state { if on { out.push_str(&format!("</{ch}>")); } }
    out
}

/// สี SRT (#RRGGBB ชื่อสีพื้นฐาน) เป็นสีแท็ก ASS &HBBGGRR&
fn srt_color(v: &str) -> Option<String> {
    let v = v.trim().trim_start_matches('#').to_ascii_lowercase();
    let hex = match v.as_str() {
        "white" => "ffffff", "black" => "000000", "red" => "ff0000", "green" => "008000", "blue" => "0000ff", "yellow" => "ffff00",
        "cyan" | "aqua" => "00ffff", "magenta" | "fuchsia" => "ff00ff", "silver" => "c0c0c0", "gray" | "grey" => "808080", "orange" => "ffa500",
        h if h.len() == 6 && h.chars().all(|c| c.is_ascii_hexdigit()) => h,
        _ => return None,
    };
    Some(format!("&H{}{}{}&", &hex[4..6], &hex[2..4], &hex[0..2]).to_ascii_uppercase().replace("&H", "&H"))
}

/// ค่าของคุณสมบัติในแท็ก <font face="…" size=… color='…'>
fn attr(attrs: &str, key: &str) -> Option<String> {
    let lower = attrs.to_ascii_lowercase();
    let mut from = 0;
    while let Some(k) = lower[from..].find(key) {
        let at = from + k;
        let before_ok = at == 0 || lower.as_bytes()[at - 1].is_ascii_whitespace();
        let after = lower[at + key.len()..].trim_start();
        if before_ok && after.starts_with('=') {
            let v = attrs[attrs.len() - after.len() + 1..].trim_start();
            let (q, body) = match v.chars().next() { Some(c @ ('"' | '\'')) => (Some(c), &v[1..]), _ => (None, v) };
            let end = match q { Some(c) => body.find(c).unwrap_or(body.len()), None => body.find(char::is_whitespace).unwrap_or(body.len()) };
            return Some(body[..end].to_string());
        }
        from = at + key.len();
    }
    None
}

/// ข้อความ SRT เป็น ASS แบบ SrtTagParser::ToAss · แท็กที่ไม่รู้จักคงไว้ตามเดิม · ขึ้นบรรทัดเป็น \N · รวม }{ เป็นก้อนเดียว
pub fn srt_to_ass_text(srt: &str) -> String {
    let mut out = String::new();
    let mut lv = [('b', 0), ('i', 0), ('u', 0), ('s', 0)];
    let mut fonts: Vec<[String; 3]> = Vec::new();
    let mut rest = srt;
    while let Some(k) = rest.find('<') {
        out.push_str(&rest[..k]);
        let after = &rest[k + 1..];
        let Some(end) = after.find('>') else { out.push_str(&rest[k..]); rest = ""; break };
        let inner = &after[..end];
        let name_len = inner.find(|c: char| c.is_whitespace()).unwrap_or(inner.len());
        let name = inner[..name_len].to_ascii_lowercase();
        let attrs = &inner[name_len..];
        let toggle = |out: &mut String, lv: &mut [(char, i32); 4], ch: char, open: bool| {
            let s = lv.iter_mut().find(|x| x.0 == ch).unwrap();
            if open { if s.1 == 0 { out.push_str(&format!("{{\\{ch}1}}")); } s.1 += 1; } else { if s.1 == 1 { out.push_str(&format!("{{\\{ch}}}")); } if s.1 > 0 { s.1 -= 1; } }
        };
        match name.as_str() {
            "b" | "i" | "u" | "s" => toggle(&mut out, &mut lv, name.chars().next().unwrap(), true),
            "/b" | "/i" | "/u" | "/s" => toggle(&mut out, &mut lv, name.chars().nth(1).unwrap(), false),
            "font" => {
                let old = fonts.last().cloned().unwrap_or_default();
                let mut new = old.clone();
                if let Some(v) = attr(attrs, "face") { new[0] = format!("{{\\fn{v}}}"); }
                if let Some(v) = attr(attrs, "size") { new[1] = format!("{{\\fs{v}}}"); }
                if let Some(v) = attr(attrs, "color").and_then(|c| srt_color(&c)) { new[2] = format!("{{\\c{v}}}"); }
                for x in 0..3 { if new[x] != old[x] { out.push_str(&new[x]); } }
                fonts.push(new);
            }
            "/font" => if let Some(cur) = fonts.pop() {
                let old = fonts.last().cloned().unwrap_or_default();
                let reset = ["{\\fn}", "{\\fs}", "{\\c}"];
                for x in 0..3 { if cur[x] != old[x] { out.push_str(if old[x].is_empty() { reset[x] } else { &old[x] }); } }
            },
            _ => { out.push('<'); out.push_str(inner); out.push('>'); }
        }
        rest = &after[end + 1..];
    }
    out.push_str(rest);
    out.replace("}{", "").replace("\r\n", "\n").replace('\n', "\\N")
}

/// ASS เป็น SRT · เรียงตามเวลาเริ่ม ตัดบรรทัดความคิดเห็น (แบบ SRTSubtitleFormat::WriteFile) · คืนรายการสิ่งที่หาย
pub fn to_srt(doc: &SubDoc) -> (SubDoc, Vec<Lost>) {
    let mut lost: Vec<Lost> = Vec::new();
    let mut count = |key: &str, n: usize| if n > 0 { lost.push(Lost { key: key.into(), n }); };
    let ev = &doc.events;
    let is_ass = doc.kind == "ass" || doc.kind == "ssa";
    if is_ass {
        let styles: std::collections::BTreeSet<&str> = ev.iter().filter(|e| !e.comment).map(|e| e.style.as_str()).collect();
        count("comment", ev.iter().filter(|e| e.comment).count());
        count("actor", ev.iter().filter(|e| !e.actor.is_empty()).count());
        count("layer", ev.iter().filter(|e| e.layer != 0).count());
        count("style", if styles.len() > 1 || doc.styles.len() > 1 { ev.iter().filter(|e| !e.comment && e.style != "Default").count().max(1) } else { 0 });
        count("effect", ev.iter().filter(|e| !e.effect.is_empty()).count());
        count("margin", ev.iter().filter(|e| e.margin_l != 0 || e.margin_r != 0 || e.margin_v != 0).count());
        count("tags", ev.iter().filter(|e| {
            let mut t = e.text.as_str();
            let mut other = false;
            while let Some(k) = t.find('{') {
                let end = t[k..].find('}').map(|x| k + x).unwrap_or(t.len());
                other |= tags_of(&t[k + 1..end]).iter().any(|(n, _)| !matches!(n.as_str(), "b" | "i" | "u" | "s"));
                t = &t[(end + 1).min(t.len())..];
            }
            other
        }).count());
        let sections = doc.skeleton.iter().filter(|i| matches!(i, Item::Line { t, .. } if matches!(section_of(t).as_deref(), Some("fonts" | "graphics")))).count();
        count("fonts", sections);
    } else {
        count("settings", ev.iter().filter(|e| !e.suffix.trim().is_empty()).count());
    }
    let mut keep: Vec<&Event> = ev.iter().filter(|e| !e.comment).collect();
    keep.sort_by_key(|e| e.start);
    let events = keep.into_iter().enumerate().map(|(k, e)| Event {
        id: k as u32 + 1, start: e.start, end: e.end,
        text: if is_ass { ass_to_srt_text(&e.text) } else { e.text.clone() },
        ..Default::default()
    }).collect();
    let crlf = "\r\n".to_string();
    (SubDoc {
        kind: "srt".into(), enc: Enc { charset: "UTF-8".into(), bom: true }, eol: crlf.clone(), exact: true, bad: 0, renumber: true,
        skeleton: vec![Item::Events, Item::Line { t: String::new(), e: crlf }], style_format: vec![], event_format: vec![], styles: vec![], events, source: None,
    }, lost)
}

/// SRT VTT เป็น ASS · หัวไฟล์ตามขนาดภาพ สไตล์ Default เดียว (แคลร์ตั้ง ฟอนต์ Tahoma อ่านไทยชัด ขนาดราว 6.5% ของความสูงภาพ)
pub fn to_ass(doc: &SubDoc, play_res: (u32, u32)) -> SubDoc {
    if doc.kind == "ass" || doc.kind == "ssa" { return doc.clone(); }
    let (w, h) = play_res;
    let eol = "\r\n".to_string();
    let l = |t: &str| Item::Line { t: t.into(), e: eol.clone() };
    let size = ((h as f64) * 0.065).round().max(16.0);
    let style = Style { id: 1, fields: fmt_list(&format!(
        "Default,Tahoma,{size},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,{m},{m},{v},222",
        m = (w as f64 * 0.03).round(), v = (h as f64 * 0.04).round())), ..Default::default() };
    let events = doc.events.iter().enumerate().map(|(k, e)| Event {
        id: k as u32 + 2, start: e.start, end: e.end, style: "Default".into(), text: srt_to_ass_text(&e.text), ..Default::default()
    }).collect();
    SubDoc {
        kind: "ass".into(), enc: Enc { charset: "UTF-8".into(), bom: true }, eol: eol.clone(), exact: true, bad: 0, renumber: true,
        skeleton: vec![
            l("[Script Info]"), l("ScriptType: v4.00+"), l("WrapStyle: 0"), l("ScaledBorderAndShadow: yes"), l("YCbCr Matrix: TV.709"),
            l(&format!("PlayResX: {w}")), l(&format!("PlayResY: {h}")), l(""),
            l("[V4+ Styles]"), l(&format!("Format: {}", STYLE_FORMAT.join(", "))), Item::Styles, l(""),
            l("[Events]"), l(&format!("Format: {}", EVENT_FORMAT.join(", "))), Item::Events,
        ],
        style_format: STYLE_FORMAT.iter().map(|s| s.to_string()).collect(), event_format: EVENT_FORMAT.iter().map(|s| s.to_string()).collect(),
        styles: vec![style], events, source: None,
    }
}

