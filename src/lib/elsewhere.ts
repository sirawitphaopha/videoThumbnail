/* งานที่เริ่มไว้ก่อนเปลี่ยนหน้า (หน้าถูกถอดตอนเปลี่ยนหน้า สถานะบนจอหาย แต่งานฝั่ง Rust ยังทำต่อ) · ถามซ้ำทุก 1 วินาทีจนงานจบ
   mine = หน้านี้เป็นคนเริ่มงานเอง ไม่ต้องถาม · ใช้ทั้งค่า hash ในหน้า MediaInfo และการ์ดแยกไฟล์ในหน้าเสียงและซับ */
import { useEffect, useState } from "react";
import { inApp } from "./api";

export function useElsewhere(ask: () => Promise<boolean>, mine: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!inApp || mine) { setOn(false); return; }
    let live = true;
    let t: number | undefined;
    const tick = () => ask().then((r) => { if (!live) return; setOn(r); if (r) t = window.setTimeout(tick, 1000); }).catch(() => {});
    tick();
    return () => { live = false; clearTimeout(t); };
  }, [ask, mine]);
  return on;
}
