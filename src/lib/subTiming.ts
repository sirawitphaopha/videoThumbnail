/* ตั้งเวลาบนคลื่นเสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109 · แบบ AudioTimingControllerDialogue ของ Aegisub)
   ① ค่าตั้งของกรอบเสียง ค่าตั้งต้นตาม default_config.json ของ Aegisub จำไว้ในเครื่องของผู้ชม
   ② ขอบเวลาที่ลากไว้แต่ยังไม่ยืนยัน (pend) · กดยืนยัน (Enter หรือ G) ถึงลงบรรทัด เปลี่ยนบรรทัดก่อนยืนยันแล้วทิ้ง (Revert ของ Aegisub)
   ③ ตำแหน่งที่มองอยู่ (เวลาของหนังที่ขอบซ้ายของภาพคลื่นเสียง) กับระดับซูม
   ④ แหล่งเสียง หนังที่เปิด หรือไฟล์เสียงแยกที่ผู้ใช้เปิดเอง
   เวลาในขอบที่ลากเป็นเวลาซับ (ยังไม่บวกดีเลย์) · ตำแหน่งที่มองเป็นเวลาของหนัง */
import { useSyncExternalStore } from "react";

export type AudOpts = {
  /** ลากแล้วลงบรรทัดเลย ไม่ต้องกดยืนยัน (Audio/Auto/Commit) */
  autoCommit: boolean;
  /** กดยืนยันแล้วไปบรรทัดถัดไป (Audio/Next Line on Commit) */
  autoNext: boolean;
  /** เลือกบรรทัดแล้วภาพคลื่นเสียงเลื่อนไปหา (Audio/Auto/Scroll) */
  autoScroll: boolean;
  spectrum: boolean;
  /** คีย์ลัดบนแป้นตัวเลขใช้ได้ทุกที่ (Audio/Medusa Timing Hotkeys) */
  medusa: boolean;
  /** ผูกซูมแนวตั้งกับความดัง (Audio/Link) */
  link: boolean;
  /** ระดับซูมแนวนอน −50 ถึง 30 · 0 = 100% = 50 จุดต่อวินาที */
  hzoom: number;
  /** ซูมแนวตั้งกับความดัง 0 ถึง 100 · 50 = เท่าเดิม (ค่า ÷ 50 ยกกำลังสาม) */
  vzoom: number;
  volume: number;
  /** ความสูงภาพคลื่นเสียง (Aegisub 200 จุด · แคลร์ตั้ง 132 ให้เท่าคอลัมน์ภาพหนัง ตารางเหลือที่ที่หน้าต่าง 1280 × 800) */
  height: number;
};
export const AUD_DEFAULT: AudOpts = { autoCommit: false, autoNext: true, autoScroll: true, spectrum: false, medusa: false, link: true, hzoom: 0, vzoom: 50, volume: 50, height: 132 };

/** ตัวคูณซูมของแต่ละระดับ (GetZoomLevelFactor ของ Aegisub) */
export function zoomFactor(level: number) {
  let f = 100;
  if (level > 0) f += 25 * level;
  else if (level < 0) {
    if (level >= -5) f += 10 * level;
    else if (level >= -11) f = 50 + (level + 5) * 5;
    else f = 20 + level + 11;
    if (f <= 0) f = 1;
  }
  return f;
}
/** มิลลิวินาทีต่อหนึ่งจุด · 100% คือ 50 จุดต่อวินาที (20 ms ต่อจุด) */
export const msPerPx = (level: number) => (100 * 20) / zoomFactor(level);
/** ซูมแนวตั้งหรือความดังจากค่าตัวเลื่อน (pow(pos / 50, 3) ของ Aegisub) */
export const cube = (v: number) => Math.pow(Math.min(100, Math.max(1, v)) / 50, 3);

export type Pend = {
  id: number;
  start: number;
  end: number;
  /** บรรทัดอื่นที่ลากตามด้วย Ctrl (ขอบอยู่ที่เดียวกัน) */
  links: { id: number; start: number; end: number }[];
};
/** zero เวลาเฟรมแรกของภาพในไฟล์ วินาที · เสียงในหนังเลื่อนให้เวลา 0 ตรงเฟรมแรกของภาพแบบ Aegisub (BUGS ข้อ 115) · ไฟล์เสียงแยกไม่มี */
export type AudSource = { path: string; map: string; idx: number; name: string; own: boolean; zero?: number | null } | null;

type St = { opts: AudOpts; pend: Pend | null; left: number; own: AudSource };

const LS = "se-aud";
const load = (): AudOpts => { try { const v = JSON.parse(localStorage.getItem(LS) ?? "null"); return v && typeof v === "object" ? { ...AUD_DEFAULT, ...v } : AUD_DEFAULT; } catch { return AUD_DEFAULT; } };

let st: St = { opts: load(), pend: null, left: 0, own: null };
const subs = new Set<() => void>();
function set(p: Partial<St>) { st = { ...st, ...p }; subs.forEach((f) => f()); }
export const getTiming = () => st;
export const useTiming = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);

export function setOpt<K extends keyof AudOpts>(k: K, v: AudOpts[K]) {
  const opts = { ...st.opts, [k]: v };
  try { localStorage.setItem(LS, JSON.stringify(opts)); } catch { /* ไม่มีที่เก็บก็ใช้ได้รอบนี้ */ }
  set({ opts });
}
export const setLeft = (ms: number) => { if (ms !== st.left) set({ left: ms }); };
export const setPend = (p: Pend | null) => set({ pend: p });
export const setOwnAudio = (s: AudSource) => set({ own: s });

/** ขอบที่ใช้ตอนนี้ของบรรทัด · มีที่ลากค้างไว้ของบรรทัดนี้ใช้อันนั้น */
export function rangeOf(ev: { id: number; start: number; end: number }) {
  const p = st.pend;
  return p && p.id === ev.id ? { start: p.start, end: p.end } : { start: ev.start, end: ev.end };
}

/** ความกว้างภาพคลื่นเสียงตอนนี้ (จุด) · กรอบคลื่นเสียงบอกทุกครั้งที่เปลี่ยน ปุ่มไปที่ช่วงกับคีย์ลัดเลื่อนภาพใช้ */
let viewW = 600;
export const setViewW = (v: number) => { viewW = v; };
export const getViewW = () => viewW;

/** ให้ช่วง a ถึง b (เวลาของหนัง) อยู่ในภาพ แบบ ScrollTimeRangeInView ของ Aegisub
    เว้นขอบข้างละ 5% · อยู่ในภาพแล้วไม่ขยับ · ใส่ได้ทั้งช่วงจัดกลาง · ยาวกว่าภาพ ให้ขอบที่เห็นอยู่ชิดขอบภาพ */
export function scrollIntoView(a: number, b: number, widthPx: number, mpp: number) {
  const w = widthPx * mpp, adj = w / 20, inner = (w * 9) / 10;
  const cl = st.left + adj;
  if (a >= cl && b <= cl + inner) return;
  const len = b - a;
  let left: number;
  if (len < inner) left = a - (inner - len) / 2 - adj;
  else if (a < cl && b > cl + inner) return;
  else if (b >= cl && b < cl + inner) left = b - inner - adj;
  else left = a - adj;
  setLeft(Math.max(0, left));
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subTiming = { get: () => st, setOpt, setLeft, setPend, setOwnAudio };
