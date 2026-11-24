/* ตำแหน่งบนหน้า การ์ดผล แผงตั้งค่าแทร็กสามแบบ และการเลื่อนไปช่องปก
   แยกจาก AvPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 2) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTrackPanel } from "../../lib/trackPanel";
import { type CoverTarget } from "../../lib/api";
import { useEscClose } from "../../lib/popup";
import { getAv, setAv } from "../../lib/avJob";
import { glideBox } from "../../lib/glide";
import type { C5 } from "./avCtx";

export function useAvLayout(c: C5) {
  const { covers, posterOpen, run, sel, setPosterOpen, tracks } = c;
  const runBox = useRef<HTMLDivElement>(null);
  useEffect(() => { runBox.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [run.state]);
  const pct = run.state === "working" && run.progress ? Math.round(run.progress.percent) : 0;
  /** กดแถวรูปปกในตาราง เลื่อนไปที่ช่องปกนั้นในการ์ดโปสเตอร์ ถึงแล้ววาบหนึ่งทีแบบกดหมวดในหน้า MediaInfo (BUGS ข้อ 35 ต่อ พี่กัน "กดเเล้ว มันจะไปวาบที่ปกตั้งที่เอาไว้ครอป") */
  const goSlot = (slot: CoverTarget) => {
    // ขึ้นทีละส่วน กดแถวรูปปกแล้วยกเลิกแทร็กที่เลือกไว้ ส่วนตั้งค่าแทร็กหายไป (BUGS ข้อ 67 ต่อ)
    if (getAv().sel) setAv({ sel: null });
    if (!posterOpen) { setPosterOpen(true); requestAnimationFrame(() => requestAnimationFrame(() => goSlotNow(slot))); return; }
    goSlotNow(slot);
  };
  const goSlotNow = (slot: CoverTarget) => {
    const el = document.querySelector<HTMLElement>(`[data-pageslot=av] [data-slot=${slot}]`), sc = el?.closest<HTMLElement>(".pagewrap");
    if (!el || !sc) return;
    const flash = () => { el.removeAttribute("data-flash"); void el.offsetWidth; el.setAttribute("data-flash", ""); el.addEventListener("animationend", () => el.removeAttribute("data-flash"), { once: true }); };
    const r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
    glideBox(sc, r.top - b.top + sc.scrollTop - (sc.clientHeight - r.height) / 2, flash);
  };
  /* ส่วนที่ใช้กับงานรวมอย่างเดียว ตอนเลือกวิธีอื่นอยู่ที่เดิมแบบจาง กดไม่ได้ ป้ายมุมบอกเหตุผล หน้าไม่ยุบ (BUGS ข้อ 35 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "เราต้องการให้มันไม่ยุบ เท่าเดิม อันไหนไม่จำเป็น เอาปุ่มจางกดไม่ได้") */
  const coverDirty = covers.cover.mode !== "keep" || covers.cover_land.mode !== "keep";
  const postOpen = posterOpen || coverDirty;
  const offIn = (on: boolean, node: React.ReactNode, why = "ใช้ตอนรวมเข้าไฟล์หนัง") => on ? <div className="avoffwrap" data-off={why}><div className="avoff" inert>{node}</div></div> : node;
  const selected = tracks.find((t) => t.key === sel) ?? null;
  /** เสียงเดิมในหนังที่ใช้เทียบตอนหาดีเลย์ · เสียงแรกในหนังที่ยังเก็บไว้ */
  const refAudio = tracks.find((t) => t.inMovie && t.kind === "audio" && t.keep) ?? tracks.find((t) => t.inMovie && t.kind === "audio") ?? null;

  /* ส่วนตั้งค่าแทร็กขึ้นแบบไหน (BUGS ข้อ 33 พี่กันเลือกแบบ 2 กางใต้แถวที่กด 12 พ.ย. 2569 · แบบ 1 หน้าต่างซ้อนกับแบบ 3 แผงขวาเลือกในหน้าตั้งค่า)
     เดิมส่วนนี้อยู่ใต้ตาราง โดนแถววิธีที่ตรึงล่างบัง ต้องเลื่อนลงไปหา */
  const panel = useTrackPanel();
  const closeSel = useCallback(() => setAv({ sel: null }), []);
  const pageRef = useRef<HTMLDivElement>(null);
  const [sideBox, setSideBox] = useState<{ top: number; bottom: number } | null>(null);
  const sideOn = panel === "side" && !!selected;
  useEscClose(sideOn, closeSel);
  // แผงขวาอยู่ระหว่างแถบชื่อหนังกับแถบวิธีที่ตรึงล่าง ไม่บังปุ่มรวม · แถบชื่อหนังขยับตอนเลื่อนจนตรึงบน จึงวัดใหม่ทุกครั้งที่เลื่อนหรือเปลี่ยนขนาด
  useLayoutEffect(() => {
    if (!sideOn) return;
    const root = pageRef.current;
    if (!root) return;
    const place = () => {
      const top = Math.round(root.querySelector<HTMLElement>(".avtop")?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top);
      const bottom = Math.round(window.innerHeight - (root.querySelector<HTMLElement>(".avdock")?.getBoundingClientRect().top ?? window.innerHeight));
      setSideBox((p) => (p && p.top === top && p.bottom === bottom ? p : { top, bottom }));
    };
    place();
    const ro = new ResizeObserver(place);
    root.querySelectorAll(".avtop, .avdock").forEach((e) => ro.observe(e));
    root.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { ro.disconnect(); root.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [sideOn]);
  // แบบกางใต้แถว · กางแล้วส่วนล่างมุดใต้แถววิธีที่ตรึงล่าง (ปัญหาเดิมของข้อ 33) ค่อย ๆ เลื่อนขึ้นจนเห็นครบ แต่แถวที่กดยังอยู่ใต้แถบชื่อหนัง
  useEffect(() => {
    if (panel !== "under" || !sel) return;
    const id = requestAnimationFrame(() => {
      const root = pageRef.current, card = root?.querySelector<HTMLElement>(".trk-under"), row = card?.previousElementSibling as HTMLElement | null;
      if (!root || !card || !row) return;
      const top = root.querySelector<HTMLElement>(".avtop")?.getBoundingClientRect().bottom ?? root.getBoundingClientRect().top;
      const dock = root.querySelector<HTMLElement>(".avdock")?.getBoundingClientRect().top ?? root.getBoundingClientRect().bottom;
      const need = card.getBoundingClientRect().bottom + 10 - dock;
      const room = row.getBoundingClientRect().top - top - 8;
      const by = Math.min(need, room);
      if (by > 0) glideBox(root, root.scrollTop + by);
    });
    return () => cancelAnimationFrame(id);
  }, [panel, sel]);
  return { runBox, pct, goSlot, goSlotNow, coverDirty, postOpen, offIn, selected, refAudio, panel, closeSel, pageRef, sideBox, setSideBox, sideOn };
}
