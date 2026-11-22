//! ซับจริงบนภาพนิ่งของหน้าแก้ซับ กับบันทึกและคัดลอกภาพแบบ Aegisub (BUGS ข้อ 111 ส่วนที่สอง)
//! ตัวกรอง subtitles ของ ffmpeg ใช้ libass ตัวเดียวกับที่ mpv และ Aegisub ใช้ วาดซับของเอกสารที่กำลังแก้ ณ เวลาของเฟรม
//! ภาพนิ่งบนจอ วาดเฉพาะซับบนพื้นโปร่งใสแล้ววางทับภาพหนังที่เก็บไว้ ไม่ต้องถอดภาพหนังใหม่ทุกครั้งที่แก้ซับ
//! เมนูคลิกขวาบนภาพ (default_menu.json video_context) บันทึกภาพ PNG หรือคัดลอกภาพ สามแบบ มีซับ ไม่มีซับ เฉพาะซับพื้นโปร่งใส
//! บันทึกข้างหนังชื่อ <ชื่อหนัง>_<ลำดับ 3 หลัก>_<เลขเฟรม>.png นับลำดับขึ้นจนชื่อไม่ชน (command/video.cpp save_snapshot) ไม่เขียนทับไฟล์เดิม
//! ฟอนต์ที่ฝังในหนัง MKV ดึงออกมาครั้งเดียวต่อเรื่องไว้ในโฟลเดอร์ tmp ของโปรแกรม ซับจึงขึ้นฟอนต์เดียวกับตอนเล่นด้วย mpv
//! ไฟล์หนังถูกอ่านอย่างเดียว ไม่ถูกแก้
use std::ffi::OsString;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::subtitle::subdoc::SubDoc;
use crate::app::tools::{run_tool_timeout, tool_succeeded, tools_dir};

pub(crate) fn work_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// ที่อยู่ไฟล์ในคำสั่งตัวกรองของ ffmpeg ซึ่งถอดสองชั้น ชั้นคำสั่งตัวกรอง (เครื่องหมายคำพูดเดี่ยว) กับชั้นค่าของตัวเลือก (\: แทน :)
/// ใช้ / แทน \ · เครื่องหมาย ' ในที่อยู่ ปิดคำพูดแล้วใส่ \' ข้างนอก แล้วเปิดคำพูดใหม่
fn filter_path(p: &Path) -> String {
    let l1 = p.to_string_lossy().replace('\\', "/").replace(':', "\\:").replace('\'', "\\'");
    format!("'{}'", l1.replace('\'', "'\\''"))
}

/// ตัวกรอง subtitles · original_size ขนาดจริงของภาพหนัง (libass ใช้คิดเส้นขอบและเงาตอน ScaledBorderAndShadow ไม่ใช่ yes)
pub(crate) fn subs_filter(sub: &Path, fonts: Option<&Path>, ow: u32, oh: u32, alpha: bool) -> String {
    let mut s = format!("subtitles=f={}", filter_path(sub));
    if ow > 0 && oh > 0 { s.push_str(&format!(":original_size={ow}x{oh}")); }
    if let Some(f) = fonts { s.push_str(&format!(":fontsdir={}", filter_path(f))); }
    if alpha { s.push_str(":alpha=1"); }
    s
}

/// ซับทั้งไฟล์เป็นไฟล์ชั่วคราว UTF-8 (libass อ่าน UTF-8) · ชื่อขึ้นต้น sub- โปรแกรมกวาดทิ้งเองตอนเปิดครั้งหน้า (lib.rs)
pub(crate) struct TmpSub(pub(crate) PathBuf);
impl TmpSub {
    pub(crate) fn new(work: &Path, doc: &SubDoc) -> Result<Self, String> {
        let ext = match doc.kind.as_str() { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" };
        let p = work.join(format!("sub-shot-{}.{ext}", crate::cover::poster_image::unique()));
        std::fs::write(&p, crate::subtitle::subdoc::render(doc)).map_err(|e| e.to_string())?;
        Ok(Self(p))
    }
}
impl Drop for TmpSub {
    fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
}

fn is_mkv(p: &Path) -> bool {
    matches!(p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("mkv" | "mka" | "mks" | "mk3d" | "webm"))
}

/// ไฟล์แนบที่เป็นฟอนต์ (ชนิดไฟล์หรือนามสกุล)
fn is_font(name: &str, mime: &str) -> bool {
    let m = mime.to_lowercase();
    let n = name.to_lowercase();
    m.contains("font") || m.contains("truetype") || m.contains("opentype") || [".ttf", ".otf", ".ttc", ".otc"].iter().any(|e| n.ends_with(e))
}

/// ชื่อไฟล์แนบที่ใช้เป็นชื่อไฟล์บนเครื่องได้ ไม่มีโฟลเดอร์ซ้อน ไม่มีอักษรต้องห้าม
fn safe_name(n: &str, id: u64) -> String {
    let base = Path::new(n).file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    let s: String = base.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    if s.trim().is_empty() { format!("font-{id}.ttf") } else { s }
}

/// ฟอนต์ที่ฝังในหนัง MKV ดึงออกมาครั้งเดียวต่อเรื่อง (ที่อยู่ ขนาด เวลาแก้ไฟล์เดิม) · ไม่มีฟอนต์หรือไม่ใช่ MKV ได้ None
/// เก็บไว้ไม่เกิน 8 เรื่องล่าสุด ที่เก่ากว่านั้นลบทิ้ง
pub(crate) fn movie_fonts(tools: &Path, work: &Path, movie: &Path) -> Option<PathBuf> {
    if !is_mkv(movie) { return None; }
    let md = std::fs::metadata(movie).ok()?;
    let mtime = md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let key = format!("{}|{}|{}", movie.display(), md.len(), mtime);
    let mut h: u64 = 0xcbf29ce484222325;
    for b in key.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    let dir = work.join(format!("subfonts-{h:016x}"));
    let ok = dir.join(".ok");
    if ok.exists() {
        let _ = std::fs::write(&ok, b"");
        let has = std::fs::read_dir(&dir).ok()?.flatten().any(|e| e.file_name() != ".ok");
        return has.then_some(dir);
    }
    let j = crate::merge::mkv_json(tools, movie).ok()?;
    let fonts: Vec<(u64, String)> = j["attachments"].as_array().map(|a| a.iter().filter_map(|x| {
        let name = x["file_name"].as_str().unwrap_or("");
        let mime = x["content_type"].as_str().unwrap_or("");
        let id = x["id"].as_u64()?;
        is_font(name, mime).then(|| (id, safe_name(name, id)))
    }).collect()).unwrap_or_default();
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).ok()?;
    if !fonts.is_empty() {
        let mut args: Vec<OsString> = vec![movie.as_os_str().to_owned(), "attachments".into()];
        let mut used = std::collections::HashSet::new();
        for (id, name) in &fonts {
            // ชื่อซ้ำกันในหนัง ต่อเลขไฟล์แนบ ไม่ให้ทับกัน
            let n = if used.insert(name.to_lowercase()) { name.clone() } else { format!("{id}-{name}") };
            let mut t = OsString::from(format!("{id}:"));
            t.push(dir.join(n).as_os_str());
            args.push(t);
        }
        let r = run_tool_timeout(tools, "mkvextract", &args, Duration::from_secs(120)).ok()?;
        if !tool_succeeded("mkvextract", &r.status) { let _ = std::fs::remove_dir_all(&dir); return None; }
    }
    std::fs::write(&ok, b"").ok()?;
    prune_fonts(work, &dir);
    (!fonts.is_empty()).then_some(dir)
}

fn prune_fonts(work: &Path, keep: &Path) {
    let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("subfonts-") && e.path() != keep)
        .map(|e| (e.path().join(".ok").metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in v.into_iter().skip(7) { let _ = std::fs::remove_dir_all(p); }
}

fn ffmpeg_png(tools: &Path, args: &[OsString]) -> Result<Vec<u8>, String> {
    let o = run_tool_timeout(tools, "ffmpeg", args, Duration::from_secs(60))?;
    if !tool_succeeded("ffmpeg", &o.status) || o.stdout.len() < 8 {
        let err = String::from_utf8_lossy(&o.stderr);
        let last = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        return Err(if last.is_empty() { "วาดภาพไม่สำเร็จ".into() } else { format!("วาดภาพไม่สำเร็จ {last}") });
    }
    Ok(o.stdout)
}

const PNG_OUT: [&str; 6] = ["-frames:v", "1", "-f", "image2pipe", "-c:v", "png"];

/// เอกสารที่ส่งให้ libass วาดภาพนิ่ง กับว่าต้องคิดสีแบบตัวเล่นไหม (BUGS ข้อ 124 ยกวิธีจาก pgs.rs prepare)
/// ASS SSA ตั้ง YCbCr Matrix เป็น None ให้สีตรงสไตล์ ไม่งั้นตัวกรอง subtitles บีบสีเหลือช่วง 16 ถึง 235 (เหลือง 255,215,0 ได้ 235,201,16)
/// แล้วคิดสีแบบ VSFilter เมื่อซับเป็น TV.601 (หรือไม่บอก) บนหนัง HD สูงเกิน 576 จุด แบบที่ mpv แสดง · SRT VTT ffmpeg ใส่ None ให้เองอยู่แล้ว
fn prep(doc: &SubDoc, oh: u32) -> (SubDoc, bool) {
    if doc.kind == "ass" || doc.kind == "ssa" {
        let tv601 = crate::subtitle::pgs::script_tv601(doc);
        let mut d = doc.clone();
        crate::subtitle::pgs::set_matrix_none(&mut d);
        return (d, tv601 && oh > 576);
    }
    (doc.clone(), false)
}

/// ซับ ณ เวลา t_ms ขนาด w × h เป็น RGBA แบบไม่คูณความโปร่งใส (แบบ PNG) · ow oh ขนาดจริงของหนัง
/// วาดบนพื้นดำทึบกับพื้นขาวทึบแล้วคิดความทึบเอง (pgs.rs spawn_pair pair_to_rgba) ไม่ใช้โหมด alpha=1 ที่คิดความทึบของสีโปร่งแสงผิด (เงาครึ่งหนึ่ง 128 ได้ 63)
#[allow(clippy::too_many_arguments)]
fn subs_rgba(tools: &Path, work: &Path, doc: &SubDoc, fonts: Option<&Path>, t_ms: f64, w: u32, h: u32, ow: u32, oh: u32) -> Result<Vec<u8>, String> {
    let (ow, oh) = if ow > 0 && oh > 0 { (ow, oh) } else { (w, h) };
    let (d, mangle) = prep(doc, oh);
    let sub = TmpSub::new(work, &d)?;
    let buf = crate::subtitle::pgs::render_pair(tools, &sub.0, fonts, w, h, ow, oh, (t_ms.max(0.0) * 1000.0).round() as i64)?;
    Ok(crate::subtitle::pgs::straight_px(&buf, mangle, 0.0))
}

fn png_rgba(px: Vec<u8>, w: u32, h: u32) -> Result<Vec<u8>, String> {
    let img = image::RgbaImage::from_raw(w, h, px).ok_or("ทำภาพไม่ได้")?;
    let mut v = std::io::Cursor::new(Vec::new());
    img.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(v.into_inner())
}

/// ภาพเฉพาะซับที่วางทับภาพหนังบนจอ · ได้ PNG เป็น data URL
/// t เวลาของซับ ms (เวลาของเฟรมลบดีเลย์ของซับ) · w h ขนาดที่วาด (ขนาดภาพบนจอ) · ow oh ขนาดจริงของภาพหนัง
#[tauri::command]
pub async fn sub_overlay(app: AppHandle, doc: SubDoc, t: f64, w: u32, h: u32, ow: u32, oh: u32, movie: Option<String>) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let fonts = movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| movie_fonts(&tools, &work, Path::new(m)));
        let png = overlay_png(&tools, &work, &doc, fonts.as_deref(), t, w.clamp(16, 4096), h.clamp(16, 4096), ow, oh)?;
        Ok(format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&png)))
    }).await.map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapReq {
    /// หนัง · ว่างคือวิดีโอจำลอง ใช้ภาพพื้น bg ที่หน้าจอวาดส่งมา
    movie: Option<String>,
    /// เวลาที่ใช้ seek ให้ได้เฟรมนั้น (วินาที แบบที่หน้าจอส่งให้ vid_frames)
    ss: f64,
    /// เวลาของซับ ms
    t: f64,
    /// ขนาดภาพที่ได้ (ขนาดแสดงผลของหนัง คิดอัตราส่วนภาพแล้ว)
    w: u32,
    h: u32,
    /// ขนาดจริงของภาพหนัง
    ow: u32,
    oh: u32,
    /// subs มีซับ · raw ไม่มีซับ · only เฉพาะซับพื้นโปร่งใส
    mode: String,
    frame: u32,
    /// save บันทึก PNG · copy คัดลอกลงคลิปบอร์ด
    dest: String,
    /// โฟลเดอร์ที่บันทึกตอนเป็นวิดีโอจำลอง (โฟลเดอร์ของไฟล์ซับ) · ไม่มีใช้โฟลเดอร์ผู้ใช้
    dir: Option<String>,
    /// ตัวตรวจ ไม่แตะคลิปบอร์ดของคนที่ใช้คอม คืนขนาดภาพอย่างเดียว
    #[serde(default)]
    dry: bool,
}

#[derive(Serialize)]
pub struct SnapOut {
    path: Option<String>,
    w: u32,
    h: u32,
    bytes: usize,
}

/// ที่บันทึก <โฟลเดอร์>/<ชื่อ>_<ลำดับ>_<เฟรม>.png ลำดับเริ่ม 001 นับขึ้นจนชื่อไม่ชน · สร้างแบบห้ามทับ ชนกันตอนเขียนก็นับต่อ
fn save_new(dir: &Path, stem: &str, frame: u32, png: &[u8]) -> Result<PathBuf, String> {
    for n in 1..100_000u32 {
        let p = dir.join(format!("{stem}_{n:03}_{frame}.png"));
        if p.exists() { continue; }
        match std::fs::OpenOptions::new().write(true).create_new(true).open(&p) {
            Ok(mut f) => {
                if let Err(e) = f.write_all(png).and_then(|_| f.sync_all()) {
                    drop(f);
                    let _ = std::fs::remove_file(&p);
                    return Err(format!("เขียนไฟล์ภาพไม่ได้ {e}"));
                }
                return Ok(p);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("เขียนไฟล์ภาพไม่ได้ {e}")),
        }
    }
    Err("ตั้งชื่อไฟล์ภาพไม่ได้".into())
}

/// บันทึกหรือคัดลอกภาพของเฟรมที่เห็น ขนาดเต็มของหนัง (เมนูคลิกขวาบนภาพ)
/// doc กับ bg อยู่นอก req บันทึกการใช้งานจะตัดสองค่านี้ออกก่อนจด (actlog json_detail)
#[tauri::command]
pub async fn vid_snapshot(app: AppHandle, req: SnapReq, doc: Option<SubDoc>, bg: Option<String>) -> Result<SnapOut, String> {
    let tools = tools_dir(&app)?;
    let work = work_dir(&app)?;
    let hwnd = app.get_webview_window("main").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize).unwrap_or(0);
    tauri::async_runtime::spawn_blocking(move || {
        let w = req.w.clamp(16, 8192);
        let h = req.h.clamp(16, 8192);
        let movie = req.movie.as_deref().filter(|m| !m.is_empty()).map(PathBuf::from);
        if let Some(m) = &movie { if !m.exists() { return Err("หาไฟล์หนังไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string()); } }
        // ซับวาดแยกด้วยตัววาดแบบ PGS แล้ววางบนภาพเอง (BUGS ข้อ 124) · เดิมให้ ffmpeg วาดลงภาพ สีหม่นและความทึบเพี้ยน
        let sub_doc = match (&doc, req.mode != "raw") {
            (Some(d), true) => Some(d),
            (None, true) => return Err("ไม่มีซับให้วาด".into()),
            _ => None,
        };
        let fonts = movie.as_deref().and_then(|m| movie_fonts(&tools, &work, m));
        let png = if req.mode == "only" {
            overlay_png(&tools, &work, sub_doc.ok_or("ไม่มีซับให้วาด")?, fonts.as_deref(), req.t, w, h, req.ow, req.oh)?
        } else {
            let base = match &movie {
                Some(m) => {
                    let mut a = crate::video::vidframes::seek_args(m, req.ss, 1);
                    a.push("-vf".into());
                    a.push(frame_filter(w, h).into());
                    a.extend(PNG_OUT.iter().map(OsString::from));
                    a.push("-".into());
                    ffmpeg_png(&tools, &a)?
                }
                // วิดีโอจำลอง ภาพพื้นที่หน้าจอวาดขนาดเต็มส่งมา
                None => {
                    let data = bg.as_deref().and_then(|s| s.split_once(',').map(|x| x.1)).ok_or("ไม่มีภาพของวิดีโอจำลอง")?;
                    crate::audio::audiograph::unb64(data)?
                }
            };
            match sub_doc {
                Some(d) => subs_on_png(&tools, &work, d, &base, fonts.as_deref(), req.t, w, h, req.ow, req.oh)?,
                None => base,
            }
        };
        bytes_out(png, &req, hwnd, &movie)
    }).await.map_err(|e| e.to_string())?
}

/// ภาพหนังย่อขยายเป็นขนาดแสดงผล (จุดภาพสี่เหลี่ยมจัตุรัส) · ซับวางทับทีหลังด้วย subs_on_png
fn frame_filter(w: u32, h: u32) -> String {
    format!("scale={w}:{h},setsar=1")
}

/// ภาพที่ได้ บันทึกเป็นไฟล์ใหม่ หรือใส่คลิปบอร์ด
fn bytes_out(png: Vec<u8>, req: &SnapReq, hwnd: isize, movie: &Option<PathBuf>) -> Result<SnapOut, String> {
    let img = image::load_from_memory_with_format(&png, image::ImageFormat::Png).map_err(|e| format!("อ่านภาพที่วาดไม่ได้ {e}"))?;
    let (iw, ih) = (img.width(), img.height());
    if req.dest == "copy" {
        if !req.dry { crate::app::winutil::clipboard_image(hwnd, &png, &img.to_rgba8())?; }
        return Ok(SnapOut { path: None, w: iw, h: ih, bytes: png.len() });
    }
    // ที่เก็บแบบ Aegisub ?video โฟลเดอร์ของหนัง · วิดีโอจำลองใช้โฟลเดอร์ของซับ ไม่มีใช้โฟลเดอร์ผู้ใช้ ชื่อ dummy
    let (dir, stem) = match movie {
        Some(m) => (m.parent().map(Path::to_path_buf).unwrap_or_default(), m.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "video".into())),
        None => {
            let d = req.dir.as_deref().filter(|d| !d.is_empty() && Path::new(d).is_dir()).map(PathBuf::from)
                .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from)).ok_or("หาโฟลเดอร์ที่บันทึกไม่เจอ")?;
            (d, "dummy".to_string())
        }
    };
    let p = save_new(&dir, &stem, req.frame, &png)?;
    Ok(SnapOut { path: Some(p.display().to_string()), w: iw, h: ih, bytes: png.len() })
}

/// เฉพาะซับพื้นโปร่งใสเป็น PNG (ภาพที่วางทับภาพหนังบนจอ และบันทึกแบบเฉพาะซับ)
#[allow(clippy::too_many_arguments)]
pub(crate) fn overlay_png(tools: &Path, work: &Path, doc: &SubDoc, fonts: Option<&Path>, t_ms: f64, w: u32, h: u32, ow: u32, oh: u32) -> Result<Vec<u8>, String> {
    png_rgba(subs_rgba(tools, work, doc, fonts, t_ms, w, h, ow, oh)?, w, h)
}

/// ซับวางบนภาพพื้น base (PNG ภาพหนังหรือวิดีโอจำลอง) ได้ PNG ขนาด w × h · ภาพพื้นที่ขนาดไม่ตรงย่อขยายก่อน
/// ผสมแบบเดียวกับตัวเล่น สีซับคูณความทึบบวกพื้นคูณส่วนที่เหลือ
#[allow(clippy::too_many_arguments)]
pub(crate) fn subs_on_png(tools: &Path, work: &Path, doc: &SubDoc, base: &[u8], fonts: Option<&Path>, t_ms: f64, w: u32, h: u32, ow: u32, oh: u32) -> Result<Vec<u8>, String> {
    let mut bg = image::load_from_memory(base).map_err(|e| format!("อ่านภาพพื้นไม่ได้ {e}"))?.to_rgb8();
    if bg.width() != w || bg.height() != h { bg = image::imageops::resize(&bg, w, h, image::imageops::FilterType::Triangle); }
    let sub = subs_rgba(tools, work, doc, fonts, t_ms, w, h, ow, oh)?;
    for (p, s) in bg.pixels_mut().zip(sub.chunks_exact(4)) {
        let a = s[3] as u32;
        if a == 0 { continue; }
        for k in 0..3 { p.0[k] = ((s[k] as u32 * a + p.0[k] as u32 * (255 - a) + 127) / 255) as u8; }
    }
    let mut v = std::io::Cursor::new(Vec::new());
    bg.write_to(&mut v, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    Ok(v.into_inner())
}

#[cfg(test)]
#[path = "subshot_tests.rs"]
mod tests;
