// เต็มจอจริงของหน้ากราฟเสียงกับหน้าบิตเรต (BUGS ข้อ 39 พี่กัน "ขอระบบขยายแบบ เจ็มจอเลย")
// ซ่อนแถบชื่อหน้าต่าง เมนูซ้าย หัวหน้า เหลือกราฟกับแถบเครื่องมือ · หน้าต่างเต็มจอผ่าน Tauri setFullscreen เท่านั้น ห้ามเรียก Windows ตรง
// ออกด้วย Esc หรือ F11 หรือปุ่มเดิม · ตัวตรวจตั้ง window.__fullDry ไม่ให้หน้าต่างเต็มจอจริง (กฎห้ามเด้งขึ้นจอตอนพี่กันลงเวร)
import { useEffect, useState } from "react";
import { inApp } from "./api";

let on = false;
const subs = new Set<(v: boolean) => void>();

export async function setFull(v: boolean) {
  if (v === on) return;
  on = v;
  document.documentElement.toggleAttribute("data-full", v);
  subs.forEach((f) => f(v));
  const dry = (window as unknown as { __fullDry?: (v: boolean) => void }).__fullDry;
  if (dry) { dry(v); return; }
  if (!inApp) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(v);
  } catch { /* สั่งหน้าต่างไม่ได้ ยังซ่อนแถบในหน้าได้ */ }
}

export function useFullscreen(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(on);
  useEffect(() => { subs.add(setV); return () => { subs.delete(setV); }; }, []);
  return [v, (n) => void setFull(n)];
}

// Esc หรือ F11 ออกจากเต็มจอ · ติดตัวดักครั้งเดียวทั้งโปรแกรม (ดักช่วงจับ ก่อนชิ้นอื่น Esc จึงไม่ไปปิดของอื่นตอนออกเต็มจอ)
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!on) return;
    if (e.key === "Escape" || e.key === "F11") { e.preventDefault(); e.stopPropagation(); void setFull(false); }
  }, true);
}
