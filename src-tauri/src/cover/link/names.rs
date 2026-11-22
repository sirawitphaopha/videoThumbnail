//! จับคู่รูปปก เทียบชื่อ อ่านชื่อเรื่องกับปีจากชื่อไฟล์ ความคล้าย และปกที่ยืนยันแล้ว
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

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
pub(crate) const GENERIC_ART: [&str; 6] = ["folder", "poster", "cover", "movie", "default", "ปก"];
/// ชื่อคล้ายกันตั้งแต่ค่านี้ขึ้นไป เสนอเป็นรูปใกล้เคียง
pub(crate) const UNSURE_MIN: f64 = 0.6;

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

