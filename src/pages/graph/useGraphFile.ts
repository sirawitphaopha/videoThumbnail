/* ชุดสี ภาพรวมของแทร็ก ไฟล์ล่าสุด ไฟล์ที่หาย และการเปิดไฟล์ตามคำขอ
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { graphApi, inApp, type GInfo, type GProgress, type GTrack, type Movie } from "../../lib/api";
import { overviewOnce, Prefs, CUSTOM, THEMES, themeOf } from "./common";
import { type Recent, loadRecent, saveRecent, PREF_KEY } from "./graphPrefs";
import type { G0 } from "./graphCtx";

export function useGraphFile(c: G0) {
  const { error, info, jumped, movies, nonce, onConsumed, ovRaw, path, plotRef, prefs, progress, req, setCenter, setCmp, setCodecDetail, setError, setHidden, setInfo, setMode, setNonce, setOvRaw, setPath, setPlotW, setPrefs, setProgress, setPsd, setReadSince, setTip, setTrack, setWin, setZoom, track, zoomOf } = c;
  const setPref =<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ก็ใช้ค่านี้ไปก่อน */ } return n; });
  const th = prefs.theme === CUSTOM ? themeOf(/^#[\da-f]{6}$/i.test(prefs.customColor) ? prefs.customColor : "#7a4fd0") : THEMES[prefs.theme];
  const movie: Movie | undefined = useMemo(() => movies.find((m) => m.path === path), [movies, path]);
  const t: GTrack | undefined = info?.tracks[track];
  const names = t?.names ?? [];
  const ov = ovRaw && ovRaw.key === `${path}|${track}` && ovRaw.o.env.length === names.length ? ovRaw.o : null;
  const dur = ov?.duration ?? info?.duration ?? 0;

  // เปิดจากที่อื่น (ชั้นวาง หน้าต่างผลตรวจ หน้าบิตเรต)
  const wantTrack = useRef<number | null>(null);
  useEffect(() => {
    if (!req) return;
    setMode("graph"); setCmp(null);
    setPath(req.path);
    wantTrack.current = req.track ?? null;
    if (req.track != null && req.path === path && info && req.track < info.tracks.length) { setTrack(req.track); wantTrack.current = null; }
    if (req.path === path && error) setNonce((n) => n + 1);
    if (req.t != null) { jumped.current = true; setCenter(req.t); setTip(req.t); setZoom(30); if (prefs.view !== "wave" && prefs.view !== "spec") setPref("view", "wave"); }
    onConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  // จดไฟล์ที่เปิดได้ลงรายการเปิดล่าสุด · จดตอนข้อมูลของไฟล์นั้นมาถึง
  // (เดิมจดตอนที่อยู่ไฟล์เปลี่ยน ข้อมูลไฟล์ก่อนหน้ายังไม่ถูกล้าง ได้ชื่อไฟล์ใหม่คู่กับข้อมูลไฟล์เก่า เจอตอนตรวจภาพ)
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const remember = (p: string, g: GInfo) => {
    const r: Recent = { path: p, name: p.split(/[\\/]/).pop() ?? p, size: g.size, duration: g.duration, audioOnly: g.audioOnly, layout: g.tracks[0]?.layout, at: Date.now() };
    setRecent((l) => { const n = [r, ...l.filter((x) => x.path.toLowerCase() !== p.toLowerCase())].slice(0, 12); saveRecent(n); return n; });
  };
  const forget = (p: string) => setRecent((l) => { const n = l.filter((x) => x.path !== p); saveRecent(n); return n; });
  // รายการเปิดล่าสุดบอกไฟล์ที่หายตั้งแต่ก่อนกด (พี่กันเคาะ 9 พ.ย. 2569 "ตามนั้น") · ถามใหม่ทุกครั้งที่กลับมาหน้านี้ เสียบไดรฟ์กลับแล้วหายเอง
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (path || !recent.length) return;
    let live = true;
    const ask = () => graphApi.exist(recent.map((r) => r.path)).then((ok) => { if (live) setGone(new Set(recent.filter((_, i) => !ok[i]).map((r) => r.path))); }, () => { /* ถามไม่ได้ ถือว่าไฟล์ยังอยู่ กดแล้วค่อยบอก */ });
    void ask();
    window.addEventListener("focus", ask);
    return () => { live = false; window.removeEventListener("focus", ask); };
  }, [path, recent]);
  /** กลับหน้ารวมกราฟเสียง · กำลังอ่านอยู่ก็หยุดอ่าน */
  const goHome = () => { if (progress != null) graphApi.cancel(); setPath(null); };

  // อ่านข้อมูลแทร็ก
  useEffect(() => {
    if (!path) return;
    let live = true;
    setInfo(null); setOvRaw(null); setWin(null); setPsd(null); setError(null); setHidden([]); setTrack(0); zoomOf.current = {};
    // ไฟล์ใหม่เริ่มที่ทั้งไฟล์ ความดังรวมทุกช่อง ความถี่เฉลี่ยรวมทุกช่อง · เปิดพร้อมเวลา (req.t) คงซูมที่ตั้งไว้ (AUDIT ข้อ 20 ข้อ 99)
    if (!jumped.current) setZoom("all");
    c.setLoudMode("mix"); c.setPsdCh("mix");
    graphApi.info(path).then((g) => {
      if (!live) return;
      setInfo(g); remember(path, g);
      const k = wantTrack.current;
      wantTrack.current = null;
      if (k != null && k > 0 && k < g.tracks.length) setTrack(k);
    }, (e) => { if (live) setError(String(e)); });
    // รายละเอียด codec จาก MediaInfo อ่านไม่ได้ก็ใช้ชื่อสั้นจาก ffprobe ตามเดิม
    setCodecDetail([]);
    graphApi.codecDetail(path).then((d) => { if (live) setCodecDetail(d); }, () => {});
    return () => { live = false; };
  }, [path, nonce]);

  // ภาพรวมทั้งไฟล์
  useEffect(() => {
    if (!path || !info) return;
    let live = true;
    setOvRaw(null); setWin(null); setPsd(null); setProgress(0); setReadSince(Date.now()); setError(null);
    let off: (() => void) | undefined;
    if (inApp) listen<GProgress>("graph-progress", (e) => { if (live && e.payload.path === path && e.payload.track === track) setProgress(e.payload.percent); }).then((u) => { if (live) off = u; else u(); });
    overviewOnce(path, track).then((o) => {
      if (!live) return;
      setProgress(null);
      if (!o) { setError("หยุดอ่านเสียงแล้ว"); return; }
      setOvRaw({ key: `${path}|${track}`, o });
      if (jumped.current) jumped.current = false;
      else { setTip(0); setCenter(o.duration / 2); }
    }, (e) => { if (live) { setProgress(null); setError(String(e)); } });
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, info, track]);

  // ความกว้างกรอบกราฟ ใช้ขอจำนวนคอลัมน์เท่าจุดภาพ
  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setPlotW(Math.max(200, el.clientWidth - 120))); ro.observe(el);
    return () => ro.disconnect();
  }, [ov]);

  return { setPref, th, movie, t, names, ov, dur, wantTrack, recent, setRecent, remember, forget, gone, setGone, goHome };
}
