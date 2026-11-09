//! หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer (พี่กันสั่ง 9 พ.ย. 2569 "สร้าง bitrate viewer จากรูปที่ให้ไป UI UX เหมือนกัน")
//! ffprobe อ่านขนาดแพ็กเก็ตของแทร็กวิดีโอแรกทีละบรรทัด รวมเป็นไบต์ต่อวินาที แล้วส่งให้หน้าจอเป็นช่วง ๆ
//! หน้าจอจึงวาดกราฟจากซ้ายไปขวาตามที่อ่าน (พี่กันบอก "ตอนที่มันรัน มันจะค่อย ๆ อ่านจากซ้ายมาขวา")
//! อ่านอย่างเดียว ไม่ถอดภาพ ไม่แตะไฟล์ · วิธีเดียวกับ FFBitrateViewer (MIT) ที่อ่าน packet size จาก ffprobe

use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// รอบอ่านล่าสุด · เริ่มไฟล์ใหม่หรือกดหยุด เลขเปลี่ยน รอบเก่าหยุดเอง
static RUN: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Clone, Default, Debug)]
pub struct BrInfo {
    pub run: u64,
    pub duration: f64,
    pub size: u64,
    pub codec: String,
    pub tag: String,
    pub profile: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video: usize,
    pub audio: usize,
}

fn rate(s: &str) -> f64 {
    let mut it = s.split('/');
    match (it.next().and_then(|a| a.parse::<f64>().ok()), it.next().and_then(|b| b.parse::<f64>().ok())) {
        (Some(a), Some(b)) if b > 0.0 => a / b,
        (Some(a), None) => a,
        _ => 0.0,
    }
}

fn info(tools: &Path, path: &Path) -> Result<BrInfo, String> {
    let out = crate::tools::run_tool_timeout(tools, "ffprobe", [
        "-v".as_ref(), "error".as_ref(), "-print_format".as_ref(), "json".as_ref(), "-show_format".as_ref(), "-show_streams".as_ref(), path.as_os_str(),
    ], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|_| "อ่านข้อมูลไฟล์ไม่ได้".to_string())?;
    let streams = j["streams"].as_array().cloned().unwrap_or_default();
    let v = streams.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() != Some(1))
        .ok_or("ไฟล์นี้ไม่มีแทร็กวิดีโอ")?;
    let num = |x: &Value| x.as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| x.as_f64());
    let duration = num(&j["format"]["duration"]).or_else(|| num(&v["duration"])).unwrap_or(0.0);
    Ok(BrInfo {
        run: 0,
        duration,
        size: num(&j["format"]["size"]).unwrap_or(0.0) as u64,
        codec: v["codec_name"].as_str().unwrap_or("").to_string(),
        tag: v["codec_tag_string"].as_str().unwrap_or("").to_string(),
        profile: v["profile"].as_str().unwrap_or("").to_string(),
        width: v["width"].as_u64().unwrap_or(0) as u32,
        height: v["height"].as_u64().unwrap_or(0) as u32,
        fps: rate(v["avg_frame_rate"].as_str().unwrap_or("")).max(0.0),
        video: streams.iter().filter(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"].as_i64() != Some(1)).count(),
        audio: streams.iter().filter(|s| s["codec_type"] == "audio").count(),
    })
}

/// บรรทัดของ ffprobe แบบ compact เช่น `pts_time=1.234|dts_time=1.200|size=5120|flags=K__` · คืน (เวลา, ไบต์, เป็นคีย์เฟรม)
/// ใช้ pts ก่อน ไม่มีค่อยใช้ dts · ไม่มีทั้งคู่ คืน None
pub fn parse_line(l: &str) -> Option<(f64, u64, bool)> {
    let (mut pts, mut dts, mut size, mut key) = (None, None, None, false);
    for kv in l.trim().split('|') {
        let Some((k, v)) = kv.split_once('=') else { continue };
        match k {
            "pts_time" => pts = v.parse::<f64>().ok(),
            "dts_time" => dts = v.parse::<f64>().ok(),
            "size" => size = v.parse::<u64>().ok(),
            "flags" => key = v.starts_with('K'),
            _ => {}
        }
    }
    Some((pts.or(dts)?, size?, key))
}

/// ผลสะสมระหว่างอ่าน
#[derive(Default, Debug)]
pub struct Acc {
    pub start: Option<f64>,
    pub bytes: Vec<u64>,
    pub frames: u64,
    pub keys: Vec<f64>,
    pub read_to: f64,
}

impl Acc {
    fn push(&mut self, t: f64, size: u64, key: bool) {
        let t0 = *self.start.get_or_insert(t.min(0.0f64.max(t)));
        let rel = (t - t0).max(0.0);
        let i = rel as usize;
        if self.bytes.len() <= i { self.bytes.resize(i + 1, 0); }
        self.bytes[i] += size;
        self.frames += 1;
        if key && self.keys.len() < 20_000 { self.keys.push(rel); }
        if rel > self.read_to { self.read_to = rel; }
    }
}

/// อ่านแพ็กเก็ตทั้งไฟล์ · on ถูกเรียกระหว่างอ่าน · stop() จริง = หยุด คืน None
pub fn read_packets(tools: &Path, path: &Path, stop: &dyn Fn() -> bool, on: &mut dyn FnMut(&Acc)) -> Result<Option<Acc>, String> {
    let mut child = crate::tools::tool_command(tools, "ffprobe", [
        "-v".as_ref(), "error".as_ref(), "-select_streams".as_ref(), "V:0".as_ref(),
        "-show_entries".as_ref(), "packet=pts_time,dts_time,size,flags".as_ref(), "-of".as_ref(), "compact=p=0".as_ref(), path.as_os_str(),
    ]).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("เรียก ffprobe ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let out = child.stdout.take().ok_or("อ่านผลของ ffprobe ไม่ได้")?;
    let mut acc = Acc::default();
    let mut last = Instant::now();
    for line in BufReader::new(out).lines() {
        if stop() { let _ = child.kill(); let _ = child.wait(); return Ok(None); }
        let Ok(line) = line else { break };
        if let Some((t, s, k)) = parse_line(&line) { acc.push(t, s, k); }
        if last.elapsed() >= Duration::from_millis(120) { on(&acc); last = Instant::now(); }
    }
    let _ = child.wait();
    on(&acc);
    if acc.frames == 0 { return Err("อ่านแพ็กเก็ตวิดีโอไม่ได้".into()); }
    Ok(Some(acc))
}

/// เริ่มอ่านไฟล์ · คืนข้อมูลไฟล์ทันที แล้วส่ง bitrate-progress ระหว่างอ่าน และ bitrate-done ตอนจบ
#[tauri::command]
pub async fn bitrate_start(app: AppHandle, path: String) -> Result<BrInfo, String> {
    let tools = crate::tools::tools_dir(&app)?;
    let run = RUN.fetch_add(1, Ordering::SeqCst) + 1;
    let p = std::path::PathBuf::from(&path);
    let t2 = tools.clone();
    let mut inf = tauri::async_runtime::spawn_blocking(move || info(&t2, &p)).await.map_err(|e| e.to_string())??;
    inf.run = run;
    let p = std::path::PathBuf::from(&path);
    std::thread::spawn(move || {
        let mut sent = 0usize;
        let mut keys_sent = 0usize;
        let stop = || RUN.load(Ordering::SeqCst) != run;
        let mut on = |a: &Acc| {
            // ส่งตั้งแต่ช่องก่อนหน้าหนึ่งช่อง เพราะช่องสุดท้ายยังเพิ่มได้
            let from = sent.saturating_sub(1).min(a.bytes.len());
            let _ = app.emit("bitrate-progress", json!({ "run": run, "from": from, "bytes": &a.bytes[from..], "keys": &a.keys[keys_sent.min(a.keys.len())..], "frames": a.frames, "readTo": a.read_to }));
            sent = a.bytes.len();
            keys_sent = a.keys.len();
        };
        let r = read_packets(&tools, &p, &stop, &mut on);
        let _ = match r {
            Ok(Some(a)) => app.emit("bitrate-done", json!({ "run": run, "ok": true, "frames": a.frames })),
            Ok(None) => app.emit("bitrate-done", json!({ "run": run, "ok": false, "stopped": true })),
            Err(e) => app.emit("bitrate-done", json!({ "run": run, "ok": false, "error": e })),
        };
    });
    Ok(inf)
}

/// หยุดรอบที่อ่านอยู่
#[tauri::command]
pub fn bitrate_stop() {
    RUN.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    #[test]
    fn parses_compact_lines() {
        assert_eq!(parse_line("pts_time=1.500000|dts_time=1.460000|size=5120|flags=K__"), Some((1.5, 5120, true)));
        assert_eq!(parse_line("pts_time=N/A|dts_time=2.000000|size=10|flags=___"), Some((2.0, 10, false)));
        assert_eq!(parse_line("pts_time=N/A|dts_time=N/A|size=10|flags=___"), None);
        assert_eq!(parse_line(""), None);
    }

    /// คลิป 3 วินาที 25 เฟรมต่อวินาที คีย์เฟรมทุก 25 เฟรม · ได้ 75 เฟรม 3 คีย์เฟรม ช่องละวินาที 3 ช่อง ไบต์รวมเท่าแพ็กเก็ตจริง
    #[test]
    fn reads_bitrate_per_second() {
        let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรต-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("คลิป บิตเรต.mkv");
        let out = crate::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=25", "-c:v", "libx264", "-g", "25", "-keyint_min", "25", "-sc_threshold", "0", f.to_str().unwrap()]).unwrap();
        assert!(out.status.success());
        let inf = info(&tools(), &f).unwrap();
        assert_eq!((inf.width, inf.height, inf.codec.as_str(), inf.video, inf.audio), (320, 240, "h264", 1, 0));
        assert!((inf.fps - 25.0).abs() < 0.01 && (inf.duration - 3.0).abs() < 0.1, "{inf:?}");
        let mut calls = 0;
        let a = read_packets(&tools(), &f, &|| false, &mut |_| calls += 1).unwrap().unwrap();
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(a.frames, 75);
        assert_eq!(a.keys.len(), 3, "{:?}", a.keys);
        assert_eq!(a.bytes.len(), 3, "{:?}", a.bytes);
        assert!(a.bytes.iter().all(|b| *b > 0) && calls >= 1);
    }
}
