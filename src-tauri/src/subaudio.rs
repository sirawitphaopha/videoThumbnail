//! เสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109)
//! ① เสียงช่วงหนึ่งสำหรับเล่นในหน้าจอ ถอดเป็นตัวเลขเสียงสองช่อง 48 kHz ส่งเป็นไบต์ตรงให้ Web Audio ของหน้าจอ (ไม่แปลงเป็นข้อความ)
//!    หน้าจอขอทีละก้อนไม่กี่วินาที เล่นจนจบไฟล์ได้โดยไม่ต้องถอดทั้งเรื่องก่อน
//! ② บันทึกเสียงของบรรทัดเป็นไฟล์ WAV (คำสั่ง audio/save/clip ของ Aegisub) ไม่ทับไฟล์อื่น ไฟล์เดิมที่ผู้ใช้เลือกทับลงถังขยะ
//! ไม่แตะไฟล์หนัง

use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;

use tauri::AppHandle;

use crate::tools::{run_tool_timeout, tool_succeeded, tools_dir};

/// อัตราตัวอย่างเสียงที่ส่งให้หน้าจอ · หน้าจอสร้าง AudioBuffer ที่อัตรานี้
pub const PCM_RATE: u32 = 48_000;

fn need(p: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(p);
    if pb.exists() { Ok(pb) } else { Err("หาไฟล์เสียงไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()) }
}

/// ตัวเลือกแทร็กที่หน้าจอส่งมา รับเฉพาะแบบ 0:2 (เลขแทร็กของทั้งไฟล์) กับ 0:a:0 (ลำดับในแทร็กเสียง) กันส่งตัวเลือกอื่นเข้า ffmpeg
fn map_ok(m: &str) -> Result<String, String> {
    let ok = m.strip_prefix("0:").map(|r| { let r = r.strip_prefix("a:").unwrap_or(r); !r.is_empty() && r.len() <= 3 && r.bytes().all(|b| b.is_ascii_digit()) }).unwrap_or(false);
    if ok { Ok(m.to_string()) } else { Err("แทร็กเสียงไม่ถูกต้อง".into()) }
}

/// เวลาเริ่มของไฟล์กับของแทร็กเสียง วินาทีตามเวลาในไฟล์ · จำไว้ต่อไฟล์ ไม่ถาม ffprobe ทุกก้อนเสียง
/// ไฟล์เปลี่ยน (ขนาดหรือเวลาแก้ต่าง) ถามใหม่
fn starts(tools: &std::path::Path, path: &std::path::Path, map: &str) -> Option<(f64, f64)> {
    use std::sync::{Mutex, OnceLock};
    static MEMO: OnceLock<Mutex<std::collections::HashMap<String, (f64, f64)>>> = OnceLock::new();
    let md = std::fs::metadata(path).ok()?;
    let mt = md.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis()).unwrap_or(0);
    let key = format!("{}|{}|{}|{map}", path.display(), md.len(), mt);
    let memo = MEMO.get_or_init(|| Mutex::new(Default::default()));
    if let Some(v) = memo.lock().ok()?.get(&key) { return Some(*v); }
    let args: Vec<OsString> = ["-v", "error", "-show_entries", "format=start_time:stream=index,codec_type,start_time", "-of", "json"].iter().map(OsString::from).chain([path.as_os_str().to_owned()]).collect();
    let o = run_tool_timeout(tools, "ffprobe", &args, Duration::from_secs(30)).ok()?;
    let j: serde_json::Value = serde_json::from_slice(&o.stdout).ok()?;
    let num = |v: &serde_json::Value| v.as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| v.as_f64());
    let s = num(&j["format"]["start_time"]).unwrap_or(0.0);
    let streams = j["streams"].as_array()?;
    let r = map.strip_prefix("0:")?;
    let st = if let Some(k) = r.strip_prefix("a:") {
        let k: usize = k.parse().ok()?;
        streams.iter().filter(|x| x["codec_type"] == "audio").nth(k)?
    } else {
        let i: u64 = r.parse().ok()?;
        streams.iter().find(|x| x["index"].as_u64() == Some(i))?
    };
    let v = (s, num(&st["start_time"]).unwrap_or(s));
    memo.lock().ok()?.insert(key, v);
    Some(v)
}

/// จุดที่ต้องสั่ง ffmpeg ให้เสียงตรงเวลาของภาพ (BUGS ข้อ 115 แบบ FFMS_DELAY_FIRST_VIDEO_TRACK ของ Aegisub)
/// เวลา t ของหน้าแก้ซับนับจากเฟรมแรกของภาพ · zero คือเวลาเฟรมแรกของภาพในไฟล์ (วินาที) · s เวลาเริ่มของไฟล์ · a เวลาเริ่มของแทร็กเสียง
/// คืน (ค่า -ss ของ ffmpeg ซึ่งนับจากเวลาเริ่มของไฟล์, ความยาวเงียบที่ต้องเติมหน้า เพราะเสียงยังไม่เริ่ม)
/// ไม่มี zero (ไฟล์เสียงแยก หรือยังอ่านเวลาเฟรมไม่เสร็จ) นับจากต้นไฟล์ตามเดิม
pub fn place(zero: Option<f64>, s: f64, a: f64, t: f64) -> (f64, f64) {
    match zero {
        None => (t.max(0.0), (-t).max(0.0)),
        Some(z) => {
            let abs = z + t;
            ((abs.max(a) - s).max(0.0), (a - abs).max(0.0))
        }
    }
}

/// เวลาเริ่มของแทร็กเสียงแบบปลอดภัย · ถาม ffprobe ไม่ได้ ถือว่าเสียงเริ่มพร้อมไฟล์ที่ zero
fn place_of(tools: &std::path::Path, path: &std::path::Path, map: &str, zero: Option<f64>, t: f64) -> (f64, f64) {
    let Some(z) = zero else { return place(None, 0.0, 0.0, t) };
    let (s, a) = starts(tools, path, map).unwrap_or((z, z));
    place(Some(z), s, a, t)
}

/// คลื่นเสียงช่วง t0 ถึง t1 ได้ cols คอลัมน์พอดี แต่ละคอลัมน์คือค่าสูงสุดของความดังในช่วงเวลานั้น 0 ถึง 1
/// ถอดเป็นช่องเดียว 8 kHz แบบตัวดูซับเดิม · แบ่งตามเวลา ไม่ใช่ตามจำนวนตัวอย่าง คอลัมน์จึงตรงกับพิกเซลบนจอเสมอ
/// zero เวลาเฟรมแรกของภาพในไฟล์ (เสียงในหนัง) คลื่นเสียงเลื่อนให้เวลา 0 ตรงเฟรมแรกของภาพ (BUGS ข้อ 115)
pub fn peaks(tools: &std::path::Path, path: &std::path::Path, map: &str, t0: f64, t1: f64, cols: usize, zero: Option<f64>) -> Result<Vec<f32>, String> {
    let (ss, lead) = place_of(tools, path, map, zero, t0);
    let mut args = cut_args(path, map, ss, (t1 - t0 - lead).max(0.01));
    args.extend(["-ac".into(), "1".into(), "-ar".into(), "8000".into(), "-f".into(), "f32le".into(), "-".into()]);
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120))?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(format!("ถอดเสียงไม่ได้  {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
    }
    let x: Vec<f32> = o.stdout.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
    let cols = cols.clamp(1, 8192);
    let per = (t1 - t0) * 8000.0 / cols as f64;
    let off = lead * 8000.0;
    Ok((0..cols).map(|c| {
        // คอลัมน์ที่อยู่ก่อนเวลา 0 ทั้งคอลัมน์เป็นเงียบ
        if (c + 1) as f64 * per - off <= 0.0 { return 0.0; }
        let a = (c as f64 * per - off).floor().max(0.0) as usize;
        let b = (((c + 1) as f64 * per - off).ceil().max(0.0) as usize).max(a + 1).min(x.len());
        if a >= x.len() { return 0.0; }
        x[a..b].iter().fold(0f32, |m, v| m.max(v.abs())).min(1.0)
    }).collect())
}

#[tauri::command]
pub async fn sub_peaks(app: AppHandle, path: String, map: String, t0: f64, t1: f64, cols: usize, zero: Option<f64>) -> Result<Vec<f32>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || peaks(&tools, &need(&path)?, &map_ok(&map)?, t0, t1.max(t0 + 0.001), cols, zero)).await.map_err(|e| e.to_string())?
}

/// ตัวเลือกของ ffmpeg ที่เปิดไฟล์ตรงเวลา t0 ยาว dur วินาที เฉพาะแทร็กเสียงที่ map เลือก
/// ช่วงต้นไฟล์ (ไม่ถึง 2 วินาที) ถอดจากต้นไฟล์แล้วตัดทิ้ง ไม่กระโดด · ffmpeg กระโดดโดยยึดคีย์เฟรมของภาพ ไฟล์ที่ภาพเริ่มช้ากว่าเสียง
/// (ไฟล์อัดทีวี) ช่วงก่อนคีย์เฟรมแรกของภาพกระโดดไปไม่ถึง ได้เสียงว่าง (เจอตอนเทส BUGS ข้อ 115 ไฟล์ภาพเริ่มที่ 0.32 ขอเสียง 0 ถึง 0.2 ได้ 0 ไบต์)
fn cut_args(path: &std::path::Path, map: &str, t0: f64, dur: f64) -> Vec<OsString> {
    let (ss, t) = (format!("{:.3}", t0.max(0.0)), format!("{:.3}", dur.max(0.01)));
    let mut a: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into()];
    if t0 < 2.0 {
        a.extend(["-i".into(), path.into(), "-ss".into(), ss.into(), "-t".into(), t.into()]);
    } else {
        a.extend(["-ss".into(), ss.into(), "-t".into(), t.into(), "-i".into(), path.into()]);
    }
    a.extend(["-map".into(), map.into(), "-vn".into(), "-sn".into(), "-dn".into()]);
    a
}

/// เสียงช่วงหนึ่ง เป็นไบต์ s16le สองช่องสลับกัน 48 kHz · ช่วงเลยท้ายไฟล์ได้ไบต์น้อยกว่าที่ขอหรือว่าง
/// zero แบบเดียวกับ peaks · ช่วงที่เสียงยังไม่เริ่มเติมเงียบหน้าก้อน ตัวอย่างแรกของก้อนจึงตรงเวลา t0 ของภาพเสมอ
pub fn pcm(tools: &std::path::Path, path: &std::path::Path, map: &str, t0: f64, dur: f64, zero: Option<f64>) -> Result<Vec<u8>, String> {
    let (ss, lead) = place_of(tools, path, map, zero, t0);
    let lead = lead.min(dur);
    let pad = (lead * PCM_RATE as f64).round() as usize * 4;
    if dur - lead < 0.005 { return Ok(vec![0u8; pad]); }
    let mut args = cut_args(path, map, ss, dur - lead);
    args.extend(["-ac".into(), "2".into(), "-ar".into(), PCM_RATE.to_string().into(), "-f".into(), "s16le".into(), "-".into()]);
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120))?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(format!("ถอดเสียงไม่ได้  {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
    }
    if pad == 0 { return Ok(o.stdout); }
    let mut b = vec![0u8; pad];
    b.extend_from_slice(&o.stdout);
    Ok(b)
}

/// เสียงช่วงหนึ่งสำหรับเล่น · หน้าจอได้ ArrayBuffer ตรง ๆ
#[tauri::command]
pub async fn sub_pcm(app: AppHandle, path: String, map: String, t0: f64, dur: f64, zero: Option<f64>) -> Result<tauri::ipc::Response, String> {
    let tools = tools_dir(&app)?;
    let b = tauri::async_runtime::spawn_blocking(move || pcm(&tools, &need(&path)?, &map_ok(&map)?, t0, dur.clamp(0.01, 30.0), zero)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(b))
}

/// บันทึกเสียงช่วง t0 ถึง t1 เป็นไฟล์ WAV · เขียน .partial ก่อน ไฟล์ปลายทางที่มีอยู่แล้ว (ผู้ใช้ยืนยันทับในกล่องบันทึกของ Windows) ลงถังขยะ
#[tauri::command]
pub async fn sub_audio_save(app: AppHandle, path: String, map: String, t0: f64, t1: f64, target: String, zero: Option<f64>) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let src = need(&path)?;
        let target = PathBuf::from(&target);
        // เทียบแบบไม่สนตัวพิมพ์และเครื่องหมาย / \ (Movie.mkv กับ movie.mkv คือไฟล์เดียวกันบน Windows) · ไฟล์ปลายทางต้องเป็น .wav กันทับไฟล์หนังหรือไฟล์ซับ (R10)
        let key = |p: &std::path::Path| p.display().to_string().replace('/', "\\").to_lowercase();
        if key(&target) == key(&src) { return Err("บันทึกทับไฟล์ต้นทางไม่ได้ เลือกชื่ออื่น".into()); }
        if !target.extension().is_some_and(|e| e.eq_ignore_ascii_case("wav")) { return Err("ไฟล์เสียงที่บันทึกต้องเป็นไฟล์ .wav".into()); }
        let partial = crate::subdoc::partial_of(&target);
        let map = map_ok(&map)?;
        // เวลาเดียวกับคลื่นเสียง ช่วงที่เสียงยังไม่เริ่มเติมเงียบหน้าไฟล์ (BUGS ข้อ 115)
        let (ss, lead) = place_of(&tools, &src, &map, zero, t0);
        let mut args = cut_args(&src, &map, ss, (t1 - t0 - lead).max(0.01));
        if lead > 0.0005 { args.extend(["-af".into(), format!("adelay={}:all=1", (lead * 1000.0).round() as i64).into()]); }
        args.extend(["-c:a".into(), "pcm_s16le".into(), "-f".into(), "wav".into(), partial.clone().into()]);
        let o = run_tool_timeout(&tools, "ffmpeg", &args, Duration::from_secs(300))?;
        if !tool_succeeded("ffmpeg", &o.status) || !partial.exists() {
            let _ = std::fs::remove_file(&partial);
            return Err(format!("บันทึกเสียงไม่สำเร็จ  {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
        }
        crate::outfile::replace_with(&partial, &target)?;
        crate::actlog::note("บันทึกเสียงของบรรทัดซับ", &format!("{} ({:.2} ถึง {:.2} วินาที)", target.display(), t0, t1));
        Ok(target.display().to_string())
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    /// หนังทดสอบมีโทน 440 Hz เฉพาะช่วงที่มีบรรทัดซับ (0.5 ถึง 3.4 วินาที) ช่วงอื่นเงียบ
    #[test]
    fn pcm_is_stereo_48k_and_follows_the_tone() {
        if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return; }
        let m = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join("ฉากตัด (2025).mkv");
        assert!(m.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
        let loud = pcm(&tools(), &m, "0:1", 1.0, 1.0, None).unwrap();
        assert_eq!(loud.len(), 48_000 * 2 * 2, "หนึ่งวินาที สองช่อง ช่องละ 2 ไบต์");
        let peak = |b: &[u8]| b.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0);
        assert!(peak(&loud) > 8000, "ช่วงมีโทนต้องดัง {}", peak(&loud));
        let quiet = pcm(&tools(), &m, "0:1", 3.6, 0.3, None).unwrap();
        assert!(peak(&quiet) < 200, "ช่วงไม่มีบรรทัดต้องเงียบ {}", peak(&quiet));
        // คลื่นเสียงได้คอลัมน์พอดี ช่วงมีโทนดัง ช่วงเงียบเกือบศูนย์ · ขอก่อนเวลา 0 ส่วนนั้นเป็นศูนย์
        let w = peaks(&tools(), &m, "0:1", 0.0, 4.0, 400, None).unwrap();
        assert_eq!(w.len(), 400);
        assert!(w[100] > 0.3 && w[10] < 0.01 && w[380] < 0.01, "{} {} {}", w[100], w[10], w[380]);
        let neg = peaks(&tools(), &m, "0:1", -1.0, 1.0, 200, None).unwrap();
        assert!(neg[..100].iter().all(|&v| v == 0.0) && neg[160] > 0.3, "{} {}", neg[50], neg[160]);
        assert!(map_ok("0:1").is_ok() && map_ok("0:a:0").is_ok() && map_ok("0:a:x").is_err() && map_ok("-i x").is_err());
        // ขอเลยท้ายไฟล์ ได้เท่าที่มี ไม่ผิดพลาด
        let tail = pcm(&tools(), &m, "0:a:0", 19.5, 2.0, None).unwrap();
        assert!(tail.len() <= 48_000 * 2 * 2 / 2 + 4096, "{}", tail.len());
    }

    #[test]
    fn place_follows_first_video_frame() {
        // ไม่มีเวลาเฟรมแรก นับจากต้นไฟล์ · เวลาติดลบเติมเงียบ
        assert_eq!(place(None, 0.0, 0.0, 2.0), (2.0, 0.0));
        assert_eq!(place(None, 0.0, 0.0, -0.5), (0.0, 0.5));
        // ภาพเริ่มช้ากว่าเสียง 0.3 วินาที เวลา 0.6 ของภาพคือเสียงที่ 0.9
        let (ss, lead) = place(Some(0.3), 0.0, 0.0, 0.6);
        assert!((ss - 0.9).abs() < 1e-9 && lead == 0.0);
        // เสียงเริ่มช้ากว่าภาพ 0.5 วินาที ช่วงแรกของภาพยังไม่มีเสียง เติมเงียบ
        let (ss, lead) = place(Some(1.0), 1.0, 1.5, 0.2);
        assert!((ss - 0.5).abs() < 1e-9 && (lead - 0.3).abs() < 1e-9, "{ss} {lead}");
    }

    /// BUGS ข้อ 115 ไฟล์ที่ภาพเริ่มช้ากว่าเสียง 0.3 วินาที (แบบไฟล์อัดทีวี) เสียงบี๊บอยู่ที่ 1.0 วินาทีของไฟล์ = 0.7 วินาทีของภาพ
    /// ส่งเวลาเฟรมแรกของภาพ เสียงช่วง 0.6 ถึง 0.9 ของภาพต้องได้ยินบี๊บ · ไม่ส่ง (แบบเดิม) ได้ช่วง 0.6 ถึง 0.9 ของไฟล์ซึ่งเงียบ
    #[test]
    fn pcm_peaks_shift_to_first_video_frame() {
        let dir = std::env::temp_dir().join(format!("movie-shelf-zero-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let m = dir.join("late-video.mkv");
        let args: Vec<std::ffi::OsString> = ["-v", "error", "-itsoffset", "0.3", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=25:d=3", "-f", "lavfi", "-i", "aevalsrc=if(between(t\\,1\\,1.2)\\,0.8*sin(2*PI*1000*t)\\,0):s=48000:d=3",
            "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "flac"].iter().map(std::ffi::OsString::from).chain([m.as_os_str().to_owned()]).collect();
        let o = crate::tools::run_tool(&tools(), "ffmpeg", &args).unwrap();
        assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
        let (s, a) = starts(&tools(), &m, "0:1").expect("อ่านเวลาเริ่มได้");
        assert!(s.abs() < 0.05 && a.abs() < 0.05, "ไฟล์กับเสียงเริ่มที่ 0 {s} {a}");
        let peak = |b: &[u8]| b.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0);
        let with = pcm(&tools(), &m, "0:1", 0.6, 0.3, Some(0.3)).unwrap();
        let without = pcm(&tools(), &m, "0:1", 0.6, 0.3, None).unwrap();
        assert!(peak(&with[48_000 * 4 / 10 * 2..]) > 8000, "เลื่อนตามภาพแล้วได้ยินบี๊บที่ 0.7 ของภาพ {}", peak(&with));
        assert!(peak(&without) < 200, "แบบเดิมนับจากต้นไฟล์ ช่วงนี้เงียบ {}", peak(&without));
        // คลื่นเสียง 0 ถึง 1.5 วินาทีของภาพ 150 คอลัมน์ บี๊บอยู่คอลัมน์ 70 ถึง 89
        let w = peaks(&tools(), &m, "0:1", 0.0, 1.5, 150, Some(0.3)).unwrap();
        assert!(w[75] > 0.3 && w[60] < 0.01 && w[95] < 0.01, "{} {} {}", w[60], w[75], w[95]);
        // ก่อนเฟรมแรกของภาพยังมีเสียงของไฟล์ (0.3 วินาทีแรก) เวลาติดลบของภาพจึงอ่านได้ ไม่เติมเงียบ
        let pre = pcm(&tools(), &m, "0:1", -0.2, 0.2, Some(0.3)).unwrap();
        assert_eq!(pre.len(), (0.2 * 48_000.0) as usize * 4);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
