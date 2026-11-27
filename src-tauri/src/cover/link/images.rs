//! จับคู่รูปปก อ่านรูปจากดิสก์ ขนาดรูป ภาพเล็ก รายการรูปในโฟลเดอร์
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- อ่านรูปจากดิสก์

/// ขนาดรูปจากหัวไฟล์ ไม่ถอดทั้งรูป · นับป้ายหมุนของกล้อง · HEIC อ่านไม่ได้ได้ 0 รอตัวทำภาพเล็กบอกขนาด
pub fn header_size(path: &Path) -> (u32, u32) {
    let read = || -> Option<(u32, u32)> {
        let mut dec = ImageReader::open(path).ok()?.with_guessed_format().ok()?.into_decoder().ok()?;
        let (w, h) = dec.dimensions();
        let turned = dec.orientation().map(|o| {
            use image::metadata::Orientation::*;
            matches!(o, Rotate90 | Rotate270 | Rotate90FlipH | Rotate270FlipH)
        }).unwrap_or(false);
        Some(if turned { (h, w) } else { (w, h) })
    };
    read().unwrap_or((0, 0))
}

fn walk_images(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() {
            let name = e.file_name().to_string_lossy().to_string();
            if name != "ไฟล์เดิม" && !name.starts_with('$') && !name.starts_with('.') && name != "System Volume Information" {
                walk_images(&p, out);
            }
        } else if ft.is_file() && pi::ACCEPTED.contains(&pi::ext_of(&p).as_str()) {
            out.push(p);
        }
    }
}

/// ชื่อไฟล์ภาพเล็กของรูปต้นทาง ผูกกับที่อยู่ ขนาด เวลาแก้ไข · รูปเปลี่ยนแล้วได้ชื่อใหม่
pub(crate) fn thumb_key(path: &Path) -> String {
    let md = fs::metadata(path).ok();
    let mtime = md.as_ref().and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
    let text = format!("{}|{}|{mtime}", path.to_string_lossy().to_lowercase(), md.map(|m| m.len()).unwrap_or(0));
    crate::media::probe::hex(&Sha256::digest(text.as_bytes()))[..20].to_string()
}

/// ภาพเล็กที่ทำไว้แล้ว ชื่อไฟล์ลงท้ายด้วยขนาดรูปจริง key-1000x1500.jpg
pub(crate) fn cached_thumbs(dir: &Path) -> HashMap<String, (PathBuf, u32, u32)> {
    let mut out = HashMap::new();
    let Ok(rd) = fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let Some(stem) = name.strip_suffix(".jpg") else { continue };
        let Some((key, size)) = stem.split_once('-') else { continue };
        let Some((w, h)) = size.split_once('x') else { continue };
        if let (Ok(w), Ok(h)) = (w.parse(), h.parse()) {
            out.insert(key.to_string(), (e.path(), w, h));
        }
    }
    out
}

pub(crate) fn make_src_thumb(tools: &Path, work: &Path, dir: &Path, path: &Path) -> Result<(PathBuf, u32, u32), String> {
    let dec = pi::decode(tools, work, path)?;
    let (w, h) = dec.img.dimensions();
    let scale = (360.0 / w.max(h) as f64).min(1.0);
    let small = if scale < 1.0 {
        imageops::resize(&dec.img, ((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1), imageops::FilterType::Triangle)
    } else {
        dec.img
    };
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{}-{w}x{h}.jpg", thumb_key(path)));
    fs::write(&out, pi::encode(&small, "jpg", 85)?).map_err(|e| e.to_string())?;
    Ok((out, w, h))
}

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct LinkImage {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
    /// จับคู่ไปแล้ว ไม่ขึ้นบนกระดาน
    pub used: bool,
    pub error: Option<String>,
}

/// รูปทั้งหมดจากโฟลเดอร์ที่เลือกกับรูปที่ลากมาทีละรูป · ซ้ำกันเหลืออันเดียว
pub fn list_images(folders: &[String], loose: &[String], thumbs: &Path) -> Vec<ImgIn> {
    let cache = cached_thumbs(thumbs);
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = vec![];
    let mut push = |p: &Path, folder: &str| {
        if !seen.insert(p.to_string_lossy().to_lowercase()) { return; }
        let hit = cache.get(&thumb_key(p));
        let (width, height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(p));
        out.push(ImgIn {
            path: p.to_string_lossy().to_string(), name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), folder: folder.to_string(),
            width, height, thumb: hit.map(|h| h.0.to_string_lossy().to_string()),
        });
    };
    for f in folders {
        let mut files = vec![];
        walk_images(Path::new(f), &mut files);
        files.sort_by_key(|p| p.to_string_lossy().to_lowercase());
        for p in files { push(&p, f); }
    }
    for f in loose {
        let p = Path::new(f);
        if p.is_file() { push(p, &p.parent().map(|d| d.to_string_lossy().to_string()).unwrap_or_default()); }
    }
    out
}

/// ของที่อ่านจากดิสก์ครั้งเดียวต่อรอบจับคู่ ใช้ร่วมทุกเรื่อง
/// (AUDIT ข้อ 64 · เดิมทุกเรื่องอ่านโฟลเดอร์ภาพเล็กทั้งโฟลเดอร์และอ่านโฟลเดอร์ของหนังใหม่
///  โฟลเดอร์รวม 300 เรื่องกับรูป 300 รูปได้การเปิดหัวไฟล์ราว 90,000 ครั้ง)
pub struct BesideCache<'a> {
    thumbs: HashMap<String, (PathBuf, u32, u32)>,
    dirs: HashMap<String, Vec<ImgIn>>,
    own: &'a HashSet<String>,
    /// อ่านโฟลเดอร์ของหนังจริงกี่ครั้ง (เทสนับ)
    pub reads: usize,
}

impl<'a> BesideCache<'a> {
    pub fn new(thumbs: &Path, own: &'a HashSet<String>) -> Self {
        Self { thumbs: cached_thumbs(thumbs), dirs: HashMap::new(), own, reads: 0 }
    }
    /// รูปในโฟลเดอร์ · อ่านครั้งแรกแล้วจำ เรื่องอื่นในโฟลเดอร์เดียวกันใช้ผลเดิม
    fn images(&mut self, dir: &Path) -> &[ImgIn] {
        let key = dir.to_string_lossy().to_lowercase();
        if !self.dirs.contains_key(&key) {
            self.reads += 1;
            let mut out = vec![];
            if let Ok(rd) = fs::read_dir(dir) {
                for e in rd.flatten() {
                    let f = e.path();
                    // ไฟล์ปกที่โปรแกรมทำเองไม่ใช่รูปต้นทาง · ถ้านับ ปกที่ครอปไว้จะกลายเป็นไฟล์ของคนอื่นตอนจับคู่ทุกเรื่องซ้ำ
                    if f.is_file() && pi::ACCEPTED.contains(&pi::ext_of(&f).as_str()) && !self.own.contains(&f.to_string_lossy().to_lowercase()) {
                        let hit = self.thumbs.get(&thumb_key(&f));
                        let (width, height) = hit.map(|h| (h.1, h.2)).unwrap_or_else(|| header_size(&f));
                        out.push(ImgIn {
                            path: f.to_string_lossy().to_string(), name: f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
                            folder: dir.to_string_lossy().to_string(), width, height, thumb: hit.map(|h| h.0.to_string_lossy().to_string()),
                        });
                    }
                }
            }
            out.sort_by_key(|i| i.name.to_lowercase());
            self.dirs.insert(key.clone(), out);
        }
        &self.dirs[&key]
    }
}

/// ข้อมูลหนังสำหรับตัวจับคู่ · อ่านรูปข้างไฟล์กับไฟล์ .nfo
pub fn movie_in(id: &str, path: &str, has_cover: bool, all_dirs: &HashMap<String, usize>, cache: &mut BesideCache) -> MovieIn {
    let p = Path::new(path);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let dir = p.parent().unwrap_or(Path::new(""));
    let dir_key = dir.to_string_lossy().to_lowercase();
    let title = movie_title(p);
    let mut imdb = title.imdb.clone();
    let alone = all_dirs.get(&dir_key).copied().unwrap_or(1) <= 1;
    if imdb.is_none() {
        // movie.nfo ใช้เฉพาะโฟลเดอร์ที่มีเรื่องเดียว · โฟลเดอร์รวมหลายเรื่องทุกเรื่องจะได้เลขเดียวกัน
        let nfos = if alone { vec![dir.join(format!("{stem}.nfo")), dir.join("movie.nfo")] } else { vec![dir.join(format!("{stem}.nfo"))] };
        for nfo in nfos {
            if let Ok(b) = fs::read(&nfo) {
                let text = String::from_utf8_lossy(&b[..b.len().min(65536)]).to_string();
                imdb = text.split(|c: char| !c.is_ascii_alphanumeric()).find_map(find_imdb);
                if imdb.is_some() { break; }
            }
        }
    }
    let beside = cache.images(dir).to_vec();
    MovieIn { id: id.to_string(), path: path.to_string(), stem, title, has_cover, imdb, beside, alone }
}

pub fn dir_counts<'a>(paths: impl Iterator<Item = &'a str>) -> HashMap<String, usize> {
    let mut out = HashMap::new();
    for p in paths {
        let d = Path::new(p).parent().map(|d| d.to_string_lossy().to_lowercase()).unwrap_or_default();
        *out.entry(d).or_insert(0) += 1;
    }
    out
}

