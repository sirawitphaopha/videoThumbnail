//! เทสของ library.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn dev_tools() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools")
}
fn movies_dir() -> PathBuf {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง");
    dunce::canonicalize(&p).unwrap_or_else(|e| panic!("ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display()))
}
struct Temp(PathBuf);
impl Drop for Temp {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}
fn temp(name: &str) -> Temp {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-คลัง-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    Temp(d)
}

#[test]
fn scan_result_keeps_checks_finished_during_scan() {
    let mv = |id: &str, status: &str, at: Option<i64>| Movie {
        id: id.into(), status: status.into(), check: at.map(|a| serde_json::json!({ "at": a })), sha256: at.map(|a| format!("h{a}")), ..Default::default()
    };
    // ก่อนอ่าน · a ตรวจแล้วที่ 100 · b ยังไม่เคยตรวจ · c ตรวจแล้วที่ 50
    let before = vec![mv("a", "ok", Some(100)), mv("b", "unchecked", None), mv("c", "ok", Some(50))];
    // ระหว่างอ่าน · b ตรวจเสร็จที่ 200 ผลเสียหาย · a กับ c ไม่ได้ตรวจเพิ่ม
    let now = vec![mv("a", "ok", Some(100)), mv("b", "bad", Some(200)), mv("c", "ok", Some(50))];
    // ตัวอ่านเห็นไฟล์ c เปลี่ยนจึงตั้งเป็น changed · b ยังเป็นค่าตอนเริ่มอ่าน
    let mut scanned = vec![mv("a", "ok", Some(100)), mv("b", "unchecked", None), mv("c", "changed", Some(50))];
    keep_newer_checks(&mut scanned, &before, &now);
    assert_eq!(scanned[1].status, "bad", "ผลตรวจที่เสร็จระหว่างอ่านต้องไม่โดนทับ");
    assert_eq!(scanned[1].sha256.as_deref(), Some("h200"));
    assert_eq!(scanned[2].status, "changed", "เรื่องที่ไม่ได้ตรวจเพิ่ม ใช้ผลของตัวอ่าน");
    assert_eq!(scanned[0].status, "ok");
}

/// จดคลังหลังเปลี่ยนรูปแนบระหว่างอ่านโฟลเดอร์ · ตัวอ่านต้องไม่เอาสำเนาเก่ามาทับ (ผู้ช่วยตรวจโค้ดข้อ 12)
#[test]
fn scan_result_keeps_own_edits_made_during_scan() {
    let mv = |id: &str, size: u64, sha: &str| Movie { id: id.into(), status: "ok".into(), size, sha256: Some(sha.into()), check: Some(serde_json::json!({ "at": 100 })), ..Default::default() };
    let before = vec![mv("a", 1000, "เก่า"), mv("b", 2000, "บี")];
    // ระหว่างอ่าน โปรแกรมเปลี่ยนรูปแนบของ a แล้วจดขนาดกับ hash ใหม่ (เวลาตรวจเท่าเดิม)
    let now = vec![mv("a", 1100, "ใหม่"), mv("b", 2000, "บี")];
    // ตัวอ่านเห็น a ตอนก่อนแก้ ได้ขนาดเก่า · b ตัวอ่านเห็นไฟล์เปลี่ยนเอง
    let mut scanned = vec![mv("a", 1000, "เก่า"), Movie { status: "changed".into(), ..mv("b", 2500, "บี") }];
    keep_newer_checks(&mut scanned, &before, &now);
    assert_eq!((scanned[0].size, scanned[0].sha256.as_deref()), (1100, Some("ใหม่")), "ของที่จดระหว่างอ่านต้องไม่โดนทับ");
    assert_eq!((scanned[1].size, scanned[1].status.as_str()), (2500, "changed"), "เรื่องที่ไม่ถูกแก้ระหว่างอ่าน ใช้ผลของตัวอ่าน");
}

#[test]
fn skipped_folders() {
    assert!(is_skipped_dir("ไฟล์เดิม"));
    assert!(is_skipped_dir("ดาวเหนือ (2023) แยกไฟล์"));
    assert!(is_skipped_dir("แยกไฟล์"), "โฟลเดอร์ตั้งต้นใหม่ของงานแยกไฟล์ ไฟล์ภาพที่แยกต้องไม่ขึ้นชั้นวาง");
    assert!(is_skipped_dir("$RECYCLE.BIN"));
    assert!(!is_skipped_dir("หนังไทย"));
}

/// อ่านโฟลเดอร์ทดสอบจริง · ขึ้นชั้นครบทุกไฟล์ที่รับ · ข้ามไฟล์เดิม แยกไฟล์ และชนิดที่ไม่รับ · ปกตรงกับปกในไฟล์
#[test]
fn scan_test_media() {
    let src = movies_dir();
    let t = temp("อ่าน");
    let root = t.0.join("หนัง");
    fs::create_dir_all(root.join("ไฟล์เดิม")).unwrap();
    fs::create_dir_all(root.join("ดาวเหนือ (2023) แยกไฟล์")).unwrap();
    fs::create_dir_all(root.join("ซีรีส์").join("ซีซัน 1")).unwrap();
    let mut expect = 0;
    for e in fs::read_dir(&src).unwrap().flatten() {
        let p = e.path();
        let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
        if ACCEPTED.contains(&ext.as_str()) {
            fs::copy(&p, root.join(p.file_name().unwrap())).unwrap();
            expect += 1;
        }
    }
    // ของที่ต้องไม่ขึ้นชั้น
    fs::copy(src.join("Clip (2015).flv"), root.join("ไฟล์เดิม").join("Clip (2015).flv")).unwrap();
    fs::copy(src.join("Clip (2015).flv"), root.join("ดาวเหนือ (2023) แยกไฟล์").join("แยก.flv")).unwrap();
    fs::write(root.join("โน้ต.txt"), "x").unwrap();
    // ของในโฟลเดอร์ย่อยลึกสองชั้นต้องขึ้น
    fs::copy(src.join("Clip (2015).flv"), root.join("ซีรีส์").join("ซีซัน 1").join("ตอนที่ 1.flv")).unwrap();
    expect += 1;

    let thumbs = t.0.join("thumbs");
    let work = t.0.join("tmp");
    let folders = vec![root.to_string_lossy().to_string()];
    let env = ScanEnv { tools: &dev_tools(), thumbs: &thumbs, work: &work, folders: &folders, originals: "", workers: 3 };
    let calls = Mutex::new(0usize);
    let r = scan_core(&env, vec![], &|_, _, _| { *calls.lock().unwrap() += 1; });
    assert_eq!(r.movies.len(), expect, "จำนวนเรื่องบนชั้นต้องเท่าไฟล์ที่รับ");
    assert_eq!(*calls.lock().unwrap(), expect, "ต้องแจ้งหน้าจอทีละเรื่อง");
    assert!(r.movies.iter().all(|m| !m.path.contains("ไฟล์เดิม") && !m.path.contains("แยกไฟล์")));
    assert!(r.movies.iter().any(|m| m.name == "ตอนที่ 1"));
    assert!(r.movies.iter().any(|m| m.ext == "mpeg"), "นามสกุล .mpeg ต้องขึ้นชั้น");
    assert_eq!(r.folders[0], FolderState { path: folders[0].clone(), ok: true, count: expect, error: None });

    // ปก MKV ที่มีปกอยู่แล้ว ต้องตรงกับปกที่ดึงด้วย mkvextract เองทุกไบต์
    let harbor = r.movies.iter().find(|m| m.name == "Harbor Lights (2021)").unwrap();
    assert!(harbor.has_cover && harbor.thumb.is_some(), "Harbor Lights ต้องมีปก: {:?}", harbor.error);
    let mine = t.0.join("ปกเทียบ.jpg");
    let mut target = std::ffi::OsString::from("1:");
    target.push(mine.as_os_str());
    crate::app::tools::run_tool(&dev_tools(), "mkvextract", [std::ffi::OsStr::new(&harbor.path), std::ffi::OsStr::new("attachments"), &target]).unwrap();
    use sha2::Digest;
    let sha = probe::hex(&sha2::Sha256::digest(fs::read(&mine).unwrap()));
    assert_eq!(harbor.cover_sha256.as_deref(), Some(sha.as_str()), "ปกบนชั้นไม่ตรงกับปกในไฟล์");
    assert_eq!(harbor.cover_name.as_deref(), Some("cover.jpg"));

    let dao = r.movies.iter().find(|m| m.name == "ดาวเหนือ (2023)").unwrap();
    assert_eq!(dao.year, Some(2023));
    assert_eq!(dao.audio.len(), 2);
    assert_eq!(dao.subs.len(), 2);
    assert!(!dao.has_cover && dao.status == "unchecked");
    assert!(r.movies.iter().find(|m| m.ext == "mp4").map(|m| m.video_short.as_deref() == Some("AVC 720p")).unwrap_or(false));

    // อ่านรอบสอง ไม่มีอะไรเปลี่ยน ต้องไม่อ่านข้อมูลไฟล์ซ้ำ (เร็ว) และคลังเท่าเดิม
    let t0 = std::time::Instant::now();
    let r2 = scan_core(&env, r.movies.clone(), &|_, _, _| {});
    assert_eq!(r2.movies.len(), expect);
    assert!(t0.elapsed().as_secs_f64() < 2.0, "อ่านรอบสองช้าเกิน {:?} แปลว่าอ่านข้อมูลไฟล์ซ้ำ", t0.elapsed());

    // เปลี่ยนชื่อใน Explorer · เรื่องเดิม เลขเดิม ประวัติตรวจไม่หาย
    let mut with_check = r2.movies.clone();
    for m in with_check.iter_mut().filter(|m| m.name == "ดาวเหนือ (2023)") { m.status = "ok".into(); }
    fs::rename(root.join("ดาวเหนือ (2023).mkv"), root.join("ดาวเหนือ (2023) 1080p.mkv")).unwrap();
    let r3 = scan_core(&env, with_check, &|_, _, _| {});
    let renamed = r3.movies.iter().find(|m| m.name == "ดาวเหนือ (2023) 1080p").expect("เรื่องที่เปลี่ยนชื่อต้องยังอยู่");
    assert_eq!(renamed.id, dao.id, "เปลี่ยนชื่อแล้วต้องเป็นเรื่องเดิม");
    assert_eq!(renamed.status, "ok", "ประวัติตรวจต้องตามไปด้วย");
    assert_eq!(r3.movies.len(), expect);

    // ไดรฟ์ถอดออก · ยังอยู่บนชั้นแบบจาง
    let gone = vec![root.to_string_lossy().to_string()];
    fs::rename(&root, t.0.join("หนัง-ถอดออก")).unwrap();
    let env2 = ScanEnv { folders: &gone, ..env };
    let r4 = scan_core(&env2, r3.movies.clone(), &|_, _, _| {});
    assert_eq!(r4.movies.len(), expect, "หนังของไดรฟ์ที่ถอดออกต้องยังอยู่บนชั้น");
    assert!(r4.movies.iter().all(|m| m.missing), "ต้องติดป้ายว่าหาไฟล์ไม่เจอ");
    assert!(!r4.folders[0].ok && r4.folders[0].error.as_deref().unwrap().starts_with("หาโฟลเดอร์"));
    // ไดรฟ์ถอดออก ภาพเล็กต้องยังอยู่ เสียบกลับมาปกขึ้นทันทีไม่ต้องดึงใหม่
    let harbor_thumb = harbor.thumb.clone().unwrap();
    assert!(Path::new(&harbor_thumb).exists(), "ไดรฟ์ถอดออกแล้วภาพเล็กต้องไม่ถูกลบ");

    // เอาโฟลเดอร์ออกจากชั้น · หนังหายจากชั้น ภาพเล็กของมันถูกลบ ไม่ค้างกินที่
    let none: Vec<String> = vec![];
    let env3 = ScanEnv { folders: &none, ..env2 };
    let r5 = scan_core(&env3, r4.movies.clone(), &|_, _, _| {});
    assert!(r5.movies.is_empty(), "เอาโฟลเดอร์ออกแล้วหนังต้องหายจากชั้น");
    assert!(!Path::new(&harbor_thumb).exists(), "ภาพเล็กของหนังที่หายจากชั้นต้องถูกลบ");
}
