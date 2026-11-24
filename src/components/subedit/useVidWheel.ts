/* ล้อเมาส์บนภาพแบบ Aegisub ปรับขนาดภาพ ขยายเนื้อภาพ เลื่อนภาพ และวางจุดที่ชี้ไว้ใต้เมาส์
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useRef } from "react";
import { setZoom } from "../../lib/vidFrames";
import type { Vd1 } from "./vidCtx";

export function useVidWheel(hk: Vd1) {
  const { boxH, boxW, cz, fitS, imgH, imgW, setCz, st, view } = hk;
  // ล้อเมาส์บนภาพตามค่าตั้งต้นของ Aegisub (default_config.json Video Scroll Action · VideoDisplay::OnMouseWheel)
  // หมุนเปล่า ปรับขนาดภาพทีละ 12.5% ได้ 12.5% ถึง 1000% (นับเป็นรอบล้อ ทัชแพดสะสมจนครบรอบ)
  // Ctrl ขยายเนื้อภาพในกรอบเดิม ตรงจุดที่ชี้อยู่ที่เดิม · Shift เลื่อนภาพขึ้นลง 5 จุดต่อรอบล้อ · Ctrl กับ Shift ไม่ทำอะไร
  // ตัวดักแบบไม่ passive ถึงจะกันหน้าเลื่อนได้ · ใช้ค่าล่าสุดผ่าน ref ไม่ต้องผูกตัวดักใหม่ทุกครั้งที่ขนาดเปลี่ยน
  const wheelAcc = useRef(0);
  const anchor = useRef<{ u: number; v: number; mx: number; my: number } | null>(null);
  const centerNext = useRef(false);
  const wheelNow = useRef<(e: WheelEvent) => void>(() => {});
  wheelNow.current = (e: WheelEvent) => {
    if (e.ctrlKey && e.shiftKey) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1;
    const dy = e.deltaY * k, dx = e.deltaX * k;
    const v = view.current;
    if (!v) return;
    if (e.shiftKey) {
      // Chromium เปลี่ยนล้อแนวตั้งที่กด Shift เป็นแนวนอน · Aegisub เลื่อนภาพแนวตั้งตามรอบล้อ
      const n = -(dy !== 0 ? dy : dx) / 100;
      v.scrollTop -= 5 * n;
      return;
    }
    if (e.ctrlKey) {
      const n = -dy / 100;
      const next = Math.min(10, Math.max(0.125, cz * (1 + 0.125 * n)));
      if (next === cz) return;
      const r = v.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const lw = Math.max(imgW, boxW), lh = Math.max(imgH, boxH);
      anchor.current = { u: (v.scrollLeft + mx - (lw - imgW) / 2) / imgW, v: (v.scrollTop + my - (lh - imgH) / 2) / imgH, mx, my };
      setCz(next);
      return;
    }
    wheelAcc.current += -dy;
    const steps = Math.trunc(wheelAcc.current / 100);
    if (!steps) return;
    wheelAcc.current -= steps * 100;
    const now = st.zoom || Math.max(12.5, Math.round((fitS * 100) / 12.5) * 12.5);
    setZoom(Math.min(1000, Math.max(12.5, now + 12.5 * steps)));
  };
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelNow.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // หลังขนาดเนื้อภาพเปลี่ยน เลื่อนให้จุดที่ชี้อยู่ใต้เมาส์ที่เดิม (ZoomAndPan) · รีเซ็ตแล้ววางภาพกลางกรอบ
  useLayoutEffect(() => {
    const v = view.current;
    if (!v) return;
    const a = anchor.current;
    if (a) {
      anchor.current = null;
      const lw = Math.max(imgW, boxW), lh = Math.max(imgH, boxH);
      v.scrollLeft = (lw - imgW) / 2 + a.u * imgW - a.mx;
      v.scrollTop = (lh - imgH) / 2 + a.v * imgH - a.my;
    } else if (centerNext.current) {
      centerNext.current = false;
      v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
      v.scrollTop = (v.scrollHeight - v.clientHeight) / 2;
    }
  }, [imgW, imgH, boxW, boxH]);
  return { wheelAcc, anchor, centerNext, wheelNow };
}
