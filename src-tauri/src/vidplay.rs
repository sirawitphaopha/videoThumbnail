//! เล่นวิดีโอคร่าว ๆ ในหน้าแก้ซับ แบบ Aegisub (พี่กันขอ 14 พ.ย. 2569 "ทำระบบเล่นวิดีโอแบบคร่าวๆมาใส่ก่อน ไม่งั้นเทสไม่ได้"
//! · "เเค่อ่านไฟล์ aegi ทำยังไง ไปดูมา" · "เราให้มันเล่นไฟล์ เหมือนเปิดหนังไง")
//! Aegisub (video_controller.cpp Play OnPlayTimer) สั่งตัวเล่นเสียงเล่นจากไฟล์หนังจนจบ แล้วตั้งนาฬิกาทุก 10 ms อ่านเฟรมที่ตรงเวลานั้นจากไฟล์มาขึ้นจอ
//! ของเราแบบเดียวกัน เสียงเล่นด้วยตัวเล่นเสียงเดิมของหน้าแก้ซับ (audioPlay.ts) ภาพอ่านจากไฟล์หนังต่อเนื่องด้วย ffmpeg ตั้งแต่เฟรมที่อยู่
//! ส่งทีละเฟรมเป็นภาพ JPEG แบบเดียวกับกรอบภาพตอนไม่เล่น (vid_frames) ผ่าน Channel หน้าจอขึ้นเฟรมที่ตรงกับเวลาของเสียง
//! ไม่สร้างไฟล์ ไม่แปลงหนังเป็นแบบอื่น ไม่แตะไฟล์หนัง · อ่านไฟล์ตามเวลาจริง (-readrate 1 ส่งล่วงหน้า 2 วินาทีแรก) ไม่ถอดทั้งเรื่องล่วงหน้า
//! หยุด เปลี่ยนตำแหน่ง เล่นใหม่ = รุ่นเปลี่ยน ffmpeg ตัวเดิมถูกปิด · ปิดโปรแกรมแล้ว ffmpeg ปิดตาม (kill_with_app)

use std::io::Read;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::AppHandle;

use crate::tools::tools_dir;

/// รุ่นของการเล่น · เล่นใหม่หรือหยุดแล้วเพิ่มเลข ตัวที่รุ่นไม่ตรงปิดเอง
static GEN: AtomicU64 = AtomicU64::new(0);

/// คำสั่ง ffmpeg อ่านภาพต่อเนื่องจากเวลา ss (คิดแบบ seekOf ของหน้าจอ เฟรมแรกที่ได้คือเฟรมที่ขอ) สูง h จุด ทุกเฟรมตามไฟล์ (passthrough)
pub fn play_args(movie: &str, ss: f64, h: u32) -> Vec<String> {
    let h = (h.clamp(90, 1080) / 2) * 2;
    let s = |x: &str| x.to_string();
    vec![
        s("-v"), s("error"), s("-nostdin"),
        s("-ss"), format!("{:.6}", ss.max(0.0)),
        s("-readrate"), s("1"), s("-readrate_initial_burst"), s("2"),
        s("-i"), s(movie),
        s("-map"), s("0:V:0"), s("-an"), s("-sn"), s("-dn"), s("-fps_mode"), s("passthrough"),
        s("-vf"), format!("scale=-2:{h}"),
        s("-f"), s("image2pipe"), s("-c:v"), s("mjpeg"), s("-q:v"), s("5"),
        s("pipe:1"),
    ]
}

/// ภาพ JPEG ที่ครบแล้วในก้อนที่อ่านมา · คืนรายการภาพกับจำนวนไบต์ที่ใช้ไป (ที่เหลือคือภาพที่ยังมาไม่ครบ)
fn take_jpegs(b: &[u8]) -> (Vec<Vec<u8>>, usize) {
    let v = crate::vidframes::split_jpegs(b);
    let used = v.last().map(|s| s.as_ptr() as usize + s.len() - b.as_ptr() as usize).unwrap_or(0);
    (v.into_iter().map(|x| x.to_vec()).collect(), used)
}

/// เล่นภาพตั้งแต่ ss วินาที · ส่งทีละเฟรม (ไบต์ JPEG) เข้า out ตามลำดับจนจบเรื่องหรือถูกหยุด
#[tauri::command]
pub async fn vid_play(app: AppHandle, movie: String, ss: f64, h: u32, out: Channel<InvokeResponseBody>) -> Result<(), String> {
    let tools = tools_dir(&app)?;
    let my = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn_blocking(move || {
        if !PathBuf::from(&movie).exists() { return Err("หาไฟล์หนังไม่เจอ ไดรฟ์อาจถอดออกอยู่".to_string()); }
        let mut child = crate::tools::tool_command(&tools, "ffmpeg", play_args(&movie, ss, h))
            .stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
        crate::winutil::kill_with_app(&child);
        let mut stdout = child.stdout.take().ok_or("อ่านภาพจาก ffmpeg ไม่ได้")?;
        let mut chunk = vec![0u8; 256 * 1024];
        let mut buf: Vec<u8> = Vec::new();
        let mut sent = 0usize;
        loop {
            if GEN.load(Ordering::SeqCst) != my { let _ = child.kill(); let _ = child.wait(); return Ok(()); }
            let n = match stdout.read(&mut chunk) { Ok(0) | Err(_) => break, Ok(n) => n };
            buf.extend_from_slice(&chunk[..n]);
            let (imgs, used) = take_jpegs(&buf);
            buf.drain(..used);
            for img in imgs {
                // หน้าจอปิดหรือโหลดใหม่ ส่งไม่ได้ ปิด ffmpeg
                if out.send(InvokeResponseBody::Raw(img)).is_err() { let _ = child.kill(); let _ = child.wait(); return Ok(()); }
                sent += 1;
            }
        }
        let _ = child.wait();
        if GEN.load(Ordering::SeqCst) == my && sent == 0 { return Err("อ่านภาพจากไฟล์หนังไม่ได้".into()); }
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

/// หยุดเล่น · ffmpeg ที่กำลังอ่านภาพปิดเองในก้อนถัดไป
#[tauri::command]
pub fn vid_play_stop() {
    GEN.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn play_args_seek_and_size() {
        // 12.3456785 ในเลขฐานสองเก็บได้ต่ำกว่าเล็กน้อย ปัดได้ .345678 จึงใช้ค่าที่ปัดชัดเจน
        let s = play_args("D:\\หนัง\\a.mkv", 12.3456789, 541).join(" ");
        assert!(s.contains("-ss 12.345679 "), "{s}");
        assert!(s.contains("scale=-2:540"), "ความสูงเป็นเลขคู่ {s}");
        assert!(s.contains("-fps_mode passthrough"), "ทุกเฟรมตามไฟล์ ไม่เพิ่มไม่ทิ้ง {s}");
        assert!(play_args("a.mkv", -5.0, 9999).join(" ").contains("-ss 0.000000 "));
        assert!(play_args("a.mkv", 0.0, 9999).join(" ").contains("scale=-2:1080"));
    }

    #[test]
    fn take_jpegs_keeps_partial_image() {
        // ภาพเล็กสองภาพ ภาพที่สองยังมาไม่ครบ
        let img: Vec<u8> = vec![0xFF, 0xD8, 0xFF, 0xDA, 0x00, 0x02, 0x11, 0x22, 0xFF, 0xD9];
        let mut b = img.clone();
        b.extend_from_slice(&img[..5]);
        let (v, used) = take_jpegs(&b);
        assert_eq!(v.len(), 1);
        assert_eq!(used, img.len());
    }
}
