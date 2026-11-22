//! เทสของ actlog.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

const T: Stamp = Stamp { y: 2026, mo: 11, d: 12, h: 23, mi: 5, s: 9 };

/// บรรทัดเดียว วันเวลาเติมศูนย์ ขึ้นบรรทัดใหม่ในรายละเอียดถูกรวมเป็นบรรทัดเดียว ยาวเกินตัดท้าย
#[test]
fn line_format() {
    assert_eq!(line(T, "ลงถังขยะ", "D:\\หนัง\\a-poster.jpg"), "2026-11-12 23:05:09  ลงถังขยะ  D:\\หนัง\\a-poster.jpg");
    assert_eq!(line(T, "เปิดโปรแกรม", ""), "2026-11-12 23:05:09  เปิดโปรแกรม");
    assert_eq!(line(T, "x", "บรรทัดหนึ่ง\r\n  บรรทัดสอง\n"), "2026-11-12 23:05:09  x  บรรทัดหนึ่ง บรรทัดสอง");
    let long = line(T, "x", &"ก".repeat(2000));
    assert!(long.ends_with('…') && long.chars().filter(|c| *c == 'ก').count() == 1500);
}

/// ค่าที่ส่งมาอ่านง่าย ที่อยู่ไฟล์แบ็กสแลชเดียว ภาษาไทยไม่ถูกแปลงเป็นรหัส
#[test]
fn brief_reads_like_text() {
    let v = serde_json::json!({ "to": "app", "patch": { "linkStores": ["beside", "app"] }, "path": "D:\\หนัง\\ดาวตก.mkv", "n": 3, "x": null });
    let s = brief(&v);
    assert!(s.contains("to: app"), "{s}");
    assert!(s.contains("patch {linkStores: [beside, app]}"), "{s}");
    assert!(s.contains("path: D:\\หนัง\\ดาวตก.mkv"), "{s}");
    assert!(s.contains("n: 3") && s.contains("x: ว่าง"), "{s}");
}

/// บันทึกซับจดที่อยู่ไฟล์กับแบบบันทึก ไม่จดเนื้อซับทั้งก้อน (R13)
#[test]
fn save_detail_skips_document() {
    let long: String = "สวัสดีค่ะ ".repeat(500);
    let v = serde_json::json!({ "doc": { "events": [{ "text": long }] }, "force": null, "mode": "replace", "target": "D:\\หนัง\\ดาวตก.th.srt" });
    let s = line(Stamp { y: 2026, mo: 11, d: 14, h: 0, mi: 0, s: 0 }, "บันทึกไฟล์ซับ", &json_detail(&v));
    assert!(s.contains("target: D:\\หนัง\\ดาวตก.th.srt") && s.contains("mode: replace"), "{s}");
    assert!(!s.contains("สวัสดีค่ะ"), "{s}");
}

/// เขียนต่อท้ายไฟล์ของเดือน · ลบเฉพาะไฟล์บันทึกที่เกินจำนวนเดือน ไฟล์อื่นในโฟลเดอร์ไม่โดน
#[test]
fn append_and_prune() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-บันทึก-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    append(&dir, T, "หนึ่ง", "a").unwrap();
    append(&dir, T, "สอง", "b").unwrap();
    let text = fs::read_to_string(dir.join("2026-11.log")).unwrap();
    assert_eq!(text.lines().count(), 2);
    assert!(text.lines().nth(1).unwrap().contains("สอง  b"));
    for m in 1..=10 { fs::write(dir.join(format!("2025-{m:02}.log")), "").unwrap(); }
    fs::write(dir.join("อื่น.txt"), "").unwrap();
    fs::write(dir.join("2025-1.log"), "").unwrap();
    prune(&dir, 3);
    let mut left: Vec<String> = fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    left.sort();
    assert_eq!(left, vec!["2025-09.log", "2025-1.log", "2025-10.log", "2026-11.log", "อื่น.txt"]);
    let _ = fs::remove_dir_all(&dir);
}

/// ทางเข้ากลางจดเฉพาะคำสั่งที่เขียนหรือลบไฟล์ · คำสั่งอ่านอย่างเดียวไม่อยู่ในรายการ
#[test]
fn watch_list_is_write_only() {
    let has = |c: &str| WATCH.iter().any(|(x, _)| *x == c);
    assert!(has("link_migrate") && has("set_settings") && has("poster_apply") && has("rename_movie"));
    assert!(!has("get_library") && !has("get_settings") && !has("link_state") && !has("actlog_info"));
}
