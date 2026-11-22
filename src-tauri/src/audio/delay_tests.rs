//! เทสของ delay.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn av(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}

/// cross-correlation หาตำแหน่งได้ละเอียดกว่าหนึ่งตัวอย่าง · เสียงซ่าที่เลื่อน 37 ตัวอย่าง
#[test]
fn xcorr_finds_shift() {
    let mut x = 12345u32;
    let noise: Vec<f32> = (0..20000).map(|_| { x ^= x << 13; x ^= x >> 17; x ^= x << 5; (x as f32 / u32::MAX as f32) - 0.5 }).collect();
    let a = noise[5037..13037].to_vec();
    let (k, s) = xcorr(&a, &noise[..]).unwrap();
    assert!((k - 5037.0).abs() < 0.6 && s > 0.99, "ได้ {k} คะแนน {s}");
    assert!(xcorr(&a[..10], &noise).is_none());
}

#[test]
fn spots_and_args() {
    let (ps, win) = spots(60.0);
    assert_eq!(win, 12.0);
    assert!(ps[0] >= MARGIN && ps[2] + win + MARGIN <= 60.0 && ps[0] < ps[1] && ps[1] < ps[2], "{ps:?}");
    let (ps2, win2) = spots(7200.0);
    assert_eq!(win2, 15.0);
    assert!((ps2[0] - 576.0).abs() < 1e-9 && ps2[2] < 7200.0 * 0.9, "{ps2:?}");
    let a = preview_args(Path::new("D:\\หนัง\\ดาวตก (2024).mkv"), Path::new("D:\\พากย์ไทย.ac3"), 0, -120.0, 24.0, 20.0, Path::new("C:\\tmp\\p.mkv"));
    let s = a.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>().join(" ");
    assert!(s.contains("--split parts:00:00:24.000-00:00:44.000") && s.contains("-A -S -B -M") && s.contains("--sync 0:-120 --default-track-flag 0:1 D:\\พากย์ไทย.ac3"), "{s}");
}

/// พากย์ไทยที่เลื่อนจริง 120 ms (ชื่อไฟล์ DELAY -120ms) หาได้ −120 ±10 ms สามช่วงเท่ากัน ไม่ต้องตั้งความเร็ว
/// เสียง PAL 25 fps เทียบตรง ๆ ไม่ติด ลองยืดแล้วได้คู่ 25 → 23.976
#[test]
fn finds_real_delay_and_speed() {
    let Some(movie) = av("ดาวตก (2024).mkv") else { return };
    let th = av("ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap();
    let f = find(&tools(), &movie, 1, &th, 0).unwrap();
    assert!((f.delay + 120.0).abs() <= 10.0 && f.speed.is_none() && !f.uneven && f.score > 0.5, "{f:?}");
    assert!(f.windows.iter().all(|w| (w.delay + 120.0).abs() <= 10.0), "{f:?}");
    let pal = av("ดาวตก (2024) PAL 25fps.ac3").unwrap();
    let g = find(&tools(), &movie, 1, &pal, 0).unwrap();
    assert_eq!(g.speed, Some([25.0, 23.976]), "{g:?}");
    assert!(g.score > 0.4 && g.direct < g.score - 0.2 && g.delay.abs() <= 30.0, "{g:?}");
    // คลื่นเสียงไว้วาด
    let v = view(&tools(), &movie, 1, &th, 0, 24.0, 12.0, 1.0, None, 600).unwrap();
    assert!(v.a.len() >= 590 && v.a.len() <= 610 && (v.b.len() as f64 - v.a.len() as f64 * 14.0 / 12.0).abs() < 4.0, "{} {}", v.a.len(), v.b.len());
    assert!(v.a.iter().any(|&x| x > 0.99) && v.b.iter().all(|&x| (0.0..=1.0).contains(&x)));
}
