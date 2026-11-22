//! ตัวดูซับ (แผนเสียงและซับ ขั้น 6 · มอคอัปหัวข้อ 4)
//! ซับตัวหนังสือ SRT ASS SSA VTT · อ่านจากไฟล์ที่เพิ่ม หรือดึงจากหนัง (MKV ใช้ mkvextract ได้ไฟล์ต้นฉบับทุกตัวอักษร · MP4 ใช้ ffmpeg แปลงเป็น SRT)
//! อ่านรหัสอักษร UTF-8 UTF-16 (มี BOM) และไทยแบบเก่า TIS-620 / CP874 ให้อ่านได้ · ดูอย่างเดียว ไม่แก้ไฟล์
//! ภาพหนังตรงเวลานั้น (ffmpeg 1 ภาพ) · คลื่นเสียงช่วงนั้น (ตัวถอดเสียงเดียวกับตัวช่วยหาดีเลย์)
//! ซับรูป PGS VobSub ถอดด้วย ffmpeg แบบ sub2video ได้ภาพทุกครั้งที่ซับเปลี่ยน · ตัดภาพว่าง (ตอนซับหาย) กับภาพซ้ำออก ครอปเฉพาะส่วนที่มีตัวหนังสือ เก็บไว้ในโฟลเดอร์ชั่วคราว

use crate::app::tools::{run_tool_timeout, tool_succeeded, tools_dir};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub n: usize,
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubText {
    /// ข้อความไฟล์ทุกตัวอักษร (แบบ notepad)
    pub raw: String,
    /// srt ass vtt
    pub kind: String,
    /// UTF-8 · UTF-16 · TIS-620
    pub charset: String,
    pub cues: Vec<Cue>,
}

/// ภาพสุ่มจากหนัง แสดงแทนแถบทะแยงในเรื่องที่ยังไม่มีปก (พี่กันสั่ง 9 พ.ย. 2569)
/// เก็บในโฟลเดอร์ frames ของโปรแกรม ไม่แตะไฟล์หนัง · ไฟล์เดิมได้ภาพเดิม ไฟล์เปลี่ยนจึงสุ่มใหม่ · ไม่ใช่ปก ไม่นับในตัวกรอง
#[tauri::command]
pub async fn movie_frame(app: AppHandle, path: String, duration: f64) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    let tools = tools_dir(&app)?;
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("frames");
    tauri::async_runtime::spawn_blocking(move || {
        let movie = need(&path)?;
        let meta = std::fs::metadata(&movie).map_err(|e| e.to_string())?;
        let mut h = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut h);
        meta.len().hash(&mut h);
        meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).hash(&mut h);
        let key = h.finish();
        let out = dir.join(format!("{key:016x}.jpg"));
        if out.exists() { return Ok(Some(out.to_string_lossy().to_string())); }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let mut best: Option<Vec<u8>> = None;
        for attempt in 0..3 {
            let Ok(jpg) = frame_jpg(&tools, &movie, frame_time(duration, key, attempt), 540) else { continue };
            let enough = jpg.len() >= FRAME_MIN_BYTES;
            if best.as_ref().map(|b| jpg.len() > b.len()).unwrap_or(true) { best = Some(jpg); }
            if enough { break; }
        }
        // ดึงภาพไม่ได้ (ไฟล์ไม่มีภาพ หรือเสีย) ยังเป็นแถบทะแยงตามเดิม ไม่ถือว่าผิดพลาด
        let Some(jpg) = best else { return Ok(None) };
        crate::app::store::write_atomic(&out, &jpg, false).map_err(|e| e.to_string())?;
        Ok(Some(out.to_string_lossy().to_string()))
    }).await.map_err(|e| e.to_string())?
}

/// คำสั่งของหน้าต่างสีของ VobSub · วาดใหม่แล้วตั้งภาพของงาน OCR ตามภาพใหม่ ข้อความที่อ่านไว้ไม่หาย
#[tauri::command]
pub async fn ocr_vobsub_recolor(app: AppHandle, path: String, ff: u64, colors: Option<[[u8; 4]; 4]>) -> Result<Vec<SubImg>, String> {
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let out = vobsub_recolor(&work, &need(&path)?, ff, colors)?;
        crate::ocr::ocrjob::update_images(&out);
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ocr_vobsub_preview(app: AppHandle, path: String, ff: u64, n: usize, colors: Option<[[u8; 4]; 4]>) -> Result<String, String> {
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || vobsub_preview(&work, &need(&path)?, ff, n, colors)).await.map_err(|e| e.to_string())?
}

fn need(p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.exists() { Ok(pb) } else { Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()) }
}

#[tauri::command]
pub async fn sub_text(app: AppHandle, path: String, in_movie: bool, tid: u64, ff: u64) -> Result<SubText, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || text_of(&tools, &work, &need(&path)?, in_movie, tid, ff)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sub_frame(app: AppHandle, movie: String, t: f64, h: Option<u32>) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || frame(&tools, &need(&movie)?, t, h.unwrap_or(360).clamp(120, 1080))).await.map_err(|e| e.to_string())?
}

/// คลื่นเสียงช่วง [t0, t1] ของแทร็กเสียงในหนัง ทีละคอลัมน์ 0–1
#[tauri::command]
pub async fn sub_wave(app: AppHandle, movie: String, stream: u64, t0: f64, t1: f64, cols: usize) -> Result<Vec<f32>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let x = crate::audio::delay::decode(&tools, &need(&movie)?, stream, t0, (t1 - t0).max(0.2))?;
        Ok(crate::audio::delay::peaks(&x, (x.len() / cols.max(50)).max(1)))
    }).await.map_err(|e| e.to_string())?
}

/// ความคืบหน้าของการถอดซับรูปทั้งแทร็ก ส่งทางเหตุการณ์ subimg-progress { path ff percent } เมื่อเปอร์เซ็นต์เต็มเปลี่ยน
/// หน้าจอใช้แสดงแถบความคืบหน้ากับเวลาที่เดินระหว่างรอ (BUGS ข้อ 144)
pub(crate) fn progress_to(app: &AppHandle, path: &str, ff: u64) -> impl Fn(f64) + Send + Sync + use<> {
    let app = app.clone();
    let path = path.to_string();
    let last = std::sync::atomic::AtomicI64::new(-1);
    move |p: f64| {
        let v = p.clamp(0.0, 100.0).floor() as i64;
        if last.swap(v, std::sync::atomic::Ordering::Relaxed) != v {
            let _ = tauri::Emitter::emit(&app, "subimg-progress", serde_json::json!({ "path": path, "ff": ff, "percent": v }));
        }
    }
}

/// ซับรูปทีละหน้า · ครั้งแรกถอดทั้งแทร็ก (หนังยาวใช้เวลา เพราะต้องอ่านทั้งไฟล์)
#[tauri::command]
pub async fn sub_images(app: AppHandle, path: String, ff: u64, page: usize, per: usize) -> Result<ImgPage, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    let on = progress_to(&app, &path, ff);
    tauri::async_runtime::spawn_blocking(move || {
        let all = images_with(&tools, &work, &need(&path)?, ff, &on)?;
        let per = per.clamp(1, 48);
        let items = all.iter().skip(page * per).take(per).map(|i| {
            let png = std::fs::read(&i.file).map(|b| format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b))).unwrap_or_default();
            ImgItem { img: i.clone(), png }
        }).collect();
        Ok(ImgPage { total: all.len(), items })
    }).await.map_err(|e| e.to_string())?
}

/// เวลาของทุกภาพในซับรูป ไม่มีตัวภาพ ไว้ทำรายการเวลาด้านซ้ายของตัวดูซับรูปให้กดไปภาพนั้น
/// (BUGS ข้อ 141 พี่กันขอ 15 พ.ย. 2569 "ขอฝั่งซ้าย มีเวลาให้กดได้") · ใช้ผลถอดชุดเดียวกับ sub_images ไม่ถอดซ้ำ
#[tauri::command]
pub async fn sub_image_times(app: AppHandle, path: String, ff: u64) -> Result<Vec<SubImg>, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    let on = progress_to(&app, &path, ff);
    tauri::async_runtime::spawn_blocking(move || images_with(&tools, &work, &need(&path)?, ff, &on))
        .await.map_err(|e| e.to_string())?
}

mod picture;
pub use picture::*;

mod text;
pub use text::*;

#[cfg(test)]
mod tests;
