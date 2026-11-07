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

use crate::probe::{self, Track};
use crate::store::{write_atomic, SettingsStore};

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
}

pub struct LibraryStore {
    path: PathBuf,
    pub movies: Mutex<Vec<Movie>>,
    pub folders: Mutex<Vec<FolderState>>,
    scanning: AtomicBool,
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
        Self { path, movies: Mutex::new(lib.movies), folders: Mutex::new(vec![]), scanning: AtomicBool::new(false) }
    }

    pub fn save(&self) -> Result<(), String> {
        let movies = self.movies.lock().unwrap().clone();
        let bytes = serde_json::to_vec(&LibraryFile { version: 1, movies }).map_err(|e| e.to_string())?;
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

    /// แก้หนังหนึ่งเรื่องในคลัง (ในหน่วยความจำ) แล้วคืนของที่แก้แล้ว · บันทึกลงไฟล์ด้วย save
    pub fn update_movie(&self, id: &str, f: impl FnOnce(&mut Movie)) -> Option<Movie> {
        let mut list = self.movies.lock().unwrap();
        let m = list.iter_mut().find(|m| m.id == id)?;
        f(m);
        Some(m.clone())
    }
}

/// ไฟล์ที่เจอในโฟลเดอร์
#[derive(Debug, Clone)]
struct Found {
    path: PathBuf,
    root: String,
    size: u64,
    mtime: i64,
}

fn is_skipped_dir(name: &str) -> bool {
    name == "ไฟล์เดิม" || name.ends_with(" แยกไฟล์")
        || name.starts_with('$') || name == "System Volume Information" || name.starts_with('.')
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

/// เดินทุกโฟลเดอร์ย่อยของ root เก็บไฟล์หนังที่รับ
fn walk(dir: &Path, root: &str, skip: &[PathBuf], out: &mut Vec<Found>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if is_skipped_dir(&name) || skip.iter().any(|s| same_path(s, &p)) {
                continue;
            }
            walk(&p, root, skip, out);
        } else if ft.is_file() {
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !ACCEPTED.contains(&ext.as_str()) {
                continue;
            }
            let Ok(md) = e.metadata() else { continue };
            let mtime = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
            out.push(Found { path: p, root: root.to_string(), size: md.len(), mtime });
        }
    }
}

fn split_name(p: &Path) -> (String, String) {
    let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
    let name = p.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    (name, ext)
}

/// ทางที่ตัวอ่านใช้คุยกับข้างนอก · แยกไว้ให้เทสได้โดยไม่ต้องเปิดหน้าต่าง
pub struct ScanEnv<'a> {
    pub tools: &'a Path,
    pub thumbs: &'a Path,
    pub work: &'a Path,
    pub folders: &'a [String],
    pub originals: &'a str,
    pub workers: usize,
}

pub struct ScanResult {
    pub movies: Vec<Movie>,
    pub folders: Vec<FolderState>,

}

/// อ่านทุกโฟลเดอร์ เทียบกับคลังเดิม คืนคลังใหม่ · `on_movie` ถูกเรียกทุกครั้งที่หนังเรื่องหนึ่งอ่านเสร็จ (ปกขึ้นทีละเรื่อง)
pub fn scan_core(env: &ScanEnv, existing: Vec<Movie>, on_movie: &(dyn Fn(&Movie, usize, usize) + Sync)) -> ScanResult {
    let mut skip: Vec<PathBuf> = vec![];
    if !env.originals.trim().is_empty() {
        skip.push(PathBuf::from(env.originals));
    }
    let mut found: Vec<Found> = vec![];
    let mut folders: Vec<FolderState> = vec![];
    for root in env.folders {
        let rp = Path::new(root);
        if !rp.is_dir() {
            folders.push(FolderState { path: root.clone(), ok: false, count: 0, error: Some(format!("หาโฟลเดอร์ {root} ไม่เจอ")) });
            continue;
        }
        let before = found.len();
        walk(rp, root, &skip, &mut found);
        folders.push(FolderState { path: root.clone(), ok: true, count: found.len() - before, error: None });
    }
    let missing_roots: HashSet<&str> = folders.iter().filter(|f| !f.ok).map(|f| f.path.as_str()).collect();
    let wanted_roots: HashSet<&str> = env.folders.iter().map(String::as_str).collect();

    // คลังเดิม ค้นได้ทั้งจากเลขประจำไฟล์และที่อยู่
    let by_id: HashMap<String, Movie> = existing.iter().map(|m| (m.id.clone(), m.clone())).collect();
    let by_path: HashMap<String, String> = existing.iter().map(|m| (m.path.to_lowercase(), m.id.clone())).collect();

    let total = found.len();
    let mut keep: Vec<Movie> = vec![];
    let mut todo: VecDeque<(Found, String, Option<Movie>)> = VecDeque::new();
    let mut seen: HashSet<String> = HashSet::new();
    for f in found {
        let fid = crate::winutil::file_id(&f.path).unwrap_or_else(|| format!("path:{}", f.path.to_string_lossy().to_lowercase()));
        if !seen.insert(fid.clone()) {
            continue; // ฮาร์ดลิงก์ไฟล์เดียวกัน ขึ้นชั้นครั้งเดียว
        }
        let old = by_id.get(&fid).cloned().or_else(|| by_path.get(&f.path.to_string_lossy().to_lowercase()).and_then(|id| by_id.get(id).cloned()));
        let (name, ext) = split_name(&f.path);
        match old {
            Some(mut m) if m.size == f.size && m.mtime == f.mtime && m.error.is_none()
                && (!m.has_cover || m.thumb.as_deref().map(|t| Path::new(t).exists()).unwrap_or(false)) => {
                // ไม่เปลี่ยน · อาจแค่เปลี่ยนชื่อหรือย้ายใน Explorer
                m.id = fid;
                m.path = f.path.to_string_lossy().to_string();
                m.root = f.root.clone();
                m.name = name.clone();
                m.ext = ext;
                m.year = probe::year_of(&name);
                m.missing = false;
                keep.push(m);
            }
            old => todo.push_back((f, fid, old)),
        }
    }
    let done = Mutex::new(keep.len());
    for m in &keep {
        on_movie(m, *done.lock().unwrap(), total);
    }

    // อ่านข้อมูลไฟล์ใหม่หรือไฟล์ที่เปลี่ยน หลายไฟล์พร้อมกัน
    let queue = Mutex::new(todo);
    let fresh: Mutex<Vec<Movie>> = Mutex::new(vec![]);
    std::thread::scope(|sc| {
        for _ in 0..env.workers.max(1) {
            sc.spawn(|| loop {
                let Some((f, fid, old)) = queue.lock().unwrap().pop_front() else { break };
                let m = read_one(env, &f, &fid, old);
                let n = { let mut d = done.lock().unwrap(); *d += 1; *d };
                on_movie(&m, n, total);
                fresh.lock().unwrap().push(m);
            });
        }
    });
    let mut movies = keep;
    movies.extend(fresh.into_inner().unwrap());
    let present: HashSet<String> = movies.iter().map(|m| m.id.clone()).collect();

    // หนังในคลังที่ไม่เจอรอบนี้
    // หนังที่หายจากคลังรอบนี้ ภาพเล็กของมันลบทิ้ง
    for m in existing {
        if present.contains(&m.id) {
            continue;
        }
        if wanted_roots.contains(m.root.as_str()) && missing_roots.contains(m.root.as_str()) {
            // ไดรฟ์ถอดออก · ยังอยู่บนชั้นแบบจาง
            movies.push(Movie { missing: true, ..m });
        } else {
            // ไฟล์ถูกลบหรือย้ายออกไป หรือโฟลเดอร์ถูกเอาออกจากชั้น
            if let Some(t) = &m.thumb {
                let _ = fs::remove_file(t);
            }

        }
    }
    for f in folders.iter_mut().filter(|f| !f.ok) {
        f.count = movies.iter().filter(|m| m.root == f.path).count();
    }
    ScanResult { movies, folders }
}

/// อ่านข้อมูลไฟล์หนึ่งไฟล์ และดึงปก
fn read_one(env: &ScanEnv, f: &Found, fid: &str, old: Option<Movie>) -> Movie {
    let (name, ext) = split_name(&f.path);
    let changed = old.as_ref().map(|o| o.size != f.size || o.mtime != f.mtime).unwrap_or(false);
    let mut m = old.clone().unwrap_or_else(|| Movie { added: now(), status: "unchecked".into(), ..Default::default() });
    m.id = fid.to_string();
    m.path = f.path.to_string_lossy().to_string();
    m.root = f.root.clone();
    m.year = probe::year_of(&name);
    m.name = name;
    m.ext = ext;
    m.size = f.size;
    m.mtime = f.mtime;
    m.missing = false;
    if changed && m.status != "unchecked" {
        m.status = "changed".into();
    }
    match probe::probe(env.tools, &f.path) {
        Ok(p) => {
            m.error = None;
            m.duration = p.duration;
            m.video = p.video;
            m.video_short = p.video_short;
            m.audio = p.audio;
            m.subs = p.subs;
            m.images = p.images;
            m.has_cover = p.cover.is_some();
            let old_thumb = m.thumb.take();
            m.cover_name = None;
            m.cover_sha256 = None;
            if let Some(src) = p.cover {
                match probe::make_thumb(env.tools, &f.path, &src, env.work, env.thumbs, &safe_id(fid)) {
                    Ok(t) => {
                        m.thumb = Some(t.path.to_string_lossy().to_string());
                        m.cover_name = Some(t.cover_name);
                        m.cover_sha256 = Some(t.cover_sha256);
                    }
                    Err(e) => m.error = Some(e),
                }
            }
            if let Some(t) = old_thumb {
                if m.thumb.as_deref() != Some(t.as_str()) {
                    let _ = fs::remove_file(t);
                }
            }
        }
        Err(e) => m.error = Some(e),
    }
    m
}

/// โปรแกรมแก้ไฟล์เอง (เปลี่ยนรูปแนบ ขั้น 4) · อ่านข้อมูลไฟล์ใหม่ จดขนาดกับเวลาใหม่ ปกใหม่ ภาพเล็กใหม่
/// ประวัติตรวจคงเดิม ไม่ขึ้นว่าไฟล์ถูกเปลี่ยน (แผนขั้น 4 หลังโปรแกรมแก้ไฟล์เอง จดค่า hash ใหม่)
/// ค่า hash ทั้งไฟล์ที่จดไว้คิดใหม่จากไฟล์จริง ไม่งั้นตรวจแบบเร็วครั้งหน้าจะบอกว่าไฟล์ถูกแก้
pub fn refresh_own_edit(app: &AppHandle, path: &Path, on_hash: &dyn Fn(f64)) {
    let lib = app.state::<Arc<LibraryStore>>();
    let key = path.to_string_lossy().to_lowercase();
    let Some(old) = lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == key).cloned() else { return };
    let (Ok(tools), Ok(local), Ok(md)) = (crate::tools::tools_dir(app), app.path().app_local_data_dir(), fs::metadata(path)) else { return };
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
        m.sha256 = crate::poster::sha256_file(path, on_hash).ok();
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
        return Ok(());
    }
    let lib = lib.inner().clone();
    let tools = crate::tools::tools_dir(&app)?;
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
            // ตรวจไฟล์เสร็จระหว่างอ่านโฟลเดอร์ (ขั้น 6) ผลตรวจในคลังใหม่กว่าสำเนาตอนเริ่มอ่าน ห้ามโดนรายการที่อ่านเสร็จทับ
            let mut cur = lib.movies.lock().unwrap();
            keep_newer_checks(&mut movies, &before, &cur);
            *cur = movies.clone();
        }
        *lib.folders.lock().unwrap() = r.folders.clone();
        let saved = lib.save();
        lib.scanning.store(false, Ordering::SeqCst);
        let _ = app.emit("scan-finished", LibraryReply { movies, folders: r.folders, scanning: false });
        if let Err(e) = saved {
            let _ = app.emit("library-error", e);
        }
    });
    Ok(())
}

/// เวลาที่ตรวจครั้งล่าสุด · ไม่เคยตรวจ = 0
fn check_at(m: &Movie) -> i64 {
    m.check.as_ref().and_then(|c| c.get("at")).and_then(|v| v.as_i64()).unwrap_or(0)
}

/// ผลตรวจที่เสร็จระหว่างอ่านโฟลเดอร์ · เรื่องที่ผลตรวจในคลังตอนนี้ใหม่กว่าสำเนาตอนเริ่มอ่าน ใช้สถานะ ผลตรวจ และค่า hash ในคลัง
pub fn keep_newer_checks(scanned: &mut [Movie], before: &[Movie], now: &[Movie]) {
    for m in scanned.iter_mut() {
        let Some(cur) = now.iter().find(|c| c.id == m.id) else { continue };
        let was = before.iter().find(|b| b.id == m.id).map(check_at).unwrap_or(0);
        if check_at(cur) > was {
            m.status = cur.status.clone();
            m.check = cur.check.clone();
            m.sha256 = cur.sha256.clone();
        }
    }
}

/// เปิดเล่นด้วยโปรแกรมที่ตั้งไว้ หรือโปรแกรมหลักของ Windows
#[tauri::command]
pub fn play_movie(app: AppHandle, path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    let player = app.state::<SettingsStore>().current.lock().unwrap().player_path.clone();
    if player.trim().is_empty() {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(path, None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))
    } else if !Path::new(&player).exists() {
        Err(format!("หาโปรแกรมเล่นหนัง {player} ไม่เจอ · ตั้งใหม่ได้ที่หน้าตั้งค่า"))
    } else {
        std::process::Command::new(&player).arg(p).spawn().map(|_| ()).map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}"))
    }
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
mod tests {
    use super::*;

    fn dev_tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }
    fn movies_dir() -> PathBuf {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง");
        dunce::canonicalize(&p).unwrap_or_else(|e| panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()))
    }
    struct Temp(PathBuf);
    impl Drop for Temp {
        fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
    }
    fn temp(name: &str) -> Temp {
        let d = std::env::temp_dir().join(format!("ชั้นหนัง-คลัง-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        Temp(d)
    }

    #[test]
    fn scan_result_keeps_checks_finished_during_scan() {
        let mv = |id: &str, status: &str, at: Option<i64>| Movie {
            id: id.into(), status: status.into(), check: at.map(|a| serde_json::json!({ "at": a })), sha256: at.map(|a| format!("h{a}")), ..Default::default()
        };
        // ก่อนอ่าน · a ตรวจแล้วที่ 100 · b ยังไม่เคยตรวจ · c ตรวจแล้วที่ 50
        let before = vec![mv("a", "ok", Some(100)), mv("b", "unchecked", None), mv("c", "ok", Some(50))];
        // ระหว่างอ่าน · b ตรวจเสร็จที่ 200 ผลเสียหาย · a กับ c ไม่ได้ตรวจเพิ่ม
        let now = vec![mv("a", "ok", Some(100)), mv("b", "bad", Some(200)), mv("c", "ok", Some(50))];
        // ตัวอ่านเห็นไฟล์ c เปลี่ยนจึงตั้งเป็น changed · b ยังเป็นค่าตอนเริ่มอ่าน
        let mut scanned = vec![mv("a", "ok", Some(100)), mv("b", "unchecked", None), mv("c", "changed", Some(50))];
        keep_newer_checks(&mut scanned, &before, &now);
        assert_eq!(scanned[1].status, "bad", "ผลตรวจที่เสร็จระหว่างอ่านต้องไม่โดนทับ");
        assert_eq!(scanned[1].sha256.as_deref(), Some("h200"));
        assert_eq!(scanned[2].status, "changed", "เรื่องที่ไม่ได้ตรวจเพิ่ม ใช้ผลของตัวอ่าน");
        assert_eq!(scanned[0].status, "ok");
    }

    #[test]
    fn skipped_folders() {
        assert!(is_skipped_dir("ไฟล์เดิม"));
        assert!(is_skipped_dir("ดาวเหนือ (2023) แยกไฟล์"));
        assert!(is_skipped_dir("$RECYCLE.BIN"));
        assert!(!is_skipped_dir("หนังไทย"));
    }

    /// อ่านโฟลเดอร์ทดสอบจริง · ขึ้นชั้นครบทุกไฟล์ที่รับ · ข้ามไฟล์เดิม แยกไฟล์ และชนิดที่ไม่รับ · ปกตรงกับปกในไฟล์
    #[test]
    fn scan_test_media() {
        let src = movies_dir();
        let t = temp("อ่าน");
        let root = t.0.join("หนัง");
        fs::create_dir_all(root.join("ไฟล์เดิม")).unwrap();
        fs::create_dir_all(root.join("ดาวเหนือ (2023) แยกไฟล์")).unwrap();
        fs::create_dir_all(root.join("ซีรีส์").join("ซีซัน 1")).unwrap();
        let mut expect = 0;
        for e in fs::read_dir(&src).unwrap().flatten() {
            let p = e.path();
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if ACCEPTED.contains(&ext.as_str()) {
                fs::copy(&p, root.join(p.file_name().unwrap())).unwrap();
                expect += 1;
            }
        }
        // ของที่ต้องไม่ขึ้นชั้น
        fs::copy(src.join("Clip (2015).flv"), root.join("ไฟล์เดิม").join("Clip (2015).flv")).unwrap();
        fs::copy(src.join("Clip (2015).flv"), root.join("ดาวเหนือ (2023) แยกไฟล์").join("แยก.flv")).unwrap();
        fs::write(root.join("โน้ต.txt"), "x").unwrap();
        // ของในโฟลเดอร์ย่อยลึกสองชั้นต้องขึ้น
        fs::copy(src.join("Clip (2015).flv"), root.join("ซีรีส์").join("ซีซัน 1").join("ตอนที่ 1.flv")).unwrap();
        expect += 1;

        let thumbs = t.0.join("thumbs");
        let work = t.0.join("tmp");
        let folders = vec![root.to_string_lossy().to_string()];
        let env = ScanEnv { tools: &dev_tools(), thumbs: &thumbs, work: &work, folders: &folders, originals: "", workers: 3 };
        let calls = Mutex::new(0usize);
        let r = scan_core(&env, vec![], &|_, _, _| { *calls.lock().unwrap() += 1; });
        assert_eq!(r.movies.len(), expect, "จำนวนเรื่องบนชั้นต้องเท่าไฟล์ที่รับ");
        assert_eq!(*calls.lock().unwrap(), expect, "ต้องแจ้งหน้าจอทีละเรื่อง");
        assert!(r.movies.iter().all(|m| !m.path.contains("ไฟล์เดิม") && !m.path.contains("แยกไฟล์")));
        assert!(r.movies.iter().any(|m| m.name == "ตอนที่ 1"));
        assert!(r.movies.iter().any(|m| m.ext == "mpeg"), "นามสกุล .mpeg ต้องขึ้นชั้น");
        assert_eq!(r.folders[0], FolderState { path: folders[0].clone(), ok: true, count: expect, error: None });

        // ปก MKV ที่มีปกอยู่แล้ว ต้องตรงกับปกที่ดึงด้วย mkvextract เองทุกไบต์
        let harbor = r.movies.iter().find(|m| m.name == "Harbor Lights (2021)").unwrap();
        assert!(harbor.has_cover && harbor.thumb.is_some(), "Harbor Lights ต้องมีปก: {:?}", harbor.error);
        let mine = t.0.join("ปกเทียบ.jpg");
        let mut target = std::ffi::OsString::from("1:");
        target.push(mine.as_os_str());
        crate::tools::run_tool(&dev_tools(), "mkvextract", [std::ffi::OsStr::new(&harbor.path), std::ffi::OsStr::new("attachments"), &target]).unwrap();
        use sha2::Digest;
        let sha = probe::hex(&sha2::Sha256::digest(fs::read(&mine).unwrap()));
        assert_eq!(harbor.cover_sha256.as_deref(), Some(sha.as_str()), "ปกบนชั้นไม่ตรงกับปกในไฟล์");
        assert_eq!(harbor.cover_name.as_deref(), Some("cover.jpg"));

        let dao = r.movies.iter().find(|m| m.name == "ดาวเหนือ (2023)").unwrap();
        assert_eq!(dao.year, Some(2023));
        assert_eq!(dao.audio.len(), 2);
        assert_eq!(dao.subs.len(), 2);
        assert!(!dao.has_cover && dao.status == "unchecked");
        assert!(r.movies.iter().find(|m| m.ext == "mp4").map(|m| m.video_short.as_deref() == Some("AVC 720p")).unwrap_or(false));

        // อ่านรอบสอง ไม่มีอะไรเปลี่ยน ต้องไม่อ่านข้อมูลไฟล์ซ้ำ (เร็ว) และคลังเท่าเดิม
        let t0 = std::time::Instant::now();
        let r2 = scan_core(&env, r.movies.clone(), &|_, _, _| {});
        assert_eq!(r2.movies.len(), expect);
        assert!(t0.elapsed().as_secs_f64() < 2.0, "อ่านรอบสองช้าเกิน {:?} แปลว่าอ่านข้อมูลไฟล์ซ้ำ", t0.elapsed());

        // เปลี่ยนชื่อใน Explorer · เรื่องเดิม เลขเดิม ประวัติตรวจไม่หาย
        let mut with_check = r2.movies.clone();
        for m in with_check.iter_mut().filter(|m| m.name == "ดาวเหนือ (2023)") { m.status = "ok".into(); }
        fs::rename(root.join("ดาวเหนือ (2023).mkv"), root.join("ดาวเหนือ (2023) 1080p.mkv")).unwrap();
        let r3 = scan_core(&env, with_check, &|_, _, _| {});
        let renamed = r3.movies.iter().find(|m| m.name == "ดาวเหนือ (2023) 1080p").expect("เรื่องที่เปลี่ยนชื่อต้องยังอยู่");
        assert_eq!(renamed.id, dao.id, "เปลี่ยนชื่อแล้วต้องเป็นเรื่องเดิม");
        assert_eq!(renamed.status, "ok", "ประวัติตรวจต้องตามไปด้วย");
        assert_eq!(r3.movies.len(), expect);

        // ไดรฟ์ถอดออก · ยังอยู่บนชั้นแบบจาง
        let gone = vec![root.to_string_lossy().to_string()];
        fs::rename(&root, t.0.join("หนัง-ถอดออก")).unwrap();
        let env2 = ScanEnv { folders: &gone, ..env };
        let r4 = scan_core(&env2, r3.movies.clone(), &|_, _, _| {});
        assert_eq!(r4.movies.len(), expect, "หนังของไดรฟ์ที่ถอดออกต้องยังอยู่บนชั้น");
        assert!(r4.movies.iter().all(|m| m.missing), "ต้องติดป้ายว่าหาไฟล์ไม่เจอ");
        assert!(!r4.folders[0].ok && r4.folders[0].error.as_deref().unwrap().starts_with("หาโฟลเดอร์"));
        // ไดรฟ์ถอดออก ภาพเล็กต้องยังอยู่ เสียบกลับมาปกขึ้นทันทีไม่ต้องดึงใหม่
        let harbor_thumb = harbor.thumb.clone().unwrap();
        assert!(Path::new(&harbor_thumb).exists(), "ไดรฟ์ถอดออกแล้วภาพเล็กต้องไม่ถูกลบ");

        // เอาโฟลเดอร์ออกจากชั้น · หนังหายจากชั้น ภาพเล็กของมันถูกลบ ไม่ค้างกินที่
        let none: Vec<String> = vec![];
        let env3 = ScanEnv { folders: &none, ..env2 };
        let r5 = scan_core(&env3, r4.movies.clone(), &|_, _, _| {});
        assert!(r5.movies.is_empty(), "เอาโฟลเดอร์ออกแล้วหนังต้องหายจากชั้น");
        assert!(!Path::new(&harbor_thumb).exists(), "ภาพเล็กของหนังที่หายจากชั้นต้องถูกลบ");
    }
}
