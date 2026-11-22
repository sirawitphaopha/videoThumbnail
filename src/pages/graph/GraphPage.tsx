/* หน้ากราฟเสียง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
   6 แบบ รูปคลื่น (เส้นละเอียด หรือ แท่ง) · ความถี่ (สีตามชุด หรือ สีรุ้ง) · ความดัง · ซ้อนเทียบ · วิเคราะห์ (แบบ Spek) · ความถี่เฉลี่ย (แบบ Plot Spectrum ของ Audacity)
   ข้อมูลจริงจาก audiograph.rs · ภาพรวมทั้งไฟล์อ่านครั้งเดียว ช่วงที่ซูมอ่านเฉพาะช่วง ระหว่างรอใช้ภาพรวมวาดไปก่อน ไม่มีจอว่าง */
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { AUDIO_EXT, GRAPH_IMG_DEFAULT, checkApi, convertApi, graphApi, inApp, pickFile, thumbUrl, type GInfo, type GOverview, type GProgress, type GPsd, type GTrack, type GWindow, type Movie, type AudioFile, type CoverData } from "../../lib/api";
import ConvertPane from "../../components/ConvertPane";
import "../../styles/av.css";
import TagDialog, { tagRows, whyNone } from "../../components/TagDialog";
import { addFiles } from "../../lib/convertJob";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import Dropdown from "../../components/Dropdown";
import { FixedTime, LoadPill, Phr, Skel, chText, dropClick } from "../../components/ui";
import { fmtSize } from "../../lib/format";
import { useSettings } from "../../lib/settings";
import { IcExpand, IcFile, IcMix, IcBitrate } from "../../components/icons";
import InfoTip from "../../components/InfoTip";
import FullBtn from "../../components/FullBtn";
import { useFitClass } from "../../lib/fitSwitch";
import { PadCustom } from "../../components/ColorPick";
import type { Tip } from "../../lib/codecAdv";
import { useOvFold } from "../../lib/ovFold";
import { IcSearch, IbStop, IcRefresh, IcGraph, IbPlay } from "../../components/icons";
import { LoadLanes, overviewOnce, Prefs, CUSTOM, PSD_SPANS, RAINBOW, RangeTime, THEMES, THEME_ORDER, TimeRuler, VIEWS, VIEW_ICON, View, WARN, ZOOMS, dbTxt, label, laneMinH, memPut, pkTxt, spanDigits, spekRamp, tfmt, tfmtD, themeOf } from "./common";
import { RUL_W, SaveBtn, SavingCtx, Src, WaveStyle, alphaOf, drawAmpRuler, drawWave, imgName, imgTarget, lut, sample, screenK, waitPaint, withHeader } from "./draw";
import { Crosshair, GraphOptions, Lane, LaneOff, Mark, Marks, Speakers, mixSrc, useGrab } from "./parts";
import { FZoom, HZ_MIN, HZoom, Overview, TimeScroll, VZoom, composeLanes, drawSpecLane, vzTxt } from "./zoom";
import { CmpView, LoudView } from "./LoudView";
import { SpekView, spekEdge } from "./SpekView";
import { LOUD_TIP, PsdView } from "./PsdView";
import { CompareView } from "./CompareView";
import { Elapsed } from "./compareParts";

/** track ลำดับแทร็กเสียงที่จะเปิด (หน้าบิตเรตส่งแทร็กที่ดูอยู่ BUGS ข้อ 119) · ไม่ส่งเปิดแทร็กแรก */
export type GraphReq = { path: string; t?: number; track?: number };
/* ---------- หน้า ---------- */

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
/** คำอธิบายสีของรูปคลื่น (BUGS ข้อ 11 · พี่กัน "ยอดเสียง อ่านเเล้วงง" · "เอาไว้ด้วย") */
const PEAK_RMS_TIP: Tip = { w: "ดังสุด (Peak) คือจุดที่ดังที่สุดแวบเดียวในช่วงนั้น ส่วนดังเฉลี่ย (RMS) คือความดังเฉลี่ยของช่วงนั้น ซึ่งใกล้กับที่หูได้ยิน",
  p: "ถ้าดังสุดชนขอบบนล่าง แปลว่ายอดคลื่นแตะเพดานและเสียงอาจแตก ถ้าดังเฉลี่ยหนาเกือบเท่าดังสุด แปลว่าเพลงถูกบีบให้ดังเท่ากันทั้งเพลง และถ้าดังเฉลี่ยบางกว่าดังสุดมาก แปลว่าเสียงมีช่วงดังเบาเป็นธรรมชาติ" };
const WaveIc = ({ d }: { d: string }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

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
