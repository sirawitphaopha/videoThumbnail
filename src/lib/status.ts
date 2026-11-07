/* สภาพไฟล์ 4 สี (สเปกข้อ 1 ตารางป้ายสี) · ใช้ที่เดียวทั้งชั้นวาง ตาราง เมนูซ้าย และหน้าตรวจไฟล์ */
import type { Movie } from "./api";
import { fmtRoughMinutes } from "./format";

export type Kind = "ok" | "warn" | "bad" | "info";

/** ถึงเวลาเตือนตรวจซ้ำหรือยัง · 0 = ไม่ต้องเตือน */
export function reminderDue(m: Movie, days: number): boolean {
  if (!days || !m.check?.at) return false;
  return Date.now() / 1000 - m.check.at > days * 86400;
}

/** สีของเรื่องหนึ่ง · แดงเสียหายมาก่อน · ไม่ใช่ MKV เป็นฟ้า · ยังไม่เคยตรวจ ไฟล์เปลี่ยน ถึงเวลาตรวจซ้ำ เป็นเหลือง */
export function kindOf(m: Movie, reminderDays: number): Kind {
  if (m.status === "bad") return "bad";
  if (m.ext !== "mkv") return "info";
  if (m.status === "unchecked" || m.status === "changed" || reminderDue(m, reminderDays)) return "warn";
  return "ok";
}

/** คำบนชั้นวาง (ป้ายอธิบายสี) */
export const SHELF_LABEL: Record<Kind, string> = {
  ok: "ไฟล์สมบูรณ์",
  warn: "ควรตรวจ (ยังไม่เคยตรวจ หรือไฟล์เปลี่ยนไป)",
  bad: "ไฟล์เสียหาย",
  info: "ยังไม่ได้ครอบเป็น MKV",
};

/** คำในตาราง */
export const TABLE_LABEL: Record<Kind, string> = { ok: "สมบูรณ์", warn: "ควรตรวจ", bad: "เสียหาย", info: "ยังไม่ได้ครอบ" };

/** ลำดับ สภาพไฟล์ ที่เสียขึ้นก่อน */
export const KIND_ORDER: Record<Kind, number> = { bad: 0, warn: 1, info: 2, ok: 3 };

/** เวลาที่คาดของการตรวจ จากขนาดและความยาวจริงของไฟล์ (แผน ค่าที่ต้นแบบยังไม่กำหนด ข้อความตรวจแบบเร็ว)
    ตรวจแบบเร็ว = อ่านทั้งไฟล์คำนวณ SHA-256 · ฮาร์ดดิสก์ราว 120 MB ต่อวินาที (ลองแล้ว SSD 410 · TECH-REVIEW)
    ตรวจละเอียด = ถอดภาพเสียงทุกช่วง ราว 15–30 เท่าของความเร็วเล่นจริง (วัดจริงกับวิดีโอ 1080p ยาว 4 นาที 21 วินาที)
    หน้าตรวจไฟล์ใช้ค่าเดียวกัน · เดิมชั้นวางใช้ 20–40 เท่า หน้าตรวจไฟล์ใช้ 15–30 เรื่องเดียวกันขึ้นเลขไม่ตรงกัน (ผู้ช่วยตรวจสเปกเจอ) */
export const FULL_SPEED = { slow: 15, fast: 30 };
export function quickEstimate(m: Movie): string {
  const sec = m.size / (120 * 1024 * 1024);
  return sec < 60 ? (sec < 10 ? "ไม่กี่วินาที" : `ราว ${Math.round(sec)} วินาที`) : fmtRoughMinutes(sec / 60);
}
export function fullEstimate(m: Movie): string {
  if (!m.duration) return "หลายนาที";
  return fmtRoughMinutes(m.duration / 60 / FULL_SPEED.fast, m.duration / 60 / FULL_SPEED.slow);
}
