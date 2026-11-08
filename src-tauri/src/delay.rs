//! ตัวช่วยหาดีเลย์ (แผนเสียงและซับ ขั้น 5 · มอคอัปหัวข้อ 3)
//! ถอดเสียงเดิมในหนังกับเสียงใหม่เป็นช่องเดียว 8 kHz แล้วเทียบคลื่นเสียงด้วย cross-correlation (FFT) ที่ต้นเรื่อง กลางเรื่อง ท้ายเรื่อง
//! เสียงที่เร็วไม่เท่าหนัง (แผ่นยุโรป 25 fps) เทียบตรง ๆ ไม่ติด · ลองยืดเสียงใหม่ตามคู่ความเร็วที่เจอบ่อยก่อนเทียบ คู่ที่ตรงกันมากสุดคือคำตอบ
//! ค่าดีเลย์ที่ได้คือค่าที่ใส่ให้เสียงใหม่ (mkvmerge --sync) · ติดลบ = เสียงใหม่ต้องมาเร็วขึ้น
//! ลองฟัง 20 วินาที ทำไฟล์ MKV ชั่วคราวช่วงนั้น ภาพจากหนัง เสียงใหม่ใส่ดีเลย์แล้ว เปิดด้วยโปรแกรมเล่นที่ตั้งไว้ · ไฟล์หนังไม่ถูกแก้

use crate::audiograph::fft;
use crate::tools::{run_tool_timeout, tool_succeeded, tools_dir};
use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const FS: f64 = 8000.0;
/// ค่าเลื่อนที่หาได้ไกลสุด ±วินาที
const MARGIN: f64 = 5.0;
/// คู่ความเร็วที่ลอง [จาก, เป็น] · เวลาในไฟล์เสียงใหม่ = เวลาในหนัง × เป็น/จาก
const PAIRS: [[f64; 2]; 4] = [[25.0, 23.976], [23.976, 25.0], [24.0, 23.976], [23.976, 24.0]];

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Win {
    /// เวลาเริ่มของช่วงในหนัง วินาที
    pub at: f64,
    /// ดีเลย์ที่หาได้ในช่วงนี้ ms
    pub delay: f64,
    /// ตรงกันแค่ไหน 0–1
    pub score: f64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    /// ดีเลย์ที่แนะนำ ms (ค่ากลางของสามช่วง)
    pub delay: f64,
    /// ตรงกันแค่ไหน 0–1 (ค่ากลางของสามช่วง)
    pub score: f64,
    pub windows: Vec<Win>,
    /// คู่ความเร็วที่ต้องตั้ง · ไม่มี = เสียงเร็วเท่าหนัง
    pub speed: Option<[f64; 2]>,
    /// เทียบตรง ๆ ไม่ยืด ตรงกันแค่ไหน (ช่วงกลาง)
    pub direct: f64,
    /// ค่าสามช่วงต่างกันเกิน 40 ms ทั้งที่ไม่มีคู่ความเร็วที่ตรง (เสียงอาจถูกตัดต่อ หรือข้ามไปกลางไฟล์ได้ไม่เป๊ะ)
    pub uneven: bool,
}

/// ถอดเสียงช่วงหนึ่งเป็นช่องเดียว 8 kHz
fn decode(tools: &Path, path: &Path, stream: u64, start: f64, len: f64) -> Result<Vec<f32>, String> {
    let args: Vec<OsString> = vec![
        "-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.3}", start.max(0.0)).into(), "-t".into(), format!("{:.3}", len.max(0.1)).into(),
        "-i".into(), path.into(), "-map".into(), format!("0:{stream}").into(), "-vn".into(), "-ac".into(), "1".into(), "-ar".into(), "8000".into(), "-f".into(), "f32le".into(), "-".into(),
    ];
    let o = run_tool_timeout(tools, "ffmpeg", args, Duration::from_secs(180))?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(format!("ถอดเสียงไม่ได้ · {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
    }
    Ok(o.stdout.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect())
}

/// ช่วงของเสียงใหม่ในเวลาของหนัง [t0, t0 + len] ยืดตามความเร็ว s (เวลาในไฟล์ = เวลาในหนัง × s) · ส่วนก่อนต้นไฟล์เป็นเงียบ
fn decode_b(tools: &Path, path: &Path, stream: u64, t0: f64, len: f64, s: f64) -> Result<Vec<f32>, String> {
    let f0 = t0 * s;
    let lead = (-f0).max(0.0);
    let raw = decode(tools, path, stream, f0.max(0.0), len * s - lead + 0.05)?;
    let n = (len * FS) as usize;
    let off = lead * FS;
    let mut out = vec![0f32; n];
    for (j, o) in out.iter_mut().enumerate() {
        let x = j as f64 * s - off;
        if x < 0.0 { continue; }
        let i = x as usize;
        if i + 1 >= raw.len() { break; }
        let f = (x - i as f64) as f32;
        *o = raw[i] * (1.0 - f) + raw[i + 1] * f;
    }
    Ok(out)
}

/// เอาค่าเฉลี่ยออก แล้วเน้นเสียงสูง (pre-emphasis) ให้ยอดของ cross-correlation แหลม
fn prep(x: &mut [f32]) {
    if x.is_empty() { return; }
    let m = x.iter().map(|&v| v as f64).sum::<f64>() / x.len() as f64;
    for v in x.iter_mut() { *v -= m as f32; }
    for i in (1..x.len()).rev() { x[i] -= 0.95 * x[i - 1]; }
}

/// เทียบ a (สั้น) กับทุกตำแหน่งที่ a อยู่ใน b ทั้งท่อน · คืนตำแหน่งในหน่วยตัวอย่าง (ละเอียดกว่าหนึ่งตัวอย่าง) กับคะแนน 0–1
pub fn xcorr(a: &[f32], b: &[f32]) -> Option<(f64, f64)> {
    if a.len() < 64 || b.len() < a.len() { return None; }
    let n = (a.len() + b.len()).next_power_of_two();
    let (mut ar, mut ai) = (vec![0f32; n], vec![0f32; n]);
    let (mut br, mut bi) = (vec![0f32; n], vec![0f32; n]);
    ar[..a.len()].copy_from_slice(a);
    br[..b.len()].copy_from_slice(b);
    fft(&mut ar, &mut ai);
    fft(&mut br, &mut bi);
    // conj(A) × B แล้วถอดกลับ · ได้ r[k] = Σ a[i] b[i + k]
    for i in 0..n {
        let (xr, xi, yr, yi) = (ar[i], -ai[i], br[i], bi[i]);
        ar[i] = xr * yr - xi * yi;
        ai[i] = -(xr * yi + xi * yr);
    }
    fft(&mut ar, &mut ai);
    let ea: f64 = a.iter().map(|&v| (v as f64) * (v as f64)).sum();
    let mut pre = vec![0f64; b.len() + 1];
    for (i, &v) in b.iter().enumerate() { pre[i + 1] = pre[i] + (v as f64) * (v as f64); }
    let last = b.len() - a.len();
    let score = |k: usize| {
        let eb = pre[k + a.len()] - pre[k];
        if ea <= 0.0 || eb <= 0.0 { 0.0 } else { (ar[k] as f64 / n as f64) / (ea * eb).sqrt() }
    };
    let (mut bk, mut bs) = (0usize, f64::MIN);
    for k in 0..=last {
        let s = score(k);
        if s > bs { bs = s; bk = k; }
    }
    // ยอดระหว่างตัวอย่าง จากพาราโบลาสามจุด
    let mut pos = bk as f64;
    if bk > 0 && bk < last {
        let (l, c, r) = (score(bk - 1), bs, score(bk + 1));
        let d = l - 2.0 * c + r;
        if d.abs() > 1e-12 { pos += (0.5 * (l - r) / d).clamp(-0.5, 0.5); }
    }
    Some((pos, bs.max(0.0)))
}

/// ดีเลย์ของช่วงหนึ่ง · เสียงเดิม [p, p + win] · เสียงใหม่ [p − MARGIN, p + win + MARGIN] ยืดตาม s
fn window(tools: &Path, a_path: &Path, a_stream: u64, b_path: &Path, b_stream: u64, p: f64, win: f64, s: f64, a_cache: Option<&[f32]>) -> Result<Win, String> {
    let mut a = match a_cache { Some(x) => x.to_vec(), None => decode(tools, a_path, a_stream, p, win)? };
    let b0 = p - MARGIN;
    let mut b = decode_b(tools, b_path, b_stream, b0, win + 2.0 * MARGIN, s)?;
    prep(&mut a);
    prep(&mut b);
    let (k, score) = xcorr(&a, &b).unwrap_or((MARGIN * FS, 0.0));
    // เสียงใหม่ช้ากว่าหนัง d วินาที = เนื้อเสียงที่เวลา t ในหนัง อยู่ที่ t + d ในเสียงใหม่ · ใส่ดีเลย์ −d
    let d = k / FS - (p - b0);
    Ok(Win { at: p, delay: (-d * 1000.0).round(), score: (score * 100.0).round() / 100.0 })
}

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    if v.is_empty() { 0.0 } else { v[v.len() / 2] }
}

fn duration(tools: &Path, p: &Path) -> Result<f64, String> {
    let j = crate::outfile::ffprobe_json(tools, p).map_err(|e| format!("อ่านไฟล์ไม่ได้ {e}"))?;
    crate::outfile::duration_of(&j).ok_or_else(|| "ไม่รู้ความยาวไฟล์".to_string())
}

/// ตำแหน่งสามช่วง ต้น กลาง ท้าย กับความยาวช่วง
fn spots(dur: f64) -> (Vec<f64>, f64) {
    let win = (dur / 5.0).clamp(4.0, 15.0);
    let p1 = MARGIN.max(dur * 0.08);
    let p2 = (dur / 2.0 - win / 2.0).max(p1);
    let p3 = (dur * 0.9 - win).min(dur - win - MARGIN).max(p2);
    (vec![p1, p2, p3], win)
}

/// หาค่าดีเลย์ของเสียงใหม่เทียบเสียงเดิมในหนัง
pub fn find(tools: &Path, a_path: &Path, a_stream: u64, b_path: &Path, b_stream: u64) -> Result<Found, String> {
    let da = duration(tools, a_path)?;
    let db = duration(tools, b_path)?;
    let dur = da.min(db);
    if dur < 2.0 * MARGIN + 4.0 { return Err("เสียงสั้นเกินไป หาค่าดีเลย์ไม่ได้ (ต้องยาวอย่างน้อย 14 วินาที)".into()); }
    let (ps, win) = spots(dur);
    // ช่วงกลาง ลองทุกความเร็ว · เสียงเดิมถอดครั้งเดียว
    let a_mid = decode(tools, a_path, a_stream, ps[1], win)?;
    let direct = window(tools, a_path, a_stream, b_path, b_stream, ps[1], win, 1.0, Some(&a_mid))?;
    let mut best: (Option<[f64; 2]>, f64) = (None, direct.score);
    for pr in PAIRS {
        let s = pr[1] / pr[0];
        // เสียงใหม่ต้องยาวพอสำหรับช่วงท้าย
        if (ps[2] + win + MARGIN) * s > db + 1.0 { continue; }
        let w = window(tools, a_path, a_stream, b_path, b_stream, ps[1], win, s, Some(&a_mid))?;
        if w.score > best.1 + 0.05 { best = (Some(pr), w.score); }
    }
    let s = best.0.map(|p| p[1] / p[0]).unwrap_or(1.0);
    let mut wins = Vec::new();
    for (i, &p) in ps.iter().enumerate() {
        wins.push(if i == 1 && best.0.is_none() { direct.clone() } else { window(tools, a_path, a_stream, b_path, b_stream, p, win, s, if i == 1 { Some(&a_mid) } else { None })? });
    }
    let ds: Vec<f64> = wins.iter().map(|w| w.delay).collect();
    let spread = ds.iter().cloned().fold(f64::MIN, f64::max) - ds.iter().cloned().fold(f64::MAX, f64::min);
    Ok(Found {
        delay: median(ds),
        score: median(wins.iter().map(|w| w.score).collect()),
        uneven: spread > 40.0,
        windows: wins,
        speed: best.0,
        direct: direct.score,
    })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct View {
    /// ยอดคลื่นเสียงเดิมทีละคอลัมน์ 0–1 ช่วง [at, at + len]
    pub a: Vec<f32>,
    /// ยอดคลื่นเสียงใหม่ ช่วง [at − margin, at + len + margin] ยังไม่ใส่ดีเลย์
    pub b: Vec<f32>,
    /// คอลัมน์ต่อวินาที
    pub cps: f64,
    pub at: f64,
    pub len: f64,
    pub margin: f64,
}

fn peaks(x: &[f32], per: usize) -> Vec<f32> {
    let v: Vec<f32> = x.chunks(per.max(1)).map(|c| c.iter().fold(0f32, |m, &s| m.max(s.abs()))).collect();
    let top = v.iter().cloned().fold(1e-6f32, f32::max);
    v.iter().map(|&p| (p / top * 1000.0).round() / 1000.0).collect()
}

/// คลื่นเสียงสองแทร็กไว้วาดซ้อน · เลื่อนเสียงใหม่บนจอได้ ±margin โดยไม่ต้องถอดใหม่
pub fn view(tools: &Path, a_path: &Path, a_stream: u64, b_path: &Path, b_stream: u64, at: f64, len: f64, margin: f64, speed: Option<[f64; 2]>, cols: usize) -> Result<View, String> {
    let s = speed.map(|p| p[1] / p[0]).unwrap_or(1.0);
    let a = decode(tools, a_path, a_stream, at, len)?;
    let b = decode_b(tools, b_path, b_stream, at - margin, len + 2.0 * margin, s)?;
    let per = ((len * FS) as usize / cols.max(50)).max(1);
    Ok(View { a: peaks(&a, per), b: peaks(&b, per), cps: FS / per as f64, at, len, margin })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    /// ไฟล์ลองฟังในโฟลเดอร์ชั่วคราว
    pub file: String,
    /// ชื่อโปรแกรมเล่น · ว่าง = โปรแกรมหลักของ Windows
    pub player: String,
    /// คำสั่งที่ใช้ทำไฟล์กับคำสั่งเปิด (แสดงในรุ่นทดสอบ)
    pub cmd: String,
    /// เปิดโปรแกรมเล่นแล้วไหม (รุ่นทดสอบสั่งไม่เปิดได้)
    pub opened: bool,
}

fn hms(t: f64) -> String {
    let t = t.max(0.0);
    format!("{:02}:{:02}:{:06.3}", (t / 3600.0) as u64, ((t % 3600.0) / 60.0) as u64, t % 60.0)
}

/// อาร์กิวเมนต์ mkvmerge ของไฟล์ลองฟัง · ภาพจากหนังอย่างเดียว เสียงใหม่ใส่ดีเลย์ ตัดเฉพาะช่วง [at, at + len]
pub fn preview_args(movie: &Path, file: &Path, tid: u64, delay_ms: f64, at: f64, len: f64, out: &Path) -> Vec<OsString> {
    vec![
        "--ui-language".into(), "en".into(), "-q".into(), "-o".into(), out.into(), "--split".into(), format!("parts:{}-{}", hms(at), hms(at + len)).into(),
        "-A".into(), "-S".into(), "-B".into(), "-M".into(), "--no-chapters".into(), "--no-global-tags".into(), movie.into(),
        "-a".into(), tid.to_string().into(), "-D".into(), "-S".into(), "-B".into(), "-M".into(), "--no-chapters".into(), "--no-global-tags".into(),
        "--sync".into(), format!("{tid}:{}", delay_ms.round() as i64).into(), "--default-track-flag".into(), format!("{tid}:1").into(), file.into(),
    ]
}

fn quote(a: &OsString) -> String {
    let s = a.to_string_lossy();
    if s.contains([' ', '(', ')']) { format!("\"{s}\"") } else { s.to_string() }
}

/// ทำไฟล์ลองฟังแล้วเปิด · dry (เฉพาะรุ่นทดสอบ) ทำไฟล์แต่ไม่เปิดโปรแกรมเล่น คืนคำสั่งให้ตัวตรวจ
fn make_preview(app: &AppHandle, movie: &Path, file: &Path, tid: u64, delay_ms: f64, at: f64, dry: bool) -> Result<Preview, String> {
    let tools = tools_dir(app)?;
    let tmp = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("tmp");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    // ไฟล์ลองฟังรอบก่อนลบทิ้ง ไม่ให้สะสมในโฟลเดอร์ชั่วคราว
    if let Ok(rd) = std::fs::read_dir(&tmp) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with("delay-preview-") { let _ = std::fs::remove_file(e.path()); }
        }
    }
    let base = tmp.join(format!("delay-preview-{}.mkv", crate::poster_image::unique()));
    let args = preview_args(movie, file, tid, delay_ms, at, 20.0, &base);
    let o = run_tool_timeout(&tools, "mkvmerge", &args, Duration::from_secs(120))?;
    if !tool_succeeded("mkvmerge", &o.status) {
        return Err(format!("ทำไฟล์ลองฟังไม่ได้ · {}", String::from_utf8_lossy(&o.stdout).lines().filter(|l| l.contains("Error")).last().unwrap_or("")));
    }
    // mkvmerge ตอนตัดช่วงเติมเลขลำดับท้ายชื่อ (-001)
    let stem = base.file_stem().unwrap().to_string_lossy().to_string();
    let made = std::fs::read_dir(&tmp).ok().and_then(|rd| rd.flatten().map(|e| e.path()).find(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with(&stem))))
        .ok_or("ทำไฟล์ลองฟังไม่สำเร็จ หาไฟล์ที่ได้ไม่เจอ")?;
    let mut cmd = format!("mkvmerge {}", args.iter().map(quote).collect::<Vec<_>>().join(" "));
    let player = crate::check::player_for(app, &made)?;
    let name = player.as_ref().and_then(|p| p.file_stem()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if let Some(exe) = &player {
        cmd.push_str(&format!("\n{} {}", quote(&exe.clone().into_os_string()), quote(&made.clone().into_os_string())));
    }
    let mut opened = false;
    if !dry {
        match &player {
            Some(exe) => { std::process::Command::new(exe).arg(&made).spawn().map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}"))?; }
            None => {
                use tauri_plugin_opener::OpenerExt;
                app.opener().open_path(made.to_string_lossy().to_string(), None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))?;
            }
        }
        opened = true;
    }
    Ok(Preview { file: made.to_string_lossy().to_string(), player: name, cmd, opened })
}

fn need(p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.exists() { Ok(pb) } else { Err("หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()) }
}

#[tauri::command]
pub async fn delay_find(app: AppHandle, movie: String, movie_stream: u64, file: String, file_stream: u64) -> Result<Found, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || find(&tools, &need(&movie)?, movie_stream, &need(&file)?, file_stream)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn delay_view(app: AppHandle, movie: String, movie_stream: u64, file: String, file_stream: u64, at: f64, len: f64, margin: f64, speed: Option<[f64; 2]>, cols: usize) -> Result<View, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || view(&tools, &need(&movie)?, movie_stream, &need(&file)?, file_stream, at, len, margin.clamp(0.5, 10.0), speed, cols)).await.map_err(|e| e.to_string())?
}

/// ลองฟัง 20 วินาที · dry มีผลเฉพาะรุ่นทดสอบ (ตัวตรวจไม่เปิดโปรแกรมเล่นขึ้นจอ) รุ่นจริงเปิดเสมอ
#[tauri::command]
pub async fn delay_preview(app: AppHandle, movie: String, file: String, tid: u64, delay: f64, at: f64, dry: Option<bool>) -> Result<Preview, String> {
    let dry = cfg!(debug_assertions) && dry.unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || make_preview(&app, &need(&movie)?, &need(&file)?, tid, delay, at, dry)).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tools() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
    }
    fn av(name: &str) -> Option<PathBuf> {
        let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join(name);
        match dunce::canonicalize(&p) {
            Ok(p) => Some(p),
            Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
            Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
        }
    }

    /// cross-correlation หาตำแหน่งได้ละเอียดกว่าหนึ่งตัวอย่าง · เสียงซ่าที่เลื่อน 37 ตัวอย่าง
    #[test]
    fn xcorr_finds_shift() {
        let mut x = 12345u32;
        let noise: Vec<f32> = (0..20000).map(|_| { x ^= x << 13; x ^= x >> 17; x ^= x << 5; (x as f32 / u32::MAX as f32) - 0.5 }).collect();
        let a = noise[5037..13037].to_vec();
        let (k, s) = xcorr(&a, &noise[..]).unwrap();
        assert!((k - 5037.0).abs() < 0.6 && s > 0.99, "ได้ {k} คะแนน {s}");
        assert!(xcorr(&a[..10], &noise).is_none());
    }

    #[test]
    fn spots_and_args() {
        let (ps, win) = spots(60.0);
        assert_eq!(win, 12.0);
        assert!(ps[0] >= MARGIN && ps[2] + win + MARGIN <= 60.0 && ps[0] < ps[1] && ps[1] < ps[2], "{ps:?}");
        let (ps2, win2) = spots(7200.0);
        assert_eq!(win2, 15.0);
        assert!((ps2[0] - 576.0).abs() < 1e-9 && ps2[2] < 7200.0 * 0.9, "{ps2:?}");
        let a = preview_args(Path::new("D:\\หนัง\\ดาวตก (2024).mkv"), Path::new("D:\\พากย์ไทย.ac3"), 0, -120.0, 24.0, 20.0, Path::new("C:\\tmp\\p.mkv"));
        let s = a.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>().join(" ");
        assert!(s.contains("--split parts:00:00:24.000-00:00:44.000") && s.contains("-A -S -B -M") && s.contains("--sync 0:-120 --default-track-flag 0:1 D:\\พากย์ไทย.ac3"), "{s}");
    }

    /// พากย์ไทยที่เลื่อนจริง 120 ms (ชื่อไฟล์ DELAY -120ms) หาได้ −120 ±10 ms สามช่วงเท่ากัน ไม่ต้องตั้งความเร็ว
    /// เสียง PAL 25 fps เทียบตรง ๆ ไม่ติด ลองยืดแล้วได้คู่ 25 → 23.976
    #[test]
    fn finds_real_delay_and_speed() {
        let Some(movie) = av("ดาวตก (2024).mkv") else { return };
        let th = av("ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap();
        let f = find(&tools(), &movie, 1, &th, 0).unwrap();
        assert!((f.delay + 120.0).abs() <= 10.0 && f.speed.is_none() && !f.uneven && f.score > 0.5, "{f:?}");
        assert!(f.windows.iter().all(|w| (w.delay + 120.0).abs() <= 10.0), "{f:?}");
        let pal = av("ดาวตก (2024) PAL 25fps.ac3").unwrap();
        let g = find(&tools(), &movie, 1, &pal, 0).unwrap();
        assert_eq!(g.speed, Some([25.0, 23.976]), "{g:?}");
        assert!(g.score > 0.4 && g.direct < g.score - 0.2 && g.delay.abs() <= 30.0, "{g:?}");
        // คลื่นเสียงไว้วาด
        let v = view(&tools(), &movie, 1, &th, 0, 24.0, 12.0, 1.0, None, 600).unwrap();
        assert!(v.a.len() >= 590 && v.a.len() <= 610 && (v.b.len() as f64 - v.a.len() as f64 * 14.0 / 12.0).abs() < 4.0, "{} {}", v.a.len(), v.b.len());
        assert!(v.a.iter().any(|&x| x > 0.99) && v.b.iter().all(|&x| (0.0..=1.0).contains(&x)));
    }
}
