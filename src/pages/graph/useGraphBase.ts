/* ค่าหลักของหน้ากราฟเสียง โหมดกราฟกับแปลงเสียง การเทียบ ไฟล์ ข้อมูล ค่าที่จำ ขนาดกรอบ
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type GInfo, type GOverview, type GPsd, type GWindow } from "../../lib/api";
import { useLibrary } from "../../lib/library";
import { useToast } from "../../components/Toasts";
import { useFitClass } from "../../lib/fitSwitch";
import { useOvFold } from "../../lib/ovFold";
import { Prefs, View, laneMinH } from "./common";
import { SPEK_RES_KEY, loadPrefs } from "./graphPrefs";
import type { GraphReq } from "./GraphPage";

export type GraphProps = { req: GraphReq | null; onConsumed: () => void; onBitrate?: (path: string, track?: string) => void };

/** โหมดของหน้า กับการเทียบที่เปิดอยู่ · จำระดับโปรแกรม ไปหน้าอื่นแล้วกลับมาอยู่ที่เดิม (คิวแปลงเก็บใน convertJob.ts) */
let lastMode: "graph" | "convert" = "graph";
// tracks แทร็กเสียงของแต่ละไฟล์ (ไม่มี = แทร็กแรก) · เดิมหน้าเทียบใช้แทร็กแรกเสมอ ดูเสียง 2 อยู่แล้วกดเทียบ ได้เสียง 1 มาเทียบ (AUDIT 12 พ.ย. 2569 ข้อ 22)
type CmpState = { files: string[]; note?: string; free?: boolean; tracks?: Record<string, number> } | null;
let lastCmp: CmpState = null;
/** การเทียบที่ออกมาดูกราฟเดี่ยว ใช้ปุ่มกลับไปเทียบ */
let lastBack: CmpState = null;

export function useGraphBase(p: GraphProps) {
  const { req, onConsumed, onBitrate } = p;
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

  // view กับ zoomOf ย้ายขึ้นมาจากชุดมุมมอง เพราะ effect ในชุดนี้กับชุดไฟล์อ่านค่าทั้งสอง (BUGS ข้อ 155 ขั้น 4)
  const view = prefs.view;
  const zoomOf = useRef<Partial<Record<View, { zoom: number | "all"; center: number }>>>({});
  return { mode, setModeRaw, setMode, cmp, setCmpRaw, setCmp, cmpBack, setCmpBackRaw, setCmpBack, tagFor, setTagFor, modeRef, movies, toast, toastRef, path, setPath, info, setInfo, codecDetail, setCodecDetail, track, setTrack, ovRaw, setOvRaw, progress, setProgress, readSince, setReadSince, error, setError, nonce, setNonce, jumped, prefs, setPrefs, ovFold, loudMode, setLoudMode, swSnap, setSwSnap, spekRes, setSpekRes, zoom, setZoom, center, setCenter, tip, setTip, hover, setHover, hidden, setHidden, win, setWin, winFail, setWinFail, resetN, setResetN, psd, setPsd, psdCh, setPsdCh, psdLog, setPsdLog, psdSize, setPsdSize, psdF, setPsdF, showTable, setShowTable, boxEl, setBoxEl, plotW, setPlotW, plotRef, paneH, setPaneH, exportRef, laneAdj, setLaneAdj, view, zoomOf, req, onConsumed, onBitrate };
}
