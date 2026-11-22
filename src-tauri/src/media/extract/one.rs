//! แยกแทร็กทีละรายการ นามสกุลตาม codec ชื่อไฟล์ที่ว่าง หาแทร็กใน MKV VobSub ไฟล์ชั่วคราว
//! แยกจาก extract/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

/// รหัสภาษาสามตัวของ mkvmerge เป็นสองตัวแบบที่หน้า MediaInfo ส่งมา · und ไม่ใส่
pub(crate) fn short_lang(l: &str) -> Option<String> {
    let l = l.to_lowercase();
    let s = match l.as_str() { "" | "und" => return None, "tha" => "th", "eng" => "en", "jpn" => "ja", "kor" => "ko", "chi" | "zho" => "zh", "fre" | "fra" => "fr", "ger" | "deu" => "de", "spa" => "es", "ita" => "it", "rus" => "ru", "por" => "pt", "vie" => "vi", _ => return Some(l) };
    Some(s.into())
}

/// นามสกุลของแทร็กตาม codec id ของ Matroska · ใช้ตอนแยกหลายไฟล์ แต่ละไฟล์อาจเป็นเสียงคนละชนิด
pub(crate) fn ext_of_codec(kind: &str, codec_id: &str, raw_video: Option<&str>) -> String {
    let c = codec_id.to_uppercase();
    if kind == "video" {
        return match raw_video { Some(_) if c.starts_with("V_MPEG4/ISO/AVC") => "h264".into(), Some(_) if c.starts_with("V_MPEGH/ISO/HEVC") => "h265".into(), _ => "mkv".into() };
    }
    let e = if c.starts_with("A_AC3") { "ac3" } else if c.starts_with("A_EAC3") { "eac3" } else if c.starts_with("A_DTS") { "dts" } else if c.starts_with("A_TRUEHD") { "thd" }
        else if c.starts_with("A_MLP") { "mlp" } else if c.starts_with("A_FLAC") { "flac" } else if c.starts_with("A_AAC") { "aac" } else if c.starts_with("A_OPUS") { "opus" }
        else if c.starts_with("A_VORBIS") { "ogg" } else if c == "A_MPEG/L3" { "mp3" } else if c == "A_MPEG/L2" { "mp2" } else if c.starts_with("A_PCM") { "wav" } else if c.starts_with("A_WAVPACK") { "wv" } else if c.starts_with("A_TTA") { "tta" }
        else if c == "S_TEXT/UTF8" || c == "S_TEXT/ASCII" { "srt" } else if c == "S_TEXT/ASS" { "ass" } else if c == "S_TEXT/SSA" { "ssa" } else if c == "S_TEXT/WEBVTT" { "vtt" }
        else if c == "S_HDMV/PGS" { "sup" } else if c == "S_VOBSUB" { "sub" } else if kind == "audio" { "mka" } else { "mks" };
    e.into()
}

/// ชื่อไฟล์แนบใน MKV เป็นข้อความอะไรก็ได้ (เช่น `x\..\..\Startup\a.cmd`) · เอาเฉพาะชื่อส่วนท้าย ตัดอักษรที่ Windows ห้ามในชื่อไฟล์และอักษรควบคุม
/// ชื่อว่าง ชื่อสงวน หรือเหลือแต่จุด ใช้ attachment<n>.<ext> แทน · เดิมใช้ชื่อตรง ๆ แยกแล้วไฟล์ไปโผล่นอกโฟลเดอร์ที่เลือกได้ (ผู้ช่วยตรวจโค้ดเจอ)
pub(crate) fn safe_att_name(it: &Item) -> String {
    let fallback = || format!("attachment{}.{}", it.nth, it.ext);
    let Some(raw) = it.name.as_deref() else { return fallback() };
    let last = raw.rsplit(['/', '\\']).next().unwrap_or("");
    let clean: String = last.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    let clean = clean.trim().trim_end_matches(['.', ' ']).to_string();
    let stem = clean.split('.').next().unwrap_or("").trim().to_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") || (stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit());
    if clean.is_empty() || clean.chars().all(|c| c == '.') || reserved { fallback() } else { clean }
}

/// ชนิดไฟล์ปลายทางของ ffmpeg ตามนามสกุล · ไม่รู้จัก = None (ตั้งนามสกุลเป็น mka mks mkv ตามจริงแทน)
pub(crate) fn ff_format(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "mkv" | "mka" | "mks" => "matroska", "aac" => "adts", "ac3" => "ac3", "eac3" => "eac3", "mp3" => "mp3", "dts" => "dts", "flac" => "flac",
        "thd" => "truehd", "wav" => "wav", "ogg" | "opus" => "ogg", "wma" => "asf",
        "srt" => "srt", "ass" | "ssa" => "ass", "sup" => "sup", "vtt" => "webvtt",
        // ภาพแบบสตรีมล้วน ไม่มีกล่องไฟล์ (BUGS ข้อ 35 ต่อ) · ffmpeg ใส่ตัวแปลงรูปแบบสตรีมจาก MP4 เป็นแบบ Annex B ให้เองตอนเขียน
        "h264" => "h264", "h265" | "hevc" => "hevc",
        _ => return None,
    })
}

/// ไฟล์ที่ไม่ใช่ MKV แยกด้วย ffmpeg · นามสกุลที่ ffmpeg เขียนแยกเดี่ยวไม่ได้ (เช่น ซับ VobSub .sub) เปลี่ยนเป็นไฟล์ Matroska ตามชนิด
/// เดิมเขียนข้างในเป็น Matroska ใต้นามสกุลเดิม ได้ไฟล์ .sup .thd ที่ข้างในเป็น MKV เปิดไม่ได้ (ผู้ช่วยตรวจโค้ดเจอ)
pub fn fix_ext_for_ffmpeg(it: &mut Item) {
    // บทเขียนเป็น XML เองไม่ผ่าน ffmpeg (AUDIT ข้อ 17)
    if it.kind == "menu" { return; }
    if ff_format(&it.ext).is_none() {
        it.ext = match it.kind.as_str() { "audio" => "mka", "text" => "mks", _ => "mkv" }.into();
    }
}

/// ชื่อชนต่อท้าย 2 3 (ตั้งชื่อใหม่ต่อท้ายเลข 2) · งานจริงใช้ numbered_free (เทสใช้)
#[cfg(test)]
pub fn numbered(p: &Path) -> PathBuf {
    numbered_free(p, false)
}

/// ไฟล์ปลายทางทุกไฟล์ของชิ้นนี้ · VobSub คือ .idx กับ .sub ชื่อเดียวกัน (BUGS ข้อ 150) · ชิ้นอื่นไฟล์เดียว
pub fn finals_of(target: &Path, vobsub: bool) -> Vec<PathBuf> {
    if vobsub { vec![target.with_extension("idx"), target.with_extension("sub")] } else { vec![target.to_path_buf()] }
}

/// ต่อท้ายเลขจนชื่อว่าง · VobSub ต้องว่างทั้ง .idx และ .sub ไม่งั้นได้คู่ที่ไฟล์หนึ่งเป็นของเรื่องอื่น
pub fn numbered_free(p: &Path, vobsub: bool) -> PathBuf {
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let dir = p.parent().unwrap_or(Path::new(""));
    (2..).map(|n| dir.join(format!("{stem} {n}{ext}"))).find(|x| finals_of(x, vobsub).iter().all(|f| !f.exists())).unwrap()
}

/// เลขแทร็กของ mkvmerge (เริ่ม 0) ของแทร็กลำดับที่ nth ในชนิดนั้น
fn mkv_track_id(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<u64, String> {
    mkv_track(tools, file, kind, nth).map(|(id, _)| id)
}

/// เลขแทร็กของ mkvmerge กับ codec id ของ Matroska (ซับ VobSub คือ S_VOBSUB · BUGS ข้อ 150)
fn mkv_track(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<(u64, String), String> {
    let j = mkv_json(tools, file)?;
    let want = match kind { "video" => "video", "audio" => "audio", _ => "subtitles" };
    j["tracks"].as_array().and_then(|t| t.iter().filter(|x| x["type"] == want).nth(nth.checked_sub(1)?))
        .and_then(|x| Some((x["id"].as_u64()?, x["properties"]["codec_id"].as_str().unwrap_or("").to_string())))
        .ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

fn mkv_attachment_id(tools: &Path, file: &Path, nth: usize) -> Result<u64, String> {
    let j = mkv_json(tools, file)?;
    j["attachments"].as_array().and_then(|a| a.get(nth - 1)).and_then(|x| x["id"].as_u64()).ok_or_else(|| "ไม่เจอไฟล์แนบ".into())
}

/// เลขสตรีมของ ffmpeg กับชนิดข้อมูล ของแทร็กลำดับที่ nth ในชนิดนั้น (ไม่นับรูปปก)
fn ff_stream(tools: &Path, file: &Path, kind: &str, nth: usize) -> Result<(u64, String), String> {
    let out = run_tool_timeout(tools, "ffprobe", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-print_format"), OsStr::new("json"), OsStr::new("-show_streams"), file.as_os_str()], Duration::from_secs(60))?;
    let j = tool_json("ffprobe", &out)?;
    // ชนิดอื่น (บท ไฟล์แนบ) ไม่ใช่สตรีมของ ffmpeg · เดิมนับเป็นซับ ติ๊กบทของ MP4 ได้ซับแทร็กแรกใต้ชื่อ .chapters.xml (AUDIT 12 พ.ย. 2569 ข้อ 17)
    let want = match kind { "video" => "video", "audio" => "audio", "text" => "subtitle", k => return Err(format!("แยก {k} จากไฟล์ที่ไม่ใช่ MKV ด้วยวิธีนี้ไม่ได้")) };
    j["streams"].as_array().and_then(|s| s.iter().filter(|x| x["codec_type"] == want && x["disposition"]["attached_pic"].as_i64() != Some(1)).nth(nth - 1))
        .and_then(|x| Some((x["index"].as_u64()?, x["codec_name"].as_str().unwrap_or("").to_string()))).ok_or_else(|| format!("ไม่เจอแทร็กที่ {nth} ในไฟล์"))
}

/// ภาพแบบสตรีมล้วน ไม่มีกล่องไฟล์ · หน้าเสียงและซับเลือกได้เฉพาะภาพ AVC (H.264) กับ HEVC (H.265)
pub fn is_raw_video(ext: &str) -> bool {
    matches!(ext, "h264" | "h265" | "hevc")
}

pub enum Done {
    /// ไฟล์ที่เครื่องมือเขียนจริง · ซับ VobSub ได้สองไฟล์ .idx กับ .sub ชิ้นอื่นได้ไฟล์เดียวตามชื่อที่ส่งไป
    Ok(Vec<PathBuf>),
    Cancelled,
}

/// ซับ VobSub ในไฟล์ MKV (BUGS ข้อ 150) · หน้าเสียงและซับตั้งนามสกุล sub ให้แทร็ก S_VOBSUB เท่านั้น (fileinfo.rs กับ ext_of_codec)
/// ไฟล์อื่นแยกด้วย ffmpeg เป็น Matroska ไฟล์เดียว (fix_ext_for_ffmpeg)
pub fn is_vobsub(src_mkv: bool, it: &Item) -> bool {
    src_mkv && it.kind == "text" && it.ext.eq_ignore_ascii_case("sub")
}

/// ไฟล์ที่ mkvextract เขียนจริงเมื่อส่งชื่อ p ให้แยก VobSub · มันเปลี่ยนนามสกุลท้ายของชื่อที่ส่งไปเป็น .idx กับ .sub เอง
/// ส่ง a.sub.partial ได้ a.sub.idx กับ a.sub.sub (ลองจริงกับ mkvextract ที่แนบมา 16 พ.ย. 2569) · .idx ก่อน .sub
pub fn vobsub_outputs(p: &Path) -> Vec<PathBuf> {
    vec![p.with_extension("idx"), p.with_extension("sub")]
}

/// ชื่อชั่วคราวที่ส่งให้เครื่องมือ · VobSub ใช้ <ชื่อ>.partial.sub จึงได้ <ชื่อ>.partial.idx กับ <ชื่อ>.partial.sub ที่ดูออกว่ายังไม่เสร็จ
/// ชิ้นอื่นใช้ <ชื่อ>.partial แบบเดิม
pub fn partial_of(target: &Path, vobsub: bool) -> PathBuf {
    PathBuf::from(format!("{}.partial{}", target.to_string_lossy(), if vobsub { ".sub" } else { "" }))
}

/// ข้อความที่เครื่องมือพิมพ์ เก็บไว้ 60 บรรทัดท้าย ใช้บอกสาเหตุตอนไม่สำเร็จ
fn keep_tail(buf: &std::sync::Mutex<Vec<String>>, text: &str) {
    let mut b = buf.lock().unwrap();
    b.extend(crate::app::tools::tool_lines(text));
    let n = b.len();
    if n > 60 { b.drain(..n - 60); }
}

/// แยกหนึ่งชิ้นลง partial · ความคืบหน้า 0–100 · stop = กดหยุด
/// ซับ VobSub ของ MKV ได้สองไฟล์ตาม vobsub_outputs(partial) · ไม่สำเร็จบอกสาเหตุเป็นประโยคไทยจากข้อความของเครื่องมือ (BUGS ข้อ 150)
pub fn extract_one(tools: &Path, file: &Path, it: &Item, partial: &Path, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Done, ToolFail> {
    let mkv = file.extension().map(|e| e.eq_ignore_ascii_case("mkv")).unwrap_or(false);
    let mut outs = vec![partial.to_path_buf()];
    let (tool, args): (&str, Vec<OsString>) = if mkv {
        match it.kind.as_str() {
            // ภาพที่เลือกแบบสตรีมล้วน (.h264 .h265) ใช้ mkvextract แบบเดียวกับเสียงและซับ ได้สตรีมดิบที่ MKVToolNix กับโปรแกรมรวมไฟล์อื่นรับได้ (BUGS ข้อ 35 ต่อ)
            "video" if is_raw_video(&it.ext) => {
                let id = mkv_track_id(tools, file, "video", it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "tracks".into(), t])
            }
            "video" => {
                let id = mkv_track_id(tools, file, "video", it.nth)?;
                ("mkvmerge", vec!["--gui-mode".into(), "-o".into(), partial.into(), "-A".into(), "-S".into(), "-M".into(), "-B".into(), "--no-chapters".into(), "-d".into(), id.to_string().into(), file.into()])
            }
            "menu" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "chapters".into(), partial.into()]),
            // แท็ก chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรม แบบ gMKVExtractGUI (BUGS ข้อ 130 · ชื่อโหมดตามซอร์ส MkvExtractModes.cs)
            "tags" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "tags".into(), partial.into()]),
            "ogm" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "chapters".into(), "--simple".into(), partial.into()]),
            "cue" => ("mkvextract", vec!["--gui-mode".into(), file.into(), "cuesheet".into(), partial.into()]),
            "timestamps" => {
                let id = mkv_track_id(tools, file, it.of.as_deref().unwrap_or("video"), it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "timestamps_v2".into(), t])
            }
            "attachment" => {
                let id = mkv_attachment_id(tools, file, it.nth)?;
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "attachments".into(), t])
            }
            k => {
                let (id, codec) = mkv_track(tools, file, k, it.nth)?;
                // ดูจากชนิดแทร็กจริง ไม่พึ่งนามสกุลที่หน้าจอส่งมา
                if codec.eq_ignore_ascii_case("S_VOBSUB") { outs = vobsub_outputs(partial); }
                let mut t = OsString::from(format!("{id}:"));
                t.push(partial.as_os_str());
                ("mkvextract", vec!["--gui-mode".into(), file.into(), "tracks".into(), t])
            }
        }
    } else if matches!(it.kind.as_str(), "tags" | "ogm" | "cue" | "timestamps") {
        return Err("แยกชิ้นนี้ได้เฉพาะไฟล์ MKV".into());
    } else if it.kind == "menu" {
        // บทของ MP4 และไฟล์อื่น อ่านด้วย ffprobe แล้วเขียนเป็น Matroska XML แบบที่ mkvextract เขียน (AUDIT ข้อ 17)
        let chs = crate::media::chapters::read(tools, file)?;
        if chs.is_empty() { return Err("ไฟล์นี้ไม่มีบทของหนัง".into()); }
        let dur = crate::media::probe::probe(tools, file).ok().and_then(|x| x.duration);
        std::fs::write(partial, crate::media::chapters::xml_text(&chs, dur)).map_err(|e| format!("เขียนไฟล์บทไม่ได้: {e}"))?;
        on(100.0);
        return Ok(Done::Ok(outs));
    } else {
        let (idx, codec) = ff_stream(tools, file, &it.kind, it.nth)?;
        let fmt = ff_format(&it.ext).unwrap_or("matroska");
        // ซับตัวหนังสือของ MP4 (mov_text) ตัวเขียน srt ของ ffmpeg รับแบบ copy ไม่ได้ ต้องแปลงตัวหนังสือเป็น SRT (ไม่ใช่ภาพหรือเสียง ไม่เสียคุณภาพ)
        let codec_arg = if fmt == "srt" && codec != "subrip" && codec != "text" { "srt" } else { "copy" };
        ("ffmpeg", vec!["-hide_banner".into(), "-nostdin".into(), "-n".into(), "-v".into(), "error".into(), "-i".into(), file.into(), "-map".into(), format!("0:{idx}").into(),
            "-c".into(), codec_arg.into(), "-f".into(), fmt.into(), partial.into()])
    };
    // ข้อความผิดพลาดของ mkvextract แบบ --gui-mode ออกทาง stdout (#GUI#error) ของ ffmpeg ออกทาง stderr · เดิมทิ้ง stderr จึงบอกได้แค่รหัส (BUGS ข้อ 150)
    let mut child = tool_command(tools, tool, &args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก {tool} ไม่ได้: {e}"))?;
    crate::app::winutil::kill_with_app(&child);
    let out = child.stdout.take().unwrap();
    let err = child.stderr.take().unwrap();
    let msgs = std::sync::Arc::new(std::sync::Mutex::new(Vec::<String>::new()));
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let m1 = msgs.clone();
    let reader = std::thread::spawn(move || {
        for l in BufReader::new(out).lines().map_while(Result::ok) {
            if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
                let _ = tx.send(p);
            } else {
                keep_tail(&m1, &l);
            }
        }
    });
    let m2 = msgs.clone();
    let err_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::Read::read_to_end(&mut BufReader::new(err), &mut buf);
        keep_tail(&m2, &String::from_utf8_lossy(&buf));
    });
    let clean = |outs: &[PathBuf]| for p in outs { let _ = std::fs::remove_file(p); };
    loop {
        while let Ok(p) = rx.try_recv() {
            on(p);
        }
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            let _ = err_reader.join();
            clean(&outs);
            return Ok(Done::Cancelled);
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            let _ = reader.join();
            let _ = err_reader.join();
            let lines = msgs.lock().unwrap().clone();
            if !tool_succeeded(tool, &st) {
                clean(&outs);
                return Err(crate::app::tools::explain_fail(tool, &lines, Some(&st)));
            }
            // เครื่องมือจบปกติแต่ไม่ได้ไฟล์ครบ · เดิมขึ้น "แยกไม่สำเร็จ (รหัส 0)" ที่ขัดกันเอง
            if let Some(miss) = outs.iter().find(|p| !p.exists()) {
                let got: Vec<String> = outs.iter().filter(|p| p.exists()).filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string())).collect();
                clean(&outs);
                let name = miss.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let mut f = crate::app::tools::explain_fail(tool, &lines, None);
                if f.why.ends_with("ไม่ได้ไฟล์ออกมา") {
                    f.why = format!("{tool} ทำงานจบแล้วแต่ไม่พบไฟล์ {name} ที่ควรได้");
                    if !got.is_empty() { f.detail = Some(format!("ได้แค่ {}", got.join(" และ "))); }
                }
                return Err(f);
            }
            on(100.0);
            return Ok(Done::Ok(outs));
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}

