//! ใส่โปสเตอร์ลงไฟล์ ตั้งชื่อไฟล์ใหม่ สั่ง mkvmerge หรือ ffmpeg ตรวจปกที่ใส่แล้ว
//! แยกจาก poster/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ใส่โปสเตอร์

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApplyReq {
    path: String,
    /// mkv | mp4
    output: String,
    check_source: bool,
    check_output: bool,
    /// keep | trash
    original: String,
    /// เลขแทร็ก (ffprobe) ที่ยอมทิ้งตอนส่งออก MP4
    #[serde(default)]
    drop: Vec<u64>,
    /// ชื่อไฟล์ใหม่ไม่รวมนามสกุล · ไม่ส่งมาใช้ชื่อไฟล์ต้นทาง · เปลี่ยนรูปแนบในไฟล์เดิมไม่ใช้ค่านี้
    #[serde(default)]
    name: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    /// cover เปลี่ยนแค่รูปแนบ · wrap ครอบเป็น MKV · mp4 ส่งออก MP4
    mode: String,
    output: String,
    counts: Counts,
    verified: bool,
    /// kept ย้ายไปไฟล์เดิม · trash ลงถังขยะ · none ไม่มีไฟล์เดิม (แก้ในไฟล์เดียวกัน)
    original: String,
    original_to: Option<String>,
    notes: Vec<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    phase: String,
    percent: f64,
    eta: Option<f64>,
    next: Option<String>,
}

/// ที่อยู่ไฟล์ใหม่ · ไม่ได้พิมพ์ชื่อหรือพิมพ์เท่าเดิมใช้ชื่อไฟล์ต้นทาง · ชื่อที่พิมพ์ผ่านตัวเช็กตัวเดียวกับปุ่มเปลี่ยนชื่อบนชั้นวาง
pub(crate) fn new_target(src: &Path, output: &str, name: Option<&str>) -> Result<PathBuf, RenameProblem> {
    let stem = src.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let plain = src.with_file_name(format!("{stem}.{}", if output == "mp4" { "mp4" } else { "mkv" }));
    match name {
        Some(n) if n != stem => rename::check_name(&plain, n),
        _ => Ok(plain),
    }
}

/// เช็กไฟล์ปลายทางก่อนลงมือ · ปลายทางชื่อเดียวกับไฟล์ต้นทางไม่นับว่าซ้ำ เพราะไฟล์ต้นทางย้ายออกตอนจบ
pub(crate) fn target_problem(src: &Path, target: &Path) -> Option<RenameProblem> {
    let same = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if !same && target.exists() {
        return Some(RenameProblem { kind: "duplicate", title: "ในโฟลเดอร์นี้มีไฟล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น".into(), detail: None });
    }
    // ระหว่างทำไฟล์ต่อท้าย .partial (8 ตัว)
    if target.to_string_lossy().encode_utf16().count() + 8 > MAX_PATH_LEN {
        return Some(RenameProblem { kind: "long", title: "ชื่อยาวเกินไป".into(), detail: Some("ที่อยู่ไฟล์ยาวเกินที่ Windows รับได้ ตั้งชื่อให้สั้นลง".into()) });
    }
    None
}

/// ส่งออกเป็น MP4 ได้ไหม · คืนหัวเรื่องกับรายละเอียดเมื่อไม่ได้ · แทร็กที่ใส่ไม่ได้ต้องได้รับอนุญาตให้ทิ้งก่อน
/// ทิ้งแทร็กแล้วไฟล์ใหม่ไม่เหลือภาพก็ไม่ได้ · เดิมหน้าต่างเตือนทิ้งแทร็กภาพที่ใส่ MP4 ไม่ได้ไปด้วย ได้ MP4 ที่มีแต่เสียงแต่ขึ้นตรวจผ่าน (AUDIT 12 พ.ย. 2569 ข้อ 7)
pub(crate) fn mp4_refusal(src: &[StreamInfo], drop: &[u64]) -> Option<(String, Vec<String>)> {
    if let Some(v) = src.iter().find(|s| s.kind == "video") {
        if !src.iter().any(|s| s.kind == "video" && !drop.contains(&s.index)) {
            return Some(("ส่งออกเป็น MP4 ไม่ได้".into(), vec![v.why.clone().unwrap_or_default(), "ไฟล์ใหม่จะไม่มีภาพ ใช้ MKV แทน".into()]));
        }
    }
    let bad: Vec<&StreamInfo> = src.iter().filter(|s| s.mp4 == "no" && !drop.contains(&s.index)).collect();
    if let Some(v) = bad.iter().find(|s| s.kind == "video") {
        return Some(("ส่งออกเป็น MP4 ไม่ได้".into(), vec![v.why.clone().unwrap_or_default(), "ใช้ MKV แทน".into()]));
    }
    if !bad.is_empty() {
        return Some((format!("มีแทร็กที่ใส่ใน MP4 ไม่ได้ {} อัน", bad.len()), vec![]));
    }
    None
}

pub(crate) fn apply(app: &AppHandle, req: &ApplyReq, jobs: &Arc<crate::app::jobs::Jobs>) -> Result<ApplyResult, ApplyProblem> {
    let st = app.state::<PosterState>();
    let d = dirs(app).map_err(|e| fail("other", "ใส่โปสเตอร์ไม่สำเร็จ", vec![e]))?;
    let stop = || st.cancel.load(Ordering::SeqCst) || jobs.cancelled();
    let emit = |phase: &str, percent: f64, eta: Option<f64>, next: Option<&str>| {
        let _ = app.emit("poster-progress", Progress { phase: phase.into(), percent, eta, next: next.map(String::from) });
    };
    let src = PathBuf::from(&req.path);
    let src_name = src.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let untouched = format!("ไฟล์เดิม {src_name} ไม่ถูกแตะ");
    let dir = src.parent().map(Path::to_path_buf).unwrap_or_default();
    let ext = src.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    let Some((poster, pformat)) = st.chosen.lock().unwrap().clone() else {
        return Err(fail("nocover", "ยังไม่ได้ใส่รูปโปสเตอร์", vec!["ใส่รูปแล้วกด ใช้รูปนี้ ในหน้าต่างครอปก่อน".into()]));
    };
    let src_size = std::fs::metadata(&src).map_err(|_| fail("other", "หาไฟล์หนังไม่เจอ", vec!["ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้ายไปแล้ว".into()]))?.len();
    let mode = if req.output == "mp4" { "mp4" } else if ext == "mkv" { "cover" } else { "wrap" };

    // ไฟล์ถูกเปิดอยู่ · แก้ในไฟล์เดิม (cover) ต้องเช็กก่อนเสมอ · ครอบใหม่ก็เช็ก เพราะตอนจบต้องย้ายไฟล์เดิม
    if !not_in_use(&src) {
        return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched]));
    }
    let src_json = ffprobe_json(&d.tools, &src).map_err(|e| fail("badsource", "อ่านไฟล์ต้นทางไม่ได้", vec![e, untouched.clone()]))?;
    let src_streams = streams_of(&src_json);
    let src_duration = duration_of(&src_json);

    // ที่อยู่ไฟล์ใหม่ · ชื่อซ้ำไม่เขียนทับ
    let target = match mode {
        "cover" => src.clone(),
        _ => new_target(&src, &req.output, req.name.as_deref()).map_err(|p| {
            let mut detail: Vec<String> = p.detail.into_iter().collect();
            detail.push(untouched.clone());
            fail("name", p.title, detail)
        })?,
    };
    let same_name = target.to_string_lossy().to_lowercase() == src.to_string_lossy().to_lowercase();
    if mode != "cover" && !same_name && target.exists() {
        return Err(fail("exists", "มีไฟล์ชื่อนี้อยู่แล้ว ไม่เขียนทับ", vec![target.to_string_lossy().to_string(), untouched]));
    }
    let partial = PathBuf::from(format!("{}.partial", target.to_string_lossy()));
    // ไฟล์ใหม่ต่อท้าย .partial (8 ตัว) · เปลี่ยนรูปแนบแก้ในไฟล์เดิม ไม่มีไฟล์ใหม่ ไม่ต้องบวก (เดิมบวกทุกโหมด ไฟล์ที่ที่อยู่ยาว 252–259 ใส่ปกไม่ได้)
    if target.to_string_lossy().encode_utf16().count() + if mode == "cover" { 0 } else { 8 } > MAX_PATH_LEN {
        return Err(fail("other", "ที่อยู่ไฟล์ยาวเกินไป", vec!["เปลี่ยนชื่อไฟล์ให้สั้นลงก่อน".into(), untouched]));
    }

    // ที่ว่างในไดรฟ์ · ครอบใหม่ต้องการราวขนาดไฟล์เดิม
    let need = if mode == "cover" { poster.len() as u64 * 2 + 16 * 1024 * 1024 } else { src_size + poster.len() as u64 + 64 * 1024 * 1024 };
    let free = free_space(&dir);
    if free < need {
        return Err(fail("space", format!("พื้นที่ในไดรฟ์ {} ไม่พอ", drive_letter(&dir)), vec![format!("ต้องการ {} แต่เหลือ {}", fmt_gb(need), fmt_gb(free)), untouched]));
    }

    // MP4 · แทร็กที่ใส่ไม่ได้ต้องได้รับอนุญาตให้ทิ้งก่อน
    if mode == "mp4" {
        if let Some((title, mut detail)) = mp4_refusal(&src_streams, &req.drop) {
            detail.push(untouched);
            return Err(fail("mp4", title, detail));
        }
    }

    // ตรวจไฟล์ต้นทางก่อน · อ่านทุกแพ็กเก็ตโดยไม่ถอดภาพ จับไฟล์ที่โครงเสียหรือขาดท้าย (ตรวจละเอียดจริงอยู่หน้าตรวจไฟล์ ขั้น 6)
    let next_after_check = if mode == "cover" { "เปลี่ยนรูปแนบ" } else if mode == "mp4" { "ส่งออกเป็น MP4" } else { "ครอบเป็น MKV" };
    if req.check_source {
        emit("กำลังตรวจไฟล์ต้นทาง", 0.0, None, Some(next_after_check));
        let args: Vec<OsString> = ["-hide_banner", "-nostdin", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from)
            .chain([src.as_os_str().to_owned()]).chain(["-map", "0", "-c", "copy", "-f", "null", "-"].iter().map(OsString::from)).collect();
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let total = src_duration.unwrap_or(0.0);
        let r = run_live(&d.tools, "ffmpeg", &args, &stop, &mut |l| {
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) {
                if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                    last = Instant::now();
                    let pct = (us / 1e6 / total * 100.0).clamp(0.0, 100.0);
                    emit("กำลังตรวจไฟล์ต้นทาง", pct, eta(t0, pct), Some(next_after_check));
                }
            }
        }).map_err(|e| fail("tool", "ตรวจไฟล์ต้นทางไม่สำเร็จ", vec![e, untouched.clone()]))?;
        match r {
            Run::Cancelled => return Err(cancelled(&untouched, None)),
            Run::Done(status, stderr) => {
                // คำเตือนเรื่องลำดับเวลาของตัวเขียนทดสอบ (null) ไม่ใช่ไฟล์เสีย · ไฟล์ VOB MPG TS ที่ดีขึ้นแบบนี้เป็นปกติ (ผลเทสขั้น 4)
                let errs: Vec<&str> = stderr.lines().map(str::trim)
                    .filter(|l| !l.is_empty() && !l.contains("non monotonically increasing dts") && !l.contains("Timestamps are unset")).collect();
                if !status.success() || !errs.is_empty() {
                    return Err(fail("badsource", "ไฟล์ต้นทางมีที่เสียอยู่แล้ว", vec![
                        errs.first().map(|e| e.chars().take(120).collect()).unwrap_or_else(|| "อ่านไฟล์ไม่จบ".into()),
                        "ปิดตัวเลือก ตรวจไฟล์ต้นทางก่อนครอบ ถ้าต้องการทำต่อ".into(), untouched,
                    ]));
                }
            }
        }
    }

    // เขียนรูปโปสเตอร์ลงโฟลเดอร์ชั่วคราวของโปรแกรม
    std::fs::create_dir_all(&d.work).map_err(|e| fail("other", "สร้างโฟลเดอร์ชั่วคราวไม่ได้", vec![e.to_string()]))?;
    // รูปแนวนอนแนบชื่อ cover_land · แนวตั้งหรือจัตุรัสชื่อ cover ตามธรรมเนียมไฟล์แนบของ MKV
    // ไฟล์หนึ่งมีได้ทั้งสองปก ชั้นวางสลับดูได้ (พี่กัน 7 พ.ย. 2569 *"ทำระบบนี้มาเลย ให้เเนบหลายรูปได้ เเละทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้"*)
    let land = image::ImageReader::new(std::io::Cursor::new(&poster[..])).with_guessed_format().ok()
        .and_then(|r| r.into_dimensions().ok()).map(|(w, h)| w > h).unwrap_or(false);
    let stem = if land { "cover_land" } else { "cover" };
    let cover_name = format!("{stem}.{pformat}");
    let mime = if pformat == "png" { "image/png" } else { "image/jpeg" };
    let cover_file = d.work.join(format!("poster-{}.{pformat}", pi::unique()));
    std::fs::write(&cover_file, &poster).map_err(|e| fail("other", "เขียนรูปโปสเตอร์ไม่ได้", vec![e.to_string()]))?;
    let poster_sha = crate::media::probe::hex(&Sha256::digest(&poster));
    let cleanup_cover = scopeguard(cover_file.clone());

    let mut notes: Vec<String> = vec![];
    let result_counts: Counts;
    let mut verified = false;

    if mode == "cover" {
        // ① MKV อยู่แล้ว · ลบเฉพาะปกเดิมแนวเดียวกับรูปใหม่ ปกอีกแนวเก็บไว้ แล้วแนบใหม่ ในคำสั่งเดียว · ชื่อกับชนิดมาก่อนคำสั่งแนบ (TECH-REVIEW ข้อ 2)
        emit("กำลังเปลี่ยนรูปแนบ", 10.0, None, req.check_output.then_some("ตรวจไฟล์ใหม่"));
        let atts = mkv_attachments(&d.tools, &src).map_err(|e| fail("tool", "อ่านไฟล์แนบเดิมไม่ได้", vec![e, untouched.clone()]))?;
        // ปกเดิมแต่ละอันเป็นแนวไหน · cover_land = แนวนอน · cover.* ดูสัดส่วนจริง (รูปแนวนอนที่แนบชื่อ cover ก่อนมีระบบนี้)
        let olds: Vec<(String, bool)> = atts.iter().filter_map(|a| {
            let st = crate::media::probe::att_stem(&a.0);
            (st == "cover" || st == "cover_land").then(|| (a.0.clone(), st == "cover_land" || attachment_is_land(&d, &src, a.2).unwrap_or(false)))
        }).collect();
        let mut drops: Vec<String> = olds.iter().filter(|o| o.1 == land).map(|o| o.0.clone()).collect();
        let others: Vec<&(String, bool)> = olds.iter().filter(|o| o.1 != land).collect();
        // ปกแนวนอนเก่าชื่อ cover.* ตอนใส่ปกตั้ง · เปลี่ยนชื่อเป็น cover_land ไม่ลบ (มี cover_land อยู่แล้ว อันชื่อ cover ซ้ำแนว ลบได้)
        let mut rename: Option<(String, String)> = None;
        if !land {
            let has_land_name = others.iter().any(|o| crate::media::probe::att_stem(&o.0) == "cover_land");
            for o in others.iter().filter(|o| crate::media::probe::att_stem(&o.0) == "cover") {
                if has_land_name || rename.is_some() { drops.push(o.0.clone()); }
                else { rename = Some((o.0.clone(), format!("cover_land.{}", Path::new(&o.0).extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_else(|| "jpg".into())))); }
            }
        }
        let keep_other = !others.is_empty();
        let mut args: Vec<OsString> = vec![src.as_os_str().to_owned()];
        for n in &drops {
            args.push("--delete-attachment".into());
            args.push(format!("name:{n}").into());
        }
        if let Some((from, to)) = &rename {
            args.extend(["--attachment-name".into(), to.into(), "--update-attachment".into(), format!("name:{from}").into()]);
            notes.push(format!("ปกแนวนอนเดิมชื่อ {from} เปลี่ยนชื่อเป็น {to} ตามธรรมเนียมปกแนวนอน"));
        }
        args.extend(["--attachment-name".into(), cover_name.clone().into(), "--attachment-mime-type".into(), mime.into(), "--add-attachment".into(), cover_file.as_os_str().to_owned()]);
        if keep_other {
            notes.push(if land { "ปกแนวตั้งเดิมยังอยู่ในไฟล์ ชั้นวางสลับดูได้".into() } else { "ปกแนวนอนเดิมยังอยู่ในไฟล์ ชั้นวางสลับดูได้".into() });
        }
        // เช็กซ้ำตรงจังหวะที่เขียนจริง · ตรวจไฟล์ต้นทางของไฟล์ใหญ่ใช้หลายนาที ระหว่างนั้นผู้ใช้อาจเปิดหนังเรื่องนี้ดู (ผู้ช่วยตรวจโค้ดเจอ)
        if !not_in_use(&src) {
            return Err(fail("inuse", "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น", vec!["ถูกเปิดระหว่างตรวจไฟล์ต้นทาง ยังไม่ได้แก้ไฟล์ ปิดโปรแกรมเล่นหนังก่อน แล้วกดลองใหม่".into(), untouched.clone()]));
        }
        let out = run_tool_timeout(&d.tools, "mkvpropedit", &args, Duration::from_secs(300))
            .map_err(|e| fail("tool", "เปลี่ยนรูปแนบไม่สำเร็จ", vec![e]))?;
        if !tool_succeeded("mkvpropedit", &out.status) {
            return Err(fail("tool", "เปลี่ยนรูปแนบไม่สำเร็จ", vec![String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.contains("Error")).collect::<Vec<_>>().join(" ")]));
        }
        // ตรวจ · ปกมีอันเดียว ชื่อ ชนิดถูก ดึงออกมาแล้ว hash ตรงกับรูปที่ทำ · แทร็กเท่าเดิม
        emit("กำลังตรวจไฟล์ใหม่", 80.0, None, None);
        let check = || -> Result<Counts, (String, String)> {
            verify_cover(&d, &target, &cover_name, mime, &poster_sha).map_err(|e| ("ตรวจรูปแนบไม่ผ่าน".to_string(), e))?;
            // ปกอีกแนวที่ตั้งใจเก็บไว้ ต้องยังอยู่ (ไฟล์จากที่อื่นอาจมีปกอีกแนวมากกว่าหนึ่งอัน เช่น cover.jpg กับ cover.png · เดิมนับว่าต้องเท่ากับ 1 พอดี ขึ้นแดงทั้งที่แนบสำเร็จ ผู้ช่วยตรวจโค้ดเจอ)
            let other_stem = if land { "cover" } else { "cover_land" };
            let kept = mkv_attachments(&d.tools, &target).map(|a| a.iter().filter(|x| crate::media::probe::att_stem(&x.0) == other_stem).count()).unwrap_or(0);
            if (kept >= 1) != keep_other {
                return Err(("ปกอีกแนวในไฟล์ไม่ตรงกับที่ควรเป็น".into(), format!("{other_stem} ควร{} เจอ {kept} อัน", if keep_other { "ยังอยู่" } else { "ไม่มี" })));
            }
            let after = ffprobe_json(&d.tools, &target).map(|j| count(&streams_of(&j))).unwrap_or_default();
            if after != count(&src_streams) {
                return Err(("แทร็กในไฟล์เปลี่ยนไปหลังเปลี่ยนรูปแนบ".into(), format!("เดิม {:?} ตอนนี้ {:?}", count(&src_streams), after)));
            }
            Ok(after)
        };
        match check() {
            Ok(after) => { verified = true; result_counts = after; }
            Err((title, why)) => {
                // ไฟล์ถูกแก้ไปแล้ว จดขนาดกับ hash ใหม่ลงคลังเสมอ ไม่งั้นอ่านโฟลเดอร์ครั้งหน้าขึ้นว่าไฟล์ถูกเปลี่ยน · บอกตรง ๆ ว่าแนบปกใหม่ไปแล้ว
                crate::app::library::refresh_own_edit(app, &target, &|pct| emit("กำลังจดค่า hash ใหม่", pct, None, None));
                return Err(fail("verify", title, vec![why, "แนบปกใหม่ลงไฟล์แล้ว โดยภาพ เสียง และซับไม่ได้ถูกแปลงใหม่  ควรตรวจละเอียดเรื่องนี้".into()]));
            }
        }
    } else {
        // ② ③ ทำไฟล์ใหม่เป็น .partial ในโฟลเดอร์เดียวกัน
        let _ = std::fs::remove_file(&partial); // .partial ของรอบก่อนที่ค้าง เป็นของโปรแกรมเอง ไม่ใช่ไฟล์หนัง
        let phase = if mode == "mp4" { "กำลังส่งออกเป็น MP4" } else { "กำลังครอบเป็น MKV" };
        let next = if req.check_output { Some("ตรวจไฟล์ใหม่") } else { None };
        emit(phase, 0.0, None, next);
        let kept: Vec<&StreamInfo> = src_streams.iter().filter(|s| !req.drop.contains(&s.index)).collect();
        let args: Vec<OsString> = if mode == "mp4" {
            let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-progress", "pipe:1", "-nostats", "-i"].iter().map(OsString::from).collect();
            a.push(src.as_os_str().to_owned());
            a.push("-i".into());
            a.push(cover_file.as_os_str().to_owned());
            for s in &kept {
                a.push("-map".into());
                a.push(format!("0:{}", s.index).into());
            }
            let nvideo = kept.iter().filter(|s| s.kind == "video").count();
            a.extend(["-map", "1:v", "-c", "copy", "-c:s", "mov_text"].iter().map(OsString::from));
            a.push(format!("-disposition:v:{nvideo}").into());
            a.push("attached_pic".into());
            a.extend(["-map_metadata", "0", "-f", "mp4"].iter().map(OsString::from));
            a.push(partial.as_os_str().to_owned());
            a
        } else {
            let mut a: Vec<OsString> = ["--gui-mode", "--ui-language", "en", "-o"].iter().map(OsString::from).collect();
            a.push(partial.as_os_str().to_owned());
            // ปกที่ฝังในต้นทาง (MP4 M4V MOV) mkvmerge ยกมาเป็นไฟล์แนบชื่อ cover.* เอง · ชนกับรูปใหม่ได้ปกชื่อซ้ำสองอัน ตรวจไม่ผ่าน (ผู้ช่วยตรวจโค้ดเจอ ลองแล้วจริง)
            // เก็บปกเดิมเฉพาะตอนรูปใหม่เป็นแนวนอน (cover_land) และปกเดิมเป็นแนวตั้งทั้งหมด ชื่อไม่ชน ชั้นวางสลับดูได้ · นอกนั้นไม่ยกไฟล์แนบของต้นทางมา
            let old_pics: Vec<(u64, u64)> = src_json["streams"].as_array().map(|a| a.iter()
                .filter(|s| s["disposition"]["attached_pic"].as_i64() == Some(1))
                .map(|s| (s["width"].as_u64().unwrap_or(0), s["height"].as_u64().unwrap_or(0))).collect()).unwrap_or_default();
            let keep_old = land && !old_pics.is_empty() && old_pics.iter().all(|&(w, h)| w <= h);
            if !keep_old { a.push("--no-attachments".into()); }
            if keep_old { notes.push("ปกแนวตั้งที่ฝังในไฟล์ต้นทางยกมาด้วย ชั้นวางสลับดูได้".into()); }
            else if !old_pics.is_empty() { notes.push("ปกที่ฝังในไฟล์ต้นทางไม่ได้ยกมา ใช้รูปที่ใส่แทน".into()); }
            a.push(src.as_os_str().to_owned());
            a.extend(["--attachment-name".into(), cover_name.clone().into(), "--attachment-mime-type".into(), mime.into(), "--attach-file".into(), cover_file.as_os_str().to_owned()]);
            a
        };
        let t0 = Instant::now();
        let mut last = Instant::now() - Duration::from_secs(1);
        let total = src_duration.unwrap_or(0.0);
        let tool = if mode == "mp4" { "ffmpeg" } else { "mkvmerge" };
        let mut tool_errors: Vec<String> = vec![];
        let r = run_live(&d.tools, tool, &args, &stop, &mut |l| {
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
        });
        let r = r.map_err(|e| { let _ = std::fs::remove_file(&partial); fail("tool", "เรียกเครื่องมือไม่ได้", vec![e, untouched.clone()]) })?;
        match r {
            Run::Cancelled => {
                let _ = std::fs::remove_file(&partial);
                return Err(cancelled(&untouched, Some(&partial)));
            }
            Run::Done(status, stderr) => {
                if !tool_succeeded(tool, &status) || !partial.exists() {
                    let _ = std::fs::remove_file(&partial);
                    let msg = tool_errors.first().cloned().or_else(|| stderr.lines().find(|l| !l.trim().is_empty()).map(String::from)).unwrap_or_default();
                    return Err(fail("tool", if mode == "mp4" { "ส่งออก MP4 ไม่สำเร็จ" } else { "ครอบเป็น MKV ไม่สำเร็จ" }, vec![msg.chars().take(160).collect(), untouched]));
                }
            }
        }
        emit(phase, 100.0, Some(0.0), next);

        // ตรวจไฟล์ใหม่เทียบต้นทาง · ภาพ เสียง ซับ ชนิดเดิม จำนวนเท่าเดิม ความยาวต่างไม่เกิน 0.1 วินาที · มีปก
        let new_json = ffprobe_json(&d.tools, &partial).map_err(|e| { let _ = std::fs::remove_file(&partial); fail("verify", "อ่านไฟล์ใหม่ไม่ได้", vec![e, untouched.clone()]) })?;
        let new_streams = streams_of(&new_json);
        result_counts = count(&new_streams);
        if req.check_output {
            emit("กำลังตรวจไฟล์ใหม่", 100.0, None, None);
            // ซับตัวหนังสือเปลี่ยนชนิดตามมาตรฐานของไฟล์ปลายทาง ไม่ใช่การแปลงภาพเสียงใหม่ · MP4 → mov_text · MKV เก็บซับของ MP4 เป็น SRT
            let as_target = |s: &StreamInfo| -> String {
                match (s.kind.as_str(), mode, s.codec.as_str()) {
                    ("subtitle", "mp4", _) => "mov_text".into(),
                    ("subtitle", _, "mov_text") => "subrip".into(),
                    _ => s.codec.clone(),
                }
            };
            let want: Vec<(String, String)> = kept.iter().map(|s| (s.kind.clone(), as_target(s))).collect();
            let got: Vec<(String, String)> = new_streams.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
            let dur_ok = match (src_duration, duration_of(&new_json)) { (Some(a), Some(b)) => (a - b).abs() <= 0.1, _ => true };
            let cover_ok = if mode == "mp4" { has_attached_pic(&new_json) } else { verify_cover(&d, &partial, &cover_name, mime, &poster_sha).is_ok() };
            if want != got || !dur_ok || !cover_ok {
                let _ = std::fs::remove_file(&partial);
                let mut why = vec![];
                if want != got {
                    let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
                    why.push(format!("แทร็กไม่ตรงต้นทาง ต้นทาง {} แต่ไฟล์ใหม่ {}", show(&want), show(&got)));
                }
                if !dur_ok { why.push(format!("ความยาวต่างกัน {:.2} กับ {:.2} วินาที", src_duration.unwrap_or(0.0), duration_of(&new_json).unwrap_or(0.0))); }
                if !cover_ok { why.push("ไม่เจอปกในไฟล์ใหม่".into()); }
                why.push("ลบไฟล์ใหม่ที่ไม่ผ่านแล้ว".into());
                why.push(untouched);
                return Err(fail("verify", "ไฟล์ใหม่ตรวจไม่ผ่าน", why));
            }
            verified = true;
        }
        if mode == "mp4" {
            for s in src_streams.iter().filter(|s| req.drop.contains(&s.index)) {
                notes.push(format!("ทิ้ง{} {} ตามที่เลือก", kind_word(&s.kind), s.lang.clone().unwrap_or_default()));
            }
            if src_streams.iter().any(|s| s.mp4 == "style" && !req.drop.contains(&s.index)) {
                notes.push("ซับ ASS เหลือตัวหนังสือล้วน สีกับฟอนต์หาย".into());
            }
        }
    }

    // ไฟล์เดิม · ย้ายไปโฟลเดอร์ไฟล์เดิม หรือลงถังขยะ (เฉพาะหลังตรวจผ่าน) · แก้ในไฟล์เดียวกันไม่มีไฟล์เดิม
    // ตัวจัดการอยู่ outfile.rs finish_output ใช้ร่วมกับหน้าเสียงและซับ
    let mut original = "none".to_string();
    let mut original_to = None;
    if mode != "cover" {
        (original, original_to) = finish_output(app, &src, &target, &partial, &req.original, verified, &untouched, &mut notes)?;
    }
    drop(cleanup_cover);

    // คลังหนัง · แก้ในไฟล์เดิม จดขนาดใหม่ไม่ให้ขึ้นว่าไฟล์ถูกเปลี่ยน · ไฟล์ใหม่ อ่านโฟลเดอร์ใหม่ให้ขึ้นชั้น
    if mode == "cover" {
        emit("กำลังจดข้อมูลไฟล์ใหม่", 100.0, None, None);
        crate::app::library::refresh_own_edit(app, &target, &|pct| emit("กำลังจดค่า hash ใหม่", pct, None, None));
    } else {
        let lib = app.state::<Arc<crate::app::library::LibraryStore>>();
        let _ = crate::app::library::scan_library(app.clone(), lib);
    }
    Ok(ApplyResult {
        mode: mode.into(), output: target.to_string_lossy().to_string(), counts: result_counts, verified, original, original_to, notes,
    })
}

/// ไฟล์แนบเลขนี้เป็นรูปแนวนอนไหม · ดึงออกมาที่โฟลเดอร์ชั่วคราวของโปรแกรม อ่านขนาด แล้วลบ
fn attachment_is_land(d: &Dirs, file: &Path, id: u64) -> Option<bool> {
    let out = d.work.join(format!("att-{}", pi::unique()));
    let mut target = OsString::from(format!("{id}:"));
    target.push(out.as_os_str());
    let r = run_tool_timeout(&d.tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120)).ok();
    let dims = r.filter(|r| tool_succeeded("mkvextract", &r.status)).and_then(|_| image::ImageReader::open(&out).ok()?.with_guessed_format().ok()?.into_dimensions().ok());
    let _ = std::fs::remove_file(&out);
    dims.map(|(w, h)| w > h)
}

/// ปกแนวเดียวกัน (ชื่อ cover หรือ cover_land ตามรูปใหม่) มีอันเดียว ชื่อกับชนิดถูก ดึงออกมาแล้ว hash ตรงกับรูปที่โปรแกรมทำ
fn verify_cover(d: &Dirs, file: &Path, name: &str, mime: &str, sha: &str) -> Result<(), String> {
    let atts = mkv_attachments(&d.tools, file)?;
    let stem = crate::media::probe::att_stem(name);
    let covers: Vec<&(String, String, u64)> = atts.iter().filter(|a| crate::media::probe::att_stem(&a.0) == stem).collect();
    if covers.len() != 1 || covers[0].0 != name || covers[0].1 != mime {
        return Err(format!("ปกในไฟล์ {:?} ต้องมี {name} อันเดียว", covers.iter().map(|c| &c.0).collect::<Vec<_>>()));
    }
    let out = d.work.join(format!("verify-{}", pi::unique()));
    let mut target = OsString::from(format!("{}:", covers[0].2));
    target.push(out.as_os_str());
    let r = run_tool_timeout(&d.tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
    let got = std::fs::read(&out).map(|b| crate::media::probe::hex(&Sha256::digest(&b)));
    let _ = std::fs::remove_file(&out);
    if !tool_succeeded("mkvextract", &r.status) || got.as_deref().ok() != Some(sha) {
        return Err("ปกที่ดึงออกมาไม่ตรงกับรูปที่ทำ".into());
    }
    Ok(())
}

