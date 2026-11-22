//! โครงไฟล์ อ่านหัวไฟล์ MKV MP4 AVI FLV ว่าไฟล์ขาดท้ายไหม
//! แยกจาก check/mod.rs ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 12) ย้ายมาทั้งก้อน · ของที่ mod.rs กับไฟล์ข้างกันใช้ร่วม เติม pub(crate) เท่าที่ตัวคอมไพล์ต้องการ
use super::*;

// ---------- โครงไฟล์ ----------

#[derive(Debug, Clone, PartialEq)]
pub enum Structure {
    Complete,
    /// ขาดท้าย · หายไปกี่ไบต์ (รู้เมื่อหัวไฟล์บอกขนาดไว้)
    Truncated(Option<u64>),
    /// โครงไฟล์เสีย บอกเหตุผล
    Broken(String),
    /// ตัดสินจากโครงไม่ได้ บอกเหตุผล
    Unknown(&'static str),
}

/// เหตุที่ตรวจแบบเร็วบอกไม่ได้ว่าไฟล์ครบ · ต่อท้ายคำว่า "เพราะ" ในข้อความผล
const UNKNOWN_TS: &str = "ไฟล์ชนิดนี้ไม่ได้จดขนาดไว้ในหัวไฟล์";
const UNKNOWN_SIZE: &str = "หัวไฟล์ไม่ได้บอกขนาด";

pub(crate) fn ext_of(path: &Path) -> String {
    path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
}

/// อ่านโครงไฟล์ตามชนิด · อ่านแค่หัวกับหัวกล่อง ไม่อ่านทั้งไฟล์
pub fn structure(path: &Path) -> Result<Structure, String> {
    let mut f = File::open(path).map_err(|e| format!("เปิดไฟล์ไม่ได้: {e}"))?;
    let size = f.metadata().map_err(|e| format!("อ่านขนาดไฟล์ไม่ได้: {e}"))?.len();
    let r = match ext_of(path).as_str() {
        "mkv" | "webm" => ebml(&mut f, size),
        "mp4" | "mov" | "m4v" => boxes(&mut f, size),
        "avi" => riff(&mut f, size),
        "flv" => flv(&mut f, size),
        _ => Ok(Structure::Unknown(UNKNOWN_TS)),
    };
    r.map_err(|e| format!("อ่านโครงไฟล์ไม่ได้: {e}"))
}

fn read_at(f: &mut File, pos: u64, n: usize) -> std::io::Result<Vec<u8>> {
    f.seek(SeekFrom::Start(pos))?;
    let mut b = vec![0u8; n];
    let mut got = 0;
    while got < n {
        let k = f.read(&mut b[got..])?;
        if k == 0 {
            break;
        }
        got += k;
    }
    b.truncate(got);
    Ok(b)
}

/// ตัวเลขยาวแปรผันของ EBML · คืน (ค่า, ยาวกี่ไบต์, เป็นค่าพิเศษแปลว่าไม่ระบุขนาด)
pub(crate) fn vint(b: &[u8], i: usize) -> Option<(u64, usize, bool)> {
    let first = *b.get(i)?;
    if first == 0 {
        return None;
    }
    let len = first.leading_zeros() as usize + 1;
    if i + len > b.len() {
        return None;
    }
    let mask = (0xFFu16 >> len) as u8;
    let mut v = (first & mask) as u64;
    let mut ones = first & mask == mask;
    for k in 1..len {
        v = (v << 8) | b[i + k] as u64;
        ones &= b[i + k] == 0xFF;
    }
    Some((v, len, ones))
}

/// MKV WebM · หัว EBML ตามด้วย Segment ที่บอกขนาดเนื้อทั้งหมด · ขนาดพิเศษ (บิต 1 ทั้งหมด) แปลว่าไม่ระบุ ไม่ใช่ขาดท้าย
fn ebml(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let b = read_at(f, 0, 256)?;
    let broken = |w: &str| Ok(Structure::Broken(w.into()));
    if b.len() < 16 || b[..4] != [0x1A, 0x45, 0xDF, 0xA3] {
        return broken("หัวไฟล์ไม่ใช่แบบ MKV");
    }
    let Some((hs, hl, _)) = vint(&b, 4) else { return broken("หัวไฟล์เสีย") };
    let i = 4 + hl + hs as usize;
    if i + 5 > b.len() {
        return broken("หัวไฟล์เสีย");
    }
    if b[i..i + 4] != [0x18, 0x53, 0x80, 0x67] {
        return broken("ไม่เจอส่วนเนื้อหนังต่อจากหัวไฟล์");
    }
    let Some((ss, sl, unknown)) = vint(&b, i + 4) else { return broken("หัวไฟล์เสีย") };
    if unknown {
        return Ok(Structure::Unknown(UNKNOWN_SIZE));
    }
    let need = (i + 4 + sl) as u64 + ss;
    Ok(if size < need { Structure::Truncated(Some(need - size)) } else { Structure::Complete })
}

/// MP4 MOV M4V · กล่องชั้นบนสุดต่อกันจนจบไฟล์ กล่องไหนยาวเลยท้ายไฟล์ = ขาดท้าย · ต้องมีสารบัญ moov
fn boxes(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let (mut pos, mut moov) = (0u64, false);
    while pos < size {
        let h = read_at(f, pos, 16)?;
        if h.len() < 8 {
            return Ok(Structure::Truncated(None));
        }
        let mut len = u32::from_be_bytes([h[0], h[1], h[2], h[3]]) as u64;
        let kind = [h[4], h[5], h[6], h[7]];
        if len == 1 {
            if h.len() < 16 {
                return Ok(Structure::Truncated(None));
            }
            len = u64::from_be_bytes([h[8], h[9], h[10], h[11], h[12], h[13], h[14], h[15]]);
        } else if len == 0 {
            len = size - pos;
        }
        if len < 8 {
            return Ok(Structure::Broken(format!("ขนาดกล่อง {} เพี้ยน", String::from_utf8_lossy(&kind))));
        }
        if &kind == b"moov" {
            moov = true;
        }
        if pos + len > size {
            return Ok(Structure::Truncated(Some(pos + len - size)));
        }
        pos += len;
    }
    Ok(if moov { Structure::Complete } else { Structure::Broken("ไม่มีสารบัญของไฟล์ (moov) เล่นไม่ได้".into()) })
}

/// AVI · ก้อน RIFF ต่อกัน (ก้อนแรก AVI ก้อนต่อไป AVIX สำหรับไฟล์ใหญ่) ก้อนไหนยาวเลยท้ายไฟล์ = ขาดท้าย
fn riff(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let (mut pos, mut first) = (0u64, true);
    while pos + 12 <= size {
        let h = read_at(f, pos, 12)?;
        if &h[0..4] != b"RIFF" {
            if first {
                return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ AVI".into()));
            }
            break;
        }
        if first && &h[8..12] != b"AVI " {
            return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ AVI".into()));
        }
        let len = u32::from_le_bytes([h[4], h[5], h[6], h[7]]) as u64;
        let end = pos + 8 + len + (len & 1);
        // ก้อนสุดท้ายยาวคี่ บางโปรแกรมไม่เติมไบต์ปิดท้าย ไม่นับว่าขาด
        if end > size && !(len & 1 == 1 && end == size + 1) {
            return Ok(Structure::Truncated(Some(end - size)));
        }
        pos = end;
        first = false;
    }
    Ok(if first { Structure::Broken("ไฟล์สั้นผิดปกติ".into()) } else { Structure::Complete })
}

/// FLV · 4 ไบต์ท้ายไฟล์บอกความยาวก้อนสุดท้าย ย้อนไปต้องเจอหัวก้อนภาพ เสียง หรือข้อมูล ไม่เจอ = ท้ายไฟล์ไม่ครบ
fn flv(f: &mut File, size: u64) -> std::io::Result<Structure> {
    let h = read_at(f, 0, 9)?;
    if h.len() < 9 || &h[0..3] != b"FLV" {
        return Ok(Structure::Broken("หัวไฟล์ไม่ใช่แบบ FLV".into()));
    }
    if size < 9 + 4 + 15 {
        return Ok(Structure::Truncated(None));
    }
    let t = read_at(f, size - 4, 4)?;
    let prev = u32::from_be_bytes([t[0], t[1], t[2], t[3]]) as u64;
    if prev == 0 || prev + 4 + 13 > size {
        return Ok(Structure::Truncated(None));
    }
    let ty = read_at(f, size - 4 - prev, 1)?.first().map(|b| b & 0x1F).unwrap_or(0);
    Ok(if [8, 9, 18].contains(&ty) { Structure::Complete } else { Structure::Truncated(None) })
}

pub(crate) fn truncated_text(missing: Option<u64>) -> String {
    match missing {
        Some(n) => format!("ไฟล์ขาดท้าย หายไปราว {} จากขนาดที่หัวไฟล์บอก  ไฟล์น่าจะโหลดมาไม่ครบ", human(n)),
        None => "ไฟล์ขาดท้ายเพราะท้ายไฟล์ไม่ครบ  ไฟล์น่าจะโหลดมาไม่ครบ".into(),
    }
}

