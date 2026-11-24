/* ภาพต้นฉบับทีละหน้า คำขอที่ส่งตัวแปลง ภาพตัวอย่างของผล ความคืบหน้า ปุ่มแปลง เปลี่ยนที่เก็บ เปิดโฟลเดอร์ และกรอบภาพที่ดูอยู่
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, imgApi, inApp, pickSave, subApi, type ImgOut, type ImgReq } from "../../lib/api";
import { EXT, OUT_NAME, PER, type Opts } from "./icvData";
import { useInk } from "./IcvImages";
import type { Icv0 } from "./icvCtx";

export function useIcvRun(hk: Icv0) {
  const { engine, ff, idx, kind, lang, opts, p, path, prev, run, se, seq, setBdBad, setErr, setExists, setOut, setPath, setPrev, setRun, setSrc, src, srcPath, t, tools } = hk;
  // ภาพต้นทางจากตัวถอดซับภาพเดิม (ffmpeg sub2video ใน subs.rs) ทีละหน้า 12 ภาพ
  const page = Math.floor(idx / PER);
  useEffect(() => {
    if (!p.open || !inApp || src?.pages[page]) return;
    let live = true;
    // รุ่นทดสอบ ตัวตรวจตั้ง window.__icvSrcFail ให้ตัวถอดภาพต้นฉบับล้ม (ไฟล์ที่ ffmpeg อ่านไม่ได้เปิดในหน้าซับไตเติลไม่ได้ จึงเรียกกรณีนี้จากไฟล์จริงไม่ได้)
    const fail = import.meta.env.DEV && (window as unknown as { __icvSrcFail?: boolean }).__icvSrcFail;
    (fail ? Promise.reject(new Error("ทดสอบ")) : subApi.images(srcPath, ff, page, PER)).then((r) => { if (live) setSrc((o) => ({ total: r.total, pages: { ...(o?.pages ?? {}), [page]: r.items } })); }, () => { if (live) setSrc((o) => ({ total: o?.total ?? 0, pages: o?.pages ?? {}, err: true })); });
    return () => { live = false; };
  }, [p.open, page, srcPath, ff]); // eslint-disable-line react-hooks/exhaustive-deps

  const reqOf = (eng: Opts["engine"]): ImgReq => { const se = eng === "seconv"; return {
    // นามสกุลตามชนิดผลที่เลือกเสมอ ที่เก็บเปลี่ยนนามสกุลตามทีหลังหนึ่งรอบ ถ้าใช้ที่เก็บตรง ๆ คำขอภาพตัวอย่างรอบแรกได้ชนิดเดิม
    src: srcPath, inMovie: t.inMovie, tid: t.tid, ff, kind, target: `${(path || "x").replace(/\.(sup|idx|sub|xml)$/i, "")}.${EXT[opts.out]}`, engine: eng, language: lang,
    resolution: opts.useRes && !se ? opts.resolution : "keep", scaleX: opts.useScale && !se ? opts.scaleX : 1, scaleY: opts.useScale && !se ? opts.scaleY : 1, filter: opts.filter,
    fpsSource: opts.useFps && !se ? opts.fpsSource : "auto", fpsTarget: opts.useFps && !se ? opts.fpsTarget : "keep", delay: se ? Math.max(0, opts.delay) : opts.delay,
    fixShort: opts.fixShort && !se, minTime: opts.minTime,
    moveY: opts.useMove && !se ? opts.moveY : "none", ratio: opts.ratio, moveYOffset: opts.moveYOffset, moveX: opts.useMove && !se ? opts.moveX : "none", moveXOffset: opts.moveXOffset, cropY: 0,
    palette: opts.palette, fixInvisible: opts.fixInvisible && !se, forced: se && opts.forced === "exclude" ? "all" : opts.forced, forceAll: se ? "" : opts.forceAll,
    alphaThr: opts.alphaThr, lumLow: opts.lumLow, lumHi: opts.lumHi,
  }; };
  const req = reqOf(engine);
  const readFail = (m: string) => /BDSup2Sub\+\+ อ่านซับนี้ไม่ได้/.test(m);
  const ratioBad = req.moveY === "inside" || req.moveY === "outside" ? !(opts.ratio > 16 / 9 + 0.001 && opts.ratio <= 4) : false;
  const engWhy = tools && !tools[se ? "seconvOk" : "bdsupOk"] ? `ยังไม่มี ${se ? "Subtitle Edit" : "BDSup2Sub++"} ในโฟลเดอร์เครื่องมือของโปรแกรม` : undefined;

  // ภาพตัวอย่างของผลที่จะได้ · แปลงจริงทั้งไฟล์ด้วยตัวเลือกเดียวกัน รอหยุดปรับ 600 มิลลิวินาที · เปลี่ยนแค่ภาพที่ดู ฝั่ง Rust ใช้ผลเดิม
  const prevKey = JSON.stringify({ ...req, target: EXT[opts.out] });
  const lastKey = useRef("");
  useEffect(() => {
    if (!p.open || !inApp || run) return;
    if (engWhy || ratioBad) { setPrev({ s: "fail", err: engWhy ?? "สัดส่วนภาพของหนังต้องกว้างกว่า 16:9 (1.78)" }); return; }
    const my = ++seq.current;
    // เปลี่ยนแค่ภาพที่ดู ขอทันที (ฝั่ง Rust มีผลอยู่แล้ว) · เปลี่ยนตัวเลือกรอหยุดปรับ 600 มิลลิวินาที
    const wait = lastKey.current === prevKey ? 0 : 600;
    lastKey.current = prevKey;
    setPrev((o) => ({ s: "busy", data: o.data }));
    const tm = setTimeout(() => {
      imgApi.preview(req, idx).then((r) => { if (seq.current === my) setPrev({ s: "done", data: r }); }, (e) => {
        if (seq.current !== my) return;
        const m = String(e);
        if (req.engine === "bdsup" && readFail(m)) { setBdBad(true); if (tools?.seconvOk) { setPrev((o) => ({ s: "busy", data: o.data })); return; } }
        setPrev({ s: "fail", err: m });
      });
    }, wait);
    return () => clearTimeout(tm);
  }, [prevKey, idx, p.open, tools]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!run || !inApp) return;
    const un = listen<{ done: number; total: number }>("imgsub-progress", (e) => setRun(e.payload));
    return () => { void un.then((f) => f()); };
  }, [run != null]); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = run != null;
  const why = busy ? "กำลังแปลง" : !path ? "ยังไม่ได้เลือกที่เก็บ" : engWhy ?? (ratioBad ? "สัดส่วนภาพของหนังต้องกว้างกว่า 16:9 (1.78)" : undefined);
  const go = async (target = path) => {
    if (busy) return;
    setErr(null); setExists(false); setOut(null); setRun({ done: 0, total: 0 });
    try {
      let r: ImgOut;
      try { r = await imgApi.convert({ ...req, target }); } catch (e) {
        if (!(req.engine === "bdsup" && readFail(String(e)))) throw e;
        setBdBad(true);
        if (!tools?.seconvOk) throw e;
        setRun({ done: 0, total: 0 });
        r = await imgApi.convert({ ...reqOf("seconv"), target });
      }
      setRun(null); setOut(r);
    } catch (e) {
      setRun(null);
      const m = String(e);
      if (m === "exists") { setPath(target); setExists(true); return; }
      if (m !== "stopped") setErr(m);
    }
  };
  const browse = async () => {
    const w2 = window as unknown as { __imgTarget?: string };
    const r = import.meta.env.DEV && w2.__imgTarget ? w2.__imgTarget : await pickSave(path, EXT[opts.out], `ซับ ${OUT_NAME[opts.out]}`);
    if (r) setPath(new RegExp(`\\.${EXT[opts.out]}$`, "i").test(r) ? r : `${r}.${EXT[opts.out]}`);
  };
  const reveal = (f: string) => {
    const w2 = window as unknown as { __openDry?: boolean; __openDryLog?: string[] };
    if (import.meta.env.DEV && w2.__openDry) { (w2.__openDryLog ??= []).push(f); return; }
    api.revealMovie(f).catch((e) => setErr(String(e)));
  };

  const d = prev.data;
  // กรอบรวมของทุกภาพในชุด (PGS ขึ้นพร้อมกันได้สองกรอบ) จะได้เทียบกับภาพต้นฉบับที่ตัวถอดรวมเป็นภาพเดียว
  const ob = d && d.graphics.length ? (() => { const x = Math.min(...d.graphics.map((g) => g.x)), y = Math.min(...d.graphics.map((g) => g.y)); return { x, y, w: Math.max(...d.graphics.map((g) => g.x + g.w)) - x, h: Math.max(...d.graphics.map((g) => g.y + g.h)) - y }; })() : null;
  const total = d?.total ?? src?.total ?? 0;
  const s0 = src?.pages[page]?.[idx % PER];
  const srcInk = useInk(s0 ? [{ png: s0.png, x: s0.at[0], y: s0.at[1], w: s0.w, h: s0.h }] : null);
  const outInk = useInk(d && d.graphics.length ? d.graphics : null);
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  return { page, reqOf, req, readFail, ratioBad, engWhy, prevKey, lastKey, busy, why, go, browse, reveal, d, ob, total, s0, srcInk, outInk, pct };
}
