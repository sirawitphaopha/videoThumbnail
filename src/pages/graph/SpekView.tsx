/* หน้ากราฟเสียง มุมมองความถี่แบบโปรแกรม Spek (SpekView) · ขอบความถี่สูงสุดที่มีเสียง ผลตรวจไฟล์ไม่เสียคุณภาพ แกนความถี่
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.7) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type GOverview, type GTrack, type GWindow } from "../../lib/api";
import Dropdown from "../../components/Dropdown";
import { FixedTime } from "../../components/ui";
import InfoTip from "../../components/InfoTip";
import type { Tip } from "../../lib/codecAdv";
import { SPEK_RES_TIP } from "../../lib/graphTips";
import { IbPlay } from "../../components/icons";
import { Prefs, ASK, OKI, Theme, WARN, dec, label, minus, noteOf, rulerTicks, spanDigits, spekRamp, tfmt, tfmtD } from "./common";
import { SaveBtn, drawMatrix, lut, screenK, useCanvas } from "./draw";
import { Fragment2 } from "./parts";
import { FZoom } from "./zoom";
import { CommonProps } from "./LoudView";

/* ---------- วิเคราะห์ (แบบ Spek) ---------- */
export const SPK = { L: 62, R: 92, T: 58, B: 36 };

/** ขอบบนของเสียง · top = ความถี่สูงสุดที่ดังกว่า −90 dB อย่างน้อย 5% ของเวลา
    cliff = ใต้ขอบ 1 kHz ดังกว่าเหนือขอบกี่ dB · ตัวเข้ารหัส MP3 AAC ตัดเป็นหน้าผา ต่างกันหลายสิบ dB · เสียงที่ค่อย ๆ เบาลงเองต่างกันน้อย
    ดีกว่ามอคอัปที่ดูแค่ top · เพลงที่ไม่มีเสียงสูงจริง ๆ ไม่โดนหาว่าแปลงมา (พี่กัน "ถ้าระบบเราทำได้ดีกว่า เอาตามระบบเรานะ") */
export function edgeOf(srcs: Uint8Array[], B: number, c0: number, c1: number, nyq: number) {
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

/** ตีความขอบบน · เกณฑ์ตามมอคอัปที่พี่กันผ่าน FLAC ต่ำกว่า 19.5 kHz · AC-3 กับ E-AC-3 ต่ำกว่า 19 kHz · AAC ต่ำกว่า 15.5 kHz · เพิ่มเงื่อนไขว่าต้องตัดเป็นหน้าผา
    ไฟล์ไม่บีบอัดทุกชนิดใช้เกณฑ์ 19.5 kHz แบบ FLAC · เดิมรู้จักแค่บางชื่อ WavPack TrueHD DTS-HD MA ที่แปลงจาก MP3 ขึ้นว่าไม่มีร่องรอย APE TAK TTA ไม่ถูกตรวจ (AUDIT 12 พ.ย. 2569 ข้อ 2)
    ชื่อชนิดเสียงมาจาก probe.rs audio_name ชนิดที่ไม่มีชื่อเฉพาะเป็นชื่อ ffmpeg ตัวพิมพ์ใหญ่ เช่น WAVPACK APE TAK TTA MLP */
/** ชนิดเสียงที่ไม่ลดคุณภาพ ใช้ทั้งหน้าความถี่และหน้าความถี่เฉลี่ย (AUDIT 12 พ.ย. 2569 ข้อ 21 ใช้รายชื่อเดียวกัน) */
export const LOSSLESS_CODECS = ["FLAC", "PCM", "ALAC", "TrueHD", "MLP", "DTS-HD MA", "WAVPACK", "APE", "TAK", "TTA"];
function spekVerdict(codec: string, rate: number, e: { top: number; cliff: number; full: boolean }): { warn: boolean; b: string; d: string; s?: string; c?: string } {
  const LOSSLESS = LOSSLESS_CODECS;
  const SHOW: Record<string, string> = { WAVPACK: "WavPack", APE: "Monkey's Audio" };
  const LOSSY_LIMIT: Record<string, number> = { "AC-3": 19000, "E-AC-3": 19000, AAC: 15500 };
  const lossless = LOSSLESS.includes(codec), nm = SHOW[codec] ?? codec;
  const limit = lossless ? 19500 : LOSSY_LIMIT[codec];
  const NORM: Record<string, string> = {
    FLAC: "FLAC ของจริงมีเสียงถึงราว 20–22 kHz", PCM: "ไฟล์ WAV ของจริงมีเสียงถึงราว 20 kHz ขึ้นไป", ALAC: "ALAC ของจริงมีเสียงถึงราว 20–22 kHz",
    "AC-3": "ปกติของ AC-3 มีเสียงถึงราว 19 kHz ขึ้นไป", "E-AC-3": "ปกติของ E-AC-3 มีเสียงถึงราว 19 kHz ขึ้นไป",
    AAC: "ปกติของ AAC ตัดเสียงสูงตามบิตเรต โดยบิตเรตต่ำตัดราว 16 kHz และบิตเรตสูงได้เกือบเต็มช่วง",
    MP3: "ปกติตัวเข้ารหัส MP3 ตัดเสียงสูงทิ้งเองตามบิตเรต โดยที่ 128 kb/s ตัดราว 17 kHz และที่ 320 kb/s ตัดราว 20 kHz", Opus: "ปกติของ Opus ตัดเสียงสูงที่ราว 20 kHz",
  };
  const norm = NORM[codec] ?? (lossless ? `${nm} ของจริงมีเสียงถึงราว 20 kHz ขึ้นไป` : undefined);
  const k = (e.top / 1000).toFixed(1), sharp = e.cliff > 25;
  // คำอังกฤษตรงรอยต่อประโยคต้องมีคำเชื่อม ไม่เขียนต่อกันห้วน ๆ (พี่กันทัก 13 พ.ย. 2569 "ที่ ซึ่ง อัน ก็เสริมไป ไม่เอาคำภาษษอังกิดเขียนต่อกันถ้ามันคือวรรค")
  const how = "ซึ่งดูได้จากขอบบนที่ตัดเป็นเส้นตรง";
  // s = คำสั้นบนแถบล่าง บอกผลตรง ๆ ไม่มีตัวเลข · b กับ d = คำอธิบายเต็มในปุ่ม ⓘ
  // (พี่กันทัก 13 พ.ย. 2569 "บอกแบบนี้จะรู้เรื่องไหมว่าปกติหรือไม่ ก็บอกว่าปกติสิ" · "จะเขียนหยุดที่ 16.8 ทำไม เรารู้เรื่องไหน")
  // c = คำเชื่อมระหว่าง b กับ d ในปุ่ม ⓘ ให้อ่านเป็นประโยคเดียว (พี่กันทัก 13 พ.ย. 2569 "โดย wevpack ต้องเชื่อมแบบนี้สิ" · "ซึ่ง wave pack ใส่คำเชื่อมสิ")
  if (e.top < 10000) return { warn: false, s: "ตรวจไม่ได้", c: "เพราะ", b: `เสียงสูงสุดราว ${k} kHz`, d: "ช่วงนี้แทบไม่มีเสียงสูง เช่น เสียงพูด เสียงทดสอบ หรือช่วงเงียบ จึงดูไม่ได้ว่าไฟล์แปลงมาไหม" };
  if (sharp && limit && e.top < limit) return { warn: true, s: lossless ? "น่าจะแปลงมาจาก MP3" : "น่าจะแปลงมาจากไฟล์คุณภาพต่ำ", c: "โดย", b: `เป็นไฟล์ ${nm} แต่เสียงหยุดที่ราว ${k} kHz`, d: `${norm} ดังนั้นไฟล์นี้น่าจะ${lossless ? "แปลงมาจาก MP3 หรือ AAC" : "แปลงต่อมาจากไฟล์ที่คุณภาพต่ำกว่า"} และคุณภาพไม่ได้ดีกว่าไฟล์ต้นทาง ${how}` };
  if (sharp && lossless && rate >= 88200 && e.top < 25000) return { warn: true, s: "ไม่ใช่ความละเอียดสูงจริง", c: "โดย", b: `ไฟล์ ${(rate / 1000).toLocaleString("en-US")} kHz แต่เสียงหยุดที่ราว ${k} kHz`, d: `ไฟล์ความละเอียดสูงที่อัดมาจริงมักมีเสียงเกิน 24 kHz ดังนั้นไฟล์นี้น่าจะแปลงขึ้นมาจากไฟล์ 44.1 หรือ 48 kHz และคุณภาพไม่ได้ดีกว่าไฟล์ต้นทาง ${how}` };
  const b = `เสียงสูงสุดราว ${k} kHz`, s = "ปกติ";
  if (!lossless) return { warn: false, s, c: "ซึ่ง", b, d: norm ?? (e.full ? "มีเสียงเต็มช่วงถึงขอบบนของไฟล์" : "ดูจากขอบบนของความถี่ที่มีเสียง") };
  if (e.top > 24500) return { warn: false, s, c: "ซึ่ง", b, d: "มีเสียงสูงเกิน 24 kHz แบบไฟล์ความละเอียดสูงที่อัดมาจริง จึงไม่มีร่องรอยการตัดเสียงสูง" };
  if (e.top < 19500) return { warn: false, s, c: "ซึ่ง", b, d: "เสียงสูงค่อย ๆ เบาลงเอง ไม่ได้ตัดเป็นเส้นตรงแบบไฟล์ที่แปลงมาจาก MP3 จึงน่าจะเป็นลักษณะของเสียงต้นฉบับ เช่น เพลงหรือหนังเก่า" };
  // ขอบตัดเป็นเส้นตรงแต่สูงพอ ตัวกรองตอนอัดหรือแปลงอัตราสุ่มก็ตัดแบบนี้ MP3 บิตเรตสูงก็ตัดราว 20 kHz จึงห้ามบอกว่าไม่มีร่องรอย
  if (sharp && !e.full) return { warn: false, s: "บอกแน่ไม่ได้", c: "โดย", b, d: "ขอบบนตัดตรงแต่อยู่สูง อาจเป็นตัวกรองตอนอัดเสียง หรือแปลงมาจาก MP3 บิตเรตสูงก็ได้" };
  return { warn: false, s, c: "ซึ่ง", b, d: `${norm} และไฟล์นี้ไม่มีร่องรอยการตัดเสียงสูง` };
}
/** ป้ายความถี่บนแกน · ต่ำกว่า 1 kHz เป็น Hz */
const hzTxt = (f: number) => (f >= 1000 ? `${+(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : `${Math.round(f)} Hz`);
const SPEK_LOG_MIN = 20;
/** แกนความถี่ บอกความหมายของ Linear กับ Log พร้อมตัวอย่างตัวเลข (พี่กันทัก 13 พ.ย. 2569 "คำอธิบายไม่ได้บอกความหายของ เสนตรง กับ ล็อก เลย" · ปุ่มใช้คำอังกฤษ "อันไหนคำอังกิด ไม่ต้อแปล") */
const SPEK_AXIS_TIP: Tip = {
  w: "แกนความถี่คือแกนตั้งของกราฟ เสียงต่ำอยู่ล่างและเสียงสูงอยู่บน ส่วนสองแบบนี้ต่างกันที่การแบ่งระยะบนแกน",
  o: [
    ["Linear", "แบ่งระยะเท่ากันทุก Hz เช่น ช่วง 0 ถึง 1 kHz สูงเท่ากับช่วง 20 ถึง 21 kHz แบบเดียวกับโปรแกรม Spek", "เห็นย่านเสียงสูงชัด ใช้ดูว่าไฟล์ถูกตัดเสียงสูงไหม", "เสียงต่ำ เสียงร้อง และเบส เบียดกันอยู่ขอบล่างนิดเดียว"],
    ["Log", "ย่อมาจาก Logarithm ทุกครั้งที่ความถี่เพิ่มเป็นสองเท่าจะได้ระยะเท่ากัน เช่น ช่วง 100 ถึง 200 Hz สูงเท่ากับช่วง 1 ถึง 2 kHz ซึ่งตรงกับที่หูคนได้ยิน", "เห็นเบส เสียงร้อง และโน้ตดนตรีชัด", "ย่านเสียงสูงถูกบีบ ดูรอยตัดเสียงสูงยากกว่า"],
  ],
  r: "ดูว่าไฟล์แปลงมาไหมใช้ Linear ส่วนดูเสียงร้องหรือเบสใช้ Log",
};
// SPEK_RES_TIP (ละเอียด กับ ภาพรวม) อยู่ lib/graphTips.ts หน้าตั้งค่าใช้ด้วย

export function SpekView({ onBusy, held, resetN, tools, light, onPanT, scroller, ov, win, track, fileName, names, t0, t1, zoomBox, scmap, th, audioOnly, play, save, exportRef, plotRef, at, axis, setAxis, res, setRes }: CommonProps & { onBusy: (on: boolean) => void; held: GWindow | null; resetN: number; tools?: React.ReactNode; light: boolean; onPanT: (center: number) => void; ov: GOverview; win: GWindow | null; track: GTrack | undefined; fileName: string; names: string[]; t0: number; t1: number; zoomBox: React.ReactNode; scmap: Prefs["scmap"]; setScmap: (v: Prefs["scmap"]) => void; th: Theme; audioOnly: boolean; play: () => void; at: number; axis: "lin" | "log"; setAxis: (v: "lin" | "log") => void; res: "fine" | "coarse"; setRes: (v: "fine" | "coarse") => void }) {
  // ช่องที่ดู −1 รวมทุกช่อง · −2 แสดงทุกช่องเรียงลงมา · ตัวเลขคือช่องเดียว (BUGS ข้อ 14 พี่กัน "ถ้ามันมีหลาย ch ก็เรียงกันลงมาเลย")
  const [ch, setCh] = useState(-1);
  const rate = track?.rate ?? 48000, nyq = rate / 2;
  const ramp = spekRamp(scmap, th.ramp, light);
  const toolBox = useRef<HTMLDivElement>(null), areaRef = useRef<HTMLDivElement>(null), vsRef = useRef<HTMLDivElement>(null), vsDrag = useRef(false);
  // ซูมแนวตั้ง fz เท่า ขอบล่างของช่วงที่เห็น fb เป็นสัดส่วนของแกน (เส้นตรงหรือล็อก) · ซูมแล้วคงกึ่งกลางเดิม
  const [fz, setFzRaw] = useState(1), [fb, setFb] = useState(0);
  const clampB = (b: number, z: number) => Math.max(0, Math.min(1 - 1 / z, b));
  const fzNow = useRef(1); fzNow.current = fz;
  useEffect(() => { if (resetN) { setFzRaw(1); setFb(0); } }, [resetN]);
  const setFz = useCallback((z: number) => { const old = fzNow.current; if (z === old) return; setFb((b) => clampB(b + 1 / old / 2 - 1 / z / 2, z)); setFzRaw(z); }, []);
  const canPan = fz > 1 || t1 - t0 < ov.duration - 0.01;
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<{ x: number; y: number; fb: number; c: number; span: number; pw: number; ph: number } | null>(null);
  // ภาพรวมใช้ข้อมูลทั้งไฟล์ที่อ่านไว้แล้ว ไม่ใช้ช่วงที่อ่านคมตอนซูม
  const W = res === "fine" ? win : null, H = res === "fine" ? held : null;
  const all = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  const mixed = all.length ? all : [0];
  const bands: number[][] = ch === -2 ? (names.length ? names.map((_, i) => [i]) : [[0]]) : [ch >= 0 ? [ch] : mixed];
  const GAP = 14;
  const bandRect = (h: number) => { const PH = h - SPK.T - SPK.B, n = bands.length, bh = (PH - GAP * (n - 1)) / n; return (k: number) => ({ y: SPK.T + k * (bh + GAP), h: bh }); };
  // แถวบนจอเป็นความถี่เท่าไหร่ · u คือสัดส่วนจากล่างของแกนทั้งหมด
  const fAt = (u: number) => (axis === "log" ? SPEK_LOG_MIN * Math.pow(nyq / SPEK_LOG_MIN, u) : u * nyq);
  const uOf = (f: number) => (axis === "log" ? Math.log(Math.max(SPEK_LOG_MIN, f) / SPEK_LOG_MIN) / Math.log(nyq / SPEK_LOG_MIN) : f / nyq);
  const panDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canPan || e.button !== 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    dragFrom.current = { x: e.clientX, y: e.clientY, fb, c: (t0 + t1) / 2, span: t1 - t0, pw: Math.max(1, r.width - SPK.L - SPK.R), ph: Math.max(1, bandRect(r.height)(0).h) };
    setDragging(true); setHov(null); onBusy(true);
  };
  const [hov, setHov] = useState<{ x: number; y: number } | null>(null);
  const panMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragFrom.current;
    if (!d) { const r = e.currentTarget.getBoundingClientRect(); setHov({ x: e.clientX - r.left, y: e.clientY - r.top }); return; }
    if (fz > 1) setFb(clampB(d.fb + (e.clientY - d.y) / d.ph / fz, fz));
    if (d.span < ov.duration - 0.01) onPanT(d.c - (e.clientX - d.x) / d.pw * d.span);
  };
  const panEnd = () => { if (dragFrom.current) onBusy(false); dragFrom.current = null; setDragging(false); };
  const vsTo = (y: number) => { const r = vsRef.current!.getBoundingClientRect(); setFb(clampB(1 - (y - r.top) / r.height - 1 / fz / 2, fz)); };
  useEffect(() => {
    const el = areaRef.current; if (!el) return;
    const fn = (e: WheelEvent) => { if (fz <= 1 || e.ctrlKey) return; e.preventDefault(); e.stopPropagation(); setFb((b) => clampB(b + (e.deltaY < 0 ? 0.25 : -0.25) / fz, fz)); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [fz]);
  // ข้อมูลของชุดช่องหนึ่ง (รวมเป็นค่าสูงสุดของทุกช่องในชุด)
  const srcOf = (set: number[]) => {
    const srcs = set.map((i) => (W ? dec(W.spec[i]) : dec(ov.spec[i])));
    const bins = W ? W.bins : ov.specBins, cols = W ? Math.round(srcs[0].length / bins) : ov.specCols;
    const c0 = W ? 0 : Math.floor(t0 / ov.duration * cols), c1 = W ? cols : Math.max(c0 + 1, Math.ceil(t1 / ov.duration * cols));
    return { srcs, bins, cols, c0, c1 };
  };
  // ขอบบนของเสียง จากช่องรวมของช่วงที่เห็น
  const edge = useMemo(() => {
    const { srcs, bins, c0, c1 } = srcOf(ch >= 0 ? [ch] : mixed);
    return edgeOf(srcs, bins, c0, c1, nyq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov, W, t0, t1, ch]);
  const ink = light ? { bg: "#ffffff", line: "#333333", title: "#1c1c1c", sub: "#555555", tick: "#333333" } : { bg: "#000000", line: "#ffffff", title: "#ffffff", sub: "#d8d8d8", tick: "#e6e6e6" };
  const drawSpek = (g: CanvasRenderingContext2D, w: number, h: number, full: boolean) => {
    g.fillStyle = ink.bg; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = SPK, PW = w - L - R, PH = h - T - B, colors = lut([...ramp]), band = bandRect(h);
    bands.forEach((set, k) => {
      const { y, h: bh } = band(k);
      const { srcs, bins, c0, c1 } = srcOf(set);
      const rows = Math.max(32, Math.min(512, Math.round(bh)));
      const binAt = (row: number, nb: number) => Math.min(nb - 1, Math.max(0, Math.floor(fAt(fb + (row + 0.5) / rows / fz) / nyq * nb)));
      const map = Array.from({ length: rows }, (_, r) => binAt(r, bins));
      drawMatrix(g, L, y, PW, bh, c1 - c0, rows, colors, (row, col) => { let m = 0; const b = map[row]; for (const d of srcs) m = Math.max(m, d[(c0 + col) * bins + b]); return m; });
      // ระหว่างลาก ส่วนที่เคยอ่านคมแล้ววาดทับตรงตำแหน่งใหม่
      if (!W && H) {
        const hs = set.map((i) => dec(H.spec[i])), hb = H.bins, hc = Math.round(hs[0].length / hb), hmap = Array.from({ length: rows }, (_, r) => binAt(r, hb)), kx = PW / (t1 - t0 || 1);
        g.save(); g.beginPath(); g.rect(L, y, PW, bh); g.clip();
        drawMatrix(g, L + (H.t0 - t0) * kx, y, (H.t1 - H.t0) * kx, bh, hc, rows, colors, (row, col) => { let m = 0; const b = hmap[row]; for (const d of hs) m = Math.max(m, d[col * hb + b]); return m; });
        g.restore();
      }
      g.strokeStyle = ink.line; g.lineWidth = 1; g.strokeRect(L - 0.5, y - 0.5, PW + 1, bh + 1);
      // แกนความถี่ของแถบนี้
      g.fillStyle = ink.tick; g.font = "11.5px Sarabun, sans-serif"; g.textBaseline = "middle"; g.textAlign = "right";
      const u0 = fb, u1 = fb + 1 / fz, yOf = (f: number) => y + bh * (1 - (uOf(f) - u0) / (u1 - u0));
      let ticks: number[];
      if (axis === "log") ticks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter((f) => f <= nyq);
      else { const f0 = fAt(u0), fSpan = fAt(u1) - f0, fs = [100, 250, 500, 1000, 2000, 4000, 8000, 16000].find((x) => bh * x / fSpan >= 24) ?? 32000; ticks = []; for (let f = Math.ceil(f0 / fs) * fs; f <= f0 + fSpan + 1; f += fs) ticks.push(f); }
      let lastY = Infinity;
      for (const f of ticks) { const ty = yOf(f); if (ty < y - 1 || ty > y + bh + 1 || lastY - ty < 16) continue; lastY = ty; g.fillRect(L - 5, Math.round(ty), 5, 1); g.fillText(hzTxt(f), L - 8, ty); }
      // ชื่อช่องมุมซ้ายบนของแถบ เมื่อแสดงทุกช่อง
      if (bands.length > 1) {
        const nm = `${label(names, names[set[0]]).code} ${label(names, names[set[0]]).th}`;
        g.font = "700 12px Sarabun, sans-serif"; g.textAlign = "left"; g.textBaseline = "top";
        const tw = g.measureText(nm).width; g.fillStyle = light ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.6)"; g.fillRect(L + 6, y + 6, tw + 12, 20);
        g.fillStyle = ink.title; g.fillText(nm, L + 12, y + 9);
      }
    });
    const room = full ? Infinity : w - L - R - (toolBox.current?.offsetWidth ?? 450) - 16;
    const fit = (txt: string) => { if (g.measureText(txt).width <= room) return txt; let n = txt.length; while (n > 1 && g.measureText(txt.slice(0, n) + "…").width > room) n--; return txt.slice(0, n) + "…"; };
    g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillStyle = ink.title; g.font = "700 13.5px Sarabun, sans-serif"; g.fillText(fit(fileName), L, 22);
    g.fillStyle = ink.sub; g.font = "12px Sarabun, sans-serif";
    const chTxt = ch === -2 ? `${names.length} channels separately` : ch < 0 ? `${mixed.length} channels mixed` : `channel ${label(names, names[ch]).code}`;
    g.fillText(fit(`${track?.codec ?? ""}, ${rate.toLocaleString("en-US")} Hz${track?.bits ? `, ${track.bits}-bit` : ""}, ${chTxt}, ${axis === "log" ? "log" : "linear"}`), L, 42);
    g.fillStyle = ink.tick; g.font = "11.5px Sarabun, sans-serif";
    g.textAlign = "center"; g.textBaseline = "top"; for (const { x, label: lb } of rulerTicks(t0, t1, 10)) { const px = L + (x - t0) / (t1 - t0 || 1) * PW; g.fillRect(Math.round(px), T + PH, 1, 5); g.fillText(lb, px, T + PH + 8); }
    const bx = L + PW + 18, grad = g.createLinearGradient(0, T, 0, T + PH); ramp.slice().reverse().forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    g.fillStyle = grad; g.fillRect(bx, T, 12, PH); g.strokeStyle = ink.line; if (light) g.strokeRect(bx - 0.5, T - 0.5, 13, PH + 1);
    g.fillStyle = ink.tick; g.textAlign = "left"; g.textBaseline = "middle";
    for (let d = 0; d >= -120; d -= 20) { const yy = T + PH * (-d / 120); g.fillRect(bx + 12, Math.round(yy), 4, 1); g.fillText(`${d === 0 ? "0" : "−" + -d} dB`, bx + 20, yy); }
  };
  const ref = useCanvas((g, w, h) => drawSpek(g, w, h, false), [ov, W, H, t0, t1, ch, scmap, th, light, fz, fb, axis, res, names.length]);
  exportRef.current = (outW) => {
    const cv = ref.current; if (!cv) return null;
    const out = document.createElement("canvas"), r = outW ? outW / cv.clientWidth : screenK(); out.width = Math.round(cv.clientWidth * r); out.height = Math.round(cv.clientHeight * r);
    const g = out.getContext("2d"); if (!g) return null;
    g.setTransform(r, 0, 0, r, 0, 0); drawSpek(g, cv.clientWidth, cv.clientHeight, true);
    return out;
  };
  // เส้นตามเมาส์ เส้นตั้งบอกเวลา เส้นนอนบอกความถี่ กล่องบอก เวลา ความถี่ โน้ต ความดังตรงจุดนั้น (BUGS ข้อ 40 พี่กัน "เอาเมาส์ไปชี้ มันควรมีเส้นอะไรวิ่งด้วยไหม")
  const probe = (() => {
    const cv = ref.current; if (!hov || !cv || dragging) return null;
    const PW = cv.clientWidth - SPK.L - SPK.R, band = bandRect(cv.clientHeight);
    if (hov.x < SPK.L || hov.x > SPK.L + PW) return null;
    const k = bands.findIndex((_, i) => { const b = band(i); return hov.y >= b.y && hov.y <= b.y + b.h; });
    if (k < 0) return null;
    const b = band(k), t = t0 + (hov.x - SPK.L) / PW * (t1 - t0), u = fb + (1 - (hov.y - b.y) / b.h) / fz, f = fAt(u);
    const { srcs, bins, c0, c1 } = srcOf(bands[k]);
    const col = Math.min(c1 - 1, c0 + Math.floor((hov.x - SPK.L) / PW * (c1 - c0))), bin = Math.min(bins - 1, Math.max(0, Math.floor(f / nyq * bins)));
    let v = 0; for (const d of srcs) v = Math.max(v, d[col * bins + bin] ?? 0);
    const db = v / 255 * 120 - 120;
    return { x: hov.x, y: hov.y, top: SPK.T, height: cv.clientHeight - SPK.T - SPK.B, bandTop: b.y, t, f, db, ch: bands.length > 1 ? label(names, names[bands[k][0]]).code : "" };
  })();
  const verdict = spekVerdict(track?.codec ?? "", rate, edge);
  // คำอธิบายเต็มในปุ่ม ⓘ ต่อหัวเรื่องกับเนื้อความด้วยคำเชื่อม อ่านเป็นประโยคเดียว · หน้าคำอังกฤษเว้นวรรคหนึ่งช่อง
  const vFull = `${verdict.b} ${verdict.c ?? "โดย"}${/^[A-Za-z]/.test(verdict.d) ? " " : ""}${verdict.d}`;
  // คำสั้นของผลตรวจแสดงเมื่อแถบล่างมีที่พอ ไม่พอ (เช่นไฟล์หนังที่มีปุ่มเปิดเล่นเพิ่ม) ซ่อนคำ เหลือไอคอนสีกับปุ่ม ⓘ แถบล่างบรรทัดเดียวเสมอ
  // วัดที่ว่างจริงทุกครั้งที่แถบหรือปุ่มเปลี่ยนขนาด · คำที่ซ่อนยังอยู่ในหน้าแบบมองไม่เห็น จึงวัดความกว้างได้ ไม่สลับไปมา
  const footRef = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);
  useLayoutEffect(() => {
    const foot = footRef.current;
    if (!foot) return;
    const fit = () => {
      const chip = foot.querySelector<HTMLElement>("[data-spekverdict]");
      const word = chip?.querySelector<HTMLElement>(":scope > b");
      const rest = foot.children[1] as HTMLElement | undefined;
      if (!chip || !word || !rest) return;
      const cs = getComputedStyle(foot), chipGap = parseFloat(getComputedStyle(chip).columnGap) || 0;
      const room = foot.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - rest.getBoundingClientRect().width - (parseFloat(cs.columnGap) || 0);
      const wordW = word.getBoundingClientRect().width;
      const hidden = word.classList.contains("hid");
      const need = chip.getBoundingClientRect().width + (hidden ? wordW + chipGap : 0);
      const next = need > room + 0.5;
      if (next !== hidden) setTight(next);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(foot);
    if (foot.children[1]) ro.observe(foot.children[1]);
    return () => ro.disconnect();
  }, [verdict.s, verdict.b]);
  const chOpts: [string, string][] = [["-1", "รวมทุกช่อง"], ...names.map((c, i) => [String(i), `${label(names, c).code} ${label(names, c).th}`] as [string, string]), ...(names.length > 1 ? [["-2", "แสดงทุกช่อง"] as [string, string]] : [])];
  const segBox = <T extends string>(opts: [T, React.ReactNode][], v: T, on: (x: T) => void, data: string) => <div className="seg" {...{ [data]: "" }}>{opts.map(([k, l]) => <button key={k} type="button" className={v === k ? "on" : ""} onClick={() => on(k)} data-k={k}>{l}</button>)}</div>;
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick"><div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><b>ความถี่</b>
        {/* ปุ่มช่องเป็นแถวเมื่อพอ ไม่พอ (หน้าต่างแคบหรือไฟล์หลายช่อง) เป็นดรอปดาวน์ (พี่กัน "ขอเป็นปุ่มกดเรียงตามยาว ไม่ drop down" · "อันนี้เอาไปปรับใช้ได้") */}
        {names.length <= 3 && <span className="spekch-seg">{segBox(chOpts, String(ch), (v) => setCh(Number(v)), "data-spekchseg")}</span>}
        <span className={names.length <= 3 ? "spekch-dd" : "spekch-dd on"} data-spekch><Dropdown label="ช่องที่ดู" value={String(ch)} onChange={(v) => setCh(Number(v))} options={chOpts.map(([value, l]) => ({ value, label: l }))} /></span></span>{zoomBox}</div></div>
      <div className="spekarea">
        <div ref={areaRef} className="spekbox" onPointerLeave={() => setHov(null)}><canvas className={"cv fillcv" + (light ? " spekcv-light" : "") + (canPan ? " spekpan" : "") + (dragging ? " dragging" : "")} style={{ borderRadius: 8 }} ref={ref} data-spek onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd} /><div ref={toolBox} className="spektools" style={{ right: SPK.R }}>{tools}</div>
          {probe && <>
            <div className={"spekxh" + (light ? " light" : "")} style={{ left: probe.x, top: probe.top, height: probe.height }} data-spekxh />
            <div className={"spekxh h" + (light ? " light" : "")} style={{ top: probe.y, left: SPK.L, right: SPK.R }} />
            <div className="tip spektip" style={{ left: probe.x + 14 + 190 > (ref.current?.clientWidth ?? 0) - SPK.R ? probe.x - 14 - 190 : probe.x + 14, top: Math.max(probe.top + 4, probe.y - 70) }} data-spektip>
              <div className="t">{tfmtD(probe.t, spanDigits(t1 - t0))}{probe.ch && <span style={{ fontWeight: 400, marginLeft: 6 }}>ช่อง {probe.ch}</span>}</div>
              <div className="r"><Fragment2 v={probe.f >= 1000 ? `${(probe.f / 1000).toFixed(2)} kHz` : `${Math.round(probe.f)} Hz`} k={probe.f > 15 ? `โน้ต ${noteOf(probe.f)}` : "ความถี่"} /><Fragment2 v={probe.db <= -119.5 ? "เงียบ" : `${minus(probe.db.toFixed(0))} dB`} k="ความดังตรงนี้" /></div>
            </div>
          </>}
          {fz > 1 && <div ref={vsRef} className={"spekvs" + (light ? " light" : "")} style={{ top: SPK.T, bottom: SPK.B, right: SPK.R - 14 }} title="ลากเพื่อเลื่อนย่านความถี่ขึ้นลง หรือหมุนล้อเมาส์บนกราฟก็ได้" data-spekvs
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); vsDrag.current = true; vsTo(e.clientY); }} onPointerMove={(e) => { if (vsDrag.current) vsTo(e.clientY); }} onPointerUp={() => { vsDrag.current = false; }} onPointerCancel={() => { vsDrag.current = false; }}>
            <i style={{ height: 100 / fz + "%", bottom: fb * 100 + "%" }} data-spekthumb /></div>}
        </div>
        <FZoom value={fz} onChange={setFz} />
      </div>
      {scroller?.(0, 0)}
      <div className="agfoot" ref={footRef}>
        {/* ผลตรวจในแถบล่างเขียนสั้นบรรทัดเดียว กดปุ่ม ⓘ อ่านเพิ่มเติม · แถบล่างสูงเท่าเดิมทุกไฟล์
            เดิมข้อความเต็มตัดบรรทัดในกล่อง กล่องสูงหลายบรรทัดดันแถบล่างให้ใหญ่ (พี่กันทัก 13 พ.ย. 2569 "มาสร้างกรอบคำเตือนที่ทำให้กรอบล่างมันใหญ่ทำไม" · "ก็เขียนคำย่อ เเล้วให้กดอ่านเพิ่มเติมเองสิ") */}
        {/* สี เตือนสีเหลือง ปกติสีเขียวแบบป้ายสมบูรณ์ ตรวจไม่ได้กับบอกแน่ไม่ได้สีกลาง */}
        <div className={"stat " + (verdict.warn ? "warn" : verdict.s === "ปกติ" ? "ok" : "info")} title={vFull} data-spekverdict data-full={vFull} data-cliff={Math.round(edge.cliff)}>
          {/* ทุกกล่องมีไอคอนนำหน้า เตือนสามเหลี่ยม ปกติติ๊กถูก ตรวจไม่ได้กับบอกแน่ไม่ได้เครื่องหมายคำถาม · เดิมผลปกติใช้วงกลม i เหมือนปุ่ม ⓘ เห็นสองอันติดกัน */}
          {verdict.warn ? WARN : verdict.s === "ปกติ" ? OKI : ASK}
          <b className={tight ? "hid" : undefined} aria-hidden={tight || undefined}>{verdict.s ?? verdict.b}</b>
          <InfoTip title={verdict.warn ? "ทำไมน่าจะแปลงมา" : "ผลตรวจขอบบนของเสียง"} tip={{ w: vFull }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* ละเอียด กับ ภาพรวม · แกนเส้นตรงกับล็อก (BUGS ข้อ 14 พี่กัน "เพิ่มอีกตัวเลือก คือแสดงแบบหยาบ" · "เอ้ย งี้ได้ด้วยเหรอ เอาด้วยสิ") */}
          {/* เส้นแบ่งระหว่างกลุ่มปุ่ม (พี่กันสั่ง 13 พ.ย. 2569 "ขอเส้นแบ่งเเยกปุ่มที") */}
          {segBox<"fine" | "coarse">([["fine", "ละเอียด"], ["coarse", "ภาพรวม"]], res, setRes, "data-spekres")}<InfoTip title="ละเอียด กับ ภาพรวม" tip={SPEK_RES_TIP} />
          <span className="fsep" aria-hidden="true" />
          <span className="lbl">แกน</span>{segBox<"lin" | "log">([["lin", "Linear"], ["log", "Log"]], axis, setAxis, "data-spekaxis")}<InfoTip title="แกนความถี่" tip={SPEK_AXIS_TIP} />
          <span className="fsep" aria-hidden="true" />
          {!audioOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={play}><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(ov.duration)} /></span></button>}<SaveBtn onClick={save} /></div></div>
    </div>
  );
}
