//! เทสของ encode.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use serde_json::json;
use std::path::PathBuf;

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn av(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("เสียงซับ").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}
fn spec(codec: &str, encoder: &str, p: Value) -> EncodeSpec {
    EncodeSpec { codec: codec.into(), encoder: encoder.into(), p: p.as_object().cloned().unwrap_or_default(), ..Default::default() }
}

#[test]
fn commands_follow_cards() {
    let s = spec("opus", "native", json!({"bitrate": 160, "mode": "VBR", "comp": 10, "framesize": "20 ms", "tune": "Music"}));
    let p = build(&s, "M.mkv", 2, "O.opus", Some(6), None).unwrap();
    assert!(p.piped);
    assert_eq!(p.steps[1].args.join(" "), "--quiet --ignorelength --bitrate 160 --vbr --comp 10 --framesize 20 --music - O.opus");
    assert!(p.steps[0].args.join(" ").contains("-map 0:2 -vn -sn -dn -c:a pcm_s24le -f wav -"), "{:?}", p.steps[0].args);
    // MP3 5.1 รวมเป็น 2 ช่อง · lame รับ 16 บิต
    let m = build(&spec("mp3", "native", json!({"mode": "VBR", "vbrq": 0, "quality": 2, "stereo": "Joint stereo"})), "M.mkv", 1, "O.mp3", Some(6), None).unwrap();
    assert!(m.steps[0].args.join(" ").contains("-ac 2"), "{:?}", m.steps[0].args);
    assert_eq!(m.steps[1].args.join(" "), "--quiet -V 0 -q 2 -m j - O.mp3");
    // FLAC ลด 16 บิตพร้อม dither
    let mut f = spec("flac", "native", json!({"level": 8, "threads": 4, "verify": "On"}));
    f.bits = Some(16);
    let fp = build(&f, "M.mkv", 1, "O.flac", Some(2), None).unwrap();
    assert!(fp.steps[0].args.join(" ").contains("aresample=osf=s16:dither_method=triangular -c:a pcm_s16le"), "{:?}", fp.steps[0].args);
    assert_eq!(fp.steps[1].args.join(" "), "--silent --ignore-chunk-sizes -8 -j 4 -V - -o O.flac");
    // AC-3 ffmpeg ล้วน ความเร็ว 25 → 23.976 กับ Gain −3 dB กับ loudnorm
    let mut a = spec("ac3", "ffmpeg", json!({"bitrate": 640, "dialnorm": -31, "cmix": "−3 dB", "smix": "Off", "room": "Large"}));
    a.speed = Some([25.0, 23.976]);
    a.gain = -3.0;
    a.loudnorm = true;
    let ap = build(&a, "M.mkv", 1, "O.ac3", Some(6), None).unwrap();
    let s = ap.steps[0].args.join(" ");
    assert!(!ap.piped);
    assert!(s.contains("-af rubberband=tempo=0.959040:pitch=0.959040,volume=-3dB,loudnorm=I=-23:TP=-1"), "ค่าตั้งต้นคืนระดับเสียง {s}");
    a.keep_pitch = true;
    assert!(build(&a, "M.mkv", 1, "O.ac3", Some(6), None).unwrap().steps[0].args.join(" ").contains("-af rubberband=tempo=0.959040,volume=-3dB"), "คงระดับเสียง ยืดเวลาอย่างเดียว");
    a.keep_pitch = false;
    assert!(s.contains("-c:a ac3 -b:a 640k -dialnorm -31 -center_mixlev 0.707 -surround_mixlev 0.000 -mixing_level 105 -room_type large -n O.ac3"), "{s}");
    assert!(ap.text.starts_with("ffmpeg -hide_banner"), "{}", ap.text);
    // WavPack โหมด High extra 4 verify
    let al = build(&spec("alac", "native", json!({"speed": "Fast"})), "M.mkv", 1, "O.m4a", Some(2), Some(16)).unwrap();
    assert_eq!(al.steps[1].tool, "refalac64");
    assert_eq!(al.steps[1].args, ["--silent", "--ignorelength", "--fast", "-", "-o", "O.m4a"]);
    assert!(al.steps[0].args.contains(&"pcm_s16le".to_string()), "ต้นทาง 16 บิต ส่ง 16 บิตครบ {:?}", al.steps[0].args);
    let af = build(&spec("alac", "ffmpeg", json!({})), "M.mkv", 1, "O.m4a", Some(2), None).unwrap();
    assert!(af.steps.len() == 1 && af.steps[0].args.windows(2).any(|w| w == ["-c:a", "alac"]) && !af.steps[0].args.contains(&"-compression_level".to_string()), "{:?}", af.steps[0].args);
    assert_eq!(spec("alac", "native", json!({})).ext(), "m4a");
    let w = build(&spec("wv", "native", json!({"mode": "High", "extra": 4, "verify": "On"})), "M.mkv", 1, "O.wv", Some(2), None).unwrap();
    assert_eq!(w.steps[1].args.join(" "), "-q -i -h -x4 -v - -o O.wv");
    // คำสั่งที่แสดงใส่เครื่องหมายคำพูดให้ชื่อที่มีเว้นวรรค
    let t = build(&spec("opus", "ffmpeg", json!({"bitrate": 128})), "D:\\หนัง\\ดาวตก (2024).mkv", 1, "เสียง 1.opus", None, None).unwrap();
    assert!(t.text.contains("\"D:\\หนัง\\ดาวตก (2024).mkv\""), "{}", t.text);
    // ชนิดที่ไม่รู้จักสร้างคำสั่งไม่ได้ · Monkey's Audio กับ TAK ใช้ได้แล้ว (ขั้น 8 หน้าแปลงเสียง)
    assert!(build(&spec("tta", "native", json!({})), "M", 1, "O", None, None).is_err());
    let ape = build(&spec("ape", "native", json!({"level": "Extra High"})), "M.flac", 0, "O.ape", Some(2), Some(16)).unwrap();
    assert_eq!(ape.steps[1].tool, "MACDll64");
    assert!(ape.steps[1].args.join(" ").starts_with("--level 4000 --threads "), "{:?}", ape.steps[1].args);
    assert!(ape.steps[0].args.join(" ").ends_with("-c:a pcm_s16le -f wav -"), "ต้นทาง 16 บิตส่ง 16 บิต {:?}", ape.steps[0].args);
    let tak = build(&spec("tak", "native", json!({"preset": 4, "eval": "Max"})), "M.flac", 0, "O.tak", Some(2), None).unwrap();
    assert_eq!(tak.steps[1].args.join(" "), "-e -p4m -ihs - O.tak");
    assert!(tak.steps[0].args.join(" ").ends_with("-c:a pcm_s24le -f wav -"));
}

/// ความลึกบิต · ต้นทาง 16 บิตตามต้นฉบับได้ 16 บิต ไม่ใส่ dither · ลดจาก 24 เป็น 16 ใส่ dither · Lowpass · Block size · HE-AAC กับ TVBR
#[test]
fn bit_depth_lowpass_block() {
    let f = spec("flac", "native", json!({"level": 5}));
    let a16 = build(&f, "M.mkv", 1, "O.flac", Some(2), Some(16)).unwrap();
    let ff = a16.steps[0].args.join(" ");
    assert!(ff.contains("-c:a pcm_s16le") && !ff.contains("dither"), "ต้นทาง 16 บิต {ff}");
    let a24 = build(&f, "M.mkv", 1, "O.flac", Some(2), Some(24)).unwrap();
    assert!(a24.steps[0].args.join(" ").contains("-c:a pcm_s24le"));
    let lossy_src = build(&f, "M.mkv", 1, "O.flac", Some(6), None).unwrap();
    assert!(lossy_src.steps[0].args.join(" ").contains("-c:a pcm_s24le"), "ไม่รู้บิต (เสียคุณภาพ ถอดเป็นทศนิยม) ส่ง 24 บิต");
    let mut d = f.clone();
    d.bits = Some(16);
    let down = build(&d, "M.mkv", 1, "O.flac", Some(2), Some(24)).unwrap().steps[0].args.join(" ");
    assert!(down.contains("dither_method=triangular -c:a pcm_s16le"), "{down}");
    let same = build(&d, "M.mkv", 1, "O.flac", Some(2), Some(16)).unwrap().steps[0].args.join(" ");
    assert!(!same.contains("dither"), "16 เป็น 16 ไม่ใส่ dither {same}");
    let mut up = f.clone();
    up.bits = Some(24);
    assert!(build(&up, "M.mkv", 1, "O.flac", Some(2), Some(16)).unwrap().steps[0].args.join(" ").contains("pcm_s24le"), "เลือก 24 บิตเอง");
    // ffmpeg ล้วน ต้นทาง 16 บิต
    let fw = build(&spec("wv", "ffmpeg", json!({"mode": "Normal"})), "M.mkv", 1, "O.wv", Some(2), Some(16)).unwrap();
    assert!(fw.steps[0].args.join(" ").contains("-sample_fmt s16p"));
    // Opus ไม่สนบิตต้นทาง
    assert!(build(&spec("opus", "native", json!({})), "M.mkv", 1, "O.opus", Some(2), Some(16)).unwrap().steps[0].args.join(" ").contains("pcm_s24le"));
    // Block size
    let b = build(&spec("flac", "native", json!({"level": 8, "threads": 2, "block": 4608, "verify": "Off"})), "M.mkv", 1, "O.flac", Some(2), None).unwrap();
    assert_eq!(b.steps[1].args.join(" "), "--silent --ignore-chunk-sizes -8 -j 2 -b 4608 - -o O.flac");
    let ba = build(&spec("flac", "native", json!({"level": 8, "block": "Auto"})), "M.mkv", 1, "O.flac", Some(2), None).unwrap();
    assert!(!ba.steps[1].args.contains(&"-b".to_string()));
    assert!(build(&spec("flac", "ffmpeg", json!({"block": 4096})), "M.mkv", 1, "O.flac", Some(2), None).unwrap().steps[0].args.join(" ").contains("-frame_size 4096"));
    // Lowpass
    let l = build(&spec("mp3", "native", json!({"mode": "VBR", "vbrq": 2, "quality": 3, "lowpass": 19000})), "M.mkv", 1, "O.mp3", Some(2), None).unwrap();
    assert_eq!(l.steps[1].args.join(" "), "--quiet -V 2 -q 3 -m j --lowpass 19 - O.mp3");
    assert!(build(&spec("mp3", "ffmpeg", json!({"lowpass": 18000})), "M.mkv", 1, "O.mp3", Some(2), None).unwrap().steps[0].args.join(" ").contains("-cutoff 18000"));
    let q = build(&spec("aac", "qaac", json!({"mode": "CVBR", "bitrate": 96, "profile": "HE-AAC", "quality": 2, "lowpass": 16000})), "M.mkv", 1, "O.m4a", Some(2), None).unwrap();
    assert_eq!(q.steps[1].args.join(" "), "--silent --ignorelength --cvbr 96 --he --quality 2 --lowpass 16000 - -o O.m4a");
    let qt = build(&spec("aac", "qaac", json!({"mode": "TVBR", "tvbr": 91, "profile": "HE-AAC"})), "M.mkv", 1, "O.m4a", Some(2), None).unwrap();
    assert!(!qt.steps[1].args.contains(&"--he".to_string()), "TVBR ส่ง --he ไม่ได้ qaac ฟ้อง");
    // HE-AAC ต้นทาง 96 kHz ลดเป็น 48 kHz ที่ ffmpeg ก่อน (qaac รับเกิน 48 kHz ไม่ได้) · 44.1 kHz กับ AAC-LC ไม่แตะ
    let he96 = |profile: &str, rate: u32| { let mut s = spec("aac", "qaac", json!({"mode": "CVBR", "bitrate": 64, "profile": profile})); s.src_rate = Some(rate); build(&s, "M.flac", 0, "O.m4a", Some(2), None).unwrap().steps[0].args.join(" ") };
    assert!(he96("HE-AAC", 96000).contains("-af aresample=48000"), "{}", he96("HE-AAC", 96000));
    assert!(!he96("HE-AAC", 44100).contains("aresample"));
    assert!(!he96("AAC-LC", 96000).contains("aresample"));
    // ALAC 7.1 ติดป้าย 7.1(wide) ทั้งสองตัวแปลง · 5.1 ไม่แตะ
    for e in ["native", "ffmpeg"] {
        assert!(build(&spec("alac", e, json!({})), "M.mkv", 1, "O.m4a", Some(8), Some(24)).unwrap().steps[0].args.join(" ").contains("channelmap=channel_layout=7.1(wide)"), "{e}");
        assert!(!build(&spec("alac", e, json!({})), "M.mkv", 1, "O.m4a", Some(6), Some(24)).unwrap().steps[0].args.join(" ").contains("channelmap"), "{e}");
    }
    assert!(!build(&spec("aac", "ffmpeg", json!({"bitrate": 192, "lowpass": "Auto"})), "M.mkv", 1, "O.m4a", Some(2), None).unwrap().steps[0].args.contains(&"-cutoff".to_string()));
}

#[test]
fn versions_and_registry() {
    assert_eq!(version_of("flac", "flac 1.5.0\n").as_deref(), Some("1.5.0"));
    assert_eq!(version_of("lame", "LAME 64bits version 4.0 (https://lame.sourceforge.io)").as_deref(), Some("4.0"));
    assert_eq!(version_of("opusenc", "opusenc opus-tools 0.2-52-g5f894e9 (using libopus 1.6.1-11-g788cc89)").as_deref(), Some("libopus 1.6.1"));
    assert_eq!(version_of("wavpack", "wavpack 5.9.0\nlibwavpack 5.9.0").as_deref(), Some("5.9.0"));
    assert_eq!(core_audio_of("qaac 3.07, CoreAudioToolbox 7.10.9.0\r\nlibsoxr-0.1.3").as_deref(), Some("7.10.9.0"));
    assert_eq!(version_of("qaac64", "qaac 3.07, CoreAudioToolbox 7.10.9.0").as_deref(), Some("3.07"));
    assert_eq!(core_audio_of("refalac 3.07"), None);
    assert_eq!(version_of("ffmpeg", "ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026").as_deref(), Some("9.0.2"));
    // โฟลเดอร์ที่ใส่เองว่าง ใช้ตัวที่แนบมา · qaac fdkaac ไม่เจอ
    let empty = std::env::temp_dir().join(format!("movie-shelf-enc-empty-{}", std::process::id()));
    let _ = std::fs::create_dir_all(&empty);
    let st = status(&tools(), &empty);
    let by = |n: &str| st.iter().find(|e| e.name == n).unwrap().clone();
    assert_eq!((by("flac").source.as_str(), by("flac").version.as_deref()), ("bundled", Some("1.5.0")));
    assert_eq!(by("lame").version.as_deref(), Some("4.0"));
    assert_eq!(by("opusenc").version.as_deref(), Some("libopus 1.6.1"));
    assert_eq!((by("qaac64").source.as_str(), by("qaac64").ok), ("missing", false));
    // TAK แตกจาก zip ที่แนบมาเอง ถามรุ่นด้วย -version (เดิม -h ได้รุ่นว่าง)
    assert_eq!(version_of("Takc", "TAKC 2.3.3\n32 bit\n").as_deref(), Some("2.3.3"));
    assert_eq!((by("Takc").source.as_str(), by("Takc").version.as_deref()), ("bundled", Some("2.3.3")));
    assert_eq!(PathBuf::from(&by("Takc").dir), tak_dir(&empty));
    assert!(tak_dir(&empty).join("Readme.html").exists(), "สัญญาอนุญาตของ TAK แตกมาด้วย");
    // วาง flac.exe ไว้โฟลเดอร์ที่ใส่เองโดยไม่มี libFLAC.dll · ตัวที่แนบมายังใช้ได้ ไม่ถูกตัวที่พังแทน
    std::fs::copy(tools().join("flac.exe"), empty.join("flac.exe")).unwrap();
    let st2 = status(&tools(), &empty);
    let f = st2.iter().find(|e| e.name == "flac").unwrap();
    assert_eq!(f.source, "bundled");
    assert_eq!(dir_for(&st2, &tools(), "flac"), tools());
    let _ = std::fs::remove_dir_all(&empty);
}

/// แปลงจริงทุกชนิดกับเสียงอังกฤษของดาวตก (60 วินาที) · ffprobe ชนิดตรง ความยาวตรง บิตเรตใกล้ค่า
#[test]
fn real_encodes() {
    let Some(movie) = av("ดาวตก (2024).mkv") else { return };
    let dir = std::env::temp_dir().join(format!("movie-shelf-encode-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let cases = [
        spec("opus", "native", json!({"bitrate": 128})),
        spec("opus", "ffmpeg", json!({"bitrate": 96})),
        spec("mp3", "native", json!({"mode": "CBR", "bitrate": 192})),
        spec("mp3", "ffmpeg", json!({"mode": "VBR", "vbrq": 2})),
        spec("flac", "native", json!({"level": 5})),
        spec("flac", "ffmpeg", json!({"level": 5})),
        spec("wv", "native", json!({"mode": "Normal"})),
        spec("wv", "ffmpeg", json!({"mode": "Normal"})),
        spec("ac3", "ffmpeg", json!({"bitrate": 384})),
        spec("ac3", "ffmpeg", json!({"bitrate": 448, "room": "Large", "cmix": "−3 dB"})),
        spec("eac3", "ffmpeg", json!({"bitrate": 256})),
        spec("aac", "ffmpeg", json!({"bitrate": 160})),
    ];
    let src = movie.to_string_lossy().to_string();
    for (i, s) in cases.iter().enumerate() {
        let out = dir.join(format!("{i}.{}", s.ext()));
        let plan = build(s, &src, 1, &out.to_string_lossy(), Some(2), None).unwrap();
        let mut seen = 0.0;
        let r = run(&|_| tools(), &plan, Some(60.0), &|| false, &mut |p| seen = p).unwrap();
        assert!(matches!(r, Done::Ok), "{} {} ไม่สำเร็จ {}", s.codec, s.encoder, match r { Done::Failed(m) => m, _ => String::new() });
        assert_eq!(seen, 100.0);
        let j = crate::app::outfile::ffprobe_json(&tools(), &out).unwrap();
        let st = &j["streams"][0];
        assert_eq!(st["codec_name"].as_str(), Some(s.probe_codec()), "{} {}", s.codec, s.encoder);
        let d = crate::app::outfile::duration_of(&j).unwrap();
        assert!((d - 60.0).abs() < 0.2, "{} {} ยาว {d}", s.codec, s.encoder);
        // บิตเรตเป๊ะเฉพาะโหมดบิตเรตคงที่ · VBR ตัวเข้ารหัสใช้บิตตามเนื้อเสียง (เสียงซ่าทดสอบ Opus VBR 96 ได้ราว 62) เช็กแค่ไม่เกิน
        if let Some(k) = s.p.get("bitrate").and_then(|v| v.as_f64()) {
            let size = std::fs::metadata(&out).unwrap().len() as f64;
            let kbps = size * 8.0 / d / 1000.0;
            let cbr = matches!(s.codec.as_str(), "ac3" | "eac3" | "aac") || s.s("mode", "VBR") == "CBR";
            assert!(kbps <= k * 1.35 && (!cbr || (kbps - k).abs() / k < 0.35), "{} {} บิตเรต {kbps:.0} ตั้ง {k}", s.codec, s.encoder);
        }
    }
    // ความเร็ว 25 → 23.976 ยืดเสียง 57.57 วินาทีให้ยาว 60 วินาที
    let pal = av("ดาวตก (2024) PAL 25fps.ac3").unwrap();
    let mut s = spec("flac", "native", json!({"level": 5}));
    s.speed = Some([25.0, 23.976]);
    let out = dir.join("pal.flac");
    let plan = build(&s, &pal.to_string_lossy(), 0, &out.to_string_lossy(), Some(2), None).unwrap();
    assert!(matches!(run(&|_| tools(), &plan, Some(57.6), &|| false, &mut |_| {}).unwrap(), Done::Ok));
    let d = crate::app::outfile::duration_of(&crate::app::outfile::ffprobe_json(&tools(), &out).unwrap()).unwrap();
    assert!((d - 60.03).abs() < 0.1, "ยืดแล้วยาว {d}");
    // ระดับเสียง · เสียงทดสอบ 1,000 Hz 3 วินาที เปลี่ยน 25 → 23.976 · คืนระดับเสียงได้ราว 959 Hz (เหมือนหมุนแผ่นช้าลง) คงระดับเสียงได้ 1,000 Hz · ยาว 3.128 วินาทีทั้งคู่
    // (ข้อ 29 · นับจุดที่คลื่นตัดศูนย์จากเสียงดิบที่ถอดกลับ)
    let tone = dir.join("tone1k.wav");
    let tp = tone.to_string_lossy().to_string();
    let _ = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=48000:duration=3", "-c:a", "pcm_s16le", tp.as_str()]);
    let freq_of = |p: &std::path::Path| -> (f64, f64) {
        let o = crate::app::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), p.as_os_str(), OsStr::new("-ac"), OsStr::new("1"), OsStr::new("-f"), OsStr::new("s16le"), OsStr::new("-")]).unwrap();
        let s: Vec<i16> = o.stdout.chunks_exact(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
        // ตัดหัวท้าย 0.3 วินาที (ตัวยืดเสียงเริ่มกับจบไม่นิ่ง)
        let cut = &s[14400.min(s.len())..s.len().saturating_sub(14400)];
        let ups = cut.windows(2).filter(|w| w[0] < 0 && w[1] >= 0).count() as f64;
        (ups / (cut.len() as f64 / 48000.0), s.len() as f64 / 48000.0)
    };
    for (keep, want) in [(false, 959.04), (true, 1000.0)] {
        let mut s = spec("flac", "native", json!({"level": 5}));
        s.speed = Some([25.0, 23.976]);
        s.keep_pitch = keep;
        let out = dir.join(format!("tone-{keep}.flac"));
        let plan = build(&s, &tone.to_string_lossy(), 0, &out.to_string_lossy(), Some(1), Some(16)).unwrap();
        assert!(matches!(run(&|_| tools(), &plan, Some(3.0), &|| false, &mut |_| {}).unwrap(), Done::Ok));
        let (hz, secs) = freq_of(&out);
        assert!((hz - want).abs() < 4.0, "คงระดับเสียง {keep} ได้ {hz:.1} Hz ควรราว {want}");
        assert!((secs - 3.128).abs() < 0.03, "คงระดับเสียง {keep} ยาว {secs:.3} วินาที");
    }
    // ต้นทาง WAV 16 บิต แปลงเป็น FLAC ตามต้นฉบับ ต้องได้ 16 บิต · ไม่บอกบิตต้นทาง (แบบเดิมก่อนแก้) ได้ 24 บิต ไฟล์ใหญ่ขึ้นเปล่า ๆ
    if let Some(wav) = av("เพลงทดสอบ.wav") {
        let wav = wav.to_string_lossy().to_string();
        let bits_of = |p: &std::path::Path| {
            let j = crate::app::outfile::ffprobe_json(&tools(), p).unwrap();
            j["streams"][0]["bits_per_raw_sample"].as_str().and_then(|s| s.parse::<u32>().ok())
                .or_else(|| match j["streams"][0]["sample_fmt"].as_str() { Some("s16") => Some(16), Some("s32") => Some(24), _ => None })
        };
        for (name, bits, want) in [("w16.flac", Some(16), 16), ("w-old.flac", None, 24)] {
            let out = dir.join(name);
            let plan = build(&spec("flac", "native", json!({"level": 5})), &wav, 0, &out.to_string_lossy(), Some(2), bits).unwrap();
            assert!(matches!(run(&|_| tools(), &plan, Some(30.0), &|| false, &mut |_| {}).unwrap(), Done::Ok));
            assert_eq!(bits_of(&out), Some(want), "{name}");
        }
    }
    // กดหยุด
    let out = dir.join("stop.flac");
    let plan = build(&spec("flac", "native", json!({})), &src, 1, &out.to_string_lossy(), Some(2), None).unwrap();
    assert!(matches!(run(&|_| tools(), &plan, Some(60.0), &|| true, &mut |_| {}).unwrap(), Done::Cancelled));
    let _ = std::fs::remove_dir_all(&dir);
}
