//! เทสของ audiograph.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::path::PathBuf;

#[test]
fn exist_list_keeps_order_and_marks_missing() {
    let here = concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml").to_string();
    let lost = concat!(env!("CARGO_MANIFEST_DIR"), "/ไม่มีไฟล์นี้.mkv").to_string();
    assert_eq!(exist_list(&[here.clone(), lost.clone(), here]), vec![true, false, true]);
    assert!(exist_list(&[]).is_empty());
}


fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }
fn media(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}

#[test]
fn fft_finds_a_sine_at_full_scale() {
    // คลื่นไซน์เต็มสเกลที่ช่องความถี่ 64 ของ FFT 1024 ต้องได้ราว 0 dB ที่ช่องนั้น ช่องอื่นต่ำกว่ามาก
    let n = 1024;
    let x: Vec<f32> = (0..n).map(|i| (2.0 * std::f32::consts::PI * 64.0 * i as f32 / n as f32).sin()).collect();
    let mut sp = Spectrum::new(n);
    let mut out = vec![0.0f32; n / 2];
    sp.add_power(&x, &mut out);
    assert!((db(out[64]) - 0.0).abs() < 0.5, "ช่อง 64 ได้ {}", db(out[64]));
    assert!(db(out[200]) < -80.0, "ช่อง 200 ได้ {}", db(out[200]));
}

#[test]
fn channel_names_follow_ffmpeg_order() {
    assert_eq!(layout_names("5.1(side)", 6), ["FL", "FR", "FC", "LFE", "SL", "SR"]);
    assert_eq!(layout_names("7.1", 8), ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"]);
    assert_eq!(layout_names("stereo", 2), ["FL", "FR"]);
    assert_eq!(layout_names("", 1), ["FC"]);
    assert_eq!(layout_names("weird", 3), ["CH1", "CH2", "CH3"]);
}

#[test]
fn base64_matches_known_values() {
    assert_eq!(b64(b"Man"), "TWFu");
    assert_eq!(b64(b"Ma"), "TWE=");
    assert_eq!(b64(b"M"), "TQ==");
    assert_eq!(unb64("TWFu").unwrap(), b"Man");
    assert_eq!(unb64("TWE=").unwrap(), b"Ma");
    assert_eq!(unb64("TQ==").unwrap(), b"M");
}

#[test]
fn save_never_overwrites() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังบันทึก-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let p = dir.join("กราฟ.csv");
    let a = graph_save(p.display().to_string(), None, Some("Hz,dB".into()), None).unwrap();
    let b = graph_save(p.display().to_string(), None, Some("Hz,dB".into()), None).unwrap();
    let png = graph_save(dir.join("รูป.png").display().to_string(), Some("data:image/png;base64,TWFu".into()), None, None).unwrap();
    assert!(a.ends_with("กราฟ.csv") && b.ends_with("กราฟ (2).csv"), "{a} · {b}");
    assert_eq!(std::fs::read(&png).unwrap(), b"Man");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn reads_tracks_and_overview_of_test_movie() {
    let Some(f) = media("ดาวเหนือ (2023).mkv") else { return };
    let g = info(&tools(), &f).unwrap();
    assert_eq!(g.tracks.len(), 2, "{:?}", g.tracks);
    assert!(!g.audio_only);
    let t51 = g.tracks.iter().find(|t| t.names.len() == 6).expect("ต้องมีแทร็ก 5.1");
    assert_eq!(t51.layout, "5.1");
    let o = overview(&tools(), &f, t51, g.duration, &|_| {}, &|| false).unwrap().unwrap();
    assert_eq!(o.env.len(), 6);
    assert_eq!(o.env[0].len(), o.cols * 3);
    assert!((o.read_to - g.duration).abs() < 0.5, "อ่านได้ถึง {} ความยาว {}", o.read_to, g.duration);
    assert!(o.integrated.is_some(), "ต้องได้ความดังรวมจากตัววัดในโปรแกรม");
    assert!(o.peaks.iter().all(|p| *p <= 0.0));
    assert_eq!(o.spec.len(), 6);
    // ไฟล์มีเสียงโทนตลอดเรื่อง เส้นความดังต้องต่อเนื่อง ไม่มีคอลัมน์ตกลง −70 (ไฟล์ 20 วินาที คอลัมน์แคบกว่ารอบค่าของ ebur128)
    let mid = &o.loud[o.cols / 10..o.cols * 9 / 10];
    assert!(mid.iter().all(|v| *v > -40.0), "เส้นความดังมีรู ต่ำสุด {:?}", mid.iter().cloned().fold(f32::MAX, f32::min));
}

/// ตัววัดความดังในโปรแกรม (loudness.rs) ได้ค่าเท่าตัววัด ebur128 ของ ffmpeg ที่ใช้เดิม (BUGS ข้อ 145)
/// ไฟล์ทดสอบ AC-3 5.1 และไฟล์จริงผ่านตัวแปร MOVIE_SHELF_LOUD_FILE (อ่าน 5 นาทีแรก อ่านอย่างเดียว)
#[test]
fn loudness_matches_ffmpeg() {
    let check = |f: &Path, len: Option<f64>| {
        let g = info(&tools(), f).unwrap();
        for t in &g.tracks {
            let ch = t.names.len();
            let mut r = crate::audio::loudness::R128::new(&t.names, t.rate);
            let ff = decode(&tools(), f, t.index, ch, None, len, true, &mut |fr| r.push(fr), &|| false).unwrap().unwrap();
            let (m, i, lra, tp) = r.finish();
            let (fi, fl, ft) = (ff.integrated.unwrap(), ff.lra.unwrap(), ff.true_peak.unwrap());
            let (i, lra, tp) = (i.unwrap(), lra.unwrap(), tp.unwrap());
            eprintln!("{} แทร็ก {} integrated {i:.2}/{fi:.2} LRA {lra:.2}/{fl:.2} TP {tp:.2}/{ft:.2}", f.display(), t.index);
            assert!((i - fi).abs() <= 0.2, "integrated ของเรา {i:.2} ffmpeg {fi:.2}");
            assert!((lra - fl).abs() <= 1.0, "LRA ของเรา {lra:.2} ffmpeg {fl:.2}");
            assert!((tp - ft).abs() <= 0.3, "true peak ของเรา {tp:.2} ffmpeg {ft:.2}");
            // Momentary เทียบตามเวลา ช่วงที่ไม่เงียบ
            let mut worst = 0.0f64;
            for &(t_ff, v_ff) in ff.loud.iter().filter(|x| x.1 > -50.0) {
                if let Some(&(_, v)) = m.iter().min_by(|a, b| (a.0 - t_ff).abs().partial_cmp(&(b.0 - t_ff).abs()).unwrap()) {
                    worst = worst.max((v - v_ff).abs());
                }
            }
            assert!(worst <= 0.5, "momentary ต่างกันมากสุด {worst:.2} LU");
        }
    };
    if let Some(f) = media("ดาวเหนือ (2023).mkv") { check(&f, None); }
    if let Ok(p) = std::env::var("MOVIE_SHELF_LOUD_FILE") { check(Path::new(&p), Some(300.0)); }
}

#[test]
fn finds_silence_in_the_middle() {
    // สร้างเสียงไซน์ 8 วินาที เงียบวินาที 3 ถึง 5 แล้วต้องเจอช่วงเงียบตรงนั้น (2 วินาทีแรกกับท้ายไม่นับ)
    let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("เงียบกลาง.wav");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", [
        "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=8",
        "-af", "volume='if(between(t,3,5),0,1)':eval=frame", f.to_str().unwrap(),
    ]).unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    let g = info(&tools(), &f).unwrap();
    assert!(g.audio_only);
    let o = overview(&tools(), &f, &g.tracks[0], g.duration, &|_| {}, &|| false).unwrap().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(o.silences.len(), 1, "{:?}", o.silences);
    assert!((o.silences[0][0] - 3.0).abs() < 0.2 && (o.silences[0][1] - 5.0).abs() < 0.2, "{:?}", o.silences);
}

#[test]
fn psd_shows_a_peak_at_the_tone() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ2-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("ไซน์1000.flac");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let g = info(&tools(), &f).unwrap();
    let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    let df = 48000.0 / 4096.0;
    let (imax, _) = p.db[0].iter().enumerate().fold((0, -999.0f32), |m, (i, &v)| if v > m.1 { (i, v) } else { m });
    assert!(((imax as f64 * df) - 1000.0).abs() < df * 1.5, "ยอดอยู่ที่ {} Hz", imax as f64 * df);
}

/// ไฟล์ 24 bit เสียงเบามาก −110 dB ต้องเห็นยอดที่ความถี่นั้น · ตอนอ่าน 16 bit ค่านี้ถูกปัดเป็นศูนย์จนหาย
#[test]
fn quiet_24bit_tone_is_not_lost() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ24-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("เบามาก.flac");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "aevalsrc=3.16e-6*sin(2*PI*1000*t):s=48000:d=3", "-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let g = info(&tools(), &f).unwrap();
    let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
    let o = overview(&tools(), &f, &g.tracks[0], g.duration, &|_| {}, &|| false).unwrap().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    let df = 48000.0 / 4096.0;
    let (imax, vmax) = p.db[0].iter().enumerate().fold((0, -999.0f32), |m, (i, &v)| if v > m.1 { (i, v) } else { m });
    assert!(((imax as f64 * df) - 1000.0).abs() < df * 1.5, "ยอดอยู่ที่ {} Hz", imax as f64 * df);
    assert!(vmax > -135.0, "ยอด {vmax} dB");
    assert!(o.peaks[0] > -115.0 && o.peaks[0] < -105.0, "ยอดรวม {:?}", o.peaks);
}

/// เก็บผลลงเครื่องแล้วอ่านกลับได้ตรง · ชื่อไม่ตรง (ไฟล์เปลี่ยน) ไม่ใช้ผลเก่า · รวมเกินขนาด ลบอันเก่าสุดก่อน
#[test]
fn overview_disk_cache_roundtrip_and_prune() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังแคช-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let o = Overview { duration: 12.5, cols: 2, env: vec![vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6]], spec_cols: 0, spec_bins: 0, spec: vec!["ab".into()], loud: vec![-20.0, -21.0],
        integrated: Some(-14.2), lra: None, true_peak: Some(-0.3), peaks: vec![-0.3], rms: vec![-18.0], clips: vec![0], silences: vec![[1.0, 2.0]], read_to: 12.5 };
    disk_save(&dir, "ก|0|100|1", &o, CACHE_LIMIT);
    let back = disk_load(&dir, "ก|0|100|1").expect("ต้องอ่านกลับได้");
    assert_eq!(serde_json::to_string(&back).unwrap(), serde_json::to_string(&o).unwrap());
    assert!(disk_load(&dir, "ก|0|100|2").is_none(), "เวลาแก้ไฟล์เปลี่ยน ต้องไม่ใช้ผลเก่า");
    std::thread::sleep(Duration::from_millis(20));
    disk_save(&dir, "ข|0|100|1", &o, CACHE_LIMIT);
    let one = std::fs::metadata(cache_file(&dir, "ข|0|100|1")).unwrap().len();
    // จำกัดให้เหลือได้ไฟล์เดียว อันเก่า (ก) ต้องถูกลบ อันใหม่ (ข) อยู่
    prune(&dir, one);
    assert!(disk_load(&dir, "ก|0|100|1").is_none() && disk_load(&dir, "ข|0|100|1").is_some());
    assert_eq!(cache_info_in(&dir).files, 1);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ซ้ายขวาเสียงเดียวกันเป๊ะ เส้นกลางมียอดที่ 1000 Hz เส้นข้าง (ซ้าย−ขวา) ต้องเงียบ · ได้ 4 เส้น ซ้าย ขวา กลาง ข้าง
#[test]
fn psd_mid_side_of_identical_channels() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟ3-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("ไซน์สองข้างเท่ากัน.flac");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", "-ac", "2", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let g = info(&tools(), &f).unwrap();
    let p = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0], vec![1]], Some([0, 1]), 4096, &|| false).unwrap().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(p.db.len(), 4);
    let top = |d: &Vec<f32>| d.iter().cloned().fold(-999.0f32, f32::max);
    let (l, mid, side) = (top(&p.db[0]), top(&p.db[2]), top(&p.db[3]));
    assert!((mid - l).abs() < 1.0, "กลาง {mid} ต้องเท่าซ้าย {l}");
    assert!(side < mid - 60.0, "ข้าง {side} ต้องเบากว่ากลาง {mid} เกิน 60 dB");
}

/// AUDIT ข้อ 110 · ภาพรวมในหน่วยความจำจำไม่เกิน MEM_LIMIT ไฟล์ ทิ้งอันที่ไม่ได้ใช้นานที่สุดก่อน
#[test]
fn mem_cache_keeps_recent_only() {
    let ov = |d: f64| Arc::new(Overview { duration: d, cols: 0, env: vec![], spec_cols: 0, spec_bins: 0, spec: vec![], loud: vec![], integrated: None, lra: None, true_peak: None, peaks: vec![], rms: vec![], clips: vec![], silences: vec![], read_to: d });
    let mut c = MemCache::default();
    for i in 0..MEM_LIMIT { c.insert(format!("k{i}"), ov(i as f64)); }
    // ใช้ k0 ล่าสุด แล้วใส่ไฟล์ใหม่ ต้องทิ้ง k1 ไม่ใช่ k0
    assert!(c.get("k0").is_some());
    c.insert("ใหม่".into(), ov(99.0));
    assert_eq!(c.len(), MEM_LIMIT);
    assert!(c.get("k0").is_some() && c.get("k1").is_none() && c.get("ใหม่").is_some());
    // ใส่ซ้ำคีย์เดิมไม่นับเพิ่ม
    c.insert("ใหม่".into(), ov(100.0));
    assert_eq!((c.len(), c.get("ใหม่").unwrap().duration), (MEM_LIMIT, 100.0));
    c.clear();
    assert_eq!(c.len(), 0);
}

/// AUDIT ข้อ 23 · ช่วงซูม 0.01 วินาทีที่ 48 kHz (480 ตัวอย่าง) สั้นกว่าหน้าต่าง 1024 · แบบเดิมไม่ได้คิดสักคอลัมน์ (ดำทั้งกราฟ)
/// แบบกึ่งกลางป้อนเสียงก่อนขอบซ้ายหนึ่งหน้าต่างกับหลังขอบขวาครึ่งหน้าต่าง ต้องได้ทุกคอลัมน์ · ยอดอยู่ที่ความถี่ของเสียง
#[test]
fn deep_zoom_spectrum_has_no_empty_columns() {
    let (rate, n_fft, total) = (48000u32, 1024usize, 480usize);
    let tone = |i: usize| (2.0 * std::f32::consts::PI * 3000.0 * i as f32 / rate as f32).sin() * 0.5;
    // แบบเดิม เริ่มที่ขอบซ้ายพอดี
    let mut old = Analyzer::new(1, rate, total as f64, 64, n_fft, 64, 3);
    for i in 0..total { old.push(&[tone(i)]); }
    assert_eq!(old.empty_cols(), 64, "แบบเดิมช่วงสั้นกว่าหน้าต่างไม่ได้คิดเลย");
    // แบบกึ่งกลาง
    let mut an = Analyzer::new(1, rate, total as f64, 64, n_fft, 64, 3).centered(n_fft as u64);
    for i in 0..n_fft + total + n_fft / 2 { an.push(&[tone(i)]); }
    an.finish();
    assert_eq!(an.empty_cols(), 0);
    let env = an.env();
    assert_eq!(env[0].len(), 64 * 3, "รูปคลื่นนับเฉพาะเสียงในช่วง");
    // ท้ายไฟล์ เสียงหลังขอบขวาไม่มา คอลัมน์ท้ายยังได้คิด
    let mut end = Analyzer::new(1, rate, total as f64, 64, n_fft, 64, 3).centered(n_fft as u64);
    for i in 0..n_fft + total { end.push(&[tone(i)]); }
    end.finish();
    assert_eq!(end.empty_cols(), 0);
}

/// AUDIT ข้อ 107 · ความถี่เฉลี่ยช่วง 0.05 วินาทีกับ FFT 4096 สั้นกว่าหน้าต่าง ต้องได้เส้นจริงพร้อมป้ายช่วงสั้น ไม่ใช่ −140 dB ทุกช่อง
#[test]
fn psd_short_range_is_flagged_not_flat() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังกราฟสั้น-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("ไซน์สั้น.flac");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let g = info(&tools(), &f).unwrap();
    let p = psd(&tools(), &f, &g.tracks[0], 1.0, 1.05, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
    let long = psd(&tools(), &f, &g.tracks[0], 0.5, 2.5, &[vec![0]], None, 4096, &|| false).unwrap().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    assert!(p.short && !long.short);
    assert!((p.need - 4096.0 / 48000.0).abs() < 1e-9);
    let top = p.db[0].iter().copied().fold(-999.0f32, f32::max);
    assert!(top > -60.0, "ช่วงสั้นต้องมีเส้นจริง ยอด {top} dB");
}

/// AUDIT ข้อ 108 · บันทึกรูปคลื่นไม่ต้องใช้ภาพความถี่ ไม่จองที่เก็บ ภาพความถี่ว่าง รูปคลื่นครบ
#[test]
fn nospec_window_skips_spectrum() {
    let mut an = Analyzer::new(2, 48000, 4800.0, 100, 2048, 0, 3).centered(0);
    for i in 0..4800 { let v = (i as f32 * 0.01).sin(); an.push(&[v, -v]); }
    an.finish();
    let spec = an.spec(Scale::Log, 64, None);
    assert!(spec.iter().all(|s| s.is_empty()), "ไม่มีคอลัมน์ความถี่");
    assert_eq!(an.env()[0].len(), 100 * 3);
}

/// AUDIT ข้อ 112 · ผ่านกล่องเลือกที่บันทึกแล้ว เขียนทับตามชื่อที่เลือก · ไม่ผ่านกล่อง ชื่อชนต่อท้าย (2) ไม่เขียนทับ · ไม่เหลือไฟล์ชั่วคราว
#[test]
fn write_out_replaces_only_when_confirmed() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังบันทึกทับ-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("กราฟ.png");
    std::fs::write(&f, b"old").unwrap();
    let a = write_out(&f, b"new", true).unwrap();
    assert_eq!((PathBuf::from(&a), std::fs::read(&f).unwrap()), (f.clone(), b"new".to_vec()));
    let b = write_out(&f, b"third", false).unwrap();
    assert_eq!(PathBuf::from(&b), dir.join("กราฟ (2).png"));
    assert_eq!(std::fs::read(&f).unwrap(), b"new", "ไม่ผ่านกล่องต้องไม่เขียนทับ");
    let left: Vec<_> = std::fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| n.contains(".tmp-")).collect();
    assert!(left.is_empty(), "ไฟล์ชั่วคราวค้าง {left:?}");
    std::fs::remove_dir_all(&dir).unwrap();
}
