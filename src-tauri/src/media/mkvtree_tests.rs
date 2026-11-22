//! เทสของ mkvtree.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::path::PathBuf;

fn media(n: &str) -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join(n) }
fn find<'a>(n: &'a Node, name: &str) -> Option<&'a Node> { if n.name == name { return Some(n); } n.kids.iter().find_map(|k| find(k, name)) }
fn all<'a>(n: &'a Node, name: &str, out: &mut Vec<&'a Node>) { if n.name == name { out.push(n); } for k in &n.kids { all(k, name, out); } }

/// หนังทดสอบ ดาวเหนือ (2023) ตรงกับที่ mkvmerge บอก ห้าแทร็ก Chapter สามอัน มีแท็ก สารบัญกระโดด และก้อนข้อมูล (BUGS ข้อ 131)
#[test]
fn reads_test_movie_like_mkvinfo() {
    let p = media("ดาวเหนือ (2023).mkv");
    let before = std::fs::read(&p).unwrap();
    let t = tree(&p).unwrap();
    assert_eq!(t.kids[0].name, "EBML");
    assert_eq!(find(&t, "DocType").and_then(|n| n.value.clone()).as_deref(), Some("matroska"));
    let seg = find(&t, "Segment").unwrap();
    for n in ["SeekHead", "Info", "Tracks", "Chapters", "Tags", "Cues"] { assert!(seg.kids.iter().any(|k| k.name == n), "Segment ต้องมี {n}"); }
    let d = find(&t, "Duration").and_then(|n| n.value.clone()).unwrap();
    assert!(d.ends_with("(0:00:20.021)"), "ตรงกับ mkvmerge -J ที่บอก 20,021,000,000 ns: {d}");
    let mut tracks = vec![]; all(&t, "TrackEntry", &mut tracks);
    assert_eq!(tracks.len(), 5);
    let codecs: Vec<String> = tracks.iter().filter_map(|tr| find(tr, "CodecID").and_then(|n| n.value.clone())).collect();
    assert_eq!(codecs, ["V_MPEG4/ISO/AVC", "A_AAC", "A_AC3", "S_TEXT/UTF8", "S_TEXT/ASS"]);
    assert_eq!(find(tracks[0], "TrackType").and_then(|n| n.value.clone()).as_deref(), Some("1 video"));
    assert_eq!(find(tracks[0], "PixelWidth").and_then(|n| n.value.clone()).as_deref(), Some("1,280"));
    let mut chaps = vec![]; all(&t, "ChapterAtom", &mut chaps);
    assert_eq!(chaps.len(), 3);
    assert_eq!(find(chaps[0], "ChapterTimeStart").and_then(|n| n.value.clone()).as_deref(), Some("0:00:00.000"));
    let seeks: Vec<String> = { let mut v = vec![]; all(&t, "SeekID", &mut v); v.iter().filter_map(|n| n.value.clone()).collect() };
    assert!(seeks.contains(&"Tracks".to_string()) && seeks.contains(&"Cues".to_string()), "{seeks:?}");
    let clusters: Vec<&Node> = seg.kids.iter().filter(|k| k.name == "Cluster").collect();
    assert!(clusters.len() <= SHOW_CLUSTERS + 1 && !clusters.is_empty());
    let b = find(clusters[0], "SimpleBlock").and_then(|n| n.value.clone()).unwrap();
    assert!(b.starts_with("แทร็ก ") && b.contains("keyframe"), "{b}");
    assert_eq!(std::fs::read(&p).unwrap(), before, "ไฟล์ต้องไม่ถูกแตะ");
}

#[test]
fn not_matroska_and_values() {
    assert!(tree(&media("The Last Orchard (2022).mp4")).unwrap_err().contains("ไม่ใช่ไฟล์ Matroska"));
    assert_eq!(ns_time(3_723_456_000_000), "1:02:03.456");
    assert_eq!(date_text(0), "2001-01-01 00:00:00 UTC");
    assert_eq!(date_text(784_111_777_000_000_000), "2025-11-06 08:49:37 UTC");
    assert_eq!(int(&[0xFF, 0xFE]), -2);
    assert_eq!(block_text(&[0x81, 0x00, 0x2A, 0x80, 0], true).as_deref(), Some("แทร็ก 1 เวลา +42 keyframe"));
}

/// ไฟล์อัดสดที่ Segment กับ Cluster ไม่รู้ขนาด อ่านได้จนจบ ก้อนที่สองต่อจากก้อนแรกถูกต้อง
#[test]
fn unknown_sizes() {
    let mut v: Vec<u8> = vec![0x1A, 0x45, 0xDF, 0xA3, 0x84, 0x42, 0x82, 0x81, b'x'];
    v.extend([0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    for ts in [0u8, 7] {
        v.extend([0x1F, 0x43, 0xB6, 0x75, 0xFF, 0xE7, 0x81, ts, 0xA3, 0x84, 0x81, 0x00, 0x00, 0x80]);
    }
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-mkvtree-{}.mkv", std::process::id()));
    std::fs::write(&d, &v).unwrap();
    let t = tree(&d).unwrap();
    let seg = find(&t, "Segment").unwrap();
    assert_eq!(seg.size, None);
    let cl: Vec<&Node> = seg.kids.iter().filter(|k| k.name == "Cluster").collect();
    assert_eq!(cl.len(), 2, "{:?}", seg.kids.iter().map(|k| &k.name).collect::<Vec<_>>());
    assert_eq!(find(cl[1], "Timestamp").and_then(|n| n.value.clone()).as_deref(), Some("7 (0:00:00.007)"));
    let _ = std::fs::remove_file(&d);
}
