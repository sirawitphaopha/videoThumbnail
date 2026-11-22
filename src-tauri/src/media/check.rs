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

use crate::app::library::LibraryStore;
use crate::app::store::SettingsStore;

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

/// เหตุที่ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบ · ต่อท้ายคำว่า "เพราะ" ในข้อความผล
const UNKNOWN_TS: &str = "ไฟล์ชนิดนี้ไม่ได้จดขนาดไว้ในหัวไฟล์";
const UNKNOWN_SIZE: &str = "หัวไฟล์ไม่ได้บอกขนาด";

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
        Some(n) => format!("ไฟล์ขาดท้าย หายไปราว {} จากขนาดที่หัวไฟล์บอก  ไฟล์น่าจะโหลดมาไม่ครบ", human(n)),
        None => "ไฟล์ขาดท้ายเพราะท้ายไฟล์ไม่ครบ  ไฟล์น่าจะโหลดมาไม่ครบ".into(),
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
    Ok(match crate::app::hashes::compute(path, &algos, &pct, stop)? {
        crate::app::hashes::Outcome::Cancelled => None,
        crate::app::hashes::Outcome::Done(h) => h.sha256,
    })
}

/// ตรวจแบบเร็ว · โครงไฟล์ แล้วเทียบ SHA-256 กับที่จดไว้ · None = กดหยุด
/// full_ok = ครั้งก่อนตรวจละเอียดแล้วสมบูรณ์ (หรือผลสมบูรณ์ที่ต่อมาจากครั้งนั้น) · ไฟล์ที่ตรวจโครงไม่ได้ ค่า hash ตรงจึงยังนับว่าสมบูรณ์
/// ไฟล์ที่ตรวจโครงไม่ได้และไม่เคยตรวจละเอียดว่าสมบูรณ์ ได้ผล partial (ตรวจได้บางส่วน) ไม่ใช่ ok
/// เดิมได้ ok สีเขียวพร้อมข้อความ "โครงไฟล์ครบ" ทั้งที่ไม่ได้ตรวจโครงเลย (AUDIT 12 พ.ย. 2569 ข้อ 28)
pub fn quick(path: &Path, stored: Option<&str>, full_ok: bool, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Outcome>, String> {
    let s = structure(path)?;
    match &s {
        Structure::Truncated(m) => return Ok(Some(bad(truncated_text(*m), vec![]))),
        Structure::Broken(why) => return Ok(Some(bad(format!("โครงไฟล์เสีย {why}"), vec![]))),
        _ => {}
    }
    let Some(h) = sha256(path, on, stop)? else { return Ok(None) };
    let same = stored.map(|old| old.eq_ignore_ascii_case(&h));
    if same == Some(false) {
        return Ok(Some(Outcome {
            result: "changed",
            summary: "ค่า hash ไม่ตรงกับตอนตรวจครั้งก่อน ไฟล์อาจเสียระหว่างย้ายไดรฟ์ ควรตรวจละเอียด".into(),
            spans: vec![],
            sha256: None,
        }));
    }
    Ok(Some(match (&s, same) {
        (Structure::Unknown(_), Some(true)) if full_ok => Outcome { result: "ok", summary: "ตรวจแบบเร็ว ค่า hash ตรงกับครั้งก่อน ไฟล์จึงเหมือนตอนที่ตรวจละเอียดว่าสมบูรณ์".into(), spans: vec![], sha256: Some(h) },
        // ข้อความสั้นสองวลี ช่องผลในตารางตัดบรรทัดตรงรอยต่อพอดี (เดิมใส่เหตุผลกับคำว่าจดค่า hash แล้ว ตัดกลางวลีทั้งในตารางและหน้าต่างผลตรวจ)
        (Structure::Unknown(_), _) => Outcome { result: "partial", summary: "ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบไหม ควรตรวจละเอียด".into(), spans: vec![], sha256: Some(h) },
        (_, Some(true)) => Outcome { result: "ok", summary: "ตรวจแบบเร็ว โครงไฟล์ครบ ค่า hash ตรงกับครั้งก่อน".into(), spans: vec![], sha256: Some(h) },
        _ => Outcome { result: "ok", summary: "ตรวจแบบเร็ว โครงไฟล์ครบ จดค่า hash ไว้เทียบครั้งหน้า".into(), spans: vec![], sha256: Some(h) },
    }))
}

/// ครั้งก่อนสมบูรณ์จากตรวจละเอียด หรือจากตรวจแบบเร็วที่ต่อมาจากตรวจละเอียด (basis full)
pub fn prev_full_ok(prev: Option<&Value>) -> bool {
    let Some(p) = prev else { return false };
    p["result"].as_str() == Some("ok") && (p["mode"].as_str() == Some("full") || p["basis"].as_str() == Some("full"))
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

/// ข้อความที่บอกว่าอ่านไฟล์จากดิสก์ไม่ได้ (ไดรฟ์หลุด สายหลวม ไฟล์ถูกย้าย) ไม่ใช่ภาพแตกหรือเสียงหาย
/// เดิมนับเป็นจุดเสียทั้งภาพและเสียง ไฟล์ดีขึ้นว่าเสียหาย (AUDIT 12 พ.ย. 2569 ข้อ 29)
fn io_error(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    ["input/output error", "i/o error", "error number -5", "permission denied", "no such file or directory", "device not ready", "the device is not ready", "network path was not found"]
        .iter().any(|k| l.contains(k))
}

/// ผลรอบแรก · จุดเสียแบบคร่าว (เวลาตามความคืบหน้าล่าสุด) · ภาพเสียงถอดได้ถึงวินาทีไหน · ffmpeg ส่งความคืบหน้ามาไหม · อ่านดิสก์ไม่ได้ (ข้อความแรก)
#[derive(Default)]
struct Rough {
    hits: Vec<Hit>,
    last: f64,
    progressed: bool,
    io: Option<String>,
}

/// อ่านไฟล์ไม่จบเพราะดิสก์หรือไฟล์ ไม่ใช่ไฟล์เสีย · ขึ้นว่าตรวจไม่ได้ ผลเดิมของเรื่องนั้นคงไว้
const IO_FAIL: &str = "อ่านไฟล์ไม่จบระหว่างตรวจ ไดรฟ์อาจหลุดหรือไฟล์ถูกย้าย ไฟล์อาจยังดีอยู่ เสียบไดรฟ์ให้แน่นแล้วตรวจใหม่";

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
    let mut child = crate::app::tools::tool_command(tools, "ffmpeg", &args).stdout(Stdio::null()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::app::winutil::kill_with_app(&child);
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
            if io_error(&l) {
                if r.io.is_none() { r.io = Some(l.trim().chars().take(160).collect()); }
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
    if !rough.progressed || (rough.last <= 0.0 && !crate::app::tools::tool_succeeded("ffmpeg", &status)) {
        // สาเหตุเป็นประโยคไทย ไม่ใช่แค่รหัส (BUGS ข้อ 150)
        let why = crate::app::tools::explain_fail("ffmpeg", &crate::app::tools::tool_lines(&tail.iter().cloned().collect::<Vec<_>>().join("\n")), Some(&status)).line();
        return Err(format!("ffmpeg อ่านภาพเสียงในไฟล์ไม่ได้เลย  {why}"));
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
    let out = crate::app::tools::run_tool_timeout(tools, "ffprobe", &args, Duration::from_secs(600))?;
    // ffprobe เปิดไฟล์ไม่ได้ (ไดรฟ์หลุด) ได้ผลว่าง เดิมถือว่าไม่เจอแล้วใช้จุดคร่าวจากรอบแรกแทน (AUDIT ข้อ 29)
    if out.stdout.is_empty() && !crate::app::tools::tool_succeeded("ffprobe", &out.status) {
        return Err(IO_FAIL.into());
    }
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
    let mark0 = file_mark(path);
    let Some(rough) = rough_pass(tools, path, total, &|p| on(p * 0.85), stop)? else { return Ok(None) };
    // อ่านดิสก์ไม่ได้ระหว่างรอบแรก หรือไฟล์หายหรือเปลี่ยนหลังรอบแรก เป็นตรวจไม่ได้ ไม่ใช่ไฟล์เสีย (AUDIT ข้อ 29)
    if rough.io.is_some() || !path.is_file() || file_mark(path) != mark0 {
        return Err(IO_FAIL.into());
    }
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
                if t { format!("{at} และไฟล์ขาดท้าย") } else { at }
            }
            (n, t) => format!("เสีย {n} ช่วง ช่วงแรกที่นาที {}{}", fmt_time(spots[0].start), if t { " และไฟล์ขาดท้าย" } else { "" }),
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

/// ขนาดไฟล์กับเวลาแก้ไฟล์ตอนตรวจ จดลงผลตรวจ ไว้ดูว่าไฟล์ยังเป็นไฟล์เดิมไหม
fn file_mark(path: &Path) -> (u64, i64) {
    std::fs::metadata(path).map(|md| (md.len(), md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0))).unwrap_or((0, 0))
}

/// ตรวจแบบเร็วรอบนี้ไม่เจอที่เสีย แต่ตรวจละเอียดครั้งก่อนเจอที่เสีย และไฟล์ยังเป็นไฟล์เดิม ต้องคงผลเสียหายไว้
/// ตรวจแบบเร็วดูแค่โครงไฟล์กับค่า hash มองไม่เห็นภาพแตก · เดิมทับผลเสียหายเป็นสมบูรณ์สีเขียว (AUDIT 12 พ.ย. 2569 ข้อ 3)
/// ไฟล์เดิม = ขนาดกับเวลาแก้ไฟล์เท่าตอนตรวจละเอียด · ผลตรวจรุ่นเก่าที่ไม่ได้จดไว้ ถือว่าเป็นไฟล์เดิม (คงผลเสียหาย ตรวจละเอียดซ้ำเพื่อล้าง)
/// ผลเปลี่ยนได้เมื่อไฟล์ถูกแทนด้วยไฟล์ใหม่ หรือตรวจละเอียดแล้วผ่าน
pub fn keep_deep_bad(prev_status: &str, prev: Option<&Value>, mode: &str, result: &str, mark: (u64, i64)) -> bool {
    if mode != "quick" || result == "bad" || prev_status != "bad" { return false; }
    let Some(p) = prev else { return false };
    if p["mode"].as_str() != Some("full") || p["result"].as_str() != Some("bad") { return false; }
    match (p["fileSize"].as_u64(), p["fileMtime"].as_i64()) {
        (Some(size), Some(mtime)) => size == mark.0 && mtime == mark.1,
        _ => true,
    }
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
    /// ตรวจได้บางส่วน ไฟล์ที่ตรวจแบบเร็วบอกไม่ได้ว่าครบ (AUDIT ข้อ 28)
    partial: usize,
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
    let tools = crate::app::tools::tools_dir(&app)?;
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
    let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
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
        let full_ok = prev_full_ok(m.check.as_ref());
        let res = if mode == "quick" { quick(&path, m.sha256.as_deref(), full_ok, &on, &stop) } else { deep(tools, &path, m.duration, &on, &stop) };
        match res {
            Ok(None) => {
                r.cancelled = true;
                break;
            }
            Err(e) => fail(&mut r, e),
            Ok(Some(o)) => {
                let mark = file_mark(&path);
                // ไฟล์เดิมที่ตรวจละเอียดเจอที่เสียไว้ ตรวจแบบเร็วไม่ทับผลนั้น คงสถานะ ข้อความ และช่วงที่เสียไว้ทั้งหมด
                let keep = keep_deep_bad(&m.status, m.check.as_ref(), mode, o.result, mark);
                let result = if keep { "bad" } else { o.result };
                if !keep {
                    let mut info = json!({ "at": now(), "mode": mode, "result": o.result, "summary": o.summary, "spans": o.spans, "fileSize": mark.0, "fileMtime": mark.1 });
                    // ผลสมบูรณ์ที่ต่อมาจากตรวจละเอียด จดไว้ ตรวจแบบเร็วครั้งต่อไปของไฟล์ที่ตรวจโครงไม่ได้จะได้ไม่ตกเป็นตรวจได้บางส่วน
                    if mode == "quick" && o.result == "ok" && full_ok { info["basis"] = json!("full"); }
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
                }
                match result { "ok" => r.ok += 1, "bad" => r.bad += 1, "partial" => r.partial += 1, _ => r.changed += 1 }
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayResult {
    /// ชื่อโปรแกรมที่เปิด · ว่าง = โปรแกรมหลักของ Windows
    player: String,
    /// เปิดตรงนาทีได้ไหม
    seeked: bool,
}

/// โปรแกรมเล่นตอนไม่ได้ตั้งไว้ในหน้าตั้งค่า (พี่กันสั่ง 9 พ.ย. 2569 ค่าตั้งต้นคือ MPC-HC)
/// ① MPC-HC ② โปรแกรมหลักที่เครื่องใช้เปิดไฟล์ชนิดนี้ ถ้าสั่งกระโดดนาทีได้ (ลงไว้ที่ไหนก็เจอ รวมแบบพกพา · TECH-REVIEW ข้อ 14) ③ ตัวอื่นที่หาเจอและกระโดดนาทีได้
/// None = เครื่องนี้ไม่มี ใช้โปรแกรมหลักของ Windows
pub fn auto_player(found: &[PathBuf], file: &Path) -> Option<PathBuf> {
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    crate::media::players::mpc_hc(found)
        .or_else(|| crate::app::winutil::default_app_for(&ext).filter(|p| seek_args(p, file, 0.0).is_some()))
        .or_else(|| found.iter().find(|p| seek_args(p, file, 0.0).is_some()).cloned())
}

/// โปรแกรมเล่นที่จะใช้เปิดไฟล์ · ตั้งไว้ในหน้าตั้งค่าใช้ตัวนั้น ไม่ได้ตั้งเลือกเอง (auto_player) · None = ใช้โปรแกรมหลักของ Windows
/// ใช้ร่วมกับปุ่มเปิดเล่นบนชั้นวาง (library.rs) และปุ่มลองฟัง 20 วินาทีของตัวช่วยหาดีเลย์ (delay.rs)
pub fn player_for(app: &AppHandle, file: &Path) -> Result<Option<PathBuf>, String> {
    let set = app.state::<SettingsStore>().current.lock().unwrap().player_path.clone();
    if set.trim() == crate::media::players::SYSTEM {
        Ok(None)
    } else if set.trim().is_empty() {
        Ok(auto_player(&crate::media::players::scan(), file))
    } else if Path::new(&set).exists() {
        Ok(Some(PathBuf::from(&set)))
    } else {
        Err(format!("หาโปรแกรมเล่นหนัง {set} ไม่เจอ  ตั้งใหม่ได้ที่หน้าตั้งค่า"))
    }
}

/// เปิดเล่นที่นาทีที่เสีย · ใช้โปรแกรมที่ตั้งไว้ ไม่ได้ตั้งเลือกเอง (auto_player) ไม่เจอเปิดด้วยโปรแกรมหลักของ Windows (เปิดตรงนาทีไม่ได้)
#[tauri::command]
pub fn play_at(app: AppHandle, path: String, secs: f64) -> Result<PlayResult, String> {
    let file = Path::new(&path);
    if !file.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    let player = player_for(&app, file)?;
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
#[path = "check_tests.rs"]
mod tests;
