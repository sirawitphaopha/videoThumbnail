//! ตรวจไฟล์ (แผนขั้น 6 · สเปกข้อ 8 · TECH-REVIEW ข้อ 13)
//!
//! ตรวจแบบเร็ว  อ่านโครงไฟล์ว่าครบไหม ขาดท้ายไหม แล้วคิด SHA-256 ทั้งไฟล์เทียบกับที่จดไว้ครั้งก่อน
//! ตรวจละเอียด  ffprobe ถอดภาพเสียงทุกภาพ ข้อความผิดพลาดแปะมากับภาพที่ถอดตอนนั้น (-show_log) จึงรู้เวลาที่เสีย
//!              ห้ามใช้การ์ดจอช่วยถอดรหัส เพราะซ่อนที่เสีย (ffprobe ไม่ใช้การ์ดจอถ้าไม่สั่ง)
//!              ffmpeg -progress ใช้ไม่ได้ เวลาหยาบเกิน (ลองแล้ว ไฟล์ 60 วินาทีส่งความคืบหน้ามาแค่ 2 ครั้ง)
//! ผลตรวจเก็บลงคลังแบบรวม เขียนไฟล์คลังทุกราว 2 วินาทีกับตอนจบชุด ห้ามเขียนทีละเรื่อง (TECH-REVIEW ข้อ 12)

use std::collections::VecDeque;
use std::ffi::OsString;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::library::LibraryStore;
use crate::app::store::SettingsStore;

/// จุดเสียต่อกันห่างไม่เกินนี้ (วินาที) นับเป็นช่วงเดียว (TECH-REVIEW ข้อ 13)
pub const MERGE_GAP: f64 = 5.0;

/// ความยาวที่หัวไฟล์บอกเชื่อได้เฉพาะชนิดนี้ · TS M2TS MPG VOB บอกแบบประมาณ ห้ามใช้ตัดสินว่าขาดท้าย (TECH-REVIEW ข้อ 13)
const RELIABLE_LENGTH: [&str; 7] = ["mkv", "webm", "mp4", "mov", "m4v", "avi", "flv"];

/// ภาพเสียงจบก่อนความยาวที่หัวไฟล์บอกเกินนี้ (วินาที) = ขาดท้าย
const TAIL_TOLERANCE: f64 = 2.0;

// ---------- รวมจุดเสียเป็นช่วง ----------

/// จุดเสียหนึ่งจุดที่ตัวถอดรหัสเจอ · เวลาในเรื่อง (วินาที) และเสียที่ภาพหรือเสียง
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hit {
    pub at: f64,
    pub video: bool,
}

/// ช่วงที่เสีย หลังรวมจุดที่อยู่ใกล้กัน
#[derive(Debug, Clone, PartialEq)]
pub struct Spot {
    pub start: f64,
    pub end: f64,
    pub video: bool,
    pub audio: bool,
}

/// รวมจุดเสียเป็นช่วง · เรียงตามเวลาก่อน จุดถัดไปห่างจากท้ายช่วงไม่เกิน gap รวมเข้าช่วงเดิม
pub fn merge_hits(hits: &[Hit], gap: f64) -> Vec<Spot> {
    let mut sorted: Vec<Hit> = hits.iter().copied().filter(|h| h.at.is_finite() && h.at >= 0.0).collect();
    sorted.sort_by(|a, b| a.at.total_cmp(&b.at));
    let mut out: Vec<Spot> = Vec::new();
    for h in sorted {
        match out.last_mut() {
            Some(s) if h.at - s.end <= gap => {
                s.end = s.end.max(h.at);
                s.video |= h.video;
                s.audio |= !h.video;
            }
            _ => out.push(Spot { start: h.at, end: h.at, video: h.video, audio: !h.video }),
        }
    }
    out
}

/// เวลาแบบคนอ่าน · ไม่ถึงชั่วโมง `0:30` `12:05` · ตั้งแต่ชั่วโมง `1:12:30` · ปัดเศษวินาทีทิ้ง
pub fn fmt_time(secs: f64) -> String {
    let t = if secs.is_finite() && secs > 0.0 { secs.floor() as u64 } else { 0 };
    let (h, m, s) = (t / 3600, (t % 3600) / 60, t % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m}:{s:02}") }
}

/// คำบอกช่วงที่เสียในหน้าต่างผลตรวจ พร้อมความยาวของช่วง · คำตามต้นแบบบรรทัด 992–993
/// `ภาพแตกเป็นสี่เหลี่ยม 11 วินาที` · `เสียงเงียบหายไป 2 วินาที` · เสียทั้งสองอย่างเอาสองคำมาต่อกัน
fn spot_what(s: &Spot) -> String {
    let secs = ((s.end - s.start).ceil() as u64).max(1);
    let kind = match (s.video, s.audio) {
        (true, true) => "ภาพแตกเป็นสี่เหลี่ยมและเสียงเงียบหายไป",
        (true, false) => "ภาพแตกเป็นสี่เหลี่ยม",
        _ => "เสียงเงียบหายไป",
    };
    format!("{kind} {secs} วินาที")
}

fn spot_kind(s: &Spot) -> &'static str {
    match (s.video, s.audio) {
        (true, true) => "ภาพและเสียง",
        (true, false) => "ภาพ",
        _ => "เสียง",
    }
}

fn human(b: u64) -> String {
    if b >= 1 << 30 { format!("{:.2} GB", b as f64 / 1073741824.0) }
    else if b >= 1 << 20 { format!("{:.1} MB", b as f64 / 1048576.0) }
    else { format!("{:.0} KB", (b as f64 / 1024.0).max(1.0)) }
}

// ---------- คิวตรวจ ----------

static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP: AtomicBool = AtomicBool::new(false);

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

/// ขนาดไฟล์กับเวลาแก้ไฟล์ตอนตรวจ จดลงผลตรวจ ไว้ดูว่าไฟล์ยังเป็นไฟล์เดิมไหม
fn file_mark(path: &Path) -> (u64, i64) {
    std::fs::metadata(path).map(|md| (md.len(), md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0))).unwrap_or((0, 0))
}

/// ตรวจแบบเร็วรอบนี้ไม่เจอที่เสีย แต่ตรวจละเอียดครั้งก่อนเจอที่เสีย และไฟล์ยังเป็นไฟล์เดิม ต้องคงผลเสียหายไว้
/// ตรวจแบบเร็วดูแค่โครงไฟล์กับค่า hash มองไม่เห็นภาพแตก · เดิมทับผลเสียหายเป็นสมบูรณ์สีเขียว (AUDIT 12 พ.ย. 2569 ข้อ 3)
/// ไฟล์เดิม = ขนาดกับเวลาแก้ไฟล์เท่าตอนตรวจละเอียด · ผลตรวจรุ่นเก่าที่ไม่ได้จดไว้ ถือว่าเป็นไฟล์เดิม (คงผลเสียหาย ตรวจละเอียดซ้ำเพื่อล้าง)
/// ผลเปลี่ยนได้เมื่อไฟล์ถูกแทนด้วยไฟล์ใหม่ หรือตรวจละเอียดแล้วผ่าน
pub fn keep_deep_bad(prev_status: &str, prev: Option<&Value>, mode: &str, result: &str, mark: (u64, i64)) -> bool {
    if mode != "quick" || result == "bad" || prev_status != "bad" { return false; }
    let Some(p) = prev else { return false };
    if p["mode"].as_str() != Some("full") || p["result"].as_str() != Some("bad") { return false; }
    match (p["fileSize"].as_u64(), p["fileMtime"].as_i64()) {
        (Some(size), Some(mtime)) => size == mark.0 && mtime == mark.1,
        _ => true,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckProgress {
    id: String,
    percent: f64,
    index: usize,
    total: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckItem {
    id: String,
    error: Option<String>,
}

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct CheckFinished {
    mode: String,
    total: usize,
    done: usize,
    ok: usize,
    bad: usize,
    changed: usize,
    /// ตรวจได้บางส่วน ไฟล์ที่ตรวจแบบเร็วบอกไม่ได้ว่าครบ (AUDIT ข้อ 28)
    partial: usize,
    failed: usize,
    cancelled: bool,
    seconds: f64,
    at: i64,
}

#[tauri::command]
pub fn check_running() -> bool {
    RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
pub fn check_cancel() {
    STOP.store(true, Ordering::SeqCst);
}

/// เริ่มตรวจเรื่องที่เลือกทีละเรื่องตามลำดับ เบื้องหลัง
/// เหตุการณ์ check-started · check-progress (ไม่เกินราว 10 ครั้งต่อวินาที) · movie-updated · check-item · check-finished
#[tauri::command]
pub fn check_start(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, ids: Vec<String>, mode: String) -> Result<(), String> {
    if ids.is_empty() {
        return Err("ยังไม่ได้เลือกเรื่องที่จะตรวจ".into());
    }
    if mode != "quick" && mode != "full" {
        return Err(format!("ไม่รู้จักแบบตรวจ {mode}"));
    }
    let tools = crate::app::tools::tools_dir(&app)?;
    if RUNNING.swap(true, Ordering::SeqCst) {
        return Err("กำลังตรวจชุดก่อนอยู่ รอให้เสร็จ หรือกดหยุดตรวจทั้งชุดก่อน".into());
    }
    STOP.store(false, Ordering::SeqCst);
    let lib = lib.inner().clone();
    std::thread::spawn(move || {
        let r = run_batch(&app, &lib, &tools, &ids, &mode);
        RUNNING.store(false, Ordering::SeqCst);
        let _ = app.emit("check-finished", r);
    });
    Ok(())
}

fn run_batch(app: &AppHandle, lib: &LibraryStore, tools: &Path, ids: &[String], mode: &str) -> CheckFinished {
    let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
    let _guard = jobs.start();
    let t0 = Instant::now();
    let mut r = CheckFinished { mode: mode.into(), total: ids.len(), ..Default::default() };
    let _ = app.emit("check-started", json!({ "ids": ids, "mode": mode }));
    let mut dirty = false;
    let mut last_save = Instant::now();
    let save = |dirty: &mut bool| {
        if *dirty {
            if let Err(e) = lib.save() {
                let _ = app.emit("library-error", e);
            }
            *dirty = false;
        }
    };
    for (index, id) in ids.iter().enumerate() {
        if STOP.load(Ordering::SeqCst) || jobs.cancelled() {
            r.cancelled = true;
            break;
        }
        let fail = |r: &mut CheckFinished, e: String| {
            r.failed += 1;
            let _ = app.emit("check-item", CheckItem { id: id.clone(), error: Some(e) });
        };
        let Some(m) = lib.movies.lock().unwrap().iter().find(|m| &m.id == id).cloned() else {
            fail(&mut r, "ไม่เจอเรื่องนี้ในคลังแล้ว".into());
            continue;
        };
        let path = PathBuf::from(&m.path);
        if !path.exists() {
            fail(&mut r, "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
            continue;
        }
        let last_emit = Mutex::new(Instant::now() - Duration::from_secs(1));
        let total = ids.len();
        let on = |percent: f64| {
            let mut l = last_emit.lock().unwrap();
            if l.elapsed() >= Duration::from_millis(100) {
                *l = Instant::now();
                let _ = app.emit("check-progress", CheckProgress { id: id.clone(), percent: percent.clamp(0.0, 100.0), index, total });
            }
        };
        on(0.0);
        let stop = || STOP.load(Ordering::SeqCst) || jobs.cancelled();
        let full_ok = prev_full_ok(m.check.as_ref());
        let res = if mode == "quick" { quick(&path, m.sha256.as_deref(), full_ok, &on, &stop) } else { deep(tools, &path, m.duration, &on, &stop) };
        match res {
            Ok(None) => {
                r.cancelled = true;
                break;
            }
            Err(e) => fail(&mut r, e),
            Ok(Some(o)) => {
                let mark = file_mark(&path);
                // ไฟล์เดิมที่ตรวจละเอียดเจอที่เสียไว้ ตรวจแบบเร็วไม่ทับผลนั้น คงสถานะ ข้อความ และช่วงที่เสียไว้ทั้งหมด
                let keep = keep_deep_bad(&m.status, m.check.as_ref(), mode, o.result, mark);
                let result = if keep { "bad" } else { o.result };
                if !keep {
                    let mut info = json!({ "at": now(), "mode": mode, "result": o.result, "summary": o.summary, "spans": o.spans, "fileSize": mark.0, "fileMtime": mark.1 });
                    // ผลสมบูรณ์ที่ต่อมาจากตรวจละเอียด จดไว้ ตรวจแบบเร็วครั้งต่อไปของไฟล์ที่ตรวจโครงไม่ได้จะได้ไม่ตกเป็นตรวจได้บางส่วน
                    if mode == "quick" && o.result == "ok" && full_ok { info["basis"] = json!("full"); }
                    let updated = lib.update_movie(id, |x| {
                        x.status = o.result.into();
                        x.check = Some(info);
                        if let Some(h) = &o.sha256 {
                            x.sha256 = Some(h.clone());
                        }
                    });
                    if let Some(u) = updated {
                        let _ = app.emit("movie-updated", &u);
                    }
                }
                match result { "ok" => r.ok += 1, "bad" => r.bad += 1, "partial" => r.partial += 1, _ => r.changed += 1 }
                r.done += 1;
                dirty = true;
                let _ = app.emit("check-item", CheckItem { id: id.clone(), error: None });
                if last_save.elapsed() >= Duration::from_secs(2) {
                    save(&mut dirty);
                    last_save = Instant::now();
                }
            }
        }
    }
    save(&mut dirty);
    r.seconds = t0.elapsed().as_secs_f64();
    r.at = now();
    r
}

// ---------- เปิดเล่นที่นาที ----------

/// ข้อโต้แย้งให้โปรแกรมเล่นเปิดตรงเวลา · None = โปรแกรมนี้เปิดตรงนาทีจากคำสั่งไม่ได้ (หรือไม่รู้จัก)
/// VLC `--start-time=วินาที` · MPC-HC MPC-BE `/start มิลลิวินาที` · PotPlayer `/seek=ชม:นาที:วินาที` · mpv `--start=วินาที`
pub fn seek_args(player: &Path, file: &Path, secs: f64) -> Option<Vec<OsString>> {
    let name = player.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let s = if secs.is_finite() && secs > 0.0 { secs.floor() as u64 } else { 0 };
    let f: OsString = file.into();
    if name.contains("vlc") {
        Some(vec![format!("--start-time={s}").into(), f])
    } else if name.contains("mpc-hc") || name.contains("mpc-be") {
        Some(vec![f, "/start".into(), (s * 1000).to_string().into()])
    } else if name.contains("potplayer") {
        Some(vec![f, format!("/seek={:02}:{:02}:{:02}", s / 3600, (s % 3600) / 60, s % 60).into()])
    } else if name.contains("mpv") {
        Some(vec![format!("--start={s}").into(), f])
    } else {
        None
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayResult {
    /// ชื่อโปรแกรมที่เปิด · ว่าง = โปรแกรมหลักของ Windows
    player: String,
    /// เปิดตรงนาทีได้ไหม
    seeked: bool,
}

/// โปรแกรมเล่นตอนไม่ได้ตั้งไว้ในหน้าตั้งค่า (พี่กันสั่ง 9 พ.ย. 2569 ค่าตั้งต้นคือ MPC-HC)
/// ① MPC-HC ② โปรแกรมหลักที่เครื่องใช้เปิดไฟล์ชนิดนี้ ถ้าสั่งกระโดดนาทีได้ (ลงไว้ที่ไหนก็เจอ รวมแบบพกพา · TECH-REVIEW ข้อ 14) ③ ตัวอื่นที่หาเจอและกระโดดนาทีได้
/// None = เครื่องนี้ไม่มี ใช้โปรแกรมหลักของ Windows
pub fn auto_player(found: &[PathBuf], file: &Path) -> Option<PathBuf> {
    let ext = file.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    crate::media::players::mpc_hc(found)
        .or_else(|| crate::app::winutil::default_app_for(&ext).filter(|p| seek_args(p, file, 0.0).is_some()))
        .or_else(|| found.iter().find(|p| seek_args(p, file, 0.0).is_some()).cloned())
}

/// โปรแกรมเล่นที่จะใช้เปิดไฟล์ · ตั้งไว้ในหน้าตั้งค่าใช้ตัวนั้น ไม่ได้ตั้งเลือกเอง (auto_player) · None = ใช้โปรแกรมหลักของ Windows
/// ใช้ร่วมกับปุ่มเปิดเล่นบนชั้นวาง (library.rs) และปุ่มลองฟัง 20 วินาทีของตัวช่วยหาดีเลย์ (delay.rs)
pub fn player_for(app: &AppHandle, file: &Path) -> Result<Option<PathBuf>, String> {
    let set = app.state::<SettingsStore>().current.lock().unwrap().player_path.clone();
    if set.trim() == crate::media::players::SYSTEM {
        Ok(None)
    } else if set.trim().is_empty() {
        Ok(auto_player(&crate::media::players::scan(), file))
    } else if Path::new(&set).exists() {
        Ok(Some(PathBuf::from(&set)))
    } else {
        Err(format!("หาโปรแกรมเล่นหนัง {set} ไม่เจอ  ตั้งใหม่ได้ที่หน้าตั้งค่า"))
    }
}

/// เปิดเล่นที่นาทีที่เสีย · ใช้โปรแกรมที่ตั้งไว้ ไม่ได้ตั้งเลือกเอง (auto_player) ไม่เจอเปิดด้วยโปรแกรมหลักของ Windows (เปิดตรงนาทีไม่ได้)
#[tauri::command]
pub fn play_at(app: AppHandle, path: String, secs: f64) -> Result<PlayResult, String> {
    let file = Path::new(&path);
    if !file.exists() {
        return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into());
    }
    let player = player_for(&app, file)?;
    let Some(exe) = player else {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_path(path, None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))?;
        return Ok(PlayResult { player: String::new(), seeked: false });
    };
    let name = exe.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let (args, seeked) = match seek_args(&exe, file, secs) {
        Some(a) => (a, true),
        None => (vec![file.into()], false),
    };
    std::process::Command::new(&exe).args(args).spawn().map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}"))?;
    Ok(PlayResult { player: name, seeked })
}

mod scan;
pub use scan::*;

mod structure;
pub use structure::*;

#[cfg(test)]
mod tests;
