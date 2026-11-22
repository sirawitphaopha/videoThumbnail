//! งานรวมไฟล์ คำขอรวมกับตัวสร้างคำสั่ง mkvmerge และ ffmpeg (MKV MP4 ปก ภาษา)
//! แยกจาก merge/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- คำสั่งรวม

/// ปกตั้ง ปกนอน · keep ใช้ของเดิมในหนัง (ถ้ามี) · remove เอาออก · new ใช้รูปที่ครอปไว้ในช่องนั้น
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CoverPlan {
    pub portrait: String,
    pub land: String,
}

impl Default for CoverPlan {
    fn default() -> Self {
        CoverPlan { portrait: "keep".into(), land: "keep".into() }
    }
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MergeReq {
    pub movie: String,
    /// ทุกแทร็กตามลำดับในไฟล์ใหม่ · keep false = เอาออก
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub covers: CoverPlan,
    /// mkv | mp4
    pub output: String,
    /// keep | trash
    pub original: String,
    #[serde(default)]
    pub check_source: bool,
    #[serde(default = "yes")]
    pub check_output: bool,
    /// ไฟล์ฟอนต์ของซับ ASS ที่จะฝังเป็นไฟล์แนบ (fonts.rs · ผู้ใช้ติ๊กเลือกในการ์ดฟอนต์) · MP4 ใส่ไม่ได้
    #[serde(default)]
    pub fonts: Vec<String>,
    /// บทที่แก้ในหน้าต่างดูและแก้บท (BUGS ข้อ 99) · ไม่ส่ง = บทของหนังติดไปตามเดิม · รายการว่าง = ไฟล์ใหม่ไม่มีบท
    #[serde(default)]
    pub chapters: Option<Vec<crate::media::chapters::Chapter>>,
}

fn yes() -> bool {
    true
}

/// ขนาดคร่าว ๆ ของเสียงที่แปลง · แบบเสียคุณภาพจากบิตเรตที่ตั้ง (ไม่มีบิตเรต เช่น MP3 VBR AAC TVBR คิด 320 kbps)
/// แบบไม่เสียคุณภาพคิด 60% ของเสียงดิบ 24 บิต · ไม่รู้ความยาว คิดไม่ได้ ไม่บวก
pub fn conv_estimate(t: &Track) -> Option<u64> {
    let spec = t.convert.as_ref()?;
    let secs = t.duration?;
    let ch = spec.channels.map(|c| c as u64).or(t.channels).unwrap_or(2) as f64;
    let rate = spec.rate.map(|r| r as u64).or(t.rate).unwrap_or(48000) as f64;
    let secs = match spec.speed { Some([a, b]) if a > 0.0 && b > 0.0 => secs * a / b, _ => secs };
    let bytes = match spec.codec.as_str() {
        "flac" | "alac" | "wv" => secs * rate * ch * 3.0 * 0.6,
        _ => {
            let kbps = spec.p.get("bitrate").and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse().ok()))).unwrap_or(320.0);
            secs * kbps * 1000.0 / 8.0
        }
    };
    Some(bytes as u64)
}

/// ไฟล์รูปปกใหม่ที่เขียนลงโฟลเดอร์ชั่วคราวแล้ว
#[derive(Clone, Debug)]
pub struct NewCover {
    pub name: String,
    pub mime: String,
    pub file: PathBuf,
    pub sha: String,
}

/// ไฟล์ต้นทางของคำสั่งรวม ตามลำดับที่ส่งให้ mkvmerge · หนังมาก่อนเสมอ
pub(crate) fn inputs_of(movie: &str, tracks: &[Track]) -> Vec<String> {
    let mut v = vec![movie.to_string()];
    for t in tracks.iter().filter(|t| t.keep) {
        if !v.iter().any(|s| s == &t.src) {
            v.push(t.src.clone());
        }
    }
    v
}

fn flag(b: bool) -> &'static str {
    if b { "1" } else { "0" }
}

/// ภาษาที่ส่งให้ mkvmerge · ใช้ภาษาแบบละเอียดของไฟล์ (zh-Hant es-419) ถ้าหน้าจอไม่ได้เปลี่ยนภาษา ไม่งั้นรหัสสามตัว
/// เดิมส่งรหัสสามตัวทุกแทร็ก ภาษาแบบละเอียดของทุกแทร็กหายตอนรวมไฟล์ (ผู้ช่วยตรวจทาน R6 · BUGS ข้อ 114)
pub fn mkv_lang(t: &Track) -> &str {
    if !t.lang_ietf.is_empty() && t.lang_ietf != "und" && t.lang == t.lang_was { &t.lang_ietf } else if t.lang.is_empty() { "und" } else { &t.lang }
}

/// คำสั่ง mkvmerge ทั้งชุด · movie_atts = เลขไฟล์แนบของหนังที่เก็บไว้ · other_atts = ไฟล์แนบของไฟล์ที่เพิ่มที่เก็บไว้ (ฟอนต์ของซับ ASS)
/// covers = รูปปกใหม่ · fonts = ไฟล์ฟอนต์ของซับ ASS ที่หาเจอในเครื่อง (fonts.rs) แนบเป็นไฟล์ใหม่
/// chap · None = บทของหนังติดไปตามเดิม · Some(None) = ไฟล์ใหม่ไม่มีบท · Some(Some(ไฟล์)) = ใช้บทจากไฟล์บทที่แก้แทน (BUGS ข้อ 99)
pub fn mkv_args(movie: &str, tracks: &[Track], movie_atts: &[u64], other_atts: &HashMap<String, Vec<u64>>, covers: &[NewCover], fonts: &[NewCover], chap: Option<Option<&Path>>, out: &Path) -> Vec<OsString> {
    let mut a: Vec<OsString> = ["--gui-mode", "--ui-language", "en", "-o"].iter().map(OsString::from).collect();
    a.push(out.as_os_str().to_owned());
    let inputs = inputs_of(movie, tracks);
    for (fi, src) in inputs.iter().enumerate() {
        let mine: Vec<&Track> = tracks.iter().filter(|t| t.keep && &t.src == src).collect();
        for (kind, sel, none) in [("video", "-d", "-D"), ("audio", "-a", "-A"), ("subtitle", "-s", "-S")] {
            let ids: Vec<String> = mine.iter().filter(|t| t.kind == kind).map(|t| t.tid.to_string()).collect();
            if ids.is_empty() {
                a.push(none.into());
            } else {
                a.push(sel.into());
                a.push(ids.join(",").into());
            }
        }
        let atts: &[u64] = if fi == 0 { movie_atts } else { other_atts.get(src).map(|v| v.as_slice()).unwrap_or(&[]) };
        if atts.is_empty() {
            a.push("--no-attachments".into());
        } else {
            a.push("--attachments".into());
            a.push(atts.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",").into());
        }
        if fi > 0 {
            // บทกับป้ายข้อมูลรวมของไฟล์ที่เพิ่มไม่เอามาปนกับของหนัง
            a.extend(["--no-chapters", "--no-global-tags"].iter().map(OsString::from));
        } else if chap.is_some() {
            // แก้บทแล้ว ไม่เอาบทเดิมของหนัง ใช้บทจากไฟล์บทแทน หรือไม่มีบทเลย
            a.push("--no-chapters".into());
        }
        for t in &mine {
            a.push("--language".into());
            a.push(format!("{}:{}", t.tid, mkv_lang(t)).into());
            a.push("--track-name".into());
            a.push(format!("{}:{}", t.tid, t.name).into());
            a.push("--default-track-flag".into());
            a.push(format!("{}:{}", t.tid, flag(t.default)).into());
            a.push("--forced-display-flag".into());
            a.push(format!("{}:{}", t.tid, flag(t.forced)).into());
            // ป้ายพิเศษ ส่งเฉพาะที่เปิด · แทร็กในหนัง mkvmerge คัดลอกป้ายเดิมให้อยู่แล้ว ส่งซ้ำให้แน่ใจ
            // แทร็กซับที่แก้แล้วใส่กลับมาจากไฟล์ชั่วคราว ไม่มีป้ายเดิม ต้องส่งเอง (BUGS ข้อ 114)
            for (on, opt) in [(t.hearing_impaired, "--hearing-impaired-flag"), (t.visual_impaired, "--visual-impaired-flag"), (t.text_descriptions, "--text-descriptions-flag"), (t.original, "--original-flag"), (t.commentary, "--commentary-flag")] {
                if on {
                    a.push(opt.into());
                    a.push(format!("{}:1", t.tid).into());
                }
            }
            if t.delay != 0 {
                a.push("--sync".into());
                a.push(format!("{}:{}", t.tid, t.delay).into());
            }
            if let Some(cs) = &t.charset {
                a.push("--sub-charset".into());
                a.push(format!("{}:{cs}", t.tid).into());
            }
        }
        a.push(src.into());
    }
    for c in covers.iter().chain(fonts) {
        a.extend(["--attachment-name".into(), c.name.clone().into(), "--attachment-mime-type".into(), c.mime.clone().into(), "--attach-file".into(), c.file.as_os_str().to_owned()]);
    }
    if let Some(Some(f)) = chap {
        a.extend(["--chapter-charset".into(), "UTF-8".into(), "--chapters".into(), f.as_os_str().to_owned()]);
    }
    let order: Vec<String> = tracks.iter().filter(|t| t.keep)
        .map(|t| format!("{}:{}", inputs.iter().position(|s| s == &t.src).unwrap_or(0), t.tid)).collect();
    if !order.is_empty() {
        a.push("--track-order".into());
        a.push(order.join(",").into());
    }
    a
}

/// ปกของไฟล์ MP4 · ไฟล์รูปแยก หรือรูปปกที่ฝังในหนัง MP4 อยู่แล้ว (เลขสตรีม)
pub enum Mp4Cover {
    File(PathBuf),
    Stream(u64),
}

/// คำสั่ง ffmpeg ทำ MP4 · ไฟล์ต้นทางแยกตาม (ไฟล์, ดีเลย์, ชุดอักษร) เพราะ -itsoffset ใช้ได้ทั้งไฟล์
/// หนังที่ไม่มีดีเลย์อยู่ช่องแรกเสมอ ข้อมูลรวมกับบทของหนังมาจากช่องนี้
/// chap แบบเดียวกับ mkv_args · ไฟล์บทเป็นไฟล์ข้อมูลของ ffmpeg (FFMETADATA)
pub fn mp4_args(movie: &str, tracks: &[Track], cover: Option<&Mp4Cover>, chap: Option<Option<&Path>>, out: &Path) -> Vec<OsString> {
    let mut a: Vec<OsString> = ["-hide_banner", "-nostdin", "-n", "-v", "error", "-progress", "pipe:1", "-nostats"].iter().map(OsString::from).collect();
    let mut inputs: Vec<(String, i64, Option<String>)> = vec![(movie.to_string(), 0, None)];
    let key = |t: &Track| (t.src.clone(), t.delay, if t.in_movie { None } else { t.charset.clone().filter(|_| t.kind == "subtitle") });
    for t in tracks.iter().filter(|t| t.keep) {
        let k = key(t);
        if !inputs.contains(&k) {
            inputs.push(k);
        }
    }
    for (src, delay, cs) in &inputs {
        if *delay != 0 {
            a.push("-itsoffset".into());
            a.push(format!("{:.3}", *delay as f64 / 1000.0).into());
        }
        if let Some(cs) = cs {
            a.push("-sub_charenc".into());
            a.push(cs.into());
        }
        a.push("-i".into());
        a.push(src.into());
    }
    let cover_input = match cover {
        Some(Mp4Cover::File(f)) => {
            a.push("-i".into());
            a.push(f.as_os_str().to_owned());
            Some(inputs.len())
        }
        _ => None,
    };
    // ไฟล์บทที่แก้ต่อท้ายเป็นไฟล์เข้าอีกช่อง แล้วเอาบทจากช่องนั้น (BUGS ข้อ 99)
    let chap_input = match chap {
        Some(Some(f)) => {
            a.extend(["-f".into(), "ffmetadata".into(), "-i".into(), f.as_os_str().to_owned()]);
            Some(inputs.len() + usize::from(cover_input.is_some()))
        }
        _ => None,
    };
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    for t in &kept {
        let ii = inputs.iter().position(|k| k == &key(t)).unwrap_or(0);
        a.push("-map".into());
        a.push(format!("{ii}:{}", t.ff.unwrap_or(t.tid)).into());
    }
    match (cover, cover_input) {
        (Some(Mp4Cover::File(_)), Some(ci)) => { a.push("-map".into()); a.push(format!("{ci}:0").into()); }
        (Some(Mp4Cover::Stream(s)), _) => { a.push("-map".into()); a.push(format!("0:{s}").into()); }
        _ => {}
    }
    a.extend(["-c", "copy", "-c:s", "mov_text"].iter().map(OsString::from));
    for (i, t) in kept.iter().enumerate() {
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("language={}", if t.lang.is_empty() { "und" } else { &t.lang }).into());
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("title={}", t.name).into());
        a.push(format!("-metadata:s:{i}").into());
        a.push(format!("handler_name={}", t.name).into());
        if t.kind != "video" {
            a.push(format!("-disposition:{i}").into());
            a.push((if t.default { "default" } else { "0" }).into());
        }
    }
    if cover.is_some() {
        a.push(format!("-disposition:{}", kept.len()).into());
        a.push("attached_pic".into());
    }
    let map_chapters = match (chap, chap_input) { (None, _) => "0".to_string(), (_, Some(i)) => i.to_string(), _ => "-1".to_string() };
    a.extend(["-map_metadata".into(), "0".into(), "-map_chapters".into(), OsString::from(map_chapters), "-f".into(), "mp4".into()]);
    a.push(out.as_os_str().to_owned());
    a
}

