//! แปลงหนึ่งไฟล์ของคิวแปลง ตรวจผล เทียบเสียงทุกบิต · แยกจาก convert.rs ตอนแปลงเป็นโฟลเดอร์ (AUDIT ข้อ 24 114 116 ไฟล์เดิม 589 บรรทัด ใกล้เพดาน 600) ย้ายมาทั้งก้อน
use super::*;

/// แทรกอาร์กิวเมนต์ก่อนตัวแรกที่ตรง `before` · ไม่เจอต่อท้าย
pub(super) fn insert_before(args: &mut Vec<String>, before: &str, add: Vec<String>) {
    let at = args.iter().position(|a| a == before).unwrap_or(args.len());
    args.splice(at..at, add);
}

/// เมื่อไหร่ต้องให้ ffmpeg ใส่ข้อมูลเพลงกับปกหลังแปลง (ชนิดที่ ffmpeg เขียนปกได้)
fn remux_kind(codec: &str) -> bool {
    matches!(codec, "flac" | "mp3" | "aac" | "alac")
}

/// คำสั่ง ffmpeg ใส่ข้อมูลเพลงกับปกจากไฟล์เดิมลงไฟล์ที่แปลงแล้ว · ไม่แปลงเสียงซ้ำ (-c copy)
pub fn remux_args(enc: &str, src: &str, out: &str, codec: &str, f: &AudioFile, with_cover: bool) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-nostdin", "-v", "error", "-i", enc, "-i", src, "-map", "0:a:0"].iter().map(|s| s.to_string()).collect();
    if with_cover { if let Some(c) = &f.cover { a.extend(["-map".into(), format!("1:{}", c.stream)]); } }
    a.extend(["-c".into(), "copy".into(), "-map_metadata".into(), if f.tags_in_stream { format!("1:s:{}", f.stream) } else { "1".into() }]);
    if with_cover && f.cover.is_some() {
        a.extend(["-disposition:v:0".into(), "attached_pic".into(), "-metadata:s:v:0".into(), "comment=Cover (front)".into()]);
    }
    if codec == "mp3" { a.extend(["-id3v2_version".into(), "3".into()]); }
    a.extend(["-n".into(), out.into()]);
    a
}

pub(super) fn convert(app: &AppHandle, req: &ConvReq, jobs: &Arc<crate::app::jobs::Jobs>) -> Result<ConvResult, ApplyProblem> {
    let st = app.state::<ConvertState>();
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>| {
        let _ = app.emit("convert-progress", Progress { id: req.id.clone(), percent, eta, phase: phase.into() });
    };
    let t_start = Instant::now();
    let (tools, work) = tools_of(app).map_err(|e| fail("other", "แปลงไม่สำเร็จ", vec![e]))?;
    let src = PathBuf::from(&req.path);
    let name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {name} ไม่ถูกแตะ");
    if !src.exists() {
        return Err(fail("missing", "หาไฟล์ไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]));
    }
    let f = probe_track(&tools, &src, req.track).map_err(|e| fail("badsource", "อ่านไฟล์เสียงไม่ได้", vec![e, untouched.clone()]))?;
    let spec = &req.spec;
    let codec = spec.codec.as_str();
    let dir = match &req.out_dir { Some(d) if !d.is_empty() => PathBuf::from(d), _ => src.parent().map(Path::to_path_buf).unwrap_or_default() };
    if !dir.is_dir() {
        return Err(fail("other", "หาโฟลเดอร์ที่เก็บไม่เจอ", vec![dir.to_string_lossy().to_string(), untouched]));
    }
    let ext = spec.ext();
    let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    // ที่ว่าง · ไม่เสียคุณภาพคิดจากเสียงดิบ 24 บิต (ไฟล์จริงเล็กกว่านี้) · เสียคุณภาพคิดเผื่อ 1 Mbps
    let speedk = spec.speed.map(|[a, b]| if a > 0.0 && b > 0.0 { a / b } else { 1.0 }).unwrap_or(1.0);
    let secs = f.duration * speedk;
    let mut ch = spec.channels.unwrap_or(f.channels).max(1);
    if codec == "mp3" { ch = ch.min(2); }
    if codec == "ac3" || codec == "eac3" { ch = ch.min(6); }
    let rate = spec.rate.unwrap_or(f.rate).max(8000);
    let lossless = matches!(codec, "flac" | "alac" | "wv" | "ape" | "tak");
    let need = if lossless { secs * rate as f64 * ch as f64 * 3.0 } else { secs * 1_000_000.0 / 8.0 } as u64 + 16 * 1024 * 1024;
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("ที่ว่างในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องใช้ราว {} มีว่าง {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }

    let user = encode::user_dir(app).unwrap_or_default();
    let encs = encode::status(&tools, &user);
    let partial = dir.join(format!("{stem}.partial-{}.{ext}", crate::cover::poster_image::unique()));
    let _g1 = scopeguard(partial.clone());
    // จดไว้ ไฟดับกลางทางแล้วตอนเปิดครั้งหน้าลบให้ (BUGS ข้อ 162.4)
    let _t1 = crate::app::inflight::track(&partial, None, crate::app::inflight::Kind::Temp);
    let opus_native = codec == "opus" && (spec.encoder.is_empty() || spec.encoder == "native");
    let own_tag = matches!(codec, "wv" | "ape" | "tak");
    // รูปปกสำหรับ opusenc กับแท็ก APEv2 · ดึงลงโฟลเดอร์ชั่วคราวของโปรแกรม เสร็จแล้วลบ
    let mut cover_file: Option<(PathBuf, Vec<u8>)> = None;
    let mut _g2 = None;
    if let Some(c) = &f.cover {
        if opus_native || own_tag {
            if let Ok(b) = cover_bytes(&tools, &src, c.stream) {
                let p = work.join(format!("conv-cover-{}.{}", crate::cover::poster_image::unique(), cover_ext(&c.codec)));
                if std::fs::write(&p, &b).is_ok() { _g2 = Some(scopeguard(p.clone())); cover_file = Some((p, b)); }
            }
        }
    }

    let mut spec_r = spec.clone();
    spec_r.src_rate = Some(f.rate);
    let mut plan = encode::build(&spec_r, &req.path, f.stream, &partial.to_string_lossy(), Some(f.channels), f.bits)
        .map_err(|e| fail("tool", "ตั้งค่าแปลงเสียงไม่ถูก", vec![e, untouched.clone()]))?;
    // ชนิดที่โปรแกรมใส่ข้อมูลเพลงเอง ให้ ffmpeg ไม่ส่งต่อข้อมูลเดิม (ไม่ซ้อนสองชุด และ WavPack ไม่เก็บหัว WAV ที่มีข้อมูลเพลงติดไป)
    if own_tag || opus_native {
        insert_before(&mut plan.steps[0].args, "-vn", vec!["-map_metadata".into(), "-1".into()]);
    }
    if opus_native && plan.steps.len() > 1 {
        let mut add = vec![];
        for t in &f.tags { add.extend(["--comment".to_string(), format!("{}={}", vorbis_key(&t.key), t.value)]); }
        if let Some((p, _)) = &cover_file { add.extend(["--picture".to_string(), p.to_string_lossy().to_string()]); }
        insert_before(&mut plan.steps[1].args, "-", add);
    }
    let cmd = encode::text_of(&plan.steps);
    let main_tool = plan.steps.get(1).map(|s| s.tool.clone()).unwrap_or_else(|| "ffmpeg".into());
    let tool = match encs.iter().find(|e| e.name == main_tool).and_then(|e| e.version.clone()) {
        Some(v) if main_tool == "opusenc" => format!("opusenc {v}"),
        Some(v) if main_tool == "MACDll64" => format!("Monkey's Audio {v} (MACDll64.dll)"),
        Some(v) => format!("{main_tool} {v}"),
        None => main_tool.clone(),
    };

    let phase = format!("กำลังแปลงเป็น {}", match codec { "wv" => "WavPack".to_string(), "ape" => "Monkey's Audio".into(), c => c.to_uppercase() });
    emit(&phase, 0.0, None);
    let t0 = Instant::now();
    let eta = |p: f64| if p > 3.0 { Some(t0.elapsed().as_secs_f64() * (100.0 - p) / p) } else { None };
    let r = encode::run(&|n| encode::dir_for(&encs, &tools, n), &plan, Some(f.duration), &stop, &mut |p| emit(&phase, p * 0.96, eta(p)))
        .map_err(|e| fail("tool", "แปลงไม่สำเร็จ", vec![e, untouched.clone()]))?;
    match r {
        encode::Done::Ok => {}
        encode::Done::Cancelled => return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])),
        encode::Done::Failed(m) => return Err(fail("tool", "แปลงไม่สำเร็จ", vec![m, untouched])),
    }
    if stop() { return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])); }

    // ข้อมูลเพลงกับปก
    emit("กำลังใส่ข้อมูลเพลง", 97.0, None);
    let mut notes = vec![];
    let mut tags_n = 0usize;
    let mut cover_ok = false;
    let mut final_tmp = partial.clone();
    let mut _g3 = None;
    let has_meta = !f.tags.is_empty() || f.cover.is_some();
    if remux_kind(codec) && has_meta {
        let p2 = dir.join(format!("{stem}.partial-{}.{ext}", crate::cover::poster_image::unique()));
        _g3 = Some((scopeguard(p2.clone()), crate::app::inflight::track(&p2, None, crate::app::inflight::Kind::Temp)));
        let cover_fits = f.cover.as_ref().is_some_and(|c| matches!(c.codec.as_str(), "mjpeg" | "png"));
        let try_once = |with_cover: bool| -> bool {
            let _ = std::fs::remove_file(&p2);
            let a = remux_args(&partial.to_string_lossy(), &req.path, &p2.to_string_lossy(), codec, &f, with_cover);
            // ฟังตัวหยุดระหว่างคัดลอกเสียงลงไฟล์ชั่วคราวที่สอง · ปิดโปรแกรมแล้วงานจบเอง ลบไฟล์ทำค้างได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 10 · เดิมรอได้ถึง 600 วินาที)
            let a: Vec<std::ffi::OsString> = a.iter().map(std::ffi::OsString::from).collect();
            matches!(crate::app::outfile::run_live(&tools, "ffmpeg", &a, &stop, &mut |_| {}), Ok(crate::app::outfile::Run::Done(st, _)) if tool_succeeded("ffmpeg", &st))
        };
        if try_once(cover_fits) { cover_ok = cover_fits; tags_n = f.tags.len(); final_tmp = p2.clone(); }
        else if cover_fits && try_once(false) { tags_n = f.tags.len(); final_tmp = p2.clone(); notes.push("ใส่รูปปกไม่ได้ ใส่แค่ข้อมูลเพลง".into()); }
        else { notes.push("ใส่ข้อมูลเพลงกับรูปปกไม่ได้ ไฟล์ใหม่ไม่มีข้อมูลเพลง".into()); }
        if f.cover.is_some() && !cover_fits { notes.push(format!("รูปปกเดิมเป็น {} ไฟล์ชนิดนี้เก็บได้แค่ JPG กับ PNG", f.cover.as_ref().map(|c| c.codec.to_uppercase()).unwrap_or_default())); }
    } else if codec == "opus" {
        tags_n = f.tags.len();
        if opus_native { cover_ok = cover_file.is_some(); }
        else if f.cover.is_some() { notes.push("Opus ที่แปลงด้วย ffmpeg ใส่รูปปกไม่ได้  ถ้าอยากได้รูปปกให้ใช้ตัวต้นฉบับ opusenc".into()); }
    } else if own_tag && has_meta {
        if crate::audio::ape::has_ape_tag(&final_tmp) {
            notes.push("ตัวแปลงเขียนข้อมูลเพลงไว้แล้ว ไม่เขียนซ้อน".into());
        } else {
            let mut items: Vec<crate::audio::ape::ApeItem> = f.tags.iter().map(|t| crate::audio::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
            if let Some((p, b)) = &cover_file {
                let mut v = format!("cover.{}", p.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into())).into_bytes();
                v.push(0);
                v.extend_from_slice(b);
                items.push(crate::audio::ape::ApeItem { key: "Cover Art (Front)".into(), value: v, binary: true });
            }
            match crate::audio::ape::append_tag(&final_tmp, &items) {
                Ok(()) => { tags_n = f.tags.len(); cover_ok = cover_file.is_some(); }
                Err(e) => notes.push(e),
            }
        }
    } else if has_meta && matches!(codec, "ac3" | "eac3") {
        notes.push(format!("{} ไม่มีที่เก็บข้อมูลเพลงกับรูปปก", if codec == "ac3" { "AC-3" } else { "E-AC-3" }));
    }

    // ตรวจไฟล์ใหม่ · ชนิดตรง ความยาวตรง (เผื่อ 1 วินาที หรือ 1%)
    emit("กำลังตรวจไฟล์ใหม่", 99.0, None);
    let g = probe(&tools, &final_tmp).map_err(|e| fail("verify", "ไฟล์ใหม่อ่านไม่ได้", vec![e, "ลบไฟล์ใหม่แล้ว".into(), untouched.clone()]))?;
    if g.codec != spec.probe_codec() {
        return Err(fail("verify", "ไฟล์ใหม่ไม่ใช่ชนิดที่ตั้ง", vec![format!("ได้ {} แทน {}", g.codec, spec.probe_codec()), "ลบไฟล์ใหม่แล้ว".into(), untouched]));
    }
    let want = f.duration * speedk;
    if f.duration > 0.0 && (g.duration - want).abs() > (want * 0.01).max(1.0) {
        return Err(fail("verify", "ไฟล์ใหม่ยาวไม่เท่าต้นฉบับ", vec![format!("ได้ {:.1} วินาที ควรได้ {:.1} วินาที", g.duration, want), "ลบไฟล์ใหม่แล้ว".into(), untouched]));
    }

    // เสียงเหมือนต้นฉบับทุกบิตไหม (BUGS ข้อ 121) · แปลงแบบไม่เสียคุณภาพแล้วถอดเสียงทั้งสองไฟล์มาเทียบ MD5
    let (same, same_note) = if lossless { emit("กำลังเทียบเสียงกับต้นฉบับ", 99.5, None); bit_exact(&tools, &src, &f, &final_tmp, &spec) } else { (None, String::new()) };

    // กดหยุดระหว่างใส่ข้อมูลเพลงหรือตรวจ ไม่ตั้งชื่อไฟล์ใหม่ (ผู้ช่วยตรวจขั้น 10 ข้อ 9)
    if stop() { return Err(fail("cancelled", "หยุดแปลงแล้ว", vec!["ไฟล์ที่ทำค้างถูกลบ".into(), untouched])); }
    // ย้ายชื่อแบบไม่เขียนทับ · ระหว่างแปลงมีไฟล์ชื่อนี้โผล่มา ใช้ชื่อถัดไป
    let mut dest = free_name(&dir, Path::new(&format!("{stem}.{ext}")));
    if let Err(p) = crate::cover::rename::move_no_replace(&final_tmp, &dest) {
        if p.kind == "duplicate" {
            dest = free_name(&dir, Path::new(&format!("{stem}.{ext}")));
            crate::cover::rename::move_no_replace(&final_tmp, &dest).map_err(|p| fail("other", "ตั้งชื่อไฟล์ใหม่ไม่ได้", vec![p.title, untouched.clone()]))?;
        } else {
            return Err(fail("other", "ตั้งชื่อไฟล์ใหม่ไม่ได้", vec![p.title, untouched]));
        }
    }
    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    emit("เสร็จ", 100.0, Some(0.0));
    Ok(ConvResult { out: dest.to_string_lossy().into(), size, src_size: f.size, tags: tags_n, cover: cover_ok, notes, tool, cmd, secs: t_start.elapsed().as_secs_f64(), same, same_note })
}

/// MD5 ของเสียงล้วนที่ถอดแล้ว · ถอดเป็นเสียงดิบความลึกบิตเดียวกันทั้งสองไฟล์ (16 หรือ 32 บิต) ไม่นับแท็กกับปก
fn pcm_md5(tools: &Path, file: &Path, map: &str, wide: bool) -> Result<String, String> {
    let mut a: Vec<std::ffi::OsString> = ["-v", "error", "-nostdin", "-i"].iter().map(std::ffi::OsString::from).collect();
    a.push(file.as_os_str().to_owned());
    a.extend(["-map", map, "-vn", "-sn", "-dn", "-c:a", if wide { "pcm_s32le" } else { "pcm_s16le" }, "-f", "md5", "-"].iter().map(std::ffi::OsString::from));
    let o = run_tool_timeout(tools, "ffmpeg", &a, Duration::from_secs(1800))?;
    if !tool_succeeded("ffmpeg", &o.status) {
        return Err(String::from_utf8_lossy(&o.stderr).lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("ถอดเสียงไม่ได้").trim().to_string());
    }
    String::from_utf8_lossy(&o.stdout).trim().strip_prefix("MD5=").map(|s| s.to_lowercase()).ok_or_else(|| "อ่าน MD5 ไม่ได้".into())
}

/// เทียบเสียงไฟล์ใหม่กับต้นฉบับทุกตัวอย่าง (BUGS ข้อ 121 · เพื่อนแคลร์เสนอ พี่กันสั่ง "เอาเข้าคิวเลยละกัน")
/// ตัวเลือก Verify ของ flac ตรวจแค่ว่า flac ถอดไฟล์ของตัวเองได้ตรงกับที่ ffmpeg ส่งให้ ไม่ได้เทียบกับไฟล์ต้นฉบับ อันนี้เทียบปลายทางกับต้นทางจริง
/// คืน Some(true) ตรงทุกบิต · Some(false) ไม่ตรง · None เทียบไม่ได้ พร้อมเหตุผล (ต้นฉบับเสียคุณภาพ หรือตั้งให้เสียงเปลี่ยนโดยตั้งใจ)
pub fn bit_exact(tools: &Path, src: &Path, f: &AudioFile, out: &Path, spec: &EncodeSpec) -> (Option<bool>, String) {
    let src_lossless = matches!(f.codec.as_str(), "flac" | "alac" | "wavpack" | "ape" | "tak" | "tta" | "truehd" | "mlp") || f.codec.starts_with("pcm_");
    if !src_lossless { return (None, "ต้นฉบับเป็นแบบเสียคุณภาพ จึงไม่มีเสียงต้นฉบับก่อนบีบให้เทียบ".into()); }
    let mut why: Vec<&str> = vec![];
    if spec.channels.is_some_and(|c| c != f.channels) { why.push("เปลี่ยนจำนวนช่อง"); }
    if spec.bits.is_some_and(|b| Some(b) != f.bits) { why.push("เปลี่ยนบิต"); }
    if spec.rate.is_some_and(|r| r != f.rate) { why.push("เปลี่ยนอัตราสุ่ม"); }
    if spec.gain.abs() > 1e-9 { why.push("ปรับความดัง"); }
    if spec.loudnorm { why.push("ปรับความดังมาตรฐาน"); }
    if spec.speed.is_some() { why.push("เปลี่ยนความเร็ว"); }
    if !why.is_empty() { return (None, format!("ไม่ได้เทียบ เพราะตั้งให้{} เสียงจึงต่างจากต้นฉบับโดยตั้งใจ", why.join(" "))); }
    let wide = f.bits.unwrap_or(24) > 16;
    match (pcm_md5(tools, src, &format!("0:{}", f.stream), wide), pcm_md5(tools, out, "0:a:0", wide)) {
        (Ok(a), Ok(b)) if a == b => (Some(true), format!("MD5 ของเสียง {a}")),
        (Ok(a), Ok(b)) => (Some(false), format!("MD5 ของเสียงต้นฉบับ {a} ไฟล์ใหม่ {b}")),
        (Err(e), _) | (_, Err(e)) => (None, format!("เทียบเสียงไม่ได้ {e}")),
    }
}
