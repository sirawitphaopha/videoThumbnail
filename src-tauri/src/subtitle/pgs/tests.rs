//! เทสของ pgs.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn rle_matches_pgs_rules() {
    // แถวเดียว 2 โปร่งใส 1 สี 5 · 70 จุดสี 7 · 64 โปร่งใส
    let mut px = vec![0u8, 0, 5];
    px.extend(std::iter::repeat_n(7u8, 70));
    px.extend(std::iter::repeat_n(0u8, 64));
    let w = px.len();
    let r = rle(&px, w, 1);
    assert_eq!(r, vec![0, 2, 5, 0, 0xC0, 70, 7, 0, 0x40, 64, 0, 0]);
    // สีเดียวกันสามจุดใช้แบบนับจำนวน สองจุดเขียนตรง
    assert_eq!(rle(&[3, 3, 4, 4, 4], 5, 1), vec![3, 3, 0, 0x83, 4, 0, 0]);
}

#[test]
fn animated_tags_only_inside_braces() {
    assert!(animated("{\\fad(200,200)}สวัสดี"));
    assert!(animated("{\\k20}คา{\\kf30}รา"));
    assert!(animated("{\\move(10,10,100,100)}x"));
    assert!(!animated("{\\pos(10,10)\\b1}ตัวหนา"));
    assert!(!animated("ข้อความ \\t( ที่ไม่ได้อยู่ในแท็ก"));
}

#[test]
fn straight_undoes_premultiplied_edges() {
    let c = straight(&[70, 70, 70, 76]).to_le_bytes();
    assert_eq!(c, [235, 235, 235, 76], "ขอบตัวอักษรขาวที่ ffmpeg คูณความโปร่งใสมา หารกลับเป็นขาว");
    assert_eq!(straight(&[10, 20, 30, 255]).to_le_bytes(), [10, 20, 30, 255]);
    assert_eq!(straight(&[200, 0, 0, 100]).to_le_bytes()[0], 255, "เกิน 255 ตัดที่ 255");
}

#[test]
fn ycrcb_white_black_red() {
    assert_eq!(ycrcb(255, 255, 255, true), (235, 128, 128));
    assert_eq!(ycrcb(0, 0, 0, true), (16, 128, 128));
    let (y, cr, cb) = ycrcb(255, 0, 0, true);
    assert_eq!((y, cr, cb), (63, 240, 102));
}

#[test]
fn two_groups_and_merge() {
    let used = [false, true, true, false, false, true, false, true, true, false];
    let (g, m) = row_groups(&used, 2);
    assert!(m, "สามกลุ่มต้องรวม");
    assert_eq!(g, vec![(1, 2), (5, 8)]);
}

fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

/// ส่วนของไฟล์ .sup เป็นรายการ (เวลา ms, ชนิด, ข้อมูล)
fn segments(b: &[u8]) -> Vec<(u32, u8, Vec<u8>)> {
    let mut out = vec![];
    let mut i = 0;
    while i + 13 <= b.len() {
        assert_eq!(&b[i..i + 2], b"PG", "หัวส่วนที่ไบต์ {i}");
        let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) / 90;
        let kind = b[i + 10];
        let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        out.push((pts, kind, b[i + 13..i + 13 + n].to_vec()));
        i += 13 + n;
    }
    assert_eq!(i, b.len(), "ไฟล์จบพอดีส่วนสุดท้าย");
    out
}

/// ภาพ RGB ทั้งจอที่เวลา t วินาที บนพื้นดำ · sup ซ้อนด้วย overlay ของ ffmpeg หรือวาดซับ ASS ด้วย libass
fn frame(input: &[OsString], vf: &str, w: u32, h: u32, t: f64) -> Vec<u8> {
    let mut a: Vec<OsString> = ["-v", "error", "-f", "lavfi", "-i"].iter().map(OsString::from).collect();
    a.push(format!("color=c=black:s={w}x{h}:r=25:d=6").into());
    a.extend(input.iter().cloned());
    a.extend(["-filter_complex".into(), vf.into(), "-ss".into(), format!("{t:.3}").into(), "-frames:v".into(), "1".into(), "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into()]);
    let o = crate::app::tools::run_tool(&tools(), "ffmpeg", &a).unwrap();
    assert!(o.status.success(), "ffmpeg {}", String::from_utf8_lossy(&o.stderr));
    assert_eq!(o.stdout.len(), (w * h * 3) as usize);
    o.stdout
}

#[test]
fn export_real_sup_matches_libass() {
    let dir = std::env::temp_dir().join(format!("movie-shelf-pgs-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // สีเหลืองขอบน้ำเงิน ไว้ดูว่าสีแปลง YCbCr ถูกแบบ (ขาวดำแปลงแบบไหนก็ได้ค่าเดิม)
    let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,60,&H0000FFFF,&H000000FF,&H00FF0000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Bottom line\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8}Top sign\r\nDialogue: 0,0:00:03.00,0:00:03.50,Default,,0,0,0,,{\\fad(300,0)}Fade\r\n";
    let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
    assert_eq!(doc.events.len(), 3);
    let target = dir.join("out.sup");
    let req = PgsReq { target: target.display().to_string(), w: 1280, h: 720, fps_num: 24000, fps_den: 1001, movie: None, ..Default::default() };
    let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    assert_eq!(r.bytes as usize, b.len());
    let seg = segments(&b);
    // ชุดแสดงภาพ (PCS ที่มีภาพ) กับชุดล้างจอ (PCS ไม่มีภาพ) ตามเวลา
    let pcs: Vec<(u32, u8)> = seg.iter().filter(|s| s.1 == 0x16).map(|s| (s.0, s.2[10])).collect();
    assert_eq!(pcs[0], (500, 1), "0.5 วินาที บรรทัดล่างหนึ่งกรอบ {pcs:?}");
    assert_eq!(pcs[1], (1000, 2), "1 วินาที บรรทัดล่างกับป้ายบนสองกรอบ {pcs:?}");
    assert_eq!(pcs[2], (2000, 0), "2 วินาที ล้างจอ {pcs:?}");
    let fade: Vec<&(u32, u8)> = pcs.iter().filter(|p| p.0 >= 3000 && p.0 < 3500 && p.1 > 0).collect();
    assert!(fade.len() >= 5, "บรรทัดเฟดวาดทุกเฟรม ได้ {} ภาพ", fade.len());
    assert_eq!(*pcs.last().unwrap(), (3500, 0), "จบเฟดล้างจอ");
    // ชุดแรกเป็นจุดเริ่มชุดใหม่ ชุดล้างจอเป็นแบบปกติ · รหัสอัตราเฟรม 23.976
    let first = &seg.iter().find(|s| s.1 == 0x16).unwrap().2;
    assert_eq!((first[0..2].to_vec(), first[4], first[7]), (1280u16.to_be_bytes().to_vec(), 0x10, 0x80));
    assert!(r.images >= 8 && r.max_colors > 0, "{r:?}");
    // ffmpeg ถอดไฟล์ได้ และภาพตรงกับที่ libass วาด สีเหลืองยังเหลือง (ค่าต่างเฉลี่ยต่ำ)
    // -copyts ให้ใช้เวลาเดิมของไฟล์ ไม่งั้น ffmpeg ขยับไฟล์ที่เริ่ม 0.5 วินาทีให้เริ่มที่ศูนย์ ภาพขึ้นเร็วไปครึ่งวินาที
    let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
    let a = frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, 1.5);
    let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
    let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
    let l = frame(&[], &vf, 1280, 720, 1.5);
    let lit = |v: &[u8]| v.chunks(3).filter(|p| p[0] as u32 + p[1] as u32 + p[2] as u32 > 60).count();
    assert!(lit(&l) > 2000, "libass วาดซับขึ้น");
    let diff: u64 = a.iter().zip(&l).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as u64).sum();
    let mean = diff as f64 / a.len() as f64;
    assert!(mean < 1.5, "ภาพจาก .sup ต่างจาก libass เฉลี่ย {mean:.2} ต่อช่องสี");
    // จุดเหลือง (แดงเขียวสูง น้ำเงินต่ำ) มีในภาพจาก .sup ราวเท่าของ libass
    let yellow = |v: &[u8]| v.chunks(3).filter(|p| p[0] > 200 && p[1] > 200 && p[2] < 80).count();
    let (ya, yl) = (yellow(&a), yellow(&l));
    assert!(ya as f64 > yl as f64 * 0.8, "สีเหลืองจาก .sup {ya} จุด libass {yl} จุด");
    drop(sub);
    let _ = std::fs::remove_dir_all(&dir);
}

/// เวลาภาพของบรรทัดเคลื่อนไหวต้องไม่เลยเวลาเฟรมของหนัง ตัวเล่นเลือกภาพที่เวลาไม่เกินเฟรม เลยไปเศษมิลลิวินาทีเดียวภาพขึ้นช้าหนึ่งเฟรม
/// เดิมปัดใกล้สุด เฟรม 138 ที่ 23.976 (5,755.7 ms) ได้ 5,756 ข้อความเลื่อนช้าหนึ่งเฟรม (19 จุด) เจอตอนเทียบเครื่องมือ PGS 14 พ.ย. 2569
#[test]
fn animation_points_never_after_frame_time() {
    let ass = "[Script Info]\r\nPlayResX: 320\r\nPlayResY: 180\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:05.00,0:00:07.00,Default,,0,0,0,,{\\move(0,0,100,0)}A\r\n";
    let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
    let f = 1001.0 / 24.0;
    let pts = change_points(&doc, f);
    let late: Vec<i64> = pts.iter().copied().filter(|&t| t > 5000 && t < 7000).filter(|&t| { let k = (t as f64 / f).round(); t as f64 > k * f }).collect();
    assert!(late.is_empty(), "เวลาภาพที่เลยเวลาเฟรม {late:?}");
    assert!(pts.contains(&5755), "เฟรม 138 ต้องเป็น 5755 {:?}", &pts[..pts.len().min(8)]);
}

/// บรรทัดเคลื่อนไหวยาว 5 วินาทีได้ราว 120 ภาพ · ffmpeg อ่านนิพจน์เวลาได้ไม่ถึง 100 ส่วน เดิมชุดละ 250 ภาพจึงล้ม "Cannot allocate memory" (เจอตอนเทียบเครื่องมือ PGS 14 พ.ย. 2569)
#[test]
fn export_long_animation_over_100_frames() {
    let dir = std::env::temp_dir().join(format!("movie-shelf-pgs-long-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 320\r\nPlayResY: 180\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\move(40,90,280,90)}Move\r\n";
    let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
    let target = dir.join("long.sup");
    let req = PgsReq { target: target.display().to_string(), w: 320, h: 180, fps_num: 24000, fps_den: 1001, movie: None, ..Default::default() };
    let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
    assert!(r.images > 100, "ภาพเคลื่อนที่ทุกเฟรมเกิน 100 ภาพ ได้ {}", r.images);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ส่งออกไฟล์ซับ PGS_IN เป็น PGS_OUT ขนาด PGS_W × PGS_H (ค่าตั้งต้น 1920 × 1080) 23.976 fps ไว้เทียบกับเครื่องมือ PGS ตัวอื่น
/// ไม่รันในชุดปกติ · รันเอง `cargo test --lib export_file_from_env -- --ignored --nocapture`
#[test]
#[ignore]
fn export_file_from_env() {
    let (Ok(src), Ok(out)) = (std::env::var("PGS_IN"), std::env::var("PGS_OUT")) else { return; };
    let hint = if src.to_lowercase().ends_with(".srt") { "srt" } else { "ass" };
    let doc = crate::subtitle::subdoc::parse_doc(&std::fs::read(&src).unwrap(), hint, None);
    let num = |k: &str, d: u32| std::env::var(k).ok().and_then(|v| v.parse().ok()).unwrap_or(d);
    let work = std::env::temp_dir().join(format!("movie-shelf-pgs-env-{}", std::process::id()));
    std::fs::create_dir_all(&work).unwrap();
    // PGS_ENGINE=super ใช้ SUPer · PGS_DITHER=1 กระจายจุดสี · PGS_COLORS จำนวนสี
    let mut opts = PgsOpts { dither: std::env::var("PGS_DITHER").is_ok_and(|v| v == "1"), ..Default::default() };
    opts.colors = num("PGS_COLORS", 255) as u16;
    let req = PgsReq { target: out, w: num("PGS_W", 1920), h: num("PGS_H", 1080), fps_num: 24000, fps_den: 1001, movie: None, engine: std::env::var("PGS_ENGINE").unwrap_or_default(), opts, style: None };
    let t = std::time::Instant::now();
    let r = export(&tools(), &work, &doc, &req, &|_, _, _| {}).unwrap();
    println!("ผล {r:?} ใช้เวลา {:.1} วินาที", t.elapsed().as_secs_f64());
    let _ = std::fs::remove_dir_all(&work);
}

#[test]
fn reduce_keeps_at_most_k() {
    let mut h = HashMap::new();
    for i in 0..1000u32 { h.insert(u32::from_le_bytes([(i % 256) as u8, (i / 4) as u8, 50, 255]), 1 + i % 3); }
    let (pal, map) = reduce(h, 255);
    assert!(pal.len() <= 255);
    assert_eq!(map.len(), 1000);
    assert!(map.values().all(|&v| v >= 1 && (v as usize) <= pal.len()));
}

// ---------------------------------------------------------------- สีตรง ตัวเลือกปรับแต่ง สไตล์ SRT ภาพตัวอย่าง SUPer (พี่กันสั่ง 14 พ.ย. 2569)

/// ซับสีเหลือง 255,215,0 ตัวหนาใหญ่ ไม่มีขอบ · matrix คือบรรทัด YCbCr Matrix (ว่างคือไม่มีบรรทัดนี้)
fn yellow_ass(matrix: &str) -> SubDoc {
    let m = if matrix.is_empty() { String::new() } else { format!("YCbCr Matrix: {matrix}\r\n") };
    let ass = format!("[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\n{m}ScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,120,&H0000D7FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,MMMM\r\n");
    crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None)
}
/// สีที่เจอมากที่สุดของจุดที่ทึบเต็มที่ (RGBA ไม่คูณความโปร่งใส)
fn top_color(px: &[u8]) -> [u8; 3] {
    let mut m: HashMap<[u8; 3], u32> = HashMap::new();
    for p in px.chunks_exact(4) { if p[3] == 255 { *m.entry([p[0], p[1], p[2]]).or_insert(0) += 1; } }
    m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap_or([0, 0, 0])
}
fn near(a: [u8; 3], b: [u8; 3], tol: i32) -> bool { (0..3).all(|k| (a[k] as i32 - b[k] as i32).abs() <= tol) }
fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("movie-shelf-pgs-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn req_at(target: &Path, w: u32, h: u32) -> PgsReq {
    PgsReq { target: target.display().to_string(), w, h, fps_num: 24000, fps_den: 1001, ..Default::default() }
}

/// ต้นเหตุสีหม่น (พี่กันถาม 14 พ.ย. 2569 "เราปรับให้ตัวที่สีหม่น สีสดขึ้นได้ไหม") · ffmpeg วาดซับ TV.709 ลงภาพ RGB แล้วบีบสีเหลือ 16 ถึง 235
/// เดิมสีเหลือง 255,215,0 ออกมา 235,201,16 · ตอนนี้ถอดด้วย ffmpeg (ตัวถอดของคนอื่น) ต้องได้สีตามสไตล์
#[test]
fn style_color_exact_for_tv709_script() {
    let dir = tmp("exact");
    let target = dir.join("y.sup");
    export(&tools(), &dir, &yellow_ass("TV.709"), &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    let mine = top_color(&decode_at(&b, 1000, 1280, 720, true));
    assert!(near(mine, [255, 215, 0], 2), "ตัวถอดของโปรแกรมได้ {mine:?}");
    // ffmpeg ถอดแล้ววางบนพื้นดำแบบ RGB
    let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
    let f = frame(&sup_in, "[0:v]format=rgb24[b];[b][1:s]overlay=format=rgb", 1280, 720, 1.0);
    let mut m: HashMap<[u8; 3], u32> = HashMap::new();
    for p in f.chunks(3) { if p[0] as u32 + p[1] as u32 > 200 { *m.entry([p[0], p[1], p[2]]).or_insert(0) += 1; } }
    let ff = m.into_iter().max_by_key(|x| x.1).map(|x| x.0).unwrap();
    assert!(near(ff, [255, 215, 0], 3), "ffmpeg ถอดได้ {ff:?} (โค้ดเดิมได้ราว 235,201,16)");
    let _ = std::fs::remove_dir_all(&dir);
}

/// เงาสีดำทึบครึ่งเดียว (&H80) ต้องได้ความทึบราว 128 · เดิมวาดด้วยโหมดพื้นโปร่งใสของ ffmpeg ได้ราว 64 เงา ภาพเฟด ขอบเรืองแสงจางกว่าตอนเล่น
#[test]
fn half_transparent_shadow_keeps_alpha() {
    let dir = tmp("shadow");
    let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\nYCbCr Matrix: None\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,120,&H0000D7FF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,0,12,5,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,MMMM\r\n";
    let doc = crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None);
    let target = dir.join("sh.sup");
    export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
    let px = decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true);
    let mut m: HashMap<u8, u32> = HashMap::new();
    for p in px.chunks_exact(4) { if p[3] > 0 && p[0] < 8 && p[1] < 8 && p[2] < 8 { *m.entry(p[3]).or_insert(0) += 1; } }
    let (a, n) = m.into_iter().max_by_key(|x| x.1).unwrap();
    assert!((124..=132).contains(&a) && n > 1000, "เงาความทึบ {a} ({n} จุด) ต้องราว 128");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ภาพคู่พื้นดำกับพื้นขาวเป็นความโปร่งใส · ขาวทึบ ดำครึ่งหนึ่ง ไม่มีซับ
#[test]
fn pair_gives_alpha() {
    // สามจุด บนพื้นดำ 255 128 0 · บนพื้นขาว 255 128 255 · จุดแรกขาวทึบ จุดสองดำทึบครึ่งหนึ่ง (พื้นขาวได้ 128) จุดสามไม่มีซับ
    let pair = [255, 255, 255, 0, 0, 0, 0, 0, 0, /* ขาว */ 255, 255, 255, 128, 128, 128, 255, 255, 255];
    let mut buf = [0u8; 12];
    pair_to_rgba(&pair, &mut buf);
    assert_eq!(buf, [255, 255, 255, 255, 0, 0, 0, 127, 0, 0, 0, 0]);
}

/// ซับ TV.601 หรือไม่มีบรรทัด YCbCr Matrix บนภาพ HD สีแบบตัวเล่น (mpv แปลงด้วย BT.601 แล้วถอดด้วย BT.709) · ปิดตัวเลือกแล้วได้สีตามสไตล์
#[test]
fn tv601_script_colors_like_player() {
    let dir = tmp("601");
    for (m, vs, want) in [("", true, mangle601([255, 215, 0])), ("TV.601", true, mangle601([255, 215, 0])), ("TV.601", false, [255, 215, 0]), ("None", true, [255, 215, 0])] {
        let target = dir.join(format!("y-{m}-{vs}.sup"));
        let mut req = req_at(&target, 1280, 720);
        req.opts.vsfilter = vs;
        export(&tools(), &dir, &yellow_ass(m), &req, &|_, _, _| {}).unwrap();
        let got = top_color(&decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true));
        assert!(near(got, want, 2), "บรรทัด {m:?} ตัวเลือก {vs} ได้ {got:?} ต้องราว {want:?}");
    }
    assert_ne!(mangle601([255, 215, 0]), [255, 215, 0], "สองแบบต้องต่างกันจริง เทสนี้ถึงมีความหมาย");
    let _ = std::fs::remove_dir_all(&dir);
}

/// SRT ใช้สีตัวอักษร สีขอบ ความหนาขอบที่ตั้ง (พี่กันสั่ง "ขอตัวปรับสี ปรับขอบ ความหนาด้วย ถ้าแปลงจาก srt ธรรมดา") · เดิม SRT ใช้ขาวของตัววาดและโดนบีบเป็นเทา 235
#[test]
fn srt_style_color_and_outline() {
    let dir = tmp("srt");
    let doc = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:00,500 --> 00:00:02,000\r\nHELLO\r\n", "srt", None);
    let count = |px: &[u8], f: &dyn Fn(&[u8]) -> bool| px.chunks_exact(4).filter(|p| p[3] == 255 && f(p)).count();
    let target = dir.join("s.sup");
    let mut req = req_at(&target, 1280, 720);
    req.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 6.0, shadow: 0.0, size: 90.0, ..Default::default() });
    export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
    let px = decode_at(&std::fs::read(&target).unwrap(), 1000, 1280, 720, true);
    let red = count(&px, &|p| p[0] > 245 && p[1] < 12 && p[2] < 12);
    let blue = count(&px, &|p| p[2] > 245 && p[0] < 12 && p[1] < 12);
    assert!(red > 800 && blue > 800, "จุดแดง {red} จุดน้ำเงิน {blue}");
    // ขอบหนาขึ้น จุดน้ำเงินมากขึ้น
    let t2 = dir.join("s2.sup");
    let mut r2 = req_at(&t2, 1280, 720);
    r2.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 12.0, shadow: 0.0, size: 90.0, ..Default::default() });
    export(&tools(), &dir, &doc, &r2, &|_, _, _| {}).unwrap();
    let blue2 = count(&decode_at(&std::fs::read(&t2).unwrap(), 1000, 1280, 720, true), &|p| p[2] > 245 && p[0] < 12 && p[1] < 12);
    assert!(blue2 as f64 > blue as f64 * 1.4, "ขอบ 6 ได้ {blue} จุด ขอบ 12 ได้ {blue2} จุด");
    // ไม่ส่งสไตล์ ตัวอักษรขาวจริง ไม่ใช่เทา 235
    let t3 = dir.join("s3.sup");
    export(&tools(), &dir, &doc, &req_at(&t3, 1280, 720), &|_, _, _| {}).unwrap();
    let p3 = decode_at(&std::fs::read(&t3).unwrap(), 1000, 1280, 720, true);
    let (white, gray) = (count(&p3, &|p| p[0] > 252 && p[1] > 252 && p[2] > 252), count(&p3, &|p| (232..=238).contains(&p[0]) && p[0] == p[1] && p[1] == p[2]));
    assert!(white > 300 && gray < white / 10, "สีตั้งต้นต้องขาวจริง จุดขาว {white} จุดเทา 235 {gray}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// เขียนชุดภาพแล้วถอดกลับ ได้สีของจานสีแบบตัวเล่นทุกจุด
#[test]
fn decode_roundtrip() {
    let img = Image { palette: vec![[0, 0, 0, 0], [255, 215, 0, 255], [0, 46, 107, 128]], objs: vec![Obj { x: 3, y: 2, w: 4, h: 2, px: vec![1, 1, 2, 0, 0, 2, 2, 1] }], colors: 2, merged: false, spread: vec![] };
    let b = show_set(900, 0, 16, 8, 0x10, &img, true);
    let px = decode_at(&b, 10, 16, 8, true);
    let want = image_rgba(&img, 16, 8, true, true);
    assert_eq!(px, want);
    // แปลงไปกลับปัดเศษได้ต่างไม่เกินหนึ่งหน่วย
    let p = &px[(2 * 16 + 3) * 4..(2 * 16 + 3) * 4 + 4];
    assert!(near([p[0], p[1], p[2]], [255, 215, 0], 1) && p[3] == 255, "{p:?}");
    assert_eq!(first_shown(&b), Some(10));
}

/// จำนวนสีที่ตั้ง กระจายจุดสี กรอบเดียว
#[test]
fn opts_colors_dither_windows() {
    let (w, h) = (64usize, 40usize);
    let mut rgba = vec![0u8; w * h * 4];
    // แถว 2 ถึง 9 ไล่สี 512 สี · แถว 30 ถึง 35 อีกกลุ่ม
    for y in (2..10).chain(30..36) { for x in 0..w { let i = (y * w + x) * 4; rgba[i] = (x * 4) as u8; rgba[i + 1] = (y * 6) as u8; rgba[i + 2] = 255 - (x * 4) as u8; rgba[i + 3] = 255; } }
    for (dither, windows) in [(false, 2), (true, 2), (true, 1)] {
        let im = image_of(&rgba, w, h, &Enc { k: 16, dither, vivid: 0.0, windows }).unwrap();
        assert!(im.palette.len() <= 17, "สีไม่เกิน 16 กับสีโปร่งใส ได้ {}", im.palette.len());
        assert!(im.objs.iter().all(|o| o.px.iter().all(|&k| (k as usize) < im.palette.len())));
        assert_eq!(im.objs.len(), windows, "กรอบ {windows}");
        assert!(im.colors > 16);
    }
    // ไม่ลดสี ใช้สีเดิมตรงตัว
    let im = image_of(&rgba, w, h, &Enc::default()).unwrap();
    assert!(im.colors > 255 || im.palette.len() == im.colors + 1);
}

#[test]
fn vivid_moves_away_from_gray() {
    assert_eq!(vivid(u32::from_le_bytes([128, 128, 128, 255]), 0.5).to_le_bytes(), [128, 128, 128, 255]);
    let c = vivid(u32::from_le_bytes([200, 100, 100, 255]), 0.5).to_le_bytes();
    assert!(c[0] > 200 && c[1] < 100 && c[2] < 100 && c[3] == 255, "{c:?}");
}

#[test]
fn bdn_timecodes_and_formats() {
    assert_eq!(bdn_tc(frame_no(500, 24000, 1001), 24), "00:00:00:12");
    assert_eq!(bdn_tc(24 * 3600 + 1, 24), "01:00:00:01");
    assert_eq!(bdn_rate(30000, 1001), ("29.97", 30));
    assert_eq!(video_format(1920, 1080, 24000, 1001), Some("1080p"));
    assert_eq!(video_format(1920, 1080, 25, 1), Some("1080i"));
    assert_eq!(video_format(1920, 800, 24000, 1001), None);
}

/// ตั้ง YCbCr Matrix เป็น None แทนบรรทัดเดิม หรือใส่ต่อจาก [Script Info] · ซับ SRT ได้หัว ASS ที่มี None
#[test]
fn matrix_line_set_to_none() {
    for m in ["TV.709", ""] {
        let mut d = yellow_ass(m);
        set_matrix_none(&mut d);
        let s = crate::subtitle::subdoc::render(&d);
        assert_eq!(s.matches("YCbCr Matrix:").count(), 1, "{s}");
        assert!(s.contains("YCbCr Matrix: None") && s.find("[Script Info]").unwrap() < s.find("YCbCr Matrix").unwrap());
    }
    assert!(script_tv601(&yellow_ass("")) && script_tv601(&yellow_ass("TV.601")) && !script_tv601(&yellow_ass("TV.709")) && !script_tv601(&yellow_ass("None")));
    let srt = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:01,000 --> 00:00:02,000\r\nx\r\n", "srt", None);
    let p = prepare(&srt, &PgsReq { w: 1920, h: 800, ..Default::default() });
    let s = crate::subtitle::subdoc::render(&p.doc);
    assert!(s.contains("YCbCr Matrix: None") && s.contains("PlayResY: 1080") && s.contains("PlayResX: 2592") && !p.tv601, "{s}");
}

/// ภาพตัวอย่างเทียบสี ASS กับ PGS · สีหลักต้องตรงกัน
#[test]
fn preview_matches_ass_colors() {
    let dir = tmp("prev");
    let req = req_at(&dir.join("p.sup"), 1280, 720);
    let p = preview(&tools(), &dir, &yellow_ass("TV.709"), &req, 1000, None, &|| false).unwrap();
    assert!(!p.empty && p.ass.as_deref().is_some_and(|u| u.starts_with("data:image/png;base64,")) && p.pgs.starts_with("data:image/png;base64,"));
    let c = &p.colors[0];
    assert_eq!(c.ass, "#FFD700", "{:?}", p.colors);
    assert!(c.de < 2.0 && p.mean < 2.0, "{:?} ต่างเฉลี่ย {}", p.colors, p.mean);
    // เวลาที่ไม่มีซับ
    assert!(preview(&tools(), &dir, &yellow_ass("TV.709"), &req, 5000, None, &|| false).unwrap().empty);
    // SRT กับประโยคตัวอย่าง ไม่มีภาพ ASS
    let srt = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:01,000 --> 00:00:02,000\r\nx\r\n", "srt", None);
    let s = preview(&tools(), &dir, &srt, &req, 0, Some("ตัวอย่างซับไทย"), &|| false).unwrap();
    assert!(!s.empty && s.ass.is_none() && s.w > 100, "{} × {}", s.w, s.h);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ไฟล์ล็อกแคชของ pyopencl ค้าง (SUPer โดนปิดกลางทาง) SUPer ต้องยังทำไฟล์ได้และไม่รอนาน
/// เดิมทุกรอบรอล็อกราวหนึ่งนาทีแล้วพัง "Encoder died: Empty@get" (เจอ 15 พ.ย. 2569) · แก้ด้วย PYOPENCL_NO_CACHE ใน run_super
#[test]
fn super_ignores_stale_pyopencl_lock() {
    if !super_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี SUPer"); return; }
    let Some(local) = std::env::var_os("LOCALAPPDATA") else { return };
    let lockdir = PathBuf::from(local).join("pyopencl").join("pyopencl").join("Cache").join("pyopencl-compiler-cache-v2-py3.14.10.final.0");
    std::fs::create_dir_all(&lockdir).unwrap();
    let lock = lockdir.join("lock");
    let had = lock.exists();
    std::fs::write(&lock, b"").unwrap();
    let dir = tmp("superlock");
    let mut req = req_at(&dir.join("l.sup"), 1280, 720);
    req.engine = "super".into();
    let t = std::time::Instant::now();
    let r = export(&tools(), &dir, &yellow_ass("TV.709"), &req, &|_, _, _| {});
    let secs = t.elapsed().as_secs_f64();
    if !had { let _ = std::fs::remove_file(&lock); }
    let _ = std::fs::remove_dir_all(&dir);
    assert!(r.is_ok(), "SUPer พังเมื่อมีไฟล์ล็อกค้าง {r:?}");
    assert!(secs < 40.0, "SUPer ใช้ {secs:.0} วินาที น่าจะรอล็อก");
}

/// ตัวสร้าง Subtitle Edit (SeConv) ใช้สี ขอบ ตำแหน่ง กล่องพื้นหลังที่ตั้ง · ข้ามเมื่อยังไม่มี SeConv
#[test]
fn seconv_engine_uses_style() {
    if !seconv_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี tools\\seconv\\seconv.exe"); return; }
    let dir = tmp("seconv");
    let doc = crate::subtitle::subdoc::parse_doc(b"1\r\n00:00:00,500 --> 00:00:02,000\r\nHELLO\r\n", "srt", None);
    let target = dir.join("se.sup");
    let mut req = req_at(&target, 1280, 720);
    req.engine = "seconv".into();
    req.style = Some(SrtStyle { color: "#FF0000".into(), outline_color: "#0000FF".into(), outline: 6.0, shadow: 0.0, size: 90.0, align: 8, ..Default::default() });
    let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    assert!(r.images >= 1 && r.bytes as usize == b.len(), "{r:?}");
    let px = decode_at(&b, first_shown(&b).unwrap(), 1280, 720, true);
    let red = px.chunks_exact(4).filter(|p| p[3] > 200 && p[0] > 200 && p[1] < 60 && p[2] < 60).count();
    let blue = px.chunks_exact(4).filter(|p| p[3] > 200 && p[2] > 200 && p[0] < 60 && p[1] < 60).count();
    assert!(red > 300 && blue > 300, "จุดแดง {red} จุดน้ำเงิน {blue}");
    // ตำแหน่ง 8 กลางบน จุดของซับอยู่ครึ่งบนของภาพ
    let top = px.chunks_exact(4).enumerate().filter(|(_, p)| p[3] > 0).all(|(i, _)| i / 1280 < 360);
    assert!(top, "ตั้งกลางบนแล้วซับต้องอยู่ครึ่งบน");
    // ภาพตัวอย่างของ SeConv ใช้ประโยคที่พิมพ์
    let p = preview(&tools(), &dir, &doc, &req, 0, Some("ทดสอบ"), &|| false).unwrap();
    assert!(!p.empty && p.after > 0, "ภาพตัวอย่างของ SeConv");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ขนาดที่คาดต้องใกล้ขนาดจริงของตัวในโปรแกรม (ไม่ต่างเกินครึ่งหนึ่ง)
#[test]
fn estimate_close_to_real_size() {
    let dir = tmp("est");
    let doc = yellow_ass("TV.709");
    let target = dir.join("e.sup");
    let req = req_at(&target, 1280, 720);
    let e = estimate(&tools(), &dir, &doc, &req, &|| false).unwrap();
    let r = export(&tools(), &dir, &doc, &req, &|_, _, _| {}).unwrap();
    let ratio = e.bytes as f64 / r.bytes as f64;
    assert!(e.images >= 1 && e.sampled >= 1 && (0.5..=1.5).contains(&ratio), "คาด {} จริง {} ({ratio:.2})", e.bytes, r.bytes);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ซับข้อความชนิดอื่นเปิดได้ · SAMI ผ่าน ffmpeg เป็น ASS · SBV แปลงเองเป็น SRT
#[test]
fn other_text_formats_open() {
    let dir = tmp("other");
    let smi = dir.join("t.smi");
    std::fs::write(&smi, "<SAMI><BODY>\r\n<SYNC Start=1000><P Class=THTH>สวัสดี <i>ตัวเอียง</i>\r\n<SYNC Start=3000><P Class=THTH>&nbsp;\r\n</BODY></SAMI>\r\n").unwrap();
    let (b, hint) = crate::subtitle::subs::bytes_of(&tools(), &dir, &smi, false, 0, 0).unwrap();
    let d = crate::subtitle::subdoc::parse_doc(&b, &hint, None);
    assert_eq!(hint, "ass");
    assert!(d.events.iter().any(|e| e.start == 1000 && e.text.contains("สวัสดี") && e.text.contains("\\i1")), "{:?}", d.events.iter().map(|e| (&e.start, &e.text)).collect::<Vec<_>>());
    let sbv = dir.join("t.sbv");
    std::fs::write(&sbv, "0:00:01.000,0:00:02.500\nสวัสดี\n").unwrap();
    let (b, hint) = crate::subtitle::subs::bytes_of(&tools(), &dir, &sbv, false, 0, 0).unwrap();
    let d = crate::subtitle::subdoc::parse_doc(&b, &hint, None);
    assert_eq!((hint.as_str(), d.events.len(), d.events[0].start, d.events[0].end), ("srt", 1, 1000, 2500));
    // ทางเพิ่มไฟล์ของหน้าซับไตเติล (merge::add_file) ต้องได้แทร็กซับหนึ่งแทร็กทั้งสองชนิด · เดิม SAMI ล้มว่า mkvmerge อ่านไม่ได้ เปิดในหน้าซับไตเติลไม่ขึ้น (เจอจากตัวตรวจ check-pgs 15 พ.ย. 2569)
    for (f, codec) in [(&smi, "sami"), (&sbv, "sbv")] {
        let a = crate::merge::add_file(&tools(), f, None).unwrap_or_else(|e| panic!("{} เพิ่มไม่ได้ {e}", f.display()));
        assert_eq!(a.tracks.len(), 1, "{}", f.display());
        assert_eq!((a.tracks[0].kind.as_str(), a.tracks[0].codec.as_str()), ("subtitle", codec));
        assert_eq!(a.tracks[0].frames, Some(1), "{} จำนวนบรรทัด", f.display());
    }
    let _ = std::fs::remove_dir_all(&dir);
}

/// ตัวสร้าง SUPer · ข้ามเมื่อยังไม่ได้แตก SUPer ลงโฟลเดอร์เครื่องมือ (fetch-tools)
#[test]
fn super_engine_exports_when_present() {
    if !super_exe(&tools()).exists() { eprintln!("ข้าม ยังไม่มี tools\\super\\SUPer_CLI.exe"); return; }
    let dir = tmp("super");
    let target = dir.join("s.sup");
    let mut req = req_at(&target, 1280, 720);
    req.engine = "super".into();
    let r = export(&tools(), &dir, &yellow_ass("TV.709"), &req, &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    assert!(r.images >= 1 && b.starts_with(b"PG"), "{r:?}");
    let t0 = first_shown(&b).unwrap();
    assert!((t0 - 500).abs() <= 42, "SUPer ภาพแรกที่ {t0} ms");
    let got = top_color(&decode_at(&b, t0, 1280, 720, true));
    assert!(near(got, [255, 215, 0], 4), "SUPer สีเหลืองได้ {got:?}");
    // ขนาดที่ไม่ใช่ของ Blu-ray ตอบเหตุผล
    let mut bad = req_at(&dir.join("bad.sup"), 1280, 700);
    bad.engine = "super".into();
    assert!(export(&tools(), &dir, &yellow_ass("TV.709"), &bad, &|_, _, _| {}).unwrap_err().contains("Blu-ray"));
    let _ = std::fs::remove_dir_all(&dir);
}

// ---------------------------------------------------------------- BUGS ข้อ 126 ความสามารถแบบ SUPer ในตัวสร้างชั้นหนัง

fn one_line_ass(text: &str, w: u32, h: u32) -> SubDoc {
    let ass = format!("[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: {w}\r\nPlayResY: {h}\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00800000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,2,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{text}\r\n");
    crate::subtitle::subdoc::parse_doc(ass.as_bytes(), "ass", None)
}
/// ทุกส่วนของไฟล์ (PTS DTS หน่วย 90 kHz ชนิด ข้อมูล ขนาดทั้งส่วนรวมหัว)
fn raw_sets(b: &[u8]) -> Vec<(u32, u32, u8, Vec<u8>, usize)> {
    let mut out = vec![];
    let mut i = 0;
    while i + 13 <= b.len() {
        let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]);
        let dts = u32::from_be_bytes([b[i + 6], b[i + 7], b[i + 8], b[i + 9]]);
        let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
        out.push((pts, dts, b[i + 10], b[i + 13..i + 13 + n].to_vec(), 13 + n));
        i += 13 + n;
    }
    out
}
fn mean_diff(a: &[u8], b: &[u8]) -> f64 { a.iter().zip(b).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as u64).sum::<u64>() as f64 / a.len() as f64 }

/// ภาพที่เทียบได้ด้วยมือ · ก้อนสีขาวขอบจาง เปลี่ยนความทึบทั้งก้อนต้องได้แค่จานสีใหม่ · เลื่อน มีจุดนอกกรอบ ใสทั้งภาพ ต้องไม่ได้
#[test]
fn palette_update_only_when_shape_same() {
    let (w, h) = (64usize, 32usize);
    let blob = |dx: usize, alpha: f64, extra: bool| {
        let mut v = vec![0u8; w * h * 4];
        for y in 8..20 { for x in (10 + dx)..(40 + dx) {
            let edge = y == 8 || y == 19 || x == 10 + dx || x == 39 + dx;
            let a = if edge { 120.0 } else { 255.0 } * alpha;
            let i = (y * w + x) * 4;
            // ffmpeg ให้สีแบบคูณความโปร่งใสมา
            let c = (250.0 * a / 255.0).round() as u8;
            v[i..i + 4].copy_from_slice(&[c, c, c, a.round() as u8]);
        } }
        if extra { let i = (2 * w + 2) * 4; v[i..i + 4].copy_from_slice(&[255, 255, 255, 255]); }
        v
    };
    let enc = Enc::default();
    let base = image_of(&blob(0, 1.0, false), w, h, &enc).unwrap();
    assert_eq!(base.spread.len(), base.palette.len());
    let half = palette_update(&base, &blob(0, 0.5, false), w, h, &enc).expect("จางลงครึ่งหนึ่งต้องเปลี่ยนแค่จานสี");
    let solid = base.palette.iter().position(|c| c[3] == 255).unwrap();
    assert!((half[solid][3] as i32 - 128).abs() <= 2, "สีทึบจางลงครึ่งหนึ่ง ได้ {:?}", half[solid]);
    assert!((half[solid][0] as i32 - 250).abs() <= 3, "สีเดิมไม่เพี้ยน ได้ {:?}", half[solid]);
    assert!(palette_update(&base, &blob(3, 1.0, false), w, h, &enc).is_none(), "ภาพเลื่อนต้องส่งภาพใหม่");
    assert!(palette_update(&base, &blob(0, 1.0, true), w, h, &enc).is_none(), "จุดนอกกรอบเดิมต้องส่งภาพใหม่");
    assert!(palette_update(&base, &vec![0u8; w * h * 4], w, h, &enc).is_none(), "ใสทั้งภาพให้ล้างจอ");
    // เวลาล้างจอเต็มจอ 1920 × 1080 ตามแบบจำลอง 2,073,600 ไบต์ ที่ 32 ล้านไบต์ต่อวินาที = 64.8 ms = 5,832 หน่วย
    assert_eq!(decode_ticks(EPOCH_START, 1920, 1080, &[], &[]), 5832);
    assert_eq!(decode_ticks(ACQUISITION, 1920, 1080, &[], &[]), 0);
}

/// ภาพเฟดเข้าและออก เปลี่ยนแค่จานสี ไฟล์เล็กลงมาก และ ffmpeg (ตัวถอดของ mpv) ถอดได้ภาพตรงกับ libass ตรงกลางเฟด
#[test]
fn fade_uses_palette_updates_and_matches_libass() {
    let dir = tmp("fade126");
    let doc = one_line_ass("{\\fad(500,500)}Fade palette", 1280, 720);
    let target = dir.join("fade.sup");
    let r = export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    let sets = raw_sets(&b);
    let pcs: Vec<&(u32, u32, u8, Vec<u8>, usize)> = sets.iter().filter(|s| s.2 == 0x16).collect();
    let pal_upd = pcs.iter().filter(|s| s.3[8] & 0x80 != 0).count();
    let ods_first = sets.iter().filter(|s| s.2 == 0x15 && s.3[3] & 0x80 != 0).count();
    assert!(pal_upd >= 16 && r.pal_updates == pal_upd, "เฟดเข้าออกเปลี่ยนแค่จานสี ได้ {pal_upd} ชุด {r:?}");
    assert!(ods_first <= 2, "ทั้งบรรทัดส่งภาพเต็มไม่เกินสองครั้ง (วัดได้ 1) ได้ {ods_first}");
    // ขนาดที่คาดในหน้าต่างส่งออก ต้องใกล้ไฟล์จริง (เดิมคิดทุกเฟรมของบรรทัดเฟดเป็นภาพเต็ม คาดเกินจริงหลายเท่า)
    let est = estimate(&tools(), &dir, &doc, &req_at(&dir.join("x.sup"), 1280, 720), &|| false).unwrap();
    let ratio = est.bytes as f64 / r.bytes as f64;
    assert!((0.6..1.7).contains(&ratio), "คาด {} ไบต์ ไฟล์จริง {} ไบต์", est.bytes, r.bytes);
    // ขนาดของชุดแรก (ภาพเต็ม) คูณจำนวนชุดที่มีภาพ คือขนาดถ้าเขียนเต็มทุกชุดแบบเดิม
    let end1 = sets.iter().position(|s| s.2 == 0x80).unwrap();
    let first_set: usize = sets[..=end1].iter().map(|s| s.4).sum();
    assert!((r.bytes as usize) * 4 < first_set * r.images, "ไฟล์ {} ไบต์ ต้องเล็กกว่าเขียนเต็มทุกชุด {} ไบต์ มาก", r.bytes, first_set * r.images);
    // เวลาเริ่มถอดไม่เกินเวลาแสดง ไม่ย้อนหลัง และไม่มีชุดที่ถอดไม่ทัน
    let mut prev = 0;
    for s in &pcs { assert!(s.1 <= s.0 && s.1 >= prev, "DTS {} PTS {} ก่อนหน้า {}", s.1, s.0, prev); prev = s.1; }
    assert_eq!(r.late, 0, "{r:?}");
    assert_eq!((pcs[0].3[7], pcs[0].3[0..2].to_vec()), (EPOCH_START, 1280u16.to_be_bytes().to_vec()), "ชุดแรกเริ่ม epoch กว้าง 1280");
    // ภาพกลางเฟดเข้า (1.25 วินาที) ตอนทึบ (2 วินาที) และกลางเฟดออก (2.75 วินาที) จาก ffmpeg ตรงกับ libass
    let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
    let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
    let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
    for t in [1.25, 2.0, 2.75] {
        let a = frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, t);
        let l = frame(&[], &vf, 1280, 720, t);
        let lit = l.chunks(3).filter(|p| p[0] as u32 + p[1] as u32 + p[2] as u32 > 60).count();
        assert!(lit > 1500, "libass วาดซับขึ้นที่ {t}");
        let m = mean_diff(&a, &l);
        assert!(m < 1.5, "ที่ {t} วินาที ภาพจาก .sup ต่างจาก libass เฉลี่ย {m:.2}");
    }
    drop(sub);
    let _ = std::fs::remove_dir_all(&dir);
}

/// ตัวอักษรตกลงมาจากขอบบน ภาพสูงขึ้นทีละไม่กี่จุดทุกเฟรม กรอบที่เผื่อไว้ต้องรับได้ ไม่เริ่ม epoch ใหม่ทุกเฟรม เครื่องเล่น Blu-ray ถอดทันทุกชุด
/// (เจอ 15 พ.ย. 2569 กับซับคาราโอเกะตัวอย่างของ ffmpeg ถอดไม่ทัน 5 ชุด)
#[test]
fn growing_text_fits_padded_windows() {
    let dir = tmp("grow126");
    // จอ 1920 × 1080 เริ่ม epoch ต้องล้างจอ 64.8 ms เกินระยะเฟรม 41.7 ms ถ้าเริ่ม epoch ใหม่ทุกเฟรมจะถอดไม่ทันทันที
    let doc = one_line_ass("{\\an5\\move(960,-30,960,60,0,400)}Drop", 1920, 1080);
    let target = dir.join("grow.sup");
    let r = export(&tools(), &dir, &doc, &req_at(&target, 1920, 1080), &|_, _, _| {}).unwrap();
    assert_eq!(r.late, 0, "ทุกชุดถอดทัน {r:?}");
    let epochs = raw_sets(&std::fs::read(&target).unwrap()).iter().filter(|s| s.2 == 0x16 && s.3[10] > 0 && s.3[7] == EPOCH_START).count();
    assert!(epochs <= 3, "เริ่ม epoch ได้ {epochs} ครั้ง {r:?}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// ข้อความเลื่อน ภาพเปลี่ยนทุกเฟรมแต่อยู่ในกรอบเดิมของ epoch ส่งเป็นจุดเริ่มอ่าน ไม่ล้างจอทุกเฟรม เครื่องเล่น Blu-ray ถอดทันทุกชุด
#[test]
fn move_reuses_epoch_windows() {
    let dir = tmp("move126");
    let doc = one_line_ass("{\\move(300,640,980,640)}Moving", 1280, 720);
    let target = dir.join("move.sup");
    let r = export(&tools(), &dir, &doc, &req_at(&target, 1280, 720), &|_, _, _| {}).unwrap();
    let b = std::fs::read(&target).unwrap();
    let sets = raw_sets(&b);
    let states: Vec<u8> = sets.iter().filter(|s| s.2 == 0x16 && s.3[10] > 0).map(|s| s.3[7]).collect();
    let epochs = states.iter().filter(|&&s| s == EPOCH_START).count();
    assert_eq!(epochs, 1, "เริ่ม epoch ครั้งเดียว {states:?}");
    assert!(r.reused >= 30 && states.iter().filter(|&&s| s == ACQUISITION).count() == r.reused, "{r:?}");
    assert_eq!(r.late, 0, "ทุกชุดถอดทัน {r:?}");
    // กรอบกว้างเต็มจอ
    let wds = sets.iter().find(|s| s.2 == 0x17).unwrap();
    assert_eq!(u16::from_be_bytes([wds.3[6], wds.3[7]]), 1280, "กรอบกว้างเต็มจอ");
    let sub = crate::subtitle::subshot::TmpSub::new(&dir, &doc).unwrap();
    let vf = format!("[0:v]{}", crate::subtitle::subshot::subs_filter(&sub.0, None, 1280, 720, false));
    let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
    for t in [1.5, 2.5] {
        let m = mean_diff(&frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, t), &frame(&[], &vf, 1280, 720, t));
        assert!(m < 1.5, "ที่ {t} วินาที ภาพจาก .sup ต่างจาก libass เฉลี่ย {m:.2}");
    }
    drop(sub);
    let _ = std::fs::remove_dir_all(&dir);
}
