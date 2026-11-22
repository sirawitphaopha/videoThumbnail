//! เทสของ subconv.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn sbv_reads_blocks() {
    let s = sbv_to_srt("0:00:01.000,0:00:03.500\nสวัสดีค่ะ\nบรรทัดสอง\n\n0:00:04.250,0:00:06.000\nHello[br]World\n").unwrap();
    assert_eq!(s, "1\r\n00:00:01,000 --> 00:00:03,500\r\nสวัสดีค่ะ\r\nบรรทัดสอง\r\n\r\n2\r\n00:00:04,250 --> 00:00:06,000\r\nHello\r\nWorld\r\n\r\n");
    assert!(sbv_to_srt("ไม่มีเวลา").is_err());
}

#[test]
fn ttml_reads_times_breaks_spans() {
    let t = r#"<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:frameRate="25" ttp:tickRate="10000000">
<body><div>
<p begin="00:00:01.500" end="00:00:03.000">สวัสดี<br/>บรรทัด &amp; สอง</p>
<p begin="00:00:04:05" dur="2s"><span tts:fontStyle="italic">ตัวเอียง</span> ปกติ</p>
<p begin="70000000t" end="90000000t">Tick</p>
<param begin="1s" end="2s"/>
</div></body></tt>"#;
    let s = ttml_to_srt(t).unwrap();
    assert_eq!(s, "1\r\n00:00:01,500 --> 00:00:03,000\r\nสวัสดี\r\nบรรทัด & สอง\r\n\r\n2\r\n00:00:04,200 --> 00:00:06,200\r\n<i>ตัวเอียง</i> ปกติ\r\n\r\n3\r\n00:00:07,000 --> 00:00:09,000\r\nTick\r\n\r\n");
    assert!(ttml_to_srt("<tt><body></body></tt>").is_err());
}
