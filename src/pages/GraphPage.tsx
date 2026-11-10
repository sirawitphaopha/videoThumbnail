/* หน้ากราฟเสียง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
   6 แบบ รูปคลื่น (เส้นละเอียด หรือ แท่ง) · ความถี่ (สีตามชุด หรือ สีรุ้ง) · ความดัง · ซ้อนเทียบ · วิเคราะห์ (แบบ Spek) · ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity)
   ข้อมูลจริงจาก audiograph.rs · ภาพรวมทั้งไฟล์อ่านครั้งเดียว ช่วงที่ซูมอ่านเฉพาะช่วง ระหว่างรอใช้ภาพรวมวาดไปก่อน ไม่มีจอว่าง */
import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { AUDIO_EXT, GRAPH_IMG_DEFAULT, checkApi, convertApi, graphApi, inApp, pickFile, pickFolder, pickSave, thumbUrl, type GInfo, type GOverview, type GProgress, type GPsd, type GTrack, type GWindow, type Movie, type AudioFile, type CoverData, type GraphImg } from "../lib/api";
import ConvertPane from "../components/ConvertPane";
import "../styles/av.css";
import TagDialog, { tagRows, whyNone } from "../components/TagDialog";
import { addFiles } from "../lib/convertJob";
import { useLibrary } from "../lib/library";
import { useToast } from "../components/Toasts";
import Dropdown from "../components/Dropdown";
import { CardIcon, FixedTime, Keep, LoadPill, Phr, Skel, Switch, dropClick } from "../components/ui";
import { fmtSize } from "../lib/format";
import { diffOf, type DiffResult } from "../lib/graphDiff";
import { useSettings } from "../lib/settings";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose } from "../lib/popup";
import { IcExpand, IcFile, IcFolder, IcMix, IcPlus, IcBitrate } from "../components/icons";
import { IcSearch, IbStop, IcRefresh, IcGraph, IbSave, IcClose, IbTable, IbPlay } from "../components/icons";

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
/** ชุดสีของกราฟวิเคราะห์ · พื้นสว่างให้ช่วงเงียบเป็นสีขาว เข้ากับพื้น (พี่กันขอ 9 พ.ย. 2569 "ติ๊กเลือกเปลี่ยนจากสีพื้นหลังดำ เป็นสีสว่าง") */
const RAINBOW_LIGHT = ["#ffffff", "#d6e4ff", "#7fb0ff", "#00aaff", "#00e6d2", "#64ff64", "#e6f000", "#ff9600", "#ff1e1e", "#ff46c8"];
const spekRamp = (name: "heat" | "rainbow" | "mono" | "theme", themeRamp: readonly string[], light: boolean): readonly string[] => {
  if (!light) return { heat: HEAT, rainbow: RAINBOW, mono: MONO, theme: themeRamp }[name];
  return { heat: [...HEAT].reverse(), rainbow: RAINBOW_LIGHT, mono: [...MONO].reverse(), theme: [...themeRamp].reverse() }[name];
};
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
const ZOOMS: [number | "all", string][] = [["all", "ทั้งไฟล์"], [600, "10 นาที"], [240, "4 นาที"], [30, "30 วินาที"]];
const PSD_SPANS: [number | "all", string][] = [["all", "ทั้งไฟล์"], [120, "2 นาที"], [30, "30 วินาที"], [10, "10 วินาที"]];
const TH: Record<string, string> = { FL: "ซ้ายหน้า", FR: "ขวาหน้า", FC: "กลาง · เสียงพูด", LFE: "เสียงเบส", BL: "ซ้ายหลัง", BR: "ขวาหลัง", SL: "ซ้ายข้าง", SR: "ขวาข้าง", BC: "หลังกลาง", FLC: "หน้าซ้ายกลาง", FRC: "หน้าขวากลาง" };
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteOf = (f: number) => { const n = Math.round(12 * Math.log2(f / 440)) + 57; return NOTES[((n % 12) + 12) % 12] + Math.floor(n / 12); };
const WARN = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></svg>;

function tfmt(t: number) { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; }
const minus = (s: string) => s.replace("-", "−");
/** ข้อความหลายท่อนคั่นด้วย " · " แยกเป็นบรรทัด ตัดคำเฉพาะตรงเว้นวรรค ไม่ตัดกลางวลี (เคยตัด "MP3 | หรือ AAC" เจอตอนตรวจภาพ) */
const lines = (s: string) => s.split(" · ").map((l) => <div key={l}><Phr>{l}</Phr></div>);
/** ยอดหรือความดังเฉลี่ยของช่อง (dB) · ช่องที่เงียบทั้งไฟล์บอกว่าเงียบ ไม่ขึ้น −120.0 dB */
const pkTxt = (v: number) => (v <= -119 ? "เงียบ" : minus(v.toFixed(1)) + " dB");
const dbTxt = (v: number) => v <= 0.0001 ? "−∞" : minus((20 * Math.log10(v)).toFixed(1));
const decMem = new Map<string, Uint8Array>();
const dec = (s: string) => {
  let d = decMem.get(s);
  if (!d) { d = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); decMem.set(s, d); if (decMem.size > 64) decMem.delete(decMem.keys().next().value as string); }
  return d;
};
/** ใส่ของลงที่จำแบบจำกัดจำนวน เต็มแล้วทิ้งอันเก่าสุด */
function memPut<T>(m: Map<string, T>, k: string, v: T, max: number) { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value as string); }

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

type HiCanvas = HTMLCanvasElement & { __draw?: (g: CanvasRenderingContext2D, w: number, h: number, r: number) => void };
const screenK = () => window.devicePixelRatio || 1;
/** วาดกราฟใหม่บนผ้าใบใหม่ที่ k เท่าของขนาดบนจอ ตัวหนังสือกับเส้นคม ไม่ใช่ขยายภาพ
    แถบรูปคลื่นกับความถี่ (data-rawdraw) ไม่มีตัวหนังสือ วาดเต็มพิกเซลจริงตรง ๆ ได้รายละเอียดครบทุกคอลัมน์ */
function hiCopy(cv: HiCanvas, k: number): HTMLCanvasElement {
  const cw = cv.clientWidth, ch = cv.clientHeight, out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const g = out.getContext("2d");
  if (!g) return out;
  if (!cv.__draw) { g.drawImage(cv, 0, 0, out.width, out.height); return out; }
  if (cv.dataset.rawdraw !== undefined) cv.__draw(g, out.width, out.height, 1);
  else { g.setTransform(k, 0, 0, k, 0, 0); cv.__draw(g, cw, ch, k); }
  return out;
}
const IMG_EXT: Record<GraphImg["format"], string> = { png: "png", jpg: "jpg", webp: "webp", heic: "heic", tiff: "tif" };
const IMG_LABEL: Record<GraphImg["format"], string> = { png: "รูป PNG", jpg: "รูป JPG", webp: "รูป WebP", heic: "รูป HEIC", tiff: "รูป TIFF" };
const imgName = (base: string, view: string, o: GraphImg) => base + (o.nameGraph ? " " + view : " กราฟเสียง") + "." + IMG_EXT[o.format];
/** ที่เก็บตั้งต้นคือโฟลเดอร์ของไฟล์ที่ดูอยู่ (พี่กันสั่ง 9 พ.ย. 2569 "เอาที่อยู่ไฟล์เป็นค่าตั้งต้นด้วย") · เปลี่ยนในกล่องเลือกที่เก็บได้ */
const beside = (file: string, name: string) => file.replace(/[^\\/]*$/, "") + name;
/** ที่อยู่ไฟล์รูปตามค่าที่ตั้ง · ถามทุกครั้งเปิดกล่องเลือกที่เก็บ · ไม่ถามบันทึกเลย ชื่อซ้ำต่อท้าย (2) ไม่เขียนทับ */
async function imgTarget(file: string, name: string, o: GraphImg): Promise<string | null> {
  const full = o.dirMode === "folder" && o.dir ? o.dir.replace(/[\\/]+$/, "") + "\\" + name : beside(file, name);
  return o.ask ? pickSave(full, IMG_EXT[o.format], IMG_LABEL[o.format]) : full;
}
const waitPaint = () => new Promise((r) => setTimeout(r, 40));
/** แถบหัวรูป ชื่อไฟล์ ช่วงเวลา สีของแต่ละไฟล์ · ปิดได้ในหน้าตั้งค่า */
/** พื้นหลังโปร่งใสตอนบันทึก (พี่กันสั่ง 10 พ.ย. 2569 ตั้งในหน้าตั้งค่า) · พื้นขาวกับพื้นอ่อนของกราฟ (ทุกช่องสีตั้งแต่ 245) โปร่งใสหมด
    สีอ่อนรอบเส้นกับขอบตัวหนังสือ (ตั้งแต่ 200) ถอดสีขาวออกเป็นความโปร่งใสบางส่วน ขอบจึงเนียน · สีที่เข้มกว่านั้นทึบเหมือนเดิม
    JPG กับ HEIC เก็บความโปร่งใสไม่ได้ ส่งรูปเดิม */
function alphaOf(cv: HTMLCanvasElement, o: GraphImg): HTMLCanvasElement {
  if (!o.transparent || o.format === "jpg" || o.format === "heic") return cv;
  const g = cv.getContext("2d"); if (!g) return cv;
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const lo = Math.min(d[i], d[i + 1], d[i + 2]);
    if (lo >= 245) { d[i + 3] = 0; continue; }
    if (lo < 200) continue;
    const a = Math.max(255 - d[i], 255 - d[i + 1], 255 - d[i + 2]) / 255;
    for (let c = 0; c < 3; c++) d[i + c] = Math.round(255 - (255 - d[i + c]) / a);
    d[i + 3] = Math.round(a * d[i + 3]);
  }
  const out = document.createElement("canvas"); out.width = cv.width; out.height = cv.height;
  out.getContext("2d")?.putImageData(im, 0, 0);
  return out;
}
function withHeader(cv: HTMLCanvasElement, title: string, sub: string, legend: [string, string][] = []): HTMLCanvasElement {
  const k = Math.max(1, cv.width / 1000), band = Math.round(50 * k), out = document.createElement("canvas");
  out.width = cv.width; out.height = cv.height + band;
  const g = out.getContext("2d"); if (!g) return cv;
  g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height);
  g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.fillStyle = "#4a2b38"; g.font = "700 " + 15 * k + "px Sarabun, sans-serif"; g.fillText(title, 10 * k, 22 * k);
  g.fillStyle = "#6b4a58"; g.font = 12 * k + "px Sarabun, sans-serif"; g.fillText(sub, 10 * k, 40 * k);
  let x = out.width - 10 * k;
  g.textAlign = "right"; g.font = "600 " + 12.5 * k + "px Sarabun, sans-serif";
  for (let i = legend.length - 1; i >= 0; i--) {
    const [txt, col] = legend[i], tw = g.measureText(txt).width;
    g.fillStyle = "#4a2b38"; g.fillText(txt, x, 28 * k); x -= tw + 6 * k;
    g.fillStyle = col; g.fillRect(x - 14 * k, 21 * k, 14 * k, 4 * k); x -= 14 * k + 14 * k;
  }
  g.drawImage(cv, 0, band);
  return out;
}
/** ป้ายแกนเวลาจากแถบเวลาบนจอ */
function drawRuler(g: CanvasRenderingContext2D, ruler: Element | null | undefined, x: number, w: number, y: number) {
  if (!ruler) return;
  g.fillStyle = "#6b4a58"; g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  for (const sp of ruler.querySelectorAll<HTMLElement>("span")) { const p = parseFloat(sp.style.left); if (!Number.isNaN(p)) g.fillText(sp.innerText, x + p / 100 * w, y); }
  g.textAlign = "left";
}
/** กำลังบันทึกอยู่ไหม ปุ่มบันทึกทุกกราฟอ่านจากตัวนี้ */
const SavingCtx = createContext(false);
/** ปุ่มบันทึกเป็นรูป · ระหว่างบันทึกไอคอนเป็นวงกลมหมุน (พี่กันสั่ง 9 พ.ย. 2569 "เราขอปุ่มหมุน ๆ ที่ปุ่มนี้ วงกลมเหมือนเส้นแปลง") */
function SaveBtn({ onClick }: { onClick: () => void }) {
  const busy = useContext(SavingCtx);
  // ปุ่มเปลี่ยนที่บันทึกอยู่ติดกัน ใช้ค่าเดียวกับหน้าตั้งค่า (พี่กันสั่ง 9 พ.ย. 2569 "ข้าง ๆ ปุ่มเราอยากให้มีปุ่มเปลี่ยนที่บันทึกด้วย")
  const { settings, update } = useSettings();
  const toast = useToast();
  const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
  const inFolder = o.dirMode === "folder" && !!o.dir;
  const changeDir = async () => {
    const d = await pickFolder("เลือกโฟลเดอร์เก็บรูปกราฟ"); if (!d) return;
    if (await update({ graphImg: { ...o, dirMode: "folder", dir: d } })) toast({ kind: "ok", title: "รูปกราฟจะเก็บที่โฟลเดอร์นี้", detail: d });
  };
  return <span style={{ display: "inline-flex", gap: 4 }}>
    <button type="button" className="btn btn-ghost btn-sm" style={{ width: 32, padding: 0, flex: "none" }} aria-label="เปลี่ยนที่บันทึกรูป" title={(inFolder ? "เก็บรูปที่ " + o.dir : "เก็บรูปข้างไฟล์ที่ดูอยู่") + "\nกดเพื่อเปลี่ยนที่บันทึก · กลับไปเก็บข้างไฟล์ได้ที่หน้าตั้งค่า"} onClick={changeDir} data-graphsavedir><IcFolder size={15} /></button>
    <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " pressed" : "")} aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => { if (!busy) onClick(); }} data-graphsave>
    {busy ? <span className="spinner" aria-hidden="true" /> : <IbSave size={15} />}<Keep all={["กำลังบันทึก…", "บันทึกเป็นรูป"]}>{busy ? "กำลังบันทึก…" : "บันทึกเป็นรูป"}</Keep></button></span>;
}
function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number, r: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => { if (ref.current) (ref.current as HiCanvas).__draw = draw; });
  const [w, setW] = useState(0);
  const [cssH, setCssH] = useState(0);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv) return;
    const read = () => { setW(cv.clientWidth); setCssH(cv.clientHeight); };
    const ro = new ResizeObserver(read); ro.observe(cv); read();
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => {
    const cv = ref.current; if (!cv || !w) return;
    const r = window.devicePixelRatio || 1, h = cv.clientHeight;
    cv.width = Math.round(w * r); cv.height = Math.round(h * r);
    const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(r, 0, 0, r, 0, 0); draw(g, w, h, r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, cssH, ...deps]);
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
      // ช่วงที่เงียบเหลือจุดจาง ไม่ให้ดูเหมือนมีเสียง (ช่องที่เงียบทั้งไฟล์เคยเป็นจุดเข้มเท่าช่องที่มีเสียง เจอตอนตรวจภาพ)
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

/** ปุ่มตัวเลือกกราฟ กางแผงสวิตช์ แบบเดียวกับปุ่มการแสดงผลของชั้นวาง */
function GraphOptions({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} style={{ position: "relative", flex: "none" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} title="ตัวเลือกกราฟ" aria-label="ตัวเลือกกราฟ" style={{ width: 32, padding: 0, flex: "none" }} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)} data-graphopts>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </button>
      {open && (
        <div ref={panel} className="menu pop-in" role="dialog" aria-label="ตัวเลือกกราฟ" style={{ position: "absolute", right: 0, width: 320, padding: "6px 14px", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}>
          <div className="setrow" style={{ borderTop: 0 }}><div className="lbl">ซูมเหมือนกันทุกกราฟ</div><span data-zoomall style={{ display: "inline-flex" }}><Switch on={on} onChange={onChange} label="ซูมเหมือนกันทุกกราฟ" /></span></div>
        </div>
      )}
    </div>
  );
}

/** ซูมแกนตั้งของกราฟเส้น z เท่า ขอบล่างของช่วงที่เห็น b เป็นสัดส่วน · ซูมแล้วคงกึ่งกลางเดิม */
function useVRange(resetN: number) {
  const [z, setZRaw] = useState(1), [b, setB] = useState(0), now = useRef(1); now.current = z;
  const clampB = (v: number, k: number) => Math.max(0, Math.min(1 - 1 / k, v));
  const setZ = useCallback((k: number) => { const old = now.current; if (k === old) return; setB((v) => clampB(v + 1 / old / 2 - 1 / k / 2, k)); setZRaw(k); }, []);
  useEffect(() => { if (resetN) { setZRaw(1); setB(0); } }, [resetN]);
  const wheel = (e: React.WheelEvent) => { if (z <= 1 || e.ctrlKey) return; e.stopPropagation(); setB((v) => clampB(v + (e.deltaY < 0 ? 0.25 : -0.25) / z, z)); };
  return { z, b, setZ, setB, clampB, wheel };
}
type VRange = ReturnType<typeof useVRange>;
/** ช่วงค่าของแกนตั้งตามซูม กับระยะเส้นที่ไม่เกินราว 6 เส้น */
const vWindow = (lo: number, hi: number, v: VRange) => { const f = hi - lo, l = lo + v.b * f, h = l + f / v.z; return { lo: l, hi: h, step: [1, 2, 5, 10, 12].find((k) => (h - l) / k <= 6) ?? 12 }; };
/** แถบเลื่อนช่วงแกนตั้ง ขึ้นเมื่อซูมเกิน 1 เท่า ทับขอบขวาของกราฟ ไม่ดันเนื้อหา */
function VBar({ v, right, top = 12, bottom = 12, dark }: { v: VRange; right: number; top?: number; bottom?: number; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef(false);
  if (v.z <= 1) return null;
  const to = (y: number) => { const r = ref.current!.getBoundingClientRect(); v.setB(v.clampB(1 - (y - r.top) / r.height - 1 / v.z / 2, v.z)); };
  return <div ref={ref} className={"spekvs" + (dark ? "" : " light")} style={{ top, bottom, right }} title="ลากเลื่อนช่วงขึ้นลง · หมุนล้อเมาส์บนกราฟก็ได้" data-vbar
    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; to(e.clientY); }} onPointerMove={(e) => { if (drag.current) to(e.clientY); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
    <i style={{ height: 100 / v.z + "%", bottom: v.b * 100 + "%" }} /></div>;
}

/** กดเมาส์ลากบนกราฟที่ซูมอยู่ กราฟขยับตามมือ ซ้ายขวาคือเวลา ขึ้นลงคือแกนตั้ง · ไม่ได้ซูมแกนไหน แกนนั้นไม่ขยับ
    ขยับเกิน 3 จุดถึงเริ่มลาก กดเฉย ๆ ยังเป็นการชี้ตามเดิม · ปรับค่าเฟรมละครั้ง (พี่กันสั่ง 9 พ.ย. 2569 "เราขอเอาเมาส์กดลากได้ที ขอทุกกราฟที่ซูม") */
type GrabOpt = { canX: boolean; canY: boolean; span: number; center: number; z: number; b: number; left: number; right: number; top?: number; bottom?: number; onX?: (c: number) => void; onY?: (b: number) => void; onBusy?: (on: boolean) => void };
function useGrab(o: GrabOpt) {
  const now = useRef(o); now.current = o;
  const st = useRef<{ x: number; y: number; lx: number; ly: number; c: number; b: number; span: number; z: number; pw: number; ph: number; moved: boolean } | null>(null);
  const raf = useRef(0);
  const [on, setOn] = useState(false);
  const apply = () => {
    raf.current = 0;
    const s = st.current, g = now.current; if (!s) return;
    if (g.canX) g.onX?.(s.c - (s.lx - s.x) / s.pw * s.span);
    if (g.canY) g.onY?.(s.b + (s.ly - s.y) / s.ph / s.z);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const g = now.current;
    if (e.button !== 0 || (!g.canX && !g.canY) || (e.target as HTMLElement).closest("button,input,a,[role=slider],.spekvs,.spektools")) return;
    const r = e.currentTarget.getBoundingClientRect();
    st.current = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, c: g.center, b: g.b, span: g.span, z: g.z, pw: Math.max(1, r.width - g.left - g.right), ph: Math.max(1, r.height - (g.top ?? 0) - (g.bottom ?? 0)), moved: false };
  };
  /** คืนจริงเมื่อกดค้างอยู่ ตัวเรียกไม่ต้องทำเส้นชี้ต่อ */
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const s = st.current; if (!s) return false;
    s.lx = e.clientX; s.ly = e.clientY;
    if (!s.moved) {
      if (Math.hypot(s.lx - s.x, s.ly - s.y) < 3) return true;
      s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); setOn(true); now.current.onBusy?.(true);
    }
    if (!raf.current) raf.current = requestAnimationFrame(apply);
    return true;
  };
  const end = () => {
    const s = st.current; if (!s) return;
    if (raf.current) { cancelAnimationFrame(raf.current); apply(); }
    st.current = null;
    if (s.moved) { setOn(false); now.current.onBusy?.(false); }
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  const pannable = o.canX || o.canY;
  return { move, cls: pannable ? "grabok" + (on ? " grabbing" : "") : "", props: { onPointerDown, onPointerMove: (e: React.PointerEvent<HTMLElement>) => { move(e); }, onPointerUp: end, onPointerCancel: end } };
}
type Grab = ReturnType<typeof useGrab>;
/** ค่าตั้งแต่ 0 ถึง 1 ค่อย ๆ ขึ้นทุกครั้งที่ข้อมูลใหม่มา ใช้ให้กราฟเติบโตขึ้นแทนการแวบมา · เผื่อหน้าต่างอยู่หลังสุดเฟรมไม่เดิน มีตัวตั้งเวลาปิดท้าย */
function useRise(data: unknown, ms = 450) {
  const [rise, setRise] = useState(1);
  useLayoutEffect(() => {
    if (!data || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setRise(1); return; }
    const start = performance.now(); let id = 0;
    const tick = (n: number) => { const k = Math.min(1, (n - start) / ms); setRise(1 - Math.pow(1 - k, 3)); if (k < 1) id = requestAnimationFrame(tick); };
    setRise(0); id = requestAnimationFrame(tick);
    const stop = setTimeout(() => setRise(1), ms + 150);
    return () => { cancelAnimationFrame(id); clearTimeout(stop); };
  }, [data, ms]);
  return rise;
}
/** ข้อมูลระหว่างลาก ตรงที่มีช่วงซูมเดิมใช้ตัวคม ตรงที่เพิ่งโผล่ใช้ภาพรวมไปก่อน ปล่อยเมาส์แล้วอ่านช่วงใหม่มาแทน */
function mixSrc(held: GWindow, ov: GOverview, t0: number, t1: number, cols: number): Src {
  const ovc = ov.cols, hc = held.cols, hs = held.t1 - held.t0 || 1, env = ov.env.map((oe, ch) => {
    const he = held.env[ch], out = new Array<number>(cols * 3);
    for (let c = 0; c < cols; c++) {
      const tm = t0 + (t1 - t0) * (c + 0.5) / cols, inHeld = tm >= held.t0 && tm <= held.t1;
      const e = inHeld ? he : oe, k = inHeld ? Math.min(hc - 1, Math.floor((tm - held.t0) / hs * hc)) : Math.max(0, Math.min(ovc - 1, Math.floor(tm / ov.duration * ovc)));
      out[c * 3] = e[k * 3]; out[c * 3 + 1] = e[k * 3 + 1]; out[c * 3 + 2] = e[k * 3 + 2];
    }
    return out;
  });
  return { env, cols, t0, t1 };
}

function axisY(g: CanvasRenderingContext2D, x0: number, w: number, h: number, pad: number, lo: number, hi: number, step: number, unit: string) {
  g.font = "11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  const top = Math.floor(hi / step) * step;
  for (let v = top; v >= lo; v -= step) { const y = pad + (hi - v) / (hi - lo) * (h - pad * 2); g.fillStyle = "#f3e2e9"; g.fillRect(x0, Math.round(y), w - x0, 1); g.fillStyle = "#a88595"; g.fillText(minus(String(v)) + (v === top ? " " + unit : ""), x0 - 4, y); }
}

/* ---------- ชิ้นส่วน ---------- */
function Speakers({ names, th, levels, hidden, onToggle }: { names: string[]; th: Theme; levels: number[]; hidden: string[]; onToggle: (c: string) => void }) {
  const has = (c: string) => names.includes(c);
  const surround = names.length >= 5;
  const VH = surround ? 184 : names.length === 1 ? 62 : 150;
  const pos = (c: string, i: number): [number, number] => {
    if (names.length === 2) return c === "FL" ? [52, 38] : [148, 38];
    if (names.length === 1) return [100, 31];
    const P: Record<string, [number, number]> = { FC: [100, 24], FL: [48, 38], FR: [152, 38], LFE: [100, 68], BL: [50, 160], BR: [150, 160], BC: [100, 166], FLC: [74, 30], FRC: [126, 30],
      SL: has("BL") ? [20, 110] : [28, 146], SR: has("BR") ? [180, 110] : [172, 146] };
    return P[c] ?? [20 + (i % 6) * 32, 120 + Math.floor(i / 6) * 30];
  };
  const hy = surround ? 114 : 92;
  return (
    <svg className="spk" width="200" height={VH} viewBox={`0 0 200 ${VH}`} role="img" aria-label={`แผนผังลำโพง ${names.length} ช่อง`}>
      {names.length > 1 && <g aria-hidden="true">
        {/* วงเสียงรอบที่นั่งฟัง */}
        {[58, 40, 24].map((r, k) => <circle key={r} cx="100" cy={hy} r={r} fill={th.rms} fillOpacity={0.035 + k * 0.025} />)}
        <circle cx="100" cy={hy - 6} r="6" fill={th.rms} fillOpacity="0.75" />
        <path d={`M88 ${hy + 11} a12 10 0 0 1 24 0 z`} fill={th.rms} fillOpacity="0.75" />
        <text x="100" y={hy + 24} textAnchor="middle" fontSize="10" fill="#8a6474" fontFamily="Sarabun">ที่นั่งฟัง</text>
      </g>}
      {names.map((c, i) => {
        const [x, y] = pos(c, i), off = hidden.includes(c), a = off ? 0 : 0.25 + 0.75 * Math.min(1, (levels[i] ?? 0) * 3) /* ระหว่างอ่านยังไม่มีค่า ขึ้นจาง (ค่าว่างเคยทำให้ทึบทุกตัว) */, d = label(names, c).code;
        const toggle = () => onToggle(c);
        const lfe = c === "LFE";
        // คลื่นเสียงแผ่ไปทางที่นั่งฟัง ช่องเดียวแผ่ลงล่าง · ดังมากคลื่นมาก ดังน้อยคลื่นน้อย ช่องที่ซ่อนไม่มีคลื่น
        const dir = names.length > 1 ? Math.atan2(hy - y, 100 - x) : Math.PI / 2;
        const waves = off ? 0 : Math.max(1, Math.ceil(a * 3));
        const R = lfe ? 11 : 15, half = lfe ? 0.8 : 0.62;
        return (
          <g key={c} className="s" tabIndex={0} role="button" aria-label={(off ? "แสดง" : "ซ่อน") + "ช่อง " + d} onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
            <title>{(off ? "กดเพื่อเปิดช่อง " : "กดเพื่อปิดช่อง ") + d}</title>
            {Array.from({ length: waves }, (_, k) => {
              const r = R + 4 + k * 4, x1 = x + r * Math.cos(dir - half), y1 = y + r * Math.sin(dir - half), x2 = x + r * Math.cos(dir + half), y2 = y + r * Math.sin(dir + half);
              return <path key={k} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={th.rms} strokeWidth="2" strokeLinecap="round" strokeOpacity={0.85 - k * 0.25} />;
            })}
            {lfe ? <rect x={x - 15} y={y - 11} width="30" height="22" rx="6" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />
              : <><circle cx={x} cy={y} r="15" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />
                {!off && <circle cx={x} cy={y} r="11.5" fill="none" stroke={a > 0.55 ? "#fff" : th.rms} strokeOpacity="0.45" strokeWidth="1" />}</>}
            <text x={x} y={y + 4} textAnchor="middle" fontSize={d.length > 2 ? 9.5 : 11} fontWeight="700" fontFamily="Sarabun" fill={off ? "#b28a9a" : a > 0.55 ? "#fff" : "#4a2b38"}>{d}</text>
          </g>
        );
      })}
    </svg>
  );
}

type Mark = { from: number; to: number; text: string };

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
function Lane({ code, th: thai, peak, height, draw, deps, ruler, room }: { code: string; th: string; peak: string; height: number; draw: Draw; deps: unknown[]; ruler?: Draw; room?: boolean }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return (
    <div className="lane" data-lane={code} style={ruler || room ? { gridTemplateColumns: `96px ${RUL_W}px 1fr` } : undefined}>
      <div className="lab"><b>{code}</b><span>{thai}</span><em>{peak}</em></div>
      {ruler ? <RulerCv height={height} draw={ruler} deps={deps} /> : room ? <span aria-hidden="true" /> : null}
      <canvas className="cv" style={{ height }} ref={ref} data-rawdraw />
    </div>
  );
}
/** ช่องที่ปิดลำโพง แถบยังอยู่ที่เดิมสูงเท่าเดิม กราฟช่องอื่นไม่ขยับ */
function LaneOff({ code, th: thai, peak, height }: { code: string; th: string; peak: string; height: number }) {
  return (
    <div className="lane" data-lane={code} data-off>
      <div className="lab"><b>{code}</b><span>{thai}</span><em>{peak}</em></div>
      <div className="laneoff" style={{ height }}>ปิดลำโพง</div>
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
/** ไฟล์ที่เคยเปิดในหน้ากราฟ ขึ้นในหน้ารวมกราฟเสียง รวมไฟล์เสียงที่ไม่ได้อยู่บนชั้นวาง (พี่กัน 7 พ.ย. 2569
    *"หาวิธีที่เราจะกดกลับไปน้าเสียงรวมที ตอนที่เราอยู่หน้านี้ เเละไฟล์เสียงไหนที่เราโหลดเข้ามาเเล้ว ทำไมมันไม่อยู่ในหน้ารวมเสียงเลย"*)
    เก็บในเครื่องนี้ 12 ไฟล์ล่าสุด · เดิมหน้ารวมดึงจากชั้นวางอย่างเดียว ไฟล์ที่เปิดจากเครื่องไม่ถูกจดไว้ */
type Recent = { path: string; name: string; size: number; duration: number; audioOnly: boolean; layout?: string; at: number };
const RECENT_KEY = "graph-recent";
function loadRecent(): Recent[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((r) => r && typeof r.path === "string" && typeof r.name === "string") : []; } catch { return []; }
}
function saveRecent(list: Recent[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* เก็บไม่ได้ ใช้รายการในหน้านี้ไปก่อน */ }
}

/** แถบสีตัวอย่างบนปุ่มเลือกสี ใช้สีชุดเดียวกับที่วาดกราฟจริง */
const Swatch = ({ ramp }: { ramp: readonly string[] }) => <i className="cswatch" data-keepcolor aria-hidden="true" style={{ background: `linear-gradient(90deg,${ramp.join(",")})` }} />;
const WaveIc = ({ d }: { d: string }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

type Prefs = { view: View; theme: string; style: WaveStyle; cmap: "theme" | "rainbow"; scmap: "heat" | "rainbow" | "mono" | "theme"; spekLight: boolean; wide: boolean };
const PREF_KEY = "graph-prefs";
function loadPrefs(): Prefs {
  const d: Prefs = { view: "wave", theme: "ชมพู", style: "fine", cmap: "theme", scmap: "heat", spekLight: false, wide: false };
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); return { ...d, ...p, theme: THEMES[p.theme] ? p.theme : d.theme }; } catch { return d; }
}

/** โหมดของหน้า กับการเทียบที่เปิดอยู่ · จำระดับโปรแกรม ไปหน้าอื่นแล้วกลับมาอยู่ที่เดิม (คิวแปลงเก็บใน convertJob.ts) */
let lastMode: "graph" | "convert" = "graph";
type CmpState = { files: string[]; note?: string; free?: boolean } | null;
let lastCmp: CmpState = null;
/** การเทียบที่ออกมาดูกราฟเดี่ยว ใช้ปุ่มกลับไปเทียบ */
let lastBack: CmpState = null;

export default function GraphPage({ req, onConsumed, onBitrate }: { req: GraphReq | null; onConsumed: () => void; onBitrate?: (path: string, track?: string) => void }) {
  const [mode, setModeRaw] = useState<"graph" | "convert">(lastMode);
  const setMode = (m: "graph" | "convert") => { lastMode = m; setModeRaw(m); };
  const [cmp, setCmpRaw] = useState(lastCmp);
  const setCmp = (c: CmpState) => { lastCmp = c; setCmpRaw(c); };
  const [cmpBack, setCmpBackRaw] = useState<CmpState>(lastBack);
  const setCmpBack = (c: CmpState) => { lastBack = c; setCmpBackRaw(c); };
  const [tagFor, setTagFor] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = cmp ? "graph" : mode;
  const { movies } = useLibrary();
  const toast = useToast();
  /** ตัวรับไฟล์ที่ลากลงทะเบียนครั้งเดียว ใช้ตัวแจ้งเตือนล่าสุดผ่านตัวนี้ */
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [path, setPath] = useState<string | null>(null);
  const [info, setInfo] = useState<GInfo | null>(null);
  /** รายละเอียด codec ของแต่ละแทร็กเสียง (MediaInfo) เช่น MPEG-1 Layer 3 (LAME 3.99r) · พี่กันถาม 10 พ.ย. 2569 */
  const [codecDetail, setCodecDetail] = useState<(string | null)[]>([]);
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
  const [winFail, setWinFail] = useState<string | null>(null);
  /** นับครั้งที่กดรีเซ็ต หน้าวิเคราะห์เก็บซูมแนวตั้งของตัวเอง ใช้ค่านี้สั่งคืน */
  const [resetN, setResetN] = useState(0);
  const [psd, setPsd] = useState<GPsd | null>(null);
  const [psdCh, setPsdCh] = useState("mix");
  const [psdLog, setPsdLog] = useState(true);
  const [psdSize, setPsdSize] = useState(4096);
  const [psdF, setPsdF] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const [plotW, setPlotW] = useState(600);
  const plotRef = useRef<HTMLDivElement>(null);
  const [paneH, setPaneH] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const exportRef = useRef<(outW: number) => HTMLCanvasElement | null>(() => null);

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
    setMode("graph"); setCmp(null);
    setPath(req.path);
    if (req.path === path && error) setNonce((n) => n + 1);
    if (req.t != null) { jumped.current = true; setCenter(req.t); setTip(req.t); setZoom(30); if (prefs.view !== "wave" && prefs.view !== "spec") setPref("view", "wave"); }
    onConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  // จดไฟล์ที่เปิดได้ลงรายการเปิดล่าสุด · จดตอนข้อมูลของไฟล์นั้นมาถึง
  // (เดิมจดตอนที่อยู่ไฟล์เปลี่ยน ข้อมูลไฟล์ก่อนหน้ายังไม่ถูกล้าง ได้ชื่อไฟล์ใหม่คู่กับข้อมูลไฟล์เก่า เจอตอนตรวจภาพ)
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const remember = (p: string, g: GInfo) => {
    const r: Recent = { path: p, name: p.split(/[\\/]/).pop() ?? p, size: g.size, duration: g.duration, audioOnly: g.audioOnly, layout: g.tracks[0]?.layout, at: Date.now() };
    setRecent((l) => { const n = [r, ...l.filter((x) => x.path.toLowerCase() !== p.toLowerCase())].slice(0, 12); saveRecent(n); return n; });
  };
  const forget = (p: string) => setRecent((l) => { const n = l.filter((x) => x.path !== p); saveRecent(n); return n; });
  // รายการเปิดล่าสุดบอกไฟล์ที่หายตั้งแต่ก่อนกด (พี่กันเคาะ 9 พ.ย. 2569 "ตามนั้น") · ถามใหม่ทุกครั้งที่กลับมาหน้านี้ เสียบไดรฟ์กลับแล้วหายเอง
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (path || !recent.length) return;
    let live = true;
    const ask = () => graphApi.exist(recent.map((r) => r.path)).then((ok) => { if (live) setGone(new Set(recent.filter((_, i) => !ok[i]).map((r) => r.path))); }, () => { /* ถามไม่ได้ ถือว่าไฟล์ยังอยู่ กดแล้วค่อยบอก */ });
    void ask();
    window.addEventListener("focus", ask);
    return () => { live = false; window.removeEventListener("focus", ask); };
  }, [path, recent]);
  /** กลับหน้ารวมกราฟเสียง · กำลังอ่านอยู่ก็หยุดอ่าน */
  const goHome = () => { if (progress != null) graphApi.cancel(); setPath(null); };

  // อ่านข้อมูลแทร็ก
  useEffect(() => {
    if (!path) return;
    let live = true;
    setInfo(null); setOvRaw(null); setWin(null); setPsd(null); setError(null); setHidden([]); setTrack(0); zoomOf.current = {};
    graphApi.info(path).then((g) => { if (live) { setInfo(g); remember(path, g); } }, (e) => { if (live) setError(String(e)); });
    // รายละเอียด codec จาก MediaInfo อ่านไม่ได้ก็ใช้ชื่อสั้นจาก ffprobe ตามเดิม
    setCodecDetail([]);
    graphApi.codecDetail(path).then((d) => { if (live) setCodecDetail(d); }, () => {});
    return () => { live = false; };
  }, [path, nonce]);

  // ภาพรวมทั้งไฟล์
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
      else { setTip(0); setCenter(o.duration / 2); }
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
  // ซูมแยกแต่ละกราฟ สลับไปกราฟที่ยังไม่เคยซูมเริ่มทั้งไฟล์ สลับกลับซูมเดิมยังอยู่ · ติ๊กซูมเหมือนกันทุกกราฟ ใช้ช่วงเดียวกันหมด
  const { settings, update: updateSettings } = useSettings();
  const zoomAll = settings?.graphZoomAll ?? false;
  const zoomOf = useRef<Partial<Record<View, { zoom: number | "all"; center: number }>>>({});
  const switchView = (k: View) => {
    if (k === view) return;
    if (!zoomAll) {
      zoomOf.current[view] = { zoom, center };
      const s = zoomOf.current[k];
      setZoom(s?.zoom ?? "all");
      setCenter(s?.center ?? dur / 2);
      setWin(null);
    }
    setPref("view", k);
  };
  const span = zoom === "all" ? dur : Math.min(dur, zoom);
  const rt0 = Math.max(0, Math.min(dur - span, center - span / 2)), rt1 = rt0 + span;
  /* ตัวซูม ตัวเลื่อน แบบหน้าดูคลื่นของ Audacity (พี่กัน *"พวกตัวซูม พวกตัวขยาย ตัวเลื่อนซ้ายขวา เอามาได้เลย"* · เอาแค่ส่วนดูกราฟ ไม่เอาส่วนปรับแต่ง)
     ซูมเข้าออกทีละสองเท่า ถึงครึ่งวินาที · ซูมจากล้อเมาส์ตรึงจุดที่ชี้ไว้ที่เดิม · เลื่อนไม่หลุดหัวท้ายเรื่อง */
  const [vz, setVz] = useState(1);
  // ขยายแนวตั้งใช้กับเส้นละเอียดและแบบ Audacity · แบบ Audacity มีไม้บรรทัดตัวเลขนอกกราฟ ขอบซ้ายของกราฟจึงขยับไปอีก RUL_W
  // รูปคลื่นทั้งสามแบบจองแถบซูมขวากับไม้บรรทัดซ้ายเท่ากัน สลับแบบแล้วกราฟเริ่มและจบที่เดิม
  const VZ_W = view === "wave" || view === "spec" ? 30 : 0;
  // ซูมแนวตั้งแถบความถี่ sz เท่า ขอบล่างของย่านที่เห็น sb เป็นสัดส่วน แบบเดียวกับหน้าวิเคราะห์ (พี่กันสั่ง 9 พ.ย. 2569 "ขอขยายแบบแนวตั้ง")
  const [sz, setSzRaw] = useState(1), [sb, setSb] = useState(0);
  const szNow = useRef(1); szNow.current = sz;
  const szClampB = (b: number, z: number) => Math.max(0, Math.min(1 - 1 / z, b));
  const setSz = useCallback((z: number) => { const old = szNow.current; if (z === old) return; setSb((b) => szClampB(b + 1 / old / 2 - 1 / z / 2, z)); setSzRaw(z); }, []);
  const svRef = useRef<HTMLDivElement>(null), svDrag = useRef(false);
  const svTo = (y: number) => { const r = svRef.current!.getBoundingClientRect(); setSb(szClampB(1 - (y - r.top) / r.height - 1 / sz / 2, sz)); };
  const LW = view === "wave" ? 96 + RUL_W : 96;
  const zoomBy = (f: number, at?: number) => {
    if (!dur) return;
    let ns = span * f;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    ns = Math.max(0.5, ns);
    const anchor = at ?? (rt0 + rt1) / 2, rel = (anchor - rt0) / (span || 1);
    const nt0 = Math.max(0, Math.min(dur - ns, anchor - rel * ns));
    setZoom(ns); setCenter(nt0 + ns / 2);
  };
  const panTo = (c: number) => setCenter(Math.max(span / 2, Math.min(dur - span / 2, c)));
  const [grabbing, setGrabbing] = useState(false);
  const grabBusy = useCallback((on: boolean) => { setGrabbing(on); if (on) setHover(null); }, []);
  const lanesGrab = useGrab({ canX: span < dur - 0.01, canY: view === "spec" && sz > 1, span, center: (rt0 + rt1) / 2, z: sz, b: sb, left: LW, right: 0, onX: panTo, onY: (b) => setSb(szClampB(b, sz)), onBusy: grabBusy });
  /** ตั้งความยาวช่วงที่ดูตรง ๆ จากแถบซูมแนวนอน · ซูมรอบกลางช่วงเดิม · ยาวเท่าเรื่องกลับเป็นทั้งไฟล์ */
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
      if (e.ctrlKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.5 : 2, x >= 0 && x <= W ? rt0 + x / W * (rt1 - rt0) : undefined); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); panTo((rt0 + rt1) / 2 + (e.shiftKey ? e.deltaY || e.deltaX : e.deltaX) / Math.max(1, W) * (rt1 - rt0)); }
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });

  // ช่วงที่ซูม อ่านเฉพาะช่วง (รอ 150 ms ก่อนขอ เลื่อนเร็ว ๆ ไม่ขอซ้ำ)
  // จำผลไว้ สลับกราฟไปมาไม่อ่านซ้ำ (พี่กันถาม 9 พ.ย. 2569 "เรากดเปลี่ยนกราฟไปมา ทำไมมันคำนวนใหม่ทุกครั้งเลย")
  const winMem = useRef(new Map<string, GWindow>()), psdMem = useRef(new Map<string, GPsd>());
  // ระหว่างลากแถบซูม แถบเลื่อน หรือตัวกราฟ ไม่อ่านไฟล์เลย ปล่อยเมาส์แล้วอ่านทีเดียว (พี่กันบอก 9 พ.ย. 2569 "ซูมแนวนอน มันประมวลผลกราฟตลอดเลย")
  useEffect(() => {
    if (grabbing || !path || !ov || zoom === "all" || view === "loud" || view === "psd") return;
    let live = true;
    const log = view !== "spek";
    const memKey = `${path}|${track}|${rt0}|${rt1}|${Math.round(plotW)}|${log}`, hit = winMem.current.get(memKey);
    if (hit) { setWin(hit); return; }
    const id = setTimeout(() => {
      graphApi.window(path, track, rt0, rt1, Math.round(plotW), log ? 96 : 256, log).then((w) => { if (w) memPut(winMem.current, memKey, w, 12); if (live && w) setWin(w); }, (e) => { if (live) { setWinFail(`${rt0}|${rt1}`); toast({ kind: "bad", title: "อ่านช่วงที่ซูมไม่ได้", detail: String(e) }); } });
    }, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, path, ov, track, rt0, rt1, view, plotW]);

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
    if (grabbing || !path || !ov || view !== "psd") return;
    let live = true;
    const memKey = `${path}|${track}|${rt0}|${rt1}|${JSON.stringify(psdSeries)}|${psdSize}|${JSON.stringify(psdMs)}`, hit = psdMem.current.get(memKey);
    if (hit) { setPsd(hit); return; }
    setPsd(null);
    const id = setTimeout(() => {
      graphApi.psd(path, track, rt0, rt1, psdSeries, psdSize, psdMs).then((p) => { if (p) memPut(psdMem.current, memKey, p, 16); if (live && p) setPsd(p); }, (e) => { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); });
    }, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, path, ov, track, rt0, rt1, view, psdSeries, psdMs, psdSize]);

  // ข้อมูลเพลงกับปกของแผงซ้าย อ่านจากไฟล์จริงตอนเปิดไฟล์ (พี่กันเลือกแบบ ค 9 พ.ย. 2569 "ให้มันอ่าน metadata และแสดงปกด้วย")
  const [tagFile, setTagFile] = useState<AudioFile | null>(null);
  const [tagCover, setTagCover] = useState<CoverData | null | undefined>(undefined);
  useEffect(() => {
    setTagFile(null); setTagCover(undefined);
    if (!path) return;
    let live = true;
    convertApi.probe(path).then((f) => {
      if (!live) return;
      setTagFile(f);
      if (f.cover) convertApi.cover(path).then((c) => { if (live) setTagCover(c); }, () => { if (live) setTagCover(null); });
      else setTagCover(null);
    }, () => { if (live) setTagCover(null); });
    return () => { live = false; };
  }, [path]);

  // ลากไฟล์มาวาง
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop" || !e.payload.paths[0] || !document.querySelector("[data-graph]")) return;
      // โหมดแปลงเสียง ไฟล์ที่ลากมาทุกไฟล์เข้าคิว · โหมดดูกราฟ เปิดไฟล์แรก
      if (modeRef.current === "convert") addFiles(e.payload.paths);
      else if (!document.querySelector("[data-compare]")) setPath(e.payload.paths[0]);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // ซูมแล้วคงภาพคมเดิมไว้จนข้อมูลช่วงใหม่มาครบ แล้วสลับทีเดียวทั้งกราฟกับแกนเวลา ไม่ยืดภาพรวมความละเอียดต่ำมาคั่น
  const rawWin = win && zoom !== "all" && win.env.length === names.length && Math.abs(win.t0 - rt0) < 0.01 && Math.abs(win.t1 - rt1) < 0.01 ? win : null;
  const needWin = zoom !== "all" && view !== "loud" && view !== "psd";
  const viewReady = !needWin || !!rawWin || winFail === `${rt0}|${rt1}`;
  const viewKey = `${path}|${track}|${names.length}`;
  const lastView = useRef<{ key: string; t0: number; t1: number; win: GWindow | null; held: GWindow | null } | null>(null);
  // ระหว่างลาก กราฟต้องขยับตามมือทันที ไม่ค้างรอข้อมูล · ตรงที่มีช่วงซูมเดิมยังคม ตรงที่เพิ่งโผล่ใช้ภาพรวมจนปล่อยเมาส์แล้วช่วงใหม่มา
  const heldRef = useRef<{ key: string; w: GWindow } | null>(null);
  const heldKey = `${viewKey}|${view !== "spek"}`;
  if (rawWin) heldRef.current = { key: heldKey, w: rawWin };
  const heldNow = heldRef.current?.key === heldKey ? heldRef.current.w : null;
  const dragHold = grabbing && needWin && !rawWin;
  if (dragHold) lastView.current = { key: viewKey, t0: rt0, t1: rt1, win: null, held: heldNow };
  else if (viewReady) lastView.current = { key: viewKey, t0: rt0, t1: rt1, win: rawWin, held: null };
  const shown = (dragHold || !viewReady) && lastView.current?.key === viewKey ? lastView.current : { t0: rt0, t1: rt1, win: rawWin, held: null };
  // ข้อมูลละเอียดเฉพาะตอนบันทึกรูป
  const [hiWin, setHiWin] = useState<GWindow | null>(null);
  const t0 = shown.t0, t1 = shown.t1, winNow = hiWin ?? shown.win, heldShown = shown.held;
  const src: Src | null = useMemo(() => (winNow ? { env: winNow.env, cols: winNow.cols, t0: winNow.t0, t1: winNow.t1 } : heldShown && ov ? mixSrc(heldShown, ov, t0, t1, Math.round(plotW)) : ov ? { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration } : null), [winNow, heldShown, ov, t0, t1, plotW]);
  // รอเกิน 0.3 วินาทีถึงขึ้นป้าย รอสั้น ๆ ไม่ต้องกะพริบ
  const [viewSlow, setViewSlow] = useState(false);
  useEffect(() => {
    if (viewReady || grabbing) { setViewSlow(false); return; }
    const id = setTimeout(() => setViewSlow(true), 300);
    return () => clearTimeout(id);
  }, [viewReady, grabbing]);
  const vis = names.filter((c) => !hidden.includes(c));
  const levels = useMemo(() => (ov ? ov.rms.map((d) => Math.pow(10, d / 20)) : []), [ov]);
  const marks: Mark[] = useMemo(() => {
    const m: Mark[] = (movie?.check?.spans ?? []).map((s) => ({ from: s.from, to: Math.max(s.to, s.from + 0.5), text: s.what + " · ผลตรวจ" }));
    for (const [a, b] of ov?.silences ?? []) if (!m.some((x) => Math.abs(x.from - a) < 1.5)) m.push({ from: a, to: b, text: `เงียบทุกช่อง ${(b - a).toFixed(1)} วินาที` });
    return m;
  }, [movie, ov]);
  // จุดเดิมหลุดช่วงที่ดู (ซูมหรือเลื่อนไปที่อื่น) ใช้ต้นช่วงที่ดู ปุ่มเปิดเล่นที่จะไม่บอกเวลาที่มองไม่เห็น (เจอตอนตรวจภาพ)
  const at = hover ?? (tip >= t0 && tip <= t1 ? tip : t0);

  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  const openOther = async () => { const f = await pickFile("media"); if (f) setPath(f); };
  const compareOther = async () => {
    if (!path) return;
    const f = await pickFile("media"); if (!f) return;
    if (f.toLowerCase() === path.toLowerCase()) { toast({ kind: "warn", title: "เลือกไฟล์เดียวกับที่เปิดอยู่", detail: "เลือกไฟล์อื่นเพื่อเทียบ" }); return; }
    setCmpBack(null); setCmp({ files: [path, f], free: true });
  };
  const play = async () => {
    if (!path) return;
    try {
      const r = await checkApi.playAt(path, at);
      if (r.seeked) toast({ kind: "ok", title: `เปิดด้วย ${r.player} ที่ ${tfmt(at)}` });
      else toast({ kind: "warn", title: r.player ? `เปิดด้วย ${r.player} แล้ว แต่เปิดตรงนาทีไม่ได้` : "เปิดด้วยโปรแกรมหลักของ Windows แล้ว แต่เปิดตรงนาทีไม่ได้", detail: `เลื่อนไปที่ ${tfmt(at)} เอง · ตั้งโปรแกรมเล่นได้ที่หน้าตั้งค่า` });
    } catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };
  const fileName = path ? path.split(/[\\/]/).pop() ?? path : "";
  // บันทึกรูป · อ่านเสียงช่วงที่ดูใหม่ที่ความละเอียดของรูป ไม่ต้องซูมก่อน นานขึ้นนิดหน่อย (พี่กันสั่ง 9 พ.ย. 2569 "ระบบจะขยายกราฟแล้วบันทึกมาเลย มันจะบันทึกนานนิดนึง")
  const [saving, setSaving] = useState(false);
  const saveImage = async () => {
    if (!path || saving) return;
    // ตัวตรวจดูรูปที่จะบันทึกโดยไม่เปิดกล่องเลือกที่บันทึก
    const dry = (window as unknown as { __saveDry?: (c: HTMLCanvasElement) => void }).__saveDry;
    if (dry) { const cv = exportRef.current(0); if (cv) dry(cv); return; }
    const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
    const vName = VIEWS.find(([k]) => k === view)?.[1] ?? "กราฟเสียง", base = fileName.replace(/\.[^.]+$/, "");
    const where = await imgTarget(path, imgName(base, vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (view !== "loud" && view !== "psd") {
        const log = view !== "spek", cols = Math.min(8192, o.width || Math.round(plotW * screenK()));
        const w = await graphApi.window(path, track, t0, t1, cols, log ? 256 : 512, log, true);
        if (!w) throw new Error("การอ่านถูกยกเลิก เพราะมีการเลื่อนหรือซูมกราฟระหว่างบันทึก");
        flushSync(() => setHiWin(w));
      }
      let cv = exportRef.current(o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title && view !== "spek") cv = withHeader(cv, fileName + " · " + vName, tfmt(t0) + " ถึง " + tfmt(t1));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: `บันทึกรูปแล้ว ${saved.width.toLocaleString("en-US")} × ${saved.height.toLocaleString("en-US")} · ${fmtSize(saved.size)}`, detail: saved.path });
    } catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: e instanceof Error ? e.message : String(e) }); }
    finally { setHiWin(null); setSaving(false); }
  };

  const modeSeg = (
    <div className="seg gmode" role="tablist" aria-label="โหมดหน้ากราฟเสียง">
      <button type="button" role="tab" aria-selected={mode === "graph"} className={mode === "graph" ? "on" : ""} onClick={() => setMode("graph")} data-gmode="graph"><IcGraph size={15} />ดูกราฟ</button>
      <button type="button" role="tab" aria-selected={mode === "convert"} className={mode === "convert" ? "on" : ""} onClick={() => setMode("convert")} data-gmode="convert"><IcMix size={15} />แปลงเสียง</button>
    </div>
  );
  const tagDlg = tagFor && <TagDialog path={tagFor} onClose={() => setTagFor(null)} />;
  if (cmp) {
    return (<>
      <CompareView files={cmp.files} note={cmp.note} free={cmp.free} onFiles={(files, freed) => setCmp(freed ? { files, free: true } : { ...cmp, files })} onSingle={(p) => { setCmpBack(cmp); setCmp(null); setMode("graph"); setPath(p); }} onBack={() => { const a = cmp.files[0], free = cmp.free; setCmp(null); if (free) { setMode("graph"); setPath(a); } else setMode("convert"); }} onClose={() => { const a = cmp.files[0]; setCmp(null); setMode("graph"); setPath(a); }} />
      {tagDlg}
    </>);
  }
  if (mode === "convert") {
    return (
      <div className="ag" data-graph data-graphmode="convert">
        <div className="gmodebar">{modeSeg}<span className="small">แปลงไฟล์เสียงอย่างเดียว ไม่รวมเข้าหนัง · ไฟล์เดิมไม่ถูกแก้</span></div>
        <ConvertPane onCompare={(a, b, note) => setCmp({ files: [a, b], note })} onTags={setTagFor} />
        {tagDlg}
      </div>
    );
  }

  /* ---------- ยังไม่เลือกไฟล์ ---------- */
  if (!path) {
    const shelfPicks = movies.filter((m) => !m.missing && m.audio.length).slice(0, 6);
    // ไอคอนแถบฟิล์มของไฟล์หนังที่ไม่มีปก · ป้ายนามสกุลเด่นแบบเดียวกับกล่องไอคอน (พี่กันสั่ง 9 พ.ย. 2569 "ใส่นามสกุลไฟล์หน่อย เป็นการ์ดเด่น ๆ เหมือน icon โน้ตดนตรี" · "ขอ icon ที่บ่งบอกว่าเป็นวิดีโอหน่อย")
    const film = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M16 3v18M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4" /></svg>;
    const extCard = (p: string) => { const e = p.match(/\.([^.\\/]+)$/)?.[1]; return e ? <span className="rext" data-graphext>{e.toUpperCase()}</span> : null; };
    const music = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
    return (
      <div className="ag" data-graph>
        <div className="gmodebar">{modeSeg}<span className="small">ดูกราฟเสียงทีละไฟล์ · แปลงเสียงเป็นคิว แล้วเทียบความถี่ก่อนกับหลังแปลง</span></div>
        <div className="drop" style={{ minHeight: 180 }} data-graphdrop onClick={dropClick(openOther)}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openOther}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">รับไฟล์หนังทุกชนิดในชั้นวาง และไฟล์เสียง {AUDIO_EXT.map((e) => e.toUpperCase()).join(" · ")}</span>
        </div>
        {recent.length > 0 && <><div className="small">เปิดล่าสุด · กดเพื่อดูกราฟอีกครั้ง ปุ่มกากบาทเอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ</div>
          <div className="graph-recent" data-graphrecent>{recent.map((r) => {
            const mv = movies.find((m) => m.path.toLowerCase() === r.path.toLowerCase());
            const lost = gone.has(r.path);
            return (
              <div key={r.path} className={"recentrow" + (lost ? " lost" : "")}>
                <button type="button" className="dd" aria-disabled={lost || undefined} onClick={() => { if (!lost) setPath(r.path); }} data-graphrecentpick={r.name} data-lost={lost || undefined} title={lost ? `หาไฟล์ไม่เจอ · ไฟล์ถูกย้ายหรือลบ หรือไดรฟ์ถอดออกอยู่\n${r.path}` : r.path}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span className="rtype">{r.audioOnly ? <i className="rnote">{music}</i> : (mv?.thumb ?? mv?.linked?.[0]?.thumb) ? <img src={thumbUrl(mv?.thumb ?? mv?.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote" data-graphfilm>{film}</i>}{extCard(r.name)}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.name.replace(/\.[^.]+$/, "")}</span></span>
                  {/* ข้อความขวาไม่หด ชื่อยาวตัดเป็นสามจุดแทน (เดิมเวลาโดนตัดเหลือ 5:1 เจอตอนตรวจภาพ) */}
                  {lost
                    ? <span className="small lostmark" style={{ flex: "none" }}>หาไฟล์ไม่เจอ</span>
                    : <span className="small" style={{ flex: "none" }}>{[r.layout ?? "", tfmt(r.duration)].filter(Boolean).join(" · ")}</span>}
                </button>
                <button type="button" className="rmx" onClick={() => forget(r.path)} aria-label={`เอา ${r.name} ออกจากรายการเปิดล่าสุด`} title="เอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ" data-graphforget={r.name}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            );
          })}</div></>}
        {shelfPicks.length > 0 && <><div className="small">หรือเลือกจากชั้นวาง</div>
          <div className="graph-recent">{shelfPicks.map((m) => (
            <button key={m.id} type="button" className="dd" onClick={() => setPath(m.path)} data-graphpick={m.name}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}><span className="rtype">{(m.thumb ?? m.linked?.[0]?.thumb) ? <img src={thumbUrl(m.thumb ?? m.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote" data-graphfilm>{film}</i>}{extCard(m.path)}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{m.name.replace(/\.[^.]+$/, "")}</span></span>
              <span className="small">{[...new Set(m.audio.map((a) => a.layout))].join(" · ")}</span>
            </button>))}</div></>}
      </div>
    );
  }

  /* ---------- หัวหน้า แทร็ก ปุ่มแบบ ---------- */
  const thumb = info?.audioOnly
    ? <div className="fnote" style={{ background: th.lane, color: th.rms, border: `1px solid ${th.peak}` }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
    : movie?.thumb ? <img className="fthumb" src={thumbUrl(movie.thumb) ?? ""} alt="" /> : <div className="fthumb none" />;
  const head = (
    <div className="agtop">
      {/* กลับหน้ารวมกราฟเสียง (คิว 7 · เดิมมีแค่ เปิดไฟล์อื่น ที่เปิดหน้าต่างเลือกไฟล์ กลับหน้ารวมไม่ได้) */}
      <button type="button" className="btn btn-ghost" onClick={goHome} title="กลับหน้ารวมกราฟเสียง ดูไฟล์ที่เปิดล่าสุด" data-graphhome>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>หน้ารวม</button>
      {cmpBack && path && cmpBack.files.includes(path) && <button type="button" className="btn btn-ghost" onClick={() => { const c = cmpBack; setCmpBack(null); setCmp(c); }} title="กลับไปหน้าเทียบสองไฟล์" data-graphbackcmp><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h4v10H4zM16 7h4v10h-4z" /></svg>กลับไปเทียบ</button>}
      <div className="fchip">{thumb}<div style={{ minWidth: 0 }}>
        <button type="button" className="nm linklike" onClick={() => path && setTagFor(path)} title="กดเพื่อดูข้อมูลเพลงกับรูปปก" data-graphtags>{fileName.replace(/\.[^.]+$/, "")}<span className="ext">{fileName.match(/\.[^.]+$/)?.[0] ?? ""}</span></button>
        <div className="meta">{info ? `${info.audioOnly ? "ไฟล์เสียง · " : ""}${fmtSize(info.size)} · ยาว ${tfmt(info.duration)}${info.audioOnly && !movie ? " · ไม่ได้อยู่บนชั้นวาง" : ""}` : error ? "อ่านข้อมูลเสียงไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
      </div></div>
      {info && info.tracks.length > 1 && (
        <span data-graphtrack><Dropdown label="แทร็กเสียง" value={String(track)} onChange={(v) => setTrack(Number(v))}
          options={info.tracks.map((x) => ({ value: String(x.index), label: `เสียง ${x.index + 1} · ${x.lang ?? "ไม่ระบุภาษา"} · ${x.codec} · ${x.layout}` }))} /></span>
      )}
      <button type="button" className="btn btn-ghost" onClick={openOther}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>เปิดไฟล์อื่น</button>
      {/* เทียบกับไฟล์อื่นจากกราฟที่เปิดอยู่ ไม่ต้องผ่านคิวแปลง (พี่กันสั่ง 9 พ.ย. 2569 "เราเปิดกราฟอยู่แล้ว เราอยากเปิดเทียบกับไฟล์อื่นเลย") */}
      <button type="button" className="btn btn-ghost" onClick={compareOther} title="เลือกไฟล์อื่นมาเทียบกับไฟล์นี้" data-graphcompare><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h4v10H4zM16 7h4v10h-4z" /></svg>เทียบ</button>
      {/* หน้าแปลงเสียงอยู่ข้างปุ่มเปิดไฟล์อื่น (มอคอัปหัวข้อ 7) · กดจากหน้ากราฟ ไฟล์ที่ดูอยู่เข้าคิวเลย ไม่ต้องเลือกใหม่ (พี่กันบอก 9 พ.ย. 2569 "มันต้องใช้ไฟล์นั้นเลยสิ") · รอแปลงอยู่แล้วไม่เพิ่มแถว กันกดซ้ำโดยไม่ตั้งใจ */}
      <button type="button" className="btn btn-ghost" onClick={() => { if (path) addFiles([path], true); setMode("convert"); }} title="แปลงไฟล์นี้ · ใส่เข้าคิวแปลงเสียง" data-graphconvert><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>แปลงเสียง</button>
      {/* ดูบิตเรตของแทร็กเสียงที่ดูอยู่ ไปหน้าบิตเรตพร้อมไฟล์และแทร็กนี้ · ไฟล์เสียงล้วนก็กดได้ (พี่กันสั่ง 10 พ.ย. 2569 "เพิ่มดูบิตเรต จากดูกราฟเสียงได้" · "ทำไมเราดูบิตเรตของเสียงไม่ได้") */}
      {onBitrate && path && info && <button type="button" className="btn btn-ghost" onClick={() => onBitrate(path, `a${track}`)} title="ดูบิตเรตของแทร็กเสียงนี้ · ในหน้าบิตเรตสลับไปดูวิดีโอหรือแทร็กอื่นได้" data-graphbitrate><IcBitrate size={16} />Bitrate</button>}
    </div>
  );
  const seg = <T extends string | number>(opts: [T, React.ReactNode][], cur: T, set: (v: T) => void, attr: string) => (
    <div className="seg sm">{opts.map(([k, l]) => <button key={String(k)} type="button" className={cur === k ? "on" : ""} onClick={() => set(k)} {...{ [attr]: String(k) }}>{l}</button>)}</div>
  );
  const zoomBox = (opts: [number | "all", string][], lbl: string) => (
    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {lbl === "ซูม" && <span className="zbtns">
        <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก · Ctrl หมุนล้อเมาส์ลง" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={dur} span={span} onSpan={setSpan} onBusy={grabBusy} />
        <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={span <= 0.5} aria-label="ซูมเข้า" title="ซูมเข้า · Ctrl หมุนล้อเมาส์ขึ้น" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset onClick={() => { setZoom("all"); setWin(null); setVz(1); setSzRaw(1); setSb(0); setResetN((n) => n + 1); }}><IcRefresh size={15} /></button>
      </span>}
      <span className="lbl">{lbl}</span>
      {seg(opts.map(([k, l]) => [String(k), l] as [string, string]), String(zoom), (v) => { setZoom(v === "all" ? "all" : Number(v)); setWin(null); }, "data-zoom")}</span>
  );
  /** แถบเลื่อนซ้ายขวาใต้กราฟ แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด */
  const scroller = (left: number, right: number) => (
    <TimeScroll dur={dur} t0={t0} t1={t1} left={left} right={right} onPan={panTo} onBusy={grabBusy} />
  );
  // ปุ่มสีหน้าวิเคราะห์อยู่มุมขวาบนของกราฟ พี่กันเลือกแบบแถบสีพร้อมชื่อจากมอคอัป pick-ui.html (9 พ.ย. 2569) · ปุ่มหน้ารูปคลื่นกับหน้าความถี่อยู่แถวปุ่มมุมมองตามเดิม พี่กันไม่ได้สั่งย้าย ("รายละเอียด แท่ง audisity ไม่ได้ให้ย้าย")
  const spekSw = (n: Prefs["scmap"]) => <Swatch ramp={spekRamp(n, th.ramp, prefs.spekLight)} />;
  const styleTools = (
    <div className={"plottools onspek" + (prefs.spekLight ? " light" : "")} data-plottools>
      {seg<Prefs["scmap"]>([["heat", <>{spekSw("heat")}สีความร้อน</>], ["rainbow", <>{spekSw("rainbow")}สีรุ้ง</>], ["mono", <>{spekSw("mono")}ขาวดำ</>], ["theme", <>{spekSw("theme")}สีตามชุด</>]], prefs.scmap, (v) => setPref("scmap", v), "data-scmap")}
      <button type="button" className={"sptick" + (prefs.spekLight ? " on" : "")} role="checkbox" aria-checked={prefs.spekLight} onClick={() => setPref("spekLight", !prefs.spekLight)} data-speklight>
        <i aria-hidden="true">{prefs.spekLight && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}</i>พื้นสว่าง
      </button>
    </div>
  );
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{VIEWS.map(([k, l]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => switchView(k)} data-view={k}
        disabled={k === "cmp" && !names.includes("FL")} title={k === "cmp" && !names.includes("FL") ? "ซ้อนเทียบใช้กับแทร็กที่มีช่องซ้ายขวา" : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      {view === "wave" && seg<WaveStyle>([["fine", <><WaveIc d="M2 12h3l2-6 3 12 3-14 3 16 2-8h4" />เส้นละเอียด</>], ["bars", <><WaveIc d="M5 9v6M10 5v14M15 8v8M20 10v4" />แท่ง</>], ["aud", <><WaveIc d="M3 12c2-7 3-7 5 0s3 7 5 0 3-7 5 0 2 4 3 0" />แบบ Audacity</>]], prefs.style, (v) => setPref("style", v), "data-style")}
      <div className="sws" style={{ marginLeft: "auto" }} role="group" aria-label="ชุดสี">{THEME_ORDER.map((n) => <button key={n} type="button" className={"sw" + (prefs.theme === n ? " on" : "")} aria-label={"ชุดสี" + n} title={"ชุดสี" + n} onClick={() => setPref("theme", n)} data-theme={n}
        style={{ background: `linear-gradient(135deg,${THEMES[n].ramp[2]},${THEMES[n].ramp[5]} 60%,${THEMES[n].ramp[7]})` }} />)}</div>
      <GraphOptions on={zoomAll} onChange={(v) => updateSettings({ graphZoomAll: v })} />
      {/* ขยายกราฟเต็มจอ พับแผงลำโพงซ้าย กดอีกครั้งกางคืน จำไว้ (พี่กันสั่ง 8 พ.ย. 2569) */}
      <button type="button" className={"btn btn-ghost btn-sm" + (prefs.wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={prefs.wide} title={prefs.wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} aria-label={prefs.wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} onClick={() => setPref("wide", !prefs.wide)} data-graphwide><IcExpand size={14} /></button>
      {/* ชื่อชุดสีที่เคยเขียนต่อท้ายเอาออก ปุ่ม แบบ Audacity เพิ่มเข้ามาแล้วชื่อตกบรรทัดสองตัวเดียว · ชุดที่เลือกมีวงกรอบ ชี้แล้วขึ้นชื่อ */}
    </div>
  );

  /* ---------- แผงซ้าย ---------- */
  const infoRows: [string, string][] = t ? [
    ["Codec", codecDetail[t.index] ?? t.codec], ["Channels", `${t.layout} · ${names.length} ${names.length === 1 ? "channel" : "channels"}`], ["Sample rate", `${(t.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz`],
    ...(t.bits ? [["Bit depth", `${t.bits}-bit`] as [string, string]] : []), ...(t.bitrate ? [["Bitrate", `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s`] as [string, string]] : []),
    ...(t.lang ? [["Language", t.lang] as [string, string]] : []),
  ] : [];
  const firstMark = marks[0];
  // แถวสั้น ของยาวกับค่าเทคนิคดูเต็มได้จากการกดปกหรือชื่อไฟล์
  const tagShow = tagFile ? tagRows(tagFile, null).filter(([k]) => !["รูปปก", "ค่าความดัง", "หมายเหตุ"].includes(k)).map(([k, v]): [string, string] => [k === "ชื่อเพลง" && !tagFile.audioOnly ? "ชื่อเรื่อง" : k, v]) : [];
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {t?.layout ?? ""}</span><span className="small" style={{ color: "var(--txt3)" }}>{hidden.length ? `แสดง ${vis.length} จาก ${names.length} ช่อง` : `${names.length} ช่อง`}</span></h3>
        {names.length > 0 && <Speakers names={names} th={th} levels={levels} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{names.length > 1 ? "กดลำโพงเพื่อปิดหรือเปิดช่องนั้น" : "ไฟล์นี้มีเสียงช่องเดียว"}</div></div>
      {t && <div className="card"><h3>ข้อมูลเสียง</h3><dl className="kv" data-graphinfo>{infoRows.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl></div>}
      {path && <div className="card gtag" data-graphtagcard><h3>{tagFile && !tagFile.audioOnly ? "ข้อมูลในไฟล์" : "ข้อมูลเพลง"}</h3>
        <div className="gcover">{tagCover === undefined ? <Skel w="100%" h={120} r={0} />
          : tagCover ? <button type="button" onClick={() => setTagFor(path)} title="ดูข้อมูลเพลงทั้งหมด" aria-label="ดูข้อมูลเพลงทั้งหมด" data-graphcover><img src={tagCover.url} alt="รูปปก" /></button>
          : <div className="none" data-graphcover="none">ไม่มีรูปปก</div>}</div>
        {tagShow.length > 0 ? <dl className="kv" data-graphtags-kv>{tagShow.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl>
          : tagFile && <div className="small" style={{ marginTop: 8 }} data-graphtags-none><Phr>{whyNone(tagFile)}</Phr></div>}</div>}
      {firstMark && <div className="stat warn">{WARN}<div><b>{movie?.check?.spans?.length ? "ผลตรวจล่าสุด" : "ช่วงเงียบผิดปกติ"}</b><span className="nw">{firstMark.text.replace(" · ผลตรวจ", "")}</span> <span className="nw">ที่ {tfmt(firstMark.from)}</span>
        <div style={{ marginTop: 6 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCenter(firstMark.from + 1); setTip(firstMark.from); setZoom(30); if (view !== "wave" && view !== "spec") setPref("view", "wave"); }} data-goto><IcSearch size={15} /><span>ซูมไปที่ <FixedTime t={tfmt(firstMark.from)} longest={tfmt(dur)} /></span></button></div></div></div>}
    </div>
  );

  /* ---------- กำลังอ่าน · อ่านไม่ได้ ---------- */
  if (error && !ov) {
    const stopped = error === "หยุดอ่านเสียงแล้ว";
    return (
      <div className="ag" data-graph>{head}{tagDlg}
        <div className={"stat " + (stopped ? "info" : "bad")} data-grapherror>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          <div><b>{error}</b>{stopped ? "ยังไม่ได้วาดกราฟ · กดอ่านใหม่เพื่อเริ่มอีกครั้ง" : error.includes("ไม่มีแทร็กเสียง") ? "วิดีโออัดหน้าจอบางแบบไม่ได้อัดเสียงไว้" : "ลองเปิดไฟล์อื่น หรือตรวจไฟล์นี้ที่หน้าตรวจไฟล์"}
            {!error.includes("ไม่มีแทร็กเสียง") && <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)} data-graphretry><IcRefresh size={15} />อ่านใหม่</button></div>}</div>
        </div>
      </div>
    );
  }
  if (!ov || !src) {
    return (
      <div className="ag" data-graph><div className="agstick">{head}{ctl}</div>{tagDlg}
        <div className="agb">{panel}
          <div className="plot" data-graphloading>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13.5 }}>อ่านเสียง {names.length || ""} ช่อง <b>{Math.round(progress ?? 0)}%</b>{progress != null && progress > 3 && info ? "" : ""}</div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => graphApi.cancel()}><IbStop size={15} />หยุด</button>
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
  const peakTxt = (c: string) => { const i = names.indexOf(c); return ov.peaks[i] == null ? "" : ov.peaks[i] <= -119 ? "เงียบทั้งไฟล์" : ov.peaks[i] < -96 ? "แทบเงียบทั้งไฟล์ " + pkTxt(ov.peaks[i]) : "ยอด " + pkTxt(ov.peaks[i]); };
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
    const minH = names.length > 6 ? 52 : names.length > 2 ? 72 : 120;
    // 234 คือหัวกราฟ แถบเลื่อน แถวปุ่มท้าย ระยะขอบรวมกัน
    const laneH = Math.max(minH, Math.floor((paneH - 234 - (names.length - 1) * 6) / Math.max(1, names.length)));
    const colors = lut(prefs.cmap === "rainbow" ? RAINBOW : th.ramp);
    plot = (
      <div className="plot" data-plot ref={plotRef}>
        <div className="plotstick">
        <div className="plothead"><span><b>{view === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox(ZOOMS, "ซูม")}</div>
        <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={(x) => { setCenter(x); setTip(x); if (zoom === "all") setZoom(240); }} left={LW} right={VZ_W} />
        <Ruler left={LW} right={VZ_W} />
        </div>
        <div className="lanewrap" style={{ marginTop: marks.some((m) => m.to > t0 && m.from < t1) ? 28 : 6, position: "relative" }}
          onWheel={(e) => { if (view !== "spec" || sz <= 1 || e.ctrlKey) return; e.stopPropagation(); setSb((b) => szClampB(b + (e.deltaY < 0 ? 0.25 : -0.25) / sz, sz)); }}>
        <div className={"lanes " + lanesGrab.cls} ref={setBoxEl} style={{ marginTop: 0 }} {...lanesGrab.props} onPointerMove={(e) => { if (!lanesGrab.move(e)) onMove(LW, 0)(e); }} onPointerLeave={() => setHover(null)} data-lanes>
          {names.map((c) => {
            const i = names.indexOf(c), l = label(names, c);
            if (hidden.includes(c)) return <LaneOff key={c + "off"} code={l.code} th={l.th} peak={peakTxt(c)} height={view === "wave" && prefs.style === "aud" ? Math.max(laneH, 60) : laneH} />;
            return view === "wave"
              ? <Lane key={c + view} room code={l.code} th={l.th} peak={peakTxt(c)} height={prefs.style === "aud" ? Math.max(laneH, 60) : laneH} deps={[src, t0, t1, th, prefs.style, i, vz, laneH]}
                  draw={(g, w, h) => drawWave(g, w, h, sample(src, i, t0, t1, w), th, prefs.style, vz)}
                  ruler={prefs.style === "aud" ? (g, w, h) => drawAmpRuler(g, w, h, vz) : undefined} />
              : <Lane key={c + view} code={l.code} th={l.th} peak={peakTxt(c)} height={laneH} deps={[src, winNow, heldShown, t0, t1, prefs.cmap, th, i, laneH, sz, sb]}
                  draw={(g, w, h) => drawSpecLane(g, w, h, i, winNow, ov, t0, t1, t?.rate ?? 48000, colors, sz, sb, heldShown)} />;
          })}
          <Marks marks={marks} t0={t0} t1={t1} left={LW} right={0} />
          {/* เส้นตั้งกับกล่องบอกค่าขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน 7 พ.ย. 2569 *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) */}
          {hover != null && <Crosshair box={boxEl} left={LW} right={0} t0={t0} t1={t1} at={at} rows={vis.map((c) => ({ v: dbTxt(valueAt(names.indexOf(c), at)) + " dB", k: `${label(names, c).code} ${label(names, c).th}` }))} />}
        </div>
        {view === "spec" && sz > 1 && <div ref={svRef} className="spekvs" style={{ top: 0, bottom: 0, right: VZ_W + 4 }} title="ลากเลื่อนย่านความถี่ขึ้นลง · หมุนล้อเมาส์บนกราฟก็ได้" data-specvs
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); svDrag.current = true; svTo(e.clientY); }} onPointerMove={(e) => { if (svDrag.current) svTo(e.clientY); }} onPointerUp={() => { svDrag.current = false; }} onPointerCancel={() => { svDrag.current = false; }}>
          <i style={{ height: 100 / sz + "%", bottom: sb * 100 + "%" }} data-specthumb /></div>}
        {view === "spec" ? <FZoom value={sz} onChange={setSz} /> : VZ_W > 0 && <VZoom value={vz} onChange={setVz} />}
        </div>
        {scroller(LW, VZ_W)}
        <div className="agfoot">
          {view === "wave"
            ? <div className="lg">{prefs.style === "bars" ? <span><svg width="22" height="14" viewBox="0 0 22 14" style={{ verticalAlign: -2, marginRight: 5 }} aria-hidden="true"><rect width="22" height="14" rx="3" fill={th.lane} stroke={th.peak} /><rect x="4" y="5" width="2" height="4" rx="1" fill={th.rms} /><rect x="8" y="2" width="2" height="10" rx="1" fill={th.rms} /><rect x="12" y="4" width="2" height="6" rx="1" fill={th.rms} /><rect x="16" y="3" width="2" height="8" rx="1" fill={th.rms} /></svg>ความสูงแท่ง คือยอดเสียงช่วงนั้น</span> : prefs.style === "aud" ? <><span><i style={{ background: th.rms }} />ยอดเสียง</span><span><i style={{ background: th.ramp[5] }} />ความดังเฉลี่ย</span><span className="small">ตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล</span></> : <><span><i style={{ background: th.peak }} />ยอดเสียง</span><span><i style={{ background: th.rms }} />ความดังเฉลี่ย</span></>}{marks.length > 0 && <span style={{ color: "#b03535" }}><i style={{ background: "rgba(208,59,59,.25)", border: "1px solid rgba(208,59,59,.75)" }} />จุดเสีย</span>}</div>
            : <div className="speclegend"><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${(prefs.cmap === "rainbow" ? RAINBOW : th.ramp).join(",")})` }} /><span className="nw">0 dB</span><span className="nw" style={{ marginLeft: 6 }}>20 Hz ถึง {Math.round((t?.rate ?? 48000) / 2000)} kHz</span></div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {view === "spec" && seg<"theme" | "rainbow">([["theme", <><Swatch ramp={th.ramp} />สีตามชุด</>], ["rainbow", <><Swatch ramp={RAINBOW} />สีรุ้ง</>]], prefs.cmap, (v) => setPref("cmap", v), "data-cmap")}
            {/* ขยายแนวตั้งอยู่แถวล่าง (เดิมอยู่แถวปุ่มบน ชุดสีตกบรรทัดที่สอง เจอตอนตรวจภาพ) */}
            {view === "wave" && VZ_W > 0 && <><span className="lbl">ขยายแนวตั้ง</span>{seg<number>([[1, "1×"], [2, "2×"], [4, "4×"]], vz, setVz, "data-vz")}<span className="vzval" data-vzval title="ลากแถบแนวตั้งขวามือรูปคลื่น ขึ้นยืด ลงบีบ">{vzTxt(vz)}</span></>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={play} data-graphplay><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(dur)} /></span></button><SaveBtn onClick={saveImage} /></div>
        </div>
      </div>
    );
    exportRef.current = (outW) => composeLanes(boxEl, outW);
  } else if (view === "loud") {
    plot = <LoudView onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} ov={ov} th={th} t0={t0} t1={t1} names={names} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} showTable={showTable} setShowTable={setShowTable} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "cmp") {
    const cc = ["FL", "FR", "FC"].filter((c) => names.includes(c));
    plot = <CmpView onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} dur={dur} src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "spek") {
    plot = <SpekView onBusy={grabBusy} held={heldShown} resetN={resetN} tools={styleTools} light={prefs.spekLight} onPanT={panTo} scroller={scroller} ov={ov} win={winNow} track={t} fileName={fileName} names={names} t0={t0} t1={t1} zoomBox={zoomBox(ZOOMS, "ซูม")} scmap={prefs.scmap} setScmap={(v) => setPref("scmap", v)} th={th} audioOnly={!!info?.audioOnly} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} at={at} />;
  } else {
    plot = <PsdView filePath={path ?? ""} onReset={() => { setZoom("all"); setWin(null); setResetN((n) => n + 1); }} resetN={resetN} scroller={scroller} psd={psd && psd.db.length === psdSeries.length + (psdMs ? 2 : 0) ? psd : null} names={names} psdCh={psdCh} setPsdCh={setPsdCh} psdLog={psdLog} setPsdLog={setPsdLog} psdSize={psdSize} setPsdSize={setPsdSize} th={th} ov={ov} t0={t0} t1={t1}
      zoomBox={zoomBox(PSD_SPANS, "ช่วงที่เลือก")} onPick={(x) => { setCenter(x); if (zoom === "all") setZoom(30); }} f={psdF} setF={setPsdF} fileName={fileName} save={saveImage} exportRef={exportRef} plotRef={plotRef} toast={toast} />;
  }

  return (
    <SavingCtx.Provider value={saving}><div className="ag" data-graph data-graphview={view}>
      <div className="agstick">{head}{ctl}</div>
      <div className={"agb" + (prefs.wide ? " wide" : "")}>{prefs.wide ? null : panel}{plot}{viewSlow && !saving && <LoadPill text="กำลังโหลดกราฟ…" />}</div>
      {tagDlg}
    </div></SavingCtx.Provider>
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
            <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => this.setState({ err: null })}><IcGraph size={15} />เปิดหน้ากราฟใหม่</button></div></div>
        </div>
      </div>
    );
  }
}

/** แถวข้อมูล · ค่าที่มีวงเล็บท้าย เช่น MPEG-1 Layer 3 (LAME 4.0) ตัดบรรทัดได้เฉพาะหน้าวงเล็บ ไม่ตัดกลางวงเล็บ (พี่กันทัก 10 พ.ย. 2569 "แบ่งบรรทัดดี ๆ") */
function FragmentKV({ k, v }: { k: string; v: string }) {
  const at = v.lastIndexOf(" (");
  return <><dt>{k}</dt><dd>{at > 0 && v.endsWith(")") ? <><span className="nw">{v.slice(0, at)}</span> <span className="nw">{v.slice(at + 1)}</span></> : v}</dd></>;
}

/** แถบทั้งไฟล์ · กดเพื่อกระโดด */
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
    <div className="ovrul" style={{ marginLeft: left, marginRight: right }}><span>0:00</span><span style={{ left: "50%" }}>ทั้งไฟล์ {tfmt(ov.duration)}{ov.readTo < ov.duration - 1 ? ` · อ่านได้ถึง ${tfmt(ov.readTo)}` : ""}</span><span style={{ left: "100%" }}>{tfmt(ov.duration)}</span></div>
  </>);
}

/** แถบเลื่อนซูมเวลาแนวนอน อยู่ระหว่างปุ่มแว่นขยายซูมออกกับซูมเข้า (พี่กัน 7 พ.ย. 2569 *"เรามีย่อขยายเเนวตั้งเเล้ว ยังเหลือย่อขยายเเนวนอนนะ"* · *"เอาตอนนี้เลย"*)
   ซ้ายสุดเห็นทั้งไฟล์ ขวาสุดครึ่งวินาที สเกลล็อก · ซูมรอบกลางช่วงที่ดูอยู่ · กดที่แถบกระโดด · หมุนล้อเมาส์บนแถบ · ลูกศรซ้ายขวา · Home ทั้งไฟล์ End ครึ่งวินาที */
const HZ_MIN = 0.5;
function HZoom({ dur, span, onSpan, name = "ซูมเวลา", text, onBusy }: { dur: number; span: number; onSpan: (s: number) => void; name?: string; text?: string; onBusy?: (on: boolean) => void }) {
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
        onPointerDown={(e) => { if (!ok) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onBusy?.(true); onSpan(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current) onSpan(fromX(e.clientX)); }}
        onPointerUp={() => { if (drag.current) onBusy?.(false); drag.current = false; }} onPointerCancel={() => { if (drag.current) onBusy?.(false); drag.current = false; }}>
        <span className="fill" style={{ width: pos * 100 + "%" }} />
        <span className="knob" role="slider" aria-orientation="horizontal" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)}
          aria-valuetext={text ?? `ช่วงที่ดู ${tfmt(Math.min(dur, span))}`} tabIndex={ok ? 0 : -1} title={`${text ?? `ช่วงที่ดู ${tfmt(Math.min(dur, span))}`} · ลากขวาซูมเข้า ลากซ้ายซูมออก`}
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

const FZ_MAX = 16;
const fzClamp = (v: number) => { const c = Math.max(1, Math.min(FZ_MAX, v)); return [1, 2, 4, 8, 16].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
/** ซูมแนวตั้งหน้าวิเคราะห์ (พี่กันขอ 9 พ.ย. 2569 "มีซูมตามเเนวนอนเเล้ว เเต่ไม่มีซูมเเนวตั้งเเฮะ") · หน้าตาแบบแถบบีบยืดหน้ารูปคลื่น · 1 ถึง 16 เท่า ดับเบิลคลิกกลับ 1 เท่า */
function FZoom({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false), cur = useRef(value); cur.current = value;
  const L = Math.log(FZ_MAX), pos = (v: number) => Math.log(v) / L * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); return fzClamp(Math.exp((1 - Math.max(0, Math.min(1, (y - r.top) / r.height))) * L)); };
  useEffect(() => {
    const el = root.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); onChange(fzClamp(cur.current * (e.deltaY < 0 ? 1.25 : 0.8))); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onChange]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowUp: 1.25, ArrowRight: 1.25, ArrowDown: 0.8, ArrowLeft: 0.8, PageUp: 2, PageDown: 0.5 };
    if (m[e.key]) { e.preventDefault(); onChange(fzClamp(value * m[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(1); }
    else if (e.key === "End") { e.preventDefault(); onChange(FZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom" ref={root} data-fzoom>
      <span className="ic" title="ลากขึ้น ขยาย">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ซูมแนวตั้ง" aria-valuemin={1} aria-valuemax={FZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ซูมแนวตั้ง ${vzTxt(value)} · ลากขึ้นขยาย ลากลงย่อ · ดับเบิลคลิกกลับ 1×`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-fzknob />
      </div>
      <span className="fzval" data-fzval>{vzTxt(value)}</span>
    </div>
  );
}

/** แถบเลื่อนซ้ายขวา แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด · ลูกศรซ้ายขวาเลื่อนทีละหนึ่งในสิบ */
function TimeScroll({ dur, t0, t1, left, right, onPan, onBusy }: { dur: number; t0: number; t1: number; left: number; right: number; onPan: (center: number) => void; onBusy?: (on: boolean) => void }) {
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
        onPointerDown={(e) => { if (all) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, c: mid }; onBusy?.(true); }}
        onPointerMove={(e) => { if (drag.current) onPan(drag.current.c + toTime(e.clientX - drag.current.x)); }}
        onPointerUp={() => { if (drag.current) onBusy?.(false); drag.current = null; }} onPointerCancel={() => { if (drag.current) onBusy?.(false); drag.current = null; }} />
    </div>
  );
}

/** ความถี่ของช่องหนึ่งในแถบ · แกนตั้งแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่ม */
function drawSpecLane(g: CanvasRenderingContext2D, w: number, h: number, ch: number, win: GWindow | null, ov: GOverview, t0: number, t1: number, rate: number, colors: Uint8ClampedArray, z = 1, b = 0, held: GWindow | null = null) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  if (win) {
    const d = dec(win.spec[ch]); const cols = Math.round(d.length / win.bins);
    const r0 = Math.min(win.bins - 1, Math.floor(b * win.bins)), nr = Math.max(2, Math.min(win.bins - r0, Math.ceil(win.bins / z)));
    drawMatrix(g, 0, 0, w, h, cols, nr, colors, (row, col) => d[col * win.bins + r0 + row]);
    return;
  }
  // ระหว่างรอช่วงที่ซูม ใช้ความถี่ของภาพรวม (เส้นตรง) แปลงเป็นแกนล็อก
  const d = dec(ov.spec[ch]), B = ov.specBins, nyq = rate / 2, rows = 96;
  const c0 = Math.floor(t0 / ov.duration * ov.specCols), c1 = Math.max(c0 + 1, Math.ceil(t1 / ov.duration * ov.specCols));
  const binOf = (row: number) => Math.min(B - 1, Math.floor(20 * Math.pow(nyq / 20, b + (row + 0.5) / rows / z) / nyq * B));
  drawMatrix(g, 0, 0, w, h, c1 - c0, rows, colors, (row, col) => d[(c0 + col) * B + binOf(row)]);
  // ระหว่างลาก ส่วนที่เคยอ่านคมแล้ววาดทับตรงตำแหน่งใหม่
  if (held) {
    const hd = dec(held.spec[ch]), hc = Math.round(hd.length / held.bins), r0 = Math.min(held.bins - 1, Math.floor(b * held.bins)), nr = Math.max(2, Math.min(held.bins - r0, Math.ceil(held.bins / z))), k = w / (t1 - t0 || 1);
    drawMatrix(g, (held.t0 - t0) * k, 0, (held.t1 - held.t0) * k, h, hc, nr, colors, (row, col) => hd[col * held.bins + r0 + row]);
  }
}

/** รูปกราฟทุกแถบรวมเป็นรูปเดียว ไว้บันทึก */
function composeLanes(box: HTMLDivElement | null, outW: number): HTMLCanvasElement | null {
  if (!box) return null;
  const lanes = [...box.querySelectorAll<HTMLDivElement>("[data-lane]")];
  if (!lanes.length) return null;
  const ruler = box.closest("[data-plot]")?.querySelector(".ruler"), axis = ruler ? 24 : 0;
  const W = box.clientWidth, H = lanes.reduce((sum, l) => sum + l.clientHeight + 6, 8) + axis, k = outW ? outW / W : screenK();
  const out = document.createElement("canvas"); out.width = Math.round(W * k); out.height = Math.round(H * k);
  const g = out.getContext("2d"); if (!g) return null;
  g.scale(k, k); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  let y = 4, cvX = 0, cvW = W;
  for (const l of lanes) {
    const mid = y + l.clientHeight / 2, sub = l.querySelector(".lab span")?.textContent ?? "";
    g.textBaseline = "middle"; g.fillStyle = "#4a2b38"; g.font = "700 13px Sarabun, sans-serif"; g.fillText(l.dataset.lane ?? "", 6, sub ? mid - 8 : mid);
    if (sub) { g.fillStyle = "#6b4a58"; g.font = "12px Sarabun, sans-serif"; g.fillText(sub, 6, mid + 8); }
    // รูปคลื่นกับไม้บรรทัดตัวเลข (แบบ Audacity) วางตามตำแหน่งจริงบนจอ
    for (const cv of l.querySelectorAll<HiCanvas>("canvas.vrul, canvas.cv")) {
      g.drawImage(hiCopy(cv, k), cv.offsetLeft, y, cv.clientWidth, cv.clientHeight);
      if (cv.classList.contains("cv")) { cvX = cv.offsetLeft; cvW = cv.clientWidth; }
    }
    if (l.dataset.off !== undefined) { g.fillStyle = "#8a6474"; g.font = "600 13px Sarabun, sans-serif"; g.textAlign = "center"; g.fillText("ปิดลำโพง", W / 2, mid); g.textAlign = "left"; }
    y += l.clientHeight + 6;
  }
  drawRuler(g, ruler, cvX, cvW, y + 10);
  return out;
}
type CommonProps = { scroller?: (left: number, right: number) => React.ReactNode; save: () => void; exportRef: React.MutableRefObject<(outW: number) => HTMLCanvasElement | null>; plotRef: React.RefObject<HTMLDivElement | null> };
function LoudView({ onPan, onBusy, resetN, scroller, ov, th, t0, t1, names, marks, zoomBox, at, live, setHover, showTable, setShowTable, save, exportRef, plotRef }: CommonProps & { onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; ov: GOverview; th: Theme; t0: number; t1: number; names: string[]; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; showTable: boolean; setShowTable: (b: boolean) => void }) {
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
        <div className="tile"><span>ยอดเสียงสูงสุด</span><b>{f1(ov.truePeak)} dBTP</b><em>{(ov.truePeak ?? -99) >= 0 ? "ถึง 0 · อาจมีเสียงแตก" : "ไม่ถึง 0"}{ov.clips.some((c) => c > 0) ? ` · เสียงแตก ${ov.clips.reduce((a, b) => a + b, 0)} จุด` : ""}</em></div>
        <div className="tile"><span>ช่วงความดัง</span><b>{f1(ov.lra)} LU</b><em>ห่างระหว่างช่วงเบากับช่วงดัง</em></div>
        <div className="tile"><span>ช่วงเงียบผิดปกติ</span><b>{sil ? `${sil} ช่วง` : "ไม่พบ"}</b><em>{sil ? `แรกสุดที่ ${tfmt(ov.silences[0][0])}` : "เงียบทุกช่องเกิน 1 วินาที"}</em></div>
      </div>
      <div className="plothead"><span><b>ความดังตลอดไฟล์</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox}</div>
      </div>
      <div style={{ flex: "1 0 200px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} onWheel={vr.wheel} {...grab.props} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - 4, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-loudbox>
        <canvas className="cv fillcv" ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={4} inline />
        {live && <Crosshair box={box} left={X0} right={4} t0={t0} t1={t1} at={at} rows={[{ v: minus(pick(at).toFixed(1)) + " LUFS", k: "ทุกช่องรวม" }]} />}
        <VBar v={vr} right={6} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {scroller?.(X0, 34)}
      <div className="sub">ยอดเสียงแต่ละช่อง</div>
      <div className="pbars">{names.map((c, i) => <FragmentBar key={c} code={label(names, c).code} th={label(names, c).th} w={Math.max(ov.peaks[i] <= -119 ? 0 : 2, (ov.peaks[i] + 48) / 48 * 100)} color={th.rms} v={pkTxt(ov.peaks[i])} />)}</div>
      <div className="agfoot"><div className="lg"><span><i style={{ background: th.peak }} />ความดัง</span><span><span className="ln" style={{ background: th.rms }} />เส้นความดัง</span><span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง</span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable(!showTable)} data-table><Keep icon={<IbTable size={15} />} all={["ซ่อนตาราง", "ดูเป็นตาราง"]}>{showTable ? "ซ่อนตาราง" : "ดูเป็นตาราง"}</Keep></button><SaveBtn onClick={save} /></div></div>
      {showTable && <table className="fmt" style={{ marginTop: 10 }} data-graphtable><thead><tr><th>ช่อง</th><th className="num">ยอดเสียง</th><th className="num">ความดังเฉลี่ย</th><th className="num">เสียงแตก</th></tr></thead>
        <tbody>{names.map((c, i) => <tr key={c}><td><b>{label(names, c).code}</b> {label(names, c).th}</td><td className="num">{pkTxt(ov.peaks[i])}</td><td className="num">{pkTxt(ov.rms[i])}</td><td className="num">{ov.clips[i] ? `${ov.clips[i]} จุด` : "ไม่พบ"}</td></tr>)}</tbody></table>}
    </div>
  );
}
function FragmentBar({ code, th, w, color, v }: { code: string; th: string; w: number; color: string; v: string }) {
  return <><div className="small" style={{ color: "var(--txt2)" }}><b style={{ color: "var(--txt)" }}>{code}</b> {th}</div><div className="bt"><i style={{ width: `${w}%`, background: color }} /></div><div className="v">{v}</div></>;
}

/* ---------- ซ้อนเทียบ ---------- */
function CmpView({ onPan, onBusy, resetN, scroller, dur, src, names, cc, t0, t1, marks, zoomBox, at, live, setHover, play, save, exportRef, plotRef }: CommonProps & { onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; dur: number; src: Src; names: string[]; cc: string[]; t0: number; t1: number; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; play: () => void }) {
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
      <div className="plothead"><span><b>ซ้อนเทียบความดังเฉลี่ย</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBox}</div>
      <div style={{ flex: "1 0 250px", display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} onWheel={vr.wheel} {...grab.props} onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), W = r.width - X0 - RW, x = e.clientX - r.left - X0; if (x >= 0 && x <= W) setHover(t0 + x / W * (t1 - t0)); }} onPointerLeave={() => setHover(null)} data-cmpbox>
        <canvas className="cv fillcv" ref={ref} />
        <Marks marks={marks} t0={t0} t1={t1} left={X0} right={RW} inline />
        {live && <Crosshair box={box} left={X0} right={RW} t0={t0} t1={t1} at={at} rows={cc.map((c) => ({ v: dbTxt(val(c)) + " dB", k: `${label(names, c).code} ${label(names, c).th}`, color: CMP[c] }))} />}
        <VBar v={vr} right={RW + 2} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {scroller?.(X0, RW + 30)}
      <div className="agfoot"><div className="lg">{cc.map((c) => <span key={c}><span className="ln" style={{ background: CMP[c] }} />{label(names, c).code} {label(names, c).th}</span>)}<span className="small">ซ้อนได้ไม่เกิน 3 ช่อง</span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={play}><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(dur)} /></span></button><SaveBtn onClick={save} /></div></div>
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
function SpekView({ onBusy, held, resetN, tools, light, onPanT, scroller, ov, win, track, fileName, names, t0, t1, zoomBox, scmap, th, audioOnly, play, save, exportRef, plotRef, at }: CommonProps & { onBusy: (on: boolean) => void; held: GWindow | null; resetN: number; tools?: React.ReactNode; light: boolean; onPanT: (center: number) => void; ov: GOverview; win: GWindow | null; track: GTrack | undefined; fileName: string; names: string[]; t0: number; t1: number; zoomBox: React.ReactNode; scmap: Prefs["scmap"]; setScmap: (v: Prefs["scmap"]) => void; th: Theme; audioOnly: boolean; play: () => void; at: number }) {
  const [ch, setCh] = useState(-1);
  const rate = track?.rate ?? 48000, nyq = rate / 2;
  const ramp = spekRamp(scmap, th.ramp, light);
  const toolBox = useRef<HTMLDivElement>(null), areaRef = useRef<HTMLDivElement>(null), vsRef = useRef<HTMLDivElement>(null), vsDrag = useRef(false);
  // ซูมแนวตั้ง fz เท่า ขอบล่างของช่วงที่เห็น fb เป็นสัดส่วนของย่านความถี่ · ซูมแล้วคงกึ่งกลางเดิม
  const [fz, setFzRaw] = useState(1), [fb, setFb] = useState(0);
  const clampB = (b: number, z: number) => Math.max(0, Math.min(1 - 1 / z, b));
  const fzNow = useRef(1); fzNow.current = fz;
  useEffect(() => { if (resetN) { setFzRaw(1); setFb(0); } }, [resetN]);
  const setFz = useCallback((z: number) => { const old = fzNow.current; if (z === old) return; setFb((b) => clampB(b + 1 / old / 2 - 1 / z / 2, z)); setFzRaw(z); }, []);
  // ซูมแล้วลากบนกราฟเลื่อนได้ กราฟขยับตามมือ ซ้ายขวาคือเวลา ขึ้นลงคือย่านความถี่ · ไม่ได้ซูมแกนไหน แกนนั้นไม่ขยับ
  const canPan = fz > 1 || t1 - t0 < ov.duration - 0.01;
  const [dragging, setDragging] = useState(false);
  const dragFrom = useRef<{ x: number; y: number; fb: number; c: number; span: number; pw: number; ph: number } | null>(null);
  const panDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canPan || e.button !== 0) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    dragFrom.current = { x: e.clientX, y: e.clientY, fb, c: (t0 + t1) / 2, span: t1 - t0, pw: Math.max(1, r.width - SPK.L - SPK.R), ph: Math.max(1, r.height - SPK.T - SPK.B) };
    setDragging(true); onBusy(true);
  };
  const panMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragFrom.current; if (!d) return;
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
  // สีตัวหนังสือและเส้นตามพื้น · ตอนบันทึกเป็นรูปไม่มีปุ่มบังจึงเขียนชื่อไฟล์เต็ม บนจอตัดชื่อให้จบก่อนถึงปุ่ม
  const ink = light ? { bg: "#ffffff", line: "#333333", title: "#1c1c1c", sub: "#555555", tick: "#333333" } : { bg: "#000000", line: "#ffffff", title: "#ffffff", sub: "#d8d8d8", tick: "#e6e6e6" };
  const drawSpek = (g: CanvasRenderingContext2D, w: number, h: number, full: boolean) => {
    g.fillStyle = ink.bg; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = SPK, PW = w - L - R, PH = h - T - B, colors = lut([...ramp]);
    const srcs = list.map((i) => (win ? dec(win.spec[i]) : dec(ov.spec[i])));
    const bins = win ? win.bins : ov.specBins, cols = win ? Math.round(srcs[0].length / bins) : ov.specCols;
    const c0 = win ? 0 : Math.floor(t0 / ov.duration * cols), c1 = win ? cols : Math.max(c0 + 1, Math.ceil(t1 / ov.duration * cols));
    const r0 = Math.min(bins - 1, Math.floor(fb * bins)), nr = Math.max(2, Math.min(bins - r0, Math.ceil(bins / fz)));
    drawMatrix(g, L, T, PW, PH, c1 - c0, nr, colors, (row, col) => { let m = 0; for (const d of srcs) m = Math.max(m, d[(c0 + col) * bins + row + r0]); return m; });
    // ระหว่างลาก ส่วนที่เคยอ่านคมแล้ววาดทับตรงตำแหน่งใหม่
    if (!win && held) {
      const hs = list.map((i) => dec(held.spec[i])), hb = held.bins, hc = Math.round(hs[0].length / hb), hr0 = Math.min(hb - 1, Math.floor(fb * hb)), hn = Math.max(2, Math.min(hb - hr0, Math.ceil(hb / fz))), k = PW / (t1 - t0 || 1);
      g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip();
      drawMatrix(g, L + (held.t0 - t0) * k, T, (held.t1 - held.t0) * k, PH, hc, hn, colors, (row, col) => { let m = 0; for (const d of hs) m = Math.max(m, d[col * hb + row + hr0]); return m; });
      g.restore();
    }
    g.strokeStyle = ink.line; g.lineWidth = 1; g.strokeRect(L - 0.5, T - 0.5, PW + 1, PH + 1);
    const room = full ? Infinity : w - L - R - (toolBox.current?.offsetWidth ?? 450) - 16;
    const fit = (txt: string) => { if (g.measureText(txt).width <= room) return txt; let n = txt.length; while (n > 1 && g.measureText(txt.slice(0, n) + "…").width > room) n--; return txt.slice(0, n) + "…"; };
    g.textBaseline = "alphabetic"; g.textAlign = "left"; g.fillStyle = ink.title; g.font = "700 13.5px Sarabun, sans-serif"; g.fillText(fit(fileName), L, 22);
    g.fillStyle = ink.sub; g.font = "12px Sarabun, sans-serif";
    g.fillText(fit(`${track?.codec ?? ""} · ${rate.toLocaleString("en-US")} Hz${track?.bits ? ` · ${track.bits}-bit` : ""} · ${ch < 0 ? `${list.length} channels mixed` : `channel ${label(names, names[ch]).code}`}`), L, 42);
    g.fillStyle = ink.tick; g.font = "11.5px Sarabun, sans-serif"; g.textBaseline = "middle"; g.textAlign = "right";
    const f0 = fb * nyq, fSpan = nyq / fz, fs = [100, 250, 500, 1000, 2000, 4000, 8000, 16000].find((x) => PH * x / fSpan >= 24) ?? 32000;
    for (let f = Math.ceil(f0 / fs) * fs; f <= f0 + fSpan + 1; f += fs) { const y = T + PH * (1 - (f - f0) / fSpan); g.fillRect(L - 5, Math.round(y), 5, 1); g.fillText(`${f / 1000} kHz`, L - 8, y); }
    g.textAlign = "center"; g.textBaseline = "top"; const st = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => (t1 - t0) / s <= 10) ?? 7200;
    for (let x = Math.ceil(t0 / st) * st; x <= t1 + 0.01; x += st) { const px = L + (x - t0) / (t1 - t0 || 1) * PW; g.fillRect(Math.round(px), T + PH, 1, 5); g.fillText(tfmt(x), px, T + PH + 8); }
    const bx = L + PW + 18, grad = g.createLinearGradient(0, T, 0, T + PH); ramp.slice().reverse().forEach((c, i, a) => grad.addColorStop(i / (a.length - 1), c));
    g.fillStyle = grad; g.fillRect(bx, T, 12, PH); g.strokeStyle = ink.line; if (light) g.strokeRect(bx - 0.5, T - 0.5, 13, PH + 1);
    g.fillStyle = ink.tick; g.textAlign = "left"; g.textBaseline = "middle";
    for (let d = 0; d >= -120; d -= 20) { const y = T + PH * (-d / 120); g.fillRect(bx + 12, Math.round(y), 4, 1); g.fillText(`${d === 0 ? "0" : "−" + -d} dB`, bx + 20, y); }
  };
  const ref = useCanvas((g, w, h) => drawSpek(g, w, h, false), [ov, win, held, t0, t1, ch, scmap, th, light, fz, fb]);
  exportRef.current = (outW) => {
    const cv = ref.current; if (!cv) return null;
    const out = document.createElement("canvas"), r = outW ? outW / cv.clientWidth : screenK(); out.width = Math.round(cv.clientWidth * r); out.height = Math.round(cv.clientHeight * r);
    const g = out.getContext("2d"); if (!g) return null;
    g.setTransform(r, 0, 0, r, 0, 0); drawSpek(g, cv.clientWidth, cv.clientHeight, true);
    return out;
  };
  const verdict = spekVerdict(track?.codec ?? "", rate, edge);
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick"><div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><b>วิเคราะห์ความถี่</b>
        <span data-spekch><Dropdown label="ช่องที่ดู" value={String(ch)} onChange={(v) => setCh(Number(v))}
          options={[{ value: "-1", label: "รวมทุกช่อง" }, ...names.map((c, i) => ({ value: String(i), label: `${label(names, c).code} ${label(names, c).th}` }))]} /></span></span>{zoomBox}</div></div>
      <div className="spekarea">
        <div ref={areaRef} className="spekbox"><canvas className={"cv fillcv" + (light ? " spekcv-light" : "") + (canPan ? " spekpan" : "") + (dragging ? " dragging" : "")} style={{ borderRadius: 8 }} ref={ref} data-spek onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panEnd} onPointerCancel={panEnd} /><div ref={toolBox} className="spektools" style={{ right: SPK.R }}>{tools}</div>
          {fz > 1 && <div ref={vsRef} className={"spekvs" + (light ? " light" : "")} style={{ top: SPK.T, bottom: SPK.B, right: SPK.R - 14 }} title="ลากเลื่อนย่านความถี่ขึ้นลง · หมุนล้อเมาส์บนกราฟก็ได้" data-spekvs
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); vsDrag.current = true; vsTo(e.clientY); }} onPointerMove={(e) => { if (vsDrag.current) vsTo(e.clientY); }} onPointerUp={() => { vsDrag.current = false; }} onPointerCancel={() => { vsDrag.current = false; }}>
            <i style={{ height: 100 / fz + "%", bottom: fb * 100 + "%" }} data-spekthumb /></div>}
        </div>
        <FZoom value={fz} onChange={setFz} />
      </div>
      {scroller?.(0, 0)}
      <div className="agfoot">
        {verdict.warn
        ? <div className="stat warn" title={verdict.b + " · " + verdict.d} data-spekverdict data-cliff={Math.round(edge.cliff)}>{WARN}<div><b><Phr>{verdict.b}</Phr></b>{lines(verdict.d)}</div></div>
        : <div className="stat info" title={verdict.b + " · " + verdict.d} data-spekverdict data-cliff={Math.round(edge.cliff)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg><div><b><Phr>{verdict.b}</Phr></b>{lines(verdict.d)}</div></div>}
        
        <div style={{ display: "flex", gap: 8 }}>{!audioOnly && <button type="button" className="btn btn-ghost btn-sm" onClick={play}><IbPlay size={15} /><span>เปิดเล่นที่ <FixedTime t={tfmt(at)} longest={tfmt(ov.duration)} /></span></button>}<SaveBtn onClick={save} /></div></div>
    </div>
  );
}

/* ---------- ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity) ---------- */
const PSM = { L: 52, R: 18, T: 14, B: 30 };
/** ซูมแกนความถี่ได้สูงสุดกี่เท่า */
const PSD_HZ_MAX = 32;
/** ค่าบนเส้นโค้งผ่าน 4 จุดที่ตำแหน่ง 0 1 2 3 (พหุนามลากรานจ์ดีกรีสาม) · x คือตำแหน่งระหว่าง 0 ถึง 3 */
function cubicAt(y0: number, y1: number, y2: number, y3: number, x: number) {
  return y0 * -(x - 1) * (x - 2) * (x - 3) / 6 + y1 * x * (x - 2) * (x - 3) / 2 - y2 * x * (x - 1) * (x - 3) / 2 + y3 * x * (x - 1) * (x - 2) / 6;
}
function PsdView({ filePath, onReset, resetN, scroller, psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast }: CommonProps & { filePath: string; onReset: () => void; resetN: number;
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
  // ซูมแกนนอน (แกนความถี่) hr.z เท่า ขอบซ้ายของช่วงที่เห็น hr.b เป็นสัดส่วนบนแกน (พี่กันถาม 9 พ.ย. 2569 "แล้วซูมแนวนอนหายไปไหน")
  const hr = useVRange(resetN);
  const uOf = (fr: number) => (psdLog ? (Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(nyq) - Math.log10(20)) : fr / nyq);
  const X = (fr: number, w: number) => PSM.L + (uOf(fr) - hr.b) * hr.z * (w - PSM.L - PSM.R);
  /* หน้าตาแบบ Audacity (พี่กันส่งภาพหน้าต่าง Frequency Analysis ของ Audacity มา 7 พ.ย. 2569 *"กราฟมันยังไม่เหมือนใน audicity เลย"*)
     ระบายทึบสีเดียวใต้เส้น · แกน dB ปรับตามเสียงจริง ขีดทุก 6 dB · เส้นตารางถี่ทุกหลัก (20 30 40 … 100 200 300 …) เปิดปิดได้
     ช่วง dB เลือกได้ (แทนแถบซูมแนวตั้งของ Audacity) · บอกค่าที่ชี้กับยอดใกล้สุดในช่องใต้กราฟ วงกลมที่ยอด */
  const [grids, setGrids] = useState(true);
  const [range, setRange] = useState(90);
  const start = psdLog ? Math.max(1, Math.ceil(20 / fOf(1))) : 0;
  const vr = useVRange(resetN);
  const fullTop = useMemo(() => {
    if (!psd) return 0;
    let m = -150; for (const d of psd.db) for (let i = start; i < d.length; i++) m = Math.max(m, d[i]);
    return Math.min(0, Math.ceil(m / 6) * 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd, start]);
  const { lo, hi: top } = vWindow(fullTop - range, fullTop, vr);
  // กราฟค่อย ๆ โตจากพื้นขึ้นมา ไม่แวบมา (พี่กันสั่ง 9 พ.ย. 2569 "ตอนแสดงเราอยากให้มันมีอนิเมชันตอนแสดง ไม่ใช่แวบมา")
  const rise = useRise(psd);
  const grab = useGrab({ canX: hr.z > 1, canY: vr.z > 1, span: 1 / hr.z, center: hr.b + 0.5 / hr.z, onX: (c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z)), z: vr.z, b: vr.b, left: PSM.L, right: PSM.R, top: PSM.T, bottom: PSM.B, onY: (b) => vr.setB(vr.clampB(b, vr.z)) });
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
  const fAt = (x: number, PW: number) => { const u = hr.b + x / PW / hr.z; return psdLog ? 20 * Math.pow(nyq / 20, u) : Math.max(0, u * nyq); };
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
  const ref = useCanvas((g, w, h, rr) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const { L, R, T, B } = PSM, PW = w - L - R, PH = h - T - B, Y = (d: number) => Yof(d, h), stp = 1 / Math.max(1, rr);
    const ink = "#4a2b38", minor = "#efdde5", major = "#dcc0cc";
    // เส้นตารางแนวนอนทุก 6 dB (ถี่เกินไปเป็นทุก 12) · ตัวเลขทุกเส้น
    const step = [1, 2, 3, 6].find((k) => PH * k / (top - lo) >= 16) ?? 12;
    /** เส้นตารางทุกเส้น จดไว้วาดซ้ำทับพื้นสีด้วยสีขาวโปร่ง แบบ Audacity ที่เส้นตารางอยู่หน้าสุด
        (พี่กัน *"ของ audacity เส้นตารางมันจะอยู่หน้าสุดนะ … เอาเส้นตารางที่พาดผ่านสีจะอ่อนกว่าเส้นตารางพื้นหลังที่อยู่ฉากขาว"*) */
    const gl: [number, number, number, number, boolean][] = [];
    g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
    for (let d = Math.floor(top / step) * step; d >= lo - 0.01; d -= step) {
      const y = Math.round(Y(d)) + 0.5;
      if (grids) { gl.push([L, y, L + PW, y, true]); g.strokeStyle = major; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(L + PW, y); g.stroke(); }
      g.fillStyle = ink; g.fillText(minus(String(d)) + " dB", L - 6, y);
    }
    // เส้นตารางแนวตั้ง · แบบล็อก ทุก 1–9 × 10ⁿ (หลักเข้ม ตัวคั่นจาง) · แบบเส้นตรง ทุก 1 kHz
    g.textAlign = "center"; g.textBaseline = "top"; g.font = "600 11px Sarabun, sans-serif";
    const vline = (fr: number, strong: boolean) => { if (!grids) return; const x = Math.round(X(fr, w)) + 0.5; if (x < L || x > L + PW) return; gl.push([x, T, x, T + PH, strong]); g.strokeStyle = strong ? major : minor; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + PH); g.stroke(); };
    const hz = (fr: number) => (fr >= 1000 ? `${fr / 1000} kHz` : `${fr} Hz`);
    if (psdLog) {
      for (let dec = 10; dec <= nyq; dec *= 10) for (let m = 1; m <= 9; m++) { const fr = m * dec; if (fr >= 20 && fr <= nyq) vline(fr, m === 1); }
      let lastX = -99;
      // ซูมแล้วป้ายเดิมอยู่ห่างกันเกินไป เพิ่มป้ายถี่ขึ้นตามช่วงที่เห็น
      const marks = hr.z < 2 ? [1, 2, 5] : hr.z < 6 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9];
      const labels: number[] = [20];
      for (let dec = 10; dec <= nyq; dec *= 10) for (const m of marks) { const fr = Math.round(m * dec); if (fr > 20 && fr <= nyq) labels.push(fr); }
      for (const fr of labels) {
        const x = X(fr, w); const tw = g.measureText(hz(fr)).width;
        if (x < L - 1 || x > L + PW + 1 || x - tw / 2 < lastX + 8 || x + tw / 2 > L + PW + R) continue;
        g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); lastX = x + tw / 2;
      }
    } else {
      const seen = nyq / hr.z, gridStep = seen < 6000 ? 100 : 1000;
      for (let fr = gridStep; fr < nyq; fr += gridStep) vline(fr, fr % (gridStep * 5) === 0);
      const every = hr.z === 1 ? (nyq > 30000 ? 8000 : 4000) : [100, 200, 500, 1000, 2000, 4000, 8000].find((k) => PW * k / seen >= 80) ?? 8000;
      for (let fr = 0; fr <= nyq; fr += every) { const x = X(Math.max(fr, 1), w); if (x < L - 1 || x > L + PW + 1) continue; g.fillStyle = ink; g.fillText(hz(fr), x, T + PH + 6); }
    }
    const rising = !!psd && rise < 1;
    if (rising) { g.save(); g.beginPath(); g.rect(L, T, PW, PH); g.clip(); g.translate(0, (T + PH) * (1 - rise)); g.scale(1, rise); }
    if (!psd) { g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#b28a9a"; g.font = "13px Sarabun, sans-serif"; g.fillText("กำลังคิดความถี่เฉลี่ยของช่วงที่เลือก", L + PW / 2, T + PH / 2); }
    else if (psdCh === "all") {
      // ซ้อนทุกช่อง แบบ SpectrumAnalyzer (พี่กัน 7 พ.ย. 2569 *"เราอยากให้มันซ้อนกันแบบนี้ได้ของ spectrum ที่ดูได้ทุกความถี่ เเละมีสีที่ต่างกัน"*)
      // ระบายสีโปร่งของทุกเส้นก่อน แล้ววาดเส้นทึบทับทีหลัง เส้นจึงไม่จมใต้พื้นสีของเส้นอื่น · ส่วนที่ซ้อนกันเห็นสีผสม
      const drawn = shown.map((s) => {
        const area = new Path2D(), line = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); area.lineTo(L + x + 0.5, y); if (x) line.lineTo(L + x + 0.5, y); else line.moveTo(L + 0.5, y); }
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
      for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
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
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) g.lineTo(L + x + 0.5, y); else g.moveTo(L + 0.5, y); }
        g.stroke();
      }
    }
    if (rising) g.restore();
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, PW - 1, PH - 1);
  }, [rise, hr.z, hr.b, vr.z, vr.b, psd, psdLog, th, series, off, grids, range, top]);
  exportRef.current = (outW) => (ref.current ? hiCopy(ref.current, outW ? outW / ref.current.clientWidth : screenK()) : null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const cur = f ?? (hum[0]?.[0] ?? 1000);
  const hrNow = useRef(hr); hrNow.current = hr;
  useEffect(() => {
    if (!box) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const h = hrNow.current, r = box.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left - PSM.L) / Math.max(1, r.width - PSM.L - PSM.R)));
      const k = Math.max(1, Math.min(PSD_HZ_MAX, h.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))), u = h.b + p / h.z;
      h.setZ(k); h.setB(h.clampB(u - p / k, k));
    };
    box.addEventListener("wheel", fn, { passive: false });
    return () => box.removeEventListener("wheel", fn);
  }, [box]);
  const hrSpan = PSD_HZ_MAX * HZ_MIN;
  const setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
  const W = box?.clientWidth ?? 0, H = box?.clientHeight ?? 0, cx = W ? X(cur, W) : 0;
  // ยอดใกล้ตำแหน่งชี้ที่สุด วัดระยะแบบล็อก (บนแกนล็อกตรงกับที่ตาเห็นกว่าวัดเป็น Hz แบบ Audacity)
  const nearest = (fr: number) => allPeaks.slice().sort((a, b) => Math.abs(Math.log(a[0] / fr)) - Math.abs(Math.log(b[0] / fr)))[0];
  const valAt = (d: number[], fr: number) => valRange(d, fr * 0.999, fr * 1.001);
  const hzTxt = (fr: number) => `${Math.round(fr).toLocaleString("en-US")} Hz`;
  const pk = psd ? nearest(cur) : undefined;
  const exportCsv = async () => {
    if (!psd) return;
    const where = await pickSave(beside(filePath, fileName.replace(/\.[^.]+$/, "") + " ความถี่เฉลี่ย.csv"), "csv", "ตาราง CSV"); if (!where) return;
    const head = "Hz," + series.map((s) => s.name + " dB").join(",");
    const rows = psd.db[0].map((_, i) => [fOf(i).toFixed(2), ...psd.db.map((d) => d[i].toFixed(1))].join(","));
    try { const saved = await graphApi.save(where, null, [head, ...rows].join("\r\n")); toast({ kind: "ok", title: "ส่งออกตารางแล้ว", detail: saved }); }
    catch (e) { toast({ kind: "bad", title: "ส่งออกไม่ได้", detail: String(e) }); }
  };
  const opts: [string, string][] = names.length === 1 ? [["mix", label(names, names[0]).code]] : [["mix", "รวมทุกช่อง"], ...(names.includes("FR") ? [["FL", label(names, "FL").code], ["FR", label(names, "FR").code], ["lr", "เทียบซ้ายขวา"]] as [string, string][] : []), ["all", "ซ้อนทุกช่อง"]];
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick">
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><b>ความถี่เฉลี่ย</b>
        <div className="seg sm">{opts.map(([k, l]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-psdch={k}>{l}</button>)}</div></span>{zoomBox}</div>
      <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={onPick} left={52} />
      {scroller?.(52, 0)}
      </div>
      <div style={{ flex: "1 0 300px", marginTop: 8, display: "flex", gap: 8, minHeight: 0 }}>
      <div className={grab.cls} style={{ position: "relative", flex: 1, minWidth: 0 }} ref={setBox} data-psdbox onWheel={vr.wheel} {...grab.props}
        onPointerMove={(e) => { if (grab.move(e)) return; const r = e.currentTarget.getBoundingClientRect(), PW = r.width - PSM.L - PSM.R, x = Math.min(PW, Math.max(0, e.clientX - r.left - PSM.L)); setF(Math.max(1, fAt(x, PW))); }}
        onPointerLeave={() => setF(null)}>
        <canvas className="cv fillcv" ref={ref} data-psd />
        {/* เส้นตั้งกับวงยอดขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) · ช่องบอกค่าใต้กราฟยังอยู่ตลอด */}
        {psd && W > 0 && f != null && <>
          <div className="xh" style={{ left: cx, top: PSM.T, bottom: PSM.B }} />
          {pk && pk[1] >= lo && pk[1] <= top && X(pk[0], W) >= PSM.L && X(pk[0], W) <= W - PSM.R && <div className="psdpk" style={{ left: X(pk[0], W), top: Yof(pk[1], H) }} />}
        </>}
        <VBar v={vr} right={PSM.R + 4} top={PSM.T} bottom={PSM.B} />
      </div>
      <FZoom value={vr.z} onChange={vr.setZ} />
      </div>
      {/* แถบเลื่อนแกนความถี่ตรงกับขอบกราฟ เว้นขวาเท่าแถบซูมแนวตั้ง · ซูมแนวนอนอยู่ท้ายแถวบอกค่า หัวกราฟเต็มแล้ว */}
      <div style={{ marginRight: 30 }} data-psdhscroll><TimeScroll dur={1} t0={hr.b} t1={hr.b + 1 / hr.z} left={PSM.L} right={PSM.R} onPan={(c) => hr.setB(hr.clampB(c - 0.5 / hr.z, hr.z))} /></div>
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
        <span className="zbtns" style={{ order: 9, marginLeft: "auto" }} data-psdhzoom>
          <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก · Ctrl หมุนล้อเมาส์ลง"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
          <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
          <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า · Ctrl หมุนล้อเมาส์ขึ้น"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
          <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset onClick={onReset}><IcRefresh size={15} /></button>
        </span>
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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="lbl">ช่วง</span>
        <div className="seg sm">{[60, 90, 120].map((r) => <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)} data-psdrange={r}>{r} dB</button>)}</div></span>
        <span className="lbl">เส้นตาราง</span><span data-psdgrid style={{ display: "inline-flex" }}><Switch on={grids} onChange={setGrids} label="เส้นตาราง" /></span></div>
        <div style={{ display: "flex", gap: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}><IbSave size={15} />ส่งออกเป็นตาราง</button><SaveBtn onClick={save} /></div></div>
    </div>
  );
}

/* ---------- เทียบไฟล์ สูงสุด 4 ไฟล์ (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7 เทียบก่อนกับหลังแปลง · ขยายเป็นหลายไฟล์ 9 พ.ย. 2569) ----------
   กดเทียบความถี่ในคิวแปลง เปิดหน้านี้พร้อมสองไฟล์ · แท็บเดิมทั้ง 6 แท็บ ทุกกราฟแสดงสองไฟล์ ต้นฉบับสีฟ้า หลังแปลงสีส้ม
   แผงซ้ายช่องเสียงกับข้อมูลเสียงเทียบสองคอลัมน์ · ซูม ช่วงเวลา ช่องที่ซ่อน ใช้กับสองไฟล์พร้อมกัน
   อ่านภาพรวมทีละไฟล์ (ฝั่ง Rust คำขอใหม่หยุดคำขอเก่า อ่านพร้อมกันไม่ได้) · ซูมใช้ข้อมูลภาพรวม ละเอียดเท่าที่ภาพรวมมี */
const CA = "#2a78d6", CB = "#eb6834";
/** ชื่อสองไฟล์บนจอ · มาจากคิวแปลงเป็นต้นฉบับกับหลังแปลง · เลือกเทียบเองเป็นไฟล์ 1 ไฟล์ 2 ไม่มีฝั่งไหนเป็นต้นฉบับ · CONV บอกว่าใช้คำแนะนำเรื่องการแปลงได้ */
let LABELS = ["ต้นฉบับ", "หลังแปลง"], CONV = true;
const INK_A = "#1d5fae", INK_B = "#b4461a";
/** เทียบได้สูงสุดกี่ไฟล์ · พี่กันเคาะ 4 ไฟล์ 9 พ.ย. 2569 เกินนี้แถวกราฟเตี้ยจนดูยาก */
const MAX_FILES = 4;
/** สีประจำไฟล์ตามลำดับ น้ำเงิน ส้ม เขียวน้ำทะเล ม่วง */
const FILE_C = [CA, CB, "#1f9d7a", "#8a5cd6"];
const FILE_INK = [INK_A, INK_B, "#12705a", "#6a3fb5"];
const TH_A: Theme = { lane: "#f1f7fd", peak: "#a9cdf2", rms: INK_A, dark: "#0b2747", ramp: THEMES["ฟ้า"].ramp };
const TH_B: Theme = { lane: "#fdf4ef", peak: "#f6c2a8", rms: INK_B, dark: "#3d1406", ramp: THEMES["พีช"].ramp };
const TH_FILE: Theme[] = [TH_A, TH_B, { lane: "#eef9f5", peak: "#a6dfcd", rms: FILE_INK[2], dark: "#06382c", ramp: THEMES["ฟ้า"].ramp }, { lane: "#f5f0fd", peak: "#cfbdf2", rms: FILE_INK[3], dark: "#2a1450", ramp: THEMES["ม่วง"].ramp }];
type Side = { info: GInfo | null; ov: GOverview | null; err: string | null; pct: number | null };
const EMPTY: Side = { info: null, ov: null, err: null, pct: null };

function Who({ i }: { i: number }) {
  return <span className="who" style={{ color: FILE_INK[i] }}><i style={{ background: FILE_C[i] }} />{LABELS[i]}</span>;
}

/** ความถี่ของช่องหนึ่ง แกนตั้งเส้นตรง 0 ถึงครึ่งอัตราสุ่มที่สูงกว่า เท่ากันทั้งสองไฟล์ · เหนือครึ่งอัตราสุ่มของไฟล์นี้ ไม่มีเสียง (ดำ) */
function drawSpecCmp(g: CanvasRenderingContext2D, w: number, h: number, ch: number, ov: GOverview, t0: number, t1: number, nyq: number, maxNyq: number, colors: Uint8ClampedArray, z = 1, b = 0, hi?: GWindow) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const d = dec((hi ?? ov).spec[ch] ?? ""), B = hi ? hi.bins : ov.specBins, rows = Math.max(32, Math.min(hi ? 512 : 200, Math.round(h)));
  if (!d.length) return;
  const Cn = Math.round(d.length / B), T0 = hi ? hi.t0 : 0, Tn = hi ? hi.t1 : ov.duration;
  const c0 = Math.max(0, Math.floor((t0 - T0) / (Tn - T0 || 1) * Cn)), c1 = Math.max(c0 + 1, Math.ceil((t1 - T0) / (Tn - T0 || 1) * Cn));
  drawMatrix(g, 0, 0, w, h, Math.min(Cn, c1) - c0, rows, colors, (row, col) => {
    const f = (b + (row + 0.5) / rows / z) * maxNyq;
    return f > nyq ? 0 : d[(c0 + col) * B + Math.min(B - 1, Math.floor(f / nyq * B))] ?? 0;
  });
}

/** ภาพวิเคราะห์แบบ Spek ของไฟล์หนึ่ง · รวมทุกช่อง (ไม่นับเสียงเบส) เอาค่ามากสุด · แกนตั้งเท่ากันทั้งสองไฟล์ · เส้นประตรงขอบบนของเสียง */
function drawSpekCmp(g: CanvasRenderingContext2D, w: number, h: number, ov: GOverview, names: string[], nyq: number, maxNyq: number, t0: number, t1: number, title: string, sub: string, top: number | null, colors: Uint8ClampedArray, ramp: string[], z = 1, zb = 0, hi?: GWindow) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  const f0 = zb * maxNyq, fSpan = maxNyq / z;
  const L = 62, R = 86, T = 46, Bm = 28, pw = w - L - R, ph = h - T - Bm;
  const chans = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  const srcs = (chans.length ? chans : [0]).map((i) => dec((hi ?? ov).spec[i] ?? ""));
  const B = hi ? hi.bins : ov.specBins, Cn = hi ? Math.round(srcs[0].length / B) : ov.specCols, T0 = hi ? hi.t0 : 0, Tn = hi ? hi.t1 : ov.duration;
  const c0 = Math.max(0, Math.floor((t0 - T0) / (Tn - T0 || 1) * Cn)), c1 = Math.max(c0 + 1, Math.min(Cn, Math.ceil((t1 - T0) / (Tn - T0 || 1) * Cn)));
  const rows = Math.max(32, Math.round(ph / (hi ? 1 : 2)));
  drawMatrix(g, L, T, pw, ph, c1 - c0, rows, colors, (row, col) => {
    const f = f0 + (row + 0.5) / rows * fSpan; if (f > nyq) return 0;
    const b = Math.min(B - 1, Math.floor(f / nyq * B)); let m = 0;
    for (const d of srcs) m = Math.max(m, d[(c0 + col) * B + b] ?? 0);
    return m;
  });
  g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = 1; g.strokeRect(L - 0.5, T - 0.5, pw + 1, ph + 1);
  g.fillStyle = "#fff"; g.font = "600 11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  // กราฟเตี้ยเว้นป้ายสเกลให้ห่างกันอย่างน้อย 14 จุด ไม่ซ้อนกัน
  let kStep = fSpan > 30000 ? 8000 : fSpan > 15000 ? 4000 : fSpan > 6000 ? 2000 : fSpan > 3000 ? 1000 : 500;
  while (ph * kStep / fSpan < 14) kStep *= 2;
  for (let f = Math.ceil(f0 / kStep) * kStep; f <= f0 + fSpan + 1; f += kStep) { const y = T + ph * (1 - (f - f0) / fSpan); g.fillText(`${f / 1000} kHz`, L - 8, y); g.fillRect(L - 4, Math.round(y), 4, 1); }
  g.textAlign = "center"; g.textBaseline = "top";
  const st = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find((s) => (t1 - t0) / s <= 8) ?? 7200;
  for (let s = Math.ceil(t0 / st) * st; s <= t1; s += st) { const x = L + pw * (s - t0) / (t1 - t0 || 1); g.fillText(tfmt(s), x, T + ph + 8); g.fillRect(Math.round(x), T + ph, 1, 4); }
  const bx = L + pw + 22, grd = g.createLinearGradient(0, T, 0, T + ph);
  ramp.slice().reverse().forEach((c, i, a) => grd.addColorStop(i / (a.length - 1), c));
  g.fillStyle = grd; g.fillRect(bx, T, 12, ph);
  g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle";
  let dStep = 20;
  while (ph * dStep / 120 < 14) dStep += 20;
  for (let d = 0; d <= 120; d += dStep) { const y = T + ph * d / 120; g.fillText(`${d ? "−" + d : 0} dB`, bx + 18, y); g.fillRect(bx + 12, Math.round(y), 4, 1); }
  g.textBaseline = "alphabetic"; g.font = "700 13px Sarabun, sans-serif"; g.fillText(title, L, 18);
  g.font = "11.5px Sarabun, sans-serif"; g.fillStyle = "#d9d0d4"; g.fillText(sub, L, 35);
  if (top != null && top < maxNyq * 0.98 && top >= f0 && top <= f0 + fSpan) {
    const y = Math.round(T + ph * (1 - (top - f0) / fSpan)) + 0.5;
    g.strokeStyle = "rgba(255,255,255,.75)"; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); g.setLineDash([]);
    g.fillStyle = "#fff"; g.font = "600 12px Sarabun, sans-serif"; g.textAlign = "right"; g.fillText(`เสียงหยุดที่ราว ${(top / 1000).toFixed(1)} kHz`, L + pw - 8, y - 7);
  }
}

/** ขอบบนของเสียงทั้งไฟล์ (รวมทุกช่อง ไม่นับเสียงเบส) */
function edgeAll(ov: GOverview, names: string[], nyq: number) {
  const chans = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
  return edgeOf((chans.length ? chans : [0]).map((i) => dec(ov.spec[i] ?? "")), ov.specBins, 0, ov.specCols, nyq);
}

/** ความดังเฉลี่ยเป็น dB ตามเวลา ของช่องหนึ่ง n จุด (หน้าต่างเลื่อนแบบแท็บซ้อนเทียบ) */
function rmsDb(ov: GOverview, ch: number, t0: number, t1: number, n: number, hi?: GWindow) {
  const d = sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, ch, t0, t1, n), out = new Float32Array(n), win = Math.max(1, Math.round(n * 3 / (t1 - t0 || 1) / 2));
  for (let x = 0; x < n; x++) { let s = 0, k = 0; for (let j = Math.max(0, x - win); j <= Math.min(n - 1, x + win); j++) { s += d.rm[j] ** 2; k++; } out[x] = s <= 1e-12 ? -120 : 10 * Math.log10(s / k); }
  return out;
}
function loudPts(ov: GOverview, t0: number, t1: number, n: number) {
  const out = new Float32Array(n);
  for (let x = 0; x < n; x++) {
    const a = t0 + (t1 - t0) * x / n, b = t0 + (t1 - t0) * (x + 1) / n; let e = 0, k = 0;
    for (let c = Math.floor(a / ov.duration * ov.cols); c <= Math.floor(b / ov.duration * ov.cols) && c < ov.cols; c++) { if (c < 0) continue; e += Math.pow(10, ov.loud[c] / 10); k++; }
    out[x] = k ? 10 * Math.log10(e / k) : -70;
  }
  return out;
}
const f1 = (v: number | null | undefined) => (v == null ? "—" : minus(v.toFixed(1)));
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1);
const khz = (f: number) => (f / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });

function Stat({ kind, b, d }: { kind: "info" | "warn"; b: string; d: string }) {
  return <div className={"stat " + kind} title={b + " · " + d} data-cmpstat data-psdverdict><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">{kind === "warn" ? <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>}</svg><div><b>{b}</b><Phr>{d}</Phr></div></div>;
}

/** รูปทุกกราฟในหน้าต่างเทียบรวมเป็นรูปเดียว ไว้บันทึก */
function composeAll(box: HTMLElement | null, outW: number): HTMLCanvasElement | null {
  if (!box) return null;
  const cvs = [...box.querySelectorAll<HiCanvas>("canvas.cv")].filter((c) => c.clientWidth > 0);
  if (!cvs.length) return null;
  const bx = box.getBoundingClientRect(), rs = cvs.map((c) => c.getBoundingClientRect());
  // เอาเฉพาะส่วนกราฟ ไม่เอาหัวกราฟกับแถบซูม
  const top = Math.min(...rs.map((r) => r.top)), right = Math.max(...rs.map((r) => r.right));
  const ruler = box.querySelector(".ruler"), head = ruler ? 24 : 0;
  const W = Math.round(right - bx.left + 6), H = Math.round(Math.max(...rs.map((r) => r.bottom)) - top + 6 + head), k = outW ? outW / W : screenK();
  const out = document.createElement("canvas"); out.width = Math.round(W * k); out.height = Math.round(H * k);
  const g = out.getContext("2d"); if (!g) return null;
  g.scale(k, k); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  for (const lab of box.querySelectorAll<HTMLElement>("[data-lane]")) {
    const lr = lab.getBoundingClientRect(), mid = lr.top - top + head + lr.height / 2, sub = lab.querySelector(".lab span")?.textContent ?? "";
    g.fillStyle = "#4a2b38"; g.font = "700 12px Sarabun, sans-serif"; g.fillText(lab.dataset.lane ?? "", lr.left - bx.left + 4, sub ? mid - 8 : mid);
    if (sub) { g.fillStyle = "#6b4a58"; g.font = "11px Sarabun, sans-serif"; g.fillText(sub, lr.left - bx.left + 4, mid + 8); }
  }
  cvs.forEach((c, i) => g.drawImage(hiCopy(c, k), rs[i].left - bx.left, rs[i].top - top + head, rs[i].width, rs[i].height));
  if (ruler) drawRuler(g, ruler, rs[0].left - bx.left, rs[0].width, 12);
  return out;
}

export function CompareView({ files, note, free, onFiles, onSingle, onBack, onClose }: { files: string[]; note?: string; free?: boolean; onFiles: (files: string[], freed?: boolean) => void; onSingle: (p: string) => void; onBack: () => void; onClose: () => void }) {
  const n = files.length;
  LABELS = files.map((_, i) => (!free && i < 2 ? ["ต้นฉบับ", "หลังแปลง"][i] : `ไฟล์ ${i + 1}`));
  CONV = !free && n === 2;
  const allTxt = n === 2 ? "สองไฟล์" : `ทั้ง ${n} ไฟล์`;
  const toast = useToast();
  const [sides, setSides] = useState<Record<string, Side>>({});
  const [tab, setTab] = useState<View>("wave");
  const [zoom, setZoom] = useState<number | "all">("all");
  const [center, setCenter] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const [cmpCh, setCmpCh] = useState<string>("");
  const [psdCh, setPsdCh] = useState("mix");
  const [psdSpan, setPsdSpan] = useState<number | "all">("all");
  const [psd, setPsd] = useState<{ key: string; list: GPsd[] } | null>(null);
  const [psdF, setPsdF] = useState<number | null>(null);
  const [wide, setWide] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [paneH, setPaneH] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  });

  // อ่านทีละไฟล์ตามลำดับ (ฝั่ง Rust คำขอใหม่หยุดคำขอเก่า) · ไฟล์ที่อ่านแล้วไม่อ่านซ้ำตอนเพิ่มไฟล์
  const readDone = useRef(new Set<string>());
  const filesKey = files.join("\n");
  useEffect(() => {
    let live = true, off: (() => void) | undefined;
    const patch = (p: string, v: Partial<Side>) => setSides((s) => ({ ...s, [p]: { ...(s[p] ?? EMPTY), ...v } }));
    if (inApp) listen<GProgress>("graph-progress", (e) => {
      if (live && files.includes(e.payload.path)) patch(e.payload.path, { pct: e.payload.percent });
    }).then((u) => { if (live) off = u; else u(); });
    (async () => {
      for (const p of files) {
        if (!live) return;
        if (readDone.current.has(p)) continue;
        try {
          const info = await graphApi.info(p); if (!live) return;
          patch(p, { info, pct: 0 });
          const ov = await overviewOnce(p, 0); if (!live) return;
          patch(p, { ov, pct: null, err: ov ? null : "หยุดอ่านเสียงแล้ว" });
        } catch (e) { if (live) patch(p, { err: String(e), pct: null }); }
        if (live) readDone.current.add(p);
      }
    })();
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  const S = files.map((p) => sides[p] ?? EMPTY);
  const T = S.map((s) => s.info?.tracks[0]);
  const NM = T.map((t) => t?.names ?? []);
  const union = [...new Set(NM.flat())];
  const vis = union.filter((c) => !hidden.includes(c));
  const lens = S.map((s) => s.ov?.duration ?? s.info?.duration ?? 0);
  const dur = Math.max(0, ...lens);
  const span = zoom === "all" ? dur : Math.min(dur, zoom);
  const t0 = Math.max(0, Math.min(dur - span, center - span / 2)), t1 = t0 + span;
  // ระบบซูมครบทุกกราฟแบบหน้ากราฟหลัก (พี่กันสั่ง 9 พ.ย. 2569 "กราฟเทียบทุกตัว ต้องมีระบบซูม")
  const [resetN, setResetN] = useState(0);
  const [vz, setVz] = useState(1);
  const vrSpec = useVRange(resetN), vrLoud = useVRange(resetN), vrCmp = useVRange(resetN), vrSpek = useVRange(resetN), vrPsd = useVRange(resetN), hrPsd = useVRange(resetN);
  const vrNow = tab === "spec" ? vrSpec : tab === "loud" ? vrLoud : tab === "cmp" ? vrCmp : tab === "spek" ? vrSpek : tab === "psd" ? vrPsd : null;
  const panT = (c: number) => setCenter(Math.max(span / 2, Math.min(dur - span / 2, c)));
  const setSpan = (ns: number) => {
    if (!dur) return;
    if (ns >= dur * 0.999) { setZoom("all"); setCenter(dur / 2); return; }
    const k = Math.max(HZ_MIN, ns), mid = zoom === "all" ? dur / 2 : (t0 + t1) / 2;
    setZoom(k); setCenter(Math.max(k / 2, Math.min(dur - k / 2, mid)));
  };
  const zoomReset = () => { setZoom("all"); setCenter(dur / 2); setVz(1); setResetN((v) => v + 1); };
  // ซูมแยกแต่ละกราฟเหมือนหน้าหลัก · ติ๊กซูมเหมือนกันทุกกราฟในตัวเลือกกราฟแล้วใช้ช่วงเดียวกัน
  const { settings } = useSettings();
  const zoomOf = useRef<Partial<Record<View, { zoom: number | "all"; center: number }>>>({});
  const switchTab = (k: View) => {
    if (k === tab) return;
    if (!(settings?.graphZoomAll ?? false)) {
      zoomOf.current[tab] = { zoom, center };
      const was = zoomOf.current[k];
      setZoom(was?.zoom ?? "all"); setCenter(was?.center ?? dur / 2);
    }
    setTab(k);
  };
  const nyq = T.map((t) => (t?.rate ?? 48000) / 2), maxNyq = Math.max(...nyq);
  const common = NM[0].filter((c) => NM.every((x) => x.includes(c)));
  // ไฟล์ยาวไม่เท่ากัน เช่นตั้งความเร็วเสียงตอนแปลง เทียบตามเวลาตรง ๆ ไม่ได้ (ผู้ช่วยตรวจขั้น 10 ข้อ 24)
  const known = lens.filter((x) => x > 0);
  const lenDiff = known.length > 1 && Math.max(...known) - Math.min(...known) > Math.max(1, Math.max(...known) * 0.01);
  const cmpUse = common.includes(cmpCh) ? cmpCh : common[0] ?? "";
  const ready = S.every((s) => !!s.ov) && T.every((t) => !!t);
  // ทุกไฟล์เทียบกับไฟล์แรก · จำผลไว้ เพิ่มไฟล์แล้วไม่คิดคู่เดิมซ้ำ
  const diffMem = useRef(new Map<string, DiffResult>());
  const diffs = useMemo(() => {
    if (!ready) return null;
    return files.slice(1).map((p, k) => {
      const key = files[0] + "\n" + p;
      let r = diffMem.current.get(key);
      if (!r) { r = diffOf({ ov: S[0].ov!, names: NM[0], rate: T[0]!.rate }, { ov: S[k + 1].ov!, names: NM[k + 1], rate: T[k + 1]!.rate }); diffMem.current.set(key, r); }
      return r;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, ready]);
  const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  // เพิ่มไฟล์เทียบได้สูงสุด 4 ไฟล์ (พี่กันเคาะ 9 พ.ย. 2569 "ตามนั้น")
  const addFile = async () => {
    const f = await pickFile("media"); if (!f) return;
    if (files.some((p) => p.toLowerCase() === f.toLowerCase())) { toast({ kind: "warn", title: "ไฟล์นี้อยู่ในการเทียบแล้ว" }); return; }
    onFiles([...files, f]);
  };

  const isPsd = tab === "psd", isLanes = tab === "wave" || tab === "spec";
  const cmpGrab = useGrab({
    canX: isPsd ? hrPsd.z > 1 : span < dur - 0.01, canY: !!vrNow && vrNow.z > 1,
    span: isPsd ? 1 / hrPsd.z : span, center: isPsd ? hrPsd.b + 0.5 / hrPsd.z : (t0 + t1) / 2,
    z: vrNow?.z ?? 1, b: vrNow?.b ?? 0,
    left: isLanes ? 96 : tab === "spek" ? 62 : isPsd ? PSM.L : 44, right: isLanes ? 0 : tab === "spek" ? 86 : isPsd ? PSM.R : 4,
    top: tab === "spek" ? 46 : isPsd ? PSM.T : isLanes ? 0 : 12, bottom: tab === "spek" ? 28 : isPsd ? PSM.B : isLanes ? 0 : 12,
    onX: isPsd ? (c) => hrPsd.setB(hrPsd.clampB(c - 0.5 / hrPsd.z, hrPsd.z)) : panT,
    onY: (y) => { if (vrNow) vrNow.setB(vrNow.clampB(y, vrNow.z)); },
  });
  // Ctrl หมุนล้อ ซูมเข้าออกตามแกนนอน
  useEffect(() => {
    const el = plotRef.current; if (!el) return;
    const fn = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (isPsd) hrPsd.setZ(Math.max(1, Math.min(PSD_HZ_MAX, hrPsd.z * (e.deltaY < 0 ? 1.5 : 1 / 1.5))));
      else setSpan(span * (e.deltaY < 0 ? 0.5 : 2));
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  });
  const psdMem = useRef(new Map<string, GPsd>());
  // ความถี่เฉลี่ย ทีละไฟล์ (คำขอใหม่หยุดคำขอเก่าที่ฝั่ง Rust) · จำผลแยกไฟล์ เพิ่มไฟล์แล้วคิดเฉพาะไฟล์ใหม่
  const psdT = psdSpan === "all" ? [0, dur] : [Math.max(0, (t0 + t1) / 2 - psdSpan / 2), Math.min(dur, (t0 + t1) / 2 + psdSpan / 2)];
  const psdKey = `${filesKey}|${psdCh}|${psdT[0].toFixed(2)}|${psdT[1].toFixed(2)}`;
  useEffect(() => {
    if (tab !== "psd" || !ready) return;
    let live = true;
    const series = (names: string[]) => {
      if (psdCh !== "mix" && names.includes(psdCh)) return [[names.indexOf(psdCh)]];
      const base = names.map((_, i) => i).filter((i) => names[i] !== "LFE");
      return [base.length ? base : [0]];
    };
    (async () => {
      try {
        // ช่องความถี่กว้างเท่ากันทุกไฟล์ · เดิมใช้ 4096 ทุกไฟล์ ไฟล์ 96 kHz ช่องกว้าง 23.4 Hz ไฟล์ 48 kHz กว้าง 11.7 Hz
        // ค่าต่อช่องของเสียงรบกวนต่างกัน 3 dB ทั้งเส้น และยอดเสียงแหลมคมไม่เท่ากัน เส้นหลังแปลงต่ำกว่าต้นฉบับทั้งที่เสียงเดียวกัน (เจอตอนตรวจภาพ)
        const top = Math.max(...T.map((t) => t!.rate)), sz = (r: number) => Math.max(1024, 2 ** Math.round(Math.log2(4096 * r / top)));
        const list: GPsd[] = [];
        for (let i = 0; i < n; i++) {
          const end = Math.min(psdT[1], S[i].ov!.duration), size = sz(T[i]!.rate), mem = `${files[i]}|${psdCh}|${psdT[0].toFixed(2)}|${end.toFixed(2)}|${size}`;
          let p = psdMem.current.get(mem) ?? null;
          if (!p) { p = await graphApi.psd(files[i], 0, psdT[0], end, series(NM[i]), size, null); if (!live || !p) return; memPut(psdMem.current, mem, p, 24); }
          list.push(p);
        }
        if (live) setPsd({ key: psdKey, list });
      } catch (e) { if (live) toast({ kind: "bad", title: "คิดความถี่เฉลี่ยไม่ได้", detail: String(e) }); }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, ready, psdKey]);

  // อ่านเสียงช่วงที่ดูของทุกไฟล์ที่ความละเอียดของรูปก่อนวาด (แบบเดียวกับหน้าหลัก)
  const [saving, setSaving] = useState(false);
  const [hiC, setHiC] = useState<Record<string, GWindow>>({});
  const saveImage = async () => {
    if (saving) return;
    const o = settings?.graphImg ?? GRAPH_IMG_DEFAULT;
    const base = (p: string) => nameOf(p).replace(/\.[^.]+$/, ""), vName = VIEWS.find(([k]) => k === tab)?.[1] ?? "กราฟเสียง";
    const where = await imgTarget(files[0], imgName(base(files[0]) + " เทียบ " + base(files[1]) + (n > 2 ? " และอีก " + (n - 2) + " ไฟล์" : ""), vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (tab !== "loud" && tab !== "psd") {
        const got: Record<string, GWindow> = {}, cols = Math.min(8192, o.width || Math.round((plotRef.current?.clientWidth ?? 1000) * screenK()));
        for (let i = 0; i < n; i++) {
          const end = Math.min(t1, S[i].ov?.duration ?? t1);
          if (end <= t0) continue;
          const w = await graphApi.window(files[i], 0, t0, end, cols, 512, false, true);
          if (!w) throw new Error("การอ่านถูกยกเลิก");
          got[files[i]] = w;
        }
        flushSync(() => setHiC(got));
      }
      let cv = composeAll(plotRef.current, o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title) cv = withHeader(cv, vName + " · เทียบ " + n + " ไฟล์", files.map((p, i) => LABELS[i] + " " + nameOf(p)).join(" · "), files.map((_, i) => [LABELS[i], FILE_C[i]] as [string, string]));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: "บันทึกรูปแล้ว " + saved.width.toLocaleString("en-US") + " × " + saved.height.toLocaleString("en-US") + " · " + fmtSize(saved.size), detail: saved.path });
    } catch (e) { toast({ kind: "bad", title: "บันทึกรูปไม่ได้", detail: e instanceof Error ? e.message : String(e) }); }
    finally { setHiC({}); setSaving(false); }
  };
  // เปิดเล่นจากต้นช่วงที่ดู ทั้งไฟล์คือ 0:00 ซูมอยู่คือขอบซ้ายของกราฟ (พี่กันสั่ง 9 พ.ย. 2569 "แก้ไป ใครบ้าจะกดฟังกลางเพลง")
  const playFrom = t0;
  const play = async (p: string) => {
    try { const r = await checkApi.playAt(p, playFrom); toast({ kind: r.seeked ? "ok" : "warn", title: r.seeked ? `เปิดด้วย ${r.player} ที่ ${tfmt(playFrom)}` : "เปิดแล้ว แต่เปิดตรงนาทีไม่ได้", detail: r.seeked ? undefined : `เลื่อนไปที่ ${tfmt(playFrom)} เอง` }); }
    catch (e) { toast({ kind: "bad", title: "เปิดเล่นไม่ได้", detail: String(e) }); }
  };

  const chip = (i: number) => {
    const p = files[i], s = S[i], nm = nameOf(p), k = "abcd"[i];
    return (
      <div key={p} className="fchip cmpchip" role="button" tabIndex={0} title="ดูกราฟเดี่ยวของไฟล์นี้" onClick={() => onSingle(p)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSingle(p); } }} style={{ boxShadow: `inset 4px 0 0 ${FILE_C[i]}` }} data-cmpfile={k}>
        <div className="fnote" style={{ background: TH_FILE[i].lane, color: FILE_INK[i], border: `1px solid ${TH_FILE[i].peak}` }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="nm"><span className="nmtx">{nm.replace(/\.[^.]+$/, "")}</span>{/\.[^.]+$/.test(nm) && <span className="extcard" style={{ background: FILE_INK[i] }} data-cmpext={k}>{nm.match(/\.([^.]+)$/)?.[1].toUpperCase()}</span>}<Who i={i} /></div>
          <div className="meta">{s.info ? `${s.info.audioOnly ? "ไฟล์เสียง" : "ไฟล์หนัง"} · ${fmtSize(s.info.size)} · ยาว ${tfmt(s.info.duration)}${i === 1 && note ? " · แปลงเมื่อสักครู่" : ""}` : s.err ? "อ่านไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
        </div>
        {n > 2 && <button type="button" className="rmx" aria-label={`เอา ${nm} ออกจากการเทียบ`} title="เอาออกจากการเทียบ ไฟล์ในเครื่องไม่ถูกแตะ" onClick={(e) => { e.stopPropagation(); onFiles(files.filter((x) => x !== p), true); }} data-cmpremove={k}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>}
      </div>
    );
  };
  const head = (
    <div className="agtop">
      <button type="button" className="btn btn-ghost" onClick={onBack} data-cmpback><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>{free ? "กลับกราฟ" : "คิวแปลง"}</button>
      {files.map((_, i) => chip(i))}
      {n < MAX_FILES && <button type="button" className="btn btn-ghost" onClick={addFile} title={`เพิ่มไฟล์มาเทียบ ได้สูงสุด ${MAX_FILES} ไฟล์`} data-cmpadd><IcPlus />เพิ่มไฟล์</button>}
      {!free && <button type="button" className="btn btn-ghost" onClick={onClose} title="เปิดต้นฉบับในหน้ากราฟเสียงแบบไฟล์เดียว" data-cmpclose><IcClose size={15} />ปิดการเทียบ</button>}
    </div>
  );
  const fileLg = <>{files.map((p, i) => <span key={p}><span className="ln" style={{ background: FILE_C[i] }} />{LABELS[i]}</span>)}</>;
  const ctl = (
    <div className="agctl">
      <div className="seg agviews">{VIEWS.map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => switchTab(k)} data-cmptab={k} disabled={k === "cmp" && !common.length}
        title={k === "cmp" && !common.length ? `${allTxt}ไม่มีช่องเสียงที่ตรงกัน` : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      <div className="lg" style={{ marginLeft: "auto" }}>{fileLg}</div>
      <button type="button" className={"btn btn-ghost btn-sm" + (wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={wide} title={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} aria-label={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} onClick={() => setWide(!wide)} data-graphwide><IcExpand size={14} /></button>
    </div>
  );
  const infoRow = (t: GTrack | undefined, info: GInfo | null) => t && info ? [t.codec, `${t.layout}`, `${khz(t.rate)} kHz`, t.bits ? `${t.bits}-bit` : "—", t.bitrate ? `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : "—", fmtSize(info.size), tfmt(info.duration)] : null;
  const infos = S.map((s, i) => infoRow(T[i], s.info));
  const diffRows: [string, string, (d: DiffResult) => number, string[]][] = [["wave", "รูปคลื่น", (d) => d.wave, ["wave"]], ["spec", "ความถี่", (d) => d.spec, ["spec", "spek"]], ["loud", "ความดัง", (d) => d.loud, ["loud"]], ["cmp", "ซ้อนเทียบ", (d) => d.cmp, ["cmp"]], ["psd", "ความถี่เฉลี่ย", (d) => d.psd, ["psd"]]];
  const others0 = files.map((_, i) => i).slice(1);
  const sizeTxt = (i: number, long: boolean) => {
    const a = S[0].info?.size ?? 0, b = S[i].info?.size ?? 0;
    if (!a || !b) return "—";
    if (a === b) return "เท่ากัน";
    const pct = Math.abs(b - a) / a * 100, p = pct < 0.1 ? "ไม่ถึง 0.1%" : pct.toFixed(1) + "%";
    return long ? `${b < a ? "เล็กกว่า" : "ใหญ่กว่า"} ${p} · ${fmtSize(Math.abs(b - a))}` : (b < a ? "−" : "+") + p;
  };
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {T[0]?.layout ?? ""}</span><span className="small" style={{ color: "var(--txt3)" }}>{union.length} ช่อง</span></h3>
        {NM[0].length > 0 && <Speakers names={union} th={TH_A} levels={union.map(() => 0.3)} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{union.length > 1 ? `กดลำโพงเพื่อปิดหรือเปิดช่องนั้น ${allTxt}พร้อมกัน` : "ไฟล์นี้มีเสียงช่องเดียว"}</div>
        {T.every(Boolean) && NM.some((x) => x.join() !== NM[0].join()) && <div className="small" style={{ marginTop: 4 }}>ช่องเสียงไม่เท่ากัน · {T.map((t, i) => `${LABELS[i]} ${t!.layout}`).join(" ")}</div>}</div>
      {diffs && <div className="card gdiff" data-cmpdiff>
        {n === 2
          ? <><h3><span>ต่างกันกี่ %</span><b data-cmpdiffall title="ค่าเฉลี่ยของทุกกราฟ">{diffs[0].overall.toFixed(1)}%</b></h3>
            {diffRows.map(([k, l, get, on]) => { const v = get(diffs[0]); return <div key={k} className={"row" + (on.includes(tab) ? " on" : "")} data-cmpdiffrow={k}><span>{l}</span><i><u style={{ width: Math.max(0, Math.min(100, v)) + "%" }} /></i><em>{v.toFixed(1)}%</em></div>; })}
            <div className="sizerow" data-cmpdiffsize title={`ขนาด${LABELS[1]}เทียบกับ${LABELS[0]} ไม่นับรวมในเปอร์เซ็นต์ด้านบน`}><span>ขนาดไฟล์</span><em>{sizeTxt(1, true)}</em></div></>
          : <><h3><span>ต่างจาก{LABELS[0]}กี่ %</span></h3>
            <div className="gdiffgrid" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${n - 1}, auto)` }}>
              <span />{diffs.map((_, k) => <span key={k} className="h" style={{ color: FILE_INK[k + 1] }}>{LABELS[k + 1]}</span>)}
              <span className="all">รวม</span>{diffs.map((d, k) => <b key={k} data-cmpdiffall={k}>{d.overall.toFixed(1)}%</b>)}
              {diffRows.map(([k, l, get, on]) => { const cls = on.includes(tab) ? "on" : ""; return <Fragment3 key={k} cls={cls} k={k} l={l} vals={diffs.map((d) => get(d).toFixed(1) + "%")} />; })}
              <Fragment3 cls="" k="size" l="ขนาดไฟล์" vals={others0.map((i) => sizeTxt(i, false))} />
            </div></>}
        <div className="gdiffnote" title={`ผลต่าง 60 dB คิดเป็น 100% · 0% ไม่ได้แปลว่าเหมือนทุกบิต เพราะคิดจากข้อมูลภาพรวม${diffs.some((d) => d.lenDiff) ? " · ไฟล์ยาวไม่เท่ากัน เทียบเท่าช่วงที่มีทั้งคู่" : ""}`}>60 dB = 100% · 0% ไม่ใช่เหมือนทุกบิต</div></div>}
      <div className="card"><h3>ข้อมูลเสียง</h3>
        <div className="ginfo" style={{ gridTemplateColumns: `auto repeat(${n}, auto)` }} data-cmpinfo><span />{files.map((p, i) => <span key={p} className="h" style={{ color: FILE_INK[i] }}>{LABELS[i]}</span>)}
          {["รหัสเสียง", "ช่องเสียง", "อัตราสุ่ม", "ความละเอียด", "บิตเรต", "ขนาด", "ความยาว"].map((k, r) => <FragmentInfo key={k} k={k} vals={infos.map((x) => x?.[r] ?? "…")} />)}</div>
        {note && <div className="small" style={{ marginTop: 8 }}><Phr>{note}</Phr></div>}</div>
      {lenDiff && <div className="stat warn" data-cmplen><CardIcon kind="warn" /><div><b>{`${allTxt}ยาวไม่เท่ากัน ${lens.map(tfmt).join(" · ")}`}</b><Phr>{CONV ? "น่าจะตั้งความเร็วเสียงตอนแปลง · รูปคลื่น ความดัง ซ้อนเทียบ เทียบตามเวลาตรง ๆ ไม่ได้ ดูความถี่เฉลี่ยกับวิเคราะห์แทน" : "กราฟเรียงจากต้นไฟล์ตามเวลา · ไฟล์ที่สั้นกว่าจบก่อน"}</Phr></div></div>}
    </div>
  );

  let body: React.ReactNode;
  const errAt = S.findIndex((s) => s.err);
  if (errAt >= 0) {
    body = <div className="plot"><div className="stat bad"><CardIcon kind="bad" /><div><b>อ่าน{LABELS[errAt]}ไม่ได้</b><Phr>{S[errAt].err ?? ""}</Phr></div></div></div>;
  } else if (!ready) {
    const at = Math.max(0, S.findIndex((s) => !s.ov)), pct = S[at].pct ?? 0;
    body = (
      <div className="plot" data-cmploading>
        <div style={{ fontSize: 13.5, marginBottom: 8 }}>อ่านเสียง{LABELS[at]} <b>{Math.round(pct)}%</b> · อ่านทีละไฟล์ตามลำดับ</div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>{[0, 1, 2, 3].map((i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr", gap: 10, alignItems: "center" }}><div className="skel" style={{ height: 12 }} /><div className="skel" style={{ height: 40 }} /></div>)}</div>
      </div>
    );
  } else {
    const OV = S.map((s) => s.ov!);
    const others = files.map((_, i) => i).slice(1);
    const zoomBar = (
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="zbtns">
          <button type="button" className="zb" onClick={() => setSpan(span * 2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก · Ctrl หมุนล้อเมาส์ลง" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
          <HZoom dur={dur} span={span} onSpan={setSpan} />
          <button type="button" className="zb" onClick={() => setSpan(span / 2)} disabled={span <= HZ_MIN} aria-label="ซูมเข้า" title="ซูมเข้า · Ctrl หมุนล้อเมาส์ขึ้น" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
          <button type="button" className="zb" onClick={zoomReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button>
        </span>
        <span className="lbl">ซูม</span>
        <div className="seg sm">{ZOOMS.map(([k, l]) => <button key={String(k)} type="button" className={String(zoom) === String(k) ? "on" : ""} onClick={() => { setZoom(k); if (k !== "all" && zoom === "all") setCenter(Math.min(dur / 2, 60)); }} data-cmpzoom={String(k)}>{l}</button>)}</div></span>
    );
    const foot = (lg: React.ReactNode) => (
      <div className="agfoot"><div className="lg">{lg}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{files.map((p, i) => <button key={p} type="button" className="btn btn-ghost btn-sm" onClick={() => play(p)}><IbPlay size={15} /><span>เปิด{LABELS[i]} {p.match(/\.([^.\\/]+)$/)?.[1].toUpperCase() ?? ""} ที่ <FixedTime t={tfmt(playFrom)} longest={tfmt(dur)} /></span></button>)}<SaveBtn onClick={saveImage} /></div></div>
    );
    const Ruler = () => (
      <div className="ruler" style={{ marginLeft: 96, marginRight: 30 }}>{(() => { const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600]; const st = steps.find((s) => (t1 - t0) / s <= 9) ?? 7200; const out: number[] = []; for (let x = Math.ceil(t0 / st) * st; x <= t1; x += st) out.push(x); return out; })().map((x) => { const p = (x - t0) / (t1 - t0 || 1) * 100; return p < 2 || p > 98 ? null : <span key={x} style={{ left: p + "%" }}>{tfmt(x)}</span>; })}</div>
    );
    const edges = OV.map((ov, i) => edgeAll(ov, NM[i], nyq[i]));
    const ea = edges[0], eb = edges[1];
    const cutNote = n === 2
      ? (eb.top < ea.top - 1500 && !eb.full
        ? { kind: "info" as const, b: `${LABELS[1]}ไม่มีเสียงเหนือ ${khz(eb.top)} kHz`, d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz${ea.top > 20000 ? " ซึ่งหูคนไม่ได้ยิน (หูได้ยินถึงราว 20 kHz)" : ""} · ช่วงต่ำกว่านั้นภาพแทบเหมือนกัน` }
        : { kind: "info" as const, b: "ช่วงความถี่ของสองไฟล์ใกล้เคียงกัน", d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz · ${LABELS[1]}ราว ${khz(eb.top)} kHz` })
      : { kind: "info" as const, b: `ช่วงความถี่${allTxt}`, d: edges.map((e, i) => `${LABELS[i]} ราว ${khz(e.top)} kHz`).join(" · ") };
    const nLanes = union.reduce((sum, c) => sum + NM.filter((x) => x.includes(c)).length, 0);
    // 205 คือหัวกราฟ แถวเวลา แถบเลื่อน ผลสรุป แถวปุ่มท้าย ระยะขอบรวมกัน (วัดจากหน้าจริง)
    const laneH = Math.max(union.length > 4 ? 40 : 46, Math.floor((paneH - 205 - (nLanes - 1) * 6) / Math.max(1, nLanes)));
    const colors = lut(THEMES["ชมพู"].ramp);
    if (tab === "wave" || tab === "spec") {
      const lanes = union.flatMap((c) => files.flatMap((_, f) => {
        const names = NM[f], ov = OV[f], i = names.indexOf(c);
        if (i < 0) return [];
        const l = label(names, c), pk = ov.peaks[i], k = "abcd"[f];
        const peak = pk == null ? "" : pk <= -119 ? "เงียบทั้งไฟล์" : "ยอด " + pkTxt(pk);
        if (hidden.includes(c)) return [<LaneOff key={c + k + "off"} code={l.code} th={`${l.th} · ${LABELS[f]}`} peak={peak} height={laneH} />];
        return [tab === "wave"
          ? <Lane key={c + k + tab} code={l.code} th={`${l.th} · ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, vz, f, hiC[files[f]]]}
              draw={(g, w, h) => { const hi = hiC[files[f]]; drawWave(g, w, h, sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, i, t0, t1, w), TH_FILE[f], "fine", vz); }} />
          : <Lane key={c + k + tab} code={l.code} th={`${l.th} · ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, maxNyq, vrSpec.z, vrSpec.b, hiC[files[f]]]}
              draw={(g, w, h) => drawSpecCmp(g, w, h, i, ov, t0, t1, nyq[f], maxNyq, colors, vrSpec.z, vrSpec.b, hiC[files[f]])} />];
      }));
      const pks = OV.map((ov) => Math.max(...ov.peaks));
      const over = others.find((i) => pks[i] > -0.05 && pks[i] > pks[0] + 0.05);
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview={tab}>
          <div className="plotstick"><div className="plothead"><span><b>{tab === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBar}</div>
          <Ruler />
          </div>
          <div className="lanewrap" style={{ position: "relative" }} onWheel={tab === "spec" ? vrSpec.wheel : undefined}>
            <div className={"lanes cmplanes " + cmpGrab.cls} {...cmpGrab.props} data-lanes>{lanes}</div>
            {tab === "spec" && <VBar dark v={vrSpec} right={34} top={0} bottom={0} />}
            {tab === "wave" ? <VZoom value={vz} onChange={setVz} /> : <FZoom value={vrSpec.z} onChange={vrSpec.setZ} />}
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={96} right={30} onPan={panT} />
          {tab === "wave"
            ? (over != null
              ? <Stat kind="warn" b={`ยอดเสียง${LABELS[over]}ขึ้นเป็น ${pkTxt(pks[over])}`} d={`${LABELS[0]} ${pkTxt(pks[0])}${CONV ? " · การแปลงแบบเสียคุณภาพทำให้ยอดคลื่นขยับเล็กน้อย" : ""} · ดูแท็บความดังว่าเกิน 0 ช่วงไหน`} />
              : <Stat kind="info" b={`รูปคลื่นของ${allTxt}`} d={`ยอดเสียงสูงสุด ${pks.map((p, i) => `${LABELS[i]} ${pkTxt(p)}`).join(" · ")}`} />)
            : <Stat {...cutNote} />}
        {foot(tab === "wave" ? <><span>{TH_FILE.slice(0, n).map((x, i) => <i key={i} style={{ background: x.peak }} />)}ยอดเสียง</span><span>{FILE_INK.slice(0, n).map((x, i) => <i key={i} style={{ background: x }} />)}ความดังเฉลี่ย</span></>
            : <><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${THEMES["ชมพู"].ramp.join(",")})` }} /><span className="nw">0 dB</span></>)}
          </div>
      );
    } else if (tab === "loud") {
      const hot = others.find((i) => (OV[i].truePeak ?? -99) >= 0);
      const rows: { k: string; v: string[]; note: string; bad: boolean[] }[] = [
        { k: "ความดังรวม", v: OV.map((o) => `${f1(o.integrated)} LUFS`), note: "ทั้งไฟล์ ตามมาตรฐาน EBU R128", bad: [] },
        { k: "ยอดเสียงสูงสุด", v: OV.map((o, i) => `${i && (o.truePeak ?? -99) > 0 ? "+" : ""}${f1(o.truePeak)} dBTP`), note: hot != null ? LABELS[hot] + "ถึงหรือเกิน 0" : `ไม่ถึง 0 ${allTxt}`, bad: OV.map((o, i) => i > 0 && (o.truePeak ?? -99) >= 0) },
        { k: "ช่วงความดัง", v: OV.map((o) => `${f1(o.lra)} LU`), note: "ห่างระหว่างช่วงเบากับช่วงดัง", bad: [] },
        { k: "ช่วงเงียบผิดปกติ", v: OV.map((o) => (o.silences.length ? `${o.silences.length} ช่วง` : "ไม่พบ")), note: "เงียบทุกช่องเกิน 1 วินาที", bad: OV.map((o, i) => i > 0 && o.silences.length > OV[0].silences.length) },
      ];
      const luDiffs = others.map((i) => Math.abs((OV[i].integrated ?? 0) - (OV[0].integrated ?? 0)));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="loud">
          <div className="plotstick"><div className="tiles" data-cmptiles>{rows.map((r) => (
            <div className="tile cmptile" key={r.k}><span>{r.k}</span>{r.v.map((x, i) => <div className="tv" key={i}><Who i={i} /><b style={r.bad[i] ? { color: "var(--bad-ink)" } : undefined}>{x}</b></div>)}<em>{r.note}</em></div>))}</div>
          <div className="plothead"><span><b>ความดังตลอดไฟล์</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBar}</div></div>
          <div style={{ flex: "1 0 110px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrLoud.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="loud" vr={vrLoud} grab={cmpGrab} fill height={110} deps={[filesKey, t0, t1]} lo={-60} hi={0} step={10} unit="LUFS" ref23
                series={(w) => OV.map((o, i) => [loudPts(o, t0, t1, w), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrLoud} right={8} />
            </div>
            <FZoom value={vrLoud.z} onChange={vrLoud.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          {hot != null
            ? <Stat kind="warn" b={`ยอดเสียง${LABELS[hot]} ${(OV[hot].truePeak ?? 0) > 0 ? "+" : ""}${f1(OV[hot].truePeak)} dBTP ถึงหรือเกิน 0`} d={CONV ? "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด · ตั้ง Gain −1 dB ในแผงตั้งค่าเสียงแล้วแปลงใหม่" : "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด"} />
            : <Stat kind="info" b={n === 2 ? `ความดังรวมต่างกัน ${luDiffs[0].toFixed(1)} LU` : `ความดังรวมต่างจาก${LABELS[0]}มากสุด ${Math.max(...luDiffs).toFixed(1)} LU`} d={`เส้นแทบทับกันแปลว่าความดังไม่เปลี่ยน · ต่างกันไม่ถึง 1 LU หูแยกไม่ออก`} />}
        {foot(<span><span className="ln" style={{ background: "#8a6474" }} />เส้นอ้างอิง −23 LUFS</span>)}
          </div>
      );
    } else if (tab === "cmp") {
      const idx = NM.map((x) => x.indexOf(cmpUse)), l = label(NM[0], cmpUse);
      const W = 600, base = rmsDb(OV[0], idx[0], t0, t1, W);
      // ไฟล์ที่ต่างจากไฟล์แรกมากที่สุดเป็นตัวสรุป
      const stats = others.map((f) => {
        const d2 = rmsDb(OV[f], idx[f], t0, t1, W);
        let sum = 0, cnt = 0, mx = 0, mxAt = t0;
        for (let x = 0; x < W; x++) { if (base[x] < -60 || d2[x] < -60) continue; const d = d2[x] - base[x]; sum += Math.abs(d); cnt++; if (Math.abs(d) > Math.abs(mx)) { mx = d; mxAt = t0 + (t1 - t0) * x / W; } }
        return { f, avg: cnt ? sum / cnt : 0, mx, mxAt };
      });
      const top = stats.reduce((a, b) => (Math.abs(b.mx) > Math.abs(a.mx) ? b : a));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="cmp">
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ซ้อนเทียบ</b>
            <div className="seg sm">{common.map((c) => <button key={c} type="button" className={cmpUse === c ? "on" : ""} onClick={() => setCmpCh(c)} data-cmpch={c}>{label(NM[0], c).code} {label(NM[0], c).th.split(" ")[0]}</button>)}</div></span>{zoomBar}</div>
          <div style={{ flex: "1 0 120px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrCmp.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="cmp" vr={vrCmp} grab={cmpGrab} fill height={120} deps={[filesKey, t0, t1, cmpUse, hiC]} lo={-48} hi={0} step={12} unit="dB" series={(w) => OV.map((o, i) => [rmsDb(o, idx[i], t0, t1, w, hiC[files[i]]), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrCmp} right={8} />
            </div>
            <FZoom value={vrCmp.z} onChange={vrCmp.setZ} />
          </div>
          <div className="small" style={{ margin: "6px 0 2px" }}><b style={{ color: "var(--txt)" }}>{n === 2 ? `ผลต่าง ${LABELS[1]} ลบ ${LABELS[0]}` : `ผลต่าง แต่ละไฟล์ ลบ ${LABELS[0]}`}</b> · กราฟแยก แกน ±2 dB</div>
          <div style={{ marginRight: 30 }}><CmpChart grab={cmpGrab} height={80} deps={[filesKey, t0, t1, cmpUse]} lo={-2} hi={2} step={1} unit="dB" diff series={(w) => { const x = rmsDb(OV[0], idx[0], t0, t1, w); return others.map((f) => { const y = rmsDb(OV[f], idx[f], t0, t1, w), d = new Float32Array(w); for (let i = 0; i < w; i++) d[i] = x[i] < -60 || y[i] < -60 ? 0 : y[i] - x[i]; return [d, n === 2 ? "#7a4fb0" : FILE_C[f]] as [Float32Array, string]; }); }} /></div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          <Stat kind={Math.abs(top.mx) >= 1 ? "warn" : "info"} b={`ช่อง ${l.code}${n > 2 ? ` ${LABELS[top.f]}` : ""} ต่างกันเฉลี่ย ${top.avg.toFixed(1)} dB มากสุด ${sgn(top.mx)} dB ที่ ${tfmt(top.mxAt)}`}
            d={Math.abs(top.mx) >= 1 ? "ต่างเกินราว 1 dB ที่หูเริ่มแยกได้ ลองเปิดฟังช่วงนั้นเทียบกัน" : "ต่ำกว่าที่หูแยกได้ (ราว 1 dB) · ไม่นับช่วงที่เบากว่า −60 dB"} />
        {foot(n === 2 ? <span><span className="ln" style={{ background: "#7a4fb0" }} />ผลต่าง</span> : null)}
          </div>
      );
    } else if (tab === "spek") {
      const heat = lut(HEAT);
      const sub = (i: number) => { const t = T[i]!; return `${t.codec} · ${t.rate.toLocaleString("en-US")} Hz${t.bits ? ` · ${t.bits}-bit` : ""}${t.bitrate ? ` · ${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : ""} · ${NM[i].length} channels mixed${nyq[i] !== maxNyq ? " · แกนตั้งเท่ากันทุกไฟล์" : ""}`; };
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="spek">
          <div className="plothead"><span><b>วิเคราะห์ความถี่</b> · {tfmt(t0)} ถึง {tfmt(t1)}</span>{zoomBar}</div>
          <div style={{ flex: `1 0 ${n * 122}px`, display: "flex", gap: 8, minHeight: 0 }} onWheel={vrSpek.wheel}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              {files.map((p, i) => <SpekCv key={p} grab={cmpGrab} deps={[OV[i], t0, t1, maxNyq, vrSpek.z, vrSpek.b, hiC[p]]} draw={(g, w, h) => drawSpekCmp(g, w, h, OV[i], NM[i], nyq[i], maxNyq, t0, t1, nameOf(p), sub(i), edges[i].full ? null : edges[i].top, heat, HEAT, vrSpek.z, vrSpek.b, hiC[p])} data={"abcd"[i]} />)}
            </div>
            <FZoom value={vrSpek.z} onChange={vrSpek.setZ} />
          </div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={62} right={116} onPan={panT} />
          <Stat {...cutNote} />
          {foot(null)}
        </div>
      );
    } else {
      const ok = psd && psd.key === psdKey;
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="psd">
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ความถี่เฉลี่ย</b>
            <div className="seg sm">{[["mix", "รวมทุกช่อง"], ...common.filter((c) => c !== "LFE").slice(0, 6).map((c) => [c, label(NM[0], c).code])].map(([k, l2]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-cmppsdch={k}>{l2}</button>)}</div></span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="lbl">ช่วงที่เลือก</span>
              <div className="seg sm">{PSD_SPANS.map(([k, l2]) => <button key={String(k)} type="button" className={String(psdSpan) === String(k) ? "on" : ""} onClick={() => setPsdSpan(k)} data-cmppsdspan={String(k)}>{l2}</button>)}</div></span></div>
          {ok ? <PsdCmp list={psd.list} maxNyq={maxNyq} f={psdF} setF={setPsdF} vr={vrPsd} hr={hrPsd} grab={cmpGrab} onReset={() => { setPsdSpan("all"); zoomReset(); }} /> : <div className="skel" style={{ height: 300, borderRadius: 8 }} data-cmppsdwait />}
          <div className="small" style={{ marginTop: 4 }}>{psdSpan === "all" ? `ทั้งไฟล์ ${tfmt(dur)}` : `${tfmt(psdT[0])} ถึง ${tfmt(psdT[1])} รอบกลางช่วงที่ดู`} · คิดทีละไฟล์ตามลำดับ{ok ? ` · ช่องความถี่กว้าง ${(psd.list[0].rate / psd.list[0].size).toFixed(1)} Hz ${allTxt} เทียบกันได้ตรง` : ""}</div>
          {foot(null)}
        </div>
      );
    }
  }

  return (
    <SavingCtx.Provider value={saving}><div className="ag" data-graph data-compare data-graphview={tab}>
      <div className="agstick">{head}{ctl}</div>
      <div className={"agb" + (wide ? " wide" : n > 2 ? " many" : "")}>{wide ? null : panel}{body}</div>
    </div></SavingCtx.Provider>
  );
}

function FragmentInfo({ k, vals }: { k: string; vals: string[] }) {
  return <><span className="k">{k}</span>{vals.map((v, i) => <span key={i} className="v" style={i > 0 && v !== vals[0] && vals[0] !== "…" ? { fontWeight: 700 } : undefined}>{v}</span>)}</>;
}
function Fragment3({ cls, k, l, vals }: { cls: string; k: string; l: string; vals: string[] }) {
  return <><span className={cls} data-cmpdiffrow={k}>{l}</span>{vals.map((v, i) => <em key={i} className={cls}>{v}</em>)}</>;
}

function SpekCv({ grab, deps, draw, data }: { grab?: Grab; deps: unknown[]; draw: Draw; data: string }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return <div className={grab?.cls} {...grab?.props} style={{ position: "relative", flex: "1 0 118px", marginTop: 8 }}><canvas className="cv fillcv" style={{ borderRadius: 6 }} ref={ref} data-cmpspek={data} /></div>;
}

/** กราฟเส้นของสองไฟล์บนแกนเดียว · series(n) คืนเส้นละชุด n จุด · ref23 เส้นอ้างอิง −23 LUFS · diff เส้นศูนย์เข้ม */
function CmpChart({ vr, grab, height, deps, lo: loAll, hi: hiAll, step: stepAll, unit, series, ref23, diff, fill }: { vr?: VRange; grab?: Grab; fill?: boolean; height: number; deps: unknown[]; lo: number; hi: number; step: number; unit: string; series: (n: number) => [Float32Array, string][]; ref23?: boolean; diff?: boolean }) {
  const X0 = 44;
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const zoomed = !!vr && vr.z > 1, win = zoomed ? vWindow(loAll, hiAll, vr) : { lo: loAll, hi: hiAll, step: stepAll };
    const { lo, hi, step } = win;
    const pad = diff ? 8 : 12, N = Math.max(10, w - X0 - 4), Y = (v: number) => pad + (hi - (zoomed ? v : Math.max(lo, Math.min(hi, v)))) / (hi - lo) * (h - pad * 2);
    axisY(g, X0, w, h, pad, lo, hi, step, unit);
    g.save(); g.beginPath(); g.rect(X0, pad, N, h - pad * 2); g.clip();
    if (diff) { g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(0)), N, 1); }
    for (const [pts, col] of series(N)) {
      g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      pts.forEach((v, x) => (x ? g.lineTo(X0 + x, Y(v)) : g.moveTo(X0, Y(v)))); g.stroke();
    }
    if (ref23) {
      g.fillStyle = "#8a6474"; g.fillRect(X0, Math.round(Y(-23)), N, 1);
      g.font = "600 11.5px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillStyle = "#6b4a58"; g.fillText("อ้างอิง −23 LUFS", X0 + N - 4, Y(-23) - 3);
    }
    g.restore();
  }, [...deps, vr?.z, vr?.b]);
  return fill ? <div className={grab?.cls} {...grab?.props} style={{ position: "relative", flex: `1 0 ${height}px` }}><canvas className="cv fillcv" ref={ref} data-cmpchart /></div> : <div className={grab?.cls} {...grab?.props}><canvas className="cv" style={{ height }} ref={ref} data-cmpchart /></div>;
}

/** ความถี่เฉลี่ยของสองไฟล์ · แกนนอนแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่มที่สูงกว่า · ชี้แล้วบอกค่าของทั้งสองไฟล์กับผลต่าง */
function PsdCmp({ list, maxNyq, f, setF, vr, hr, grab, onReset }: { list: GPsd[]; maxNyq: number; f: number | null; setF: (f: number | null) => void; vr: VRange; hr: VRange; grab: Grab; onReset: () => void }) {
  const L = 52, R = 18, T = 14, Bm = 30;
  const at = (p: GPsd, fr: number) => { const d = p.db[0], x = fr * p.size / p.rate, i = Math.floor(x); if (i < 0 || i + 1 >= d.length) return -140; return d[i] + (d[i + 1] - d[i]) * (x - i); };
  const fmax = Math.max(20.5, maxNyq);
  const topAll = Math.ceil(Math.max(...list.flatMap((p) => p.db[0].slice(2))) / 6) * 6;
  const { lo: bot, hi: top } = vWindow(topAll - 96, topAll, vr);
  const rise = useRise(list);
  const hrSpan = PSD_HZ_MAX * HZ_MIN, setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
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
        <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก · Ctrl หมุนล้อเมาส์ลง"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
        <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า · Ctrl หมุนล้อเมาส์ขึ้น"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        <button type="button" className="zb" onClick={onReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button>
      </span>
      <span className="lbl">ตำแหน่งชี้</span><span className="psdbox" style={{ whiteSpace: "normal" }}>{f == null ? "ชี้บนกราฟเพื่อดูค่า" : `${fTxt(f)} (${noteOf(f)}) = ${list.map((p, i) => `${LABELS[i]} ${minus(at(p, f).toFixed(0))} dB`).join(" · ")}${list.length === 2 ? ` · ต่าง ${Math.abs(at(list[1], f) - at(a, f)).toFixed(1)} dB` : ""}`}</span>
      <span className="lbl">ต่างมากสุดช่วงที่ได้ยิน</span><span className="psdbox">{fTxt(mxF)} · {LABELS[mxI]}{mx < 0 ? "บางลง" : "หนาขึ้น"} {Math.abs(mx).toFixed(1)} dB</span>
    </div>
    <Stat kind={low > 3 ? "warn" : "info"} b={`ช่วงที่ได้ยิน 20 Hz ถึง 15 kHz ${list.length === 2 ? "สองเส้น" : `ทุกเส้นจาก${LABELS[0]}`}ต่างกันไม่เกิน ${low.toFixed(1)} dB`} d={`ต่างมากสุดในช่วง 20 Hz ถึง 20 kHz ที่ ${fTxt(mxF)} ${LABELS[mxI]}${mx < 0 ? "บางลง" : "หนาขึ้น"} ${Math.abs(mx).toFixed(1)} dB`} />
  </>);
}
