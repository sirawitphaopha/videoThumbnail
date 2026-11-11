/* ตัวจัดรูปตัวเลขให้คนอ่าน ใช้ที่เดียวทั้งโปรแกรม */

/** ขนาดไฟล์แบบที่ Explorer โชว์ (ฐาน 1024) เช่น 4.21 GB */
export function fmtSize(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return i === 0 ? `${v} B` : `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${u[i]}`;
}

/** ความยาวหนัง เช่น 2 ชั่วโมง 08 นาที · หนังสั้นกว่าชั่วโมง 45 นาที 12 วินาที · สั้นกว่านาที 20 วินาที */
export function fmtDuration(sec?: number | null): string {
  if (sec == null || !isFinite(sec)) return "—"; // ค่าที่ไม่มีขึ้นขีด ไม่ใช้คำ (พี่กันเลือก 11 พ.ย. 2569)
  const s = Math.round(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h > 0) return `${h} ชั่วโมง ${String(m).padStart(2, "0")} นาที`;
  if (m > 0) return `${m} นาที ${String(r).padStart(2, "0")} วินาที`;
  return `${r} วินาที`;
}

/** เวลาเป็นนาที:วินาที หรือ ชั่วโมง:นาที:วินาที เช่น 1:12:30 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(r).padStart(2, "0")}`;
}

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** วันที่ปี พ.ศ. เช่น 6 พ.ย. 2569 เวลา 14:20 (สเปกข้อ 1) */
export function fmtDateTime(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const hh = String(d.getHours()).padStart(2, "0"), mi = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${hh}:${mi}`;
}

/** เวลาโดยประมาณเป็นคำ เช่น ไม่ถึง 1 นาที · ราว 4 นาที · ราว 3–6 นาที */
export function fmtRoughMinutes(minLow: number, minHigh?: number): string {
  const lo = Math.max(0, Math.round(minLow));
  const hi = minHigh == null ? lo : Math.max(lo, Math.round(minHigh));
  if (hi < 1) return "ไม่ถึง 1 นาที";
  if (lo === hi || lo < 1) return `ราว ${hi} นาที`;
  return `ราว ${lo}–${hi} นาที`;
}
