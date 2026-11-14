/* หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer
   พี่กันสั่ง 9 พ.ย. 2569 "สร้าง bitrate viewer จากรูปที่ให้ไป UI UX เหมือนกันขึ้นมาเลย เอาใส่สักหน้านึงในโปรแกรมก่อน ค่อยย้าย"
   · "ตอนที่มันรัน มันจะค่อย ๆ อ่านจากซ้ายมาขวานะ" · "ระบบอ่าน bitrate แปลงจาก ffmpeg เลย"
   10 พ.ย. 2569 หลังแกะตัวจริงรุ่น 2.3 พี่กันสั่ง "แปลงระบบการรันบิตเรต ตามเขาเลย และ UXUI ก็เอาตามเขา" · "เอามาให้หมด ปรับเป็นของเรา"
   ทำตามคู่มือของตัวจริง (vendor/bitrate-viewer/แกะ/)
   - วิธีคิด 4 แบบ ต่อวินาที Ctrl+S · ต่อ GOP Ctrl+G · GOP แบบถ่วง Ctrl+X · ต่อเฟรม Ctrl+F · ป้ายวิธีอยู่ใต้ชนิดไฟล์ทางซ้าย
   - จำผลของไฟล์ที่อ่านแล้ว สลับวิธีไม่ต้องอ่านใหม่ · F5 อ่านใหม่ · ต่อเฟรมต้องถอดภาพเอาชนิดเฟรม จึงอ่านอีกรอบครั้งแรก
   - ซูม ลากเลือกช่วงแล้วคลิกขวาเข้าไป ซ้อนได้ · ล้อขึ้นถอยออกหนึ่งชั้น ล้อลงซูมเข้าครึ่งหนึ่งตรงเมาส์ · คลิกซ้ายยกเลิกช่วงที่เลือก
   - Ctrl+คลิก เส้นค่าเฉลี่ยสีเขียว · Shift+คลิก เส้นค่าสูงสุดสีน้ำตาล · Alt+คลิก เส้นค่าต่ำสุดสีน้ำเงิน · สามปุ่มพร้อมกันสลับทั้งสามเส้น
   - Shift+คลิกขวา สลับสีไล่โทน · Ctrl+คลิกขวา หยุดหรือให้เคอร์เซอร์ตามเมาส์ · Alt+คลิกขวา ซ่อนเส้นเคอร์เซอร์ · ดับเบิลคลิก ปรับสเกลตามข้อมูล
   - ขีดล่างสีแดงตรงจุดสูงสุด สีดำตรงจุดต่ำสุด · เมาส์อยู่แถบบนของกราฟ ขึ้นขีดทุก 5% ของความกว้าง
   - ต่อเฟรม ชนิดเฟรมขึ้นข้างเวลาเคอร์เซอร์ กดแล้วกระโดดไป I เฟรมถัดไป Ctrl+กด ย้อนไป I เฟรมก่อน
   - Ctrl+Alt+Shift+คลิกขวา ซูมให้หนึ่งช่องเท่าหนึ่งจุดภาพตรงตำแหน่งที่คลิก (คู่มือตัวจริง "Enter zoom at 1 sample/display unit at current position")
   ปรับเป็นของเรา · เส้นแดง Max คิดจากบิตเรตเฉลี่ยของไฟล์ ไม่ตายตัว 10,000 kbps แบบแผ่น DVD (ไฟล์ HEVC บิตเรตต่ำกว่านั้นมาก)
   · เว้นช่องระหว่างแท่งเมื่อแท่งกว้างพอ ปิดได้ในเมนู Separate bars (พี่กันสั่ง 10 พ.ย. 2569 "ต้นฉบับ เราขอเเบ่งเเท่งตามวิด้วยหน่อย" BUGS ข้อ 44)
   · ทุกแถวเมนูมีคำอธิบายภาษาไทยในแถบท้ายเมนู (พี่กันสั่ง 10 พ.ย. 2569 "อยากให้มีคำอธิบายทุกฟังชั่นด้วย" BUGS ข้อ 36)
   สีวัดจากภาพหน้าจอตัวจริง · สีเป็นเนื้อหา ไม่เปลี่ยนตามโทน · สีที่วาดและ inline อยู่ในไฟล์นี้ รากของหน้าติด data-keepcolor ตัวแปลงโทนไม่แตะ
   สีของปุ่มกับเมนูอยู่ styles/bitrate-classic.css เขียนด้วย hsl() (แท็ก style ที่สร้างตอนรันโดนกติกาความปลอดภัยของตัวจริงกัน AUDIT ข้อ 27) */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../lib/pageActive";
import { listen } from "@tauri-apps/api/event";
import { bitrateApi, inApp, pickFile, type BrInfo, type BrTrack } from "../lib/api";
import { useClickOutside, useEscClose } from "../lib/popup";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../lib/popupFit";
import { FixedTime, Phr } from "../components/ui";
import "../styles/bitrate-classic.css";

const C = {
  win: "rgb(240,240,240)", plot: "rgb(255,255,255)", frame: "rgb(160,160,160)",
  purpleLo: "rgb(129,127,255)", purpleHi: "rgb(170,127,215)", pinkHi: "rgb(220,127,166)", pinkLo: "rgb(208,138,183)", over: "rgb(254,127,138)",
  red: "rgb(230,30,30)", mid: "rgb(0,0,0)", grid: "rgb(190,190,190)", avg: "rgb(140,140,140)", cursor: "rgb(0,0,0)",
  head1: "rgb(140,146,255)", head2: "rgb(205,208,255)", text: "rgb(0,0,0)", sample: "rgb(0,128,0)", key: "rgb(40,40,120)",
  lineAvg: "rgb(0,160,0)", lineMax: "rgb(150,90,30)", lineMin: "rgb(30,60,220)", sel: "rgba(255,170,0,0.22)", selEdge: "rgb(230,140,0)", zoom: "rgb(255,150,0)",
};
const FONT = `"Segoe UI", Tahoma, sans-serif`;

type Mode = "sec" | "gop" | "gopx" | "frm";
const MODES: { id: Mode; label: string; key: string; badge: string; letter: string }[] = [
  { id: "sec", label: "Second based", key: "Ctrl+S", badge: "SEC", letter: "S" },
  { id: "gop", label: "GOP based", key: "Ctrl+G", badge: "GOP", letter: "G" },
  { id: "gopx", label: "GOP enhanced", key: "Ctrl+X", badge: "GOP X", letter: "X" },
  { id: "frm", label: "Frame based", key: "Ctrl+F", badge: "FRAME", letter: "F" },
];
type Src = "pkt" | "frm";
const srcOf = (m: Mode): Src => (m === "frm" ? "frm" : "pkt");

/** ผลที่อ่านจากไฟล์ เรียงตามลำดับในไฟล์ · k เป็นชนิดต่อเฟรม K _ (แพ็กเก็ต) หรือ I P B ? (ถอดภาพ) */
type Raw = { t: number[]; s: number[]; k: string; tmin: number; readTo: number; done: boolean; partial?: boolean };
type Entry = { info: BrInfo; raw: Partial<Record<Src, Raw>> };
/** จำผลไว้ตลอดที่โปรแกรมเปิด ไม่เกิน 8 ไฟล์ (ตัวจริงเรียก Bitrate Viewer Cache) */
const CACHE = new Map<string, Entry>();
const remember = (p: string, e: Entry) => { CACHE.delete(p); CACHE.set(p, e); while (CACHE.size > 8) CACHE.delete(CACHE.keys().next().value as string); };

type Prog = { run: number; from: number; t: number[]; s: number[]; k: string; readTo: number };
type Done = { run: number; ok: boolean; stopped?: boolean; error?: string; frames?: number; partial?: boolean };

/** ตัวอย่างหนึ่งช่องของวิธีคิดที่เลือก · เวลาเป็นวินาทีนับจากต้นไฟล์ */
type Samples = { t0: Float64Array; t1: Float64Array; b: Float64Array; typ: string; n: number; keys: number[] };
const kbps = (bytes: number, sec: number) => (bytes * 8) / 1000 / Math.max(sec, 0.001);

function buildSamples(raw: Raw | undefined, mode: Mode, fps: number): Samples {
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
const niceUp = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p; return 10 * p; };
/** 1 2 5 คูณสิบยกกำลัง ที่ใกล้ x ที่สุดแบบล็อก */
const niceNear = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).sort((a, b) => Math.abs(Math.log(a / x)) - Math.abs(Math.log(b / x)))[0]; };
const hms = (t: number) => { const ms = Math.max(0, Math.round(t * 1000)); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(ms % 1000).padStart(3, "0")}`; };
const kb = (v: number) => `${Math.round(v)} kbps`;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ก็ใช้ค่าตั้งต้น */ } } };
const recentList = (): string[] => { try { return JSON.parse(store.get("bv-recent") || "[]"); } catch { return []; } };

/** คำอธิบายแถวเมนู ขึ้นในแถบท้ายเมนูตอนชี้หรือเลื่อนโฟกัสมาที่แถว · ชื่อแถวคงภาษาอังกฤษตามต้นฉบับ (BUGS ข้อ 36)
    เว้นวรรคสองช่องคือรอยต่อประโยค ตัวแสดงข้อความตัดบรรทัดตามประโยค */
const DESC: Record<string, string> = {
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
const DESC_IDLE = "ชี้แถวในเมนูเพื่ออ่านว่าแต่ละคำสั่งทำอะไร";

/** แบบเดิม หน้าตาแบบโปรแกรม Bitrate Viewer · onModern สลับไปแบบชั้นหนัง ไฟล์ที่เปิดอยู่ตามไปด้วย */
export default function BitrateClassic({ initialPath = null, initialTrack = null, onConsumed, onCurrent }: { initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void; onCurrent?: (path: string | null, track: string | null) => void } = {}) {
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<BrInfo | null>(null);
  const [modeSel, setModeState] = useState<Mode>(() => (MODES.some((m) => m.id === store.get("bv-mode")) ? store.get("bv-mode") as Mode : "sec"));
  /** แทร็กเสียงคิดได้แบบต่อวินาทีอย่างเดียว (ไม่มีคีย์เฟรมกับชนิดเฟรม) · ค่าที่เลือกไว้ยังจำอยู่ */
  const audio = info?.kind === "audio";
  const mode: Mode = audio ? "sec" : modeSel;
  /** แทร็กที่อ่านอยู่ (v a0 a1 …) · รายชื่อแทร็กที่ให้เลือกก่อนเปิด (ชื่อ track ใช้กับติดตามเมาส์แล้ว) */
  const [stream, setStream] = useState("");
  const [choose, setChoose] = useState<{ path: string; tracks: BrTrack[] } | null>(null);
  const askRef = useRef(0);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [ver, setVer] = useState(0);
  const [cur, setCur] = useState<number | null>(null);
  const [track, setTrack] = useState(true);
  const [showCur, setShowCur] = useState(true);
  const [auto, setAuto] = useState(false);
  const [grad, setGrad] = useState(true);
  const [gradHead, setGradHead] = useState(true);
  /** เว้นช่องระหว่างแท่ง ค่าตั้งต้นเปิด จำค่าไว้ (BUGS ข้อ 44) */
  const [gaps, setGapsState] = useState(() => store.get("bv-gaps") !== "0");
  const toggleGaps = () => setGapsState((v) => { store.set("bv-gaps", v ? "0" : "1"); return !v; });
  /** คำอธิบายของแถวเมนูที่ชี้อยู่ · why คือเหตุผลที่แถวนั้นกดไม่ได้ */
  const [desc, setDesc] = useState<{ d: string; why?: string } | null>(null);
  const [marks, setMarks] = useState({ avg: false, max: false, min: false });
  const [zoom, setZoom] = useState<[number, number][]>([]);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [topBand, setTopBand] = useState(false);
  const [menu, setMenu] = useState(false);
  const [recent, setRecent] = useState<string[]>(recentList);
  const raw = useRef<Raw | undefined>(undefined);
  const run = useRef(0);
  /** ตัวฟังเหตุการณ์พร้อมแล้ว · เริ่มอ่านหลังจากนี้ ข้อมูลก้อนแรกไม่หลุด */
  const ready = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ x: number; t: number; moved: boolean } | null>(null);
  /** กระโดดไป I เฟรมแล้ว เคอร์เซอร์ค้างไว้จนกว่าเมาส์จะขยับในกราฟอีกครั้ง */
  const hold = useRef(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(menu, menuWrap, menuPanel);
  const side = useSideFit(menu, menuWrap, menuPanel, "left");
  useEscClose(menu, () => setMenu(false));
  useEffect(() => { if (!menu) setDesc(null); }, [menu]);
  // บอกไฟล์กับแทร็กที่เปิดอยู่ให้แถบปุ่มคู่ด้านบน กดแบบชั้นหนังแล้วตามไปด้วย (BUGS ข้อ 83 85)
  useEffect(() => { onCurrent?.(path, info?.track ?? (stream || null)); }, [path, info, stream]); // eslint-disable-line react-hooks/exhaustive-deps
  /** ดรอปดาวน์เลือกแทร็กข้างปุ่มแบบชั้นหนัง (BUGS ข้อ 83 · เดิมเลือกได้ในเมนูอย่างเดียว) */
  const [trkOpen, setTrkOpen] = useState(false);
  const trkWrap = useRef<HTMLDivElement>(null), trkPanel = useRef<HTMLDivElement>(null);
  const trkPlace = useDropPlacement(trkOpen, trkWrap, trkPanel);
  const trkSide = useSideFit(trkOpen, trkWrap, trkPanel, "right");
  useEscClose(trkOpen, () => setTrkOpen(false));
  const closeTrk = useCallback(() => setTrkOpen(false), []);
  useClickOutside(trkOpen, trkWrap, closeTrk);
  /** กล่องคำอธิบายวางชิดขวาของเมนู · เมนูกว้างตามชื่อไฟล์ล่าสุดที่ยาวสุด จึงวัดจริงตอนกาง */
  const [descLeft, setDescLeft] = useState(266);
  useLayoutEffect(() => { if (menu && menuPanel.current) setDescLeft(menuPanel.current.offsetWidth + 6); }, [menu, recent, info]);
  const closeMenu = useCallback(() => setMenu(false), []);
  useClickOutside(menu, menuWrap, closeMenu);
  const [box, setBox] = useState({ w: 600, h: 300 });

  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(50, el.clientWidth), h: Math.max(50, el.clientHeight) }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!inApp) return;
    let live = true; const offs: (() => void)[] = [];
    const a = listen<Prog>("bitrate-progress", (e) => {
      const p = e.payload, r = raw.current; if (p.run !== run.current || !r) return;
      if (p.from !== r.t.length) { r.t.length = p.from; r.s.length = p.from; r.k = r.k.slice(0, p.from); }
      for (let i = 0; i < p.t.length; i++) { r.t.push(p.t[i]); r.s.push(p.s[i]); if (p.t[i] < r.tmin) r.tmin = p.t[i]; }
      r.k += p.k; r.readTo = p.readTo; setVer((v) => v + 1);
    });
    a.then((u) => (live ? offs.push(u) : u()));
    const b = listen<Done>("bitrate-done", (e) => {
      const d = e.payload; if (d.run !== run.current) return;
      if (raw.current) { raw.current.done = d.ok; raw.current.partial = !!d.partial; }
      setRunning(false); if (d.error) setErr(d.error); setVer((v) => v + 1);
    });
    b.then((u) => (live ? offs.push(u) : u()));
    ready.current = Promise.all([a, b]).then(() => undefined, () => undefined);
    return () => { live = false; offs.forEach((f) => f()); bitrateApi.stop().catch(() => {}); };
  }, []);

  /** เปิดไฟล์ด้วยวิธีที่เลือก · มีผลจำไว้แล้วใช้ทันที ไม่อ่านใหม่ · force อ่านใหม่ (F5) */
  const open = useCallback(async (p: string, m: Mode, force = false, trk?: string) => {
    const src = srcOf(m);
    let tk = trk ?? (p === path ? stream : "");
    setErr(""); setSel(null);
    if (p !== path || tk !== stream) { setZoom([]); setCur(null); }
    setPath(p);
    // ไฟล์เดียวกันเขียน / กับ  หรือตัวพิมพ์ต่างกัน ถือเป็นไฟล์เดียว ไม่ขึ้นซ้ำ (เจอ 10 พ.ย. 2569)
    const same = (a: string) => a.replace(/\//g, "\\").toLowerCase();
    const list = [p, ...recentList().filter((x) => same(x) !== same(p))].slice(0, 8); store.set("bv-recent", JSON.stringify(list)); setRecent(list);
    // ยังไม่รู้แทร็ก ถามรายชื่อก่อน · มีมากกว่าหนึ่งให้เลือกกลางกราฟ (พี่กันสั่ง 10 พ.ย. 2569)
    const ask = ++askRef.current;
    if (!tk) {
      await bitrateApi.stop().catch(() => {}); run.current = -1; raw.current = undefined; setRunning(false); setInfo(null); setChoose(null); setVer((v) => v + 1);
      let list: BrTrack[] = [];
      try { list = await bitrateApi.tracks(p); } catch (e) { if (ask === askRef.current) setErr(String(e)); return; }
      if (ask !== askRef.current) return;
      if (list.length > 1) { setChoose({ path: p, tracks: list }); return; }
      tk = list[0]?.id ?? "auto";
    }
    setChoose(null); setStream(tk);
    const key = p + "#" + tk;
    const hit = CACHE.get(key);
    if (!force && hit?.raw[src]?.done) {
      await bitrateApi.stop().catch(() => {}); run.current = -1;
      raw.current = hit.raw[src]; setInfo(hit.info); setRunning(false); setVer((v) => v + 1); return;
    }
    const r: Raw = { t: [], s: [], k: "", tmin: Infinity, readTo: 0, done: false };
    raw.current = r; run.current = -1; setRunning(true); if (!hit) setInfo(null); setVer((v) => v + 1);
    // เลขรอบตั้งก่อนเรียก ข้อมูลก้อนแรกที่มาถึงก่อนคำสั่งตอบกลับจะไม่ถูกทิ้ง
    const id = bitrateApi.nextRun(); run.current = id;
    try {
      await ready.current;
      const i = await bitrateApi.start(p, src, id, tk);
      if (raw.current !== r) return;
      setInfo(i);
      const e = CACHE.get(key) ?? { info: i, raw: {} }; e.info = i; e.raw[src] = r; remember(key, e);
    } catch (e) { if (raw.current === r) { setRunning(false); setErr(String(e)); } }
  }, [path, stream]);

  const setMode = (m: Mode) => { if (audio && m !== "sec") return; setModeState(m); store.set("bv-mode", m); setMenu(false); if (path) void open(path, m); };
  const load = async () => { if (running) { await bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false); return; } const p = await pickFile("media"); if (p) void open(p, modeSel); };
  const close = () => { void bitrateApi.stop().catch(() => {}); askRef.current++; run.current = -1; raw.current = undefined; setPath(null); setInfo(null); setChoose(null); setStream(""); setRunning(false); setErr(""); setCur(null); setZoom([]); setSel(null); };

  // มาจากปุ่มบิตเรตวิดีโอในแผงขวาของชั้นวาง เปิดไฟล์นั้นเลย
  useEffect(() => { if (initialPath) { void open(initialPath, modeSel, false, initialTrack ?? undefined); onConsumed?.(); } }, [initialPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ตัวตรวจเปิดไฟล์และสลับวิธีผ่านพอร์ตดีบัก แทนการลากจาก Explorer และคีย์ลัด
  useEffect(() => {
    const w = window as unknown as { __bitrateOpen?: (p: string, t?: string) => void; __bitrateMode?: (m: Mode) => void };
    w.__bitrateOpen = (p, t) => void open(p, modeSel, false, t); w.__bitrateMode = (m) => setMode(m);
  });

  // ลากไฟล์มาวาง
  const openRef = useRef(open); openRef.current = open;
  const modeRef = useRef(modeSel); modeRef.current = modeSel;
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-bitrate]")) void openRef.current(e.payload.paths[0], modeRef.current);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // คีย์ลัดแบบตัวจริง
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับปุ่มลัด (BUGS ข้อ 9)
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "F5") { e.preventDefault(); if (path) void open(path, modeSel, true); return; }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      const m = ({ s: "sec", g: "gop", x: "gopx", f: "frm" } as Record<string, Mode>)[k];
      if (m) { e.preventDefault(); setMode(m); return; }
      if (k === "a") { e.preventDefault(); setAuto((v) => !v); }
      // มีข้อความที่ลากเลือกไว้ ปล่อย Ctrl+C ให้คัดลอกตามปกติของ Windows (AUDIT ข้อ 123)
      else if (k === "c") { if (window.getSelection()?.toString()) return; e.preventDefault(); setGrad((v) => !v); }
      else if (k === "d") { e.preventDefault(); setGradHead((v) => !v); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });

  // ---------- คิดตัวอย่าง ----------
  const r = raw.current;
  const fps = info?.fps ?? 0;
  const dur = info?.duration && info.duration > 0 ? info.duration : r && r.t.length ? r.readTo - r.tmin : 0;
  const totalSec = Math.max(1, dur);
  // ระหว่างอ่าน คิดตัวอย่างใหม่ไม่เกิน 700 ms ละครั้ง อ่านจบหรือเปลี่ยนวิธีคิดใหม่ทันที (AUDIT ข้อ 119 · เดิมคิดทั้งก้อนทุก 120 ms)
  const sMemo = useRef<{ at: number; key: string; r?: Raw; S?: Samples }>({ at: 0, key: "" });
  const S = useMemo(() => {
    const m = sMemo.current, now = performance.now(), key = `${mode}|${fps}`;
    if (r && !r.done && m.r === r && m.key === key && m.S && now - m.at < 700) return m.S;
    const out = buildSamples(r, mode, fps);
    sMemo.current = { at: now, key, r, S: out };
    return out;
  }, [r, mode, fps, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => {
    let peak = 0, min = Infinity, pAt = -1, mAt = -1, sumB = 0, sumT = 0;
    const cum = new Float64Array(S.n);
    for (let i = 0; i < S.n; i++) {
      const v = kbps(S.b[i], S.t1[i] - S.t0[i]);
      if (v > peak) { peak = v; pAt = i; }
      if (v < min) { min = v; mAt = i; }
      sumB += S.b[i]; sumT += S.t1[i] - S.t0[i]; cum[i] = kbps(sumB, sumT);
    }
    return { peak, min: S.n ? min : 0, pAt, mAt, avg: sumT ? kbps(sumB, sumT) : 0, cum };
  }, [S]);
  const [z0, z1] = zoom.length ? zoom[zoom.length - 1] : [0, totalSec];
  const span = Math.max(0.001, z1 - z0);
  const est = info && info.duration > 0 && info.kind !== "audio" ? (info.size * 8) / 1000 / info.duration : 0;
  // เส้น Max ตั้งจากบิตเรตเฉลี่ยของทั้งไฟล์ ไม่ขยับระหว่างอ่าน (ปรับเป็นของเรา ตัวจริงตั้ง 10,000 kbps ตายตัว)
  const maxV = niceNear(Math.max(est || stats.avg, 1) * 2);

  // แท่งในช่วงที่เห็น · รวมหลายตัวอย่างต่อแท่งตามความกว้าง
  const maxBars = Math.max(10, Math.floor(box.w / 3));
  const vis: number[] = [];
  for (let i = 0; i < S.n; i++) if (S.t1[i] > z0 && S.t0[i] < z1) vis.push(i);
  const group = Math.max(1, Math.ceil(vis.length / maxBars));
  const bars: { v: number; avg: number; t0: number; t1: number; i0: number; i1: number }[] = [];
  for (let g = 0; g < vis.length; g += group) {
    const i0 = vis[g], i1 = vis[Math.min(vis.length, g + group) - 1];
    let b = 0; for (let i = i0; i <= i1; i++) b += S.b[i];
    bars.push({ v: kbps(b, S.t1[i1] - S.t0[i0]), avg: stats.cum[i1], t0: S.t0[i0], t1: S.t1[i1], i0, i1 });
  }
  const visPeak = bars.reduce((m, b) => Math.max(m, b.v), 0);
  const top = auto ? Math.max(1, visPeak * 1.06) : Math.max(maxV * 1.18, niceUp(stats.peak) > maxV * 1.18 ? stats.peak * 1.06 : 0);
  const yOf = (v: number) => box.h - (Math.min(v, top) / top) * box.h;
  const xOf = (t: number) => ((t - z0) / span) * box.w;
  const tOf = (x: number) => z0 + (x / box.w) * span;

  // ---------- วาด ----------
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.plot; g.fillRect(0, 0, box.w, box.h);
    const W = box.w, H = box.h;
    const hline = (v: number, color: string) => { const y = Math.round(yOf(v)) + 0.5; if (y < 0 || y > H) return; g.strokeStyle = color; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); };
    if (path) {
      // เส้นประแบ่งระดับ ทุกหนึ่งในสิบของค่าสูงสุด
      g.strokeStyle = C.grid; g.lineWidth = 1; g.setLineDash([2, 3]);
      const stepV = auto ? niceUp(top / 10) : maxV / 10;
      for (let k = 1; k * stepV < top; k++) { const v = k * stepV; if (!auto && (k === 5 || k === 10)) continue; const y = Math.round(yOf(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.setLineDash([]);
      const ym = yOf(maxV);
      const purple = grad ? g.createLinearGradient(0, H, 0, ym) : null; purple?.addColorStop(0, C.purpleLo); purple?.addColorStop(1, C.purpleHi);
      const pink = grad ? g.createLinearGradient(0, H, 0, ym) : null; pink?.addColorStop(0, C.pinkLo); pink?.addColorStop(1, C.pinkHi);
      for (const b of bars) {
        const x0 = Math.floor(xOf(b.t0)), x1 = Math.max(x0 + 1, Math.floor(xOf(b.t1)));
        // แท่งกว้างตั้งแต่ 3 จุดเว้นช่องขวา 1 จุดเป็นสีพื้นกราฟ แต่ละช่วงแยกกัน · แคบกว่านั้นติดกันเหมือนเดิม หลักเดียวกับแบบชั้นหนัง (BUGS ข้อ 43 44)
        const w = x1 - x0 - (gaps && x1 - x0 >= 3 ? 1 : 0);
        const yv = yOf(b.v), ya = yOf(Math.min(b.v, b.avg));
        g.fillStyle = purple ?? C.purpleLo; g.fillRect(x0, ya, w, H - ya);
        if (b.v > b.avg) { const yTop = Math.max(yv, Math.min(ya, ym)); g.fillStyle = pink ?? C.pinkLo; g.fillRect(x0, yTop, w, ya - yTop); }
        if (b.v > maxV) { g.fillStyle = C.over; g.fillRect(x0, yv, w, Math.min(ym, ya) - yv); }
      }
      // ค่าเฉลี่ยสะสม
      if (bars.length) {
        g.strokeStyle = C.avg; g.lineWidth = 1; g.beginPath();
        bars.forEach((b, i) => { const x = xOf((b.t0 + b.t1) / 2), y = yOf(b.avg); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke();
      }
      // เส้นกลาง เส้นสูงสุดที่ตั้ง · เส้นที่เปิดด้วยคลิกพร้อมปุ่ม
      hline(maxV / 2, C.mid); hline(maxV, C.red);
      if (S.n && marks.avg) hline(stats.avg, C.lineAvg);
      if (S.n && marks.max) hline(stats.peak, C.lineMax);
      if (S.n && marks.min) hline(stats.min, C.lineMin);
      // คีย์เฟรมเป็นขีดเล็กที่แกนล่าง เฉพาะตอนเห็นไม่เกิน 150 ขีด
      const ks = S.keys.filter((k) => k >= z0 && k <= z1);
      if (ks.length <= 150) { g.strokeStyle = C.key; for (const k of ks) { const x = Math.round(xOf(k)) + 0.5; g.beginPath(); g.moveTo(x, H); g.lineTo(x, H - 6); g.stroke(); } }
      // ขีดตำแหน่งจุดสูงสุด สีแดง จุดต่ำสุด สีดำ
      const tick = (i: number, color: string) => { if (i < 0) return; const t = (S.t0[i] + S.t1[i]) / 2; if (t < z0 || t > z1) return; const x = Math.round(xOf(t)); g.fillStyle = color; g.fillRect(x - 1, H - 10, 3, 10); };
      tick(stats.pAt, C.red); tick(stats.mAt, C.mid);
      // ขีดทุก 5% ตอนเมาส์อยู่แถบบน · ทุก 25% ยาวกว่า
      if (topBand) { g.strokeStyle = C.mid; for (let p = 5; p < 100; p += 5) { const x = Math.round((W * p) / 100) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, p % 25 ? 5 : 10); g.stroke(); } }
      // เคอร์เซอร์
      if (cur != null && showCur && cur >= z0 && cur <= z1) { const x = Math.round(xOf(cur)) + 0.5; g.strokeStyle = C.cursor; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    }
    g.strokeStyle = C.frame; g.strokeRect(0.5, 0.5, W - 1, H - 1);
  });

  // ---------- เมาส์ ----------
  const xIn = (e: React.MouseEvent) => { const rc = plotRef.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(box.w, e.clientX - rc.left)), y: e.clientY - rc.top }; };
  const sampleAt = (t: number) => { let lo = 0, hi = S.n - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S.t1[m] <= t) lo = m + 1; else if (S.t0[m] > t) hi = m - 1; else return m; } return -1; };
  const onDown = (e: React.MouseEvent) => { if (!path || e.button !== 0) return; const { x } = xIn(e); drag.current = { x, t: tOf(x), moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    if (!path) return;
    const { x, y } = xIn(e);
    setTopBand(y >= 0 && y < 14);
    if (hold.current) hold.current = false; else if (track && S.n) setCur(tOf(x));
    const d = drag.current;
    if (d && (e.buttons & 1)) { if (Math.abs(x - d.x) > 3) d.moved = true; if (d.moved) { const t = tOf(x); setSel([Math.min(d.t, t), Math.max(d.t, t)]); } }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (!path || e.button !== 0 || !d || d.moved) return;
    if (e.ctrlKey && e.shiftKey && e.altKey) { const on = !(marks.avg && marks.max && marks.min); setMarks({ avg: on, max: on, min: on }); return; }
    if (e.ctrlKey) { setMarks((m) => ({ ...m, avg: !m.avg })); return; }
    if (e.shiftKey) { setMarks((m) => ({ ...m, max: !m.max })); return; }
    if (e.altKey) { setMarks((m) => ({ ...m, min: !m.min })); return; }
    if (sel) setSel(null);
  };
  const pushZoom = (a: number, b: number) => { const lo = Math.max(0, a), hi = Math.min(totalSec, b); if (hi - lo > 0.001) setZoom((z) => [...z, [lo, hi]]); setSel(null); };
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault(); if (!path) return;
    const t = tOf(xIn(e).x);
    // หนึ่งช่องต่อหนึ่งจุดภาพ ช่วงที่เห็น = ความยาวช่องตรงนั้น × ความกว้างกราฟเป็นจุดภาพ (คู่มือตัวจริง) · ต่อวินาทีบนกราฟกว้าง 600 จุดเห็น 600 วินาที
    // ซูมละเอียดกว่านั้นอยู่แล้วหรือไฟล์สั้นกว่านั้น ไม่เพิ่มชั้นซูมที่กว้างกว่าเดิม (เดิมกดตอนซูมอยู่กลายเป็นซูมออก AUDIT ข้อ 122) · ชิดขอบไฟล์เลื่อนช่วงเข้ามา ไม่หดช่วง
    if (e.ctrlKey && e.altKey && e.shiftKey) {
      const i = sampleAt(t); const w = Math.min(totalSec, (i >= 0 ? S.t1[i] - S.t0[i] : 1) * box.w);
      if (w >= span - 0.001) return;
      const a = Math.max(0, Math.min(totalSec - w, t - w / 2)); pushZoom(a, a + w); return;
    }
    if (e.ctrlKey) { setTrack((v) => !v); return; }
    if (e.altKey) { setShowCur((v) => !v); return; }
    if (e.shiftKey) { setGrad((v) => !v); return; }
    if (sel && t >= sel[0] && t <= sel[1]) pushZoom(sel[0], sel[1]);
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!path || !S.n) return;
    if (e.deltaY < 0) { setZoom((z) => z.slice(0, -1)); return; }
    const t = tOf(xIn(e).x); const w = span / 2; pushZoom(Math.max(0, Math.min(totalSec - w, t - w / 2)), Math.max(0, Math.min(totalSec - w, t - w / 2)) + w);
  };

  // ลากแถบช่วงที่ซูม · ความกว้างช่วงเท่าเดิม เลื่อนแค่ตำแหน่ง แทนที่ระดับซูมบนสุดของกอง (BUGS ข้อ 47)
  const barRef = useRef<HTMLDivElement>(null);
  const onBarDown = (e: React.MouseEvent) => {
    if (!zoom.length || !barRef.current || e.button !== 0) return;
    e.preventDefault();
    const r = barRef.current.getBoundingClientRect(), w = span;
    const tAt = (x: number) => ((x - r.left) / r.width) * totalSec;
    const t = tAt(e.clientX), off = t >= z0 && t <= z1 ? t - z0 : w / 2;
    const move = (cx: number) => { const a = Math.max(0, Math.min(totalSec - w, tAt(cx) - off)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + w]] : z)); };
    move(e.clientX);
    const mm = (ev: MouseEvent) => move(ev.clientX);
    const mu = () => { window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); };
    window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu);
  };

  const ci = cur == null ? -1 : sampleAt(cur);
  const curBar = cur == null ? null : bars.find((b) => cur >= b.t0 && cur < b.t1) ?? null;
  const curType = mode === "frm" && ci >= 0 ? S.typ[ci] : "";
  const jumpI = (back: boolean) => {
    if (!S.n || cur == null) return;
    let i = ci < 0 ? 0 : ci;
    for (i += back ? -1 : 1; i >= 0 && i < S.n; i += back ? -1 : 1) if (S.typ[i] === "I") break;
    if (i < 0 || i >= S.n) return;
    const t = S.t0[i] + 0.0001; hold.current = true; setCur(t);
    if (t < z0 || t > z1) { const w = span; const a = Math.max(0, Math.min(totalSec - w, t - w / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + w]] : z)); }
  };

  const cutEnd = r && isFinite(r.tmin) ? r.readTo - r.tmin : 0;
  const cutAt = r?.done && info && info.duration > 0 && (r.partial || cutEnd < info.duration - Math.max(2, info.duration * 0.02)) ? cutEnd : null;
  const readPct = info && info.duration > 0 && r ? Math.min(100, Math.round(((r.readTo - (isFinite(r.tmin) ? r.tmin : 0)) / info.duration) * 100)) : 0;
  const codec = info ? (info.codec === "h264" ? "H.264" : info.codec === "hevc" ? "HEVC" : info.codec === "mpeg2video" ? "MPEG2" : info.codec === "mpeg1video" ? "MPEG1" : info.codec === "eac3" ? "E-AC3" : info.codec.startsWith("pcm") ? "PCM" : info.codec.toUpperCase()) : "";
  const fmt = info ? ({ matroska: "MKV", mov: "MP4", mpegts: "TS", mpeg: "PS", avi: "AVI", mpegvideo: "ES", webm: "WEBM" } as Record<string, string>)[info.format] ?? info.format.toUpperCase() : "";
  const md = MODES.find((m) => m.id === mode)!;
  const name = path ? path.split(/[\\/]/).pop() : "";
  const lab = (y: number): React.CSSProperties => ({ position: "absolute", right: 6, top: y, transform: "translateY(-50%)", whiteSpace: "nowrap" });
  const head: React.CSSProperties = { background: gradHead ? `linear-gradient(90deg, ${C.head1}, ${C.head2})` : C.head1, color: "rgb(255,255,255)", fontWeight: 700, textAlign: "center", padding: "2px 0" };
  const zoomPct = (span / totalSec) * 100;
  // ป้ายชนิดไฟล์กับจำนวนแทร็กวางในช่องว่างระหว่างป้ายตัวเลข ไม่ทับกัน · สเกลเปลี่ยนตามวิธีคิด ตำแหน่งตายตัวชนได้
  const axisFit = (() => {
    const ymx = yOf(maxV);
    const busy: [number, number][] = [[-999, 4], [box.h - 9, 9999]];
    if (ymx > 18) busy.push([ymx - 25, ymx + 25]);
    busy.push(auto ? [2, 18] : [yOf(maxV / 2) - 9, yOf(maxV / 2) + 9]);
    const place = (need: number) => {
      busy.sort((a, b) => a[0] - b[0]);
      let best: [number, number] | null = null;
      for (let i = 0; i + 1 < busy.length; i++) { const a = busy[i][1], b = busy[i + 1][0]; if (b - a >= need + 6 && (!best || b - a > best[1] - best[0])) best = [a, b]; }
      if (!best) return null;
      const mid = (best[0] + best[1]) / 2; busy.push([mid - need / 2 - 3, mid + need / 2 + 3]); return mid;
    };
    const a = place(54), b = place(36);
    // ป้ายชนิดไฟล์อยู่เหนือป้ายจำนวนแทร็กเสมอ แบบตัวจริง
    return a != null && b != null && a > b ? { info: b, tracks: a } : { info: a, tracks: b };
  })();
  const visCount = vis.length;

  /** แถวเมนู · d คือชื่อคำอธิบายใน DESC · off คือเหตุผลที่กดไม่ได้ (ชี้แล้วขึ้นในแถบคำอธิบาย) · ใช้ aria-disabled เพราะปุ่ม disabled ไม่รับเมาส์ ชี้แล้วอ่านเหตุผลไม่ได้ */
  const item = (label: string, key: string, onClick: () => void, opt: { d: string; on?: boolean; off?: string | false; k?: string }) => {
    const off = !!opt.off;
    // แถวที่กดไม่ได้ขึ้นเหตุผลคู่สองประโยคแรกของคำอธิบาย กล่องสูงสี่บรรทัดพอเสมอ
    const d = DESC[opt.d] ?? opt.d;
    const show = () => setDesc(off ? { d: d.split("  ").slice(0, 2).join("  "), why: opt.off as string } : { d });
    return (
      <button key={opt.k ?? label} type="button" role="menuitem" aria-disabled={off || undefined} onClick={() => { if (off) return; setMenu(false); onClick(); }} onMouseEnter={show} onFocus={show}
        className="bv-mi" style={mi(off)} data-bv-item={label}>
        <span style={{ width: 16, flex: "none" }}>{opt.on ? "✓" : ""}</span><span style={{ flex: 1, textAlign: "left" }}>{label}</span><span style={{ color: off ? "rgb(170,170,170)" : "rgb(90,90,90)" }}>{key}</span>
      </button>
    );
  };
  const noZoom = !zoom.length && "กดไม่ได้เพราะยังไม่ได้ซูม";

  return (
    <div data-bitrate data-keepcolor style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.win, color: C.text, fontFamily: FONT, fontSize: 12.5, padding: "12px 14px 12px 6px", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4, minHeight: 20 }}>
        <div ref={menuWrap} style={{ position: "relative", flex: "none" }}>
          <button type="button" aria-label="เมนู Bitrate Viewer" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)} data-bv-menu
            className="bv-btn" style={{ width: 22, height: 20, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, cursor: "pointer", padding: 0 }}>
            <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true"><rect x="1" y="6" width="2" height="5" fill={C.purpleLo} /><rect x="4" y="3" width="2" height="8" fill={C.pinkHi} /><rect x="7" y="5" width="2" height="6" fill={C.purpleLo} /><rect x="10" y="1" width="2" height="10" fill={C.over} /></svg>
          </button>
          {menu && <div ref={menuPanel} role="menu" className="pop-in" data-bv-menupanel onMouseLeave={() => setDesc(null)} style={{ position: "absolute", ...sideStyle(side, "left"), ...dropStyle(place), overflowY: "auto", zIndex: 40, minWidth: 260, background: "rgb(250,250,250)", border: "1px solid rgb(150,150,150)", boxShadow: "2px 3px 8px rgba(0,0,0,.25)", padding: "3px 0", fontSize: 12.5 }}>
            <div style={sep}>Open recent file</div>
            {recent.length ? recent.map((p) => item(p.split(/[\\/]/).pop() ?? p, "", () => void open(p, mode), { d: "recent", k: p })) : <div style={{ ...mi(true), cursor: "default" }}><span style={{ width: 16 }} />ยังไม่มีไฟล์</div>}
            <div style={hr} />
            {info && info.tracks.length > 1 && <><div style={sep}>Stream</div>
              {info.tracks.map((t) => item(t.label, "", () => path && void open(path, modeSel, false, t.id), { d: "stream", on: info.track === t.id, k: "trk" + t.id }))}
              <div style={hr} /></>}
            {MODES.map((m) => item(m.label, m.key, () => setMode(m.id), { d: m.id, on: mode === m.id, off: audio && m.id !== "sec" && "กดไม่ได้เพราะไฟล์เสียงไม่มีคีย์เฟรมกับชนิดเฟรม" }))}
            <div style={hr} />
            {item("Recalculate current file", "F5", () => path && void open(path, mode, true), { d: "recalc", off: !path && "กดไม่ได้เพราะยังไม่ได้เปิดไฟล์" })}
            {item(running ? "Stop calculation" : "Load file…", "", () => void load(), { d: running ? "stop" : "load", k: "load" })}
            <div style={hr} />
            {item("Standard scale mode", "Ctrl+A", () => setAuto((v) => !v), { d: "scale", on: !auto })}
            {item("Use fixed colors", "Ctrl+C", () => setGrad((v) => !v), { d: "fixed", on: !grad })}
            {item("Draw gradient headers", "Ctrl+D", () => setGradHead((v) => !v), { d: "heads", on: gradHead })}
            {item("Separate bars", "", toggleGaps, { d: "gaps", on: gaps })}
            <div style={hr} />
            {item("Average bitrate line", "Ctrl+Click", () => setMarks((m) => ({ ...m, avg: !m.avg })), { d: "avg", on: marks.avg })}
            {item("Maximum bitrate line", "Shift+Click", () => setMarks((m) => ({ ...m, max: !m.max })), { d: "max", on: marks.max })}
            {item("Minimum bitrate line", "Alt+Click", () => setMarks((m) => ({ ...m, min: !m.min })), { d: "min", on: marks.min })}
            {item("Track mouse position", "Ctrl+RightClick", () => setTrack((v) => !v), { d: "track", on: track })}
            {item("Show cursor line", "Alt+RightClick", () => setShowCur((v) => !v), { d: "cursor", on: showCur })}
            {item("Zoom out", "Wheel up", () => setZoom((z) => z.slice(0, -1)), { d: "zoomout", off: noZoom })}
            {item("Reset zoom", "", () => { setZoom([]); setSel(null); }, { d: "reset", off: noZoom })}
          </div>}
          {/* กล่องคำอธิบายข้างเมนูทางขวา ขอบบนตรงเมนู สูงคงที่ ชี้แถวไหนกล่องก็ไม่ยืด · เดิมวางท้ายเมนู เมนูสูงเกินจอจนต้องเลื่อน (เจอตอนตรวจ 13 พ.ย. 2569)
              เหตุผลที่กดไม่ได้ขึ้นก่อนคำอธิบาย */}
          {menu && <div className={"bv-desc" + (desc ? "" : " idle")} aria-live="polite" data-bv-desc style={{ left: descLeft, ...(place.up ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }) }}>
            {desc ? <>{desc.why && <span className="why"><Phr>{desc.why + "  "}</Phr></span>}<Phr>{desc.d}</Phr></> : DESC_IDLE}
          </div>}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={path ?? undefined} data-bv-title>Bitrate Viewer{name ? ` - ${name}` : ""}</div>
        {info && info.tracks.length > 1 && <div ref={trkWrap} style={{ position: "relative", flex: "none" }} data-bv-track>
          <button type="button" className="bv-btn" aria-haspopup="listbox" aria-expanded={trkOpen} onClick={() => setTrkOpen((v) => !v)} title="เลือกแทร็กที่จะดูบิตเรต ภาพหรือเสียง"
            style={{ height: 22, padding: "0 8px", borderRadius: 2, fontFamily: FONT, fontSize: 12.5, color: "rgb(0,0,0)", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
            {info.tracks.find((t) => t.id === info.track)?.label ?? "Stream"}<svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true"><path d="M0.5 0.5L4.5 5L8.5 0.5" fill="none" stroke="rgb(40,40,40)" strokeWidth="1.3" /></svg>
          </button>
          {trkOpen && <div ref={trkPanel} role="listbox" className="pop-in" style={{ position: "absolute", ...sideStyle(trkSide, "right"), ...dropStyle(trkPlace), overflowY: "auto", zIndex: 40, minWidth: "100%", background: "rgb(250,250,250)", border: "1px solid rgb(150,150,150)", boxShadow: "2px 3px 8px rgba(0,0,0,.25)", padding: "3px 0" }}>
            {info.tracks.map((t) => <button key={t.id} type="button" role="option" aria-selected={info.track === t.id} className="bv-mi" style={mi()} data-bv-trackopt={t.id}
              onClick={() => { setTrkOpen(false); if (path && t.id !== info.track) void open(path, modeSel, false, t.id); }}>
              <span style={{ width: 16, flex: "none" }}>{info.track === t.id ? "✓" : ""}</span><span style={{ flex: 1, textAlign: "left" }}>{t.label}</span></button>)}
          </div>}
        </div>}
        {/* ปุ่มแบบชั้นหนังย้ายไปแถบปุ่มคู่ด้านบนของหน้า (BitratePage) อยู่ทั้งสองแบบ (BUGS ข้อ 85) */}
        {/* กว้างเท่าข้อความยาวสุดของไฟล์นี้เสมอ ไม่ซูมก็จองที่ไว้ ปุ่มแบบชั้นหนังไม่ขยับ (BUGS ข้อ 45) */}
        {path && <div style={{ flex: "none", fontSize: 12, color: "rgb(70,70,70)", visibility: zoom.length > 0 ? "visible" : "hidden" }} data-bv-zoomstat><FixedTime t={`${visCount} / ${S.n} samples, ${hms(span)}`} longest={`${S.n} / ${S.n} samples, ${hms(totalSec)}`} /></div>}
      </div>
      <div style={{ flex: 1, minHeight: 160, display: "flex", gap: 10 }}>
        <div style={{ width: 66, position: "relative", flex: "none" }} data-bv-axis>
          {path && !(choose && choose.path === path) && <>
            {yOf(maxV) > 18 && <div style={{ ...lab(yOf(maxV)), textAlign: "right", lineHeight: "16px" }}><div>Max.</div><div>{maxV}</div><div>{auto ? "(A)" : "(S)"}</div></div>}
            {auto ? <div style={lab(10)}>{Math.round(top)}</div> : <div style={lab(yOf(maxV / 2))}>{maxV / 2}</div>}
            <div style={lab(box.h)}>0</div>
            {info && axisFit.info != null && <div style={{ ...lab(axisFit.info), textAlign: "right", lineHeight: 1.35 }} title={info.profile || undefined}>
              <div>{codec}</div>{fmt && <div>{fmt}</div>}
              <div data-bv-badge style={{ marginTop: 3, marginLeft: "auto", width: 52, background: C.head1, color: "rgb(255,255,255)", fontWeight: 700, fontSize: 11, padding: "0 4px", textAlign: "center" }}>{md.badge}</div>
            </div>}
            {info && axisFit.tracks != null && <div style={{ ...lab(axisFit.tracks), lineHeight: 1.45 }}><div>V: {info.video}</div><div>A: {info.audio}</div></div>}
          </>}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div ref={plotRef} style={{ flex: 1, minHeight: 0, position: "relative", cursor: path ? "crosshair" : "pointer", userSelect: "none" }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => setTopBand(false)} onContextMenu={onContext} onWheel={onWheel}
            onDoubleClick={() => path && setAuto((v) => !v)} onClick={() => { if (!path) void load(); }} data-bv-plot>
            <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
            {sel && <div data-bv-sel style={{ position: "absolute", top: 0, bottom: 0, left: xOf(sel[0]), width: Math.max(1, xOf(sel[1]) - xOf(sel[0])), background: C.sel, borderLeft: `1px solid ${C.selEdge}`, borderRight: `1px solid ${C.selEdge}`, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center", color: "rgb(150,80,0)", fontWeight: 700 }}>
              {(((sel[1] - sel[0]) / span) * 100).toFixed(1)}%</div>}
            {path && <div style={{ position: "absolute", left: 10, top: 6, color: C.sample, fontSize: 12, pointerEvents: "none" }} data-bv-sample>sample: {group}{running ? ` อ่านแล้ว ${readPct}%${mode === "frm" ? " (ถอดภาพ)" : ""}` : ""}</div>}
            {/* ไอคอนลากไฟล์รูปเดียวกับจุดลากไฟล์ของโปรแกรมหลัก (.drop) สีม่วงฟ้าของหน้านี้ (BUGS ข้อ 86 · พี่กันสั่ง 13 พ.ย. 2569 "ใส่ icon ให้เหมือนโปรแกรมหลััก") */}
            {!path && <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "rgb(120,120,120)", fontSize: 14 }} data-bv-empty>
              <svg width="58" height="58" viewBox="0 0 58 58" aria-hidden="true">
                {/* ไล่สีแบบเดียวกับหัวกล่องทางขวา ตามเมนู Draw gradient headers (พี่กันสั่ง 13 พ.ย. 2569 "ปุ่มโหลดขอไล่สีเหมือนกัน") */}
                <defs><linearGradient id="bvDropGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={C.head1} /><stop offset="1" stopColor={gradHead ? C.head2 : C.head1} /></linearGradient></defs>
                <circle cx="29" cy="29" r="29" fill="url(#bvDropGrad)" /><g transform="translate(14.5 14.5) scale(1.2)" fill="none" stroke="rgb(255,255,255)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></g></svg>
              ลากไฟล์วิดีโอหรือไฟล์เสียงมาวางตรงนี้ หรือกด Load</div>}
            {choose && choose.path === path && <div data-bv-choose onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, background: C.win, cursor: "default" }}>
              <div style={{ marginBottom: 4, fontSize: 13 }}>Select stream ไฟล์นี้มี {choose.tracks.length} แทร็ก เลือกแทร็กที่จะดูบิตเรต</div>
              {choose.tracks.map((t) => <button key={t.id} type="button" className="bv-btn" onClick={() => void open(path, modeSel, false, t.id)} data-bv-pick={t.id} style={{ ...btn, width: 240, textAlign: "left", padding: "0 10px" }}>{t.label}</button>)}
            </div>}
            {err && <div style={{ position: "absolute", left: 10, bottom: 14, color: C.red }} data-bv-error>{err}</div>}
            {/* อ่านไม่ถึงท้ายไฟล์ ลอยมุมล่างซ้าย ไม่ดันกรอบ (AUDIT ข้อ 118) */}
            {!err && cutAt != null && <div style={{ position: "absolute", left: 10, bottom: 14, color: C.red, background: "rgba(255,255,255,.85)", padding: "0 4px" }} data-bv-cut>อ่านได้ถึง {hms(cutAt)} จากความยาว {hms(info?.duration ?? 0)} ส่วนท้ายไฟล์อาจเสีย</div>}
          </div>
          {/* แถบบอกช่วงที่ซูม · สีส้มคือช่วงที่เห็นอยู่ สีแดงคือช่วงที่ลากเลือก */}
          {/* ลากแถบสีส้มเลื่อนช่วงที่ดู กดร่องข้างแถบกระโดดไปช่วงนั้น · ที่กดได้หนากว่าแถบ หน้าตาเท่าเดิม (BUGS ข้อ 47) */}
          <div onMouseDown={onBarDown} style={{ padding: "4px 0", margin: "-4px 0", cursor: zoom.length ? "grab" : "default" }} data-bv-zoomhit>
          <div ref={barRef} data-bv-zoombar style={{ height: 6, position: "relative", background: zoom.length || sel ? "rgb(215,215,215)" : "transparent" }}>
            {zoom.length > 0 && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(z0 / totalSec) * 100}%`, width: `${Math.max(0.3, zoomPct)}%`, background: C.zoom }} />}
            {sel && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(sel[0] / totalSec) * 100}%`, width: `${Math.max(0.3, ((sel[1] - sel[0]) / totalSec) * 100)}%`, background: C.red }} />}
          </div>
          </div>
        </div>
        <div style={{ width: 150, flex: "none", display: "flex", flexDirection: "column", gap: 4 }} data-bv-panel>
          <div style={{ marginBottom: 6 }}>
            <div style={head}>Total Time</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }}>{info ? hms(info.duration) : ""}</div>
            {/* บรรทัด ZOOM กับปุ่มรีเซ็ตจองที่ไว้ตลอด ไม่ซูมก็ซ่อนแต่ไม่ดันของข้างล่าง (BUGS ข้อ 45 46) */}
            <div style={{ padding: "2px 8px 0", display: "flex", alignItems: "center", gap: 6, visibility: zoom.length > 0 ? "visible" : "hidden" }} aria-hidden={zoom.length ? undefined : true}>
              <span style={{ flex: 1, fontSize: 11.5, color: C.zoom, fontWeight: 700, whiteSpace: "nowrap" }} data-bv-zoomflag>ZOOM {zoom.length} ({zoomPct.toFixed(1)}%)</span>
              <button type="button" className="bv-btn" onClick={() => { setZoom([]); setSel(null); }} disabled={!zoom.length} tabIndex={zoom.length ? 0 : -1} title="กลับไปดูทั้งไฟล์ แบบเดียวกับเมนู Reset zoom" data-bv-reset
                style={{ flex: "none", height: 20, padding: "0 6px", borderRadius: 2, fontFamily: FONT, fontSize: 11.5, color: "rgb(0,0,0)" }}>Reset</button>
            </div>
          </div>
          {([["Average Bitrate", S.n ? kb(stats.avg) : ""], ["Peak", S.n ? kb(stats.peak) : ""]] as const).map(([h, v]) => <div key={h} style={{ marginBottom: 6 }}>
            <div style={head}>{h}</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18 }}>{v}</div></div>)}
          <div style={{ marginTop: "auto" }}>
            <div style={head}>Cursor</div>
            <div style={{ padding: "8px 8px 0", minHeight: 18, display: "flex", alignItems: "center", gap: 6 }} data-bv-curtime>
              <span>{cur != null && path ? hms(cur) : ""}</span>
              {curType && <button type="button" onClick={(e) => jumpI(e.ctrlKey || e.shiftKey)} title="กดเพื่อไป I เฟรมถัดไป หรือกด Ctrl ค้างแล้วกดเพื่อย้อนไป I เฟรมก่อนหน้า" data-bv-ftype className="bv-ft"
                style={{ borderRadius: 2, background: curType === "I" ? C.over : curType === "P" ? C.head2 : "rgb(255,255,255)", fontWeight: 700, fontSize: 11, padding: "0 5px", cursor: "pointer", fontFamily: FONT }}>{curType}</button>}
            </div>
            <div style={{ padding: "12px 8px 0", minHeight: 18, display: "flex" }} data-bv-curval>
              <span style={{ flex: 1 }}>{ci >= 0 ? kb(kbps(S.b[ci], S.t1[ci] - S.t0[ci])) : curBar ? kb(curBar.v) : ""}</span>
              {path && <span>({md.letter})</span>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingLeft: 8 }}>
        {/* แถวสถิติลากเลือกแล้ว Ctrl+C คัดลอกได้ (AUDIT ข้อ 123 · ทั้งโปรแกรมตั้งห้ามเลือกข้อความไว้ที่ body เดิมลากเลือกไม่ได้เลย) */}
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5, userSelect: "text", cursor: "text" }} title="ลากเลือกตัวเลขแล้วกด Ctrl+C เพื่อคัดลอก" data-bv-stats>
          <div>{S.n ? `MIN = ${kb(stats.min)}  MAX = ${kb(stats.peak)}  AVG = ${kb(stats.avg)}  FRAMES = ${r?.t.length ?? 0}` : " "}</div>
          <div>{info ? (audio
            ? `${+(info.sample_rate / 1000).toFixed(1)} kHz, ${info.channels} ch${info.bit_depth ? `, ${info.bit_depth} bit` : ""}      (${(info.size / 1048576).toFixed(3)} MiB)`
            // ตัดศูนย์ท้ายเฉพาะทศนิยม 29.970 เป็น 29.97 · เดิมตัดศูนย์ของเลขจำนวนเต็มด้วย 30 fps ขึ้นเป็น 3 fps (AUDIT ข้อ 25)
            : `${info.width} × ${info.height}, ${info.fps ? +info.fps.toFixed(3) : "n/a"} fps      (${(info.size / 1048576).toFixed(3)} MiB)`) : " "}</div>
        </div>
        <button type="button" className="bv-btn" onClick={() => void load()} data-bv-load style={btn}>{running ? "Stop" : "Load"}</button>
        <button type="button" className="bv-btn" onClick={close} disabled={!path} data-bv-close style={btn}>Close</button>
      </div>
      <span hidden>{ver}</span>
    </div>
  );
}

const btn: React.CSSProperties = { width: 96, height: 30, flex: "none", borderRadius: 2, color: "rgb(0,0,0)", fontFamily: FONT, fontSize: 13 };
const mi = (off?: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, width: "100%", border: "none", padding: "3px 12px 3px 6px", fontFamily: FONT, fontSize: 12.5, color: off ? "rgb(150,150,150)" : "rgb(0,0,0)", cursor: off ? "default" : "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
const hr: React.CSSProperties = { height: 1, background: "rgb(200,200,200)", margin: "3px 6px" };
const sep: React.CSSProperties = { padding: "3px 12px 3px 28px", color: "rgb(90,90,90)", fontSize: 11.5 };
