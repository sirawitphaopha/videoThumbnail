/* ตัวอย่าง สถิติ แท่งในช่วงที่เห็น และสเกล
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useMemo, useRef } from "react";
import { Raw, Samples, buildSamples, kbps, niceNear, niceUp } from "./classicParts";
import type { V1 } from "./bvCtx";

export function useBvStats(c: V1) {
  const { auto, box, info, mode, raw, ver, zoom } = c;
  const r = raw.current;
  const fps = info?.fps ?? 0;
  const dur = info?.duration && info.duration > 0 ? info.duration : r && r.t.length ? r.readTo - r.tmin : 0;
  const totalSec = Math.max(1, dur);
  // ระหว่างอ่าน คิดตัวอย่างใหม่ไม่เกิน 700 ms ละครั้ง อ่านจบหรือเปลี่ยนวิธีคิดใหม่ทันที (AUDIT ข้อ 119 · เดิมคิดทั้งก้อนทุก 120 ms)
  const sMemo = useRef<{ at: number; key: string; r?: Raw; S?: Samples }>({ at: 0, key: "" });
  const S = useMemo(() => {
    const m = sMemo.current, now = performance.now(), key = `${mode}|${fps}`;
    if (r && !r.done && m.r === r && m.key === key && m.S && now - m.at < 700) return m.S;
    const out = buildSamples(r, mode, fps);
    sMemo.current = { at: now, key, r, S: out };
    return out;
  }, [r, mode, fps, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => {
    let peak = 0, min = Infinity, pAt = -1, mAt = -1, sumB = 0, sumT = 0;
    const cum = new Float64Array(S.n);
    for (let i = 0; i < S.n; i++) {
      const v = kbps(S.b[i], S.t1[i] - S.t0[i]);
      if (v > peak) { peak = v; pAt = i; }
      if (v < min) { min = v; mAt = i; }
      sumB += S.b[i]; sumT += S.t1[i] - S.t0[i]; cum[i] = kbps(sumB, sumT);
    }
    return { peak, min: S.n ? min : 0, pAt, mAt, avg: sumT ? kbps(sumB, sumT) : 0, cum };
  }, [S]);
  const [z0, z1] = zoom.length ? zoom[zoom.length - 1] : [0, totalSec];
  const span = Math.max(0.001, z1 - z0);
  const est = info && info.duration > 0 && info.kind !== "audio" ? (info.size * 8) / 1000 / info.duration : 0;
  // เส้น Max ตั้งจากบิตเรตเฉลี่ยของทั้งไฟล์ ไม่ขยับระหว่างอ่าน (ปรับเป็นของเรา ตัวจริงตั้ง 10,000 kbps ตายตัว)
  const maxV = niceNear(Math.max(est || stats.avg, 1) * 2);

  // แท่งในช่วงที่เห็น · รวมหลายตัวอย่างต่อแท่งตามความกว้าง
  const maxBars = Math.max(10, Math.floor(box.w / 3));
  const vis: number[] = [];
  for (let i = 0; i < S.n; i++) if (S.t1[i] > z0 && S.t0[i] < z1) vis.push(i);
  const group = Math.max(1, Math.ceil(vis.length / maxBars));
  const bars: { v: number; avg: number; t0: number; t1: number; i0: number; i1: number }[] = [];
  for (let g = 0; g < vis.length; g += group) {
    const i0 = vis[g], i1 = vis[Math.min(vis.length, g + group) - 1];
    let b = 0; for (let i = i0; i <= i1; i++) b += S.b[i];
    bars.push({ v: kbps(b, S.t1[i1] - S.t0[i0]), avg: stats.cum[i1], t0: S.t0[i0], t1: S.t1[i1], i0, i1 });
  }
  const visPeak = bars.reduce((m, b) => Math.max(m, b.v), 0);
  const top = auto ? Math.max(1, visPeak * 1.06) : Math.max(maxV * 1.18, niceUp(stats.peak) > maxV * 1.18 ? stats.peak * 1.06 : 0);
  const yOf = (v: number) => box.h - (Math.min(v, top) / top) * box.h;
  const xOf = (t: number) => ((t - z0) / span) * box.w;
  const tOf = (x: number) => z0 + (x / box.w) * span;
  return { r, fps, dur, totalSec, sMemo, S, stats, z0, z1, span, est, maxV, maxBars, vis, group, bars, visPeak, top, yOf, xOf, tOf };
}
