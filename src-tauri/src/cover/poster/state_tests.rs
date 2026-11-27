//! เทสของที่เก็บสถานะหน้าใส่โปสเตอร์ (mod state_tests) · จำรูปเดิมไว้คืนตอนยกเลิกหน้าครอปของรูปใหม่ (AUDIT ข้อ 42)
use super::*;

fn img(v: u8) -> Source {
    Source { img: RgbImage::from_pixel(2, 3, image::Rgb([v, v, v])) }
}

/// มีรูปที่กดใช้ เปิดรูปใหม่แล้วยกเลิก ต้องได้รูปเดิม ไบต์เดิม และภาพตัวอย่างเดิมคืน
#[test]
fn cancel_after_open_restores_chosen() {
    let st = PosterState::default();
    let dir = std::env::temp_dir().join(format!("poster-prev-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let (old_prev, new_prev) = (dir.join("old.jpg"), dir.join("new.jpg"));
    std::fs::write(&old_prev, b"a").unwrap();
    std::fs::write(&new_prev, b"b").unwrap();
    *st.source.lock().unwrap() = Some(img(10));
    *st.chosen.lock().unwrap() = Some((vec![1, 2, 3], "jpg".into()));
    st.keep_preview("src", old_prev.clone());
    // เปิดรูปใหม่ (ลำดับเดียวกับ poster_open)
    st.stash_for_open();
    st.keep_preview("src", new_prev.clone());
    *st.source.lock().unwrap() = Some(img(200));
    assert!(st.chosen.lock().unwrap().is_none(), "เปิดรูปใหม่แล้วยังไม่มีรูปที่กดใช้");
    assert!(old_prev.exists(), "ภาพตัวอย่างของรูปเดิมต้องยังอยู่ ไว้คืนหน้าครอป");
    assert!(st.restore_prev());
    assert_eq!(st.chosen.lock().unwrap().as_ref().unwrap().0, vec![1, 2, 3]);
    assert_eq!(st.source.lock().unwrap().as_ref().unwrap().img.get_pixel(0, 0).0, [10, 10, 10]);
    assert_eq!(st.previews.lock().unwrap().get("src"), Some(&old_prev));
    assert!(!new_prev.exists(), "ภาพตัวอย่างของรูปที่ยกเลิกถูกลบ");
    assert!(!st.restore_prev(), "คืนแล้วไม่มีอะไรให้คืนซ้ำ");
    std::fs::remove_dir_all(&dir).unwrap();
}

/// เปิดรูปใหม่ซ้อนจากหน้าครอปที่ยังไม่กดใช้ ของที่จำไว้ต้องเป็นรูปที่กดใช้ล่าสุด ไม่ใช่รูปที่ยังไม่ได้ใช้
#[test]
fn second_open_keeps_last_chosen() {
    let st = PosterState::default();
    *st.source.lock().unwrap() = Some(img(10));
    *st.chosen.lock().unwrap() = Some((vec![9], "png".into()));
    st.stash_for_open();
    *st.source.lock().unwrap() = Some(img(50));
    st.stash_for_open();
    *st.source.lock().unwrap() = Some(img(90));
    assert!(st.restore_prev());
    assert_eq!(st.chosen.lock().unwrap().as_ref().unwrap().0, vec![9]);
    assert_eq!(st.source.lock().unwrap().as_ref().unwrap().img.get_pixel(0, 0).0, [10, 10, 10]);
}

/// ไม่มีรูปที่กดใช้ก่อนเปิด ยกเลิกแล้วไม่มีอะไรให้คืน · ล้างรูปแล้วของที่จำไว้หายด้วย
#[test]
fn nothing_to_restore_without_chosen_or_after_clear() {
    let st = PosterState::default();
    *st.source.lock().unwrap() = Some(img(10));
    st.stash_for_open();
    assert!(!st.restore_prev());
    *st.chosen.lock().unwrap() = Some((vec![1], "jpg".into()));
    *st.source.lock().unwrap() = Some(img(10));
    st.stash_for_open();
    st.drop_prev();
    assert!(!st.restore_prev());
}
