/* วาดกราฟความถี่เฉลี่ยลงแคนวาส ตัวชี้ ค่าใต้กราฟ แถบซูมแกนความถี่
   แยกจาก PsdView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { graphApi, pickSave } from "../../lib/api";
import { IcRefresh } from "../../components/icons";
import { label, minus } from "./common";
import { beside, hiCopy, screenK, useCanvas } from "./draw";
import { HZoom, PSD_HZ_UNIT } from "./zoom";
import { PSM, PSD_HZ_MAX } from "./psdShared";
import type { P0 } from "./psdCtx";

export function usePsdDraw(c: P0) {
  const { X, Yof, allPeaks, exportRef, f, fAt, fOf, fileName, filePath, fill, grids, hr, hum, lo, names, nyq, off, onReset, psd, psdCh, psdLog, range, rise, series, shown, th, toast, top, valRange, vr } = c;
  const ref = useCanvas((g, w, h, rr) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = PSM, PW = w - L - R, PH = h - T - B, Y = (d: number) => Yof(d, h), stp = 1 / Math.max(1, rr);
    const ink = "#4a2b38", minor = "#efdde5", major = "#dcc0cc";
    // เส้นตารางแนวนอนทุก 6 dB (ถี่เกินไปเป็นทุก 12) · ตัวเลขทุกเส้น
    const step = [1, 2, 3, 6].find((k) => PH * k / (top - lo) >= 16) ?? 12;
    /** เส้นตารางทุกเส้น จดไว้วาดซ้ำทับพื้นสีด้วยสีขาวโปร่ง แบบ Audacity ที่เส้นตารางอยู่หน้าสุด
        (พี่กัน *"ของ audacity เส้นตารางมันจะอยู่หน้าสุดนะ … เอาเส้นตารางที่พาดผ่านสีจะอ่อนกว่าเส้นตารางพื้นหลังที่อยู่ฉากขาว"*) */
    const gl: [number, number, number, number, boolean][] = [];
    g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    for (let d = Math.floor(top / step) * step; d >= lo - 0.01; d -= step) {
      const y = Math.round(Y(d)) + 0.5;
      if (grids) { gl.push([L, y, L + PW, y, true]); g.strokeStyle = major; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); }
      g.fillStyle = ink; g.fillText(minus(String(d)) + " dB", L - 6, y);
    }
    // เส้นตารางแนวตั้ง · แบบล็อก ทุก 1–9 × 10ⁿ (หลักเข้ม ตัวคั่นจาง) · แบบเส้นตรง ทุก 1 kHz
    g.textAlign = "center"; g.textBaseline = "top"; g.font = "600 11px Sarabun, sans-serif";
    const vline = (fr: number, strong: boolean) => { if (!grids) return; const x = Math.round(X(fr, w)) + 0.5; if (x < L || x > L + PW) return; gl.push([x, T, x, T + PH, strong]); g.strokeStyle = strong ? major : minor; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); };
    const hz = (fr: number) => (fr >= 1000 ? `${fr / 1000} kHz` : `${fr} Hz`);
    if (psdLog) {
      for (let dec = 10; dec <= nyq; dec *= 10) for (let m = 1; m <= 9; m++) { const fr = m * dec; if (fr >= 20 && fr <= nyq) vline(fr, m === 1); }
      let lastX = -99;
      // ซูมแล้วป้ายเดิมอยู่ห่างกันเกินไป เพิ่มป้ายถี่ขึ้นตามช่วงที่เห็น
      const marks = hr.z < 2 ? [1, 2, 5] : hr.z < 6 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
      const labels: number[] = [20];
      for (let dec = 10; dec <= nyq; dec *= 10) for (const m of marks) { const fr = Math.round(m * dec); if (fr > 20 && fr <= nyq) labels.push(fr); }
      for (const fr of labels) {
        const x = X(fr, w); const tw = g.measureText(hz(fr)).width;
        if (x < L - 1 || x > L + PW + 1 || x - tw / 2 < lastX + 8 || x + tw / 2 > L + PW + R) continue;
        g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); lastX = x + tw / 2;
      }
    } else {
      const seen = nyq / hr.z, gridStep = seen < 6000 ? 100 : 1000;
      for (let fr = gridStep; fr < nyq; fr += gridStep) vline(fr, fr % (gridStep * 5) === 0);
      const every = hr.z === 1 ? (nyq > 30000 ? 8000 : 4000) : [100, 200, 500, 1000, 2000, 4000, 8000].find((k) => PW * k / seen >= 80) ?? 8000;
      for (let fr = 0; fr <= nyq; fr += every) { const x = X(Math.max(fr, 1), w); if (x < L - 1 || x > L + PW + 1) continue; g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); }
    }
    const rising = !!psd && rise < 1;
    if (rising) { g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.translate(0, (T + PH) * (1 - rise)); g.scale(1, rise); }
    if (!psd) { g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#b28a9a"; g.font = "13px Sarabun, sans-serif"; g.fillText("กำลังคิดความถี่เฉลี่ยของช่วงที่เลือก", L + PW / 2, T + PH / 2); }
    else if (psdCh === "all") {
      // ซ้อนทุกช่อง แบบ SpectrumAnalyzer (พี่กัน 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
      // ระบายสีโปร่งของทุกเส้นก่อน แล้ววาดเส้นทึบทับทีหลัง เส้นจึงไม่จมใต้พื้นสีของเส้นอื่น · ส่วนที่ซ้อนกันเห็นสีผสม
      const drawn = shown.map((s) => {
        const area = new Path2D(), line = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); area.lineTo(L + x + 0.5, y); if (x) line.lineTo(L + x + 0.5, y); else line.moveTo(L + 0.5, y); }
        area.lineTo(L + PW, T + PH); area.closePath();
        return { s, area, line };
      });
      // ความทึบพื้นสีต่อเส้นลดตามจำนวนเส้น ส่วนที่ทุกเส้นซ้อนกันทึบรวมราว 45% (เดิม 20% ทุกเส้น 4 เส้นซ้อนกันเป็นสีหม่นขุ่น เจอตอนตรวจภาพ)
      if (fill) { g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, drawn.length)); for (const { s, area } of drawn) { g.fillStyle = s.color; g.fill(area); } }
      g.globalAlpha = 1; g.lineWidth = 1.5; g.lineJoin = "round"; for (const { s, line } of drawn) { g.strokeStyle = s.color; g.stroke(line); }
    } else if (series.length === 1) {
      // ระบายทึบสีเดียวจากเส้นลงถึงพื้นกราฟ แบบ Audacity · สีกลางของชุดสี (ชุดม่วงใกล้สีของ Audacity)
      // ค่าทีละจุดภาพ (valRange) ไม่ใช่ทีละช่องความถี่
      const s = series[0], area = new Path2D(); area.moveTo(L, T + PH);
      for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
      area.lineTo(L + PW, T + PH); area.closePath();
      if (fill) g.fillStyle = th.ramp[4], g.fill(area);
      else { const ln = new Path2D(); for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) ln.lineTo(L + x + 0.5, y); else ln.moveTo(L + 0.5, y); } g.strokeStyle = th.ramp[5] ?? th.rms; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke(ln); }
      // เส้นตารางเส้นเดิมวาดซ้ำเฉพาะในพื้นสี ขาวโปร่ง อ่อนกว่าเส้นบนพื้นขาว
      if (grids && fill) {
        g.save(); g.clip(area); g.lineWidth = 1;
        for (const [x1, y1, x2, y2, strong] of gl) { g.strokeStyle = strong ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        g.restore();
      }
    } else {
      // เทียบซ้ายขวา (ของเราเพิ่มเอง Audacity ไม่มี) เป็นเส้นสองสีตามช่อง
      if (fill) for (const s of shown) {
        const area = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
        area.lineTo(L + PW, T + PH); area.closePath(); g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, shown.length)); g.fillStyle = s.color; g.fill(area); g.globalAlpha = 1;
      }
      for (const s of shown) {
        g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) g.lineTo(L + x + 0.5, y); else g.moveTo(L + 0.5, y); }
        g.stroke();
      }
    }
    if (rising) g.restore();
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, PW - 1, PH - 1);
  }, [rise, hr.z, hr.b, vr.z, vr.b, psd, psdLog, th, series, off, grids, range, top, fill]);
  exportRef.current = (outW) => (ref.current ? hiCopy(ref.current, outW ? outW / ref.current.clientWidth : screenK()) : null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const cur = f ?? (hum[0]?.[0] ?? 1000);
  const hrNow = useRef(hr); hrNow.current = hr;
  useEffect(() => {
    if (!box) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const h = hrNow.current, r = box.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left - PSM.L) / Math.max(1, r.width - PSM.L - PSM.R)));
      const k = Math.max(1, Math.min(PSD_HZ_MAX, h.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))), u = h.b + p / h.z;
      h.setZ(k); h.setB(h.clampB(u - p / k, k));
    };
    box.addEventListener("wheel", fn, { passive: false });
    return () => box.removeEventListener("wheel", fn);
  }, [box]);
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT;
  const setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
  const W = box?.clientWidth ?? 0, H = box?.clientHeight ?? 0, cx = W ? X(cur, W) : 0;
  // ยอดใกล้ตำแหน่งชี้ที่สุด วัดระยะแบบล็อก (บนแกนล็อกตรงกับที่ตาเห็นกว่าวัดเป็น Hz แบบ Audacity)
  const nearest = (fr: number) => allPeaks.slice().sort((a, b) => Math.abs(Math.log(a[0] / fr)) - Math.abs(Math.log(b[0] / fr)))[0];
  const valAt = (d: number[], fr: number) => valRange(d, fr * 0.999, fr * 1.001);
  const hzTxt = (fr: number) => `${Math.round(fr).toLocaleString("en-US")} Hz`;
  const pk = psd ? nearest(cur) : undefined;
  const exportCsv = async () => {
    if (!psd) return;
    const where = await pickSave(beside(filePath, fileName.replace(/\.[^.]+$/, "") + " ความถี่เฉลี่ย.csv"), "csv", "ตาราง CSV"); if (!where) return;
    const head = "Hz," + series.map((s) => s.name + " dB").join(",");
    const rows = psd.db[0].map((_, i) => [fOf(i).toFixed(2), ...psd.db.map((d) => d[i].toFixed(1))].join(","));
    try { const saved = await graphApi.save(where, null, [head, ...rows].join("\r\n"), true); toast({ kind: "ok", title: "ส่งออกตารางแล้ว", detail: saved }); }
    catch (e) { toast({ kind: "bad", title: "ส่งออกไม่ได้", detail: String(e) }); }
  };
  // ช่วงความถี่ที่ซูมอยู่ บอกข้างแถบซูม (BUGS ข้อ 16 ซูมแล้วงงว่าซูมอะไร แกนนอนหน้านี้คือความถี่ ไม่ใช่เวลา)
  const fL = psdLog ? 20 * Math.pow(nyq / 20, hr.b) : hr.b * nyq, fR = psdLog ? 20 * Math.pow(nyq / 20, hr.b + 1 / hr.z) : (hr.b + 1 / hr.z) * nyq;
  const khz = (x: number) => (x >= 1000 ? `${+(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k` : `${Math.round(x)}`);
  const hzoomBox = (
    <span className="zbtns" data-psdhzoom>
      <span className="lbl">ซูม</span>
      <span className={"lbl" + (hr.z > 1.01 ? "" : " all")} data-psdhzrange title="ช่วงความถี่ที่เห็นอยู่บนแกนนอน">{hr.z > 1.01 ? `${khz(fL)}–${khz(fR)} Hz` : "ทุกความถี่"}</span>
      <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
      <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
      <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
    </span>
  );
  // แถวขวาของหัวกราฟเรียงแบบเดียวกับมุมมองอื่น คำว่าซูมนำหน้าเส้นเลื่อน เส้นแบ่งกั้นกลุ่ม ปุ่มรีเซ็ตท้ายสุด
  // (เดิมไม่มีคำว่าซูมและเส้นแบ่ง ปุ่มรีเซ็ตอยู่กลางแถว เจอตอนไล่หัวกราฟทุกมุมมองหลังพี่กันทักเรื่องแบ่งกลุ่ม 13 พ.ย. 2569)
  const resetBtn = <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset onClick={onReset}><IcRefresh size={15} /></button>;
  const opts: [string, string][] = names.length === 1 ? [["mix", label(names, names[0]).code]] : [["mix", "รวมทุกช่อง"], ...(names.includes("FR") ? [["FL", label(names, "FL").code], ["FR", label(names, "FR").code], ["lr", "เทียบซ้ายขวา"]] as [string, string][] : []), ["all", "ซ้อนทุกช่อง"]];
  return { ref, box, setBox, cur, hrNow, hrSpan, setHz, W, H, cx, nearest, valAt, hzTxt, pk, exportCsv, fL, fR, khz, hzoomBox, resetBtn, opts };
}
