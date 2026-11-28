//! ข้อมูลไฟล์สื่อ ffprobe MediaInfo โครงสร้าง MKV chapter แยกแทร็ก ตรวจไฟล์ บิตเรต โปรแกรมเล่น
//! จัดกลุ่มตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md ขั้น 10) โมดูลข้างในย้ายมาทั้งไฟล์ เนื้อโค้ดไม่เปลี่ยน
//! ไฟล์อื่นเรียกผ่าน crate::media::<โมดูล> · คำสั่งที่หน้าจอเรียกลงทะเบียนในรายการคำสั่งของ lib.rs ด้วยที่อยู่เต็ม

pub mod probe;
pub mod fileinfo;
pub mod encinfo;
pub mod mkvtree;
pub mod chapters;
pub mod extract;
pub mod check;
pub mod bitrate;
pub mod players;
