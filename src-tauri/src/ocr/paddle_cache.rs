//! ตัวเก็บโมเดล PaddleOCR ที่โหลดแล้ว (ผู้ช่วยตรวจทาน R16 · BUGS ข้อ 162.7)
//! เดิมเก็บทุกโมเดลจนปิดโปรแกรม ตั้งตัวช่วยหลายขนาดหลายภาษาแล้วโมเดลค้างหลายร้อย MB บนเครื่องแรม 8 GB
//! ① เก็บไม่เกินสองโมเดลล่าสุดต่อชนิด (ตัวอ่าน ตัวหาบรรทัด ตัวดูภาพกลับหัว) ตัวที่ใช้ล่าสุดอยู่หน้า
//! ② ไม่ได้ใช้ครบสามนาที ปล่อยทุกโมเดลออกจากแรม ใช้ครั้งหน้าโหลดใหม่ราววินาที
//! งานที่กำลังอ่านถือ Arc ของโมเดลไว้เอง ปล่อยจากตัวเก็บแล้วงานนั้นยังอ่านต่อได้จนจบ
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

pub(crate) const KEEP: usize = 2;
pub(crate) const IDLE: Duration = Duration::from_secs(180);

pub(crate) type Slot<T> = OnceLock<Mutex<Vec<(PathBuf, Arc<T>)>>>;

static LAST_USE: Mutex<Option<Instant>> = Mutex::new(None);
static RELEASERS: Mutex<Vec<fn()>> = Mutex::new(vec![]);
static WATCH: OnceLock<()> = OnceLock::new();

fn touch() {
    *LAST_USE.lock().unwrap() = Some(Instant::now());
    // ตัวเฝ้าเวลาว่างเริ่มครั้งแรกที่ใช้โมเดล ตื่นทุก 30 วินาที
    WATCH.get_or_init(|| {
        let _ = std::thread::Builder::new().name("paddle-idle".into()).spawn(|| loop {
            std::thread::sleep(Duration::from_secs(30));
            let idle = LAST_USE.lock().unwrap().is_some_and(|t| t.elapsed() >= IDLE);
            if idle { release_all(); }
        });
    });
}

/// โมเดลจากตัวเก็บ ไม่มีก็โหลดแล้วเก็บไว้หน้าสุด เกินสองตัวทิ้งตัวที่ใช้นานสุด
pub(crate) fn cached<T: Send + Sync + 'static>(slot: &'static Slot<T>, key: &Path, load: impl FnOnce() -> Result<T, String>) -> Result<Arc<T>, String> {
    let m = slot.get_or_init(Default::default);
    touch();
    {
        let mut v = m.lock().unwrap();
        if let Some(i) = v.iter().position(|(k, _)| k == key) {
            let it = v.remove(i);
            let a = it.1.clone();
            v.insert(0, it);
            return Ok(a);
        }
    }
    let a = Arc::new(load()?);
    let mut v = m.lock().unwrap();
    v.retain(|(k, _)| k != key);
    v.insert(0, (key.to_path_buf(), a.clone()));
    v.truncate(KEEP);
    Ok(a)
}

/// ลงทะเบียนตัวล้างของแต่ละชนิดโมเดล (paddle.rs เรียกตอนเริ่ม)
pub(crate) fn on_release(f: fn()) {
    let mut r = RELEASERS.lock().unwrap();
    if !r.contains(&f) { r.push(f); }
}

/// ปล่อยทุกโมเดลออกจากตัวเก็บ
pub fn release_all() {
    let fs: Vec<fn()> = RELEASERS.lock().unwrap().clone();
    for f in fs { f(); }
    *LAST_USE.lock().unwrap() = None;
}

/// ล้างหนึ่งช่อง
pub(crate) fn clear<T>(slot: &Slot<T>) {
    if let Some(m) = slot.get() { m.lock().unwrap().clear(); }
}

/// จำนวนโมเดลในช่อง (เทส)
#[cfg(test)]
pub(crate) fn count<T>(slot: &Slot<T>) -> usize {
    slot.get().map(|m| m.lock().unwrap().len()).unwrap_or(0)
}

#[cfg(test)]
#[path = "paddle_cache_tests.rs"]
mod tests;
