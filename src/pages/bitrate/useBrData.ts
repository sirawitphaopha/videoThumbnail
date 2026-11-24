/* อ่านข้อมูลบิตเรต เปิดไฟล์ หยุด กลับหน้าแรก ไฟล์ล่าสุด และสีตามโทน
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { listen } from "@tauri-apps/api/event";
import { bitrateApi, inApp, pickFile, type BrTrack } from "../../lib/api";
import { CACHE, Done, Mode, Prog, Raw, cssv, infoOf, recentList, remember, srcOf, store } from "./common";
import type { C0 } from "./brCtx";

export function useBrData(c: C0) {
  const { askRef, choose, initialPath, initialTrack, modeSel, onConsumed, path, pin, plotRef, raw, ready, run, setAsking, setBox, setChoose, setErr, setHover, setInfo, setModeState, setPath, setPin, setRecent, setRunning, setSel, setToneVer, setTrack, setVer, setZoom, toneKey, track } = c;
  useEffect(() => {
    const key = () => ["--accent", "--accent-soft", "--win", "--txt2", "--line"].map((n) => cssv(n, "")).join("|");
    toneKey.current = key();
    const mo = new MutationObserver(() => { const k = key(); if (k !== toneKey.current) { toneKey.current = k; setToneVer((v) => v + 1); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => mo.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(80, el.clientWidth), h: Math.max(80, el.clientHeight) }));
    ro.observe(el); return () => ro.disconnect();
  }, [path, choose]);

  useEffect(() => {
    if (!inApp) return;
    let live = true; const offs: (() => void)[] = [];
    const a = listen<Prog>("bitrate-progress", (e) => {
      const p = e.payload, r = raw.current; if (p.run !== run.current || !r) return;
      if (p.from !== r.t.length) { r.t.length = p.from; r.s.length = p.from; r.k = r.k.slice(0, p.from); }
      for (let i = 0; i < p.t.length; i++) { r.t.push(p.t[i]); r.s.push(p.s[i]); if (p.t[i] < r.tmin) r.tmin = p.t[i]; }
      r.k += p.k; r.readTo = p.readTo; setVer((v) => v + 1);
    });
    a.then((u) => (live ? offs.push(u) : u()));
    const b = listen<Done>("bitrate-done", (e) => {
      const d = e.payload; if (d.run !== run.current) return;
      if (raw.current) { raw.current.done = d.ok; raw.current.partial = !!d.partial; }
      setRunning(false); if (d.error) setErr(d.error); setVer((v) => v + 1);
    });
    b.then((u) => (live ? offs.push(u) : u()));
    ready.current = Promise.all([a, b]).then(() => undefined, () => undefined);
    return () => { live = false; offs.forEach((f) => f()); bitrateApi.stop().catch(() => {}); };
  }, []);

  const open = useCallback(async (p: string, m: Mode, force = false, trk?: string) => {
    const src = srcOf(m);
    let tk = trk ?? (p === path ? track : "");
    setErr(""); setSel(null);
    const fresh = p !== path || tk !== track;
    // ไฟล์เดียวกันเขียน / กับ  หรือตัวพิมพ์ต่างกัน ถือเป็นไฟล์เดียว ไม่ขึ้นซ้ำ (เจอ 10 พ.ย. 2569)
    const same = (a: string) => a.replace(/\//g, "\\").toLowerCase();
    // จำลงเครื่องอย่างเดียว รายการบนจอเรียงใหม่ตอนกลับหน้ารวม · เดิมเรียงใหม่ทันที ไฟล์ที่กดเด้งขึ้นหน้าสุดให้เห็นก่อนเข้าหน้าไฟล์ (BUGS ข้อ 82)
    const list = [p, ...recentList().filter((x) => same(x) !== same(p))].slice(0, 8); store.set("bv-recent", JSON.stringify(list));
    // ยังไม่รู้แทร็ก ถามรายชื่อก่อน · มีมากกว่าหนึ่งให้เลือก (พี่กันสั่ง 10 พ.ย. 2569)
    // ระหว่างรอรายชื่อ หน้าเดิมค้างไว้ ยังไม่ตั้งไฟล์ใหม่ · เดิมตั้งไฟล์ทันที หน้ากราฟเปล่าแวบหนึ่งเฟรมก่อนขึ้นหน้าเลือกแทร็ก (BUGS ข้อ 81)
    const ask = ++askRef.current;
    // เคยเปิดไฟล์นี้แล้ว รู้รายชื่อแทร็กอยู่แล้ว ไม่ต้องถามใหม่ เข้าหน้าเลือกแทร็กหรือหน้ากราฟทันที
    const known = !tk ? infoOf(p)?.tracks : undefined;
    if (known && known.length === 1) tk = known[0].id;
    else if (known && known.length > 1) {
      await bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false);
      if (ask !== askRef.current) return;
      if (fresh) { setZoom([]); setPin(null); setHover(null); }
      setAsking(null); setPath(p); raw.current = undefined; setInfo(null); setChoose({ path: p, tracks: known }); setVer((v) => v + 1); return;
    }
    if (!tk) {
      // ระหว่างรอ ขึ้นแถบไฟล์กับโครงจางของหน้าเลือกแทร็กทันที กดแล้วเข้าหน้าไฟล์เลย ไม่ค้างที่หน้ารวม และไม่ใช่หน้ากราฟเปล่า (BUGS ข้อ 81 82)
      setAsking(p);
      await bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false);
      let list: BrTrack[] = [];
      try { list = await bitrateApi.tracks(p); } catch (e) { if (ask === askRef.current) { setAsking(null); setPath(p); raw.current = undefined; setInfo(null); setChoose(null); setErr(String(e)); } return; }
      if (ask !== askRef.current) return;
      if (fresh) { setZoom([]); setPin(null); setHover(null); }
      setAsking(null); setPath(p); raw.current = undefined; setInfo(null); setVer((v) => v + 1);
      if (list.length > 1) { setChoose({ path: p, tracks: list }); return; }
      tk = list[0]?.id ?? "auto";
    } else {
      if (fresh) { setZoom([]); setPin(null); setHover(null); }
      setAsking(null); setPath(p);
    }
    setChoose(null); setTrack(tk);
    const key = p + "#" + tk;
    const hit = CACHE.get(key);
    if (!force && hit?.raw[src]?.done) { await bitrateApi.stop().catch(() => {}); run.current = -1; raw.current = hit.raw[src]; setInfo(hit.info); setRunning(false); setVer((v) => v + 1); return; }
    const r: Raw = { t: [], s: [], k: "", tmin: Infinity, readTo: 0, done: false };
    raw.current = r; run.current = -1; setRunning(true); if (!hit) setInfo(null); setVer((v) => v + 1);
    // เลขรอบตั้งก่อนเรียก ข้อมูลก้อนแรกที่มาถึงก่อนคำสั่งตอบกลับจะไม่ถูกทิ้ง
    const id = bitrateApi.nextRun(); run.current = id;
    try {
      await ready.current;
      const i = await bitrateApi.start(p, src, id, tk);
      if (raw.current !== r) return;
      setInfo(i);
      const e = CACHE.get(key) ?? { info: i, raw: {} }; e.info = i; e.raw[src] = r; remember(key, e);
    } catch (e) { if (raw.current === r) { setRunning(false); setErr(String(e)); } }
  }, [path, track]);
  const setMode = (m: Mode) => { setModeState(m); store.set("brn-mode", m); if (path) void open(path, m); };
  const pick = async () => { const p = await pickFile("media"); if (p) void open(p, modeSel); };
  const stop = () => { void bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false); };
  const home = () => { stop(); askRef.current++; raw.current = undefined; setRecent(recentList()); setAsking(null); setPath(null); setInfo(null); setChoose(null); setTrack(""); setZoom([]); setPin(null); setErr(""); };
  const forget = (p: string) => { const l = recentList().filter((x) => x !== p); store.set("bv-recent", JSON.stringify(l)); setRecent(l); };

  // คีย์ลัดแบบเดียวกับ Bitrate Viewer · F5 อ่านใหม่ · Esc เอาจุดที่ปักออก
  const pageOn = usePageActiveRef();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับปุ่มลัด (BUGS ข้อ 9)
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "F5" && path) { e.preventDefault(); void open(path, modeSel, true); return; }
      if (e.key === "Escape" && pin != null) { setPin(null); return; }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const m = ({ s: "sec", g: "gop", x: "gopx", f: "frm" } as Record<string, Mode>)[e.key.toLowerCase()];
      if (m) { e.preventDefault(); setMode(m); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  // ตัวตรวจเปิดไฟล์ได้ · ส่งแทร็กมาด้วยจะไม่ขึ้นหน้าเลือกแทร็ก
  useEffect(() => { (window as unknown as { __brnOpen?: (p: string, t?: string) => void }).__brnOpen = (p, t) => void open(p, modeSel, false, t); });
  // ลากไฟล์จาก Explorer มาวาง
  const openRef = useRef(open); openRef.current = open;
  const modeRef = useRef(modeSel); modeRef.current = modeSel;
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-brn]")) void openRef.current(e.payload.paths[0], modeRef.current);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);
  // มาจากปุ่มบิตเรตวิดีโอในแผงขวาของชั้นวาง (พี่กันสั่ง 10 พ.ย. 2569)
  useEffect(() => { if (initialPath) { void open(initialPath, modeSel, false, initialTrack ?? undefined); onConsumed?.(); } }, [initialPath]); // eslint-disable-line react-hooks/exhaustive-deps
  return { open, setMode, pick, stop, home, forget, pageOn, openRef, modeRef };
}
