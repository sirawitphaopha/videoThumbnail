//! จับคู่รูปปกกับไฟล์หนัง โดยไม่รวมเข้าไฟล์ (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
//! พี่กันสั่ง 8 พ.ย. 2569 *"เเม้โปสเต้อ เเละวิดีโอจะอยู่คนละที่ เเต่โปรแกรมจะจับคู่กันได้ โดยไม่ต้อง merge"*
//! ทุกวิธีจับคู่ (อัตโนมัติ กระดาน ลากจาก Explorer ปุ่มบนชั้นวาง) ยังไม่บันทึก ไปรอที่ตารางตรวจผล
//! คู่ที่รอยืนยันเก็บใน pending.json ปิดเปิดโปรแกรมไม่หาย · ยืนยันแล้วค่อยเก็บรูปจริง
//! 🔴 ไฟล์หนังไม่ถูกแตะ · รูปต้นฉบับไม่ถูกแก้ · ขั้นนี้อ่านอย่างเดียว ของที่เขียนมีแค่ pending.json กับภาพเล็กในโฟลเดอร์ของโปรแกรม

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use image::{imageops, ImageDecoder, ImageReader};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app::library::{LibraryStore, Movie};
use crate::cover::poster_image::{self as pi, Geometry};
use crate::app::store::write_atomic;

// ---------------------------------------------------------------- แถวในตารางตรวจผล

/// รูปที่เลือกให้ปกหนึ่งช่อง
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Pick {
    pub path: String,
    pub name: String,
    /// โฟลเดอร์ของรูป บอกบนจอ
    pub folder: String,
    pub width: u32,
    pub height: u32,
    pub thumb: Option<String>,
    /// ค่าครอปที่ตั้งเอง · ไม่มี = ครอปกลางรูปตอนยืนยัน
    pub geo: Option<Geometry>,
    /// ภาพเล็กหลังครอป ตารางโชว์ตัวนี้ก่อน คนเห็นว่าครอปแล้วได้อะไร
    pub crop_thumb: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct Row {
    /// เลขประจำไฟล์ของหนัง (Movie.id)
    pub id: String,
    pub movie: String,
    pub title: String,
    pub has_cover: bool,
    /// sure จับคู่ได้แน่ · unsure ไม่แน่ใจ · none หาคู่ไม่เจอ · manual จับคู่เอง · saved ยืนยันแล้ว
    pub status: String,
    /// เหตุที่จับคู่ ขึ้นในตาราง
    pub reason: String,
    /// auto · board · explorer · shelf ช่องเหตุที่จับคู่บอกว่ามาจากทางไหน
    pub via: String,
    pub tall: Option<Pick>,
    pub wide: Option<Pick>,
    /// ปกตั้งครอปกลางจากรูปแนวนอนให้เอง
    pub derived_tall: bool,
    /// รูปใกล้เคียงให้กดเลือก
    pub candidates: Vec<Pick>,
    /// ชื่อคล้ายกันกี่เปอร์เซ็นต์
    pub score: u8,
    pub ticked: bool,
    /// ยืนยันแล้วล้มเพราะอะไร
    pub error: Option<String>,
    /// แถวก่อนจับคู่เอง ไว้กดย้อน
    pub prev: Option<Box<Row>>,
    /// ไฟล์ปลายทางที่มีอยู่แล้วและไม่ใช่ของโปรแกรม ไม่เขียนทับ รอเลือกทางแก้
    pub conflict: Option<String>,
    /// แถวนี้เก็บแบบอื่นแทนค่าในหน้าตั้งค่า (กดเก็บในโปรแกรมแทนตอนชื่อชน)
    pub store_override: Option<String>,
    /// ผู้ใช้แตะแถวนี้แล้ว (ครอป ติ๊ก เลือกรูป) · จับคู่อัตโนมัติรอบใหม่ห้ามทับ · แถวจากชั้นวางที่ยังไม่แตะไม่นับว่ารอยืนยัน
    pub touched: bool,
}

impl Row {
    pub fn has_image(&self) -> bool {
        self.tall.is_some() || self.wide.is_some()
    }
}

/// ชื่อเรื่องสำหรับแสดงบนกระดาน ใช้ตัวเทียบชื่อตัวเดียวกับตาราง · ตัดปี ความละเอียด ชื่อทีมทำไฟล์
#[tauri::command]
pub fn link_titles(paths: Vec<String>) -> Vec<String> {
    paths.iter().map(|p| movie_title(Path::new(p)).pretty).collect()
}

/// ของที่ลากมาเป็นโฟลเดอร์ไหม · เดาจากจุดในชื่อไม่ได้ โฟลเดอร์ชื่อ Dune.2021 มีจุดเหมือนนามสกุล
#[tauri::command]
pub fn link_is_dir(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).is_dir()).collect()
}

/// ใส่รูปลงช่องตามแนวของรูป · รูปแนวนอนเป็นปกนอนอย่างเดียว ไม่ครอปกลางเป็นปกตั้งให้เอง
/// (พี่กันเคาะ 10 พ.ย. 2569 *"ไม่ได้ ๆ ถ้ารูปไหนแนวนอน ก็ต้องแสดงแนวนอน"* · เดิมครอปกลางให้ หน้านักแสดงหลุดได้)
/// ปกตั้งที่ครอปให้เองจากรอบก่อนถูกเอาออกตอนใส่รูปแนวนอนใหม่
pub fn assign(row: &mut Row, pick: Pick) {
    if pick.width > pick.height {
        if row.derived_tall { row.tall = None; row.derived_tall = false; }
        row.wide = Some(pick);
    } else {
        row.tall = Some(pick);
        row.derived_tall = false;
    }
}



pub mod commands;
// เทสเรียกตัวช่วยในไฟล์คำสั่งผ่านที่อยู่ของโมดูลนี้ ตัวโปรแกรมเองไม่ได้ใช้ชื่อพวกนี้ผ่านทางนี้
#[allow(unused_imports)]
pub use commands::*;

mod save;
pub use save::*;

pub mod rows;
pub use rows::*;

mod images;
pub use images::*;

mod pending;
pub use pending::*;

mod matcher;
pub use matcher::*;

mod names;
pub use names::*;

#[cfg(test)]
mod tests;
