/* วาดกราฟหลักกับแถบภาพรวมทั้งไฟล์ลงแคนวาส
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef } from "react";
import { BV, BV_LINES, alpha, clock, clockTick, cssv, kbps, niceUp, rate, rateAxis } from "./common";
import type { C2 } from "./brCtx";

export function useBrDraw(c: C2) {
  const { L, R, S, T, bars, bin, binTxt, box, bstyle, ceil, custom, cutAt, cvRef, drag, fd, group, hover, lines, mode, ovRef, pal, ph, pin, pw, rawKbps, res, setZoom, span, st, toneVer, top, total, xOf, yOf, z0, z1, zoom } = c;
  // ---------- วาดกราฟหลัก ----------
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    const c = { accent: cssv("--accent", "#c8406f"), deep: cssv("--accent-d", "#ad3560"), soft: cssv("--accent-soft", "#fbe9ef"), ink: cssv("--accent-ink", "#b0355f"), line: cssv("--line", "#f6e6ec"), txt2: cssv("--txt2", "#6b4f5c"), txt3: cssv("--txt3", "#876572"), bad: cssv("--bad", "#ec8f8f"), badInk: cssv("--bad-ink", "#b04545"), info: "steelblue", ok: cssv("--ok-ink", "#2f7a52") };
    const font = (w: number, s: number) => `${w} ${s}px Sarabun, "Noto Sans Thai", Tahoma, sans-serif`;
    if (!S.n) return; // ยังไม่มีข้อมูลหรืออ่านไม่ได้ ไม่วาดแกนเปล่า ข้อความบอกเหตุอยู่กลางกรอบแทน
    // เส้นแบ่งระดับกับป้ายบิตเรต
    const step = niceUp(top / 5);
    const mbps = top >= 2000;
    g.font = font(600, 11.5); g.fillStyle = c.txt3; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(mbps ? "Mbps" : "kbps", L - 8, 9);
    // แท่งละเท่าไหร่ เขียนในแถบบนของกรอบ ข้างหน่วย · อัตโนมัติก็รู้ว่าตอนนี้ใช้ระดับไหน (BUGS ข้อ 42 "ป้ายบอกความละเอียดที่ใช้อยู่ตอนนี้")
    const each = mode === "sec" ? (bin === "pkt" ? `แท่งละหนึ่งเฟรม (${+(fd * 1000).toFixed(1)} ms)` : `แท่งละ ${binTxt}`) : mode === "frm" ? "แท่งละหนึ่งเฟรม" : "แท่งละหนึ่ง GOP";
    g.font = font(500, 12); g.textAlign = "left"; g.fillText(each + (group > 1 ? ` รวม ${group} ช่วงเป็นหนึ่งแท่งเพราะแท่งแคบเกิน` : "") + (res === "auto" && mode === "sec" ? " เลือกอัตโนมัติตามซูม" : ""), L + 2, 9);
    g.font = font(500, 11.5);
    for (let v = 0; v <= top + 1e-6; v += step) {
      const y = Math.round(yOf(v)) + 0.5;
      g.strokeStyle = c.line; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
      g.fillStyle = c.txt3; g.fillText(v ? rateAxis(v, mbps) : "0", L - 8, y);
    }
    // ป้ายเวลา
    const tStep = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => span / s <= Math.max(3, Math.floor(pw / 90))) ?? 3600;
    g.textAlign = "center"; g.textBaseline = "top";
    for (let t = Math.ceil(z0 / tStep) * tStep; t <= z1 + 1e-6; t += tStep) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = c.line; g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph + 4); g.stroke();
      g.fillStyle = c.txt3; g.fillText(tStep < 1 ? clockTick(t) : clock(t), x, T + ph + 7);
    }
    // ส่วนท้ายที่อ่านไม่ถึง ลายเส้นเอียงจาง ๆ (AUDIT ข้อ 118)
    if (cutAt != null && cutAt < z1) {
      const xa = Math.max(L, xOf(cutAt)), xb = L + pw;
      g.save(); g.beginPath(); g.rect(xa, T, xb - xa, ph); g.clip();
      g.strokeStyle = alpha(c.txt3, 0.28); g.lineWidth = 1;
      for (let x = xa - ph; x < xb; x += 8) { g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x + ph, T); g.stroke(); }
      g.restore();
    }
    if (!bars.length) return;
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    // ชุดสี · ใต้ค่าเฉลี่ยสะสมสีอ่อน เหนือค่าเฉลี่ยสีเข้ม เกินเพดานสีแดง (ความหมายเดียวกับ Bitrate Viewer) · สี Bitrate Viewer ไล่สีจากฐานถึงเพดานแบบหน้าแบบเดิม
    const yc = yOf(ceil), base = T + ph;
    const grad = (a: string, b: string) => { const gr = g.createLinearGradient(0, base, 0, Math.min(base - 1, yc)); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
    const pc = pal === "bv"
      ? { lo: grad(BV.lo0, BV.lo1) as string | CanvasGradient, hi: grad(BV.hi0, BV.hi1) as string | CanvasGradient, loS: BV.lo0, hiS: BV.hi1, over: BV.over, line: BV.line, cum: BV.cum }
      : pal === "custom"
        ? { lo: alpha(custom, 0.35), hi: alpha(custom, 0.85), loS: alpha(custom, 0.45), hiS: custom, over: c.bad, line: custom, cum: c.txt2 }
        : { lo: alpha(c.accent, 0.32), hi: alpha(c.accent, 0.78), loS: alpha(c.accent, 0.45), hiS: c.accent, over: c.bad, line: c.deep, cum: c.txt2 };
    // แท่งกว้างตั้งแต่ 2.5 จุดเว้นช่อง 1 จุด ทั้งแท่งเดี่ยวและแท่งที่รวมหลายช่วง (BUGS ข้อ 43 · เดิมเว้นเฉพาะแท่งเดี่ยวที่กว้างเกิน 4 จุด
    // หน้าต่างแคบโปรแกรมรวมแท่งละ 2 ช่วงขึ้นไป แท่งรวมกว้าง 6 จุดก็ยังติดกัน · เจอตอนตรวจที่หน้าต่าง 1024)
    const xs = (b: { t0: number; t1: number }) => { const x0 = Math.floor(xOf(b.t0)); return [x0, Math.max(x0 + 1, Math.floor(xOf(b.t1)) - (xOf(b.t1) - xOf(b.t0) >= 2.5 ? 1 : 0))]; };
    if (bstyle === "bar") {
      for (const b of bars) {
        const [x0, x1] = xs(b);
        const yv = yOf(b.v), ya = yOf(Math.min(b.v, b.avg));
        g.fillStyle = pc.lo; g.fillRect(x0, ya, x1 - x0, base - ya);
        if (b.v > b.avg) { const yt = Math.max(yv, Math.min(ya, yc)); g.fillStyle = pc.hi; g.fillRect(x0, yt, x1 - x0, ya - yt); }
        if (b.v > ceil) { g.fillStyle = pc.over; g.fillRect(x0, yv, x1 - x0, Math.min(yc, ya) - yv); }
      }
    } else if (bstyle === "led") {
      // ช่องสูง 4 จุด เว้น 1 จุด สีของช่องตามระดับที่ช่องนั้นอยู่ แบบไฟวัดระดับ
      for (const b of bars) {
        const [x0, x1] = xs(b), yv = yOf(b.v), ya = yOf(b.avg);
        for (let y = base; y - 4 >= yv - 0.5; y -= 5) {
          const mid = y - 2;
          g.fillStyle = mid < yc ? pc.over : mid < ya ? pc.hiS : pc.loS;
          g.fillRect(x0, y - 4, x1 - x0, 4);
        }
      }
    } else {
      // เส้น พื้นทึบ ขั้นบันได จุด · วาดหนึ่งรอบด้วยสีเส้น แล้ววาดซ้ำเฉพาะส่วนที่สูงเกินเพดานด้วยสีแดง
      const pts = bars.map((b) => ({ x: xOf((b.t0 + b.t1) / 2), xa: xOf(b.t0), xb: xOf(b.t1), y: yOf(b.v) }));
      const trace = () => {
        g.beginPath();
        if (bstyle === "step") pts.forEach((p, i) => { if (i) g.lineTo(p.xa, p.y); else g.moveTo(p.xa, p.y); g.lineTo(p.xb, p.y); });
        else pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      };
      const paint = (col: string | CanvasGradient, fill: string | CanvasGradient) => {
        if (bstyle === "dot") { const rr = pts.length > pw / 4 ? 1.6 : 2.6; g.fillStyle = col; for (const p of pts) { g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.fill(); } return; }
        if (bstyle === "area") { trace(); const last = pts[pts.length - 1], first = pts[0]; g.lineTo(last.x, base); g.lineTo(first.x, base); g.closePath(); g.fillStyle = fill; g.fill(); }
        trace(); g.strokeStyle = col; g.lineWidth = 1.6; g.lineJoin = "round"; g.stroke();
      };
      paint(pc.line, pc.lo);
      g.save(); g.beginPath(); g.rect(L, T, pw, Math.max(0, yc - T)); g.clip(); paint(pc.over, alpha(c.bad, 0.5)); g.restore();
    }
    // ค่าเฉลี่ยสะสม
    g.strokeStyle = pc.cum; g.globalAlpha = 0.55; g.lineWidth = 1.2; g.beginPath();
    // ช่วงที่ค่าเฉลี่ยสะสมสูงเกินกรอบ (ขยายแนวตั้งอยู่) เส้นขาด ไม่ลากติดขอบบน
    let pen = false;
    bars.forEach((b) => { const x = xOf((b.t0 + b.t1) / 2); if (b.avg > top) { pen = false; return; } const y = yOf(b.avg); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; });
    g.stroke(); g.globalAlpha = 1;
    // เส้นแนวนอน · เพดาน ค่าเฉลี่ย สูงสุด ต่ำสุด
    const taken: number[] = [];
    const hl = (v: number, color: string, label: string, dash: number[]) => {
      // เส้นที่สูงเกินกรอบ (ขยายแนวตั้งอยู่) ไม่วาด · yOf บีบค่าไว้ที่ขอบบน ถ้าวาดจะติดขอบ ป้ายโดนตัดครึ่ง
      if (v > top * 1.001) return;
      // เส้นที่ต่ำจนเกือบศูนย์ (เช่นช่วงจอดำ 5 kbps) ปัดแล้วเลยขอบล่างครึ่งจุด เดิมข้ามไม่วาดทั้งเส้นและป้าย · วาดชิดขอบแทน (BUGS ข้อ 1 เจอตอนตรวจ)
      const y0 = Math.round(yOf(v)) + 0.5; if (y0 < T - 1 || y0 > T + ph + 1) return;
      const y = Math.min(T + ph - 0.5, Math.max(T + 0.5, y0));
      g.font = font(600, 11.5); const w = g.measureText(label).width + 14;
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.4; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw - w, y); g.stroke(); g.setLineDash([]);
      // ป้ายอยู่ในกรอบเสมอ เส้นชิดขอบล่างหรือบน ป้ายขยับเข้ามา เส้นอยู่ที่เดิม (BUGS ข้อ 1)
      let ly = Math.min(T + ph - 9, Math.max(T + 9, y));
      // ป้ายสองเส้นที่อยู่ใกล้กัน (เพดาน 2 Mbps กับเฉลี่ย 1.95 Mbps) ไม่ทับกัน ป้ายหลังขยับหลบลงหรือขึ้นทีละแถว เส้นอยู่ที่เดิม (เจอตอนตรวจ 13 พ.ย. 2569)
      for (let k = 0; k < 6 && taken.some((t) => Math.abs(t - ly) < 19); k++) ly = ly + 19 > T + ph - 9 ? ly - 19 : ly + 19;
      taken.push(ly);
      g.fillStyle = cssv("--win", "#fff"); g.globalAlpha = 0.92; g.fillRect(L + pw - w, ly - 9, w, 18); g.globalAlpha = 1;
      g.fillStyle = color; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(label, L + pw - 4, ly);
    };
    hl(ceil, c.badInk, rawKbps ? `เสียงดิบ ${rate(ceil)}` : `เพดาน ${rate(ceil)}`, [6, 4]);
    // ชุดสี Bitrate Viewer ใช้สีเส้นแบบต้นฉบับ เฉลี่ยเขียว สูงสุดน้ำตาล ต่ำสุดน้ำเงิน (ค่าเดียวกับ BitrateClassic.tsx)
    if (lines.avg) hl(st.avg, pal === "bv" ? BV_LINES.avg : pal === "custom" ? custom : c.deep, `เฉลี่ย ${rate(st.avg)}`, []);
    if (lines.max) hl(st.peak, pal === "bv" ? BV_LINES.max : c.badInk, `สูงสุด ${rate(st.peak)}`, [2, 3]);
    if (lines.min) hl(st.min, pal === "bv" ? BV_LINES.min : c.info, `ต่ำสุด ${rate(st.min)}`, [2, 3]);
    // คีย์เฟรม
    const ks = S.keys.filter((k) => k >= z0 && k <= z1);
    if (ks.length <= 240) { g.strokeStyle = c.txt3; g.globalAlpha = 0.6; for (const k of ks) { const x = Math.round(xOf(k)) + 0.5; g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph - 5); g.stroke(); } g.globalAlpha = 1; }
    // จุดสูงสุด จุดต่ำสุด เป็นสามเหลี่ยมที่แกนล่าง
    const tri = (i: number, color: string) => { if (i < 0) return; const t = (S.t0[i] + S.t1[i]) / 2; if (t < z0 || t > z1) return; const x = xOf(t); g.fillStyle = color; g.beginPath(); g.moveTo(x, T + ph - 9); g.lineTo(x - 5, T + ph); g.lineTo(x + 5, T + ph); g.closePath(); g.fill(); };
    tri(st.pAt, c.badInk); tri(st.mAt, c.info);
    // จุดที่ปักไว้ กับเส้นตามเมาส์
    if (pin != null && pin >= z0 && pin <= z1) { const x = Math.round(xOf(pin)) + 0.5; g.strokeStyle = c.deep; g.lineWidth = 2; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.lineWidth = 1; }
    if (hover && !drag.current?.moved) {
      const x = Math.round(hover.x) + 0.5; g.strokeStyle = c.txt2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.setLineDash([]);
      const hb = bars.find((b) => hover.t >= b.t0 && hover.t < b.t1);
      if (hb) { g.fillStyle = c.deep; g.beginPath(); g.arc(x, yOf(hb.v), 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = cssv("--win", "#fff"); g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
    }
    g.restore();
  });

  // ---------- ภาพรวมทั้งไฟล์ ----------
  const ovH = 44;
  useEffect(() => {
    const cv = ovRef.current; if (!cv) return;
    const w = cv.clientWidth || box.w, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(ovH * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, ovH);
    // ภาพรวมใช้ชุดสีเดียวกับกราฟหลัก (ข้อ 37)
    const accent = pal === "bv" ? BV.line : pal === "custom" ? custom : cssv("--accent", "#c8406f"), bad = pal === "bv" ? BV.over : cssv("--bad", "#ec8f8f");
    const ow = w - L - R, n = Math.max(1, Math.floor(ow / 2));
    const sum = new Float64Array(n), sec = new Float64Array(n);
    for (let i = 0; i < S.n; i++) { const j = Math.min(n - 1, Math.floor(((S.t0[i] + S.t1[i]) / 2 / total) * n)); sum[j] += S.b[i]; sec[j] += S.t1[i] - S.t0[i]; }
    // ค่าต่อช่อง เฉพาะช่องที่มีข้อมูล แล้วเกลี่ยเบา ๆ สามช่อง เส้นจะได้ไม่หยัก
    const raw0 = Array.from(sum, (b, j) => [j, sec[j] ? kbps(b, sec[j]) : -1] as const).filter(([, v]) => v >= 0);
    if (!raw0.length) return;
    const pts = raw0.map(([j], i) => { let t = 0, k = 0; for (let d = -1; d <= 1; d++) { const p = raw0[i + d]; if (p) { t += p[1]; k++; } } return [j, t / k] as const; });
    const mx = Math.max(1, ceil * 1.1, ...pts.map(([, v]) => v));
    const xj = (j: number) => L + ((j + 0.5) / n) * ow, yj = (v: number) => ovH - 2 - (v / mx) * (ovH - 8);
    // เส้นโค้งผ่านจุดกึ่งกลางของแต่ละคู่
    const curve = (start: boolean) => { pts.forEach(([j, v], i) => { const x = xj(j), y = yj(v); if (i === 0) { if (start) g.moveTo(x, y); else g.lineTo(x, y); return; } const [pj, pv] = pts[i - 1]; const mxp = (xj(pj) + x) / 2, myp = (yj(pv) + y) / 2; g.quadraticCurveTo(xj(pj), yj(pv), mxp, myp); if (i === pts.length - 1) g.lineTo(x, y); }); };
    const x0 = xj(pts[0][0]), x1 = xj(pts[pts.length - 1][0]), base = ovH - 1;
    const area = () => { g.beginPath(); g.moveTo(x0, base); curve(false); g.lineTo(x1, base); g.closePath(); };
    // พื้นไล่สีจากเข้มด้านบนถึงจางที่ฐาน
    const grd = g.createLinearGradient(0, 4, 0, base); grd.addColorStop(0, alpha(accent, 0.42)); grd.addColorStop(1, alpha(accent, 0.06));
    area(); g.fillStyle = grd; g.fill();
    // ส่วนที่เกินเพดาน พื้นสีแดงต่อกัน
    const yc = yj(ceil);
    g.save(); g.beginPath(); g.rect(L, 0, ow, yc); g.clip(); area(); g.fillStyle = alpha(bad, 0.75); g.fill(); g.restore();
    // เส้นเพดานจาง ๆ
    g.setLineDash([3, 3]); g.strokeStyle = alpha(cssv("--bad-ink", "#b04545"), 0.45); g.lineWidth = 1; g.beginPath(); g.moveTo(L, Math.round(yc) + 0.5); g.lineTo(L + ow, Math.round(yc) + 0.5); g.stroke(); g.setLineDash([]);
    // เส้นขอบบน
    g.beginPath(); curve(true); g.strokeStyle = alpha(accent, 0.9); g.lineWidth = 1.4; g.lineJoin = "round"; g.stroke();
    // วาดใหม่เฉพาะตอนข้อมูล ขนาด หรือสีเปลี่ยน · เดิมวาดทุกครั้งที่ขยับเมาส์ วนทุกตัวอย่างทั้งไฟล์ (AUDIT ข้อ 119)
  }, [S, box.w, ceil, total, pal, custom, toneVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const ovDrag = useRef<number | null>(null);
  const ovMove = (clientX: number, el: HTMLElement) => {
    const rc = el.getBoundingClientRect(); const ow = rc.width - L - R;
    const t = Math.max(0, Math.min(total, ((clientX - rc.left - L) / ow) * total));
    if (!zoom.length) return;
    const a = Math.max(0, Math.min(total - span, t - span / 2));
    setZoom((z) => [...z.slice(0, -1), [a, a + span]]);
  };
  return { ovH, ovDrag, ovMove };
}
