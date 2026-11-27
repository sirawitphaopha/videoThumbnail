/* ช่วงละเอียดที่อ่านเพิ่ม PSD ข้อมูลเพลง และภาพที่ค้างระหว่างลาก
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { AUDIO_EXT, convertApi, graphApi, inApp, type GPsd, type GWindow, type AudioFile, type CoverData } from "../../lib/api";
import { addFiles } from "../../lib/convertJob";
import { memPut } from "./common";
import { Src } from "./draw";
import { mixSrc } from "./parts";
import type { G2 } from "./graphCtx";

export function useGraphWindow(c: G2) {
  const { dur, grabbing, modeRef, names, ov, path, plotW, psdCh, psdSize, rt0, rt1, setPath, setPsd, setWin, setWinFail, span, toast, track, view, win, winFail, zoom } = c;
  const winMem = useRef(new Map<string, GWindow>()), psdMem = useRef(new Map<string, GPsd>());
  // ระหว่างลากแถบซูม แถบเลื่อน หรือตัวกราฟ ไม่อ่านไฟล์เลย ปล่อยเมาส์แล้วอ่านทีเดียว (พี่กันบอก 9 พ.ย. 2569 "ซูมแนวนอน มันประมวลผลกราฟตลอดเลย")
  // ช่วงซูมยาวเท่าหรือเกินทั้งไฟล์ (กด 10 นาทีกับไฟล์ 5:15) ใช้ภาพรวมทั้งไฟล์เหมือนกด ทั้งไฟล์ ไม่ขอช่วงซูม
  // (BUGS ข้อ 38 พี่กัน "เรากด 10 วิ มันค้างเลย" · ต้นเหตุ ช่วงที่ดูยังเป็น 0 ถึงท้ายไฟล์เท่าเดิม ตัวขอข้อมูลไม่ถูกเรียกใหม่ แต่ป้ายโหลดรอข้อมูลช่วงซูมตลอดไป)
  // คำขอที่ถูกคำขออื่นยกเลิกกลางทาง (ได้ค่าว่างกลับมา) ขอใหม่ไม่เกิน 3 ครั้ง แล้วใช้ภาพรวมแทน ป้ายโหลดไม่ค้าง
  const wholeSpan = span >= dur * 0.999;
  useEffect(() => {
    if (grabbing || !path || !ov || zoom === "all" || wholeSpan || view === "loud" || view === "psd") return;
    let live = true, tries = 0, id = 0;
    const log = view !== "spek";
    const memKey = `${path}|${track}|${rt0}|${rt1}|${Math.round(plotW)}|${log}`, hit = winMem.current.get(memKey);
    if (hit) { setWin(hit); return; }
    const ask = () => {
      graphApi.window(path, track, rt0, rt1, Math.round(plotW), log ? 96 : 256, log).then((w) => {
        if (w) memPut(winMem.current, memKey, w, 12);
        if (!live) return;
        if (w) setWin(w);
        else if (++tries < 3) id = window.setTimeout(ask, 200);
        else setWinFail(`${rt0}|${rt1}`);
      }, (e) => { if (live) { setWinFail(`${rt0}|${rt1}`); toast({ kind: "bad", title: "อ่านช่วงที่ซูมไม่ได้", detail: String(e) }); } });
    };
    id = window.setTimeout(ask, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, path, ov, track, rt0, rt1, view, plotW, zoom, wholeSpan]);

  // ความถี่เฉลี่ย
  const psdSeries = useMemo(() => {
    const base = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
    // ซ้อนทุกช่อง · เส้นละช่อง (รวมเสียงเบส) · แทร็กสองช่องเพิ่มเส้นกลางกับเส้นข้าง แบบ SpectrumAnalyzer
    if (psdCh === "all" && names.length > 1) return names.map((_, i) => [i]);
    if (psdCh === "lr" && names.includes("FR")) return [[names.indexOf("FL")], [names.indexOf("FR")]];
    if (psdCh !== "mix" && names.includes(psdCh)) return [[names.indexOf(psdCh)]];
    return [base.length ? base : [0]];
  }, [names, psdCh]);
  const psdMs = useMemo(() => (psdCh === "all" && names.length === 2 && names.includes("FL") && names.includes("FR") ? [names.indexOf("FL"), names.indexOf("FR")] : null), [names, psdCh]);
  useEffect(() => {
    if (grabbing || !path || !ov || view !== "psd") return;
    let live = true;
    const memKey = `${path}|${track}|${rt0}|${rt1}|${JSON.stringify(psdSeries)}|${psdSize}|${JSON.stringify(psdMs)}`, hit = psdMem.current.get(memKey);
    if (hit) { setPsd(hit); return; }
    setPsd(null);
    const id = setTimeout(() => {
      graphApi.psd(path, track, rt0, rt1, psdSeries, psdSize, psdMs).then((p) => { if (p) memPut(psdMem.current, memKey, p, 16); if (live && p) setPsd(p); }, (e) => { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); });
    }, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, path, ov, track, rt0, rt1, view, psdSeries, psdMs, psdSize]);

  // ข้อมูลเพลงกับปกของแผงซ้าย อ่านจากไฟล์จริงตอนเปิดไฟล์ (พี่กันเลือกแบบ ค 9 พ.ย. 2569 "ให้มันอ่าน metadata และแสดงปกด้วย")
  const [tagFile, setTagFile] = useState<AudioFile | null>(null);
  const [tagCover, setTagCover] = useState<CoverData | null | undefined>(undefined);
  useEffect(() => {
    setTagFile(null); setTagCover(undefined);
    if (!path) return;
    let live = true;
    convertApi.probe(path).then((f) => {
      if (!live) return;
      setTagFile(f);
      if (f.cover) convertApi.cover(path).then((c) => { if (live) setTagCover(c); }, () => { if (live) setTagCover(null); });
      else setTagCover(null);
    }, () => { if (live) setTagCover(null); });
    return () => { live = false; };
  }, [path]);

  // ลากไฟล์มาวาง
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type !== "drop" || !e.payload.paths[0] || !document.querySelector("[data-graph]")) return;
      // โหมดแปลงเสียง ไฟล์ที่ลากมาทุกไฟล์เข้าคิว · โหมดดูกราฟ เปิดไฟล์แรก
      // โฟลเดอร์ขยายเป็นไฟล์เสียงข้างในก่อนเข้าคิว ขยายไม่ได้ใส่ตามที่ลากมา (AUDIT ข้อ 115)
      if (modeRef.current === "convert") {
        const ps = e.payload.paths;
        convertApi.expand(ps, AUDIO_EXT).then((x) => {
          if (x.length) addFiles(x);
          else toast({ kind: "warn", ms: 6000, key: "conv-empty", title: "ในโฟลเดอร์ที่ลากมาไม่มีไฟล์เสียง", detail: "ลากไฟล์เสียงหรือโฟลเดอร์ที่มีไฟล์เสียงข้างในมาแทน" });
        }, () => addFiles(ps));
      }
      else if (!document.querySelector("[data-compare]")) setPath(e.payload.paths[0]);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // ซูมแล้วคงภาพคมเดิมไว้จนข้อมูลช่วงใหม่มาครบ แล้วสลับทีเดียวทั้งกราฟกับแกนเวลา ไม่ยืดภาพรวมความละเอียดต่ำมาคั่น
  const rawWin = win && zoom !== "all" && win.env.length === names.length && Math.abs(win.t0 - rt0) < 0.01 && Math.abs(win.t1 - rt1) < 0.01 ? win : null;
  const needWin = zoom !== "all" && !wholeSpan && view !== "loud" && view !== "psd";
  const viewReady = !needWin || !!rawWin || winFail === `${rt0}|${rt1}`;
  const viewKey = `${path}|${track}|${names.length}`;
  const lastView = useRef<{ key: string; t0: number; t1: number; win: GWindow | null; held: GWindow | null } | null>(null);
  // ระหว่างลาก กราฟต้องขยับตามมือทันที ไม่ค้างรอข้อมูล · ตรงที่มีช่วงซูมเดิมยังคม ตรงที่เพิ่งโผล่ใช้ภาพรวมจนปล่อยเมาส์แล้วช่วงใหม่มา
  const heldRef = useRef<{ key: string; w: GWindow } | null>(null);
  const heldKey = `${viewKey}|${view !== "spek"}`;
  if (rawWin) heldRef.current = { key: heldKey, w: rawWin };
  const heldNow = heldRef.current?.key === heldKey ? heldRef.current.w : null;
  const dragHold = grabbing && needWin && !rawWin;
  if (dragHold) lastView.current = { key: viewKey, t0: rt0, t1: rt1, win: null, held: heldNow };
  else if (viewReady) lastView.current = { key: viewKey, t0: rt0, t1: rt1, win: rawWin, held: null };
  const shown = (dragHold || !viewReady) && lastView.current?.key === viewKey ? lastView.current : { t0: rt0, t1: rt1, win: rawWin, held: null };
  // ข้อมูลละเอียดเฉพาะตอนบันทึกรูป
  const [hiWin, setHiWin] = useState<GWindow | null>(null);
  const t0 = shown.t0, t1 = shown.t1, winNow = hiWin ?? shown.win, heldShown = shown.held;
  const src: Src | null = useMemo(() => (winNow ? { env: winNow.env, cols: winNow.cols, t0: winNow.t0, t1: winNow.t1 } : heldShown && ov ? mixSrc(heldShown, ov, t0, t1, Math.round(plotW)) : ov ? { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration } : null), [winNow, heldShown, ov, t0, t1, plotW]);
  // รอเกิน 1 วินาทีถึงขึ้นป้าย ระหว่างรอภาพเดิมยังอยู่บนจอ รอสั้น ๆ ไม่ต้องขึ้น
  // (เดิม 0.3 วินาที เลื่อนหรือซูมทีไรป้ายขึ้นทุกที พี่กันทัก 11 พ.ย. 2569 "มันจะโหลดอะไรกันนักหันหนา")
  const [viewSlow, setViewSlow] = useState(false);
  useEffect(() => {
    if (viewReady || grabbing) { setViewSlow(false); return; }
    const id = setTimeout(() => setViewSlow(true), 1000);
    return () => clearTimeout(id);
  }, [viewReady, grabbing]);
  return { winMem, psdMem, wholeSpan, psdSeries, psdMs, tagFile, setTagFile, tagCover, setTagCover, pageOn, rawWin, needWin, viewReady, viewKey, lastView, heldRef, heldKey, heldNow, dragHold, shown, hiWin, setHiWin, t0, t1, winNow, heldShown, src, viewSlow, setViewSlow };
}
