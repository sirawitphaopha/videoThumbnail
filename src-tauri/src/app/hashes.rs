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
#[path = "hashes_tests.rs"]
mod tests;
