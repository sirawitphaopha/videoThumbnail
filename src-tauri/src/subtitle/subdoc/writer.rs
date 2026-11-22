//! หน้าแก้ซับ เขียนเอกสารซับกลับเป็นข้อความตามชนิดไฟล์
//! แยกจาก subdoc/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- เขียน

fn raws(out: &mut String, lines: &[Raw]) {
    for l in lines { out.push_str(&l.t); out.push_str(&l.e); }
}

fn ass_unchanged(e: &Event, format: &[String]) -> bool {
    let Some(r) = e.raw.first() else { return false };
    if e.raw.len() != 1 { return false; }
    match parse_event_line(r.t.trim_start_matches('\u{FEFF}'), format) {
        Some(o) => o.comment == e.comment && o.layer == e.layer && o.start == e.start && o.end == e.end && o.style == e.style && o.actor == e.actor
            && o.margin_l == e.margin_l && o.margin_r == e.margin_r && o.margin_v == e.margin_v && o.effect == e.effect && o.text == e.text,
        None => false,
    }
}

/// บล็อก SRT VTT · ใช้บรรทัดเดิมทีละส่วนถ้าส่วนนั้นค่าไม่เปลี่ยน เลขลำดับ SRT เรียงใหม่ตามตำแหน่ง
fn write_block(out: &mut String, e: &Event, pos: usize, kind: &str, eol: &str, renumber: bool) {
    let old = parse_block(&e.raw);
    let line_eol = |k: usize| e.raw.get(k).map(|r| r.e.clone()).filter(|x| !x.is_empty()).unwrap_or_else(|| eol.to_string());
    let has_ident = old.as_ref().is_some_and(|o| o.0.is_some());
    let at = if has_ident { 1 } else { 0 };
    // ชื่อหรือเลขลำดับ · SRT เรียงเลขใหม่ตามตำแหน่ง ยกเว้นบล็อกเดิมที่ไม่มีเลข (คงไม่มีเลขตามไฟล์)
    let ident = if kind == "srt" {
        if old.is_some() && !has_ident { None }
        else if !renumber && e.ident.is_some() { e.ident.clone() }
        else { Some((pos + 1).to_string()) }
    } else { e.ident.clone() };
    match (&ident, &old) {
        (Some(want), Some(o)) if o.0.as_deref().map(str::trim) == Some(want.trim()) => { out.push_str(&e.raw[0].t); out.push_str(&line_eol(0)); }
        (Some(want), _) => { out.push_str(want); out.push_str(&line_eol(0)); }
        (None, _) => {}
    }
    // เวลา
    match &old {
        Some(o) if o.1 == e.start && o.2 == e.end && o.3 == e.suffix => { out.push_str(&e.raw[at].t); out.push_str(&line_eol(at)); }
        _ => {
            let sep = if kind == "vtt" { '.' } else { ',' };
            out.push_str(&format!("{} --> {}{}", srt_time(e.start, sep), srt_time(e.end, sep), e.suffix));
            out.push_str(&line_eol(at));
        }
    }
    // ข้อความ
    match &old {
        Some(o) if o.4 == e.text => raws(out, &e.raw[at + 1..]),
        _ => {
            let tl: Vec<&str> = e.text.split('\n').collect();
            let last_eol = e.raw.last().map(|r| r.e.clone()).unwrap_or_else(|| eol.to_string());
            for (k, l) in tl.iter().enumerate() {
                out.push_str(l.trim_end_matches('\r'));
                out.push_str(if k + 1 == tl.len() { if last_eol.is_empty() { eol } else { &last_eol } } else { eol });
            }
        }
    }
}

/// เอกสารเป็นข้อความทั้งไฟล์ (ก่อนเข้ารหัส)
pub fn render(doc: &SubDoc) -> String {
    let mut out = String::new();
    let eol = doc.eol.as_str();
    let ssa = doc.kind == "ssa";
    let ass = doc.kind == "ass" || ssa;
    let has = |k: &Item| doc.skeleton.iter().any(|x| x == k);
    let write_styles = |out: &mut String| for s in &doc.styles {
        raws(out, &s.pre);
        let same = s.raw.len() == 1 && parse_style_line(s.raw[0].t.trim_start_matches('\u{FEFF}')).as_ref() == Some(&s.fields);
        if same { raws(out, &s.raw); } else { out.push_str(&write_style_line(s)); out.push_str(s.raw.first().map(|r| r.e.as_str()).filter(|x| !x.is_empty()).unwrap_or(eol)); }
    };
    // บรรทัดก่อนหน้ายังไม่จบบรรทัด (บรรทัดสุดท้ายของไฟล์เดิมที่ไม่มีตัวขึ้นบรรทัด แล้วมีบรรทัดซับตามหลัง เช่นเพิ่มบรรทัดต่อท้าย หรือเรียงใหม่)
    // ใส่ตัวจบบรรทัดก่อน ไม่งั้นบรรทัดใหม่ไปติดท้ายบรรทัดเดิม (ผู้ช่วยตรวจทานระบบซับ 14 พ.ย. 2569 ข้อ R5) · ไฟล์ที่ไม่ได้แก้ไม่มีบรรทัดซับตามหลังบรรทัดนั้น ได้ไบต์เดิม
    let end_line = |out: &mut String| if !out.is_empty() && !out.ends_with('\n') && !out.ends_with('\r') { out.push_str(eol); };
    let write_events = |out: &mut String| for (pos, e) in doc.events.iter().enumerate() {
        if ass {
            end_line(out);
            raws(out, &e.pre);
            if ass_unchanged(e, &doc.event_format) { raws(out, &e.raw); } else {
                out.push_str(&write_event_line(e, &doc.event_format, ssa));
                out.push_str(e.raw.first().map(|r| r.e.as_str()).filter(|x| !x.is_empty()).unwrap_or(eol));
            }
        } else {
            // บล็อกแรกของไฟล์ไม่ขึ้นต้นด้วยบรรทัดว่าง · บล็อกถัดไปที่ไม่มีบรรทัดคั่น (เคยเป็นบล็อกแรก หรือบล็อกใหม่) ใส่บรรทัดว่างหนึ่งบรรทัด
            let blank_only = e.pre.iter().all(|r| r.t.trim().is_empty());
            // จบบรรทัดก่อนหน้าก่อนใส่บรรทัดว่างคั่นบล็อก (เดิมเช็กหลังใส่ บรรทัดว่างคั่นเลยกลายเป็นตัวจบของบรรทัดเดิม ข้อ R5)
            end_line(out);
            if pos == 0 && blank_only {} else if e.pre.is_empty() && pos > 0 { out.push_str(eol); } else { raws(out, &e.pre); }
            end_line(out);
            write_block(out, e, pos, &doc.kind, eol, doc.renumber);
        }
    };
    for item in &doc.skeleton {
        match item {
            Item::Line { t, e } => {
                // ไม่มีส่วนสไตล์เดิม แต่มีสไตล์ใหม่ ใส่ส่วนสไตล์ไว้ก่อน [Events]
                if ass && !has(&Item::Styles) && !doc.styles.is_empty() && section_of(t).as_deref() == Some("events") {
                    out.push_str("[V4+ Styles]"); out.push_str(eol);
                    out.push_str(&format!("Format: {}", doc.style_format.join(", "))); out.push_str(eol);
                    write_styles(&mut out);
                    out.push_str(eol);
                }
                out.push_str(t); out.push_str(e);
            }
            Item::Styles => write_styles(&mut out),
            Item::Events => write_events(&mut out),
        }
    }
    if ass && !has(&Item::Events) && !doc.events.is_empty() {
        if !out.is_empty() && !out.ends_with('\n') { out.push_str(eol); }
        out.push_str("[Events]"); out.push_str(eol);
        out.push_str(&format!("Format: {}", doc.event_format.join(", "))); out.push_str(eol);
        write_events(&mut out);
    }
    out
}

/// เอกสารเป็นไบต์ · รหัสเดิมเก็บตัวอักษรไม่ได้ เปลี่ยนเป็น UTF-8 มี BOM แล้วบอกตัวอักษรตัวแรกที่เก็บไม่ได้
pub fn to_bytes(doc: &SubDoc) -> (Vec<u8>, Enc, Option<char>) {
    let text = render(doc);
    match encode(&text, &doc.enc) {
        Ok(b) => (b, doc.enc.clone(), None),
        Err(c) => {
            let enc = Enc { charset: "UTF-8".into(), bom: true };
            (encode(&text, &enc).unwrap_or_default(), enc, Some(c))
        }
    }
}

