//! เทสของ ape.rs · แยกออกจากท้ายไฟล์ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 ขั้น 11) เนื้อเทสไม่เปลี่ยน
use super::*;

/// ทุกรหัสในตาราง APE_ERROR_* ของ SDK 13.46 (Shared/All.h) มีประโยคไทย ไม่ตกไปข้อความรหัสที่ไม่มีคำอธิบาย (BUGS ข้อ 150)
#[test]
fn mac_codes_in_thai() {
    for c in [1000, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1012, 1013, 1014, 1015, 1016, 2000, 3000, 3001, 3002, 4000, 5000, 6000] {
        let s = mac_reason(c);
        assert!(!s.contains("รหัส"), "{c} {s}");
    }
    assert!(mac_reason(1001).starts_with("เขียนไฟล์ .ape ไม่ได้"));
    assert!(mac_reason(1011).contains("ตอบรหัส 1011"), "รหัสที่ไม่มีในตารางยังบอกเลขไว้ให้ไล่ต่อ");
}

#[test]
fn ape_tag_layout() {
    let t = ape_tag(&[
        ApeItem { key: "Title".into(), value: "ฝนแรก".as_bytes().to_vec(), binary: false },
        ApeItem { key: "Cover Art (Front)".into(), value: b"cover.jpg\0\xff\xd8\xff".to_vec(), binary: true },
        ApeItem { key: "Empty".into(), value: vec![], binary: false },
    ]);
    assert_eq!(&t[..8], b"APETAGEX");
    assert_eq!(&t[t.len() - 32..t.len() - 24], b"APETAGEX");
    let size = u32::from_le_bytes(t[12..16].try_into().unwrap()) as usize;
    assert_eq!(size, t.len() - 32, "ขนาดในหัวนับช่องข้อมูลกับตัวท้าย ไม่นับหัว");
    assert_eq!(u32::from_le_bytes(t[16..20].try_into().unwrap()), 2, "ช่องว่างไม่เขียน");
    assert_eq!(u32::from_le_bytes(t[20..24].try_into().unwrap()), 0xA000_0000);
    assert_eq!(u32::from_le_bytes(t[t.len() - 12..t.len() - 8].try_into().unwrap()), 0x8000_0000);
    // ช่องแรกเป็นตัวหนังสือ (เรียงตัวหนังสือก่อนรูป)
    assert_eq!(u32::from_le_bytes(t[32..36].try_into().unwrap()) as usize, "ฝนแรก".len());
    assert_eq!(&t[40..46], b"Title\0");
}

#[test]
fn wav_head_skips_list_chunk() {
    let mut w = Vec::new();
    w.extend_from_slice(b"RIFF\xff\xff\xff\xffWAVE");
    w.extend_from_slice(b"LIST\x05\x00\x00\x00abcde\x00");
    w.extend_from_slice(b"fmt \x10\x00\x00\x00");
    w.extend_from_slice(&1u16.to_le_bytes());
    w.extend_from_slice(&6u16.to_le_bytes());
    w.extend_from_slice(&48000u32.to_le_bytes());
    w.extend_from_slice(&(48000u32 * 18).to_le_bytes());
    w.extend_from_slice(&18u16.to_le_bytes());
    w.extend_from_slice(&24u16.to_le_bytes());
    w.extend_from_slice(b"data\xff\xff\xff\xff\x01\x02\x03");
    let mut r: &[u8] = &w;
    assert_eq!(read_wav_head(&mut r).unwrap(), (6, 48000, 24));
    assert_eq!(r, &[1, 2, 3], "อ่านหัวแล้วเหลือเสียงดิบพอดี");
}

#[test]
fn mac_dll_loads_and_reports_version() {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tools");
    let v = version(&dir).expect("เปิด MACDll64.dll ได้");
    // DLL ในชุด SDK 13.45 และ 13.46 ตอบรุ่น 12.36 · ตัวที่ fetch-tools ดึงจากตัวติดตั้ง 13.46 ต้องตอบ 13.46 ขึ้นไป (ลองจริง 8 พ.ย. 2569)
    let key: Vec<u32> = v.split('.').map(|x| x.parse().unwrap_or(0)).collect();
    assert!(key >= vec![13, 46], "รุ่น {v} · รัน scripts/fetch-tools.ps1 ใหม่ให้ได้ DLL จากตัวติดตั้ง");
    Mac::load(&dir).expect("มีคำสั่งบีบเสียงครบ");
}
