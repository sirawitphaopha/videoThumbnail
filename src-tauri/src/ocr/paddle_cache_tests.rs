use super::*;

static A: Slot<u32> = OnceLock::new();
fn rel() { clear(&A); }

/// BUGS ข้อ 162.7 · เก็บไม่เกินสองตัวล่าสุด ตัวที่ใช้ซ้ำขึ้นหน้า ปล่อยแล้วว่าง Arc ที่ถืออยู่ยังใช้ได้
#[test]
fn keeps_two_latest_and_releases() {
    on_release(rel);
    let loads = std::cell::Cell::new(0);
    let get = |k: &str, v: u32| cached(&A, Path::new(k), || { loads.set(loads.get() + 1); Ok(v) }).unwrap();
    assert_eq!(*get("a", 1), 1);
    assert_eq!(*get("b", 2), 2);
    assert_eq!(*get("a", 9), 1, "ตัวที่โหลดแล้วใช้ซ้ำ ไม่โหลดใหม่");
    assert_eq!(loads.get(), 2);
    let held = get("c", 3);
    assert_eq!(count(&A), KEEP, "เก็บไม่เกินสองตัว");
    // b ใช้นานสุดจึงหลุด a ยังอยู่เพราะเพิ่งใช้
    assert_eq!(*get("a", 9), 1);
    assert_eq!(loads.get(), 3);
    assert_eq!(*get("b", 22), 22, "ตัวที่หลุดแล้วโหลดใหม่");
    assert_eq!(loads.get(), 4);
    release_all();
    assert_eq!(count(&A), 0, "ปล่อยแล้วตัวเก็บว่าง");
    assert_eq!(*held, 3, "Arc ที่งานถือไว้ยังใช้ได้หลังปล่อย");
    // โหลดไม่สำเร็จไม่เก็บ ลองใหม่ได้
    assert!(cached(&A, Path::new("x"), || Err::<u32, String>("พัง".into())).is_err());
    assert_eq!(*cached(&A, Path::new("x"), || Ok(7)).unwrap(), 7);
    assert_eq!(IDLE, Duration::from_secs(180));
}
