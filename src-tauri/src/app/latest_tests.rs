//! เทสของ latest.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// ตัวอย่างข้อความจากหน้าเว็บจริง (ดึง 8 พ.ย. 2569) ตัดมาเฉพาะส่วนที่มีเลขรุ่น
#[test]
fn parses_each_source_format() {
    assert_eq!(parse(How::GithubLatest, r#"{"url":"x","tag_name":"1.5.0","name":"FLAC 1.5.0"}"#).as_deref(), Some("1.5.0"));
    assert_eq!(parse(How::GithubLatest, r#"{ "tag_name": "v3.07", "name": "v3.07" }"#).as_deref(), Some("3.07"));
    assert_eq!(parse(How::GithubTags, r#"[{"name":"v1.0.6"},{"name":"v1.0.9"},{"name":"v1.0.10"},{"name":"test"}]"#).as_deref(), Some("1.0.10"), "เลือกรุ่นสูงสุดตามตัวเลข ไม่ใช่ตามตัวอักษร");
    let opus = r#"<a href="opus-tools%200.2-34-g98f3ddc-x64.zip">opus-tools 0.2-34-g98f3ddc-x64.zip</a>
<a href="opus-tools%200.2-39-g9b1ca51(using%20libopus%201.6.1-8-g475cbc5)-win32.zip">opus-tools 0.2-39-g9b1ca51(using libopus 1.6.1-8-g475cbc5)-win32.zip</a>
<a href="x">opus-tools 0.2-30(using libopus 1.5.2)-x64.zip</a>"#;
    assert_eq!(parse(How::After("using libopus ", ""), opus).as_deref(), Some("1.6.1"));
    let lame = r#"<a href="lame3.100-x64.zip">lame3.100-x64.zip</a> <a href="lame-4.0-x64.zip">lame-4.0-x64.zip</a> <a href="lame-4.0-win32.zip">"#;
    assert_eq!(parse(How::After("lame-", "-x64.zip"), lame).as_deref(), Some("4.0"));
    assert_eq!(parse(How::After("Monkey's Audio ", ""), "<h2>Version History</h2> Monkey's Audio 13.46 Now external encoders are part of the install. Monkey's Audio is fast").as_deref(), Some("13.46"));
    assert_eq!(parse(How::After("TAK_", ".zip"), r#"<a href="../Download/TAK_2.3.3.zip">TAK_2.3.3 Final</a>"#).as_deref(), Some("2.3.3"));
    assert_eq!(parse(How::Plain, "9.0.2\n").as_deref(), Some("9.0.2"));
    assert_eq!(parse(How::Plain, "<html>Not Acceptable!</html>"), None, "หน้าเว็บที่ไม่ใช่เลขรุ่น ต้องไม่เดาเลข");
}

#[test]
fn compares_versions() {
    assert_eq!(compare(Some("1.5.0"), Some("1.5.0")), "ok");
    assert_eq!(compare(Some("libopus 1.6.1"), Some("1.6.1")), "ok");
    assert_eq!(compare(Some("13.45"), Some("13.46")), "new");
    assert_eq!(compare(Some("1.0.9"), Some("1.0.10")), "new", "เทียบตัวเลข 9 < 10");
    assert_eq!(compare(Some("1.6.1"), Some("1.5.2")), "ahead");
    assert_eq!(compare(None, Some("3.07")), "missing");
    assert_eq!(compare(Some("4.0"), None), "error");
    // AUDIT ข้อ 131 ต่างแค่ .0 ท้ายคือรุ่นเดียวกัน แต่ 1.10 กับ 1.1 ไม่ใช่
    assert_eq!(compare(Some("1.5"), Some("1.5.0")), "ok");
    assert_eq!(compare(Some("2.3.3.0"), Some("2.3.3")), "ok");
    assert_eq!(compare(Some("1.1"), Some("1.10")), "new");
    assert_eq!(compare(Some("1.0"), Some("1.0.1")), "new");
}

/// AUDIT ข้อ 131 ที่อยู่ซ้ำดึงครั้งเดียว แต่ทุกตัวแปลงยังได้ผล
#[test]
fn duplicate_check_urls_are_fetched_once() {
    let u = unique_checks();
    let urls: Vec<&str> = u.iter().map(|&i| SOURCES[i].check).collect();
    let mut sorted = urls.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(urls.len(), sorted.len(), "ยังมีที่อยู่ซ้ำ");
    assert_eq!(urls.len(), SOURCES.len() - 1, "qaac กับ refalac ใช้ที่อยู่เดียวกัน ต้องเหลือ 9 ที่อยู่");
    assert!(SOURCES.iter().all(|s| urls.contains(&s.check)), "ทุกตัวแปลงต้องมีที่อยู่ที่ดึง");
}

/// ทุกตัวแปลงในทะเบียนมีที่เช็กรุ่น
#[test]
fn thanks_links_only_open_the_fixed_list() {
    assert_eq!(thank_url("ffmpeg.org"), Some("https://ffmpeg.org/"));
    assert_eq!(thank_url("videohelp.com/software/Bitrate-Viewer"), Some("https://www.videohelp.com/software/Bitrate-Viewer"));
    for bad in ["https://evil.example/", "ffmpeg.org/../x", "", "file:///C:/Windows"] { assert_eq!(thank_url(bad), None, "{bad}"); }
    assert!(THANK_LINKS.iter().all(|(_, u)| u.starts_with("https://") || u.starts_with("http://")));
}

/// หัวข้อชนิดไฟล์ในหน้าตั้งค่าอ่านรายการนามสกุลจาก api.ts (lib/fileTypes.ts) · รายการใน api.ts ต้องตรงกับที่ฝั่ง Rust รับจริง
/// ไม่งั้นหน้าตั้งค่าบอกว่ารองรับทั้งที่โปรแกรมไม่รับ หรือกลับกัน (BUGS ข้อ 127)
#[test]
fn file_types_match_frontend() {
    let api = include_str!("../../../src/lib/api/files.ts"); // รายการนามสกุลอยู่ api/files.ts ตั้งแต่แบ่งไฟล์ขั้น 6.1
    let list = |name: &str| -> Vec<String> {
        let key = format!("export const {name} = [");
        let start = api.find(&key).unwrap_or_else(|| panic!("หา {name} ใน api.ts ไม่เจอ")) + key.len();
        let end = start + api[start..].find(']').expect("หาท้ายรายการไม่เจอ");
        api[start..end].split(',').map(|s| s.trim().trim_matches('"').to_string()).filter(|s| !s.is_empty()).collect()
    };
    let sorted = |mut v: Vec<String>| { v.sort(); v.dedup(); v };
    let own = |v: &[&str]| sorted(v.iter().map(|s| s.to_string()).collect());
    assert_eq!(sorted(list("MOVIE_EXT")), own(&crate::app::library::ACCEPTED), "ไฟล์หนังที่ชั้นวางรับ");
    assert_eq!(sorted(list("IMAGE_EXT")), own(&crate::cover::poster_image::ACCEPTED), "รูปโปสเตอร์ที่รับ");
    let codecs = ["opus", "aac", "mp3", "ac3", "eac3", "flac", "alac", "wv", "ape", "tak"];
    let outs: Vec<&str> = codecs.iter().map(|c| crate::audio::encode::EncodeSpec { codec: c.to_string(), ..Default::default() }.ext()).collect();
    assert_eq!(sorted(list("ENCODE_OUT_EXT")), own(&outs), "นามสกุลไฟล์ที่ได้จากการแปลงเสียง");
    let sub = list("SUB_EXT");
    for e in crate::subtitle::subs::FF_TEXT.iter().chain(crate::subtitle::subs::OWN_TEXT) { assert!(sub.iter().any(|s| s == e), "ซับ .{e} ที่ฝั่ง Rust แปลงได้ ต้องอยู่ใน SUB_EXT"); }
    for e in ["srt", "ass", "ssa", "vtt", "sup", "idx", "sub"] { assert!(sub.iter().any(|s| s == e), "SUB_EXT ขาด .{e}"); }
    let known: Vec<&str> = ["srt", "ass", "ssa", "vtt", "sup", "idx", "sub"].into_iter().chain(crate::subtitle::subs::FF_TEXT.iter().copied()).chain(crate::subtitle::subs::OWN_TEXT.iter().copied()).collect();
    for e in &sub { assert!(known.contains(&e.as_str()), "SUB_EXT มี .{e} ที่ฝั่ง Rust ไม่รู้จัก"); }
}

/// ทุกลิงก์บนการ์ดขอบคุณในหน้าตั้งค่ากดเปิดได้ · เพิ่มการ์ดแล้วลืมเพิ่มที่อยู่ในรายการตายตัว ปุ่มบนการ์ดจะขึ้นว่าไม่รู้จักลิงก์นี้ (BUGS ข้อ 122 เพิ่ม mpv กับ Subtitle Edit)
#[test]
fn every_thanks_card_link_is_in_the_fixed_list() {
    let src = include_str!("../../../src/pages/settings/data.tsx"); // รายการ THANKS อยู่ settings/data.tsx ตั้งแต่แบ่งไฟล์ขั้น 5.2
    let start = src.find("const THANKS:").expect("หารายการ THANKS ในหน้าตั้งค่าไม่เจอ");
    let end = start + src[start..].find("\n];").expect("หาท้ายรายการ THANKS ไม่เจอ");
    let mut links = Vec::new();
    for part in src[start..end].split("url: \"").skip(1) {
        let u = &part[..part.find('"').expect("ที่อยู่ไม่มีเครื่องหมายปิด")];
        links.extend(u.split(", "));
    }
    // ขั้นต่ำไว้บอกว่าตัวอ่านยังเจอรายการ (14 พ.ย. 2569 การ์ดมี 37 ลิงก์)
    assert!(links.len() >= 30, "อ่านลิงก์ได้แค่ {} ลิงก์", links.len());
    let miss: Vec<&str> = links.iter().copied().filter(|l| thank_url(l).is_none()).collect();
    assert!(miss.is_empty(), "การ์ดขอบคุณมีลิงก์ที่ไม่อยู่ในรายการตายตัว: {miss:?}");
    for l in ["mpv.io", "github.com/SubtitleEdit/subtitleedit", "aegisub.org", "github.com/cubicibo/SUPer", "github.com/TheGreatMcPain/BDSup2SubPlusPlus", "github.com/Gpower2/gMKVExtractGUI"] { assert!(links.contains(&l), "ไม่มีการ์ดของ {l}"); }
}

#[test]
fn every_encoder_has_a_source() {
    for (n, ..) in crate::audio::encode::ENCODERS { assert!(SOURCES.iter().any(|s| s.name == n), "ไม่มีที่เช็กรุ่นของ {n}"); }
    assert!(SOURCES.iter().any(|s| s.name == "MACDll64"));
}
