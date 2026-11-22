//! เทสของ ocrbreak.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

fn ab(s: &str) -> String { auto_break_line(s, "en") }

#[test]
fn keeps_music_and_dialog() {
    // จากเทสของ Subtitle Edit AutoBreakLine_KeepsSecondLineWrappedInMusicSymbols
    let m = "♪ La la la\n♪ da da ♪";
    assert_eq!(auto_break_line_private(m, 43, 100, "", false), m);
    let d = "- Where are you going tonight?\n- To the old house by the river, I think.";
    assert_eq!(ab(d), d);
    let d3 = "- How are you?\n- I'm fine today, but I would have\nbeen better if I had some candy.";
    assert!(is_dialog(&split_to_lines(d3), "en"));
    assert!(!is_dialog(&split_to_lines("I went home\nand slept."), "en"));
    // บทพูดที่ขีดไม่มีเว้นวรรค จับได้ด้วย IsDialog เท่านั้น ไม่งั้นถูกรวมเป็นบรรทัดเดียว
    assert_eq!(ab("Yes.\n-No way."), "Yes.\n-No way.");
}

/// จุดตัดที่สองบรรทัดกว้างใกล้กันที่สุดอย่างเดียว ไม่เอียงให้บรรทัดล่าง
fn balanced_only(t: &str) -> String {
    let one = remove_line_breaks(t);
    let cs: Vec<char> = one.chars().collect();
    let space = get_width(" ");
    let all: Vec<Split> = (1..cs.len() - 1).filter(|&i| cs[i] == ' ' && can_break(&cs, i, "en"))
        .map(|i| Split::new(cs[..i].iter().collect::<String>().trim().into(), cs[i + 1..].iter().collect::<String>().trim().into())).collect();
    let refs: Vec<&Split> = all.iter().collect();
    min_by(&refs, |p| p.line_len_ok(MAX_LEN), |p| p.diff_avg_px(space)).unwrap().joined()
}

#[test]
fn prefers_bottom_heavy() {
    let mut differ = 0;
    for t in [
        "We have to leave this place\nbefore the sun goes down\ntonight or we will never make it.",
        "Nobody knows where he went\nafter the war ended and\nthe soldiers came back home.",
        "If you really want to help me,\nthen bring the car around\nto the back door right now.",
        "I told you a thousand times\nnot to go into the forest\nalone at night, didn't I?",
    ] {
        let r = ab(t);
        let l = split_to_lines(&r);
        assert_eq!(l.len(), 2, "{r}");
        let (a, b) = (get_width(&l[0]), get_width(&l[1]));
        assert!(b + 2.0 > a, "บรรทัดล่างต้องไม่สั้นกว่าบรรทัดบน {a} {b} {r}");
        if balanced_only(t) != r { differ += 1; }
    }
    assert!(differ > 0, "ทุกประโยคได้จุดเดียวกับแบบสมดุลอย่างเดียว เทสนี้จับการเอียงให้บรรทัดล่างไม่ได้");
}

#[test]
fn three_ocr_lines_become_two() {
    let t = "I never thought that I would\nsee you again after all these\nyears in this town.";
    let r = ab(t);
    let lines = split_to_lines(&r);
    assert_eq!(lines.len(), 2, "{r}");
    assert!(lines.iter().all(|l| l.chars().count() <= MAX_LEN), "{r}");
    assert_eq!(r.replace('\n', " "), t.replace('\n', " "));
    // ตัดตรงกลางตามความกว้าง บรรทัดล่างไม่สั้นกว่าบรรทัดบนมาก
    let (a, b) = (get_width(&lines[0]), get_width(&lines[1]));
    assert!((a - b).abs() < 40.0, "{a} {b} {r}");
}

#[test]
fn short_text_merges_to_one_line() {
    assert_eq!(ab("Good\nmorning\nsir."), "Good morning sir.");
    // ขีดขึ้นคนที่สองหลังจบประโยค ตัดตรงนั้นแม้สั้น
    assert_eq!(ab("Hello there. - Hi\nyou."), "Hello there.\n- Hi you.");
}

#[test]
fn no_break_after_mr_dr() {
    let cs: Vec<char> = "I saw Mr. Smith today".chars().collect();
    assert!(!can_break(&cs, 9, "en"));
    assert!(can_break(&cs, 5, "en"));
    let fr: Vec<char> = "Vraiment ?".chars().collect();
    assert!(!can_break(&fr, 8, "fr"));
    assert!(can_break(&fr, 8, "en"));
}

#[test]
fn keeps_italic_tags() {
    let t = "<i>I never thought that I would\nsee you again after all these\nyears in this town.</i>";
    let r = ab(t);
    assert!(r.starts_with("<i>") && r.ends_with("</i>"), "{r}");
    assert_eq!(number_of_lines(&r), 2, "{r}");
    assert_eq!(remove_html_tags(&r, true).replace('\n', " "), remove_html_tags(t, true).replace('\n', " "));
    // แท็กปิดกลางข้อความที่ตกไปหัวบรรทัดล่าง ย้ายกลับไปท้ายบรรทัดบน
    let t2 = "<i>I never thought that I would see you</i>\nagain after all these years\nin this town.";
    let r2 = ab(t2);
    assert!(!r2.contains("\n</i>"), "{r2}");
}

#[test]
fn sentence_ending_rules() {
    assert!(has_sentence_ending("Go home.", "en"));
    assert!(has_sentence_ending("Go home!\"", "en"));
    assert!(has_sentence_ending("<i>Go home?</i>", "en"));
    assert!(has_sentence_ending("I was--", "en"));
    assert!(!has_sentence_ending("I was -", "en"));
    assert!(!has_sentence_ending("Go home", "en"));
    assert!(has_sentence_ending("Τι;", "el"));
    assert!(!has_sentence_ending("Τι;", "en"));
}

#[test]
fn counts_thai_clusters_and_strips_tags() {
    assert_eq!(count_characters("<i>abc</i>"), 3);
    // กิ่ง = ก ิ ่ ง นับสองตัวแบบกลุ่มตัวอักษร
    assert_eq!(count_characters("กิ่ง"), 2);
    assert_eq!(remove_html_tags("<font color=\"red\">a</font>{\\an8}b", true), "ab");
    assert_eq!(fix_upper_tags("<I>a</I>"), "<i>a</i>");
    assert_eq!(lang_of_dict("en_US"), "en");
    assert_eq!(lang_of_dict(""), "");
}

/// ซับญี่ปุ่นสามบรรทัด (บรรทัดคำอ่านเกินมา) ตัดบรรทัดเองแล้วไม่มีเว้นวรรคแทรก · ภาษาดูจากตัวอักษร (ผู้ช่วยตรวจทาน T1)
#[test]
fn japanese_joins_without_spaces() {
    let t = "ほうこう\n咆哮が聞こえる\n逃げろ";
    assert_eq!(lang_of_text(t, "en"), "ja");
    assert_eq!(lang_of_text("สวัสดี", "en"), "th");
    assert_eq!(lang_of_text("咆哮", "en"), "zh");
    assert_eq!(lang_of_text("Hello", "en"), "en");
    let r = auto_break_line(t, &lang_of_text(t, "en"));
    assert!(!r.contains(' '), "{r:?}");
    assert_eq!(r.replace('\n', ""), t.replace('\n', ""));
}

#[test]
fn japanese_breaks_at_comma() {
    let t = "今日はとても良い天気ですね、明日もきっと晴れるでしょう。そうだといいですね。本当に";
    let r = auto_break_line(t, "ja");
    assert_eq!(number_of_lines(&r), 2, "{r}");
    assert_eq!(r.replace('\n', ""), t);
}

#[test]
fn measures_with_segoe_ui() {
    // วัดได้จริงด้วย GDI (ไม่ใช่ทางสำรอง ความยาว × 5) และตัวกว้างกว่าตัวแคบ
    if cfg!(windows) {
        let w = measure("WWWW").expect("GDI วัดไม่ได้");
        assert!(w > measure("iiii").unwrap());
        assert!(w != 20.0);
    }
}
