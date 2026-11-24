/* วิดีโอจำลอง สีพื้นหรือตารางหมากรุก วาดบนจอและทำเป็น PNG ให้บันทึกหรือคัดลอกภาพ
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useLayoutEffect, useRef } from "react";
import { dummyLight, type DummySpec } from "../../lib/vidFrames";

/** วาดวิดีโอจำลองเต็มผืนวาด สีพื้นหรือตารางหมากรุก ช่องละ 8 จุดของภาพจริง */
export function drawDummy(el: HTMLCanvasElement, spec: DummySpec) {
  const g = el.getContext("2d")!;
  const { r: R, g: G, b: B } = spec;
  g.fillStyle = `rgb(${R},${G},${B})`; g.fillRect(0, 0, el.width, el.height);
  if (!spec.pattern) return;
  const [lr, lg, lb] = dummyLight(R, G, B);
  g.fillStyle = `rgb(${lr},${lg},${lb})`;
  const cell = (8 * el.height) / spec.h;
  for (let y = 0, row = 0; y < el.height; y += cell, row++) for (let x = 0, col = 0; x < el.width; x += cell, col++) if ((row & 1) !== (col & 1)) g.fillRect(x, y, cell + 0.5, cell + 0.5);
}
/** ภาพวิดีโอจำลองขนาดเต็มเป็น PNG ส่งให้บันทึกหรือคัดลอกภาพ */
export function dummyPng(spec: DummySpec, w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w; el.height = h;
  drawDummy(el, spec);
  return el.toDataURL("image/png");
}

/** วาดวิดีโอจำลอง สีพื้นหรือตารางหมากรุก 8 จุดตามขนาดภาพจริง */
export function DummyCanvas(p: { spec: DummySpec; w: number; h: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el) return;
    // ผืนวาดด้านยาวไม่เกิน 4,096 จุด ภาพสีพื้นกับตารางหมากรุกขยายได้ไม่เสียหน้าตา · เดิมวิดีโอจำลอง 4K ซูม 300% ได้ผืนวาดราว 17,280 จุด ใช้หน่วยความจำราว 670 MB (ผู้ช่วยตรวจทาน F22)
    const r = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(1, p.w, p.h));
    el.width = Math.max(1, Math.round(p.w * r)); el.height = Math.max(1, Math.round(p.h * r));
    drawDummy(el, p.spec);
  }, [p.spec, p.w, p.h]);
  return <canvas ref={cv} style={{ width: p.w, height: p.h, display: "block" }} data-vdummy-canvas />;
}
