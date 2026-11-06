/* กติกากลางของหน้าต่างซ้อนและของที่กาง (web-craft 6.24) · ยกจาก warfarin-dash lib/popup.ts
   ① เมนูเลือกค่า (ดรอปดาวน์ กล่องการแสดงผล) กดข้างนอกแล้วปิดได้
   ② แผงที่มีงานค้าง (หน้าต่างยืนยันลบ หน้าต่างครอป) กดข้างนอกห้ามปิด
   🚨 ทั้งสองชนิดต้องปิดด้วย Esc ได้เสมอ */
import { useEffect, type RefObject } from "react";

/** ปิดด้วยปุ่ม Esc · ดักที่หน้าต่าง ไม่ใช่ที่กล่อง เพราะโฟกัสอาจอยู่ที่ปุ่มข้างนอก */
export function useEscClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}

/** กดข้างนอกแล้วปิด · ใช้กับเมนูเลือกค่าเท่านั้น · ดักตอนกดลง ไม่ใช่ตอนปล่อย */
export function useClickOutside(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
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
