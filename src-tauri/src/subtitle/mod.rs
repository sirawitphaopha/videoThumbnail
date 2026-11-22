//! ซับไตเติล ตัวดูซับ ตัวอ่านเขียนซับของหน้าแก้ซับ ภาพนิ่งมีซับ เสียงของหน้าแก้ซับ แปลงชนิดซับ ส่งออก PGS แปลงซับภาพ ฟอนต์ของซับ ASS VobSub (ชื่อกลุ่มใช้ subtitle เพราะโมดูล subs อยู่ข้างใน)
//! จัดกลุ่มตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md ขั้น 10) โมดูลข้างในย้ายมาทั้งไฟล์ เนื้อโค้ดไม่เปลี่ยน
//! ไฟล์อื่นเรียกผ่าน crate::subtitle::<โมดูล> · คำสั่งที่หน้าจอเรียกลงทะเบียนในรายการคำสั่งของ lib.rs ด้วยที่อยู่เต็ม

pub mod subs;
pub mod subdoc;
pub mod subshot;
pub mod subaudio;
pub mod subconv;
pub mod pgs;
pub mod imgconv;
pub mod fonts;
pub mod vobsub;
