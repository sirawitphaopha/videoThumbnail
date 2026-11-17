/* โมเดลภาษาของ PaddleOCR ที่โหลดเพิ่มในโปรแกรม (BUGS ข้อ 152)
   แนบมาแค่อังกฤษ ไทย ญี่ปุ่น (กับจีนที่อยู่ในโมเดล PP-OCRv6 ตัวเดียวกัน) ภาษาอื่นกดโหลด
   สถานะกลางใช้ร่วมกันระหว่างหน้า OCR กับหน้าต่างตัวอ่านและชุดภาษา · โหลดได้ทีละภาษา ไม่หายเมื่อปิดหน้าต่าง */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, ocrApi, type OcrPaddleLang } from "./api";

type State = { langs: OcrPaddleLang[]; loaded: boolean; dl: { code: string; pct: number } | null; err: string | null };
let s: State = { langs: [], loaded: false, dl: null, err: null };
const subs = new Set<() => void>();
const set = (p: Partial<State>) => { s = { ...s, ...p }; subs.forEach((f) => f()); };
let listening = false;

export function usePaddleLangs(): State {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => s);
}
export function getPaddleLangs() { return s; }

/** อ่านรายชื่อภาษาที่โหลดได้กับสถานะว่ามีแล้วหรือยัง */
export async function loadPaddleLangs() {
  if (inApp && !listening) {
    listening = true;
    void listen<{ code: string; percent: number }>("ocr-paddle-progress", (e) => { if (s.dl) set({ dl: { code: e.payload.code, pct: e.payload.percent } }); });
  }
  try { set({ langs: await ocrApi.paddleLangs(), loaded: true }); } catch { set({ loaded: true }); }
}

/** ภาษานี้ยังต้องโหลดไหม (ภาษาที่แนบมาไม่อยู่ในรายชื่อ คืน null) */
export function missingLang(code: string): OcrPaddleLang | null {
  const l = s.langs.find((x) => x.code === code);
  return l && !l.have ? l : null;
}

export async function downloadPaddleLang(code: string) {
  if (s.dl) return;
  set({ err: null, dl: { code, pct: 0 } });
  try { await ocrApi.paddleDownload(code); }
  catch (e) { set({ err: String(e instanceof Error ? e.message : e) }); }
  set({ dl: null });
  await loadPaddleLangs();
}
export function cancelPaddleLang() { void ocrApi.paddleCancel(); }
export function clearPaddleErr() { set({ err: null }); }
