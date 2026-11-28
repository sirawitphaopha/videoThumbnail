//! หน้าใส่โปสเตอร์ (แผนขั้น 4 · สเปกข้อ 7) · คำสั่งของหน้าจอทั้งหมดอยู่ที่นี่ งานรูปอยู่ poster_image.rs
//! ① MKV อยู่แล้ว → เปลี่ยนแค่รูปแนบด้วย mkvpropedit (เช็กก่อนว่าไฟล์ไม่ถูกเปิดอยู่)
//! ② ไฟล์อื่น → mkvmerge ห่อเป็นไฟล์ .partial ในโฟลเดอร์เดียวกัน → ตรวจเทียบต้นทาง → เปลี่ยนเป็นไฟล์จริง
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

use crate::cover::poster_image::{self as pi, Geometry};
use crate::cover::rename::{self, RenameProblem, MAX_PATH_LEN};
use crate::app::outfile::{
    cancelled, fail, finish_output, ApplyProblem, count, drive_letter, duration_of, eta, ffprobe_json, fmt_gb, free_space, has_attached_pic, kind_word,
    mkv_attachments, not_in_use, run_live, scopeguard, streams_of, Counts, Run, StreamInfo,
};
use crate::app::tools::{run_tool_timeout, tool_succeeded};

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
    /// ที่เก็บรูปของช่องปกในหน้าเสียงและซับ แยกจากของหน้าใส่โปสเตอร์ · ครอปรูปในหน้าหนึ่งไม่ทับรูปที่ค้างในอีกหน้า
    m_source: Mutex<Option<Source>>,
    m_rendered: Mutex<Option<(Geometry, RgbImage, (u32, u32), bool)>>,
    /// รูปที่กดใช้ไว้ก่อนเปิดรูปใหม่ ยกเลิกหน้าครอปของรูปใหม่แล้วคืนได้ (AUDIT ข้อ 42)
    prev: Mutex<Option<prev::Prev>>,
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
    Ok(Dirs { tools: crate::app::tools::tools_dir(app)?, work: local.join("tmp"), previews: local.join("previews") })
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
pub async fn poster_open(app: AppHandle, path: String, target: Option<String>) -> Result<PosterInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let p = PathBuf::from(&path);
        let size = std::fs::metadata(&p).map_err(|_| "หารูปไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว".to_string())?.len();
        let dec = pi::decode(&d.tools, &d.work, &p)?;
        let (w, h) = dec.img.dimensions();
        let preview = pi::write_preview(&dec.img, 1200, &d.previews, "src")?;
        let st = app.state::<PosterState>();
        if target.is_some() {
            // ช่องปกของหน้าเสียงและซับ · ไม่แตะรูปที่เลือกไว้ในหน้าใส่โปสเตอร์
            st.keep_preview("msrc", preview.clone());
            *st.m_rendered.lock().unwrap() = None;
            *st.m_source.lock().unwrap() = Some(Source { img: dec.img });
        } else {
            // เดิมล้างรูปที่กดใช้ทันที ยกเลิกหน้าครอปของรูปใหม่แล้วรูปเดิมหายด้วย (AUDIT ข้อ 42)
            st.stash_for_open();
            st.keep_preview("src", preview.clone());
            *st.rendered.lock().unwrap() = None;
            *st.source.lock().unwrap() = Some(Source { img: dec.img });
        }
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
    /// ไม่มี = หน้าใส่โปสเตอร์ · cover หรือ cover_land = ช่องปกของหน้าเสียงและซับ กดใช้รูปนี้แล้วเก็บลงช่องนั้น
    #[serde(default)]
    target: Option<String>,
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
        let shrink = app.state::<crate::app::store::SettingsStore>().current.lock().unwrap().shrink_large_posters;
        let merge = req.target.is_some();
        let mut cache = if merge { st.m_rendered.lock().unwrap() } else { st.rendered.lock().unwrap() };
        if cache.as_ref().map(|c| c.0 != req.geo || c.3 != shrink).unwrap_or(true) {
            let src = if merge { st.m_source.lock().unwrap() } else { st.source.lock().unwrap() };
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
        st.keep_preview(match (merge, req.choose) { (false, true) => "chosen".to_string(), (false, false) => "render".into(), (true, true) => format!("m-{}", req.target.clone().unwrap_or_default()), (true, false) => "mrender".into() }.as_str(), preview.clone());
        let sizes = if req.sizes && format == "jpg" {
            [100u8, 90, 75, 50].iter().map(|q| (*q, pi::encode(img, "jpg", *q).map(|b| b.len() as u64).unwrap_or(0))).collect()
        } else {
            vec![]
        };
        let info = RenderInfo {
            bytes: bytes.len() as u64, width: img.width(), height: img.height(), crop_w: crop.0, crop_h: crop.1,
            // ปกนอน 16 : 9 ใช้เกณฑ์เดียวกัน พลิกด้านกว้างกับด้านสูง
            small: req.geo.mode == "crop" && if req.geo.aspect == "wide" { crop.0 < pi::SMALL_H || crop.1 < pi::SMALL_W * 9 / 16 } else { crop.0 < pi::SMALL_W || crop.1 < pi::SMALL_H },
            preview: preview.to_string_lossy().to_string(), sizes,
        };
        if req.choose {
            // ระบบจับคู่รูปปกเก็บแค่ค่าครอปไว้ในแถว ยังไม่เก็บรูป รูปจริงทำตอนยืนยัน
            if req.target.as_deref() == Some("link") {
            } else if let Some(slot) = &req.target {
                // ปกตั้งต้องเป็นรูปแนวตั้งหรือจัตุรัส ปกนอนต้องเป็นรูปแนวนอน ชั้นวางกับตัวอ่านปกแยกแนวด้วยชื่อ cover กับ cover_land
                let land = img.width() > img.height();
                if slot == "cover_land" && !land {
                    return Err("ปกนอนต้องเป็นรูปแนวนอน เลือกแบบปก ตามรูปเดิม กับรูปแนวนอน".into());
                }
                if slot == "cover" && land {
                    return Err("ปกตั้งต้องเป็นรูปแนวตั้ง เลือกแบบปก ตัดให้พอดีปก".into());
                }
                if slot != "cover" && slot != "cover_land" {
                    return Err(format!("ไม่รู้จักช่องปก {slot}"));
                }
                app.state::<crate::merge::MergeState>().covers.lock().unwrap().insert(slot.clone(), (bytes, format.to_string()));
            } else {
                *st.chosen.lock().unwrap() = Some((bytes, format.to_string()));
                // กดใช้รูปใหม่แล้ว ไม่ต้องจำรูปเดิมไว้คืน
                st.drop_prev();
            }
        }
        Ok(info)
    }).await.map_err(|e| e.to_string())?
}

/// ล้างรูปที่เลือกไว้ (ปุ่ม ล้างทั้งหมด · เปลี่ยนรูป)
/// รูปใหญ่ของตัวดูรูปเต็มจอ
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewInfo {
    preview: String,
    width: u32,
    height: u32,
    file_size: u64,
    ext: String,
}

/// อ่านรูปตรง ๆ ไม่แตะรูปที่ค้างในหน้าใส่โปสเตอร์หรือหน้าครอป · ส่งค่าครอปมาได้ภาพหลังครอป · จำไว้ใบเดียว เปิดใบใหม่ใบเก่าถูกลบ
#[tauri::command]
pub async fn poster_view(app: AppHandle, path: String, geo: Option<pi::Geometry>) -> Result<ViewInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let p = PathBuf::from(&path);
        let file_size = std::fs::metadata(&p).map_err(|_| "หารูปไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว".to_string())?.len();
        let dec = pi::decode(&d.tools, &d.work, &p)?;
        let (width, height) = dec.img.dimensions();
        let preview = match &geo {
            Some(g) => { let (img, _) = pi::render(&dec.img, g, true); pi::write_preview(&img, 3000, &d.previews, "view")? }
            None => pi::write_preview(&dec.img, 3000, &d.previews, "view")?,
        };
        app.state::<PosterState>().keep_preview("view", preview.clone());
        Ok(ViewInfo { preview: preview.to_string_lossy().to_string(), width, height, file_size, ext: pi::ext_of(&p) })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn poster_clear(st: State<'_, PosterState>, target: Option<String>) {
    if target.is_some() {
        *st.m_source.lock().unwrap() = None;
        *st.m_rendered.lock().unwrap() = None;
        return;
    }
    *st.source.lock().unwrap() = None;
    *st.rendered.lock().unwrap() = None;
    *st.chosen.lock().unwrap() = None;
    st.drop_prev();
}

/// ยกเลิกหน้าครอปของรูปที่เปิดใหม่ · คืนรูปที่กดใช้ไว้ก่อนเปิด (AUDIT ข้อ 42) · ตอบ false เมื่อไม่มีอะไรให้คืน หน้าจอล้างรูปเอง
#[tauri::command]
pub fn poster_restore(st: State<'_, PosterState>) -> bool {
    st.restore_prev()
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
        if !crate::app::library::ACCEPTED.contains(&ext.as_str()) {
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
    crate::app::outfile::FAKE_FREE.store(bytes, Ordering::SeqCst);
}

/// เช็กชื่อไฟล์ใหม่ตอนพิมพ์ในหน้าใส่โปสเตอร์ · ไม่มีปัญหาคืนค่าว่าง · ตอนกดเริ่มเช็กซ้ำอีกรอบใน apply
#[tauri::command]
pub fn poster_check_name(path: String, output: String, name: String) -> Option<RenameProblem> {
    let src = PathBuf::from(&path);
    match new_target(&src, &output, Some(&name)) {
        Err(p) => Some(p),
        Ok(target) => target_problem(&src, &target),
    }
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
        let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let r = apply(&app, &req, &jobs);
        st.running.store(false, Ordering::SeqCst);
        r
    }).await.map_err(|e| fail("other", "ใส่โปสเตอร์ไม่สำเร็จ", vec![e.to_string()]))?
}

mod apply;
pub use apply::*;
mod prev;

#[cfg(test)]
mod name_tests;

#[cfg(test)]
mod state_tests;
