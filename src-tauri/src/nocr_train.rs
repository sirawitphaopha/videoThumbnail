//! ฝึกฐาน nOCR จากฟอนต์ในเครื่อง กับย่อฐานให้เหลือเส้นที่บอกความต่าง (แผน OCR ขั้น 5 · BUGS ข้อ 143)
//! ตัวฝึกวาดตัวอักษรแบบซับรูปทั่วไป (ตัวขาวขอบดำบนพื้นใส) ทีละตัว ตัวที่ฐานยังอ่านไม่ออกสร้างเส้นเทียบแล้วเพิ่มเข้าฐาน
//! ตัวย่อฐานวาดตัวอักษรทุกตัวในฟอนต์ซับที่พบบ่อย แล้วเก็บเฉพาะเส้นที่ยังแยกตัวนั้นออกจากตัวที่หน้าตาคล้ายกันได้
//!
//! แปลจาก src/libuilogic/Ocr/NOcrTrainer.cs NOcrDbOptimizer.cs ExpandedOcrGroup.cs ของ Subtitle Edit สัญญา MIT
//! Copyright (c) 2001-2026 Nikolaj Lynge Olsson and contributors · ประกาศสัญญาเต็มอยู่หัวไฟล์ vobsub.rs
//! ต่างจากต้นฉบับ วาดด้วย libass ใน ffmpeg ที่โปรแกรมใช้วาดซับอยู่แล้ว แทน SkiaSharp · ขนาดฟอนต์ของ ASS คิดจากความสูงบรรทัด
//! ตัวอักษรที่ขนาดเลขเดียวกันจึงเล็กกว่าของ Subtitle Edit ราวหนึ่งในห้า ผลต่อการฝึกไม่มี เพราะตัวจับคู่ย่อขยายตามภาพอยู่แล้ว

#![allow(dead_code)]

use crate::nocr::{copy_rect, Bmp, NChar, NLine, NOcrDb, Piece, Placement, Pt};
use crate::nocr_lines::{fg_ok, bg_ok, generate, Algo, Rng};
use crate::nocr_split::split_letters;
use std::io::Read;
use std::path::Path;

const TWO_COLOR: u32 = 200;
const MAX_WRONG: i32 = 25;
const PIXELS_ARE_SPACE: i32 = 10;
const MIN_LINE_HEIGHT: i32 = 25;
const SMALL_GLYPH_AREA: i32 = 150;
const SMALL_GLYPH_SCALES: [f32; 2] = [1.5, 2.0];

/// ชุดตัวอักษรที่ฝึกตั้งต้น · ตาม NOcrTrainer.DefaultTrainingCharacters
pub const DEFAULT_CHARS: &str = concat!(
    "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789", ".,!?\"'()[]:;-+/%&$#@*=",
    "æøåäöüßéèêëáàâíìîóòôúùûñç", "ÆØÅÄÖÜÉÈÊËÁÀÂÍÌÎÓÒÔÚÙÛÑÇ"
);

// ---------------------------------------------------------------- กลุ่มชิ้นที่ขยายจับ

/// ชิ้นหลายชิ้นที่รวมเป็นตัวอักษรเดียว (สระกับพยัญชนะ เครื่องหมายคำพูด %) · ตาม ExpandedOcrGroup
pub struct Group { pub first: usize, pub count: usize, pub min_top: i32, pub min_y: i32, pub bounds: (i32, i32, i32, i32), pub preview: Bmp }

impl Group {
    /// ทุกชิ้นต้องเป็นภาพ อย่างน้อยสองชิ้น · ภาพตัวอย่างตัดจากภาพทั้งภาพตามกรอบที่ครอบทุกชิ้น
    pub fn create(src: &Bmp, list: &[Piece], start: usize, count: usize) -> Option<Group> {
        if count <= 1 || start + count > list.len() { return None; }
        let (mut min_top, mut x0, mut y0, mut x1, mut y1) = (i32::MAX, i32::MAX, i32::MAX, i32::MIN, i32::MIN);
        for p in &list[start..start + count] {
            let b = p.bmp.as_ref()?;
            min_top = min_top.min(p.top);
            x0 = x0.min(p.x);
            y0 = y0.min(p.y);
            x1 = x1.max(p.x + b.width() as i32);
            y1 = y1.max(p.y + b.height() as i32);
        }
        let preview = copy_rect(src, x0, y0, x1 - x0, y1 - y0);
        Some(Group { first: start, count, min_top, min_y: y0, bounds: (x0, y0, x1, y1), preview })
    }
    pub fn top_margin(&self, list: &[Piece]) -> i32 { list[self.first].top - self.min_top }
    /// ตัวในฐานแบบขยายจับ ยังไม่มีข้อความกับเส้น · ตาม CreateNOcrChar
    pub fn nchar(&self, list: &[Piece]) -> NChar {
        NChar { width: self.preview.width() as i32, height: self.preview.height() as i32, margin_top: self.top_margin(list), expand_count: self.count as i32, ..Default::default() }
    }
}

// ---------------------------------------------------------------- วาดตัวอักษร

/// ภาพสองสีของข้อความ "H   ตัว" ที่วาดแล้ว ตัดแถวใสบน แบ่งชิ้น · H บอกความสูงตัวใหญ่ของบรรทัด ตัวที่ฝึกจึงได้ระยะบนตามจริง
pub struct Rendered { pub two: Bmp, pub pieces: Vec<Piece> }

impl Rendered {
    /// ตัวที่ฝึกออกมาเป็นชิ้นเดียว [H][เว้นวรรค][ตัว]
    pub fn target(&self) -> Option<&Piece> { (self.pieces.len() == 3).then(|| &self.pieces[2]).filter(|p| p.bmp.is_some()) }
}

fn ass_time(cs: u64) -> String { format!("{}:{:02}:{:02}.{:02}", cs / 360000, cs / 6000 % 60, cs / 100 % 60, cs % 100) }

/// วาดหลายข้อความด้วยฟอนต์เดียวในรอบเดียวของ ffmpeg แบบซับรูปทั่วไป ตัวขาว ขอบดำ 2 จุด พื้นใส · ข้อความที่มีปีกกาหรือแบ็กสแลชข้าม (แท็กของ ASS)
/// ตาม NOcrTrainer.RenderCharacterImage แล้ว MakeTwoColor(200) CropTop SplitBitmapToLettersNew(เว้นวรรค 10 ล่างขึ้นบน ความสูงขั้นต่ำ 25)
pub fn render(tools: &Path, work: &Path, texts: &[String], font: &str, size: f32, bold: bool, italic: bool) -> Result<Vec<Option<Rendered>>, String> {
    let mut out: Vec<Option<Rendered>> = Vec::with_capacity(texts.len());
    // ทีละไม่เกิน 64 ข้อความแบบ BATCH ของ pgs.rs · 100 ภาพต่อรอบ ffmpeg ฟ้องหน่วยความจำไม่พอ (นิพจน์ setpts ยาวเกิน เจอตอนเทส 16 พ.ย. 2569)
    for chunk in texts.chunks(64) {
        let longest = chunk.iter().map(|t| t.chars().count()).max().unwrap_or(1) + 4;
        let w = (((size * longest as f32 * 1.4) as u32 + 48).max(64) + 1) & !1;
        // สูงพอดีบรรทัดบวกขอบบนล่างข้างละ 12 แบบภาพของ Subtitle Edit (ขอบ 10 กับเส้นขอบ 2) · ภาพสูงกว่านี้ ที่ว่างใต้ตัวอักษรยาวเกินความสูงบรรทัดขั้นต่ำ 25
        // ตัวแบ่งบรรทัดจะนับเป็นบรรทัดว่างอีกบรรทัด ชิ้นที่ได้ไม่ใช่ [H][เว้นวรรค][ตัว] ฝึกไม่ได้สักตัว (เจอตอนเทส 16 พ.ย. 2569) · ขนาดฟอนต์ของ ASS คือความสูงบรรทัด
        let h = ((size.ceil() as u32 + 24).max(32) + 1) & !1;
        let mut ass = format!(
            "[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nScaledBorderAndShadow: yes\nYCbCr Matrix: None\nWrapStyle: 2\n\n[V4+ Styles]\n\
             Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n\
             Style: T,{font},{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,{},{},0,0,100,100,0,0,1,2,0,7,12,12,12,1\n\n[Events]\n\
             Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
            if bold { -1 } else { 0 }, if italic { -1 } else { 0 }
        );
        let mut times = vec![];
        let mut used = vec![];
        for (i, t) in chunk.iter().enumerate() {
            let ok = !t.contains(['{', '}', '\\', '\n']);
            used.push(ok);
            times.push(i as i64 * 1_000_000 + 500_000);
            if ok { ass.push_str(&format!("Dialogue: 0,{},{},T,,0,0,0,,H   {t}\n", ass_time(i as u64 * 100), ass_time(i as u64 * 100 + 100))); }
        }
        let file = work.join(format!("sub-nocrtrain-{}.ass", std::process::id()));
        std::fs::write(&file, ass).map_err(|e| format!("เขียนไฟล์ชั่วคราวไม่ได้ {e}"))?;
        let res = (|| {
            let (mut child, mut o) = crate::pgs::spawn_pair(tools, &file, None, w, h, w, h, &times)?;
            let mut pair = vec![0u8; (w * h * 6) as usize];
            let mut buf = vec![0u8; (w * h * 4) as usize];
            let mut part = vec![];
            for ok in &used {
                if let Err(e) = o.read_exact(&mut pair) {
                    let mut err = String::new();
                    if let Some(mut s) = child.stderr.take() { let _ = s.read_to_string(&mut err); }
                    let _ = child.wait();
                    let last = err.lines().rev().find(|l| !l.trim().is_empty()).unwrap_or("").to_string();
                    return Err(format!("ffmpeg วาดตัวอักษรไม่ครบ {e} {last}"));
                }
                if !ok { part.push(None); continue; }
                crate::pgs::pair_to_rgba(&pair, &mut buf);
                let img = image::RgbaImage::from_raw(w, h, buf.clone()).ok_or("ภาพผิดขนาด")?;
                part.push(Some(split_rendered(&img)));
            }
            let _ = child.wait();
            Ok::<_, String>(part)
        })();
        let _ = std::fs::remove_file(&file);
        out.extend(res?);
    }
    Ok(out)
}

/// ภาพที่วาดแล้วเป็นภาพสองสีกับชิ้น
pub fn split_rendered(img: &Bmp) -> Rendered {
    let two = crate::ocrprep::make_two_color(img, TWO_COLOR);
    let (two, _) = crate::nocr_text::crop_top(&two);
    let pieces = split_letters(&two, PIXELS_ARE_SPACE, false, false, MIN_LINE_HEIGHT, false, -1.0);
    Rendered { two, pieces }
}

/// ฟอนต์ที่ลงไว้ในเครื่อง (ของ Windows หรือลงเฉพาะผู้ใช้) ตามลำดับที่ส่งมา ไม่ซ้ำ · ไม่เจอสักตัวใช้ Arial · ตาม GetInstalledFonts
pub fn installed_fonts(names: &[String]) -> Vec<String> {
    let mut v: Vec<String> = vec![];
    for h in crate::fonts::find(Path::new(""), names) {
        if !h.from.is_empty() && !v.iter().any(|x| x.eq_ignore_ascii_case(&h.name)) { v.push(h.name); }
    }
    if v.is_empty() { v.push("Arial".into()); }
    v
}

// ---------------------------------------------------------------- ฝึกจากฟอนต์

/// ค่าที่ใช้ฝึก · ตาม NOcrTrainerSettings
#[derive(Clone)]
pub struct TrainOpts {
    pub fonts: Vec<String>,
    pub size: f32,
    pub bold: bool,
    pub italic: bool,
    /// จำนวนเส้นต่อตัว (60)
    pub lines: usize,
    /// ตัวอักษรที่ฝึก ไม่นับช่องว่าง
    pub chars: String,
    /// คู่หรือสามตัวที่มักวาดติดกัน คั่นด้วยเว้นวรรค ("fi ff rn")
    pub merged: String,
    pub algo: Algo,
    /// ค่าตั้งต้นของตัวสุ่ม ไม่ส่งได้เส้นต่างกันทุกรอบ
    pub seed: Option<u64>,
}

impl Default for TrainOpts {
    fn default() -> Self { TrainOpts { fonts: vec![], size: 30.0, bold: false, italic: false, lines: 60, chars: DEFAULT_CHARS.into(), merged: String::new(), algo: Algo::Random, seed: None } }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainProgress { pub learned: usize, pub skipped: usize, pub font: String, pub text: String }

fn styles(o: &TrainOpts) -> Vec<(bool, bool)> {
    let mut v = vec![(false, false)];
    if o.bold { v.push((true, false)); }
    if o.italic { v.push((false, true)); }
    v
}

/// ฝึกฐานจากฟอนต์ เพิ่มเฉพาะตัวที่ฐานยังอ่านไม่ออก · คืนจำนวนตัวที่เพิ่ม กดหยุดคืนเท่าที่ได้ · ตาม NOcrTrainer.Train
pub fn train(tools: &Path, work: &Path, o: &TrainOpts, db: &mut NOcrDb, abort: &dyn Fn() -> bool, progress: &dyn Fn(&TrainProgress)) -> Result<usize, String> {
    let mut rng = o.seed.map(Rng::new).unwrap_or_else(Rng::from_time);
    let mut singles: Vec<String> = vec![];
    for c in o.chars.chars() { let s = c.to_string(); if !c.is_whitespace() && !singles.contains(&s) { singles.push(s); } }
    let mut merged: Vec<String> = vec![];
    for s in o.merged.split(' ').map(str::trim) { let n = s.chars().count(); if n > 1 && n <= 3 && !merged.iter().any(|m| m == s) { merged.push(s.into()); } }
    let all: Vec<String> = singles.iter().chain(merged.iter()).cloned().collect();
    let (mut learned, mut skipped) = (0, 0);
    for font in &o.fonts {
        // วาดทุกตัวทุกแบบตัวก่อน · ชุดตัวเดียวเป็นตัวคล้ายที่ตัวใหม่ต้องไม่ตรง ชุดขนาด 1.5 กับ 2 เท่าใช้กับตัวเล็ก
        let mut per_style = vec![];
        for (bold, italic) in styles(o) {
            let base = render(tools, work, &all, font, o.size, bold, italic)?;
            let mut bigger = vec![];
            for s in SMALL_GLYPH_SCALES { bigger.push(render(tools, work, &all, font, o.size * s, bold, italic)?); }
            let look: Vec<(String, Bmp)> = singles.iter().zip(&base).filter_map(|(t, r)| r.as_ref()?.target().map(|p| (t.clone(), p.bmp.clone().unwrap()))).collect();
            per_style.push(((bold, italic), base, bigger, look));
        }
        for (k, text) in all.iter().enumerate() {
            if abort() { return Ok(learned); }
            let is_merged = text.chars().count() > 1;
            for ((_, italic), base, bigger, look) in &per_style {
                let big: Vec<Option<&Bmp>> = bigger.iter().map(|b| b[k].as_ref().and_then(|r| two_glyph_target(r))).collect();
                let ok = base[k].as_ref().is_some_and(|r| train_one(o, db, text, r, *italic, is_merged, &big, look, &mut rng));
                if ok { learned += 1 } else { skipped += 1 }
            }
            progress(&TrainProgress { learned, skipped, font: font.clone(), text: text.clone() });
        }
    }
    Ok(learned)
}

/// ตัวที่ฝึกในภาพที่วาดใหญ่ขึ้น เมื่อออกมาเป็นชิ้นเดียว (ภาพมีชิ้นภาพสองชิ้น) · ตาม RenderTarget
fn two_glyph_target(r: &Rendered) -> Option<&Bmp> {
    let g: Vec<&Piece> = r.pieces.iter().filter(|p| p.bmp.is_some()).collect();
    (g.len() == 2).then(|| g[1].bmp.as_ref().unwrap())
}

/// ฝึกหนึ่งตัวในแบบตัวหนึ่ง · คืนจริงเมื่อเพิ่มเข้าฐาน · ตาม TrainCharacter
#[allow(clippy::too_many_arguments)]
fn train_one(o: &TrainOpts, db: &mut NOcrDb, text: &str, r: &Rendered, italic: bool, is_merged: bool, bigger: &[Option<&Bmp>], look: &[(String, Bmp)], rng: &mut Rng) -> bool {
    if let Some(item) = r.target() {
        let b = item.bmp.as_ref().unwrap();
        let (m, _) = db.match_single(b, item.top, false, MAX_WRONG, false, false, Placement::Unknown);
        if m.is_some_and(|m| m.text == text || same_shape_sans(&m.text, text)) { return false; }
        // แท่งตรงเป็น l ของฟอนต์ไม่มีเชิงส่วนใหญ่ด้วย ตัว I จะเสมอกันแล้วแพ้ชนะตามลำดับ ปล่อยให้ตัวแก้คำตัดสิน I กับ l
        if matches!(text, "I" | "|") && solid_bar(b) { return false; }
        let mut c = NChar { text: text.into(), width: b.width() as i32, height: b.height() as i32, margin_top: item.top, italic, ..Default::default() };
        generate(o.lines + if is_merged { 20 } else { 0 }, false, &mut c, b, o.algo, rng);
        if (b.width() * b.height()) as i32 <= SMALL_GLYPH_AREA - 1 { keep_lines_fitting_larger(&mut c, bigger); }
        for (ot, ob) in look {
            if !ot.to_lowercase().eq(&text.to_lowercase()) { add_discriminative_lines(&mut c, b, ob, rng); }
        }
        db.add(c);
        return true;
    }
    // ตัวที่มีหลายชิ้นโดยออกแบบ (" % ? สระกับพยัญชนะ) ฝึกเป็นตัวขยายจับ · คู่ตัวติดกันฝึกเฉพาะตอนวาดออกมาเป็นชิ้นเดียว
    let n = r.pieces.len();
    if !is_merged && (n == 4 || n == 5) && can_be_multi_part(text) {
        let Some(g) = Group::create(&r.two, &r.pieces, 2, n - 2) else { return false };
        if db.match_expanded(&r.two, &r.pieces, 2).is_some_and(|e| e.text == text) { return false; }
        let mut c = g.nchar(&r.pieces);
        c.text = text.into();
        c.italic = italic;
        generate(o.lines + if n == 5 { 10 } else { 5 }, false, &mut c, &g.preview, o.algo, rng);
        db.add(c);
        return true;
    }
    false
}

/// I l | เป็นแท่งเดียวกันในฟอนต์ไม่มีเชิง · ตาม IsSameShapeInSansSerif
fn same_shape_sans(a: &str, b: &str) -> bool { matches!(a, "I" | "l" | "|") && matches!(b, "I" | "l" | "|") }

/// แท่งตั้ง สูงอย่างน้อยสามเท่าของความกว้าง หมึกเกือบเต็ม · ตาม IsSolidBar
fn solid_bar(b: &Bmp) -> bool {
    if b.height() < b.width() * 3 { return false; }
    let ink = b.pixels().filter(|p| p[3] > 150).count() as u32;
    ink * 10 >= b.width() * b.height() * 9
}

/// จุด จุลภาค เครื่องหมายคำพูด เส้นส่วนใหญ่วิ่งตามขอบเบลอ ใช้ได้ที่ขนาดที่ฝึกแต่พลาดที่ขนาดอื่น · เก็บเฉพาะเส้นที่ใช้ได้กับภาพใหญ่ 1.5 และ 2 เท่าด้วย
/// เหลือน้อยไปคืนเส้นเดิม · ตาม KeepLinesThatFitLargerSizes
fn keep_lines_fitting_larger(c: &mut NChar, bigger: &[Option<&Bmp>]) {
    let mut fg = c.fg.clone();
    let mut bg = c.bg.clone();
    for b in bigger {
        let Some(b) = b else { return };
        fg.retain(|l| fg_ok(l, false, b, c));
        bg.retain(|l| bg_ok(l, false, b, c));
    }
    if fg.len() + bg.len() >= 4.max((c.fg.len() + c.bg.len()) / 4) { c.fg = fg; c.bg = bg; }
}

/// เส้นสุ่มเก็บเฉพาะเส้นที่หมึกหนาสามจุดขึ้นไป ขีดบาง (ทับของ ø สระบน คานของ e ฟอนต์บาง) จึงไม่มีเส้น ตัวใหม่ตรงกับตัวคล้ายแบบไม่ผิดเลย
/// เพิ่มเส้นที่เริ่มตรงจุดที่สองภาพต่างกันจนตัวคล้ายผิดชัด · ตาม AddDiscriminativeLines
pub fn add_discriminative_lines(c: &mut NChar, own: &Bmp, other: &Bmp, rng: &mut Rng) {
    let (oa, ta) = (own.height() as f64 / own.width() as f64, other.height() as f64 / other.width() as f64);
    if oa.max(ta) / oa.min(ta) > 1.6 { return; }
    let (mut errors, points) = count_errors(c, other);
    let wanted = 8.max(points * 6 / 100);
    if points == 0 || errors >= 4.max(points * 3 / 100) { return; }
    let (ow, oh) = (other.width() as i32, other.height() as i32);
    let ink = |b: &Bmp, x: i32, y: i32| b.get_pixel(x as u32, y as u32)[3] > 150;
    let (mut here, mut there) = (vec![], vec![]);
    for y in 0..own.height() as i32 {
        for x in 0..own.width() as i32 {
            let p = NLine::new(x, y, x, y).scaled_start(c, ow, oh);
            if p.x < 0 || p.y < 0 || p.x >= ow || p.y >= oh { continue; }
            match (ink(own, x, y), ink(other, p.x, p.y)) { (true, false) => here.push(Pt { x, y }), (false, true) => there.push(Pt { x, y }), _ => {} }
        }
    }
    if here.is_empty() && there.is_empty() { return; }
    let mut attempt = 0;
    while attempt < 3000 && errors < wanted {
        let fg = there.is_empty() || (!here.is_empty() && attempt % 2 == 0);
        attempt += 1;
        let starts = if fg { &here } else { &there };
        let s = starts[rng.next(starts.len() as i32) as usize];
        let e = Pt { x: (s.x + rng.next(17) - 8).clamp(0, c.width - 1), y: (s.y + rng.next(17) - 8).clamp(0, c.height - 1) };
        if (s.x - e.x).abs() < 2 && (s.y - e.y).abs() < 2 { continue; }
        let line = NLine { start: s, end: e };
        if !(if fg { fg_ok(&line, false, own, c) } else { bg_ok(&line, false, own, c) }) { continue; }
        let le = line.scaled_points(c, ow, oh).iter().filter(|p| p.x >= 0 && p.y >= 0 && p.x < ow && p.y < oh && ink(other, p.x, p.y) != fg).count() as i32;
        if le >= 2 { if fg { c.fg.push(line) } else { c.bg.push(line) } errors += le; }
    }
}

/// จุดผิดกับจุดที่ตรวจทั้งหมดของตัวในฐานเทียบภาพ · ตาม CountErrors
fn count_errors(c: &NChar, b: &Bmp) -> (i32, i32) {
    let (w, h) = (b.width() as i32, b.height() as i32);
    let (mut e, mut n) = (0, 0);
    for (lines, fg) in [(&c.fg, true), (&c.bg, false)] {
        for l in lines {
            for p in l.scaled_points(c, w, h) {
                if p.x >= 0 && p.y >= 0 && p.x < w && p.y < h { n += 1; if (b.get_pixel(p.x as u32, p.y as u32)[3] > 150) != fg { e += 1; } }
            }
        }
    }
    (e, n)
}

/// ตัวที่ออกแบบให้มีหลายชิ้น ฝึกเป็นตัวขยายจับได้ · ตัวอักษรธรรมดาที่แตกเพราะฟอนต์บาง ห้าม ไม่งั้นไปจับคู่ตัวธรรมดาสองตัว ("t." อ่านเป็น f) · ตาม CanBeMultiPart
pub fn can_be_multi_part(text: &str) -> bool {
    let mut it = text.chars();
    let (Some(c), None) = (it.next(), it.next()) else { return false };
    if c.is_alphanumeric() { return crate::nocr::unicode_normalization_lite::decomposed_len(text) > 1 || matches!(c, 'Ø' | 'ø' | 'ы' | 'Ы'); }
    matches!(c, '"' | '%' | ';' | ':' | '?' | '!' | '=' | '÷' | '¡' | '¿' | '‰' | '«' | '»' | '‹' | '›' | '“' | '”' | '„' | '‟' | '″' | '‴' | '…' | '‼' | '⁇' | '⁈' | '⁉')
}

// ---------------------------------------------------------------- ย่อฐาน

/// ค่าของตัวย่อฐาน · ตาม NOcrDbOptimizerSettings
#[derive(Clone)]
pub struct OptimizeOpts {
    pub fonts: Vec<String>,
    pub sizes: Vec<f32>,
    /// เก็บอย่างน้อยเท่านี้เส้น ชั้นกว้างกับชั้นค้นลึกของตัวจับคู่ข้ามตัวที่มีเส้นไม่ถึง 41 และ 51
    pub min_lines: usize,
    /// จุดผิดที่หลวมที่สุดที่ตัวคล้ายต้องผิดเกิน (ทางสุดท้ายใช้สองเท่าของ 25)
    pub max_wrong: i32,
}

pub const DEFAULT_OPT_FONTS: [&str; 8] = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Arial Narrow", "Helvetica Neue", "Times New Roman"];

impl Default for OptimizeOpts {
    fn default() -> Self { OptimizeOpts { fonts: DEFAULT_OPT_FONTS.iter().map(|s| s.to_string()).collect(), sizes: vec![24.0, 30.0, 40.0], min_lines: 52, max_wrong: 50 } }
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeResult { pub entries: usize, pub lines_before: usize, pub lines_after: usize, pub glyphs: usize, pub fonts: Vec<String> }

/// ภาพตัวอักษรหนึ่งตัวที่ใช้ตรวจ หมึกเป็นค่าจริงเท็จทีละจุด
pub struct Glyph { pub text: String, pub ink: Vec<bool>, pub w: i32, pub h: i32 }

/// ชื่อไฟล์สำรองที่ยังไม่มี (Latin.nocr.bak แล้ว Latin.nocr.2.bak) ย่อซ้ำจะไม่ทับสำรองของฐานก่อนย่อ · ตาม GetFreeBackupFileName
pub fn free_backup_name(file: &Path) -> std::path::PathBuf {
    let base = file.to_string_lossy().to_string();
    let mut p = std::path::PathBuf::from(format!("{base}.bak"));
    let mut i = 2;
    while p.exists() { p = format!("{base}.{i}.bak").into(); i += 1; }
    p
}

/// วาดตัวตรวจทุกตัว (ชุดตั้งต้นกับข้อความตัวเดียวทุกตัวในฐาน) ทุกฟอนต์ ทุกขนาด สามแบบตัว · ตาม RenderGlyphs
pub fn validation_glyphs(tools: &Path, work: &Path, db: &NOcrDb, o: &OptimizeOpts) -> Result<(Vec<Glyph>, Vec<String>), String> {
    let fonts = installed_fonts(&o.fonts);
    let mut texts: Vec<String> = vec![];
    for t in DEFAULT_CHARS.chars().map(|c| c.to_string()).chain(db.chars.iter().map(|c| c.text.clone())) {
        let mut cs = t.chars();
        if let (Some(c), None) = (cs.next(), cs.next()) { if !c.is_whitespace() && !texts.contains(&t) { texts.push(t); } }
    }
    let mut out = vec![];
    for f in &fonts {
        for &s in &o.sizes {
            for (bold, italic) in [(false, false), (true, false), (false, true)] {
                for (t, r) in texts.iter().zip(render(tools, work, &texts, f, s, bold, italic)?) {
                    let Some(p) = r.as_ref().and_then(|r| r.target()) else { continue };
                    let b = p.bmp.as_ref().unwrap();
                    out.push(Glyph { text: t.clone(), ink: b.pixels().map(|px| px[3] > 150).collect(), w: b.width() as i32, h: b.height() as i32 });
                }
            }
        }
    }
    Ok((out, fonts))
}

/// ตัดเส้นของทุกตัว (ไม่รวมตัวขยายจับ) ที่ไม่ได้ช่วยแยกตัวนั้นจากตัวคล้าย · แบ่งงานหลายเธรด กดหยุดคืน None ฐานไม่เปลี่ยน
/// เส้นที่สุ่มฝึกส่วนใหญ่ใช้ได้กับตัวคล้ายด้วย (i กับ l ก้านเดียวกัน) จึงไม่ใช่หลักฐาน และทำให้สัดส่วนจุดผิดที่ตัวจับคู่ใช้จัดอันดับจางลง
/// ลองกับภาพจริงของ Subtitle Edit เส้นน้อยลง 43% และอ่านผิดน้อยลง · ตาม NOcrDbOptimizer.Optimize
pub fn optimize(db: &mut NOcrDb, glyphs: &[Glyph], fonts: Vec<String>, o: &OptimizeOpts, abort: &(dyn Fn() -> bool + Sync), progress: &(dyn Fn(usize, usize) + Sync)) -> Option<OptimizeResult> {
    let n = db.chars.len();
    let done = std::sync::atomic::AtomicUsize::new(0);
    let stop = std::sync::atomic::AtomicBool::new(false);
    let threads = std::thread::available_parallelism().map(|x| x.get()).unwrap_or(2).clamp(1, 6);
    let chars = &db.chars;
    let mut new_lines: Vec<Option<(Vec<NLine>, Vec<NLine>)>> = vec![None; n];
    std::thread::scope(|s| {
        let chunks: Vec<_> = new_lines.chunks_mut(n.div_ceil(threads).max(1)).enumerate().collect();
        for (ci, chunk) in chunks {
            let (done, stop) = (&done, &stop);
            let size = n.div_ceil(threads).max(1);
            s.spawn(move || {
                for (k, slot) in chunk.iter_mut().enumerate() {
                    if stop.load(std::sync::atomic::Ordering::Relaxed) { return; }
                    if abort() { stop.store(true, std::sync::atomic::Ordering::Relaxed); return; }
                    *slot = prune(&chars[ci * size + k], glyphs, o);
                    progress(done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1, n);
                }
            });
        }
    });
    if stop.load(std::sync::atomic::Ordering::Relaxed) { return None; }
    let (mut before, mut after) = (0, 0);
    for (c, l) in db.chars.iter_mut().zip(new_lines) {
        before += c.fg.len() + c.bg.len();
        if let Some((fg, bg)) = l { c.fg = fg; c.bg = bg; }
        after += c.fg.len() + c.bg.len();
    }
    db.clear_cache();
    Some(OptimizeResult { entries: n, lines_before: before, lines_after: after, glyphs: glyphs.len(), fonts })
}

/// เลือกเส้นที่น้อยที่สุดที่ตัวคล้ายทุกตัวยังผิดอย่างน้อย min(จุดผิดเดิม งบ + 1) และสัดส่วนจุดผิดไม่ต่ำกว่าเดิม ส่วนภาพของตัวเองสัดส่วนผิดไม่สูงกว่าเดิม · ตาม Prune
fn prune(oc: &NChar, glyphs: &[Glyph], o: &OptimizeOpts) -> Option<(Vec<NLine>, Vec<NLine>)> {
    let lines: Vec<(NLine, bool)> = oc.fg.iter().map(|l| (*l, true)).chain(oc.bg.iter().map(|l| (*l, false))).collect();
    let lc = lines.len();
    if lc <= o.min_lines || oc.width <= 0 || oc.height <= 0 { return None; }
    let pos: Vec<&Glyph> = glyphs.iter().filter(|g| g.text == oc.text).collect();
    let neg: Vec<&Glyph> = glyphs.iter().filter(|g| g.text != oc.text && !same_shape(&oc.text, &g.text) && near(oc, g)).collect();
    let count = |l: &NLine, fg: bool, g: &Glyph| -> (i32, i32) {
        let (mut e, mut p) = (0, 0);
        for pt in l.scaled_points(oc, g.w, g.h) {
            if pt.x >= 0 && pt.y >= 0 && pt.x < g.w && pt.y < g.h { p += 1; if g.ink[(pt.y * g.w + pt.x) as usize] != fg { e += 1; } }
        }
        (e, p)
    };
    let (nn, np) = (neg.len(), pos.len());
    let mut ne = vec![0i32; lc * nn];
    let mut npt = vec![0i32; lc * nn];
    let mut pe = vec![0i32; lc * np];
    let mut ppt = vec![0i32; lc * np];
    for (i, (l, fg)) in lines.iter().enumerate() {
        for (j, g) in neg.iter().enumerate() { let (e, p) = count(l, *fg, g); ne[i * nn + j] = e; npt[i * nn + j] = p; }
        for (j, g) in pos.iter().enumerate() { let (e, p) = count(l, *fg, g); pe[i * np + j] = e; ppt[i * np + j] = p; }
    }
    let mut n_tot_e = vec![0i32; nn];
    let mut n_tot_p = vec![0i32; nn];
    let mut need = vec![0i32; nn];
    for j in 0..nn {
        for i in 0..lc { n_tot_e[j] += ne[i * nn + j]; n_tot_p[j] += npt[i * nn + j]; }
        // งบเดียวกับตัวจับคู่ ภาพใหญ่ได้งบมากขึ้น แต่ไม่เกินพื้นที่ภาพหารแปด
        let g = neg[j];
        let scale = g.h as f64 / oc.height as f64;
        let budget = ((o.max_wrong as f64 * scale.max(1.0)).round_ties_even() as i32).min(8.max(g.w * g.h / 8));
        need[j] = n_tot_e[j].min(budget + 1);
    }
    let mut p_tot_e = vec![0i32; np];
    let mut p_tot_p = vec![0i32; np];
    let mut pe_line = vec![0i32; lc];
    let mut ne_line = vec![0i32; lc];
    for i in 0..lc {
        for j in 0..np { p_tot_e[j] += pe[i * np + j]; p_tot_p[j] += ppt[i * np + j]; pe_line[i] += pe[i * np + j]; }
        for j in 0..nn { ne_line[i] += ne[i * nn + j]; }
    }
    let mut sel = vec![false; lc];
    let mut sel_n = 0;
    // ครอบหลายชั้นแบบโลภ เลือกเส้นที่เพิ่มจุดผิดที่ยังขาดให้ตัวคล้ายมากที่สุด เส้นที่ภาพของตัวเองเห็นด้วยได้เปรียบ
    let mut remain = need.clone();
    loop {
        let (mut best, mut best_score) = (usize::MAX, 0.0);
        for i in 0..lc {
            if sel[i] { continue; }
            let gain: i32 = (0..nn).filter(|&j| remain[j] > 0).map(|j| ne[i * nn + j].min(remain[j])).sum();
            let score = gain as f64 - 0.1 * pe_line[i] as f64;
            if gain > 0 && (best == usize::MAX || score > best_score) { best = i; best_score = score; }
        }
        if best == usize::MAX { break; }
        sel[best] = true;
        sel_n += 1;
        for j in 0..nn { remain[j] = (remain[j] - ne[best * nn + j]).max(0); }
    }
    // เติมจนถึงขั้นต่ำด้วยเส้นที่บอกความต่างมากที่สุด (เรียงคงลำดับเดิมเมื่อเท่ากัน แบบ OrderByDescending)
    let mut order: Vec<usize> = (0..lc).collect();
    order.sort_by_key(|&i| std::cmp::Reverse(ne_line[i] - 10 * pe_line[i]));
    for i in order {
        if sel_n >= o.min_lines { break; }
        if !sel[i] { sel[i] = true; sel_n += 1; }
    }
    // สัดส่วน ตัวคล้ายที่อยู่ในงบแข่งกันด้วยสัดส่วนจุดผิด จึงต้องไม่ดูดีกว่าเดิม ภาพของตัวเองต้องไม่ดูแย่กว่าเดิม
    for _ in 0..lc {
        let add = add_for_negative(&sel, &ne, &npt, nn, &n_tot_e, &n_tot_p, &need).or_else(|| add_for_positive(&sel, &pe, &ppt, np, &p_tot_e, &p_tot_p));
        match add { Some(i) => sel[i] = true, None => break }
    }
    let (mut fg, mut bg) = (vec![], vec![]);
    for (i, (l, f)) in lines.iter().enumerate() { if sel[i] { if *f { fg.push(*l) } else { bg.push(*l) } } }
    Some((fg, bg))
}

fn add_for_negative(sel: &[bool], e: &[i32], p: &[i32], nn: usize, tot_e: &[i32], tot_p: &[i32], need: &[i32]) -> Option<usize> {
    for j in 0..nn {
        if tot_e[j] == 0 || tot_e[j] > need[j] { continue; }
        let (mut se, mut sp) = (0i64, 0i64);
        for (i, s) in sel.iter().enumerate() { if *s { se += e[i * nn + j] as i64; sp += p[i * nn + j] as i64; } }
        if sp > 0 && se * tot_p[j] as i64 >= tot_e[j] as i64 * sp { continue; }
        let (mut best, mut share) = (None, -1.0);
        for (i, s) in sel.iter().enumerate() {
            let pp = p[i * nn + j];
            if !s && pp > 0 && e[i * nn + j] as f64 / pp as f64 > share { best = Some(i); share = e[i * nn + j] as f64 / pp as f64; }
        }
        if best.is_some() { return best; }
    }
    None
}

fn add_for_positive(sel: &[bool], e: &[i32], p: &[i32], np: usize, tot_e: &[i32], tot_p: &[i32]) -> Option<usize> {
    for j in 0..np {
        let (mut se, mut sp) = (0i64, 0i64);
        for (i, s) in sel.iter().enumerate() { if *s { se += e[i * np + j] as i64; sp += p[i * np + j] as i64; } }
        let old = if tot_p[j] == 0 { 0.0 } else { tot_e[j] as f64 / tot_p[j] as f64 };
        if sp > 0 && se as f64 / sp as f64 <= old + 0.005 { continue; }
        let (mut best, mut bp) = (None, 0);
        for (i, s) in sel.iter().enumerate() { if !s && e[i * np + j] == 0 && p[i * np + j] > bp { best = Some(i); bp = p[i * np + j]; } }
        if best.is_some() { return best; }
    }
    None
}

/// คู่ตัวพิมพ์ (o O) หน้าตาเดียวกัน และ I l | เป็นแท่งเดียวกันในฟอนต์ไม่มีเชิง · ตาม AreSameShape
fn same_shape(a: &str, b: &str) -> bool { a.to_lowercase() == b.to_lowercase() || same_shape_sans(a, b) }

/// ด่านขนาดกับสัดส่วนที่หลวมที่สุดของตัวจับคู่ ขยายกว้างขึ้นอีก · ตาม IsNear
fn near(oc: &NChar, g: &Glyph) -> bool {
    let (area, oa) = (g.w * g.h, oc.width * oc.height);
    let small = area.min(oa);
    if small < 150 && area.max(oa) > small * 5 { return false; }
    let asp = g.h as f64 * 100.0 / g.w as f64;
    let oasp = oc.h2w();
    if area < 150 { return asp.max(oasp) / asp.min(oasp) <= 2.0; }
    (asp - oasp).abs() * 100.0 / asp.min(oasp) < 100.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn multi_part_rules() {
        assert!(can_be_multi_part("é") && can_be_multi_part("%") && can_be_multi_part("ø") && can_be_multi_part("\""));
        assert!(!can_be_multi_part("f") && !can_be_multi_part("m") && !can_be_multi_part("ab"));
    }

    /// o กับ c ภาพเดียวกันเกือบหมด ต่างแค่ช่องเปิดด้านขวา · ตัว o ที่มีเส้นน้อยต้องได้เส้นแยกจนภาพ c ผิดอย่างน้อย 8 จุด
    #[test]
    fn discriminative_lines_split_lookalike() {
        let ring = |open: bool| {
            let mut b = RgbaImage::new(20, 20);
            for y in 0..20 { for x in 0..20 {
                let d = (((x as f64 - 9.5).powi(2) + (y as f64 - 9.5).powi(2)) as f64).sqrt();
                if (6.0..9.5).contains(&d) && !(open && x > 13 && (7..13).contains(&y)) { b.put_pixel(x, y, Rgba([255, 255, 255, 255])); }
            } }
            b
        };
        let (o, c) = (ring(false), ring(true));
        let mut ch = NChar { text: "o".into(), width: 20, height: 20, ..Default::default() };
        ch.fg.push(NLine::new(2, 9, 2, 11));
        let mut rng = Rng::new(3);
        add_discriminative_lines(&mut ch, &o, &c, &mut rng);
        let (e, _) = count_errors(&ch, &c);
        assert!(e >= 8, "จุดผิด {e}");
        assert_eq!(count_errors(&ch, &o).0, 0);
    }

    /// ฝึกจากฟอนต์ Arial จริงผ่าน libass แล้วฐานที่ฝึกต้องอ่านตัวที่ฝึกได้ · ต้องมี ffmpeg ที่แนบมา
    #[test]
    fn train_from_arial_and_read_back() {
        let tools = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tools");
        if !tools.join("ffmpeg.exe").exists() { return; }
        let work = std::env::temp_dir().join("movie-shelf-nocr-train");
        std::fs::create_dir_all(&work).unwrap();
        let mut db = NOcrDb::empty(&work.join("t.nocr"));
        let o = TrainOpts { fonts: vec!["Arial".into()], size: 40.0, chars: "abcdeHxo%".into(), seed: Some(7), ..Default::default() };
        // ภาพที่วาดต้องแบ่งได้ [H][เว้นวรรค][ตัว] พอดี · ภาพสูงเกินเคยได้บรรทัดว่างปลอมนำหน้า ฝึกไม่ได้สักตัว
        let probe = render(&tools, &work, &["a".into()], "Arial", 40.0, false, false).unwrap();
        assert!(probe[0].as_ref().unwrap().target().is_some(), "ภาพที่วาดแบ่งเป็น [H][เว้นวรรค][ตัว] ไม่ได้");
        // วาดทีละ 64 ข้อความ ชุดใหญ่กว่า 64 ต้องได้ครบทุกภาพ (ทีละ 100 ffmpeg ฟ้องหน่วยความจำไม่พอ)
        let many: Vec<String> = DEFAULT_CHARS.chars().map(|c| c.to_string()).collect();
        assert_eq!(render(&tools, &work, &many, "Arial", 30.0, false, false).unwrap().len(), many.len());
        let n = train(&tools, &work, &o, &mut db, &|| false, &|_| {}).unwrap();
        eprintln!("ฝึกได้ {n} ตัว");
        assert!(n >= 8, "ฝึกได้ {n} ตัว");
        let r = render(&tools, &work, &["abcde".into()], "Arial", 40.0, false, false).unwrap();
        let rd = r[0].as_ref().unwrap();
        let text: String = (0..rd.pieces.len()).filter(|&i| rd.pieces[i].bmp.is_some())
            .map(|i| db.get_match(&rd.two, &rd.pieces, i, rd.pieces[i].top, true, 25, false, 0.0).map(|c| c.text).unwrap_or("*".into())).collect();
        assert_eq!(text, "Habcde");
        // ย่อฐาน ตัวที่เส้นเกินขั้นต่ำต้องเหลือเส้นไม่มากกว่าเดิม และยังอ่านได้เหมือนเดิม
        let (glyphs, fonts) = validation_glyphs(&tools, &work, &db, &OptimizeOpts { fonts: vec!["Arial".into()], sizes: vec![40.0], min_lines: 20, ..Default::default() }).unwrap();
        let res = optimize(&mut db, &glyphs, fonts, &OptimizeOpts { min_lines: 20, ..Default::default() }, &|| false, &|_, _| {}).unwrap();
        eprintln!("ย่อฐาน {} ตัว เส้น {} เหลือ {} ตัวตรวจ {} ภาพ", res.entries, res.lines_before, res.lines_after, res.glyphs);
        assert!(res.lines_after <= res.lines_before);
        let text2: String = (0..rd.pieces.len()).filter(|&i| rd.pieces[i].bmp.is_some())
            .map(|i| db.get_match(&rd.two, &rd.pieces, i, rd.pieces[i].top, true, 25, false, 0.0).map(|c| c.text).unwrap_or("*".into())).collect();
        assert_eq!(text2, "Habcde");
        let _ = std::fs::remove_dir_all(&work);
    }
}
