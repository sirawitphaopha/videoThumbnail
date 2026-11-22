//! เทสคืนปกที่จำไว้ของ library.rs (เดิมเป็นโมดูล park_tests ในไฟล์) · แยกออกตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) เนื้อเทสไม่เปลี่ยน
use super::*;
use crate::cover::link::LinkedCover;

fn cover() -> LinkedCover { LinkedCover { orient: "tall".into(), source: "D:\\รูป.jpg".into(), thumb: "D:\\t.jpg".into(), ..Default::default() } }

/// หนังหายแล้วกลับมา คะแนนคืนเอง · เรื่องที่ให้คะแนนใหม่ไปแล้ว ไม่โดนทับ
#[test]
fn parked_rating_comes_back() {
    let mut parked = vec![ParkedCovers { id: "9".into(), path: "D:\\A.mkv".into(), rating: 4, ..Default::default() }];
    let mut movies = vec![Movie { id: "9".into(), path: "D:\\A.mkv".into(), ..Default::default() }];
    restore_parked(&mut movies, &mut parked);
    assert_eq!(movies[0].rating, 4);
    assert!(parked.is_empty());
    let mut parked = vec![ParkedCovers { id: "9".into(), path: "D:\\A.mkv".into(), rating: 4, ..Default::default() }];
    let mut movies = vec![Movie { id: "9".into(), path: "D:\\A.mkv".into(), rating: 2, ..Default::default() }];
    restore_parked(&mut movies, &mut parked);
    assert_eq!(movies[0].rating, 2);
    // คลังเก่าที่ยังไม่มีช่องคะแนน อ่านได้เป็น 0
    let old: Movie = serde_json::from_str(r#"{"id":"1","path":"D:\\x.mkv"}"#).unwrap();
    assert_eq!(old.rating, 0);
}

/// เอาโฟลเดอร์ออกแล้วใส่กลับ ปกกลับมาเอง ตามเลขประจำไฟล์หรือที่อยู่
#[test]
fn parked_covers_come_back() {
    let mut parked = vec![ParkedCovers { id: "9".into(), path: "D:\\A.mkv".into(), linked: vec![cover()], cover_pick: "file".into(), rating: 0 }];
    let mut movies = vec![Movie { id: "1".into(), path: "D:\\b.mkv".into(), ..Default::default() }, Movie { id: "9".into(), path: "E:\\a.mkv".into(), ..Default::default() }];
    assert_eq!(restore_parked(&mut movies, &mut parked), vec!["9".to_string()]);
    assert!(parked.is_empty());
    assert!(movies[0].linked.is_empty());
    assert_eq!(movies[1].linked.len(), 1);
    assert_eq!(movies[1].cover_pick, "file");
    // เลขเปลี่ยน หาจากที่อยู่
    let mut parked = vec![ParkedCovers { id: "9".into(), path: "D:\\A.mkv".into(), linked: vec![cover()], ..Default::default() }];
    let mut movies = vec![Movie { id: "7".into(), path: "d:\\a.MKV".into(), ..Default::default() }];
    restore_parked(&mut movies, &mut parked);
    assert_eq!(movies[0].linked.len(), 1);
}
