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

static EST_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

#[tauri::command]
pub async fn pgs_estimate(app: AppHandle, doc: SubDoc, req: PgsReq) -> Result<PgsEstimate, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    let my = EST_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || estimate(&tools, &work, &doc, &req, &|| EST_GEN.load(Ordering::SeqCst) != my)).await.map_err(|e| e.to_string())?
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

mod preview;
pub use preview::*;

mod estimate;
pub use estimate::*;

mod engines;
pub use engines::*;

mod decode;
pub use decode::*;

mod segments;
pub use segments::*;

mod picture;
pub use picture::*;

#[cfg(test)]
mod tests;
