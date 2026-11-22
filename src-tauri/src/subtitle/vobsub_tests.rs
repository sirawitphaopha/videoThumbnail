//! เทสของ vobsub.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

#[test]
fn idx_reads_size_palette_langs_and_delay() {
    let t = "# VobSub index file, v7\nsize: 720x480\npalette: 000000, ffffff, 808080, 101010, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, 000000, ff0000\n\
id: ja, index: 0\ntimestamp: 00:00:15:516, filepos: 000000000\ndelay: 00:00:01:000\ntimestamp: 00:00:27:694, filepos: 000001000\n\
id: en, index: 1\ntimestamp: 00:01:00:000, filepos: 00000a800\n";
    let f = parse_idx(t);
    assert_eq!(f.size, (720, 480));
    assert_eq!(f.palette.len(), 16);
    assert_eq!(f.palette[15], [255, 0, 0]);
    assert_eq!(f.langs.len(), 2);
    assert_eq!(f.langs[0].code, "ja");
    assert_eq!(f.langs[0].entries[0], (15.516, 0));
    assert!((f.langs[0].entries[1].0 - 28.694).abs() < 1e-9, "ดีเลย์ต้องบวกเข้าเวลาที่ตามมา");
    assert_eq!(f.langs[0].entries[1].1, 0x1000);
    assert_eq!(f.langs[1].entries, vec![(60.0, 0xa800)]);
}

/// ภาพ 8 × 2 ที่เข้ารหัสมือ: แถวบน 3 จุดสี 1 แล้วเติมสี 0 ถึงสุดแถว · แถวล่างเต็มแถวสี 2
fn tiny_spu() -> Vec<u8> {
    let mut d = vec![0u8; 4];
    // ข้อมูลภาพเริ่มไบต์ 4 · แถวคู่: รหัส 4 บิต n=3 c=1 = 0b1101 แล้วรหัสเติมถึงสุดแถว 16 บิต 0x0000 · ขยับขอบไบต์
    let top = 4usize;
    d.extend_from_slice(&[0xD0, 0x00, 0x00]); // D | 0000 0000 0000 | 0 (เศษครึ่งไบต์ ขยับขอบ)
    let bottom = d.len();
    d.extend_from_slice(&[0x00, 0x02]); // รหัส 16 บิต n=0 c=2 = เติมทั้งแถวสี 2
    let dcsq = d.len();
    // คำสั่ง: ตั้งสี ตั้งความทึบ กรอบ 10..17 × 20..21 ที่อยู่ข้อมูล เริ่มแสดง จบ
    d.extend_from_slice(&[0x00, 0x00]);
    d.extend_from_slice(&[(dcsq >> 8) as u8, dcsq as u8]); // ชี้ตัวเองชั่วคราว แก้เป็นลำดับที่สองข้างล่าง
    d.extend_from_slice(&[0x03, 0x32, 0x10]);
    d.extend_from_slice(&[0x04, 0xFF, 0xF0]);
    d.extend_from_slice(&[0x05, 0x00, 0xA0, 0x11, 0x01, 0x40, 0x15]);
    d.extend_from_slice(&[0x06, (top >> 8) as u8, top as u8, (bottom >> 8) as u8, bottom as u8]);
    d.push(0x01);
    d.push(0xFF);
    // ลำดับที่สอง หยุดแสดงหลัง 90 หน่วย (90 << 10 / 90 ms = 1.024 วินาที)
    let dcsq2 = d.len();
    d.extend_from_slice(&[0x00, 90, (dcsq2 >> 8) as u8, dcsq2 as u8, 0x02, 0xFF]);
    d[dcsq + 2] = (dcsq2 >> 8) as u8;
    d[dcsq + 3] = dcsq2 as u8;
    let n = d.len();
    d[0] = (n >> 8) as u8;
    d[1] = n as u8;
    d[2] = (dcsq >> 8) as u8;
    d[3] = dcsq as u8;
    d
}

#[test]
fn spu_commands_and_rle() {
    let d = tiny_spu();
    let s = parse_spu(&d).expect("อ่านคำสั่งได้");
    assert_eq!(s.area, (10, 20, 17, 21));
    assert_eq!(s.colors, [0, 1, 2, 3]);
    assert_eq!(s.contrast, Some([0, 15, 15, 15]));
    assert!((s.delay.unwrap() - 1.024).abs() < 1e-9);
    let (w, h, px) = decode_indices(&d, &s);
    assert_eq!((w, h), (8, 2));
    assert_eq!(&px[..8], &[1, 1, 1, 0, 0, 0, 0, 0]);
    assert_eq!(&px[8..], &[2; 8]);
    let rgba = spu_rgba(&s, &[[9, 9, 9], [200, 0, 0], [0, 200, 0], [0, 0, 200], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3], [0; 3]]);
    assert_eq!(rgba[0][3], 0, "พื้นใส");
    assert_eq!(rgba[1], [200, 0, 0, 255]);
}

#[test]
fn packs_are_joined_and_other_streams_skipped() {
    let spu = tiny_spu();
    // แบ่ง SPU เป็นสองแพ็ก มีแพ็กของสตรีม 0x21 คั่นกลาง
    let pack = |id: u8, body: &[u8]| -> Vec<u8> {
        let mut v = vec![0, 0, 1, 0xBA, 0x44, 0, 4, 0, 4, 1, 1, 0x89, 0xC3, 0xF8];
        let len = 3 + 1 + body.len();
        v.extend_from_slice(&[0, 0, 1, 0xBD, (len >> 8) as u8, len as u8, 0x81, 0x00, 0x00, id]);
        v.extend_from_slice(body);
        v
    };
    let half = spu.len() / 2;
    let mut sub = pack(0x20, &spu[..half]);
    sub.extend(pack(0x21, &[1, 2, 3, 4]));
    sub.extend(pack(0x20, &spu[half..]));
    assert_eq!(spu_at(&sub, 0).as_deref(), Some(&spu[..]));
}

/// ซับ VobSub ญี่ปุ่นของ Shin Godzilla ที่พี่กันให้ (ห้ามขึ้น git) · ตั้ง MOVIE_SHELF_VOBSUB=<ไฟล์ .idx>
/// เทียบจำนวนภาพกับในไฟล์ .idx และจับเวลาอ่านทั้งไฟล์
#[test]
fn real_vobsub_file() {
    let Ok(p) = std::env::var("MOVIE_SHELF_VOBSUB") else { eprintln!("ข้าม ไม่ได้ตั้ง MOVIE_SHELF_VOBSUB"); return };
    let idx = parse_idx(&String::from_utf8_lossy(&std::fs::read(&p).unwrap()));
    let sub = std::fs::read(Path::new(&p).with_extension("sub")).unwrap();
    let t = std::time::Instant::now();
    let shows = read(&idx, &sub, 0, &|_| {});
    let n = idx.langs[0].entries.len();
    eprintln!("อ่าน {} จาก {} ภาพ ใน {:.2} วินาที · จอ {:?}", shows.len(), n, t.elapsed().as_secs_f64(), idx.size);
    assert!(shows.len() + 5 >= n, "ภาพหายเกินห้าภาพ");
    let vert = shows.iter().filter(|s| s.img.height() > s.img.width()).count();
    eprintln!("ภาพแนวตั้ง {vert}");
    if let Ok(out) = std::env::var("MOVIE_SHELF_VOBSUB_DUMP") {
        for s in shows.iter().take(40) { let _ = s.img.save(Path::new(&out).join(format!("{:08.3}.png", s.start))); }
    }
}
