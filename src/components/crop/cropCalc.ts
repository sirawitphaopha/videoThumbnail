/* ค่าคงที่ ชนิด และฟังก์ชันล้วนของหน้าต่างครอป ขนาดกรอบภาพ สัดส่วนปก ตำแหน่งกรอบครอป และสูตรขยายตอนปรับเอียง
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { type Geometry, type PosterInfo, type RenderInfo } from "../../lib/api";

export const SW = 520, SH = 293;
/** เว้นขอบรอบภาพ มุมจับของกรอบครอปที่ซูม 100% ไม่โดนขอบกรอบภาพตัดครึ่ง */
export const GAP = 10;
export const PREVIEW_ROOM = 284, PREVIEW_ROOM_SHORT = 125;
/** หน้าต่างเตี้ยกว่านี้ เนื้อหาเต็มไม่พอดีกรอบ ย่อตัวอย่างลง · หน้าต่างครอปต้องไม่มีแถบเลื่อน (เล็กสุดของโปรแกรมสูง 640) */
export const SHORT_WINDOW = 799, PREVIEW_K_SHORT = 0.6, PREVIEW_K_TALL = 1.57;
/** ความสูงตารางคุณภาพ JPG */
export const TABLE_ROOM = 197;
/** แถวคุณภาพ JPG กับการ์ด PNG สูงเท่ากัน สลับชนิดไฟล์แล้วแถวข้างล่างไม่ขยับ */
export const FORMAT_ROOM = 44;
export const PADS = [{ c: "#f6dbe5", label: "ชมพูจาง" }, { c: "#000000", label: "ดำ" }, { c: "#ffffff", label: "ขาว" }];
export const QUAL_NOTE: Record<number, string> = { 100: "เท่าต้นฉบับ", 90: "แทบไม่ต่าง แนะนำ", 75: "ขอบตัวหนังสือเริ่มเบลอ", 50: "เห็นเป็นบล็อกชัด" };

export type CropChoice = { geo: Geometry; format: "jpg" | "png"; quality: number; render: RenderInfo };
export type View = { rotate: 0 | 90 | 180 | 270; flip: boolean; cx: number; cy: number; z: number; tilt: number };
export const START: View = { rotate: 0, flip: false, cx: 0.5, cy: 0.5, z: 1, tilt: 0 };
/** สัดส่วนกรอบครอป กว้างหารสูง · ปกตั้ง 2 : 3 · ปกนอน 16 : 9 */
export const TALL = 2 / 3, WIDE = 16 / 9;
/** ขยายภาพจากจุดกลางให้เต็มกรอบตอนปรับเอียง สูตรเดียวกับ tilt_fill ฝั่ง Rust ตัวอย่างบนจอตรงกับรูปจริง */
export const tiltScale = (w: number, h: number, deg: number) => {
  const t = (deg * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
};

/** ตำแหน่งภาพกับกรอบครอปในกรอบ 520 × 293 (พิกเซลบนจอ) และกรอบเป็นสัดส่วนของรูปหลังหมุน · ar สัดส่วนกรอบ กว้างหารสูง */
export function layout(info: PosterInfo, v: View, ar = TALL) {
  const sideways = v.rotate % 180 !== 0;
  const rw = sideways ? info.height : info.width, rh = sideways ? info.width : info.height;
  const s = Math.min((SW - GAP * 2) / rw, (SH - GAP * 2) / rh);
  const bw = rw * s, bh = rh * s;
  const imgL = (SW - bw) / 2, imgT = (SH - bh) / 2;
  // กรอบใหญ่สุดในรูป (ซูม 100%)
  const w0 = Math.min(bw, bh * ar);
  const boxW = w0 / v.z, boxH = boxW / ar;
  const boxL = imgL + v.cx * bw - boxW / 2, boxT = imgT + v.cy * bh - boxH / 2;
  return { s, bw, bh, imgL, imgT, w0, boxW, boxH, boxL, boxT, nx: (boxL - imgL) / bw, ny: (boxT - imgT) / bh, nw: boxW / bw, nh: boxH / bh };
}

/** จุดกลางกรอบไม่ให้กรอบหลุดออกนอกรูป */
export function clampCenter(cx: number, cy: number, L: ReturnType<typeof layout>) {
  const hw = L.boxW / L.bw / 2, hh = L.boxH / L.bh / 2;
  return { cx: Math.min(1 - hw, Math.max(hw, cx)), cy: Math.min(1 - hh, Math.max(hh, cy)) };
}

/** เปิดหน้าต่างอีกครั้ง คืนค่ากรอบเดิม */
export function fromGeo(g: Geometry, info: PosterInfo, ar = TALL): View {
  const base = { ...START, rotate: g.rotate, flip: g.flip, tilt: g.tilt ?? 0 };
  const L = layout(info, base, ar);
  const z = Math.min(4, Math.max(1, L.w0 / (g.w * L.bw)));
  return { ...base, z, cx: g.x + g.w / 2, cy: g.y + g.h / 2 };
}
