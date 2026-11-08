//! Monkey's Audio (.ape) กับแท็ก APEv2 (แผนเสียงและซับ ขั้น 8 · หน้ากราฟเสียง แปลงเป็นคิว)
//! ชุด SDK ของ Monkey's Audio 13.45 ไม่มีตัวแปลงแบบคำสั่ง มีแต่ MACDll64.dll (vendor/README.md)
//! โปรแกรมเรียก DLL ตรง ffmpeg ถอดเสียงเป็น WAV ส่งทางท่อ อ่านหัว WAV เอาช่อง อัตราสุ่ม ความลึกบิต แล้วป้อนเสียงดิบเข้า c_APECompress_AddData
//! แท็ก APEv2 เขียนเองที่ท้ายไฟล์ ใช้กับ .ape .wv .tak (ทั้งสามชนิดเก็บแท็กแบบเดียวกัน) · DLL มีแค่ตัวเขียนแท็กแบบ ANSI ภาษาไทยเพี้ยน

use std::ffi::{c_char, c_void, OsStr};
use std::io::{BufRead, BufReader, Read};
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::process::Stdio;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::encode::{Done, Plan};
use crate::tools::tool_command;

// ---------------------------------------------------------------- แท็ก APEv2

/// ข้อมูลหนึ่งช่องของแท็ก APEv2 · binary = รูปปก (ชื่อไฟล์ ตามด้วยศูนย์ ตามด้วยไบต์รูป)
pub struct ApeItem {
    pub key: String,
    pub value: Vec<u8>,
    pub binary: bool,
}

fn tag_frame(size: u32, count: u32, header: bool) -> Vec<u8> {
    let mut b = Vec::with_capacity(32);
    b.extend_from_slice(b"APETAGEX");
    b.extend_from_slice(&2000u32.to_le_bytes());
    b.extend_from_slice(&size.to_le_bytes());
    b.extend_from_slice(&count.to_le_bytes());
    // บิต 31 มีหัวแท็ก · บิต 29 ตัวนี้คือหัว (ไม่ตั้ง = ตัวท้าย) · บิต 30 ไม่ตั้ง = มีตัวท้าย
    let flags: u32 = if header { 0xA000_0000 } else { 0x8000_0000 };
    b.extend_from_slice(&flags.to_le_bytes());
    b.extend_from_slice(&[0u8; 8]);
    b
}

/// ไบต์ของแท็ก APEv2 ทั้งก้อน (หัว ช่องข้อมูล ตัวท้าย) · ช่องเรียงจากเล็กไปใหญ่ตามที่สเปกแนะนำ รูปปกอยู่ท้าย
pub fn ape_tag(items: &[ApeItem]) -> Vec<u8> {
    let mut sorted: Vec<&ApeItem> = items.iter().filter(|i| i.key.len() >= 2 && i.key.len() <= 255 && i.key.is_ascii() && !i.value.is_empty()).collect();
    sorted.sort_by_key(|i| (i.binary, i.value.len()));
    let mut body = Vec::new();
    for i in &sorted {
        body.extend_from_slice(&(i.value.len() as u32).to_le_bytes());
        let flags: u32 = if i.binary { 1 << 1 } else { 0 };
        body.extend_from_slice(&flags.to_le_bytes());
        body.extend_from_slice(i.key.as_bytes());
        body.push(0);
        body.extend_from_slice(&i.value);
    }
    let size = body.len() as u32 + 32;
    let mut out = tag_frame(size, sorted.len() as u32, true);
    out.extend_from_slice(&body);
    out.extend(tag_frame(size, sorted.len() as u32, false));
    out
}

/// ไฟล์ลงท้ายด้วยแท็ก APEv2 อยู่แล้วไหม (ตัวแปลงบางตัวเขียนแท็กเอง ไม่เขียนซ้อน)
pub fn has_ape_tag(p: &Path) -> bool {
    use std::io::{Seek, SeekFrom};
    let Ok(mut f) = std::fs::File::open(p) else { return false };
    let mut b = [0u8; 32];
    if f.seek(SeekFrom::End(-32)).is_err() || f.read_exact(&mut b).is_err() { return false; }
    &b[..8] == b"APETAGEX"
}

/// ต่อแท็กท้ายไฟล์
pub fn append_tag(p: &Path, items: &[ApeItem]) -> Result<(), String> {
    use std::io::Write;
    if items.is_empty() { return Ok(()); }
    let mut f = std::fs::OpenOptions::new().append(true).open(p).map_err(|e| format!("เขียนข้อมูลเพลงไม่ได้: {e}"))?;
    f.write_all(&ape_tag(items)).map_err(|e| format!("เขียนข้อมูลเพลงไม่ได้: {e}"))
}

// ---------------------------------------------------------------- MACDll64.dll

#[repr(C, packed)]
struct WaveFormatEx {
    tag: u16,
    channels: u16,
    rate: u32,
    avg_bytes: u32,
    block_align: u16,
    bits: u16,
    cb_size: u16,
}

type FnCreate = unsafe extern "system" fn(*mut i32) -> *mut c_void;
type FnStartW = unsafe extern "system" fn(*mut c_void, *const u16, *const WaveFormatEx, i64, i32, *const c_void, i64) -> i32;
type FnAddData = unsafe extern "system" fn(*mut c_void, *mut u8, i32) -> i64;
type FnFinish = unsafe extern "system" fn(*mut c_void, *mut u8, i64, i64) -> i32;
type FnDestroy = unsafe extern "system" fn(*mut c_void);
type FnThreads = unsafe extern "system" fn(*mut c_void, i32) -> i32;
type FnVersion = unsafe extern "system" fn() -> *const c_char;

struct Mac {
    lib: windows_sys::Win32::Foundation::HMODULE,
    create: FnCreate,
    start: FnStartW,
    add: FnAddData,
    finish: FnFinish,
    destroy: FnDestroy,
    threads: Option<FnThreads>,
}

impl Drop for Mac {
    fn drop(&mut self) {
        unsafe { windows_sys::Win32::Foundation::FreeLibrary(self.lib) };
    }
}

fn wide(p: &OsStr) -> Vec<u16> {
    p.encode_wide().chain(std::iter::once(0)).collect()
}

fn load_lib(dir: &Path) -> Result<windows_sys::Win32::Foundation::HMODULE, String> {
    use windows_sys::Win32::System::LibraryLoader::{LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH};
    let p = dir.join("MACDll64.dll");
    if !p.exists() { return Err("ไม่มี MACDll64.dll ในโฟลเดอร์เครื่องมือ".into()); }
    let h = unsafe { LoadLibraryExW(wide(p.as_os_str()).as_ptr(), std::ptr::null_mut(), LOAD_WITH_ALTERED_SEARCH_PATH) };
    if h.is_null() { return Err(format!("เปิด MACDll64.dll ไม่ได้ (รหัส {})", std::io::Error::last_os_error().raw_os_error().unwrap_or(0))); }
    Ok(h)
}

fn sym(h: windows_sys::Win32::Foundation::HMODULE, name: &[u8]) -> Option<unsafe extern "system" fn() -> isize> {
    unsafe { windows_sys::Win32::System::LibraryLoader::GetProcAddress(h, name.as_ptr()) }
}

impl Mac {
    fn load(dir: &Path) -> Result<Mac, String> {
        let lib = load_lib(dir)?;
        let need = |n: &[u8]| sym(lib, n).ok_or_else(|| format!("MACDll64.dll ไม่มีคำสั่ง {}", String::from_utf8_lossy(&n[..n.len() - 1])));
        // ชนิดฟังก์ชันตรงกับ Shared/MACDll.h ของชุด SDK 13.45 · บน 64 บิต __stdcall กับ extern "system" เป็นแบบเดียวกัน
        let m = unsafe {
            Mac {
                lib,
                create: std::mem::transmute::<_, FnCreate>(need(b"c_APECompress_Create\0")?),
                start: std::mem::transmute::<_, FnStartW>(need(b"c_APECompress_StartW\0")?),
                add: std::mem::transmute::<_, FnAddData>(need(b"c_APECompress_AddData\0")?),
                finish: std::mem::transmute::<_, FnFinish>(need(b"c_APECompress_Finish\0")?),
                destroy: std::mem::transmute::<_, FnDestroy>(need(b"c_APECompress_Destroy\0")?),
                threads: sym(lib, b"c_APECompress_SetNumberOfThreads\0").map(|f| std::mem::transmute::<_, FnThreads>(f)),
            }
        };
        Ok(m)
    }
}

/// รุ่นของ MACDll64.dll เช่น 13.45 · ไม่มีไฟล์หรือเปิดไม่ได้ = None
pub fn version(dir: &Path) -> Result<String, String> {
    let lib = load_lib(dir)?;
    let v = unsafe {
        let r = sym(lib, b"GetLibraryVersionString\0").map(|f| {
            let f = std::mem::transmute::<_, FnVersion>(f);
            let p = f();
            if p.is_null() { String::new() } else { std::ffi::CStr::from_ptr(p).to_string_lossy().to_string() }
        });
        windows_sys::Win32::Foundation::FreeLibrary(lib);
        r
    };
    Ok(v.unwrap_or_default())
}

/// ระดับการบีบของการ์ด Compression level เป็นค่าของ SDK (1000 ถึง 5000)
pub fn level_of(label: &str) -> i32 {
    match label {
        "Fast" => 1000,
        "High" => 3000,
        "Extra High" => 4000,
        "Insane" => 5000,
        _ => 2000,
    }
}

/// อ่านหัว WAV ที่ ffmpeg ส่งทางท่อ · คืน (ช่อง อัตราสุ่ม บิต) · ข้ามก้อนอื่น (LIST) จนถึงก้อน data
/// ขนาดก้อน data จากท่อไม่น่าเชื่อ (ffmpeg เขียนกลับไม่ได้) อ่านเสียงจนท่อหมดแทน
pub fn read_wav_head(r: &mut dyn Read) -> Result<(u16, u32, u16), String> {
    let mut riff = [0u8; 12];
    r.read_exact(&mut riff).map_err(|_| "ffmpeg ไม่ได้ส่งเสียงออกมา".to_string())?;
    if &riff[..4] != b"RIFF" || &riff[8..12] != b"WAVE" { return Err("เสียงที่ ffmpeg ส่งมาไม่ใช่ WAV".into()); }
    let mut fmt: Option<(u16, u32, u16)> = None;
    loop {
        let mut h = [0u8; 8];
        r.read_exact(&mut h).map_err(|_| "หัว WAV ไม่ครบ".to_string())?;
        let size = u32::from_le_bytes([h[4], h[5], h[6], h[7]]) as usize;
        match &h[..4] {
            b"data" => break,
            b"fmt " => {
                let mut b = vec![0u8; size + (size & 1)];
                r.read_exact(&mut b).map_err(|_| "หัว WAV ไม่ครบ".to_string())?;
                if b.len() < 16 { return Err("หัว WAV ไม่ครบ".into()); }
                fmt = Some((u16::from_le_bytes([b[2], b[3]]), u32::from_le_bytes([b[4], b[5], b[6], b[7]]), u16::from_le_bytes([b[14], b[15]])));
            }
            _ => {
                let mut left = size + (size & 1);
                let mut sink = [0u8; 4096];
                while left > 0 {
                    let n = left.min(sink.len());
                    r.read_exact(&mut sink[..n]).map_err(|_| "หัว WAV ไม่ครบ".to_string())?;
                    left -= n;
                }
            }
        }
    }
    let f = fmt.ok_or("หัว WAV ไม่มีข้อมูลช่องเสียง")?;
    if f.0 == 0 || f.1 == 0 || !matches!(f.2, 8 | 16 | 24 | 32) { return Err(format!("รูปแบบเสียงที่ Monkey's Audio ไม่รับ ({} ช่อง {} Hz {} บิต)", f.0, f.1, f.2)); }
    Ok(f)
}

/// รันงานแปลงเป็น .ape · ขั้นแรก ffmpeg ส่ง WAV ทางท่อ · ขั้นที่สองเป็นของ DLL (args = --level N --threads N ไฟล์ปลายทาง)
/// กดหยุด ฆ่า ffmpeg ปิดตัวบีบโดยไม่จบไฟล์ ไฟล์ปลายทางที่ทำค้าง คนเรียกลบเอง
pub fn run(dir: &Path, ff_dir: &Path, plan: &Plan, total_secs: Option<f64>, stop: &dyn Fn() -> bool, progress: &mut dyn FnMut(f64)) -> Result<Done, String> {
    let a = &plan.steps[1].args;
    let arg = |k: &str| a.iter().position(|x| x == k).and_then(|i| a.get(i + 1)).and_then(|v| v.parse::<i32>().ok());
    let level = arg("--level").unwrap_or(2000);
    let threads = arg("--threads").unwrap_or(1).max(1);
    let out = a.last().ok_or("ไม่มีไฟล์ปลายทาง")?.clone();
    let mac = Mac::load(dir)?;

    let mut ff = tool_command(ff_dir, &plan.steps[0].tool, plan.steps[0].args.iter().map(OsStr::new))
        .stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เรียก ffmpeg ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&ff);
    let err = ff.stderr.take().unwrap();
    let (tx, rx) = mpsc::channel::<f64>();
    let reader = std::thread::spawn(move || {
        let mut other = String::new();
        for line in BufReader::new(err).split(b'\n').flatten() {
            let l = String::from_utf8_lossy(&line).trim_end_matches('\r').to_string();
            if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.parse::<f64>().ok()) { let _ = tx.send(us); }
            else if !l.contains('=') || l.starts_with('[') { other.push_str(&l); other.push('\n'); }
        }
        other
    });
    let mut pipe = BufReader::with_capacity(1 << 20, ff.stdout.take().unwrap());
    let kill = |ff: &mut std::process::Child| { let _ = ff.kill(); let _ = ff.wait(); };
    let (ch, rate, bits) = match read_wav_head(&mut pipe) {
        Ok(f) => f,
        Err(e) => {
            kill(&mut ff);
            let msg = reader.join().unwrap_or_default();
            let first = msg.lines().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(160).collect::<String>();
            return Ok(Done::Failed(if first.is_empty() { e } else { format!("ffmpeg ถอดเสียงไม่สำเร็จ {first}") }));
        }
    };
    let align = ch as usize * bits as usize / 8;
    let wf = WaveFormatEx { tag: 1, channels: ch, rate, avg_bytes: rate * align as u32, block_align: align as u16, bits, cb_size: 0 };
    let mut code = 0i32;
    let h = unsafe { (mac.create)(&mut code) };
    if h.is_null() { kill(&mut ff); return Ok(Done::Failed(format!("สร้างตัวบีบ Monkey's Audio ไม่ได้ (รหัส {code})"))); }
    let destroy = |h: *mut c_void| unsafe { (mac.destroy)(h) };
    if let Some(t) = mac.threads { unsafe { t(h, threads) }; }
    let w = wide(OsStr::new(&out));
    // -1 คู่ท้าย = ไม่รู้ความยาวเสียงล่วงหน้า (APE_MAX_AUDIO_BYTES_UNKNOWN) กับให้ตัวบีบสร้างหัว WAV เองตอนถอดกลับ
    let r = unsafe { (mac.start)(h, w.as_ptr(), &wf, -1, level, std::ptr::null(), -1) };
    if r != 0 { destroy(h); kill(&mut ff); return Ok(Done::Failed(format!("เริ่มเขียนไฟล์ .ape ไม่ได้ (รหัส {r})"))); }

    let mut buf = vec![0u8; 1 << 20];
    let mut fill = 0usize;
    let mut last = Instant::now() - Duration::from_secs(1);
    loop {
        if stop() { destroy(h); kill(&mut ff); let _ = reader.join(); return Ok(Done::Cancelled); }
        let n = match pipe.read(&mut buf[fill..]) {
            Ok(n) => n,
            Err(e) => { destroy(h); kill(&mut ff); let _ = reader.join(); return Ok(Done::Failed(format!("อ่านเสียงจาก ffmpeg ไม่ได้: {e}"))); }
        };
        if n == 0 { break; }
        fill += n;
        // ป้อนทีละจำนวนเต็มตัวอย่างเสียง เศษที่เหลือรอรอบหน้า
        let whole = fill / align * align;
        if whole > 0 {
            let r = unsafe { (mac.add)(h, buf.as_mut_ptr(), whole as i32) };
            if r != 0 { destroy(h); kill(&mut ff); let _ = reader.join(); return Ok(Done::Failed(format!("Monkey's Audio บีบเสียงไม่สำเร็จ (รหัส {r})"))); }
            buf.copy_within(whole..fill, 0);
            fill -= whole;
        }
        let mut us = None;
        while let Ok(v) = rx.try_recv() { us = Some(v); }
        if let (Some(us), Some(total)) = (us, total_secs) {
            if total > 0.0 && last.elapsed() >= Duration::from_millis(100) {
                last = Instant::now();
                progress((us / 1e6 / total * 100.0).clamp(0.0, 99.0));
            }
        }
    }
    let st = ff.wait().map_err(|e| e.to_string())?;
    let msg = reader.join().unwrap_or_default();
    if !st.success() {
        destroy(h);
        return Ok(Done::Failed(format!("ffmpeg ถอดเสียงไม่สำเร็จ {}", msg.lines().find(|l| !l.trim().is_empty()).unwrap_or("").chars().take(160).collect::<String>())));
    }
    let r = unsafe { (mac.finish)(h, std::ptr::null_mut(), 0, 0) };
    destroy(h);
    if r != 0 { return Ok(Done::Failed(format!("ปิดไฟล์ .ape ไม่สำเร็จ (รหัส {r})"))); }
    progress(100.0);
    Ok(Done::Ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ape_tag_layout() {
        let t = ape_tag(&[
            ApeItem { key: "Title".into(), value: "ฝนแรก".as_bytes().to_vec(), binary: false },
            ApeItem { key: "Cover Art (Front)".into(), value: b"cover.jpg\0\xff\xd8\xff".to_vec(), binary: true },
            ApeItem { key: "Empty".into(), value: vec![], binary: false },
        ]);
        assert_eq!(&t[..8], b"APETAGEX");
        assert_eq!(&t[t.len() - 32..t.len() - 24], b"APETAGEX");
        let size = u32::from_le_bytes(t[12..16].try_into().unwrap()) as usize;
        assert_eq!(size, t.len() - 32, "ขนาดในหัวนับช่องข้อมูลกับตัวท้าย ไม่นับหัว");
        assert_eq!(u32::from_le_bytes(t[16..20].try_into().unwrap()), 2, "ช่องว่างไม่เขียน");
        assert_eq!(u32::from_le_bytes(t[20..24].try_into().unwrap()), 0xA000_0000);
        assert_eq!(u32::from_le_bytes(t[t.len() - 12..t.len() - 8].try_into().unwrap()), 0x8000_0000);
        // ช่องแรกเป็นตัวหนังสือ (เรียงตัวหนังสือก่อนรูป)
        assert_eq!(u32::from_le_bytes(t[32..36].try_into().unwrap()) as usize, "ฝนแรก".len());
        assert_eq!(&t[40..46], b"Title\0");
    }

    #[test]
    fn wav_head_skips_list_chunk() {
        let mut w = Vec::new();
        w.extend_from_slice(b"RIFF\xff\xff\xff\xffWAVE");
        w.extend_from_slice(b"LIST\x05\x00\x00\x00abcde\x00");
        w.extend_from_slice(b"fmt \x10\x00\x00\x00");
        w.extend_from_slice(&1u16.to_le_bytes());
        w.extend_from_slice(&6u16.to_le_bytes());
        w.extend_from_slice(&48000u32.to_le_bytes());
        w.extend_from_slice(&(48000u32 * 18).to_le_bytes());
        w.extend_from_slice(&18u16.to_le_bytes());
        w.extend_from_slice(&24u16.to_le_bytes());
        w.extend_from_slice(b"data\xff\xff\xff\xff\x01\x02\x03");
        let mut r: &[u8] = &w;
        assert_eq!(read_wav_head(&mut r).unwrap(), (6, 48000, 24));
        assert_eq!(r, &[1, 2, 3], "อ่านหัวแล้วเหลือเสียงดิบพอดี");
    }

    #[test]
    fn mac_dll_loads_and_reports_version() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        let v = version(&dir).expect("เปิด MACDll64.dll ได้");
        // DLL ที่คอมไพล์มาแล้วในชุด SDK 13.45 ตอบรุ่น 12.36 (หัวไฟล์ซอร์สในชุดเป็น 13.45 · ลองจริง 8 พ.ย. 2569)
        let major: u32 = v.split('.').next().and_then(|m| m.parse().ok()).unwrap_or(0);
        assert!(major >= 12 && v.contains('.'), "รุ่น {v}");
        Mac::load(&dir).expect("มีคำสั่งบีบเสียงครบ");
    }
}
