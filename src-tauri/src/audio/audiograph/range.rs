//! กราฟเสียง อ่านช่วงที่ซูม (window_read) กับความถี่เฉลี่ยของช่วง (psd)
//! แยกจาก audiograph/mod.rs ตามเกณฑ์ไฟล์ยาว 450 บรรทัด ตอนแก้ AUDIT ข้อ 23 107 108 · ย้ายมาทั้งก้อน
use super::*;

/// อ่านเฉพาะช่วง t0–t1 · cols คอลัมน์ · ความถี่แบบล็อก (แถบทุกช่อง) หรือเส้นตรง (แบบวิเคราะห์)
#[allow(clippy::too_many_arguments)]
/// full = ตอนบันทึกรูป อ่านความถี่ต่อเนื่องครบทุกช่วงไม่สุ่มข้าม คอลัมน์ถึง 8,192 (พี่กันเคาะ 9 พ.ย. 2569 "เอาเท่านี้")
/// ดูบนจอยังสุ่มคอลัมน์ละ 3 ครั้ง ซูมจะได้ไม่ช้าลง
#[allow(clippy::too_many_arguments)]
/// nospec = ไม่ต้องใช้ภาพความถี่ (บันทึกรูปคลื่น) ไม่จองที่เก็บความถี่ (AUDIT ข้อ 108 · เดิม 8,192 คอลัมน์ 7.1 จองราว 270 MB ทั้งที่ไม่ได้ใช้)
pub fn window_read(tools: &Path, path: &Path, track: &GTrack, t0: f64, t1: f64, cols: usize, bins: usize, log: bool, full: bool, nospec: bool, stop: &dyn Fn() -> bool) -> Result<Option<Window>, String> {
    let ch = track.names.len();
    let len = (t1 - t0).max(0.002);
    let total = (len * track.rate as f64).max(1.0);
    let n_fft = if log { 2048 } else { 1024 };
    // ซูมลึกจนตัวอย่างเสียงน้อยกว่าจำนวนคอลัมน์ ให้หนึ่งคอลัมน์เท่าหนึ่งตัวอย่าง ไม่มีคอลัมน์ว่างคั่น (หน้าจอยืดเอง · พี่กันถาม 11 พ.ย. 2569 "ซูมได้มากกว่านี้ได้มั้ย")
    let cols = cols.clamp(16, 8192).min((total.ceil() as usize).max(16));
    let spec_cols = if nospec { 0 } else if full { cols } else { cols.min(1200) };
    // ครอบทุกช่วงเมื่อคอลัมน์ยาวกว่าหน้าต่าง FFT · เพดาน 64 กันไฟล์ยาวหลายชั่วโมงกินเวลาเกิน
    let per_col = if full { ((total / spec_cols as f64 / n_fft as f64).ceil() as usize).clamp(3, 64) } else { 3 };
    // อ่านเสียงก่อนขอบซ้ายหนึ่งหน้าต่างกับหลังขอบขวาครึ่งหน้าต่าง หน้าต่าง FFT อยู่กึ่งกลางคอลัมน์ (AUDIT ข้อ 23)
    let rate = track.rate as f64;
    let start = (t0.max(0.0) - n_fft as f64 / rate).max(0.0);
    let pre = ((t0.max(0.0) - start) * rate).round() as u64;
    let post = (n_fft / 2) as f64 / rate;
    let mut an = Analyzer::new(ch, track.rate, total, cols, n_fft, spec_cols, per_col).centered(pre);
    let mut feed = |f: &[f32]| an.push(f);
    let Some(_) = decode(tools, path, track.index, ch, Some(start), Some(len + (t0.max(0.0) - start) + post), false, &mut feed, stop)? else { return Ok(None) };
    an.finish();
    Ok(Some(Window { t0, t1, cols, env: an.env(), bins, spec: an.spec(if log { Scale::Log } else { Scale::Lin }, bins, None) }))
}

/// ความถี่เฉลี่ยของช่วง · series = ชุดของช่องที่เอามารวมกันต่อเส้น · size ขนาด FFT
/// ms = คู่ช่องซ้ายขวา ได้เส้นเพิ่มท้าย 2 เส้น กลาง (ซ้าย+ขวา)÷2 กับ ข้าง (ซ้าย−ขวา)÷2 รวมเสียงก่อนคิด ไม่ใช่เฉลี่ยกำลัง
/// (พี่กันส่งภาพ SpectrumAnalyzer 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
#[allow(clippy::too_many_arguments)]
pub fn psd(tools: &Path, path: &Path, track: &GTrack, t0: f64, t1: f64, series: &[Vec<usize>], ms: Option<[usize; 2]>, size: usize, stop: &dyn Fn() -> bool) -> Result<Option<Psd>, String> {
    let ch = track.names.len();
    let size = size.clamp(256, 65536).next_power_of_two();
    let len = (t1 - t0).max(0.05);
    let total_frames = (len * track.rate as f64) as u64;
    let hop = size / 2;
    // ช่วงยาวมาก คิดแค่ราว 3,000 ครั้ง กระจายเท่า ๆ กัน
    let hops = (total_frames / hop as u64).max(1);
    let every = (hops / 3000).max(1);
    let mut ring = vec![vec![0.0f32; size]; ch];
    let mut pos = 0usize;
    let mut frame = 0u64;
    let mut sp = Spectrum::new(size);
    let mut tmp = vec![0.0f32; size];
    let mut one = vec![0.0f32; size / 2];
    let ms = ms.filter(|[a, b]| *a < ch && *b < ch && a != b);
    let mut acc = vec![vec![0.0f32; size / 2]; series.len() + if ms.is_some() { 2 } else { 0 }];
    let mut count = 0u32;
    let mut hop_i = 0u64;
    // หนึ่งรอบ FFT ของทุกเส้นจากเสียงในวงแหวน · ใช้ทั้งระหว่างอ่านและรอบเติมศูนย์ตอนช่วงสั้น
    let step = |ring: &[Vec<f32>], pos: usize, sp: &mut Spectrum, tmp: &mut [f32], one: &mut [f32], acc: &mut [Vec<f32>]| {
        for (si, chans) in series.iter().enumerate() {
            for &c in chans {
                if c >= ch { continue; }
                for j in 0..size { tmp[j] = ring[c][(pos + j) % size]; }
                one.iter_mut().for_each(|v| *v = 0.0);
                sp.add_power(tmp, one);
                let w = 1.0 / chans.len() as f32;
                for (a, o) in acc[si].iter_mut().zip(one.iter()) { *a += o * w; }
            }
        }
        if let Some([a, b]) = ms {
            for (k, sign) in [(0usize, 1.0f32), (1, -1.0)] {
                for j in 0..size { let i = (pos + j) % size; tmp[j] = (ring[a][i] + sign * ring[b][i]) * 0.5; }
                one.iter_mut().for_each(|v| *v = 0.0);
                sp.add_power(tmp, one);
                for (x, o) in acc[series.len() + k].iter_mut().zip(one.iter()) { *x += o; }
            }
        }
    };
    let mut feed = |f: &[f32]| {
        for i in 0..ch { ring[i][pos] = if f[i].is_finite() { f[i] } else { 0.0 }; }
        pos = (pos + 1) % size;
        frame += 1;
        if frame as usize >= size && frame % hop as u64 == 0 {
            if hop_i % every == 0 {
                step(&ring, pos, &mut sp, &mut tmp, &mut one, &mut acc);
                count += 1;
            }
            hop_i += 1;
        }
    };
    let Some(_) = decode(tools, path, track.index, ch, Some(t0.max(0.0)), Some(len), false, &mut feed, stop)? else { return Ok(None) };
    // ช่วงสั้นกว่าขนาด FFT ยังไม่ได้คิดสักครั้ง คิดหนึ่งครั้งจากเสียงที่มี ส่วนที่ขาดเป็นศูนย์ และบอกหน้าจอว่าสั้นเกิน
    // (AUDIT ข้อ 107 · เดิมได้ −140 dB ทุกช่อง กราฟแบนติดพื้น กล่องตรวจบอกว่าไม่พบอะไรน่าสงสัย)
    let short = count == 0 && frame > 0;
    if short {
        step(&ring, pos, &mut sp, &mut tmp, &mut one, &mut acc);
        count = 1;
    }
    let n = count.max(1) as f32;
    Ok(Some(Psd { size, rate: track.rate, short, need: size as f64 / track.rate as f64, db: acc.iter().map(|a| a.iter().map(|&p| (db(p / n) * 10.0).round() / 10.0).collect()).collect() }))
}
