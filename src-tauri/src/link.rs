//! จับคู่รูปปกกับไฟล์หนัง โดยไม่รวมเข้าไฟล์ (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
//! พี่กันสั่ง 8 พ.ย. 2569 *"เเม้โปสเต้อ เเละวิดีโอจะอยู่คนละที่ เเต่โปรแกรมจะจับคู่กันได้ โดยไม่ต้อง merge"*
//! ทุกวิธีจับคู่ (อัตโนมัติ กระดาน ลากจาก Explorer ปุ่มบนชั้นวาง) ยังไม่บันทึก ไปรอที่ตารางตรวจผล
//! คู่ที่รอยืนยันเก็บใน pending.json ปิดเปิดโปรแกรมไม่หาย · ยืนยันแล้วค่อยเก็บรูปจริง
//! 🔴 ไฟล์หนังไม่ถูกแตะ · รูปต้นฉบับไม่ถูกแก้ · ขั้นนี้อ่านอย่างเดียว ของที่เขียนมีแค่ pending.json กับภาพเล็กในโฟลเดอร์ของโปรแกรม

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use image::{imageops, ImageDecoder, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::library::{LibraryStore, Movie};
use crate::poster_image::{self as pi, Geometry};
use crate::store::write_atomic;

// ---------------------------------------------------------------- เทียบชื่อ (ฟังก์ชันล้วน)

/// ชื่อที่ตัดของไม่เกี่ยวออกแล้ว
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Title {
    /// ตัวเล็ก ไม่มีช่องว่าง ไว้เทียบ · ว่าง = ในชื่อไม่เหลือชื่อเรื่องเลย (folder poster)
    pub key: String,
    /// ชื่อสำหรับแสดง เช่น ดาวเหนือ (2023)
    pub pretty: String,
    pub year: Option<u32>,
    pub imdb: Option<String>,
    /// เลขปีลอยท้ายชื่อ คั่นด้วยช่องว่าง ไม่มีวงเล็บ เช่น Wonder Woman 1984 · อาจเป็นส่วนของชื่อเรื่อง ตัดสินจากชื่ออย่างเดียวไม่ได้
    pub loose_year: bool,
}

/// ความละเอียด แหล่ง ตัวแปลง · เจอคำนี้แปลว่าชื่อเรื่องจบแล้ว ที่ตามมาเป็นชื่อทีมทำไฟล์
const JUNK_START: [&str; 40] = [
    "2160p", "1080p", "1080i", "720p", "576p", "480p", "4k", "8k", "uhd", "hd", "fhd", "bluray", "blu", "bdrip", "brrip", "bdremux", "remux", "web", "webdl", "webrip",
    "hdtv", "dvdrip", "dvd", "hdrip", "hdr", "sdr", "dv", "x264", "x265", "h264", "h265", "hevc", "avc", "av1", "xvid", "aac", "ac3", "dts", "ddp", "atmos",
];
/// คำบอกแหล่งที่เป็นคำธรรมดาได้ด้วย (The Web · Atmos) · ตัดเมื่อมีคำบอกแหล่งตามหลัง หรือตามคำบอกชนิดรูป
const JUNK_WEAK: [&str; 13] = ["web", "hd", "dv", "dvd", "blu", "uhd", "hdr", "sdr", "4k", "8k", "avc", "dts", "atmos"];
const JUNK_FOLLOW: [&str; 4] = ["dl", "rip", "ray", "rc"];
/// คำที่บอกว่าเป็นรูป ไม่ใช่ชื่อเรื่อง
const ART_WORDS: [&str; 17] = ["poster", "cover", "folder", "fanart", "backdrop", "landscape", "thumb", "banner", "keyart", "clearart", "logo", "art", "alt", "final", "ปก", "โปสเตอร์", "ภาพปก"];
/// ชื่อไฟล์หนังแบบทั่วไปที่ไม่ได้บอกว่าเรื่องอะไร ใช้ชื่อโฟลเดอร์แทน
const GENERIC_STEMS: [&str; 7] = ["movie", "film", "video", "main", "feature", "หนัง", "ภาพยนตร์"];
/// ชื่อรูปข้างไฟล์หนังแบบทั่วไป ใช้ได้เฉพาะโฟลเดอร์ที่มีหนังเรื่องเดียว
const GENERIC_ART: [&str; 6] = ["folder", "poster", "cover", "movie", "default", "ปก"];
/// ชื่อคล้ายกันตั้งแต่ค่านี้ขึ้นไป เสนอเป็นรูปใกล้เคียง
const UNSURE_MIN: f64 = 0.6;

fn is_sep(c: char) -> bool {
    c.is_whitespace() || matches!(c, '.' | '_' | '-' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | '+' | '!' | ':' | ';' | '&' | '~' | '#')
}

/// หาเลข IMDb เช่น tt1234567 · หน้าเลขต้องไม่ติดตัวอักษรอื่น
pub fn find_imdb(s: &str) -> Option<String> {
    let low = s.to_lowercase();
    let b = low.as_bytes();
    let mut i = 0;
    while i + 2 < b.len() {
        if b[i] == b't' && b[i + 1] == b't' && (i == 0 || !b[i - 1].is_ascii_alphanumeric()) {
            let digits = b[i + 2..].iter().take_while(|c| c.is_ascii_digit()).count();
            if (7..=9).contains(&digits) && !b.get(i + 2 + digits).is_some_and(|c| c.is_ascii_alphanumeric()) {
                return Some(low[i..i + 2 + digits].to_string());
            }
        }
        i += 1;
    }
    None
}

/// ปีปัจจุบันโดยประมาณ · เลขเกินปีหน้าไม่ใช่ปีฉาย เช่น Blade Runner 2049
fn year_limit() -> u32 {
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    1970 + (secs / 31_556_952) as u32 + 1
}

/// ชื่อรูป · แยกชื่อเรื่องออกจากชื่อไฟล์ (ไม่รวมนามสกุล)
pub fn parse_title(stem: &str) -> Title {
    parse_name(stem, true)
}

/// ① รูปตัดเลขสำเนาของ Windows เช่น ember (1) · หนังไม่ตัด เพราะ Rocky (2) คือชื่อเรื่อง ② ดึงเลข IMDb ③ ปีตัวสุดท้ายที่ไม่ใช่คำแรก ที่ตามหลังปีตัดทิ้ง
/// ④ ไม่มีปี ตัดตั้งแต่คำบอกความละเอียดหรือแหล่งเป็นต้นไป · มีปีไม่ต้องดู ชื่อเรื่องคือที่อยู่หน้าปี (The Web (2013))
/// ⑤ รูปตัดคำว่า poster cover folder เฉพาะหัวกับท้ายชื่อ · หนังไม่ตัด (The Final Cut · Cover)
fn parse_name(stem: &str, image: bool) -> Title {
    let mut s = stem.trim().to_string();
    if image && s.ends_with(')') {
        if let Some(open) = s.rfind('(') {
            let inner = &s[open + 1..s.len() - 1];
            if !inner.is_empty() && inner.len() <= 2 && inner.bytes().all(|c| c.is_ascii_digit()) {
                s.truncate(open);
            }
        }
    }
    let imdb = find_imdb(&s);
    if let Some(id) = &imdb {
        // ตัดเลข IMDb ออกจากชื่อ ไม่ให้ไปปนเป็นชื่อเรื่อง · ตำแหน่งไบต์ในตัวเล็กอาจไม่ตรงตัวเดิม เทียบทีละคำแทน
        s = s.split(is_sep).filter(|w| !w.eq_ignore_ascii_case(id)).collect::<Vec<_>>().join(" ");
    }
    let mut words: Vec<&str> = s.split(is_sep).filter(|w| !w.is_empty()).collect();
    let limit = year_limit();
    let is_year = |w: &str| w.len() == 4 && w.bytes().all(|c| c.is_ascii_digit()) && w.parse::<u32>().is_ok_and(|y| (1900..=limit).contains(&y));
    let year_at = words.iter().enumerate().skip(1).filter(|(_, w)| is_year(w)).map(|(i, _)| i).last();
    let year = year_at.and_then(|i| words[i].parse::<u32>().ok());
    // เลขปีเป็นคำสุดท้าย ไม่มีวงเล็บ คั่นด้วยช่องว่างล้วน · แบบ Silent.Orbit.2018 กับ iron-tide-2024 เป็นปีแน่ ไม่นับ
    let loose_year = year_at.is_some_and(|i| i + 1 == words.len()) && !s.contains(['(', '[', '.', '_', '-']);
    if let Some(i) = year_at {
        words.truncate(i);
    } else {
        let low: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();
        let cut = low.iter().enumerate().skip(1).find(|(i, w)| {
            if !JUNK_START.contains(&w.as_str()) { return false; }
            if !JUNK_WEAK.contains(&w.as_str()) { return true; }
            let next = low.get(i + 1).map(String::as_str).unwrap_or("");
            JUNK_START.contains(&next) || JUNK_FOLLOW.contains(&next) || ART_WORDS.contains(&low[i - 1].as_str())
        }).map(|(i, _)| i);
        if let Some(i) = cut { words.truncate(i); }
    }
    if image {
        while words.first().is_some_and(|w| ART_WORDS.contains(&w.to_lowercase().as_str())) { words.remove(0); }
        while words.last().is_some_and(|w| ART_WORDS.contains(&w.to_lowercase().as_str())) { words.pop(); }
    }
    let key: String = words.iter().map(|w| w.to_lowercase().replace(['\'', '’'], "")).collect();
    let name = words.join(" ");
    let pretty = match year {
        Some(y) if !name.is_empty() => format!("{name} ({y})"),
        _ => name,
    };
    Title { key, pretty, year, imdb, loose_year }
}

/// ชื่อเรื่องของไฟล์หนัง · ไฟล์ชื่อทั่วไป (movie.mkv) ใช้ชื่อโฟลเดอร์แทน
pub fn movie_title(path: &Path) -> Title {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    if GENERIC_STEMS.contains(&stem.to_lowercase().as_str()) {
        if let Some(dir) = path.parent().and_then(|p| p.file_name()) {
            return parse_name(&dir.to_string_lossy(), false);
        }
    }
    parse_name(&stem, false)
}

fn levenshtein(a: &[char], b: &[char]) -> usize {
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    for (i, ca) in a.iter().enumerate() {
        let mut cur = vec![i + 1];
        for (j, cb) in b.iter().enumerate() {
            cur.push((prev[j] + usize::from(ca != cb)).min(prev[j + 1] + 1).min(cur[j] + 1));
        }
        prev = cur;
    }
    prev[b.len()]
}

/// ชื่อคล้ายกันแค่ไหน 0 ถึง 1 · เอาค่ามากกว่าของ พิมพ์ต่างกันกี่ตัว กับ มีคู่ตัวอักษรร่วมกันกี่คู่
/// อย่างหลังจับชื่อที่สลับคำได้ เช่น เมืองในหมอก กับ หมอกเมือง 2
pub fn similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let (ca, cb): (Vec<char>, Vec<char>) = (a.chars().collect(), b.chars().collect());
    let lev = 1.0 - levenshtein(&ca, &cb) as f64 / ca.len().max(cb.len()) as f64;
    // ชื่อหนึ่งเป็นต้นของอีกชื่อ มักเป็นภาคต่อ คนละเรื่อง (เมืองในหมอก กับ เมืองในหมอก ภาค 2) ไม่ให้คู่ตัวอักษรดันคะแนนขึ้นเหนือชื่อที่คล้ายจริง
    if a.starts_with(b) || b.starts_with(a) {
        return lev;
    }
    let pairs = |v: &[char]| v.windows(2).map(|w| (w[0], w[1])).collect::<Vec<_>>();
    let (pa, mut pb) = (pairs(&ca), pairs(&cb));
    let total = pa.len() + pb.len();
    let mut same = 0;
    for p in &pa {
        if let Some(i) = pb.iter().position(|q| q == p) {
            pb.swap_remove(i);
            same += 1;
        }
    }
    let dice = if total == 0 { 0.0 } else { 2.0 * same as f64 / total as f64 };
    lev.max(dice)
}

// ---------------------------------------------------------------- ปกที่ยืนยันแล้ว เก็บในคลังหนัง

/// ปกจับคู่หนึ่งช่องของหนัง (ปกตั้งหรือปกนอน)
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct LinkedCover {
    /// tall · wide
    pub orient: String,
    /// รูปต้นทาง · รูปต้นฉบับไม่ถูกแก้
    pub source: String,
    pub geo: Option<Geometry>,
    /// beside ข้างไฟล์หนัง · app ในโปรแกรม · link จับคู่อย่างเดียว
    pub store: String,
    /// ไฟล์ที่เก็บจริง · link ไม่มี
    pub file: Option<String>,
    /// โปรแกรมทำไฟล์นี้เอง · ไม่ใช่ของโปรแกรมห้ามลบห้ามเปลี่ยนชื่อ
    pub owned: bool,
    /// ค่า hash ตอนเขียน เช็กก่อนลบว่าเป็นไฟล์เดิมที่โปรแกรมทำ
    pub sha256: Option<String>,
    /// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม สำเนาที่สองอยู่ตรงนี้ ไบต์เดียวกับ file ค่า hash เดียวกัน
    pub app_copy: Option<String>,
    pub thumb: String,
    pub aspect: f32,
    pub at: i64,
    /// ผู้ใช้ครอปเอง · ไม่ใช่ค่ากลางรูปที่โปรแกรมตั้งให้ แผงขวาของชั้นวางกับป้ายในตารางอ่านตัวนี้
    #[serde(default)]
    pub cropped: bool,
}

// ---------------------------------------------------------------- แถวในตารางตรวจผล

/// รูปที่เลือกให้ปกหนึ่งช่อง
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Pick {
    pub path: String,
    pub name: String,
    /// โฟลเดอร์ของรูป บอกบนจอ
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
    /// ค่าครอปที่ตั้งเอง · ไม่มี = ครอปกลางรูปตอนยืนยัน
    pub geo: Option<Geometry>,
    /// ภาพเล็กหลังครอป ตารางโชว์ตัวนี้ก่อน คนเห็นว่าครอปแล้วได้อะไร
    pub crop_thumb: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Row {
    /// เลขประจำไฟล์ของหนัง (Movie.id)
    pub id: String,
    pub movie: String,
    pub title: String,
    pub has_cover: bool,
    /// sure จับคู่ได้แน่ · unsure ไม่แน่ใจ · none หาคู่ไม่เจอ · manual จับคู่เอง · saved ยืนยันแล้ว
    pub status: String,
    /// เหตุที่จับคู่ ขึ้นในตาราง
    pub reason: String,
    /// auto · board · explorer · shelf ช่องเหตุที่จับคู่บอกว่ามาจากทางไหน
    pub via: String,
    pub tall: Option<Pick>,
    pub wide: Option<Pick>,
    /// ปกตั้งครอปกลางจากรูปแนวนอนให้เอง
    pub derived_tall: bool,
    /// รูปใกล้เคียงให้กดเลือก
    pub candidates: Vec<Pick>,
    /// ชื่อคล้ายกันกี่เปอร์เซ็นต์
    pub score: u8,
    pub ticked: bool,
    /// ยืนยันแล้วล้มเพราะอะไร
    pub error: Option<String>,
    /// แถวก่อนจับคู่เอง ไว้กดย้อน
    pub prev: Option<Box<Row>>,
    /// ไฟล์ปลายทางที่มีอยู่แล้วและไม่ใช่ของโปรแกรม ไม่เขียนทับ รอเลือกทางแก้
    pub conflict: Option<String>,
    /// แถวนี้เก็บแบบอื่นแทนค่าในหน้าตั้งค่า (กดเก็บในโปรแกรมแทนตอนชื่อชน)
    pub store_override: Option<String>,
    /// ผู้ใช้แตะแถวนี้แล้ว (ครอป ติ๊ก เลือกรูป) · จับคู่อัตโนมัติรอบใหม่ห้ามทับ · แถวจากชั้นวางที่ยังไม่แตะไม่นับว่ารอยืนยัน
    pub touched: bool,
}

impl Row {
    pub fn has_image(&self) -> bool {
        self.tall.is_some() || self.wide.is_some()
    }
}

/// ชื่อเรื่องสำหรับแสดงบนกระดาน ใช้ตัวเทียบชื่อตัวเดียวกับตาราง · ตัดปี ความละเอียด ชื่อทีมทำไฟล์
#[tauri::command]
pub fn link_titles(paths: Vec<String>) -> Vec<String> {
    paths.iter().map(|p| movie_title(Path::new(p)).pretty).collect()
}

/// ของที่ลากมาเป็นโฟลเดอร์ไหม · เดาจากจุดในชื่อไม่ได้ โฟลเดอร์ชื่อ Dune.2021 มีจุดเหมือนนามสกุล
#[tauri::command]
pub fn link_is_dir(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_dir()).collect()
}

/// ใส่รูปลงช่องตามแนวของรูป · รูปแนวนอนเป็นปกนอนอย่างเดียว ไม่ครอปกลางเป็นปกตั้งให้เอง
/// (พี่กันเคาะ 10 พ.ย. 2569 *"ไม่ได้ ๆ ถ้ารูปไหนแนวนอน ก็ต้องแสดงแนวนอน"* · เดิมครอปกลางให้ หน้านักแสดงหลุดได้)
/// ปกตั้งที่ครอปให้เองจากรอบก่อนถูกเอาออกตอนใส่รูปแนวนอนใหม่
pub fn assign(row: &mut Row, pick: Pick) {
    if pick.width > pick.height {
        if row.derived_tall { row.tall = None; row.derived_tall = false; }
        row.wide = Some(pick);
    } else {
        row.tall = Some(pick);
        row.derived_tall = false;
    }
}

// ---------------------------------------------------------------- ตัวจับคู่อัตโนมัติ (ฟังก์ชันล้วน เทสได้โดยไม่ต้องอ่านดิสก์)

#[derive(Clone, Debug, PartialEq, Default)]
pub struct ImgIn {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
}

impl ImgIn {
    fn stem(&self) -> String {
        Path::new(&self.name).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
    }
    fn pick(&self) -> Pick {
        Pick { path: self.path.clone(), name: self.name.clone(), folder: self.folder.clone(), width: self.width, height: self.height, thumb: self.thumb.clone(), geo: None, crop_thumb: None }
    }
}

#[derive(Clone, Debug, Default)]
pub struct MovieIn {
    pub id: String,
    pub path: String,
    pub stem: String,
    pub title: Title,
    pub has_cover: bool,
    /// เลข IMDb จากชื่อไฟล์หรือไฟล์ .nfo ข้างหนัง
    pub imdb: Option<String>,
    /// รูปในโฟลเดอร์เดียวกับไฟล์หนัง
    pub beside: Vec<ImgIn>,
    /// โฟลเดอร์นี้มีหนังเรื่องเดียว ชื่อทั่วไปอย่าง folder.jpg จึงเป็นของเรื่องนี้แน่
    pub alone: bool,
}

fn pct(s: f64) -> u8 {
    (s * 100.0).round().clamp(0.0, 100.0) as u8
}

/// รูปนี้เป็นรูปข้างไฟล์ของหนังเรื่องนี้ไหม · ชื่อเหมือนไฟล์หนัง หรือลงท้าย -poster -landscape แบบที่ Kodi อ่าน
fn is_beside_art(img_stem: &str, m: &MovieIn) -> bool {
    let (i, s) = (img_stem.to_lowercase(), m.stem.to_lowercase());
    if i == s {
        return true;
    }
    if let Some(rest) = i.strip_prefix(&s) {
        let rest = rest.trim_start_matches(['-', '.', '_', ' ']);
        if rest != i.as_str() && ["poster", "cover", "landscape", "fanart", "thumb", "folder"].contains(&rest) {
            return true;
        }
    }
    m.alone && GENERIC_ART.contains(&i.as_str())
}

/// จับคู่ทั้งชุด · ลำดับตามกล่องอธิบายในมอคอัป
/// ① รูปข้างไฟล์หนัง ② เลข IMDb ③ ชื่อกับปีตรง ④ ชื่อตรง ฝั่งใดฝั่งหนึ่งไม่มีปี และไม่ซ้ำกับเรื่องอื่น ⑤ ชื่อคล้าย
/// รูปหนึ่งรูปได้หนังเรื่องเดียว · `shelf` คือชื่อหนังทั้งชั้น ไว้ดูว่าชื่อซ้ำไหม (ภาคต่อ รีเมก) · `taken` รูปที่จับคู่เองไปแล้ว
pub fn match_core(movies: &[MovieIn], shelf: &[Title], images: &[ImgIn], taken: &HashSet<String>) -> Vec<Row> {
    let lower = |p: &str| p.to_lowercase();
    let mut used: HashSet<String> = taken.iter().map(|p| lower(p)).collect();
    let mut rows: Vec<Row> = movies.iter().map(|m| Row {
        id: m.id.clone(), movie: m.path.clone(), title: if m.title.pretty.is_empty() { m.stem.clone() } else { m.title.pretty.clone() },
        has_cover: m.has_cover, status: "none".into(), reason: "หาคู่ไม่เจอ".into(), via: "auto".into(), ..Default::default()
    }).collect();
    let titles: Vec<Title> = images.iter().map(|i| parse_title(&i.stem())).collect();
    let dup = |key: &str| shelf.iter().filter(|t| t.key == key).count() > 1;

    // ใส่รูป · ช่องนั้นมีรูปจริงแล้วไม่ทับ รูปนั้นเหลือไว้บนกระดาน · เหตุผลใช้ของรูปแรก
    fn give(row: &mut Row, img: &ImgIn, reason: &str, tick: bool, used: &mut HashSet<String>) -> bool {
        let wide = img.width > img.height;
        if (wide && row.wide.is_some()) || (!wide && row.tall.is_some() && !row.derived_tall) {
            return false;
        }
        assign(row, img.pick());
        used.insert(img.path.to_lowercase());
        if row.status != "sure" {
            row.status = "sure".into();
            row.reason = reason.to_string();
            row.score = 100;
            row.ticked = tick;
        }
        true
    }

    // ① รูปข้างไฟล์หนัง
    for (r, m) in rows.iter_mut().zip(movies) {
        for img in &m.beside {
            if !used.contains(&lower(&img.path)) && is_beside_art(&img.stem(), m) {
                give(r, img, "รูปอยู่ข้างไฟล์หนัง", true, &mut used);
            }
        }
    }
    // ② เลข IMDb
    for (r, m) in rows.iter_mut().zip(movies) {
        let Some(id) = &m.imdb else { continue };
        for (img, t) in images.iter().zip(&titles) {
            if t.imdb.as_ref() == Some(id) && !used.contains(&lower(&img.path)) {
                give(r, img, "เลข IMDb ตรงกัน", true, &mut used);
            }
        }
    }
    // ③ ชื่อกับปีตรง
    for (r, m) in rows.iter_mut().zip(movies) {
        if m.title.key.is_empty() || m.title.year.is_none() { continue; }
        for (img, t) in images.iter().zip(&titles) {
            if t.key == m.title.key && t.year == m.title.year && !used.contains(&lower(&img.path)) {
                give(r, img, "ชื่อกับปีตรง", true, &mut used);
            }
        }
    }
    // ④ ชื่อตรง ฝั่งใดฝั่งหนึ่งไม่มีปี · ใส่รูปให้แต่ไม่ติ๊ก (มอคอัป คู่ที่ชื่อกับปีตรงกันเท่านั้นที่ติ๊กไว้ให้)
    // ไม่กล้าตัดสิน เป็นไม่แน่ใจพร้อมรูปให้เลือก · ชื่อซ้ำกับเรื่องอื่นบนชั้น · หนังไม่มีปีแต่รูปชื่อนี้มีหลายปี · เลขท้ายชื่ออาจเป็นส่วนของชื่อเรื่อง
    for (r, m) in rows.iter_mut().zip(movies) {
        if m.title.key.is_empty() { continue; }
        let years: HashSet<Option<u32>> = images.iter().zip(&titles).filter(|(img, t)| t.key == m.title.key && !used.contains(&lower(&img.path))).map(|(_, t)| t.year).collect();
        let many_years = m.title.year.is_none() && years.len() > 1;
        for (img, t) in images.iter().zip(&titles) {
            let no_year = t.year.is_none() || m.title.year.is_none();
            if t.key != m.title.key || !no_year || used.contains(&lower(&img.path)) { continue; }
            let why_unsure = if dup(&m.title.key) { Some("ชื่อซ้ำกับเรื่องอื่น รูปไม่มีปี") }
                else if many_years { Some("รูปชื่อนี้มีหลายปี เลือกเอง") }
                else if t.loose_year || m.title.loose_year { Some("เลขท้ายชื่ออาจเป็นส่วนของชื่อเรื่อง เลือกเอง") }
                else { None };
            if let Some(why) = why_unsure {
                if !r.has_image() && !r.candidates.iter().any(|c| c.path == img.path) {
                    r.candidates.push(img.pick());
                    r.status = "unsure".into();
                    r.reason = why.into();
                    r.score = 100;
                }
            } else {
                let why = if t.year.is_none() { "ชื่อตรง ไม่มีปีในชื่อรูป" } else { "ชื่อตรง ไม่มีปีในชื่อไฟล์หนัง" };
                give(r, img, why, false, &mut used);
            }
        }
    }
    // ⑤ ชื่อคล้าย · ไม่ติ๊กให้ ต้องกดเลือกเอง
    for (r, m) in rows.iter_mut().zip(movies) {
        if r.has_image() || !r.candidates.is_empty() || m.title.key.is_empty() { continue; }
        let mut near: Vec<(f64, &ImgIn)> = images.iter().zip(&titles)
            .filter(|(img, _)| !used.contains(&lower(&img.path)))
            .map(|(img, t)| (similarity(&m.title.key, &t.key), img))
            .filter(|(s, _)| *s >= UNSURE_MIN)
            .collect();
        near.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        if let Some((best, _)) = near.first() {
            r.status = "unsure".into();
            r.score = pct(*best);
            r.reason = format!("ไม่แน่ใจ ชื่อคล้าย {}%", r.score);
            r.candidates = near.iter().take(3).map(|(_, i)| i.pick()).collect();
        }
    }
    rows
}

// ---------------------------------------------------------------- ที่เก็บคู่ที่รอยืนยัน

#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct LinkFile {
    pub version: u32,
    pub rows: Vec<Row>,
    /// โฟลเดอร์รูปที่เลือกไว้ เพิ่มได้เรื่อย ๆ
    pub image_folders: Vec<String>,
    /// รูปที่ลากมาทีละรูป ไม่ได้มาทั้งโฟลเดอร์
    pub loose: Vec<String>,
    /// nocover เฉพาะเรื่องที่ยังไม่มีปก · all ทุกเรื่องบนชั้นวาง
    pub scope: String,
}

pub struct LinkStore {
    path: PathBuf,
    pub data: Mutex<LinkFile>,
    save_lock: Mutex<()>,
    thumbing: AtomicBool,
    rethumb: AtomicBool,
    /// กดหยุดงานยืนยัน
    pub stop: AtomicBool,
    /// กำลังยืนยันหรือย้ายที่เก็บ · ระหว่างนี้ห้ามแก้แถวหรือเริ่มงานซ้อน ข้อมูลเก่าจะทับข้อมูลใหม่ (ผู้ช่วยตรวจขั้น 8)
    busy: AtomicBool,
}

const BUSY_MSG: &str = "กำลังยืนยันหรือย้ายที่เก็บรูปอยู่ รอให้เสร็จก่อน";

/// ถือไว้ตลอดงาน หลุดจากขอบเขตเมื่อไหร่ก็ปลดเอง รวมตอนงานล้ม
pub struct BusyGuard(Arc<LinkStore>);
impl Drop for BusyGuard {
    fn drop(&mut self) { self.0.busy.store(false, Ordering::SeqCst); }
}
fn begin_busy(store: &Arc<LinkStore>) -> Result<BusyGuard, String> {
    if store.busy.swap(true, Ordering::SeqCst) { return Err(BUSY_MSG.to_string()); }
    Ok(BusyGuard(store.clone()))
}

/// คู่ที่นับว่ารอยืนยัน · แถวที่เปิดจากชั้นวางแล้วยังไม่ได้แก้อะไร ไม่นับ กดเข้ามาดูแล้วออกต้องไม่ขึ้นเลข ไม่ถามตอนปิด
fn is_waiting(r: &Row) -> bool {
    r.status != "saved" && r.has_image() && !(r.via == "shelf" && !r.touched)
}

fn read_file(path: &Path) -> Option<LinkFile> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

impl LinkStore {
    /// อ่านของเดิม ไฟล์เสียใช้สำรอง · แถวที่ยืนยันแล้วของรอบก่อนไม่ต้องขึ้นตารางอีก
    pub fn load(path: PathBuf) -> Self {
        let mut data = read_file(&path).or_else(|| read_file(&path.with_extension("json.bak"))).unwrap_or_default();
        data.rows.retain(|r| r.status != "saved");
        // คู่ที่ค้างจากรุ่นก่อน ปกตั้งที่ครอปกลางจากรูปแนวนอนให้เอง เอาออก เหลือปกนอนอย่างเดียว (พี่กันเคาะ 10 พ.ย. 2569)
        for r in data.rows.iter_mut().filter(|r| r.derived_tall) { r.tall = None; r.derived_tall = false; }
        if data.scope.is_empty() { data.scope = "nocover".into(); }
        Self { path, data: Mutex::new(data), save_lock: Mutex::new(()), thumbing: AtomicBool::new(false), rethumb: AtomicBool::new(false), stop: AtomicBool::new(false), busy: AtomicBool::new(false) }
    }

    pub fn save(&self) -> Result<(), String> {
        let _one = self.save_lock.lock().unwrap_or_else(|e| e.into_inner());
        let bytes = serde_json::to_vec(&*self.data.lock().unwrap()).map_err(|e| e.to_string())?;
        if let Some(dir) = self.path.parent() { let _ = fs::create_dir_all(dir); }
        let ok = read_file(&self.path).is_some();
        write_atomic(&self.path, &bytes, ok).map_err(|e| format!("บันทึกคู่ที่รอยืนยันไม่สำเร็จ: {e}"))
    }

    /// คู่ที่รอยืนยัน ไว้ขึ้นเลขในเมนูกับถามตอนปิดโปรแกรม
    pub fn waiting(&self) -> usize {
        self.data.lock().unwrap().rows.iter().filter(|r| is_waiting(r)).count()
    }
    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }
    fn idle(&self) -> Result<(), String> {
        if self.is_busy() { Err(BUSY_MSG.to_string()) } else { Ok(()) }
    }
}

pub fn link_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("pending.json"))
}

// ---------------------------------------------------------------- อ่านรูปจากดิสก์

/// ขนาดรูปจากหัวไฟล์ ไม่ถอดทั้งรูป · นับป้ายหมุนของกล้อง · HEIC อ่านไม่ได้ได้ 0 รอตัวทำภาพเล็กบอกขนาด
pub fn header_size(path: &Path) -> (u32, u32) {
    let read = || -> Option<(u32, u32)> {
        let mut dec = ImageReader::open(path).ok()?.with_guessed_format().ok()?.into_decoder().ok()?;
        let (w, h) = dec.dimensions();
        let turned = dec.orientation().map(|o| {
            use image::metadata::Orientation::*;
            matches!(o, Rotate90 | Rotate270 | Rotate90FlipH | Rotate270FlipH)
        }).unwrap_or(false);
        Some(if turned { (h, w) } else { (w, h) })
    };
    read().unwrap_or((0, 0))
}

fn walk_images(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let name = e.file_name().to_string_lossy().to_string();
            if name != "ไฟล์เดิม" && !name.starts_with('$') && !name.starts_with('.') && name != "System Volume Information" {
                walk_images(&p, out);
            }
        } else if ft.is_file() && pi::ACCEPTED.contains(&pi::ext_of(&p).as_str()) {
            out.push(p);
        }
    }
}

/// ชื่อไฟล์ภาพเล็กของรูปต้นทาง ผูกกับที่อยู่ ขนาด เวลาแก้ไข · รูปเปลี่ยนแล้วได้ชื่อใหม่
fn thumb_key(path: &Path) -> String {
    let md = fs::metadata(path).ok();
    let mtime = md.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let text = format!("{}|{}|{mtime}", path.to_string_lossy().to_lowercase(), md.map(|m| m.len()).unwrap_or(0));
    crate::probe::hex(&Sha256::digest(text.as_bytes()))[..20].to_string()
}

/// ภาพเล็กที่ทำไว้แล้ว ชื่อไฟล์ลงท้ายด้วยขนาดรูปจริง key-1000x1500.jpg
fn cached_thumbs(dir: &Path) -> HashMap<String, (PathBuf, u32, u32)> {
    let mut out = HashMap::new();
    let Ok(rd) = fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(stem) = name.strip_suffix(".jpg") else { continue };
        let Some((key, size)) = stem.split_once('-') else { continue };
        let Some((w, h)) = size.split_once('x') else { continue };
        if let (Ok(w), Ok(h)) = (w.parse(), h.parse()) {
            out.insert(key.to_string(), (e.path(), w, h));
        }
    }
    out
}

fn make_src_thumb(tools: &Path, work: &Path, dir: &Path, path: &Path) -> Result<(PathBuf, u32, u32), String> {
    let dec = pi::decode(tools, work, path)?;
    let (w, h) = dec.img.dimensions();
    let scale = (360.0 / w.max(h) as f64).min(1.0);
    let small = if scale < 1.0 {
        imageops::resize(&dec.img, ((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1), imageops::FilterType::Triangle)
    } else {
        dec.img
    };
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{}-{w}x{h}.jpg", thumb_key(path)));
    fs::write(&out, pi::encode(&small, "jpg", 85)?).map_err(|e| e.to_string())?;
    Ok((out, w, h))
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkImage {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
    /// จับคู่ไปแล้ว ไม่ขึ้นบนกระดาน
    pub used: bool,
    pub error: Option<String>,
}

/// รูปทั้งหมดจากโฟลเดอร์ที่เลือกกับรูปที่ลากมาทีละรูป · ซ้ำกันเหลืออันเดียว
pub fn list_images(folders: &[String], loose: &[String], thumbs: &Path) -> Vec<ImgIn> {
    let cache = cached_thumbs(thumbs);
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = vec![];
    let mut push = |p: &Path, folder: &str| {
        if !seen.insert(p.to_string_lossy().to_lowercase()) { return; }
        let hit = cache.get(&thumb_key(p));
        let (width, height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(p));
        out.push(ImgIn {
            path: p.to_string_lossy().to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), folder: folder.to_string(),
            width, height, thumb: hit.map(|h| h.0.to_string_lossy().to_string()),
        });
    };
    for f in folders {
        let mut files = vec![];
        walk_images(Path::new(f), &mut files);
        files.sort_by_key(|p| p.to_string_lossy().to_lowercase());
        for p in files { push(&p, f); }
    }
    for f in loose {
        let p = Path::new(f);
        if p.is_file() { push(p, &p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default()); }
    }
    out
}

/// ข้อมูลหนังสำหรับตัวจับคู่ · อ่านรูปข้างไฟล์กับไฟล์ .nfo
pub fn movie_in(id: &str, path: &str, has_cover: bool, all_dirs: &HashMap<String, usize>, thumbs: &Path, own: &HashSet<String>) -> MovieIn {
    let p = Path::new(path);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let dir = p.parent().unwrap_or(Path::new(""));
    let dir_key = dir.to_string_lossy().to_lowercase();
    let title = movie_title(p);
    let mut imdb = title.imdb.clone();
    let alone = all_dirs.get(&dir_key).copied().unwrap_or(1) <= 1;
    if imdb.is_none() {
        // movie.nfo ใช้เฉพาะโฟลเดอร์ที่มีเรื่องเดียว · โฟลเดอร์รวมหลายเรื่องทุกเรื่องจะได้เลขเดียวกัน
        let nfos = if alone { vec![dir.join(format!("{stem}.nfo")), dir.join("movie.nfo")] } else { vec![dir.join(format!("{stem}.nfo"))] };
        for nfo in nfos {
            if let Ok(b) = fs::read(&nfo) {
                let text = String::from_utf8_lossy(&b[..b.len().min(65536)]).to_string();
                imdb = text.split(|c: char| !c.is_ascii_alphanumeric()).find_map(find_imdb);
                if imdb.is_some() { break; }
            }
        }
    }
    let cache = cached_thumbs(thumbs);
    let mut beside = vec![];
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let f = e.path();
            // ไฟล์ปกที่โปรแกรมทำเองไม่ใช่รูปต้นทาง · ถ้านับ ปกที่ครอปไว้จะกลายเป็นไฟล์ของคนอื่นตอนจับคู่ทุกเรื่องซ้ำ
            if f.is_file() && pi::ACCEPTED.contains(&pi::ext_of(&f).as_str()) && !own.contains(&f.to_string_lossy().to_lowercase()) {
                let hit = cache.get(&thumb_key(&f));
                let (width, height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(&f));
                beside.push(ImgIn {
                    path: f.to_string_lossy().to_string(), name: f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                    folder: dir.to_string_lossy().to_string(), width, height, thumb: hit.map(|h| h.0.to_string_lossy().to_string()),
                });
            }
        }
    }
    beside.sort_by_key(|i| i.name.to_lowercase());
    MovieIn { id: id.to_string(), path: path.to_string(), stem, title, has_cover, imdb, beside, alone }
}

pub fn dir_counts<'a>(paths: impl Iterator<Item = &'a str>) -> HashMap<String, usize> {
    let mut out = HashMap::new();
    for p in paths {
        let d = Path::new(p).parent().map(|d| d.to_string_lossy().to_lowercase()).unwrap_or_default();
        *out.entry(d).or_insert(0) += 1;
    }
    out
}

// ---------------------------------------------------------------- คำสั่งให้หน้าจอเรียก

struct Dirs { tools: PathBuf, work: PathBuf, thumbs: PathBuf }

fn dirs(app: &AppHandle) -> Result<Dirs, String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(Dirs { tools: crate::tools::tools_dir(app)?, work: local.join("tmp"), thumbs: local.join("thumbs").join("link-src") })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkReply {
    pub rows: Vec<Row>,
    pub image_folders: Vec<String>,
    pub loose: Vec<String>,
    pub scope: String,
    pub waiting: usize,
}

/// หนังที่ถูกเปลี่ยนชื่อหรือย้าย แถวตามชื่อใหม่ · หนังที่หายจากคลังแล้ว แถวหายด้วย
fn refresh_rows(data: &mut LinkFile, movies: &[Movie]) {
    // เลขประจำไฟล์เปลี่ยนได้โดยที่เป็นเรื่องเดิม (รวมเสียงเข้าไฟล์ได้ไฟล์ใหม่ชื่อเดิม) หาจากที่อยู่ก่อนทิ้งแถว
    data.rows.retain_mut(|r| match movies.iter().find(|m| m.id == r.id).or_else(|| movies.iter().find(|m| m.path.eq_ignore_ascii_case(&r.movie))) {
        Some(m) => {
            r.id = m.id.clone();
            if r.movie != m.path {
                let t = movie_title(Path::new(&m.path));
                if !t.pretty.is_empty() { r.title = t.pretty; }
                r.movie = m.path.clone();
            }
            r.has_cover = m.has_cover;
            true
        }
        None => false,
    });
}

fn reply(store: &LinkStore, movies: &[Movie]) -> LinkReply {
    let mut d = store.data.lock().unwrap();
    refresh_rows(&mut d, movies);
    let waiting = d.rows.iter().filter(|r| is_waiting(r)).count();
    LinkReply { rows: d.rows.clone(), image_folders: d.image_folders.clone(), loose: d.loose.clone(), scope: d.scope.clone(), waiting }
}

fn movies_of(lib: &LibraryStore) -> Vec<Movie> {
    lib.movies.lock().unwrap().clone()
}

#[tauri::command]
pub fn link_state(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>) -> LinkReply {
    reply(&store, &movies_of(&lib))
}

/// ใส่ภาพเล็กที่ทำเสร็จแล้วลงรูปในแถว · คืนว่ามีอะไรเปลี่ยนไหม
fn fill_thumbs(data: &mut LinkFile, cache: &HashMap<String, (PathBuf, u32, u32)>) -> bool {
    let mut changed = false;
    for r in data.rows.iter_mut() {
        for p in [r.tall.as_mut(), r.wide.as_mut()].into_iter().flatten().chain(r.candidates.iter_mut()) {
            if p.thumb.is_none() {
                if let Some(h) = cache.get(&thumb_key(Path::new(&p.path))) {
                    p.thumb = Some(h.0.to_string_lossy().to_string());
                    if p.width == 0 { p.width = h.1; p.height = h.2; }
                    changed = true;
                }
            }
        }
    }
    changed
}

/// ทำภาพเล็กของรูปที่ยังไม่มี ทีละ 3 รูปพร้อมกัน แจ้งหน้าจอทีละรูป · กำลังทำอยู่แล้วทำอีกรอบตอนจบ
fn start_thumbs(app: &AppHandle) {
    let store = app.state::<Arc<LinkStore>>().inner().clone();
    if store.thumbing.swap(true, Ordering::SeqCst) {
        store.rethumb.store(true, Ordering::SeqCst);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            let Ok(d) = dirs(&app) else { break };
            let (folders, mut loose) = { let x = store.data.lock().unwrap(); (x.image_folders.clone(), x.loose.clone()) };
            // รูปในแถวที่ไม่ได้อยู่ในโฟลเดอร์ที่เลือก (รูปข้างไฟล์หนัง) ก็ต้องมีภาพเล็ก
            loose.extend(store.data.lock().unwrap().rows.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.clone()));
            loose.extend(store.data.lock().unwrap().rows.iter().flat_map(|r| r.candidates.iter()).map(|p| p.path.clone()));
            let todo: Vec<ImgIn> = list_images(&folders, &loose, &d.thumbs).into_iter().filter(|i| i.thumb.is_none()).collect();
            let queue = Mutex::new(todo);
            std::thread::scope(|sc| {
                for _ in 0..3 {
                    sc.spawn(|| loop {
                        let Some(img) = queue.lock().unwrap().pop() else { break };
                        let done = make_src_thumb(&d.tools, &d.work, &d.thumbs, Path::new(&img.path));
                        let msg = match done {
                            Ok((t, w, h)) => LinkImage { path: img.path, name: img.name, folder: img.folder, width: w, height: h, thumb: Some(t.to_string_lossy().to_string()), used: false, error: None },
                            Err(e) => LinkImage { path: img.path, name: img.name, folder: img.folder, width: img.width, height: img.height, thumb: None, used: false, error: Some(e) },
                        };
                        let _ = app.emit("link-thumb", msg);
                    });
                }
            });
            // จดภาพเล็กลงแถว เปิดโปรแกรมครั้งหน้าไม่ต้องรอแจ้งใหม่ · ไม่จด รูปข้างไฟล์หนังขึ้นช่องว่างหลังเปิดหน้าใหม่
            let cache = cached_thumbs(&d.thumbs);
            if fill_thumbs(&mut store.data.lock().unwrap(), &cache) { let _ = store.save(); }
            if !store.rethumb.swap(false, Ordering::SeqCst) { break; }
        }
        store.thumbing.store(false, Ordering::SeqCst);
    });
}

/// ไฟล์ปกที่โปรแกรมทำเอง ตัวเล็กทั้งหมด
fn own_files(movies: &[Movie]) -> HashSet<String> {
    movies.iter().flat_map(|m| &m.linked).flat_map(|c| [c.file.as_ref().filter(|_| c.owned), c.app_copy.as_ref()]).flatten().map(|f| f.to_lowercase()).collect()
}

fn images_now(app: &AppHandle, store: &LinkStore) -> Result<Vec<LinkImage>, String> {
    let d = dirs(app)?;
    let (folders, loose, rows) = { let x = store.data.lock().unwrap(); (x.image_folders.clone(), x.loose.clone(), x.rows.clone()) };
    let mut taken: HashSet<String> = rows.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.to_lowercase()).collect();
    // รูปที่ยืนยันไปรอบก่อนนับว่าใช้แล้ว เปิดโปรแกรมใหม่แล้วไม่กลับมาบนกระดาน · ไฟล์ปกที่โปรแกรมทำเองไม่ขึ้นเลย ไม่ใช่รูปต้นทาง
    let movies = movies_of(&app.state::<Arc<LibraryStore>>());
    taken.extend(movies.iter().flat_map(|m| &m.linked).map(|c| c.source.to_lowercase()));
    let own = own_files(&movies);
    Ok(list_images(&folders, &loose, &d.thumbs).into_iter().filter(|i| !own.contains(&i.path.to_lowercase())).map(|i| LinkImage {
        used: taken.contains(&i.path.to_lowercase()), path: i.path, name: i.name, folder: i.folder, width: i.width, height: i.height, thumb: i.thumb, error: None,
    }).collect())
}

/// รูปทั้งหมดบนกระดาน · เริ่มทำภาพเล็กของรูปที่ยังไม่มี
#[tauri::command]
pub async fn link_images(app: AppHandle) -> Result<Vec<LinkImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let out = images_now(&app, &store)?;
        start_thumbs(&app);
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

/// เพิ่มโฟลเดอร์รูปหรือรูปทีละรูป · ลากมาหลายอย่างปนกันได้ · ไฟล์ที่ไม่ใช่รูปไม่รับ บอกกลับ
#[tauri::command]
pub fn link_add_images(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, paths: Vec<String>) -> Result<LinkReply, String> {
    store.idle()?;
    let mut bad = vec![];
    {
        let mut d = store.data.lock().unwrap();
        for p in paths {
            let path = Path::new(&p);
            if path.is_dir() {
                if !d.image_folders.iter().any(|f| f.eq_ignore_ascii_case(&p)) { d.image_folders.push(p); }
            } else if path.is_file() && pi::ACCEPTED.contains(&pi::ext_of(path).as_str()) {
                if !d.loose.iter().any(|f| f.eq_ignore_ascii_case(&p)) { d.loose.push(p); }
            } else {
                bad.push(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(p));
            }
        }
    }
    store.save()?;
    start_thumbs(&app);
    if !bad.is_empty() {
        return Err(format!("ไฟล์ {} ไม่ใช่รูปจึงไม่รับ  รับรูป JPG PNG WebP BMP TIFF และ HEIC", bad.join(", ")));
    }
    Ok(reply(&store, &movies_of(&lib)))
}

/// เอาโฟลเดอร์รูปหรือรูปออกจากกระดาน · รูปในเครื่องไม่ถูกแตะ
#[tauri::command]
pub fn link_remove_images(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, path: String) -> Result<LinkReply, String> {
    {
        let mut d = store.data.lock().unwrap();
        d.image_folders.retain(|f| !f.eq_ignore_ascii_case(&path));
        d.loose.retain(|f| !f.eq_ignore_ascii_case(&path));
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoSummary {
    pub images: usize,
    pub sure: usize,
    pub unsure: usize,
    pub none: usize,
    /// รูปแนวตั้ง · รูปแนวนอน
    pub tall: usize,
    pub wide: usize,
    pub reply: LinkReply,
}

/// จับคู่อัตโนมัติ · แถวที่จับคู่เองกับแถวที่ยืนยันแล้วคงไว้ แถวอัตโนมัติเดิมถูกแทน · ยังไม่บันทึกอะไรนอกจากรายการรอยืนยัน
#[tauri::command]
pub async fn link_auto(app: AppHandle, scope: String) -> Result<AutoSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let scope = if scope == "all" { "all".to_string() } else { "nocover".to_string() };
        let (folders, loose, keep) = {
            let mut x = store.data.lock().unwrap();
            x.scope = scope.clone();
            (x.image_folders.clone(), x.loose.clone(), x.rows.iter().filter(|r| r.status == "saved" || r.via != "auto" || r.touched).cloned().collect::<Vec<_>>())
        };
        let own = own_files(&movies);
        let mut images = list_images(&folders, &loose, &d.thumbs);
        images.retain(|i| !own.contains(&i.path.to_lowercase()));
        // HEIC อ่านขนาดจากหัวไฟล์ไม่ได้ ถอดเลย ไม่งั้นบอกแนวไม่ได้
        for i in images.iter_mut().filter(|i| i.width == 0) {
            if let Ok((t, w, h)) = make_src_thumb(&d.tools, &d.work, &d.thumbs, Path::new(&i.path)) {
                i.width = w; i.height = h; i.thumb = Some(t.to_string_lossy().to_string());
            }
        }
        let counts = dir_counts(movies.iter().map(|m| m.path.as_str()));
        let kept: HashSet<&str> = keep.iter().map(|r| r.id.as_str()).collect();
        let shelf: Vec<Title> = movies.iter().map(|m| movie_title(Path::new(&m.path))).collect();
        let targets: Vec<MovieIn> = movies.iter()
            .filter(|m| !m.missing && !kept.contains(m.id.as_str()) && (scope == "all" || (!m.has_cover && m.linked.is_empty())))
            .map(|m| movie_in(&m.id, &m.path, m.has_cover, &counts, &d.thumbs, &own)).collect();
        let mut taken: HashSet<String> = keep.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.clone()).collect();
        // เฉพาะเรื่องที่ยังไม่มีปก รูปที่ยืนยันไปแล้วไม่ไปซ้ำเรื่องอื่น · ทุกเรื่องตั้งใจจับคู่ใหม่หมด จึงไม่กัน
        if scope != "all" { taken.extend(movies.iter().flat_map(|m| &m.linked).map(|c| c.source.clone())); }
        let fresh = match_core(&targets, &shelf, &images, &taken);
        let mut sum = (0, 0, 0);
        for r in &fresh {
            match r.status.as_str() { "sure" => sum.0 += 1, "unsure" => sum.1 += 1, _ => sum.2 += 1 }
        }
        {
            let mut x = store.data.lock().unwrap();
            let mut rows = keep;
            rows.extend(fresh);
            x.rows = rows;
        }
        store.save()?;
        start_thumbs(&app);
        Ok(AutoSummary {
            images: images.len(), sure: sum.0, unsure: sum.1, none: sum.2,
            tall: images.iter().filter(|i| i.width <= i.height).count(), wide: images.iter().filter(|i| i.width > i.height).count(),
            reply: reply(&store, &movies),
        })
    }).await.map_err(|e| e.to_string())?
}

/// รูปจากที่อยู่ไฟล์ · ไม่ใช่รูปหรือหาไม่เจอคืนเหตุผล
fn pick_of(d: &Dirs, path: &str) -> Result<Pick, String> {
    let p = Path::new(path);
    if !pi::ACCEPTED.contains(&pi::ext_of(p).as_str()) {
        return Err(format!("{} ไม่ใช่รูปจึงไม่รับ  รับรูป JPG PNG WebP BMP TIFF และ HEIC", p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()));
    }
    if !p.is_file() {
        return Err(format!("หารูป {path} ไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว"));
    }
    let cache = cached_thumbs(&d.thumbs);
    let hit = cache.get(&thumb_key(p));
    let (mut width, mut height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(p));
    let mut thumb = hit.map(|h| h.0.to_string_lossy().to_string());
    if width == 0 || thumb.is_none() {
        let (t, w, h) = make_src_thumb(&d.tools, &d.work, &d.thumbs, p)?;
        width = w; height = h; thumb = Some(t.to_string_lossy().to_string());
    }
    Ok(Pick { path: path.to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), folder: p.parent().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(), width, height, thumb, geo: None, crop_thumb: None })
}

fn blank_row(m: &Movie) -> Row {
    let t = movie_title(Path::new(&m.path));
    Row { id: m.id.clone(), movie: m.path.clone(), title: if t.pretty.is_empty() { m.name.clone() } else { t.pretty }, has_cover: m.has_cover, status: "none".into(), reason: "หาคู่ไม่เจอ".into(), via: "auto".into(), ..Default::default() }
}

/// จับคู่เองจากกระดาน Explorer หรือปุ่มบนชั้นวาง · หลายรูปแยกปกตั้งปกนอนตามแนวของรูป · แทนรูปเดิมของแถว · ไปรอยืนยันที่ตาราง
pub fn pair_row(row: &mut Row, picks: Vec<Pick>, via: &str) {
    let mut before = row.clone();
    before.prev = None;
    row.tall = None;
    row.wide = None;
    row.derived_tall = false;
    // รูปแนวตั้งก่อน รูปแนวนอนจะได้ไม่ไปครอปทับปกตั้งจริง · แนวเดียวกันหลายรูปใช้รูปแรก
    let (t, w): (Vec<Pick>, Vec<Pick>) = picks.into_iter().partition(|p| p.width <= p.height);
    if let Some(p) = t.into_iter().next() { assign(row, p); }
    if let Some(p) = w.into_iter().next() { assign(row, p); }
    row.status = "manual".into();
    row.via = via.to_string();
    row.reason = match via { "explorer" => "ลากจาก Explorer".to_string(), "shelf" => "เลือกจากชั้นวาง".to_string(), _ => "จับคู่เองบนกระดาน".to_string() };
    row.candidates.clear();
    row.score = 0;
    row.ticked = true;
    row.touched = true;
    row.error = None;
    row.conflict = None;
    row.store_override = None;
    row.prev = Some(Box::new(before));
}

#[tauri::command]
pub async fn link_pair(app: AppHandle, id: String, paths: Vec<String>, via: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let m = movies.iter().find(|m| m.id == id).ok_or("หาหนังในคลังไม่เจอ")?;
        if paths.is_empty() { return Err("ยังไม่ได้เลือกรูป".to_string()); }
        let picks = paths.iter().map(|p| pick_of(&d, p)).collect::<Result<Vec<_>, _>>()?;
        {
            let mut x = store.data.lock().unwrap();
            if !x.rows.iter().any(|r| r.id == id) { x.rows.push(blank_row(m)); }
            let r = x.rows.iter_mut().find(|r| r.id == id).unwrap();
            pair_row(r, picks, &via);
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// ย้อนการจับคู่เองล่าสุดของแถว
#[tauri::command]
pub fn link_undo(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<LinkReply, String> {
    store.idle()?;
    {
        let mut x = store.data.lock().unwrap();
        let i = x.rows.iter().position(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
        let Some(prev) = x.rows[i].prev.take() else { return Err("แถวนี้ไม่มีอะไรให้ย้อน".to_string()) };
        x.rows[i] = *prev;
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RowPatch {
    pub ticked: Option<bool>,
    /// กดเลือกรูปใกล้เคียง
    pub choose: Option<String>,
    /// tall · wide พร้อมค่าครอป
    pub orient: Option<String>,
    pub geo: Option<Geometry>,
    /// ข้ามเรื่องนี้ แถวออกจากตาราง จับคู่อัตโนมัติรอบหน้ากลับมาใหม่
    pub skip: Option<bool>,
}

/// ใส่ค่าครอปจากหน้าครอปลงแถว ยังไม่เขียนรูปจริง · ทำภาพเล็กหลังครอปให้ตารางโชว์
/// ช่องนี้ยังไม่มีรูป ใช้รูปของอีกช่อง (รูปเดียวทำได้ทั้งปกตั้งและปกนอน มอคอัปหน้า 4)
#[tauri::command]
pub async fn link_set_crop(app: AppHandle, id: String, orient: String, geo: Geometry) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let wide = orient == "wide";
        let base = {
            let x = store.data.lock().unwrap();
            let r = x.rows.iter().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            let (own, other) = if wide { (&r.wide, &r.tall) } else { (&r.tall, &r.wide) };
            own.clone().or_else(|| other.clone()).ok_or("แถวนี้ยังไม่มีรูป")?
        };
        let dec = pi::decode(&d.tools, &d.work, Path::new(&base.path))?;
        let (img, _) = pi::render(&dec.img, &geo, true);
        let (w, h) = img.dimensions();
        let nh = 240u32;
        let small = imageops::resize(&img, ((w as f64 * nh as f64 / h.max(1) as f64).round() as u32).max(1), nh, imageops::FilterType::Triangle);
        let bytes = pi::encode(&small, "jpg", 85)?;
        fs::create_dir_all(&d.thumbs).map_err(|e| e.to_string())?;
        let out = d.thumbs.join(format!("crop-{}-{}x{}.jpg", &sha_of(&bytes)[..16], w, h));
        fs::write(&out, &bytes).map_err(|e| e.to_string())?;
        {
            let mut x = store.data.lock().unwrap();
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            let pick = Pick { geo: Some(geo), crop_thumb: Some(out.to_string_lossy().to_string()), ..base };
            if wide { r.wide = Some(pick); } else { r.tall = Some(pick); r.derived_tall = false; }
            r.error = None;
            r.conflict = None;
            r.touched = true;
            r.ticked = true;
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// แก้แถว · ติ๊ก เลือกรูปใกล้เคียง ค่าครอป ข้าม
#[tauri::command]
pub fn link_row_update(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String, patch: RowPatch) -> Result<LinkReply, String> {
    store.idle()?;
    {
        let mut x = store.data.lock().unwrap();
        if patch.skip == Some(true) {
            x.rows.retain(|r| r.id != id);
        } else {
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            r.touched = true;
            if let Some(t) = patch.ticked { r.ticked = t && r.has_image(); }
            if let Some(path) = &patch.choose {
                // เปลี่ยนรูปแล้ว เหตุผลเดิมกับที่เก็บแบบเฉพาะแถวไม่เกี่ยวแล้ว · ติ๊กอย่างเดียวต้องไม่ล้างเหตุผล
                r.error = None;
                r.conflict = None;
                r.store_override = None;
                let pick = r.candidates.iter().find(|c| &c.path == path).cloned().ok_or("ไม่เจอรูปนี้ในรูปใกล้เคียง")?;
                r.tall = None; r.wide = None; r.derived_tall = false;
                assign(r, pick);
                r.ticked = true;
            }
            if let (Some(o), Some(g)) = (&patch.orient, patch.geo) {
                let slot = if o == "wide" { &mut r.wide } else { &mut r.tall };
                let p = slot.as_mut().ok_or("ช่องนี้ยังไม่มีรูป")?;
                p.geo = Some(g);
                if o != "wide" { r.derived_tall = false; }
            }
        }
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

// ---------------------------------------------------------------- ยืนยันแล้วเก็บรูปจริง (ขั้น 2)

/// ค่าที่ตัวเขียนรูปต้องใช้ · แยกจาก AppHandle ให้เทสได้
pub struct WriteEnv<'a> {
    pub tools: &'a Path,
    pub work: &'a Path,
    /// โฟลเดอร์ภาพเล็กของโปรแกรม
    pub thumbs: &'a Path,
    /// โฟลเดอร์เก็บสำเนาในโปรแกรม
    pub covers: &'a Path,
    pub shrink: bool,
    /// jpg · png
    pub format: &'a str,
    pub quality: u8,
    /// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม ได้สำเนาในโปรแกรมอีกที่
    pub also_app: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CoverProblem {
    pub msg: String,
    /// ไฟล์ปลายทางที่ชน · ไม่ใช่เรื่องชื่อชน = None
    pub conflict: Option<String>,
}

fn fail(msg: impl Into<String>) -> CoverProblem {
    CoverProblem { msg: msg.into(), conflict: None }
}

/// ครอปกลางรูป ค่าตั้งต้นตอนยังไม่ได้เปิดหน้าครอป · ปกตั้ง 2 : 3 · ปกนอน 16 : 9
pub fn default_geo(orient: &str, w: u32, h: u32) -> Geometry {
    let wide = orient == "wide";
    let (x, y, cw, ch) = if wide { pi::default_crop_wide(w, h) } else { pi::default_crop(w, h) };
    Geometry { rotate: 0, flip: false, mode: "crop".into(), x, y, w: cw, h: ch, pad: "#f6dbe5".into(), tilt: 0.0, aspect: if wide { "wide".into() } else { String::new() } }
}

/// ชื่อไฟล์ข้างหนัง ชื่อหนัง-poster.jpg ชื่อหนัง-landscape.jpg (พี่กันเคาะ 8 พ.ย. 2569 *"เอาอังกิด ตามที่แนะนำ"*)
pub fn beside_target(movie: &Path, orient: &str, format: &str) -> PathBuf {
    let stem = movie.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let tail = if orient == "wide" { "landscape" } else { "poster" };
    movie.with_file_name(format!("{stem}-{tail}.{format}"))
}

fn same_file(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

fn sha_of(bytes: &[u8]) -> String {
    crate::probe::hex(&Sha256::digest(bytes))
}

fn file_sha(p: &Path) -> Option<String> {
    fs::read(p).ok().map(|b| sha_of(&b))
}

fn safe_id(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).take(80).collect()
}

/// ภาพเล็กของปกจับคู่ สูง 450 คงสัดส่วน แบบเดียวกับปกในไฟล์ · ชื่อมีค่า hash เปลี่ยนรูปแล้วหน้าจอไม่ได้ภาพเก่าค้าง
fn write_thumb(env: &WriteEnv, id: &str, orient: &str, img: &image::RgbImage, sha: &str) -> Result<(PathBuf, f32), String> {
    fs::create_dir_all(env.thumbs).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let nw = ((w as f64 * 450.0 / h.max(1) as f64).round() as u32).max(1);
    let small = imageops::resize(img, nw, 450, imageops::FilterType::Triangle);
    let out = env.thumbs.join(format!("{}-l{orient}-{}-a.jpg", safe_id(id), &sha[..12]));
    fs::write(&out, pi::encode(&small, "jpg", 85)?).map_err(|e| e.to_string())?;
    Ok((out, w as f32 / h.max(1) as f32))
}

/// วางไบต์ลงไฟล์ใหม่แบบไม่มีจังหวะทับ · เขียนไฟล์ชั่วคราวข้าง ๆ แล้วย้ายแบบไม่แทนที่
fn write_new(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = target.with_extension(format!("{}.partial", pi::unique()));
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    if let Err(p) = crate::rename::move_no_replace(&temp, target) {
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    Ok(())
}

/// แทนไฟล์ของโปรแกรมเอง · ไฟล์ใหม่เขียนเสร็จก่อน ค่อยเอาของเก่าออก พังกลางทางของเก่ากลับที่เดิม
fn replace_own(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = target.with_extension(format!("{}.partial", pi::unique()));
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    let old = target.with_extension(format!("{}.old", pi::unique()));
    if let Err(p) = crate::rename::move_no_replace(target, &old) {
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    if let Err(p) = crate::rename::move_no_replace(&temp, target) {
        let _ = crate::rename::move_no_replace(&old, target);
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    let _ = fs::remove_file(&old);
    Ok(())
}

/// รูปต้นทางคือไฟล์ชื่อนั้นข้างหนังอยู่แล้ว (ชื่อหนัง-poster.jpg จากที่อื่น) แนวตรงช่อง และไม่ได้ครอป ใช้ไฟล์นั้นเลย ไม่คัดลอก ไม่นับเป็นของโปรแกรม
fn is_existing_art(movie: &Path, orient: &str, pick: &Pick, target: &Path, w: u32, h: u32) -> bool {
    let src = Path::new(&pick.path);
    pick.geo.is_none() && (w == 0 || (w > h) == (orient == "wide"))
        && same_file(src.parent().unwrap_or(Path::new("")), movie.parent().unwrap_or(Path::new("")))
        && same_file(Path::new(src.file_stem().unwrap_or_default()), Path::new(target.file_stem().unwrap_or_default()))
}

/// ไฟล์ปลายทางมีอยู่แล้วและไม่ใช่ของโปรแกรม · เช็กทุกช่องก่อนเขียนช่องแรก แถวจะได้ไม่ครึ่ง ๆ กลาง ๆ
fn conflict_of(env: &WriteEnv, movie: &Path, orient: &str, pick: &Pick, store: &str, old: Option<&LinkedCover>) -> Option<CoverProblem> {
    if store != "beside" && store != "" { return None; }
    let target = beside_target(movie, orient, env.format);
    if !target.exists() || is_existing_art(movie, orient, pick, &target, pick.width, pick.height) { return None; }
    let mine = old.is_some_and(|o| o.owned && o.file.as_deref().is_some_and(|f| same_file(Path::new(f), &target)) && o.sha256 == file_sha(&target));
    if mine { return None; }
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Some(CoverProblem { msg: format!("มีไฟล์ {name} อยู่แล้ว ไม่ใช่ของโปรแกรม ไม่เขียนทับ"), conflict: Some(target.to_string_lossy().to_string()) })
}

/// วางไบต์รูปตามแบบที่เก็บ คืนไฟล์ที่ได้กับว่าเป็นของโปรแกรมไหม
fn place_bytes(env: &WriteEnv, id: &str, movie: &Path, orient: &str, ext: &str, bytes: &[u8], sha: &str, store: &str, old: Option<&LinkedCover>) -> Result<(Option<PathBuf>, bool), CoverProblem> {
    match store {
        "link" => Ok((None, false)),
        "app" => {
            fs::create_dir_all(env.covers).map_err(|e| fail(e.to_string()))?;
            let f = env.covers.join(format!("{}-{orient}-{}.{ext}", safe_id(id), &sha[..12]));
            if !f.exists() {
                write_new(&f, bytes).map_err(|e| fail(format!("เก็บรูปในโปรแกรมไม่ได้: {e}")))?;
            }
            Ok((Some(f), true))
        }
        _ => {
            let target = beside_target(movie, orient, ext);
            if target.exists() {
                // เป็นไฟล์ที่โปรแกรมทำเองและยังไม่ถูกแก้ ถึงจะแทนได้
                let mine = old.is_some_and(|o| o.owned && o.file.as_deref().is_some_and(|f| same_file(Path::new(f), &target)) && o.sha256 == file_sha(&target));
                if !mine {
                    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    return Err(CoverProblem { msg: format!("มีไฟล์ {name} อยู่แล้ว ไม่ใช่ของโปรแกรม ไม่เขียนทับ"), conflict: Some(target.to_string_lossy().to_string()) });
                }
                replace_own(&target, bytes).map_err(|e| fail(format!("เขียนรูปข้างไฟล์หนังไม่ได้: {e}")))?;
            } else {
                write_new(&target, bytes).map_err(|e| fail(format!("เขียนรูปข้างไฟล์หนังไม่ได้: {e}")))?;
            }
            Ok((Some(target), true))
        }
    }
}

/// สำเนาในโปรแกรมอีกที่ เฉพาะตอนติ๊กทั้งสองแบบและแถวนี้เก็บข้างไฟล์หนัง
fn app_copy_of(env: &WriteEnv, id: &str, movie: &Path, orient: &str, ext: &str, bytes: &[u8], sha: &str, store: &str) -> Result<Option<String>, CoverProblem> {
    if !env.also_app || store != "beside" { return Ok(None); }
    let (f, _) = place_bytes(env, id, movie, orient, ext, bytes, sha, "app", None)?;
    Ok(f.map(|x| x.to_string_lossy().to_string()))
}

/// เก็บรูปหนึ่งช่องตามแบบที่ตั้ง · รูปต้นฉบับไม่ถูกแก้ · ไฟล์หนังไม่ถูกแตะ
/// `old` ปกเดิมของช่องนี้ ไว้ดูว่าไฟล์ปลายทางเป็นของโปรแกรมเองไหม
pub fn write_cover(env: &WriteEnv, id: &str, movie: &Path, orient: &str, pick: &Pick, store: &str, old: Option<&LinkedCover>) -> Result<LinkedCover, CoverProblem> {
    let src = Path::new(&pick.path);
    if !src.is_file() {
        return Err(fail(format!("หารูป {} ไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว", pick.name)));
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let dec = pi::decode(env.tools, env.work, src).map_err(fail)?;
    let (w, h) = dec.img.dimensions();
    let target = beside_target(movie, orient, env.format);
    if store == "beside" && is_existing_art(movie, orient, pick, &target, w, h) {
        let sha = file_sha(src).ok_or_else(|| fail(format!("อ่าน {} ไม่ได้", pick.name)))?;
        let (thumb, aspect) = write_thumb(env, id, orient, &dec.img, &sha).map_err(fail)?;
        let app_copy = if env.also_app {
            let bytes = fs::read(src).map_err(|e| fail(format!("อ่าน {} ไม่ได้: {e}", pick.name)))?;
            app_copy_of(env, id, movie, orient, &pi::ext_of(src), &bytes, &sha, store)?
        } else { None };
        return Ok(LinkedCover { app_copy, orient: orient.into(), source: pick.path.clone(), cropped: false, geo: None, store: "beside".into(), file: Some(pick.path.clone()), owned: false, sha256: Some(sha), thumb: thumb.to_string_lossy().to_string(), aspect, at: now });
    }
    let geo = pick.geo.clone().unwrap_or_else(|| default_geo(orient, w, h));
    let (img, _) = pi::render(&dec.img, &geo, env.shrink);
    let bytes = pi::encode(&img, env.format, env.quality).map_err(fail)?;
    let sha = sha_of(&bytes);
    // ทำสำเนาในโปรแกรมก่อน ชื่อไม่มีวันชน · ไฟล์ข้างหนังเขียนไม่ได้ เอาสำเนาที่เพิ่งทำออก ไม่ค้างครึ่ง ๆ กลาง ๆ
    let app_copy = app_copy_of(env, id, movie, orient, env.format, &bytes, &sha, store)?;
    let (file, owned) = match place_bytes(env, id, movie, orient, env.format, &bytes, &sha, store, old) {
        Ok(x) => x,
        Err(e) => {
            if let Some(f) = &app_copy {
                if !old.is_some_and(|o| o.app_copy.as_deref() == Some(f.as_str())) { let _ = fs::remove_file(f); }
            }
            return Err(e);
        }
    };
    let (thumb, aspect) = write_thumb(env, id, orient, &img, &sha).map_err(fail)?;
    Ok(LinkedCover { app_copy, orient: orient.into(), source: pick.path.clone(), cropped: pick.geo.is_some(), geo: Some(geo), store: store.into(), file: file.map(|f| f.to_string_lossy().to_string()), owned, sha256: Some(sha), thumb: thumb.to_string_lossy().to_string(), aspect, at: now })
}

/// เอาปกหนึ่งช่องออก · ลบได้เฉพาะไฟล์ที่โปรแกรมทำเองและยังไม่ถูกแก้ ลงถังขยะเท่านั้น ทุกแบบที่เก็บ (พี่กันตอบตอนทำแผน)
/// ไดรฟ์ที่ไม่มีถังขยะไม่ลบ · คืนข้อความเมื่อมีไฟล์ที่ไม่ลบ
pub fn remove_cover(c: &LinkedCover) -> Option<String> {
    let _ = fs::remove_file(&c.thumb);
    let also = c.app_copy.as_deref().and_then(|f| trash_own(Path::new(f), &c.sha256));
    let main = c.file.as_deref().filter(|_| c.owned).and_then(|f| trash_own(Path::new(f), &c.sha256));
    match (main, also) {
        (Some(a), Some(b)) => Some(format!("{a}  {b}")),
        (a, b) => a.or(b),
    }
}

/// ลบไฟล์ที่โปรแกรมทำเองลงถังขยะ ถ้ายังไม่ถูกแก้ · คืนข้อความเมื่อไม่ลบ
fn trash_own(f: &Path, sha: &Option<String>) -> Option<String> {
    if !f.exists() {
        return None;
    }
    if file_sha(f) != *sha {
        return Some(format!("{} ถูกแก้หลังโปรแกรมทำไว้ ไม่ลบให้", f.file_name().unwrap_or_default().to_string_lossy()));
    }
    if !crate::outfile::drive_is_fixed(f.parent().unwrap_or(Path::new(""))) {
        return Some(format!("{} อยู่บนไดรฟ์ที่ไม่มีถังขยะ ไม่ลบให้ ลบเองได้", f.file_name().unwrap_or_default().to_string_lossy()));
    }
    crate::outfile::to_trash(f).err().map(|e| format!("{} {e}", f.file_name().unwrap_or_default().to_string_lossy()))
}

/// เก็บทุกช่องของแถว · ช่องหลังล้ม เอาไฟล์ใหม่ของช่องก่อนออก แถวนั้นไม่ครึ่ง ๆ กลาง ๆ
pub fn apply_row(env: &WriteEnv, m: &Movie, row: &Row, store: &str) -> Result<Vec<LinkedCover>, CoverProblem> {
    let movie = Path::new(&m.path);
    let mut out: Vec<LinkedCover> = vec![];
    // ชื่อชนเช็กทุกช่องก่อน · เดิมช่องปกตั้งแทนไฟล์เดิมไปแล้ว ช่องปกนอนชนทีหลัง แถวครึ่ง ๆ กลาง ๆ (ผู้ช่วยตรวจขั้น 8)
    for (orient, pick) in [("tall", &row.tall), ("wide", &row.wide)] {
        if let Some(pick) = pick {
            if let Some(p) = conflict_of(env, movie, orient, pick, store, m.linked.iter().find(|c| c.orient == orient)) { return Err(p); }
        }
    }
    for (orient, pick) in [("tall", &row.tall), ("wide", &row.wide)] {
        let Some(pick) = pick else { continue };
        let old = m.linked.iter().find(|c| c.orient == orient);
        match write_cover(env, &m.id, movie, orient, pick, store, old) {
            Ok(c) => out.push(c),
            Err(e) => {
                for c in &out {
                    let in_old = |p: &str| m.linked.iter().any(|o| o.file.as_deref().is_some_and(|f| same_file(Path::new(f), Path::new(p))));
                    if c.owned && !c.file.as_deref().is_some_and(in_old) {
                        if let Some(f) = &c.file { let _ = fs::remove_file(f); }
                    }
                    if let Some(f) = &c.app_copy {
                        if !m.linked.iter().any(|o| o.app_copy.as_deref() == Some(f.as_str())) { let _ = fs::remove_file(f); }
                    }
                    if !m.linked.iter().any(|o| same_file(Path::new(&o.thumb), Path::new(&c.thumb))) { let _ = fs::remove_file(&c.thumb); }
                }
                return Err(e);
            }
        }
    }
    Ok(out)
}

/// ใส่ปกใหม่ลงหนัง คืนปกเก่าที่ถูกแทน ไว้ตามไปเอาไฟล์ออก
pub fn merge_covers(m: &mut Movie, covers: Vec<LinkedCover>) -> Vec<LinkedCover> {
    let mut gone = vec![];
    for c in covers {
        if let Some(i) = m.linked.iter().position(|o| o.orient == c.orient) {
            gone.push(std::mem::replace(&mut m.linked[i], c));
        } else {
            m.linked.push(c);
        }
    }
    let now = m.linked.clone();
    // ปกเก่าที่ไฟล์หรือภาพเล็กยังถูกปกที่เหลือใช้อยู่ ห้ามเอาออก · ดูทั้งไฟล์ที่เก็บและรูปต้นทาง และไม่สนตัวพิมพ์ใหญ่เล็ก
    gone.into_iter().map(|mut g| {
        let used = g.file.as_deref().is_some_and(|f| now.iter().any(|c| same_file(Path::new(&c.source), Path::new(f)) || c.file.as_deref().is_some_and(|x| same_file(Path::new(x), Path::new(f)))));
        if used { g.file = None; }
        // สำเนาในโปรแกรมชื่อตามค่า hash รูปเดิมยืนยันซ้ำได้ชื่อเดิม ยังถูกปกใหม่ใช้อยู่ ห้ามลบ
        if g.app_copy.as_deref().is_some_and(|f| now.iter().any(|c| c.app_copy.as_deref() == Some(f))) { g.app_copy = None; }
        if now.iter().any(|c| same_file(Path::new(&c.thumb), Path::new(&g.thumb))) { g.thumb.clear(); }
        g
    }).collect()
}

/// เปลี่ยนชื่อไฟล์หนังในชั้นหนัง สำเนาข้างไฟล์ที่โปรแกรมทำเปลี่ยนชื่อตาม · ไฟล์ที่โปรแกรมไม่ได้ทำไม่แตะ · ชนชื่อคงชื่อเดิม ปกยังใช้ได้
pub fn rename_beside(m: &mut Movie, new_movie: &Path) {
    for c in m.linked.iter_mut().filter(|c| c.owned && c.store == "beside") {
        let Some(old) = c.file.clone() else { continue };
        let old = PathBuf::from(old);
        let ext = old.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
        let new = beside_target(new_movie, &c.orient, &ext);
        // ไฟล์ที่ผู้ใช้แก้เองแล้วไม่ใช่ของโปรแกรมอีกต่อไป ไม่เปลี่ยนชื่อให้
        if !same_file(&old, &new) && file_sha(&old) == c.sha256 && crate::rename::move_no_replace(&old, &new).is_ok() {
            c.file = Some(new.to_string_lossy().to_string());
        }
    }
}

// ---------- คำสั่ง ----------

fn write_env_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((crate::tools::tools_dir(app)?, local.join("tmp"), local.join("thumbs"), local.join("covers")))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LinkProgress {
    done: usize,
    total: usize,
    title: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmResult {
    pub done: usize,
    pub failed: usize,
    pub stopped: bool,
    pub notes: Vec<String>,
    pub reply: LinkReply,
}

/// แถวที่จะยืนยัน · ticked ที่ติ๊กไว้ · all ทุกแถวที่มีรูป (แถวไม่แน่ใจที่ยังไม่เลือกรูป กับแถวหาคู่ไม่เจอ ไม่มีรูป จึงไม่นับ · พี่กันเคาะ *"เอาตามนี้"*) · ไม่งั้นเป็นเลขแถว
pub fn select_rows(rows: &[Row], which: &str) -> Vec<String> {
    rows.iter().filter(|r| r.status != "saved" && r.has_image() && match which {
        "ticked" => r.ticked && is_waiting(r),
        "all" => is_waiting(r),
        id => r.id == id,
    }).map(|r| r.id.clone()).collect()
}

/// ยืนยัน · ทีละคู่ คู่ที่ล้มค้างในตารางพร้อมเหตุผล คู่ที่ผ่านไม่หาย หยุดกลางทางได้
#[tauri::command]
pub async fn link_confirm(app: AppHandle, which: String) -> Result<ConfirmResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let _busy = begin_busy(&store)?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let (tools, work, thumbs, covers) = write_env_dirs(&app)?;
        let (mode, shrink, format, quality, also_app) = {
            let s = app.state::<crate::store::SettingsStore>();
            let s = s.current.lock().unwrap();
            (s.link_store.clone(), s.shrink_large_posters, s.poster_format.clone(), s.jpg_quality, s.also_app())
        };
        let env = WriteEnv { tools: &tools, work: &work, thumbs: &thumbs, covers: &covers, shrink, format: &format, quality, also_app };
        store.stop.store(false, Ordering::SeqCst);
        let ids = select_rows(&store.data.lock().unwrap().rows, &which);
        let total = ids.len();
        let (mut done, mut failed, mut notes, mut stopped) = (0, 0, vec![], false);
        for (i, id) in ids.iter().enumerate() {
            if store.stop.load(Ordering::SeqCst) || jobs.cancelled() { stopped = true; break; }
            let Some(row) = store.data.lock().unwrap().rows.iter().find(|r| &r.id == id).cloned() else { continue };
            let _ = app.emit("link-progress", LinkProgress { done: i, total, title: row.title.clone() });
            let Some(m) = lib.movies.lock().unwrap().iter().find(|m| &m.id == id).cloned() else { continue };
            let how = row.store_override.clone().unwrap_or_else(|| mode.clone());
            let result = apply_row(&env, &m, &row, &how);
            let mut d = store.data.lock().unwrap();
            let Some(r) = d.rows.iter_mut().find(|r| &r.id == id) else { continue };
            match result {
                Ok(covers) => {
                    r.status = "saved".into();
                    r.ticked = false;
                    r.error = None;
                    r.conflict = None;
                    r.store_override = None;
                    r.prev = None;
                    drop(d);
                    let mut gone = vec![];
                    let up = lib.update_movie(id, |x| gone = merge_covers(x, covers));
                    if let Some(up) = up { let _ = app.emit("movie-updated", &up); }
                    // จดคลังก่อนเอาของเก่าออก ไฟดับตรงกลางคลังจะไม่ชี้ไฟล์ที่ลงถังขยะไปแล้ว
                    lib.save()?;
                    for g in &gone {
                        if let Some(n) = remove_cover(g) { notes.push(n); }
                    }
                    done += 1;
                }
                Err(e) => {
                    r.error = Some(e.msg);
                    r.conflict = e.conflict;
                    r.ticked = true;
                    drop(d);
                    failed += 1;
                }
            }
            // จดทุกคู่ โปรแกรมดับกลางทางคู่ที่ทำแล้วไม่กลับไปรออีก
            store.save()?;
        }
        let _ = app.emit("link-progress", LinkProgress { done: total, total, title: String::new() });
        let movies = movies_of(&lib);
        Ok(ConfirmResult { done, failed, stopped, notes, reply: reply(&store, &movies) })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn link_cancel(store: State<'_, Arc<LinkStore>>) {
    store.stop.store(true, Ordering::SeqCst);
}

/// ชื่อไฟล์ชน · use ใช้ไฟล์ที่มีอยู่นั้นเป็นปก · app เก็บในโปรแกรมแทนเฉพาะแถวนี้
#[tauri::command]
pub async fn link_resolve(app: AppHandle, id: String, how: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let conflict = store.data.lock().unwrap().rows.iter().find(|r| r.id == id).and_then(|r| r.conflict.clone()).ok_or("แถวนี้ไม่มีชื่อชน")?;
        let existing = if how == "use" { Some(pick_of(&d, &conflict)?) } else { None };
        {
            let mut x = store.data.lock().unwrap();
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            if let Some(p) = existing {
                let wide = conflict.to_lowercase().contains("-landscape.");
                if wide { r.wide = Some(p); } else { r.tall = Some(p); r.derived_tall = false; }
            } else {
                r.store_override = Some("app".into());
            }
            r.conflict = None;
            r.error = None;
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// เอาปกออกตามช่องที่ระบุ · จดคลังก่อน แล้วค่อยเอาไฟล์ออก · ไม่ระบุคือทุกช่อง
fn drop_covers(lib: &LibraryStore, id: &str, only: Option<&[&str]>) -> Result<Vec<String>, String> {
    let mut gone = vec![];
    lib.update_movie(id, |m| {
        let (out, keep): (Vec<_>, Vec<_>) = std::mem::take(&mut m.linked).into_iter().partition(|c| only.is_none_or(|o| o.contains(&c.orient.as_str())));
        gone = out;
        m.linked = keep;
        if m.linked.is_empty() { m.cover_pick.clear(); }
    });
    lib.save()?;
    Ok(gone.iter().filter_map(remove_cover).collect())
}

/// ภาพหลังครอปในแถวที่ชี้ภาพเล็กที่เพิ่งลบ · ไม่ล้างจะเป็นภาพแตก
fn clear_dead_crops(r: &mut Row) {
    for p in [&mut r.tall, &mut r.wide].into_iter().flatten() {
        if p.crop_thumb.as_deref().is_some_and(|t| !Path::new(t).exists()) { p.crop_thumb = None; }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResult {
    pub notes: Vec<String>,
    pub reply: LinkReply,
}

/// ปุ่มยกเลิกในแถวที่ยืนยันแล้ว · เอาปกออก แถวกลับไปรอยืนยันพร้อมรูปเดิม
#[tauri::command]
pub fn link_unsave(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<RemoveResult, String> {
    store.idle()?;
    // เอาออกเฉพาะช่องที่แถวนี้เขียน · ปกช่องที่ไม่ได้แตะต้องอยู่ (ผู้ช่วยตรวจขั้น 8)
    let slots: Vec<&str> = {
        let x = store.data.lock().unwrap();
        x.rows.iter().find(|r| r.id == id).map(|r| { let mut v = vec![]; if r.tall.is_some() { v.push("tall"); } if r.wide.is_some() { v.push("wide"); } v }).unwrap_or_default()
    };
    let notes = drop_covers(&lib, &id, Some(&slots))?;
    {
        let mut x = store.data.lock().unwrap();
        if let Some(r) = x.rows.iter_mut().find(|r| r.id == id) {
            r.status = if r.via != "auto" { "manual".into() } else if r.candidates.is_empty() { "sure".into() } else { "unsure".into() };
            r.ticked = true;
            clear_dead_crops(r);
        }
    }
    store.save()?;
    lib.save()?;
    if let Some(m) = lib.movies.lock().unwrap().iter().find(|m| m.id == id) { let _ = app.emit("movie-updated", m); }
    Ok(RemoveResult { notes, reply: reply(&store, &movies_of(&lib)) })
}

/// ปุ่มเอาปกออกบนชั้นวาง
#[tauri::command]
pub fn link_remove(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<RemoveResult, String> {
    store.idle()?;
    let notes = drop_covers(&lib, &id, None)?;
    {
        let mut x = store.data.lock().unwrap();
        x.rows.retain(|r| !(r.id == id && r.status == "saved"));
        if let Some(r) = x.rows.iter_mut().find(|r| r.id == id) { clear_dead_crops(r); }
    }
    store.save()?;
    lib.save()?;
    if let Some(m) = lib.movies.lock().unwrap().iter().find(|m| m.id == id) { let _ = app.emit("movie-updated", m); }
    Ok(RemoveResult { notes, reply: reply(&store, &movies_of(&lib)) })
}

/// ปุ่มบนชั้นวาง (ครอปใหม่ เปลี่ยนรูป จับคู่รูปปก) · เปิดแถวของเรื่องนั้นในตาราง · มีปกจับคู่อยู่แล้วเอารูปเดิมกับค่าครอปเดิมมาตั้ง ยืนยันอีกครั้งถึงเปลี่ยน
#[tauri::command]
pub async fn link_open_row(app: AppHandle, id: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let movies = movies_of(&lib);
        let m = movies.iter().find(|m| m.id == id).ok_or("หาหนังในคลังไม่เจอ")?;
        {
            let mut x = store.data.lock().unwrap();
            x.rows.retain(|r| !(r.id == id && r.status == "saved"));
            if !x.rows.iter().any(|r| r.id == id) {
                let mut r = blank_row(m);
                r.via = "shelf".into();
                for c in &m.linked {
                    if let Ok(mut p) = pick_of(&d, &c.source) {
                        if c.cropped {
                            p.geo = c.geo.clone();
                            p.crop_thumb = Some(c.thumb.clone());
                        }
                        if c.orient == "wide" { r.wide = Some(p); } else { r.tall = Some(p); }
                    }
                }
                if r.has_image() {
                    r.status = "manual".into();
                    r.reason = "เลือกจากชั้นวาง".into();
                    r.ticked = false;
                } else if !m.linked.is_empty() {
                    r.reason = "หารูปต้นทางไม่เจอ เลือกรูปใหม่".into();
                }
                x.rows.insert(0, r);
            }
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// เรื่องที่มีสองปก เลือกปกที่แสดง · file ปกในไฟล์ · linked ปกจับคู่
#[tauri::command]
pub fn link_cover_pick(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, id: String, pick: String) -> Result<Movie, String> {
    let m = lib.update_movie(&id, |m| m.cover_pick = if pick == "file" { "file".into() } else { String::new() }).ok_or("หาหนังในคลังไม่เจอ")?;
    lib.save()?;
    let _ = app.emit("movie-updated", &m);
    Ok(m)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub done: usize,
    pub failed: usize,
    pub notes: Vec<String>,
}

/// ย้ายปกที่จับคู่ไว้แล้วไปเก็บแบบใหม่ทีเดียว · ช่องหนึ่งของเรื่องล้ม ไม่ย้ายเฉพาะช่องนั้น · รูปต้นทางหายแล้วใช้สำเนาเดิมเป็นต้นทาง · เก็บใหม่สำเร็จค่อยเอาของเก่าออก
#[tauri::command]
pub async fn link_migrate(app: AppHandle, to: String) -> Result<MigrateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let _busy = begin_busy(&store)?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let (tools, work, thumbs, covers) = write_env_dirs(&app)?;
        let (shrink, format, quality, also_app) = {
            let s = app.state::<crate::store::SettingsStore>();
            let s = s.current.lock().unwrap();
            (s.shrink_large_posters, s.poster_format.clone(), s.jpg_quality, s.also_app())
        };
        let env = WriteEnv { tools: &tools, work: &work, thumbs: &thumbs, covers: &covers, shrink, format: &format, quality, also_app };
        let movies = movies_of(&lib);
        // ติ๊กเพิ่มหรือเอาสำเนาในโปรแกรมออก ปกที่เก็บแบบหลักถูกอยู่แล้วก็ต้องตามด้วย
        let want_copy = also_app && to == "beside";
        let todo: Vec<&Movie> = movies.iter().filter(|m| m.linked.iter().any(|c| c.store != to || c.app_copy.is_some() != want_copy)).collect();
        let total = todo.len();
        let (mut done, mut failed, mut notes) = (0, 0, vec![]);
        for (i, m) in todo.into_iter().enumerate() {
            if jobs.cancelled() { notes.push("โปรแกรมกำลังปิด ย้ายไม่ครบ เรื่องที่เหลือคงแบบเดิม".to_string()); break; }
            let _ = app.emit("link-progress", LinkProgress { done: i, total, title: m.name.clone() });
            let mut fresh = vec![];
            let mut bad = false;
            for c in m.linked.iter().filter(|c| c.store != to) {
                let (path, geo) = if Path::new(&c.source).is_file() {
                    // ส่งค่าครอปเฉพาะที่ผู้ใช้ครอปเอง · ค่ากลางรูปที่โปรแกรมตั้งให้ส่งไปด้วย รูปข้างหนังชื่อถูกอยู่แล้วจะกลายเป็นต้องทำไฟล์ใหม่ แล้วชนตัวเอง
                    (c.source.clone(), if c.cropped { c.geo.clone() } else { None })
                } else if let Some(f) = c.file.clone().filter(|f| Path::new(f).is_file()) {
                    // รูปต้นฉบับหาย เหลือสำเนานี้รูปเดียว · จับคู่อย่างเดียวไม่มีไฟล์ใหม่ ย้ายแล้วสำเนาจะหาย ห้ามย้าย
                    if to == "link" {
                        notes.push(format!("{} รูปต้นฉบับหาย ย้ายเป็นจับคู่อย่างเดียวไม่ได้ คงแบบเดิม", m.name));
                        bad = true;
                        continue;
                    }
                    // แบบอื่นคัดลอกไบต์เดิมตรง ๆ ไม่ทำรูปใหม่ ขนาดกับคุณภาพเท่าเดิม
                    let bytes = match fs::read(&f) { Ok(b) => b, Err(e) => { notes.push(format!("{} อ่านสำเนาไม่ได้: {e}", m.name)); bad = true; continue; } };
                    let sha = sha_of(&bytes);
                    let ext = Path::new(&f).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
                    match place_bytes(&env, &m.id, Path::new(&m.path), &c.orient, &ext, &bytes, &sha, &to, Some(c)) {
                        Ok((file, owned)) => fresh.push(LinkedCover { store: to.clone(), file: file.map(|x| x.to_string_lossy().to_string()), owned, sha256: Some(sha), ..c.clone() }),
                        Err(e) => { notes.push(format!("{} {}", m.name, e.msg)); bad = true; }
                    }
                    continue;
                } else {
                    notes.push(format!("{} หารูปต้นทางไม่เจอ ย้ายไม่ได้", m.name));
                    bad = true;
                    continue;
                };
                let (width, height) = header_size(Path::new(&path));
                let pick = Pick { name: Path::new(&path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), path, width, height, geo, ..Default::default() };
                match write_cover(&env, &m.id, Path::new(&m.path), &c.orient, &pick, &to, Some(c)) {
                    Ok(mut n) => { n.cropped = c.cropped; fresh.push(n); }
                    Err(e) => { notes.push(format!("{} {}", m.name, e.msg)); bad = true; }
                }
            }
            let had_fresh = !fresh.is_empty();
            if had_fresh {
                let mut gone = vec![];
                let up = lib.update_movie(&m.id, |x| gone = merge_covers(x, fresh));
                for g in &gone { if let Some(n) = remove_cover(g) { notes.push(n); } }
                if let Some(up) = up { let _ = app.emit("movie-updated", &up); }
                lib.save()?;
            }
            // สำเนาในโปรแกรมของปกที่อยู่แบบหลักแล้ว เพิ่มหรือเอาออกให้ตรงกับที่ติ๊ก
            let now = lib.movies.lock().unwrap().iter().find(|x| x.id == m.id).map(|x| x.linked.clone()).unwrap_or_default();
            let mut copies: Vec<(String, Option<String>)> = vec![];
            for c in now.iter().filter(|c| c.store == to && c.app_copy.is_some() != want_copy) {
                if !want_copy {
                    if let Some(n) = c.app_copy.as_deref().and_then(|f| trash_own(Path::new(f), &c.sha256)) { notes.push(n); }
                    copies.push((c.orient.clone(), None));
                    continue;
                }
                let from = c.file.clone().unwrap_or_else(|| c.source.clone());
                let made = fs::read(&from).map_err(|e| format!("อ่านรูปไม่ได้: {e}")).and_then(|bytes| {
                    let ext = Path::new(&from).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
                    place_bytes(&env, &m.id, Path::new(&m.path), &c.orient, &ext, &bytes, &sha_of(&bytes), "app", None).map_err(|e| e.msg)
                });
                match made {
                    Ok((file, _)) => copies.push((c.orient.clone(), file.map(|x| x.to_string_lossy().to_string()))),
                    Err(e) => { notes.push(format!("{} {e}", m.name)); bad = true; }
                }
            }
            let had_copies = !copies.is_empty();
            if had_copies {
                let up = lib.update_movie(&m.id, |x| for (orient, file) in &copies {
                    if let Some(c) = x.linked.iter_mut().find(|c| &c.orient == orient) { c.app_copy = file.clone(); }
                });
                if let Some(up) = up { let _ = app.emit("movie-updated", &up); }
                lib.save()?;
            }
            if bad { failed += 1; } else if had_fresh || had_copies { done += 1; }
        }
        let _ = app.emit("link-progress", LinkProgress { done: total, total, title: String::new() });
        Ok(MigrateResult { done, failed, notes })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(s: &str) -> (String, Option<u32>) {
        let x = parse_title(s);
        (x.key, x.year)
    }

    /// ตัวตัดชื่อ ทุกแบบในมอคอัปกับชื่อไฟล์ที่เจอจริง
    #[test]
    fn title_parser() {
        assert_eq!(t("ดาวเหนือ.2023.1080p.BluRay.x265"), ("ดาวเหนือ".into(), Some(2023)));
        assert_eq!(t("ดาวเหนือ (2023) poster"), ("ดาวเหนือ".into(), Some(2023)));
        assert_eq!(t("Harbor.Lights.2021.2160p.WEB-DL"), ("harborlights".into(), Some(2021)));
        assert_eq!(t("harbor_lights_2021"), ("harborlights".into(), Some(2021)));
        assert_eq!(t("silent-orbit-backdrop"), ("silentorbit".into(), None));
        assert_eq!(t("Silent.Orbit.1080p-GRP"), ("silentorbit".into(), None));
        assert_eq!(t("ลมหนาว.2020.720p.WEB-DL.AAC.H264-Tigole"), ("ลมหนาว".into(), Some(2020)));
        assert_eq!(t("ember (1)"), ("ember".into(), None));
        assert_eq!(t("ember-poster-hd"), ("ember".into(), None));
        assert_eq!(t("tidal_alt"), ("tidal".into(), None));
        // เลขภาคไม่ใช่เลขสำเนา ต้องอยู่
        assert_eq!(t("เมืองในหมอก ภาค 2"), ("เมืองในหมอกภาค2".into(), None));
        assert_eq!(t("หมอกเมือง 2"), ("หมอกเมือง2".into(), None));
        // ชื่อเรื่องเป็นตัวเลขเหมือนปี
        assert_eq!(t("1917.2019.1080p"), ("1917".into(), Some(2019)));
        assert_eq!(t("2012"), ("2012".into(), None));
        assert_eq!(t("Blade.Runner.2049.2017"), ("bladerunner2049".into(), Some(2017)));
        // ชื่อทั่วไปไม่เหลือชื่อเรื่อง
        assert_eq!(t("folder"), ("".into(), None));
        assert_eq!(parse_title("poster_tt7654321").imdb.as_deref(), Some("tt7654321"));
        assert_eq!(parse_title("poster_tt7654321").key, "");
        assert_eq!(find_imdb("ไม่มีเลข att1234567 tt12"), None);
        assert_eq!(parse_title("ดาวเหนือ.2023.1080p").pretty, "ดาวเหนือ (2023)");
        // ผู้ช่วยตรวจขั้น 8 · ตัดคำผิดที่ · เลขปีที่เป็นชื่อเรื่อง · เลขในวงเล็บของหนังเป็นชื่อเรื่อง
        let mv = |s: &str| movie_title(Path::new(&format!("D:\\หนัง\\{s}.mkv")));
        assert_eq!(mv("The Final Cut").key, "thefinalcut", "คำว่า final ในชื่อหนังต้องอยู่");
        assert_eq!(mv("Final Destination (2000)").pretty, "Final Destination (2000)");
        assert_eq!(mv("The Web (2013)").pretty, "The Web (2013)");
        assert_eq!(mv("Charlotte's Web (2006)").pretty, "Charlotte's Web (2006)");
        assert_eq!(mv("Ocean's Eleven").pretty, "Ocean's Eleven");
        assert_eq!(mv("Ocean's Eleven").key, "oceanseleven");
        assert_eq!(mv("The Web").key, "theweb", "web คำเดียวท้ายชื่อคือชื่อเรื่อง");
        assert_eq!(mv("Cover").key, "cover");
        assert_eq!(mv("Rocky (2)").key, "rocky2", "หนังไม่ตัดเลขในวงเล็บ");
        assert_eq!(mv("Harbor.Lights.WEB-DL.1080p").key, "harborlights");
        assert_eq!(mv("Blade Runner 2049").key, "bladerunner2049", "เลขเกินปีหน้าไม่ใช่ปี");
        assert_eq!(mv("Blade Runner 2049").year, None);
        assert!(mv("Wonder Woman 1984").loose_year);
        assert!(!mv("Silent.Orbit.2018").loose_year);
        assert!(!mv("ดาวเหนือ (2023)").loose_year);
        assert_eq!(t("Final Cover Dune"), ("dune".into(), None));
        assert_eq!(movie_title(Path::new(r"D:\หนัง\ฝนสุดท้ายของฤดู (2019)\movie.mkv")).pretty, "ฝนสุดท้ายของฤดู (2019)");
    }

    #[test]
    fn name_similarity() {
        // เลขตามมอคอัป เมืองในหมอก กับ เมืองหมอก 82%
        assert_eq!(pct(similarity("เมืองในหมอก", "เมืองหมอก")), 82);
        assert!(similarity("เมืองในหมอก", "หมอกเมือง2") >= UNSURE_MIN, "ชื่อสลับคำต้องเสนอ");
        assert!(similarity("เมืองในหมอก", "เมืองในหมอกภาค2") >= UNSURE_MIN);
        assert!(similarity("paperkites", "img") < UNSURE_MIN);
        assert_eq!(similarity("", "x"), 0.0);
    }

    fn img(name: &str, w: u32, h: u32) -> ImgIn {
        ImgIn { path: format!("D:\\รูป\\{name}"), name: name.into(), folder: "D:\\รูป".into(), width: w, height: h, thumb: None }
    }
    fn mv(id: &str, stem: &str) -> MovieIn {
        MovieIn { id: id.into(), path: format!("D:\\หนัง\\{stem}.mkv"), stem: stem.into(), title: parse_title(stem), alone: false, ..Default::default() }
    }

    /// รูปหนึ่งรูปได้หนังเรื่องเดียว · ภาคต่อชื่อซ้ำไม่กล้าตัดสิน · รูปแนวนอนได้ปกนอนกับปกตั้งที่ครอปให้
    #[test]
    fn matcher_rules() {
        let ms = vec![mv("a", "Iron Tide (2024)"), mv("b", "Iron Tide (2010)"), mv("c", "Silent.Orbit.2018"), mv("d", "Tidal.2021.1080p"), mv("e", "Paper.Kites.2012")];
        let shelf: Vec<Title> = ms.iter().map(|m| m.title.clone()).collect();
        let imgs = vec![img("iron-tide-2024.jpg", 1000, 1500), img("iron tide.jpg", 1000, 1500), img("silent-orbit.jpg", 1920, 1080), img("tidal_2021.jpg", 1000, 1500), img("tidal_alt.jpg", 1000, 1500)];
        let r = match_core(&ms, &shelf, &imgs, &HashSet::new());
        assert_eq!((r[0].status.as_str(), r[0].reason.as_str()), ("sure", "ชื่อกับปีตรง"));
        assert_eq!(r[0].tall.as_ref().unwrap().name, "iron-tide-2024.jpg");
        assert!(r[0].ticked);
        assert_eq!(r[1].status, "unsure", "ภาคต่อชื่อซ้ำ รูปไม่มีปี ต้องไม่ตัดสินเอง");
        assert_eq!(r[1].candidates[0].name, "iron tide.jpg");
        assert!(!r[1].ticked && !r[1].has_image());
        assert_eq!(r[2].wide.as_ref().unwrap().name, "silent-orbit.jpg");
        assert!(r[2].tall.is_none() && !r[2].derived_tall, "รูปแนวนอนต้องเป็นปกนอนอย่างเดียว ไม่ครอปเป็นปกตั้ง");
        assert_eq!(r[2].reason, "ชื่อตรง ไม่มีปีในชื่อรูป");
        assert_eq!(r[3].tall.as_ref().unwrap().name, "tidal_2021.jpg", "รูปมีปีตรงต้องชนะรูปไม่มีปี");
        assert_eq!(r[4].status, "none");
        // รูปที่จับคู่เองไปแล้วห้ามถูกใช้ซ้ำ
        let taken: HashSet<String> = ["D:\\รูป\\tidal_2021.jpg".to_string()].into();
        let r2 = match_core(&ms, &shelf, &imgs, &taken);
        assert_eq!(r2[3].tall.as_ref().unwrap().name, "tidal_alt.jpg");
    }

    /// จับคู่เอง หลายรูปแยกแนว · ย้อนได้ · รูปแนวตั้งจริงไม่โดนครอปทับ
    #[test]
    fn manual_pair_and_undo() {
        let pick = |n: &str, w, h| Pick { path: n.into(), name: n.into(), width: w, height: h, ..Default::default() };
        let mut r = Row { id: "a".into(), status: "none".into(), via: "auto".into(), ..Default::default() };
        pair_row(&mut r, vec![pick("wide.jpg", 1920, 1080), pick("tall.jpg", 1000, 1500)], "explorer");
        assert_eq!(r.tall.as_ref().unwrap().name, "tall.jpg");
        assert_eq!(r.wide.as_ref().unwrap().name, "wide.jpg");
        assert!(!r.derived_tall);
        assert_eq!((r.status.as_str(), r.reason.as_str(), r.ticked), ("manual", "ลากจาก Explorer", true));
        let prev = r.prev.clone().unwrap();
        assert_eq!(prev.status, "none");
        assert!(prev.prev.is_none(), "ย้อนได้ขั้นเดียว ไม่สะสม");
        pair_row(&mut r, vec![pick("w2.jpg", 1920, 1080)], "board");
        assert!(!r.derived_tall && r.tall.is_none(), "รูปแนวนอนรูปเดียวเป็นปกนอนอย่างเดียว ไม่ครอปเป็นปกตั้ง");
        assert_eq!(r.wide.as_ref().unwrap().name, "w2.jpg");
    }

    fn jm() -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("จับคู่");
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(e) => {
                assert!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok(), "ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display());
                None
            }
        }
    }

    /// จับคู่ชุดทดสอบจริงจากดิสก์ · ผลตรงตารางใน test-media/README.md
    #[test]
    fn real_test_set() {
        let Some(root) = jm() else { return };
        let mut files = vec![];
        fn walk(d: &Path, out: &mut Vec<PathBuf>) {
            for e in fs::read_dir(d).unwrap().flatten() {
                if e.path().is_dir() { walk(&e.path(), out); }
                else if crate::library::ACCEPTED.contains(&pi::ext_of(&e.path()).as_str()) { out.push(e.path()); }
            }
        }
        walk(&root.join("หนัง"), &mut files);
        assert_eq!(files.len(), 14);
        let paths: Vec<String> = files.iter().map(|p| p.to_string_lossy().to_string()).collect();
        let counts = dir_counts(paths.iter().map(String::as_str));
        let thumbs = root.join("__ไม่มี");
        let all: Vec<MovieIn> = paths.iter().map(|p| movie_in(p, p, p.contains("มีปกแล้ว"), &counts, &thumbs, &HashSet::new())).collect();
        let shelf: Vec<Title> = all.iter().map(|m| m.title.clone()).collect();
        let imgs = list_images(&[root.join("รูป").to_string_lossy().to_string()], &[], &thumbs);
        assert_eq!(imgs.len(), 15, "รูปในโฟลเดอร์ย่อยต้องอ่านด้วย");
        assert!(imgs.iter().any(|i| i.name == "silent-orbit-backdrop.jpg" && i.width == 1920 && i.height == 1080), "ขนาดรูปอ่านจากหัวไฟล์");
        assert!(imgs.iter().any(|i| i.name == "ลมหนาว 2020.webp" && i.width == 800));

        // เฉพาะเรื่องที่ยังไม่มีปก
        let scope: Vec<MovieIn> = all.iter().filter(|m| !m.has_cover).cloned().collect();
        let rows = match_core(&scope, &shelf, &imgs, &HashSet::new());
        let row = |title: &str| rows.iter().find(|r| r.title == title).unwrap_or_else(|| panic!("ไม่เจอแถว {title} ใน {:?}", rows.iter().map(|r| r.title.clone()).collect::<Vec<_>>()));
        let got = |title: &str| { let r = row(title); (r.status.clone(), r.tall.as_ref().map(|p| p.name.clone()).unwrap_or_default(), r.reason.clone()) };
        assert_eq!(got("ดาวเหนือ (2023)"), ("sure".into(), "ดาวเหนือ (2023) poster.jpg".into(), "ชื่อกับปีตรง".into()));
        assert_eq!(got("Harbor Lights (2021)"), ("sure".into(), "harbor_lights_2021.png".into(), "ชื่อกับปีตรง".into()));
        assert_eq!(got("ฝนสุดท้ายของฤดู (2019)"), ("sure".into(), "folder.jpg".into(), "รูปอยู่ข้างไฟล์หนัง".into()));
        { let r = row("Silent Orbit (2018)"); assert_eq!((r.status.as_str(), r.reason.as_str()), ("sure", "ชื่อตรง ไม่มีปีในชื่อรูป")); assert!(r.tall.is_none() && !r.derived_tall); assert_eq!(r.wide.as_ref().unwrap().name, "silent-orbit-backdrop.jpg"); }
        assert_eq!(got("Iron Tide (2024)"), ("sure".into(), "iron-tide-2024.jpg".into(), "ชื่อกับปีตรง".into()));
        assert_eq!(got("Night Bus (2020)"), ("sure".into(), "poster_tt7654321.jpg".into(), "เลข IMDb ตรงกัน".into()));
        assert_eq!(got("Ember (2022)"), ("sure".into(), "Ember (2022)-poster.jpg".into(), "รูปอยู่ข้างไฟล์หนัง".into()));
        assert_eq!(got("ลมหนาว (2020)"), ("sure".into(), "ลมหนาว 2020.webp".into(), "ชื่อกับปีตรง".into()));
        assert_eq!(got("Tidal (2021)"), ("sure".into(), "tidal_2021.jpg".into(), "ชื่อกับปีตรง".into()));
        let mok = row("เมืองในหมอก (2015)");
        assert_eq!(mok.status, "unsure");
        assert_eq!(mok.score, 82);
        assert_eq!(mok.candidates.len(), 3, "{:?}", mok.candidates.iter().map(|c| c.name.clone()).collect::<Vec<_>>());
        assert_eq!(mok.candidates[0].name, "เมืองหมอก.jpg");
        assert!(!mok.ticked && !mok.has_image());
        assert_eq!(row("Iron Tide (2010)").status, "unsure");
        assert_eq!(row("Iron Tide (2010)").candidates[0].name, "iron tide.jpg");
        assert_eq!(row("Paper Kites (2012)").status, "none");
        assert_eq!(row("Copper Sky (2014)").status, "none");
        let n = |s: &str| rows.iter().filter(|r| r.status == s).count();
        assert_eq!((n("sure"), n("unsure"), n("none"), rows.len()), (9, 2, 2, 13));

        // ทุกเรื่องบนชั้นวาง เรื่องที่มีปกในไฟล์ได้คู่ด้วย
        let rows2 = match_core(&all, &shelf, &imgs, &HashSet::new());
        assert_eq!(rows2.len(), 14);
        let c = rows2.iter().find(|r| r.title == "มีปกแล้ว (2017)").unwrap();
        assert_eq!((c.status.as_str(), c.has_cover), ("sure", true));
    }

    // ---------- ขั้น 2 เก็บรูปจริง ----------

    struct Lab { root: PathBuf, movie: PathBuf, tall: PathBuf, wide: PathBuf, tools: PathBuf, thumbs: PathBuf, covers: PathBuf, work: PathBuf }
    impl Drop for Lab { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }

    /// โฟลเดอร์ทดลองในที่ชั่วคราว · หนังชื่อไทย รูปแนวตั้ง รูปแนวนอน คัดลอกจากชุดทดสอบ
    fn lab(name: &str) -> Option<Lab> {
        let src = jm()?;
        let root = std::env::temp_dir().join(format!("ชั้นหนัง-เก็บปก-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        for d in ["หนัง", "รูป", "thumbs", "covers", "tmp"] { fs::create_dir_all(root.join(d)).unwrap(); }
        let movie = root.join("หนัง").join("ดาวตก (2024).mkv");
        fs::copy(src.join("หนัง").join("Tidal.2021.1080p.mkv"), &movie).unwrap();
        let (tall, wide) = (root.join("รูป").join("รูปตั้ง.jpg"), root.join("รูป").join("รูปนอน.jpg"));
        fs::copy(src.join("รูป").join("tidal_2021.jpg"), &tall).unwrap();
        fs::copy(src.join("รูป").join("silent-orbit-backdrop.jpg"), &wide).unwrap();
        Some(Lab {
            tools: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools"),
            thumbs: root.join("thumbs"), covers: root.join("covers"), work: root.join("tmp"), root, movie, tall, wide,
        })
    }
    impl Lab {
        fn env(&self) -> WriteEnv<'_> {
            WriteEnv { tools: &self.tools, work: &self.work, thumbs: &self.thumbs, covers: &self.covers, shrink: true, format: "jpg", quality: 90, also_app: false }
        }
        fn pick(&self, p: &Path) -> Pick {
            let (width, height) = header_size(p);
            Pick { path: p.to_string_lossy().to_string(), name: p.file_name().unwrap().to_string_lossy().to_string(), width, height, ..Default::default() }
        }
        fn mv(&self) -> Movie {
            Movie { id: "99".into(), path: self.movie.to_string_lossy().to_string(), name: "ดาวตก (2024)".into(), ..Default::default() }
        }
        fn row(&self) -> Row {
            Row { id: "99".into(), status: "manual".into(), ticked: true, tall: Some(self.pick(&self.tall)), wide: Some(self.pick(&self.wide)), ..Default::default() }
        }
        fn movie_dir(&self) -> Vec<String> {
            let mut v: Vec<String> = fs::read_dir(self.root.join("หนัง")).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
            v.sort();
            v
        }
        fn originals(&self) -> [String; 3] {
            [file_sha(&self.movie).unwrap(), file_sha(&self.tall).unwrap(), file_sha(&self.wide).unwrap()]
        }
    }

    /// ทั้ง 3 แบบเขียนถูกที่ ชื่อถูก ขนาดถูก · ไฟล์หนังกับรูปต้นฉบับเท่าเดิมทุกไบต์
    #[test]
    fn three_store_modes() {
        let Some(l) = lab("สามแบบ") else { return };
        let before = l.originals();

        // ค่าตั้งต้น คัดลอกไปข้างไฟล์หนัง
        let mut m = l.mv();
        let covers = apply_row(&l.env(), &m, &l.row(), "beside").unwrap();
        assert_eq!(covers.len(), 2);
        let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
        let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");
        assert_eq!(image::image_dimensions(&poster).unwrap(), (1000, 1500));
        assert_eq!(image::image_dimensions(&land).unwrap(), (1920, 1080));
        assert_eq!(l.movie_dir(), vec!["ดาวตก (2024)-landscape.jpg", "ดาวตก (2024)-poster.jpg", "ดาวตก (2024).mkv"], "ไม่มีไฟล์ชั่วคราวค้าง");
        let tall = &covers[0];
        assert!(tall.owned && tall.store == "beside" && tall.orient == "tall");
        assert_eq!(tall.sha256, file_sha(&poster));
        assert!(Path::new(&tall.thumb).exists());
        assert!((tall.aspect - 2.0 / 3.0).abs() < 0.01 && (covers[1].aspect - 16.0 / 9.0).abs() < 0.01);
        assert_eq!(image::image_dimensions(&tall.thumb).unwrap().1, 450);
        assert!(merge_covers(&mut m, covers).is_empty());
        assert_eq!(l.originals(), before, "ไฟล์หนังกับรูปต้นฉบับต้องไม่เปลี่ยนแม้แต่ไบต์เดียว");

        // ครอปใหม่ แทนไฟล์ของโปรแกรมเอง ชื่อเดิม ไม่มี (2) ไม่มีไฟล์ค้าง
        let old_sha = file_sha(&poster);
        let mut r = l.row();
        r.wide = None;
        let (w, h) = (r.tall.as_ref().unwrap().width, r.tall.as_ref().unwrap().height);
        r.tall.as_mut().unwrap().geo = Some(Geometry { tilt: 5.0, ..default_geo("tall", w, h) });
        let again = apply_row(&l.env(), &m, &r, "beside").unwrap();
        assert_ne!(file_sha(&poster), old_sha, "ไฟล์ต้องเปลี่ยนเป็นรูปที่ครอปใหม่");
        assert_eq!(again[0].file.as_deref(), Some(poster.to_string_lossy().as_ref()));
        assert_eq!(l.movie_dir().len(), 3);
        let old_thumb = m.linked[0].thumb.clone();
        let gone = merge_covers(&mut m, again);
        assert_eq!(gone.len(), 1);
        assert_eq!(gone[0].file, None, "ไฟล์ปลายทางเดียวกัน ห้ามเอาไปลบ");
        assert_eq!(remove_cover(&gone[0]), None);
        assert!(poster.exists());
        assert!(!Path::new(&old_thumb).exists(), "ภาพเล็กของรูปเก่าต้องไม่ค้าง");

        // เก็บสำเนาในโปรแกรม ไม่มีไฟล์เพิ่มข้างหนัง
        let a = l.mv();
        let n = l.movie_dir().len();
        let cov = apply_row(&l.env(), &a, &l.row(), "app").unwrap();
        assert_eq!(l.movie_dir().len(), n);
        assert!(cov.iter().all(|c| c.owned && c.store == "app" && Path::new(c.file.as_ref().unwrap()).starts_with(&l.covers)));
        assert_eq!(image::image_dimensions(cov[0].file.as_ref().unwrap()).unwrap(), (1000, 1500));

        // จับคู่อย่างเดียว ไม่มีไฟล์ใหม่ มีแค่ภาพเล็ก ค่าครอปจำไว้
        let cov = apply_row(&l.env(), &a, &l.row(), "link").unwrap();
        assert_eq!(l.movie_dir().len(), n);
        assert!(cov.iter().all(|c| !c.owned && c.file.is_none() && c.geo.is_some() && Path::new(&c.thumb).exists()));
        assert_eq!(cov[0].source, l.tall.to_string_lossy());
        assert_eq!(l.originals(), before);

        // PNG ตามค่าในหน้าตั้งค่า นามสกุลเปลี่ยนตาม
        let env = WriteEnv { format: "png", ..l.env() };
        let cov = apply_row(&env, &a, &l.row(), "beside").unwrap();
        assert!(cov[0].file.as_ref().unwrap().ends_with("ดาวตก (2024)-poster.png"), "{:?}", cov[0].file);
    }

    /// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม ได้สำเนาสองที่ ไบต์เดียวกัน · เอาปกออกไปทั้งคู่ · แบบอื่นไม่มีสำเนาซ้อน
    #[test]
    fn beside_and_app_together() {
        let Some(l) = lab("สองที่") else { return };
        let env = WriteEnv { also_app: true, ..l.env() };
        let before = l.originals();
        let m = l.mv();
        let only_app = apply_row(&env, &m, &l.row(), "app").unwrap();
        assert!(only_app.iter().all(|c| c.app_copy.is_none()), "เก็บในโปรแกรมอย่างเดียว ไม่มีสำเนาซ้อน");
        let only_link = apply_row(&env, &m, &l.row(), "link").unwrap();
        assert!(only_link.iter().all(|c| c.app_copy.is_none() && c.file.is_none()));
        let cov = apply_row(&env, &m, &l.row(), "beside").unwrap();
        assert_eq!(cov.len(), 2);
        for c in &cov {
            let copy = c.app_copy.as_ref().expect("ต้องมีสำเนาในโปรแกรม");
            assert!(Path::new(copy).starts_with(&l.covers));
            assert_eq!(file_sha(Path::new(copy)), c.sha256);
            assert_eq!(file_sha(Path::new(c.file.as_ref().unwrap())), c.sha256);
        }
        // ยืนยันรูปเดิมซ้ำ สำเนาชื่อเดิมยังถูกใช้อยู่ ห้ามถูกลบ
        let mut held = l.mv();
        assert!(merge_covers(&mut held, cov.clone()).is_empty());
        let again = apply_row(&env, &held, &l.row(), "beside").unwrap();
        let gone = merge_covers(&mut held, again);
        assert!(gone.iter().all(|g| g.app_copy.is_none()), "สำเนาที่ปกใหม่ใช้อยู่ต้องไม่อยู่ในรายการลบ");
        assert_eq!(l.originals(), before, "ไฟล์หนังกับรูปต้นฉบับต้องไม่เปลี่ยน");
        for c in &cov {
            let (f, copy) = (c.file.clone().unwrap(), c.app_copy.clone().unwrap());
            assert_eq!(remove_cover(c), None);
            assert!(!Path::new(&f).exists() && !Path::new(&copy).exists(), "เอาออกต้องไปทั้งสองที่");
        }
    }

    /// ค่าตั้งไฟล์เก่ามีแค่แบบเดียว อ่านแล้วคงแบบเดิม · ติ๊กหลายแบบ แบบหลักข้างไฟล์หนังก่อน
    #[test]
    fn store_settings_old_and_many() {
        let mut old: crate::store::Settings = serde_json::from_str(r#"{"linkStore":"app"}"#).unwrap();
        old.normalize_link_stores();
        assert_eq!(old.link_stores, vec!["app".to_string()]);
        assert_eq!(old.link_store, "app");
        assert!(!old.also_app());
        let mut all: crate::store::Settings = serde_json::from_str(r#"{"linkStores":["link","app","beside"]}"#).unwrap();
        all.normalize_link_stores();
        assert_eq!(all.link_store, "beside");
        assert!(all.also_app());
    }

    /// ไฟล์ชื่อเดียวกันที่โปรแกรมไม่ได้ทำ ไม่โดนทับ · ช่องหลังล้ม ไฟล์ใหม่ของช่องก่อนถูกเอาออก
    #[test]
    fn never_overwrites_foreign_files() {
        let Some(l) = lab("ไม่ทับ") else { return };
        let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");
        let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
        fs::write(&land, b"foreign").unwrap();
        let e = apply_row(&l.env(), &l.mv(), &l.row(), "beside").unwrap_err();
        assert_eq!(e.conflict.as_deref(), Some(land.to_string_lossy().as_ref()));
        assert!(e.msg.contains("ไม่เขียนทับ"), "{}", e.msg);
        assert_eq!(fs::read(&land).unwrap(), b"foreign", "ไฟล์ของคนอื่นต้องเหมือนเดิม");
        assert!(!poster.exists(), "ช่องปกตั้งที่ทำไปแล้วต้องถูกเอาออก แถวไม่ครึ่ง ๆ กลาง ๆ");
        assert_eq!(l.movie_dir(), vec!["ดาวตก (2024)-landscape.jpg", "ดาวตก (2024).mkv"]);

        // ไฟล์ของโปรแกรมที่ถูกแก้ภายหลัง ก็ไม่ถือเป็นของโปรแกรมแล้ว
        let r = Row { wide: None, ..l.row() };
        let cov = apply_row(&l.env(), &l.mv(), &r, "beside").unwrap();
        let mut m = l.mv();
        merge_covers(&mut m, cov);
        fs::write(&poster, b"edited").unwrap();
        let e = apply_row(&l.env(), &m, &r, "beside").unwrap_err();
        assert!(e.conflict.is_some());
        assert_eq!(fs::read(&poster).unwrap(), b"edited");
    }

    /// ผู้ช่วยตรวจขั้น 8 · ปกที่เหลือใช้ไฟล์นี้เป็นรูปต้นทาง ต้องไม่เอาออก · ชื่อต่างแค่ตัวพิมพ์คือไฟล์เดียวกัน
    #[test]
    fn merge_keeps_files_still_in_use() {
        let cover = |file: &str, source: &str| LinkedCover { orient: "tall".into(), file: Some(file.into()), source: source.into(), owned: true, store: "beside".into(), thumb: "D:\\t\\a.jpg".into(), ..Default::default() };
        // ย้ายเป็นจับคู่อย่างเดียว ปกใหม่ใช้สำเนาเก่าเป็นรูปต้นทาง
        let mut m = Movie { linked: vec![cover("D:\\x-poster.jpg", "D:\\รูป.jpg")], ..Default::default() };
        let gone = merge_covers(&mut m, vec![LinkedCover { file: None, source: "D:\\x-poster.jpg".into(), store: "link".into(), thumb: "D:\\t\\b.jpg".into(), ..cover("", "") }]);
        assert_eq!(gone[0].file, None, "ไฟล์ที่ปกใหม่ใช้เป็นต้นทาง ห้ามลงถังขยะ");
        // เปลี่ยนแค่ตัวพิมพ์ของชื่อหนัง ไฟล์เดียวกันบน Windows
        let mut m = Movie { linked: vec![cover("D:\\iron tide-poster.jpg", "D:\\รูป.jpg")], ..Default::default() };
        let gone = merge_covers(&mut m, vec![cover("D:\\Iron Tide-poster.jpg", "D:\\รูป.jpg")]);
        assert_eq!(gone[0].file, None, "ชื่อต่างแค่ตัวพิมพ์ ห้ามลงถังขยะ");
        assert!(gone[0].thumb.is_empty(), "ภาพเล็กเดียวกันห้ามลบ");
    }

    /// ผู้ช่วยตรวจขั้น 8 · ช่องปกนอนชนไฟล์คนอื่น ต้องล้มก่อนแตะไฟล์ปกตั้ง
    #[test]
    fn conflict_checked_before_any_write() {
        let Some(l) = lab("ชนก่อนเขียน") else { return };
        let mut m = l.mv();
        let covers = apply_row(&l.env(), &m, &Row { wide: None, ..l.row() }, "beside").unwrap();
        merge_covers(&mut m, covers);
        let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
        let sha = file_sha(&poster);
        fs::write(l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg"), "ของคนอื่น").unwrap();
        let mut p = l.pick(&l.tall);
        p.geo = Some(Geometry { tilt: 5.0, ..default_geo("tall", p.width, p.height) });
        let e = apply_row(&l.env(), &m, &Row { tall: Some(p), ..l.row() }, "beside").unwrap_err();
        assert!(e.conflict.is_some());
        assert_eq!(file_sha(&poster), sha, "ปกตั้งต้องไม่ถูกแทน");
    }

    /// ผู้ช่วยตรวจขั้น 8 · ยืนยันกับย้ายที่เก็บห้ามซ้อนกัน ระหว่างนั้นห้ามแก้แถว · งานจบหรือล้มต้องปลดเอง
    #[test]
    fn busy_guard_blocks_overlap() {
        let store = Arc::new(LinkStore::load(std::env::temp_dir().join(format!("ชั้นหนัง-กันซ้อน-{}.json", std::process::id()))));
        assert!(store.idle().is_ok());
        let g = begin_busy(&store).unwrap();
        assert!(store.is_busy() && store.idle().is_err());
        assert!(begin_busy(&store).is_err(), "งานที่สองต้องไม่เริ่ม");
        drop(g);
        assert!(store.idle().is_ok(), "งานจบแล้วต้องปลด");
    }

    /// ผู้ช่วยตรวจขั้น 8 · หนังไม่มีปีกับรูปหลายปี · เลขท้ายชื่อที่อาจเป็นชื่อเรื่อง · ไม่ติ๊กให้ถ้าไม่มีปี
    #[test]
    fn matcher_does_not_guess() {
        let m = |stem: &str| MovieIn { id: stem.into(), path: format!("D:\\หนัง\\{stem}.mkv"), stem: stem.into(), title: movie_title(Path::new(&format!("D:\\หนัง\\{stem}.mkv"))), ..Default::default() };
        let img = |n: &str| ImgIn { path: format!("D:\\รูป\\{n}"), name: n.into(), width: 1000, height: 1500, ..Default::default() };
        let go = |stem: &str, imgs: &[&str]| { let mv = m(stem); let shelf = vec![mv.title.clone()]; let list: Vec<ImgIn> = imgs.iter().map(|n| img(n)).collect(); match_core(&[mv], &shelf, &list, &HashSet::new()).remove(0) };
        let r = go("Dune", &["Dune (1984).jpg", "Dune (2021).jpg"]);
        assert_eq!(r.status, "unsure");
        assert_eq!(r.candidates.len(), 2);
        assert!(!r.has_image(), "รูปหลายปีห้ามเลือกให้");
        let r = go("Wonder Woman 1984", &["wonder-woman.jpg"]);
        assert_eq!(r.status, "unsure", "เลขท้ายชื่ออาจเป็นชื่อเรื่อง");
        let r = go("Blade Runner 2049", &["blade-runner.jpg"]);
        assert_ne!(r.status, "sure", "ภาคต่อห้ามได้ปกภาคแรกแบบแน่");
        let r = go("The Final Cut", &["The Cut (2014).jpg"]);
        assert_ne!(r.status, "sure", "คนละเรื่อง");
        let r = go("Silent.Orbit.2018", &["silent-orbit-backdrop.jpg"]);
        assert_eq!(r.status, "sure");
        assert!(!r.ticked, "ไม่มีปีในชื่อรูป ไม่ติ๊กให้");
        let r = go("Tidal.2021.1080p", &["tidal_2021.jpg"]);
        assert!(r.ticked, "ชื่อกับปีตรง ติ๊กให้");
    }

    /// ผู้ช่วยตรวจขั้น 8 · แถวจากชั้นวางที่ยังไม่แตะไม่นับว่ารอ · แตะแล้วนับ
    #[test]
    fn shelf_rows_count_only_after_touch() {
        let pick = Pick { path: "D:\\a.jpg".into(), width: 1000, height: 1500, ..Default::default() };
        let mut r = Row { id: "1".into(), status: "manual".into(), via: "shelf".into(), ticked: true, tall: Some(pick), ..Default::default() };
        assert!(!is_waiting(&r));
        assert!(select_rows(std::slice::from_ref(&r), "all").is_empty());
        assert_eq!(select_rows(std::slice::from_ref(&r), "1"), vec!["1".to_string()], "กดยืนยันที่แถวตรง ๆ ยังใช้ได้");
        r.touched = true;
        assert!(is_waiting(&r));
    }

    /// รูปต้นทางคือไฟล์ชื่อนั้นข้างหนังอยู่แล้ว ไม่ได้ครอป ใช้ไฟล์นั้นเลย · ครอปแล้วจะทับต้นฉบับ ต้องไม่เขียน
    #[test]
    fn existing_art_is_used_as_is() {
        let Some(l) = lab("มีอยู่แล้ว") else { return };
        let art = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
        fs::copy(&l.tall, &art).unwrap();
        let sha = file_sha(&art);
        let r = Row { tall: Some(l.pick(&art)), wide: None, ..l.row() };
        let cov = apply_row(&l.env(), &l.mv(), &r, "beside").unwrap();
        assert!(!cov[0].owned, "ไม่ใช่ไฟล์ที่โปรแกรมทำ");
        assert_eq!(cov[0].file.as_deref(), Some(art.to_string_lossy().as_ref()));
        assert_eq!(file_sha(&art), sha);
        assert_eq!(l.movie_dir().len(), 2);
        // เอาปกออกแล้วไฟล์ต้องยังอยู่
        assert_eq!(remove_cover(&cov[0]), None);
        assert!(art.exists());

        let mut p = l.pick(&art);
        p.geo = Some(Geometry { tilt: 3.0, ..default_geo("tall", p.width, p.height) });
        let e = apply_row(&l.env(), &l.mv(), &Row { tall: Some(p), wide: None, ..l.row() }, "beside").unwrap_err();
        assert!(e.conflict.is_some(), "ครอปแล้วชื่อชนกับต้นฉบับ ต้องไม่ทับ");
        assert_eq!(file_sha(&art), sha);
    }

    /// แผงขวากับป้ายในตารางบอกว่าครอปแล้วเฉพาะที่ผู้ใช้ครอปเอง · ค่ากลางรูปที่โปรแกรมตั้งให้ไม่นับ
    #[test]
    fn cropped_only_when_user_cropped() {
        let Some(l) = lab("ครอปเอง") else { return };
        let plain = apply_row(&l.env(), &l.mv(), &Row { wide: None, ..l.row() }, "app").unwrap();
        assert!(!plain[0].cropped);
        assert!(plain[0].geo.is_some(), "ค่ากลางรูปยังจดไว้ ใช้ต่อตอนรวมเข้าไฟล์");

        let mut p = l.pick(&l.tall);
        p.geo = Some(Geometry { tilt: 2.0, ..default_geo("tall", p.width, p.height) });
        let done = apply_row(&l.env(), &l.mv(), &Row { tall: Some(p), wide: None, ..l.row() }, "app").unwrap();
        assert!(done[0].cropped);
    }

    /// เอาปกออก · ไฟล์ของโปรแกรมลงถังขยะ · ไฟล์ที่ถูกแก้ไม่ลบ · เปลี่ยนชื่อหนังแล้วสำเนาตามชื่อ
    #[test]
    fn remove_and_rename() {
        let Some(l) = lab("เอาออก") else { return };
        let r = l.row();
        let mut m = l.mv();
        let made = apply_row(&l.env(), &m, &r, "beside").unwrap();
        merge_covers(&mut m, made);
        let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
        let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");

        // เปลี่ยนชื่อหนัง ทั้งสองไฟล์ตามชื่อใหม่
        let renamed = l.root.join("หนัง").join("ดาวตกภาคใหม่.mkv");
        fs::rename(&l.movie, &renamed).unwrap();
        rename_beside(&mut m, &renamed);
        let new_poster = l.root.join("หนัง").join("ดาวตกภาคใหม่-poster.jpg");
        let new_land = l.root.join("หนัง").join("ดาวตกภาคใหม่-landscape.jpg");
        assert!(new_poster.exists() && new_land.exists() && !poster.exists() && !land.exists());
        assert_eq!(m.linked[0].file.as_deref(), Some(new_poster.to_string_lossy().as_ref()));

        // ไฟล์ที่ถูกแก้ ไม่ลบ บอกกลับ
        fs::write(&new_land, b"edited").unwrap();
        let wide = m.linked.iter().find(|c| c.orient == "wide").unwrap();
        assert!(remove_cover(wide).unwrap().contains("ถูกแก้"));
        assert!(new_land.exists());
        // ไฟล์ของโปรแกรมที่ไม่ถูกแก้ ลงถังขยะ ภาพเล็กหายด้วย
        let tall = m.linked.iter().find(|c| c.orient == "tall").unwrap();
        assert_eq!(remove_cover(tall), None);
        assert!(!new_poster.exists() && !Path::new(&tall.thumb).exists());
        assert!(renamed.exists(), "ไฟล์หนังต้องอยู่");
    }

    /// ยืนยันทั้งหมด ไม่รวมแถวไม่แน่ใจที่ยังไม่เลือกรูป กับแถวหาคู่ไม่เจอ (พี่กันเคาะ) · ที่ติ๊กไว้นับตามติ๊ก
    #[test]
    fn which_rows_confirm() {
        let p = Some(Pick { path: "x.jpg".into(), width: 10, height: 15, ..Default::default() });
        let row = |id: &str, status: &str, tall: Option<Pick>, ticked: bool| Row { id: id.into(), status: status.into(), tall, ticked, ..Default::default() };
        let rows = vec![
            row("sure", "sure", p.clone(), true),
            row("off", "sure", p.clone(), false),
            row("chosen", "unsure", p.clone(), true),
            row("unsure", "unsure", None, false),
            row("none", "none", None, false),
            row("saved", "saved", p.clone(), false),
        ];
        assert_eq!(select_rows(&rows, "ticked"), vec!["sure", "chosen"]);
        assert_eq!(select_rows(&rows, "all"), vec!["sure", "off", "chosen"]);
        assert_eq!(select_rows(&rows, "off"), vec!["off"]);
        assert!(select_rows(&rows, "saved").is_empty(), "แถวที่ยืนยันแล้วยืนยันซ้ำไม่ได้");
        assert!(select_rows(&rows, "unsure").is_empty(), "แถวไม่มีรูปยืนยันไม่ได้");
    }

    /// คลังเก่าที่ไม่มีช่องปกจับคู่ยังอ่านได้ · ค่าตั้งต้นของหน้าตั้งค่าคือคัดลอกไปข้างไฟล์หนัง
    #[test]
    fn old_data_still_reads() {
        let old: Movie = serde_json::from_str(r#"{"id":"1","path":"D:\\a.mkv","name":"a"}"#).unwrap();
        assert!(old.linked.is_empty() && old.cover_pick.is_empty());
        let s: crate::store::Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.link_store, "beside");
    }

    /// ปิดเปิดโปรแกรมแล้วแถวครบ · แถวที่ยืนยันแล้วไม่กลับมา · ไฟล์เสียใช้สำรอง
    #[test]
    fn store_survives_restart() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนัง-จับคู่-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("pending.json");
        let s = LinkStore::load(path.clone());
        assert_eq!(s.data.lock().unwrap().scope, "nocover");
        let pick = Pick { path: "D:\\รูป\\ก.jpg".into(), name: "ก.jpg".into(), width: 1000, height: 1500, ..Default::default() };
        {
            let mut d = s.data.lock().unwrap();
            d.image_folders = vec!["D:\\รูป".into()];
            d.rows = vec![
                Row { id: "1".into(), status: "sure".into(), tall: Some(pick.clone()), ticked: true, ..Default::default() },
                Row { id: "2".into(), status: "saved".into(), tall: Some(pick.clone()), ..Default::default() },
                Row { id: "3".into(), status: "none".into(), ..Default::default() },
            ];
        }
        s.save().unwrap();
        assert_eq!(s.waiting(), 1, "นับเฉพาะแถวที่มีรูปและยังไม่ยืนยัน");
        s.save().unwrap(); // รอบสองมีไฟล์สำรองแล้ว
        let back = LinkStore::load(path.clone());
        {
            let d = back.data.lock().unwrap();
            assert_eq!(d.rows.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), vec!["1", "3"], "แถวที่ยืนยันแล้วของรอบก่อนไม่กลับมา");
            assert_eq!(d.rows[0].tall.as_ref().unwrap().name, "ก.jpg");
            assert_eq!(d.image_folders, vec!["D:\\รูป".to_string()]);
        }
        fs::write(&path, "{ไม่ใช่ JSON").unwrap();
        assert_eq!(LinkStore::load(path).data.lock().unwrap().rows.len(), 2, "ไฟล์เสียต้องอ่านจากสำรอง");
        let _ = fs::remove_dir_all(&dir);
    }
}
