//! เทสของ convert.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use serde_json::json;

#[test]
fn tags_from_id3_flac_and_ogg_names() {
    let id3 = json!({"title": "ฝนแรก", "artist": "วง", "album_artist": "รวม", "track": "3/10", "TXXX": "x", "REPLAYGAIN_TRACK_GAIN": "-6.80 dB", "encoder": "Lavf"});
    let t = canon_tags(&id3);
    assert_eq!(t.iter().map(|x| x.key.as_str()).collect::<Vec<_>>(), ["title", "artist", "album_artist", "track", "replaygain_track_gain"]);
    let vorbis = json!({"TITLE": "A", "ALBUMARTIST": "B", "TRACKNUMBER": "2", "DATE": "2025", "DESCRIPTION": "c"});
    let t = canon_tags(&vorbis);
    assert_eq!(t, vec![
        Tag { key: "title".into(), value: "A".into() }, Tag { key: "album_artist".into(), value: "B".into() },
        Tag { key: "date".into(), value: "2025".into() }, Tag { key: "track".into(), value: "2".into() }, Tag { key: "comment".into(), value: "c".into() },
    ]);
    assert_eq!(ape_key("date"), "Year");
    assert_eq!(ape_key("replaygain_album_gain"), "REPLAYGAIN_ALBUM_GAIN");
    assert_eq!(vorbis_key("track"), "TRACKNUMBER");
}

#[test]
fn remux_keeps_audio_and_copies_tags_and_cover() {
    let f = AudioFile {
        path: "a.flac".into(), name: "a.flac".into(), size: 1, duration: 1.0, audio_only: true, stream: 0, codec: "flac".into(), profile: String::new(),
        layout: "2.0".into(), channels: 2, rate: 48000, bits: Some(24), bitrate: None, tags: vec![], tags_in_stream: false,
        cover: Some(CoverInfo { codec: "mjpeg".into(), width: 10, height: 10, stream: 1 }), track: 0, tracks: 1,
    };
    let a = remux_args("enc.mp3", "a.flac", "out.mp3", "mp3", &f, true).join(" ");
    assert!(a.contains("-map 0:a:0 -map 1:1 -c copy -map_metadata 1 -disposition:v:0 attached_pic"), "{a}");
    assert!(a.ends_with("-id3v2_version 3 -n out.mp3"), "{a}");
    let mut g = f.clone();
    g.tags_in_stream = true;
    assert!(remux_args("e", "s", "o", "flac", &g, false).join(" ").contains("-map_metadata 1:s:0 -n o"));
}

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

/// FLAC ทดสอบมีแท็กกับปก (make-test-media) · แปลงเป็น Monkey's Audio ผ่าน DLL จริง แท็กกับปกติดไป
#[test]
fn flac_to_ape_with_tags_and_cover_real() {
    let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
    let f = probe(&tools(), &src).unwrap();
    assert!(!f.tags.is_empty() && f.cover.is_some(), "ไฟล์ทดสอบต้องมีแท็กกับปก {:?}", f.tags);
    let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("ape.ape");
    let spec = EncodeSpec { codec: "ape".into(), p: json!({"level": "High"}).as_object().cloned().unwrap(), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    assert_eq!(plan.steps[1].tool, "MACDll64");
    assert!(plan.steps[1].args.contains(&"3000".to_string()));
    let mut last = 0.0;
    let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |p| last = p).unwrap();
    assert!(matches!(r, encode::Done::Ok), "แปลงสำเร็จ");
    assert_eq!(last, 100.0);
    let cover = cover_bytes(&tools(), &src, f.cover.as_ref().unwrap().stream).unwrap();
    let mut items: Vec<crate::audio::ape::ApeItem> = f.tags.iter().map(|t| crate::audio::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
    let mut v = b"cover.jpg\0".to_vec();
    v.extend_from_slice(&cover);
    items.push(crate::audio::ape::ApeItem { key: "Cover Art (Front)".into(), value: v, binary: true });
    crate::audio::ape::append_tag(&out, &items).unwrap();
    let g = probe(&tools(), &out).unwrap();
    assert_eq!(g.codec, "ape");
    assert_eq!(g.channels, f.channels);
    assert_eq!(g.rate, f.rate);
    assert!((g.duration - f.duration).abs() < 0.1, "ยาว {} เทียบ {}", g.duration, f.duration);
    assert_eq!(g.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), f.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), "ชื่อเพลงภาษาไทยติดไป");
    assert!(g.cover.is_some(), "รูปปกติดไป");
    // ถอดกลับได้เสียงตรงต้นฉบับทุกตัวอย่าง (เทียบ MD5 ของเสียงดิบ)
    let md5 = |p: &Path| {
        let o = crate::app::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), p.as_os_str(), OsStr::new("-map"), OsStr::new("0:a:0"), OsStr::new("-c:a"), OsStr::new("pcm_s24le"), OsStr::new("-f"), OsStr::new("md5"), OsStr::new("-")]).unwrap();
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    };
    assert_eq!(md5(&out), md5(&src), "ไม่เสียคุณภาพ");
    let _ = std::fs::remove_dir_all(&dir);
}

/// AUDIT 12 พ.ย. 2569 ข้อ 22 หนังดาวเหนือมีเสียงไทย AAC 1 ช่องเป็นแทร็กแรก เสียงอังกฤษ AC-3 5.1 เป็นแทร็กที่สอง
/// ขอแทร็กที่สองต้องได้สตรีม 2 และแปลงออกมาได้ 6 ช่อง · เดิมได้แทร็กแรกเสมอ · ขอแทร็กที่ไม่มีต้องบอกว่ามีกี่แทร็ก
#[test]
fn probe_and_convert_picked_audio_track() {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
    let Ok(src) = dunce::canonicalize(&p) else {
        assert_eq!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref(), Ok("1"), "ไม่มีไฟล์ทดสอบ {} · รัน node scripts/make-test-media.mjs ก่อน", p.display());
        return;
    };
    let a = probe(&tools(), &src).unwrap();
    assert_eq!((a.track, a.tracks, a.stream, a.codec.as_str(), a.channels), (0, 2, 1, "aac", 1));
    let b = probe_track(&tools(), &src, 1).unwrap();
    assert_eq!((b.track, b.tracks, b.stream, b.codec.as_str(), b.channels), (1, 2, 2, "ac3", 6));
    let e = probe_track(&tools(), &src, 2).unwrap_err();
    assert!(e.contains("มีแทร็กเสียง 2 แทร็ก") && e.contains("ไม่มีแทร็กที่ 3"), "{e}");
    let dir = std::env::temp_dir().join(format!("ms-track-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("track2.flac");
    let spec = EncodeSpec { codec: "flac".into(), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), b.stream, &out.to_string_lossy(), Some(b.channels), b.bits).unwrap();
    assert!(matches!(encode::run(&|_| tools(), &plan, Some(b.duration), &|| false, &mut |_| {}).unwrap(), encode::Done::Ok));
    let g = probe(&tools(), &out).unwrap();
    assert_eq!(g.channels, 6, "ไฟล์ที่แปลงต้องเป็นเสียงแทร็กที่สอง 5.1");
    let _ = std::fs::remove_dir_all(&dir);
}

/// BUGS ข้อ 121 แปลงแบบไม่เสียคุณภาพแล้วเทียบ MD5 ของเสียงกับต้นฉบับ · ตรงได้ติ๊ก · ไฟล์อื่นไม่ตรง · ตั้งให้เสียงเปลี่ยนหรือต้นฉบับเสียคุณภาพไม่เทียบพร้อมเหตุผล
#[test]
fn bit_exact_after_lossless_and_reasons() {
    let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
    let f = probe(&tools(), &src).unwrap();
    let dir = std::env::temp_dir().join(format!("ms-same-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("same.wv");
    let spec = EncodeSpec { codec: "wv".into(), p: json!({"mode": "Normal"}).as_object().cloned().unwrap(), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    assert!(matches!(encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |_| {}).unwrap(), encode::Done::Ok));
    let (same, note) = bit_exact(&tools(), &src, &f, &out, &spec);
    assert_eq!(same, Some(true), "FLAC เป็น WavPack เสียงตรงทุกบิต {note}");
    assert!(note.starts_with("MD5 ของเสียง "), "{note}");
    // ไฟล์คนละเสียง ต้องขึ้นไม่ตรง
    let other = dir.join("other.flac");
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=96000:duration=3", "-ac", "2", "-sample_fmt", "s32", "-c:a", "flac"].iter().map(OsStr::new).chain([other.as_os_str()])).unwrap();
    assert!(o.status.success());
    assert_eq!(bit_exact(&tools(), &src, &f, &other, &spec).0, Some(false));
    // ตั้งให้เสียงเปลี่ยน ไม่เทียบ บอกเหตุผล
    let mut g = spec.clone();
    g.gain = 1.0;
    g.bits = Some(16);
    let (s2, n2) = bit_exact(&tools(), &src, &f, &out, &g);
    assert!(s2.is_none() && n2.contains("เปลี่ยนบิต") && n2.contains("ปรับความดัง"), "{n2}");
    let mut lossy = f.clone();
    lossy.codec = "mp3".into();
    let (s3, n3) = bit_exact(&tools(), &src, &lossy, &out, &spec);
    assert!(s3.is_none() && n3.contains("เสียคุณภาพ"), "{n3}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// BUGS ข้อ 120 ขนาดที่คาดจากการลองแปลง 4 ช่วงต้องใกล้ขนาดจริง (เดิมสูตรเสียงดิบคลาดได้ราว 19 จุด)
/// เพลงทดสอบ 150 วินาที เสียงรบกวนสีชมพูที่ดังเบาสลับกัน บีบได้ไม่เท่ากันทั้งเพลงแบบเพลงจริง · ไฟล์สั้นไม่เกิน 60 วินาทีแปลงทั้งเพลง ได้ขนาดตรงเป๊ะ
#[test]
fn size_probe_close_to_real() {
    let dir = std::env::temp_dir().join(format!("ms-probe-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let src = dir.join("long.flac");
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.4:duration=150:sample_rate=48000", "-af", "volume=0.25+0.7*abs(sin(2*PI*t/23)):eval=frame", "-ac", "2", "-sample_fmt", "s32", "-c:a", "flac"].iter().map(OsStr::new).chain([src.as_os_str()])).unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let f = probe(&tools(), &src).unwrap();
    let spec = EncodeSpec { codec: "flac".into(), p: json!({"level": 8}).as_object().cloned().unwrap(), ..Default::default() };
    let (est, whole) = size_probe(&dir, &|_| tools(), &src.to_string_lossy(), f.stream, &spec, Some(f.channels), f.bits, Some(f.rate), f.duration).unwrap();
    assert!(!whole);
    let out = dir.join("full.flac");
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    assert!(matches!(encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |_| {}).unwrap(), encode::Done::Ok));
    let real = std::fs::metadata(&out).unwrap().len() as f64;
    let err = (est - real) / real;
    assert!(err.abs() < 0.05, "คาด {est:.0} จริง {real:.0} คลาด {:.1}%", err * 100.0);
    // เพลงสั้น แปลงทั้งเพลง
    let short = dir.join("short.flac");
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", ["-v", "error", "-i"].iter().map(OsStr::new).chain([src.as_os_str()]).chain(["-t", "30", "-c:a", "flac"].iter().map(OsStr::new)).chain([short.as_os_str()])).unwrap();
    assert!(o.status.success());
    let fs = probe(&tools(), &short).unwrap();
    let (est2, whole2) = size_probe(&dir, &|_| tools(), &short.to_string_lossy(), fs.stream, &spec, Some(fs.channels), fs.bits, Some(fs.rate), fs.duration).unwrap();
    assert!(whole2 && est2 > 0.0);
    // ไฟล์ลองแปลงถูกลบหมด
    assert!(std::fs::read_dir(&dir).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with("sizeprobe-")));
    let _ = std::fs::remove_dir_all(&dir);
}

/// FLAC 96 kHz 24 บิต แปลงเป็น TAK ด้วย Takc ที่แตกจากชุดที่แนบมา · แท็กกับปกติดไปแบบ APEv2 · ถอดกลับเสียงตรงทุกตัวอย่าง
/// (8 พ.ย. 2569 · ก่อนหน้านี้ไม่เคยลอง TAK กับตัวแปลงจริง)
#[test]
fn flac_to_tak_with_tags_real() {
    let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
    let f = probe(&tools(), &src).unwrap();
    let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let tak = dir.join("TAK 2.3.3");
    encode::ensure_tak(&tools(), &tak).expect("แตก Takc.exe จาก zip ที่แนบมาได้");
    let out = dir.join("t.tak");
    let spec = EncodeSpec { codec: "tak".into(), p: json!({"preset": 4, "eval": "Max"}).as_object().cloned().unwrap(), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    assert_eq!(plan.steps[1].tool, "Takc");
    assert!(plan.steps[1].args.contains(&"-p4m".to_string()), "{:?}", plan.steps[1].args);
    let mut last = 0.0;
    let r = encode::run(&|n: &str| if n == "Takc" { tak.clone() } else { tools() }, &plan, Some(f.duration), &|| false, &mut |p| last = p).unwrap();
    assert!(matches!(r, encode::Done::Ok), "แปลงสำเร็จ");
    assert_eq!(last, 100.0);
    let items: Vec<crate::audio::ape::ApeItem> = f.tags.iter().map(|t| crate::audio::ape::ApeItem { key: ape_key(&t.key), value: t.value.as_bytes().to_vec(), binary: false }).collect();
    crate::audio::ape::append_tag(&out, &items).unwrap();
    let g = probe(&tools(), &out).unwrap();
    assert_eq!((g.codec.as_str(), g.channels, g.rate), ("tak", f.channels, f.rate));
    assert!((g.duration - f.duration).abs() < 0.1, "ยาว {} เทียบ {}", g.duration, f.duration);
    assert_eq!(g.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), f.tags.iter().find(|t| t.key == "title").map(|t| t.value.clone()), "ชื่อเพลงภาษาไทยติดไป");
    let md5 = |p: &Path| {
        let o = crate::app::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), p.as_os_str(), OsStr::new("-map"), OsStr::new("0:a:0"), OsStr::new("-c:a"), OsStr::new("pcm_s24le"), OsStr::new("-f"), OsStr::new("md5"), OsStr::new("-")]).unwrap();
        String::from_utf8_lossy(&o.stdout).trim().to_string()
    };
    assert_eq!(md5(&out), md5(&src), "ไม่เสียคุณภาพ");
    let _ = std::fs::remove_dir_all(&dir);
}

/// เปิด Loudness normalize แล้วอัตราสุ่มต้องเท่าต้นทาง (ผู้ช่วยตรวจขั้น 10 ข้อ 3 · เดิมได้ 192 kHz)
#[test]
fn loudnorm_keeps_source_rate() {
    let Some(src) = av("เพลงทดสอบ.wav") else { return };
    let f = probe(&tools(), &src).unwrap();
    assert_eq!(f.rate, 44100);
    let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("ln.flac");
    let spec = EncodeSpec { codec: "flac".into(), loudnorm: true, src_rate: Some(f.rate), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    assert!(plan.text.contains("loudnorm=I=-23:TP=-1,aresample=44100"), "{}", plan.text);
    let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| false, &mut |_| {}).unwrap();
    assert!(matches!(r, encode::Done::Ok));
    assert_eq!(probe(&tools(), &out).unwrap().rate, 44100, "อัตราสุ่มเท่าต้นทาง");
    let _ = std::fs::remove_dir_all(&dir);
}

/// หยุดกลางทาง ไม่ค้างไฟล์ (คนเรียกลบ) และคืน Cancelled
#[test]
fn ape_stop_returns_cancelled() {
    let Some(src) = av("เพลงทดสอบ 96k.flac") else { return };
    let f = probe(&tools(), &src).unwrap();
    let dir = std::env::temp_dir().join(format!("ms-conv-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&dir).unwrap();
    let out = dir.join("stop.ape");
    let spec = EncodeSpec { codec: "ape".into(), ..Default::default() };
    let plan = encode::build(&spec, &src.to_string_lossy(), f.stream, &out.to_string_lossy(), Some(f.channels), f.bits).unwrap();
    let r = encode::run(&|_| tools(), &plan, Some(f.duration), &|| true, &mut |_| {}).unwrap();
    assert!(matches!(r, encode::Done::Cancelled));
    let _ = std::fs::remove_dir_all(&dir);
}
