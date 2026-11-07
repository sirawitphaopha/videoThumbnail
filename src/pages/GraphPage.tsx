/* หน้ากราฟเสียง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
   6 แบบ รูปคลื่น (เส้นละเอียด หรือ แท่ง) · ความถี่ (สีตามชุด หรือ สีรุ้ง) · ความดัง · ซ้อนเทียบ · วิเคราะห์ (แบบ Spek) · ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity)
   ข้อมูลจริงจาก audiograph.rs · ภาพรวมทั้งเรื่องอ่านครั้งเดียว ช่วงที่ซูมอ่านเฉพาะช่วง ระหว่างรอใช้ภาพรวมวาดไปก่อน ไม่มีจอว่าง */
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AUDIO_EXT, checkApi, graphApi, inApp, pickFile, pickSave, thumbUrl, type GInfo, type GOverview, type GProgress, type GPsd, type GTrack, type GWindow, type Movie } from "../lib/api";
import { useLibrary } from "../lib/library";
import { useToast } from "../components/Toasts";
import Dropdown from "../components/Dropdown";
import { Phr, Switch } from "../components/ui";
import { fmtSize } from "../lib/format";

export type GraphReq = { path: string; t?: number };
type View = "wave" | "spec" | "loud" | "cmp" | "spek" | "psd";
type Theme = { lane: string; peak: string; rms: string; dark: string; ramp: string[] };

/* ชุดสีคำนวณจาก OKLCH สีเดียวต่อชุด (มอคอัป · สกิล dataviz) · พีชแทนอำพันที่พี่กันทักว่าไม่เข้ากับโปรแกรม */
const THEMES: Record<string, Theme> = {
  "ชมพู": { lane: "#fff8fa", peak: "#f0b4ca", rms: "#b54879", dark: "#220f17", ramp: ["#2e1720", "#591b38", "#841f51", "#aa2f6b", "#c84d85", "#dd73a0", "#e89eba", "#ebcad5", "#ffecf2"] },
  "ฟ้า": { lane: "#f7fafe", peak: "#a3ccf7", rms: "#1577c8", dark: "#091725", ramp: ["#102031", "#003763", "#014f8a", "#0068b5", "#0b83de", "#4fa0ee", "#89bcf2", "#c1d7ee", "#e9f3fe"] },
  "ม่วง": { lane: "#fbf9ff", peak: "#cebdf2", rms: "#835cbe", dark: "#181224", ramp: ["#221b2f", "#3e275f", "#5a348d", "#7648b6", "#9164d3", "#a985e5", "#c0aaeb", "#d8cfeb", "#f4efff"] },
  "พีช": { lane: "#fef9f7", peak: "#f4b7a7", rms: "#bc4c31", dark: "#24100b", ramp: ["#301812", "#5d1d0e", "#8a2306", "#b13412", "#d05233", "#e4785d", "#eda28e", "#edccc3", "#ffede9"] },
};
const THEME_ORDER = ["ชมพู", "ฟ้า", "ม่วง", "พีช"];
const RAINBOW = ["#00004d", "#0000b4", "#0046ff", "#00aaff", "#00e6d2", "#64ff64", "#e6f000", "#ff9600", "#ff1e1e", "#ff46c8"];
const HEAT = ["#000000", "#000036", "#180062", "#4f007b", "#81007e", "#ae0068", "#d20040", "#ec000b", "#fc5500", "#ffb000", "#ffec3e", "#ffff9e", "#ffffff"];
const MONO = ["#000000", "#ffffff"];
/** สีเทียบช่อง ซ้าย ขวา กลาง · 3 สีแรกของชุดสีตั้งต้นสกิล dataviz ผ่านตัวตรวจทุกคู่ · สีตามช่อง */
const CMP: Record<string, string> = { FL: "#2a78d6", FR: "#eb6834", FC: "#1baf7a" };
/** สีของความถี่เฉลี่ยแบบซ้อนทุกช่อง ตามตำแหน่งช่อง 8 สี ลำดับตายตัว (ชุดสีแยกกลุ่มของสกิลกราฟ ผ่านตัวตรวจตาบอดสี ΔE ข้างเคียงต่ำสุด 9.1)
    สามสีแรกตรงกับแบบซ้อนเทียบ · สีเหลือง เขียวน้ำทะเล ชมพู ตัดพื้นขาวต่ำ จึงมีชื่อช่องบนป้ายกับตัวเลขในช่องบอกค่าเสมอ */
const OVER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** ไอคอนนำหน้าปุ่ม 6 แบบ ตามมอคอัป (ตกหล่นตอนทำรอบแรก พี่กันส่งภาพมอคอัปมา 7 พ.ย. 2569 แคลร์เห็นเอง) */
const vi = (children: React.ReactNode) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">{children}</svg>;
const VIEW_ICON: Record<View, React.ReactNode> = {
  wave: vi(<path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" />),
  spec: vi(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 16v-3M11 16V9M15 16v-5M19 16v-2" /></>),
  loud: vi(<path d="M3 18l5-6 4 3 4-8 5 5" />),
  cmp: vi(<><path d="M3 15c3-6 5-6 8 0s5 6 10-4" /><path d="M3 10c4 4 7 4 10-1s5-4 8 1" opacity=".55" /></>),
  spek: vi(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 17V9M10 17V6M13 17v-5M16 17V8" /><path d="M21 7h-2M21 12h-2M21 17h-2" /></>),
  psd: vi(<><path d="M3 20h18" /><path d="M4 17c2-1 3-9 5-9s2 6 4 6 3-4 5-4 2 3 3 3" /></>),
};
const VIEWS: [View, string][] = [["wave", "รูปคลื่น"], ["spec", "ความถี่"], ["loud", "ความดัง"], ["cmp", "ซ้อนเทียบ"], ["spek", "วิเคราะห์"], ["psd", "ความถี่เฉลี่ย"]];
const ZOOMS: [number | "all", string][] = [["all", "ทั้งเรื่อง"], [600, "10 นาที"], [240, "4 นาที"], [30, "30 วินาที"]];
const PSD_SPANS: [number | "all", string][] = [[10, "10 วินาที"], [30, "30 วินาที"], [120, "2 นาที"], ["all", "ทั้งเรื่อง"]];
const TH: Record<string, string> = { FL: "ซ้ายหน้า", FR: "ขวาหน้า", FC: "กลาง · เสียงพูด", LFE: "เสียงเบส", BL: "ซ้ายหลัง", BR: "ขวาหลัง", SL: "ซ้ายข้าง", SR: "ขวาข้าง", BC: "หลังกลาง", FLC: "หน้าซ้ายกลาง", FRC: "หน้าขวากลาง" };
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteOf = (f: number) => { const n = Math.round(12 * Math.log2(f / 440)) + 57; return NOTES[((n % 12) + 12) % 12] + Math.floor(n / 12); };
const WARN = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></svg>;

function tfmt(t: number) { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; }
const minus = (s: string) => s.replace("-", "−");
/** ข้อความหลายท่อนคั่นด้วย " · " แยกเป็นบรรทัด ตัดคำเฉพาะตรงเว้นวรรค ไม่ตัดกลางวลี (เคยตัด "MP3 | หรือ AAC" เจอตอนตรวจภาพ) */
const lines = (s: string) => s.split(" · ").map((l) => <div key={l}><Phr>{l}</Phr></div>);
/** ยอดหรือความดังเฉลี่ยของช่อง (dB) · ช่องที่เงียบทั้งเรื่องบอกว่าเงียบ ไม่ขึ้น −120.0 dB */
const pkTxt = (v: number) => (v <= -119 ? "เงียบ" : minus(v.toFixed(1)) + " dB");
const dbTxt = (v: number) => v <= 0.0001 ? "−∞" : minus((20 * Math.log10(v)).toFixed(1));
const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** ชื่อช่องที่โชว์ · 2 ช่อง L R · ช่องเดียว M */
function label(names: string[], c: string) {
  if (names.length === 2) return c === "FL" ? { code: "L", th: "ซ้าย" } : { code: "R", th: "ขวา" };
  if (names.length === 1) return { code: "M", th: "เสียงเดียว" };
  const side = names.length === 6 && (c === "SL" || c === "SR");
  return { code: c, th: side ? (c === "SL" ? "ซ้ายเซอร์ราวด์" : "ขวาเซอร์ราวด์") : TH[c] ?? c };
}

/* ---------- วาด ---------- */
function lut(ramp: string[]) {
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const p = i / 255 * (ramp.length - 1), k = Math.min(ramp.length - 2, Math.floor(p)), f = p - k;
    for (let j = 0; j < 3; j++) { const a = parseInt(ramp[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(ramp[k + 1].slice(1 + j * 2, 3 + j * 2), 16); out[i * 3 + j] = a * (1 - f) + b * f; }
  }
  return out;
}

function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number, r: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ro = new ResizeObserver(() => setW(cv.clientWidth)); ro.observe(cv); setW(cv.clientWidth);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv || !w) return;
    const r = window.devicePixelRatio || 1, h = cv.clientHeight;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(r, 0, 0, r, 0, 0); draw(g, w, h, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, ...deps]);
  return ref;
}

type Src = { env: number[][]; cols: number; t0: number; t1: number };
/** รูปคลื่นของช่วง a–b ที่ n จุดภาพ จากข้อมูลที่มี (ภาพรวมหรือช่วงที่ซูม) */
function sample(src: Src, ch: number, a: number, b: number, n: number) {
  const mx = new Float32Array(n), mn = new Float32Array(n), rm = new Float32Array(n);
  const e = src.env[ch], span = src.t1 - src.t0 || 1;
  if (!e) return { mx, mn, rm };
  for (let x = 0; x < n; x++) {
    const ta = a + (b - a) * x / n, tb = a + (b - a) * (x + 1) / n;
    let c0 = Math.floor((ta - src.t0) / span * src.cols), c1 = Math.ceil((tb - src.t0) / span * src.cols);
    c0 = Math.max(0, Math.min(src.cols - 1, c0)); c1 = Math.max(c0 + 1, Math.min(src.cols, c1));
    let hi = -1, lo = 1, sq = 0;
    for (let c = c0; c < c1; c++) { hi = Math.max(hi, e[c * 3]); lo = Math.min(lo, e[c * 3 + 1]); sq += e[c * 3 + 2] ** 2; }
    mx[x] = Math.max(0, hi); mn[x] = Math.max(0, -lo); rm[x] = Math.sqrt(sq / (c1 - c0));
  }
  return { mx, mn, rm };
}

/** style fine เส้นละเอียด · bars แท่ง · aud แบบ Audacity · vz ขยายแนวตั้ง (0.25 ถึง 8 เท่า ต่ำกว่า 1 คือบีบ) */
function drawWave(g: CanvasRenderingContext2D, w: number, h: number, d: ReturnType<typeof sample>, th: Theme, style: WaveStyle, vz = 1) {
  g.fillStyle = th.lane; g.fillRect(0, 0, w, h);
  const mid = h / 2, A = (h / 2 - 2) * vz;
  if (style === "aud") {
    // แบบ Audacity (พี่กันส่งภาพหน้าคลื่นของ Audacity 7 พ.ย. 2569) · คลื่นยอดสีเข้ม ความดังเฉลี่ยสีอ่อนกว่าข้างใน · เส้นศูนย์ เส้นครึ่ง · ตัวเลขความสูงคลื่นทางซ้าย
    // สีตามชุดสีของโปรแกรม ไม่ใช้สีฟ้าของ Audacity (พี่กัน *"ไม่ต้องคล้ายแบบ 100% เเค่ปรับให้เข้ากับธีมเว็บเรา"*)
    // ตัวเลขความสูงคลื่นอยู่ไม้บรรทัดแนวตั้งนอกกราฟ (drawAmpRuler) ไม่ทับคลื่น (พี่กัน 7 พ.ย. 2569 *"เอาตัวนี้ออกมาข้างนอก ไม่เอาทับกราฟ"*) · ในกราฟเหลือเส้นจางตรงค่าเดียวกับไม้บรรทัด
    const lim = (v: number) => Math.min(h / 2 - 1, v * A);
    g.fillStyle = "rgba(74,43,56,.10)";
    for (const t of ampTicks(h, vz).major) if (t.v !== 0) g.fillRect(0, Math.round(t.y), w, 1);
    g.fillStyle = "rgba(74,43,56,.28)"; g.fillRect(0, Math.round(mid), w, 1);
    const band = (top: Float32Array, bot: Float32Array, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, mid); for (let x = 0; x < w; x++) g.lineTo(x + 0.5, mid - lim(top[x])); for (let x = w - 1; x >= 0; x--) g.lineTo(x + 0.5, mid + lim(bot[x])); g.closePath(); g.fill(); };
    band(d.mx, d.mn, th.rms); band(d.rm, d.rm, th.ramp[5]);
    return;
  }
  if (style === "bars") {
    const BW = 3, GAP = 3, n = Math.floor(w / (BW + GAP)), grad = g.createLinearGradient(0, 4, 0, h - 4);
    grad.addColorStop(0, th.peak); grad.addColorStop(0.5, th.rms); grad.addColorStop(1, th.peak); g.fillStyle = grad;
    for (let i = 0; i < n; i++) {
      let m = 0; const x0 = Math.floor(i * d.mx.length / n), x1 = Math.max(x0 + 1, Math.floor((i + 1) * d.mx.length / n));
      for (let x = x0; x < x1; x++) m = Math.max(m, d.mx[x], d.mn[x]);
      // ช่วงที่เงียบเหลือจุดจาง ไม่ให้ดูเหมือนมีเสียง (ช่องที่เงียบทั้งเรื่องเคยเป็นจุดเข้มเท่าช่องที่มีเสียง เจอตอนตรวจภาพ)
      g.globalAlpha = m < 0.001 ? 0.3 : 1;
      const bh = Math.max(BW, m * (h - 8)); g.beginPath(); g.roundRect(i * (BW + GAP) + GAP / 2, mid - bh / 2, BW, bh, BW / 2); g.fill();
    }
    g.globalAlpha = 1;
    return;
  }
  g.fillStyle = "rgba(74,43,56,.07)"; g.fillRect(0, Math.round(mid), w, 1);
  const band = (top: Float32Array, bot: Float32Array, col: string) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, mid); for (let x = 0; x < w; x++) g.lineTo(x + 0.5, mid - Math.min(h / 2 - 1, top[x] * A)); for (let x = w - 1; x >= 0; x--) g.lineTo(x + 0.5, mid + Math.min(h / 2 - 1, bot[x] * A)); g.closePath(); g.fill(); };
  band(d.mx, d.mn, th.peak); band(d.rm, d.rm, th.rms);
}

/** ขีดของไม้บรรทัดความสูงคลื่น · ระยะขีดเลือกจาก 1 2 2.5 5 ให้ตัวเลขห่างกันอย่างน้อย 20 px · ขอบกรอบคือ 1 ÷ vz */
const AMP_STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5];
function ampTicks(h: number, vz: number) {
  const mid = h / 2, ppu = (h / 2 - 2) * vz, top = (h / 2 - 1) / ppu;
  const step = AMP_STEPS.find((s) => s * ppu >= 20) ?? 5;
  let d = 1; while (d < 4 && Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) > 1e-9) d++;
  const list = (st: number) => { const out: { v: number; y: number }[] = []; for (let k = -Math.floor(top / st + 1e-9); k * st <= top + 1e-9; k++) out.push({ v: k * st, y: mid - k * st * ppu }); return out; };
  return { major: list(step), minor: list(step / 2), d };
}
const RUL_W = 40;
/** ไม้บรรทัดแนวตั้งทางซ้ายของรูปคลื่นแบบ Audacity · ตัวเลขชิดขวา ขีดยาวที่ตัวเลข ขีดสั้นตรงกลาง */
function drawAmpRuler(g: CanvasRenderingContext2D, w: number, h: number, vz: number) {
  g.clearRect(0, 0, w, h);
  const { major, minor, d } = ampTicks(h, vz);
  g.fillStyle = "#e3bccb"; g.fillRect(w - 1, 0, 1, h);
  g.fillStyle = "#d9a9bb"; for (const t of minor) g.fillRect(w - 4, Math.round(t.y), 3, 1);
  g.font = "600 10.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  for (const t of major) {
    g.fillStyle = "#c48aa1"; g.fillRect(w - 7, Math.round(t.y), 6, 1);
    g.fillStyle = "#7a5666"; g.fillText(minus(t.v.toFixed(d)), w - 9, Math.max(6, Math.min(h - 6, t.y)));
  }
}

/** ภาพความถี่ cols × rows ลงขนาดกรอบ · getRow(row, col) คืนเลข 0–255 */
function drawMatrix(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cols: number, rows: number, colors: Uint8ClampedArray, get: (row: number, col: number) => number) {
  if (cols < 1 || rows < 1) return;
  const off = document.createElement("canvas"); off.width = cols; off.height = rows;
  const og = off.getContext("2d"); if (!og) return;
  const img = og.createImageData(cols, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = get(rows - 1 - r, c), o = (r * cols + c) * 4;
    img.data[o] = colors[v * 3]; img.data[o + 1] = colors[v * 3 + 1]; img.data[o + 2] = colors[v * 3 + 2]; img.data[o + 3] = 255;
  }
  og.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(off, x, y, w, h);
}

function axisY(g: CanvasRenderingContext2D, x0: number, w: number, h: number, pad: number, lo: number, hi: number, step: number, unit: string) {
  g.font = "11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  for (let v = hi; v >= lo; v -= step) { const y = pad + (hi - v) / (hi - lo) * (h - pad * 2); g.fillStyle = "#f3e2e9"; g.fillRect(x0, Math.round(y), w - x0, 1); g.fillStyle = "#a88595"; g.fillText(minus(String(v)) + (v === hi ? " " + unit : ""), x0 - 4, y); }
}

/* ---------- ชิ้นส่วน ---------- */
function Speakers({ names, th, levels, hidden, onToggle }: { names: string[]; th: Theme; levels: number[]; hidden: string[]; onToggle: (c: string) => void }) {
  const has = (c: string) => names.includes(c);
  const surround = names.length >= 5;
  const VH = surround ? 184 : names.length === 2 ? 124 : names.length === 1 ? 62 : 150;
  const pos = (c: string, i: number): [number, number] => {
    if (names.length === 2) return c === "FL" ? [52, 38] : [148, 38];
    if (names.length === 1) return [100, 31];
    const P: Record<string, [number, number]> = { FC: [100, 24], FL: [48, 38], FR: [152, 38], LFE: [100, 62], BL: [50, 160], BR: [150, 160], BC: [100, 166], FLC: [74, 30], FRC: [126, 30],
      SL: has("BL") ? [20, 110] : [28, 146], SR: has("BR") ? [180, 110] : [172, 146] };
    return P[c] ?? [20 + (i % 6) * 32, 120 + Math.floor(i / 6) * 30];
  };
  const hy = surround ? 108 : 84;
  return (
    <svg className="spk" width="200" height={VH} viewBox={`0 0 200 ${VH}`} role="img" aria-label={`แผนผังลำโพง ${names.length} ช่อง`}>
      {names.length > 1 && <><circle cx="100" cy={hy - 7} r="7" fill="#f1bfd1" /><path d={`M87 ${hy + 11} q13 -16 26 0 z`} fill="#f1bfd1" /><text x="100" y={hy + 26} textAnchor="middle" fontSize="10" fill="#b28a9a" fontFamily="Sarabun">ที่นั่งฟัง</text></>}
      {names.map((c, i) => {
        const [x, y] = pos(c, i), off = hidden.includes(c), a = off ? 0 : 0.25 + 0.75 * Math.min(1, (levels[i] ?? 0) * 3) /* ระหว่างอ่านยังไม่มีค่า ขึ้นจาง (ค่าว่างเคยทำให้ทึบทุกตัว) */, d = label(names, c).code;
        const toggle = () => onToggle(c);
        return (
          <g key={c} className="s" tabIndex={0} role="button" aria-label={(off ? "แสดง" : "ซ่อน") + "ช่อง " + d} onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
            <title>{(off ? "กดเพื่อแสดง" : "กดเพื่อซ่อน") + "ช่อง " + d}</title>
            {c === "LFE" ? <rect x={x - 15} y={y - 11} width="30" height="22" rx="6" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />
              : <circle cx={x} cy={y} r="15" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />}
            <text x={x} y={y + 4} textAnchor="middle" fontSize={d.length > 2 ? 9.5 : 11} fontWeight="700" fontFamily="Sarabun" fill={off ? "#b28a9a" : a > 0.55 ? "#fff" : "#4a2b38"}>{d}</text>
          </g>
        );
      })}
    </svg>
  );
}

type Mark = { from: number; to: number; text: string };

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
function Lane({ code, th: thai, peak, height, draw, deps, ruler }: { code: string; th: string; peak: string; height: number; draw: Draw; deps: unknown[]; ruler?: Draw }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return (
    <div className="lane" data-lane={code} style={ruler ? { gridTemplateColumns: `96px ${RUL_W}px 1fr` } : undefined}>
      <div className="lab"><b>{code}</b><span>{thai}</span><em>{peak}</em></div>
      {ruler && <RulerCv height={height} draw={ruler} deps={deps} />}
      <canvas className="cv" style={{ height }} ref={ref} />
    </div>
  );
}
function RulerCv({ height, draw, deps }: { height: number; draw: Draw; deps: unknown[] }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return <canvas className="vrul" style={{ height }} ref={ref} data-vrul />;
}

function Crosshair({ box, left, right, t0, t1, at, rows }: { box: HTMLDivElement | null; left: number; right: number; t0: number; t1: number; at: number; rows: { v: string; k: string; color?: string }[] }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipLeft, setTipLeft] = useState(0);
  const W = (box?.clientWidth ?? 0) - left - right, x = left + (at - t0) / (t1 - t0 || 1) * W;
  useLayoutEffect(() => { const tw = tipRef.current?.offsetWidth ?? 0; setTipLeft(x + 12 + tw > (box?.clientWidth ?? 0) ? x - 12 - tw : x + 12); });
  if (!box || W <= 0) return null;
  return (<>
    <div className="xh" style={{ left: x }} />
    <div className="tip" ref={tipRef} style={{ left: tipLeft }}>
      <div className="t">{tfmt(at)}</div>
      <div className="r">{rows.map((r) => <Fragment2 key={r.k} v={r.v} k={r.k} color={r.color} />)}</div>
    </div>
  </>);
}
function Fragment2({ v, k, color }: { v: string; k: string; color?: string }) {
  return <><b>{v}</b><span>{color && <i className="key" style={{ background: color }} />}{k}</span></>;
}

function Marks({ marks, t0, t1, left, right, inline }: { marks: Mark[]; t0: number; t1: number; left: number; right: number; inline?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => { const p = ref.current?.parentElement; if (p) setW(p.clientWidth); });
  const W = w - left - right;
  return <div ref={ref} style={{ display: "contents" }}>{W > 0 && marks.filter((m) => m.to > t0 && m.from < t1).map((m, i) => {
    const a = Math.max(0, (m.from - t0) / (t1 - t0) * W), b = Math.min(W, (m.to - t0) / (t1 - t0) * W);
    const near = left + a > w * 0.6;
    return (
      <div key={i} className="mark" data-mark style={{ left: left + a, width: Math.max(3, b - a), ...(inline ? { top: 8, bottom: 8 } : {}) }}>
        <span className="ml" style={inline ? (near ? { top: 0, left: "auto", right: "calc(100% + 6px)", transform: "none" } : { top: 0, left: "calc(100% + 6px)", transform: "none" }) : undefined}>{WARN}{m.text}</span>
      </div>
    );
  })}</div>;
}

/* ---------- หน้า ---------- */
/** ภาพรวมที่กำลังอ่าน · ออกจากหน้าแล้วกลับมา รอผลรอบเดิมต่อ ไม่สั่งอ่านซ้อน · อ่านได้ทีละไฟล์ ไฟล์ใหม่หยุดไฟล์เก่าเอง (audiograph.rs OVERVIEW_GEN) */
const inflight = new Map<string, Promise<GOverview | null>>();
function overviewOnce(path: string, track: number) {
  const k = path + "|" + track;
  let p = inflight.get(k);
  if (!p) { p = graphApi.overview(path, track).finally(() => inflight.delete(k)); inflight.set(k, p); }
  return p;
}

type WaveStyle = "fine" | "bars" | "aud";
/** laneK ตัวคูณความสูงแถบรูปคลื่นกับแถบความถี่ ที่ลากจากที่จับใต้กราฟ · จำไว้ เปิดครั้งหน้ายังสูงเท่าเดิม */
type Prefs = { view: View; theme: string; style: WaveStyle; cmap: "theme" | "rainbow"; scmap: "heat" | "rainbow" | "mono" | "theme"; laneK: number };
const PREF_KEY = "graph-prefs";
const LANE_K_MIN = 0.5, LANE_K_MAX = 4;
const laneKClamp = (k: number) => Math.round(Math.max(LANE_K_MIN, Math.min(LANE_K_MAX, k)) * 100) / 100;
function loadPrefs(): Prefs {
  const d: Prefs = { view: "wave", theme: "ชมพู", style: "fine", cmap: "theme", scmap: "heat", laneK: 1 };
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { ...d, ...p, theme: THEMES[p.theme] ? p.theme : d.theme, laneK: Number.isFinite(p.laneK) ? laneKClamp(p.laneK) : 1 }; } catch { return d; }
}

export default function GraphPage({ req, onConsumed }: { req: GraphReq | null; onConsumed: () => void }) {
  const { movies } = useLibrary();
  const toast = useToast();
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<GInfo | null>(null);
  const [track, setTrack] = useState(0);
  /** ภาพรวมพร้อมไฟล์และแทร็กที่อ่านมา · เปลี่ยนแทร็กแล้วหน้าจอวาดหนึ่งรอบก่อนล้างค่า ช่องของแทร็กใหม่ต้องไม่ไปหยิบข้อมูลแทร็กเก่า (เจอตอนเทส 7 พ.ย. 2569 หน้าว่างทั้งโปรแกรม) */
  const [ovRaw, setOvRaw] = useState<{ key: string; o: GOverview } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** กดอ่านใหม่ หรือกดกราฟเสียงเรื่องเดิมซ้ำตอนอ่านไม่สำเร็จ */
  const [nonce, setNonce] = useState(0);
  /** เปิดมาพร้อมเวลา (ปุ่มดูกราฟเสียงช่วงนี้) ไม่ต้องย้ายไปกลางเรื่องตอนภาพรวมเสร็จ */
  const jumped = useRef(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [zoom, setZoom] = useState<number | "all">("all");
  const [center, setCenter] = useState(0);
  const [tip, setTip] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [win, setWin] = useState<GWindow | null>(null);
  const [psd, setPsd] = useState<GPsd | null>(null);
  const [psdCh, setPsdCh] = useState("mix");
  const [psdLog, setPsdLog] = useState(true);
  const [psdSize, setPsdSize] = useState(4096);
  const [psdF, setPsdF] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [plotW, setPlotW] = useState(600);
  const plotRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<() => HTMLCanvasElement | null>(() => null);

  const setPref = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ก็ใช้ค่านี้ไปก่อน */ } return n; });
  const th = THEMES[prefs.theme];
  const movie: Movie | undefined = useMemo(() => movies.find((m) => m.path === path), [movies, path]);
  const t: GTrack | undefined = info?.tracks[track];
  const names = t?.names ?? [];
  const ov = ovRaw && ovRaw.key === `${path}|${track}` && ovRaw.o.env.length === names.length ? ovRaw.o : null;
  const dur = ov?.duration ?? info?.duration ?? 0;

  // เปิดจากที่อื่น (ชั้นวาง หน้าต่างผลตรวจ)
  useEffect(() => {
    if (!req) return;
    setPath(req.path);
    if (req.path === path && error) setNonce((n) => n + 1);
    if (req.t != null) { jumped.current = true; setCenter(req.t); setTip(req.t); setZoom(30); if (prefs.view !== "wave" && prefs.view !== "spec") setPref("view", "wave"); }
    onConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  // อ่านข้อมูลแทร็ก
  useEffect(() => {
    if (!path) return;
    let live = true;
    setInfo(null); setOvRaw(null); setWin(null); setPsd(null); setError(null); setHidden([]); setTrack(0);
    graphApi.info(path).then((g) => { if (live) setInfo(g); }, (e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [path, nonce]);

  // ภาพรวมทั้งเรื่อง
  useEffect(() => {
    if (!path || !info) return;
    let live = true;
    setOvRaw(null); setWin(null); setPsd(null); setProgress(0); setError(null);
    let off: (() => void) | undefined;
    if (inApp) listen<GProgress>("graph-progress", (e) => { if (live && e.payload.path === path && e.payload.track === track) setProgress(e.payload.percent); }).then((u) => { if (live) off = u; else u(); });
    overviewOnce(path, track).then((o) => {
      if (!live) return;
      setProgress(null);
      if (!o) { setError("หยุดอ่านเสียงแล้ว"); return; }
      setOvRaw({ key: `${path}|${track}`, o });
      if (jumped.current) jumped.current = false;
      else { setTip(Math.min(o.duration / 2, 60)); setCenter(o.duration / 2); }
    }, (e) => { if (live) { setProgress(null); setError(String(e)); } });
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, info, track]);

  // ความกว้างกรอบกราฟ ใช้ขอจำนวนคอลัมน์เท่าจุดภาพ
  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setPlotW(Math.max(200, el.clientWidth - 120))); ro.observe(el);
    return () => ro.disconnect();
  }, [ov]);

  const view = prefs.view;
  const span = zoom === "all" ? dur : Math.min(dur, zoom);
  const t0 = Math.max(0, Math.min(dur - span, center - span / 2)), t1 = t0 + span;
  /* ตัวซูม ตัวเลื่อน แบบหน้าดูคลื่นของ Audacity (พี่กัน *"พวกตัวซูม พวกตัวขยาย ตัวเลื่อนซ้ายขวา เอามาได้เลย"* · เอาแค่ส่วนดูกราฟ ไม่เอาส่วนปรับแต่ง)
     ซูมเข้าออกทีละสองเท่า ถึงครึ่งวินาที · ซูมจากล้อเมาส์ตรึงจุดที่ชี้ไว้ที่เดิม · เลื่อนไม่หลุดหัวท้ายเรื่อง */
  const [vz, setVz] = useState(1);
  // ขยายแนวตั้งใช้กับเส้นละเอียดและแบบ Audacity · แบบ Audacity มีไม้บรรทัดตัวเลขนอกกราฟ ขอบซ้ายของกราฟจึงขยับไปอีก RUL_W
  const VZ_W = view === "wave" && prefs.style !== "bars" ? 30 : 0;
  const LW = view === "wave" && prefs.style === "aud" ? 96 + RUL_W : 96;
  const zoomBy = (f: number, at?: number) => {
    if (!dur) return;
    let ns = span * f;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    ns = Math.max(0.5, ns);
    const anchor = at ?? (t0 + t1) / 2, rel = (anchor - t0) / (span || 1);
    const nt0 = Math.max(0, Math.min(dur - ns, anchor - rel * ns));
    setZoom(ns); setCenter(nt0 + ns / 2);
  };
  const panTo = (c: number) => setCenter(Math.max(span / 2, Math.min(dur - span / 2, c)));
  /** ตั้งความยาวช่วงที่ดูตรง ๆ จากแถบซูมแนวนอน · ซูมรอบกลางช่วงเดิม · ยาวเท่าเรื่องกลับเป็นทั้งเรื่อง */
  const setSpan = useCallback((ns: number) => {
    if (!dur) return;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    ns = Math.max(HZ_MIN, ns);
    setZoom(ns); setCenter((c) => { const mid = zoom === "all" ? dur / 2 : c; return Math.max(ns / 2, Math.min(dur - ns / 2, mid)); });
  }, [dur, zoom]);
  // Ctrl หมุนล้อ ซูมตรงที่ชี้ · Shift หมุนล้อ หรือเลื่อนแนวนอนของทัชแพด เลื่อนซ้ายขวา · หมุนล้อเฉย ๆ เลื่อนหน้าตามปกติ
  useEffect(() => {
    const el = boxEl; if (!el) return;
    const fn = (e: WheelEvent) => {
      const r = el.getBoundingClientRect(), W = r.width - LW, x = e.clientX - r.left - LW;
      if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.5 : 2, x >= 0 && x <= W ? t0 + x / W * (t1 - t0) : undefined); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); panTo((t0 + t1) / 2 + (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) / Math.max(1, W) * (t1 - t0)); }
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });

  // ช่วงที่ซูม อ่านเฉพาะช่วง (รอ 150 ms ก่อนขอ เลื่อนเร็ว ๆ ไม่ขอซ้ำ)
  useEffect(() => {
    if (!path || !ov || zoom === "all" || view === "loud" || view === "psd") return;
    let live = true;
    const log = view !== "spek";
    const id = setTimeout(() => {
      graphApi.window(path, track, t0, t1, Math.round(plotW), log ? 96 : 256, log).then((w) => { if (live && w) setWin(w); }, (e) => { if (live) toast({ kind: "bad", title: "อ่านช่วงที่ซูมไม่ได้", detail: String(e) }); });
    }, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ov, track, t0, t1, view, plotW]);

  // ความถี่เฉลี่ย
  const psdSeries = useMemo(() => {
    const base = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
    // ซ้อนทุกช่อง · เส้นละช่อง (รวมเสียงเบส) · แทร็กสองช่องเพิ่มเส้นกลางกับเส้นข้าง แบบ SpectrumAnalyzer
    if (psdCh === "all" && names.length > 1) return names.map((_, i) => [i]);
    if (psdCh === "lr" && names.includes("FR")) return [[names.indexOf("FL")], [names.indexOf("FR")]];
    if (psdCh !== "mix" && names.includes(psdCh)) return [[names.indexOf(psdCh)]];
    return [base.length ? base : [0]];
  }, [names, psdCh]);
  const psdMs = useMemo(() => (psdCh === "all" && names.length === 2 && names.includes("FL") && names.includes("FR") ? [names.indexOf("FL"), names.indexOf("FR")] : null), [names, psdCh]);
  useEffect(() => {
    if (!path || !ov || view !== "psd") return;
    let live = true;
    setPsd(null);
    const id = setTimeout(() => {
      graphApi.psd(path, track, t0, t1, psdSeries, psdSize, psdMs).then((p) => { if (live && p) setPsd(p); }, (e) => { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); });
    }, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ov, track, t0, t1, view, psdSeries, psdMs, psdSize]);

  // ลากไฟล์มาวาง
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-graph]")) setPath(e.payload.paths[0]);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  const ovSrc: Src | null = ov ? { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration } : null;
  const winOk = win && zoom !== "all" && win.env.length === names.length && Math.abs(win.t0 - t0) < 0.01 && Math.abs(win.t1 - t1) < 0.01;
  const src: Src | null = winOk && win ? { env: win.env, cols: win.cols, t0: win.t0, t1: win.t1 } : ovSrc;
  const vis = names.filter((c) => !hidden.includes(c));
  const levels = useMemo(() => (ov ? ov.rms.map((d) => Math.pow(10, d / 20)) : []), [ov]);
  const marks: Mark[] = useMemo(() => {
    const m: Mark[] = (movie?.check?.spans ?? []).map((s) => ({ from: s.from, to: Math.max(s.to, s.from + 0.5), text: s.what + " · ผลตรวจ" }));
    for (const [a, b] of ov?.silences ?? []) if (!m.some((x) => Math.abs(x.from - a) < 1.5)) m.push({ from: a, to: b, text: `เงียบทุกช่อง ${(b - a).toFixed(1)} วินาที` });
    return m;
  }, [movie, ov]);
  // จุดเดิมหลุดช่วงที่ดู (ซูมหรือเลื่อนไปที่อื่น) ใช้กลางช่วงที่ดู ปุ่มเปิดเล่นที่จะไม่บอกเวลาที่มองไม่เห็น (เจอตอนตรวจภาพ)
  const at = hover ?? (tip >= t0 && tip <= t1 ? tip : (t0 + t1) / 2);

  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  const openOther = async () => { const f = await pickFile("media"); if (f) setPath(f); };
  const play = async () => {
    if (!path) return;
    try {
      const r = await checkApi.playAt(path, at);
      if (r.seeked) toast({ kind: "ok", title: `เปิดด้วย ${r.player} ที่ ${tfmt(at)}` });
      else toast({ kind: "warn", title: r.player ? `เปิดด้วย ${r.player} แล้ว แต่เปิดตรงนาทีไม่ได้` : "เปิดด้วยโปรแกรมหลักของ Windows แล้ว แต่เปิดตรงนาทีไม่ได้", detail: `เลื่อนไปที่ ${tfmt(at)} เอง · ตั้งโปรแกรมเล่นได้ที่หน้าตั้งค่า` });
    } catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };
  const fileName = path ? path.split(/[\\/]/).pop() ?? path : "";
  const saveImage = async () => {
    const cv = exportRef.current(); if (!cv || !path) return;
    const name = fileName.replace(/\.[^.]+$/, "") + " กราฟเสียง.png";
    const where = await pickSave(name, "png", "รูป PNG"); if (!where) return;
    try { const saved = await graphApi.save(where, cv.toDataURL("image/png"), null); toast({ kind: "ok", title: "บันทึกรูปแล้ว", detail: saved }); }
    catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: String(e) }); }
  };

  /* ---------- ยังไม่เลือกไฟล์ ---------- */
  if (!path) {
    const recent = movies.filter((m) => !m.missing && m.audio.length).slice(0, 6);
    return (
      <div className="ag" data-graph>
        <div className="drop" style={{ minHeight: 180 }} data-graphdrop>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openOther}>เลือกไฟล์จากเครื่อง</button>
          <span className="small">รับไฟล์หนังทุกชนิดในชั้นวาง และไฟล์เสียง {AUDIO_EXT.map((e) => e.toUpperCase()).join(" · ")}</span>
        </div>
        {recent.length > 0 && <><div className="small">หรือเลือกจากชั้นวาง</div>
          <div className="graph-recent">{recent.map((m) => (
            <button key={m.id} type="button" className="dd" onClick={() => setPath(m.path)} data-graphpick={m.name}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>{m.thumb ? <img src={thumbUrl(m.thumb) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i style={{ width: 18, height: 27, borderRadius: 3, background: "#f6d6e2" }} />}{m.name}</span>
              <span className="small">{[...new Set(m.audio.map((a) => a.layout))].join(" · ")}</span>
            </button>))}</div></>}
      </div>
    );
  }

  /* ---------- หัวหน้า แทร็ก ปุ่มแบบ ---------- */
  const thumb = info?.audioOnly
    ? <div className="fnote" style={{ background: th.lane, color: th.rms, border: `1px solid ${th.peak}` }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
    : movie?.thumb ? <img className="fthumb" src={thumbUrl(movie.thumb) ?? ""} alt="" /> : <div className="fthumb" style={{ background: "linear-gradient(160deg,#f2b8c6,#c25d7f)" }} />;
  const head = (
    <div className="agtop">
      <div className="fchip">{thumb}<div style={{ minWidth: 0 }}>
        <div className="nm">{fileName.replace(/\.[^.]+$/, "")}<span className="ext">{fileName.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
        <div className="meta">{info ? `${info.audioOnly ? "ไฟล์เสียง · " : ""}${fmtSize(info.size)} · ยาว ${tfmt(info.duration)}${info.audioOnly && !movie ? " · ไม่ได้อยู่บนชั้นวาง" : ""}` : error ? "อ่านข้อมูลเสียงไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
      </div></div>
      {info && info.tracks.length > 1 && (
        <span data-graphtrack><Dropdown label="แทร็กเสียง" value={String(track)} onChange={(v) => setTrack(Number(v))}
          options={info.tracks.map((x) => ({ value: String(x.index), label: `เสียง ${x.index + 1} · ${x.lang ?? "ไม่ระบุภาษา"} · ${x.codec} · ${x.layout}` }))} /></span>
      )}
      <button type="button" className="btn btn-ghost" onClick={openOther}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>เปิดไฟล์อื่น</button>
    </div>
  );
  const seg = <T extends string | number>(opts: [T, string][], cur: T, set: (v: T) => void, attr: string) => (
    <div className="seg sm">{opts.map(([k, l]) => <button key={String(k)} type="button" className={cur === k ? "on" : ""} onClick={() => set(k)} {...{ [attr]: String(k) }}>{l}</button>)}</div>
  );
  const zoomBox = (opts: [number | "all", string][], lbl: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {lbl === "ซูม" && <span className="zbtns">
        <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก · Ctrl หมุนล้อเมาส์ลง" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={dur} span={span} onSpan={setSpan} />
        <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={span <= 0.5} aria-label="ซูมเข้า" title="ซูมเข้า · Ctrl หมุนล้อเมาส์ขึ้น" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
      </span>}
      <span className="lbl">{lbl}</span>
      {seg(opts.map(([k, l]) => [String(k), l] as [string, string]), String(zoom), (v) => { setZoom(v === "all" ? "all" : Number(v)); setWin(null); }, "data-zoom")}</span>
  );
  /** แถบเลื่อนซ้ายขวาใต้กราฟ แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด */
  const scroller = (left: number, right: number) => (
    <TimeScroll dur={dur} t0={t0} t1={t1} left={left} right={right} onPan={panTo} />
  );
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{VIEWS.map(([k, l]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setPref("view", k)} data-view={k}
        disabled={k === "cmp" && !names.includes("FL")} title={k === "cmp" && !names.includes("FL") ? "ซ้อนเทียบใช้กับแทร็กที่มีช่องซ้ายขวา" : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      {view === "wave" && seg<WaveStyle>([["fine", "เส้นละเอียด"], ["bars", "แท่ง"], ["aud", "แบบ Audacity"]], prefs.style, (v) => setPref("style", v), "data-style")}
      {view === "spec" && seg<"theme" | "rainbow">([["theme", "สีตามชุด"], ["rainbow", "สีรุ้ง"]], prefs.cmap, (v) => setPref("cmap", v), "data-cmap")}
      <span className="lbl" style={{ marginLeft: "auto" }}>ชุดสี</span>
      <div className="sws">{THEME_ORDER.map((n) => <button key={n} type="button" className={"sw" + (prefs.theme === n ? " on" : "")} aria-label={"ชุดสี" + n} title={"ชุดสี" + n} onClick={() => setPref("theme", n)} data-theme={n}
        style={{ background: `linear-gradient(135deg,${THEMES[n].ramp[2]},${THEMES[n].ramp[5]} 60%,${THEMES[n].ramp[7]})` }} />)}</div>
      {/* ชื่อชุดสีที่เคยเขียนต่อท้ายเอาออก ปุ่ม แบบ Audacity เพิ่มเข้ามาแล้วชื่อตกบรรทัดสองตัวเดียว · ชุดที่เลือกมีวงกรอบ ชี้แล้วขึ้นชื่อ */}
    </div>
  );

  /* ---------- แผงซ้าย ---------- */
  const infoRows: [string, string][] = t ? [
    ["รหัสเสียง", t.codec], ["ช่องเสียง", `${t.layout} · ${names.length} ${names.length === 1 ? "channel" : "channels"}`], ["อัตราสุ่ม", `${(t.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz`],
    ...(t.bits ? [["ความละเอียด", `${t.bits}-bit`] as [string, string]] : []), ...(t.bitrate ? [["บิตเรต", `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s`] as [string, string]] : []),
    ...(t.lang ? [["ภาษา", t.lang] as [string, string]] : []),
  ] : [];
  const firstMark = marks[0];
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {t?.layout ?? ""}</span><span className="small" style={{ color: "var(--txt3)" }}>{hidden.length ? `แสดง ${vis.length} จาก ${names.length} ช่อง` : `${names.length} ช่อง`}</span></h3>
        {names.length > 0 && <Speakers names={names} th={th} levels={levels} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{names.length > 1 ? "กดลำโพงเพื่อซ่อนหรือแสดงช่องนั้น" : "ไฟล์นี้มีเสียงช่องเดียว"}</div></div>
      {t && <div className="card"><h3>ข้อมูลเสียง</h3><dl className="kv" data-graphinfo>{infoRows.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl></div>}
      {firstMark && <div className="stat warn">{WARN}<div><b>{movie?.check?.spans?.length ? "ผลตรวจล่าสุด" : "ช่วงเงียบผิดปกติ"}</b><span className="nw">{firstMark.text.replace(" · ผลตรวจ", "")}</span> <span className="nw">ที่ {tfmt(firstMark.from)}</span>
        <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCenter(firstMark.from + 1); setTip(firstMark.from); setZoom(30); if (view !== "wave" && view !== "spec") setPref("view", "wave"); }} data-goto>ซูมไปที่ {tfmt(firstMark.from)}</button></div></div></div>}
    </div>
  );

  /* ---------- กำลังอ่าน · อ่านไม่ได้ ---------- */
  if (error && !ov) {
    const stopped = error === "หยุดอ่านเสียงแล้ว";
    return (
      <div className="ag" data-graph>{head}
        <div className={"stat " + (stopped ? "info" : "bad")} data-grapherror>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          <div><b>{error}</b>{stopped ? "ยังไม่ได้วาดกราฟ · กดอ่านใหม่เพื่อเริ่มอีกครั้ง" : error.includes("ไม่มีแทร็กเสียง") ? "วิดีโออัดหน้าจอบางแบบไม่ได้อัดเสียงไว้" : "ลองเปิดไฟล์อื่น หรือตรวจไฟล์นี้ที่หน้าตรวจไฟล์"}
            {!error.includes("ไม่มีแทร็กเสียง") && <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)} data-graphretry>อ่านใหม่</button></div>}</div>
        </div>
      </div>
    );
  }
  if (!ov || !src) {
    return (
      <div className="ag" data-graph>{head}{ctl}
        <div className="agb">{panel}
          <div className="plot" data-graphloading>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13.5 }}>อ่านเสียง {names.length || ""} ช่อง <b>{Math.round(progress ?? 0)}%</b>{progress != null && progress > 3 && info ? "" : ""}</div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => graphApi.cancel()}>หยุด</button>
            </div>
            <div className="bar"><i style={{ width: `${progress ?? 0}%` }} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
              {(names.length ? names : ["", "", ""]).map((_, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, alignItems: "center" }}><div className="skel" style={{ height: 12 }} /><div className="skel" style={{ height: 40 }} /></div>)}
            </div>
            <div className="small" style={{ marginTop: 8 }}>อ่านเฉพาะเสียง ไม่ถอดภาพ · อ่านครั้งเดียว เปิดซ้ำขึ้นทันที · ไฟล์ไม่ถูกแก้</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- กราฟ ---------- */
  const peakTxt = (c: string) => { const i = names.indexOf(c); return ov.peaks[i] == null ? "" : ov.peaks[i] <= -119 ? "เงียบทั้งเรื่อง" : "ยอด " + pkTxt(ov.peaks[i]); };
  const rulerTicks = (a: number, b: number) => { const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]; const st = steps.find((s) => (b - a) / s <= 9) ?? 7200; const out: number[] = []; for (let x = Math.ceil(a / st) * st; x <= b; x += st) out.push(x); return out; };
  const Ruler = ({ left, right }: { left: number; right: number }) => (
    <div className="ruler" style={{ marginLeft: left, marginRight: right }}>{rulerTicks(t0, t1).map((x) => { const p = (x - t0) / (t1 - t0 || 1) * 100; return p < 2 || p > 98 ? null : <span key={x} style={{ left: p + "%" }}>{tfmt(x)}</span>; })}</div>
  );
  const onMove = (left: number, right: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), W = r.width - left - right, x = e.clientX - r.left - left;
    if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0));
  };
  const valueAt = (ch: number, time: number) => {
    const s = src, e = s.env[ch], c = Math.max(0, Math.min(s.cols - 1, Math.floor((time - s.t0) / (s.t1 - s.t0 || 1) * s.cols)));
    return e[c * 3 + 2];
  };

  let plot: React.ReactNode = null;
  const lanesView = view === "wave" || view === "spec";
  if (lanesView) {
    // แถบสูงขึ้นจากเดิม (พี่กัน 7 พ.ย. 2569 *"ใ้ห้ระบบมันขยายกราฟลงมาได้มากกว่านี้ ตอนนี้มันเเค่สองเเถบที่โคตรจะชิดกัน"*) · ลากที่จับใต้กราฟขยายต่อได้ถึง 4 เท่า
    const baseH = vis.length > 6 ? 52 : vis.length > 2 ? 72 : 120;
    const laneH = Math.round(Math.max(30, baseH * prefs.laneK));
    const colors = lut(prefs.cmap === "rainbow" ? RAINBOW : th.ramp);
    plot = (
      <div className="plot" data-plot ref={plotRef}>
        <div className="plothead"><span><b>{view === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox(ZOOMS, "ซูม")}</div>
        <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={(x) => { setCenter(x); setTip(x); if (zoom === "all") setZoom(240); }} left={LW} right={VZ_W} />
        <Ruler left={LW} right={VZ_W} />
        <div className="lanewrap" style={{ marginTop: marks.some((m) => m.to > t0 && m.from < t1) ? 28 : 6 }}>
        <div className="lanes" ref={setBoxEl} style={{ marginTop: 0 }} onPointerMove={onMove(LW, 0)} onPointerLeave={() => setHover(null)} data-lanes>
          {vis.map((c) => {
            const i = names.indexOf(c), l = label(names, c);
            return view === "wave"
              ? <Lane key={c + view} code={l.code} th={l.th} peak={peakTxt(c)} height={prefs.style === "aud" ? Math.max(laneH, 60) : laneH} deps={[src, t0, t1, th, prefs.style, i, vz, laneH]}
                  draw={(g, w, h) => drawWave(g, w, h, sample(src, i, t0, t1, w), th, prefs.style, prefs.style === "bars" ? 1 : vz)}
                  ruler={prefs.style === "aud" ? (g, w, h) => drawAmpRuler(g, w, h, vz) : undefined} />
              : <Lane key={c + view} code={l.code} th={l.th} peak={peakTxt(c)} height={laneH} deps={[src, win, winOk, t0, t1, prefs.cmap, th, i, laneH]}
                  draw={(g, w, h) => drawSpecLane(g, w, h, i, winOk ? win : null, ov, t0, t1, t?.rate ?? 48000, colors)} />;
          })}
          <Marks marks={marks} t0={t0} t1={t1} left={LW} right={0} />
          {/* เส้นตั้งกับกล่องบอกค่าขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน 7 พ.ย. 2569 *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) */}
          {hover != null && <Crosshair box={boxEl} left={LW} right={0} t0={t0} t1={t1} at={at} rows={vis.map((c) => ({ v: dbTxt(valueAt(names.indexOf(c), at)) + " dB", k: `${label(names, c).code} ${label(names, c).th}` }))} />}
        </div>
        {VZ_W > 0 && <VZoom value={vz} onChange={setVz} />}
        </div>
        <LaneGrip k={prefs.laneK} total={vis.length * baseH} left={LW} right={VZ_W} onChange={(k) => setPref("laneK", k)} />
        {scroller(LW, VZ_W)}
        <div className="agfoot">
          {view === "wave"
            ? <div className="lg">{prefs.style === "bars" ? <span><svg width="22" height="14" viewBox="0 0 22 14" style={{ verticalAlign: -2, marginRight: 5 }} aria-hidden="true"><rect width="22" height="14" rx="3" fill={th.lane} stroke={th.peak} /><rect x="4" y="5" width="2" height="4" rx="1" fill={th.rms} /><rect x="8" y="2" width="2" height="10" rx="1" fill={th.rms} /><rect x="12" y="4" width="2" height="6" rx="1" fill={th.rms} /><rect x="16" y="3" width="2" height="8" rx="1" fill={th.rms} /></svg>ความสูงแท่ง คือยอดเสียงช่วงนั้น</span> : prefs.style === "aud" ? <><span><i style={{ background: th.rms }} />ยอดเสียง</span><span><i style={{ background: th.ramp[5] }} />ความดังเฉลี่ย</span><span className="small">ตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล</span></> : <><span><i style={{ background: th.peak }} />ยอดเสียง</span><span><i style={{ background: th.rms }} />ความดังเฉลี่ย</span></>}{marks.length > 0 && <span style={{ color: "#b03535" }}><i style={{ background: "rgba(208,59,59,.25)", border: "1px solid rgba(208,59,59,.75)" }} />จุดเสีย</span>}</div>
            : <div className="speclegend"><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${(prefs.cmap === "rainbow" ? RAINBOW : th.ramp).join(",")})` }} /><span className="nw">0 dB</span><span style={{ marginLeft: 10 }}>แกนตั้ง 20 Hz ล่าง ถึง {Math.round((t?.rate ?? 48000) / 2000)} kHz บน</span></div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* ขยายแนวตั้งอยู่แถวล่าง (เดิมอยู่แถวปุ่มบน ชุดสีตกบรรทัดที่สอง เจอตอนตรวจภาพ) */}
            {VZ_W > 0 && <><span className="lbl">ขยายแนวตั้ง</span>{seg<number>([[1, "1×"], [2, "2×"], [4, "4×"]], vz, setVz, "data-vz")}<span className="vzval" data-vzval title="ลากแถบแนวตั้งขวามือรูปคลื่น ขึ้นยืด ลงบีบ">{vzTxt(vz)}</span></>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={play} data-graphplay>เปิดเล่นที่ {tfmt(at)}</button><button type="button" className="btn btn-ghost btn-sm" onClick={saveImage}>บันทึกเป็นรูป</button></div>
        </div>
      </div>
    );
    exportRef.current = () => composeLanes(boxEl);
  } else if (view === "loud") {
    plot = <LoudView ov={ov} th={th} t0={t0} t1={t1} names={names} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} showTable={showTable} setShowTable={setShowTable} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "cmp") {
    const cc = ["FL", "FR", "FC"].filter((c) => names.includes(c));
    plot = <CmpView src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "spek") {
    plot = <SpekView ov={ov} win={winOk ? win : null} track={t} fileName={fileName} names={names} t0={t0} t1={t1} zoomBox={zoomBox(ZOOMS, "ซูม")} scmap={prefs.scmap} setScmap={(v) => setPref("scmap", v)} th={th} audioOnly={!!info?.audioOnly} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} at={at} />;
  } else {
    plot = <PsdView psd={psd && psd.db.length === psdSeries.length + (psdMs ? 2 : 0) ? psd : null} names={names} psdCh={psdCh} setPsdCh={setPsdCh} psdLog={psdLog} setPsdLog={setPsdLog} psdSize={psdSize} setPsdSize={setPsdSize} th={th} ov={ov} t0={t0} t1={t1}
      zoomBox={zoomBox(PSD_SPANS, "ช่วงที่เลือก")} onPick={(x) => { setCenter(x); if (zoom === "all") setZoom(30); }} f={psdF} setF={setPsdF} fileName={fileName} save={saveImage} exportRef={exportRef} plotRef={plotRef} toast={toast} />;
  }

  return (
    <div className="ag" data-graph data-graphview={view}>
      {head}{ctl}
      <div className="agb">{panel}{plot}</div>
    </div>
  );
}

/** กรอบกันพัง · หน้ากราฟวาดพังกับไฟล์แปลก ๆ ขึ้นข้อความในหน้านี้ เมนูกับหน้าอื่นยังใช้ได้ ไม่ว่างทั้งโปรแกรม */
export class GraphBoundary extends Component<{ children: React.ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String(e) }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="ag" data-graph>
        <div className="stat bad" data-graphcrash>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          <div><b>หน้ากราฟเสียงวาดกราฟของไฟล์นี้ไม่ได้</b>{this.state.err} · ไฟล์ไม่ถูกแก้
            <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => this.setState({ err: null })}>เปิดหน้ากราฟใหม่</button></div></div>
        </div>
      </div>
    );
  }
}

function FragmentKV({ k, v }: { k: string; v: string }) { return <><dt>{k}</dt><dd>{v}</dd></>; }

/** แถบทั้งเรื่อง · กดเพื่อกระโดด */
function Overview({ ov, th, t0, t1, onPick, left, right = 0 }: { ov: GOverview; th: Theme; t0: number; t1: number; onPick: (t: number) => void; left: number; right?: number }) {
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = th.lane; g.fillRect(0, 0, w, h);
    const all: Src = { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration };
    const ds = ov.env.map((_, i) => sample(all, i, 0, ov.duration, w)), mid = h / 2;
    for (const [col, key] of [[th.peak, "mx"], [th.rms, "rm"]] as const) {
      g.fillStyle = col;
      for (let x = 0; x < w; x++) { let m = 0; for (const d of ds) m = Math.max(m, d[key][x]); g.fillRect(x, mid - m * (mid - 2), 1, m * (mid - 2) * 2); }
    }
    if (t1 - t0 < ov.duration * 0.999) {
      const a = t0 / ov.duration * w, b = t1 / ov.duration * w; g.fillStyle = "rgba(255,250,252,.72)"; g.fillRect(0, 0, a, h); g.fillRect(b, 0, w - b, h);
      g.strokeStyle = "#d9719a"; g.lineWidth = 2; g.strokeRect(a + 1, 1, Math.max(4, b - a - 2), h - 2);
    }
  }, [ov, th, t0, t1]);
  return (<>
    <div className="ovw" style={{ marginLeft: left, marginRight: right }} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPick((e.clientX - r.left) / r.width * ov.duration); }} title="กดเพื่อไปช่วงนั้น" data-ovw><canvas ref={ref} /></div>
    <div className="ovrul" style={{ marginLeft: left, marginRight: right }}><span>0:00</span><span style={{ left: "50%" }}>ทั้งเรื่อง {tfmt(ov.duration)}{ov.readTo < ov.duration - 1 ? ` · อ่านได้ถึง ${tfmt(ov.readTo)}` : ""}</span><span style={{ left: "100%" }}>{tfmt(ov.duration)}</span></div>
  </>);
}

/** ที่จับใต้แถบกราฟ ลากลงให้แถบสูงขึ้น ลากขึ้นให้เตี้ยลง แบบลากขอบล่างแทร็กของ Audacity · total คือความสูงรวมตอนตัวคูณ 1
   ลูกศรขึ้นลงทีละ 10% · ดับเบิลคลิกกลับขนาดเดิม */
function LaneGrip({ k, total, left, right, onChange }: { k: number; total: number; left: number; right: number; onChange: (k: number) => void }) {
  const drag = useRef<{ y: number; k: number } | null>(null);
  return (
    <div className="lanegrip" style={{ marginLeft: left, marginRight: right }} role="separator" aria-orientation="horizontal" aria-label="ความสูงกราฟ"
      aria-valuemin={LANE_K_MIN * 100} aria-valuemax={LANE_K_MAX * 100} aria-valuenow={Math.round(k * 100)} aria-valuetext={`${Math.round(k * 100)}%`} tabIndex={0}
      title="ลากลงขยายความสูงกราฟ ลากขึ้นลดลง · ดับเบิลคลิกกลับขนาดเดิม" data-lanegrip
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, k }; }}
      onPointerMove={(e) => { if (drag.current) onChange(laneKClamp(drag.current.k + (e.clientY - drag.current.y) / Math.max(1, total))); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={() => onChange(1)}
      onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); onChange(laneKClamp(k + 0.1)); } if (e.key === "ArrowUp") { e.preventDefault(); onChange(laneKClamp(k - 0.1)); } }}>
      <i />
    </div>
  );
}

/** แถบเลื่อนซูมเวลาแนวนอน อยู่ระหว่างปุ่มแว่นขยายซูมออกกับซูมเข้า (พี่กัน 7 พ.ย. 2569 *"เรามีย่อขยายเเนวตั้งเเล้ว ยังเหลือย่อขยายเเนวนอนนะ"* · *"เอาตอนนี้เลย"*)
   ซ้ายสุดเห็นทั้งเรื่อง ขวาสุดครึ่งวินาที สเกลล็อก · ซูมรอบกลางช่วงที่ดูอยู่ · กดที่แถบกระโดด · หมุนล้อเมาส์บนแถบ · ลูกศรซ้ายขวา · Home ทั้งเรื่อง End ครึ่งวินาที */
const HZ_MIN = 0.5;
function HZoom({ dur, span, onSpan }: { dur: number; span: number; onSpan: (s: number) => void }) {
  const root = useRef<HTMLSpanElement>(null), track = useRef<HTMLSpanElement>(null), drag = useRef(false);
  const ok = dur > HZ_MIN * 1.01, L = Math.log(Math.max(dur, HZ_MIN * 1.01) / HZ_MIN);
  const pos = ok ? Math.max(0, Math.min(1, Math.log(dur / Math.max(HZ_MIN, Math.min(dur, span))) / L)) : 0;
  const fromX = (x: number) => { const r = track.current!.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); return dur * Math.exp(-p * L); };
  const cur = useRef(span); cur.current = span;
  useEffect(() => {
    const el = root.current; if (!el || !ok) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); onSpan(cur.current * (e.deltaY < 0 ? 0.8 : 1.25)); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onSpan, ok]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowRight: 0.8, ArrowUp: 0.8, ArrowLeft: 1.25, ArrowDown: 1.25, PageUp: 0.5, PageDown: 2 };
    if (m[e.key]) { e.preventDefault(); onSpan(span * m[e.key]); }
    else if (e.key === "Home") { e.preventDefault(); onSpan(dur); }
    else if (e.key === "End") { e.preventDefault(); onSpan(HZ_MIN); }
  };
  return (
    <span className={"hzoom" + (ok ? "" : " off")} ref={root} data-hzoom>
      <span className="track" ref={track}
        onPointerDown={(e) => { if (!ok) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onSpan(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current) onSpan(fromX(e.clientX)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <span className="fill" style={{ width: pos * 100 + "%" }} />
        <span className="knob" role="slider" aria-orientation="horizontal" aria-label="ซูมเวลา" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)}
          aria-valuetext={`ช่วงที่ดู ${tfmt(Math.min(dur, span))}`} tabIndex={ok ? 0 : -1} title={`ช่วงที่ดู ${tfmt(Math.min(dur, span))} · ลากขวาซูมเข้า ลากซ้ายซูมออก`}
          style={{ left: pos * 100 + "%" }} onKeyDown={key} data-hzknob />
      </span>
    </span>
  );
}

const VZ_MIN = 0.25, VZ_MAX = 8;
/** ค่าขยายแนวตั้งในช่วงที่รับ · ใกล้ 1 2 4 เท่า (ไม่เกิน 4%) ดูดเข้าหา ปุ่ม 1× 2× 4× จะติดตาม */
const vzClamp = (v: number) => { const c = Math.max(VZ_MIN, Math.min(VZ_MAX, v)); return [1, 2, 4].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
const vzTxt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + "×";

/** แถบเลื่อนแนวตั้งขวามือรูปคลื่น บีบหรือยืดคลื่น (พี่กัน 7 พ.ย. 2569 *"ขอเส้นเเนวตั้ง ที่เอาไว้เลื่อนบีบเส้นกราฟด้วย เพราะตามรูป ตัวกราฟมันเกินกรอบไป"*)
   ลากขึ้นยืด ลากลงบีบ · สเกลล็อก 0.25 ถึง 8 เท่า · ขีดขวางคือ 1 เท่า ยอดเต็มสเกลชนขอบกรอบพอดี ต่ำกว่านั้นคลื่นไม่ล้นกรอบ
   กดที่แถบกระโดดไปจุดนั้น · หมุนล้อเมาส์บนแถบ · ลูกศรขึ้นลง · PageUp PageDown ทีละสองเท่า · ดับเบิลคลิกกลับ 1 เท่า */
function VZoom({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false);
  const L = Math.log(VZ_MAX / VZ_MIN), pos = (v: number) => Math.log(v / VZ_MIN) / L * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); const p = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height)); return vzClamp(VZ_MIN * Math.exp(p * L)); };
  const cur = useRef(value); cur.current = value;
  useEffect(() => {
    const el = root.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); onChange(vzClamp(cur.current * (e.deltaY < 0 ? 1.25 : 0.8))); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onChange]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowUp: 1.25, ArrowRight: 1.25, ArrowDown: 0.8, ArrowLeft: 0.8, PageUp: 2, PageDown: 0.5 };
    if (m[e.key]) { e.preventDefault(); onChange(vzClamp(value * m[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(VZ_MIN); }
    else if (e.key === "End") { e.preventDefault(); onChange(VZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom" ref={root} data-vzoom>
      <span className="ic" title="ลากขึ้น ยืดคลื่น">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <i className="fit" style={{ bottom: pos(1) + "%" }} title="1 เท่า ยอดเต็มสเกลชนขอบพอดี" />
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ขยายแนวตั้ง" aria-valuemin={VZ_MIN} aria-valuemax={VZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ขยายแนวตั้ง ${vzTxt(value)} · ลากขึ้นยืด ลากลงบีบ · ดับเบิลคลิกกลับ 1×`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-vzknob />
      </div>
      <span className="ic" title="ลากลง บีบคลื่น">{ic("M4 12h16M12 3v5M9 5.5l3 3 3-3M12 21v-5M9 18.5l3-3 3 3")}</span>
    </div>
  );
}

/** แถบเลื่อนซ้ายขวา แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด · ลูกศรซ้ายขวาเลื่อนทีละหนึ่งในสิบ */
function TimeScroll({ dur, t0, t1, left, right, onPan }: { dur: number; t0: number; t1: number; left: number; right: number; onPan: (center: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; c: number } | null>(null);
  const all = !dur || t1 - t0 >= dur * 0.999, span = t1 - t0, mid = (t0 + t1) / 2;
  const toTime = (dx: number) => dx / Math.max(1, ref.current?.clientWidth ?? 1) * dur;
  return (
    <div className="tscroll" ref={ref} style={{ marginLeft: left, marginRight: right }} data-tscroll
      onPointerDown={(e) => { if (all || (e.target as HTMLElement).dataset.thumb) return; const r = e.currentTarget.getBoundingClientRect(); onPan((e.clientX - r.left) / r.width * dur); }}>
      <div className={"thumb" + (all ? " all" : "")} data-thumb="1" style={{ left: (dur ? t0 / dur * 100 : 0) + "%", width: Math.max(dur ? span / dur * 100 : 100, 2) + "%" }}
        role="scrollbar" aria-orientation="horizontal" aria-label="เลื่อนช่วงที่ดู" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t0)} tabIndex={all ? -1 : 0}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); onPan(mid - span / 10); } if (e.key === "ArrowRight") { e.preventDefault(); onPan(mid + span / 10); } }}
        onPointerDown={(e) => { if (all) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, c: mid }; }}
        onPointerMove={(e) => { if (drag.current) onPan(drag.current.c + toTime(e.clientX - drag.current.x)); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    </div>
  );
}

/** ความถี่ของช่องหนึ่งในแถบ · แกนตั้งแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่ม */
function drawSpecLane(g: CanvasRenderingContext2D, w: number, h: number, ch: number, win: GWindow | null, ov: GOverview, t0: number, t1: number, rate: number, colors: Uint8ClampedArray) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  if (win) {
    const d = dec(win.spec[ch]); const cols = Math.round(d.length / win.bins);
    drawMatrix(g, 0, 0, w, h, cols, win.bins, colors, (row, col) => d[col * win.bins + row]);
    return;
  }
  // ระหว่างรอช่วงที่ซูม ใช้ความถี่ของภาพรวม (เส้นตรง) แปลงเป็นแกนล็อก
  const d = dec(ov.spec[ch]), B = ov.specBins, nyq = rate / 2, rows = 96;
  const c0 = Math.floor(t0 / ov.duration * ov.specCols), c1 = Math.max(c0 + 1, Math.ceil(t1 / ov.duration * ov.specCols));
  const binOf = (row: number) => Math.min(B - 1, Math.floor(20 * Math.pow(nyq / 20, (row + 0.5) / rows) / nyq * B));
  drawMatrix(g, 0, 0, w, h, c1 - c0, rows, colors, (row, col) => d[(c0 + col) * B + binOf(row)]);
}

/** รูปกราฟทุกแถบรวมเป็นรูปเดียว ไว้บันทึก */
function composeLanes(box: HTMLDivElement | null): HTMLCanvasElement | null {
  if (!box) return null;
  const lanes = [...box.querySelectorAll<HTMLDivElement>("[data-lane]")];
  if (!lanes.length) return null;
  const r = window.devicePixelRatio || 1, W = box.clientWidth, H = lanes.reduce((s, l) => s + l.clientHeight + 6, 8);
  const out = document.createElement("canvas"); out.width = W * r; out.height = H * r;
  const g = out.getContext("2d"); if (!g) return null;
  g.scale(r, r); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  let y = 4;
  for (const l of lanes) {
    g.fillStyle = "#4a2b38"; g.font = "700 13px Sarabun, sans-serif"; g.textBaseline = "middle"; g.fillText(l.dataset.lane ?? "", 6, y + l.clientHeight / 2);
    // รูปคลื่นกับไม้บรรทัดตัวเลข (แบบ Audacity) วางตามตำแหน่งจริงบนจอ
    for (const cv of l.querySelectorAll<HTMLCanvasElement>("canvas.vrul, canvas.cv")) g.drawImage(cv, cv.offsetLeft, y, cv.clientWidth, cv.clientHeight);
    y += l.clientHeight + 6;
  }
  return out;
}

/* ---------- ความดัง ---------- */
type CommonProps = { save: () => void; exportRef: React.MutableRefObject<() => HTMLCanvasElement | null>; plotRef: React.RefObject<HTMLDivElement | null> };
function LoudView({ ov, th, t0, t1, names, marks, zoomBox, at, live, setHover, showTable, setShowTable, save, exportRef, plotRef }: CommonProps & { ov: GOverview; th: Theme; t0: number; t1: number; names: string[]; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; showTable: boolean; setShowTable: (b: boolean) => void }) {
  const X0 = 44;
  const pick = (t: number) => { const c = Math.max(0, Math.min(ov.cols - 1, Math.floor(t / ov.duration * ov.cols))); return ov.loud[c]; };
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const pad = 12, lo = -60, hi = 0, Y = (v: number) => pad + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (h - pad * 2), N = w - X0 - 4;
    axisY(g, X0, w, h, pad, lo, hi, 10, "LUFS");
    const pts: number[] = [];
    for (let x = 0; x < N; x++) { const a = t0 + (t1 - t0) * x / N, b = t0 + (t1 - t0) * (x + 1) / N; let e = 0, n = 0; for (let c = Math.floor(a / ov.duration * ov.cols); c <= Math.floor(b / ov.duration * ov.cols) && c < ov.cols; c++) { if (c < 0) continue; e += Math.pow(10, ov.loud[c] / 10); n++; } pts.push(n ? 10 * Math.log10(e / n) : -70); }
    g.fillStyle = th.peak; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(X0, Y(lo)); pts.forEach((v, x) => g.lineTo(X0 + x, Y(v))); g.lineTo(X0 + N, Y(lo)); g.closePath(); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = th.rms; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath(); pts.forEach((v, x) => (x ? g.lineTo(X0 + x, Y(v)) : g.moveTo(X0, Y(v)))); g.stroke();
    g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(-23)), N, 1);
    g.font = "600 11.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#6b4a58"; g.fillText("อ้างอิง −23 LUFS", X0 + N - 4, Y(-23) - 3);
  }, [ov, th, t0, t1]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  exportRef.current = () => ref.current;
  const f1 = (v: number | null) => (v == null ? "—" : minus(v.toFixed(1)));
  const sil = ov.silences.length;
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="tiles" data-graphtiles>
        <div className="tile"><span>ความดังรวม</span><b>{f1(ov.integrated)} LUFS</b><em>ทั้งเรื่อง ตามมาตรฐาน EBU R128</em></div>
        <div className="tile"><span>ยอดเสียงสูงสุด</span><b>{f1(ov.truePeak)} dBTP</b><em>{(ov.truePeak ?? -99) >= 0 ? "ถึง 0 · อาจมีเสียงแตก" : "ไม่ถึง 0"}{ov.clips.some((c) => c > 0) ? ` · เสียงแตก ${ov.clips.reduce((a, b) => a + b, 0)} จุด` : ""}</em></div>
        <div className="tile"><span>ช่วงความดัง</span><b>{f1(ov.lra)} LU</b><em>ห่างระหว่างช่วงเบากับช่วงดัง</em></div>
        <div className="tile"><span>ช่วงเงียบผิดปกติ</span><b>{sil ? `${sil} ช่วง` : "ไม่พบ"}</b><em>{sil ? `แรกสุดที่ ${tfmt(ov.silences[0][0])}` : "เงียบทุกช่องเกิน 1 วินาที"}</em></div>
      </div>
      <div className="plothead"><span><b>ความดังตลอดเรื่อง</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox}</div>
      <div style={{ position: "relative" }} ref={setBox} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - 4, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-loudbox>
        <canvas className="cv" style={{ height: 200 }} ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={4} inline />
        {live && <Crosshair box={box} left={X0} right={4} t0={t0} t1={t1} at={at} rows={[{ v: minus(pick(at).toFixed(1)) + " LUFS", k: "ทุกช่องรวม" }]} />}
      </div>
      <div className="sub">ยอดเสียงแต่ละช่อง</div>
      <div className="pbars">{names.map((c, i) => <FragmentBar key={c} code={label(names, c).code} th={label(names, c).th} w={Math.max(ov.peaks[i] <= -119 ? 0 : 2, (ov.peaks[i] + 48) / 48 * 100)} color={th.rms} v={pkTxt(ov.peaks[i])} />)}</div>
      <div className="agfoot"><div className="lg"><span><i style={{ background: th.peak }} />ความดัง</span><span><span className="ln" style={{ background: th.rms }} />เส้นความดัง</span><span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง</span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable(!showTable)} data-table>{showTable ? "ซ่อนตาราง" : "ดูเป็นตาราง"}</button><button type="button" className="btn btn-ghost btn-sm" onClick={save}>บันทึกเป็นรูป</button></div></div>
      {showTable && <table className="fmt" style={{ marginTop: 10 }} data-graphtable><thead><tr><th>ช่อง</th><th className="num">ยอดเสียง</th><th className="num">ความดังเฉลี่ย</th><th className="num">เสียงแตก</th></tr></thead>
        <tbody>{names.map((c, i) => <tr key={c}><td><b>{label(names, c).code}</b> {label(names, c).th}</td><td className="num">{pkTxt(ov.peaks[i])}</td><td className="num">{pkTxt(ov.rms[i])}</td><td className="num">{ov.clips[i] ? `${ov.clips[i]} จุด` : "ไม่พบ"}</td></tr>)}</tbody></table>}
    </div>
  );
}
function FragmentBar({ code, th, w, color, v }: { code: string; th: string; w: number; color: string; v: string }) {
  return <><div className="small" style={{ color: "var(--txt2)" }}><b style={{ color: "var(--txt)" }}>{code}</b> {th}</div><div className="bt"><i style={{ width: `${w}%`, background: color }} /></div><div className="v">{v}</div></>;
}

/* ---------- ซ้อนเทียบ ---------- */
function CmpView({ src, names, cc, t0, t1, marks, zoomBox, at, live, setHover, play, save, exportRef, plotRef }: CommonProps & { src: Src; names: string[]; cc: string[]; t0: number; t1: number; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; play: () => void }) {
  // ที่ว่างป้ายชื่อเส้นทางขวา พอสำหรับคำที่ยาวสุด "ซ้ายหน้า" (60 ตัดตัวสุดท้าย เจอตอนเทส 7 พ.ย. 2569)
  const X0 = 44, RW = 80;
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const pad = 12, lo = -48, hi = 0, N = w - X0 - RW, Y = (v: number) => pad + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (h - pad * 2);
    axisY(g, X0, w - RW, h, pad, lo, hi, 12, "dB");
    const ends: [string, number][] = [];
    for (const c of cc) {
      const d = sample(src, names.indexOf(c), t0, t1, N), win = Math.max(1, Math.round(N * 3 / (t1 - t0 || 1) / 2));
      g.strokeStyle = CMP[c]; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      let last = lo;
      for (let x = 0; x < N; x++) {
        let s = 0, n = 0; for (let k = -win; k <= win; k++) { const j = x + k; if (j < 0 || j >= N) continue; s += d.rm[j] ** 2; n++; }
        const v = d.rm[x] <= 0.0001 ? lo : 20 * Math.log10(Math.sqrt(s / n)); last = v; if (x) g.lineTo(X0 + x, Y(v)); else g.moveTo(X0, Y(v));
      }
      g.stroke(); ends.push([c, Y(last)]);
    }
    // ป้ายห่างกันอย่างน้อย 15 · ดันลงจนชนขอบล่าง แล้วดันทั้งกลุ่มกลับขึ้น ป้ายไม่หลุดกรอบ (ช่องที่เงียบทั้งคู่เส้นทับกันที่ล่างสุด)
    ends.sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < ends.length; i++) if (ends[i][1] - ends[i - 1][1] < 15) ends[i][1] = ends[i - 1][1] + 15;
    for (let i = ends.length - 1; i >= 0; i--) { const lim = h - 8 - (ends.length - 1 - i) * 15; if (ends[i][1] > lim) ends[i][1] = lim; }
    g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
    for (const [c, y] of ends) { g.fillStyle = CMP[c]; g.fillRect(X0 + N + 6, Math.round(y), 12, 2); g.fillStyle = "#4a2b38"; g.fillText(label(names, c).th.split(" ")[0], X0 + N + 22, y); }
  }, [src, t0, t1, cc]);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  exportRef.current = () => ref.current;
  const val = (c: string) => { const e = src.env[names.indexOf(c)], k = Math.max(0, Math.min(src.cols - 1, Math.floor((at - src.t0) / (src.t1 - src.t0 || 1) * src.cols))); return e[k * 3 + 2]; };
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plothead"><span><b>ซ้อนเทียบความดังเฉลี่ย</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox}</div>
      <div style={{ position: "relative" }} ref={setBox} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - RW, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-cmpbox>
        <canvas className="cv" style={{ height: 250 }} ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={RW} inline />
        {live && <Crosshair box={box} left={X0} right={RW} t0={t0} t1={t1} at={at} rows={cc.map((c) => ({ v: dbTxt(val(c)) + " dB", k: `${label(names, c).code} ${label(names, c).th}`, color: CMP[c] }))} />}
      </div>
      <div className="agfoot"><div className="lg">{cc.map((c) => <span key={c}><span className="ln" style={{ background: CMP[c] }} />{label(names, c).code} {label(names, c).th}</span>)}<span className="small">ซ้อนได้ไม่เกิน 3 ช่อง</span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={play}>เปิดเล่นที่ {tfmt(at)}</button><button type="button" className="btn btn-ghost btn-sm" onClick={save}>บันทึกเป็นรูป</button></div></div>
    </div>
  );
}

/* ---------- วิเคราะห์ (แบบ Spek) ---------- */
const SPK = { L: 62, R: 92, T: 58, B: 36 };

/** ขอบบนของเสียง · top = ความถี่สูงสุดที่ดังกว่า −90 dB อย่างน้อย 5% ของเวลา
    cliff = ใต้ขอบ 1 kHz ดังกว่าเหนือขอบกี่ dB · ตัวเข้ารหัส MP3 AAC ตัดเป็นหน้าผา ต่างกันหลายสิบ dB · เสียงที่ค่อย ๆ เบาลงเองต่างกันน้อย
    ดีกว่ามอคอัปที่ดูแค่ top · เพลงที่ไม่มีเสียงสูงจริง ๆ ไม่โดนหาว่าแปลงมา (พี่กัน "ถ้าระบบเราทำได้ดีกว่า เอาตามระบบเรานะ") */
function edgeOf(srcs: Uint8Array[], B: number, c0: number, c1: number, nyq: number) {
  const n = Math.max(1, c1 - c0), pres = new Float32Array(B), mean = new Float32Array(B);
  for (let b = 0; b < B; b++) {
    let p = 0, s = 0;
    for (let c = c0; c < c1; c++) { let m = 0; for (const d of srcs) m = Math.max(m, d[c * B + b] ?? 0); if (m > 64) p++; s += m; }
    pres[b] = p / n; mean[b] = s / n * 120 / 255;
  }
  let tb = 0;
  for (let b = B - 1; b > 0; b--) if (pres[b] > 0.05) { tb = b; break; }
  const w = Math.max(2, Math.round(1000 / (nyq / B)));
  const avg = (a: number, z: number) => { let s = 0, k = 0; for (let b = Math.max(0, a); b <= Math.min(B - 1, z); b++) { s += mean[b]; k++; } return k ? s / k : 0; };
  return { top: (tb + 1) / B * nyq, cliff: tb >= B - 3 ? 0 : avg(tb - w, tb) - avg(tb + 2, tb + 2 + w), full: tb >= B - 3 - w };
}

/** ตีความขอบบน · เกณฑ์ตามมอคอัปที่พี่กันผ่าน FLAC ต่ำกว่า 19.5 kHz · AC-3 กับ E-AC-3 ต่ำกว่า 19 kHz · AAC ต่ำกว่า 15.5 kHz · เพิ่มเงื่อนไขว่าต้องตัดเป็นหน้าผา */
function spekVerdict(codec: string, rate: number, e: { top: number; cliff: number; full: boolean }) {
  const LOSSLESS = ["FLAC", "PCM", "ALAC", "TrueHD", "DTS-HD MA", "WAVPACK"];
  const LIMIT: Record<string, number> = { FLAC: 19500, PCM: 19500, ALAC: 19500, "AC-3": 19000, "E-AC-3": 19000, AAC: 15500 };
  const NORM: Record<string, string> = {
    FLAC: "FLAC ของจริงมีเสียงถึงราว 20–22 kHz", PCM: "ไฟล์ WAV ของจริงมีเสียงถึงราว 20 kHz ขึ้นไป", ALAC: "ALAC ของจริงมีเสียงถึงราว 20–22 kHz",
    "AC-3": "ปกติของ AC-3 มีเสียงถึงราว 19 kHz ขึ้นไป", "E-AC-3": "ปกติของ E-AC-3 มีเสียงถึงราว 19 kHz ขึ้นไป",
    AAC: "ปกติของ AAC ตัดเสียงสูงตามบิตเรต บิตเรตต่ำตัดราว 16 kHz บิตเรตสูงเกือบเต็มช่วง",
    MP3: "ปกติของ MP3 ตัวเข้ารหัสตัดเสียงสูงทิ้งเองตามบิตเรต 128 kb/s ตัดราว 17 kHz · 320 kb/s ตัดราว 20 kHz", Opus: "ปกติของ Opus ตัดเสียงสูงที่ราว 20 kHz",
  };
  const k = (e.top / 1000).toFixed(1), sharp = e.cliff > 25, lossless = LOSSLESS.includes(codec);
  const how = "ดูได้จากขอบบนที่ตัดเป็นเส้นตรง";
  if (e.top < 10000) return { warn: false, b: `เสียงสูงสุดราว ${k} kHz`, d: "ช่วงนี้แทบไม่มีเสียงสูง เช่น เสียงพูด เสียงทดสอบ หรือช่วงเงียบ จึงดูไม่ได้ว่าไฟล์แปลงมาไหม" };
  if (sharp && LIMIT[codec] && e.top < LIMIT[codec]) return { warn: true, b: `เป็นไฟล์ ${codec} แต่เสียงหยุดที่ราว ${k} kHz`, d: `${NORM[codec]} · ไฟล์นี้น่าจะ${lossless ? "แปลงมาจาก MP3 หรือ AAC" : "แปลงต่อมาจากไฟล์ที่คุณภาพต่ำกว่า"} คุณภาพไม่ได้ดีกว่าไฟล์ต้นทาง ${how}` };
  if (sharp && lossless && rate >= 88200 && e.top < 25000) return { warn: true, b: `ไฟล์ ${(rate / 1000).toLocaleString("en-US")} kHz แต่เสียงหยุดที่ราว ${k} kHz`, d: `ไฟล์ความละเอียดสูงที่อัดมาจริงมักมีเสียงเกิน 24 kHz · ไฟล์นี้น่าจะแปลงขึ้นมาจากไฟล์ 44.1 หรือ 48 kHz คุณภาพไม่ได้ดีกว่าไฟล์ต้นทาง ${how}` };
  const b = `เสียงสูงสุดราว ${k} kHz`;
  if (!lossless) return { warn: false, b, d: NORM[codec] ?? (e.full ? "มีเสียงเต็มช่วงถึงขอบบนของไฟล์" : "ดูจากขอบบนของความถี่ที่มีเสียง") };
  if (e.top > 24500) return { warn: false, b, d: "มีเสียงสูงเกิน 24 kHz แบบไฟล์ความละเอียดสูงที่อัดมาจริง ไม่มีร่องรอยการตัดเสียงสูง" };
  if (LIMIT[codec] && e.top < LIMIT[codec]) return { warn: false, b, d: "เสียงสูงค่อย ๆ เบาลงเอง ไม่ได้ตัดเป็นเส้นตรงแบบไฟล์ที่แปลงมาจาก MP3 น่าจะเป็นลักษณะของเสียงต้นฉบับ เช่น เพลงหรือหนังเก่า" };
  return { warn: false, b, d: `${NORM[codec] ?? "ไฟล์ไม่บีบอัดของจริงมีเสียงถึงราว 20 kHz ขึ้นไป"} · ไฟล์นี้ไม่มีร่องรอยการตัดเสียงสูง` };
}
function SpekView({ ov, win, track, fileName, names, t0, t1, zoomBox, scmap, setScmap, th, audioOnly, play, save, exportRef, plotRef, at }: CommonProps & { ov: GOverview; win: GWindow | null; track: GTrack | undefined; fileName: string; names: string[]; t0: number; t1: number; zoomBox: React.ReactNode; scmap: Prefs["scmap"]; setScmap: (v: Prefs["scmap"]) => void; th: Theme; audioOnly: boolean; play: () => void; at: number }) {
  const [ch, setCh] = useState(-1);
  const rate = track?.rate ?? 48000, nyq = rate / 2;
  const ramp = { heat: HEAT, rainbow: RAINBOW, mono: MONO, theme: th.ramp }[scmap];
  const all = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  const list = ch >= 0 ? [ch] : all.length ? all : [0];
  // ขอบบนของเสียง จากข้อมูลชุดเดียวกับที่วาด (ช่วงที่เห็นอยู่)
  const edge = useMemo(() => {
    const srcs = list.map((i) => (win ? dec(win.spec[i]) : dec(ov.spec[i])));
    const B = win ? win.bins : ov.specBins, cols = win ? Math.round(srcs[0].length / B) : ov.specCols;
    const c0 = win ? 0 : Math.floor(t0 / ov.duration * cols), c1 = win ? cols : Math.max(c0 + 1, Math.ceil(t1 / ov.duration * cols));
    return edgeOf(srcs, B, c0, c1, nyq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov, win, t0, t1, ch]);
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = SPK, PW = w - L - R, PH = h - T - B, colors = lut(ramp);
    const srcs = list.map((i) => (win ? dec(win.spec[i]) : dec(ov.spec[i])));
    const bins = win ? win.bins : ov.specBins, cols = win ? Math.round(srcs[0].length / bins) : ov.specCols;
    const c0 = win ? 0 : Math.floor(t0 / ov.duration * cols), c1 = win ? cols : Math.max(c0 + 1, Math.ceil(t1 / ov.duration * cols));
    drawMatrix(g, L, T, PW, PH, c1 - c0, bins, colors, (row, col) => { let m = 0; for (const d of srcs) m = Math.max(m, d[(c0 + col) * bins + row]); return m; });
    g.strokeStyle = "#fff"; g.lineWidth = 1; g.strokeRect(L - 0.5, T - 0.5, PW + 1, PH + 1);
    g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillStyle = "#fff"; g.font = "700 13.5px Sarabun, sans-serif"; g.fillText(fileName, L, 22);
    g.fillStyle = "#d8d8d8"; g.font = "12px Sarabun, sans-serif";
    g.fillText(`${track?.codec ?? ""} · ${rate.toLocaleString("en-US")} Hz${track?.bits ? ` · ${track.bits}-bit` : ""} · ${ch < 0 ? `${list.length} channels mixed` : `channel ${label(names, names[ch]).code}`}`, L, 42);
    g.textAlign = "right"; g.fillStyle = "#9a9a9a"; g.fillText("ชั้นหนัง", w - 12, 22);
    g.fillStyle = "#e6e6e6"; g.font = "11.5px Sarabun, sans-serif"; g.textBaseline = "middle";
    const fs = nyq > 30000 ? 8000 : 2000;
    for (let f = 0; f <= nyq + 1; f += fs) { const y = T + PH * (1 - f / nyq); g.fillRect(L - 5, Math.round(y), 5, 1); g.fillText(`${f / 1000} kHz`, L - 8, y); }
    g.textAlign = "center"; g.textBaseline = "top"; const st = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => (t1 - t0) / s <= 10) ?? 7200;
    for (let x = Math.ceil(t0 / st) * st; x <= t1 + 0.01; x += st) { const px = L + (x - t0) / (t1 - t0 || 1) * PW; g.fillRect(Math.round(px), T + PH, 1, 5); g.fillText(tfmt(x), px, T + PH + 8); }
    const bx = L + PW + 18, grad = g.createLinearGradient(0, T, 0, T + PH); ramp.slice().reverse().forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    g.fillStyle = grad; g.fillRect(bx, T, 12, PH); g.fillStyle = "#e6e6e6"; g.textAlign = "left"; g.textBaseline = "middle";
    for (let d = 0; d >= -120; d -= 20) { const y = T + PH * (-d / 120); g.fillRect(bx + 12, Math.round(y), 4, 1); g.fillText(`${d === 0 ? "0" : "−" + -d} dB`, bx + 20, y); }
  }, [ov, win, t0, t1, ch, scmap, th]);
  exportRef.current = () => ref.current;
  const verdict = spekVerdict(track?.codec ?? "", rate, edge);
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><b>วิเคราะห์ความถี่</b>
        <span data-spekch><Dropdown label="ช่องที่ดู" value={String(ch)} onChange={(v) => setCh(Number(v))}
          options={[{ value: "-1", label: "รวมทุกช่อง" }, ...names.map((c, i) => ({ value: String(i), label: `${label(names, c).code} ${label(names, c).th}` }))]} /></span></span>{zoomBox}</div>
      <div style={{ position: "relative" }}><canvas className="cv" style={{ height: 430, borderRadius: 8 }} ref={ref} data-spek /></div>
      {verdict.warn
        ? <div className="stat warn" style={{ marginTop: 10 }} data-spekverdict data-cliff={Math.round(edge.cliff)}>{WARN}<div><b><Phr>{verdict.b}</Phr></b>{lines(verdict.d)}</div></div>
        : <div className="stat info" style={{ marginTop: 10 }} data-spekverdict data-cliff={Math.round(edge.cliff)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg><div><b><Phr>{verdict.b}</Phr></b>{lines(verdict.d)}</div></div>}
      <div className="agfoot"><div className="seg sm">{([["heat", "สีความร้อน"], ["rainbow", "สีรุ้ง"], ["mono", "ขาวดำ"], ["theme", "สีตามชุด"]] as [Prefs["scmap"], string][]).map(([k, l]) => <button key={k} type="button" className={scmap === k ? "on" : ""} onClick={() => setScmap(k)} data-scmap={k}>{l}</button>)}</div>
        <div style={{ display: "flex", gap: 8 }}>{!audioOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={play}>เปิดเล่นที่ {tfmt(at)}</button>}<button type="button" className="btn btn-ghost btn-sm" onClick={save}>บันทึกเป็นรูป</button></div></div>
    </div>
  );
}

/* ---------- ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity) ---------- */
const PSM = { L: 52, R: 18, T: 14, B: 30 };
/** ค่าบนเส้นโค้งผ่าน 4 จุดที่ตำแหน่ง 0 1 2 3 (พหุนามลากรานจ์ดีกรีสาม) · x คือตำแหน่งระหว่าง 0 ถึง 3 */
function cubicAt(y0: number, y1: number, y2: number, y3: number, x: number) {
  return y0 * -(x - 1) * (x - 2) * (x - 3) / 6 + y1 * x * (x - 2) * (x - 3) / 2 - y2 * x * (x - 1) * (x - 3) / 2 + y3 * x * (x - 1) * (x - 2) / 6;
}
function PsdView({ psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast }: CommonProps & {
  psd: GPsd | null; names: string[]; psdCh: string; setPsdCh: (v: string) => void; psdLog: boolean; setPsdLog: (b: boolean) => void; psdSize: number; setPsdSize: (n: number) => void; th: Theme; ov: GOverview; t0: number; t1: number;
  zoomBox: React.ReactNode; onPick: (t: number) => void; f: number | null; setF: (f: number | null) => void; fileName: string; toast: ReturnType<typeof useToast>;
}) {
  const nyq = (psd?.rate ?? 48000) / 2;
  type Series = { d: number[]; key: string; color: string; name: string; long: string };
  const series = useMemo((): Series[] => {
    if (!psd) return [];
    // ซ้อนทุกช่อง สีตามตำแหน่งช่องในแทร็ก (ซ้ายฟ้า ขวาส้ม กลางเขียวน้ำทะเล ตรงกับแบบซ้อนเทียบ) · แทร็กสองช่องมีเส้นกลางกับเส้นข้างท้าย
    if (psdCh === "all") return psd.db.map((d, i) => {
      if (i < names.length) { const l = label(names, names[i]); return { d, key: names[i], color: OVER[i % OVER.length], name: l.code, long: `${l.code} ${l.th}` }; }
      return i === names.length ? { d, key: "M", color: OVER[2], name: "M", long: "M กลาง ซ้าย+ขวา" } : { d, key: "S", color: OVER[3], name: "S", long: "S ข้าง ซ้าย−ขวา" };
    });
    return psd.db.map((d, i) => {
      const name = psd.db.length > 1 ? (i === 0 ? "ซ้าย" : "ขวา") : psdCh === "mix" ? (names.length === 1 ? "เสียงเดียว" : "รวมทุกช่อง") : label(names, psdCh).th;
      return { d, key: String(i), color: psd.db.length > 1 ? (i === 0 ? CMP.FL : CMP.FR) : th.rms, name, long: name };
    });
  }, [psd, th, psdCh, names]);
  /** เส้นที่กดซ่อนจากป้ายใต้กราฟ · เปลี่ยนแบบแล้วแสดงครบทุกเส้น · ต้องเหลืออย่างน้อยหนึ่งเส้น */
  const [off, setOff] = useState<string[]>([]);
  useEffect(() => setOff([]), [psdCh]);
  const shown = series.filter((s) => !off.includes(s.key));
  const fOf = (i: number) => i * (psd?.rate ?? 48000) / (psd?.size ?? 4096);
  // ยอดแคบ · ตำแหน่งจริงระหว่างช่องความถี่คิดจากพาราโบลาผ่าน 3 ช่อง (ช่องละ 11.7 Hz ที่ 4096 · 50 Hz ตกที่ช่อง 46.9 Hz ถ้าไม่คิดตรงนี้ เจอตอนเทส 7 พ.ย. 2569)
  const peaks = useMemo(() => {
    if (!psd) return [] as [number, number][];
    const d = psd.db[0], out: [number, number][] = [];
    for (let i = 2; i < d.length - 3; i++) {
      // ยอดที่เบากว่า −100 dB เป็นแค่เสียงรบกวนใต้พื้นกราฟ ไม่นับ (กล่องชี้เคยบอกยอดใกล้สุด −124 dB เจอตอนเทส)
      if (!(d[i] > -100 && d[i] > d[i - 1] && d[i] >= d[i + 1] && d[i] - Math.min(d[Math.max(0, i - 3)], d[i + 3]) > 8)) continue;
      const a = d[i - 1], b = d[i], c = d[i + 1], den = a - 2 * b + c, p = den ? 0.5 * (a - c) / den : 0;
      out.push([fOf(i + Math.max(-0.5, Math.min(0.5, p))), b]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd]);
  /** เสียงฮัมจากไฟบ้าน 50 Hz ของไทยกับเลขคูณ · 60 Hz ของไฟล์จากต่างประเทศ
      ต้องเจอยอดแคบในตระกูลเดียวกันอย่างน้อย 2 ยอด (เช่น 50 กับ 100) · คลาดได้ 3% หรือ 0.3 ช่องความถี่
      (เดิมยอดเดียวก็เตือน คลาดได้ 0.75 ช่อง เพลงจริง 96 kHz ช่องละ 23 Hz โน้ตเบสใกล้ 60 Hz เลยโดนเตือนว่าเป็นเสียงฮัม เจอตอนตรวจภาพ 7 พ.ย. 2569) */
  const hum = useMemo(() => {
    for (const base of [50, 60]) {
      const fam = [1, 2, 3, 4, 5, 6, 7].map((k) => base * k);
      const hit = peaks.flatMap(([fr, d]) => { const h = fam.find((x) => Math.abs(fr - x) < Math.max(x * 0.03, fOf(0.3))); return d > -70 && fr < 400 && h ? [[fr, d, h] as const] : []; });
      if (new Set(hit.map((x) => x[2])).size >= 2) return hit;
    }
    return [] as (readonly [number, number, number])[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks]);
  const topF = useMemo(() => { if (!psd) return 0; const d = psd.db[0]; for (let i = d.length - 1; i > 0; i--) if (d[i] > -90) return fOf(i); return 0; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [psd]);
  const X = (fr: number, w: number) => { const PW = w - PSM.L - PSM.R; return psdLog ? PSM.L + (Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(nyq) - Math.log10(20)) * PW : PSM.L + fr / nyq * PW; };
  /* หน้าตาแบบ Audacity (พี่กันส่งภาพหน้าต่าง Frequency Analysis ของ Audacity มา 7 พ.ย. 2569 *"กราฟมันยังไม่เหมือนใน audicity เลย"*)
     ระบายทึบสีเดียวใต้เส้น · แกน dB ปรับตามเสียงจริง ขีดทุก 6 dB · เส้นตารางถี่ทุกหลัก (20 30 40 … 100 200 300 …) เปิดปิดได้
     ช่วง dB เลือกได้ (แทนแถบซูมแนวตั้งของ Audacity) · บอกค่าที่ชี้กับยอดใกล้สุดในช่องใต้กราฟ วงกลมที่ยอด */
  const [grids, setGrids] = useState(true);
  const [range, setRange] = useState(90);
  const start = psdLog ? Math.max(1, Math.ceil(20 / fOf(1))) : 0;
  const top = useMemo(() => {
    if (!psd) return 0;
    let m = -150; for (const d of psd.db) for (let i = start; i < d.length; i++) m = Math.max(m, d[i]);
    return Math.min(0, Math.ceil(m / 6) * 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd, start]);
  const lo = top - range;
  /* ค่าที่วาดต่อจุดภาพ ใช้หลักเดียวกับ Audacity (อ่านจาก au3-fft/SpectrumAnalyst.cpp GetProcessedValue · เขียนเอง ไม่ได้คัดลอก Audacity ใช้ GPL)
     จุดภาพแคบกว่าหนึ่งช่องความถี่ (เสียงต่ำบนแกนล็อก) ลากเส้นโค้งผ่าน 4 ช่องข้างเคียง เส้นจึงเนียน ไม่เป็นหยักตรง ๆ แบบเดิม
     จุดภาพครอบหลายช่อง ใช้ค่าเฉลี่ยถ่วงตามส่วนที่ครอบ */
  const binHz = (psd?.rate ?? 48000) / (psd?.size ?? 4096);
  const valRange = (d: number[], f0: number, f1: number) => {
    let b0 = f0 / binHz, b1 = f1 / binHz;
    if (b1 - b0 < 1) {
      const mid = (b0 + b1) / 2, i = Math.max(0, Math.min(d.length - 4, Math.floor(mid) - 1));
      return cubicAt(d[i], d[i + 1], d[i + 2], d[i + 3], mid - i);
    }
    b0 = Math.max(0, b0); b1 = Math.min(d.length - 1, b1);
    let s = 0, i0 = Math.floor(b0), i1 = Math.floor(b1);
    if (i1 > i0) { s += d[i0] * (i0 + 1 - b0); for (let i = i0 + 1; i < i1; i++) s += d[i]; s += d[i1] * (b1 - i1); } else s = d[i0] * (b1 - b0);
    return s / Math.max(1e-9, b1 - b0);
  };
  const fAt = (x: number, PW: number) => (psdLog ? 20 * Math.pow(nyq / 20, x / PW) : Math.max(0, x / PW * nyq));
  /** ยอดทุกยอดย่อยแบบ Audacity (FindPeak) ใช้กับช่องยอดใกล้สุด · ตำแหน่งจริงคิดด้วยพาราโบลาผ่าน 3 ช่อง
      (เส้นโค้งผ่าน 4 ช่องแบบ Audacity เลื่อนยอดฮัม 50 Hz ไปเป็น 51 Hz เจอตอนตรวจภาพ · พาราโบลาบนค่า dB ของหน้าต่าง Hann ได้ 50 Hz) */
  const allPeaks = useMemo(() => {
    if (!psd) return [] as [number, number][];
    const d = psd.db[0], out: [number, number][] = [];
    for (let b = 1; b < d.length - 1; b++) {
      if (!(d[b] > d[b - 1] && d[b] >= d[b + 1]) || d[b] < -100) continue;
      const a = d[b - 1], c = d[b + 1], den = a - 2 * d[b] + c, p = den ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den)) : 0;
      out.push([(b + p) * binHz, d[b] - 0.25 * (a - c) * p]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd]);
  const Yof = (d: number, h: number) => PSM.T + (top - Math.max(lo, Math.min(top, d))) / (top - lo) * (h - PSM.T - PSM.B);
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = PSM, PW = w - L - R, PH = h - T - B, Y = (d: number) => Yof(d, h);
    const ink = "#4a2b38", minor = "#efdde5", major = "#dcc0cc";
    // เส้นตารางแนวนอนทุก 6 dB (ถี่เกินไปเป็นทุก 12) · ตัวเลขทุกเส้น
    const step = PH * 6 / range >= 16 ? 6 : 12;
    /** เส้นตารางทุกเส้น จดไว้วาดซ้ำทับพื้นสีด้วยสีขาวโปร่ง แบบ Audacity ที่เส้นตารางอยู่หน้าสุด
        (พี่กัน *"ของ audacity เส้นตารางมันจะอยู่หน้าสุดนะ … เอาเส้นตารางที่พาดผ่านสีจะอ่อนกว่าเส้นตารางพื้นหลังที่อยู่ฉากขาว"*) */
    const gl: [number, number, number, number, boolean][] = [];
    g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    for (let d = top; d >= lo - 0.01; d -= step) {
      const y = Math.round(Y(d)) + 0.5;
      if (grids) { gl.push([L, y, L + PW, y, true]); g.strokeStyle = major; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); }
      g.fillStyle = ink; g.fillText(minus(String(d)) + " dB", L - 6, y);
    }
    // เส้นตารางแนวตั้ง · แบบล็อก ทุก 1–9 × 10ⁿ (หลักเข้ม ตัวคั่นจาง) · แบบเส้นตรง ทุก 1 kHz
    g.textAlign = "center"; g.textBaseline = "top"; g.font = "600 11px Sarabun, sans-serif";
    const vline = (fr: number, strong: boolean) => { if (!grids) return; const x = Math.round(X(fr, w)) + 0.5; gl.push([x, T, x, T + PH, strong]); g.strokeStyle = strong ? major : minor; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); };
    const hz = (fr: number) => (fr >= 1000 ? `${fr / 1000} kHz` : `${fr} Hz`);
    if (psdLog) {
      for (let dec = 10; dec <= nyq; dec *= 10) for (let m = 1; m <= 9; m++) { const fr = m * dec; if (fr >= 20 && fr <= nyq) vline(fr, m === 1); }
      let lastX = -99;
      for (const fr of [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 40000]) {
        if (fr > nyq) continue; const x = X(fr, w); const tw = g.measureText(hz(fr)).width;
        if (x - tw / 2 < lastX + 8 || x + tw / 2 > L + PW + R) continue;
        g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); lastX = x + tw / 2;
      }
    } else {
      for (let fr = 1000; fr < nyq; fr += 1000) vline(fr, fr % 5000 === 0);
      const every = nyq > 30000 ? 8000 : 4000;
      for (let fr = 0; fr <= nyq; fr += every) { g.fillStyle = ink; g.fillText(hz(fr), X(Math.max(fr, 1), w), T + PH + 6); }
    }
    if (!psd) { g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#b28a9a"; g.font = "13px Sarabun, sans-serif"; g.fillText("กำลังคิดความถี่เฉลี่ยของช่วงที่เลือก", L + PW / 2, T + PH / 2); }
    else if (psdCh === "all") {
      // ซ้อนทุกช่อง แบบ SpectrumAnalyzer (พี่กัน 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
      // ระบายสีโปร่งของทุกเส้นก่อน แล้ววาดเส้นทึบทับทีหลัง เส้นจึงไม่จมใต้พื้นสีของเส้นอื่น · ส่วนที่ซ้อนกันเห็นสีผสม
      const drawn = shown.map((s) => {
        const area = new Path2D(), line = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x++) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + 1, PW))); area.lineTo(L + x + 0.5, y); if (x) line.lineTo(L + x + 0.5, y); else line.moveTo(L + 0.5, y); }
        area.lineTo(L + PW, T + PH); area.closePath();
        return { s, area, line };
      });
      // ความทึบพื้นสีต่อเส้นลดตามจำนวนเส้น ส่วนที่ทุกเส้นซ้อนกันทึบรวมราว 45% (เดิม 20% ทุกเส้น 4 เส้นซ้อนกันเป็นสีหม่นขุ่น เจอตอนตรวจภาพ)
      g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, drawn.length)); for (const { s, area } of drawn) { g.fillStyle = s.color; g.fill(area); }
      g.globalAlpha = 1; g.lineWidth = 1.5; g.lineJoin = "round"; for (const { s, line } of drawn) { g.strokeStyle = s.color; g.stroke(line); }
    } else if (series.length === 1) {
      // ระบายทึบสีเดียวจากเส้นลงถึงพื้นกราฟ แบบ Audacity · สีกลางของชุดสี (ชุดม่วงใกล้สีของ Audacity)
      // ค่าทีละจุดภาพ (valRange) ไม่ใช่ทีละช่องความถี่
      const s = series[0], area = new Path2D(); area.moveTo(L, T + PH);
      for (let x = 0; x < PW; x++) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + 1, PW))));
      area.lineTo(L + PW, T + PH); area.closePath();
      g.fillStyle = th.ramp[4]; g.fill(area);
      // เส้นตารางเส้นเดิมวาดซ้ำเฉพาะในพื้นสี ขาวโปร่ง อ่อนกว่าเส้นบนพื้นขาว
      if (grids) {
        g.save(); g.clip(area); g.lineWidth = 1;
        for (const [x1, y1, x2, y2, strong] of gl) { g.strokeStyle = strong ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        g.restore();
      }
    } else {
      // เทียบซ้ายขวา (ของเราเพิ่มเอง Audacity ไม่มี) เป็นเส้นสองสีตามช่อง
      for (const s of shown) {
        g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
        for (let x = 0; x < PW; x++) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + 1, PW))); if (x) g.lineTo(L + x + 0.5, y); else g.moveTo(L + 0.5, y); }
        g.stroke();
      }
    }
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, PW - 1, PH - 1);
  }, [psd, psdLog, th, series, off, grids, range, top]);
  exportRef.current = () => ref.current;
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const cur = f ?? (hum[0]?.[0] ?? 1000);
  const W = box?.clientWidth ?? 0, H = box?.clientHeight ?? 0, cx = W ? X(cur, W) : 0;
  // ยอดใกล้ตำแหน่งชี้ที่สุด วัดระยะแบบล็อก (บนแกนล็อกตรงกับที่ตาเห็นกว่าวัดเป็น Hz แบบ Audacity)
  const nearest = (fr: number) => allPeaks.slice().sort((a, b) => Math.abs(Math.log(a[0] / fr)) - Math.abs(Math.log(b[0] / fr)))[0];
  const valAt = (d: number[], fr: number) => valRange(d, fr * 0.999, fr * 1.001);
  const hzTxt = (fr: number) => `${Math.round(fr).toLocaleString("en-US")} Hz`;
  const pk = psd ? nearest(cur) : undefined;
  const exportCsv = async () => {
    if (!psd) return;
    const where = await pickSave(fileName.replace(/\.[^.]+$/, "") + " ความถี่เฉลี่ย.csv", "csv", "ตาราง CSV"); if (!where) return;
    const head = "Hz," + series.map((s) => s.name + " dB").join(",");
    const rows = psd.db[0].map((_, i) => [fOf(i).toFixed(2), ...psd.db.map((d) => d[i].toFixed(1))].join(","));
    try { const saved = await graphApi.save(where, null, [head, ...rows].join("\r\n")); toast({ kind: "ok", title: "ส่งออกตารางแล้ว", detail: saved }); }
    catch (e) { toast({ kind: "bad", title: "ส่งออกไม่ได้", detail: String(e) }); }
  };
  const opts: [string, string][] = names.length === 1 ? [["mix", label(names, names[0]).code]] : [["mix", "รวมทุกช่อง"], ...(names.includes("FR") ? [["FL", label(names, "FL").code], ["FR", label(names, "FR").code], ["lr", "เทียบซ้ายขวา"]] as [string, string][] : []), ["all", "ซ้อนทุกช่อง"]];
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><b>ความถี่เฉลี่ย</b>
        <div className="seg sm">{opts.map(([k, l]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-psdch={k}>{l}</button>)}</div></span>{zoomBox}</div>
      <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={onPick} left={52} />
      <div style={{ position: "relative", marginTop: 8 }} ref={setBox} data-psdbox
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(), PW = r.width - PSM.L - PSM.R, x = Math.min(PW, Math.max(0, e.clientX - r.left - PSM.L)); setF(psdLog ? Math.pow(10, Math.log10(20) + x / PW * (Math.log10(nyq) - Math.log10(20))) : Math.max(1, x / PW * nyq)); }}
        onPointerLeave={() => setF(null)}>
        <canvas className="cv" style={{ height: 340 }} ref={ref} data-psd />
        {/* เส้นตั้งกับวงยอดขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) · ช่องบอกค่าใต้กราฟยังอยู่ตลอด */}
        {psd && W > 0 && f != null && <>
          <div className="xh" style={{ left: cx, top: PSM.T, bottom: PSM.B }} />
          {pk && pk[1] >= lo && <div className="psdpk" style={{ left: X(pk[0], W), top: Yof(pk[1], H) }} />}
        </>}
      </div>
      {/* ป้ายบอกสีทุกเส้น กดเพื่อซ่อนหรือแสดงเส้นนั้น (สีอย่างเดียวไม่พอ ชื่อช่องอยู่บนป้ายเสมอ) */}
      {series.length > 1 && <div className="psdlg" data-psdlegend>{series.map((s) => {
        const on = !off.includes(s.key), last = on && shown.length === 1;
        return <button key={s.key} type="button" className={"psdk" + (on ? " on" : "")} aria-pressed={on} aria-disabled={last || undefined}
          title={last ? "ต้องเหลืออย่างน้อยหนึ่งเส้น" : on ? `กดเพื่อซ่อน ${s.long}` : `กดเพื่อแสดง ${s.long}`} data-psdkey={s.key}
          onClick={() => { if (!last) setOff((o) => (on ? [...o, s.key] : o.filter((k) => k !== s.key))); }}>
          <i style={on ? { background: s.color, borderColor: s.color } : { borderColor: s.color }} />{s.long}</button>;
      })}</div>}
      {/* ช่องบอกค่าใต้กราฟ แบบ Cursor กับ Peak ของ Audacity */}
      <div className="psdread" data-psdreadout>
        <span className="lbl">ตำแหน่งชี้</span>
        <span className="psdbox" data-psdcursor>{psd ? `${hzTxt(cur)} (${noteOf(cur)}) = ${shown.map((s) => (series.length > 1 ? s.name + " " : "") + minus(Math.round(valAt(s.d, cur)).toString()) + " dB").join(" · ")}` : "—"}</span>
        <span className="lbl">ยอดใกล้สุด</span>
        <span className="psdbox" data-psdpeak>{pk ? `${hzTxt(pk[0])} (${noteOf(pk[0])}) = ${minus(pk[1].toFixed(1))} dB` : "—"}</span>
      </div>
      {psd && (hum.length
        ? <div className="stat warn" style={{ marginTop: 10 }} data-psdverdict>{WARN}<div><b><Phr>{`เจอเสียงฮัมจากไฟบ้าน ยอดแคบที่ ${[...new Set(hum.map((x) => x[2]))].sort((a, b) => a - b).join(" ")} Hz`}</Phr></b>{lines("ไฟบ้านในไทย 50 Hz เสียงฮัมจะเป็นยอดแคบที่ 50 กับเลขคูณ · มักมาจากสายไมค์หรือปลั๊กพ่วง · ในหนังอาจเป็นเสียงประกอบที่ตั้งใจใส่")}</div></div>
        : <div className="stat info" style={{ marginTop: 10 }} data-psdverdict><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg><div><b>ไม่พบเสียงฮัม</b>ไม่มียอดแคบที่ 50 Hz กับเลขคูณ</div></div>)}
      <div className="small" style={{ marginTop: 6 }}>{psd ? `เสียงสูงสุดที่มีราว ${(topF / 1000).toFixed(1)} kHz · ` : ""}ช่วงที่เลือก {tfmt(t0)} ถึง {tfmt(t1)} · กดที่แถบบนเพื่อย้ายช่วง</div>
      <div className="agfoot"><div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><span className="lbl">แกนความถี่</span>
        <div className="seg sm"><button type="button" className={psdLog ? "on" : ""} onClick={() => setPsdLog(true)} data-psdaxis="log">แบบล็อก</button><button type="button" className={!psdLog ? "on" : ""} onClick={() => setPsdLog(false)} data-psdaxis="lin">เส้นตรง</button></div>
        <span data-psdsize title="ยิ่งมากยิ่งแยกความถี่ละเอียด แต่ช้าลง"><Dropdown label="ความละเอียด" value={String(psdSize)} onChange={(v) => setPsdSize(Number(v))}
          options={[1024, 4096, 16384].map((n) => ({ value: String(n), label: `ความละเอียด ${n.toLocaleString("en-US")}` }))} /></span>
        <span className="lbl">ช่วง</span>
        <div className="seg sm">{[60, 90, 120].map((r) => <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)} data-psdrange={r}>{r} dB</button>)}</div>
        <span className="lbl">เส้นตาราง</span><span data-psdgrid style={{ display: "inline-flex" }}><Switch on={grids} onChange={setGrids} label="เส้นตาราง" /></span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>ส่งออกเป็นตาราง</button><button type="button" className="btn btn-ghost btn-sm" onClick={save}>บันทึกเป็นรูป</button></div></div>
    </div>
  );
}
