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

use crate::jobs::Jobs;
use crate::tools::{exit_text, run_tool_timeout, tool_succeeded, tools_dir};

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
                    "" => crate::probe::layout(ch as u64),
                    l => l.split('(').next().unwrap_or(l).to_string(),
                };
                let bits = num::<u32>(st, "bits_per_raw_sample").filter(|b| *b > 0).or(num::<u32>(st, "bits_per_sample").filter(|b| *b > 0));
                tracks.push(GTrack {
                    index: tracks.len(),
                    codec: crate::probe::audio_name(st["codec_name"].as_str().unwrap_or(""), st["profile"].as_str().unwrap_or("")),
                    layout: short,
                    names: layout_names(lay, ch),
                    lang: crate::probe::lang_th(st["tags"]["language"].as_str().unwrap_or("")),
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
        let msg = String::from_utf8_lossy(&out.stderr);
        return Err(format!("อ่านไฟล์ไม่ได้ (รหัส {}) {}", exit_text(&out.status), msg.lines().last().unwrap_or("").trim()));
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))?;
    let g = parse_info(&j);
    if g.tracks.is_empty() {
        return Err("ไฟล์นี้ไม่มีแทร็กเสียง".into());
    }
    Ok(g)
}

// ---------- FFT ----------

/// FFT แบบ radix-2 ในที่ · ความยาวต้องเป็นกำลังของ 2
pub fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f64::consts::PI / len as f64;
        let (wr, wi) = (ang.cos(), ang.sin());
        let half = len / 2;
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0f64, 0.0f64);
            for k in 0..half {
                let (a, b) = (start + k, start + k + half);
                let (br, bi) = (re[b] as f64 * cr - im[b] as f64 * ci, re[b] as f64 * ci + im[b] as f64 * cr);
                let (ar, ai) = (re[a] as f64, im[a] as f64);
                re[a] = (ar + br) as f32;
                im[a] = (ai + bi) as f32;
                re[b] = (ar - br) as f32;
                im[b] = (ai - bi) as f32;
                let ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
        len <<= 1;
    }
}

/// ตัวคิดกำลังเสียงแต่ละความถี่ ใช้หน้าต่าง Hann · ผลเป็นกำลังที่หารให้คลื่นไซน์เต็มสเกลได้ 1 (0 dB)
struct Spectrum {
    n: usize,
    win: Vec<f32>,
    re: Vec<f32>,
    im: Vec<f32>,
    norm: f32,
}

impl Spectrum {
    fn new(n: usize) -> Self {
        let win = (0..n).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos()).collect();
        Spectrum { n, win, re: vec![0.0; n], im: vec![0.0; n], norm: (n as f32 / 4.0).powi(2) }
    }
    /// ใส่ตัวอย่างเสียง n ตัว (−1 ถึง 1) บวกกำลังของแต่ละช่องความถี่ลง out (ยาว n/2)
    fn add_power(&mut self, samples: &[f32], out: &mut [f32]) {
        for i in 0..self.n {
            self.re[i] = samples[i] * self.win[i];
            self.im[i] = 0.0;
        }
        fft(&mut self.re, &mut self.im);
        for (k, o) in out.iter_mut().enumerate().take(self.n / 2) {
            *o += (self.re[k] * self.re[k] + self.im[k] * self.im[k]) / self.norm;
        }
    }
}

fn db(p: f32) -> f32 {
    if p <= 1e-14 { -140.0 } else { 10.0 * p.log10() }
}

/// dB −120 ถึง 0 เป็นเลข 0–255 ไว้ส่งแบบย่อ
fn q8(d: f32) -> u8 {
    (((d + 120.0) / 120.0) * 255.0).round().clamp(0.0, 255.0) as u8
}

pub(crate) fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let v = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(T[(v >> 18) as usize & 63] as char);
        s.push(T[(v >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { T[(v >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { T[v as usize & 63] as char } else { '=' });
    }
    s
}

// ---------- ตัวคิดระหว่างอ่าน ----------

/// ความถี่ที่ส่งให้หน้าจอ · Lin ช่องเท่ากัน 0 ถึงครึ่งอัตราสุ่ม (แบบวิเคราะห์) · Log ช่วง 20 Hz ขึ้นไปแบบล็อก (แถบความถี่ทุกช่อง)
#[derive(Clone, Copy, PartialEq)]
enum Scale {
    Lin,
    Log,
}

/// เท่ากับค่าเดิมตอนอ่าน 16 bit · เสียงแตกที่ 32767/32768 · เงียบต่ำกว่า 10/32768 ราว −70 dBFS
const CLIP_LEVEL: f32 = 32767.0 / 32768.0;
const SILENCE_LEVEL: f32 = 10.0 / 32768.0;

struct Analyzer {
    ch: usize,
    rate: u32,
    total: f64,
    frame: u64,
    cols: usize,
    env_max: Vec<f32>,
    env_min: Vec<f32>,
    env_sq: Vec<f64>,
    env_n: Vec<u32>,
    // ความถี่
    n_fft: usize,
    spec_cols: usize,
    caps: Vec<(u64, usize)>,
    cap_i: usize,
    ring: Vec<Vec<f32>>,
    ring_pos: usize,
    acc: Vec<Vec<f32>>,
    acc_n: Vec<u32>,
    spectrum: Spectrum,
    tmp: Vec<f32>,
    // สรุปทั้งเรื่อง
    peak: Vec<f32>,
    sq: Vec<f64>,
    clips: Vec<u32>,
    clip_run: Vec<u32>,
    block: usize,
    block_n: usize,
    block_max: f32,
    sil_start: Option<u64>,
    silences: Vec<(u64, u64)>,
}

impl Analyzer {
    fn new(ch: usize, rate: u32, total: f64, cols: usize, n_fft: usize, spec_cols: usize, per_col: usize) -> Self {
        let mut caps = Vec::with_capacity(spec_cols * per_col);
        for s in 0..spec_cols {
            for k in 0..per_col {
                let pos = (s as f64 + (k as f64 + 0.5) / per_col as f64) * total / spec_cols as f64;
                caps.push((pos.max(0.0) as u64, s));
            }
        }
        Analyzer {
            ch, rate, total, frame: 0, cols,
            env_max: vec![f32::NEG_INFINITY; ch * cols], env_min: vec![f32::INFINITY; ch * cols], env_sq: vec![0.0; ch * cols], env_n: vec![0; cols],
            n_fft, spec_cols, caps, cap_i: 0,
            ring: vec![vec![0.0; n_fft]; ch], ring_pos: 0,
            acc: vec![vec![0.0; spec_cols * (n_fft / 2)]; ch], acc_n: vec![0; spec_cols],
            spectrum: Spectrum::new(n_fft), tmp: vec![0.0; n_fft],
            peak: vec![0.0; ch], sq: vec![0.0; ch], clips: vec![0; ch], clip_run: vec![0; ch],
            block: (rate as usize / 10).max(1), block_n: 0, block_max: 0.0, sil_start: None, silences: Vec::new(),
        }
    }

    /// รับเสียงทศนิยมช่วง ±1 · รูปคลื่น ยอด กับนับเสียงแตก ตัดที่ ±1 เหมือนเดิม · ความถี่ใช้ค่าจริง เสียงเบามากในไฟล์ 24 bit จึงไม่หาย (พี่กันสั่ง 9 พ.ย. 2569)
    fn push(&mut self, f: &[f32]) {
        let c = ((self.frame as f64 * self.cols as f64 / self.total.max(1.0)) as usize).min(self.cols - 1);
        let mut fmax = 0.0f32;
        for (i, &raw) in f.iter().enumerate().take(self.ch) {
            let raw = if raw.is_finite() { raw } else { 0.0 };
            let s = raw.clamp(-1.0, 1.0);
            let k = i * self.cols + c;
            if s > self.env_max[k] { self.env_max[k] = s; }
            if s < self.env_min[k] { self.env_min[k] = s; }
            let x = s as f64;
            self.env_sq[k] += x * x;
            self.sq[i] += x * x;
            let a = s.abs();
            if a > self.peak[i] { self.peak[i] = a; }
            if a > fmax { fmax = a; }
            if a >= CLIP_LEVEL {
                self.clip_run[i] += 1;
                if self.clip_run[i] == 3 { self.clips[i] += 1; }
            } else {
                self.clip_run[i] = 0;
            }
            self.ring[i][self.ring_pos] = raw;
        }
        self.env_n[c] += 1;
        self.ring_pos = (self.ring_pos + 1) % self.n_fft;
        // ช่วงเงียบ ทุกช่องเบากว่า −70 dBFS ทีละ 0.1 วินาที
        self.block_max = self.block_max.max(fmax);
        self.block_n += 1;
        if self.block_n == self.block {
            let start = self.frame + 1 - self.block as u64;
            if self.block_max < SILENCE_LEVEL {
                if self.sil_start.is_none() { self.sil_start = Some(start); }
            } else if let Some(s) = self.sil_start.take() {
                self.silences.push((s, start));
            }
            self.block_n = 0;
            self.block_max = 0.0;
        }
        self.frame += 1;
        while self.cap_i < self.caps.len() && self.frame >= self.caps[self.cap_i].0 {
            let col = self.caps[self.cap_i].1;
            if self.frame as usize >= self.n_fft {
                let half = self.n_fft / 2;
                for i in 0..self.ch {
                    for j in 0..self.n_fft {
                        self.tmp[j] = self.ring[i][(self.ring_pos + j) % self.n_fft];
                    }
                    let out = &mut self.acc[i][col * half..(col + 1) * half];
                    self.spectrum.add_power(&self.tmp, out);
                }
                self.acc_n[col] += 1;
            }
            self.cap_i += 1;
        }
    }

    /// รูปคลื่นต่อช่อง · ทีละคอลัมน์ 3 ค่า ยอดบน ยอดล่าง (−1 ถึง 1) และความดังเฉลี่ย RMS
    fn env(&self) -> Vec<Vec<f32>> {
        (0..self.ch).map(|i| {
            let mut v = Vec::with_capacity(self.cols * 3);
            for c in 0..self.cols {
                let k = i * self.cols + c;
                let n = self.env_n[c];
                if n == 0 {
                    v.extend([0.0, 0.0, 0.0]);
                } else {
                    v.push(self.env_max[k]);
                    v.push(self.env_min[k]);
                    v.push((self.env_sq[k] / n as f64).sqrt() as f32);
                }
            }
            v
        }).collect()
    }

    /// ความถี่ต่อช่อง แบบย่อเป็นเลข 0–255 (−120 ถึง 0 dB) · bins ช่องต่อคอลัมน์
    fn spec(&self, scale: Scale, bins: usize, chans: Option<&[usize]>) -> Vec<String> {
        let half = self.n_fft / 2;
        let nyq = self.rate as f32 / 2.0;
        let df = nyq / half as f32;
        let list: Vec<usize> = chans.map(|c| c.to_vec()).unwrap_or_else(|| (0..self.ch).collect());
        list.iter().map(|&i| {
            let mut out = vec![0u8; self.spec_cols * bins];
            for c in 0..self.spec_cols {
                let n = self.acc_n[c].max(1) as f32;
                let col = &self.acc[i][c * half..(c + 1) * half];
                for b in 0..bins {
                    let p = match scale {
                        Scale::Lin => {
                            let (lo, hi) = (b * half / bins, ((b + 1) * half / bins).max(b * half / bins + 1));
                            col[lo..hi.min(half)].iter().copied().fold(0.0f32, f32::max)
                        }
                        Scale::Log => {
                            let f0 = 20.0 * (nyq / 20.0).powf(b as f32 / bins as f32);
                            let f1 = 20.0 * (nyq / 20.0).powf((b + 1) as f32 / bins as f32);
                            let (lo, hi) = ((f0 / df).ceil() as usize, (f1 / df).floor() as usize);
                            if hi >= lo && lo < half {
                                col[lo..=hi.min(half - 1)].iter().copied().fold(0.0f32, f32::max)
                            } else {
                                col[(((f0 + f1) / 2.0) / df).round().min((half - 1) as f32) as usize]
                            }
                        }
                    };
                    out[c * bins + b] = if self.acc_n[c] == 0 { 0 } else { q8(db(p / n)) };
                }
            }
            b64(&out)
        }).collect()
    }

    /// ช่วงเงียบผิดปกติ ไม่นับ 2 วินาทีแรกกับ 2 วินาทีท้าย · ยาวอย่างน้อย 1 วินาที · หน่วยวินาทีนับจาก start
    fn silences(&self, start: f64) -> Vec<[f64; 2]> {
        let r = self.rate as f64;
        let mut all = self.silences.clone();
        if let Some(s) = self.sil_start { all.push((s, self.frame)); }
        all.into_iter()
            .filter(|(a, b)| (b - a) as f64 >= r && *a as f64 > 2.0 * r && (*b as f64) < self.frame as f64 - 2.0 * r)
            .map(|(a, b)| [start + a as f64 / r, start + b as f64 / r])
            .collect()
    }
}

// ---------- ถอดเสียงด้วย ffmpeg ----------

struct Run {
    /// ข้อความผิดพลาดท้าย ๆ ไว้บอกตอนอ่านไม่ได้
    tail: Vec<String>,
    /// ความดังทุก 0.1 วินาที (เวลา, Momentary LUFS) และสรุป
    loud: Vec<(f64, f64)>,
    integrated: Option<f64>,
    lra: Option<f64>,
    true_peak: Option<f64>,
}

fn after_num(l: &str, key: &str) -> Option<f64> {
    let i = l.find(key)? + key.len();
    let s: String = l[i..].trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    s.parse().ok()
}

/// เปิด ffmpeg ถอดแทร็ก แล้วป้อนตัวเลขทีละเฟรม (ทุกช่องของเวลาเดียวกัน) · stop คืน true = หยุด · คืน None ถ้าโดนหยุด
#[allow(clippy::too_many_arguments)]
fn decode(tools: &Path, path: &Path, track: usize, ch: usize, start: Option<f64>, len: Option<f64>, loudness: bool,
          feed: &mut dyn FnMut(&[f32]), stop: &dyn Fn() -> bool) -> Result<Option<Run>, String> {
    let mut args: Vec<OsString> = vec!["-nostdin".into(), "-hide_banner".into(), "-nostats".into(), "-v".into(), (if loudness { "info" } else { "error" }).into()];
    // เวลาเริ่มกับความยาวส่งทศนิยม 6 หลัก (ไมโครวินาที) · เดิม 3 หลัก ซูมลึกแล้วภาพคลาดจากเวลาบนแกนได้ถึงครึ่งมิลลิวินาที
    // (เทียบกับเสียงที่ถอดแยกด้วย ffmpeg พบเลื่อน 18 ตัวอย่างที่ 44.1 kHz · พี่กันถาม 11 พ.ย. 2569 "มันคือกราฟเสียงจริงไหม ไม่ได้ใช่มโนเนอะ")
    if let Some(s) = start { args.extend(["-ss".into(), format!("{s:.6}").into()]); }
    args.extend(["-i".into(), path.into()]);
    if let Some(l) = len { args.extend(["-t".into(), format!("{l:.6}").into()]); }
    if loudness {
        args.extend([
            "-filter_complex".into(), format!("[0:a:{track}]asplit=2[p][l];[l]ebur128=peak=true[e]").into(),
            "-map".into(), "[p]".into(), "-f".into(), "f32le".into(), "-c:a".into(), "pcm_f32le".into(), "pipe:1".into(),
            "-map".into(), "[e]".into(), "-f".into(), "null".into(), "-".into(),
        ]);
    } else {
        args.extend(["-map".into(), format!("0:a:{track}").into(), "-f".into(), "f32le".into(), "-c:a".into(), "pcm_f32le".into(), "pipe:1".into()]);
    }
    let mut child = crate::tools::tool_command(tools, "ffmpeg", &args).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let err = child.stderr.take().unwrap();
    let state = Arc::new(Mutex::new(Run { tail: Vec::new(), loud: Vec::new(), integrated: None, lra: None, true_peak: None }));
    let st = state.clone();
    let reader = std::thread::spawn(move || {
        let mut summary = false;
        for l in BufReader::new(err).lines().map_while(Result::ok) {
            let mut g = st.lock().unwrap();
            if l.contains("Parsed_ebur128") && l.contains(" t:") {
                if let (Some(t), Some(m)) = (after_num(&l, " t:"), after_num(&l, " M:")) { g.loud.push((t, m)); }
                continue;
            }
            if l.contains("Summary:") { summary = true; continue; }
            let t = l.trim();
            if summary {
                if t.starts_with("I:") { g.integrated = after_num(t, "I:"); }
                else if t.starts_with("LRA:") { g.lra = after_num(t, "LRA:"); }
                else if t.starts_with("Peak:") { g.true_peak = after_num(t, "Peak:"); }
                continue;
            }
            if !t.is_empty() && !t.starts_with('[') || t.contains("rror") {
                g.tail.push(t.to_string());
                if g.tail.len() > 8 { g.tail.remove(0); }
            }
        }
    });
    let mut out = child.stdout.take().unwrap();
    let mut buf = vec![0u8; 1 << 16];
    let mut carry: Vec<u8> = Vec::new();
    let frame_bytes = ch * 4;
    let mut frame = vec![0f32; ch];
    let mut stopped = false;
    loop {
        if stop() { stopped = true; let _ = child.kill(); break; }
        let n = match out.read(&mut buf) { Ok(0) => break, Ok(n) => n, Err(_) => break };
        carry.extend_from_slice(&buf[..n]);
        let whole = carry.len() / frame_bytes * frame_bytes;
        for fb in carry[..whole].chunks_exact(frame_bytes) {
            for (i, s) in frame.iter_mut().enumerate() { *s = f32::from_le_bytes([fb[i * 4], fb[i * 4 + 1], fb[i * 4 + 2], fb[i * 4 + 3]]); }
            feed(&frame);
        }
        carry.drain(..whole);
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = reader.join();
    if stopped { return Ok(None); }
    let run = std::mem::replace(&mut *state.lock().unwrap(), Run { tail: Vec::new(), loud: Vec::new(), integrated: None, lra: None, true_peak: None });
    if !tool_succeeded("ffmpeg", &status) && run.loud.is_empty() {
        return Err(format!("ffmpeg อ่านเสียงไม่ได้ · {}", run.tail.last().cloned().unwrap_or_else(|| format!("รหัส {}", exit_text(&status)))));
    }
    Ok(Some(run))
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

/* ---------- เก็บผลภาพรวมลงเครื่อง (คิว 8) ----------
   พี่กัน 7 พ.ย. 2569 *"ไฟล์ไหนที่แปลงคลื่นเเล้ว มันต้องรันใหม่ทุกครั้งเลยไหม มันเเบบรันครั้เดียวเเล้วดูตลอดได้มั้ย เเบบบันทึกข้อมูลไว้นเครื่องี้"*
   เดิมจำไว้ในหน่วยความจำอย่างเดียว ปิดโปรแกรมแล้วต้องอ่านใหม่ (หนัง 20 นาที 5.1 ราว 14 วินาที)
   ไฟล์ละหนึ่งไฟล์ในโฟลเดอร์ graphcache ของโปรแกรม ชื่อจาก hash ของที่อยู่ แทร็ก ขนาด เวลาแก้ไฟล์ · ไฟล์หนังเปลี่ยนแล้วชื่อไม่ตรง ไม่ใช้ผลเก่า
   รวมกันเกิน 300 MB ลบอันที่ไม่ได้ใช้นานที่สุดก่อน · หน้าตั้งค่าบอกขนาดและล้างได้ */
const CACHE_VER: u32 = 2;
const CACHE_LIMIT: u64 = 300 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct Cached {
    ver: u32,
    key: String,
    o: Overview,
}

fn cache_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join("graphcache"))
}

fn cache_file(dir: &Path, key: &str) -> std::path::PathBuf {
    let h = Sha256::digest(key.as_bytes());
    dir.join(format!("{}.json", h.iter().take(16).map(|b| format!("{b:02x}")).collect::<String>()))
}

/// อ่านผลที่เก็บไว้ · ชื่อไม่ตรง รุ่นไม่ตรง หรือไฟล์เสีย = ไม่มี (อ่านเสียงใหม่ตามปกติ) · อ่านได้แตะเวลาไฟล์ ไว้ลบอันที่ไม่ได้ใช้นานก่อน
fn disk_load(dir: &Path, key: &str) -> Option<Overview> {
    let f = cache_file(dir, key);
    let c: Cached = serde_json::from_slice(&std::fs::read(&f).ok()?).ok()?;
    if c.ver != CACHE_VER || c.key != key { return None; }
    let _ = std::fs::File::options().write(true).open(&f).and_then(|h| h.set_modified(std::time::SystemTime::now()));
    Some(c.o)
}

/// เขียนแบบไฟล์ชั่วคราวแล้วเปลี่ยนชื่อ ปิดโปรแกรมกลางทางไม่ได้ไฟล์ครึ่ง ๆ · แล้วตัดให้รวมไม่เกินขนาดที่กำหนด
fn disk_save(dir: &Path, key: &str, o: &Overview, limit: u64) {
    if std::fs::create_dir_all(dir).is_err() { return; }
    let f = cache_file(dir, key);
    let tmp = f.with_extension("tmp");
    let Ok(bytes) = serde_json::to_vec(&Cached { ver: CACHE_VER, key: key.to_string(), o: o.clone() }) else { return };
    if std::fs::write(&tmp, &bytes).is_ok() && std::fs::rename(&tmp, &f).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    prune(dir, limit);
}

/// รวมเกินขนาด ลบไฟล์ที่ใช้ล่าสุดนานที่สุดก่อน · ลบเฉพาะไฟล์ .json ในโฟลเดอร์ของโปรแกรมเอง
fn prune(dir: &Path, limit: u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, u64, std::path::PathBuf)> = rd.flatten()
        .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
        .filter_map(|e| { let m = e.metadata().ok()?; Some((m.modified().ok()?, m.len(), e.path())) }).collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.0);
    for (_, len, p) in files {
        if total <= limit { break; }
        if std::fs::remove_file(&p).is_ok() { total -= len; }
    }
}

/// จำนวนไฟล์กับขนาดรวมของผลที่เก็บไว้ · หน้าตั้งค่าใช้
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo { files: u32, bytes: u64 }

fn cache_info_in(dir: &Path) -> CacheInfo {
    let mut ci = CacheInfo { files: 0, bytes: 0 };
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten().filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false)) {
            ci.files += 1;
            ci.bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    ci
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
    let mut last = Instant::now();
    let mut feed = |f: &[f32]| {
        an.push(f);
        if an.frame % 4096 == 0 && last.elapsed() >= Duration::from_millis(100) {
            on((an.frame as f64 / total * 100.0).min(99.0));
            last = Instant::now();
        }
    };
    let Some(run) = decode(tools, path, track.index, ch, None, None, true, &mut feed, stop)? else { return Ok(None) };
    if an.frame == 0 {
        return Err(format!("อ่านเสียงไม่ได้ · {}", run.tail.last().cloned().unwrap_or_default()));
    }
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
        if !p.exists() { return Err("หาไฟล์ไม่เจอ · ไดรฟ์อาจถอดออกอยู่".to_string()); }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn exist_list_keeps_order_and_marks_missing() {
        let here = concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml").to_string();
        let lost = concat!(env!("CARGO_MANIFEST_DIR"), "/ไม่มีไฟล์นี้.mkv").to_string();
        assert_eq!(exist_list(&[here.clone(), lost.clone(), here]), vec![true, false, true]);
        assert!(exist_list(&[]).is_empty());
    }


    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }
    fn media(name: &str) -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join(name);
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }

    #[test]
    fn fft_finds_a_sine_at_full_scale() {
        // คลื่นไซน์เต็มสเกลที่ช่องความถี่ 64 ของ FFT 1024 ต้องได้ราว 0 dB ที่ช่องนั้น ช่องอื่นต่ำกว่ามาก
        let n = 1024;
        let x: Vec<f32> = (0..n).map(|i| (2.0 * std::f32::consts::PI * 64.0 * i as f32 / n as f32).sin()).collect();
        let mut sp = Spectrum::new(n);
        let mut out = vec![0.0f32; n / 2];
        sp.add_power(&x, &mut out);
        assert!((db(out[64]) - 0.0).abs() < 0.5, "ช่อง 64 ได้ {}", db(out[64]));
        assert!(db(out[200]) < -80.0, "ช่อง 200 ได้ {}", db(out[200]));
    }

    #[test]
    fn channel_names_follow_ffmpeg_order() {
        assert_eq!(layout_names("5.1(side)", 6), ["FL", "FR", "FC", "LFE", "SL", "SR"]);
        assert_eq!(layout_names("7.1", 8), ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"]);
        assert_eq!(layout_names("stereo", 2), ["FL", "FR"]);
        assert_eq!(layout_names("", 1), ["FC"]);
        assert_eq!(layout_names("weird", 3), ["CH1", "CH2", "CH3"]);
    }

    #[test]
    fn base64_matches_known_values() {
        assert_eq!(b64(b"Man"), "TWFu");
        assert_eq!(b64(b"Ma"), "TWE=");
        assert_eq!(b64(b"M"), "TQ==");
        assert_eq!(unb64("TWFu").unwrap(), b"Man");
        assert_eq!(unb64("TWE=").unwrap(), b"Ma");
        assert_eq!(unb64("TQ==").unwrap(), b"M");
    }

    #[test]
    fn save_never_overwrites() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังบันทึก-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("กราฟ.csv");
        let a = graph_save(p.display().to_string(), None, Some("Hz,dB".into())).unwrap();
        let b = graph_save(p.display().to_string(), None, Some("Hz,dB".into())).unwrap();
        let png = graph_save(dir.join("รูป.png").display().to_string(), Some("data:image/png;base64,TWFu".into()), None).unwrap();
        assert!(a.ends_with("กราฟ.csv") && b.ends_with("กราฟ (2).csv"), "{a} · {b}");
        assert_eq!(std::fs::read(&png).unwrap(), b"Man");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_tracks_and_overview_of_test_movie() {
        let Some(f) = media("ดาวเหนือ (2023).mkv") else { return };
        let g = info(&tools(), &f).unwrap();
        assert_eq!(g.tracks.len(), 2, "{:?}", g.tracks);
        assert!(!g.audio_only);
        let t51 = g.tracks.iter().find(|t| t.names.len() == 6).expect("ต้องมีแทร็ก 5.1");
        assert_eq!(t51.layout, "5.1");
        let o = overview(&tools(), &f, t51, g.duration, &|_| {}, &|| false).unwrap().unwrap();
        assert_eq!(o.env.len(), 6);
        assert_eq!(o.env[0].len(), o.cols * 3);
        assert!((o.read_to - g.duration).abs() < 0.5, "อ่านได้ถึง {} ความยาว {}", o.read_to, g.duration);
        assert!(o.integrated.is_some(), "ต้องได้ความดังรวมจาก ebur128");
        assert!(o.peaks.iter().all(|p| *p <= 0.0));
        assert_eq!(o.spec.len(), 6);
        // ไฟล์มีเสียงโทนตลอดเรื่อง เส้นความดังต้องต่อเนื่อง ไม่มีคอลัมน์ตกลง −70 (ไฟล์ 20 วินาที คอลัมน์แคบกว่ารอบค่าของ ebur128)
        let mid = &o.loud[o.cols / 10..o.cols * 9 / 10];
        assert!(mid.iter().all(|v| *v > -40.0), "เส้นความดังมีรู ต่ำสุด {:?}", mid.iter().cloned().fold(f32::MAX, f32::min));
    }

    #[test]
    fn finds_silence_in_the_middle() {
        // สร้างเสียงไซน์ 8 วินาที เงียบวินาที 3 ถึง 5 แล้วต้องเจอช่วงเงียบตรงนั้น (2 วินาทีแรกกับท้ายไม่นับ)
        let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("เงียบกลาง.wav");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", [
            "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
            "-af", "volume='if(between(t,3,5),0,1)':eval=frame", f.to_str().unwrap(),
        ]).unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        let g = info(&tools(), &f).unwrap();
        assert!(g.audio_only);
        let o = overview(&tools(), &f, &g.tracks[0], g.duration, &|_| {}, &|| false).unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(o.silences.len(), 1, "{:?}", o.silences);
        assert!((o.silences[0][0] - 3.0).abs() < 0.2 && (o.silences[0][1] - 5.0).abs() < 0.2, "{:?}", o.silences);
    }

    #[test]
    fn psd_shows_a_peak_at_the_tone() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("ไซน์1000.flac");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let g = info(&tools(), &f).unwrap();
        let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let df = 48000.0 / 4096.0;
        let (imax, _) = p.db[0].iter().enumerate().fold((0, -999.0f32), |m, (i, &v)| if v > m.1 { (i, v) } else { m });
        assert!(((imax as f64 * df) - 1000.0).abs() < df * 1.5, "ยอดอยู่ที่ {} Hz", imax as f64 * df);
    }

    /// ไฟล์ 24 bit เสียงเบามาก −110 dB ต้องเห็นยอดที่ความถี่นั้น · ตอนอ่าน 16 bit ค่านี้ถูกปัดเป็นศูนย์จนหาย
    #[test]
    fn quiet_24bit_tone_is_not_lost() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ24-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("เบามาก.flac");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=3.16e-6*sin(2*PI*1000*t):s=48000:d=3", "-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let g = info(&tools(), &f).unwrap();
        let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
        let o = overview(&tools(), &f, &g.tracks[0], g.duration, &|_| {}, &|| false).unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        let df = 48000.0 / 4096.0;
        let (imax, vmax) = p.db[0].iter().enumerate().fold((0, -999.0f32), |m, (i, &v)| if v > m.1 { (i, v) } else { m });
        assert!(((imax as f64 * df) - 1000.0).abs() < df * 1.5, "ยอดอยู่ที่ {} Hz", imax as f64 * df);
        assert!(vmax > -135.0, "ยอด {vmax} dB");
        assert!(o.peaks[0] > -115.0 && o.peaks[0] < -105.0, "ยอดรวม {:?}", o.peaks);
    }

    /// เก็บผลลงเครื่องแล้วอ่านกลับได้ตรง · ชื่อไม่ตรง (ไฟล์เปลี่ยน) ไม่ใช้ผลเก่า · รวมเกินขนาด ลบอันเก่าสุดก่อน
    #[test]
    fn overview_disk_cache_roundtrip_and_prune() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังแคช-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let o = Overview { duration: 12.5, cols: 2, env: vec![vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6]], spec_cols: 0, spec_bins: 0, spec: vec!["ab".into()], loud: vec![-20.0, -21.0],
            integrated: Some(-14.2), lra: None, true_peak: Some(-0.3), peaks: vec![-0.3], rms: vec![-18.0], clips: vec![0], silences: vec![[1.0, 2.0]], read_to: 12.5 };
        disk_save(&dir, "ก|0|100|1", &o, CACHE_LIMIT);
        let back = disk_load(&dir, "ก|0|100|1").expect("ต้องอ่านกลับได้");
        assert_eq!(serde_json::to_string(&back).unwrap(), serde_json::to_string(&o).unwrap());
        assert!(disk_load(&dir, "ก|0|100|2").is_none(), "เวลาแก้ไฟล์เปลี่ยน ต้องไม่ใช้ผลเก่า");
        std::thread::sleep(Duration::from_millis(20));
        disk_save(&dir, "ข|0|100|1", &o, CACHE_LIMIT);
        let one = std::fs::metadata(cache_file(&dir, "ข|0|100|1")).unwrap().len();
        // จำกัดให้เหลือได้ไฟล์เดียว อันเก่า (ก) ต้องถูกลบ อันใหม่ (ข) อยู่
        prune(&dir, one);
        assert!(disk_load(&dir, "ก|0|100|1").is_none() && disk_load(&dir, "ข|0|100|1").is_some());
        assert_eq!(cache_info_in(&dir).files, 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// ซ้ายขวาเสียงเดียวกันเป๊ะ เส้นกลางมียอดที่ 1000 Hz เส้นข้าง (ซ้าย−ขวา) ต้องเงียบ · ได้ 4 เส้น ซ้าย ขวา กลาง ข้าง
    #[test]
    fn psd_mid_side_of_identical_channels() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ3-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("ไซน์สองข้างเท่ากัน.flac");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", "-ac", "2", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let g = info(&tools(), &f).unwrap();
        let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0], vec![1]], Some([0, 1]), 4096, &|| false).unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(p.db.len(), 4);
        let top = |d: &Vec<f32>| d.iter().cloned().fold(-999.0f32, f32::max);
        let (l, mid, side) = (top(&p.db[0]), top(&p.db[2]), top(&p.db[3]));
        assert!((mid - l).abs() < 1.0, "กลาง {mid} ต้องเท่าซ้าย {l}");
        assert!(side < mid - 60.0, "ข้าง {side} ต้องเบากว่ากลาง {mid} เกิน 60 dB");
    }
}
