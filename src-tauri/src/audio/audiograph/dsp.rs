//! กราฟเสียง FFT กับตัวคิดระดับเสียง ดังสุด ดังเฉลี่ย ความถี่
//! แยกจาก audiograph/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ

// ---------- FFT ----------

/// FFT แบบ radix-2 ในที่ · ความยาวต้องเป็นกำลังของ 2
pub fn fft(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let mut len = 2;
    while len <= n {
        let ang = -2.0 * std::f64::consts::PI / len as f64;
        let (wr, wi) = (ang.cos(), ang.sin());
        let half = len / 2;
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0f64, 0.0f64);
            for k in 0..half {
                let (a, b) = (start + k, start + k + half);
                let (br, bi) = (re[b] as f64 * cr - im[b] as f64 * ci, re[b] as f64 * ci + im[b] as f64 * cr);
                let (ar, ai) = (re[a] as f64, im[a] as f64);
                re[a] = (ar + br) as f32;
                im[a] = (ai + bi) as f32;
                re[b] = (ar - br) as f32;
                im[b] = (ai - bi) as f32;
                let ncr = cr * wr - ci * wi;
                ci = cr * wi + ci * wr;
                cr = ncr;
            }
        }
        len <<= 1;
    }
}

/// ตัวคิดกำลังเสียงแต่ละความถี่ ใช้หน้าต่าง Hann · ผลเป็นกำลังที่หารให้คลื่นไซน์เต็มสเกลได้ 1 (0 dB)
pub(crate) struct Spectrum {
    n: usize,
    win: Vec<f32>,
    re: Vec<f32>,
    im: Vec<f32>,
    norm: f32,
}

impl Spectrum {
    pub(crate) fn new(n: usize) -> Self {
        let win = (0..n).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos()).collect();
        Spectrum { n, win, re: vec![0.0; n], im: vec![0.0; n], norm: (n as f32 / 4.0).powi(2) }
    }
    /// ใส่ตัวอย่างเสียง n ตัว (−1 ถึง 1) บวกกำลังของแต่ละช่องความถี่ลง out (ยาว n/2)
    pub(crate) fn add_power(&mut self, samples: &[f32], out: &mut [f32]) {
        for i in 0..self.n {
            self.re[i] = samples[i] * self.win[i];
            self.im[i] = 0.0;
        }
        fft(&mut self.re, &mut self.im);
        for (k, o) in out.iter_mut().enumerate().take(self.n / 2) {
            *o += (self.re[k] * self.re[k] + self.im[k] * self.im[k]) / self.norm;
        }
    }
}

pub(crate) fn db(p: f32) -> f32 {
    if p <= 1e-14 { -140.0 } else { 10.0 * p.log10() }
}

/// dB −120 ถึง 0 เป็นเลข 0–255 ไว้ส่งแบบย่อ
fn q8(d: f32) -> u8 {
    (((d + 120.0) / 120.0) * 255.0).round().clamp(0.0, 255.0) as u8
}

pub(crate) fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let v = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        s.push(T[(v >> 18) as usize & 63] as char);
        s.push(T[(v >> 12) as usize & 63] as char);
        s.push(if c.len() > 1 { T[(v >> 6) as usize & 63] as char } else { '=' });
        s.push(if c.len() > 2 { T[v as usize & 63] as char } else { '=' });
    }
    s
}

// ---------- ตัวคิดระหว่างอ่าน ----------

/// ความถี่ที่ส่งให้หน้าจอ · Lin ช่องเท่ากัน 0 ถึงครึ่งอัตราสุ่ม (แบบวิเคราะห์) · Log ช่วง 20 Hz ขึ้นไปแบบล็อก (แถบความถี่ทุกช่อง)
#[derive(Clone, Copy, PartialEq)]
pub(crate) enum Scale {
    Lin,
    Log,
}

/// เท่ากับค่าเดิมตอนอ่าน 16 bit · เสียงแตกที่ 32767/32768 · เงียบต่ำกว่า 10/32768 ราว −70 dBFS
const CLIP_LEVEL: f32 = 32767.0 / 32768.0;
const SILENCE_LEVEL: f32 = 10.0 / 32768.0;

pub(crate) struct Analyzer {
    ch: usize,
    rate: u32,
    total: f64,
    pub(crate) frame: u64,
    cols: usize,
    env_max: Vec<f32>,
    env_min: Vec<f32>,
    env_sq: Vec<f64>,
    env_n: Vec<u32>,
    // ความถี่
    n_fft: usize,
    spec_cols: usize,
    caps: Vec<(u64, usize)>,
    cap_i: usize,
    ring: Vec<Vec<f32>>,
    ring_pos: usize,
    acc: Vec<Vec<f32>>,
    acc_n: Vec<u32>,
    /// ตัวอย่างที่ป้อนแล้วทั้งหมด รวมเสียงก่อนขอบซ้าย
    fed: u64,
    /// เสียงก่อนขอบซ้ายที่ยังเหลือให้เติมหน้าต่าง FFT (ไม่นับในรูปคลื่น)
    pre_left: u64,
    /// เลื่อนจุดเก็บไปครึ่งหน้าต่าง หน้าต่าง FFT อยู่กึ่งกลางคอลัมน์ · 0 = แบบเดิมของภาพรวม
    shift: u64,
    spectrum: Spectrum,
    tmp: Vec<f32>,
    // สรุปทั้งเรื่อง
    pub(crate) peak: Vec<f32>,
    pub(crate) sq: Vec<f64>,
    pub(crate) clips: Vec<u32>,
    clip_run: Vec<u32>,
    block: usize,
    block_n: usize,
    block_max: f32,
    sil_start: Option<u64>,
    silences: Vec<(u64, u64)>,
}

impl Analyzer {
    pub(crate) fn new(ch: usize, rate: u32, total: f64, cols: usize, n_fft: usize, spec_cols: usize, per_col: usize) -> Self {
        let mut caps = Vec::with_capacity(spec_cols * per_col);
        for s in 0..spec_cols {
            for k in 0..per_col {
                let pos = (s as f64 + (k as f64 + 0.5) / per_col as f64) * total / spec_cols as f64;
                caps.push((pos.max(0.0) as u64, s));
            }
        }
        Analyzer {
            ch, rate, total, frame: 0, cols,
            env_max: vec![f32::NEG_INFINITY; ch * cols], env_min: vec![f32::INFINITY; ch * cols], env_sq: vec![0.0; ch * cols], env_n: vec![0; cols],
            n_fft, spec_cols, caps, cap_i: 0,
            ring: vec![vec![0.0; n_fft]; ch], ring_pos: 0,
            acc: vec![vec![0.0; spec_cols * (n_fft / 2)]; ch], acc_n: vec![0; spec_cols],
            fed: 0, pre_left: 0, shift: 0,
            spectrum: Spectrum::new(n_fft), tmp: vec![0.0; n_fft],
            peak: vec![0.0; ch], sq: vec![0.0; ch], clips: vec![0; ch], clip_run: vec![0; ch],
            block: (rate as usize / 10).max(1), block_n: 0, block_max: 0.0, sil_start: None, silences: Vec::new(),
        }
    }

    /// ช่วงที่ซูม · ป้อนเสียงก่อนขอบซ้าย `pre` ตัวอย่างไว้เติมหน้าต่าง FFT และวางหน้าต่างกึ่งกลางคอลัมน์
    /// (AUDIT ข้อ 23 · เดิมเริ่มที่ขอบซ้ายพอดี คอลัมน์ที่ยังไม่ครบหน้าต่างถูกข้ามเป็นสีดำ ซูมสุดดำทั้งกราฟ
    ///  และหน้าต่างอยู่หลังจุดเก็บ ภาพช้ากว่าแกนเวลาครึ่งหน้าต่าง) · ภาพรวมไม่ใช้ ผลกับแคชเดิมเหมือนเดิม
    pub(crate) fn centered(mut self, pre: u64) -> Self {
        self.pre_left = pre;
        self.shift = (self.n_fft / 2) as u64;
        self
    }

    fn ring_in(&mut self, f: &[f32]) {
        for i in 0..self.ch {
            let raw = f.get(i).copied().unwrap_or(0.0);
            self.ring[i][self.ring_pos] = if raw.is_finite() { raw } else { 0.0 };
        }
        self.ring_pos = (self.ring_pos + 1) % self.n_fft;
        self.fed += 1;
    }

    /// เก็บคอลัมน์ที่ถึงจุดแล้ว · แบบกึ่งกลาง ส่วนที่ยังไม่มีเสียง (ต้นไฟล์) เป็นศูนย์ในหน้าต่าง ไม่ข้ามคอลัมน์
    fn capture(&mut self, all: bool) {
        while self.cap_i < self.caps.len() && (all || self.frame >= self.caps[self.cap_i].0 + self.shift) {
            let col = self.caps[self.cap_i].1;
            if self.shift > 0 || self.fed as usize >= self.n_fft {
                let half = self.n_fft / 2;
                for i in 0..self.ch {
                    for j in 0..self.n_fft {
                        self.tmp[j] = self.ring[i][(self.ring_pos + j) % self.n_fft];
                    }
                    let out = &mut self.acc[i][col * half..(col + 1) * half];
                    self.spectrum.add_power(&self.tmp, out);
                }
                self.acc_n[col] += 1;
            }
            self.cap_i += 1;
        }
    }

    /// คอลัมน์ความถี่ที่ไม่ได้คิดเลย (เทส AUDIT ข้อ 23)
    #[cfg(test)]
    pub(crate) fn empty_cols(&self) -> usize {
        self.acc_n.iter().filter(|&&n| n == 0).count()
    }

    /// จบช่วงแบบกึ่งกลาง · คอลัมน์ท้ายที่เสียงหลังขอบขวาไม่พอ (ท้ายไฟล์) เก็บจากเสียงที่มี ไม่ปล่อยเป็นสีดำ
    pub(crate) fn finish(&mut self) {
        if self.shift > 0 {
            self.capture(true);
        }
    }

    /// รับเสียงทศนิยมช่วง ±1 · รูปคลื่น ยอด กับนับเสียงแตก ตัดที่ ±1 เหมือนเดิม · ความถี่ใช้ค่าจริง เสียงเบามากในไฟล์ 24 bit จึงไม่หาย (พี่กันสั่ง 9 พ.ย. 2569)
    pub(crate) fn push(&mut self, f: &[f32]) {
        if self.pre_left > 0 {
            self.ring_in(f);
            self.pre_left -= 1;
            return;
        }
        if self.shift > 0 && self.frame as f64 >= self.total {
            // เสียงหลังขอบขวา เติมหน้าต่างของคอลัมน์ท้ายอย่างเดียว ไม่นับในรูปคลื่น
            self.ring_in(f);
            self.frame += 1;
            self.capture(false);
            return;
        }
        let c = ((self.frame as f64 * self.cols as f64 / self.total.max(1.0)) as usize).min(self.cols - 1);
        let mut fmax = 0.0f32;
        for (i, &raw) in f.iter().enumerate().take(self.ch) {
            let raw = if raw.is_finite() { raw } else { 0.0 };
            let s = raw.clamp(-1.0, 1.0);
            let k = i * self.cols + c;
            if s > self.env_max[k] { self.env_max[k] = s; }
            if s < self.env_min[k] { self.env_min[k] = s; }
            let x = s as f64;
            self.env_sq[k] += x * x;
            self.sq[i] += x * x;
            let a = s.abs();
            if a > self.peak[i] { self.peak[i] = a; }
            if a > fmax { fmax = a; }
            if a >= CLIP_LEVEL {
                self.clip_run[i] += 1;
                if self.clip_run[i] == 3 { self.clips[i] += 1; }
            } else {
                self.clip_run[i] = 0;
            }
            self.ring[i][self.ring_pos] = raw;
        }
        self.env_n[c] += 1;
        self.ring_pos = (self.ring_pos + 1) % self.n_fft;
        self.fed += 1;
        // ช่วงเงียบ ทุกช่องเบากว่า −70 dBFS ทีละ 0.1 วินาที
        self.block_max = self.block_max.max(fmax);
        self.block_n += 1;
        if self.block_n == self.block {
            let start = self.frame + 1 - self.block as u64;
            if self.block_max < SILENCE_LEVEL {
                if self.sil_start.is_none() { self.sil_start = Some(start); }
            } else if let Some(s) = self.sil_start.take() {
                self.silences.push((s, start));
            }
            self.block_n = 0;
            self.block_max = 0.0;
        }
        self.frame += 1;
        self.capture(false);
    }

    /// รูปคลื่นต่อช่อง · ทีละคอลัมน์ 3 ค่า ยอดบน ยอดล่าง (−1 ถึง 1) และความดังเฉลี่ย RMS
    pub(crate) fn env(&self) -> Vec<Vec<f32>> {
        (0..self.ch).map(|i| {
            let mut v = Vec::with_capacity(self.cols * 3);
            for c in 0..self.cols {
                let k = i * self.cols + c;
                let n = self.env_n[c];
                if n == 0 {
                    v.extend([0.0, 0.0, 0.0]);
                } else {
                    v.push(self.env_max[k]);
                    v.push(self.env_min[k]);
                    v.push((self.env_sq[k] / n as f64).sqrt() as f32);
                }
            }
            v
        }).collect()
    }

    /// ความถี่ต่อช่อง แบบย่อเป็นเลข 0–255 (−120 ถึง 0 dB) · bins ช่องต่อคอลัมน์
    pub(crate) fn spec(&self, scale: Scale, bins: usize, chans: Option<&[usize]>) -> Vec<String> {
        let half = self.n_fft / 2;
        let nyq = self.rate as f32 / 2.0;
        let df = nyq / half as f32;
        let list: Vec<usize> = chans.map(|c| c.to_vec()).unwrap_or_else(|| (0..self.ch).collect());
        list.iter().map(|&i| {
            let mut out = vec![0u8; self.spec_cols * bins];
            for c in 0..self.spec_cols {
                let n = self.acc_n[c].max(1) as f32;
                let col = &self.acc[i][c * half..(c + 1) * half];
                for b in 0..bins {
                    let p = match scale {
                        Scale::Lin => {
                            let (lo, hi) = (b * half / bins, ((b + 1) * half / bins).max(b * half / bins + 1));
                            col[lo..hi.min(half)].iter().copied().fold(0.0f32, f32::max)
                        }
                        Scale::Log => {
                            let f0 = 20.0 * (nyq / 20.0).powf(b as f32 / bins as f32);
                            let f1 = 20.0 * (nyq / 20.0).powf((b + 1) as f32 / bins as f32);
                            let (lo, hi) = ((f0 / df).ceil() as usize, (f1 / df).floor() as usize);
                            if hi >= lo && lo < half {
                                col[lo..=hi.min(half - 1)].iter().copied().fold(0.0f32, f32::max)
                            } else {
                                col[(((f0 + f1) / 2.0) / df).round().min((half - 1) as f32) as usize]
                            }
                        }
                    };
                    out[c * bins + b] = if self.acc_n[c] == 0 { 0 } else { q8(db(p / n)) };
                }
            }
            b64(&out)
        }).collect()
    }

    /// ช่วงเงียบผิดปกติ ไม่นับ 2 วินาทีแรกกับ 2 วินาทีท้าย · ยาวอย่างน้อย 1 วินาที · หน่วยวินาทีนับจาก start
    pub(crate) fn silences(&self, start: f64) -> Vec<[f64; 2]> {
        let r = self.rate as f64;
        let mut all = self.silences.clone();
        if let Some(s) = self.sil_start { all.push((s, self.frame)); }
        all.into_iter()
            .filter(|(a, b)| (b - a) as f64 >= r && *a as f64 > 2.0 * r && (*b as f64) < self.frame as f64 - 2.0 * r)
            .map(|(a, b)| [start + a as f64 / r, start + b as f64 / r])
            .collect()
    }
}

