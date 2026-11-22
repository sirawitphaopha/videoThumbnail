//! โมเดลภาษาของ PaddleOCR ที่ไม่ได้แนบมากับตัวติดตั้ง กดโหลดในโปรแกรม (BUGS ข้อ 152)
//! พี่กันสั่ง 17 พ.ย. 2569 "ส่วนโมเดลภาษาอ่ะ เราต้องการแค่ อัฃกิด  ไทย ญี่ปุ่น ที่เหลือไว้โหลดเพิ่ม (ทำตอนนี้)"
//! ที่แนบมา PP-OCRv6 (อังกฤษ ญี่ปุ่น จีน) กับ PP-OCRv5 ไทยและอังกฤษ · ภาษาอื่นอยู่ในตาราง DOWNLOADABLE
//! ที่อยู่ล็อกที่ commit เดียวกับที่เคยแนบ (vendor/ocr/manifest.json) ตรวจค่า SHA-256 ทุกไฟล์หลังโหลด
//! โหลดลงโฟลเดอร์ชั่วคราวข้างที่เก็บ ครบและตรงแล้วจึงย้ายเข้าชื่อจริง · แบบชุดภาษาของ Tesseract (tesseract.rs download)

use crate::app::tools::{run_tool_timeout, tool_command};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub struct DlFile { pub name: &'static str, pub url: &'static str, pub sha256: &'static str, pub size: u64 }
/// โมเดลหนึ่งภาษา · ไฟล์ inference.onnx กับ inference.yml (มีพจนานุกรมตัวอักษร)
pub struct DlModel { pub code: &'static str, pub name: &'static str, pub dir: &'static str, pub files: &'static [DlFile] }

impl DlModel {
    pub fn bytes(&self) -> u64 { self.files.iter().map(|f| f.size).sum() }
}

/// เก้าภาษาที่ย้ายไปโหลดในโปรแกรม สร้างจาก vendor/ocr/manifest.json (ที่อยู่ล็อก commit ค่า SHA-256 ขนาด)
pub const DOWNLOADABLE: &[DlModel] = &[
    DlModel { code: "ko", name: "เกาหลี", dir: "korean_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/5c6f574b8e2230adf4287b33e736d71b9fabd28e/inference.onnx", sha256: "92f0b7785e64fc9090106a241cf4c1eb97472824558272751b88a2a4476d3a08", size: 13418787 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/5c6f574b8e2230adf4287b33e736d71b9fabd28e/inference.yml", sha256: "f757fa1c40e99edcf27e9cce879b93eb2a51fa46f5ef39095689b8c37dd75998", size: 96039 },
        ] },
    DlModel { code: "latin", name: "ภาษาอักษรละตินอื่น", dir: "latin_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/89d3a50e2c27e2e7cceeab0e944c25c807d5db4f/inference.onnx", sha256: "7888113072263cb471b93f66dd5e2ad70548dc526fa1ace760d0d973dd121498", size: 8042023 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec_onnx/resolve/89d3a50e2c27e2e7cceeab0e944c25c807d5db4f/inference.yml", sha256: "0bbe984570f597af3638e50bdf2e8276f3ab26a61966096538b3b0d1849f5c84", size: 6817 },
        ] },
    DlModel { code: "ru", name: "รัสเซีย", dir: "cyrillic_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/cyrillic_PP-OCRv5_mobile_rec_onnx/resolve/2cef88145434beb8afa9dd82d77d799eb1ad7b29/inference.onnx", sha256: "5371ee1ddaa7983cc62d0818d99e982b6804638c85e4f960d59a574094e172e5", size: 8048799 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/cyrillic_PP-OCRv5_mobile_rec_onnx/resolve/2cef88145434beb8afa9dd82d77d799eb1ad7b29/inference.yml", sha256: "5c76cc91fa98410178a09f498db10050d0ec1634a660053d3005ab7be581f501", size: 6991 },
        ] },
    DlModel { code: "uk", name: "ยูเครน", dir: "eslav_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/eslav_PP-OCRv5_mobile_rec_onnx/resolve/9a32171fc5718746875e1a261818884517975013/inference.onnx", sha256: "b3018ef2b09a0250b6e0c8e871c927098363e5fd4df890cc68e8358eb0aaf1bd", size: 7887627 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/eslav_PP-OCRv5_mobile_rec_onnx/resolve/9a32171fc5718746875e1a261818884517975013/inference.yml", sha256: "025039bac23eb4a308efcefa4d58eab3af440767815c6ba6938468bf6353ee5a", size: 4538 },
        ] },
    DlModel { code: "ar", name: "อาหรับ", dir: "arabic_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/arabic_PP-OCRv5_mobile_rec_onnx/resolve/14aaedcd75825982689ecf5cd64ab33ee083215a/inference.onnx", sha256: "799113ebf267fbe742deb99eb36e8d42c9ddc5291ceacf92add41b4d52a59110", size: 7998947 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/arabic_PP-OCRv5_mobile_rec_onnx/resolve/14aaedcd75825982689ecf5cd64ab33ee083215a/inference.yml", sha256: "21368419e6c016c31db55d316d59e11c128e1913e6e6fe10287084710043d3a6", size: 6165 },
        ] },
    DlModel { code: "hi", name: "ฮินดี", dir: "devanagari_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx/resolve/251aec19e36739540d35e2cc943f6aa7503b98e5/inference.onnx", sha256: "cb789212ce96c69d3e74728ae4309d179281d68cb3945d0616b67cafab41c986", size: 7912311 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/devanagari_PP-OCRv5_mobile_rec_onnx/resolve/251aec19e36739540d35e2cc943f6aa7503b98e5/inference.yml", sha256: "9bd172dd26440c8ce94d1cde5d5baea6aefdc7cf3c5c8492e0beedef656d4e54", size: 5027 },
        ] },
    DlModel { code: "el", name: "กรีก", dir: "el_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/el_PP-OCRv5_mobile_rec_onnx/resolve/8152b89d2ee0e1d4c92decab75fe75e5e3d836b6/inference.onnx", sha256: "2acf17fcaea2bc81b878e311e6263b8885f48bb03796f75f9f30ed3242bbaa6d", size: 7808735 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/el_PP-OCRv5_mobile_rec_onnx/resolve/8152b89d2ee0e1d4c92decab75fe75e5e3d836b6/inference.yml", sha256: "17d85b2fe2d2f24cd4ab07bcbc33e0c126859b956ced36e281dc65e2d0c1f0bf", size: 3317 },
        ] },
    DlModel { code: "ta", name: "ทมิฬ", dir: "ta_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/ta_PP-OCRv5_mobile_rec_onnx/resolve/0db89798af0d5218fad9ea7ace0557526e9077f1/inference.onnx", sha256: "c6d2b682d2a0ea4cb1fccdba295976f93fd439964d16cdc666cadef531accbee", size: 7885691 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/ta_PP-OCRv5_mobile_rec_onnx/resolve/0db89798af0d5218fad9ea7ace0557526e9077f1/inference.yml", sha256: "88a28f5a1bb30cabe38a0985cb5e6619fa4f0c7c78e57a08274674228c5219a6", size: 4579 },
        ] },
    DlModel { code: "te", name: "เตลูกู", dir: "te_PP-OCRv5_mobile_rec", files: &[
            DlFile { name: "inference.onnx", url: "https://huggingface.co/PaddlePaddle/te_PP-OCRv5_mobile_rec_onnx/resolve/f1197c83430241c58c64b0952b3a80366d04eeba/inference.onnx", sha256: "8238bfc46d4cffe720ed6706e3842802467343497428693ff2bfb4e6b3caa36b", size: 7898759 },
            DlFile { name: "inference.yml", url: "https://huggingface.co/PaddlePaddle/te_PP-OCRv5_mobile_rec_onnx/resolve/f1197c83430241c58c64b0952b3a80366d04eeba/inference.yml", sha256: "acebbe53f1831bf28ddfed75aedf58225d7aa5d09100c1d5a9140a2a53b137ce", size: 4795 },
        ] },
];

pub fn find(code: &str) -> Option<&'static DlModel> { DOWNLOADABLE.iter().find(|m| m.code == code) }
pub fn find_dir(dir: &str) -> Option<&'static DlModel> { DOWNLOADABLE.iter().find(|m| m.dir == dir) }

/// โฟลเดอร์โมเดลที่ผู้ใช้โหลดเอง ในโฟลเดอร์ของโปรแกรม
pub fn user_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("ocr").join("paddle"))
}

fn sha256_of(p: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut f = std::fs::File::open(p).map_err(|e| format!("เปิดไฟล์ที่โหลดไม่ได้ {e}"))?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).map_err(|e| format!("อ่านไฟล์ที่โหลดไม่ได้ {e}"))?;
    Ok(crate::media::probe::hex(&h.finalize()))
}

/// โหลดโมเดลภาษาลง user/<โฟลเดอร์โมเดล> · ความคืบหน้าเป็นเปอร์เซ็นต์ของขนาดรวม · stop = กดหยุด
pub fn download(user: &Path, code: &str, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<PathBuf, String> {
    let m = find(code).ok_or_else(|| format!("ไม่รู้จักโมเดลภาษา {code}"))?;
    download_model(user, m, on, stop)
}

fn download_model(user: &Path, m: &DlModel, on: &dyn Fn(f64), stop: &dyn Fn() -> bool) -> Result<PathBuf, String> {
    let dest = user.join(m.dir);
    if dest.join("inference.onnx").is_file() { on(100.0); return Ok(dest); }
    std::fs::create_dir_all(user).map_err(|e| format!("สร้างโฟลเดอร์โมเดลไม่ได้ {e}"))?;
    let stage = user.join(format!("{}.partial", m.dir));
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(&stage).map_err(|e| format!("สร้างโฟลเดอร์ชั่วคราวไม่ได้ {e}"))?;
    let fail = |msg: String| -> Result<PathBuf, String> { let _ = std::fs::remove_dir_all(&stage); Err(msg) };
    let sys = PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into())).join("System32");
    let total = m.bytes().max(1) as f64;
    let mut done = 0u64;
    for f in m.files {
        let part = stage.join(f.name);
        let mut child = match tool_command(&sys, "curl", [OsString::from("-sSLf"), "--max-time".into(), "900".into(), "-o".into(), part.clone().into(), f.url.into()])
            .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::piped()).spawn() {
            Ok(c) => c,
            Err(e) => return fail(format!("เรียก curl ไม่ได้ {e}")),
        };
        crate::app::winutil::kill_with_app(&child);
        let st = loop {
            if stop() { let _ = child.kill(); let _ = child.wait(); return fail("หยุดโหลดแล้ว".into()); }
            match child.try_wait() { Ok(Some(st)) => break st, Ok(None) => {}, Err(e) => return fail(e.to_string()) }
            let now = std::fs::metadata(&part).map(|x| x.len()).unwrap_or(0);
            on(((done + now) as f64 / total * 100.0).min(99.0));
            std::thread::sleep(Duration::from_millis(250));
        };
        let mut err = String::new();
        if let Some(mut e) = child.stderr.take() { let _ = std::io::Read::read_to_string(&mut e, &mut err); }
        if !st.success() || !part.is_file() {
            return fail(match st.code() {
                Some(6) | Some(7) | Some(28) => "ต่อเน็ตไม่ได้ หรือเว็บไม่ตอบ ลองใหม่อีกครั้ง".into(),
                Some(22) => format!("เว็บไม่มีโมเดลภาษา{} ({})", m.name, err.trim()),
                Some(23) => "เขียนไฟล์โมเดลไม่ได้ ไดรฟ์อาจเต็ม".into(),
                _ => format!("โหลดโมเดลภาษา{}ไม่สำเร็จ ({})", m.name, err.trim()),
            });
        }
        // ไฟล์ต้องตรงกับที่เคยแนบทุกไบต์ ไม่ตรงแปลว่าโหลดไม่ครบหรือเว็บเปลี่ยนไฟล์ ไม่ใช้
        match sha256_of(&part) {
            Ok(h) if h.eq_ignore_ascii_case(f.sha256) => {}
            Ok(_) => return fail(format!("ไฟล์ {} ของโมเดลภาษา{}ที่โหลดมาไม่ตรงกับที่ตรวจไว้ ลองโหลดใหม่อีกครั้ง", f.name, m.name)),
            Err(e) => return fail(e),
        }
        done += f.size;
    }
    if let Err(p) = crate::cover::rename::move_no_replace(&stage, &dest) { return fail(format!("ย้ายโมเดลเข้าที่เก็บไม่ได้ {}", p.title)); }
    on(100.0);
    Ok(dest)
}

/// ขนาดหัวของคำตอบ ใช้ตรวจว่าที่อยู่ยังโหลดได้ (เทสออกเน็ตเท่านั้น)
#[allow(dead_code)]
pub fn head_ok(url: &str) -> bool {
    let sys = PathBuf::from(std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".into())).join("System32");
    run_tool_timeout(&sys, "curl", ["-sIfL", "--max-time", "20", url], Duration::from_secs(25)).map(|o| o.status.success()).unwrap_or(false)
}

// ---------------------------------------------------------------- คำสั่งให้หน้าจอ

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaddleLang { code: String, name: String, mb: f64, have: bool }

/// โมเดลภาษาที่โหลดเพิ่มได้ กับสถานะว่าโหลดแล้วหรือยัง (แนบมากับโปรแกรมนับว่ามีแล้ว)
#[tauri::command]
pub fn ocr_paddle_langs(app: tauri::AppHandle) -> Result<Vec<PaddleLang>, String> {
    let ocr = crate::app::tools::tools_dir(&app)?.join("ocr").join("paddle");
    let user = user_dir(&app)?;
    Ok(DOWNLOADABLE.iter().map(|m| PaddleLang {
        code: m.code.into(), name: m.name.into(), mb: (m.bytes() as f64 / 1048576.0 * 10.0).round() / 10.0,
        have: ocr.join(m.dir).join("inference.onnx").is_file() || user.join(m.dir).join("inference.onnx").is_file(),
    }).collect())
}

static STOP_DL: AtomicBool = AtomicBool::new(false);

/// โหลดโมเดลภาษา · ความคืบหน้าทางเหตุการณ์ ocr-paddle-progress { code percent }
#[tauri::command]
pub async fn ocr_paddle_download(app: tauri::AppHandle, code: String) -> Result<(), String> {
    let user = user_dir(&app)?;
    STOP_DL.store(false, Ordering::SeqCst);
    tauri::async_runtime::spawn_blocking(move || {
        let c2 = code.clone();
        download(&user, &code, &|p| { let _ = tauri::Emitter::emit(&app, "ocr-paddle-progress", serde_json::json!({ "code": c2, "percent": p })); },
            &|| STOP_DL.load(Ordering::SeqCst)).map(|_| ())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn ocr_paddle_cancel() { STOP_DL.store(true, Ordering::SeqCst); }

#[cfg(test)]
#[path = "paddle_dl_tests.rs"]
mod tests;
