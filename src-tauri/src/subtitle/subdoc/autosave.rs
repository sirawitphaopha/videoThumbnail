//! ฉบับบันทึกอัตโนมัติของหน้าแก้ซับ เขียน ตัดฉบับเก่า และเปิดคืน
//! แยกจาก subdoc/mod.rs ตอนทำ BUGS ข้อ 162.10 (ROADMAP R11 ข้อ 2 ถึง 4) คำสั่งของหน้าจอยังอยู่ mod.rs
//! พี่กันสั่ง 28 พ.ย. 2569 "เพิ่มข้อ 4เข้าไปในงานนี้ด้วยนะ เอาตามเธอ" ตามที่แคลร์เสนอ
//! ① โควตาต่อไฟล์นับตามที่อยู่ไฟล์เต็ม (ซับในหนังนับตามหนังกับเลขแทร็ก) ซับชื่อเดียวกันคนละโฟลเดอร์ไม่แย่งกัน
//! ② จดรหัสอักษรที่เขียนจริงไว้ในไฟล์ .json ข้างกัน เปิดคืนแล้วได้รหัสเดิม ไม่เดาใหม่
//! ③ เพดานรวมทั้งโฟลเดอร์ 200 ฉบับหรือ 100 MB เกินแล้วลบฉบับเก่าสุดก่อน โฟลเดอร์บนไดรฟ์ C ไม่โตไปเรื่อย ๆ
use super::*;

/// เก็บฉบับบันทึกอัตโนมัติกี่ฉบับต่อไฟล์ (แผนหน้าแก้ซับ แคลร์ตั้ง)
pub(crate) const KEEP_AUTOSAVES: usize = 10;
/// เพดานรวมทั้งโฟลเดอร์ (BUGS ข้อ 162.10 แคลร์เสนอ พี่กันเคาะ)
pub(crate) const MAX_AUTOSAVES: usize = 200;
pub(crate) const MAX_AUTOSAVE_BYTES: u64 = 100 * 1024 * 1024;

/// ข้อมูลข้างไฟล์บันทึกอัตโนมัติ · ชื่อไฟล์ที่แก้ ที่มา เวลาบันทึก
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AutoItem {
    pub path: String,
    pub name: String,
    pub source: Option<Source>,
    /// วันเวลาเครื่อง ปปปป-ดด-วว ชช:นน:วว
    pub at: String,
    pub events: usize,
    /// ลำดับที่บันทึก เพิ่มขึ้นเสมอ ใช้เรียงใหม่เก่า (บันทึกหลายฉบับในวินาทีเดียวกันก็เรียงถูก)
    #[serde(default)]
    pub seq: u64,
    /// ตัวนับโควตาต่อไฟล์ ที่อยู่ไฟล์เต็ม ซับในหนังต่อท้ายเลขแทร็ก ซับใหม่ที่ยังไม่มีไฟล์ใช้ชื่อ · ฉบับรุ่นก่อนไม่มีช่องนี้ ใช้ชื่อแทน
    #[serde(default)]
    pub key: String,
    /// รหัสอักษรที่เขียนลงไฟล์จริง (ข้อ ②) · ฉบับรุ่นก่อนไม่มี เปิดแล้วเดาเหมือนเดิม
    #[serde(default)]
    pub charset: Option<String>,
}

impl AutoItem {
    fn quota_key(&self) -> &str {
        if self.key.is_empty() { &self.name } else { &self.key }
    }
}

static AUTO_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// เวลาเครื่องเป็นไมโครวินาที ไม่ซ้ำกับครั้งก่อน
fn next_seq() -> u64 {
    use std::sync::atomic::Ordering;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_micros() as u64).unwrap_or(0);
    let mut cur = AUTO_SEQ.load(Ordering::SeqCst);
    loop {
        let want = now.max(cur + 1);
        match AUTO_SEQ.compare_exchange(cur, want, Ordering::SeqCst, Ordering::SeqCst) { Ok(_) => return want, Err(v) => cur = v }
    }
}

/// ชื่อที่ใช้เป็นไฟล์ได้ · ตัวที่ Windows ห้ามเปลี่ยนเป็นขีดล่าง
fn safe_name(s: &str) -> String {
    s.chars().map(|c| if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || (c as u32) < 32 { '_' } else { c }).collect()
}

/// ตัวนับโควตาของเอกสาร (ข้อ ①) · Windows ไม่สนตัวพิมพ์ใหญ่เล็กของที่อยู่ เทียบแบบตัวเล็กหมด
fn key_of(doc: &SubDoc, name: &str) -> String {
    match &doc.source {
        Some(s) if s.in_movie => format!("{}#{}", s.path.to_lowercase(), s.tid.map(|t| t.to_string()).unwrap_or_default()),
        Some(s) => s.path.to_lowercase(),
        None => format!("ใหม่:{name}"),
    }
}

fn remove(item: &AutoItem) {
    // ไฟล์ของโปรแกรมเอง ไม่ต้องลงถังขยะ
    let _ = std::fs::remove_file(&item.path);
    let _ = std::fs::remove_file(format!("{}.json", item.path));
}

fn bytes_of(item: &AutoItem) -> u64 {
    let f = |p: &str| std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    f(&item.path) + f(&format!("{}.json", item.path))
}

/// เขียนฉบับบันทึกอัตโนมัติ ไฟล์ซับจริงที่เปิดด้วยโปรแกรมอื่นได้ กับไฟล์ .json ข้างกัน · เก็บ 10 ฉบับล่าสุดต่อไฟล์ และไม่เกินเพดานรวม
pub fn autosave_to(dir: &Path, doc: &SubDoc, name: &str) -> Result<AutoItem, String> {
    autosave_capped(dir, doc, name, MAX_AUTOSAVES, MAX_AUTOSAVE_BYTES)
}

/// เขียนแล้วตัดตามเพดานที่ส่งมา · เทสส่งเพดานเล็กไว้ลองเพดานขนาด ไม่ต้องเขียนไฟล์ 100 MB
pub(crate) fn autosave_capped(dir: &Path, doc: &SubDoc, name: &str, max_n: usize, max_bytes: u64) -> Result<AutoItem, String> {
    let t = crate::app::actlog::now_local();
    let ext = match doc.kind.as_str() { "ass" => "ass", "ssa" => "ssa", "vtt" => "vtt", _ => "srt" };
    let base = safe_name(name);
    let stamp = format!("{:04}{:02}{:02}-{:02}{:02}{:02}", t.y, t.mo, t.d, t.h, t.mi, t.s);
    let mut file = dir.join(format!("{base}.{stamp}.{ext}"));
    let mut n = 2;
    while file.exists() { file = dir.join(format!("{base}.{stamp}-{n}.{ext}")); n += 1; }
    let (bytes, enc, _) = to_bytes(doc);
    let item = AutoItem {
        path: file.display().to_string(), name: name.into(), source: doc.source.clone(),
        at: format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", t.y, t.mo, t.d, t.h, t.mi, t.s), events: doc.events.len(), seq: next_seq(),
        key: key_of(doc, name), charset: Some(enc.charset),
    };
    std::fs::write(&file, &bytes).map_err(|e| format!("บันทึกอัตโนมัติไม่สำเร็จ {e}"))?;
    let json = serde_json::to_vec_pretty(&item).map_err(|e| e.to_string())?;
    std::fs::write(format!("{}.json", file.display()), json).map_err(|e| format!("บันทึกอัตโนมัติไม่สำเร็จ {e}"))?;
    prune(dir, &item, max_n, max_bytes);
    Ok(item)
}

/// ตัดฉบับเก่า · ฉบับที่เพิ่งเขียนไม่ถูกตัดเสมอ นาฬิกาเครื่องถอยหลัง (ซิงก์เวลา) ลำดับของฉบับใหม่น้อยกว่าฉบับเก่า
/// เดิมถูกลบทันทีหลังเขียนทั้งที่ตอบว่าบันทึกอัตโนมัติแล้ว (ผู้ช่วยตรวจทาน R11)
fn prune(dir: &Path, item: &AutoItem, max_n: usize, max_bytes: u64) {
    let rest: Vec<AutoItem> = list_autosaves(dir).into_iter().filter(|a| a.path != item.path).collect();
    // ① ฉบับของไฟล์เดียวกันเกิน 10 ฉบับรวมฉบับใหม่ ตัดเก่าสุดออก
    let same: Vec<&AutoItem> = rest.iter().filter(|a| a.quota_key() == item.quota_key()).collect();
    if same.len() >= KEEP_AUTOSAVES {
        for old in &same[KEEP_AUTOSAVES - 1..] { remove(old); }
    }
    // ③ เพดานรวมทั้งโฟลเดอร์ นับฉบับใหม่ก่อน แล้วเก็บจากใหม่ไปเก่าจนเต็มเพดาน ที่เหลือลบ
    let mut count = 1;
    let mut total = bytes_of(item);
    for a in list_autosaves(dir).into_iter().filter(|a| a.path != item.path) {
        let b = bytes_of(&a);
        if count + 1 > max_n || total + b > max_bytes { remove(&a); continue; }
        count += 1;
        total += b;
    }
}

/// ฉบับบันทึกอัตโนมัติทั้งหมด ใหม่สุดก่อน · อ่านจากไฟล์ .json ข้างไฟล์ซับ
pub fn list_autosaves(dir: &Path) -> Vec<AutoItem> {
    let mut out: Vec<AutoItem> = std::fs::read_dir(dir).map(|rd| rd.flatten().filter_map(|e| {
        let p = e.path();
        if p.extension()?.to_str()? != "json" { return None; }
        let item: AutoItem = serde_json::from_slice(&std::fs::read(&p).ok()?).ok()?;
        Path::new(&item.path).exists().then_some(item)
    }).collect()).unwrap_or_default();
    out.sort_by(|a, b| b.seq.cmp(&a.seq));
    out
}

/// เปิดฉบับบันทึกอัตโนมัติ · ที่มาเป็นไฟล์เดิมที่แก้ (ขนาดกับเวลาแก้ล่าสุด) กดบันทึกแล้วเขียนทับไฟล์เดิม ไม่ใช่ฉบับอัตโนมัติ
/// ไฟล์เดิมหายไปแล้ว หรือเป็นซับในหนัง ที่มาเป็นแบบซับในหนัง ต้องบันทึกเป็นไฟล์ใหม่
pub fn open_autosave(dir: &Path, path: &Path) -> Result<SubDoc, String> {
    if path.parent() != Some(dir) { return Err("เปิดได้เฉพาะไฟล์ในโฟลเดอร์บันทึกอัตโนมัติ".into()); }
    let item: AutoItem = serde_json::from_slice(&std::fs::read(format!("{}.json", path.display())).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let bytes = std::fs::read(path).map_err(|e| format!("อ่านฉบับบันทึกอัตโนมัติไม่ได้ {e}"))?;
    let ext = path.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    // ② ใช้รหัสอักษรที่จดไว้ตอนเขียน ไม่เดาใหม่ (ซับไทย TIS-620 สั้น ๆ เดาผิดเป็น Windows-1252 ได้)
    let mut doc = parse_doc(&bytes, &ext, item.charset.as_deref());
    doc.source = match item.source {
        Some(s) if !s.in_movie && Path::new(&s.path).exists() => { let (size, mtime) = stamp(Path::new(&s.path)); Some(Source { size, mtime, ..s }) }
        // ซับในหนังเก็บขนาดกับเวลาแก้ของหนังตอนเปิดไว้ หนังเปลี่ยนไปแล้วใส่กลับเข้าหนังไม่ได้ (R3)
        Some(s) if s.in_movie => Some(s),
        // ไฟล์ซับเดิมหายไปแล้ว ยังเป็นไฟล์ซับ ไม่ใช่ซับในหนัง (เดิมตั้งเป็นในหนัง กดบันทึกแล้วไปทางใส่กลับเข้าหนังของหนังที่เปิดอยู่ · ผู้ช่วยตรวจทาน R1)
        // บันทึกทับได้ "missing" หน้าจอพาไปบันทึกเป็นไฟล์ใหม่
        Some(s) => Some(Source { size: 0, mtime: 0, ..s }),
        None => None,
    };
    Ok(doc)
}
