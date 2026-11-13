//! ฟอนต์ของซับ ASS (พี่กันสั่ง 8 พ.ย. 2569 "พวกซับ ass มันต้องฝังฟ้อนด้วยนี่นา ให้มีระบบนี้ด้วยนะ")
//! ซับ ASS บอกแค่ชื่อฟอนต์ ไม่มีตัวฟอนต์ · ถ้าเครื่องที่เปิดหนังไม่มีฟอนต์นั้น ตัวหนังสือเปลี่ยนหน้าตา ภาษาไทยอาจเป็นกล่อง
//! จึงหาไฟล์ฟอนต์ที่ซับใช้ แล้วให้งานรวมฝังไปกับไฟล์ MKV (ไฟล์แนบ) โปรแกรมเล่นที่ใช้ libass (mpv VLC MPC) โหลดจากในไฟล์เอง
//!
//! ① ชื่อฟอนต์ที่ซับใช้ อ่านจากช่อง Fontname ของทุกสไตล์ กับคำสั่ง \fn ในบรรทัดซับ (ตัด @ ของฟอนต์แนวตั้งออก)
//! ② หาไฟล์ฟอนต์ตามลำดับ โฟลเดอร์ข้างซับ (และโฟลเดอร์ย่อย fonts) → ฟอนต์ที่ลงเฉพาะผู้ใช้ → ฟอนต์ของ Windows
//!    เทียบกับชื่อที่อ่านจากในไฟล์ฟอนต์จริง (ตาราง name ชื่อครอบครัว ชื่อเต็ม ชื่อครอบครัวแบบพิมพ์) ไม่เดาจากชื่อไฟล์
//!    อ่านเฉพาะหัวไฟล์กับตาราง name ไม่อ่านทั้งไฟล์ (ฟอนต์จีนบางตัว 20 MB)

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::Serialize;

pub const FONT_EXT: [&str; 4] = ["ttf", "otf", "ttc", "otc"];

fn push_name(out: &mut Vec<String>, n: &str) {
    let n = n.trim().trim_start_matches('@').trim();
    if !n.is_empty() && !out.iter().any(|x| x.eq_ignore_ascii_case(n)) {
        out.push(n.to_string());
    }
}

/// ชื่อฟอนต์ทุกตัวที่ซับ ASS SSA ใช้ ตามลำดับที่เจอ ไม่ซ้ำ
pub fn ass_fonts(text: &str) -> Vec<String> {
    let mut out = vec![];
    let mut in_styles = false;
    let (mut idx, mut fields) = (1usize, 0usize);
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with('[') {
            in_styles = l.to_ascii_lowercase().contains("styles");
            continue;
        }
        if in_styles {
            if let Some(f) = l.strip_prefix("Format:") {
                let cols: Vec<String> = f.split(',').map(|c| c.trim().to_ascii_lowercase()).collect();
                idx = cols.iter().position(|c| c == "fontname").unwrap_or(1);
                fields = cols.len();
            } else if let Some(s) = l.strip_prefix("Style:") {
                let parts: Vec<&str> = if fields > 0 { s.splitn(fields, ',').collect() } else { s.split(',').collect() };
                if let Some(n) = parts.get(idx) { push_name(&mut out, n); }
            }
        } else if let Some(d) = l.strip_prefix("Dialogue:") {
            // คำสั่ง \fnชื่อฟอนต์ ในวงเล็บปีกกา · \fn เปล่าคือกลับไปใช้ฟอนต์ของสไตล์
            let mut rest = d;
            while let Some(i) = rest.find("\\fn") {
                let after = &rest[i + 3..];
                let end = after.find(['\\', '}']).unwrap_or(after.len());
                push_name(&mut out, &after[..end]);
                rest = &after[end..];
            }
        }
    }
    out
}

fn read_at(f: &mut File, off: u64, len: usize) -> Option<Vec<u8>> {
    f.seek(SeekFrom::Start(off)).ok()?;
    let mut b = vec![0u8; len];
    f.read_exact(&mut b).ok()?;
    Some(b)
}
fn u16be(b: &[u8], i: usize) -> usize { u16::from_be_bytes([b[i], b[i + 1]]) as usize }
fn u32be(b: &[u8], i: usize) -> u64 { u32::from_be_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as u64 }

fn names_inner(path: &Path) -> Option<Vec<String>> {
    let mut f = File::open(path).ok()?;
    let head = read_at(&mut f, 0, 12)?;
    // ไฟล์รวมหลายฟอนต์ (TTC) มีหัว ttcf ตามด้วยตำแหน่งของแต่ละฟอนต์
    let offsets: Vec<u64> = if &head[0..4] == b"ttcf" {
        let n = (u32be(&head, 8) as usize).min(64);
        let b = read_at(&mut f, 12, 4 * n)?;
        (0..n).map(|i| u32be(&b, 4 * i)).collect()
    } else {
        vec![0]
    };
    let mut out = vec![];
    for off in offsets {
        let h = read_at(&mut f, off, 12)?;
        let num = u16be(&h, 4).min(128);
        let recs = read_at(&mut f, off + 12, 16 * num)?;
        let Some(r) = (0..num).map(|i| i * 16).find(|&r| &recs[r..r + 4] == b"name") else { continue };
        let (t_off, t_len) = (u32be(&recs, r + 8), (u32be(&recs, r + 12) as usize).min(1 << 20));
        let t = read_at(&mut f, t_off, t_len)?;
        if t.len() < 6 { continue; }
        let (count, base) = (u16be(&t, 2), u16be(&t, 4));
        for i in 0..count {
            let p = 6 + 12 * i;
            if p + 12 > t.len() { break; }
            let (plat, enc, id, len, so) = (u16be(&t, p), u16be(&t, p + 2), u16be(&t, p + 6), u16be(&t, p + 8), u16be(&t, p + 10));
            // 1 ชื่อครอบครัว · 4 ชื่อเต็ม · 16 ชื่อครอบครัวแบบพิมพ์
            if !matches!(id, 1 | 4 | 16) { continue; }
            let Some(s) = t.get(base + so..base + so + len) else { continue };
            let name = match (plat, enc) {
                (0, _) | (3, 0 | 1 | 10) => String::from_utf16_lossy(&s.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect::<Vec<_>>()),
                (1, 0) => s.iter().map(|&c| c as char).collect(),
                _ => continue,
            };
            push_name(&mut out, &name);
        }
    }
    Some(out)
}

/// ชื่อของฟอนต์ในไฟล์ (ครอบครัว ชื่อเต็ม) · ไม่ใช่ไฟล์ฟอนต์หรืออ่านไม่ได้ = ว่าง
pub fn font_names(path: &Path) -> Vec<String> {
    names_inner(path).unwrap_or_default()
}

fn font_files(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir).map(|rd| rd.filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|e| FONT_EXT.contains(&e.to_string_lossy().to_lowercase().as_str())).unwrap_or(false))
        .collect()).unwrap_or_default()
}

type Index = Vec<(PathBuf, Vec<String>)>;

fn index_of(dirs: &[PathBuf]) -> Index {
    dirs.iter().flat_map(|d| font_files(d)).map(|p| { let n = font_names(&p); (p, n) }).filter(|(_, n)| !n.is_empty()).collect()
}

/// ฟอนต์ที่ลงเฉพาะผู้ใช้ กับฟอนต์ของ Windows · อ่านครั้งแรกที่ใช้แล้วจำไว้ (ลงฟอนต์ใหม่ระหว่างเปิดโปรแกรม ต้องปิดเปิดใหม่)
fn system_index() -> &'static (Index, Index) {
    static IDX: OnceLock<(Index, Index)> = OnceLock::new();
    IDX.get_or_init(|| {
        let user = std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join("Microsoft").join("Windows").join("Fonts"));
        let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
        (index_of(&user.into_iter().collect::<Vec<_>>()), index_of(&[win]))
    })
}

/// ชื่อตระกูลฟอนต์ทุกตัวที่ลงในเครื่อง (ลงเฉพาะผู้ใช้กับของ Windows) เรียงตามตัวอักษร ไม่ซ้ำ
/// หน้าต่างเลือกฟอนต์ของปุ่ม fn ในหน้าแก้ซับใช้ (แผนหน้าแก้ซับ ขั้น 3)
#[tauri::command]
pub async fn font_families() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (user, win) = system_index();
        let mut v: Vec<String> = user.iter().chain(win.iter()).filter_map(|(_, n)| n.first().cloned()).collect();
        v.sort_by_key(|a| a.to_lowercase());
        v.dedup_by(|a, b| a.eq_ignore_ascii_case(b));
        v
    }).await.unwrap_or_default()
}

/// โฟลเดอร์ข้างซับ กับโฟลเดอร์ย่อยที่ชุดซับมักใส่ฟอนต์ไว้
fn folders_of(sub: &Path) -> Vec<PathBuf> {
    let Some(dir) = sub.parent() else { return vec![] };
    let mut v = vec![dir.to_path_buf()];
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if e.path().is_dir() && matches!(n.as_str(), "fonts" | "font" | "attachments" | "attachment") { v.push(e.path()); }
        }
    }
    v
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontHit {
    /// ชื่อที่ซับเรียก
    pub name: String,
    pub file: Option<String>,
    /// folder ข้างซับ · user ลงเฉพาะผู้ใช้ · system ของ Windows · ว่าง = ไม่เจอ
    pub from: String,
    pub size: u64,
}

fn norm(s: &str) -> String { s.chars().filter(|c| !matches!(c, ' ' | '-' | '_')).flat_map(|c| c.to_lowercase()).collect() }

fn find_in<'a>(idx: &'a Index, want: &str) -> Option<&'a PathBuf> {
    idx.iter().find(|(_, n)| n.iter().any(|x| x.eq_ignore_ascii_case(want)))
        .or_else(|| idx.iter().find(|(_, n)| n.iter().any(|x| norm(x) == norm(want))))
        .map(|(p, _)| p)
}

/// หาไฟล์ฟอนต์ของทุกชื่อที่ซับใช้
pub fn find(sub: &Path, wanted: &[String]) -> Vec<FontHit> {
    let local = index_of(&folders_of(sub));
    let (user, win) = system_index();
    wanted.iter().map(|w| {
        let hit = find_in(&local, w).map(|p| (p, "folder")).or_else(|| find_in(user, w).map(|p| (p, "user"))).or_else(|| find_in(win, w).map(|p| (p, "system")));
        FontHit {
            name: w.clone(),
            size: hit.and_then(|(p, _)| std::fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0),
            file: hit.map(|(p, _)| p.to_string_lossy().to_string()),
            from: hit.map(|(_, f)| f.to_string()).unwrap_or_default(),
        }
    }).collect()
}

/// ชนิดไฟล์แนบของฟอนต์ใน MKV (ชื่อที่ MKVToolNix ใช้ · โปรแกรมเล่นที่ใช้ libass รู้จัก)
pub fn mime_of(p: &Path) -> &'static str {
    match p.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref() {
        Some("otf") => "font/otf",
        Some("ttc" | "otc") => "font/collection",
        _ => "font/ttf",
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FontFile { pub path: String, pub file: String, pub names: Vec<String>, pub size: u64 }

/// อ่านชื่อของไฟล์ฟอนต์ที่ลากมาเพิ่มเอง
#[tauri::command]
pub fn font_info(path: String) -> Result<FontFile, String> {
    let p = PathBuf::from(&path);
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !FONT_EXT.contains(&ext.as_str()) { return Err(format!("ไฟล์ .{ext} ไม่ใช่ไฟล์ฟอนต์ (ใช้ได้ .ttf .otf .ttc)")); }
    let size = std::fs::metadata(&p).map_err(|_| "หาไฟล์ไม่เจอ".to_string())?.len();
    let names = font_names(&p);
    if names.is_empty() { return Err("อ่านชื่อฟอนต์ในไฟล์ไม่ได้ ไฟล์อาจเสีย".into()); }
    Ok(FontFile { file: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(), path, names, size })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_fonts_from_styles_and_overrides() {
        let ass = "[Script Info]\nTitle: x\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour\nStyle: Default,Tahoma,48,&H00FFFFFF\nStyle: Sign,@Leelawadee UI,40,&H00FFFFFF\nStyle: Copy,tahoma,30,&H0\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fnComic Sans MS\\b1}สวัสดี{\\fn}ครับ\nDialogue: 0,0:00:03.00,0:00:04.00,Sign,,0,0,0,,{\\fs20\\fnฟอนต์ไม่มีในเครื่อง}ป้าย\n";
        assert_eq!(ass_fonts(ass), ["Tahoma", "Leelawadee UI", "Comic Sans MS", "ฟอนต์ไม่มีในเครื่อง"], "ไม่ซ้ำตัวพิมพ์เล็กใหญ่ · ตัด @ · \\fn เปล่าไม่นับ");
        // ลำดับช่องต่างจากปกติ ใช้ช่อง Fontname ตามบรรทัด Format
        assert_eq!(ass_fonts("[V4 Styles]\nFormat: Fontname, Name\nStyle: Georgia,Default\n"), ["Georgia"]);
    }

    #[test]
    fn reads_names_inside_windows_fonts() {
        let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
        let tahoma = font_names(&win.join("tahoma.ttf"));
        assert!(tahoma.iter().any(|n| n == "Tahoma"), "{tahoma:?}");
        // ไฟล์รวมหลายฟอนต์ (TTC) อ่านได้ทุกตัว
        if win.join("msgothic.ttc").exists() {
            let g = font_names(&win.join("msgothic.ttc"));
            assert!(g.iter().any(|n| n.eq_ignore_ascii_case("MS Gothic")) && g.iter().any(|n| n.eq_ignore_ascii_case("MS PGothic")), "{g:?}");
        }
        assert!(font_names(Path::new("C:\\Windows\\notepad.exe")).is_empty(), "ไฟล์ที่ไม่ใช่ฟอนต์ได้ว่าง");
    }

    #[test]
    fn finds_folder_fonts_first_then_windows() {
        let dir = std::env::temp_dir().join(format!("ms-fonts-{}", crate::poster_image::unique()));
        std::fs::create_dir_all(dir.join("Fonts")).unwrap();
        let win = PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into())).join("Fonts");
        // ชุดซับที่มีฟอนต์ในโฟลเดอร์ย่อย Fonts · ชื่อไฟล์ไม่บอกชื่อฟอนต์ ต้องอ่านจากในไฟล์
        std::fs::copy(win.join("georgia.ttf"), dir.join("Fonts").join("f01.ttf")).unwrap();
        let sub = dir.join("x.ass");
        std::fs::write(&sub, "").unwrap();
        let hits = find(&sub, &["Georgia".into(), "tahoma".into(), "ฟอนต์ไม่มีในเครื่อง".into()]);
        assert_eq!(hits[0].from, "folder");
        assert!(hits[0].file.as_deref().unwrap().ends_with("f01.ttf"));
        assert_eq!(hits[1].from, "system");
        assert!(hits[1].file.as_deref().unwrap().to_lowercase().ends_with("tahoma.ttf"));
        assert!(hits[1].size > 0);
        assert_eq!((hits[2].file.as_deref(), hits[2].from.as_str()), (None, ""));
        assert_eq!(mime_of(Path::new("a.TTF")), "font/ttf");
        assert_eq!(mime_of(Path::new("a.otf")), "font/otf");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
