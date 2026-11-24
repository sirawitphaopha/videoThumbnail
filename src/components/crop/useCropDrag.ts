/* ลากกรอบ ลากมุม ซูม หมุน ปรับเอียง ดูเต็มจอ หน้าต่างเตี้ย คัดลอกรหัสสี พิมพ์คุณภาพ และเลือกรูปใหม่
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { useEscClose } from "../../lib/popup";
import { pickFile } from "../../lib/api";
import { SW, SH, SHORT_WINDOW, START, layout, clampCenter, type View } from "./cropCalc";
import type { Cr0 } from "./cropCtx";

export function useCropDrag(hk: Cr0) {
  const { ar, info, mode, p, setQText, setQuality, setView, using, view, wideSlot } = hk;
  // ---------- ลาก ----------
  const drag = useRef<{ kind: "move" | "nw" | "ne" | "sw" | "se"; x: number; y: number; v: View } | null>(null);
  const down = (kind: "move" | "nw" | "ne" | "sw" | "se") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, x: e.clientX, y: e.clientY, v: view };
  };
  /* เต็มจอ ขยายกรอบรูปทั้งก้อน ตัวคำนวณกรอบครอปเหมือนเดิมทุกอย่าง ระยะเมาส์หารสัดส่วนขยายกลับ */
  const [full, setFull] = useState(false);
  const [fullS, setFullS] = useState(1);
  useEffect(() => {
    if (!full) return;
    const fit = () => setFullS(Math.min((window.innerWidth - 48) / SW, (window.innerHeight - 96) / SH));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [full]);
  useEscClose(full, () => setFull(false));
  const sc = full ? fullS : 1;
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const L = layout(info, d.v, ar);
    if (d.kind === "move") {
      setView({ ...d.v, ...clampCenter(d.v.cx + (e.clientX - d.x) / sc / L.bw, d.v.cy + (e.clientY - d.y) / sc / L.bh, L) });
      return;
    }
    // ลากมุม · มุมตรงข้ามอยู่กับที่ ขนาดตามระยะเมาส์ ล็อกสัดส่วนกรอบ
    const left = d.kind === "nw" || d.kind === "sw", top = d.kind === "nw" || d.kind === "ne";
    const fx = left ? L.boxL + L.boxW : L.boxL, fy = top ? L.boxT + L.boxH : L.boxT;
    const px = (left ? L.boxL : L.boxL + L.boxW) + (e.clientX - d.x) / sc;
    const py = (top ? L.boxT : L.boxT + L.boxH) + (e.clientY - d.y) / sc;
    const roomX = left ? fx - L.imgL : L.imgL + L.bw - fx, roomY = top ? fy - L.imgT : L.imgT + L.bh - fy;
    const want = Math.max(Math.abs(px - fx), Math.abs(py - fy) * ar);
    const w = Math.min(Math.max(want, L.w0 / 4), roomX, roomY * ar, L.w0);
    const h = w / ar;
    const cxPx = left ? fx - w / 2 : fx + w / 2, cyPx = top ? fy - h / 2 : fy + h / 2;
    setView({ ...d.v, z: L.w0 / w, cx: (cxPx - L.imgL) / L.bw, cy: (cyPx - L.imgT) / L.bh });
  };
  const up = () => { drag.current = null; };
  const setZoom = (z: number) => setView((v) => { const nz = Math.min(4, Math.max(1, z)); const L = layout(info, { ...v, z: nz }, ar); return { ...v, z: nz, ...clampCenter(v.cx, v.cy, L) }; });
  const turn = (by: 90 | -90) => setView((v) => ({ ...START, flip: v.flip, tilt: v.tilt, rotate: (((v.rotate + by) % 360) + 360) % 360 as View["rotate"] }));
  const setTilt = (d: number) => setView((v) => ({ ...v, tilt: Math.min(15, Math.max(-15, Math.round(d * 2) / 2)) }));
  const cropping = wideSlot || mode === "crop";
  const [short, setShort] = useState(() => window.innerHeight < SHORT_WINDOW);
  useEffect(() => {
    const on = () => setShort(window.innerHeight < SHORT_WINDOW);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  /** คัดลอกรหัสสีขอบที่เลือกเองแล้ว ติ๊กขึ้นแทนไอคอนครู่หนึ่งแบบปุ่มคัดลอกในกล่องเลือกสี */
  const [hexCopied, setHexCopied] = useState(false);
  const typeQ = (text: string) => { const t = text.replace(/\D/g, ""); setQText(t); const n = Number(t); if (n >= 1 && n <= 100) setQuality(n); };
  const pickNew = async () => { if (using) return; const f = await pickFile("image"); if (f) p.onPickImage(f); };
  return { drag, down, full, setFull, fullS, setFullS, sc, move, up, setZoom, turn, setTilt, cropping, short, setShort, hexCopied, setHexCopied, typeQ, pickNew };
}
