//! ทะเบียนตัวแปลงเสียง ชุด TAK โฟลเดอร์ของผู้ใช้ อ่านรุ่นและสถานะของตัวแปลง
//! แยกจาก encode/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ทะเบียนตัวแปลง

/// ตัวแปลงที่โปรแกรมรู้จัก (ชื่อไฟล์ ชนิด คำสั่งถามรุ่น แนบมากับโปรแกรมไหม) · ตัวที่สัญญาอนุญาตไม่ให้แจก ผู้ใช้วางเองในโฟลเดอร์ตัวแปลง
pub const ENCODERS: [(&str, &str, &str, bool); 9] = [
    ("flac", "FLAC", "--version", true),
    ("opusenc", "Opus", "--version", true),
    ("lame", "MP3", "--version", true),
    ("wavpack", "WavPack", "--version", true),
    // qaac กับ refalac แนบมากับโปรแกรมแล้ว (10 พ.ย. 2569 แบบ foobar2000) · qaac ยังต้องใช้ไฟล์ของ Apple จาก iTunes ที่ผู้ใช้ติดตั้งเอง
    // ตัวที่แนบมาใช้ไม่ได้ (ไม่มี iTunes) แต่โฟลเดอร์ตัวแปลงมีตัวที่ใช้ได้ (มี QTfiles64) cli_status เลือกตัวที่ใช้ได้
    ("qaac64", "AAC", "--check", true),
    // refalac มากับชุด qaac ไม่ต้องใช้ไฟล์ของ Apple · ตอบรุ่นทาง --check "refalac 3.07" (ลอง 10 พ.ย. 2569)
    ("refalac64", "ALAC", "--check", true),
    ("fdkaac", "AAC และ HE-AAC", "--help", false),
    // TAK ฟรีสำหรับใช้ส่วนตัว แจกต่อได้เฉพาะไฟล์ zip เดิมทั้งไฟล์ · แนบ zip มาทั้งไฟล์ แตก Takc.exe ตอนใช้ (ensure_tak) · ใช้เฉพาะหน้าแปลงเสียง
    // ถามรุ่นด้วย -version ได้ "TAKC 2.3.3" (-h ไม่มีในคู่มือ Takc ตอบ invalid mode ไม่บอกรุ่น · ลอง 8 พ.ย. 2569)
    ("Takc", "TAK (ใช้เฉพาะหน้าแปลงเสียง)", "-version", true),
    ("ffmpeg", "ทุกชนิดที่แปลงได้ (ตัวรอง)", "-version", true),
];

/// ชุด TAK ที่แนบมากับโปรแกรม (ไฟล์ zip เดิมของผู้ทำ ไม่ดัดแปลง ตามเงื่อนไขการแจก)
pub const TAK_ZIP: &str = "TAK_2.3.3.zip";

/// โฟลเดอร์ที่แตก Takc.exe จากชุดที่แนบมา · ข้างโฟลเดอร์ตัวแปลงที่ใส่เอง (AppData\Local\ชั้นหนัง\TAK 2.3.3)
/// โฟลเดอร์เครื่องมือในที่ติดตั้งเขียนไม่ได้ จึงแตกมาไว้ในโฟลเดอร์ข้อมูลของโปรแกรม
pub fn tak_dir(user: &Path) -> PathBuf {
    user.parent().unwrap_or(user).join("TAK 2.3.3")
}

/// แตก Takc.exe กับ Readme.html (สัญญาอนุญาต) จาก zip ที่แนบมา ถ้ายังไม่มี · ใช้ tar ของ Windows ไม่ต้องเพิ่มห้องสมุด
/// แตกลงโฟลเดอร์ชั่วคราวที่อยู่เป็นอักษรอังกฤษก่อน แล้วค่อยคัดลอกไปที่อยู่ภาษาไทยด้วย Rust (tar ส่งชื่อไฟล์ภาษาไทยผ่านหน้ารหัสของระบบ)
/// ไม่มี zip = "missing" (ตัวที่สร้างจากซอร์สโดยไม่รัน fetch-tools)
pub fn ensure_tak(tools: &Path, dir: &Path) -> Result<(), String> {
    if dir.join("Takc.exe").exists() { return Ok(()); }
    let zip = tools.join(TAK_ZIP);
    if !zip.exists() { return Err("missing".into()); }
    let tmp = std::env::temp_dir().join(format!("movie-shelf-tak-{}", crate::cover::poster_image::unique()));
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    struct Clean(PathBuf);
    impl Drop for Clean { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }
    let _clean = Clean(tmp.clone());
    let sys = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("System32");
    let out = crate::app::tools::run_tool_timeout(&sys, "tar", [OsStr::new("-x"), OsStr::new("-f"), zip.as_os_str(), OsStr::new("-C"), tmp.as_os_str(),
        OsStr::new("--strip-components"), OsStr::new("1"), OsStr::new("Applications/Takc.exe"), OsStr::new("Applications/Readme.html")], crate::app::tools::SHORT_TIMEOUT)?;
    if !out.status.success() || !tmp.join("Takc.exe").exists() {
        return Err(format!("แตก Takc.exe จาก {TAK_ZIP} ไม่สำเร็จ {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let _ = std::fs::copy(tmp.join("Readme.html"), dir.join("Readme.html"));
    // คัดลอกเป็นชื่อชั่วคราวก่อนแล้วเปลี่ยนชื่อ · สองงานแตกพร้อมกันไม่ได้ไฟล์ครึ่งไฟล์
    let part = dir.join(format!("Takc.partial-{}", crate::cover::poster_image::unique()));
    std::fs::copy(tmp.join("Takc.exe"), &part).map_err(|e| e.to_string())?;
    if std::fs::rename(&part, dir.join("Takc.exe")).is_err() {
        let _ = std::fs::remove_file(&part);
        if !dir.join("Takc.exe").exists() { return Err("วาง Takc.exe ไม่สำเร็จ".into()); }
    }
    Ok(())
}

/// โฟลเดอร์ตัวแปลงที่ใส่เอง · AppData\Local\ชั้นหนัง\ตัวแปลง (มอคอัปหน้าตั้งค่า)
pub fn user_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app.path().local_data_dir().map_err(|e| e.to_string())?.join("ชั้นหนัง").join("ตัวแปลง"))
}

/// เลขรุ่นจากข้อความที่ตัวแปลงตอบ · opusenc บอกรุ่นของ libopus ข้างใน
pub fn version_of(name: &str, text: &str) -> Option<String> {
    let pick = |s: &str| -> Option<String> {
        let start = s.find(|c: char| c.is_ascii_digit())?;
        let v: String = s[start..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        let v = v.trim_end_matches('.').to_string();
        v.contains('.').then_some(v)
    };
    if name == "opusenc" {
        if let Some(i) = text.find("libopus ") { return pick(&text[i + 8..]).map(|v| format!("libopus {v}")); }
    }
    let line = text.lines().find(|l| !l.trim().is_empty())?;
    let after = line.find("version").map(|i| &line[i..]).unwrap_or(line);
    pick(after)
}

fn ver_key(v: &str) -> Vec<u64> {
    v.trim_start_matches("libopus ").split('.').map(|x| x.parse().unwrap_or(0)).collect()
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncoderInfo {
    pub name: String,
    pub codecs: String,
    /// bundled แนบมากับโปรแกรม · user โฟลเดอร์ตัวแปลง · missing ไม่เจอ
    pub source: String,
    pub version: Option<String>,
    pub ok: bool,
    pub problem: Option<String>,
    pub dir: String,
    /// รุ่นไฟล์ของ Apple ที่ qaac ใช้ (จาก qaac --check "qaac 3.07, CoreAudioToolbox 7.10.9.0") · ตัวอื่นเป็น None
    /// รุ่น 7.9.8 ขึ้นไป AAC แบบ CBR เสียงผิดเพี้ยน (ประกาศใน README ของ qaac 21 ธ.ค. 2567) หน้าจอเตือนตอนเลือก CBR
    pub core_audio: Option<String>,
}

/// รุ่น CoreAudioToolbox จากข้อความที่ qaac ตอบ
pub fn core_audio_of(text: &str) -> Option<String> {
    let rest = &text[text.find("CoreAudioToolbox ")? + "CoreAudioToolbox ".len()..];
    let v: String = rest.chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
    let v = v.trim_end_matches('.');
    if v.is_empty() { None } else { Some(v.to_string()) }
}

fn probe_one(dir: &Path, name: &str, arg: &str) -> Result<String, String> {
    let exe = dir.join(format!("{name}.exe"));
    if !exe.exists() { return Err("missing".into()); }
    let out = crate::app::tools::run_tool_timeout(dir, name, [arg], crate::app::tools::SHORT_TIMEOUT)?;
    let mut t = String::from_utf8_lossy(&out.stdout).to_string();
    t.push_str(&String::from_utf8_lossy(&out.stderr));
    // Windows ตอบ 0xC0000135 = หา DLL ที่ต้องใช้ไม่เจอ (ลองแล้วกับ flac ที่ไม่มี libFLAC.dll)
    if out.status.code() == Some(-1073741515) { return Err("ขาดไฟล์ประกอบ (DLL) วางทุกไฟล์ที่มากับชุดไว้ในโฟลเดอร์เดียวกัน".into()); }
    // qaac หาไฟล์ของ Apple ไม่เจอ ตอบเองว่า ERROR: CoreAudioToolbox.dll แล้วจบด้วยรหัส 2 · เดิมนับว่าพร้อมใช้ (ข้อ 28 ลองจริง 10 พ.ย. 2569 qaac 3.07)
    if !out.status.success() && t.contains("CoreAudioToolbox") { return Err("ต้องติดตั้ง iTunes ก่อน  qaac ใช้ไฟล์ของ Apple (CoreAudioToolbox.dll) ที่มากับ iTunes หรือวางโฟลเดอร์ QTfiles64 ไว้ข้าง qaac64.exe".into()); }
    Ok(t)
}

/// สถานะตัวแปลงทุกตัว · ตัวที่อยู่ทั้งสองที่ ใช้ตัวที่รุ่นใหม่กว่า
pub fn status(tools: &Path, user: &Path) -> Vec<EncoderInfo> {
    let mut list = cli_status(tools, user);
    // Monkey's Audio เป็น DLL ไม่ใช่ตัวแปลงแบบคำสั่ง · ถามรุ่นจาก DLL เอง · วางต่อจาก wavpack
    let mac = crate::audio::ape::version(tools);
    let at = list.iter().position(|e| e.name == "wavpack").map(|i| i + 1).unwrap_or(list.len());
    list.insert(at, EncoderInfo {
        name: "MACDll64".into(), codecs: "Monkey's Audio (ใช้เฉพาะหน้าแปลงเสียง)".into(),
        source: if mac.is_ok() { "bundled".into() } else { "missing".into() },
        version: mac.as_ref().ok().filter(|v| !v.is_empty()).cloned(), ok: mac.is_ok(),
        problem: mac.as_ref().err().filter(|e| !e.starts_with("ไม่มี")).cloned(),
        dir: if mac.is_ok() { tools.to_string_lossy().to_string() } else { String::new() },
        core_audio: None,
    });
    list
}

fn cli_status(tools: &Path, user: &Path) -> Vec<EncoderInfo> {
    ENCODERS.iter().map(|(name, codecs, arg, bundled)| {
        // TAK ที่แนบมาอยู่ในโฟลเดอร์ที่แตกจาก zip ไม่ได้อยู่ในโฟลเดอร์เครื่องมือ
        let bdir = if *name == "Takc" { let d = tak_dir(user); let _ = ensure_tak(tools, &d); d } else { tools.to_path_buf() };
        let b = if *bundled { probe_one(&bdir, name, arg).ok().map(|t| (version_of(name, &t), bdir.clone(), core_audio_of(&t))) } else { None };
        let u = probe_one(user, name, arg);
        let u_ok = u.as_ref().ok().map(|t| (version_of(name, t), user.to_path_buf(), core_audio_of(t)));
        let use_user = match (&b, &u_ok) {
            (None, Some(_)) => true,
            (Some((bv, _, _)), Some((uv, _, _))) => ver_key(uv.as_deref().unwrap_or("0")) > ver_key(bv.as_deref().unwrap_or("0")),
            _ => false,
        };
        let pick = if use_user { u_ok.clone() } else { b.clone() };
        let problem = match (&pick, &u) { (None, Err(e)) if e != "missing" => Some(e.clone()), _ => None };
        EncoderInfo {
            name: name.to_string(), codecs: codecs.to_string(),
            source: match (&pick, use_user) { (None, _) => "missing".into(), (Some(_), true) => "user".into(), _ => "bundled".into() },
            version: pick.as_ref().and_then(|p| p.0.clone()), ok: pick.is_some(), problem,
            core_audio: pick.as_ref().and_then(|p| p.2.clone()),
            dir: pick.map(|p| p.1.to_string_lossy().to_string()).unwrap_or_default(),
        }
    }).collect()
}

/// โฟลเดอร์ของตัวแปลงที่จะใช้จริง · ไม่เจอที่ไหนใช้โฟลเดอร์เครื่องมือ (เรียกแล้วจะบอกว่าเรียกไม่ได้)
pub fn dir_for(list: &[EncoderInfo], tools: &Path, name: &str) -> PathBuf {
    list.iter().find(|e| e.name == name && e.ok).map(|e| PathBuf::from(&e.dir)).unwrap_or_else(|| tools.to_path_buf())
}

