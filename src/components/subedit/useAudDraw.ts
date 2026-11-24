/* วาดภาพคลื่นเสียงทั้งภาพลงผืนวาด ช่วงของบรรทัด รูปคลื่น เส้นวินาที keyframe ภาพหนัง ขอบเริ่มจบ และเส้นตามเมาส์
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useLayoutEffect } from "react";
import { playNow } from "../../lib/audioPlay";
import { cube, rangeOf } from "../../lib/subTiming";
import { fmtMs, vidKeys } from "../../lib/vidFrames";
import { tiles } from "./audShared";
import type { Au0 } from "./audCtx";

export function useAudDraw(hk: Au0) {
  const { X, cv, d, drag, fr, h, left, mouse, mpp, o, p, right, spec, specImg, src, tileMs, vs, w } = hk;
  // วาดทั้งภาพ
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el || !src) return;
    const r = window.devicePixelRatio || 1;
    el.width = Math.round(w * r); el.height = Math.round(h * r);
    const g = el.getContext("2d")!;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const sp = o.spectrum && spec ? spec : null;
    if (sp && specImg) {
      g.imageSmoothingEnabled = true;
      g.drawImage(specImg, X(sp.t0), 0, (sp.t1 - sp.t0) / mpp, h);
    }
    // ช่วงของบรรทัด · บรรทัดอื่นจาง บรรทัดที่เลือกไว้หลายบรรทัดอีกสี บรรทัดที่กำลังแก้เข้ม
    const sel = new Set(p.sel);
    const act = p.ev ? rangeOf(p.ev) : null;
    p.doc.events.forEach((x, i) => {
      if (x.comment) return;
      const rr = x.id === p.ev?.id && act ? act : x;
      const a = rr.start + d, b = rr.end + d;
      if (b < left || a > right) return;
      const on = x.id === p.ev?.id;
      g.fillStyle = on ? "rgba(233,138,172,.34)" : sel.has(x.id) ? "rgba(140,170,230,.30)" : "rgba(233,138,172,.13)";
      g.fillRect(X(a), 0, X(b) - X(a), h);
      if (!on) { g.fillStyle = "rgba(120,120,120,.45)"; g.fillRect(Math.round(X(a)), 0, 1, h); g.fillRect(Math.round(X(b)), 0, 1, h); }
      g.fillStyle = sp ? "#ffffff" : on ? "#7a2346" : "#b28a9a"; g.font = `${on ? 700 : 600} 11px Sarabun`; g.fillText(String(i + 1), X(a) + 4, 13);
    });
    // รูปคลื่น
    if (!sp) {
      const mid = h / 2, scale = cube(o.vzoom);
      g.fillStyle = "rgba(74,43,56,.10)"; g.fillRect(0, Math.round(mid), w, 1);
      g.fillStyle = "#d9719a";
      for (let x = 0; x < w; x++) {
        const t = left + x * mpp;
        if (t < 0) continue;
        const k = Math.floor(t / tileMs), v = tiles.get(`${src.path}|${src.map}|${src.zero ?? ""}|${mpp}|${k}`);
        if (!v || !v.length) continue;
        const a = v[Math.min(v.length - 1, Math.floor((t - k * tileMs) / mpp))] ?? 0;
        const y = Math.min(1, a * scale) * (mid - 2);
        g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
      }
    }
    // เส้นทุกหนึ่งวินาที (Seconds Line ของ Aegisub) ซูมออกมากจนเส้นชิดกันไม่วาด
    if (1000 / mpp >= 12) {
      g.fillStyle = sp ? "rgba(255,255,255,.25)" : "rgba(0,100,255,.16)";
      for (let s = Math.ceil(left / 1000) * 1000; s <= right; s += 1000) g.fillRect(Math.round(X(s)), 0, 1, h);
    }
    // เส้น keyframe ที่เวลาเริ่มของเฟรม (ใช้ START แบบ Aegisub)
    const kl = vs.hideKeys ? [] : vidKeys(vs).list;
    if (fr && kl.length) {
      const a = fr.frameAt(left), b = fr.frameAt(right) + 1;
      let i = 0, j = kl.length;
      while (i < j) { const m = (i + j) >> 1; if (kl[m] < a) i = m + 1; else j = m; }
      g.strokeStyle = sp ? "#ffffff" : "#6b4fd6"; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      for (; i < kl.length && kl[i] <= b; i++) { const x = Math.round(X(fr.timeAt(kl[i], "start"))) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.setLineDash([]);
    }
    // ตำแหน่งภาพหนัง กับแถบบางของช่วงเฟรมนี้และเฟรมก่อน
    if (fr && vs.pos != null) {
      const t = fr.timeAt(vs.pos), tp = fr.timeAt(vs.pos - 1), tn = fr.timeAt(vs.pos + 1);
      g.fillStyle = "rgba(31,138,112,.10)"; g.fillRect(X(t), 0, Math.max(1, X(tn) - X(t)), h);
      g.fillStyle = "rgba(31,138,112,.05)"; g.fillRect(X(tp), 0, Math.max(1, X(t) - X(tp)), h);
      const x = X(t);
      if (x >= 0 && x <= w) { g.fillStyle = sp ? "#9df2c8" : "#1f8a70"; g.fillRect(Math.round(x) - 1, 0, 2, h); }
    }
    // ขอบเริ่มกับขอบจบของบรรทัดที่กำลังแก้ มีหัวเล็กชี้เข้าหากัน (Line boundary Start แดง End น้ำเงิน)
    if (act) {
      const xa = Math.round(X(act.start + d)), xb = Math.round(X(act.end + d));
      g.fillStyle = "#d22b2b"; g.fillRect(xa - 1, 0, 2, h);
      g.beginPath(); g.moveTo(xa + 1, 0); g.lineTo(xa + 8, 0); g.lineTo(xa + 1, 7); g.fill();
      g.beginPath(); g.moveTo(xa + 1, h); g.lineTo(xa + 8, h); g.lineTo(xa + 1, h - 7); g.fill();
      g.fillStyle = "#2440c8"; g.fillRect(xb - 1, 0, 2, h);
      g.beginPath(); g.moveTo(xb - 1, 0); g.lineTo(xb - 8, 0); g.lineTo(xb - 1, 7); g.fill();
      g.beginPath(); g.moveTo(xb - 1, h); g.lineTo(xb - 8, h); g.lineTo(xb - 1, h - 7); g.fill();
    }
    // จุดที่กำลังเล่น
    const now = playNow();
    if (now != null) { const x = X(now); if (x >= 0 && x <= w) { g.fillStyle = sp ? "#ffffff" : "#3a3a3a"; g.fillRect(Math.round(x), 0, 1.5, h); } }
    // เส้นตามเมาส์พร้อมเวลา
    if (mouse != null && !drag.current) {
      const x = X(mouse);
      g.fillStyle = sp ? "rgba(255,255,255,.7)" : "rgba(58,37,44,.55)"; g.fillRect(Math.round(x), 0, 1, h);
      const label = fmtMs(Math.max(0, mouse));
      g.font = "600 11px Sarabun";
      const tw = g.measureText(label).width + 8, lx = Math.min(w - tw - 2, Math.max(2, x + 6));
      g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(lx, h - 18, tw, 15);
      g.fillStyle = "#3a252c"; g.fillText(label, lx + 4, h - 7);
    }
  });
  return {  };
}
