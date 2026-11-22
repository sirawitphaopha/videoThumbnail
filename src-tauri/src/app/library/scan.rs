//! ไล่หาไฟล์หนังในโฟลเดอร์ อ่านข้อมูลทีละเรื่อง คืนปกที่จำไว้
//! แยกจาก library/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

/// ไฟล์ที่เจอในโฟลเดอร์
#[derive(Debug, Clone)]
pub(crate) struct Found {
    pub(crate) path: PathBuf,
    pub(crate) root: String,
    pub(crate) size: u64,
    pub(crate) mtime: i64,
}

pub(crate) fn is_skipped_dir(name: &str) -> bool {
    // "แยกไฟล์" โฟลเดอร์ตั้งต้นของงานแยกไฟล์ตั้งแต่ 15 พ.ย. 2569 · "<ชื่อหนัง> แยกไฟล์" แบบเดิมที่ผู้ใช้มีอยู่แล้วยังข้าม
    name == "ไฟล์เดิม" || name == "แยกไฟล์" || name.ends_with(" แยกไฟล์")
        || name.starts_with('$') || name == "System Volume Information" || name.starts_with('.')
}

fn same_path(a: &Path, b: &Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

/// เดินทุกโฟลเดอร์ย่อยของ root เก็บไฟล์หนังที่รับ
fn walk(dir: &Path, root: &str, skip: &[PathBuf], out: &mut Vec<Found>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            if is_skipped_dir(&name) || skip.iter().any(|s| same_path(s, &p)) {
                continue;
            }
            walk(&p, root, skip, out);
        } else if ft.is_file() {
            let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
            if !ACCEPTED.contains(&ext.as_str()) {
                continue;
            }
            let Ok(md) = e.metadata() else { continue };
            let mtime = md.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs() as i64).unwrap_or(0);
            out.push(Found { path: p, root: root.to_string(), size: md.len(), mtime });
        }
    }
}

fn split_name(p: &Path) -> (String, String) {
    let ext = p.extension().map(|x| x.to_string_lossy().to_lowercase()).unwrap_or_default();
    let name = p.file_stem().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
    (name, ext)
}

/// ทางที่ตัวอ่านใช้คุยกับข้างนอก · แยกไว้ให้เทสได้โดยไม่ต้องเปิดหน้าต่าง
pub struct ScanEnv<'a> {
    pub tools: &'a Path,
    pub thumbs: &'a Path,
    pub work: &'a Path,
    pub folders: &'a [String],
    pub originals: &'a str,
    pub workers: usize,
}

pub struct ScanResult {
    pub movies: Vec<Movie>,
    pub folders: Vec<FolderState>,
    /// ปกจับคู่ของหนังที่หายรอบนี้ เก็บไว้คืนให้เมื่อเรื่องนั้นกลับมา
    pub parked: Vec<ParkedCovers>,
}

/// ที่อยู่ไฟล์ไม่รวมนามสกุล ตัวเล็ก · ไฟล์ปกข้างหนังตั้งชื่อตามนี้
fn stem_key(p: &str) -> String {
    Path::new(p).with_extension("").to_string_lossy().to_lowercase()
}

/// คืนปกจับคู่ให้เรื่องที่กลับมา ตามเลขประจำไฟล์หรือที่อยู่ · คืนรายการเรื่องที่ได้คืน
pub fn restore_parked(movies: &mut [Movie], parked: &mut Vec<ParkedCovers>) -> Vec<String> {
    let mut back = vec![];
    for m in movies.iter_mut().filter(|m| m.linked.is_empty()) {
        if let Some(i) = parked.iter().position(|p| p.id == m.id || p.path.eq_ignore_ascii_case(&m.path)) {
            let p = parked.remove(i);
            m.linked = p.linked;
            m.cover_pick = p.cover_pick;
            if m.rating == 0 { m.rating = p.rating; }
            back.push(m.id.clone());
        }
    }
    back
}

/// อ่านทุกโฟลเดอร์ เทียบกับคลังเดิม คืนคลังใหม่ · `on_movie` ถูกเรียกทุกครั้งที่หนังเรื่องหนึ่งอ่านเสร็จ (ปกขึ้นทีละเรื่อง)
pub fn scan_core(env: &ScanEnv, existing: Vec<Movie>, on_movie: &(dyn Fn(&Movie, usize, usize) + Sync)) -> ScanResult {
    let mut skip: Vec<PathBuf> = vec![];
    if !env.originals.trim().is_empty() {
        skip.push(PathBuf::from(env.originals));
    }
    let mut found: Vec<Found> = vec![];
    let mut folders: Vec<FolderState> = vec![];
    for root in env.folders {
        let rp = Path::new(root);
        if !rp.is_dir() {
            folders.push(FolderState { path: root.clone(), ok: false, count: 0, error: Some(format!("หาโฟลเดอร์ {root} ไม่เจอ")) });
            continue;
        }
        let before = found.len();
        walk(rp, root, &skip, &mut found);
        folders.push(FolderState { path: root.clone(), ok: true, count: found.len() - before, error: None });
    }
    let missing_roots: HashSet<&str> = folders.iter().filter(|f| !f.ok).map(|f| f.path.as_str()).collect();
    let wanted_roots: HashSet<&str> = env.folders.iter().map(String::as_str).collect();

    // คลังเดิม ค้นได้ทั้งจากเลขประจำไฟล์และที่อยู่
    let by_id: HashMap<String, Movie> = existing.iter().map(|m| (m.id.clone(), m.clone())).collect();
    let by_path: HashMap<String, String> = existing.iter().map(|m| (m.path.to_lowercase(), m.id.clone())).collect();

    let total = found.len();
    let mut keep: Vec<Movie> = vec![];
    let mut todo: VecDeque<(Found, String, Option<Movie>)> = VecDeque::new();
    let mut seen: HashSet<String> = HashSet::new();
    for f in found {
        let fid = crate::app::winutil::file_id(&f.path).unwrap_or_else(|| format!("path:{}", f.path.to_string_lossy().to_lowercase()));
        if !seen.insert(fid.clone()) {
            continue; // ฮาร์ดลิงก์ไฟล์เดียวกัน ขึ้นชั้นครั้งเดียว
        }
        let old = by_id.get(&fid).cloned().or_else(|| by_path.get(&f.path.to_string_lossy().to_lowercase()).and_then(|id| by_id.get(id).cloned()));
        let (name, ext) = split_name(&f.path);
        match old {
            Some(mut m) if m.size == f.size && m.mtime == f.mtime && m.error.is_none()
                && (!m.has_cover || m.thumb.as_deref().map(probe::thumb_is_current).unwrap_or(false))
                && m.thumb2.as_deref().map(probe::thumb_is_current).unwrap_or(true) => {
                // ไม่เปลี่ยน · อาจแค่เปลี่ยนชื่อหรือย้ายใน Explorer
                m.id = fid;
                m.path = f.path.to_string_lossy().to_string();
                m.root = f.root.clone();
                m.name = name.clone();
                m.ext = ext;
                m.year = probe::year_of(&name);
                m.missing = false;
                keep.push(m);
            }
            old => todo.push_back((f, fid, old)),
        }
    }
    let done = Mutex::new(keep.len());
    for m in &keep {
        on_movie(m, *done.lock().unwrap(), total);
    }

    // อ่านข้อมูลไฟล์ใหม่หรือไฟล์ที่เปลี่ยน หลายไฟล์พร้อมกัน
    let queue = Mutex::new(todo);
    let fresh: Mutex<Vec<Movie>> = Mutex::new(vec![]);
    std::thread::scope(|sc| {
        for _ in 0..env.workers.max(1) {
            sc.spawn(|| loop {
                let Some((f, fid, old)) = queue.lock().unwrap().pop_front() else { break };
                let m = read_one(env, &f, &fid, old);
                let n = { let mut d = done.lock().unwrap(); *d += 1; *d };
                on_movie(&m, n, total);
                fresh.lock().unwrap().push(m);
            });
        }
    });
    let mut movies = keep;
    movies.extend(fresh.into_inner().unwrap());
    let present: HashSet<String> = movies.iter().map(|m| m.id.clone()).collect();
    let old_ids: HashSet<String> = existing.iter().map(|m| m.id.clone()).collect();
    // ของที่คลังใหม่ยังชี้อยู่ ห้ามลบ · เลขประจำไฟล์เปลี่ยนแต่เป็นเรื่องเดิม (รวมเสียงเข้าไฟล์ ได้ไฟล์ใหม่ชื่อเดิม) รายการเก่าจะดูเหมือนหนังหาย (ผู้ช่วยตรวจขั้น 8)
    let in_use: HashSet<String> = movies.iter()
        .flat_map(|m| [m.thumb.clone(), m.thumb2.clone()].into_iter().flatten().chain(m.linked.iter().map(|c| c.thumb.clone())))
        .map(|t| t.to_lowercase()).collect();
    let paths_now: HashSet<String> = movies.iter().map(|m| m.path.to_lowercase()).collect();
    let mut parked: Vec<ParkedCovers> = vec![];

    // หนังในคลังที่ไม่เจอรอบนี้
    // หนังที่หายจากคลังรอบนี้ ภาพเล็กของมันลบทิ้ง
    for m in existing {
        if present.contains(&m.id) {
            continue;
        }
        if wanted_roots.contains(m.root.as_str()) && missing_roots.contains(m.root.as_str()) {
            // ไดรฟ์ถอดออก · ยังอยู่บนชั้นแบบจาง
            movies.push(Movie { missing: true, ..m });
        } else {
            // ไฟล์ถูกลบหรือย้ายออกไป หรือโฟลเดอร์ถูกเอาออกจากชั้น
            for t in [&m.thumb, &m.thumb2].into_iter().flatten() {
                if !in_use.contains(&t.to_lowercase()) { let _ = fs::remove_file(t); }
            }
            // เรื่องเดิมที่อยู่เดิม เลขเปลี่ยน คลังใหม่รับปกไปแล้ว ไม่ต้องทำอะไร
            if paths_now.contains(&m.path.to_lowercase()) {
                // รวมเข้าไฟล์แล้วเลขประจำไฟล์เปลี่ยน ที่อยู่เดิม คะแนนตามเรื่องใหม่
                if let Some(n) = movies.iter_mut().find(|n| n.rating == 0 && n.path.eq_ignore_ascii_case(&m.path)) { n.rating = m.rating; }
                continue;
            }
            if m.linked.is_empty() && m.rating == 0 { continue; }
            // ชื่อเดิมคนละนามสกุล (รวมเข้าไฟล์จาก MP4 ได้ MKV) ปกตามเรื่องใหม่ · ไฟล์ปกข้างหนังตั้งชื่อตามนี้อยู่แล้ว
            let key = stem_key(&m.path);
            if let Some(n) = movies.iter_mut().find(|n| n.linked.is_empty() && !old_ids.contains(&n.id) && stem_key(&n.path) == key) {
                n.linked = m.linked;
                n.cover_pick = m.cover_pick;
                if n.rating == 0 { n.rating = m.rating; }
            } else {
                // หายจริง · ไม่ลบอะไร เก็บไว้คืนให้เมื่อเรื่องนั้นกลับมา
                parked.push(ParkedCovers { id: m.id, path: m.path, linked: m.linked, cover_pick: m.cover_pick, rating: m.rating });
            }
        }
    }
    for f in folders.iter_mut().filter(|f| !f.ok) {
        f.count = movies.iter().filter(|m| m.root == f.path).count();
    }
    ScanResult { movies, folders, parked }
}

/// อ่านข้อมูลไฟล์หนึ่งไฟล์ และดึงปก
pub(crate) fn read_one(env: &ScanEnv, f: &Found, fid: &str, old: Option<Movie>) -> Movie {
    let (name, ext) = split_name(&f.path);
    let changed = old.as_ref().map(|o| o.size != f.size || o.mtime != f.mtime).unwrap_or(false);
    let mut m = old.clone().unwrap_or_else(|| Movie { added: now(), status: "unchecked".into(), ..Default::default() });
    m.id = fid.to_string();
    m.path = f.path.to_string_lossy().to_string();
    m.root = f.root.clone();
    m.year = probe::year_of(&name);
    m.name = name;
    m.ext = ext;
    m.size = f.size;
    m.mtime = f.mtime;
    m.missing = false;
    if changed && m.status != "unchecked" {
        m.status = "changed".into();
    }
    match probe::probe(env.tools, &f.path) {
        Ok(p) => {
            m.error = None;
            m.duration = p.duration;
            m.video = p.video;
            m.video_short = p.video_short;
            m.audio = p.audio;
            m.subs = p.subs;
            m.images = p.images;
            m.has_cover = p.cover.is_some() || p.cover_land.is_some();
            let old_thumbs = [m.thumb.take(), m.thumb2.take()];
            m.cover_name = None;
            m.cover_sha256 = None;
            m.cover_aspect = None;
            m.cover2_name = None;
            m.cover2_aspect = None;
            // ปกหลัก (cover) กับปกนอน (cover_land) ทำภาพเล็กทั้งคู่ · ปกตั้งขึ้นก่อนเสมอ ดูจากสัดส่วนจริงของรูป ไม่ใช่ชื่อ
            // (ไฟล์ที่แนบรูปแนวนอนไว้ชื่อ cover.jpg ก่อนมีระบบนี้ ก็ยังนับเป็นปกนอน)
            let mut made: Vec<probe::Thumb> = vec![];
            for src in [p.cover, p.cover_land].into_iter().flatten() {
                match probe::make_thumb(env.tools, &f.path, &src, env.work, env.thumbs, &safe_id(fid)) {
                    Ok(t) => made.push(t),
                    Err(e) => m.error = Some(e),
                }
            }
            made.sort_by_key(|t| t.aspect >= 1.0);
            let mut it = made.into_iter();
            if let Some(t) = it.next() {
                m.thumb = Some(t.path.to_string_lossy().to_string());
                m.cover_name = Some(t.cover_name);
                m.cover_sha256 = Some(t.cover_sha256);
                m.cover_aspect = Some(t.aspect);
            }
            if let Some(t) = it.next() {
                m.thumb2 = Some(t.path.to_string_lossy().to_string());
                m.cover2_name = Some(t.cover_name);
                m.cover2_aspect = Some(t.aspect);
            }
            for t in old_thumbs.into_iter().flatten() {
                if m.thumb.as_deref() != Some(t.as_str()) && m.thumb2.as_deref() != Some(t.as_str()) {
                    let _ = fs::remove_file(t);
                }
            }
        }
        Err(e) => m.error = Some(e),
    }
    m
}

