/* เปิดไฟล์ อ่านข้อมูลบิตเรต หยุด ปิดไฟล์ และช่องทางทดสอบ
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useRef } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { bitrateApi, inApp, pickFile, type BrTrack } from "../../lib/api";
import { CACHE, Mode, Raw, recentList, remember, srcOf, store } from "./classicParts";
import type { V0 } from "./bvCtx";

export function useBvData(c: V0) {
  const { askRef, audio, initialPath, initialTrack, modeSel, onConsumed, path, raw, ready, run, running, setAuto, setChoose, setCur, setErr, setGrad, setGradHead, setInfo, setMenu, setModeState, setPath, setRecent, setRunning, setSel, setStream, setVer, setZoom, stream } = c;
  const open = useCallback(async (p: string, m: Mode, force = false, trk?: string) => {
    const src = srcOf(m);
    let tk = trk ?? (p === path ? stream : "");
    setErr(""); setSel(null);
    if (p !== path || tk !== stream) { setZoom([]); setCur(null); }
    setPath(p);
    // ไฟล์เดียวกันเขียน / กับ  หรือตัวพิมพ์ต่างกัน ถือเป็นไฟล์เดียว ไม่ขึ้นซ้ำ (เจอ 10 พ.ย. 2569)
    const same = (a: string) => a.replace(/\//g, "\\").toLowerCase();
    const list = [p, ...recentList().filter((x) => same(x) !== same(p))].slice(0, 8); store.set("bv-recent", JSON.stringify(list)); setRecent(list);
    // ยังไม่รู้แทร็ก ถามรายชื่อก่อน · มีมากกว่าหนึ่งให้เลือกกลางกราฟ (พี่กันสั่ง 10 พ.ย. 2569)
    const ask = ++askRef.current;
    if (!tk) {
      await bitrateApi.stop().catch(() => {}); run.current = -1; raw.current = undefined; setRunning(false); setInfo(null); setChoose(null); setVer((v) => v + 1);
      let list: BrTrack[] = [];
      try { list = await bitrateApi.tracks(p); } catch (e) { if (ask === askRef.current) setErr(String(e)); return; }
      if (ask !== askRef.current) return;
      if (list.length > 1) { setChoose({ path: p, tracks: list }); return; }
      tk = list[0]?.id ?? "auto";
    }
    setChoose(null); setStream(tk);
    const key = p + "#" + tk;
    const hit = CACHE.get(key);
    if (!force && hit?.raw[src]?.done) {
      await bitrateApi.stop().catch(() => {}); run.current = -1;
      raw.current = hit.raw[src]; setInfo(hit.info); setRunning(false); setVer((v) => v + 1); return;
    }
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
  }, [path, stream]);

  const setMode = (m: Mode) => { if (audio && m !== "sec") return; setModeState(m); store.set("bv-mode", m); setMenu(false); if (path) void open(path, m); };
  const load = async () => { if (running) { await bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false); return; } const p = await pickFile("media"); if (p) void open(p, modeSel); };
  const close = () => { void bitrateApi.stop().catch(() => {}); askRef.current++; run.current = -1; raw.current = undefined; setPath(null); setInfo(null); setChoose(null); setStream(""); setRunning(false); setErr(""); setCur(null); setZoom([]); setSel(null); };

  // มาจากปุ่มบิตเรตวิดีโอในแผงขวาของชั้นวาง เปิดไฟล์นั้นเลย
  useEffect(() => { if (initialPath) { void open(initialPath, modeSel, false, initialTrack ?? undefined); onConsumed?.(); } }, [initialPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ตัวตรวจเปิดไฟล์และสลับวิธีผ่านพอร์ตดีบัก แทนการลากจาก Explorer และคีย์ลัด
  useEffect(() => {
    const w = window as unknown as { __bitrateOpen?: (p: string, t?: string) => void; __bitrateMode?: (m: Mode) => void };
    w.__bitrateOpen = (p, t) => void open(p, modeSel, false, t); w.__bitrateMode = (m) => setMode(m);
  });

  // ลากไฟล์มาวาง
  const openRef = useRef(open); openRef.current = open;
  const modeRef = useRef(modeSel); modeRef.current = modeSel;
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-bitrate]")) void openRef.current(e.payload.paths[0], modeRef.current);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // คีย์ลัดแบบตัวจริง
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับปุ่มลัด (BUGS ข้อ 9)
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "F5") { e.preventDefault(); if (path) void open(path, modeSel, true); return; }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      const m = ({ s: "sec", g: "gop", x: "gopx", f: "frm" } as Record<string, Mode>)[k];
      if (m) { e.preventDefault(); setMode(m); return; }
      if (k === "a") { e.preventDefault(); setAuto((v) => !v); }
      // มีข้อความที่ลากเลือกไว้ ปล่อย Ctrl+C ให้คัดลอกตามปกติของ Windows (AUDIT ข้อ 123)
      else if (k === "c") { if (window.getSelection()?.toString()) return; e.preventDefault(); setGrad((v) => !v); }
      else if (k === "d") { e.preventDefault(); setGradHead((v) => !v); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });

  // ---------- คิดตัวอย่าง ----------
  return { open, setMode, load, close, openRef, modeRef, pageOn };
}
