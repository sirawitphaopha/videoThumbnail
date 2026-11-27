//! จำรูปที่กดใช้ไว้ก่อนเปิดรูปใหม่ ยกเลิกหน้าครอปของรูปใหม่แล้วคืน (AUDIT ข้อ 42)
//! แยกจาก mod.rs ตามเกณฑ์ไฟล์ยาว 450 บรรทัด
use super::*;

/// รูปเดิม ไบต์ที่กดใช้ และไฟล์ภาพตัวอย่างของหน้าครอปเดิม
pub(super) struct Prev {
    source: Source,
    chosen: (Vec<u8>, String),
    src_preview: Option<PathBuf>,
}

impl PosterState {
    /// ทิ้งรูปที่จำไว้คืน พร้อมลบภาพตัวอย่างของมัน
    pub(super) fn drop_prev(&self) {
        if let Some(p) = self.prev.lock().unwrap().take() {
            if let Some(f) = p.src_preview {
                let _ = std::fs::remove_file(f);
            }
        }
    }
    /// ก่อนเปิดรูปใหม่ในหน้าใส่โปสเตอร์ · มีรูปที่กดใช้อยู่ จำทั้งรูปเดิม ไบต์ และภาพตัวอย่างไว้คืน
    /// ไม่มีรูปที่กดใช้ (เปิดรูปใหม่ซ้อนจากหน้าครอปที่ยังไม่กดใช้) คงของที่จำไว้เดิม ทิ้งรูปที่ยังไม่ได้ใช้
    pub(super) fn stash_for_open(&self) {
        let chosen = self.chosen.lock().unwrap().take();
        let source = self.source.lock().unwrap().take();
        if let (Some(chosen), Some(source)) = (chosen, source) {
            self.drop_prev();
            let src_preview = self.previews.lock().unwrap().remove("src");
            *self.prev.lock().unwrap() = Some(Prev { source, chosen, src_preview });
        }
    }
    /// คืนรูปที่จำไว้ · ไม่มีอะไรให้คืนตอบ false
    pub(super) fn restore_prev(&self) -> bool {
        let Some(p) = self.prev.lock().unwrap().take() else { return false };
        *self.rendered.lock().unwrap() = None;
        *self.source.lock().unwrap() = Some(p.source);
        *self.chosen.lock().unwrap() = Some(p.chosen);
        if let Some(f) = p.src_preview {
            self.keep_preview("src", f);
        }
        true
    }
}
