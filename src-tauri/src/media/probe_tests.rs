//! เทสของ probe.rs (mod tests) · แยกออกจากไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn year_from_name() {
    assert_eq!(year_of("ดาวเหนือ (2023)"), Some(2023));
    assert_eq!(year_of("Iron Tide (2024) 1080p"), Some(2024));
    assert_eq!(year_of("Clip"), None);
    assert_eq!(year_of("Movie (1234)"), None);
}

#[test]
fn parse_names_tracks_and_cover() {
    let j: Value = serde_json::from_str(r#"{
      "format": {"duration": "7680.5"},
      "streams": [
        {"index":0,"codec_type":"video","codec_name":"hevc","width":3840,"height":2160,"color_transfer":"smpte2084","disposition":{"attached_pic":0}},
        {"index":1,"codec_type":"audio","codec_name":"truehd","channels":8,"tags":{"language":"eng"},"disposition":{}},
        {"index":2,"codec_type":"audio","codec_name":"ac3","channels":6,"tags":{"language":"tha"},"disposition":{}},
        {"index":3,"codec_type":"subtitle","codec_name":"subrip","tags":{"language":"tha"},"disposition":{}},
        {"index":4,"codec_type":"attachment","codec_name":"ttf","tags":{"filename":"font.ttf","mimetype":"font/ttf"}},
        {"index":5,"codec_type":"attachment","codec_name":"png","tags":{"filename":"small.png","mimetype":"image/png"}},
        {"index":6,"codec_type":"attachment","codec_name":"mjpeg","tags":{"filename":"cover.jpg","mimetype":"image/jpeg"}}
      ]}"#).unwrap();
    let p = parse(&j);
    assert_eq!(p.duration, Some(7680.5));
    assert_eq!(p.video.as_deref(), Some("3840 × 2160 H.265"));
    assert_eq!(p.video_short.as_deref(), Some("HEVC 2160p HDR"));
    assert_eq!(p.audio[0], Track { lang: Some("อังกฤษ".into()), codec: "TrueHD".into(), layout: Some("7.1".into()) });
    assert_eq!(p.audio[1].codec, "AC-3");
    assert_eq!(p.subs[0], Track { lang: Some("ไทย".into()), codec: "SRT".into(), layout: None });
    assert_eq!(p.images, 2, "นับเฉพาะไฟล์แนบที่เป็นรูป ไม่นับฟอนต์");
    assert_eq!(p.cover, Some(CoverSource::Attachment { name: "cover.jpg".into() }), "ต้องเลือก cover.jpg ก่อนรูปอื่น");
    assert_eq!(p.cover_land, None);
}

/// ไฟล์มีทั้งปกตั้งกับปกนอน · cover_land ไปช่องปกนอน ไม่แย่งปกหลัก ไม่ว่าจะมาก่อนหรือหลัง
#[test]
fn parse_cover_and_cover_land() {
    for order in [["cover_land.jpg", "cover.jpg"], ["cover.jpg", "Cover_Land.JPG"]] {
        let j: Value = serde_json::json!({ "format": {}, "streams": order.iter().enumerate().map(|(i, n)| serde_json::json!({
            "index": i, "codec_type": "attachment", "codec_name": "mjpeg", "tags": { "filename": n, "mimetype": "image/jpeg" } })).collect::<Vec<_>>() });
        let p = parse(&j);
        assert_eq!(p.images, 2);
        assert_eq!(p.cover, Some(CoverSource::Attachment { name: "cover.jpg".into() }), "{order:?}");
        assert!(matches!(&p.cover_land, Some(CoverSource::Attachment { name }) if att_stem(name) == "cover_land"), "{order:?}");
    }
}

#[test]
fn mp4_cover_is_attached_pic_not_main_video() {
    let j: Value = serde_json::from_str(r#"{"format":{},"streams":[
        {"index":0,"codec_type":"video","codec_name":"h264","width":1920,"height":800,"disposition":{"attached_pic":0}},
        {"index":1,"codec_type":"video","codec_name":"mjpeg","width":1000,"height":1500,"disposition":{"attached_pic":1}}]}"#).unwrap();
    let p = parse(&j);
    assert_eq!(p.video_short.as_deref(), Some("AVC 1080p"));
    assert_eq!(p.cover, Some(CoverSource::AttachedPic { index: 1, codec: "mjpeg".into() }));
}

/// AUDIT ข้อ 49 · คลิปแนวตั้งได้ป้ายตามด้านยาว ไม่ใช่ความกว้าง · แนวนอนเหมือนเดิม
#[test]
fn res_label_uses_long_side() {
    assert_eq!(res_label(2160, 3840), "2160p");
    assert_eq!(res_label(1080, 1920), "1080p");
    assert_eq!(res_label(720, 1280), "720p");
    assert_eq!(res_label(1920, 800), "1080p");
    assert_eq!(res_label(3840, 2160), "2160p");
    assert_eq!(res_label(640, 480), "480p");
    assert_eq!(res_label(480, 640), "480p");
}
