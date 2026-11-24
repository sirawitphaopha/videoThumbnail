/* ของระดับไฟล์ของกรอบคลื่นเสียง สีภาพความถี่ คำอธิบาย ⓘ แผ่นรูปคลื่นที่ขอแล้ว ป้ายเวลาใต้ภาพ และชนิดของ props กับการลาก
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { type SubDoc, type SubEvent } from "../../lib/api";
import { type Tip } from "../../lib/codecAdv";
import { type AudSource, type Pend } from "../../lib/subTiming";

/** สีภาพความถี่ เงียบเข้ม ดังสว่าง (โทนเดียวกับหน้ากราฟเสียง) · เป็นเนื้อหาของกราฟ ไม่เปลี่ยนตามโทนสี */
export const RAMP = ["#160c22", "#4a1d5c", "#a8327a", "#ef6f6c", "#fde3a7"];
export const LUT = (() => { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const q = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(q)), f = q - k; for (let j = 0; j < 3; j++) { const a = parseInt(RAMP[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(RAMP[k + 1].slice(1 + j * 2, 3 + j * 2), 16); o[i * 3 + j] = a * (1 - f) + b * f; } } return o; })();
export const WAVE_TIP: Tip = {
  w: "แถบสีจางคือเวลาของแต่ละบรรทัด เลขบนแถบคือลำดับบรรทัด แถบเข้มคือบรรทัดที่กำลังแก้ เส้นแดงคือเวลาเริ่ม เส้นน้ำเงินคือเวลาจบ  เส้นประสีม่วงคือ keyframe ซึ่งมักตรงจุดเปลี่ยนฉาก เส้นสีเขียวคือตำแหน่งของภาพหนัง และเส้นสีเทาเข้มคือจุดที่กำลังเล่นเสียง  ลากเส้นแดงหรือเส้นน้ำเงินเพื่อเปลี่ยนเวลา กดซ้ายที่ว่างเริ่มช่วงใหม่ กดขวาตั้งเวลาจบ แล้วกดยืนยัน (Enter หรือ G) เวลาถึงลงบรรทัด",
  o: [
    ["Ctrl กับลาก", "ลากขอบของบรรทัดอื่นที่อยู่ตรงเดียวกันไปด้วย", "บรรทัดที่ต่อกันยังต่อกัน", "ต้องกดตรงขอบที่ซ้อนกันพอดี"],
    ["Alt กับลาก", "เลื่อนทั้งบรรทัด ความยาวเท่าเดิม", "ย้ายซับที่ยาวพอดีแล้วไปที่ใหม่", "—"],
    ["Shift ระหว่างลาก", "ปิดการดูดติดเส้นชั่วคราว ปกติขอบที่ลากดูดติด keyframe ขอบเฟรม และขอบบรรทัดอื่นที่ห่างไม่เกิน 8 จุด", "วางขอบตรงที่ต้องการได้ละเอียด", "—"],
  ],
  r: "ล้อเมาส์เลื่อนซ้ายขวา Ctrl กับล้อซูม ปุ่มกลางของเมาส์พาภาพหนังไปเวลานั้น",
};
export const SLIDER_TIP: Tip = {
  w: "แถบเลื่อนตั้งสามอันข้างคลื่นเสียง ลากขึ้นเพิ่ม ลากลงลด",
  o: [
    ["ซูมแนวนอน", "ถ่างหรือหดเวลาบนจอ 100% คือ 50 จุดต่อวินาที ถ่างได้ถึง 850%", "ซูมเข้าวางขอบเวลาได้ละเอียด", "ซูมมากเห็นช่วงสั้นลง"],
    ["ซูมแนวตั้ง", "ขยายความสูงของคลื่น เสียงเบาก็เห็นชัด", "เห็นจุดเริ่มพูดของเสียงเบา", "ขยายมากคลื่นเสียงดังล้นกรอบ"],
    ["ความดัง", "ความดังตอนเล่นเสียงในหน้านี้", "ฟังเสียงพูดเบาได้ชัด", "—"],
  ],
  r: "เปิดโซ่ไว้ ซูมแนวตั้งกับความดังเลื่อนพร้อมกัน แบบค่าตั้งต้นของ Aegisub",
};

export const TILE = 512;
/** แผ่นรูปคลื่นที่ขอแล้ว เก็บตามลำดับใช้ล่าสุด ไม่เกิน 300 แผ่น */
export const tiles = new Map<string, number[]>();
export const inflight = new Set<string>();
export const putTile = (k: string, v: number[]) => { tiles.delete(k); tiles.set(k, v); while (tiles.size > 300) tiles.delete(tiles.keys().next().value!); };

export const fmtRuler = (ms: number, step: number) => {
  const s = Math.max(0, ms / 1000), m = Math.floor(s / 60), sec = s - m * 60;
  return step >= 1000 ? `${m}:${String(Math.round(sec)).padStart(2, "0")}` : `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

export type Props = {
  doc: SubDoc;
  ev: SubEvent | null;
  sel: number[];
  delayMs: number;
  /** เสียงของหนัง (ไม่มี = null) · ไฟล์เสียงแยกที่ผู้ใช้เปิดมาแทนอยู่ใน store */
  movie: AudSource;
  noAudio: string;
  /** ยืนยันอัตโนมัติหลังปล่อยเมาส์ (เปิดยืนยันทันทีอยู่) */
  onAutoCommit: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** ปุ่มกลางของเมาส์ พาภาพหนังไปเวลานี้ (เวลาของหนัง ms) */
  onSeekVideo: (ms: number) => void;
};

export type Drag =
  | { k: "edge"; fixed: number; moving: number; links: Pend["links"]; linkSide: ("start" | "end")[]; cand: number[] }
  | { k: "shift"; clicked: number; base: { start: number; end: number }; cand: number[] };
