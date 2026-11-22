//! จับคู่รูปปก คำสั่งที่หน้าจอเรียกหลังยืนยัน ยืนยัน ยกเลิก เลือกที่เก็บ เลิกแก้ เอาออก เปิดแถว เลือกปก ย้ายที่เก็บ
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------- คำสั่ง ----------

fn write_env_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let local = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((crate::app::tools::tools_dir(app)?, local.join("tmp"), local.join("thumbs"), local.join("covers")))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LinkProgress {
    done: usize,
    total: usize,
    title: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmResult {
    pub done: usize,
    pub failed: usize,
    pub stopped: bool,
    pub notes: Vec<String>,
    pub reply: LinkReply,
}

/// แถวที่จะยืนยัน · ticked ที่ติ๊กไว้ · all ทุกแถวที่มีรูป (แถวไม่แน่ใจที่ยังไม่เลือกรูป กับแถวหาคู่ไม่เจอ ไม่มีรูป จึงไม่นับ · พี่กันเคาะ *"เอาตามนี้"*) · ไม่งั้นเป็นเลขแถว
pub fn select_rows(rows: &[Row], which: &str) -> Vec<String> {
    rows.iter().filter(|r| r.status != "saved" && r.has_image() && match which {
        "ticked" => r.ticked && is_waiting(r),
        "all" => is_waiting(r),
        id => r.id == id,
    }).map(|r| r.id.clone()).collect()
}

/// ยืนยัน · ทีละคู่ คู่ที่ล้มค้างในตารางพร้อมเหตุผล คู่ที่ผ่านไม่หาย หยุดกลางทางได้
#[tauri::command]
pub async fn link_confirm(app: AppHandle, which: String) -> Result<ConfirmResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let _busy = begin_busy(&store)?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let (tools, work, thumbs, covers) = write_env_dirs(&app)?;
        let (mode, shrink, format, quality, also_app) = {
            let s = app.state::<crate::app::store::SettingsStore>();
            let s = s.current.lock().unwrap();
            (s.link_store.clone(), s.shrink_large_posters, s.poster_format.clone(), s.jpg_quality, s.also_app())
        };
        let env = WriteEnv { tools: &tools, work: &work, thumbs: &thumbs, covers: &covers, shrink, format: &format, quality, also_app };
        store.stop.store(false, Ordering::SeqCst);
        let ids = select_rows(&store.data.lock().unwrap().rows, &which);
        let total = ids.len();
        let (mut done, mut failed, mut notes, mut stopped) = (0, 0, vec![], false);
        for (i, id) in ids.iter().enumerate() {
            if store.stop.load(Ordering::SeqCst) || jobs.cancelled() { stopped = true; break; }
            let Some(row) = store.data.lock().unwrap().rows.iter().find(|r| &r.id == id).cloned() else { continue };
            let _ = app.emit("link-progress", LinkProgress { done: i, total, title: row.title.clone() });
            let Some(m) = lib.movies.lock().unwrap().iter().find(|m| &m.id == id).cloned() else { continue };
            let how = row.store_override.clone().unwrap_or_else(|| mode.clone());
            let result = apply_row(&env, &m, &row, &how);
            let mut d = store.data.lock().unwrap();
            let Some(r) = d.rows.iter_mut().find(|r| &r.id == id) else { continue };
            match result {
                Ok(covers) => {
                    r.status = "saved".into();
                    r.ticked = false;
                    r.error = None;
                    r.conflict = None;
                    r.store_override = None;
                    r.prev = None;
                    drop(d);
                    let mut gone = vec![];
                    let up = lib.update_movie(id, |x| gone = merge_covers(x, covers));
                    if let Some(up) = up { let _ = app.emit("movie-updated", &up); }
                    // จดคลังก่อนเอาของเก่าออก ไฟดับตรงกลางคลังจะไม่ชี้ไฟล์ที่ลงถังขยะไปแล้ว
                    lib.save()?;
                    for g in &gone {
                        if let Some(n) = remove_cover(g) { notes.push(n); }
                    }
                    done += 1;
                }
                Err(e) => {
                    r.error = Some(e.msg);
                    r.conflict = e.conflict;
                    r.ticked = true;
                    drop(d);
                    failed += 1;
                }
            }
            // จดทุกคู่ โปรแกรมดับกลางทางคู่ที่ทำแล้วไม่กลับไปรออีก
            store.save()?;
        }
        let _ = app.emit("link-progress", LinkProgress { done: total, total, title: String::new() });
        let movies = movies_of(&lib);
        crate::app::actlog::note("ยืนยันปกจับคู่ เสร็จ", &format!("สำเร็จ {done} เรื่อง ไม่สำเร็จ {failed} เรื่อง{}  {}", if stopped { " หยุดกลางทาง" } else { "" }, notes.join("  ")));
        Ok(ConfirmResult { done, failed, stopped, notes, reply: reply(&store, &movies) })
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn link_cancel(store: State<'_, Arc<LinkStore>>) {
    store.stop.store(true, Ordering::SeqCst);
}

/// ชื่อไฟล์ชน · use ใช้ไฟล์ที่มีอยู่นั้นเป็นปก · app เก็บในโปรแกรมแทนเฉพาะแถวนี้
#[tauri::command]
pub async fn link_resolve(app: AppHandle, id: String, how: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let movies = movies_of(&app.state::<Arc<LibraryStore>>());
        let conflict = store.data.lock().unwrap().rows.iter().find(|r| r.id == id).and_then(|r| r.conflict.clone()).ok_or("แถวนี้ไม่มีชื่อชน")?;
        let existing = if how == "use" { Some(pick_of(&d, &conflict)?) } else { None };
        {
            let mut x = store.data.lock().unwrap();
            let r = x.rows.iter_mut().find(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
            if let Some(p) = existing {
                let wide = conflict.to_lowercase().contains("-landscape.");
                if wide { r.wide = Some(p); } else { r.tall = Some(p); r.derived_tall = false; }
            } else {
                r.store_override = Some("app".into());
            }
            r.conflict = None;
            r.error = None;
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// เอาปกออกตามช่องที่ระบุ · จดคลังก่อน แล้วค่อยเอาไฟล์ออก · ไม่ระบุคือทุกช่อง
fn drop_covers(lib: &LibraryStore, id: &str, only: Option<&[&str]>) -> Result<Vec<String>, String> {
    let mut gone = vec![];
    lib.update_movie(id, |m| {
        let (out, keep): (Vec<_>, Vec<_>) = std::mem::take(&mut m.linked).into_iter().partition(|c| only.is_none_or(|o| o.contains(&c.orient.as_str())));
        gone = out;
        m.linked = keep;
        if m.linked.is_empty() { m.cover_pick.clear(); }
    });
    lib.save()?;
    Ok(gone.iter().filter_map(remove_cover).collect())
}

/// ภาพหลังครอปในแถวที่ชี้ภาพเล็กที่เพิ่งลบ · ไม่ล้างจะเป็นภาพแตก
fn clear_dead_crops(r: &mut Row) {
    for p in [&mut r.tall, &mut r.wide].into_iter().flatten() {
        if p.crop_thumb.as_deref().is_some_and(|t| !Path::new(t).exists()) { p.crop_thumb = None; }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResult {
    pub notes: Vec<String>,
    pub reply: LinkReply,
}

/// ปุ่มยกเลิกในแถวที่ยืนยันแล้ว · เอาปกออก แถวกลับไปรอยืนยันพร้อมรูปเดิม
#[tauri::command]
pub fn link_unsave(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<RemoveResult, String> {
    store.idle()?;
    // เอาออกเฉพาะช่องที่แถวนี้เขียน · ปกช่องที่ไม่ได้แตะต้องอยู่ (ผู้ช่วยตรวจขั้น 8)
    let slots: Vec<&str> = {
        let x = store.data.lock().unwrap();
        x.rows.iter().find(|r| r.id == id).map(|r| { let mut v = vec![]; if r.tall.is_some() { v.push("tall"); } if r.wide.is_some() { v.push("wide"); } v }).unwrap_or_default()
    };
    let notes = drop_covers(&lib, &id, Some(&slots))?;
    {
        let mut x = store.data.lock().unwrap();
        if let Some(r) = x.rows.iter_mut().find(|r| r.id == id) {
            r.status = if r.via != "auto" { "manual".into() } else if r.candidates.is_empty() { "sure".into() } else { "unsure".into() };
            r.ticked = true;
            // นับว่าแตะแล้ว แถวที่เปิดจากชั้นวางจะเข้ายืนยันทั้งหมด ขึ้นเลขในเมนู และหน้าต่างกันปิดถาม (AUDIT 12 พ.ย. 2569 ข้อ 13)
            r.touched = true;
            clear_dead_crops(r);
        }
    }
    store.save()?;
    lib.save()?;
    if let Some(m) = lib.movies.lock().unwrap().iter().find(|m| m.id == id) { let _ = app.emit("movie-updated", m); }
    Ok(RemoveResult { notes, reply: reply(&store, &movies_of(&lib)) })
}

/// ปุ่มเอาปกออกบนชั้นวาง
#[tauri::command]
pub fn link_remove(app: AppHandle, store: State<'_, Arc<LinkStore>>, lib: State<'_, Arc<LibraryStore>>, id: String) -> Result<RemoveResult, String> {
    store.idle()?;
    let notes = drop_covers(&lib, &id, None)?;
    {
        let mut x = store.data.lock().unwrap();
        x.rows.retain(|r| !(r.id == id && r.status == "saved"));
        if let Some(r) = x.rows.iter_mut().find(|r| r.id == id) { clear_dead_crops(r); }
    }
    store.save()?;
    lib.save()?;
    if let Some(m) = lib.movies.lock().unwrap().iter().find(|m| m.id == id) { let _ = app.emit("movie-updated", m); }
    Ok(RemoveResult { notes, reply: reply(&store, &movies_of(&lib)) })
}

/// ปุ่มบนชั้นวาง (ครอปใหม่ เปลี่ยนรูป จับคู่รูปปก) · เปิดแถวของเรื่องนั้นในตาราง · มีปกจับคู่อยู่แล้วเอารูปเดิมกับค่าครอปเดิมมาตั้ง ยืนยันอีกครั้งถึงเปลี่ยน
#[tauri::command]
pub async fn link_open_row(app: AppHandle, id: String) -> Result<LinkReply, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let d = dirs(&app)?;
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        store.idle()?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let movies = movies_of(&lib);
        let m = movies.iter().find(|m| m.id == id).ok_or("หาหนังในคลังไม่เจอ")?;
        {
            let mut x = store.data.lock().unwrap();
            x.rows.retain(|r| !(r.id == id && r.status == "saved"));
            if !x.rows.iter().any(|r| r.id == id) {
                let mut r = blank_row(m);
                r.via = "shelf".into();
                for c in &m.linked {
                    if let Ok(mut p) = pick_of(&d, &c.source) {
                        if c.cropped {
                            p.geo = c.geo.clone();
                            p.crop_thumb = Some(c.thumb.clone());
                        }
                        if c.orient == "wide" { r.wide = Some(p); } else { r.tall = Some(p); }
                    }
                }
                if r.has_image() {
                    r.status = "manual".into();
                    r.reason = "เลือกจากชั้นวาง".into();
                    r.ticked = false;
                } else if !m.linked.is_empty() {
                    r.reason = "หารูปต้นทางไม่เจอ เลือกรูปใหม่".into();
                }
                x.rows.insert(0, r);
            }
        }
        store.save()?;
        Ok(reply(&store, &movies))
    }).await.map_err(|e| e.to_string())?
}

/// เรื่องที่มีสองปก เลือกปกที่แสดง · file ปกในไฟล์ · linked ปกจับคู่
#[tauri::command]
pub fn link_cover_pick(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, id: String, pick: String) -> Result<Movie, String> {
    let m = lib.update_movie(&id, |m| m.cover_pick = if pick == "file" { "file".into() } else { String::new() }).ok_or("หาหนังในคลังไม่เจอ")?;
    lib.save()?;
    let _ = app.emit("movie-updated", &m);
    Ok(m)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MigrateResult {
    pub done: usize,
    pub failed: usize,
    pub notes: Vec<String>,
}

/// ย้ายปกที่จับคู่ไว้แล้วไปเก็บแบบใหม่ทีเดียว · ช่องหนึ่งของเรื่องล้ม ไม่ย้ายเฉพาะช่องนั้น · รูปต้นทางหายแล้วใช้สำเนาเดิมเป็นต้นทาง · เก็บใหม่สำเร็จค่อยเอาของเก่าออก
#[tauri::command]
pub async fn link_migrate(app: AppHandle, to: String) -> Result<MigrateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let jobs = app.state::<Arc<crate::app::jobs::Jobs>>().inner().clone();
        let _guard = jobs.start();
        let store = app.state::<Arc<LinkStore>>().inner().clone();
        let _busy = begin_busy(&store)?;
        let lib = app.state::<Arc<LibraryStore>>().inner().clone();
        let (tools, work, thumbs, covers) = write_env_dirs(&app)?;
        let (shrink, format, quality, also_app) = {
            let s = app.state::<crate::app::store::SettingsStore>();
            let s = s.current.lock().unwrap();
            (s.shrink_large_posters, s.poster_format.clone(), s.jpg_quality, s.also_app())
        };
        let env = WriteEnv { tools: &tools, work: &work, thumbs: &thumbs, covers: &covers, shrink, format: &format, quality, also_app };
        let movies = movies_of(&lib);
        // ติ๊กเพิ่มหรือเอาสำเนาในโปรแกรมออก ปกที่เก็บแบบหลักถูกอยู่แล้วก็ต้องตามด้วย
        let want_copy = also_app && to == "beside";
        let todo: Vec<&Movie> = movies.iter().filter(|m| m.linked.iter().any(|c| c.store != to || c.app_copy.is_some() != want_copy)).collect();
        let total = todo.len();
        let (mut done, mut failed, mut notes) = (0, 0, vec![]);
        for (i, m) in todo.into_iter().enumerate() {
            if jobs.cancelled() { notes.push("โปรแกรมกำลังปิด ย้ายไม่ครบ เรื่องที่เหลือคงแบบเดิม".to_string()); break; }
            let _ = app.emit("link-progress", LinkProgress { done: i, total, title: m.name.clone() });
            let mut edit = |f: &mut dyn FnMut(&mut Movie)| -> Result<Option<Movie>, String> {
                let up = lib.update_movie(&m.id, |x| f(x));
                if let Some(up) = &up { let _ = app.emit("movie-updated", up); }
                lib.save()?;
                Ok(up)
            };
            let (bad, changed) = migrate_movie(&env, m, &to, want_copy, &mut notes, &mut edit)?;
            if bad { failed += 1; } else if changed { done += 1; }
        }
        let _ = app.emit("link-progress", LinkProgress { done: total, total, title: String::new() });
        let to_name = match to.as_str() { "beside" => "ข้างไฟล์หนัง", "app" => "ในโปรแกรม", "link" => "จับคู่อย่างเดียว", x => x };
        crate::app::actlog::note("ย้ายที่เก็บรูปจับคู่ เสร็จ", &format!("ไปแบบ{to_name} {} ย้ายแล้ว {done} เรื่อง ไม่สำเร็จ {failed} เรื่อง  {}", if want_copy { "มีสำเนาในโปรแกรม" } else { "ไม่มีสำเนาที่สอง" }, notes.join("  ")));
        Ok(MigrateResult { done, failed, notes })
    }).await.map_err(|e| e.to_string())?
}

/// ย้ายปกจับคู่ของหนังหนึ่งเรื่องไปแบบที่เก็บใหม่ · แยกจาก link_migrate ให้เทสเรียกได้ตรง ๆ
/// `edit` แก้หนังในคลังแล้วบันทึก คืนหนังหลังแก้ · ตัวจริงแก้ LibraryStore ตัวเทสแก้หนังในหน่วยความจำ
/// คืนว่ามีช่องที่ย้ายไม่ได้ไหม กับว่ามีอะไรเปลี่ยนไหม
pub(crate) fn migrate_movie(env: &WriteEnv, m: &Movie, to: &str, want_copy: bool, notes: &mut Vec<String>, edit: &mut dyn FnMut(&mut dyn FnMut(&mut Movie)) -> Result<Option<Movie>, String>) -> Result<(bool, bool), String> {
    let mut fresh = vec![];
    let mut bad = false;
    for c in m.linked.iter().filter(|c| c.store != to) {
        let (path, geo) = if Path::new(&c.source).is_file() {
            // ส่งค่าครอปเฉพาะที่ผู้ใช้ครอปเอง · ค่ากลางรูปที่โปรแกรมตั้งให้ส่งไปด้วย รูปข้างหนังชื่อถูกอยู่แล้วจะกลายเป็นต้องทำไฟล์ใหม่ แล้วชนตัวเอง
            (c.source.clone(), if c.cropped { c.geo.clone() } else { None })
        } else if let Some(f) = c.file.clone().filter(|f| Path::new(f).is_file()) {
            // รูปต้นฉบับหาย เหลือสำเนานี้รูปเดียว · จับคู่อย่างเดียวไม่มีไฟล์ใหม่ ย้ายแล้วสำเนาจะหาย ห้ามย้าย
            if to == "link" {
                notes.push(format!("{} รูปต้นฉบับหาย ย้ายเป็นจับคู่อย่างเดียวไม่ได้ คงแบบเดิม", m.name));
                bad = true;
                continue;
            }
            // แบบอื่นคัดลอกไบต์เดิมตรง ๆ ไม่ทำรูปใหม่ ขนาดกับคุณภาพเท่าเดิม
            let bytes = match fs::read(&f) { Ok(b) => b, Err(e) => { notes.push(format!("{} อ่านสำเนาไม่ได้: {e}", m.name)); bad = true; continue; } };
            let sha = sha_of(&bytes);
            let ext = Path::new(&f).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
            // สำเนาในโปรแกรมทำแบบเดียวกับทางทำรูปใหม่ (write_cover) · ห้ามพาสำเนาของปกเก่ามาด้วย
            // เดิมลอกทุกช่องจากปกเก่า สำเนาเก่าซึ่งชื่อเดียวกับไฟล์หลักใหม่ติดมา แล้วขั้นเอาสำเนาออกส่งไฟล์หลักลงถังขยะ (AUDIT 12 พ.ย. 2569 ข้อ 1)
            let placed = app_copy_of(env, &m.id, Path::new(&m.path), &c.orient, &ext, &bytes, &sha, to)
                .and_then(|app_copy| place_bytes(env, &m.id, Path::new(&m.path), &c.orient, &ext, &bytes, &sha, to, Some(c)).map(|x| (x, app_copy)));
            match placed {
                Ok(((file, owned), app_copy)) => fresh.push(LinkedCover { store: to.to_string(), file: file.map(|x| x.to_string_lossy().to_string()), owned, sha256: Some(sha), app_copy, ..c.clone() }),
                Err(e) => { notes.push(format!("{} {}", m.name, e.msg)); bad = true; }
            }
            continue;
        } else {
            notes.push(format!("{} หารูปต้นทางไม่เจอ ย้ายไม่ได้", m.name));
            bad = true;
            continue;
        };
        let (width, height) = header_size(Path::new(&path));
        let pick = Pick { name: Path::new(&path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), path, width, height, geo, ..Default::default() };
        match write_cover(env, &m.id, Path::new(&m.path), &c.orient, &pick, to, Some(c)) {
            Ok(mut n) => { n.cropped = c.cropped; fresh.push(n); }
            Err(e) => { notes.push(format!("{} {}", m.name, e.msg)); bad = true; }
        }
    }
    let had_fresh = !fresh.is_empty();
    let mut now = m.linked.clone();
    if had_fresh {
        // จดคลังก่อน แล้วค่อยเอาไฟล์ของปกเก่าออก
        let mut gone = vec![];
        let mut fresh = Some(fresh);
        let up = edit(&mut |x: &mut Movie| gone = merge_covers(x, fresh.take().unwrap_or_default()))?;
        for g in &gone { if let Some(n) = remove_cover(g) { notes.push(n); } }
        now = up.map(|x| x.linked).unwrap_or_default();
    }
    // สำเนาในโปรแกรมของปกที่อยู่แบบหลักแล้ว เพิ่มหรือเอาออกให้ตรงกับที่ติ๊ก
    let mut copies: Vec<(String, Option<String>)> = vec![];
    for c in now.iter().filter(|c| c.store == to && c.app_copy.is_some() != want_copy) {
        if !want_copy {
            // สำเนาที่ยังเป็นไฟล์หลักหรือรูปต้นทางของปกไหนอยู่ หรือเป็นสำเนาของปกอีกช่อง เลิกจดว่าเป็นสำเนา แต่ไม่ลบไฟล์
            let f = c.app_copy.as_deref().unwrap_or_default();
            let keep = now.iter().any(|o| if o.orient == c.orient { holds(o, f) } else { uses(o, f) });
            if !keep {
                if let Some(n) = trash_own(Path::new(f), &c.sha256) { notes.push(n); }
            }
            copies.push((c.orient.clone(), None));
            continue;
        }
        let from = c.file.clone().unwrap_or_else(|| c.source.clone());
        let made = fs::read(&from).map_err(|e| format!("อ่านรูปไม่ได้: {e}")).and_then(|bytes| {
            let ext = Path::new(&from).extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
            place_bytes(env, &m.id, Path::new(&m.path), &c.orient, &ext, &bytes, &sha_of(&bytes), "app", None).map_err(|e| e.msg)
        });
        match made {
            Ok((file, _)) => copies.push((c.orient.clone(), file.map(|x| x.to_string_lossy().to_string()))),
            Err(e) => { notes.push(format!("{} {e}", m.name)); bad = true; }
        }
    }
    let had_copies = !copies.is_empty();
    if had_copies {
        edit(&mut |x: &mut Movie| for (orient, file) in &copies {
            if let Some(c) = x.linked.iter_mut().find(|c| &c.orient == orient) { c.app_copy = file.clone(); }
        })?;
    }
    Ok((bad, had_fresh || had_copies))
}
