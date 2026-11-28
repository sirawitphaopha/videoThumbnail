/* หน้ากราฟเสียง มุมมองความดัง (LoudView) กับซ้อนเทียบช่อง (CmpView) และคำอธิบายตารางหน้าความดัง
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.6) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useState } from "react";
import { type GOverview } from "../../lib/api";
import { FixedTime, Keep } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { IbTable, IbPlay } from "../../components/icons";
import { CMP, RangeTime, Theme, dbTxt, label, minus, pkTxt, tfmt } from "./common";
import { SaveBtn, Src, hiCopy, sample, screenK, useCanvas } from "./draw";
import { Crosshair, Mark, Marks, VBar, axisY, useGrab, useVRange, vWindow } from "./parts";
import { FZoom } from "./zoom";
import { PlayHead } from "./playBar";

/** คำอธิบายตารางหน้าความดัง (BUGS ข้อ 78 · พี่กันถาม 13 พ.ย. 2569 "เเล้วตารานี้มันบอกอะไรแฮะ") */
const TIP_LOUD_TABLE: Tip = {
  w: "ตัวเลขของทั้งไฟล์ทีละช่อง ใช้เทียบว่าช่องไหนดังกว่ากัน และมีเสียงแตกไหม",
  o: [
    ["ดังสุด (Peak)", "จุดที่ดังที่สุดของช่องนั้นเทียบกับเพดาน 0 dB ของไฟล์ดิจิทัล เช่น −0.2 dB คือเกือบชนเพดาน", "", ""],
    ["ความดังเฉลี่ย", "ความดังโดยรวมของทั้งเพลง (RMS) ตัวเลขใกล้ 0 คือดังมาก ส่วนเพลงที่อัดมาเบาจะติดลบมาก", "", ""],
    ["เสียงแตก", "จำนวนจุดที่เสียงชนเพดานจนยอดคลื่นถูกตัด ฟังแล้วแตกพร่า ขึ้นว่าไม่พบคือไม่มีเลย", "", ""],
  ],
  r: "ดังสุดใกล้ 0 dB แต่เสียงแตกไม่พบ แปลว่าไฟล์ดังเต็มที่แต่ยังไม่แตก",
};
export type CommonProps = { scroller?: (left: number, right: number) => React.ReactNode; save: () => void; exportRef: React.MutableRefObject<(outW: number) => HTMLCanvasElement | null>; plotRef: React.RefObject<HTMLDivElement | null> };
export function LoudView({ head, onPan, onBusy, resetN, scroller, ov, th, t0, t1, names, marks, zoomBox, at, live, setHover, showTable, setShowTable, save, exportRef, plotRef }: CommonProps & { head?: React.ReactNode; onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; ov: GOverview; th: Theme; t0: number; t1: number; names: string[]; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; showTable: boolean; setShowTable: (b: boolean) => void }) {
  const X0 = 44;
  const pick = (t: number) => { const c = Math.max(0, Math.min(ov.cols - 1, Math.floor(t / ov.duration * ov.cols))); return ov.loud[c]; };
  const vr = useVRange(resetN);
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const pad = 12, { lo, hi, step } = vWindow(-60, 0, vr), Y = (v: number) => pad + (hi - v) / (hi - lo) * (h - pad * 2), N = w - X0 - 4;
    axisY(g, X0, w, h, pad, lo, hi, step, "LUFS");
    // ซูมแล้วเส้นที่เกินช่วงตัดทิ้งตรงขอบ ไม่แบนติดขอบ
    g.save(); g.beginPath(); g.rect(X0, pad, N, h - pad * 2); g.clip();
    const pts: number[] = [];
    for (let x = 0; x < N; x++) { const a = t0 + (t1 - t0) * x / N, b = t0 + (t1 - t0) * (x + 1) / N; let e = 0, n = 0; for (let c = Math.floor(a / ov.duration * ov.cols); c <= Math.floor(b / ov.duration * ov.cols) && c < ov.cols; c++) { if (c < 0) continue; e += Math.pow(10, ov.loud[c] / 10); n++; } pts.push(n ? 10 * Math.log10(e / n) : -70); }
    g.fillStyle = th.peak; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(X0, Y(lo)); pts.forEach((v, x) => g.lineTo(X0 + x, Y(v))); g.lineTo(X0 + N, Y(lo)); g.closePath(); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = th.rms; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath(); pts.forEach((v, x) => (x ? g.lineTo(X0 + x, Y(v)) : g.moveTo(X0, Y(v)))); g.stroke();
    g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(-23)), N, 1);
    g.font = "600 11.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#6b4a58"; g.fillText("อ้างอิง −23 LUFS", X0 + N - 4, Y(-23) - 3);
    g.restore();
  }, [ov, th, t0, t1, vr.z, vr.b]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  exportRef.current = (outW) => (ref.current ? hiCopy(ref.current, outW ? outW / ref.current.clientWidth : screenK()) : null);
  const f1 = (v: number | null) => (v == null ? "—" : minus(v.toFixed(1)));
  const sil = ov.silences.length;
  const grab = useGrab({ canX: t1 - t0 < ov.duration - 0.01, canY: vr.z > 1, span: t1 - t0, center: (t0 + t1) / 2, z: vr.z, b: vr.b, left: X0, right: 4, top: 12, bottom: 12, onX: onPan, onY: (b) => vr.setB(vr.clampB(b, vr.z)), onBusy });
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick">
      <div className="tiles" data-graphtiles>
        <div className="tile"><span>ความดังรวม</span><b>{f1(ov.integrated)} LUFS</b><em>ทั้งไฟล์ ตามมาตรฐาน EBU R128</em></div>
        <div className="tile"><span>ดังสุด (True Peak)</span><b>{f1(ov.truePeak)} dBTP</b><em>{(ov.truePeak ?? -99) >= 0 ? "ถึง 0 อาจมีเสียงแตก" : "ไม่ถึง 0"}{ov.clips.some((c) => c > 0) ? ` เสียงแตก ${ov.clips.reduce((a, b) => a + b, 0)} จุด` : ""}</em></div>
        <div className="tile"><span>ช่วงความดัง</span><b>{f1(ov.lra)} LU</b><em>ห่างระหว่างช่วงเบากับช่วงดัง</em></div>
        <div className="tile"><span>ช่วงเงียบผิดปกติ</span><b>{sil ? `${sil} ช่วง` : "ไม่พบ"}</b><em>{sil ? `แรกสุดที่ ${tfmt(ov.silences[0][0])}` : "เงียบทุกช่องเกิน 1 วินาที"}</em></div>
      </div>
      <div className="plothead"><span><b>ความดัง</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={ov.duration} /></span></span>{head}{zoomBox}</div>
      </div>
      <div style={{ flex: "1 0 200px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} onWheel={vr.wheel} {...grab.props} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - 4, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-loudbox>
        <canvas className="cv fillcv" ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={4} inline />
        <PlayHead t0={t0} t1={t1} left={X0} right={4} />
        {live && <Crosshair box={box} left={X0} right={4} t0={t0} t1={t1} at={at} rows={[{ v: minus(pick(at).toFixed(1)) + " LUFS", k: "ทุกช่องรวม" }]} />}
        <VBar v={vr} right={6} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {scroller?.(X0, 34)}
      <div className="sub">ดังสุดแต่ละช่อง</div>
      <div className="pbars">{names.map((c, i) => <FragmentBar key={c} code={label(names, c).code} th={label(names, c).th} w={Math.max(ov.peaks[i] <= -119 ? 0 : 2, (ov.peaks[i] + 48) / 48 * 100)} color={th.rms} v={pkTxt(ov.peaks[i])} />)}</div>
      <div className="agfoot"><div className="lg"><span><i style={{ background: th.peak }} />ความดัง</span><span><span className="ln" style={{ background: th.rms }} />เส้นความดัง</span><span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง</span></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}><button type="button" className="btn btn-ghost btn-sm" aria-expanded={showTable} onClick={() => setShowTable(!showTable)} data-table><Keep icon={<IbTable size={15} />} all={["ซ่อนตาราง", "ดูเป็นตาราง"]}>{showTable ? "ซ่อนตาราง" : "ดูเป็นตาราง"}</Keep></button><InfoTip title="ตารางความดังทั้งไฟล์" tip={TIP_LOUD_TABLE} /><SaveBtn onClick={save} /></div></div>
      {/* ตารางกางลงหุบขึ้นแบบค่อย ๆ เลื่อน เดิมโผล่ทันที (BUGS ข้อ 78 · พี่กันสั่ง 13 พ.ย. 2569 "ตอนตารางมันเด้งมา ขออนิเมชั่นลื่นๆ") · หุบอยู่ไม่ให้กดหรืออ่านจากโปรแกรมอ่านจอ */}
      <div className={"gtable" + (showTable ? " open" : "")} aria-hidden={!showTable} data-graphtablewrap onTransitionEnd={(e) => { if (showTable && e.propertyName === "grid-template-rows") e.currentTarget.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>
        <div><table className="fmt" style={{ marginTop: 10 }} data-graphtable><thead><tr><th>ช่อง</th><th className="num">ดังสุด (Peak)</th><th className="num">ความดังเฉลี่ย</th><th className="num">เสียงแตก</th></tr></thead>
        <tbody>{names.map((c, i) => <tr key={c}><td><b>{label(names, c).code}</b> {label(names, c).th}</td><td className="num">{pkTxt(ov.peaks[i])}</td><td className="num">{pkTxt(ov.rms[i])}</td><td className="num">{ov.clips[i] ? `${ov.clips[i]} จุด` : "ไม่พบ"}</td></tr>)}</tbody></table></div>
      </div>
    </div>
  );
}
function FragmentBar({ code, th, w, color, v }: { code: string; th: string; w: number; color: string; v: string }) {
  return <><div className="small" style={{ color: "var(--txt2)" }}><b style={{ color: "var(--txt)" }}>{code}</b> {th}</div><div className="bt"><i style={{ width: `${w}%`, background: color }} /></div><div className="v">{v}</div></>;
}

/* ---------- ซ้อนเทียบ ---------- */
export function CmpView({ head, onPan, onBusy, resetN, scroller, dur, src, names, cc, t0, t1, marks, zoomBox, at, live, setHover, play, save, exportRef, plotRef }: CommonProps & { head?: React.ReactNode; onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; dur: number; src: Src; names: string[]; cc: string[]; t0: number; t1: number; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; play: () => void }) {
  // ที่ว่างป้ายชื่อเส้นทางขวา พอสำหรับคำที่ยาวสุด "ซ้ายหน้า" (60 ตัดตัวสุดท้าย เจอตอนเทส 7 พ.ย. 2569)
  const X0 = 44, RW = 80;
  const vr = useVRange(resetN);
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const pad = 12, { lo, hi, step } = vWindow(-48, 0, vr), N = w - X0 - RW, Y = (v: number) => pad + (hi - v) / (hi - lo) * (h - pad * 2);
    axisY(g, X0, w - RW, h, pad, lo, hi, step, "dB");
    g.save(); g.beginPath(); g.rect(X0, pad, N, h - pad * 2); g.clip();
    const ends: [string, number][] = [];
    for (const c of cc) {
      const d = sample(src, names.indexOf(c), t0, t1, N), win = Math.max(1, Math.round(N * 3 / (t1 - t0 || 1) / 2));
      g.strokeStyle = CMP[c]; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let last = -48;
      for (let x = 0; x < N; x++) {
        let s = 0, n = 0; for (let k = -win; k <= win; k++) { const j = x + k; if (j < 0 || j >= N) continue; s += d.rm[j] ** 2; n++; }
        const v = d.rm[x] <= 0.0001 ? -48 : 20 * Math.log10(Math.sqrt(s / n)); last = v; if (x) g.lineTo(X0 + x, Y(v)); else g.moveTo(X0, Y(v));
      }
      g.stroke(); ends.push([c, Math.max(pad, Math.min(h - pad, Y(last)))]);
    }
    g.restore();
    // ป้ายห่างกันอย่างน้อย 15 · ดันลงจนชนขอบล่าง แล้วดันทั้งกลุ่มกลับขึ้น ป้ายไม่หลุดกรอบ (ช่องที่เงียบทั้งคู่เส้นทับกันที่ล่างสุด)
    ends.sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < ends.length; i++) if (ends[i][1] - ends[i - 1][1] < 15) ends[i][1] = ends[i - 1][1] + 15;
    for (let i = ends.length - 1; i >= 0; i--) { const lim = h - 8 - (ends.length - 1 - i) * 15; if (ends[i][1] > lim) ends[i][1] = lim; }
    g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
    for (const [c, y] of ends) { g.fillStyle = CMP[c]; g.fillRect(X0 + N + 6, Math.round(y), 12, 2); g.fillStyle = "#4a2b38"; g.fillText(label(names, c).th.split(" ")[0], X0 + N + 22, y); }
  }, [src, t0, t1, cc, vr.z, vr.b]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  exportRef.current = (outW) => (ref.current ? hiCopy(ref.current, outW ? outW / ref.current.clientWidth : screenK()) : null);
  const grab = useGrab({ canX: t1 - t0 < dur - 0.01, canY: vr.z > 1, span: t1 - t0, center: (t0 + t1) / 2, z: vr.z, b: vr.b, left: X0, right: RW, top: 12, bottom: 12, onX: onPan, onY: (b) => vr.setB(vr.clampB(b, vr.z)), onBusy });
  const val = (c: string) => { const e = src.env[names.indexOf(c)], k = Math.max(0, Math.min(src.cols - 1, Math.floor((at - src.t0) / (src.t1 - src.t0 || 1) * src.cols))); return e[k * 3 + 2]; };
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plothead"><span><b>ความดัง</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{head}{zoomBox}</div>
      <div style={{ flex: "1 0 250px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} onWheel={vr.wheel} {...grab.props} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - RW, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-cmpbox>
        <canvas className="cv fillcv" ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={RW} inline />
        <PlayHead t0={t0} t1={t1} left={X0} right={RW} />
        {live && <Crosshair box={box} left={X0} right={RW} t0={t0} t1={t1} at={at} rows={cc.map((c) => ({ v: dbTxt(val(c)) + " dB", k: `${label(names, c).code} ${label(names, c).th}`, color: CMP[c] }))} />}
        <VBar v={vr} right={RW + 2} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {scroller?.(X0, RW + 30)}
      <div className="agfoot"><div className="lg">{cc.map((c) => <span key={c}><span className="ln" style={{ background: CMP[c] }} />{label(names, c).code} {label(names, c).th}</span>)}</div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={play}><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(dur)} /></span></button><SaveBtn onClick={save} /></div></div>
    </div>
  );
}
