//! ระบบ OCR ซับรูป ตัวอ่าน PaddleOCR Tesseract nOCR Binary OCR ตัวสอนเอง ตัวเตรียมภาพ ตัวแก้คำ ตัวชี้จุดสงสัย งาน OCR ส่งออก
//! จัดกลุ่มตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md ขั้น 10) โมดูลข้างในย้ายมาทั้งไฟล์ เนื้อโค้ดไม่เปลี่ยน
//! ไฟล์อื่นเรียกผ่าน crate::ocr::<โมดูล> · คำสั่งที่หน้าจอเรียกลงทะเบียนในรายการคำสั่งของ lib.rs ด้วยที่อยู่เต็ม

pub mod binocr;
pub mod nocr;
pub mod nocr_lines;
pub mod nocr_split;
pub mod nocr_text;
pub mod nocr_train;
pub mod ownocr;
pub mod ocrprep;
pub mod ocrfix;
pub mod suspect;
pub mod ocrfix_guess;
pub mod ocrfix_list;
pub mod ocrfix_words;
pub mod ocrsrc;
pub mod ocrjob;
pub mod ocrbreak;
pub mod ocrmanual;
pub mod ocrexport;
pub mod paddle;
pub mod paddle_dl;
pub mod tesseract;
