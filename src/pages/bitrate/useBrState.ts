/* ค่าที่หน้าบิตเรตจำ ไฟล์ แทร็ก วิธีคิด ซูม ค่าที่จำในเครื่อง และที่อ้างถึงกล่องบนหน้า
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { useRef, useState } from "react";
import { type BrInfo, type BrTrack } from "../../lib/api";
import { useLibrary } from "../../lib/library";
import { BarStyle, MODES, Mode, Pal, RES_STEPS, Raw, Res, STYLES, recentList, store } from "./common";

export type BrProps = { onClassic?: (path: string | null, track?: string | null) => void; initialPath?: string | null; initialTrack?: string | null; onConsumed?: () => void; onGraph?: (path: string, track: number) => void };

export function useBrState(p: BrProps) {
  const { onClassic, initialPath = null, initialTrack = null, onConsumed, onGraph } = p;
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
  /** ความละเอียดแท่ง รูปแบบกราฟ ชุดสี จำค่าไว้ในเครื่อง (BUGS ข้อ 42 ข้อ 37) */
  const [res, setResState] = useState<Res>(() => { const v = store.get("brn-res"); return v === "pkt" || v === "auto" || RES_STEPS.some((x) => x.value === v) ? v as Res : "1"; });
  const setRes = (v: Res) => { setResState(v); store.set("brn-res", v); };
  const [bstyle, setStyleState] = useState<BarStyle>(() => (STYLES.some((x) => x.value === store.get("brn-style")) ? store.get("brn-style") as BarStyle : "bar"));
  const setBStyle = (v: BarStyle) => { setStyleState(v); store.set("brn-style", v); };
  const [pal, setPalState] = useState<Pal>(() => { const v = store.get("brn-pal"); return v === "bv" || v === "custom" ? v : "tone"; });
  const setPal = (v: Pal) => { setPalState(v); store.set("brn-pal", v); };
  const [custom, setCustomState] = useState(() => (/^#[0-9a-f]{6}$/i.test(store.get("brn-custom") ?? "") ? store.get("brn-custom")! : "#3b8fe0"));
  const setCustom = (c: string) => { setCustomState(c); store.set("brn-custom", c); };
  /** ตอนเปิดแผงสีกำหนดเอง จำชุดสีเดิมไว้ กดยกเลิกคืนทั้งชุด (แบบหน้ากราฟเสียง) */
  const [palSnap, setPalSnap] = useState<{ pal: Pal; color: string } | null>(null);
  /** ไฟล์ที่กำลังถามรายชื่อแทร็ก · ขึ้นหน้าเลือกแทร็กแบบโครงจางระหว่างรอ */
  const [asking, setAsking] = useState<string | null>(null);
  const ctlRef = useRef<HTMLDivElement>(null);
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
  return { movies, path, setPath, info, setInfo, modeSel, setModeState, audio, mode, track, setTrack, choose, setChoose, askRef, scale, setScale, lines, setLines, running, setRunning, err, setErr, ver, setVer, zoom, setZoom, vz, setVz, hover, setHover, pin, setPin, sel, setSel, recent, setRecent, toneVer, setToneVer, res, setResState, setRes, bstyle, setStyleState, setBStyle, pal, setPalState, setPal, custom, setCustomState, setCustom, palSnap, setPalSnap, asking, setAsking, ctlRef, raw, run, ready, drag, plotRef, cvRef, ovRef, box, setBox, toneKey, onClassic, initialPath, initialTrack, onConsumed, onGraph };
}
