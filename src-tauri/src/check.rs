//! ตรวจไฟล์ (แผนขั้น 6 · สเปกข้อ 8 · TECH-REVIEW ข้อ 13) · ทำค้าง เริ่ม 6 พ.ย. 2569 23.35 น.
//! ชิ้นแรก รวมจุดเสียที่ห่างกันไม่เกิน 5 วินาทีเป็นช่วงเดียว และเขียนเวลาแบบ 1:12:30 ให้คนอ่าน
//! ยังไม่ได้ต่อกับหน้าจอหรือ ffmpeg (ทำต่อพรุ่งนี้)
#![allow(dead_code)]

/// จุดเสียต่อกันห่างไม่เกินนี้ (วินาที) นับเป็นช่วงเดียว (TECH-REVIEW ข้อ 13)
pub const MERGE_GAP: f64 = 5.0;

/// จุดเสียหนึ่งจุดที่ตัวถอดรหัสเจอ · เวลาในเรื่อง (วินาที) และเสียที่ภาพหรือเสียง
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hit {
    pub at: f64,
    pub video: bool,
}

/// ช่วงที่เสีย หลังรวมจุดที่อยู่ใกล้กัน
#[derive(Debug, Clone, PartialEq)]
pub struct Spot {
    pub start: f64,
    pub end: f64,
    pub video: bool,
    pub audio: bool,
}

/// รวมจุดเสียเป็นช่วง · เรียงตามเวลาก่อน จุดถัดไปห่างจากท้ายช่วงไม่เกิน gap รวมเข้าช่วงเดิม
pub fn merge_hits(hits: &[Hit], gap: f64) -> Vec<Spot> {
    let mut sorted: Vec<Hit> = hits.iter().copied().filter(|h| h.at.is_finite() && h.at >= 0.0).collect();
    sorted.sort_by(|a, b| a.at.total_cmp(&b.at));
    let mut out: Vec<Spot> = Vec::new();
    for h in sorted {
        match out.last_mut() {
            Some(s) if h.at - s.end <= gap => {
                s.end = s.end.max(h.at);
                s.video |= h.video;
                s.audio |= !h.video;
            }
            _ => out.push(Spot { start: h.at, end: h.at, video: h.video, audio: !h.video }),
        }
    }
    out
}

/// เวลาแบบคนอ่าน · ไม่ถึงชั่วโมง `0:30` `12:05` · ตั้งแต่ชั่วโมง `1:12:30` · ปัดเศษวินาทีทิ้ง
pub fn fmt_time(secs: f64) -> String {
    let t = if secs.is_finite() && secs > 0.0 { secs.floor() as u64 } else { 0 };
    let (h, m, s) = (t / 3600, (t % 3600) / 60, t % 60);
    if h > 0 { format!("{h}:{m:02}:{s:02}") } else { format!("{m}:{s:02}") }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(at: f64) -> Hit { Hit { at, video: true } }
    fn a(at: f64) -> Hit { Hit { at, video: false } }

    #[test]
    fn merges_hits_within_five_seconds() {
        // ห่าง 3 วินาที รวมเป็นช่วงเดียว · ห่าง 6 วินาที แยกช่วง
        let s = merge_hits(&[v(30.0), v(33.0), v(39.5)], MERGE_GAP);
        assert_eq!(s.len(), 2);
        assert_eq!((s[0].start, s[0].end), (30.0, 33.0));
        assert_eq!((s[1].start, s[1].end), (39.5, 39.5));
        // ห่างพอดี 5 วินาที ยังนับเป็นช่วงเดียว
        assert_eq!(merge_hits(&[v(10.0), v(15.0)], MERGE_GAP).len(), 1);
    }

    #[test]
    fn keeps_video_and_audio_flags_and_sorts() {
        // ลำดับที่ตัวถอดรหัสส่งมาไม่เรียง · ภาพกับเสียงในช่วงเดียวกัน ช่วงนั้นเสียทั้งสอง
        let s = merge_hits(&[a(31.0), v(30.2), a(100.0)], MERGE_GAP);
        assert_eq!(s, vec![
            Spot { start: 30.2, end: 31.0, video: true, audio: true },
            Spot { start: 100.0, end: 100.0, video: false, audio: true },
        ]);
        // เวลาเพี้ยน (ติดลบ ไม่ใช่ตัวเลข) ทิ้ง ไม่ทำให้ผลพัง
        assert!(merge_hits(&[v(f64::NAN), v(-1.0)], MERGE_GAP).is_empty());
    }

    #[test]
    fn formats_time_like_spec() {
        assert_eq!(fmt_time(4350.0), "1:12:30"); // ตัวอย่างในสเปก
        assert_eq!(fmt_time(30.333), "0:30"); // ไฟล์ทดสอบ เสียกลางเรื่อง เสียที่วินาที 30
        assert_eq!(fmt_time(725.9), "12:05");
        assert_eq!(fmt_time(0.0), "0:00");
        assert_eq!(fmt_time(-3.0), "0:00");
        assert_eq!(fmt_time(36000.0), "10:00:00");
    }
}
