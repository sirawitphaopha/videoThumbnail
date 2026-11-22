//! เทสของ jobs.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
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
