/* มุมมอง ซูม จุดกลาง ซูมแนวตั้ง และการจับลาก
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../../lib/settings";
import { View } from "./common";
import { RUL_W } from "./draw";
import { useGrab } from "./parts";
import { HZ_MIN } from "./zoom";
import type { G1 } from "./graphCtx";

export function useGraphView(c: G1) {
  const { boxEl, center, dur, setCenter, setHover, setPref, setWin, setZoom, view, zoom, zoomOf } = c;
  // ซูมแยกแต่ละกราฟ สลับไปกราฟที่ยังไม่เคยซูมเริ่มทั้งไฟล์ สลับกลับซูมเดิมยังอยู่ · ติ๊กซูมเหมือนกันทุกกราฟ ใช้ช่วงเดียวกันหมด
  const { settings, update: updateSettings } = useSettings();
  const zoomAll = settings?.graphZoomAll ?? false;
  const switchView = (k: View) => {
    if (k === view) return;
    if (!zoomAll) {
      zoomOf.current[view] = { zoom, center };
      const s = zoomOf.current[k];
      setZoom(s?.zoom ?? "all");
      setCenter(s?.center ?? dur / 2);
      setWin(null);
    }
    setPref("view", k);
  };
  const span = zoom === "all" ? dur : Math.min(dur, zoom);
  const rt0 = Math.max(0, Math.min(dur - span, center - span / 2)), rt1 = rt0 + span;
  /* ตัวซูม ตัวเลื่อน แบบหน้าดูคลื่นของ Audacity (พี่กัน *"พวกตัวซูม พวกตัวขยาย ตัวเลื่อนซ้ายขวา เอามาได้เลย"* · เอาแค่ส่วนดูกราฟ ไม่เอาส่วนปรับแต่ง)
     ซูมเข้าออกทีละสองเท่า ถึงครึ่งวินาที · ซูมจากล้อเมาส์ตรึงจุดที่ชี้ไว้ที่เดิม · เลื่อนไม่หลุดหัวท้ายเรื่อง */
  const [vz, setVz] = useState(1);
  // ขยายแนวตั้งใช้กับเส้นละเอียดและแบบ Audacity · แบบ Audacity มีไม้บรรทัดตัวเลขนอกกราฟ ขอบซ้ายของกราฟจึงขยับไปอีก RUL_W
  // รูปคลื่นทั้งสามแบบจองแถบซูมขวากับไม้บรรทัดซ้ายเท่ากัน สลับแบบแล้วกราฟเริ่มและจบที่เดิม
  // 38 = แถบซูมแนวตั้งกว้าง 30 (app.css .ag[data-graphview] .vzoom ข้อ 87 ให้ตรงแนวปุ่ม ⓘ) กับช่องห่าง 8
  const VZ_W = view === "wave" || view === "spec" ? 38 : 0;
  // ซูมแนวตั้งแถบความถี่ sz เท่า ขอบล่างของย่านที่เห็น sb เป็นสัดส่วน แบบเดียวกับหน้าวิเคราะห์ (พี่กันสั่ง 9 พ.ย. 2569 "ขอขยายแบบแนวตั้ง")
  const [sz, setSzRaw] = useState(1), [sb, setSb] = useState(0);
  const szNow = useRef(1); szNow.current = sz;
  const szClampB = (b: number, z: number) => Math.max(0, Math.min(1 - 1 / z, b));
  const setSz = useCallback((z: number) => { const old = szNow.current; if (z === old) return; setSb((b) => szClampB(b + 1 / old / 2 - 1 / z / 2, z)); setSzRaw(z); }, []);
  const svRef = useRef<HTMLDivElement>(null), svDrag = useRef(false);
  const svTo = (y: number) => { const r = svRef.current!.getBoundingClientRect(); setSb(szClampB(1 - (y - r.top) / r.height - 1 / sz / 2, sz)); };
  const LW = view === "wave" ? 96 + RUL_W : 96;
  const zoomBy = (f: number, at?: number) => {
    if (!dur) return;
    let ns = span * f;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    ns = Math.max(HZ_MIN, ns);
    const anchor = at ?? (rt0 + rt1) / 2, rel = (anchor - rt0) / (span || 1);
    const nt0 = Math.max(0, Math.min(dur - ns, anchor - rel * ns));
    setZoom(ns); setCenter(nt0 + ns / 2);
  };
  const panTo = (c: number) => setCenter(Math.max(span / 2, Math.min(dur - span / 2, c)));
  const [grabbing, setGrabbing] = useState(false);
  const grabBusy = useCallback((on: boolean) => { setGrabbing(on); if (on) setHover(null); }, []);
  const lanesGrab = useGrab({ canX: span < dur - 0.01, canY: view === "spec" && sz > 1, span, center: (rt0 + rt1) / 2, z: sz, b: sb, left: LW, right: 0, onX: panTo, onY: (b) => setSb(szClampB(b, sz)), onBusy: grabBusy });
  /** ตั้งความยาวช่วงที่ดูตรง ๆ จากแถบซูมแนวนอน · ซูมรอบกลางช่วงเดิม · ยาวเท่าเรื่องกลับเป็นทั้งไฟล์ */
  const setSpan = useCallback((ns: number) => {
    if (!dur) return;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    ns = Math.max(HZ_MIN, ns);
    setZoom(ns); setCenter((c) => { const mid = zoom === "all" ? dur / 2 : c; return Math.max(ns / 2, Math.min(dur - ns / 2, mid)); });
  }, [dur, zoom]);
  // Ctrl หมุนล้อ ซูมตรงที่ชี้ · Shift หมุนล้อ หรือเลื่อนแนวนอนของทัชแพด เลื่อนซ้ายขวา · หมุนล้อเฉย ๆ เลื่อนหน้าตามปกติ
  useEffect(() => {
    const el = boxEl; if (!el) return;
    const fn = (e: WheelEvent) => {
      const r = el.getBoundingClientRect(), W = r.width - LW, x = e.clientX - r.left - LW;
      if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.5 : 2, x >= 0 && x <= W ? rt0 + x / W * (rt1 - rt0) : undefined); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); panTo((rt0 + rt1) / 2 + (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) / Math.max(1, W) * (rt1 - rt0)); }
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });

  // ช่วงที่ซูม อ่านเฉพาะช่วง (รอ 150 ms ก่อนขอ เลื่อนเร็ว ๆ ไม่ขอซ้ำ)
  // จำผลไว้ สลับกราฟไปมาไม่อ่านซ้ำ (พี่กันถาม 9 พ.ย. 2569 "เรากดเปลี่ยนกราฟไปมา ทำไมมันคำนวนใหม่ทุกครั้งเลย")
  // เปลี่ยนไฟล์ ขยายแนวตั้งของรูปคลื่นกับแถบความถี่กลับเป็น 1 เท่า ไม่ค้างตามไฟล์ก่อน (AUDIT ข้อ 99)
  const lastPath = useRef(c.path);
  useEffect(() => {
    if (lastPath.current === c.path) return;
    lastPath.current = c.path;
    setVz(1); setSzRaw(1); setSb(0);
  }, [c.path]);
  return { settings, updateSettings, zoomAll, switchView, span, rt0, rt1, vz, setVz, VZ_W, sz, setSzRaw, sb, setSb, szNow, szClampB, setSz, svRef, svDrag, svTo, LW, zoomBy, panTo, grabbing, setGrabbing, grabBusy, lanesGrab, setSpan };
}
