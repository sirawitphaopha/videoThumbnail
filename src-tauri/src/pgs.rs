//! ส่งออกซับเป็น PGS ซับแบบภาพของ Blu-ray ไฟล์ .sup (BUGS ข้อ 118)
//! พี่กันสั่ง "เพิ่มระบบส่งออกเป็นซับ PGS ได้ ส่งจาก ass นี่เเหละ" · "เราต้องการสิ่งที่ดีที่สุด … มันมีข้อจำกัดก็ต้องเตือนด้วย"
//! ffmpeg ที่แนบมามีแค่ตัวเขียนไฟล์ .sup ไม่มีตัวสร้างภาพ PGS จึงทำเองทั้งหมด (ผลค้นใน docs/research/pgs-ส่งออกจาก-ass.md)
//!   ① หาจุดที่ภาพซับเปลี่ยน คือเวลาเริ่มกับเวลาจบของทุกบรรทัด บรรทัดที่มีเอฟเฟกต์เคลื่อนไหว (\move \fad \fade \t คาราโอเกะ) เพิ่มทุกเฟรมของหนัง
//!   ② วาดซับแต่ละช่วงด้วย libass ใน ffmpeg ตัวเดียวกับภาพนิ่งในหน้าแก้ซับ (subshot.rs) บนพื้นโปร่งใส ขนาดเท่าภาพหนัง ซับจึงหน้าตาเหมือนตอนเล่น
//!      ffmpeg รันทีละชุดไม่เกิน 250 ภาพ ตั้งเวลาของแต่ละภาพด้วย setpts ภาพไหลออกมาเป็นไบต์ RGBA อ่านทีละภาพ ไม่เก็บทั้งเรื่องในหน่วยความจำ
//!   ③ หากรอบภาพจากแถวที่มีซับ ซับคนละที่ (บทพูดล่างกับป้ายบน) แยกเป็นสองกรอบ มาตรฐาน Blu-ray ให้ไม่เกินสองกรอบ ที่เกินรวมกรอบที่ใกล้กัน
//!   ④ ลดสีให้เหลือไม่เกิน 255 สีต่อภาพ (สีที่ 0 คือโปร่งใส) ด้วย median cut นับสีพร้อมความโปร่งใส · สีเปลี่ยนจาก RGB เป็น YCbCr แบบ BT.709 (ภาพสูงเกิน 576) หรือ BT.601
//!   ⑤ เขียนส่วนของ PGS ตามมาตรฐาน PCS WDS PDS ODS END ทุกภาพเป็นจุดเริ่มชุดใหม่ (Epoch Start) แบบ BDSup2Sub ช่วงที่ไม่มีซับเขียนชุดล้างจอ
//!      ภาพที่เหมือนภาพก่อนหน้าทุกจุดไม่เขียนซ้ำ ภาพบีบแบบ RLE ของ PGS ภาพใหญ่เกินหนึ่งส่วนแบ่งเป็นหลายส่วน
//! เขียนลง .partial ก่อน แล้วเปลี่ยนชื่อแบบห้ามทับ ไฟล์ปลายทางมีอยู่แล้วตอบ exists ให้หน้าจอถามตั้งชื่อใหม่ ไม่แตะไฟล์หนังและไฟล์ซับ

use std::collections::HashMap;
use std::ffi::OsString;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::subdoc::SubDoc;
use crate::tools::{tool_command, tools_dir};

static STOP: AtomicBool = AtomicBool::new(false);
/// ภาพต่อหนึ่งรอบของ ffmpeg
const BATCH: usize = 250;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PgsReq {
    pub target: String,
    /// ขนาดภาพของ PGS เท่าภาพหนัง
    pub w: u32,
    pub h: u32,
    /// อัตราเฟรมของหนัง ใช้ทั้งรหัสอัตราเฟรมในไฟล์และระยะห่างของภาพตอนวาดเอฟเฟกต์เคลื่อนไหว
    pub fps_num: u32,
    pub fps_den: u32,
    /// หนังที่ซับนี้มาจาก ใช้ฟอนต์ที่ฝังในหนัง
    pub movie: Option<String>,
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PgsOut {
    path: String,
    /// จำนวนภาพที่เขียน (ชุดแสดงซับ)
    pub images: usize,
    /// ภาพที่มีสีเกิน 255 สีจึงลดสี
    pub reduced: usize,
    /// ภาพที่ซับอยู่เกินสองที่จึงรวมกรอบ
    pub merged: usize,
    /// สีมากที่สุดในหนึ่งภาพก่อนลด
    pub max_colors: usize,
    pub bytes: u64,
}

// ---------------------------------------------------------------- จุดที่ภาพเปลี่ยน

/// ส่วนแท็ก {…} ของบรรทัด รวมเป็นข้อความเดียว ตัวพิมพ์เล็ก
fn tags_of(text: &str) -> String {
    let mut out = String::new();
    let mut inside = false;
    for c in text.chars() {
        match c {
            '{' => inside = true,
            '}' => { inside = false; out.push(' '); }
            _ if inside => out.extend(c.to_lowercase()),
            _ => {}
        }
    }
    out
}

/// บรรทัดที่ภาพเปลี่ยนระหว่างบรรทัด ต้องวาดทุกเฟรม · \move \fad \fade \t คาราโอเกะ \k \kf \ko \K
pub fn animated(text: &str) -> bool {
    let t = tags_of(text);
    if ["\\move(", "\\fad(", "\\fade(", "\\t("].iter().any(|k| t.contains(k)) { return true; }
    t.match_indices("\\k").any(|(i, _)| t[i + 2..].starts_with(|c: char| c.is_ascii_digit() || c == 'f' || c == 'o'))
}

/// เวลาทุกจุดที่ภาพซับอาจเปลี่ยน ms เรียงไม่ซ้ำ · บรรทัดเคลื่อนไหวเพิ่มเวลาของทุกเฟรมในช่วงบรรทัด (เฟรมแรกที่เวลา 0)
pub fn change_points(doc: &SubDoc, frame_ms: f64) -> Vec<i64> {
    let mut p: Vec<i64> = vec![];
    for e in doc.events.iter().filter(|e| !e.comment && e.end > e.start) {
        p.push(e.start.max(0));
        p.push(e.end.max(0));
        if frame_ms > 0.0 && animated(&e.text) {
            let mut k = (e.start as f64 / frame_ms).ceil() as i64;
            loop {
                let t = (k as f64 * frame_ms).round() as i64;
                if t >= e.end { break; }
                if t > e.start { p.push(t); }
                k += 1;
            }
        }
    }
    p.sort_unstable();
    p.dedup();
    p
}

/// มีบรรทัดที่ขึ้นอยู่ ณ เวลา t ไหม (เริ่มนับ จบไม่นับ แบบ libass)
fn active_at(doc: &SubDoc, t: i64) -> bool {
    doc.events.iter().any(|e| !e.comment && e.start <= t && t < e.end)
}

// ---------------------------------------------------------------- ภาพหนึ่งชุด

/// กรอบหนึ่งกรอบกับภาพในกรอบ เลขสีของทุกจุด
#[derive(Clone, Debug, PartialEq)]
pub struct Obj { pub x: u16, pub y: u16, pub w: u16, pub h: u16, pub px: Vec<u8> }

#[derive(Clone, Debug, PartialEq)]
pub struct Image {
    /// สี RGBA แบบไม่คูณความโปร่งใส · สีที่ 0 โปร่งใสเสมอ
    pub palette: Vec<[u8; 4]>,
    pub objs: Vec<Obj>,
    /// สีก่อนลด
    pub colors: usize,
    /// ซับอยู่เกินสองที่ รวมกรอบแล้ว
    pub merged: bool,
}

/// แถวต่อแถวที่มีซับ แบ่งเป็นช่วงแถว · ช่วงเกินสอง รวมคู่ที่ห่างกันน้อยที่สุดจนเหลือสอง
fn row_groups(used: &[bool]) -> (Vec<(usize, usize)>, bool) {
    let mut g: Vec<(usize, usize)> = vec![];
    let mut y = 0;
    while y < used.len() {
        if used[y] {
            let s = y;
            while y < used.len() && used[y] { y += 1; }
            g.push((s, y - 1));
        } else { y += 1; }
    }
    let merged = g.len() > 2;
    while g.len() > 2 {
        let k = (0..g.len() - 1).min_by_key(|&i| g[i + 1].0 - g[i].1).unwrap();
        g[k].1 = g[k + 1].1;
        g.remove(k + 1);
    }
    (g, merged)
}

/// สีของจุดแบบไม่คูณความโปร่งใส · ตัวกรอง subtitles ของ ffmpeg ผสมซับลงพื้นดำโปร่งใส สีที่ได้คูณความโปร่งใสมาแล้ว
/// (พิสูจน์แล้ว ขอบตัวอักษรขาวทึบ 76 ได้สี 70) แต่จานสีของ PGS ใช้สีแบบไม่คูณ ไม่หารกลับแล้วขอบตัวอักษรมืดกว่าตอนเล่น
pub fn straight(p: &[u8]) -> u32 {
    let a = p[3] as u32;
    if a == 0 || a == 255 { return u32::from_le_bytes([p[0], p[1], p[2], p[3]]); }
    let f = |c: u8| ((c as u32 * 255 + a / 2) / a).min(255) as u8;
    u32::from_le_bytes([f(p[0]), f(p[1]), f(p[2]), p[3]])
}

/// ภาพ RGBA เต็มจอ เป็นภาพของ PGS · ไม่มีซับเลยได้ None
pub fn image_of(rgba: &[u8], w: usize, h: usize) -> Option<Image> {
    let a = |x: usize, y: usize| rgba[(y * w + x) * 4 + 3];
    let used: Vec<bool> = (0..h).map(|y| (0..w).any(|x| a(x, y) > 0)).collect();
    let (groups, merged) = row_groups(&used);
    if groups.is_empty() { return None; }
    // กรอบของแต่ละกลุ่ม กว้างสูงอย่างน้อย 8 จุดตามมาตรฐาน ขยายไม่เกินขอบภาพ และไม่ทับกรอบอื่น
    let mut boxes: Vec<(usize, usize, usize, usize)> = groups.iter().map(|&(y0, y1)| {
        let (mut x0, mut x1) = (w, 0);
        for y in y0..=y1 { for x in 0..w { if a(x, y) > 0 { x0 = x0.min(x); x1 = x1.max(x); } } }
        (x0, y0, x1, y1)
    }).collect();
    for b in boxes.iter_mut() {
        while b.2 + 1 - b.0 < 8 { if b.2 + 1 < w { b.2 += 1; } else if b.0 > 0 { b.0 -= 1; } else { break; } }
    }
    for i in 0..boxes.len() {
        let lo = if i > 0 { boxes[i - 1].3 + 1 } else { 0 };
        let hi = if i + 1 < boxes.len() { boxes[i + 1].1 - 1 } else { h - 1 };
        let b = &mut boxes[i];
        while b.3 + 1 - b.1 < 8 { if b.3 < hi { b.3 += 1; } else if b.1 > lo { b.1 -= 1; } else { break; } }
    }
    // สีทั้งภาพ จุดที่โปร่งใสทั้งหมดเป็นสีที่ 0
    let mut hist: HashMap<u32, u32> = HashMap::new();
    for &(x0, y0, x1, y1) in &boxes {
        for y in y0..=y1 { for x in x0..=x1 {
            let i = (y * w + x) * 4;
            if rgba[i + 3] == 0 { continue; }
            *hist.entry(straight(&rgba[i..i + 4])).or_insert(0) += 1;
        } }
    }
    let colors = hist.len();
    let (pal, map) = reduce(hist, 255);
    let mut palette = vec![[0u8, 0, 0, 0]];
    palette.extend(pal);
    let objs = boxes.iter().map(|&(x0, y0, x1, y1)| {
        let (bw, bh) = (x1 + 1 - x0, y1 + 1 - y0);
        let mut px = vec![0u8; bw * bh];
        for y in 0..bh { for x in 0..bw {
            let i = ((y0 + y) * w + x0 + x) * 4;
            if rgba[i + 3] == 0 { continue; }
            px[y * bw + x] = map[&straight(&rgba[i..i + 4])];
        } }
        Obj { x: x0 as u16, y: y0 as u16, w: bw as u16, h: bh as u16, px }
    }).collect();
    Some(Image { palette, objs, colors, merged })
}

/// ลดสีเหลือไม่เกิน k สีด้วย median cut (ถ่วงตามจำนวนจุด) · คืนสีที่ใช้กับเลขสีของทุกสีเดิม (เริ่มที่ 1)
pub fn reduce(hist: HashMap<u32, u32>, k: usize) -> (Vec<[u8; 4]>, HashMap<u32, u8>) {
    let all: Vec<([u8; 4], u32, u32)> = hist.into_iter().map(|(c, n)| (c.to_le_bytes(), n, c)).collect();
    if all.len() <= k {
        let pal = all.iter().map(|x| x.0).collect();
        let map = all.iter().enumerate().map(|(i, x)| (x.2, (i + 1) as u8)).collect();
        return (pal, map);
    }
    let mut boxes: Vec<Vec<([u8; 4], u32, u32)>> = vec![all];
    while boxes.len() < k {
        // กล่องที่ช่วงสีกว้างที่สุด แบ่งตามสีช่องนั้นที่จุดกึ่งกลางของจำนวนจุด
        let pick = boxes.iter().enumerate().filter(|(_, b)| b.len() > 1).map(|(i, b)| {
            let (ch, range) = (0..4).map(|c| { let lo = b.iter().map(|x| x.0[c]).min().unwrap(); let hi = b.iter().map(|x| x.0[c]).max().unwrap(); (c, hi - lo) }).max_by_key(|x| x.1).unwrap();
            (i, ch, range)
        }).max_by_key(|x| x.2);
        let Some((i, ch, _)) = pick else { break };
        let mut b = boxes.swap_remove(i);
        b.sort_by_key(|x| x.0[ch]);
        let total: u64 = b.iter().map(|x| x.1 as u64).sum();
        let mut acc = 0u64;
        let mut cut = 1;
        for (j, x) in b.iter().enumerate() {
            acc += x.1 as u64;
            if acc * 2 >= total { cut = (j + 1).clamp(1, b.len() - 1); break; }
        }
        let rest = b.split_off(cut);
        boxes.push(b);
        boxes.push(rest);
    }
    let mut pal = vec![];
    let mut map = HashMap::new();
    for (i, b) in boxes.iter().enumerate() {
        let n: u64 = b.iter().map(|x| x.1 as u64).sum::<u64>().max(1);
        let mut s = [0u64; 4];
        for x in b { for c in 0..4 { s[c] += x.0[c] as u64 * x.1 as u64; } }
        pal.push([(s[0] / n) as u8, (s[1] / n) as u8, (s[2] / n) as u8, (s[3] / n) as u8]);
        for x in b { map.insert(x.2, (i + 1) as u8); }
    }
    (pal, map)
}

// ---------------------------------------------------------------- เขียนส่วนของ PGS

/// รหัสอัตราเฟรมใน PCS · 23.976 24 25 29.97 50 59.94
pub fn fps_code(num: u32, den: u32) -> u8 {
    let f = num as f64 / den.max(1) as f64;
    [(23.976, 0x10), (24.0, 0x20), (25.0, 0x30), (29.97, 0x40), (50.0, 0x60), (59.94, 0x70)].iter()
        .min_by(|a, b| (a.0 - f).abs().partial_cmp(&(b.0 - f).abs()).unwrap()).map(|x| x.1).unwrap_or(0x10)
}

/// สี RGB เป็น Y Cr Cb ช่วงสีแบบทีวี (16 ถึง 235)
pub fn ycrcb(r: u8, g: u8, b: u8, bt709: bool) -> (u8, u8, u8) {
    let (kr, kb) = if bt709 { (0.2126, 0.0722) } else { (0.299, 0.114) };
    let (r, g, b) = (r as f64 / 255.0, g as f64 / 255.0, b as f64 / 255.0);
    let y = kr * r + (1.0 - kr - kb) * g + kb * b;
    let cb = (b - y) / (2.0 * (1.0 - kb));
    let cr = (r - y) / (2.0 * (1.0 - kr));
    let q = |v: f64| v.round().clamp(0.0, 255.0) as u8;
    (q(16.0 + 219.0 * y), q(128.0 + 224.0 * cr), q(128.0 + 224.0 * cb))
}

/// ภาพเลขสีแบบ RLE ของ PGS ทีละแถว จบแถวด้วย 00 00 · สีที่ 0 เขียนแบบนับจำนวนเสมอ
pub fn rle(px: &[u8], w: usize, h: usize) -> Vec<u8> {
    let mut o = Vec::with_capacity(px.len() / 4 + h * 2);
    for y in 0..h {
        let row = &px[y * w..(y + 1) * w];
        let mut i = 0;
        while i < w {
            let c = row[i];
            let mut n = 1;
            while i + n < w && row[i + n] == c && n < 16383 { n += 1; }
            if c == 0 {
                if n < 64 { o.extend([0, n as u8]); } else { o.extend([0, 0x40 | (n >> 8) as u8, (n & 0xff) as u8]); }
            } else if n < 3 {
                for _ in 0..n { o.push(c); }
            } else if n < 64 {
                o.extend([0, 0x80 | n as u8, c]);
            } else {
                o.extend([0, 0xC0 | (n >> 8) as u8, (n & 0xff) as u8, c]);
            }
            i += n;
        }
        o.extend([0, 0]);
    }
    o
}

fn seg(o: &mut Vec<u8>, pts: u32, kind: u8, data: &[u8]) {
    o.extend(b"PG");
    o.extend(pts.to_be_bytes());
    o.extend(0u32.to_be_bytes());
    o.push(kind);
    o.extend((data.len() as u16).to_be_bytes());
    o.extend(data);
}
fn be16(v: &mut Vec<u8>, x: u16) { v.extend(x.to_be_bytes()); }

/// ชุดแสดงภาพ PCS WDS PDS ODS END
pub fn show_set(pts: u32, comp: u16, w: u16, h: u16, fps: u8, img: &Image, bt709: bool) -> Vec<u8> {
    let mut o = vec![];
    let mut pcs = vec![];
    be16(&mut pcs, w); be16(&mut pcs, h); pcs.push(fps); be16(&mut pcs, comp);
    pcs.extend([0x80, 0x00, 0x00, img.objs.len() as u8]);
    for (i, ob) in img.objs.iter().enumerate() { be16(&mut pcs, i as u16); pcs.push(i as u8); pcs.push(0); be16(&mut pcs, ob.x); be16(&mut pcs, ob.y); }
    seg(&mut o, pts, 0x16, &pcs);
    let mut wds = vec![img.objs.len() as u8];
    for (i, ob) in img.objs.iter().enumerate() { wds.push(i as u8); be16(&mut wds, ob.x); be16(&mut wds, ob.y); be16(&mut wds, ob.w); be16(&mut wds, ob.h); }
    seg(&mut o, pts, 0x17, &wds);
    let mut pds = vec![0u8, 0u8];
    for (i, c) in img.palette.iter().enumerate() {
        let (y, cr, cb) = if c[3] == 0 { (16, 128, 128) } else { ycrcb(c[0], c[1], c[2], bt709) };
        pds.extend([i as u8, y, cr, cb, c[3]]);
    }
    seg(&mut o, pts, 0x14, &pds);
    for (i, ob) in img.objs.iter().enumerate() {
        let data = rle(&ob.px, ob.w as usize, ob.h as usize);
        // ส่วนแรกมีหัว 11 ไบต์ ส่วนต่อมา 4 ไบต์ · ขนาดข้อมูลรวม 24 บิตนับความกว้างความสูงด้วย
        let first_max = 65535 - 11;
        let mut pos = 0;
        let mut first = true;
        while first || pos < data.len() {
            let room = if first { first_max } else { 65535 - 4 };
            let end = (pos + room).min(data.len());
            let last = end >= data.len();
            let mut d = vec![];
            be16(&mut d, i as u16);
            d.push(0);
            d.push(match (first, last) { (true, true) => 0xC0, (true, false) => 0x80, (false, true) => 0x40, _ => 0x00 });
            if first {
                let n = data.len() + 4;
                d.extend([(n >> 16) as u8, (n >> 8) as u8, n as u8]);
                be16(&mut d, ob.w); be16(&mut d, ob.h);
            }
            d.extend(&data[pos..end]);
            seg(&mut o, pts, 0x15, &d);
            pos = end;
            first = false;
        }
    }
    seg(&mut o, pts, 0x80, &[]);
    o
}

/// ชุดล้างจอ PCS ไม่มีภาพ กรอบเดิม END
pub fn clear_set(pts: u32, comp: u16, w: u16, h: u16, fps: u8, wins: &[(u16, u16, u16, u16)]) -> Vec<u8> {
    let mut o = vec![];
    let mut pcs = vec![];
    be16(&mut pcs, w); be16(&mut pcs, h); pcs.push(fps); be16(&mut pcs, comp);
    pcs.extend([0x00, 0x00, 0x00, 0x00]);
    seg(&mut o, pts, 0x16, &pcs);
    let mut wds = vec![wins.len() as u8];
    for (i, (x, y, ww, hh)) in wins.iter().enumerate() { wds.push(i as u8); be16(&mut wds, *x); be16(&mut wds, *y); be16(&mut wds, *ww); be16(&mut wds, *hh); }
    seg(&mut o, pts, 0x17, &wds);
    seg(&mut o, pts, 0x80, &[]);
    o
}

// ---------------------------------------------------------------- วาดด้วย ffmpeg

/// ffmpeg หนึ่งรอบ วาดซับที่เวลาที่ส่งมา ได้ภาพ RGBA ทีละภาพทาง stdout
fn spawn_batch(tools: &Path, sub: &Path, fonts: Option<&Path>, w: u32, h: u32, times: &[i64]) -> Result<(Child, ChildStdout), String> {
    // เวลาของภาพที่ N เป็นไมโครวินาที ผลรวม T × (N เท่ากับ i) · หน่วยเวลา AVTB ไม่ปัดเป็นวินาที (แบบ subshot at)
    let expr = times.iter().enumerate().map(|(i, t)| format!("{}*eq(N,{i})", t * 1000)).collect::<Vec<_>>().join("+");
    let vf = format!("settb=AVTB,setpts='{expr}',{},format=rgba", crate::subshot::subs_filter(sub, fonts, w, h, true));
    let args: Vec<OsString> = vec![
        "-v".into(), "error".into(), "-nostdin".into(), "-f".into(), "lavfi".into(), "-i".into(),
        format!("color=c=black@0:s={w}x{h}:r=1:d={},format=rgba", times.len()).into(),
        "-vf".into(), vf.into(), "-frames:v".into(), times.len().to_string().into(), "-fps_mode".into(), "passthrough".into(),
        "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgba".into(), "-".into(),
    ];
    let mut child = tool_command(tools, "ffmpeg", &args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| format!("เปิด ffmpeg ไม่ได้ {e}"))?;
    let out = child.stdout.take().ok_or("อ่านผลของ ffmpeg ไม่ได้")?;
    Ok((child, out))
}

fn ffmpeg_err(child: &mut Child) -> String {
    let mut e = String::new();
    if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut e); }
    let last = e.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
    if last.is_empty() { "วาดซับไม่สำเร็จ".into() } else { format!("วาดซับไม่สำเร็จ {last}") }
}

#[derive(Serialize, Clone)]
struct Progress { done: usize, total: usize }

#[tauri::command]
pub fn pgs_cancel() { STOP.store(true, Ordering::SeqCst); }

/// ส่งออก · คืนจำนวนภาพ ภาพที่ลดสี ภาพที่รวมกรอบ ขนาดไฟล์ · หยุดกลางทางลบไฟล์ครึ่งทางแล้วตอบ stopped
#[tauri::command]
pub async fn pgs_export(app: AppHandle, doc: SubDoc, req: PgsReq) -> Result<PgsOut, String> {
    STOP.store(false, Ordering::SeqCst);
    let tools = tools_dir(&app)?;
    let work = crate::subshot::work_dir(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let r = export(&tools, &work, &doc, &req, &|done, total| { let _ = app.emit("pgs-progress", Progress { done, total }); })?;
        crate::actlog::note("ส่งออกซับเป็น PGS", &format!("{} ({} ภาพ)", r.path, r.images));
        Ok(r)
    }).await.map_err(|e| e.to_string())?
}

/// ตัวทำไฟล์ .sup · แยกจากคำสั่งของหน้าจอ เทสเรียกตรงได้ · progress ได้ (ภาพที่วาดแล้ว, ภาพทั้งหมด)
pub fn export(tools: &Path, work: &Path, doc: &SubDoc, req: &PgsReq, progress: &dyn Fn(usize, usize)) -> Result<PgsOut, String> {
    {
        let target = PathBuf::from(&req.target);
        if !target.extension().is_some_and(|e| e.eq_ignore_ascii_case("sup")) { return Err("ไฟล์ PGS ต้องเป็นนามสกุล .sup".into()); }
        if target.exists() { return Err("exists".into()); }
        let (w, h) = (req.w.clamp(16, 4096), req.h.clamp(16, 4096));
        let fps = fps_code(req.fps_num, req.fps_den);
        let frame_ms = 1000.0 * req.fps_den.max(1) as f64 / req.fps_num.max(1) as f64;
        let bt709 = h > 576;
        let sub = crate::subshot::TmpSub::new(&work, &doc)?;
        let fonts = req.movie.as_deref().filter(|m| !m.is_empty()).and_then(|m| crate::subshot::movie_fonts(&tools, &work, Path::new(m)));
        let pts = change_points(&doc, frame_ms);
        let need: Vec<usize> = (0..pts.len()).filter(|&i| active_at(&doc, pts[i])).collect();
        let total = need.len();
        let partial = crate::subdoc::partial_of(&target);
        let file = std::fs::OpenOptions::new().write(true).create_new(true).open(&partial).map_err(|e| format!("เขียนไฟล์ไม่ได้ {e}"))?;
        let mut wr = BufWriter::new(file);
        let mut res = PgsOut::default();
        let fail = |e: String, p: &Path| { let _ = std::fs::remove_file(p); Err::<PgsOut, String>(e) };
        let mut comp: u16 = 0;
        let mut shown: Option<Image> = None;
        let mut wins: Vec<(u16, u16, u16, u16)> = vec![];
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let mut done = 0usize;
        let mut cur: Option<(Child, ChildStdout, usize)> = None;
        let mut next_batch = 0usize;
        progress(0, total);
        for &t in pts.iter() {
            if STOP.load(Ordering::SeqCst) {
                if let Some((mut c, _, _)) = cur.take() { let _ = c.kill(); let _ = c.wait(); }
                drop(wr);
                return fail("stopped".into(), &partial);
            }
            let pts90 = (t.max(0) as u64 * 90).min(u32::MAX as u64) as u32;
            let img = if active_at(&doc, t) {
                // ภาพถัดไปของรอบที่วาดอยู่ หมดรอบเริ่มรอบใหม่
                if cur.as_ref().is_none_or(|c| c.2 == 0) {
                    if let Some((mut c, _, _)) = cur.take() {
                        let ok = c.wait().map(|s| crate::tools::tool_succeeded("ffmpeg", &s)).unwrap_or(false);
                        if !ok { let e = ffmpeg_err(&mut c); drop(wr); return fail(e, &partial); }
                    }
                    let times: Vec<i64> = need[next_batch..(next_batch + BATCH).min(need.len())].iter().map(|&k| pts[k]).collect();
                    next_batch += times.len();
                    match spawn_batch(&tools, &sub.0, fonts.as_deref(), w, h, &times) {
                        Ok((c, o)) => cur = Some((c, o, times.len())),
                        Err(e) => { drop(wr); return fail(e, &partial); }
                    }
                }
                let c = cur.as_mut().unwrap();
                if let Err(e) = c.1.read_exact(&mut buf) {
                    let msg = ffmpeg_err(&mut c.0);
                    let _ = c.0.kill();
                    drop(wr);
                    return fail(format!("{msg} ({e})"), &partial);
                }
                c.2 -= 1;
                done += 1;
                if done % 4 == 0 || done == total { progress(done, total); }
                image_of(&buf, w as usize, h as usize)
            } else { None };
            match img {
                Some(im) if shown.as_ref().is_some_and(|s| s.objs == im.objs && s.palette == im.palette) => {}
                Some(im) => {
                    res.images += 1;
                    res.max_colors = res.max_colors.max(im.colors);
                    if im.colors > 255 { res.reduced += 1; }
                    if im.merged { res.merged += 1; }
                    let b = show_set(pts90, comp, w as u16, h as u16, fps, &im, bt709);
                    comp = comp.wrapping_add(1);
                    if let Err(e) = wr.write_all(&b) { drop(wr); return fail(format!("เขียนไฟล์ไม่ได้ {e}"), &partial); }
                    wins = im.objs.iter().map(|o| (o.x, o.y, o.w, o.h)).collect();
                    shown = Some(im);
                }
                None => {
                    if shown.take().is_some() {
                        let b = clear_set(pts90, comp, w as u16, h as u16, fps, &wins);
                        comp = comp.wrapping_add(1);
                        if let Err(e) = wr.write_all(&b) { drop(wr); return fail(format!("เขียนไฟล์ไม่ได้ {e}"), &partial); }
                    }
                }
            }
        }
        if let Some((mut c, _, _)) = cur.take() { let _ = c.wait(); }
        if let Err(e) = wr.flush() { drop(wr); return fail(format!("เขียนไฟล์ไม่ได้ {e}"), &partial); }
        drop(wr);
        if res.images == 0 { return fail("ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ จึงไม่มีภาพให้ส่งออก".into(), &partial); }
        if let Err(p) = crate::rename::move_no_replace(&partial, &target) {
            let _ = std::fs::remove_file(&partial);
            return Err(if p.kind == "duplicate" { "exists".into() } else { p.title });
        }
        res.bytes = std::fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
        res.path = target.display().to_string();
        Ok(res)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rle_matches_pgs_rules() {
        // แถวเดียว 2 โปร่งใส 1 สี 5 · 70 จุดสี 7 · 64 โปร่งใส
        let mut px = vec![0u8, 0, 5];
        px.extend(std::iter::repeat_n(7u8, 70));
        px.extend(std::iter::repeat_n(0u8, 64));
        let w = px.len();
        let r = rle(&px, w, 1);
        assert_eq!(r, vec![0, 2, 5, 0, 0xC0, 70, 7, 0, 0x40, 64, 0, 0]);
        // สีเดียวกันสามจุดใช้แบบนับจำนวน สองจุดเขียนตรง
        assert_eq!(rle(&[3, 3, 4, 4, 4], 5, 1), vec![3, 3, 0, 0x83, 4, 0, 0]);
    }

    #[test]
    fn animated_tags_only_inside_braces() {
        assert!(animated("{\\fad(200,200)}สวัสดี"));
        assert!(animated("{\\k20}คา{\\kf30}รา"));
        assert!(animated("{\\move(10,10,100,100)}x"));
        assert!(!animated("{\\pos(10,10)\\b1}ตัวหนา"));
        assert!(!animated("ข้อความ \\t( ที่ไม่ได้อยู่ในแท็ก"));
    }

    #[test]
    fn straight_undoes_premultiplied_edges() {
        let c = straight(&[70, 70, 70, 76]).to_le_bytes();
        assert_eq!(c, [235, 235, 235, 76], "ขอบตัวอักษรขาวที่ ffmpeg คูณความโปร่งใสมา หารกลับเป็นขาว");
        assert_eq!(straight(&[10, 20, 30, 255]).to_le_bytes(), [10, 20, 30, 255]);
        assert_eq!(straight(&[200, 0, 0, 100]).to_le_bytes()[0], 255, "เกิน 255 ตัดที่ 255");
    }

    #[test]
    fn ycrcb_white_black_red() {
        assert_eq!(ycrcb(255, 255, 255, true), (235, 128, 128));
        assert_eq!(ycrcb(0, 0, 0, true), (16, 128, 128));
        let (y, cr, cb) = ycrcb(255, 0, 0, true);
        assert_eq!((y, cr, cb), (63, 240, 102));
    }

    #[test]
    fn two_groups_and_merge() {
        let used = [false, true, true, false, false, true, false, true, true, false];
        let (g, m) = row_groups(&used);
        assert!(m, "สามกลุ่มต้องรวม");
        assert_eq!(g, vec![(1, 2), (5, 8)]);
    }

    fn tools() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools") }

    /// ส่วนของไฟล์ .sup เป็นรายการ (เวลา ms, ชนิด, ข้อมูล)
    fn segments(b: &[u8]) -> Vec<(u32, u8, Vec<u8>)> {
        let mut out = vec![];
        let mut i = 0;
        while i + 13 <= b.len() {
            assert_eq!(&b[i..i + 2], b"PG", "หัวส่วนที่ไบต์ {i}");
            let pts = u32::from_be_bytes([b[i + 2], b[i + 3], b[i + 4], b[i + 5]]) / 90;
            let kind = b[i + 10];
            let n = u16::from_be_bytes([b[i + 11], b[i + 12]]) as usize;
            out.push((pts, kind, b[i + 13..i + 13 + n].to_vec()));
            i += 13 + n;
        }
        assert_eq!(i, b.len(), "ไฟล์จบพอดีส่วนสุดท้าย");
        out
    }

    /// ภาพ RGB ทั้งจอที่เวลา t วินาที บนพื้นดำ · sup ซ้อนด้วย overlay ของ ffmpeg หรือวาดซับ ASS ด้วย libass
    fn frame(input: &[OsString], vf: &str, w: u32, h: u32, t: f64) -> Vec<u8> {
        let mut a: Vec<OsString> = ["-v", "error", "-f", "lavfi", "-i"].iter().map(OsString::from).collect();
        a.push(format!("color=c=black:s={w}x{h}:r=25:d=6").into());
        a.extend(input.iter().cloned());
        a.extend(["-filter_complex".into(), vf.into(), "-ss".into(), format!("{t:.3}").into(), "-frames:v".into(), "1".into(), "-f".into(), "rawvideo".into(), "-pix_fmt".into(), "rgb24".into(), "-".into()]);
        let o = crate::tools::run_tool(&tools(), "ffmpeg", &a).unwrap();
        assert!(o.status.success(), "ffmpeg {}", String::from_utf8_lossy(&o.stderr));
        assert_eq!(o.stdout.len(), (w * h * 3) as usize);
        o.stdout
    }

    #[test]
    fn export_real_sup_matches_libass() {
        let dir = std::env::temp_dir().join(format!("movie-shelf-pgs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // สีเหลืองขอบน้ำเงิน ไว้ดูว่าสีแปลง YCbCr ถูกแบบ (ขาวดำแปลงแบบไหนก็ได้ค่าเดิม)
        let ass = "[Script Info]\r\nScriptType: v4.00+\r\nPlayResX: 1280\r\nPlayResY: 720\r\nScaledBorderAndShadow: yes\r\n\r\n[V4+ Styles]\r\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\r\nStyle: Default,Arial,60,&H0000FFFF,&H000000FF,&H00FF0000,&H00000000,-1,0,0,0,100,100,0,0,1,3,0,2,20,20,40,1\r\n\r\n[Events]\r\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\r\nDialogue: 0,0:00:00.50,0:00:02.00,Default,,0,0,0,,Bottom line\r\nDialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\an8}Top sign\r\nDialogue: 0,0:00:03.00,0:00:03.50,Default,,0,0,0,,{\\fad(300,0)}Fade\r\n";
        let doc = crate::subdoc::parse_doc(ass.as_bytes(), "ass", None);
        assert_eq!(doc.events.len(), 3);
        let target = dir.join("out.sup");
        let req = PgsReq { target: target.display().to_string(), w: 1280, h: 720, fps_num: 24000, fps_den: 1001, movie: None };
        let r = export(&tools(), &dir, &doc, &req, &|_, _| {}).unwrap();
        let b = std::fs::read(&target).unwrap();
        assert_eq!(r.bytes as usize, b.len());
        let seg = segments(&b);
        // ชุดแสดงภาพ (PCS ที่มีภาพ) กับชุดล้างจอ (PCS ไม่มีภาพ) ตามเวลา
        let pcs: Vec<(u32, u8)> = seg.iter().filter(|s| s.1 == 0x16).map(|s| (s.0, s.2[10])).collect();
        assert_eq!(pcs[0], (500, 1), "0.5 วินาที บรรทัดล่างหนึ่งกรอบ {pcs:?}");
        assert_eq!(pcs[1], (1000, 2), "1 วินาที บรรทัดล่างกับป้ายบนสองกรอบ {pcs:?}");
        assert_eq!(pcs[2], (2000, 0), "2 วินาที ล้างจอ {pcs:?}");
        let fade: Vec<&(u32, u8)> = pcs.iter().filter(|p| p.0 >= 3000 && p.0 < 3500 && p.1 > 0).collect();
        assert!(fade.len() >= 5, "บรรทัดเฟดวาดทุกเฟรม ได้ {} ภาพ", fade.len());
        assert_eq!(*pcs.last().unwrap(), (3500, 0), "จบเฟดล้างจอ");
        // ชุดแรกเป็นจุดเริ่มชุดใหม่ ชุดล้างจอเป็นแบบปกติ · รหัสอัตราเฟรม 23.976
        let first = &seg.iter().find(|s| s.1 == 0x16).unwrap().2;
        assert_eq!((first[0..2].to_vec(), first[4], first[7]), (1280u16.to_be_bytes().to_vec(), 0x10, 0x80));
        assert!(r.images >= 8 && r.max_colors > 0, "{r:?}");
        // ffmpeg ถอดไฟล์ได้ และภาพตรงกับที่ libass วาด สีเหลืองยังเหลือง (ค่าต่างเฉลี่ยต่ำ)
        // -copyts ให้ใช้เวลาเดิมของไฟล์ ไม่งั้น ffmpeg ขยับไฟล์ที่เริ่ม 0.5 วินาทีให้เริ่มที่ศูนย์ ภาพขึ้นเร็วไปครึ่งวินาที
        let sup_in: Vec<OsString> = vec!["-copyts".into(), "-i".into(), target.as_os_str().to_owned()];
        let a = frame(&sup_in, "[0:v][1:s]overlay", 1280, 720, 1.5);
        let sub = crate::subshot::TmpSub::new(&dir, &doc).unwrap();
        let vf = format!("[0:v]{}", crate::subshot::subs_filter(&sub.0, None, 1280, 720, false));
        let l = frame(&[], &vf, 1280, 720, 1.5);
        let lit = |v: &[u8]| v.chunks(3).filter(|p| p[0] as u32 + p[1] as u32 + p[2] as u32 > 60).count();
        assert!(lit(&l) > 2000, "libass วาดซับขึ้น");
        let diff: u64 = a.iter().zip(&l).map(|(x, y)| (*x as i32 - *y as i32).unsigned_abs() as u64).sum();
        let mean = diff as f64 / a.len() as f64;
        assert!(mean < 1.5, "ภาพจาก .sup ต่างจาก libass เฉลี่ย {mean:.2} ต่อช่องสี");
        // จุดเหลือง (แดงเขียวสูง น้ำเงินต่ำ) มีในภาพจาก .sup ราวเท่าของ libass
        let yellow = |v: &[u8]| v.chunks(3).filter(|p| p[0] > 200 && p[1] > 200 && p[2] < 80).count();
        let (ya, yl) = (yellow(&a), yellow(&l));
        assert!(ya as f64 > yl as f64 * 0.8, "สีเหลืองจาก .sup {ya} จุด libass {yl} จุด");
        drop(sub);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn reduce_keeps_at_most_k() {
        let mut h = HashMap::new();
        for i in 0..1000u32 { h.insert(u32::from_le_bytes([(i % 256) as u8, (i / 4) as u8, 50, 255]), 1 + i % 3); }
        let (pal, map) = reduce(h, 255);
        assert!(pal.len() <= 255);
        assert_eq!(map.len(), 1000);
        assert!(map.values().all(|&v| v >= 1 && (v as usize) <= pal.len()));
    }
}
