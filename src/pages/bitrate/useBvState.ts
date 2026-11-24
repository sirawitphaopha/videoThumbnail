/* ค่าที่บิตเรตแบบเดิมจำ ไฟล์ วิธีคิด ตัวเลือกกราฟ ซูม เมนู และการวางเมนู
   แยกจาก BitrateClassic.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 7) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { bitrateApi, inApp, type BrInfo, type BrTrack } from "../../lib/api";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { useDropPlacement, useSideFit } from "../../lib/popupFit";
import { Done, MODES, Mode, Prog, Raw, recentList, store } from "./classicParts";

export type BvProps = { initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void; onCurrent?: (path: string | null, track: string | null) => void };

export function useBvState(p: BvProps) {
  const { initialPath = null, initialTrack = null, onConsumed, onCurrent } = p;
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
  return { path, setPath, info, setInfo, modeSel, setModeState, audio, mode, stream, setStream, choose, setChoose, askRef, running, setRunning, err, setErr, ver, setVer, cur, setCur, track, setTrack, showCur, setShowCur, auto, setAuto, grad, setGrad, gradHead, setGradHead, gaps, setGapsState, toggleGaps, desc, setDesc, marks, setMarks, zoom, setZoom, sel, setSel, topBand, setTopBand, menu, setMenu, recent, setRecent, raw, run, ready, drag, hold, plotRef, cvRef, menuWrap, menuPanel, place, side, trkOpen, setTrkOpen, trkWrap, trkPanel, trkPlace, trkSide, closeTrk, descLeft, setDescLeft, closeMenu, box, setBox, initialPath, initialTrack, onConsumed, onCurrent };
}
