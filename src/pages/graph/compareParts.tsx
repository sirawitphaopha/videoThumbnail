/* หน้ากราฟเสียง ส่วนประกอบของหน้าเทียบไฟล์ · สีประจำไฟล์ เวลาที่ใช้ไป ตัววาดภาพความถี่กับ Spek ของสองไฟล์ ขอบความถี่ ความดังเฉลี่ย ป้ายสรุป กราฟเส้นเทียบ
   แยกจาก GraphPage.tsx (ผ่าน CompareView.tsx) ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.9) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   ชื่อไฟล์บนจอ LABELS กับ Who และ PsdCmp อยู่ CompareView.tsx เพราะหน้าเทียบกำหนดค่า LABELS ใหม่ทุกครั้ง แยกไปแล้วกำหนดค่าข้ามไฟล์ไม่ได้ */
import { useEffect, useState } from "react";
import { type GInfo, type GOverview, type GWindow } from "../../lib/api";
import { FixedTime, Phr } from "../../components/ui";
import { THEMES, Theme, dec, minus, rulerTicks } from "./common";
import { HiCanvas, drawMatrix, drawRuler, hiCopy, sample, screenK, useCanvas } from "./draw";
import { Draw, Grab, VRange, axisY, vWindow } from "./parts";
import { edgeOf } from "./SpekView";

const CA = "#2a78d6", CB = "#eb6834";
const INK_A = "#1d5fae", INK_B = "#b4461a";
/** เทียบได้สูงสุดกี่ไฟล์ · พี่กันเคาะ 4 ไฟล์ 9 พ.ย. 2569 เกินนี้แถวกราฟเตี้ยจนดูยาก */
export const MAX_FILES = 4;
/** สีประจำไฟล์ตามลำดับ น้ำเงิน ส้ม เขียวน้ำทะเล ม่วง */
export const FILE_C = [CA, CB, "#1f9d7a", "#8a5cd6"];
export const FILE_INK = [INK_A, INK_B, "#12705a", "#6a3fb5"];
export const TH_A: Theme = { lane: "#f1f7fd", peak: "#a9cdf2", rms: INK_A, dark: "#0b2747", ramp: THEMES["ฟ้า"].ramp };
const TH_B: Theme = { lane: "#fdf4ef", peak: "#f6c2a8", rms: INK_B, dark: "#3d1406", ramp: THEMES["พีช"].ramp };
export const TH_FILE: Theme[] = [TH_A, TH_B, { lane: "#eef9f5", peak: "#a6dfcd", rms: FILE_INK[2], dark: "#06382c", ramp: THEMES["ฟ้า"].ramp }, { lane: "#f5f0fd", peak: "#cfbdf2", rms: FILE_INK[3], dark: "#2a1450", ramp: THEMES["ม่วง"].ramp }];
/** เวลาที่ใช้ไปตั้งแต่เริ่มอ่าน เดินทุกวินาที ความกว้างคงที่ ตัวเลขเปลี่ยนแล้วข้อความข้าง ๆ ไม่ขยับ
 *  (BUGS ข้อ 145 พี่กันสั่ง 16 พ.ย. 2569 "ใส่เวลาที่กำลังวิ่ง% ไว้ด้วย") */
export function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const t = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return <span data-graph-elapsed>ใช้ไป <FixedTime t={t} longest="00:00" /></span>;
}

export type Side = { info: GInfo | null; ov: GOverview | null; err: string | null; pct: number | null; since?: number };
export const EMPTY: Side = { info: null, ov: null, err: null, pct: null };

/** ความถี่ของช่องหนึ่ง แกนตั้งเส้นตรง 0 ถึงครึ่งอัตราสุ่มที่สูงกว่า เท่ากันทั้งสองไฟล์ · เหนือครึ่งอัตราสุ่มของไฟล์นี้ ไม่มีเสียง (ดำ) */
export function drawSpecCmp(g: CanvasRenderingContext2D, w: number, h: number, ch: number, ov: GOverview, t0: number, t1: number, nyq: number, maxNyq: number, colors: Uint8ClampedArray, z = 1, b = 0, hi?: GWindow) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const d = dec((hi ?? ov).spec[ch] ?? ""), B = hi ? hi.bins : ov.specBins, rows = Math.max(32, Math.min(hi ? 512 : 200, Math.round(h)));
  if (!d.length) return;
  const Cn = Math.round(d.length / B), T0 = hi ? hi.t0 : 0, Tn = hi ? hi.t1 : ov.duration;
  const c0 = Math.max(0, Math.floor((t0 - T0) / (Tn - T0 || 1) * Cn)), c1 = Math.max(c0 + 1, Math.ceil((t1 - T0) / (Tn - T0 || 1) * Cn));
  drawMatrix(g, 0, 0, w, h, Math.min(Cn, c1) - c0, rows, colors, (row, col) => {
    const f = (b + (row + 0.5) / rows / z) * maxNyq;
    return f > nyq ? 0 : d[(c0 + col) * B + Math.min(B - 1, Math.floor(f / nyq * B))] ?? 0;
  });
}

/** ภาพวิเคราะห์แบบ Spek ของไฟล์หนึ่ง · รวมทุกช่อง (ไม่นับเสียงเบส) เอาค่ามากสุด · แกนตั้งเท่ากันทั้งสองไฟล์ · เส้นประตรงขอบบนของเสียง */
export function drawSpekCmp(g: CanvasRenderingContext2D, w: number, h: number, ov: GOverview, names: string[], nyq: number, maxNyq: number, t0: number, t1: number, title: string, sub: string, top: number | null, colors: Uint8ClampedArray, ramp: string[], z = 1, zb = 0, hi?: GWindow) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const f0 = zb * maxNyq, fSpan = maxNyq / z;
  const L = 62, R = 86, T = 46, Bm = 28, pw = w - L - R, ph = h - T - Bm;
  const chans = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  const srcs = (chans.length ? chans : [0]).map((i) => dec((hi ?? ov).spec[i] ?? ""));
  const B = hi ? hi.bins : ov.specBins, Cn = hi ? Math.round(srcs[0].length / B) : ov.specCols, T0 = hi ? hi.t0 : 0, Tn = hi ? hi.t1 : ov.duration;
  const c0 = Math.max(0, Math.floor((t0 - T0) / (Tn - T0 || 1) * Cn)), c1 = Math.max(c0 + 1, Math.min(Cn, Math.ceil((t1 - T0) / (Tn - T0 || 1) * Cn)));
  const rows = Math.max(32, Math.round(ph / (hi ? 1 : 2)));
  drawMatrix(g, L, T, pw, ph, c1 - c0, rows, colors, (row, col) => {
    const f = f0 + (row + 0.5) / rows * fSpan; if (f > nyq) return 0;
    const b = Math.min(B - 1, Math.floor(f / nyq * B)); let m = 0;
    for (const d of srcs) m = Math.max(m, d[(c0 + col) * B + b] ?? 0);
    return m;
  });
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1; g.strokeRect(L - 0.5, T - 0.5, pw + 1, ph + 1);
  g.fillStyle = "#fff"; g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  // กราฟเตี้ยเว้นป้ายสเกลให้ห่างกันอย่างน้อย 14 จุด ไม่ซ้อนกัน
  let kStep = fSpan > 30000 ? 8000 : fSpan > 15000 ? 4000 : fSpan > 6000 ? 2000 : fSpan > 3000 ? 1000 : 500;
  while (ph * kStep / fSpan < 14) kStep *= 2;
  for (let f = Math.ceil(f0 / kStep) * kStep; f <= f0 + fSpan + 1; f += kStep) { const y = T + ph * (1 - (f - f0) / fSpan); g.fillText(`${f / 1000} kHz`, L - 8, y); g.fillRect(L - 4, Math.round(y), 4, 1); }
  g.textAlign = "center"; g.textBaseline = "top";
  for (const { x: s, label } of rulerTicks(t0, t1, 8)) { const x = L + pw * (s - t0) / (t1 - t0 || 1); g.fillText(label, x, T + ph + 8); g.fillRect(Math.round(x), T + ph, 1, 4); }
  const bx = L + pw + 22, grd = g.createLinearGradient(0, T, 0, T + ph);
  ramp.slice().reverse().forEach((c, i, a) => grd.addColorStop(i / (a.length - 1), c));
  g.fillStyle = grd; g.fillRect(bx, T, 12, ph);
  g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle";
  let dStep = 20;
  while (ph * dStep / 120 < 14) dStep += 20;
  for (let d = 0; d <= 120; d += dStep) { const y = T + ph * d / 120; g.fillText(`${d ? "−" + d : 0} dB`, bx + 18, y); g.fillRect(bx + 12, Math.round(y), 4, 1); }
  g.textBaseline = "alphabetic"; g.font = "700 13px Sarabun, sans-serif"; g.fillText(title, L, 18);
  g.font = "11.5px Sarabun, sans-serif"; g.fillStyle = "#d9d0d4"; g.fillText(sub, L, 35);
  if (top != null && top < maxNyq * 0.98 && top >= f0 && top <= f0 + fSpan) {
    const y = Math.round(T + ph * (1 - (top - f0) / fSpan)) + 0.5;
    g.strokeStyle = "rgba(255,255,255,.75)"; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#fff"; g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "right"; g.fillText(`เสียงหยุดที่ราว ${(top / 1000).toFixed(1)} kHz`, L + pw - 8, y - 7);
  }
}

/** ขอบบนของเสียงทั้งไฟล์ (รวมทุกช่อง ไม่นับเสียงเบส) */
export function edgeAll(ov: GOverview, names: string[], nyq: number) {
  const chans = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  return edgeOf((chans.length ? chans : [0]).map((i) => dec(ov.spec[i] ?? "")), ov.specBins, 0, ov.specCols, nyq);
}

/** ความดังเฉลี่ยเป็น dB ตามเวลา ของช่องหนึ่ง n จุด (หน้าต่างเลื่อนแบบแท็บซ้อนเทียบ) */
export function rmsDb(ov: GOverview, ch: number, t0: number, t1: number, n: number, hi?: GWindow) {
  const d = sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, ch, t0, t1, n), out = new Float32Array(n), win = Math.max(1, Math.round(n * 3 / (t1 - t0 || 1) / 2));
  for (let x = 0; x < n; x++) { let s = 0, k = 0; for (let j = Math.max(0, x - win); j <= Math.min(n - 1, x + win); j++) { s += d.rm[j] ** 2; k++; } out[x] = s <= 1e-12 ? -120 : 10 * Math.log10(s / k); }
  return out;
}
export function loudPts(ov: GOverview, t0: number, t1: number, n: number) {
  const out = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    const a = t0 + (t1 - t0) * x / n, b = t0 + (t1 - t0) * (x + 1) / n; let e = 0, k = 0;
    for (let c = Math.floor(a / ov.duration * ov.cols); c <= Math.floor(b / ov.duration * ov.cols) && c < ov.cols; c++) { if (c < 0) continue; e += Math.pow(10, ov.loud[c] / 10); k++; }
    out[x] = k ? 10 * Math.log10(e / k) : -70;
  }
  return out;
}
export const f1 = (v: number | null | undefined) => (v == null ? "—" : minus(v.toFixed(1)));
export const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
export const khz = (f: number) => (f / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });

export function Stat({ kind, b, d }: { kind: "info" | "warn"; b: string; d: string }) {
  return <div className={"stat " + kind} title={b + " " + d} data-cmpstat data-psdverdict><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">{kind === "warn" ? <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>}</svg><div><b>{b}</b><Phr>{d}</Phr></div></div>;
}

/** รูปทุกกราฟในหน้าต่างเทียบรวมเป็นรูปเดียว ไว้บันทึก */
export function composeAll(box: HTMLElement | null, outW: number): HTMLCanvasElement | null {
  if (!box) return null;
  const cvs = [...box.querySelectorAll<HiCanvas>("canvas.cv")].filter((c) => c.clientWidth > 0);
  if (!cvs.length) return null;
  const bx = box.getBoundingClientRect(), rs = cvs.map((c) => c.getBoundingClientRect());
  // เอาเฉพาะส่วนกราฟ ไม่เอาหัวกราฟกับแถบซูม
  const top = Math.min(...rs.map((r) => r.top)), right = Math.max(...rs.map((r) => r.right));
  const ruler = box.querySelector(".ruler"), head = ruler ? 24 : 0;
  const W = Math.round(right - bx.left + 6), H = Math.round(Math.max(...rs.map((r) => r.bottom)) - top + 6 + head), k = outW ? outW / W : screenK();
  const out = document.createElement("canvas"); out.width = Math.round(W * k); out.height = Math.round(H * k);
  const g = out.getContext("2d"); if (!g) return null;
  g.scale(k, k); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  for (const lab of box.querySelectorAll<HTMLElement>("[data-lane]")) {
    const lr = lab.getBoundingClientRect(), mid = lr.top - top + head + lr.height / 2, sub = lab.querySelector(".lab span")?.textContent ?? "";
    g.fillStyle = "#4a2b38"; g.font = "700 12px Sarabun, sans-serif"; g.fillText(lab.dataset.lane ?? "", lr.left - bx.left + 4, sub ? mid - 8 : mid);
    if (sub) { g.fillStyle = "#6b4a58"; g.font = "11px Sarabun, sans-serif"; g.fillText(sub, lr.left - bx.left + 4, mid + 8); }
  }
  cvs.forEach((c, i) => g.drawImage(hiCopy(c, k), rs[i].left - bx.left, rs[i].top - top + head, rs[i].width, rs[i].height));
  if (ruler) drawRuler(g, ruler, rs[0].left - bx.left, rs[0].width, 12);
  return out;
}

export function FragmentInfo({ k, vals }: { k: string; vals: string[] }) {
  return <><span className="k">{k}</span>{vals.map((v, i) => <span key={i} className="v" style={i > 0 && v !== vals[0] && vals[0] !== "…" ? { fontWeight: 700 } : undefined}>{v}</span>)}</>;
}
export function Fragment3({ cls, k, l, vals }: { cls: string; k: string; l: string; vals: string[] }) {
  return <><span className={cls} data-cmpdiffrow={k}>{l}</span>{vals.map((v, i) => <em key={i} className={cls}>{v}</em>)}</>;
}

export function SpekCv({ grab, deps, draw, data }: { grab?: Grab; deps: unknown[]; draw: Draw; data: string }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return <div className={grab?.cls} {...grab?.props} style={{ position: "relative", flex: "1 0 118px", marginTop: 8 }}><canvas className="cv fillcv" style={{ borderRadius: 6 }} ref={ref} data-cmpspek={data} /></div>;
}

/** กราฟเส้นของสองไฟล์บนแกนเดียว · series(n) คืนเส้นละชุด n จุด · ref23 เส้นอ้างอิง −23 LUFS · diff เส้นศูนย์เข้ม */
export function CmpChart({ vr, grab, height, deps, lo: loAll, hi: hiAll, step: stepAll, unit, series, ref23, diff, fill }: { vr?: VRange; grab?: Grab; fill?: boolean; height: number; deps: unknown[]; lo: number; hi: number; step: number; unit: string; series: (n: number) => [Float32Array, string][]; ref23?: boolean; diff?: boolean }) {
  const X0 = 44;
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const zoomed = !!vr && vr.z > 1, win = zoomed ? vWindow(loAll, hiAll, vr) : { lo: loAll, hi: hiAll, step: stepAll };
    const { lo, hi, step } = win;
    const pad = diff ? 8 : 12, N = Math.max(10, w - X0 - 4), Y = (v: number) => pad + (hi - (zoomed ? v : Math.max(lo, Math.min(hi, v)))) / (hi - lo) * (h - pad * 2);
    axisY(g, X0, w, h, pad, lo, hi, step, unit);
    g.save(); g.beginPath(); g.rect(X0, pad, N, h - pad * 2); g.clip();
    if (diff) { g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(0)), N, 1); }
    for (const [pts, col] of series(N)) {
      g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      pts.forEach((v, x) => (x ? g.lineTo(X0 + x, Y(v)) : g.moveTo(X0, Y(v)))); g.stroke();
    }
    if (ref23) {
      g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(-23)), N, 1);
      g.font = "600 11.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#6b4a58"; g.fillText("อ้างอิง −23 LUFS", X0 + N - 4, Y(-23) - 3);
    }
    g.restore();
  }, [...deps, vr?.z, vr?.b]);
  return fill ? <div className={grab?.cls} {...grab?.props} style={{ position: "relative", flex: `1 0 ${height}px` }}><canvas className="cv fillcv" ref={ref} data-cmpchart /></div> : <div className={grab?.cls} {...grab?.props}><canvas className="cv" style={{ height }} ref={ref} data-cmpchart /></div>;
}
