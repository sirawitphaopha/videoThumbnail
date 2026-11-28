//! เทสของ subaudio.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

/// หนังทดสอบมีโทน 440 Hz เฉพาะช่วงที่มีบรรทัดซับ (0.5 ถึง 3.4 วินาที) ช่วงอื่นเงียบ
#[test]
fn pcm_is_stereo_48k_and_follows_the_tone() {
    if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return; }
    let m = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join("ฉากตัด (2025).mkv");
    assert!(m.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
    let loud = pcm(&tools(), &m, "0:1", 1.0, 1.0, None).unwrap();
    assert_eq!(loud.len(), 48_000 * 2 * 2, "หนึ่งวินาที สองช่อง ช่องละ 2 ไบต์");
    let peak = |b: &[u8]| b.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0);
    assert!(peak(&loud) > 8000, "ช่วงมีโทนต้องดัง {}", peak(&loud));
    let quiet = pcm(&tools(), &m, "0:1", 3.6, 0.3, None).unwrap();
    assert!(peak(&quiet) < 200, "ช่วงไม่มีบรรทัดต้องเงียบ {}", peak(&quiet));
    // คลื่นเสียงได้คอลัมน์พอดี ช่วงมีโทนดัง ช่วงเงียบเกือบศูนย์ · ขอก่อนเวลา 0 ส่วนนั้นเป็นศูนย์
    let w = peaks(&tools(), &m, "0:1", 0.0, 4.0, 400, None).unwrap();
    assert_eq!(w.len(), 400);
    assert!(w[100] > 0.3 && w[10] < 0.01 && w[380] < 0.01, "{} {} {}", w[100], w[10], w[380]);
    let neg = peaks(&tools(), &m, "0:1", -1.0, 1.0, 200, None).unwrap();
    assert!(neg[..100].iter().all(|&v| v == 0.0) && neg[160] > 0.3, "{} {}", neg[50], neg[160]);
    assert!(map_ok("0:1").is_ok() && map_ok("0:a:0").is_ok() && map_ok("0:a:x").is_err() && map_ok("-i x").is_err());
    // ขอเลยท้ายไฟล์ ได้เท่าที่มี ไม่ผิดพลาด
    let tail = pcm(&tools(), &m, "0:a:0", 19.5, 2.0, None).unwrap();
    assert!(tail.len() <= 48_000 * 2 * 2 / 2 + 4096, "{}", tail.len());
}

#[test]
fn place_follows_first_video_frame() {
    // ไม่มีเวลาเฟรมแรก นับจากต้นไฟล์ · เวลาติดลบเติมเงียบ
    assert_eq!(place(None, 0.0, 0.0, 2.0), (2.0, 0.0));
    assert_eq!(place(None, 0.0, 0.0, -0.5), (0.0, 0.5));
    // ภาพเริ่มช้ากว่าเสียง 0.3 วินาที เวลา 0.6 ของภาพคือเสียงที่ 0.9
    let (ss, lead) = place(Some(0.3), 0.0, 0.0, 0.6);
    assert!((ss - 0.9).abs() < 1e-9 && lead == 0.0);
    // เสียงเริ่มช้ากว่าภาพ 0.5 วินาที ช่วงแรกของภาพยังไม่มีเสียง เติมเงียบ
    let (ss, lead) = place(Some(1.0), 1.0, 1.5, 0.2);
    assert!((ss - 0.5).abs() < 1e-9 && (lead - 0.3).abs() < 1e-9, "{ss} {lead}");
}

/// BUGS ข้อ 115 ไฟล์ที่ภาพเริ่มช้ากว่าเสียง 0.3 วินาที (แบบไฟล์อัดทีวี) เสียงบี๊บอยู่ที่ 1.0 วินาทีของไฟล์ = 0.7 วินาทีของภาพ
/// ส่งเวลาเฟรมแรกของภาพ เสียงช่วง 0.6 ถึง 0.9 ของภาพต้องได้ยินบี๊บ · ไม่ส่ง (แบบเดิม) ได้ช่วง 0.6 ถึง 0.9 ของไฟล์ซึ่งเงียบ
#[test]
fn pcm_peaks_shift_to_first_video_frame() {
    let dir = std::env::temp_dir().join(format!("movie-shelf-zero-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let m = dir.join("late-video.mkv");
    let args: Vec<std::ffi::OsString> = ["-v", "error", "-itsoffset", "0.3", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=25:d=3", "-f", "lavfi", "-i", "aevalsrc=if(between(t\\,1\\,1.2)\\,0.8*sin(2*PI*1000*t)\\,0):s=48000:d=3",
        "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-c:a", "flac"].iter().map(std::ffi::OsString::from).chain([m.as_os_str().to_owned()]).collect();
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", &args).unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let (s, a) = starts(&tools(), &m, "0:1").expect("อ่านเวลาเริ่มได้");
    assert!(s.abs() < 0.05 && a.abs() < 0.05, "ไฟล์กับเสียงเริ่มที่ 0 {s} {a}");
    let peak = |b: &[u8]| b.chunks_exact(2).map(|c| i16::from_le_bytes([c[0], c[1]]).unsigned_abs()).max().unwrap_or(0);
    let with = pcm(&tools(), &m, "0:1", 0.6, 0.3, Some(0.3)).unwrap();
    let without = pcm(&tools(), &m, "0:1", 0.6, 0.3, None).unwrap();
    assert!(peak(&with[48_000 * 4 / 10 * 2..]) > 8000, "เลื่อนตามภาพแล้วได้ยินบี๊บที่ 0.7 ของภาพ {}", peak(&with));
    assert!(peak(&without) < 200, "แบบเดิมนับจากต้นไฟล์ ช่วงนี้เงียบ {}", peak(&without));
    // คลื่นเสียง 0 ถึง 1.5 วินาทีของภาพ 150 คอลัมน์ บี๊บอยู่คอลัมน์ 70 ถึง 89
    let w = peaks(&tools(), &m, "0:1", 0.0, 1.5, 150, Some(0.3)).unwrap();
    assert!(w[75] > 0.3 && w[60] < 0.01 && w[95] < 0.01, "{} {} {}", w[60], w[75], w[95]);
    // ก่อนเฟรมแรกของภาพยังมีเสียงของไฟล์ (0.3 วินาทีแรก) เวลาติดลบของภาพจึงอ่านได้ ไม่เติมเงียบ
    let pre = pcm(&tools(), &m, "0:1", -0.2, 0.2, Some(0.3)).unwrap();
    assert_eq!(pre.len(), (0.2 * 48_000.0) as usize * 4);
    let _ = std::fs::remove_dir_all(&dir);
}

/// BUGS ข้อ 163.4 · เสียงสำหรับเล่นในหน้ากราฟได้ครบทุกช่องตามที่ขอ ไม่รวมเป็นสองช่อง
#[test]
fn pcm_ch_keeps_every_channel() {
    // ช่วงก่อนเวลา 0 ทั้งก้อนเป็นเงียบ ไม่ต้องเรียก ffmpeg · ความยาวต้องคิดตามจำนวนช่อง
    let any = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
    let six = pcm_ch(&tools(), &any, "0:a:0", -1.0, 0.5, None, 6).unwrap();
    assert_eq!(six.len(), 24_000 * 2 * 6, "ครึ่งวินาที หกช่อง ช่องละ 2 ไบต์");
    assert!(six.iter().all(|b| *b == 0));
    // ขอเกินแปดช่องได้แปดช่อง
    assert_eq!(pcm_ch(&tools(), &any, "0:a:0", -1.0, 0.5, None, 12).unwrap().len(), 24_000 * 2 * 8);
    if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return; }
    let m = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join("ฉากตัด (2025).mkv");
    assert!(m.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
    let one = pcm_ch(&tools(), &m, "0:1", 1.0, 1.0, None, 1).unwrap();
    assert_eq!(one.len(), 48_000 * 2, "หนึ่งวินาที ช่องเดียว");
}
