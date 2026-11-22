//! เสียง กราฟเสียง รูปกราฟที่บันทึก ความดัง ตัวแปลงเสียง แปลงเสียงเป็นคิว Monkey's Audio ตัวช่วยหาดีเลย์
//! จัดกลุ่มตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md ขั้น 10) โมดูลข้างในย้ายมาทั้งไฟล์ เนื้อโค้ดไม่เปลี่ยน
//! ไฟล์อื่นเรียกผ่าน crate::audio::<โมดูล> · คำสั่งที่หน้าจอเรียกลงทะเบียนในรายการคำสั่งของ lib.rs ด้วยที่อยู่เต็ม

pub mod audiograph;
pub mod graphimg;
pub mod loudness;
pub mod encode;
pub mod convert;
pub mod ape;
pub mod delay;
