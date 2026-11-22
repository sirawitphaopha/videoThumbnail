//! ส่งออก PGS ขนาดไฟล์ที่น่าจะได้
//! แยกจาก pgs/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ขนาดไฟล์ที่น่าจะได้

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsEstimate {
    /// จำนวนภาพที่คาด
    pub images: usize,
    /// ขนาดไฟล์ที่คาด ไบต์
    pub bytes: u64,
    /// ภาพที่วาดจริงเพื่อคิด
    pub sampled: usize,
}

/// คาดขนาดไฟล์ · วาดภาพจริงไม่เกิน 8 ภาพกระจายทั้งเรื่อง ทำเป็นชุดภาพของ PGS แล้วเอาขนาดเฉลี่ยคูณจำนวนภาพ (พี่กันสั่ง 15 พ.ย. 2569 "เขียนขนาดไฟล์ซับที่น่าจะได้ด้วย")
/// SUPer เปลี่ยนจานสีแทนวาดภาพใหม่ตอนเอฟเฟกต์ ภาพของบรรทัดเคลื่อนไหวคิดราว 30% (ซับทดสอบ 4.9 MB เหลือ 1.8 MB) · SeConv หนึ่งภาพต่อหนึ่งบรรทัด เอฟเฟกต์หาย
pub fn estimate(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, cancel: &dyn Fn() -> bool) -> Result<PgsEstimate, String> {
    let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
    let prep = prepare(doc, req);
    let d = &prep.doc;
    let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
    let pts = change_points(d, frame_ms);
    let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(d, pts[i])).collect();
    if need.is_empty() { return Ok(PgsEstimate::default()); }
    let anim_at = |t: i64| d.events.iter().any(|e| !e.comment && e.start <= t && t < e.end && animated(&e.text));
    let seconv = req.engine == "seconv";
    // SeConv ไม่วาดเอฟเฟกต์ เลือกเฉพาะจุดเริ่มของบรรทัด
    let pool: Vec<i64> = if seconv { need.iter().map(|&i| pts[i]).filter(|&t| d.events.iter().any(|e| !e.comment && e.start == t)).collect() } else { need.iter().map(|&i| pts[i]).collect() };
    let pool = if pool.is_empty() { need.iter().map(|&i| pts[i]).collect() } else { pool };
    let n = pool.len().min(8);
    let times: Vec<i64> = (0..n).map(|k| pool[k * pool.len() / n]).collect();
    let (_, coef709) = matrices(&req.opts, h, prep.tv601);
    let enc = Enc::of(&req.opts);
    let sub = crate::subtitle::subshot::TmpSub::new(work, d)?;
    let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subtitle::subshot::movie_fonts(tools, work, Path::new(m)));
    let mut sizes: Vec<(i64, usize)> = vec![];
    let mut pal_lens: Vec<usize> = vec![];
    render_all(tools, &sub.0, fonts.as_deref(), w, h, &times, &mut |k: usize, buf: &[u8]| {
        if let Some(im) = image_of(buf, w as usize, h as usize, &enc) { pal_lens.push(im.palette.len()); sizes.push((times[k], show_set(0, 0, w as u16, h as u16, 0x10, &im, coef709).len())); }
        Ok(())
    }, cancel)?;
    // บรรทัดที่เฟดอย่างเดียว ตัวสร้างชั้นหนังส่งภาพเต็มครั้งเดียว เฟรมช่วงเฟดเปลี่ยนแค่จานสี เฟรมกลางที่ภาพไม่เปลี่ยนไม่เขียน (BUGS ข้อ 126)
    // ชุดเปลี่ยนจานสีราว หัวสามส่วน 39 ไบต์ PCS 19 ไบต์บวก 8 ต่อภาพ PDS 2 ไบต์บวก 5 ต่อสี
    let avg_pal = if pal_lens.is_empty() { 64.0 } else { pal_lens.iter().sum::<usize>() as f64 / pal_lens.len() as f64 };
    let pal_set = 39.0 + 27.0 + 2.0 + 5.0 * avg_pal;
    let fade_ev: Vec<(i64, i64, i64, i64)> = d.events.iter().filter(|e| !e.comment && e.end > e.start)
        .filter_map(|e| fade_of(&e.text).filter(|f| f.0 > 0 || f.1 > 0).map(|(fi, fo)| (e.start, e.end, fi, fo))).collect();
    let in_fade_ev = |t: i64| fade_ev.iter().any(|f| t >= f.0 && t < f.1);
    let in_fading = |t: i64| fade_ev.iter().any(|f| t >= f.0 && t < f.1 && (t < f.0 + f.2 || t >= f.1 - f.3));
    let avg = |anim: Option<bool>| { let v: Vec<usize> = sizes.iter().filter(|(t, _)| anim.is_none_or(|a| anim_at(*t) == a)).map(|x| x.1).collect(); if v.is_empty() { None } else { Some(v.iter().sum::<usize>() as f64 / v.len() as f64) } };
    let all = avg(None).unwrap_or(0.0);
    // ชุดล้างจอราว 40 ไบต์ต่อครั้ง
    let clears = d.events.iter().filter(|e| !e.comment && e.end > e.start).count() as f64 * 40.0;
    let (images, bytes) = if seconv {
        let lines = d.events.iter().filter(|e| !e.comment && e.end > e.start).count();
        (lines, lines as f64 * all + clears)
    } else {
        let (na, ns) = need.iter().fold((0usize, 0usize), |(a, s), &i| if anim_at(pts[i]) { (a + 1, s) } else { (a, s + 1) });
        let (sa, ss) = (avg(Some(true)).unwrap_or(all), avg(Some(false)).unwrap_or(all));
        if req.engine == "super" {
            (ns + (na as f64 * 0.3).round() as usize, ns as f64 * ss + na as f64 * sa * 0.3 + clears)
        } else {
            // ชั้นหนัง · เฟรมของบรรทัดเฟด แยกออกจากเฟรมเคลื่อนไหวอื่น
            let nf = need.iter().filter(|&&i| in_fading(pts[i])).count();
            let nfe = need.iter().filter(|&&i| anim_at(pts[i]) && in_fade_ev(pts[i])).count();
            let other = na.saturating_sub(nfe);
            let images = ns + other + fade_ev.len() + nf;
            (images, ns as f64 * ss + other as f64 * sa + fade_ev.len() as f64 * ss + nf as f64 * pal_set + clears)
        }
    };
    Ok(PgsEstimate { images, bytes: bytes.round() as u64, sampled: sizes.len() })
}

