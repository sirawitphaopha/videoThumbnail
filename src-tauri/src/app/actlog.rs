//! บันทึกการใช้งาน · จดงานที่เขียน ย้าย หรือลบไฟล์ ค่าตั้งที่เปลี่ยน และไฟล์ทุกไฟล์ที่ลงถังขยะ ลงไฟล์ข้อความรายเดือนในเครื่องนี้
//! ไว้ย้อนดูว่ากดอะไรไปก่อนเจอปัญหา (พี่กันเสนอ 12 พ.ย. 2569 "ทำ log ของโปรแกรม ว่าเราทำอะไรในโปรแกรมมั่ง เอาไว้ตรวจทาน")
//! ไม่ส่งออกเน็ต · เก็บ 12 เดือนล่าสุด (แคลร์ตั้ง) · มีชื่อไฟล์หนังของผู้ใช้ จึงอยู่ในโฟลเดอร์ของโปรแกรมเท่านั้น

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::AppHandle;

/// โฟลเดอร์บันทึก · ตั้งตอนเปิดโปรแกรม ยังไม่ตั้ง (เช่นใน cargo test) ไม่จดอะไร · ถือล็อกตลอดตอนเขียน บรรทัดไม่ปนกัน
static DIR: Mutex<Option<PathBuf>> = Mutex::new(None);

/// เก็บไฟล์บันทึกย้อนหลังกี่เดือน (แคลร์ตั้ง)
const KEEP_MONTHS: usize = 12;

/// คำสั่งจากหน้าจอที่จด กับชื่องานที่คนอ่านรู้เรื่อง · คำสั่งอ่านอย่างเดียว คำสั่งดูตัวอย่าง และงานในหน่วยความจำไม่จด
const WATCH: &[(&str, &str)] = &[
    ("set_settings", "เปลี่ยนค่าตั้ง"),
    ("set_rating", "ให้ดาว"),
    ("rename_movie", "เปลี่ยนชื่อไฟล์หนัง"),
    ("poster_apply", "ใส่โปสเตอร์เข้าไฟล์หนัง"),
    ("merge_apply", "รวมไฟล์ในหน้าเสียงและซับ"),
    ("extract_start", "แยกแทร็กออกจากหนัง"),
    ("convert_one", "แปลงเสียง"),
    ("hash_save", "บันทึกไฟล์ .sha256"),
    ("graph_save", "บันทึกกราฟเสียง"),
    ("subdoc_save", "บันทึกไฟล์ซับในหน้าแก้ซับ"),
    ("vid_keys_save", "บันทึกไฟล์ keyframe ในหน้าแก้ซับ"),
    ("sub_audio_save", "บันทึกเสียงของบรรทัดซับเป็นไฟล์"),
    ("ocr_tess_download", "โหลดชุดภาษา Tesseract"),
    ("ocr_paddle_download", "โหลดโมเดลภาษา PaddleOCR"),
    ("ocr_teach", "สอนตัวอักษร OCR บันทึกลงฐาน"),
    ("ocr_word", "เพิ่มคำของ OCR ลงพจนานุกรม รายชื่อ หรือรายการแก้คำ"),
    ("ocr_db_delete", "ลบฐานตัวอักษร OCR ลงถังขยะ"),
    ("ocr_image_out", "คัดลอกหรือบันทึกภาพซับจากหน้า OCR"),
    ("ocr_db_new", "สร้างฐานตัวอักษร OCR ใหม่"),
    ("ocr_db_rename", "เปลี่ยนชื่อฐานตัวอักษร OCR"),
    ("ocr_db_char_update", "แก้ตัวอักษรในฐาน OCR"),
    ("ocr_db_char_delete", "ลบตัวอักษรออกจากฐาน OCR"),
    ("ocr_history_update", "แก้ตัวอักษรที่สอนไปแล้วในฐาน OCR"),
    ("ocr_history_delete", "ลบตัวอักษรที่สอนไปแล้วออกจากฐาน OCR"),
    ("ocr_train", "ฝึกฐานตัวอักษร OCR จากฟอนต์"),
    ("ocr_db_optimize", "ย่อฐานตัวอักษร OCR สำรองไฟล์เดิมเป็น .bak"),
    ("ocr_export", "ส่งออกซับจาก OCR เป็นไฟล์ซับตัวหนังสือ"),
    ("ocr_save_html", "บันทึกภาพซับพร้อมหน้า HTML จาก OCR"),
    ("ocr_inspect_update", "แก้ตัวอักษรในฐาน OCR จากหน้าต่างตรวจบรรทัด"),
    ("ocr_inspect_delete", "ลบตัวอักษรออกจากฐาน OCR จากหน้าต่างตรวจบรรทัด"),
    ("pgs_export", "ส่งออกซับเป็น PGS"),
    ("imgsub_convert", "แปลงซับภาพเป็นซับภาพ"),
    ("vid_snapshot", "บันทึกหรือคัดลอกภาพจากหน้าแก้ซับ"),
    ("graph_save_image", "บันทึกรูปกราฟ"),
    ("graph_cache_clear", "ล้างกราฟที่เก็บไว้"),
    ("check_start", "ตรวจไฟล์"),
    ("pair_set", "จับคู่เสียงหรือซับกับหนัง"),
    ("link_confirm", "ยืนยันปกจับคู่"),
    ("link_migrate", "ย้ายที่เก็บรูปจับคู่"),
    ("link_remove", "เอาปกจับคู่ออก"),
    ("link_unsave", "ยกเลิกปกจับคู่ที่ยืนยันแล้ว"),
    ("link_cover_pick", "เลือกปกที่แสดง"),
    ("force_close", "ปิดโปรแกรมทั้งที่มีงานค้าง"),
];

/// วันเวลาตามนาฬิกาเครื่อง
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Stamp { pub y: u16, pub mo: u16, pub d: u16, pub h: u16, pub mi: u16, pub s: u16 }

impl Stamp {
    fn text(&self) -> String {
        format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", self.y, self.mo, self.d, self.h, self.mi, self.s)
    }
    fn file(&self) -> String {
        format!("{:04}-{:02}.log", self.y, self.mo)
    }
}

pub(crate) fn now_local() -> Stamp {
    use windows_sys::Win32::System::SystemInformation::GetLocalTime;
    let mut t = unsafe { std::mem::zeroed() };
    unsafe { GetLocalTime(&mut t) };
    Stamp { y: t.wYear, mo: t.wMonth, d: t.wDay, h: t.wHour, mi: t.wMinute, s: t.wSecond }
}

/// ตั้งโฟลเดอร์บันทึกตอนเปิดโปรแกรม แล้วลบไฟล์ที่เก่ากว่า 12 เดือน
pub fn init(dir: PathBuf) {
    let _ = fs::create_dir_all(&dir);
    prune(&dir, KEEP_MONTHS);
    *DIR.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir);
}

/// จดหนึ่งบรรทัด · เขียนไม่ได้ก็ปล่อยผ่าน งานหลักต้องไม่ล้มเพราะบันทึก
pub fn note(what: &str, detail: &str) {
    let dir = DIR.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(d) = dir.as_ref() {
        let _ = append(d, now_local(), what, detail);
    }
}

/// ทางเข้ากลางของคำสั่งจากหน้าจอ (lib.rs invoke_handler) · จดเฉพาะคำสั่งใน WATCH พร้อมค่าที่ส่งมา
pub fn invoke(cmd: &str, body: &tauri::ipc::InvokeBody) {
    let Some((_, what)) = WATCH.iter().find(|(c, _)| *c == cmd) else { return };
    let detail = match body {
        tauri::ipc::InvokeBody::Json(v) => json_detail(v),
        tauri::ipc::InvokeBody::Raw(b) => format!("ข้อมูล {} ไบต์", b.len()),
    };
    note(what, &detail);
}

/// ค่าที่ส่งมาของคำสั่ง · เอกสารซับ (doc) ยาวทั้งไฟล์ กับภาพวิดีโอจำลอง (bg ของ vid_snapshot) ตัดออกก่อนจด เหลือที่อยู่ไฟล์กับแบบบันทึก
/// เดิมเนื้อซับยาวจนบรรทัดถูกตัดก่อนถึงที่อยู่ไฟล์ บันทึกที่ล้มไม่มีที่อยู่ไฟล์เลย (ผู้ช่วยตรวจทาน R13)
fn json_detail(v: &serde_json::Value) -> String {
    if v.get("doc").is_none() && v.get("bg").is_none() { return brief(v); }
    let mut v = v.clone();
    if let Some(o) = v.as_object_mut() { o.remove("doc"); o.remove("bg"); }
    brief(&v)
}

fn append(dir: &Path, t: Stamp, what: &str, detail: &str) -> std::io::Result<()> {
    let mut f = OpenOptions::new().create(true).append(true).open(dir.join(t.file()))?;
    writeln!(f, "{}", line(t, what, detail))
}

/// หนึ่งบรรทัด วันเวลา ชื่องาน รายละเอียด คั่นด้วยเว้นวรรคสองช่อง · รายละเอียดยาวเกิน 1,500 ตัวอักษรตัดท้าย
pub fn line(t: Stamp, what: &str, detail: &str) -> String {
    let flat: String = detail.split(['\r', '\n']).map(str::trim).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ");
    let cut: String = flat.chars().take(1500).collect();
    let more = if cut.chars().count() < flat.chars().count() { "…" } else { "" };
    if cut.is_empty() { format!("{}  {what}", t.text()) } else { format!("{}  {what}  {cut}{more}", t.text()) }
}

/// ค่าที่ส่งมาแบบอ่านง่าย · ข้อความไม่มีเครื่องหมายคำพูด ที่อยู่ไฟล์ไม่มีแบ็กสแลชซ้อน
pub fn brief(v: &Value) -> String {
    match v {
        Value::Null => "ว่าง".into(),
        Value::String(s) => s.clone(),
        Value::Array(a) => format!("[{}]", a.iter().map(brief).collect::<Vec<_>>().join(", ")),
        Value::Object(o) => o.iter().map(|(k, x)| match x {
            Value::Object(_) => format!("{k} {{{}}}", brief(x)),
            _ => format!("{k}: {}", brief(x)),
        }).collect::<Vec<_>>().join(", "),
        other => other.to_string(),
    }
}

/// ลบไฟล์บันทึกที่เก่ากว่าจำนวนเดือนที่เก็บ · แตะเฉพาะไฟล์ชื่อแบบ ปปปป-ดด.log
fn prune(dir: &Path, keep: usize) {
    let mut logs: Vec<PathBuf> = fs::read_dir(dir).into_iter().flatten().flatten().map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(is_log_name)).collect();
    logs.sort();
    if logs.len() > keep {
        for p in &logs[..logs.len() - keep] { let _ = fs::remove_file(p); }
    }
}

fn is_log_name(n: &str) -> bool {
    let b = n.as_bytes();
    n.len() == 11 && n.ends_with(".log") && b[4] == b'-' && b[..4].iter().chain(&b[5..7]).all(u8::is_ascii_digit)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogInfo {
    pub dir: String,
    /// จำนวนรายการที่จดในเดือนนี้
    pub month_lines: usize,
}

/// ที่อยู่โฟลเดอร์บันทึกกับจำนวนรายการเดือนนี้ ให้การ์ดในหน้าตั้งค่า
#[tauri::command]
pub fn actlog_info() -> Result<LogInfo, String> {
    let dir = DIR.lock().unwrap_or_else(|e| e.into_inner()).clone().ok_or("ยังไม่ได้ตั้งโฟลเดอร์บันทึก")?;
    let month_lines = fs::read_to_string(dir.join(now_local().file())).map(|s| s.lines().count()).unwrap_or(0);
    Ok(LogInfo { dir: dir.to_string_lossy().to_string(), month_lines })
}

/// เปิดโฟลเดอร์บันทึกใน Explorer
#[tauri::command]
pub fn actlog_open_dir(app: AppHandle) -> Result<String, String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = DIR.lock().unwrap_or_else(|e| e.into_inner()).clone().ok_or("ยังไม่ได้ตั้งโฟลเดอร์บันทึก")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
#[path = "actlog_tests.rs"]
mod tests;
