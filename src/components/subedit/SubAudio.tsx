/* กรอบคลื่นเสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · รุ่นแรกยกวิธีวาดจากตัวดูซับเดิม SubViewer.tsx)
   ช่วงบรรทัดที่กำลังแก้บวกลบ 3 วินาที กรอบเวลาของทุกบรรทัดในช่วงพร้อมลำดับ บรรทัดที่แก้เข้มกว่า เส้นตั้งคือเวลาเริ่มกับจบ
   ขั้น 5 เพิ่มซูม ความดัง ลากเวลา เล่นเสียง แถวปุ่มเสียง 19 ปุ่ม */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { graphApi, subApi, type GWindow, type SubDoc, type SubEvent } from "../../lib/api";
import { Seg, Skel } from "../ui";
import InfoTip from "../InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { IbEye, IcGraph } from "../icons";
import { useVid, vidKeys, vidRate } from "../../lib/vidFrames";

/** สีภาพความถี่ เงียบเข้ม ดังสว่าง (โทนเดียวกับหน้ากราฟเสียง) · เป็นเนื้อหาของกราฟ ไม่เปลี่ยนตามโทนสี */
const RAMP = ["#160c22", "#4a1d5c", "#a8327a", "#ef6f6c", "#fde3a7"];
const LUT = (() => { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const q = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(q)), f = q - k; for (let j = 0; j < 3; j++) { const a = parseInt(RAMP[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(RAMP[k + 1].slice(1 + j * 2, 3 + j * 2), 16); o[i * 3 + j] = a * (1 - f) + b * f; } } return o; })();
const WAVE_TIP: Tip = {
  w: "แถบสีจางคือเวลาของแต่ละบรรทัด เลขบนแถบคือลำดับบรรทัด แถบเข้มคือบรรทัดที่กำลังแก้ และเส้นตั้งสีชมพูสองเส้นคือเวลาเริ่มกับเวลาจบ  เส้นประสีม่วงคือ keyframe ซึ่งมักตรงจุดเปลี่ยนฉาก ส่วนเส้นสีเขียวคือตำแหน่งของภาพหนังที่แสดงอยู่",
  o: [
    ["รูปคลื่น", "ความดังของเสียงตามเวลา คลื่นสูงคือเสียงดัง เส้นแบนคือเงียบ", "เห็นจุดที่คนเริ่มพูดกับหยุดพูดชัด", "เสียงพูดกับเสียงดนตรีดูคล้ายกัน"],
    ["ความถี่", "เสียงสูงต่ำตามเวลา ความถี่ต่ำอยู่ล่าง ความถี่สูงอยู่บน ส่วนที่สว่างคือเสียงดัง", "แยกเสียงพูดออกจากเสียงดนตรีได้", "อ่านยากกว่า"],
  ],
  r: "ใช้รูปคลื่นเป็นหลัก สลับเป็นความถี่ตอนเสียงพูดปนกับดนตรี",
};
const dec = (b64: string) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
const short = (ms: number) => { const s = Math.max(0, ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };

export default function SubAudio(p: { movie: string; refStream: number | null; refIdx: number | null; delayMs: number; doc: SubDoc; ev: SubEvent | null }) {
  const [wave, setWave] = useState<{ t0: number; t1: number; v: number[] } | null>(null);
  const [look, setLook] = useState<"wave" | "spec">("wave");
  const [spec, setSpec] = useState<{ t0: number; t1: number; w: GWindow } | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const vs = useVid();
  const d = p.delayMs;
  const t0 = p.ev ? Math.max(0, p.ev.start + d - 3000) : 0, t1 = p.ev ? p.ev.end + d + 3000 : 0;

  useEffect(() => {
    if (!p.ev || !p.movie || p.refStream == null) return;
    let live = true;
    const tm = setTimeout(() => {
      subApi.wave(p.movie, p.refStream!, t0 / 1000, t1 / 1000, 600).then((v) => { if (live) setWave({ t0, t1, v }); }, () => {});
      if (look === "spec" && p.refIdx != null) graphApi.window(p.movie, p.refIdx, t0 / 1000, t1 / 1000, 600, 128, true).then((w) => { if (live && w) setSpec({ t0, t1, w }); }, () => {});
    }, 120);
    return () => { live = false; clearTimeout(tm); };
  }, [t0, t1, p.movie, p.refStream, p.refIdx, look]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = cv.current;
    if (!el || !wave || !p.ev) return;
    const r = window.devicePixelRatio || 1, w = el.clientWidth, h = el.clientHeight;
    el.width = Math.round(w * r); el.height = Math.round(h * r);
    const g = el.getContext("2d")!;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const X = (t: number) => ((t - wave.t0) / (wave.t1 - wave.t0)) * w;
    const sp = look === "spec" && spec && spec.t0 === wave.t0 ? spec.w : null;
    if (sp && sp.spec.length) {
      const chs = sp.spec.map(dec), cols = sp.cols, bins = sp.bins;
      const off = document.createElement("canvas"); off.width = cols; off.height = bins;
      const og = off.getContext("2d")!, img = og.createImageData(cols, bins);
      for (let row = 0; row < bins; row++) for (let col = 0; col < cols; col++) {
        let v = 0; for (const a of chs) v = Math.max(v, a[col * bins + (bins - 1 - row)] ?? 0);
        const o = (row * cols + col) * 4; img.data[o] = LUT[v * 3]; img.data[o + 1] = LUT[v * 3 + 1]; img.data[o + 2] = LUT[v * 3 + 2]; img.data[o + 3] = 255;
      }
      og.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, 0, 0, w, h);
    }
    p.doc.events.forEach((x, i) => {
      if (x.comment) return;
      const a = x.start + d, b = x.end + d;
      if (b < wave.t0 || a > wave.t1) return;
      const on = x.id === p.ev!.id;
      g.fillStyle = on ? "rgba(233,138,172,.32)" : "rgba(233,138,172,.14)"; g.fillRect(X(a), 0, X(b) - X(a), h);
      g.fillStyle = sp ? "#ffffff" : on ? "#7a2346" : "#b28a9a"; g.font = `${on ? 700 : 600} 11px Sarabun`; g.fillText(String(i + 1), X(a) + 4, 13);
    });
    if (!sp) {
      const mid = h / 2;
      g.fillStyle = "rgba(74,43,56,.08)"; g.fillRect(0, mid, w, 1);
      g.fillStyle = "#d9719a";
      for (let x = 0; x < w; x++) { const v = wave.v[Math.floor((x / w) * wave.v.length)] ?? 0; const y = v * (mid - 4); g.fillRect(x, mid - y, 1, Math.max(1, y * 2)); }
    }
    // เส้น keyframe ที่เวลาเริ่มของเฟรม (AudioMarkerProviderKeyframes ของ Aegisub ใช้ START) กับเส้นตำแหน่งภาพหนัง
    const fr = vidRate(vs);
    const kl = vs.hideKeys ? [] : vidKeys(vs).list;
    if (fr && kl.length) {
      const a = fr.frameAt(wave.t0), b = fr.frameAt(wave.t1) + 1;
      let i = 0, j = kl.length;
      while (i < j) { const m = (i + j) >> 1; if (kl[m] < a) i = m + 1; else j = m; }
      g.strokeStyle = sp ? "#ffffff" : "#6b4fd6"; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      for (; i < kl.length && kl[i] <= b; i++) { const x = Math.round(X(fr.timeAt(kl[i], "start"))) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.setLineDash([]);
    }
    g.fillStyle = sp ? "#ffffff" : "#c2547f"; g.fillRect(X(p.ev.start + d) - 1, 0, 2, h); g.fillRect(X(p.ev.end + d) - 1, 0, 2, h);
    if (fr && vs.pos != null) { const x = X(fr.timeAt(vs.pos)); if (x >= 0 && x <= w) { g.fillStyle = sp ? "#9df2c8" : "#1f8a70"; g.fillRect(Math.round(x) - 1, 0, 2, h); } }
  }, [wave, spec, look, p.ev, p.doc.events, d, vs.pos, vs.hideKeys, vs.keysBy, vs.table, vs.dummy, vs.closed]);

  if (p.refStream == null) return <div className="se-audio"><div className="small">{p.movie ? "ไม่มีเสียงในหนังให้แสดงคลื่น" : "เปิดไฟล์ซับอย่างเดียว จึงไม่มีคลื่นเสียง"}</div></div>;
  return (
    <div className="se-audio">
      <div className="se-wavebox">
        {wave ? <canvas ref={cv} className="aud" aria-label="คลื่นเสียงช่วงของบรรทัดที่กำลังแก้" data-aud /> : <Skel w="100%" h={150} />}
        {/* ปุ่มมุมขวาบนของกราฟแบบหน้าวิเคราะห์ · คำอธิบายสีอยู่ในปุ่ม ⓘ ไม่กินแถว */}
        <span className="se-wavebtns">
          {p.refIdx != null && <Seg small label="แบบคลื่นเสียง" value={look} onChange={setLook} options={[{ value: "wave", label: <><IcGraph size={14} />รูปคลื่น</> }, { value: "spec", label: <><IbEye size={14} />ความถี่</> }]} />}
          <InfoTip title="อ่านภาพคลื่นเสียง" tip={WAVE_TIP} />
        </span>
      </div>
      {wave && <div className="ruler2" style={{ marginLeft: 0 }}>{[0, 0.25, 0.5, 0.75, 1].map((f, i) => <span key={f} style={{ left: `${f * 100}%`, transform: i === 0 ? "none" : i === 4 ? "translateX(-100%)" : undefined }}>{short(wave.t0 + f * (wave.t1 - wave.t0))}</span>)}</div>}
    </div>
  );
}
