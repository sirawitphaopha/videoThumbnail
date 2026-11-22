//! เทสของ store.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn tmp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-ทดสอบ-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn new_install_uses_defaults_and_saves() {
    let d = tmp_dir("ใหม่");
    let p = d.join("settings.json");
    let st = SettingsStore::load(p.clone());
    assert_eq!(st.loaded_from, LoadedFrom::New);
    assert_eq!(*st.current.lock().unwrap(), Settings::default());
    st.save(&Settings::default()).unwrap();
    assert!(p.exists());
    assert_eq!(SettingsStore::load(p).loaded_from, LoadedFrom::File);
}

#[test]
fn half_written_file_falls_back_to_backup() {
    let d = tmp_dir("เสีย");
    let p = d.join("settings.json");
    let st = SettingsStore::load(p.clone());
    let mut s = Settings::default();
    s.jpg_quality = 75;
    st.save(&s).unwrap();
    s.jpg_quality = 60;
    st.save(&s).unwrap(); // ตอนนี้ .bak = 75 · ไฟล์จริง = 60
    let full = fs::read(&p).unwrap();
    fs::write(&p, &full[..full.len() / 2]).unwrap(); // ไฟล์จริงเสียครึ่งไฟล์
    let again = SettingsStore::load(p.clone());
    assert_eq!(again.loaded_from, LoadedFrom::Backup);
    assert_eq!(again.source_now(), LoadedFrom::Backup, "ยังไม่บันทึก ต้องยังเตือนว่าใช้ชุดสำรอง");
    assert_eq!(again.current.lock().unwrap().jpg_quality, 75);
    // บันทึกต่อหลังใช้สำรอง ไฟล์ที่เสียต้องไม่ไปทับ .bak ที่ดี
    s.jpg_quality = 80;
    again.save(&s).unwrap();
    assert_eq!(again.source_now(), LoadedFrom::File, "บันทึกทับไฟล์เสียแล้ว ต้องเลิกเตือน");
    let bak = read_settings(&p.with_extension("json.bak")).expect(".bak ต้องยังอ่านได้");
    assert_eq!(bak.jpg_quality, 75, ".bak ที่ดีโดนไฟล์เสียทับ");
    assert_eq!(read_settings(&p).unwrap().jpg_quality, 80);
}

#[test]
fn both_broken_falls_back_to_defaults() {
    let d = tmp_dir("เสียหมด");
    let p = d.join("settings.json");
    fs::write(&p, b"{{{").unwrap();
    fs::write(p.with_extension("json.bak"), b"not json").unwrap();
    let st = SettingsStore::load(p);
    assert_eq!(st.loaded_from, LoadedFrom::Defaults);
    assert_eq!(*st.current.lock().unwrap(), Settings::default());
}

#[test]
fn out_of_range_values_are_reset_not_saved() {
    let s = Settings { jpg_quality: 5, cover_size: "xl".into(), recheck_reminder_days: 12, ..Settings::default() }.sanitize();
    assert_eq!(s.jpg_quality, 90);
    assert_eq!(s.cover_size, "m");
    assert_eq!(s.recheck_reminder_days, 30);
}

/// AUDIT ข้อ 129 ช่องเดียวผิดชนิด ทั้งไฟล์จริงและไฟล์สำรอง ต้องเสียเฉพาะช่องนั้น รายชื่อโฟลเดอร์อยู่ครบ
#[test]
fn one_bad_field_resets_only_that_field() {
    let d = tmp_dir("ช่องผิดชนิด");
    let p = d.join("settings.json");
    let body: &[u8] = r#"{"folders":["D:\\หนัง","E:\\ซีรีส์"],"jpgQuality":999,"showNames":false,"tone":"night","graphImg":{"width":1920,"bits":"สิบหก","dpi":150}}"#.as_bytes();
    fs::write(&p, body).unwrap();
    fs::write(p.with_extension("json.bak"), body).unwrap();
    let st = SettingsStore::load(p.clone());
    assert_eq!(st.loaded_from, LoadedFrom::Partial);
    let s = st.current.lock().unwrap().clone();
    assert_eq!(s.folders, vec!["D:\\หนัง".to_string(), "E:\\ซีรีส์".to_string()], "รายชื่อโฟลเดอร์ต้องไม่หาย");
    assert!(!s.show_names);
    assert_eq!(s.tone, "night");
    assert_eq!(s.jpg_quality, 90, "999 เกินช่อง u8 ช่องนี้กลับเป็นค่าตั้งต้น");
    assert_eq!((s.graph_img.width, s.graph_img.dpi, s.graph_img.bits), (1920, 150, 8), "ช่องย่อยที่ดีอยู่ครบ ช่องย่อยที่เสียกลับเป็นค่าตั้งต้น");
    let mut bad = st.reset_fields.clone();
    bad.sort();
    assert_eq!(bad, vec!["graphImg.bits".to_string(), "jpgQuality".to_string()], "บอกชื่อช่องที่เสียครบ (ลำดับตามที่อ่านไฟล์ ไม่สำคัญ)");
    // บันทึกต่อ ไฟล์จริงที่ผิดบางช่องต้องไม่ไปทับไฟล์สำรอง
    st.save(&s).unwrap();
    assert_eq!(fs::read(p.with_extension("json.bak")).unwrap(), body.to_vec());
    assert_eq!(SettingsStore::load(p).loaded_from, LoadedFrom::File);
}

/// ไฟล์จริงเขียนค้างครึ่งไฟล์ ยังใช้ไฟล์สำรองเหมือนเดิม ไม่ไปอ่านทีละช่องจากไฟล์ที่เสีย
#[test]
fn half_written_file_still_prefers_backup_over_lenient() {
    let d = tmp_dir("ครึ่งไฟล์");
    let p = d.join("settings.json");
    fs::write(&p, r#"{"folders":["D:\\ใหม่"],"jpgQua"#.as_bytes()).unwrap();
    fs::write(p.with_extension("json.bak"), r#"{"folders":["D:\\เดิม"]}"#.as_bytes()).unwrap();
    let st = SettingsStore::load(p);
    assert_eq!(st.loaded_from, LoadedFrom::Backup);
    assert_eq!(st.current.lock().unwrap().folders, vec!["D:\\เดิม".to_string()]);
}

/// AUDIT ข้อ 129 เสียทั้งสองชุด รายชื่อโฟลเดอร์คืนจากคลังหนัง · ไฟล์ปกติไม่แตะ
#[test]
fn broken_both_recovers_folders_from_library() {
    let d = tmp_dir("คืนโฟลเดอร์");
    let p = d.join("settings.json");
    fs::write(&p, b"{{{").unwrap();
    fs::write(p.with_extension("json.bak"), b"xx").unwrap();
    let st = SettingsStore::load(p.clone());
    let n = st.recover_folders(["D:\\หนัง".to_string(), "d:\\หนัง\\".to_string(), "E:\\ซีรีส์".to_string()]);
    assert_eq!(n, 2);
    assert_eq!(st.current.lock().unwrap().folders, vec!["D:\\หนัง".to_string(), "E:\\ซีรีส์".to_string()]);
    let ok = d.join("ok.json");
    fs::write(&ok, br#"{"folders":[]}"#).unwrap();
    let st2 = SettingsStore::load(ok);
    assert_eq!(st2.recover_folders(["D:\\หนัง".to_string()]), 0, "ไฟล์ตั้งค่าปกติที่ตั้งใจไม่มีโฟลเดอร์ ต้องไม่เติมเอง");
    assert!(st2.current.lock().unwrap().folders.is_empty());
}

/// BUGS ข้อ 89 จำว่าปิดตอนขยายเต็มจอ เปิดใหม่อ่านค่ากลับมาได้ ค่าเท่าเดิมไม่เขียนไฟล์ซ้ำ ช่องอื่นไม่โดนแตะ
#[test]
fn remembers_maximized_window() {
    let d = tmp_dir("จำหน้าต่าง");
    let p = d.join("settings.json");
    let st = SettingsStore::load(p.clone());
    let mut s = Settings::default();
    s.folders = vec!["D:\\หนัง".into()];
    st.save(&s).unwrap();
    *st.current.lock().unwrap() = s;
    st.remember_maximized(true);
    let again = SettingsStore::load(p.clone());
    let got = again.current.lock().unwrap().clone();
    assert!(got.window_maximized);
    assert_eq!(got.folders, vec!["D:\\หนัง".to_string()], "จำหน้าต่างแล้วโฟลเดอร์ต้องอยู่ครบ");
    let t = fs::metadata(&p).unwrap().modified().unwrap();
    std::thread::sleep(std::time::Duration::from_millis(30));
    again.remember_maximized(true);
    assert_eq!(fs::metadata(&p).unwrap().modified().unwrap(), t, "ค่าเท่าเดิมไม่ต้องเขียนไฟล์");
    again.remember_maximized(false);
    assert!(!SettingsStore::load(p).current.lock().unwrap().window_maximized);
}

/// AUDIT ข้อ 130 ค่ารูปกราฟผ่านตัวกรอง และโฟลเดอร์ซ้ำเทียบทั้งรายการ
#[test]
fn graph_img_and_folders_are_sanitized() {
    let mut s = Settings::default();
    s.graph_img.quality = 0;
    s.graph_img.bits = 3;
    s.graph_img.format = "bmp".into();
    s.graph_img.width = 100;
    s.graph_img.dpi = 0;
    s.graph_img.subsampling = "411".into();
    s.folders = vec!["D:\\หนัง".into(), "E:\\ซีรีส์".into(), "d:\\หนัง\\".into(), " ".into(), "D:\\".into(), "d:/".into()];
    let s = s.sanitize();
    let g = &s.graph_img;
    assert_eq!((g.quality, g.bits, g.format.as_str(), g.width, g.dpi, g.subsampling.as_str()), (92, 8, "png", 2560, 300, "444"));
    assert_eq!(s.folders, vec!["D:\\หนัง".to_string(), "E:\\ซีรีส์".to_string(), "D:\\".to_string()]);
    let mut ok = Settings::default();
    ok.graph_img.width = 0;
    ok.graph_img.quality = 1;
    ok.graph_img.bits = 16;
    assert_eq!(ok.clone().sanitize().graph_img, ok.graph_img, "ค่าในช่วงที่รับต้องคงเดิม");
}

#[test]
fn missing_fields_in_old_file_get_defaults() {
    let d = tmp_dir("ช่องหาย");
    let p = d.join("settings.json");
    fs::write(&p, br#"{"jpgQuality": 70}"#).unwrap();
    let st = SettingsStore::load(p);
    let s = st.current.lock().unwrap();
    assert_eq!(s.jpg_quality, 70);
    assert!(s.show_names);
    assert_eq!(s.view_mode, "grid");
}
