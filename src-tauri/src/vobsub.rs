//! ตัวอ่านซับรูป VobSub ของ DVD (ไฟล์ .idx คู่ .sub) · แผน OCR ขั้น 1 กับ BUGS ข้อ 144
//! เดิมตัวดูซับให้ ffmpeg วาดซับ VobSub เป็นภาพเต็มจอทุกครั้งที่ซับเปลี่ยน หนังยาวสองชั่วโมงรอนานมาก
//! (พี่กันทัก 16 พ.ย. 2569 "เเต่พอเอาไฟล์นี้เข้าเพื่อดูเเค่ซํบ มันรอนานมากกกกก") · ตอนนี้อ่านไฟล์ .sub เองตามตำแหน่งใน .idx
//! ซับ VobSub ในหนัง MKV ดึงด้วย mkvextract ได้ .idx กับ .sub ก่อน (ใช้เวลาเท่าอ่านไฟล์หนังหนึ่งรอบ มีเปอร์เซ็นต์บอก)
//! ไฟล์ห่ออื่นที่มี VobSub (MP4) ให้ ffmpeg ลอกแทร็กเป็น MKV ชั่วคราวก่อน แล้วทำแบบเดียวกัน
//!
//! แปลจากซอร์ส Subtitle Edit (src/libse/VobSub/SubPicture.cs Idx.cs VobSubParser.cs VobSubMergedPack.cs
//! และ PacketizedElementaryStream.cs) ซึ่งใช้สัญญาอนุญาต MIT
//!   Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors
//!   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//!   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//!   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
//!   to permit persons to whom the Software is furnished to do so, subject to the following conditions:
//!   The above copyright notice and this permission notice shall be included in all copies or substantial portions
//!   of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
//! ตัวถอดภาพแบบ RLE เขียนตามแบบมาตรฐานของ DVD (http://www.mpucoder.com/DVD/spu.html) แบบเดียวกับตัวถอดของ ffmpeg
//! ไม่แตะไฟล์หนังและไฟล์ซับต้นฉบับ อ่านอย่างเดียว ไฟล์ชั่วคราวอยู่ในโฟลเดอร์ทำงานของโปรแกรม ลบเมื่อจบ

use crate::tools::{run_tool_timeout, tool_command, tool_succeeded};
use std::ffi::OsString;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

/// ภาษาหนึ่งในไฟล์ .idx กับเวลาและตำแหน่งในไฟล์ .sub ของทุกภาพ
#[derive(Debug, Clone, Default, PartialEq)]
pub struct IdxLang {
    /// รหัสภาษาสองตัวจากบรรทัด id: เช่น ja en
    pub code: String,
    /// (เวลาเป็นวินาทีรวมดีเลย์แล้ว, ตำแหน่งในไฟล์ .sub)
    pub entries: Vec<(f64, u64)>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct IdxFile {
    /// ขนาดจอจากบรรทัด size: · ไม่มีเป็น 0
    pub size: (u32, u32),
    /// สี 16 สีจากบรรทัด palette:
    pub palette: Vec<[u8; 3]>,
    pub langs: Vec<IdxLang>,
}

/// เวลาแบบ hh:mm:ss:ms ของไฟล์ .idx เป็นวินาที · ขึ้นต้นด้วย - คือติดลบ (ใช้กับบรรทัด delay:)
fn idx_time(s: &str) -> Option<f64> {
    let s = s.trim();
    let (neg, s) = s.strip_prefix('-').map(|r| (true, r)).unwrap_or((false, s));
    let p: Vec<f64> = s.split(':').map(|x| x.trim().parse::<f64>()).collect::<Result<_, _>>().ok()?;
    if p.len() != 4 { return None; }
    let v = p[0] * 3600.0 + p[1] * 60.0 + p[2] + p[3] / 1000.0;
    Some(if neg { -v } else { v })
}

/// อ่านไฟล์ .idx ตาม Idx.cs ของ Subtitle Edit · บรรทัด delay: เลื่อนเวลาของภาพที่ตามมาในภาษาเดียวกัน (ตามที่ VobSub ของ DVD เขียน)
pub fn parse_idx(text: &str) -> IdxFile {
    let mut f = IdxFile::default();
    let mut delay = 0.0;
    for line in text.lines() {
        let l = line.trim();
        let low = l.to_ascii_lowercase();
        if let Some(rest) = low.strip_prefix("timestamp:") {
            // timestamp: 00:00:01:401, filepos: 000000000
            let mut it = rest.split(',');
            let t = it.next().and_then(idx_time);
            let pos = it.next().and_then(|p| p.trim().strip_prefix("filepos:")).and_then(|h| u64::from_str_radix(h.trim(), 16).ok());
            if let (Some(t), Some(pos)) = (t, pos) {
                if f.langs.is_empty() { f.langs.push(IdxLang::default()); }
                f.langs.last_mut().unwrap().entries.push(((t + delay).max(0.0), pos));
            }
        } else if let Some(rest) = low.strip_prefix("palette:") {
            f.palette = rest.split(|c| c == ',' || c == ' ').filter(|h| !h.is_empty()).filter_map(|h| {
                let h = h.trim_start_matches('#');
                let v = u32::from_str_radix(h, 16).ok()?;
                Some([(v >> 16) as u8, (v >> 8) as u8, v as u8])
            }).collect();
        } else if let Some(rest) = low.strip_prefix("size:") {
            let p: Vec<u32> = rest.split(|c: char| c == 'x' || c == ',' || c == ' ').filter_map(|x| x.trim().parse().ok()).collect();
            if p.len() >= 2 && p[0] > 0 && p[1] > 0 { f.size = (p[0], p[1]); }
        } else if let Some(rest) = low.strip_prefix("id:") {
            // id: en, index: 0 · เริ่มภาษาใหม่ ดีเลย์กลับเป็นศูนย์
            let code = rest.split(',').next().unwrap_or("").trim().to_string();
            // ไฟล์ที่มีเวลาก่อนบรรทัด id: แรก ให้ภาษาแรกรับไป ไม่สร้างภาษาว่างซ้อน
            if f.langs.len() == 1 && f.langs[0].code.is_empty() { f.langs[0].code = code; } else { f.langs.push(IdxLang { code, entries: vec![] }); }
            delay = 0.0;
        } else if let Some(rest) = low.strip_prefix("delay:") {
            if let Some(d) = idx_time(rest) { delay = d; }
        }
    }
    f
}

/// ภาพหนึ่งหน่วยของ DVD (SPU) ที่อ่านคำสั่งแล้ว · ตาม SubPicture.cs
#[derive(Debug, Clone, PartialEq)]
pub struct Spu {
    pub forced: bool,
    /// เวลาที่ซับหายนับจากเวลาเริ่ม (วินาที) · ไม่มีคำสั่งหยุดแสดงเป็น None
    pub delay: Option<f64>,
    /// กรอบแสดงผล x1 y1 x2 y2 (รวมจุดปลาย)
    pub area: (u32, u32, u32, u32),
    /// ตำแหน่งข้อมูลภาพของแถวคู่กับแถวคี่
    pub fields: (usize, usize),
    /// เลขสีในจานสี 16 สีของ พื้น ตัว เน้น 1 เน้น 2
    pub colors: [u8; 4],
    /// ความทึบ 0–15 ของสี่สีนั้น · None คือไม่มีคำสั่งตั้งความทึบ
    pub contrast: Option<[u8; 4]>,
}

fn be16(d: &[u8], i: usize) -> usize { d.get(i..i + 2).map(|b| ((b[0] as usize) << 8) | b[1] as usize).unwrap_or(0) }

/// อ่านลำดับคำสั่งของภาพ · ตาม ParseDisplayControlCommands ของ SubPicture.cs
/// ภาพที่มีคำสั่งหยุดแสดงหลายครั้ง ใช้ค่าตอนหยุดแสดงที่นานที่สุดแบบ Subtitle Edit
pub fn parse_spu(d: &[u8]) -> Option<Spu> {
    if d.len() < 4 { return None; }
    let mut cur = Spu { forced: false, delay: None, area: (0, 0, 0, 0), fields: (0, 0), colors: [0, 1, 2, 3], contrast: None };
    let mut area_set = false;
    let mut best: Option<Spu> = None;
    let mut addr = be16(d, 2);
    let mut last = 0usize;
    let mut guard = 0;
    while addr > last && addr + 1 < d.len() && guard < 64 {
        guard += 1;
        let wait = be16(d, addr);
        let mut i = addr + 4;
        let mut n = 0;
        while i < d.len() && d[i] != 0xFF && n < 1000 {
            n += 1;
            match d[i] {
                0x00 => { cur.forced = true; i += 1; }
                0x01 => { i += 1; }
                0x02 => {
                    let t = ((wait << 10) as f64) / 90.0 / 1000.0;
                    cur.delay = Some(t);
                    if best.as_ref().and_then(|b| b.delay).map_or(true, |bd| t > bd) { best = Some(cur.clone()); }
                    i += 1;
                }
                0x03 => {
                    if i + 2 < d.len() { cur.colors = [d[i + 2] & 0x0F, d[i + 2] >> 4, d[i + 1] & 0x0F, d[i + 1] >> 4]; }
                    i += 3;
                }
                0x04 => {
                    if i + 2 < d.len() && (d[i + 1] as u16 + d[i + 2] as u16) > 0 {
                        cur.contrast = Some([d[i + 2] & 0x0F, d[i + 2] >> 4, d[i + 1] & 0x0F, d[i + 1] >> 4]);
                    }
                    i += 3;
                }
                0x05 => {
                    if i + 6 < d.len() && !area_set {
                        let x1 = ((d[i + 1] as u32) << 4) | (d[i + 2] as u32 >> 4);
                        let x2 = ((d[i + 2] as u32 & 0x0F) << 8) | d[i + 3] as u32;
                        let y1 = ((d[i + 4] as u32) << 4) | (d[i + 5] as u32 >> 4);
                        let y2 = ((d[i + 5] as u32 & 0x0F) << 8) | d[i + 6] as u32;
                        cur.area = (x1, y1, x2, y2);
                        area_set = true;
                    }
                    i += 7;
                }
                0x06 => { cur.fields = (be16(d, i + 1), be16(d, i + 3)); i += 5; }
                0x07 => {
                    // เปลี่ยนสีกับความทึบทีละช่วง · Subtitle Edit ข้ามไปตามความยาวพารามิเตอร์ ไม่ใช้ค่า ทำแบบเดียวกัน
                    i += 1;
                    if i + 1 < d.len() { i += (d[i + 1] as usize).max(1); } else { i += 1; }
                }
                _ => { i += 1; }
            }
        }
        last = addr;
        addr = be16(d, addr + 2);
    }
    // คำสั่งบังคับแสดงอาจอยู่คนละลำดับกับคำสั่งหยุด นับว่าบังคับถ้าเจอที่ไหนก็ได้
    let forced = cur.forced;
    let mut s = best.unwrap_or(cur);
    s.forced |= forced;
    if s.area.2 < s.area.0 || s.area.3 < s.area.1 { return None; }
    Some(s)
}

/// ตัวอ่านทีละสี่บิตของข้อมูลภาพ
struct Nib<'a> { d: &'a [u8], p: usize }
impl Nib<'_> {
    fn get(&mut self) -> Option<u32> {
        let b = *self.d.get(self.p / 2)?;
        let v = if self.p % 2 == 0 { b >> 4 } else { b & 0x0F };
        self.p += 1;
        Some(v as u32)
    }
    fn align(&mut self) { if self.p % 2 == 1 { self.p += 1; } }
}

/// ถอดภาพทั้งกรอบเป็นเลขสี 0–3 ทีละจุด · แถวคู่อ่านจาก fields.0 แถวคี่จาก fields.1
/// รหัสความยาว 4 8 12 16 บิต รหัส 16 บิตที่ความยาวเป็นศูนย์คือเติมสีถึงสุดแถว จบแถวแล้วขยับไปขอบไบต์ถัดไป
pub fn decode_indices(d: &[u8], spu: &Spu) -> (u32, u32, Vec<u8>) {
    let w = spu.area.2 - spu.area.0 + 1;
    let h = spu.area.3 - spu.area.1 + 1;
    let mut px = vec![0u8; (w * h) as usize];
    for (field, start) in [(0u32, spu.fields.0), (1u32, spu.fields.1)] {
        let mut r = Nib { d, p: start * 2 };
        let mut y = field;
        'rows: while y < h {
            let mut x = 0u32;
            while x < w {
                let Some(mut v) = r.get() else { break 'rows };
                if v < 0x4 {
                    let Some(n) = r.get() else { break 'rows }; v = (v << 4) | n;
                    if v < 0x10 {
                        let Some(n) = r.get() else { break 'rows }; v = (v << 4) | n;
                        if v < 0x40 {
                            let Some(n) = r.get() else { break 'rows }; v = (v << 4) | n;
                        }
                    }
                }
                let c = (v & 3) as u8;
                let mut len = v >> 2;
                if len == 0 { len = w - x; }
                let len = len.min(w - x);
                if c != 0 {
                    let row = (y * w) as usize;
                    for k in x..x + len { px[row + k as usize] = c; }
                }
                x += len;
            }
            r.align();
            y += 2;
        }
    }
    (w, h, px)
}

/// สีจริงของสี่สีจากจานสีของ .idx กับความทึบในภาพ · ตาม GetBitmap ของ VobSubMergedPack (พื้นเริ่มต้นใส)
/// ไม่มีจานสี (ไฟล์ .sub ไม่มี .idx) ใช้ตัวขาวขอบดำแบบ Subtitle Edit เดาจากภาพในตัวคุมงาน OCR ภายหลัง ตอนนี้ใช้ขาว ดำ เทา
pub fn spu_rgba(spu: &Spu, palette: &[[u8; 3]]) -> [[u8; 4]; 4] {
    let mut out = [[0, 0, 0, 0], [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255]];
    if palette.len() >= 16 {
        for k in 0..4 {
            let [r, g, b] = palette[spu.colors[k] as usize & 15];
            out[k] = [r, g, b, 255];
        }
    } else {
        out = [[0, 0, 0, 0], [255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]];
    }
    if let Some(c) = spu.contrast { for k in 0..4 { out[k][3] = c[k] * 17; } } else { out[0][3] = 0; }
    out
}

/// ภาพทั้งกรอบแสดงผลตามสีที่ให้มา
pub fn render(d: &[u8], spu: &Spu, rgba: [[u8; 4]; 4]) -> image::RgbaImage {
    let (w, h, px) = decode_indices(d, spu);
    let mut img = image::RgbaImage::new(w, h);
    for (p, &c) in img.pixels_mut().zip(px.iter()) { *p = image::Rgba(rgba[c as usize]); }
    img
}

/// อ่าน SPU หนึ่งภาพจากไฟล์ .sub เริ่มที่ตำแหน่ง pos · ต่อข้อมูลจากหลายแพ็กของ MPEG-PS จนครบตามขนาดในสองไบต์แรก
/// แพ็กของสตรีมย่อยอื่น (ซับภาษาอื่นในไฟล์เดียวกัน) ข้าม · ตาม OpenSubIdx ของ VobSubParser.cs
pub fn spu_at(sub: &[u8], pos: usize) -> Option<Vec<u8>> {
    let mut out: Vec<u8> = Vec::new();
    let mut want: Option<usize> = None;
    let mut sid: Option<u8> = None;
    let mut p = pos;
    let mut guard = 0;
    while p + 9 < sub.len() && guard < 4096 {
        guard += 1;
        if sub[p..p + 4] == [0, 0, 1, 0xBA] {
            // หัวแพ็กแบบ MPEG-2 ยาว 14 ไบต์บวกไบต์เติม · แบบ MPEG-1 ยาว 12
            p += if sub[p + 4] & 0xC0 == 0x40 { 14 + (sub.get(p + 13).copied().unwrap_or(0) & 7) as usize } else { 12 };
            continue;
        }
        if sub.get(p..p + 3) != Some(&[0, 0, 1]) { return None; }
        let code = sub[p + 3];
        let len = be16(sub, p + 4);
        if code == 0xBE || code == 0xB9 { p += if code == 0xB9 { 4 } else { 6 + len }; continue; }
        if code != 0xBD { p += 6 + len; continue; }
        let hdr = sub.get(p + 8).copied()? as usize;
        let ps = p + 9 + hdr;
        let id = *sub.get(ps)?;
        let end = (p + 6 + len).min(sub.len());
        p += 6 + len;
        if !(0x20..=0x3F).contains(&id) { continue; }
        if *sid.get_or_insert(id) != id { continue; }
        if ps + 1 <= end { out.extend_from_slice(&sub[ps + 1..end]); }
        if want.is_none() && out.len() >= 2 { want = Some(be16(&out, 0)); }
        if let Some(n) = want { if n >= 4 && out.len() >= n { out.truncate(n); return Some(out); } }
    }
    match want { Some(n) if n >= 4 && out.len() >= n => { out.truncate(n); Some(out) } _ => None }
}

/// ซับหนึ่งภาพที่อ่านจาก VobSub
#[derive(Debug, Clone)]
pub struct VobShow {
    pub start: f64,
    pub end: Option<f64>,
    pub canvas: (u32, u32),
    /// ตำแหน่งบนจอของกรอบแสดงผล
    pub at: (u32, u32),
    pub forced: bool,
    /// ภาพทั้งกรอบแสดงผล
    pub img: image::RgbaImage,
    /// ข้อมูลดิบของภาพ ไว้วาดใหม่ด้วยสีที่ผู้ใช้เลือกในหน้าต่างสีของ VobSub (แผน OCR ขั้น 11)
    #[allow(dead_code)]
    pub spu: Vec<u8>,
}

/// อ่านทุกภาพของภาษาที่เลือกจากไฟล์ .idx กับ .sub · ภาพที่เสียหรือเล็กผิดปกติตัดทิ้งแบบ MergeVobSubPacks ของ Subtitle Edit
/// เวลาจบใช้คำสั่งหยุดแสดงในภาพ ไม่มีใช้เวลาเริ่มของภาพถัดไป (ไม่เกิน 60 วินาทีแบบตัวดูซับรูปเดิม)
pub fn read(idx: &IdxFile, sub: &[u8], lang: usize, progress: &dyn Fn(f64)) -> Vec<VobShow> {
    let Some(l) = idx.langs.get(lang).or_else(|| idx.langs.iter().find(|l| !l.entries.is_empty())) else { return vec![] };
    // ขนาดจอไม่มีในไฟล์ เดาจากกรอบที่ไกลที่สุด ปัดเป็น 720 × 480 หรือ 720 × 576 แบบ DVD
    let mut out: Vec<VobShow> = Vec::with_capacity(l.entries.len());
    let total = l.entries.len().max(1);
    for (k, &(t, pos)) in l.entries.iter().enumerate() {
        if k % 50 == 0 { progress(k as f64 * 100.0 / total as f64); }
        let Some(data) = spu_at(sub, pos as usize) else { continue };
        let Some(spu) = parse_spu(&data) else { continue };
        let (w, h) = (spu.area.2 - spu.area.0 + 1, spu.area.3 - spu.area.1 + 1);
        if w <= 3 || h <= 2 { continue; }
        if spu.delay.is_some_and(|d| d < 0.1) && w <= 10 && h <= 10 { continue; }
        let img = render(&data, &spu, spu_rgba(&spu, &idx.palette));
        out.push(VobShow { start: t, end: spu.delay.filter(|d| *d > 0.0).map(|d| t + d), canvas: idx.size, at: (spu.area.0, spu.area.1), forced: spu.forced, img, spu: data });
    }
    for i in 0..out.len() {
        if out[i].end.is_none() {
            if let Some(n) = out.get(i + 1).map(|n| n.start) { if n > out[i].start && n - out[i].start <= 60.0 { out[i].end = Some(n); } }
        }
    }
    if idx.size.0 == 0 {
        let maxy = out.iter().map(|s| s.at.1 + s.img.height()).max().unwrap_or(0);
        let maxx = out.iter().map(|s| s.at.0 + s.img.width()).max().unwrap_or(0);
        let canvas = (maxx.max(720), if maxy > 480 { maxy.max(576) } else { 480 });
        for s in out.iter_mut() { s.canvas = canvas; }
    }
    progress(100.0);
    out
}

// ---------------------------------------------------------------- หาไฟล์ .idx กับ .sub จากไฟล์ที่เปิด

/// ไฟล์ .sub ที่เป็นซับรูปของ DVD (ขึ้นต้นด้วยหัวแพ็ก MPEG-PS) ไม่ใช่ซับข้อความแบบ MicroDVD
pub fn is_vobsub_file(sub: &Path) -> bool {
    use std::io::Read;
    let mut b = [0u8; 4];
    std::fs::File::open(sub).and_then(|mut f| f.read_exact(&mut b)).is_ok() && b == [0, 0, 1, 0xBA]
}

/// คู่ .idx กับ .sub ของไฟล์ที่เปิด (เปิดไฟล์ไหนของคู่ก็ได้) · ไม่ใช่ VobSub คืน None
pub fn pair_of(path: &Path) -> Option<(PathBuf, PathBuf)> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    if ext != "idx" && ext != "sub" { return None; }
    let idx = path.with_extension("idx");
    let sub = path.with_extension("sub");
    (idx.is_file() && sub.is_file() && is_vobsub_file(&sub)).then_some((idx, sub))
}

/// ชนิดของสตรีมที่ ff กับความยาวไฟล์ (วินาที) จาก ffprobe
pub(crate) fn stream_codec(tools: &Path, file: &Path, ff: u64) -> (String, f64) {
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-print_format".into(), "json".into(), "-show_streams".into(), "-show_format".into(), file.into()];
    let Ok(o) = run_tool_timeout(tools, "ffprobe", &args, Duration::from_secs(60)) else { return (String::new(), 0.0) };
    let j: serde_json::Value = serde_json::from_slice(&o.stdout).unwrap_or_default();
    let codec = j["streams"].as_array().and_then(|s| s.iter().find(|x| x["index"].as_u64() == Some(ff)))
        .and_then(|x| x["codec_name"].as_str()).unwrap_or("").to_string();
    let dur = j["format"]["duration"].as_str().and_then(|v| v.parse().ok()).unwrap_or(0.0);
    (codec, dur)
}

/// สตรีมที่ ff ของไฟล์นี้เป็นซับ VobSub ไหม
pub fn is_vobsub_stream(tools: &Path, file: &Path, ff: u64) -> bool { stream_codec(tools, file, ff).0 == "dvd_subtitle" }

/// รันเครื่องมือแล้วอ่านความคืบหน้าทีละบรรทัด · mkvextract แบบ --gui-mode บอก #GUI#progress N%
/// ffmpeg แบบ -progress pipe:1 บอก out_time_us เทียบกับความยาวไฟล์ · คืนบรรทัดผิดพลาดท้าย ๆ ไว้บอกสาเหตุ
pub(crate) fn run_progress(tools: &Path, tool: &str, args: &[OsString], dur: f64, on: &dyn Fn(f64)) -> Result<(bool, Vec<String>, String), String> {
    let mut child = tool_command(tools, tool, args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| format!("เรียก {tool} ไม่ได้: {e}"))?;
    crate::winutil::kill_with_app(&child);
    let err = child.stderr.take().unwrap();
    let err_t = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = std::io::Read::read_to_string(&mut BufReader::new(err), &mut s);
        s
    });
    let mut tail: Vec<String> = Vec::new();
    for l in BufReader::new(child.stdout.take().unwrap()).lines().map_while(Result::ok) {
        if let Some(p) = l.strip_prefix("#GUI#progress ").and_then(|v| v.trim().trim_end_matches('%').parse::<f64>().ok()) {
            on(p.clamp(0.0, 100.0));
        } else if let Some(us) = l.strip_prefix("out_time_us=").and_then(|v| v.trim().parse::<f64>().ok()) {
            if dur > 0.0 { on((us / 1e6 / dur * 100.0).clamp(0.0, 100.0)); }
        } else if l.starts_with("#GUI#error") || l.starts_with("#GUI#warning") {
            tail.push(l);
        }
    }
    let st = child.wait().map_err(|e| e.to_string())?;
    let errs = err_t.join().unwrap_or_default();
    tail.extend(errs.lines().filter(|l| !l.trim().is_empty() && !l.contains("Parsed_showinfo")).map(str::to_string));
    if tail.len() > 6 { tail.drain(..tail.len() - 6); }
    Ok((tool_succeeded(tool, &st), tail, errs))
}

/// เหตุผลเป็นภาษาคนจากบรรทัดผิดพลาดของเครื่องมือ
fn why(tool: &str, tail: &[String]) -> String {
    crate::tools::explain_fail(tool, tail, None).line()
}

/// ไฟล์ .idx กับ .sub ของซับ VobSub ในหนัง · ส่วนที่ใช้เวลานานคืออ่านไฟล์หนังทั้งไฟล์ รายงานความคืบหน้า 0–100
/// MKV ใช้ mkvextract ตรง ถ้าแทร็กที่ตรงเลข ff เป็น VobSub (MKV เลขสตรีมของ ffmpeg เรียงเท่าเลขแทร็กของ mkvmerge)
/// ไฟล์อื่นให้ ffmpeg ลอกแทร็กนั้นลง MKV ชั่วคราวก่อน (คืบหน้าครึ่งแรก) แล้ว mkvextract (ครึ่งหลัง)
pub fn extract_pair(tools: &Path, dir: &Path, file: &Path, ff: u64, on: &dyn Fn(f64)) -> Result<(PathBuf, PathBuf), String> {
    let base = dir.join("track.sub");
    let (idx, sub) = (dir.join("track.idx"), dir.join("track.sub"));
    let mkv_tid = |src: &Path, id: u64| -> bool {
        let args: Vec<OsString> = vec!["-J".into(), src.into()];
        run_tool_timeout(tools, "mkvmerge", &args, Duration::from_secs(60)).ok()
            .and_then(|o| serde_json::from_slice::<serde_json::Value>(&o.stdout).ok())
            .and_then(|j| j["tracks"].as_array().and_then(|t| t.iter().find(|x| x["id"].as_u64() == Some(id))).and_then(|x| x["properties"]["codec_id"].as_str().map(|c| c == "S_VOBSUB")))
            .unwrap_or(false)
    };
    let mkvx = |src: &Path, id: u64, on: &dyn Fn(f64)| -> Result<(), String> {
        let args: Vec<OsString> = vec!["--gui-mode".into(), src.into(), "tracks".into(), format!("{id}:{}", base.display()).into()];
        let (ok, tail, _) = run_progress(tools, "mkvextract", &args, 0.0, on)?;
        // mkvextract เขียน VobSub เป็นสองไฟล์ เปลี่ยนนามสกุลของชื่อที่ส่งไปเอง (BUGS ข้อ 150) · ส่ง track.sub ได้ track.idx กับ track.sub
        if !ok || !idx.is_file() || !sub.is_file() { return Err(format!("ดึงซับ VobSub จากหนังไม่สำเร็จ {}", why("mkvextract", &tail))); }
        Ok(())
    };
    let is_mkv = matches!(file.extension().map(|e| e.to_string_lossy().to_lowercase()).as_deref(), Some("mkv" | "mks" | "mka" | "mk3d" | "webm"));
    if is_mkv && mkv_tid(file, ff) {
        mkvx(file, ff, on)?;
        return Ok((idx, sub));
    }
    let (_, dur) = stream_codec(tools, file, ff);
    let tmp = dir.join("track.mks");
    let args: Vec<OsString> = vec!["-v".into(), "error".into(), "-nostdin".into(), "-nostats".into(), "-y".into(), "-progress".into(), "pipe:1".into(), "-copyts".into(),
        "-i".into(), file.into(), "-map".into(), format!("0:{ff}").into(), "-c".into(), "copy".into(), "-f".into(), "matroska".into(), tmp.clone().into()];
    let (ok, tail, _) = run_progress(tools, "ffmpeg", &args, dur, &|p| on(p * 0.5))?;
    if !ok || !tmp.is_file() { let _ = std::fs::remove_file(&tmp); return Err(format!("ลอกซับ VobSub จากไฟล์ไม่สำเร็จ {}", why("ffmpeg", &tail))); }
    let r = mkvx(&tmp, 0, &|p| on(50.0 + p * 0.5));
    let _ = std::fs::remove_file(&tmp);
    r.map(|_| (idx, sub))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idx_reads_size_palette_langs_and_delay() {
        let t = "# VobSub index file, v7\nsize: 720x480\npalette: 000000, ffffff, 808080, 101010, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, ff0000\n\
id: ja, index: 0\ntimestamp: 00:00:15:516, filepos: 000000000\ndelay: 00:00:01:000\ntimestamp: 00:00:27:694, filepos: 000001000\n\
id: en, index: 1\ntimestamp: 00:01:00:000, filepos: 00000a800\n";
        let f = parse_idx(t);
        assert_eq!(f.size, (720, 480));
        assert_eq!(f.palette.len(), 16);
        assert_eq!(f.palette[15], [255, 0, 0]);
        assert_eq!(f.langs.len(), 2);
        assert_eq!(f.langs[0].code, "ja");
        assert_eq!(f.langs[0].entries[0], (15.516, 0));
        assert!((f.langs[0].entries[1].0 - 28.694).abs() < 1e-9, "ดีเลย์ต้องบวกเข้าเวลาที่ตามมา");
        assert_eq!(f.langs[0].entries[1].1, 0x1000);
        assert_eq!(f.langs[1].entries, vec![(60.0, 0xa800)]);
    }

    /// ภาพ 8 × 2 ที่เข้ารหัสมือ: แถวบน 3 จุดสี 1 แล้วเติมสี 0 ถึงสุดแถว · แถวล่างเต็มแถวสี 2
    fn tiny_spu() -> Vec<u8> {
        let mut d = vec![0u8; 4];
        // ข้อมูลภาพเริ่มไบต์ 4 · แถวคู่: รหัส 4 บิต n=3 c=1 = 0b1101 แล้วรหัสเติมถึงสุดแถว 16 บิต 0x0000 · ขยับขอบไบต์
        let top = 4usize;
        d.extend_from_slice(&[0xD0, 0x00, 0x00]); // D | 0000 0000 0000 | 0 (เศษครึ่งไบต์ ขยับขอบ)
        let bottom = d.len();
        d.extend_from_slice(&[0x00, 0x02]); // รหัส 16 บิต n=0 c=2 = เติมทั้งแถวสี 2
        let dcsq = d.len();
        // คำสั่ง: ตั้งสี ตั้งความทึบ กรอบ 10..17 × 20..21 ที่อยู่ข้อมูล เริ่มแสดง จบ
        d.extend_from_slice(&[0x00, 0x00]);
        d.extend_from_slice(&[(dcsq >> 8) as u8, dcsq as u8]); // ชี้ตัวเองชั่วคราว แก้เป็นลำดับที่สองข้างล่าง
        d.extend_from_slice(&[0x03, 0x32, 0x10]);
        d.extend_from_slice(&[0x04, 0xFF, 0xF0]);
        d.extend_from_slice(&[0x05, 0x00, 0xA0, 0x11, 0x01, 0x40, 0x15]);
        d.extend_from_slice(&[0x06, (top >> 8) as u8, top as u8, (bottom >> 8) as u8, bottom as u8]);
        d.push(0x01);
        d.push(0xFF);
        // ลำดับที่สอง หยุดแสดงหลัง 90 หน่วย (90 << 10 / 90 ms = 1.024 วินาที)
        let dcsq2 = d.len();
        d.extend_from_slice(&[0x00, 90, (dcsq2 >> 8) as u8, dcsq2 as u8, 0x02, 0xFF]);
        d[dcsq + 2] = (dcsq2 >> 8) as u8;
        d[dcsq + 3] = dcsq2 as u8;
        let n = d.len();
        d[0] = (n >> 8) as u8;
        d[1] = n as u8;
        d[2] = (dcsq >> 8) as u8;
        d[3] = dcsq as u8;
        d
    }

    #[test]
    fn spu_commands_and_rle() {
        let d = tiny_spu();
        let s = parse_spu(&d).expect("อ่านคำสั่งได้");
        assert_eq!(s.area, (10, 20, 17, 21));
        assert_eq!(s.colors, [0, 1, 2, 3]);
        assert_eq!(s.contrast, Some([0, 15, 15, 15]));
        assert!((s.delay.unwrap() - 1.024).abs() < 1e-9);
        let (w, h, px) = decode_indices(&d, &s);
        assert_eq!((w, h), (8, 2));
        assert_eq!(&px[..8], &[1, 1, 1, 0, 0, 0, 0, 0]);
        assert_eq!(&px[8..], &[2; 8]);
        let rgba = spu_rgba(&s, &[[9, 9, 9], [200, 0, 0], [0, 200, 0], [0, 0, 200], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3]]);
        assert_eq!(rgba[0][3], 0, "พื้นใส");
        assert_eq!(rgba[1], [200, 0, 0, 255]);
    }

    #[test]
    fn packs_are_joined_and_other_streams_skipped() {
        let spu = tiny_spu();
        // แบ่ง SPU เป็นสองแพ็ก มีแพ็กของสตรีม 0x21 คั่นกลาง
        let pack = |id: u8, body: &[u8]| -> Vec<u8> {
            let mut v = vec![0, 0, 1, 0xBA, 0x44, 0, 4, 0, 4, 1, 1, 0x89, 0xC3, 0xF8];
            let len = 3 + 1 + body.len();
            v.extend_from_slice(&[0, 0, 1, 0xBD, (len >> 8) as u8, len as u8, 0x81, 0x00, 0x00, id]);
            v.extend_from_slice(body);
            v
        };
        let half = spu.len() / 2;
        let mut sub = pack(0x20, &spu[..half]);
        sub.extend(pack(0x21, &[1, 2, 3, 4]));
        sub.extend(pack(0x20, &spu[half..]));
        assert_eq!(spu_at(&sub, 0).as_deref(), Some(&spu[..]));
    }

    /// ซับ VobSub ญี่ปุ่นของ Shin Godzilla ที่พี่กันให้ (ห้ามขึ้น git) · ตั้ง MOVIE_SHELF_VOBSUB=<ไฟล์ .idx>
    /// เทียบจำนวนภาพกับในไฟล์ .idx และจับเวลาอ่านทั้งไฟล์
    #[test]
    fn real_vobsub_file() {
        let Ok(p) = std::env::var("MOVIE_SHELF_VOBSUB") else { eprintln!("ข้าม ไม่ได้ตั้ง MOVIE_SHELF_VOBSUB"); return };
        let idx = parse_idx(&String::from_utf8_lossy(&std::fs::read(&p).unwrap()));
        let sub = std::fs::read(Path::new(&p).with_extension("sub")).unwrap();
        let t = std::time::Instant::now();
        let shows = read(&idx, &sub, 0, &|_| {});
        let n = idx.langs[0].entries.len();
        eprintln!("อ่าน {} จาก {} ภาพ ใน {:.2} วินาที · จอ {:?}", shows.len(), n, t.elapsed().as_secs_f64(), idx.size);
        assert!(shows.len() + 5 >= n, "ภาพหายเกินห้าภาพ");
        let vert = shows.iter().filter(|s| s.img.height() > s.img.width()).count();
        eprintln!("ภาพแนวตั้ง {vert}");
        if let Ok(out) = std::env::var("MOVIE_SHELF_VOBSUB_DUMP") {
            for s in shows.iter().take(40) { let _ = s.img.save(Path::new(&out).join(format!("{:08.3}.png", s.start))); }
        }
    }
}
