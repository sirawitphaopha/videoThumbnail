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

use crate::subs::{cp1252, cp874, guess_charset};
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

// ---------------------------------------------------------------- บรรทัด

/// หนึ่งบรรทัดของไฟล์พร้อมตัวจบบรรทัดเดิม ("\r\n" "\n" "\r" หรือว่างที่บรรทัดสุดท้าย)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Raw {
    pub t: String,
    pub e: String,
}

fn split_lines(s: &str) -> Vec<Raw> {
    let mut out = Vec::new();
    let b = s.as_bytes();
    let (mut i, mut start) = (0, 0);
    while i < b.len() {
        match b[i] {
            b'\r' => {
                let e = if b.get(i + 1) == Some(&b'\n') { "\r\n" } else { "\r" };
                out.push(Raw { t: s[start..i].into(), e: e.into() });
                i += e.len();
                start = i;
            }
            b'\n' => {
                out.push(Raw { t: s[start..i].into(), e: "\n".into() });
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }
    if start < b.len() { out.push(Raw { t: s[start..].into(), e: String::new() }); }
    out
}

/// ตัวจบบรรทัดที่ไฟล์ใช้มากที่สุด ไว้ใช้กับบรรทัดใหม่
fn main_eol(lines: &[Raw]) -> String {
    let crlf = lines.iter().filter(|l| l.e == "\r\n").count();
    let lf = lines.iter().filter(|l| l.e == "\n").count();
    if crlf >= lf && crlf > 0 { "\r\n".into() } else { "\n".into() }
}

// ---------------------------------------------------------------- เวลา (libaegisub/ass/time.cpp)

const MAX_MS: i64 = 10 * 60 * 60 * 1000 - 6;

/// เวลาเป็นมิลลิวินาที · ตัวเลขหลังจุดหรือจุลภาคคิดเป็น 100 10 1 มิลลิวินาทีตามตำแหน่ง ตัวอื่นที่ไม่ใช่ตัวเลขข้าม (แบบ agi::Time)
pub fn parse_time(text: &str) -> i64 {
    let (mut time, mut current, mut after) = (0i64, 0i64, -1i64);
    for c in text.chars() {
        match c {
            // คูณบวกแบบไม่ล้น ตัวเลขยาวเกิน 19 หลัก (ไฟล์เสียหรือพิมพ์ผิดในแบบ notepad) รุ่นทดสอบเดิมพังทั้งโปรแกรม ตัวจริงได้เวลาเพี้ยน (ผู้ช่วยตรวจทาน R14)
            // ค่าที่อ่านได้ถูกบีบไว้ที่เวลาสูงสุดอยู่แล้ว ผลของไฟล์ปกติเหมือนเดิมทุกตัว
            ':' => { time = time.saturating_mul(60).saturating_add(current); current = 0; }
            '.' | ',' => { time = time.saturating_mul(60).saturating_add(current).saturating_mul(1000); current = 0; after = 100; }
            '0'..='9' => {
                let d = c as i64 - '0' as i64;
                if after < 0 { current = current.saturating_mul(10).saturating_add(d); } else { time = time.saturating_add(d * after); after /= 10; }
            }
            _ => {}
        }
    }
    if after < 0 { time = time.saturating_mul(60).saturating_add(current).saturating_mul(1000); }
    time.clamp(0, MAX_MS)
}

/// h:mm:ss.cc ของ ASS · ปัดเป็นเซนติวินาทีแบบ Aegisub (ms + 5 ปัดลง)
pub fn ass_time(ms: i64) -> String {
    let t = ms.clamp(0, MAX_MS);
    let t = (t + 5) - (t + 5) % 10;
    format!("{}:{:02}:{:02}.{:02}", t / 3_600_000, t / 60_000 % 60, t / 1000 % 60, t % 1000 / 10)
}

/// hh:mm:ss,mmm ของ SRT · hh:mm:ss.mmm ของ VTT
pub fn srt_time(ms: i64, sep: char) -> String {
    let t = ms.clamp(0, MAX_MS);
    format!("{:02}:{:02}:{:02}{sep}{:03}", t / 3_600_000, t / 60_000 % 60, t / 1000 % 60, t % 1000)
}

// ---------------------------------------------------------------- เอกสาร

/// สไตล์ของ ASS · ช่องเรียงตามบรรทัด Format ของส่วนสไตล์ เก็บเป็นข้อความตามไฟล์ (ตัวเลขทศนิยมไม่เพี้ยน)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    pub id: u32,
    pub fields: Vec<String>,
    /// บรรทัดก่อนหน้าสไตล์นี้ในส่วนเดียวกัน (บรรทัดว่าง บรรทัดความเห็น) · ของเดิมจากไฟล์
    #[serde(default)]
    pub pre: Vec<Raw>,
    /// ข้อความเดิมจากไฟล์ · สไตล์ใหม่ไม่มี
    #[serde(default)]
    pub raw: Vec<Raw>,
}

/// บรรทัดซับ · ASS ใช้ทุกช่อง SRT VTT ใช้ เวลา ข้อความ ident suffix
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: u32,
    /// บรรทัด Comment: ของ ASS
    #[serde(default)]
    pub comment: bool,
    #[serde(default)]
    pub layer: i32,
    pub start: i64,
    pub end: i64,
    #[serde(default)]
    pub style: String,
    #[serde(default)]
    pub actor: String,
    #[serde(default)]
    pub margin_l: i32,
    #[serde(default)]
    pub margin_r: i32,
    #[serde(default)]
    pub margin_v: i32,
    #[serde(default)]
    pub effect: String,
    /// ASS ข้อความพร้อมแท็กและ \N · SRT VTT ข้อความพร้อมแท็ก ขึ้นบรรทัดด้วย \n
    pub text: String,
    /// เลขลำดับของ SRT หรือชื่อบรรทัดของ VTT ตามไฟล์
    #[serde(default)]
    pub ident: Option<String>,
    /// ข้อความต่อท้ายเวลาจบ (ค่าตั้งตำแหน่งของ VTT พิกัดของ SRT บางไฟล์)
    #[serde(default)]
    pub suffix: String,
    #[serde(default)]
    pub pre: Vec<Raw>,
    #[serde(default)]
    pub raw: Vec<Raw>,
}

/// ชิ้นของโครงไฟล์ · บรรทัดตามเดิม หรือจุดที่สไตล์ทั้งหมด บรรทัดซับทั้งหมดอยู่
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "k", rename_all = "camelCase")]
pub enum Item {
    Line { t: String, e: String },
    Styles,
    Events,
}

/// ที่มาของเอกสาร · ไฟล์ซับ จำขนาดกับเวลาแก้ไว้ตรวจว่าโดนแก้จากที่อื่นก่อนบันทึกทับ · ซับในหนังไม่มีขนาด
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub path: String,
    #[serde(default)]
    pub in_movie: bool,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub mtime: u64,
    /// เลขแทร็กของซับในหนัง (ไม่มี = ไฟล์ซับ หรือฉบับบันทึกอัตโนมัติรุ่นก่อนที่ยังไม่จำ) · ใส่กลับเข้าหนังใช้เลขนี้ ไม่ใช้แทร็กที่หน้าเลือกอยู่ (ผู้ช่วยตรวจทาน F18)
    #[serde(default)]
    pub tid: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SubDoc {
    /// ass ssa srt vtt
    pub kind: String,
    pub enc: Enc,
    /// ตัวจบบรรทัดของบรรทัดใหม่
    pub eol: String,
    /// เข้ารหัสกลับแล้วได้ไบต์เดิมทุกไบต์ · ไม่ได้ (ไฟล์มีอักษรเสีย) หน้าจอต้องเตือนก่อนบันทึก
    pub exact: bool,
    /// บรรทัดที่อ่านไม่ออก เก็บไว้ตามเดิมในโครงไฟล์ แต่ไม่ขึ้นในตาราง
    pub bad: usize,
    /// SRT เลขลำดับเดิมเรียง 1 2 3 · เรียงอยู่ = เพิ่มลบบรรทัดแล้วเรียงเลขใหม่ตามตำแหน่ง · ไม่เรียง (ไฟล์ตัดต่อมา) = คงเลขเดิม
    #[serde(default = "yes")]
    pub renumber: bool,
    pub skeleton: Vec<Item>,
    #[serde(default)]
    pub style_format: Vec<String>,
    #[serde(default)]
    pub event_format: Vec<String>,
    pub styles: Vec<Style>,
    pub events: Vec<Event>,
    #[serde(default)]
    pub source: Option<Source>,
}

fn yes() -> bool {
    true
}

/// เลขลำดับของ SRT เรียง 1 2 3 ตามตำแหน่งทุกบรรทัดไหม
fn numbers_in_order(events: &[Event]) -> bool {
    events.iter().enumerate().all(|(k, e)| e.ident.as_deref().map(str::trim) == Some((k + 1).to_string().as_str()))
}

// ---------------------------------------------------------------- ASS SSA (ass_parser.cpp ass_dialogue.cpp ass_style.cpp)

const EVENT_FORMAT: [&str; 10] = ["Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"];
const STYLE_FORMAT: [&str; 23] = ["Name", "Fontname", "Fontsize", "PrimaryColour", "SecondaryColour", "OutlineColour", "BackColour", "Bold", "Italic",
    "Underline", "StrikeOut", "ScaleX", "ScaleY", "Spacing", "Angle", "BorderStyle", "Outline", "Shadow", "Alignment", "MarginL", "MarginR", "MarginV", "Encoding"];

fn fmt_list(s: &str) -> Vec<String> {
    s.split(',').map(|x| x.trim().to_string()).collect()
}

/// แยกช่องของบรรทัด Dialogue หรือ Comment ตามบรรทัด Format · ข้อความคือทุกอย่างหลังจุลภาคตัวที่ (ช่อง − 1)
/// ตัด "Dialogue:" กับอีกหนึ่งไบต์ถ้ามี แบบ AssDialogue::Parse · ช่องไม่ครบ = None (เก็บเป็นบรรทัดอ่านไม่ออก)
fn parse_event_line(t: &str, format: &[String]) -> Option<Event> {
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
fn write_event_line(e: &Event, format: &[String], ssa: bool) -> String {
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

fn parse_style_line(t: &str) -> Option<Vec<String>> {
    let rest = t.strip_prefix("Style:")?;
    Some(rest.split(',').map(|x| x.trim().to_string()).collect())
}

fn write_style_line(s: &Style) -> String {
    format!("Style: {}", s.fields.iter().map(|f| f.replace(',', ";")).collect::<Vec<_>>().join(","))
}

fn section_of(t: &str) -> Option<String> {
    let t = t.trim();
    (t.starts_with('[') && t.ends_with(']')).then(|| t[1..t.len() - 1].trim().to_ascii_lowercase())
}

fn parse_ass(lines: Vec<Raw>, kind: &str) -> (Vec<Item>, Vec<String>, Vec<String>, Vec<Style>, Vec<Event>, usize) {
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
fn parse_block(raw: &[Raw]) -> Option<(Option<String>, i64, i64, String, String)> {
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
fn parse_timed(lines: Vec<Raw>, kind: &str) -> (Vec<Item>, Vec<Event>, usize) {
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
    target.with_file_name(format!("{name}.{}.partial", crate::poster_image::unique()))
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
        if !crate::outfile::not_in_use(target) { return Err("ไฟล์ซับถูกเปิดอยู่ในโปรแกรมอื่น ปิดโปรแกรมนั้นก่อนแล้วกดบันทึกใหม่".into()); }
    } else if target.exists() {
        return Err("exists".into());
    }
    let partial = partial_of(target);
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
    if mode == "replace" {
        // ไฟล์เดิมลงถังขยะด้วยชื่อจริง (กู้คืนได้) แล้วเอาไฟล์ใหม่มาแทน · ย้ายไม่สำเร็จ ไฟล์เดิมยังอยู่ในถังขยะ ไฟล์ใหม่อยู่ที่ .partial
        crate::outfile::to_trash(target).map_err(|e| { let _ = std::fs::remove_file(&partial); e })?;
        crate::rename::move_no_replace(&partial, target).map_err(|p| format!("เอาไฟล์ใหม่มาแทนไม่สำเร็จ {}  ไฟล์เดิมอยู่ในถังขยะ ไฟล์ใหม่อยู่ที่ {}", p.title, partial.display()))?;
    } else if let Err(p) = crate::rename::move_no_replace(&partial, target) {
        let _ = std::fs::remove_file(&partial);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    crate::actlog::note("บันทึกไฟล์ซับ", &format!("{} ({}{})", target.display(), enc.charset, if bad.is_some() { " เปลี่ยนรหัสเพราะมีตัวอักษรที่รหัสเดิมเก็บไม่ได้" } else { "" }));
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
    let tools = crate::tools::tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = PathBuf::from(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
        // จดขนาดกับเวลาแก้ก่อนอ่าน ไฟล์ถูกเขียนระหว่างอ่าน ค่าที่จดเป็นของเก่า เช็กตอนบันทึกจึงเตือน (ผู้ช่วยตรวจทาน R14)
        // ซับในหนังจดของไฟล์หนังไว้ด้วย ก่อนใส่กลับเข้าหนังเทียบว่าหนังยังเป็นไฟล์เดิม ไม่ถูกรวมไฟล์ใหม่ระหว่างแก้ แทร็กเลขเดิมจึงยังเป็นแทร็กเดิม (R3)
        let (size, mtime) = stamp(&p);
        let (bytes, hint) = crate::subs::bytes_of(&tools, &work, &p, in_movie, tid, ff)?;
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
    crate::outfile::free_name(&dir, Path::new(p.file_name().unwrap_or_default())).display().to_string()
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

/// เก็บฉบับบันทึกอัตโนมัติกี่ฉบับต่อไฟล์ (แผนหน้าแก้ซับ แคลร์ตั้ง)
const KEEP_AUTOSAVES: usize = 10;

fn autosave_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("autosave");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// ข้อมูลข้างไฟล์บันทึกอัตโนมัติ · ชื่อไฟล์ที่แก้ ที่มา เวลาบันทึก
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutoItem {
    pub path: String,
    pub name: String,
    pub source: Option<Source>,
    /// วันเวลาเครื่อง ปปปป-ดด-วว ชช:นน:วว
    pub at: String,
    pub events: usize,
    /// ลำดับที่บันทึก เพิ่มขึ้นเสมอ ใช้เรียงใหม่เก่า (บันทึกหลายฉบับในวินาทีเดียวกันก็เรียงถูก)
    #[serde(default)]
    pub seq: u64,
}

static AUTO_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// เวลาเครื่องเป็นไมโครวินาที ไม่ซ้ำกับครั้งก่อน
fn next_seq() -> u64 {
    use std::sync::atomic::Ordering;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
    let mut cur = AUTO_SEQ.load(Ordering::SeqCst);
    loop {
        let want = now.max(cur + 1);
        match AUTO_SEQ.compare_exchange(cur, want, Ordering::SeqCst, Ordering::SeqCst) { Ok(_) => return want, Err(v) => cur = v }
    }
}

/// ชื่อที่ใช้เป็นไฟล์ได้ · ตัวที่ Windows ห้ามเปลี่ยนเป็นขีดล่าง
fn safe_name(s: &str) -> String {
    s.chars().map(|c| if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 32 { '_' } else { c }).collect()
}

/// เขียนฉบับบันทึกอัตโนมัติ ไฟล์ซับจริงที่เปิดด้วยโปรแกรมอื่นได้ กับไฟล์ .json ข้างกัน · เก็บ 10 ฉบับล่าสุดต่อชื่อ
pub fn autosave_to(dir: &Path, doc: &SubDoc, name: &str) -> Result<AutoItem, String> {
    let t = crate::actlog::now_local();
    let ext = match doc.kind.as_str() { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" };
    let base = safe_name(name);
    let stamp = format!("{:04}{:02}{:02}-{:02}{:02}{:02}", t.y, t.mo, t.d, t.h, t.mi, t.s);
    let mut file = dir.join(format!("{base}.{stamp}.{ext}"));
    let mut n = 2;
    while file.exists() { file = dir.join(format!("{base}.{stamp}-{n}.{ext}")); n += 1; }
    let (bytes, _, _) = to_bytes(doc);
    let item = AutoItem {
        path: file.display().to_string(), name: name.into(), source: doc.source.clone(),
        at: format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", t.y, t.mo, t.d, t.h, t.mi, t.s), events: doc.events.len(), seq: next_seq(),
    };
    std::fs::write(&file, &bytes).map_err(|e| format!("บันทึกอัตโนมัติไม่สำเร็จ {e}"))?;
    let json = serde_json::to_vec_pretty(&item).map_err(|e| e.to_string())?;
    std::fs::write(format!("{}.json", file.display()), json).map_err(|e| format!("บันทึกอัตโนมัติไม่สำเร็จ {e}"))?;
    // เก่ากว่า 10 ฉบับของชื่อเดียวกัน ลบทิ้ง (ไฟล์ของโปรแกรมเอง ไม่ต้องลงถังขยะ)
    // ฉบับที่เพิ่งเขียนไม่ถูกตัดเสมอ นาฬิกาเครื่องถอยหลัง (ซิงก์เวลา) ลำดับของฉบับใหม่น้อยกว่าฉบับเก่า เดิมถูกลบทันทีหลังเขียน
    // ทั้งที่ตอบว่าบันทึกอัตโนมัติแล้ว (ผู้ช่วยตรวจทาน R11) · ตัดจากฉบับที่เหลือ เก็บรวม 10 ฉบับ
    let same: Vec<AutoItem> = list_autosaves(dir).into_iter().filter(|a| a.name == name && a.path != item.path).collect();
    if same.len() >= KEEP_AUTOSAVES {
        for old in &same[KEEP_AUTOSAVES - 1..] {
            let _ = std::fs::remove_file(&old.path);
            let _ = std::fs::remove_file(format!("{}.json", old.path));
        }
    }
    Ok(item)
}

/// ฉบับบันทึกอัตโนมัติทั้งหมด ใหม่สุดก่อน · อ่านจากไฟล์ .json ข้างไฟล์ซับ
pub fn list_autosaves(dir: &Path) -> Vec<AutoItem> {
    let mut out: Vec<AutoItem> = std::fs::read_dir(dir).map(|rd| rd.flatten().filter_map(|e| {
        let p = e.path();
        if p.extension()?.to_str()? != "json" { return None; }
        let item: AutoItem = serde_json::from_slice(&std::fs::read(&p).ok()?).ok()?;
        Path::new(&item.path).exists().then_some(item)
    }).collect()).unwrap_or_default();
    out.sort_by(|a, b| b.seq.cmp(&a.seq));
    out
}

#[tauri::command]
pub fn subdoc_autosave(app: AppHandle, doc: SubDoc, name: String) -> Result<AutoItem, String> {
    autosave_to(&autosave_dir(&app)?, &doc, &name)
}

#[tauri::command]
pub fn subdoc_autosaves(app: AppHandle) -> Result<Vec<AutoItem>, String> {
    Ok(list_autosaves(&autosave_dir(&app)?))
}

/// เปิดฉบับบันทึกอัตโนมัติ · ที่มาเป็นไฟล์เดิมที่แก้ (ขนาดกับเวลาแก้ล่าสุด) กดบันทึกแล้วเขียนทับไฟล์เดิม ไม่ใช่ฉบับอัตโนมัติ
/// ไฟล์เดิมหายไปแล้ว หรือเป็นซับในหนัง ที่มาเป็นแบบซับในหนัง ต้องบันทึกเป็นไฟล์ใหม่
pub fn open_autosave(dir: &Path, path: &Path) -> Result<SubDoc, String> {
    if path.parent() != Some(dir) { return Err("เปิดได้เฉพาะไฟล์ในโฟลเดอร์บันทึกอัตโนมัติ".into()); }
    let item: AutoItem = serde_json::from_slice(&std::fs::read(format!("{}.json", path.display())).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(path).map_err(|e| format!("อ่านฉบับบันทึกอัตโนมัติไม่ได้ {e}"))?;
    let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    let mut doc = parse_doc(&bytes, &ext, None);
    doc.source = match item.source {
        Some(s) if !s.in_movie && Path::new(&s.path).exists() => { let (size, mtime) = stamp(Path::new(&s.path)); Some(Source { size, mtime, ..s }) }
        // ซับในหนังเก็บขนาดกับเวลาแก้ของหนังตอนเปิดไว้ หนังเปลี่ยนไปแล้วใส่กลับเข้าหนังไม่ได้ (R3)
        Some(s) if s.in_movie => Some(s),
        // ไฟล์ซับเดิมหายไปแล้ว ยังเป็นไฟล์ซับ ไม่ใช่ซับในหนัง (เดิมตั้งเป็นในหนัง กดบันทึกแล้วไปทางใส่กลับเข้าหนังของหนังที่เปิดอยู่ · ผู้ช่วยตรวจทาน R1)
        // บันทึกทับได้ "missing" หน้าจอพาไปบันทึกเป็นไฟล์ใหม่
        Some(s) => Some(Source { size: 0, mtime: 0, ..s }),
        None => None,
    };
    Ok(doc)
}

#[tauri::command]
pub fn subdoc_open_autosave(app: AppHandle, path: String) -> Result<SubDoc, String> {
    open_autosave(&autosave_dir(&app)?, Path::new(&path))
}

// ---------------------------------------------------------------- เทส

#[cfg(test)]
mod tests {
    use super::*;

    fn media(name: &str) -> Option<PathBuf> {
        if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return None; }
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join(name);
        assert!(p.exists(), "ไม่มีไฟล์ทดสอบ {} · รัน node scripts/make-test-media.mjs ก่อน (หรือตั้ง MOVIE_SHELF_SKIP_MEDIA=1)", p.display());
        Some(p)
    }

    fn roundtrip(bytes: &[u8], hint: &str) -> SubDoc {
        let doc = parse_doc(bytes, hint, None);
        assert!(doc.exact, "เข้ารหัสกลับต้องได้ไบต์เดิม");
        let (out, _, bad) = to_bytes(&doc);
        assert_eq!(bad, None);
        assert!(out == bytes, "เปิดแล้วบันทึกโดยไม่แก้ต้องเหมือนเดิมทุกไบต์\nได้\n{}", String::from_utf8_lossy(&out));
        // ส่งผ่านหน้าจอ (JSON) แล้วกลับมายังเหมือนเดิม
        let back: SubDoc = serde_json::from_str(&serde_json::to_string(&doc).unwrap()).unwrap();
        assert!(to_bytes(&back).0 == bytes);
        doc
    }

    #[test]
    fn time_like_aegisub() {
        assert_eq!(parse_time("0:00:04.07"), 4070);
        assert_eq!(parse_time("00:00:04,070"), 4070);
        assert_eq!(parse_time("00:00:10,04"), 10040);
        assert_eq!(parse_time("01:02.5"), 62500);
        // ช่องเลเยอร์ที่เป็น Marked=0 ในไฟล์ ASS อ่านเป็นเลเยอร์ 0 แบบ Aegisub ไม่เป็นบรรทัดอ่านไม่ออก (R8)
        let fmt: Vec<String> = EVENT_FORMAT.iter().map(|s| s.to_string()).collect();
        let m = parse_event_line("Dialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,สวัสดี", &fmt).expect("ต้องอ่านได้");
        assert_eq!((m.layer, m.start, m.text.as_str()), (0, 1000, "สวัสดี"));
        // ตัวเลขยาวเกิน 19 หลักไม่ทำให้โปรแกรมพัง ได้เวลาสูงสุด (R14)
        assert_eq!(parse_time("99999999999999999999999:00:00.00"), MAX_MS);
        assert_eq!(parse_time("0:00:00.999999999999999999999999"), 999);
        assert_eq!(ass_time(4074), "0:00:04.07");
        assert_eq!(ass_time(4075), "0:00:04.08");
        assert_eq!(srt_time(3_723_004, ','), "01:02:03,004");
        assert_eq!(srt_time(3_723_004, '.'), "01:02:03.004");
    }

    /// ข้อ R5 ไฟล์ที่บรรทัดสุดท้ายไม่มีตัวขึ้นบรรทัด เพิ่มบรรทัดต่อท้าย หรือย้ายบรรทัดสุดท้ายขึ้นไปก่อน แล้วอ่านกลับต้องได้จำนวนบรรทัดและข้อความครบ
    #[test]
    fn no_final_newline_then_add_or_reorder() {
        let cases: [(&str, &str); 2] = [
            ("ass", "[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,สวัสดี\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,ลาก่อน"),
            ("srt", "1\n00:00:01,000 --> 00:00:02,000\nสวัสดี\n\n2\n00:00:03,000 --> 00:00:04,000\nลาก่อน"),
        ];
        for (kind, text) in cases {
            let d = parse_doc(text.as_bytes(), kind, None);
            assert_eq!(render(&d), text, "{kind} ไม่แก้ได้ไบต์เดิม");
            // เพิ่มบรรทัดต่อท้าย
            let mut add = d.clone();
            let mut e = add.events[1].clone();
            e.id = 99; e.start = 5000; e.end = 6000; e.text = "ใหม่".into(); e.raw = vec![]; e.pre = vec![]; e.ident = None;
            add.events.push(e);
            let back = parse_doc(render(&add).as_bytes(), kind, None);
            assert_eq!(back.events.iter().map(|x| x.text.as_str()).collect::<Vec<_>>(), ["สวัสดี", "ลาก่อน", "ใหม่"], "{kind} เพิ่มท้าย {:?}", render(&add));
            // ย้ายบรรทัดสุดท้ายขึ้นไปก่อน
            let mut mv = d.clone();
            mv.events.swap(0, 1);
            let back = parse_doc(render(&mv).as_bytes(), kind, None);
            assert_eq!(back.events.iter().map(|x| x.text.as_str()).collect::<Vec<_>>(), ["ลาก่อน", "สวัสดี"], "{kind} เรียงใหม่ {:?}", render(&mv));
        }
    }

    #[test]
    fn inline_roundtrips() {
        // ASS ตัวจบบรรทัดปน ไม่มีขึ้นบรรทัดท้ายไฟล์ บรรทัดเสีย บรรทัดความเห็น
        let ass = "[Script Info]\r\n; x\r\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: A,Arial,20\n\nStyle: B , Tahoma ,30\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,A,,0,0,0,,a, b\\Nc\nDialogue: broken\nComment: 1,0:00:03.00,0:00:04.00,B,x,0010,0,0,,cm";
        let d = roundtrip(ass.as_bytes(), "ass");
        assert_eq!(d.styles.len(), 2);
        assert_eq!(d.events.len(), 2);
        assert_eq!(d.bad, 1);
        assert_eq!(d.events[0].text, "a, b\\Nc");
        assert!(d.events[1].comment);
        assert_eq!(d.events[1].margin_l, 10);
        // SRT บรรทัดว่างกลางข้อความ ไม่มีเลขลำดับ ขึ้นต้นด้วยบรรทัดว่าง
        let srt = "\n1\n00:00:01,000 --> 00:00:02,000\nบรรทัด\n\nต่อ\n\n00:00:03,000 --> 00:00:04,500  X1:10\nไม่มีเลข\n\n\n";
        let d = roundtrip(srt.as_bytes(), "srt");
        assert_eq!(d.events.len(), 2);
        assert_eq!(d.events[0].text, "บรรทัด\n\nต่อ");
        assert_eq!(d.events[1].ident, None);
        assert_eq!(d.events[1].suffix, "  X1:10");
        // VTT หัวไฟล์ NOTE ชื่อบรรทัด ค่าตั้งตำแหน่ง
        let vtt = "WEBVTT\n\nNOTE ทดสอบ\nสองบรรทัด\n\nintro\n00:01.000 --> 00:02.000 align:start\nhi\n";
        let d = roundtrip(vtt.as_bytes(), "vtt");
        assert_eq!(d.events.len(), 1);
        assert_eq!(d.events[0].ident.as_deref(), Some("intro"));
        assert_eq!(d.events[0].start, 1000);
    }

    #[test]
    fn edit_one_line_keeps_the_rest() {
        let ass = "[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0000,0000,0000,,one\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0000,0000,0000,,two\n";
        let mut d = parse_doc(ass.as_bytes(), "ass", None);
        d.events[1].text = "สอง".into();
        d.events[1].start = 3456;
        d.events[1].actor = "a,b".into();
        let out = render(&d);
        assert!(out.contains("Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0000,0000,0000,,one\n"), "บรรทัดที่ไม่ได้แก้ต้องเหมือนเดิม");
        assert!(out.contains("Dialogue: 0,0:00:03.46,0:00:04.00,Default,a;b,0,0,0,,สอง\n"), "{out}");
        // ลบบรรทัดแรก เพิ่มบรรทัดใหม่ท้าย
        d.events.remove(0);
        d.events.push(Event { id: 99, start: 5000, end: 6000, style: "Default".into(), text: "ใหม่".into(), ..Default::default() });
        let out = render(&d);
        assert!(!out.contains(",one"));
        assert!(out.ends_with("Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,ใหม่\n"), "{out}");
        // SRT แก้ข้อความบรรทัดเดียว เลขลำดับเรียงใหม่ตอนลบ
        let srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nหนึ่ง\r\n\r\n2\r\n00:00:03,000-->00:00:04,000\r\nสอง\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nสาม\r\n";
        let mut d = parse_doc(srt.as_bytes(), "srt", None);
        d.events[2].text = "สาม\nสี่".into();
        let out = render(&d);
        assert!(out.contains("00:00:03,000-->00:00:04,000\r\nสอง"), "บรรทัดเวลาที่ไม่ได้แก้คงรูปเดิม");
        assert!(out.ends_with("3\r\n00:00:05,000 --> 00:00:06,000\r\nสาม\r\nสี่\r\n"), "{out:?}");
        d.events.remove(0);
        let out = render(&d);
        assert!(out.starts_with("1\r\n00:00:03,000-->00:00:04,000\r\nสอง\r\n\r\n2\r\n"), "{out:?}");
        // เลขเดิมไม่เรียง (ไฟล์ตัดต่อมา) คงเลขเดิมทุกบรรทัด บรรทัดใหม่ได้เลขตามตำแหน่ง
        let odd = "82\n00:00:01,000 --> 00:00:02,000\nก\n\n57\n00:00:03,000 --> 00:00:04,000\nข\n";
        let mut d = parse_doc(odd.as_bytes(), "srt", None);
        assert!(!d.renumber);
        d.events.remove(0);
        d.events.push(Event { id: 9, start: 5000, end: 6000, text: "ค".into(), ..Default::default() });
        assert_eq!(render(&d), "57\n00:00:03,000 --> 00:00:04,000\nข\n\n2\n00:00:05,000 --> 00:00:06,000\nค\n");
    }

    #[test]
    fn charsets_keep_bytes() {
        // ตัวพิเศษของ CP874 (… “ ”) เข้ารหัสไปกลับได้
        let sp = Enc { charset: "TIS-620".into(), bom: false };
        assert_eq!(decode_as(&encode("ไทย … “x”", &sp).unwrap(), "TIS-620").0, "ไทย … “x”");
        let th = "1\r\n00:00:01,000 --> 00:00:02,000\r\nสวัสดีชาวไทยทุกคน\r\n";
        let enc = Enc { charset: "TIS-620".into(), bom: false };
        let b = encode(th, &enc).unwrap();
        let d = roundtrip(&b, "srt");
        assert_eq!(d.enc, enc);
        let u16 = encode(th, &Enc { charset: "UTF-16LE".into(), bom: true }).unwrap();
        assert_eq!(roundtrip(&u16, "srt").enc.charset, "UTF-16LE");
        let be = encode(th, &Enc { charset: "UTF-16BE".into(), bom: true }).unwrap();
        assert_eq!(roundtrip(&be, "srt").enc.charset, "UTF-16BE");
        let fr = encode("1\n00:00:01,000 --> 00:00:02,000\nÉté à Paris — œuvre\n", &Enc { charset: "Windows-1252".into(), bom: false }).unwrap();
        assert_eq!(roundtrip(&fr, "srt").enc.charset, "Windows-1252");
        // ตัวที่ TIS-620 เก็บไม่ได้ บันทึกเป็น UTF-8 มี BOM แล้วบอกตัวนั้น
        let mut d = parse_doc(&b, "srt", None);
        d.events[0].text = "ไทย 日本".into();
        let (out, enc, bad) = to_bytes(&d);
        assert_eq!(bad, Some('日'));
        assert_eq!(enc.charset, "UTF-8");
        assert!(out.starts_with(&[0xEF, 0xBB, 0xBF]));
        // ไฟล์ที่มีไบต์เสียเข้ารหัสกลับไม่ได้ไบต์เดิม ต้องติดป้าย
        let mut bad_th = encode("1\n00:00:01,000 --> 00:00:02,000\nสวัสดีครับผมชื่อดาว", &enc).unwrap();
        bad_th.push(0xDB);
        assert!(!parse_doc(&bad_th, "srt", None).exact, "ไบต์ 0xDB ไม่มีใน TIS-620 เข้ารหัสกลับไม่ได้ ต้องเตือน");
    }

    #[test]
    fn tags_between_srt_and_ass() {
        assert_eq!(srt_to_ass_text("<i>เอียง</i> <b>หนา</b>\nสอง"), "{\\i1}เอียง{\\i} {\\b1}หนา{\\b}\\Nสอง");
        assert_eq!(srt_to_ass_text("<font color=\"#FFA000\">ส้ม</font>"), "{\\c&H00A0FF&}ส้ม{\\c}");
        assert_eq!(srt_to_ass_text("<font face='Leelawadee UI'><font size=\"30\">x</font></font>"), "{\\fnLeelawadee UI\\fs30}x{\\fs\\fn}");
        assert_eq!(srt_to_ass_text("a <unknown> b"), "a <unknown> b");
        assert_eq!(ass_to_srt_text("{\\i1}เอียง{\\i0} และ{\\b1\\fs40}หนา\\Nบรรทัด"), "<i>เอียง</i> และ<b>หนา\nบรรทัด</b>");
        assert_eq!(ass_to_srt_text("{\\pos(1,2)\\bord3\\blur2}ป้าย{\\p1}m 0 0 l 1 1{\\p0} จบ"), "ป้าย จบ");
    }

    #[test]
    fn ass_to_srt_reports_loss() {
        let Some(p) = media("ฉากตัด (2025).th.ass") else { return };
        let d = parse_doc(&std::fs::read(&p).unwrap(), "ass", None);
        let (s, lost) = to_srt(&d);
        let keys: Vec<&str> = lost.iter().map(|l| l.key.as_str()).collect();
        for k in ["comment", "actor", "layer", "style", "effect", "margin", "tags", "fonts"] { assert!(keys.contains(&k), "ต้องเตือนว่า {k} หาย ได้ {keys:?}"); }
        assert_eq!(s.events.len(), 6, "บรรทัดความคิดเห็นหาย เหลือ 6");
        assert!(s.events.windows(2).all(|w| w[0].start <= w[1].start), "เรียงตามเวลาเริ่ม");
        let out = render(&s);
        assert!(out.starts_with("1\r\n00:00:00,500 --> 00:00:03,400\r\nสวัสดีค่ะ"), "{out}");
        assert!(out.contains("ฉากที่สอง<i>ตัวเอียง</i> และ<b>ตัวหนา</b>\r\nขึ้นบรรทัดใหม่"));
        // SRT กลับเป็น ASS อ่านซ้ำได้ ตัวหนาตัวเอียงยังอยู่
        let a = to_ass(&s, (1280, 720));
        let back = parse_doc(render(&a).as_bytes(), "ass", None);
        assert_eq!(back.events.len(), 6);
        assert!(back.events.iter().any(|e| e.text.contains("{\\i1}ตัวเอียง{\\i}")));
        assert!(render(&a).contains("PlayResY: 720"));
    }

    #[test]
    fn test_media_roundtrips() {
        for name in ["ฉากตัด (2025).th.ass", "ฉากตัด (2025).bom-crlf.th.ass", "ฉากตัด (2025).th.srt", "ฉากตัด (2025).utf16.th.srt", "ฉากตัด (2025).tis620.th.srt", "ยาว 2000 บรรทัด.th.srt"] {
            let Some(p) = media(name) else { return };
            let ext = p.extension().unwrap().to_string_lossy().to_string();
            let d = roundtrip(&std::fs::read(&p).unwrap(), &ext);
            assert_eq!(d.bad, 0, "{name} อ่านออกทุกบรรทัด");
            match name {
                n if n.contains("2000") => assert_eq!(d.events.len(), 2000),
                n if n.ends_with(".ass") => {
                    assert_eq!((d.styles.len(), d.events.len()), (3, 7), "{name}");
                    assert_eq!(d.styles[1].fields[0], "ป้ายในฉาก");
                    let e = &d.events[4];
                    assert_eq!((e.actor.as_str(), e.margin_l, e.margin_r, e.margin_v), ("ดาว", 25, 30, 48));
                    assert_eq!(d.events[5].effect, "Banner;12;0;30");
                    assert_eq!(d.events[5].layer, 2);
                    assert!(d.events[3].comment);
                    assert!(d.skeleton.iter().any(|i| matches!(i, Item::Line { t, .. } if t == "[Aegisub Extradata]")));
                }
                _ => {
                    assert_eq!(d.events.len(), 5, "{name}");
                    assert_eq!(d.events[1].text, "ฉากที่สอง<i>ตัวเอียง</i> และ<b>ตัวหนา</b>\nขึ้นบรรทัดใหม่");
                }
            }
        }
        // ไฟล์ซับตัวอย่างของ FFmpeg ถ้ามี (ไม่ขึ้น git) · ไฟล์ที่เข้ารหัสกลับได้ต้องบันทึกกลับเหมือนเดิม ไฟล์ที่ไม่ได้ต้องติดป้าย exact
        let ff = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("ซับตัวอย่าง-ffmpeg");
        let (mut same, mut flagged) = (Vec::new(), Vec::new());
        if let Ok(rd) = std::fs::read_dir(&ff) {
            for f in rd.flatten() {
                let p = f.path();
                let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
                if !matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt") { continue; }
                let b = std::fs::read(&p).unwrap();
                let d = parse_doc(&b, &ext, None);
                let name = p.file_name().unwrap().to_string_lossy().to_string();
                if d.exact { assert!(to_bytes(&d).0 == b, "{name} เปิดแล้วบันทึกต้องเหมือนเดิม"); same.push(format!("{name} {} บรรทัด", d.events.len())); } else { flagged.push(name); }
            }
            println!("ไฟล์ตัวอย่าง FFmpeg บันทึกกลับเหมือนเดิม {} ไฟล์ {same:?} · ติดป้ายเข้ารหัสกลับไม่ได้ {flagged:?}", same.len());
            assert!(!same.is_empty());
        }
    }

    /// ซับในหนังดึงด้วย mkvextract แล้วบันทึกกลับต้องได้ข้อความเดียวกับที่ดึงออกมาทุกไบต์ (ไม่ใช่ไฟล์ต้นทาง ดู test-media/README.md)
    #[test]
    fn movie_tracks_roundtrip() {
        let Some(m) = media("ฉากตัด (2025).mkv") else { return };
        let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        let work = std::env::temp_dir();
        for (tid, kind, n) in [(2, "ass", 7), (3, "srt", 5)] {
            let (b, hint) = crate::subs::bytes_of(&tools, &work, &m, true, tid, 0).unwrap();
            let d = roundtrip(&b, &hint);
            assert_eq!((d.kind.as_str(), d.events.len()), (kind, n), "แทร็ก {tid}");
        }
    }

    #[test]
    fn save_replaces_and_keeps_others() {
        if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return; }
        let dir = std::env::temp_dir().join(format!("ชั้นหนัง-subdoc-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("ทดสอบ.th.srt");
        std::fs::write(&f, "1\r\n00:00:01,000 --> 00:00:02,000\r\nเดิม\r\n").unwrap();
        let other = dir.join("ทดสอบ (2).th.srt");
        std::fs::write(&other, "ห้ามโดนทับ").unwrap();
        let mut d = parse_doc(&std::fs::read(&f).unwrap(), "srt", None);
        let (size, mtime) = stamp(&f);
        d.source = Some(Source { path: f.display().to_string(), in_movie: false, size, mtime, tid: None });
        d.events[0].text = "ใหม่".into();
        // ไฟล์ใหม่ชื่อชน ต้องไม่ทับ
        assert_eq!(save(&d, &other, "new", false).unwrap_err(), "exists");
        assert_eq!(std::fs::read_to_string(&other).unwrap(), "ห้ามโดนทับ");
        // ไฟล์ถูกแก้จากที่อื่นหลังเปิด ต้องถามก่อน
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&f, "1\r\n00:00:01,000 --> 00:00:02,000\r\nมีคนแก้\r\n").unwrap();
        assert_eq!(save(&d, &f, "replace", false).unwrap_err(), "changed");
        let s = save(&d, &f, "replace", true).unwrap();
        assert_eq!(std::fs::read_to_string(&f).unwrap(), "1\r\n00:00:01,000 --> 00:00:02,000\r\nใหม่\r\n");
        assert_eq!(s.enc.charset, "UTF-8");
        // บันทึกเป็นไฟล์ใหม่ได้ ไม่มีไฟล์ .partial ค้าง
        let n = dir.join("ใหม่.ass");
        let a = to_ass(&d, (1920, 1080));
        save(&a, &n, "new", false).unwrap();
        assert!(n.exists());
        assert!(std::fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().ends_with(".partial")));
        // ซับในหนังบันทึกทับไม่ได้
        let mut m = d.clone();
        m.source = Some(Source { path: f.display().to_string(), in_movie: true, size: 0, mtime: 0, tid: Some(2) });
        assert!(save(&m, &f, "replace", false).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn autosave_keeps_ten_and_reopens_to_the_original() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนัง-autosave-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(&dir).unwrap();
        let orig = dir.join("เดิม.th.srt");
        std::fs::write(&orig, "1\n00:00:01,000 --> 00:00:02,000\nก\n").unwrap();
        let mut d = parse_doc(&std::fs::read(&orig).unwrap(), "srt", None);
        let (size, mtime) = stamp(&orig);
        d.source = Some(Source { path: orig.display().to_string(), in_movie: false, size, mtime, tid: None });
        let auto = dir.join("autosave");
        std::fs::create_dir_all(&auto).unwrap();
        for k in 0..12 {
            d.events[0].text = format!("แก้ครั้งที่ {k}");
            autosave_to(&auto, &d, "เดิม.th.srt").unwrap();
        }
        let other = autosave_to(&auto, &d, "อีกไฟล์.ass").unwrap();
        let list = list_autosaves(&auto);
        assert_eq!(list.iter().filter(|a| a.name == "เดิม.th.srt").count(), 10, "เก็บ 10 ฉบับล่าสุดต่อชื่อ");
        assert_eq!(list[0].path, other.path, "ใหม่สุดก่อน");
        let newest = list.iter().find(|a| a.name == "เดิม.th.srt").unwrap();
        // เปิดฉบับใหม่สุด ได้ข้อความล่าสุด ที่มาเป็นไฟล์เดิม
        let back = open_autosave(&auto, Path::new(&newest.path)).unwrap();
        assert_eq!(back.events[0].text, "แก้ครั้งที่ 11");
        assert_eq!(back.source.as_ref().unwrap().path, orig.display().to_string());
        assert!(!back.source.as_ref().unwrap().in_movie);
        // ไฟล์นอกโฟลเดอร์บันทึกอัตโนมัติเปิดผ่านทางนี้ไม่ได้
        assert!(open_autosave(&auto, &orig).is_err());
        // ไฟล์เดิมหายไป ยังเป็นไฟล์ซับ (ไม่ใช่ซับในหนัง) บันทึกทับได้ "missing" หน้าจอพาไปบันทึกเป็นไฟล์ใหม่ (R1)
        std::fs::remove_file(&orig).unwrap();
        let gone = open_autosave(&auto, Path::new(&newest.path)).unwrap();
        let gs = gone.source.clone().unwrap();
        assert!(!gs.in_movie);
        assert_eq!((gs.size, gs.mtime), (0, 0));
        assert_eq!(save(&gone, &orig, "replace", false).unwrap_err(), "missing");
        // ฉบับบันทึกอัตโนมัติของซับในหนังจำเลขแทร็กไว้ (F18)
        let mut mv = d.clone();
        mv.source = Some(Source { path: dir.join("หนัง.mkv").display().to_string(), in_movie: true, size: 0, mtime: 0, tid: Some(3) });
        let ma = autosave_to(&auto, &mv, "หนัง.mkv แทร็ก 3").unwrap();
        let back_movie = open_autosave(&auto, Path::new(&ma.path)).unwrap().source.unwrap();
        assert!(back_movie.in_movie);
        assert_eq!(back_movie.tid, Some(3));
        // นาฬิกาเครื่องถอยหลัง ฉบับเก่ามีลำดับมากกว่าฉบับใหม่ ฉบับที่เพิ่งเขียนต้องยังอยู่ และยังเก็บรวม 10 ฉบับ (R11)
        for a in list_autosaves(&auto) {
            let j = format!("{}.json", a.path);
            let mut v: serde_json::Value = serde_json::from_slice(&std::fs::read(&j).unwrap()).unwrap();
            v["seq"] = serde_json::json!(u64::MAX / 2 + a.seq);
            std::fs::write(&j, serde_json::to_vec(&v).unwrap()).unwrap();
        }
        let back_clock = autosave_to(&auto, &d, "เดิม.th.srt").unwrap();
        assert!(Path::new(&back_clock.path).exists(), "ฉบับที่เพิ่งเขียนถูกลบ");
        assert_eq!(list_autosaves(&auto).iter().filter(|a| a.name == "เดิม.th.srt").count(), 10);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
