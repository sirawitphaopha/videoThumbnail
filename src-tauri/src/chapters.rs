//! บทของหนัง ดูและแก้ในหน้าเสียงและซับ (BUGS ข้อ 99 พี่กันถาม 13 พ.ย. 2569 "เราจะ edit ยังไง เปิดดูยังไง")
//! อ่านบทจากไฟล์ด้วย ffprobe · บทที่แก้เขียนเป็นไฟล์บทแบบง่าย (OGM) ให้ mkvmerge หรือไฟล์ข้อมูลของ ffmpeg (FFMETADATA) ให้ MP4
//! ไม่แตะไฟล์หนังเดิม บทที่แก้ลงเฉพาะไฟล์ใหม่ตอนรวม

use std::ffi::OsStr;
use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::tools::run_tool_timeout;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    /// เวลาเริ่มเป็นวินาที
    pub start: f64,
    pub title: String,
}

/// แปลงผล ffprobe -show_chapters เป็นรายการบท เรียงตามเวลา
pub fn parse_ffprobe(v: &Value) -> Vec<Chapter> {
    let mut out: Vec<Chapter> = v["chapters"].as_array().map(|a| a.iter().filter_map(|c| {
        let start = c["start_time"].as_str().and_then(|s| s.parse::<f64>().ok()).or_else(|| c["start_time"].as_f64())?;
        let title = c["tags"]["title"].as_str().unwrap_or("").to_string();
        Some(Chapter { start: start.max(0.0), title })
    }).collect()).unwrap_or_default();
    out.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    out
}

pub fn read(tools: &Path, file: &Path) -> Result<Vec<Chapter>, String> {
    let out = run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"), OsStr::new("-show_chapters"), file.as_os_str()], Duration::from_secs(60))?;
    if !out.status.success() {
        return Err(format!("อ่านบทของหนังไม่ได้ {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    let v: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านบทของหนังไม่ได้ {e}"))?;
    Ok(parse_ffprobe(&v))
}

/// เวลาแบบ ชั่วโมง:นาที:วินาที.มิลลิวินาที
pub fn hms(sec: f64) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as u64;
    format!("{:02}:{:02}:{:02}.{:03}", ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, ms % 1000)
}

/// ไฟล์บทแบบง่ายที่ mkvmerge อ่านได้ (--chapters) · ชื่อบทขึ้นบรรทัดใหม่ไม่ได้ จึงแทนด้วยเว้นวรรค
pub fn ogm_text(chs: &[Chapter]) -> String {
    let mut s = String::new();
    for (i, c) in sorted(chs).iter().enumerate() {
        let n = i + 1;
        s.push_str(&format!("CHAPTER{n:02}={}\nCHAPTER{n:02}NAME={}\n", hms(c.start), one_line(&c.title)));
    }
    s
}

/// ไฟล์ข้อมูลของ ffmpeg มีบทพร้อมเวลาจบ (บทสุดท้ายจบที่ความยาวหนัง) · อักขระ = ; # \ ในชื่อต้องใส่ \ นำหน้า
pub fn ffmetadata_text(chs: &[Chapter], duration: Option<f64>) -> String {
    let list = sorted(chs);
    let mut s = String::from(";FFMETADATA1\n");
    for (i, c) in list.iter().enumerate() {
        let start = (c.start * 1000.0).round() as u64;
        let end = list.get(i + 1).map(|n| (n.start * 1000.0).round() as u64)
            .or_else(|| duration.map(|d| (d * 1000.0).round() as u64))
            .unwrap_or(start + 1000).max(start + 1);
        let title: String = one_line(&c.title).chars().flat_map(|ch| if matches!(ch, '=' | ';' | '#' | '\\') { vec!['\\', ch] } else { vec![ch] }).collect();
        s.push_str(&format!("[CHAPTER]\nTIMEBASE=1/1000\nSTART={start}\nEND={end}\ntitle={title}\n"));
    }
    s
}

fn sorted(chs: &[Chapter]) -> Vec<Chapter> {
    let mut v = chs.to_vec();
    v.sort_by(|a, b| a.start.partial_cmp(&b.start).unwrap_or(std::cmp::Ordering::Equal));
    v
}

fn one_line(s: &str) -> String {
    s.replace(['\r', '\n'], " ").trim().to_string()
}

#[tauri::command]
pub async fn chapters_read(app: tauri::AppHandle, path: String) -> Result<Vec<Chapter>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tools = crate::tools::tools_dir(&app)?;
        read(&tools, Path::new(&path))
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ffprobe_chapters_in_order() {
        let v: Value = serde_json::from_str(r#"{"chapters":[{"start_time":"300.500000","tags":{"title":"บทที่ 2"}},{"start_time":"0.000000","tags":{"title":"เปิดเรื่อง"}},{"start_time":"900.0"}]}"#).unwrap();
        let c = parse_ffprobe(&v);
        assert_eq!(c.iter().map(|x| x.title.as_str()).collect::<Vec<_>>(), vec!["เปิดเรื่อง", "บทที่ 2", ""]);
        assert_eq!(c[1].start, 300.5);
    }

    #[test]
    fn writes_ogm_for_mkvmerge() {
        let t = ogm_text(&[Chapter { start: 3725.25, title: "ท้าย\nเรื่อง".into() }, Chapter { start: 0.0, title: "เปิด".into() }]);
        assert_eq!(t, "CHAPTER01=00:00:00.000\nCHAPTER01NAME=เปิด\nCHAPTER02=01:02:05.250\nCHAPTER02NAME=ท้าย เรื่อง\n");
    }

    #[test]
    fn writes_ffmetadata_with_ends_and_escapes() {
        let t = ffmetadata_text(&[Chapter { start: 0.0, title: "ก=ข;ค".into() }, Chapter { start: 60.0, title: "จบ".into() }], Some(125.5));
        assert_eq!(t, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=60000\ntitle=ก\\=ข\\;ค\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=60000\nEND=125500\ntitle=จบ\n");
    }
}
