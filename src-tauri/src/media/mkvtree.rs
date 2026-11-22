//! โครงสร้างข้างในไฟล์ MKV แบบ mkvinfo (BUGS ข้อ 131 พี่กันสั่ง "เอา เเละอธิบายเพิ่มด้วย" กับ "เอาเข้าคิว")
//! อ่านแบบ EBML เอง ไม่ต้องแนบ mkvinfo.exe (ชุด MKVToolNix ที่แนบมามีแค่ mkvmerge mkvextract mkvpropedit)
//! 🔴 อ่านอย่างเดียว ไฟล์ไม่ถูกแตะ · ก้อนข้อมูล (Cluster) แสดงแค่สามก้อนแรก ที่เหลือนับจำนวนจากหัวก้อน ไม่อ่านข้อมูลภาพเสียง
//! ชื่อชั้นตามมาตรฐาน Matroska (RFC 9559) · หน้าจออธิบายแต่ละชั้นเป็นภาษาไทยในปุ่ม ⓘ (components/MkvTree.tsx)

use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    /// รหัสชั้นแบบเลขฐานสิบหก เช่น 0x1A45DFA3 · แถวสรุปไม่มี
    pub id: String,
    pub pos: u64,
    /// ขนาดข้อมูล ไม่รู้ขนาด (ไฟล์อัดสด) ได้ None
    pub size: Option<u64>,
    pub value: Option<String>,
    pub kids: Vec<Node>,
}

#[derive(Clone, Copy, PartialEq)]
enum T { M, U, I, F, S, B, D }

/// ชื่อกับชนิดของชั้นที่รู้จัก · ไม่อยู่ในตารางแสดงว่าไม่รู้จักพร้อมรหัส
fn element(id: u32) -> Option<(&'static str, T)> {
    use T::*;
    Some(match id {
        0x1A45DFA3 => ("EBML", M), 0x4286 => ("EBMLVersion", U), 0x42F7 => ("EBMLReadVersion", U), 0x42F2 => ("EBMLMaxIDLength", U), 0x42F3 => ("EBMLMaxSizeLength", U),
        0x4282 => ("DocType", S), 0x4287 => ("DocTypeVersion", U), 0x4285 => ("DocTypeReadVersion", U), 0xEC => ("Void", B), 0xBF => ("CRC-32", B),
        0x18538067 => ("Segment", M),
        0x114D9B74 => ("SeekHead", M), 0x4DBB => ("Seek", M), 0x53AB => ("SeekID", B), 0x53AC => ("SeekPosition", U),
        0x1549A966 => ("Info", M), 0x73A4 => ("SegmentUUID", B), 0x2AD7B1 => ("TimestampScale", U), 0x4489 => ("Duration", F), 0x4461 => ("DateUTC", D),
        0x7BA9 => ("Title", S), 0x4D80 => ("MuxingApp", S), 0x5741 => ("WritingApp", S),
        0x1654AE6B => ("Tracks", M), 0xAE => ("TrackEntry", M), 0xD7 => ("TrackNumber", U), 0x73C5 => ("TrackUID", U), 0x83 => ("TrackType", U),
        0xB9 => ("FlagEnabled", U), 0x88 => ("FlagDefault", U), 0x55AA => ("FlagForced", U), 0x55AB => ("FlagHearingImpaired", U), 0x55AC => ("FlagVisualImpaired", U),
        0x55AE => ("FlagOriginal", U), 0x55AF => ("FlagCommentary", U), 0x9C => ("FlagLacing", U), 0x23E383 => ("DefaultDuration", U), 0x536E => ("Name", S),
        0x22B59C => ("Language", S), 0x22B59D => ("LanguageBCP47", S), 0x86 => ("CodecID", S), 0x63A2 => ("CodecPrivate", B), 0x258688 => ("CodecName", S),
        0x56AA => ("CodecDelay", U), 0x56BB => ("SeekPreRoll", U), 0x55EE => ("MaxBlockAdditionID", U),
        0xE0 => ("Video", M), 0xB0 => ("PixelWidth", U), 0xBA => ("PixelHeight", U), 0x54B0 => ("DisplayWidth", U), 0x54BA => ("DisplayHeight", U), 0x54B2 => ("DisplayUnit", U),
        0x9A => ("FlagInterlaced", U), 0x55B0 => ("Colour", M), 0x55B1 => ("MatrixCoefficients", U), 0x55B9 => ("Range", U), 0x55BA => ("TransferCharacteristics", U), 0x55BB => ("Primaries", U),
        0xE1 => ("Audio", M), 0xB5 => ("SamplingFrequency", F), 0x78B5 => ("OutputSamplingFrequency", F), 0x9F => ("Channels", U), 0x6264 => ("BitDepth", U),
        0x6D80 => ("ContentEncodings", M), 0x6240 => ("ContentEncoding", M), 0x5034 => ("ContentCompression", M), 0x4254 => ("ContentCompAlgo", U), 0x4255 => ("ContentCompSettings", B),
        0x1043A770 => ("Chapters", M), 0x45B9 => ("EditionEntry", M), 0x45BC => ("EditionUID", U), 0x45BD => ("EditionFlagHidden", U), 0x45DB => ("EditionFlagDefault", U),
        0x45DD => ("EditionFlagOrdered", U), 0xB6 => ("ChapterAtom", M), 0x73C4 => ("ChapterUID", U), 0x5654 => ("ChapterStringUID", S), 0x91 => ("ChapterTimeStart", U),
        0x92 => ("ChapterTimeEnd", U), 0x98 => ("ChapterFlagHidden", U), 0x4598 => ("ChapterFlagEnabled", U), 0x80 => ("ChapterDisplay", M), 0x85 => ("ChapString", S),
        0x437C => ("ChapLanguage", S), 0x437D => ("ChapLanguageBCP47", S), 0x437E => ("ChapCountry", S),
        0x1941A469 => ("Attachments", M), 0x61A7 => ("AttachedFile", M), 0x467E => ("FileDescription", S), 0x466E => ("FileName", S), 0x4660 => ("FileMediaType", S),
        0x465C => ("FileData", B), 0x46AE => ("FileUID", U),
        0x1254C367 => ("Tags", M), 0x7373 => ("Tag", M), 0x63C0 => ("Targets", M), 0x68CA => ("TargetTypeValue", U), 0x63CA => ("TargetType", S), 0x63C5 => ("TagTrackUID", U),
        0x63C9 => ("TagEditionUID", U), 0x63C4 => ("TagChapterUID", U), 0x63C6 => ("TagAttachmentUID", U), 0x67C8 => ("SimpleTag", M), 0x45A3 => ("TagName", S),
        0x447A => ("TagLanguage", S), 0x447B => ("TagLanguageBCP47", S), 0x4484 => ("TagDefault", U), 0x4487 => ("TagString", S), 0x4485 => ("TagBinary", B),
        0x1C53BB6B => ("Cues", M), 0xBB => ("CuePoint", M), 0xB3 => ("CueTime", U), 0xB7 => ("CueTrackPositions", M), 0xF7 => ("CueTrack", U),
        0xF1 => ("CueClusterPosition", U), 0xF0 => ("CueRelativePosition", U), 0xB2 => ("CueDuration", U), 0x5378 => ("CueBlockNumber", U),
        0x1F43B675 => ("Cluster", M), 0xE7 => ("Timestamp", U), 0xA7 => ("Position", U), 0xAB => ("PrevSize", U), 0xA3 => ("SimpleBlock", B),
        0xA0 => ("BlockGroup", M), 0xA1 => ("Block", B), 0x9B => ("BlockDuration", U), 0xFB => ("ReferenceBlock", I), 0x75A2 => ("DiscardPadding", I),
        _ => return None,
    })
}

/// ชั้นระดับหนึ่งใน Segment · ก้อนที่ไม่รู้ขนาดจบเมื่อเจอชั้นพวกนี้
fn level1(id: u32) -> bool {
    matches!(id, 0x114D9B74 | 0x1549A966 | 0x1654AE6B | 0x1043A770 | 0x1941A469 | 0x1254C367 | 0x1C53BB6B | 0x1F43B675)
}

const MAX_NODES: usize = 6000;
const SHOW_CLUSTERS: usize = 3;
const SHOW_CUES: usize = 5;
const SHOW_BLOCKS: usize = 4;

struct Reader {
    f: BufReader<File>,
    len: u64,
    nodes: usize,
    scale: u64,
    /// ชื่อของชั้นตามรหัส ใช้กับ SeekID
    cut: bool,
}

impl Reader {
    fn at(&mut self, pos: u64) -> Option<()> { self.f.seek(SeekFrom::Start(pos)).ok().map(|_| ()) }
    fn byte(&mut self) -> Option<u8> { let mut b = [0u8; 1]; self.f.read_exact(&mut b).ok()?; Some(b[0]) }
    /// รหัสชั้น เก็บบิตนำหน้าไว้ตามแบบ EBML (1 ถึง 4 ไบต์)
    fn id(&mut self) -> Option<(u32, u64)> {
        let b = self.byte()?;
        let n = b.leading_zeros() as u64 + 1;
        if n > 4 { return None; }
        let mut v = b as u32;
        for _ in 1..n { v = (v << 8) | self.byte()? as u32; }
        Some((v, n))
    }
    /// ขนาดข้อมูล (1 ถึง 8 ไบต์) · ทุกบิตเป็น 1 = ไม่รู้ขนาด
    fn size(&mut self) -> Option<(Option<u64>, u64)> {
        let b = self.byte()?;
        let n = b.leading_zeros() as u64 + 1;
        if n > 8 { return None; }
        let mask = if n == 8 { 0 } else { 0xFFu8 >> n };
        let mut v = (b & mask) as u64;
        let mut all = v == mask as u64;
        for _ in 1..n { let x = self.byte()?; all &= x == 0xFF; v = (v << 8) | x as u64; }
        Some((if all { None } else { Some(v) }, n))
    }
    fn bytes(&mut self, n: u64) -> Option<Vec<u8>> {
        if n > 1 << 20 { return None; }
        let mut v = vec![0u8; n as usize];
        self.f.read_exact(&mut v).ok()?;
        Some(v)
    }
}

/// เวลานาโนวินาทีเป็น ชั่วโมง:นาที:วินาที.มิลลิวินาที
pub fn ns_time(ns: u64) -> String {
    let ms = ns / 1_000_000;
    format!("{}:{:02}:{:02}.{:03}", ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, ms % 1000)
}

/// วันที่ของ DateUTC (นาโนวินาทีนับจาก 2001-01-01 UTC) แบบ 2026-11-15 08:30:00 UTC
fn date_text(ns: i64) -> String {
    let secs = 978_307_200i64 + ns.div_euclid(1_000_000_000);
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    // วันที่จากจำนวนวันนับจาก 1970 (วิธี civil_from_days ของ Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02} {:02}:{:02}:{:02} UTC", rem / 3600, rem / 60 % 60, rem % 60)
}

fn uint(b: &[u8]) -> u64 { b.iter().fold(0u64, |a, x| (a << 8) | *x as u64) }
fn int(b: &[u8]) -> i64 { if b.is_empty() { 0 } else { let u = uint(b); let bits = 64 - 8 * b.len() as u32; ((u << bits) as i64) >> bits } }
fn n_text(n: u64) -> String {
    let s = n.to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() { if i > 0 && (s.len() - i) % 3 == 0 { out.push(','); } out.push(c); }
    out
}

/// ค่าของชั้นเป็นข้อความที่อ่านได้ · บางชั้นแปลงหน่วยให้ เช่นเวลา ชนิดแทร็ก
fn value_of(r: &mut Reader, name: &str, t: T, size: u64) -> Option<String> {
    use T::*;
    if matches!(t, B) {
        return Some(match name {
            "SeekID" => { let b = r.bytes(size.min(4))?; let id = uint(&b) as u32; element(id).map(|e| e.0.to_string()).unwrap_or_else(|| format!("0x{id:X}")) }
            "SimpleBlock" | "Block" => { let b = r.bytes(size.min(16))?; block_text(&b, name == "SimpleBlock").unwrap_or_else(|| format!("{} ไบต์", n_text(size))) }
            "SegmentUUID" => { let b = r.bytes(size.min(16))?; b.iter().map(|x| format!("{x:02x}")).collect() }
            _ => format!("{} ไบต์", n_text(size)),
        });
    }
    if size > 4096 { return Some(format!("{} ไบต์", n_text(size))); }
    let b = r.bytes(size)?;
    Some(match t {
        U => {
            let v = uint(&b);
            match name {
                "TrackType" => format!("{v} {}", match v { 1 => "video", 2 => "audio", 3 => "complex", 16 => "logo", 17 => "subtitle", 18 => "buttons", 32 => "control", 33 => "metadata", _ => "" }).trim().to_string(),
                "TimestampScale" => { r.scale = v.max(1); format!("{} ns", n_text(v)) }
                "ChapterTimeStart" | "ChapterTimeEnd" => ns_time(v),
                "DefaultDuration" => format!("{} ns ({:.3} ต่อวินาที)", n_text(v), if v > 0 { 1e9 / v as f64 } else { 0.0 }),
                "CueTime" | "Timestamp" => format!("{} ({})", n_text(v), ns_time(v.saturating_mul(r.scale))),
                "CodecDelay" | "SeekPreRoll" => format!("{} ns", n_text(v)),
                "TrackUID" | "ChapterUID" | "EditionUID" | "FileUID" | "TagTrackUID" | "TagChapterUID" | "TagEditionUID" | "TagAttachmentUID" => v.to_string(),
                _ => n_text(v),
            }
        }
        I => int(&b).to_string(),
        F => {
            let f = match b.len() { 4 => f32::from_be_bytes(b[..4].try_into().ok()?) as f64, 8 => f64::from_be_bytes(b[..8].try_into().ok()?), _ => 0.0 };
            if name == "Duration" { format!("{f} ({})", ns_time((f * r.scale as f64) as u64)) } else { format!("{f}") }
        }
        S => { let s = String::from_utf8_lossy(&b).trim_end_matches('\0').to_string(); if s.chars().count() > 200 { format!("{}…", s.chars().take(200).collect::<String>()) } else { s } }
        D => date_text(int(&b)),
        _ => String::new(),
    })
}

/// หัวของก้อนข้อมูล แทร็กไหน เวลาห่างจากเวลาของ Cluster กี่หน่วย และเป็น keyframe ไหม
fn block_text(b: &[u8], simple: bool) -> Option<String> {
    let first = *b.first()?;
    let n = first.leading_zeros() as usize + 1;
    if n > 8 || b.len() < n + 3 { return None; }
    let mask = if n == 8 { 0 } else { 0xFFu8 >> n };
    let track = b[1..n].iter().fold((first & mask) as u64, |a, x| (a << 8) | *x as u64);
    let rel = i16::from_be_bytes([b[n], b[n + 1]]);
    let key = simple && b[n + 2] & 0x80 != 0;
    Some(format!("แทร็ก {track} เวลา {rel:+}{}", if key { " keyframe" } else { "" }))
}

/// อ่านชั้นลูกจาก start ถึง end · คืนรายการชั้นกับตำแหน่งที่หยุด (ก้อนไม่รู้ขนาดหยุดเมื่อเจอชั้นระดับหนึ่ง)
fn parse(r: &mut Reader, start: u64, end: u64, parent: &str, depth: usize) -> (Vec<Node>, u64) {
    let mut out: Vec<Node> = vec![];
    let mut pos = start;
    let (mut clusters, mut cues, mut blocks) = (0usize, 0usize, 0usize);
    let mut cluster_bytes = 0u64;
    while pos < end {
        if r.at(pos).is_none() { break; }
        let Some((id, il)) = r.id() else { break };
        // ก้อนที่ไม่รู้ขนาดจบเมื่อเจอชั้นระดับหนึ่งชั้นถัดไป
        if parent == "Cluster" && level1(id) { return (finish(out, clusters, cues, blocks, cluster_bytes), pos); }
        let Some((size, sl)) = r.size() else { break };
        let data = pos + il + sl;
        let (name, t) = element(id).map(|(n, t)| (n.to_string(), t)).unwrap_or_else(|| (format!("ไม่รู้จัก 0x{id:X}"), T::B));
        let mut node = Node { name: name.clone(), id: format!("0x{id:X}"), pos, size, value: None, kids: vec![] };
        let elem_end = size.map(|s| data.saturating_add(s)).unwrap_or(end).min(r.len);
        // นับไว้ แต่ไม่แสดงทั้งหมด · ก้อนข้อมูลกับสารบัญกระโดดมีเป็นพัน
        let hide = (name == "Cluster" && clusters >= SHOW_CLUSTERS) || (name == "CuePoint" && cues >= SHOW_CUES)
            || ((name == "SimpleBlock" || name == "BlockGroup") && blocks >= SHOW_BLOCKS) || r.nodes >= MAX_NODES;
        if r.nodes >= MAX_NODES { r.cut = true; }
        let mut next = elem_end;
        if t == T::M && depth < 12 {
            if hide {
                if size.is_none() && name == "Cluster" { next = skip_unknown(r, data, end); }
            } else {
                let (kids, stop) = parse(r, data, elem_end, &name, depth + 1);
                node.kids = kids;
                if size.is_none() { next = stop; }
            }
        } else if !hide && size.is_some() {
            if r.at(data).is_some() { node.value = value_of(r, &name, t, size.unwrap_or(0)); }
        }
        match name.as_str() { "Cluster" => { clusters += 1; cluster_bytes += next - pos; } "CuePoint" => cues += 1, "SimpleBlock" | "BlockGroup" => blocks += 1, _ => {} }
        if !hide { r.nodes += 1; out.push(node); }
        if next <= pos { break; }
        pos = next;
    }
    (finish(out, clusters, cues, blocks, cluster_bytes), pos.min(end))
}

/// แถวสรุปของที่ไม่แสดง
fn finish(mut out: Vec<Node>, clusters: usize, cues: usize, blocks: usize, cluster_bytes: u64) -> Vec<Node> {
    if clusters > SHOW_CLUSTERS { out.push(Node { name: "Cluster".into(), value: Some(format!("ทั้งหมด {} ก้อน ข้อมูลภาพเสียง {} ไบต์ แสดงแค่ {SHOW_CLUSTERS} ก้อนแรก", n_text(clusters as u64), n_text(cluster_bytes))), ..Default::default() }); }
    if cues > SHOW_CUES { out.push(Node { name: "CuePoint".into(), value: Some(format!("ทั้งหมด {} จุด แสดงแค่ {SHOW_CUES} จุดแรก", n_text(cues as u64))), ..Default::default() }); }
    if blocks > SHOW_BLOCKS { out.push(Node { name: "SimpleBlock".into(), value: Some(format!("ทั้งหมด {} ก้อนใน Cluster นี้ แสดงแค่ {SHOW_BLOCKS} ก้อนแรก", n_text(blocks as u64))), ..Default::default() }); }
    out
}

/// ข้าม Cluster ที่ไม่รู้ขนาดโดยไม่เก็บชั้นลูก · คืนตำแหน่งของชั้นระดับหนึ่งถัดไป
fn skip_unknown(r: &mut Reader, start: u64, end: u64) -> u64 {
    let mut pos = start;
    while pos < end {
        if r.at(pos).is_none() { break; }
        let Some((id, il)) = r.id() else { break };
        if level1(id) { return pos; }
        let Some((Some(size), sl)) = r.size() else { break };
        pos += il + sl + size;
    }
    end
}

/// อ่านโครงสร้างทั้งไฟล์ · ไม่ใช่ไฟล์ Matroska (ชั้นแรกไม่ใช่ EBML) บอกตรง ๆ
pub fn tree(path: &Path) -> Result<Node, String> {
    let f = File::open(path).map_err(|e| format!("เปิดไฟล์ไม่ได้ {e}"))?;
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    let mut r = Reader { f: BufReader::with_capacity(1 << 16, f), len, nodes: 0, scale: 1_000_000, cut: false };
    r.at(0).ok_or("อ่านไฟล์ไม่ได้")?;
    if r.id().map(|x| x.0) != Some(0x1A45DFA3) { return Err("ไฟล์นี้ไม่ใช่ไฟล์ Matroska (MKV MKA MKS หรือ WebM)".into()); }
    let (kids, _) = parse(&mut r, 0, len, "", 0);
    let mut root = Node { name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), id: String::new(), pos: 0, size: Some(len), value: None, kids };
    if r.cut { root.kids.push(Node { name: "แสดงไม่หมด".into(), value: Some(format!("ไฟล์นี้มีชั้นเกิน {} ชั้น โปรแกรมแสดงแค่ส่วนแรก", n_text(MAX_NODES as u64))), ..Default::default() }); }
    Ok(root)
}

#[tauri::command]
pub async fn mkv_tree(path: String) -> Result<Node, String> {
    tauri::async_runtime::spawn_blocking(move || tree(Path::new(&path))).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
#[path = "mkvtree_tests.rs"]
mod tests;
