/* วาดกราฟลงแคนวาส เมาส์บนกราฟ ซูม แถบช่วงที่ซูม และตำแหน่งชี้
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef } from "react";
import { C, niceUp } from "./classicParts";
import type { V2 } from "./bvCtx";

export function useBvPlot(c: V2) {
  const { S, auto, bars, box, cur, cvRef, drag, gaps, grad, hold, marks, maxV, mode, path, plotRef, sel, setCur, setGrad, setMarks, setSel, setShowCur, setTopBand, setTrack, setZoom, showCur, span, stats, tOf, top, topBand, totalSec, track, xOf, yOf, z0, z1, zoom } = c;
  // ---------- วาด ----------
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.plot; g.fillRect(0, 0, box.w, box.h);
    const W = box.w, H = box.h;
    const hline = (v: number, color: string) => { const y = Math.round(yOf(v)) + 0.5; if (y < 0 || y > H) return; g.strokeStyle = color; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); };
    if (path) {
      // เส้นประแบ่งระดับ ทุกหนึ่งในสิบของค่าสูงสุด
      g.strokeStyle = C.grid; g.lineWidth = 1; g.setLineDash([2, 3]);
      const stepV = auto ? niceUp(top / 10) : maxV / 10;
      for (let k = 1; k * stepV < top; k++) { const v = k * stepV; if (!auto && (k === 5 || k === 10)) continue; const y = Math.round(yOf(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.setLineDash([]);
      const ym = yOf(maxV);
      const purple = grad ? g.createLinearGradient(0, H, 0, ym) : null; purple?.addColorStop(0, C.purpleLo); purple?.addColorStop(1, C.purpleHi);
      const pink = grad ? g.createLinearGradient(0, H, 0, ym) : null; pink?.addColorStop(0, C.pinkLo); pink?.addColorStop(1, C.pinkHi);
      for (const b of bars) {
        const x0 = Math.floor(xOf(b.t0)), x1 = Math.max(x0 + 1, Math.floor(xOf(b.t1)));
        // แท่งกว้างตั้งแต่ 3 จุดเว้นช่องขวา 1 จุดเป็นสีพื้นกราฟ แต่ละช่วงแยกกัน · แคบกว่านั้นติดกันเหมือนเดิม หลักเดียวกับแบบชั้นหนัง (BUGS ข้อ 43 44)
        const w = x1 - x0 - (gaps && x1 - x0 >= 3 ? 1 : 0);
        const yv = yOf(b.v), ya = yOf(Math.min(b.v, b.avg));
        g.fillStyle = purple ?? C.purpleLo; g.fillRect(x0, ya, w, H - ya);
        if (b.v > b.avg) { const yTop = Math.max(yv, Math.min(ya, ym)); g.fillStyle = pink ?? C.pinkLo; g.fillRect(x0, yTop, w, ya - yTop); }
        if (b.v > maxV) { g.fillStyle = C.over; g.fillRect(x0, yv, w, Math.min(ym, ya) - yv); }
      }
      // ค่าเฉลี่ยสะสม
      if (bars.length) {
        g.strokeStyle = C.avg; g.lineWidth = 1; g.beginPath();
        bars.forEach((b, i) => { const x = xOf((b.t0 + b.t1) / 2), y = yOf(b.avg); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      // เส้นกลาง เส้นสูงสุดที่ตั้ง · เส้นที่เปิดด้วยคลิกพร้อมปุ่ม
      hline(maxV / 2, C.mid); hline(maxV, C.red);
      if (S.n && marks.avg) hline(stats.avg, C.lineAvg);
      if (S.n && marks.max) hline(stats.peak, C.lineMax);
      if (S.n && marks.min) hline(stats.min, C.lineMin);
      // คีย์เฟรมเป็นขีดเล็กที่แกนล่าง เฉพาะตอนเห็นไม่เกิน 150 ขีด
      const ks = S.keys.filter((k) => k >= z0 && k <= z1);
      if (ks.length <= 150) { g.strokeStyle = C.key; for (const k of ks) { const x = Math.round(xOf(k)) + 0.5; g.beginPath(); g.moveTo(x, H); g.lineTo(x, H - 6); g.stroke(); } }
      // ขีดตำแหน่งจุดสูงสุด สีแดง จุดต่ำสุด สีดำ
      const tick = (i: number, color: string) => { if (i < 0) return; const t = (S.t0[i] + S.t1[i]) / 2; if (t < z0 || t > z1) return; const x = Math.round(xOf(t)); g.fillStyle = color; g.fillRect(x - 1, H - 10, 3, 10); };
      tick(stats.pAt, C.red); tick(stats.mAt, C.mid);
      // ขีดทุก 5% ตอนเมาส์อยู่แถบบน · ทุก 25% ยาวกว่า
      if (topBand) { g.strokeStyle = C.mid; for (let p = 5; p < 100; p += 5) { const x = Math.round((W * p) / 100) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, p % 25 ? 5 : 10); g.stroke(); } }
      // เคอร์เซอร์
      if (cur != null && showCur && cur >= z0 && cur <= z1) { const x = Math.round(xOf(cur)) + 0.5; g.strokeStyle = C.cursor; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    }
    g.strokeStyle = C.frame; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  });

  // ---------- เมาส์ ----------
  const xIn = (e: React.MouseEvent) => { const rc = plotRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(box.w, e.clientX - rc.left)), y: e.clientY - rc.top }; };
  const sampleAt = (t: number) => { let lo = 0, hi = S.n - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S.t1[m] <= t) lo = m + 1; else if (S.t0[m] > t) hi = m - 1; else return m; } return -1; };
  const onDown = (e: React.MouseEvent) => { if (!path || e.button !== 0) return; const { x } = xIn(e); drag.current = { x, t: tOf(x), moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    if (!path) return;
    const { x, y } = xIn(e);
    setTopBand(y >= 0 && y < 14);
    if (hold.current) hold.current = false; else if (track && S.n) setCur(tOf(x));
    const d = drag.current;
    if (d && (e.buttons & 1)) { if (Math.abs(x - d.x) > 3) d.moved = true; if (d.moved) { const t = tOf(x); setSel([Math.min(d.t, t), Math.max(d.t, t)]); } }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (!path || e.button !== 0 || !d || d.moved) return;
    if (e.ctrlKey && e.shiftKey && e.altKey) { const on = !(marks.avg && marks.max && marks.min); setMarks({ avg: on, max: on, min: on }); return; }
    if (e.ctrlKey) { setMarks((m) => ({ ...m, avg: !m.avg })); return; }
    if (e.shiftKey) { setMarks((m) => ({ ...m, max: !m.max })); return; }
    if (e.altKey) { setMarks((m) => ({ ...m, min: !m.min })); return; }
    if (sel) setSel(null);
  };
  const pushZoom = (a: number, b: number) => { const lo = Math.max(0, a), hi = Math.min(totalSec, b); if (hi - lo > 0.001) setZoom((z) => [...z, [lo, hi]]); setSel(null); };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault(); if (!path) return;
    const t = tOf(xIn(e).x);
    // หนึ่งช่องต่อหนึ่งจุดภาพ ช่วงที่เห็น = ความยาวช่องตรงนั้น × ความกว้างกราฟเป็นจุดภาพ (คู่มือตัวจริง) · ต่อวินาทีบนกราฟกว้าง 600 จุดเห็น 600 วินาที
    // ซูมละเอียดกว่านั้นอยู่แล้วหรือไฟล์สั้นกว่านั้น ไม่เพิ่มชั้นซูมที่กว้างกว่าเดิม (เดิมกดตอนซูมอยู่กลายเป็นซูมออก AUDIT ข้อ 122) · ชิดขอบไฟล์เลื่อนช่วงเข้ามา ไม่หดช่วง
    if (e.ctrlKey && e.altKey && e.shiftKey) {
      const i = sampleAt(t); const w = Math.min(totalSec, (i >= 0 ? S.t1[i] - S.t0[i] : 1) * box.w);
      if (w >= span - 0.001) return;
      const a = Math.max(0, Math.min(totalSec - w, t - w / 2)); pushZoom(a, a + w); return;
    }
    if (e.ctrlKey) { setTrack((v) => !v); return; }
    if (e.altKey) { setShowCur((v) => !v); return; }
    if (e.shiftKey) { setGrad((v) => !v); return; }
    if (sel && t >= sel[0] && t <= sel[1]) pushZoom(sel[0], sel[1]);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!path || !S.n) return;
    if (e.deltaY < 0) { setZoom((z) => z.slice(0, -1)); return; }
    const t = tOf(xIn(e).x); const w = span / 2; pushZoom(Math.max(0, Math.min(totalSec - w, t - w / 2)), Math.max(0, Math.min(totalSec - w, t - w / 2)) + w);
  };

  // ลากแถบช่วงที่ซูม · ความกว้างช่วงเท่าเดิม เลื่อนแค่ตำแหน่ง แทนที่ระดับซูมบนสุดของกอง (BUGS ข้อ 47)
  const barRef = useRef<HTMLDivElement>(null);
  const onBarDown = (e: React.MouseEvent) => {
    if (!zoom.length || !barRef.current || e.button !== 0) return;
    e.preventDefault();
    const r = barRef.current.getBoundingClientRect(), w = span;
    const tAt = (x: number) => ((x - r.left) / r.width) * totalSec;
    const t = tAt(e.clientX), off = t >= z0 && t <= z1 ? t - z0 : w / 2;
    const move = (cx: number) => { const a = Math.max(0, Math.min(totalSec - w, tAt(cx) - off)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + w]] : z)); };
    move(e.clientX);
    const mm = (ev: MouseEvent) => move(ev.clientX);
    const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  };

  const ci = cur == null ? -1 : sampleAt(cur);
  const curBar = cur == null ? null : bars.find((b) => cur >= b.t0 && cur < b.t1) ?? null;
  const curType = mode === "frm" && ci >= 0 ? S.typ[ci] : "";
  const jumpI = (back: boolean) => {
    if (!S.n || cur == null) return;
    let i = ci < 0 ? 0 : ci;
    for (i += back ? -1 : 1; i >= 0 && i < S.n; i += back ? -1 : 1) if (S.typ[i] === "I") break;
    if (i < 0 || i >= S.n) return;
    const t = S.t0[i] + 0.0001; hold.current = true; setCur(t);
    if (t < z0 || t > z1) { const w = span; const a = Math.max(0, Math.min(totalSec - w, t - w / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + w]] : z)); }
  };
  return { xIn, sampleAt, onDown, onMove, onUp, pushZoom, onContext, onWheel, barRef, onBarDown, ci, curBar, curType, jumpI };
}
