/* หน้ากราฟเสียง ส่วนกลาง · ชนิดมุมมอง สีของกราฟ ชุดสีความถี่ ชื่อช่องเสียง ตัวช่วยตัวเลขกับเวลา ไม้บรรทัดเวลา ชื่อช่องบนแถบ
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { FixedTime } from "../../components/ui";
import { hexRgb, hslRgb, rgbHsl, toHex } from "../../components/ColorPick";
import type { WaveStyle } from "./draw";

export type View = "wave" | "spec" | "loud" | "cmp" | "spek" | "psd";
export type Theme = { lane: string; peak: string; rms: string; dark: string; ramp: string[] };

/* ชุดสีคำนวณจาก OKLCH สีเดียวต่อชุด (มอคอัป · สกิล dataviz) · พีชแทนอำพันที่พี่กันทักว่าไม่เข้ากับโปรแกรม */
export const THEMES: Record<string, Theme> = {
  "ชมพู": { lane: "#fff8fa", peak: "#f0b4ca", rms: "#b54879", dark: "#220f17", ramp: ["#2e1720", "#591b38", "#841f51", "#aa2f6b", "#c84d85", "#dd73a0", "#e89eba", "#ebcad5", "#ffecf2"] },
  "ฟ้า": { lane: "#f7fafe", peak: "#a3ccf7", rms: "#1577c8", dark: "#091725", ramp: ["#102031", "#003763", "#014f8a", "#0068b5", "#0b83de", "#4fa0ee", "#89bcf2", "#c1d7ee", "#e9f3fe"] },
  "ม่วง": { lane: "#fbf9ff", peak: "#cebdf2", rms: "#835cbe", dark: "#181224", ramp: ["#221b2f", "#3e275f", "#5a348d", "#7648b6", "#9164d3", "#a985e5", "#c0aaeb", "#d8cfeb", "#f4efff"] },
  "พีช": { lane: "#fef9f7", peak: "#f4b7a7", rms: "#bc4c31", dark: "#24100b", ramp: ["#301812", "#5d1d0e", "#8a2306", "#b13412", "#d05233", "#e4785d", "#eda28e", "#edccc3", "#ffede9"] },
};
export const THEME_ORDER = ["ชมพู", "ฟ้า", "ม่วง", "พีช"];
/** ชุดสีจากสีหลักสีเดียว ไล่ความสว่างตามแบบชุดสีสำเร็จรูป (พื้น ดังสุด ดังเฉลี่ย ไล่สีความถี่) · BUGS ข้อ 41 พี่กัน "ขอสีแบบกำหนดเองด้วย" */
export function themeOf(hex: string): Theme {
  const { h, s } = rgbHsl(hexRgb(hex)), sat = Math.max(0.35, Math.min(0.85, s || 0.5)), at = (l: number, k = 1) => toHex(hslRgb(h, sat * k, l));
  return { lane: at(0.985, 0.6), peak: at(0.8), rms: at(0.42), dark: at(0.08, 0.5), ramp: [at(0.12, 0.5), at(0.22), at(0.32), at(0.42), at(0.53), at(0.64), at(0.75), at(0.86, 0.6), at(0.96, 0.7)] };
}
export const CUSTOM = "กำหนดเอง";
export const RAINBOW = ["#00004d", "#0000b4", "#0046ff", "#00aaff", "#00e6d2", "#64ff64", "#e6f000", "#ff9600", "#ff1e1e", "#ff46c8"];
export const HEAT = ["#000000", "#000036", "#180062", "#4f007b", "#81007e", "#ae0068", "#d20040", "#ec000b", "#fc5500", "#ffb000", "#ffec3e", "#ffff9e", "#ffffff"];
const MONO = ["#000000", "#ffffff"];
/** ชุดสีของกราฟวิเคราะห์ · พื้นสว่างให้ช่วงเงียบเป็นสีขาว เข้ากับพื้น (พี่กันขอ 9 พ.ย. 2569 "ติ๊กเลือกเปลี่ยนจากสีพื้นหลังดำ เป็นสีสว่าง") */
const RAINBOW_LIGHT = ["#ffffff", "#d6e4ff", "#7fb0ff", "#00aaff", "#00e6d2", "#64ff64", "#e6f000", "#ff9600", "#ff1e1e", "#ff46c8"];
export const spekRamp = (name: "heat" | "rainbow" | "mono" | "theme", themeRamp: readonly string[], light: boolean): readonly string[] => {
  if (!light) return { heat: HEAT, rainbow: RAINBOW, mono: MONO, theme: themeRamp }[name];
  return { heat: [...HEAT].reverse(), rainbow: RAINBOW_LIGHT, mono: [...MONO].reverse(), theme: [...themeRamp].reverse() }[name];
};
/** สีเทียบช่อง ซ้าย ขวา กลาง · 3 สีแรกของชุดสีตั้งต้นสกิล dataviz ผ่านตัวตรวจทุกคู่ · สีตามช่อง */
export const CMP: Record<string, string> = { FL: "#2a78d6", FR: "#eb6834", FC: "#1baf7a" };
/** สีของความถี่เฉลี่ยแบบซ้อนทุกช่อง ตามตำแหน่งช่อง 8 สี ลำดับตายตัว (ชุดสีแยกกลุ่มของสกิลกราฟ ผ่านตัวตรวจตาบอดสี ΔE ข้างเคียงต่ำสุด 9.1)
    สามสีแรกตรงกับแบบซ้อนเทียบ · สีเหลือง เขียวน้ำทะเล ชมพู ตัดพื้นขาวต่ำ จึงมีชื่อช่องบนป้ายกับตัวเลขในช่องบอกค่าเสมอ */
export const OVER = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** ไอคอนนำหน้าปุ่ม 6 แบบ ตามมอคอัป (ตกหล่นตอนทำรอบแรก พี่กันส่งภาพมอคอัปมา 7 พ.ย. 2569 แคลร์เห็นเอง) */
const vi = (children: React.ReactNode) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">{children}</svg>;
export const VIEW_ICON: Record<View, React.ReactNode> = {
  wave: vi(<path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" />),
  spec: vi(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 16v-3M11 16V9M15 16v-5M19 16v-2" /></>),
  loud: vi(<path d="M3 18l5-6 4 3 4-8 5 5" />),
  cmp: vi(<><path d="M3 15c3-6 5-6 8 0s5 6 10-4" /><path d="M3 10c4 4 7 4 10-1s5-4 8 1" opacity=".55" /></>),
  spek: vi(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 17V9M10 17V6M13 17v-5M16 17V8" /><path d="M21 7h-2M21 12h-2M21 17h-2" /></>),
  psd: vi(<><path d="M3 20h18" /><path d="M4 17c2-1 3-9 5-9s2 6 4 6 3-4 5-4 2 3 3 3" /></>),
};
// มุมมอง ความถี่ เดิมรวมเข้าหน้าวิเคราะห์ แล้วเปลี่ยนชื่อหน้าวิเคราะห์เป็น ความถี่ (BUGS ข้อ 14 พี่กัน "ใช่ เอา เเถบความกี่ ไปรวมกับวิเคราะก์" · "เปลี่ยนเป็นความกี่เเทน")
// ปุ่ม ซ้อนเทียบ รวมเข้า ความดัง เลือกช่องในหน้า (BUGS ข้อ 24 พี่กัน "ตามนั้น เอามารวมกัน เเต่ ซ็อนเทียบก็ยังเเสดงหน่วยเดิม")
export const VIEWS: [View, string][] = [["wave", "รูปคลื่น"], ["loud", "ความดัง"], ["spek", "ความถี่"], ["psd", "ความถี่เฉลี่ย"]];
/** หน้าเทียบหลายไฟล์ยังไม่ได้รวมความดังกับซ้อนเทียบ คงแท็บซ้อนเทียบไว้ ไม่ให้ใช้งานหาย (งานค้างของ BUGS ข้อ 24) */
export const CMP_VIEWS: [View, string][] = [["wave", "รูปคลื่น"], ["loud", "ความดัง"], ["cmp", "ซ้อนเทียบ"], ["spek", "ความถี่"], ["psd", "ความถี่เฉลี่ย"]];
export const ZOOMS: [number | "all", string][] = [["all", "ทั้งไฟล์"], [600, "10 นาที"], [240, "4 นาที"], [30, "30 วินาที"]];
export const PSD_SPANS: [number | "all", string][] = [["all", "ทั้งไฟล์"], [120, "2 นาที"], [30, "30 วินาที"], [10, "10 วินาที"]];
const TH: Record<string, string> = { FL: "ซ้ายหน้า", FR: "ขวาหน้า", FC: "กลาง (เสียงพูด)", LFE: "เสียงเบส", BL: "ซ้ายหลัง", BR: "ขวาหลัง", SL: "ซ้ายข้าง", SR: "ขวาข้าง", BC: "หลังกลาง", FLC: "หน้าซ้ายกลาง", FRC: "หน้าขวากลาง" };
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteOf = (f: number) => { const n = Math.round(12 * Math.log2(f / 440)) + 57; return NOTES[((n % 12) + 12) % 12] + Math.floor(n / 12); };
export const WARN = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></svg>;
/** ไอคอนนำหน้ากล่องผลหน้าความถี่ ทุกกล่องมีไอคอนแนวเดียวกัน รูปไม่ซ้ำกับปุ่ม ⓘ (พี่กันทัก 13 พ.ย. 2569 "ขอเเนวเดียวกัน" · ก่อนหน้านี้ "เเล้วมันจะปุ่มเตือนเหมือนกันทำไม") */
export const OKI = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>;
export const ASK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M8.5 8.5a3.5 3.5 0 1 1 5.2 3.1c-1 .6-1.7 1.4-1.7 2.6v.8M12 19v.5" /></svg>;

export function tfmt(t: number) { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; }
/** เวลามีทศนิยมของวินาที เช่น 2:35.25 · d คือจำนวนหลักทศนิยม 0 ได้แบบ tfmt */
export function tfmtD(t: number, d: number) {
  if (d <= 0) return tfmt(t);
  const k = Math.pow(10, d), r = Math.round(Math.max(0, t) * k) / k, whole = Math.floor(r);
  const h = Math.floor(whole / 3600), m = Math.floor(whole % 3600 / 60), s = (r - h * 3600 - m * 60).toFixed(d).padStart(3 + d, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
/** หลักทศนิยมที่ต้องใช้ตามความยาวช่วงที่ดู · ช่วงสั้นกว่า 20 วินาทีมีทศนิยมหนึ่งหลัก สั้นกว่า 2 วินาทีสองหลัก สั้นกว่า 0.2 วินาทีสามหลัก */
export const spanDigits = (span: number) => (span < 0.2 ? 3 : span < 2 ? 2 : span < 20 ? 1 : 0);
/** ขีดเวลาบนแถบเวลา ไม่เกินราว 9 ขีด · ซูมเหลือไม่ถึงวินาทีก็ซอยเป็นเศษวินาที
    (เดิมละเอียดสุด 1 วินาที ซูมช่วง 1 วินาทีแล้วแถบเวลาว่าง พี่กันทัก 11 พ.ย. 2569 "ซูมขนาดนี้เเล้วไหนเวลา") */
const TICK_STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
export function rulerTicks(a: number, b: number, maxN = 9): { x: number; label: string }[] {
  const st = TICK_STEPS.find((s) => (b - a) / s <= maxN) ?? 7200;
  const d = st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? (st === 0.25 ? 2 : 1) : 0;
  const out: { x: number; label: string }[] = [];
  for (let n = Math.ceil(a / st - 1e-9); n * st <= b + 1e-9; n++) { const x = n * st; out.push({ x, label: tfmtD(x, d) }); }
  return out;
}
/** ช่วงเวลาบนหัวกราฟ กันที่ไว้เท่าข้อความยาวสุดของไฟล์ (ทศนิยม 3 หลัก) ซูมแล้วตัวเลขยาวขึ้นปุ่มข้าง ๆ ไม่ขยับ
    (พี่กันสั่ง 11 พ.ย. 2569 "fix หน่อยยยย" ตอนหัวกราฟ 0:00 ถึง 5:15 กับ 2:37.158 ถึง 2:37.348 ดันปุ่มแบบกราฟไปคนละที่) */
/** ความสูงแถบต่ำสุดตามจำนวนช่อง · หน้ารูปคลื่นไม่ต่ำกว่า 60 จุด (ตัวคิดความสูงแถบกับตัวปรับให้พอดีจอใช้ค่าเดียวกัน) */
export const laneMinH = (n: number, wave: boolean) => { const m = n > 6 ? 52 : n > 2 ? 72 : 120; return wave ? Math.max(m, 60) : m; };
export function RangeTime({ t0, t1, dur }: { t0: number; t1: number; dur: number }) {
  const d = spanDigits(t1 - t0), far = tfmtD(Math.max(dur, t1), 3);
  return <FixedTime t={`${tfmtD(t0, d)}–${tfmtD(t1, d)}`} longest={`${far}–${far}`} />;
}
/** แถบเวลาแบบไม้บรรทัด ขีดยาวตรงเลข ขีดสั้นแบ่งช่วงละ 5 · เลขชิดขอบไม่แสดงกันล้น แต่ขีดยังอยู่
    (พี่กันสั่ง 11 พ.ย. 2569 "ขอขีดตั้งเหมือนกับไม้บรรทัดด้วย ตรงเลขเวลา") */
export function TimeRuler({ t0, t1, left, right }: { t0: number; t1: number; left: number; right: number }) {
  const ticks = rulerTicks(t0, t1), span = t1 - t0 || 1;
  const st = ticks.length > 1 ? ticks[1].x - ticks[0].x : TICK_STEPS.find((v) => span / v <= 9) ?? 7200, sub = st / 5;
  const minor: number[] = [];
  for (let n = Math.ceil(t0 / sub - 1e-9); n * sub <= t1 + 1e-9; n++) if (n % 5 !== 0) minor.push(n * sub);
  const pc = (x: number) => (x - t0) / span * 100;
  return (
    <div className="ruler" style={{ marginLeft: left, marginRight: right }} data-timeruler>
      {minor.map((x) => <i key={"m" + x} className="tk sm" style={{ left: pc(x) + "%" }} />)}
      {ticks.map(({ x, label }) => { const p = pc(x); return <i key={label} className="tk" style={{ left: p + "%" }}>{p < 2 || p > 98 ? null : <span>{label}</span>}</i>; })}
    </div>
  );
}
export const minus = (s: string) => s.replace("-", "−");
/** ข้อความหลายท่อนคั่นด้วย " · " แยกเป็นบรรทัด ตัดคำเฉพาะตรงเว้นวรรค ไม่ตัดกลางวลี (เคยตัด "MP3 | หรือ AAC" เจอตอนตรวจภาพ) */
/** ยอดหรือความดังเฉลี่ยของช่อง (dB) · ช่องที่เงียบทั้งไฟล์บอกว่าเงียบ ไม่ขึ้น −120.0 dB */
export const pkTxt = (v: number) => (v <= -119 ? "เงียบ" : minus(v.toFixed(1)) + " dB");
export const dbTxt = (v: number) => v <= 0.0001 ? "−∞" : minus((20 * Math.log10(v)).toFixed(1));
const decMem = new Map<string, Uint8Array>();
export const dec = (s: string) => {
  let d = decMem.get(s);
  if (!d) { d = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); decMem.set(s, d); if (decMem.size > 64) decMem.delete(decMem.keys().next().value as string); }
  return d;
};
/** ใส่ของลงที่จำแบบจำกัดจำนวน เต็มแล้วทิ้งอันเก่าสุด */
export function memPut<T>(m: Map<string, T>, k: string, v: T, max: number) { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value as string); }

/** ชื่อช่องที่โชว์ · 2 ช่อง L R · ช่องเดียว M */
export function label(names: string[], c: string) {
  if (names.length === 2) return c === "FL" ? { code: "L", th: "ซ้าย" } : { code: "R", th: "ขวา" };
  if (names.length === 1) return { code: "M", th: "เสียงเดียว" };
  const side = names.length === 6 && (c === "SL" || c === "SR");
  return { code: c, th: side ? (c === "SL" ? "ซ้ายเซอร์ราวด์" : "ขวาเซอร์ราวด์") : TH[c] ?? c };
}
/** ค่าตั้งของหน้ากราฟที่จำในเครื่อง (ย้ายจาก GraphPage.tsx ขั้น 1.7 เพราะมุมมอง spek ใช้ด้วย) */
export type Prefs = { view: View; theme: string; style: WaveStyle; cmap: "theme" | "rainbow"; scmap: "heat" | "rainbow" | "mono" | "theme"; spekLight: boolean; wide: boolean; spekAxis: "lin" | "log"; customColor: string };
