//! กราฟเสียง เก็บผลภาพรวมไว้ในเครื่อง ไม่ต้องอ่านเสียงใหม่ทุกครั้ง
//! แยกจาก audiograph/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

/* ---------- เก็บผลภาพรวมลงเครื่อง (คิว 8) ----------
   พี่กัน 7 พ.ย. 2569 *"ไฟล์ไหนที่แปลงคลื่นเเล้ว มันต้องรันใหม่ทุกครั้งเลยไหม มันเเบบรันครั้เดียวเเล้วดูตลอดได้มั้ย เเบบบันทึกข้อมูลไว้นเครื่องี้"*
   เดิมจำไว้ในหน่วยความจำอย่างเดียว ปิดโปรแกรมแล้วต้องอ่านใหม่ (หนัง 20 นาที 5.1 ราว 14 วินาที)
   ไฟล์ละหนึ่งไฟล์ในโฟลเดอร์ graphcache ของโปรแกรม ชื่อจาก hash ของที่อยู่ แทร็ก ขนาด เวลาแก้ไฟล์ · ไฟล์หนังเปลี่ยนแล้วชื่อไม่ตรง ไม่ใช้ผลเก่า
   รวมกันเกิน 300 MB ลบอันที่ไม่ได้ใช้นานที่สุดก่อน · หน้าตั้งค่าบอกขนาดและล้างได้ */
const CACHE_VER: u32 = 2;
pub(crate) const CACHE_LIMIT: u64 = 300 * 1024 * 1024;

#[derive(Serialize, Deserialize)]
struct Cached {
    ver: u32,
    key: String,
    o: Overview,
}

pub(crate) fn cache_dir(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_local_data_dir().ok().map(|d| d.join("graphcache"))
}

pub(crate) fn cache_file(dir: &Path, key: &str) -> std::path::PathBuf {
    let h = Sha256::digest(key.as_bytes());
    dir.join(format!("{}.json", h.iter().take(16).map(|b| format!("{b:02x}")).collect::<String>()))
}

/// อ่านผลที่เก็บไว้ · ชื่อไม่ตรง รุ่นไม่ตรง หรือไฟล์เสีย = ไม่มี (อ่านเสียงใหม่ตามปกติ) · อ่านได้แตะเวลาไฟล์ ไว้ลบอันที่ไม่ได้ใช้นานก่อน
pub(crate) fn disk_load(dir: &Path, key: &str) -> Option<Overview> {
    let f = cache_file(dir, key);
    let c: Cached = serde_json::from_slice(&std::fs::read(&f).ok()?).ok()?;
    if c.ver != CACHE_VER || c.key != key { return None; }
    let _ = std::fs::File::options().write(true).open(&f).and_then(|h| h.set_modified(std::time::SystemTime::now()));
    Some(c.o)
}

/// เขียนแบบไฟล์ชั่วคราวแล้วเปลี่ยนชื่อ ปิดโปรแกรมกลางทางไม่ได้ไฟล์ครึ่ง ๆ · แล้วตัดให้รวมไม่เกินขนาดที่กำหนด
pub(crate) fn disk_save(dir: &Path, key: &str, o: &Overview, limit: u64) {
    if std::fs::create_dir_all(dir).is_err() { return; }
    let f = cache_file(dir, key);
    let tmp = f.with_extension("tmp");
    let Ok(bytes) = serde_json::to_vec(&Cached { ver: CACHE_VER, key: key.to_string(), o: o.clone() }) else { return };
    if std::fs::write(&tmp, &bytes).is_ok() && std::fs::rename(&tmp, &f).is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    prune(dir, limit);
}

/// รวมเกินขนาด ลบไฟล์ที่ใช้ล่าสุดนานที่สุดก่อน · ลบเฉพาะไฟล์ .json ในโฟลเดอร์ของโปรแกรมเอง
pub(crate) fn prune(dir: &Path, limit: u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    let mut files: Vec<(std::time::SystemTime, u64, std::path::PathBuf)> = rd.flatten()
        .filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false))
        .filter_map(|e| { let m = e.metadata().ok()?; Some((m.modified().ok()?, m.len(), e.path())) }).collect();
    let mut total: u64 = files.iter().map(|f| f.1).sum();
    files.sort_by_key(|f| f.0);
    for (_, len, p) in files {
        if total <= limit { break; }
        if std::fs::remove_file(&p).is_ok() { total -= len; }
    }
}

/// จำนวนไฟล์กับขนาดรวมของผลที่เก็บไว้ · หน้าตั้งค่าใช้
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheInfo { pub(crate) files: u32, pub(crate) bytes: u64 }

pub(crate) fn cache_info_in(dir: &Path) -> CacheInfo {
    let mut ci = CacheInfo { files: 0, bytes: 0 };
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten().filter(|e| e.path().extension().map(|x| x == "json").unwrap_or(false)) {
            ci.files += 1;
            ci.bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    ci
}
