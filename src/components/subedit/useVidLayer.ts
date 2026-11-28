/* ซับบนภาพนิ่ง เครื่องมือบนภาพ ข้อความแจ้งผล เมนูคลิกขวา บันทึกหรือคัดลอกภาพ คัดลอกพิกัด และลากเลื่อนภาพด้วยล้อเมาส์
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useMemo, useState } from "react";
import { vidApi, type SnapReq } from "../../lib/api";
import { isAss } from "../../lib/subText";
import { isKey, seekOf } from "../../lib/vidFrames";
import { edit, useSubEdit } from "../../lib/subEdit";
import { lineMove, shownAt, togglePosMove, vStr, type V2 } from "../../lib/subVisual";
import { type VTool } from "./VideoTools";
import { shownText } from "./vidShared";
import { docId, ovCache, ovQueue } from "./ovQueue";
import { dummyPng } from "./VidDummy";
import type { Vd2 } from "./vidCtx";
import { isKey as hotkeyIs } from "../../lib/keymap";

/** เครื่องมือบนภาพที่เลือกไว้ จำตลอดที่โปรแกรมเปิด (Aegisub เริ่มที่กากบาททุกครั้งที่เปิด) */
let toolNow: VTool = "cross";

export function useVidLayer(hk: Vd2) {
  const { boxH, boxW, centerNext, cz, d, fr, img, imgH, imgW, keys, movie, natH, natW, natW0, p, playing, pos, setCz, src, st, t, view, vp } = hk;
  const tNow = fr && playing && vp.frame != null ? fr.timeAt(vp.frame) : fr && pos != null ? fr.timeAt(pos) : p.ev ? p.ev.start + d : null;
  const shown = tNow == null ? "" : p.doc.events.filter((e) => !e.comment && e.start + d <= tNow && tNow < e.end + d).map((e) => shownText(e, p.doc)).join("\n");
  const onKey = isKey(keys.list, pos ?? -1);
  const ready = !!fr && pos != null;
  const noStep = src.kind === "none" ? "ยังไม่มีวิดีโอ" : st.load === "busy" ? "กำลังอ่านเวลาของทุกเฟรม รอสักครู่" : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : undefined;
  const fontPx = Math.max(11, Math.min(28, imgH * 0.06));
  const playWhy = src.kind === "dummy" ? "วิดีโอจำลองไม่มีภาพให้เล่น" : noStep;

  // ที่อยู่ของภาพบนชั้นเครื่องมือ ภาพอยู่กลางพื้นที่ที่ใหญ่กว่าระหว่างภาพกับกรอบ
  const layW = Math.max(imgW, boxW), layH = Math.max(imgH, boxH);
  const lay = useMemo(() => ({ x: (layW - imgW) / 2, y: (layH - imgH) / 2, w: imgW, h: imgH }), [layW, layH, imgW, imgH]);
  const ow = src.kind === "dummy" ? src.spec.w : t?.w || natW0;
  const oh = src.kind === "dummy" ? src.spec.h : t?.h || natH;

  // ซับจริงบนภาพนิ่ง วาดเฉพาะซับบนพื้นโปร่งใสขนาดภาพบนจอ (คิดความละเอียดจอ ด้านยาวไม่เกิน 4,096) แล้ววางทับภาพหนัง
  const still = !playing && src.kind !== "none" && tNow != null;
  const anyShown = still && p.doc.events.some((e) => shownAt(e, d, tNow!, fr, pos));
  const dpr = window.devicePixelRatio || 1;
  const ovS = Math.min(1, 4096 / Math.max(imgW * dpr, imgH * dpr));
  const ovW = Math.max(16, Math.round(imgW * dpr * ovS)), ovH = Math.max(16, Math.round(imgH * dpr * ovS));
  const ovKey = anyShown ? `${docId(p.doc)}|${Math.round(tNow! - d)}|${ovW}x${ovH}|${ow}x${oh}|${movie}` : "";
  const [ov, setOv] = useState<{ key: string; url: string } | null>(null);
  const [ovErr, setOvErr] = useState<string | null>(null);
  useEffect(() => {
    if (!ovKey) return;
    const hit = ovCache.get(ovKey);
    if (hit) { setOv({ key: ovKey, url: hit }); setOvErr(null); return; }
    let live = true;
    const doc = p.doc, at = tNow! - d, key = ovKey;
    const tm = setTimeout(() => {
      ovQueue(key, () => vidApi.subOverlay(doc, at, ovW, ovH, ow, oh, movie || null)).then(
        (u) => { if (live) { setOv({ key, url: u }); setOvErr(null); } },
        (e) => { if (live && e !== "skip") setOvErr(String(e)); });
    }, 40);
    return () => { live = false; clearTimeout(tm); };
  }, [ovKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // ซับแบบข้อความเดิม ใช้ตอนเล่นแบบ Aegisub (วาด libass ทุกเฟรมไม่ทัน) กับตอนวาดด้วย libass ไม่สำเร็จ
  const htmlSub = (playing && vp.engine === "aegisub") || (anyShown && !!ovErr);

  // เครื่องมือบนภาพ
  const [tool, setToolState] = useState<VTool>(toolNow);
  const setTool = (v: VTool) => { toolNow = v; setToolState(v); };
  const se = useSubEdit();
  const ass = isAss(p.doc);
  const toolsOn = still && (src.kind === "dummy" || !!img);
  const selEvents = p.doc.events.filter((e) => se.sel.includes(e.id));
  const actEv = p.doc.events.find((e) => e.id === se.active) ?? null;
  const toMove = !actEv || !lineMove(actEv);
  const toggleMove = () => {
    if (!selEvents.length) return;
    const ids = new Set(selEvents.map((e) => e.id));
    edit(toMove ? "เปลี่ยนเป็น \\move" : "เปลี่ยนเป็น \\pos", (cur) => ({ ...cur, events: cur.events.map((e) => (ids.has(e.id) ? { ...e, text: togglePosMove(cur, e, d, fr) } : e)) }));
  };
  const keyDown = (e: React.KeyboardEvent) => {
    // A กากบาท S ลากจัดตำแหน่ง ตอนคลิกภาพไว้ (คีย์ลัด Video ของ Aegisub) · ใช้ปุ่มจริงบนแป้น แป้นไทยก็ได้ · คีย์มาจากทะเบียนกลาง (BUGS ข้อ 162.3)
    const ne = e.nativeEvent;
    if (hotkeyIs(ne, "tool.cross") || hotkeyIs(ne, "tool.drag")) { e.preventDefault(); setTool(hotkeyIs(ne, "tool.cross") ? "cross" : "drag"); return; }
    p.onKey(e);
  };

  // แจ้งผลของเมนูคลิกขวา สำเร็จหายเองใน 4 วินาที ผิดพลาดอยู่จนกดปิด (สกิล save-status)
  const [note, setNote] = useState<{ text: string; err?: boolean; busy?: boolean } | null>(null);
  useEffect(() => {
    if (!note || note.err || note.busy) return;
    const tm = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(tm);
  }, [note]);
  const [ctx, setCtx] = useState<{ x: number; y: number; at: V2; pan: boolean } | null>(null);
  const openMenu = (e: React.MouseEvent, at: V2) => {
    const v = view.current;
    const pan = cz !== 1 || (!!v && (Math.abs(v.scrollLeft - (v.scrollWidth - v.clientWidth) / 2) >= 1 || Math.abs(v.scrollTop - (v.scrollHeight - v.clientHeight) / 2) >= 1));
    setCtx({ x: e.clientX, y: e.clientY, at, pan });
  };
  const snapWhy = src.kind === "movie" && !(t && pos != null) ? "กำลังอ่านเวลาของทุกเฟรม รอสักครู่" : undefined;
  const snap = async (mode: SnapReq["mode"], dest: SnapReq["dest"]) => {
    setCtx(null);
    const what = dest === "save" ? "บันทึกภาพ" : "คัดลอกภาพ";
    setNote({ text: `กำลัง${what}…`, busy: true });
    const w = window as unknown as { __snapDry?: boolean; __lastSnap?: unknown };
    const srcPath = p.doc.source && !p.doc.source.inMovie ? p.doc.source.path : "";
    const req: SnapReq = {
      movie: movie || null, ss: t && pos != null ? seekOf(t, pos) : 0, t: (tNow ?? 0) - d, w: natW, h: natH, ow, oh, mode,
      frame: pos ?? 0, dest, dir: srcPath ? srcPath.replace(/[\\/][^\\/]*$/, "") : null, dry: import.meta.env.DEV && !!w.__snapDry,
    };
    try {
      const bg = src.kind === "dummy" && mode !== "only" ? dummyPng(src.spec, natW, natH) : null;
      const r = await vidApi.snapshot(req, mode === "raw" ? null : p.doc, bg);
      if (import.meta.env.DEV) w.__lastSnap = r;
      setNote({ text: dest === "save" ? `บันทึกภาพแล้ว ชื่อ ${(r.path ?? "").split(/[\\/]/).pop()}` : `คัดลอกภาพแล้ว ขนาด ${r.w} × ${r.h}` });
    } catch (e) {
      setNote({ text: `${what}ไม่สำเร็จ ${String(e)}`, err: true });
    }
  };
  const copyCoords = async (at: V2) => {
    setCtx(null);
    const text = vStr(at);
    try {
      const w = window as unknown as { __subClipOut?: string[] };
      if (import.meta.env.DEV && w.__subClipOut) w.__subClipOut.push(text);
      else await navigator.clipboard.writeText(text);
      setNote({ text: `คัดลอกพิกัด ${text} แล้ว` });
    } catch (e) { setNote({ text: `คัดลอกพิกัดไม่สำเร็จ ${String(e)}`, err: true }); }
  };
  // รีเซ็ตการเลื่อนภาพ คืนการขยายเนื้อภาพเป็น 1 เท่า แล้ววางภาพกลางกรอบ (ResetContentZoom)
  const resetPan = () => {
    setCtx(null);
    const v = view.current;
    if (cz !== 1) { centerNext.current = true; setCz(1); return; }
    if (v) { v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2; v.scrollTop = (v.scrollHeight - v.clientHeight) / 2; }
  };
  // กดล้อเมาส์ค้างแล้วลาก เลื่อนภาพที่ขยายเกินกรอบ (แบบ Aegisub ที่ลากด้วยปุ่มกลาง)
  const onViewDown = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const v = view.current;
    if (!v) return;
    const sx = e.clientX, sy = e.clientY, l0 = v.scrollLeft, t0 = v.scrollTop;
    const mv = (m: MouseEvent) => { v.scrollLeft = l0 - (m.clientX - sx); v.scrollTop = t0 - (m.clientY - sy); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };
  return { tNow, shown, onKey, ready, noStep, fontPx, playWhy, layW, layH, lay, ow, oh, still, anyShown, dpr, ovS, ovW, ovH, ovKey, ov, setOv, ovErr, setOvErr, htmlSub, tool, setToolState, setTool, se, ass, toolsOn, selEvents, actEv, toMove, toggleMove, keyDown, note, setNote, ctx, setCtx, openMenu, snapWhy, snap, copyCoords, resetPan, onViewDown };
}
