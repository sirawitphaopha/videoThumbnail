/* ตัวจัดคีย์ลัดกลาง (แผนหน้าแก้ซับ ขั้น 2) · ใช้กับหน้าแก้ซับ หน้าอื่นที่ติดตั้งตัวดักเองยังใช้แบบเดิม
   จับจากตำแหน่งปุ่ม (KeyboardEvent.code) ไม่ใช่ตัวอักษร · พี่กันใช้แป้นไทย ถ้าจับจากตัวอักษร กด S ตอนแป้นเป็นไทยได้ "ห" คีย์ลัดไม่ทำงาน
   ทำงานเฉพาะตอนหน้าที่ติดตั้งเปิดอยู่ (หน้าที่ซ่อนยังติดตั้งตัวดักอยู่ · pageActive.ts)
   ตอนพิมพ์ในช่อง ข้ามคีย์ลัดทุกตัว ยกเว้นตัวที่บอกว่าใช้ในช่องได้ (Ctrl+Z ของหน้า คีย์ลัดบนแป้นตัวเลขตอนเปิดโหมด Medusa)
   มีหน้าต่างซ้อนเปิดอยู่ (body[data-dialog-open]) ข้ามทุกตัว ไม่ให้คีย์ลัดของหน้าทำงานทะลุหน้าต่าง ยกเว้นตัวที่บอก dialog ไว้
   คีย์ของคำสั่งที่มี id มาจากทะเบียนกลาง keymap.ts อ่านตอนกดทุกครั้ง ตั้งใหม่ในหน้าตั้งค่าแล้วใช้ได้ทันที (BUGS ข้อ 162.3) */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { browserBlocked } from "./browserKeys";
import { comboOf, isKey, typingKey } from "./keymap";

export type Hotkey = {
  /** รหัสคำสั่งในทะเบียน keymap.ts · มีแล้วคีย์มาจากทะเบียน (ที่ตั้งเองในหน้าตั้งค่า) ไม่ใช้ code ctrl shift alt (BUGS ข้อ 162.3) */
  id?: string;
  /** KeyboardEvent.code เช่น KeyS Space Enter Numpad5 NumpadEnter ArrowLeft F3 · ใช้เมื่อไม่มี id */
  code?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** ใช้ได้ตอนเคอร์เซอร์อยู่ในช่องพิมพ์ */
  field?: boolean;
  /** ข้ามตอนโฟกัสอยู่ที่ปุ่ม (Enter Space กดปุ่มนั้นตามปกติ) */
  noButton?: boolean;
  /** ใช้ได้แม้มีหน้าต่างซ้อนเปิด เมื่อหน้าต่างนั้นตรงตัวเลือกนี้ เช่น F3 ค้นต่อไปตอนหน้าต่างค้นหาเปิด (BUGS ข้อ 162.2) */
  dialog?: string;
  run: (e: KeyboardEvent) => void;
};

export function inField(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
}

/** หาคีย์ลัดที่ตรงกับปุ่มที่กด · ไม่ตรง = undefined */
export function match(keys: Hotkey[], e: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, field: boolean) {
  // คีย์จากทะเบียนที่เป็นคีย์พิมพ์ (ตั้งเองเป็นตัวอักษรเดี่ยว) ไม่ทำงานในช่อง แม้คำสั่งบอกว่าใช้ตอนพิมพ์ได้
  return keys.find((h) => (h.id ? isKey(e, h.id) && !(field && typingKey(comboOf(e) ?? "")) : h.code === e.code && !!h.ctrl === (e.ctrlKey || e.metaKey) && !!h.shift === e.shiftKey && !!h.alt === e.altKey) && (!field || h.field));
}

/** ติดตั้งคีย์ลัดของหน้า · keys อ่านค่าล่าสุดทุกครั้งที่กด ไม่ต้องติดตั้งใหม่ตอนค่าเปลี่ยน */
export function useHotkeys(keys: Hotkey[], active: RefObject<boolean>) {
  const ref = useRef(keys);
  useLayoutEffect(() => { ref.current = keys; });
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      // ตัวกันคีย์ลัดของเบราว์เซอร์ในตัวจริง (main.tsx) ติดป้าย defaultPrevented ไว้ก่อน ไม่นับว่าตัวดักอื่นใช้แป้นนี้ไปแล้ว (browserKeys.ts)
      if (!active.current || (e.defaultPrevented && !browserBlocked.has(e)) || e.repeat && e.code === "Space") return;
      // มีหน้าต่างซ้อนเปิด ใช้ได้เฉพาะคีย์ที่บอกว่าใช้กับหน้าต่างนั้นได้
      const dlg = document.body.hasAttribute("data-dialog-open");
      const list = dlg ? ref.current.filter((k) => k.dialog && document.querySelector(k.dialog)) : ref.current;
      if (!list.length) return;
      const h = match(list, e, inField(e.target));
      if (!h) return;
      // Enter กับ Space ตอนโฟกัสอยู่ที่ปุ่ม ให้ปุ่มทำงานตามปกติ ไม่เอาไปเป็นคีย์ลัดของหน้า
      // ข้ามเฉพาะ Enter Space ลูกศร ที่ปุ่มใช้เอง คีย์อื่นของคำสั่งเดียวกัน (G S) ยังทำงานแม้โฟกัสอยู่ที่ปุ่ม แบบเดิมก่อนย้ายเข้าทะเบียน
      if (h.noButton && /^(Enter|NumpadEnter|Space|Arrow)/.test(e.code) && (e.target as HTMLElement | null)?.closest?.("button, a, [role='button'], [role='option']")) return;
      e.preventDefault();
      h.run(e);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [active]);
}
