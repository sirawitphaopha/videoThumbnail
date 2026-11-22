//! เทสของ chapters.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn parses_ffprobe_chapters_in_order() {
    let v: Value = serde_json::from_str(r#"{"chapters":[{"start_time":"300.500000","tags":{"title":"บทที่ 2"}},{"start_time":"0.000000","tags":{"title":"เปิดเรื่อง"}},{"start_time":"900.0"}]}"#).unwrap();
    let c = parse_ffprobe(&v);
    assert_eq!(c.iter().map(|x| x.title.as_str()).collect::<Vec<_>>(), vec!["เปิดเรื่อง", "บทที่ 2", ""]);
    assert_eq!(c[1].start, 300.5);
}

#[test]
fn writes_ogm_for_mkvmerge() {
    let t = ogm_text(&[Chapter { start: 3725.25, title: "ท้าย\nเรื่อง".into() }, Chapter { start: 0.0, title: "เปิด".into() }]);
    assert_eq!(t, "CHAPTER01=00:00:00.000\nCHAPTER01NAME=เปิด\nCHAPTER02=01:02:05.250\nCHAPTER02NAME=ท้าย เรื่อง\n");
}

#[test]
fn writes_matroska_xml() {
    let t = xml_text(&[Chapter { start: 60.5, title: "ท้าย <จบ> & \"ลา\"".into() }, Chapter { start: 0.0, title: "เปิด".into() }], Some(125.0));
    assert!(t.starts_with("<?xml version=\"1.0\"?>\n"), "{t}");
    assert_eq!(t.matches("<ChapterAtom>").count(), 2);
    assert!(t.contains("<ChapterTimeStart>00:00:00.000000000</ChapterTimeStart>\n      <ChapterTimeEnd>00:01:00.500000000</ChapterTimeEnd>"), "{t}");
    assert!(t.contains("<ChapterTimeStart>00:01:00.500000000</ChapterTimeStart>\n      <ChapterTimeEnd>00:02:05.000000000</ChapterTimeEnd>"), "{t}");
    assert!(t.contains("<ChapterString>ท้าย &lt;จบ&gt; &amp; &quot;ลา&quot;</ChapterString>"), "{t}");
}

#[test]
fn writes_ffmetadata_with_ends_and_escapes() {
    let t = ffmetadata_text(&[Chapter { start: 0.0, title: "ก=ข;ค".into() }, Chapter { start: 60.0, title: "จบ".into() }], Some(125.5));
    assert_eq!(t, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=60000\ntitle=ก\\=ข\\;ค\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=60000\nEND=125500\ntitle=จบ\n");
}
