//! เทสของ check.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn v(at: f64) -> Hit { Hit { at, video: true } }
fn a(at: f64) -> Hit { Hit { at, video: false } }

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}

/// AUDIT 12 พ.ย. 2569 ข้อ 3 · ตรวจแบบเร็วห้ามทับผลเสียหายของตรวจละเอียด ถ้าไฟล์ยังเป็นไฟล์เดิม
#[test]
fn quick_keeps_deep_bad_on_same_file() {
    let deep_bad = json!({ "mode": "full", "result": "bad", "spans": [[1800, 1802]], "fileSize": 1000, "fileMtime": 50 });
    // ไฟล์เดิม ตรวจแบบเร็วผ่านหรือขึ้นค่า hash ไม่ตรง ต้องคงผลเสียหาย
    assert!(keep_deep_bad("bad", Some(&deep_bad), "quick", "ok", (1000, 50)));
    assert!(keep_deep_bad("bad", Some(&deep_bad), "quick", "changed", (1000, 50)));
    // ไฟล์ถูกแทนด้วยไฟล์ใหม่ ขนาดหรือเวลาแก้ไฟล์เปลี่ยน ใช้ผลใหม่
    assert!(!keep_deep_bad("bad", Some(&deep_bad), "quick", "ok", (1001, 50)));
    assert!(!keep_deep_bad("bad", Some(&deep_bad), "quick", "ok", (1000, 51)));
    // ตรวจละเอียดซ้ำแล้วผ่าน ใช้ผลใหม่เสมอ
    assert!(!keep_deep_bad("bad", Some(&deep_bad), "full", "ok", (1000, 50)));
    // ผลเสียหายจากตรวจแบบเร็ว (โครงไฟล์เสีย) ตรวจแบบเร็วรอบใหม่ทับได้ตามเดิม
    let quick_bad = json!({ "mode": "quick", "result": "bad", "fileSize": 1000, "fileMtime": 50 });
    assert!(!keep_deep_bad("bad", Some(&quick_bad), "quick", "ok", (1000, 50)));
    // เรื่องที่ไม่ได้ขึ้นเสียหายอยู่ ไม่เกี่ยว
    assert!(!keep_deep_bad("ok", Some(&deep_bad), "quick", "ok", (1000, 50)));
    // ผลตรวจรุ่นเก่าที่ไม่ได้จดขนาดไฟล์ ถือว่าเป็นไฟล์เดิม คงผลเสียหาย
    let old = json!({ "mode": "full", "result": "bad", "spans": [] });
    assert!(keep_deep_bad("bad", Some(&old), "quick", "ok", (1000, 50)));
    assert!(!keep_deep_bad("bad", None, "quick", "ok", (1000, 50)));
}

/// ไฟล์ทดสอบ · ไม่มีไฟล์ = เทสล้มพร้อมบอกวิธีสร้าง · ตั้ง MOVIE_SHELF_SKIP_MEDIA=1 ถ้าตั้งใจข้าม
fn media(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}

/// สำเนาชั่วคราวที่ลบตัวเองตอนจบ แม้เทสล้ม
struct Temp(PathBuf);
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}
fn copy_of(src: &Path, tag: &str) -> Temp {
    let dst = std::env::temp_dir().join(format!("movie-shelf-check-{tag}-{}.{}", std::process::id(), ext_of(src)));
    std::fs::copy(src, &dst).unwrap();
    Temp(dst)
}

#[test]
fn spot_words_follow_mockup() {
    // ต้นแบบบรรทัด 992–993 · 1:12:30 – 1:12:41 ภาพแตกเป็นสี่เหลี่ยม 11 วินาที · 1:58:02 เสียงเงียบหายไป 2 วินาที
    let v = Spot { start: 4350.0, end: 4361.0, video: true, audio: false };
    let a = Spot { start: 7082.0, end: 7084.0, video: false, audio: true };
    let both = Spot { start: 30.0, end: 30.3, video: true, audio: true };
    assert_eq!(spot_what(&v), "ภาพแตกเป็นสี่เหลี่ยม 11 วินาที");
    assert_eq!(spot_what(&a), "เสียงเงียบหายไป 2 วินาที");
    assert_eq!(spot_what(&both), "ภาพแตกเป็นสี่เหลี่ยมและเสียงเงียบหายไป 1 วินาที");
}

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

#[test]
fn reads_ebml_sizes_including_unknown_and_8_byte() {
    // ขนาด 1 ไบต์ · 8 ไบต์ (ไม่ทำให้เลื่อนบิตล้น) · ค่าพิเศษไม่ระบุขนาด
    assert_eq!(vint(&[0x81], 0), Some((1, 1, false)));
    assert_eq!(vint(&[0x01, 0, 0, 0, 0, 0, 0x01, 0x00], 0), Some((256, 8, false)));
    assert_eq!(vint(&[0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF], 0).map(|x| x.2), Some(true));
    assert_eq!(vint(&[0x00], 0), None);
}

#[test]
fn parses_ffprobe_frames_with_attached_errors() {
    // บรรทัดจริงจากไฟล์ทดสอบเสียกลางเรื่อง ข้อความผิดพลาด 2 อันต่อกันในบรรทัดเดียว
    let l = "media_type=video|best_effort_timestamp_time=30.000000|context=h264|level=16context=h264|level=16";
    assert_eq!(parse_frame(l), (true, Some(30.0), true, 2));
    assert_eq!(parse_frame("media_type=audio|best_effort_timestamp_time=0.021000"), (true, Some(0.021), false, 0));
    assert_eq!(parse_frame("media_type=video|best_effort_timestamp_time=N/A|context=hevc|level=24"), (true, None, true, 0));
    // ข้อความอันที่สองขึ้นบรรทัดใหม่ ไม่มี media_type ยังนับ
    assert_eq!(parse_frame("context=h264|level=16"), (false, None, false, 1));
    assert_eq!(parse_frame("[h264 @ 0000] error while decoding"), (false, None, false, 0));
}

#[test]
fn tells_video_audio_and_container_errors_apart() {
    // บรรทัดจริงจาก ffmpeg กับไฟล์ทดสอบเสียกลางเรื่อง
    assert_eq!(error_kind("[in#0/matroska,webm @ 0000022b6b2a2ac0] 0x00 at pos 24464080 (0x1754ad0) invalid as first byte of an EBML number"), Some((true, true)));
    assert_eq!(error_kind("[h264 @ 0000022b6b37c280] Invalid level prefix"), Some((true, false)));
    assert_eq!(error_kind("[aac @ 0000] Input buffer exhausted before END element found"), Some((false, true)));
    assert_eq!(error_kind("[aist#0:1/opus @ 0000] Error submitting packet to decoder"), Some((false, true)));
    assert_eq!(error_kind("[vist#0:0/hevc @ 0000] Decoding error"), Some((true, false)));
    assert_eq!(error_kind("Error while decoding stream #0:0: Invalid data found when processing input"), Some((true, true)));
    // บรรทัดความคืบหน้าไม่ใช่ข้อความผิดพลาด
    for l in ["out_time_us=28821333", "progress=continue", "stream_0_0_q=-0.0", "speed=41.2x", "speed= 100x", "speed=  95x", "bitrate=N/A", ""] {
        assert_eq!(error_kind(l), None, "{l}");
    }
    assert_eq!(byte_pos("[in#0/matroska,webm @ 0000] 0x00 at pos 24464080 (0x1754ad0) invalid as first byte"), Some(24464080));
    assert_eq!(byte_pos("[h264 @ 0000] Invalid level prefix"), None);
}

#[test]
fn seek_args_for_each_player() {
    let f = Path::new("D:/หนัง/เรื่อง.mkv");
    let s = |p: &str| seek_args(Path::new(p), f, 4350.7).map(|v| v.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>());
    assert_eq!(s("C:/Program Files/VideoLAN/VLC/vlc.exe").unwrap(), vec!["--start-time=4350", "D:/หนัง/เรื่อง.mkv"]);
    assert_eq!(s("C:/x/mpc-hc64.exe").unwrap(), vec!["D:/หนัง/เรื่อง.mkv", "/start", "4350000"]);
    assert_eq!(s("C:/x/PotPlayerMini64.exe").unwrap(), vec!["D:/หนัง/เรื่อง.mkv", "/seek=01:12:30"]);
    assert_eq!(s("C:/x/mpv.exe").unwrap(), vec!["--start=4350", "D:/หนัง/เรื่อง.mkv"]);
    assert!(s("C:/x/wmplayer.exe").is_none());
}

#[test]
fn asks_windows_for_the_default_app() {
    // นามสกุลที่ไม่มีโปรแกรมเปิด = ไม่มี · .msc Windows ทุกเครื่องเปิดด้วย mmc.exe
    let none = crate::app::winutil::default_app_for(".ไม่มีนามสกุลนี้");
    assert!(none.is_none(), "นามสกุลที่ไม่มีโปรแกรมเปิด ได้ {none:?}");
    let mmc = crate::app::winutil::default_app_for(".msc").expect("Windows ต้องบอกโปรแกรมที่เปิด .msc ได้");
    assert!(mmc.file_name().unwrap().to_string_lossy().eq_ignore_ascii_case("mmc.exe"), "{}", mmc.display());
    // โปรแกรมหลักของ .mkv ในเครื่องนี้ (จดไว้ดูในผลเทส ไม่ได้บังคับว่าต้องมี)
    eprintln!("โปรแกรมหลักของ .mkv ในเครื่องนี้ {:?}", crate::app::winutil::default_app_for(".mkv"));
}

#[test]
fn structure_of_test_files() {
    for (name, want) in [
        ("ดาวเหนือ (2023).mkv", "ครบ"), ("Harbor Lights (2021).mkv", "ครบ"), ("ฝนแรก (2025).webm", "ครบ"),
        ("The Last Orchard (2022).mp4", "ครบ"), ("Paper Moons (2018).mov", "ครบ"), ("Silent Atlas (2016).m4v", "ครบ"),
        ("Iron Tide (2024).avi", "ครบ"), ("Clip (2015).flv", "ครบ"), ("ขาดท้าย (2022).mkv", "ขาดท้าย"),
        ("บ้านริมคลอง (2017).ts", "ไม่รู้"), ("Old Disc (2001).vob", "ไม่รู้"),
    ] {
        let Some(p) = media(name) else { return };
        let got = match structure(&p).unwrap() {
            Structure::Complete => "ครบ",
            Structure::Truncated(_) => "ขาดท้าย",
            Structure::Unknown(_) => "ไม่รู้",
            Structure::Broken(w) => panic!("{name} โครงเสีย {w}"),
        };
        assert_eq!(got, want, "{name}");
    }
}

#[test]
fn structure_catches_cut_copies_of_every_reliable_type() {
    // ตัดสำเนาเหลือ 70% ทุกชนิดที่หัวไฟล์บอกขนาด ต้องขึ้นว่าขาดท้าย
    for name in ["ดาวเหนือ (2023).mkv", "ฝนแรก (2025).webm", "The Last Orchard (2022).mp4", "Paper Moons (2018).mov", "Iron Tide (2024).avi", "Clip (2015).flv"] {
        let Some(p) = media(name) else { return };
        let t = copy_of(&p, "cut");
        let len = std::fs::metadata(&t.0).unwrap().len();
        std::fs::OpenOptions::new().write(true).open(&t.0).unwrap().set_len(len * 7 / 10).unwrap();
        assert!(matches!(structure(&t.0).unwrap(), Structure::Truncated(_)), "{name} ตัดแล้วต้องขึ้นว่าขาดท้าย");
    }
}

#[test]
fn quick_check_detects_one_changed_byte() {
    let Some(p) = media("ดาวเหนือ (2023).mkv") else { return };
    let t = copy_of(&p, "quick");
    let no = || false;
    // ครั้งแรกไม่มีค่าเดิม จดค่าใหม่
    let first = quick(&t.0, None, false, &|_| {}, &no).unwrap().unwrap();
    assert_eq!(first.result, "ok");
    let sha = first.sha256.clone().unwrap();
    // ไม่ได้แก้ ตรงกับค่าเดิม
    assert_eq!(quick(&t.0, Some(&sha), false, &|_| {}, &no).unwrap().unwrap().result, "ok");
    // แก้ 1 ไบต์กลางไฟล์ ขนาดเท่าเดิม โครงยังครบ ต้องขึ้นว่าไฟล์ถูกเปลี่ยน และไม่ทับค่าเดิม
    let mut b = std::fs::read(&t.0).unwrap();
    let mid = b.len() / 2;
    b[mid] ^= 0xFF;
    std::fs::write(&t.0, &b).unwrap();
    let changed = quick(&t.0, Some(&sha), false, &|_| {}, &no).unwrap().unwrap();
    assert_eq!(changed.result, "changed");
    assert!(changed.sha256.is_none(), "ไฟล์ถูกเปลี่ยนต้องคงค่า hash เดิมไว้เทียบ");
    // ขาดท้ายจับได้ตั้งแต่ตรวจแบบเร็ว
    let Some(cut) = media("ขาดท้าย (2022).mkv") else { return };
    let r = quick(&cut, None, false, &|_| {}, &no).unwrap().unwrap();
    assert_eq!(r.result, "bad");
    assert!(r.summary.contains("ขาดท้าย"), "{}", r.summary);
    // กดหยุดระหว่างคิด hash คืน None
    assert!(quick(&t.0, None, false, &|_| {}, &|| true).unwrap().is_none());
}

/// AUDIT 12 พ.ย. 2569 ข้อ 29 · ข้อความอ่านดิสก์ไม่ได้ไม่ใช่จุดเสีย · รอบสองกับไฟล์ที่เปิดไม่ได้เป็นข้อผิดพลาด ไม่ใช่ผลว่าง
#[test]
fn disk_errors_are_not_damage() {
    for l in ["[in#0/matroska,webm @ 000001] Error during demuxing: Input/output error", "Error reading file: I/O error", "av_read_frame(): Error number -5 occurred", "[file @ 0x1] Permission denied"] {
        assert!(io_error(l), "{l} ต้องนับเป็นอ่านดิสก์ไม่ได้");
    }
    for l in ["[h264 @ 0x1] corrupt decoded frame", "[aac @ 0x2] Number of bands exceeds limit", "[in#0/matroska,webm @ 0x3] 0x00 at pos 123 invalid as first byte of an EBML number"] {
        assert!(!io_error(l), "{l} เป็นไฟล์เสีย ไม่ใช่อ่านดิสก์ไม่ได้");
    }
    let gone = std::env::temp_dir().join(format!("movie-shelf-ไม่มีไฟล์นี้-{}.mkv", std::process::id()));
    assert_eq!(exact_pass(&tools(), &gone, 0.0, 10.0).err().as_deref(), Some(IO_FAIL), "เปิดไฟล์ไม่ได้ต้องเป็นตรวจไม่ได้");
}

/// AUDIT 12 พ.ย. 2569 ข้อ 28 · ไฟล์ที่ตรวจโครงไม่ได้ (VOB MPEG) ตรวจแบบเร็วต้องไม่ได้ ok สีเขียว และข้อความต้องไม่บอกว่าโครงไฟล์ครบ
/// เคยตรวจละเอียดว่าสมบูรณ์แล้วค่า hash ยังตรง ถึงนับว่าสมบูรณ์ · ค่า hash ไม่ตรงยังเป็นไฟล์ถูกเปลี่ยนเหมือนเดิม
#[test]
fn quick_check_of_unreadable_structure_is_partial() {
    let no = || false;
    for name in ["Old Disc (2001).vob", "Night Market (2014).mpeg"] {
        let Some(p) = media(name) else { return };
        assert!(matches!(structure(&p).unwrap(), Structure::Unknown(_)), "{name} ต้องตรวจโครงไม่ได้");
        let first = quick(&p, None, false, &|_| {}, &no).unwrap().unwrap();
        assert_eq!(first.result, "partial", "{name} {}", first.summary);
        assert!(!first.summary.contains("โครงไฟล์ครบ"), "{name} ห้ามบอกว่าโครงไฟล์ครบ {}", first.summary);
        assert!(first.summary.contains("ควรตรวจละเอียด") && first.sha256.is_some(), "{name} {}", first.summary);
        let sha = first.sha256.clone().unwrap();
        // ยังไม่เคยตรวจละเอียด ค่า hash ตรงก็ยังตรวจได้บางส่วน
        assert_eq!(quick(&p, Some(&sha), false, &|_| {}, &no).unwrap().unwrap().result, "partial", "{name}");
        // เคยตรวจละเอียดว่าสมบูรณ์ ค่า hash ตรง นับว่าสมบูรณ์ และไม่บอกว่าโครงไฟล์ครบ
        let ok = quick(&p, Some(&sha), true, &|_| {}, &no).unwrap().unwrap();
        assert_eq!(ok.result, "ok", "{name} {}", ok.summary);
        assert!(!ok.summary.contains("โครงไฟล์ครบ"), "{name} {}", ok.summary);
        // ค่า hash ไม่ตรง เป็นไฟล์ถูกเปลี่ยน แม้เคยตรวจละเอียด
        assert_eq!(quick(&p, Some("00"), true, &|_| {}, &no).unwrap().unwrap().result, "changed", "{name}");
    }
    // ครั้งก่อนสมบูรณ์จากตรวจละเอียด หรือจากตรวจแบบเร็วที่ต่อมาจากตรวจละเอียด · ตรวจแบบเร็วธรรมดาไม่นับ
    assert!(prev_full_ok(Some(&json!({ "mode": "full", "result": "ok" }))));
    assert!(prev_full_ok(Some(&json!({ "mode": "quick", "result": "ok", "basis": "full" }))));
    assert!(!prev_full_ok(Some(&json!({ "mode": "quick", "result": "ok" }))));
    assert!(!prev_full_ok(Some(&json!({ "mode": "full", "result": "bad" }))));
    assert!(!prev_full_ok(None));
}

/// เวลาจริงของจุดเสียที่ make-test-media.mjs ทำไว้ อ่านจาก json ข้างไฟล์
fn broken_window() -> Option<(f64, f64)> {
    let p = media("เสียกลางเรื่อง (2022).json")?;
    let j: Value = serde_json::from_slice(&std::fs::read(p).unwrap()).unwrap();
    Some((j["วินาทีเริ่ม"].as_f64().unwrap(), j["วินาทีจบ"].as_f64().unwrap()))
}

#[test]
fn deep_check_finds_broken_spot_within_five_seconds() {
    let Some(p) = media("เสียกลางเรื่อง (2022).mkv") else { return };
    let Some((from, to)) = broken_window() else { return };
    let r = deep(&tools(), &p, Some(60.0), &|_| {}, &|| false).unwrap().unwrap();
    assert_eq!(r.result, "bad", "{}", r.summary);
    let first = r.spans.iter().find(|s| s.get("tail").is_none()).expect("ต้องมีช่วงที่เสีย");
    let at = first["from"].as_f64().unwrap();
    assert!(at >= from - 5.0 && at <= to + 5.0, "เวลาที่บอก {at} ห่างจากจุดจริง {from}–{to} เกิน 5 วินาที");
    assert!(r.summary.contains("0:30"), "{}", r.summary);
    assert!(r.sha256.is_none());
}

#[test]
fn deep_check_finds_truncated_and_passes_good_file() {
    let Some(cut) = media("ขาดท้าย (2022).mkv") else { return };
    let r = deep(&tools(), &cut, Some(60.021), &|_| {}, &|| false).unwrap().unwrap();
    assert_eq!(r.result, "bad");
    // บอกว่าเล่นได้ถึงไหน · จุดที่ไฟล์ถูกตัดไม่นับเป็นจุดเสียแยก (เดิมได้ 0:40 บ้าง 0:35 บ้าง)
    assert!(r.summary.contains("ไฟล์ขาดท้าย เล่นได้ถึง") && r.summary.contains("จากความยาว 1:00"), "{}", r.summary);
    assert!(r.spans.iter().all(|s| s.get("tail").is_some()), "{:?}", r.spans);
    let Some(good) = media("ดาวเหนือ (2023).mkv") else { return };
    let len = crate::media::probe::probe(&tools(), &good).ok().and_then(|x| x.duration);
    let pct = Mutex::new(Vec::new());
    let ok = deep(&tools(), &good, len, &|p| pct.lock().unwrap().push(p), &|| false).unwrap().unwrap();
    assert_eq!(ok.result, "ok", "{}", ok.summary);
    assert!(ok.sha256.is_some(), "ตรวจละเอียดผ่านต้องจดค่า hash");
    let pct = pct.into_inner().unwrap();
    assert!(pct.windows(2).all(|w| w[1] >= w[0] - 0.001), "ความคืบหน้าต้องไม่ถอยหลัง");
    // กดหยุดกลางทาง คืน None และ ffprobe ถูกปิด
    assert!(deep(&tools(), &good, len, &|_| {}, &|| true).unwrap().is_none());
}
