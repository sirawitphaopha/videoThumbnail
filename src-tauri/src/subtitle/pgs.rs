//! ส่งออกซับเป็น PGS ซับแบบภาพของ Blu-ray ไฟล์ .sup (BUGS ข้อ 118)
//! พี่กันสั่ง "เพิ่มระบบส่งออกเป็นซับ PGS ได้ ส่งจาก ass นี่เเหละ" · "เราต้องการสิ่งที่ดีที่สุด … มันมีข้อจำกัดก็ต้องเตือนด้วย"
//! ffmpeg ที่แนบมามีแค่ตัวเขียนไฟล์ .sup ไม่มีตัวสร้างภาพ PGS จึงทำเองทั้งหมด (ผลค้นใน docs/research/pgs-ส่งออกจาก-ass.md)
//!   ① หาจุดที่ภาพซับเปลี่ยน คือเวลาเริ่มกับเวลาจบของทุกบรรทัด บรรทัดที่มีเอฟเฟกต์เคลื่อนไหว (\move \fad \fade \t คาราโอเกะ) เพิ่มทุกเฟรมของหนัง
//!   ② วาดซับแต่ละช่วงด้วย libass ใน ffmpeg ตัวเดียวกับภาพนิ่งในหน้าแก้ซับ (subshot.rs) บนพื้นโปร่งใส ขนาดเท่าภาพหนัง ซับจึงหน้าตาเหมือนตอนเล่น
//!      ffmpeg รันทีละชุดไม่เกิน 64 ภาพ (BATCH) ตั้งเวลาของแต่ละภาพด้วย setpts ภาพไหลออกมาเป็นไบต์ RGBA อ่านทีละภาพ ไม่เก็บทั้งเรื่องในหน่วยความจำ
//!   ③ หากรอบภาพจากแถวที่มีซับ ซับคนละที่ (บทพูดล่างกับป้ายบน) แยกเป็นสองกรอบ มาตรฐาน Blu-ray ให้ไม่เกินสองกรอบ ที่เกินรวมกรอบที่ใกล้กัน
//!   ④ ลดสีให้เหลือไม่เกิน 255 สีต่อภาพ (สีที่ 0 คือโปร่งใส) ด้วย median cut นับสีพร้อมความโปร่งใส · สีเปลี่ยนจาก RGB เป็น YCbCr แบบ BT.709 (ภาพสูงเกิน 576) หรือ BT.601
//!   ⑤ เขียนส่วนของ PGS ตามมาตรฐาน PCS WDS PDS ODS END ทุกภาพเป็นจุดเริ่มชุดใหม่ (Epoch Start) แบบ BDSup2Sub ช่วงที่ไม่มีซับเขียนชุดล้างจอ
//!      ภาพที่เหมือนภาพก่อนหน้าทุกจุดไม่เขียนซ้ำ ภาพบีบแบบ RLE ของ PGS ภาพใหญ่เกินหนึ่งส่วนแบ่งเป็นหลายส่วน
//! เขียนลง .partial ก่อน แล้วเปลี่ยนชื่อแบบห้ามทับ ไฟล์ปลายทางมีอยู่แล้วตอบ exists ให้หน้าจอถามตั้งชื่อใหม่ ไม่แตะไฟล์หนังและไฟล์ซับ

use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::subtitle::subdoc::SubDoc;
use crate::app::tools::{tool_command, tools_dir};

static STOP: AtomicBool = AtomicBool::new(false);
/// ภาพต่อหนึ่งรอบของ ffmpeg · นิพจน์ setpts ต่อด้วย + ได้ไม่ถึง 100 ส่วน (99 ผ่าน 100 ล้ม "Cannot allocate memory" ลองแล้ว 14 พ.ย. 2569)
/// เดิม 250 ซับที่มีเอฟเฟกต์เคลื่อนไหวรวมเกิน 99 ภาพส่งออกไม่ได้ (เทส export_long_animation_over_100_frames)
const BATCH: usize = 64;

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsReq {
    pub target: String,
    /// ขนาดภาพของ PGS เท่าภาพหนัง
    pub w: u32,
    pub h: u32,
    /// อัตราเฟรมของหนัง ใช้ทั้งรหัสอัตราเฟรมในไฟล์และระยะห่างของภาพตอนวาดเอฟเฟกต์เคลื่อนไหว
    pub fps_num: u32,
    pub fps_den: u32,
    /// หนังที่ซับนี้มาจาก ใช้ฟอนต์ที่ฝังในหนัง
    pub movie: Option<String>,
    /// ตัวสร้าง PGS · shelf ตัวในโปรแกรม (ค่าตั้งต้น) · super ส่งภาพที่วาดแล้วให้ SUPer ทำไฟล์แบบมาตรฐาน Blu-ray
    #[serde(default)]
    pub engine: String,
    #[serde(default)]
    pub opts: PgsOpts,
    /// หน้าตาซับของ SRT VTT ที่ไม่มีสไตล์ · ซับ ASS ไม่ใช้
    #[serde(default)]
    pub style: Option<SrtStyle>,
}

/// ส่วนปรับแต่ง PGS ในหน้าต่างส่งออก (พี่กันสั่ง 14 พ.ย. 2569 "ขอส่วนปรับแต่ง PGS ให้ละเอียด เหมือนโปรแกรมที่เป็นตัวอย่าง") · ค่าตั้งต้นแคลร์ตั้ง
/// ตัวเลือกของ SUPer ยกชื่อกับช่วงค่าจาก SUPer_CLI --help รุ่น 0.3.0
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct PgsOpts {
    /// สีต่อภาพไม่เกิน 2 ถึง 255 (สีที่ 0 เป็นโปร่งใส)
    pub colors: u16,
    /// ตารางสี YCbCr ของจานสี · auto ภาพสูงเกิน 576 ใช้ BT.709 แบบที่ตัวเล่นเดา · 709 · 601
    pub matrix: String,
    /// ทำสีตามบรรทัด YCbCr Matrix ของซับแบบตัวเล่น (mpv ค่าตั้งต้น vsfilter-color-compat=basic)
    /// ซับ TV.601 หรือไม่มีบรรทัดนี้ บนภาพ BT.709 สีเลื่อนนิดหน่อยแบบที่เห็นตอนเล่นใน mpv · ปิดแล้วได้สีตามสไตล์ตรงตัว
    pub vsfilter: bool,
    /// เพิ่มความสดของสี 0 ถึง 100 (%) ดันสีออกจากเทาตามความสว่างเดิม
    pub vivid: u8,
    /// กระจายจุดสี (Floyd–Steinberg) ตอนสีเกินจำนวนที่ตั้ง ขอบไล่โทนเป็นขั้นน้อยลง
    pub dither: bool,
    /// กรอบบนจอพร้อมกันไม่เกิน 1 หรือ 2 (มาตรฐาน Blu-ray ให้สองกรอบ)
    pub windows: u8,
    /// SUPer ระดับบีบอัด 0 ถึง 100 (ค่าตั้งต้นของ SUPer 80)
    pub compression: u8,
    /// SUPer ตัวลดสี 0 QtzrUTC 1 Pillow 2 HexTree 3 libimagequant (ค่าตั้งต้นของ SUPer 3)
    pub quantizer: u8,
    /// SUPer การจัดกรอบ 0 ปลอดภัย 1 ปกติ 2 เต็มที่ (config.ini ของ SUPer ตั้ง 2)
    pub layout: u8,
    /// SUPer วาดซ้ำทุกกี่วินาที ให้กรอไปกลางเรื่องแล้วซับขึ้นเร็ว · 0 ไม่วาดซ้ำ
    pub redraw: f64,
    /// SUPer ตรวจว่าบิตเรตไม่เกินกี่ kbps · 0 ไม่ตรวจ
    pub max_kbps: u32,
    /// SUPer -n ยอมวาดใหม่ทีละกรอบ ลดภาพที่ตกหล่นตอนเอฟเฟกต์ซับซ้อน (README ของ SUPer)
    pub allow_normal: bool,
    /// SUPer -d เตรียมการเปลี่ยนสีล่วงหน้า ลดภาพที่ตกหล่น
    pub ahead: bool,
}
impl Default for PgsOpts {
    fn default() -> Self {
        Self { colors: 255, matrix: "auto".into(), vsfilter: true, vivid: 0, dither: false, windows: 2, compression: 80, quantizer: 3, layout: 2, redraw: 0.0, max_kbps: 0, allow_normal: true, ahead: true }
    }
}

/// หน้าตาซับ SRT ตอนทำเป็นภาพ (พี่กันสั่ง 14 พ.ย. 2569 "ขอตัวปรับสี ปรับขอบ ความหนาด้วย ถ้าแปลงจาก srt ธรรมดา")
/// ขนาด ขอบ เงา ระยะ คิดที่ภาพสูง 1080 แล้ว libass ย่อขยายตามขนาดจริง (ScaledBorderAndShadow) · ค่าตั้งต้นแคลร์ตั้ง
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct SrtStyle {
    pub font: String,
    pub size: f64,
    pub bold: bool,
    pub italic: bool,
    /// สี #RRGGBB
    pub color: String,
    pub outline_color: String,
    /// ความหนาขอบ
    pub outline: f64,
    /// ระยะเงา
    pub shadow: f64,
    pub shadow_color: String,
    /// ความทึบของเงา 0 ถึง 100 (%)
    pub shadow_opacity: u8,
    /// ระยะจากขอบล่าง
    pub margin_v: f64,
    /// ตำแหน่งบนจอแบบแป้นตัวเลข 1 ถึง 9 (2 กลางล่าง) ใช้ทั้งสามตัวสร้าง
    pub align: u8,
    /// ระยะจากขอบซ้ายขวา ใช้ทั้งสามตัวสร้าง
    pub margin_h: f64,
    // ตัวเลือกที่มีเฉพาะ Subtitle Edit (SeConv) · พี่กันสั่ง 15 พ.ย. 2569 "ก็เอามา ให้ครบเลย"
    /// ระยะเพิ่มระหว่างบรรทัด เป็นเปอร์เซ็นต์ของความสูงบรรทัด
    pub line_spacing: f64,
    /// จัดข้อความหลายบรรทัด left center right from-alignment
    pub content_align: String,
    /// กล่องพื้นหลัง none one-box box-per-line
    pub box_type: String,
    pub box_color: String,
    /// ความทึบของกล่อง 0 ถึง 100 (%)
    pub box_opacity: u8,
    pub box_padding: f64,
    pub box_radius: f64,
}
impl Default for SrtStyle {
    fn default() -> Self {
        Self {
            font: "Tahoma".into(), size: 64.0, bold: false, italic: false, color: "#FFFFFF".into(), outline_color: "#000000".into(), outline: 3.0, shadow: 1.5, shadow_color: "#000000".into(), shadow_opacity: 50, margin_v: 50.0,
            align: 2, margin_h: 60.0, line_spacing: 0.0, content_align: "center".into(), box_type: "none".into(), box_color: "#000000".into(), box_opacity: 70, box_padding: 5.0, box_radius: 0.0,
        }
    }
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsOut {
    path: String,
    /// จำนวนภาพที่เขียน (ชุดแสดงซับ)
    pub images: usize,
    /// ภาพที่มีสีเกิน 255 สีจึงลดสี
    pub reduced: usize,
    /// ภาพที่ซับอยู่เกินสองที่จึงรวมกรอบ
    pub merged: usize,
    /// สีมากที่สุดในหนึ่งภาพก่อนลด
    pub max_colors: usize,
    pub bytes: u64,
    /// ชุดที่เปลี่ยนแค่จานสี ไม่ส่งภาพซ้ำ (ภาพเฟด สีเปลี่ยนทั้งก้อน · BUGS ข้อ 126)
    pub pal_updates: usize,
    /// ชุดที่ใช้กรอบเดิมของ epoch ไม่ต้องล้างจอใหม่ (จุดเริ่มอ่าน)
    pub reused: usize,
    /// ชุดที่ห่างจากชุดก่อนน้อยกว่าเวลาที่เครื่องเล่น Blu-ray ต้องใช้ถอด (แบบจำลองของมาตรฐาน) · ตัวเล่นบนคอมไม่มีปัญหา
    pub late: usize,
}

// ---------------------------------------------------------------- จุดที่ภาพเปลี่ยน

/// ส่วนแท็ก {…} ของบรรทัด รวมเป็นข้อความเดียว ตัวพิมพ์เล็ก
fn tags_of(text: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in text.chars() {
        match c {
            '{' => inside = true,
            '}' => { inside = false; out.push(' '); }
            _ if inside => out.extend(c.to_lowercase()),
            _ => {}
        }
    }
    out
}

/// บรรทัดที่ภาพเปลี่ยนระหว่างบรรทัด ต้องวาดทุกเฟรม · \move \fad \fade \t คาราโอเกะ \k \kf \ko \K
pub fn animated(text: &str) -> bool {
    let t = tags_of(text);
    if ["\\move(", "\\fad(", "\\fade(", "\\t("].iter().any(|k| t.contains(k)) { return true; }
    t.match_indices("\\k").any(|(i, _)| t[i + 2..].starts_with(|c: char| c.is_ascii_digit() || c == 'f' || c == 'o'))
}

/// บรรทัดที่เคลื่อนไหวด้วย \fad(เข้า,ออก) อย่างเดียว คืน (เฟดเข้า, เฟดออก) ms · มีเอฟเฟกต์อื่นหรือ \fade แบบเจ็ดค่าได้ None (BUGS ข้อ 126)
pub fn fade_of(text: &str) -> Option<(i64, i64)> {
    let t = tags_of(text);
    if ["\\move(", "\\fade(", "\\t("].iter().any(|k| t.contains(k)) { return None; }
    if t.match_indices("\\k").any(|(i, _)| t[i + 2..].starts_with(|c: char| c.is_ascii_digit() || c == 'f' || c == 'o')) { return None; }
    let i = t.find("\\fad(")?;
    let rest = &t[i + 5..];
    let args: Vec<i64> = rest[..rest.find(')')?].split(',').map(|s| s.trim().parse().ok()).collect::<Option<Vec<_>>>()?;
    (args.len() == 2).then_some((args[0].max(0), args[1].max(0)))
}

/// เวลาทุกจุดที่ภาพซับอาจเปลี่ยน ms เรียงไม่ซ้ำ · บรรทัดเคลื่อนไหวเพิ่มเวลาของทุกเฟรมในช่วงบรรทัด (เฟรมแรกที่เวลา 0)
pub fn change_points(doc: &SubDoc, frame_ms: f64) -> Vec<i64> {
    let mut p: Vec<i64> = vec![];
    for e in doc.events.iter().filter(|e| !e.comment && e.end > e.start) {
        p.push(e.start.max(0));
        p.push(e.end.max(0));
        if frame_ms > 0.0 && animated(&e.text) {
            let mut k = (e.start as f64 / frame_ms).ceil() as i64;
            loop {
                // ปัดลงแบบตัวเล่น (ตัวกรอง subtitles ของ ffmpeg กับ mpv ใช้เวลาเฟรมปัดลงเป็นมิลลิวินาที) ปัดใกล้สุดแล้วครึ่งหนึ่งของเฟรมเลยเวลาเฟรม ภาพขึ้นช้าหนึ่งเฟรม
                let t = (k as f64 * frame_ms).floor() as i64;
                if t >= e.end { break; }
                if t > e.start { p.push(t); }
                k += 1;
            }
        }
    }
    p.sort_unstable();
    p.dedup();
    p
}

/// มีบรรทัดที่ขึ้นอยู่ ณ เวลา t ไหม (เริ่มนับ จบไม่นับ แบบ libass)
fn active_at(doc: &SubDoc, t: i64) -> bool {
    doc.events.iter().any(|e| !e.comment && e.start <= t && t < e.end)
}

// ---------------------------------------------------------------- ภาพหนึ่งชุด

/// กรอบหนึ่งกรอบกับภาพในกรอบ เลขสีของทุกจุด
#[derive(Clone, Debug, PartialEq)]
pub struct Obj { pub x: u16, pub y: u16, pub w: u16, pub h: u16, pub px: Vec<u8> }

#[derive(Clone, Debug, PartialEq, Default)]
pub struct Image {
    /// สี RGBA แบบไม่คูณความโปร่งใส · สีที่ 0 โปร่งใสเสมอ
    pub palette: Vec<[u8; 4]>,
    pub objs: Vec<Obj>,
    /// สีก่อนลด
    pub colors: usize,
    /// ซับอยู่เกินสองที่ รวมกรอบแล้ว
    pub merged: bool,
    /// สีของจุดที่ใช้เลขสีนั้นต่างจากสีในจานได้มากสุดเท่าไหร่ (แบบคูณความโปร่งใส 0 ถึง 255) · ใช้ตัดสินว่าภาพถัดไปเปลี่ยนแค่จานสีได้ไหม (BUGS ข้อ 126)
    pub spread: Vec<u8>,
}

/// ความต่างของสองสีแบบคูณความโปร่งใส ค่ามากสุดของสี่ช่อง
fn pm_diff(c: [u8; 4], p: [u8; 4]) -> u8 {
    let pm = |v: u8, a: u8| v as i32 * a as i32 / 255;
    [(pm(c[0], c[3]) - pm(p[0], p[3])).abs(), (pm(c[1], c[3]) - pm(p[1], p[3])).abs(), (pm(c[2], c[3]) - pm(p[2], p[3])).abs(), (c[3] as i32 - p[3] as i32).abs()]
        .into_iter().max().unwrap_or(0).min(255) as u8
}

/// แถวต่อแถวที่มีซับ แบ่งเป็นช่วงแถว · ช่วงเกิน max รวมคู่ที่ห่างกันน้อยที่สุดจนเหลือ max (มาตรฐาน Blu-ray ไม่เกินสอง)
fn row_groups(used: &[bool], max: usize) -> (Vec<(usize, usize)>, bool) {
    let max = max.clamp(1, 2);
    let mut g: Vec<(usize, usize)> = vec![];
    let mut y = 0;
    while y < used.len() {
        if used[y] {
            let s = y;
            while y < used.len() && used[y] { y += 1; }
            g.push((s, y - 1));
        } else { y += 1; }
    }
    let merged = g.len() > max;
    while g.len() > max {
        let k = (0..g.len() - 1).min_by_key(|&i| g[i + 1].0 - g[i].1).unwrap();
        g[k].1 = g[k + 1].1;
        g.remove(k + 1);
    }
    (g, merged)
}

/// สีของจุดแบบไม่คูณความโปร่งใส · ตัวกรอง subtitles ของ ffmpeg ผสมซับลงพื้นดำโปร่งใส สีที่ได้คูณความโปร่งใสมาแล้ว
/// (พิสูจน์แล้ว ขอบตัวอักษรขาวทึบ 76 ได้สี 70) แต่จานสีของ PGS ใช้สีแบบไม่คูณ ไม่หารกลับแล้วขอบตัวอักษรมืดกว่าตอนเล่น
pub fn straight(p: &[u8]) -> u32 {
    let a = p[3] as u32;
    if a == 0 || a == 255 { return u32::from_le_bytes([p[0], p[1], p[2], p[3]]); }
    let f = |c: u8| ((c as u32 * 255 + a / 2) / a).min(255) as u8;
    u32::from_le_bytes([f(p[0]), f(p[1]), f(p[2]), p[3]])
}

/// ค่าที่ใช้ทำภาพของตัวในโปรแกรม จาก PgsOpts
#[derive(Clone, Copy, Debug)]
pub struct Enc {
    /// สีต่อภาพไม่เกิน
    pub k: usize,
    pub dither: bool,
    /// เพิ่มความสด 0.0 ถึง 1.0
    pub vivid: f64,
    pub windows: usize,
}
impl Default for Enc {
    fn default() -> Self { Self { k: 255, dither: false, vivid: 0.0, windows: 2 } }
}
impl Enc {
    pub fn of(o: &PgsOpts) -> Self {
        Self { k: (o.colors as usize).clamp(2, 255), dither: o.dither, vivid: o.vivid.min(100) as f64 / 100.0, windows: (o.windows as usize).clamp(1, 2) }
    }
}

/// เพิ่มความสด ดันสีออกจากเทาที่ความสว่างเดิม (BT.709) · สีเทาขาวดำเหมือนเดิม
pub fn vivid(c: u32, s: f64) -> u32 {
    let [r, g, b, a] = c.to_le_bytes();
    let y = 0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64;
    let f = |v: u8| (y + (v as f64 - y) * (1.0 + s)).round().clamp(0.0, 255.0) as u8;
    u32::from_le_bytes([f(r), f(g), f(b), a])
}

/// สีในจานสีที่ใกล้ที่สุด · เทียบแบบคูณความโปร่งใส สีของจุดที่เกือบใสจึงไม่มีน้ำหนักเกินจริง · คืนเลขสีเริ่มที่ 1
fn nearest(pal: &[[u8; 4]], c: [f64; 4]) -> u8 {
    let pm = |p: &[u8; 4]| { let a = p[3] as f64 / 255.0; [p[0] as f64 * a, p[1] as f64 * a, p[2] as f64 * a, p[3] as f64] };
    let ca = c[3] / 255.0;
    let q = [c[0] * ca, c[1] * ca, c[2] * ca, c[3]];
    let mut best = (f64::MAX, 0usize);
    for (i, p) in pal.iter().enumerate() {
        let v = pm(p);
        let d = (v[0] - q[0]).powi(2) + (v[1] - q[1]).powi(2) + (v[2] - q[2]).powi(2) + (v[3] - q[3]).powi(2) * 2.0;
        if d < best.0 { best = (d, i); }
    }
    (best.1 + 1) as u8
}

/// ภาพ RGBA เต็มจอ เป็นภาพของ PGS · ไม่มีซับเลยได้ None
/// สีเกินจำนวนที่ตั้ง ลดด้วย median cut แล้วให้ทุกจุดใช้สีในจานที่ใกล้ที่สุด (เดิมใช้สีของกล่องที่สีนั้นตกอยู่ ซึ่งไม่ใช่สีที่ใกล้ที่สุดเสมอ)
pub fn image_of(rgba: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Image> {
    let a = |x: usize, y: usize| rgba[(y * w + x) * 4 + 3];
    let used: Vec<bool> = (0..h).map(|y| (0..w).any(|x| a(x, y) > 0)).collect();
    let (groups, merged) = row_groups(&used, enc.windows);
    if groups.is_empty() { return None; }
    // กรอบของแต่ละกลุ่ม กว้างสูงอย่างน้อย 8 จุดตามมาตรฐาน ขยายไม่เกินขอบภาพ และไม่ทับกรอบอื่น
    let mut boxes: Vec<(usize, usize, usize, usize)> = groups.iter().map(|&(y0, y1)| {
        let (mut x0, mut x1) = (w, 0);
        for y in y0..=y1 { for x in 0..w { if a(x, y) > 0 { x0 = x0.min(x); x1 = x1.max(x); } } }
        (x0, y0, x1, y1)
    }).collect();
    for b in boxes.iter_mut() {
        while b.2 + 1 - b.0 < 8 { if b.2 + 1 < w { b.2 += 1; } else if b.0 > 0 { b.0 -= 1; } else { break; } }
    }
    for i in 0..boxes.len() {
        let lo = if i > 0 { boxes[i - 1].3 + 1 } else { 0 };
        let hi = if i + 1 < boxes.len() { boxes[i + 1].1 - 1 } else { h - 1 };
        let b = &mut boxes[i];
        while b.3 + 1 - b.1 < 8 { if b.3 < hi { b.3 += 1; } else if b.1 > lo { b.1 -= 1; } else { break; } }
    }
    // สีแบบไม่คูณความโปร่งใส ปรับความสดแล้ว · จุดที่โปร่งใสทั้งหมดเป็นสีที่ 0
    let col = |i: usize| -> u32 { let c = straight(&rgba[i..i + 4]); if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c } };
    let mut hist: HashMap<u32, u32> = HashMap::new();
    for &(x0, y0, x1, y1) in &boxes {
        for y in y0..=y1 { for x in x0..=x1 {
            let i = (y * w + x) * 4;
            if rgba[i + 3] == 0 { continue; }
            *hist.entry(col(i)).or_insert(0) += 1;
        } }
    }
    let colors = hist.len();
    let k = enc.k.clamp(2, 255);
    let reduced = colors > k;
    let (pal, map) = reduce(hist, k);
    let mut near: HashMap<u32, u8> = HashMap::new();
    let objs: Vec<Obj> = boxes.iter().map(|&(x0, y0, x1, y1)| {
        let (bw, bh) = (x1 + 1 - x0, y1 + 1 - y0);
        let mut px = vec![0u8; bw * bh];
        if reduced && enc.dither {
            // กระจายส่วนต่างของสีไปจุดข้าง ๆ (Floyd–Steinberg) เฉพาะจุดที่มีซับ จุดโปร่งใสรอบตัวอักษรไม่โดนจุดสีกระเด็นใส่
            let mut err = vec![[0f64; 4]; bw * bh];
            for y in 0..bh { for x in 0..bw {
                let i = ((y0 + y) * w + x0 + x) * 4;
                if rgba[i + 3] == 0 { continue; }
                let c = col(i).to_le_bytes();
                let e = err[y * bw + x];
                let want = [0, 1, 2, 3].map(|n| (c[n] as f64 + e[n]).clamp(0.0, 255.0));
                let k = nearest(&pal, want);
                px[y * bw + x] = k;
                let got = pal[k as usize - 1];
                let d = [0, 1, 2, 3].map(|n| want[n] - got[n] as f64);
                let mut push = |xx: isize, yy: usize, f: f64| {
                    if xx < 0 || xx as usize >= bw || yy >= bh { return; }
                    let j = (y0 + yy) * w + x0 + xx as usize;
                    if rgba[j * 4 + 3] == 0 { return; }
                    let t = &mut err[yy * bw + xx as usize];
                    for n in 0..4 { t[n] += d[n] * f; }
                };
                push(x as isize + 1, y, 7.0 / 16.0);
                push(x as isize - 1, y + 1, 3.0 / 16.0);
                push(x as isize, y + 1, 5.0 / 16.0);
                push(x as isize + 1, y + 1, 1.0 / 16.0);
            } }
        } else {
            for y in 0..bh { for x in 0..bw {
                let i = ((y0 + y) * w + x0 + x) * 4;
                if rgba[i + 3] == 0 { continue; }
                let c = col(i);
                px[y * bw + x] = if reduced {
                    *near.entry(c).or_insert_with(|| { let b = c.to_le_bytes(); nearest(&pal, [b[0] as f64, b[1] as f64, b[2] as f64, b[3] as f64]) })
                } else { map[&c] };
            } }
        }
        Obj { x: x0 as u16, y: y0 as u16, w: bw as u16, h: bh as u16, px }
    }).collect();
    let mut palette = vec![[0u8, 0, 0, 0]];
    palette.extend(pal);
    let mut spread = vec![0u8; palette.len()];
    for o in &objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let d = pm_diff(col(i).to_le_bytes(), palette[k]);
            if d > spread[k] { spread[k] = d; }
        } }
    }
    Some(Image { palette, objs, colors, merged, spread })
}

/// ภาพใหม่ที่ทุกจุดยังใช้เลขสีเดิมของภาพที่ขึ้นอยู่ได้ เช่นภาพเฟดหรือสีเปลี่ยนทั้งก้อน คืนจานสีใหม่ ไม่ต้องส่งภาพซ้ำ (BUGS ข้อ 126)
/// เขียนเองตามมาตรฐาน PGS ชุดเปลี่ยนจานสี (palette update) ไม่ได้แปลโค้ดของ SUPer
/// ได้ None เมื่อ มีจุดโผล่นอกกรอบเดิม · จุดที่เคยใสกลับมีสี · สีในเลขเดียวกันต่างกันเกินกว่าที่ภาพเดิมต่างอยู่แล้ว · ภาพใสทั้งภาพ
pub fn palette_update(prev: &Image, rgba: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Vec<[u8; 4]>> {
    if prev.objs.is_empty() || rgba.len() < w * h * 4 { return None; }
    let col = |i: usize| -> [u8; 4] { let c = straight(&rgba[i..i + 4]); (if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c }).to_le_bytes() };
    // จุดนอกกรอบเดิมต้องใสทั้งหมด
    let inside = |x: usize, y: usize| prev.objs.iter().any(|o| x >= o.x as usize && x < (o.x + o.w) as usize && y >= o.y as usize && y < (o.y + o.h) as usize);
    let mut any = false;
    for y in 0..h {
        let row_in = prev.objs.iter().any(|o| y >= o.y as usize && y < (o.y + o.h) as usize);
        for x in 0..w {
            if rgba[(y * w + x) * 4 + 3] == 0 { continue; }
            any = true;
            if !row_in || !inside(x, y) { return None; }
        }
    }
    if !any { return None; }
    // รอบแรก ค่าเฉลี่ยแบบคูณความโปร่งใสของแต่ละเลขสี
    let n = prev.palette.len();
    let mut sum = vec![[0f64; 4]; n];
    let mut cnt = vec![0u32; n];
    for o in &prev.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if k == 0 { if rgba[i + 3] != 0 { return None; } continue; }
            let c = col(i);
            let a = c[3] as f64;
            for ch in 0..3 { sum[k][ch] += c[ch] as f64 * a / 255.0; }
            sum[k][3] += a;
            cnt[k] += 1;
        } }
    }
    let mut pal = prev.palette.clone();
    for k in 1..n {
        if cnt[k] == 0 { continue; }
        let a = sum[k][3] / cnt[k] as f64;
        pal[k] = if a < 0.5 { [0, 0, 0, 0] } else {
            let f = |ch: usize| ((sum[k][ch] / cnt[k] as f64) * 255.0 / a).round().clamp(0.0, 255.0) as u8;
            [f(0), f(1), f(2), a.round().clamp(0.0, 255.0) as u8]
        };
    }
    // รอบสอง ทุกจุดต้องใกล้สีใหม่ของเลขตัวเอง ไม่เกินที่ภาพเดิมต่างอยู่แล้วบวกเผื่อ 6
    for o in &prev.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let lim = prev.spread.get(k).copied().unwrap_or(0) as u16 + 6;
            if pm_diff(col(i), pal[k]) as u16 > lim { return None; }
        } }
    }
    Some(pal)
}

/// ลดสีเหลือไม่เกิน k สีด้วย median cut (ถ่วงตามจำนวนจุด) · คืนสีที่ใช้กับเลขสีของทุกสีเดิม (เริ่มที่ 1)
pub fn reduce(hist: HashMap<u32, u32>, k: usize) -> (Vec<[u8; 4]>, HashMap<u32, u8>) {
    let all: Vec<([u8; 4], u32, u32)> = hist.into_iter().map(|(c, n)| (c.to_le_bytes(), n, c)).collect();
    if all.len() <= k {
        let pal = all.iter().map(|x| x.0).collect();
        let map = all.iter().enumerate().map(|(i, x)| (x.2, (i + 1) as u8)).collect();
        return (pal, map);
    }
    let mut boxes: Vec<Vec<([u8; 4], u32, u32)>> = vec![all];
    while boxes.len() < k {
        // กล่องที่ช่วงสีกว้างที่สุด แบ่งตามสีช่องนั้นที่จุดกึ่งกลางของจำนวนจุด
        let pick = boxes.iter().enumerate().filter(|(_, b)| b.len() > 1).map(|(i, b)| {
            let (ch, range) = (0..4).map(|c| { let lo = b.iter().map(|x| x.0[c]).min().unwrap(); let hi = b.iter().map(|x| x.0[c]).max().unwrap(); (c, hi - lo) }).max_by_key(|x| x.1).unwrap();
            (i, ch, range)
        }).max_by_key(|x| x.2);
        let Some((i, ch, _)) = pick else { break };
        let mut b = boxes.swap_remove(i);
        b.sort_by_key(|x| x.0[ch]);
        let total: u64 = b.iter().map(|x| x.1 as u64).sum();
        let mut acc = 0u64;
        let mut cut = 1;
        for (j, x) in b.iter().enumerate() {
            acc += x.1 as u64;
            if acc * 2 >= total { cut = (j + 1).clamp(1, b.len() - 1); break; }
        }
        let rest = b.split_off(cut);
        boxes.push(b);
        boxes.push(rest);
    }
    let mut pal = vec![];
    let mut map = HashMap::new();
    for (i, b) in boxes.iter().enumerate() {
        let n: u64 = b.iter().map(|x| x.1 as u64).sum::<u64>().max(1);
        let mut s = [0u64; 4];
        for x in b { for c in 0..4 { s[c] += x.0[c] as u64 * x.1 as u64; } }
        pal.push([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8, (s[3] / n) as u8]);
        for x in b { map.insert(x.2, (i + 1) as u8); }
    }
    (pal, map)
}

/// median cut แบบเดียวกับ reduce แต่แบ่งตามแปดช่อง (สีตอนทึบสี่ช่องกับสีตอนกลางเฟดสี่ช่อง) · คืนกลุ่มไม่เกิน k กลุ่ม
fn cut8(all: Vec<([u8; 8], u32, u64)>, k: usize) -> Vec<Vec<([u8; 8], u32, u64)>> {
    if all.len() <= k { return all.into_iter().map(|x| vec![x]).collect(); }
    let mut boxes = vec![all];
    while boxes.len() < k {
        let pick = boxes.iter().enumerate().filter(|(_, b)| b.len() > 1).map(|(i, b)| {
            let (ch, range) = (0..8).map(|c| { let lo = b.iter().map(|x| x.0[c]).min().unwrap(); let hi = b.iter().map(|x| x.0[c]).max().unwrap(); (c, hi - lo) }).max_by_key(|x| x.1).unwrap();
            (i, ch, range)
        }).max_by_key(|x| x.2);
        let Some((i, ch, _)) = pick else { break };
        let mut b = boxes.swap_remove(i);
        b.sort_by_key(|x| x.0[ch]);
        let total: u64 = b.iter().map(|x| x.1 as u64).sum();
        let mut acc = 0u64;
        let mut cut = 1;
        for (j, x) in b.iter().enumerate() {
            acc += x.1 as u64;
            if acc * 2 >= total { cut = (j + 1).clamp(1, b.len() - 1); break; }
        }
        let rest = b.split_off(cut);
        boxes.push(b);
        boxes.push(rest);
    }
    boxes
}

/// ภาพฐานของบรรทัดที่เฟด แยกเลขสีตามสีตอนทึบ (base) คู่กับสีตอนกลางเฟด (probe) (BUGS ข้อ 126)
/// ตัวหนังสือทับเงาครึ่งทึบ ตอนทึบสีเดียวกับตัวหนังสือที่ไม่ทับเงา แต่ตอนเฟดจางไม่เท่ากัน (ความทึบของสองชั้นที่ซ้อนกันไม่ลดตามสัดส่วน)
/// ถ้าใช้เลขเดียวกัน เฟรมเฟดต้องส่งภาพเต็มใหม่ · แยกเลขตามคู่สีแล้ว ทุกเฟรมของการเฟดเปลี่ยนแค่จานสีได้ เพราะความทึบของจุดในกลุ่มเดียวกันขึ้นกับค่าเฟดแบบเดียวกัน
/// ภาพกลางเฟดมีจุดนอกกรอบของภาพทึบ (ภาพคนละแบบ) ได้ None
pub fn image_of_pair(base: &[u8], probe: &[u8], w: usize, h: usize, enc: &Enc) -> Option<Image> {
    let geo = image_of(base, w, h, enc)?;
    if probe.len() < w * h * 4 { return None; }
    let inside = |x: usize, y: usize| geo.objs.iter().any(|o| x >= o.x as usize && x < (o.x + o.w) as usize && y >= o.y as usize && y < (o.y + o.h) as usize);
    for y in 0..h { for x in 0..w { if probe[(y * w + x) * 4 + 3] > 0 && !inside(x, y) { return None; } } }
    let col = |buf: &[u8], i: usize| -> u32 { let c = straight(&buf[i..i + 4]); if enc.vivid > 0.0 { vivid(c, enc.vivid) } else { c } };
    let key = |i: usize| ((col(base, i) as u64) << 32) | col(probe, i) as u64;
    let mut hist: HashMap<u64, u32> = HashMap::new();
    for o in &geo.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if base[i + 3] == 0 { continue; }
            *hist.entry(key(i)).or_insert(0) += 1;
        } }
    }
    let items: Vec<([u8; 8], u32, u64)> = hist.into_iter().map(|(kk, n)| {
        let (a, b) = (((kk >> 32) as u32).to_le_bytes(), (kk as u32).to_le_bytes());
        ([a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]], n, kk)
    }).collect();
    let groups = cut8(items, enc.k.clamp(2, 255));
    let mut palette = vec![[0u8, 0, 0, 0]];
    // สีเฉลี่ยของกลุ่มตอนกลางเฟด ใช้วัดว่าสีในกลุ่มต่างกันได้แค่ไหนตอนเฟด
    let mut probe_pal = vec![[0u8, 0, 0, 0]];
    let mut map: HashMap<u64, u8> = HashMap::new();
    for (gi, g) in groups.iter().enumerate() {
        let n: u64 = g.iter().map(|x| x.1 as u64).sum::<u64>().max(1);
        let mut s = [0u64; 8];
        for x in g { for c in 0..8 { s[c] += x.0[c] as u64 * x.1 as u64; } }
        palette.push([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8, (s[3] / n) as u8]);
        probe_pal.push([(s[4] / n) as u8, (s[5] / n) as u8, (s[6] / n) as u8, (s[7] / n) as u8]);
        for x in g { map.insert(x.2, (gi + 1) as u8); }
    }
    let objs: Vec<Obj> = geo.objs.iter().map(|o| {
        let mut px = vec![0u8; o.w as usize * o.h as usize];
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            if base[i + 3] == 0 { continue; }
            px[yy * o.w as usize + xx] = map[&key(i)];
        } }
        Obj { px, ..o.clone() }
    }).collect();
    let mut spread = vec![0u8; palette.len()];
    for o in &objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            if k == 0 { continue; }
            let i = ((o.y as usize + yy) * w + o.x as usize + xx) * 4;
            let d = pm_diff(col(base, i).to_le_bytes(), palette[k]).max(pm_diff(col(probe, i).to_le_bytes(), probe_pal[k]));
            if d > spread[k] { spread[k] = d; }
        } }
    }
    Some(Image { palette, objs, colors: geo.colors, merged: geo.merged, spread })
}

// ---------------------------------------------------------------- เขียนส่วนของ PGS

/// รหัสอัตราเฟรมใน PCS · 23.976 24 25 29.97 50 59.94
pub fn fps_code(num: u32, den: u32) -> u8 {
    let f = num as f64 / den.max(1) as f64;
    [(23.976, 0x10), (24.0, 0x20), (25.0, 0x30), (29.97, 0x40), (50.0, 0x60), (59.94, 0x70)].iter()
        .min_by(|a, b| (a.0 - f).abs().partial_cmp(&(b.0 - f).abs()).unwrap()).map(|x| x.1).unwrap_or(0x10)
}

/// สี RGB เป็น Y Cr Cb ช่วงสีแบบทีวี (16 ถึง 235)
pub fn ycrcb(r: u8, g: u8, b: u8, bt709: bool) -> (u8, u8, u8) {
    let (kr, kb) = if bt709 { (0.2126, 0.0722) } else { (0.299, 0.114) };
    let (r, g, b) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let y = kr * r + (1.0 - kr - kb) * g + kb * b;
    let cb = (b - y) / (2.0 * (1.0 - kb));
    let cr = (r - y) / (2.0 * (1.0 - kr));
    let q = |v: f64| v.round().clamp(0.0, 255.0) as u8;
    (q(16.0 + 219.0 * y), q(128.0 + 224.0 * cr), q(128.0 + 224.0 * cb))
}

/// Y Cr Cb ช่วงทีวีกลับเป็น RGB แบบที่ตัวเล่นถอดจานสีของ PGS
pub fn rgb_of(y: u8, cr: u8, cb: u8, bt709: bool) -> [u8; 3] {
    let (kr, kb) = if bt709 { (0.2126, 0.0722) } else { (0.299, 0.114) };
    let yf = (y as f64 - 16.0) / 219.0;
    let (crf, cbf) = ((cr as f64 - 128.0) / 224.0, (cb as f64 - 128.0) / 224.0);
    let r = yf + 2.0 * (1.0 - kr) * crf;
    let b = yf + 2.0 * (1.0 - kb) * cbf;
    let g = (yf - kr * r - kb * b) / (1.0 - kr - kb);
    let q = |v: f64| (v * 255.0).round().clamp(0.0, 255.0) as u8;
    [q(r), q(g), q(b)]
}

/// สีที่ตัวเล่นแสดงจริงเมื่อซับบอกว่าเป็น TV.601 แต่ภาพเป็น BT.709 (mpv ทำแบบ VSFilter) · แปลงเป็น YCbCr ด้วย BT.601 แล้วถอดด้วย BT.709
pub fn mangle601(c: [u8; 3]) -> [u8; 3] {
    let (y, cr, cb) = ycrcb(c[0], c[1], c[2], false);
    rgb_of(y, cr, cb, true)
}

/// ซับบอกตารางสีเป็น TV.601 ไหม · ไม่มีบรรทัด YCbCr Matrix นับเป็น TV.601 แบบ libass กับ mpv (ค่าเดิมของ VSFilter)
/// PlayResY ของซับ ASS · ไม่มีใช้ 288 แบบ libass
pub fn script_play_res_y(doc: &SubDoc) -> f64 {
    use crate::subtitle::subdoc::Item;
    doc.skeleton.iter().find_map(|it| match it {
        Item::Line { t, .. } => t.trim_start_matches('\u{FEFF}').trim().to_ascii_lowercase().strip_prefix("playresy:").and_then(|v| v.trim().parse::<f64>().ok()),
        _ => None,
    }).filter(|&v| v > 0.0).unwrap_or(288.0)
}

/// ระยะแนวตั้งที่ข้อความของ \move(x1,y1,x2,y2…) วิ่ง หน่วยของสคริปต์ ค่าบวกคือวิ่งลง (BUGS ข้อ 126)
pub fn move_dy(text: &str) -> Option<f64> {
    let t = tags_of(text);
    let i = t.find("\\move(")?;
    let rest = &t[i + 6..];
    let a: Vec<f64> = rest[..rest.find(')')?].split(',').filter_map(|s| s.trim().parse().ok()).collect();
    (a.len() >= 4).then(|| a[3] - a[1])
}

pub fn script_tv601(doc: &SubDoc) -> bool {
    use crate::subtitle::subdoc::Item;
    let v = doc.skeleton.iter().find_map(|it| match it {
        Item::Line { t, .. } => { let s = t.trim_start_matches('\u{FEFF}').trim(); s.to_ascii_lowercase().strip_prefix("ycbcr matrix:").map(|v| v.trim().to_string()) }
        _ => None,
    });
    v.is_none_or(|v| v == "tv.601")
}

/// ตั้งบรรทัด YCbCr Matrix เป็น None ให้ libass วาดสีตรงตามสไตล์ · ไม่มีบรรทัดนี้ใส่ต่อจาก [Script Info]
/// ตัวกรอง subtitles ของ ffmpeg วาดซับ TV.601 TV.709 หรือไม่มีบรรทัดนี้ลงภาพ RGB แล้วบีบสีเหลือช่วง 16 ถึง 235 สีจึงหม่น
/// (วัดแล้ว 14 พ.ย. 2569 สีเหลือง 255,215,0 ได้ 235,201,16 เท่าสูตร 16 + สี × 219 ÷ 255 · ตั้ง None หรือ PC.709 ได้ 255,215,0)
pub fn set_matrix_none(doc: &mut SubDoc) {
    use crate::subtitle::subdoc::Item;
    let eol = doc.eol.clone();
    let mut found = false;
    for it in doc.skeleton.iter_mut() {
        if let Item::Line { t, .. } = it {
            if t.trim_start_matches('\u{FEFF}').trim().to_ascii_lowercase().starts_with("ycbcr matrix:") { *t = "YCbCr Matrix: None".into(); found = true; }
        }
    }
    if found { return; }
    let at = doc.skeleton.iter().position(|it| matches!(it, Item::Line { t, .. } if t.trim_start_matches('\u{FEFF}').trim().eq_ignore_ascii_case("[script info]")));
    match at {
        Some(i) => doc.skeleton.insert(i + 1, Item::Line { t: "YCbCr Matrix: None".into(), e: eol }),
        None => {
            doc.skeleton.insert(0, Item::Line { t: "[Script Info]".into(), e: eol.clone() });
            doc.skeleton.insert(1, Item::Line { t: "YCbCr Matrix: None".into(), e: eol });
        }
    }
}

/// #RRGGBB กับความโปร่งใส (0 ทึบ 255 ใส) เป็นสีแบบ ASS &HAABBGGRR · อ่านไม่ออกได้ขาว
fn ass_col(hex: &str, alpha: u8) -> String {
    let h = hex.trim().trim_start_matches('#');
    let v = if h.len() == 6 { u32::from_str_radix(h, 16).unwrap_or(0xFFFFFF) } else { 0xFFFFFF };
    let (r, g, b) = ((v >> 16) & 255, (v >> 8) & 255, v & 255);
    format!("&H{alpha:02X}{b:02X}{g:02X}{r:02X}")
}

/// สไตล์ Default ของซับ SRT ตามที่ตั้งในหน้าต่างส่งออก · ช่องเรียงตาม Format ของ [V4+ Styles] ใน subdoc.rs (23 ช่อง)
pub fn srt_style(st: &SrtStyle) -> crate::subtitle::subdoc::Style {
    let n = |v: f64, lo: f64, hi: f64| { let v = if v.is_finite() { v.clamp(lo, hi) } else { lo }; let s = format!("{v:.2}"); s.trim_end_matches('0').trim_end_matches('.').to_string() };
    let font = { let f = st.font.replace(',', " "); if f.trim().is_empty() { "Tahoma".to_string() } else { f.trim().to_string() } };
    let shadow_a = (255.0 * (1.0 - st.shadow_opacity.min(100) as f64 / 100.0)).round() as u8;
    let b = |on: bool| if on { "-1" } else { "0" }.to_string();
    let fields = vec![
        "Default".into(), font, n(st.size, 8.0, 300.0), ass_col(&st.color, 0), "&H000000FF".into(), ass_col(&st.outline_color, 0), ass_col(&st.shadow_color, shadow_a),
        b(st.bold), b(st.italic), "0".into(), "0".into(), "100".into(), "100".into(), "0".into(), "0".into(), "1".into(),
        n(st.outline, 0.0, 20.0), n(st.shadow, 0.0, 20.0), st.align.clamp(1, 9).to_string(), n(st.margin_h, 0.0, 900.0), n(st.margin_h, 0.0, 900.0), n(st.margin_v, 0.0, 500.0), "1".into(),
    ];
    crate::subtitle::subdoc::Style { id: 1, fields, ..Default::default() }
}

/// เอกสารที่ส่งให้ libass วาด กับข้อมูลสีของซับ
pub struct Prepared {
    pub doc: SubDoc,
    /// ซับบอก TV.601 (หรือไม่บอก) ใช้คิดสีแบบตัวเล่นเมื่อภาพเป็น BT.709
    pub tv601: bool,
}

/// ASS SSA ตั้ง YCbCr Matrix เป็น None · SRT VTT แปลงเป็น ASS ภาพสูง 1080 ตามสัดส่วนภาพ ใช้สไตล์ที่ตั้งไว้ (ไม่ส่งมาใช้ค่าตั้งต้น)
pub fn prepare(doc: &SubDoc, req: &PgsReq) -> Prepared {
    if doc.kind == "ass" || doc.kind == "ssa" {
        let tv601 = script_tv601(doc);
        let mut d = doc.clone();
        set_matrix_none(&mut d);
        return Prepared { doc: d, tv601 };
    }
    let (w, h) = (req.w.max(16) as f64, req.h.max(16) as f64);
    let mut d = crate::subtitle::subdoc::to_ass(doc, (((1080.0 * w / h).round() as u32).max(16), 1080));
    set_matrix_none(&mut d);
    d.styles = vec![srt_style(&req.style.clone().unwrap_or_default())];
    Prepared { doc: d, tv601: false }
}

/// ตารางสีของจานสี PGS กับตารางที่ใช้แปลงสีของซับ · (ตัวเล่นถอดด้วยแบบไหน, เข้ารหัสด้วยแบบไหน) จริงคือ BT.709
pub fn matrices(opts: &PgsOpts, h: u32, tv601: bool) -> (bool, bool) {
    let out709 = match opts.matrix.as_str() { "709" => true, "601" => false, _ => h > 576 };
    let coef709 = if opts.vsfilter && tv601 && out709 { false } else { out709 };
    (out709, coef709)
}

/// ภาพเลขสีแบบ RLE ของ PGS ทีละแถว จบแถวด้วย 00 00 · สีที่ 0 เขียนแบบนับจำนวนเสมอ
pub fn rle(px: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut o = Vec::with_capacity(px.len() / 4 + h * 2);
    for y in 0..h {
        let row = &px[y * w..(y + 1) * w];
        let mut i = 0;
        while i < w {
            let c = row[i];
            let mut n = 1;
            while i + n < w && row[i + n] == c && n < 16383 { n += 1; }
            if c == 0 {
                if n < 64 { o.extend([0, n as u8]); } else { o.extend([0, 0x40 | (n >> 8) as u8, (n & 0xff) as u8]); }
            } else if n < 3 {
                for _ in 0..n { o.push(c); }
            } else if n < 64 {
                o.extend([0, 0x80 | n as u8, c]);
            } else {
                o.extend([0, 0xC0 | (n >> 8) as u8, (n & 0xff) as u8, c]);
            }
            i += n;
        }
        o.extend([0, 0]);
    }
    o
}

/// หนึ่งส่วน (segment) พร้อมเวลาแสดง (PTS) กับเวลาเริ่มถอด (DTS) หน่วย 90 kHz
fn seg_d(o: &mut Vec<u8>, pts: u32, dts: u32, kind: u8, data: &[u8]) {
    o.extend(b"PG");
    o.extend(pts.to_be_bytes());
    o.extend(dts.min(pts).to_be_bytes());
    o.push(kind);
    o.extend((data.len() as u16).to_be_bytes());
    o.extend(data);
}
fn be16(v: &mut Vec<u8>, x: u16) { v.extend(x.to_be_bytes()); }

/// สถานะของชุดตามมาตรฐาน PGS · เริ่ม epoch ใหม่ (ล้างจอและความจำของตัวถอด) · จุดเริ่มอ่าน (ส่งข้อมูลครบแต่ใช้กรอบเดิม ไม่ล้างจอ) · ปกติ
pub const EPOCH_START: u8 = 0x80;
pub const ACQUISITION: u8 = 0x40;
pub const NORMAL: u8 = 0x00;

/// หัวของหนึ่งชุด
#[derive(Clone, Copy, Debug)]
pub struct Head { pub pts: u32, pub dts: u32, pub comp: u16, pub w: u16, pub h: u16, pub fps: u8, pub state: u8 }

/// ความเร็วของตัวถอดตามแบบจำลองของเครื่องเล่น Blu-ray · ถอดภาพ 16 ล้านไบต์ต่อวินาที (Rd 128 Mbps) · วาดลงจอและล้างจอ 32 ล้านไบต์ต่อวินาที (Rc 256 Mbps)
const RD: u64 = 16_000_000;
const RC: u64 = 32_000_000;
fn ticks(bytes: u64, rate: u64) -> u32 { (bytes * 90_000).div_ceil(rate).min(u32::MAX as u64) as u32 }

/// เวลาที่ตัวถอดต้องใช้ก่อนแสดงชุดนี้ได้ (หน่วย 90 kHz) · ล้างจอทั้งจอตอนเริ่ม epoch · ถอดทุกภาพที่ส่งมา · วาดทุกกรอบ
pub fn decode_ticks(state: u8, w: u16, h: u16, objs: &[(u16, u16)], wins: &[(u16, u16, u16, u16)]) -> u32 {
    let init = if state == EPOCH_START { ticks(w as u64 * h as u64, RC) } else { 0 };
    let dec: u32 = objs.iter().map(|&(ow, oh)| ticks(ow as u64 * oh as u64, RD)).sum();
    let draw: u32 = wins.iter().map(|&(_, _, ww, hh)| ticks(ww as u64 * hh as u64, RC)).sum();
    init + dec + draw
}

fn pcs_bytes(hd: &Head, pal_update: bool, comp_objs: &[(u16, u8, u16, u16)]) -> Vec<u8> {
    let mut pcs = vec![];
    be16(&mut pcs, hd.w); be16(&mut pcs, hd.h); pcs.push(hd.fps); be16(&mut pcs, hd.comp);
    pcs.extend([hd.state, if pal_update { 0x80 } else { 0x00 }, 0x00, comp_objs.len() as u8]);
    for &(id, win, x, y) in comp_objs { be16(&mut pcs, id); pcs.push(win); pcs.push(0); be16(&mut pcs, x); be16(&mut pcs, y); }
    pcs
}
fn wds_bytes(wins: &[(u16, u16, u16, u16)]) -> Vec<u8> {
    let mut wds = vec![wins.len() as u8];
    for (i, (x, y, ww, hh)) in wins.iter().enumerate() { wds.push(i as u8); be16(&mut wds, *x); be16(&mut wds, *y); be16(&mut wds, *ww); be16(&mut wds, *hh); }
    wds
}
fn pds_bytes(palette: &[[u8; 4]], ver: u8, bt709: bool) -> Vec<u8> {
    let mut pds = vec![0u8, ver];
    for (i, c) in palette.iter().enumerate() {
        let (y, cr, cb) = if c[3] == 0 { (16, 128, 128) } else { ycrcb(c[0], c[1], c[2], bt709) };
        pds.extend([i as u8, y, cr, cb, c[3]]);
    }
    pds
}

/// กรอบที่ภาพอยู่ข้างใน (เลขกรอบ) · ภาพต้องอยู่ในกรอบทั้งภาพ
fn win_of(o: &Obj, wins: &[(u16, u16, u16, u16)]) -> Option<u8> {
    wins.iter().position(|&(x, y, ww, hh)| o.x >= x && o.y >= y && o.x + o.w <= x + ww && o.y + o.h <= y + hh).map(|i| i as u8)
}
/// ทุกภาพอยู่ในกรอบชุดเดิมได้ คนละกรอบกัน
pub fn fits(img: &Image, wins: &[(u16, u16, u16, u16)]) -> bool {
    let mut used = vec![false; wins.len()];
    for o in &img.objs {
        match win_of(o, wins) { Some(k) if !used[k as usize] => used[k as usize] = true, _ => return false }
    }
    true
}
/// กรอบของ epoch ใหม่ กว้างเต็มจอตามแนวนอน และเผื่อบนล่างอย่างละหนึ่งในแปดของความสูงภาพ (อย่างน้อย 8 จุด)
/// ภาพเคลื่อน ภาพที่โตขึ้นนิดหน่อย หรือบรรทัดถัดไปที่ยาวไม่เท่ากัน ยังอยู่ในกรอบเดิมได้ ไม่ต้องล้างจอใหม่
/// (เจอ 15 พ.ย. 2569 คาราโอเกะที่ตัวอักษรตกลงมาจากขอบบน ภาพสูงขึ้นทีละจุดทุกเฟรม กรอบพอดีภาพต้องเริ่ม epoch ใหม่ทุกเฟรม เครื่องเล่น Blu-ray ถอดไม่ทัน 5 ชุด)
/// moving คือเริ่ม epoch ใหม่กลางภาพเคลื่อนไหว (ภาพก่อนหน้ายังขึ้นอยู่) เผื่อครึ่งหนึ่งของความสูงภาพ (อย่างน้อย 32 จุด) ภาพที่โตต่อจะใช้กรอบนี้ได้อีกหลายเฟรม
/// สองกรอบไม่ทับกัน เส้นแบ่งอยู่กึ่งกลางระหว่างสองภาพ
/// travel คือระยะที่ข้อความของบรรทัด \move ที่ขึ้นอยู่จะวิ่งขึ้นและวิ่งลง (จุดบนจอ) เผื่อกรอบตามนั้น ข้อความวิ่งจบในกรอบเดียว ไม่ต้องเริ่ม epoch ใหม่ระหว่างทาง
pub fn epoch_windows(img: &Image, w: u16, h: u16, moving: bool, travel: (i32, i32)) -> Vec<(u16, u16, u16, u16)> {
    let mut v: Vec<(i32, i32)> = img.objs.iter().map(|o| {
        let pad = if moving { (o.h as i32 / 2).max(32) } else { (o.h as i32 / 8).max(8) };
        let (up, down) = (pad.max(if travel.0 > 0 { travel.0 + 8 } else { 0 }), pad.max(if travel.1 > 0 { travel.1 + 8 } else { 0 }));
        ((o.y as i32 - up).max(0), (o.y as i32 + o.h as i32 + down).min(h as i32))
    }).collect();
    for i in 1..v.len() {
        let (a_end, b_start) = (img.objs[i - 1].y as i32 + img.objs[i - 1].h as i32, img.objs[i].y as i32);
        if v[i - 1].1 > v[i].0 { let mid = (a_end + b_start) / 2; v[i - 1].1 = mid.max(a_end); v[i].0 = mid.max(a_end).min(b_start); }
    }
    v.iter().map(|&(y0, y1)| (0, y0 as u16, w, (y1 - y0).max(1) as u16)).collect()
}

/// ชุดแสดงภาพเต็ม PCS WDS PDS ODS END · ใช้ตอนเริ่ม epoch หรือจุดเริ่มอ่าน · obj_ver คือรุ่นของภาพในกรอบเดิม (เพิ่มทุกครั้งที่ส่งภาพใหม่ใน epoch เดียวกัน)
pub fn show_set_x(hd: &Head, img: &Image, wins: &[(u16, u16, u16, u16)], pal_ver: u8, obj_ver: u8, bt709: bool) -> Vec<u8> {
    let mut o = vec![];
    let comp_objs: Vec<(u16, u8, u16, u16)> = img.objs.iter().enumerate().map(|(i, ob)| (i as u16, win_of(ob, wins).unwrap_or(i as u8), ob.x, ob.y)).collect();
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, false, &comp_objs));
    seg_d(&mut o, hd.pts, hd.dts, 0x17, &wds_bytes(wins));
    seg_d(&mut o, hd.pts, hd.dts, 0x14, &pds_bytes(&img.palette, pal_ver, bt709));
    // เวลาเริ่มถอดของแต่ละภาพต่อกันตามลำดับ หลังล้างจอ (ถ้าเริ่ม epoch)
    let mut at = hd.dts.saturating_add(if hd.state == EPOCH_START { ticks(hd.w as u64 * hd.h as u64, RC) } else { 0 });
    for (i, ob) in img.objs.iter().enumerate() {
        let data = rle(&ob.px, ob.w as usize, ob.h as usize);
        // ส่วนแรกมีหัว 11 ไบต์ ส่วนต่อมา 4 ไบต์ · ขนาดข้อมูลรวม 24 บิตนับความกว้างความสูงด้วย
        let first_max = 65535 - 11;
        let mut pos = 0;
        let mut first = true;
        while first || pos < data.len() {
            let room = if first { first_max } else { 65535 - 4 };
            let end = (pos + room).min(data.len());
            let last = end >= data.len();
            let mut d = vec![];
            be16(&mut d, i as u16);
            d.push(obj_ver);
            d.push(match (first, last) { (true, true) => 0xC0, (true, false) => 0x80, (false, true) => 0x40, _ => 0x00 });
            if first {
                let n = data.len() + 4;
                d.extend([(n >> 16) as u8, (n >> 8) as u8, n as u8]);
                be16(&mut d, ob.w); be16(&mut d, ob.h);
            }
            d.extend(&data[pos..end]);
            seg_d(&mut o, hd.pts, at, 0x15, &d);
            pos = end;
            first = false;
        }
        at = at.saturating_add(ticks(ob.w as u64 * ob.h as u64, RD));
    }
    seg_d(&mut o, hd.pts, at, 0x80, &[]);
    o
}

/// ชุดเปลี่ยนแค่จานสี PCS (ธง palette update) PDS END · ภาพเดิมในตัวถอดใช้ต่อ ไม่ส่งซ้ำ (ภาพเฟด สีเปลี่ยน)
pub fn palette_set(hd: &Head, img: &Image, wins: &[(u16, u16, u16, u16)], palette: &[[u8; 4]], pal_ver: u8, bt709: bool) -> Vec<u8> {
    let mut o = vec![];
    let comp_objs: Vec<(u16, u8, u16, u16)> = img.objs.iter().enumerate().map(|(i, ob)| (i as u16, win_of(ob, wins).unwrap_or(i as u8), ob.x, ob.y)).collect();
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, true, &comp_objs));
    seg_d(&mut o, hd.pts, hd.dts, 0x14, &pds_bytes(palette, pal_ver, bt709));
    seg_d(&mut o, hd.pts, hd.dts, 0x80, &[]);
    o
}

/// ชุดแสดงภาพแบบเดิม เริ่ม epoch ใหม่ กรอบเท่าภาพ (ใช้ในตัวคาดขนาดและเทส)
pub fn show_set(pts: u32, comp: u16, w: u16, h: u16, fps: u8, img: &Image, bt709: bool) -> Vec<u8> {
    let wins: Vec<(u16, u16, u16, u16)> = img.objs.iter().map(|o| (o.x, o.y, o.w, o.h)).collect();
    show_set_x(&Head { pts, dts: 0, comp, w, h, fps, state: EPOCH_START }, img, &wins, 0, 0, bt709)
}

/// ชุดล้างจอ PCS ไม่มีภาพ กรอบของ epoch END
pub fn clear_set_x(hd: &Head, wins: &[(u16, u16, u16, u16)]) -> Vec<u8> {
    let mut o = vec![];
    seg_d(&mut o, hd.pts, hd.dts, 0x16, &pcs_bytes(hd, false, &[]));
    seg_d(&mut o, hd.pts, hd.dts, 0x17, &wds_bytes(wins));
    seg_d(&mut o, hd.pts, hd.dts, 0x80, &[]);
    o
}

// ---------------------------------------------------------------- วาดด้วย ffmpeg

/// ffmpeg หนึ่งรอบ วาดซับที่เวลาที่ส่งมา · หนึ่งภาพได้สองภาพซ้อนบนล่าง คือซับบนพื้นดำทึบกับบนพื้นขาวทึบ (RGB) อ่านด้วย read_frame
/// ไม่ใช้โหมดพื้นโปร่งใสของตัวกรอง subtitles (alpha=1) เพราะคิดความโปร่งใสของสีโปร่งแสงผิด คูณซ้ำสองรอบ
/// (วัดแล้ว 14 พ.ย. 2569 เงาสี &H80 ทึบครึ่งเดียว ของจริงความทึบ 127 โหมดนี้ได้ 63 เงา ภาพเฟด ขอบเรืองแสงจึงจางกว่าตอนเล่น)
/// ส่วนการผสมลงพื้นทึบ ffmpeg ทำถูก ภาพบนพื้นดำคือสีคูณความโปร่งใสแล้ว และพื้นขาวลบพื้นดำบอกความโปร่งใส
fn spawn_batch(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, times: &[i64]) -> Result<(Child, ChildStdout), String> {
    let us: Vec<i64> = times.iter().map(|t| t * 1000).collect();
    spawn_pair(tools, sub, fonts, w, h, w, h, &us)
}

/// แบบเดียวกับ spawn_batch แต่วาดที่ขนาด w × h โดยบอก libass ว่าหนังจริงขนาด ow × oh (เส้นขอบกับเงาตอน ScaledBorderAndShadow ไม่ใช่ yes)
/// และเวลาเป็นไมโครวินาที · ภาพนิ่งของหน้าแก้ซับใช้ตัวนี้ด้วย (subshot.rs BUGS ข้อ 124)
#[allow(clippy::too_many_arguments)]
pub(crate) fn spawn_pair(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, ow: u32, oh: u32, times_us: &[i64]) -> Result<(Child, ChildStdout), String> {
    let times = times_us;
    // เวลาของภาพที่ N เป็นไมโครวินาที ผลรวม T × (N เท่ากับ i) · หน่วยเวลา AVTB ไม่ปัดเป็นวินาที (ภาพแหล่ง 1 ภาพต่อวินาทีปัด 4.5 วินาทีเป็น 4 บรรทัดที่เริ่ม 4.1 หาย)
    let expr = times.iter().enumerate().map(|(i, t)| format!("{}*eq(N,{i})", t.max(&0))).collect::<Vec<_>>().join("+");
    let s = crate::subtitle::subshot::subs_filter(sub, fonts, ow, oh, false);
    let fc = format!("[0:v]settb=AVTB,setpts='{expr}',{s}[k];[1:v]settb=AVTB,setpts='{expr}',{s}[l];[k][l]vstack=inputs=2,format=rgb24[o]");
    let n = times.len();
    let args: Vec<OsString> = vec![
        "-v".into(), "error".into(), "-nostdin".into(),
        "-f".into(), "lavfi".into(), "-i".into(), format!("color=c=black:s={w}x{h}:r=1:d={n},format=rgb24").into(),
        "-f".into(), "lavfi".into(), "-i".into(), format!("color=c=white:s={w}x{h}:r=1:d={n},format=rgb24").into(),
        "-filter_complex".into(), fc.into(), "-map".into(), "[o]".into(), "-frames:v".into(), n.to_string().into(), "-fps_mode".into(), "passthrough".into(),
        "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into(),
    ];
    let mut child = tool_command(tools, "ffmpeg", &args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด ffmpeg ไม่ได้ {e}"))?;
    // ปิดโปรแกรมระหว่างวาด ffmpeg ตายตาม (ผู้ช่วยตรวจทาน R18)
    crate::app::winutil::kill_with_app(&child);
    let out = child.stdout.take().ok_or("อ่านผลของ ffmpeg ไม่ได้")?;
    Ok((child, out))
}

/// ภาพคู่พื้นดำกับพื้นขาวจาก spawn_batch เป็น RGBA แบบคูณความโปร่งใส · สีคือภาพบนพื้นดำ ความโปร่งใสคือ 255 ลบ (ขาว − ดำ) เฉลี่ยสามช่องสี
pub fn pair_to_rgba(pair: &[u8], buf: &mut [u8]) {
    let n = buf.len() / 4;
    let (k, l) = pair.split_at(n * 3);
    for i in 0..n {
        let (b, wt) = (&k[i * 3..i * 3 + 3], &l[i * 3..i * 3 + 3]);
        let d: u32 = (0..3).map(|c| wt[c].saturating_sub(b[c]) as u32).sum();
        let a = 255 - ((d + 1) / 3).min(255) as u8;
        buf[i * 4] = b[0].min(a);
        buf[i * 4 + 1] = b[1].min(a);
        buf[i * 4 + 2] = b[2].min(a);
        buf[i * 4 + 3] = a;
    }
}

/// อ่านภาพถัดไปของ spawn_batch ลง buf (RGBA คูณความโปร่งใส ขนาด w × h × 4)
fn read_frame(o: &mut ChildStdout, pair: &mut Vec<u8>, buf: &mut [u8]) -> std::io::Result<()> {
    pair.resize(buf.len() / 4 * 6, 0);
    o.read_exact(pair)?;
    pair_to_rgba(pair, buf);
    Ok(())
}

fn ffmpeg_err(child: &mut Child) -> String {
    let mut e = String::new();
    if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut e); }
    let last = e.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
    if last.is_empty() { "วาดซับไม่สำเร็จ".into() } else { format!("วาดซับไม่สำเร็จ {last}") }
}

#[derive(Serialize, Clone)]
struct Progress<'a> { done: usize, total: usize, phase: &'a str }

#[tauri::command]
pub fn pgs_cancel() { STOP.store(true, Ordering::SeqCst); }

/// ส่งออก · คืนจำนวนภาพ ภาพที่ลดสี ภาพที่รวมกรอบ ขนาดไฟล์ · หยุดกลางทางลบไฟล์ครึ่งทางแล้วตอบ stopped
#[tauri::command]
pub async fn pgs_export(app: AppHandle, doc: SubDoc, req: PgsReq) -> Result<PgsOut, String> {
    STOP.store(false, Ordering::SeqCst);
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let r = export(&tools, &work, &doc, &req, &|done, total, phase| { let _ = app.emit("pgs-progress", Progress { done, total, phase }); })?;
        crate::app::actlog::note("ส่งออกซับเป็น PGS", &format!("{} ({} ภาพ)", r.path, r.images));
        Ok(r)
    }).await.map_err(|e| e.to_string())?
}

/// สิ่งที่ต้องเขียนที่จุดเปลี่ยนหนึ่งจุด · เปลี่ยนแค่จานสี · ภาพใหม่ · ล้างจอ
enum Step { Pal(Vec<[u8; 4]>), Show(Image), Clear }

/// ตัวทำไฟล์ .sup · แยกจากคำสั่งของหน้าจอ เทสเรียกตรงได้ · progress ได้ (ภาพที่วาดแล้ว, ภาพทั้งหมด)
pub fn export(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, progress: &dyn Fn(usize, usize, &str)) -> Result<PgsOut, String> {
    {
        let target = PathBuf::from(&req.target);
        if !target.extension().is_some_and(|e| e.eq_ignore_ascii_case("sup")) { return Err("ไฟล์ PGS ต้องเป็นนามสกุล .sup".into()); }
        if target.exists() { return Err("exists".into()); }
        let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
        let fps = fps_code(req.fps_num, req.fps_den);
        let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
        let prep = prepare(doc, req);
        let (_, bt709) = matrices(&req.opts, h, prep.tv601);
        if req.engine == "super" { return export_super(tools, work, &prep, req, progress); }
        if req.engine == "seconv" { return export_seconv(tools, work, doc, req, progress); }
        let enc = Enc::of(&req.opts);
        let doc = &prep.doc;
        let sub = crate::subtitle::subshot::TmpSub::new(work, doc)?;
        let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
        let pts = change_points(doc, frame_ms);
        let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(doc, pts[i])).collect();
        let total = need.len();
        // ภาพฐานของบรรทัดที่เฟดเข้า คือภาพตอนทึบเต็มที่ วาดไว้ก่อน เฟรมช่วงเฟดเข้าจะได้เปลี่ยนแค่จานสีจากภาพนี้ (BUGS ข้อ 126)
        // เฟรมแรกของเฟดเข้าจางมาก ถ้าใช้เป็นฐาน สีที่รวมเลขเดียวกันตอนจางจะแยกกันเมื่อชัดขึ้น ต้องส่งภาพเต็มใหม่หลายครั้ง (วัดแล้ว 6 ครั้งในเฟด 0.5 วินาที)
        // ภาพกลางเฟด (probe ค่าเฟดราว 0.4) ใช้แยกเลขสีของจุดที่จางไม่เท่ากัน (image_of_pair) ใช้ได้ทั้งเฟดเข้าและเฟดออก
        // (เริ่มบรรทัด, จบบรรทัด, เวลาภาพฐาน, เวลาภาพกลางเฟด)
        let fades: Vec<(i64, i64, i64, Option<i64>)> = doc.events.iter().filter(|e| !e.comment && e.end > e.start).filter_map(|e| {
            let (fi, fo) = fade_of(&e.text)?;
            if fi == 0 && fo == 0 { return None; }
            let act = |t: i64| active_at(doc, t);
            let full = (e.start + fi).min(e.end - 1);
            let bt = pts.iter().copied().find(|&t| t >= full && t < e.end && act(t))?;
            let probe_at = |from: i64, to: i64| pts.iter().copied().find(|&t| t >= from && t < to && act(t));
            let probe = if fi as f64 >= 3.0 * frame_ms { probe_at(e.start + fi * 2 / 5, full) }
                else if fo as f64 >= 3.0 * frame_ms { probe_at(e.end - fo * 2 / 5, e.end) } else { None };
            Some((e.start, e.end, bt, probe.filter(|&p| p != bt)))
        }).collect();
        // บรรทัด \move (เริ่ม, จบ, ระยะวิ่งแนวตั้งเป็นจุดบนจอ) · กรอบของ epoch เผื่อตามระยะวิ่ง
        let sy = h as f64 / script_play_res_y(doc);
        let moves: Vec<(i64, i64, i32)> = doc.events.iter().filter(|e| !e.comment && e.end > e.start)
            .filter_map(|e| move_dy(&e.text).map(|dy| (e.start, e.end, (dy * sy).round() as i32))).collect();
        let travel_at = |t: i64| moves.iter().filter(|m| t >= m.0 && t < m.1).fold((0, 0), |(u, d), m| (u.max(-m.2), d.max(m.2)));
        let mut bases: HashMap<usize, Image> = HashMap::new();
        if !fades.is_empty() {
            let mut times: Vec<i64> = fades.iter().flat_map(|f| std::iter::once(f.2).chain(f.3)).collect();
            times.sort_unstable();
            times.dedup();
            // เก็บภาพไว้เฉพาะที่บรรทัดที่ยังทำภาพฐานไม่เสร็จต้องใช้ บรรทัดที่ได้ครบสองภาพทำภาพฐานแล้วทิ้งภาพ (ภาพเต็มจอ 1080p ภาพละ 8 MB)
            let mut held: HashMap<i64, Vec<u8>> = HashMap::new();
            render_all(tools, &sub.0, fonts.as_deref(), w, h, &times, &mut |k: usize, buf: &[u8]| {
                held.insert(times[k], buf.to_vec());
                for (j, f) in fades.iter().enumerate() {
                    if bases.contains_key(&j) { continue; }
                    let (Some(b), p) = (held.get(&f.2), f.3.map(|p| held.get(&p))) else { continue };
                    let im = match p {
                        None => image_of(b, w as usize, h as usize, &enc),
                        Some(None) => continue,
                        Some(Some(pb)) => image_of_pair(b, pb, w as usize, h as usize, &enc).or_else(|| image_of(b, w as usize, h as usize, &enc)),
                    };
                    if let Some(im) = im { bases.insert(j, im); }
                }
                held.retain(|t, _| fades.iter().enumerate().any(|(j, f)| !bases.contains_key(&j) && (f.2 == *t || f.3 == Some(*t))));
                Ok(())
            }, &|| STOP.load(Ordering::SeqCst))?;
            if STOP.load(Ordering::SeqCst) { return Err("stopped".into()); }
        }
        let partial = crate::subtitle::subdoc::partial_of(&target);
        let file = std::fs::OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|e| format!("เขียนไฟล์ไม่ได้ {e}"))?;
        let mut wr = BufWriter::new(file);
        let mut res = PgsOut::default();
        let fail = |e: String, p: &Path| { let _ = std::fs::remove_file(p); Err::<PgsOut, String>(e) };
        let mut comp: u16 = 0;
        let mut shown: Option<Image> = None;
        // กรอบของ epoch ที่ใช้อยู่ · รุ่นของจานสีกับภาพใน epoch นี้ · เวลาแสดงกับเวลาเริ่มถอดของชุดล่าสุด (BUGS ข้อ 126)
        let mut wins: Vec<(u16, u16, u16, u16)> = vec![];
        let (mut pal_ver, mut obj_ver): (u8, u8) = (0, 0);
        let (mut last_pts, mut last_dts): (Option<u32>, u32) = (None, 0);
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let mut pair: Vec<u8> = vec![];
        let mut done = 0usize;
        let mut cur: Option<(Child, ChildStdout, usize)> = None;
        let mut next_batch = 0usize;
        progress(0, total, "draw");
        for &t in pts.iter() {
            if STOP.load(Ordering::SeqCst) {
                if let Some((mut c, _, _)) = cur.take() { let _ = c.kill(); let _ = c.wait(); }
                drop(wr);
                return fail("stopped".into(), &partial);
            }
            let pts90 = (t.max(0) as u64 * 90).min(u32::MAX as u64) as u32;
            let img = if active_at(doc, t) {
                // ภาพถัดไปของรอบที่วาดอยู่ หมดรอบเริ่มรอบใหม่
                if cur.as_ref().is_none_or(|c| c.2 == 0) {
                    if let Some((mut c, _, _)) = cur.take() {
                        let ok = c.wait().map(|s| crate::app::tools::tool_succeeded("ffmpeg", &s)).unwrap_or(false);
                        if !ok { let e = ffmpeg_err(&mut c); drop(wr); return fail(e, &partial); }
                    }
                    let times: Vec<i64> = need[next_batch..(next_batch + BATCH).min(need.len())].iter().map(|&k| pts[k]).collect();
                    next_batch += times.len();
                    match spawn_batch(tools, &sub.0, fonts.as_deref(), w, h, &times) {
                        Ok((c, o)) => cur = Some((c, o, times.len())),
                        Err(e) => { drop(wr); return fail(e, &partial); }
                    }
                }
                let c = cur.as_mut().unwrap();
                if let Err(e) = read_frame(&mut c.1, &mut pair, &mut buf) {
                    let msg = ffmpeg_err(&mut c.0);
                    let _ = c.0.kill();
                    drop(wr);
                    return fail(format!("{msg} ({e})"), &partial);
                }
                c.2 -= 1;
                done += 1;
                if done % 4 == 0 || done == total { progress(done, total, "draw"); }
                // ภาพที่ขึ้นอยู่ใช้เลขสีเดิมได้ทุกจุด ส่งแค่จานสีใหม่ ไม่ต้องลดสีและเขียนภาพซ้ำ (ภาพเฟด)
                match shown.as_ref().and_then(|s| palette_update(s, &buf, w as usize, h as usize, &enc)) {
                    Some(pal) => Step::Pal(pal),
                    None => {
                        // บรรทัดที่เฟด ใช้ภาพฐาน (ตอนทึบ แยกเลขสีตามพฤติกรรมตอนเฟด) กับจานสีของเฟรมนี้ เฟรมถัดไปจึงเปลี่ยนแค่จานสีต่อได้
                        let base = fades.iter().enumerate().find(|(_, f)| t >= f.0 && t < f.1).and_then(|(j, _)| bases.get(&j));
                        match base.and_then(|b| palette_update(b, &buf, w as usize, h as usize, &enc).map(|pal| Image { palette: pal, ..b.clone() })) {
                            Some(im) => Step::Show(im),
                            None => match image_of(&buf, w as usize, h as usize, &enc) { Some(im) => Step::Show(im), None => Step::Clear },
                        }
                    }
                }
            } else { Step::Clear };
            // เวลาเริ่มถอดตามแบบจำลองของเครื่องเล่น Blu-ray · ห่างจากชุดก่อนไม่พอนับว่าถอดไม่ทัน แต่ยังเขียน (ตัวเล่นบนคอมแสดงได้ปกติ)
            // เวลาเริ่มถอดไม่ย้อนหลังชุดก่อน ตัวอ่านไฟล์บางตัวเตือนเมื่อเวลาถอยหลัง
            let mut timed = |dur: u32, res: &mut PgsOut| -> u32 {
                let want = pts90.saturating_sub(dur);
                if last_pts.is_some_and(|p| want < p) { res.late += 1; }
                let dts = want.max(last_dts).min(pts90);
                last_pts = Some(pts90);
                last_dts = dts;
                dts
            };
            let out: Option<Vec<u8>> = match img {
                Step::Pal(pal) => {
                    let s = shown.as_mut().unwrap();
                    if pal == s.palette { None } else {
                        res.images += 1;
                        res.pal_updates += 1;
                        pal_ver = pal_ver.wrapping_add(1);
                        let dts = timed(0, &mut res);
                        let b = palette_set(&Head { pts: pts90, dts, comp, w: w as u16, h: h as u16, fps, state: NORMAL }, s, &wins, &pal, pal_ver, bt709);
                        s.palette = pal;
                        Some(b)
                    }
                }
                Step::Show(im) if shown.as_ref().is_some_and(|s| s.objs == im.objs && s.palette == im.palette) => None,
                Step::Show(im) => {
                    res.images += 1;
                    res.max_colors = res.max_colors.max(im.colors);
                    if im.colors > enc.k { res.reduced += 1; }
                    if im.merged { res.merged += 1; }
                    // ภาพอยู่ในกรอบของ epoch เดิมได้ ส่งเป็นจุดเริ่มอ่าน ไม่ต้องล้างจอทั้งจอ · ไม่ได้เริ่ม epoch ใหม่กรอบกว้างเต็มจอ
                    let state = if !wins.is_empty() && fits(&im, &wins) { res.reused += 1; ACQUISITION } else { EPOCH_START };
                    if state == EPOCH_START { wins = epoch_windows(&im, w as u16, h as u16, shown.is_some(), travel_at(t)); pal_ver = 0; obj_ver = 0; } else { pal_ver = pal_ver.wrapping_add(1); obj_ver = obj_ver.wrapping_add(1); }
                    let sizes: Vec<(u16, u16)> = im.objs.iter().map(|o| (o.w, o.h)).collect();
                    let dts = timed(decode_ticks(state, w as u16, h as u16, &sizes, &wins), &mut res);
                    let b = show_set_x(&Head { pts: pts90, dts, comp, w: w as u16, h: h as u16, fps, state }, &im, &wins, pal_ver, obj_ver, bt709);
                    shown = Some(im);
                    Some(b)
                }
                Step::Clear => {
                    if shown.take().is_some() {
                        let dts = timed(decode_ticks(NORMAL, w as u16, h as u16, &[], &wins), &mut res);
                        Some(clear_set_x(&Head { pts: pts90, dts, comp, w: w as u16, h: h as u16, fps, state: NORMAL }, &wins))
                    } else { None }
                }
            };
            if let Some(b) = out {
                comp = comp.wrapping_add(1);
                if let Err(e) = wr.write_all(&b) { drop(wr); return fail(format!("เขียนไฟล์ไม่ได้ {e}"), &partial); }
            }
        }
        if let Some((mut c, _, _)) = cur.take() { let _ = c.wait(); }
        if let Err(e) = wr.flush() { drop(wr); return fail(format!("เขียนไฟล์ไม่ได้ {e}"), &partial); }
        drop(wr);
        if res.images == 0 { return fail("ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ จึงไม่มีภาพให้ส่งออก".into(), &partial); }
        if let Err(p) = crate::cover::rename::move_no_replace(&partial, &target) {
            let _ = std::fs::remove_file(&partial);
            return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
        }
        res.bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        res.path = target.display().to_string();
        Ok(res)
    }
}

// ---------------------------------------------------------------- ถอดไฟล์ .sup กับสีแบบตัวเล่น

/// ภาพเลขสีจาก RLE ของ PGS (กลับด้านของ rle)
pub fn unrle(data: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut px: Vec<u8> = Vec::with_capacity(w * h);
    let mut i = 0;
    while i < data.len() {
        let b = data[i];
        i += 1;
        if b != 0 { px.push(b); continue; }
        let Some(&f) = data.get(i) else { break };
        i += 1;
        if f == 0 {
            let rem = if w > 0 { px.len() % w } else { 0 };
            if rem != 0 { px.resize(px.len() + w - rem, 0); }
            continue;
        }
        let mut n = (f & 0x3F) as usize;
        if f & 0x40 != 0 { n = (n << 8) | *data.get(i).unwrap_or(&0) as usize; i += 1; }
        let c = if f & 0x80 != 0 { let c = *data.get(i).unwrap_or(&0); i += 1; c } else { 0 };
        px.extend(std::iter::repeat_n(c, n));
    }
    px.resize(w * h, 0);
    px
}

/// ถอดไฟล์ .sup เป็นภาพ RGBA แบบไม่คูณความโปร่งใส ณ ชุดสุดท้ายที่เวลาไม่เกิน at ms · ถอดจานสีแบบตัวเล่น (BT.709 เมื่อ bt709)
/// ใช้ทำภาพตัวอย่างของ SUPer และเทสว่าไฟล์ที่เขียนได้ภาพตรง
pub fn decode_at(b: &[u8], at: i64, w: usize, h: usize, bt709: bool) -> Vec<u8> {
    let be = |d: &[u8], p: usize| u16::from_be_bytes([d[p], d[p + 1]]);
    let mut out = vec![0u8; w * h * 4];
    let mut pal = [[0u8; 4]; 256];
    let mut objs: HashMap<u16, (usize, usize, Vec<u8>)> = HashMap::new();
    let mut part: HashMap<u16, (usize, usize, Vec<u8>)> = HashMap::new();
    let mut comp: Vec<(u16, usize, usize)> = vec![];
    let mut i = 0;
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) as i64 / 90;
        let kind = b[i + 10];
        let n = be(b, i + 11) as usize;
        if i + 13 + n > b.len() || pts > at { break; }
        let d = &b[i + 13..i + 13 + n];
        match kind {
            0x16 if d.len() >= 11 => {
                if d[7] & 0x80 != 0 { objs.clear(); pal = [[0u8; 4]; 256]; }
                comp.clear();
                let mut p = 11;
                for _ in 0..d[10] {
                    if p + 8 > d.len() { break; }
                    comp.push((be(d, p), be(d, p + 4) as usize, be(d, p + 6) as usize));
                    p += 8 + if d[p + 3] & 0x80 != 0 { 8 } else { 0 };
                }
            }
            0x14 => {
                let mut p = 2;
                while p + 5 <= d.len() {
                    let c = rgb_of(d[p + 1], d[p + 2], d[p + 3], bt709);
                    pal[d[p] as usize] = [c[0], c[1], c[2], d[p + 4]];
                    p += 5;
                }
            }
            0x15 if d.len() >= 4 => {
                let id = be(d, 0);
                let flag = d[3];
                if flag & 0x80 != 0 && d.len() >= 11 { part.insert(id, (be(d, 7) as usize, be(d, 9) as usize, d[11..].to_vec())); }
                else if let Some(e) = part.get_mut(&id) { e.2.extend_from_slice(&d[4..]); }
                if flag & 0x40 != 0 {
                    if let Some((ow, oh, data)) = part.remove(&id) { let px = unrle(&data, ow, oh); objs.insert(id, (ow, oh, px)); }
                }
            }
            0x80 => {
                out.fill(0);
                for &(id, x, y) in &comp {
                    let Some((ow, oh, px)) = objs.get(&id) else { continue };
                    for yy in 0..*oh { for xx in 0..*ow {
                        let k = px[yy * ow + xx] as usize;
                        let (px_x, px_y) = (x + xx, y + yy);
                        // สีช่องที่ 0 ไม่ได้โปร่งใสเสมอ ตัวทำไฟล์บางตัวใช้เป็นสีทึบ (SeConv ใช้เป็นสีตัวอักษร) ดูความทึบจากจานสีแทน
                        // ช่องที่ไม่ได้ตั้งในจานสีเป็นโปร่งใส (ค่าเริ่ม 0 0 0 0) · เดิมข้ามช่องที่ 0 ตัวอักษรของ SeConv หายทั้งตัว (เจอ 15 พ.ย. 2569)
                        if px_x >= w || px_y >= h { continue; }
                        let c = pal[k];
                        if c[3] == 0 { continue; }
                        out[(px_y * w + px_x) * 4..(px_y * w + px_x) * 4 + 4].copy_from_slice(&c);
                    } }
                }
            }
            _ => {}
        }
        i += 13 + n;
    }
    out
}

/// เวลา ms ของชุดแรกที่มีภาพในไฟล์ .sup
pub fn first_shown(b: &[u8]) -> Option<i64> {
    let mut i = 0;
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        if b[i + 10] == 0x16 && n >= 11 && b[i + 13 + 10] > 0 { return Some(u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) as i64 / 90); }
        i += 13 + n;
    }
    None
}

/// ภาพของ PGS แบบที่ตัวเล่นแสดง · จานสีแปลงเป็น YCbCr ด้วยตาราง coef709 (ที่เขียนลงไฟล์) แล้วถอดด้วยตาราง out709 (ที่ตัวเล่นใช้)
pub fn image_rgba(img: &Image, w: usize, h: usize, coef709: bool, out709: bool) -> Vec<u8> {
    let pal: Vec<[u8; 4]> = img.palette.iter().map(|c| {
        if c[3] == 0 { return [0, 0, 0, 0]; }
        let (y, cr, cb) = ycrcb(c[0], c[1], c[2], coef709);
        let r = rgb_of(y, cr, cb, out709);
        [r[0], r[1], r[2], c[3]]
    }).collect();
    let mut out = vec![0u8; w * h * 4];
    for o in &img.objs {
        for yy in 0..o.h as usize { for xx in 0..o.w as usize {
            let k = o.px[yy * o.w as usize + xx] as usize;
            let (x, y) = (o.x as usize + xx, o.y as usize + yy);
            if k == 0 || x >= w || y >= h { continue; }
            out[(y * w + x) * 4..(y * w + x) * 4 + 4].copy_from_slice(&pal[k]);
        } }
    }
    out
}

/// สีแบบไม่คูณความโปร่งใสของทุกจุด · mangle คิดสีแบบตัวเล่น (ซับ TV.601 บนภาพ BT.709) · viv เพิ่มความสด
pub fn straight_px(rgba: &[u8], mangle: bool, viv: f64) -> Vec<u8> {
    let mut out = vec![0u8; rgba.len()];
    for (i, p) in rgba.chunks_exact(4).enumerate() {
        if p[3] == 0 { continue; }
        let mut c = straight(p);
        if viv > 0.0 { c = vivid(c, viv); }
        let mut b = c.to_le_bytes();
        if mangle { let m = mangle601([b[0], b[1], b[2]]); b[..3].copy_from_slice(&m); }
        out[i * 4..i * 4 + 4].copy_from_slice(&b);
    }
    out
}

/// วาดซับไฟล์ sub หนึ่งภาพที่เวลา t_us (ไมโครวินาที) ขนาด w × h ของหนังขนาดจริง ow × oh ได้ RGBA แบบคูณความโปร่งใส (ภาพนิ่งของหน้าแก้ซับ)
#[allow(clippy::too_many_arguments)]
pub(crate) fn render_pair(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, ow: u32, oh: u32, t_us: i64) -> Result<Vec<u8>, String> {
    let (mut c, mut o) = spawn_pair(tools, sub, fonts, w, h, ow, oh, &[t_us])?;
    let mut buf = vec![0u8; (w * h * 4) as usize];
    if let Err(e) = read_frame(&mut o, &mut vec![], &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
    let _ = c.wait();
    Ok(buf)
}

/// วาดซับหนึ่งภาพที่เวลา t ได้ RGBA แบบคูณความโปร่งใส (แบบที่ ffmpeg ให้มา)
fn render_one(tools: &Path, work: &Path, doc: &SubDoc, fonts: Option<&Path>, w: u32, h: u32, t: i64) -> Result<Vec<u8>, String> {
    let sub = crate::subtitle::subshot::TmpSub::new(work, doc)?;
    let (mut c, mut o) = spawn_batch(tools, &sub.0, fonts, w, h, &[t])?;
    let mut buf = vec![0u8; (w * h * 4) as usize];
    if let Err(e) = read_frame(&mut o, &mut vec![], &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
    let _ = c.wait();
    Ok(buf)
}

/// วาดซับทุกเวลาใน times ทีละชุดไม่เกิน BATCH ภาพ ส่งภาพให้ on ทีละภาพตามลำดับ · กดหยุดตอบ stopped
fn render_all(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, times: &[i64], on: &mut dyn FnMut(usize, &[u8]) -> Result<(), String>, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    let mut buf = vec![0u8; (w * h * 4) as usize];
    let mut pair: Vec<u8> = vec![];
    let mut k = 0;
    for chunk in times.chunks(BATCH) {
        let (mut c, mut o) = spawn_batch(tools, sub, fonts, w, h, chunk)?;
        for _ in chunk {
            if cancel() { let _ = c.kill(); let _ = c.wait(); return Err("stopped".into()); }
            if let Err(e) = read_frame(&mut o, &mut pair, &mut buf) { let m = ffmpeg_err(&mut c); let _ = c.kill(); return Err(format!("{m} ({e})")); }
            if let Err(e) = on(k, &buf) { let _ = c.kill(); let _ = c.wait(); return Err(e); }
            k += 1;
        }
        let ok = c.wait().map(|s| crate::app::tools::tool_succeeded("ffmpeg", &s)).unwrap_or(false);
        if !ok { return Err(ffmpeg_err(&mut c)); }
    }
    Ok(())
}

// ---------------------------------------------------------------- ตัวสร้าง SUPer

/// SUPer ในโฟลเดอร์เครื่องมือ (fetch-tools แตกไว้ที่ tools\super) · SUPer ของ cubicibo ทำ .sup ตามมาตรฐาน Blu-ray จากไฟล์ BDN XML กับภาพ PNG
pub fn super_exe(tools: &Path) -> PathBuf { tools.join("super").join("SUPer_CLI.exe") }

/// รูปแบบภาพใน BDN XML · SUPer รับเฉพาะขนาดของ Blu-ray
pub fn video_format(w: u32, h: u32, num: u32, den: u32) -> Option<&'static str> {
    let f = num as f64 / den.max(1) as f64;
    match (w, h) {
        (1920, 1080) => Some(if f < 24.5 { "1080p" } else { "1080i" }),
        (1280, 720) => Some("720p"),
        (720, 576) => Some("576i"),
        (720, 480) => Some("480i"),
        _ => None,
    }
}

/// อัตราเฟรมแบบที่ BDN XML เขียน กับฐานของเลขเฟรมในเวลา (23.976 นับเฟรมแบบ 24 แล้ว SUPer คูณเวลา 1.001 เอง)
pub fn bdn_rate(num: u32, den: u32) -> (&'static str, u32) {
    match fps_code(num, den) { 0x20 => ("24", 24), 0x30 => ("25", 25), 0x40 => ("29.97", 30), 0x60 => ("50", 50), 0x70 => ("59.94", 60), _ => ("23.976", 24) }
}

/// เลขเฟรมของเวลา t ms
pub fn frame_no(t: i64, num: u32, den: u32) -> i64 { (t.max(0) as f64 * num as f64 / (den.max(1) as f64 * 1000.0)).round() as i64 }

/// เวลาแบบ ชม:นาที:วินาที:เฟรม ของ BDN XML
pub fn bdn_tc(n: i64, base: u32) -> String {
    let b = base.max(1) as i64;
    let s = n / b;
    format!("{:02}:{:02}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60, n % b)
}

/// ภาพหนึ่งภาพของ BDN XML
struct BdnEvent { start: i64, end: i64, file: String, x: usize, y: usize, w: usize, h: usize }

/// ครอปภาพตรงที่มีซับ เขียนเป็น PNG สีแบบไม่คูณความโปร่งใส · ไม่มีซับคืน None
fn write_png(dir: &Path, name: &str, px: &[u8], w: usize, h: usize) -> Result<Option<(usize, usize, usize, usize)>, String> {
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0, 0);
    for y in 0..h { for x in 0..w { if px[(y * w + x) * 4 + 3] > 0 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x0 > x1 { return Ok(None); }
    let (cw, ch) = (x1 + 1 - x0, y1 + 1 - y0);
    let mut c = Vec::with_capacity(cw * ch * 4);
    for y in y0..=y1 { c.extend_from_slice(&px[(y * w + x0) * 4..(y * w + x1 + 1) * 4]); }
    let img = image::RgbaImage::from_raw(cw as u32, ch as u32, c).ok_or("ทำภาพ PNG ไม่ได้")?;
    img.save_with_format(dir.join(name), image::ImageFormat::Png).map_err(|e| format!("เขียนภาพ PNG ไม่ได้ {e}"))?;
    Ok(Some((x0, y0, cw, ch)))
}

fn write_bdn(dir: &Path, ev: &[BdnEvent], vf: &str, rate: &str, base: u32, num: u32, den: u32) -> Result<PathBuf, String> {
    let tc = |t: i64| bdn_tc(frame_no(t, num, den), base);
    let mut x = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<BDN Version=\"0.93\" xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xsi:noNamespaceSchemaLocation=\"BD-03-006-0093b BDN File Format.xsd\">\n  <Description>\n    <Name Title=\"movie-shelf\" Content=\"\"/>\n    <Language Code=\"und\"/>\n");
    x.push_str(&format!("    <Format VideoFormat=\"{vf}\" FrameRate=\"{rate}\" DropFrame=\"False\"/>\n"));
    let (first, last) = (ev.first().map(|e| tc(e.start)).unwrap_or_default(), ev.last().map(|e| tc(e.end)).unwrap_or_default());
    x.push_str(&format!("    <Events LastEventOutTC=\"{last}\" FirstEventInTC=\"{first}\" ContentInTC=\"{first}\" ContentOutTC=\"{last}\" NumberofEvents=\"{}\" Type=\"Graphic\"/>\n  </Description>\n  <Events>\n", ev.len()));
    for e in ev {
        x.push_str(&format!("    <Event Forced=\"False\" InTC=\"{}\" OutTC=\"{}\">\n      <Graphic Width=\"{}\" Height=\"{}\" X=\"{}\" Y=\"{}\">{}</Graphic>\n    </Event>\n", tc(e.start), tc(e.end), e.w, e.h, e.x, e.y, e.file));
    }
    x.push_str("  </Events>\n</BDN>\n");
    let p = dir.join("bdn.xml");
    std::fs::write(&p, x).map_err(|e| format!("เขียน BDN XML ไม่ได้ {e}"))?;
    Ok(p)
}

/// ลบโฟลเดอร์ทำงานของ SUPer ตอนจบเสมอ
struct TmpDir(PathBuf);
impl Drop for TmpDir {
    // ตั้งตัวแปร PGS_KEEP ไว้ไล่ปัญหา โฟลเดอร์ภาพกับ bdn.xml ไม่ถูกลบ
    fn drop(&mut self) { if std::env::var_os("PGS_KEEP").is_none() { let _ = std::fs::remove_dir_all(&self.0); } }
}

/// รัน SUPer ทำ .sup จาก bdn.xml · ความคืบหน้าอ่านจากแถบของ SUPer (เลขภาพที่หากรอบแล้ว จากภาพทั้งหมด) · กดหยุดปิด SUPer
fn run_super(tools: &Path, bdn: &Path, out: &Path, opts: &PgsOpts, bt709: bool, progress: &dyn Fn(usize, usize, &str), cancel: &dyn Fn() -> bool) -> Result<(), String> {
    use std::io::BufRead;
    let mut args: Vec<OsString> = vec![
        "-i".into(), bdn.as_os_str().to_owned(), "-c".into(), opts.compression.min(100).to_string().into(), "-q".into(), opts.quantizer.min(3).to_string().into(),
        "--layout".into(), opts.layout.min(2).to_string().into(), "-b".into(), (if bt709 { "709" } else { "601" }).into(),
        // เครื่องพี่กันแรม 8 GB ซีพียู 12 เธรด ให้ SUPer ใช้ไม่เกิน 4 เธรด เครื่องไม่กระตุก (CLAUDE.md)
        "-t".into(), "4".into(),
    ];
    if opts.redraw > 0.0 { args.push("--redraw-period".into()); args.push(format!("{:.1}", opts.redraw.clamp(1.0, 60.0)).into()); }
    if opts.max_kbps > 0 { args.push("-m".into()); args.push(opts.max_kbps.to_string().into()); }
    if opts.allow_normal { args.push("-n".into()); }
    if opts.ahead { args.push("-d".into()); }
    args.push("-y".into());
    args.push(out.as_os_str().to_owned());
    let dir = tools.join("super");
    // config.ini กับ lib/libimagequant.dll ของ SUPer อ้างที่อยู่จากโฟลเดอร์ของมันเอง · ที่อยู่ไฟล์ที่ส่งเป็นแบบเต็มทั้งหมด
    // PYOPENCL_NO_CACHE ไม่ใช้แคชคอมไพล์ของ pyopencl ใน AppData · เดิม SUPer ที่โดนปิดกลางทางทิ้งไฟล์ล็อกค้าง ทุกรอบถัดไปรอล็อกราวหนึ่งนาทีแล้วพัง
    // "Encoder died: Empty@get" (เจอ 15 พ.ย. 2569) · config.ini ตั้ง use_gpu=0 ด้วย (fetch-tools) ใช้ซีพียูเร็วพอกัน (8 กับ 9 วินาที) ไม่พึ่งไดรเวอร์ OpenCL ของการ์ดจอในตัว
    let mut child = tool_command(&dir, "SUPer_CLI", &args).current_dir(&dir).env("PYOPENCL_NO_CACHE", "1").stdout(Stdio::null()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด SUPer ไม่ได้ {e}"))?;
    let err = child.stderr.take().ok_or("อ่านผลของ SUPer ไม่ได้")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut r = std::io::BufReader::new(err);
        let mut buf = vec![];
        // แถบความคืบหน้าของ SUPer เขียนทับบรรทัดเดิมด้วย \r
        loop {
            buf.clear();
            match r.read_until(b'\r', &mut buf) { Ok(0) | Err(_) => break, Ok(_) => {} }
            for l in String::from_utf8_lossy(&buf).split(['\r', '\n']) { if !l.trim().is_empty() && tx.send(l.to_string()).is_err() { return; } }
        }
    });
    // ข้อความของ SUPer ที่ไม่ใช่แถบความคืบหน้า เก็บไว้บอกเหตุผลตอนไม่สำเร็จ และเขียนลง super-last.log ในโฟลเดอร์ทำงานไว้ไล่ดู
    let mut log: Vec<String> = vec![];
    let take = |l: &str, log: &mut Vec<String>| { if !l.contains('%') && !l.trim().is_empty() { log.push(l.trim().to_string()); } };
    loop {
        if cancel() { let _ = child.kill(); let _ = child.wait(); return Err("stopped".into()); }
        while let Ok(l) = rx.try_recv() {
            // "Finding epochs and layouts:  45%|... | 41/92 [..."
            if let Some(p) = l.find(" [") { if let Some(s) = l[..p].rsplit(' ').next() { if let Some((a, b)) = s.split_once('/') { if let (Ok(a), Ok(b)) = (a.parse::<usize>(), b.parse::<usize>()) { progress(a, b, "super"); } } } }
            take(&l, &mut log);
        }
        match child.try_wait() {
            Ok(Some(st)) => {
                std::thread::sleep(std::time::Duration::from_millis(80));
                while let Ok(l) = rx.try_recv() { take(&l, &mut log); }
                if st.success() && out.exists() { return Ok(()); }
                if let Some(d) = bdn.parent().and_then(|p| p.parent()) { let _ = std::fs::write(d.join("super-last.log"), log.join("\n")); }
                // บรรทัดที่บอกต้นเหตุ ขึ้นต้น ERROR หรือมีคำว่า Error ก่อน ไม่มีใช้บรรทัดสุดท้าย
                let why = log.iter().find(|l| l.contains("ERROR") || l.contains("Error") || l.contains("Exception")).or(log.last()).cloned().unwrap_or_default();
                return Err(format!("SUPer ทำไฟล์ไม่สำเร็จ {}", why.trim_start_matches("SUPer").trim()));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(80)),
            Err(e) => return Err(format!("SUPer ทำไฟล์ไม่สำเร็จ {e}")),
        }
    }
}

/// ตัวสร้าง SUPer · วาดภาพด้วย libass แบบเดียวกับตัวในโปรแกรม เขียนเป็น PNG กับ BDN XML แล้วให้ SUPer ทำไฟล์ .sup
fn export_super(tools: &Path, work: &Path, prep: &Prepared, req: &PgsReq, progress: &dyn Fn(usize, usize, &str)) -> Result<PgsOut, String> {
    let exe = super_exe(tools);
    if !exe.exists() { return Err("ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือ".into()); }
    let target = PathBuf::from(&req.target);
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let vf = video_format(w, h, req.fps_num, req.fps_den).ok_or("SUPer รับเฉพาะขนาดภาพของ Blu-ray คือ 1920 × 1080 1280 × 720 720 × 576 หรือ 720 × 480")?;
    let (rate, base) = bdn_rate(req.fps_num, req.fps_den);
    let (out709, _) = matrices(&req.opts, h, prep.tv601);
    let mangle = req.opts.vsfilter && prep.tv601 && out709;
    let viv = req.opts.vivid.min(100) as f64 / 100.0;
    let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
    let doc = &prep.doc;
    let pts = change_points(doc, frame_ms);
    let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(doc, pts[i]) && i + 1 < pts.len()).collect();
    let total = need.len();
    let dir = TmpDir(work.join(format!("pgs-super-{}", crate::cover::poster_image::unique())));
    std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
    let sub = crate::subtitle::subshot::TmpSub::new(work, doc)?;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let times: Vec<i64> = need.iter().map(|&i| pts[i]).collect();
    let mut ev: Vec<BdnEvent> = vec![];
    let mut prev: Option<Vec<u8>> = None;
    progress(0, total, "draw");
    render_all(tools, &sub.0, fonts.as_deref(), w, h, &times, &mut |k: usize, buf: &[u8]| {
        let (start, end) = (pts[need[k]], pts[need[k] + 1]);
        let px = straight_px(buf, mangle, viv);
        if (k + 1) % 4 == 0 || k + 1 == total { progress(k + 1, total, "draw"); }
        // ภาพเดิมต่อกัน ยืดเวลาจบของภาพก่อน
        if let (Some(p), Some(last)) = (&prev, ev.last_mut()) { if *p == px && last.end == start { last.end = end; return Ok(()); } }
        if frame_no(end, req.fps_num, req.fps_den) <= frame_no(start, req.fps_num, req.fps_den) { return Ok(()); }
        let file = format!("{:08}.png", ev.len());
        if let Some((x, y, cw, ch)) = write_png(&dir.0, &file, &px, w as usize, h as usize)? { ev.push(BdnEvent { start, end, file, x, y, w: cw, h: ch }); }
        prev = Some(px);
        Ok(())
    }, &|| STOP.load(Ordering::SeqCst))?;
    drop(sub);
    if ev.is_empty() { return Err("ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ จึงไม่มีภาพให้ส่งออก".into()); }
    let bdn = write_bdn(&dir.0, &ev, vf, rate, base, req.fps_num, req.fps_den)?;
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = target.with_file_name(format!("{name}.{}.partial.sup", crate::cover::poster_image::unique()));
    let r = run_super(tools, &bdn, &tmp, &req.opts, out709, progress, &|| STOP.load(Ordering::SeqCst));
    if let Err(e) = r { let _ = std::fs::remove_file(&tmp); return Err(e); }
    if let Err(p) = crate::cover::rename::move_no_replace(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    let bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(PgsOut { path: target.display().to_string(), images: ev.len(), bytes, ..Default::default() })
}

// ---------------------------------------------------------------- ตัวสร้าง Subtitle Edit (SeConv)

/// SeConv ตัวแปลงซับแบบบรรทัดคำสั่งของ Subtitle Edit (fetch-tools แตกไว้ที่ tools\seconv)
/// พี่กันสั่ง 15 พ.ย. 2569 "เอามาด้วยก็ดีนะ เเต่ใส่หมายเหตุ เเละภาพตัวอย่างอยู่เเล้วว่ามันจะหายหมด เเต่ถ้าเอามาแปลงเเค่ srt ก็ใช้ได้"
/// วาดด้วยตัววาดของมันเอง (SkiaSharp) ไม่อ่านสไตล์ ตำแหน่ง และเอฟเฟกต์ของ ASS ใช้หน้าตาเดียวทั้งไฟล์ตามที่ตั้งในหน้าต่าง
pub fn seconv_exe(tools: &Path) -> PathBuf { tools.join("seconv").join("seconv.exe") }

/// ตัวเลือกหน้าตาซับของ SeConv · ขนาด ขอบ เงา ระยะ ในหน้าต่างคิดที่ภาพสูง 1080 ย่อขยายตามภาพจริง (ตัวเลือกของ SeConv เป็นจุดบนภาพ)
/// SeConv ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แท็ก <i> ในบรรทัดยังใช้ได้
fn seconv_style_args(st: &SrtStyle, h: u32) -> Vec<OsString> {
    let k = h.max(16) as f64 / 1080.0;
    let n = |v: f64| { let v = if v.is_finite() { (v * k).max(0.0) } else { 0.0 }; let s = format!("{v:.1}"); s.trim_end_matches('0').trim_end_matches('.').to_string() };
    let hex = |s: &str| { let x = s.trim().trim_start_matches('#'); if x.len() == 6 && x.chars().all(|c| c.is_ascii_hexdigit()) { x.to_uppercase() } else { "FFFFFF".into() } };
    let font = { let f = st.font.trim(); if f.is_empty() { "Tahoma" } else { f } };
    let shadow_a = (255.0 * st.shadow_opacity.min(100) as f64 / 100.0).round() as u8;
    let mut a: Vec<OsString> = vec![
        format!("--font-name:{font}").into(), format!("--font-size:{}", n(st.size)).into(), format!("--font-color:#{}", hex(&st.color)).into(),
        format!("--outline-color:#{}", hex(&st.outline_color)).into(), format!("--outline-width:{}", n(st.outline)).into(),
        format!("--shadow-color:#{shadow_a:02X}{}", hex(&st.shadow_color)).into(), format!("--shadow-width:{}", n(st.shadow)).into(),
        format!("--bottom-top-margin:{}", (st.margin_v.max(0.0) * k).round() as i64).into(),
        format!("--left-right-margin:{}", (st.margin_h.max(0.0) * k).round() as i64).into(),
        format!("--alignment:{}", ["bottom-left", "bottom-center", "bottom-right", "middle-left", "middle-center", "middle-right", "top-left", "top-center", "top-right"][st.align.clamp(1, 9) as usize - 1]).into(),
        format!("--content-alignment:{}", match st.content_align.as_str() { "left" | "right" | "from-alignment" => st.content_align.as_str(), _ => "center" }).into(),
        format!("--line-spacing:{}", st.line_spacing.clamp(0.0, 200.0).round() as i64).into(),
    ];
    if st.bold { a.push("--font-bold".into()); }
    if matches!(st.box_type.as_str(), "one-box" | "box-per-line") {
        let box_a = (255.0 * st.box_opacity.min(100) as f64 / 100.0).round() as u8;
        a.push(format!("--box-type:{}", st.box_type).into());
        a.push(format!("--background-color:#{box_a:02X}{}", hex(&st.box_color)).into());
        a.push(format!("--box-padding:{}", (st.box_padding.max(0.0) * k).round() as i64).into());
        a.push(format!("--background-corner-radius:{}", (st.box_radius.max(0.0) * k).round() as i64).into());
    }
    a
}

/// รัน SeConv ทำ .sup จากไฟล์ซับ input ลง out (ชื่อไฟล์ในโฟลเดอร์ของ out) · cancel บอกให้หยุด
fn run_seconv(tools: &Path, input: &Path, out: &Path, w: u32, h: u32, req: &PgsReq, cancel: &dyn Fn() -> bool) -> Result<(), String> {
    let (dir, name) = (out.parent().ok_or("ที่เก็บไม่ถูกต้อง")?, out.file_name().ok_or("ที่เก็บไม่ถูกต้อง")?.to_string_lossy().to_string());
    let (rate, _) = bdn_rate(req.fps_num, req.fps_den);
    let mut args: Vec<OsString> = vec![
        input.as_os_str().to_owned(), "bluraysup".into(), format!("--resolution:{w}x{h}").into(), format!("--fps:{rate}").into(),
        format!("--output-folder:{}", dir.display()).into(), format!("--output-filename:{name}").into(), "--overwrite".into(), "--quiet".into(),
    ];
    args.extend(seconv_style_args(&req.style.clone().unwrap_or_default(), h));
    let mut child = tool_command(&tools.join("seconv"), "seconv", &args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด SeConv ไม่ได้ {e}"))?;
    loop {
        if cancel() { let _ = child.kill(); let _ = child.wait(); return Err("stopped".into()); }
        match child.try_wait() {
            Ok(Some(st)) => {
                let mut msg = String::new();
                if let Some(mut s) = child.stdout.take() { let _ = s.read_to_string(&mut msg); }
                if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut msg); }
                if st.success() && out.exists() { return Ok(()); }
                let why = msg.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with(['│', '┌', '└', '─', '╭', '╰'])).last().unwrap_or("").to_string();
                return Err(format!("SeConv ทำไฟล์ไม่สำเร็จ {why}"));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(80)),
            Err(e) => return Err(format!("SeConv ทำไฟล์ไม่สำเร็จ {e}")),
        }
    }
}

/// นามสกุลของไฟล์ซับที่เขียนให้ SeConv อ่าน ตามชนิดของเอกสาร
fn kind_ext(kind: &str) -> &'static str { match kind { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" } }

/// จำนวนชุดที่มีภาพในไฟล์ .sup
pub fn shown_sets(b: &[u8]) -> usize {
    let (mut i, mut n) = (0, 0);
    while i + 13 <= b.len() && &b[i..i + 2] == b"PG" {
        let len = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        if b[i + 10] == 0x16 && len >= 11 && b.get(i + 13 + 10).is_some_and(|&c| c > 0) { n += 1; }
        i += 13 + len;
    }
    n
}

/// ตัวสร้าง SeConv · เขียนซับเป็นไฟล์ชั่วคราวชนิดเดิม แล้วให้ SeConv วาดและทำ .sup เอง
fn export_seconv(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, progress: &dyn Fn(usize, usize, &str)) -> Result<PgsOut, String> {
    if !seconv_exe(tools).exists() { return Err("ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือ".into()); }
    let target = PathBuf::from(&req.target);
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let input = work.join(format!("seconv-{}.{}", crate::cover::poster_image::unique(), kind_ext(&doc.kind)));
    std::fs::write(&input, crate::subtitle::subdoc::render(doc)).map_err(|e| e.to_string())?;
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let tmp = target.with_file_name(format!("{name}.{}.partial.sup", crate::cover::poster_image::unique()));
    progress(0, 1, "seconv");
    let r = run_seconv(tools, &input, &tmp, w, h, req, &|| STOP.load(Ordering::SeqCst));
    let _ = std::fs::remove_file(&input);
    if let Err(e) = r { let _ = std::fs::remove_file(&tmp); return Err(e); }
    progress(1, 1, "seconv");
    let images = std::fs::read(&tmp).map(|b| shown_sets(&b)).unwrap_or(0);
    if let Err(p) = crate::cover::rename::move_no_replace(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
    }
    let bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(PgsOut { path: target.display().to_string(), images, bytes, ..Default::default() })
}

// ---------------------------------------------------------------- ขนาดไฟล์ที่น่าจะได้

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsEstimate {
    /// จำนวนภาพที่คาด
    pub images: usize,
    /// ขนาดไฟล์ที่คาด ไบต์
    pub bytes: u64,
    /// ภาพที่วาดจริงเพื่อคิด
    pub sampled: usize,
}

/// คาดขนาดไฟล์ · วาดภาพจริงไม่เกิน 8 ภาพกระจายทั้งเรื่อง ทำเป็นชุดภาพของ PGS แล้วเอาขนาดเฉลี่ยคูณจำนวนภาพ (พี่กันสั่ง 15 พ.ย. 2569 "เขียนขนาดไฟล์ซับที่น่าจะได้ด้วย")
/// SUPer เปลี่ยนจานสีแทนวาดภาพใหม่ตอนเอฟเฟกต์ ภาพของบรรทัดเคลื่อนไหวคิดราว 30% (ซับทดสอบ 4.9 MB เหลือ 1.8 MB) · SeConv หนึ่งภาพต่อหนึ่งบรรทัด เอฟเฟกต์หาย
pub fn estimate(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, cancel: &dyn Fn() -> bool) -> Result<PgsEstimate, String> {
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let prep = prepare(doc, req);
    let d = &prep.doc;
    let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
    let pts = change_points(d, frame_ms);
    let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(d, pts[i])).collect();
    if need.is_empty() { return Ok(PgsEstimate::default()); }
    let anim_at = |t: i64| d.events.iter().any(|e| !e.comment && e.start <= t && t < e.end && animated(&e.text));
    let seconv = req.engine == "seconv";
    // SeConv ไม่วาดเอฟเฟกต์ เลือกเฉพาะจุดเริ่มของบรรทัด
    let pool: Vec<i64> = if seconv { need.iter().map(|&i| pts[i]).filter(|&t| d.events.iter().any(|e| !e.comment && e.start == t)).collect() } else { need.iter().map(|&i| pts[i]).collect() };
    let pool = if pool.is_empty() { need.iter().map(|&i| pts[i]).collect() } else { pool };
    let n = pool.len().min(8);
    let times: Vec<i64> = (0..n).map(|k| pool[k * pool.len() / n]).collect();
    let (_, coef709) = matrices(&req.opts, h, prep.tv601);
    let enc = Enc::of(&req.opts);
    let sub = crate::subtitle::subshot::TmpSub::new(work, d)?;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let mut sizes: Vec<(i64, usize)> = vec![];
    let mut pal_lens: Vec<usize> = vec![];
    render_all(tools, &sub.0, fonts.as_deref(), w, h, &times, &mut |k: usize, buf: &[u8]| {
        if let Some(im) = image_of(buf, w as usize, h as usize, &enc) { pal_lens.push(im.palette.len()); sizes.push((times[k], show_set(0, 0, w as u16, h as u16, 0x10, &im, coef709).len())); }
        Ok(())
    }, cancel)?;
    // บรรทัดที่เฟดอย่างเดียว ตัวสร้างชั้นหนังส่งภาพเต็มครั้งเดียว เฟรมช่วงเฟดเปลี่ยนแค่จานสี เฟรมกลางที่ภาพไม่เปลี่ยนไม่เขียน (BUGS ข้อ 126)
    // ชุดเปลี่ยนจานสีราว หัวสามส่วน 39 ไบต์ PCS 19 ไบต์บวก 8 ต่อภาพ PDS 2 ไบต์บวก 5 ต่อสี
    let avg_pal = if pal_lens.is_empty() { 64.0 } else { pal_lens.iter().sum::<usize>() as f64 / pal_lens.len() as f64 };
    let pal_set = 39.0 + 27.0 + 2.0 + 5.0 * avg_pal;
    let fade_ev: Vec<(i64, i64, i64, i64)> = d.events.iter().filter(|e| !e.comment && e.end > e.start)
        .filter_map(|e| fade_of(&e.text).filter(|f| f.0 > 0 || f.1 > 0).map(|(fi, fo)| (e.start, e.end, fi, fo))).collect();
    let in_fade_ev = |t: i64| fade_ev.iter().any(|f| t >= f.0 && t < f.1);
    let in_fading = |t: i64| fade_ev.iter().any(|f| t >= f.0 && t < f.1 && (t < f.0 + f.2 || t >= f.1 - f.3));
    let avg = |anim: Option<bool>| { let v: Vec<usize> = sizes.iter().filter(|(t, _)| anim.is_none_or(|a| anim_at(*t) == a)).map(|x| x.1).collect(); if v.is_empty() { None } else { Some(v.iter().sum::<usize>() as f64 / v.len() as f64) } };
    let all = avg(None).unwrap_or(0.0);
    // ชุดล้างจอราว 40 ไบต์ต่อครั้ง
    let clears = d.events.iter().filter(|e| !e.comment && e.end > e.start).count() as f64 * 40.0;
    let (images, bytes) = if seconv {
        let lines = d.events.iter().filter(|e| !e.comment && e.end > e.start).count();
        (lines, lines as f64 * all + clears)
    } else {
        let (na, ns) = need.iter().fold((0usize, 0usize), |(a, s), &i| if anim_at(pts[i]) { (a + 1, s) } else { (a, s + 1) });
        let (sa, ss) = (avg(Some(true)).unwrap_or(all), avg(Some(false)).unwrap_or(all));
        if req.engine == "super" {
            (ns + (na as f64 * 0.3).round() as usize, ns as f64 * ss + na as f64 * sa * 0.3 + clears)
        } else {
            // ชั้นหนัง · เฟรมของบรรทัดเฟด แยกออกจากเฟรมเคลื่อนไหวอื่น
            let nf = need.iter().filter(|&&i| in_fading(pts[i])).count();
            let nfe = need.iter().filter(|&&i| anim_at(pts[i]) && in_fade_ev(pts[i])).count();
            let other = na.saturating_sub(nfe);
            let images = ns + other + fade_ev.len() + nf;
            (images, ns as f64 * ss + other as f64 * sa + fade_ev.len() as f64 * ss + nf as f64 * pal_set + clears)
        }
    };
    Ok(PgsEstimate { images, bytes: bytes.round() as u64, sampled: sizes.len() })
}

static EST_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn pgs_estimate(app: AppHandle, doc: SubDoc, req: PgsReq) -> Result<PgsEstimate, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    let my = EST_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || estimate(&tools, &work, &doc, &req, &|| EST_GEN.load(Ordering::SeqCst) != my)).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- ภาพตัวอย่างกับเทียบสี

/// สีหลักสีหนึ่งของซับ ASS กับสีเดียวกันใน PGS
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ColorPair {
    /// #RRGGBB
    pub ass: String,
    pub pgs: String,
    /// ความต่างของสีแบบ ΔE (CIE76) · ไม่ถึง 2 ตาแทบมองไม่ออก
    pub de: f64,
    /// สัดส่วนของจุดทึบในซับ (%)
    pub share: f64,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsPreview {
    /// ภาพซับ ASS แบบที่ตัวเล่นแสดง ครอปเฉพาะบริเวณซับ PNG แบบ data URL · ซับ SRT ไม่มี
    pub ass: Option<String>,
    /// ภาพ PGS ที่จะได้ บริเวณเดียวกัน
    pub pgs: String,
    /// ภาพ PGS บริเวณเดียวกันแบบพื้นโปร่งใส (PNG มีความโปร่งใส) ให้หน้าจอวางบนพื้นมืดกับพื้นสว่างเอง (ใช้กับ SRT)
    pub pgs_alpha: String,
    pub w: u32,
    pub h: u32,
    pub colors: Vec<ColorPair>,
    /// ต่างเฉลี่ยต่อช่องสีในบริเวณซับ (0 ถึง 255) กับต่างมากสุด
    pub mean: f64,
    pub max: u32,
    /// สีในภาพก่อนลด กับสีในจานสีของ PGS
    pub before: usize,
    pub after: usize,
    /// พื้นหลังเป็นภาพหนัง (movie) หรือพื้นเทา (plain)
    pub bg: String,
    /// เวลานั้นไม่มีซับบนภาพ
    pub empty: bool,
    /// ซับบอก TV.601 และคิดสีแบบตัวเล่นอยู่
    pub mangled: bool,
}

fn lab(c: [u8; 3]) -> [f64; 3] {
    let lin = |v: u8| { let v = v as f64 / 255.0; if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) } };
    let (r, g, b) = (lin(c[0]), lin(c[1]), lin(c[2]));
    let (x, y, z) = ((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    let f = |t: f64| if t > 0.008856 { t.cbrt() } else { 7.787 * t + 16.0 / 116.0 };
    [116.0 * f(y) - 16.0, 500.0 * (f(x) - f(y)), 200.0 * (f(y) - f(z))]
}
/// ΔE แบบ CIE76
pub fn delta_e(a: [u8; 3], b: [u8; 3]) -> f64 { let (p, q) = (lab(a), lab(b)); ((p[0] - q[0]).powi(2) + (p[1] - q[1]).powi(2) + (p[2] - q[2]).powi(2)).sqrt() }
fn hex(c: [u8; 3]) -> String { format!("#{:02X}{:02X}{:02X}", c[0], c[1], c[2]) }

/// ภาพหนังที่เวลา t ขนาด w × h แบบ RGB · อ่านไม่ได้ได้ None (ใช้พื้นเทาแทน)
fn movie_rgb(tools: &Path, movie: &str, t: i64, w: u32, h: u32) -> Option<Vec<u8>> {
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.3}", t.max(0) as f64 / 1000.0).into(), "-i".into(), movie.into(),
        "-frames:v".into(), "1".into(), "-vf".into(), format!("scale={w}:{h}").into(), "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into()];
    let o = crate::app::tools::run_tool_timeout(tools, "ffmpeg", &args, std::time::Duration::from_secs(20)).ok()?;
    (o.status.success() && o.stdout.len() == (w * h * 3) as usize).then_some(o.stdout)
}

/// ภาพสองภาพ (สีแบบไม่คูณความโปร่งใส) วางบนพื้น ครอปบริเวณที่มีซับ แล้วเทียบสี
pub fn compare(asspx: &[u8], pgspx: &[u8], bg: &[u8], w: usize, h: usize) -> (Option<(Vec<u8>, Vec<u8>, Vec<u8>, usize, usize)>, Vec<ColorPair>, f64, u32) {
    let (mut x0, mut y0, mut x1, mut y1) = (w, h, 0, 0);
    for y in 0..h { for x in 0..w { let i = (y * w + x) * 4; if asspx[i + 3] > 0 || pgspx[i + 3] > 0 { x0 = x0.min(x); x1 = x1.max(x); y0 = y0.min(y); y1 = y1.max(y); } } }
    if x0 > x1 { return (None, vec![], 0.0, 0); }
    let pad = 16;
    let (x0, y0, x1, y1) = (x0.saturating_sub(pad), y0.saturating_sub(pad), (x1 + pad).min(w - 1), (y1 + pad).min(h - 1));
    let (cw, ch) = (x1 + 1 - x0, y1 + 1 - y0);
    let over = |fg: &[u8], i: usize, j: usize| -> [u8; 3] { let a = fg[i + 3] as u32; [0, 1, 2].map(|k| ((fg[i + k] as u32 * a + bg[j + k] as u32 * (255 - a) + 127) / 255) as u8) };
    let (mut ia, mut ip) = (Vec::with_capacity(cw * ch * 3), Vec::with_capacity(cw * ch * 3));
    let mut alpha = Vec::with_capacity(cw * ch * 4);
    for y in y0..=y1 { alpha.extend_from_slice(&pgspx[(y * w + x0) * 4..(y * w + x1 + 1) * 4]); }
    let (mut sum, mut n, mut max) = (0u64, 0u64, 0u32);
    let mut groups: HashMap<[u8; 3], HashMap<[u8; 3], u32>> = HashMap::new();
    let mut opaque = 0u32;
    for y in y0..=y1 { for x in x0..=x1 {
        let (i, j) = ((y * w + x) * 4, (y * w + x) * 3);
        let (a, p) = (over(asspx, i, j), over(pgspx, i, j));
        ia.extend_from_slice(&a);
        ip.extend_from_slice(&p);
        for k in 0..3 { let d = (a[k] as i32 - p[k] as i32).unsigned_abs(); sum += d as u64; max = max.max(d); }
        n += 3;
        if asspx[i + 3] == 255 {
            opaque += 1;
            *groups.entry([asspx[i], asspx[i + 1], asspx[i + 2]]).or_default().entry([pgspx[i], pgspx[i + 1], pgspx[i + 2]]).or_insert(0) += 1;
        }
    } }
    let mut g: Vec<([u8; 3], u32, [u8; 3])> = groups.into_iter().map(|(c, m)| { let tot = m.values().sum(); let best = m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or(c); (c, tot, best) }).collect();
    g.sort_by(|a, b| b.1.cmp(&a.1));
    let pairs = g.into_iter().take(6).filter(|x| opaque > 0 && x.1 as f64 / opaque as f64 >= 0.01)
        .map(|(c, cnt, p)| ColorPair { ass: hex(c), pgs: hex(p), de: (delta_e(c, p) * 10.0).round() / 10.0, share: (cnt as f64 * 1000.0 / opaque as f64).round() / 10.0 }).collect();
    (Some((ia, ip, alpha, cw, ch)), pairs, if n > 0 { sum as f64 / n as f64 } else { 0.0 }, max)
}

fn png_rgba_url(rgba: Vec<u8>, w: usize, h: usize) -> Result<String, String> {
    let img = image::RgbaImage::from_raw(w as u32, h as u32, rgba).ok_or("ทำภาพตัวอย่างไม่ได้")?;
    let mut v = std::io::Cursor::new(Vec::new());
    img.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&v.into_inner())))
}

fn png_url(rgb: Vec<u8>, w: usize, h: usize) -> Result<String, String> {
    let img = image::RgbImage::from_raw(w as u32, h as u32, rgb).ok_or("ทำภาพตัวอย่างไม่ได้")?;
    let mut v = std::io::Cursor::new(Vec::new());
    img.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&v.into_inner())))
}

/// ภาพตัวอย่างหนึ่งเวลา · ASS ได้ภาพ ASS ตอนเล่นเทียบกับ PGS ที่จะได้พร้อมสีหลักทีละสี · SRT ได้ภาพ PGS ตามสไตล์ที่ตั้ง
/// sample คือประโยคตัวอย่างที่พิมพ์เอง แทนบรรทัดของไฟล์ (ใช้กับ SRT) · cancel บอกว่ามีคำขอภาพใหม่แล้ว ภาพตัวอย่างของ SUPer ปิด SUPer ตัวเก่าทิ้ง
pub fn preview(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, at: i64, sample: Option<&str>, cancel: &dyn Fn() -> bool) -> Result<PgsPreview, String> {
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let is_ass = doc.kind == "ass" || doc.kind == "ssa";
    let mut prep = prepare(doc, req);
    let mut at = at.max(0);
    if let Some(s) = sample.filter(|s| !s.trim().is_empty() && !is_ass) {
        prep.doc.events = vec![crate::subtitle::subdoc::Event { id: 1, start: 0, end: 10_000, style: "Default".into(), text: crate::subtitle::subdoc::srt_to_ass_text(s), ..Default::default() }];
        at = 5_000;
    }
    let (out709, coef709) = matrices(&req.opts, h, prep.tv601);
    let mangle = req.opts.vsfilter && prep.tv601 && out709;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let buf = render_one(tools, work, &prep.doc, fonts.as_deref(), w, h, at)?;
    let (wu, hu) = (w as usize, h as usize);
    let asspx = straight_px(&buf, mangle, 0.0);
    let (pgspx, before, after) = if req.engine == "super" {
        let (vf, (rate, base)) = (video_format(w, h, req.fps_num, req.fps_den).ok_or("SUPer รับเฉพาะขนาดภาพของ Blu-ray")?, bdn_rate(req.fps_num, req.fps_den));
        if !super_exe(tools).exists() { return Err("ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือ".into()); }
        let dir = TmpDir(work.join(format!("pgs-prev-{}", crate::cover::poster_image::unique())));
        std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
        let px = straight_px(&buf, mangle, req.opts.vivid.min(100) as f64 / 100.0);
        let Some((x, y, cw, ch)) = write_png(&dir.0, "00000000.png", &px, wu, hu)? else { return Ok(PgsPreview { empty: true, ..Default::default() }) };
        let f = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
        let s = (frame_no(at, req.fps_num, req.fps_den) as f64 * f).round() as i64;
        let ev = [BdnEvent { start: s, end: s + (f * 24.0) as i64, file: "00000000.png".into(), x, y, w: cw, h: ch }];
        let bdn = write_bdn(&dir.0, &ev, vf, rate, base, req.fps_num, req.fps_den)?;
        let out = dir.0.join("prev.sup");
        run_super(tools, &bdn, &out, &req.opts, out709, &|_, _, _| {}, cancel)?;
        let b = std::fs::read(&out).map_err(|e| e.to_string())?;
        let t0 = first_shown(&b).unwrap_or(0);
        let dec = decode_at(&b, t0, wu, hu, out709);
        let after = { let mut s = std::collections::HashSet::new(); for p in dec.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        let before = { let mut s = std::collections::HashSet::new(); for p in px.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        (dec, before, after)
    } else if req.engine == "seconv" {
        // ภาพที่ SeConv วาดจริง · ไฟล์ซับเล็ก ๆ ที่มีแค่บรรทัดที่ขึ้นตอนนั้น (หรือประโยคตัวอย่าง) ชนิดเดียวกับไฟล์เดิม แล้วถอดไฟล์ .sup ที่ได้
        if !seconv_exe(tools).exists() { return Err("ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือ".into()); }
        let mut mini = doc.clone();
        match sample.filter(|s| !s.trim().is_empty() && !is_ass) {
            Some(s) => {
                mini = crate::subtitle::subdoc::parse_doc(format!("1\r\n00:00:00,000 --> 00:00:10,000\r\n{}\r\n", s.trim()).as_bytes(), "srt", None);
            }
            None => mini.events.retain(|e| !e.comment && e.start <= at && at < e.end),
        }
        if mini.events.is_empty() { return Ok(PgsPreview { empty: true, ..Default::default() }); }
        let dir = TmpDir(work.join(format!("pgs-prev-{}", crate::cover::poster_image::unique())));
        std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
        let input = dir.0.join(format!("prev.{}", kind_ext(&mini.kind)));
        std::fs::write(&input, crate::subtitle::subdoc::render(&mini)).map_err(|e| e.to_string())?;
        let out = dir.0.join("prev.sup");
        run_seconv(tools, &input, &out, w, h, req, cancel)?;
        let b = std::fs::read(&out).map_err(|e| e.to_string())?;
        let dec = decode_at(&b, first_shown(&b).unwrap_or(0), wu, hu, out709);
        let count = |px: &[u8]| { let mut s = std::collections::HashSet::new(); for p in px.chunks_exact(4) { if p[3] > 0 { s.insert([p[0], p[1], p[2], p[3]]); } } s.len() };
        let before = count(&asspx);
        let after = count(&dec);
        (dec, before, after)
    } else {
        match image_of(&buf, wu, hu, &Enc::of(&req.opts)) {
            Some(img) => { let after = img.palette.len() - 1; (image_rgba(&img, wu, hu, coef709, out709), img.colors, after) }
            None => return Ok(PgsPreview { empty: true, ..Default::default() }),
        }
    };
    let movie_bg = req.movie.as_deref().filter(|m| !m.is_empty() && is_ass).and_then(|m| movie_rgb(tools, m, at, w, h));
    let bg_kind = if movie_bg.is_some() { "movie" } else { "plain" };
    let bg = movie_bg.unwrap_or_else(|| vec![0x5a; wu * hu * 3]);
    let (crop, colors, mean, max) = compare(&asspx, &pgspx, &bg, wu, hu);
    let Some((ia, ip, alpha, cw, ch)) = crop else { return Ok(PgsPreview { empty: true, ..Default::default() }) };
    Ok(PgsPreview {
        ass: if is_ass { Some(png_url(ia, cw, ch)?) } else { None },
        pgs: png_url(ip, cw, ch)?, pgs_alpha: png_rgba_url(alpha, cw, ch)?, w: cw as u32, h: ch as u32,
        colors: if is_ass { colors } else { vec![] }, mean: (mean * 100.0).round() / 100.0, max, before, after, bg: bg_kind.into(), empty: false, mangled: mangle,
    })
}

/// เลขของคำขอภาพตัวอย่างล่าสุด · ปรับค่าเร็ว ๆ แล้วไม่มี SUPer หลายตัวรันซ้อนกัน (เครื่องพี่กันแรม 8 GB)
static PREVIEW_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn pgs_preview(app: AppHandle, doc: SubDoc, req: PgsReq, at: i64, sample: Option<String>) -> Result<PgsPreview, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    let my = PREVIEW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || preview(&tools, &work, &doc, &req, at, sample.as_deref(), &|| PREVIEW_GEN.load(Ordering::SeqCst) != my)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PgsEngines {
    /// มี SUPer ในโฟลเดอร์เครื่องมือ
    pub super_ok: bool,
    /// มี SeConv ของ Subtitle Edit ในโฟลเดอร์เครื่องมือ
    pub seconv_ok: bool,
}

/// ตัวสร้าง PGS ที่ใช้ได้ในเครื่องนี้
#[tauri::command]
pub fn pgs_engines(app: AppHandle) -> Result<PgsEngines, String> {
    let tools = tools_dir(&app)?;
    Ok(PgsEngines { super_ok: super_exe(&tools).exists(), seconv_ok: seconv_exe(&tools).exists() })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rle_matches_pgs_rules() {
        // แถวเดียว 2 โปร่งใส 1 สี 5 · 70 จุดสี 7 · 64 โปร่งใส
        let mut px = vec![0u8, 0, 5];
        px.extend(std::iter::repeat_n(7u8, 70));
        px.extend(std::iter::repeat_n(0u8, 64));
        let w = px.len();
        let r = rle(&px, w, 1);
        assert_eq!(r, vec![0, 2, 5, 0, 0xC0, 70, 7, 0, 0x40, 64, 0, 0]);
        // สีเดียวกันสามจุดใช้แบบนับจำนวน สองจุดเขียนตรง
        assert_eq!(rle(&[3, 3, 4, 4, 4], 5, 1), vec![3, 3, 0, 0x83, 4, 0, 0]);
    }

    #[test]
    fn animated_tags_only_inside_braces() {
        assert!(animated("{\\fad(200,200)}สวัสดี"));
        assert!(animated("{\\k20}คา{\\kf30}รา"));
        assert!(animated("{\\move(10,10,100,100)}x"));
        assert!(!animated("{\\pos(10,10)\\b1}ตัวหนา"));
        assert!(!animated("ข้อความ \\t( ที่ไม่ได้อยู่ในแท็ก"));
    }

    #[test]
    fn straight_undoes_premultiplied_edges() {
        let c = straight(&[70, 70, 70, 76]).to_le_bytes();
        assert_eq!(c, [235, 235, 235, 76], "ขอบตัวอักษรขาวที่ ffmpeg คูณความโปร่งใสมา หารกลับเป็นขาว");
        assert_eq!(straight(&[10, 20, 30, 255]).to_le_bytes(), [10, 20, 30, 255]);
        assert_eq!(straight(&[200, 0, 0, 100]).to_le_bytes()[0], 255, "เกิน 255 ตัดที่ 255");
    }

    #[test]
    fn ycrcb_white_black_red() {
        assert_eq!(ycrcb(255, 255, 255, true), (235, 128, 128));
        assert_eq!(ycrcb(0, 0, 0, true), (16, 128, 128));
        let (y, cr, cb) = ycrcb(255, 0, 0, true);
        assert_eq!((y, cr, cb), (63, 240, 102));
    }

    #[test]
    fn two_groups_and_merge() {
        let used = [false, true, true, false, false, true, false, true, true, false];
        let (g, m) = row_groups(&used, 2);
        assert!(m, "สามกลุ่มต้องรวม");
        assert_eq!(g, vec![(1, 2), (5, 8)]);
    }

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    /// ส่วนของไฟล์ .sup เป็นรายการ (เวลา ms, ชนิด, ข้อมูล)
    fn segments(b: &[u8]) -> Vec<(u32, u8, Vec<u8>)> {
        let mut out = vec![];
        let mut i = 0;
        while i + 13 <= b.len() {
            assert_eq!(&b[i..i + 2], b"PG", "หัวส่วนที่ไบต์ {i}");
            let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) / 90;
            let kind = b[i + 10];
            let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
            out.push((pts, kind, b[i + 13..i + 13 + n].to_vec()));
            i += 13 + n;
        }
        assert_eq!(i, b.len(), "ไฟล์จบพอดีส่วนสุดท้าย");
        out
    }

    /// ภาพ RGB ทั้งจอที่เวลา t วินาที บนพื้นดำ · sup ซ้อนด้วย overlay ของ ffmpeg หรือวาดซับ ASS ด้วย libass
    fn frame(input: &[OsString], vf: &str, w: u32, h: u32, t: f64) -> Vec<u8> {
        let mut a: Vec<OsString> = ["-v", "error", "-f", "lavfi", "-i"].iter().map(OsString::from).collect();
        a.push(format!("color=c=black:s={w}x{h}:r=25:d=6").into());
        a.extend(input.iter().cloned());
        a.extend(["-filter_complex".into(), vf.into(), "-ss".into(), format!("{t:.3}").into(), "-frames:v".into(), "1".into(), "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into()]);
        let o = crate::app::tools::run_tool(&tools(), "ffmpeg", &a).unwrap();
        assert!(o.status.success(), "ffmpeg {}", String::from_utf8_lossy(&o.stderr));
        assert_eq!(o.stdout.len(), (w * h * 3) as usize);
        o.stdout
    }

    #[test]
    fn export_real_sup_matches_libass() {
        let dir = std::env::temp_dir().join(format!("movie-shelf-pgs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // สีเหลืองขอบน้ำเงิน ไว้ดูว่าสีแปลง YCbCr ถูกแบบ (ขาวดำแปลงแบบไหนก็ได้ค่าเดิม)
        let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,60,&H0000FFFF,&H000000FF,&H00FF0000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Bottom line\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8}Top sign\r\nDialogue: 0,0:00:03.00,0:00:03.50,Default,,0,0,0,,{\\fad(300,0)}Fade\r\n";
        let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
        assert_eq!(doc.events.len(), 3);
        let target = dir.join("out.sup");
        let req = PgsReq { target: target.display().to_string(), w: 1280, h: 720, fps_num: 24000, fps_den: 1001, movie: None, ..Default::default() };
        let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        assert_eq!(r.bytes as usize, b.len());
        let seg = segments(&b);
        // ชุดแสดงภาพ (PCS ที่มีภาพ) กับชุดล้างจอ (PCS ไม่มีภาพ) ตามเวลา
        let pcs: Vec<(u32, u8)> = seg.iter().filter(|s| s.1 == 0x16).map(|s| (s.0, s.2[10])).collect();
        assert_eq!(pcs[0], (500, 1), "0.5 วินาที บรรทัดล่างหนึ่งกรอบ {pcs:?}");
        assert_eq!(pcs[1], (1000, 2), "1 วินาที บรรทัดล่างกับป้ายบนสองกรอบ {pcs:?}");
        assert_eq!(pcs[2], (2000, 0), "2 วินาที ล้างจอ {pcs:?}");
        let fade: Vec<&(u32, u8)> = pcs.iter().filter(|p| p.0 >= 3000 && p.0 < 3500 && p.1 > 0).collect();
        assert!(fade.len() >= 5, "บรรทัดเฟดวาดทุกเฟรม ได้ {} ภาพ", fade.len());
        assert_eq!(*pcs.last().unwrap(), (3500, 0), "จบเฟดล้างจอ");
        // ชุดแรกเป็นจุดเริ่มชุดใหม่ ชุดล้างจอเป็นแบบปกติ · รหัสอัตราเฟรม 23.976
        let first = &seg.iter().find(|s| s.1 == 0x16).unwrap().2;
        assert_eq!((first[0..2].to_vec(), first[4], first[7]), (1280u16.to_be_bytes().to_vec(), 0x10, 0x80));
        assert!(r.images >= 8 && r.max_colors > 0, "{r:?}");
        // ffmpeg ถอดไฟล์ได้ และภาพตรงกับที่ libass วาด สีเหลืองยังเหลือง (ค่าต่างเฉลี่ยต่ำ)
        // -copyts ให้ใช้เวลาเดิมของไฟล์ ไม่งั้น ffmpeg ขยับไฟล์ที่เริ่ม 0.5 วินาทีให้เริ่มที่ศูนย์ ภาพขึ้นเร็วไปครึ่งวินาที
        let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
        let a = frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, 1.5);
        let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
        let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
        let l = frame(&[], &vf, 1280, 720, 1.5);
        let lit = |v: &[u8]| v.chunks(3).filter(|p| p[0] as u32 + p[1] as u32 + p[2] as u32 > 60).count();
        assert!(lit(&l) > 2000, "libass วาดซับขึ้น");
        let diff: u64 = a.iter().zip(&l).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as u64).sum();
        let mean = diff as f64 / a.len() as f64;
        assert!(mean < 1.5, "ภาพจาก .sup ต่างจาก libass เฉลี่ย {mean:.2} ต่อช่องสี");
        // จุดเหลือง (แดงเขียวสูง น้ำเงินต่ำ) มีในภาพจาก .sup ราวเท่าของ libass
        let yellow = |v: &[u8]| v.chunks(3).filter(|p| p[0] > 200 && p[1] > 200 && p[2] < 80).count();
        let (ya, yl) = (yellow(&a), yellow(&l));
        assert!(ya as f64 > yl as f64 * 0.8, "สีเหลืองจาก .sup {ya} จุด libass {yl} จุด");
        drop(sub);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// เวลาภาพของบรรทัดเคลื่อนไหวต้องไม่เลยเวลาเฟรมของหนัง ตัวเล่นเลือกภาพที่เวลาไม่เกินเฟรม เลยไปเศษมิลลิวินาทีเดียวภาพขึ้นช้าหนึ่งเฟรม
    /// เดิมปัดใกล้สุด เฟรม 138 ที่ 23.976 (5,755.7 ms) ได้ 5,756 ข้อความเลื่อนช้าหนึ่งเฟรม (19 จุด) เจอตอนเทียบเครื่องมือ PGS 14 พ.ย. 2569
    #[test]
    fn animation_points_never_after_frame_time() {
        let ass = "[Script Info]\r\nPlayResX: 320\r\nPlayResY: 180\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,{\\move(0,0,100,0)}A\r\n";
        let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
        let f = 1001.0 / 24.0;
        let pts = change_points(&doc, f);
        let late: Vec<i64> = pts.iter().copied().filter(|&t| t > 5000 && t < 7000).filter(|&t| { let k = (t as f64 / f).round(); t as f64 > k * f }).collect();
        assert!(late.is_empty(), "เวลาภาพที่เลยเวลาเฟรม {late:?}");
        assert!(pts.contains(&5755), "เฟรม 138 ต้องเป็น 5755 {:?}", &pts[..pts.len().min(8)]);
    }

    /// บรรทัดเคลื่อนไหวยาว 5 วินาทีได้ราว 120 ภาพ · ffmpeg อ่านนิพจน์เวลาได้ไม่ถึง 100 ส่วน เดิมชุดละ 250 ภาพจึงล้ม "Cannot allocate memory" (เจอตอนเทียบเครื่องมือ PGS 14 พ.ย. 2569)
    #[test]
    fn export_long_animation_over_100_frames() {
        let dir = std::env::temp_dir().join(format!("movie-shelf-pgs-long-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 320\r\nPlayResY: 180\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(40,90,280,90)}Move\r\n";
        let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
        let target = dir.join("long.sup");
        let req = PgsReq { target: target.display().to_string(), w: 320, h: 180, fps_num: 24000, fps_den: 1001, movie: None, ..Default::default() };
        let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
        assert!(r.images > 100, "ภาพเคลื่อนที่ทุกเฟรมเกิน 100 ภาพ ได้ {}", r.images);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ส่งออกไฟล์ซับ PGS_IN เป็น PGS_OUT ขนาด PGS_W × PGS_H (ค่าตั้งต้น 1920 × 1080) 23.976 fps ไว้เทียบกับเครื่องมือ PGS ตัวอื่น
    /// ไม่รันในชุดปกติ · รันเอง `cargo test --lib export_file_from_env -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn export_file_from_env() {
        let (Ok(src), Ok(out)) = (std::env::var("PGS_IN"), std::env::var("PGS_OUT")) else { return; };
        let hint = if src.to_lowercase().ends_with(".srt") { "srt" } else { "ass" };
        let doc = crate::subtitle::subdoc::parse_doc(&std::fs::read(&src).unwrap(), hint, None);
        let num = |k: &str, d: u32| std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d);
        let work = std::env::temp_dir().join(format!("movie-shelf-pgs-env-{}", std::process::id()));
        std::fs::create_dir_all(&work).unwrap();
        // PGS_ENGINE=super ใช้ SUPer · PGS_DITHER=1 กระจายจุดสี · PGS_COLORS จำนวนสี
        let mut opts = PgsOpts { dither: std::env::var("PGS_DITHER").is_ok_and(|v| v == "1"), ..Default::default() };
        opts.colors = num("PGS_COLORS", 255) as u16;
        let req = PgsReq { target: out, w: num("PGS_W", 1920), h: num("PGS_H", 1080), fps_num: 24000, fps_den: 1001, movie: None, engine: std::env::var("PGS_ENGINE").unwrap_or_default(), opts, style: None };
        let t = std::time::Instant::now();
        let r = export(&tools(), &work, &doc, &req, &|_, _, _| {}).unwrap();
        println!("ผล {r:?} ใช้เวลา {:.1} วินาที", t.elapsed().as_secs_f64());
        let _ = std::fs::remove_dir_all(&work);
    }

    #[test]
    fn reduce_keeps_at_most_k() {
        let mut h = HashMap::new();
        for i in 0..1000u32 { h.insert(u32::from_le_bytes([(i % 256) as u8, (i / 4) as u8, 50, 255]), 1 + i % 3); }
        let (pal, map) = reduce(h, 255);
        assert!(pal.len() <= 255);
        assert_eq!(map.len(), 1000);
        assert!(map.values().all(|&v| v >= 1 && (v as usize) <= pal.len()));
    }

    // ---------------------------------------------------------------- สีตรง ตัวเลือกปรับแต่ง สไตล์ SRT ภาพตัวอย่าง SUPer (พี่กันสั่ง 14 พ.ย. 2569)

    /// ซับสีเหลือง 255,215,0 ตัวหนาใหญ่ ไม่มีขอบ · matrix คือบรรทัด YCbCr Matrix (ว่างคือไม่มีบรรทัดนี้)
    fn yellow_ass(matrix: &str) -> SubDoc {
        let m = if matrix.is_empty() { String::new() } else { format!("YCbCr Matrix: {matrix}\r\n") };
        let ass = format!("[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\n{m}ScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,120,&H0000D7FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,MMMM\r\n");
        crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None)
    }
    /// สีที่เจอมากที่สุดของจุดที่ทึบเต็มที่ (RGBA ไม่คูณความโปร่งใส)
    fn top_color(px: &[u8]) -> [u8; 3] {
        let mut m: HashMap<[u8; 3], u32> = HashMap::new();
        for p in px.chunks_exact(4) { if p[3] == 255 { *m.entry([p[0], p[1], p[2]]).or_insert(0) += 1; } }
        m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or([0, 0, 0])
    }
    fn near(a: [u8; 3], b: [u8; 3], tol: i32) -> bool { (0..3).all(|k| (a[k] as i32 - b[k] as i32).abs() <= tol) }
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("movie-shelf-pgs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }
    fn req_at(target: &Path, w: u32, h: u32) -> PgsReq {
        PgsReq { target: target.display().to_string(), w, h, fps_num: 24000, fps_den: 1001, ..Default::default() }
    }

    /// ต้นเหตุสีหม่น (พี่กันถาม 14 พ.ย. 2569 "เราปรับให้ตัวที่สีหม่น สีสดขึ้นได้ไหม") · ffmpeg วาดซับ TV.709 ลงภาพ RGB แล้วบีบสีเหลือ 16 ถึง 235
    /// เดิมสีเหลือง 255,215,0 ออกมา 235,201,16 · ตอนนี้ถอดด้วย ffmpeg (ตัวถอดของคนอื่น) ต้องได้สีตามสไตล์
    #[test]
    fn style_color_exact_for_tv709_script() {
        let dir = tmp("exact");
        let target = dir.join("y.sup");
        export(&tools(), &dir, &yellow_ass("TV.709"), &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        let mine = top_color(&decode_at(&b, 1000, 1280, 720, true));
        assert!(near(mine, [255, 215, 0], 2), "ตัวถอดของโปรแกรมได้ {mine:?}");
        // ffmpeg ถอดแล้ววางบนพื้นดำแบบ RGB
        let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
        let f = frame(&sup_in, "[0:v]format=rgb24[b];[b][1:s]overlay=format=rgb", 1280, 720, 1.0);
        let mut m: HashMap<[u8; 3], u32> = HashMap::new();
        for p in f.chunks(3) { if p[0] as u32 + p[1] as u32 > 200 { *m.entry([p[0], p[1], p[2]]).or_insert(0) += 1; } }
        let ff = m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap();
        assert!(near(ff, [255, 215, 0], 3), "ffmpeg ถอดได้ {ff:?} (โค้ดเดิมได้ราว 235,201,16)");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// เงาสีดำทึบครึ่งเดียว (&H80) ต้องได้ความทึบราว 128 · เดิมวาดด้วยโหมดพื้นโปร่งใสของ ffmpeg ได้ราว 64 เงา ภาพเฟด ขอบเรืองแสงจางกว่าตอนเล่น
    #[test]
    fn half_transparent_shadow_keeps_alpha() {
        let dir = tmp("shadow");
        let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\nYCbCr Matrix: None\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,120,&H0000D7FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,12,5,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,MMMM\r\n";
        let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
        let target = dir.join("sh.sup");
        export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
        let px = decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true);
        let mut m: HashMap<u8, u32> = HashMap::new();
        for p in px.chunks_exact(4) { if p[3] > 0 && p[0] < 8 && p[1] < 8 && p[2] < 8 { *m.entry(p[3]).or_insert(0) += 1; } }
        let (a, n) = m.into_iter().max_by_key(|x| x.1).unwrap();
        assert!((124..=132).contains(&a) && n > 1000, "เงาความทึบ {a} ({n} จุด) ต้องราว 128");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ภาพคู่พื้นดำกับพื้นขาวเป็นความโปร่งใส · ขาวทึบ ดำครึ่งหนึ่ง ไม่มีซับ
    #[test]
    fn pair_gives_alpha() {
        // สามจุด บนพื้นดำ 255 128 0 · บนพื้นขาว 255 128 255 · จุดแรกขาวทึบ จุดสองดำทึบครึ่งหนึ่ง (พื้นขาวได้ 128) จุดสามไม่มีซับ
        let pair = [255, 255, 255, 0, 0, 0, 0, 0, 0, /* ขาว */ 255, 255, 255, 128, 128, 128, 255, 255, 255];
        let mut buf = [0u8; 12];
        pair_to_rgba(&pair, &mut buf);
        assert_eq!(buf, [255, 255, 255, 255, 0, 0, 0, 127, 0, 0, 0, 0]);
    }

    /// ซับ TV.601 หรือไม่มีบรรทัด YCbCr Matrix บนภาพ HD สีแบบตัวเล่น (mpv แปลงด้วย BT.601 แล้วถอดด้วย BT.709) · ปิดตัวเลือกแล้วได้สีตามสไตล์
    #[test]
    fn tv601_script_colors_like_player() {
        let dir = tmp("601");
        for (m, vs, want) in [("", true, mangle601([255, 215, 0])), ("TV.601", true, mangle601([255, 215, 0])), ("TV.601", false, [255, 215, 0]), ("None", true, [255, 215, 0])] {
            let target = dir.join(format!("y-{m}-{vs}.sup"));
            let mut req = req_at(&target, 1280, 720);
            req.opts.vsfilter = vs;
            export(&tools(), &dir, &yellow_ass(m), &req, &|_, _, _| {}).unwrap();
            let got = top_color(&decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true));
            assert!(near(got, want, 2), "บรรทัด {m:?} ตัวเลือก {vs} ได้ {got:?} ต้องราว {want:?}");
        }
        assert_ne!(mangle601([255, 215, 0]), [255, 215, 0], "สองแบบต้องต่างกันจริง เทสนี้ถึงมีความหมาย");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// SRT ใช้สีตัวอักษร สีขอบ ความหนาขอบที่ตั้ง (พี่กันสั่ง "ขอตัวปรับสี ปรับขอบ ความหนาด้วย ถ้าแปลงจาก srt ธรรมดา") · เดิม SRT ใช้ขาวของตัววาดและโดนบีบเป็นเทา 235
    #[test]
    fn srt_style_color_and_outline() {
        let dir = tmp("srt");
        let doc = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:00,500 --> 00:00:02,000\r\nHELLO\r\n", "srt", None);
        let count = |px: &[u8], f: &dyn Fn(&[u8]) -> bool| px.chunks_exact(4).filter(|p| p[3] == 255 && f(p)).count();
        let target = dir.join("s.sup");
        let mut req = req_at(&target, 1280, 720);
        req.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 6.0, shadow: 0.0, size: 90.0, ..Default::default() });
        export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
        let px = decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true);
        let red = count(&px, &|p| p[0] > 245 && p[1] < 12 && p[2] < 12);
        let blue = count(&px, &|p| p[2] > 245 && p[0] < 12 && p[1] < 12);
        assert!(red > 800 && blue > 800, "จุดแดง {red} จุดน้ำเงิน {blue}");
        // ขอบหนาขึ้น จุดน้ำเงินมากขึ้น
        let t2 = dir.join("s2.sup");
        let mut r2 = req_at(&t2, 1280, 720);
        r2.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 12.0, shadow: 0.0, size: 90.0, ..Default::default() });
        export(&tools(), &dir, &doc, &r2, &|_, _, _| {}).unwrap();
        let blue2 = count(&decode_at(&std::fs::read(&t2).unwrap(), 1000, 1280, 720, true), &|p| p[2] > 245 && p[0] < 12 && p[1] < 12);
        assert!(blue2 as f64 > blue as f64 * 1.4, "ขอบ 6 ได้ {blue} จุด ขอบ 12 ได้ {blue2} จุด");
        // ไม่ส่งสไตล์ ตัวอักษรขาวจริง ไม่ใช่เทา 235
        let t3 = dir.join("s3.sup");
        export(&tools(), &dir, &doc, &req_at(&t3, 1280, 720), &|_, _, _| {}).unwrap();
        let p3 = decode_at(&std::fs::read(&t3).unwrap(), 1000, 1280, 720, true);
        let (white, gray) = (count(&p3, &|p| p[0] > 252 && p[1] > 252 && p[2] > 252), count(&p3, &|p| (232..=238).contains(&p[0]) && p[0] == p[1] && p[1] == p[2]));
        assert!(white > 300 && gray < white / 10, "สีตั้งต้นต้องขาวจริง จุดขาว {white} จุดเทา 235 {gray}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// เขียนชุดภาพแล้วถอดกลับ ได้สีของจานสีแบบตัวเล่นทุกจุด
    #[test]
    fn decode_roundtrip() {
        let img = Image { palette: vec![[0, 0, 0, 0], [255, 215, 0, 255], [0, 46, 107, 128]], objs: vec![Obj { x: 3, y: 2, w: 4, h: 2, px: vec![1, 1, 2, 0, 0, 2, 2, 1] }], colors: 2, merged: false, spread: vec![] };
        let b = show_set(900, 0, 16, 8, 0x10, &img, true);
        let px = decode_at(&b, 10, 16, 8, true);
        let want = image_rgba(&img, 16, 8, true, true);
        assert_eq!(px, want);
        // แปลงไปกลับปัดเศษได้ต่างไม่เกินหนึ่งหน่วย
        let p = &px[(2 * 16 + 3) * 4..(2 * 16 + 3) * 4 + 4];
        assert!(near([p[0], p[1], p[2]], [255, 215, 0], 1) && p[3] == 255, "{p:?}");
        assert_eq!(first_shown(&b), Some(10));
    }

    /// จำนวนสีที่ตั้ง กระจายจุดสี กรอบเดียว
    #[test]
    fn opts_colors_dither_windows() {
        let (w, h) = (64usize, 40usize);
        let mut rgba = vec![0u8; w * h * 4];
        // แถว 2 ถึง 9 ไล่สี 512 สี · แถว 30 ถึง 35 อีกกลุ่ม
        for y in (2..10).chain(30..36) { for x in 0..w { let i = (y * w + x) * 4; rgba[i] = (x * 4) as u8; rgba[i + 1] = (y * 6) as u8; rgba[i + 2] = 255 - (x * 4) as u8; rgba[i + 3] = 255; } }
        for (dither, windows) in [(false, 2), (true, 2), (true, 1)] {
            let im = image_of(&rgba, w, h, &Enc { k: 16, dither, vivid: 0.0, windows }).unwrap();
            assert!(im.palette.len() <= 17, "สีไม่เกิน 16 กับสีโปร่งใส ได้ {}", im.palette.len());
            assert!(im.objs.iter().all(|o| o.px.iter().all(|&k| (k as usize) < im.palette.len())));
            assert_eq!(im.objs.len(), windows, "กรอบ {windows}");
            assert!(im.colors > 16);
        }
        // ไม่ลดสี ใช้สีเดิมตรงตัว
        let im = image_of(&rgba, w, h, &Enc::default()).unwrap();
        assert!(im.colors > 255 || im.palette.len() == im.colors + 1);
    }

    #[test]
    fn vivid_moves_away_from_gray() {
        assert_eq!(vivid(u32::from_le_bytes([128, 128, 128, 255]), 0.5).to_le_bytes(), [128, 128, 128, 255]);
        let c = vivid(u32::from_le_bytes([200, 100, 100, 255]), 0.5).to_le_bytes();
        assert!(c[0] > 200 && c[1] < 100 && c[2] < 100 && c[3] == 255, "{c:?}");
    }

    #[test]
    fn bdn_timecodes_and_formats() {
        assert_eq!(bdn_tc(frame_no(500, 24000, 1001), 24), "00:00:00:12");
        assert_eq!(bdn_tc(24 * 3600 + 1, 24), "01:00:00:01");
        assert_eq!(bdn_rate(30000, 1001), ("29.97", 30));
        assert_eq!(video_format(1920, 1080, 24000, 1001), Some("1080p"));
        assert_eq!(video_format(1920, 1080, 25, 1), Some("1080i"));
        assert_eq!(video_format(1920, 800, 24000, 1001), None);
    }

    /// ตั้ง YCbCr Matrix เป็น None แทนบรรทัดเดิม หรือใส่ต่อจาก [Script Info] · ซับ SRT ได้หัว ASS ที่มี None
    #[test]
    fn matrix_line_set_to_none() {
        for m in ["TV.709", ""] {
            let mut d = yellow_ass(m);
            set_matrix_none(&mut d);
            let s = crate::subtitle::subdoc::render(&d);
            assert_eq!(s.matches("YCbCr Matrix:").count(), 1, "{s}");
            assert!(s.contains("YCbCr Matrix: None") && s.find("[Script Info]").unwrap() < s.find("YCbCr Matrix").unwrap());
        }
        assert!(script_tv601(&yellow_ass("")) && script_tv601(&yellow_ass("TV.601")) && !script_tv601(&yellow_ass("TV.709")) && !script_tv601(&yellow_ass("None")));
        let srt = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:01,000 --> 00:00:02,000\r\nx\r\n", "srt", None);
        let p = prepare(&srt, &PgsReq { w: 1920, h: 800, ..Default::default() });
        let s = crate::subtitle::subdoc::render(&p.doc);
        assert!(s.contains("YCbCr Matrix: None") && s.contains("PlayResY: 1080") && s.contains("PlayResX: 2592") && !p.tv601, "{s}");
    }

    /// ภาพตัวอย่างเทียบสี ASS กับ PGS · สีหลักต้องตรงกัน
    #[test]
    fn preview_matches_ass_colors() {
        let dir = tmp("prev");
        let req = req_at(&dir.join("p.sup"), 1280, 720);
        let p = preview(&tools(), &dir, &yellow_ass("TV.709"), &req, 1000, None, &|| false).unwrap();
        assert!(!p.empty && p.ass.as_deref().is_some_and(|u| u.starts_with("data:image/png;base64,")) && p.pgs.starts_with("data:image/png;base64,"));
        let c = &p.colors[0];
        assert_eq!(c.ass, "#FFD700", "{:?}", p.colors);
        assert!(c.de < 2.0 && p.mean < 2.0, "{:?} ต่างเฉลี่ย {}", p.colors, p.mean);
        // เวลาที่ไม่มีซับ
        assert!(preview(&tools(), &dir, &yellow_ass("TV.709"), &req, 5000, None, &|| false).unwrap().empty);
        // SRT กับประโยคตัวอย่าง ไม่มีภาพ ASS
        let srt = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:01,000 --> 00:00:02,000\r\nx\r\n", "srt", None);
        let s = preview(&tools(), &dir, &srt, &req, 0, Some("ตัวอย่างซับไทย"), &|| false).unwrap();
        assert!(!s.empty && s.ass.is_none() && s.w > 100, "{} × {}", s.w, s.h);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ไฟล์ล็อกแคชของ pyopencl ค้าง (SUPer โดนปิดกลางทาง) SUPer ต้องยังทำไฟล์ได้และไม่รอนาน
    /// เดิมทุกรอบรอล็อกราวหนึ่งนาทีแล้วพัง "Encoder died: Empty@get" (เจอ 15 พ.ย. 2569) · แก้ด้วย PYOPENCL_NO_CACHE ใน run_super
    #[test]
    fn super_ignores_stale_pyopencl_lock() {
        if !super_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี SUPer"); return; }
        let Some(local) = std::env::var_os("LOCALAPPDATA") else { return };
        let lockdir = PathBuf::from(local).join("pyopencl").join("pyopencl").join("Cache").join("pyopencl-compiler-cache-v2-py3.14.10.final.0");
        std::fs::create_dir_all(&lockdir).unwrap();
        let lock = lockdir.join("lock");
        let had = lock.exists();
        std::fs::write(&lock, b"").unwrap();
        let dir = tmp("superlock");
        let mut req = req_at(&dir.join("l.sup"), 1280, 720);
        req.engine = "super".into();
        let t = std::time::Instant::now();
        let r = export(&tools(), &dir, &yellow_ass("TV.709"), &req, &|_, _, _| {});
        let secs = t.elapsed().as_secs_f64();
        if !had { let _ = std::fs::remove_file(&lock); }
        let _ = std::fs::remove_dir_all(&dir);
        assert!(r.is_ok(), "SUPer พังเมื่อมีไฟล์ล็อกค้าง {r:?}");
        assert!(secs < 40.0, "SUPer ใช้ {secs:.0} วินาที น่าจะรอล็อก");
    }

    /// ตัวสร้าง Subtitle Edit (SeConv) ใช้สี ขอบ ตำแหน่ง กล่องพื้นหลังที่ตั้ง · ข้ามเมื่อยังไม่มี SeConv
    #[test]
    fn seconv_engine_uses_style() {
        if !seconv_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี tools\\seconv\\seconv.exe"); return; }
        let dir = tmp("seconv");
        let doc = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:00,500 --> 00:00:02,000\r\nHELLO\r\n", "srt", None);
        let target = dir.join("se.sup");
        let mut req = req_at(&target, 1280, 720);
        req.engine = "seconv".into();
        req.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 6.0, shadow: 0.0, size: 90.0, align: 8, ..Default::default() });
        let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        assert!(r.images >= 1 && r.bytes as usize == b.len(), "{r:?}");
        let px = decode_at(&b, first_shown(&b).unwrap(), 1280, 720, true);
        let red = px.chunks_exact(4).filter(|p| p[3] > 200 && p[0] > 200 && p[1] < 60 && p[2] < 60).count();
        let blue = px.chunks_exact(4).filter(|p| p[3] > 200 && p[2] > 200 && p[0] < 60 && p[1] < 60).count();
        assert!(red > 300 && blue > 300, "จุดแดง {red} จุดน้ำเงิน {blue}");
        // ตำแหน่ง 8 กลางบน จุดของซับอยู่ครึ่งบนของภาพ
        let top = px.chunks_exact(4).enumerate().filter(|(_, p)| p[3] > 0).all(|(i, _)| i / 1280 < 360);
        assert!(top, "ตั้งกลางบนแล้วซับต้องอยู่ครึ่งบน");
        // ภาพตัวอย่างของ SeConv ใช้ประโยคที่พิมพ์
        let p = preview(&tools(), &dir, &doc, &req, 0, Some("ทดสอบ"), &|| false).unwrap();
        assert!(!p.empty && p.after > 0, "ภาพตัวอย่างของ SeConv");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ขนาดที่คาดต้องใกล้ขนาดจริงของตัวในโปรแกรม (ไม่ต่างเกินครึ่งหนึ่ง)
    #[test]
    fn estimate_close_to_real_size() {
        let dir = tmp("est");
        let doc = yellow_ass("TV.709");
        let target = dir.join("e.sup");
        let req = req_at(&target, 1280, 720);
        let e = estimate(&tools(), &dir, &doc, &req, &|| false).unwrap();
        let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
        let ratio = e.bytes as f64 / r.bytes as f64;
        assert!(e.images >= 1 && e.sampled >= 1 && (0.5..=1.5).contains(&ratio), "คาด {} จริง {} ({ratio:.2})", e.bytes, r.bytes);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ซับข้อความชนิดอื่นเปิดได้ · SAMI ผ่าน ffmpeg เป็น ASS · SBV แปลงเองเป็น SRT
    #[test]
    fn other_text_formats_open() {
        let dir = tmp("other");
        let smi = dir.join("t.smi");
        std::fs::write(&smi, "<SAMI><BODY>\r\n<SYNC Start=1000><P Class=THTH>สวัสดี <i>ตัวเอียง</i>\r\n<SYNC Start=3000><P Class=THTH>&nbsp;\r\n</BODY></SAMI>\r\n").unwrap();
        let (b, hint) = crate::subtitle::subs::bytes_of(&tools(), &dir, &smi, false, 0, 0).unwrap();
        let d = crate::subtitle::subdoc::parse_doc(&b, &hint, None);
        assert_eq!(hint, "ass");
        assert!(d.events.iter().any(|e| e.start == 1000 && e.text.contains("สวัสดี") && e.text.contains("\\i1")), "{:?}", d.events.iter().map(|e| (&e.start, &e.text)).collect::<Vec<_>>());
        let sbv = dir.join("t.sbv");
        std::fs::write(&sbv, "0:00:01.000,0:00:02.500\nสวัสดี\n").unwrap();
        let (b, hint) = crate::subtitle::subs::bytes_of(&tools(), &dir, &sbv, false, 0, 0).unwrap();
        let d = crate::subtitle::subdoc::parse_doc(&b, &hint, None);
        assert_eq!((hint.as_str(), d.events.len(), d.events[0].start, d.events[0].end), ("srt", 1, 1000, 2500));
        // ทางเพิ่มไฟล์ของหน้าซับไตเติล (merge::add_file) ต้องได้แทร็กซับหนึ่งแทร็กทั้งสองชนิด · เดิม SAMI ล้มว่า mkvmerge อ่านไม่ได้ เปิดในหน้าซับไตเติลไม่ขึ้น (เจอจากตัวตรวจ check-pgs 15 พ.ย. 2569)
        for (f, codec) in [(&smi, "sami"), (&sbv, "sbv")] {
            let a = crate::merge::merge::add_file(&tools(), f, None).unwrap_or_else(|e| panic!("{} เพิ่มไม่ได้ {e}", f.display()));
            assert_eq!(a.tracks.len(), 1, "{}", f.display());
            assert_eq!((a.tracks[0].kind.as_str(), a.tracks[0].codec.as_str()), ("subtitle", codec));
            assert_eq!(a.tracks[0].frames, Some(1), "{} จำนวนบรรทัด", f.display());
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ตัวสร้าง SUPer · ข้ามเมื่อยังไม่ได้แตก SUPer ลงโฟลเดอร์เครื่องมือ (fetch-tools)
    #[test]
    fn super_engine_exports_when_present() {
        if !super_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี tools\\super\\SUPer_CLI.exe"); return; }
        let dir = tmp("super");
        let target = dir.join("s.sup");
        let mut req = req_at(&target, 1280, 720);
        req.engine = "super".into();
        let r = export(&tools(), &dir, &yellow_ass("TV.709"), &req, &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        assert!(r.images >= 1 && b.starts_with(b"PG"), "{r:?}");
        let t0 = first_shown(&b).unwrap();
        assert!((t0 - 500).abs() <= 42, "SUPer ภาพแรกที่ {t0} ms");
        let got = top_color(&decode_at(&b, t0, 1280, 720, true));
        assert!(near(got, [255, 215, 0], 4), "SUPer สีเหลืองได้ {got:?}");
        // ขนาดที่ไม่ใช่ของ Blu-ray ตอบเหตุผล
        let mut bad = req_at(&dir.join("bad.sup"), 1280, 700);
        bad.engine = "super".into();
        assert!(export(&tools(), &dir, &yellow_ass("TV.709"), &bad, &|_, _, _| {}).unwrap_err().contains("Blu-ray"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ---------------------------------------------------------------- BUGS ข้อ 126 ความสามารถแบบ SUPer ในตัวสร้างชั้นหนัง

    fn one_line_ass(text: &str, w: u32, h: u32) -> SubDoc {
        let ass = format!("[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: {w}\r\nPlayResY: {h}\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00800000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{text}\r\n");
        crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None)
    }
    /// ทุกส่วนของไฟล์ (PTS DTS หน่วย 90 kHz ชนิด ข้อมูล ขนาดทั้งส่วนรวมหัว)
    fn raw_sets(b: &[u8]) -> Vec<(u32, u32, u8, Vec<u8>, usize)> {
        let mut out = vec![];
        let mut i = 0;
        while i + 13 <= b.len() {
            let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]);
            let dts = u32::from_be_bytes([b[i + 6], b[i + 7], b[i + 8], b[i + 9]]);
            let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
            out.push((pts, dts, b[i + 10], b[i + 13..i + 13 + n].to_vec(), 13 + n));
            i += 13 + n;
        }
        out
    }
    fn mean_diff(a: &[u8], b: &[u8]) -> f64 { a.iter().zip(b).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as u64).sum::<u64>() as f64 / a.len() as f64 }

    /// ภาพที่เทียบได้ด้วยมือ · ก้อนสีขาวขอบจาง เปลี่ยนความทึบทั้งก้อนต้องได้แค่จานสีใหม่ · เลื่อน มีจุดนอกกรอบ ใสทั้งภาพ ต้องไม่ได้
    #[test]
    fn palette_update_only_when_shape_same() {
        let (w, h) = (64usize, 32usize);
        let blob = |dx: usize, alpha: f64, extra: bool| {
            let mut v = vec![0u8; w * h * 4];
            for y in 8..20 { for x in (10 + dx)..(40 + dx) {
                let edge = y == 8 || y == 19 || x == 10 + dx || x == 39 + dx;
                let a = if edge { 120.0 } else { 255.0 } * alpha;
                let i = (y * w + x) * 4;
                // ffmpeg ให้สีแบบคูณความโปร่งใสมา
                let c = (250.0 * a / 255.0).round() as u8;
                v[i..i + 4].copy_from_slice(&[c, c, c, a.round() as u8]);
            } }
            if extra { let i = (2 * w + 2) * 4; v[i..i + 4].copy_from_slice(&[255, 255, 255, 255]); }
            v
        };
        let enc = Enc::default();
        let base = image_of(&blob(0, 1.0, false), w, h, &enc).unwrap();
        assert_eq!(base.spread.len(), base.palette.len());
        let half = palette_update(&base, &blob(0, 0.5, false), w, h, &enc).expect("จางลงครึ่งหนึ่งต้องเปลี่ยนแค่จานสี");
        let solid = base.palette.iter().position(|c| c[3] == 255).unwrap();
        assert!((half[solid][3] as i32 - 128).abs() <= 2, "สีทึบจางลงครึ่งหนึ่ง ได้ {:?}", half[solid]);
        assert!((half[solid][0] as i32 - 250).abs() <= 3, "สีเดิมไม่เพี้ยน ได้ {:?}", half[solid]);
        assert!(palette_update(&base, &blob(3, 1.0, false), w, h, &enc).is_none(), "ภาพเลื่อนต้องส่งภาพใหม่");
        assert!(palette_update(&base, &blob(0, 1.0, true), w, h, &enc).is_none(), "จุดนอกกรอบเดิมต้องส่งภาพใหม่");
        assert!(palette_update(&base, &vec![0u8; w * h * 4], w, h, &enc).is_none(), "ใสทั้งภาพให้ล้างจอ");
        // เวลาล้างจอเต็มจอ 1920 × 1080 ตามแบบจำลอง 2,073,600 ไบต์ ที่ 32 ล้านไบต์ต่อวินาที = 64.8 ms = 5,832 หน่วย
        assert_eq!(decode_ticks(EPOCH_START, 1920, 1080, &[], &[]), 5832);
        assert_eq!(decode_ticks(ACQUISITION, 1920, 1080, &[], &[]), 0);
    }

    /// ภาพเฟดเข้าและออก เปลี่ยนแค่จานสี ไฟล์เล็กลงมาก และ ffmpeg (ตัวถอดของ mpv) ถอดได้ภาพตรงกับ libass ตรงกลางเฟด
    #[test]
    fn fade_uses_palette_updates_and_matches_libass() {
        let dir = tmp("fade126");
        let doc = one_line_ass("{\\fad(500,500)}Fade palette", 1280, 720);
        let target = dir.join("fade.sup");
        let r = export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        let sets = raw_sets(&b);
        let pcs: Vec<&(u32, u32, u8, Vec<u8>, usize)> = sets.iter().filter(|s| s.2 == 0x16).collect();
        let pal_upd = pcs.iter().filter(|s| s.3[8] & 0x80 != 0).count();
        let ods_first = sets.iter().filter(|s| s.2 == 0x15 && s.3[3] & 0x80 != 0).count();
        assert!(pal_upd >= 16 && r.pal_updates == pal_upd, "เฟดเข้าออกเปลี่ยนแค่จานสี ได้ {pal_upd} ชุด {r:?}");
        assert!(ods_first <= 2, "ทั้งบรรทัดส่งภาพเต็มไม่เกินสองครั้ง (วัดได้ 1) ได้ {ods_first}");
        // ขนาดที่คาดในหน้าต่างส่งออก ต้องใกล้ไฟล์จริง (เดิมคิดทุกเฟรมของบรรทัดเฟดเป็นภาพเต็ม คาดเกินจริงหลายเท่า)
        let est = estimate(&tools(), &dir, &doc, &req_at(&dir.join("x.sup"), 1280, 720), &|| false).unwrap();
        let ratio = est.bytes as f64 / r.bytes as f64;
        assert!((0.6..1.7).contains(&ratio), "คาด {} ไบต์ ไฟล์จริง {} ไบต์", est.bytes, r.bytes);
        // ขนาดของชุดแรก (ภาพเต็ม) คูณจำนวนชุดที่มีภาพ คือขนาดถ้าเขียนเต็มทุกชุดแบบเดิม
        let end1 = sets.iter().position(|s| s.2 == 0x80).unwrap();
        let first_set: usize = sets[..=end1].iter().map(|s| s.4).sum();
        assert!((r.bytes as usize) * 4 < first_set * r.images, "ไฟล์ {} ไบต์ ต้องเล็กกว่าเขียนเต็มทุกชุด {} ไบต์ มาก", r.bytes, first_set * r.images);
        // เวลาเริ่มถอดไม่เกินเวลาแสดง ไม่ย้อนหลัง และไม่มีชุดที่ถอดไม่ทัน
        let mut prev = 0;
        for s in &pcs { assert!(s.1 <= s.0 && s.1 >= prev, "DTS {} PTS {} ก่อนหน้า {}", s.1, s.0, prev); prev = s.1; }
        assert_eq!(r.late, 0, "{r:?}");
        assert_eq!((pcs[0].3[7], pcs[0].3[0..2].to_vec()), (EPOCH_START, 1280u16.to_be_bytes().to_vec()), "ชุดแรกเริ่ม epoch กว้าง 1280");
        // ภาพกลางเฟดเข้า (1.25 วินาที) ตอนทึบ (2 วินาที) และกลางเฟดออก (2.75 วินาที) จาก ffmpeg ตรงกับ libass
        let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
        let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
        let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
        for t in [1.25, 2.0, 2.75] {
            let a = frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, t);
            let l = frame(&[], &vf, 1280, 720, t);
            let lit = l.chunks(3).filter(|p| p[0] as u32 + p[1] as u32 + p[2] as u32 > 60).count();
            assert!(lit > 1500, "libass วาดซับขึ้นที่ {t}");
            let m = mean_diff(&a, &l);
            assert!(m < 1.5, "ที่ {t} วินาที ภาพจาก .sup ต่างจาก libass เฉลี่ย {m:.2}");
        }
        drop(sub);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ตัวอักษรตกลงมาจากขอบบน ภาพสูงขึ้นทีละไม่กี่จุดทุกเฟรม กรอบที่เผื่อไว้ต้องรับได้ ไม่เริ่ม epoch ใหม่ทุกเฟรม เครื่องเล่น Blu-ray ถอดทันทุกชุด
    /// (เจอ 15 พ.ย. 2569 กับซับคาราโอเกะตัวอย่างของ ffmpeg ถอดไม่ทัน 5 ชุด)
    #[test]
    fn growing_text_fits_padded_windows() {
        let dir = tmp("grow126");
        // จอ 1920 × 1080 เริ่ม epoch ต้องล้างจอ 64.8 ms เกินระยะเฟรม 41.7 ms ถ้าเริ่ม epoch ใหม่ทุกเฟรมจะถอดไม่ทันทันที
        let doc = one_line_ass("{\\an5\\move(960,-30,960,60,0,400)}Drop", 1920, 1080);
        let target = dir.join("grow.sup");
        let r = export(&tools(), &dir, &doc, &req_at(&target, 1920, 1080), &|_, _, _| {}).unwrap();
        assert_eq!(r.late, 0, "ทุกชุดถอดทัน {r:?}");
        let epochs = raw_sets(&std::fs::read(&target).unwrap()).iter().filter(|s| s.2 == 0x16 && s.3[10] > 0 && s.3[7] == EPOCH_START).count();
        assert!(epochs <= 3, "เริ่ม epoch ได้ {epochs} ครั้ง {r:?}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ข้อความเลื่อน ภาพเปลี่ยนทุกเฟรมแต่อยู่ในกรอบเดิมของ epoch ส่งเป็นจุดเริ่มอ่าน ไม่ล้างจอทุกเฟรม เครื่องเล่น Blu-ray ถอดทันทุกชุด
    #[test]
    fn move_reuses_epoch_windows() {
        let dir = tmp("move126");
        let doc = one_line_ass("{\\move(300,640,980,640)}Moving", 1280, 720);
        let target = dir.join("move.sup");
        let r = export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        let sets = raw_sets(&b);
        let states: Vec<u8> = sets.iter().filter(|s| s.2 == 0x16 && s.3[10] > 0).map(|s| s.3[7]).collect();
        let epochs = states.iter().filter(|&&s| s == EPOCH_START).count();
        assert_eq!(epochs, 1, "เริ่ม epoch ครั้งเดียว {states:?}");
        assert!(r.reused >= 30 && states.iter().filter(|&&s| s == ACQUISITION).count() == r.reused, "{r:?}");
        assert_eq!(r.late, 0, "ทุกชุดถอดทัน {r:?}");
        // กรอบกว้างเต็มจอ
        let wds = sets.iter().find(|s| s.2 == 0x17).unwrap();
        assert_eq!(u16::from_be_bytes([wds.3[6], wds.3[7]]), 1280, "กรอบกว้างเต็มจอ");
        let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
        let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
        let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
        for t in [1.5, 2.5] {
            let m = mean_diff(&frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, t), &frame(&[], &vf, 1280, 720, t));
            assert!(m < 1.5, "ที่ {t} วินาที ภาพจาก .sup ต่างจาก libass เฉลี่ย {m:.2}");
        }
        drop(sub);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
