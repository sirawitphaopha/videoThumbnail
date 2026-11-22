/* หน้ากราฟเสียง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
   6 แบบ รูปคลื่น (เส้นละเอียด หรือ แท่ง) · ความถี่ (สีตามชุด หรือ สีรุ้ง) · ความดัง · ซ้อนเทียบ · วิเคราะห์ (แบบ Spek) · ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity)
   ข้อมูลจริงจาก audiograph.rs · ภาพรวมทั้งไฟล์อ่านครั้งเดียว ช่วงที่ซูมอ่านเฉพาะช่วง ระหว่างรอใช้ภาพรวมวาดไปก่อน ไม่มีจอว่าง */
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { AUDIO_EXT, GRAPH_IMG_DEFAULT, checkApi, convertApi, graphApi, inApp, pickFile, pickSave, thumbUrl, type GInfo, type GOverview, type GProgress, type GPsd, type GTrack, type GWindow, type Movie, type AudioFile, type CoverData } from "../../lib/api";
import ConvertPane from "../../components/ConvertPane";
import "../../styles/av.css";
import TagDialog, { tagRows, whyNone } from "../../components/TagDialog";
import { addFiles } from "../../lib/convertJob";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import Dropdown from "../../components/Dropdown";
import { CardIcon, FixedTime, Keep, LoadPill, Phr, Skel, Switch, chText, dropClick } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { diffOf, type DiffResult } from "../../lib/graphDiff";
import { useSettings } from "../../lib/settings";
import { IcExpand, IcFile, IcMix, IcPlus, IcBitrate } from "../../components/icons";
import InfoTip from "../../components/InfoTip";
import FullBtn from "../../components/FullBtn";
import { useFitClass } from "../../lib/fitSwitch";
import { PadCustom } from "../../components/ColorPick";
import type { Tip } from "../../lib/codecAdv";
import { SPEK_RES_TIP } from "../../lib/graphTips";
import { useOvFold } from "../../lib/ovFold";
import { IcSearch, IbStop, IcRefresh, IcGraph, IbSave, IcClose, IbTable, IbPlay } from "../../components/icons";
import { ASK, CMP, CMP_VIEWS, CUSTOM, HEAT, OKI, OVER, PSD_SPANS, RAINBOW, RangeTime, THEMES, THEME_ORDER, Theme, TimeRuler, VIEWS, VIEW_ICON, View, WARN, ZOOMS, dbTxt, dec, label, laneMinH, memPut, minus, noteOf, pkTxt, rulerTicks, spanDigits, spekRamp, tfmt, tfmtD, themeOf } from "./common";
import { HiCanvas, RUL_W, SaveBtn, SavingCtx, Src, WaveStyle, alphaOf, beside, drawAmpRuler, drawMatrix, drawRuler, drawWave, hiCopy, imgName, imgTarget, lut, sample, screenK, useCanvas, waitPaint, withHeader } from "./draw";
import { Crosshair, Draw, Fragment2, Grab, GraphOptions, Lane, LaneOff, Mark, Marks, Speakers, VBar, VRange, axisY, mixSrc, useGrab, useRise, useVRange, vWindow } from "./parts";
import { FZoom, HZ_MIN, HZoom, Overview, PSD_HZ_UNIT, TimeScroll, VZoom, composeLanes, drawSpecLane, vzTxt } from "./zoom";

/** track ลำดับแทร็กเสียงที่จะเปิด (หน้าบิตเรตส่งแทร็กที่ดูอยู่ BUGS ข้อ 119) · ไม่ส่งเปิดแทร็กแรก */
export type GraphReq = { path: string; t?: number; track?: number };
/* ---------- หน้า ---------- */
/** ภาพรวมที่กำลังอ่าน · ออกจากหน้าแล้วกลับมา รอผลรอบเดิมต่อ ไม่สั่งอ่านซ้อน · อ่านได้ทีละไฟล์ ไฟล์ใหม่หยุดไฟล์เก่าเอง (audiograph.rs OVERVIEW_GEN) */
const inflight = new Map<string, Promise<GOverview | null>>();
function overviewOnce(path: string, track: number) {
  const k = path + "|" + track;
  let p = inflight.get(k);
  if (!p) { p = graphApi.overview(path, track).finally(() => inflight.delete(k)); inflight.set(k, p); }
  return p;
}

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
/** ขอบซ้ายของแถบสีกราฟความถี่ (เส้นกรอบกราฟ) · รายการที่กางจากหัวกราฟต้องไม่เลยเส้นนี้ ไม่บังแถบสีกับตัวเลข dB (BUGS ข้อ 77 ต่อ · พี่กันยืนยัน 13 พ.ย. 2569 "ใช่ บังแถบสี") · ไม่ได้อยู่หน้าความถี่คืน null */
const spekEdge = () => { const cv = [...document.querySelectorAll<HTMLElement>(".spekbox canvas[data-spek]")].find((e) => e.offsetParent); return cv ? cv.getBoundingClientRect().right - SPK.R - 4 : null; };
/** โครงจางตอนอ่านเสียง · แถบละช่อง ชื่อช่องซ้ายกับผืนกราฟขวา สูงเต็มกรอบที่เหลือแบบแถบช่องของกราฟจริง (BUGS ข้อ 75) */
const LoadLanes = ({ n }: { n: number }) => (
  <div className="gload-lanes" aria-hidden="true" data-loadlanes>
    {Array.from({ length: Math.max(1, Math.min(8, n)) }, (_, i) => <div key={i} className="gload-lane"><div className="skel" style={{ height: 12 }} /><div className="skel" /></div>)}
  </div>
);
const Swatch = ({ ramp }: { ramp: readonly string[] }) => <i className="cswatch" data-keepcolor aria-hidden="true" style={{ background: `linear-gradient(90deg,${ramp.join(",")})` }} />;
/** คำอธิบายสีของรูปคลื่น (BUGS ข้อ 11 · พี่กัน "ยอดเสียง อ่านเเล้วงง" · "เอาไว้ด้วย") */
const PEAK_RMS_TIP: Tip = { w: "ดังสุด (Peak) คือจุดที่ดังที่สุดแวบเดียวในช่วงนั้น ส่วนดังเฉลี่ย (RMS) คือความดังเฉลี่ยของช่วงนั้น ซึ่งใกล้กับที่หูได้ยิน",
  p: "ถ้าดังสุดชนขอบบนล่าง แปลว่ายอดคลื่นแตะเพดานและเสียงอาจแตก ถ้าดังเฉลี่ยหนาเกือบเท่าดังสุด แปลว่าเพลงถูกบีบให้ดังเท่ากันทั้งเพลง และถ้าดังเฉลี่ยบางกว่าดังสุดมาก แปลว่าเสียงมีช่วงดังเบาเป็นธรรมชาติ" };
const WaveIc = ({ d }: { d: string }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

type Prefs = { view: View; theme: string; style: WaveStyle; cmap: "theme" | "rainbow"; scmap: "heat" | "rainbow" | "mono" | "theme"; spekLight: boolean; wide: boolean; spekAxis: "lin" | "log"; customColor: string };
const PREF_KEY = "graph-prefs";
/** ค่าตั้งต้นของหน้าความถี่ ละเอียดหรือภาพรวม ตั้งที่หน้าตั้งค่า (BUGS ข้อ 14 พี่กัน "อันนี้ตั้งค่าได้ ว่าจะให้เเสดงกราฟไหนตั้งต้น") */
export const SPEK_RES_KEY = "graph-spek-res";
function loadPrefs(): Prefs {
  const d: Prefs = { view: "wave", theme: "ชมพู", style: "aud", cmap: "theme", scmap: "heat", spekLight: false, wide: false, spekAxis: "lin", customColor: "#7a4fd0" };
  // ค่าเดิมที่จำเส้นละเอียดไว้ เปิดมาเป็นแบบหลัก (พี่กันเคาะ "เอาของ audacity เป็นอันหลักเลย")
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? "{}"); const r: Prefs = { ...d, ...p, theme: THEMES[p.theme] || p.theme === CUSTOM ? p.theme : d.theme }; if (!["aud", "bars", "real"].includes(r.style)) r.style = "aud"; if (r.view === "spec") r.view = "spek"; if (r.view === "cmp") r.view = "loud"; if (r.spekAxis !== "log") r.spekAxis = "lin"; return r; } catch { return d; }
}

/** โหมดของหน้า กับการเทียบที่เปิดอยู่ · จำระดับโปรแกรม ไปหน้าอื่นแล้วกลับมาอยู่ที่เดิม (คิวแปลงเก็บใน convertJob.ts) */
let lastMode: "graph" | "convert" = "graph";
// tracks แทร็กเสียงของแต่ละไฟล์ (ไม่มี = แทร็กแรก) · เดิมหน้าเทียบใช้แทร็กแรกเสมอ ดูเสียง 2 อยู่แล้วกดเทียบ ได้เสียง 1 มาเทียบ (AUDIT 12 พ.ย. 2569 ข้อ 22)
type CmpState = { files: string[]; note?: string; free?: boolean; tracks?: Record<string, number> } | null;
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
  const [readSince, setReadSince] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  /** กดอ่านใหม่ หรือกดกราฟเสียงเรื่องเดิมซ้ำตอนอ่านไม่สำเร็จ */
  const [nonce, setNonce] = useState(0);
  /** เปิดมาพร้อมเวลา (ปุ่มดูกราฟเสียงช่วงนี้) ไม่ต้องย้ายไปกลางเรื่องตอนภาพรวมเสร็จ */
  const jumped = useRef(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [ovFold] = useOvFold();
  // หน้าความดัง รวมทุกช่อง (LUFS) · L · R · เทียบซ้ายขวา (dB แบบซ้อนเทียบเดิม)
  const [loudMode, setLoudMode] = useState<"mix" | "FL" | "FR" | "lr">("mix");
  const [swSnap, setSwSnap] = useState<{ theme: string; color: string; old: string } | null>(null);
  const [spekRes, setSpekRes] = useState<"fine" | "coarse">(() => { try { return localStorage.getItem(SPEK_RES_KEY) === "coarse" ? "coarse" : "fine"; } catch { return "fine"; } });
  const [zoom, setZoom] = useState<number | "all">("all");
  const [center, setCenter] = useState(0);
  const [tip, setTip] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [win, setWin] = useState<GWindow | null>(null);
  const [winFail, setWinFail] = useState<string | null>(null);
  /** นับครั้งที่กดรีเซ็ต หน้าวิเคราะห์เก็บซูมแนวตั้งของตัวเอง ใช้ค่านี้สั่งคืน */
  const [resetN, setResetN] = useState(0);
  // หัวกราฟแคบสลับปุ่มแถวเป็นดรอปดาวน์ตามที่ว่างจริง (BUGS ข้อ 76)
  useFitClass(".ag[data-graph] .plothead");
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
  // ความสูงกราฟปรับตามที่ว่างจริงบนจอ ไม่พึ่งตัวเลขประมาณอย่างเดียว · วัดช่องว่างระหว่างแถบเลื่อนกับแถวท้าย แล้วยืดหรือหดช่องกราฟให้พอดี
  // (พี่กันทัก 11 พ.ย. 2569 "ยัมีที่ว่างอยู่เลย" หน้าต่างบางขนาดเหลือที่ว่างใต้แถบเลื่อนราว 35 จุด) · ปรับเมื่อพอให้ช่องเปลี่ยนได้อย่างน้อย 1 จุด กันวนไม่จบ
  const [laneAdj, setLaneAdj] = useState(0);
  useLayoutEffect(() => {
    const p = plotRef.current;
    if (!p || !(view === "wave" || view === "spec")) return;
    const f = p.querySelector<HTMLElement>(".agfoot"), ts = p.querySelector<HTMLElement>("[data-tscroll]");
    if (!f || !ts) return;
    const n = Math.max(1, info?.tracks[track]?.names.length ?? 1), over = p.scrollHeight - p.clientHeight;
    let d = 0;
    if (over > 0) d = -over;
    else { const slack = Math.floor(f.getBoundingClientRect().top - ts.getBoundingClientRect().bottom - 10); if (slack >= n) d = slack; }
    // แถบเตี้ยถึงขั้นต่ำแล้วยังล้น ลดต่อไม่มีผลกับความสูงจริง ห้ามลดค่าต่ำกว่าจุดที่แถบถึงขั้นต่ำ ไม่งั้นตั้งค่าวนจนหน้าพัง
    // (เจอ 11 พ.ย. 2569 ไฟล์ 5.1 หกช่อง หน้าต่างสูง 852 หน้ากราฟขึ้น Maximum update depth exceeded) · กรอบเลื่อนแทนตามเดิม
    const floor = laneMinH(n, view === "wave") * n - (paneH - 252 + (ovFold ? 44 : 0) - (n - 1) * 6);
    if (d) setLaneAdj((a) => Math.max(-400, Math.min(400, Math.max(floor, a + d))));
  });

  const setPref =<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ก็ใช้ค่านี้ไปก่อน */ } return n; });
  const th = prefs.theme === CUSTOM ? themeOf(/^#[\da-f]{6}$/i.test(prefs.customColor) ? prefs.customColor : "#7a4fd0") : THEMES[prefs.theme];
  const movie: Movie | undefined = useMemo(() => movies.find((m) => m.path === path), [movies, path]);
  const t: GTrack | undefined = info?.tracks[track];
  const names = t?.names ?? [];
  const ov = ovRaw && ovRaw.key === `${path}|${track}` && ovRaw.o.env.length === names.length ? ovRaw.o : null;
  const dur = ov?.duration ?? info?.duration ?? 0;

  // เปิดจากที่อื่น (ชั้นวาง หน้าต่างผลตรวจ หน้าบิตเรต)
  const wantTrack = useRef<number | null>(null);
  useEffect(() => {
    if (!req) return;
    setMode("graph"); setCmp(null);
    setPath(req.path);
    wantTrack.current = req.track ?? null;
    if (req.track != null && req.path === path && info && req.track < info.tracks.length) { setTrack(req.track); wantTrack.current = null; }
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
    graphApi.info(path).then((g) => {
      if (!live) return;
      setInfo(g); remember(path, g);
      const k = wantTrack.current;
      wantTrack.current = null;
      if (k != null && k > 0 && k < g.tracks.length) setTrack(k);
    }, (e) => { if (live) setError(String(e)); });
    // รายละเอียด codec จาก MediaInfo อ่านไม่ได้ก็ใช้ชื่อสั้นจาก ffprobe ตามเดิม
    setCodecDetail([]);
    graphApi.codecDetail(path).then((d) => { if (live) setCodecDetail(d); }, () => {});
    return () => { live = false; };
  }, [path, nonce]);

  // ภาพรวมทั้งไฟล์
  useEffect(() => {
    if (!path || !info) return;
    let live = true;
    setOvRaw(null); setWin(null); setPsd(null); setProgress(0); setReadSince(Date.now()); setError(null);
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
  // 38 = แถบซูมแนวตั้งกว้าง 30 (app.css .ag[data-graphview] .vzoom ข้อ 87 ให้ตรงแนวปุ่ม ⓘ) กับช่องห่าง 8
  const VZ_W = view === "wave" || view === "spec" ? 38 : 0;
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
    ns = Math.max(HZ_MIN, ns);
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
  // ช่วงซูมยาวเท่าหรือเกินทั้งไฟล์ (กด 10 นาทีกับไฟล์ 5:15) ใช้ภาพรวมทั้งไฟล์เหมือนกด ทั้งไฟล์ ไม่ขอช่วงซูม
  // (BUGS ข้อ 38 พี่กัน "เรากด 10 วิ มันค้างเลย" · ต้นเหตุ ช่วงที่ดูยังเป็น 0 ถึงท้ายไฟล์เท่าเดิม ตัวขอข้อมูลไม่ถูกเรียกใหม่ แต่ป้ายโหลดรอข้อมูลช่วงซูมตลอดไป)
  // คำขอที่ถูกคำขออื่นยกเลิกกลางทาง (ได้ค่าว่างกลับมา) ขอใหม่ไม่เกิน 3 ครั้ง แล้วใช้ภาพรวมแทน ป้ายโหลดไม่ค้าง
  const wholeSpan = span >= dur * 0.999;
  useEffect(() => {
    if (grabbing || !path || !ov || zoom === "all" || wholeSpan || view === "loud" || view === "psd") return;
    let live = true, tries = 0, id = 0;
    const log = view !== "spek";
    const memKey = `${path}|${track}|${rt0}|${rt1}|${Math.round(plotW)}|${log}`, hit = winMem.current.get(memKey);
    if (hit) { setWin(hit); return; }
    const ask = () => {
      graphApi.window(path, track, rt0, rt1, Math.round(plotW), log ? 96 : 256, log).then((w) => {
        if (w) memPut(winMem.current, memKey, w, 12);
        if (!live) return;
        if (w) setWin(w);
        else if (++tries < 3) id = window.setTimeout(ask, 200);
        else setWinFail(`${rt0}|${rt1}`);
      }, (e) => { if (live) { setWinFail(`${rt0}|${rt1}`); toast({ kind: "bad", title: "อ่านช่วงที่ซูมไม่ได้", detail: String(e) }); } });
    };
    id = window.setTimeout(ask, 150);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, path, ov, track, rt0, rt1, view, plotW, zoom, wholeSpan]);

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
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined, live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      if (e.payload.type !== "drop" || !e.payload.paths[0] || !document.querySelector("[data-graph]")) return;
      // โหมดแปลงเสียง ไฟล์ที่ลากมาทุกไฟล์เข้าคิว · โหมดดูกราฟ เปิดไฟล์แรก
      if (modeRef.current === "convert") addFiles(e.payload.paths);
      else if (!document.querySelector("[data-compare]")) setPath(e.payload.paths[0]);
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, []);

  // ซูมแล้วคงภาพคมเดิมไว้จนข้อมูลช่วงใหม่มาครบ แล้วสลับทีเดียวทั้งกราฟกับแกนเวลา ไม่ยืดภาพรวมความละเอียดต่ำมาคั่น
  const rawWin = win && zoom !== "all" && win.env.length === names.length && Math.abs(win.t0 - rt0) < 0.01 && Math.abs(win.t1 - rt1) < 0.01 ? win : null;
  const needWin = zoom !== "all" && !wholeSpan && view !== "loud" && view !== "psd";
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
  // รอเกิน 1 วินาทีถึงขึ้นป้าย ระหว่างรอภาพเดิมยังอยู่บนจอ รอสั้น ๆ ไม่ต้องขึ้น
  // (เดิม 0.3 วินาที เลื่อนหรือซูมทีไรป้ายขึ้นทุกที พี่กันทัก 11 พ.ย. 2569 "มันจะโหลดอะไรกันนักหันหนา")
  const [viewSlow, setViewSlow] = useState(false);
  useEffect(() => {
    if (viewReady || grabbing) { setViewSlow(false); return; }
    const id = setTimeout(() => setViewSlow(true), 1000);
    return () => clearTimeout(id);
  }, [viewReady, grabbing]);
  const vis = names.filter((c) => !hidden.includes(c));
  const levels = useMemo(() => (ov ? ov.rms.map((d) => Math.pow(10, d / 20)) : []), [ov]);
  const marks: Mark[] = useMemo(() => {
    const m: Mark[] = (movie?.check?.spans ?? []).map((s) => ({ from: s.from, to: Math.max(s.to, s.from + 0.5), text: s.what + " (ผลตรวจ)" }));
    for (const [a, b] of ov?.silences ?? []) if (!m.some((x) => Math.abs(x.from - a) < 1.5)) m.push({ from: a, to: b, text: `เงียบทุกช่อง ${(b - a).toFixed(1)} วินาที` });
    return m;
  }, [movie, ov]);
  // จุดเดิมหลุดช่วงที่ดู (ซูมหรือเลื่อนไปที่อื่น) ใช้ต้นช่วงที่ดู ปุ่มเปิดเล่นที่จะไม่บอกเวลาที่มองไม่เห็น (เจอตอนตรวจภาพ)
  const at = hover ?? (tip >= t0 && tip <= t1 ? tip : t0);

  const toggleCh = (c: string) => setHidden((h) => h.includes(c) ? h.filter((x) => x !== c) : vis.length > 1 ? [...h, c] : h);
  const openOther = async () => { const f = await pickFile("media"); if (f) setPath(f); };
  // กลับจากหน้าเทียบมากราฟเดี่ยว เปิดแทร็กเดียวกับที่เทียบอยู่ (AUDIT ข้อ 22)
  const openSingle = (p: string, t: number) => {
    wantTrack.current = t || null;
    if (p === path && info && t < info.tracks.length) setTrack(t);
    setPath(p);
  };
  const compareOther = async () => {
    if (!path) return;
    // ตัวตรวจในโหมดพัฒนาส่งไฟล์ผ่าน __cmpPick ไม่เปิดกล่องเลือกไฟล์ของ Windows
    const w2 = window as unknown as { __cmpPick?: string };
    const f = import.meta.env.DEV && w2.__cmpPick ? w2.__cmpPick : await pickFile("media"); if (!f) return;
    if (f.toLowerCase() === path.toLowerCase()) { toast({ kind: "warn", ms: 6000, key: "graph-pick", title: "เลือกไฟล์เดียวกับที่เปิดอยู่", detail: "เลือกไฟล์อื่นเพื่อเทียบ" }); return; }
    setCmpBack(null); setCmp({ files: [path, f], free: true, tracks: track ? { [path]: track } : undefined });
  };
  const play = async () => {
    if (!path) return;
    try {
      const r = await checkApi.playAt(path, at);
      if (r.seeked) toast({ kind: "ok", title: `เปิดด้วย ${r.player} ที่ ${tfmt(at)}` });
      else toast({ kind: "warn", title: r.player ? `เปิดด้วย ${r.player} แล้ว แต่เปิดตรงนาทีไม่ได้` : "เปิดด้วยโปรแกรมหลักของ Windows แล้ว แต่เปิดตรงนาทีไม่ได้", detail: `เลื่อนไปที่ ${tfmt(at)} เอง หรือตั้งโปรแกรมเล่นได้ที่หน้าตั้งค่า` });
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
      if (o.title && view !== "spek") cv = withHeader(cv, fileName + " " + vName, tfmt(t0) + " ถึง " + tfmt(t1));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: `บันทึกรูปแล้ว ${saved.width.toLocaleString("en-US")} × ${saved.height.toLocaleString("en-US")} ขนาด ${fmtSize(saved.size)}`, detail: saved.path });
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
      <CompareView key={JSON.stringify(cmp.tracks ?? {})} files={cmp.files} tracks={cmp.tracks} note={cmp.note} free={cmp.free} onFiles={(files, freed) => setCmp(freed ? { files, free: true, tracks: cmp.tracks } : { ...cmp, files })} onSingle={(p) => { setCmpBack(cmp); setCmp(null); setMode("graph"); openSingle(p, cmp.tracks?.[p] ?? 0); }} onBack={() => { const a = cmp.files[0], free = cmp.free; setCmp(null); if (free) { setMode("graph"); openSingle(a, cmp.tracks?.[a] ?? 0); } else setMode("convert"); }} onClose={() => { const a = cmp.files[0]; setCmp(null); setMode("graph"); openSingle(a, cmp.tracks?.[a] ?? 0); }} />
      {tagDlg}
    </>);
  }
  if (mode === "convert") {
    return (
      <div className="ag" data-graph data-graphmode="convert">
        <div className="gmodebar">{modeSeg}<span className="small">แปลงไฟล์เสียงอย่างเดียว ไม่รวมเข้าหนัง และไฟล์เดิมไม่ถูกแก้</span></div>
        <ConvertPane onCompare={(a, b, note, tr) => setCmp({ files: [a, b], note, tracks: tr ? { [a]: tr } : undefined })} onTags={setTagFor} />
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
        <div className="gmodebar">{modeSeg}<span className="small">ดูกราฟเสียงทีละไฟล์ หรือแปลงเสียงเป็นคิวแล้วเทียบความถี่ก่อนกับหลังแปลง</span></div>
        <div className="drop" style={{ minHeight: 180 }} data-graphdrop onClick={dropClick(openOther)}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e5a3bd" strokeWidth="1.8" aria-hidden="true"><path d="M3 12h2M7 7v10M11 4v16M15 8v8M19 10v4" /></svg>
          <b style={{ color: "var(--txt2)" }}>ลากไฟล์หนังหรือไฟล์เสียงมาวางตรงนี้</b><span>หรือ</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openOther}><IcFile size={15} />เลือกไฟล์จากเครื่อง</button>
          <span className="small">รับไฟล์หนังทุกชนิดในชั้นวาง และไฟล์เสียง {AUDIO_EXT.map((e) => e.toUpperCase()).join(" ")}</span>
        </div>
        {recent.length > 0 && <><div className="small">เปิดล่าสุด กดเพื่อดูกราฟอีกครั้ง และกดปุ่มกากบาทเพื่อเอาออกจากรายการ ไฟล์ในเครื่องไม่ถูกแตะ</div>
          <div className="graph-recent" data-graphrecent>{recent.map((r) => {
            const mv = movies.find((m) => m.path.toLowerCase() === r.path.toLowerCase());
            const lost = gone.has(r.path);
            return (
              <div key={r.path} className={"recentrow" + (lost ? " lost" : "")}>
                <button type="button" className="dd" aria-disabled={lost || undefined} onClick={() => { if (!lost) setPath(r.path); }} data-graphrecentpick={r.name} data-lost={lost || undefined} title={lost ? `หาไฟล์ไม่เจอ ไฟล์อาจถูกย้ายหรือลบ หรือไดรฟ์ถอดออกอยู่\n${r.path}` : r.path}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto", overflow: "hidden" }}>
                    <span className="rtype">{r.audioOnly ? <i className="rnote">{music}</i> : (mv?.thumb ?? mv?.linked?.[0]?.thumb) ? <img src={thumbUrl(mv?.thumb ?? mv?.linked?.[0]?.thumb ?? null) ?? ""} alt="" style={{ width: 18, height: 27, borderRadius: 3, objectFit: "cover" }} /> : <i className="rnote" data-graphfilm>{film}</i>}{extCard(r.name)}</span>
                    <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{r.name.replace(/\.[^.]+$/, "")}</span></span>
                  {/* ข้อความขวาไม่หด ชื่อยาวตัดเป็นสามจุดแทน (เดิมเวลาโดนตัดเหลือ 5:1 เจอตอนตรวจภาพ) */}
                  {lost
                    ? <span className="small lostmark" style={{ flex: "none" }}>หาไฟล์ไม่เจอ</span>
                    : <span className="small" style={{ flex: "none" }}>{(r.layout ? "เสียง " + chText(r.layout) + " " : "") + "ยาว " + tfmt(r.duration)}</span>}
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
              <span className="small">{m.audio.length ? "เสียง " + [...new Set(m.audio.map((a) => chText(a.layout)))].join(", ") : ""}</span>
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
        <div className="meta">{info ? `${info.audioOnly ? "ไฟล์เสียง " : ""}${fmtSize(info.size)} ยาว ${tfmt(info.duration)}${info.audioOnly && !movie ? " และไม่ได้อยู่บนชั้นวาง" : ""}` : error ? "อ่านข้อมูลเสียงไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
      </div></div>
      {info && info.tracks.length > 1 && (
        <span data-graphtrack><Dropdown label="แทร็กเสียง" value={String(track)} onChange={(v) => setTrack(Number(v))}
          options={info.tracks.map((x) => ({ value: String(x.index), label: `เสียง ${x.index + 1} ${x.lang ?? "ไม่ระบุภาษา"} ${x.codec} ${chText(x.layout)}` }))} /></span>
      )}
      <button type="button" className="btn btn-ghost" onClick={openOther}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>เปิดไฟล์อื่น</button>
      {/* เทียบกับไฟล์อื่นจากกราฟที่เปิดอยู่ ไม่ต้องผ่านคิวแปลง (พี่กันสั่ง 9 พ.ย. 2569 "เราเปิดกราฟอยู่แล้ว เราอยากเปิดเทียบกับไฟล์อื่นเลย") */}
      <button type="button" className="btn btn-ghost" onClick={compareOther} title="เลือกไฟล์อื่นมาเทียบกับไฟล์นี้" data-graphcompare><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h4v10H4zM16 7h4v10h-4z" /></svg>เทียบ</button>
      {/* หน้าแปลงเสียงอยู่ข้างปุ่มเปิดไฟล์อื่น (มอคอัปหัวข้อ 7) · กดจากหน้ากราฟ ไฟล์ที่ดูอยู่เข้าคิวเลย ไม่ต้องเลือกใหม่ (พี่กันบอก 9 พ.ย. 2569 "มันต้องใช้ไฟล์นั้นเลยสิ") · รอแปลงอยู่แล้วไม่เพิ่มแถว กันกดซ้ำโดยไม่ตั้งใจ */}
      <button type="button" className="btn btn-ghost" onClick={() => { if (path) addFiles([path], true, track); setMode("convert"); }} title="แปลงไฟล์นี้ โดยใส่เข้าคิวแปลงเสียง" data-graphconvert><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h13l-3-3M20 17H7l3 3" /></svg>แปลงเสียง</button>
      {/* ดูบิตเรตของแทร็กเสียงที่ดูอยู่ ไปหน้าบิตเรตพร้อมไฟล์และแทร็กนี้ · ไฟล์เสียงล้วนก็กดได้ (พี่กันสั่ง 10 พ.ย. 2569 "เพิ่มดูบิตเรต จากดูกราฟเสียงได้" · "ทำไมเราดูบิตเรตของเสียงไม่ได้") */}
      {onBitrate && path && info && <button type="button" className="btn btn-ghost" onClick={() => onBitrate(path, `a${track}`)} title="ดูบิตเรตของแทร็กเสียงนี้ และสลับไปดูวิดีโอหรือแทร็กอื่นได้ในหน้าบิตเรต" data-graphbitrate><IcBitrate size={16} />Bitrate</button>}
    </div>
  );
  const seg = <T extends string | number>(opts: [T, React.ReactNode][], cur: T, set: (v: T) => void, attr: string) => (
    <div className="seg sm">{opts.map(([k, l]) => <button key={String(k)} type="button" className={cur === k ? "on" : ""} onClick={() => set(k)} {...{ [attr]: String(k) }}>{l}</button>)}</div>
  );
  // เส้นเลื่อนกับปุ่มนาทีเป็นซูมตัวเดียวกัน คำว่าซูมอยู่หน้าสุดคลุมทั้งสองอย่าง เส้นแบ่งกั้นแค่ปุ่มรีเซ็ต
  // (พี่กันสั่ง 13 พ.ย. 2569 "ขอเส้นแบ่งเหมือนด้านล่าด้วย" แล้วทัก "แบ่งถูกละเหรอ ทำไปเเยำคำว่าซูมออก" · "อันไหนคอือซูมกันเเน่นะ เส้นซูม หรือนาทีที่เห็น" หลังแคลร์วางเส้นแบ่งกั้นระหว่างเส้นเลื่อนกับคำว่าซูม)
  const pickZoom = (v: string) => { setZoom(v === "all" ? "all" : Number(v)); setWin(null); };
  const zoomBox = (opts: [number | "all", string][], lbl: string) => (
    <span className={"zoombox" + (lbl === "ซูม" ? "" : " zfix")} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="lbl">{lbl}</span>
      {lbl === "ซูม" && <span className="zbtns">
        <button type="button" className="zb" onClick={() => zoomBy(2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={dur} span={span} onSpan={setSpan} onBusy={grabBusy} />
        <button type="button" className="zb" onClick={() => zoomBy(0.5)} disabled={span <= HZ_MIN * 1.01} aria-label="ซูมเข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
      </span>}
      {/* หัวกราฟแคบ ปุ่มช่วงซูมเป็นดรอปดาวน์ สลับด้วย @container ใน app.css (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก")
          ลากเส้นเลื่อนไปค่าที่ไม่ตรงปุ่มไหน ดรอปดาวน์ขึ้นความยาวช่วงที่ดูแบบเดียวกับเวลาบนหัวกราฟ */}
      <span className="zseg">{seg(opts.map(([k, l]) => [String(k), l] as [string, string]), String(zoom), pickZoom, "data-zoom")}</span>
      <span className="zdd" title={`ช่วงที่ดูยาว ${tfmtD(span, spanDigits(span))}`} data-zoomdd><Dropdown label={lbl === "ซูม" ? "ช่วงซูม" : lbl} value={String(zoom)} onChange={pickZoom} keepLeftOf={spekEdge}
        options={opts.map(([k, l]) => ({ value: String(k), label: l }))} display={(o) => o?.label ?? tfmtD(span, spanDigits(span))} /></span>
      {lbl === "ซูม" && <>
        <span className="fsep" aria-hidden="true" />
        <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset onClick={() => { setZoom("all"); setWin(null); setVz(1); setSzRaw(1); setSb(0); setResetN((n) => n + 1); }}><IcRefresh size={15} /></button>
      </>}</span>
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
      {/* ปุ่มแบบรูปคลื่นย้ายลงหัวการ์ดรูปคลื่น (BUGS ข้อ 12 · พี่กัน "พอเราปรับโโยเอา audacity มาเป็นตัวหลัก เจ้ากราฟแท่งมันจะเหลือ 1 อัน เอามันย้ายลงมาในการ์ดเลย") */}
      <div className="sws" style={{ marginLeft: "auto" }} role="group" aria-label="ชุดสี">{THEME_ORDER.map((n) => <button key={n} type="button" className={"sw" + (prefs.theme === n ? " on" : "")} aria-label={"ชุดสี" + n} title={"ชุดสี" + n} onClick={() => setPref("theme", n)} data-theme={n}
        style={{ background: `linear-gradient(135deg,${THEMES[n].ramp[2]},${THEMES[n].ramp[5]} 60%,${THEMES[n].ramp[7]})` }} />)}{/* เปิดแผงจำชุดสีตอนนั้นไว้ · สีเดิมคือสีที่กราฟใช้อยู่ตอนเปิด · ตกลงใช้สีกำหนดเองแม้ยังไม่ได้แตะสี · ยกเลิกคืนชุดสีเดิมทั้งชุด */}
        <PadCustom pad={prefs.customColor} what="สีกราฟ" custom={prefs.theme === CUSTOM} panelStyle={{ left: "auto", right: 0, zIndex: 30 }}
          oldColor={swSnap?.old} onOpen={() => setSwSnap({ theme: prefs.theme, color: prefs.customColor, old: prefs.theme === CUSTOM ? prefs.customColor : THEMES[prefs.theme].rms })}
          onOk={() => setPrefs((p) => { const n = { ...p, theme: CUSTOM }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } return n; })}
          onCancel={() => { const sn = swSnap; if (sn) setPrefs((p) => { const n = { ...p, theme: sn.theme, customColor: sn.color }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ */ } return n; }); }}
          onPad={(c) => setPrefs((p) => { const n = { ...p, customColor: c, theme: CUSTOM }; try { localStorage.setItem(PREF_KEY, JSON.stringify(n)); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } return n; })}
          trigger={(open, toggle) => <button type="button" className={"sw sw-custom" + (prefs.theme === CUSTOM ? " on" : "")} aria-expanded={open} aria-label="ชุดสีกำหนดเอง" title="ชุดสีกำหนดเอง เลือกสีหลักสีเดียว โปรแกรมไล่ชุดสีให้" onClick={toggle} data-sw-custom
            // สีที่เลือกเล็กลง มีขอบขาวคั่นกับขอบรุ้ง (BUGS ข้อ 79 · พี่กันสั่ง 13 พ.ย. 2569 "สีที่เลือกเล็กลงกว่านี้ เเละใส่ขอบขาว")
            style={{ padding: 2, background: `${prefs.theme === CUSTOM ? `linear-gradient(135deg,${th.ramp[2]},${th.ramp[5]} 60%,${th.ramp[7]})` : `linear-gradient(135deg,${themeOf(prefs.customColor).ramp[2]},${themeOf(prefs.customColor).ramp[5]} 60%,${themeOf(prefs.customColor).ramp[7]})`} content-box, linear-gradient(white, white) padding-box, conic-gradient(#e0457b,#f0a23b,#e8d23a,#4cc38a,#3b8fe0,#8a5ae0,#e0457b) border-box` }} />} /></div>
      <GraphOptions on={zoomAll} onChange={(v) => updateSettings({ graphZoomAll: v })} />
      {/* ขยายกราฟเต็มจอ พับแผงลำโพงซ้าย กดอีกครั้งกางคืน จำไว้ (พี่กันสั่ง 8 พ.ย. 2569) */}
      <button type="button" className={"btn btn-ghost btn-sm" + (prefs.wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={prefs.wide} title={prefs.wide ? "แสดงแผงลำโพง" : "ซ่อนแผงลำโพง กราฟกว้างขึ้น"} aria-label={prefs.wide ? "แสดงแผงลำโพง" : "ซ่อนแผงลำโพง"} onClick={() => setPref("wide", !prefs.wide)} data-graphwide><IcExpand size={14} /></button>
      <FullBtn />
      {/* ชื่อชุดสีที่เคยเขียนต่อท้ายเอาออก ปุ่ม แบบ Audacity เพิ่มเข้ามาแล้วชื่อตกบรรทัดสองตัวเดียว · ชุดที่เลือกมีวงกรอบ ชี้แล้วขึ้นชื่อ */}
    </div>
  );

  /* ---------- แผงซ้าย ---------- */
  const infoRows: [string, string][] = t ? [
    ["Codec", codecDetail[t.index] ?? t.codec], ["Channels", `${chText(t.layout)}, ${names.length} ${names.length === 1 ? "channel" : "channels"}`], ["Sample rate", `${(t.rate / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kHz`],
    ...(t.bits ? [["Bit depth", `${t.bits}-bit`] as [string, string]] : []), ...(t.bitrate ? [["Bitrate", `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s`] as [string, string]] : []),
    ...(t.lang ? [["Language", t.lang] as [string, string]] : []),
  ] : [];
  const firstMark = marks[0];
  // แถวสั้น ของยาวกับค่าเทคนิคดูเต็มได้จากการกดปกหรือชื่อไฟล์
  const tagShow = tagFile ? tagRows(tagFile, null).filter(([k]) => !["รูปปก", "ค่าความดัง", "หมายเหตุ"].includes(k)).map(([k, v]): [string, string] => [k === "ชื่อเพลง" && !tagFile.audioOnly ? "ชื่อเรื่อง" : k, v]) : [];
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {chText(t?.layout)}</span><span className="small" style={{ color: "var(--txt3)" }}>{hidden.length ? `แสดง ${vis.length} จาก ${names.length} ช่อง` : `${names.length} ช่อง`}</span></h3>
        {names.length > 0 && <Speakers names={names} th={th} levels={levels} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{names.length > 1 ? "กดลำโพงเพื่อปิดหรือเปิดช่องนั้น" : "ไฟล์นี้มีเสียงช่องเดียว"}</div></div>
      {t && <div className="card"><h3>ข้อมูลเสียง</h3><dl className="kv" data-graphinfo>{infoRows.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl></div>}
      {path && <div className="card gtag" data-graphtagcard><h3>{tagFile && !tagFile.audioOnly ? "ข้อมูลในไฟล์" : "ข้อมูลเพลง"}</h3>
        <div className="gcover">{tagCover === undefined ? <Skel w="100%" h={120} r={0} />
          : tagCover ? <button type="button" onClick={() => setTagFor(path)} title="ดูข้อมูลเพลงทั้งหมด" aria-label="ดูข้อมูลเพลงทั้งหมด" data-graphcover><img src={tagCover.url} alt="รูปปก" /></button>
          : <div className="none" data-graphcover="none">ไม่มีรูปปก</div>}</div>
        {tagShow.length > 0 ? <dl className="kv" data-graphtags-kv>{tagShow.map(([k, v]) => <FragmentKV key={k} k={k} v={v} />)}</dl>
          : tagFile && <div className="small" style={{ marginTop: 8 }} data-graphtags-none><Phr>{whyNone(tagFile)}</Phr></div>}</div>}
      {firstMark && <div className="stat warn">{WARN}<div><b>{movie?.check?.spans?.length ? "ผลตรวจล่าสุด" : "ช่วงเงียบผิดปกติ"}</b><span className="nw">{firstMark.text.replace(" (ผลตรวจ)", "")}</span> <span className="nw">ที่ {tfmt(firstMark.from)}</span>
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
          <div><b>{error}</b>{stopped ? "ยังไม่ได้วาดกราฟ กดอ่านใหม่เพื่อเริ่มอีกครั้ง" : error.includes("ไม่มีแทร็กเสียง") ? "วิดีโออัดหน้าจอบางแบบไม่ได้อัดเสียงไว้" : "ลองเปิดไฟล์อื่น หรือตรวจไฟล์นี้ที่หน้าตรวจไฟล์"}
            {!error.includes("ไม่มีแทร็กเสียง") && <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)} data-graphretry><IcRefresh size={15} />อ่านใหม่</button></div>}</div>
        </div>
      </div>
    );
  }
  if (!ov || !src) {
    // ตอนโหลดใช้โครงเดียวกับหน้าที่มีกราฟ (data-graphview) กรอบสูงเต็มจอ เส้นแบ่งแผงซ้ายอยู่ตลอด โครงจางเต็มความสูงรูปเดียวกับแถบช่อง
    // (BUGS ข้อ 75 · พี่กันทัก 13 พ.ย. 2569 "ตอนเราให้มันโหลดกราฟ หน้ากระดูดมันควรหญ่กว่านี้ เเล้วเส้นเเย่งข้อมูลฝั่งซ้ายันหายไป")
    return (
      <div className="ag" data-graph data-graphview={view} data-graphloadview><div className="agstick">{head}{ctl}</div>{tagDlg}
        <div className={"agb" + (prefs.wide ? " wide" : "")}>{prefs.wide ? null : panel}
          <div className="plot" data-graphloading>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13.5 }}>อ่านเสียง {names.length || ""} ช่อง <b>{Math.round(progress ?? 0)}%</b> <Elapsed since={readSince} /></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => graphApi.cancel()}><IbStop size={15} />หยุด</button>
            </div>
            <div className="bar"><i style={{ width: `${progress ?? 0}%` }} /></div>
            <LoadLanes n={names.length || 2} />
            <div className="small" style={{ marginTop: 8 }}>อ่านเฉพาะเสียงโดยไม่ถอดภาพ อ่านครั้งเดียวแล้วเปิดซ้ำขึ้นทันที และไฟล์ไม่ถูกแก้</div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- กราฟ ---------- */
  const peakTxt = (c: string) => { const i = names.indexOf(c); return ov.peaks[i] == null ? "" : ov.peaks[i] <= -119 ? "เงียบทั้งไฟล์" : ov.peaks[i] < -96 ? "แทบเงียบทั้งไฟล์ " + pkTxt(ov.peaks[i]) : "ดังสุด " + pkTxt(ov.peaks[i]); };
  const Ruler = ({ left, right }: { left: number; right: number }) => (
    <TimeRuler t0={t0} t1={t1} left={left} right={right} />
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
  const hasLR = names.includes("FL") && names.includes("FR");
  const lrWhy = "ไฟล์นี้ไม่มีช่องซ้ายกับขวาแยกกัน";
  const loudOpts: [typeof loudMode, string][] = [["mix", "รวมทุกช่อง"], ["FL", "L ซ้าย"], ["FR", "R ขวา"], ["lr", "เทียบซ้ายขวา"]];
  // สลับช่องแบบค่อย ๆ เปลี่ยนด้วย View Transitions ของเบราว์เซอร์ ภาพเก่าจางออก ภาพใหม่ค่อย ๆ ขึ้น หัวกราฟกับแถบล่างเลื่อนไปที่ใหม่ (ชื่อใน app.css)
  // ตั้งในเครื่องให้ลดการเคลื่อนไหว หรือเบราว์เซอร์ไม่รองรับ สลับทันทีแบบเดิม
  // (พี่กันสั่ง 13 พ.ย. 2569 "หน้า ความดัน ตอนเราเปลี่ยนจากดูรวมทุกช่อง ไปดู L R ภาพมันแบบตัดไปอีกอันเลย เราขอ animation transition ลื่นๆที")
  const switchLoud = (k: typeof loudMode) => {
    if (k === loudMode) return;
    const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (!d.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { setLoudMode(k); return; }
    d.startViewTransition(() => flushSync(() => setLoudMode(k)));
  };
  // หัวกราฟแคบ ปุ่มเลือกช่องสี่ปุ่มเป็นดรอปดาวน์แบบเดียวกับปุ่มแบบกราฟของหน้ารูปคลื่น สลับด้วย @container ใน app.css
  // (ใส่เส้นแบ่งในแถบซูมแล้วหัวกราฟหน้าความดังต้องการราว 906 จุด แต่ที่หน้าต่าง 1280 มี 800 จุด ปุ่มเลือกช่องไปซ้อนใต้แถบซูม เจอตอนตรวจภาพ 13 พ.ย. 2569)
  const loudBox = names.length > 1 ? (
    <span className="loudbox" style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "none" }}><div className="seg sm loud-seg" data-loudmode>{loudOpts.map(([k, l]) => {
      const off = k !== "mix" && !hasLR;
      return <button key={k} type="button" className={loudMode === k ? "on" : ""} disabled={off} title={off ? lrWhy : k === "mix" ? "ความดังรวมทุกช่อง หน่วย LUFS" : k === "lr" ? "ซ้อนเทียบความดังเฉลี่ยซ้ายกับขวา หน่วย dB" : "ความดังเฉลี่ยของช่องนี้ หน่วย dB"} onClick={() => switchLoud(k)} data-k={k}>{l}</button>;
    })}</div>
      <span className="loud-dd" title={hasLR ? undefined : lrWhy} data-loudmodedd><Dropdown label="ช่องที่ดู" value={loudMode} onChange={switchLoud} options={loudOpts.filter(([k]) => k === "mix" || hasLR).map(([value, label]) => ({ value, label }))} /></span>
      <InfoTip title="หน่วยของความดัง" tip={LOUD_TIP} /></span>
  ) : null;
  const lanesView = view === "wave" || view === "spec";
  if (lanesView) {
    // แถบสูงขึ้นจากเดิม (พี่กัน 7 พ.ย. 2569 *"ใ้ห้ระบบมันขยายกราฟลงมาได้มากกว่านี้ ตอนนี้มันเเค่สองเเถบที่โคตรจะชิดกัน"*) · ลากที่จับใต้กราฟขยายต่อได้ถึง 4 เท่า
    const minH = laneMinH(names.length, false);
    // 234 คือหัวกราฟ แถบเลื่อน แถวปุ่มท้าย ระยะขอบรวมกัน
    const laneH = Math.max(minH, Math.floor((paneH - 252 + (ovFold ? 44 : 0) + laneAdj - (names.length - 1) * 6) / Math.max(1, names.length)));
    const colors = lut(prefs.cmap === "rainbow" ? RAINBOW : th.ramp);
    plot = (
      <div className="plot" data-plot ref={plotRef}>
        <div className="plotstick">
        <div className="plothead"><span><b>{view === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>
          {/* หัวการ์ดแคบ (จอเล็ก) ตัวเลือกแบบกราฟเป็นดรอปดาวน์ แถบซูมไม่ถูกบีบ (พี่กันสั่ง 11 พ.ย. 2569 "มันบีบเส้นซูมเกินไป ให้เปลี่ยนรูปแบบกราฟเป็นดรอปดาวน์ ถ้าจอมันเล็ก") · สลับด้วย @container ใน app.css */}
          {view === "wave" && <span className="wstyle-seg">{seg<WaveStyle>([["aud", <><WaveIc d="M3 12c2-7 3-7 5 0s3 7 5 0 3-7 5 0 2 4 3 0" />รูปคลื่น</>], ["bars", <><WaveIc d="M5 9v6M10 5v14M15 8v8M20 10v4" />แท่ง</>], ["real", <><WaveIc d="M3 12h2V6h2v12h2V4h2v16h2V7h2v10h2V9h2v3h2" />เต็มช่อง</>]], prefs.style, (v) => setPref("style", v), "data-style")}</span>}
          {view === "wave" && <span className="wstyle-dd" data-styledd><Dropdown label="แบบกราฟ" value={(prefs.style === "fine" ? "aud" : prefs.style) as "aud" | "bars" | "real"} onChange={(v) => setPref("style", v)}
            options={[{ value: "aud", label: "รูปคลื่น" }, { value: "bars", label: "แท่ง" }, { value: "real", label: "เต็มช่อง" }]} /></span>}
          {zoomBox(ZOOMS, "ซูม")}</div>
        <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={(x) => { setCenter(x); setTip(x); if (zoom === "all") setZoom(240); }} left={LW} right={VZ_W} />
        <Ruler left={LW} right={VZ_W} />
        </div>
        <div className="lanewrap" style={{ marginTop: marks.some((m) => m.to > t0 && m.from < t1) ? 28 : 6, position: "relative" }}
          onWheel={(e) => { if (view !== "spec" || sz <= 1 || e.ctrlKey) return; e.stopPropagation(); setSb((b) => szClampB(b + (e.deltaY < 0 ? 0.25 : -0.25) / sz, sz)); }}>
        <div className={"lanes " + lanesGrab.cls} data-wstyle={view === "wave" ? prefs.style : undefined} ref={setBoxEl} style={{ marginTop: 0 }} {...lanesGrab.props} onPointerMove={(e) => { if (!lanesGrab.move(e)) onMove(LW, 0)(e); }} onPointerLeave={() => setHover(null)} data-lanes>
          {names.map((c) => {
            const i = names.indexOf(c), l = label(names, c);
            // ทั้งสามแบบ (รูปคลื่น แท่ง เต็มช่อง) ช่องสูงเท่ากัน มีแกนตัวเลขซ้ายเหมือนกัน ช่องคั่นเท่ากัน กรอบกราฟอยู่ตำแหน่งเดียวกันทุกแบบ
            // (พี่กันทัก 11 พ.ย. 2569 "มันไม่เท่ากันเลย" · เดิมแบบแท่งไม่มีแกนตัวเลข แบบเต็มช่องไม่มีช่องคั่น ช่องล่างกับแถบเลื่อนขึ้นไป 6 จุด)
            // แท่งสูงครึ่งละ ดังสุด × ครึ่งช่อง ตรงกับสเกลของแกนตัวเลขอยู่แล้ว
            const tog = { onToggle: () => toggleCh(c), last: vis.length <= 1 };
            if (hidden.includes(c)) return <LaneOff key={c + "off"} code={l.code} th={l.th} peak={peakTxt(c)} height={view === "wave" ? Math.max(laneH, 60) : laneH} {...tog} />;
            return view === "wave"
              ? <Lane key={c + view} room {...tog} code={l.code} th={l.th} peak={peakTxt(c)} height={Math.max(laneH, 60)} deps={[src, t0, t1, th, prefs.style, i, vz, laneH]}
                  draw={(g, w, h) => drawWave(g, w, h, sample(src, i, t0, t1, w), th, prefs.style, vz)}
                  ruler={(g, w, h) => drawAmpRuler(g, w, h, vz)} />
              : <Lane key={c + view} {...tog} code={l.code} th={l.th} peak={peakTxt(c)} height={laneH} deps={[src, winNow, heldShown, t0, t1, prefs.cmap, th, i, laneH, sz, sb]}
                  draw={(g, w, h) => drawSpecLane(g, w, h, i, winNow, ov, t0, t1, t?.rate ?? 48000, colors, sz, sb, heldShown)} />;
          })}
          <Marks marks={marks} t0={t0} t1={t1} left={LW} right={0} />
          {/* เส้นตั้งกับกล่องบอกค่าขึ้นเฉพาะตอนเมาส์ชี้ (พี่กัน 7 พ.ย. 2569 *"ต้องให้เเสดงเฉพาะเมาส์ชี้"*) */}
          {hover != null && <Crosshair box={boxEl} left={LW} right={0} t0={t0} t1={t1} at={at} rows={vis.map((c) => ({ v: dbTxt(valueAt(names.indexOf(c), at)) + " dB", k: `${label(names, c).code} ${label(names, c).th}` }))} />}
        </div>
        {view === "spec" && sz > 1 && <div ref={svRef} className="spekvs" style={{ top: 0, bottom: 0, right: VZ_W + 4 }} title="ลากเพื่อเลื่อนย่านความถี่ขึ้นลง หรือหมุนล้อเมาส์บนกราฟก็ได้" data-specvs
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); svDrag.current = true; svTo(e.clientY); }} onPointerMove={(e) => { if (svDrag.current) svTo(e.clientY); }} onPointerUp={() => { svDrag.current = false; }} onPointerCancel={() => { svDrag.current = false; }}>
          <i style={{ height: 100 / sz + "%", bottom: sb * 100 + "%" }} data-specthumb /></div>}
        {view === "spec" ? <FZoom value={sz} onChange={setSz} /> : VZ_W > 0 && <VZoom value={vz} onChange={setVz} />}
        </div>
        {scroller(LW, VZ_W)}
        <div className="agfoot">
          {view === "wave"
            // ทั้งสามแบบ (รูปคลื่น แท่ง เต็มช่อง) โครงเดียวกัน แถวบนป้ายสีกับปุ่ม ⓘ แถวล่างหมายเหตุบรรทัดเดียว สูงเท่ากันทุกแบบ สลับแบบแล้วกราฟไม่ขยับ
            // (พี่กันสั่ง 11 พ.ย. 2569 "เเถบข้างล่างนี้ สามกราฟ ทำห้มันเหมือนกัน เเล้ว fiix" · เดิมแบบแท่งไม่มี ⓘ ไม่มีหมายเหตุ แถบเตี้ยกว่า 49 จุด)
            ? <div className="lg wavelg" data-wavelg>
                <div className="lgrow">
                  {prefs.style === "bars"
                    ? <span><svg width="22" height="14" viewBox="0 0 22 14" style={{ verticalAlign: -2, marginRight: 5 }} aria-hidden="true"><rect width="22" height="14" rx="3" fill={th.lane} stroke={th.peak} /><rect x="4" y="5" width="2" height="4" rx="1" fill={th.rms} /><rect x="8" y="2" width="2" height="10" rx="1" fill={th.rms} /><rect x="12" y="4" width="2" height="6" rx="1" fill={th.rms} /><rect x="16" y="3" width="2" height="8" rx="1" fill={th.rms} /></svg>ความสูงแท่ง คือดังสุด (Peak)</span>
                    : <><span><i style={{ background: th.rms }} />ดังสุด (Peak)</span>{prefs.style !== "real" && <span><i style={{ background: th.ramp[5] }} />ดังเฉลี่ย (RMS)</span>}</>}
                  <InfoTip title="ดังสุดกับดังเฉลี่ย" tip={PEAK_RMS_TIP} />
                  {marks.length > 0 && <span style={{ color: "#b03535" }}><i style={{ background: "rgba(208,59,59,.25)", border: "1px solid rgba(208,59,59,.75)" }} />จุดเสีย</span>}
                </div>
                {(() => { const note = prefs.style === "bars" ? "แบบแท่ง หนึ่งแท่งคือช่วงเวลาสั้น ๆ หนึ่งช่วง และตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล" : `${prefs.style === "real" ? "หน้าตาแบบโปรแกรม Audacity" : "แบบตามโปรแกรม Audacity"} ตัวเลขซ้ายคือความสูงคลื่น 1.0 เต็มสเกล`; return <div className="small lgnote" title={note} data-audnote>{note}</div>; })()}
              </div>
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
  } else if (view === "loud" && loudMode !== "mix") {
    const cc = loudMode === "lr" ? ["FL", "FR"] : [loudMode];
    plot = <CmpView head={loudBox} onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} dur={dur} src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "loud") {
    plot = <LoudView head={loudBox} onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} ov={ov} th={th} t0={t0} t1={t1} names={names} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} showTable={showTable} setShowTable={setShowTable} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "cmp") {
    const cc = ["FL", "FR", "FC"].filter((c) => names.includes(c));
    plot = <CmpView onPan={panTo} onBusy={grabBusy} resetN={resetN} scroller={scroller} dur={dur} src={src} names={names} cc={cc} t0={t0} t1={t1} marks={marks} zoomBox={zoomBox(ZOOMS, "ซูม")} at={at} live={hover != null} setHover={setHover} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} />;
  } else if (view === "spek") {
    plot = <SpekView axis={prefs.spekAxis} setAxis={(v) => setPref("spekAxis", v)} res={spekRes} setRes={setSpekRes} onBusy={grabBusy} held={heldShown} resetN={resetN} tools={styleTools} light={prefs.spekLight} onPanT={panTo} scroller={scroller} ov={ov} win={winNow} track={t} fileName={fileName} names={names} t0={t0} t1={t1} zoomBox={zoomBox(ZOOMS, "ซูม")} scmap={prefs.scmap} setScmap={(v) => setPref("scmap", v)} th={th} audioOnly={!!info?.audioOnly} play={play} save={saveImage} exportRef={exportRef} plotRef={plotRef} at={at} />;
  } else {
    plot = <PsdView codec={t?.codec ?? ""} filePath={path ?? ""} onReset={() => { setZoom("all"); setWin(null); setResetN((n) => n + 1); }} resetN={resetN} scroller={scroller} psd={psd && psd.db.length === psdSeries.length + (psdMs ? 2 : 0) ? psd : null} names={names} psdCh={psdCh} setPsdCh={setPsdCh} psdLog={psdLog} setPsdLog={setPsdLog} psdSize={psdSize} setPsdSize={setPsdSize} th={th} ov={ov} t0={t0} t1={t1}
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
          <div><b>หน้ากราฟเสียงวาดกราฟของไฟล์นี้ไม่ได้</b>{this.state.err} ไฟล์ไม่ถูกแก้
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
type CommonProps = { scroller?: (left: number, right: number) => React.ReactNode; save: () => void; exportRef: React.MutableRefObject<(outW: number) => HTMLCanvasElement | null>; plotRef: React.RefObject<HTMLDivElement | null> };
function LoudView({ head, onPan, onBusy, resetN, scroller, ov, th, t0, t1, names, marks, zoomBox, at, live, setHover, showTable, setShowTable, save, exportRef, plotRef }: CommonProps & { head?: React.ReactNode; onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; ov: GOverview; th: Theme; t0: number; t1: number; names: string[]; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; showTable: boolean; setShowTable: (b: boolean) => void }) {
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
function CmpView({ head, onPan, onBusy, resetN, scroller, dur, src, names, cc, t0, t1, marks, zoomBox, at, live, setHover, play, save, exportRef, plotRef }: CommonProps & { head?: React.ReactNode; onPan: (c: number) => void; onBusy: (on: boolean) => void; resetN: number; dur: number; src: Src; names: string[]; cc: string[]; t0: number; t1: number; marks: Mark[]; zoomBox: React.ReactNode; at: number; live: boolean; setHover: (t: number | null) => void; play: () => void }) {
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

/** ตีความขอบบน · เกณฑ์ตามมอคอัปที่พี่กันผ่าน FLAC ต่ำกว่า 19.5 kHz · AC-3 กับ E-AC-3 ต่ำกว่า 19 kHz · AAC ต่ำกว่า 15.5 kHz · เพิ่มเงื่อนไขว่าต้องตัดเป็นหน้าผา
    ไฟล์ไม่บีบอัดทุกชนิดใช้เกณฑ์ 19.5 kHz แบบ FLAC · เดิมรู้จักแค่บางชื่อ WavPack TrueHD DTS-HD MA ที่แปลงจาก MP3 ขึ้นว่าไม่มีร่องรอย APE TAK TTA ไม่ถูกตรวจ (AUDIT 12 พ.ย. 2569 ข้อ 2)
    ชื่อชนิดเสียงมาจาก probe.rs audio_name ชนิดที่ไม่มีชื่อเฉพาะเป็นชื่อ ffmpeg ตัวพิมพ์ใหญ่ เช่น WAVPACK APE TAK TTA MLP */
/** ชนิดเสียงที่ไม่ลดคุณภาพ ใช้ทั้งหน้าความถี่และหน้าความถี่เฉลี่ย (AUDIT 12 พ.ย. 2569 ข้อ 21 ใช้รายชื่อเดียวกัน) */
const LOSSLESS_CODECS = ["FLAC", "PCM", "ALAC", "TrueHD", "MLP", "DTS-HD MA", "WAVPACK", "APE", "TAK", "TTA"];
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

function SpekView({ onBusy, held, resetN, tools, light, onPanT, scroller, ov, win, track, fileName, names, t0, t1, zoomBox, scmap, th, audioOnly, play, save, exportRef, plotRef, at, axis, setAxis, res, setRes }: CommonProps & { onBusy: (on: boolean) => void; held: GWindow | null; resetN: number; tools?: React.ReactNode; light: boolean; onPanT: (center: number) => void; ov: GOverview; win: GWindow | null; track: GTrack | undefined; fileName: string; names: string[]; t0: number; t1: number; zoomBox: React.ReactNode; scmap: Prefs["scmap"]; setScmap: (v: Prefs["scmap"]) => void; th: Theme; audioOnly: boolean; play: () => void; at: number; axis: "lin" | "log"; setAxis: (v: "lin" | "log") => void; res: "fine" | "coarse"; setRes: (v: "fine" | "coarse") => void }) {
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

/* ---------- ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity) ---------- */
const PSM = { L: 52, R: 18, T: 14, B: 30 };
/** หน่วยของหน้าความดัง (BUGS ข้อ 24) */
/** แยกความหมายเป็นหัวข้อละแบบ (พี่กันทัก 13 พ.ย. 2569 "แบ่งความหมายสองออันนี้ด้วย" ที่กล่องละเอียดกับภาพรวม แคลร์ไล่แก้กล่องแบบเดียวกันในหน้านี้) */
const LOUD_TIP: Tip = {
  w: "หน่วยของตัวเลขความดังขึ้นกับแบบที่เลือก",
  o: [
    ["รวมทุกช่อง", "ใช้หน่วย LUFS ซึ่งเป็นความดังที่หูได้ยินตามมาตรฐานเดียวกับ Spotify และ YouTube โดยค่ายิ่งติดลบยิ่งเบา", "เทียบความดังกับเพลงหรือหนังเรื่องอื่นได้", ""],
    ["L R และเทียบซ้ายขวา", "ใช้หน่วย dB ซึ่งเป็นความดังเฉลี่ย (RMS) ของแต่ละช่อง", "เห็นว่าข้างไหนดังกว่ากัน", ""],
  ],
};
/** คำอธิบาย ⓘ ของหน้าความถี่เฉลี่ย (BUGS ข้อ 21 22) */
const MS_TIP: Tip = { w: "M (Mid) คือเสียงกลาง ได้จากซ้ายบวกขวา เป็นส่วนที่สองข้างเหมือนกัน เช่นเสียงร้อง เบส และกลอง ส่วน S (Side) คือเสียงข้าง ได้จากซ้ายลบขวา เป็นส่วนที่สองข้างต่างกัน เช่นเสียงก้องและเครื่องดนตรีที่แยกข้าง วิธีอ่านคือ ถ้า S ต่ำกว่า M มาก เนื้อเพลงอยู่ตรงกลาง ถ้า S เกือบเท่า M เพลงกว้าง ถ้า S แทบเป็นศูนย์ เสียงเกือบเป็นโมโน และเสียงเบสควรอยู่ใน M" };
const PSD_TIPS: Record<string, Tip> = { axis: { w: "แกนความถี่คือแกนนอนของกราฟ เสียงต่ำอยู่ซ้ายและเสียงสูงอยู่ขวา ส่วนสองแบบนี้ต่างกันที่การแบ่งระยะบนแกน", o: [
    ["Log", "ย่อมาจาก Logarithm ทุกครั้งที่ความถี่เพิ่มเป็นสองเท่าจะได้ระยะเท่ากัน เช่น ช่วง 100 ถึง 200 Hz กว้างเท่ากับช่วง 1 ถึง 2 kHz ซึ่งตรงกับที่หูคนได้ยิน", "เห็นเบสกับเสียงร้องชัด", "ย่านเสียงสูงถูกบีบ"],
    ["Linear", "แบ่งระยะเท่ากันทุก Hz เช่น ช่วง 0 ถึง 1 kHz กว้างเท่ากับช่วง 20 ถึง 21 kHz", "เหมาะดูเสียงสูงหรือจุดที่ถูกตัด", "เสียงต่ำเบียดอยู่ขอบซ้ายนิดเดียว"],
  ], r: "ดูทั่วไปใช้ Log ส่วนดูเสียงสูงหรือรอยตัดใช้ Linear" }, size: { w: "ตัวเลขยิ่งมากยิ่งแยกความถี่ที่ใกล้กันได้ เห็นยอดแคบชัด แต่เส้นหยักมากขึ้นและคิดนานขึ้น ค่า 4,096 พอสำหรับดูทั่วไป และ 16,384 ใช้หาเสียงหึ่งหรือโน้ตที่ชิดกัน" }, range: { w: "ความสูงของแกนตั้ง นับลงจากจุดที่ดังสุด ค่า 60 dB เห็นรายละเอียดส่วนที่ดัง และ 120 dB เห็นถึงเสียงเบามาก เช่นเสียงรบกวนพื้นหลัง" }, grid: { w: "เส้นช่วยอ่านค่า แนวนอนทุก 6 dB และแนวตั้งตามความถี่ ปิดแล้วกราฟโล่ง เหมาะบันทึกเป็นรูป" }, fill: { w: "ระบายสีใต้เส้นให้เห็นเป็นพื้น ถ้ามีเส้นเดียวอ่านง่าย แต่ถ้าหลายเส้นซ้อนกันสีจะผสมจนขุ่น ปิดไว้อ่านง่ายกว่า" } };
/** ซูมแกนความถี่ได้สูงสุดกี่เท่า */
const PSD_HZ_MAX = 32;
/** ค่าบนเส้นโค้งผ่าน 4 จุดที่ตำแหน่ง 0 1 2 3 (พหุนามลากรานจ์ดีกรีสาม) · x คือตำแหน่งระหว่าง 0 ถึง 3 */
function cubicAt(y0: number, y1: number, y2: number, y3: number, x: number) {
  return y0 * -(x - 1) * (x - 2) * (x - 3) / 6 + y1 * x * (x - 2) * (x - 3) / 2 - y2 * x * (x - 1) * (x - 3) / 2 + y3 * x * (x - 1) * (x - 2) / 6;
}
function PsdView({ codec, filePath, onReset, resetN, scroller, psd, names, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, th, ov, t0, t1, zoomBox, onPick, f, setF, fileName, save, exportRef, plotRef, toast }: CommonProps & { codec: string; filePath: string; onReset: () => void; resetN: number;
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
  /** ตรวจเพิ่มจากข้อมูลที่กราฟคิดแล้ว ไม่โหลดอะไรใหม่ · ทุกข้อบอกว่าน่าสงสัย */
  const checks = useMemo(() => {
    const out: { k: string; warn: boolean; b: string; d?: string; title: string; tip: string }[] = [];
    if (!psd) return out;
    const rate = psd.rate, binHz = psd.rate / psd.size, d = psd.db[0], at = (fr: number) => d[Math.max(0, Math.min(d.length - 1, Math.round(fr / binHz)))];
    const avg = (f0: number, f1: number) => { const i0 = Math.max(0, Math.floor(f0 / binHz)), i1 = Math.min(d.length - 1, Math.ceil(f1 / binHz)); let sum = 0, n = 0; for (let i = i0; i <= i1; i++) { sum += d[i]; n++; } return n ? sum / n : -150; };
    if (hum.length) out.push({ k: "hum", warn: true, b: `เสียงหึ่งจากไฟบ้าน (hum) ยอดแคบที่ ${[...new Set(hum.map((x) => x[2]))].sort((a, b) => a - b).join(" ")} Hz`, d: "มักมาจากสายไมค์หรือปลั๊กพ่วง แต่ในหนังอาจเป็นเสียงประกอบที่ตั้งใจใส่", title: "เสียงหึ่งจากไฟบ้าน", tip: "ไฟบ้านในไทยสั่น 50 ครั้งต่อวินาที (50 Hz) ถ้าสายเสียงรับไฟฟ้าเข้ามา จะได้เสียงหึ่งต่ำ ๆ เป็นยอดแคบที่ 50 100 และ 150 Hz ไฟล์จากอเมริกาและญี่ปุ่นบางส่วนเป็น 60 Hz และไม่ใช่เสียงคนฮัมเพลง" });
    // ขอบบนของเสียง เสียงสูงหายดิ่งเป็นเส้นตรง
    const top = topF, below = avg(top - 1500, top - 300), above = top + 1500 < nyq ? avg(top + 300, top + 1500) : -150, cliff = top > 1000 && top < nyq * 0.92 && below - above > 25;
    // อัปแซมเปิล ดูว่าเหนือ 25 kHz เงียบสนิทไหม ไม่ดูความดิ่ง เพราะตัวแปลงอัตราสุ่มทำให้เสียงค่อย ๆ จางจาก 20 ถึง 24 kHz (ลองกับไฟล์ที่แปลง 44.1 เป็น 96 kHz ด้วย ffmpeg เหนือ 24 kHz อยู่ที่ −140 dB)
    const hiBand = rate >= 88200 ? avg(25000, Math.min(40000, nyq * 0.9)) : 0, upsampled = rate >= 88200 && hiBand < -125 && avg(8000, 16000) > -105;
    if (upsampled) out.push({ k: "upsample", warn: true, b: `อาจเป็นไฟล์อัปแซมเปิล ไฟล์ ${(rate / 1000).toFixed(1)} kHz แต่ไม่มีเสียงเหนือ ${(top / 1000).toFixed(1)} kHz`, d: "น่าจะแปลงมาจากไฟล์ 44.1 หรือ 48 kHz ไม่ได้ละเอียดจริงตามตัวเลข", title: "อัปแซมเปิล", tip: "ไฟล์ความละเอียดสูง (88.2 ถึง 192 kHz) ที่ทำมาจริงมีเสียงเหนือ 22 kHz บ้าง ถ้าเสียงหยุดดิ่งที่ราว 22 ถึง 24 kHz พอดี มักเป็นไฟล์ 44.1 หรือ 48 kHz ที่แปลงตัวเลขให้สูงขึ้น ขนาดไฟล์ใหญ่ขึ้นแต่เสียงไม่ได้ดีขึ้น แต่เพลงบางเพลงก็ไม่มีเสียงสูงจริง จึงควรดูประกอบกับกราฟความถี่" });
    // เตือนไฟล์ไม่ลดคุณภาพปลอมเฉพาะชนิดไม่ลดคุณภาพ · MP3 AAC AC-3 ขอบบนตัดเป็นหน้าผาเป็นเรื่องปกติของชนิดนั้น
    // เดิมไม่รู้ชนิดเสียง เตือนไฟล์ MP3 AAC AC-3 ทุกไฟล์ และขัดกับหน้าความถี่ (AUDIT 12 พ.ย. 2569 ข้อ 21)
    else if (cliff && top >= 15000 && top <= 20600 && LOSSLESS_CODECS.includes(codec)) out.push({ k: "lossy", warn: true, b: `อาจเคยเป็น MP3 หรือ AAC มาก่อน เสียงสูงถูกตัดเป็นเส้นตรงที่ราว ${(top / 1000).toFixed(1)} kHz`, d: "ไฟล์ไม่ลดคุณภาพที่ทำจากต้นฉบับจริงไม่ควรถูกตัดดิ่งที่ 16 19 หรือ 20 kHz", title: "ไฟล์ไม่ลดคุณภาพปลอม", tip: "MP3 และ AAC ตัดเสียงสูงทิ้งเป็นเส้นตรงที่ราว 16 kHz เมื่อใช้ 128 kb/s และราว 19 ถึง 20 kHz เมื่อใช้ 320 kb/s ถ้าไฟล์ FLAC WAV หรือไฟล์ไม่ลดคุณภาพแบบอื่นมีรอยตัดแบบนี้ มักแปลงมาจาก MP3 หรือ AAC อีกที คุณภาพจึงไม่เกินต้นทาง ส่วนเสียงที่ค่อย ๆ จางลงตามธรรมชาติไม่นับ" });
    // เกือบโมโน ดูได้เมื่อมีเส้น S (โหมดซ้อนทุกช่องของไฟล์สองช่อง)
    const iM = series.findIndex((sr) => sr.key === "M"), iS = series.findIndex((sr) => sr.key === "S");
    if (iM >= 0 && iS >= 0) {
      const m = series[iM].d, sd = series[iS].d; let dm = 0, n = 0;
      for (let i = Math.round(100 / binHz); i < Math.min(m.length, Math.round(10000 / binHz)); i++) { dm += sd[i] - m[i]; n++; }
      const gap = n ? dm / n : 0;
      if (gap < -30) out.push({ k: "mono", warn: true, b: `เกือบเป็นโมโน เสียงข้าง (S) เบากว่าเสียงกลาง (M) ราว ${Math.round(-gap)} dB`, d: "ซ้ายกับขวาแทบเหมือนกัน อาจเป็นเสียงโมโนที่ทำเป็นสองช่อง", title: "เกือบเป็นโมโน", tip: "S คือส่วนที่ซ้ายกับขวาต่างกัน ถ้า S เบากว่า M เกิน 30 dB ทั้งย่าน แปลว่าสองช่องแทบเหมือนกัน ฟังแล้วเสียงไม่กว้าง มักเป็นไฟล์โมโนที่คัดลอกเป็นสองช่อง ดูข้อนี้ได้ในโหมดซ้อนทุกช่อง" });
    }
    // DC offset พลังงานกองที่ 0 Hz
    const dc = d[0], low = avg(20, 200);
    if (dc > -60 && dc - low > 15) out.push({ k: "dc", warn: true, b: `อาจมี DC offset พลังงานกองที่ 0 Hz (${minus(dc.toFixed(0))} dB)`, d: "คลื่นเสียงทั้งเส้นเยื้องจากศูนย์ อาจทำให้มีเสียงป๊อกตอนเริ่มหรือตัดต่อ", title: "DC offset", tip: "คลื่นเสียงปกติแกว่งรอบศูนย์ ถ้าทั้งเส้นเยื้องขึ้นหรือลง (DC offset) จะเห็นพลังงานสูงที่ 0 Hz มักมาจากอุปกรณ์อัดเสียงที่ปรับไม่ดี และแก้ได้ด้วยตัวกรองตัดความถี่ต่ำมาก" });
    // ไม่พบอะไร เหลือบรรทัดสั้นบรรทัดเดียว รายละเอียดอยู่ใน ⓘ (พี่กันทัก "กินที่จัง ที่บอกไม่มีอะไร่นาสงสัย")
    if (!out.length) out.push({ k: "ok", warn: false, b: "ไม่พบอะไรน่าสงสัย", title: "สิ่งที่ตรวจ", tip: (iS >= 0 ? "" : "เรื่องเกือบเป็นโมโนดูได้ในโหมดซ้อนทุกช่อง ") + "ตรวจจากกราฟความถี่เฉลี่ยของช่วงที่เลือก 5 อย่าง ได้แก่ เสียงหึ่งจากไฟบ้าน ไฟล์ไม่ลดคุณภาพปลอม อัปแซมเปิล เกือบเป็นโมโน และ DC offset ทุกข้อเป็นแค่สิ่งที่น่าสงสัย ไม่ได้ตัดสินเด็ดขาด" });
    void at;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [psd, hum, series]);
  // ซูมแกนนอน (แกนความถี่) hr.z เท่า ขอบซ้ายของช่วงที่เห็น hr.b เป็นสัดส่วนบนแกน (พี่กันถาม 9 พ.ย. 2569 "แล้วซูมแนวนอนหายไปไหน")
  const hr = useVRange(resetN);
  const uOf = (fr: number) => (psdLog ? (Math.log10(Math.max(fr, 20)) - Math.log10(20)) / (Math.log10(nyq) - Math.log10(20)) : fr / nyq);
  const X = (fr: number, w: number) => PSM.L + (uOf(fr) - hr.b) * hr.z * (w - PSM.L - PSM.R);
  /* หน้าตาแบบ Audacity (พี่กันส่งภาพหน้าต่าง Frequency Analysis ของ Audacity มา 7 พ.ย. 2569 *"กราฟมันยังไม่เหมือนใน audicity เลย"*)
     ระบายทึบสีเดียวใต้เส้น · แกน dB ปรับตามเสียงจริง ขีดทุก 6 dB · เส้นตารางถี่ทุกหลัก (20 30 40 … 100 200 300 …) เปิดปิดได้
     ช่วง dB เลือกได้ (แทนแถบซูมแนวตั้งของ Audacity) · บอกค่าที่ชี้กับยอดใกล้สุดในช่องใต้กราฟ วงกลมที่ยอด */
  const [grids, setGrids] = useState(true);
  // สีทึบใต้เส้น ใช้กับทุกโหมด ค่าตั้งต้นปิด (แคลร์ตั้ง หลายเส้นซ้อนแล้วสีขุ่น) · BUGS ข้อ 20 พี่กัน "ให้มีตัวเลือกในนี้เลยว่าจะเเสดงสีทึบไหม"
  const [fill, setFillRaw] = useState(() => { try { return localStorage.getItem("graph-psd-fill") === "1"; } catch { return false; } });
  const setFill = (v: boolean) => { setFillRaw(v); try { localStorage.setItem("graph-psd-fill", v ? "1" : "0"); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } };
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
      if (fill) { g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, drawn.length)); for (const { s, area } of drawn) { g.fillStyle = s.color; g.fill(area); } }
      g.globalAlpha = 1; g.lineWidth = 1.5; g.lineJoin = "round"; for (const { s, line } of drawn) { g.strokeStyle = s.color; g.stroke(line); }
    } else if (series.length === 1) {
      // ระบายทึบสีเดียวจากเส้นลงถึงพื้นกราฟ แบบ Audacity · สีกลางของชุดสี (ชุดม่วงใกล้สีของ Audacity)
      // ค่าทีละจุดภาพ (valRange) ไม่ใช่ทีละช่องความถี่
      const s = series[0], area = new Path2D(); area.moveTo(L, T + PH);
      for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
      area.lineTo(L + PW, T + PH); area.closePath();
      if (fill) g.fillStyle = th.ramp[4], g.fill(area);
      else { const ln = new Path2D(); for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) ln.lineTo(L + x + 0.5, y); else ln.moveTo(L + 0.5, y); } g.strokeStyle = th.ramp[5] ?? th.rms; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke(ln); }
      // เส้นตารางเส้นเดิมวาดซ้ำเฉพาะในพื้นสี ขาวโปร่ง อ่อนกว่าเส้นบนพื้นขาว
      if (grids && fill) {
        g.save(); g.clip(area); g.lineWidth = 1;
        for (const [x1, y1, x2, y2, strong] of gl) { g.strokeStyle = strong ? "rgba(255,255,255,.34)" : "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }
        g.restore();
      }
    } else {
      // เทียบซ้ายขวา (ของเราเพิ่มเอง Audacity ไม่มี) เป็นเส้นสองสีตามช่อง
      if (fill) for (const s of shown) {
        const area = new Path2D(); area.moveTo(L, T + PH);
        for (let x = 0; x < PW; x += stp) area.lineTo(L + x + 0.5, Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))));
        area.lineTo(L + PW, T + PH); area.closePath(); g.globalAlpha = 1 - Math.pow(0.55, 1 / Math.max(1, shown.length)); g.fillStyle = s.color; g.fill(area); g.globalAlpha = 1;
      }
      for (const s of shown) {
        g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
        for (let x = 0; x < PW; x += stp) { const y = Y(valRange(s.d, fAt(x, PW), fAt(x + stp, PW))); if (x) g.lineTo(L + x + 0.5, y); else g.moveTo(L + 0.5, y); }
        g.stroke();
      }
    }
    if (rising) g.restore();
    g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(L + 0.5, T + 0.5, PW - 1, PH - 1);
  }, [rise, hr.z, hr.b, vr.z, vr.b, psd, psdLog, th, series, off, grids, range, top, fill]);
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
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT;
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
  // ช่วงความถี่ที่ซูมอยู่ บอกข้างแถบซูม (BUGS ข้อ 16 ซูมแล้วงงว่าซูมอะไร แกนนอนหน้านี้คือความถี่ ไม่ใช่เวลา)
  const fL = psdLog ? 20 * Math.pow(nyq / 20, hr.b) : hr.b * nyq, fR = psdLog ? 20 * Math.pow(nyq / 20, hr.b + 1 / hr.z) : (hr.b + 1 / hr.z) * nyq;
  const khz = (x: number) => (x >= 1000 ? `${+(x / 1000).toFixed(x >= 10000 ? 0 : 1)}k` : `${Math.round(x)}`);
  const hzoomBox = (
    <span className="zbtns" data-psdhzoom>
      <span className="lbl">ซูม</span>
      <span className={"lbl" + (hr.z > 1.01 ? "" : " all")} data-psdhzrange title="ช่วงความถี่ที่เห็นอยู่บนแกนนอน">{hr.z > 1.01 ? `${khz(fL)}–${khz(fR)} Hz` : "ทุกความถี่"}</span>
      <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
      <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
      <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
    </span>
  );
  // แถวขวาของหัวกราฟเรียงแบบเดียวกับมุมมองอื่น คำว่าซูมนำหน้าเส้นเลื่อน เส้นแบ่งกั้นกลุ่ม ปุ่มรีเซ็ตท้ายสุด
  // (เดิมไม่มีคำว่าซูมและเส้นแบ่ง ปุ่มรีเซ็ตอยู่กลางแถว เจอตอนไล่หัวกราฟทุกมุมมองหลังพี่กันทักเรื่องแบ่งกลุ่ม 13 พ.ย. 2569)
  const resetBtn = <button type="button" className="zb" aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset onClick={onReset}><IcRefresh size={15} /></button>;
  const opts: [string, string][] = names.length === 1 ? [["mix", label(names, names[0]).code]] : [["mix", "รวมทุกช่อง"], ...(names.includes("FR") ? [["FL", label(names, "FL").code], ["FR", label(names, "FR").code], ["lr", "เทียบซ้ายขวา"]] as [string, string][] : []), ["all", "ซ้อนทุกช่อง"]];
  return (
    <div className="plot" data-plot ref={plotRef as React.RefObject<HTMLDivElement>}>
      <div className="plotstick">
      {/* แถบซูมแกนความถี่อยู่แถวบนเหมือนมุมมองอื่น · แถวไม่พอ ปุ่มช่องเป็นดรอปดาวน์ (BUGS ข้อ 15 พี่กัน "ทำไม … ปุ่มซูมเเนวนอนไปอยุ่ด้านล่าง" · "ถ้าไม่พอ ไปเปลี่ยนตามรูป ให้เป็นดรอปดาว") */}
      <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}><b>ความถี่เฉลี่ย</b>
        <span className="psdch-seg"><div className="seg sm">{opts.map(([k, l]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-psdch={k}>{l}</button>)}</div></span>
        <span className="psdch-dd" data-psdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={opts.map(([value, l]) => ({ value, label: l }))} /></span></span>
        <span className="psdright" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", minWidth: 0 }}>{hzoomBox}<span className="fsep" aria-hidden="true" />{zoomBox}<span className="fsep" aria-hidden="true" />{resetBtn}</span></div>
      <Overview ov={ov} th={th} t0={t0} t1={t1} onPick={onPick} left={52} caption={t1 - t0 >= ov.duration - 0.01 ? `เฉลี่ยทั้งไฟล์ ${tfmt(ov.duration)}` : `ช่วงที่เอามาเฉลี่ย ${tfmtD(t0, spanDigits(t1 - t0))}–${tfmtD(t1, spanDigits(t1 - t0))}`} />
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
      {/* ช่องบอกค่าใต้กราฟ แบบ Cursor กับ Peak ของ Audacity */}
      <div className="psdread" data-psdreadout>
        {/* ป้ายสีเส้นย้ายมาแทนที่แถบซูมเดิม ปุ่มเล็กลง ยังกดซ่อนแสดงเส้นได้ (BUGS ข้อ 19 พี่กัน "งั้นย้ายไปเเทนที่เเถบซูมเเนวนอน" · "อ๋อ มันคือปุ่มกด") · ⓘ อธิบาย M S (ข้อ 21) */}
        {series.length > 1 && <span className="psdlg" style={{ order: 9, marginLeft: "auto" }} data-psdlegend>{series.map((sr) => {
          const on = !off.includes(sr.key), last = on && shown.length === 1;
          return <button key={sr.key} type="button" className={"psdk" + (on ? " on" : "")} aria-pressed={on} aria-disabled={last || undefined}
            title={last ? "ต้องเหลืออย่างน้อยหนึ่งเส้น" : on ? `กดเพื่อซ่อน ${sr.long}` : `กดเพื่อแสดง ${sr.long}`} data-psdkey={sr.key}
            onClick={() => { if (!last) setOff((o) => (on ? [...o, sr.key] : o.filter((k) => k !== sr.key))); }}>
            <i style={on ? { background: sr.color, borderColor: sr.color } : { borderColor: sr.color }} />{sr.long}</button>;
        })}{series.some((sr) => sr.key === "M") && <InfoTip title="M กับ S คืออะไร" tip={MS_TIP} />}</span>}
        <span className="lbl">ตำแหน่งชี้</span>
        <span className="psdbox" data-psdcursor>{psd && f == null ? "ชี้ที่กราฟเพื่อดูค่า" : psd ? `${hzTxt(cur)} (${noteOf(cur)}) = ${shown.map((s) => (series.length > 1 ? s.name + " " : "") + minus(Math.round(valAt(s.d, cur)).toString()) + " dB").join(", ")}` : "—"}</span>
        <span className="lbl">ยอดใกล้สุด</span>
        <span className="psdbox" data-psdpeak>{pk ? `${hzTxt(pk[0])} (${noteOf(pk[0])}) = ${minus(pk[1].toFixed(1))} dB` : "—"}</span>
      </div>
      {/* ผลตรวจ บอกว่าน่าสงสัย ไม่ตัดสินเด็ดขาด ทุกข้อมีปุ่ม ⓘ (BUGS ข้อ 25 พี่กัน "เราคิดว่ามันคือฮัมเพลง ต้อเปลี่ยนคำ" · ตรวจเพิ่ม 4 อย่าง พี่กันเคาะ "ได้") */}
      {psd && <div className="psdchecks" data-psdchecks data-top={Math.round(topF)}>{checks.map((c) => (
        <div key={c.k} className={"stat " + (c.warn ? "warn" : "info") + (c.d ? "" : " slim")} data-psdcheck={c.k}>{c.warn ? WARN : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>}
          <div className="psdck-txt" title={c.d ? `${c.b} ${c.d}` : c.b}><b>{c.b}</b>{c.d && <span> {c.d}</span>}</div><InfoTip title={c.title} tip={{ w: c.tip }} /></div>))}</div>}
      <div className="small" style={{ marginTop: 6 }}>{psd ? `เสียงสูงสุดที่มีราว ${(topF / 1000).toFixed(1)} kHz ใน` : ""}ช่วงที่เลือก {tfmtD(t0, spanDigits(t1 - t0))} ถึง {tfmtD(t1, spanDigits(t1 - t0))} และกดที่แถบบนเพื่อย้ายช่วงได้</div>
      {/* แต่ละตัวเลือกจับคู่กับปุ่ม ⓘ ของมัน ตกบรรทัดแล้วไม่แยกกัน (เจอตอนตรวจภาพ ⓘ ของเส้นตารางหลุดไปต้นบรรทัดใหม่) */}
      <div className="agfoot"><div className="psdopts" style={{ display: "flex", alignItems: "center", columnGap: 14, rowGap: 6, flexWrap: "wrap" }}>
        <span className="psdopt"><span className="lbl">แกนความถี่</span><InfoTip title="แกนความถี่" tip={PSD_TIPS.axis} />
        <div className="seg sm"><button type="button" className={psdLog ? "on" : ""} onClick={() => setPsdLog(true)} data-psdaxis="log">Log</button><button type="button" className={!psdLog ? "on" : ""} onClick={() => setPsdLog(false)} data-psdaxis="lin">Linear</button></div></span>
        <span className="psdopt"><span data-psdsize title="ยิ่งมากยิ่งแยกความถี่ละเอียด แต่ช้าลง"><Dropdown label="ความละเอียด" value={String(psdSize)} onChange={(v) => setPsdSize(Number(v))}
          options={[1024, 4096, 16384].map((n) => ({ value: String(n), label: `ความละเอียด ${n.toLocaleString("en-US")}` }))} /></span><InfoTip title="ความละเอียด" tip={PSD_TIPS.size} /></span>
        <span className="psdopt"><span className="lbl">ช่วง</span>
        <div className="seg sm">{[60, 90, 120].map((r) => <button key={r} type="button" className={range === r ? "on" : ""} onClick={() => setRange(r)} data-psdrange={r}>{r} dB</button>)}</div><InfoTip title="ช่วง dB" tip={PSD_TIPS.range} /></span>
        <span className="psdopt"><span className="lbl">เส้นตาราง</span><span data-psdgrid style={{ display: "inline-flex" }}><Switch on={grids} onChange={setGrids} label="เส้นตาราง" /></span><InfoTip title="เส้นตาราง" tip={PSD_TIPS.grid} /></span>
        <span className="psdopt"><span className="lbl">สีทึบใต้เส้น</span><span data-psdfill style={{ display: "inline-flex" }}><Switch on={fill} onChange={setFill} label="สีทึบใต้เส้น" /></span><InfoTip title="สีทึบใต้เส้น" tip={PSD_TIPS.fill} /></span></div>
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
/** เวลาที่ใช้ไปตั้งแต่เริ่มอ่าน เดินทุกวินาที ความกว้างคงที่ ตัวเลขเปลี่ยนแล้วข้อความข้าง ๆ ไม่ขยับ
 *  (BUGS ข้อ 145 พี่กันสั่ง 16 พ.ย. 2569 "ใส่เวลาที่กำลังวิ่ง% ไว้ด้วย") */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const t = s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return <span data-graph-elapsed>ใช้ไป <FixedTime t={t} longest="00:00" /></span>;
}

type Side = { info: GInfo | null; ov: GOverview | null; err: string | null; pct: number | null; since?: number };
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
  for (const { x: s, label } of rulerTicks(t0, t1, 8)) { const x = L + pw * (s - t0) / (t1 - t0 || 1); g.fillText(label, x, T + ph + 8); g.fillRect(Math.round(x), T + ph, 1, 4); }
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
  return <div className={"stat " + kind} title={b + " " + d} data-cmpstat data-psdverdict><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">{kind === "warn" ? <><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17v.5" /></> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>}</svg><div><b>{b}</b><Phr>{d}</Phr></div></div>;
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

export function CompareView({ files, tracks, note, free, onFiles, onSingle, onBack, onClose }: { files: string[]; tracks?: Record<string, number>; note?: string; free?: boolean; onFiles: (files: string[], freed?: boolean) => void; onSingle: (p: string) => void; onBack: () => void; onClose: () => void }) {
  const n = files.length;
  const trOf = (p: string) => tracks?.[p] ?? 0;
  LABELS = files.map((_, i) => (!free && i < 2 ? ["ต้นฉบับ", "หลังแปลง"][i] : `ไฟล์ ${i + 1}`));
  CONV = !free && n === 2;
  const allTxt = n === 2 ? "สองไฟล์" : `ทั้ง ${n} ไฟล์`;
  useFitClass(".ag[data-graph] .plothead");
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
          patch(p, { info, pct: 0, since: Date.now() });
          const ov = await overviewOnce(p, trOf(p)); if (!live) return;
          patch(p, { ov, pct: null, err: ov ? null : "หยุดอ่านเสียงแล้ว" });
        } catch (e) { if (live) patch(p, { err: String(e), pct: null }); }
        if (live) readDone.current.add(p);
      }
    })();
    return () => { live = false; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey]);

  const S = files.map((p) => sides[p] ?? EMPTY);
  const T = S.map((s, i) => s.info?.tracks[trOf(files[i])] ?? s.info?.tracks[0]);
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
    if (files.some((p) => p.toLowerCase() === f.toLowerCase())) { toast({ kind: "warn", ms: 6000, key: "graph-pick", title: "ไฟล์นี้อยู่ในการเทียบแล้ว" }); return; }
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
          if (!p) { p = await graphApi.psd(files[i], trOf(files[i]), psdT[0], end, series(NM[i]), size, null); if (!live || !p) return; memPut(psdMem.current, mem, p, 24); }
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
    const base = (p: string) => nameOf(p).replace(/\.[^.]+$/, ""), vName = CMP_VIEWS.find(([k]) => k === tab)?.[1] ?? "กราฟเสียง";
    const where = await imgTarget(files[0], imgName(base(files[0]) + " เทียบ " + base(files[1]) + (n > 2 ? " และอีก " + (n - 2) + " ไฟล์" : ""), vName, o), o); if (!where) return;
    setSaving(true);
    try {
      await waitPaint();
      if (tab !== "loud" && tab !== "psd") {
        const got: Record<string, GWindow> = {}, cols = Math.min(8192, o.width || Math.round((plotRef.current?.clientWidth ?? 1000) * screenK()));
        for (let i = 0; i < n; i++) {
          const end = Math.min(t1, S[i].ov?.duration ?? t1);
          if (end <= t0) continue;
          const w = await graphApi.window(files[i], trOf(files[i]), t0, end, cols, 512, false, true);
          if (!w) throw new Error("การอ่านถูกยกเลิก");
          got[files[i]] = w;
        }
        flushSync(() => setHiC(got));
      }
      let cv = composeAll(plotRef.current, o.width);
      if (!cv) throw new Error("ยังไม่มีกราฟให้บันทึก");
      if (o.title) cv = withHeader(cv, vName + " เทียบ " + n + " ไฟล์", files.map((p, i) => LABELS[i] + " " + nameOf(p)).join("   "), files.map((_, i) => [LABELS[i], FILE_C[i]] as [string, string]));
      await waitPaint();
      const saved = await graphApi.saveImage(where, alphaOf(cv, o).toDataURL("image/png"), o);
      toast({ kind: "ok", title: "บันทึกรูปแล้ว " + saved.width.toLocaleString("en-US") + " × " + saved.height.toLocaleString("en-US") + " ขนาด " + fmtSize(saved.size), detail: saved.path });
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
          <div className="meta">{s.info ? `${s.info.audioOnly ? "ไฟล์เสียง" : "ไฟล์หนัง"} ${fmtSize(s.info.size)} ยาว ${tfmt(s.info.duration)}${i === 1 && note ? " แปลงเมื่อสักครู่" : ""}${s.info.tracks.length > 1 && T[i] ? ` เสียง ${T[i]!.index + 1}${T[i]!.lang ? " " + T[i]!.lang : ""}` : ""}` : s.err ? "อ่านไม่ได้" : "กำลังอ่านข้อมูลไฟล์"}</div>
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
      <div className="seg agviews">{CMP_VIEWS.map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => switchTab(k)} data-cmptab={k} disabled={k === "cmp" && !common.length}
        title={k === "cmp" && !common.length ? `${allTxt}ไม่มีช่องเสียงที่ตรงกัน` : undefined}>{VIEW_ICON[k]}{l}</button>)}</div>
      <div className="lg" style={{ marginLeft: "auto" }}>{fileLg}</div>
      <button type="button" className={"btn btn-ghost btn-sm" + (wide ? " pressed" : "")} style={{ width: 32, padding: 0, flex: "none" }} aria-pressed={wide} title={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} aria-label={wide ? "แสดงแผงลำโพง" : "ขยายเต็มจอ"} onClick={() => setWide(!wide)} data-graphwide><IcExpand size={14} /></button>
    </div>
  );
  const infoRow = (t: GTrack | undefined, info: GInfo | null) => t && info ? [t.codec, chText(t.layout), `${khz(t.rate)} kHz`, t.bits ? `${t.bits}-bit` : "—", t.bitrate ? `${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : "—", fmtSize(info.size), tfmt(info.duration)] : null;
  const infos = S.map((s, i) => infoRow(T[i], s.info));
  const diffRows: [string, string, (d: DiffResult) => number, string[]][] = [["wave", "รูปคลื่น", (d) => d.wave, ["wave"]], ["spec", "ความถี่", (d) => d.spec, ["spec", "spek"]], ["loud", "ความดัง", (d) => d.loud, ["loud"]], ["cmp", "ซ้อนเทียบ", (d) => d.cmp, ["cmp"]], ["psd", "ความถี่เฉลี่ย", (d) => d.psd, ["psd"]]];
  const others0 = files.map((_, i) => i).slice(1);
  const sizeTxt = (i: number, long: boolean) => {
    const a = S[0].info?.size ?? 0, b = S[i].info?.size ?? 0;
    if (!a || !b) return "—";
    if (a === b) return "เท่ากัน";
    const pct = Math.abs(b - a) / a * 100, p = pct < 0.1 ? "ไม่ถึง 0.1%" : pct.toFixed(1) + "%";
    return long ? `${b < a ? "เล็กกว่า" : "ใหญ่กว่า"} ${p} หรือ ${fmtSize(Math.abs(b - a))}` : (b < a ? "−" : "+") + p;
  };
  const panel = (
    <div className="apanel">
      <div className="card"><h3><span>ช่องเสียง {chText(T[0]?.layout)}</span><span className="small" style={{ color: "var(--txt3)" }}>{union.length} ช่อง</span></h3>
        {NM[0].length > 0 && <Speakers names={union} th={TH_A} levels={union.map(() => 0.3)} hidden={hidden} onToggle={toggleCh} />}
        <div className="small" style={{ textAlign: "center", marginTop: 4 }}>{union.length > 1 ? <Phr>{`กดลำโพงเพื่อปิดหรือเปิดช่องนั้นของ${n === 2 ? "ทั้งสองไฟล์" : allTxt}พร้อมกัน`}</Phr> : "ไฟล์นี้มีเสียงช่องเดียว"}</div>
        {T.every(Boolean) && NM.some((x) => x.join() !== NM[0].join()) && <div className="small" style={{ marginTop: 4 }}>ช่องเสียงไม่เท่ากัน {T.map((t, i) => `${LABELS[i]} ${t!.layout}`).join(" ")}</div>}</div>
      {diffs && <div className="card gdiff" data-cmpdiff>
        {n === 2
          ? <><h3><span>ต่างกันกี่ %</span><b data-cmpdiffall title="ค่าเฉลี่ยของทุกกราฟ">{diffs[0].overall.toFixed(1)}%</b></h3>
            {diffRows.map(([k, l, get, on]) => { const v = get(diffs[0]); return <div key={k} className={"row" + (on.includes(tab) ? " on" : "")} data-cmpdiffrow={k}><span>{l}</span><i><u style={{ width: Math.max(0, Math.min(100, v)) + "%" }} /></i><em>{v.toFixed(1)}%</em></div>; })}
            <div className="sizerow" data-cmpdiffsize title={`ขนาด${LABELS[1]}เทียบกับ${LABELS[0]} ไม่นับรวมในเปอร์เซ็นต์ด้านบน`}><span>ขนาดไฟล์</span><em><Phr>{sizeTxt(1, true)}</Phr></em></div></>
          : <><h3><span>ต่างจาก{LABELS[0]}กี่ %</span></h3>
            <div className="gdiffgrid" style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${n - 1}, auto)` }}>
              <span />{diffs.map((_, k) => <span key={k} className="h" style={{ color: FILE_INK[k + 1] }}>{LABELS[k + 1]}</span>)}
              <span className="all">รวม</span>{diffs.map((d, k) => <b key={k} data-cmpdiffall={k}>{d.overall.toFixed(1)}%</b>)}
              {diffRows.map(([k, l, get, on]) => { const cls = on.includes(tab) ? "on" : ""; return <Fragment3 key={k} cls={cls} k={k} l={l} vals={diffs.map((d) => get(d).toFixed(1) + "%")} />; })}
              <Fragment3 cls="" k="size" l="ขนาดไฟล์" vals={others0.map((i) => sizeTxt(i, false))} />
            </div></>}
        <div className="gdiffnote" title={`ผลต่าง 60 dB คิดเป็น 100% และ 0% ไม่ได้แปลว่าเหมือนทุกบิต เพราะคิดจากข้อมูลภาพรวม${diffs.some((d) => d.lenDiff) ? " ไฟล์ยาวไม่เท่ากัน จึงเทียบเท่าช่วงที่มีทั้งคู่" : ""}`}><Phr>{"ผลต่าง 60 dB คิดเป็น 100%\nและ 0% ไม่ได้แปลว่าเหมือนทุกบิต"}</Phr></div></div>}
      <div className="card"><h3>ข้อมูลเสียง</h3>
        <div className="ginfo" style={{ gridTemplateColumns: `auto repeat(${n}, auto)` }} data-cmpinfo><span />{files.map((p, i) => <span key={p} className="h" style={{ color: FILE_INK[i] }}>{LABELS[i]}</span>)}
          {["รหัสเสียง", "ช่องเสียง", "อัตราสุ่ม", "ความละเอียด", "บิตเรต", "ขนาด", "ความยาว"].map((k, r) => <FragmentInfo key={k} k={k} vals={infos.map((x) => x?.[r] ?? "…")} />)}</div>
        {note && <div className="small" style={{ marginTop: 8 }}><Phr>{note}</Phr></div>}</div>
      {lenDiff && <div className="stat warn" data-cmplen><CardIcon kind="warn" /><div><b>{`${allTxt}ยาวไม่เท่ากัน ${lens.map(tfmt).join(" กับ ")}`}</b><Phr>{CONV ? "น่าจะตั้งความเร็วเสียงตอนแปลง จึงเทียบรูปคลื่น ความดัง และซ้อนเทียบตามเวลาตรง ๆ ไม่ได้ ให้ดูความถี่เฉลี่ยกับกราฟความถี่แทน" : "กราฟเรียงจากต้นไฟล์ตามเวลา ไฟล์ที่สั้นกว่าจึงจบก่อน"}</Phr></div></div>}
    </div>
  );

  let body: React.ReactNode;
  const errAt = S.findIndex((s) => s.err);
  if (errAt >= 0) {
    body = <div className="plot"><div className="stat bad"><CardIcon kind="bad" /><div><b>อ่าน{LABELS[errAt]}ไม่ได้</b><Phr>{S[errAt].err ?? ""}</Phr></div></div></div>;
  } else if (!ready) {
    const at = Math.max(0, S.findIndex((s) => !s.ov)), pct = S[at].pct ?? 0, since = S[at].since;
    body = (
      <div className="plot" data-cmploading>
        <div style={{ fontSize: 13.5, marginBottom: 8 }}>อ่านเสียง{LABELS[at]} <b>{Math.round(pct)}%</b>{since != null && <> <Elapsed since={since} /></>} อ่านทีละไฟล์ตามลำดับ</div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <LoadLanes n={files.length * 2} />
      </div>
    );
  } else {
    const OV = S.map((s) => s.ov!);
    const others = files.map((_, i) => i).slice(1);
    // แถบซูมเรียงแบบเดียวกับหน้าไฟล์เดียว คำว่าซูมนำหน้า เส้นแบ่งกั้นปุ่มรีเซ็ต หัวกราฟแคบปุ่มช่วงซูมเป็นดรอปดาวน์
    // (พี่กันทัก 13 พ.ย. 2569 "แบ่งถูกละเหรอ ทำไปเเยำคำว่าซูมออก" · "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก" · หน้าเทียบมีแถบของตัวเองแยก เจอตอนไล่ทุกหน้า)
    const pickCmpZoom = (v: string) => { const k: number | "all" = v === "all" ? "all" : Number(v); setZoom(k); if (k !== "all" && zoom === "all") setCenter(Math.min(dur / 2, 60)); };
    const zoomBar = (
      <span className="zoombox" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="lbl">ซูม</span>
        <span className="zbtns">
          <button type="button" className="zb" onClick={() => setSpan(span * 2)} disabled={zoom === "all"} aria-label="ซูมออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)" data-zoomout><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
          <HZoom dur={dur} span={span} onSpan={setSpan} />
          <button type="button" className="zb" onClick={() => setSpan(span / 2)} disabled={span <= HZ_MIN} aria-label="ซูมเข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)" data-zoomin><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        </span>
        <span className="zseg"><div className="seg sm">{ZOOMS.map(([k, l]) => <button key={String(k)} type="button" className={String(zoom) === String(k) ? "on" : ""} onClick={() => pickCmpZoom(String(k))} data-cmpzoom={String(k)}>{l}</button>)}</div></span>
        <span className="zdd" title={`ช่วงที่ดูยาว ${tfmtD(span, spanDigits(span))}`} data-zoomdd><Dropdown label="ช่วงซูม" value={String(zoom)} onChange={pickCmpZoom} keepLeftOf={spekEdge}
          options={ZOOMS.map(([k, l]) => ({ value: String(k), label: l }))} display={(o) => o?.label ?? tfmtD(span, spanDigits(span))} /></span>
        <span className="fsep" aria-hidden="true" />
        <button type="button" className="zb" onClick={zoomReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้ง 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button></span>
    );
    const foot = (lg: React.ReactNode) => (
      <div className="agfoot"><div className="lg">{lg}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{files.map((p, i) => <button key={p} type="button" className="btn btn-ghost btn-sm" onClick={() => play(p)}><IbPlay size={15} /><span>เปิด{LABELS[i]} {p.match(/\.([^.\\/]+)$/)?.[1].toUpperCase() ?? ""} ที่ <FixedTime t={tfmt(playFrom)} longest={tfmt(dur)} /></span></button>)}<SaveBtn onClick={saveImage} /></div></div>
    );
    const Ruler = () => (
      <TimeRuler t0={t0} t1={t1} left={96} right={30} />
    );
    const edges = OV.map((ov, i) => edgeAll(ov, NM[i], nyq[i]));
    const ea = edges[0], eb = edges[1];
    const cutNote = n === 2
      ? (eb.top < ea.top - 1500 && !eb.full
        ? { kind: "info" as const, b: `${LABELS[1]}ไม่มีเสียงเหนือ ${khz(eb.top)} kHz`, d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz${ea.top > 20000 ? " ซึ่งหูคนไม่ได้ยิน (หูได้ยินถึงราว 20 kHz)" : ""} ส่วนช่วงที่ต่ำกว่านั้นภาพแทบเหมือนกัน` }
        : { kind: "info" as const, b: "ช่วงความถี่ของสองไฟล์ใกล้เคียงกัน", d: `${LABELS[0]}มีเสียงถึงราว ${khz(ea.top)} kHz และ${LABELS[1]}ราว ${khz(eb.top)} kHz` })
      : { kind: "info" as const, b: `ช่วงความถี่${allTxt}`, d: edges.map((e, i) => `${LABELS[i]} ราว ${khz(e.top)} kHz`).join(", ") };
    const nLanes = union.reduce((sum, c) => sum + NM.filter((x) => x.includes(c)).length, 0);
    // 205 คือหัวกราฟ แถวเวลา แถบเลื่อน ผลสรุป แถวปุ่มท้าย ระยะขอบรวมกัน (วัดจากหน้าจริง)
    const laneH = Math.max(union.length > 4 ? 40 : 46, Math.floor((paneH - 205 - (nLanes - 1) * 6) / Math.max(1, nLanes)));
    const colors = lut(THEMES["ชมพู"].ramp);
    if (tab === "wave" || tab === "spec") {
      const lanes = union.flatMap((c) => files.flatMap((_, f) => {
        const names = NM[f], ov = OV[f], i = names.indexOf(c);
        if (i < 0) return [];
        const l = label(names, c), pk = ov.peaks[i], k = "abcd"[f];
        const peak = pk == null ? "" : pk <= -119 ? "เงียบทั้งไฟล์" : "ดังสุด " + pkTxt(pk);
        const tog = { onToggle: () => toggleCh(c), last: vis.length <= 1 };
        if (hidden.includes(c)) return [<LaneOff key={c + k + "off"} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} {...tog} />];
        return [tab === "wave"
          ? <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, vz, f, hiC[files[f]]]}
              draw={(g, w, h) => { const hi = hiC[files[f]]; drawWave(g, w, h, sample(hi ? { env: hi.env, cols: hi.cols, t0: hi.t0, t1: hi.t1 } : { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration }, i, t0, t1, w), TH_FILE[f], "fine", vz); }} />
          : <Lane key={c + k + tab} {...tog} code={l.code} th={`${l.th} ${LABELS[f]}`} peak={peak} height={laneH} deps={[ov, t0, t1, i, laneH, maxNyq, vrSpec.z, vrSpec.b, hiC[files[f]]]}
              draw={(g, w, h) => drawSpecCmp(g, w, h, i, ov, t0, t1, nyq[f], maxNyq, colors, vrSpec.z, vrSpec.b, hiC[files[f]])} />];
      }));
      const pks = OV.map((ov) => Math.max(...ov.peaks));
      const over = others.find((i) => pks[i] > -0.05 && pks[i] > pks[0] + 0.05);
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview={tab}>
          <div className="plotstick"><div className="plothead"><span><b>{tab === "wave" ? "รูปคลื่นทุกช่อง" : "ความถี่ทุกช่อง"}</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
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
              ? <Stat kind="warn" b={`ดังสุดของ${LABELS[over]}ขึ้นเป็น ${pkTxt(pks[over])}`} d={`${LABELS[0]} ${pkTxt(pks[0])}${CONV ? " เพราะการแปลงแบบเสียคุณภาพทำให้ยอดคลื่นขยับเล็กน้อย" : ""} ดูแท็บความดังว่าเกิน 0 ช่วงไหน`} />
              : <Stat kind="info" b={`รูปคลื่นของ${allTxt}`} d={`ดังสุด ${pks.map((p, i) => `${LABELS[i]} ${pkTxt(p)}`).join(", ")}`} />)
            : <Stat {...cutNote} />}
        {foot(tab === "wave" ? <><span>{TH_FILE.slice(0, n).map((x, i) => <i key={i} style={{ background: x.peak }} />)}ดังสุด (Peak)</span><span>{FILE_INK.slice(0, n).map((x, i) => <i key={i} style={{ background: x }} />)}ดังเฉลี่ย (RMS)</span></>
            : <><span className="nw">−120 dB</span><span className="rampbar" style={{ background: `linear-gradient(90deg,${THEMES["ชมพู"].ramp.join(",")})` }} /><span className="nw">0 dB</span></>)}
          </div>
      );
    } else if (tab === "loud") {
      const hot = others.find((i) => (OV[i].truePeak ?? -99) >= 0);
      const rows: { k: string; v: string[]; note: string; bad: boolean[] }[] = [
        { k: "ความดังรวม", v: OV.map((o) => `${f1(o.integrated)} LUFS`), note: "ทั้งไฟล์ ตามมาตรฐาน EBU R128", bad: [] },
        { k: "ดังสุด (True Peak)", v: OV.map((o, i) => `${i && (o.truePeak ?? -99) > 0 ? "+" : ""}${f1(o.truePeak)} dBTP`), note: hot != null ? LABELS[hot] + "ถึงหรือเกิน 0" : `ไม่ถึง 0 ${allTxt}`, bad: OV.map((o, i) => i > 0 && (o.truePeak ?? -99) >= 0) },
        { k: "ช่วงความดัง", v: OV.map((o) => `${f1(o.lra)} LU`), note: "ห่างระหว่างช่วงเบากับช่วงดัง", bad: [] },
        { k: "ช่วงเงียบผิดปกติ", v: OV.map((o) => (o.silences.length ? `${o.silences.length} ช่วง` : "ไม่พบ")), note: "เงียบทุกช่องเกิน 1 วินาที", bad: OV.map((o, i) => i > 0 && o.silences.length > OV[0].silences.length) },
      ];
      const luDiffs = others.map((i) => Math.abs((OV[i].integrated ?? 0) - (OV[0].integrated ?? 0)));
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="loud">
          <div className="plotstick"><div className="tiles" data-cmptiles>{rows.map((r) => (
            <div className="tile cmptile" key={r.k}><span>{r.k}</span>{r.v.map((x, i) => <div className="tv" key={i}><Who i={i} /><b style={r.bad[i] ? { color: "var(--bad-ink)" } : undefined}>{x}</b></div>)}<em>{r.note}</em></div>))}</div>
          <div className="plothead"><span><b>ความดังตลอดไฟล์</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div></div>
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
            ? <Stat kind="warn" b={`ดังสุดของ${LABELS[hot]} ${(OV[hot].truePeak ?? 0) > 0 ? "+" : ""}${f1(OV[hot].truePeak)} dBTP ถึงหรือเกิน 0`} d={CONV ? "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด ให้ตั้ง Gain −1 dB ในแผงตั้งค่าเสียงแล้วแปลงใหม่" : "เครื่องเล่นบางตัวเสียงแตกช่วงที่ดังสุด"} />
            : <Stat kind="info" b={n === 2 ? `ความดังรวมต่างกัน ${luDiffs[0].toFixed(1)} LU` : `ความดังรวมต่างจาก${LABELS[0]}มากสุด ${Math.max(...luDiffs).toFixed(1)} LU`} d={`เส้นแทบทับกันแปลว่าความดังไม่เปลี่ยน และต่างกันไม่ถึง 1 LU หูแยกไม่ออก`} />}
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
            <span className="psdch-seg"><div className="seg sm">{common.map((c) => <button key={c} type="button" className={cmpUse === c ? "on" : ""} onClick={() => setCmpCh(c)} data-cmpch={c}>{label(NM[0], c).code} {label(NM[0], c).th.split(" ")[0]}</button>)}</div></span>
            {/* หัวกราฟแคบ ปุ่มช่องเป็นดรอปดาวน์ ไฟล์ 5.1 7.1 มีหกถึงแปดปุ่ม (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
            <span className="psdch-dd" data-cmpchdd><Dropdown label="ช่องที่ดู" value={cmpUse} onChange={setCmpCh} options={common.map((c) => ({ value: c, label: `${label(NM[0], c).code} ${label(NM[0], c).th.split(" ")[0]}` }))} /></span></span>{zoomBar}</div>
          <div style={{ flex: "1 0 120px", display: "flex", gap: 8, minHeight: 0 }} onWheel={vrCmp.wheel}>
            <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
              <CmpChart key="cmp" vr={vrCmp} grab={cmpGrab} fill height={120} deps={[filesKey, t0, t1, cmpUse, hiC]} lo={-48} hi={0} step={12} unit="dB" series={(w) => OV.map((o, i) => [rmsDb(o, idx[i], t0, t1, w, hiC[files[i]]), FILE_C[i]] as [Float32Array, string])} />
              <VBar v={vrCmp} right={8} />
            </div>
            <FZoom value={vrCmp.z} onChange={vrCmp.setZ} />
          </div>
          <div className="small" style={{ margin: "6px 0 2px" }}><b style={{ color: "var(--txt)" }}>{n === 2 ? `ผลต่าง ${LABELS[1]} ลบ ${LABELS[0]}` : `ผลต่าง แต่ละไฟล์ ลบ ${LABELS[0]}`}</b> กราฟแยก แกนบวกลบ 2 dB</div>
          <div style={{ marginRight: 30 }}><CmpChart grab={cmpGrab} height={80} deps={[filesKey, t0, t1, cmpUse]} lo={-2} hi={2} step={1} unit="dB" diff series={(w) => { const x = rmsDb(OV[0], idx[0], t0, t1, w); return others.map((f) => { const y = rmsDb(OV[f], idx[f], t0, t1, w), d = new Float32Array(w); for (let i = 0; i < w; i++) d[i] = x[i] < -60 || y[i] < -60 ? 0 : y[i] - x[i]; return [d, n === 2 ? "#7a4fb0" : FILE_C[f]] as [Float32Array, string]; }); }} /></div>
          <TimeScroll dur={dur} t0={t0} t1={t1} left={44} right={34} onPan={panT} />
          <Stat kind={Math.abs(top.mx) >= 1 ? "warn" : "info"} b={`ช่อง ${l.code}${n > 2 ? ` ${LABELS[top.f]}` : ""} ต่างกันเฉลี่ย ${top.avg.toFixed(1)} dB มากสุด ${sgn(top.mx)} dB ที่ ${tfmt(top.mxAt)}`}
            d={Math.abs(top.mx) >= 1 ? "ต่างเกินราว 1 dB ที่หูเริ่มแยกได้ ลองเปิดฟังช่วงนั้นเทียบกัน" : "ต่ำกว่าที่หูแยกได้ (ราว 1 dB) และไม่นับช่วงที่เบากว่า −60 dB"} />
        {foot(n === 2 ? <span><span className="ln" style={{ background: "#7a4fb0" }} />ผลต่าง</span> : null)}
          </div>
      );
    } else if (tab === "spek") {
      const heat = lut(HEAT);
      const sub = (i: number) => { const t = T[i]!; return `${t.codec}, ${t.rate.toLocaleString("en-US")} Hz${t.bits ? `, ${t.bits}-bit` : ""}${t.bitrate ? `, ${Math.round(t.bitrate / 1000).toLocaleString("en-US")} kb/s` : ""}, ${NM[i].length} channels mixed${nyq[i] !== maxNyq ? " แกนตั้งเท่ากันทุกไฟล์" : ""}`; };
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="spek">
          <div className="plothead"><span><b>ความถี่</b> <span className="prange">ช่วง <RangeTime t0={t0} t1={t1} dur={dur} /></span></span>{zoomBar}</div>
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
      const cmpPsdOpts: [string, string][] = [["mix", "รวมทุกช่อง"], ...common.filter((c) => c !== "LFE").slice(0, 6).map((c) => [c, label(NM[0], c).code] as [string, string])];
      body = (
        <div className="plot cmpplot" data-plot ref={plotRef} data-cmpview="psd">
          {/* หัวกราฟแคบ ปุ่มช่องกับปุ่มช่วงที่เลือกเป็นดรอปดาวน์แบบหน้าความถี่เฉลี่ยของไฟล์เดียว (พี่กันสั่ง 13 พ.ย. 2569 "ตัวนี้เปลี่ยนเป็นดรอปดาวด้วย ถ้าจอเล็ก") */}
          <div className="plothead"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><b>ความถี่เฉลี่ย</b>
            <span className="psdch-seg"><div className="seg sm">{cmpPsdOpts.map(([k, l2]) => <button key={k} type="button" className={psdCh === k ? "on" : ""} onClick={() => setPsdCh(k)} data-cmppsdch={k}>{l2}</button>)}</div></span>
            <span className="psdch-dd" data-cmppsdchdd><Dropdown label="ช่องที่ดู" value={psdCh} onChange={setPsdCh} options={cmpPsdOpts.map(([value, label]) => ({ value, label }))} /></span></span>
            <span className="zoombox zfix" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className="lbl">ช่วงที่เลือก</span>
              <span className="zseg"><div className="seg sm">{PSD_SPANS.map(([k, l2]) => <button key={String(k)} type="button" className={String(psdSpan) === String(k) ? "on" : ""} onClick={() => setPsdSpan(k)} data-cmppsdspan={String(k)}>{l2}</button>)}</div></span>
              <span className="zdd" data-cmppsdspandd><Dropdown label="ช่วงที่เลือก" value={String(psdSpan)} onChange={(v) => setPsdSpan(v === "all" ? "all" : Number(v))} options={PSD_SPANS.map(([k, l2]) => ({ value: String(k), label: l2 }))} /></span></span></div>
          {ok ? <PsdCmp list={psd.list} maxNyq={maxNyq} f={psdF} setF={setPsdF} vr={vrPsd} hr={hrPsd} grab={cmpGrab} onReset={() => { setPsdSpan("all"); zoomReset(); }} /> : <div className="skel" style={{ height: 300, borderRadius: 8 }} data-cmppsdwait />}
          <div className="small" style={{ marginTop: 4 }}>{psdSpan === "all" ? `ทั้งไฟล์ ${tfmt(dur)}` : `${tfmt(psdT[0])}–${tfmt(psdT[1])} รอบกลางช่วงที่ดู`} คิดทีละไฟล์ตามลำดับ{ok ? ` และ${n === 2 ? "ทั้งสองไฟล์" : allTxt}ใช้ช่องความถี่กว้าง ${(psd.list[0].rate / psd.list[0].size).toFixed(1)} Hz เท่ากัน จึงเทียบกันได้ตรง` : ""}</div>
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
  const hrSpan = PSD_HZ_MAX * PSD_HZ_UNIT, setHz = (k: number) => hr.setZ(Math.max(1, Math.min(PSD_HZ_MAX, k)));
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
        <button type="button" className="zb" onClick={() => setHz(hr.z / 2)} disabled={hr.z <= 1} aria-label="ซูมแกนความถี่ออก" title="ซูมออก (Ctrl หมุนล้อเมาส์ลง)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg></button>
        <HZoom dur={hrSpan} span={hrSpan / hr.z} onSpan={(sp) => setHz(hrSpan / sp)} name="ซูมแกนความถี่" text={`ซูมแกนความถี่ ${hr.z.toFixed(1)} เท่า`} />
        <button type="button" className="zb" onClick={() => setHz(hr.z * 2)} disabled={hr.z >= PSD_HZ_MAX} aria-label="ซูมแกนความถี่เข้า" title="ซูมเข้า (Ctrl หมุนล้อเมาส์ขึ้น)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6M10.5 7.5v6" /></svg></button>
        <button type="button" className="zb" onClick={onReset} aria-label="รีเซ็ตซูม" title="รีเซ็ต กลับทั้งไฟล์ ซูมแนวตั้งกับแนวนอน 1 เท่า" data-zoom-reset><IcRefresh size={15} /></button>
      </span>
      <span className="lbl">ตำแหน่งชี้</span><span className="psdbox" style={{ whiteSpace: "normal" }}>{f == null ? "ชี้บนกราฟเพื่อดูค่า" : `${fTxt(f)} (${noteOf(f)}) = ${list.map((p, i) => `${LABELS[i]} ${minus(at(p, f).toFixed(0))} dB`).join(", ")}${list.length === 2 ? ` ต่างกัน ${Math.abs(at(list[1], f) - at(a, f)).toFixed(1)} dB` : ""}`}</span>
      <span className="lbl">ต่างมากสุดช่วงที่ได้ยิน</span><span className="psdbox">{fTxt(mxF)} {LABELS[mxI]}{mx < 0 ? "บางลง" : "หนาขึ้น"} {Math.abs(mx).toFixed(1)} dB</span>
    </div>
    <Stat kind={low > 3 ? "warn" : "info"} b={`ช่วงที่ได้ยิน 20 Hz ถึง 15 kHz ${list.length === 2 ? "สองเส้น" : `ทุกเส้นจาก${LABELS[0]}`}ต่างกันไม่เกิน ${low.toFixed(1)} dB`} d={`ต่างมากสุดในช่วง 20 Hz ถึง 20 kHz ที่ ${fTxt(mxF)} ${LABELS[mxI]}${mx < 0 ? "บางลง" : "หนาขึ้น"} ${Math.abs(mx).toFixed(1)} dB`} />
  </>);
}
