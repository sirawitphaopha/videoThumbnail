//! เทสของ subshot.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }
fn tmpd(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("movie-shelf-subshot-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}
/// ซับตัวหนังสือเหลือง &H0000D7FF (255,215,0) ไม่มีขอบ เงาดำโปร่งครึ่งหนึ่ง (&H80) ระยะ 12 · matrix ว่างคือไม่มีบรรทัด YCbCr Matrix
fn yellow(matrix: &str) -> SubDoc {
    let m = if matrix.is_empty() { String::new() } else { format!("YCbCr Matrix: {matrix}\r\n") };
    let ass = format!("[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\n{m}ScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,120,&H0000D7FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,12,5,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,MMMM\r\n");
    crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None)
}
fn rgba(png: &[u8]) -> Vec<u8> { image::load_from_memory(png).unwrap().to_rgba8().into_raw() }
/// สีที่เจอมากที่สุดของจุดที่ทึบเต็มที่และไม่ใช่สีพื้นหรือเงา
fn top(px: &[u8], skip: [u8; 3]) -> [u8; 3] {
    let mut m: std::collections::HashMap<[u8; 3], u32> = std::collections::HashMap::new();
    for p in px.chunks_exact(4) { let c = [p[0], p[1], p[2]]; if p[3] == 255 && c != skip && c.iter().map(|&v| v as u32).sum::<u32>() > 200 { *m.entry(c).or_insert(0) += 1; } }
    m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or([0, 0, 0])
}
fn near(a: [u8; 3], b: [u8; 3], tol: i32) -> bool { (0..3).all(|k| (a[k] as i32 - b[k] as i32).abs() <= tol) }

/// BUGS ข้อ 124 · ภาพซับที่วางทับภาพหนังบนจอ (กับบันทึกแบบเฉพาะซับ) เดิมใช้โหมดพื้นโปร่งใส alpha=1 ของตัวกรอง subtitles
/// สีเหลือง 255,215,0 ออกมา 235,201,16 (บีบสีเหลือ 16 ถึง 235) และเงาโปร่งครึ่งหนึ่งได้ความทึบราว 63 แทน 128 แบบที่เจอตอนทำ PGS
#[test]
fn overlay_exact_color_and_half_alpha() {
    let dir = tmpd("ov");
    let px = rgba(&overlay_png(&tools(), &dir, &yellow("TV.709"), None, 1000.0, 1280, 720, 1280, 720).unwrap());
    let got = top(&px, [0, 0, 0]);
    assert!(near(got, [255, 215, 0], 2), "สีตัวหนังสือได้ {got:?} ต้อง 255,215,0");
    let mut m: std::collections::HashMap<u8, u32> = std::collections::HashMap::new();
    for p in px.chunks_exact(4) { if p[3] > 0 && p[3] < 255 && p[0] < 8 && p[1] < 8 && p[2] < 8 { *m.entry(p[3]).or_insert(0) += 1; } }
    let (a, n) = m.into_iter().max_by_key(|x| x.1).unwrap_or((0, 0));
    assert!((124..=132).contains(&a) && n > 1000, "เงาความทึบ {a} ({n} จุด) ต้องราว 128");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ซับ TV.601 (หรือไม่บอก) บนหนัง HD · ตัวเล่นอย่าง mpv คิดสีแบบ VSFilter ภาพนิ่งต้องได้สีเดียวกับตอนเล่น
#[test]
fn overlay_tv601_on_hd_like_player() {
    let dir = tmpd("ov601");
    let want = crate::subtitle::pgs::mangle601([255, 215, 0]);
    for m in ["TV.601", ""] {
        let px = rgba(&overlay_png(&tools(), &dir, &yellow(m), None, 1000.0, 1280, 720, 1280, 720).unwrap());
        let got = top(&px, [0, 0, 0]);
        assert!(near(got, want, 2), "ซับ {m:?} บนหนัง 720 ได้ {got:?} ต้อง {want:?} แบบตัวเล่น");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// บันทึกภาพแบบมีซับ (ภาพหนังหรือวิดีโอจำลอง) · เดิมให้ ffmpeg วาดซับลงภาพ สีหม่นแบบเดียวกัน · พื้นเทา 90 เงาดำครึ่งหนึ่งต้องได้ราว 45
#[test]
fn subs_on_image_exact_color() {
    let dir = tmpd("img");
    let mut base = std::io::Cursor::new(Vec::new());
    image::RgbImage::from_pixel(1280, 720, image::Rgb([90, 90, 90])).write_to(&mut base, image::ImageFormat::Png).unwrap();
    let px = rgba(&subs_on_png(&tools(), &dir, &yellow("TV.709"), base.get_ref(), None, 1000.0, 1280, 720, 1280, 720).unwrap());
    let got = top(&px, [90, 90, 90]);
    assert!(near(got, [255, 215, 0], 2), "สีตัวหนังสือบนภาพได้ {got:?} ต้อง 255,215,0");
    let mut m: std::collections::HashMap<u8, u32> = std::collections::HashMap::new();
    for p in px.chunks_exact(4) { if p[0] == p[1] && p[1] == p[2] && p[0] > 20 && p[0] < 80 { *m.entry(p[0]).or_insert(0) += 1; } }
    let (v, n) = m.into_iter().max_by_key(|x| x.1).unwrap_or((0, 0));
    assert!((42..=48).contains(&v) && n > 1000, "เงาบนพื้นเทาได้ {v} ({n} จุด) ต้องราว 45");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn filter_path_escapes_colon_and_quote() {
    assert_eq!(filter_path(Path::new(r"C:\tmp\a.ass")), r"'C\:/tmp/a.ass'");
    assert_eq!(filter_path(Path::new(r"C:\it's\a.ass")), r"'C\:/it\'\''s/a.ass'");
}

/// เวลาของภาพนิ่งละเอียดถึงมิลลิวินาที (หน่วยเวลาไมโครวินาทีใน pgs.rs spawn_pair) · บรรทัด 0.50 ถึง 2.00 วินาที
/// ที่ 1,990 ms ต้องมีซับ ถ้าปัดเป็นวินาทีเต็มจะเป็น 2 วินาทีซึ่งบรรทัดจบแล้ว · ที่ 490 ms ต้องว่าง ถ้าปัดเป็น 0.5 จะมีซับ
#[test]
fn time_uses_microsecond_base() {
    let dir = tmpd("time");
    let has = |t: f64| rgba(&overlay_png(&tools(), &dir, &yellow("TV.709"), None, t, 640, 360, 1280, 720).unwrap()).chunks_exact(4).any(|p| p[3] > 0);
    assert!(has(1990.0), "1,990 ms ต้องมีซับ");
    assert!(!has(490.0), "490 ms ต้องยังไม่มีซับ");
    assert!(!has(2010.0), "2,010 ms ต้องจบแล้ว");
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn fonts_by_mime_or_extension() {
    assert!(is_font("a.TTF", "application/octet-stream"));
    assert!(is_font("x", "application/x-truetype-font"));
    assert!(is_font("x", "font/otf"));
    assert!(!is_font("cover.jpg", "image/jpeg"));
    assert_eq!(safe_name("..\\evil/f:o.ttf", 3), "f_o.ttf");
    assert_eq!(safe_name("", 3), "font-3.ttf");
}

#[test]
fn save_new_never_overwrites() {
    let d = std::env::temp_dir().join(format!("subshot-test-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&d).unwrap();
    std::fs::write(d.join("หนัง_001_96.png"), b"old").unwrap();
    let p = save_new(&d, "หนัง", 96, b"new").unwrap();
    assert_eq!(p.file_name().unwrap().to_string_lossy(), "หนัง_002_96.png");
    assert_eq!(std::fs::read(d.join("หนัง_001_96.png")).unwrap(), b"old");
    assert_eq!(std::fs::read(&p).unwrap(), b"new");
    std::fs::remove_dir_all(&d).unwrap();
}
