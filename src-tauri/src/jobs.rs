//! ตัวนับงานที่กำลังรัน กับตัวกันปิดโปรแกรมตอนงานยังไม่จบ (TECH-REVIEW ข้อ 7 · แผนขั้น 1)
//! งานทุกชิ้นที่แตะไฟล์หนัง (ครอบ MKV ส่งออก MP4 แยกไฟล์ hash ตรวจไฟล์ เปลี่ยนชื่อ) ต้องถือ `JobGuard` ตลอดงาน
//! ปิดหน้าต่างหรือโปรแกรมตอนมีงาน = ไม่ปิด ส่งเหตุการณ์ `close-blocked` ให้หน้าจอขึ้นหน้าต่างถาม
//! ผู้ใช้กดยืนยันแล้วค่อยเรียก `force_close`
//! 🔴 หน้าจอไม่มีสิทธิ์ destroy หน้าต่าง ทางเดียวที่ปิดตอนมีงานได้คือ `force_close` ฝั่งนี้

use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, State};

#[derive(Default)]
pub struct Jobs {
    running: AtomicUsize,
    /// ผู้ใช้ยืนยันแล้วว่าปิดได้ แม้มีงาน
    force_exit: AtomicBool,
    /// สั่งหยุดทุกงาน งานยาวต้องเช็กตัวนี้เป็นระยะ แล้วลบไฟล์ .partial ของตัวเองก่อนจบ
    cancel_all: AtomicBool,
}

/// ถือไว้ตลอดงาน หลุดจากขอบเขตเมื่อไหร่ ตัวนับลดเอง แม้งานพังกลางทาง
pub struct JobGuard(Arc<Jobs>);

impl Drop for JobGuard {
    fn drop(&mut self) {
        self.0.running.fetch_sub(1, Ordering::SeqCst);
    }
}

impl Jobs {
    pub fn start(self: &Arc<Self>) -> JobGuard {
        self.running.fetch_add(1, Ordering::SeqCst);
        JobGuard(self.clone())
    }
    pub fn count(&self) -> usize {
        self.running.load(Ordering::SeqCst)
    }
    /// ปิดได้ไหมตอนนี้ · ไม่มีงาน หรือผู้ใช้ยืนยันแล้ว
    pub fn may_close(&self) -> bool {
        self.count() == 0 || self.force_exit.load(Ordering::SeqCst)
    }
    #[allow(dead_code)] // งานยาวขั้น 2 ขึ้นไปใช้เช็กว่าโดนสั่งหยุดไหม
    pub fn cancelled(&self) -> bool {
        self.cancel_all.load(Ordering::SeqCst)
    }
}

#[tauri::command]
pub fn running_jobs(jobs: State<'_, Arc<Jobs>>) -> usize {
    jobs.count()
}

/// ผู้ใช้ยืนยันในหน้าต่างถามแล้วว่าปิดเลย · สั่งทุกงานหยุด แล้วปิดโปรแกรม
#[tauri::command]
pub fn force_close(app: AppHandle, jobs: State<'_, Arc<Jobs>>) {
    jobs.cancel_all.store(true, Ordering::SeqCst);
    jobs.force_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}

/// งานปลอมไว้เทสตัวกันปิด มีเฉพาะตอนทดสอบ ตัวติดตั้งจริงไม่มีคำสั่งนี้
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_fake_job(jobs: State<'_, Arc<Jobs>>, seconds: u64) {
    let g = jobs.start();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(seconds));
        drop(g);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_counts_and_releases_even_on_panic() {
        let jobs = Arc::new(Jobs::default());
        assert!(jobs.may_close());
        let g = jobs.start();
        let g2 = jobs.start();
        assert_eq!(jobs.count(), 2);
        assert!(!jobs.may_close(), "มีงานอยู่ต้องปิดไม่ได้");
        drop(g);
        let j2 = jobs.clone();
        let r = std::thread::spawn(move || { let _g = j2.start(); panic!("งานพังกลางทาง"); }).join();
        assert!(r.is_err());
        assert_eq!(jobs.count(), 1, "งานที่พังต้องคืนตัวนับ");
        drop(g2);
        assert!(jobs.may_close());
    }

    #[test]
    fn force_exit_allows_close_with_jobs() {
        let jobs = Arc::new(Jobs::default());
        let _g = jobs.start();
        jobs.force_exit.store(true, Ordering::SeqCst);
        assert!(jobs.may_close());
    }
}
