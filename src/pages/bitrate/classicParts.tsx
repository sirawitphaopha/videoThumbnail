/* หน้าบิตเรตแบบเดิม (แบบ Bitrate Viewer) ส่วนกลาง · สีของตัวจริง วิธีคิดต่อเฟรม ตัวเก็บผล ตัวคิดค่าต่อช่วง ตัวจัดรูปตัวเลข คำอธิบายเมนู สไตล์ปุ่มกับเมนู
   แยกจาก BitrateClassic.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 3.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { type BrInfo } from "../../lib/api";

export const C = {
  win: "rgb(240,240,240)", plot: "rgb(255,255,255)", frame: "rgb(160,160,160)",
  purpleLo: "rgb(129,127,255)", purpleHi: "rgb(170,127,215)", pinkHi: "rgb(220,127,166)", pinkLo: "rgb(208,138,183)", over: "rgb(254,127,138)",
  red: "rgb(230,30,30)", mid: "rgb(0,0,0)", grid: "rgb(190,190,190)", avg: "rgb(140,140,140)", cursor: "rgb(0,0,0)",
  head1: "rgb(140,146,255)", head2: "rgb(205,208,255)", text: "rgb(0,0,0)", sample: "rgb(0,128,0)", key: "rgb(40,40,120)",
  lineAvg: "rgb(0,160,0)", lineMax: "rgb(150,90,30)", lineMin: "rgb(30,60,220)", sel: "rgba(255,170,0,0.22)", selEdge: "rgb(230,140,0)", zoom: "rgb(255,150,0)",
};
export const FONT = `"Segoe UI", Tahoma, sans-serif`;

export type Mode = "sec" | "gop" | "gopx" | "frm";
export const MODES: { id: Mode; label: string; key: string; badge: string; letter: string }[] = [
  { id: "sec", label: "Second based", key: "Ctrl+S", badge: "SEC", letter: "S" },
  { id: "gop", label: "GOP based", key: "Ctrl+G", badge: "GOP", letter: "G" },
  { id: "gopx", label: "GOP enhanced", key: "Ctrl+X", badge: "GOP X", letter: "X" },
  { id: "frm", label: "Frame based", key: "Ctrl+F", badge: "FRAME", letter: "F" },
];
type Src = "pkt" | "frm";
export const srcOf = (m: Mode): Src => (m === "frm" ? "frm" : "pkt");

/** ผลที่อ่านจากไฟล์ เรียงตามลำดับในไฟล์ · k เป็นชนิดต่อเฟรม K _ (แพ็กเก็ต) หรือ I P B ? (ถอดภาพ) */
export type Raw = { t: number[]; s: number[]; k: string; tmin: number; readTo: number; done: boolean; partial?: boolean };
type Entry = { info: BrInfo; raw: Partial<Record<Src, Raw>> };
/** จำผลไว้ตลอดที่โปรแกรมเปิด ไม่เกิน 8 ไฟล์ (ตัวจริงเรียก Bitrate Viewer Cache) */
export const CACHE = new Map<string, Entry>();
export const remember = (p: string, e: Entry) => { CACHE.delete(p); CACHE.set(p, e); while (CACHE.size > 8) CACHE.delete(CACHE.keys().next().value as string); };

export type Prog = { run: number; from: number; t: number[]; s: number[]; k: string; readTo: number };
export type Done = { run: number; ok: boolean; stopped?: boolean; error?: string; frames?: number; partial?: boolean };

/** ตัวอย่างหนึ่งช่องของวิธีคิดที่เลือก · เวลาเป็นวินาทีนับจากต้นไฟล์ */
export type Samples = { t0: Float64Array; t1: Float64Array; b: Float64Array; typ: string; n: number; keys: number[] };
export const kbps = (bytes: number, sec: number) => (bytes * 8) / 1000 / Math.max(sec, 0.001);

export function buildSamples(raw: Raw | undefined, mode: Mode, fps: number): Samples {
  const empty = { t0: new Float64Array(0), t1: new Float64Array(0), b: new Float64Array(0), typ: "", n: 0, keys: [] };
  if (!raw || !raw.t.length) return empty;
  const { t, s, k, tmin } = raw;
  // ไม่มีอัตราเฟรม (แทร็กเสียง) ใช้ความยาวเฉลี่ยของแพ็กเก็ตจริง
  const fd = fps > 0 ? 1 / fps : t.length > 1 && raw.readTo > tmin ? (raw.readTo - tmin) / (t.length - 1) : 1 / 25;
  const keys: number[] = [];
  for (let i = 0; i < t.length; i++) if (k[i] === "K" || k[i] === "I") keys.push(t[i] - tmin);
  if (mode === "sec") {
    // นับช่องถึงเฟรมสุดท้ายจริง ไม่ใช่ความยาวที่คอนเทนเนอร์บอก (เสียงยาวกว่าภาพ ช่องท้ายว่าง MIN เป็น 0)
    const end = raw.readTo - tmin + fd;
    // จำนวนวินาทีนับจากวินาทีของเฟรมสุดท้ายจริง · ใช้ end ปัดขึ้นไม่ได้ เฟรมสุดท้าย 1.917 บวกหนึ่งเฟรม 0.0833 ได้ 2.0003 กลายเป็น 3 วินาที ช่องท้ายว่าง MIN เป็น 0 (เจอ 10 พ.ย. 2569)
    const n = Math.max(0, raw.done ? Math.floor(raw.readTo - tmin) + 1 : Math.floor(raw.readTo - tmin));
    const b = new Float64Array(n);
    for (let i = 0; i < t.length; i++) { const j = Math.floor(t[i] - tmin); if (j >= 0 && j < n) b[j] += s[i]; }
    const t0 = new Float64Array(n), t1 = new Float64Array(n);
    for (let j = 0; j < n; j++) { t0[j] = j; t1[j] = raw.done ? Math.min(j + 1, Math.max(end, j + 0.001)) : j + 1; }
    // ช่องท้ายไฟล์สั้นกว่าครึ่งวินาที รวมเข้าช่องก่อนหน้า ค่าไม่ต่ำเกินจริง (เจอ 10 พ.ย. 2569 กับแทร็กเสียง AAC)
    if (raw.done && n > 1 && t1[n - 1] - t0[n - 1] < 0.5) { b[n - 2] += b[n - 1]; t1[n - 2] = t1[n - 1]; return { t0: t0.subarray(0, n - 1), t1: t1.subarray(0, n - 1), b: b.subarray(0, n - 1), typ: "", n: n - 1, keys }; }
    return { t0, t1, b, typ: "", n, keys };
  }
  if (mode === "frm") {
    const n = t.length;
    const t0 = new Float64Array(n), t1 = new Float64Array(n), b = new Float64Array(n);
    for (let i = 0; i < n; i++) { t0[i] = t[i] - tmin; t1[i] = t0[i] + fd; b[i] = s[i]; }
    return { t0, t1, b, typ: k, n, keys };
  }
  // GOP เรียงตามลำดับถอด เริ่มกลุ่มใหม่ที่คีย์เฟรม · เวลาเริ่มของกลุ่มคือเวลาแสดงที่น้อยที่สุดในกลุ่ม
  const g0: number[] = [], gb: number[] = [], gn: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (!g0.length || k[i] === "K" || k[i] === "I") { g0.push(t[i] - tmin); gb.push(0); gn.push(0); }
    const j = g0.length - 1; gb[j] += s[i]; gn[j] += 1; if (t[i] - tmin < g0[j]) g0[j] = t[i] - tmin;
  }
  let m = g0.length;
  if (!raw.done && m > 1) m -= 1; // กลุ่มสุดท้ายยังอ่านไม่ครบ
  const st: number[] = [], sb: number[] = [];
  if (mode === "gop") { for (let j = 0; j < m; j++) { st.push(g0[j]); sb.push(gb[j]); } }
  else {
    // GOP แบบถ่วง กลุ่มที่สั้นกว่าครึ่งของขนาดมาตรฐาน (ค่ากลาง) ย้ายไปรวมกับรอบถัดไป
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

/** 1 2 5 คูณสิบยกกำลัง ที่ไม่น้อยกว่า x */
export const niceUp = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p; return 10 * p; };
/** 1 2 5 คูณสิบยกกำลัง ที่ใกล้ x ที่สุดแบบล็อก */
export const niceNear = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).sort((a, b) => Math.abs(Math.log(a / x)) - Math.abs(Math.log(b / x)))[0]; };
export const hms = (t: number) => { const ms = Math.max(0, Math.round(t * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms % 1000).padStart(3, "0")}`; };
export const kb = (v: number) => `${Math.round(v)} kbps`;
export const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ก็ใช้ค่าตั้งต้น */ } } };
export const recentList = (): string[] => { try { return JSON.parse(store.get("bv-recent") || "[]"); } catch { return []; } };

/** คำอธิบายแถวเมนู ขึ้นในแถบท้ายเมนูตอนชี้หรือเลื่อนโฟกัสมาที่แถว · ชื่อแถวคงภาษาอังกฤษตามต้นฉบับ (BUGS ข้อ 36)
    เว้นวรรคสองช่องคือรอยต่อประโยค ตัวแสดงข้อความตัดบรรทัดตามประโยค */
export const DESC: Record<string, string> = {
  recent: "เปิดไฟล์นี้อีกครั้ง  ไฟล์ที่อ่านแล้วในรอบนี้ขึ้นทันที ไม่ต้องอ่านใหม่",
  stream: "ดูบิตเรตของแทร็กนี้ ไฟล์ที่มีหลายแทร็กดูได้ทีละแทร็ก",
  sec: "คิดบิตเรตเป็น kbps จากข้อมูลทีละหนึ่งวินาที  ดูภาพรวมทั้งไฟล์ได้ง่ายที่สุด และเป็นวิธีตั้งต้น",
  gop: "รวมทีละ GOP ซึ่งคือกลุ่มภาพตั้งแต่คีย์เฟรมหนึ่งถึงก่อนคีย์เฟรมถัดไป  ใช้ดูว่าตัวเข้ารหัสแบ่งข้อมูลให้แต่ละช่วงภาพอย่างไร",
  gopx: "คิดแบบเดียวกับ GOP based  แต่ GOP ที่สั้นกว่าครึ่งของปกติจะรวมเข้ากับ GOP ถัดไป  กราฟจึงไม่มีแท่งโดดจาก GOP สั้น ๆ",
  frm: "แสดงขนาดของทีละเฟรม และบอกชนิดเฟรม I P B ตรงเคอร์เซอร์  ต้องถอดภาพทั้งไฟล์ ครั้งแรกจึงอ่านนานกว่าวิธีอื่น",
  recalc: "อ่านไฟล์นี้ใหม่ตั้งแต่ต้น ใช้เมื่อไฟล์ถูกแก้ไขหรือผลที่อ่านไว้ไม่ครบ",
  load: "เลือกไฟล์วิดีโอหรือไฟล์เสียงมาดูบิตเรต  ลากไฟล์มาวางบนกราฟก็ได้",
  stop: "หยุดอ่านไฟล์ กราฟส่วนที่อ่านได้แล้วยังอยู่",
  scale: "ติ๊กไว้ สเกลแนวตั้งคงที่ โดยเส้น Max อยู่ราวสองเท่าของบิตเรตเฉลี่ย  เอาติ๊กออกแล้วสเกลปรับตามแท่งสูงสุดที่เห็น  ดับเบิลคลิกบนกราฟก็สลับได้",
  fixed: "ติ๊กไว้ แท่งเป็นสีทึบ  เอาติ๊กออกแล้วไล่สี  Shift+คลิกขวาบนกราฟก็สลับได้  ตอนลากเลือกข้อความไว้ Ctrl+C จะคัดลอกข้อความแทน",
  heads: "หัวกล่องทางขวาตั้งแต่ Total Time ถึง Cursor จะไล่สีจากซ้ายไปขวา  เอาติ๊กออกแล้วเป็นสีทึบ",
  gaps: "เว้นช่องบาง ๆ ระหว่างแท่งเมื่อแท่งกว้างพอ เห็นแต่ละช่วงแยกกัน  เอาติ๊กออกแล้วแท่งติดกันแบบต้นฉบับ",
  avg: "เส้นสีเขียวที่ระดับบิตเรตเฉลี่ยของทั้งไฟล์  กด Ctrl ค้างแล้วคลิกบนกราฟก็เปิดปิดได้",
  max: "เส้นสีน้ำตาลที่ระดับบิตเรตสูงสุด (Peak) ของทั้งไฟล์  กด Shift ค้างแล้วคลิกบนกราฟก็เปิดปิดได้",
  min: "เส้นสีน้ำเงินที่ระดับบิตเรตต่ำสุด  กด Alt ค้างแล้วคลิกบนกราฟก็เปิดปิดได้",
  track: "เส้นเคอร์เซอร์กับค่าในกล่อง Cursor จะวิ่งตามเมาส์  เอาติ๊กออกแล้วเคอร์เซอร์ค้างอยู่ที่ตำแหน่งล่าสุด",
  cursor: "แสดงเส้นตั้งสีดำตรงตำแหน่งเคอร์เซอร์บนกราฟ",
  zoomout: "ถอยออกจากการซูมหนึ่งชั้น  ซูมเข้าได้โดยลากเลือกช่วงแล้วคลิกขวา หรือหมุนล้อลง",
  reset: "กลับไปดูทั้งไฟล์ในครั้งเดียว ไม่ว่าจะซูมซ้อนไว้กี่ชั้น",
};
export const DESC_IDLE = "ชี้แถวในเมนูเพื่ออ่านว่าแต่ละคำสั่งทำอะไร";
export const btn: React.CSSProperties = { width: 96, height: 30, flex: "none", borderRadius: 2, color: "rgb(0,0,0)", fontFamily: FONT, fontSize: 13 };
export const mi = (off?: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", padding: "3px 12px 3px 6px", fontFamily: FONT, fontSize: 12.5, color: off ? "rgb(150,150,150)" : "rgb(0,0,0)", cursor: off ? "default" : "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
export const hr: React.CSSProperties = { height: 1, background: "rgb(200,200,200)", margin: "3px 6px" };
export const sep: React.CSSProperties = { padding: "3px 12px 3px 28px", color: "rgb(90,90,90)", fontSize: 11.5 };