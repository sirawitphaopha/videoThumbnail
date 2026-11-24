/* ประวัติรุ่นของตัวแปลงที่แนบมากับโปรแกรม แสดงท้ายหัวข้อตัวแปลงเสียงในหน้าตั้งค่า
   BUGS ข้อ 159 พี่กันสั่ง 24 พ.ย. 2569 "การอัปเดตเวอร์ชั่นของไฟล์ต่างๆ สร้างเเละใส่ประวัติที่หน้านี้ด้วยหน่อย"
   วันที่และรุ่นเอามาจากประวัติ git ของ scripts/fetch-tools.ps1 กับ vendor/README.md
   🔴 อัปเดตตัวแปลงเมื่อไหร่ เติมแถวบนสุดของตารางนี้ทุกครั้ง เรียงจากล่าสุดลงไป (ตัวตรวจ check-settings เช็กลำดับ) */

export type EncChange = {
  /** ชื่อตัวแปลงตามที่คนใช้รู้จัก */
  tool: string;
  /** รุ่นเดิม ไม่มีคือแนบมาครั้งแรก */
  from?: string;
  to: string;
  /** ประโยคต่อท้ายอธิบายเพิ่ม */
  note?: string;
};
export type EncHistoryRow = { date: string; iso: string; changes: EncChange[] };

export const ENC_HISTORY: EncHistoryRow[] = [
  { date: "24 พ.ย. 2569", iso: "2026-11-24", changes: [
    { tool: "Monkey's Audio", from: "13.46", to: "13.50" },
    { tool: "FFmpeg", from: "9.0.2", to: "9.1" },
  ] },
  { date: "10 พ.ย. 2569", iso: "2026-11-10", changes: [
    { tool: "qaac", to: "3.07", note: "ซึ่งต้องติดตั้ง iTunes ก่อนใช้" },
    { tool: "refalac", to: "3.07" },
  ] },
  { date: "8 พ.ย. 2569", iso: "2026-11-08", changes: [
    { tool: "Monkey's Audio", from: "12.36", to: "13.46", note: "โดยถอดจากตัวติดตั้งของผู้ทำ เพราะในชุด SDK เป็นรุ่นเก่า" },
    { tool: "TAK", to: "2.3.3" },
  ] },
  { date: "7 พ.ย. 2569", iso: "2026-11-07", changes: [
    { tool: "flac", to: "1.5.0" },
    { tool: "opusenc", to: "libopus 1.6.1" },
    { tool: "lame", to: "4.0" },
    { tool: "wavpack", to: "5.9.0" },
    { tool: "Monkey's Audio", to: "12.36", note: "จากชุด SDK 13.45" },
  ] },
  { date: "6 พ.ย. 2569", iso: "2026-11-06", changes: [
    { tool: "FFmpeg", to: "9.0.2" },
  ] },
];
