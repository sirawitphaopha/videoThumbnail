//! จับคู่รูปปก ที่เก็บคู่ที่รอทำ (pending.json) กับตัวกันงานซ้อน
//! แยกจาก link/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ที่เก็บคู่ที่รอยืนยัน

#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct LinkFile {
    pub version: u32,
    pub rows: Vec<Row>,
    /// โฟลเดอร์รูปที่เลือกไว้ เพิ่มได้เรื่อย ๆ
    pub image_folders: Vec<String>,
    /// รูปที่ลากมาทีละรูป ไม่ได้มาทั้งโฟลเดอร์
    pub loose: Vec<String>,
    /// nocover เฉพาะเรื่องที่ยังไม่มีปก · all ทุกเรื่องบนชั้นวาง
    pub scope: String,
}

pub struct LinkStore {
    path: PathBuf,
    pub data: Mutex<LinkFile>,
    save_lock: Mutex<()>,
    pub(crate) thumbing: AtomicBool,
    pub(crate) rethumb: AtomicBool,
    /// กดหยุดงานยืนยัน
    pub stop: AtomicBool,
    /// กำลังยืนยันหรือย้ายที่เก็บ · ระหว่างนี้ห้ามแก้แถวหรือเริ่มงานซ้อน ข้อมูลเก่าจะทับข้อมูลใหม่ (ผู้ช่วยตรวจขั้น 8)
    busy: AtomicBool,
}

const BUSY_MSG: &str = "กำลังอ่านรูปเพื่อจับคู่ ยืนยัน ย้ายที่เก็บรูป หรือจำค่าครอปอยู่ รอให้เสร็จก่อน";

/// ถือไว้ตลอดงาน หลุดจากขอบเขตเมื่อไหร่ก็ปลดเอง รวมตอนงานล้ม
pub struct BusyGuard(Arc<LinkStore>);
impl Drop for BusyGuard {
    fn drop(&mut self) { self.0.busy.store(false, Ordering::SeqCst); }
}
pub(crate) fn begin_busy(store: &Arc<LinkStore>) -> Result<BusyGuard, String> {
    if store.busy.swap(true, Ordering::SeqCst) { return Err(BUSY_MSG.to_string()); }
    Ok(BusyGuard(store.clone()))
}

/// คู่ที่นับว่ารอยืนยัน · แถวที่เปิดจากชั้นวางแล้วยังไม่ได้แก้อะไร ไม่นับ กดเข้ามาดูแล้วออกต้องไม่ขึ้นเลข ไม่ถามตอนปิด
pub(crate) fn is_waiting(r: &Row) -> bool {
    r.status != "saved" && r.has_image() && !(r.via == "shelf" && !r.touched)
}

fn read_file(path: &Path) -> Option<LinkFile> {
    serde_json::from_slice(&fs::read(path).ok()?).ok()
}

impl LinkStore {
    /// อ่านของเดิม ไฟล์เสียใช้สำรอง · แถวที่ยืนยันแล้วของรอบก่อนไม่ต้องขึ้นตารางอีก
    pub fn load(path: PathBuf) -> Self {
        let mut data = read_file(&path).or_else(|| read_file(&path.with_extension("json.bak"))).unwrap_or_default();
        data.rows.retain(|r| r.status != "saved");
        // คู่ที่ค้างจากรุ่นก่อน ปกตั้งที่ครอปกลางจากรูปแนวนอนให้เอง เอาออก เหลือปกนอนอย่างเดียว (พี่กันเคาะ 10 พ.ย. 2569)
        for r in data.rows.iter_mut().filter(|r| r.derived_tall) { r.tall = None; r.derived_tall = false; }
        if data.scope.is_empty() { data.scope = "nocover".into(); }
        Self { path, data: Mutex::new(data), save_lock: Mutex::new(()), thumbing: AtomicBool::new(false), rethumb: AtomicBool::new(false), stop: AtomicBool::new(false), busy: AtomicBool::new(false) }
    }

    pub fn save(&self) -> Result<(), String> {
        let _one = self.save_lock.lock().unwrap_or_else(|e| e.into_inner());
        let bytes = serde_json::to_vec(&*self.data.lock().unwrap()).map_err(|e| e.to_string())?;
        if let Some(dir) = self.path.parent() { let _ = fs::create_dir_all(dir); }
        let ok = read_file(&self.path).is_some();
        write_atomic(&self.path, &bytes, ok).map_err(|e| format!("บันทึกคู่ที่รอยืนยันไม่สำเร็จ: {e}"))
    }

    /// คู่ที่รอยืนยัน ไว้ขึ้นเลขในเมนูกับถามตอนปิดโปรแกรม
    pub fn waiting(&self) -> usize {
        self.data.lock().unwrap().rows.iter().filter(|r| is_waiting(r)).count()
    }
    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }
    pub(crate) fn idle(&self) -> Result<(), String> {
        if self.is_busy() { Err(BUSY_MSG.to_string()) } else { Ok(()) }
    }
}

pub fn link_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("pending.json"))
}

