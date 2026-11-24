/* ความถี่เฉลี่ยของไฟล์ที่เทียบ วาดซ้อนกันบนแกนเดียว
   แยกจาก CompareView.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { type GPsd } from "../../lib/api";
import { IcRefresh } from "../../components/icons";
import { minus, noteOf } from "./common";
import { useCanvas } from "./draw";
import { Grab, VBar, VRange, useRise, vWindow } from "./parts";
import { FZoom, HZoom, PSD_HZ_UNIT, TimeScroll } from "./zoom";
import { PSD_HZ_MAX } from "./PsdView";
import { FILE_C, Stat } from "./compareParts";
import { LABELS } from "./cmpLabels";

/** ความถี่เฉลี่ยของสองไฟล์ · แกนนอนแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่มที่สูงกว่า · ชี้แล้วบอกค่าของทั้งสองไฟล์กับผลต่าง */
export function PsdCmp({ list, maxNyq, f, setF, vr, hr, grab, onReset }: { list: GPsd[]; maxNyq: number; f: number | null; setF: (f: number | null) => void; vr: VRange; hr: VRange; grab: Grab; onReset: () => void }) {
  const L = 52, R = 18, T = 14, Bm = 30;
  const at = (p: GPsd, fr: number) => { const d = p.db[0], x = fr * p.size / p.rate, i = Math.floor(x); if (i < 0 || i + 1 >= d.length) return -140; return d[i] + (d[i + 1] - d[i]) * (x - i); };
  const fmax = Math.max(20.5, maxNyq);
  const topAll = Math.ceil(Math.max(...list.flatMap((p) => p.db[0].slice(2))) / 6) * 6;
  const { lo: bot, hi: top } = vWindow(topAll - 96, topAll, vr);
  const rise = useRise(list);
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT, setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const PW = w - L - R, PH = h - T - Bm;
    const X = (fr: number) => L + ((Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(fmax) - Math.log10(20)) - hr.b) * hr.z * PW;
    const Y = (v: number) => T + (top - v) / (top - bot) * PH;
    g.font = "11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    const yStep = vr.z === 1 ? 12 : [1, 2, 3, 6].find((k) => PH * k / (top - bot) >= 18) ?? 12;
    for (let v = Math.floor(top / yStep) * yStep; v >= bot - 0.01; v -= yStep) { g.fillStyle = "#f3e2e9"; g.fillRect(L, Math.round(Y(v)), PW, 1); g.fillStyle = "#a88595"; g.fillText(minus(String(v)) + (v === top ? " dB" : ""), L - 5, Y(v)); }
    g.textAlign = "center"; g.textBaseline = "top";
    const marks = hr.z < 2 ? [1, 2, 5] : hr.z < 6 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
    const labels: number[] = [20];
    for (let dec10 = 10; dec10 <= fmax; dec10 *= 10) for (const m of marks) { const fr = Math.round(m * dec10); if (fr > 20 && fr <= fmax) labels.push(fr); }
    let lastX = -99;
    for (const fr of labels) { const x = X(fr); if (x < L - 1 || x > L + PW + 1) continue; g.fillStyle = "#f3e2e9"; g.fillRect(Math.round(x), T, 1, PH); const txt = fr >= 1000 ? `${fr / 1000}k` : String(fr), tw = g.measureText(txt).width; if (x - tw / 2 < lastX + 8) continue; g.fillStyle = "#a88595"; g.fillText(txt, x, T + PH + 6); lastX = x + tw / 2; }
    g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.translate(0, (T + PH) * (1 - rise)); g.scale(1, rise);
    for (let li = 0; li < list.length; li++) {
      const p = list[li];
      g.strokeStyle = FILE_C[li]; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let first = true;
      for (let x = 0; x <= PW; x++) { const fr = 20 * Math.pow(fmax / 20, hr.b + x / PW / hr.z); if (fr > p.rate / 2) break; const v = at(p, fr); const y = Y(v); if (first) { g.moveTo(L + x, y); first = false; } else g.lineTo(L + x, y); }
      g.stroke();
    }
    g.restore();
    if (f != null && X(f) >= L && X(f) <= L + PW) { g.fillStyle = "rgba(74,43,56,.5)"; g.fillRect(Math.round(X(f)), T, 1, PH); }
  }, [list, maxNyq, f, rise, vr.z, vr.b, hr.z, hr.b]);
  // ผลต่างช่วงที่ได้ยิน · ไม่นับช่วงที่เบากว่า −100 dB ทั้งคู่
  // หลายไฟล์ เอาไฟล์ที่ต่างจากไฟล์แรกมากสุดเป็นตัวสรุป
  const a = list[0];
  let mx = 0, mxF = 0, mxI = 1, low = 0;
  for (let li = 1; li < list.length; li++) {
    const b = list[li];
    for (let fr = 20; fr <= Math.min(20000, a.rate / 2, b.rate / 2); fr *= 1.01) { const va = at(a, fr), vb = at(b, fr); if (va < -100 && vb < -100) continue; const d = vb - va; if (Math.abs(d) > Math.abs(mx)) { mx = d; mxF = fr; mxI = li; } }
    for (let fr = 20; fr <= Math.min(15000, a.rate / 2, b.rate / 2); fr *= 1.01) { const va = at(a, fr), vb = at(b, fr); if (va < -100 && vb < -100) continue; low = Math.max(low, Math.abs(vb - va)); }
  }
  const fTxt = (fr: number) => (fr >= 1000 ? `${(fr / 1000).toFixed(1)} kHz` : `${Math.round(fr)} Hz`);
  return (<>
    <div style={{ flex: "1 0 180px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} {...grab.props} style={{ position: "relative", flex: 1, minWidth: 0 }} onWheel={vr.wheel} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), PW = r.width - L - R, x = e.clientX - r.left - L; if (x >= 0 && x <= PW) setF(20 * Math.pow(fmax / 20, hr.b + x / PW / hr.z)); }} onPointerLeave={() => setF(null)} data-cmppsd>
        <canvas className="cv fillcv" ref={ref} />
        <VBar v={vr} right={R + 4} top={T} bottom={Bm} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
    </div>
    <div style={{ marginRight: 30 }} data-cmppsdhscroll><TimeScroll dur={1} t0={hr.b} t1={hr.b + 1 / hr.z} left={L} right={R} onPan={(c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z))} /></div>
    <div className="psdread" data-cmppsdread>
      <span className="zbtns" style={{ order: 9, marginLeft: "auto" }} data-cmppsdhzoom>
        <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
        <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        <button type="button" className="zb" onClick={onReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button>
      </span>
      <span className="lbl">ตำแหน่งชี้</span><span className="psdbox" style={{ whiteSpace: "normal" }}>{f == null ? "ชี้บนกราฟเพื่อดูค่า" : `${fTxt(f)} (${noteOf(f)}) = ${list.map((p, i) => `${LABELS[i]} ${minus(at(p, f).toFixed(0))} dB`).join(", ")}${list.length === 2 ? ` ต่างกัน ${Math.abs(at(list[1], f) - at(a, f)).toFixed(1)} dB` : ""}`}</span>
      <span className="lbl">ต่างมากสุดช่วงที่ได้ยิน</span><span className="psdbox">{fTxt(mxF)} {LABELS[mxI]}{mx < 0 ? "บางลง" : "หนาขึ้น"} {Math.abs(mx).toFixed(1)} dB</span>
    </div>
    <Stat kind={low > 3 ? "warn" : "info"} b={`ช่วงที่ได้ยิน 20 Hz ถึง 15 kHz ${list.length === 2 ? "สองเส้น" : `ทุกเส้นจาก${LABELS[0]}`}ต่างกันไม่เกิน ${low.toFixed(1)} dB`} d={`ต่างมากสุดในช่วง 20 Hz ถึง 20 kHz ที่ ${fTxt(mxF)} ${LABELS[mxI]}${mx < 0 ? "บางลง" : "หนาขึ้น"} ${Math.abs(mx).toFixed(1)} dB`} />
  </>);
}
