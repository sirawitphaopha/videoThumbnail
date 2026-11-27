/* ฟังก์ชันวัดของแถบเลื่อนลอย ไม่ขึ้นกับสถานะของแถบ (แยกจาก OverlayScrollbar.tsx ตอนแตะก้อนยาว 240 บรรทัด BUGS ข้อ 161 ชุด 10)
   หากล่องที่เลื่อนได้ ขอบบนที่ห้ามทับ หัวกับแถบที่ตรึงในกล่อง และกล่องที่รับได้ตอนมีหน้าต่างซ้อน */

export type Thumb = HTMLDivElement & {
  _el?: HTMLElement;
  _k?: ReturnType<typeof setTimeout>;
  _k2?: ReturnType<typeof setTimeout>;
  _drag?: boolean;
  _hov?: boolean;
};

export const NEAR = 16;
export const THICK = 7;
export const MIN_LEN = 24;
export const MIN_LEN_H = 40;

export const makeThumb = (): Thumb => {
  const d = document.createElement("div") as Thumb;
  d.className = "ovthumb";
  d.setAttribute("aria-hidden", "true");
  document.body.appendChild(d);
  return d;
};

export const topBand = () =>
  Math.max(
    document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
    ...[...document.querySelectorAll<HTMLElement>("[data-sticky-top]")].map((x) => x.getBoundingClientRect().bottom),
  );

export const scrollableV = (el: HTMLElement | null): HTMLElement | null => {
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 1) {
      const o = getComputedStyle(el).overflowY;
      if (o === "auto" || o === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
};
export const scrollableH = (el: HTMLElement | null): HTMLElement | null => {
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1 && !el.hasAttribute("data-no-ovbar")) {
      const o = getComputedStyle(el).overflowX;
      if (o === "auto" || o === "scroll") return el;
    }
    el = el.parentElement;
  }
  return null;
};

/** มีหน้าต่างซ้อนเปิดอยู่ รับเฉพาะกล่องที่อยู่ในหน้าต่าง กล่องของหน้าข้างหลังไม่ขึ้นแถบและลากไม่ได้
    (AUDIT ข้อ 146 · เดิมชี้ฉากหลังตรงขอบขวาแล้วแถบของหน้าข้างหลังโผล่ทับฉากหลัง ลากเลื่อนหน้าข้างหลังได้) */
export const allowBox = (el: HTMLElement) => {
  const dlgs = [...document.querySelectorAll<HTMLElement>("[role=dialog]")];
  return !dlgs.length || dlgs.some((d) => d.contains(el));
};

/** หัวที่ตรึงด้านบนกับแถบที่ตรึงด้านล่างของกล่อง แถบเลื่อนต้องอยู่ระหว่างสองอย่างนี้ (AUDIT ข้อ 147)
    หาจากของที่อยู่ตรงขอบบนและขอบล่างของกล่องจริงบนจอ แล้วไล่หาตัวที่ position: sticky ในกล่องนั้น
    ครอบหัวตาราง หัวหัวข้อหน้าตั้งค่า หัวหน้าข้อมูลไฟล์ แถบปุ่มล่างหน้าเสียงและซับ ฯลฯ โดยไม่ต้องติดป้ายทีละหน้า
    เดิมหักเฉพาะหัวตาราง thead th ตัวแรกที่เจอ แถบวิ่งทับหัวกับแถบปุ่มที่ตรึงแบบอื่น */
export function stickyBands(el: HTMLElement): { top: number; bottom: number } {
  const r = el.getBoundingClientRect(), x = r.left + Math.min(r.width / 2, 240);
  const band = (y: number, edge: "top" | "bottom") => {
    let e = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!e || !el.contains(e)) return 0;
    while (e && e !== el) {
      const cs = getComputedStyle(e);
      if (cs.position === "sticky" && cs[edge] !== "auto") {
        const b = e.getBoundingClientRect();
        return Math.max(0, Math.round(edge === "top" ? b.bottom - r.top : r.bottom - b.top));
      }
      e = e.parentElement;
    }
    return 0;
  };
  const top = band(r.top + 1, "top"), bottom = band(r.bottom - 2, "bottom");
  // หัวกับแถบรวมกันกินกล่องเกือบหมด ไม่หัก แถบยังมีที่ให้ลาก
  return top + bottom > el.clientHeight - MIN_LEN * 2 ? { top: 0, bottom: 0 } : { top, bottom };
}
