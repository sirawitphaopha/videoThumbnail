//! ตัวอ่านเขียนซับของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 1 · BUGS ข้อ 109)
//! อ่าน ASS SSA SRT VTT เป็นเอกสารที่แก้ได้ แล้วเขียนกลับ · เปิดแล้วบันทึกโดยไม่แก้ ได้ไฟล์เหมือนเดิมทุกไบต์
//!
//! หลักการ เก็บทุกบรรทัดของไฟล์พร้อมตัวจบบรรทัดเดิมของแต่ละบรรทัด (โครงไฟล์) · สไตล์กับบรรทัดซับแยกเป็นช่องให้แก้
//! แต่ละรายการจำข้อความเดิมไว้ ตอนเขียนถ้าค่าในช่องยังตรงกับข้อความเดิม เขียนข้อความเดิมกลับทุกตัวอักษร
//! ต่างจาก Aegisub ที่เขียนไฟล์ใหม่ทั้งไฟล์ (เปลี่ยนรหัสเป็น UTF-8 ตัดบรรทัดความเห็นในหัวไฟล์ เติมส่วนของตัวเอง)
//!
//! วิธีแยกช่องของบรรทัด ASS เวลา สไตล์ ตัวอ่าน SRT กับตัวแปลงแท็ก SRT กับ ASS ไปกลับ แปลจากซอร์ส Aegisub
//! (github.com/TypesettingTools/Aegisub commit f90e5d4) ไฟล์ src/ass_dialogue.cpp src/ass_style.cpp src/ass_parser.cpp
//! src/subtitle_format_srt.cpp libaegisub/ass/time.cpp ตามสัญญาอนุญาตของไฟล์เหล่านั้น
//!
//! Copyright (c) 2005-2006, Rodrigo Braz Monteiro
//! Copyright (c) 2012-2014, Thomas Goyne <plorkyeran@aegisub.org>
//! All rights reserved.
//!
//! Redistribution and use in source and binary forms, with or without
//! modification, are permitted provided that the following conditions are met:
//!
//!   * Redistributions of source code must retain the above copyright notice,
//!     this list of conditions and the following disclaimer.
//!   * Redistributions in binary form must reproduce the above copyright notice,
//!     this list of conditions and the following disclaimer in the documentation
//!     and/or other materials provided with the distribution.
//!   * Neither the name of the Aegisub Group nor the names of its contributors
//!     may be used to endorse or promote products derived from this software
//!     without specific prior written permission.
//!
//! THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
//! AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
//! IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
//! ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
//! LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
//! CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
//! SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
//! INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
//! CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
//! ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
//! POSSIBILITY OF SUCH DAMAGE.
//!
//! Permission to use, copy, modify, and distribute this software for any
//! purpose with or without fee is hereby granted, provided that the above
//! copyright notice and this permission notice appear in all copies.
//! (ไฟล์ ass_parser.cpp กับ time.cpp ของ Thomas Goyne ใช้สัญญาแบบ ISC ข้างบนนี้)

use crate::subtitle::subs::{cp1252, cp874, guess_charset};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------- รหัสอักษร

/// รหัสอักษรของไฟล์ · charset คือ UTF-8 UTF-16LE UTF-16BE TIS-620 Windows-1252
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Enc {
    pub charset: String,
    pub bom: bool,
}

/// ไบต์เป็นข้อความ พร้อมรหัสอักษรที่ใช้ · เดาแบบเดียวกับตัวดูซับ (subs::guess_charset) แต่แยก UTF-16 สองแบบและจำ BOM
pub fn decode(b: &[u8]) -> (String, Enc) {
    let enc = |c: &str, bom: bool| Enc { charset: c.into(), bom };
    let u16s = |r: &[u8], le: bool| -> String {
        let v: Vec<u16> = r.chunks_exact(2).map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) }).collect();
        String::from_utf16_lossy(&v)
    };
    if let Some(r) = b.strip_prefix(&[0xEF, 0xBB, 0xBF]) { return (String::from_utf8_lossy(r).into_owned(), enc("UTF-8", true)); }
    if let Some(r) = b.strip_prefix(&[0xFF, 0xFE]) { return (u16s(r, true), enc("UTF-16LE", true)); }
    if let Some(r) = b.strip_prefix(&[0xFE, 0xFF]) { return (u16s(r, false), enc("UTF-16BE", true)); }
    match guess_charset(b) {
        "UTF-8" => (String::from_utf8_lossy(b).into_owned(), enc("UTF-8", false)),
        "CP874" => (b.iter().map(|&x| cp874(x)).collect(), enc("TIS-620", false)),
        _ => (b.iter().map(|&x| cp1252(x)).collect(), enc("Windows-1252", false)),
    }
}

/// ข้อความที่ผู้ใช้เลือกรหัสเอง (เปิดด้วยการเข้ารหัสที่เลือก) · ไม่ดู BOM ยกเว้น UTF-8 กับ UTF-16
pub fn decode_as(b: &[u8], charset: &str) -> (String, Enc) {
    match charset {
        "TIS-620" => (b.iter().map(|&x| cp874(x)).collect(), Enc { charset: "TIS-620".into(), bom: false }),
        "Windows-1252" => (b.iter().map(|&x| cp1252(x)).collect(), Enc { charset: "Windows-1252".into(), bom: false }),
        "UTF-8" => {
            let (r, bom) = match b.strip_prefix(&[0xEF, 0xBB, 0xBF]) { Some(r) => (r, true), None => (b, false) };
            (String::from_utf8_lossy(r).into_owned(), Enc { charset: "UTF-8".into(), bom })
        }
        _ => decode(b),
    }
}

/// CP874 กลับเป็นไบต์ · ตัวที่เก็บไม่ได้ส่ง None
fn to_cp874(c: char) -> Option<u8> {
    let u = c as u32;
    Some(match u {
        0..=0x7F => u as u8,
        0x0E01..=0x0E3A | 0x0E3F..=0x0E5B => (u - 0x0D60) as u8,
        0x20AC => 0x80, 0x2026 => 0x85, 0x2018 => 0x91, 0x2019 => 0x92, 0x201C => 0x93, 0x201D => 0x94,
        0x2022 => 0x95, 0x2013 => 0x96, 0x2014 => 0x97, 0xA0 => 0xA0,
        _ => return None,
    })
}

/// Windows-1252 กลับเป็นไบต์
fn to_cp1252(c: char) -> Option<u8> {
    let u = c as u32;
    if u < 0x80 || (0xA0..=0xFF).contains(&u) { return Some(u as u8); }
    (0x80u8..=0x9F).find(|&b| cp1252(b) == c)
}

/// ข้อความเป็นไบต์ตามรหัสอักษร · ตัวอักษรที่รหัสนี้เก็บไม่ได้ ส่งตัวนั้นกลับมาเป็นข้อผิดพลาด
pub fn encode(s: &str, enc: &Enc) -> Result<Vec<u8>, char> {
    let mut out = Vec::with_capacity(s.len() + 3);
    match enc.charset.as_str() {
        "UTF-16LE" | "UTF-16BE" => {
            let le = enc.charset == "UTF-16LE";
            if enc.bom { out.extend_from_slice(if le { &[0xFF, 0xFE] } else { &[0xFE, 0xFF] }); }
            for u in s.encode_utf16() { out.extend_from_slice(&if le { u.to_le_bytes() } else { u.to_be_bytes() }); }
        }
        "TIS-620" => for c in s.chars() { out.push(to_cp874(c).ok_or(c)?); },
        "Windows-1252" => for c in s.chars() { out.push(to_cp1252(c).ok_or(c)?); },
        _ => {
            if enc.bom { out.extend_from_slice(&[0xEF, 0xBB, 0xBF]); }
            out.extend_from_slice(s.as_bytes());
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------- อ่าน

fn detect_kind(text: &str, hint: &str) -> String {
    let head = text.trim_start_matches('\u{FEFF}').trim_start();
    if head.starts_with("WEBVTT") || hint == "vtt" { return "vtt".into(); }
    let lower = text.to_ascii_lowercase();
    if lower.contains("[events]") || lower.contains("[script info]") || matches!(hint, "ass" | "ssa") {
        let v4 = lower.lines().find_map(|l| l.trim().strip_prefix("scripttype:").map(|v| v.trim().to_string()));
        return if v4.as_deref() == Some("v4.00") || (hint == "ssa" && v4.is_none()) { "ssa".into() } else { "ass".into() };
    }
    "srt".into()
}

/// ไบต์ของไฟล์เป็นเอกสาร · charset ว่าง = เดาเอง
pub fn parse_doc(bytes: &[u8], hint: &str, charset: Option<&str>) -> SubDoc {
    let (text, enc) = match charset { Some(c) => decode_as(bytes, c), None => decode(bytes) };
    let exact = encode(&text, &enc).map(|b| b == bytes).unwrap_or(false);
    let kind = detect_kind(&text, hint);
    let lines = split_lines(&text);
    let eol = main_eol(&lines);
    let mut doc = SubDoc { kind: kind.clone(), enc, eol, exact, bad: 0, renumber: true, skeleton: vec![], style_format: vec![], event_format: vec![], styles: vec![], events: vec![], source: None };
    if kind == "ass" || kind == "ssa" {
        let (sk, sf, ef, st, ev, bad) = parse_ass(lines, &kind);
        doc.skeleton = sk; doc.style_format = sf; doc.event_format = ef; doc.styles = st; doc.events = ev; doc.bad = bad;
    } else {
        let (sk, ev, bad) = parse_timed(lines, &kind);
        doc.renumber = kind != "srt" || numbers_in_order(&ev);
        doc.skeleton = sk; doc.events = ev; doc.bad = bad;
    }
    doc
}

// ---------------------------------------------------------------- ไฟล์

fn stamp(p: &Path) -> (u64, u64) {
    let m = std::fs::metadata(p).ok();
    let size = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mtime = m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
    (size, mtime)
}

/// ไฟล์ชั่วคราวข้างไฟล์ปลายทาง ชื่อไม่ชนใคร
pub(crate) fn partial_of(target: &Path) -> PathBuf {
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    target.with_file_name(format!("{name}.{}.partial", crate::cover::poster_image::unique()))
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub path: String,
    pub enc: Enc,
    /// ตัวอักษรที่รหัสเดิมเก็บไม่ได้ จึงเปลี่ยนเป็น UTF-8
    pub bad_char: Option<String>,
    pub source: Source,
}

/// บันทึก · mode "replace" เขียนทับไฟล์ที่เปิดอยู่ (ไฟล์เดิมลงถังขยะ) · "new" ไฟล์ใหม่ห้ามมีอยู่แล้ว (ตอบ "exists")
/// ก่อนเขียนทับเช็กว่าไฟล์ไม่ได้ถูกแก้จากที่อื่นหลังเปิด (ตอบ "changed") เว้นแต่ force
pub fn save(doc: &SubDoc, target: &Path, mode: &str, force: bool) -> Result<Saved, String> {
    let (bytes, enc, bad) = to_bytes(doc);
    if mode == "replace" {
        let src = doc.source.as_ref().filter(|s| !s.in_movie).ok_or("ซับนี้อยู่ในไฟล์หนัง บันทึกทับไม่ได้ ต้องบันทึกเป็นไฟล์ใหม่")?;
        if Path::new(&src.path) != target { return Err("บันทึกทับได้เฉพาะไฟล์ที่เปิดอยู่".into()); }
        if !target.exists() { return Err("missing".into()); }
        if !force && stamp(target) != (src.size, src.mtime) { return Err("changed".into()); }
        if !crate::app::outfile::not_in_use(target) { return Err("ไฟล์ซับถูกเปิดอยู่ในโปรแกรมอื่น ปิดโปรแกรมนั้นก่อนแล้วกดบันทึกใหม่".into()); }
    } else if target.exists() {
        return Err("exists".into());
    }
    let partial = partial_of(target);
    // จดไว้ ไฟดับกลางทาง ตอนเปิดครั้งหน้าลบไฟล์ที่เขียนไม่ครบ หรือย้ายไฟล์ที่ตรวจครบแล้วเข้าชื่อจริงถ้าไฟล์เดิมลงถังขยะไปแล้ว (BUGS ข้อ 162.4)
    let tracked = crate::app::inflight::track(&partial, Some(target), crate::app::inflight::Kind::Temp);
    {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|e| format!("เขียนไฟล์ไม่ได้ {e}"))?;
        f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| { let _ = std::fs::remove_file(&partial); format!("เขียนไฟล์ไม่ได้ {e}") })?;
    }
    // อ่านกลับต้องได้ไบต์ที่ตั้งใจเขียน
    if std::fs::read(&partial).ok().as_deref() != Some(&bytes[..]) {
        let _ = std::fs::remove_file(&partial);
        return Err("เขียนแล้วอ่านกลับไม่ตรง ไฟล์เดิมยังอยู่ครบ".into());
    }
    tracked.ready();
    if mode == "replace" {
        // ไฟล์เดิมลงถังขยะด้วยชื่อจริง (กู้คืนได้) แล้วเอาไฟล์ใหม่มาแทน · ย้ายไม่สำเร็จ ไฟล์เดิมยังอยู่ในถังขยะ ไฟล์ใหม่อยู่ที่ .partial
        crate::app::outfile::to_trash(target).map_err(|e| { let _ = std::fs::remove_file(&partial); e })?;
        crate::cover::rename::move_no_replace(&partial, target).map_err(|p| format!("เอาไฟล์ใหม่มาแทนไม่สำเร็จ {}  ไฟล์เดิมอยู่ในถังขยะ ไฟล์ใหม่อยู่ที่ {}", p.title, partial.display()))?;
    } else if let Err(p) = crate::cover::rename::move_no_replace(&partial, target) {
        let _ = std::fs::remove_file(&partial);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    crate::app::actlog::note("บันทึกไฟล์ซับ", &format!("{} ({}{})", target.display(), enc.charset, if bad.is_some() { " เปลี่ยนรหัสเพราะมีตัวอักษรที่รหัสเดิมเก็บไม่ได้" } else { "" }));
    let (size, mtime) = stamp(target);
    Ok(Saved { path: target.display().to_string(), enc, bad_char: bad.map(|c| c.to_string()), source: Source { path: target.display().to_string(), in_movie: false, size, mtime, tid: None } })
}

// ---------------------------------------------------------------- คำสั่ง

fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// เปิดซับเป็นเอกสาร · ไฟล์ซับ หรือแทร็กในหนัง (tid ของ mkvmerge ff ของ ffprobe) · charset ว่าง = เดาเอง
/// ขนาดกับเวลาแก้ของไฟล์ (หน้าแก้ซับเทียบหนังก่อนใส่ซับกลับเข้าหนัง · R3) · หาไฟล์ไม่เจอ = (0, 0)
#[tauri::command]
pub fn subdoc_stamp(path: String) -> (u64, u64) {
    stamp(Path::new(&path))
}

#[tauri::command]
pub async fn subdoc_open(app: AppHandle, path: String, in_movie: bool, tid: u64, ff: u64, charset: Option<String>) -> Result<SubDoc, String> {
    let tools = crate::app::tools::tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
        // จดขนาดกับเวลาแก้ก่อนอ่าน ไฟล์ถูกเขียนระหว่างอ่าน ค่าที่จดเป็นของเก่า เช็กตอนบันทึกจึงเตือน (ผู้ช่วยตรวจทาน R14)
        // ซับในหนังจดของไฟล์หนังไว้ด้วย ก่อนใส่กลับเข้าหนังเทียบว่าหนังยังเป็นไฟล์เดิม ไม่ถูกรวมไฟล์ใหม่ระหว่างแก้ แทร็กเลขเดิมจึงยังเป็นแทร็กเดิม (R3)
        let (size, mtime) = stamp(&p);
        let (bytes, hint) = crate::subtitle::subs::bytes_of(&tools, &work, &p, in_movie, tid, ff)?;
        let mut doc = parse_doc(&bytes, &hint, charset.as_deref());
        let plain = !in_movie && matches!(hint.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt");
        doc.source = Some(Source { path, in_movie: !plain, size, mtime, tid: (!plain).then_some(tid) });
        Ok(doc)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn subdoc_save(doc: SubDoc, target: String, mode: String, force: Option<bool>) -> Result<Saved, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // บันทึกทีละงาน กดบันทึกสองครั้งเร็ว ๆ หรือตัวกันปิดเรียกพร้อมคนกด สองงานผ่านเช็กพร้อมกันแล้วงานหนึ่งส่งไฟล์ที่อีกงานเพิ่งเขียนลงถังขยะได้ (ผู้ช่วยตรวจทาน R14)
        let _one = SAVE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        save(&doc, Path::new(&target), &mode, force.unwrap_or(false))
    }).await.map_err(|e| e.to_string())?
}
static SAVE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Converted {
    pub doc: SubDoc,
    pub lost: Vec<Lost>,
}

/// เปลี่ยนชนิดในหน่วยความจำ (ยังไม่เขียนไฟล์) · to = srt หรือ ass · play_res ขนาดภาพของหนังสำหรับหัวไฟล์ ASS
#[tauri::command]
pub fn subdoc_convert(doc: SubDoc, to: String, play_res: Option<(u32, u32)>) -> Result<Converted, String> {
    match to.as_str() {
        "srt" => { let (d, lost) = to_srt(&doc); Ok(Converted { doc: d, lost }) }
        "ass" => Ok(Converted { doc: to_ass(&doc, play_res.unwrap_or((1920, 1080))), lost: vec![] }),
        _ => Err("ชนิดนี้ยังเปลี่ยนไม่ได้".into()),
    }
}

/// ชื่อไฟล์ที่ยังไม่มีในโฟลเดอร์ ต่อท้าย (2) (3) แบบไฟล์เดิมในโปรแกรม
#[tauri::command]
pub fn subdoc_free_name(path: String) -> String {
    let p = PathBuf::from(&path);
    let dir = p.parent().map(Path::to_path_buf).unwrap_or_default();
    crate::app::outfile::free_name(&dir, Path::new(p.file_name().unwrap_or_default())).display().to_string()
}

/// ข้อความทั้งไฟล์ตามที่จะบันทึก (แบบ notepad กับตัวตรวจ)
#[tauri::command]
pub fn subdoc_render(doc: SubDoc) -> String {
    render(&doc)
}

/// ซับที่แก้เป็นไฟล์ชั่วคราวในโฟลเดอร์ tmp ของโปรแกรม ใช้ใส่กลับเข้าหนัง (แผนหน้าแก้ซับ ขั้น 9)
/// ชื่อขึ้นต้น sub- โปรแกรมกวาดทิ้งเองตอนเปิดครั้งหน้า (lib.rs) · เขียนด้วยรหัสอักษรเดิมของเอกสาร เก็บไม่ได้ใช้ UTF-8 (to_bytes)
#[tauri::command]
pub fn subdoc_temp(app: AppHandle, doc: SubDoc) -> Result<String, String> {
    let dir = work_dir(&app)?;
    let ext = match doc.kind.as_str() { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" };
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = dir.join(format!("sub-remux-{stamp}.{ext}"));
    let (bytes, _, _) = to_bytes(&doc);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

/// ข้อความทั้งไฟล์ที่พิมพ์ในแบบ notepad เป็นเอกสาร · ใช้รหัสอักษร ตัวจบบรรทัด และที่มาเดิม
#[tauri::command]
pub fn subdoc_parse_text(text: String, kind: String, enc: Enc, source: Option<Source>) -> SubDoc {
    let lines = split_lines(&text);
    let eol = main_eol(&lines);
    let mut doc = SubDoc { kind: kind.clone(), enc, eol, exact: true, bad: 0, renumber: true, skeleton: vec![], style_format: vec![], event_format: vec![], styles: vec![], events: vec![], source };
    if kind == "ass" || kind == "ssa" {
        let (sk, sf, ef, st, ev, bad) = parse_ass(lines, &kind);
        doc.skeleton = sk; doc.style_format = sf; doc.event_format = ef; doc.styles = st; doc.events = ev; doc.bad = bad;
    } else {
        let (sk, ev, bad) = parse_timed(lines, &kind);
        doc.renumber = kind != "srt" || numbers_in_order(&ev);
        doc.skeleton = sk; doc.events = ev; doc.bad = bad;
    }
    doc
}

// ---------------------------------------------------------------- บันทึกอัตโนมัติ กันปิด (แผนหน้าแก้ซับ ขั้น 2)

/// ชื่อซับที่แก้แล้วยังไม่บันทึก · ตัวกันปิด (jobs::guard_close) ถามก่อนปิดโปรแกรม · หน้าจอบอกทุกครั้งที่สถานะเปลี่ยน
pub static DIRTY: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

#[tauri::command]
pub fn subdoc_set_dirty(name: Option<String>) {
    *DIRTY.lock().unwrap() = name;
}

fn autosave_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("autosave");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

// ฉบับบันทึกอัตโนมัติ (เขียน ตัดฉบับเก่า เปิดคืน) อยู่ autosave.rs · คำสั่งของหน้าจออยู่ที่นี่
#[tauri::command]
pub fn subdoc_autosave(app: AppHandle, doc: SubDoc, name: String) -> Result<AutoItem, String> {
    autosave_to(&autosave_dir(&app)?, &doc, &name)
}

#[tauri::command]
pub fn subdoc_autosaves(app: AppHandle) -> Result<Vec<AutoItem>, String> {
    Ok(list_autosaves(&autosave_dir(&app)?))
}

#[tauri::command]
pub fn subdoc_open_autosave(app: AppHandle, path: String) -> Result<SubDoc, String> {
    open_autosave(&autosave_dir(&app)?, Path::new(&path))
}

// ---------------------------------------------------------------- เทส

mod autosave;
pub use autosave::*;

mod convert;
pub use convert::*;

mod writer;
pub use writer::*;

mod formats;
pub(crate) use formats::*;

mod model;
pub use model::*;

#[cfg(test)]
mod tests;
