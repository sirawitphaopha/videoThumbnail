/* ตัววัดที่ว่างก่อนกาง — ของที่กางออกจากปุ่มหรือช่องทุกชิ้นต้องผ่านตัวนี้ (สกิล popup-fit กฎคลุม)
   ยกจาก warfarin-dash lib/dropPlacement.ts กับ lib/fitPopup.ts
   ห้ามเขียน top: calc(100% + 6px) หรือ maxHeight ตายตัวในของที่กางเอง
   กล่องที่กางต้องติดคลาส pop-in เสมอ ทั้งเพื่อแอนิเมชันและให้คำสั่งตรวจหาเจอ */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

const GAP = 12;

/** ขอบล่างของแถบที่ตรึงไว้บนสุด · โปรแกรมนี้คือแถบชื่อ (header) กับแถบที่ติด data-sticky-top */
export function visibleTop(): number {
  return Math.max(
    0,
    document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
    ...[...document.querySelectorAll<HTMLElement>("[data-sticky-top]")].map((x) => x.getBoundingClientRect().bottom),
  );
}

export type Placement = { up: boolean; max: number };

/** ขอบบนกับขอบล่างที่กล่องที่กางเห็นได้จริง · กล่องที่ตัดของล้น (แผงขวา หน้าต่างซ้อน กล่องเลื่อน) ที่ครอบอยู่ตัดของที่กางแบบวางในกล่องด้วย
    เดิมวัดถึงขอบหน้าต่างอย่างเดียว รายการภาษาในแผงขวาโดนตัดส่วนล่างราว 200 px (AUDIT 12 พ.ย. 2569 ข้อ 18) */
function clipEdges(el: HTMLElement): { top: number; bottom: number } {
  let top = visibleTop(), bottom = window.innerHeight;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "visible") continue;
    const r = p.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

/** วัดว่ากล่องที่กางควรลงล่างหรือพลิกขึ้น และสูงได้เท่าไหร่ · วัดใหม่เมื่อเนื้อในเปลี่ยนความสูง ย่อหน้าต่าง หรือเลื่อน */
export function useDropPlacement(
  open: boolean,
  wrapRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
): Placement {
  const [place, setPlace] = useState<Placement>({ up: false, max: 9999 });
  const last = useRef(place);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const wrap = wrapRef.current;
      const panel = panelRef.current;
      if (!wrap || !panel) return;
      const r = wrap.getBoundingClientRect();
      const need = panel.scrollHeight;
      // กล่องที่วางแบบลอยบนสุดของหน้า (fixed) ไม่โดนกล่องที่ครอบตัด วัดถึงขอบหน้าต่าง · แบบวางในกล่องวัดถึงขอบกล่องที่ตัดของล้น
      const edge = getComputedStyle(panel).position === "fixed" ? { top: visibleTop(), bottom: window.innerHeight } : clipEdges(wrap);
      const below = edge.bottom - r.bottom - GAP;
      const above = r.top - edge.top - GAP;
      const up = need > below && above > below;
      const max = Math.max(140, up ? above : below);
      if (last.current.up === up && last.current.max === max) return;
      last.current = { up, max };
      setPlace({ up, max });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, wrapRef, panelRef]);

  return place;
}

/** สไตล์ตำแหน่งของกล่องที่กาง ใช้คู่กับ useDropPlacement เสมอ */
export function dropStyle(place: Placement) {
  return {
    ...(place.up ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
    maxHeight: place.max,
  } as const;
}

/* ---------------------------------------------------------------- แนวนอน
   ของที่กางยึดขอบซ้ายหรือขวาของปุ่ม แล้วกว้างกว่าปุ่ม กางเลยขอบพื้นที่เนื้อหาไปทับเมนูซ้ายหรือล้นขวาได้
   (พี่กันส่งภาพ 14 พ.ย. 2569 "ทับ" เมนูวิดีโอหน้าแก้ซับยึดขวากว้าง 330 จุด กางทับเมนูซ้ายของโปรแกรม)
   ตัวนี้วัดขอบซ้ายขวาที่เห็นได้จริง (กล่องที่ครอบซึ่งตัดของล้นแนวนอน เช่นกรอบหน้าที่อยู่ขวาของเมนูซ้าย) แล้วขยับกล่องเข้ามา */
const SIDE_GAP = 8;
function sideEdges(el: HTMLElement): { left: number; right: number } {
  let left = 0, right = window.innerWidth;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    if (getComputedStyle(p).overflowX === "visible") continue;
    const r = p.getBoundingClientRect();
    left = Math.max(left, r.left);
    right = Math.min(right, r.right);
  }
  return { left, right };
}
export type Side = { left: number } | null;
/** ตำแหน่งแนวนอนของกล่องที่กาง (กล่องวางแบบ absolute ในกรอบ position relative ที่ครอบปุ่ม) · anchor ขอบที่ยึดเมื่อที่พอ
    คืน left เทียบกับกรอบที่ครอบ · วัดหลังวาดก่อนจอติด ไม่เห็นกระโดด · วัดใหม่เมื่อกล่องเปลี่ยนความกว้างหรือย่อหน้าต่าง */
export function useSideFit(open: boolean, wrapRef: RefObject<HTMLElement | null>, panelRef: RefObject<HTMLElement | null>, anchor: "left" | "right",
  /** ขอบขวาที่ห้ามเลย (ตำแหน่งบนจอ) เช่นดรอปดาวน์ที่ห้ามบังชิ้นข้างขวา (keepLeftOf ของ Dropdown) */
  limitRight?: () => number | null | undefined): Side {
  const [side, setSide] = useState<Side>(null);
  const last = useRef<Side>(null);
  const lim = useRef(limitRight);
  lim.current = limitRight;
  useLayoutEffect(() => {
    if (!open) { last.current = null; setSide(null); return; }
    const measure = () => {
      const wrap = wrapRef.current, panel = panelRef.current;
      if (!wrap || !panel) return;
      const r = wrap.getBoundingClientRect(), w = panel.offsetWidth;
      const e = sideEdges(wrap);
      let x = anchor === "left" ? r.left : r.right - w;
      x = Math.min(x, e.right - SIDE_GAP - w);
      const l = lim.current?.();
      if (l != null) x = Math.min(x, l - w);
      x = Math.max(x, e.left + SIDE_GAP);
      const next = { left: Math.round(x - r.left) };
      if (last.current?.left === next.left) return;
      last.current = next;
      setSide(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (panelRef.current) ro.observe(panelRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [open, wrapRef, panelRef, anchor]);
  return side;
}
/** สไตล์แนวนอนคู่กับ useSideFit · ยังไม่ได้วัดใช้ขอบที่ยึด */
export const sideStyle = (side: Side, anchor: "left" | "right") => (side ? { left: side.left } : anchor === "left" ? { left: 0 } : { right: 0 });
