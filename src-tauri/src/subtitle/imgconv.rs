//! แปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125) · VobSub (.idx .sub) PGS (.sup) และ BDN XML กับ PNG แปลงไปมาได้
//! ย่อขยายขนาดภาพ เปลี่ยนอัตราเฟรม เลื่อนเวลา ตั้งจานสี กรองซับบังคับ · ใช้ BDSup2Sub++ เป็นหลัก ส่วน SeConv ของ Subtitle Edit เป็นทางสำรอง
//! พี่กันสั่ง 15 พ.ย. 2569 "เอามาก็ดีนะ ตอนระบบแปลงจากซับภาพเป็นซับภาพ" แล้วอนุญาตโหลด BDSup2Sub++ 1.0.5
//!
//! 🔴 กันหน้าต่างเด้ง (พี่กันสั่ง "ห้ามเด้งหน้าจออะไรนะ")
//! - BDSup2Sub++ ชุดนี้เป็นโปรแกรมคอนโซล (ชนิด 3 ในหัวไฟล์ PE) ตัวรับคำสั่งเรียก AllocConsole ทุกครั้ง · เปิดด้วย CREATE_NO_WINDOW (tool_command)
//!   จึงมีคอนโซลที่มองไม่เห็นอยู่แล้ว AllocConsole ไม่สร้างหน้าต่างใหม่
//! - ถ้าไม่ส่ง -o โปรแกรมเปิดหน้าต่างแบบ GUI แทน (main.cpp execCLI คืน false) · คำสั่งจากที่นี่ส่งไฟล์ต้นทางกับ -o ทุกครั้ง
//! - โปรแกรมพังกับไฟล์บางไฟล์ (เช่น VobSub ตัวอย่างของ ffmpeg ที่ MPlayer ทำ ล้มด้วย 0xC0000005 ที่แพ็กเก็ตที่ 5) · ตั้ง SetErrorMode ก่อนเปิด
//!   Windows จะไม่ขึ้นกล่องโปรแกรมหยุดทำงาน แล้วบอกให้ลอง Subtitle Edit แทน
//! - ค่าตั้งของ BDSup2Sub++ อยู่ที่ %APPDATA%\bdsup2sub++ · ตั้ง APPDATA เป็นโฟลเดอร์ของโปรแกรมเอง ไม่ปนกับค่าตั้งของคนที่ใช้ตัวหน้าต่าง
//!
//! ไฟล์ต้นทางถูกอ่านอย่างเดียว · ซับในหนังดึงออกมาเป็นไฟล์ชั่วคราวก่อน (MKV ใช้ mkvextract ไฟล์อื่นใช้ ffmpeg เฉพาะ PGS)
//! ผลทำในโฟลเดอร์ชั่วคราวข้างปลายทาง ตรวจแล้วย้ายแบบไม่เขียนทับ (rename::move_no_replace) · ปลายทางมีอยู่แล้วตอบ exists
use std::ffi::OsString;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::app::tools::{run_tool_timeout, tool_command, tool_succeeded, tools_dir};

static STOP: AtomicBool = AtomicBool::new(false);

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct ImgReq {
    /// ไฟล์หนังหรือไฟล์ซับ
    pub src: String,
    pub in_movie: bool,
    /// เลขแทร็กของ mkvmerge กับเลขสตรีมของ ffprobe (ซับในหนัง)
    pub tid: u64,
    pub ff: u64,
    /// ชนิดซับต้นทาง pgs หรือ vobsub
    pub kind: String,
    /// ปลายทาง นามสกุลบอกชนิด .sup .idx .xml
    pub target: String,
    /// bdsup หรือ seconv
    pub engine: String,
    /// keep 1080 1440x1080 720 576 480
    pub resolution: String,
    /// อัตราเฟรมของต้นทาง auto หรือตัวเลขแบบดรอปดาวน์ของ BDSup2Sub · ปลายทาง keep หรือตัวเลข (SubtitleProcessor::getFPS)
    pub fps_source: String,
    pub fps_target: String,
    /// เลื่อนเวลา ms (ลบได้)
    pub delay: i64,
    /// ตัวย่อขยายภาพ bilinear bicubic lanczos3 …
    pub filter: String,
    /// จานสี keep create dither
    pub palette: String,
    /// แก้ภาพที่ขึ้นสั้นเกิน ให้ขึ้นอย่างน้อย min_time ms · ส่ง --minimum-time เฉพาะตอนเปิด เพราะตัวเลือกนี้เปิดการแก้ไปด้วยในตัว
    pub fix_short: bool,
    pub min_time: u32,
    /// ย้ายแนวตั้ง none inside outside up down · ratio สัดส่วนภาพของหนังตอน inside outside (ต้องเกิน 16:9) · move_y_offset จุด
    pub move_y: String,
    pub ratio: f64,
    pub move_y_offset: i32,
    /// ย้ายแนวนอน none left right center origin
    pub move_x: String,
    pub move_x_offset: i32,
    /// ตัดภาพบนล่างกี่จุด
    pub crop_y: u32,
    /// เกณฑ์ของ VobSub ปลายทาง · alpha_thr 0 ถึง 255 (ค่าตั้งต้น 80) · lum_low lum_hi 0 คือใช้ค่าของโปรแกรม
    pub alpha_thr: u32,
    pub lum_low: u32,
    pub lum_hi: u32,
    /// all only exclude
    pub forced: String,
    /// ว่าง set clear
    pub force_all: String,
    /// ภาษาของ VobSub ปลายทาง สองตัวอักษร
    pub language: String,
    /// ย่อขยายภาพซับเทียบภาพหนัง 1 คือเท่าเดิม
    pub scale_x: f64,
    pub scale_y: f64,
    /// แก้ภาพที่จานสีโปร่งใสทั้งหมดจนมองไม่เห็น
    pub fix_invisible: bool,
}

impl Default for ImgReq {
    fn default() -> Self {
        ImgReq {
            src: String::new(), in_movie: false, tid: 0, ff: 0, kind: "pgs".into(), target: String::new(), engine: "bdsup".into(),
            resolution: "keep".into(), fps_source: "auto".into(), fps_target: "keep".into(), delay: 0, filter: "bilinear".into(), palette: "create".into(),
            fix_short: false, min_time: 500, move_y: "none".into(), ratio: 2.35, move_y_offset: 0, move_x: "none".into(), move_x_offset: 0, crop_y: 0,
            alpha_thr: 80, lum_low: 0, lum_hi: 0,
            forced: "all".into(), force_all: String::new(), language: "th".into(), scale_x: 1.0, scale_y: 1.0, fix_invisible: false,
        }
    }
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImgOut {
    /// ไฟล์หรือโฟลเดอร์ที่ได้ (VobSub ได้สองไฟล์ BDN XML ได้โฟลเดอร์)
    pub files: Vec<String>,
    pub images: usize,
    pub w: u32,
    pub h: u32,
    pub bytes: u64,
    /// คำเตือนจาก BDSup2Sub++ เช่นเวลาจบไม่เกินเวลาเริ่ม แก้ให้แล้ว
    pub warnings: Vec<String>,
}

pub fn bdsup_exe(tools: &Path) -> PathBuf { tools.join("bdsup2sub").join("bdsup2sub++.exe") }

/// ซับภาพของแผ่น HD DVD นามสกุล .sup เหมือน PGS แต่หัวไฟล์เป็น SP แทน PG · ffmpeg กับ mkvmerge ไม่รู้จัก ส่วน BDSup2Sub++ อ่านได้ (BUGS ข้อ 129)
pub fn is_hddvd_sup(p: &Path) -> bool {
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("sup")) { return false; }
    let mut b = [0u8; 2];
    std::fs::File::open(p).and_then(|mut f| f.read_exact(&mut b)).is_ok() && &b == b"SP"
}

/// แปลงซับ HD DVD เป็น PGS ไว้ในโฟลเดอร์ทำงานของโปรแกรม ให้ตัวดูซับรูปใช้ตัวถอดภาพเดิม (ffmpeg) · ไฟล์ต้นฉบับไม่ถูกแตะ
/// ใช้ของที่แปลงไว้แล้วถ้ามี (กุญแจตามที่อยู่ ขนาด และเวลาแก้ไฟล์) · คืนที่อยู่ไฟล์ PGS กับจำนวนภาพที่ BDSup2Sub++ อ่านได้
pub fn hddvd_pgs(tools: &Path, work: &Path, p: &Path) -> Result<(PathBuf, usize), String> {
    let key = crate::subtitle::subs::cache_key(p, 0);
    let out = work.join(format!("hddvd-{key}.sup"));
    let cnt = work.join(format!("hddvd-{key}.n"));
    if out.is_file() {
        if let Some(n) = std::fs::read_to_string(&cnt).ok().and_then(|s| s.trim().parse().ok()) { return Ok((out, n)); }
    }
    let cfg = work.join("bdsup2sub-cfg");
    std::fs::create_dir_all(&cfg).map_err(|e| e.to_string())?;
    // ชื่อชั่วคราวไม่ซ้ำ หน้าซับไตเติลกับตัวดูซับรูปขอพร้อมกันได้โดยไม่เขียนไฟล์เดียวกัน
    let part = work.join(format!("hddvd-{key}-{}.partial.sup", crate::cover::poster_image::unique()));
    let total = std::cell::Cell::new(0usize);
    let args: Vec<OsString> = vec!["--no-export-palette".into(), "--output".into(), part.clone().into(), p.into()];
    let r = run(tools, &cfg, "bdsup", &args, &|_, m| total.set(m), &|| false);
    if let Err(e) = r { let _ = std::fs::remove_file(&part); return Err(e.replace(" ลองเลือกตัวแปลง Subtitle Edit แทน", "")); }
    if !part.is_file() || total.get() == 0 { let _ = std::fs::remove_file(&part); return Err("BDSup2Sub++ อ่านซับ HD DVD นี้ไม่ได้".into()); }
    std::fs::rename(&part, &out).map_err(|e| e.to_string())?;
    let _ = std::fs::write(&cnt, total.get().to_string());
    Ok((out, total.get()))
}

/// ชนิดปลายทางจากนามสกุล sup idx xml
fn out_kind(target: &Path) -> Result<&'static str, String> {
    match target.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
        Some("sup") => Ok("sup"),
        Some("idx") | Some("sub") => Ok("idx"),
        Some("xml") => Ok("xml"),
        _ => Err("ปลายทางต้องเป็น .sup .idx หรือ .xml".into()),
    }
}

fn one_of<'a>(v: &'a str, ok: &[&'a str], what: &str) -> Result<&'a str, String> {
    if ok.contains(&v) { Ok(v) } else { Err(format!("ค่า{what}ไม่ถูกต้อง {v}")) }
}

/// ตัวเลือกของ BDSup2Sub++ ตามที่ตั้ง (ชื่อตามตัวรับคำสั่งในซอร์ส bdsup2sub.cpp addCLIOptions) · ส่ง -o กับต้นทางท้ายสุดเสมอ
pub fn bdsup_args(req: &ImgReq, input: &Path, out: &Path, kind: &str) -> Result<Vec<OsString>, String> {
    let mut a: Vec<OsString> = vec![];
    let mut add = |k: &str, v: String| { a.push(k.into()); a.push(v.into()); };
    const FPS: [&str; 7] = ["23.975", "23.976", "24", "25", "29.97", "50", "59.94"];
    add("--resolution", one_of(&req.resolution, &["keep", "1080", "1440x1080", "720", "576", "480"], "ขนาดภาพ")?.into());
    if req.fps_source != "auto" { add("--fps-source", one_of(&req.fps_source, &FPS, "อัตราเฟรมต้นทาง")?.into()); }
    if req.fps_target != "keep" { add("--fps-target", one_of(&req.fps_target, &FPS, "อัตราเฟรมปลายทาง")?.into()); }
    if req.delay != 0 { add("--delay", req.delay.clamp(-3_600_000, 3_600_000).to_string()); }
    add("--filter", one_of(&req.filter, &["bilinear", "triangle", "bicubic", "bell", "b-spline", "hermite", "lanczos3", "mitchell"], "ตัวย่อขยาย")?.into());
    add("--palette-mode", one_of(&req.palette, &["keep", "create", "dither"], "จานสี")?.into());
    if req.fix_short { add("--minimum-time", req.min_time.clamp(1, 60_000).to_string()); }
    // ย้ายตำแหน่งแบบหน้าต่าง Move all captions ของ BDSup2Sub · ย้ายเข้าในภาพหรือออกนอกภาพต้องบอกสัดส่วนภาพของหนังที่กว้างกว่า 16:9
    match one_of(&req.move_y, &["none", "inside", "outside", "up", "down"], "การย้ายแนวตั้ง")? {
        "inside" | "outside" => {
            let r = if req.ratio.is_finite() { req.ratio } else { 0.0 };
            if r <= 16.0 / 9.0 + 1e-6 || r > 4.0 { return Err("สัดส่วนภาพของหนังต้องกว้างกว่า 16:9 (1.78) เช่น 2.35 หรือ 2.40".into()); }
            add(if req.move_y == "inside" { "--move-in-ratio" } else { "--move-out-ratio" }, format!("{r:.3}"));
            if req.move_y_offset != 0 { add("--move-y-offset", req.move_y_offset.clamp(-2000, 2000).to_string()); }
        }
        v @ ("up" | "down") => { add("--move-y-origin", v.into()); add("--move-y-offset", req.move_y_offset.clamp(0, 2000).to_string()); }
        _ => {}
    }
    if req.move_x != "none" {
        add("--move-x", one_of(&req.move_x, &["left", "right", "center", "origin"], "การย้ายแนวนอน")?.into());
        if req.move_x_offset != 0 { add("--move-x-offset", req.move_x_offset.clamp(-2000, 2000).to_string()); }
    }
    if req.crop_y > 0 { add("--crop-y", req.crop_y.min(500).to_string()); }
    let sx = if req.scale_x.is_finite() { req.scale_x.clamp(0.5, 2.0) } else { 1.0 };
    let sy = if req.scale_y.is_finite() { req.scale_y.clamp(0.5, 2.0) } else { 1.0 };
    if (sx - 1.0).abs() > 1e-6 { add("--scale-x", format!("{sx:.3}")); }
    if (sy - 1.0).abs() > 1e-6 { add("--scale-y", format!("{sy:.3}")); }
    if !req.force_all.is_empty() { add("--force-all", one_of(&req.force_all, &["set", "clear"], "ป้ายบังคับ")?.into()); }
    if kind == "idx" {
        let l = req.language.trim().to_ascii_lowercase();
        if l.len() == 2 && l.chars().all(|c| c.is_ascii_lowercase()) { add("--language", l); }
        // เกณฑ์ลดเหลือ 4 สีของ VobSub · ความทึบต่ำกว่าเกณฑ์เป็นพื้นใส ความสว่างแบ่งเป็นสีเข้ม กลาง สว่าง
        add("--alpha-thr", req.alpha_thr.min(255).to_string());
        if req.lum_low > 0 { add("--med-low-thr", req.lum_low.min(255).to_string()); }
        if req.lum_hi > 0 { add("--med-hi-thr", req.lum_hi.min(255).to_string()); }
    }
    match one_of(&req.forced, &["all", "only", "exclude"], "ซับบังคับ")? { "only" => a.push("--forced-only".into()), "exclude" => a.push("--exclude-forced".into()), _ => {} }
    if req.fix_invisible { a.push("--fix-invisible".into()); }
    // ไม่เขียนไฟล์จานสีแบบ PGCEdit เพิ่มข้างผล
    a.push("--no-export-palette".into());
    a.push("--output".into());
    a.push(out.as_os_str().to_owned());
    a.push(input.as_os_str().to_owned());
    Ok(a)
}

/// ตัวเลือกของ SeConv ทางสำรอง · ทำได้แค่เปลี่ยนชนิดไฟล์ กรองซับบังคับ และเลื่อนเวลาไปข้างหน้า (ย่อขยายภาพไม่ได้ ลองแล้ว 15 พ.ย. 2569 ได้ขนาดเดิม)
pub fn seconv_args(req: &ImgReq, input: &Path, out: &Path, kind: &str) -> Vec<OsString> {
    let fmt = match kind { "idx" => "vobsub", "xml" => "bdnxml", _ => "bluraysup" };
    let dir = out.parent().map(Path::to_path_buf).unwrap_or_default();
    let stem = out.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    // SeConv ตั้งชื่อผลเองตามชนิด · VobSub ส่งชื่อ .sub แล้วมันเขียน .idx คู่กันเอง (ส่งชื่อ .idx มันเขียนไฟล์ .sub ลงชื่อนั้นแล้วล้มตอนเปิดซ้ำ)
    // BDN XML ส่งชื่อไม่มีนามสกุล ได้โฟลเดอร์ชื่อนั้นที่มี index.xml กับภาพ แล้ว seconv_settle จัดให้เหมือนผลของ BDSup2Sub++ (ลองจริง 15 พ.ย. 2569)
    let name = match kind { "idx" => format!("{stem}.sub"), "xml" => stem, _ => out.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default() };
    let mut a: Vec<OsString> = vec![input.as_os_str().to_owned(), fmt.into(), format!("--output-folder:{}", dir.display()).into(), format!("--output-filename:{name}").into(), "--overwrite".into(), "--quiet".into()];
    if req.forced == "only" { a.push("--forced-only".into()); }
    if req.delay > 0 {
        let d = req.delay.min(3_600_000);
        a.push(format!("--offset:{:02}:{:02}:{:02}:{:03}", d / 3_600_000, d / 60_000 % 60, d / 1000 % 60, d % 1000).into());
    }
    a
}

/// ผล BDN XML ของ SeConv อยู่ในโฟลเดอร์ย่อย <ชื่อ>/index.xml · ย้ายทุกไฟล์ขึ้นมาข้าง out แล้วตั้งชื่อ xml ตาม out แบบผลของ BDSup2Sub++
fn seconv_settle(kind: &str, out: &Path) -> Result<(), String> {
    if kind != "xml" { return Ok(()); }
    let dir = out.parent().ok_or("หาโฟลเดอร์ผลไม่เจอ")?;
    let sub = dir.join(out.file_stem().ok_or("ชื่อไฟล์ผลว่าง")?);
    if !sub.join("index.xml").is_file() { return Err("Subtitle Edit จบแล้วแต่ไม่มีไฟล์ผล".into()); }
    for e in std::fs::read_dir(&sub).map_err(|e| e.to_string())?.flatten() {
        let to = if e.file_name() == "index.xml" { out.to_path_buf() } else { dir.join(e.file_name()) };
        std::fs::rename(e.path(), to).map_err(|e| format!("จัดไฟล์ผลของ Subtitle Edit ไม่ได้ {e}"))?;
    }
    let _ = std::fs::remove_dir(&sub);
    Ok(())
}

/// โฟลเดอร์ชั่วคราวที่ลบตัวเองเมื่อจบ
struct TmpDir(PathBuf);
impl Drop for TmpDir {
    fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
}

fn is_mkv(p: &Path) -> bool {
    matches!(p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("mkv" | "mka" | "mks" | "mk3d" | "webm"))
}

/// ไฟล์ซับต้นทางที่ส่งให้ตัวแปลง · ซับในหนังดึงออกมาเป็นไฟล์ชั่วคราวในโฟลเดอร์ tmp ของโปรแกรม (คืนโฟลเดอร์ไว้ลบตอนจบ)
fn input_file(tools: &Path, work: &Path, req: &ImgReq) -> Result<(PathBuf, Option<TmpDir>), String> {
    let src = PathBuf::from(&req.src);
    if !src.exists() { return Err("หาไฟล์ต้นทางไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
    let vob = req.kind == "vobsub";
    if !req.in_movie {
        // VobSub ใช้ไฟล์ .idx คู่กับ .sub เสมอ
        if vob && src.extension().is_some_and(|e| e.eq_ignore_ascii_case("sub")) {
            let idx = src.with_extension("idx");
            if !idx.exists() { return Err("ซับ VobSub ต้องมีไฟล์ .idx คู่กับ .sub ในโฟลเดอร์เดียวกัน".into()); }
            return Ok((idx, None));
        }
        return Ok((src, None));
    }
    let dir = TmpDir(work.join(format!("imgconv-in-{}", crate::cover::poster_image::unique())));
    std::fs::create_dir_all(&dir.0).map_err(|e| e.to_string())?;
    if is_mkv(&src) {
        let out = dir.0.join(if vob { "in.sub" } else { "in.sup" });
        let mut t = OsString::from(format!("{}:", req.tid));
        t.push(out.as_os_str());
        let o = run_tool_timeout(tools, "mkvextract", [src.as_os_str(), "tracks".as_ref(), t.as_os_str()], Duration::from_secs(1200))?;
        if !tool_succeeded("mkvextract", &o.status) { return Err(format!("ดึงซับออกจากหนังไม่ได้ {}", String::from_utf8_lossy(&o.stdout).lines().last().unwrap_or(""))); }
        let f = if vob { dir.0.join("in.idx") } else { out };
        if !f.exists() { return Err("ดึงซับออกจากหนังไม่ได้".into()); }
        return Ok((f, Some(dir)));
    }
    if vob { return Err("ซับ VobSub ในไฟล์ชนิดนี้ดึงออกมาแปลงไม่ได้ ใช้ไฟล์ MKV หรือไฟล์ .idx กับ .sub".into()); }
    let out = dir.0.join("in.sup");
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-i".into(), src.into(), "-map".into(), format!("0:{}", req.ff).into(), "-c".into(), "copy".into(), "-f".into(), "sup".into(), out.clone().into()];
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(1200))?;
    if !tool_succeeded("ffmpeg", &o.status) || !out.exists() { return Err(format!("ดึงซับออกจากหนังไม่ได้ {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or(""))); }
    Ok((out, Some(dir)))
}

/// ปิดกล่อง โปรแกรมหยุดทำงาน ของ Windows ชั่วคราวระหว่างเปิดโปรแกรมลูก (ลูกได้โหมดนี้ติดไปตอนเกิด) แล้วคืนค่าเดิม
fn spawn_quiet(mut cmd: std::process::Command) -> std::io::Result<std::process::Child> {
    use windows_sys::Win32::System::Diagnostics::Debug::{SetErrorMode, SEM_FAILCRITICALERRORS, SEM_NOGPFAULTERRORBOX, SEM_NOOPENFILEERRORBOX};
    let old = unsafe { SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX | SEM_NOOPENFILEERRORBOX) };
    let r = cmd.spawn();
    unsafe { SetErrorMode(old) };
    r
}

/// เวลารอเครื่องมือสูงสุด ซับทั้งเรื่องหลายพันภาพแปลงไม่ถึงนาที เผื่อไดรฟ์ช้า
const LIMIT: Duration = Duration::from_secs(1800);

/// รันตัวแปลงจนจบ อ่านบรรทัดผลทีละบรรทัด บรรทัด Decoding frame n/m บอกความคืบหน้า · คืนบรรทัดผลทั้งหมด
fn run(tools: &Path, cfg: &Path, engine: &str, args: &[OsString], progress: &dyn Fn(usize, usize), cancel: &dyn Fn() -> bool) -> Result<Vec<String>, String> {
    let (dir, name, label) = if engine == "seconv" { (tools.join("seconv"), "seconv", "Subtitle Edit") } else { (tools.join("bdsup2sub"), "bdsup2sub++", "BDSup2Sub++") };
    if !dir.join(format!("{name}.exe")).exists() { return Err(format!("ยังไม่มี {label} ในโฟลเดอร์เครื่องมือ")); }
    let mut cmd = tool_command(&dir, name, args);
    cmd.env("APPDATA", cfg).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = spawn_quiet(cmd).map_err(|e| format!("เปิด {label} ไม่ได้ {e}"))?;
    crate::app::winutil::kill_with_app(&child);
    let out = child.stdout.take().ok_or("อ่านผลของตัวแปลงไม่ได้")?;
    let mut err = child.stderr.take().ok_or("อ่านผลของตัวแปลงไม่ได้")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let reader = std::thread::spawn(move || { for l in BufReader::new(out).lines().map_while(Result::ok) { if tx.send(l).is_err() { break; } } });
    let err_reader = std::thread::spawn(move || { let mut s = String::new(); let _ = err.read_to_string(&mut s); s });
    let started = std::time::Instant::now();
    let mut log: Vec<String> = vec![];
    let status = loop {
        for l in rx.try_iter() {
            if let Some(rest) = l.trim().strip_prefix("Decoding frame ") {
                let nm = rest.split_whitespace().next().unwrap_or("");
                if let Some((n, m)) = nm.split_once('/') { if let (Ok(n), Ok(m)) = (n.parse(), m.parse()) { progress(n, m); } }
            }
            log.push(l);
        }
        if cancel() || started.elapsed() > LIMIT {
            let _ = child.kill(); let _ = child.wait();
            return Err(if cancel() { "stopped".into() } else { format!("{label} ทำงานนานเกินครึ่งชั่วโมง หยุดให้แล้ว") });
        }
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => std::thread::sleep(Duration::from_millis(60)),
            Err(e) => return Err(format!("{label} ทำงานไม่สำเร็จ {e}")),
        }
    };
    let _ = reader.join();
    log.extend(rx.try_iter());
    let errs = err_reader.join().unwrap_or_default();
    if status.success() { return Ok(log); }
    // 0xC0000005 โปรแกรมพังตอนอ่านไฟล์ (เจอกับ VobSub ตัวอย่างของ ffmpeg)
    if status.code() == Some(0xC000_0005u32 as i32) {
        return Err(format!("{label} อ่านซับนี้ไม่ได้และหยุดทำงาน{}", if engine == "seconv" { "" } else { " ลองเลือกตัวแปลง Subtitle Edit แทน" }));
    }
    let why = errs.lines().chain(log.iter().map(String::as_str)).map(str::trim).filter(|l| l.starts_with("ERROR") || l.contains("rror")).last()
        .or_else(|| log.iter().map(String::as_str).map(str::trim).filter(|l| !l.is_empty()).last()).unwrap_or("").to_string();
    Err(format!("{label} แปลงไม่สำเร็จ {why}").trim_end().to_string())
}

/// ขนาดภาพของซับภาพจาก ffprobe · อ่านไม่ได้ได้ None
fn probe(tools: &Path, f: &Path) -> Option<(String, u32, u32)> {
    let o = run_tool_timeout(tools, "ffprobe", ["-v".as_ref(), "error".as_ref(), "-show_entries".as_ref(), "stream=codec_name,width,height".as_ref(), "-of".as_ref(), "csv=p=0".as_ref(), f.as_os_str()], Duration::from_secs(60)).ok()?;
    let s = String::from_utf8_lossy(&o.stdout);
    let l = s.lines().next()?.trim().trim_end_matches(',');
    let mut it = l.split(',');
    let c = it.next()?.to_string();
    let w = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let h = it.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    Some((c, w, h))
}

/// แปลง · แยกจากคำสั่งของหน้าจอ เทสเรียกตรงได้ · progress (ภาพที่ทำแล้ว, ทั้งหมด)
pub fn convert(tools: &Path, work: &Path, req: &ImgReq, progress: &dyn Fn(usize, usize), cancel: &dyn Fn() -> bool) -> Result<ImgOut, String> {
    let target = PathBuf::from(&req.target);
    let kind = out_kind(&target)?;
    let parent = target.parent().filter(|p| p.is_dir()).ok_or("หาโฟลเดอร์ปลายทางไม่เจอ")?.to_path_buf();
    let stem = target.file_stem().map(|s| s.to_string_lossy().to_string()).filter(|s| !s.trim().is_empty()).ok_or("ชื่อไฟล์ปลายทางว่าง")?;
    // ปลายทางที่จะได้ · VobSub สองไฟล์ · BDN XML เป็นโฟลเดอร์ชื่อเดียวกับไฟล์ xml ข้างในมี xml กับภาพ PNG
    let finals: Vec<PathBuf> = match kind {
        "idx" => vec![parent.join(format!("{stem}.idx")), parent.join(format!("{stem}.sub"))],
        "xml" => vec![parent.join(&stem)],
        _ => vec![target.clone()],
    };
    if finals.iter().any(|f| f.exists()) { return Err("exists".into()); }
    let (input, _in_dir) = input_file(tools, work, req)?;
    let cfg = work.join("bdsup2sub-cfg");
    let _ = std::fs::create_dir_all(&cfg);
    // ทำในโฟลเดอร์ชั่วคราวข้างปลายทาง ไดรฟ์เดียวกัน ย้ายชื่อได้ทันที
    let stage = TmpDir(parent.join(format!(".imgconv-{}", crate::cover::poster_image::unique())));
    std::fs::create_dir_all(&stage.0).map_err(|e| format!("เขียนในโฟลเดอร์ปลายทางไม่ได้ {e}"))?;
    let out_dir = if kind == "xml" { stage.0.join(&stem) } else { stage.0.clone() };
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out = out_dir.join(format!("{stem}.{}", if kind == "idx" { "idx" } else { kind }));
    let args = if req.engine == "seconv" { seconv_args(req, &input, &out, kind) } else { bdsup_args(req, &input, &out, kind)? };
    let log = run(tools, &cfg, &req.engine, &args, progress, cancel)?;
    if req.engine == "seconv" { seconv_settle(kind, &out)?; }
    // ตรวจผล
    let made: Vec<PathBuf> = match kind { "idx" => vec![out.with_extension("idx"), out.with_extension("sub")], "xml" => vec![out_dir.clone()], _ => vec![out.clone()] };
    if made.iter().any(|f| !f.exists()) { return Err("ตัวแปลงจบแล้วแต่ไม่มีไฟล์ผล".into()); }
    let (images, w, h) = match kind {
        "sup" => {
            let (c, w, h) = probe(tools, &out).ok_or("ไฟล์ PGS ที่ได้อ่านไม่ได้")?;
            if c != "hdmv_pgs_subtitle" { return Err(format!("ไฟล์ที่ได้ไม่ใช่ PGS ({c})")); }
            (crate::subtitle::pgs::shown_sets(&std::fs::read(&out).map_err(|e| e.to_string())?), w, h)
        }
        "idx" => {
            let (c, w, h) = probe(tools, &out.with_extension("idx")).ok_or("ไฟล์ VobSub ที่ได้อ่านไม่ได้")?;
            if c != "dvd_subtitle" { return Err(format!("ไฟล์ที่ได้ไม่ใช่ VobSub ({c})")); }
            let idx = std::fs::read_to_string(out.with_extension("idx")).unwrap_or_default();
            (idx.lines().filter(|l| l.trim_start().starts_with("timestamp:")).count(), w, h)
        }
        _ => {
            let xml = std::fs::read_dir(&out_dir).ok().into_iter().flatten().flatten().find(|e| e.path().extension().is_some_and(|x| x.eq_ignore_ascii_case("xml"))).map(|e| e.path()).ok_or("ไม่มีไฟล์ xml ในผล")?;
            let s = std::fs::read_to_string(&xml).map_err(|e| e.to_string())?;
            let fmt = |k: &str| s.split(&format!("{k}=\"")).nth(1).and_then(|r| r.split('"').next()).unwrap_or("").to_string();
            let vf = fmt("VideoFormat");
            let h: u32 = vf.trim_end_matches(['p', 'i']).parse().unwrap_or(0);
            (s.matches("<Event").count(), if h > 0 { h * 16 / 9 } else { 0 }, h)
        }
    };
    if images == 0 { return Err("ไฟล์ที่ได้ไม่มีภาพซับเลย".into()); }
    // ย้ายเข้าที่ · VobSub ย้ายไฟล์ .sub ก่อนแล้ว .idx ถ้าตัวที่สองไม่ได้ ย้ายตัวแรกกลับ
    let mut moved: Vec<(PathBuf, PathBuf)> = vec![];
    let pairs: Vec<(PathBuf, PathBuf)> = match kind {
        "idx" => vec![(out.with_extension("sub"), finals[1].clone()), (out.with_extension("idx"), finals[0].clone())],
        _ => vec![(made[0].clone(), finals[0].clone())],
    };
    for (a, b) in pairs {
        if let Err(p) = crate::cover::rename::move_no_replace(&a, &b) {
            for (x, y) in moved.iter().rev() { let _ = crate::cover::rename::move_no_replace(y, x); }
            return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
        }
        moved.push((a, b));
    }
    let bytes = finals.iter().map(|f| if f.is_dir() { std::fs::read_dir(f).ok().into_iter().flatten().flatten().filter_map(|e| e.metadata().ok()).map(|m| m.len()).sum() } else { std::fs::metadata(f).map(|m| m.len()).unwrap_or(0) }).sum();
    let warnings = log.iter().map(|l| l.trim()).filter(|l| l.starts_with("WARNING")).map(|l| l.trim_start_matches("WARNING:").trim().to_string()).collect();
    Ok(ImgOut { files: finals.iter().map(|f| f.display().to_string()).collect(), images, w, h, bytes, warnings })
}

// ---------------------------------------------------------------- ภาพตัวอย่าง

/// ภาพหนึ่งชิ้นของซับหนึ่งภาพ (ซับหนึ่งภาพมีได้สองชิ้นตามสองกรอบของ PGS) · png เป็น data URL
#[derive(Serialize, Debug, Clone)]
pub struct PrevGraphic { pub png: String, pub x: u32, pub y: u32, pub w: u32, pub h: u32 }

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImgPreview {
    /// จำนวนภาพทั้งหมดของผลที่จะได้ กับภาพที่ส่งมา
    pub total: usize,
    pub index: usize,
    /// ขนาดจอของผล
    pub w: u32,
    pub h: u32,
    pub start: i64,
    pub end: i64,
    pub forced: bool,
    pub graphics: Vec<PrevGraphic>,
    pub warnings: Vec<String>,
}

/// เหตุการณ์หนึ่งใน BDN XML · ไฟล์ภาพกับตำแหน่ง
#[derive(Debug, Clone, PartialEq)]
pub struct BdnEvent { pub start: i64, pub end: i64, pub forced: bool, pub graphics: Vec<(String, u32, u32, u32, u32)> }

fn attr(tag: &str, k: &str) -> Option<String> {
    let i = tag.find(&format!("{k}=\""))? + k.len() + 2;
    Some(tag[i..].split('"').next()?.to_string())
}

/// อ่าน BDN XML ที่ BDSup2Sub++ เขียน · ขนาดจอจาก VideoFormat · เวลา HH:MM:SS:FF คิดด้วย FrameRate
pub fn parse_bdn(xml: &str) -> ((u32, u32), Vec<BdnEvent>) {
    let fmt = xml.find("<Format").map(|i| &xml[i..xml[i..].find('>').map_or(xml.len(), |j| i + j)]).unwrap_or("");
    let canvas = match attr(fmt, "VideoFormat").unwrap_or_default().to_ascii_lowercase().as_str() {
        "1080p" | "1080i" => (1920, 1080), "720p" => (1280, 720), "576i" | "576p" => (720, 576), "480i" | "480p" => (720, 480), "1440x1080" => (1440, 1080), _ => (0, 0),
    };
    let fps: f64 = attr(fmt, "FrameRate").and_then(|v| v.parse().ok()).filter(|v: &f64| *v > 1.0).unwrap_or(25.0);
    let tc = |s: &str| -> i64 {
        let p: Vec<f64> = s.split(':').filter_map(|x| x.parse().ok()).collect();
        if p.len() != 4 { return 0; }
        // เฟรมเรตแบบ 23.976 ใช้นาฬิกา 24 เฟรมต่อวินาทีตามที่ BDN นับ แล้วคูณ 1.001 กลับเป็นเวลาจริง
        let nominal = fps.round().max(1.0);
        let frames = ((p[0] * 3600.0 + p[1] * 60.0 + p[2]) * nominal + p[3]) as f64;
        (frames * 1000.0 / fps).round() as i64
    };
    let mut out = vec![];
    for chunk in xml.split("<Event ").skip(1) {
        let head = &chunk[..chunk.find('>').unwrap_or(0)];
        let mut ev = BdnEvent { start: tc(&attr(head, "InTC").unwrap_or_default()), end: tc(&attr(head, "OutTC").unwrap_or_default()), forced: attr(head, "Forced").is_some_and(|v| v.eq_ignore_ascii_case("true")), graphics: vec![] };
        let body = &chunk[..chunk.find("</Event>").unwrap_or(chunk.len())];
        for g in body.split("<Graphic").skip(1) {
            let gh = &g[..g.find('>').unwrap_or(0)];
            let file = g[g.find('>').map_or(0, |i| i + 1)..].split('<').next().unwrap_or("").trim().to_string();
            let n = |k: &str| attr(gh, k).and_then(|v| v.parse().ok()).unwrap_or(0u32);
            if !file.is_empty() { ev.graphics.push((file, n("X"), n("Y"), n("Width"), n("Height"))); }
        }
        out.push(ev);
    }
    (canvas, out)
}

static PREVIEW_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// ภาพตัวอย่างของผลที่จะได้ ภาพที่ index · แปลงทั้งไฟล์ด้วยตัวเลือกเดียวกับตอนแปลงจริงลงโฟลเดอร์ชั่วคราว แล้วให้ BDSup2Sub++ แปลงผลนั้นต่อเป็น BDN XML กับ PNG
/// (palette keep resolution keep ภาพจึงเป็นพิกเซลของผลจริง รวม VobSub ที่เหลือ 4 สี) · เก็บผลไว้ตามตัวเลือก เปลี่ยนแค่ภาพที่ดูไม่ต้องแปลงใหม่

/// ชุดแสดงของไฟล์ PGS ทีละชุด (ตำแหน่งเริ่ม ตำแหน่งจบ มีภาพไหม เริ่มยุคใหม่ไหม เวลาวินาที) · ชุดหนึ่งคือ PCS ไปจนถึง END
fn sup_sets(data: &[u8]) -> Vec<(usize, usize, bool, bool, f64)> {
    let mut out = vec![];
    let mut cur: Option<(usize, bool, bool, f64)> = None;
    let mut i = 0usize;
    while i + 13 <= data.len() && &data[i..i + 2] == b"PG" {
        let kind = data[i + 10];
        let size = ((data[i + 11] as usize) << 8) | data[i + 12] as usize;
        let p = data.get(i + 13..i + 13 + size).unwrap_or(&[]);
        if kind == 0x16 {
            let pts = u32::from_be_bytes([data[i + 2], data[i + 3], data[i + 4], data[i + 5]]) as f64 / 90000.0;
            // สถานะ 0x80 เริ่มยุคใหม่ 0x40 จุดเริ่มอ่าน ทั้งสองแบบมีวัตถุครบในตัว ไม่พึ่งชุดก่อนหน้า
            let state = p.get(7).copied().unwrap_or(0);
            cur = Some((i, p.get(10).copied().unwrap_or(0) > 0, state & 0xC0 != 0, pts));
        }
        i += 13 + size;
        if kind == 0x80 { if let Some((s, has, ep, pts)) = cur.take() { out.push((s, i, has, ep, pts)); } }
    }
    out
}

/// ตัดไฟล์ PGS ให้เหลือภาพที่ขึ้นเวลา start จนถึงชุดที่ปิดภาพนั้นตอน end เริ่มจากต้นยุคของภาพ เพราะวัตถุอาจนิยามไว้ในชุดก่อนหน้า
/// เลือกจากเวลา ไม่ใช่ลำดับชุด เพราะไฟล์จริงส่งภาพเดิมซ้ำได้หลายชุด (เปลี่ยนจานสี จุดเริ่มอ่าน) ตัวแปลงนับเป็นภาพเดียว
fn sup_cut(data: &[u8], start: f64, end: Option<f64>) -> Option<Vec<u8>> {
    let sets = sup_sets(data);
    let near = |a: f64, b: f64| (a - b).abs() < 0.0015;
    let j = sets.iter().position(|s| s.2 && near(s.4, start))?;
    let e = (0..=j).rev().find(|&k| sets[k].3).unwrap_or(0);
    let k = end.and_then(|te| (j + 1..sets.len()).find(|&k| near(sets[k].4, te))).unwrap_or((j + 1).min(sets.len() - 1));
    Some(data[sets[e].0..sets[k].1].to_vec())
}

/// เวลาขึ้นกับเวลาหายของทุกภาพในไฟล์ PGS จากตัวอ่านของตัวดูซับ (subs::parse_sup นับภาพเดิมที่ส่งซ้ำเป็นภาพเดียว ได้เท่ากับ BDSup2Sub++)
/// ตัวอ่านถอดภาพทุกภาพ ไฟล์ 439 ภาพราว 2 วินาที จึงจำผลไว้ข้างไฟล์ที่ดึงมา ไฟล์เปลี่ยนแล้วอ่านใหม่
fn sup_shows(work: &Path, src: &Path, data: &[u8]) -> Vec<(f64, Option<f64>)> {
    let meta = std::fs::metadata(src).ok();
    let stamp = format!("{}|{:?}|{:?}", src.display(), meta.as_ref().map(|m| m.len()), meta.and_then(|m| m.modified().ok()));
    let mut h: u64 = 0xcbf29ce484222325;
    for b in stamp.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    let keep = work.join(format!("imgconv-shows-{h:016x}.txt"));
    if let Ok(s) = std::fs::read_to_string(&keep) {
        return s.lines().filter_map(|l| { let mut it = l.split(' '); Some((it.next()?.parse().ok()?, it.next().and_then(|e| e.parse().ok()))) }).collect();
    }
    let shows: Vec<(f64, Option<f64>)> = crate::subtitle::subs::parse_sup(data).into_iter().map(|s| (s.start, s.end)).collect();
    let text: Vec<String> = shows.iter().map(|(a, b)| format!("{a} {}", b.map(|b| b.to_string()).unwrap_or_default())).collect();
    let _ = std::fs::write(&keep, text.join("\n"));
    shows
}

/// แทร็ก PGS ในหนังดึงออกมาครั้งเดียวแล้วเก็บไว้ ภาพตัวอย่างครั้งต่อไปไม่ต้องอ่านหนังทั้งไฟล์อีก · ไฟล์หนังเปลี่ยน (ขนาดหรือเวลาแก้ไข) ดึงใหม่
fn sup_source(tools: &Path, work: &Path, req: &ImgReq) -> Result<PathBuf, String> {
    let src = PathBuf::from(&req.src);
    if !req.in_movie { return Ok(src); }
    let meta = std::fs::metadata(&src).map_err(|_| "หาไฟล์ต้นทางไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?;
    let stamp = format!("{}|{}|{}|{}|{:?}", req.src, req.tid, req.ff, meta.len(), meta.modified().ok());
    let mut h: u64 = 0xcbf29ce484222325;
    for b in stamp.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
    let keep = work.join(format!("imgconv-src-{h:016x}.sup"));
    if keep.exists() { return Ok(keep); }
    let (input, _tmp) = input_file(tools, work, req)?;
    std::fs::copy(&input, &keep).map_err(|e| e.to_string())?;
    // เก็บไว้ 3 แทร็กล่าสุด
    let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-src-") && e.path() != keep)
        .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
    v.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in v.into_iter().skip(2) { let _ = std::fs::remove_file(p); }
    Ok(keep)
}

/// ภาพตัวอย่างของซับ PGS แปลงเฉพาะภาพที่ดูอยู่ (BUGS ข้อ 142 พี่กันทัก 16 พ.ย. 2569 "ช้ามากตรงนี้ มันควรแปลเเค่ภาพที่ดูอยู่ไหม")
/// เดิมแปลงทั้งไฟล์แล้วแปลงกลับเป็น BDN อีกรอบ ไฟล์ 439 ภาพรอนาน · ซับ VobSub และการเปลี่ยนอัตราเฟรมที่ให้เดาอัตราเฟรมต้นทางเอง ยังแปลงทั้งไฟล์
fn preview_one(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<Option<ImgPreview>, String> {
    if req.kind == "vobsub" || (req.fps_source == "auto" && req.fps_target != "keep") { return Ok(None); }
    let src = sup_source(tools, work, req)?;
    if !src.extension().is_some_and(|e| e.eq_ignore_ascii_case("sup")) { return Ok(None); }
    let data = std::fs::read(&src).map_err(|e| e.to_string())?;
    let shows = sup_shows(work, &src, &data);
    let total = shows.len();
    if total == 0 { return Ok(None); }
    let i = index.min(total - 1);
    let (t, te) = shows[i];
    let Some(one) = sup_cut(&data, t, te) else { return Ok(None) };
    // เวลาที่ภาพนี้ควรขึ้นในผล ใช้เลือกภาพจากผลของไฟล์เล็ก (ไฟล์เล็กอาจมีภาพก่อนหน้าในยุคเดียวกันหรือภาพที่ขึ้นต่อทันที)
    let factor = match (req.fps_source.parse::<f64>(), req.fps_target.parse::<f64>()) { (Ok(a), Ok(b)) if b > 0.0 => a / b, _ => 1.0 };
    let want = (t * 1000.0 * factor) as i64 + req.delay;
    let target = PathBuf::from(&req.target);
    let kind = out_kind(&target)?;
    let key = {
        let mut r = req.clone();
        r.target = format!("x.{kind}");
        // v2 เลือกภาพจากเวลา ผลของรุ่นแรกที่นับชุดแสดงผิดใช้ไม่ได้
        let s = format!("v2|{r:?}|{}|{i}", src.display());
        let mut h: u64 = 0xcbf29ce484222325;
        for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
        format!("{h:016x}")
    };
    let dir = work.join(format!("imgconv-one-{key}"));
    let xml = dir.join("bdn").join("prev.xml");
    let log_file = dir.join("warnings.txt");
    if !dir.join(".ok").exists() {
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("bdn")).map_err(|e| e.to_string())?;
        let input = dir.join("one.sup");
        std::fs::write(&input, &one).map_err(|e| e.to_string())?;
        let cfg = work.join("bdsup2sub-cfg");
        let _ = std::fs::create_dir_all(&cfg);
        let out = dir.join(format!("t.{kind}"));
        let args = if req.engine == "seconv" { seconv_args(req, &input, &out, kind) } else { bdsup_args(req, &input, &out, kind)? };
        let log = run(tools, &cfg, &req.engine, &args, &|_, _| {}, cancel)?;
        if req.engine == "seconv" { seconv_settle(kind, &out)?; }
        let warns: Vec<String> = log.iter().map(|l| l.trim()).filter(|l| l.starts_with("WARNING")).map(|l| l.trim_start_matches("WARNING:").trim().to_string()).collect();
        let _ = std::fs::write(&log_file, warns.join("\n"));
        let back: Vec<OsString> = vec!["--resolution".into(), "keep".into(), "--palette-mode".into(), "keep".into(), "--no-export-palette".into(), "--output".into(), xml.clone().into(), out.into()];
        run(tools, &cfg, "bdsup", &back, &|_, _| {}, cancel)?;
        std::fs::write(dir.join(".ok"), b"").map_err(|e| e.to_string())?;
        // เก็บภาพตัวอย่างทีละภาพไว้ 60 ภาพล่าสุด กดย้อนกลับไปภาพเดิมได้ทันที
        let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-one-") && e.path() != dir)
            .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
        v.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in v.into_iter().skip(59) { let _ = std::fs::remove_dir_all(p); }
    }
    let s = std::fs::read_to_string(&xml).map_err(|_| "ทำภาพตัวอย่างไม่ได้")?;
    let ((w, h), evs) = parse_bdn(&s);
    let Some(ev) = evs.iter().min_by_key(|e| (e.start - want).abs()) else { return Ok(Some(ImgPreview { w, h, total, index: i, ..Default::default() })) };
    let mut graphics = vec![];
    for (f, x, y, gw, gh) in &ev.graphics {
        let b = std::fs::read(dir.join("bdn").join(f)).map_err(|e| format!("อ่านภาพตัวอย่างไม่ได้ {e}"))?;
        graphics.push(PrevGraphic { png: format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b)), x: *x, y: *y, w: *gw, h: *gh });
    }
    let warnings = std::fs::read_to_string(&log_file).unwrap_or_default().lines().filter(|l| !l.is_empty()).map(str::to_string).collect();
    Ok(Some(ImgPreview { total, index: i, w, h, start: ev.start, end: ev.end, forced: ev.forced, graphics, warnings }))
}

pub fn preview(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<ImgPreview, String> {
    // แปลงทีละภาพไม่สำเร็จ ลองแบบทั้งไฟล์ต่อ ยกเว้นคนกดเปลี่ยนภาพหรือปิดหน้าต่างไปแล้ว
    match preview_one(tools, work, req, index, cancel) {
        Ok(Some(r)) => return Ok(r),
        Err(e) if cancel() => return Err(e),
        _ => {}
    }
    preview_full(tools, work, req, index, cancel)
}

/// ภาพตัวอย่างแบบแปลงทั้งไฟล์แล้วแปลงกลับเป็น BDN (ทางเดิม) เก็บผลไว้ เปลี่ยนภาพที่ดูไม่ต้องแปลงใหม่
fn preview_full(tools: &Path, work: &Path, req: &ImgReq, index: usize, cancel: &dyn Fn() -> bool) -> Result<ImgPreview, String> {
    let target = PathBuf::from(&req.target);
    let kind = out_kind(&target)?;
    let key = {
        let mut r = req.clone();
        r.target = format!("x.{kind}");
        let s = format!("{r:?}");
        let mut h: u64 = 0xcbf29ce484222325;
        for b in s.bytes() { h ^= b as u64; h = h.wrapping_mul(0x100000001b3); }
        format!("{h:016x}")
    };
    let dir = work.join(format!("imgconv-prev-{key}"));
    let xml = dir.join("bdn").join("prev.xml");
    let log_file = dir.join("warnings.txt");
    if !dir.join(".ok").exists() {
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("bdn")).map_err(|e| e.to_string())?;
        let (input, _in_dir) = input_file(tools, work, req)?;
        let cfg = work.join("bdsup2sub-cfg");
        let _ = std::fs::create_dir_all(&cfg);
        let out = dir.join(format!("t.{kind}"));
        let args = if req.engine == "seconv" { seconv_args(req, &input, &out, kind) } else { bdsup_args(req, &input, &out, kind)? };
        let log = run(tools, &cfg, &req.engine, &args, &|_, _| {}, cancel)?;
        if req.engine == "seconv" { seconv_settle(kind, &out)?; }
        let warns: Vec<String> = log.iter().map(|l| l.trim()).filter(|l| l.starts_with("WARNING")).map(|l| l.trim_start_matches("WARNING:").trim().to_string()).collect();
        let _ = std::fs::write(&log_file, warns.join("\n"));
        let back: Vec<OsString> = vec!["--resolution".into(), "keep".into(), "--palette-mode".into(), "keep".into(), "--no-export-palette".into(), "--output".into(), xml.clone().into(), out.into()];
        run(tools, &cfg, "bdsup", &back, &|_, _| {}, cancel)?;
        std::fs::write(dir.join(".ok"), b"").map_err(|e| e.to_string())?;
        // เก็บผลภาพตัวอย่างไว้ 3 ชุดล่าสุด
        let mut v: Vec<(std::time::SystemTime, PathBuf)> = std::fs::read_dir(work).into_iter().flatten().flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("imgconv-prev-") && e.path() != dir)
            .map(|e| (e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH), e.path())).collect();
        v.sort_by(|a, b| b.0.cmp(&a.0));
        for (_, p) in v.into_iter().skip(2) { let _ = std::fs::remove_dir_all(p); }
    }
    let s = std::fs::read_to_string(&xml).map_err(|_| "ทำภาพตัวอย่างไม่ได้")?;
    let ((w, h), evs) = parse_bdn(&s);
    if evs.is_empty() { return Ok(ImgPreview { w, h, ..Default::default() }); }
    let i = index.min(evs.len() - 1);
    let ev = &evs[i];
    let mut graphics = vec![];
    for (f, x, y, gw, gh) in &ev.graphics {
        let b = std::fs::read(dir.join("bdn").join(f)).map_err(|e| format!("อ่านภาพตัวอย่างไม่ได้ {e}"))?;
        graphics.push(PrevGraphic { png: format!("data:image/png;base64,{}", crate::audio::audiograph::b64(&b)), x: *x, y: *y, w: *gw, h: *gh });
    }
    let warnings = std::fs::read_to_string(&log_file).unwrap_or_default().lines().filter(|l| !l.is_empty()).map(str::to_string).collect();
    Ok(ImgPreview { total: evs.len(), index: i, w, h, start: ev.start, end: ev.end, forced: ev.forced, graphics, warnings })
}

#[tauri::command]
pub async fn imgsub_preview(app: AppHandle, req: ImgReq, index: usize) -> Result<ImgPreview, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    let my = PREVIEW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || preview(&tools, &work, &req, index, &|| PREVIEW_GEN.load(Ordering::SeqCst) != my)).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Clone)]
struct Progress { done: usize, total: usize }

#[tauri::command]
pub async fn imgsub_convert(app: AppHandle, req: ImgReq) -> Result<ImgOut, String> {
    STOP.store(false, Ordering::SeqCst);
    let tools = tools_dir(&app)?;
    let work = crate::subtitle::subshot::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let r = convert(&tools, &work, &req, &|done, total| { let _ = app.emit("imgsub-progress", Progress { done, total }); }, &|| STOP.load(Ordering::SeqCst))?;
        crate::app::actlog::note("แปลงซับภาพ", &format!("{} ({} ภาพ)", r.files.join(" "), r.images));
        Ok(r)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn imgsub_cancel() { STOP.store(true, Ordering::SeqCst); }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImgTools { pub bdsup_ok: bool, pub seconv_ok: bool }

/// ตัวแปลงที่ใช้ได้ในเครื่องนี้
#[tauri::command]
pub fn imgsub_tools(app: AppHandle) -> Result<ImgTools, String> {
    let tools = tools_dir(&app)?;
    Ok(ImgTools { bdsup_ok: bdsup_exe(&tools).exists(), seconv_ok: crate::subtitle::pgs::seconv_exe(&tools).exists() })
}

#[cfg(test)]
#[path = "imgconv_tests.rs"]
mod tests;
