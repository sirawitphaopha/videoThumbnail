//! ส่วนกลางของโปรแกรม ค่าตั้ง คลังหนัง งานที่ทำอยู่ บันทึกการใช้งาน เครื่องมือภายนอก ไฟล์ผลลัพธ์ ไดรฟ์ หน้าต่าง เช็กรุ่นล่าสุด ค่า hash
//! จัดกลุ่มตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md ขั้น 10) โมดูลข้างในย้ายมาทั้งไฟล์ เนื้อโค้ดไม่เปลี่ยน
//! ไฟล์อื่นเรียกผ่าน crate::app::<โมดูล> · คำสั่งที่หน้าจอเรียกลงทะเบียนในรายการคำสั่งของ lib.rs ด้วยที่อยู่เต็ม

pub mod store;
pub mod library;
pub mod jobs;
pub mod actlog;
pub mod tools;
pub mod outfile;
pub mod drives;
pub mod winutil;
pub mod latest;
pub mod hashes;
