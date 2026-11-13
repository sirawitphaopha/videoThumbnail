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
