//! เทสของ hashes.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;
use std::path::PathBuf;

fn tmp(name: &str, body: &[u8]) -> PathBuf {
    let d = std::env::temp_dir().join(format!("ชั้นหนัง-hash-{}", std::process::id()));
    std::fs::create_dir_all(&d).unwrap();
    let p = d.join(name);
    std::fs::write(&p, body).unwrap();
    p
}
fn all() -> Vec<String> {
    ALGOS.iter().map(|s| s.to_string()).collect()
}
fn run(p: &Path) -> Hashes {
    match compute(p, &all(), &|_, _| {}, &|| false).unwrap() { Outcome::Done(h) => h, Outcome::Cancelled => panic!() }
}

#[test]
fn known_vectors_for_abc() {
    // ค่ามาตรฐานของข้อความ abc (RFC 1321 · FIPS 180) · CRC32 ตัวพิมพ์ใหญ่
    let h = run(&tmp("abc.txt", b"abc"));
    assert_eq!(h.md5.as_deref(), Some("900150983cd24fb0d6963f7d28e17f72"));
    assert_eq!(h.sha1.as_deref(), Some("a9993e364706816aba3e25717850c26c9cd0d89d"));
    assert_eq!(h.sha256.as_deref(), Some("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
    assert_eq!(h.crc32.as_deref(), Some("352441C2"));
    assert_eq!(h.sha512.as_deref(), Some("ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"));
    assert_eq!(h.bytes, 3);
}

#[test]
fn only_ticked_algorithms_and_cancel() {
    let p = tmp("เลือกบางแบบ.bin", &vec![7u8; 9 << 20]);
    let Outcome::Done(h) = compute(&p, &["sha256".into(), "crc32".into()], &|_, _| {}, &|| false).unwrap() else { panic!() };
    assert!(h.sha256.is_some() && h.crc32.is_some() && h.md5.is_none() && h.sha1.is_none() && h.sha512.is_none());
    assert!(matches!(compute(&p, &all(), &|_, _| {}, &|| true).unwrap(), Outcome::Cancelled), "กดหยุดต้องหยุดทันที");
}

#[test]
fn matches_windows_get_filehash() {
    // ตัวคำนวณของ Windows (Get-FileHash) กับไฟล์หนังทดสอบชื่อไทย · CRC32 Windows ไม่มี ใช้ค่ามาตรฐานข้างบน
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("test-media").join("สร้าง").join("หนัง").join("ดาวเหนือ (2023).mkv");
    assert!(p.exists(), "ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน");
    let h = run(&p);
    for (alg, mine) in [("MD5", &h.md5), ("SHA1", &h.sha1), ("SHA256", &h.sha256), ("SHA512", &h.sha512)] {
        let out = std::process::Command::new("powershell").args(["-NoProfile", "-Command", &format!("(Get-FileHash -Algorithm {alg} -LiteralPath $env:HASH_FILE).Hash")])
            .env("HASH_FILE", &p).output().unwrap();
        let win = String::from_utf8_lossy(&out.stdout).trim().to_lowercase();
        assert_eq!(Some(win.as_str()), mine.as_deref(), "{alg} ไม่ตรงกับ Windows");
    }
}

#[test]
fn compare_tells_algorithm_and_difference() {
    let h = run(&tmp("เทียบ.txt", b"abc"));
    let ok = compare("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  ดาวเหนือ.mkv", &h);
    assert_eq!((ok.algo.as_deref(), ok.same), (Some("SHA-256"), true));
    let bad = compare("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ff", &h);
    assert_eq!((bad.same, bad.diff.as_deref()), (false, Some("ต่างกันที่ 2 ตัวท้าย")));
    // AUDIT ข้อ 128 · ต่างที่ตัว 62 กับ 64 มีสองตัว อยู่ในสามตัวท้าย · ต่างที่ตัว 1 กับ 3 อยู่ในสามตัวแรก
    let gap = compare("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f2001fae", &h);
    assert_eq!(gap.diff.as_deref(), Some("ต่างกัน 2 ตัว อยู่ใน 3 ตัวท้าย"));
    let head = compare("0a0816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", &h);
    assert_eq!(head.diff.as_deref(), Some("ต่างกัน 2 ตัว อยู่ใน 3 ตัวแรก"));
    assert_eq!(compare("352441c2", &h).algo.as_deref(), Some("CRC32"));
    assert!(compare("352441c2", &h).same);
    assert_eq!(compare("xyz", &h).algo, None);
}

#[test]
fn save_never_overwrites() {
    let p = tmp("หนัง (2020).mkv", b"x");
    let a = save_sha256(&p, "aa", None, false).unwrap();
    assert_eq!(a.status, "saved");
    assert_eq!(std::fs::read_to_string(&a.path).unwrap(), "aa *หนัง (2020).mkv\n");
    // ค่าเดิมซ้ำ ไม่สร้างไฟล์ (2) (BUGS ข้อ 30) · ตัวพิมพ์ใหญ่เล็กถือว่าตรงกัน
    let again = save_sha256(&p, "AA", None, false).unwrap();
    assert_eq!((again.status, again.path.as_str()), ("exists", a.path.as_str()));
    // ค่าไม่ตรง ไม่เขียนอะไร ตอบ conflict ให้ถามก่อน
    let diff = save_sha256(&p, "bb", None, false).unwrap();
    assert_eq!(diff.status, "conflict");
    assert_eq!(std::fs::read_to_string(&a.path).unwrap(), "aa *หนัง (2020).mkv\n", "ไฟล์ .sha256 ที่มีอยู่ต้องไม่โดนทับ");
    // ผู้ใช้ตอบว่าสร้างชื่อใหม่ ได้ (2) ไฟล์เดิมไม่โดนแตะ
    let b = save_sha256(&p, "bb", None, true).unwrap();
    assert_eq!(b.status, "saved");
    assert!(b.path.ends_with("หนัง (2020).mkv (2).sha256"), "{}", b.path);
    assert_eq!(std::fs::read_to_string(&b.path).unwrap(), "bb *หนัง (2020).mkv\n");
    // ที่ที่ผู้ใช้เลือกเอง ใช้ชื่อนั้น ในไฟล์ยังเขียนชื่อไฟล์หนัง
    let pick = p.parent().unwrap().join("เลือกเอง.sha256");
    let c = save_sha256(&p, "cc", Some(&pick), false).unwrap();
    assert_eq!((c.status, c.path.as_str()), ("saved", pick.to_string_lossy().as_ref()));
    assert_eq!(std::fs::read_to_string(&pick).unwrap(), "cc *หนัง (2020).mkv\n");
    let c2 = save_sha256(&p, "dd", Some(&pick), true).unwrap();
    assert!(c2.path.ends_with("เลือกเอง (2).sha256"), "{}", c2.path);
}
