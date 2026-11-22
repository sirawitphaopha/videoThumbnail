//! ผลตรวจ ตรวจเร็วด้วย SHA-256 ตรวจละเอียดด้วย ffmpeg รอบหยาบแล้วรอบละเอียด
//! แยกจาก check/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------- ผลตรวจ ----------

/// ผลตรวจหนึ่งเรื่อง · sha256 = ค่าใหม่ที่จะจดลงคลัง · None = คงค่าเดิมไว้ (ไฟล์ถูกเปลี่ยนหรือเสีย ต้องเก็บค่าเดิมไว้เทียบ)
#[derive(Debug, Clone)]
pub struct Outcome {
    pub result: &'static str,
    pub summary: String,
    pub spans: Vec<Value>,
    pub sha256: Option<String>,
}

fn bad(summary: String, spans: Vec<Value>) -> Outcome {
    Outcome { result: "bad", summary, spans, sha256: None }
}

/// คิด SHA-256 ทั้งไฟล์ · None = กดหยุด · on ได้ 0–100
fn sha256(path: &Path, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<String>, String> {
    let algos = vec!["sha256".to_string()];
    let pct = |d: u64, t: u64| on(if t > 0 { d as f64 / t as f64 * 100.0 } else { 100.0 });
    Ok(match crate::app::hashes::compute(path, &algos, &pct, stop)? {
        crate::app::hashes::Outcome::Cancelled => None,
        crate::app::hashes::Outcome::Done(h) => h.sha256,
    })
}

/// ตรวจแบบเร็ว · โครงไฟล์ แล้วเทียบ SHA-256 กับที่จดไว้ · None = กดหยุด
/// full_ok = ครั้งก่อนตรวจละเอียดแล้วสมบูรณ์ (หรือผลสมบูรณ์ที่ต่อมาจากครั้งนั้น) · ไฟล์ที่ตรวจโครงไม่ได้ ค่า hash ตรงจึงยังนับว่าสมบูรณ์
/// ไฟล์ที่ตรวจโครงไม่ได้และไม่เคยตรวจละเอียดว่าสมบูรณ์ ได้ผล partial (ตรวจได้บางส่วน) ไม่ใช่ ok
/// เดิมได้ ok สีเขียวพร้อมข้อความ "โครงไฟล์ครบ" ทั้งที่ไม่ได้ตรวจโครงเลย (AUDIT 12 พ.ย. 2569 ข้อ 28)
pub fn quick(path: &Path, stored: Option<&str>, full_ok: bool, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Outcome>, String> {
    let s = structure(path)?;
    match &s {
        Structure::Truncated(m) => return Ok(Some(bad(truncated_text(*m), vec![]))),
        Structure::Broken(why) => return Ok(Some(bad(format!("โครงไฟล์เสีย {why}"), vec![]))),
        _ => {}
    }
    let Some(h) = sha256(path, on, stop)? else { return Ok(None) };
    let same = stored.map(|old| old.eq_ignore_ascii_case(&h));
    if same == Some(false) {
        return Ok(Some(Outcome {
            result: "changed",
            summary: "ค่า hash ไม่ตรงกับตอนตรวจครั้งก่อน ไฟล์อาจเสียระหว่างย้ายไดรฟ์ ควรตรวจละเอียด".into(),
            spans: vec![],
            sha256: None,
        }));
    }
    Ok(Some(match (&s, same) {
        (Structure::Unknown(_), Some(true)) if full_ok => Outcome { result: "ok", summary: "ตรวจแบบเร็ว ค่า hash ตรงกับครั้งก่อน ไฟล์จึงเหมือนตอนที่ตรวจละเอียดว่าสมบูรณ์".into(), spans: vec![], sha256: Some(h) },
        // ข้อความสั้นสองวลี ช่องผลในตารางตัดบรรทัดตรงรอยต่อพอดี (เดิมใส่เหตุผลกับคำว่าจดค่า hash แล้ว ตัดกลางวลีทั้งในตารางและหน้าต่างผลตรวจ)
        (Structure::Unknown(_), _) => Outcome { result: "partial", summary: "ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบไหม ควรตรวจละเอียด".into(), spans: vec![], sha256: Some(h) },
        (_, Some(true)) => Outcome { result: "ok", summary: "ตรวจแบบเร็ว โครงไฟล์ครบ ค่า hash ตรงกับครั้งก่อน".into(), spans: vec![], sha256: Some(h) },
        _ => Outcome { result: "ok", summary: "ตรวจแบบเร็ว โครงไฟล์ครบ จดค่า hash ไว้เทียบครั้งหน้า".into(), spans: vec![], sha256: Some(h) },
    }))
}

/// ครั้งก่อนสมบูรณ์จากตรวจละเอียด หรือจากตรวจแบบเร็วที่ต่อมาจากตรวจละเอียด (basis full)
pub fn prev_full_ok(prev: Option<&Value>) -> bool {
    let Some(p) = prev else { return false };
    p["result"].as_str() == Some("ok") && (p["mode"].as_str() == Some("full") || p["basis"].as_str() == Some("full"))
}

/// สิ่งที่อ่านได้จากผล ffprobe หนึ่งบรรทัด · (เป็นบรรทัดของภาพหรือเสียงไหม, เวลา, เป็นภาพไหม, จำนวนข้อความผิดพลาดระดับ error ที่แปะมา)
/// ข้อความผิดพลาดอันที่สองของภาพเดียวกัน บางทีขึ้นบรรทัดใหม่ที่ไม่มี media_type ให้นับเป็นของภาพก่อนหน้า
pub(crate) fn parse_frame(line: &str) -> (bool, Option<f64>, bool, usize) {
    let mut kind = None;
    let mut t = None;
    let mut errs = 0;
    for part in line.split('|') {
        if let Some(v) = part.strip_prefix("media_type=") {
            kind = Some(v.trim());
        } else if let Some(v) = part.strip_prefix("best_effort_timestamp_time=") {
            t = v.trim().parse::<f64>().ok();
        }
        // ข้อความผิดพลาดหลายอันต่อกันในช่องเดียวโดยไม่มีตัวคั่น นับจากคำว่า level= ทุกที่
        for (i, _) in part.match_indices("level=") {
            let num: String = part[i + 6..].chars().take_while(|c| c.is_ascii_digit()).collect();
            if num.parse::<i32>().map(|n| n <= 16).unwrap_or(false) {
                errs += 1;
            }
        }
    }
    (kind.is_some(), t, kind == Some("video"), errs)
}

/// ตัวถอดรหัสเสียงที่ ffmpeg ใช้ · ชื่อในวงเล็บหน้าข้อความผิดพลาดตรงกับรายการนี้ = เสียที่เสียง
const AUDIO_DECODERS: [&str; 22] = ["aac", "aac_fixed", "ac3", "ac3_fixed", "eac3", "dca", "truehd", "mlp", "mp3", "mp3float", "mp2", "mp2float",
    "mp1", "opus", "libopus", "vorbis", "libvorbis", "flac", "alac", "wmav2", "wmapro", "amrnb"];

/// ข้อความผิดพลาดของ ffmpeg หนึ่งบรรทัด เสียที่ไหน · (ภาพ, เสียง) · None = ไม่ใช่ข้อความผิดพลาด (บรรทัดความคืบหน้า key=value)
pub(crate) fn error_kind(line: &str) -> Option<(bool, bool)> {
    let l = line.trim();
    // บรรทัดความคืบหน้าเป็น ชื่อ=ค่า ชื่อเป็นตัวเล็ก ตัวเลข ขีดล่าง · ค่ามีช่องว่างได้ เช่น speed= 100x (เคยนับเป็นข้อความผิดพลาด)
    let key = l.split('=').next().unwrap_or("");
    if l.is_empty() || (l.contains('=') && !key.is_empty() && key.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')) {
        return None;
    }
    let Some(ctx) = l.strip_prefix('[').and_then(|r| r.split(" @").next()) else { return Some((true, true)) };
    // [in#0/matroska,webm @ …] ตัวแยกไฟล์ · [vist#0:0/h264 @ …] [aist#0:1/aac @ …] บอกชนิดตรง ๆ · [h264 @ …] ตัวถอดรหัส
    let name = ctx.rsplit('/').next().unwrap_or(ctx);
    if ctx.starts_with("aist#") {
        return Some((false, true));
    }
    if ctx.starts_with("vist#") {
        return Some((true, false));
    }
    if ctx.starts_with("in#") || name.contains(',') {
        return Some((true, true));
    }
    let audio = AUDIO_DECODERS.contains(&name) || name.starts_with("pcm_") || name.starts_with("adpcm_");
    Some((!audio, audio))
}

/// ข้อความที่บอกว่าอ่านไฟล์จากดิสก์ไม่ได้ (ไดรฟ์หลุด สายหลวม ไฟล์ถูกย้าย) ไม่ใช่ภาพแตกหรือเสียงหาย
/// เดิมนับเป็นจุดเสียทั้งภาพและเสียง ไฟล์ดีขึ้นว่าเสียหาย (AUDIT 12 พ.ย. 2569 ข้อ 29)
pub(crate) fn io_error(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    ["input/output error", "i/o error", "error number -5", "permission denied", "no such file or directory", "device not ready", "the device is not ready", "network path was not found"]
        .iter().any(|k| l.contains(k))
}

/// ผลรอบแรก · จุดเสียแบบคร่าว (เวลาตามความคืบหน้าล่าสุด) · ภาพเสียงถอดได้ถึงวินาทีไหน · ffmpeg ส่งความคืบหน้ามาไหม · อ่านดิสก์ไม่ได้ (ข้อความแรก)
#[derive(Default)]
struct Rough {
    hits: Vec<Hit>,
    last: f64,
    progressed: bool,
    io: Option<String>,
}

/// อ่านไฟล์ไม่จบเพราะดิสก์หรือไฟล์ ไม่ใช่ไฟล์เสีย · ขึ้นว่าตรวจไม่ได้ ผลเดิมของเรื่องนั้นคงไว้
pub(crate) const IO_FAIL: &str = "อ่านไฟล์ไม่จบระหว่างตรวจ ไดรฟ์อาจหลุดหรือไฟล์ถูกย้าย ไฟล์อาจยังดีอยู่ เสียบไดรฟ์ให้แน่นแล้วตรวจใหม่";

/// รอบแรก ffmpeg ถอดทุกภาพแบบหลายเส้นทำงาน (เร็ว) · ความคืบหน้ากับข้อความผิดพลาดออกช่องเดียวกันตามลำดับ (-progress pipe:2)
/// เวลาของจุดเสียคือความคืบหน้าล่าสุดก่อนข้อความนั้น คลาดได้ไม่กี่วินาที รอบสองค่อยหาเวลาแม่น
/// ffprobe แบบหลายเส้นทำงานใช้แทนไม่ได้ ข้อความผิดพลาดไม่แปะกับภาพ (ลองแล้ว จับไม่ได้เลย)
/// ตำแหน่งไบต์ในข้อความผิดพลาดของตัวแยกไฟล์ เช่น "0x00 at pos 24464080 (0x1754ad0) invalid …"
pub(crate) fn byte_pos(line: &str) -> Option<u64> {
    let i = line.find("pos ")?;
    let num: String = line[i + 4..].chars().take_while(|c| c.is_ascii_digit()).collect();
    num.parse().ok()
}

fn rough_pass(tools: &Path, path: &Path, total: Option<f64>, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Rough>, String> {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let args: Vec<OsString> = vec![
        "-nostdin".into(), "-hide_banner".into(), "-n".into(), "-v".into(), "error".into(), "-progress".into(), "pipe:2".into(),
        "-stats_period".into(), "0.05".into(), "-i".into(), path.into(), "-map".into(), "0:V?".into(), "-map".into(), "0:a?".into(),
        "-f".into(), "null".into(), "-".into(),
    ];
    let mut child = crate::app::tools::tool_command(tools, "ffmpeg", &args).stdout(Stdio::null()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::app::winutil::kill_with_app(&child);
    let err = child.stderr.take().unwrap();
    let state = Arc::new(Mutex::new((Rough::default(), VecDeque::<String>::new())));
    let st = state.clone();
    let reader = std::thread::spawn(move || {
        for l in BufReader::new(err).lines().map_while(Result::ok) {
            let mut g = st.lock().unwrap();
            let (r, tail) = &mut *g;
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok()) {
                r.last = r.last.max(us / 1_000_000.0);
                r.progressed = true;
                continue;
            }
            if io_error(&l) {
                if r.io.is_none() { r.io = Some(l.trim().chars().take(160).collect()); }
                continue;
            }
            if let Some((video, audio)) = error_kind(&l) {
                // ตัวแยกไฟล์อ่านนำหน้าตัวถอดรหัสไปไกล ตอนเครื่องทำงานหนักนำได้หลายสิบวินาที (เทสเจอที่ 2.6 ทั้งที่เสียที่ 30)
                // ข้อความที่บอกตำแหน่งไบต์ คิดเวลาจากตำแหน่งเทียบขนาดไฟล์แทนความคืบหน้า รอบสองค่อยหาเวลาแม่น
                let at = match (video && audio, byte_pos(&l), total) {
                    (true, Some(pos), Some(d)) if size > 0 => pos as f64 / size as f64 * d,
                    _ => r.last,
                };
                if video { r.hits.push(Hit { at, video: true }); }
                if audio { r.hits.push(Hit { at, video: false }); }
                tail.push_back(l);
                if tail.len() > 20 { tail.pop_front(); }
            }
        }
    });
    let status = loop {
        if stop() {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Ok(None);
        }
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            break st;
        }
        if let Some(d) = total {
            let last = state.lock().unwrap().0.last;
            on((last / d * 100.0).min(100.0));
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let _ = reader.join();
    let (rough, tail) = std::mem::take(&mut *state.lock().unwrap());
    if !rough.progressed || (rough.last <= 0.0 && !crate::app::tools::tool_succeeded("ffmpeg", &status)) {
        // สาเหตุเป็นประโยคไทย ไม่ใช่แค่รหัส (BUGS ข้อ 150)
        let why = crate::app::tools::explain_fail("ffmpeg", &crate::app::tools::tool_lines(&tail.iter().cloned().collect::<Vec<_>>().join("\n")), Some(&status)).line();
        return Err(format!("ffmpeg อ่านภาพเสียงในไฟล์ไม่ได้เลย  {why}"));
    }
    Ok(Some(rough))
}

/// รอบสอง ffprobe ถอดแบบเส้นเดียวเฉพาะช่วง from–to · ข้อความผิดพลาดแปะมากับภาพที่ถอดตอนนั้น ได้เวลาแม่นทุกภาพ
pub(crate) fn exact_pass(tools: &Path, path: &Path, from: f64, to: f64) -> Result<Vec<Hit>, String> {
    let args: Vec<OsString> = vec![
        "-v".into(), "error".into(), "-read_intervals".into(), format!("{from:.3}%{to:.3}").into(), "-show_log".into(), "16".into(),
        "-show_entries".into(), "frame=media_type,best_effort_timestamp_time:log=context,level".into(),
        "-of".into(), "compact=p=0".into(), path.into(),
    ];
    let out = crate::app::tools::run_tool_timeout(tools, "ffprobe", &args, Duration::from_secs(600))?;
    // ffprobe เปิดไฟล์ไม่ได้ (ไดรฟ์หลุด) ได้ผลว่าง เดิมถือว่าไม่เจอแล้วใช้จุดคร่าวจากรอบแรกแทน (AUDIT ข้อ 29)
    if out.stdout.is_empty() && !crate::app::tools::tool_succeeded("ffprobe", &out.status) {
        return Err(IO_FAIL.into());
    }
    let mut hits = Vec::new();
    let (mut last_t, mut last_video) = (from, true);
    for l in String::from_utf8_lossy(&out.stdout).lines() {
        let (frame, t, video, errs) = parse_frame(l);
        if frame {
            if let Some(t) = t { last_t = t; }
            last_video = video;
        }
        for _ in 0..errs {
            hits.push(Hit { at: last_t, video: last_video });
        }
    }
    Ok(hits)
}

/// ตรวจละเอียด · สองรอบ หาจุดเสียคร่าวทั้งเรื่องแบบเร็ว แล้วหาเวลาแม่นเฉพาะรอบจุดที่เจอ · ไม่เสียคิด SHA-256 จดไว้
/// None = กดหยุด · on ได้ 0–100 (รอบแรก 0–85 รอบสอง 85–90 คิด hash 90–100)
pub fn deep(tools: &Path, path: &Path, length: Option<f64>, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<Option<Outcome>, String> {
    let s = structure(path)?;
    let total = length.filter(|d| d.is_finite() && *d > 0.0);
    let mark0 = file_mark(path);
    let Some(rough) = rough_pass(tools, path, total, &|p| on(p * 0.85), stop)? else { return Ok(None) };
    // อ่านดิสก์ไม่ได้ระหว่างรอบแรก หรือไฟล์หายหรือเปลี่ยนหลังรอบแรก เป็นตรวจไม่ได้ ไม่ใช่ไฟล์เสีย (AUDIT ข้อ 29)
    if rough.io.is_some() || !path.is_file() || file_mark(path) != mark0 {
        return Err(IO_FAIL.into());
    }
    let short_tail = RELIABLE_LENGTH.contains(&ext_of(path).as_str())
        && total.map(|d| rough.last < d - TAIL_TOLERANCE).unwrap_or(false);
    let truncated = short_tail || matches!(s, Structure::Truncated(_));
    let rough_spots = merge_hits(&rough.hits, MERGE_GAP);
    let mut hits = Vec::new();
    for (k, sp) in rough_spots.iter().enumerate() {
        if stop() {
            return Ok(None);
        }
        // ความคืบหน้าตามหลังตัวถอดรหัส จุดจริงอยู่หลังเวลาคร่าวได้ไม่กี่วินาที
        let exact = exact_pass(tools, path, (sp.start - 5.0).max(0.0), sp.end + 15.0)?;
        if !exact.is_empty() {
            hits.extend(exact);
        } else if !(truncated && sp.start >= rough.last - 10.0) {
            hits.extend(rough.hits.iter().filter(|h| h.at >= sp.start && h.at <= sp.end).copied());
        }
        // ไฟล์ขาดท้าย ข้อความผิดพลาดตรงที่ไฟล์ถูกตัดหาเวลาแม่นไม่ได้ เวลาคร่าวแกว่งตามความเร็วเครื่อง (เทสได้ 0:40 กับ 0:35)
        // ไม่นับเป็นจุดเสียแยก ช่วงขาดท้ายข้างล่างบอกแล้วว่าภาพเสียงจบที่ไหน
        on(85.0 + 5.0 * (k + 1) as f64 / rough_spots.len() as f64);
    }
    let scan = rough;

    let spots = merge_hits(&hits, MERGE_GAP);
    let mut spans: Vec<Value> = spots.iter().map(|s| json!({ "from": s.start, "to": s.end, "what": spot_what(s) })).collect();
    if truncated {
        let from = scan.last;
        let what = match total {
            Some(d) if short_tail => format!("ขาดท้าย ภาพเสียงจบที่ {} จากความยาว {}", fmt_time(from), fmt_time(d)),
            _ => truncated_text(match s { Structure::Truncated(m) => m, _ => None }),
        };
        spans.push(json!({ "from": from, "to": total.unwrap_or(from), "what": what, "tail": true }));
    }
    if let Structure::Broken(why) = &s {
        return Ok(Some(bad(format!("โครงไฟล์เสีย {why}"), spans)));
    }
    if !spots.is_empty() || truncated {
        let summary = match (spots.len(), truncated) {
            (0, _) => match total {
                Some(d) if short_tail => format!("ไฟล์ขาดท้าย เล่นได้ถึง {} จากความยาว {}", fmt_time(scan.last), fmt_time(d)),
                _ => truncated_text(match s { Structure::Truncated(m) => m, _ => None }),
            },
            (1, t) => {
                let sp = &spots[0];
                let at = if fmt_time(sp.start) == fmt_time(sp.end) {
                    format!("{}เสียที่นาที {}", spot_kind(sp), fmt_time(sp.start))
                } else {
                    format!("{}เสียช่วงนาที {} ถึง {}", spot_kind(sp), fmt_time(sp.start), fmt_time(sp.end))
                };
                if t { format!("{at} และไฟล์ขาดท้าย") } else { at }
            }
            (n, t) => format!("เสีย {n} ช่วง ช่วงแรกที่นาที {}{}", fmt_time(spots[0].start), if t { " และไฟล์ขาดท้าย" } else { "" }),
        };
        return Ok(Some(bad(summary, spans)));
    }
    // ไม่เสีย · จดค่า hash ใหม่ไว้เทียบตอนตรวจแบบเร็วครั้งหน้า (ไฟล์ที่ขึ้นว่าถูกเปลี่ยน ตรวจละเอียดผ่านแล้วถือค่าใหม่)
    let Some(h) = sha256(path, &|p| on(90.0 + p * 0.1), stop)? else { return Ok(None) };
    Ok(Some(Outcome { result: "ok", summary: "ตรวจละเอียด ไม่พบที่เสีย".into(), spans: vec![], sha256: Some(h) }))
}

