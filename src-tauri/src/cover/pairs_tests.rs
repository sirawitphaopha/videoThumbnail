//! เทสของ pairs.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
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
    let old: crate::app::library::Movie = serde_json::from_str(r#"{"id":"1","path":"D:\\a.mkv","name":"a"}"#).unwrap();
    assert!(old.pairs.is_empty());
    let mut m = old.clone();
    m.pairs = pairs();
    let back: crate::app::library::Movie = serde_json::from_str(&serde_json::to_string(&m).unwrap()).unwrap();
    assert_eq!(back.pairs, pairs());
}
