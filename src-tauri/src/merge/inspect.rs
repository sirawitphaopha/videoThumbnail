//! งานรวมไฟล์ เปิดไฟล์หนัง อ่านแทร็ก ไฟล์แนบ ฟอนต์ที่ขาด เพิ่มไฟล์เสียงหรือซับ
//! แยกจาก merge/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- เปิดไฟล์หนัง · เพิ่มไฟล์

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: u64,
    pub name: String,
    pub mime: String,
    pub size: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeMovie {
    path: String,
    name: String,
    ext: String,
    size: u64,
    pub(crate) duration: Option<f64>,
    pub(crate) tracks: Vec<Track>,
    pub(crate) attachments: Vec<Attachment>,
    free: u64,
    drive: String,
    /// ทำ MP4 ได้ไหม (จับคู่แทร็กของสองเครื่องมือได้ครบ)
    pub(crate) mp4_ok: bool,
}

pub(crate) fn attachments_of(j: &Value) -> Vec<Attachment> {
    j["attachments"].as_array().map(|a| a.iter().map(|x| Attachment {
        id: x["id"].as_u64().unwrap_or(0),
        name: x["file_name"].as_str().unwrap_or("").to_string(),
        mime: x["content_type"].as_str().unwrap_or("").to_string(),
        size: x["size"].as_u64().unwrap_or(0),
    }).collect()).unwrap_or_default()
}

pub(crate) fn tools_of(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((crate::app::tools::tools_dir(app)?, local.join("tmp")))
}

pub fn inspect(tools: &Path, p: &Path) -> Result<MergeMovie, String> {
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !crate::app::library::ACCEPTED.contains(&ext.as_str()) {
        return Err(format!("ไฟล์ .{ext} ไม่ใช่ไฟล์หนังที่ใช้ได้"));
    }
    let size = std::fs::metadata(p).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
    let mk = mkv_json(tools, p)?;
    let tracks = probe_source(tools, p, true)?;
    let ff = ffprobe_json(tools, p).ok();
    let dir = p.parent().unwrap_or(Path::new(""));
    Ok(MergeMovie {
        path: p.to_string_lossy().to_string(),
        name: p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        ext,
        size,
        duration: ff.as_ref().and_then(duration_of).or_else(|| mk["container"]["properties"]["duration"].as_u64().map(|ns| ns as f64 / 1e9)),
        mp4_ok: tracks.iter().all(|t| t.ff.is_some()),
        tracks,
        attachments: attachments_of(&mk),
        free: free_space(dir),
        drive: drive_letter(dir),
    })
}

/// ฟอนต์ที่ซับซึ่งจะใส่กลับเข้าหนังเรียก แต่ยังไม่มีในไฟล์แนบของหนัง (BUGS ข้อ 114 · ผู้ช่วยตรวจทาน R6)
/// ชื่อฟอนต์ในหนังอ่านจากไฟล์ฟอนต์ที่ดึงออกมาจริง (subshot movie_fonts) ไม่ใช่จากชื่อไฟล์แนบ · หาไฟล์ข้างหนังก่อน แล้วฟอนต์ของผู้ใช้ แล้วของ Windows
/// คืนทุกชื่อที่ยังไม่มี ทั้งที่หาเจอ (file มีค่า) และหาไม่เจอ ให้หน้าจอบอกก่อนกด
pub fn missing_fonts(tools: &Path, work: &Path, movie: &Path, sub_text: &str) -> Vec<crate::subtitle::fonts::FontHit> {
    let wanted = crate::subtitle::fonts::ass_fonts(sub_text);
    if wanted.is_empty() { return vec![]; }
    let mut have: Vec<String> = vec![];
    if let Some(dir) = crate::subtitle::subshot::movie_fonts(tools, work, movie) {
        for e in std::fs::read_dir(&dir).into_iter().flatten().flatten() {
            if e.file_name() == ".ok" { continue; }
            have.extend(crate::subtitle::fonts::font_names(&e.path()).into_iter().map(|n| n.to_lowercase()));
        }
    }
    let missing: Vec<String> = wanted.into_iter().filter(|w| !have.contains(&w.to_lowercase())).collect();
    if missing.is_empty() { return vec![]; }
    crate::subtitle::fonts::find(movie, &missing)
}

#[tauri::command]
pub async fn remux_fonts(app: AppHandle, movie: String, text: String) -> Result<Vec<crate::subtitle::fonts::FontHit>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, work) = tools_of(&app)?;
        std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
        Ok(missing_fonts(&tools, &work, Path::new(&movie), &text))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn merge_inspect(app: AppHandle, path: String) -> Result<MergeMovie, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        inspect(&tools, Path::new(&path))
    }).await.map_err(|e| e.to_string())?
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddedFile {
    path: String,
    name: String,
    ext: String,
    size: u64,
    /// เปิดให้เทสในโปรแกรมอ่านได้ (pgs.rs other_text_formats_open)
    pub(crate) tracks: Vec<Track>,
    /// ดีเลย์ที่อ่านจากชื่อไฟล์
    pub(crate) delay_from_name: Option<i64>,
    /// ภาษาที่เดาจากชื่อไฟล์
    pub(crate) lang_from_name: Option<String>,
    /// ยาวกว่าหนังกี่วินาที (บวก = ยาวกว่า) · ไม่รู้ความยาวไม่บอก
    pub(crate) longer_by: Option<f64>,
    notes: Vec<String>,
    /// ซับ ASS SSA · ฟอนต์ที่ซับใช้กับไฟล์ฟอนต์ที่หาเจอ (fonts.rs)
    pub(crate) fonts: Vec<crate::subtitle::fonts::FontHit>,
}

/// ชื่อชนิดซับตามที่ ffprobe เรียก ของนามสกุลใน subs::FF_TEXT · หน้าจอแปลงเป็นป้าย SAMI MicroDVD ฯลฯ (ftypes.tsx ftName)
fn ff_text_codec(ext: &str) -> &'static str {
    match ext { "smi" | "sami" => "sami", "sub" => "microdvd", "lrc" => "lrc", "rt" => "realtext", "jss" => "jacosub", "aqt" => "aqtitle", "pjs" => "pjs", "mpl" => "mpl2", "scc" => "eia_608", _ => "text" }
}

pub fn add_file(tools: &Path, path: &Path, movie_duration: Option<f64>) -> Result<AddedFile, String> {
    let mut p = path.to_path_buf();
    let mut notes = vec![];
    let mut ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    // ซับ DVD สองไฟล์คู่กัน .idx บอกเวลา .sub เก็บรูป · ลาก .sub มาก็ใช้ .idx ข้าง ๆ (mkvmerge อ่านจาก .idx)
    if ext == "sub" {
        let idx = p.with_extension("idx");
        if idx.exists() {
            p = idx;
            ext = "idx".into();
            notes.push("ซับ DVD ใช้ไฟล์ .idx คู่กับ .sub".into());
        }
    }
    if matches!(ext.as_str(), "ape" | "tak") {
        return Err(format!("ไฟล์ .{ext} ใส่ในไฟล์หนังไม่ได้ ต้องแปลงเป็นชนิดอื่นก่อน (ตั้งค่าแปลงในแถวเสียง)"));
    }
    let size = std::fs::metadata(&p).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
    // ซับ HD DVD mkvmerge อ่านไม่ได้ จึงรวมเข้าหนังไม่ได้ · เดิมขึ้นข้อความผิดพลาดของ mkvmerge (BUGS ข้อ 129)
    if crate::subtitle::imgconv::is_hddvd_sup(&p) { return Err(HD_DVD_MERGE.into()); }
    // SBV กับ TTML ffprobe อ่านไม่ได้ ทำแทร็กซับขึ้นเองหนึ่งแทร็ก นับบรรทัดจากที่แปลงเป็น SRT (subconv.rs) · ใส่ในหนังตรง ๆ ไม่ได้
    let mut tracks = if crate::subtitle::subs::OWN_TEXT.contains(&ext.as_str()) {
        let raw = std::fs::read(&p).map_err(|e| format!("อ่านไฟล์ไม่ได้ {e}"))?;
        let srt = crate::subtitle::subconv::to_srt(&ext, &crate::subtitle::subs::decode_text(&raw).0)?;
        let lines = srt.split("\r\n\r\n").filter(|b| b.contains("-->")).count() as u64;
        vec![Track {
            src: p.to_string_lossy().to_string(), tid: 0, ff: Some(0), kind: "subtitle".into(), codec: ext.clone(), lang: "und".into(), frames: Some(lines),
            mp4: "no".into(), why: Some("ไฟล์ชนิดนี้ใส่ในหนังตรง ๆ ไม่ได้ เปิดในหน้าซับไตเติลแล้วบันทึกเป็น SRT หรือ ASS ก่อน".into()), keep: true, ..Default::default()
        }]
    } else if crate::subtitle::subs::FF_TEXT.contains(&ext.as_str()) {
        // SAMI MicroDVD LRC และพวก mkvmerge ไม่รู้จัก แต่ ffmpeg อ่านได้ (หน้าซับไตเติลแปลงเป็น ASS ตอนเปิด subs.rs bytes_of) · ทำแทร็กซับเองหนึ่งแทร็ก จำนวนบรรทัดให้ ffprobe นับข้างล่าง
        // เดิมส่งให้ mkvmerge อย่างเดียว เปิดซับ SAMI ไม่ได้ว่า mkvmerge อ่านไม่ได้ (BUGS ข้อ 123 เจอจากตัวตรวจ check-pgs 15 พ.ย. 2569)
        // จำนวนบรรทัดนับจากซับที่แปลงแล้ว เพราะ ffprobe นับบรรทัดว่างที่ใช้ปิดซับ (SAMI &nbsp;) เป็นบรรทัดด้วย ได้เกินจริงเท่าตัว
        match probe_source(tools, &p, false) {
            Ok(t) if t.iter().any(|x| x.kind == "subtitle") => t,
            _ => vec![Track {
                src: p.to_string_lossy().to_string(), tid: 0, ff: Some(0), kind: "subtitle".into(), codec: ff_text_codec(&ext).into(), lang: "und".into(),
                frames: crate::subtitle::subs::bytes_of(tools, &std::env::temp_dir(), &p, false, 0, 0).ok().map(|(b, _)| String::from_utf8_lossy(&b).lines().filter(|l| l.starts_with("Dialogue:")).count() as u64),
                mp4: "no".into(), why: Some("ไฟล์ชนิดนี้ใส่ในหนังตรง ๆ ไม่ได้ เปิดในหน้าซับไตเติลแล้วบันทึกเป็น SRT หรือ ASS ก่อน".into()), keep: true, ..Default::default()
            }],
        }
    } else {
        probe_source(tools, &p, false)?
    };
    if tracks.is_empty() {
        return Err("ไฟล์นี้ไม่มีเสียงหรือซับ".into());
    }
    let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stem = p.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let delay = delay_from_name(&name);
    let lang = lang_from_name(&stem);
    let charset = sub_charset(&p);
    if charset.as_deref() == Some("CP874") {
        notes.push("ซับเข้ารหัสภาษาไทยแบบเก่า (TIS-620) โปรแกรมแปลงให้".into());
    }
    // ซับตัวหนังสือในไฟล์แยก ffprobe ไม่รู้จำนวนบรรทัด นับเอง (ไฟล์เล็ก)
    let count_subs = tracks.iter().any(|t| t.kind == "subtitle" && t.frames.is_none());
    let packets = if count_subs {
        run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-select_streams"), OsStr::new("s"),
            OsStr::new("-count_packets"), OsStr::new("-show_entries"), OsStr::new("stream=nb_read_packets"), OsStr::new("-of"), OsStr::new("csv=p=0"), p.as_os_str()],
            Duration::from_secs(60)).ok().map(|o| String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| l.trim().trim_end_matches(',').parse::<u64>().ok()).collect::<Vec<_>>())
    } else {
        None
    };
    let mut si = 0;
    for t in tracks.iter_mut() {
        t.delay = delay.unwrap_or(0);
        if t.lang == "und" {
            if let Some(l) = lang { t.lang = l.into(); }
        }
        t.default = false;
        t.forced = false;
        if t.kind == "subtitle" {
            t.charset = charset.clone();
            if t.frames.is_none() {
                t.frames = packets.as_ref().and_then(|v| v.get(si).copied());
            }
            si += 1;
        }
    }
    let dur = tracks.iter().filter(|t| t.kind == "audio").filter_map(|t| t.duration).fold(None, |m: Option<f64>, d| Some(m.map_or(d, |x| x.max(d))));
    let longer_by = match (dur, movie_duration) { (Some(a), Some(m)) if m > 0.0 => Some(a - m), _ => None };
    // ซับ ASS บอกแค่ชื่อฟอนต์ · หาไฟล์ฟอนต์ให้ ไว้ฝังไปกับไฟล์ใหม่ (พี่กันสั่ง 8 พ.ย. 2569)
    let fonts = if matches!(ext.as_str(), "ass" | "ssa") {
        std::fs::read(&p).ok().map(|b| crate::subtitle::fonts::find(&p, &crate::subtitle::fonts::ass_fonts(&crate::subtitle::subs::decode_text(&b).0))).unwrap_or_default()
    } else {
        vec![]
    };
    Ok(AddedFile {
        path: p.to_string_lossy().to_string(), name, ext, size, tracks, delay_from_name: delay, lang_from_name: lang.map(String::from), longer_by, notes, fonts,
    })
}

const HD_DVD_MERGE: &str = "ไฟล์นี้เป็นซับภาพของแผ่น HD DVD ซึ่งใส่ในหนังตรง ๆ ไม่ได้ เปิดในหน้าซับไตเติลแล้วแปลงเป็น PGS ก่อน";

/// หน้าซับไตเติลเปิดไฟล์ซับเพื่อดูและแปลง ไม่ใช่รวมไฟล์ · รับซับ HD DVD ที่ mkvmerge อ่านไม่ได้เพิ่ม (BUGS ข้อ 129 ย้ายจาก ROADMAP พี่กันสั่ง "ทำเลย เอาไปใส่คิว")
/// ตัวดูซับรูปถอดภาพจาก PGS ที่ BDSup2Sub++ แปลงไว้ (imgconv::hddvd_pgs) และหน้าต่างแปลงซับภาพส่งไฟล์ต้นฉบับให้ BDSup2Sub++ ตรง ๆ
pub fn add_file_view(tools: &Path, work: &Path, path: &Path) -> Result<AddedFile, String> {
    if !crate::subtitle::imgconv::is_hddvd_sup(path) { return add_file(tools, path, None); }
    let size = std::fs::metadata(path).map_err(|_| "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string())?.len();
    let (_, n) = crate::subtitle::imgconv::hddvd_pgs(tools, work, path)?;
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let stem = path.file_stem().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let lang = lang_from_name(&stem);
    let track = Track {
        src: path.to_string_lossy().to_string(), tid: 0, ff: Some(0), kind: "subtitle".into(), codec: "hddvd_sup".into(), lang: lang.unwrap_or("und").into(),
        frames: Some(n as u64), mp4: "no".into(), why: Some(HD_DVD_MERGE.into()), keep: true, ..Default::default()
    };
    Ok(AddedFile {
        path: path.to_string_lossy().to_string(), name, ext: "sup".into(), size, tracks: vec![track], delay_from_name: None, lang_from_name: lang.map(String::from), longer_by: None,
        notes: vec!["ซับภาพของแผ่น HD DVD โปรแกรมแปลงเป็น PGS ไว้ดูภาพ ไฟล์ต้นฉบับไม่ถูกแตะ".into()], fonts: vec![],
    })
}

/// view เป็นจริงเมื่อหน้าซับไตเติลเปิด (add_file_view) · หน้าเสียงและซับกับงานใส่ซับกลับเข้าหนังไม่ส่ง
#[tauri::command]
pub async fn merge_add_file(app: AppHandle, path: String, movie_duration: Option<f64>, view: Option<bool>) -> Result<AddedFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (tools, _) = tools_of(&app)?;
        if view == Some(true) { return add_file_view(&tools, &crate::subtitle::subs::work_dir(&app)?, Path::new(&path)); }
        add_file(&tools, Path::new(&path), movie_duration)
    }).await.map_err(|e| e.to_string())?
}

