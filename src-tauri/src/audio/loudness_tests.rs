//! เทสของ loudness.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// ไซน์ 1 kHz −20 dBFS สเตอริโอ ตาม EBU Tech 3341 ต้องได้ −20 LUFS (±0.1) · ไซน์ 997 Hz เต็มสเกลช่องเดียวได้ true peak 0 dBTP
#[test]
fn sine_reference_levels() {
    let names = vec!["FL".to_string(), "FR".to_string()];
    let mut r = R128::new(&names, 48_000);
    let a = 10f64.powf(-20.0 / 20.0);
    for n in 0..48_000 * 20 {
        let v = (a * (2.0 * PI * 1000.0 * n as f64 / 48_000.0).sin()) as f32;
        r.push(&[v, v]);
    }
    let (m, i, lra, tp) = r.finish();
    let i = i.unwrap();
    assert!((i - -20.0).abs() < 0.1, "integrated {i}");
    assert!(lra.unwrap() < 0.1, "ไซน์คงที่ LRA ต้องราว 0 ได้ {lra:?}");
    assert!((m[100].1 - -20.0).abs() < 0.1, "momentary {}", m[100].1);
    assert!((tp.unwrap() - -20.0).abs() < 0.2, "true peak {tp:?}");
    // LFE ไม่นับ เงียบทั้งเรื่องไม่มีค่า integrated
    let mut q = R128::new(&["LFE".to_string()], 48_000);
    for _ in 0..48_000 * 2 { q.push(&[0.5]); }
    assert!(q.finish().1.is_none());
}
