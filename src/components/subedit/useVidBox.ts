/* ค่าหลักของกรอบภาพหนัง ความกว้างที่ขยายได้ ขนาดภาพจริง ขนาดที่แสดง กรอบ และความสูงภาพที่ขอ
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { setFitPct, useVid, vidKeys, vidRate, vidSrc } from "../../lib/vidFrames";
import { FIT_W, FIT_H, TOOLBAR_W, BAR_MIN, AUD_SIDE, type Props } from "./vidShared";

export function useVidBox(p: Props) {
  const st = useVid();
  const src = vidSrc(st);
  const fr = vidRate(st);
  const keys = vidKeys(st);
  const t = st.table;
  const d = p.delayMs;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(FIT_W);
  const [img, setImg] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const lastPos = useRef<number | null>(null);

  // ความกว้างที่ภาพขยายได้ เหลือที่ให้คลื่นเสียงอย่างน้อย 360 จุด แผงซูมกับความดังข้างคลื่น 78 จุด (AUD_SIDE) กับแถบเครื่องมือซ้ายของภาพ (TOOLBAR_W)
  // เดิมกัน 380 รวมแผงข้างคลื่นที่เพิ่มมาตอนขั้น 5 คลื่นจริงเหลือ 302 จุดตอนเมนูซ้ายกางที่ 1280 × 800 (เจอตอนรันตัวตรวจชุด BUGS ข้อ 113 ถึง 121)
  useLayoutEffect(() => {
    const top = host.current?.parentElement;
    if (!top) return;
    const fit = () => setAvail(Math.max(160, top.clientWidth - 360 - AUD_SIDE - 14 - TOOLBAR_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(top);
    return () => ro.disconnect();
  }, []);

  // ขนาดภาพจริง (คิดอัตราส่วนภาพที่ไฟล์บอก) แล้วคิดขนาดที่แสดง
  const natH = src.kind === "dummy" ? src.spec.h : t?.h || 360;
  const natW0 = src.kind === "dummy" ? src.spec.w : t?.w || 640;
  const dar = t?.dar && /^\d+:\d+$/.test(t.dar) && !t.dar.startsWith("0:") ? t.dar.split(":").map(Number) : null;
  const natW = src.kind !== "dummy" && dar ? Math.round((natH * dar[0]) / dar[1]) : natW0;
  const fitS = Math.min(FIT_W / natW, FIT_H / natH);
  useEffect(() => setFitPct(fitS * 100), [fitS]);
  const z = st.zoom;
  // ขยายเนื้อภาพในกรอบเดิม (Ctrl กับล้อเมาส์ content zoom ของ Aegisub) 0.125 ถึง 10 เท่า กรอบคิดจากขนาดภาพที่เลือก ไม่ขยายตาม
  // รีเซ็ตการเลื่อนภาพคืนเป็น 1 (ResetContentZoom) · เปลี่ยนหนังคืนเป็น 1
  const [cz, setCz] = useState(1);
  const czMovie = src.kind === "movie" ? src.path : src.kind;
  useEffect(() => setCz(1), [czMovie]);
  const baseW = z ? (natW * z) / 100 : natW * fitS;
  const baseH = z ? (natH * z) / 100 : natH * fitS;
  const imgW = Math.max(1, Math.round(baseW * cz));
  const imgH = Math.max(1, Math.round(baseH * cz));
  const boxW = z ? Math.min(Math.max(Math.round(baseW), 160), avail) : FIT_W;
  // พื้นดำรอบกรอบภาพกว้างพอให้แถบใต้ภาพวางปุ่มครบแถวเดียว กรอบภาพยังเท่าภาพ พิกัดของเครื่องมือบนภาพกับการขยายเนื้อภาพไม่เปลี่ยน
  // (เดิมขยายตัวกรอบเอง ภาพวางกลางกรอบ ขยายเนื้อภาพนิดเดียวแล้วเลื่อนให้จุดที่ชี้อยู่ใต้เมาส์ไม่ได้ เจอใน check-subvtools)
  const wrapW = Math.max(boxW, Math.min(avail, BAR_MIN - TOOLBAR_W));
  const boxH = z ? Math.min(Math.max(Math.round(baseH), 90), Math.max(FIT_H, Math.round(window.innerHeight * 0.45))) : FIT_H;
  // ความสูงภาพที่ขอ ปัดเป็นขั้นละ 30 จุด ภาพขนาดใกล้กันใช้ภาพที่เก็บไว้ร่วมกันได้ ไม่เกินขนาดจริง
  const reqH = Math.max(90, Math.min(Math.min(natH, 2160), Math.ceil((imgH * (window.devicePixelRatio || 1)) / 30) * 30));
  return { st, src, fr, keys, t, d, host, view, avail, setAvail, img, setImg, fail, setFail, lastPos, natH, natW0, dar, natW, fitS, z, cz, setCz, czMovie, baseW, baseH, imgW, imgH, boxW, wrapW, boxH, reqH, p };
}
