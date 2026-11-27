//! กราฟเสียง เขียนไฟล์รูปกับตาราง · แยกจาก audiograph/mod.rs ตามเกณฑ์ไฟล์ยาว 450 บรรทัด (AUDIT ข้อ 112) ย้ายมาทั้งก้อน
use super::*;

/// เขียนไฟล์ตามที่ขอ · replace คนกดยืนยันเขียนทับในกล่องของ Windows แล้ว เขียนลงไฟล์ชั่วคราวข้างกันแล้วย้ายทับ ไฟล์เดิมไม่ค้างครึ่งไฟล์
/// ไม่ replace ชื่อชนต่อท้าย (2) แบบเดิม (AUDIT ข้อ 112 · เดิมเปลี่ยนชื่อเองทุกครั้ง กดเขียนทับแล้วได้ไฟล์ชื่อใหม่)
pub(crate) fn write_out(want: &Path, data: &[u8], replace: bool) -> Result<String, String> {
    if !replace {
        return write_unique(want, data);
    }
    let tmp = want.with_extension(format!("{}.tmp-{}", want.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default(), std::process::id()));
    std::fs::write(&tmp, data).map_err(|e| format!("บันทึกไม่ได้: {e}"))?;
    std::fs::rename(&tmp, want).map_err(|e| { let _ = std::fs::remove_file(&tmp); format!("บันทึกทับไฟล์เดิมไม่ได้: {e}") })?;
    Ok(want.display().to_string())
}

/// เขียนไฟล์ใหม่ ชื่อชนต่อท้าย (2) ไม่เขียนทับ · คืนที่อยู่จริง
pub(crate) fn write_unique(want: &Path, data: &[u8]) -> Result<String, String> {
    let stem = want.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "กราฟเสียง".into());
    let ext = want.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    let dir = want.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let mut target = want.to_path_buf();
    let mut i = 2;
    while target.exists() {
        target = dir.join(format!("{stem} ({i}){ext}"));
        i += 1;
    }
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(|e| format!("บันทึกไม่ได้: {e}"))?;
    std::io::Write::write_all(&mut f, data).map_err(|e| format!("บันทึกไม่ได้: {e}"))?;
    Ok(target.display().to_string())
}
