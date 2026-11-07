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
    /// งานยาวเช็กตัวนี้เป็นระยะว่าโดนสั่งหยุดตอนปิดโปรแกรมไหม
    pub fn cancelled(&self) -> bool {
        self.cancel_all.load(Ordering::SeqCst)
    }
}

#[tauri::command]
pub fn running_jobs(jobs: State<'_, Arc<Jobs>>) -> usize {
    jobs.count()
}

/// ผู้ใช้ยืนยันในหน้าต่างถามแล้วว่าปิดเลย · สั่งทุกงานหยุด รอให้งานหยุดเองและลบไฟล์ .partial ของตัวเอง แล้วค่อยปิดโปรแกรม
/// เดิมปิดทันที งานโดนฆ่ากลางทาง ไฟล์ .partial ขนาดเกือบเท่าหนังค้างข้างไฟล์หนัง และถ้าตรงจังหวะ mkvpropedit กำลังเขียนรูปแนบ
/// เครื่องมือโดนฆ่ากลางการเขียนไฟล์เดิม (ผู้ช่วยตรวจโค้ดเจอ) · mkvpropedit ไม่ฟังตัวหยุด รอจนเขียนเสร็จ (ไม่กี่วินาที)
/// รอไม่เกิน WAIT_EXIT งานที่ค้างนานกว่านั้นปิดตามเดิม
const WAIT_EXIT: std::time::Duration = std::time::Duration::from_secs(20);

#[tauri::command]
pub fn force_close(app: AppHandle, jobs: State<'_, Arc<Jobs>>) {
    jobs.cancel_all.store(true, Ordering::SeqCst);
    jobs.force_exit.store(true, Ordering::SeqCst);
    let jobs = jobs.inner().clone();
    std::thread::spawn(move || {
        wait_idle(&jobs, WAIT_EXIT);
        app.exit(0);
    });
}

/// รอจนไม่มีงาน หรือครบเวลา · คืนว่างานหมดไหม
fn wait_idle(jobs: &Jobs, limit: std::time::Duration) -> bool {
    let t0 = std::time::Instant::now();
    while jobs.count() > 0 {
        if t0.elapsed() >= limit { return false; }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    true
}

/// งานปลอมไว้เทสตัวกันปิด มีเฉพาะตอนทดสอบ ตัวติดตั้งจริงไม่มีคำสั่งนี้
#[cfg(debug_assertions)]
#[tauri::command]
pub fn dev_fake_job(jobs: State<'_, Arc<Jobs>>, seconds: u64) {
    let g = jobs.start();
    let j = jobs.inner().clone();
    // ฟังตัวหยุดเหมือนงานจริง ทุก 100 ms · ปิดโปรแกรมแล้วงานปลอมจบเอง ไม่ต้องรอครบ 20 วินาที
    std::thread::spawn(move || {
        let t0 = std::time::Instant::now();
        while t0.elapsed().as_secs() < seconds && !j.cancelled() {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
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

    /// ปิดโปรแกรมรองานหยุดเองก่อน · งานจบในเวลา คืนจริง · งานค้างเกินเวลา คืนเท็จ (ปิดตามเดิม)
    #[test]
    fn wait_idle_waits_for_jobs_to_finish() {
        let jobs = Arc::new(Jobs::default());
        let g = jobs.start();
        let j2 = jobs.clone();
        let t = std::thread::spawn(move || wait_idle(&j2, std::time::Duration::from_secs(5)));
        std::thread::sleep(std::time::Duration::from_millis(300));
        drop(g);
        assert!(t.join().unwrap(), "งานจบแล้วต้องเลิกรอ");
        let _g = jobs.start();
        assert!(!wait_idle(&jobs, std::time::Duration::from_millis(250)), "งานค้างเกินเวลาต้องเลิกรอ");
    }

    #[test]
    fn force_exit_allows_close_with_jobs() {
        let jobs = Arc::new(Jobs::default());
        let _g = jobs.start();
        jobs.force_exit.store(true, Ordering::SeqCst);
        assert!(jobs.may_close());
    }
}
