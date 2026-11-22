//! หน้าเสียงและซับ (แผนเสียงและซับ ขั้น 1) · รวมเสียง ซับ โปสเตอร์ ที่โหลดแยกเข้าไฟล์หนังรอบเดียว
//! ① ไฟล์ที่ได้เป็น MKV → mkvmerge คำสั่งเดียว เลือกแทร็ก เรียงลำดับ ภาษา ชื่อ ธงหลัก ดีเลย์ (--sync) ไฟล์แนบเดิม ปกตั้ง ปกนอน
//! ② ไฟล์ที่ได้เป็น MP4 → ffmpeg ไม่แปลงภาพเสียง ดีเลย์ด้วย -itsoffset ของไฟล์ต้นทาง · ภาษา ชื่อ ธงหลัก ปกตั้ง
//! ลำดับงานแบบหน้าใส่โปสเตอร์ (poster.rs apply) เช็กไฟล์ถูกเปิด เช็กที่ว่าง ทำไฟล์ .partial ตรวจไฟล์ใหม่เทียบที่สั่ง แล้วค่อยเป็นไฟล์จริง
//! 🔴 ไฟล์เดิมไม่ถูกแตะจนกว่าไฟล์ใหม่ตรวจผ่าน · ไม่เขียนทับไฟล์ใด · กดหยุด ไฟล์ทำค้างถูกลบ · ffmpeg ใช้ -n ไม่ใช้ -y
//! 🔴 ดีเลย์ติดลบ = เสียงหรือซับมาเร็วขึ้น (ชื่อไฟล์แบบ eac3to "DELAY -120ms" = ต้องเลื่อน −120 ms) · mkvmerge --sync ใช้เครื่องหมายเดียวกัน

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::outfile::{
    cancelled, count, drive_letter, duration_of, eta, fail, ffprobe_json, finish_output, fmt_gb, free_space, kind_word, mp4_fit,
    not_in_use, run_live, scopeguard, streams_of, ApplyProblem, Counts, Run,
};
use crate::cover::rename::MAX_PATH_LEN;
use crate::app::tools::{run_tool_timeout, tool_succeeded};

// ---------------------------------------------------------------- สถานะของหน้า

#[derive(Default)]
pub struct MergeState {
    cancel: AtomicBool,
    running: AtomicBool,
    /// รูปปกใหม่ที่ครอปแล้ว แยกตามช่อง cover (ปกตั้ง) · cover_land (ปกนอน) → (ไบต์, jpg | png)
    pub covers: Mutex<HashMap<String, (Vec<u8>, String)>>,
    /// ภาพปกเดิมที่ดึงออกมาให้หน้าจอดู แยกตามช่อง · ดึงใหม่แล้วลบของเก่า ไม่ให้กองในเครื่อง
    previews: Mutex<HashMap<String, PathBuf>>,
}

// ---------------------------------------------------------------- ช่องปก

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverPreview {
    preview: String,
    width: u32,
    height: u32,
    bytes: u64,
}

/** ภาพของปกเดิมในหนัง (ไฟล์แนบเลข id) ให้หน้าจอดูในช่องปก · ดึงลงโฟลเดอร์ภาพตัวอย่างของโปรแกรม (หน้าจอเปิดรูปได้เฉพาะโฟลเดอร์นี้) */
#[tauri::command]
pub async fn merge_cover_preview(app: AppHandle, path: String, id: u64, slot: String) -> Result<CoverPreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // slot เป็นส่วนของชื่อไฟล์ รับเฉพาะสองช่องนี้ (ผู้ช่วยตรวจขั้น 10 ข้อ 22 · แบบ poster_render)
        if slot != "cover" && slot != "cover_land" { return Err("ช่องปกไม่ถูกต้อง".into()); }
        let (tools, _) = tools_of(&app)?;
        let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("previews");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let out = dir.join(format!("merge-old-{slot}-{}", crate::cover::poster_image::unique()));
        let src = Path::new(&path);
        let ok = if is_matroska(src) {
            let mut target = OsString::from(format!("{id}:"));
            target.push(out.as_os_str());
            let r = run_tool_timeout(&tools, "mkvextract", [OsStr::new(&path), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
            tool_succeeded("mkvextract", &r.status)
        } else {
            // ปกที่ฝังใน MP4 MOV mkvextract เปิดไม่ได้ ดึงสตรีมรูปปกด้วย ffmpeg ไม่แปลง
            match attached_pic_index(&tools, src) {
                Some(ix) => {
                    let map = format!("0:{ix}");
                    let r = run_tool_timeout(&tools, "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-nostdin"), OsStr::new("-n"), OsStr::new("-i"), src.as_os_str(),
                        OsStr::new("-map"), OsStr::new(&map), OsStr::new("-c"), OsStr::new("copy"), OsStr::new("-frames:v"), OsStr::new("1"), OsStr::new("-f"), OsStr::new("image2"), out.as_os_str()], Duration::from_secs(120))?;
                    tool_succeeded("ffmpeg", &r.status)
                }
                None => false,
            }
        };
        if !ok || !out.exists() {
            let _ = std::fs::remove_file(&out);
            return Err("ดึงรูปปกเดิมออกมาไม่ได้".into());
        }
        let bytes = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
        let (width, height) = image::ImageReader::open(&out).ok().and_then(|r| r.with_guessed_format().ok()).and_then(|r| r.into_dimensions().ok()).unwrap_or((0, 0));
        if let Some(old) = app.state::<MergeState>().previews.lock().unwrap().insert(slot, out.clone()) {
            let _ = std::fs::remove_file(old);
        }
        Ok(CoverPreview { preview: out.to_string_lossy().to_string(), width, height, bytes })
    }).await.map_err(|e| e.to_string())?
}

/// เอารูปปกใหม่ที่ครอปไว้ในช่องนั้นออก (ปุ่มเอาออกของรูปใหม่ · ล้างทั้งหมด)
#[tauri::command]
pub fn merge_cover_drop(st: State<'_, MergeState>, slot: Option<String>) {
    let mut c = st.covers.lock().unwrap();
    match slot {
        Some(s) => { c.remove(&s); }
        None => c.clear(),
    }
}

// ---------------------------------------------------------------- คำสั่งของหน้าจอ

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    /// mkv | mp4
    mode: String,
    output: String,
    counts: Counts,
    verified: bool,
    /// kept | trash | none
    original: String,
    original_to: Option<String>,
    notes: Vec<String>,
}

#[tauri::command]
pub fn merge_cancel(st: State<'_, MergeState>) {
    st.cancel.store(true, Ordering::SeqCst);
}

/// รวมตามที่ตั้ง · คืนผลเมื่อเสร็จ ความคืบหน้าส่งทางเหตุการณ์ merge-progress
#[tauri::command]
pub async fn merge_apply(app: AppHandle, req: MergeReq) -> Result<MergeResult, ApplyProblem> {
    tauri::async_runtime::spawn_blocking(move || {
        let st = app.state::<MergeState>();
        if st.running.swap(true, Ordering::SeqCst) {
            return Err(fail("other", "กำลังรวมไฟล์อีกเรื่องอยู่", vec!["รอให้เสร็จก่อน".into()]));
        }
        st.cancel.store(false, Ordering::SeqCst);
        let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let r = apply(&app, &req, &jobs);
        st.running.store(false, Ordering::SeqCst);
        r
    }).await.map_err(|e| fail("other", "รวมไฟล์ไม่สำเร็จ", vec![e.to_string()]))?
}

/// ที่อยู่หนังที่หน้าจอส่งมา · แบบ / (เช่นจากหน้าแก้ซับหรือตัวตรวจ) ทำเป็น \ ก่อน ไม่งั้นเทียบกับไฟล์ใหม่ที่ต่อด้วย dir.join ไม่ตรง
/// (same_name ใน apply และใน finish_output) แล้วงานรวมไฟล์ชื่อเดิมตอบว่ามีไฟล์ชื่อนี้อยู่แล้ว (เจอ 14 พ.ย. 2569 ตอนทำใส่ซับกลับเข้าหนัง แผนหน้าแก้ซับ ขั้น 9)
fn movie_path(p: &str) -> PathBuf {
    PathBuf::from(p.replace('/', "\\"))
}

fn apply(app: &AppHandle, req: &MergeReq, jobs: &Arc<crate::app::jobs::Jobs>) -> Result<MergeResult, ApplyProblem> {
    let st = app.state::<MergeState>();
    let (tools, work) = tools_of(app).map_err(|e| fail("other", "รวมไฟล์ไม่สำเร็จ", vec![e]))?;
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>, next: Option<&str>| {
        let _ = app.emit("merge-progress", Progress { phase: phase.into(), percent, eta, next: next.map(String::from), fin: false });
    };
    // ช่วงท้ายหลังเลยจุดที่หยุดได้ ส่ง final ทุกครั้ง
    let emit_final = |phase: &str, percent: f64| {
        let _ = app.emit("merge-progress", Progress { phase: phase.into(), percent, eta: None, next: None, fin: true });
    };
    let src = movie_path(&req.movie);
    let src_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {src_name} ไม่ถูกแตะ");
    let dir = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let src_size = std::fs::metadata(&src).map_err(|_| fail("other", "หาไฟล์หนังไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]))?.len();
    let mp4 = req.output == "mp4";
    let kept: Vec<&Track> = req.tracks.iter().filter(|t| t.keep).collect();
    if !kept.iter().any(|t| t.kind == "video") {
        return Err(fail("other", "ไฟล์ใหม่ต้องมีภาพ", vec!["เอาแทร็กภาพกลับมาก่อน".into(), untouched]));
    }
    // ไฟล์ที่เพิ่มต้องยังอยู่
    for s in inputs_of(&req.movie, &req.tracks).iter().skip(1) {
        if !Path::new(s).exists() {
            return Err(fail("other", "หาไฟล์ที่เพิ่มไม่เจอ", vec![s.clone(), "ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้าย".into(), untouched]));
        }
    }
    if !not_in_use(&src) {
        return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched]));
    }
    // MP4 · แทร็กที่ใส่ไม่ได้ต้องเอาออกก่อน (หน้าจอถามแล้วเอาออกให้)
    if mp4 {
        let bad: Vec<String> = kept.iter().filter(|t| mp4_unfit(t))
            .map(|t| format!("{} {} {}", kind_word(&t.kind), t.codec, t.why.clone().unwrap_or_else(|| "ใส่ใน MP4 ไม่ได้".into()))).collect();
        if !bad.is_empty() {
            let mut d = bad;
            d.push(untouched);
            return Err(fail("mp4", format!("มีแทร็กที่ใส่ใน MP4 ไม่ได้ {} อัน", d.len() - 1), d));
        }
    }
    let target = dir.join(format!("{}.{}", src.file_stem().unwrap_or_default().to_string_lossy(), if mp4 { "mp4" } else { "mkv" }));
    let same_name = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if !same_name && target.exists() {
        return Err(fail("exists", "มีไฟล์ชื่อนี้อยู่แล้ว ไม่เขียนทับ", vec![target.to_string_lossy().to_string(), untouched]));
    }
    let partial = PathBuf::from(format!("{}.partial", target.to_string_lossy()));
    if target.to_string_lossy().encode_utf16().count() + 8 > MAX_PATH_LEN {
        return Err(fail("other", "ที่อยู่ไฟล์ยาวเกินไป", vec!["เปลี่ยนชื่อไฟล์ให้สั้นลงก่อน".into(), untouched]));
    }
    // ที่ว่าง · ราวขนาดหนัง บวกไฟล์ที่เพิ่ม บวกรูปปก บวกเสียงที่แปลง
    let added: u64 = inputs_of(&req.movie, &req.tracks).iter().skip(1).filter_map(|s| std::fs::metadata(s).ok()).map(|m| m.len()).sum();
    let cover_bytes: u64 = st.covers.lock().unwrap().values().map(|c| c.0.len() as u64).sum::<u64>()
        + req.fonts.iter().filter_map(|f| std::fs::metadata(f).ok()).map(|m| m.len()).sum::<u64>();
    let conv: u64 = req.tracks.iter().filter(|t| t.keep && t.kind == "audio").filter_map(conv_estimate).sum();
    let need = src_size + added + cover_bytes + conv + 64 * 1024 * 1024;
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }
    // เสียงที่แปลงเขียนลงโฟลเดอร์ชั่วคราวของโปรแกรม (ไดรฟ์ C) ก่อนรวม · ไดรฟ์นั้นต้องมีที่พอด้วย
    if conv > 0 {
        let wfree = free_space(work.parent().unwrap_or(&work));
        let wneed = conv + 64 * 1024 * 1024;
        // ไดรฟ์เดียวกับหนัง เสียงที่แปลงอยู่ในโฟลเดอร์ชั่วคราวพร้อมไฟล์ใหม่ที่มีเสียงนี้ ต้องใช้สองเท่า (ผู้ช่วยตรวจขั้น 10 ข้อ 12)
        if drive_letter(&work) == drive_letter(&dir) && free < need + conv {
            return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} (รวมไฟล์เสียงที่แปลงในโฟลเดอร์ชั่วคราว) แต่เหลือ {}", fmt_gb(need + conv), fmt_gb(free)), untouched]));
        }
        if drive_letter(&work) != drive_letter(&dir) && wfree < wneed {
            return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอสำหรับไฟล์เสียงที่แปลง", drive_letter(&work)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(wneed), fmt_gb(wfree)), untouched]));
        }
    }
    // ตรวจไฟล์ต้นทางก่อน · อ่านทุกแพ็กเก็ตโดยไม่ถอดภาพ (แบบหน้าใส่โปสเตอร์)
    if req.check_source {
        let total = ffprobe_json(&tools, &src).ok().as_ref().and_then(duration_of).unwrap_or(0.0);
        emit("กำลังตรวจไฟล์ต้นทาง", 0.0, None, Some("รวมเข้าไฟล์ใหม่"));
        let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from)
            .chain([src.as_os_str().to_owned()]).chain(["-map", "0", "-c", "copy", "-f", "null", "-"].iter().map(OsString::from)).collect();
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let r = run_live(&tools, "ffmpeg", &args, &stop, &mut |l| {
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
                if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    let pct = (us / 1e6 / total * 100.0).clamp(0.0, 100.0);
                    emit("กำลังตรวจไฟล์ต้นทาง", pct, eta(t0, pct), Some("รวมเข้าไฟล์ใหม่"));
                }
            }
        }).map_err(|e| fail("tool", "ตรวจไฟล์ต้นทางไม่สำเร็จ", vec![e, untouched.clone()]))?;
        match r {
            Run::Cancelled => return Err(cancelled(&untouched, None)),
            Run::Done(status, stderr) => {
                let errs: Vec<&str> = stderr.lines().map(str::trim)
                    .filter(|l| !l.is_empty() && !l.contains("non monotonically increasing dts") && !l.contains("Timestamps are unset")).collect();
                if !status.success() || !errs.is_empty() {
                    return Err(fail("badsource", "ไฟล์ต้นทางมีที่เสียอยู่แล้ว", vec![
                        errs.first().map(|e| e.chars().take(120).collect()).unwrap_or_else(|| "อ่านไฟล์ไม่จบ".into()),
                        "ปิดตัวเลือก ตรวจไฟล์ต้นทางก่อน ถ้าต้องการทำต่อ".into(), untouched,
                    ]));
                }
            }
        }
    }

    let mut notes = vec![];
    let new_covers = st.covers.lock().unwrap().clone();
    let made = produce(&tools, &work, req, &new_covers, &partial, &stop, &emit, &mut notes, &untouched)?;
    // กดหยุดระหว่างตรวจไฟล์ใหม่ · หยุดจริงก่อนแตะไฟล์เดิม ตามที่ข้อความยืนยันหยุดบอก (ผู้ช่วยตรวจขั้น 10 ข้อ 9)
    if stop() {
        let _ = std::fs::remove_file(&partial);
        return Err(cancelled(&untouched, None));
    }
    // การจับคู่เก็บไว้กับเรื่องเดิม · ไฟล์ใหม่คนละชื่อ (เช่น MP4 เป็น MKV) การจับคู่ไม่ตามไป บอกในผล (ข้อ 13)
    let old_pairs = { let lib = app.state::<Arc<crate::app::library::LibraryStore>>(); let k = src.to_string_lossy().to_lowercase(); lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == k).map(|m| m.pairs.len()).unwrap_or(0) };
    // จากนี้ไฟล์เดิมจะถูกย้าย หยุดไม่ได้แล้ว บอกหน้าจอก่อนแตะไฟล์เดิม (AUDIT ข้อ 14)
    // เดิมปุ่มหยุดยังอยู่จนจบ กล่องยืนยันบอกว่าไฟล์เดิมไม่ถูกแตะ ทั้งที่ไฟล์เดิมย้ายไปแล้วและงานไม่หยุด
    emit_final("กำลังย้ายไฟล์ใหม่เข้าที่", 100.0);
    // เช็กซ้ำก่อนย้ายไฟล์เดิม · ระหว่างรวมผู้ใช้อาจเปิดหนังเรื่องนี้ดู
    let (original, original_to) = finish_output(app, &src, &target, &partial, &req.original, made.verified, &untouched, &mut notes)?;
    if old_pairs > 0 && !target.to_string_lossy().eq_ignore_ascii_case(&src.to_string_lossy()) {
        notes.push(format!("เรื่องเดิมจับคู่เสียงหรือซับไว้ {old_pairs} ไฟล์  ไฟล์ใหม่ชื่อนามสกุลต่างจากเดิม การจับคู่จึงไม่ตามไป แต่จับคู่ใหม่ได้ที่หน้านี้"));
    }
    // ไฟล์ใหม่ชื่อเดิม จดขนาดกับค่า hash ใหม่เป็นงานของโปรแกรมเอง ไม่ให้ชั้นวางขึ้นว่าไฟล์ถูกเปลี่ยนหลังตรวจ (ข้อ 14 · แบบหน้าใส่โปสเตอร์)
    if target.to_string_lossy().eq_ignore_ascii_case(&src.to_string_lossy()) {
        emit_final("กำลังจดข้อมูลไฟล์ใหม่", 100.0);
        crate::app::library::refresh_own_edit(app, &target, &|pct| emit_final("กำลังจดค่า hash ใหม่", pct));
    }
    // ใส่รูปปกใหม่เข้าไฟล์แล้ว ล้างช่องรูป ไม่ให้ติดไปเรื่องถัดไป
    st.covers.lock().unwrap().clear();
    let lib = app.state::<Arc<crate::app::library::LibraryStore>>();
    let _ = crate::app::library::scan_library(app.clone(), lib);
    Ok(MergeResult {
        mode: req.output.clone(), output: target.to_string_lossy().to_string(), counts: made.counts, verified: made.verified, original, original_to, notes,
    })
}

mod run;
pub use run::*;

mod verify;
pub use verify::*;

mod args;
pub use args::*;

pub mod inspect;
pub use inspect::*;

mod tracks;
pub use tracks::*;

#[cfg(test)]
mod tests;
