//! ทะเบียนไฟล์ทำค้างที่โปรแกรมเขียนไว้ข้างไฟล์ของผู้ใช้ (BUGS ข้อ 162.4 · ROADMAP R14 ข้อ 2 กับข้อ 10 ข้อ 21 ของงานค้าง)
//! ไฟดับหรือโปรแกรมปิดกลางทาง ไฟล์ .partial กับ .old ค้างข้างเพลง ข้างซับ ข้างหนัง · ตัวกวาดตอนเปิดเดิมกวาดแค่โฟลเดอร์ tmp ของโปรแกรม
//! งานจดไฟล์ก่อนเขียนแล้วลบชื่อออกเมื่อจบ (ตัวจับ Tracked) ทะเบียนเขียนลงไฟล์ inflight.json ทุกครั้งที่เปลี่ยน
//! เปิดโปรแกรมครั้งหน้า (lib.rs เรียก init) ไล่ชื่อที่ค้าง
//! ① Temp ไฟล์ที่ยังเขียนไม่เสร็จ ลบทิ้ง
//! ② Ready ไฟล์ที่เขียนและตรวจครบแล้ว ปลายทางหายไป (ไฟล์เดิมลงถังขยะไปแล้ว) ย้ายเข้าชื่อจริงให้ ปลายทางยังอยู่ ลบไฟล์ทำค้าง
//! ③ Old ไฟล์รุ่นก่อนที่ย้ายหลบ ปลายทางหาย ย้ายกลับที่เดิม ปลายทางมีแล้ว ส่งลงถังขยะ
//! กันลบไฟล์ของผู้ใช้ผิดตัว ชื่อที่ลบหรือย้ายต้องมีคำว่า partial หรือ .old เท่านั้น
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    #[default]
    Temp,
    Ready,
    Old,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Entry {
    pub path: String,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub kind: Kind,
}

struct State {
    file: Option<PathBuf>,
    items: Vec<Entry>,
}

static STATE: Mutex<State> = Mutex::new(State { file: None, items: vec![] });

fn persist(s: &State) {
    let Some(f) = &s.file else { return };
    if let Ok(b) = serde_json::to_vec_pretty(&s.items) {
        let tmp = f.with_extension("json.tmp");
        if std::fs::write(&tmp, b).is_ok() { let _ = std::fs::rename(&tmp, f); }
    }
}

/// ตัวจับไฟล์ที่จดไว้ หลุดขอบเขตแล้วชื่อออกจากทะเบียน (ไม่ลบไฟล์ งานลบหรือย้ายเอง)
pub struct Tracked {
    path: String,
}

impl Tracked {
    /// ไฟล์เขียนและตรวจครบแล้ว ไฟดับหลังจากนี้ ถ้าปลายทางหาย ย้ายเข้าชื่อจริงให้ตอนเปิดครั้งหน้า
    pub fn ready(&self) {
        let mut s = STATE.lock().unwrap();
        if let Some(e) = s.items.iter_mut().find(|e| e.path == self.path) { e.kind = Kind::Ready; }
        persist(&s);
    }
}

impl Drop for Tracked {
    fn drop(&mut self) {
        let mut s = STATE.lock().unwrap();
        let before = s.items.len();
        s.items.retain(|e| e.path != self.path);
        if s.items.len() != before { persist(&s); }
    }
}

/// จดไฟล์ทำค้างก่อนเขียน · target ชื่อจริงที่ไฟล์นี้จะไปแทน
pub fn track(path: &Path, target: Option<&Path>, kind: Kind) -> Tracked {
    let p = path.display().to_string();
    let mut s = STATE.lock().unwrap();
    s.items.retain(|e| e.path != p);
    s.items.push(Entry { path: p.clone(), target: target.map(|t| t.display().to_string()), kind });
    persist(&s);
    Tracked { path: p }
}

/// ชื่อแบบที่โปรแกรมตั้งให้ไฟล์ทำค้างเท่านั้น
fn ours(p: &Path, kind: Kind) -> bool {
    let n = p.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    match kind { Kind::Old => n.contains(".old"), _ => n.contains("partial") }
}

/// ไล่ชื่อที่ค้างจากรอบก่อน คืนประโยคบอกว่าทำอะไรไปบ้าง · Ready ก่อน Old ไฟล์ใหม่ที่เขียนครบได้เข้าที่ก่อนไฟล์รุ่นก่อน
pub fn sweep(items: &[Entry]) -> Vec<String> {
    let mut out = vec![];
    let mut order: Vec<&Entry> = items.iter().collect();
    order.sort_by_key(|e| match e.kind { Kind::Ready => 0, Kind::Temp => 1, Kind::Old => 2 });
    for e in order {
        let p = Path::new(&e.path);
        if !p.is_file() || !ours(p, e.kind) { continue; }
        let target = e.target.as_deref().map(Path::new);
        let gone = target.is_some_and(|t| !t.exists());
        match (e.kind, target) {
            (Kind::Ready | Kind::Old, Some(t)) if gone => match crate::cover::rename::move_no_replace(p, t) {
                Ok(()) => out.push(format!("ย้ายไฟล์ที่ค้างกลับเข้าชื่อจริง {}", t.display())),
                Err(x) => out.push(format!("ย้ายไฟล์ที่ค้างกลับเข้าชื่อจริงไม่สำเร็จ {} ไฟล์ยังอยู่ที่ {}", x.title, p.display())),
            },
            (Kind::Old, _) => {
                if crate::app::outfile::to_trash(p).is_err() { let _ = std::fs::remove_file(p); }
                out.push(format!("ส่งไฟล์รุ่นก่อนที่ค้างลงถังขยะ {}", p.display()));
            }
            _ => {
                if std::fs::remove_file(p).is_ok() { out.push(format!("ลบไฟล์ทำค้าง {}", p.display())); }
            }
        }
    }
    out
}

/// ตอนเปิดโปรแกรม · อ่านทะเบียนของรอบก่อน กวาด แล้วเริ่มทะเบียนใหม่ (โปรแกรมเปิดได้ทีละตัว ตอนนี้ยังไม่มีงานไหนเขียนไฟล์)
pub fn init(file: PathBuf) -> Vec<String> {
    let old: Vec<Entry> = std::fs::read(&file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let notes = sweep(&old);
    let mut s = STATE.lock().unwrap();
    s.file = Some(file);
    s.items.retain(|e| !old.contains(e));
    persist(&s);
    notes
}

/// ชื่อที่ยังจดอยู่ (เทส)
#[cfg(test)]
pub fn pending() -> Vec<Entry> {
    STATE.lock().unwrap().items.clone()
}

#[cfg(test)]
#[path = "inflight_tests.rs"]
mod tests;
