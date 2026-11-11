//! จับคู่ไว้ ไม่รวม (แผนเสียงและซับ ขั้น 7 · มอคอัปหัวข้อ 5)
//! ไฟล์หนังไม่ถูกแตะ · คลังหนังจำไฟล์เสียงกับซับที่จับคู่ไว้ต่อเรื่อง พร้อมภาษาและดีเลย์
//! เปิดเล่นพร้อมไฟล์ที่จับคู่ · ส่งไฟล์ไปให้โปรแกรมเล่นทางคำสั่ง ตัวที่รับไม่ได้บอกตรง ๆ
//! mpv  --audio-file --sub-file --audio-delay --sub-delay (วินาที ค่าเดียวทุกไฟล์) --alang --slang
//! VLC  --input-slave (เสียง) --sub-file (ไฟล์เดียว) --audio-desync (มิลลิวินาที) --sub-delay (ทีละ 0.1 วินาที) --audio-language --sub-language
//! MPC-HC MPC-BE  /dub /sub · ใส่ดีเลย์จากคำสั่งไม่ได้
//! PotPlayer  /sub= (ไฟล์เดียว) · ใส่เสียงแยกกับดีเลย์จากคำสั่งไม่ได้
//! โปรแกรมหลักของ Windows (ภาพยนตร์และทีวี) รับไฟล์แยกไม่ได้ เปิดได้เฉพาะหนัง

use crate::library::LibraryStore;
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Pair {
    pub path: String,
    /// audio · subtitle
    pub kind: String,
    /// รหัสภาษาแบบ MKVToolNix เช่น tha eng
    pub lang: String,
    pub name: String,
    /// ms ติดลบ = มาเร็วขึ้น
    pub delay: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayPlan {
    /// ชื่อโปรแกรมเล่น · ว่าง = โปรแกรมหลักของ Windows
    pub player: String,
    /// คำสั่งที่จะรัน (แสดงในรุ่นทดสอบ)
    pub cmd: String,
    /// สิ่งที่โปรแกรมเล่นตัวนี้ทำไม่ได้ หรือไฟล์ที่หาไม่เจอ
    pub notes: Vec<String>,
    /// ไฟล์ที่ส่งไปจริง
    pub sent: usize,
    pub opened: bool,
}

/// ISO 639-2 เป็นรหัสสองตัวที่ mpv VLC ใช้เลือกแทร็กตามภาษา · ไม่รู้จักส่งตามเดิม
fn lang2(l: &str) -> String {
    match l { "tha" => "th", "eng" => "en", "jpn" => "ja", "kor" => "ko", "chi" | "zho" => "zh", "fre" | "fra" => "fr", "ger" | "deu" => "de", "spa" => "es", "ita" => "it", "rus" => "ru", _ => l }.to_string()
}

fn secs(ms: i64) -> String {
    let s = ms as f64 / 1000.0;
    let t = format!("{s:.3}");
    t.trim_end_matches('0').trim_end_matches('.').to_string()
}

/// อาร์กิวเมนต์ของโปรแกรมเล่นแต่ละตัว · None = โปรแกรมนี้รับไฟล์แยกไม่ได้เลย · notes = สิ่งที่ทำไม่ได้
pub fn player_args(player: Option<&Path>, movie: &Path, pairs: &[Pair]) -> (Option<Vec<OsString>>, Vec<String>) {
    let name = player.and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let audio: Vec<&Pair> = pairs.iter().filter(|p| p.kind == "audio").collect();
    let subs: Vec<&Pair> = pairs.iter().filter(|p| p.kind == "subtitle").collect();
    let mut notes = Vec::new();
    let mut a: Vec<OsString> = vec![movie.into()];
    if name.contains("mpv") {
        for p in &audio { a.push(format!("--audio-file={}", p.path).into()); }
        for p in &subs { a.push(format!("--sub-file={}", p.path).into()); }
        if let Some(p) = audio.first() {
            if p.delay != 0 { a.push(format!("--audio-delay={}", secs(p.delay)).into()); }
            if !p.lang.is_empty() { a.push(format!("--alang={}", lang2(&p.lang)).into()); }
        }
        if let Some(p) = subs.first() {
            if p.delay != 0 { a.push(format!("--sub-delay={}", secs(p.delay)).into()); }
            if !p.lang.is_empty() { a.push(format!("--slang={}", lang2(&p.lang)).into()); }
        }
        if audio.iter().skip(1).any(|p| p.delay != audio[0].delay) || subs.iter().skip(1).any(|p| p.delay != subs[0].delay) {
            notes.push("mpv ใส่ดีเลย์ได้ค่าเดียวต่อชนิด ใช้ของไฟล์แรก".into());
        }
        if audio.first().is_some_and(|p| p.delay != 0) { notes.push("ดีเลย์เสียงของ mpv ใช้กับทุกเสียง สลับไปเสียงเดิมของหนังในโปรแกรมเล่นจะเลื่อนตามด้วย".into()); }
    } else if name.contains("vlc") {
        if !audio.is_empty() { a.push(format!("--input-slave={}", audio.iter().map(|p| p.path.as_str()).collect::<Vec<_>>().join("#")).into()); }
        if let Some(p) = subs.first() { a.push(format!("--sub-file={}", p.path).into()); }
        if let Some(p) = audio.first() {
            if p.delay != 0 { a.push(format!("--audio-desync={}", p.delay).into()); }
            if !p.lang.is_empty() { a.push(format!("--audio-language={}", lang2(&p.lang)).into()); }
        }
        if let Some(p) = subs.first() {
            if p.delay != 0 { a.push(format!("--sub-delay={}", (p.delay as f64 / 100.0).round() as i64).into()); }
            if !p.lang.is_empty() { a.push(format!("--sub-language={}", lang2(&p.lang)).into()); }
        }
        if subs.len() > 1 { notes.push("VLC ใส่ซับจากคำสั่งได้ไฟล์เดียว ส่งไฟล์แรก".into()); }
        if audio.iter().skip(1).any(|p| p.delay != audio[0].delay) { notes.push("VLC ใส่ดีเลย์เสียงได้ค่าเดียว ใช้ของไฟล์แรก".into()); }
        if audio.first().is_some_and(|p| p.delay != 0) { notes.push("ดีเลย์เสียงของ VLC ใช้กับทุกเสียง สลับไปเสียงเดิมของหนังในโปรแกรมเล่นจะเลื่อนตามด้วย".into()); }
        // VLC ใช้ # คั่นไฟล์ใน --input-slave ที่อยู่ที่มี # จะขาด (ผู้ช่วยตรวจขั้น 10 ข้อ 17)
        if audio.iter().any(|p| p.path.contains('#')) { notes.push("ที่อยู่ไฟล์เสียงมีเครื่องหมาย # VLC อ่านไม่ได้ ย้ายไฟล์ไปโฟลเดอร์ที่ชื่อไม่มี # หรือใช้โปรแกรมเล่นอื่น".into()); }
    } else if name.contains("mpc-hc") || name.contains("mpc-be") {
        for p in &audio { a.push("/dub".into()); a.push((&p.path).into()); }
        for p in &subs { a.push("/sub".into()); a.push((&p.path).into()); }
        if pairs.iter().any(|p| p.delay != 0) {
            let who = if name.contains("mpc-be") { "MPC-BE" } else { "MPC-HC" };
            notes.push(format!("{who} ใส่ดีเลย์จากคำสั่งไม่ได้ ตั้งเองในโปรแกรมเล่น ({})", pairs.iter().filter(|p| p.delay != 0).map(|p| format!("{} {}{} ms", if p.kind == "audio" { "เสียง" } else { "ซับ" }, if p.delay < 0 { "−" } else { "+" }, p.delay.abs())).collect::<Vec<_>>().join(", ")));
        }
    } else if name.contains("potplayer") {
        if let Some(p) = subs.first() { a.push(format!("/sub={}", p.path).into()); }
        if !audio.is_empty() { notes.push("PotPlayer ใส่เสียงแยกจากคำสั่งไม่ได้ เปิดได้เฉพาะหนังกับซับ".into()); }
        if subs.len() > 1 { notes.push("PotPlayer ใส่ซับจากคำสั่งได้ไฟล์เดียว ส่งไฟล์แรก".into()); }
        if pairs.iter().any(|p| p.delay != 0) { notes.push("PotPlayer ใส่ดีเลย์จากคำสั่งไม่ได้ ตั้งเองในโปรแกรมเล่น".into()); }
    } else if player.is_some() {
        // โปรแกรมเล่นที่ตั้งไว้แต่ไม่รู้จัก เปิดหนังด้วยโปรแกรมนั้น ส่งแค่ไฟล์หนัง (ผู้ช่วยตรวจขั้น 10 ข้อ 16 · เดิมเปิดโปรแกรมหลักของ Windows แทน)
        let who = player.and_then(|p| p.file_stem()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        notes.push(format!("โปรแกรมไม่รู้วิธีส่งเสียงกับซับแยกให้ {who} เปิดได้เฉพาะหนัง  ถ้าอยากได้ไฟล์ที่จับคู่ด้วย ให้เลือก VLC MPC-HC PotPlayer หรือ mpv ในหน้าตั้งค่า"));
        return (Some(a), notes);
    } else {
        notes.push("โปรแกรมเล่นหลักของ Windows รับไฟล์เสียงกับซับแยกไม่ได้ จึงเปิดได้เฉพาะหนัง  ให้เลือก VLC MPC-HC PotPlayer หรือ mpv ในหน้าตั้งค่า".into());
        return (None, notes);
    }
    (Some(a), notes)
}

fn quote(a: &OsString) -> String {
    let s = a.to_string_lossy();
    if s.contains([' ', '(', ')']) { format!("\"{s}\"") } else { s.to_string() }
}

/// บันทึกการจับคู่ของหนังหนึ่งเรื่อง (แทนของเดิมทั้งชุด) · ว่าง = เลิกจับคู่
#[tauri::command]
pub fn pair_set(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, movie: String, pairs: Vec<Pair>) -> Result<crate::library::Movie, String> {
    let key = movie.to_lowercase();
    let id = lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == key).map(|m| m.id.clone())
        .ok_or("หนังเรื่องนี้ไม่ได้อยู่บนชั้น เพิ่มโฟลเดอร์ของหนังในหน้าตั้งค่าก่อน")?;
    let m = lib.update_movie(&id, |m| m.pairs = pairs).ok_or("หาหนังในคลังไม่เจอ")?;
    lib.save()?;
    let _ = app.emit("movie-updated", &m);
    Ok(m)
}

/// ไฟล์ที่จับคู่ยังอยู่ไหม ทีละไฟล์
#[tauri::command]
pub fn pair_check(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

/// เปิดเล่นพร้อมไฟล์ที่จับคู่ · ไฟล์ที่หาไม่เจอไม่ส่ง บอกใน notes · dry (เฉพาะรุ่นทดสอบ) ไม่เปิด คืนคำสั่ง
#[tauri::command]
pub fn pair_play(app: AppHandle, lib: State<'_, Arc<LibraryStore>>, movie: String, dry: Option<bool>) -> Result<PlayPlan, String> {
    let dry = cfg!(debug_assertions) && dry.unwrap_or(false);
    let key = movie.to_lowercase();
    let m = lib.movies.lock().unwrap().iter().find(|m| m.path.to_lowercase() == key).cloned().ok_or("หาหนังในคลังไม่เจอ")?;
    let file = PathBuf::from(&m.path);
    if !file.exists() { return Err("หาไฟล์หนังไม่เจอ ไดรฟ์อาจถอดออกอยู่".into()); }
    let mut notes = Vec::new();
    let found: Vec<Pair> = m.pairs.iter().filter(|p| {
        let ok = Path::new(&p.path).exists();
        if !ok { notes.push(format!("หา{}ที่จับคู่ไม่เจอ {}  ไดรฟ์อาจถอดออกอยู่ หรือไฟล์ถูกย้าย", if p.kind == "audio" { "เสียง" } else { "ซับ" }, p.path)); }
        ok
    }).cloned().collect();
    let player = crate::check::player_for(&app, &file)?;
    let (args, more) = player_args(player.as_deref(), &file, &found);
    notes.extend(more);
    let name = player.as_ref().and_then(|p| p.file_stem()).map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let (cmd, sent) = match (&player, &args) {
        (Some(exe), Some(a)) => (format!("{} {}", quote(&exe.clone().into_os_string()), a.iter().map(quote).collect::<Vec<_>>().join(" ")), if a.len() > 1 { found.len() } else { 0 }),
        _ => (quote(&file.clone().into_os_string()), 0),
    };
    let mut opened = false;
    if !dry {
        match (&player, args) {
            (Some(exe), Some(a)) => { std::process::Command::new(exe).args(a).spawn().map_err(|e| format!("เปิดโปรแกรมเล่นหนังไม่ได้: {e}"))?; }
            _ => {
                use tauri_plugin_opener::OpenerExt;
                app.opener().open_path(m.path.clone(), None::<&str>).map_err(|e| format!("เปิดเล่นไม่ได้: {e}"))?;
            }
        }
        opened = true;
    }
    Ok(PlayPlan { player: name, cmd, notes, sent, opened })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs() -> Vec<Pair> {
        vec![
            Pair { path: "D:\\เสียง\\พากย์ไทย DELAY -120ms.ac3".into(), kind: "audio".into(), lang: "tha".into(), name: "พากย์ไทย".into(), delay: -120 },
            Pair { path: "E:\\ซับ\\เรื่อง.th.srt".into(), kind: "subtitle".into(), lang: "tha".into(), name: "".into(), delay: 500 },
        ]
    }
    fn s(a: &Option<Vec<OsString>>) -> String {
        a.as_ref().unwrap().iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>().join(" | ")
    }
    const M: &str = "D:\\หนัง\\ดาวตก (2024).mkv";

    /// คำสั่งของโปรแกรมเล่นทุกตัว · ตัวที่ทำไม่ได้บอกตรง ๆ
    #[test]
    fn player_commands() {
        let (a, n) = player_args(Some(Path::new("C:\\mpv\\mpv.exe")), Path::new(M), &pairs());
        assert_eq!(s(&a), format!("{M} | --audio-file=D:\\เสียง\\พากย์ไทย DELAY -120ms.ac3 | --sub-file=E:\\ซับ\\เรื่อง.th.srt | --audio-delay=-0.12 | --alang=th | --sub-delay=0.5 | --slang=th"));
        // ดีเลย์เสียงของ mpv VLC ใช้กับทุกเสียง บอกให้รู้ (ผู้ช่วยตรวจขั้น 10 ข้อ 17)
        assert_eq!(n, vec!["ดีเลย์เสียงของ mpv ใช้กับทุกเสียง สลับไปเสียงเดิมของหนังในโปรแกรมเล่นจะเลื่อนตามด้วย".to_string()]);
        let (a, n) = player_args(Some(Path::new("C:\\Program Files\\VideoLAN\\VLC\\vlc.exe")), Path::new(M), &pairs());
        assert_eq!(s(&a), format!("{M} | --input-slave=D:\\เสียง\\พากย์ไทย DELAY -120ms.ac3 | --sub-file=E:\\ซับ\\เรื่อง.th.srt | --audio-desync=-120 | --audio-language=th | --sub-delay=5 | --sub-language=th"));
        assert_eq!(n.len(), 1, "{n:?}");
        // โปรแกรมเล่นที่ไม่รู้จัก เปิดด้วยโปรแกรมนั้น ส่งแค่ไฟล์หนัง (ข้อ 16)
        let (a, n) = player_args(Some(Path::new(r"C:\SMPlayer\smplayer.exe")), Path::new(M), &pairs());
        assert_eq!(s(&a), M);
        assert!(n[0].contains("smplayer") && n[0].contains("เปิดได้เฉพาะหนัง"), "{n:?}");
        // VLC ที่อยู่มี # อ่านไม่ได้ บอก
        let mut hp = pairs();
        hp[0].path = r"D:\เสียง\#Thai\a.ac3".into();
        assert!(player_args(Some(Path::new(r"C:\VLC\vlc.exe")), Path::new(M), &hp).1.iter().any(|x| x.contains('#')));
        let (a, n) = player_args(Some(Path::new("C:\\K-Lite\\mpc-hc64.exe")), Path::new(M), &pairs());
        assert_eq!(s(&a), format!("{M} | /dub | D:\\เสียง\\พากย์ไทย DELAY -120ms.ac3 | /sub | E:\\ซับ\\เรื่อง.th.srt"));
        assert_eq!(n, vec!["MPC-HC ใส่ดีเลย์จากคำสั่งไม่ได้ ตั้งเองในโปรแกรมเล่น (เสียง −120 ms, ซับ +500 ms)".to_string()]);
        let (a, n) = player_args(Some(Path::new("C:\\MPC-BE x64\\mpc-be64.exe")), Path::new(M), &pairs()[..1]);
        assert!(s(&a).contains("/dub") && n[0].starts_with("MPC-BE"));
        let (a, n) = player_args(Some(Path::new("C:\\DAUM\\PotPlayer\\PotPlayerMini64.exe")), Path::new(M), &pairs());
        assert_eq!(s(&a), format!("{M} | /sub=E:\\ซับ\\เรื่อง.th.srt"));
        assert!(n.iter().any(|x| x.contains("เสียงแยก")) && n.iter().any(|x| x.contains("ดีเลย์")));
        let (a, n) = player_args(None, Path::new(M), &pairs());
        assert!(a.is_none() && n[0].contains("โปรแกรมเล่นหลักของ Windows"));
        // ซับสองไฟล์ดีเลย์ต่างกัน
        let mut two = pairs();
        two.push(Pair { path: "E:\\ซับ\\เรื่อง.en.srt".into(), kind: "subtitle".into(), lang: "eng".into(), name: "".into(), delay: 0 });
        assert!(player_args(Some(Path::new("mpv.exe")), Path::new(M), &two).1[0].contains("ค่าเดียว"));
        assert!(player_args(Some(Path::new("vlc.exe")), Path::new(M), &two).1[0].contains("ไฟล์เดียว"));
    }

    /// คลังเก่าที่ไม่มีช่องจับคู่ยังอ่านได้ · บันทึกแล้วอ่านกลับได้ครบ
    #[test]
    fn pairs_round_trip() {
        let old: crate::library::Movie = serde_json::from_str(r#"{"id":"1","path":"D:\\a.mkv","name":"a"}"#).unwrap();
        assert!(old.pairs.is_empty());
        let mut m = old.clone();
        m.pairs = pairs();
        let back: crate::library::Movie = serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
        assert_eq!(back.pairs, pairs());
    }
}
