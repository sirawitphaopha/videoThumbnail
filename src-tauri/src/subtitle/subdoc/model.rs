//! หน้าแก้ซับ บรรทัด เวลา (libaegisub/ass/time.cpp) และเอกสารซับ
//! แยกจาก subdoc/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- บรรทัด

/// หนึ่งบรรทัดของไฟล์พร้อมตัวจบบรรทัดเดิม ("\r\n" "\n" "\r" หรือว่างที่บรรทัดสุดท้าย)
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
pub struct Raw {
    pub t: String,
    pub e: String,
}

pub(crate) fn split_lines(s: &str) -> Vec<Raw> {
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
pub(crate) fn main_eol(lines: &[Raw]) -> String {
    let crlf = lines.iter().filter(|l| l.e == "\r\n").count();
    let lf = lines.iter().filter(|l| l.e == "\n").count();
    if crlf >= lf && crlf > 0 { "\r\n".into() } else { "\n".into() }
}

// ---------------------------------------------------------------- เวลา (libaegisub/ass/time.cpp)

pub(crate) const MAX_MS: i64 = 10 * 60 * 60 * 1000 - 6;

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
pub(crate) fn numbers_in_order(events: &[Event]) -> bool {
    events.iter().enumerate().all(|(k, e)| e.ident.as_deref().map(str::trim) == Some((k + 1).to_string().as_str()))
}

