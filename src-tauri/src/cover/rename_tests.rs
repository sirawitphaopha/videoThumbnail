//! เทสของ rename.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use sha2::Digest;
use std::collections::BTreeMap;
use std::fs;

/// ที่อยู่ยาวเกิน 259 ตัว (โฟลเดอร์หนังชื่อยาวแบบไฟล์ที่โหลดมา กับชื่อไฟล์ชั่วคราว .partial) ย้ายได้ ไม่ทับไฟล์ที่มีอยู่ (ผู้ช่วยตรวจทาน R2)
#[test]
fn move_no_replace_long_paths() {
    let root = std::env::temp_dir().join(format!("ชั้นหนัง-ที่อยู่ยาว-{}", std::process::id()));
    let deep = root.join("ชื่อเรื่อง (2024) [1080p BluRay x265 10bit DTS-HD MA 5.1]-กลุ่มที่ปล่อยไฟล์ ชื่อยาวมาก").join("ชื่อเรื่อง (2024) [1080p BluRay x265 10bit DTS-HD MA 5.1]-กลุ่มที่ปล่อยไฟล์ ชื่อยาวมาก อีกชั้น");
    fs::create_dir_all(&deep).unwrap();
    let target = deep.join("ชื่อเรื่อง (2024) [1080p BluRay x265 10bit DTS-HD MA 5.1]-กลุ่ม.th.srt");
    let partial = deep.join("ชื่อเรื่อง (2024) [1080p BluRay x265 10bit DTS-HD MA 5.1]-กลุ่ม.th.srt.1234567890abcdef.partial");
    assert!(partial.as_os_str().encode_wide().count() > 260, "ที่อยู่ทดสอบต้องยาวเกิน 260 ตัว");
    fs::write(&partial, b"new").unwrap();
    move_no_replace(&partial, &target).expect("ที่อยู่ยาวต้องย้ายได้");
    assert_eq!(fs::read(&target).unwrap(), b"new");
    assert!(!partial.exists());
    // ปลายทางมีไฟล์อยู่แล้ว ยังไม่ทับ
    fs::write(&partial, b"other").unwrap();
    assert_eq!(move_no_replace(&partial, &target).unwrap_err().kind, "duplicate");
    assert_eq!(fs::read(&target).unwrap(), b"new");
    let _ = fs::remove_dir_all(&root);
}

struct Tmp(PathBuf);
impl Drop for Tmp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn tmp(name: &str) -> Tmp {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-เปลี่ยนชื่อ-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    Tmp(d)
}
/// hash ของทุกไฟล์ในโฟลเดอร์ · ใช้พิสูจน์ว่าไม่มีไฟล์ไหนโดนทับหรือหาย
fn hashes(dir: &Path) -> BTreeMap<String, String> {
    fs::read_dir(dir).unwrap().flatten().filter(|e| e.path().is_file())
        .map(|e| (e.file_name().to_string_lossy().to_string(), probe::hex(&sha2::Sha256::digest(fs::read(e.path()).unwrap()))))
        .collect()
}
fn kind(r: Result<PathBuf, RenameProblem>) -> &'static str {
    r.err().map(|p| p.kind).unwrap_or("ok")
}

#[test]
fn name_rules() {
    let t = tmp("กติกา");
    let old = t.0.join("ดาวเหนือ (2023).mkv");
    fs::write(&old, b"a").unwrap();
    assert_eq!(kind(check_name(&old, "")), "empty");
    assert_eq!(kind(check_name(&old, "   ")), "empty");
    let p = check_name(&old, "ดาวเหนือ: ภาค 2?").unwrap_err();
    assert_eq!((p.kind, p.detail.as_deref()), ("chars", Some("ตอนนี้มี : กับ ?")));
    assert_eq!(check_name(&old, "a/b").unwrap_err().detail.as_deref(), Some("ตอนนี้มี /"));
    assert_eq!(check_name(&old, "a*b<c*").unwrap_err().detail.as_deref(), Some("ตอนนี้มี * กับ <"));
    assert_eq!(kind(check_name(&old, "ดาว\u{202E}เหนือ")), "invisible");
    assert_eq!(kind(check_name(&old, "ดาว\tเหนือ")), "invisible");
    for r in ["CON", "con", "Nul", "COM1", "lpt9", "CON.ภาค 2", "AUX ", "COM¹", "conout$"] {
        assert_eq!(kind(check_name(&old, r)), "reserved", "{r}");
    }
    assert_eq!(kind(check_name(&old, "CONTROL")), "ok");
    assert_eq!(kind(check_name(&old, "COM10")), "ok");
    assert_eq!(kind(check_name(&old, "ดาวเหนือ.")), "trailing");
    assert_eq!(kind(check_name(&old, "ดาวเหนือ ")), "trailing");
    assert_eq!(kind(check_name(&old, &"ก".repeat(252))), "long", "ชื่อรวม .mkv 256 ตัว");
    // ที่อยู่ยาวเกิน 259 แม้ชื่อไม่ถึง 255
    let room = MAX_PATH_LEN - utf16_len(&t.0.to_string_lossy()) - 1 - 4; // ตัวคั่น \ กับ .mkv
    assert_eq!(kind(check_name(&old, &"ข".repeat(room))), "ok", "ยาวพอดี 259 ต้องผ่าน");
    let long = check_name(&old, &"ข".repeat(room + 3)).unwrap_err();
    assert_eq!(long.kind, "long");
    assert!(long.detail.unwrap().contains("สั้นลงอีก 3 ตัว"));
    assert_eq!(check_name(&old, "ดาวเหนือ (2023) 1080p").unwrap(), t.0.join("ดาวเหนือ (2023) 1080p.mkv"));
    // นามสกุลเดิมตัวพิมพ์ตามไฟล์จริง
    let up = t.0.join("Clip.MP4");
    fs::write(&up, b"b").unwrap();
    assert_eq!(check_name(&up, "คลิป").unwrap(), t.0.join("คลิป.MP4"));
}

#[test]
fn rename_keeps_every_other_file() {
    let t = tmp("ย้าย");
    let a = t.0.join("ดาวเหนือ (2023).mkv");
    let b = t.0.join("ฝนแรก (2025).mkv");
    fs::write(&a, b"aaaa").unwrap();
    fs::write(&b, b"bbbb").unwrap();
    fs::write(t.0.join("ฝนแรก (2025).srt"), b"sub").unwrap();
    let before = hashes(&t.0);

    // ชื่อซ้ำกับไฟล์อื่น · ทั้งตัวเช็กและตัวย้ายต้องปฏิเสธ ไฟล์ทุกไฟล์เหมือนเดิม
    assert_eq!(kind(check_name(&a, "ฝนแรก (2025)")), "duplicate");
    assert_eq!(move_no_replace(&a, &b).unwrap_err().kind, "duplicate", "ตัวย้ายต้องไม่เขียนทับแม้ข้ามตัวเช็ก");
    assert_eq!(hashes(&t.0), before, "ห้ามมีไฟล์ไหนโดนทับ");

    // เปลี่ยนชื่อสำเร็จ · เนื้อไฟล์เท่าเดิม ไฟล์อื่นไม่ถูกแตะ
    let id = crate::app::winutil::file_id(&a).unwrap();
    let new = check_name(&a, "ดาวเหนือ (2023) 1080p").unwrap();
    move_no_replace(&a, &new).unwrap();
    assert!(!a.exists() && new.exists());
    assert_eq!(crate::app::winutil::file_id(&new).unwrap(), id, "เปลี่ยนชื่อแล้วต้องเป็นไฟล์เดิม");
    let after = hashes(&t.0);
    assert_eq!(after.len(), before.len());
    assert_eq!(after["ดาวเหนือ (2023) 1080p.mkv"], before["ดาวเหนือ (2023).mkv"]);
    assert_eq!(after["ฝนแรก (2025).mkv"], before["ฝนแรก (2025).mkv"]);
    assert_eq!(after["ฝนแรก (2025).srt"], before["ฝนแรก (2025).srt"]);
}

#[test]
fn case_only_rename_works() {
    let t = tmp("ตัวพิมพ์");
    let a = t.0.join("iron tide (2024).mkv");
    fs::write(&a, b"x").unwrap();
    let new = check_name(&a, "Iron Tide (2024)").expect("เปลี่ยนแค่ตัวพิมพ์ต้องผ่าน ไม่นับว่าชื่อซ้ำ");
    move_no_replace(&a, &new).unwrap();
    let names: Vec<String> = fs::read_dir(&t.0).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    assert_eq!(names, vec!["Iron Tide (2024).mkv".to_string()], "ชื่อในเครื่องต้องเป็นตัวพิมพ์ใหม่");
}

#[test]
fn file_in_use_is_reported_and_untouched() {
    use std::os::windows::fs::OpenOptionsExt;
    let t = tmp("เปิดอยู่");
    let a = t.0.join("เสียกลางเรื่อง (2022).mkv");
    fs::write(&a, b"playing").unwrap();
    // เปิดค้างแบบที่โปรแกรมเล่นหนังทำ ยอมให้อ่านอย่างเดียว ไม่ยอมให้ลบหรือเปลี่ยนชื่อ
    let held = fs::OpenOptions::new().read(true).share_mode(1).open(&a).unwrap();
    let new = check_name(&a, "เสียกลางเรื่อง (2022) ตัด").unwrap();
    let p = move_no_replace(&a, &new).unwrap_err();
    assert_eq!(p.kind, "inuse");
    assert_eq!(p.title, "ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น");
    assert!(a.exists() && !new.exists(), "ไฟล์ต้องยังชื่อเดิม");
    drop(held);
    move_no_replace(&a, &new).expect("ปิดโปรแกรมแล้วกดลองใหม่ต้องสำเร็จ");
}

#[test]
fn history_follows_new_name_in_library() {
    let t = tmp("คลัง");
    let a = t.0.join("ฝนแรก (2025).mkv");
    fs::write(&a, b"y").unwrap();
    let id = crate::app::winutil::file_id(&a).unwrap();
    let lib = LibraryStore::load(t.0.join("library.json"));
    lib.movies.lock().unwrap().push(Movie {
        id: id.clone(), path: a.to_string_lossy().to_string(), name: "ฝนแรก (2025)".into(), ext: "mkv".into(),
        year: Some(2025), status: "ok".into(), sha256: Some("abc".into()), ..Default::default()
    });
    let (m, changed) = rename_in_library(&lib, &id, "ฝนแรก (2026) ฉบับเต็ม").unwrap();
    assert!(changed);
    assert_eq!((m.id.as_str(), m.status.as_str(), m.sha256.as_deref(), m.year), (id.as_str(), "ok", Some("abc"), Some(2026)));
    assert_eq!(m.path, t.0.join("ฝนแรก (2026) ฉบับเต็ม.mkv").to_string_lossy());
    assert!(!lib.is_scanning(), "เปลี่ยนชื่อเสร็จต้องปลดตัวกันอ่านโฟลเดอร์");
    // ชื่อเหมือนเดิม ไม่แตะไฟล์
    let (_, changed) = rename_in_library(&lib, &id, "ฝนแรก (2026) ฉบับเต็ม").unwrap();
    assert!(!changed);
    // กำลังอ่านโฟลเดอร์ เปลี่ยนชื่อไม่ได้
    assert!(lib.try_begin_exclusive());
    assert_eq!(rename_in_library(&lib, &id, "อื่น").unwrap_err().kind, "busy");
    lib.end_exclusive();
    // ผิดกติกา ตัวกันต้องปลดด้วย
    assert_eq!(rename_in_library(&lib, &id, "CON").unwrap_err().kind, "reserved");
    assert!(!lib.is_scanning());
    // AUDIT ข้อ 51 · คำสั่งอ่านโฟลเดอร์ที่ค้างระหว่างเปลี่ยนชื่อ ยังอยู่ให้ rename_movie สั่งอ่านต่อ ไม่หายไปกับการปลดธง
    lib.mark_rescan();
    let _ = rename_in_library(&lib, &id, "ฝนแรก (2027)").unwrap();
    assert!(lib.take_rescan(), "คำสั่งอ่านที่ค้างต้องยังอยู่หลังเปลี่ยนชื่อ");
    assert!(!lib.take_rescan(), "เอาออกแล้วไม่ค้างให้อ่านซ้ำสองรอบ");
}
