//! ที่เก็บการตั้งค่าของโปรแกรม settings.json ในโฟลเดอร์ข้อมูลของโปรแกรม
//! เขียนแบบปลอดภัย (สกิล data-integrity · TECH-REVIEW ข้อ 12)
//!   ① เขียนลงไฟล์ชั่วคราวก่อน แล้วสั่งให้ลงดิสก์จริง
//!   ② เก็บไฟล์เดิมไว้เป็น .bak
//!   ③ เปลี่ยนชื่อไฟล์ชั่วคราวเป็นไฟล์จริง
//! เปิดโปรแกรมแล้วไฟล์เสีย อ่านจาก .bak แทน · .bak ก็เสีย ใช้ค่าตั้งต้น แล้วบอกหน้าจอว่าใช้ตัวไหน
//! ค่าที่บันทึกเป็นรหัสภาษาอังกฤษ ไม่ใช่ข้อความที่โชว์บนจอ (data-integrity ข้อ ③)

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    // การ์ดโฟลเดอร์หนัง
    pub folders: Vec<String>,
    pub rescan_on_start: bool,
    // การ์ดใส่โปสเตอร์
    pub check_source_before: bool,
    pub check_output_after: bool,
    /// "mkv" | "mp4"
    pub output_format: String,
    /// "keep" = ย้ายไปโฟลเดอร์ไฟล์เดิม · "trash" = ลงถังขยะหลังตรวจผ่าน
    pub original_after: String,
    /// ว่าง = โฟลเดอร์ ไฟล์เดิม ข้างไฟล์หนังแต่ละเรื่อง
    pub originals_folder: String,
    /// "jpg" | "png"
    pub poster_format: String,
    pub jpg_quality: u8,
    pub shrink_large_posters: bool,
    // การ์ดตรวจไฟล์
    /// "quick" | "full"
    pub default_check: String,
    pub quick_check_on_start: bool,
    /// 0 = ไม่ต้องเตือน · 7 · 30 · 90
    pub recheck_reminder_days: u32,
    // การ์ดชั้นวาง
    /// "s" | "m" | "l"
    pub cover_size: String,
    pub show_names: bool,
    pub show_dots: bool,
    // การ์ดเปิดเล่นหนัง · ว่าง = โปรแกรมหลักของ Windows
    pub player_path: String,
    // ค่าหน้าตาที่จำไว้
    pub sidebar_collapsed: bool,
    /// "grid" | "table"
    pub view_mode: String,
    /// รหัสการเรียง เช่น "name-asc"
    pub sort: String,
}

impl Default for Settings {
    /// ค่าตั้งต้นตามหน้าตั้งค่าในต้นแบบ (docs/MOCKUP-SPEC.md ข้อ 9)
    fn default() -> Self {
        Self {
            folders: vec![],
            rescan_on_start: true,
            check_source_before: true,
            check_output_after: true,
            output_format: "mkv".into(),
            original_after: "keep".into(),
            originals_folder: String::new(),
            poster_format: "jpg".into(),
            jpg_quality: 90,
            shrink_large_posters: true,
            default_check: "quick".into(),
            quick_check_on_start: false,
            recheck_reminder_days: 30,
            cover_size: "m".into(),
            show_names: true,
            show_dots: true,
            player_path: String::new(),
            sidebar_collapsed: false,
            view_mode: "grid".into(),
            sort: "name-asc".into(),
        }
    }
}

impl Settings {
    /// ค่าที่อยู่นอกรายการที่รับ กลับเป็นค่าตั้งต้น ไม่ปล่อยค่ามั่วลงไฟล์
    fn sanitize(mut self) -> Self {
        let d = Settings::default();
        let pick = |v: &str, ok: &[&str], dflt: &str| if ok.contains(&v) { v.to_string() } else { dflt.to_string() };
        self.output_format = pick(&self.output_format, &["mkv", "mp4"], &d.output_format);
        self.original_after = pick(&self.original_after, &["keep", "trash"], &d.original_after);
        self.poster_format = pick(&self.poster_format, &["jpg", "png"], &d.poster_format);
        self.default_check = pick(&self.default_check, &["quick", "full"], &d.default_check);
        self.cover_size = pick(&self.cover_size, &["s", "m", "l"], &d.cover_size);
        self.view_mode = pick(&self.view_mode, &["grid", "table"], &d.view_mode);
        if !(50..=100).contains(&self.jpg_quality) { self.jpg_quality = d.jpg_quality; }
        if ![0, 7, 30, 90].contains(&self.recheck_reminder_days) { self.recheck_reminder_days = d.recheck_reminder_days; }
        self.folders.retain(|f| !f.trim().is_empty());
        self.folders.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        self
    }
}

/// อ่านไฟล์แล้วได้ค่ามาจากไหน บอกหน้าจอให้รู้ว่าเกิดอะไรขึ้นตอนเปิด
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LoadedFrom { File, Backup, Defaults, New }

pub struct SettingsStore {
    path: PathBuf,
    pub current: Mutex<Settings>,
    pub loaded_from: LoadedFrom,
    /// บันทึกสำเร็จแล้วอย่างน้อยครั้งหนึ่ง = ไฟล์ตั้งค่ากลับมาดีแล้ว ไม่ต้องเตือนว่าใช้ชุดสำรองอีก
    /// (เดิมเตือนทุกครั้งที่หน้าจอโหลดใหม่ แม้บันทึกทับไฟล์เสียไปแล้ว)
    saved_once: std::sync::atomic::AtomicBool,
}

/// เขียนไฟล์แบบปลอดภัย ไฟล์ชั่วคราว → ลงดิสก์ → เก็บของเดิมเป็น .bak → เปลี่ยนชื่อ
/// `backup_current` = ไฟล์ปัจจุบันอ่านได้ถูกต้องไหม · ไฟล์ปัจจุบันเสียอยู่ ห้ามคัดลอกไปทับ .bak ที่ดี
/// (เดิมคัดลอกเสมอ ไฟล์เสียครึ่งไฟล์แล้วโปรแกรมใช้ .bak พอบันทึกครั้งถัดไป .bak ที่ดีโดนไฟล์เสียทับ)
pub fn write_atomic(path: &Path, bytes: &[u8], backup_current: bool) -> std::io::Result<()> {
    if let Some(dir) = path.parent() { fs::create_dir_all(dir)?; }
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    if backup_current && path.exists() {
        let bak = path.with_extension("json.bak");
        // ไฟล์ของโปรแกรมเอง ทับ .bak เดิมได้ (คนละเรื่องกับไฟล์หนังของพี่กันที่ห้ามทับเด็ดขาด)
        fs::copy(path, &bak)?;
    }
    fs::rename(&tmp, path)
}

fn read_settings(path: &Path) -> Option<Settings> {
    let bytes = fs::read(path).ok()?;
    let v: Value = serde_json::from_slice(&bytes).ok()?;
    if !v.is_object() { return None; }
    serde_json::from_value::<Settings>(v).ok().map(Settings::sanitize)
}

impl SettingsStore {
    pub fn load(path: PathBuf) -> Self {
        let bak = path.with_extension("json.bak");
        let (s, from) = if !path.exists() && !bak.exists() {
            (Settings::default(), LoadedFrom::New)
        } else if let Some(s) = read_settings(&path) {
            (s, LoadedFrom::File)
        } else if let Some(s) = read_settings(&bak) {
            (s, LoadedFrom::Backup)
        } else {
            (Settings::default(), LoadedFrom::Defaults)
        };
        Self { path, current: Mutex::new(s), loaded_from: from, saved_once: Default::default() }
    }

    pub fn save(&self, s: &Settings) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?;
        let current_ok = read_settings(&self.path).is_some();
        write_atomic(&self.path, &bytes, current_ok).map_err(|e| format!("บันทึกการตั้งค่าไม่สำเร็จ: {e}"))?;
        self.saved_once.store(true, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    }

    /// ที่มาของการตั้งค่าที่หน้าจอควรรู้ตอนนี้ · บันทึกแล้วนับเป็นไฟล์ปกติ
    pub fn source_now(&self) -> LoadedFrom {
        if self.saved_once.load(std::sync::atomic::Ordering::Relaxed) { LoadedFrom::File } else { self.loaded_from }
    }
}

pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("settings.json"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsReply {
    pub settings: Settings,
    pub loaded_from: LoadedFrom,
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> SettingsReply {
    SettingsReply { settings: store.current.lock().unwrap().clone(), loaded_from: store.source_now() }
}

/// แก้การตั้งค่าเฉพาะช่องที่ส่งมา ช่องอื่นคงเดิม (ไม่ล้างช่องที่ไม่ได้ส่ง · data-integrity ข้อ ①)
/// บันทึกลงไฟล์ทันที บันทึกไม่สำเร็จ = ค่าในหน่วยความจำไม่เปลี่ยน แล้วส่งข้อผิดพลาดกลับไปบอกหน้าจอ
#[tauri::command]
pub fn set_settings(store: State<'_, SettingsStore>, patch: Value) -> Result<Settings, String> {
    let Value::Object(patch) = patch else { return Err("ค่าที่ส่งมาไม่ใช่ชุดการตั้งค่า".into()) };
    let mut cur = store.current.lock().unwrap();
    let mut merged = serde_json::to_value(&*cur).map_err(|e| e.to_string())?;
    let obj = merged.as_object_mut().unwrap();
    for (k, v) in patch {
        if !obj.contains_key(&k) { return Err(format!("ไม่มีการตั้งค่าชื่อ {k}")); }
        obj.insert(k, v);
    }
    let next: Settings = serde_json::from_value(merged).map_err(|e| format!("ค่าที่ส่งมาผิดชนิด: {e}"))?;
    let next = next.sanitize();
    store.save(&next)?;
    *cur = next.clone();
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-ทดสอบ-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn new_install_uses_defaults_and_saves() {
        let d = tmp_dir("ใหม่");
        let p = d.join("settings.json");
        let st = SettingsStore::load(p.clone());
        assert_eq!(st.loaded_from, LoadedFrom::New);
        assert_eq!(*st.current.lock().unwrap(), Settings::default());
        st.save(&Settings::default()).unwrap();
        assert!(p.exists());
        assert_eq!(SettingsStore::load(p).loaded_from, LoadedFrom::File);
    }

    #[test]
    fn half_written_file_falls_back_to_backup() {
        let d = tmp_dir("เสีย");
        let p = d.join("settings.json");
        let st = SettingsStore::load(p.clone());
        let mut s = Settings::default();
        s.jpg_quality = 75;
        st.save(&s).unwrap();
        s.jpg_quality = 60;
        st.save(&s).unwrap(); // ตอนนี้ .bak = 75 · ไฟล์จริง = 60
        let full = fs::read(&p).unwrap();
        fs::write(&p, &full[..full.len() / 2]).unwrap(); // ไฟล์จริงเสียครึ่งไฟล์
        let again = SettingsStore::load(p.clone());
        assert_eq!(again.loaded_from, LoadedFrom::Backup);
        assert_eq!(again.source_now(), LoadedFrom::Backup, "ยังไม่บันทึก ต้องยังเตือนว่าใช้ชุดสำรอง");
        assert_eq!(again.current.lock().unwrap().jpg_quality, 75);
        // บันทึกต่อหลังใช้สำรอง ไฟล์ที่เสียต้องไม่ไปทับ .bak ที่ดี
        s.jpg_quality = 80;
        again.save(&s).unwrap();
        assert_eq!(again.source_now(), LoadedFrom::File, "บันทึกทับไฟล์เสียแล้ว ต้องเลิกเตือน");
        let bak = read_settings(&p.with_extension("json.bak")).expect(".bak ต้องยังอ่านได้");
        assert_eq!(bak.jpg_quality, 75, ".bak ที่ดีโดนไฟล์เสียทับ");
        assert_eq!(read_settings(&p).unwrap().jpg_quality, 80);
    }

    #[test]
    fn both_broken_falls_back_to_defaults() {
        let d = tmp_dir("เสียหมด");
        let p = d.join("settings.json");
        fs::write(&p, b"{{{").unwrap();
        fs::write(p.with_extension("json.bak"), b"not json").unwrap();
        let st = SettingsStore::load(p);
        assert_eq!(st.loaded_from, LoadedFrom::Defaults);
        assert_eq!(*st.current.lock().unwrap(), Settings::default());
    }

    #[test]
    fn out_of_range_values_are_reset_not_saved() {
        let s = Settings { jpg_quality: 5, cover_size: "xl".into(), recheck_reminder_days: 12, ..Settings::default() }.sanitize();
        assert_eq!(s.jpg_quality, 90);
        assert_eq!(s.cover_size, "m");
        assert_eq!(s.recheck_reminder_days, 30);
    }

    #[test]
    fn missing_fields_in_old_file_get_defaults() {
        let d = tmp_dir("ช่องหาย");
        let p = d.join("settings.json");
        fs::write(&p, br#"{"jpgQuality": 70}"#).unwrap();
        let st = SettingsStore::load(p);
        let s = st.current.lock().unwrap();
        assert_eq!(s.jpg_quality, 70);
        assert!(s.show_names);
        assert_eq!(s.view_mode, "grid");
    }
}
