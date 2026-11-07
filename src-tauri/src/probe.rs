//! อ่านข้อมูลไฟล์หนังด้วย ffprobe แล้วดึงปกออกมาย่อเป็นภาพเล็กไว้โชว์บนชั้น (สเปกข้อ 1 · 10 ชั้นวางดึงปกเอง ไม่พึ่ง Windows)
//! ปก MKV = ไฟล์แนบชื่อ cover.* (ดึงด้วย mkvextract) · ปก MP4 MOV M4V = สตรีมภาพที่ติดป้ายภาพปก (ดึงด้วย ffmpeg)
//! ไฟล์ดิบของปกเขียนลงโฟลเดอร์ชั่วคราวของโปรแกรมเอง ไม่เขียนข้างไฟล์หนัง แล้วลบทิ้งทันทีหลังย่อ

use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::tools::{exit_text, run_tool_timeout, tool_succeeded};

const PROBE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    /// ชื่อภาษาเป็นภาษาไทย เช่น ไทย อังกฤษ · ไม่ระบุ = None
    pub lang: Option<String>,
    /// ชื่อชนิดแบบที่คนเห็นบ่อย เช่น AC-3 · SRT
    pub codec: String,
    /// ช่องเสียง เช่น 5.1 · ซับไม่มี
    pub layout: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CoverSource {
    /// ไฟล์แนบใน MKV
    Attachment { name: String },
    /// สตรีมภาพที่ติดป้ายภาพปกใน MP4 · index = เลขสตรีมของ ffmpeg
    AttachedPic { index: u64, codec: String },
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Probe {
    pub duration: Option<f64>,
    /// แบบแผงรายละเอียด เช่น 1920 × 1080 · H.264
    pub video: Option<String>,
    /// แบบตาราง เช่น AVC 1080p · HEVC 2160p HDR
    pub video_short: Option<String>,
    pub audio: Vec<Track>,
    pub subs: Vec<Track>,
    /// จำนวนรูปที่แนบในไฟล์
    pub images: u32,
    pub cover: Option<CoverSource>,
    /// ปกแนวนอนตามธรรมเนียม MKV ไฟล์แนบชื่อ cover_land.* (พี่กัน 7 พ.ย. 2569 สั่งแนบได้ทั้งปกตั้งและปกนอน)
    pub cover_land: Option<CoverSource>,
}

/// ชื่อไฟล์แนบตัด นามสกุลออก ตัวเล็ก · cover.jpg → cover · Cover_Land.PNG → cover_land
pub fn att_stem(name: &str) -> String {
    Path::new(&name.to_lowercase()).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default()
}

/// อ่านข้อมูลไฟล์หนังหนึ่งไฟล์
pub fn probe(tools: &Path, file: &Path) -> Result<Probe, String> {
    let out = run_tool_timeout(tools, "ffprobe", [
        OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"),
        OsStr::new("-show_format"), OsStr::new("-show_streams"), file.as_os_str(),
    ], PROBE_TIMEOUT)?;
    if !tool_succeeded("ffprobe", &out.status) {
        let msg = String::from_utf8_lossy(&out.stderr);
        return Err(format!("อ่านข้อมูลไฟล์ไม่ได้ (รหัส {}) {}", exit_text(&out.status), msg.lines().last().unwrap_or("").trim()));
    }
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ ffprobe ไม่ได้: {e}"))?;
    Ok(parse(&j))
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}

/// แปลงผลแบบ JSON ของ ffprobe เป็นข้อมูลที่หน้าจอใช้
pub fn parse(j: &Value) -> Probe {
    let mut p = Probe {
        duration: j["format"].get("duration").and_then(Value::as_str).and_then(|d| d.parse().ok()),
        ..Default::default()
    };
    let empty = vec![];
    let streams = j["streams"].as_array().unwrap_or(&empty);
    for st in streams {
        let kind = s(st, "codec_type");
        let codec = s(st, "codec_name");
        let attached = st["disposition"]["attached_pic"].as_i64() == Some(1);
        let lang = lang_th(st["tags"].get("language").and_then(Value::as_str).unwrap_or(""));
        match kind {
            // ffmpeg 9 รายงานรูปที่แนบใน MKV เป็นสตรีมภาพปกที่มีชื่อไฟล์แนบในป้าย · MP4 ไม่มีชื่อ
            "video" if attached => {
                p.images += 1;
                let fname = st["tags"].get("filename").and_then(Value::as_str);
                let src = match fname {
                    Some(n) => CoverSource::Attachment { name: n.to_string() },
                    None => CoverSource::AttachedPic { index: st["index"].as_u64().unwrap_or(0), codec: codec.to_string() },
                };
                put_cover(&mut p, src);
            }
            "video" if p.video.is_none() => {
                let (w, h) = (st["width"].as_u64().unwrap_or(0), st["height"].as_u64().unwrap_or(0));
                let (long, short) = video_names(codec);
                let hdr = matches!(s(st, "color_transfer"), "smpte2084" | "arib-std-b67");
                p.video = Some(format!("{w} × {h} · {long}"));
                p.video_short = Some(format!("{short} {}{}", res_label(w, h), if hdr { " HDR" } else { "" }));
            }
            "audio" => p.audio.push(Track {
                lang,
                codec: audio_name(codec, s(st, "profile")),
                layout: st["channels"].as_u64().map(layout),
            }),
            "subtitle" => p.subs.push(Track { lang, codec: sub_name(codec), layout: None }),
            "attachment" => {
                let name = st["tags"].get("filename").and_then(Value::as_str).unwrap_or("").to_string();
                let mime = st["tags"].get("mimetype").and_then(Value::as_str).unwrap_or("");
                if mime.starts_with("image/") {
                    p.images += 1;
                    put_cover(&mut p, CoverSource::Attachment { name });
                }
            }
            _ => {}
        }
    }
    p
}

/// ไฟล์แนบชื่อ cover_land.* ไปช่องปกแนวนอน · รูปอื่นแข่งกันเป็นปกหลัก
fn put_cover(p: &mut Probe, src: CoverSource) {
    if matches!(&src, CoverSource::Attachment { name } if att_stem(name) == "cover_land") {
        if p.cover_land.is_none() {
            p.cover_land = Some(src);
        }
    } else if better_cover(&p.cover, &src) {
        p.cover = Some(src);
    }
}

/// รูปไหนควรเป็นปก · ยังไม่มี = เอา · ไฟล์แนบชื่อขึ้นต้นด้วย cover ชนะรูปอื่น (ตามธรรมเนียมของโปรแกรมเล่นหนัง)
fn better_cover(cur: &Option<CoverSource>, new: &CoverSource) -> bool {
    let is_cover = |c: &CoverSource| matches!(c, CoverSource::Attachment { name } if name.to_lowercase().starts_with("cover"));
    match cur {
        None => true,
        Some(old) => is_cover(new) && !is_cover(old),
    }
}

fn video_names(codec: &str) -> (String, String) {
    let (a, b) = match codec {
        "h264" => ("H.264", "AVC"),
        "hevc" => ("H.265", "HEVC"),
        "av1" => ("AV1", "AV1"),
        "mpeg2video" => ("MPEG-2", "MPEG-2"),
        "mpeg4" => ("MPEG-4", "MPEG-4"),
        "vp9" => ("VP9", "VP9"),
        "vp8" => ("VP8", "VP8"),
        "vc1" => ("VC-1", "VC-1"),
        c if c.starts_with("wmv") => ("WMV", "WMV"),
        c => return (c.to_uppercase(), c.to_uppercase()),
    };
    (a.to_string(), b.to_string())
}

/// ป้ายความละเอียดแบบที่คนเรียก ดูจากความกว้าง (หนังที่ตัดขอบดำ 1920 × 800 ก็ยังเรียก 1080p)
fn res_label(w: u64, h: u64) -> String {
    match w {
        w if w >= 3800 => "2160p".into(),
        w if w >= 2500 => "1440p".into(),
        w if w >= 1900 => "1080p".into(),
        w if w >= 1260 => "720p".into(),
        _ => format!("{h}p"),
    }
}

pub(crate) fn audio_name(codec: &str, profile: &str) -> String {
    match codec {
        "aac" => "AAC".into(),
        "ac3" => "AC-3".into(),
        "eac3" => "E-AC-3".into(),
        "dts" if profile.contains("MA") => "DTS-HD MA".into(),
        "dts" => "DTS".into(),
        "truehd" => "TrueHD".into(),
        "flac" => "FLAC".into(),
        "opus" => "Opus".into(),
        "vorbis" => "Vorbis".into(),
        "mp3" => "MP3".into(),
        "mp2" => "MP2".into(),
        "alac" => "ALAC".into(),
        c if c.starts_with("pcm_") => "PCM".into(),
        c if c.starts_with("wma") => "WMA".into(),
        c => c.to_uppercase(),
    }
}

fn sub_name(codec: &str) -> String {
    match codec {
        "subrip" => "SRT".into(),
        "ass" => "ASS".into(),
        "ssa" => "SSA".into(),
        "mov_text" => "Timed Text".into(),
        "hdmv_pgs_subtitle" => "PGS".into(),
        "dvd_subtitle" => "VobSub".into(),
        "dvb_subtitle" => "DVB".into(),
        "webvtt" => "WebVTT".into(),
        c => c.to_uppercase(),
    }
}

pub(crate) fn layout(ch: u64) -> String {
    match ch {
        1 => "1.0".into(),
        2 => "2.0".into(),
        3 => "2.1".into(),
        6 => "5.1".into(),
        7 => "6.1".into(),
        8 => "7.1".into(),
        n => format!("{n} ช่อง"),
    }
}

/// รหัสภาษาในไฟล์ (ISO 639) เป็นชื่อภาษาไทย · ไม่ระบุ = None · รหัสที่ไม่รู้จักโชว์รหัสตัวใหญ่
pub(crate) fn lang_th(code: &str) -> Option<String> {
    let t = match code.to_lowercase().as_str() {
        "" | "und" | "zxx" | "mis" => return None,
        "tha" | "th" => "ไทย",
        "eng" | "en" => "อังกฤษ",
        "jpn" | "ja" => "ญี่ปุ่น",
        "kor" | "ko" => "เกาหลี",
        "chi" | "zho" | "zh" => "จีน",
        "fre" | "fra" | "fr" => "ฝรั่งเศส",
        "ger" | "deu" | "de" => "เยอรมัน",
        "spa" | "es" => "สเปน",
        "ita" | "it" => "อิตาลี",
        "rus" | "ru" => "รัสเซีย",
        "hin" | "hi" => "ฮินดี",
        "vie" | "vi" => "เวียดนาม",
        "ind" | "id" => "อินโดนีเซีย",
        "may" | "msa" | "ms" => "มลายู",
        "lao" | "lo" => "ลาว",
        "bur" | "mya" | "my" => "พม่า",
        "khm" | "km" => "เขมร",
        "por" | "pt" => "โปรตุเกส",
        other => return Some(other.to_uppercase()),
    };
    Some(t.to_string())
}

/// ภาพเล็กของปกที่ทำเสร็จ
#[derive(Debug, Clone)]
pub struct Thumb {
    pub path: PathBuf,
    /// ค่า SHA-256 ของรูปปกในไฟล์ (ก่อนย่อ) ไว้เทียบว่าปกบนชั้นตรงกับปกในไฟล์
    pub cover_sha256: String,
    pub cover_name: String,
    /// กว้างหารสูงของปก (ภาพเล็กคงสัดส่วน) · 2:3 = 0.667 · 16:9 = 1.778
    pub aspect: f32,
}

/// ดึงปกออกจากไฟล์หนัง แล้วย่อเป็น 300 × 450 (คมพอสำหรับปกใหญ่ 150 × 225 บนจอขยาย 200%)
/// ชื่อภาพเล็กมีค่า hash ของปก เปลี่ยนปกแล้วได้ชื่อใหม่ หน้าจอไม่ได้ภาพเก่าค้าง (TECH-REVIEW ข้อ 5)
pub fn make_thumb(tools: &Path, file: &Path, cover: &CoverSource, work: &Path, thumbs: &Path, id: &str) -> Result<Thumb, String> {
    std::fs::create_dir_all(work).map_err(|e| format!("สร้างโฟลเดอร์ชั่วคราวไม่ได้: {e}"))?;
    std::fs::create_dir_all(thumbs).map_err(|e| format!("สร้างโฟลเดอร์ภาพเล็กไม่ได้: {e}"))?;
    let (raw, cover_name) = match cover {
        CoverSource::Attachment { name } => {
            let id_num = mkv_attachment_id(tools, file, name)?;
            let ext = Path::new(name).extension().and_then(OsStr::to_str).unwrap_or("img").to_lowercase();
            let raw = work.join(format!("{id}-ปก.{ext}"));
            let _ = std::fs::remove_file(&raw);
            let mut target = std::ffi::OsString::from(format!("{id_num}:"));
            target.push(raw.as_os_str());
            let out = run_tool_timeout(tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], PROBE_TIMEOUT)?;
            if !tool_succeeded("mkvextract", &out.status) || !raw.exists() {
                return Err(format!("ดึงปกออกจากไฟล์ไม่ได้ (รหัส {})", exit_text(&out.status)));
            }
            (raw, name.clone())
        }
        CoverSource::AttachedPic { index, codec } => {
            let ext = if codec == "png" { "png" } else { "jpg" };
            let raw = work.join(format!("{id}-ปก.{ext}"));
            let _ = std::fs::remove_file(&raw);
            let out = run_tool_timeout(tools, "ffmpeg", [
                OsStr::new("-hide_banner"), OsStr::new("-nostdin"), OsStr::new("-v"), OsStr::new("error"), OsStr::new("-n"),
                OsStr::new("-i"), file.as_os_str(), OsStr::new("-map"), OsStr::new(&format!("0:{index}")),
                OsStr::new("-c"), OsStr::new("copy"), OsStr::new("-frames:v"), OsStr::new("1"), OsStr::new("-f"), OsStr::new("image2"),
                raw.as_os_str(),
            ], PROBE_TIMEOUT)?;
            if !tool_succeeded("ffmpeg", &out.status) || !raw.exists() {
                return Err(format!("ดึงภาพปกออกจากไฟล์ไม่ได้ (รหัส {})", exit_text(&out.status)));
            }
            (raw, format!("ภาพปก.{ext}"))
        }
    };
    let bytes = std::fs::read(&raw).map_err(|e| format!("อ่านปกที่ดึงออกมาไม่ได้: {e}"))?;
    let sha = hex(&Sha256::digest(&bytes));
    // ภาพเล็กคงสัดส่วนเดิม สูง 450 (ปก 2:3 ได้ 300 × 450 · ปกแนวนอน 16:9 ได้ 800 × 450) ชั้นวางวางปกแนวนอนเป็นกรอบแนวนอน
    // เดิมตัดเป็น 300 × 450 ทุกปก ปกแนวนอนเหลือแค่กลางภาพ (พี่กัน 7 พ.ย. 2569 *"ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*)
    // ชื่อลงท้าย -a = ภาพเล็กแบบคงสัดส่วน ภาพเล็กแบบเก่าที่ตัดแล้วไม่มี -a ตัวอ่านโฟลเดอร์สร้างใหม่ให้ (library.rs scan)
    let thumb = thumbs.join(format!("{id}-{}-a.jpg", &sha[..12]));
    let made = if thumb.exists() {
        Ok(())
    } else {
        let out = run_tool_timeout(tools, "ffmpeg", [
            OsStr::new("-hide_banner"), OsStr::new("-nostdin"), OsStr::new("-v"), OsStr::new("error"), OsStr::new("-n"),
            OsStr::new("-i"), raw.as_os_str(),
            OsStr::new("-vf"), OsStr::new("scale=-2:450"),
            OsStr::new("-frames:v"), OsStr::new("1"), OsStr::new("-q:v"), OsStr::new("3"), thumb.as_os_str(),
        ], PROBE_TIMEOUT);
        match out {
            Ok(o) if tool_succeeded("ffmpeg", &o.status) && thumb.exists() => Ok(()),
            Ok(o) => Err(format!("ย่อปกไม่ได้ (รหัส {})", exit_text(&o.status))),
            Err(e) => Err(e),
        }
    };
    let _ = std::fs::remove_file(&raw);
    made?;
    let aspect = image::image_dimensions(&thumb).map(|(w, h)| w as f32 / h.max(1) as f32).unwrap_or(2.0 / 3.0);
    Ok(Thumb { path: thumb, cover_sha256: sha, cover_name, aspect })
}

/// ภาพเล็กรุ่นปัจจุบัน (คงสัดส่วน) ไหม · รุ่นเก่าที่ตัดเป็น 2:3 ต้องสร้างใหม่
pub fn thumb_is_current(path: &str) -> bool {
    path.ends_with("-a.jpg") && Path::new(path).exists()
}

/// เลขไฟล์แนบใน MKV ที่ mkvextract ใช้ หาจากชื่อไฟล์แนบ
fn mkv_attachment_id(tools: &Path, file: &Path, name: &str) -> Result<u64, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], PROBE_TIMEOUT)?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านรายการไฟล์แนบไม่ได้: {e}"))?;
    j["attachments"].as_array()
        .and_then(|a| a.iter().find(|x| x["file_name"].as_str() == Some(name)))
        .and_then(|x| x["id"].as_u64())
        .ok_or_else(|| format!("หาไฟล์แนบ {name} ในไฟล์ไม่เจอ"))
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// ปีที่ออกฉายจากชื่อไฟล์ เช่น ดาวเหนือ (2023)
pub fn year_of(name: &str) -> Option<u32> {
    let b = name.as_bytes();
    (0..b.len().saturating_sub(5)).rev().find_map(|i| {
        if b[i] == b'(' && b[i + 5] == b')' && b[i + 1..i + 5].iter().all(u8::is_ascii_digit) {
            let y: u32 = name[i + 1..i + 5].parse().ok()?;
            (1900..=2100).contains(&y).then_some(y)
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn year_from_name() {
        assert_eq!(year_of("ดาวเหนือ (2023)"), Some(2023));
        assert_eq!(year_of("Iron Tide (2024) 1080p"), Some(2024));
        assert_eq!(year_of("Clip"), None);
        assert_eq!(year_of("Movie (1234)"), None);
    }

    #[test]
    fn parse_names_tracks_and_cover() {
        let j: Value = serde_json::from_str(r#"{
          "format": {"duration": "7680.5"},
          "streams": [
            {"index":0,"codec_type":"video","codec_name":"hevc","width":3840,"height":2160,"color_transfer":"smpte2084","disposition":{"attached_pic":0}},
            {"index":1,"codec_type":"audio","codec_name":"truehd","channels":8,"tags":{"language":"eng"},"disposition":{}},
            {"index":2,"codec_type":"audio","codec_name":"ac3","channels":6,"tags":{"language":"tha"},"disposition":{}},
            {"index":3,"codec_type":"subtitle","codec_name":"subrip","tags":{"language":"tha"},"disposition":{}},
            {"index":4,"codec_type":"attachment","codec_name":"ttf","tags":{"filename":"font.ttf","mimetype":"font/ttf"}},
            {"index":5,"codec_type":"attachment","codec_name":"png","tags":{"filename":"small.png","mimetype":"image/png"}},
            {"index":6,"codec_type":"attachment","codec_name":"mjpeg","tags":{"filename":"cover.jpg","mimetype":"image/jpeg"}}
          ]}"#).unwrap();
        let p = parse(&j);
        assert_eq!(p.duration, Some(7680.5));
        assert_eq!(p.video.as_deref(), Some("3840 × 2160 · H.265"));
        assert_eq!(p.video_short.as_deref(), Some("HEVC 2160p HDR"));
        assert_eq!(p.audio[0], Track { lang: Some("อังกฤษ".into()), codec: "TrueHD".into(), layout: Some("7.1".into()) });
        assert_eq!(p.audio[1].codec, "AC-3");
        assert_eq!(p.subs[0], Track { lang: Some("ไทย".into()), codec: "SRT".into(), layout: None });
        assert_eq!(p.images, 2, "นับเฉพาะไฟล์แนบที่เป็นรูป ไม่นับฟอนต์");
        assert_eq!(p.cover, Some(CoverSource::Attachment { name: "cover.jpg".into() }), "ต้องเลือก cover.jpg ก่อนรูปอื่น");
        assert_eq!(p.cover_land, None);
    }

    /// ไฟล์มีทั้งปกตั้งกับปกนอน · cover_land ไปช่องปกนอน ไม่แย่งปกหลัก ไม่ว่าจะมาก่อนหรือหลัง
    #[test]
    fn parse_cover_and_cover_land() {
        for order in [["cover_land.jpg", "cover.jpg"], ["cover.jpg", "Cover_Land.JPG"]] {
            let j: Value = serde_json::json!({ "format": {}, "streams": order.iter().enumerate().map(|(i, n)| serde_json::json!({
                "index": i, "codec_type": "attachment", "codec_name": "mjpeg", "tags": { "filename": n, "mimetype": "image/jpeg" } })).collect::<Vec<_>>() });
            let p = parse(&j);
            assert_eq!(p.images, 2);
            assert_eq!(p.cover, Some(CoverSource::Attachment { name: "cover.jpg".into() }), "{order:?}");
            assert!(matches!(&p.cover_land, Some(CoverSource::Attachment { name }) if att_stem(name) == "cover_land"), "{order:?}");
        }
    }

    #[test]
    fn mp4_cover_is_attached_pic_not_main_video() {
        let j: Value = serde_json::from_str(r#"{"format":{},"streams":[
            {"index":0,"codec_type":"video","codec_name":"h264","width":1920,"height":800,"disposition":{"attached_pic":0}},
            {"index":1,"codec_type":"video","codec_name":"mjpeg","width":1000,"height":1500,"disposition":{"attached_pic":1}}]}"#).unwrap();
        let p = parse(&j);
        assert_eq!(p.video_short.as_deref(), Some("AVC 1080p"));
        assert_eq!(p.cover, Some(CoverSource::AttachedPic { index: 1, codec: "mjpeg".into() }));
    }
}
