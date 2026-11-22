//! งานรวมไฟล์ แทร็กหนึ่งแทร็ก อ่านจาก mkvmerge กับ ffprobe ดีเลย์กับภาษาจากชื่อไฟล์ รหัสอักษรของซับ
//! แยกจาก merge/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- แทร็ก

/// แทร็กหนึ่งแทร็ก ทั้งแทร็กในหนังและในไฟล์ที่เพิ่ม · หน้าจอแก้ภาษา ชื่อ ธงหลัก ดีเลย์ เอาออก แล้วส่งกลับมาทั้งรายการตามลำดับใหม่
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Track {
    /// ไฟล์ที่แทร็กนี้อยู่
    pub src: String,
    /// เลขแทร็กของ mkvmerge (ใช้กับ --sync --language --track-order)
    pub tid: u64,
    /// เลขสตรีมของ ffprobe ใช้ตอนทำ MP4 · ไม่มี = จับคู่สองเครื่องมือไม่ได้ ทำ MP4 ไม่ได้
    pub ff: Option<u64>,
    /// video audio subtitle
    pub kind: String,
    /// ชื่อ codec แบบ ffprobe เช่น ac3 subrip hdmv_pgs_subtitle
    pub codec: String,
    pub profile: Option<String>,
    /// รหัสภาษา ISO 639-2 สามตัว · und = ไม่ระบุ
    pub lang: String,
    /// ภาษาแบบละเอียด BCP 47 ที่ไฟล์บอก เช่น zh-Hant es-419 (mkvmerge language_ietf) · ว่าง = ไฟล์ไม่ได้บอก (BUGS ข้อ 114)
    pub lang_ietf: String,
    /// ภาษาสามตัวตอนอ่านจากไฟล์ · หน้าจอเปลี่ยนภาษาแล้ว lang ไม่เท่าค่านี้ ภาษาแบบละเอียดเดิมใช้ไม่ได้ ส่งภาษาสามตัวแทน
    pub lang_was: String,
    pub name: String,
    pub default: bool,
    pub forced: bool,
    /// ป้ายพิเศษของแทร็ก Matroska (mkvmerge flag_*) · ซับหรือเสียงสำหรับคนหูหนวก คนตาบอด คำบรรยายภาพ ภาษาต้นฉบับ เสียงบรรยายของผู้กำกับ
    pub hearing_impaired: bool,
    pub visual_impaired: bool,
    pub text_descriptions: bool,
    pub original: bool,
    pub commentary: bool,
    pub channels: Option<u64>,
    pub layout: Option<String>,
    pub rate: Option<u64>,
    pub bits: Option<u64>,
    /// บิตเรต บิตต่อวินาที
    pub bitrate: Option<u64>,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub fps: Option<f64>,
    pub duration: Option<f64>,
    pub bytes: Option<u64>,
    /// ซับ = จำนวนบรรทัดหรือจำนวนภาพ
    pub frames: Option<u64>,
    /// ok ใส่ MP4 ได้ · style ได้แต่สีกับฟอนต์หาย · no ไม่ได้
    pub mp4: String,
    pub why: Option<String>,
    /// ชุดอักษรของซับตัวหนังสือที่ส่งให้ mkvmerge (UTF-8 · CP874 คือไทยแบบเก่า TIS-620)
    pub charset: Option<String>,
    /// ดีเลย์ มิลลิวินาที
    pub delay: i64,
    /// เอาไว้ในไฟล์ใหม่ไหม · false = เอาออก
    pub keep: bool,
    /// แทร็กในหนัง (true) หรือไฟล์ที่เพิ่ม (false)
    pub in_movie: bool,
    /// แปลงชนิดเสียงตอนรวม (ค่าในแผงตั้งค่าเสียง) · ไม่มี = ไม่แปลง เสียงเดิมทุกไบต์
    pub convert: Option<crate::audio::encode::EncodeSpec>,
    /// แทร็กในหนังที่แปลง · true เพิ่มคู่กับแทร็กเดิม (ค่าตั้งต้นที่พี่กันเคาะ) · false แทนที่แทร็กเดิม
    pub pair: bool,
    /// ชื่อแทร็กใหม่ที่ได้จากการแปลงแบบเพิ่มคู่ · ว่าง = ชื่อเดิมต่อด้วยชนิดใหม่
    pub conv_name: String,
}

/// ffprobe codec_name จากรหัส codec ของ mkvmerge · ใช้ตอนจับคู่ ffprobe ไม่ได้
fn codec_from_mkv(codec_id: &str, codec: &str) -> String {
    let c = match codec_id {
        "A_AC3" => "ac3", "A_EAC3" => "eac3", "A_DTS" => "dts", "A_TRUEHD" | "A_MLP" => "truehd", "A_AAC" => "aac", "A_OPUS" => "opus",
        "A_MPEG/L3" => "mp3", "A_MPEG/L2" => "mp2", "A_VORBIS" => "vorbis", "A_FLAC" => "flac", "A_PCM/INT/LIT" | "A_PCM/INT/BIG" => "pcm_s16le",
        "A_WAVPACK4" => "wavpack", "A_TTA1" => "tta", "A_ALAC" => "alac",
        "S_TEXT/UTF8" => "subrip", "S_TEXT/ASS" | "S_TEXT/SSA" => "ass", "S_TEXT/WEBVTT" => "webvtt", "S_HDMV/PGS" => "hdmv_pgs_subtitle", "S_VOBSUB" => "dvd_subtitle",
        "V_MPEG4/ISO/AVC" => "h264", "V_MPEGH/ISO/HEVC" => "hevc", "V_AV1" => "av1", "V_VP9" => "vp9", "V_MPEG2" => "mpeg2video",
        _ => "",
    };
    if !c.is_empty() {
        return c.into();
    }
    match codec {
        "AC-3" => "ac3", "E-AC-3" => "eac3", "AAC" => "aac", "SubRip/SRT" => "subrip", "SubStationAlpha" => "ass", "WebVTT" => "webvtt",
        "HDMV PGS" => "hdmv_pgs_subtitle", "VobSub" => "dvd_subtitle", "FLAC" => "flac", "Opus" => "opus", "MP3" => "mp3",
        _ => "",
    }.to_string()
}

fn kind_of_mkv(t: &str) -> &'static str {
    match t { "video" => "video", "audio" => "audio", "subtitles" => "subtitle", _ => "" }
}

/// เวลาแบบ 00:01:00.021000000 เป็นวินาที
fn hms(s: &str) -> Option<f64> {
    let mut parts = s.split(':').rev();
    let sec: f64 = parts.next()?.parse().ok()?;
    let min: f64 = parts.next().and_then(|m| m.parse().ok()).unwrap_or(0.0);
    let hr: f64 = parts.next().and_then(|h| h.parse().ok()).unwrap_or(0.0);
    Some(hr * 3600.0 + min * 60.0 + sec)
}

fn num(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))
}

pub fn mkv_json(tools: &Path, file: &Path) -> Result<Value, String> {
    let out = run_tool_timeout(tools, "mkvmerge", [OsStr::new("-J"), file.as_os_str()], Duration::from_secs(60))?;
    let j: Value = serde_json::from_slice(&out.stdout).map_err(|e| format!("อ่านผลของ mkvmerge ไม่ได้: {e}"))?;
    if !tool_succeeded("mkvmerge", &out.status) || j["container"]["recognized"].as_bool() == Some(false) || j["container"]["supported"].as_bool() == Some(false) {
        return Err("ไฟล์ชนิดนี้ใส่ในไฟล์หนังไม่ได้ (mkvmerge อ่านไม่ได้)".into());
    }
    Ok(j)
}

/// แทร็กทั้งหมดของไฟล์ · เลขแทร็กกับธงจาก mkvmerge (ใช้ตอนรวม) รายละเอียดเสียงภาพจาก ffprobe
/// จับคู่สองเครื่องมือตามลำดับแทร็ก ชนิดต้องตรงกันทุกคู่ ไม่ตรง = ไม่ใส่เลข ffprobe (ทำ MP4 ไม่ได้ ทำ MKV ได้)
pub fn probe_source(tools: &Path, file: &Path, in_movie: bool) -> Result<Vec<Track>, String> {
    let mk = mkv_json(tools, file)?;
    let ff = ffprobe_json(tools, file).ok();
    let empty = vec![];
    let mk_tracks: Vec<&Value> = mk["tracks"].as_array().unwrap_or(&empty).iter().filter(|t| !kind_of_mkv(t["type"].as_str().unwrap_or("")).is_empty()).collect();
    let ff_streams: Vec<&Value> = ff.as_ref().and_then(|j| j["streams"].as_array()).unwrap_or(&empty).iter()
        .filter(|s| matches!(s["codec_type"].as_str(), Some("video" | "audio" | "subtitle")) && s["disposition"]["attached_pic"].as_i64() != Some(1))
        .collect();
    let paired = mk_tracks.len() == ff_streams.len()
        && mk_tracks.iter().zip(&ff_streams).all(|(m, f)| kind_of_mkv(m["type"].as_str().unwrap_or("")) == f["codec_type"].as_str().unwrap_or("-"));
    let src = file.to_string_lossy().to_string();
    Ok(mk_tracks.iter().enumerate().map(|(i, m)| {
        let p = &m["properties"];
        let f = if paired { ff_streams[i] } else { &Value::Null };
        let kind = kind_of_mkv(m["type"].as_str().unwrap_or("")).to_string();
        let codec = f["codec_name"].as_str().map(String::from)
            .unwrap_or_else(|| codec_from_mkv(p["codec_id"].as_str().unwrap_or(""), m["codec"].as_str().unwrap_or("")));
        let (fit, why) = mp4_fit(&kind, &codec);
        let tags = &f["tags"];
        let fps = f["avg_frame_rate"].as_str().and_then(|r| {
            let (a, b) = r.split_once('/')?;
            let (a, b): (f64, f64) = (a.parse().ok()?, b.parse().ok()?);
            (b > 0.0 && a > 0.0).then(|| a / b)
        });
        let lang = p["language"].as_str().unwrap_or("und").to_string();
        let lang = if lang.is_empty() { "und".to_string() } else { lang };
        let fl = |k: &str| p[k].as_bool().unwrap_or(false);
        Track {
            src: src.clone(),
            tid: m["id"].as_u64().unwrap_or(0),
            ff: paired.then(|| f["index"].as_u64()).flatten(),
            kind,
            profile: f["profile"].as_str().map(String::from),
            lang_ietf: p["language_ietf"].as_str().unwrap_or("").to_string(),
            lang_was: lang.clone(),
            lang,
            name: p["track_name"].as_str().unwrap_or("").to_string(),
            default: p["default_track"].as_bool().unwrap_or(false),
            forced: p["forced_track"].as_bool().unwrap_or(false),
            hearing_impaired: fl("flag_hearing_impaired"),
            visual_impaired: fl("flag_visual_impaired"),
            text_descriptions: fl("flag_text_descriptions"),
            original: fl("flag_original"),
            commentary: fl("flag_commentary"),
            channels: p["audio_channels"].as_u64().or_else(|| f["channels"].as_u64()),
            layout: f["channel_layout"].as_str().map(String::from),
            rate: p["audio_sampling_frequency"].as_u64().or_else(|| num(&f["sample_rate"])),
            bits: p["audio_bits_per_sample"].as_u64().or_else(|| num(&f["bits_per_raw_sample"])).filter(|b| *b > 0),
            bitrate: num(&f["bit_rate"]).or_else(|| num(&tags["BPS"])).or_else(|| num(&p["tag_bps"])),
            width: f["width"].as_u64(),
            height: f["height"].as_u64(),
            fps,
            duration: tags["DURATION"].as_str().and_then(hms).or_else(|| f["duration"].as_str().and_then(|d| d.parse().ok()))
                .or_else(|| p["tag_duration"].as_str().and_then(hms)),
            bytes: num(&tags["NUMBER_OF_BYTES"]).or_else(|| num(&p["tag_number_of_bytes"])),
            frames: num(&tags["NUMBER_OF_FRAMES"]).or_else(|| num(&p["tag_number_of_frames"])),
            mp4: fit.into(),
            why,
            charset: None,
            delay: 0,
            keep: true,
            in_movie,
            codec,
            convert: None,
            pair: true,
            conv_name: String::new(),
        }
    }).collect())
}

/// ดีเลย์จากชื่อไฟล์ แบบที่ eac3to กับคนแจกเสียงเขียน "DELAY -120ms" "delay 250 ms" "Delay_-48ms"
pub fn delay_from_name(name: &str) -> Option<i64> {
    let low = name.to_lowercase();
    let mut from = 0;
    while let Some(at) = low[from..].find("delay") {
        let rest = &low[from + at + 5..];
        let rest = rest.trim_start_matches([' ', '_', '=', ':']);
        let (sign, digits) = match rest.chars().next() {
            Some('-') => (-1, &rest[1..]),
            Some('+') => (1, &rest[1..]),
            _ => (1, rest),
        };
        let n: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !n.is_empty() {
            let after = digits[n.len()..].trim_start_matches([' ', '_']);
            // ต้องตามด้วย ms หรือจบคำ · กันชื่อแบบ "delay2" ที่ไม่ใช่ดีเลย์
            if after.starts_with("ms") || after.is_empty() || after.starts_with(['.', ')', ']', ' ']) {
                return n.parse::<i64>().ok().map(|v| sign * v).filter(|v| v.abs() <= 600_000);
            }
        }
        from += at + 5;
    }
    None
}

/// ภาษาจากชื่อไฟล์ · คำไทย (พากย์ไทย ซับไทย อังกฤษ) หรือรหัสท้ายชื่อ (.th. .tha. .eng.) หรือชื่ออังกฤษ (Thai English)
/// รหัสสองตัวที่ชนคำอังกฤษบ่อย (it my no) ดูเฉพาะคำท้ายสุด
pub fn lang_from_name(stem: &str) -> Option<&'static str> {
    const THAI_WORDS: [(&str, &str); 6] = [("ไทย", "tha"), ("อังกฤษ", "eng"), ("ญี่ปุ่น", "jpn"), ("เกาหลี", "kor"), ("จีน", "chi"), ("ฝรั่งเศส", "fre")];
    if let Some((_, c)) = THAI_WORDS.iter().find(|(w, _)| stem.contains(w)) {
        return Some(c);
    }
    let code = |t: &str| -> Option<&'static str> {
        Some(match t {
            "th" | "tha" | "thai" => "tha", "en" | "eng" | "english" => "eng", "ja" | "jpn" | "jap" | "japanese" => "jpn",
            "ko" | "kor" | "korean" => "kor", "zh" | "chi" | "zho" | "chs" | "cht" | "chinese" => "chi", "fr" | "fre" | "fra" | "french" => "fre",
            "de" | "ger" | "deu" | "german" => "ger", "es" | "spa" | "spanish" => "spa", "ita" | "italian" => "ita", "ru" | "rus" | "russian" => "rus",
            "pt" | "por" | "portuguese" => "por", "vi" | "vie" | "vietnamese" => "vie", "ind" | "indonesian" => "ind", "may" | "msa" | "malay" => "may",
            "hin" | "hindi" => "hin", "ara" | "arabic" => "ara", "lao" => "lao", "khm" | "khmer" => "khm", "bur" | "burmese" => "bur",
            _ => return None,
        })
    };
    let low = stem.to_lowercase();
    let tokens: Vec<&str> = low.split(|c: char| !c.is_ascii_alphanumeric()).filter(|t| !t.is_empty()).collect();
    let skip = |t: &str| t.chars().all(|c| c.is_ascii_digit()) || matches!(t, "forced" | "sdh" | "cc" | "default" | "full" | "delay" | "ms" | "tis620" | "cp874" | "utf8")
        || (t.ends_with("ms") && t.starts_with(|c: char| c.is_ascii_digit()));
    // คำท้ายสุดที่มีความหมาย
    if let Some(last) = tokens.iter().rev().find(|t| !skip(t)) {
        if let Some(c) = code(last) {
            return Some(c);
        }
    }
    // ชื่ออังกฤษเต็ม (thai english japanese) อยู่ตรงไหนก็ได้
    tokens.iter().find_map(|t| if t.len() >= 4 { code(t) } else { None })
}

/// ชุดอักษรของไฟล์ซับตัวหนังสือ · มี BOM ไม่ต้องบอก (mkvmerge อ่านเอง) · UTF-8 ถูกต้อง = UTF-8 · มีอักษรช่วงไทยของ TIS-620 = CP874
pub fn sub_charset(path: &Path) -> Option<String> {
    let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !matches!(ext.as_str(), "srt" | "ass" | "ssa" | "vtt" | "txt") {
        return None;
    }
    let mut b = std::fs::read(path).ok()?;
    b.truncate(8 << 20);
    if b.starts_with(&[0xEF, 0xBB, 0xBF]) || b.starts_with(&[0xFF, 0xFE]) || b.starts_with(&[0xFE, 0xFF]) {
        return None;
    }
    // กติกาเดียวกับตัวดูซับ · ไม่ใช่ไทยจริงถือเป็น Windows-1252 ไม่เดาเป็นไทย (ผู้ช่วยตรวจขั้น 10 ข้อ 4)
    Some(crate::subtitle::subs::guess_charset(&b).into())
}

