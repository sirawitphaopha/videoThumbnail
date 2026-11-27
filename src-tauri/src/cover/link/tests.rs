//! เทสของ link.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn t(s: &str) -> (String, Option<u32>) {
    let x = parse_title(s);
    (x.key, x.year)
}

/// ตัวตัดชื่อ ทุกแบบในมอคอัปกับชื่อไฟล์ที่เจอจริง
#[test]
fn title_parser() {
    assert_eq!(t("ดาวเหนือ.2023.1080p.BluRay.x265"), ("ดาวเหนือ".into(), Some(2023)));
    assert_eq!(t("ดาวเหนือ (2023) poster"), ("ดาวเหนือ".into(), Some(2023)));
    assert_eq!(t("Harbor.Lights.2021.2160p.WEB-DL"), ("harborlights".into(), Some(2021)));
    assert_eq!(t("harbor_lights_2021"), ("harborlights".into(), Some(2021)));
    assert_eq!(t("silent-orbit-backdrop"), ("silentorbit".into(), None));
    assert_eq!(t("Silent.Orbit.1080p-GRP"), ("silentorbit".into(), None));
    assert_eq!(t("ลมหนาว.2020.720p.WEB-DL.AAC.H264-Tigole"), ("ลมหนาว".into(), Some(2020)));
    assert_eq!(t("ember (1)"), ("ember".into(), None));
    assert_eq!(t("ember-poster-hd"), ("ember".into(), None));
    assert_eq!(t("tidal_alt"), ("tidal".into(), None));
    // เลขภาคไม่ใช่เลขสำเนา ต้องอยู่
    assert_eq!(t("เมืองในหมอก ภาค 2"), ("เมืองในหมอกภาค2".into(), None));
    assert_eq!(t("หมอกเมือง 2"), ("หมอกเมือง2".into(), None));
    // ชื่อเรื่องเป็นตัวเลขเหมือนปี
    assert_eq!(t("1917.2019.1080p"), ("1917".into(), Some(2019)));
    assert_eq!(t("2012"), ("2012".into(), None));
    assert_eq!(t("Blade.Runner.2049.2017"), ("bladerunner2049".into(), Some(2017)));
    // ชื่อทั่วไปไม่เหลือชื่อเรื่อง
    assert_eq!(t("folder"), ("".into(), None));
    assert_eq!(parse_title("poster_tt7654321").imdb.as_deref(), Some("tt7654321"));
    assert_eq!(parse_title("poster_tt7654321").key, "");
    assert_eq!(find_imdb("ไม่มีเลข att1234567 tt12"), None);
    assert_eq!(parse_title("ดาวเหนือ.2023.1080p").pretty, "ดาวเหนือ (2023)");
    // ผู้ช่วยตรวจขั้น 8 · ตัดคำผิดที่ · เลขปีที่เป็นชื่อเรื่อง · เลขในวงเล็บของหนังเป็นชื่อเรื่อง
    let mv = |s: &str| movie_title(Path::new(&format!("D:\\หนัง\\{s}.mkv")));
    assert_eq!(mv("The Final Cut").key, "thefinalcut", "คำว่า final ในชื่อหนังต้องอยู่");
    assert_eq!(mv("Final Destination (2000)").pretty, "Final Destination (2000)");
    assert_eq!(mv("The Web (2013)").pretty, "The Web (2013)");
    assert_eq!(mv("Charlotte's Web (2006)").pretty, "Charlotte's Web (2006)");
    assert_eq!(mv("Ocean's Eleven").pretty, "Ocean's Eleven");
    assert_eq!(mv("Ocean's Eleven").key, "oceanseleven");
    assert_eq!(mv("The Web").key, "theweb", "web คำเดียวท้ายชื่อคือชื่อเรื่อง");
    assert_eq!(mv("Cover").key, "cover");
    assert_eq!(mv("Rocky (2)").key, "rocky2", "หนังไม่ตัดเลขในวงเล็บ");
    assert_eq!(mv("Harbor.Lights.WEB-DL.1080p").key, "harborlights");
    assert_eq!(mv("Blade Runner 2049").key, "bladerunner2049", "เลขเกินปีหน้าไม่ใช่ปี");
    assert_eq!(mv("Blade Runner 2049").year, None);
    assert!(mv("Wonder Woman 1984").loose_year);
    assert!(!mv("Silent.Orbit.2018").loose_year);
    assert!(!mv("ดาวเหนือ (2023)").loose_year);
    assert_eq!(t("Final Cover Dune"), ("dune".into(), None));
    assert_eq!(movie_title(Path::new(r"D:\หนัง\ฝนสุดท้ายของฤดู (2019)\movie.mkv")).pretty, "ฝนสุดท้ายของฤดู (2019)");
}

#[test]
fn name_similarity() {
    // เลขตามมอคอัป เมืองในหมอก กับ เมืองหมอก 82%
    assert_eq!(pct(similarity("เมืองในหมอก", "เมืองหมอก")), 82);
    assert!(similarity("เมืองในหมอก", "หมอกเมือง2") >= UNSURE_MIN, "ชื่อสลับคำต้องเสนอ");
    assert!(similarity("เมืองในหมอก", "เมืองในหมอกภาค2") >= UNSURE_MIN);
    assert!(similarity("paperkites", "img") < UNSURE_MIN);
    assert_eq!(similarity("", "x"), 0.0);
}

fn img(name: &str, w: u32, h: u32) -> ImgIn {
    ImgIn { path: format!("D:\\รูป\\{name}"), name: name.into(), folder: "D:\\รูป".into(), width: w, height: h, thumb: None }
}
fn mv(id: &str, stem: &str) -> MovieIn {
    MovieIn { id: id.into(), path: format!("D:\\หนัง\\{stem}.mkv"), stem: stem.into(), title: parse_title(stem), alone: false, ..Default::default() }
}

/// รูปหนึ่งรูปได้หนังเรื่องเดียว · ภาคต่อชื่อซ้ำไม่กล้าตัดสิน · รูปแนวนอนได้ปกนอนอย่างเดียว ไม่ครอปเป็นปกตั้งให้ (AUDIT ข้อ 77 คอมเมนต์เดิมบอกว่าครอปให้)
#[test]
fn matcher_rules() {
    let ms = vec![mv("a", "Iron Tide (2024)"), mv("b", "Iron Tide (2010)"), mv("c", "Silent.Orbit.2018"), mv("d", "Tidal.2021.1080p"), mv("e", "Paper.Kites.2012")];
    let shelf: Vec<Title> = ms.iter().map(|m| m.title.clone()).collect();
    let imgs = vec![img("iron-tide-2024.jpg", 1000, 1500), img("iron tide.jpg", 1000, 1500), img("silent-orbit.jpg", 1920, 1080), img("tidal_2021.jpg", 1000, 1500), img("tidal_alt.jpg", 1000, 1500)];
    let r = match_core(&ms, &shelf, &imgs, &HashSet::new());
    assert_eq!((r[0].status.as_str(), r[0].reason.as_str()), ("sure", "ชื่อกับปีตรง"));
    assert_eq!(r[0].tall.as_ref().unwrap().name, "iron-tide-2024.jpg");
    assert!(r[0].ticked);
    assert_eq!(r[1].status, "unsure", "ภาคต่อชื่อซ้ำ รูปไม่มีปี ต้องไม่ตัดสินเอง");
    assert_eq!(r[1].candidates[0].name, "iron tide.jpg");
    assert!(!r[1].ticked && !r[1].has_image());
    assert_eq!(r[2].wide.as_ref().unwrap().name, "silent-orbit.jpg");
    assert!(r[2].tall.is_none() && !r[2].derived_tall, "รูปแนวนอนต้องเป็นปกนอนอย่างเดียว ไม่ครอปเป็นปกตั้ง");
    assert_eq!(r[2].reason, "ชื่อตรง ไม่มีปีในชื่อรูป");
    assert_eq!(r[3].tall.as_ref().unwrap().name, "tidal_2021.jpg", "รูปมีปีตรงต้องชนะรูปไม่มีปี");
    assert_eq!(r[4].status, "none");
    // รูปที่จับคู่เองไปแล้วห้ามถูกใช้ซ้ำ
    let taken: HashSet<String> = ["D:\\รูป\\tidal_2021.jpg".to_string()].into();
    let r2 = match_core(&ms, &shelf, &imgs, &taken);
    assert_eq!(r2[3].tall.as_ref().unwrap().name, "tidal_alt.jpg");
}

/// จับคู่เอง หลายรูปแยกแนว · ย้อนได้ · รูปแนวตั้งจริงไม่โดนครอปทับ
#[test]
fn manual_pair_and_undo() {
    let pick = |n: &str, w, h| Pick { path: n.into(), name: n.into(), width: w, height: h, ..Default::default() };
    let mut r = Row { id: "a".into(), status: "none".into(), via: "auto".into(), ..Default::default() };
    pair_row(&mut r, vec![pick("wide.jpg", 1920, 1080), pick("tall.jpg", 1000, 1500)], "explorer");
    assert_eq!(r.tall.as_ref().unwrap().name, "tall.jpg");
    assert_eq!(r.wide.as_ref().unwrap().name, "wide.jpg");
    assert!(!r.derived_tall);
    assert_eq!((r.status.as_str(), r.reason.as_str(), r.ticked), ("manual", "ลากจาก Explorer", true));
    let prev = r.prev.clone().unwrap();
    assert_eq!(prev.status, "none");
    assert!(prev.prev.is_none(), "ย้อนได้ขั้นเดียว ไม่สะสม");
    pair_row(&mut r, vec![pick("w2.jpg", 1920, 1080)], "board");
    assert!(!r.derived_tall && r.tall.is_none(), "รูปแนวนอนรูปเดียวเป็นปกนอนอย่างเดียว ไม่ครอปเป็นปกตั้ง");
    assert_eq!(r.wide.as_ref().unwrap().name, "w2.jpg");
}

/// AUDIT ข้อ 74 · จับคู่บนกระดานกับหนังที่ยังไม่มีแถว แล้วย้อน แถวต้องหาย ไม่เหลือแถวหาคู่ไม่เจอ
/// แถวที่มีอยู่ก่อน (จากจับคู่อัตโนมัติ) ย้อนแล้วกลับเป็นแถวเดิม ไม่ถูกเอาออก
#[test]
fn undo_removes_row_made_by_pair() {
    let pick = |n: &str| Pick { path: n.into(), name: n.into(), width: 1000, height: 1500, ..Default::default() };
    let m = Movie { id: "m1".into(), path: "D:\\หนัง\\ฝนแรก (2025).mkv".into(), name: "ฝนแรก (2025)".into(), ..Default::default() };
    let mut rows: Vec<Row> = vec![];
    pair_into(&mut rows, &m, vec![pick("a.jpg")], "board");
    assert_eq!((rows.len(), rows[0].status.as_str()), (1, "manual"));
    undo_row(&mut rows, "m1").unwrap();
    assert!(rows.is_empty(), "ย้อนแล้วแถวที่จับคู่เองสร้างต้องหาย");
    // แถวหาคู่ไม่เจอที่มีอยู่ก่อนจากจับคู่อัตโนมัติ ย้อนแล้วต้องยังอยู่
    let mut rows = vec![blank_row(&m)];
    pair_into(&mut rows, &m, vec![pick("b.jpg")], "board");
    undo_row(&mut rows, "m1").unwrap();
    assert_eq!((rows.len(), rows[0].status.as_str(), rows[0].from_pair), (1, "none", false));
    // จับคู่สองครั้งกับแถวที่สร้างเอง ย้อนครั้งเดียวกลับเป็นคู่แรก ไม่หาย
    let mut rows: Vec<Row> = vec![];
    pair_into(&mut rows, &m, vec![pick("c.jpg")], "board");
    pair_into(&mut rows, &m, vec![pick("d.jpg")], "board");
    undo_row(&mut rows, "m1").unwrap();
    assert_eq!(rows[0].tall.as_ref().unwrap().name, "c.jpg");
    // ที่เก็บคู่รอของแถวปกติไม่มีช่อง fromPair
    assert!(serde_json::to_value(blank_row(&m)).unwrap().get("fromPair").is_none());
}

/// AUDIT ข้อ 76 · ① ชื่อมีวงเล็บกับเลข IMDb ปีไม่ใช่ปีลอย · ② ช่องที่ได้จากกฎไม่ติ๊ก เอาติ๊กของแถวออก
#[test]
fn imdb_name_and_untick_on_weak_slot() {
    let t = parse_title("Dune (2021) tt1160419");
    assert_eq!((t.year, t.loose_year, t.imdb.as_deref()), (Some(2021), false, Some("tt1160419")));
    assert!(parse_title("Dune 2021").loose_year, "ปีคั่นช่องว่างล้วนยังเป็นปีลอย");
    let ms = vec![mv("a", "Dune (2021)")];
    let shelf: Vec<Title> = ms.iter().map(|m| m.title.clone()).collect();
    let imgs = vec![img("Dune (2021).jpg", 1000, 1500), img("dune.jpg", 1920, 1080)];
    let r = match_core(&ms, &shelf, &imgs, &HashSet::new());
    assert_eq!(r[0].tall.as_ref().unwrap().name, "Dune (2021).jpg");
    assert_eq!(r[0].wide.as_ref().unwrap().name, "dune.jpg");
    assert!(!r[0].ticked, "ปกนอนที่ชื่อไม่มีปีต้องไม่ถูกติ๊กไปพร้อมปกตั้ง");
    assert_eq!(r[0].reason, "ชื่อกับปีตรง แต่อีกแนวไม่มีปีในชื่อรูป");
    // ปกตั้งชื่อกับปีตรงอย่างเดียว ยังติ๊กเหมือนเดิม
    let r2 = match_core(&ms, &shelf, &imgs[..1], &HashSet::new());
    assert!(r2[0].ticked && r2[0].reason == "ชื่อกับปีตรง");
}

fn jm() -> Option<PathBuf> {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("จับคู่");
    match dunce::canonicalize(&p) {
        Ok(p) => Some(p),
        Err(e) => {
            assert!(std::env::var("MOVIE_SHELF_SKIP_MEDIA").is_ok(), "ไม่มีไฟล์ทดสอบ {} ({e}) · รัน node scripts/make-test-media.mjs ก่อน", p.display());
            None
        }
    }
}

/// จับคู่ชุดทดสอบจริงจากดิสก์ · ผลตรงตารางใน test-media/README.md
#[test]
fn real_test_set() {
    let Some(root) = jm() else { return };
    let mut files = vec![];
    fn walk(d: &Path, out: &mut Vec<PathBuf>) {
        for e in fs::read_dir(d).unwrap().flatten() {
            if e.path().is_dir() { walk(&e.path(), out); }
            else if crate::app::library::ACCEPTED.contains(&pi::ext_of(&e.path()).as_str()) { out.push(e.path()); }
        }
    }
    walk(&root.join("หนัง"), &mut files);
    assert_eq!(files.len(), 14);
    let paths: Vec<String> = files.iter().map(|p| p.to_string_lossy().to_string()).collect();
    let counts = dir_counts(paths.iter().map(String::as_str));
    let thumbs = root.join("__ไม่มี");
    let none = HashSet::new();
    let mut beside = BesideCache::new(&thumbs, &none);
    let all: Vec<MovieIn> = paths.iter().map(|p| movie_in(p, p, p.contains("มีปกแล้ว"), &counts, &mut beside)).collect();
    // AUDIT ข้อ 64 · อ่านแต่ละโฟลเดอร์ครั้งเดียว ไม่ใช่ครั้งละเรื่อง
    let dirs: HashSet<String> = paths.iter().map(|p| Path::new(p).parent().unwrap().to_string_lossy().to_lowercase()).collect();
    assert_eq!(beside.reads, dirs.len(), "หนัง {} เรื่องใน {} โฟลเดอร์", paths.len(), dirs.len());
    let shelf: Vec<Title> = all.iter().map(|m| m.title.clone()).collect();
    let imgs = list_images(&[root.join("รูป").to_string_lossy().to_string()], &[], &thumbs);
    assert_eq!(imgs.len(), 15, "รูปในโฟลเดอร์ย่อยต้องอ่านด้วย");
    assert!(imgs.iter().any(|i| i.name == "silent-orbit-backdrop.jpg" && i.width == 1920 && i.height == 1080), "ขนาดรูปอ่านจากหัวไฟล์");
    assert!(imgs.iter().any(|i| i.name == "ลมหนาว 2020.webp" && i.width == 800));

    // เฉพาะเรื่องที่ยังไม่มีปก
    let scope: Vec<MovieIn> = all.iter().filter(|m| !m.has_cover).cloned().collect();
    let rows = match_core(&scope, &shelf, &imgs, &HashSet::new());
    let row = |title: &str| rows.iter().find(|r| r.title == title).unwrap_or_else(|| panic!("ไม่เจอแถว {title} ใน {:?}", rows.iter().map(|r| r.title.clone()).collect::<Vec<_>>()));
    let got = |title: &str| { let r = row(title); (r.status.clone(), r.tall.as_ref().map(|p| p.name.clone()).unwrap_or_default(), r.reason.clone()) };
    assert_eq!(got("ดาวเหนือ (2023)"), ("sure".into(), "ดาวเหนือ (2023) poster.jpg".into(), "ชื่อกับปีตรง".into()));
    assert_eq!(got("Harbor Lights (2021)"), ("sure".into(), "harbor_lights_2021.png".into(), "ชื่อกับปีตรง".into()));
    assert_eq!(got("ฝนสุดท้ายของฤดู (2019)"), ("sure".into(), "folder.jpg".into(), "รูปอยู่ข้างไฟล์หนัง".into()));
    { let r = row("Silent Orbit (2018)"); assert_eq!((r.status.as_str(), r.reason.as_str()), ("sure", "ชื่อตรง ไม่มีปีในชื่อรูป")); assert!(r.tall.is_none() && !r.derived_tall); assert_eq!(r.wide.as_ref().unwrap().name, "silent-orbit-backdrop.jpg"); }
    assert_eq!(got("Iron Tide (2024)"), ("sure".into(), "iron-tide-2024.jpg".into(), "ชื่อกับปีตรง".into()));
    assert_eq!(got("Night Bus (2020)"), ("sure".into(), "poster_tt7654321.jpg".into(), "เลข IMDb ตรงกัน".into()));
    assert_eq!(got("Ember (2022)"), ("sure".into(), "Ember (2022)-poster.jpg".into(), "รูปอยู่ข้างไฟล์หนัง".into()));
    assert_eq!(got("ลมหนาว (2020)"), ("sure".into(), "ลมหนาว 2020.webp".into(), "ชื่อกับปีตรง".into()));
    assert_eq!(got("Tidal (2021)"), ("sure".into(), "tidal_2021.jpg".into(), "ชื่อกับปีตรง".into()));
    let mok = row("เมืองในหมอก (2015)");
    assert_eq!(mok.status, "unsure");
    assert_eq!(mok.score, 82);
    assert_eq!(mok.candidates.len(), 3, "{:?}", mok.candidates.iter().map(|c| c.name.clone()).collect::<Vec<_>>());
    assert_eq!(mok.candidates[0].name, "เมืองหมอก.jpg");
    assert!(!mok.ticked && !mok.has_image());
    assert_eq!(row("Iron Tide (2010)").status, "unsure");
    assert_eq!(row("Iron Tide (2010)").candidates[0].name, "iron tide.jpg");
    assert_eq!(row("Paper Kites (2012)").status, "none");
    assert_eq!(row("Copper Sky (2014)").status, "none");
    let n = |s: &str| rows.iter().filter(|r| r.status == s).count();
    assert_eq!((n("sure"), n("unsure"), n("none"), rows.len()), (9, 2, 2, 13));

    // ทุกเรื่องบนชั้นวาง เรื่องที่มีปกในไฟล์ได้คู่ด้วย
    let rows2 = match_core(&all, &shelf, &imgs, &HashSet::new());
    assert_eq!(rows2.len(), 14);
    let c = rows2.iter().find(|r| r.title == "มีปกแล้ว (2017)").unwrap();
    assert_eq!((c.status.as_str(), c.has_cover), ("sure", true));
}

// ---------- ขั้น 2 เก็บรูปจริง ----------

struct Lab { root: PathBuf, movie: PathBuf, tall: PathBuf, wide: PathBuf, tools: PathBuf, thumbs: PathBuf, covers: PathBuf, work: PathBuf }
impl Drop for Lab { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.root); } }

/// โฟลเดอร์ทดลองในที่ชั่วคราว · หนังชื่อไทย รูปแนวตั้ง รูปแนวนอน คัดลอกจากชุดทดสอบ
fn lab(name: &str) -> Option<Lab> {
    let src = jm()?;
    let root = std::env::temp_dir().join(format!("ชั้นหนัง-เก็บปก-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    for d in ["หนัง", "รูป", "thumbs", "covers", "tmp"] { fs::create_dir_all(root.join(d)).unwrap(); }
    let movie = root.join("หนัง").join("ดาวตก (2024).mkv");
    fs::copy(src.join("หนัง").join("Tidal.2021.1080p.mkv"), &movie).unwrap();
    let (tall, wide) = (root.join("รูป").join("รูปตั้ง.jpg"), root.join("รูป").join("รูปนอน.jpg"));
    fs::copy(src.join("รูป").join("tidal_2021.jpg"), &tall).unwrap();
    fs::copy(src.join("รูป").join("silent-orbit-backdrop.jpg"), &wide).unwrap();
    Some(Lab {
        tools: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools"),
        thumbs: root.join("thumbs"), covers: root.join("covers"), work: root.join("tmp"), root, movie, tall, wide,
    })
}
impl Lab {
    fn env(&self) -> WriteEnv<'_> {
        WriteEnv { tools: &self.tools, work: &self.work, thumbs: &self.thumbs, covers: &self.covers, shrink: true, format: "jpg", quality: 90, also_app: false }
    }
    fn pick(&self, p: &Path) -> Pick {
        let (width, height) = header_size(p);
        Pick { path: p.to_string_lossy().to_string(), name: p.file_name().unwrap().to_string_lossy().to_string(), width, height, ..Default::default() }
    }
    fn mv(&self) -> Movie {
        Movie { id: "99".into(), path: self.movie.to_string_lossy().to_string(), name: "ดาวตก (2024)".into(), ..Default::default() }
    }
    fn row(&self) -> Row {
        Row { id: "99".into(), status: "manual".into(), ticked: true, tall: Some(self.pick(&self.tall)), wide: Some(self.pick(&self.wide)), ..Default::default() }
    }
    fn movie_dir(&self) -> Vec<String> {
        let mut v: Vec<String> = fs::read_dir(self.root.join("หนัง")).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
        v.sort();
        v
    }
    fn originals(&self) -> [String; 3] {
        [file_sha(&self.movie).unwrap(), file_sha(&self.tall).unwrap(), file_sha(&self.wide).unwrap()]
    }
}

/// ทั้ง 3 แบบเขียนถูกที่ ชื่อถูก ขนาดถูก · ไฟล์หนังกับรูปต้นฉบับเท่าเดิมทุกไบต์
#[test]
fn three_store_modes() {
    let Some(l) = lab("สามแบบ") else { return };
    let before = l.originals();

    // ค่าตั้งต้น คัดลอกไปข้างไฟล์หนัง
    let mut m = l.mv();
    let covers = apply_row(&l.env(), &m, &l.row(), "beside").unwrap();
    assert_eq!(covers.len(), 2);
    let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");
    assert_eq!(image::image_dimensions(&poster).unwrap(), (1000, 1500));
    assert_eq!(image::image_dimensions(&land).unwrap(), (1920, 1080));
    assert_eq!(l.movie_dir(), vec!["ดาวตก (2024)-landscape.jpg", "ดาวตก (2024)-poster.jpg", "ดาวตก (2024).mkv"], "ไม่มีไฟล์ชั่วคราวค้าง");
    let tall = &covers[0];
    assert!(tall.owned && tall.store == "beside" && tall.orient == "tall");
    assert_eq!(tall.sha256, file_sha(&poster));
    assert!(Path::new(&tall.thumb).exists());
    assert!((tall.aspect - 2.0 / 3.0).abs() < 0.01 && (covers[1].aspect - 16.0 / 9.0).abs() < 0.01);
    assert_eq!(image::image_dimensions(&tall.thumb).unwrap().1, 450);
    assert!(merge_covers(&mut m, covers).is_empty());
    assert_eq!(l.originals(), before, "ไฟล์หนังกับรูปต้นฉบับต้องไม่เปลี่ยนแม้แต่ไบต์เดียว");

    // ครอปใหม่ แทนไฟล์ของโปรแกรมเอง ชื่อเดิม ไม่มี (2) ไม่มีไฟล์ค้าง
    let old_sha = file_sha(&poster);
    let mut r = l.row();
    r.wide = None;
    let (w, h) = (r.tall.as_ref().unwrap().width, r.tall.as_ref().unwrap().height);
    r.tall.as_mut().unwrap().geo = Some(Geometry { tilt: 5.0, ..default_geo("tall", w, h) });
    let again = apply_row(&l.env(), &m, &r, "beside").unwrap();
    assert_ne!(file_sha(&poster), old_sha, "ไฟล์ต้องเปลี่ยนเป็นรูปที่ครอปใหม่");
    assert_eq!(again[0].file.as_deref(), Some(poster.to_string_lossy().as_ref()));
    assert_eq!(l.movie_dir().len(), 3);
    let old_thumb = m.linked[0].thumb.clone();
    let gone = merge_covers(&mut m, again);
    assert_eq!(gone.len(), 1);
    assert_eq!(gone[0].file, None, "ไฟล์ปลายทางเดียวกัน ห้ามเอาไปลบ");
    assert_eq!(remove_cover(&gone[0]), None);
    assert!(poster.exists());
    assert!(!Path::new(&old_thumb).exists(), "ภาพเล็กของรูปเก่าต้องไม่ค้าง");

    // เก็บสำเนาในโปรแกรม ไม่มีไฟล์เพิ่มข้างหนัง
    let a = l.mv();
    let n = l.movie_dir().len();
    let cov = apply_row(&l.env(), &a, &l.row(), "app").unwrap();
    assert_eq!(l.movie_dir().len(), n);
    assert!(cov.iter().all(|c| c.owned && c.store == "app" && Path::new(c.file.as_ref().unwrap()).starts_with(&l.covers)));
    assert_eq!(image::image_dimensions(cov[0].file.as_ref().unwrap()).unwrap(), (1000, 1500));

    // จับคู่อย่างเดียว ไม่มีไฟล์ใหม่ มีแค่ภาพเล็ก ค่าครอปจำไว้
    let cov = apply_row(&l.env(), &a, &l.row(), "link").unwrap();
    assert_eq!(l.movie_dir().len(), n);
    assert!(cov.iter().all(|c| !c.owned && c.file.is_none() && c.geo.is_some() && Path::new(&c.thumb).exists()));
    assert_eq!(cov[0].source, l.tall.to_string_lossy());
    assert_eq!(l.originals(), before);

    // PNG ตามค่าในหน้าตั้งค่า นามสกุลเปลี่ยนตาม
    let env = WriteEnv { format: "png", ..l.env() };
    let cov = apply_row(&env, &a, &l.row(), "beside").unwrap();
    assert!(cov[0].file.as_ref().unwrap().ends_with("ดาวตก (2024)-poster.png"), "{:?}", cov[0].file);
}

/// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม ได้สำเนาสองที่ ไบต์เดียวกัน · เอาปกออกไปทั้งคู่ · แบบอื่นไม่มีสำเนาซ้อน
#[test]
fn beside_and_app_together() {
    let Some(l) = lab("สองที่") else { return };
    let env = WriteEnv { also_app: true, ..l.env() };
    let before = l.originals();
    let m = l.mv();
    let only_app = apply_row(&env, &m, &l.row(), "app").unwrap();
    assert!(only_app.iter().all(|c| c.app_copy.is_none()), "เก็บในโปรแกรมอย่างเดียว ไม่มีสำเนาซ้อน");
    let only_link = apply_row(&env, &m, &l.row(), "link").unwrap();
    assert!(only_link.iter().all(|c| c.app_copy.is_none() && c.file.is_none()));
    let cov = apply_row(&env, &m, &l.row(), "beside").unwrap();
    assert_eq!(cov.len(), 2);
    for c in &cov {
        let copy = c.app_copy.as_ref().expect("ต้องมีสำเนาในโปรแกรม");
        assert!(Path::new(copy).starts_with(&l.covers));
        assert_eq!(file_sha(Path::new(copy)), c.sha256);
        assert_eq!(file_sha(Path::new(c.file.as_ref().unwrap())), c.sha256);
    }
    // ยืนยันรูปเดิมซ้ำ สำเนาชื่อเดิมยังถูกใช้อยู่ ห้ามถูกลบ
    let mut held = l.mv();
    assert!(merge_covers(&mut held, cov.clone()).is_empty());
    let again = apply_row(&env, &held, &l.row(), "beside").unwrap();
    let gone = merge_covers(&mut held, again);
    assert!(gone.iter().all(|g| g.app_copy.is_none()), "สำเนาที่ปกใหม่ใช้อยู่ต้องไม่อยู่ในรายการลบ");
    assert_eq!(l.originals(), before, "ไฟล์หนังกับรูปต้นฉบับต้องไม่เปลี่ยน");
    for c in &cov {
        let (f, copy) = (c.file.clone().unwrap(), c.app_copy.clone().unwrap());
        assert_eq!(remove_cover(c), None);
        assert!(!Path::new(&f).exists() && !Path::new(&copy).exists(), "เอาออกต้องไปทั้งสองที่");
    }
}

/// ย้ายปกในหน่วยความจำ ผ่านทางเดียวกับคำสั่งย้ายที่เก็บจริง (migrate_movie)
fn migrate_mem(env: &WriteEnv, m: &mut Movie, to: &str, want_copy: bool) -> (bool, bool, Vec<String>) {
    let snap = m.clone();
    let mut notes = vec![];
    let mut edit = |f: &mut dyn FnMut(&mut Movie)| -> Result<Option<Movie>, String> { f(m); Ok(Some(m.clone())) };
    let (bad, changed) = migrate_movie(env, &snap, to, want_copy, &mut notes, &mut edit).unwrap();
    (bad, changed, notes)
}

/// ทุกปกของเรื่องชี้ไฟล์ที่อยู่จริง ไบต์ตรงค่า hash ทั้งไฟล์หลักและสำเนาในโปรแกรม
fn covers_alive(m: &Movie) {
    for c in &m.linked {
        for f in [c.file.as_ref(), c.app_copy.as_ref()].into_iter().flatten() {
            assert!(Path::new(f).is_file(), "ปก {} ชี้ไฟล์ที่ไม่อยู่แล้ว {f}", c.orient);
            assert_eq!(file_sha(Path::new(f)), c.sha256, "ไฟล์ {f} ไบต์ไม่ตรงค่า hash");
        }
    }
}

/// AUDIT 12 พ.ย. 2569 ข้อ 1 · ติ๊กข้างไฟล์หนังพร้อมสำเนาในโปรแกรม แล้วย้ายไปในโปรแกรมอย่างเดียว ไฟล์ปกต้องไม่ลงถังขยะ
/// ทั้งตอนรูปต้นฉบับยังอยู่ (ทำรูปใหม่จากต้นฉบับ) และตอนลบรูปต้นฉบับไปแล้ว (คัดลอกไบต์จากไฟล์ข้างหนัง)
#[test]
fn migrate_beside_copy_to_app_keeps_cover() {
    for gone_src in [false, true] {
        let Some(l) = lab(if gone_src { "ย้ายต้นฉบับหาย" } else { "ย้ายต้นฉบับอยู่" }) else { return };
        let both = WriteEnv { also_app: true, ..l.env() };
        let mut m = l.mv();
        let cov = apply_row(&both, &m, &l.row(), "beside").unwrap();
        merge_covers(&mut m, cov);
        if gone_src { fs::remove_file(&l.tall).unwrap(); fs::remove_file(&l.wide).unwrap(); }
        // เอาติ๊กข้างไฟล์หนังออก เหลือในโปรแกรมอย่างเดียว · ค่าตั้งแบบนี้ไม่มีสำเนาที่สอง
        let (bad, changed, notes) = migrate_mem(&l.env(), &mut m, "app", false);
        assert!(!bad && changed, "ต้องย้ายสำเร็จ {notes:?}");
        assert!(m.linked.iter().all(|c| c.store == "app" && c.app_copy.is_none()), "{:?}", m.linked);
        covers_alive(&m);
        assert_eq!(l.movie_dir(), vec!["ดาวตก (2024).mkv"], "ไฟล์ข้างหนังที่โปรแกรมทำต้องเอาออก");
    }
}

/// ทางกลับ ในโปรแกรมอย่างเดียว ไปข้างไฟล์หนังพร้อมสำเนา · ไฟล์เดิมในโปรแกรมกลายเป็นสำเนาที่สอง ต้องไม่ลงถังขยะ
#[test]
fn migrate_app_to_beside_copy_keeps_cover() {
    for gone_src in [false, true] {
        let Some(l) = lab(if gone_src { "ย้ายกลับต้นฉบับหาย" } else { "ย้ายกลับต้นฉบับอยู่" }) else { return };
        let mut m = l.mv();
        let cov = apply_row(&l.env(), &m, &l.row(), "app").unwrap();
        merge_covers(&mut m, cov);
        let in_app: Vec<String> = m.linked.iter().filter_map(|c| c.file.clone()).collect();
        if gone_src { fs::remove_file(&l.tall).unwrap(); fs::remove_file(&l.wide).unwrap(); }
        let both = WriteEnv { also_app: true, ..l.env() };
        let (bad, changed, notes) = migrate_mem(&both, &mut m, "beside", true);
        assert!(!bad && changed, "ต้องย้ายสำเร็จ {notes:?}");
        assert!(m.linked.iter().all(|c| c.store == "beside" && c.app_copy.is_some()), "{:?}", m.linked);
        covers_alive(&m);
        let copies: Vec<String> = m.linked.iter().filter_map(|c| c.app_copy.clone()).collect();
        assert_eq!(copies, in_app, "ไฟล์เดิมในโปรแกรมใช้เป็นสำเนาต่อ ไม่ต้องทิ้งแล้วทำใหม่");
    }
}

/// ต้นเหตุเดียวกับข้อ 1 ทางที่ลบถาวร · เขียนข้างไฟล์หนังไม่ได้ ห้ามลบไฟล์ในโปรแกรมที่มีอยู่ก่อนแล้ว
/// และช่องหลังล้ม การเก็บกวาดห้ามลบไฟล์ที่ปกเดิมใช้เป็นสำเนาในโปรแกรม
#[test]
fn failed_write_keeps_files_old_covers_use() {
    let Some(l) = lab("ล้มไม่ลบของเดิม") else { return };
    let both = WriteEnv { also_app: true, ..l.env() };
    // ปกเดิมเก็บในโปรแกรมอย่างเดียว · เขียนข้างไฟล์หนังพร้อมสำเนาไม่ได้เพราะชื่อชนไฟล์คนอื่น
    let mut m = l.mv();
    let cov = apply_row(&l.env(), &m, &l.row(), "app").unwrap();
    merge_covers(&mut m, cov);
    let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    fs::write(&poster, b"foreign").unwrap();
    let old = m.linked.iter().find(|c| c.orient == "tall").unwrap().clone();
    assert!(write_cover(&both, &m.id, &l.movie, "tall", &l.pick(&l.tall), "beside", Some(&old)).is_err());
    covers_alive(&m);
    fs::remove_file(&poster).unwrap();

    // ปกเดิมข้างไฟล์หนังพร้อมสำเนา · ยืนยันใหม่แบบในโปรแกรม ช่องปกตั้งได้ไฟล์เดียวกับสำเนาเดิม ช่องปกนอนล้ม
    let mut m = l.mv();
    let cov = apply_row(&both, &m, &l.row(), "beside").unwrap();
    merge_covers(&mut m, cov);
    let mut r = l.row();
    r.wide.as_mut().unwrap().path = l.root.join("รูป").join("ไม่มีไฟล์นี้.jpg").to_string_lossy().to_string();
    assert!(apply_row(&l.env(), &m, &r, "app").is_err());
    covers_alive(&m);
}

/// ตัวกันลบตอนแทนปก เทียบไขว้ทุกช่อง · ไฟล์ของปกเก่าที่ปกใหม่ใช้อยู่ในช่องไหนก็ตาม ห้ามอยู่ในรายการลบ
#[test]
fn merge_checks_every_field() {
    let cov = |file: &str, copy: Option<&str>| LinkedCover { orient: "tall".into(), file: Some(file.into()), app_copy: copy.map(Into::into), source: "D:\\รูป.jpg".into(), owned: true, thumb: "D:\\t\\a.jpg".into(), ..Default::default() };
    // สำเนาเก่าเป็นไฟล์หลักของปกใหม่
    let mut m = Movie { linked: vec![cov("D:\\x-poster.jpg", Some("C:\\covers\\99-tall-abc.jpg"))], ..Default::default() };
    let gone = merge_covers(&mut m, vec![cov("C:\\covers\\99-tall-abc.jpg", None)]);
    assert_eq!(gone[0].app_copy, None, "สำเนาเก่าที่เป็นไฟล์หลักของปกใหม่ ห้ามลงถังขยะ");
    assert!(gone[0].file.is_some(), "ไฟล์ข้างหนังที่ไม่มีใครใช้แล้ว เอาออกได้");
    // ไฟล์หลักเก่าเป็นสำเนาของปกใหม่
    let mut m = Movie { linked: vec![cov("C:\\covers\\99-tall-abc.jpg", None)], ..Default::default() };
    let gone = merge_covers(&mut m, vec![cov("D:\\x-poster.jpg", Some("C:\\COVERS\\99-tall-abc.jpg"))]);
    assert_eq!(gone[0].file, None, "ไฟล์หลักเก่าที่เป็นสำเนาของปกใหม่ ห้ามลงถังขยะ");
}

/// ค่าตั้งไฟล์เก่ามีแค่แบบเดียว อ่านแล้วคงแบบเดิม · ติ๊กหลายแบบ แบบหลักข้างไฟล์หนังก่อน
#[test]
fn store_settings_old_and_many() {
    let mut old: crate::app::store::Settings = serde_json::from_str(r#"{"linkStore":"app"}"#).unwrap();
    old.normalize_link_stores();
    assert_eq!(old.link_stores, vec!["app".to_string()]);
    assert_eq!(old.link_store, "app");
    assert!(!old.also_app());
    let mut all: crate::app::store::Settings = serde_json::from_str(r#"{"linkStores":["link","app","beside"]}"#).unwrap();
    all.normalize_link_stores();
    assert_eq!(all.link_store, "beside");
    assert!(all.also_app());
}

/// ไฟล์ชื่อเดียวกันที่โปรแกรมไม่ได้ทำ ไม่โดนทับ · ช่องหลังล้ม ไฟล์ใหม่ของช่องก่อนถูกเอาออก
#[test]
fn never_overwrites_foreign_files() {
    let Some(l) = lab("ไม่ทับ") else { return };
    let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");
    let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    fs::write(&land, b"foreign").unwrap();
    let e = apply_row(&l.env(), &l.mv(), &l.row(), "beside").unwrap_err();
    assert_eq!(e.conflict.as_deref(), Some(land.to_string_lossy().as_ref()));
    assert!(e.msg.contains("ไม่เขียนทับ"), "{}", e.msg);
    assert_eq!(fs::read(&land).unwrap(), b"foreign", "ไฟล์ของคนอื่นต้องเหมือนเดิม");
    assert!(!poster.exists(), "ช่องปกตั้งที่ทำไปแล้วต้องถูกเอาออก แถวไม่ครึ่ง ๆ กลาง ๆ");
    assert_eq!(l.movie_dir(), vec!["ดาวตก (2024)-landscape.jpg", "ดาวตก (2024).mkv"]);

    // ไฟล์ของโปรแกรมที่ถูกแก้ภายหลัง ก็ไม่ถือเป็นของโปรแกรมแล้ว
    let r = Row { wide: None, ..l.row() };
    let cov = apply_row(&l.env(), &l.mv(), &r, "beside").unwrap();
    let mut m = l.mv();
    merge_covers(&mut m, cov);
    fs::write(&poster, b"edited").unwrap();
    let e = apply_row(&l.env(), &m, &r, "beside").unwrap_err();
    assert!(e.conflict.is_some());
    assert_eq!(fs::read(&poster).unwrap(), b"edited");
}

/// ผู้ช่วยตรวจขั้น 8 · ปกที่เหลือใช้ไฟล์นี้เป็นรูปต้นทาง ต้องไม่เอาออก · ชื่อต่างแค่ตัวพิมพ์คือไฟล์เดียวกัน
#[test]
fn merge_keeps_files_still_in_use() {
    let cover = |file: &str, source: &str| LinkedCover { orient: "tall".into(), file: Some(file.into()), source: source.into(), owned: true, store: "beside".into(), thumb: "D:\\t\\a.jpg".into(), ..Default::default() };
    // ย้ายเป็นจับคู่อย่างเดียว ปกใหม่ใช้สำเนาเก่าเป็นรูปต้นทาง
    let mut m = Movie { linked: vec![cover("D:\\x-poster.jpg", "D:\\รูป.jpg")], ..Default::default() };
    let gone = merge_covers(&mut m, vec![LinkedCover { file: None, source: "D:\\x-poster.jpg".into(), store: "link".into(), thumb: "D:\\t\\b.jpg".into(), ..cover("", "") }]);
    assert_eq!(gone[0].file, None, "ไฟล์ที่ปกใหม่ใช้เป็นต้นทาง ห้ามลงถังขยะ");
    // เปลี่ยนแค่ตัวพิมพ์ของชื่อหนัง ไฟล์เดียวกันบน Windows
    let mut m = Movie { linked: vec![cover("D:\\iron tide-poster.jpg", "D:\\รูป.jpg")], ..Default::default() };
    let gone = merge_covers(&mut m, vec![cover("D:\\Iron Tide-poster.jpg", "D:\\รูป.jpg")]);
    assert_eq!(gone[0].file, None, "ชื่อต่างแค่ตัวพิมพ์ ห้ามลงถังขยะ");
    assert!(gone[0].thumb.is_empty(), "ภาพเล็กเดียวกันห้ามลบ");
}

/// ผู้ช่วยตรวจขั้น 8 · ช่องปกนอนชนไฟล์คนอื่น ต้องล้มก่อนแตะไฟล์ปกตั้ง
#[test]
fn conflict_checked_before_any_write() {
    let Some(l) = lab("ชนก่อนเขียน") else { return };
    let mut m = l.mv();
    let covers = apply_row(&l.env(), &m, &Row { wide: None, ..l.row() }, "beside").unwrap();
    merge_covers(&mut m, covers);
    let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    let sha = file_sha(&poster);
    fs::write(l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg"), "ของคนอื่น").unwrap();
    let mut p = l.pick(&l.tall);
    p.geo = Some(Geometry { tilt: 5.0, ..default_geo("tall", p.width, p.height) });
    let e = apply_row(&l.env(), &m, &Row { tall: Some(p), ..l.row() }, "beside").unwrap_err();
    assert!(e.conflict.is_some());
    assert_eq!(file_sha(&poster), sha, "ปกตั้งต้องไม่ถูกแทน");
}

/// ผู้ช่วยตรวจขั้น 8 · ยืนยันกับย้ายที่เก็บห้ามซ้อนกัน ระหว่างนั้นห้ามแก้แถว · งานจบหรือล้มต้องปลดเอง
#[test]
fn busy_guard_blocks_overlap() {
    let store = Arc::new(LinkStore::load(std::env::temp_dir().join(format!("ชั้นหนัง-กันซ้อน-{}.json", std::process::id()))));
    assert!(store.idle().is_ok());
    let g = begin_busy(&store).unwrap();
    assert!(store.is_busy() && store.idle().is_err());
    assert!(begin_busy(&store).is_err(), "งานที่สองต้องไม่เริ่ม");
    drop(g);
    assert!(store.idle().is_ok(), "งานจบแล้วต้องปลด");
}

/// ผู้ช่วยตรวจขั้น 8 · หนังไม่มีปีกับรูปหลายปี · เลขท้ายชื่อที่อาจเป็นชื่อเรื่อง · ไม่ติ๊กให้ถ้าไม่มีปี
#[test]
fn matcher_does_not_guess() {
    let m = |stem: &str| MovieIn { id: stem.into(), path: format!("D:\\หนัง\\{stem}.mkv"), stem: stem.into(), title: movie_title(Path::new(&format!("D:\\หนัง\\{stem}.mkv"))), ..Default::default() };
    let img = |n: &str| ImgIn { path: format!("D:\\รูป\\{n}"), name: n.into(), width: 1000, height: 1500, ..Default::default() };
    let go = |stem: &str, imgs: &[&str]| { let mv = m(stem); let shelf = vec![mv.title.clone()]; let list: Vec<ImgIn> = imgs.iter().map(|n| img(n)).collect(); match_core(&[mv], &shelf, &list, &HashSet::new()).remove(0) };
    let r = go("Dune", &["Dune (1984).jpg", "Dune (2021).jpg"]);
    assert_eq!(r.status, "unsure");
    assert_eq!(r.candidates.len(), 2);
    assert!(!r.has_image(), "รูปหลายปีห้ามเลือกให้");
    let r = go("Wonder Woman 1984", &["wonder-woman.jpg"]);
    assert_eq!(r.status, "unsure", "เลขท้ายชื่ออาจเป็นชื่อเรื่อง");
    let r = go("Blade Runner 2049", &["blade-runner.jpg"]);
    assert_ne!(r.status, "sure", "ภาคต่อห้ามได้ปกภาคแรกแบบแน่");
    let r = go("The Final Cut", &["The Cut (2014).jpg"]);
    assert_ne!(r.status, "sure", "คนละเรื่อง");
    let r = go("Silent.Orbit.2018", &["silent-orbit-backdrop.jpg"]);
    assert_eq!(r.status, "sure");
    assert!(!r.ticked, "ไม่มีปีในชื่อรูป ไม่ติ๊กให้");
    let r = go("Tidal.2021.1080p", &["tidal_2021.jpg"]);
    assert!(r.ticked, "ชื่อกับปีตรง ติ๊กให้");
}

/// ผู้ช่วยตรวจขั้น 8 · แถวจากชั้นวางที่ยังไม่แตะไม่นับว่ารอ · แตะแล้วนับ
#[test]
fn shelf_rows_count_only_after_touch() {
    let pick = Pick { path: "D:\\a.jpg".into(), width: 1000, height: 1500, ..Default::default() };
    let mut r = Row { id: "1".into(), status: "manual".into(), via: "shelf".into(), ticked: true, tall: Some(pick), ..Default::default() };
    assert!(!is_waiting(&r));
    assert!(select_rows(std::slice::from_ref(&r), "all").is_empty());
    assert_eq!(select_rows(std::slice::from_ref(&r), "1"), vec!["1".to_string()], "กดยืนยันที่แถวตรง ๆ ยังใช้ได้");
    r.touched = true;
    assert!(is_waiting(&r));
}

/// รูปต้นทางคือไฟล์ชื่อนั้นข้างหนังอยู่แล้ว ไม่ได้ครอป ใช้ไฟล์นั้นเลย · ครอปแล้วจะทับต้นฉบับ ต้องไม่เขียน
#[test]
fn existing_art_is_used_as_is() {
    let Some(l) = lab("มีอยู่แล้ว") else { return };
    let art = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    fs::copy(&l.tall, &art).unwrap();
    let sha = file_sha(&art);
    let r = Row { tall: Some(l.pick(&art)), wide: None, ..l.row() };
    let cov = apply_row(&l.env(), &l.mv(), &r, "beside").unwrap();
    assert!(!cov[0].owned, "ไม่ใช่ไฟล์ที่โปรแกรมทำ");
    assert_eq!(cov[0].file.as_deref(), Some(art.to_string_lossy().as_ref()));
    assert_eq!(file_sha(&art), sha);
    assert_eq!(l.movie_dir().len(), 2);
    // เอาปกออกแล้วไฟล์ต้องยังอยู่
    assert_eq!(remove_cover(&cov[0]), None);
    assert!(art.exists());

    let mut p = l.pick(&art);
    p.geo = Some(Geometry { tilt: 3.0, ..default_geo("tall", p.width, p.height) });
    let e = apply_row(&l.env(), &l.mv(), &Row { tall: Some(p), wide: None, ..l.row() }, "beside").unwrap_err();
    assert!(e.conflict.is_some(), "ครอปแล้วชื่อชนกับต้นฉบับ ต้องไม่ทับ");
    assert_eq!(file_sha(&art), sha);
}

/// แผงขวากับป้ายในตารางบอกว่าครอปแล้วเฉพาะที่ผู้ใช้ครอปเอง · ค่ากลางรูปที่โปรแกรมตั้งให้ไม่นับ
#[test]
fn cropped_only_when_user_cropped() {
    let Some(l) = lab("ครอปเอง") else { return };
    let plain = apply_row(&l.env(), &l.mv(), &Row { wide: None, ..l.row() }, "app").unwrap();
    assert!(!plain[0].cropped);
    assert!(plain[0].geo.is_some(), "ค่ากลางรูปยังจดไว้ ใช้ต่อตอนรวมเข้าไฟล์");

    let mut p = l.pick(&l.tall);
    p.geo = Some(Geometry { tilt: 2.0, ..default_geo("tall", p.width, p.height) });
    let done = apply_row(&l.env(), &l.mv(), &Row { tall: Some(p), wide: None, ..l.row() }, "app").unwrap();
    assert!(done[0].cropped);
}

/// เอาปกออก · ไฟล์ของโปรแกรมลงถังขยะ · ไฟล์ที่ถูกแก้ไม่ลบ · เปลี่ยนชื่อหนังแล้วสำเนาตามชื่อ
#[test]
fn remove_and_rename() {
    let Some(l) = lab("เอาออก") else { return };
    let r = l.row();
    let mut m = l.mv();
    let made = apply_row(&l.env(), &m, &r, "beside").unwrap();
    merge_covers(&mut m, made);
    let poster = l.root.join("หนัง").join("ดาวตก (2024)-poster.jpg");
    let land = l.root.join("หนัง").join("ดาวตก (2024)-landscape.jpg");

    // เปลี่ยนชื่อหนัง ทั้งสองไฟล์ตามชื่อใหม่
    let renamed = l.root.join("หนัง").join("ดาวตกภาคใหม่.mkv");
    fs::rename(&l.movie, &renamed).unwrap();
    rename_beside(&mut m, &renamed);
    let new_poster = l.root.join("หนัง").join("ดาวตกภาคใหม่-poster.jpg");
    let new_land = l.root.join("หนัง").join("ดาวตกภาคใหม่-landscape.jpg");
    assert!(new_poster.exists() && new_land.exists() && !poster.exists() && !land.exists());
    assert_eq!(m.linked[0].file.as_deref(), Some(new_poster.to_string_lossy().as_ref()));

    // ไฟล์ที่ถูกแก้ ไม่ลบ บอกกลับ
    fs::write(&new_land, b"edited").unwrap();
    let wide = m.linked.iter().find(|c| c.orient == "wide").unwrap();
    assert!(remove_cover(wide).unwrap().contains("ถูกแก้"));
    assert!(new_land.exists());
    // ไฟล์ของโปรแกรมที่ไม่ถูกแก้ ลงถังขยะ ภาพเล็กหายด้วย
    let tall = m.linked.iter().find(|c| c.orient == "tall").unwrap();
    assert_eq!(remove_cover(tall), None);
    assert!(!new_poster.exists() && !Path::new(&tall.thumb).exists());
    assert!(renamed.exists(), "ไฟล์หนังต้องอยู่");
}

/// ยืนยันทั้งหมด ไม่รวมแถวไม่แน่ใจที่ยังไม่เลือกรูป กับแถวหาคู่ไม่เจอ (พี่กันเคาะ) · ที่ติ๊กไว้นับตามติ๊ก
#[test]
fn which_rows_confirm() {
    let p = Some(Pick { path: "x.jpg".into(), width: 10, height: 15, ..Default::default() });
    let row = |id: &str, status: &str, tall: Option<Pick>, ticked: bool| Row { id: id.into(), status: status.into(), tall, ticked, ..Default::default() };
    let rows = vec![
        row("sure", "sure", p.clone(), true),
        row("off", "sure", p.clone(), false),
        row("chosen", "unsure", p.clone(), true),
        row("unsure", "unsure", None, false),
        row("none", "none", None, false),
        row("saved", "saved", p.clone(), false),
    ];
    assert_eq!(select_rows(&rows, "ticked"), vec!["sure", "chosen"]);
    assert_eq!(select_rows(&rows, "all"), vec!["sure", "off", "chosen"]);
    assert_eq!(select_rows(&rows, "off"), vec!["off"]);
    assert!(select_rows(&rows, "saved").is_empty(), "แถวที่ยืนยันแล้วยืนยันซ้ำไม่ได้");
    assert!(select_rows(&rows, "unsure").is_empty(), "แถวไม่มีรูปยืนยันไม่ได้");
}

/// คลังเก่าที่ไม่มีช่องปกจับคู่ยังอ่านได้ · ค่าตั้งต้นของหน้าตั้งค่าคือคัดลอกไปข้างไฟล์หนัง
#[test]
fn old_data_still_reads() {
    let old: Movie = serde_json::from_str(r#"{"id":"1","path":"D:\\a.mkv","name":"a"}"#).unwrap();
    assert!(old.linked.is_empty() && old.cover_pick.is_empty());
    let s: crate::app::store::Settings = serde_json::from_str("{}").unwrap();
    assert_eq!(s.link_store, "beside");
}

/// ปิดเปิดโปรแกรมแล้วแถวครบ · แถวที่ยืนยันแล้วไม่กลับมา · ไฟล์เสียใช้สำรอง
#[test]
fn store_survives_restart() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-จับคู่-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("pending.json");
    let s = LinkStore::load(path.clone());
    assert_eq!(s.data.lock().unwrap().scope, "nocover");
    let pick = Pick { path: "D:\\รูป\\ก.jpg".into(), name: "ก.jpg".into(), width: 1000, height: 1500, ..Default::default() };
    {
        let mut d = s.data.lock().unwrap();
        d.image_folders = vec!["D:\\รูป".into()];
        d.rows = vec![
            Row { id: "1".into(), status: "sure".into(), tall: Some(pick.clone()), ticked: true, ..Default::default() },
            Row { id: "2".into(), status: "saved".into(), tall: Some(pick.clone()), ..Default::default() },
            Row { id: "3".into(), status: "none".into(), ..Default::default() },
        ];
    }
    s.save().unwrap();
    assert_eq!(s.waiting(), 1, "นับเฉพาะแถวที่มีรูปและยังไม่ยืนยัน");
    s.save().unwrap(); // รอบสองมีไฟล์สำรองแล้ว
    let back = LinkStore::load(path.clone());
    {
        let d = back.data.lock().unwrap();
        assert_eq!(d.rows.iter().map(|r| r.id.as_str()).collect::<Vec<_>>(), vec!["1", "3"], "แถวที่ยืนยันแล้วของรอบก่อนไม่กลับมา");
        assert_eq!(d.rows[0].tall.as_ref().unwrap().name, "ก.jpg");
        assert_eq!(d.image_folders, vec!["D:\\รูป".to_string()]);
    }
    fs::write(&path, "{ไม่ใช่ JSON").unwrap();
    assert_eq!(LinkStore::load(path).data.lock().unwrap().rows.len(), 2, "ไฟล์เสียต้องอ่านจากสำรอง");
    let _ = fs::remove_dir_all(&dir);
}

/// AUDIT 12 พ.ย. 2569 ข้อ 11 · จับคู่ทุกเรื่องรอบใหม่ได้รูปต้นทางเดิม ยกค่าครอปเดิมมา · รูปอื่นหรือช่องอื่นไม่ยก · แถวที่ตั้งครอปไว้แล้วไม่ทับ
#[test]
fn rematch_all_keeps_own_crops() {
    let geo = Geometry { x: 0.1, y: 0.2, w: 0.5, h: 0.75, ..Default::default() };
    let cover = |orient: &str, src: &str| LinkedCover { orient: orient.into(), source: src.into(), geo: Some(geo.clone()), thumb: format!("thumb-{orient}.jpg"), ..Default::default() };
    let movie = Movie { id: "m1".into(), linked: vec![cover("tall", "D:\\รูป\\A.jpg"), cover("wide", "D:\\รูป\\W.jpg")], ..Default::default() };
    let pick = |p: &str| Some(Pick { path: p.into(), ..Default::default() });
    let mut rows = vec![
        Row { id: "m1".into(), tall: pick("d:\\รูป\\a.jpg"), wide: pick("D:\\รูป\\อื่น.jpg"), ..Default::default() },
        Row { id: "m2".into(), tall: pick("D:\\รูป\\A.jpg"), ..Default::default() },
    ];
    carry_crops(&mut rows, &[movie.clone()]);
    assert_eq!(rows[0].tall.as_ref().unwrap().geo, Some(geo.clone()), "รูปต้นทางเดิม ตัวพิมพ์ต่างกัน ต้องยกค่าครอปมา");
    assert_eq!(rows[0].tall.as_ref().unwrap().crop_thumb.as_deref(), Some("thumb-tall.jpg"));
    assert!(rows[0].wide.as_ref().unwrap().geo.is_none(), "รูปอื่นไม่ยกค่าครอป");
    assert!(rows[1].tall.as_ref().unwrap().geo.is_none(), "เรื่องอื่นไม่ยก");
    // แถวที่มีค่าครอปของตัวเองแล้วไม่ทับ
    let mine = Geometry { x: 0.3, ..geo.clone() };
    let mut rows2 = vec![Row { id: "m1".into(), tall: Some(Pick { path: "D:\\รูป\\A.jpg".into(), geo: Some(mine.clone()), ..Default::default() }), ..Default::default() }];
    carry_crops(&mut rows2, &[movie]);
    assert_eq!(rows2[0].tall.as_ref().unwrap().geo, Some(mine));
}

/// AUDIT ข้อ 11 · แทนปกที่โปรแกรมทำไว้ ไฟล์รุ่นก่อนไม่ค้างในโฟลเดอร์ (ไปถังขยะ) และไฟล์ปลายทางเป็นรุ่นใหม่
#[test]
fn replace_own_moves_old_out_of_folder() {
    let dir = std::env::temp_dir().join(format!("ชั้นหนัง-แทนปก-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    let target = dir.join("หนัง-poster.jpg");
    fs::write(&target, b"old").unwrap();
    replace_own(&target, b"new").unwrap();
    assert_eq!(fs::read(&target).unwrap(), b"new");
    let left: Vec<_> = fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
    assert_eq!(left, vec!["หนัง-poster.jpg".to_string()], "ไม่มีไฟล์ .old หรือ .partial ค้าง");
    let _ = fs::remove_dir_all(&dir);
}
