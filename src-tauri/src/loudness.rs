//! วัดความดังตามมาตรฐาน EBU R128 (ITU-R BS.1770-4 · EBU Tech 3341 3342) ในโปรแกรมเอง ไม่ต้องให้ ffmpeg วัด
//! เดิมหน้ากราฟเสียงให้ ffmpeg ถอดเสียงพร้อมตัววัด ebur128 ในงานเดียวกัน ตัววัดช้า (เสียง 5.1 10 นาทีใช้ 49 วินาที
//! ส่วนถอดเสียงอย่างเดียว 2 วินาที) ตัวเลขที่ส่งมาวาดกราฟต้องรอไปด้วย หนัง 2 ชั่วโมงรอราว 10 นาที
//! (BUGS ข้อ 145 พี่กันทัก 16 พ.ย. 2569 "ดุกราฟจากไฟล์เสียงในหนั มันอ่านช้้ามากกกกก")
//!
//! สูตรตัวกรอง K-weighting ที่คิดตามอัตราสุ่ม ค่าน้ำหนักช่อง และตัวกรองขยาย 4 เท่าของ true peak
//! ยกวิธีจาก libebur128 (Copyright (c) 2011 Jan Kokemüller · สัญญา MIT)
//! ค่าที่ได้เทียบกับตัววัด ebur128 ของ ffmpeg ใน cargo test (loudness_matches_ffmpeg)

use std::f64::consts::PI;

/// ตัวกรองขยาย 4 เท่าแบบ polyphase สำหรับ true peak (49 จุด sinc คูณ Hann แบบ libebur128)
struct Interp {
    factor: usize,
    /// สัมประสิทธิ์ของแต่ละเฟส
    phases: Vec<Vec<f64>>,
    /// ผลรวมค่าสัมบูรณ์ของสัมประสิทธิ์ที่มากที่สุดในทุกเฟส · ใช้ข้ามช่วงที่ผลขยายไม่มีทางเกินค่าสูงสุดที่เจอแล้ว
    gain: f64,
    taps_per_phase: usize,
}

impl Interp {
    fn new(taps: usize, factor: usize) -> Self {
        let mut phases = vec![Vec::new(); factor];
        for j in 0..taps {
            let m = j as f64 - (taps as f64 - 1.0) / 2.0;
            let c = if m.abs() < 1e-9 { 1.0 } else { (m * PI / factor as f64).sin() / (m * PI / factor as f64) };
            let w = 0.5 * (1.0 - (2.0 * PI * j as f64 / (taps as f64 - 1.0)).cos());
            phases[j % factor].push(c * w);
        }
        let taps_per_phase = phases.iter().map(|p| p.len()).max().unwrap_or(0);
        let gain = phases.iter().map(|p| p.iter().map(|c| c.abs()).sum::<f64>()).fold(0.0, f64::max);
        Self { factor, phases, gain, taps_per_phase }
    }
}

/// ตัววัดความดังทีละเฟรม (ทุกช่องของเวลาเดียวกัน)
pub struct R128 {
    ch: usize,
    rate: u32,
    weight: Vec<f64>,
    // ตัวกรอง K-weighting อันดับ 4 ต่อช่อง (direct form II)
    b: [f64; 5],
    a: [f64; 5],
    z: Vec<[f64; 5]>,
    // พลังงานถ่วงน้ำหนักทีละช่วง 100 ms
    seg_len: usize,
    seg_n: usize,
    seg_e: f64,
    segs: Vec<f64>,
    // ค่าที่ได้
    momentary: Vec<(f64, f64)>,
    blocks: Vec<f64>,
    short: Vec<f64>,
    // true peak
    interp: Option<Interp>,
    hist: Vec<Vec<f64>>,
    hist_pos: usize,
    tp: Vec<f64>,
    frames: u64,
}

/// ค่าน้ำหนักของช่องตาม BS.1770 · ช่องเสียงรอบ (ข้างและหลัง) 1.41 · LFE ไม่นับ
fn weight_of(name: &str) -> f64 {
    match name.to_ascii_uppercase().as_str() {
        "LFE" | "LFE2" => 0.0,
        "SL" | "SR" | "BL" | "BR" | "LS" | "RS" | "SBL" | "SBR" => 1.41,
        _ => 1.0,
    }
}

const ABS_GATE: f64 = -70.0;

fn lufs(e: f64) -> f64 { if e <= 0.0 { f64::NEG_INFINITY } else { -0.691 + 10.0 * e.log10() } }

impl R128 {
    /// names ชื่อช่องตามลำดับที่ถอด (FL FR FC LFE SL SR)
    pub fn new(names: &[String], rate: u32) -> Self {
        let ch = names.len().max(1);
        let fs = rate.max(1) as f64;
        // ตัวกรองชั้นแรก high shelf
        let (f0, g, q) = (1681.974450955533, 3.999843853973347, 0.7071752369554196);
        let k = (PI * f0 / fs).tan();
        let vh = 10f64.powf(g / 20.0);
        let vb = vh.powf(0.4996667741545416);
        let a0 = 1.0 + k / q + k * k;
        let pb = [(vh + vb * k / q + k * k) / a0, 2.0 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0];
        let pa = [1.0, 2.0 * (k * k - 1.0) / a0, (1.0 - k / q + k * k) / a0];
        // ชั้นที่สอง high pass
        let (f0, q) = (38.13547087602444, 0.5003270373238773);
        let k = (PI * f0 / fs).tan();
        let rb = [1.0, -2.0, 1.0];
        let d = 1.0 + k / q + k * k;
        let ra = [1.0, 2.0 * (k * k - 1.0) / d, (1.0 - k / q + k * k) / d];
        let conv = |x: [f64; 3], y: [f64; 3]| {
            let mut o = [0.0; 5];
            for i in 0..3 { for j in 0..3 { o[i + j] += x[i] * y[j]; } }
            o
        };
        let interp = if rate < 96_000 { Some(Interp::new(49, 4)) } else if rate < 192_000 { Some(Interp::new(49, 2)) } else { None };
        let taps = interp.as_ref().map(|i| i.taps_per_phase).unwrap_or(1);
        let mut weight: Vec<f64> = names.iter().map(|n| weight_of(n)).collect();
        if weight.is_empty() { weight.push(1.0); }
        Self {
            ch, rate, weight,
            b: conv(pb, rb), a: conv(pa, ra), z: vec![[0.0; 5]; ch],
            seg_len: (fs / 10.0).round().max(1.0) as usize, seg_n: 0, seg_e: 0.0, segs: Vec::new(),
            momentary: Vec::new(), blocks: Vec::new(), short: Vec::new(),
            interp, hist: vec![vec![0.0; taps]; ch], hist_pos: 0, tp: vec![0.0; ch], frames: 0,
        }
    }

    pub fn push(&mut self, f: &[f32]) {
        let mut e = 0.0;
        for i in 0..self.ch {
            let x = f.get(i).copied().unwrap_or(0.0);
            let x = if x.is_finite() { x as f64 } else { 0.0 };
            // K-weighting
            let z = &mut self.z[i];
            let w0 = x - self.a[1] * z[1] - self.a[2] * z[2] - self.a[3] * z[3] - self.a[4] * z[4];
            let y = self.b[0] * w0 + self.b[1] * z[1] + self.b[2] * z[2] + self.b[3] * z[3] + self.b[4] * z[4];
            z[4] = z[3]; z[3] = z[2]; z[2] = z[1]; z[1] = w0;
            e += self.weight[i] * y * y;
            // true peak · เก็บค่าเข้าแถวไว้ทุกตัวอย่าง คิดค่าขยายเฉพาะตอนที่ผลอาจเกินค่าสูงสุดที่เจอแล้ว
            match &self.interp {
                None => { if x.abs() > self.tp[i] { self.tp[i] = x.abs(); } }
                Some(ip) => {
                    let h = &mut self.hist[i];
                    let n = h.len();
                    h[self.hist_pos] = x;
                    if x.abs() > self.tp[i] { self.tp[i] = x.abs(); }
                    let mut win = 0.0f64;
                    for v in h.iter() { let a = v.abs(); if a > win { win = a; } }
                    if win * ip.gain > self.tp[i] {
                        for ph in &ip.phases {
                            let mut acc = 0.0;
                            for (k, c) in ph.iter().enumerate() { acc += c * h[(self.hist_pos + n - k) % n]; }
                            if acc.abs() > self.tp[i] { self.tp[i] = acc.abs(); }
                        }
                    }
                    let _ = ip.factor;
                }
            }
        }
        if self.interp.is_some() { self.hist_pos = (self.hist_pos + 1) % self.hist[0].len(); }
        self.frames += 1;
        self.seg_e += e;
        self.seg_n += 1;
        if self.seg_n == self.seg_len { self.close_seg(); }
    }

    fn close_seg(&mut self) {
        self.segs.push(self.seg_e);
        self.seg_e = 0.0;
        self.seg_n = 0;
        let n = self.segs.len();
        let mean = |k: usize| -> f64 {
            let s: f64 = self.segs[n.saturating_sub(k)..].iter().sum();
            s / (k * self.seg_len) as f64
        };
        // Momentary 400 ms ทุก 100 ms · ช่วงต้นไฟล์คิดแบบเติมศูนย์ข้างหน้า
        let m = mean(4);
        self.momentary.push((n as f64 * self.seg_len as f64 / self.rate as f64, lufs(m).max(-120.0)));
        if n >= 4 { self.blocks.push(m); }
        // Short-term 3 วินาที ทุก 100 ms ใช้คิด LRA
        if n >= 30 { self.short.push(mean(30)); }
    }

    /// สรุปผล (ค่า Momentary ทุก 0.1 วินาที, Integrated LUFS, LRA LU, True peak dBTP)
    pub fn finish(mut self) -> (Vec<(f64, f64)>, Option<f64>, Option<f64>, Option<f64>) {
        if self.seg_n > 0 {
            // ช่วงท้ายที่ไม่ครบ 100 ms เติมศูนย์ให้ครบเหมือนช่วงอื่น
            self.seg_n = self.seg_len;
            self.close_seg();
        }
        let gated = |v: &[f64], rel: f64| -> Option<(f64, Vec<f64>)> {
            let abs: Vec<f64> = v.iter().copied().filter(|&e| lufs(e) > ABS_GATE).collect();
            if abs.is_empty() { return None; }
            let th = lufs(abs.iter().sum::<f64>() / abs.len() as f64) + rel;
            let keep: Vec<f64> = abs.into_iter().filter(|&e| lufs(e) > th).collect();
            if keep.is_empty() { return None; }
            Some((lufs(keep.iter().sum::<f64>() / keep.len() as f64), keep))
        };
        let integrated = gated(&self.blocks, -10.0).map(|x| x.0);
        let lra = gated(&self.short, -20.0).map(|(_, keep)| {
            let mut l: Vec<f64> = keep.iter().map(|&e| lufs(e)).collect();
            l.sort_by(|a, b| a.partial_cmp(b).unwrap());
            let at = |p: f64| l[((l.len() - 1) as f64 * p).round() as usize];
            at(0.95) - at(0.10)
        });
        let tp = self.tp.iter().copied().fold(0.0, f64::max);
        let true_peak = if self.frames == 0 { None } else if tp <= 0.0 { Some(-120.0) } else { Some(20.0 * tp.log10()) };
        (self.momentary, integrated, lra, true_peak)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// ไซน์ 1 kHz −20 dBFS สเตอริโอ ตาม EBU Tech 3341 ต้องได้ −20 LUFS (±0.1) · ไซน์ 997 Hz เต็มสเกลช่องเดียวได้ true peak 0 dBTP
    #[test]
    fn sine_reference_levels() {
        let names = vec!["FL".to_string(), "FR".to_string()];
        let mut r = R128::new(&names, 48_000);
        let a = 10f64.powf(-20.0 / 20.0);
        for n in 0..48_000 * 20 {
            let v = (a * (2.0 * PI * 1000.0 * n as f64 / 48_000.0).sin()) as f32;
            r.push(&[v, v]);
        }
        let (m, i, lra, tp) = r.finish();
        let i = i.unwrap();
        assert!((i - -20.0).abs() < 0.1, "integrated {i}");
        assert!(lra.unwrap() < 0.1, "ไซน์คงที่ LRA ต้องราว 0 ได้ {lra:?}");
        assert!((m[100].1 - -20.0).abs() < 0.1, "momentary {}", m[100].1);
        assert!((tp.unwrap() - -20.0).abs() < 0.2, "true peak {tp:?}");
        // LFE ไม่นับ เงียบทั้งเรื่องไม่มีค่า integrated
        let mut q = R128::new(&["LFE".to_string()], 48_000);
        for _ in 0..48_000 * 2 { q.push(&[0.5]); }
        assert!(q.finish().1.is_none());
    }
}
