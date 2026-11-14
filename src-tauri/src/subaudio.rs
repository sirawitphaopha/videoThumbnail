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

/// คลื่นเสียงช่วง t0 ถึง t1 ได้ cols คอลัมน์พอดี แต่ละคอลัมน์คือค่าสูงสุดของความดังในช่วงเวลานั้น 0 ถึง 1
/// ถอดเป็นช่องเดียว 8 kHz แบบตัวดูซับเดิม · แบ่งตามเวลา ไม่ใช่ตามจำนวนตัวอย่าง คอลัมน์จึงตรงกับพิกเซลบนจอเสมอ
pub fn peaks(tools: &std::path::Path, path: &std::path::Path, map: &str, t0: f64, t1: f64, cols: usize) -> Result<Vec<f32>, String> {
    let lead = (-t0).max(0.0);
    let mut args = cut_args(path, map, t0, (t1 - t0 - lead).max(0.01));
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
pub async fn sub_peaks(app: AppHandle, path: String, map: String, t0: f64, t1: f64, cols: usize) -> Result<Vec<f32>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || peaks(&tools, &need(&path)?, &map_ok(&map)?, t0, t1.max(t0 + 0.001), cols)).await.map_err(|e| e.to_string())?
}

/// ตัวเลือกของ ffmpeg ที่เปิดไฟล์ตรงเวลา t0 ยาว dur วินาที เฉพาะแทร็กเสียงที่ map เลือก
fn cut_args(path: &std::path::Path, map: &str, t0: f64, dur: f64) -> Vec<OsString> {
    vec!["-v".into(), "error".into(), "-nostdin".into(), "-ss".into(), format!("{:.3}", t0.max(0.0)).into(), "-t".into(), format!("{:.3}", dur.max(0.01)).into(),
        "-i".into(), path.into(), "-map".into(), map.into(), "-vn".into(), "-sn".into(), "-dn".into()]
}

/// เสียงช่วงหนึ่ง เป็นไบต์ s16le สองช่องสลับกัน 48 kHz · ช่วงเลยท้ายไฟล์ได้ไบต์น้อยกว่าที่ขอหรือว่าง
pub fn pcm(tools: &std::path::Path, path: &std::path::Path, map: &str, t0: f64, dur: f64) -> Result<Vec<u8>, String> {
    let mut args = cut_args(path, map, t0, dur);
    args.extend(["-ac".into(), "2".into(), "-ar".into(), PCM_RATE.to_string().into(), "-f".into(), "s16le".into(), "-".into()]);
    let o = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120))?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(format!("ถอดเสียงไม่ได้  {}", String::from_utf8_lossy(&o.stderr).lines().last().unwrap_or("")));
    }
    Ok(o.stdout)
}

/// เสียงช่วงหนึ่งสำหรับเล่น · หน้าจอได้ ArrayBuffer ตรง ๆ
#[tauri::command]
pub async fn sub_pcm(app: AppHandle, path: String, map: String, t0: f64, dur: f64) -> Result<tauri::ipc::Response, String> {
    let tools = tools_dir(&app)?;
    let b = tauri::async_runtime::spawn_blocking(move || pcm(&tools, &need(&path)?, &map_ok(&map)?, t0, dur.clamp(0.01, 30.0))).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(b))
}

/// บันทึกเสียงช่วง t0 ถึง t1 เป็นไฟล์ WAV · เขียน .partial ก่อน ไฟล์ปลายทางที่มีอยู่แล้ว (ผู้ใช้ยืนยันทับในกล่องบันทึกของ Windows) ลงถังขยะ
#[tauri::command]
pub async fn sub_audio_save(app: AppHandle, path: String, map: String, t0: f64, t1: f64, target: String) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let src = need(&path)?;
        let target = PathBuf::from(&target);
        // เทียบแบบไม่สนตัวพิมพ์และเครื่องหมาย / \ (Movie.mkv กับ movie.mkv คือไฟล์เดียวกันบน Windows) · ไฟล์ปลายทางต้องเป็น .wav กันทับไฟล์หนังหรือไฟล์ซับ (R10)
        let key = |p: &std::path::Path| p.display().to_string().replace('/', "\\").to_lowercase();
        if key(&target) == key(&src) { return Err("บันทึกทับไฟล์ต้นทางไม่ได้ เลือกชื่ออื่น".into()); }
        if !target.extension().is_some_and(|e| e.eq_ignore_ascii_case("wav")) { return Err("ไฟล์เสียงที่บันทึกต้องเป็นไฟล์ .wav".into()); }
        let partial = crate::subdoc::partial_of(&target);
        let mut args = cut_args(&src, &map_ok(&map)?, t0, (t1 - t0).max(0.01));
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
        let loud = pcm(&tools(), &m, "0:1", 1.0, 1.0).unwrap();
        assert_eq!(loud.len(), 48_000 * 2 * 2, "หนึ่งวินาที สองช่อง ช่องละ 2 ไบต์");
        let peak = |b: &[u8]| b.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0);
        assert!(peak(&loud) > 8000, "ช่วงมีโทนต้องดัง {}", peak(&loud));
        let quiet = pcm(&tools(), &m, "0:1", 3.6, 0.3).unwrap();
        assert!(peak(&quiet) < 200, "ช่วงไม่มีบรรทัดต้องเงียบ {}", peak(&quiet));
        // คลื่นเสียงได้คอลัมน์พอดี ช่วงมีโทนดัง ช่วงเงียบเกือบศูนย์ · ขอก่อนเวลา 0 ส่วนนั้นเป็นศูนย์
        let w = peaks(&tools(), &m, "0:1", 0.0, 4.0, 400).unwrap();
        assert_eq!(w.len(), 400);
        assert!(w[100] > 0.3 && w[10] < 0.01 && w[380] < 0.01, "{} {} {}", w[100], w[10], w[380]);
        let neg = peaks(&tools(), &m, "0:1", -1.0, 1.0, 200).unwrap();
        assert!(neg[..100].iter().all(|&v| v == 0.0) && neg[160] > 0.3, "{} {}", neg[50], neg[160]);
        assert!(map_ok("0:1").is_ok() && map_ok("0:a:0").is_ok() && map_ok("0:a:x").is_err() && map_ok("-i x").is_err());
        // ขอเลยท้ายไฟล์ ได้เท่าที่มี ไม่ผิดพลาด
        let tail = pcm(&tools(), &m, "0:a:0", 19.5, 2.0).unwrap();
        assert!(tail.len() <= 48_000 * 2 * 2 / 2 + 4096, "{}", tail.len());
    }
}
