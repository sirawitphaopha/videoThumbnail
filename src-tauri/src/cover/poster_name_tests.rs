//! เทสของ poster.rs (mod name_tests) · แยกออกจากไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::fs;

fn folder(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("movie-shelf-newname-{tag}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn no_name_uses_source_stem() {
    let src = Path::new("D:/หนัง/UX2gc.mp4");
    assert_eq!(new_target(src, "mkv", None).unwrap(), Path::new("D:/หนัง/UX2gc.mkv"));
    assert_eq!(new_target(src, "mp4", Some("UX2gc")).unwrap(), Path::new("D:/หนัง/UX2gc.mp4"));
}

#[test]
fn typed_name_keeps_folder_and_output_extension() {
    let d = folder("typed");
    let src = d.join("UX2gc.mp4");
    fs::write(&src, b"x").unwrap();
    assert_eq!(new_target(&src, "mkv", Some("ดาวเหนือ (2023)")).unwrap(), d.join("ดาวเหนือ (2023).mkv"));
    assert_eq!(poster_check_name(src.to_string_lossy().into(), "mkv".into(), "ดาวเหนือ (2023)".into()), None);
}

#[test]
fn bad_names_refused() {
    let d = folder("bad");
    let src = d.join("a.mp4");
    fs::write(&src, b"x").unwrap();
    let kind = |n: &str| poster_check_name(src.to_string_lossy().into(), "mkv".into(), n.into()).map(|p| p.kind);
    assert_eq!(kind(""), Some("empty"));
    assert_eq!(kind("a/b"), Some("chars"));
    assert_eq!(kind("..\\ออกนอกโฟลเดอร์"), Some("chars"));
    assert_eq!(kind("CON"), Some("reserved"));
    assert_eq!(kind("ท้ายจุด."), Some("trailing"));
}

/// AUDIT 12 พ.ย. 2569 ข้อ 7 · ทิ้งแทร็กภาพที่ใส่ MP4 ไม่ได้แล้วไฟล์ใหม่ไม่เหลือภาพ ต้องปฏิเสธ · ทิ้งเสียงหรือซับที่ใส่ไม่ได้ยังทำต่อได้
#[test]
fn mp4_never_drops_all_video() {
    let st = |index: u64, kind: &str, mp4: &str| StreamInfo { index, kind: kind.into(), codec: "x".into(), lang: None, mp4: mp4.into(), why: Some(format!("แทร็ก {index}")) };
    let src = vec![st(0, "video", "no"), st(1, "audio", "ok"), st(2, "subtitle", "no")];
    assert!(mp4_refusal(&src, &[]).is_some_and(|(t, _)| t == "ส่งออกเป็น MP4 ไม่ได้"), "ภาพใส่ไม่ได้ ห้ามส่งออก");
    let (t, d) = mp4_refusal(&src, &[0, 2]).expect("ทิ้งภาพแล้วไม่เหลือภาพ ต้องปฏิเสธ");
    assert_eq!(t, "ส่งออกเป็น MP4 ไม่ได้");
    assert!(d.iter().any(|x| x.contains("ไม่มีภาพ")), "{d:?}");
    let ok = vec![st(0, "video", "ok"), st(1, "audio", "ok"), st(2, "subtitle", "no")];
    assert!(mp4_refusal(&ok, &[]).is_some(), "ซับที่ใส่ไม่ได้ต้องได้รับอนุญาตก่อน");
    assert_eq!(mp4_refusal(&ok, &[2]), None, "ทิ้งซับที่ใส่ไม่ได้แล้วทำต่อได้");
    let audio_only = vec![st(0, "audio", "ok")];
    assert_eq!(mp4_refusal(&audio_only, &[]), None, "ไฟล์เสียงล้วนไม่มีภาพมาแต่แรก ไม่เกี่ยว");
}

#[test]
fn existing_file_is_duplicate_and_untouched() {
    let d = folder("dup");
    let src = d.join("a.mp4");
    fs::write(&src, b"x").unwrap();
    fs::write(d.join("ชื่อซ้ำ.mkv"), b"keep").unwrap();
    fs::write(d.join("a.mkv"), b"keep").unwrap();
    let kind = |n: &str| poster_check_name(src.to_string_lossy().into(), "mkv".into(), n.into()).map(|p| p.kind);
    assert_eq!(kind("ชื่อซ้ำ"), Some("duplicate"));
    // ชื่อเดิมก็ชนได้ ต้องบอกตั้งแต่ก่อนกดเริ่ม
    assert_eq!(kind("a"), Some("duplicate"));
    assert_eq!(kind("A"), Some("duplicate"));
    assert_eq!(fs::read(d.join("ชื่อซ้ำ.mkv")).unwrap(), b"keep");
}

#[test]
fn same_file_as_source_is_not_duplicate() {
    let d = folder("same");
    let src = d.join("a.mp4");
    fs::write(&src, b"x").unwrap();
    assert_eq!(poster_check_name(src.to_string_lossy().into(), "mp4".into(), "a".into()), None);
}

#[test]
fn path_too_long_for_partial_refused() {
    let d = folder("long");
    let src = d.join("a.mp4");
    let used = d.to_string_lossy().encode_utf16().count() + 1 + ".mkv".len();
    // เหลือที่ก่อนถึงขีดสุด 3 ตัว ต่อ .partial 8 ตัวแล้วเกิน
    let over = d.join(format!("{}.mkv", "ก".repeat(MAX_PATH_LEN - used - 3)));
    assert_eq!(target_problem(&src, &over).map(|p| p.kind), Some("long"));
    // เหลือ 8 ตัวพอดี ผ่าน
    let fit = d.join(format!("{}.mkv", "ก".repeat(MAX_PATH_LEN - used - 8)));
    assert_eq!(target_problem(&src, &fit), None);
}
