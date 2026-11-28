//! จับคู่รูปปก ยืนยันแล้วเก็บรูปจริง เขียนปกตามที่เก็บที่เลือก ไม่เขียนทับไฟล์คนอื่น
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;
use crate::app::inflight;

// ---------------------------------------------------------------- ยืนยันแล้วเก็บรูปจริง (ขั้น 2)

/// ค่าที่ตัวเขียนรูปต้องใช้ · แยกจาก AppHandle ให้เทสได้
pub struct WriteEnv<'a> {
    pub tools: &'a Path,
    pub work: &'a Path,
    /// โฟลเดอร์ภาพเล็กของโปรแกรม
    pub thumbs: &'a Path,
    /// โฟลเดอร์เก็บสำเนาในโปรแกรม
    pub covers: &'a Path,
    pub shrink: bool,
    /// jpg · png
    pub format: &'a str,
    pub quality: u8,
    /// ติ๊กทั้งข้างไฟล์หนังกับในโปรแกรม ได้สำเนาในโปรแกรมอีกที่
    pub also_app: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CoverProblem {
    pub msg: String,
    /// ไฟล์ปลายทางที่ชน · ไม่ใช่เรื่องชื่อชน = None
    pub conflict: Option<String>,
}

fn fail(msg: impl Into<String>) -> CoverProblem {
    CoverProblem { msg: msg.into(), conflict: None }
}

/// ครอปกลางรูป ค่าตั้งต้นตอนยังไม่ได้เปิดหน้าครอป · ปกตั้ง 2 : 3 · ปกนอน 16 : 9
pub fn default_geo(orient: &str, w: u32, h: u32) -> Geometry {
    let wide = orient == "wide";
    let (x, y, cw, ch) = if wide { pi::default_crop_wide(w, h) } else { pi::default_crop(w, h) };
    Geometry { rotate: 0, flip: false, mode: "crop".into(), x, y, w: cw, h: ch, pad: "#f6dbe5".into(), tilt: 0.0, aspect: if wide { "wide".into() } else { String::new() } }
}

/// ชื่อไฟล์ข้างหนัง ชื่อหนัง-poster.jpg ชื่อหนัง-landscape.jpg (พี่กันเคาะ 8 พ.ย. 2569 *"เอาอังกิด ตามที่แนะนำ"*)
pub fn beside_target(movie: &Path, orient: &str, format: &str) -> PathBuf {
    let stem = movie.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let tail = if orient == "wide" { "landscape" } else { "poster" };
    movie.with_file_name(format!("{stem}-{tail}.{format}"))
}

pub(crate) fn same_file(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

/// ปกนี้ใช้ไฟล์นี้เป็นไฟล์ที่เก็บหรือรูปต้นทางไหม
pub(crate) fn holds(c: &LinkedCover, f: &str) -> bool {
    let p = Path::new(f);
    same_file(Path::new(&c.source), p) || c.file.as_deref().is_some_and(|x| same_file(Path::new(x), p))
}

/// ปกนี้ใช้ไฟล์นี้อยู่ไหม ช่องไหนก็ได้ ทั้งไฟล์ที่เก็บ รูปต้นทาง และสำเนาในโปรแกรม
/// ไฟล์ในโปรแกรมตั้งชื่อตามค่า hash รูปเดียวกันจึงเป็นไฟล์เดียวกันข้ามช่องได้ เช่นสำเนาของปกเก่าคือไฟล์หลักของปกใหม่ (AUDIT 12 พ.ย. 2569 ข้อ 1)
pub(crate) fn uses(c: &LinkedCover, f: &str) -> bool {
    holds(c, f) || c.app_copy.as_deref().is_some_and(|x| same_file(Path::new(x), Path::new(f)))
}

pub(crate) fn sha_of(bytes: &[u8]) -> String {
    crate::media::probe::hex(&Sha256::digest(bytes))
}

pub(crate) fn file_sha(p: &Path) -> Option<String> {
    fs::read(p).ok().map(|b| sha_of(&b))
}

fn safe_id(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '_' }).take(80).collect()
}

/// ภาพเล็กของปกจับคู่ สูง 450 คงสัดส่วน แบบเดียวกับปกในไฟล์ · ชื่อมีค่า hash เปลี่ยนรูปแล้วหน้าจอไม่ได้ภาพเก่าค้าง
fn write_thumb(env: &WriteEnv, id: &str, orient: &str, img: &image::RgbImage, sha: &str) -> Result<(PathBuf, f32), String> {
    fs::create_dir_all(env.thumbs).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    let nw = ((w as f64 * 450.0 / h.max(1) as f64).round() as u32).max(1);
    let small = imageops::resize(img, nw, 450, imageops::FilterType::Triangle);
    let out = env.thumbs.join(format!("{}-l{orient}-{}-a.jpg", safe_id(id), &sha[..12]));
    fs::write(&out, pi::encode(&small, "jpg", 85)?).map_err(|e| e.to_string())?;
    Ok((out, w as f32 / h.max(1) as f32))
}

/// วางไบต์ลงไฟล์ใหม่แบบไม่มีจังหวะทับ · เขียนไฟล์ชั่วคราวข้าง ๆ แล้วย้ายแบบไม่แทนที่
fn write_new(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = target.with_extension(format!("{}.partial", pi::unique()));
    // จดไว้ ไฟดับกลางทาง ตอนเปิดครั้งหน้าลบหรือย้ายเข้าชื่อจริง (BUGS ข้อ 162.4)
    let t = inflight::track(&temp, Some(target), inflight::Kind::Temp);
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    t.ready();
    if let Err(p) = crate::cover::rename::move_no_replace(&temp, target) {
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    Ok(())
}

/// แทนไฟล์ของโปรแกรมเอง · ไฟล์ใหม่เขียนเสร็จก่อน ค่อยเอาของเก่าออก พังกลางทางของเก่ากลับที่เดิม
pub(crate) fn replace_own(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = target.with_extension(format!("{}.partial", pi::unique()));
    let t = inflight::track(&temp, Some(target), inflight::Kind::Temp);
    fs::write(&temp, bytes).map_err(|e| e.to_string())?;
    t.ready();
    let old = target.with_extension(format!("{}.old", pi::unique()));
    // ปกรุ่นก่อนที่ย้ายหลบ ไฟดับก่อนไฟล์ใหม่เข้าที่ ตอนเปิดครั้งหน้าย้ายกลับ (BUGS ข้อ 162.4)
    let _o = inflight::track(&old, Some(target), inflight::Kind::Old);
    if let Err(p) = crate::cover::rename::move_no_replace(target, &old) {
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    if let Err(p) = crate::cover::rename::move_no_replace(&temp, target) {
        let _ = crate::cover::rename::move_no_replace(&old, target);
        let _ = fs::remove_file(&temp);
        return Err(p.title);
    }
    // ไฟล์รุ่นก่อนลงถังขยะ กู้คืนได้ (AUDIT 12 พ.ย. 2569 ข้อ 11 · เดิมลบถาวร ไฟล์ครอปเดิมหายกู้ไม่ได้)
    if crate::app::outfile::to_trash(&old).is_err() { let _ = fs::remove_file(&old); }
    Ok(())
}

/// รูปต้นทางคือไฟล์ชื่อนั้นข้างหนังอยู่แล้ว (ชื่อหนัง-poster.jpg จากที่อื่น) แนวตรงช่อง และไม่ได้ครอป ใช้ไฟล์นั้นเลย ไม่คัดลอก ไม่นับเป็นของโปรแกรม
fn is_existing_art(movie: &Path, orient: &str, pick: &Pick, target: &Path, w: u32, h: u32) -> bool {
    let src = Path::new(&pick.path);
    pick.geo.is_none() && (w == 0 || (w > h) == (orient == "wide"))
        && same_file(src.parent().unwrap_or(Path::new("")), movie.parent().unwrap_or(Path::new("")))
        && same_file(Path::new(src.file_stem().unwrap_or_default()), Path::new(target.file_stem().unwrap_or_default()))
}

/// ไฟล์ปลายทางมีอยู่แล้วและไม่ใช่ของโปรแกรม · เช็กทุกช่องก่อนเขียนช่องแรก แถวจะได้ไม่ครึ่ง ๆ กลาง ๆ
fn conflict_of(env: &WriteEnv, movie: &Path, orient: &str, pick: &Pick, store: &str, old: Option<&LinkedCover>) -> Option<CoverProblem> {
    if store != "beside" && store != "" { return None; }
    let target = beside_target(movie, orient, env.format);
    if !target.exists() || is_existing_art(movie, orient, pick, &target, pick.width, pick.height) { return None; }
    let mine = old.is_some_and(|o| o.owned && o.file.as_deref().is_some_and(|f| same_file(Path::new(f), &target)) && o.sha256 == file_sha(&target));
    if mine { return None; }
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Some(CoverProblem { msg: format!("มีไฟล์ {name} อยู่แล้ว และไม่ใช่ไฟล์ที่โปรแกรมทำ จึงไม่เขียนทับ"), conflict: Some(target.to_string_lossy().to_string()) })
}

/// ไฟล์ของปกในโฟลเดอร์ของโปรแกรม ชื่อตามค่า hash ของไบต์รูป
fn app_file(env: &WriteEnv, id: &str, orient: &str, ext: &str, sha: &str) -> PathBuf {
    env.covers.join(format!("{}-{orient}-{}.{ext}", safe_id(id), &sha[..12]))
}

/// วางไบต์รูปตามแบบที่เก็บ คืนไฟล์ที่ได้กับว่าเป็นของโปรแกรมไหม · แบบในโปรแกรมมีไฟล์ชื่อนี้อยู่แล้วใช้ไฟล์นั้น
pub(crate) fn place_bytes(env: &WriteEnv, id: &str, movie: &Path, orient: &str, ext: &str, bytes: &[u8], sha: &str, store: &str, old: Option<&LinkedCover>) -> Result<(Option<PathBuf>, bool), CoverProblem> {
    match store {
        "link" => Ok((None, false)),
        "app" => {
            fs::create_dir_all(env.covers).map_err(|e| fail(e.to_string()))?;
            let f = app_file(env, id, orient, ext, sha);
            if !f.exists() {
                write_new(&f, bytes).map_err(|e| fail(format!("เก็บรูปในโปรแกรมไม่ได้: {e}")))?;
            }
            Ok((Some(f), true))
        }
        _ => {
            let target = beside_target(movie, orient, ext);
            if target.exists() {
                // เป็นไฟล์ที่โปรแกรมทำเองและยังไม่ถูกแก้ ถึงจะแทนได้
                let mine = old.is_some_and(|o| o.owned && o.file.as_deref().is_some_and(|f| same_file(Path::new(f), &target)) && o.sha256 == file_sha(&target));
                if !mine {
                    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    return Err(CoverProblem { msg: format!("มีไฟล์ {name} อยู่แล้ว และไม่ใช่ไฟล์ที่โปรแกรมทำ จึงไม่เขียนทับ"), conflict: Some(target.to_string_lossy().to_string()) });
                }
                replace_own(&target, bytes).map_err(|e| fail(format!("เขียนรูปข้างไฟล์หนังไม่ได้: {e}")))?;
            } else {
                write_new(&target, bytes).map_err(|e| fail(format!("เขียนรูปข้างไฟล์หนังไม่ได้: {e}")))?;
            }
            Ok((Some(target), true))
        }
    }
}

/// สำเนาในโปรแกรมอีกที่ เฉพาะตอนติ๊กทั้งสองแบบและแถวนี้เก็บข้างไฟล์หนัง
pub(crate) fn app_copy_of(env: &WriteEnv, id: &str, movie: &Path, orient: &str, ext: &str, bytes: &[u8], sha: &str, store: &str) -> Result<Option<String>, CoverProblem> {
    if !env.also_app || store != "beside" { return Ok(None); }
    let (f, _) = place_bytes(env, id, movie, orient, ext, bytes, sha, "app", None)?;
    Ok(f.map(|x| x.to_string_lossy().to_string()))
}

/// เก็บรูปหนึ่งช่องตามแบบที่ตั้ง · รูปต้นฉบับไม่ถูกแก้ · ไฟล์หนังไม่ถูกแตะ
/// `old` ปกเดิมของช่องนี้ ไว้ดูว่าไฟล์ปลายทางเป็นของโปรแกรมเองไหม
pub fn write_cover(env: &WriteEnv, id: &str, movie: &Path, orient: &str, pick: &Pick, store: &str, old: Option<&LinkedCover>) -> Result<LinkedCover, CoverProblem> {
    let src = Path::new(&pick.path);
    if !src.is_file() {
        return Err(fail(format!("หารูป {} ไม่เจอ ไฟล์อาจถูกย้ายไปแล้ว", pick.name)));
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    let dec = pi::decode(env.tools, env.work, src).map_err(fail)?;
    let (w, h) = dec.img.dimensions();
    let target = beside_target(movie, orient, env.format);
    if store == "beside" && is_existing_art(movie, orient, pick, &target, w, h) {
        let sha = file_sha(src).ok_or_else(|| fail(format!("อ่าน {} ไม่ได้", pick.name)))?;
        let (thumb, aspect) = write_thumb(env, id, orient, &dec.img, &sha).map_err(fail)?;
        let app_copy = if env.also_app {
            let bytes = fs::read(src).map_err(|e| fail(format!("อ่าน {} ไม่ได้: {e}", pick.name)))?;
            app_copy_of(env, id, movie, orient, &pi::ext_of(src), &bytes, &sha, store)?
        } else { None };
        return Ok(LinkedCover { app_copy, orient: orient.into(), source: pick.path.clone(), cropped: false, geo: None, store: "beside".into(), file: Some(pick.path.clone()), owned: false, sha256: Some(sha), thumb: thumb.to_string_lossy().to_string(), aspect, at: now });
    }
    let geo = pick.geo.clone().unwrap_or_else(|| default_geo(orient, w, h));
    let (img, _) = pi::render(&dec.img, &geo, env.shrink);
    let bytes = pi::encode(&img, env.format, env.quality).map_err(fail)?;
    let sha = sha_of(&bytes);
    // ทำสำเนาในโปรแกรมก่อน ชื่อไม่มีวันชน · ไฟล์ข้างหนังเขียนไม่ได้ เอาสำเนาออกเฉพาะที่เพิ่งทำในรอบนี้ ไม่ค้างครึ่ง ๆ กลาง ๆ
    // ไฟล์ชื่อนี้มีอยู่ก่อนแล้วคือไฟล์ที่ปกเดิมใช้อยู่ เช่นไฟล์หลักของปกแบบในโปรแกรม ห้ามลบ (AUDIT 12 พ.ย. 2569 ข้อ 1)
    let copy_was_there = env.also_app && store == "beside" && app_file(env, id, orient, env.format, &sha).exists();
    let app_copy = app_copy_of(env, id, movie, orient, env.format, &bytes, &sha, store)?;
    let (file, owned) = match place_bytes(env, id, movie, orient, env.format, &bytes, &sha, store, old) {
        Ok(x) => x,
        Err(e) => {
            if let Some(f) = app_copy.as_ref().filter(|_| !copy_was_there) { let _ = fs::remove_file(f); }
            return Err(e);
        }
    };
    let (thumb, aspect) = write_thumb(env, id, orient, &img, &sha).map_err(fail)?;
    Ok(LinkedCover { app_copy, orient: orient.into(), source: pick.path.clone(), cropped: pick.geo.is_some(), geo: Some(geo), store: store.into(), file: file.map(|f| f.to_string_lossy().to_string()), owned, sha256: Some(sha), thumb: thumb.to_string_lossy().to_string(), aspect, at: now })
}

/// เอาปกหนึ่งช่องออก · ลบได้เฉพาะไฟล์ที่โปรแกรมทำเองและยังไม่ถูกแก้ ลงถังขยะเท่านั้น ทุกแบบที่เก็บ (พี่กันตอบตอนทำแผน)
/// ไดรฟ์ที่ไม่มีถังขยะไม่ลบ · คืนข้อความเมื่อมีไฟล์ที่ไม่ลบ
pub fn remove_cover(c: &LinkedCover) -> Option<String> {
    let _ = fs::remove_file(&c.thumb);
    let also = c.app_copy.as_deref().and_then(|f| trash_own(Path::new(f), &c.sha256));
    let main = c.file.as_deref().filter(|_| c.owned).and_then(|f| trash_own(Path::new(f), &c.sha256));
    match (main, also) {
        (Some(a), Some(b)) => Some(format!("{a}  {b}")),
        (a, b) => a.or(b),
    }
}

/// ลบไฟล์ที่โปรแกรมทำเองลงถังขยะ ถ้ายังไม่ถูกแก้ · คืนข้อความเมื่อไม่ลบ
pub(crate) fn trash_own(f: &Path, sha: &Option<String>) -> Option<String> {
    if !f.exists() {
        return None;
    }
    if file_sha(f) != *sha {
        return Some(format!("{} ถูกแก้หลังโปรแกรมทำไว้ ไม่ลบให้", f.file_name().unwrap_or_default().to_string_lossy()));
    }
    if !crate::app::outfile::drive_is_fixed(f.parent().unwrap_or(Path::new(""))) {
        return Some(format!("{} อยู่บนไดรฟ์ที่ไม่มีถังขยะ ไม่ลบให้ ลบเองได้", f.file_name().unwrap_or_default().to_string_lossy()));
    }
    crate::app::outfile::to_trash(f).err().map(|e| format!("{} {e}", f.file_name().unwrap_or_default().to_string_lossy()))
}

/// เก็บทุกช่องของแถว · ช่องหลังล้ม เอาไฟล์ใหม่ของช่องก่อนออก แถวนั้นไม่ครึ่ง ๆ กลาง ๆ
pub fn apply_row(env: &WriteEnv, m: &Movie, row: &Row, store: &str) -> Result<Vec<LinkedCover>, CoverProblem> {
    let movie = Path::new(&m.path);
    let mut out: Vec<LinkedCover> = vec![];
    // ชื่อชนเช็กทุกช่องก่อน · เดิมช่องปกตั้งแทนไฟล์เดิมไปแล้ว ช่องปกนอนชนทีหลัง แถวครึ่ง ๆ กลาง ๆ (ผู้ช่วยตรวจขั้น 8)
    for (orient, pick) in [("tall", &row.tall), ("wide", &row.wide)] {
        if let Some(pick) = pick {
            if let Some(p) = conflict_of(env, movie, orient, pick, store, m.linked.iter().find(|c| c.orient == orient)) { return Err(p); }
        }
    }
    for (orient, pick) in [("tall", &row.tall), ("wide", &row.wide)] {
        let Some(pick) = pick else { continue };
        let old = m.linked.iter().find(|c| c.orient == orient);
        match write_cover(env, &m.id, movie, orient, pick, store, old) {
            Ok(c) => out.push(c),
            Err(e) => {
                for c in &out {
                    // ไฟล์ที่ปกเดิมใช้อยู่ช่องไหนก็ตามห้ามลบ · ไฟล์ในโปรแกรมชื่อตามค่า hash ไฟล์หลักใหม่อาจเป็นสำเนาเดิม (AUDIT 12 พ.ย. 2569 ข้อ 1)
                    let in_old = |p: &str| m.linked.iter().any(|o| uses(o, p));
                    if c.owned && !c.file.as_deref().is_some_and(in_old) {
                        if let Some(f) = &c.file { let _ = fs::remove_file(f); }
                    }
                    if let Some(f) = c.app_copy.as_deref().filter(|f| !in_old(f)) { let _ = fs::remove_file(f); }
                    if !m.linked.iter().any(|o| same_file(Path::new(&o.thumb), Path::new(&c.thumb))) { let _ = fs::remove_file(&c.thumb); }
                }
                return Err(e);
            }
        }
    }
    Ok(out)
}

/// ใส่ปกใหม่ลงหนัง คืนปกเก่าที่ถูกแทน ไว้ตามไปเอาไฟล์ออก
pub fn merge_covers(m: &mut Movie, covers: Vec<LinkedCover>) -> Vec<LinkedCover> {
    let mut gone = vec![];
    for c in covers {
        if let Some(i) = m.linked.iter().position(|o| o.orient == c.orient) {
            gone.push(std::mem::replace(&mut m.linked[i], c));
        } else {
            m.linked.push(c);
        }
    }
    let now = m.linked.clone();
    // ปกเก่าที่ไฟล์หรือภาพเล็กยังถูกปกที่เหลือใช้อยู่ ห้ามเอาออก · เทียบไขว้ทุกช่อง ไฟล์ที่เก็บ รูปต้นทาง สำเนาในโปรแกรม ไม่สนตัวพิมพ์ใหญ่เล็ก
    // เดิมเทียบสำเนากับสำเนาเท่านั้น ย้ายจากข้างหนังพร้อมสำเนาไปในโปรแกรมอย่างเดียว สำเนาเก่าซึ่งคือไฟล์หลักของปกใหม่ลงถังขยะ (AUDIT 12 พ.ย. 2569 ข้อ 1)
    gone.into_iter().map(|mut g| {
        if g.file.as_deref().is_some_and(|f| now.iter().any(|c| uses(c, f))) { g.file = None; }
        if g.app_copy.as_deref().is_some_and(|f| now.iter().any(|c| uses(c, f))) { g.app_copy = None; }
        if now.iter().any(|c| same_file(Path::new(&c.thumb), Path::new(&g.thumb))) { g.thumb.clear(); }
        g
    }).collect()
}

/// เปลี่ยนชื่อไฟล์หนังในชั้นหนัง สำเนาข้างไฟล์ที่โปรแกรมทำเปลี่ยนชื่อตาม · ไฟล์ที่โปรแกรมไม่ได้ทำไม่แตะ · ชนชื่อคงชื่อเดิม ปกยังใช้ได้
pub fn rename_beside(m: &mut Movie, new_movie: &Path) {
    for c in m.linked.iter_mut().filter(|c| c.owned && c.store == "beside") {
        let Some(old) = c.file.clone() else { continue };
        let old = PathBuf::from(old);
        let ext = old.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_else(|| "jpg".into());
        let new = beside_target(new_movie, &c.orient, &ext);
        // ไฟล์ที่ผู้ใช้แก้เองแล้วไม่ใช่ของโปรแกรมอีกต่อไป ไม่เปลี่ยนชื่อให้
        if !same_file(&old, &new) && file_sha(&old) == c.sha256 && crate::cover::rename::move_no_replace(&old, &new).is_ok() {
            c.file = Some(new.to_string_lossy().to_string());
        }
    }
}
