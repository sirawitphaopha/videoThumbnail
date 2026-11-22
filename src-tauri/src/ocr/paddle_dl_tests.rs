//! เทสของ paddle_dl.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// ตารางโหลดครบเก้าภาษา ชื่อโฟลเดอร์ตรงกับที่ตัวอ่านหา (paddle::V5_LANGS) และไม่ซ้ำกับภาษาที่แนบมา (ไทย อังกฤษ)
#[test]
fn table_matches_reader() {
    assert_eq!(DOWNLOADABLE.len(), 9);
    for m in DOWNLOADABLE {
        let want = crate::ocr::paddle::V5_LANGS.iter().find(|(l, _)| *l == m.code).map(|(_, d)| format!("{d}_PP-OCRv5_mobile_rec"));
        assert_eq!(want.as_deref(), Some(m.dir), "{}", m.code);
        assert!(!["th", "en"].contains(&m.code));
        assert_eq!(m.files.len(), 2);
        for f in m.files { assert!(f.url.starts_with("https://huggingface.co/PaddlePaddle/") && f.url.ends_with(f.name) && f.sha256.len() == 64 && f.size > 0, "{}", f.url); }
    }
}

/// โหลดลงโฟลเดอร์ชั่วคราว ไฟล์ไม่ตรงค่า SHA-256 ต้องไม่เข้าที่เก็บจริง · ใช้ไฟล์ในเครื่องแทนเว็บ (file://)
#[test]
fn bad_hash_is_rejected() {
    let tmp = std::env::temp_dir().join(format!("movie-shelf-paddle-dl-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).unwrap();
    let src = tmp.join("x.bin");
    std::fs::write(&src, b"not the model").unwrap();
    let url: &'static str = Box::leak(format!("file:///{}", src.display().to_string().replace('\\', "/")).into_boxed_str());
    let files: &'static [DlFile] = Box::leak(vec![DlFile { name: "inference.onnx", url, sha256: "00", size: 13 }].into_boxed_slice());
    let m = DlModel { code: "zz", name: "ทดสอบ", dir: "zz_PP-OCRv5_mobile_rec", files };
    let user = tmp.join("user");
    // ใช้ตัวโหลดเดียวกันกับโมเดลที่สร้างเอง
    let r = download_model(&user, &m, &|_| {}, &|| false);
    assert!(r.is_err(), "{r:?}");
    assert!(!user.join(m.dir).exists() && !user.join(format!("{}.partial", m.dir)).exists());
    // ค่าตรง ต้องย้ายเข้าที่เก็บจริง (พิสูจน์ว่าโหลดผ่าน curl ได้ และกรณีบนตกที่การตรวจค่า ไม่ใช่ที่การโหลด)
    let good: &'static str = Box::leak(sha256_of(&src).unwrap().into_boxed_str());
    let files2: &'static [DlFile] = Box::leak(vec![DlFile { name: "inference.onnx", url, sha256: good, size: 13 }].into_boxed_slice());
    let m2 = DlModel { files: files2, ..m };
    let d = download_model(&user, &m2, &|_| {}, &|| false).unwrap();
    assert_eq!(std::fs::read(d.join("inference.onnx")).unwrap(), b"not the model");
    assert!(!user.join(format!("{}.partial", m2.dir)).exists());
    let _ = std::fs::remove_dir_all(&tmp);
}
