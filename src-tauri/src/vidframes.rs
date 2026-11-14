//! ภาพหนังทีละเฟรมของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109)
//! ① ตารางเวลาของทุกเฟรมกับป้าย keyframe อ่านครั้งเดียวต่อไฟล์จากแพ็กเก็ตของ ffprobe (ไม่ต้องถอดภาพ) เก็บไว้ในเครื่อง ไฟล์หนังเปลี่ยนแล้วอ่านใหม่
//!    เวลาเฟรมคิดแบบ Aegisub (video_provider_ffmpegsource.cpp ตัดเศษเป็นมิลลิวินาที · vfr.cpp ลบเวลาเฟรมแรกให้เฟรม 0 อยู่ที่ 0)
//! ② ภาพตรงเฟรม · หน้าจอส่งเวลาเฟรมลบครึ่งมิลลิวินาที ffmpeg ทิ้งเฟรมที่เวลาก่อนจุดนั้น เฟรมแรกที่ได้คือเฟรมที่ขอพอดี ขอทีละหลายเฟรมต่อกันได้ในการเปิดไฟล์ครั้งเดียว
//! ③ หาจุดเปลี่ยนฉากจริงด้วยตัวกรอง scdet ของ ffmpeg (ถอดภาพทั้งเรื่อง ช้า จึงเป็นปุ่มที่ผู้ใช้กดเอง หยุดได้)
//! ④ ไฟล์ keyframe 6 แบบที่ Aegisub เปิดได้ (keyframe.cpp) บันทึกแบบ Aegisub v1
//! ไม่แตะไฟล์หนัง · บันทึกไฟล์ keyframe ไม่ทับไฟล์อื่น ไฟล์เดิมที่ผู้ใช้เลือกทับลงถังขยะ
//!
//! วิธีอ่านไฟล์ keyframe กับการแปลงเวลาเฟรมแปลจากซอร์ส Aegisub
//! Copyright (c) 2010-2011, Thomas Goyne <plorkyeran@aegisub.org>
//!
//! Permission to use, copy, modify, and distribute this software for any
//! purpose with or without fee is hereby granted, provided that the above
//! copyright notice and this permission notice appear in all copies.
//!
//! THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
//! WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
//! MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
//! ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
//! WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
//! ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
//! OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::jobs::Jobs;
use crate::tools::{run_tool_timeout, tool_succeeded, tools_dir};

/// ตารางเฟรมของหนังหนึ่งเรื่อง
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct VidTable {
    /// ที่อยู่ ขนาด เวลาแก้ไฟล์ · ไฟล์เปลี่ยนแล้วไม่ตรง
    pub key: String,
    /// เวลาเริ่มแสดงของทุกเฟรม มิลลิวินาที เรียงตามลำดับภาพ เฟรม 0 อยู่ที่ 0
    pub times: Vec<i32>,
    /// เลขเฟรมที่เป็น keyframe เรียงจากน้อยไปมาก
    pub keys: Vec<u32>,
    /// เวลาเฟรมแรกในไฟล์ก่อนลบ มิลลิวินาที (ใช้คิดเวลาที่จะสั่ง ffmpeg ไปหา)
    pub base: i64,
    /// start_time ของไฟล์ วินาที · ffmpeg นับ -ss จากจุดนี้
    pub start: f64,
    pub w: u32,
    pub h: u32,
    /// อัตราส่วนพิกเซลกับอัตราส่วนภาพ เช่น 1:1 กับ 16:9
    pub sar: String,
    pub dar: String,
    pub codec: String,
    /// อัตราเฟรมที่ไฟล์บอก เช่น 24000/1001
    pub rate: String,
    /// อัตราเฟรมเฉลี่ยจากตาราง แบบ Aegisub (จำนวนเฟรมลบหนึ่ง หารเวลาเฟรมสุดท้าย)
    pub fps: f64,
    pub duration: f64,
    /// ffprobe จบโดยรายงานผิดพลาด อ่านไม่ถึงท้ายไฟล์
    pub partial: bool,
}

// ---------------------------------------------------------------- อ่านตาราง

/// บรรทัดแพ็กเก็ต `pts_time=1.541667|dts_time=1.500000|flags=K__` · คืน (เวลาไมโครวินาที, keyframe, ทิ้ง)
/// ffprobe พิมพ์เวลา 6 ตำแหน่ง ปัดเป็นไมโครวินาทีได้ค่าที่พิมพ์ตรงตัว ไม่เพี้ยนแบบทศนิยมลอย (0.083 × 1000 ต้องได้ 83 ไม่ใช่ 82)
/// ไม่มีเวลาแสดงใช้เวลาถอด · แพ็กเก็ตที่มีป้าย D คือส่วนที่ตัวเล่นทิ้ง ไม่นับเป็นเฟรม
fn parse_packet(l: &str) -> Option<(i64, bool, bool)> {
    let (mut pts, mut dts, mut key, mut discard) = (None, None, false, false);
    for kv in l.trim().split('|') {
        let Some((k, v)) = kv.split_once('=') else { continue };
        match k {
            "pts_time" => pts = v.parse::<f64>().ok(),
            "dts_time" => dts = v.parse::<f64>().ok(),
            // ป้ายสามตัว K (keyframe) D (ตัวเล่นทิ้ง) C (เสีย) ตัวที่ไม่มีเป็นขีดล่าง · ดู D ทั้งป้าย ไม่ผูกกับตำแหน่ง
            "flags" => { key = v.starts_with('K'); discard = v.contains('D'); }
            _ => {}
        }
    }
    Some(((pts.or(dts)? * 1e6).round() as i64, key, discard))
}

/// แทร็กภาพแรกที่ไม่ใช่รูปปก
fn video_stream(j: &Value) -> Option<&Value> {
    j["streams"].as_array()?.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() != Some(1))
}

fn num(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

/// สร้างตารางจากแพ็กเก็ตที่อ่านได้ · แยกจากตัวอ่านไว้เทส
fn build(pk: &mut [(i64, bool)]) -> (Vec<i32>, Vec<u32>, i64) {
    // แพ็กเก็ตมาตามลำดับถอด หนังที่มีเฟรม B เวลาแสดงสลับกัน เรียงตามเวลาแสดงก่อน (เรียงแบบคงลำดับ เวลาเท่ากันอยู่ลำดับเดิม)
    pk.sort_by_key(|p| p.0);
    // Aegisub ตัดเศษทศนิยมเป็นมิลลิวินาที (หารจำนวนเต็มปัดเข้าหาศูนย์แบบ C) แล้วลบเวลาเฟรมแรก
    let raw: Vec<i64> = pk.iter().map(|p| p.0 / 1000).collect();
    let base = raw.first().copied().unwrap_or(0);
    let times = raw.iter().map(|t| (t - base).clamp(i32::MIN as i64, i32::MAX as i64) as i32).collect();
    let keys = pk.iter().enumerate().filter(|(_, p)| p.1).map(|(i, _)| i as u32).collect();
    (times, keys, base)
}

/// อ่านตารางเฟรมทั้งไฟล์ · on(วินาทีที่อ่านถึง) ระหว่างอ่าน · stop() จริง = หยุด คืน None
pub fn scan(tools: &Path, movie: &Path, stop: &dyn Fn() -> bool, on: &mut dyn FnMut(f64, f64)) -> Result<Option<VidTable>, String> {
    let j = crate::outfile::ffprobe_json(tools, movie)?;
    let st = video_stream(&j).ok_or("ไฟล์นี้ไม่มีภาพวิดีโอ")?;
    let mut t = VidTable {
        key: key_of(movie),
        start: num(&j["format"]["start_time"]).unwrap_or(0.0),
        w: st["width"].as_u64().unwrap_or(0) as u32,
        h: st["height"].as_u64().unwrap_or(0) as u32,
        sar: st["sample_aspect_ratio"].as_str().unwrap_or("").to_string(),
        dar: st["display_aspect_ratio"].as_str().unwrap_or("").to_string(),
        codec: st["codec_name"].as_str().unwrap_or("").to_string(),
        rate: st["r_frame_rate"].as_str().unwrap_or("").to_string(),
        duration: crate::outfile::duration_of(&j).unwrap_or(0.0),
        ..Default::default()
    };
    let mut child = crate::tools::tool_command(tools, "ffprobe", [
        "-v".as_ref(), "error".as_ref(), "-select_streams".as_ref(), "V:0".as_ref(),
        "-show_entries".as_ref(), "packet=pts_time,dts_time,flags".as_ref(), "-of".as_ref(), "compact=p=0".as_ref(), movie.as_os_str(),
    ]).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("เรียก ffprobe ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().ok_or("อ่านผลของ ffprobe ไม่ได้")?;
    let mut pk: Vec<(i64, bool)> = Vec::new();
    let (mut read_to, mut last) = (0i64, Instant::now());
    for line in BufReader::new(out).lines() {
        if stop() { let _ = child.kill(); let _ = child.wait(); return Ok(None); }
        let Ok(line) = line else { break };
        let Some((us, key, discard)) = parse_packet(&line) else { continue };
        if discard { continue; }
        pk.push((us, key));
        read_to = read_to.max(us);
        if last.elapsed() >= Duration::from_millis(150) { on(read_to as f64 / 1e6 - t.start, t.duration); last = Instant::now(); }
    }
    t.partial = !child.wait().map(|s| s.success()).unwrap_or(false);
    if pk.is_empty() { return Err("อ่านเฟรมวิดีโอไม่ได้".into()); }
    let (times, keys, base) = build(&mut pk);
    // Aegisub เฟรมน้อยกว่าสองเฟรม ใช้ 25 fps (video_provider_ffmpegsource.cpp)
    t.fps = match times.last() { Some(&l) if times.len() >= 2 && l > 0 => (times.len() - 1) as f64 * 1000.0 / l as f64, _ => 25.0 };
    (t.times, t.keys, t.base) = (times, keys, base);
    Ok(Some(t))
}

fn key_of(p: &Path) -> String {
    let m = std::fs::metadata(p).ok();
    let size = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mt = m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    format!("vid|{}|{size}|{mt}", p.display())
}

// ---------------------------------------------------------------- เก็บตารางไว้ ไม่อ่านซ้ำ

/// รุ่นของไฟล์ที่เก็บ · เปลี่ยนวิธีคิดเวลาเมื่อไหร่ เพิ่มเลข ของเก่าไม่ถูกใช้
const CACHE_VER: u32 = 1;
/// หนังสองชั่วโมงราว 2.5 MB รวมกันเกินนี้ลบอันที่ไม่ได้ใช้นานที่สุดก่อน
const CACHE_LIMIT: u64 = 60 * 1024 * 1024;
/// จำในหน่วยความจำไม่เกินเท่านี้เรื่อง
const MEM_MAX: usize = 4;

static MEM: OnceLock<Mutex<Vec<Arc<VidTable>>>> = OnceLock::new();
static TABLE_GEN: AtomicU64 = AtomicU64::new(0);
static SCENE_GEN: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Deserialize)]
struct Cached {
    ver: u32,
    key: String,
    t: VidTable,
}

fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join("vidcache"))
}

fn mem_get(key: &str) -> Option<Arc<VidTable>> {
    let mut m = MEM.get_or_init(Default::default).lock().unwrap();
    let i = m.iter().position(|t| t.key == key)?;
    let t = m.remove(i);
    m.push(t.clone());
    Some(t)
}

fn mem_put(t: Arc<VidTable>) {
    let mut m = MEM.get_or_init(Default::default).lock().unwrap();
    m.retain(|x| x.key != t.key);
    m.push(t);
    while m.len() > MEM_MAX { m.remove(0); }
}

fn disk_load(dir: &Path, key: &str) -> Option<VidTable> {
    let f = crate::audiograph::cache_file(dir, key);
    let c: Cached = serde_json::from_slice(&std::fs::read(&f).ok()?).ok()?;
    if c.ver != CACHE_VER || c.key != key { return None; }
    let _ = std::fs::File::options().write(true).open(&f).and_then(|h| h.set_modified(std::time::SystemTime::now()));
    Some(c.t)
}

fn disk_save(dir: &Path, t: &VidTable) {
    if std::fs::create_dir_all(dir).is_err() { return; }
    let f = crate::audiograph::cache_file(dir, &t.key);
    let tmp = f.with_extension("tmp");
    let Ok(bytes) = serde_json::to_vec(&Cached { ver: CACHE_VER, key: t.key.clone(), t: t.clone() }) else { return };
    if std::fs::write(&tmp, &bytes).is_ok() && std::fs::rename(&tmp, &f).is_err() { let _ = std::fs::remove_file(&tmp); }
    crate::audiograph::prune(dir, CACHE_LIMIT);
}

/// ตารางของหนัง · หน่วยความจำ ไฟล์ที่เก็บไว้ หรืออ่านใหม่ · ffprobe จบไม่ครบไม่เก็บลงเครื่อง เปิดครั้งหน้าลองอ่านใหม่
fn table_of(tools: &Path, dir: Option<&Path>, movie: &Path, stop: &dyn Fn() -> bool, on: &mut dyn FnMut(f64, f64)) -> Result<Option<Arc<VidTable>>, String> {
    let key = key_of(movie);
    if let Some(t) = mem_get(&key) { return Ok(Some(t)); }
    if let Some(t) = dir.and_then(|d| disk_load(d, &key)) { let t = Arc::new(t); mem_put(t.clone()); return Ok(Some(t)); }
    let Some(t) = scan(tools, movie, stop, on)? else { return Ok(None) };
    if let (Some(d), false) = (dir, t.partial) { disk_save(d, &t); }
    let t = Arc::new(t);
    mem_put(t.clone());
    Ok(Some(t))
}

fn need(p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.exists() { Ok(pb) } else { Err("หาไฟล์หนังไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()) }
}

/// ตารางเฟรมของหนัง · ระหว่างอ่านส่ง vid-table-progress { movie, t: วินาทีที่อ่านถึง }
/// หยุดด้วย vid_table_stop หรือปิดโปรแกรม ตอบ "stopped"
#[tauri::command]
pub async fn vid_table(app: AppHandle, movie: String) -> Result<VidTable, String> {
    let tools = tools_dir(&app)?;
    let dir = cache_dir(&app);
    let jobs = app.state::<Arc<Jobs>>().inner().clone();
    let my_gen = TABLE_GEN.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let p = need(&movie)?;
        let stop = || TABLE_GEN.load(Ordering::SeqCst) != my_gen || jobs.cancelled();
        let mut on = |t: f64, dur: f64| { let _ = app.emit("vid-table-progress", json!({ "movie": movie, "t": t, "dur": dur })); };
        table_of(&tools, dir.as_deref(), &p, &stop, &mut on)?.map(|t| (*t).clone()).ok_or_else(|| "stopped".to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn vid_table_stop() {
    TABLE_GEN.fetch_add(1, Ordering::SeqCst);
}

// ---------------------------------------------------------------- ภาพตรงเฟรม

/// ตัวเลือกของ ffmpeg ที่เปิดไฟล์ตรงเวลา ss แล้วเอา count เฟรมต่อกัน · ใช้ร่วมกับเทสที่อ่านค่าสีจริง
/// -ss ก่อน -i ffmpeg กระโดดไป keyframe ก่อนหน้าแล้วถอดทิ้งจนถึง ss (เฟรมที่เวลาก่อน ss ไม่ออกมา)
/// map 0:V:0 คือภาพแรกที่ไม่ใช่รูปปก (MP4 ที่มีปกใหญ่กว่าภาพหนัง ffmpeg เลือกปกเอง) · passthrough ไม่ให้เพิ่มหรือทิ้งเฟรมตามอัตราเฟรม
fn seek_args(movie: &Path, ss: f64, count: u32) -> Vec<OsString> {
    vec!["-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.6}", ss.max(0.0)).into(), "-i".into(), movie.into(),
        "-map".into(), "0:V:0".into(), "-frames:v".into(), count.to_string().into(), "-fps_mode".into(), "passthrough".into()]
}

/// แยกไฟล์ JPEG ที่ต่อกันมาจาก image2pipe ตามโครงของ JPEG (ข้ามข้อมูลภาพหลังส่วน SOS จนเจอเครื่องหมายจริง) ไม่เดาจากไบต์ FFD9
pub(crate) fn split_jpegs(b: &[u8]) -> Vec<&[u8]> {
    let mut out = Vec::new();
    let mut i = 0usize;
    'outer: while i + 1 < b.len() {
        if b[i] != 0xFF || b[i + 1] != 0xD8 { i += 1; continue; }
        let start = i;
        let mut j = i + 2;
        loop {
            while j < b.len() && b[j] != 0xFF { j += 1; }
            while j < b.len() && b[j] == 0xFF { j += 1; }
            if j >= b.len() { break 'outer; }
            let m = b[j];
            j += 1;
            match m {
                0xD9 => { out.push(&b[start..j]); i = j; continue 'outer; }
                0x01 | 0xD0..=0xD7 => {}
                _ => {
                    if j + 1 >= b.len() { break 'outer; }
                    j += ((b[j] as usize) << 8) | b[j + 1] as usize;
                    if m == 0xDA {
                        // ข้อมูลภาพ ไบต์ FF ตามด้วย 00 หรือ RSTn ไม่ใช่เครื่องหมาย
                        loop {
                            while j < b.len() && b[j] != 0xFF { j += 1; }
                            if j + 1 >= b.len() { break 'outer; }
                            match b[j + 1] { 0x00 | 0xD0..=0xD7 => j += 2, 0xFF => j += 1, _ => break }
                        }
                    }
                }
            }
        }
    }
    out
}

/// ภาพต่อกัน count เฟรมตั้งแต่เวลา ss สูง h จุด เป็นไบต์ JPEG
pub fn frames_jpg(tools: &Path, movie: &Path, ss: f64, count: u32, h: u32) -> Result<Vec<Vec<u8>>, String> {
    let mut args = seek_args(movie, ss, count);
    args.extend(["-vf".into(), format!("scale=-2:{h}").into(), "-f".into(), "image2pipe".into(), "-c:v".into(), "mjpeg".into(), "-q:v".into(), "4".into(), "-".into()]);
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(60))?;
    if !tool_succeeded("ffmpeg", &o.status) { return Err("ดึงภาพหนังไม่ได้".into()); }
    let v: Vec<Vec<u8>> = split_jpegs(&o.stdout).into_iter().map(|x| x.to_vec()).collect();
    if v.is_empty() { return Err("ดึงภาพหนังไม่ได้".into()); }
    Ok(v)
}

/// ภาพตรงเฟรม · ss คือเวลาที่หน้าจอคิดจากตาราง (เวลาเฟรมลบครึ่งมิลลิวินาที) · ได้ภาพเฟรมนั้นกับเฟรมถัดไปรวม count ภาพ ใกล้ท้ายเรื่องได้น้อยกว่า
#[tauri::command]
pub async fn vid_frames(app: AppHandle, movie: String, ss: f64, count: u32, h: u32) -> Result<Vec<String>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let v = frames_jpg(&tools, &need(&movie)?, ss, count.clamp(1, 8), h.clamp(90, 2160))?;
        Ok(v.iter().map(|b| format!("data:image/jpeg;base64,{}", crate::audiograph::b64(b))).collect())
    }).await.map_err(|e| e.to_string())?
}

// ---------------------------------------------------------------- จุดเปลี่ยนฉาก

/// เวลาที่ scdet เจอ จากข้อความของ ffmpeg `lavfi.scd.score: 16.139, lavfi.scd.time: 4`
fn scene_times(stderr: &str) -> Vec<f64> {
    stderr.lines().filter_map(|l| l.split("lavfi.scd.time:").nth(1)?.trim().split(|c: char| c.is_whitespace() || c == ',').next()?.parse().ok()).collect()
}

/// เวลาจาก ffmpeg (นับจาก start_time ของไฟล์) เป็นเลขเฟรมที่ใกล้ที่สุด
fn frame_near(t: &VidTable, sec: f64) -> u32 {
    let ms = sec * 1000.0 + t.start * 1000.0 - t.base as f64;
    let i = t.times.partition_point(|&x| (x as f64) < ms);
    if i == 0 { return 0; }
    if i >= t.times.len() { return (t.times.len() - 1) as u32; }
    if ms - t.times[i - 1] as f64 <= t.times[i] as f64 - ms { (i - 1) as u32 } else { i as u32 }
}

/// หาจุดเปลี่ยนฉาก · ถอดภาพทั้งเรื่องแบบย่อเล็ก on(วินาทีที่ถอดถึง) · คืนเลขเฟรมแรกของแต่ละฉาก
pub fn scenes(tools: &Path, t: &VidTable, movie: &Path, threshold: f64, stop: &dyn Fn() -> bool, on: &mut dyn FnMut(f64)) -> Result<Option<Vec<u32>>, String> {
    let vf = format!("scale=320:-2,scdet=t={threshold}");
    let args: Vec<OsString> = vec!["-hide_banner".into(), "-nostdin".into(), "-nostats".into(), "-progress".into(), "pipe:1".into(), "-threads".into(), "4".into(),
        "-i".into(), movie.into(), "-map".into(), "0:V:0".into(), "-an".into(), "-sn".into(), "-dn".into(), "-vf".into(), vf.into(), "-f".into(), "null".into(), "-".into()];
    let mut on_line = |l: &str| {
        if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<i64>().ok()) { on(us as f64 / 1e6); }
    };
    match crate::outfile::run_live(tools, "ffmpeg", &args, stop, &mut on_line)? {
        crate::outfile::Run::Cancelled => Ok(None),
        crate::outfile::Run::Done(st, err) => {
            if !tool_succeeded("ffmpeg", &st) { return Err("หาจุดเปลี่ยนฉากไม่สำเร็จ ffmpeg ถอดภาพไม่จบ".into()); }
            let mut v: Vec<u32> = scene_times(&err).into_iter().map(|s| frame_near(t, s)).collect();
            v.sort_unstable();
            v.dedup();
            Ok(Some(v))
        }
    }
}

/// หาจุดเปลี่ยนฉาก · ส่ง vid-scenes-progress { movie, t } · หยุดด้วย vid_scenes_stop ตอบ "stopped"
#[tauri::command]
pub async fn vid_scenes(app: AppHandle, movie: String, threshold: Option<f64>) -> Result<Vec<u32>, String> {
    let tools = tools_dir(&app)?;
    let dir = cache_dir(&app);
    let jobs = app.state::<Arc<Jobs>>().inner().clone();
    let my_gen = SCENE_GEN.load(Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let p = need(&movie)?;
        let stop = || SCENE_GEN.load(Ordering::SeqCst) != my_gen || jobs.cancelled();
        let t = table_of(&tools, dir.as_deref(), &p, &stop, &mut |_, _| {})?.ok_or("stopped")?;
        let dur = t.duration;
        let mut on = |s: f64| { let _ = app.emit("vid-scenes-progress", json!({ "movie": movie, "t": s, "dur": dur })); };
        scenes(&tools, &t, &p, threshold.unwrap_or(10.0).clamp(1.0, 100.0), &stop, &mut on)?.ok_or_else(|| "stopped".to_string())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn vid_scenes_stop() {
    SCENE_GEN.fetch_add(1, Ordering::SeqCst);
}

// ---------------------------------------------------------------- ไฟล์ keyframe (keyframe.cpp)

/// ไฟล์แบบนับเฟรมทีละบรรทัด · บรรทัดที่บอกชนิด I คือ keyframe P กับ B คือเฟรมธรรมดา บรรทัดอื่นไม่นับ
fn enumerated(lines: &[&str], f: fn(&str) -> Option<char>) -> Vec<i64> {
    let mut count = 0i64;
    let mut v = Vec::new();
    for l in lines {
        match f(l).map(|c| c.to_ascii_lowercase()) {
            Some('i') => { v.push(count); count += 1; }
            Some('p') | Some('b') => count += 1,
            _ => {}
        }
    }
    v
}

fn xvid(l: &str) -> Option<char> { l.chars().next() }

/// DivX หา I ก่อน ไม่เจอค่อยหา P แล้ว B ทั้งบรรทัด (ลำดับเดียวกับ Aegisub)
fn divx(l: &str) -> Option<char> { ['I', 'P', 'B'].into_iter().find(|c| l.contains(*c)) }

fn x264(l: &str) -> Option<char> {
    let p = l.find("type:")?;
    l[p + 5..].chars().next()
}

/// อ่านไฟล์ keyframe · คืนเลขเฟรมเรียงจากน้อยไปมาก ไม่ซ้ำ (Aegisub ไม่เรียง แต่เส้นบนกราฟกับตัวดูดติดต้องเรียง)
pub fn load_keys(text: &str) -> Result<Vec<u32>, String> {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let lines: Vec<&str> = text.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)).collect();
    let header = lines.first().copied().unwrap_or("");
    let rest = &lines[1.min(lines.len())..];
    let v: Vec<i64> = if header == "# keyframe format v1" {
        // บรรทัดถัดไปคือ fps ตามด้วยตัวเลข (Aegisub อ่านแล้วไม่ใช้) ที่เหลือบรรทัดละเลขเฟรม บรรทัดที่ไม่ใช่ตัวเลขข้าม
        rest.iter().skip(1).filter_map(|l| l.trim().parse::<i64>().ok()).collect()
    } else if header.starts_with("# XviD 2pass stat file") || header.starts_with("# ffmpeg 2-pass log file, using xvid codec") || header.starts_with("# avconv 2-pass log file, using xvid codec") {
        enumerated(rest, xvid)
    } else if header.starts_with("##map version") {
        enumerated(rest, divx)
    } else if header.starts_with("#options:") {
        enumerated(rest, x264)
    } else if header.starts_with("# WWXD log file, using qpfile format") {
        let mut v = Vec::new();
        for l in rest {
            if l.is_empty() || l.starts_with('#') { continue; }
            let mut it = l.split_whitespace();
            let (Some(n), Some(k)) = (it.next().and_then(|n| n.parse::<i64>().ok()), it.next()) else {
                return Err("ไฟล์ WWXD ไม่ได้เขียนแบบ qpfile อ่านเลขเฟรมไม่ได้".into());
            };
            if k.starts_with('I') { v.push(n); }
        }
        v
    } else {
        return Err("ไม่รู้จักไฟล์ keyframe แบบนี้ เปิดได้เฉพาะไฟล์ของ Aegisub, XviD, DivX, x264 และ WWXD".into());
    };
    let mut v: Vec<u32> = v.into_iter().filter(|&n| n >= 0 && n <= u32::MAX as i64).map(|n| n as u32).collect();
    v.sort_unstable();
    v.dedup();
    Ok(v)
}

/// ไฟล์ keyframe แบบ Aegisub v1 (fps เขียนเป็น 0 แบบที่ Aegisub เขียน)
pub fn keys_text(keys: &[u32]) -> String {
    let mut s = String::from("# keyframe format v1\nfps 0\n");
    for k in keys { s.push_str(&k.to_string()); s.push('\n'); }
    s
}

#[tauri::command]
pub fn vid_keys_load(path: String) -> Result<Vec<u32>, String> {
    let b = std::fs::read(&path).map_err(|e| format!("เปิดไฟล์ไม่ได้ {e}"))?;
    load_keys(&String::from_utf8_lossy(&b))
}

/// บันทึกไฟล์ keyframe · ผู้ใช้เลือกชื่อที่มีอยู่แล้ว (หน้าต่างเลือกที่บันทึกถามยืนยันทับแล้ว) ไฟล์เดิมลงถังขยะ ไม่ลบทิ้ง
#[tauri::command]
pub fn vid_keys_save(path: String, keys: Vec<u32>) -> Result<String, String> {
    use std::io::Write;
    let target = PathBuf::from(&path);
    // ไฟล์ keyframe เป็นไฟล์ข้อความ .txt เท่านั้น กันพิมพ์ชื่อหนังหรือไฟล์ซับในกล่องบันทึกแล้วไฟล์นั้นลงถังขยะ (ผู้ช่วยตรวจทาน R10)
    if !target.extension().is_some_and(|e| e.eq_ignore_ascii_case("txt")) { return Err("ไฟล์ keyframe ต้องเป็นไฟล์ .txt".into()); }
    let bytes = keys_text(&keys).into_bytes();
    let partial = crate::subdoc::partial_of(&target);
    {
        let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|e| format!("เขียนไฟล์ไม่ได้ {e}"))?;
        f.write_all(&bytes).and_then(|_| f.sync_all()).map_err(|e| { let _ = std::fs::remove_file(&partial); format!("เขียนไฟล์ไม่ได้ {e}") })?;
    }
    crate::outfile::replace_with(&partial, &target)?;
    crate::actlog::note("บันทึกไฟล์ keyframe", &format!("{} ({} เฟรม)", target.display(), keys.len()));
    Ok(target.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    fn media(name: &str) -> Option<PathBuf> {
        if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return None; }
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join(name);
        assert!(p.exists(), "ไม่มีไฟล์ทดสอบ {} · รัน node scripts/make-test-media.mjs ก่อน (หรือตั้ง MOVIE_SHELF_SKIP_MEDIA=1)", p.display());
        Some(p)
    }

    /// เวลาที่หน้าจอใช้สั่งดึงภาพ (src/lib/vidFrames.ts seekOf ต้องคิดแบบเดียวกัน)
    fn seek_of(t: &VidTable, n: usize) -> f64 {
        (t.times[n] as i64 + t.base) as f64 / 1000.0 - t.start - 0.0005
    }

    /// ค่าความสว่างกลางกล่องของแต่ละภาพ (หนังทดสอบกล่องกลางสว่างเท่า เลขเฟรม × 8 หาร 256 เหลือเศษ)
    fn box_lumas(movie: &Path, ss: f64, count: u32) -> Vec<u8> {
        let mut args = seek_args(movie, ss, count);
        args.extend(["-f".into(), "rawvideo".into(), "-pix_fmt".into(), "yuv420p".into(), "-".into()]);
        let o = run_tool_timeout(&tools(), "ffmpeg", &args, Duration::from_secs(60)).unwrap();
        let fsz = 640 * 360 * 3 / 2;
        o.stdout.chunks(fsz).filter(|c| c.len() == fsz).map(|c| c[180 * 640 + 320]).collect()
    }

    /// เลขเฟรมในช่วง 0 ถึง 31 จากค่าสี (เฟรมที่ห่างกัน 32 เฟรมได้ค่าเดียวกัน) · x264 บีบอัดแล้วค่าคลาดได้ไม่กี่หน่วย
    fn frame_of_luma(y: u8) -> u32 {
        (0..32u32).min_by_key(|n| (((n * 8) % 256) as i32 - y as i32).abs()).unwrap()
    }

    #[test]
    fn packets_like_aegisub() {
        // 0.083 ต้องได้ 83 · เฟรม B เรียงตามเวลาแสดง · แพ็กเก็ตที่ตัวเล่นทิ้งมีป้าย D
        assert_eq!(parse_packet("pts_time=0.083000|dts_time=0.042000|flags=___"), Some((83_000, false, false)));
        assert_eq!(parse_packet("pts_time=N/A|dts_time=1.5|flags=K__"), Some((1_500_000, true, false)));
        assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=KD_"), Some((100_000, true, true)));
        assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=_DC"), Some((100_000, false, true)));
        assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=K_C"), Some((100_000, true, false)));
        let mut pk = vec![(42_000, true), (125_000, false), (83_000, false), (1_541_666, false)];
        let (times, keys, base) = build(&mut pk);
        assert_eq!((times, keys, base), (vec![0, 41, 83, 1499], vec![0], 42));
    }

    #[test]
    fn keyframe_files_like_aegisub() {
        assert_eq!(load_keys("# keyframe format v1\r\nfps 23.976\r\n0\r\n96\r\nขยะ\r\n24\r\n").unwrap(), vec![0, 24, 96]);
        assert_eq!(load_keys("# XviD 2pass stat file\ni 1 2\np 3\nb 4\nI 5\n# ความเห็น\np\n").unwrap(), vec![0, 3]);
        assert_eq!(load_keys("# ffmpeg 2-pass log file, using xvid codec\ni\np\ni\n").unwrap(), vec![0, 2]);
        assert_eq!(load_keys("##map version 1\nx P y\nI\nPB\nzzz\nxBx\nI P\n").unwrap(), vec![1, 4]);
        assert_eq!(load_keys("#options: 1280x720\nin:0 out:0 type:I\nin:1 out:1 type:b\nin:2 out:2 type:P\nin:3 out:3 type:i\n").unwrap(), vec![0, 3]);
        assert_eq!(load_keys("# WWXD log file, using qpfile format\n# ข้าม\n0 I\n10 P\n96 I\n").unwrap(), vec![0, 96]);
        assert!(load_keys("# WWXD log file, using qpfile format\nเสีย\n").is_err());
        assert!(load_keys("ไฟล์อื่น\n1\n").is_err());
        let k = vec![0, 96, 192, 240];
        assert_eq!(keys_text(&k), "# keyframe format v1\nfps 0\n0\n96\n192\n240\n");
        assert_eq!(load_keys(&keys_text(&k)).unwrap(), k);
    }

    #[test]
    fn jpeg_split_follows_markers() {
        // ภาพที่มี FF D9 อยู่ในตาราง (ไม่ใช่จุดจบ) กับข้อมูลภาพที่มี FF 00 และ RST ต้องแยกได้สองภาพพอดี
        let a: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x05, 0xFF, 0xD9, 0x01, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0xFF, 0x00, 0x22, 0xFF, 0xD3, 0x33, 0xFF, 0xD9];
        let b: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0x44, 0xFF, 0xD9];
        let all = [a.clone(), b.clone()].concat();
        assert_eq!(split_jpegs(&all), vec![&a[..], &b[..]]);
    }

    #[test]
    fn test_movie_frames_and_keys() {
        let Some(m) = media("ฉากตัด (2025).mkv") else { return };
        let t = scan(&tools(), &m, &|| false, &mut |_, _| {}).unwrap().unwrap();
        assert_eq!(t.times.len(), 480, "20 วินาที 24 fps");
        assert_eq!(t.keys, vec![0, 96, 192, 240, 288, 384], "keyframe ที่ 0 4 8 10 12 16 วินาที");
        assert_eq!((t.times[1], t.times[37], t.times[96], t.w, t.h), (42, 1542, 4000, 640, 360));
        assert!((t.fps - 24.0).abs() < 0.01, "fps {}", t.fps);
        // ภาพที่ได้ต้องเป็นเฟรมที่ขอพอดี ทั้งกลางฉาก ก่อนจุดตัด ตรงจุดตัด และเฟรมสุดท้าย
        for n in [37usize, 95, 96, 250, 479] {
            let y = box_lumas(&m, seek_of(&t, n), 3);
            assert!(!y.is_empty(), "เฟรม {n} ไม่ได้ภาพ");
            let got: Vec<u32> = y.iter().map(|&v| frame_of_luma(v)).collect();
            let want: Vec<u32> = (n..(n + 3).min(480)).map(|k| k as u32 % 32).collect();
            assert_eq!(got, want, "เฟรม {n} ค่าสี {y:?}");
        }
        let jpgs = frames_jpg(&tools(), &m, seek_of(&t, 37), 3, 180).unwrap();
        assert_eq!(jpgs.len(), 3);
        assert!(jpgs.iter().all(|j| j.starts_with(&[0xFF, 0xD8]) && j.ends_with(&[0xFF, 0xD9])));
        // จุดเปลี่ยนฉากจริงคือ 4 8 12 16 วินาที ไม่รวม keyframe ที่ 10 วินาทีซึ่งไม่ใช่จุดตัด
        let s = scenes(&tools(), &t, &m, 10.0, &|| false, &mut |_| {}).unwrap().unwrap();
        assert_eq!(s, vec![96, 192, 288, 384]);
        assert_eq!(frame_near(&t, 4.0), 96);
        assert_eq!(frame_near(&t, 4.02), 96);
        assert_eq!(frame_near(&t, 4.03), 97);
    }
}
