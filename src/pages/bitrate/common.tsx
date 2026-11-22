/* หน้าบิตเรต ส่วนกลาง · วิธีคิดต่อเฟรม ความละเอียด รูปแบบกราฟ ชุดสี คำอธิบาย ⓘ ตัวเก็บผล ตัวคิดค่าต่อช่วง ตัวจัดรูปตัวเลข ชื่อ codec
   แยกจาก BitratePage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 3.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { type BrInfo } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";

export type Mode = "sec" | "gop" | "gopx" | "frm";
export const MODES: { value: Mode; label: string; letter: string }[] = [
  { value: "sec", label: "ต่อวินาที", letter: "S" },
  { value: "gop", label: "ต่อ GOP", letter: "G" },
  { value: "gopx", label: "GOP แบบถ่วง", letter: "X" },
  { value: "frm", label: "ต่อเฟรม", letter: "F" },
];
export const TIP_MODE: Tip = {
  w: "บิตเรตคือข้อมูลที่วิดีโอใช้ต่อวินาที ยิ่งสูงยิ่งเก็บรายละเอียดได้มาก เลือกได้ว่าจะรวมข้อมูลเป็นช่วงแบบไหน (ทำตามโปรแกรม Bitrate Viewer)",
  o: [
    ["ต่อวินาที", "รวมขนาดของทุกเฟรมในหนึ่งวินาที เป็นค่าตั้งต้น อ่านง่ายที่สุด", "", ""],
    ["ต่อ GOP", "รวมทีละกลุ่มภาพ (GOP) ตั้งแต่คีย์เฟรมหนึ่งถึงคีย์เฟรมถัดไป ปกติยาวราวครึ่งถึงสองวินาที", "", "ตัดฉากบ่อย GOP สั้น ค่าพุ่งสูงเกินจริงได้"],
    ["GOP แบบถ่วง", "เหมือนต่อ GOP แต่ GOP ที่สั้นกว่าครึ่งของปกติ เอาไปรวมกับรอบถัดไป ค่าเรียบกว่า", "", ""],
    ["ต่อเฟรม", "ดูทีละเฟรมและบอกชนิดเฟรม I P B โดย I เป็นเฟรมที่ใหญ่ที่สุด ส่วน B เล็กที่สุด", "", "ต้องถอดภาพจึงอ่านนานกว่าแบบอื่น และครั้งแรกจะอ่านไฟล์อีกรอบ"],
  ],
  r: "ถ้าดูภาพรวมให้ใช้ต่อวินาที แต่ถ้าอยากรู้ว่าเฟรมไหนกินข้อมูลมากให้ใช้ต่อเฟรม",
};
/** codec แบบไม่เสียคุณภาพ ใช้เพดานเสียงดิบ (BUGS ข้อ 119) */
export const LOSSLESS = /^(flac|alac|wavpack|ape|tak|tta|truehd|mlp|pcm_)/;
export const TIP_CEIL: Tip = {
  w: "เส้นประสีแดงบนกราฟ ช่วงที่บิตเรตสูงเกินเส้นนี้เป็นสีแดง",
  o: [
    ["เฉลี่ย × 2", "วิดีโอกับเสียงแบบเสียคุณภาพ คิดจากบิตเรตเฉลี่ยของทั้งไฟล์คูณสอง ปัดเป็น 1 2 5", "เห็นช่วงที่บิตเรตพุ่งผิดปกติ", ""],
    ["เสียงดิบ", "เสียงแบบไม่เสียคุณภาพ เช่น FLAC ALAC WavPack คิดจากบิตเรตของเสียงที่ยังไม่บีบ คืออัตราสุ่ม × บิต × จำนวนช่อง เช่น 96 kHz 24 บิต 2 ช่องได้ 4,608 kbps", "บอกได้ว่าบีบเหลือกี่เปอร์เซ็นต์ ช่วงที่แตะเพดานคือเสียงที่บีบไม่ลง เช่นเสียงอัดแน่นหรือมีเสียงรบกวนเต็มไฟล์", ""],
  ],
};
export const TIP_SCALE: Tip = {
  w: "ความสูงของกราฟ",
  o: [
    ["ตามเพดาน", "กราฟสูงพอดีเส้นเพดาน เทียบไฟล์ต่าง ๆ ได้ด้วยสเกลเดียวกัน แท่งที่เกินเพดานเป็นสีแดง", "", ""],
    ["ตามข้อมูล", "กราฟยืดให้แท่งที่สูงที่สุดในช่วงที่เห็นพอดีขอบบน เห็นรายละเอียดช่วงบิตเรตต่ำชัดขึ้น", "", ""],
  ],
  r: "เพดานคิดจากบิตเรตเฉลี่ยของทั้งไฟล์ ปัดเป็น 1 2 5 (ตัวจริงของ Bitrate Viewer ตั้ง 10 Mbps ตายตัวตามแผ่น DVD) ส่วนเสียงแบบไม่เสียคุณภาพใช้บิตเรตของเสียงดิบ",
};

/* ความละเอียดแท่งของวิธีคิดต่อวินาที (BUGS ข้อ 42 · พี่กันเคาะ 10 พ.ย. 2569 "งั้นเลือกแบ่งซอยเเท่งได้หลายระดับ เอาเป็นดรอปดาว" · "เน้นเบียน เน้นเนิร์ด")
   เรียงจากหยาบไปละเอียด · ทีละเฟรมใช้ข้อมูลแพ็กเก็ตที่อ่านอยู่แล้ว ไม่ต้องถอดภาพ · อัตโนมัติเลือกระดับที่ละเอียดสุดที่แท่งยังกว้างพอตามช่วงที่ซูม ("พอดูเส้น 1 วิ เราอยากห้ ดูละเอียดเฉพาะวินั้นได้") */
export type Res = "10" | "5" | "1" | "0.5" | "0.1" | "pkt" | "auto";
export const RES_STEPS: { value: Res; sec: number; label: string; note: string }[] = [
  { value: "10", sec: 10, label: "10 วินาที", note: "เนียนสุด" },
  { value: "5", sec: 5, label: "5 วินาที", note: "เนียน" },
  { value: "1", sec: 1, label: "1 วินาที", note: "ค่าตั้งต้น" },
  { value: "0.5", sec: 0.5, label: "0.5 วินาที", note: "ละเอียด" },
  { value: "0.1", sec: 0.1, label: "0.1 วินาที", note: "ละเอียดมาก" },
];
/** แพ็กเก็ตเกินนี้ไม่ให้ดูทีละเฟรมทั้งไฟล์ (TrueHD หนังสองชั่วโมงราว 8 ล้านแพ็กเก็ต ใช้แรมหลายร้อย MB) */
export const PKT_MAX = 1_500_000;
export const TIP_RES: Tip = {
  w: "แต่ละแท่งของกราฟรวมข้อมูลยาวเท่าไหร่ ใช้กับวิธีคิดต่อวินาที",
  o: [
    ["10 หรือ 5 วินาที", "แท่งละหลายวินาที กราฟเรียบ เห็นภาพรวมทั้งเรื่อง", "อ่านแนวโน้มง่าย", "ช่วงสั้น ๆ ที่บิตเรตพุ่งจะถูกเฉลี่ยจนหาย"],
    ["1 วินาที", "แบบ Bitrate Viewer เป็นค่าตั้งต้น", "", ""],
    ["0.5 หรือ 0.1 วินาที", "ซอยแท่งละเอียดขึ้น เห็นจังหวะที่บิตเรตกระโดด", "เห็นรายละเอียด", "ค่าแกว่งขึ้นลงมากกว่า สูงสุดสูงขึ้นและต่ำสุดต่ำลง"],
    ["ทีละเฟรม", "แท่งละหนึ่งเฟรม ยาวเท่าที่บอกในวงเล็บ เช่น FLAC 96 kHz เฟรมละราว 42.7 ms", "ละเอียดที่สุด", "ไฟล์ยาวต้องซูมเข้าก่อนจึงเห็นทีละแท่ง"],
    ["อัตโนมัติ", "เลือกระดับให้ตามช่วงที่ซูม ดูทั้งไฟล์ได้แท่งหยาบ ซูมเข้าแท่งละเอียดขึ้นจนถึงทีละเฟรม", "", "ค่าสูงสุดกับต่ำสุดในแผงซ้ายเปลี่ยนตามระดับที่ใช้อยู่"],
  ],
  r: "ดูภาพรวมใช้ 1 วินาที แต่ถ้าอยากเจาะช่วงสั้น ๆ ใช้อัตโนมัติแล้วซูมเข้า",
};

/* รูปแบบกราฟ (BUGS ข้อ 42 "อยากได้ตัวเลือกเปลี่ยนรูปแบบเเท่งได้") · จำค่าไว้ */
export type BarStyle = "bar" | "line" | "area" | "step" | "dot" | "led";
export const STYLES: { value: BarStyle; label: string }[] = [
  { value: "bar", label: "แท่ง" }, { value: "line", label: "เส้น" }, { value: "area", label: "พื้นทึบ" },
  { value: "step", label: "ขั้นบันได" }, { value: "dot", label: "จุด" }, { value: "led", label: "LED" },
];
export const TIP_STYLE: Tip = {
  w: "หน้าตาของกราฟบิตเรต ข้อมูลเหมือนกันทุกแบบ",
  o: [
    ["แท่ง", "แท่งละช่วง สีอ่อนคือต่ำกว่าค่าเฉลี่ยสะสม สีเข้มคือสูงกว่า สีแดงคือเกินเพดาน แบบ Bitrate Viewer", "", ""],
    ["เส้น", "ลากเส้นผ่านยอดของทุกช่วง", "เห็นการขึ้นลงต่อเนื่อง", ""],
    ["พื้นทึบ", "เส้นแบบเดียวกันแต่ระบายพื้นใต้เส้น", "", ""],
    ["ขั้นบันได", "เส้นแนวนอนเต็มความยาวช่วงแล้วหักขึ้นลงที่รอยต่อ", "บอกขอบของแต่ละช่วงตรงกว่าเส้น", ""],
    ["จุด", "จุดเดียวที่ยอดของแต่ละช่วง", "ดูกลุ่มค่าได้ง่ายตอนแท่งเยอะ", ""],
    ["LED", "แท่งตัดเป็นช่องสี่เหลี่ยมเล็กซ้อนกันแบบไฟวัดระดับเสียง", "", ""],
  ],
  r: "ส่วนที่เกินเพดานเป็นสีแดงทุกแบบ",
};

/* ชุดสีกราฟ (BUGS ข้อ 37 · พี่กันสั่ง 10 พ.ย. 2569 "ขอปุ่มเลือกสี ให้เลือกสีเดิมของ bitrate viwiwe ได้" · ข้อ 42 "อยากเลือกสีตามใจได้")
   สีตามโทนของโปรแกรม · สี Bitrate Viewer (ค่าเดียวกับหน้าแบบเดิม BitrateClassic.tsx) · กำหนดเองสีเดียว · สีวาดลงแคนวาส ตัวแปลงโทนไม่แตะ */
export type Pal = "tone" | "bv" | "custom";
export const BV_LINES = { avg: "rgb(0,160,0)", max: "rgb(150,90,30)", min: "rgb(30,60,220)" };
export const BV = { lo0: "rgb(129,127,255)", lo1: "rgb(170,127,215)", hi0: "rgb(208,138,183)", hi1: "rgb(220,127,166)", over: "rgb(254,127,138)", cum: "rgb(140,140,140)", line: "rgb(100,96,230)" };

type Src = "pkt" | "frm";
export const srcOf = (m: Mode): Src => (m === "frm" ? "frm" : "pkt");
/** ช่องที่ยังไม่มีค่าในแผงซ้าย ขีดสีเดียวกับชื่อแถว ตัวไม่หนา (พี่กันสั่ง 11 พ.ย. 2569 "สีอักษรเหมือนกับหัวข้อเจ้าของข้อมูล") */
export const NA = <span className="brn-na">–</span>;
/** partial = ffprobe จบโดยรายงานว่าผิดพลาด (ไฟล์เสียกลางทาง) · ป้ายอ่านไม่ถึงท้ายไฟล์ดูทั้งตัวนี้และ readTo เทียบความยาว (AUDIT ข้อ 118) */
export type Raw = { t: number[]; s: number[]; k: string; tmin: number; readTo: number; done: boolean; partial?: boolean };
type Entry = { info: BrInfo; raw: Partial<Record<Src, Raw>> };
/** จำผลไว้ไม่เกิน 8 ไฟล์แบบหน้าแบบเดิม · เดิมไม่จำกัด เปิดหนังหลายสิบเรื่องแรมโตไปเรื่อย ๆ (AUDIT ข้อ 120) */
export const CACHE = new Map<string, Entry>();
export const remember = (k: string, e: Entry) => { CACHE.delete(k); CACHE.set(k, e); while (CACHE.size > 8) CACHE.delete(CACHE.keys().next().value as string); };
export type Prog = { run: number; from: number; t: number[]; s: number[]; k: string; readTo: number };
export type Done = { run: number; ok: boolean; stopped?: boolean; error?: string; partial?: boolean };
export type Samples = { t0: Float64Array; t1: Float64Array; b: Float64Array; typ: string; n: number; keys: number[] };
export const kbps = (bytes: number, sec: number) => (bytes * 8) / 1000 / Math.max(sec, 0.001);

/** ตัวอย่างตามวิธีคิด (ตรรกะเดียวกับหน้าเดิม src/pages/BitratePage.tsx) */
/** ความยาวหนึ่งเฟรม (วินาที) · ไม่มีอัตราเฟรม (แทร็กเสียง) ใช้ความยาวเฉลี่ยของแพ็กเก็ตจริง */
export const frameDur = (raw: Raw | undefined, fps: number) => fps > 0 ? 1 / fps : raw && raw.t.length > 1 && raw.readTo > raw.tmin ? (raw.readTo - raw.tmin) / (raw.t.length - 1) : 1 / 25;

/** bin ความยาวแท่งของวิธีคิดต่อวินาที (วินาที) หรือ pkt ทีละเฟรม (BUGS ข้อ 42) */
export function buildSamples(raw: Raw | undefined, mode: Mode, fps: number, bin: number | "pkt" = 1): Samples {
  const empty = { t0: new Float64Array(0), t1: new Float64Array(0), b: new Float64Array(0), typ: "", n: 0, keys: [] };
  if (!raw || !raw.t.length) return empty;
  const { t, s, k, tmin } = raw;
  // ช่องวินาทีท้ายไฟล์ยาวถูกเมื่อรู้ความยาวเฟรม ค่าไม่ต่ำเกินจริง
  const fd = frameDur(raw, fps);
  const keys: number[] = [];
  for (let i = 0; i < t.length; i++) if (k[i] === "K" || k[i] === "I") keys.push(t[i] - tmin);
  if (mode === "sec" && bin === "pkt") {
    // ทีละเฟรมจากแพ็กเก็ต · วิดีโอเรียงตามลำดับถอด เวลาแสดงไม่เรียง ต้องเรียงตามเวลาก่อน (เสียงเรียงอยู่แล้ว ไม่ต้องเรียง)
    const n = t.length;
    let ord: Uint32Array | null = null;
    for (let i = 1; i < n; i++) if (t[i] < t[i - 1]) { ord = Uint32Array.from({ length: n }, (_, j) => j).sort((a, c) => t[a] - t[c]); break; }
    const t0 = new Float64Array(n), t1 = new Float64Array(n), b = new Float64Array(n);
    for (let j = 0; j < n; j++) { const i = ord ? ord[j] : j; t0[j] = t[i] - tmin; t1[j] = t0[j] + fd; b[j] = s[i]; }
    return { t0, t1, b, typ: "", n, keys };
  }
  if (mode === "sec") {
    const W = bin as number;
    const end = raw.readTo - tmin + fd;
    // จำนวนช่องนับจากช่องของเฟรมสุดท้ายจริง · ใช้ end ปัดขึ้นไม่ได้ เฟรมสุดท้าย 1.917 บวกหนึ่งเฟรม 0.0833 ได้ 2.0003 กลายเป็น 3 วินาที ช่องท้ายว่าง MIN เป็น 0 (เจอ 10 พ.ย. 2569)
    const n = Math.max(0, raw.done ? Math.floor((raw.readTo - tmin) / W) + 1 : Math.floor((raw.readTo - tmin) / W));
    const b = new Float64Array(n);
    for (let i = 0; i < t.length; i++) { const j = Math.floor((t[i] - tmin) / W); if (j >= 0 && j < n) b[j] += s[i]; }
    const t0 = new Float64Array(n), t1 = new Float64Array(n);
    for (let j = 0; j < n; j++) { t0[j] = j * W; t1[j] = raw.done ? Math.min((j + 1) * W, Math.max(end, j * W + 0.001)) : (j + 1) * W; }
    // ช่องท้ายไฟล์สั้นกว่าครึ่งช่อง รวมเข้าช่องก่อนหน้า · เศษไม่กี่แพ็กเก็ตคิดเป็นต่อวินาทีแล้วค่าเพี้ยน
    // (เจอ 10 พ.ย. 2569 แทร็กเสียง AAC เวลาเริ่มติดลบ ช่องที่ 150 ยาว 0.05 วินาที ต่ำสุดขึ้น 62 kbps ทั้งที่จริงราว 128)
    if (raw.done && n > 1 && t1[n - 1] - t0[n - 1] < W / 2) { b[n - 2] += b[n - 1]; t1[n - 2] = t1[n - 1]; return { t0: t0.subarray(0, n - 1), t1: t1.subarray(0, n - 1), b: b.subarray(0, n - 1), typ: "", n: n - 1, keys }; }
    return { t0, t1, b, typ: "", n, keys };
  }
  if (mode === "frm") {
    const n = t.length;
    const t0 = new Float64Array(n), t1 = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) { t0[i] = t[i] - tmin; t1[i] = t0[i] + fd; b[i] = s[i]; }
    return { t0, t1, b, typ: k, n, keys };
  }
  const g0: number[] = [], gb: number[] = [], gn: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (!g0.length || k[i] === "K" || k[i] === "I") { g0.push(t[i] - tmin); gb.push(0); gn.push(0); }
    const j = g0.length - 1; gb[j] += s[i]; gn[j] += 1; if (t[i] - tmin < g0[j]) g0[j] = t[i] - tmin;
  }
  let m = g0.length;
  if (!raw.done && m > 1) m -= 1;
  const st: number[] = [], sb: number[] = [];
  if (mode === "gop") { for (let j = 0; j < m; j++) { st.push(g0[j]); sb.push(gb[j]); } }
  else {
    const sorted = gn.slice(0, m).sort((a, c) => a - c); const std = sorted[Math.floor(sorted.length / 2)] || 1;
    let carryT = -1, carryB = 0, carryN = 0;
    for (let j = 0; j < m; j++) {
      const tt = carryT >= 0 ? carryT : g0[j]; const bb = carryB + gb[j]; const nn = carryN + gn[j];
      if (nn < std / 2 && j < m - 1) { carryT = tt; carryB = bb; carryN = nn; continue; }
      st.push(tt); sb.push(bb); carryT = -1; carryB = 0; carryN = 0;
    }
  }
  const n = st.length;
  const t0 = Float64Array.from(st), b = Float64Array.from(sb), t1 = new Float64Array(n);
  const end = raw.done ? raw.readTo - tmin + fd : (m < g0.length ? g0[m] : raw.readTo - tmin);
  for (let j = 0; j < n; j++) t1[j] = j + 1 < n ? t0[j + 1] : Math.max(end, t0[j] + fd);
  return { t0, t1, b, typ: "", n, keys };
}

export const niceUp = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p; return 10 * p; };
export const niceNear = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).sort((a, b) => Math.abs(Math.log(a / x)) - Math.abs(Math.log(b / x)))[0]; };
/** บิตเรตอ่านง่าย · ตั้งแต่ 1,000 kbps เป็น Mbps */
export const rate = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)} Mbps` : `${Math.round(v)} kbps`);
/** ป้ายแกน ตัวเลขอย่างเดียว หน่วยเขียนกำกับไว้หัวแกน */
export const rateAxis = (v: number, mbps: boolean) => (mbps ? `${+(v / 1000).toFixed(1)}` : `${Math.round(v)}`);
export const clock = (t: number) => { const s = Math.max(0, Math.floor(t)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
export const clockMs = (t: number) => `${clock(t)}.${String(Math.floor((Math.max(0, t) % 1) * 1000)).padStart(3, "0")}`;
/** ป้ายเวลาบนแกนตอนซูมลึก · 0:12.5 ไม่ใช่ 0:12.500 · เต็มวินาทีไม่มีจุดค้าง */
export const clockTick = (t: number) => clockMs(t).replace(/0+$/, "").replace(/\.$/, "");
export const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`);
export const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ใช้ค่าตั้งต้น */ } } };
export const recentList = (): string[] => { try { return JSON.parse(store.get("bv-recent") || "[]"); } catch { return []; } };
export const codecName = (c: string) => ({ h264: "H.264", hevc: "HEVC", av1: "AV1", mpeg2video: "MPEG-2", mpeg1video: "MPEG-1", vp9: "VP9", mpeg4: "MPEG-4",
  aac: "AAC", mp3: "MP3", flac: "FLAC", opus: "Opus", vorbis: "Vorbis", ac3: "AC-3", eac3: "E-AC-3", dts: "DTS", truehd: "TrueHD", alac: "ALAC", ape: "APE", tak: "TAK", wavpack: "WavPack" } as Record<string, string>)[c] ?? (c.startsWith("pcm") ? "PCM" : c.toUpperCase());
/** ผังลำโพงจากจำนวนช่อง */
export const chTxt = (n: number) => ({ 1: "1.0 ch", 2: "2.0 ch", 6: "5.1 ch", 8: "7.1 ch" } as Record<number, string>)[n] ?? `${n} ch`;
/** ข้อมูลที่จำไว้ของไฟล์ ไม่ว่าแทร็กไหน (ใช้ในรายการเปิดล่าสุด) */
export const infoOf = (p: string) => { for (const [k, e] of CACHE) if (k.startsWith(p + "#")) return e.info; return undefined; };
export const audioIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></svg>;
export const fmtName = (f: string) => ({ matroska: "MKV", mov: "MP4", mpegts: "TS", mpeg: "MPEG-PS", avi: "AVI", webm: "WebM" } as Record<string, string>)[f] ?? f.toUpperCase();
/** แบบภาพ progressive หรือ interlaced จากค่า field_order ของ ffprobe */
export const scanTxt = (f: string) => (!f || f === "unknown" ? "" : f === "progressive" ? "Progressive" : `Interlaced (${f === "tt" || f === "tb" ? "TFF" : "BFF"})`);
/** มาตรฐานสี กับบอก HDR จากการแปลงแสง (smpte2084 = HDR10 PQ · arib-std-b67 = HLG)
    ไฟล์ไม่บอกเลยคืนข้อความว่าง แผงขึ้นขีดแทนคำว่า ไม่ระบุ (AUDIT ข้อ 121 · กฎ CLAUDE.md ช่องที่ไม่มีค่าขึ้นขีด) */
export const colorTxt = (i: BrInfo) => {
  const p = i.primaries && i.primaries !== "unknown" ? i.primaries.replace(/^bt/, "BT.") : "";
  const hdr = i.transfer === "smpte2084" ? "HDR10 (PQ)" : i.transfer === "arib-std-b67" ? "HLG" : "";
  return [p, hdr || (p ? "SDR" : "")].filter(Boolean).join(" ");
};
/** อ่านสีจากตัวแปรของโทนที่ใช้อยู่ */
export const cssv = (n: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
export const alpha = (c: string, a: number) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;