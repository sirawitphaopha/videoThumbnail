//! จับคู่รูปปก คำสั่งให้หน้าจอ อ่านสถานะ รูป จับคู่อัตโนมัติ จับคู่เอง เลิกทำ ครอป แก้แถว
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- คำสั่งให้หน้าจอเรียก

pub(crate) struct Dirs { tools: PathBuf, work: PathBuf, thumbs: PathBuf }

pub(crate) fn dirs(app: &AppHandle) -> Result<Dirs, String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(Dirs { tools: crate::app::tools::tools_dir(app)?, work: local.join("tmp"), thumbs: local.join("thumbs").join("link-src") })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkReply {
    pub rows: Vec<Row>,
    pub image_folders: Vec<String>,
    pub loose: Vec<String>,
    pub scope: String,
    pub waiting: usize,
}

/// หนังที่ถูกเปลี่ยนชื่อหรือย้าย แถวตามชื่อใหม่ · หนังที่หายจากคลังแล้ว แถวหายด้วย
fn refresh_rows(data: &mut LinkFile, movies: &[Movie]) {
    // เลขประจำไฟล์เปลี่ยนได้โดยที่เป็นเรื่องเดิม (รวมเสียงเข้าไฟล์ได้ไฟล์ใหม่ชื่อเดิม) หาจากที่อยู่ก่อนทิ้งแถว
    data.rows.retain_mut(|r| match movies.iter().find(|m| m.id == r.id).or_else(|| movies.iter().find(|m| m.path.eq_ignore_ascii_case(&r.movie))) {
        Some(m) => {
            r.id = m.id.clone();
            if r.movie != m.path {
                let t = movie_title(Path::new(&m.path));
                if !t.pretty.is_empty() { r.title = t.pretty; }
                r.movie = m.path.clone();
            }
            r.has_cover = m.has_cover;
            true
        }
        None => false,
    });
}

pub(crate) fn reply(store: &LinkStore, movies: &[Movie]) -> LinkReply {
    let mut d = store.data.lock().unwrap();
    refresh_rows(&mut d, movies);
    let waiting = d.rows.iter().filter(|r| is_waiting(r)).count();
    LinkReply { rows: d.rows.clone(), image_folders: d.image_folders.clone(), loose: d.loose.clone(), scope: d.scope.clone(), waiting }
}

pub(crate) fn movies_of(lib: &LibraryStore) -> Vec<Movie> {
    lib.movies.lock().unwrap().clone()
}

/// แถวที่จับคู่ได้รูปต้นทางเดียวกับปกจับคู่เดิมช่องเดียวกัน ยกค่าครอปกับภาพหลังครอปเดิมมาใส่
/// ยืนยันทั้งหมดแล้วได้ปกแบบที่ครอปเองไว้ ไม่กลายเป็นครอปกลางรูป (AUDIT 12 พ.ย. 2569 ข้อ 11)
pub(crate) fn carry_crops(rows: &mut [Row], movies: &[Movie]) {
    for r in rows.iter_mut() {
        let Some(m) = movies.iter().find(|m| m.id == r.id) else { continue };
        for (orient, slot) in [("tall", &mut r.tall), ("wide", &mut r.wide)] {
            let Some(p) = slot.as_mut() else { continue };
            if p.geo.is_some() { continue; }
            let old = m.linked.iter().find(|c| c.orient == orient && c.geo.is_some() && same_file(Path::new(&c.source), Path::new(&p.path)));
            if let Some(c) = old {
                p.geo = c.geo.clone();
                p.crop_thumb = Some(c.thumb.clone());
            }
        }
    }
}

#[tauri::command]
pub fn link_state(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>) -> LinkReply {
    reply(&store, &movies_of(&lib))
}

/// ใส่ภาพเล็กที่ทำเสร็จแล้วลงรูปในแถว · คืนว่ามีอะไรเปลี่ยนไหม
fn fill_thumbs(data: &mut LinkFile, cache: &HashMap<String, (PathBuf, u32, u32)>) -> bool {
    let mut changed = false;
    for r in data.rows.iter_mut() {
        for p in [r.tall.as_mut(), r.wide.as_mut()].into_iter().flatten().chain(r.candidates.iter_mut()) {
            if p.thumb.is_none() {
                if let Some(h) = cache.get(&thumb_key(Path::new(&p.path))) {
                    p.thumb = Some(h.0.to_string_lossy().to_string());
                    if p.width == 0 { p.width = h.1; p.height = h.2; }
                    changed = true;
                }
            }
        }
    }
    changed
}

/// ทำภาพเล็กของรูปที่ยังไม่มี ทีละ 3 รูปพร้อมกัน แจ้งหน้าจอทีละรูป · กำลังทำอยู่แล้วทำอีกรอบตอนจบ
fn start_thumbs(app: &AppHandle) {
    let store = app.state::<Arc<LinkStore>>().inner().clone();
    if store.thumbing.swap(true, Ordering::SeqCst) {
        store.rethumb.store(true, Ordering::SeqCst);
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            let Ok(d) = dirs(&app) else { break };
            let (folders, mut loose) = { let x = store.data.lock().unwrap(); (x.image_folders.clone(), x.loose.clone()) };
            // รูปในแถวที่ไม่ได้อยู่ในโฟลเดอร์ที่เลือก (รูปข้างไฟล์หนัง) ก็ต้องมีภาพเล็ก
            loose.extend(store.data.lock().unwrap().rows.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.clone()));
            loose.extend(store.data.lock().unwrap().rows.iter().flat_map(|r| r.candidates.iter()).map(|p| p.path.clone()));
            let todo: Vec<ImgIn> = list_images(&folders, &loose, &d.thumbs).into_iter().filter(|i| i.thumb.is_none()).collect();
            let queue = Mutex::new(todo);
            std::thread::scope(|sc| {
                for _ in 0..3 {
                    sc.spawn(|| loop {
                        let Some(img) = queue.lock().unwrap().pop() else { break };
                        let done = make_src_thumb(&d.tools, &d.work, &d.thumbs, Path::new(&img.path));
                        let msg = match done {
                            Ok((t, w, h)) => LinkImage { path: img.path, name: img.name, folder: img.folder, width: w, height: h, thumb: Some(t.to_string_lossy().to_string()), used: false, error: None },
                            Err(e) => LinkImage { path: img.path, name: img.name, folder: img.folder, width: img.width, height: img.height, thumb: None, used: false, error: Some(e) },
                        };
                        let _ = app.emit("link-thumb", msg);
                    });
                }
            });
            // จดภาพเล็กลงแถว เปิดโปรแกรมครั้งหน้าไม่ต้องรอแจ้งใหม่ · ไม่จด รูปข้างไฟล์หนังขึ้นช่องว่างหลังเปิดหน้าใหม่
            let cache = cached_thumbs(&d.thumbs);
            if fill_thumbs(&mut store.data.lock().unwrap(), &cache) { let _ = store.save(); }
            if !store.rethumb.swap(false, Ordering::SeqCst) { break; }
        }
        store.thumbing.store(false, Ordering::SeqCst);
    });
}

/// ไฟล์ปกที่โปรแกรมทำเอง ตัวเล็กทั้งหมด
fn own_files(movies: &[Movie]) -> HashSet<String> {
    movies.iter().flat_map(|m| &m.linked).flat_map(|c| [c.file.as_ref().filter(|_| c.owned), c.app_copy.as_ref()]).flatten().map(|f| f.to_lowercase()).collect()
}

fn images_now(app: &AppHandle, store: &LinkStore) -> Result<Vec<LinkImage>, String> {
    let d = dirs(app)?;
    let (folders, loose, rows) = { let x = store.data.lock().unwrap(); (x.image_folders.clone(), x.loose.clone(), x.rows.clone()) };
    let mut taken: HashSet<String> = rows.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.to_lowercase()).collect();
    // รูปที่ยืนยันไปรอบก่อนนับว่าใช้แล้ว เปิดโปรแกรมใหม่แล้วไม่กลับมาบนกระดาน · ไฟล์ปกที่โปรแกรมทำเองไม่ขึ้นเลย ไม่ใช่รูปต้นทาง
    let movies = movies_of(&app.state::<Arc<LibraryStore>>());
    taken.extend(movies.iter().flat_map(|m| &m.linked).map(|c| c.source.to_lowercase()));
    let own = own_files(&movies);
    Ok(list_images(&folders, &loose, &d.thumbs).into_iter().filter(|i| !own.contains(&i.path.to_lowercase())).map(|i| LinkImage {
        used: taken.contains(&i.path.to_lowercase()), path: i.path, name: i.name, folder: i.folder, width: i.width, height: i.height, thumb: i.thumb, error: None,
    }).collect())
}

/// รูปทั้งหมดบนกระดาน · เริ่มทำภาพเล็กของรูปที่ยังไม่มี
#[tauri::command]
pub async fn link_images(app: AppHandle) -> Result<Vec<LinkImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let out = images_now(&app, &store)?;
        start_thumbs(&app);
        Ok(out)
    }).await.map_err(|e| e.to_string())?
}

/// เพิ่มโฟลเดอร์รูปหรือรูปทีละรูป · ลากมาหลายอย่างปนกันได้ · ไฟล์ที่ไม่ใช่รูปไม่รับ บอกกลับ
#[tauri::command]
pub fn link_add_images(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, paths: Vec<String>) -> Result<LinkReply, String> {
    store.idle()?;
    let mut bad = vec![];
    {
        let mut d = store.data.lock().unwrap();
        for p in paths {
            let path = Path::new(&p);
            if path.is_dir() {
                if !d.image_folders.iter().any(|f| f.eq_ignore_ascii_case(&p)) { d.image_folders.push(p); }
            } else if path.is_file() && pi::ACCEPTED.contains(&pi::ext_of(path).as_str()) {
                if !d.loose.iter().any(|f| f.eq_ignore_ascii_case(&p)) { d.loose.push(p); }
            } else {
                bad.push(path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(p));
            }
        }
    }
    store.save()?;
    start_thumbs(&app);
    if !bad.is_empty() {
        return Err(format!("ไฟล์ {} ไม่ใช่รูปจึงไม่รับ  รับรูป JPG PNG WebP BMP TIFF และ HEIC", bad.join(", ")));
    }
    Ok(reply(&store, &movies_of(&lib)))
}

/// เอาโฟลเดอร์รูปหรือรูปออกจากกระดาน · รูปในเครื่องไม่ถูกแตะ
#[tauri::command]
pub fn link_remove_images(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, path: String) -> Result<LinkReply, String> {
    {
        let mut d = store.data.lock().unwrap();
        d.image_folders.retain(|f| !f.eq_ignore_ascii_case(&path));
        d.loose.retain(|f| !f.eq_ignore_ascii_case(&path));
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AutoSummary {
    pub images: usize,
    pub sure: usize,
    pub unsure: usize,
    pub none: usize,
    /// รูปแนวตั้ง · รูปแนวนอน
    pub tall: usize,
    pub wide: usize,
    pub reply: LinkReply,
}

/// จับคู่อัตโนมัติ · แถวที่จับคู่เองกับแถวที่ยืนยันแล้วคงไว้ แถวอัตโนมัติเดิมถูกแทน · ยังไม่บันทึกอะไรนอกจากรายการรอยืนยัน
#[tauri::command]
pub async fn link_auto(app: AppHandle, scope: String) -> Result<AutoSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        // ถือตัวกันงานตลอดการอ่านรูป · เดิมเช็กว่างแค่ตอนเริ่ม แล้วเขียนรายการที่จดไว้ตอนเริ่มทับตอนจบ
        // ครอป เอาติ๊กออก หรือยืนยันระหว่างอ่านจึงหายหมด และจับคู่ซ้อนสองงานได้ (AUDIT 12 พ.ย. 2569 ข้อ 10)
        let _busy = begin_busy(&store)?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let scope = if scope == "all" { "all".to_string() } else { "nocover".to_string() };
        let (folders, loose, keep) = {
            let mut x = store.data.lock().unwrap();
            x.scope = scope.clone();
            (x.image_folders.clone(), x.loose.clone(), x.rows.iter().filter(|r| r.status == "saved" || r.via != "auto" || r.touched).cloned().collect::<Vec<_>>())
        };
        let own = own_files(&movies);
        let mut images = list_images(&folders, &loose, &d.thumbs);
        images.retain(|i| !own.contains(&i.path.to_lowercase()));
        // HEIC อ่านขนาดจากหัวไฟล์ไม่ได้ ถอดเลย ไม่งั้นบอกแนวไม่ได้
        for i in images.iter_mut().filter(|i| i.width == 0) {
            if let Ok((t, w, h)) = make_src_thumb(&d.tools, &d.work, &d.thumbs, Path::new(&i.path)) {
                i.width = w; i.height = h; i.thumb = Some(t.to_string_lossy().to_string());
            }
        }
        let counts = dir_counts(movies.iter().map(|m| m.path.as_str()));
        let kept: HashSet<&str> = keep.iter().map(|r| r.id.as_str()).collect();
        let shelf: Vec<Title> = movies.iter().map(|m| movie_title(Path::new(&m.path))).collect();
        let targets: Vec<MovieIn> = movies.iter()
            .filter(|m| !m.missing && !kept.contains(m.id.as_str()) && (scope == "all" || (!m.has_cover && m.linked.is_empty())))
            .map(|m| movie_in(&m.id, &m.path, m.has_cover, &counts, &d.thumbs, &own)).collect();
        let mut taken: HashSet<String> = keep.iter().flat_map(|r| [&r.tall, &r.wide]).flatten().map(|p| p.path.clone()).collect();
        // เฉพาะเรื่องที่ยังไม่มีปก รูปที่ยืนยันไปแล้วไม่ไปซ้ำเรื่องอื่น · ทุกเรื่องตั้งใจจับคู่ใหม่หมด จึงไม่กัน
        if scope != "all" { taken.extend(movies.iter().flat_map(|m| &m.linked).map(|c| c.source.clone())); }
        let mut fresh = match_core(&targets, &shelf, &images, &taken);
        // จับคู่ทุกเรื่องรอบใหม่ รูปที่ได้เป็นรูปต้นทางเดิมของปกช่องเดียวกัน ยกค่าครอปกับภาพหลังครอปเดิมมาด้วย (AUDIT 12 พ.ย. 2569 ข้อ 11)
        if scope == "all" { carry_crops(&mut fresh, &movies); }
        let mut sum = (0, 0, 0);
        for r in &fresh {
            match r.status.as_str() { "sure" => sum.0 += 1, "unsure" => sum.1 += 1, _ => sum.2 += 1 }
        }
        {
            let mut x = store.data.lock().unwrap();
            let mut rows = keep;
            rows.extend(fresh);
            x.rows = rows;
        }
        store.save()?;
        start_thumbs(&app);
        Ok(AutoSummary {
            images: images.len(), sure: sum.0, unsure: sum.1, none: sum.2,
            tall: images.iter().filter(|i| i.width <= i.height).count(), wide: images.iter().filter(|i| i.width > i.height).count(),
            reply: reply(&store, &movies),
        })
    }).await.map_err(|e| e.to_string())?
}

/// รูปจากที่อยู่ไฟล์ · ไม่ใช่รูปหรือหาไม่เจอคืนเหตุผล
pub(crate) fn pick_of(d: &Dirs, path: &str) -> Result<Pick, String> {
    let p = Path::new(path);
    if !pi::ACCEPTED.contains(&pi::ext_of(p).as_str()) {
        return Err(format!("{} ไม่ใช่รูปจึงไม่รับ  รับรูป JPG PNG WebP BMP TIFF และ HEIC", p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default()));
    }
    if !p.is_file() {
        return Err(format!("หารูป {path} ไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว"));
    }
    let cache = cached_thumbs(&d.thumbs);
    let hit = cache.get(&thumb_key(p));
    let (mut width, mut height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(p));
    let mut thumb = hit.map(|h| h.0.to_string_lossy().to_string());
    if width == 0 || thumb.is_none() {
        let (t, w, h) = make_src_thumb(&d.tools, &d.work, &d.thumbs, p)?;
        width = w; height = h; thumb = Some(t.to_string_lossy().to_string());
    }
    Ok(Pick { path: path.to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), folder: p.parent().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(), width, height, thumb, geo: None, crop_thumb: None })
}

pub(crate) fn blank_row(m: &Movie) -> Row {
    let t = movie_title(Path::new(&m.path));
    Row { id: m.id.clone(), movie: m.path.clone(), title: if t.pretty.is_empty() { m.name.clone() } else { t.pretty }, has_cover: m.has_cover, status: "none".into(), reason: "หาคู่ไม่เจอ".into(), via: "auto".into(), ..Default::default() }
}

/// จับคู่เองจากกระดาน Explorer หรือปุ่มบนชั้นวาง · หลายรูปแยกปกตั้งปกนอนตามแนวของรูป · แทนรูปเดิมของแถว · ไปรอยืนยันที่ตาราง
pub fn pair_row(row: &mut Row, picks: Vec<Pick>, via: &str) {
    let mut before = row.clone();
    before.prev = None;
    row.tall = None;
    row.wide = None;
    row.derived_tall = false;
    // รูปแนวตั้งก่อน รูปแนวนอนจะได้ไม่ไปครอปทับปกตั้งจริง · แนวเดียวกันหลายรูปใช้รูปแรก
    let (t, w): (Vec<Pick>, Vec<Pick>) = picks.into_iter().partition(|p| p.width <= p.height);
    if let Some(p) = t.into_iter().next() { assign(row, p); }
    if let Some(p) = w.into_iter().next() { assign(row, p); }
    row.status = "manual".into();
    row.via = via.to_string();
    row.reason = match via { "explorer" => "ลากจาก Explorer".to_string(), "shelf" => "เลือกจากชั้นวาง".to_string(), _ => "จับคู่เองบนกระดาน".to_string() };
    row.candidates.clear();
    row.score = 0;
    row.ticked = true;
    row.touched = true;
    row.error = None;
    row.conflict = None;
    row.store_override = None;
    row.prev = Some(Box::new(before));
}

#[tauri::command]
pub async fn link_pair(app: AppHandle, id: String, paths: Vec<String>, via: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let m = movies.iter().find(|m| m.id == id).ok_or("หาหนังในคลังไม่เจอ")?;
        if paths.is_empty() { return Err("ยังไม่ได้เลือกรูป".to_string()); }
        let picks = paths.iter().map(|p| pick_of(&d, p)).collect::<Result<Vec<_>, _>>()?;
        {
            let mut x = store.data.lock().unwrap();
            if !x.rows.iter().any(|r| r.id == id) { x.rows.push(blank_row(m)); }
            let r = x.rows.iter_mut().find(|r| r.id == id).unwrap();
            pair_row(r, picks, &via);
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// ย้อนการจับคู่เองล่าสุดของแถว
#[tauri::command]
pub fn link_undo(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<LinkReply, String> {
    store.idle()?;
    {
        let mut x = store.data.lock().unwrap();
        let i = x.rows.iter().position(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
        let Some(prev) = x.rows[i].prev.take() else { return Err("แถวนี้ไม่มีอะไรให้ย้อน".to_string()) };
        x.rows[i] = *prev;
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct RowPatch {
    pub ticked: Option<bool>,
    /// กดเลือกรูปใกล้เคียง
    pub choose: Option<String>,
    /// tall · wide พร้อมค่าครอป
    pub orient: Option<String>,
    pub geo: Option<Geometry>,
    /// ข้ามเรื่องนี้ แถวออกจากตาราง จับคู่อัตโนมัติรอบหน้ากลับมาใหม่
    pub skip: Option<bool>,
}

/// ใส่ค่าครอปจากหน้าครอปลงแถว ยังไม่เขียนรูปจริง · ทำภาพเล็กหลังครอปให้ตารางโชว์
/// ช่องนี้ยังไม่มีรูป ใช้รูปของอีกช่อง (รูปเดียวทำได้ทั้งปกตั้งและปกนอน มอคอัปหน้า 4)
#[tauri::command]
pub async fn link_set_crop(app: AppHandle, id: String, orient: String, geo: Geometry) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        // ถือตัวกันงานตลอดคำสั่ง การถอดรูปใช้เวลา ยืนยันแซงเข้ามาระหว่างนี้ไม่ได้
        // เดิมเช็กแค่ตอนเริ่ม ยืนยันแซงแล้วเขียนปกด้วยค่าครอปเก่า แล้วคำสั่งนี้เขียนค่าครอปใหม่ทับแถวที่บันทึกแล้ว (AUDIT 12 พ.ย. 2569 ข้อ 9)
        let _busy = begin_busy(&store)?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let wide = orient == "wide";
        let base = {
            let x = store.data.lock().unwrap();
            let r = x.rows.iter().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            let (own, other) = if wide { (&r.wide, &r.tall) } else { (&r.tall, &r.wide) };
            own.clone().or_else(|| other.clone()).ok_or("แถวนี้ยังไม่มีรูป")?
        };
        let dec = pi::decode(&d.tools, &d.work, Path::new(&base.path))?;
        let (img, _) = pi::render(&dec.img, &geo, true);
        let (w, h) = img.dimensions();
        let nh = 240u32;
        let small = imageops::resize(&img, ((w as f64 * nh as f64 / h.max(1) as f64).round() as u32).max(1), nh, imageops::FilterType::Triangle);
        let bytes = pi::encode(&small, "jpg", 85)?;
        fs::create_dir_all(&d.thumbs).map_err(|e| e.to_string())?;
        let out = d.thumbs.join(format!("crop-{}-{}x{}.jpg", &sha_of(&bytes)[..16], w, h));
        fs::write(&out, &bytes).map_err(|e| e.to_string())?;
        {
            let mut x = store.data.lock().unwrap();
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            let pick = Pick { geo: Some(geo), crop_thumb: Some(out.to_string_lossy().to_string()), ..base };
            if wide { r.wide = Some(pick); } else { r.tall = Some(pick); r.derived_tall = false; }
            r.error = None;
            r.conflict = None;
            r.touched = true;
            r.ticked = true;
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// แก้แถว · ติ๊ก เลือกรูปใกล้เคียง ค่าครอป ข้าม
#[tauri::command]
pub fn link_row_update(store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String, patch: RowPatch) -> Result<LinkReply, String> {
    store.idle()?;
    {
        let mut x = store.data.lock().unwrap();
        if patch.skip == Some(true) {
            x.rows.retain(|r| r.id != id);
        } else {
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            r.touched = true;
            if let Some(t) = patch.ticked { r.ticked = t && r.has_image(); }
            if let Some(path) = &patch.choose {
                // เปลี่ยนรูปแล้ว เหตุผลเดิมกับที่เก็บแบบเฉพาะแถวไม่เกี่ยวแล้ว · ติ๊กอย่างเดียวต้องไม่ล้างเหตุผล
                r.error = None;
                r.conflict = None;
                r.store_override = None;
                let pick = r.candidates.iter().find(|c| &c.path == path).cloned().ok_or("ไม่เจอรูปนี้ในรูปใกล้เคียง")?;
                r.tall = None; r.wide = None; r.derived_tall = false;
                assign(r, pick);
                r.ticked = true;
            }
            if let (Some(o), Some(g)) = (&patch.orient, patch.geo) {
                let slot = if o == "wide" { &mut r.wide } else { &mut r.tall };
                let p = slot.as_mut().ok_or("ช่องนี้ยังไม่มีรูป")?;
                p.geo = Some(g);
                if o != "wide" { r.derived_tall = false; }
            }
        }
    }
    store.save()?;
    Ok(reply(&store, &movies_of(&lib)))
}

