//! เทสของ merge/mod.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use crate::app::outfile::mkv_attachments;

fn tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}

/// ไฟล์ทดสอบชุดเสียงซับ · ไม่มีไฟล์ = เทสล้มพร้อมบอกวิธีสร้าง · ตั้ง MOVIE_SHELF_SKIP_MEDIA=1 ถ้าตั้งใจข้าม
fn av(name: &str) -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join(name);
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(_) if std::env::var("MOVIE_SHELF_SKIP_MEDIA").as_deref() == Ok("1") => None,
        Err(e) => panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()),
    }
}

/// โฟลเดอร์ชั่วคราวที่ลบตัวเองตอนจบ แม้เทสล้ม
struct TempDir(PathBuf);
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn temp_dir(tag: &str) -> TempDir {
    let d = std::env::temp_dir().join(format!("movie-shelf-merge-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    TempDir(d)
}

fn run(req: &MergeReq, covers: &HashMap<String, (Vec<u8>, String)>, out: &Path, work: &Path) -> (Result<Produced, ApplyProblem>, Vec<String>) {
    let mut notes = vec![];
    let r = produce(&tools(), work, req, covers, out, &|| false, &|_, _, _, _| {}, &mut notes, "ไม่แตะ");
    (r, notes)
}

fn req(movie: &Path, tracks: Vec<Track>, output: &str) -> MergeReq {
    MergeReq { movie: movie.to_string_lossy().to_string(), tracks, covers: CoverPlan::default(), output: output.into(), original: "keep".into(), check_source: false, check_output: true, fonts: vec![], chapters: None }
}

/// เวลาของแพ็กเก็ตแรกที่มีเนื้อ · ข้ามแพ็กเก็ตว่าง (ซับ mov_text ใน MP4 มีแพ็กเก็ตว่าง 2 ไบต์คั่นช่วงที่ไม่มีซับ เริ่มที่วินาที 0)
fn first_packet(file: &Path, sel: &str) -> f64 {
    let o = crate::app::tools::run_tool(&tools(), "ffprobe", ["-v", "error", "-select_streams", sel, "-show_entries", "packet=pts_time,size", "-of", "csv=p=0"].iter().map(OsString::from).chain([file.as_os_str().to_owned()])).unwrap();
    String::from_utf8_lossy(&o.stdout).lines().filter_map(|l| {
        let mut it = l.trim().trim_end_matches(',').split(',');
        let t: f64 = it.next()?.parse().ok()?;
        let size: u64 = it.next()?.parse().ok()?;
        (size > 2).then_some(t)
    }).next().unwrap_or(f64::NAN)
}

/// แผนหน้าแก้ซับ ขั้น 9 ใส่ซับที่แก้กลับเข้าหนังแบบที่หน้าแก้ซับทำ (src/lib/subRemux.ts)
/// แทนแทร็กซับ ASS ด้วยไฟล์ที่แก้ ภาษา ชื่อ ธงหลักเดิม · ไฟล์ใหม่แทร็กครบตามลำดับเดิม ซับที่แก้อ่านกลับตรงทุกบรรทัด สไตล์ครบ ซับอีกแทร็กเหมือนเดิม
#[test]
fn replace_edited_sub_track_real_files() {
    let Some(movie) = av("แก้ซับ/ฉากตัด (2025).mkv") else { return };
    let dir = temp_dir("remux");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let subs: Vec<usize> = m.tracks.iter().enumerate().filter(|(_, t)| t.kind == "subtitle").map(|(i, _)| i).collect();
    assert_eq!(subs.len(), 2, "หนังทดสอบมีซับ ASS กับ SRT");
    let read = |file: &Path, t: &Track| {
        let (b, h) = crate::subtitle::subs::bytes_of(&tl, &dir.0, file, true, t.tid, t.ff.unwrap_or(t.tid)).unwrap();
        crate::subtitle::subdoc::parse_doc(&b, &h, None)
    };
    let lines = |d: &crate::subtitle::subdoc::SubDoc| d.events.iter().map(|e| (e.comment, e.layer, e.start, e.end, e.style.clone(), e.actor.clone(), e.text.clone())).collect::<Vec<_>>();
    let old = m.tracks[subs[0]].clone();
    let mut doc = read(&movie, &old);
    let srt0 = read(&movie, &m.tracks[subs[1]]);
    let i = doc.events.iter().position(|e| e.start == 500 && !e.comment).expect("บรรทัด 0.50");
    doc.events[i].text = "ใส่กลับเข้าหนังแล้ว".into();
    let temp = dir.0.join("sub-remux-test.ass");
    std::fs::write(&temp, crate::subtitle::subdoc::to_bytes(&doc).0).unwrap();
    let mut nt = add_file(&tl, &temp, m.duration).unwrap().tracks.remove(0);
    nt.lang = old.lang.clone();
    nt.name = old.name.clone();
    nt.default = old.default;
    nt.forced = old.forced;
    nt.delay = old.delay;
    let tracks: Vec<Track> = m.tracks.iter().enumerate().map(|(k, t)| if k == subs[0] { nt.clone() } else { t.clone() }).collect();
    let out = dir.0.join("ฉากตัด (2025).mkv.partial");
    let (res, _) = run(&req(&movie, tracks, "mkv"), &HashMap::new(), &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(made.verified);
    // ตัวอ่านหนังไม่รับนามสกุล .partial เปลี่ยนเป็นชื่อจริงก่อนอ่าน (งานจริงทำใน finish_output)
    let out = { let fin = dir.0.join("ฉากตัด (2025).mkv"); std::fs::rename(&out, &fin).unwrap(); fin };
    let m2 = inspect(&tl, &out).unwrap();
    let key = |t: &Track| (t.kind.clone(), t.codec.clone(), t.lang.clone(), t.name.clone(), t.default);
    assert_eq!(m2.tracks.iter().map(key).collect::<Vec<_>>(), m.tracks.iter().map(key).collect::<Vec<_>>(), "แทร็ก ลำดับ ภาษา ชื่อ ธงหลัก เหมือนเดิม");
    let s2: Vec<&Track> = m2.tracks.iter().filter(|t| t.kind == "subtitle").collect();
    let got = read(&out, s2[0]);
    assert_eq!(lines(&got), lines(&doc), "ซับที่แก้อ่านกลับตรงทุกบรรทัด");
    assert!(got.events.iter().any(|e| e.text == "ใส่กลับเข้าหนังแล้ว"));
    assert_eq!(got.styles.len(), doc.styles.len(), "สไตล์ครบ");
    assert_eq!(lines(&read(&out, s2[1])), lines(&srt0), "ซับ SRT อีกแทร็กเหมือนเดิม");
    assert!(movie.exists(), "ไฟล์ต้นทางไม่ถูกแตะ");
}

/// BUGS ข้อ 114 ใส่ซับกลับเข้าหนังแล้วภาษาแบบละเอียด ป้ายพิเศษ ครบทุกแทร็ก และฝังฟอนต์ที่ซับเรียกเพิ่ม
/// เดิมส่งภาษาสามตัวทุกแทร็ก zh-Hant กลายเป็น chi · ป้ายของแทร็กที่ถูกแทนหาย · ฟอนต์ใหม่ไม่ถูกฝัง (ผู้ช่วยตรวจทาน R6)
#[test]
fn replace_keeps_ietf_flags_and_new_fonts() {
    let Some(src) = av("แก้ซับ/ฉากตัด (2025).mkv") else { return };
    let dir = temp_dir("ietf");
    let tl = tools();
    let movie = dir.0.join("ฉากตัด (2025).mkv");
    std::fs::copy(&src, &movie).unwrap();
    // ตั้งภาษาแบบละเอียดกับป้ายพิเศษให้ซับสองแทร็กของสำเนา
    let pe = crate::app::tools::run_tool(&tl, "mkvpropedit", [movie.as_os_str(), "--edit".as_ref(), "track:s1".as_ref(), "--set".as_ref(), "language-ietf=zh-Hant".as_ref(), "--set".as_ref(), "flag-hearing-impaired=1".as_ref(), "--set".as_ref(), "flag-commentary=1".as_ref(),
        "--edit".as_ref(), "track:s2".as_ref(), "--set".as_ref(), "language-ietf=es-419".as_ref(), "--set".as_ref(), "flag-original=1".as_ref()]).unwrap();
    assert!(pe.status.success(), "mkvpropedit {}", String::from_utf8_lossy(&pe.stdout));
    let m = inspect(&tl, &movie).unwrap();
    let subs: Vec<usize> = m.tracks.iter().enumerate().filter(|(_, t)| t.kind == "subtitle").map(|(i, _)| i).collect();
    let (s1, s2) = (&m.tracks[subs[0]], &m.tracks[subs[1]]);
    assert_eq!((s1.lang_ietf.as_str(), s1.hearing_impaired, s1.commentary), ("zh-Hant", true, true), "อ่านภาษาแบบละเอียดกับป้ายได้");
    assert_eq!((s2.lang_ietf.as_str(), s2.original), ("es-419", true));
    assert_eq!(mkv_lang(s1), "zh-Hant");
    // ซับที่แก้เรียกฟอนต์ Courier New ซึ่งหนังไม่มี (มีใน Windows)
    let (b, h) = crate::subtitle::subs::bytes_of(&tl, &dir.0, &movie, true, s1.tid, s1.ff.unwrap_or(s1.tid)).unwrap();
    let mut doc = crate::subtitle::subdoc::parse_doc(&b, &h, None);
    let i = doc.events.iter().position(|e| !e.comment).unwrap();
    doc.events[i].text = format!("{{\\fnCourier New}}{}", doc.events[i].text);
    let text = crate::subtitle::subdoc::render(&doc);
    let miss = missing_fonts(&tl, &dir.0, &movie, &text);
    let courier = miss.iter().find(|f| f.name == "Courier New").expect("Courier New อยู่ในรายการที่ต้องฝัง");
    assert!(courier.file.is_some(), "หาไฟล์ Courier New ใน Windows เจอ");
    let temp = dir.0.join("sub-ietf-test.ass");
    std::fs::write(&temp, crate::subtitle::subdoc::to_bytes(&doc).0).unwrap();
    // แทร็กใหม่ได้ภาษา ภาษาแบบละเอียด ป้าย จากแทร็กเดิม แบบ subRemux.ts
    let mut nt = add_file(&tl, &temp, m.duration).unwrap().tracks.remove(0);
    nt.lang = s1.lang.clone(); nt.lang_ietf = s1.lang_ietf.clone(); nt.lang_was = s1.lang.clone();
    nt.name = s1.name.clone(); nt.default = s1.default; nt.forced = s1.forced; nt.delay = s1.delay;
    nt.hearing_impaired = s1.hearing_impaired; nt.visual_impaired = s1.visual_impaired; nt.text_descriptions = s1.text_descriptions; nt.original = s1.original; nt.commentary = s1.commentary;
    let tracks: Vec<Track> = m.tracks.iter().enumerate().map(|(k, t)| if k == subs[0] { nt.clone() } else { t.clone() }).collect();
    let mut rq = req(&movie, tracks, "mkv");
    rq.fonts = vec![courier.file.clone().unwrap()];
    let out = dir.0.join("ใหม่.mkv.partial");
    let (res, _) = run(&rq, &HashMap::new(), &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(made.verified, "ตัวตรวจไฟล์ใหม่ผ่าน รวมภาษาแบบละเอียดกับป้าย");
    let out = { let fin = dir.0.join("ใหม่.mkv"); std::fs::rename(&out, &fin).unwrap(); fin };
    let m2 = inspect(&tl, &out).unwrap();
    let t2: Vec<&Track> = m2.tracks.iter().filter(|t| t.kind == "subtitle").collect();
    assert_eq!((t2[0].lang_ietf.as_str(), t2[0].hearing_impaired, t2[0].commentary), ("zh-Hant", true, true), "แทร็กที่แก้ได้ภาษาแบบละเอียดกับป้ายเดิม");
    assert_eq!((t2[1].lang_ietf.as_str(), t2[1].original), ("es-419", true), "แทร็กอื่นภาษาแบบละเอียดกับป้ายไม่หาย");
    let j = mkv_json(&tl, &out).unwrap();
    let names: Vec<String> = j["attachments"].as_array().map(|a| a.iter().map(|x| x["file_name"].as_str().unwrap_or("").to_lowercase()).collect()).unwrap_or_default();
    let fname = Path::new(courier.file.as_ref().unwrap()).file_name().unwrap().to_string_lossy().to_lowercase();
    assert!(names.contains(&fname), "ฝังฟอนต์ {fname} แล้ว ไฟล์แนบ {names:?}");
    // ซ้ำอีกรอบ ฟอนต์ที่ฝังแล้วไม่ขึ้นว่าขาด
    let again = missing_fonts(&tl, &dir.0, &out, &text);
    assert!(again.iter().all(|f| f.name != "Courier New"), "{again:?}");
}

#[test]
fn mkv_lang_uses_ietf_only_when_language_unchanged() {
    let mut t = Track { lang: "chi".into(), lang_was: "chi".into(), lang_ietf: "zh-Hant".into(), ..Default::default() };
    assert_eq!(mkv_lang(&t), "zh-Hant");
    t.lang = "jpn".into();
    assert_eq!(mkv_lang(&t), "jpn", "หน้าจอเปลี่ยนภาษาแล้ว ภาษาแบบละเอียดเดิมใช้ไม่ได้");
    t = Track { lang: "tha".into(), ..Default::default() };
    assert_eq!(mkv_lang(&t), "tha", "ไฟล์ไม่บอกภาษาแบบละเอียด");
    let a = mkv_args("M.mkv", &[Track { src: "M.mkv".into(), tid: 2, kind: "subtitle".into(), keep: true, lang: "tha".into(), hearing_impaired: true, commentary: true, ..Default::default() }], &[], &HashMap::new(), &[], &[], None, Path::new("O.mkv"));
    let s = a.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>().join(" ");
    assert!(s.contains("--hearing-impaired-flag 2:1") && s.contains("--commentary-flag 2:1") && !s.contains("--original-flag"), "{s}");
}

#[test]
fn movie_path_with_slashes_matches_same_name_output() {
    // ไฟล์ใหม่ชื่อเดิมต่อด้วย dir.join ต้องเทียบได้ว่าเป็นไฟล์เดิม แม้ที่อยู่ที่ส่งมาใช้ / (ใส่ซับกลับเข้าหนังจากหน้าแก้ซับ)
    let src = movie_path("D:/dev/tmp/ชั้นแก้ซับใส่กลับ/ฉากตัด (2025).mkv");
    let target = src.parent().unwrap().join("ฉากตัด (2025).mkv");
    assert_eq!(target.to_string_lossy().to_lowercase(), src.to_string_lossy().to_lowercase());
    // ไม่ทำเป็น \ ก่อน ได้ที่อยู่ไม่ตรงกัน งานรวมไฟล์จึงเคยตอบว่ามีไฟล์ชื่อนี้อยู่แล้ว
    let raw = PathBuf::from("D:/dev/tmp/x/a.mkv");
    assert_ne!(raw.parent().unwrap().join("a.mkv").to_string_lossy(), raw.to_string_lossy());
    assert_eq!(movie_path("D:\\หนัง\\a.mkv"), PathBuf::from("D:\\หนัง\\a.mkv"), "ที่อยู่แบบ \\ เหมือนเดิม");
}

#[test]
fn delay_words_from_file_names() {
    assert_eq!(delay_from_name("ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), Some(-120));
    assert_eq!(delay_from_name("Movie.T01 3_2ch 448Kbps DELAY 250ms.ac3"), Some(250));
    assert_eq!(delay_from_name("movie delay +48 ms.dts"), Some(48));
    assert_eq!(delay_from_name("movie_Delay_-1001ms.eac3"), Some(-1001));
    assert_eq!(delay_from_name("movie DELAY 0ms.ac3"), Some(0));
    assert_eq!(delay_from_name("Delayed Gratification (2020).ac3"), None);
    assert_eq!(delay_from_name("movie.delay2x.ac3"), None);
    assert_eq!(delay_from_name("movie.th.srt"), None);
    assert_eq!(delay_from_name("movie DELAY 9999999ms.ac3"), None, "เกิน 10 นาทีไม่เชื่อ");
}

#[test]
fn language_from_file_names() {
    assert_eq!(lang_from_name("ดาวตก (2024) พากย์ไทย DELAY -120ms"), Some("tha"));
    assert_eq!(lang_from_name("ดาวตก (2024).th"), Some("tha"));
    assert_eq!(lang_from_name("ดาวตก (2024).tis620.th"), Some("tha"));
    assert_eq!(lang_from_name("Polaris.2023.eng.forced"), Some("eng"));
    assert_eq!(lang_from_name("Polaris.2023.en"), Some("eng"));
    assert_eq!(lang_from_name("Polaris 2023 Thai Dub"), Some("tha"));
    assert_eq!(lang_from_name("Polaris.2023.JPN"), Some("jpn"));
    assert_eq!(lang_from_name("ซับอังกฤษ"), Some("eng"));
    assert_eq!(lang_from_name("It Follows (2014)"), None, "it ต้นชื่อไม่ใช่ภาษาอิตาลี");
    assert_eq!(lang_from_name("Polaris.2023.Commentary"), None);
    assert_eq!(lang_from_name("My Neighbor (1988)"), None);
}

#[test]
fn subtitle_charsets() {
    let Some(utf) = av("เสียงซับ/ดาวตก (2024).th.srt") else { return };
    let tis = av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap();
    assert_eq!(sub_charset(&utf).as_deref(), Some("UTF-8"));
    assert_eq!(sub_charset(&tis).as_deref(), Some("CP874"));
    assert_eq!(sub_charset(&av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap()), None, "ไฟล์เสียงไม่มีชุดอักษร");
}

fn t(src: &str, tid: u64, kind: &str, codec: &str) -> Track {
    Track { src: src.into(), tid, ff: Some(tid), kind: kind.into(), codec: codec.into(), lang: "und".into(), keep: true, mp4: "ok".into(), ..Default::default() }
}

#[test]
fn mkvmerge_command_order_flags_delay() {
    let mut v = t("M.mkv", 0, "video", "h264");
    v.in_movie = true;
    let mut a1 = t("M.mkv", 1, "audio", "aac");
    a1.in_movie = true;
    a1.lang = "eng".into();
    let mut s_old = t("M.mkv", 2, "subtitle", "hdmv_pgs_subtitle");
    s_old.in_movie = true;
    s_old.keep = false;
    let mut dub = t("D.ac3", 0, "audio", "ac3");
    dub.lang = "tha".into();
    dub.name = "พากย์ไทย 5.1".into();
    dub.default = true;
    dub.delay = -120;
    let mut sub = t("S.srt", 0, "subtitle", "subrip");
    sub.lang = "tha".into();
    sub.delay = 500;
    sub.charset = Some("CP874".into());
    // ลำดับใหม่ ภาพ พากย์ไทย อังกฤษ ซับไทย (ซับรูปเดิมเอาออก)
    let tracks = vec![v, dub, a1, s_old, sub];
    let cover = NewCover { name: "cover_land.jpg".into(), mime: "image/jpeg".into(), file: PathBuf::from("C.jpg"), sha: String::new() };
    let font = NewCover { name: "f01.ttf".into(), mime: "font/ttf".into(), file: PathBuf::from("F.ttf"), sha: String::new() };
    let args: Vec<String> = mkv_args("M.mkv", &tracks, &[3], &HashMap::new(), &[cover], &[font], None, Path::new("OUT.mkv.partial")).iter().map(|a| a.to_string_lossy().to_string()).collect();
    let s = args.join(" ");
    assert!(s.starts_with("--gui-mode --ui-language en -o OUT.mkv.partial -d 0 -a 1 -S --attachments 3 --language 0:und"), "{s}");
    assert!(s.contains("--track-name 1: --default-track-flag 1:0 --forced-display-flag 1:0 M.mkv"), "ชื่อว่างกับธงของเสียงเดิม {s}");
    assert!(s.contains("-D -a 0 -S --no-attachments --no-chapters --no-global-tags --language 0:tha --track-name 0:พากย์ไทย 5.1 --default-track-flag 0:1 --forced-display-flag 0:0 --sync 0:-120 D.ac3"), "{s}");
    assert!(s.contains("-D -A -s 0 --no-attachments --no-chapters --no-global-tags --language 0:tha --track-name 0: --default-track-flag 0:0 --forced-display-flag 0:0 --sync 0:500 --sub-charset 0:CP874 S.srt"), "{s}");
    assert!(s.contains("--attachment-name cover_land.jpg --attachment-mime-type image/jpeg --attach-file C.jpg --attachment-name f01.ttf --attachment-mime-type font/ttf --attach-file F.ttf"), "ฟอนต์ของซับแนบต่อจากปก {s}");
    assert!(s.ends_with("--track-order 0:0,1:0,0:1,2:0"), "ลำดับ ภาพ พากย์ไทย อังกฤษ ซับ {s}");
    // ไม่มีไฟล์แนบเหลือ → --no-attachments
    let args2: Vec<String> = mkv_args("M.mkv", &tracks, &[], &HashMap::new(), &[], &[], None, Path::new("O")).iter().map(|a| a.to_string_lossy().to_string()).collect();
    assert!(args2.join(" ").contains("-d 0 -a 1 -S --no-attachments --language"));
}

/// BUGS ข้อ 99 บทที่แก้ · ไม่แก้บทติดไปตามเดิม · แก้แล้วใช้ไฟล์บทแทนบทเดิม · ลบหมดไม่มีบท ทั้ง MKV และ MP4
#[test]
fn edited_chapters_replace_or_drop_movie_chapters() {
    let mut v = t("M.mkv", 0, "video", "h264");
    v.in_movie = true;
    let s = |a: Vec<OsString>| a.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>().join(" ");
    let keep = s(mkv_args("M.mkv", &[v.clone()], &[], &HashMap::new(), &[], &[], None, Path::new("O")));
    assert!(!keep.contains("--chapters") && !keep.contains("-D -A -S --no-attachments --no-chapters"), "ไม่แก้บท บทเดิมต้องติดไป {keep}");
    let rep = s(mkv_args("M.mkv", &[v.clone()], &[], &HashMap::new(), &[], &[], Some(Some(Path::new("C.txt"))), Path::new("O")));
    assert!(rep.contains("--no-attachments --no-chapters") && rep.contains("--chapter-charset UTF-8 --chapters C.txt"), "{rep}");
    let none = s(mkv_args("M.mkv", &[v.clone()], &[], &HashMap::new(), &[], &[], Some(None), Path::new("O")));
    assert!(none.contains("--no-chapters") && !none.contains("--chapters "), "{none}");
    let m_keep = s(mp4_args("M.mkv", &[v.clone()], None, None, Path::new("O.mp4")));
    assert!(m_keep.contains("-map_chapters 0"), "{m_keep}");
    let m_rep = s(mp4_args("M.mkv", &[v.clone()], Some(&Mp4Cover::File(PathBuf::from("C.jpg"))), Some(Some(Path::new("C.txt"))), Path::new("O.mp4")));
    assert!(m_rep.contains("-i C.jpg -f ffmetadata -i C.txt") && m_rep.contains("-map_chapters 2"), "ไฟล์บทเป็นช่องที่สามต่อจากหนังกับรูปปก {m_rep}");
    let m_none = s(mp4_args("M.mkv", &[v], None, Some(None), Path::new("O.mp4")));
    assert!(m_none.contains("-map_chapters -1"), "{m_none}");
}

#[test]
fn ffmpeg_mp4_command_offsets_per_input() {
    let mut v = t("M.mkv", 0, "video", "h264");
    v.in_movie = true;
    let mut a1 = t("M.mkv", 1, "audio", "aac");
    a1.in_movie = true;
    a1.delay = 200; // เสียงเดิมของหนังเลื่อน ต้องเปิดหนังเป็นไฟล์ต้นทางอีกช่องที่มี -itsoffset
    let mut dub = t("D.ac3", 0, "audio", "ac3");
    dub.delay = -120;
    dub.default = true;
    let mut sub = t("S.srt", 0, "subtitle", "subrip");
    sub.charset = Some("CP874".into());
    sub.lang = "tha".into();
    let args: Vec<String> = mp4_args("M.mkv", &[v, a1, dub, sub], Some(&Mp4Cover::File(PathBuf::from("C.jpg"))), None, Path::new("O.mp4.partial"))
        .iter().map(|a| a.to_string_lossy().to_string()).collect();
    let s = args.join(" ");
    assert!(s.contains("-n -v error"), "ไม่เขียนทับ {s}");
    assert!(s.contains("-i M.mkv -itsoffset 0.200 -i M.mkv -itsoffset -0.120 -i D.ac3 -sub_charenc CP874 -i S.srt -i C.jpg"), "{s}");
    assert!(s.contains("-map 0:0 -map 1:1 -map 2:0 -map 3:0 -map 4:0 -c copy -c:s mov_text"), "{s}");
    assert!(s.contains("-metadata:s:3 language=tha"), "{s}");
    assert!(s.contains("-disposition:2 default"), "{s}");
    assert!(s.contains("-disposition:1 0"), "{s}");
    assert!(s.contains("-disposition:4 attached_pic"), "{s}");
    assert!(s.ends_with("-map_metadata 0 -map_chapters 0 -f mp4 O.mp4.partial"), "{s}");
}

#[test]
fn probe_movie_and_added_files() {
    let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
    let m = inspect(&tools(), &movie).unwrap();
    assert_eq!(m.tracks.len(), 2);
    assert!(m.mp4_ok);
    assert_eq!((m.tracks[0].kind.as_str(), m.tracks[0].codec.as_str(), m.tracks[0].ff), ("video", "h264", Some(0)));
    assert_eq!((m.tracks[1].kind.as_str(), m.tracks[1].codec.as_str(), m.tracks[1].lang.as_str(), m.tracks[1].name.as_str()), ("audio", "aac", "eng", "English"));
    assert!((m.duration.unwrap() - 60.0).abs() < 0.1);
    let dub = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap();
    assert_eq!(dub.delay_from_name, Some(-120));
    assert_eq!(dub.lang_from_name.as_deref(), Some("tha"));
    let a = &dub.tracks[0];
    assert_eq!((a.kind.as_str(), a.codec.as_str(), a.channels, a.delay, a.lang.as_str(), a.in_movie), ("audio", "ac3", Some(6), -120, "tha", false));
    assert!((dub.longer_by.unwrap() - 0.107).abs() < 0.05, "ยาวกว่าหนังราว 0.1 วินาที ได้ {:?}", dub.longer_by);
    let tis = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap(), m.duration).unwrap();
    assert_eq!(tis.tracks[0].charset.as_deref(), Some("CP874"));
    assert_eq!(tis.tracks[0].lang, "tha");
    assert_eq!(tis.tracks[0].frames, Some(3), "th.srt มี 3 บรรทัด");
    let vtt = add_file(&tools(), &av("เสียงซับ/ดาวตก (2024).en.vtt").unwrap(), m.duration).unwrap();
    assert_eq!((vtt.tracks[0].codec.as_str(), vtt.tracks[0].lang.as_str()), ("webvtt", "eng"));
    let img = inspect(&tools(), &av("เสียงซับ/ซับรูป (2024).mkv").unwrap()).unwrap();
    let subs: Vec<&str> = img.tracks.iter().filter(|t| t.kind == "subtitle").map(|t| t.codec.as_str()).collect();
    assert_eq!(subs, ["hdmv_pgs_subtitle", "dvd_subtitle"]);
}

/// ดาวตก + พากย์ไทย 5.1 (DELAY -120) + ซับไทย UTF-8 (+500) + ซับไทย TIS-620 + ซับอังกฤษ VTT + ปกตั้งใหม่ → MKV
#[test]
fn merge_to_mkv_real_files() {
    let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
    let dir = temp_dir("mkv");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let mut tracks = m.tracks.clone();
    tracks[1].delay = 120; // เสียงอังกฤษเดิมเลื่อนไปหลัง 120 ms วัดจากเวลาเริ่มของแพ็กเก็ตแรก
    let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
    dub.name = "พากย์ไทย 5.1".into();
    dub.default = true;
    let mut th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
    th.delay = 500;
    th.default = true;
    th.name = "ไทย".into();
    let tis = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).tis620.th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
    let vtt = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).en.vtt").unwrap(), m.duration).unwrap().tracks.remove(0);
    // ลำดับใหม่ ภาพ พากย์ไทย อังกฤษ ซับไทย ซับไทยเก่า ซับอังกฤษ
    let order = vec![tracks[0].clone(), dub, tracks[1].clone(), th, tis, vtt];
    let mut r = req(&movie, order, "mkv");
    r.covers.portrait = "new".into();
    let poster = std::fs::read(av("รูป/poster.jpg").unwrap()).unwrap();
    let covers = HashMap::from([("cover".to_string(), (poster.clone(), "jpg".to_string()))]);
    let out = dir.0.join("ดาวตก (2024).mkv.partial");
    let (res, _notes) = run(&r, &covers, &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(made.verified);
    assert_eq!(made.counts, Counts { video: 1, audio: 2, subs: 3 });
    // ลำดับ ภาษา ชื่อ ธงหลัก
    let j = mkv_json(&tl, &out).unwrap();
    let got: Vec<(String, String, String, bool)> = j["tracks"].as_array().unwrap().iter().map(|t| (
        t["codec"].as_str().unwrap().to_string(), t["properties"]["language"].as_str().unwrap_or("").to_string(),
        t["properties"]["track_name"].as_str().unwrap_or("").to_string(), t["properties"]["default_track"].as_bool().unwrap_or(false),
    )).collect();
    assert_eq!(got[1], ("AC-3".into(), "tha".into(), "พากย์ไทย 5.1".into(), true));
    assert_eq!(got[2], ("AAC".into(), "eng".into(), "English".into(), false));
    assert_eq!(got[3], ("SubRip/SRT".into(), "tha".into(), "ไทย".into(), true));
    assert_eq!(got[4], ("SubRip/SRT".into(), "tha".into(), "".into(), false));
    assert_eq!(got[5].0, "SubRip/SRT", "VTT แปลงเป็น SRT ก่อนใส่ MKV");
    assert!(_notes.iter().any(|n| n.contains("แปลงเป็น SRT")), "{_notes:?}");
    // ดีเลย์ · เสียงอังกฤษ +120 ms เริ่มที่ 0.120 · ซับไทย +500 ms บรรทัดแรก 1.0 → 1.5 วินาที
    // เสียง AAC ต้นทางเริ่มที่ −0.021 (หัวของตัวเข้ารหัส AAC) วัดส่วนต่างจากต้นทาง
    let a_eng = first_packet(&out, "a:1") - first_packet(&movie, "a:0");
    assert!((a_eng - 0.120).abs() <= 0.005, "เสียงอังกฤษเลื่อน {a_eng}");
    let s_th = first_packet(&out, "s:0");
    assert!((s_th - 1.5).abs() <= 0.005, "ซับไทยบรรทัดแรก {s_th}");
    // พากย์ไทย −120 ms · เฟรมแรกที่เหลืออยู่ภายใน 32 ms (เฟรม AC-3 ยาว 32 ms) และแทร็กสั้นลงราว 120 ms
    let a_dub = first_packet(&out, "a:0");
    assert!((0.0..0.033).contains(&a_dub), "พากย์ไทยเริ่มที่ {a_dub}");
    // ซับ TIS-620 อ่านเป็นภาษาไทยถูก
    let o = crate::app::tools::run_tool(&tl, "ffmpeg", ["-v", "error", "-i"].iter().map(OsString::from).chain([out.as_os_str().to_owned()])
        .chain(["-map", "0:s:1", "-f", "srt", "-"].iter().map(OsString::from))).unwrap();
    let text = String::from_utf8_lossy(&o.stdout).to_string();
    assert!(text.contains("สวัสดีค่ะ นี่คือซับไตเติลภาษาไทย"), "ซับ TIS-620 อ่านได้ {text}");
    // ปก
    let atts = mkv_attachments(&tl, &out).unwrap();
    assert_eq!(atts.iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["cover.jpg"]);
    // ไฟล์ต้นทางไม่ถูกแตะ
    assert!(movie.exists());
}

/// BUGS ข้อ 99 รวมไฟล์จริงพร้อมบทที่แก้ แล้วอ่านบทของไฟล์ใหม่กลับมาเทียบ ทั้ง MKV และ MP4 · ลบบทหมดแล้วไฟล์ใหม่ไม่มีบท
#[test]
fn merge_with_edited_chapters_real_files() {
    let Some(movie) = av("หนัง/ดาวเหนือ (2023).mkv") else { return };
    let tl = tools();
    let before = crate::media::chapters::read(&tl, &movie).unwrap();
    assert!(!before.is_empty(), "ไฟล์ทดสอบต้องมีบทเดิม");
    let m = inspect(&tl, &movie).unwrap();
    let edited = vec![
        crate::media::chapters::Chapter { start: 8.5, title: "ฉากกลาง = ทดสอบ; ชื่อ".into() },
        crate::media::chapters::Chapter { start: 0.0, title: "เปิดเรื่อง".into() },
    ];
    for out_kind in ["mkv", "mp4"] {
        let dir = temp_dir(&format!("chap-{out_kind}"));
        let mut r = req(&movie, m.tracks.clone(), out_kind);
        r.chapters = Some(edited.clone());
        let out = dir.0.join(format!("ดาวเหนือ (2023).{out_kind}.partial"));
        let (res, _) = run(&r, &HashMap::new(), &out, &dir.0);
        res.unwrap_or_else(|p| panic!("{out_kind} {} {:?}", p.title, p.detail));
        let got = crate::media::chapters::read(&tl, &out).unwrap();
        assert_eq!(got.iter().map(|c| c.title.as_str()).collect::<Vec<_>>(), vec!["เปิดเรื่อง", "ฉากกลาง = ทดสอบ; ชื่อ"], "{out_kind}");
        assert!((got[1].start - 8.5).abs() < 0.01, "{out_kind} เวลาบทที่สอง {}", got[1].start);
        // ลบบทหมด
        let dir2 = temp_dir(&format!("chap0-{out_kind}"));
        let mut r0 = req(&movie, m.tracks.clone(), out_kind);
        r0.chapters = Some(vec![]);
        let out0 = dir2.0.join(format!("ดาวเหนือ (2023).{out_kind}.partial"));
        let (res0, _) = run(&r0, &HashMap::new(), &out0, &dir2.0);
        res0.unwrap_or_else(|p| panic!("{out_kind} ลบบท {} {:?}", p.title, p.detail));
        assert!(crate::media::chapters::read(&tl, &out0).unwrap().is_empty(), "{out_kind} ลบบทหมดแล้วต้องไม่มีบท");
    }
    assert_eq!(crate::media::chapters::read(&tl, &movie).unwrap(), before, "ไฟล์หนังเดิมไม่ถูกแตะ");
}

/// MP4 · พากย์ไทย −120 + ซับไทย +500 + ปกตั้งใหม่ · ซับรูปใส่ไม่ได้ต้องถูกกันก่อนเริ่ม (กันที่ apply ทดสอบตัวสร้างคำสั่งแทน)
#[test]
fn merge_to_mp4_real_files() {
    let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
    let dir = temp_dir("mp4");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
    dub.default = true;
    let mut th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
    th.delay = 500;
    let mut eng = m.tracks[1].clone();
    eng.default = false;
    let mut r = req(&movie, vec![m.tracks[0].clone(), dub, eng, th], "mp4");
    r.covers.portrait = "new".into();
    let poster = std::fs::read(av("รูป/poster.jpg").unwrap()).unwrap();
    let covers = HashMap::from([("cover".to_string(), (poster, "jpg".to_string()))]);
    let out = dir.0.join("ดาวตก (2024).mp4.partial");
    let (res, notes) = run(&r, &covers, &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(made.verified);
    assert_eq!(made.counts, Counts { video: 1, audio: 2, subs: 1 });
    assert!(notes.iter().any(|n| n.contains("MP4 ตั้งซับแรกเป็นหลักเอง")), "{notes:?}");
    let s_th = first_packet(&out, "s:0");
    assert!((s_th - 1.5).abs() <= 0.01, "ซับไทยบรรทัดแรก {s_th}");
    let j = ffprobe_json(&tl, &out).unwrap();
    let st = j["streams"].as_array().unwrap();
    assert_eq!(st[1]["codec_name"], "ac3");
    assert_eq!(st[1]["tags"]["language"], "tha");
    assert_eq!(st[1]["disposition"]["default"], 1);
    assert_eq!(st[2]["disposition"]["default"], 0);
    assert_eq!(st[3]["codec_name"], "mov_text");
    assert!(crate::app::outfile::has_attached_pic(&j));
}

/// ฟอนต์ที่แนบในหนังต้องติดไปด้วย · เพิ่มซับไทยเข้าไป
#[test]
fn fonts_stay_after_merge() {
    let Some(movie) = av("เสียงซับ/ฟอนต์แนบ (2024).mkv") else { return };
    let dir = temp_dir("font");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    assert_eq!(m.attachments.iter().map(|a| a.name.as_str()).collect::<Vec<_>>(), ["tahoma.ttf"]);
    let th = add_file(&tl, &av("เสียงซับ/ดาวตก (2024).th.srt").unwrap(), m.duration).unwrap().tracks.remove(0);
    let mut tracks = m.tracks.clone();
    tracks.push(th);
    let out = dir.0.join("f.mkv.partial");
    let (res, _) = run(&req(&movie, tracks, "mkv"), &HashMap::new(), &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert_eq!(made.counts.subs, 2);
    assert_eq!(mkv_attachments(&tl, &out).unwrap().iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["tahoma.ttf"]);
}

/// ซับ ASS ที่เพิ่มเข้าไป หาไฟล์ฟอนต์ที่ซับใช้ แล้วฝังไปกับไฟล์ใหม่ (พี่กันสั่ง 8 พ.ย. 2569)
/// ฟอนต์ในโฟลเดอร์ข้างซับมาก่อน ฟอนต์ของ Windows ตามมา · ชื่อซ้ำกับฟอนต์ที่หนังมีอยู่แล้วไม่ใส่ซ้ำ · ฟอนต์ที่ไม่มีในเครื่องบอกว่าไม่เจอ
#[test]
fn ass_fonts_are_found_and_embedded() {
    let Some(movie) = av("เสียงซับ/ฟอนต์แนบ (2024).mkv") else { return };
    let dir = temp_dir("assfont");
    let tl = tools();
    let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
    std::fs::create_dir_all(dir.0.join("fonts")).unwrap();
    std::fs::copy(win.join("georgia.ttf"), dir.0.join("fonts").join("f01.ttf")).unwrap();
    let ass = dir.0.join("ป้าย.th.ass");
    std::fs::write(&ass, "\u{feff}[Script Info]\nScriptType: v4.00+\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Tahoma,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,222\nStyle: Sign,Georgia,40,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,8,20,20,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\fnComic Sans MS}สวัสดี\nDialogue: 0,0:00:04.00,0:00:06.00,Sign,,0,0,0,,{\\fnฟอนต์ไม่มีในเครื่อง}ป้าย\n").unwrap();
    let m = inspect(&tl, &movie).unwrap();
    let added = add_file(&tl, &ass, m.duration).unwrap();
    let f: Vec<(String, String, Option<String>)> = added.fonts.iter().map(|h| (h.name.clone(), h.from.clone(), h.file.as_ref().and_then(|p| Path::new(p).file_name()).map(|n| n.to_string_lossy().to_lowercase()))).collect();
    assert_eq!(f, [
        ("Tahoma".into(), "system".into(), Some("tahoma.ttf".into())),
        ("Georgia".into(), "folder".into(), Some("f01.ttf".into())),
        ("Comic Sans MS".into(), "system".into(), Some("comic.ttf".into())),
        ("ฟอนต์ไม่มีในเครื่อง".into(), "".into(), None),
    ], "{:?}", added.fonts);
    let mut tracks = m.tracks.clone();
    tracks.extend(added.tracks);
    let mut r = req(&movie, tracks, "mkv");
    r.fonts = added.fonts.iter().filter_map(|h| h.file.clone()).collect();
    let out = dir.0.join("af.mkv.partial");
    let (res, notes) = run(&r, &HashMap::new(), &out, &dir.0);
    res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    let mut atts: Vec<(String, String)> = mkv_attachments(&tl, &out).unwrap().into_iter().map(|a| (a.0.to_lowercase(), a.1)).collect();
    atts.sort();
    assert_eq!(atts.iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["comic.ttf", "f01.ttf", "tahoma.ttf"], "tahoma.ttf มีในหนังแล้วไม่ใส่ซ้ำ");
    assert!(atts.iter().filter(|a| a.0 != "tahoma.ttf").all(|a| a.1 == "font/ttf"), "{atts:?}");
    assert!(notes.iter().any(|n| n.contains("ไม่ใส่ซ้ำ")) && notes.iter().any(|n| n.contains("ฝังฟอนต์ของซับ 2 ไฟล์")), "{notes:?}");
    // MP4 ใส่ฟอนต์ไม่ได้ บอกในผล · ฟอนต์ที่ไม่มีไฟล์แล้ว หยุดพร้อมบอก ไม่รวมต่อเงียบ ๆ
    let mut bad = r.clone();
    bad.fonts = vec![dir.0.join("หายไปแล้ว.ttf").to_string_lossy().to_string()];
    let (res, _) = run(&bad, &HashMap::new(), &dir.0.join("bad.mkv.partial"), &dir.0);
    assert_eq!(res.err().map(|p| p.title), Some("หาไฟล์ฟอนต์ไม่เจอ".to_string()));
}

/// หนัง MP4 ที่มีปกฝัง รวมซับออกเป็น MP4 ปกต้องยังอยู่ (ผู้ช่วยตรวจขั้น 10 ข้อ 1 · เดิมดึงปกด้วย mkvextract ซึ่งเปิด MP4 ไม่ได้ ปกหายเงียบ)
#[test]
fn mp4_cover_stays_when_merging_to_mp4() {
    let (Some(srt), Some(poster)) = (av("เสียงซับ/ดาวตก (2024).th.srt"), av("รูป/poster.jpg")) else { return };
    let dir = temp_dir("mp4cover");
    let tl = tools();
    let movie = dir.0.join("มีปก.mp4");
    let o = crate::app::tools::run_tool(&tl, "ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3"].iter().map(OsString::from)
        .chain([OsString::from("-i"), poster.into_os_string()])
        .chain(["-map", "0:v", "-map", "1:a", "-map", "2:v", "-c:v:0", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-c:v:1", "copy", "-disposition:v:1", "attached_pic"].iter().map(OsString::from))
        .chain([movie.clone().into_os_string()])).unwrap();
    assert!(o.status.success(), "ทำไฟล์ทดสอบไม่ได้ {}", String::from_utf8_lossy(&o.stderr));
    let m = inspect(&tl, &movie).unwrap();
    assert!(m.attachments.iter().any(|a| a.name == "cover.jpg"), "mkvmerge รายงานปกของ MP4 เป็นไฟล์แนบ");
    let mut tracks = m.tracks.clone();
    tracks.push(add_file(&tl, &srt, m.duration).unwrap().tracks.remove(0));
    let out = dir.0.join("ใหม่.mp4.partial");
    let (res, _) = run(&req(&movie, tracks, "mp4"), &HashMap::new(), &out, &dir.0);
    res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(attached_pic_index(&tl, &out).is_some(), "ไฟล์ MP4 ใหม่ต้องมีปก");
    assert!(!is_matroska(&movie) && is_matroska(&av("เสียงซับ/ดาวตก (2024).mkv").unwrap()));
}

/// เอาปกเดิมออก · เอาซับรูป VobSub ออก เหลือ PGS
#[test]
fn remove_cover_and_image_sub() {
    let Some(harbor) = av("หนัง/Harbor Lights (2021).mkv") else { return };
    let dir = temp_dir("rm");
    let tl = tools();
    let m = inspect(&tl, &harbor).unwrap();
    assert_eq!(m.attachments[0].name, "cover.jpg");
    let mut r = req(&harbor, m.tracks.clone(), "mkv");
    r.covers.portrait = "remove".into();
    let out = dir.0.join("h.mkv.partial");
    let (res, notes) = run(&r, &HashMap::new(), &out, &dir.0);
    res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(mkv_attachments(&tl, &out).unwrap().is_empty());
    assert!(notes.iter().any(|n| n.contains("เอารูปปก cover.jpg ออก")), "{notes:?}");

    let img = av("เสียงซับ/ซับรูป (2024).mkv").unwrap();
    let m2 = inspect(&tl, &img).unwrap();
    let mut tracks = m2.tracks.clone();
    tracks.iter_mut().filter(|t| t.codec == "dvd_subtitle").for_each(|t| t.keep = false);
    let out2 = dir.0.join("i.mkv.partial");
    let (res2, _) = run(&req(&img, tracks.clone(), "mkv"), &HashMap::new(), &out2, &dir.0);
    let made = res2.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert_eq!(made.counts.subs, 1);
    let codecs: Vec<String> = streams_of(&ffprobe_json(&tl, &out2).unwrap()).into_iter().filter(|s| s.kind == "subtitle").map(|s| s.codec).collect();
    assert_eq!(codecs, ["hdmv_pgs_subtitle"]);
}

/// ตัวตรวจจับของผิดได้ · สั่งภาษาหนึ่ง แต่ไฟล์ที่ได้เป็นอีกภาษา ต้องไม่ผ่าน
#[test]
fn verify_catches_wrong_language() {
    let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
    let dir = temp_dir("bad");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let mut wrong = m.tracks.clone();
    wrong[1].lang = "jpn".into();
    let e = verify_mkv(&tl, &dir.0, &movie, &wrong, &[], &[], m.duration).unwrap_err();
    assert!(e.iter().any(|w| w.contains("ภาษา eng ที่สั่ง jpn")), "{e:?}");
    let mut order = m.tracks.clone();
    order.swap(0, 1);
    let e2 = verify_mkv(&tl, &dir.0, &movie, &order, &[], &[], m.duration).unwrap_err();
    assert!(e2.iter().any(|w| w.contains("แทร็กไม่ตรงที่สั่ง")), "{e2:?}");
}

/// แปลงเสียงตอนรวม · พากย์ไทย AC-3 แทนที่เป็น Opus · เสียงอังกฤษ AAC ในหนังเพิ่มคู่เป็น FLAC
#[test]
fn convert_while_merging() {
    let Some(movie) = av("เสียงซับ/ดาวตก (2024).mkv") else { return };
    let dir = temp_dir("conv");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let mut dub = add_file(&tl, &av("เสียงซับ/ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3").unwrap(), m.duration).unwrap().tracks.remove(0);
    dub.convert = Some(crate::audio::encode::EncodeSpec { codec: "opus".into(), encoder: "native".into(), p: serde_json::json!({"bitrate": 256}).as_object().cloned().unwrap(), ..Default::default() });
    dub.name = "พากย์ไทย Opus".into();
    let mut eng = m.tracks[1].clone();
    eng.convert = Some(crate::audio::encode::EncodeSpec { codec: "flac".into(), encoder: "native".into(), ..Default::default() });
    eng.pair = true;
    let out = dir.0.join("c.mkv.partial");
    let (res, notes) = run(&req(&movie, vec![m.tracks[0].clone(), dub, eng], "mkv"), &HashMap::new(), &out, &dir.0);
    let made = res.unwrap_or_else(|p| panic!("{} {:?}", p.title, p.detail));
    assert!(made.verified);
    let codecs: Vec<String> = streams_of(&ffprobe_json(&tl, &out).unwrap()).into_iter().map(|s| s.codec).collect();
    assert_eq!(codecs, ["h264", "opus", "aac", "flac"], "{notes:?}");
    let j = mkv_json(&tl, &out).unwrap();
    assert_eq!(j["tracks"][1]["properties"]["track_name"], "พากย์ไทย Opus");
    assert_eq!(j["tracks"][3]["properties"]["track_name"], "English FLAC");
    assert_eq!(j["tracks"][1]["properties"]["audio_channels"], 6, "Opus เก็บ 5.1 ครบ");
    assert!(notes.iter().any(|n| n.contains("เพิ่มคู่กับแทร็กเดิม")), "{notes:?}");
    // ไฟล์ชั่วคราวของการแปลงถูกลบหมด
    assert!(std::fs::read_dir(&dir.0).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with("merge-conv-")));
}

#[test]
fn converted_size_estimates() {
    let mut t = Track { kind: "audio".into(), duration: Some(7680.0), channels: Some(6), rate: Some(48000), keep: true, ..Default::default() };
    assert_eq!(conv_estimate(&t), None, "ไม่แปลง ไม่บวก");
    t.convert = Some(crate::audio::encode::EncodeSpec { codec: "opus".into(), p: serde_json::json!({"bitrate": 384}).as_object().cloned().unwrap(), ..Default::default() });
    // 384 kbps 7,680 วินาที = 368,640,000 ไบต์ (ราว 352 MB ตรงกับมอคอัป 1 kbps ≈ 0.96 MB)
    assert_eq!(conv_estimate(&t), Some(368_640_000));
    t.convert = Some(crate::audio::encode::EncodeSpec { codec: "flac".into(), ..Default::default() });
    // 5.1 24 บิต 48 kHz 7,680 วินาที เสียงดิบ 6.6 พันล้านไบต์ (มอคอัป WAV ราว 6.2 GB) 60% ราว 3.98 พันล้าน
    assert_eq!(conv_estimate(&t), Some((7680.0 * 48000.0 * 6.0 * 3.0 * 0.6) as u64));
    t.convert = Some(crate::audio::encode::EncodeSpec { codec: "mp3".into(), channels: Some(2), speed: Some([25.0, 23.976]), ..Default::default() });
    // MP3 VBR ไม่มีบิตเรต คิด 320 · ยืดความเร็วแล้วยาวขึ้น
    assert_eq!(conv_estimate(&t), Some((7680.0 * 25.0 / 23.976 * 320_000.0 / 8.0) as u64));
}

/// กดหยุดกลางทาง ไฟล์ทำค้างถูกลบ
#[test]
fn cancel_removes_partial() {
    let Some(movie) = av("เสียงซับ/ซับรูป (2024).mkv") else { return };
    let dir = temp_dir("stop");
    let tl = tools();
    let m = inspect(&tl, &movie).unwrap();
    let out = dir.0.join("s.mkv.partial");
    let mut notes = vec![];
    let r = produce(&tl, &dir.0, &req(&movie, m.tracks.clone(), "mkv"), &HashMap::new(), &out, &|| true, &|_, _, _, _| {}, &mut notes, "ไม่แตะ");
    let p = r.err().expect("ต้องหยุด");
    assert_eq!(p.kind, "cancelled");
    assert!(!out.exists(), "ไฟล์ทำค้างต้องถูกลบ");
}
