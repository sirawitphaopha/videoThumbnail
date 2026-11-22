//! เทสของ extract.rs (mod tests) · แยกออกจากไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use sha2::Digest;

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn movie() -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
    assert!(p.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
    p
}
fn sha(p: &Path) -> String {
    crate::media::probe::hex(&sha2::Sha256::digest(std::fs::read(p).unwrap()))
}

#[test]
fn names_follow_the_mockup() {
    let it = |kind: &str, nth, ext: &str, lang: Option<&str>, name: Option<&str>| Item { kind: kind.into(), nth, ext: ext.into(), lang: lang.map(String::from), name: name.map(String::from), of: None };
    assert_eq!(out_name("ดาวเหนือ (2023)", &it("audio", 1, "ac3", Some("th"), None)), "ดาวเหนือ (2023).Audio1.th.ac3");
    assert_eq!(out_name("ดาวเหนือ (2023)", &it("text", 1, "srt", Some("th"), None)), "ดาวเหนือ (2023).Text1.th.srt");
    assert_eq!(out_name("ดาวเหนือ (2023)", &it("attachment", 1, "jpg", None, Some("cover.jpg"))), "ดาวเหนือ (2023).cover.jpg");
    assert_eq!(out_name("ดาวเหนือ (2023)", &it("video", 1, "mkv", None, None)), "ดาวเหนือ (2023).Video1.mkv");
}

/// รูปแบบชื่อแบบ gMKVExtractGUI (BUGS ข้อ 130) · ค่าตั้งต้นได้ชื่อเดิม ดีเลย์ต่อท้ายแบบที่หน้าเสียงและซับอ่านกลับได้ ตัวแทนว่างไม่ทิ้งจุดซ้อน
#[test]
fn pattern_names() {
    let it = |kind: &str, nth, ext: &str, lang: Option<&str>| Item { kind: kind.into(), nth, ext: ext.into(), lang: lang.map(String::from), name: None, of: None };
    let s = "ดาวเหนือ (2023)";
    assert_eq!(pattern_name(DEFAULT_PATTERN, s, &it("audio", 1, "ac3", Some("th")), None, None), "ดาวเหนือ (2023).Audio1.th.ac3");
    assert_eq!(pattern_name(DEFAULT_PATTERN, s, &it("audio", 2, "ac3", None), Some(0), None), "ดาวเหนือ (2023).Audio2.ac3");
    let d = pattern_name(DEFAULT_PATTERN, s, &it("audio", 1, "ac3", Some("th")), Some(-120), None);
    assert_eq!(d, "ดาวเหนือ (2023).Audio1.th DELAY -120ms.ac3");
    assert_eq!(crate::merge::delay_from_name(&d), Some(-120), "หน้าเสียงและซับต้องอ่านดีเลย์จากชื่อกลับได้");
    assert_eq!(pattern_name("{Type}{Number} - {Language} - {Filename}", s, &it("text", 3, "srt", Some("en")), None, None), "Text3 - en - ดาวเหนือ (2023).srt");
    assert_eq!(pattern_name("{Filename} [{TrackName}]", s, &it("audio", 1, "aac", None), None, Some("พากย์ไทย: 5.1/ใหม่")), "ดาวเหนือ (2023) [พากย์ไทย_ 5.1_ใหม่].aac");
    assert_eq!(pattern_name("", s, &it("video", 1, "mkv", None), None, None), "ดาวเหนือ (2023).Video1.mkv", "รูปแบบว่างใช้แบบตั้งต้น");
    assert_eq!(pattern_name("{Language}", s, &it("video", 1, "mkv", None), None, None), "ดาวเหนือ (2023).Video1.mkv", "รูปแบบที่ได้ชื่อว่างใช้ชื่อหนังกับชนิดแทน");
    assert_eq!(pattern_name("{Type}{Number}  - {Language} - {Filename}", s, &it("audio", 1, "ogg", None), None, None), "Audio1 - - ดาวเหนือ (2023).ogg", "เว้นวรรคซ้อนยุบเหลือช่องเดียว");
    let ts = Item { kind: "timestamps".into(), of: Some("audio".into()), ..it("timestamps", 2, "txt", Some("en")) };
    assert_eq!(out_name_with(s, &ts, DEFAULT_PATTERN, None, None), "ดาวเหนือ (2023).Audio2.en.timestamps.txt");
    assert_eq!(out_name(s, &it("tags", 1, "xml", None)), "ดาวเหนือ (2023).tags.xml");
    assert_eq!(out_name(s, &it("ogm", 1, "txt", None)), "ดาวเหนือ (2023).chapters.txt");
    assert_eq!(out_name(s, &it("cue", 1, "cue", None)), "ดาวเหนือ (2023).cue");
}

/// พี่กันเจอ 15 พ.ย. 2569 แยกซับของซีรีส์ ACCA ไม่ได้ ขึ้นที่อยู่ยาวเกิน ทั้งที่ชื่อไม่ยาว
/// เดิมโฟลเดอร์ "<ชื่อหนัง> แยกไฟล์" ชื่อหนังซ้ำสองรอบ ที่อยู่ยาว 291 ตัว · ชื่อ "Dept. (2017)" โดนลบจุด
#[test]
fn long_series_paths_fit_and_names_keep_dots() {
    let dir = Path::new(r"D:\ACCA 13-Territory Inspection Dept. (2017) [Season 1+OVA] [BD 1080p HEVC OPUS] [Dual-Audio]\Season 1");
    let stem = "ACCA 13-Territory Inspection Dept. (2017) - S01E01 - Jean the Cigarette-Peddler";
    let movie = dir.join(format!("{stem}.mkv"));
    let out = default_folder(&movie);
    assert_eq!(out, dir.join("แยกไฟล์"), "โฟลเดอร์ตั้งต้นไม่ซ้ำชื่อหนัง");
    let it = Item { kind: "text".into(), nth: 1, ext: "ass".into(), lang: Some("en".into()), name: None, of: None };
    let name_of = |st: &str| out_name_with(st, &it, DEFAULT_PATTERN, None, None);
    let (name, cut) = fit_name(&out, stem, &name_of);
    assert_eq!(name, format!("{stem}.Text1.en.ass"), "ชื่อเต็มคงจุดหลัง Dept");
    assert!(!cut);
    assert!(out.join(&name).to_string_lossy().encode_utf16().count() + 8 <= crate::cover::rename::MAX_PATH_LEN);
    // โฟลเดอร์ที่ผู้ใช้เลือกยาวมาก ตัดท้ายชื่อหนังให้พอดี ส่วนแทร็ก ภาษา นามสกุลคงไว้
    let deep = dir.join("โฟลเดอร์ที่เลือกเองซึ่งยาวมากเป็นพิเศษสำหรับทดสอบการตัดชื่อไฟล์ให้พอดีกับที่ Windows รับได้ครบทุกตัว");
    let (short, cut2) = fit_name(&deep, stem, &name_of);
    assert!(cut2 && short.ends_with("….Text1.en.ass") && short.starts_with("ACCA 13"), "{short}");
    assert!(deep.join(&short).to_string_lossy().encode_utf16().count() + 8 <= crate::cover::rename::MAX_PATH_LEN, "{}", deep.join(&short).display());
    // โฟลเดอร์ยาวจนไม่เหลือที่ให้ชื่อ คืนชื่อเต็มให้ตัวตรวจความยาวบอกว่าไม่สำเร็จ
    let huge = PathBuf::from(format!(r"D:\{}", "ก".repeat(250)));
    assert!(!fit_name(&huge, stem, &name_of).1);
}

/// แยกแท็ก chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรมจากหนังทดสอบได้ไฟล์จริง · ดีเลย์ของเสียงจาก minimum_timestamp · ปรับชิ้นตอนแยกหลายไฟล์ (BUGS ข้อ 130)
#[test]
fn gmkv_style_extras() {
    let src = movie();
    let before = sha(&src);
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกแบบ-gmkv-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let j = mkv_json(&tools(), &src).unwrap();
    let info = info_of(&j);
    assert!(info.mkv && info.tags && info.chapters, "{info:?}");
    assert_eq!(info.delays, vec![0, 0]);
    let x = |kind: &str, ext: &str, of: Option<&str>| Item { kind: kind.into(), nth: 1, ext: ext.into(), lang: None, name: None, of: of.map(String::from) };
    for (it, want) in [(x("tags", "xml", None), "<Tags>"), (x("ogm", "txt", None), "CHAPTER01="), (x("cue", "cue", None), "TRACK 01"), (x("timestamps", "txt", Some("audio")), "format v2")] {
        let out = d.join(out_name("t", &it));
        assert!(matches!(extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false).unwrap(), Done::Ok(_)), "{}", it.kind);
        let t = std::fs::read_to_string(&out).unwrap();
        assert!(t.contains(want), "{} ต้องมี {want}: {}", it.kind, t.chars().take(200).collect::<String>());
    }
    // ไฟล์ที่ไม่ใช่ MKV ไม่มีชิ้นพวกนี้
    let mp4 = src.parent().unwrap().join("The Last Orchard (2022).mp4");
    assert!(extract_one(&tools(), &mp4, &x("tags", "xml", None), &d.join("x.xml"), &|_| {}, &|| false).is_err());
    // เสียงเลื่อนไป 120 ms (mkvmerge --sync) ได้ดีเลย์ 120 แล้วชื่อไฟล์ต่อท้าย DELAY 120ms
    let late = d.join("เสียงช้า.mkv");
    crate::app::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-o"), late.as_os_str(), OsStr::new("--sync"), OsStr::new("1:120"), src.as_os_str()]).unwrap();
    let li = info_of(&mkv_json(&tools(), &late).unwrap());
    assert_eq!(li.delays[0], 120, "{li:?}");
    let a1 = Item { kind: "audio".into(), nth: 1, ext: "aac".into(), lang: Some("th".into()), name: None, of: None };
    assert_eq!(out_name_with("เสียงช้า", &a1, DEFAULT_PATTERN, li.delays.first().copied(), None), "เสียงช้า.Audio1.th DELAY 120ms.aac");
    // แยกหลายไฟล์ หาเลขแทร็ก นามสกุล และภาษาของไฟล์นั้นใหม่ · ชิ้นที่ไฟล์นั้นไม่มีได้ None
    let other = src.parent().unwrap().join("Vorbis Test (2010).mkv");
    let oj = mkv_json(&tools(), &other).unwrap();
    let oi = info_of(&oj);
    let fa = fit_item(&oj, &oi, &Item { kind: "audio".into(), nth: 1, ext: "ac3".into(), lang: Some("th".into()), name: None, of: None }).unwrap();
    assert_eq!(fa.ext, "ogg", "เสียงของไฟล์นั้นเป็น Vorbis");
    assert!(fit_item(&oj, &oi, &Item { kind: "audio".into(), nth: 9, ext: "ac3".into(), lang: None, name: None, of: None }).is_none());
    assert_eq!(fit_item(&j, &info, &Item { kind: "text".into(), nth: 2, ext: "srt".into(), lang: None, name: None, of: None }).unwrap().ext, "ass");
    assert_eq!(fit_item(&j, &info, &Item { kind: "audio".into(), nth: 1, ext: "x".into(), lang: None, name: None, of: None }).unwrap().lang.as_deref(), Some("th"));
    assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
    let _ = std::fs::remove_dir_all(&d);
}

/// ชื่อไฟล์แนบที่ตั้งใจทำมาให้หลุดโฟลเดอร์ เหลือแค่ชื่อส่วนท้ายที่ปลอดภัย (ผู้ช่วยตรวจโค้ดข้อ 5)
#[test]
fn attachment_names_cannot_escape_the_folder() {
    let att = |name: &str| Item { kind: "attachment".into(), nth: 3, ext: "bin".into(), lang: None, name: Some(name.into()), of: None };
    let stem = "ดาวเหนือ (2023)";
    assert_eq!(out_name(stem, &att(r"x\..\..\..\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\a.cmd")), "ดาวเหนือ (2023).a.cmd");
    assert_eq!(out_name(stem, &att("../../evil.ttf")), "ดาวเหนือ (2023).evil.ttf");
    assert_eq!(out_name(stem, &att("font:stream.ttf")), "ดาวเหนือ (2023).font_stream.ttf");
    assert_eq!(out_name(stem, &att("..")), "ดาวเหนือ (2023).attachment3.bin");
    assert_eq!(out_name(stem, &att("CON.txt")), "ดาวเหนือ (2023).attachment3.bin");
    assert_eq!(out_name(stem, &att("a\u{7}b.ttf ")), "ดาวเหนือ (2023).a_b.ttf");
    let dir = Path::new(r"D:\หนัง\ดาวเหนือ (2023) แยกไฟล์");
    for n in [r"..\..\x.cmd", "/abs/y.ttf", r"C:\z.ttf", "ok.ttf"] {
        assert_eq!(dir.join(out_name(stem, &att(n))).parent(), Some(dir), "{n} ต้องอยู่ในโฟลเดอร์ที่เลือก");
    }
}

/// ไฟล์ที่ไม่ใช่ MKV · นามสกุลที่ ffmpeg เขียนเดี่ยวไม่ได้กลายเป็น mka mks · ที่เขียนได้คงเดิม (ผู้ช่วยตรวจโค้ดข้อ 7)
#[test]
fn raw_video_names_and_formats() {
    let it = Item { kind: "video".into(), nth: 1, ext: "h264".into(), lang: None, name: None, of: None };
    assert_eq!(out_name("ดาวเหนือ (2023)", &it), "ดาวเหนือ (2023).Video1.h264");
    assert!(is_raw_video("h264") && is_raw_video("h265") && !is_raw_video("mkv"));
    let mut a = it.clone(); fix_ext_for_ffmpeg(&mut a); assert_eq!(a.ext, "h264");
    let mut b = Item { ext: "h265".into(), ..it }; fix_ext_for_ffmpeg(&mut b); assert_eq!(b.ext, "h265");
}

#[test]
fn ffmpeg_extensions_match_what_is_written() {
    let fx = |kind: &str, ext: &str| { let mut it = Item { kind: kind.into(), nth: 1, ext: ext.into(), lang: None, name: None, of: None }; fix_ext_for_ffmpeg(&mut it); it.ext };
    assert_eq!(fx("text", "sub"), "mks");
    assert_eq!(fx("audio", "weird"), "mka");
    for (k, e) in [("text", "sup"), ("audio", "thd"), ("text", "vtt"), ("text", "ssa"), ("audio", "wma"), ("audio", "ac3"), ("text", "srt")] {
        assert_eq!(fx(k, e), e, "{e} ffmpeg เขียนได้ ต้องคงนามสกุลเดิม");
    }
    assert_eq!(ff_format("sup"), Some("sup"));
    assert_eq!(ff_format("thd"), Some("truehd"));
    assert_eq!(ff_format("vtt"), Some("webvtt"));
}

/// ซับ mov_text ใน MP4 แยกเป็น SRT ได้ไฟล์ SRT จริง (เดิม -c copy ตัวเขียน srt ไม่รับ mov_text)
#[test]
fn mp4_mov_text_extracts_as_real_srt() {
    let src = movie().parent().unwrap().join("The Last Orchard (2022).mp4");
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกซับ-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let out = d.join("sub.srt");
    let it = Item { kind: "text".into(), nth: 1, ext: "srt".into(), lang: None, name: None, of: None };
    assert!(matches!(extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
    let t = std::fs::read_to_string(&out).unwrap();
    assert!(t.contains("-->") && t.trim_start().starts_with('1'), "ต้องได้ SRT จริง: {}", t.chars().take(80).collect::<String>());
    let _ = std::fs::remove_dir_all(&d);
}

/// AUDIT 12 พ.ย. 2569 ข้อ 17 หนัง MP4 ที่มีบทและมีซับ แยกบทต้องได้ Matroska XML ที่ mkvmerge อ่านได้ครบทุกบท
/// เดิมได้ซับแทร็กแรกเป็นไฟล์ Matroska ใต้ชื่อ .chapters.xml · ชนิดที่ไม่ใช่สตรีม (ไฟล์แนบ) ต้องบอกว่าแยกไม่ได้ ไม่หยิบซับมาแทน
#[test]
fn mp4_chapters_extract_as_matroska_xml() {
    let src = movie().parent().unwrap().join("The Last Orchard (2022).mp4");
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกบท-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let meta = d.join("meta.txt");
    std::fs::write(&meta, ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=4000\ntitle=เปิดเรื่อง\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=4000\nEND=8000\ntitle=ฉาก <สอง> & จบ\n").unwrap();
    let mp4 = d.join("มีบท.mp4");
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", [OsStr::new("-v"), OsStr::new("error"), OsStr::new("-i"), src.as_os_str(), OsStr::new("-f"), OsStr::new("ffmetadata"), OsStr::new("-i"), meta.as_os_str(),
        OsStr::new("-map"), OsStr::new("0"), OsStr::new("-map_chapters"), OsStr::new("1"), OsStr::new("-c"), OsStr::new("copy"), mp4.as_os_str()]).unwrap();
    assert!(o.status.success(), "{}", String::from_utf8_lossy(&o.stderr));
    let mut it = Item { kind: "menu".into(), nth: 1, ext: "xml".into(), lang: None, name: None, of: None };
    fix_ext_for_ffmpeg(&mut it);
    assert_eq!(it.ext, "xml", "บทไม่ผ่าน ffmpeg นามสกุลต้องคงเป็น xml");
    let ch = d.join("บท.chapters.xml");
    assert!(matches!(extract_one(&tools(), &mp4, &it, &ch, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
    let t = std::fs::read_to_string(&ch).expect("ไฟล์บทต้องเป็นข้อความ ไม่ใช่ Matroska");
    assert!(t.starts_with("<?xml") && t.matches("<ChapterAtom>").count() == 2 && t.contains("เปิดเรื่อง") && t.contains("ฉาก &lt;สอง&gt; &amp; จบ"), "{t}");
    // mkvmerge อ่านไฟล์บทนี้ได้ครบสองบท
    let back = d.join("ใส่บทกลับ.mkv");
    let o = crate::app::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-o"), back.as_os_str(), OsStr::new("--chapters"), ch.as_os_str(), src.as_os_str()]).unwrap();
    assert!(o.status.code().unwrap_or(9) <= 1, "{}", String::from_utf8_lossy(&o.stdout));
    let j: Value = serde_json::from_slice(&crate::app::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-J"), back.as_os_str()]).unwrap().stdout).unwrap();
    assert_eq!(j["chapters"][0]["num_entries"].as_u64(), Some(2), "{}", j["chapters"]);
    // หนัง MP4 ที่ไม่มีบท บอกตรง ๆ ว่าไม่มีบท
    let e = extract_one(&tools(), &src, &it, &d.join("ไม่มีบท.xml"), &|_| {}, &|| false).err().unwrap_or_default().why;
    assert!(e.contains("ไม่มีบท"), "{e}");
    // ไฟล์แนบของไฟล์ที่ไม่ใช่ MKV ไม่หยิบซับมาแทน
    let e = extract_one(&tools(), &mp4, &Item { kind: "attachment".into(), nth: 1, ext: "ttf".into(), lang: None, name: Some("a.ttf".into()), of: None }, &d.join("a.ttf"), &|_| {}, &|| false).err().unwrap_or_default().why;
    assert!(e.contains("ไม่ใช่ MKV"), "{e}");
    assert!(!d.join("a.ttf").exists());
    let _ = std::fs::remove_dir_all(&d);
}

#[test]
fn extracted_tracks_match_mkvextract_and_source_untouched() {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยก-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let src = movie();
    let before = sha(&src);
    for (kind, nth, ext) in [("audio", 2, "ac3"), ("text", 1, "srt"), ("text", 2, "ass")] {
        let it = Item { kind: kind.into(), nth, ext: ext.into(), lang: None, name: None, of: None };
        let mine = d.join(format!("mine-{kind}{nth}.{ext}"));
        assert!(matches!(extract_one(&tools(), &src, &it, &mine, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
        // ดึงเองด้วย mkvextract เลขแทร็ก mkvmerge (วิดีโอ 0 · เสียง 1 2 · ซับ 3 4)
        let id = match (kind, nth) { ("audio", 2) => 2, ("text", 1) => 3, _ => 4 };
        let theirs = d.join(format!("theirs-{id}.{ext}"));
        let mut t = OsString::from(format!("{id}:"));
        t.push(theirs.as_os_str());
        crate::app::tools::run_tool(&tools(), "mkvextract", [src.as_os_str(), OsStr::new("tracks"), &t]).unwrap();
        assert_eq!(sha(&mine), sha(&theirs), "{kind}{nth} ไม่ตรงกับที่ดึงด้วย mkvextract เอง");
    }
    let ch = d.join("chapters.xml");
    assert!(matches!(extract_one(&tools(), &src, &Item { kind: "menu".into(), nth: 1, ext: "xml".into(), lang: None, name: None, of: None }, &ch, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
    assert!(std::fs::read_to_string(&ch).unwrap().contains("<Chapters>"), "บทต้องออกมาเป็น XML");
    let v = d.join("video.mkv");
    assert!(matches!(extract_one(&tools(), &src, &Item { kind: "video".into(), nth: 1, ext: "mkv".into(), lang: None, name: None, of: None }, &v, &|_| {}, &|| false).unwrap(), Done::Ok(_)));
    let j: Value = serde_json::from_slice(&crate::app::tools::run_tool(&tools(), "mkvmerge", [OsStr::new("-J"), v.as_os_str()]).unwrap().stdout).unwrap();
    assert_eq!(j["tracks"].as_array().unwrap().len(), 1, "แยกภาพต้องได้แทร็กภาพอย่างเดียว");
    assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
    // ชื่อชนต่อท้ายเลข 2 ไม่ทับ
    assert_eq!(numbered(&v), d.join("video 2.mkv"));
    let _ = std::fs::remove_dir_all(&d);
}

fn names_in(d: &Path) -> Vec<String> {
    let mut v: Vec<String> = std::fs::read_dir(d).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    v.sort();
    v
}

/// BUGS ข้อ 150 พี่กันแยกซับญี่ปุ่น VobSub ของ Shin Godzilla ขึ้น "mkvextract แยกไม่สำเร็จ (รหัส 0)" แล้วเหลือไฟล์ชื่อผิด .sub.idx กับ .sub.sub
/// mkvextract เขียน VobSub เป็นสองไฟล์โดยเปลี่ยนนามสกุลท้ายของชื่อที่ส่งไปเอง · โค้ดเดิมรอไฟล์ .partial ไฟล์เดียว (เทสนี้แดงกับโค้ดเดิม 16 พ.ย. 2569)
/// ต้องได้ .idx กับ .sub ชื่อถูก เนื้อไฟล์ตรงกับที่ mkvextract แยกเอง ไม่มีไฟล์ชั่วคราวค้าง ไฟล์หนังไม่ถูกแตะ
#[test]
fn vobsub_extracts_as_idx_and_sub_pair() {
    let src = movie().parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
    assert!(src.exists(), "ไม่มีไฟล์ทดสอบ ซับรูป (2024).mkv รัน node scripts/make-test-media.mjs ก่อน");
    let before = sha(&src);
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกvobsub-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let it = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: Some("en".into()), name: None, of: None };
    assert!(is_vobsub(true, &it) && !is_vobsub(false, &it), "ไฟล์ที่ไม่ใช่ MKV แยกด้วย ffmpeg เป็น Matroska ไฟล์เดียว");
    let name = out_name("ซับรูป (2024)", &it);
    assert_eq!(name, "ซับรูป (2024).Text2.en.sub");
    let target = d.join(&name);
    assert_eq!(partial_of(&target, true), d.join("ซับรูป (2024).Text2.en.sub.partial.sub"));
    let got = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) {
        Ok(Placed::Done(fs)) => fs,
        Ok(Placed::Cancelled) => panic!("ไม่ได้กดหยุด"),
        Err(e) => panic!("แยก VobSub ต้องสำเร็จ ได้ {e:?} ไฟล์ที่ค้าง {:?}", names_in(&d)),
    };
    assert_eq!(got, vec![d.join("ซับรูป (2024).Text2.en.idx"), d.join("ซับรูป (2024).Text2.en.sub")]);
    assert_eq!(names_in(&d), vec!["ซับรูป (2024).Text2.en.idx", "ซับรูป (2024).Text2.en.sub"], "ต้องเหลือแค่สองไฟล์ ไม่มีไฟล์ชั่วคราว");
    let idx = std::fs::read_to_string(&got[0]).unwrap();
    assert!(idx.contains("VobSub index file") && idx.contains("timestamp:"), "ไฟล์ .idx ต้องเป็นดัชนีของ VobSub: {}", idx.chars().take(120).collect::<String>());
    // เทียบกับที่ mkvextract แยกเอง (แทร็ก 3 ของไฟล์นี้คือ S_VOBSUB)
    let theirs = d.join("เทียบ").join("x.sub");
    std::fs::create_dir_all(theirs.parent().unwrap()).unwrap();
    let mut t = OsString::from("3:");
    t.push(theirs.as_os_str());
    crate::app::tools::run_tool(&tools(), "mkvextract", [src.as_os_str(), OsStr::new("tracks"), &t]).unwrap();
    assert_eq!(sha(&got[1]), sha(&theirs), ".sub ต้องตรงกับที่ mkvextract แยกเอง");
    assert_eq!(std::fs::read_to_string(&got[0]).unwrap().replace("x.sub", ""), std::fs::read_to_string(theirs.with_extension("idx")).unwrap().replace("x.sub", ""), ".idx ต้องตรงกับที่ mkvextract แยกเอง");
    // แยกหลายไฟล์แบบ gMKVExtractGUI (BUGS ข้อ 130) หานามสกุลจาก codec ได้ sub จึงเข้าทาง VobSub เดียวกัน
    let j = mkv_json(&tools(), &src).unwrap();
    let fx = fit_item(&j, &info_of(&j), &Item { ext: "srt".into(), ..it.clone() }).unwrap();
    assert!(fx.ext == "sub" && is_vobsub(true, &fx), "{fx:?}");
    // หน้าจอส่งนามสกุลผิดมา ตัวแยกดูชนิดแทร็กจริงแล้วยังได้คู่ .idx .sub ชื่อเดียวกับชิ้นนี้
    let odd = d.join("นามสกุลผิด.mks");
    match place_item(&tools(), &src, &Item { ext: "mks".into(), ..it.clone() }, &odd, false, &|_| {}, &|| false) {
        Ok(Placed::Done(fs)) => assert_eq!(fs, vec![d.join("นามสกุลผิด.idx"), d.join("นามสกุลผิด.sub")]),
        _ => panic!("ต้องแยกได้"),
    }
    assert_eq!(sha(&src), before, "ไฟล์หนังเดิมต้องไม่ถูกแตะ");
    let _ = std::fs::remove_dir_all(&d);
}

/// BUGS ข้อ 150 กับไฟล์จริงของพี่กัน Shin Godzilla ซับ VobSub อังกฤษ (Text #1) กับญี่ปุ่น (Text #2) · ไฟล์ใหญ่ ไม่ขึ้น git รันเฉพาะตอนตั้งตัวแปร
/// MOVIE_SHELF_GODZILLA ที่อยู่ไฟล์หนัง (อ่านอย่างเดียว) · ผลลง MOVIE_SHELF_GODZILLA_OUT ค่าตั้งต้น D:\dev\tmp\ocr-test\godzilla ซึ่งเป็นไฟล์เทส OCR ภาษาญี่ปุ่น
#[test]
fn godzilla_vobsub_pair() {
    let Ok(src) = std::env::var("MOVIE_SHELF_GODZILLA") else { return };
    let src = PathBuf::from(src);
    let out = PathBuf::from(std::env::var("MOVIE_SHELF_GODZILLA_OUT").unwrap_or_else(|_| r"D:\dev\tmp\ocr-test\godzilla".into()));
    std::fs::create_dir_all(&out).unwrap();
    let meta = |p: &Path| { let m = std::fs::metadata(p).unwrap(); (m.len(), m.modified().unwrap()) };
    let before = meta(&src);
    for (nth, lang) in [(1, "en"), (2, "ja")] {
        let it = Item { kind: "text".into(), nth, ext: "sub".into(), lang: Some(lang.into()), name: None, of: None };
        let target = out.join(out_name("shin godzilla", &it));
        for f in finals_of(&target, true) { let _ = std::fs::remove_file(f); }
        let fs = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) { Ok(Placed::Done(fs)) => fs, Ok(_) => panic!("ไม่ได้กดหยุด"), Err(e) => panic!("Text #{nth} {e:?}") };
        assert_eq!(fs, finals_of(&target, true));
        let idx = std::fs::read_to_string(&fs[0]).unwrap();
        assert!(idx.contains("VobSub index file") && idx.matches("timestamp:").count() > 100, "Text #{nth} .idx ต้องมีภาพหลายร้อยภาพ");
        assert!(std::fs::metadata(&fs[1]).unwrap().len() > 1 << 20, "Text #{nth} .sub ต้องมีข้อมูลภาพ");
        eprintln!("Text #{nth} ได้ {} ({} ภาพ) กับ {} ({} ไบต์)", fs[0].display(), idx.matches("timestamp:").count(), fs[1].display(), std::fs::metadata(&fs[1]).unwrap().len());
    }
    assert!(std::fs::read_dir(&out).unwrap().all(|e| !e.unwrap().file_name().to_string_lossy().contains("partial")), "ไม่มีไฟล์ชั่วคราวค้าง");
    assert_eq!(meta(&src), before, "ไฟล์หนังของพี่กันต้องไม่ถูกแตะ");
}

/// VobSub เช็กชื่อชนทั้งสองไฟล์ ต่อท้ายเลขจนว่างทั้งคู่ · ย้ายไม่ได้กลางทาง ลบไฟล์ของเราที่ย้ายไปแล้วและไฟล์ชั่วคราว ไม่แตะไฟล์ที่มีอยู่ก่อน (BUGS ข้อ 150)
#[test]
fn vobsub_conflicts_check_both_files() {
    let src = movie().parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกvobsub-ชน-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    let target = d.join("ก.Text2.en.sub");
    assert_eq!(finals_of(&target, true), vec![d.join("ก.Text2.en.idx"), target.clone()]);
    assert_eq!(finals_of(&target, false), vec![target.clone()]);
    // มีแค่ .idx ของเดิม ก็ถือว่าชน
    std::fs::write(d.join("ก.Text2.en.idx"), "ของเดิม").unwrap();
    assert!(finals_of(&target, true).iter().any(|f| f.exists()));
    assert_eq!(numbered_free(&target, true), d.join("ก.Text2.en 2.sub"));
    std::fs::write(d.join("ก.Text2.en 2.idx"), "ของเดิม").unwrap();
    assert_eq!(numbered_free(&target, true), d.join("ก.Text2.en 3.sub"), "เลข 2 มี .idx แล้ว ต้องข้ามไปเลข 3");
    assert_eq!(numbered(&target), d.join("ก.Text2.en 2.sub"), "ชิ้นอื่นดูแค่ไฟล์เดียวแบบเดิม");
    // ไฟล์ .idx โผล่มาก่อนย้าย ย้ายไม่ทับ ไม่เหลือ .sub ครึ่งคู่ ไม่มีไฟล์ชั่วคราวค้าง ไฟล์ของเดิมไม่ถูกแตะ
    let it = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: Some("en".into()), name: None, of: None };
    let e = match place_item(&tools(), &src, &it, &target, true, &|_| {}, &|| false) { Err(e) => e, _ => panic!("ต้องย้ายไม่ได้") };
    assert!(e.why.contains("มีไฟล์ชื่อนี้อยู่แล้ว"), "{e:?}");
    assert_eq!(names_in(&d), vec!["ก.Text2.en 2.idx", "ก.Text2.en.idx"]);
    assert_eq!(std::fs::read_to_string(d.join("ก.Text2.en.idx")).unwrap(), "ของเดิม");
    // กดหยุดตั้งแต่ต้น ไม่เหลือไฟล์ชั่วคราว
    let t2 = d.join("ข.sub");
    assert!(matches!(place_item(&tools(), &src, &it, &t2, true, &|_| {}, &|| true), Ok(Placed::Cancelled)));
    assert_eq!(names_in(&d), vec!["ก.Text2.en 2.idx", "ก.Text2.en.idx"]);
    let _ = std::fs::remove_dir_all(&d);
}

/// เครื่องมือล้มจริง ข้อความบนการ์ดเป็นประโยคไทย ไม่มีแค่รหัส และมีข้อความของเครื่องมือไว้ใส่ปุ่ม ⓘ (BUGS ข้อ 150)
#[test]
fn tool_failures_explain_in_thai() {
    let src = movie();
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-แยกพัง-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    // ที่เก็บเป็นไฟล์ ไม่ใช่โฟลเดอร์ เครื่องมือสร้างไฟล์ปลายทางไม่ได้
    let blk = d.join("ไม่ใช่โฟลเดอร์");
    std::fs::write(&blk, "x").unwrap();
    let it = Item { kind: "text".into(), nth: 1, ext: "srt".into(), lang: None, name: None, of: None };
    let out = blk.join("ก.srt");
    let e = match extract_one(&tools(), &src, &it, &out, &|_| {}, &|| false) { Err(e) => e, Ok(_) => panic!("ต้องแยกไม่ได้") };
    assert!(e.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้") && !e.why.contains("รหัส"), "mkvextract {e:?}");
    assert!(e.detail.as_deref().is_some_and(|x| x.contains("Failed to create the file")), "ปุ่ม ⓘ ต้องมีข้อความของ mkvextract {e:?}");
    // ไฟล์ .mp4 แยกด้วย ffmpeg
    let mp4 = src.parent().unwrap().join("The Last Orchard (2022).mp4");
    let e = match extract_one(&tools(), &mp4, &Item { kind: "audio".into(), nth: 1, ext: "aac".into(), lang: None, name: None, of: None }, &blk.join("ก.aac"), &|_| {}, &|| false) { Err(e) => e, Ok(_) => panic!("ต้องแยกไม่ได้") };
    assert!(e.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้") && e.detail.as_deref().is_some_and(|x| x.contains("Error opening output")), "ffmpeg {e:?}");
    // ซับ VobSub ล้มแล้วไม่เหลือไฟล์ชั่วคราวทั้งสองไฟล์
    let img = src.parent().unwrap().parent().unwrap().join("เสียงซับ").join("ซับรูป (2024).mkv");
    let vs = Item { kind: "text".into(), nth: 2, ext: "sub".into(), lang: None, name: None, of: None };
    assert!(place_item(&tools(), &img, &vs, &blk.join("ข.sub"), true, &|_| {}, &|| false).is_err());
    assert_eq!(names_in(&d), vec!["ไม่ใช่โฟลเดอร์"]);
    let _ = std::fs::remove_dir_all(&d);
}

/// ข้อความจริงที่เครื่องมือพิมพ์ (จับจาก mkvextract กับ ffmpeg ที่แนบมา 16 พ.ย. 2569) แปลเป็นสาเหตุภาษาไทยได้ · แปลไม่ได้ใส่บรรทัดสุดท้ายไว้ให้ปุ่ม ⓘ
#[test]
fn explain_tool_messages() {
    use crate::app::tools::{explain_fail, tool_lines};
    let st = |code: u32| -> std::process::ExitStatus { use std::os::windows::process::ExitStatusExt; std::process::ExitStatus::from_raw(code) };
    let l = tool_lines("#GUI#error No track with the ID 9 was found in the source file.\n");
    assert_eq!(l, vec!["No track with the ID 9 was found in the source file."]);
    assert!(explain_fail("mkvextract", &l, Some(&st(2))).why.starts_with("ไม่เจอแทร็กนี้ในไฟล์"));
    let ff = tool_lines("[in#0 @ 000002a2594d5dc0] Element at 0x45 ending at 0x34e05 exceeds containing master element ending at 0x13f1\r\nError opening input file D:/x.mkv.\nError opening input files: End of file\n");
    let f = explain_fail("ffmpeg", &ff, Some(&st(1)));
    assert!(f.known && f.why.starts_with("ไฟล์หนังเสีย") && f.detail.as_deref() == Some("Error opening input files: End of file"), "{f:?}");
    assert!(explain_fail("ffmpeg", &tool_lines("D:/a.aac: No space left on device"), Some(&st(1))).why.starts_with("พื้นที่ในไดรฟ์ที่เก็บเต็ม"));
    assert!(explain_fail("mkvextract", &tool_lines("#GUI#error The file 'D:\\a.srt' could not be opened for writing: Permission denied."), Some(&st(2))).why.starts_with("Windows ไม่ให้เขียน"));
    assert!(explain_fail("mkvextract", &tool_lines("#GUI#warning x\n#GUI#error The device is not ready."), Some(&st(2))).why.starts_with("อ่านหรือเขียนไดรฟ์ไม่ได้กลางคัน"));
    assert!(explain_fail("ffmpeg", &tool_lines("Could not find tag for codec dvd_subtitle in stream #0, codec not currently supported in container"), Some(&st(1))).why.contains("แยกออกเป็นไฟล์แบบนี้ไม่ได้"));
    // ความคืบหน้าของ mkvextract แบบไม่ใช้ --gui-mode ไม่นับเป็นข้อความ
    assert!(tool_lines("Progress: 1%Progress: 3%Progress: 100%\n").is_empty());
    // แปลไม่ได้ บอกว่าแปลไม่ได้ เก็บบรรทัดสุดท้ายไว้ และข้อความบรรทัดเดียวต่อท้ายให้เอง
    let u = explain_fail("ffmpeg", &tool_lines("something odd\nweird thing happened"), Some(&st(1)));
    assert!(!u.known && u.detail.as_deref() == Some("weird thing happened") && u.line().ends_with("(weird thing happened)"), "{u:?}");
    assert!(!u.why.contains("รหัส"));
    // ไม่มีข้อความเลย ปุ่ม ⓘ บอกรหัสแทน · จบปกติแต่ไม่ได้ไฟล์ ไม่บอกว่ารหัส 0
    let z = explain_fail("mkvextract", &[], Some(&st(2)));
    assert_eq!(z.detail.as_deref(), Some("mkvextract ตอบรหัส 2"));
    let n = explain_fail("mkvextract", &[], None);
    assert!(n.why.contains("ทำงานจบแล้วแต่ไม่ได้ไฟล์ออกมา") && !n.why.contains("รหัส 0"), "{n:?}");
    assert!(explain_fail("ffmpeg", &[], Some(&st(0xC000013A))).why.contains("พังหรือถูกปิดกลางคัน"));
    // ที่อยู่ในข้อความของเครื่องมือเหลือแค่ชื่อไฟล์ กล่อง ⓘ ไม่กระจายตัวอักษรจนถ่าง
    let v = explain_fail("mkvextract", &tool_lines("#GUI#error Failed to create the VobSub data file 'D:/dev/tmp/ชั้นแยกVobSub\\แยกไฟล์\\ซับรูป (2024).Text2.en.sub.partial.sub': open file error"), Some(&st(2)));
    assert!(v.why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"), "{v:?}");
    assert_eq!(v.detail.as_deref(), Some("Failed to create the VobSub data file 'ซับรูป (2024).Text2.en.sub.partial.sub': open file error"));
    assert_eq!(crate::app::tools::short_paths("Error opening output D:/dev/tmp/x/o.aac: No such file or directory"), "Error opening output o.aac: No such file or directory");
    assert_eq!(crate::app::tools::short_paths("Error opening output files: No such file or directory"), "Error opening output files: No such file or directory");
    assert!(explain_fail("mkvextract", &tool_lines("#GUI#error Failed to create the file 'D:/a/o.srt': 0 (create_directory() failed)"), Some(&st(2))).why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"));
    assert!(explain_fail("ffmpeg", &tool_lines("Error opening output files: No such file or directory"), Some(&st(1))).why.starts_with("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้"), "ปลายทางเปิดไม่ได้ ไม่ใช่หาไฟล์หนังไม่เจอ");
}
