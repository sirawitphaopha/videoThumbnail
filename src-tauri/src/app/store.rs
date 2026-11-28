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
    /// เรื่องที่ยังไม่มีปก แสดงภาพสุ่มจากหนังแทนแถบทะแยง · ค่าตั้งต้นปิด (แคลร์ตั้ง)
    pub show_frames: bool,
    /// หน้ากราฟเสียง ซูมเหมือนกันทุกกราฟ · ปิด = ซูมเฉพาะกราฟที่ดูอยู่
    pub graph_zoom_all: bool,
    /// รูปกราฟที่บันทึก ขนาด ชนิด bit DPI
    pub graph_img: crate::audio::graphimg::GraphImg,
    // การ์ดเปิดเล่นหนัง · ว่าง = โปรแกรมเลือกเอง MPC-HC ก่อน (players.rs) · "system" = โปรแกรมหลักของ Windows · นอกนั้นคือที่อยู่โปรแกรม
    pub player_path: String,
    /// โปรแกรมเล่นที่พี่กันเพิ่มเอง
    pub players: Vec<String>,
    // ค่าหน้าตาที่จำไว้
    pub sidebar_collapsed: bool,
    /// "grid" | "table"
    pub view_mode: String,
    /// รหัสการเรียง เช่น "name-asc"
    pub sort: String,
    /// "tall" ดูปกตั้ง | "wide" ดูปกนอน · เรื่องที่มีปกแบบเดียวขึ้นแบบนั้นเสมอ
    pub cover_orient: String,
    /// เก็บรูปที่จับคู่ไว้ที่ไหน "beside" คัดลอกไปข้างไฟล์หนัง (ค่าตั้งต้น พี่กันเคาะ) | "app" สำเนาในโปรแกรม | "link" จับคู่อย่างเดียว
    pub link_store: String,
    /// แบบที่ติ๊กไว้ เลือกได้หลายแบบพร้อมกัน (พี่กันสั่ง 8 พ.ย. 2569) · link_store คือแบบหลักที่คิดจากค่านี้ ข้างไฟล์หนังก่อน แล้วในโปรแกรม แล้วจับคู่อย่างเดียว
    pub link_stores: Vec<String>,
    /// โทนสีทั้งโปรแกรม รายชื่ออยู่ src/lib/tones.ts
    pub tone: String,
    /// กระดานจับคู่ แผงรูปกับแผงหนัง "list" รายการ | "only" แค่รูป (พี่กันสั่ง *"เเละเราขอเปลี่ยนมุมมองเป็นทั้งเเบบที่เธอมีตอนนี้ กับเเสดงเเค่รุป"*)
    pub link_board_images: String,
    pub link_board_movies: String,
    /// บันทึกไฟล์ .sha256 ถามที่บันทึกทุกครั้ง · ปิด = บันทึกข้างไฟล์หนังทันที (BUGS ข้อ 30 พี่กันเคาะ "ตั้งค่าได้ว่าถามหรือบันทึกข้างไฟล์" · ค่าตั้งต้นถาม แคลร์ตั้ง)
    pub hash_save_ask: bool,
    /// ปิดโปรแกรมตอนขยายเต็มจออยู่ เปิดครั้งหน้าขยายเต็มจอเลย (BUGS ข้อ 89 พี่กันแทรก 13 พ.ย. 2569 "จำค่าหน้าต่างหน่อย เเบบตอนขยายจอเเล้วปิด ถ้าเปิดมาเเล้วมันก็จะขยายจอเลย")
    pub window_maximized: bool,
    /// ตัวเล่นหนังในหน้าแก้ซับ "mpv" ฝัง libmpv แบบ Subtitle Edit (ค่าตั้งต้น) | "aegisub" อ่านภาพทีละเฟรมเดินตามเสียงแบบ Aegisub
    /// (BUGS ข้อ 111 พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้")
    pub sub_player: String,
    /// รูปแบบชื่อไฟล์แทร็กที่แยกออกจากหนัง แบบ gMKVExtractGUI (BUGS ข้อ 130) · ตัวแทน {Filename} {Type} {Number} {Language} {Delay} {TrackName}
    pub extract_pattern: String,
    /// คีย์ลัดที่ตั้งเอง รหัสคำสั่งในทะเบียน src/lib/keymap.ts ไปเป็นรายการคีย์ เช่น "Ctrl+Shift+KeyS" · คำสั่งที่ไม่มีในนี้ใช้คีย์ตั้งต้น
    /// รายการว่างคือไม่ใช้คีย์ใดเลย (BUGS ข้อ 162.3 พี่กันสั่ง 28 พ.ย. 2569 "หน้าตั้งค่าที่เขียนคีย์ลัดทั้งหมด ในทุกฟังชั่น และสามารถปรับได้")
    pub hotkeys: std::collections::BTreeMap<String, Vec<String>>,
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
            show_frames: false,
            graph_zoom_all: false,
            graph_img: Default::default(),
            player_path: String::new(),
            players: vec![],
            sidebar_collapsed: false,
            view_mode: "grid".into(),
            sort: "name-asc".into(),
            cover_orient: "tall".into(),
            link_store: "beside".into(),
            // ว่างไว้ ไฟล์ตั้งค่าเก่าจะได้คิดจาก link_store เดิม ไม่กลายเป็นข้างไฟล์หนังเอง
            link_stores: vec![],
            tone: "quartz".into(),
            link_board_images: "list".into(),
            link_board_movies: "list".into(),
            hash_save_ask: true,
            window_maximized: false,
            sub_player: "mpv".into(),
            extract_pattern: crate::media::extract::DEFAULT_PATTERN.into(),
            hotkeys: Default::default(),
        }
    }
}

impl Settings {
    /// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม ได้สำเนาสองที่ · จับคู่อย่างเดียวติ๊กคู่กับแบบอื่นไม่เพิ่มไฟล์ โปรแกรมจำที่อยู่รูปต้นฉบับอยู่แล้วทุกแบบ
    pub fn normalize_link_stores(&mut self) {
        const STORES: [&str; 3] = ["beside", "app", "link"];
        self.link_stores.retain(|s| STORES.contains(&s.as_str()));
        if self.link_stores.is_empty() { self.link_stores = vec![self.link_store.clone()]; }
        if let Some(main) = STORES.iter().find(|s| self.link_stores.iter().any(|x| x == *s)) { self.link_store = main.to_string(); }
    }

    pub fn also_app(&self) -> bool {
        self.link_stores.iter().any(|x| x == "beside") && self.link_stores.iter().any(|x| x == "app")
    }

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
        self.cover_orient = pick(&self.cover_orient, &["tall", "wide"], &d.cover_orient);
        self.link_store = pick(&self.link_store, &["beside", "app", "link"], &d.link_store);
        self.normalize_link_stores();
        self.tone = pick(&self.tone, &["quartz", "wine", "night", "sage", "mauve"], &d.tone);
        self.link_board_images = pick(&self.link_board_images, &["list", "only"], &d.link_board_images);
        self.link_board_movies = pick(&self.link_board_movies, &["list", "only"], &d.link_board_movies);
        self.sub_player = pick(&self.sub_player, &["mpv", "aegisub"], &d.sub_player);
        if self.extract_pattern.trim().is_empty() || self.extract_pattern.chars().count() > 200 { self.extract_pattern = d.extract_pattern.clone(); }
        if !(50..=100).contains(&self.jpg_quality) { self.jpg_quality = d.jpg_quality; }
        if ![0, 7, 30, 90].contains(&self.recheck_reminder_days) { self.recheck_reminder_days = d.recheck_reminder_days; }
        // ค่ารูปกราฟกรองช่องต่อช่องเหมือนช่องอื่น ค่าผิดหลุดลงไฟล์แล้วบันทึกรูปกราฟพังทุกครั้ง (AUDIT ข้อ 130)
        // ช่วงตามที่หน้าตั้งค่ารับ กว้าง 0 คือตามจอ ไม่งั้น 320 ถึง 8192 · DPI 1 ถึง 9600 · คุณภาพ 1 ถึง 100
        let (g, gd) = (&mut self.graph_img, &d.graph_img);
        g.format = pick(&g.format, &["png", "jpg", "webp", "heic", "tiff"], &gd.format);
        g.subsampling = pick(&g.subsampling, &["444", "420"], &gd.subsampling);
        g.compress = pick(&g.compress, &["fast", "default", "best"], &gd.compress);
        g.dir_mode = pick(&g.dir_mode, &["beside", "folder"], &gd.dir_mode);
        if g.bits != 8 && g.bits != 16 { g.bits = gd.bits; }
        if g.width != 0 && !(320..=8192).contains(&g.width) { g.width = gd.width; }
        if !(1..=9600).contains(&g.dpi) { g.dpi = gd.dpi; }
        if !(1..=100).contains(&g.quality) { g.quality = gd.quality; }
        // โฟลเดอร์ซ้ำ เทียบทั้งรายการ ไม่สนตัวพิมพ์ และไม่สนเครื่องหมาย \ หรือ / ท้าย · D:\หนัง กับ D:\หนัง\ คือที่เดียวกัน เก็บตัวแรก (AUDIT ข้อ 130)
        // เดิม dedup_by ตัดเฉพาะตัวที่อยู่ติดกันและข้อความต้องเหมือนกันทุกตัว
        let mut seen = std::collections::HashSet::new();
        self.folders.retain(|f| !f.trim().is_empty() && seen.insert(folder_key(f)));
        self.hotkeys = clean_hotkeys(std::mem::take(&mut self.hotkeys));
        self
    }
}

/// กรองคีย์ลัดที่ตั้งเอง ไม่ปล่อยค่ามั่วลงไฟล์ (BUGS ข้อ 162.3)
/// รหัสคำสั่งเป็นตัวเล็ก ตัวเลข จุด ขีด ยาวไม่เกิน 60 · ไม่เกิน 400 คำสั่ง · คำสั่งละไม่เกิน 4 คีย์ ไม่ซ้ำกัน
/// คีย์เป็นตัวกด Ctrl Shift Alt ตามลำดับนี้ คั่นด้วย + แล้วตามด้วยชื่อปุ่ม (KeyboardEvent.code) เช่น Ctrl+Shift+KeyS F3 Numpad5
pub fn clean_hotkeys(map: std::collections::BTreeMap<String, Vec<String>>) -> std::collections::BTreeMap<String, Vec<String>> {
    let id_ok = |id: &str| !id.is_empty() && id.len() <= 60 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '.' || c == '-');
    let key_ok = |k: &str| {
        let parts: Vec<&str> = k.split('+').collect();
        let Some((code, mods)) = parts.split_last() else { return false };
        let order = ["Ctrl", "Shift", "Alt"];
        let mut last = -1i32;
        for m in mods {
            let Some(i) = order.iter().position(|o| o == m) else { return false };
            if i as i32 <= last { return false; }
            last = i as i32;
        }
        !code.is_empty() && code.len() <= 24 && code.chars().all(|c| c.is_ascii_alphanumeric()) && !["Control", "Shift", "Alt", "Meta"].iter().any(|x| code.starts_with(x))
    };
    map.into_iter().filter(|(id, _)| id_ok(id)).take(400).map(|(id, keys)| {
        let mut seen = std::collections::HashSet::new();
        let keys: Vec<String> = keys.into_iter().filter(|k| key_ok(k) && seen.insert(k.clone())).take(4).collect();
        (id, keys)
    }).collect()
}

/// ตัวเทียบโฟลเดอร์ซ้ำ ตัดช่องว่างกับเครื่องหมายคั่นท้าย แล้วเป็นตัวพิมพ์เล็ก · ใช้เทียบอย่างเดียว ค่าที่เก็บยังเป็นแบบที่พี่กันเลือก (ราก D:\ ต้องคง \ ไว้)
pub fn folder_key(f: &str) -> String {
    f.trim().trim_end_matches(['\\', '/']).to_lowercase()
}

/// อ่านไฟล์แล้วได้ค่ามาจากไหน บอกหน้าจอให้รู้ว่าเกิดอะไรขึ้นตอนเปิด
#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum LoadedFrom { File, Backup, Defaults, New, Partial }

pub struct SettingsStore {
    path: PathBuf,
    pub current: Mutex<Settings>,
    pub loaded_from: LoadedFrom,
    /// ชื่อช่องที่อ่านไม่ได้แล้วกลับเป็นค่าตั้งต้นเฉพาะช่องนั้น (ตอน loaded_from เป็น Partial) · ไว้จดบันทึกการใช้งานกับตัวเทส
    pub reset_fields: Vec<String>,
    /// ไฟล์ตั้งค่าเสียทั้งสองชุดแล้ว รายชื่อโฟลเดอร์หนังเอาคืนจากคลังหนังได้กี่โฟลเดอร์ (AUDIT ข้อ 129)
    pub recovered_folders: std::sync::atomic::AtomicUsize,
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

/// อ่านทีละช่อง ช่องที่ผิดชนิดใช้ค่าตั้งต้นเฉพาะช่องนั้น ช่องอื่นอยู่ครบ (AUDIT ข้อ 129)
/// เดิมช่องเดียวผิดชนิด (เช่นเลขเกินที่ช่องรับ) ทั้งไฟล์ถูกทิ้ง ไฟล์สำรองที่เขียนจากรุ่นเดียวกันก็ผิดแบบเดียวกัน แล้วรายชื่อโฟลเดอร์หนังหายทั้งหมด
/// ช่องที่เป็นชุดย่อย (ค่ารูปกราฟ) ลองทีละช่องย่อยด้วย · คืน None เฉพาะไฟล์ที่อ่านเป็น JSON ไม่ได้เลย
fn read_settings_lenient(path: &Path) -> Option<(Settings, Vec<String>)> {
    let bytes = fs::read(path).ok()?;
    let Value::Object(file) = serde_json::from_slice::<Value>(&bytes).ok()? else { return None };
    let mut cand = serde_json::to_value(Settings::default()).ok()?;
    let ok = |v: &Value| serde_json::from_value::<Settings>(v.clone()).is_ok();
    let mut bad = vec![];
    for (k, v) in file {
        let Some(dflt) = cand.get(&k).cloned() else { continue }; // ช่องที่รุ่นนี้ไม่รู้จัก ข้ามไป
        cand[&k] = v.clone();
        if ok(&cand) { continue; }
        cand[&k] = dflt.clone();
        match (v, dflt) {
            (Value::Object(sub), Value::Object(_)) => {
                for (k2, v2) in sub {
                    let Some(d2) = cand[&k].get(&k2).cloned() else { continue };
                    cand[&k][&k2] = v2;
                    if !ok(&cand) { cand[&k][&k2] = d2; bad.push(format!("{k}.{k2}")); }
                }
            }
            _ => bad.push(k),
        }
    }
    let s = serde_json::from_value::<Settings>(cand).ok()?.sanitize();
    Some((s, bad))
}

impl SettingsStore {
    /// ลำดับอ่าน ไฟล์จริงครบทุกช่อง → ไฟล์จริงอ่านทีละช่อง → ไฟล์สำรองครบ → ไฟล์สำรองทีละช่อง → ค่าตั้งต้น
    /// ไฟล์จริงที่เสียแค่บางช่องมาก่อนไฟล์สำรอง เพราะไฟล์สำรองช้ากว่าหนึ่งครั้ง โฟลเดอร์ที่เพิ่งเพิ่มอาจไม่มี · ไฟล์จริงที่เขียนค้างครึ่งไฟล์อ่านเป็น JSON ไม่ได้ จึงไปใช้ไฟล์สำรองตามเดิม
    pub fn load(path: PathBuf) -> Self {
        let bak = path.with_extension("json.bak");
        let mut reset_fields = vec![];
        let (s, from) = if !path.exists() && !bak.exists() {
            (Settings::default(), LoadedFrom::New)
        } else if let Some(s) = read_settings(&path) {
            (s, LoadedFrom::File)
        } else if let Some((s, bad)) = read_settings_lenient(&path) {
            reset_fields = bad;
            (s, LoadedFrom::Partial)
        } else if let Some(s) = read_settings(&bak) {
            (s, LoadedFrom::Backup)
        } else if let Some((s, bad)) = read_settings_lenient(&bak) {
            reset_fields = bad;
            (s, LoadedFrom::Partial)
        } else {
            (Settings::default(), LoadedFrom::Defaults)
        };
        Self { path, current: Mutex::new(s), loaded_from: from, reset_fields, recovered_folders: Default::default(), saved_once: Default::default() }
    }

    /// ไฟล์ตั้งค่าเสียทั้งสองชุดแล้วรายชื่อโฟลเดอร์ว่าง เอาโฟลเดอร์คืนจากคลังหนัง (ช่อง root ของแต่ละเรื่อง) แทนการเริ่มชั้นเปล่า (AUDIT ข้อ 129)
    /// เดิมพี่กันต้องเพิ่มโฟลเดอร์ใหม่เอง แล้วการอ่านโฟลเดอร์ทิ้งเรื่องที่อยู่นอกโฟลเดอร์ที่ตั้ง ประวัติตรวจกับค่า hash ของเรื่องเหล่านั้นหายตาม
    /// เก็บในหน่วยความจำ ไม่เขียนไฟล์ ครั้งแรกที่พี่กันเปลี่ยนค่าใด ๆ รายชื่อนี้จะลงไฟล์ไปด้วย · คืนจำนวนโฟลเดอร์ที่ได้คืน
    pub fn recover_folders(&self, roots: impl IntoIterator<Item = String>) -> usize {
        if self.loaded_from != LoadedFrom::Defaults { return 0; }
        let mut cur = self.current.lock().unwrap();
        if !cur.folders.is_empty() { return 0; }
        let mut next = cur.clone();
        next.folders = roots.into_iter().collect();
        let next = next.sanitize();
        let n = next.folders.len();
        *cur = next;
        self.recovered_folders.store(n, std::sync::atomic::Ordering::Relaxed);
        n
    }

    pub fn save(&self, s: &Settings) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?;
        let current_ok = read_settings(&self.path).is_some();
        // ไดรฟ์เต็มบอกตรง ๆ ว่าไดรฟ์ไหนเต็ม ไม่ใช่ข้อความของ Windows ภาษาอังกฤษ (BUGS ข้อ 88 ① · พี่กัน "ต้องบอกด้วยว่าตอนนี้ไดรฟ์เต็ม")
        // ขึ้นต้นด้วย DISK_FULL: ให้หน้าจอแยกแถบแจ้งแบบไดรฟ์เต็มได้
        write_atomic(&self.path, &bytes, current_ok).map_err(|e| if crate::app::drives::is_disk_full(&e) {
            format!("DISK_FULL:{}", crate::app::outfile::drive_letter(&self.path))
        } else { format!("บันทึกการตั้งค่าไม่สำเร็จ: {e}") })?;
        self.saved_once.store(true, std::sync::atomic::Ordering::Relaxed);
        Ok(())
    }

    /// จำว่าปิดตอนขยายเต็มจอไหม (BUGS ข้อ 89) · ค่าเดิมเท่ากันไม่เขียนไฟล์ · บันทึกไม่ได้ก็ปล่อยไป ไม่ขวางการปิดโปรแกรม
    pub fn remember_maximized(&self, v: bool) {
        let mut cur = self.current.lock().unwrap();
        if cur.window_maximized == v { return; }
        let mut next = cur.clone();
        next.window_maximized = v;
        if self.save(&next).is_ok() { *cur = next; }
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
    /// ตอนไฟล์เสียทั้งสองชุด รายชื่อโฟลเดอร์หนังได้คืนจากคลังหนังกี่โฟลเดอร์ · หน้าจอบอกในแถบแจ้ง
    pub recovered_folders: usize,
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> SettingsReply {
    SettingsReply {
        settings: store.current.lock().unwrap().clone(),
        loaded_from: store.source_now(),
        recovered_folders: store.recovered_folders.load(std::sync::atomic::Ordering::Relaxed),
    }
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
#[path = "store_tests.rs"]
mod tests;
