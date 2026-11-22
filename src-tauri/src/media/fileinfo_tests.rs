//! เทสของ fileinfo.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn codec_detail_reads_mediainfo_fields() {
    let mp3 = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "LAME3.99r" });
    assert_eq!(codec_detail(&mp3).as_deref(), Some("MPEG-1 Layer 3 (LAME 3.99r)"));
    let lame4 = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "LAME4.0 " });
    assert_eq!(codec_detail(&lame4).as_deref(), Some("MPEG-1 Layer 3 (LAME 4.0)"));
    let flac = serde_json::json!({ "Format": "FLAC", "Encoded_Library": "Lavf63.1.102" });
    assert_eq!(codec_detail(&flac).as_deref(), Some("FLAC (Lavf 63.1.102)"));
    let dot = serde_json::json!({ "Format": "MPEG Audio", "Format_Version": "1", "Format_Profile": "Layer 3", "Encoded_Library": "Lavc63.1." });
    assert_eq!(codec_detail(&dot).as_deref(), Some("MPEG-1 Layer 3 (Lavc 63.1)"));
    let aac = serde_json::json!({ "Format": "AAC", "Format_AdditionalFeatures": "LC" });
    assert_eq!(codec_detail(&aac).as_deref(), Some("AAC LC"));
    assert_eq!(codec_detail(&serde_json::json!({})), None);
}

#[test]
fn mediainfo_text_splits_into_sections() {
    let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
    assert!(p.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
    let out = run_tool_timeout(&tools, "MediaInfo", [p.as_os_str()], Duration::from_secs(60)).unwrap();
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let s = parse(&text);
    let titles: Vec<&str> = s.iter().map(|x| x.title.as_str()).collect();
    assert_eq!(titles, ["General", "Video", "Audio #1", "Audio #2", "Text #1", "Text #2", "Menu"], "หัวข้อไม่ครบ");
    let exts: Vec<Option<&str>> = s.iter().map(|x| x.ext.as_deref()).collect();
    assert_eq!(exts, [None, Some("mkv"), Some("aac"), Some("ac3"), Some("srt"), Some("ass"), Some("xml")]);
    assert_eq!(s[2].lang.as_deref(), Some("th"));
    assert_eq!(s[3].lang.as_deref(), Some("en"));
    // ทุกบรรทัด ชื่อ : ค่า ของ MediaInfo อยู่ในหัวข้อครบ ไม่หายสักบรรทัด
    let rows_in_text = text.lines().filter(|l| l.contains(" : ")).count();
    assert_eq!(s.iter().map(|x| x.rows.len()).sum::<usize>(), rows_in_text);
}
