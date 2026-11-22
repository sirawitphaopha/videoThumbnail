//! เทสของ bitrate.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::path::PathBuf;

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

#[test]
fn parses_compact_lines() {
    assert_eq!(parse_line("pts_time=1.500000|dts_time=1.460000|size=5120|flags=K__"), Some((1.5, 5120, 'K')));
    assert_eq!(parse_line("pts_time=N/A|dts_time=2.000000|size=10|flags=___"), Some((2.0, 10, '_')));
    assert_eq!(parse_line("pts_time=N/A|dts_time=N/A|size=10|flags=___"), None);
    assert_eq!(parse_line("best_effort_timestamp_time=0.040000|pkt_dts_time=0.000000|pkt_size=812|pict_type=B"), Some((0.04, 812, 'B')));
    assert_eq!(parse_line("best_effort_timestamp_time=N/A|pkt_dts_time=1.0|pkt_size=9|pict_type=?"), Some((1.0, 9, '?')));
    assert_eq!(parse_line(""), None);
}

/// คลิป 3 วินาที 25 เฟรมต่อวินาที คีย์เฟรมทุก 25 เฟรม มี B เฟรม
/// แบบแพ็กเก็ตได้ 75 เฟรม คีย์เฟรม 3 · แบบถอดภาพได้ 75 เฟรม I 3 มีทั้ง P และ B · ขนาดรวมสองแบบเท่ากัน
#[test]
fn reads_packets_and_frame_types() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรต-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("คลิป บิตเรต.mkv");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=320x240:rate=25", "-c:v", "libx264", "-g", "25", "-keyint_min", "25", "-sc_threshold", "0", "-bf", "2", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let (inf, sel) = info(&tools(), &f, "auto").unwrap();
    assert_eq!((inf.kind.as_str(), inf.track.as_str(), sel.as_str(), inf.tracks.len()), ("video", "v", "V:0", 1));
    assert_eq!((inf.width, inf.height, inf.codec.as_str(), inf.video, inf.audio, inf.format.as_str()), (320, 240, "h264", 1, 0, "matroska"));
    assert!((inf.fps - 25.0).abs() < 0.01 && (inf.duration - 3.0).abs() < 0.1, "{inf:?}");
    assert_eq!((inf.pix_fmt.as_str(), inf.bit_depth), ("yuv444p", 8), "{inf:?}");
    let mut calls = 0;
    let p = read_frames(&tools(), &f, "V:0", false, true, &|| false, &mut |_| calls += 1).unwrap().unwrap();
    let fr = read_frames(&tools(), &f, "V:0", true, true, &|| false, &mut |_| {}).unwrap().unwrap();
    // แบบส่งให้หน้าจอ ไม่เก็บทั้งไฟล์ · รวมทุกก้อนที่ส่งได้ครบ 75 เฟรม ลำดับต่อกันไม่ขาด ขนาดรวมเท่าแบบเก็บ · ffprobe จบปกติ (AUDIT ข้อ 118 119)
    let (mut got, mut bytes, mut next) = (0usize, 0u64, 0usize);
    let dr = read_frames(&tools(), &f, "V:0", false, false, &|| false, &mut |c| { if c.t.is_empty() { return; } assert_eq!(c.first, next); next += c.t.len(); got += c.t.len(); bytes += c.s.iter().sum::<u64>(); }).unwrap().unwrap();
    assert_eq!((got, dr.total, dr.t.len()), (75, 75, 0));
    assert_eq!(bytes, p.s.iter().sum::<u64>());
    assert!(dr.exit_ok && p.exit_ok);
    let _ = std::fs::remove_dir_all(&dir);
    assert_eq!(p.t.len(), 75);
    assert_eq!(p.k.chars().filter(|c| *c == 'K').count(), 3, "{}", p.k);
    assert!(calls >= 1 && p.read_to > 2.8);
    assert_eq!(fr.t.len(), 75);
    assert_eq!(fr.k.chars().filter(|c| *c == 'I').count(), 3, "{}", fr.k);
    assert!(fr.k.contains('P') && fr.k.contains('B'), "{}", fr.k);
    assert_eq!(p.s.iter().sum::<u64>(), fr.s.iter().sum::<u64>());
}

/// ไฟล์มีวิดีโอกับเสียงสองแทร็ก · ถามแทร็กได้ครบสามตัว · อ่านเสียงแทร็กที่สองได้ ชนิดเป็น _ ทุกแพ็กเก็ต
/// ไฟล์เสียงล้วน ไม่ส่งแทร็กมา เปิดเสียงแทร็กแรกเอง · ขอแทร็กวิดีโอจากไฟล์เสียงล้วน บอกว่าไม่มี
#[test]
fn reads_audio_tracks() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรตเสียง-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("หนัง สองเสียง.mkv");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=3:size=160x120:rate=25",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-f", "lavfi", "-i", "sine=frequency=880:duration=3:sample_rate=48000",
        "-map", "0", "-map", "1", "-map", "2", "-c:v", "libx264", "-c:a", "flac", "-metadata:s:a:1", "language=tha", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let (all, _) = info(&tools(), &f, "auto").unwrap();
    let ids: Vec<&str> = all.tracks.iter().map(|t| t.id.as_str()).collect();
    assert_eq!(ids, ["v", "a0", "a1"]);
    assert_eq!(all.tracks[0].label, "วิดีโอ H.264 160 × 120");
    assert_eq!(all.tracks[2].label, "เสียง 2 FLAC 1.0 ch tha");
    let (a, sel) = info(&tools(), &f, "a1").unwrap();
    assert_eq!((a.kind.as_str(), a.track.as_str(), sel.as_str(), a.sample_rate, a.channels, a.codec.as_str(), a.lang.as_str()), ("audio", "a1", "a:1", 48000, 1, "flac", "tha"));
    assert_eq!(a.fps, 0.0);
    let p = read_frames(&tools(), &f, &sel, true, true, &|| false, &mut |_| {}).unwrap().unwrap();
    assert!(p.t.len() > 10 && p.k.chars().all(|c| c == '_'), "{} {}", p.t.len(), p.k);
    assert!(p.read_to > 2.5);
    assert!(info(&tools(), &f, "a5").is_err());
    let m = dir.join("เพลง.flac");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=duration=2", m.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let (b, sel2) = info(&tools(), &m, "").unwrap();
    assert_eq!((b.kind.as_str(), b.track.as_str(), sel2.as_str(), b.tracks.len(), b.video), ("audio", "a0", "a:0", 1, 0));
    assert!(info(&tools(), &m, "v").is_err());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn stop_returns_none() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนังบิตเรตหยุด-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let f = dir.join("หยุด.mkv");
    let out = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=2:size=160x120:rate=25", "-c:v", "libx264", f.to_str().unwrap()]).unwrap();
    assert!(out.status.success());
    let r = read_frames(&tools(), &f, "V:0", false, true, &|| true, &mut |_| {}).unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    assert!(r.is_none());
}
