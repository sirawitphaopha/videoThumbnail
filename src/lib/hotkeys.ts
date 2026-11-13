/* ตัวจัดคีย์ลัดกลาง (แผนหน้าแก้ซับ ขั้น 2) · ใช้กับหน้าแก้ซับ หน้าอื่นที่ติดตั้งตัวดักเองยังใช้แบบเดิม
   จับจากตำแหน่งปุ่ม (KeyboardEvent.code) ไม่ใช่ตัวอักษร · พี่กันใช้แป้นไทย ถ้าจับจากตัวอักษร กด S ตอนแป้นเป็นไทยได้ "ห" คีย์ลัดไม่ทำงาน
   ทำงานเฉพาะตอนหน้าที่ติดตั้งเปิดอยู่ (หน้าที่ซ่อนยังติดตั้งตัวดักอยู่ · pageActive.ts)
   ตอนพิมพ์ในช่อง ข้ามคีย์ลัดทุกตัว ยกเว้นตัวที่บอกว่าใช้ในช่องได้ (Ctrl+Z ของหน้า คีย์ลัดบนแป้นตัวเลขตอนเปิดโหมด Medusa)
   มีหน้าต่างซ้อนเปิดอยู่ (body[data-dialog-open]) ข้ามทุกตัว ไม่ให้คีย์ลัดของหน้าทำงานทะลุหน้าต่าง */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export type Hotkey = {
  /** KeyboardEvent.code เช่น KeyS Space Enter Numpad5 NumpadEnter ArrowLeft F3 */
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** ใช้ได้ตอนเคอร์เซอร์อยู่ในช่องพิมพ์ */
  field?: boolean;
  run: (e: KeyboardEvent) => void;
};

export function inField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

/** หาคีย์ลัดที่ตรงกับปุ่มที่กด · ไม่ตรง = undefined */
export function match(keys: Hotkey[], e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, field: boolean) {
  return keys.find((h) => h.code === e.code && !!h.ctrl === (e.ctrlKey || e.metaKey) && !!h.shift === e.shiftKey && !!h.alt === e.altKey && (!field || h.field));
}

/** ติดตั้งคีย์ลัดของหน้า · keys อ่านค่าล่าสุดทุกครั้งที่กด ไม่ต้องติดตั้งใหม่ตอนค่าเปลี่ยน */
export function useHotkeys(keys: Hotkey[], active: RefObject<boolean>) {
  const ref = useRef(keys);
  useLayoutEffect(() => { ref.current = keys; });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!active.current || e.defaultPrevented || e.repeat && e.code === "Space") return;
      if (document.body.hasAttribute("data-dialog-open")) return;
      const h = match(ref.current, e, inField(e.target));
      if (!h) return;
      e.preventDefault();
      h.run(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [active]);
}
