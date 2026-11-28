//! คลังหนัง (รายชื่อหนังบนชั้น) กับตัวอ่านโฟลเดอร์ (แผนขั้น 2 · สเปกข้อ 1 3 4 5)
//! คลังเก็บใน library.json โฟลเดอร์ข้อมูลของโปรแกรม เขียนแบบปลอดภัยมีสำรองด้วยตัวเขียนตัวเดียวกับการตั้งค่า
//! อ่านโฟลเดอร์ย่อยทุกชั้น · ข้ามโฟลเดอร์ ไฟล์เดิม · โฟลเดอร์ที่ลงท้ายด้วย แยกไฟล์ · โฟลเดอร์เก็บไฟล์เดิมที่ตั้งไว้
//! อ่านข้อมูลใหม่เฉพาะไฟล์ใหม่หรือไฟล์ที่ขนาดหรือเวลาแก้ไขเปลี่ยน · จำไฟล์ด้วยเลขประจำไฟล์ของ Windows
//! เปลี่ยนชื่อใน Explorer แล้วยังเป็นเรื่องเดิม ประวัติไม่หาย (TECH-REVIEW ข้อ 12)
//! ไดรฟ์ที่ถอดออก หนังยังอยู่บนชั้นแบบจาง (missing) ไม่ลบทิ้ง

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::media::probe::{self, Track};
use crate::app::store::{write_atomic, SettingsStore};

/// ไฟล์หนังที่รับ 12 ชนิด (สเปกข้อ 10 · แผนค่าที่ต้นแบบยังไม่กำหนด) · WMV ISO ไม่รับ
pub const ACCEPTED: [&str; 12] = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Movie {
    /// เลขประจำไฟล์ของ Windows · อ่านไม่ได้ใช้ที่อยู่ไฟล์แทน
    pub id: String,
    pub path: String,
    /// โฟลเดอร์หนังในการตั้งค่าที่ไฟล์นี้อยู่ข้างใน
    pub root: String,
    /// ชื่อไฟล์ไม่รวมนามสกุล
    pub name: String,
    /// นามสกุลตัวเล็ก ไม่มีจุด
    pub ext: String,
    pub size: u64,
    pub mtime: i64,
    /// เวลาที่ขึ้นชั้นครั้งแรก ใช้เรียง เพิ่มเข้าชั้นล่าสุด
    pub added: i64,
    pub year: Option<u32>,
    pub duration: Option<f64>,
    pub video: Option<String>,
    pub video_short: Option<String>,
    pub audio: Vec<Track>,
    pub subs: Vec<Track>,
    pub images: u32,
    pub has_cover: bool,
    pub cover_name: Option<String>,
    pub cover_sha256: Option<String>,
    /// ที่อยู่ภาพเล็กของปก ในโฟลเดอร์ thumbs ของโปรแกรม
    pub thumb: Option<String>,
    /// กว้างหารสูงของปก · ชั้นวางวางปกแนวนอน (ตั้งแต่ 1 ขึ้นไป) เป็นกรอบแนวนอน · คลังเก่าไม่มีค่านี้ อ่านโฟลเดอร์รอบหน้าได้ค่า
    pub cover_aspect: Option<f32>,
    /// ปกที่สอง เมื่อไฟล์มีทั้งปกตั้งและปกนอน (cover กับ cover_land) · ปกตั้งอยู่ thumb เสมอ ปกนอนอยู่ช่องนี้
    /// ชั้นวางสลับดูได้ เรื่องที่มีแบบเดียวไม่มีช่องนี้ (พี่กัน 7 พ.ย. 2569 *"ทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้ ยกเว้นเรื่องนั้นๆมีเเค่เเนวเดียวมันจะเเสดงเเค่เเนวนั้น"*)
    pub thumb2: Option<String>,
    pub cover2_name: Option<String>,
    pub cover2_aspect: Option<f32>,
    /// "unchecked" ยังไม่เคยตรวจ · "ok" สมบูรณ์ · "bad" เสียหาย · "changed" ไฟล์เปลี่ยนหลังตรวจครั้งก่อน
    pub status: String,
    /// ผลตรวจครั้งล่าสุด (ขั้น 6)
    pub check: Option<Value>,
    /// SHA-256 ทั้งไฟล์ที่จดไว้ (ขั้น 5 ขั้น 6)
    pub sha256: Option<String>,
    /// ไดรฟ์ถอดออกหรือหาไฟล์ไม่เจอ หนังยังอยู่บนชั้นแบบจาง
    pub missing: bool,
    /// อ่านข้อมูลไฟล์ไม่ได้ บอกสาเหตุ
    pub error: Option<String>,
    /// อ่านไฟล์ได้ แต่ทำภาพเล็กของปกในไฟล์ไม่ได้ (ปกเสีย หรือชนิดรูปที่ย่อไม่ได้) · แยกจาก error ไม่ซ่อนการ์ดสภาพไฟล์ (AUDIT ข้อ 47)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_error: Option<String>,
    /// เสียงกับซับที่จับคู่ไว้ ไม่รวมเข้าไฟล์ (แผนเสียงและซับ ขั้น 7) · คลังเก่าไม่มีช่องนี้ อ่านได้เป็นว่าง
    pub pairs: Vec<crate::cover::pairs::Pair>,
    /// ปกที่จับคู่ไว้ ไม่ได้อยู่ในไฟล์ (แผนจับคู่รูปปก) · ปกตั้งกับปกนอนอย่างละหนึ่ง · คลังเก่าไม่มีช่องนี้ อ่านได้เป็นว่าง
    pub linked: Vec<crate::cover::link::LinkedCover>,
    /// เรื่องที่มีทั้งปกในไฟล์และปกจับคู่ เลือกปกที่แสดง "file" ปกในไฟล์ · ว่าง = ปกจับคู่ (พี่กันตอบตอนทำแผน *"เลือกได้"*)
    pub cover_pick: String,
    /// คะแนนดาวที่พี่กันให้ 0 ถึง 5 · 0 = ยังไม่ให้ · เก็บในคลังของโปรแกรม ไม่แตะไฟล์หนัง
    pub rating: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderState {
    pub path: String,
    pub ok: bool,
    pub count: usize,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default)]
struct LibraryFile {
    version: u32,
    movies: Vec<Movie>,
    parked: Vec<ParkedCovers>,
}

/// ปกจับคู่ของหนังที่หายจากชั้นวาง · เอาโฟลเดอร์ออกแล้วใส่กลับ โฟลเดอร์ย่อยอ่านไม่ได้ชั่วคราว ปกต้องกลับมาเอง
/// เดิมตัวอ่านลบภาพเล็กกับสำเนาในโปรแกรมถาวร ขัดกฎของแผนที่ลบได้ลงถังขยะเท่านั้น (ผู้ช่วยตรวจขั้น 8)
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct ParkedCovers {
    pub id: String,
    pub path: String,
    pub linked: Vec<crate::cover::link::LinkedCover>,
    pub cover_pick: String,
    pub rating: u8,
}

pub struct LibraryStore {
    path: PathBuf,
    pub movies: Mutex<Vec<Movie>>,
    pub parked: Mutex<Vec<ParkedCovers>>,
    pub folders: Mutex<Vec<FolderState>>,
    scanning: AtomicBool,
    /// บันทึกทีละทาง · ตรวจทั้งชุด (ทุก 2 วินาที) อ่านโฟลเดอร์ hash เปลี่ยนชื่อ บันทึกพร้อมกันได้
    /// เดิมไม่ล็อก ไฟล์ชั่วคราวชื่อเดียวกันโดนสองทางเขียนทับกัน ขึ้นแถบแดงบันทึกไม่สำเร็จ หรือสำเนาเก่าเขียนทีหลังทับของใหม่ (ผู้ช่วยตรวจโค้ดเจอ)
    save_lock: Mutex<()>,
    /// มีคนสั่งอ่านโฟลเดอร์ระหว่างกำลังอ่าน (เพิ่มหรือเอาโฟลเดอร์ออก ห่อเป็น MKV เสร็จ) · อ่านจบแล้วอ่านอีกรอบเอง
    /// เดิมคำสั่งถูกทิ้งเงียบ ๆ โฟลเดอร์ที่เพิ่งเพิ่มขึ้น 0 เรื่อง ทั้งที่แถบบอกว่ากำลังอ่าน (ผู้ช่วยตรวจโค้ดเจอ)
    rescan: AtomicBool,
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

fn read_library(path: &Path) -> Option<LibraryFile> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice::<LibraryFile>(&bytes).ok()
}

impl LibraryStore {
    /// อ่านคลัง · ไฟล์เสียใช้สำรอง · สำรองเสียเริ่มคลังว่าง (หนังกลับมาเมื่ออ่านโฟลเดอร์ใหม่ แต่ประวัติตรวจหาย)
    pub fn load(path: PathBuf) -> Self {
        let lib = read_library(&path).or_else(|| read_library(&path.with_extension("json.bak"))).unwrap_or_default();
        Self { path, movies: Mutex::new(lib.movies), parked: Mutex::new(lib.parked), folders: Mutex::new(vec![]), scanning: AtomicBool::new(false), save_lock: Mutex::new(()), rescan: AtomicBool::new(false) }
    }

    pub fn save(&self) -> Result<(), String> {
        // ถ่ายสำเนาในล็อกเดียวกับที่เขียน · ทางที่เขียนทีหลังถือสำเนาที่ใหม่กว่าเสมอ
        let _one_at_a_time = self.save_lock.lock().unwrap_or_else(|e| e.into_inner());
        let movies = self.movies.lock().unwrap().clone();
        let parked = self.parked.lock().unwrap().clone();
        let bytes = serde_json::to_vec(&LibraryFile { version: 1, movies, parked }).map_err(|e| e.to_string())?;
        let current_ok = read_library(&self.path).is_some();
        write_atomic(&self.path, &bytes, current_ok).map_err(|e| format!("บันทึกคลังหนังไม่สำเร็จ: {e}"))
    }

    pub fn is_scanning(&self) -> bool {
        self.scanning.load(Ordering::SeqCst)
    }

    /// จองคลังไว้ทำงานที่ห้ามชนกับการอ่านโฟลเดอร์ (เปลี่ยนชื่อ) · กำลังอ่านอยู่ได้ false
    /// ใช้ธงเดียวกับตัวอ่านโฟลเดอร์ ระหว่างนี้กดอ่านโฟลเดอร์ใหม่จะไม่เริ่ม
    pub fn try_begin_exclusive(&self) -> bool {
        !self.scanning.swap(true, Ordering::SeqCst)
    }

    pub fn end_exclusive(&self) {
        self.scanning.store(false, Ordering::SeqCst);
    }

    /// มีคำสั่งอ่านโฟลเดอร์มาตอนธงจองอยู่ จดไว้ให้คนที่ถือธงสั่งอ่านซ้ำตอนจบ
    pub(crate) fn mark_rescan(&self) {
        self.rescan.store(true, Ordering::SeqCst);
    }

    /// เอาคำสั่งอ่านโฟลเดอร์ที่ค้างไว้ออก · true มีคำสั่งค้าง คนที่ถือธงต้องสั่งอ่านเอง
    /// (AUDIT ข้อ 51 · เดิมเฉพาะตัวอ่านโฟลเดอร์ที่ดูธงนี้ตอนจบ เปลี่ยนชื่อปลดธงเฉย ๆ คำสั่งอ่านที่มาระหว่างนั้นหายเงียบ)
    pub fn take_rescan(&self) -> bool {
        self.rescan.swap(false, Ordering::SeqCst)
    }

    /// แก้หนังหนึ่งเรื่องในคลัง (ในหน่วยความจำ) แล้วคืนของที่แก้แล้ว · บันทึกลงไฟล์ด้วย save
    pub fn update_movie(&self, id: &str, f: impl FnOnce(&mut Movie)) -> Option<Movie> {
        let mut list = self.movies.lock().unwrap();
        let m = list.iter_mut().find(|m| m.id == id)?;
        f(m);
        Some(m.clone())
    }
}

/// โปรแกรมแก้ไฟล์เอง (เปลี่ยนรูปแนบ ขั้น 4) · อ่านข้อมูลไฟล์ใหม่ จดขนาดกับเวลาใหม่ ปกใหม่ ภาพเล็กใหม่
/// ประวัติตรวจคงเดิม ไม่ขึ้นว่าไฟล์ถูกเปลี่ยน (แผนขั้น 4 หลังโปรแกรมแก้ไฟล์เอง จดค่า hash ใหม่)
/// ค่า hash ทั้งไฟล์ที่จดไว้คิดใหม่จากไฟล์จริง ไม่งั้นตรวจแบบเร็วครั้งหน้าจะบอกว่าไฟล์ถูกแก้
pub fn refresh_own_edit(app: &AppHandle, path: &Path, on_hash: &dyn Fn(f64)) {
    let lib = app.state::<Arc<LibraryStore>>();
    let key = path.to_string_lossy().to_lowercase();
    let Some(old) = lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == key).cloned() else { return };
    let (Ok(tools), Ok(local), Ok(md)) = (crate::app::tools::tools_dir(app), app.path().app_local_data_dir(), fs::metadata(path)) else { return };
    let (folders, originals) = {
        let s = app.state::<SettingsStore>();
        let s = s.current.lock().unwrap();
        (s.folders.clone(), s.originals_folder.clone())
    };
    let env = ScanEnv { tools: &tools, thumbs: &local.join("thumbs"), work: &local.join("tmp"), folders: &folders, originals: &originals, workers: 1 };
    let mtime = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
    let f = Found { path: path.to_path_buf(), root: old.root.clone(), size: md.len(), mtime };
    let mut m = read_one(&env, &f, &old.id, Some(old.clone()));
    m.status = old.status.clone();
    m.check = old.check.clone();
    if old.sha256.is_some() {
        m.sha256 = crate::app::outfile::sha256_file(path, on_hash).ok();
    }
    lib.update_movie(&old.id, |x| *x = m.clone());
    let _ = app.emit("movie-updated", &m);
    if let Err(e) = lib.save() {
        let _ = app.emit("library-error", e);
    }
}

/// ตั้งสถานะตรวจกับค่า hash ให้หนังหนึ่งเรื่อง ใช้ในเทสหน้าจอขั้น 4 (ยังไม่มีหน้าตรวจไฟล์) · ตัวติดตั้งจริงไม่มีคำสั่งนี้
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_set_check(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, path: String, status: String, sha256: Option<String>, check_at: Option<i64>, spans: Option<serde_json::Value>) -> Result<(), String> {
    let id = lib.movies.lock().unwrap().iter().find(|m| m.path.eq_ignore_ascii_case(&path)).map(|m| m.id.clone()).ok_or("ไม่เจอเรื่องนี้ในคลัง")?;
    // check_at ใช้เทสเตือนตรวจซ้ำ (ขั้น 6) ตั้งเวลาตรวจครั้งล่าสุดย้อนหลังได้
    // spans ใช้เทสหน้ากราฟเสียง ผลตรวจละเอียดที่มีจุดเสียเป็นเสียง (ไฟล์ทดสอบที่ทำเสีย ตัวตรวจจับได้แค่ภาพแตก)
    let m = lib.update_movie(&id, |m| {
        if let Some(at) = check_at {
            m.check = Some(match &spans {
                Some(sp) => serde_json::json!({ "at": at, "mode": "full", "result": status, "summary": "ตรวจละเอียด เจอจุดเสีย", "spans": sp }),
                None => serde_json::json!({ "at": at, "mode": "quick", "result": status, "summary": "ตรวจแบบเร็ว โครงไฟล์ครบ ค่า hash ตรงกับครั้งก่อน", "spans": [] }),
            });
        }
        m.status = status;
        m.sha256 = sha256;
    }).unwrap();
    let _ = app.emit("movie-updated", &m);
    lib.save()
}

/// เลขประจำไฟล์ที่ใช้เป็นชื่อไฟล์ได้
fn safe_id(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).take(80).collect()
}

// ---------- คำสั่งให้หน้าจอเรียก ----------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryReply {
    pub movies: Vec<Movie>,
    pub folders: Vec<FolderState>,
    pub scanning: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    done: usize,
    total: usize,
}

pub fn library_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("library.json"))
}

#[tauri::command]
pub fn get_library(lib: State<'_, Arc<LibraryStore>>) -> LibraryReply {
    LibraryReply {
        movies: lib.movies.lock().unwrap().clone(),
        folders: lib.folders.lock().unwrap().clone(),
        scanning: lib.is_scanning(),
    }
}

/// เริ่มอ่านโฟลเดอร์เบื้องหลัง · กำลังอ่านอยู่แล้วไม่เริ่มซ้ำ
/// ส่งเหตุการณ์ scan-started · scan-progress · movie-updated (ทีละเรื่อง) · scan-finished (คลังทั้งก้อน)
/// อ่านอย่างเดียว ไม่แตะไฟล์หนัง จึงไม่ถือตัวกันปิด · เครื่องมือที่เปิดอยู่ตายตามโปรแกรมด้วย Job Object
#[tauri::command]
pub fn scan_library(app: AppHandle, lib: State<'_, Arc<LibraryStore>>) -> Result<(), String> {
    if lib.scanning.swap(true, Ordering::SeqCst) {
        lib.mark_rescan();
        return Ok(());
    }
    let lib = lib.inner().clone();
    let tools = crate::app::tools::tools_dir(&app)?;
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let (folders, originals) = {
        let s = app.state::<SettingsStore>();
        let s = s.current.lock().unwrap();
        (s.folders.clone(), s.originals_folder.clone())
    };
    let _ = app.emit("scan-started", &folders);
    std::thread::spawn(move || {
        let env = ScanEnv { tools: &tools, thumbs: &local.join("thumbs"), work: &local.join("tmp"), folders: &folders, originals: &originals, workers: 3 };
        let existing = lib.movies.lock().unwrap().clone();
        let before = existing.clone();
        let last = Mutex::new(std::time::Instant::now() - std::time::Duration::from_secs(1));
        let r = scan_core(&env, existing, &|m, done, total| {
            let _ = app.emit("movie-updated", m);
            let mut l = last.lock().unwrap();
            // ความคืบหน้าไม่เกินราว 10 ครั้งต่อวินาที (TECH-REVIEW ข้อ 8)
            if l.elapsed().as_millis() >= 100 || done == total {
                *l = std::time::Instant::now();
                let _ = app.emit("scan-progress", Progress { done, total });
            }
        });
        let mut movies = r.movies;
        {
            let mut p = lib.parked.lock().unwrap();
            for x in r.parked { p.retain(|o| o.id != x.id); p.push(x); }
            restore_parked(&mut movies, &mut p);
        }
        {
            // ตรวจไฟล์เสร็จระหว่างอ่านโฟลเดอร์ (ขั้น 6) ผลตรวจในคลังใหม่กว่าสำเนาตอนเริ่มอ่าน ห้ามโดนรายการที่อ่านเสร็จทับ
            let mut cur = lib.movies.lock().unwrap();
            keep_newer_checks(&mut movies, &before, &cur);
            *cur = movies.clone();
        }
        *lib.folders.lock().unwrap() = r.folders.clone();
        let saved = lib.save();
        lib.scanning.store(false, Ordering::SeqCst);
        let again = lib.take_rescan();
        let _ = app.emit("scan-finished", LibraryReply { movies, folders: r.folders, scanning: false });
        if let Err(e) = saved {
            let _ = app.emit("library-error", e);
        }
        if again {
            let _ = scan_library(app.clone(), app.state::<Arc<LibraryStore>>());
        }
    });
    Ok(())
}

/// เวลาที่ตรวจครั้งล่าสุด · ไม่เคยตรวจ = 0
fn check_at(m: &Movie) -> i64 {
    m.check.as_ref().and_then(|c| c.get("at")).and_then(|v| v.as_i64()).unwrap_or(0)
}

/// ล้างปกที่จำไว้ของหนังที่หาย มีเฉพาะตอนทดสอบ · ตัวตรวจลบชุดทดสอบแล้วลอกกลับที่อยู่เดิม ปกรอบก่อนต้องไม่กลับมา
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_clear_parked(lib: State<'_, Arc<LibraryStore>>) -> Result<(), String> {
    lib.parked.lock().unwrap().clear();
    lib.save()
}

/// ผลตรวจที่เสร็จระหว่างอ่านโฟลเดอร์ · เรื่องที่ผลตรวจในคลังตอนนี้ใหม่กว่าสำเนาตอนเริ่มอ่าน ใช้สถานะ ผลตรวจ และค่า hash ในคลัง
/// เรื่องที่ถูกแก้ในคลังระหว่างอ่านแบบอื่น (จดคลังหลังโปรแกรมเปลี่ยนรูปแนบเอง) ใช้ของในคลังทั้งเรื่อง เพราะใหม่กว่าที่ตัวอ่านเห็น
/// เดิมตัวอ่านเอาสำเนาตอนเริ่มมาทับ เรื่องที่เพิ่งใส่ปกได้ขนาดเก่า hash เก่า อ่านครั้งหน้าขึ้นว่าไฟล์ถูกเปลี่ยน (ผู้ช่วยตรวจโค้ดข้อ 12
/// เจอจริงในตัวเทสขั้น 4 หลังให้ตัวอ่านอ่านซ้ำเองเมื่อมีคำสั่งระหว่างอ่าน ช่วงอ่านยาวขึ้นจึงชนบ่อยขึ้น)
pub fn keep_newer_checks(scanned: &mut [Movie], before: &[Movie], now: &[Movie]) {
    for m in scanned.iter_mut() {
        let Some(cur) = now.iter().find(|c| c.id == m.id) else { continue };
        let old = before.iter().find(|b| b.id == m.id);
        let was = old.map(check_at).unwrap_or(0);
        if check_at(cur) > was {
            m.status = cur.status.clone();
            m.check = cur.check.clone();
            m.sha256 = cur.sha256.clone();
        } else if old.is_some_and(|o| o != cur) {
            *m = cur.clone();
        }
    }
}

/// เปิดเล่นด้วยโปรแกรมที่ตั้งไว้ ไม่ได้ตั้งใช้ MPC-HC ไม่มีใช้ตัวอื่นที่หาเจอ แล้วค่อยโปรแกรมหลักของ Windows (check::player_for)
#[tauri::command(async)]
pub fn play_movie(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    // กติกาเดียวกับปุ่มเปิดเล่นที่นาทีที่เสีย (AUDIT ข้อ 133)
    if !crate::media::check::playable(p) {
        return Err("เปิดเล่นได้เฉพาะไฟล์หนังกับไฟล์เสียง".into());
    }
    if !p.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    match crate::media::check::player_for(&app, p)? {
        Some(exe) => std::process::Command::new(&exe).arg(p).spawn().map(|_| ()).map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}")),
        None => {
            use tauri_plugin_opener::OpenerExt;
            app.opener().open_path(path, None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))
        }
    }
}

/// ให้คะแนนดาว 0 ถึง 5 · 0 = ล้างคะแนน
#[tauri::command]
pub fn set_rating(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, id: String, stars: u8) -> Result<Movie, String> {
    if stars > 5 { return Err("คะแนนต้องอยู่ระหว่าง 0 ถึง 5 ดาว".into()); }
    let m = lib.update_movie(&id, |m| m.rating = stars).ok_or("หาหนังในคลังไม่เจอ")?;
    lib.save()?;
    let _ = app.emit("movie-updated", &m);
    Ok(m)
}

/// เปิดโฟลเดอร์ที่เก็บไฟล์ แล้วเลือกไฟล์นั้นไว้
#[tauri::command]
pub fn reveal_movie(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener().reveal_item_in_dir(p).map_err(|e| format!("เปิดโฟลเดอร์ไม่ได้: {e}"))
}

#[cfg(test)]
mod park_tests;

mod scan;
pub use scan::*;

#[cfg(test)]
mod tests;
