//! หน้าใส่โปสเตอร์ (แผนขั้น 4 · สเปกข้อ 7) · คำสั่งของหน้าจอทั้งหมดอยู่ที่นี่ งานรูปอยู่ poster_image.rs
//! ① MKV อยู่แล้ว → เปลี่ยนแค่รูปแนบด้วย mkvpropedit (เช็กก่อนว่าไฟล์ไม่ถูกเปิดอยู่)
//! ② ไฟล์อื่น → mkvmerge ครอบเป็นไฟล์ .partial ในโฟลเดอร์เดียวกัน → ตรวจเทียบต้นทาง → เปลี่ยนเป็นไฟล์จริง
//! ③ ส่งออก MP4 → ffmpeg ไม่แปลงภาพเสียงใหม่ ปกติดป้ายภาพปก · แทร็กที่ MP4 ใส่ไม่ได้ต้องบอกก่อน
//! 🔴 ไฟล์เดิมไม่ถูกแตะจนกว่าไฟล์ใหม่ตรวจผ่าน · ย้ายทุกครั้งใช้ move_no_replace ไม่เขียนทับ (TECH-REVIEW ข้อ 1)
//! 🔴 กดหยุดกลางทาง ไฟล์ที่ทำค้างถูกลบ ไฟล์เดิมไม่ถูกแตะ · เครื่องมือตายตามโปรแกรมด้วย Job Object
//! 🔴 MKVToolNix ตอบรหัส 1 = สำเร็จแต่มีคำเตือน · ffmpeg ใช้ -n ไม่ใช้ -y (TECH-REVIEW ข้อ 2 ข้อ 3)

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use image::RgbImage;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::poster_image::{self as pi, Geometry};
use crate::rename::MAX_PATH_LEN;
use crate::outfile::{
    cancelled, fail, finish_output, ApplyProblem, count, drive_letter, duration_of, eta, ffprobe_json, fmt_gb, free_space, has_attached_pic, kind_word,
    mkv_attachments, not_in_use, run_live, scopeguard, streams_of, Counts, Run, StreamInfo,
};
use crate::tools::{run_tool_timeout, tool_succeeded};

// ---------------------------------------------------------------- ที่เก็บสถานะของหน้า

struct Source {
    img: RgbImage,
}

#[derive(Default)]
pub struct PosterState {
    source: Mutex<Option<Source>>,
    /// ผลหมุน ครอป ย่อ ของค่าล่าสุด · เลื่อนแถบคุณภาพไม่ต้องคิดรูปใหม่ เข้ารหัสใหม่อย่างเดียว
    /// รูปที่ทำแล้ว · จำคู่กับค่าย่อรูปที่ใหญ่เกินตอนทำ เปลี่ยนสวิตช์แล้วทำใหม่
    rendered: Mutex<Option<(Geometry, RgbImage, (u32, u32), bool)>>,
    /// รูปที่กด ใช้รูปนี้ แล้ว (ไบต์ที่จะแนบจริง)
    chosen: Mutex<Option<(Vec<u8>, String)>>,
    /// ไฟล์ภาพตัวอย่างที่โปรแกรมสร้าง แยกตามชนิด สร้างใหม่แล้วลบของเก่า ไม่ให้กองในเครื่อง
    previews: Mutex<HashMap<String, PathBuf>>,
    thumbs: Mutex<HashMap<String, FolderImage>>,
    cancel: AtomicBool,
    running: AtomicBool,
}

impl PosterState {
    fn keep_preview(&self, kind: &str, p: PathBuf) {
        if let Some(old) = self.previews.lock().unwrap().insert(kind.to_string(), p) {
            let _ = std::fs::remove_file(old);
        }
    }
}

struct Dirs {
    tools: PathBuf,
    work: PathBuf,
    previews: PathBuf,
}

fn dirs(app: &AppHandle) -> Result<Dirs, String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(Dirs { tools: crate::tools::tools_dir(app)?, work: local.join("tmp"), previews: local.join("previews") })
}

// ---------------------------------------------------------------- รูป

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PosterInfo {
    path: String,
    name: String,
    ext: String,
    /// JPG PNG แนบได้เลย · ชนิดอื่นแปลงให้ก่อน
    attachable: bool,
    width: u32,
    height: u32,
    aspect: String,
    two_three: bool,
    preview: String,
    file_size: u64,
    exif: u8,
    icc: bool,
    /// กรอบ 2 : 3 ตั้งต้น (ซูม 100% อยู่กลาง) เป็นสัดส่วน x y w h
    crop: [f64; 4],
}

/// เปิดรูปที่ลากมาวางหรือเลือก · อ่านจริงแล้วเก็บไว้ในหน่วยความจำ · รูปเดิมในเครื่องไม่ถูกแก้
#[tauri::command]
pub async fn poster_open(app: AppHandle, path: String) -> Result<PosterInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let p = PathBuf::from(&path);
        let size = std::fs::metadata(&p).map_err(|_| "หารูปไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว".to_string())?.len();
        let dec = pi::decode(&d.tools, &d.work, &p)?;
        let (w, h) = dec.img.dimensions();
        let preview = pi::write_preview(&dec.img, 1200, &d.previews, "src")?;
        let st = app.state::<PosterState>();
        st.keep_preview("src", preview.clone());
        *st.rendered.lock().unwrap() = None;
        *st.chosen.lock().unwrap() = None;
        *st.source.lock().unwrap() = Some(Source { img: dec.img });
        let ext = pi::ext_of(&p);
        let (x, y, cw, ch) = pi::default_crop(w, h);
        Ok(PosterInfo {
            path, name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            attachable: pi::ATTACHABLE.contains(&ext.as_str()), ext, width: w, height: h,
            aspect: pi::aspect_label(w, h), two_three: pi::aspect_label(w, h) == "2 : 3",
            preview: preview.to_string_lossy().to_string(), file_size: size, exif: dec.exif_orientation, icc: dec.icc_converted,
            crop: [x, y, cw, ch],
        })
    }).await.map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderReq {
    geo: Geometry,
    format: String,
    quality: u8,
    /// กด ใช้รูปนี้ · เก็บไบต์นี้ไว้แนบจริง
    #[serde(default)]
    choose: bool,
    /// คิดขนาดไฟล์ของคุณภาพ 100 90 75 50 ด้วย (ตารางในส่วนแปลงชนิดรูป)
    #[serde(default)]
    sizes: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderInfo {
    /// ขนาดไฟล์จริงจากการเข้ารหัส
    bytes: u64,
    width: u32,
    height: u32,
    crop_w: u32,
    crop_h: u32,
    /// ส่วนที่ครอปเล็กกว่า 600 × 900
    small: bool,
    /// ไฟล์รูปที่เข้ารหัสแล้วจริง (ตัวเดียวกับที่จะแนบ)
    preview: String,
    sizes: Vec<(u8, u64)>,
}

/// หมุน ครอป ย่อ แล้วเข้ารหัสจริง · บอกขนาดไฟล์จริง
#[tauri::command]
pub async fn poster_render(app: AppHandle, req: RenderReq) -> Result<RenderInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let st = app.state::<PosterState>();
        // สวิตช์ ย่อรูปโปสเตอร์ที่ใหญ่เกิน ในหน้าตั้งค่า (เดิมไม่มีโค้ดอ่านค่านี้ ย่อเป็น 1000 × 1500 ทุกครั้ง ผู้ช่วยตรวจสเปกเจอ)
        let shrink = app.state::<crate::store::SettingsStore>().current.lock().unwrap().shrink_large_posters;
        let mut cache = st.rendered.lock().unwrap();
        if cache.as_ref().map(|c| c.0 != req.geo || c.3 != shrink).unwrap_or(true) {
            let src = st.source.lock().unwrap();
            let Some(src) = src.as_ref() else { return Err("ยังไม่ได้เลือกรูปโปสเตอร์".to_string()) };
            let (img, crop) = pi::render(&src.img, &req.geo, shrink);
            *cache = Some((req.geo.clone(), img, crop, shrink));
        }
        let (_, img, crop, _) = cache.as_ref().unwrap();
        let format = if req.format == "png" { "png" } else { "jpg" };
        let bytes = pi::encode(img, format, req.quality)?;
        std::fs::create_dir_all(&d.previews).map_err(|e| e.to_string())?;
        let preview = d.previews.join(format!("render-{}.{format}", pi::unique()));
        std::fs::write(&preview, &bytes).map_err(|e| e.to_string())?;
        // ภาพของรูปที่กดใช้แล้วเก็บช่องแยก · เดิมใช้ช่องเดียวกับภาพในหน้าต่างครอป เปิดครอปอีกครั้งแล้วกดยกเลิก การ์ดชี้ไฟล์ที่ถูกลบ รูปเสีย (ผู้ช่วยตรวจโค้ดเจอ)
        st.keep_preview(if req.choose { "chosen" } else { "render" }, preview.clone());
        let sizes = if req.sizes && format == "jpg" {
            [100u8, 90, 75, 50].iter().map(|q| (*q, pi::encode(img, "jpg", *q).map(|b| b.len() as u64).unwrap_or(0))).collect()
        } else {
            vec![]
        };
        let info = RenderInfo {
            bytes: bytes.len() as u64, width: img.width(), height: img.height(), crop_w: crop.0, crop_h: crop.1,
            small: req.geo.mode == "crop" && (crop.0 < pi::SMALL_W || crop.1 < pi::SMALL_H),
            preview: preview.to_string_lossy().to_string(), sizes,
        };
        if req.choose {
            *st.chosen.lock().unwrap() = Some((bytes, format.to_string()));
        }
        Ok(info)
    }).await.map_err(|e| e.to_string())?
}

/// ล้างรูปที่เลือกไว้ (ปุ่ม ล้างทั้งหมด · เปลี่ยนรูป)
#[tauri::command]
pub fn poster_clear(st: State<'_, PosterState>) {
    *st.source.lock().unwrap() = None;
    *st.rendered.lock().unwrap() = None;
    *st.chosen.lock().unwrap() = None;
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderImage {
    path: String,
    name: String,
    ext: String,
    width: u32,
    height: u32,
    thumb: Option<String>,
    attachable: bool,
    error: Option<String>,
}

/// รูปในโฟลเดอร์เดียวกับไฟล์หนัง (ปุ่ม เปลี่ยนรูป) · ภาพเล็กจำไว้ตามชื่อ ขนาด เวลาแก้ไข ไม่อ่านซ้ำ
#[tauri::command]
pub async fn poster_folder_images(app: AppHandle, movie: String) -> Result<Vec<FolderImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let dir = Path::new(&movie).parent().ok_or("หาโฟลเดอร์ของไฟล์หนังไม่เจอ")?.to_path_buf();
        let mut files: Vec<PathBuf> = std::fs::read_dir(&dir).map_err(|e| format!("อ่านโฟลเดอร์ไม่ได้: {e}"))?
            .flatten().map(|e| e.path()).filter(|p| p.is_file() && pi::ACCEPTED.contains(&pi::ext_of(p).as_str())).collect();
        files.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_lowercase()));
        files.truncate(40);
        let st = app.state::<PosterState>();
        let mut out = vec![];
        for p in files {
            let md = std::fs::metadata(&p).ok();
            let key = format!("{}|{}|{:?}", p.display(), md.as_ref().map(|m| m.len()).unwrap_or(0), md.and_then(|m| m.modified().ok()));
            if let Some(hit) = st.thumbs.lock().unwrap().get(&key) {
                out.push(hit.clone());
                continue;
            }
            let ext = pi::ext_of(&p);
            let mut item = FolderImage {
                path: p.to_string_lossy().to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                attachable: pi::ATTACHABLE.contains(&ext.as_str()), ext, width: 0, height: 0, thumb: None, error: None,
            };
            match pi::decode(&d.tools, &d.work, &p) {
                Ok(dec) => {
                    (item.width, item.height) = dec.img.dimensions();
                    item.thumb = pi::write_preview(&dec.img, 120, &d.previews.join("folder"), "th").ok().map(|t| t.to_string_lossy().to_string());
                }
                Err(e) => item.error = Some(e),
            }
            st.thumbs.lock().unwrap().insert(key, item.clone());
            out.push(item);
        }
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- ไฟล์หนัง

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MovieInfo {
    path: String,
    name: String,
    ext: String,
    size: u64,
    duration: Option<f64>,
    width: u64,
    height: u64,
    streams: Vec<StreamInfo>,
    counts: Counts,
    /// ที่ว่างในไดรฟ์ของไฟล์นี้
    free: u64,
    drive: String,
}

/// ข้อมูลไฟล์หนังสำหรับการ์ด 1 และคำเตือน MP4
#[tauri::command]
pub async fn poster_inspect(app: AppHandle, path: String) -> Result<MovieInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let p = PathBuf::from(&path);
        let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if !crate::library::ACCEPTED.contains(&ext.as_str()) {
            return Err(format!("ไฟล์ .{ext} ใช้ไม่ได้"));
        }
        let size = std::fs::metadata(&p).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
        let j = ffprobe_json(&d.tools, &p)?;
        let streams = streams_of(&j);
        let v = j["streams"].as_array().and_then(|a| a.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() != Some(1)).cloned()).unwrap_or(Value::Null);
        let dir = p.parent().unwrap_or(Path::new(""));
        Ok(MovieInfo {
            name: p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), ext, size, duration: duration_of(&j),
            width: v["width"].as_u64().unwrap_or(0), height: v["height"].as_u64().unwrap_or(0), counts: count(&streams), streams,
            free: free_space(dir), drive: drive_letter(dir), path,
        })
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- เครื่องช่วยฝั่ง Windows (ย้ายไป outfile.rs แล้ว)

/// ตัวหลอกที่ว่างในไดรฟ์ ใช้ในเทส (0 = ไม่หลอก) · ตัวติดตั้งจริงตั้งค่านี้ไม่ได้
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_fake_free(bytes: u64) {
    crate::outfile::FAKE_FREE.store(bytes, Ordering::SeqCst);
}

// ---------------------------------------------------------------- ใส่โปสเตอร์

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReq {
    path: String,
    /// mkv | mp4
    output: String,
    check_source: bool,
    check_output: bool,
    /// keep | trash
    original: String,
    /// เลขแทร็ก (ffprobe) ที่ยอมทิ้งตอนส่งออก MP4
    #[serde(default)]
    drop: Vec<u64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    /// cover เปลี่ยนแค่รูปแนบ · wrap ครอบเป็น MKV · mp4 ส่งออก MP4
    mode: String,
    output: String,
    counts: Counts,
    verified: bool,
    /// kept ย้ายไปไฟล์เดิม · trash ลงถังขยะ · none ไม่มีไฟล์เดิม (แก้ในไฟล์เดียวกัน)
    original: String,
    original_to: Option<String>,
    notes: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: String,
    percent: f64,
    eta: Option<f64>,
    next: Option<String>,
}

#[tauri::command]
pub fn poster_cancel(st: State<'_, PosterState>) {
    st.cancel.store(true, Ordering::SeqCst);
}

/// ใส่โปสเตอร์ตามที่เลือก · คืนผลเมื่อเสร็จ ความคืบหน้าส่งทางเหตุการณ์ poster-progress
#[tauri::command]
pub async fn poster_apply(app: AppHandle, req: ApplyReq) -> Result<ApplyResult, ApplyProblem> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<PosterState>();
        if st.running.swap(true, Ordering::SeqCst) {
            return Err(fail("other", "กำลังใส่โปสเตอร์อีกเรื่องอยู่", vec!["รอให้เสร็จก่อน".into()]));
        }
        st.cancel.store(false, Ordering::SeqCst);
        let jobs = app.state::<Arc<crate::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let r = apply(&app, &req, &jobs);
        st.running.store(false, Ordering::SeqCst);
        r
    }).await.map_err(|e| fail("other", "ใส่โปสเตอร์ไม่สำเร็จ", vec![e.to_string()]))?
}

fn apply(app: &AppHandle, req: &ApplyReq, jobs: &Arc<crate::jobs::Jobs>) -> Result<ApplyResult, ApplyProblem> {
    let st = app.state::<PosterState>();
    let d = dirs(app).map_err(|e| fail("other", "ใส่โปสเตอร์ไม่สำเร็จ", vec![e]))?;
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>, next: Option<&str>| {
        let _ = app.emit("poster-progress", Progress { phase: phase.into(), percent, eta, next: next.map(String::from) });
    };
    let src = PathBuf::from(&req.path);
    let src_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {src_name} ไม่ถูกแตะ");
    let dir = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let Some((poster, pformat)) = st.chosen.lock().unwrap().clone() else {
        return Err(fail("nocover", "ยังไม่ได้ใส่รูปโปสเตอร์", vec!["ใส่รูปแล้วกด ใช้รูปนี้ ในหน้าต่างครอปก่อน".into()]));
    };
    let src_size = std::fs::metadata(&src).map_err(|_| fail("other", "หาไฟล์หนังไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]))?.len();
    let mode = if req.output == "mp4" { "mp4" } else if ext == "mkv" { "cover" } else { "wrap" };

    // ไฟล์ถูกเปิดอยู่ · แก้ในไฟล์เดิม (cover) ต้องเช็กก่อนเสมอ · ครอบใหม่ก็เช็ก เพราะตอนจบต้องย้ายไฟล์เดิม
    if !not_in_use(&src) {
        return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched]));
    }
    let src_json = ffprobe_json(&d.tools, &src).map_err(|e| fail("badsource", "อ่านไฟล์ต้นทางไม่ได้", vec![e, untouched.clone()]))?;
    let src_streams = streams_of(&src_json);
    let src_duration = duration_of(&src_json);

    // ที่อยู่ไฟล์ใหม่ · ชื่อซ้ำไม่เขียนทับ
    let target = match mode {
        "cover" => src.clone(),
        m => dir.join(format!("{}.{}", src.file_stem().unwrap_or_default().to_string_lossy(), if m == "mp4" { "mp4" } else { "mkv" })),
    };
    let same_name = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if mode != "cover" && !same_name && target.exists() {
        return Err(fail("exists", "มีไฟล์ชื่อนี้อยู่แล้ว ไม่เขียนทับ", vec![target.to_string_lossy().to_string(), untouched]));
    }
    let partial = PathBuf::from(format!("{}.partial", target.to_string_lossy()));
    // ไฟล์ใหม่ต่อท้าย .partial (8 ตัว) · เปลี่ยนรูปแนบแก้ในไฟล์เดิม ไม่มีไฟล์ใหม่ ไม่ต้องบวก (เดิมบวกทุกโหมด ไฟล์ที่ที่อยู่ยาว 252–259 ใส่ปกไม่ได้)
    if target.to_string_lossy().encode_utf16().count() + if mode == "cover" { 0 } else { 8 } > MAX_PATH_LEN {
        return Err(fail("other", "ที่อยู่ไฟล์ยาวเกินไป", vec!["เปลี่ยนชื่อไฟล์ให้สั้นลงก่อน".into(), untouched]));
    }

    // ที่ว่างในไดรฟ์ · ครอบใหม่ต้องการราวขนาดไฟล์เดิม
    let need = if mode == "cover" { poster.len() as u64 * 2 + 16 * 1024 * 1024 } else { src_size + poster.len() as u64 + 64 * 1024 * 1024 };
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }

    // MP4 · แทร็กที่ใส่ไม่ได้ต้องได้รับอนุญาตให้ทิ้งก่อน
    if mode == "mp4" {
        let bad: Vec<&StreamInfo> = src_streams.iter().filter(|s| s.mp4 == "no" && !req.drop.contains(&s.index)).collect();
        if let Some(v) = bad.iter().find(|s| s.kind == "video") {
            return Err(fail("mp4", "ส่งออกเป็น MP4 ไม่ได้", vec![v.why.clone().unwrap_or_default(), "ใช้ MKV แทน".into(), untouched]));
        }
        if !bad.is_empty() {
            return Err(fail("mp4", format!("มีแทร็กที่ใส่ใน MP4 ไม่ได้ {} อัน", bad.len()), vec![untouched]));
        }
    }

    // ตรวจไฟล์ต้นทางก่อน · อ่านทุกแพ็กเก็ตโดยไม่ถอดภาพ จับไฟล์ที่โครงเสียหรือขาดท้าย (ตรวจละเอียดจริงอยู่หน้าตรวจไฟล์ ขั้น 6)
    let next_after_check = if mode == "cover" { "เปลี่ยนรูปแนบ" } else if mode == "mp4" { "ส่งออกเป็น MP4" } else { "ครอบเป็น MKV" };
    if req.check_source {
        emit("กำลังตรวจไฟล์ต้นทาง", 0.0, None, Some(next_after_check));
        let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from)
            .chain([src.as_os_str().to_owned()]).chain(["-map", "0", "-c", "copy", "-f", "null", "-"].iter().map(OsString::from)).collect();
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let total = src_duration.unwrap_or(0.0);
        let r = run_live(&d.tools, "ffmpeg", &args, &stop, &mut |l| {
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
                if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    let pct = (us / 1e6 / total * 100.0).clamp(0.0, 100.0);
                    emit("กำลังตรวจไฟล์ต้นทาง", pct, eta(t0, pct), Some(next_after_check));
                }
            }
        }).map_err(|e| fail("tool", "ตรวจไฟล์ต้นทางไม่สำเร็จ", vec![e, untouched.clone()]))?;
        match r {
            Run::Cancelled => return Err(cancelled(&untouched, None)),
            Run::Done(status, stderr) => {
                // คำเตือนเรื่องลำดับเวลาของตัวเขียนทดสอบ (null) ไม่ใช่ไฟล์เสีย · ไฟล์ VOB MPG TS ที่ดีขึ้นแบบนี้เป็นปกติ (ผลเทสขั้น 4)
                let errs: Vec<&str> = stderr.lines().map(str::trim)
                    .filter(|l| !l.is_empty() && !l.contains("non monotonically increasing dts") && !l.contains("Timestamps are unset")).collect();
                if !status.success() || !errs.is_empty() {
                    return Err(fail("badsource", "ไฟล์ต้นทางมีที่เสียอยู่แล้ว", vec![
                        errs.first().map(|e| e.chars().take(120).collect()).unwrap_or_else(|| "อ่านไฟล์ไม่จบ".into()),
                        "ปิดตัวเลือก ตรวจไฟล์ต้นทางก่อนครอบ ถ้าต้องการทำต่อ".into(), untouched,
                    ]));
                }
            }
        }
    }

    // เขียนรูปโปสเตอร์ลงโฟลเดอร์ชั่วคราวของโปรแกรม
    std::fs::create_dir_all(&d.work).map_err(|e| fail("other", "สร้างโฟลเดอร์ชั่วคราวไม่ได้", vec![e.to_string()]))?;
    // รูปแนวนอนแนบชื่อ cover_land · แนวตั้งหรือจัตุรัสชื่อ cover ตามธรรมเนียมไฟล์แนบของ MKV
    // ไฟล์หนึ่งมีได้ทั้งสองปก ชั้นวางสลับดูได้ (พี่กัน 7 พ.ย. 2569 *"ทำระบบนี้มาเลย ให้เเนบหลายรูปได้ เเละทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้"*)
    let land = image::ImageReader::new(std::io::Cursor::new(&poster[..])).with_guessed_format().ok()
        .and_then(|r| r.into_dimensions().ok()).map(|(w, h)| w > h).unwrap_or(false);
    let stem = if land { "cover_land" } else { "cover" };
    let cover_name = format!("{stem}.{pformat}");
    let mime = if pformat == "png" { "image/png" } else { "image/jpeg" };
    let cover_file = d.work.join(format!("poster-{}.{pformat}", pi::unique()));
    std::fs::write(&cover_file, &poster).map_err(|e| fail("other", "เขียนรูปโปสเตอร์ไม่ได้", vec![e.to_string()]))?;
    let poster_sha = crate::probe::hex(&Sha256::digest(&poster));
    let cleanup_cover = scopeguard(cover_file.clone());

    let mut notes: Vec<String> = vec![];
    let result_counts: Counts;
    let mut verified = false;

    if mode == "cover" {
        // ① MKV อยู่แล้ว · ลบเฉพาะปกเดิมแนวเดียวกับรูปใหม่ ปกอีกแนวเก็บไว้ แล้วแนบใหม่ ในคำสั่งเดียว · ชื่อกับชนิดมาก่อนคำสั่งแนบ (TECH-REVIEW ข้อ 2)
        emit("กำลังเปลี่ยนรูปแนบ", 10.0, None, req.check_output.then_some("ตรวจไฟล์ใหม่"));
        let atts = mkv_attachments(&d.tools, &src).map_err(|e| fail("tool", "อ่านไฟล์แนบเดิมไม่ได้", vec![e, untouched.clone()]))?;
        // ปกเดิมแต่ละอันเป็นแนวไหน · cover_land = แนวนอน · cover.* ดูสัดส่วนจริง (รูปแนวนอนที่แนบชื่อ cover ก่อนมีระบบนี้)
        let olds: Vec<(String, bool)> = atts.iter().filter_map(|a| {
            let st = crate::probe::att_stem(&a.0);
            (st == "cover" || st == "cover_land").then(|| (a.0.clone(), st == "cover_land" || attachment_is_land(&d, &src, a.2).unwrap_or(false)))
        }).collect();
        let mut drops: Vec<String> = olds.iter().filter(|o| o.1 == land).map(|o| o.0.clone()).collect();
        let others: Vec<&(String, bool)> = olds.iter().filter(|o| o.1 != land).collect();
        // ปกแนวนอนเก่าชื่อ cover.* ตอนใส่ปกตั้ง · เปลี่ยนชื่อเป็น cover_land ไม่ลบ (มี cover_land อยู่แล้ว อันชื่อ cover ซ้ำแนว ลบได้)
        let mut rename: Option<(String, String)> = None;
        if !land {
            let has_land_name = others.iter().any(|o| crate::probe::att_stem(&o.0) == "cover_land");
            for o in others.iter().filter(|o| crate::probe::att_stem(&o.0) == "cover") {
                if has_land_name || rename.is_some() { drops.push(o.0.clone()); }
                else { rename = Some((o.0.clone(), format!("cover_land.{}", Path::new(&o.0).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "jpg".into())))); }
            }
        }
        let keep_other = !others.is_empty();
        let mut args: Vec<OsString> = vec![src.as_os_str().to_owned()];
        for n in &drops {
            args.push("--delete-attachment".into());
            args.push(format!("name:{n}").into());
        }
        if let Some((from, to)) = &rename {
            args.extend(["--attachment-name".into(), to.into(), "--update-attachment".into(), format!("name:{from}").into()]);
            notes.push(format!("ปกแนวนอนเดิมชื่อ {from} เปลี่ยนชื่อเป็น {to} ตามธรรมเนียมปกแนวนอน"));
        }
        args.extend(["--attachment-name".into(), cover_name.clone().into(), "--attachment-mime-type".into(), mime.into(), "--add-attachment".into(), cover_file.as_os_str().to_owned()]);
        if keep_other {
            notes.push(if land { "ปกแนวตั้งเดิมยังอยู่ในไฟล์ ชั้นวางสลับดูได้".into() } else { "ปกแนวนอนเดิมยังอยู่ในไฟล์ ชั้นวางสลับดูได้".into() });
        }
        // เช็กซ้ำตรงจังหวะที่เขียนจริง · ตรวจไฟล์ต้นทางของไฟล์ใหญ่ใช้หลายนาที ระหว่างนั้นผู้ใช้อาจเปิดหนังเรื่องนี้ดู (ผู้ช่วยตรวจโค้ดเจอ)
        if !not_in_use(&src) {
            return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ถูกเปิดระหว่างตรวจไฟล์ต้นทาง ยังไม่ได้แก้ไฟล์ ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched.clone()]));
        }
        let out = run_tool_timeout(&d.tools, "mkvpropedit", &args, Duration::from_secs(300))
            .map_err(|e| fail("tool", "เปลี่ยนรูปแนบไม่สำเร็จ", vec![e]))?;
        if !tool_succeeded("mkvpropedit", &out.status) {
            return Err(fail("tool", "เปลี่ยนรูปแนบไม่สำเร็จ", vec![String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.contains("Error")).collect::<Vec<_>>().join(" ")]));
        }
        // ตรวจ · ปกมีอันเดียว ชื่อ ชนิดถูก ดึงออกมาแล้ว hash ตรงกับรูปที่ทำ · แทร็กเท่าเดิม
        emit("กำลังตรวจไฟล์ใหม่", 80.0, None, None);
        let check = || -> Result<Counts, (String, String)> {
            verify_cover(&d, &target, &cover_name, mime, &poster_sha).map_err(|e| ("ตรวจรูปแนบไม่ผ่าน".to_string(), e))?;
            // ปกอีกแนวที่ตั้งใจเก็บไว้ ต้องยังอยู่ (ไฟล์จากที่อื่นอาจมีปกอีกแนวมากกว่าหนึ่งอัน เช่น cover.jpg กับ cover.png · เดิมนับว่าต้องเท่ากับ 1 พอดี ขึ้นแดงทั้งที่แนบสำเร็จ ผู้ช่วยตรวจโค้ดเจอ)
            let other_stem = if land { "cover" } else { "cover_land" };
            let kept = mkv_attachments(&d.tools, &target).map(|a| a.iter().filter(|x| crate::probe::att_stem(&x.0) == other_stem).count()).unwrap_or(0);
            if (kept >= 1) != keep_other {
                return Err(("ปกอีกแนวในไฟล์ไม่ตรงกับที่ควรเป็น".into(), format!("{other_stem} ควร{} เจอ {kept} อัน", if keep_other { "ยังอยู่" } else { "ไม่มี" })));
            }
            let after = ffprobe_json(&d.tools, &target).map(|j| count(&streams_of(&j))).unwrap_or_default();
            if after != count(&src_streams) {
                return Err(("แทร็กในไฟล์เปลี่ยนไปหลังเปลี่ยนรูปแนบ".into(), format!("เดิม {:?} ตอนนี้ {:?}", count(&src_streams), after)));
            }
            Ok(after)
        };
        match check() {
            Ok(after) => { verified = true; result_counts = after; }
            Err((title, why)) => {
                // ไฟล์ถูกแก้ไปแล้ว จดขนาดกับ hash ใหม่ลงคลังเสมอ ไม่งั้นอ่านโฟลเดอร์ครั้งหน้าขึ้นว่าไฟล์ถูกเปลี่ยน · บอกตรง ๆ ว่าแนบปกใหม่ไปแล้ว
                crate::library::refresh_own_edit(app, &target, &|pct| emit("กำลังจดค่า hash ใหม่", pct, None, None));
                return Err(fail("verify", title, vec![why, "แนบปกใหม่ลงไฟล์แล้ว ภาพ เสียง ซับ ไม่ได้ถูกแปลงใหม่ · ควรตรวจละเอียดเรื่องนี้".into()]));
            }
        }
    } else {
        // ② ③ ทำไฟล์ใหม่เป็น .partial ในโฟลเดอร์เดียวกัน
        let _ = std::fs::remove_file(&partial); // .partial ของรอบก่อนที่ค้าง เป็นของโปรแกรมเอง ไม่ใช่ไฟล์หนัง
        let phase = if mode == "mp4" { "กำลังส่งออกเป็น MP4" } else { "กำลังครอบเป็น MKV" };
        let next = if req.check_output { Some("ตรวจไฟล์ใหม่") } else { None };
        emit(phase, 0.0, None, next);
        let kept: Vec<&StreamInfo> = src_streams.iter().filter(|s| !req.drop.contains(&s.index)).collect();
        let args: Vec<OsString> = if mode == "mp4" {
            let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from).collect();
            a.push(src.as_os_str().to_owned());
            a.push("-i".into());
            a.push(cover_file.as_os_str().to_owned());
            for s in &kept {
                a.push("-map".into());
                a.push(format!("0:{}", s.index).into());
            }
            let nvideo = kept.iter().filter(|s| s.kind == "video").count();
            a.extend(["-map", "1:v", "-c", "copy", "-c:s", "mov_text"].iter().map(OsString::from));
            a.push(format!("-disposition:v:{nvideo}").into());
            a.push("attached_pic".into());
            a.extend(["-map_metadata", "0", "-f", "mp4"].iter().map(OsString::from));
            a.push(partial.as_os_str().to_owned());
            a
        } else {
            let mut a: Vec<OsString> = ["--gui-mode", "--ui-language", "en", "-o"].iter().map(OsString::from).collect();
            a.push(partial.as_os_str().to_owned());
            // ปกที่ฝังในต้นทาง (MP4 M4V MOV) mkvmerge ยกมาเป็นไฟล์แนบชื่อ cover.* เอง · ชนกับรูปใหม่ได้ปกชื่อซ้ำสองอัน ตรวจไม่ผ่าน (ผู้ช่วยตรวจโค้ดเจอ ลองแล้วจริง)
            // เก็บปกเดิมเฉพาะตอนรูปใหม่เป็นแนวนอน (cover_land) และปกเดิมเป็นแนวตั้งทั้งหมด ชื่อไม่ชน ชั้นวางสลับดูได้ · นอกนั้นไม่ยกไฟล์แนบของต้นทางมา
            let old_pics: Vec<(u64, u64)> = src_json["streams"].as_array().map(|a| a.iter()
                .filter(|s| s["disposition"]["attached_pic"].as_i64() == Some(1))
                .map(|s| (s["width"].as_u64().unwrap_or(0), s["height"].as_u64().unwrap_or(0))).collect()).unwrap_or_default();
            let keep_old = land && !old_pics.is_empty() && old_pics.iter().all(|&(w, h)| w <= h);
            if !keep_old { a.push("--no-attachments".into()); }
            if keep_old { notes.push("ปกแนวตั้งที่ฝังในไฟล์ต้นทางยกมาด้วย ชั้นวางสลับดูได้".into()); }
            else if !old_pics.is_empty() { notes.push("ปกที่ฝังในไฟล์ต้นทางไม่ได้ยกมา ใช้รูปที่ใส่แทน".into()); }
            a.push(src.as_os_str().to_owned());
            a.extend(["--attachment-name".into(), cover_name.clone().into(), "--attachment-mime-type".into(), mime.into(), "--attach-file".into(), cover_file.as_os_str().to_owned()]);
            a
        };
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let total = src_duration.unwrap_or(0.0);
        let tool = if mode == "mp4" { "ffmpeg" } else { "mkvmerge" };
        let mut tool_errors: Vec<String> = vec![];
        let r = run_live(&d.tools, tool, &args, &stop, &mut |l| {
            let pct = if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
                Some(p)
            } else if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
                (total > 0.0).then(|| (us / 1e6 / total * 100.0).clamp(0.0, 100.0))
            } else {
                if l.starts_with("#GUI#error") || l.starts_with("Error:") { tool_errors.push(l.to_string()); }
                None
            };
            if let Some(p) = pct {
                if last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    emit(phase, p, eta(t0, p), next);
                }
            }
        });
        let r = r.map_err(|e| { let _ = std::fs::remove_file(&partial); fail("tool", "เรียกเครื่องมือไม่ได้", vec![e, untouched.clone()]) })?;
        match r {
            Run::Cancelled => {
                let _ = std::fs::remove_file(&partial);
                return Err(cancelled(&untouched, Some(&partial)));
            }
            Run::Done(status, stderr) => {
                if !tool_succeeded(tool, &status) || !partial.exists() {
                    let _ = std::fs::remove_file(&partial);
                    let msg = tool_errors.first().cloned().or_else(|| stderr.lines().find(|l| !l.trim().is_empty()).map(String::from)).unwrap_or_default();
                    return Err(fail("tool", if mode == "mp4" { "ส่งออก MP4 ไม่สำเร็จ" } else { "ครอบเป็น MKV ไม่สำเร็จ" }, vec![msg.chars().take(160).collect(), untouched]));
                }
            }
        }
        emit(phase, 100.0, Some(0.0), next);

        // ตรวจไฟล์ใหม่เทียบต้นทาง · ภาพ เสียง ซับ ชนิดเดิม จำนวนเท่าเดิม ความยาวต่างไม่เกิน 0.1 วินาที · มีปก
        let new_json = ffprobe_json(&d.tools, &partial).map_err(|e| { let _ = std::fs::remove_file(&partial); fail("verify", "อ่านไฟล์ใหม่ไม่ได้", vec![e, untouched.clone()]) })?;
        let new_streams = streams_of(&new_json);
        result_counts = count(&new_streams);
        if req.check_output {
            emit("กำลังตรวจไฟล์ใหม่", 100.0, None, None);
            // ซับตัวหนังสือเปลี่ยนชนิดตามมาตรฐานของไฟล์ปลายทาง ไม่ใช่การแปลงภาพเสียงใหม่ · MP4 → mov_text · MKV เก็บซับของ MP4 เป็น SRT
            let as_target = |s: &StreamInfo| -> String {
                match (s.kind.as_str(), mode, s.codec.as_str()) {
                    ("subtitle", "mp4", _) => "mov_text".into(),
                    ("subtitle", _, "mov_text") => "subrip".into(),
                    _ => s.codec.clone(),
                }
            };
            let want: Vec<(String, String)> = kept.iter().map(|s| (s.kind.clone(), as_target(s))).collect();
            let got: Vec<(String, String)> = new_streams.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
            let dur_ok = match (src_duration, duration_of(&new_json)) { (Some(a), Some(b)) => (a - b).abs() <= 0.1, _ => true };
            let cover_ok = if mode == "mp4" { has_attached_pic(&new_json) } else { verify_cover(&d, &partial, &cover_name, mime, &poster_sha).is_ok() };
            if want != got || !dur_ok || !cover_ok {
                let _ = std::fs::remove_file(&partial);
                let mut why = vec![];
                if want != got {
                    let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
                    why.push(format!("แทร็กไม่ตรงต้นทาง ต้นทาง {} · ไฟล์ใหม่ {}", show(&want), show(&got)));
                }
                if !dur_ok { why.push(format!("ความยาวต่างกัน {:.2} กับ {:.2} วินาที", src_duration.unwrap_or(0.0), duration_of(&new_json).unwrap_or(0.0))); }
                if !cover_ok { why.push("ไม่เจอปกในไฟล์ใหม่".into()); }
                why.push("ลบไฟล์ใหม่ที่ไม่ผ่านแล้ว".into());
                why.push(untouched);
                return Err(fail("verify", "ไฟล์ใหม่ตรวจไม่ผ่าน", why));
            }
            verified = true;
        }
        if mode == "mp4" {
            for s in src_streams.iter().filter(|s| req.drop.contains(&s.index)) {
                notes.push(format!("ทิ้ง{} {} ตามที่เลือก", kind_word(&s.kind), s.lang.clone().unwrap_or_default()));
            }
            if src_streams.iter().any(|s| s.mp4 == "style" && !req.drop.contains(&s.index)) {
                notes.push("ซับ ASS เหลือตัวหนังสือล้วน สีกับฟอนต์หาย".into());
            }
        }
    }

    // ไฟล์เดิม · ย้ายไปโฟลเดอร์ไฟล์เดิม หรือลงถังขยะ (เฉพาะหลังตรวจผ่าน) · แก้ในไฟล์เดียวกันไม่มีไฟล์เดิม
    // ตัวจัดการอยู่ outfile.rs finish_output ใช้ร่วมกับหน้าเสียงและซับ
    let mut original = "none".to_string();
    let mut original_to = None;
    if mode != "cover" {
        (original, original_to) = finish_output(app, &src, &target, &partial, &req.original, verified, &untouched, &mut notes)?;
    }
    drop(cleanup_cover);

    // คลังหนัง · แก้ในไฟล์เดิม จดขนาดใหม่ไม่ให้ขึ้นว่าไฟล์ถูกเปลี่ยน · ไฟล์ใหม่ อ่านโฟลเดอร์ใหม่ให้ขึ้นชั้น
    if mode == "cover" {
        emit("กำลังจดข้อมูลไฟล์ใหม่", 100.0, None, None);
        crate::library::refresh_own_edit(app, &target, &|pct| emit("กำลังจดค่า hash ใหม่", pct, None, None));
    } else {
        let lib = app.state::<Arc<crate::library::LibraryStore>>();
        let _ = crate::library::scan_library(app.clone(), lib);
    }
    Ok(ApplyResult {
        mode: mode.into(), output: target.to_string_lossy().to_string(), counts: result_counts, verified, original, original_to, notes,
    })
}

/// ไฟล์แนบเลขนี้เป็นรูปแนวนอนไหม · ดึงออกมาที่โฟลเดอร์ชั่วคราวของโปรแกรม อ่านขนาด แล้วลบ
fn attachment_is_land(d: &Dirs, file: &Path, id: u64) -> Option<bool> {
    let out = d.work.join(format!("att-{}", pi::unique()));
    let mut target = OsString::from(format!("{id}:"));
    target.push(out.as_os_str());
    let r = run_tool_timeout(&d.tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120)).ok();
    let dims = r.filter(|r| tool_succeeded("mkvextract", &r.status)).and_then(|_| image::ImageReader::open(&out).ok()?.with_guessed_format().ok()?.into_dimensions().ok());
    let _ = std::fs::remove_file(&out);
    dims.map(|(w, h)| w > h)
}

/// ปกแนวเดียวกัน (ชื่อ cover หรือ cover_land ตามรูปใหม่) มีอันเดียว ชื่อกับชนิดถูก ดึงออกมาแล้ว hash ตรงกับรูปที่โปรแกรมทำ
fn verify_cover(d: &Dirs, file: &Path, name: &str, mime: &str, sha: &str) -> Result<(), String> {
    let atts = mkv_attachments(&d.tools, file)?;
    let stem = crate::probe::att_stem(name);
    let covers: Vec<&(String, String, u64)> = atts.iter().filter(|a| crate::probe::att_stem(&a.0) == stem).collect();
    if covers.len() != 1 || covers[0].0 != name || covers[0].1 != mime {
        return Err(format!("ปกในไฟล์ {:?} ต้องมี {name} อันเดียว", covers.iter().map(|c| &c.0).collect::<Vec<_>>()));
    }
    let out = d.work.join(format!("verify-{}", pi::unique()));
    let mut target = OsString::from(format!("{}:", covers[0].2));
    target.push(out.as_os_str());
    let r = run_tool_timeout(&d.tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
    let got = std::fs::read(&out).map(|b| crate::probe::hex(&Sha256::digest(&b)));
    let _ = std::fs::remove_file(&out);
    if !tool_succeeded("mkvextract", &r.status) || got.as_deref().ok() != Some(sha) {
        return Err("ปกที่ดึงออกมาไม่ตรงกับรูปที่ทำ".into());
    }
    Ok(())
}

