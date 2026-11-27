/* ตัวช่วยร่วมของตัวดูซับ เวลา ป้าย สีภาพความถี่ (แยกจาก SubViewer.tsx ตอนไฟล์ใกล้ 600 บรรทัด BUGS ข้อ 161 ชุด 6) */
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
// ปัดเป็นหน่วยเล็กสุดก่อนแยกนาทีกับวินาที ไม่งั้น 59.96 วินาทีปัดเป็น 60.0 แต่นาทีไม่ทด ขึ้นเป็น 14:60.0 (BUGS ข้อ 141 เจอในภาพของพี่กัน 16 พ.ย. 2569)
export const ts = (t: number) => { const cs = Math.round(Math.max(0, t) * 100); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), x = (cs % 6000) / 100; return `${h}:${String(m).padStart(2, "0")}:${x.toFixed(2).padStart(5, "0")}`; };
export const short = (t: number) => { const ds = Math.round(Math.max(0, t) * 10); return `${Math.floor(ds / 600)}:${((ds % 600) / 10).toFixed(1).padStart(4, "0")}`; };
export const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
export const PER = 6;
/** สีภาพความถี่ เงียบเข้ม ดังสว่าง (โทนเดียวกับหน้ากราฟเสียง) */
export const RAMP = ["#160c22", "#4a1d5c", "#a8327a", "#ef6f6c", "#fde3a7"];
export const LUT = (() => { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const p = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(p)), f = p - k; for (let j = 0; j < 3; j++) { const a = parseInt(RAMP[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(RAMP[k + 1].slice(1 + j * 2, 3 + j * 2), 16); o[i * 3 + j] = a * (1 - f) + b * f; } } return o; })();
export const dec = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
