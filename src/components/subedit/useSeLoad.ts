/* เปิดไฟล์ซับ รหัสอักษร ฉบับบันทึกอัตโนมัติ บรรทัดที่เลือก และภาพตามบรรทัด
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect } from "react";
import { subDocApi } from "../../lib/api";
import { getSubEdit, openDoc } from "../../lib/subEdit";
import { garbageGet, isAss } from "../../lib/subText";
import { getVid, parseDummy, seekTime, vidOpen } from "../../lib/vidFrames";
import { getTiming, setPend } from "../../lib/subTiming";
import type { E0 } from "./seCtx";

/** เลขคำขอเปิดซับล่าสุด (F6) · เป็นของโมดูลเพราะที่เก็บเอกสารเป็นของโมดูล หน้าแก้ซับที่ถอดไปแล้วก็ยังเรียก openDoc ได้ */
let openSeq = 0;

export function useSeLoad(c: E0) {
  const { base, doc, fr, gridAt, key, load, p, path, root, save, setGridH, setLoad, setSave, skipAuto, st } = c;
  const openAs = (charset?: string) => {
    setLoad({ s: "busy" });
    // คำขอที่ถูกแทนแล้ว (กดแทร็กอื่นหรือรหัสอักษรอื่นต่อ) ผลมาทีหลังไม่ทับเอกสารของคำขอล่าสุด · ซับในหนังถอดนานหลายวินาที (ผู้ช่วยตรวจทาน F6)
    const my = ++openSeq;
    subDocApi.open(path, p.track.inMovie, p.track.tid, p.track.ff ?? p.track.tid, charset).then((d) => {
      if (my !== openSeq) return;
      openDoc(d, { name: p.label, movie: p.video, key, base });
      setLoad({ s: "ok" });
      setSave({ s: "idle" });
    }, (e) => { if (my === openSeq) setLoad({ s: "failed", err: String(e) }); });
  };
  // เปิดซับเมื่อเปลี่ยนแทร็ก · สลับหน้าไปกลับแล้วซับที่แก้อยู่ไม่เปิดใหม่
  useEffect(() => {
    const m = getSubEdit().meta;
    // ใช้เอกสารที่เปิดอยู่แล้ว ยกเลิกคำขอเปิดแทร็กอื่นที่ยังค้าง (กดแทร็กอื่นแล้วรีบกดกลับ ผลของแทร็กอื่นต้องไม่ทับ · F6)
    if (m?.key === key && getSubEdit().doc) { openSeq++; setLoad({ s: "ok" }); return; }
    openAs();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // เพิ่มหรือเปลี่ยนไฟล์วิดีโอทีหลัง เอกสารเดิมยังอยู่
  useEffect(() => { const s = getSubEdit(); if (s.meta && s.meta.key === key && s.meta.movie !== p.video) s.meta.movie = p.video; }, [p.video, key]);
  // ภาพหนังของเอกสารนี้ · ไม่มีหนังแต่ไฟล์ ASS จำวิดีโอจำลองไว้ (Video File: ?dummy:… แบบ Aegisub) ใช้วิดีโอจำลองนั้น
  useEffect(() => {
    if (load.s !== "ok") return;
    const d = getSubEdit().doc;
    const v = d && isAss(d) ? garbageGet(d, "Video File") : null;
    vidOpen(p.video, v ? parseDummy(v) : null);
  }, [load.s, key, p.video]);

  // ตารางสูงเต็มที่ว่างที่เหลือของหน้าต่าง อย่างน้อยหัวตารางกับหนึ่งแถว
  useLayoutEffect(() => {
    // ขอบล่างวัดจากของจริง ขอบในของการ์ดใต้ตารางกับขอบล่างของกรอบหน้าที่เลื่อนได้ (เดิมเผื่อ 14 จุดตายตัว ของจริงราว 31 จุด หน้าเลื่อนได้อีก 17 จุด)
    // คิดในกรอบหน้าที่เลื่อนได้ · ใต้ตาราง = ขอบในของการ์ดใต้ตาราง บวกขอบล่างของทุกชั้นตั้งแต่การ์ดถึงกรอบหน้า
    // (ลองใช้ความสูงเนื้อหาทั้งหมดของกรอบหน้าแล้วพลาด ตอนเนื้อหาสั้นกว่าจอความสูงนั้นเท่าจอ ตารางไม่ขยายตาม เจอที่ 1920 × 1032)
    const fit = () => {
      const el = gridAt.current, card = root.current;
      if (!el || !card) return;
      const sc = card.closest<HTMLElement>(".pagewrap");
      const r = el.getBoundingClientRect();
      // ขั้นต่ำหัวตารางกับหนึ่งแถว (28 + 30) · แถบเลื่อนเวลาใต้ภาพ (BUGS ข้อ 113) กินที่ 14 จุด หน้าต่าง 1280 × 800 ตารางเหลือราวแถวครึ่ง หน้าไม่เลื่อน
      if (!sc) { setGridH(Math.max(58, Math.floor(window.innerHeight - r.top - 14))); return; }
      let extra = card.getBoundingClientRect().bottom - r.bottom;
      for (let e: HTMLElement | null = card; e && e !== sc; e = e.parentElement) {
        extra += parseFloat(getComputedStyle(e).marginBottom) || 0;
        const pr = e.parentElement;
        if (pr) { const ps = getComputedStyle(pr); extra += (parseFloat(ps.paddingBottom) || 0) + (pr === sc ? 0 : parseFloat(ps.borderBottomWidth) || 0); }
      }
      const top = r.top - sc.getBoundingClientRect().top - sc.clientTop + sc.scrollTop;
      setGridH(Math.max(58, Math.floor(sc.clientHeight - top - Math.max(0, extra))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (root.current) ro.observe(root.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [p.tab, load.s, doc?.kind]);

  // ผลบันทึกสำเร็จหายเอง ผิดพลาดค้างไว้
  useEffect(() => {
    if (save.s !== "done") return;
    const t = setTimeout(() => setSave((x) => (x === save ? { s: "idle" } : x)), 5000);
    return () => clearTimeout(t);
  }, [save]);

  const ev = doc?.events.find((e) => e.id === st.active) ?? null;
  const at = doc && ev ? doc.events.indexOf(ev) : -1;
  // เปลี่ยนบรรทัดก่อนยืนยัน ทิ้งเวลาที่ลากค้าง (Revert ของ Aegisub) ทุกแบบการดู · เดิมทิ้งเฉพาะตอนกรอบคลื่นเสียงแสดงอยู่
  // ซ่อนภาพและเสียงหรืออยู่แบบ notepad แล้วคีย์ลัดขยับเวลาไว้ พอยืนยันที่บรรทัดอื่น เวลาไปลงบรรทัดเดิมโดยไม่รู้ตัว (ผู้ช่วยตรวจทาน F14)
  useEffect(() => { const pd = getTiming().pend; if (pd && pd.id !== ev?.id) setPend(null); }, [ev?.id]);
  const dl = p.track.delay;

  // AUTO เลือกบรรทัดแล้วภาพไปเฟรมแรกที่ซับขึ้น (Video/Subtitle Sync ของ Aegisub) · ยังไม่มีภาพเลย ไปเฟรมนั้นแม้ปิด AUTO
  useEffect(() => {
    if (!ev || !fr) return;
    if (skipAuto.current) { skipAuto.current = false; return; }
    if (getVid().auto || getVid().pos == null) seekTime(ev.start + dl, "start");
  }, [ev?.id, fr]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Ctrl กับลูกศร ไปเวลาเริ่ม เวลาจบ แล้วบรรทัดถัดไป (video/frame/next/boundary ของ Aegisub) */
  return { openAs, ev, at, dl };
}
