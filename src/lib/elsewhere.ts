/* งานที่เริ่มไว้ก่อนเปลี่ยนหน้า (หน้าถูกถอดตอนเปลี่ยนหน้า สถานะบนจอหาย แต่งานฝั่ง Rust ยังทำต่อ) · ถามซ้ำทุก 1 วินาทีจนงานจบ
   mine = หน้านี้เป็นคนเริ่มงานเอง ไม่ต้องถาม · ใช้ทั้งค่า hash ในหน้า MediaInfo และการ์ดแยกไฟล์ในหน้าเสียงและซับ */
import { useEffect, useState } from "react";
import { inApp } from "./api";
import { usePageActive } from "./pageActive";

export function useElsewhere(ask: () => Promise<boolean>, mine: boolean) {
  const [on, setOn] = useState(false);
  // ถามใหม่ทุกครั้งที่หน้ากลับมาให้เห็น หน้าที่เปิดค้างไว้ในเมนูอื่นจะรู้งานที่เริ่มจากหน้าอื่นระหว่างนั้น (AUDIT ข้อ 127 · เดิมถามแค่ตอนเปิดหน้า)
  const active = usePageActive();
  useEffect(() => {
    if (!active) return;
    if (!inApp || mine) { setOn(false); return; }
    let live = true;
    let t: number | undefined;
    const tick = () => ask().then((r) => { if (!live) return; setOn(r); if (r) t = window.setTimeout(tick, 1000); }).catch(() => {});
    tick();
    return () => { live = false; clearTimeout(t); };
  }, [ask, mine, active]);
  return on;
}
