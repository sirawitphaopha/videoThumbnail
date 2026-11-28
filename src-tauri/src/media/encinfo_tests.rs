use super::*;
use serde_json::json;

/// BUGS ข้อ 164.2 · อ่านร่องรอยตัวเข้ารหัสจากผลของ MediaInfo แล้วสรุปเป็นประโยค
#[test]
fn reads_encoder_traces() {
    let g = json!({ "@type": "General" });
    let v0 = enc_info(&g, &json!({ "Format": "MPEG Audio", "Encoded_Library": "LAME3.100", "Encoded_Library_Settings": "-m j -V 0 -q 0 -lowpass 22.1 --vbr-new", "BitRate_Mode": "VBR" }));
    assert_eq!(v0.hint.as_deref(), Some("LAME โหมด VBR ระดับ V0"));
    assert_eq!(v0.mode.as_deref(), Some("VBR"));
    let cbr = enc_info(&g, &json!({ "Format": "MPEG Audio", "Encoded_Library_Name": "LAME", "Encoded_Library_Version": "3.99.5", "Encoded_Library_Settings": "-m j -b 320", "BitRate_Mode": "CBR" }));
    assert_eq!(cbr.library.as_deref(), Some("LAME 3.99.5"));
    assert_eq!(cbr.hint.as_deref(), Some("LAME โหมด CBR 320 kbps"));
    let other = enc_info(&g, &json!({ "Format": "MPEG Audio", "Encoded_Library": "Lavc61.3" }));
    assert_eq!(other.hint.as_deref(), Some("ไม่ได้มาจาก LAME (Lavc61.3)"));
    // AAC โปรแกรมที่สร้างไฟล์อยู่ส่วน General
    let qa = enc_info(&json!({ "Encoded_Application": "qaac 2.80, CoreAudioToolbox 7.10.9.0, AAC-LC Encoder, TVBR q91, Quality 96" }), &json!({ "Format": "AAC" }));
    assert_eq!(qa.hint.as_deref(), Some("qaac ใช้เอนจินของ Apple"));
    assert!(qa.app.unwrap().starts_with("qaac"));
    let ff = enc_info(&json!({ "Encoded_Application": "Lavf61.1.100" }), &json!({ "Format": "AAC", "Encoded_Library": "Lavc61.3.100 aac" }));
    assert_eq!(ff.hint.as_deref(), Some("ตัวเข้ารหัสในตัวของ ffmpeg"));
    // FLAC MD5 ของเสียง อยู่ใต้ extra ตัวพิมพ์เล็ก
    let fl = enc_info(&g, &json!({ "Format": "FLAC", "Encoded_Library": "reference libFLAC 1.4.3 20230623", "extra": { "MD5_Unencoded": "0A1B2C3D4E5F60718293A4B5C6D7E8F9" } }));
    assert_eq!(fl.md5.as_deref(), Some("0a1b2c3d4e5f60718293a4b5c6d7e8f9"));
    assert_eq!(fl.hint.as_deref(), Some("ตัวเข้ารหัส FLAC ต้นฉบับ"));
    // ไม่มีอะไรเลย ทุกช่องว่าง
    assert_eq!(enc_info(&g, &json!({ "Format": "Opus" })), EncInfo::default());
}

/// แปลผล flac -t · ผ่าน ไม่มี MD5 MD5 ไม่ตรง ไฟล์เสีย
#[test]
fn reads_flac_test_output() {
    assert_eq!(read_flac_test(true, "song.flac: ok\n").0, "ok");
    let (st, d) = read_flac_test(true, "song.flac: WARNING, cannot check MD5 signature since it was unset in the STREAMINFO\nok\n");
    assert_eq!(st, "nomd5", "ไม่มี MD5 ห้ามบอกว่าผ่าน");
    assert!(d.contains("ไม่ได้ฝัง MD5"));
    let (st, d) = read_flac_test(false, "song.flac: ERROR, MD5 signature mismatch\n");
    assert_eq!(st, "bad");
    assert!(d.contains("เสียงเปลี่ยนไป") && d.contains("mismatch"));
    let (st, d) = read_flac_test(false, "song.flac: *** Got error code 0:FLAC__STREAM_DECODER_ERROR_STATUS_LOST_SYNC\n");
    assert_eq!(st, "bad");
    assert!(d.contains("ไฟล์อาจเสีย"));
}
