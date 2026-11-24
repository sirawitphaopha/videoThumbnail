/* คิดตัวอย่าง สถิติ เพดาน แท่งในช่วงที่เห็น และสเกลของกราฟ
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { useMemo, useRef } from "react";
import { useFitClass, useFitSwitch } from "../../lib/fitSwitch";
import { LOSSLESS, PKT_MAX, Raw, Samples, buildSamples, frameDur, kbps, niceNear, niceUp } from "./common";
import type { C1 } from "./brCtx";

export function useBrStats(c: C1) {
  const { audio, box, ctlRef, info, mode, path, raw, res, scale, ver, vz, zoom } = c;
  // ---------- คิดตัวอย่าง ----------
  const r = raw.current;
  const fps = info?.fps ?? 0;
  const dur = info?.duration && info.duration > 0 ? info.duration : r && r.t.length ? r.readTo - r.tmin : 0;
  const total = Math.max(1, dur);
  const [z0, z1] = zoom.length ? zoom[zoom.length - 1] : [0, total];
  const span = Math.max(0.001, z1 - z0);
  // ขอบกราฟ · ซ้ายมีป้ายบิตเรต ล่างมีป้ายเวลา · บนมีหน่วยกับป้ายแท่งละ
  const L = 54, R = 14, T = 24, B = 26;
  const pw = Math.max(10, box.w - L - R), ph = Math.max(10, box.h - T - B);
  const maxBars = Math.max(10, Math.floor(pw / 3));
  // ความละเอียดที่ใช้จริง · อัตโนมัติเลือกระดับละเอียดสุดที่แท่งในช่วงที่เห็นยังกว้างอย่างน้อย 3 จุด (BUGS ข้อ 42 ต่อ 2)
  const fd = frameDur(r, fps);
  const pktOk = !!r && r.t.length > 0 && r.t.length <= PKT_MAX;
  const bin: number | "pkt" = mode !== "sec" ? 1 : res === "pkt" ? (pktOk ? "pkt" : 0.1) : res === "auto"
    ? (pktOk && span / fd <= maxBars ? "pkt" : ([0.1, 0.5, 1, 5, 10].find((w) => span / w <= maxBars) ?? 10)) : Number(res);
  const binTxt = bin === "pkt" ? "ทีละเฟรม" : `${bin} วินาที`;
  const ctlCompact = useFitSwitch(ctlRef, `${audio}|${path}|${info?.tracks.length ?? 0}`);
  const headRef = useRef<HTMLDivElement>(null);
  const headCompact = useFitSwitch(headRef, `${audio}|${path}|${Math.round(z0)}|${Math.round(z1)}`);
  // ซ่อนข้อความช่วงเวลาแล้วยังไม่พอ ปุ่มช่วงซูมเป็นดรอปดาวน์ วัดจากที่ว่างจริงแบบหัวกราฟหน้ากราฟเสียง (BUGS ข้อ 103)
  useFitClass(".brn-head");
  // ระหว่างอ่าน คิดตัวอย่างใหม่ไม่เกิน 700 ms ละครั้ง · เดิมคิดทั้งก้อนใหม่ทุกก้อนข้อมูล (ทุก 120 ms) ไฟล์ TrueHD ยาวงานโตเป็นกำลังสอง หน้าจอหน่วง (AUDIT ข้อ 119)
  // อ่านจบหรือเปลี่ยนวิธีคิด ความละเอียด คิดใหม่ทันที
  const sMemo = useRef<{ at: number; key: string; r?: Raw; S?: Samples }>({ at: 0, key: "" });
  const sKey = `${mode}|${fps}|${bin}`;
  const S = useMemo(() => {
    const m = sMemo.current, now = performance.now();
    if (r && !r.done && m.r === r && m.key === sKey && m.S && now - m.at < 700) return m.S;
    const out = buildSamples(r, mode, fps, bin);
    sMemo.current = { at: now, key: sKey, r, S: out };
    return out;
  }, [r, mode, fps, bin, sKey, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => {
    let peak = 0, min = Infinity, pAt = -1, mAt = -1, sumB = 0, sumT = 0;
    const cum = new Float64Array(S.n);
    for (let i = 0; i < S.n; i++) {
      const v = kbps(S.b[i], S.t1[i] - S.t0[i]);
      if (v > peak) { peak = v; pAt = i; }
      if (v < min) { min = v; mAt = i; }
      sumB += S.b[i]; sumT += S.t1[i] - S.t0[i]; cum[i] = kbps(sumB, sumT);
    }
    const types = { I: 0, P: 0, B: 0, sI: 0, sP: 0, sB: 0 };
    if (mode === "frm") for (let i = 0; i < S.n; i++) { const c = S.typ[i] as "I" | "P" | "B"; if (c in types) { types[c] += 1; types[`s${c}` as "sI"] += S.b[i]; } }
    const avg = sumT ? kbps(sumB, sumT) : 0;
    // ความแกว่ง ส่วนเบี่ยงเบนมาตรฐานเทียบค่าเฉลี่ย (ถ่วงตามความยาวของแต่ละช่วง)
    let vv = 0; for (let i = 0; i < S.n; i++) { const d = kbps(S.b[i], S.t1[i] - S.t0[i]) - avg; vv += d * d * (S.t1[i] - S.t0[i]); }
    const cv = sumT && avg ? Math.sqrt(vv / sumT) / avg : 0;
    return { peak, min: S.n ? min : 0, pAt, mAt, avg, cum, types, cv };
  }, [S, mode]);
  const est = info && info.duration > 0 && info.kind !== "audio" ? (info.size * 8) / 1000 / info.duration : 0;
  // ไฟล์เสียงแบบไม่เสียคุณภาพ เพดานจริงคือบิตเรตของเสียงดิบที่ยังไม่บีบ อัตราสุ่ม × บิต × จำนวนช่อง (BUGS ข้อ 119 · เช่น 96,000 × 24 × 2 = 4,608 kbps)
  // เห็นว่าบีบเหลือกี่เปอร์เซ็นต์ของเสียงดิบ ช่วงที่แตะเพดานคือเสียงที่บีบไม่ลง · แบบเสียคุณภาพกับวิดีโอใช้เฉลี่ย × 2 ตามเดิม
  const rawKbps = audio && info && LOSSLESS.test(info.codec) && info.sample_rate > 0 && info.bit_depth > 0 && info.channels > 0 ? (info.sample_rate * info.bit_depth * info.channels) / 1000 : 0;
  const ceil = rawKbps || niceNear(Math.max(est || st.avg, 1) * 2);
  // เวลาที่บิตเรตเกินเพดานรวม (วินาที) · คิดครั้งเดียวต่อชุดตัวอย่าง ไม่วนทุกครั้งที่ขยับเมาส์ (ทีละเฟรมมีได้เป็นล้านช่อง)
  const overSec = useMemo(() => { let o = 0; for (let i = 0; i < S.n; i++) if (kbps(S.b[i], S.t1[i] - S.t0[i]) > ceil) o += S.t1[i] - S.t0[i]; return o; }, [S, ceil]);
  // อ่านไม่ถึงท้ายไฟล์ · ffprobe รายงานว่าผิดพลาด หรืออ่านได้สั้นกว่าความยาวไฟล์ชัดเจน (AUDIT ข้อ 118) · ส่วนที่เหลือของกราฟลายจางพร้อมป้าย
  const readEnd = r && isFinite(r.tmin) ? r.readTo - r.tmin : 0;
  const cutAt = r?.done && info && info.duration > 0 && (r.partial || readEnd < info.duration - Math.max(2, info.duration * 0.02)) ? readEnd : null;

  // แท่งในช่วงที่เห็น · รวมหลายตัวอย่างต่อแท่งตามความกว้าง · คิดเฉพาะตอนข้อมูลหรือช่วงซูมเปลี่ยน
  const { bars, group } = useMemo(() => {
    const vis: number[] = [];
    for (let i = 0; i < S.n; i++) if (S.t1[i] > z0 && S.t0[i] < z1) vis.push(i);
    const g0 = Math.max(1, Math.ceil(vis.length / maxBars));
    const out: { v: number; avg: number; t0: number; t1: number; i0: number; i1: number }[] = [];
    for (let g = 0; g < vis.length; g += g0) {
      const i0 = vis[g], i1 = vis[Math.min(vis.length, g + g0) - 1];
      let b = 0; for (let i = i0; i <= i1; i++) b += S.b[i];
      out.push({ v: kbps(b, S.t1[i1] - S.t0[i0]), avg: st.cum[i1], t0: S.t0[i0], t1: S.t1[i1], i0, i1 });
    }
    return { bars: out, group: g0 };
  }, [S, st, z0, z1, maxBars]);
  const visPeak = bars.reduce((m, b) => Math.max(m, b.v), 0);
  const top = (scale === "data" ? niceUp(Math.max(1, visPeak) * 1.05) : Math.max(ceil * 1.15, stOver(st.peak, ceil))) / vz;
  function stOver(peak: number, c: number) { return peak > c * 1.15 ? peak * 1.05 : 0; }
  const xOf = (t: number) => L + ((t - z0) / span) * pw;
  const tOf = (x: number) => z0 + ((x - L) / pw) * span;
  const yOf = (v: number) => T + ph - (Math.min(v, top) / top) * ph;
  return { r, fps, dur, total, z0, z1, span, L, R, T, B, pw, ph, maxBars, fd, pktOk, bin, binTxt, ctlCompact, headRef, headCompact, sMemo, sKey, S, st, est, rawKbps, ceil, overSec, readEnd, cutAt, bars, group, visPeak, top, stOver, xOf, tOf, yOf };
}
