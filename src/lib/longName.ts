/* ชื่อที่ยาวเกินช่อง แทนจุดสามจุด (BUGS ข้อ 51 ส่วนที่ค้าง · มอคอัป docs/mockups/ellipsis-pick.html)
   พี่กันเลือก 15 พ.ย. 2569 "เอาทุกตัว กดเปลี่ยนได้ที่หน้าตังค่า เเต่เเบบ 4 คือตัวหลัก"
   slide แบบ 4 จางท้าย ชี้แล้วชื่อค่อย ๆ เลื่อนให้อ่านจบ (ค่าตั้งต้น) · fade แบบ 2 จางท้าย
   year แบบ 3 ชื่อใต้ปกจางกลางชื่อ เก็บปีไว้ท้าย · two แบบ 1 ชื่อใต้ปกขึ้นสองบรรทัด · สองแบบนี้จุดอื่นจางท้ายแบบ 2
   ตัวกลางที่เดียว ดูทุกจุดที่เคยตัดท้ายเป็นจุดสามจุด (LONG_SEL) ติดป้าย data-ov ให้กล่องที่ชื่อล้น แล้ว app.css จัดตามแบบ
   data-ov="m" จางด้วยหน้ากาก · "c" กล่องมีพื้นหรือเส้นขอบ จางแล้วพื้นหายไปด้วย จึงตัดเฉย ๆ แล้วเลื่อนตอนชี้
   เก็บในเครื่อง (long-name) แบบเดียวกับค่าตั้งของหน้ากราฟ */
import { useEffect, useState } from "react";

export type LongName = "slide" | "fade" | "year" | "two";
const KEY = "long-name";
const MODES: LongName[] = ["slide", "fade", "year", "two"];

/** ทุกจุดที่เคยตัดท้ายเป็นจุดสามจุด · จุดใหม่ที่ตัดชื่อยาวเพิ่มที่นี่ */
export const LONG_SEL = [
  ".bn1", ".lvchips .ft", ".lvchips.tight .lvchip", ".runline .runtxt b", ".runline .runl1", ".runline .runl2", ".fchip .nm", ".lab span",
  ".wavelg .lgnote", ".thanklink", ".psdchecks .psdck-txt", ".cpcmp-grid .a", ".cpcmp-grid .b", ".avchip .nm", ".avchip .meta",
  ".lrow .en", ".avfoot-sum", ".cqrow .nm", ".cqrow .dt", ".cmpchip .meta", ".cmpchip .nm .nmtx", "[data-extract] .xdest > b",
  ".subpage-bar .subpage-name", ".pathline b", ".lname .fn", "[data-subedit] .se-grid .se-cut", ".se-saveas .se-path", ".se-auto .se-cut",
  ".se-fontlist button", "[data-subedit] .se-pgs .se-path", "[style*=\"text-overflow: ellipsis\"]",
].join(",");

export function longNameNow(): LongName {
  try { const v = localStorage.getItem(KEY) as LongName | null; if (v && MODES.includes(v)) return v; } catch { /* ไม่มีที่เก็บ */ }
  return "slide";
}

const subs = new Set<(v: LongName) => void>();
export function setLongName(v: LongName) {
  try { localStorage.setItem(KEY, v); } catch { /* เก็บไม่ได้ ใช้ค่านี้ถึงปิดโปรแกรม */ }
  document.documentElement.dataset.longname = v;
  subs.forEach((f) => f(v));
  schedule();
}
export function useLongName(): LongName {
  const [v, setV] = useState(longNameNow);
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV); }; }, []);
  return v;
}

/** กล่องที่มีพื้นหรือเส้นขอบ จางด้วยหน้ากากแล้วพื้นหายไปด้วย */
const hasBox = (cs: CSSStyleDeclaration) => {
  const bg = cs.backgroundColor;
  const clear = bg === "transparent" || /rgba\([^)]*,\s*0\)$/.test(bg);
  return !clear || (parseFloat(cs.borderRightWidth) > 0 && cs.borderRightStyle !== "none");
};

/** ดูทุกกล่องว่าชื่อล้นไหม แล้วติดป้าย · ชื่อใต้ปกแบบสองบรรทัดดูความสูง */
function scan() {
  pending = false;
  const two = document.documentElement.dataset.longname === "two";
  for (const el of document.querySelectorAll<HTMLElement>(LONG_SEL)) {
    if (!el.isConnected || el.clientWidth === 0) continue;
    const tall = two && el.classList.contains("bn1");
    // แบบเก็บปีไว้ท้าย ส่วนชื่อเรื่องเป็นกล่องลูกที่ล้นแทนตัวกล่องเอง
    const inner = el.querySelector<HTMLElement>(".bn1-t");
    const box = inner ?? el;
    const over = tall ? el.scrollHeight > el.clientHeight + 1 : box.scrollWidth > box.clientWidth + 1;
    if (!over) { if (el.dataset.ov) { delete el.dataset.ov; el.style.removeProperty("--ov"); el.style.removeProperty("--ovt"); } continue; }
    const cs = getComputedStyle(el);
    const kind = tall ? "t" : cs.direction === "rtl" ? "r" : hasBox(cs) ? "c" : "m";
    if (el.dataset.ov !== kind) el.dataset.ov = kind;
    // ระยะที่ต้องเลื่อนให้เห็นท้ายชื่อ ความเร็วราว 60 จุดต่อวินาที
    const dist = box.scrollWidth - box.clientWidth + 16;
    el.style.setProperty("--ov", dist + "px");
    el.style.setProperty("--ovt", Math.max(1.2, dist / 60).toFixed(2) + "s");
  }
}
let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(scan);
}

/** เรียกครั้งเดียวตอนเปิดโปรแกรม (main.tsx) · ดูใหม่เมื่อหน้าจอเปลี่ยน ขนาดหน้าต่างเปลี่ยน หรือฟอนต์โหลดเสร็จ */
export function startLongName() {
  document.documentElement.dataset.longname = longNameNow();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("resize", schedule);
  document.fonts?.ready.then(schedule).catch(() => {});
  schedule();
  // ตัวตรวจเรียกได้ (check-longname)
  (window as unknown as Record<string, unknown>).__longName = { set: setLongName, now: longNameNow, scan };
}
