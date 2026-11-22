//! งานรวมไฟล์ ทำไฟล์ใหม่ เรียก mkvmerge หรือ ffmpeg แปลงเสียง ย้ายไฟล์เดิม ความคืบหน้า
//! แยกจาก merge/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ทำไฟล์ใหม่

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Progress {
    pub(crate) phase: String,
    pub(crate) percent: f64,
    pub(crate) eta: Option<f64>,
    pub(crate) next: Option<String>,
    /// เลยจุดที่หยุดได้แล้ว ไฟล์เดิมกำลังย้ายหรือย้ายไปแล้ว หน้าจอเปลี่ยนปุ่มหยุดเป็นข้อความว่าหยุดไม่ได้ (AUDIT 12 พ.ย. 2569 ข้อ 14)
    #[serde(rename = "final", skip_serializing_if = "std::ops::Not::not")]
    pub(crate) fin: bool,
}

pub struct Produced {
    pub counts: Counts,
    pub verified: bool,
}

/// ปกตั้ง (cover) หรือปกนอน (cover_land) ของไฟล์แนบชื่อนี้
/// ไฟล์ Matroska ไหม (mkvextract ใช้ได้เฉพาะ Matroska) · ดูหัวไฟล์ EBML ไม่เชื่อนามสกุล
pub(crate) fn is_matroska(p: &Path) -> bool {
    use std::io::Read;
    let mut b = [0u8; 4];
    std::fs::File::open(p).and_then(|mut f| f.read_exact(&mut b)).is_ok() && b == [0x1A, 0x45, 0xDF, 0xA3]
}

/// เลขสตรีมรูปปกที่ฝังในไฟล์ (attached_pic ของ ffprobe)
pub(crate) fn attached_pic_index(tools: &Path, p: &Path) -> Option<u64> {
    ffprobe_json(tools, p).ok().and_then(|j| j["streams"].as_array().and_then(|a| a.iter()
        .find(|s| s["disposition"]["attached_pic"].as_i64() == Some(1)).and_then(|s| s["index"].as_u64())))
}

/// แทร็กนี้ทำให้ไฟล์ MP4 ไม่ได้ไหม · แทร็กที่ตั้งแปลงดูชนิดหลังแปลง · แทร็กในหนังแบบเพิ่มคู่ แทร็กเดิมยังอยู่ ต้องใส่ได้ด้วย
/// กติกาเดียวกับหน้าจอ (AvPage mp4Of) · เดิมดูชนิดเดิมเสมอ TrueHD ที่ตั้งแปลงแบบแทนที่ทำ MP4 ไม่ได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 2)
pub fn mp4_unfit(t: &Track) -> bool {
    let orig_bad = t.mp4 == "no" || t.ff.is_none();
    match t.convert.as_ref().filter(|_| t.kind == "audio") {
        Some(spec) => mp4_fit("audio", spec.probe_codec()).0 == "no" || (t.in_movie && t.pair && orig_bad),
        None => orig_bad,
    }
}

fn cover_slot(name: &str) -> Option<&'static str> {
    match crate::media::probe::att_stem(name).as_str() {
        "cover" => Some("cover"),
        "cover_land" => Some("cover_land"),
        _ => None,
    }
}

/// ทำไฟล์ใหม่ลง partial แล้วตรวจ · ไม่แตะไฟล์เดิม ไม่ย้ายอะไร (ส่วนที่ใช้ได้ในเทสโดยไม่ต้องเปิดโปรแกรม)
#[allow(clippy::too_many_arguments)]
pub fn produce(
    tools: &Path, work: &Path, req: &MergeReq, new_covers: &HashMap<String, (Vec<u8>, String)>, partial: &Path,
    stop: &dyn Fn() -> bool, emit: &dyn Fn(&str, f64, Option<f64>, Option<&str>), notes: &mut Vec<String>, untouched: &str,
) -> Result<Produced, ApplyProblem> {
    let movie = Path::new(&req.movie);
    let mk = mkv_json(tools, movie).map_err(|e| fail("badsource", "อ่านไฟล์หนังไม่ได้", vec![e, untouched.into()]))?;
    let movie_atts = attachments_of(&mk);
    let movie_duration = ffprobe_json(tools, movie).ok().as_ref().and_then(duration_of);
    let mp4 = req.output == "mp4";
    let mut tracks = req.tracks.clone();

    std::fs::create_dir_all(work).map_err(|e| fail("other", "สร้างโฟลเดอร์ชั่วคราวไม่ได้", vec![e.to_string()]))?;
    let mut guards = vec![];
    // บทที่แก้ในหน้าต่างดูและแก้บท เขียนเป็นไฟล์บทในโฟลเดอร์ชั่วคราว ลบเองเมื่อจบงาน (BUGS ข้อ 99)
    // MKV ใช้ไฟล์บทแบบง่ายของ mkvmerge · MP4 ใช้ไฟล์ข้อมูลของ ffmpeg · รายการว่าง = ไม่มีบท ไม่ต้องเขียนไฟล์
    let chap_file: Option<PathBuf> = match &req.chapters {
        Some(chs) if !chs.is_empty() => {
            let f = work.join(format!("merge-chap-{}.txt", crate::cover::poster_image::unique()));
            let text = if mp4 { crate::media::chapters::ffmetadata_text(chs, movie_duration) } else { crate::media::chapters::ogm_text(chs) };
            std::fs::write(&f, text).map_err(|e| fail("other", "เขียนไฟล์บทที่แก้ไม่ได้", vec![e.to_string(), untouched.into()]))?;
            guards.push(scopeguard(f.clone()));
            Some(f)
        }
        _ => None,
    };
    let chap: Option<Option<&Path>> = req.chapters.as_ref().map(|_| chap_file.as_deref());
    // ซับ VTT จากไฟล์แยก แปลงเป็น SRT ก่อนใส่ MKV · mkvmerge เก็บ VTT เป็น S_TEXT/WEBVTT ที่ ffmpeg 9 อ่านไม่ได้
    // (ลองแล้ว ffprobe ขึ้น unknown codec · โปรแกรมเล่นที่ใช้ ffmpeg เช่น mpv จะไม่เห็นซับ) · MP4 แปลงเป็น mov_text เองอยู่แล้ว
    if !mp4 {
        for t in tracks.iter_mut().filter(|t| t.keep && !t.in_movie && t.codec == "webvtt") {
            let srt = work.join(format!("merge-vtt-{}.srt", crate::cover::poster_image::unique()));
            let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-i"].iter().map(OsString::from)
                .chain([OsString::from(&t.src)]).chain(["-map".into(), format!("0:{}", t.ff.unwrap_or(0)).into(), "-c:s".into(), "srt".into()])
                .chain([srt.as_os_str().to_owned()]).collect();
            let ok = run_tool_timeout(tools, "ffmpeg", &args, Duration::from_secs(120)).map(|o| o.status.success()).unwrap_or(false);
            if !ok || !srt.exists() {
                return Err(fail("tool", "แปลงซับ VTT เป็น SRT ไม่สำเร็จ", vec![t.src.clone(), untouched.into()]));
            }
            guards.push(scopeguard(srt.clone()));
            notes.push(format!("ซับ {} แปลงเป็น SRT ก่อนใส่ MKV เพราะโปรแกรมเล่นหลายตัวยังไม่รู้จัก VTT ใน MKV", Path::new(&t.src).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()));
            t.src = srt.to_string_lossy().to_string();
            t.tid = 0;
            t.ff = Some(0);
            t.codec = "subrip".into();
            t.charset = Some("UTF-8".into());
        }
    }

    // แปลงชนิดเสียงก่อนรวม (ช่วงที่นานสุด) · ไฟล์ที่แปลงอยู่โฟลเดอร์ชั่วคราว รวมเสร็จแล้วลบเอง
    // แทร็กในหนังแบบเพิ่มคู่ เก็บแทร็กเดิมไว้ แทร็กใหม่ต่อท้ายแทร็กเดิม · แบบแทนที่และไฟล์ที่เพิ่ม ใช้แทร็กใหม่แทน
    let total_conv = tracks.iter().filter(|t| t.keep && t.kind == "audio" && t.convert.is_some()).count();
    if total_conv > 0 {
        // ตัวแปลงที่ใส่เองในโฟลเดอร์ตัวแปลง (qaac fdkaac หรือรุ่นใหม่กว่า) · ไม่มีโฟลเดอร์ก็ใช้ตัวที่แนบมา
        let user = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("ชั้นหนัง").join("ตัวแปลง")).unwrap_or_default();
        let encs = crate::audio::encode::status(tools, &user);
        let mut n = 0;
        let mut list = vec![];
        for t in tracks.into_iter() {
            let Some(spec) = t.convert.clone().filter(|_| t.keep && t.kind == "audio") else { list.push(t); continue };
            n += 1;
            let out = work.join(format!("merge-conv-{}.{}", crate::cover::poster_image::unique(), spec.ext()));
            let mut spec = spec;
            spec.src_rate = t.rate.map(|r| r as u32);
            let plan = crate::audio::encode::build(&spec, &t.src, t.ff.unwrap_or(t.tid), &out.to_string_lossy(), t.channels.map(|c| c as u32), t.bits.map(|b| b as u32))
                .map_err(|e| fail("tool", "ตั้งค่าแปลงเสียงไม่ถูก", vec![e, untouched.into()]))?;
            let ft = spec.codec.to_uppercase();
            let phase = format!("กำลังแปลงเสียง {n} จาก {total_conv} เป็น {ft}");
            let next = if n < total_conv { "แปลงเสียงถัดไป" } else { "รวมเข้าไฟล์ใหม่" };
            emit(&phase, 0.0, None, Some(next));
            let t0 = Instant::now();
            guards.push(scopeguard(out.clone()));
            let r = crate::audio::encode::run(&|name| crate::audio::encode::dir_for(&encs, tools, name), &plan, t.duration.or(movie_duration), stop, &mut |p| emit(&phase, p, eta(t0, p), Some(next)))
                .map_err(|e| fail("tool", "แปลงเสียงไม่สำเร็จ", vec![e, untouched.into()]))?;
            match r {
                crate::audio::encode::Done::Ok => {}
                crate::audio::encode::Done::Cancelled => return Err(cancelled(untouched, None)),
                crate::audio::encode::Done::Failed(m) => return Err(fail("tool", "แปลงเสียงไม่สำเร็จ", vec![m, untouched.into()])),
            }
            let mut nt = t.clone();
            nt.src = out.to_string_lossy().to_string();
            nt.tid = 0;
            nt.ff = Some(0);
            nt.codec = spec.probe_codec().to_string();
            let (fit, why) = mp4_fit("audio", &nt.codec);
            nt.mp4 = fit.into();
            nt.why = why;
            nt.in_movie = false;
            nt.convert = None;
            nt.charset = None;
            if t.in_movie && t.pair {
                nt.default = false;
                nt.name = if t.conv_name.trim().is_empty() { format!("{} {ft}", t.name).trim().to_string() } else { t.conv_name.clone() };
                let mut old = t;
                old.convert = None;
                list.push(old);
                notes.push(format!("แปลงเสียงเป็น {ft} เพิ่มคู่กับแทร็กเดิม"));
            } else {
                notes.push(format!("แปลงเสียงเป็น {ft}"));
            }
            list.push(nt);
        }
        tracks = list;
    }

    // รูปปกใหม่เขียนลงโฟลเดอร์ชั่วคราว
    let mut covers: Vec<NewCover> = vec![];
    for (slot, plan) in [("cover", &req.covers.portrait), ("cover_land", &req.covers.land)] {
        if plan != "new" {
            continue;
        }
        let Some((bytes, fmt)) = new_covers.get(slot) else {
            return Err(fail("nocover", "ยังไม่ได้ใส่รูปปก", vec![format!("ช่อง{} ตั้งว่าใช้รูปใหม่ แต่ยังไม่มีรูป", if slot == "cover" { "ปกตั้ง" } else { "ปกนอน" }), untouched.into()]));
        };
        let fmt = if fmt == "png" { "png" } else { "jpg" };
        let file = work.join(format!("merge-{slot}-{}.{fmt}", crate::cover::poster_image::unique()));
        std::fs::write(&file, bytes).map_err(|e| fail("other", "เขียนรูปปกไม่ได้", vec![e.to_string()]))?;
        guards.push(scopeguard(file.clone()));
        covers.push(NewCover {
            name: format!("{slot}.{fmt}"), mime: if fmt == "png" { "image/png".into() } else { "image/jpeg".into() }, file, sha: crate::media::probe::hex(&Sha256::digest(bytes)),
        });
    }
    // ไฟล์แนบของหนังที่เก็บไว้ · ปกช่องที่ใส่ใหม่หรือเอาออก ไม่เก็บ · ไฟล์แนบอื่น (ฟอนต์ของซับ ASS) เก็บทั้งหมด
    let drop_slot = |slot: &str| if slot == "cover" { req.covers.portrait != "keep" } else { req.covers.land != "keep" };
    let kept_atts: Vec<&Attachment> = movie_atts.iter().filter(|a| cover_slot(&a.name).map(|s| !drop_slot(s)).unwrap_or(true)).collect();
    for a in movie_atts.iter().filter(|a| cover_slot(&a.name).map(drop_slot).unwrap_or(false)) {
        let replaced = covers.iter().any(|c| cover_slot(&c.name) == cover_slot(&a.name));
        notes.push(if replaced { format!("รูปปก {} เดิมเปลี่ยนเป็นรูปใหม่", a.name) } else { format!("เอารูปปก {} ออก", a.name) });
    }
    // ไฟล์แนบของไฟล์ที่เพิ่ม (เช่น MKS ที่มีฟอนต์ของซับ) เก็บเฉพาะที่ไม่ใช่รูปปก
    let mut other_atts: HashMap<String, Vec<u64>> = HashMap::new();
    let mut other_names: Vec<String> = vec![];
    for src in inputs_of(&req.movie, &tracks).iter().skip(1) {
        let ext = Path::new(src).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
        if matches!(ext.as_str(), "mkv" | "mka" | "mks" | "mk3d" | "webm") {
            if let Ok(j) = mkv_json(tools, Path::new(src)) {
                let keep: Vec<Attachment> = attachments_of(&j).into_iter().filter(|a| cover_slot(&a.name).is_none()).collect();
                other_names.extend(keep.iter().map(|a| a.name.clone()));
                other_atts.insert(src.clone(), keep.iter().map(|a| a.id).collect());
            }
        }
    }

    // ฟอนต์ของซับ ASS ที่เลือกฝัง (fonts.rs · พี่กันสั่ง 8 พ.ย. 2569) · ชื่อไฟล์ซ้ำกับไฟล์แนบที่มีอยู่แล้วไม่ใส่ซ้ำ · MP4 ใส่ไม่ได้
    let mut fonts: Vec<NewCover> = vec![];
    if !mp4 {
        for f in &req.fonts {
            let p = PathBuf::from(f);
            let is_font = p.extension().map(|e| crate::subtitle::fonts::FONT_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false);
            if !is_font || !p.is_file() {
                return Err(fail("other", "หาไฟล์ฟอนต์ไม่เจอ", vec![f.clone(), "เอาฟอนต์นี้ออกจากการ์ดฟอนต์ หรือลากไฟล์ฟอนต์มาใหม่".into(), untouched.into()]));
            }
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let taken = kept_atts.iter().any(|a| a.name.eq_ignore_ascii_case(&name)) || other_names.iter().any(|n| n.eq_ignore_ascii_case(&name)) || fonts.iter().any(|c| c.name.eq_ignore_ascii_case(&name));
            if taken {
                notes.push(format!("ฟอนต์ {name} มีในไฟล์แนบอยู่แล้ว ไม่ใส่ซ้ำ"));
                continue;
            }
            fonts.push(NewCover { name, mime: crate::subtitle::fonts::mime_of(&p).into(), file: p, sha: String::new() });
        }
        if !fonts.is_empty() {
            notes.push(format!("ฝังฟอนต์ของซับ {} ไฟล์ {}", fonts.len(), fonts.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(" ")));
        }
    }

    let total = movie_duration.unwrap_or(0.0);
    let (tool, args, mp4_cover) = if mp4 {
        // MP4 เก็บปกได้รูปเดียว ใช้ปกตั้ง · ปกนอนกับฟอนต์ใส่ไม่ได้ บอกในผล
        let cover = if let Some(c) = covers.iter().find(|c| c.name.starts_with("cover.")) {
            Some(Mp4Cover::File(c.file.clone()))
        } else if req.covers.portrait == "keep" {
            // mkvmerge รายงานปกที่ฝังใน MP4 เป็นไฟล์แนบชื่อ cover.jpg ด้วย แต่ mkvextract เปิดได้เฉพาะ Matroska
            // (ผู้ช่วยตรวจขั้น 10 ข้อ 1 · ลองแล้ว mkvextract กับ MP4 ตอบ Not a valid Matroska file รหัส 2 · เดิมปกหายเงียบ ตรวจไฟล์ใหม่ผ่าน)
            let had_cover = kept_atts.iter().any(|a| cover_slot(&a.name) == Some("cover"));
            let found = if let Some(a) = kept_atts.iter().find(|a| cover_slot(&a.name) == Some("cover")).filter(|_| is_matroska(movie)) {
                // ปกเดิมที่เป็นไฟล์แนบของ MKV ดึงออกมาเป็นไฟล์ก่อน
                let out = work.join(format!("merge-oldcover-{}.{}", crate::cover::poster_image::unique(), Path::new(&a.name).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or("jpg".into())));
                let mut target = OsString::from(format!("{}:", a.id));
                target.push(out.as_os_str());
                let ok = run_tool_timeout(tools, "mkvextract", [movie.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))
                    .map(|r| tool_succeeded("mkvextract", &r.status)).unwrap_or(false);
                guards.push(scopeguard(out.clone()));
                ok.then_some(Mp4Cover::File(out))
            } else {
                // หนัง MP4 MOV ที่มีปกฝังอยู่แล้ว ใช้สตรีมรูปปกของ ffprobe
                attached_pic_index(tools, movie).map(Mp4Cover::Stream)
            };
            // หนังมีปกแต่ดึงไม่ได้ ไม่ทำต่อเงียบ ๆ ให้ปกหายจากไฟล์ใหม่
            if had_cover && found.is_none() {
                return Err(fail("tool", "ดึงรูปปกเดิมของหนังไม่ได้", vec!["ไม่ได้รวม เพื่อไม่ให้ปกหายจากไฟล์ใหม่".into(), "เลือกเอาปกออก หรือใส่รูปปกใหม่ แล้วรวมอีกครั้ง".into(), untouched.into()]));
            }
            found
        } else {
            None
        };
        if covers.iter().any(|c| c.name.starts_with("cover_land")) || kept_atts.iter().any(|a| cover_slot(&a.name) == Some("cover_land")) {
            notes.push("MP4 เก็บรูปปกได้รูปเดียว ใช้ปกตั้ง ปกนอนไม่ได้ใส่".into());
        }
        if kept_atts.iter().any(|a| cover_slot(&a.name).is_none()) || !other_names.is_empty() || !req.fonts.is_empty() {
            notes.push("MP4 เก็บไฟล์แนบไม่ได้ ฟอนต์ของซับไม่ได้ใส่".into());
        }
        // MP4 ตั้งแทร็กแรกของแต่ละชนิดเป็นหลักเอง เมื่อไม่ได้เลือกแทร็กหลักของชนิดนั้น (กติกาของตัวเขียน MP4 ใน ffmpeg)
        if tracks.iter().any(|t| t.keep && t.kind == "subtitle") && !tracks.iter().any(|t| t.keep && t.kind == "subtitle" && t.default) {
            notes.push("ไม่ได้เลือกซับหลัก MP4 ตั้งซับแรกเป็นหลักเอง โปรแกรมเล่นบางตัวจะเปิดซับนี้ให้".into());
        }
        let args = mp4_args(&req.movie, &tracks, cover.as_ref(), chap, partial);
        ("ffmpeg", args, cover.is_some())
    } else {
        let ids: Vec<u64> = kept_atts.iter().map(|a| a.id).collect();
        ("mkvmerge", mkv_args(&req.movie, &tracks, &ids, &other_atts, &covers, &fonts, chap, partial), false)
    };

    let _ = std::fs::remove_file(partial); // .partial ของรอบก่อนที่ค้าง เป็นของโปรแกรมเอง
    let phase = if mp4 { "กำลังรวมเป็น MP4" } else { "กำลังรวมเข้าไฟล์ใหม่" };
    let next = req.check_output.then_some("ตรวจไฟล์ใหม่");
    emit(phase, 0.0, None, next);
    let t0 = Instant::now();
    let mut last = Instant::now() - Duration::from_secs(1);
    let mut tool_errors: Vec<String> = vec![];
    let r = run_live(tools, tool, &args, stop, &mut |l| {
        let pct = if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim_end_matches('%').parse::<f64>().ok()) {
            Some(p)
        } else if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
            (total > 0.0).then(|| (us / 1e6 / total * 100.0).clamp(0.0, 100.0))
        } else {
            if l.starts_with("#GUI#error") || l.starts_with("Error:") { tool_errors.push(l.to_string()); }
            None
        };
        if let Some(p) = pct {
            if last.elapsed() >= Duration::from_millis(100) {
                last = Instant::now();
                emit(phase, p, eta(t0, p), next);
            }
        }
    }).map_err(|e| { let _ = std::fs::remove_file(partial); fail("tool", "เรียกเครื่องมือไม่ได้", vec![e, untouched.into()]) })?;
    match r {
        Run::Cancelled => {
            let _ = std::fs::remove_file(partial);
            return Err(cancelled(untouched, Some(partial)));
        }
        Run::Done(status, stderr) => {
            if !tool_succeeded(tool, &status) || !partial.exists() {
                let _ = std::fs::remove_file(partial);
                let msg = tool_errors.first().cloned().or_else(|| stderr.lines().find(|l| !l.trim().is_empty()).map(String::from)).unwrap_or_default();
                return Err(fail("tool", if mp4 { "รวมเป็น MP4 ไม่สำเร็จ" } else { "รวมเข้าไฟล์ใหม่ไม่สำเร็จ" }, vec![msg.chars().take(200).collect(), untouched.into()]));
            }
        }
    }
    emit(phase, 100.0, Some(0.0), next);

    let mut att_names: Vec<String> = kept_atts.iter().map(|a| a.name.clone()).collect();
    att_names.extend(other_names);
    att_names.extend(fonts.iter().map(|c| c.name.clone()));
    if req.check_output {
        emit("กำลังตรวจไฟล์ใหม่", 100.0, None, None);
        let r = if mp4 { verify_mp4(tools, partial, &tracks, mp4_cover, movie_duration) } else { verify_mkv(tools, work, partial, &tracks, &att_names, &covers, movie_duration) };
        match r {
            Ok(counts) => Ok(Produced { counts, verified: true }),
            Err(mut why) => {
                let _ = std::fs::remove_file(partial);
                why.push("ลบไฟล์ใหม่ที่ไม่ผ่านแล้ว".into());
                why.push(untouched.into());
                Err(fail("verify", "ไฟล์ใหม่ตรวจไม่ผ่าน", why))
            }
        }
    } else {
        let counts = ffprobe_json(tools, partial).map(|j| count(&streams_of(&j))).unwrap_or_default();
        Ok(Produced { counts, verified: false })
    }
}

