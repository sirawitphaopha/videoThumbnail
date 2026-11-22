//! กราฟเสียง ถอดเสียงด้วย ffmpeg เป็นตัวเลขทีละช่อง
//! แยกจาก audiograph/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------- ถอดเสียงด้วย ffmpeg ----------

pub(crate) struct Run {
    /// ข้อความผิดพลาดท้าย ๆ ไว้บอกตอนอ่านไม่ได้
    pub(crate) tail: Vec<String>,
    /// ความดังทุก 0.1 วินาที (เวลา, Momentary LUFS) และสรุป
    pub(crate) loud: Vec<(f64, f64)>,
    pub(crate) integrated: Option<f64>,
    pub(crate) lra: Option<f64>,
    pub(crate) true_peak: Option<f64>,
}

fn after_num(l: &str, key: &str) -> Option<f64> {
    let i = l.find(key)? + key.len();
    let s: String = l[i..].trim_start().chars().take_while(|c| c.is_ascii_digit() || *c == '.' || *c == '-').collect();
    s.parse().ok()
}

/// เปิด ffmpeg ถอดแทร็ก แล้วป้อนตัวเลขทีละเฟรม (ทุกช่องของเวลาเดียวกัน) · stop คืน true = หยุด · คืน None ถ้าโดนหยุด
#[allow(clippy::too_many_arguments)]
pub(crate) fn decode(tools: &Path, path: &Path, track: usize, ch: usize, start: Option<f64>, len: Option<f64>, loudness: bool,
          feed: &mut dyn FnMut(&[f32]), stop: &dyn Fn() -> bool) -> Result<Option<Run>, String> {
    let mut args: Vec<OsString> = vec!["-nostdin".into(), "-hide_banner".into(), "-nostats".into(), "-v".into(), (if loudness { "info" } else { "error" }).into()];
    // เวลาเริ่มกับความยาวส่งทศนิยม 6 หลัก (ไมโครวินาที) · เดิม 3 หลัก ซูมลึกแล้วภาพคลาดจากเวลาบนแกนได้ถึงครึ่งมิลลิวินาที
    // (เทียบกับเสียงที่ถอดแยกด้วย ffmpeg พบเลื่อน 18 ตัวอย่างที่ 44.1 kHz · พี่กันถาม 11 พ.ย. 2569 "มันคือกราฟเสียงจริงไหม ไม่ได้ใช่มโนเนอะ")
    if let Some(s) = start { args.extend(["-ss".into(), format!("{s:.6}").into()]); }
    args.extend(["-i".into(), path.into()]);
    if let Some(l) = len { args.extend(["-t".into(), format!("{l:.6}").into()]); }
    if loudness {
        args.extend([
            "-filter_complex".into(), format!("[0:a:{track}]asplit=2[p][l];[l]ebur128=peak=true[e]").into(),
            "-map".into(), "[p]".into(), "-f".into(), "f32le".into(), "-c:a".into(), "pcm_f32le".into(), "pipe:1".into(),
            "-map".into(), "[e]".into(), "-f".into(), "null".into(), "-".into(),
        ]);
    } else {
        args.extend(["-map".into(), format!("0:a:{track}").into(), "-f".into(), "f32le".into(), "-c:a".into(), "pcm_f32le".into(), "pipe:1".into()]);
    }
    let mut child = crate::app::tools::tool_command(tools, "ffmpeg", &args).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::app::winutil::kill_with_app(&child);
    let err = child.stderr.take().unwrap();
    let state = Arc::new(Mutex::new(Run { tail: Vec::new(), loud: Vec::new(), integrated: None, lra: None, true_peak: None }));
    let st = state.clone();
    let reader = std::thread::spawn(move || {
        let mut summary = false;
        for l in BufReader::new(err).lines().map_while(Result::ok) {
            let mut g = st.lock().unwrap();
            if l.contains("Parsed_ebur128") && l.contains(" t:") {
                if let (Some(t), Some(m)) = (after_num(&l, " t:"), after_num(&l, " M:")) { g.loud.push((t, m)); }
                continue;
            }
            if l.contains("Summary:") { summary = true; continue; }
            let t = l.trim();
            if summary {
                if t.starts_with("I:") { g.integrated = after_num(t, "I:"); }
                else if t.starts_with("LRA:") { g.lra = after_num(t, "LRA:"); }
                else if t.starts_with("Peak:") { g.true_peak = after_num(t, "Peak:"); }
                continue;
            }
            if !t.is_empty() && !t.starts_with('[') || t.contains("rror") {
                g.tail.push(t.to_string());
                if g.tail.len() > 8 { g.tail.remove(0); }
            }
        }
    });
    let mut out = child.stdout.take().unwrap();
    let mut buf = vec![0u8; 1 << 16];
    let mut carry: Vec<u8> = Vec::new();
    let frame_bytes = ch * 4;
    let mut frame = vec![0f32; ch];
    let mut stopped = false;
    loop {
        if stop() { stopped = true; let _ = child.kill(); break; }
        let n = match out.read(&mut buf) { Ok(0) => break, Ok(n) => n, Err(_) => break };
        carry.extend_from_slice(&buf[..n]);
        let whole = carry.len() / frame_bytes * frame_bytes;
        for fb in carry[..whole].chunks_exact(frame_bytes) {
            for (i, s) in frame.iter_mut().enumerate() { *s = f32::from_le_bytes([fb[i * 4], fb[i * 4 + 1], fb[i * 4 + 2], fb[i * 4 + 3]]); }
            feed(&frame);
        }
        carry.drain(..whole);
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = reader.join();
    if stopped { return Ok(None); }
    let run = std::mem::replace(&mut *state.lock().unwrap(), Run { tail: Vec::new(), loud: Vec::new(), integrated: None, lra: None, true_peak: None });
    if !tool_succeeded("ffmpeg", &status) && run.loud.is_empty() {
        return Err(format!("ffmpeg อ่านเสียงไม่ได้  {}", crate::app::tools::explain_fail("ffmpeg", &crate::app::tools::tool_lines(&run.tail.join("\n")), Some(&status)).line()));
    }
    Ok(Some(run))
}

