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
      const below = window.innerHeight - r.bottom - GAP;
      const above = r.top - visibleTop() - GAP;
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
