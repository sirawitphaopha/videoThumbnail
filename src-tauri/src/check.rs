//! ตรวจไฟล์ (แผนขั้น 6 · สเปกข้อ 8 · TECH-REVIEW ข้อ 13)
//!
//! ตรวจแบบเร็ว  อ่านโครงไฟล์ว่าครบไหม ขาดท้ายไหม แล้วคิด SHA-256 ทั้งไฟล์เทียบกับที่จดไว้ครั้งก่อน
//! ตรวจละเอียด  ffprobe ถอดภาพเสียงทุกภาพ ข้อความผิดพลาดแปะมากับภาพที่ถอดตอนนั้น (-show_log) จึงรู้เวลาที่เสีย
//!              ห้ามใช้การ์ดจอช่วยถอดรหัส เพราะซ่อนที่เสีย (ffprobe ไม่ใช้การ์ดจอถ้าไม่สั่ง)
//!              ffmpeg -progress ใช้ไม่ได้ เวลาหยาบเกิน (ลองแล้ว ไฟล์ 60 วินาทีส่งความคืบหน้ามาแค่ 2 ครั้ง)
//! ผลตรวจเก็บลงคลังแบบรวม เขียนไฟล์คลังทุกราว 2 วินาทีกับตอนจบชุด ห้ามเขียนทีละเรื่อง (TECH-REVIEW ข้อ 12)

use std::collections::VecDeque;
use std::ffi::OsString;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::library::LibraryStore;
use crate::store::SettingsStore;

/// จุดเสียต่อกันห่างไม่เกินนี้ (วินาที) นับเป็นช่วงเดียว (TECH-REVIEW ข้อ 13)
pub const MERGE_GAP: f64 = 5.0;

/// ความยาวที่หัวไฟล์บอกเชื่อได้เฉพาะชนิดนี้ · TS M2TS MPG VOB บอกแบบประมาณ ห้ามใช้ตัดสินว่าขาดท้าย (TECH-REVIEW ข้อ 13)
const RELIABLE_LENGTH: [&str; 7] = ["mkv", "webm", "mp4", "mov", "m4v", "avi", "flv"];

/// ภาพเสียงจบก่อนความยาวที่หัวไฟล์บอกเกินนี้ (วินาที) = ขาดท้าย
const TAIL_TOLERANCE: f64 = 2.0;

// ---------- รวมจุดเสียเป็นช่วง ----------

/// จุดเสียหนึ่งจุดที่ตัวถอดรหัสเจอ · เวลาในเรื่อง (วินาที) และเสียที่ภาพหรือเสียง
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hit {
    pub at: f64,
    pub video: bool,
}

/// ช่วงที่เสีย หลังรวมจุดที่อยู่ใกล้กัน
#[derive(Debug, Clone, PartialEq)]
pub struct Spot {
    pub start: f64,
    pub end: f64,
    pub video: bool,
    pub audio: bool,
}

/// รวมจุดเสียเป็นช่วง · เรียงตามเวลาก่อน จุดถัดไปห่างจากท้ายช่วงไม่เกิน gap รวมเข้าช่วงเดิม
pub fn merge_hits(hits: &[Hit], gap: f64) -> Vec<Spot> {
    let mut sorted: Vec<Hit> = hits.iter().copied().filter(|h| h.at.is_finite() && h.at >= 0.0).collect();
    sorted.sort_by(|a, b| a.at.total_cmp(&b.at));
    let mut out: Vec<Spot> = Vec::new();
    for h in sorted {
        match out.last_mut() {
            Some(s) if h.at - s.end <= gap => {
                s.end = s.end.max(h.at);
                s.video |= h.video;
                s.audio |= !h.video;
            }
            _ => out.push(Spot { start: h.at, end: h.at, video: h.video, audio: !h.video }),
        }
    }
    out
}

/// เวลาแบบคนอ่าน · ไม่ถึงชั่วโมง `0:30` `12:05` · ตั้งแต่ชั่วโมง `1:12:30` · ปัดเศษวินาทีทิ้ง
pub fn fmt_time(secs: f64) -> String {
    let t = if secs.is_finite() && secs > 0.0 { secs.floor() as u64 } else { 0 };
    let (h, m, s) = (t / 3600, (t % 3600) / 60, t % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m}:{s:02}") }
}

/// คำบอกช่วงที่เสียในหน้าต่างผลตรวจ พร้อมความยาวของช่วง · คำตามต้นแบบบรรทัด 992–993
/// `ภาพแตกเป็นสี่เหลี่ยม 11 วินาที` · `เสียงเงียบหายไป 2 วินาที` · เสียทั้งสองอย่างเอาสองคำมาต่อกัน
fn spot_what(s: &Spot) -> String {
    let secs = ((s.end - s.start).ceil() as u64).max(1);
    let kind = match (s.video, s.audio) {
        (true, true) => "ภาพแตกเป็นสี่เหลี่ยมและเสียงเงียบหายไป",
        (true, false) => "ภาพแตกเป็นสี่เหลี่ยม",
        _ => "เสียงเงียบหายไป",
    };
    format!("{kind} {secs} วินาที")
}

fn spot_kind(s: &Spot) -> &'static str {
    match (s.video, s.audio) {
        (true, true) => "ภาพและเสียง",
        (true, false) => "ภาพ",
        _ => "เสียง",
    }
}

fn human(b: u64) -> String {
    if b >= 1 << 30 { format!("{:.2} GB", b as f64 / 1073741824.0) }
    else if b >= 1 << 20 { format!("{:.1} MB", b as f64 / 1048576.0) }
    else { format!("{:.0} KB", (b as f64 / 1024.0).max(1.0)) }
}

// ---------- โครงไฟล์ ----------

#[derive(Debug, Clone, PartialEq)]
pub enum Structure {
    Complete,
    /// ขาดท้าย · หายไปกี่ไบต์ (รู้เมื่อหัวไฟล์บอกขนาดไว้)
    Truncated(Option<u64>),
    /// โครงไฟล์เสีย บอกเหตุผล
    Broken(String),
    /// ตัดสินจากโครงไม่ได้ บอกเหตุผล
    Unknown(&'static str),
}

const UNKNOWN_TS: &str = "ไฟล์ชนิดนี้บอกความยาวแบบประมาณ ตรวจแบบเร็วบอกไม่ได้ว่าขาดท้าย";
const UNKNOWN_SIZE: &str = "หัวไฟล์ไม่ได้บอกขนาด ตรวจแบบเร็วบอกไม่ได้ว่าขาดท้าย";

fn ext_of(path: &Path) -> String {
    path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// อ่านโครงไฟล์ตามชนิด · อ่านแค่หัวกับหัวกล่อง ไม่อ่านทั้งไฟล์
pub fn structure(path: &Path) -> Result<Structure, String> {
    let mut f = File::open(path).map_err(|e| format!("เปิดไฟล์ไม่ได้: {e}"))?;
    let size = f.metadata().map_err(|e| format!("อ่านขนาดไฟล์ไม่ได้: {e}"))?.len();
    let r = match ext_of(path).as_str() {
        "mkv" | "webm" => ebml(&mut f, size),
        "mp4" | "mov" | "m4v" => boxes(&mut f, size),
        "avi" => riff(&mut f, size),
        "flv" => flv(&mut f, size),
        _ => Ok(Structure::Unknown(UNKNOWN_TS)),
    };
    r.map_err(|e| format!("อ่านโครงไฟล์ไม่ได้: {e}"))
}

fn read_at(f: &mut File, pos: u64, n: usize) -> std::io::Result<Vec<u8>> {
    f.seek(SeekFrom::Start(pos))?;
    let mut b = vec![0u8; n];
    let mut got = 0;
    while got < n {
        let k = f.read(&mut b[got..])?;
        if k == 0 {
            break;
        }
        got += k;
    }
    b.truncate(got);
    Ok(b)
}

/// ตัวเลขยาวแปรผันของ EBML · คืน (ค่า, ยาวกี่ไบต์, เป็นค่าพิเศษแปลว่าไม่ระบุขนาด)
fn vint(b: &[u8], i: usize) -> Option<(u64, usize, bool)> {
    let first = *b.get(i)?;
    if first == 0 {
        return None;
    }
    let len = first.leading_zeros() as usize + 1;
    if i + len > b.len() {
        return None;
    }
    let mask = (0xFFu16 >> len) as u8;
    let mut v = (first & mask) as u64;
    let mut ones = first & mask == mask;
    for k in 1..len {
        v = (v << 8) | b[i + k] as u64;
        ones &= b[i + k] == 0xFF;
    }
    Some((v, len, ones))
}

/// MKV WebM · หัว EBML ตามด้วย Segment ที่บอกขนาดเนื้อทั้งหมด · ขนาดพิเศษ (บิต 1 ทั้งหมด) แปลว่าไม่ระบุ ไม่ใช่ขาดท้าย
fn ebml(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let b = read_at(f, 0, 256)?;
    let broken = |w: &str| Ok(Structure::Broken(w.into()));
    if b.len() < 16 || b[..4] != [0x1A, 0x45, 0xDF, 0xA3] {
        return broken("หัวไฟล์ไม่ใช่แบบ MKV");
    }
    let Some((hs, hl, _)) = vint(&b, 4) else { return broken("หัวไฟล์เสีย") };
    let i = 4 + hl + hs as usize;
    if i + 5 > b.len() {
        return broken("หัวไฟล์เสีย");
    }
    if b[i..i + 4] != [0x18, 0x53, 0x80, 0x67] {
        return broken("ไม่เจอส่วนเนื้อหนังต่อจากหัวไฟล์");
    }
    let Some((ss, sl, unknown)) = vint(&b, i + 4) else { return broken("หัวไฟล์เสีย") };
    if unknown {
        return Ok(Structure::Unknown(UNKNOWN_SIZE));
    }
    let need = (i + 4 + sl) as u64 + ss;
    Ok(if size < need { Structure::Truncated(Some(need - size)) } else { Structure::Complete })
}

/// MP4 MOV M4V · กล่องชั้นบนสุดต่อกันจนจบไฟล์ กล่องไหนยาวเลยท้ายไฟล์ = ขาดท้าย · ต้องมีสารบัญ moov
fn boxes(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let (mut pos, mut moov) = (0u64, false);
    while pos < size {
        let h = read_at(f, pos, 16)?;
        if h.len() < 8 {
            return Ok(Structure::Truncated(None));
        }
        let mut len = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) as u64;
        let kind = [h[4], h[5], h[6], h[7]];
        if len == 1 {
            if h.len() < 16 {
                return Ok(Structure::Truncated(None));
            }
            len = u64::from_be_bytes([h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]]);
        } else if len == 0 {
            len = size - pos;
        }
        if len < 8 {
            return Ok(Structure::Broken(format!("ขนาดกล่อง {} เพี้ยน", String::from_utf8_lossy(&kind))));
        }
        if &kind == b"moov" {
            moov = true;
        }
        if pos + len > size {
            return Ok(Structure::Truncated(Some(pos + len - size)));
        }
        pos += len;
    }
    Ok(if moov { Structure::Complete } else { Structure::Broken("ไม่มีสารบัญของไฟล์ (moov) เล่นไม่ได้".into()) })
}

/// AVI · ก้อน RIFF ต่อกัน (ก้อนแรก AVI ก้อนต่อไป AVIX สำหรับไฟล์ใหญ่) ก้อนไหนยาวเลยท้ายไฟล์ = ขาดท้าย
fn riff(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let (mut pos, mut first) = (0u64, true);
    while pos + 12 <= size {
        let h = read_at(f, pos, 12)?;
        if &h[0..4] != b"RIFF" {
            if first {
                return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ AVI".into()));
            }
            break;
        }
        if first && &h[8..12] != b"AVI " {
            return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ AVI".into()));
        }
        let len = u32::from_le_bytes([h[4], h[5], h[6], h[7]]) as u64;
        let end = pos + 8 + len + (len & 1);
        // ก้อนสุดท้ายยาวคี่ บางโปรแกรมไม่เติมไบต์ปิดท้าย ไม่นับว่าขาด
        if end > size && !(len & 1 == 1 && end == size + 1) {
            return Ok(Structure::Truncated(Some(end - size)));
        }
        pos = end;
        first = false;
    }
    Ok(if first { Structure::Broken("ไฟล์สั้นผิดปกติ".into()) } else { Structure::Complete })
}

/// FLV · 4 ไบต์ท้ายไฟล์บอกความยาวก้อนสุดท้าย ย้อนไปต้องเจอหัวก้อนภาพ เสียง หรือข้อมูล ไม่เจอ = ท้ายไฟล์ไม่ครบ
fn flv(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let h = read_at(f, 0, 9)?;
    if h.len() < 9 || &h[0..3] != b"FLV" {
        return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ FLV".into()));
    }
    if size < 9 + 4 + 15 {
        return Ok(Structure::Truncated(None));
    }
    let t = read_at(f, size - 4, 4)?;
    let prev = u32::from_be_bytes([t[0], t[1], t[2], t[3]]) as u64;
    if prev == 0 || prev + 4 + 13 > size {
        return Ok(Structure::Truncated(None));
    }
    let ty = read_at(f, size - 4 - prev, 1)?.first().map(|b| b & 0x1F).unwrap_or(0);
    Ok(if [8, 9, 18].contains(&ty) { Structure::Complete } else { Structure::Truncated(None) })
}

fn truncated_text(missing: Option<u64>) -> String {
    match missing {
        Some(n) => format!("ไฟล์ขาดท้าย หายไปราว {} จากขนาดที่หัวไฟล์บอก · ไฟล์น่าจะโหลดมาไม่ครบ", human(n)),
        None => "ไฟล์ขาดท้าย ท้ายไฟล์ไม่ครบ · ไฟล์น่าจะโหลดมาไม่ครบ".into(),
    }
}

// ---------- ผลตรวจ ----------

/// ผลตรวจหนึ่งเรื่อง · sha256 = ค่าใหม่ที่จะจดลงคลัง · None = คงค่าเดิมไว้ (ไฟล์ถูกเปลี่ยนหรือเสีย ต้องเก็บค่าเดิมไว้เทียบ)
#[derive(Debug, Clone)]
pub struct Outcome {
    pub result: &'static str,
    pub summary: String,
    pub spans: Vec<Value>,
    pub sha256: Option<String>,
}

fn bad(summary: String, spans: Vec<Value>) -> Outcome {
    Outcome { result: "bad", summary, spans, sha256: None }
}

/// คิด SHA-256 ทั้งไฟล์ · None = กดหยุด · on ได้ 0–100
fn sha256(path: &Path, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<String>, String> {
    let algos = vec!["sha256".to_string()];
    let pct = |d: u64, t: u64| on(if t > 0 { d as f64 / t as f64 * 100.0 } else { 100.0 });
    Ok(match crate::hashes::compute(path, &algos, &pct, stop)? {
        crate::hashes::Outcome::Cancelled => None,
        crate::hashes::Outcome::Done(h) => h.sha256,
    })
}

/// ตรวจแบบเร็ว · โครงไฟล์ แล้วเทียบ SHA-256 กับที่จดไว้ · None = กดหยุด
pub fn quick(path: &Path, stored: Option<&str>, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Outcome>, String> {
    let s = structure(path)?;
    match &s {
        Structure::Truncated(m) => return Ok(Some(bad(truncated_text(*m), vec![]))),
        Structure::Broken(why) => return Ok(Some(bad(format!("โครงไฟล์เสีย {why}"), vec![]))),
        _ => {}
    }
    let Some(h) = sha256(path, on, stop)? else { return Ok(None) };
    let note = if let Structure::Unknown(w) = s { format!(" · {w}") } else { String::new() };
    Ok(Some(match stored {
        Some(old) if !old.eq_ignore_ascii_case(&h) => Outcome {
            result: "changed",
            summary: "ค่า hash ไม่ตรงกับตอนตรวจครั้งก่อน ไฟล์อาจเสียระหว่างย้ายไดรฟ์ ควรตรวจละเอียด".into(),
            spans: vec![],
            sha256: None,
        },
        Some(_) => Outcome { result: "ok", summary: format!("ตรวจแบบเร็ว โครงไฟล์ครบ ค่า hash ตรงกับครั้งก่อน{note}"), spans: vec![], sha256: Some(h) },
        None => Outcome { result: "ok", summary: format!("ตรวจแบบเร็ว โครงไฟล์ครบ จดค่า hash ไว้เทียบครั้งหน้า{note}"), spans: vec![], sha256: Some(h) },
    }))
}

/// สิ่งที่อ่านได้จากผล ffprobe หนึ่งบรรทัด · (เป็นบรรทัดของภาพหรือเสียงไหม, เวลา, เป็นภาพไหม, จำนวนข้อความผิดพลาดระดับ error ที่แปะมา)
/// ข้อความผิดพลาดอันที่สองของภาพเดียวกัน บางทีขึ้นบรรทัดใหม่ที่ไม่มี media_type ให้นับเป็นของภาพก่อนหน้า
fn parse_frame(line: &str) -> (bool, Option<f64>, bool, usize) {
    let mut kind = None;
    let mut t = None;
    let mut errs = 0;
    for part in line.split('|') {
        if let Some(v) = part.strip_prefix("media_type=") {
            kind = Some(v.trim());
        } else if let Some(v) = part.strip_prefix("best_effort_timestamp_time=") {
            t = v.trim().parse::<f64>().ok();
        }
        // ข้อความผิดพลาดหลายอันต่อกันในช่องเดียวโดยไม่มีตัวคั่น นับจากคำว่า level= ทุกที่
        for (i, _) in part.match_indices("level=") {
            let num: String = part[i + 6..].chars().take_while(|c| c.is_ascii_digit()).collect();
            if num.parse::<i32>().map(|n| n <= 16).unwrap_or(false) {
                errs += 1;
            }
        }
    }
    (kind.is_some(), t, kind == Some("video"), errs)
}

/// ตัวถอดรหัสเสียงที่ ffmpeg ใช้ · ชื่อในวงเล็บหน้าข้อความผิดพลาดตรงกับรายการนี้ = เสียที่เสียง
const AUDIO_DECODERS: [&str; 22] = ["aac", "aac_fixed", "ac3", "ac3_fixed", "eac3", "dca", "truehd", "mlp", "mp3", "mp3float", "mp2", "mp2float",
    "mp1", "opus", "libopus", "vorbis", "libvorbis", "flac", "alac", "wmav2", "wmapro", "amrnb"];

/// ข้อความผิดพลาดของ ffmpeg หนึ่งบรรทัด เสียที่ไหน · (ภาพ, เสียง) · None = ไม่ใช่ข้อความผิดพลาด (บรรทัดความคืบหน้า key=value)
fn error_kind(line: &str) -> Option<(bool, bool)> {
    let l = line.trim();
    // บรรทัดความคืบหน้าเป็น ชื่อ=ค่า ชื่อเป็นตัวเล็ก ตัวเลข ขีดล่าง · ค่ามีช่องว่างได้ เช่น speed= 100x (เคยนับเป็นข้อความผิดพลาด)
    let key = l.split('=').next().unwrap_or("");
    if l.is_empty() || (l.contains('=') && !key.is_empty() && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')) {
        return None;
    }
    let Some(ctx) = l.strip_prefix('[').and_then(|r| r.split(" @").next()) else { return Some((true, true)) };
    // [in#0/matroska,webm @ …] ตัวแยกไฟล์ · [vist#0:0/h264 @ …] [aist#0:1/aac @ …] บอกชนิดตรง ๆ · [h264 @ …] ตัวถอดรหัส
    let name = ctx.rsplit('/').next().unwrap_or(ctx);
    if ctx.starts_with("aist#") {
        return Some((false, true));
    }
    if ctx.starts_with("vist#") {
        return Some((true, false));
    }
    if ctx.starts_with("in#") || name.contains(',') {
        return Some((true, true));
    }
    let audio = AUDIO_DECODERS.contains(&name) || name.starts_with("pcm_") || name.starts_with("adpcm_");
    Some((!audio, audio))
}

/// ผลรอบแรก · จุดเสียแบบคร่าว (เวลาตามความคืบหน้าล่าสุด) · ภาพเสียงถอดได้ถึงวินาทีไหน · ffmpeg ส่งความคืบหน้ามาไหม
#[derive(Default)]
struct Rough {
    hits: Vec<Hit>,
    last: f64,
    progressed: bool,
}

/// รอบแรก ffmpeg ถอดทุกภาพแบบหลายเส้นทำงาน (เร็ว) · ความคืบหน้ากับข้อความผิดพลาดออกช่องเดียวกันตามลำดับ (-progress pipe:2)
/// เวลาของจุดเสียคือความคืบหน้าล่าสุดก่อนข้อความนั้น คลาดได้ไม่กี่วินาที รอบสองค่อยหาเวลาแม่น
/// ffprobe แบบหลายเส้นทำงานใช้แทนไม่ได้ ข้อความผิดพลาดไม่แปะกับภาพ (ลองแล้ว จับไม่ได้เลย)
/// ตำแหน่งไบต์ในข้อความผิดพลาดของตัวแยกไฟล์ เช่น "0x00 at pos 24464080 (0x1754ad0) invalid …"
fn byte_pos(line: &str) -> Option<u64> {
    let i = line.find("pos ")?;
    let num: String = line[i + 4..].chars().take_while(|c| c.is_ascii_digit()).collect();
    num.parse().ok()
}

fn rough_pass(tools: &Path, path: &Path, total: Option<f64>, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Rough>, String> {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let args: Vec<OsString> = vec![
        "-nostdin".into(), "-hide_banner".into(), "-n".into(), "-v".into(), "error".into(), "-progress".into(), "pipe:2".into(),
        "-stats_period".into(), "0.05".into(), "-i".into(), path.into(), "-map".into(), "0:V?".into(), "-map".into(), "0:a?".into(),
        "-f".into(), "null".into(), "-".into(),
    ];
    let mut child = crate::tools::tool_command(tools, "ffmpeg", &args).stdout(Stdio::null()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let err = child.stderr.take().unwrap();
    let state = Arc::new(Mutex::new((Rough::default(), VecDeque::<String>::new())));
    let st = state.clone();
    let reader = std::thread::spawn(move || {
        for l in BufReader::new(err).lines().map_while(Result::ok) {
            let mut g = st.lock().unwrap();
            let (r, tail) = &mut *g;
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok()) {
                r.last = r.last.max(us / 1_000_000.0);
                r.progressed = true;
                continue;
            }
            if let Some((video, audio)) = error_kind(&l) {
                // ตัวแยกไฟล์อ่านนำหน้าตัวถอดรหัสไปไกล ตอนเครื่องทำงานหนักนำได้หลายสิบวินาที (เทสเจอที่ 2.6 ทั้งที่เสียที่ 30)
                // ข้อความที่บอกตำแหน่งไบต์ คิดเวลาจากตำแหน่งเทียบขนาดไฟล์แทนความคืบหน้า รอบสองค่อยหาเวลาแม่น
                let at = match (video && audio, byte_pos(&l), total) {
                    (true, Some(pos), Some(d)) if size > 0 => pos as f64 / size as f64 * d,
                    _ => r.last,
                };
                if video { r.hits.push(Hit { at, video: true }); }
                if audio { r.hits.push(Hit { at, video: false }); }
                tail.push_back(l);
                if tail.len() > 20 { tail.pop_front(); }
            }
        }
    });
    let status = loop {
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Ok(None);
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            break st;
        }
        if let Some(d) = total {
            let last = state.lock().unwrap().0.last;
            on((last / d * 100.0).min(100.0));
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let _ = reader.join();
    let (rough, tail) = std::mem::take(&mut *state.lock().unwrap());
    if !rough.progressed || (rough.last <= 0.0 && !crate::tools::tool_succeeded("ffmpeg", &status)) {
        let why = tail.back().cloned().unwrap_or_else(|| format!("รหัส {}", crate::tools::exit_text(&status)));
        return Err(format!("ffmpeg อ่านภาพเสียงในไฟล์ไม่ได้เลย · {why}"));
    }
    Ok(Some(rough))
}

/// รอบสอง ffprobe ถอดแบบเส้นเดียวเฉพาะช่วง from–to · ข้อความผิดพลาดแปะมากับภาพที่ถอดตอนนั้น ได้เวลาแม่นทุกภาพ
fn exact_pass(tools: &Path, path: &Path, from: f64, to: f64) -> Result<Vec<Hit>, String> {
    let args: Vec<OsString> = vec![
        "-v".into(), "error".into(), "-read_intervals".into(), format!("{from:.3}%{to:.3}").into(), "-show_log".into(), "16".into(),
        "-show_entries".into(), "frame=media_type,best_effort_timestamp_time:log=context,level".into(),
        "-of".into(), "compact=p=0".into(), path.into(),
    ];
    let out = crate::tools::run_tool_timeout(tools, "ffprobe", &args, Duration::from_secs(600))?;
    let mut hits = Vec::new();
    let (mut last_t, mut last_video) = (from, true);
    for l in String::from_utf8_lossy(&out.stdout).lines() {
        let (frame, t, video, errs) = parse_frame(l);
        if frame {
            if let Some(t) = t { last_t = t; }
            last_video = video;
        }
        for _ in 0..errs {
            hits.push(Hit { at: last_t, video: last_video });
        }
    }
    Ok(hits)
}

/// ตรวจละเอียด · สองรอบ หาจุดเสียคร่าวทั้งเรื่องแบบเร็ว แล้วหาเวลาแม่นเฉพาะรอบจุดที่เจอ · ไม่เสียคิด SHA-256 จดไว้
/// None = กดหยุด · on ได้ 0–100 (รอบแรก 0–85 รอบสอง 85–90 คิด hash 90–100)
pub fn deep(tools: &Path, path: &Path, length: Option<f64>, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Outcome>, String> {
    let s = structure(path)?;
    let total = length.filter(|d| d.is_finite() && *d > 0.0);
    let Some(rough) = rough_pass(tools, path, total, &|p| on(p * 0.85), stop)? else { return Ok(None) };
    let short_tail = RELIABLE_LENGTH.contains(&ext_of(path).as_str())
        && total.map(|d| rough.last < d - TAIL_TOLERANCE).unwrap_or(false);
    let truncated = short_tail || matches!(s, Structure::Truncated(_));
    let rough_spots = merge_hits(&rough.hits, MERGE_GAP);
    let mut hits = Vec::new();
    for (k, sp) in rough_spots.iter().enumerate() {
        if stop() {
            return Ok(None);
        }
        // ความคืบหน้าตามหลังตัวถอดรหัส จุดจริงอยู่หลังเวลาคร่าวได้ไม่กี่วินาที
        let exact = exact_pass(tools, path, (sp.start - 5.0).max(0.0), sp.end + 15.0)?;
        if !exact.is_empty() {
            hits.extend(exact);
        } else if !(truncated && sp.start >= rough.last - 10.0) {
            hits.extend(rough.hits.iter().filter(|h| h.at >= sp.start && h.at <= sp.end).copied());
        }
        // ไฟล์ขาดท้าย ข้อความผิดพลาดตรงที่ไฟล์ถูกตัดหาเวลาแม่นไม่ได้ เวลาคร่าวแกว่งตามความเร็วเครื่อง (เทสได้ 0:40 กับ 0:35)
        // ไม่นับเป็นจุดเสียแยก ช่วงขาดท้ายข้างล่างบอกแล้วว่าภาพเสียงจบที่ไหน
        on(85.0 + 5.0 * (k + 1) as f64 / rough_spots.len() as f64);
    }
    let scan = rough;

    let spots = merge_hits(&hits, MERGE_GAP);
    let mut spans: Vec<Value> = spots.iter().map(|s| json!({ "from": s.start, "to": s.end, "what": spot_what(s) })).collect();
    if truncated {
        let from = scan.last;
        let what = match total {
            Some(d) if short_tail => format!("ขาดท้าย ภาพเสียงจบที่ {} จากความยาว {}", fmt_time(from), fmt_time(d)),
            _ => truncated_text(match s { Structure::Truncated(m) => m, _ => None }),
        };
        spans.push(json!({ "from": from, "to": total.unwrap_or(from), "what": what, "tail": true }));
    }
    if let Structure::Broken(why) = &s {
        return Ok(Some(bad(format!("โครงไฟล์เสีย {why}"), spans)));
    }
    if !spots.is_empty() || truncated {
        let summary = match (spots.len(), truncated) {
            (0, _) => match total {
                Some(d) if short_tail => format!("ไฟล์ขาดท้าย เล่นได้ถึง {} จากความยาว {}", fmt_time(scan.last), fmt_time(d)),
                _ => truncated_text(match s { Structure::Truncated(m) => m, _ => None }),
            },
            (1, t) => {
                let sp = &spots[0];
                let at = if fmt_time(sp.start) == fmt_time(sp.end) {
                    format!("{}เสียที่นาที {}", spot_kind(sp), fmt_time(sp.start))
                } else {
                    format!("{}เสียช่วงนาที {} ถึง {}", spot_kind(sp), fmt_time(sp.start), fmt_time(sp.end))
                };
                if t { format!("{at} · และไฟล์ขาดท้าย") } else { at }
            }
            (n, t) => format!("เสีย {n} ช่วง ช่วงแรกที่นาที {}{}", fmt_time(spots[0].start), if t { " · และไฟล์ขาดท้าย" } else { "" }),
        };
        return Ok(Some(bad(summary, spans)));
    }
    // ไม่เสีย · จดค่า hash ใหม่ไว้เทียบตอนตรวจแบบเร็วครั้งหน้า (ไฟล์ที่ขึ้นว่าถูกเปลี่ยน ตรวจละเอียดผ่านแล้วถือค่าใหม่)
    let Some(h) = sha256(path, &|p| on(90.0 + p * 0.1), stop)? else { return Ok(None) };
    Ok(Some(Outcome { result: "ok", summary: "ตรวจละเอียด ไม่พบที่เสีย".into(), spans: vec![], sha256: Some(h) }))
}

// ---------- คิวตรวจ ----------

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckProgress {
    id: String,
    percent: f64,
    index: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckItem {
    id: String,
    error: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckFinished {
    mode: String,
    total: usize,
    done: usize,
    ok: usize,
    bad: usize,
    changed: usize,
    failed: usize,
    cancelled: bool,
    seconds: f64,
    at: i64,
}

#[tauri::command]
pub fn check_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn check_cancel() {
    STOP.store(true, Ordering::SeqCst);
}

/// เริ่มตรวจเรื่องที่เลือกทีละเรื่องตามลำดับ เบื้องหลัง
/// เหตุการณ์ check-started · check-progress (ไม่เกินราว 10 ครั้งต่อวินาที) · movie-updated · check-item · check-finished
#[tauri::command]
pub fn check_start(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, ids: Vec<String>, mode: String) -> Result<(), String> {
    if ids.is_empty() {
        return Err("ยังไม่ได้เลือกเรื่องที่จะตรวจ".into());
    }
    if mode != "quick" && mode != "full" {
        return Err(format!("ไม่รู้จักแบบตรวจ {mode}"));
    }
    let tools = crate::tools::tools_dir(&app)?;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("กำลังตรวจชุดก่อนอยู่ รอให้เสร็จ หรือกดหยุดตรวจทั้งชุดก่อน".into());
    }
    STOP.store(false, Ordering::SeqCst);
    let lib = lib.inner().clone();
    std::thread::spawn(move || {
        let r = run_batch(&app, &lib, &tools, &ids, &mode);
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("check-finished", r);
    });
    Ok(())
}

fn run_batch(app: &AppHandle, lib: &LibraryStore, tools: &Path, ids: &[String], mode: &str) -> CheckFinished {
    let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
    let _guard = jobs.start();
    let t0 = Instant::now();
    let mut r = CheckFinished { mode: mode.into(), total: ids.len(), ..Default::default() };
    let _ = app.emit("check-started", json!({ "ids": ids, "mode": mode }));
    let mut dirty = false;
    let mut last_save = Instant::now();
    let save = |dirty: &mut bool| {
        if *dirty {
            if let Err(e) = lib.save() {
                let _ = app.emit("library-error", e);
            }
            *dirty = false;
        }
    };
    for (index, id) in ids.iter().enumerate() {
        if STOP.load(Ordering::SeqCst) || jobs.cancelled() {
            r.cancelled = true;
            break;
        }
        let fail = |r: &mut CheckFinished, e: String| {
            r.failed += 1;
            let _ = app.emit("check-item", CheckItem { id: id.clone(), error: Some(e) });
        };
        let Some(m) = lib.movies.lock().unwrap().iter().find(|m| &m.id == id).cloned() else {
            fail(&mut r, "ไม่เจอเรื่องนี้ในคลังแล้ว".into());
            continue;
        };
        let path = PathBuf::from(&m.path);
        if !path.exists() {
            fail(&mut r, "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
            continue;
        }
        let last_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
        let total = ids.len();
        let on = |percent: f64| {
            let mut l = last_emit.lock().unwrap();
            if l.elapsed() >= Duration::from_millis(100) {
                *l = Instant::now();
                let _ = app.emit("check-progress", CheckProgress { id: id.clone(), percent: percent.clamp(0.0, 100.0), index, total });
            }
        };
        on(0.0);
        let stop = || STOP.load(Ordering::SeqCst) || jobs.cancelled();
        let res = if mode == "quick" { quick(&path, m.sha256.as_deref(), &on, &stop) } else { deep(tools, &path, m.duration, &on, &stop) };
        match res {
            Ok(None) => {
                r.cancelled = true;
                break;
            }
            Err(e) => fail(&mut r, e),
            Ok(Some(o)) => {
                let info = json!({ "at": now(), "mode": mode, "result": o.result, "summary": o.summary, "spans": o.spans });
                let updated = lib.update_movie(id, |x| {
                    x.status = o.result.into();
                    x.check = Some(info);
                    if let Some(h) = &o.sha256 {
                        x.sha256 = Some(h.clone());
                    }
                });
                if let Some(u) = updated {
                    let _ = app.emit("movie-updated", &u);
                }
                match o.result { "ok" => r.ok += 1, "bad" => r.bad += 1, _ => r.changed += 1 }
                r.done += 1;
                dirty = true;
                let _ = app.emit("check-item", CheckItem { id: id.clone(), error: None });
                if last_save.elapsed() >= Duration::from_secs(2) {
                    save(&mut dirty);
                    last_save = Instant::now();
                }
            }
        }
    }
    save(&mut dirty);
    r.seconds = t0.elapsed().as_secs_f64();
    r.at = now();
    r
}

// ---------- เปิดเล่นที่นาที ----------

/// ข้อโต้แย้งให้โปรแกรมเล่นเปิดตรงเวลา · None = โปรแกรมนี้เปิดตรงนาทีจากคำสั่งไม่ได้ (หรือไม่รู้จัก)
/// VLC `--start-time=วินาที` · MPC-HC MPC-BE `/start มิลลิวินาที` · PotPlayer `/seek=ชม:นาที:วินาที` · mpv `--start=วินาที`
pub fn seek_args(player: &Path, file: &Path, secs: f64) -> Option<Vec<OsString>> {
    let name = player.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let s = if secs.is_finite() && secs > 0.0 { secs.floor() as u64 } else { 0 };
    let f: OsString = file.into();
    if name.contains("vlc") {
        Some(vec![format!("--start-time={s}").into(), f])
    } else if name.contains("mpc-hc") || name.contains("mpc-be") {
        Some(vec![f, "/start".into(), (s * 1000).to_string().into()])
    } else if name.contains("potplayer") {
        Some(vec![f, format!("/seek={:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60).into()])
    } else if name.contains("mpv") {
        Some(vec![format!("--start={s}").into(), f])
    } else {
        None
    }
}

/// หาโปรแกรมเล่นที่เปิดตรงนาทีได้ ที่ลงไว้ในเครื่อง
fn find_player() -> Option<PathBuf> {
    let mut roots: Vec<PathBuf> = ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"].iter().filter_map(|k| std::env::var_os(k).map(PathBuf::from)).collect();
    if let Some(l) = std::env::var_os("LOCALAPPDATA") {
        roots.push(PathBuf::from(l).join("Programs"));
    }
    // K-Lite Codec Pack วาง MPC-HC ไว้ในโฟลเดอร์ของตัวเอง (เจอบนเครื่องพี่กัน 7 พ.ย. 2569 · Program Files (x86)\K-Lite Codec Pack\MPC-HC64)
    let rel = ["VideoLAN/VLC/vlc.exe", "MPC-HC/mpc-hc64.exe", "MPC-HC/mpc-hc.exe", "K-Lite Codec Pack/MPC-HC64/mpc-hc64.exe", "K-Lite Codec Pack/MPC-HC/mpc-hc.exe",
        "MPC-BE x64/mpc-be64.exe", "MPC-BE/mpc-be.exe", "DAUM/PotPlayer/PotPlayerMini64.exe", "DAUM/PotPlayer/PotPlayerMini.exe", "mpv/mpv.exe"];
    for r in &roots {
        for p in rel {
            let c = r.join(p);
            if c.exists() {
                return Some(c);
            }
        }
    }
    let path = std::env::var_os("PATH")?;
    for d in std::env::split_paths(&path) {
        for n in ["vlc.exe", "mpv.exe"] {
            let c = d.join(n);
            if c.exists() {
                return Some(c);
            }
        }
    }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayResult {
    /// ชื่อโปรแกรมที่เปิด · ว่าง = โปรแกรมหลักของ Windows
    player: String,
    /// เปิดตรงนาทีได้ไหม
    seeked: bool,
}

/// โปรแกรมเล่นที่เปิดตรงนาทีได้ ตอนไม่ได้ตั้งไว้ในหน้าตั้งค่า
/// ① โปรแกรมหลักที่เครื่องใช้เปิดไฟล์ชนิดนี้ ถ้าเป็นโปรแกรมที่สั่งกระโดดนาทีได้ (ลงไว้ที่ไหนก็เจอ รวมแบบพกพา · TECH-REVIEW ข้อ 14)
/// ② หาในโฟลเดอร์ติดตั้งมาตรฐานกับ PATH
fn pick_player(file: &Path) -> Option<PathBuf> {
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    crate::winutil::default_app_for(&ext).filter(|p| seek_args(p, file, 0.0).is_some()).or_else(find_player)
}

/// เปิดเล่นที่นาทีที่เสีย · ใช้โปรแกรมที่ตั้งไว้ ไม่ได้ตั้งหาเองในเครื่อง (pick_player) ไม่เจอเปิดด้วยโปรแกรมหลักของ Windows (เปิดตรงนาทีไม่ได้)
#[tauri::command]
pub fn play_at(app: AppHandle, path: String, secs: f64) -> Result<PlayResult, String> {
    let file = Path::new(&path);
    if !file.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    let set = app.state::<SettingsStore>().current.lock().unwrap().player_path.clone();
    let player = if set.trim().is_empty() {
        pick_player(file)
    } else if Path::new(&set).exists() {
        Some(PathBuf::from(&set))
    } else {
        return Err(format!("หาโปรแกรมเล่นหนัง {set} ไม่เจอ · ตั้งใหม่ได้ที่หน้าตั้งค่า"));
    };
    let Some(exe) = player else {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(path, None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))?;
        return Ok(PlayResult { player: String::new(), seeked: false });
    };
    let name = exe.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let (args, seeked) = match seek_args(&exe, file, secs) {
        Some(a) => (a, true),
        None => (vec![file.into()], false),
    };
    std::process::Command::new(&exe).args(args).spawn().map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}"))?;
    Ok(PlayResult { player: name, seeked })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(at: f64) -> Hit { Hit { at, video: true } }
    fn a(at: f64) -> Hit { Hit { at, video: false } }

    fn tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }

    /// ไฟล์ทดสอบ · ไม่มีไฟล์ = เทสล้มพร้อมบอกวิธีสร้าง · ตั้ง MOVIE_SHELF_SKIP_MEDIA=1 ถ้าตั้งใจข้าม
    fn media(name: &str) -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join(name);
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }

    /// สำเนาชั่วคราวที่ลบตัวเองตอนจบ แม้เทสล้ม
    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = std::fs::remove_file(&self.0);
        }
    }
    fn copy_of(src: &Path, tag: &str) -> Temp {
        let dst = std::env::temp_dir().join(format!("movie-shelf-check-{tag}-{}.{}", std::process::id(), ext_of(src)));
        std::fs::copy(src, &dst).unwrap();
        Temp(dst)
    }

    #[test]
    fn spot_words_follow_mockup() {
        // ต้นแบบบรรทัด 992–993 · 1:12:30 – 1:12:41 ภาพแตกเป็นสี่เหลี่ยม 11 วินาที · 1:58:02 เสียงเงียบหายไป 2 วินาที
        let v = Spot { start: 4350.0, end: 4361.0, video: true, audio: false };
        let a = Spot { start: 7082.0, end: 7084.0, video: false, audio: true };
        let both = Spot { start: 30.0, end: 30.3, video: true, audio: true };
        assert_eq!(spot_what(&v), "ภาพแตกเป็นสี่เหลี่ยม 11 วินาที");
        assert_eq!(spot_what(&a), "เสียงเงียบหายไป 2 วินาที");
        assert_eq!(spot_what(&both), "ภาพแตกเป็นสี่เหลี่ยมและเสียงเงียบหายไป 1 วินาที");
    }

    #[test]
    fn merges_hits_within_five_seconds() {
        // ห่าง 3 วินาที รวมเป็นช่วงเดียว · ห่าง 6 วินาที แยกช่วง
        let s = merge_hits(&[v(30.0), v(33.0), v(39.5)], MERGE_GAP);
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].start, s[0].end), (30.0, 33.0));
        assert_eq!((s[1].start, s[1].end), (39.5, 39.5));
        // ห่างพอดี 5 วินาที ยังนับเป็นช่วงเดียว
        assert_eq!(merge_hits(&[v(10.0), v(15.0)], MERGE_GAP).len(), 1);
    }

    #[test]
    fn keeps_video_and_audio_flags_and_sorts() {
        // ลำดับที่ตัวถอดรหัสส่งมาไม่เรียง · ภาพกับเสียงในช่วงเดียวกัน ช่วงนั้นเสียทั้งสอง
        let s = merge_hits(&[a(31.0), v(30.2), a(100.0)], MERGE_GAP);
        assert_eq!(s, vec![
            Spot { start: 30.2, end: 31.0, video: true, audio: true },
            Spot { start: 100.0, end: 100.0, video: false, audio: true },
        ]);
        // เวลาเพี้ยน (ติดลบ ไม่ใช่ตัวเลข) ทิ้ง ไม่ทำให้ผลพัง
        assert!(merge_hits(&[v(f64::NAN), v(-1.0)], MERGE_GAP).is_empty());
    }

    #[test]
    fn formats_time_like_spec() {
        assert_eq!(fmt_time(4350.0), "1:12:30"); // ตัวอย่างในสเปก
        assert_eq!(fmt_time(30.333), "0:30"); // ไฟล์ทดสอบ เสียกลางเรื่อง เสียที่วินาที 30
        assert_eq!(fmt_time(725.9), "12:05");
        assert_eq!(fmt_time(0.0), "0:00");
        assert_eq!(fmt_time(-3.0), "0:00");
        assert_eq!(fmt_time(36000.0), "10:00:00");
    }

    #[test]
    fn reads_ebml_sizes_including_unknown_and_8_byte() {
        // ขนาด 1 ไบต์ · 8 ไบต์ (ไม่ทำให้เลื่อนบิตล้น) · ค่าพิเศษไม่ระบุขนาด
        assert_eq!(vint(&[0x81], 0), Some((1, 1, false)));
        assert_eq!(vint(&[0x01, 0, 0, 0, 0, 0, 0x01, 0x00], 0), Some((256, 8, false)));
        assert_eq!(vint(&[0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], 0).map(|x| x.2), Some(true));
        assert_eq!(vint(&[0x00], 0), None);
    }

    #[test]
    fn parses_ffprobe_frames_with_attached_errors() {
        // บรรทัดจริงจากไฟล์ทดสอบเสียกลางเรื่อง ข้อความผิดพลาด 2 อันต่อกันในบรรทัดเดียว
        let l = "media_type=video|best_effort_timestamp_time=30.000000|context=h264|level=16context=h264|level=16";
        assert_eq!(parse_frame(l), (true, Some(30.0), true, 2));
        assert_eq!(parse_frame("media_type=audio|best_effort_timestamp_time=0.021000"), (true, Some(0.021), false, 0));
        assert_eq!(parse_frame("media_type=video|best_effort_timestamp_time=N/A|context=hevc|level=24"), (true, None, true, 0));
        // ข้อความอันที่สองขึ้นบรรทัดใหม่ ไม่มี media_type ยังนับ
        assert_eq!(parse_frame("context=h264|level=16"), (false, None, false, 1));
        assert_eq!(parse_frame("[h264 @ 0000] error while decoding"), (false, None, false, 0));
    }

    #[test]
    fn tells_video_audio_and_container_errors_apart() {
        // บรรทัดจริงจาก ffmpeg กับไฟล์ทดสอบเสียกลางเรื่อง
        assert_eq!(error_kind("[in#0/matroska,webm @ 0000022b6b2a2ac0] 0x00 at pos 24464080 (0x1754ad0) invalid as first byte of an EBML number"), Some((true, true)));
        assert_eq!(error_kind("[h264 @ 0000022b6b37c280] Invalid level prefix"), Some((true, false)));
        assert_eq!(error_kind("[aac @ 0000] Input buffer exhausted before END element found"), Some((false, true)));
        assert_eq!(error_kind("[aist#0:1/opus @ 0000] Error submitting packet to decoder"), Some((false, true)));
        assert_eq!(error_kind("[vist#0:0/hevc @ 0000] Decoding error"), Some((true, false)));
        assert_eq!(error_kind("Error while decoding stream #0:0: Invalid data found when processing input"), Some((true, true)));
        // บรรทัดความคืบหน้าไม่ใช่ข้อความผิดพลาด
        for l in ["out_time_us=28821333", "progress=continue", "stream_0_0_q=-0.0", "speed=41.2x", "speed= 100x", "speed=  95x", "bitrate=N/A", ""] {
            assert_eq!(error_kind(l), None, "{l}");
        }
        assert_eq!(byte_pos("[in#0/matroska,webm @ 0000] 0x00 at pos 24464080 (0x1754ad0) invalid as first byte"), Some(24464080));
        assert_eq!(byte_pos("[h264 @ 0000] Invalid level prefix"), None);
    }

    #[test]
    fn seek_args_for_each_player() {
        let f = Path::new("D:/หนัง/เรื่อง.mkv");
        let s = |p: &str| seek_args(Path::new(p), f, 4350.7).map(|v| v.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>());
        assert_eq!(s("C:/Program Files/VideoLAN/VLC/vlc.exe").unwrap(), vec!["--start-time=4350", "D:/หนัง/เรื่อง.mkv"]);
        assert_eq!(s("C:/x/mpc-hc64.exe").unwrap(), vec!["D:/หนัง/เรื่อง.mkv", "/start", "4350000"]);
        assert_eq!(s("C:/x/PotPlayerMini64.exe").unwrap(), vec!["D:/หนัง/เรื่อง.mkv", "/seek=01:12:30"]);
        assert_eq!(s("C:/x/mpv.exe").unwrap(), vec!["--start=4350", "D:/หนัง/เรื่อง.mkv"]);
        assert!(s("C:/x/wmplayer.exe").is_none());
    }

    #[test]
    fn asks_windows_for_the_default_app() {
        // นามสกุลที่ไม่มีโปรแกรมเปิด = ไม่มี · .msc Windows ทุกเครื่องเปิดด้วย mmc.exe
        let none = crate::winutil::default_app_for(".ไม่มีนามสกุลนี้");
        assert!(none.is_none(), "นามสกุลที่ไม่มีโปรแกรมเปิด ได้ {none:?}");
        let mmc = crate::winutil::default_app_for(".msc").expect("Windows ต้องบอกโปรแกรมที่เปิด .msc ได้");
        assert!(mmc.file_name().unwrap().to_string_lossy().eq_ignore_ascii_case("mmc.exe"), "{}", mmc.display());
        // โปรแกรมหลักของ .mkv ในเครื่องนี้ (จดไว้ดูในผลเทส ไม่ได้บังคับว่าต้องมี)
        eprintln!("โปรแกรมหลักของ .mkv ในเครื่องนี้ {:?}", crate::winutil::default_app_for(".mkv"));
    }

    #[test]
    fn structure_of_test_files() {
        for (name, want) in [
            ("ดาวเหนือ (2023).mkv", "ครบ"), ("Harbor Lights (2021).mkv", "ครบ"), ("ฝนแรก (2025).webm", "ครบ"),
            ("The Last Orchard (2022).mp4", "ครบ"), ("Paper Moons (2018).mov", "ครบ"), ("Silent Atlas (2016).m4v", "ครบ"),
            ("Iron Tide (2024).avi", "ครบ"), ("Clip (2015).flv", "ครบ"), ("ขาดท้าย (2022).mkv", "ขาดท้าย"),
            ("บ้านริมคลอง (2017).ts", "ไม่รู้"), ("Old Disc (2001).vob", "ไม่รู้"),
        ] {
            let Some(p) = media(name) else { return };
            let got = match structure(&p).unwrap() {
                Structure::Complete => "ครบ",
                Structure::Truncated(_) => "ขาดท้าย",
                Structure::Unknown(_) => "ไม่รู้",
                Structure::Broken(w) => panic!("{name} โครงเสีย {w}"),
            };
            assert_eq!(got, want, "{name}");
        }
    }

    #[test]
    fn structure_catches_cut_copies_of_every_reliable_type() {
        // ตัดสำเนาเหลือ 70% ทุกชนิดที่หัวไฟล์บอกขนาด ต้องขึ้นว่าขาดท้าย
        for name in ["ดาวเหนือ (2023).mkv", "ฝนแรก (2025).webm", "The Last Orchard (2022).mp4", "Paper Moons (2018).mov", "Iron Tide (2024).avi", "Clip (2015).flv"] {
            let Some(p) = media(name) else { return };
            let t = copy_of(&p, "cut");
            let len = std::fs::metadata(&t.0).unwrap().len();
            std::fs::OpenOptions::new().write(true).open(&t.0).unwrap().set_len(len * 7 / 10).unwrap();
            assert!(matches!(structure(&t.0).unwrap(), Structure::Truncated(_)), "{name} ตัดแล้วต้องขึ้นว่าขาดท้าย");
        }
    }

    #[test]
    fn quick_check_detects_one_changed_byte() {
        let Some(p) = media("ดาวเหนือ (2023).mkv") else { return };
        let t = copy_of(&p, "quick");
        let no = || false;
        // ครั้งแรกไม่มีค่าเดิม จดค่าใหม่
        let first = quick(&t.0, None, &|_| {}, &no).unwrap().unwrap();
        assert_eq!(first.result, "ok");
        let sha = first.sha256.clone().unwrap();
        // ไม่ได้แก้ ตรงกับค่าเดิม
        assert_eq!(quick(&t.0, Some(&sha), &|_| {}, &no).unwrap().unwrap().result, "ok");
        // แก้ 1 ไบต์กลางไฟล์ ขนาดเท่าเดิม โครงยังครบ ต้องขึ้นว่าไฟล์ถูกเปลี่ยน และไม่ทับค่าเดิม
        let mut b = std::fs::read(&t.0).unwrap();
        let mid = b.len() / 2;
        b[mid] ^= 0xFF;
        std::fs::write(&t.0, &b).unwrap();
        let changed = quick(&t.0, Some(&sha), &|_| {}, &no).unwrap().unwrap();
        assert_eq!(changed.result, "changed");
        assert!(changed.sha256.is_none(), "ไฟล์ถูกเปลี่ยนต้องคงค่า hash เดิมไว้เทียบ");
        // ขาดท้ายจับได้ตั้งแต่ตรวจแบบเร็ว
        let Some(cut) = media("ขาดท้าย (2022).mkv") else { return };
        let r = quick(&cut, None, &|_| {}, &no).unwrap().unwrap();
        assert_eq!(r.result, "bad");
        assert!(r.summary.contains("ขาดท้าย"), "{}", r.summary);
        // กดหยุดระหว่างคิด hash คืน None
        assert!(quick(&t.0, None, &|_| {}, &|| true).unwrap().is_none());
    }

    /// เวลาจริงของจุดเสียที่ make-test-media.mjs ทำไว้ อ่านจาก json ข้างไฟล์
    fn broken_window() -> Option<(f64, f64)> {
        let p = media("เสียกลางเรื่อง (2022).json")?;
        let j: Value = serde_json::from_slice(&std::fs::read(p).unwrap()).unwrap();
        Some((j["วินาทีเริ่ม"].as_f64().unwrap(), j["วินาทีจบ"].as_f64().unwrap()))
    }

    #[test]
    fn deep_check_finds_broken_spot_within_five_seconds() {
        let Some(p) = media("เสียกลางเรื่อง (2022).mkv") else { return };
        let Some((from, to)) = broken_window() else { return };
        let r = deep(&tools(), &p, Some(60.0), &|_| {}, &|| false).unwrap().unwrap();
        assert_eq!(r.result, "bad", "{}", r.summary);
        let first = r.spans.iter().find(|s| s.get("tail").is_none()).expect("ต้องมีช่วงที่เสีย");
        let at = first["from"].as_f64().unwrap();
        assert!(at >= from - 5.0 && at <= to + 5.0, "เวลาที่บอก {at} ห่างจากจุดจริง {from}–{to} เกิน 5 วินาที");
        assert!(r.summary.contains("0:30"), "{}", r.summary);
        assert!(r.sha256.is_none());
    }

    #[test]
    fn deep_check_finds_truncated_and_passes_good_file() {
        let Some(cut) = media("ขาดท้าย (2022).mkv") else { return };
        let r = deep(&tools(), &cut, Some(60.021), &|_| {}, &|| false).unwrap().unwrap();
        assert_eq!(r.result, "bad");
        // บอกว่าเล่นได้ถึงไหน · จุดที่ไฟล์ถูกตัดไม่นับเป็นจุดเสียแยก (เดิมได้ 0:40 บ้าง 0:35 บ้าง)
        assert!(r.summary.contains("ไฟล์ขาดท้าย เล่นได้ถึง") && r.summary.contains("จากความยาว 1:00"), "{}", r.summary);
        assert!(r.spans.iter().all(|s| s.get("tail").is_some()), "{:?}", r.spans);
        let Some(good) = media("ดาวเหนือ (2023).mkv") else { return };
        let len = crate::probe::probe(&tools(), &good).ok().and_then(|x| x.duration);
        let pct = Mutex::new(Vec::new());
        let ok = deep(&tools(), &good, len, &|p| pct.lock().unwrap().push(p), &|| false).unwrap().unwrap();
        assert_eq!(ok.result, "ok", "{}", ok.summary);
        assert!(ok.sha256.is_some(), "ตรวจละเอียดผ่านต้องจดค่า hash");
        let pct = pct.into_inner().unwrap();
        assert!(pct.windows(2).all(|w| w[1] >= w[0] - 0.001), "ความคืบหน้าต้องไม่ถอยหลัง");
        // กดหยุดกลางทาง คืน None และ ffprobe ถูกปิด
        assert!(deep(&tools(), &good, len, &|_| {}, &|| true).unwrap().is_none());
    }
}
