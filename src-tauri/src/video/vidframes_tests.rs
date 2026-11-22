//! เทสของ vidframes.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn ycbcr_header_best_practice_like_aegisub() {
    assert_eq!(ycbcr_header("bt709", "tv"), "TV.709");
    assert_eq!(ycbcr_header("bt709", "pc"), "PC.709");
    assert_eq!(ycbcr_header("smpte170m", "tv"), "TV.601");
    assert_eq!(ycbcr_header("bt470bg", "tv"), "TV.601");
    // ไม่รู้ช่วงสี หรือชนิดสีอื่น (FCC 240M BT.2020) ได้ None แบบ to_best_practice
    assert_eq!(ycbcr_header("bt709", ""), "None");
    assert_eq!(ycbcr_header("fcc", "tv"), "None");
    assert_eq!(ycbcr_header("bt2020nc", "tv"), "None");
    assert_eq!(ycbcr_header("", "unknown"), "None");
}

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

fn media(name: &str) -> Option<PathBuf> {
    if std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok() { return None; }
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("แก้ซับ").join(name);
    assert!(p.exists(), "ไม่มีไฟล์ทดสอบ {} · รัน node scripts/make-test-media.mjs ก่อน (หรือตั้ง MOVIE_SHELF_SKIP_MEDIA=1)", p.display());
    Some(p)
}

/// เวลาที่หน้าจอใช้สั่งดึงภาพ (src/lib/vidFrames.ts seekOf ต้องคิดแบบเดียวกัน)
fn seek_of(t: &VidTable, n: usize) -> f64 {
    (t.times[n] as i64 + t.base) as f64 / 1000.0 - t.start - 0.0005
}

/// ค่าความสว่างกลางกล่องของแต่ละภาพ (หนังทดสอบกล่องกลางสว่างเท่า เลขเฟรม × 8 หาร 256 เหลือเศษ)
fn box_lumas(movie: &Path, ss: f64, count: u32) -> Vec<u8> {
    let mut args = seek_args(movie, ss, count);
    args.extend(["-f".into(), "rawvideo".into(), "-pix_fmt".into(), "yuv420p".into(), "-".into()]);
    let o = run_tool_timeout(&tools(), "ffmpeg", &args, Duration::from_secs(60)).unwrap();
    let fsz = 640 * 360 * 3 / 2;
    o.stdout.chunks(fsz).filter(|c| c.len() == fsz).map(|c| c[180 * 640 + 320]).collect()
}

/// เลขเฟรมในช่วง 0 ถึง 31 จากค่าสี (เฟรมที่ห่างกัน 32 เฟรมได้ค่าเดียวกัน) · x264 บีบอัดแล้วค่าคลาดได้ไม่กี่หน่วย
fn frame_of_luma(y: u8) -> u32 {
    (0..32u32).min_by_key(|n| (((n * 8) % 256) as i32 - y as i32).abs()).unwrap()
}

#[test]
fn packets_like_aegisub() {
    // 0.083 ต้องได้ 83 · เฟรม B เรียงตามเวลาแสดง · แพ็กเก็ตที่ตัวเล่นทิ้งมีป้าย D
    assert_eq!(parse_packet("pts_time=0.083000|dts_time=0.042000|flags=___"), Some((83_000, false, false)));
    assert_eq!(parse_packet("pts_time=N/A|dts_time=1.5|flags=K__"), Some((1_500_000, true, false)));
    assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=KD_"), Some((100_000, true, true)));
    assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=_DC"), Some((100_000, false, true)));
    assert_eq!(parse_packet("pts_time=0.1|dts_time=0.1|flags=K_C"), Some((100_000, true, false)));
    let mut pk = vec![(42_000, true), (125_000, false), (83_000, false), (1_541_666, false)];
    let (times, keys, base) = build(&mut pk);
    assert_eq!((times, keys, base), (vec![0, 41, 83, 1499], vec![0], 42));
}

#[test]
fn keyframe_files_like_aegisub() {
    assert_eq!(load_keys("# keyframe format v1\r\nfps 23.976\r\n0\r\n96\r\nขยะ\r\n24\r\n").unwrap(), vec![0, 24, 96]);
    assert_eq!(load_keys("# XviD 2pass stat file\ni 1 2\np 3\nb 4\nI 5\n# ความเห็น\np\n").unwrap(), vec![0, 3]);
    assert_eq!(load_keys("# ffmpeg 2-pass log file, using xvid codec\ni\np\ni\n").unwrap(), vec![0, 2]);
    assert_eq!(load_keys("##map version 1\nx P y\nI\nPB\nzzz\nxBx\nI P\n").unwrap(), vec![1, 4]);
    assert_eq!(load_keys("#options: 1280x720\nin:0 out:0 type:I\nin:1 out:1 type:b\nin:2 out:2 type:P\nin:3 out:3 type:i\n").unwrap(), vec![0, 3]);
    assert_eq!(load_keys("# WWXD log file, using qpfile format\n# ข้าม\n0 I\n10 P\n96 I\n").unwrap(), vec![0, 96]);
    assert!(load_keys("# WWXD log file, using qpfile format\nเสีย\n").is_err());
    assert!(load_keys("ไฟล์อื่น\n1\n").is_err());
    let k = vec![0, 96, 192, 240];
    assert_eq!(keys_text(&k), "# keyframe format v1\nfps 0\n0\n96\n192\n240\n");
    assert_eq!(load_keys(&keys_text(&k)).unwrap(), k);
}

#[test]
fn jpeg_split_follows_markers() {
    // ภาพที่มี FF D9 อยู่ในตาราง (ไม่ใช่จุดจบ) กับข้อมูลภาพที่มี FF 00 และ RST ต้องแยกได้สองภาพพอดี
    let a: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x05, 0xFF, 0xD9, 0x01, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0xFF, 0x00, 0x22, 0xFF, 0xD3, 0x33, 0xFF, 0xD9];
    let b: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0x44, 0xFF, 0xD9];
    let all = [a.clone(), b.clone()].concat();
    assert_eq!(split_jpegs(&all), vec![&a[..], &b[..]]);
}

#[test]
fn test_movie_frames_and_keys() {
    let Some(m) = media("ฉากตัด (2025).mkv") else { return };
    let t = scan(&tools(), &m, &|| false, &mut |_, _| {}).unwrap().unwrap();
    assert_eq!(t.times.len(), 480, "20 วินาที 24 fps");
    assert_eq!(t.keys, vec![0, 96, 192, 240, 288, 384], "keyframe ที่ 0 4 8 10 12 16 วินาที");
    assert_eq!((t.times[1], t.times[37], t.times[96], t.w, t.h), (42, 1542, 4000, 640, 360));
    assert!((t.fps - 24.0).abs() < 0.01, "fps {}", t.fps);
    // ภาพที่ได้ต้องเป็นเฟรมที่ขอพอดี ทั้งกลางฉาก ก่อนจุดตัด ตรงจุดตัด และเฟรมสุดท้าย
    for n in [37usize, 95, 96, 250, 479] {
        let y = box_lumas(&m, seek_of(&t, n), 3);
        assert!(!y.is_empty(), "เฟรม {n} ไม่ได้ภาพ");
        let got: Vec<u32> = y.iter().map(|&v| frame_of_luma(v)).collect();
        let want: Vec<u32> = (n..(n + 3).min(480)).map(|k| k as u32 % 32).collect();
        assert_eq!(got, want, "เฟรม {n} ค่าสี {y:?}");
    }
    let jpgs = frames_jpg(&tools(), &m, seek_of(&t, 37), 3, 180).unwrap();
    assert_eq!(jpgs.len(), 3);
    assert!(jpgs.iter().all(|j| j.starts_with(&[0xFF, 0xD8]) && j.ends_with(&[0xFF, 0xD9])));
    // จุดเปลี่ยนฉากจริงคือ 4 8 12 16 วินาที ไม่รวม keyframe ที่ 10 วินาทีซึ่งไม่ใช่จุดตัด
    let s = scenes(&tools(), &t, &m, 10.0, &|| false, &mut |_| {}).unwrap().unwrap();
    assert_eq!(s, vec![96, 192, 288, 384]);
    assert_eq!(frame_near(&t, 4.0), 96);
    assert_eq!(frame_near(&t, 4.02), 96);
    assert_eq!(frame_near(&t, 4.03), 97);
}
