/* กติกากลางของหน้าต่างซ้อนและของที่กาง (web-craft 6.24) · ยกจาก warfarin-dash lib/popup.ts
   ① เมนูเลือกค่า (ดรอปดาวน์ กล่องการแสดงผล) กดข้างนอกแล้วปิดได้
   ② แผงที่มีงานค้าง (หน้าต่างยืนยันลบ หน้าต่างครอป) กดข้างนอกห้ามปิด
   🚨 ทั้งสองชนิดต้องปิดด้วย Esc ได้เสมอ */
import { useEffect, useRef, type RefObject } from "react";

/* ชั้นของที่ปิดด้วย Esc · กดหนึ่งครั้งปิดเฉพาะชั้นบนสุด (ชั้นที่เปิดทีหลังสุด)
   เดิมทุกชั้นดักที่หน้าต่างแยกกัน กดครั้งเดียวทำงานทุกตัวตามลำดับที่ลงทะเบียน หน้าต่างแผงลงทะเบียนก่อนดรอปดาวน์ข้างใน
   กด Esc ตอนดรอปดาวน์ในแผงตั้งค่าเสียงกางอยู่ แผงปิดทั้งแผง ค่าที่ตั้งหาย (ตัวตรวจ check-av เจอ 8 พ.ย. 2569) */
const escStack: { close: () => void }[] = [];
let escBound = false;
function onEsc(e: KeyboardEvent) {
  if (e.key !== "Escape" || !escStack.length) return;
  e.stopPropagation();
  escStack[escStack.length - 1].close();
}

/** ปิดด้วยปุ่ม Esc · ดักที่หน้าต่าง ไม่ใช่ที่กล่อง เพราะโฟกัสอาจอยู่ที่ปุ่มข้างนอก · ปิดเฉพาะชั้นบนสุด */
export function useEscClose(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return;
    const layer = { close: () => latest.current() };
    escStack.push(layer);
    if (!escBound) { window.addEventListener("keydown", onEsc); escBound = true; }
    return () => {
      const i = escStack.lastIndexOf(layer);
      if (i >= 0) escStack.splice(i, 1);
    };
  }, [open]);
}

/** กดข้างนอกแล้วปิด · ใช้กับเมนูเลือกค่าเท่านั้น · ดักตอนกดลง ไม่ใช่ตอนปล่อย */
export function useClickOutside(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      // กดในกล่องคำอธิบายที่เปิดจากปุ่ม ⓘ ในเมนู ไม่นับว่ากดข้างนอก (กล่องอยู่นอกเมนูเพราะวาดที่ body) ไม่งั้นเมนูปิดแล้วกล่องหายตาม
      if ((e.target as Element | null)?.closest?.(".infotip")) return;
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, ref, close]);
}

/** ตัวช่วยให้ของที่ไม่ใช่ปุ่มกดด้วยคีย์บอร์ดได้ (web-craft 6.5) · Space ต้อง preventDefault */
export function kb(fn: (e: React.SyntheticEvent) => void) {
  return {
    onClick: fn,
    role: "button" as const,
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); }
    },
  };
}
