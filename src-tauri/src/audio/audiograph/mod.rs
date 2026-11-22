//! หน้ากราฟเสียง (ROADMAP · มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
//! ffmpeg ที่แนบอยู่ถอดแทร็กเสียงที่เลือกเป็นตัวเลข 16 บิต ส่งผ่านท่อ โปรแกรมคิดเองทั้งหมด ไม่แก้ไฟล์
//! - ภาพรวมทั้งเรื่อง (graph_overview) อ่านทั้งไฟล์ครั้งเดียว ได้รูปคลื่น ความถี่ ความดังตามมาตรฐาน EBU R128 (ebur128 ของ ffmpeg)
//!   ยอดเสียง เสียงแตก และช่วงเงียบผิดปกติ · เก็บไว้ในหน่วยความจำ เปิดซ้ำไม่ต้องอ่านใหม่
//! - ช่วงที่ซูม (graph_window) อ่านเฉพาะช่วงนั้น เร็ว · ความถี่เฉลี่ย (graph_psd) แบบ Plot Spectrum ของ Audacity
//! - ความถี่คิดด้วย FFT ที่เขียนเอง ไม่เพิ่มห้องสมุด · หน้าต่าง Hann · เสียงเต็มสเกลเป็น 0 dB

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

use crate::app::jobs::Jobs;
use crate::app::tools::{run_tool_timeout, tool_succeeded, tools_dir};

/// ชื่อช่องตามลำดับที่ ffmpeg ถอดออกมา (ลำดับมาตรฐานของ ffmpeg ต่อแบบช่องเสียง)
pub fn layout_names(layout: &str, n: usize) -> Vec<String> {
    let v: &[&str] = match layout {
        "mono" => &["FC"],
        "stereo" => &["FL", "FR"],
        "2.1" => &["FL", "FR", "LFE"],
        "3.0" => &["FL", "FR", "FC"],
        "3.0(back)" => &["FL", "FR", "BC"],
        "3.1" => &["FL", "FR", "FC", "LFE"],
        "4.0" => &["FL", "FR", "FC", "BC"],
        "quad" => &["FL", "FR", "BL", "BR"],
        "quad(side)" => &["FL", "FR", "SL", "SR"],
        "4.1" => &["FL", "FR", "FC", "LFE", "BC"],
        "5.0" => &["FL", "FR", "FC", "BL", "BR"],
        "5.0(side)" => &["FL", "FR", "FC", "SL", "SR"],
        "5.1" => &["FL", "FR", "FC", "LFE", "BL", "BR"],
        "5.1(side)" => &["FL", "FR", "FC", "LFE", "SL", "SR"],
        "6.0" => &["FL", "FR", "FC", "BC", "SL", "SR"],
        "6.1" => &["FL", "FR", "FC", "LFE", "BC", "SL", "SR"],
        "6.1(back)" => &["FL", "FR", "FC", "LFE", "BL", "BR", "BC"],
        "7.0" => &["FL", "FR", "FC", "BL", "BR", "SL", "SR"],
        "7.1" => &["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"],
        "7.1(wide)" => &["FL", "FR", "FC", "LFE", "BL", "BR", "FLC", "FRC"],
        "7.1(wide-side)" => &["FL", "FR", "FC", "LFE", "FLC", "FRC", "SL", "SR"],
        _ => &[],
    };
    if v.len() == n {
        v.iter().map(|s| s.to_string()).collect()
    } else if n == 1 {
        vec!["FC".into()]
    } else if n == 2 {
        vec!["FL".into(), "FR".into()]
    } else {
        (1..=n).map(|i| format!("CH{i}")).collect()
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GTrack {
    /// ลำดับในแทร็กเสียงด้วยกัน (0:a:index)
    pub index: usize,
    pub codec: String,
    /// แบบช่องเสียงที่คนเห็น เช่น 5.1 · 2.0
    pub layout: String,
    /// ชื่อช่องตามลำดับที่ถอดออกมา เช่น FL FR FC LFE SL SR
    pub names: Vec<String>,
    pub lang: Option<String>,
    pub title: Option<String>,
    pub rate: u32,
    pub bits: Option<u32>,
    pub bitrate: Option<u64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GInfo {
    pub duration: f64,
    pub size: u64,
    /// ไม่มีภาพ (ไม่นับรูปปก) = ไฟล์เสียงอย่างเดียว
    pub audio_only: bool,
    pub tracks: Vec<GTrack>,
}

fn num<T: std::str::FromStr>(v: &Value, k: &str) -> Option<T> {
    match &v[k] {
        Value::String(s) => s.parse().ok(),
        Value::Number(n) => n.to_string().parse().ok(),
        _ => None,
    }
}

/// อ่านผล ffprobe ของไฟล์ เป็นรายการแทร็กเสียง
pub fn parse_info(j: &Value) -> GInfo {
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let mut tracks = Vec::new();
    let mut video = false;
    let audio_only_rate = num::<u64>(&j["format"], "bit_rate");
    for st in &streams {
        match st["codec_type"].as_str() {
            Some("video") if st["disposition"]["attached_pic"].as_i64() != Some(1) => video = true,
            Some("audio") => {
                let ch = num::<usize>(st, "channels").unwrap_or(2).max(1);
                let lay = st["channel_layout"].as_str().unwrap_or("");
                let short = match lay {
                    "mono" => "1.0".to_string(),
                    "stereo" => "2.0".to_string(),
                    "" => crate::media::probe::layout(ch as u64),
                    l => l.split('(').next().unwrap_or(l).to_string(),
                };
                let bits = num::<u32>(st, "bits_per_raw_sample").filter(|b| *b > 0).or(num::<u32>(st, "bits_per_sample").filter(|b| *b > 0));
                tracks.push(GTrack {
                    index: tracks.len(),
                    codec: crate::media::probe::audio_name(st["codec_name"].as_str().unwrap_or(""), st["profile"].as_str().unwrap_or("")),
                    layout: short,
                    names: layout_names(lay, ch),
                    lang: crate::media::probe::lang_th(st["tags"]["language"].as_str().unwrap_or("")),
                    title: st["tags"]["title"].as_str().map(|s| s.to_string()).filter(|s| !s.is_empty()),
                    rate: num::<u32>(st, "sample_rate").unwrap_or(48000),
                    bits,
                    bitrate: num::<u64>(st, "bit_rate"),
                });
            }
            _ => {}
        }
    }
    let audio_only = !video;
    if audio_only && tracks.len() == 1 && tracks[0].bitrate.is_none() {
        tracks[0].bitrate = audio_only_rate;
    }
    GInfo {
        duration: num::<f64>(&j["format"], "duration").unwrap_or(0.0),
        size: num::<u64>(&j["format"], "size").unwrap_or(0),
        audio_only,
        tracks,
    }
}

pub fn info(tools: &Path, path: &Path) -> Result<GInfo, String> {
    let out = run_tool_timeout(tools, "ffprobe", [
        OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
        OsStr::new("-show_format"), OsStr::new("-show_streams"), path.as_os_str(),
    ], Duration::from_secs(60))?;
    if !tool_succeeded("ffprobe", &out.status) {
        // สาเหตุเป็นประโยคไทย ไม่ใช่แค่รหัส (BUGS ข้อ 150)
        return Err(format!("อ่านไฟล์ไม่ได้ {}", crate::app::tools::output_fail("ffprobe", &out, true)));
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))?;
    let g = parse_info(&j);
    if g.tracks.is_empty() {
        return Err("ไฟล์นี้ไม่มีแทร็กเสียง".into());
    }
    Ok(g)
}

// ---------- คำสั่งที่หน้าจอเรียก ----------

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub duration: f64,
    pub cols: usize,
    pub env: Vec<Vec<f32>>,
    pub spec_cols: usize,
    pub spec_bins: usize,
    /// ความถี่แบบเส้นตรง 0 ถึงครึ่งอัตราสุ่ม ต่อช่อง (แบบวิเคราะห์ทั้งเรื่อง)
    pub spec: Vec<String>,
    /// ความดังต่อคอลัมน์ LUFS · −70 = เงียบ
    pub loud: Vec<f32>,
    pub integrated: Option<f64>,
    pub lra: Option<f64>,
    pub true_peak: Option<f64>,
    /// ต่อช่อง dBFS
    pub peaks: Vec<f32>,
    pub rms: Vec<f32>,
    pub clips: Vec<u32>,
    pub silences: Vec<[f64; 2]>,
    /// อ่านได้ถึงวินาทีไหน (ไฟล์ขาดท้ายจะน้อยกว่าความยาว)
    pub read_to: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub t0: f64,
    pub t1: f64,
    pub cols: usize,
    pub env: Vec<Vec<f32>>,
    pub bins: usize,
    pub spec: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Psd {
    pub size: usize,
    pub rate: u32,
    /// ต่อชุดเส้น dB ทีละช่องความถี่ (size/2 ช่อง)
    pub db: Vec<Vec<f32>>,
}

static OVERVIEWS: OnceLock<Mutex<HashMap<String, Arc<Overview>>>> = OnceLock::new();
/// เลขรอบของภาพรวม · ภาพรวมอันใหม่หรือปุ่มหยุดเพิ่มเลข อันที่อ่านอยู่หยุดเอง อ่านได้ทีละอัน ไม่ซ้อนกัน
static OVERVIEW_GEN: AtomicU64 = AtomicU64::new(0);
static WINDOW_GEN: AtomicU64 = AtomicU64::new(0);

fn cache_key(path: &Path, track: usize) -> String {
    let m = std::fs::metadata(path).ok();
    let size = m.as_ref().map(|m| m.len()).unwrap_or(0);
    let mt = m.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    format!("{}|{track}|{size}|{mt}", path.display())
}


#[tauri::command]
pub fn graph_cache_info(app: AppHandle) -> CacheInfo {
    cache_dir(&app).map(|d| cache_info_in(&d)).unwrap_or(CacheInfo { files: 0, bytes: 0 })
}

/// ล้างผลที่เก็บไว้ทั้งหมด ทั้งในเครื่องและในหน่วยความจำ · ไฟล์หนังไม่ถูกแตะ
#[tauri::command]
pub fn graph_cache_clear(app: AppHandle) -> CacheInfo {
    OVERVIEWS.get_or_init(Default::default).lock().unwrap().clear();
    if let Some(d) = cache_dir(&app) {
        if let Ok(rd) = std::fs::read_dir(&d) {
            for e in rd.flatten().filter(|e| e.path().extension().map(|x| x == "json" || x == "tmp").unwrap_or(false)) {
                let _ = std::fs::remove_file(e.path());
            }
        }
        return cache_info_in(&d);
    }
    CacheInfo { files: 0, bytes: 0 }
}

/// ลืมผลในหน่วยความจำ เหมือนปิดเปิดโปรแกรมใหม่ · ใช้ในตัวเทสหน้าจอ ตัวติดตั้งจริงไม่มีคำสั่งนี้
#[cfg(debug_assertions)]
#[tauri::command]
pub fn graph_dev_forget() {
    OVERVIEWS.get_or_init(Default::default).lock().unwrap().clear();
}

fn rms_db(sq: f64, n: u64) -> f32 {
    if n == 0 || sq <= 0.0 { -120.0 } else { (20.0 * (sq / n as f64).sqrt().log10()) as f32 }
}

/// อ่านทั้งไฟล์ครั้งเดียว · on ได้ 0–100
pub fn overview(tools: &Path, path: &Path, track: &GTrack, duration: f64, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Overview>, String> {
    let ch = track.names.len();
    let total = (duration * track.rate as f64).max(1.0);
    let (cols, spec_cols, spec_bins) = (1200usize, 800usize, 256usize);
    let mut an = Analyzer::new(ch, track.rate, total, cols, 1024, spec_cols, 4);
    // ความดังวัดในโปรแกรมไปพร้อมกัน ไม่ให้ ffmpeg วัด (ตัววัดของ ffmpeg ช้ากว่าการถอดเสียง 20 เท่า BUGS ข้อ 145)
    let mut r128 = crate::audio::loudness::R128::new(&track.names, track.rate);
    let mut last = Instant::now();
    let mut feed = |f: &[f32]| {
        an.push(f);
        r128.push(f);
        if an.frame % 4096 == 0 && last.elapsed() >= Duration::from_millis(100) {
            on((an.frame as f64 / total * 100.0).min(99.0));
            last = Instant::now();
        }
    };
    let Some(run) = decode(tools, path, track.index, ch, None, None, false, &mut feed, stop)? else { return Ok(None) };
    if an.frame == 0 {
        return Err(format!("อ่านเสียงไม่ได้  {}", run.tail.last().cloned().unwrap_or_default()));
    }
    let (r_loud, r_integrated, r_lra, r_tp) = r128.finish();
    let run = Run { loud: r_loud, integrated: r_integrated, lra: r_lra, true_peak: r_tp, ..run };
    // ความดังต่อคอลัมน์ เฉลี่ยพลังงานของค่า Momentary ที่ตกในคอลัมน์นั้น
    let mut e = vec![0.0f64; cols];
    let mut n = vec![0u32; cols];
    for &(t, m) in &run.loud {
        let c = ((t / duration.max(0.001)) * cols as f64) as usize;
        if c < cols && m > -70.0 { e[c] += 10f64.powf(m / 10.0); }
        if c < cols { n[c] += 1; }
    }
    // ebur128 ให้ค่า Momentary ทุก 0.1 วินาที · ไฟล์สั้นคอลัมน์แคบกว่านั้น คอลัมน์ที่ไม่มีค่าใช้ค่าของคอลัมน์ก่อนหน้า
    // ไม่งั้นนับเป็น −70 เส้นความดังเป็นซี่หวี (เจอตอนเทสหน้าจอ 7 พ.ย. 2569 ไฟล์ 20 วินาที)
    let mut loud: Vec<f32> = (0..cols).map(|c| if n[c] == 0 { f32::NAN } else if e[c] <= 0.0 { -70.0 } else { (10.0 * (e[c] / n[c] as f64).log10()) as f32 }).collect();
    let mut prev = loud.iter().copied().find(|v| !v.is_nan()).unwrap_or(-70.0);
    for v in loud.iter_mut() {
        if v.is_nan() { *v = prev } else { prev = *v }
    }
    Ok(Some(Overview {
        duration,
        cols,
        env: an.env(),
        spec_cols,
        spec_bins,
        spec: an.spec(Scale::Lin, spec_bins, None),
        loud,
        integrated: run.integrated,
        lra: run.lra,
        true_peak: run.true_peak,
        peaks: an.peak.iter().map(|&p| if p <= 0.0 { -120.0 } else { (20.0 * (p as f64).log10()) as f32 }).collect(),
        rms: an.sq.iter().map(|&s| rms_db(s, an.frame)).collect(),
        clips: an.clips.clone(),
        silences: an.silences(0.0),
        read_to: an.frame as f64 / track.rate as f64,
    }))
}

/// อ่านเฉพาะช่วง t0–t1 · cols คอลัมน์ · ความถี่แบบล็อก (แถบทุกช่อง) หรือเส้นตรง (แบบวิเคราะห์)
#[allow(clippy::too_many_arguments)]
/// full = ตอนบันทึกรูป อ่านความถี่ต่อเนื่องครบทุกช่วงไม่สุ่มข้าม คอลัมน์ถึง 8,192 (พี่กันเคาะ 9 พ.ย. 2569 "เอาเท่านี้")
/// ดูบนจอยังสุ่มคอลัมน์ละ 3 ครั้ง ซูมจะได้ไม่ช้าลง
#[allow(clippy::too_many_arguments)]
pub fn window_read(tools: &Path, path: &Path, track: &GTrack, t0: f64, t1: f64, cols: usize, bins: usize, log: bool, full: bool, stop: &dyn Fn() -> bool) -> Result<Option<Window>, String> {
    let ch = track.names.len();
    let len = (t1 - t0).max(0.002);
    let total = (len * track.rate as f64).max(1.0);
    let n_fft = if log { 2048 } else { 1024 };
    // ซูมลึกจนตัวอย่างเสียงน้อยกว่าจำนวนคอลัมน์ ให้หนึ่งคอลัมน์เท่าหนึ่งตัวอย่าง ไม่มีคอลัมน์ว่างคั่น (หน้าจอยืดเอง · พี่กันถาม 11 พ.ย. 2569 "ซูมได้มากกว่านี้ได้มั้ย")
    let cols = cols.clamp(16, 8192).min((total.ceil() as usize).max(16));
    let spec_cols = if full { cols } else { cols.min(1200) };
    // ครอบทุกช่วงเมื่อคอลัมน์ยาวกว่าหน้าต่าง FFT · เพดาน 64 กันไฟล์ยาวหลายชั่วโมงกินเวลาเกิน
    let per_col = if full { ((total / spec_cols as f64 / n_fft as f64).ceil() as usize).clamp(3, 64) } else { 3 };
    let mut an = Analyzer::new(ch, track.rate, total, cols, n_fft, spec_cols, per_col);
    let mut feed = |f: &[f32]| an.push(f);
    let Some(_) = decode(tools, path, track.index, ch, Some(t0.max(0.0)), Some(len), false, &mut feed, stop)? else { return Ok(None) };
    Ok(Some(Window { t0, t1, cols, env: an.env(), bins, spec: an.spec(if log { Scale::Log } else { Scale::Lin }, bins, None) }))
}

/// ความถี่เฉลี่ยของช่วง · series = ชุดของช่องที่เอามารวมกันต่อเส้น · size ขนาด FFT
/// ms = คู่ช่องซ้ายขวา ได้เส้นเพิ่มท้าย 2 เส้น กลาง (ซ้าย+ขวา)÷2 กับ ข้าง (ซ้าย−ขวา)÷2 รวมเสียงก่อนคิด ไม่ใช่เฉลี่ยกำลัง
/// (พี่กันส่งภาพ SpectrumAnalyzer 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
#[allow(clippy::too_many_arguments)]
pub fn psd(tools: &Path, path: &Path, track: &GTrack, t0: f64, t1: f64, series: &[Vec<usize>], ms: Option<[usize; 2]>, size: usize, stop: &dyn Fn() -> bool) -> Result<Option<Psd>, String> {
    let ch = track.names.len();
    let size = size.clamp(256, 65536).next_power_of_two();
    let len = (t1 - t0).max(0.05);
    let total_frames = (len * track.rate as f64) as u64;
    let hop = size / 2;
    // ช่วงยาวมาก คิดแค่ราว 3,000 ครั้ง กระจายเท่า ๆ กัน
    let hops = (total_frames / hop as u64).max(1);
    let every = (hops / 3000).max(1);
    let mut ring = vec![vec![0.0f32; size]; ch];
    let mut pos = 0usize;
    let mut frame = 0u64;
    let mut sp = Spectrum::new(size);
    let mut tmp = vec![0.0f32; size];
    let mut one = vec![0.0f32; size / 2];
    let ms = ms.filter(|[a, b]| *a < ch && *b < ch && a != b);
    let mut acc = vec![vec![0.0f32; size / 2]; series.len() + if ms.is_some() { 2 } else { 0 }];
    let mut count = 0u32;
    let mut hop_i = 0u64;
    let mut feed = |f: &[f32]| {
        for i in 0..ch { ring[i][pos] = if f[i].is_finite() { f[i] } else { 0.0 }; }
        pos = (pos + 1) % size;
        frame += 1;
        if frame as usize >= size && frame % hop as u64 == 0 {
            if hop_i % every == 0 {
                for (si, chans) in series.iter().enumerate() {
                    for &c in chans {
                        if c >= ch { continue; }
                        for j in 0..size { tmp[j] = ring[c][(pos + j) % size]; }
                        one.iter_mut().for_each(|v| *v = 0.0);
                        sp.add_power(&tmp, &mut one);
                        let w = 1.0 / chans.len() as f32;
                        for (a, o) in acc[si].iter_mut().zip(&one) { *a += o * w; }
                    }
                }
                if let Some([a, b]) = ms {
                    for (k, sign) in [(0usize, 1.0f32), (1, -1.0)] {
                        for j in 0..size { let i = (pos + j) % size; tmp[j] = (ring[a][i] + sign * ring[b][i]) * 0.5; }
                        one.iter_mut().for_each(|v| *v = 0.0);
                        sp.add_power(&tmp, &mut one);
                        for (x, o) in acc[series.len() + k].iter_mut().zip(&one) { *x += o; }
                    }
                }
                count += 1;
            }
            hop_i += 1;
        }
    };
    let Some(_) = decode(tools, path, track.index, ch, Some(t0.max(0.0)), Some(len), false, &mut feed, stop)? else { return Ok(None) };
    let n = count.max(1) as f32;
    Ok(Some(Psd { size, rate: track.rate, db: acc.iter().map(|a| a.iter().map(|&p| (db(p / n) * 10.0).round() / 10.0).collect()).collect() }))
}

fn track_of(g: &GInfo, track: usize) -> Result<GTrack, String> {
    g.tracks.get(track).cloned().ok_or_else(|| "ไม่มีแทร็กเสียงนี้".to_string())
}

#[tauri::command]
pub async fn graph_info(app: AppHandle, path: String) -> Result<GInfo, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        if !p.exists() { return Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string()); }
        info(&tools, p)
    }).await.map_err(|e| e.to_string())?
}

fn exist_list(paths: &[String]) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

/// รายการเปิดล่าสุดถามว่าไฟล์ยังอยู่ไหม บอกคนใช้ได้ตั้งแต่ก่อนกด (พี่กันเคาะ 9 พ.ย. 2569)
/// ไฟล์บนไดรฟ์ที่ถอดออกหรือไดรฟ์เครือข่ายตอบช้าได้ จึงทำนอกเธรดหลัก
#[tauri::command]
pub async fn graph_exist(paths: Vec<String>) -> Result<Vec<bool>, String> {
    tauri::async_runtime::spawn_blocking(move || exist_list(&paths)).await.map_err(|e| e.to_string())
}

/// ภาพรวมทั้งเรื่อง · ส่งความคืบหน้าทางเหตุการณ์ graph-progress · None = กดหยุด
#[tauri::command]
pub async fn graph_overview(app: AppHandle, path: String, track: usize) -> Result<Option<Overview>, String> {
    let tools = tools_dir(&app)?;
    let key = cache_key(Path::new(&path), track);
    if let Some(o) = OVERVIEWS.get_or_init(Default::default).lock().unwrap().get(&key) {
        return Ok(Some((**o).clone()));
    }
    // ผลที่เก็บไว้ในเครื่องจากครั้งก่อน (ปิดเปิดโปรแกรมแล้วก็ยังใช้ได้)
    let dir = cache_dir(&app);
    if let Some(d) = dir.clone() {
        let k = key.clone();
        if let Ok(Some(o)) = tauri::async_runtime::spawn_blocking(move || disk_load(&d, &k)).await {
            OVERVIEWS.get_or_init(Default::default).lock().unwrap().insert(key, Arc::new(o.clone()));
            return Ok(Some(o));
        }
    }
    let my_gen = OVERVIEW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let jobs = app.state::<Arc<Jobs>>().inner().clone();
    let app2 = app.clone();
    let res = tauri::async_runtime::spawn_blocking(move || {
        let _guard = jobs.start();
        let p = Path::new(&path);
        let g = info(&tools, p)?;
        let t = track_of(&g, track)?;
        let on = |pct: f64| { let _ = app2.emit("graph-progress", json!({ "path": path, "track": track, "percent": pct })); };
        let stop = || OVERVIEW_GEN.load(Ordering::SeqCst) != my_gen || jobs.cancelled();
        overview(&tools, p, &t, g.duration, &on, &stop)
    }).await.map_err(|e| e.to_string())??;
    if let Some(o) = &res {
        OVERVIEWS.get_or_init(Default::default).lock().unwrap().insert(key.clone(), Arc::new(o.clone()));
        // อ่านไม่ครบเพราะไฟล์ขาดท้ายก็เก็บ (ผลเหมือนเดิมทุกครั้ง) · ไฟล์เปลี่ยนแล้วชื่อไม่ตรงเอง
        if let Some(d) = dir {
            let o = o.clone();
            tauri::async_runtime::spawn_blocking(move || disk_save(&d, &key, &o, CACHE_LIMIT));
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn graph_cancel() {
    OVERVIEW_GEN.fetch_add(1, Ordering::SeqCst);
    WINDOW_GEN.fetch_add(1, Ordering::SeqCst);
}

/// ช่วงที่ซูม · คำขอใหม่ทำให้คำขอเก่าที่ยังอ่านอยู่หยุดเอง (เลื่อนซูมเร็ว ๆ ไม่ค้าง) · None = มีคำขอใหม่แทน
#[tauri::command]
pub async fn graph_window(app: AppHandle, path: String, track: usize, t0: f64, t1: f64, cols: usize, bins: usize, log: bool, full: Option<bool>) -> Result<Option<Window>, String> {
    let tools = tools_dir(&app)?;
    let my_gen = WINDOW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        let g = info(&tools, p)?;
        let t = track_of(&g, track)?;
        let stop = || WINDOW_GEN.load(Ordering::SeqCst) != my_gen;
        window_read(&tools, p, &t, t0, t1, cols, bins.clamp(16, 512), log, full.unwrap_or(false), &stop)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn graph_psd(app: AppHandle, path: String, track: usize, t0: f64, t1: f64, series: Vec<Vec<usize>>, size: usize, ms: Option<Vec<usize>>) -> Result<Option<Psd>, String> {
    let ms = ms.and_then(|v| (v.len() == 2).then(|| [v[0], v[1]]));
    let tools = tools_dir(&app)?;
    // คำขอใหม่ (เลือกช่วงใหม่ หรือกดหยุด) ทำให้คำขอเก่าหยุดเอง เหมือนช่วงที่ซูม
    let my_gen = WINDOW_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || {
        let p = Path::new(&path);
        let g = info(&tools, p)?;
        let t = track_of(&g, track)?;
        let stop = || WINDOW_GEN.load(Ordering::SeqCst) != my_gen;
        psd(&tools, p, &t, t0, t1, &series, ms, size, &stop)
    }).await.map_err(|e| e.to_string())?
}

pub(crate) fn unb64(s: &str) -> Result<Vec<u8>, String> {
    let val = |c: u8| -> Option<u32> {
        match c { b'A'..=b'Z' => Some((c - b'A') as u32), b'a'..=b'z' => Some((c - b'a' + 26) as u32), b'0'..=b'9' => Some((c - b'0' + 52) as u32), b'+' => Some(62), b'/' => Some(63), _ => None }
    };
    let clean: Vec<u8> = s.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=').collect();
    let mut out = Vec::with_capacity(clean.len() * 3 / 4);
    for ch in clean.chunks(4) {
        let mut v = 0u32;
        for (i, &c) in ch.iter().enumerate() { v |= val(c).ok_or("ข้อมูลรูปเพี้ยน")? << (18 - 6 * i); }
        out.push((v >> 16) as u8);
        if ch.len() > 2 { out.push((v >> 8) as u8); }
        if ch.len() > 3 { out.push(v as u8); }
    }
    Ok(out)
}

/// บันทึกรูปกราฟ (PNG แบบ base64) หรือตาราง (ข้อความ) · ชื่อซ้ำไม่เขียนทับ ต่อท้าย (2) (3) · คืนที่อยู่ที่บันทึกจริง
#[tauri::command]
pub fn graph_save(path: String, b64: Option<String>, text: Option<String>) -> Result<String, String> {
    let data = match (b64, text) {
        (Some(b), _) => unb64(b.split(',').next_back().unwrap_or(""))?,
        (None, Some(t)) => format!("\u{feff}{t}").into_bytes(), // BOM ให้ Excel อ่านภาษาไทยถูก
        _ => return Err("ไม่มีข้อมูลที่จะบันทึก".into()),
    };
    write_unique(Path::new(&path), &data)
}

/// เขียนไฟล์ใหม่ ชื่อชนต่อท้าย (2) ไม่เขียนทับ · คืนที่อยู่จริง
pub(crate) fn write_unique(want: &Path, data: &[u8]) -> Result<String, String> {
    let stem = want.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "กราฟเสียง".into());
    let ext = want.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let dir = want.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let mut target = want.to_path_buf();
    let mut i = 2;
    while target.exists() {
        target = dir.join(format!("{stem} ({i}){ext}"));
        i += 1;
    }
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| format!("บันทึกไม่ได้: {e}"))?;
    std::io::Write::write_all(&mut f, data).map_err(|e| format!("บันทึกไม่ได้: {e}"))?;
    Ok(target.display().to_string())
}

mod cache;
pub use cache::*;

mod decode;
pub(crate) use decode::*;

mod dsp;
pub use dsp::*;

#[cfg(test)]
mod tests;
