//! ค่า hash ของไฟล์หนัง (แผนขั้น 5 · สเปกข้อ 6 ค่า hash)
//! MD5 · SHA-1 · SHA-256 · CRC32 · SHA-512 อ่านไฟล์รอบเดียวคิดพร้อมกันทุกแบบที่ติ๊ก · กดหยุดได้ · บอกความคืบหน้า
//! CRC32 ตัวพิมพ์ใหญ่ ที่เหลือตัวเล็ก (สเปก) · SHA-256 จดไว้ในคลังใช้ตอนตรวจแบบเร็ว
//! วางค่าที่ได้มา บอกว่าตรงกับแบบไหน ต่างตรงไหน · บันทึกไฟล์ .sha256 ข้างไฟล์หนัง ไม่เขียนทับไฟล์ที่มีอยู่

use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};

use md5::Digest as _;
use serde::{Deserialize, Serialize};

#[cfg_attr(not(test), allow(dead_code))]
pub const ALGOS: [&str; 5] = ["md5", "sha1", "sha256", "crc32", "sha512"];

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hashes {
    pub md5: Option<String>,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub crc32: Option<String>,
    pub sha512: Option<String>,
    pub bytes: u64,
    pub seconds: f64,
}

pub enum Outcome {
    Done(Hashes),
    Cancelled,
}

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// คิดค่า hash ที่เลือก อ่านไฟล์รอบเดียว ทีละ 4 MB · on = (อ่านไปแล้ว, ทั้งหมด) ไม่เกิน 10 ครั้งต่อวินาที · stop = กดหยุด
pub fn compute(path: &Path, algos: &[String], on: &dyn Fn(u64, u64), stop: &dyn Fn() -> bool) -> Result<Outcome, String> {
    let want = |a: &str| algos.iter().any(|x| x == a);
    let mut f = std::fs::File::open(path).map_err(|e| format!("เปิดไฟล์ไม่ได้: {e}"))?;
    let total = f.metadata().map(|m| m.len()).unwrap_or(0);
    let mut md5 = want("md5").then(md5::Md5::new);
    let mut sha1 = want("sha1").then(sha1::Sha1::new);
    let mut sha256 = want("sha256").then(sha2::Sha256::new);
    let mut sha512 = want("sha512").then(sha2::Sha512::new);
    let mut crc = want("crc32").then(crc32fast::Hasher::new);
    let mut buf = vec![0u8; 4 << 20];
    let (t0, mut last, mut done) = (Instant::now(), Instant::now(), 0u64);
    loop {
        if stop() {
            return Ok(Outcome::Cancelled);
        }
        let n = f.read(&mut buf).map_err(|e| format!("อ่านไฟล์ไม่ได้: {e}"))?;
        if n == 0 {
            break;
        }
        let b = &buf[..n];
        if let Some(h) = md5.as_mut() { h.update(b); }
        if let Some(h) = sha1.as_mut() { h.update(b); }
        if let Some(h) = sha256.as_mut() { h.update(b); }
        if let Some(h) = sha512.as_mut() { h.update(b); }
        if let Some(h) = crc.as_mut() { h.update(b); }
        done += n as u64;
        if last.elapsed() >= Duration::from_millis(100) {
            last = Instant::now();
            on(done, total);
        }
    }
    on(done, total);
    Ok(Outcome::Done(Hashes {
        md5: md5.map(|h| hex(&h.finalize())),
        sha1: sha1.map(|h| hex(&h.finalize())),
        sha256: sha256.map(|h| hex(&h.finalize())),
        sha512: sha512.map(|h| hex(&h.finalize())),
        crc32: crc.map(|h| format!("{:08X}", h.finalize())),
        bytes: done,
        seconds: t0.elapsed().as_secs_f64(),
    }))
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Compare {
    /// แบบที่ความยาวตรงกับค่าที่วาง เช่น SHA-256
    pub algo: Option<String>,
    pub same: bool,
    /// ไม่ตรง บอกว่าต่างตรงไหน เช่น ต่างกันที่ 2 ตัวท้าย
    pub diff: Option<String>,
}

pub fn label(a: &str) -> &'static str {
    match a { "md5" => "MD5", "sha1" => "SHA-1", "sha256" => "SHA-256", "crc32" => "CRC32", _ => "SHA-512" }
}

/// เทียบค่าที่วางมากับค่าที่คิดได้ · เลือกแบบจากความยาว · ไม่สนตัวพิมพ์เล็กใหญ่ ช่องว่าง ชื่อไฟล์ที่ติดมา
pub fn compare(pasted: &str, h: &Hashes) -> Compare {
    let p: String = pasted.split_whitespace().next().unwrap_or("").trim_start_matches('*').to_lowercase();
    let algo = match p.len() { 32 => "md5", 40 => "sha1", 64 => "sha256", 8 => "crc32", 128 => "sha512", _ => "" };
    let mine = match algo { "md5" => &h.md5, "sha1" => &h.sha1, "sha256" => &h.sha256, "crc32" => &h.crc32, "sha512" => &h.sha512, _ => &None };
    let Some(mine) = mine.as_ref().map(|m| m.to_lowercase()) else {
        return Compare { algo: (!algo.is_empty()).then(|| label(algo).to_string()), same: false, diff: None };
    };
    if mine == p {
        return Compare { algo: Some(label(algo).into()), same: true, diff: None };
    }
    let a: Vec<char> = p.chars().collect();
    let b: Vec<char> = mine.chars().collect();
    let first = a.iter().zip(&b).position(|(x, y)| x != y).unwrap_or(0);
    let last = a.iter().rev().zip(b.iter().rev()).position(|(x, y)| x != y).unwrap_or(0);
    let count = a.iter().zip(&b).filter(|(x, y)| x != y).count();
    let diff = if count <= 3 && first >= a.len() - 3 {
        format!("ต่างกันที่ {} ตัวท้าย", a.len() - first)
    } else if count <= 3 && last >= a.len() - 3 {
        format!("ต่างกันที่ {} ตัวแรก", a.len() - last)
    } else {
        format!("ต่างกัน {count} ตัว เริ่มต่างที่ตัวที่ {}", first + 1)
    };
    Compare { algo: Some(label(algo).into()), same: false, diff: Some(diff) }
}

/// ผลบันทึกไฟล์ .sha256 · saved สร้างใหม่ · exists มีไฟล์ชื่อนี้ที่ค่าตรงกันอยู่แล้ว ไม่สร้างซ้ำ · conflict มีไฟล์ชื่อนี้แต่ค่าไม่ตรง ยังไม่เขียน ให้หน้าจอถามก่อน
#[derive(Debug, serde::Serialize, PartialEq)]
pub struct HashSaved {
    pub path: String,
    pub status: &'static str,
}

/// ค่า hash ตัวแรกในไฟล์ .sha256 · รูปแบบ "<ค่า> *<ชื่อไฟล์>" หรือค่าเดี่ยว ๆ
fn first_hash(body: &str) -> Option<String> {
    body.split_whitespace().next().map(|t| t.trim_start_matches('\u{feff}').to_ascii_lowercase())
}

/// ไฟล์ .sha256 แบบที่ sha256sum ของ Linux และ 7-Zip อ่านได้ · target ว่าง = ข้างไฟล์หนัง ชื่อ <ไฟล์หนัง>.sha256 · ที่ผู้ใช้เลือกในหน้าต่างบันทึกส่งมาทาง target
/// มีไฟล์ชื่อนี้อยู่แล้ว ค่าตรงกัน ไม่สร้างซ้ำ (BUGS ข้อ 30 เดิมกดซ้ำได้ไฟล์ (2) เนื้อเหมือนกันทุกไบต์) · ค่าไม่ตรง ไม่เขียน ตอบ conflict ให้ถามก่อน
/// new_name จริง = ผู้ใช้ตอบแล้วว่าสร้างชื่อใหม่ ต่อท้าย (2) (3) · ไม่เขียนทับไฟล์ที่มีอยู่ทุกกรณี
pub fn save_sha256(movie: &Path, sha256: &str, target: Option<&Path>, new_name: bool) -> Result<HashSaved, String> {
    let name = movie.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let first = match target {
        Some(t) => t.to_path_buf(),
        None => movie.parent().unwrap_or(Path::new("")).join(format!("{name}.sha256")),
    };
    if first.exists() && !new_name {
        let same = std::fs::read_to_string(&first).ok().and_then(|b| first_hash(&b)).is_some_and(|h| h == sha256.to_ascii_lowercase());
        return Ok(HashSaved { path: first.to_string_lossy().to_string(), status: if same { "exists" } else { "conflict" } });
    }
    let dir = first.parent().unwrap_or(Path::new("")).to_path_buf();
    let file = first.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let base = file.strip_suffix(".sha256").unwrap_or(&file).to_string();
    let mut out = first.clone();
    let mut n = 2;
    while out.exists() {
        out = dir.join(format!("{base} ({n}).sha256"));
        n += 1;
    }
    let body = format!("{sha256} *{name}\n");
    // สร้างใหม่เท่านั้น ถ้ามีไฟล์ชื่อนี้โผล่มาระหว่างทาง Windows ปฏิเสธ ไม่ทับ
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(&out).map_err(|e| format!("บันทึกไฟล์ .sha256 ไม่ได้: {e}"))?;
    std::io::Write::write_all(&mut f, body.as_bytes()).map_err(|e| e.to_string())?;
    Ok(HashSaved { path: out.to_string_lossy().to_string(), status: "saved" })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
