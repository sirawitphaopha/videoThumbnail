use super::*;

/// BUGS ข้อ 164.3 · ตัวถอดของ codec ใช้ได้เฉพาะไฟล์ชนิดนั้นตรง ๆ แทร็กแรก ffmpeg ใช้ได้ทุกไฟล์
#[test]
fn decoder_fits_only_its_own_file() {
    let p = |s: &str| PathBuf::from(s);
    assert!(fits("flac", &p("D:\\เพลง\\a.FLAC"), 0));
    assert!(!fits("flac", &p("D:\\หนัง\\a.mkv"), 0), "FLAC ใน MKV ใช้ flac.exe ไม่ได้");
    assert!(!fits("flac", &p("D:\\เพลง\\a.flac"), 1), "แทร็กที่สองไม่มีในไฟล์ FLAC");
    assert!(fits("mac", &p("a.ape"), 0) && fits("takc", &p("a.tak"), 0) && fits("lame", &p("a.mp3"), 0) && fits("wvunpack", &p("a.wv"), 0));
    assert!(!fits("lame", &p("a.flac"), 0));
    assert!(fits("ffmpeg", &p("a.mkv"), 3));
}

/// เวลาแบบที่ flac กับ wvunpack อ่านได้ และตัวเลือกข้ามไปกลางไฟล์
#[test]
fn stream_args_skip_and_until() {
    assert_eq!(hms(0.0), "0:00.000");
    assert_eq!(hms(75.5), "1:15.500");
    assert_eq!(hms(3725.25), "1:02:05.250");
    let a: Vec<String> = stream_args("flac", Path::new("D:\\a.flac"), 75.5, 4.0).iter().map(|x| x.to_string_lossy().to_string()).collect();
    assert_eq!(a, ["-d", "-c", "-s", "--skip=1:15.500", "--until=+0:04.000", "D:\\a.flac"]);
    let w: Vec<String> = stream_args("wvunpack", Path::new("D:\\a.wv"), 0.0, 4.0).iter().map(|x| x.to_string_lossy().to_string()).collect();
    assert_eq!(w.last().map(String::as_str), Some("-"), "wvunpack ส่งเสียงทาง stdout");
    assert!(w.contains(&"--skip=0:00.000".to_string()));
}

/// ชื่อไฟล์ชั่วคราวของ lame กับ Takc ขึ้นต้น play- ให้ตัวกวาดตอนเปิดโปรแกรมลบได้ · ตัวถอดต่างกันได้คนละไฟล์
#[test]
fn whole_file_temp_is_swept() {
    let w = Path::new("C:\\tmp");
    let a = temp_of(w, "lame", Path::new("D:\\a.mp3"));
    let b = temp_of(w, "takc", Path::new("D:\\a.mp3"));
    let n = a.file_name().unwrap().to_string_lossy().to_string();
    assert!(n.starts_with("play-") && n.ends_with(".wav"));
    assert!(crate::app::tools::TMP_SWEEP.iter().any(|p| n.starts_with(p)));
    assert_ne!(a, b);
}
