use super::*;

fn tmpdir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-inflight-{tag}-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn e(path: &Path, target: Option<&Path>, kind: Kind) -> Entry {
    Entry { path: path.display().to_string(), target: target.map(|t| t.display().to_string()), kind }
}

/// BUGS ข้อ 162.4 · ไฟล์ทำค้างแต่ละแบบหลังไฟดับ
#[test]
fn sweep_cleans_or_restores_by_kind() {
    let d = tmpdir("sweep");
    // ① ยังเขียนไม่เสร็จ ลบ
    let temp = d.join("เพลง.partial-123.flac");
    std::fs::write(&temp, b"half").unwrap();
    // ② เขียนครบแล้ว ไฟล์เดิมลงถังขยะไปแล้ว ย้ายเข้าชื่อจริง
    let sub = d.join("เรื่อง.th.srt");
    let ready = d.join("เรื่อง.th.srt.123.partial");
    std::fs::write(&ready, b"new").unwrap();
    // ② เขียนครบแล้ว แต่ไฟล์เดิมยังอยู่ ลบไฟล์ทำค้าง ไฟล์เดิมไม่แตะ
    let kept = d.join("คงเดิม.srt");
    std::fs::write(&kept, b"orig").unwrap();
    let ready2 = d.join("คงเดิม.srt.9.partial");
    std::fs::write(&ready2, b"new").unwrap();
    // ③ ปกรุ่นก่อนที่ย้ายหลบ ปกปลายทางหาย ย้ายกลับ
    let poster = d.join("หนัง-poster.jpg");
    let old = d.join("หนัง-poster.55.old");
    std::fs::write(&old, b"oldcover").unwrap();
    // ชื่อที่ไม่ใช่แบบของโปรแกรม ห้ามแตะ แม้อยู่ในทะเบียน
    let user = d.join("ไฟล์ผู้ใช้.mkv");
    std::fs::write(&user, b"movie").unwrap();
    let notes = sweep(&[
        e(&old, Some(&poster), Kind::Old),
        e(&temp, None, Kind::Temp),
        e(&ready, Some(&sub), Kind::Ready),
        e(&ready2, Some(&kept), Kind::Ready),
        e(&user, None, Kind::Temp),
        e(&d.join("หายไปแล้ว.partial"), None, Kind::Temp),
    ]);
    assert!(!temp.exists(), "ไฟล์ที่ยังเขียนไม่เสร็จต้องถูกลบ");
    assert_eq!(std::fs::read(&sub).unwrap(), b"new", "ไฟล์ที่เขียนครบแล้วต้องเข้าชื่อจริง");
    assert!(!ready.exists());
    assert_eq!(std::fs::read(&kept).unwrap(), b"orig", "ไฟล์เดิมที่ยังอยู่ห้ามโดนทับ");
    assert!(!ready2.exists());
    assert_eq!(std::fs::read(&poster).unwrap(), b"oldcover", "ปกรุ่นก่อนต้องกลับที่เดิม");
    assert!(user.exists(), "ชื่อที่ไม่ใช่ไฟล์ทำค้างห้ามลบ");
    assert_eq!(notes.len(), 4, "{notes:?}");
    let _ = std::fs::remove_dir_all(&d);
}

/// ไฟล์ใหม่เขียนครบแล้ว ปกรุ่นก่อนก็ยังค้าง · ไฟล์ใหม่เข้าที่ก่อน แล้วปกรุ่นก่อนไม่ทับ
#[test]
fn ready_wins_over_old() {
    let d = tmpdir("order");
    let poster = d.join("หนัง-poster.jpg");
    let temp = d.join("หนัง-poster.1.partial");
    let old = d.join("หนัง-poster.2.old");
    std::fs::write(&temp, b"new").unwrap();
    std::fs::write(&old, b"old").unwrap();
    sweep(&[e(&old, Some(&poster), Kind::Old), e(&temp, Some(&poster), Kind::Ready)]);
    assert_eq!(std::fs::read(&poster).unwrap(), b"new");
    assert!(!old.exists() && !temp.exists());
    let _ = std::fs::remove_dir_all(&d);
}

/// จดแล้วหลุดขอบเขต ชื่อออกจากทะเบียน · ready เปลี่ยนแบบ · init กวาดของรอบก่อนแล้วเริ่มทะเบียนใหม่
#[test]
fn track_ready_drop_and_init() {
    let d = tmpdir("ledger");
    let a = d.join("a.partial");
    {
        let t = track(&a, Some(&d.join("a")), Kind::Temp);
        assert!(pending().iter().any(|x| x.path == a.display().to_string() && x.kind == Kind::Temp));
        t.ready();
        assert!(pending().iter().any(|x| x.path == a.display().to_string() && x.kind == Kind::Ready));
    }
    assert!(!pending().iter().any(|x| x.path == a.display().to_string()), "จบงานแล้วชื่อต้องออก");
    // ทะเบียนที่ค้างจากรอบก่อน (ไฟดับ) init กวาดแล้วไฟล์ทะเบียนว่าง
    let ledger = d.join("inflight.json");
    let left = d.join("ค้าง.partial-1.mp3");
    std::fs::write(&left, b"x").unwrap();
    std::fs::write(&ledger, serde_json::to_vec(&vec![e(&left, None, Kind::Temp)]).unwrap()).unwrap();
    let notes = init(ledger.clone());
    assert!(!left.exists());
    assert_eq!(notes.len(), 1);
    let now: Vec<Entry> = serde_json::from_slice(&std::fs::read(&ledger).unwrap()).unwrap();
    assert!(!now.iter().any(|x| x.path == left.display().to_string()));
    let _ = std::fs::remove_dir_all(&d);
}
