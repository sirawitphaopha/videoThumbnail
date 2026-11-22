//! เทสของ fonts.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn reads_fonts_from_styles_and_overrides() {
    let ass = "[Script Info]\nTitle: x\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour\nStyle: Default,Tahoma,48,&H00FFFFFF\nStyle: Sign,@Leelawadee UI,40,&H00FFFFFF\nStyle: Copy,tahoma,30,&H0\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fnComic Sans MS\\b1}สวัสดี{\\fn}ครับ\nDialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,{\\fs20\\fnฟอนต์ไม่มีในเครื่อง}ป้าย\n";
    assert_eq!(ass_fonts(ass), ["Tahoma", "Leelawadee UI", "Comic Sans MS", "ฟอนต์ไม่มีในเครื่อง"], "ไม่ซ้ำตัวพิมพ์เล็กใหญ่ · ตัด @ · \\fn เปล่าไม่นับ");
    // ลำดับช่องต่างจากปกติ ใช้ช่อง Fontname ตามบรรทัด Format
    assert_eq!(ass_fonts("[V4 Styles]\nFormat: Fontname, Name\nStyle: Georgia,Default\n"), ["Georgia"]);
}

#[test]
fn reads_names_inside_windows_fonts() {
    let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
    let tahoma = font_names(&win.join("tahoma.ttf"));
    assert!(tahoma.iter().any(|n| n == "Tahoma"), "{tahoma:?}");
    // ไฟล์รวมหลายฟอนต์ (TTC) อ่านได้ทุกตัว
    if win.join("msgothic.ttc").exists() {
        let g = font_names(&win.join("msgothic.ttc"));
        assert!(g.iter().any(|n| n.eq_ignore_ascii_case("MS Gothic")) && g.iter().any(|n| n.eq_ignore_ascii_case("MS PGothic")), "{g:?}");
    }
    assert!(font_names(Path::new("C:\\Windows\\notepad.exe")).is_empty(), "ไฟล์ที่ไม่ใช่ฟอนต์ได้ว่าง");
}

#[test]
fn finds_folder_fonts_first_then_windows() {
    let dir = std::env::temp_dir().join(format!("ms-fonts-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(dir.join("Fonts")).unwrap();
    let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
    // ชุดซับที่มีฟอนต์ในโฟลเดอร์ย่อย Fonts · ชื่อไฟล์ไม่บอกชื่อฟอนต์ ต้องอ่านจากในไฟล์
    std::fs::copy(win.join("georgia.ttf"), dir.join("Fonts").join("f01.ttf")).unwrap();
    let sub = dir.join("x.ass");
    std::fs::write(&sub, "").unwrap();
    let hits = find(&sub, &["Georgia".into(), "tahoma".into(), "ฟอนต์ไม่มีในเครื่อง".into()]);
    assert_eq!(hits[0].from, "folder");
    assert!(hits[0].file.as_deref().unwrap().ends_with("f01.ttf"));
    assert_eq!(hits[1].from, "system");
    assert!(hits[1].file.as_deref().unwrap().to_lowercase().ends_with("tahoma.ttf"));
    assert!(hits[1].size > 0);
    assert_eq!((hits[2].file.as_deref(), hits[2].from.as_str()), (None, ""));
    assert_eq!(mime_of(Path::new("a.TTF")), "font/ttf");
    assert_eq!(mime_of(Path::new("a.otf")), "font/otf");
    let _ = std::fs::remove_dir_all(&dir);
}
