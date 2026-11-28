//! เสียงสำหรับเล่นในหน้ากราฟเสียง (BUGS ข้อ 163.4 ถอดด้วย ffmpeg · ข้อ 164.3 เลือกตัวถอดของ codec เองได้ ROADMAP ข้อ 35.6)
//! พี่กันเคาะ 10 พ.ย. 2569 "เราต้องกาทรทั้งคู่ เเละเอาไว้ที่ตั้งค่า ว่าอยากช้ตัวไหนถอด" แล้วสั่ง 28 พ.ย. 2569 "35.6 ทำด้วย"
//! ทุกตัวถอดได้ผลเป็นไบต์ s16le ch ช่องสลับกัน 48 kHz แบบเดียวกัน หน้าจอต่อก้อนเล่นเหมือนเดิม
//! ① ffmpeg ถอดได้ทุกชนิด (ค่าตั้งต้น)
//! ② flac.exe กับ wvunpack.exe ข้ามไปกลางไฟล์ได้ (--skip --until) ถอดทีละก้อน ส่งเป็น WAV ทางท่อให้ ffmpeg แปลงอัตราสุ่มกับช่อง
//! ③ Monkey's Audio เรียก MACDll64.dll ตรง ข้ามไปกลางไฟล์ได้ (c_APEDecompress_Seek) ส่งเสียงดิบทางท่อให้ ffmpeg แปลง
//! ④ lame.exe กับ Takc.exe ข้ามไปกลางไฟล์ไม่ได้ ถอดทั้งไฟล์เป็น WAV ชั่วคราวครั้งเดียว (tmp/play-*.wav กวาดทิ้งตอนเปิดโปรแกรม) แล้วตัดทีละก้อนจากไฟล์นั้น
//! ตัวถอดของ codec ใช้ได้เฉพาะไฟล์ชนิดนั้นตรง ๆ (.flac .wv .ape .tak .mp3 แทร็กแรก) · ถอดไม่ได้คืนข้อความขึ้นต้น DECODER: หน้าจอลอง ffmpeg แล้วบอกผู้ใช้
//! ไม่แตะไฟล์ของผู้ใช้

use std::ffi::{OsStr, OsString};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::app::tools::{tool_command, tool_succeeded, tools_dir};
use crate::subtitle::subaudio::{need, pcm_ch, PCM_RATE};

/// ตัวถอดที่รู้จัก กับนามสกุลไฟล์ที่ใช้ได้
pub const DECODERS: &[(&str, &[&str])] = &[("flac", &["flac"]), ("wvunpack", &["wv"]), ("mac", &["ape"]), ("takc", &["tak"]), ("lame", &["mp3"])];

/// ตัวถอดนี้ใช้กับไฟล์นี้ได้ไหม · ffmpeg ใช้ได้ทุกไฟล์
pub fn fits(dec: &str, path: &Path, track: usize) -> bool {
    if dec == "ffmpeg" { return true; }
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    track == 0 && DECODERS.iter().any(|(d, exts)| *d == dec && exts.contains(&ext.as_str()))
}

/// เวลาแบบ ชั่วโมง:นาที:วินาที ที่ flac และ wvunpack อ่านได้
pub fn hms(t: f64) -> String {
    let t = t.max(0.0);
    let h = (t / 3600.0).floor();
    let m = ((t - h * 3600.0) / 60.0).floor();
    let s = t - h * 3600.0 - m * 60.0;
    if h > 0.0 { format!("{}:{:02}:{:06.3}", h as u64, m as u64, s) } else { format!("{}:{:06.3}", m as u64, s) }
}

/// ตัวเลือกของตัวถอดที่ข้ามไปกลางไฟล์ได้ · ได้ WAV ทาง stdout
pub fn stream_args(dec: &str, path: &Path, t0: f64, dur: f64) -> Vec<OsString> {
    let (skip, until) = (format!("--skip={}", hms(t0)), format!("--until=+{}", hms(dur)));
    let mut a: Vec<OsString> = match dec {
        "flac" => vec!["-d".into(), "-c".into(), "-s".into(), skip.into(), until.into()],
        _ => vec!["-q".into(), "-y".into(), skip.into(), until.into()],
    };
    a.push(path.as_os_str().to_owned());
    if dec == "wvunpack" { a.push("-".into()); }
    a
}

/// ส่งเสียงเข้า ffmpeg ทางท่อ แปลงเป็น s16le ch ช่อง 48 kHz · input คือตัวเลือกอธิบายเสียงที่ป้อน (ว่าง = ffmpeg อ่านหัว WAV เอง)
fn to_pcm(tools: &Path, input: &[&str], feed: impl FnOnce(&mut std::process::ChildStdin) -> Result<(), String> + Send + 'static, ch: u32) -> Result<Vec<u8>, String> {
    let mut a: Vec<OsString> = ["-v", "error", "-nostdin"].iter().map(OsString::from).collect();
    a.extend(input.iter().map(OsString::from));
    a.extend(["-i", "pipe:0", "-ac", &ch.to_string(), "-ar", &PCM_RATE.to_string(), "-f", "s16le", "-"].iter().map(OsString::from));
    let mut ff = tool_command(tools, "ffmpeg", &a).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("DECODER: เปิด ffmpeg ไม่ได้ {e}"))?;
    let mut sin = ff.stdin.take().ok_or("DECODER: ต่อท่อไม่ได้")?;
    let w = std::thread::spawn(move || { let r = feed(&mut sin); drop(sin); r });
    let mut out = Vec::new();
    ff.stdout.take().ok_or("DECODER: ต่อท่อไม่ได้")?.read_to_end(&mut out).map_err(|e| format!("DECODER: {e}"))?;
    let o = ff.wait_with_output().map_err(|e| format!("DECODER: {e}"))?;
    let fed = w.join().unwrap_or_else(|_| Err("DECODER: ตัวถอดหยุดกลางทาง".into()));
    fed?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(format!("DECODER: แปลงเสียงจากตัวถอดไม่ได้  {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
    }
    Ok(out)
}

/// flac หรือ wvunpack ถอดช่วงหนึ่งเป็น WAV ทาง stdout แล้วส่งต่อให้ ffmpeg
fn stream(tools: &Path, dec: &str, path: &Path, t0: f64, dur: f64, ch: u32) -> Result<Vec<u8>, String> {
    let mut d = tool_command(tools, dec, stream_args(dec, path, t0, dur)).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()
        .map_err(|e| format!("DECODER: เปิด {dec} ไม่ได้ {e}"))?;
    let mut dout = d.stdout.take().ok_or("DECODER: ต่อท่อไม่ได้")?;
    let name = dec.to_string();
    let out = to_pcm(tools, &[], move |sin| {
        std::io::copy(&mut dout, sin).map(|_| ()).or_else(|e| if e.kind() == std::io::ErrorKind::BrokenPipe { Ok(()) } else { Err(format!("DECODER: {e}")) })
    }, ch);
    let o = d.wait_with_output().map_err(|e| format!("DECODER: {e}"))?;
    // ช่วงเลยท้ายไฟล์ flac กับ wvunpack ตอบผิดพลาด แต่ได้เสียงว่างตามจริง ถือว่าได้ก้อนสั้น
    if !o.status.success() && out.as_ref().map(|b| b.is_empty()).unwrap_or(true) {
        let why = String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        if why.to_lowercase().contains("beyond") || why.to_lowercase().contains("past end") { return Ok(Vec::new()); }
        return Err(format!("DECODER: {name} ถอดไม่ได้  {why}"));
    }
    out
}

// ---------------------------------------------------------------- Monkey's Audio ผ่าน MACDll64.dll

type Handle = *mut std::ffi::c_void;
type FnCreateW = unsafe extern "system" fn(*const u16, *mut i32) -> Handle;
type FnDestroy = unsafe extern "system" fn(Handle);
type FnGetData = unsafe extern "system" fn(Handle, *mut u8, i64, *mut i64) -> i32;
type FnSeek = unsafe extern "system" fn(Handle, i64) -> i32;
type FnGetInfo = unsafe extern "system" fn(Handle, i32, i64, i64) -> i64;
// เลขช่องข้อมูลจาก Shared/MACLib.h ของชุด SDK 13.50 (APE_INFO_FIELDS)
const APE_INFO_SAMPLE_RATE: i32 = 1003;
const APE_INFO_BITS_PER_SAMPLE: i32 = 1004;
const APE_INFO_CHANNELS: i32 = 1006;
const APE_INFO_BLOCK_ALIGN: i32 = 1007;
const APE_INFO_TOTAL_BLOCKS: i32 = 1016;

/// ถอดช่วงหนึ่งของไฟล์ .ape ด้วย DLL · ได้เสียงดิบตามความลึกบิตของไฟล์ แล้วให้ ffmpeg แปลง
fn ape(tools: &Path, path: &Path, t0: f64, dur: f64, ch: u32) -> Result<Vec<u8>, String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::FreeLibrary;
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH};
    let wide = |p: &OsStr| p.encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let dll = tools.join("MACDll64.dll");
    if !dll.exists() { return Err("DECODER: ไม่มี MACDll64.dll ในโฟลเดอร์เครื่องมือ".into()); }
    let lib = unsafe { LoadLibraryExW(wide(dll.as_os_str()).as_ptr(), std::ptr::null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH) };
    if lib.is_null() { return Err("DECODER: เปิด MACDll64.dll ไม่ได้".into()); }
    struct Lib(windows_sys::Win32::Foundation::HMODULE);
    impl Drop for Lib { fn drop(&mut self) { unsafe { FreeLibrary(self.0) }; } }
    let _lib = Lib(lib);
    let sym = |n: &[u8]| unsafe { GetProcAddress(lib, n.as_ptr()) }.ok_or_else(|| format!("DECODER: MACDll64.dll ไม่มีคำสั่ง {}", String::from_utf8_lossy(&n[..n.len() - 1])));
    let (create, destroy, get, seek, info) = unsafe {
        (std::mem::transmute::<_, FnCreateW>(sym(b"c_APEDecompress_CreateW\0")?), std::mem::transmute::<_, FnDestroy>(sym(b"c_APEDecompress_Destroy\0")?),
         std::mem::transmute::<_, FnGetData>(sym(b"c_APEDecompress_GetData\0")?), std::mem::transmute::<_, FnSeek>(sym(b"c_APEDecompress_Seek\0")?),
         std::mem::transmute::<_, FnGetInfo>(sym(b"c_APEDecompress_GetInfo\0")?))
    };
    let mut err = 0i32;
    let h = unsafe { create(wide(path.as_os_str()).as_ptr(), &mut err) };
    if h.is_null() { return Err(format!("DECODER: Monkey's Audio เปิดไฟล์ไม่ได้ รหัส {err}")); }
    struct Dec(Handle, FnDestroy);
    impl Drop for Dec { fn drop(&mut self) { unsafe { (self.1)(self.0) }; } }
    let _dec = Dec(h, destroy);
    let (rate, bits, chans, align, total) = unsafe { (info(h, APE_INFO_SAMPLE_RATE, 0, 0), info(h, APE_INFO_BITS_PER_SAMPLE, 0, 0), info(h, APE_INFO_CHANNELS, 0, 0), info(h, APE_INFO_BLOCK_ALIGN, 0, 0), info(h, APE_INFO_TOTAL_BLOCKS, 0, 0)) };
    if rate <= 0 || align <= 0 || chans <= 0 { return Err("DECODER: Monkey's Audio อ่านข้อมูลเสียงของไฟล์ไม่ได้".into()); }
    let from = ((t0 * rate as f64).round() as i64).clamp(0, total.max(0));
    let want = ((dur * rate as f64).round() as i64).min(total - from).max(0);
    if want == 0 { return Ok(Vec::new()); }
    if unsafe { seek(h, from) } != 0 { return Err("DECODER: Monkey's Audio ข้ามไปกลางไฟล์ไม่ได้".into()); }
    let mut raw = vec![0u8; (want * align) as usize];
    let mut got_all = 0i64;
    while got_all < want {
        let mut got = 0i64;
        let r = unsafe { get(h, raw.as_mut_ptr().add((got_all * align) as usize), want - got_all, &mut got) };
        if r != 0 { return Err(format!("DECODER: Monkey's Audio ถอดไม่ได้ รหัส {r}")); }
        if got <= 0 { break; }
        got_all += got;
    }
    raw.truncate((got_all * align) as usize);
    let fmt = match bits { 8 => "u8", 16 => "s16le", 24 => "s24le", _ => "s32le" };
    let (r, c) = (rate.to_string(), chans.to_string());
    to_pcm(tools, &["-f", fmt, "-ar", &r, "-ac", &c], move |sin| sin.write_all(&raw).or_else(|e| if e.kind() == std::io::ErrorKind::BrokenPipe { Ok(()) } else { Err(format!("DECODER: {e}")) }), ch)
}

// ---------------------------------------------------------------- lame กับ Takc ถอดทั้งไฟล์ครั้งเดียว

/// ชื่อไฟล์ WAV ชั่วคราวของไฟล์นี้กับตัวถอดนี้ · ไฟล์ต้นทางเปลี่ยน (ขนาดหรือเวลาแก้) ได้ชื่อใหม่
fn temp_of(work: &Path, dec: &str, path: &Path) -> PathBuf {
    use std::hash::{Hash, Hasher};
    let md = std::fs::metadata(path).ok();
    let mut h = std::collections::hash_map::DefaultHasher::new();
    (path.display().to_string(), md.as_ref().map(|m| m.len()), md.and_then(|m| m.modified().ok()), dec).hash(&mut h);
    work.join(format!("play-{:016x}.wav", h.finish()))
}

fn whole(tools: &Path, user: &Path, work: &Path, dec: &str, path: &Path) -> Result<PathBuf, String> {
    let out = temp_of(work, dec, path);
    if out.exists() { return Ok(out); }
    std::fs::create_dir_all(work).map_err(|e| format!("DECODER: {e}"))?;
    let part = out.with_extension("partial.wav");
    let _ = std::fs::remove_file(&part);
    let (dir, name, args): (PathBuf, &str, Vec<OsString>) = if dec == "lame" {
        (tools.to_path_buf(), "lame", vec!["--decode".into(), "--quiet".into(), path.as_os_str().to_owned(), part.as_os_str().to_owned()])
    } else {
        let tak = crate::audio::encode::tak_dir(user);
        crate::audio::encode::ensure_tak(tools, &tak).map_err(|e| format!("DECODER: แตก Takc.exe ไม่ได้ {e}"))?;
        (tak, "Takc", vec!["-d".into(), "-silent".into(), "-overwrite".into(), path.as_os_str().to_owned(), part.as_os_str().to_owned()])
    };
    let o = crate::app::tools::run_tool_timeout(&dir, name, &args, Duration::from_secs(1800))?;
    if !o.status.success() || !part.exists() {
        let _ = std::fs::remove_file(&part);
        let why = String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        return Err(format!("DECODER: {name} ถอดไม่ได้  {why}"));
    }
    std::fs::rename(&part, &out).map_err(|e| format!("DECODER: {e}"))?;
    Ok(out)
}

/// เสียงช่วงหนึ่งด้วยตัวถอดที่เลือก · ตัวถอดใช้กับไฟล์นี้ไม่ได้ใช้ ffmpeg
pub fn pcm_with(tools: &Path, user: &Path, work: &Path, path: &Path, track: usize, t0: f64, dur: f64, ch: u32, dec: &str) -> Result<Vec<u8>, String> {
    let ch = ch.clamp(1, 8);
    if !fits(dec, path, track) { return pcm_ch(tools, path, &format!("0:a:{track}"), t0, dur, None, ch); }
    match dec {
        "flac" | "wvunpack" => stream(tools, dec, path, t0, dur, ch),
        "mac" => ape(tools, path, t0, dur, ch),
        "lame" | "takc" => { let w = whole(tools, user, work, dec, path)?; pcm_ch(tools, &w, "0:a:0", t0, dur, None, ch) }
        _ => pcm_ch(tools, path, &format!("0:a:{track}"), t0, dur, None, ch),
    }
}

/// เสียงช่วง t0 ถึง t0 + dur วินาทีของแทร็กเสียงลำดับ track สำหรับเล่นในหน้ากราฟ · decoder ไม่ส่งหรือ ffmpeg ใช้ ffmpeg (BUGS ข้อ 163.4)
/// ได้ไบต์ s16le ch ช่องสลับกัน 48 kHz ตรง ๆ ไม่ผ่านข้อความ · หน้าจอขอทีละก้อนไม่กี่วินาที เล่นได้ก่อนถอดจบทั้งไฟล์
#[tauri::command]
pub async fn graph_pcm(app: AppHandle, path: String, track: usize, t0: f64, dur: f64, ch: u32, decoder: Option<String>) -> Result<tauri::ipc::Response, String> {
    let tools = tools_dir(&app)?;
    if track > 99 { return Err("แทร็กเสียงไม่ถูกต้อง".into()); }
    let user = crate::audio::encode::user_dir(&app)?;
    let work = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    let dec = decoder.unwrap_or_else(|| "ffmpeg".into());
    if dec != "ffmpeg" && !DECODERS.iter().any(|(d, _)| *d == dec) { return Err("ตัวถอดเสียงไม่ถูกต้อง".into()); }
    let b = tauri::async_runtime::spawn_blocking(move || {
        let p = need(&path)?;
        pcm_with(&tools, &user, &work, &p, track, t0.max(0.0), dur.clamp(0.01, 30.0), ch, &dec)
    }).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(b))
}

#[cfg(test)]
#[path = "play_tests.rs"]
mod tests;
