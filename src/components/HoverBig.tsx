/* ชี้รูปเล็กแล้วขึ้นรูปใหญ่ข้างรูป · ปุ่มมุมรูปเปิดดูเต็มจอ (พี่กันสั่ง 8 พ.ย. 2569 "เอาเมาส์ชี้ต้องเเสดง popup รูปใหญ่" · "เเล้วปุ่มขยายดูแบบเต็มจอล่ะ")
   วัดที่ว่างบนจอทุกครั้งที่ชี้ ขวาไม่พอไปซ้าย บนล่างไม่ตกขอบ (popup-fit)
   วางที่ body เพราะแถวในตารางใช้ content-visibility ซึ่งตัดของที่ลอยออกนอกแถว · เมาส์ทะลุรูปใหญ่ จะได้ไม่กะพริบ
   ตัวดูรูปอยู่นอกกรอบที่ฟังเมาส์ เหตุการณ์ของ React ไหลผ่าน portal ไม่งั้นเลื่อนเมาส์ในตัวดูรูปแล้วรูปใหญ่โผล่ */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ImageViewer, { type ImageInfo } from "./ImageViewer";
import { posterApi, thumbUrl, type Geometry } from "../lib/api";
import { useToast } from "./Toasts";
import { IcExpand } from "./icons";

type Box = { left: number; top: number; w: number; h: number };
/** รูปต้นทางของตัวดูรูป · ไม่ส่ง = ดูจากภาพเล็กที่มีอยู่ เช่นปกที่อยู่ในไฟล์หนัง */
export type BigView = { path: string; geo?: Geometry | null; name: string; folder?: string | null };
const MAX_H = 360;
const MAX_W = 560;
const EDGE = 12;
const GAP = 12;

/* สีปุ่มขยายตามมุมโปสเตอร์เรื่องนั้น (พี่กันสั่ง 8 พ.ย. 2569 "ทำไว้หลายแบบ ตามสีโปสเตอร์หนัง ที่มันไม่บัง" · "ทำมให้สีมันมีความเปรียบต่าง ไม่บังรูป")
   มุมสว่าง พื้นโปร่งอ่อน ไอคอนเข้ม · มุมมืด พื้นโปร่งเข้ม ไอคอนอ่อน · ทั้งพื้นและไอคอนผสมจากสีมุมรูป · ความเปรียบต่างไอคอนกับพื้นต่ำกว่า 4.5 ใช้ดำหรือขาวล้วน
   อ่านรูปไม่ได้ ใช้สีตั้งต้นใน link.css */
type Tone = { bg: string; fg: string };
const toneMemo = new Map<string, Tone>();
const lum = (c: number[]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const contrast = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (c: number[], to: number[], t: number) => c.map((v, i) => Math.round(v + (to[i] - v) * t));
const PLATE = 0.5;
function toneOf(c: number[]): Tone {
  const light = lum(c) > 0.3, end = light ? [255, 255, 255] : [0, 0, 0], plate = mix(c, end, 0.6), under = mix(c, plate, PLATE);
  let icon = light ? mix(c, [0, 0, 0], 0.82) : mix(c, [255, 255, 255], 0.9);
  if (contrast(icon, under) < 4.5) icon = light ? [0, 0, 0] : [255, 255, 255];
  return { bg: `rgba(${plate.join(",")},${PLATE})`, fg: `rgb(${icon.join(",")})` };
}
function readCorner(src: string): Promise<number[] | null> {
  return new Promise((res) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onerror = () => res(null);
    im.onload = () => {
      try {
        const cv = document.createElement("canvas"), n = 6;
        cv.width = n; cv.height = n;
        const g = cv.getContext("2d", { willReadFrequently: true });
        if (!g) return res(null);
        const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, s = Math.max(8, Math.min(w, h) * 0.3);
        g.drawImage(im, w - s, h - s, s, s, 0, 0, n, n);
        const d = g.getImageData(0, 0, n, n).data, sum = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
        res(sum.map((v) => v / (n * n)));
      } catch { res(null); }
    };
    im.src = src;
  });
}

export default function HoverBig({ src, ratio = 2 / 3, view, name, noPop, className, children }: { src: string | null | undefined; ratio?: number; view?: BigView; name?: string; /** รูปใหญ่อยู่แล้ว มีแค่ปุ่มขยาย ไม่ขึ้นรูปใหญ่ตอนชี้ */ noPop?: boolean; className?: string; children: React.ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);
  const [full, setFull] = useState<{ rect: DOMRect; url: string; info: ImageInfo } | null>(null);
  const toast = useToast();
  const [tone, setTone] = useState<Tone | null>(null);
  useEffect(() => {
    if (!src) return;
    const known = toneMemo.get(src);
    if (known) { setTone(known); return; }
    let live = true;
    void readCorner(src).then((c) => { if (!c) return; const t = toneOf(c); toneMemo.set(src, t); if (live) setTone(t); });
    return () => { live = false; };
  }, [src]);
  if (!src) return <>{children}</>;
  const show = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let h = Math.min(MAX_H, window.innerHeight - EDGE * 2);
    let w = h * ratio;
    if (w > MAX_W) { w = MAX_W; h = w / ratio; }
    let left = r.right + GAP;
    if (left + w > window.innerWidth - EDGE) left = r.left - GAP - w;
    left = Math.max(EDGE, left);
    const top = Math.max(EDGE, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - EDGE));
    setBox({ left: Math.round(left), top: Math.round(top), w: Math.round(w), h: Math.round(h) });
  };
  const openFull = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
    setBox(null);
    if (!view) { setFull({ rect, url: src, info: { name: name ?? "ปกในไฟล์หนัง" } }); return; }
    setFull({ rect, url: "", info: { name: view.name, storage: view.folder ?? undefined } });
    posterApi.view(view.path, view.geo ?? null).then(
      (r) => setFull((f) => f && { ...f, url: thumbUrl(r.preview) ?? src, info: { ...f.info, sizeBytes: r.fileSize, format: r.ext.toUpperCase(), origDimText: `${r.width} × ${r.height} px` } }),
      (err) => { setFull(null); toast({ kind: "bad", title: "เปิดรูปไม่ได้", detail: String(err) }); },
    );
  };
  return (
    <>
      <span className={"hoverbig" + (className ? " " + className : "")} onMouseEnter={noPop ? undefined : show} onMouseLeave={noPop ? undefined : () => setBox(null)}>
        {children}
        <button type="button" className="bigbtn" title="ขยายดูเต็มจอ" aria-label="ขยายดูเต็มจอ" data-bigbtn style={tone ? { background: tone.bg, color: tone.fg } : undefined} onClick={openFull}><IcExpand size={11} /></button>
        {box && createPortal(
          <div className="bigpop" style={{ left: box.left, top: box.top, width: box.w, height: box.h }} aria-hidden="true" data-bigpop><img src={src} alt="" /></div>,
          document.body,
        )}
      </span>
      {full && <ImageViewer src={full.url} thumb={src} originRect={full.rect} info={full.info} onClose={() => setFull(null)} />}
    </>
  );
}
