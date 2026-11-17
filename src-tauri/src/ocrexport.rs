//! ส่งออกผล OCR (แผน OCR ขั้น 12) · ตาม ExportTextAsSubtitle SaveAllImagesWithHtmlIndex กับ Ok ของ OcrViewModel ใน Subtitle Edit
//! ① ซับตัวหนังสือ SubRip กับ Advanced SubStation เขียนผ่าน subdoc (รหัสอักษรที่เลือก ไม่ทับไฟล์เดิม) · ชนิดอื่นให้ SeConv ของ Subtitle Edit แปลงจากไฟล์ ASS ชั่วคราว
//! ② ซับที่อยู่บนจอ (BUGS ข้อ 143 ⑭) แยกเป็นแถวต่อกลุ่มตำแหน่งแล้วติดแท็ก {\anN} แบบ SplitTextByAlignmentGroups หรือรวมไว้ล่างจอ
//! ③ เอกสารให้หน้าแก้ซับ (ASS ขนาดภาพตามจอของซับรูป เก็บตำแหน่ง)
//! ④ ภาพทุกภาพพร้อมหน้า HTML ค้นคำได้ แปลจาก OcrHtmlExporter.cs
//! Subtitle Edit · Copyright (c) Nikolaj Olsson · MIT License (ข้อความเต็มใน tools/licenses)

use crate::subdoc::{self, Enc, Event, Item, SubDoc};
use crate::tools::{tool_command, tools_dir};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use tauri::AppHandle;

pub const SRT: &str = "SubRip";
pub const ASS: &str = "AdvancedSubStationAlpha";

/// หนึ่งบรรทัดของผล OCR · an ตำแหน่งแบบ ASS ของแต่ละบรรทัดในข้อความ (ขาดให้ใช้ตัวสุดท้าย ไม่มีเลยคือล่างกลาง)
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExpRow {
    pub start: f64,
    #[serde(default)]
    pub end: Option<f64>,
    pub text: String,
    #[serde(default)]
    pub an: Vec<u8>,
}

/// คำขอส่งออก · fmt รหัสชนิดของ SeConv (SubRip AdvancedSubStationAlpha WebVTT …) · top "tag" แยกแถวเก็บไว้บนจอ "down" รวมไว้ล่างจอ
/// enc utf8bom utf8 utf16 tis · canvas ขนาดจอของซับรูป (PlayRes ของ ASS)
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExpReq {
    pub rows: Vec<ExpRow>,
    pub fmt: String,
    pub top: String,
    pub italic: bool,
    pub enc: String,
    pub canvas: [u32; 2],
}

/// ชนิดไฟล์ที่ SeConv เขียนได้
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ExpFormat {
    pub id: String,
    pub name: String,
    pub ext: String,
}

/// เวลาจบที่ไม่รู้ (ภาพค้างท้ายไฟล์ หรือซับรูปที่ไม่บอกเวลาจบ) ใช้เวลาเริ่มของภาพถัดไป ไม่เกิน 5 วินาที
fn end_of(rows: &[ExpRow], k: usize) -> f64 {
    let r = &rows[k];
    if let Some(e) = r.end.filter(|e| *e > r.start) { return e; }
    let next = rows[k + 1..].iter().map(|x| x.start).find(|s| *s > r.start);
    next.map(|n| n.min(r.start + 5.0)).unwrap_or(r.start + 5.0)
}

fn strip_italic(s: &str) -> String { s.replace("<i>", "").replace("</i>", "") }

/// แถวของซับที่จะเขียน (เวลาเริ่ม เวลาจบ หน่วยมิลลิวินาที ข้อความแบบ SRT) · ภาพที่ไม่มีข้อความไม่ถูกเขียน
/// แยกกลุ่มบรรทัดที่ตำแหน่งต่างกันเป็นแถวที่เวลาเดียวกัน ตาม OcrAssaAlignment.SplitTextByAlignmentGroups · กลุ่มที่ไม่ใช่ล่างกลางติดแท็ก {\anN}
pub fn lines_of(req: &ExpReq) -> Vec<(i64, i64, String)> {
    let mut out = Vec::new();
    for (k, r) in req.rows.iter().enumerate() {
        let text = if req.italic { r.text.clone() } else { strip_italic(&r.text) };
        let text = text.replace("\r\n", "\n");
        let lines: Vec<&str> = text.split('\n').map(str::trim_end).filter(|l| !l.trim().is_empty()).collect();
        if lines.is_empty() { continue; }
        let (s, e) = ((r.start * 1000.0).round() as i64, (end_of(&req.rows, k) * 1000.0).round() as i64);
        let an_at = |i: usize| -> u8 { r.an.get(i).or(r.an.last()).copied().filter(|a| (1..=9).contains(a)).unwrap_or(2) };
        if req.top != "tag" {
            out.push((s, e, lines.join("\n")));
            continue;
        }
        let mut groups: Vec<(u8, Vec<&str>)> = Vec::new();
        for (i, l) in lines.iter().enumerate() {
            let a = an_at(i);
            match groups.last_mut() { Some(g) if g.0 == a => g.1.push(l), _ => groups.push((a, vec![l])) }
        }
        for (a, g) in groups {
            let body = g.join("\n");
            out.push((s, e, if a == 2 { body } else { format!("{{\\an{a}}}{body}") }));
        }
    }
    out
}

fn enc_of(name: &str) -> Enc {
    match name {
        "utf8" => Enc { charset: "UTF-8".into(), bom: false },
        "utf16" => Enc { charset: "UTF-16LE".into(), bom: true },
        "tis" => Enc { charset: "TIS-620".into(), bom: false },
        _ => Enc { charset: "UTF-8".into(), bom: true },
    }
}

/// เอกสาร SRT จากแถวที่จะเขียน (แบบท้าย subdoc::to_srt)
fn srt_doc(lines: &[(i64, i64, String)]) -> SubDoc {
    let crlf = "\r\n".to_string();
    let events = lines.iter().enumerate().map(|(k, (s, e, t))| Event { id: k as u32 + 1, start: *s, end: *e, text: t.clone(), ..Default::default() }).collect();
    SubDoc {
        kind: "srt".into(), enc: Enc { charset: "UTF-8".into(), bom: true }, eol: crlf.clone(), exact: true, bad: 0, renumber: true,
        skeleton: vec![Item::Events, Item::Line { t: String::new(), e: crlf }], style_format: vec![], event_format: vec![], styles: vec![], events, source: None,
    }
}

/// เอกสารตามชนิด · SubRip เป็น SRT ชนิดอื่นทั้งหมดเป็น ASS (เก็บตำแหน่งกับตัวเอียงไว้ให้ SeConv แปลงต่อ) ขนาดภาพตามจอของซับรูป
pub fn doc_of(req: &ExpReq) -> SubDoc {
    let srt = srt_doc(&lines_of(req));
    let mut d = if req.fmt == SRT { srt } else {
        let (w, h) = (req.canvas[0], req.canvas[1]);
        subdoc::to_ass(&srt, if w >= 16 && h >= 16 { (w, h) } else { (1920, 1080) })
    };
    d.enc = enc_of(&req.enc);
    d
}

/// ชนิดไฟล์ทั้งหมดที่ SeConv เขียนเป็นตัวหนังสือได้ (ถาม seconv formats --json ครั้งเดียวแล้วจำ) · SubRip กับ ASS อยู่บนสุด
pub fn formats(tools: &Path) -> Vec<ExpFormat> {
    static CACHE: OnceLock<Vec<ExpFormat>> = OnceLock::new();
    let base = || vec![
        ExpFormat { id: SRT.into(), name: "SubRip".into(), ext: ".srt".into() },
        ExpFormat { id: ASS.into(), name: "Advanced Sub Station Alpha".into(), ext: ".ass".into() },
    ];
    if !crate::pgs::seconv_exe(tools).exists() { return base(); }
    CACHE.get_or_init(|| {
        let args: Vec<OsString> = vec!["formats".into(), "--json".into()];
        let out = tool_command(&tools.join("seconv"), "seconv", &args).stdin(Stdio::null()).output().ok();
        let json = out.and_then(|o| serde_json::from_slice::<serde_json::Value>(&o.stdout).ok());
        let mut v = base();
        if let Some(list) = json.as_ref().and_then(|j| j["formats"].as_array()) {
            for f in list {
                if f["type"].as_str() != Some("text") || f["inputOnly"].as_bool() == Some(true) { continue; }
                let id = f["id"].as_str().unwrap_or_default().to_string();
                if id.is_empty() || id == SRT || id == ASS { continue; }
                v.push(ExpFormat { id, name: f["name"].as_str().unwrap_or_default().to_string(), ext: f["extension"].as_str().unwrap_or_default().to_string() });
            }
        }
        v
    }).clone()
}

/// ให้ SeConv แปลงไฟล์ ASS เป็นชนิด id ลงโฟลเดอร์ชั่วคราว คืนที่อยู่ไฟล์ผล
fn seconv_to(tools: &Path, input: &Path, dir: &Path, name: &str, id: &str, enc: &str) -> Result<PathBuf, String> {
    if !crate::pgs::seconv_exe(tools).exists() { return Err("ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือ ส่งออกได้เฉพาะ SubRip กับ Advanced SubStation".into()); }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let encoding = match enc { "utf16" => "utf-16", "tis" => "windows-874", _ => "utf-8" };
    let args: Vec<OsString> = vec![input.as_os_str().to_owned(), id.into(), format!("--output-folder:{}", dir.display()).into(),
        format!("--output-filename:{name}").into(), format!("--encoding:{encoding}").into(), "--overwrite".into(), "--quiet".into()];
    let mut child = tool_command(&tools.join("seconv"), "seconv", &args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เปิด SeConv ไม่ได้ {e}"))?;
    crate::winutil::kill_with_app(&child);
    let mut msg = String::new();
    if let Some(mut s) = child.stdout.take() { let _ = s.read_to_string(&mut msg); }
    if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut msg); }
    let st = child.wait().map_err(|e| e.to_string())?;
    let out = dir.join(name);
    let made = if out.is_file() { Some(out) } else {
        // บางชนิด SeConv ต่อนามสกุลของชนิดเอง ใช้ไฟล์เดียวที่ได้ในโฟลเดอร์
        std::fs::read_dir(dir).ok().and_then(|r| r.flatten().map(|e| e.path()).find(|p| p.is_file() && p != input))
    };
    match made {
        Some(p) if st.success() => {
            // SeConv เขียน UTF-8 มี BOM เสมอ · เลือกไม่มี BOM ตัดออกเอง
            if enc == "utf8" {
                if let Ok(b) = std::fs::read(&p) { if let Some(r) = b.strip_prefix(&[0xEF, 0xBB, 0xBF]) { std::fs::write(&p, r).map_err(|e| e.to_string())?; } }
            }
            Ok(p)
        }
        _ => {
            let why = msg.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with(['│', '┌', '└', '─', '╭', '╰'])).last().unwrap_or("").to_string();
            Err(format!("SeConv แปลงไฟล์ไม่สำเร็จ {why}"))
        }
    }
}

/// ข้อความทั้งไฟล์ที่จะได้ (ช่องดูตัวอย่างของหน้าต่างส่งออก) · ชนิดของ SeConv แปลงจริงลงโฟลเดอร์ชั่วคราวแล้วอ่านกลับ
pub fn preview(tools: &Path, work: &Path, req: &ExpReq) -> Result<String, String> {
    let doc = doc_of(req);
    if req.fmt == SRT || req.fmt == ASS { return Ok(subdoc::render(&doc)); }
    let dir = work.join(format!("ocrexp-{}", crate::poster_image::unique()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let input = dir.join("ocr.ass");
    let r = std::fs::write(&input, subdoc::to_bytes(&SubDoc { enc: enc_of("utf8bom"), ..doc }).0).map_err(|e| e.to_string())
        .and_then(|_| seconv_to(tools, &input, &dir.join("out"), "ocr", &req.fmt, "utf8"))
        .and_then(|p| std::fs::read(&p).map_err(|e| e.to_string()));
    let _ = std::fs::remove_dir_all(&dir);
    let b = r?;
    Ok(subdoc::decode(&b).0)
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExpOut {
    pub path: String,
    pub lines: usize,
    pub bytes: u64,
}

/// เขียนไฟล์ส่งออก · ไฟล์ชื่อนี้มีอยู่แล้วคืน Err("exists") ไม่เขียนทับ
pub fn export(tools: &Path, work: &Path, req: &ExpReq, target: &Path) -> Result<ExpOut, String> {
    if target.exists() { return Err("exists".into()); }
    let doc = doc_of(req);
    let lines = doc.events.len();
    if lines == 0 { return Err("ยังไม่มีบรรทัดที่มีข้อความให้ส่งออก".into()); }
    if req.fmt == SRT || req.fmt == ASS {
        let saved = subdoc::save(&doc, target, "new", false)?;
        return Ok(ExpOut { path: saved.path, lines, bytes: std::fs::metadata(target).map(|m| m.len()).unwrap_or(0) });
    }
    let dir = work.join(format!("ocrexp-{}", crate::poster_image::unique()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let input = dir.join("ocr.ass");
    let name = target.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "ocr".into());
    // ผลของ SeConv อยู่ในโฟลเดอร์ทำงานของโปรแกรม (ไดรฟ์ C) ที่เก็บอาจอยู่คนละไดรฟ์ ย้ายข้ามไดรฟ์ไม่ได้
    // จึงลอกเป็นไฟล์ชั่วคราวข้างที่เก็บก่อน แล้วเปลี่ยนชื่อในไดรฟ์เดียวกันแบบไม่ทับ (เจอตอนตรวจขั้น 12 ส่งออก WebVTT ไปไดรฟ์ D)
    let partial = subdoc::partial_of(target);
    let r = std::fs::write(&input, subdoc::to_bytes(&SubDoc { enc: enc_of("utf8bom"), ..doc }).0).map_err(|e| e.to_string())
        .and_then(|_| seconv_to(tools, &input, &dir.join("out"), &name, &req.fmt, &req.enc))
        .and_then(|p| std::fs::copy(&p, &partial).map(|_| ()).map_err(|e| format!("เขียนไฟล์ไม่ได้ {e}")))
        .and_then(|_| crate::rename::move_no_replace(&partial, target).map_err(|e| if e.kind == "duplicate" { "exists".to_string() } else { e.title }));
    let _ = std::fs::remove_dir_all(&dir);
    if r.is_err() { let _ = std::fs::remove_file(&partial); }
    r?;
    crate::actlog::note("ส่งออกซับจาก OCR", &format!("{} ({})", target.display(), req.fmt));
    Ok(ExpOut { path: target.display().to_string(), lines, bytes: std::fs::metadata(target).map(|m| m.len()).unwrap_or(0) })
}

// ---------------------------------------------------------------- ภาพพร้อมหน้า HTML (OcrHtmlExporter.cs)

fn esc(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;") }

fn tc(sec: f64) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as i64;
    format!("{:02}:{:02}:{:02},{:03}", ms / 3_600_000, ms / 60_000 % 60, ms / 1000 % 60, ms % 1000)
}

/// ข้อความ OCR เข้ารหัส HTML แล้วคืนแท็ก i b u ที่ซับใช้ให้แสดงผลได้ (FormatText)
fn fmt_text(t: &str) -> String {
    let mut e = esc(t);
    for tag in ["i", "b", "u"] { e = e.replace(&format!("&lt;{tag}&gt;"), &format!("<{tag}>")).replace(&format!("&lt;/{tag}&gt;"), &format!("</{tag}>")); }
    e.replace("\r\n", "<br />").replace('\n', "<br />")
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HtmlOut {
    pub folder: String,
    pub html: String,
    pub images: usize,
    pub empty: usize,
}

/// ภาพทุกภาพของงาน OCR เป็น images/0001.png พร้อม index.html ที่ค้นคำ กรองบรรทัดที่ไม่มีข้อความ และเลือกพื้นหลังภาพได้
/// เขียนลงโฟลเดอร์ใหม่ "<ชื่อซับ> OCR" ในโฟลเดอร์ที่เลือก ชื่อชนต่อเลขท้าย ไม่ทับของเดิม (Subtitle Edit เขียนลงโฟลเดอร์ที่เลือกตรง ๆ)
pub fn save_html(files: &[(PathBuf, f64, Option<f64>, u32, u32)], texts: &[String], parent: &Path, source: &str, on: &dyn Fn(f64)) -> Result<HtmlOut, String> {
    if files.len() != texts.len() { return Err("รายการภาพไม่ตรงกับบรรทัดในหน้า OCR เปิดซับใหม่แล้วลองอีกครั้ง".into()); }
    let stem = Path::new(source).file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| "ซับรูป".into());
    let folder = crate::outfile::free_name(parent, Path::new(&format!("{stem} OCR")));
    let images = folder.join("images");
    std::fs::create_dir_all(&images).map_err(|e| format!("สร้างโฟลเดอร์ไม่ได้ {e}"))?;
    let mut rows = String::new();
    let (mut count, mut empty) = (0usize, 0usize);
    for (k, ((file, start, end, w, h), text)) in files.iter().zip(texts).enumerate() {
        let name = format!("{:04}.png", k + 1);
        if std::fs::copy(file, images.join(&name)).is_err() { continue; }
        count += 1;
        let plain = text.replace("<i>", "").replace("</i>", "").replace("<b>", "").replace("</b>", "").replace("<u>", "").replace("</u>", "");
        let is_empty = plain.trim().is_empty();
        if is_empty { empty += 1; }
        let dur = end.map(|e| format!("{:.3}", (e - start).max(0.0))).unwrap_or_else(|| "–".into());
        let search = esc(&plain.replace(['\r', '\n'], " ").to_lowercase());
        rows.push_str(&format!("<article class=\"item\" data-text=\"{search}\" data-empty=\"{}\">\n", if is_empty { 1 } else { 0 }));
        rows.push_str(&format!("<div class=\"bar\"><span class=\"num\">#{}</span><span class=\"time\">{}<span class=\"arrow\">&#8594;</span>{}</span><span class=\"chip\">{dur}&#8201;s</span><span class=\"chip dim\">{w}&#215;{h}</span></div>\n",
            k + 1, tc(*start), end.map(tc).unwrap_or_else(|| "–".into())));
        rows.push_str(&format!("<div class=\"body\"><div class=\"shot\"><img src=\"images/{name}\" alt=\"#{}\" loading=\"lazy\" /></div>\n", k + 1));
        if is_empty { rows.push_str("<div class=\"text empty\">ภาพนี้ยังไม่มีข้อความ</div>\n"); } else { rows.push_str(&format!("<div class=\"text\">{}</div>\n", fmt_text(text))); }
        rows.push_str("</div></article>\n");
        on((k + 1) as f64 / files.len() as f64);
    }
    let html = HTML.replace("{TITLE}", &esc(&Path::new(source).file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| stem.clone())))
        .replace("{SUB}", &format!("{} ภาพ ไม่มีข้อความ {} ภาพ", count, empty))
        .replace("{ROWS}", &rows);
    let index = folder.join("index.html");
    std::fs::write(&index, html.as_bytes()).map_err(|e| format!("เขียน index.html ไม่ได้ {e}"))?;
    crate::actlog::note("บันทึกภาพซับพร้อมหน้า HTML", &format!("{} ({} ภาพ)", folder.display(), count));
    Ok(HtmlOut { folder: folder.display().to_string(), html: index.display().to_string(), images: count, empty })
}

/// หน้า HTML ไฟล์เดียว ไม่พึ่งไฟล์อื่น · โครง สไตล์ และสคริปต์จาก OcrHtmlExporter.cs ของ Subtitle Edit (MIT) คำบนหน้าเป็นภาษาไทย
const HTML: &str = r#"<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{TITLE} - ภาพซับกับข้อความ OCR</title>
<!-- ทำจากชั้นหนัง โครงหน้าแปลจาก OcrHtmlExporter ของ Subtitle Edit (MIT License, Copyright (c) Nikolaj Olsson) -->
<style>
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light dark;--bg:#f4f6f9;--surface:#fff;--surface-2:#eef1f6;--border:#dde2ea;--text:#141922;--muted:#5b6575;--accent:#2f6fd0;--warn-bg:#fdf3e2;--warn-border:#efd9ad;--warn-text:#8a5a08;--shadow:0 1px 2px rgba(16,24,40,.06),0 10px 26px rgba(16,24,40,.07)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e1116;--surface:#171b22;--surface-2:#1d222b;--border:#2a3140;--text:#e7ebf2;--muted:#9aa4b6;--accent:#79aaf5;--warn-bg:#2b2213;--warn-border:#54421f;--warn-text:#e9c374;--shadow:0 1px 2px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.4)}}
:root[data-theme="dark"]{--bg:#0e1116;--surface:#171b22;--surface-2:#1d222b;--border:#2a3140;--text:#e7ebf2;--muted:#9aa4b6;--accent:#79aaf5;--warn-bg:#2b2213;--warn-border:#54421f;--warn-text:#e9c374;--shadow:0 1px 2px rgba(0,0,0,.5),0 10px 26px rgba(0,0,0,.4)}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 'Segoe UI','Leelawadee UI',Tahoma,'Yu Gothic UI','Meiryo',sans-serif}
.top{position:sticky;top:0;z-index:5;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--border)}
.top-inner{max-width:1180px;margin:0 auto;padding:14px 20px;display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;justify-content:space-between}
.title h1{margin:0;font-size:17px;font-weight:650;word-break:break-all}
.title p{margin:2px 0 0;font-size:12.5px;color:var(--muted)}
.tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
#q{width:210px;padding:7px 11px;border-radius:9px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:inherit;font-size:13.5px;outline:none}
#q:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 25%,transparent)}
.check{display:flex;gap:7px;align-items:center;font-size:13px;color:var(--muted);cursor:pointer;user-select:none}
.check input{accent-color:var(--accent);margin:0}
.seg{display:inline-flex;background:var(--surface-2);border:1px solid var(--border);border-radius:9px;padding:2px;gap:2px}
.seg button{appearance:none;border:0;background:transparent;color:var(--muted);cursor:pointer;font:inherit;font-size:12.5px;padding:5px 10px;border-radius:7px;transition:background .12s,color .12s}
.seg button:hover{color:var(--text)}
.seg button[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.14)}
main{max-width:1180px;margin:0 auto;padding:22px 20px 60px}
.item{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;margin-bottom:16px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:9px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);font:12.5px/1 ui-monospace,Consolas,monospace;color:var(--muted)}
.num{color:var(--accent);font-weight:700}
.time{color:var(--text)}
.arrow{margin:0 7px;color:var(--muted)}
.chip{margin-left:auto;padding:3px 8px;border-radius:999px;background:var(--bg);border:1px solid var(--border)}
.chip.dim{margin-left:0;opacity:.75}
.body{display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch}
@media (min-width:900px){.body{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}}
.shot{display:flex;align-items:center;justify-content:center;padding:16px;min-height:96px}
body.shot-dark .shot{background:#0a0b0d}
body.shot-light .shot{background:#f0f0f2}
body.shot-check .shot{background-color:#9a9a9a;background-image:linear-gradient(45deg,#6f6f6f 25%,transparent 25%,transparent 75%,#6f6f6f 75%),linear-gradient(45deg,#6f6f6f 25%,transparent 25%,transparent 75%,#6f6f6f 75%);background-size:18px 18px;background-position:0 0,9px 9px}
.shot img{max-width:100%;height:auto;display:block;cursor:zoom-in}
.text{padding:16px 18px;font-size:19px;line-height:1.55;word-wrap:break-word;border-top:1px solid var(--border)}
@media (min-width:900px){.text{border-top:0;border-left:1px solid var(--border)}}
.text.empty{display:flex;align-items:center;font-size:14px;font-style:italic;color:var(--warn-text);background:var(--warn-bg)}
@media (min-width:900px){.text.empty{border-left-color:var(--warn-border)}}
.no-matches{text-align:center;color:var(--muted);padding:48px 0;font-size:14px}
footer{text-align:center;color:var(--muted);font-size:12px;padding:0 20px 34px}
#lightbox{border:0;padding:0;background:transparent;max-width:96vw;max-height:96vh}
#lightbox::backdrop{background:rgba(0,0,0,.78)}
#lightbox img{max-width:96vw;max-height:96vh;display:block;cursor:zoom-out;background:#0a0b0d;border-radius:8px}
</style>
</head>
<body class="shot-dark">
<header class="top"><div class="top-inner">
<div class="title"><h1>{TITLE}</h1><p>{SUB}</p></div>
<div class="tools">
<input id="q" type="search" spellcheck="false" placeholder="ค้นคำในข้อความ" aria-label="ค้นคำในข้อความ" />
<label class="check"><input id="onlyEmpty" type="checkbox" /><span>เฉพาะภาพที่ไม่มีข้อความ</span></label>
<div class="seg" id="shotSeg" role="group" aria-label="พื้นหลังของภาพ">
<button type="button" data-shot="dark" aria-pressed="true">มืด</button>
<button type="button" data-shot="light" aria-pressed="false">สว่าง</button>
<button type="button" data-shot="check" aria-pressed="false">ตารางหมากรุก</button>
</div>
<div class="seg" id="themeSeg" role="group" aria-label="โทนของหน้า">
<button type="button" data-theme="auto" aria-pressed="true">ตามเครื่อง</button>
<button type="button" data-theme="light" aria-pressed="false">สว่าง</button>
<button type="button" data-theme="dark" aria-pressed="false">มืด</button>
</div>
</div>
</div></header>
<main id="list">
{ROWS}<p id="noMatches" class="no-matches" hidden>ไม่มีภาพที่ตรงกับคำค้น</p>
</main>
<footer>ทำจากชั้นหนัง โครงหน้าจาก Subtitle Edit</footer>
<dialog id="lightbox"><img id="lightboxImg" alt="" /></dialog>
<script>
(function(){
  var root=document.documentElement, body=document.body;
  function select(seg,value,attr){ seg.querySelectorAll('button').forEach(function(b){ b.setAttribute('aria-pressed', b.getAttribute(attr)===value ? 'true' : 'false'); }); }
  var themeSeg=document.getElementById('themeSeg');
  function applyTheme(t){ if(t==='light'||t==='dark'){ root.setAttribute('data-theme',t); } else { t='auto'; root.removeAttribute('data-theme'); } select(themeSeg,t,'data-theme'); try{ localStorage.setItem('ms-ocr-html-theme',t); }catch(e){} }
  themeSeg.addEventListener('click',function(e){ var b=e.target.closest('button'); if(b){ applyTheme(b.getAttribute('data-theme')); } });
  var shotSeg=document.getElementById('shotSeg');
  function applyShot(s){ if(s!=='light'&&s!=='check'){ s='dark'; } body.classList.remove('shot-dark','shot-light','shot-check'); body.classList.add('shot-'+s); select(shotSeg,s,'data-shot'); try{ localStorage.setItem('ms-ocr-html-shot',s); }catch(e){} }
  shotSeg.addEventListener('click',function(e){ var b=e.target.closest('button'); if(b){ applyShot(b.getAttribute('data-shot')); } });
  try{ applyTheme(localStorage.getItem('ms-ocr-html-theme')||'auto'); applyShot(localStorage.getItem('ms-ocr-html-shot')||'dark'); }catch(e){ applyTheme('auto'); applyShot('dark'); }
  var items=Array.prototype.slice.call(document.querySelectorAll('.item'));
  var q=document.getElementById('q'), onlyEmpty=document.getElementById('onlyEmpty'), noMatches=document.getElementById('noMatches');
  function filter(){ var needle=q.value.trim().toLowerCase(), empties=onlyEmpty.checked, shown=0;
    for(var i=0;i<items.length;i++){ var it=items[i]; var ok=(!empties||it.getAttribute('data-empty')==='1')&&(needle===''||it.getAttribute('data-text').indexOf(needle)>=0); it.hidden=!ok; if(ok){ shown++; } }
    noMatches.hidden=shown>0; }
  q.addEventListener('input',filter); onlyEmpty.addEventListener('change',filter);
  var lightbox=document.getElementById('lightbox'), lightboxImg=document.getElementById('lightboxImg');
  document.getElementById('list').addEventListener('click',function(e){ var img=e.target.closest('.shot img'); if(img&&lightbox.showModal){ lightboxImg.src=img.getAttribute('src'); lightbox.showModal(); } });
  lightbox.addEventListener('click',function(){ lightbox.close(); });
  document.addEventListener('keydown',function(e){ if(e.key==='/'&&document.activeElement!==q){ e.preventDefault(); q.focus(); q.select(); } });
})();
</script>
</body>
</html>
"#;

// ---------------------------------------------------------------- คำสั่ง

#[tauri::command]
pub async fn ocr_export_formats(app: AppHandle) -> Result<Vec<ExpFormat>, String> {
    let tools = tools_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || Ok(formats(&tools))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ocr_export_preview(app: AppHandle, req: ExpReq) -> Result<String, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subs::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || preview(&tools, &work, &req)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ocr_export(app: AppHandle, req: ExpReq, target: String) -> Result<ExpOut, String> {
    let tools = tools_dir(&app)?;
    let work = crate::subs::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || export(&tools, &work, &req, Path::new(&target))).await.map_err(|e| e.to_string())?
}

/// เอกสารให้หน้าแก้ซับ (ASS เก็บตำแหน่ง ไม่มีไฟล์ของตัวเอง กดบันทึกแล้วถามที่เก็บ)
#[tauri::command]
pub fn ocr_export_doc(req: ExpReq) -> SubDoc {
    doc_of(&ExpReq { fmt: ASS.into(), ..req })
}

/// บันทึกภาพทุกภาพพร้อมหน้า HTML · texts ข้อความของทุกบรรทัดตามลำดับภาพของงาน OCR · ความคืบหน้าทางเหตุการณ์ ocr-html-progress
#[tauri::command]
pub async fn ocr_save_html(app: AppHandle, texts: Vec<String>, folder: String, source: String) -> Result<HtmlOut, String> {
    let files: Vec<(PathBuf, f64, Option<f64>, u32, u32)> = crate::ocrjob::session().as_ref()
        .map(|s| s.items().iter().map(|i| (i.img.file.clone(), i.img.start, i.img.end, i.img.w, i.img.h)).collect())
        .ok_or("ยังไม่ได้เปิดซับรูปในหน้า OCR")?;
    tauri::async_runtime::spawn_blocking(move || {
        let last = std::sync::atomic::AtomicI64::new(-1);
        save_html(&files, &texts, Path::new(&folder), &source, &|f| {
            let v = (f * 100.0).floor() as i64;
            if last.swap(v, std::sync::atomic::Ordering::Relaxed) != v { let _ = tauri::Emitter::emit(&app, "ocr-html-progress", v); }
        })
    }).await.map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(start: f64, end: Option<f64>, text: &str, an: &[u8]) -> ExpRow { ExpRow { start, end, text: text.into(), an: an.to_vec() } }
    fn req(rows: Vec<ExpRow>, fmt: &str, top: &str) -> ExpReq { ExpReq { rows, fmt: fmt.into(), top: top.into(), italic: true, enc: "utf8bom".into(), canvas: [1920, 1080] } }

    /// ป้ายบนจอกับบทพูดล่างจอในภาพเดียว แยกเป็นสองแถวเวลาเดียวกัน ป้ายติด {\an8} · รวมไว้ล่างจอได้แถวเดียวไม่มีแท็ก
    /// เวลาจบที่ไม่รู้ใช้เวลาเริ่มของภาพถัดไปไม่เกิน 5 วินาที · ภาพไม่มีข้อความไม่ถูกเขียน · ปิดตัวเอียงแล้วแท็ก i หาย
    #[test]
    fn alignment_groups_and_end_times() {
        let rows = vec![
            row(1.0, Some(2.5), "Kobe Street\nI'm here.\n<i>Hello.</i>", &[8, 2, 2]),
            row(3.0, None, "No end time", &[2]),
            row(4.0, None, "   ", &[2]),
            row(20.0, None, "Last", &[]),
        ];
        let t = lines_of(&req(rows.clone(), SRT, "tag"));
        assert_eq!(t, vec![
            (1000, 2500, "{\\an8}Kobe Street".to_string()),
            (1000, 2500, "I'm here.\n<i>Hello.</i>".to_string()),
            (3000, 4000, "No end time".to_string()),
            (20000, 25000, "Last".to_string()),
        ]);
        let d = lines_of(&req(rows.clone(), SRT, "down"));
        assert_eq!(d[0], (1000, 2500, "Kobe Street\nI'm here.\n<i>Hello.</i>".to_string()));
        assert_eq!(d.len(), 3);
        let mut r = req(rows, SRT, "tag");
        r.italic = false;
        assert_eq!(lines_of(&r)[1].2, "I'm here.\nHello.");
    }

    /// SRT เขียนเลขลำดับ เวลา และแท็ก {\an8} · ASS ได้ PlayRes ตามจอของซับรูป แท็กตำแหน่งยังอยู่ ตัวเอียงเป็น {\i1}
    #[test]
    fn srt_and_ass_text() {
        let rows = vec![row(1.0, Some(2.0), "Top\n<i>Bottom</i>", &[8, 2])];
        let srt = subdoc::render(&doc_of(&req(rows.clone(), SRT, "tag")));
        assert!(srt.contains("1\r\n00:00:01,000 --> 00:00:02,000\r\n{\\an8}Top\r\n"), "{srt}");
        assert!(srt.contains("2\r\n00:00:01,000 --> 00:00:02,000\r\n<i>Bottom</i>"), "{srt}");
        let mut r = req(rows, ASS, "tag");
        r.canvas = [720, 480];
        let ass = subdoc::render(&doc_of(&r));
        assert!(ass.contains("PlayResX: 720") && ass.contains("PlayResY: 480"), "{ass}");
        assert!(ass.contains(",{\\an8}Top") && ass.contains(",{\\i1}Bottom{\\i}"), "{ass}");
    }

    /// เขียนไฟล์จริงสามรหัสอักษร · ไฟล์มีอยู่แล้วไม่ทับ · ชนิดของ SeConv (WebVTT) แปลงได้ ตัดหรือเก็บ BOM ตามที่เลือก · TIS-620 อ่านกลับเป็นไทยเดิม
    #[test]
    fn export_files_and_seconv() {
        let tools = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
        // โฟลเดอร์ทำงานไว้ใต้ LOCALAPPDATA (ไดรฟ์ C แบบโปรแกรมจริง) · dev.ps1 ตั้งโฟลเดอร์ชั่วคราวไว้ไดรฟ์ D ใช้ตัวนั้นแล้วไม่เคยย้ายข้ามไดรฟ์
        let work = std::env::var("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir()).join("movie-shelf-test-ocrexp");
        let _ = std::fs::remove_dir_all(&work);
        std::fs::create_dir_all(&work).unwrap();
        let rows = vec![row(1.0, Some(2.0), "สวัสดีครับ\nบรรทัดสอง", &[2, 2]), row(3.0, Some(4.0), "ชื่อสถานที่", &[8])];
        let srt = work.join("a.srt");
        let mut r = req(rows.clone(), SRT, "tag");
        r.enc = "utf8".into();
        let out = export(&tools, &work, &r, &srt).unwrap();
        assert_eq!(out.lines, 2);
        let b = std::fs::read(&srt).unwrap();
        assert!(!b.starts_with(&[0xEF, 0xBB, 0xBF]) && String::from_utf8_lossy(&b).contains("{\\an8}ชื่อสถานที่"));
        assert_eq!(export(&tools, &work, &r, &srt).unwrap_err(), "exists");
        r.enc = "tis".into();
        let tis = work.join("b.srt");
        export(&tools, &work, &r, &tis).unwrap();
        let (text, enc) = subdoc::decode(&std::fs::read(&tis).unwrap());
        assert!(text.contains("สวัสดีครับ"), "{} {text}", enc.charset);
        r.enc = "utf16".into();
        let u16f = work.join("c.srt");
        export(&tools, &work, &r, &u16f).unwrap();
        assert!(std::fs::read(&u16f).unwrap().starts_with(&[0xFF, 0xFE]));
        if crate::pgs::seconv_exe(&tools).exists() {
            let mut v = req(rows, "WebVTT", "tag");
            v.enc = "utf8".into();
            // ที่เก็บคนละไดรฟ์กับโฟลเดอร์ทำงาน (โฟลเดอร์ทำงานอยู่ไดรฟ์ C โปรเจกต์อยู่ไดรฟ์ D) · เดิมย้ายข้ามไดรฟ์ไม่ได้ ขึ้นเปลี่ยนชื่อไม่สำเร็จ
            let far = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target").join("ocrexp-test");
            let _ = std::fs::remove_dir_all(&far);
            std::fs::create_dir_all(&far).unwrap();
            let vtt = far.join("d.vtt");
            export(&tools, &work, &v, &vtt).unwrap();
            let b = std::fs::read(&vtt).unwrap();
            let s = String::from_utf8_lossy(&b);
            assert!(!b.starts_with(&[0xEF, 0xBB, 0xBF]) && s.starts_with("WEBVTT") && s.contains("สวัสดีครับ"), "{s}");
            let p = preview(&tools, &work, &v).unwrap();
            assert!(p.starts_with("WEBVTT") && p.contains("ชื่อสถานที่"), "{p}");
            let f = formats(&tools);
            assert!(f.len() > 100 && f[0].id == SRT && f[1].id == ASS && f.iter().any(|x| x.id == "WebVTT"), "{}", f.len());
            // ไม่มีงานค้างในโฟลเดอร์ชั่วคราว
            assert!(std::fs::read_dir(&work).unwrap().flatten().all(|e| !e.file_name().to_string_lossy().starts_with("ocrexp-")));
            assert_eq!(std::fs::read_dir(&far).unwrap().count(), 1, "ไม่มีไฟล์ชั่วคราวค้างข้างที่เก็บ");
            let _ = std::fs::remove_dir_all(&far);
        }
        let _ = std::fs::remove_dir_all(&work);
    }

    /// ภาพพร้อมหน้า HTML · โฟลเดอร์ใหม่ไม่ทับของเดิม ภาพครบตามชื่อ หน้ามีข้อความที่เข้ารหัสแล้ว ภาพไม่มีข้อความติดป้าย
    #[test]
    fn html_index() {
        let dir = std::env::temp_dir().join("movie-shelf-ocrhtml");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("src.png");
        image::RgbaImage::from_pixel(4, 3, image::Rgba([255, 255, 255, 255])).save(&src).unwrap();
        let files = vec![(src.clone(), 1.0, Some(2.5), 4, 3), (src.clone(), 3.0, None, 4, 3)];
        let texts = vec!["<i>A & B</i>\nสอง".to_string(), String::new()];
        std::fs::create_dir_all(dir.join("ซับ OCR")).unwrap();
        let out = save_html(&files, &texts, &dir, "D:/x/ซับ.sup", &|_| {}).unwrap();
        assert_eq!((out.images, out.empty), (2, 1));
        assert!(out.folder.ends_with("ซับ OCR (2)"), "{}", out.folder);
        let html = std::fs::read_to_string(&out.html).unwrap();
        assert!(html.contains("<i>A &amp; B</i><br />สอง") && html.contains("ภาพนี้ยังไม่มีข้อความ") && html.contains("2 ภาพ ไม่มีข้อความ 1 ภาพ"));
        assert!(Path::new(&out.folder).join("images").join("0002.png").is_file());
        assert!(save_html(&files, &texts[..1], &dir, "x.sup", &|_| {}).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
