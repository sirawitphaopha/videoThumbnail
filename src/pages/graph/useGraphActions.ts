/* ช่องที่เห็น ค่าที่ชี้ เปิดไฟล์อื่น เทียบ เล่น และบันทึกรูปกราฟ
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { GRAPH_IMG_DEFAULT, checkApi, graphApi, pickFile } from "../../lib/api";
import { fmtSize } from "../../lib/format";
import { VIEWS, tfmt } from "./common";
import { alphaOf, imgName, imgTarget, screenK, waitPaint, withHeader } from "./draw";
import { Mark } from "./parts";
import type { G3 } from "./graphCtx";

export function useGraphActions(c: G3) {
  const { exportRef, hidden, hover, info, movie, names, ov, path, plotW, setCmp, setCmpBack, setHiWin, setHidden, setPath, setTrack, settings, t0, t1, tip, toast, track, view, wantTrack } = c;
  const vis = names.filter((c) => !hidden.includes(c));
  const levels = useMemo(() => (ov ? ov.rms.map((d) => Math.pow(10, d / 20)) : []), [ov]);
  const marks: Mark[] = useMemo(() => {
    const m: Mark[] = (movie?.check?.spans ?? []).map((s) => ({ from: s.from, to: Math.max(s.to, s.from + 0.5), text: s.what + " (ผลตรวจ)" }));
    for (const [a, b] of ov?.silences ?? []) if (!m.some((x) => Math.abs(x.from - a) < 1.5)) m.push({ from: a, to: b, text: `เงียบทุกช่อง ${(b - a).toFixed(1)} วินาที` });
    return m;
  }, [movie, ov]);
  // จุดเดิมหลุดช่วงที่ดู (ซูมหรือเลื่อนไปที่อื่น) ใช้ต้นช่วงที่ดู ปุ่มเปิดเล่นที่จะไม่บอกเวลาที่มองไม่เห็น (เจอตอนตรวจภาพ)
  const at = hover ?? (tip >= t0 && tip <= t1 ? tip : t0);

  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  const openOther = async () => { const f = await pickFile("media"); if (f) setPath(f); };
  // กลับจากหน้าเทียบมากราฟเดี่ยว เปิดแทร็กเดียวกับที่เทียบอยู่ (AUDIT ข้อ 22)
  const openSingle = (p: string, t: number) => {
    wantTrack.current = t || null;
    if (p === path && info && t < info.tracks.length) setTrack(t);
    setPath(p);
  };
  const compareOther = async () => {
    if (!path) return;
    // ตัวตรวจในโหมดพัฒนาส่งไฟล์ผ่าน __cmpPick ไม่เปิดกล่องเลือกไฟล์ของ Windows
    const w2 = window as unknown as { __cmpPick?: string };
    const f = import.meta.env.DEV && w2.__cmpPick ? w2.__cmpPick : await pickFile("media"); if (!f) return;
    if (f.toLowerCase() === path.toLowerCase()) { toast({ kind: "warn", ms: 6000, key: "graph-pick", title: "เลือกไฟล์เดียวกับที่เปิดอยู่", detail: "เลือกไฟล์อื่นเพื่อเทียบ" }); return; }
    setCmpBack(null); setCmp({ files: [path, f], free: true, tracks: track ? { [path]: track } : undefined });
  };
  const play = async () => {
    if (!path) return;
    try {
      const r = await checkApi.playAt(path, at);
      if (r.seeked) toast({ kind: "ok", title: `เปิดด้วย ${r.player} ที่ ${tfmt(at)}` });
      else toast({ kind: "warn", title: r.player ? `เปิดด้วย ${r.player} แล้ว แต่เปิดตรงนาทีไม่ได้` : "เปิดด้วยโปรแกรมหลักของ Windows แล้ว แต่เปิดตรงนาทีไม่ได้", detail: `เลื่อนไปที่ ${tfmt(at)} เอง หรือตั้งโปรแกรมเล่นได้ที่หน้าตั้งค่า` });
    } catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };
  const fileName = path ? path.split(/[\\/]/).pop() ?? path : "";
  // บันทึกรูป · อ่านเสียงช่วงที่ดูใหม่ที่ความละเอียดของรูป ไม่ต้องซูมก่อน นานขึ้นนิดหน่อย (พี่กันสั่ง 9 พ.ย. 2569 "ระบบจะขยายกราฟแล้วบันทึกมาเลย มันจะบันทึกนานนิดนึง")
  const [saving, setSaving] = useState(false);
  const saveImage = async () => {
    if (!path || saving) return;
    // ตัวตรวจดูรูปที่จะบันทึกโดยไม่เปิดกล่องเลือกที่บันทึก
    const dry = (window as unknown as { __saveDry?: (c: HTMLCanvasElement) => void }).__saveDry;
    if (dry) { const cv = exportRef.current(0); if (cv) dry(cv); return; }
    const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
    const vName = VIEWS.find(([k]) => k === view)?.[1] ?? "กราฟเสียง", base = fileName.replace(/\.[^.]+$/, "");
    const where = await imgTarget(path, imgName(base, vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (view !== "loud" && view !== "psd") {
        const log = view !== "spek", cols = Math.min(8192, o.width || Math.round(plotW * screenK()));
        // รูปคลื่นไม่ใช้ภาพความถี่ ฝั่ง Rust ไม่ต้องจองที่เก็บ (AUDIT ข้อ 108)
        const w = await graphApi.window(path, track, t0, t1, cols, log ? 256 : 512, log, true, view === "wave");
        if (!w) throw new Error("การอ่านถูกยกเลิก เพราะมีการเลื่อนหรือซูมกราฟระหว่างบันทึก");
        flushSync(() => setHiWin(w));
      }
      let cv = exportRef.current(o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title && view !== "spek") cv = withHeader(cv, fileName + " " + vName, tfmt(t0) + " ถึง " + tfmt(t1));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: `บันทึกรูปแล้ว ${saved.width.toLocaleString("en-US")} × ${saved.height.toLocaleString("en-US")} ขนาด ${fmtSize(saved.size)}`, detail: saved.path });
    } catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: e instanceof Error ? e.message : String(e) }); }
    finally { setHiWin(null); setSaving(false); }
  };
  return { vis, levels, marks, at, toggleCh, openOther, openSingle, compareOther, play, fileName, saving, setSaving, saveImage };
}
