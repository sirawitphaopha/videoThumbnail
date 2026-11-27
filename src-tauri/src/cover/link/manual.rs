//! จับคู่เองลงแถวและย้อน (กระดาน Explorer ปุ่มบนชั้นวาง) · แยกจาก rows.rs ตามเกณฑ์ไฟล์ยาว 450 บรรทัด (AUDIT ข้อ 74)
//! คำสั่ง link_pair กับ link_undo ยังอยู่ rows.rs
use super::*;

/// จับคู่เองจากกระดาน Explorer หรือปุ่มบนชั้นวาง · หลายรูปแยกปกตั้งปกนอนตามแนวของรูป · แทนรูปเดิมของแถว · ไปรอยืนยันที่ตาราง
pub fn pair_row(row: &mut Row, picks: Vec<Pick>, via: &str) {
    let mut before = row.clone();
    before.prev = None;
    row.tall = None;
    row.wide = None;
    row.derived_tall = false;
    // รูปแนวตั้งก่อน รูปแนวนอนจะได้ไม่ไปครอปทับปกตั้งจริง · แนวเดียวกันหลายรูปใช้รูปแรก
    let (t, w): (Vec<Pick>, Vec<Pick>) = picks.into_iter().partition(|p| p.width <= p.height);
    if let Some(p) = t.into_iter().next() { assign(row, p); }
    if let Some(p) = w.into_iter().next() { assign(row, p); }
    row.status = "manual".into();
    row.via = via.to_string();
    row.reason = match via { "explorer" => "ลากจาก Explorer".to_string(), "shelf" => "เลือกจากชั้นวาง".to_string(), _ => "จับคู่เองบนกระดาน".to_string() };
    row.candidates.clear();
    row.score = 0;
    row.ticked = true;
    row.touched = true;
    row.error = None;
    row.conflict = None;
    row.store_override = None;
    row.prev = Some(Box::new(before));
}

/// จับคู่เองลงแถวของหนัง · ยังไม่มีแถว สร้างแถวว่างแล้วจำว่าจับคู่เองสร้าง (from_pair)
pub(crate) fn pair_into(rows: &mut Vec<Row>, m: &Movie, picks: Vec<Pick>, via: &str) {
    if !rows.iter().any(|r| r.id == m.id) {
        rows.push(Row { from_pair: true, ..blank_row(m) });
    }
    let r = rows.iter_mut().find(|r| r.id == m.id).unwrap();
    pair_row(r, picks, via);
}

/// ย้อนการจับคู่เองของแถว · แถวก่อนหน้าเป็นแถวว่างที่จับคู่เองสร้าง เอาแถวออกทั้งแถว
/// (AUDIT ข้อ 74 · เดิมคืนแถวว่าง ตารางมีแถวหาคู่ไม่เจอโผล่มาเพิ่มทั้งที่ก่อนจับคู่ไม่มี)
pub(crate) fn undo_row(rows: &mut Vec<Row>, id: &str) -> Result<(), String> {
    let i = rows.iter().position(|r| r.id == id).ok_or("ไม่เจอแถวนี้")?;
    let Some(prev) = rows[i].prev.take() else { return Err("แถวนี้ไม่มีอะไรให้ย้อน".to_string()) };
    if prev.from_pair && prev.status == "none" {
        rows.remove(i);
    } else {
        rows[i] = *prev;
    }
    Ok(())
}
