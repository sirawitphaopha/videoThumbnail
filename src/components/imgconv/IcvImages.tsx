/* ภาพซับวางบนจอ ภาพเฉพาะตัวซับแบบขนาดจริงหรือขยายสองเท่าที่เลื่อนตามกัน และกรอบส่วนที่มีภาพจริง
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";

export type Part = { png: string; x: number; y: number; w: number; h: number };
/** กรอบของส่วนที่มีภาพจริง (จุดที่ไม่ใส) บนจอ · ffmpeg กับ BDSup2Sub++ เว้นขอบใสรอบภาพไม่เท่ากัน
    ตัวเลขใต้ภาพนับจากส่วนนี้ ภาพต้นฉบับกับภาพที่จะได้จึงเทียบกันได้ตรง ๆ (เจอตอนตรวจ 15 พ.ย. 2569 ภาพตรงกันแต่ป้ายบอก 1329 กับ 1439) */
export function useInk(parts: Part[] | null): { x: number; y: number; w: number; h: number } | null {
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const key = parts ? parts.map((g) => `${g.png.length}:${g.png.slice(-32)}:${g.x}:${g.y}:${g.w}:${g.h}`).join("|") : "";
  useEffect(() => {
    if (!parts || !parts.length) { setBox(null); return; }
    let live = true;
    void Promise.all(parts.map(async (g) => {
      const im = new Image(); im.src = g.png; await im.decode();
      const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext("2d"); if (!c || !cv.width || !cv.height) return null;
      c.drawImage(im, 0, 0);
      const px = c.getImageData(0, 0, cv.width, cv.height).data;
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (px[(y * cv.width + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const sx = g.w / cv.width, sy = g.h / cv.height;
      return x1 < 0 ? null : { x0: g.x + x0 * sx, y0: g.y + y0 * sy, x1: g.x + (x1 + 1) * sx, y1: g.y + (y1 + 1) * sy };
    })).then((bs) => {
      if (!live) return;
      const v = bs.filter((b): b is NonNullable<typeof b> => !!b);
      if (!v.length) { setBox(null); return; }
      const x = Math.round(Math.min(...v.map((b) => b.x0))), y = Math.round(Math.min(...v.map((b) => b.y0)));
      setBox({ x, y, w: Math.round(Math.max(...v.map((b) => b.x1))) - x, h: Math.round(Math.max(...v.map((b) => b.y1))) - y });
    }, () => { if (live) setBox(null); });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

/** เฉพาะตัวซับ ตัดตามส่วนที่มีภาพจริง หนึ่งจุดของภาพเท่าหนึ่งจุดบนหน้าต่าง หรือขยาย 2 เท่าแบบเห็นจุดภาพชัด
    (พี่กันขอ 15 พ.ย. 2569 "อยากให้สามารถเลือกดู เฉพาะตัวซับได้ด้วย … เพราะอยากเอาไว้ดูความละเอียดของซับที่เปลี่ยน")
    เลื่อนกรอบหนึ่งแล้วอีกกรอบเลื่อนตามสัดส่วน ดูส่วนเดียวกันของต้นฉบับกับผลได้ทันที */
export function Crop(p: { parts: Part[]; box: { x: number; y: number; w: number; h: number }; zoom: number; data: string; el: React.RefObject<HTMLDivElement | null>; other: React.RefObject<HTMLDivElement | null> }) {
  const z = p.zoom;
  const sync = () => {
    const a = p.el.current, b = p.other.current;
    if (!a || !b || a.dataset.syncing === "1") return;
    const fx = a.scrollWidth > a.clientWidth ? a.scrollLeft / (a.scrollWidth - a.clientWidth) : 0;
    const fy = a.scrollHeight > a.clientHeight ? a.scrollTop / (a.scrollHeight - a.clientHeight) : 0;
    b.dataset.syncing = "1";
    b.scrollLeft = fx * (b.scrollWidth - b.clientWidth);
    b.scrollTop = fy * (b.scrollHeight - b.clientHeight);
    requestAnimationFrame(() => { delete b.dataset.syncing; });
  };
  // จับลากด้วยเมาส์เลื่อนดูส่วนที่ล้นกรอบ อีกกรอบเลื่อนตามผ่าน onScroll (พี่กันขอ 15 พ.ย. 2569 "เราขอเอาเมาส์จับลากซ้ายขวาได้")
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = p.el.current;
    if (!a || e.button !== 0 || (a.scrollWidth <= a.clientWidth && a.scrollHeight <= a.clientHeight)) return;
    drag.current = { x: e.clientX, y: e.clientY, l: a.scrollLeft, t: a.scrollTop };
    a.setPointerCapture(e.pointerId);
    a.classList.add("grabbing");
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = p.el.current, d = drag.current;
    if (!a || !d) return;
    a.scrollLeft = d.l - (e.clientX - d.x);
    a.scrollTop = d.t - (e.clientY - d.y);
  };
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    p.el.current?.classList.remove("grabbing");
    if (p.el.current?.hasPointerCapture(e.pointerId)) p.el.current.releasePointerCapture(e.pointerId);
  };
  return (
    <div ref={p.el} className={"icv-crop" + (z > 1 ? " zoom" : "")} onScroll={sync} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} data-icv-crop={p.data}>
      <div className="icv-cropin" style={{ width: p.box.w * z, height: p.box.h * z }}>
        {p.parts.map((g, i) => <img key={i} src={g.png} alt="" style={{ left: (g.x - p.box.x) * z, top: (g.y - p.box.y) * z, width: g.w * z, height: g.h * z }} />)}
      </div>
    </div>
  );
}

/** ภาพซับหนึ่งภาพวางบนจอขนาด cw × ch ตามตำแหน่งจริง · พื้นตารางหมากรุกมืด */
export function Frame(p: { cw: number; ch: number; parts: Part[]; data?: string }) {
  return (
    <div className="icv-frame" style={{ aspectRatio: `${Math.max(1, p.cw)} / ${Math.max(1, p.ch)}` }} data-icv-frame={p.data}>
      {p.parts.map((g, i) => <img key={i} src={g.png} alt="" style={{ left: `${(g.x / p.cw) * 100}%`, top: `${(g.y / p.ch) * 100}%`, width: `${(g.w / p.cw) * 100}%`, height: `${(g.h / p.ch) * 100}%` }} />)}
    </div>
  );
}
