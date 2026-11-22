//! งานรวมไฟล์ ตรวจไฟล์ใหม่หลังรวม
//! แยกจาก merge/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------------------------------------------------------------- ตรวจไฟล์ใหม่

/// ตรวจไฟล์ MKV ใหม่เทียบที่สั่ง · ลำดับ ชนิด codec ภาษา ชื่อ ธงหลัก ไฟล์แนบ รูปปก ความยาว
pub fn verify_mkv(tools: &Path, work: &Path, file: &Path, tracks: &[Track], att_names: &[String], covers: &[NewCover], movie_duration: Option<f64>) -> Result<Counts, Vec<String>> {
    let mut why = vec![];
    let mk = mkv_json(tools, file).map_err(|e| vec![e])?;
    let ff = ffprobe_json(tools, file).map_err(|e| vec![e])?;
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    let got = streams_of(&ff);
    let want_k: Vec<(String, String)> = kept.iter().map(|t| (t.kind.clone(), t.codec.clone())).collect();
    let got_k: Vec<(String, String)> = got.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
    if want_k != got_k {
        let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
        why.push(format!("แทร็กไม่ตรงที่สั่ง ที่สั่ง {} แต่ไฟล์ใหม่ {}", show(&want_k), show(&got_k)));
    }
    let empty = vec![];
    let mt: Vec<&Value> = mk["tracks"].as_array().unwrap_or(&empty).iter().collect();
    for (i, t) in kept.iter().enumerate() {
        let Some(m) = mt.get(i) else { break };
        let p = &m["properties"];
        let lang = p["language"].as_str().unwrap_or("und");
        // ส่งภาษาแบบละเอียดไป mkvmerge ตั้งรหัสสามตัวให้เองตามภาษานั้น ไฟล์เดิมที่สองช่องไม่ตรงกัน (รหัสสามตัว tha แต่ภาษาแบบละเอียด zh-Hant) รหัสสามตัวจะเปลี่ยน · เช็กภาษาแบบละเอียดข้างล่างแทน
        let ietf_used = mkv_lang(t) != t.lang;
        if !ietf_used && lang != t.lang && !(t.lang.is_empty() && lang == "und") {
            why.push(format!("แทร็กที่ {} ภาษา {lang} ที่สั่ง {}", i + 1, t.lang));
        }
        if p["track_name"].as_str().unwrap_or("") != t.name {
            why.push(format!("แทร็กที่ {} ชื่อ \"{}\" ที่สั่ง \"{}\"", i + 1, p["track_name"].as_str().unwrap_or(""), t.name));
        }
        if p["default_track"].as_bool().unwrap_or(false) != t.default {
            why.push(format!("แทร็กที่ {} ธงหลักไม่ตรงที่สั่ง", i + 1));
        }
        // ภาษาแบบละเอียดกับป้ายพิเศษต้องติดมาครบ (BUGS ข้อ 114)
        let ietf = mkv_lang(t);
        if ietf != t.lang && ietf != "und" && !p["language_ietf"].as_str().unwrap_or("").eq_ignore_ascii_case(ietf) {
            why.push(format!("แทร็กที่ {} ภาษาแบบละเอียด {} ที่สั่ง {ietf}", i + 1, p["language_ietf"].as_str().unwrap_or("—")));
        }
        for (on, key, word) in [(t.hearing_impaired, "flag_hearing_impaired", "ป้ายคนหูหนวก"), (t.visual_impaired, "flag_visual_impaired", "ป้ายคนตาบอด"), (t.text_descriptions, "flag_text_descriptions", "ป้ายคำบรรยายภาพ"), (t.original, "flag_original", "ป้ายภาษาต้นฉบับ"), (t.commentary, "flag_commentary", "ป้ายเสียงบรรยาย")] {
            if on && !p[key].as_bool().unwrap_or(false) {
                why.push(format!("แทร็กที่ {} {word}หาย", i + 1));
            }
        }
    }
    let mut want_atts: Vec<String> = att_names.iter().map(|n| n.to_lowercase()).collect();
    want_atts.extend(covers.iter().map(|c| c.name.to_lowercase()));
    want_atts.sort();
    let mut got_atts: Vec<String> = attachments_of(&mk).iter().map(|a| a.name.to_lowercase()).collect();
    got_atts.sort();
    if want_atts != got_atts {
        why.push(format!("ไฟล์แนบไม่ตรง ที่สั่ง {want_atts:?} แต่ไฟล์ใหม่ {got_atts:?}"));
    } else {
        for c in covers {
            if let Err(e) = cover_matches(tools, work, file, &mk, c) {
                why.push(e);
            }
        }
    }
    if let (Some(a), Some(b)) = (movie_duration, duration_of(&ff)) {
        if b + 0.2 < a {
            why.push(format!("ไฟล์ใหม่สั้นกว่าหนัง {:.2} กับ {:.2} วินาที", b, a));
        }
    }
    if why.is_empty() { Ok(count(&got)) } else { Err(why) }
}

/// รูปปกในไฟล์ดึงออกมาแล้ว hash ตรงกับรูปที่ใส่
fn cover_matches(tools: &Path, work: &Path, file: &Path, mk: &Value, c: &NewCover) -> Result<(), String> {
    let att = attachments_of(mk).into_iter().find(|a| a.name.eq_ignore_ascii_case(&c.name)).ok_or(format!("ไม่เจอ {} ในไฟล์ใหม่", c.name))?;
    if att.mime != c.mime {
        return Err(format!("{} ชนิด {} ที่ใส่ {}", c.name, att.mime, c.mime));
    }
    std::fs::create_dir_all(work).map_err(|e| e.to_string())?;
    let out = work.join(format!("merge-verify-{}", crate::cover::poster_image::unique()));
    let mut target = OsString::from(format!("{}:", att.id));
    target.push(out.as_os_str());
    let r = run_tool_timeout(tools, "mkvextract", [file.as_os_str(), OsStr::new("attachments"), &target], Duration::from_secs(120))?;
    let got = std::fs::read(&out).map(|b| crate::media::probe::hex(&Sha256::digest(&b)));
    let _ = std::fs::remove_file(&out);
    if !tool_succeeded("mkvextract", &r.status) || got.as_deref().ok() != Some(c.sha.as_str()) {
        return Err(format!("{} ที่ดึงออกมาไม่ตรงกับรูปที่ใส่", c.name));
    }
    Ok(())
}

/// ตรวจไฟล์ MP4 ใหม่ · ลำดับ ชนิด (ซับเป็น mov_text) ภาษา ธงหลัก ปก ความยาว
pub fn verify_mp4(tools: &Path, file: &Path, tracks: &[Track], want_cover: bool, movie_duration: Option<f64>) -> Result<Counts, Vec<String>> {
    let mut why = vec![];
    let ff = ffprobe_json(tools, file).map_err(|e| vec![e])?;
    let kept: Vec<&Track> = tracks.iter().filter(|t| t.keep).collect();
    let got = streams_of(&ff);
    let want_k: Vec<(String, String)> = kept.iter().map(|t| (t.kind.clone(), if t.kind == "subtitle" { "mov_text".into() } else { t.codec.clone() })).collect();
    let got_k: Vec<(String, String)> = got.iter().map(|s| (s.kind.clone(), s.codec.clone())).collect();
    if want_k != got_k {
        let show = |v: &[(String, String)]| v.iter().map(|(k, c)| format!("{}{c}", kind_word(k))).collect::<Vec<_>>().join(" ");
        why.push(format!("แทร็กไม่ตรงที่สั่ง ที่สั่ง {} แต่ไฟล์ใหม่ {}", show(&want_k), show(&got_k)));
    }
    let empty = vec![];
    let fs: Vec<&Value> = ff["streams"].as_array().unwrap_or(&empty).iter()
        .filter(|s| matches!(s["codec_type"].as_str(), Some("video" | "audio" | "subtitle")) && s["disposition"]["attached_pic"].as_i64() != Some(1)).collect();
    let no_main = |k: &str| !kept.iter().any(|t| t.kind == k && t.default);
    for (i, t) in kept.iter().enumerate() {
        let Some(s) = fs.get(i) else { break };
        let first_of_kind = kept.iter().position(|x| x.kind == t.kind) == Some(i);
        let lang = s["tags"]["language"].as_str().unwrap_or("und");
        if lang != t.lang && !(t.lang.is_empty() && lang == "und") {
            why.push(format!("แทร็กที่ {} ภาษา {lang} ที่สั่ง {}", i + 1, t.lang));
        }
        // ไม่ได้เลือกหลักของชนิดนี้ ตัวเขียน MP4 ตั้งแทร็กแรกของชนิดนั้นเป็นหลักเอง ไม่นับว่าผิด
        let want_default = t.default || (first_of_kind && no_main(&t.kind));
        if t.kind != "video" && (s["disposition"]["default"].as_i64() == Some(1)) != want_default {
            why.push(format!("แทร็กที่ {} ธงหลักไม่ตรงที่สั่ง", i + 1));
        }
    }
    if want_cover && !crate::app::outfile::has_attached_pic(&ff) {
        why.push("ไม่เจอปกในไฟล์ใหม่".into());
    }
    if let (Some(a), Some(b)) = (movie_duration, duration_of(&ff)) {
        if b + 0.2 < a {
            why.push(format!("ไฟล์ใหม่สั้นกว่าหนัง {:.2} กับ {:.2} วินาที", b, a));
        }
    }
    if why.is_empty() { Ok(count(&got)) } else { Err(why) }
}

