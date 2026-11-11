/* หน้าบิตเรตวิดีโอแบบใหม่ ให้เข้ากับหน้าตาของชั้นหนังและโทนสี · ลงโปรแกรมแล้ว 10 พ.ย. 2569 พี่กันสั่ง "เอามอคอัปเข้าโปรแกรมเลยนะ"
   แบบเดิม (Bitrate Viewer) อยู่ BitrateClassic.tsx สลับได้ ตัวหน้านี้จำว่าเลือกแบบไหน
   พี่กันสั่ง 10 พ.ย. 2569 "หน้า bitrate viewers เราเอาแบบเดิมไว้ และเราให้เธอ re-designed ใหม่หมด ให้เข้ากับเว็บ และโทนสี
   และบางการตั้งค่าการเลือก ให้ภาษาไทย และคงคำศัพเฉพาะไว้ ทำมอคอัปมาเลย" · "อย่าลืมว่า เรามี 4 โทนสีนะ"
   ยังไม่ได้ลงโปรแกรม · ใช้ฝั่งข้อมูลชุดเดียวกับหน้าเดิม (bitrateApi เหตุการณ์ bitrate-progress bitrate-done)
   ในมอคอัป ข้อมูลมาจากคลิปตัวอย่างที่อ่านด้วย ffprobe จริง (data-ตัวอย่างหนัง.json)
   โครงหน้ายึดหน้ากราฟเสียง การ์ดชื่อไฟล์ด้านบน แผงข้อมูลซ้าย หัวกราฟพร้อมปุ่มซูม แถบภาพรวมทั้งไฟล์ คำอธิบายสีด้านล่าง
   สีกราฟอ่านจากตัวแปรสีของโทนที่เลือก เปลี่ยนโทนแล้ววาดใหม่ทันที */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../lib/pageActive";
import { listen } from "@tauri-apps/api/event";
import { bitrateApi, inApp, pickFile, thumbUrl, type BrInfo, type BrTrack } from "../lib/api";
import Dropdown from "../components/Dropdown";
import { useLibrary } from "../lib/library";
import { Seg, dropClick } from "../components/ui";
import InfoTip from "../components/InfoTip";
import { IbStop, IcBitrate, IcFile, IcRefresh } from "../components/icons";
import type { Tip } from "../lib/codecAdv";
import BitrateClassic from "./BitrateClassic";
import bvIcon from "../assets/thanks/bitrateviewer.ico";
import "../styles/bitrate.css";
import FullBtn from "../components/FullBtn";

type Mode = "sec" | "gop" | "gopx" | "frm";
const MODES: { value: Mode; label: string; letter: string }[] = [
  { value: "sec", label: "ต่อวินาที", letter: "S" },
  { value: "gop", label: "ต่อ GOP", letter: "G" },
  { value: "gopx", label: "GOP แบบถ่วง", letter: "X" },
  { value: "frm", label: "ต่อเฟรม", letter: "F" },
];
const TIP_MODE: Tip = {
  w: "บิตเรตคือข้อมูลที่วิดีโอใช้ต่อวินาที ยิ่งสูงยิ่งเก็บรายละเอียดได้มาก เลือกได้ว่าจะรวมข้อมูลเป็นช่วงแบบไหน (ทำตามโปรแกรม Bitrate Viewer)",
  o: [
    ["ต่อวินาที", "รวมขนาดของทุกเฟรมในหนึ่งวินาที เป็นค่าตั้งต้น อ่านง่ายที่สุด", "", ""],
    ["ต่อ GOP", "รวมทีละกลุ่มภาพ (GOP) ตั้งแต่คีย์เฟรมหนึ่งถึงคีย์เฟรมถัดไป ปกติยาวราวครึ่งถึงสองวินาที", "", "ตัดฉากบ่อย GOP สั้น ค่าพุ่งสูงเกินจริงได้"],
    ["GOP แบบถ่วง", "เหมือนต่อ GOP แต่ GOP ที่สั้นกว่าครึ่งของปกติ เอาไปรวมกับรอบถัดไป ค่าเรียบกว่า", "", ""],
    ["ต่อเฟรม", "ดูทีละเฟรม บอกชนิดเฟรม I P B · I เฟรมใหญ่ที่สุด B เฟรมเล็กที่สุด", "", "ต้องถอดภาพ อ่านนานกว่าแบบอื่น ครั้งแรกอ่านไฟล์อีกรอบ"],
  ],
  r: "ดูภาพรวมใช้ต่อวินาที · อยากรู้ว่าเฟรมไหนกินข้อมูลมากใช้ต่อเฟรม",
};
const TIP_SCALE: Tip = {
  w: "ความสูงของกราฟ",
  o: [
    ["ตามเพดาน", "กราฟสูงพอดีเส้นเพดาน เทียบไฟล์ต่าง ๆ ได้ด้วยสเกลเดียวกัน แท่งที่เกินเพดานเป็นสีแดง", "", ""],
    ["ตามข้อมูล", "กราฟยืดให้แท่งที่สูงที่สุดในช่วงที่เห็นพอดีขอบบน เห็นรายละเอียดช่วงบิตเรตต่ำชัดขึ้น", "", ""],
  ],
  r: "เพดานคิดจากบิตเรตเฉลี่ยของทั้งไฟล์ ปัดเป็น 1 2 5 (ตัวจริงของ Bitrate Viewer ตั้ง 10 Mbps ตายตัวตามแผ่น DVD)",
};

type Src = "pkt" | "frm";
const srcOf = (m: Mode): Src => (m === "frm" ? "frm" : "pkt");
type Raw = { t: number[]; s: number[]; k: string; tmin: number; readTo: number; done: boolean };
type Entry = { info: BrInfo; raw: Partial<Record<Src, Raw>> };
const CACHE = new Map<string, Entry>();
type Prog = { run: number; from: number; t: number[]; s: number[]; k: string; readTo: number };
type Done = { run: number; ok: boolean; stopped?: boolean; error?: string };
type Samples = { t0: Float64Array; t1: Float64Array; b: Float64Array; typ: string; n: number; keys: number[] };
const kbps = (bytes: number, sec: number) => (bytes * 8) / 1000 / Math.max(sec, 0.001);

/** ตัวอย่างตามวิธีคิด (ตรรกะเดียวกับหน้าเดิม src/pages/BitratePage.tsx) */
function buildSamples(raw: Raw | undefined, mode: Mode, fps: number): Samples {
  const empty = { t0: new Float64Array(0), t1: new Float64Array(0), b: new Float64Array(0), typ: "", n: 0, keys: [] };
  if (!raw || !raw.t.length) return empty;
  const { t, s, k, tmin } = raw;
  // ไม่มีอัตราเฟรม (แทร็กเสียง) ใช้ความยาวเฉลี่ยของแพ็กเก็ตจริง ช่องวินาทีท้ายไฟล์จะยาวถูก ค่าไม่ต่ำเกินจริง
  const fd = fps > 0 ? 1 / fps : t.length > 1 && raw.readTo > tmin ? (raw.readTo - tmin) / (t.length - 1) : 1 / 25;
  const keys: number[] = [];
  for (let i = 0; i < t.length; i++) if (k[i] === "K" || k[i] === "I") keys.push(t[i] - tmin);
  if (mode === "sec") {
    const end = raw.readTo - tmin + fd;
    // จำนวนวินาทีนับจากวินาทีของเฟรมสุดท้ายจริง · ใช้ end ปัดขึ้นไม่ได้ เฟรมสุดท้าย 1.917 บวกหนึ่งเฟรม 0.0833 ได้ 2.0003 กลายเป็น 3 วินาที ช่องท้ายว่าง MIN เป็น 0 (เจอ 10 พ.ย. 2569)
    const n = Math.max(0, raw.done ? Math.floor(raw.readTo - tmin) + 1 : Math.floor(raw.readTo - tmin));
    const b = new Float64Array(n);
    for (let i = 0; i < t.length; i++) { const j = Math.floor(t[i] - tmin); if (j >= 0 && j < n) b[j] += s[i]; }
    const t0 = new Float64Array(n), t1 = new Float64Array(n);
    for (let j = 0; j < n; j++) { t0[j] = j; t1[j] = raw.done ? Math.min(j + 1, Math.max(end, j + 0.001)) : j + 1; }
    // ช่องท้ายไฟล์สั้นกว่าครึ่งวินาที รวมเข้าช่องก่อนหน้า · เศษไม่กี่แพ็กเก็ตคิดเป็นต่อวินาทีแล้วค่าเพี้ยน
    // (เจอ 10 พ.ย. 2569 แทร็กเสียง AAC เวลาเริ่มติดลบ ช่องที่ 150 ยาว 0.05 วินาที ต่ำสุดขึ้น 62 kbps ทั้งที่จริงราว 128)
    if (raw.done && n > 1 && t1[n - 1] - t0[n - 1] < 0.5) { b[n - 2] += b[n - 1]; t1[n - 2] = t1[n - 1]; return { t0: t0.subarray(0, n - 1), t1: t1.subarray(0, n - 1), b: b.subarray(0, n - 1), typ: "", n: n - 1, keys }; }
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

const niceUp = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p; return 10 * p; };
const niceNear = (x: number) => { if (!(x > 0)) return 1; const p = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].map((m) => m * p).sort((a, b) => Math.abs(Math.log(a / x)) - Math.abs(Math.log(b / x)))[0]; };
/** บิตเรตอ่านง่าย · ตั้งแต่ 1,000 kbps เป็น Mbps */
const rate = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 1 : 2)} Mbps` : `${Math.round(v)} kbps`);
/** ป้ายแกน ตัวเลขอย่างเดียว หน่วยเขียนกำกับไว้หัวแกน */
const rateAxis = (v: number, mbps: boolean) => (mbps ? `${+(v / 1000).toFixed(1)}` : `${Math.round(v)}`);
const clock = (t: number) => { const s = Math.max(0, Math.floor(t)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`; };
const clockMs = (t: number) => `${clock(t)}.${String(Math.floor((Math.max(0, t) % 1) * 1000)).padStart(3, "0")}`;
/** ป้ายเวลาบนแกนตอนซูมลึก · 0:12.5 ไม่ใช่ 0:12.500 · เต็มวินาทีไม่มีจุดค้าง */
const clockTick = (t: number) => clockMs(t).replace(/0+$/, "").replace(/\.$/, "");
const mb = (b: number) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`);
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* เก็บไม่ได้ใช้ค่าตั้งต้น */ } } };
const recentList = (): string[] => { try { return JSON.parse(store.get("bv-recent") || "[]"); } catch { return []; } };
const codecName = (c: string) => ({ h264: "H.264", hevc: "HEVC", av1: "AV1", mpeg2video: "MPEG-2", mpeg1video: "MPEG-1", vp9: "VP9", mpeg4: "MPEG-4",
  aac: "AAC", mp3: "MP3", flac: "FLAC", opus: "Opus", vorbis: "Vorbis", ac3: "AC-3", eac3: "E-AC-3", dts: "DTS", truehd: "TrueHD", alac: "ALAC", ape: "APE", tak: "TAK", wavpack: "WavPack" } as Record<string, string>)[c] ?? (c.startsWith("pcm") ? "PCM" : c.toUpperCase());
/** ผังลำโพงจากจำนวนช่อง */
const chTxt = (n: number) => ({ 1: "1.0", 2: "2.0", 6: "5.1", 8: "7.1" } as Record<number, string>)[n] ?? `${n} ch`;
/** ข้อมูลที่จำไว้ของไฟล์ ไม่ว่าแทร็กไหน (ใช้ในรายการเปิดล่าสุด) */
const infoOf = (p: string) => { for (const [k, e] of CACHE) if (k.startsWith(p + "#")) return e.info; return undefined; };
const audioIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></svg>;
const fmtName = (f: string) => ({ matroska: "MKV", mov: "MP4", mpegts: "TS", mpeg: "MPEG-PS", avi: "AVI", webm: "WebM" } as Record<string, string>)[f] ?? f.toUpperCase();
/** แบบภาพ progressive หรือ interlaced จากค่า field_order ของ ffprobe */
const scanTxt = (f: string) => (!f || f === "unknown" ? "" : f === "progressive" ? "Progressive" : `Interlaced (${f === "tt" || f === "tb" ? "TFF" : "BFF"})`);
/** มาตรฐานสี กับบอก HDR จากการแปลงแสง (smpte2084 = HDR10 PQ · arib-std-b67 = HLG) */
const colorTxt = (i: BrInfo) => {
  const p = i.primaries && i.primaries !== "unknown" ? i.primaries.replace(/^bt/, "BT.").replace("BT.2020", "BT.2020") : "";
  const hdr = i.transfer === "smpte2084" ? "HDR10 (PQ)" : i.transfer === "arib-std-b67" ? "HLG" : "";
  return [p || (hdr ? "" : "ไม่ระบุ"), hdr || (p ? "SDR" : "")].filter(Boolean).join(" · ");
};
/** อ่านสีจากตัวแปรของโทนที่ใช้อยู่ */
const cssv = (n: string, d: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;
const alpha = (c: string, a: number) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;

/** หน้าบิตเรต · สลับแบบชั้นหนังกับแบบ Bitrate Viewer ไฟล์ที่เปิดอยู่ตามไปด้วย · จำแบบที่เลือกไว้ในเครื่อง */
export default function BitratePage({ initialPath = null, initialTrack = null, onConsumed }: { initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void } = {}) {
  const [view, setView] = useState<"new" | "classic">(() => (store.get("bv-view") === "classic" ? "classic" : "new"));
  const [carry, setCarry] = useState<string | null>(null);
  const go = (v: "new" | "classic", p: string | null) => { store.set("bv-view", v); setCarry(p); setView(v); };
  // ตัวตรวจกับหน้ามอคอัปสลับแบบผ่านตัวนี้
  useEffect(() => { (window as unknown as { __bitrateView?: (v: "new" | "classic") => void }).__bitrateView = (v) => go(v, null); });
  const start = initialPath ?? carry;
  const done = () => { setCarry(null); onConsumed?.(); };
  return view === "classic"
    ? <BitrateClassic initialPath={start} initialTrack={initialPath ? initialTrack : null} onConsumed={done} onModern={(p) => go("new", p)} />
    : <BitrateModern initialPath={start} initialTrack={initialPath ? initialTrack : null} onConsumed={done} onClassic={(p) => go("classic", p)} />;
}

function BitrateModern({ onClassic, initialPath = null, initialTrack = null, onConsumed }: { onClassic?: (path: string | null) => void; initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void }) {
  const { movies } = useLibrary();
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<BrInfo | null>(null);
  const [modeSel, setModeState] = useState<Mode>(() => (MODES.some((m) => m.value === store.get("brn-mode")) ? store.get("brn-mode") as Mode : "sec"));
  /** แทร็กเสียงไม่มีคีย์เฟรมกับชนิดเฟรม คิดได้แบบต่อวินาทีอย่างเดียว · ค่าที่เลือกไว้ยังจำอยู่ กลับไปดูวิดีโอได้ค่าเดิม */
  const audio = info?.kind === "audio";
  const mode: Mode = audio ? "sec" : modeSel;
  /** แทร็กที่ดูอยู่ (v a0 a1 …) · รายชื่อแทร็กที่ให้เลือกก่อนเปิด */
  const [track, setTrack] = useState("");
  const [choose, setChoose] = useState<{ path: string; tracks: BrTrack[] } | null>(null);
  const askRef = useRef(0);
  const [scale, setScale] = useState<"ceil" | "data">("ceil");
  const [lines, setLines] = useState({ avg: true, max: false, min: false });
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [ver, setVer] = useState(0);
  const [zoom, setZoom] = useState<[number, number][]>([]);
  /** ขยายแนวตั้ง 1 ถึง 16 เท่า · ขยายแล้วแท่งที่สูงเกินโดนตัดที่ขอบบน เห็นช่วงบิตเรตต่ำชัดขึ้น */
  const [vz, setVz] = useState(1);
  const [hover, setHover] = useState<{ x: number; y: number; t: number } | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [recent, setRecent] = useState<string[]>(recentList);
  const [toneVer, setToneVer] = useState(0);
  const raw = useRef<Raw | undefined>(undefined);
  const run = useRef(0);
  /** ตัวฟังเหตุการณ์พร้อมแล้ว · เริ่มอ่านหลังจากนี้ ข้อมูลก้อนแรกไม่หลุด */
  const ready = useRef<Promise<void>>(Promise.resolve());
  const drag = useRef<{ x: number; t: number; moved: boolean } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 700, h: 320 });

  // เปลี่ยนโทนแล้ววาดกราฟใหม่ด้วยสีของโทนนั้น
  // วาดใหม่เฉพาะตอนสีของโทนเปลี่ยนจริง · ตัวแปลงโทนแตะ style ของหน้าทุกครั้งที่หน้าวาดใหม่ ถ้าวาดใหม่ทุกครั้งจะวนไม่จบ
  const toneKey = useRef("");
  useEffect(() => {
    const key = () => ["--accent", "--accent-soft", "--win", "--txt2", "--line"].map((n) => cssv(n, "")).join("|");
    toneKey.current = key();
    const mo = new MutationObserver(() => { const k = key(); if (k !== toneKey.current) { toneKey.current = k; setToneVer((v) => v + 1); } });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => mo.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = plotRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.max(80, el.clientWidth), h: Math.max(80, el.clientHeight) }));
    ro.observe(el); return () => ro.disconnect();
  }, [path, choose]);

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
      if (raw.current) raw.current.done = d.ok;
      setRunning(false); if (d.error) setErr(d.error); setVer((v) => v + 1);
    });
    b.then((u) => (live ? offs.push(u) : u()));
    ready.current = Promise.all([a, b]).then(() => undefined, () => undefined);
    return () => { live = false; offs.forEach((f) => f()); bitrateApi.stop().catch(() => {}); };
  }, []);

  const open = useCallback(async (p: string, m: Mode, force = false, trk?: string) => {
    const src = srcOf(m);
    let tk = trk ?? (p === path ? track : "");
    setErr(""); setSel(null);
    if (p !== path || tk !== track) { setZoom([]); setPin(null); setHover(null); }
    setPath(p);
    // ไฟล์เดียวกันเขียน / กับ  หรือตัวพิมพ์ต่างกัน ถือเป็นไฟล์เดียว ไม่ขึ้นซ้ำ (เจอ 10 พ.ย. 2569)
    const same = (a: string) => a.replace(/\//g, "\\").toLowerCase();
    const list = [p, ...recentList().filter((x) => same(x) !== same(p))].slice(0, 8); store.set("bv-recent", JSON.stringify(list)); setRecent(list);
    // ยังไม่รู้แทร็ก ถามรายชื่อก่อน · มีมากกว่าหนึ่งให้เลือก (พี่กันสั่ง 10 พ.ย. 2569)
    const ask = ++askRef.current;
    if (!tk) {
      await bitrateApi.stop().catch(() => {}); run.current = -1; raw.current = undefined; setRunning(false); setInfo(null); setChoose(null); setVer((v) => v + 1);
      let list: BrTrack[] = [];
      try { list = await bitrateApi.tracks(p); } catch (e) { if (ask === askRef.current) setErr(String(e)); return; }
      if (ask !== askRef.current) return;
      if (list.length > 1) { setChoose({ path: p, tracks: list }); return; }
      tk = list[0]?.id ?? "auto";
    }
    setChoose(null); setTrack(tk);
    const key = p + "#" + tk;
    const hit = CACHE.get(key);
    if (!force && hit?.raw[src]?.done) { await bitrateApi.stop().catch(() => {}); run.current = -1; raw.current = hit.raw[src]; setInfo(hit.info); setRunning(false); setVer((v) => v + 1); return; }
    const r: Raw = { t: [], s: [], k: "", tmin: Infinity, readTo: 0, done: false };
    raw.current = r; run.current = -1; setRunning(true); if (!hit) setInfo(null); setVer((v) => v + 1);
    // เลขรอบตั้งก่อนเรียก ข้อมูลก้อนแรกที่มาถึงก่อนคำสั่งตอบกลับจะไม่ถูกทิ้ง
    const id = bitrateApi.nextRun(); run.current = id;
    try {
      await ready.current;
      const i = await bitrateApi.start(p, src, id, tk);
      if (raw.current !== r) return;
      setInfo(i);
      const e = CACHE.get(key) ?? { info: i, raw: {} }; e.info = i; e.raw[src] = r; CACHE.set(key, e);
    } catch (e) { if (raw.current === r) { setRunning(false); setErr(String(e)); } }
  }, [path, track]);
  const setMode = (m: Mode) => { setModeState(m); store.set("brn-mode", m); if (path) void open(path, m); };
  const pick = async () => { const p = await pickFile("media"); if (p) void open(p, modeSel); };
  const stop = () => { void bitrateApi.stop().catch(() => {}); run.current = -1; setRunning(false); };
  const home = () => { stop(); askRef.current++; raw.current = undefined; setPath(null); setInfo(null); setChoose(null); setTrack(""); setZoom([]); setPin(null); setErr(""); };
  const forget = (p: string) => { const l = recentList().filter((x) => x !== p); store.set("bv-recent", JSON.stringify(l)); setRecent(l); };

  // คีย์ลัดแบบเดียวกับ Bitrate Viewer · F5 อ่านใหม่ · Esc เอาจุดที่ปักออก
  const pageOn = usePageActiveRef();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับปุ่มลัด (BUGS ข้อ 9)
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "F5" && path) { e.preventDefault(); void open(path, modeSel, true); return; }
      if (e.key === "Escape" && pin != null) { setPin(null); return; }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      const m = ({ s: "sec", g: "gop", x: "gopx", f: "frm" } as Record<string, Mode>)[e.key.toLowerCase()];
      if (m) { e.preventDefault(); setMode(m); }
    };
    window.addEventListener("keydown", on); return () => window.removeEventListener("keydown", on);
  });
  // ตัวตรวจเปิดไฟล์ได้ · ส่งแทร็กมาด้วยจะไม่ขึ้นหน้าเลือกแทร็ก
  useEffect(() => { (window as unknown as { __brnOpen?: (p: string, t?: string) => void }).__brnOpen = (p, t) => void open(p, modeSel, false, t); });
  // ลากไฟล์จาก Explorer มาวาง
  const openRef = useRef(open); openRef.current = open;
  const modeRef = useRef(modeSel); modeRef.current = modeSel;
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type === "drop" && e.payload.paths[0] && document.querySelector("[data-brn]")) void openRef.current(e.payload.paths[0], modeRef.current);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);
  // มาจากปุ่มบิตเรตวิดีโอในแผงขวาของชั้นวาง (พี่กันสั่ง 10 พ.ย. 2569)
  useEffect(() => { if (initialPath) { void open(initialPath, modeSel, false, initialTrack ?? undefined); onConsumed?.(); } }, [initialPath]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- คิดตัวอย่าง ----------
  const r = raw.current;
  const fps = info?.fps ?? 0;
  const dur = info?.duration && info.duration > 0 ? info.duration : r && r.t.length ? r.readTo - r.tmin : 0;
  const total = Math.max(1, dur);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const S = useMemo(() => buildSamples(r, mode, fps), [r, mode, fps, ver]);
  const st = useMemo(() => {
    let peak = 0, min = Infinity, pAt = -1, mAt = -1, sumB = 0, sumT = 0;
    const cum = new Float64Array(S.n);
    for (let i = 0; i < S.n; i++) {
      const v = kbps(S.b[i], S.t1[i] - S.t0[i]);
      if (v > peak) { peak = v; pAt = i; }
      if (v < min) { min = v; mAt = i; }
      sumB += S.b[i]; sumT += S.t1[i] - S.t0[i]; cum[i] = kbps(sumB, sumT);
    }
    const types = { I: 0, P: 0, B: 0, sI: 0, sP: 0, sB: 0 };
    if (mode === "frm") for (let i = 0; i < S.n; i++) { const c = S.typ[i] as "I" | "P" | "B"; if (c in types) { types[c] += 1; types[`s${c}` as "sI"] += S.b[i]; } }
    const avg = sumT ? kbps(sumB, sumT) : 0;
    // ความแกว่ง ส่วนเบี่ยงเบนมาตรฐานเทียบค่าเฉลี่ย (ถ่วงตามความยาวของแต่ละช่วง)
    let vv = 0; for (let i = 0; i < S.n; i++) { const d = kbps(S.b[i], S.t1[i] - S.t0[i]) - avg; vv += d * d * (S.t1[i] - S.t0[i]); }
    const cv = sumT && avg ? Math.sqrt(vv / sumT) / avg : 0;
    return { peak, min: S.n ? min : 0, pAt, mAt, avg, cum, types, cv };
  }, [S, mode]);
  const [z0, z1] = zoom.length ? zoom[zoom.length - 1] : [0, total];
  const span = Math.max(0.001, z1 - z0);
  const est = info && info.duration > 0 && info.kind !== "audio" ? (info.size * 8) / 1000 / info.duration : 0;
  const ceil = niceNear(Math.max(est || st.avg, 1) * 2);
  // เวลาที่บิตเรตเกินเพดานรวม (วินาที)
  let overSec = 0; for (let i = 0; i < S.n; i++) if (kbps(S.b[i], S.t1[i] - S.t0[i]) > ceil) overSec += S.t1[i] - S.t0[i];

  // ขอบกราฟ · ซ้ายมีป้ายบิตเรต ล่างมีป้ายเวลา
  const L = 54, R = 14, T = 24, B = 26;
  const pw = Math.max(10, box.w - L - R), ph = Math.max(10, box.h - T - B);
  const maxBars = Math.max(10, Math.floor(pw / 3));
  const vis: number[] = [];
  for (let i = 0; i < S.n; i++) if (S.t1[i] > z0 && S.t0[i] < z1) vis.push(i);
  const group = Math.max(1, Math.ceil(vis.length / maxBars));
  const bars: { v: number; avg: number; t0: number; t1: number; i0: number; i1: number }[] = [];
  for (let g = 0; g < vis.length; g += group) {
    const i0 = vis[g], i1 = vis[Math.min(vis.length, g + group) - 1];
    let b = 0; for (let i = i0; i <= i1; i++) b += S.b[i];
    bars.push({ v: kbps(b, S.t1[i1] - S.t0[i0]), avg: st.cum[i1], t0: S.t0[i0], t1: S.t1[i1], i0, i1 });
  }
  const visPeak = bars.reduce((m, b) => Math.max(m, b.v), 0);
  const top = (scale === "data" ? niceUp(Math.max(1, visPeak) * 1.05) : Math.max(ceil * 1.15, stOver(st.peak, ceil))) / vz;
  function stOver(peak: number, c: number) { return peak > c * 1.15 ? peak * 1.05 : 0; }
  const xOf = (t: number) => L + ((t - z0) / span) * pw;
  const tOf = (x: number) => z0 + ((x - L) / pw) * span;
  const yOf = (v: number) => T + ph - (Math.min(v, top) / top) * ph;

  // ---------- วาดกราฟหลัก ----------
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.w, box.h);
    const c = { accent: cssv("--accent", "#c8406f"), deep: cssv("--accent-d", "#ad3560"), soft: cssv("--accent-soft", "#fbe9ef"), ink: cssv("--accent-ink", "#b0355f"), line: cssv("--line", "#f6e6ec"), txt2: cssv("--txt2", "#6b4f5c"), txt3: cssv("--txt3", "#876572"), bad: cssv("--bad", "#ec8f8f"), badInk: cssv("--bad-ink", "#b04545"), info: "steelblue", ok: cssv("--ok-ink", "#2f7a52") };
    const font = (w: number, s: number) => `${w} ${s}px Sarabun, "Noto Sans Thai", Tahoma, sans-serif`;
    if (!S.n) return; // ยังไม่มีข้อมูลหรืออ่านไม่ได้ ไม่วาดแกนเปล่า ข้อความบอกเหตุอยู่กลางกรอบแทน
    // เส้นแบ่งระดับกับป้ายบิตเรต
    const step = niceUp(top / 5);
    const mbps = top >= 2000;
    g.font = font(600, 11.5); g.fillStyle = c.txt3; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(mbps ? "Mbps" : "kbps", L - 8, 9);
    g.font = font(500, 11.5);
    for (let v = 0; v <= top + 1e-6; v += step) {
      const y = Math.round(yOf(v)) + 0.5;
      g.strokeStyle = c.line; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke();
      g.fillStyle = c.txt3; g.fillText(v ? rateAxis(v, mbps) : "0", L - 8, y);
    }
    // ป้ายเวลา
    const tStep = [0.04, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => span / s <= Math.max(3, Math.floor(pw / 90))) ?? 3600;
    g.textAlign = "center"; g.textBaseline = "top";
    for (let t = Math.ceil(z0 / tStep) * tStep; t <= z1 + 1e-6; t += tStep) {
      const x = Math.round(xOf(t)) + 0.5;
      g.strokeStyle = c.line; g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph + 4); g.stroke();
      g.fillStyle = c.txt3; g.fillText(tStep < 1 ? clockTick(t) : clock(t), x, T + ph + 7);
    }
    if (!bars.length) return;
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    // แท่ง · ใต้ค่าเฉลี่ยสะสมสีอ่อน เหนือค่าเฉลี่ยสีเข้ม เกินเพดานสีแดง (ความหมายเดียวกับ Bitrate Viewer)
    const yc = yOf(ceil);
    for (const b of bars) {
      const x0 = Math.floor(xOf(b.t0)), x1 = Math.max(x0 + 1, Math.floor(xOf(b.t1)) - (xOf(b.t1) - xOf(b.t0) >= 2.5 ? 1 : 0));
      // แท่งกว้างตั้งแต่ 2.5 จุดเว้นช่อง 1 จุด ทั้งแท่งเดี่ยวและแท่งที่รวมหลายช่วง (BUGS ข้อ 43 · เดิมเว้นเฉพาะแท่งเดี่ยวที่กว้างเกิน 4 จุด
      // หน้าต่างแคบโปรแกรมรวมแท่งละ 2 ช่วงขึ้นไป แท่งรวมกว้าง 6 จุดก็ยังติดกัน · เจอตอนตรวจที่หน้าต่าง 1024)
      const yv = yOf(b.v), ya = yOf(Math.min(b.v, b.avg)), base = T + ph;
      g.fillStyle = alpha(c.accent, 0.32); g.fillRect(x0, ya, x1 - x0, base - ya);
      if (b.v > b.avg) { const yt = Math.max(yv, Math.min(ya, yc)); g.fillStyle = alpha(c.accent, 0.78); g.fillRect(x0, yt, x1 - x0, ya - yt); }
      if (b.v > ceil) { g.fillStyle = c.bad; g.fillRect(x0, yv, x1 - x0, Math.min(yc, ya) - yv); }
    }
    // ค่าเฉลี่ยสะสม
    g.strokeStyle = c.txt2; g.globalAlpha = 0.55; g.lineWidth = 1.2; g.beginPath();
    // ช่วงที่ค่าเฉลี่ยสะสมสูงเกินกรอบ (ขยายแนวตั้งอยู่) เส้นขาด ไม่ลากติดขอบบน
    let pen = false;
    bars.forEach((b) => { const x = xOf((b.t0 + b.t1) / 2); if (b.avg > top) { pen = false; return; } const y = yOf(b.avg); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; });
    g.stroke(); g.globalAlpha = 1;
    // เส้นแนวนอน · เพดาน ค่าเฉลี่ย สูงสุด ต่ำสุด
    const hl = (v: number, color: string, label: string, dash: number[]) => {
      // เส้นที่สูงเกินกรอบ (ขยายแนวตั้งอยู่) ไม่วาด · yOf บีบค่าไว้ที่ขอบบน ถ้าวาดจะติดขอบ ป้ายโดนตัดครึ่ง
      if (v > top * 1.001) return;
      // เส้นที่ต่ำจนเกือบศูนย์ (เช่นช่วงจอดำ 5 kbps) ปัดแล้วเลยขอบล่างครึ่งจุด เดิมข้ามไม่วาดทั้งเส้นและป้าย · วาดชิดขอบแทน (BUGS ข้อ 1 เจอตอนตรวจ)
      const y0 = Math.round(yOf(v)) + 0.5; if (y0 < T - 1 || y0 > T + ph + 1) return;
      const y = Math.min(T + ph - 0.5, Math.max(T + 0.5, y0));
      g.font = font(600, 11.5); const w = g.measureText(label).width + 14;
      g.setLineDash(dash); g.strokeStyle = color; g.lineWidth = 1.4; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw - w, y); g.stroke(); g.setLineDash([]);
      // ป้ายอยู่ในกรอบเสมอ เส้นชิดขอบล่างหรือบน ป้ายขยับเข้ามา เส้นอยู่ที่เดิม (BUGS ข้อ 1)
      const ly = Math.min(T + ph - 9, Math.max(T + 9, y));
      g.fillStyle = cssv("--win", "#fff"); g.globalAlpha = 0.92; g.fillRect(L + pw - w, ly - 9, w, 18); g.globalAlpha = 1;
      g.fillStyle = color; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(label, L + pw - 4, ly);
    };
    hl(ceil, c.badInk, `เพดาน ${rate(ceil)}`, [6, 4]);
    if (lines.avg) hl(st.avg, c.deep, `เฉลี่ย ${rate(st.avg)}`, []);
    if (lines.max) hl(st.peak, c.badInk, `สูงสุด ${rate(st.peak)}`, [2, 3]);
    if (lines.min) hl(st.min, c.info, `ต่ำสุด ${rate(st.min)}`, [2, 3]);
    // คีย์เฟรม
    const ks = S.keys.filter((k) => k >= z0 && k <= z1);
    if (ks.length <= 240) { g.strokeStyle = c.txt3; g.globalAlpha = 0.6; for (const k of ks) { const x = Math.round(xOf(k)) + 0.5; g.beginPath(); g.moveTo(x, T + ph); g.lineTo(x, T + ph - 5); g.stroke(); } g.globalAlpha = 1; }
    // จุดสูงสุด จุดต่ำสุด เป็นสามเหลี่ยมที่แกนล่าง
    const tri = (i: number, color: string) => { if (i < 0) return; const t = (S.t0[i] + S.t1[i]) / 2; if (t < z0 || t > z1) return; const x = xOf(t); g.fillStyle = color; g.beginPath(); g.moveTo(x, T + ph - 9); g.lineTo(x - 5, T + ph); g.lineTo(x + 5, T + ph); g.closePath(); g.fill(); };
    tri(st.pAt, c.badInk); tri(st.mAt, c.info);
    // จุดที่ปักไว้ กับเส้นตามเมาส์
    if (pin != null && pin >= z0 && pin <= z1) { const x = Math.round(xOf(pin)) + 0.5; g.strokeStyle = c.deep; g.lineWidth = 2; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.lineWidth = 1; }
    if (hover && !drag.current?.moved) {
      const x = Math.round(hover.x) + 0.5; g.strokeStyle = c.txt2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); g.setLineDash([]);
      const hb = bars.find((b) => hover.t >= b.t0 && hover.t < b.t1);
      if (hb) { g.fillStyle = c.deep; g.beginPath(); g.arc(x, yOf(hb.v), 4, 0, Math.PI * 2); g.fill(); g.strokeStyle = cssv("--win", "#fff"); g.lineWidth = 2; g.stroke(); g.lineWidth = 1; }
    }
    g.restore();
  });

  // ---------- ภาพรวมทั้งไฟล์ ----------
  const ovH = 44;
  useEffect(() => {
    const cv = ovRef.current; if (!cv) return;
    const w = cv.clientWidth || box.w, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(ovH * dpr);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, ovH);
    const accent = cssv("--accent", "#c8406f"), bad = cssv("--bad", "#ec8f8f");
    const ow = w - L - R, n = Math.max(1, Math.floor(ow / 2));
    const sum = new Float64Array(n), sec = new Float64Array(n);
    for (let i = 0; i < S.n; i++) { const j = Math.min(n - 1, Math.floor(((S.t0[i] + S.t1[i]) / 2 / total) * n)); sum[j] += S.b[i]; sec[j] += S.t1[i] - S.t0[i]; }
    // ค่าต่อช่อง เฉพาะช่องที่มีข้อมูล แล้วเกลี่ยเบา ๆ สามช่อง เส้นจะได้ไม่หยัก
    const raw0 = Array.from(sum, (b, j) => [j, sec[j] ? kbps(b, sec[j]) : -1] as const).filter(([, v]) => v >= 0);
    if (!raw0.length) return;
    const pts = raw0.map(([j], i) => { let t = 0, k = 0; for (let d = -1; d <= 1; d++) { const p = raw0[i + d]; if (p) { t += p[1]; k++; } } return [j, t / k] as const; });
    const mx = Math.max(1, ceil * 1.1, ...pts.map(([, v]) => v));
    const xj = (j: number) => L + ((j + 0.5) / n) * ow, yj = (v: number) => ovH - 2 - (v / mx) * (ovH - 8);
    // เส้นโค้งผ่านจุดกึ่งกลางของแต่ละคู่
    const curve = (start: boolean) => { pts.forEach(([j, v], i) => { const x = xj(j), y = yj(v); if (i === 0) { if (start) g.moveTo(x, y); else g.lineTo(x, y); return; } const [pj, pv] = pts[i - 1]; const mxp = (xj(pj) + x) / 2, myp = (yj(pv) + y) / 2; g.quadraticCurveTo(xj(pj), yj(pv), mxp, myp); if (i === pts.length - 1) g.lineTo(x, y); }); };
    const x0 = xj(pts[0][0]), x1 = xj(pts[pts.length - 1][0]), base = ovH - 1;
    const area = () => { g.beginPath(); g.moveTo(x0, base); curve(false); g.lineTo(x1, base); g.closePath(); };
    // พื้นไล่สีจากเข้มด้านบนถึงจางที่ฐาน
    const grd = g.createLinearGradient(0, 4, 0, base); grd.addColorStop(0, alpha(accent, 0.42)); grd.addColorStop(1, alpha(accent, 0.06));
    area(); g.fillStyle = grd; g.fill();
    // ส่วนที่เกินเพดาน พื้นสีแดงต่อกัน
    const yc = yj(ceil);
    g.save(); g.beginPath(); g.rect(L, 0, ow, yc); g.clip(); area(); g.fillStyle = alpha(bad, 0.75); g.fill(); g.restore();
    // เส้นเพดานจาง ๆ
    g.setLineDash([3, 3]); g.strokeStyle = alpha(cssv("--bad-ink", "#b04545"), 0.45); g.lineWidth = 1; g.beginPath(); g.moveTo(L, Math.round(yc) + 0.5); g.lineTo(L + ow, Math.round(yc) + 0.5); g.stroke(); g.setLineDash([]);
    // เส้นขอบบน
    g.beginPath(); curve(true); g.strokeStyle = alpha(accent, 0.9); g.lineWidth = 1.4; g.lineJoin = "round"; g.stroke();
  });
  const ovDrag = useRef<number | null>(null);
  const ovMove = (clientX: number, el: HTMLElement) => {
    const rc = el.getBoundingClientRect(); const ow = rc.width - L - R;
    const t = Math.max(0, Math.min(total, ((clientX - rc.left - L) / ow) * total));
    if (!zoom.length) return;
    const a = Math.max(0, Math.min(total - span, t - span / 2));
    setZoom((z) => [...z.slice(0, -1), [a, a + span]]);
  };

  // ---------- เมาส์บนกราฟ ----------
  const pos = (e: React.MouseEvent) => { const rc = plotRef.current!.getBoundingClientRect(); return { x: e.clientX - rc.left, y: e.clientY - rc.top }; };
  const inPlot = (x: number) => x >= L && x <= L + pw;
  const sampleAt = (t: number) => { let lo = 0, hi = S.n - 1; while (lo <= hi) { const m = (lo + hi) >> 1; if (S.t1[m] <= t) lo = m + 1; else if (S.t0[m] > t) hi = m - 1; else return m; } return -1; };
  const pushZoom = (a: number, b: number) => { const lo = Math.max(0, a), hi = Math.min(total, b); if (hi - lo > 0.02) setZoom((z) => [...z, [lo, hi]]); };
  const zoomBy = (f: number, at?: number) => { const c = at ?? (z0 + z1) / 2; const w = Math.min(total, Math.max(0.2, span * f)); if (w >= total - 1e-6) { setZoom([]); return; } const a = Math.max(0, Math.min(total - w, c - (c - z0) * (w / span))); setZoom((z) => [...z, [a, a + w]]); };
  const setSpan = (w: number) => { const ww = Math.max(HZ_MIN, Math.min(total, w)); if (ww >= total - 1e-6) { setZoom([]); return; } const c = (z0 + z1) / 2; const a = Math.max(0, Math.min(total - ww, c - ww / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + ww]] : [[a, a + ww]])); };
  const resetZoom = () => { setZoom([]); setSel(null); setVz(1); };
  const preset = (w: number | null) => { if (!w || w >= total) { setZoom([]); return; } const c = pin ?? (z0 + z1) / 2; const a = Math.max(0, Math.min(total - w, c - w / 2)); setZoom([[a, a + w]]); };
  const onDown = (e: React.MouseEvent) => { if (e.button !== 0 || !S.n) return; const { x } = pos(e); if (!inPlot(x)) return; drag.current = { x, t: tOf(x), moved: false }; };
  const onMove = (e: React.MouseEvent) => {
    if (!S.n) return;
    const { x, y } = pos(e);
    if (!inPlot(x)) { setHover(null); return; }
    setHover({ x, y, t: tOf(x) });
    const d = drag.current;
    if (d && (e.buttons & 1)) { if (Math.abs(x - d.x) > 4) d.moved = true; if (d.moved) { const t = tOf(x); setSel([Math.min(d.t, t), Math.max(d.t, t)]); } }
  };
  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (!d || e.button !== 0) return;
    // ช่วงซูมคิดจากจุดที่กดลงกับจุดที่ปล่อย ไม่อ่านจากสถานะ sel ที่อาจยังเป็นค่าเก่าตอนปล่อยเมาส์
    const t = tOf(Math.max(L, Math.min(L + pw, pos(e).x)));
    if (d.moved) { pushZoom(Math.min(d.t, t), Math.max(d.t, t)); setSel(null); return; }
    setPin(t);
  };
  const onWheel = (e: React.WheelEvent) => { if (!S.n) return; const { x } = pos(e); if (!inPlot(x)) return; zoomBy(e.deltaY < 0 ? 0.5 : 2, tOf(x)); };

  const hi = hover ? sampleAt(hover.t) : -1;
  const hb = hover ? bars.find((b) => hover.t >= b.t0 && hover.t < b.t1) ?? null : null;
  const pi = pin != null ? sampleAt(pin) : -1;
  const pv = pi >= 0 ? kbps(S.b[pi], S.t1[pi] - S.t0[pi]) : 0;
  const jumpI = (back: boolean) => {
    if (!S.n || pin == null) return;
    let i = pi < 0 ? 0 : pi;
    for (i += back ? -1 : 1; i >= 0 && i < S.n; i += back ? -1 : 1) if (S.typ[i] === "I") break;
    if (i < 0 || i >= S.n) return;
    const t = S.t0[i] + 0.0001; setPin(t);
    if (t < z0 || t > z1) { const a = Math.max(0, Math.min(total - span, t - span / 2)); setZoom((z) => (z.length ? [...z.slice(0, -1), [a, a + span]] : z)); }
  };
  const readPct = info && info.duration > 0 && r && isFinite(r.tmin) ? Math.min(100, Math.round(((r.readTo - r.tmin) / info.duration) * 100)) : 0;
  const md = MODES.find((m) => m.value === mode)!;
  const name = path ? path.split(/[\\/]/).pop() ?? "" : "";
  const movieOf = (p: string) => movies.find((m) => m.path.toLowerCase() === p.toLowerCase());
  const film = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" /></svg>;
  const extCard = (p: string) => { const e = p.match(/\.([^.\\/]+)$/)?.[1]; return e ? <span className="rext">{e.toUpperCase()}</span> : null; };
  const thumbOf = (p: string) => { const m = movieOf(p); return m?.thumb ?? m?.linked?.[0]?.thumb ?? null; };

  /* ---------- ยังไม่เปิดไฟล์ ---------- */
  if (!path) {
    const shelf = movies.filter((m) => !m.missing).slice(0, 6);
    return (
      <div className="ag brn" data-brn>
        <div className="gmodebar">
          <div className="seg" role="group" aria-label="แบบหน้า"><button type="button" className="on" aria-pressed>แบบชั้นหนัง</button><button type="button" onClick={() => onClassic?.(null)} data-brnclassic style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><img src={bvIcon} alt="" width={16} height={16} style={{ display: "block", flex: "none" }} />แบบ Bitrate Viewer</button></div>
          <span className="small">ดูว่าแต่ละช่วงของวิดีโอหรือเสียงใช้ข้อมูลมากแค่ไหน · อ่านอย่างเดียว ไฟล์ไม่ถูกแตะ</span>
        </div>
        <div className="drop" style={{ minHeight: 180 }} onClick={dropClick(pick)} data-brndrop>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={pick}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">อ่านบิตเรตด้วย ffprobe · ไฟล์มีหลายแทร็ก ขึ้นให้เลือกว่าจะดูวิดีโอหรือเสียงแทร็กไหน</span>
        </div>
        {recent.length > 0 && <><div className="small">เปิดล่าสุด · กดเพื่อดูอีกครั้ง ปุ่มกากบาทเอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ</div>
          <div className="graph-recent">{recent.map((p) => {
            const nm = p.split(/[\\/]/).pop() ?? p, th = thumbOf(p);
            return (
              <div key={p} className="recentrow">
                <button type="button" className="dd" onClick={() => void open(p, modeSel)} title={p} data-brnrecent={nm}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span className="rtype">{th ? <img src={thumbUrl(th) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote">{film}</i>}{extCard(nm)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{nm.replace(/\.[^.]+$/, "")}</span></span>
                  {infoOf(p) && <span className="small" style={{ flex: "none" }}>{codecName(infoOf(p)!.codec)} · {clock(infoOf(p)!.duration)}</span>}
                </button>
                <button type="button" className="rmx" onClick={() => forget(p)} aria-label={`เอา ${nm} ออกจากรายการเปิดล่าสุด`} title="เอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}</div></>}
        {shelf.length > 0 && <><div className="small">หรือเลือกจากชั้นวาง</div>
          <div className="graph-recent">{shelf.map((m) => (
            <button key={m.id} type="button" className="dd" onClick={() => void open(m.path, modeSel)}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><span className="rtype">{(m.thumb ?? m.linked?.[0]?.thumb) ? <img src={thumbUrl(m.thumb ?? m.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote">{film}</i>}{extCard(m.path)}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name.replace(/\.[^.]+$/, "")}</span></span>
              <span className="small">{m.videoShort ?? ""}</span>
            </button>))}</div></>}
      </div>
    );
  }

  /* ---------- ไฟล์มีหลายแทร็ก ถามก่อนว่าจะดูแทร็กไหน ---------- */
  if (choose && choose.path === path) {
    const thc = thumbOf(path);
    return (
      <div className="ag brn" data-brn data-brnchoose>
        <div className="brn-top"><div className="agtop">
          <button type="button" className="btn btn-ghost" onClick={home} title="กลับหน้ารวม ดูไฟล์ที่เปิดล่าสุด" data-brnhome>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
          <div className="fchip">
            {thc ? <img className="fthumb" src={thumbUrl(thc) ?? ""} alt="" /> : <div className="fnote brn-fnote"><IcBitrate size={22} /></div>}
            <div style={{ minWidth: 0 }}>
              <div className="nm" title={path}>{name.replace(/\.[^.]+$/, "")}<span className="ext">{name.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
              <div className="meta">{choose.tracks.length} แทร็ก · เลือกแทร็กที่จะดูบิตเรต</div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={pick} data-brnopen><IcFile size={16} />เปิดไฟล์อื่น</button>
        </div></div>
        <section className="card brn-choose">
          <h3>ดูบิตเรตของแทร็กไหน</h3>
          <div className="graph-recent">{choose.tracks.map((t) => (
            <button key={t.id} type="button" className="dd" onClick={() => void open(path, modeSel, false, t.id)} data-brnpick={t.id}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><i className="rnote">{t.id === "v" ? film : audioIcon}</i><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span></span>
              <span className="small">{t.id === "v" ? "ภาพ · คิดได้ 4 วิธี" : "เสียง · ต่อวินาที"}</span>
            </button>))}</div>
          <p className="small">เปลี่ยนแทร็กทีหลังได้ที่ปุ่มแทร็กด้านบนของกราฟ</p>
        </section>
      </div>
    );
  }

  /* ---------- เปิดไฟล์แล้ว ---------- */
  const th = thumbOf(path);
  const gopAvg = S.keys.length > 1 ? (S.keys[S.keys.length - 1] - S.keys[0]) / (S.keys.length - 1) : 0;
  const tipLeft = hover ? (hover.x > box.w - 220 ? hover.x - 210 : hover.x + 14) : 0;
  const hv = hi >= 0 ? kbps(S.b[hi], S.t1[hi] - S.t0[hi]) : hb?.v ?? 0;
  const pct = (v: number) => (st.avg ? Math.round((v / st.avg - 1) * 100) : 0);
  const typeName: Record<string, string> = { I: "I เฟรม · ภาพเต็ม", P: "P เฟรม · อ้างภาพก่อน", B: "B เฟรม · อ้างก่อนและหลัง" };
  const tTotal = st.types.I + st.types.P + st.types.B;
  return (
    <div className="ag brn" data-brn data-brnfile>
      {/* แถบไฟล์กับแถวตัวเลือก มีเส้นแบ่งใต้แถบ แบบหน้ากราฟเสียง (พี่กันบอก 10 พ.ย. 2569 "เส้นแบ่ง") */}
      <div className="brn-top">
      <div className="agtop">
        <button type="button" className="btn btn-ghost" onClick={home} title="กลับหน้ารวม ดูไฟล์ที่เปิดล่าสุด" data-brnhome>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
        <div className="fchip">
          {th ? <img className="fthumb" src={thumbUrl(th) ?? ""} alt="" /> : <div className="fnote brn-fnote"><IcBitrate size={22} /></div>}
          <div style={{ minWidth: 0 }}>
            <div className="nm" title={path}>{name.replace(/\.[^.]+$/, "")}<span className="ext">{name.match(/\.[^.]+$/)?.[0] ?? ""}</span></div>
            <div className="meta">{info ? (audio ? [codecName(info.codec), chTxt(info.channels), `${+(info.sample_rate / 1000).toFixed(1)} kHz`, fmtName(info.format), mb(info.size), `ยาว ${clock(info.duration)}`] : [codecName(info.codec), `${info.width} × ${info.height}`, `${+info.fps.toFixed(3)} fps`, fmtName(info.format), mb(info.size), `ยาว ${clock(info.duration)}`]).join(" · ") : err ? <span className="brn-err">อ่านไฟล์นี้ไม่ได้</span> : "กำลังอ่านข้อมูลไฟล์…"}</div>
          </div>
        </div>
        {/* สลับแทร็กแบบหน้ากราฟเสียง (พี่กันสั่ง 10 พ.ย. 2569 "ไฟล์ที่มีหลายเสียง สามารถกดเลือกดูข้อมูลอื่นได้") */}
        {info && info.tracks.length > 1 && <span data-brntrack><Dropdown label="แทร็ก" value={info.track} onChange={(v) => void open(path, modeSel, false, v)} options={info.tracks.map((t) => ({ value: t.id, label: t.label }))} /></span>}
        <button type="button" className="btn btn-ghost" onClick={pick} data-brnopen><IcFile size={16} />เปิดไฟล์อื่น</button>
        {running
          ? <button type="button" className="btn btn-ghost" onClick={stop} data-brnstop><IbStop size={16} />หยุดอ่าน</button>
          : <button type="button" className="btn btn-ghost" onClick={() => void open(path, modeSel, true)} title="อ่านไฟล์ใหม่ทั้งไฟล์ (F5)" data-brnreload><IcRefresh size={16} />อ่านใหม่</button>}
      </div>

      <div className="agctl brn-ctl">
        <span className="lbl">วิธีคิด</span>
        <Seg label="วิธีคิดบิตเรต" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.value, label: m.label }))} disabledReason={audio ? "แทร็กเสียงคิดได้แบบต่อวินาทีอย่างเดียว เพราะเสียงไม่มีคีย์เฟรมกับชนิดเฟรม I P B" : undefined} />
        <InfoTip title="วิธีคิดบิตเรต" tip={TIP_MODE} />
        <span className="brn-sep" />
        <span className="lbl">สเกล</span>
        <Seg label="ความสูงของกราฟ" value={scale} onChange={setScale} options={[{ value: "ceil", label: "ตามเพดาน" }, { value: "data", label: "ตามข้อมูล" }]} />
        <InfoTip title="ความสูงของกราฟ" tip={TIP_SCALE} />
        <span className="brn-sep" />
        <span className="lbl">เส้น</span>
        <div className="seg brn-multi" role="group" aria-label="เส้นแนวนอนบนกราฟ">
          {([["avg", "ค่าเฉลี่ย"], ["max", "สูงสุด"], ["min", "ต่ำสุด"]] as const).map(([k, l]) => (
            <button key={k} type="button" className={lines[k] ? "on" : ""} aria-pressed={lines[k]} onClick={() => setLines((x) => ({ ...x, [k]: !x[k] }))} data-brnline={k}>
              <i className={"brn-dot " + k} />{l}</button>))}
        </div>
        <button type="button" className="btn btn-ghost btn-sm brn-classic" onClick={() => onClassic?.(path)} title="สลับไปหน้าตาแบบโปรแกรม Bitrate Viewer เดิม ไฟล์นี้ตามไปด้วย" data-brnclassic><img src={bvIcon} alt="" width={16} height={16} style={{ display: "block", flex: "none" }} />แบบ Bitrate Viewer</button>
        <FullBtn />
      </div>
      </div>

      <div className="agb brn-body">
        <aside className="brn-side">
          <section className="card">
            <h3>Bitrate</h3>
            <dl className="brn-kv">
              <dt>เฉลี่ย</dt><dd><b>{S.n ? rate(st.avg) : "–"}</b></dd>
              <dt>สูงสุด</dt><dd>{S.n ? <>{rate(st.peak)} <button type="button" className="linklike brn-at" onClick={() => { const t = (S.t0[st.pAt] + S.t1[st.pAt]) / 2; setPin(t); }} title="ปักจุดตรงนี้">ที่ {clock(S.t0[st.pAt])}</button></> : "–"}</dd>
              <dt>ต่ำสุด</dt><dd>{S.n ? <>{rate(st.min)} <button type="button" className="linklike brn-at" onClick={() => { const t = (S.t0[st.mAt] + S.t1[st.mAt]) / 2; setPin(t); }} title="ปักจุดตรงนี้">ที่ {clock(S.t0[st.mAt])}</button></> : "–"}</dd>
              <dt>เพดาน</dt><dd>{S.n ? <>{rate(ceil)}<span className="small"> · เฉลี่ย × 2</span></> : "–"}</dd>
              <dt>เกินเพดาน</dt><dd>{S.n ? <>{overSec >= 1 ? clock(overSec) : `${overSec.toFixed(1)} วินาที`}<span className="small"> · {Math.round((overSec / Math.max(0.001, total)) * 100)}% ของไฟล์</span></> : "–"}</dd>
              <dt>ความแกว่ง</dt><dd title="ส่วนเบี่ยงเบนมาตรฐานของบิตเรตเทียบกับค่าเฉลี่ย ยิ่งน้อยยิ่งนิ่ง">{S.n ? <>±{Math.round(st.cv * 100)}%<span className="small"> · {st.cv < 0.15 ? "นิ่ง" : st.cv < 0.45 ? "ขึ้นลงพอควร" : "ขึ้นลงมาก"}</span></> : "–"}</dd>
            </dl>
          </section>
          <section className="card">
            <h3>Frames</h3>
            <dl className="brn-kv">
              <dt>ทั้งหมด</dt><dd>{r ? r.t.length.toLocaleString() : "–"}{running ? <span className="small"> · กำลังนับ</span> : null}</dd>
              {audio
                ? <><dt>ต่อเฟรม</dt><dd>{r && r.t.length > 1 ? `${+((dur / r.t.length) * 1000).toFixed(1)} ms` : "–"}</dd></>
                : <><dt>คีย์เฟรม</dt><dd>{r ? S.keys.length.toLocaleString() : "–"}{gopAvg ? <span className="small"> · ทุก {gopAvg.toFixed(1)} วินาที</span> : null}</dd></>}
            </dl>
            {audio ? <p className="small brn-hint" data-brntypes>เสียงไม่มีคีย์เฟรมกับชนิดเฟรม I P B</p> : <>
            {/* แถว I P B อยู่ครบเสมอ ยังไม่ได้นับขึ้น – · บอกวิธีดูไว้ใต้แถว */}
            <div className="brn-types" data-brntypes>
              <div className="brn-tbar">{(["I", "P", "B"] as const).map((k) => <i key={k} className={"t" + k} style={{ flex: (mode === "frm" && tTotal > 0 ? st.types[k] : 0) || 0.0001 }} title={`${k} ${st.types[k]} เฟรม`} />)}</div>
              {/* I P B บรรทัดเดียว ขนาดเฉลี่ยอยู่ตอนชี้ · ประหยัดที่ให้ข้อมูลวิดีโอ */}
              <div className="brn-tline">{(["I", "P", "B"] as const).map((k) => { const on = mode === "frm" && tTotal > 0; return (
                <span key={k} className="brn-tchip" title={on ? `${k} เฟรม ${st.types[k].toLocaleString()} เฟรม · เฉลี่ย ${st.types[k] ? Math.round(st.types[`s${k}`] / st.types[k] / 1024).toLocaleString() : 0} KB` : undefined}><span className={"brn-ft t" + k}>{k}</span>{on ? st.types[k].toLocaleString() : "–"}</span>); })}</div>
              {mode !== "frm" && <p className="small brn-hint">เลือกวิธีคิดต่อเฟรม เพื่อนับเฟรม I P B</p>}
            </div></>}
          </section>
          <section className="card">
            <h3>{audio ? "ข้อมูลเสียง" : "ข้อมูลวิดีโอ"}</h3>
            {/* ชื่อแถวอยู่ครบเสมอ ยังไม่มีข้อมูลหรืออ่านไม่ได้ขึ้น – · แทร็กเสียงใช้ชื่อแถวแบบหน้ากราฟเสียง */}
            {audio && info ? <dl className="brn-kv" data-brnaudioinfo>
              <dt>Codec</dt><dd>{codecName(info.codec)}{info.profile ? <span className="small"> · {info.profile}</span> : null}</dd>
              <dt>Channels</dt><dd>{chTxt(info.channels)}<span className="small"> · {info.channels} {info.channels === 1 ? "channel" : "channels"}</span></dd>
              <dt>Sample rate</dt><dd>{info.sample_rate ? `${+(info.sample_rate / 1000).toFixed(1)} kHz` : "–"}</dd>
              <dt>Bit depth</dt><dd>{info.bit_depth ? `${info.bit_depth}-bit` : "–"}</dd>
              <dt>ภาษา</dt><dd>{info.lang || "ไม่ระบุ"}</dd>
              <dt>ชนิดไฟล์</dt><dd>{fmtName(info.format)}</dd>
              <dt>ขนาดไฟล์</dt><dd>{mb(info.size)}</dd>
              <dt>บิตเรตในไฟล์</dt><dd title="บิตเรตที่ไฟล์เขียนไว้ เทียบกับค่าเฉลี่ยที่วัดได้จริงข้างบน">{info.stream_bitrate ? rate(info.stream_bitrate / 1000) : "–"}</dd>
              <dt>แทร็ก</dt><dd>{`เสียง ${Number(info.track.slice(1)) + 1} จาก ${info.audio}`}{info.video ? <span className="small"> · มีวิดีโอ</span> : null}</dd>
            </dl> : <dl className="brn-kv">
              <dt>Codec</dt><dd>{info ? <>{codecName(info.codec)}{info.profile ? <span className="small"> · {info.profile}</span> : null}</> : "–"}</dd>
              <dt>ขนาดภาพ</dt><dd>{info ? <>{info.width} × {info.height}{scanTxt(info.field_order) ? <span className="small"> · {scanTxt(info.field_order)}</span> : null}</> : "–"}</dd>
              <dt>ความลึกสี</dt><dd>{info && info.bit_depth ? <>{info.bit_depth} บิต<span className="small"> · {info.pix_fmt}</span></> : "–"}</dd>
              <dt>มาตรฐานสี</dt><dd>{info ? colorTxt(info) : "–"}</dd>
              <dt>Frame rate</dt><dd>{info ? `${+info.fps.toFixed(3)} fps` : "–"}</dd>
              <dt>ชนิดไฟล์</dt><dd>{info ? fmtName(info.format) : "–"}</dd>
              <dt>ขนาดไฟล์</dt><dd>{info ? mb(info.size) : "–"}</dd>
              <dt>บิตเรตในไฟล์</dt><dd title="บิตเรตที่ไฟล์เขียนไว้ เทียบกับค่าเฉลี่ยที่วัดได้จริงข้างบน">{info && info.stream_bitrate ? rate(info.stream_bitrate / 1000) : "–"}</dd>
              <dt>แทร็ก</dt><dd>{info ? `วิดีโอ ${info.video} · เสียง ${info.audio}` : "–"}</dd>
            </dl>}
          </section>
        </aside>

        <section className="card brn-main">
          <div className="brn-head">
            <div style={{ minWidth: 0 }}>
              <b>{audio ? "Audio Bitrate" : "Video Bitrate"}</b><span className="small"> · {md.label}{S.n ? ` · ${clock(z0)} ถึง ${clock(z1)}${group > 1 ? ` · แท่งละ ${group} ช่วง` : ""}` : ""}</span>
            </div>
            <div className="brn-zoom">
              <span className="zbtns">
                <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={!zoom.length} aria-label="ซูมออก" title="ซูมออก · หมุนล้อเมาส์ลงในกราฟ" data-brnzoomout>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M20 20l-4-4" /></svg></button>
                <BrHZoom total={total} span={span} onSpan={setSpan} off={!S.n} />
                <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={!S.n || span <= HZ_MIN * 1.01} aria-label="ซูมเข้า" title="ซูมเข้า · หมุนล้อเมาส์ขึ้นในกราฟ" data-brnzoomin>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M8 11h6M11 8v6M20 20l-4-4" /></svg></button>
                <button type="button" className="zb" onClick={resetZoom} disabled={!zoom.length && vz === 1} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ขยายแนวตั้ง 1 เท่า" data-brnzoomreset><IcRefresh size={15} /></button>
              </span>
              <span className="lbl">ซูม</span>
              <Seg small label="ช่วงที่เห็น" value={!zoom.length ? "all" : span <= 11 ? "10" : span <= 61 ? "60" : "x"} onChange={(v) => preset(v === "all" ? null : Number(v))}
                options={[{ value: "all", label: "ทั้งไฟล์" }, { value: "60", label: "1 นาที" }, { value: "10", label: "10 วินาที" }]} />
            </div>
          </div>
          {running && <div className="brn-prog" data-brnprog><i style={{ width: `${readPct}%` }} /><span>{mode === "frm" ? "ถอดภาพเพื่อดูชนิดเฟรม" : "กำลังอ่านไฟล์"} {readPct}%</span></div>}
          <div className="brn-ov" onMouseDown={(e) => { ovDrag.current = 1; ovMove(e.clientX, e.currentTarget); }} onMouseMove={(e) => { if (ovDrag.current && (e.buttons & 1)) ovMove(e.clientX, e.currentTarget); }} onMouseUp={() => { ovDrag.current = null; }} title={zoom.length ? "ลากกรอบเพื่อเลื่อนช่วงที่ดู" : "ภาพรวมทั้งไฟล์"} data-brnov>
            <canvas ref={ovRef} style={{ width: "100%", height: ovH, display: "block" }} />
            {zoom.length > 0 && <div className="brn-win" style={{ left: `calc(${L}px + (100% - ${L + R}px) * ${z0 / total})`, width: `calc((100% - ${L + R}px) * ${span / total})` }} />}
          </div>
          <div className="brn-plotrow">
          <div ref={plotRef} className="brn-plot" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={() => { setHover(null); drag.current = null; setSel(null); }} onWheel={onWheel}
            onDoubleClick={resetZoom} data-brnplot>
            <canvas ref={cvRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            {sel && <div className="brn-sel" style={{ left: xOf(sel[0]), width: Math.max(1, xOf(sel[1]) - xOf(sel[0])), top: T, height: ph }}><span>{clock(sel[0])} – {clock(sel[1])}</span></div>}
            {hover && !sel && hv > 0 && (
              <div className="brn-tip" style={{ left: tipLeft, top: Math.max(T, Math.min(hover.y - 30, box.h - 120)) }} data-brntip>
                <div className="small">{clockMs(hover.t)}</div>
                <b>{rate(hv)}</b>
                <div className={"small " + (pct(hv) > 0 ? "up" : "down")}>{pct(hv) > 0 ? "สูงกว่า" : "ต่ำกว่า"}ค่าเฉลี่ย {Math.abs(pct(hv))}%</div>
                {mode === "frm" && hi >= 0 && <div className="brn-tipft"><span className={"brn-ft t" + S.typ[hi]}>{S.typ[hi]}</span>{typeName[S.typ[hi]] ?? "ไม่รู้ชนิด"}</div>}
                {group > 1 && <div className="small">แท่งนี้รวม {hb ? hb.i1 - hb.i0 + 1 : group} ช่วง</div>}
              </div>
            )}
            {!S.n && !running && <div className="brn-empty" data-brnerr>{err ? <><b>อ่านไฟล์นี้ไม่ได้</b><span>{err}</span><button type="button" className="btn btn-ghost btn-sm" onClick={pick}><IcFile size={15} />เปิดไฟล์อื่น</button></> : "ยังไม่มีข้อมูล"}</div>}
          </div>
          <BrVZoom value={vz} onChange={setVz} top={T} bottom={B} />
          </div>
          <div className="brn-foot">
            <span className="brn-vz"><span className="lbl">ขยายแนวตั้ง</span>
              <Seg small label="ขยายแนวตั้ง" value={vz === 1 || vz === 2 || vz === 4 ? String(vz) : "x"} onChange={(v) => setVz(Number(v))} options={[{ value: "1", label: "1×" }, { value: "2", label: "2×" }, { value: "4", label: "4×" }]} />
              <span className="brn-vzval" data-brnvz>{vzTxt(vz)}</span></span>
            <span className="brn-leg"><i className="lo" />ต่ำกว่าค่าเฉลี่ยสะสม</span>
            <span className="brn-leg"><i className="hi" />สูงกว่าค่าเฉลี่ยสะสม</span>
            <span className="brn-leg"><i className="over" />เกินเพดาน</span>
            <span className="brn-leg"><i className="cum" />ค่าเฉลี่ยสะสม</span>
            {!audio && <span className="brn-leg"><i className="key" />คีย์เฟรม</span>}
          </div>
          {/* แถบปักจุดจองที่ไว้ตลอด ยังไม่ปักขึ้นคำแนะนำจาง ๆ กราฟไม่ถูกดัน */}
          {!(pin != null && pi >= 0) && <div className="brn-pin empty" data-brnpinslot>ลากในกราฟเพื่อซูม · หมุนล้อซูมเข้าออก · ดับเบิลคลิกดูทั้งไฟล์ · คลิกในกราฟเพื่อปักจุด ดูค่าตรงนั้น</div>}
          {pin != null && pi >= 0 && (
            <div className="brn-pin" data-brnpin>
              <span className="brn-pinmark" />
              <span>ปักไว้ที่ <b>{clockMs(pin)}</b></span>
              <b>{rate(pv)}</b>
              <span className="small">{pct(pv) > 0 ? "สูงกว่า" : "ต่ำกว่า"}ค่าเฉลี่ย {Math.abs(pct(pv))}%</span>
              {mode === "frm" && <span className="brn-tipft"><span className={"brn-ft t" + S.typ[pi]}>{S.typ[pi]}</span>{typeName[S.typ[pi]] ?? ""}</span>}
              <span style={{ flex: 1 }} />
              {mode === "frm" && <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpI(true)} data-brnprevi>‹ I เฟรมก่อน</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => jumpI(false)} data-brnnexti>I เฟรมถัดไป ›</button></>}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPin(null)} title="เอาจุดที่ปักออก (Esc)">เอาออก</button>
            </div>
          )}
        </section>
      </div>
      <span hidden>{toneVer}{ver}</span>
    </div>
  );
}

/** ช่วงสั้นสุดที่ซูมเข้าได้ (วินาที) */
const HZ_MIN = 0.5;
/** แถบซูมแนวนอน · สเกลล็อก ซ้ายสุดทั้งไฟล์ ขวาสุด 0.5 วินาที · ลาก กด หมุนล้อ ลูกศร (หน้าตาเดียวกับ HZoom ของหน้ากราฟเสียง) */
function BrHZoom({ total, span, onSpan, off }: { total: number; span: number; onSpan: (s: number) => void; off: boolean }) {
  const root = useRef<HTMLSpanElement>(null), track = useRef<HTMLSpanElement>(null), drag = useRef(false);
  const ok = !off && total > HZ_MIN * 1.01, Lg = Math.log(Math.max(total, HZ_MIN * 1.01) / HZ_MIN);
  const pos = ok ? Math.max(0, Math.min(1, Math.log(total / Math.max(HZ_MIN, Math.min(total, span))) / Lg)) : 0;
  const fromX = (x: number) => { const r = track.current!.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); return total * Math.exp(-p * Lg); };
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
    else if (e.key === "Home") { e.preventDefault(); onSpan(total); }
    else if (e.key === "End") { e.preventDefault(); onSpan(HZ_MIN); }
  };
  const txt = `ช่วงที่ดู ${clock(Math.min(total, span))}`;
  return (
    <span className={"hzoom" + (ok ? "" : " off")} ref={root} data-brnhzoom>
      <span className="track" ref={track}
        onPointerDown={(e) => { if (!ok) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onSpan(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current) onSpan(fromX(e.clientX)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <span className="fill" style={{ width: pos * 100 + "%" }} />
        <span className="knob" role="slider" aria-orientation="horizontal" aria-label="ซูมเวลา" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)} aria-valuetext={txt}
          tabIndex={ok ? 0 : -1} title={`${txt} · ลากขวาซูมเข้า ลากซ้ายซูมออก`} style={{ left: pos * 100 + "%" }} onKeyDown={key} data-brnhknob />
      </span>
    </span>
  );
}

const VZ_MAX = 16;
const vzClamp = (v: number) => { const c = Math.max(1, Math.min(VZ_MAX, v)); return [1, 2, 4, 8, 16].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
const vzTxt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + "×";
/** แถบขยายแนวตั้งขวามือกราฟ · ลากขึ้นขยาย ลากลงกลับ 1 เท่า · สเกลล็อก 1 ถึง 16 เท่า · ดับเบิลคลิกกลับ 1 เท่า (หน้าตาเดียวกับ VZoom ของหน้ากราฟเสียง) */
function BrVZoom({ value, onChange, top, bottom }: { value: number; onChange: (v: number) => void; top: number; bottom: number }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false);
  const Lg = Math.log(VZ_MAX), pos = (v: number) => (Math.log(v) / Lg) * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); const p = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height)); return vzClamp(Math.exp(p * Lg)); };
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
    else if (e.key === "Home") { e.preventDefault(); onChange(1); }
    else if (e.key === "End") { e.preventDefault(); onChange(VZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom brn-vzoom" ref={root} style={{ paddingTop: top - 18, paddingBottom: bottom - 18 }} data-brnvzoom>
      <span className="ic" title="ลากขึ้น ขยายแนวตั้ง">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ขยายแนวตั้ง" aria-valuemin={1} aria-valuemax={VZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ขยายแนวตั้ง ${vzTxt(value)} · ลากขึ้นขยาย ลากลงกลับ · ดับเบิลคลิกกลับ 1×`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-brnvknob />
      </div>
      <span className="ic" title="ลากลง กลับ 1 เท่า">{ic("M4 12h16")}</span>
    </div>
  );
}
