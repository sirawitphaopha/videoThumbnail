/* เมาส์บนกราฟ ซูม ปักจุด ค่าที่ชี้ และชิ้นเล็กที่ใช้หลายส่วน
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { kbps } from "./common";
import { HZ_MIN } from "./zoom";
import type { C3 } from "./brCtx";

export function useBrMouse(c: C3) {
  const { L, S, bars, drag, hover, info, movies, path, pin, plotRef, pw, r, setHover, setPin, setSel, setVz, setZoom, span, tOf, total, z0, z1, zoom } = c;
  // ---------- เมาส์บนกราฟ ----------
  const pos = (e: React.MouseEvent) => { const rc = plotRef.current!.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top }; };
  const inPlot = (x: number) => x >= L && x <= L + pw;
  const sampleAt = (t: number) => { let lo = 0, hi = S.n - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S.t1[m] <= t) lo = m + 1; else if (S.t0[m] > t) hi = m - 1; else return m; } return -1; };
  const pushZoom = (a: number, b: number) => { const lo = Math.max(0, a), hi = Math.min(total, b); if (hi - lo > 0.02) setZoom((z) => [...z, [lo, hi]]); };
  const zoomBy = (f: number, at?: number) => { const c = at ?? (z0 + z1) / 2; const w = Math.min(total, Math.max(0.2, span * f)); if (w >= total - 1e-6) { setZoom([]); return; } const a = Math.max(0, Math.min(total - w, c - (c - z0) * (w / span))); setZoom((z) => [...z, [a, a + w]]); };
  const setSpan = (w: number) => { const ww = Math.max(HZ_MIN, Math.min(total, w)); if (ww >= total - 1e-6) { setZoom([]); return; } const c = (z0 + z1) / 2; const a = Math.max(0, Math.min(total - ww, c - ww / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + ww]] : [[a, a + ww]])); };
  const resetZoom = () => { setZoom([]); setSel(null); setVz(1); };
  // ปุ่มช่วงซูมกับดรอปดาวน์ตอนหัวกราฟแคบใช้ค่าเดียวกัน · ช่วงที่ไม่ตรงปุ่มไหน ดรอปดาวน์ขึ้นความยาวช่วงที่ดู (BUGS ข้อ 103)
  const zKey = !zoom.length ? "all" : span <= 11 ? "10" : span <= 61 ? "60" : "x";
  const pickZ = (v: string) => preset(v === "all" ? null : Number(v));
  const preset = (w: number | null) => { if (!w || w >= total) { setZoom([]); return; } const c = pin ?? (z0 + z1) / 2; const a = Math.max(0, Math.min(total - w, c - w / 2)); setZoom([[a, a + w]]); };
  const onDown = (e: React.MouseEvent) => { if (e.button !== 0 || !S.n) return; const { x } = pos(e); if (!inPlot(x)) return; drag.current = { x, t: tOf(x), moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    if (!S.n) return;
    const { x, y } = pos(e);
    if (!inPlot(x)) { setHover(null); return; }
    setHover({ x, y, t: tOf(x) });
    const d = drag.current;
    if (d && (e.buttons & 1)) { if (Math.abs(x - d.x) > 4) d.moved = true; if (d.moved) { const t = tOf(x); setSel([Math.min(d.t, t), Math.max(d.t, t)]); } }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || e.button !== 0) return;
    // ช่วงซูมคิดจากจุดที่กดลงกับจุดที่ปล่อย ไม่อ่านจากสถานะ sel ที่อาจยังเป็นค่าเก่าตอนปล่อยเมาส์
    const t = tOf(Math.max(L, Math.min(L + pw, pos(e).x)));
    if (d.moved) { pushZoom(Math.min(d.t, t), Math.max(d.t, t)); setSel(null); return; }
    setPin(t);
  };
  const onWheel = (e: React.WheelEvent) => { if (!S.n) return; const { x } = pos(e); if (!inPlot(x)) return; zoomBy(e.deltaY < 0 ? 0.5 : 2, tOf(x)); };

  const hi = hover ? sampleAt(hover.t) : -1;
  const hb = hover ? bars.find((b) => hover.t >= b.t0 && hover.t < b.t1) ?? null : null;
  const pi = pin != null ? sampleAt(pin) : -1;
  const pv = pi >= 0 ? kbps(S.b[pi], S.t1[pi] - S.t0[pi]) : 0;
  const jumpI = (back: boolean) => {
    if (!S.n || pin == null) return;
    let i = pi < 0 ? 0 : pi;
    for (i += back ? -1 : 1; i >= 0 && i < S.n; i += back ? -1 : 1) if (S.typ[i] === "I") break;
    if (i < 0 || i >= S.n) return;
    const t = S.t0[i] + 0.0001; setPin(t);
    if (t < z0 || t > z1) { const a = Math.max(0, Math.min(total - span, t - span / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + span]] : z)); }
  };
  const readPct = info && info.duration > 0 && r && isFinite(r.tmin) ? Math.min(100, Math.round(((r.readTo - r.tmin) / info.duration) * 100)) : 0;
  const name = path ? path.split(/[\\/]/).pop() ?? "" : "";
  const movieOf = (p: string) => movies.find((m) => m.path.toLowerCase() === p.toLowerCase());
  const film = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" /></svg>;
  const extCard = (p: string) => { const e = p.match(/\.([^.\\/]+)$/)?.[1]; return e ? <span className="rext">{e.toUpperCase()}</span> : null; };
  const thumbOf = (p: string) => { const m = movieOf(p); return m?.thumb ?? m?.linked?.[0]?.thumb ?? null; };
  return { pos, inPlot, sampleAt, pushZoom, zoomBy, setSpan, resetZoom, zKey, pickZ, preset, onDown, onMove, onUp, onWheel, hi, hb, pi, pv, jumpI, readPct, name, movieOf, film, extCard, thumbOf };
}
