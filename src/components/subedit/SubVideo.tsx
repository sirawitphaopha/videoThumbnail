/* กรอบภาพหนังของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109 · แบบกรอบวิดีโอของ Aegisub video_box.cpp)
   ภาพตรงเฟรม ซับที่ขึ้นบนเฟรมนั้นทับภาพ มุมขวาบนบอกระยะห่างจากเวลาเริ่มและจบของบรรทัดที่กำลังแก้ (เช่น +0ms; -2900ms)
   แถบล่าง ถอยหรือเดินทีละเฟรม · ช่องเวลากับเลขเฟรม (เฟรมนั้นเป็น keyframe ช่องเปลี่ยนสี) · AUTO เลือกบรรทัดแล้วภาพไปเวลาเริ่มเอง · เมนูวิดีโอ
   ขนาดภาพ พอดีกรอบ หรือ 12.5% ถึง 300% ขั้นละ 12.5% · ล้อเมาส์บนภาพแบบ Aegisub หมุนเปล่าปรับขนาดภาพทีละ 12.5% ได้ถึง 1000% Ctrl ขยายเนื้อภาพในกรอบเดิม Shift เลื่อนภาพ
   คลิกภาพแล้วลูกศรซ้ายขวาเดินทีละเฟรม Shift ไป keyframe Ctrl ไปขอบบรรทัด Alt ทีละ 10 เฟรม (ตารางก็ใช้ปุ่มชุดเดียวกัน)
   ยังอ่านเวลาเฟรมไม่เสร็จ ขึ้นภาพตามเวลาแบบเดิมก่อน · ไม่มีวิดีโอบอกในกรอบพร้อมปุ่มเพิ่มไฟล์วิดีโอกับวิดีโอจำลอง (BUGS ข้อ 107)
   ปุ่มเล่น (Ctrl+P แบบ Aegisub) เล่นหนังในกรอบนี้ ตัวเล่นตามหน้าตั้งค่า mpv (ค่าตั้งต้น) หรือแบบ Aegisub ที่ภาพเดินตามเวลาของเสียง (vidPlay.ts)
   ภาพหยุดอยู่ ซับบนภาพวาดด้วย libass (subshot.rs) ตำแหน่ง สี ฟอนต์ แท็กตรงกับตอนเล่น · แถบซ้ายของภาพเลือกเครื่องมือกากบาท (A) กับลากจัดตำแหน่ง (S) (VideoTools.tsx · BUGS ข้อ 111)
   คลิกขวาบนภาพ บันทึกภาพ PNG หรือคัดลอกภาพ แบบมีซับ ไม่มีซับ เฉพาะซับ คัดลอกพิกัด รีเซ็ตการเลื่อนภาพ (เมนู video_context ของ Aegisub) · กดล้อเมาส์ค้างแล้วลากเลื่อนภาพที่ขยายเกินกรอบ */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pickKeyframes, pickSave, subApi, subDocApi, vidApi, type SnapReq, type SubDoc, type SubEvent } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import type { Tip } from "../../lib/codecAdv";
import { dropStyle, sideStyle, useDropPlacement, useSideFit, visibleTop } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { isAss } from "../../lib/subText";
import {
  cachedFrame, closeVideo, dummyLight, findScenes, fmtMs, frameImage, getVid, isKey, prefetch, reopenVideo, seek, seekOf, setAuto, setFitPct, setHideKeys, setKeys, setZoom,
  signedMs, stopScenes, useVid, vidKeys, vidRate, vidRetry, vidSrc, type DummySpec,
} from "../../lib/vidFrames";
import { edit, useSubEdit } from "../../lib/subEdit";
import { lineMove, shownAt, togglePosMove, vStr, type V2 } from "../../lib/subVisual";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Skel, Switch } from "../ui";
import { IbCross, IbDrag, IbFilm, IbFrameNext, IbFramePrev, IbJump, IbMovePos, IbPlay, IbStop, IcFile } from "../icons";
import VideoTools, { type VTool } from "./VideoTools";
import { bindMpvBox, bindPlayCanvas, getVidPlay, mpvSubUpdate, setPlayToggle, startVidPlay, stopVidPlay, useVidPlay, type PlayOpts } from "../../lib/vidPlay";
import type { AudSrc } from "../../lib/audioPlay";
import { KEY_TIP } from "./VideoDialogs";

/** ข้อความที่ตาเห็นบนภาพ ไม่มีแท็ก ขึ้นบรรทัดจริง */
export function shownText(e: SubEvent, d: SubDoc) {
  return isAss(d) ? e.text.replace(/\{[^}]*\}/g, "").replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ") : e.text.replace(/<[^>]*>/g, "");
}

/** ขนาดภาพ 24 ขั้น ขั้นละ 12.5% ตั้งแต่ 12.5% ถึง 300% (video_box.cpp) กับพอดีกรอบ */
const ZOOMS = Array.from({ length: 24 }, (_, i) => (i + 1) * 12.5);
const FIT_W = 288, FIT_H = 162;
/** แถบเลือกเครื่องมือซ้ายของภาพ กว้างรวมช่องห่าง */
const TOOLBAR_W = 34;
// กล่อง ⓘ แยกเป็นหัวข้อละเรื่อง เนื้อความสั้นเป็นประโยคมีคำเชื่อม ไม่ขึ้นบรรทัดเอง (พี่กันตีตก 14 พ.ย. 2569 ที่แตกเป็นบรรทัดละวลีจนเป็นก้อนยาว)
const VIDEO_TIP: Tip = {
  w: "แถบใต้ภาพมีปุ่มถอยหรือเดินทีละเฟรม\nส่วนช่องกลางบอกเวลากับเลขเฟรม และเป็นสีเข้มเมื่อเป็น keyframe",
  o: [
    ["ตัวเลขมุมขวาบน", "คือระยะห่างจากเวลาเริ่มและเวลาจบของบรรทัดนี้\nถ้าเป็น +0ms แปลว่าภาพอยู่ตรงเวลาเริ่มพอดี", "", ""],
    ["เดินทีละเฟรม", "คลิกภาพแล้วกดลูกศรซ้ายขวา\nกด Shift ด้วยจะไป keyframe กด Ctrl ด้วยจะไปขอบบรรทัด\nและกด Alt ด้วยจะเดินทีละ 10 เฟรม", "", ""],
    ["คีย์ลัด", "กด Ctrl+1 เพื่อไปเวลาเริ่ม กด Ctrl+2 เพื่อไปเวลาจบ\nและกด Ctrl+G เพื่อข้ามไปเฟรมหรือเวลาที่พิมพ์", "", ""],
    ["ล้อเมาส์", "หมุนบนภาพเพื่อปรับขนาด กด Ctrl ด้วยจะขยายเนื้อภาพ\nส่วนกด Shift ด้วยหรือกดล้อค้างแล้วลากจะเลื่อนภาพ", "", ""],
    ["AUTO", "เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดนั้นเอง", "ไล่ดูบรรทัดได้เร็ว", "ภาพที่ดูค้างไว้จะกระโดดไปเมื่อเลือกบรรทัดใหม่"],
  ],
  r: "เปิด AUTO ไว้ ตอนจะดูภาพนานค่อยปิด",
};
const VISUAL_TIP: Tip = {
  w: "ใช้ได้ตอนภาพหยุดอยู่ พิกัดนับจากมุมซ้ายบนของภาพ\nตามความละเอียดของสคริปต์ จึงเป็นตัวเลขชุดเดียวกับใน \\pos",
  o: [
    ["กากบาท (A)", "ชี้ภาพแล้วเห็นพิกัด\nดับเบิลคลิกเพื่อย้ายบรรทัดที่เลือกมาตรงนั้น", "ดูพิกัดได้ทันที", "ไม่เห็นจุดจับของซับ"],
    ["ลากจัดตำแหน่ง (S)", "ลากจุดบนภาพแล้วซับย้ายตาม สี่เหลี่ยมคือ \\pos ส่วนวงกลมคือปลายของ \\move และสามเหลี่ยมคือ \\org", "ลากหลายบรรทัดพร้อมกันได้", "เวลาของจุดใน \\move เปลี่ยนตามภาพที่เห็นตอนลาก"],
    ["คลิกขวา", "บันทึกภาพ คัดลอกภาพ หรือคัดลอกพิกัด", "", ""],
  ],
  r: "จัดตำแหน่งด้วยเครื่องมือลาก ส่วนดูพิกัดใช้กากบาท",
};
const COORD_TIP: Tip = { w: "เป็นตัวเลขชุดเดียวกับที่ใส่ใน \\pos ของซับ คัดลอกแล้ววางในช่องพิมพ์ได้เลย" };

/** เครื่องมือบนภาพที่เลือกไว้ จำตลอดที่โปรแกรมเปิด (Aegisub เริ่มที่กากบาททุกครั้งที่เปิด) */
let toolNow: VTool = "cross";

/* ---------------------------------------------------------------- ซับจริงบนภาพนิ่ง (libass ผ่าน subshot.rs) */

const docIds = new WeakMap<SubDoc, number>();
let docSeq = 0;
const docId = (d: SubDoc) => { let v = docIds.get(d); if (v == null) { v = ++docSeq; docIds.set(d, v); } return v; };
/** ภาพซับที่วาดแล้ว ตามเอกสาร เวลา ขนาด · เดินเฟรมกลับไปมาขึ้นทันที */
const ovCache = new Map<string, string>();
type OvReq = { key: string; run: () => Promise<string>; ok: (u: string) => void; bad: (e: unknown) => void };
let ovBusy = false;
let ovNext: OvReq | null = null;
/** วาดทีละภาพ ระหว่างวาดมีคำขอใหม่ เก็บไว้แค่คำขอล่าสุด (ลากซับแล้วไม่สั่ง ffmpeg ซ้อนกันเป็นสิบตัว) · คำขอที่ถูกข้ามตอบ "skip" */
function ovQueue(key: string, run: () => Promise<string>): Promise<string> {
  return new Promise((ok, bad) => {
    ovNext?.bad("skip");
    ovNext = { key, run, ok, bad };
    ovPump();
  });
}
function ovPump() {
  if (ovBusy || !ovNext) return;
  const r = ovNext;
  ovNext = null;
  ovBusy = true;
  r.run().then((u) => {
    ovCache.set(r.key, u);
    if (ovCache.size > 40) ovCache.delete(ovCache.keys().next().value!);
    r.ok(u);
  }, r.bad).finally(() => { ovBusy = false; ovPump(); });
}

/** วาดวิดีโอจำลองเต็มผืนวาด สีพื้นหรือตารางหมากรุก ช่องละ 8 จุดของภาพจริง */
function drawDummy(el: HTMLCanvasElement, spec: DummySpec) {
  const g = el.getContext("2d")!;
  const { r: R, g: G, b: B } = spec;
  g.fillStyle = `rgb(${R},${G},${B})`; g.fillRect(0, 0, el.width, el.height);
  if (!spec.pattern) return;
  const [lr, lg, lb] = dummyLight(R, G, B);
  g.fillStyle = `rgb(${lr},${lg},${lb})`;
  const cell = (8 * el.height) / spec.h;
  for (let y = 0, row = 0; y < el.height; y += cell, row++) for (let x = 0, col = 0; x < el.width; x += cell, col++) if ((row & 1) !== (col & 1)) g.fillRect(x, y, cell + 0.5, cell + 0.5);
}
/** ภาพวิดีโอจำลองขนาดเต็มเป็น PNG ส่งให้บันทึกหรือคัดลอกภาพ */
function dummyPng(spec: DummySpec, w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w; el.height = h;
  drawDummy(el, spec);
  return el.toDataURL("image/png");
}

type Props = {
  doc: SubDoc;
  ev: SubEvent | null;
  delayMs: number;
  /** ชื่อไฟล์หนังที่แสดงในรายละเอียด */
  name: string;
  onAddMovie?: () => void;
  onDummy: () => void;
  onDetails: () => void;
  onJump: () => void;
  /** ปิดวิดีโอจำลองหรือวิดีโอ (หน้าแก้ซับล้างค่าที่ไฟล์ ASS จำไว้ด้วย) */
  onClose: () => void;
  /** Ctrl กับลูกศร ไปขอบบรรทัด ต้องเลือกบรรทัดถัดไปได้ หน้าแก้ซับจึงเป็นคนทำ */
  onKey: (e: React.KeyboardEvent) => void;
  /** แทร็กเสียงที่หน้าแก้ซับใช้ (คลื่นเสียง) เล่นคู่กับภาพตอนกดเล่น · ไม่มี = เล่นภาพอย่างเดียว */
  audio: AudSrc | null;
};

/** วาดวิดีโอจำลอง สีพื้นหรือตารางหมากรุก 8 จุดตามขนาดภาพจริง */
function DummyCanvas(p: { spec: DummySpec; w: number; h: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el) return;
    // ผืนวาดด้านยาวไม่เกิน 4,096 จุด ภาพสีพื้นกับตารางหมากรุกขยายได้ไม่เสียหน้าตา · เดิมวิดีโอจำลอง 4K ซูม 300% ได้ผืนวาดราว 17,280 จุด ใช้หน่วยความจำราว 670 MB (ผู้ช่วยตรวจทาน F22)
    const r = Math.min(window.devicePixelRatio || 1, 4096 / Math.max(1, p.w, p.h));
    el.width = Math.max(1, Math.round(p.w * r)); el.height = Math.max(1, Math.round(p.h * r));
    drawDummy(el, p.spec);
  }, [p.spec, p.w, p.h]);
  return <canvas ref={cv} style={{ width: p.w, height: p.h, display: "block" }} data-vdummy-canvas />;
}

export default function SubVideo(p: Props) {
  const st = useVid();
  const src = vidSrc(st);
  const fr = vidRate(st);
  const keys = vidKeys(st);
  const t = st.table;
  const d = p.delayMs;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(FIT_W);
  const [img, setImg] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const lastPos = useRef<number | null>(null);

  // ความกว้างที่ภาพขยายได้ เหลือที่ให้คลื่นเสียงอย่างน้อย 380 จุด กับแถบเครื่องมือซ้ายของภาพ (TOOLBAR_W)
  useLayoutEffect(() => {
    const top = host.current?.parentElement;
    if (!top) return;
    const fit = () => setAvail(Math.max(160, top.clientWidth - 380 - 14 - TOOLBAR_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(top);
    return () => ro.disconnect();
  }, []);

  // ขนาดภาพจริง (คิดอัตราส่วนภาพที่ไฟล์บอก) แล้วคิดขนาดที่แสดง
  const natH = src.kind === "dummy" ? src.spec.h : t?.h || 360;
  const natW0 = src.kind === "dummy" ? src.spec.w : t?.w || 640;
  const dar = t?.dar && /^\d+:\d+$/.test(t.dar) && !t.dar.startsWith("0:") ? t.dar.split(":").map(Number) : null;
  const natW = src.kind !== "dummy" && dar ? Math.round((natH * dar[0]) / dar[1]) : natW0;
  const fitS = Math.min(FIT_W / natW, FIT_H / natH);
  useEffect(() => setFitPct(fitS * 100), [fitS]);
  const z = st.zoom;
  // ขยายเนื้อภาพในกรอบเดิม (Ctrl กับล้อเมาส์ content zoom ของ Aegisub) 0.125 ถึง 10 เท่า กรอบคิดจากขนาดภาพที่เลือก ไม่ขยายตาม
  // รีเซ็ตการเลื่อนภาพคืนเป็น 1 (ResetContentZoom) · เปลี่ยนหนังคืนเป็น 1
  const [cz, setCz] = useState(1);
  const czMovie = src.kind === "movie" ? src.path : src.kind;
  useEffect(() => setCz(1), [czMovie]);
  const baseW = z ? (natW * z) / 100 : natW * fitS;
  const baseH = z ? (natH * z) / 100 : natH * fitS;
  const imgW = Math.max(1, Math.round(baseW * cz));
  const imgH = Math.max(1, Math.round(baseH * cz));
  const boxW = z ? Math.min(Math.max(Math.round(baseW), 160), avail) : FIT_W;
  const boxH = z ? Math.min(Math.max(Math.round(baseH), 90), Math.max(FIT_H, Math.round(window.innerHeight * 0.45))) : FIT_H;
  // ความสูงภาพที่ขอ ปัดเป็นขั้นละ 30 จุด ภาพขนาดใกล้กันใช้ภาพที่เก็บไว้ร่วมกันได้ ไม่เกินขนาดจริง
  const reqH = Math.max(90, Math.min(Math.min(natH, 2160), Math.ceil((imgH * (window.devicePixelRatio || 1)) / 30) * 30));

  const pos = st.pos;
  const movie = src.kind === "movie" ? src.path : "";
  const vp = useVidPlay();
  const playing = vp.playing;
  const { settings } = useSettings();
  // ตัวเล่นตามหน้าตั้งค่า · แบบ mpv ส่งซับที่กำลังแก้ทั้งไฟล์ (ฉบับล่าสุดตอนกด) กับดีเลย์ของซับไปด้วย
  const docRef = useRef(p.doc);
  docRef.current = p.doc;
  const opts = (): PlayOpts => ({ engine: settings?.subPlayer === "aegisub" ? "aegisub" : "mpv", sub: () => subDocApi.render(docRef.current), delayMs: d });
  // เล่นหนัง · แบบ Aegisub ภาพที่ขอสูงไม่เกิน 720 จุด ถอดทันเวลาจริง
  const togglePlay = () => {
    if (getVidPlay().playing) { stopVidPlay(); return; }
    if (!movie || !t || !fr || pos == null) return;
    void startVidPlay(movie, t, fr, pos, p.audio, Math.min(reqH, 720), opts());
  };
  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => { setPlayToggle(() => toggleRef.current()); return () => setPlayToggle(null); }, []);
  // ระหว่างเล่น ภาพย้ายเพราะอย่างอื่น (เลือกบรรทัดตอนเปิด AUTO ข้ามไปยัง) เล่นต่อจากตำแหน่งใหม่
  useEffect(() => { if (getVidPlay().playing && movie && t && fr && pos != null) void startVidPlay(movie, t, fr, pos, p.audio, Math.min(reqH, 720), opts()); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  // แก้ซับระหว่างเล่นแบบ mpv ส่งฉบับใหม่ให้ mpv หลังหยุดพิมพ์ครู่หนึ่ง
  useEffect(() => {
    if (!playing || vp.engine !== "mpv" || !t) return;
    const tm = setTimeout(() => { subDocApi.render(p.doc).then((x) => mpvSubUpdate(x, t, d), () => {}); }, 300);
    return () => clearTimeout(tm);
  }, [p.doc, d]); // eslint-disable-line react-hooks/exhaustive-deps
  // เปลี่ยนหนัง ปิดวิดีโอ ออกจากหน้า หยุดเล่น
  useEffect(() => () => stopVidPlay(), [movie]);
  // ภาพตรงเฟรม · เฟรมที่เก็บไว้แล้วขึ้นทันที ที่เหลือรอนิดหนึ่งก่อนดึง กดเดินเร็ว ๆ ไม่ดึงทุกเฟรม
  useEffect(() => {
    if (!movie) { setImg(null); return; }
    if (t && pos != null) {
      const dir: 1 | -1 = lastPos.current != null && pos < lastPos.current ? -1 : 1;
      lastPos.current = pos;
      const hit = cachedFrame(movie, reqH, pos);
      if (hit) { setImg(hit); setFail(false); prefetch(movie, t, pos, reqH, dir); return; }
      let live = true;
      const tm = setTimeout(() => frameImage(movie, t, pos, reqH, dir).then((u) => { if (live) { setImg(u); setFail(false); prefetch(movie, t, pos, reqH, dir); } }, () => { if (live) setFail(true); }), 60);
      return () => { live = false; clearTimeout(tm); };
    }
    // ยังอ่านเวลาเฟรมไม่เสร็จ ใช้ภาพตามเวลาเริ่มของบรรทัดไปก่อน
    if (!p.ev) return;
    const at = Math.max(0, p.ev.start + d + Math.min(300, (p.ev.end - p.ev.start) / 2));
    let live = true;
    const tm = setTimeout(() => subApi.frame(movie, at / 1000, reqH).then((u) => { if (live) { setImg(u); setFail(false); } }, () => { if (live) setFail(true); }), 120);
    return () => { live = false; clearTimeout(tm); };
  }, [movie, t, pos, reqH, p.ev?.id, p.ev?.start]); // eslint-disable-line react-hooks/exhaustive-deps

  // ล้อเมาส์บนภาพตามค่าตั้งต้นของ Aegisub (default_config.json Video Scroll Action · VideoDisplay::OnMouseWheel)
  // หมุนเปล่า ปรับขนาดภาพทีละ 12.5% ได้ 12.5% ถึง 1000% (นับเป็นรอบล้อ ทัชแพดสะสมจนครบรอบ)
  // Ctrl ขยายเนื้อภาพในกรอบเดิม ตรงจุดที่ชี้อยู่ที่เดิม · Shift เลื่อนภาพขึ้นลง 5 จุดต่อรอบล้อ · Ctrl กับ Shift ไม่ทำอะไร
  // ตัวดักแบบไม่ passive ถึงจะกันหน้าเลื่อนได้ · ใช้ค่าล่าสุดผ่าน ref ไม่ต้องผูกตัวดักใหม่ทุกครั้งที่ขนาดเปลี่ยน
  const wheelAcc = useRef(0);
  const anchor = useRef<{ u: number; v: number; mx: number; my: number } | null>(null);
  const centerNext = useRef(false);
  const wheelNow = useRef<(e: WheelEvent) => void>(() => {});
  wheelNow.current = (e: WheelEvent) => {
    if (e.ctrlKey && e.shiftKey) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1;
    const dy = e.deltaY * k, dx = e.deltaX * k;
    const v = view.current;
    if (!v) return;
    if (e.shiftKey) {
      // Chromium เปลี่ยนล้อแนวตั้งที่กด Shift เป็นแนวนอน · Aegisub เลื่อนภาพแนวตั้งตามรอบล้อ
      const n = -(dy !== 0 ? dy : dx) / 100;
      v.scrollTop -= 5 * n;
      return;
    }
    if (e.ctrlKey) {
      const n = -dy / 100;
      const next = Math.min(10, Math.max(0.125, cz * (1 + 0.125 * n)));
      if (next === cz) return;
      const r = v.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const lw = Math.max(imgW, boxW), lh = Math.max(imgH, boxH);
      anchor.current = { u: (v.scrollLeft + mx - (lw - imgW) / 2) / imgW, v: (v.scrollTop + my - (lh - imgH) / 2) / imgH, mx, my };
      setCz(next);
      return;
    }
    wheelAcc.current += -dy;
    const steps = Math.trunc(wheelAcc.current / 100);
    if (!steps) return;
    wheelAcc.current -= steps * 100;
    const now = st.zoom || Math.max(12.5, Math.round((fitS * 100) / 12.5) * 12.5);
    setZoom(Math.min(1000, Math.max(12.5, now + 12.5 * steps)));
  };
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelNow.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  // หลังขนาดเนื้อภาพเปลี่ยน เลื่อนให้จุดที่ชี้อยู่ใต้เมาส์ที่เดิม (ZoomAndPan) · รีเซ็ตแล้ววางภาพกลางกรอบ
  useLayoutEffect(() => {
    const v = view.current;
    if (!v) return;
    const a = anchor.current;
    if (a) {
      anchor.current = null;
      const lw = Math.max(imgW, boxW), lh = Math.max(imgH, boxH);
      v.scrollLeft = (lw - imgW) / 2 + a.u * imgW - a.mx;
      v.scrollTop = (lh - imgH) / 2 + a.v * imgH - a.my;
    } else if (centerNext.current) {
      centerNext.current = false;
      v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2;
      v.scrollTop = (v.scrollHeight - v.clientHeight) / 2;
    }
  }, [imgW, imgH, boxW, boxH]);

  const tNow = fr && playing && vp.frame != null ? fr.timeAt(vp.frame) : fr && pos != null ? fr.timeAt(pos) : p.ev ? p.ev.start + d : null;
  const shown = tNow == null ? "" : p.doc.events.filter((e) => !e.comment && e.start + d <= tNow && tNow < e.end + d).map((e) => shownText(e, p.doc)).join("\n");
  const onKey = isKey(keys.list, pos ?? -1);
  const ready = !!fr && pos != null;
  const noStep = src.kind === "none" ? "ยังไม่มีวิดีโอ" : st.load === "busy" ? "กำลังอ่านเวลาของทุกเฟรม รอสักครู่" : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : undefined;
  const fontPx = Math.max(11, Math.min(28, imgH * 0.06));
  const playWhy = src.kind === "dummy" ? "วิดีโอจำลองไม่มีภาพให้เล่น" : noStep;

  // ที่อยู่ของภาพบนชั้นเครื่องมือ ภาพอยู่กลางพื้นที่ที่ใหญ่กว่าระหว่างภาพกับกรอบ
  const layW = Math.max(imgW, boxW), layH = Math.max(imgH, boxH);
  const lay = useMemo(() => ({ x: (layW - imgW) / 2, y: (layH - imgH) / 2, w: imgW, h: imgH }), [layW, layH, imgW, imgH]);
  const ow = src.kind === "dummy" ? src.spec.w : t?.w || natW0;
  const oh = src.kind === "dummy" ? src.spec.h : t?.h || natH;

  // ซับจริงบนภาพนิ่ง วาดเฉพาะซับบนพื้นโปร่งใสขนาดภาพบนจอ (คิดความละเอียดจอ ด้านยาวไม่เกิน 4,096) แล้ววางทับภาพหนัง
  const still = !playing && src.kind !== "none" && tNow != null;
  const anyShown = still && p.doc.events.some((e) => shownAt(e, d, tNow!, fr, pos));
  const dpr = window.devicePixelRatio || 1;
  const ovS = Math.min(1, 4096 / Math.max(imgW * dpr, imgH * dpr));
  const ovW = Math.max(16, Math.round(imgW * dpr * ovS)), ovH = Math.max(16, Math.round(imgH * dpr * ovS));
  const ovKey = anyShown ? `${docId(p.doc)}|${Math.round(tNow! - d)}|${ovW}x${ovH}|${ow}x${oh}|${movie}` : "";
  const [ov, setOv] = useState<{ key: string; url: string } | null>(null);
  const [ovErr, setOvErr] = useState<string | null>(null);
  useEffect(() => {
    if (!ovKey) return;
    const hit = ovCache.get(ovKey);
    if (hit) { setOv({ key: ovKey, url: hit }); setOvErr(null); return; }
    let live = true;
    const doc = p.doc, at = tNow! - d, key = ovKey;
    const tm = setTimeout(() => {
      ovQueue(key, () => vidApi.subOverlay(doc, at, ovW, ovH, ow, oh, movie || null)).then(
        (u) => { if (live) { setOv({ key, url: u }); setOvErr(null); } },
        (e) => { if (live && e !== "skip") setOvErr(String(e)); });
    }, 40);
    return () => { live = false; clearTimeout(tm); };
  }, [ovKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // ซับแบบข้อความเดิม ใช้ตอนเล่นแบบ Aegisub (วาด libass ทุกเฟรมไม่ทัน) กับตอนวาดด้วย libass ไม่สำเร็จ
  const htmlSub = (playing && vp.engine === "aegisub") || (anyShown && !!ovErr);

  // เครื่องมือบนภาพ
  const [tool, setToolState] = useState<VTool>(toolNow);
  const setTool = (v: VTool) => { toolNow = v; setToolState(v); };
  const se = useSubEdit();
  const ass = isAss(p.doc);
  const toolsOn = still && (src.kind === "dummy" || !!img);
  const selEvents = p.doc.events.filter((e) => se.sel.includes(e.id));
  const actEv = p.doc.events.find((e) => e.id === se.active) ?? null;
  const toMove = !actEv || !lineMove(actEv);
  const toggleMove = () => {
    if (!selEvents.length) return;
    const ids = new Set(selEvents.map((e) => e.id));
    edit(toMove ? "เปลี่ยนเป็น \\move" : "เปลี่ยนเป็น \\pos", (cur) => ({ ...cur, events: cur.events.map((e) => (ids.has(e.id) ? { ...e, text: togglePosMove(cur, e, d, fr) } : e)) }));
  };
  const keyDown = (e: React.KeyboardEvent) => {
    // A กากบาท S ลากจัดตำแหน่ง ตอนคลิกภาพไว้ (คีย์ลัด Video ของ Aegisub) · ใช้ปุ่มจริงบนแป้น แป้นไทยก็ได้
    if (!e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && (e.code === "KeyA" || e.code === "KeyS")) { e.preventDefault(); setTool(e.code === "KeyA" ? "cross" : "drag"); return; }
    p.onKey(e);
  };

  // แจ้งผลของเมนูคลิกขวา สำเร็จหายเองใน 4 วินาที ผิดพลาดอยู่จนกดปิด (สกิล save-status)
  const [note, setNote] = useState<{ text: string; err?: boolean; busy?: boolean } | null>(null);
  useEffect(() => {
    if (!note || note.err || note.busy) return;
    const tm = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(tm);
  }, [note]);
  const [ctx, setCtx] = useState<{ x: number; y: number; at: V2; pan: boolean } | null>(null);
  const openMenu = (e: React.MouseEvent, at: V2) => {
    const v = view.current;
    const pan = cz !== 1 || (!!v && (Math.abs(v.scrollLeft - (v.scrollWidth - v.clientWidth) / 2) >= 1 || Math.abs(v.scrollTop - (v.scrollHeight - v.clientHeight) / 2) >= 1));
    setCtx({ x: e.clientX, y: e.clientY, at, pan });
  };
  const snapWhy = src.kind === "movie" && !(t && pos != null) ? "กำลังอ่านเวลาของทุกเฟรม รอสักครู่" : undefined;
  const snap = async (mode: SnapReq["mode"], dest: SnapReq["dest"]) => {
    setCtx(null);
    const what = dest === "save" ? "บันทึกภาพ" : "คัดลอกภาพ";
    setNote({ text: `กำลัง${what}…`, busy: true });
    const w = window as unknown as { __snapDry?: boolean; __lastSnap?: unknown };
    const srcPath = p.doc.source && !p.doc.source.inMovie ? p.doc.source.path : "";
    const req: SnapReq = {
      movie: movie || null, ss: t && pos != null ? seekOf(t, pos) : 0, t: (tNow ?? 0) - d, w: natW, h: natH, ow, oh, mode,
      frame: pos ?? 0, dest, dir: srcPath ? srcPath.replace(/[\\/][^\\/]*$/, "") : null, dry: import.meta.env.DEV && !!w.__snapDry,
    };
    try {
      const bg = src.kind === "dummy" && mode !== "only" ? dummyPng(src.spec, natW, natH) : null;
      const r = await vidApi.snapshot(req, mode === "raw" ? null : p.doc, bg);
      if (import.meta.env.DEV) w.__lastSnap = r;
      setNote({ text: dest === "save" ? `บันทึกภาพแล้ว ชื่อ ${(r.path ?? "").split(/[\\/]/).pop()}` : `คัดลอกภาพแล้ว ขนาด ${r.w} × ${r.h}` });
    } catch (e) {
      setNote({ text: `${what}ไม่สำเร็จ ${String(e)}`, err: true });
    }
  };
  const copyCoords = async (at: V2) => {
    setCtx(null);
    const text = vStr(at);
    try {
      const w = window as unknown as { __subClipOut?: string[] };
      if (import.meta.env.DEV && w.__subClipOut) w.__subClipOut.push(text);
      else await navigator.clipboard.writeText(text);
      setNote({ text: `คัดลอกพิกัด ${text} แล้ว` });
    } catch (e) { setNote({ text: `คัดลอกพิกัดไม่สำเร็จ ${String(e)}`, err: true }); }
  };
  // รีเซ็ตการเลื่อนภาพ คืนการขยายเนื้อภาพเป็น 1 เท่า แล้ววางภาพกลางกรอบ (ResetContentZoom)
  const resetPan = () => {
    setCtx(null);
    const v = view.current;
    if (cz !== 1) { centerNext.current = true; setCz(1); return; }
    if (v) { v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2; v.scrollTop = (v.scrollHeight - v.clientHeight) / 2; }
  };
  // กดล้อเมาส์ค้างแล้วลาก เลื่อนภาพที่ขยายเกินกรอบ (แบบ Aegisub ที่ลากด้วยปุ่มกลาง)
  const onViewDown = (e: React.MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const v = view.current;
    if (!v) return;
    const sx = e.clientX, sy = e.clientY, l0 = v.scrollLeft, t0 = v.scrollTop;
    const mv = (m: MouseEvent) => { v.scrollLeft = l0 - (m.clientX - sx); v.scrollTop = t0 - (m.clientY - sy); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  let body: React.ReactNode;
  if (src.kind === "dummy") body = <DummyCanvas spec={src.spec} w={imgW} h={imgH} />;
  else if (src.kind === "movie") body = <>
    {img ? <img src={img} alt={pos != null ? `ภาพหนังเฟรม ${pos}` : "ภาพหนัง"} style={{ width: imgW, height: imgH }} draggable={false} />
      : fail ? <div className="vnone">ดึงภาพหนังไม่ได้</div> : <Skel w={imgW} h={imgH} r={0} />}
    {playing && vp.engine === "aegisub" && <canvas ref={bindPlayCanvas} className="se-vplaycv" style={{ width: imgW, height: imgH }} aria-label="หนังที่กำลังเล่น" data-vplaycv />}
    {playing && vp.engine === "mpv" && <div ref={bindMpvBox} className="se-vplaycv se-vmpv" style={{ width: imgW, height: imgH }} aria-label="หนังที่กำลังเล่นด้วย mpv" data-vmpv />}
  </>;
  else body = (
    <div className="vnone">
      <span>{st.closed ? "ปิดวิดีโออยู่" : "เปิดไฟล์ซับอย่างเดียว จึงไม่มีภาพหนัง"}</span>
      <span className="se-vnonebtns">
        {st.closed && st.movie ? <button type="button" className="btn btn-ghost btn-sm" onClick={reopenVideo} data-vreopen><IbFilm size={15} />เปิดวิดีโอของหนัง</button>
          : p.onAddMovie && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddMovie} data-sub-addvideo><IcFile size={15} />เพิ่มไฟล์วิดีโอ</button>}
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onDummy} data-vdummy-open>วิดีโอจำลอง</button>
      </span>
    </div>
  );

  const dragWhy = !ass ? "ไฟล์ SRT ไม่มีแท็กตำแหน่ง เปลี่ยนเป็น ASS ก่อน" : undefined;
  return (
    <div className="se-video" ref={host} data-vbox>
      <div className="se-vrow">
        <div className="se-vtoolbar" role="toolbar" aria-label="เครื่องมือบนภาพ" data-vtoolbar>
          <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (tool === "cross" ? " pressed" : "")} aria-pressed={tool === "cross"} title="กากบาท (A) ชี้ภาพแล้วเห็นพิกัด ดับเบิลคลิกย้ายบรรทัดที่เลือกมาตรงนั้น" aria-label="เครื่องมือกากบาท" onClick={() => setTool("cross")} data-vtool="cross"><IbCross size={15} /></button>
          <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (tool === "drag" ? " pressed" : "") + (dragWhy ? " btn-wait" : "")} aria-pressed={tool === "drag"} aria-disabled={!!dragWhy || undefined} title={dragWhy ?? "ลากจัดตำแหน่งคำบรรยาย (S) ลากจุดบนภาพแล้วซับย้ายตาม"} aria-label="เครื่องมือลากจัดตำแหน่ง" onClick={() => { if (!dragWhy) setTool("drag"); }} data-vtool="drag"><IbDrag size={15} /></button>
          {tool === "drag" && ass && <>
            <span className="se-vtsep" aria-hidden="true" />
            <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (selEvents.length ? "" : " btn-wait")} aria-disabled={!selEvents.length || undefined}
              title={!selEvents.length ? "เลือกบรรทัดในตารางก่อน" : toMove ? "เปลี่ยนบรรทัดที่เลือกเป็น \\move ซับเลื่อนจากจุดเริ่มไปจุดปลายได้" : "เปลี่ยน \\move ของบรรทัดที่เลือกเป็น \\pos ซับอยู่กับที่"}
              aria-label={toMove ? "เปลี่ยนเป็น move" : "เปลี่ยนเป็น pos"} onClick={toggleMove} data-vtool="movepos" data-vtomove={toMove ? "1" : undefined}><IbMovePos size={15} /></button>
          </>}
          <span className="se-vtinfo"><InfoTip title="เครื่องมือบนภาพ" tip={VISUAL_TIP} /></span>
        </div>
        <div className="se-vview vframe" ref={view} tabIndex={0} style={{ width: boxW, height: boxH }} onKeyDown={keyDown} onMouseDown={onViewDown}
          onContextMenu={(e) => { e.preventDefault(); }} aria-label="ภาพหนัง คลิกแล้วใช้ลูกศรซ้ายขวาเดินทีละเฟรม" data-vframe>
          <div className="se-vimg" style={{ width: layW, height: layH }}>
            {body}
            {still && anyShown && ov && <img className="se-vsubimg" src={ov.url} alt="" draggable={false} style={{ left: lay.x, top: lay.y, width: imgW, height: imgH }} data-vsubimg data-vsubnow={ov.key === ovKey ? "1" : undefined} />}
            {htmlSub && shown && src.kind !== "none" && <div className="vsub" style={{ fontSize: fontPx, bottom: Math.max(8, (layH - imgH) / 2 + imgH * 0.06) }}>{shown}</div>}
            {toolsOn && <VideoTools doc={p.doc} delay={d} fr={fr} pos={pos} tNow={tNow!} lay={lay} w={layW} h={layH} tool={tool} onMenu={openMenu} onFocus={() => view.current?.focus({ preventScroll: true })} />}
          </div>
          {p.ev && ready && <div className="vtime se-voff" data-voff>{`${signedMs(tNow! - (p.ev.start + d))}; ${signedMs(tNow! - (p.ev.end + d))}`}</div>}
        </div>
        {note && <div className={"se-vnote" + (note.err ? " err" : "")} style={{ left: TOOLBAR_W + 6, maxWidth: boxW - 12 }} role={note.err ? "alert" : "status"} data-vnote={note.err ? "err" : note.busy ? "busy" : "ok"}>
          <span>{note.text}</span>
          {note.err && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNote(null)} aria-label="ปิดข้อความ" data-vnote-close>ปิด</button>}
        </div>}
      </div>
      {ctx && <FrameMenu x={ctx.x} y={ctx.y} at={ctx.at} pan={ctx.pan} why={snapWhy} where={src.kind === "dummy" ? "ในโฟลเดอร์ของไฟล์ซับ" : "ในโฟลเดอร์ของหนัง"} onClose={() => setCtx(null)} onSnap={snap} onCoords={copyCoords} onPan={resetPan} />}
      <div className="se-vbar" data-vbar>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "ถอยหนึ่งเฟรม (ลูกศรซ้าย)"} aria-label="ถอยหนึ่งเฟรม" onClick={() => { if (!ready) return; const at = getVidPlay().playing ? null : pos!; stopVidPlay(); seek((at ?? getVid().pos ?? 0) - 1); }} data-vprev><IbFramePrev size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (ready ? "" : " btn-wait")} aria-disabled={!ready || undefined} title={noStep ?? "เดินหนึ่งเฟรม (ลูกศรขวา)"} aria-label="เดินหนึ่งเฟรม" onClick={() => { if (!ready) return; const at = getVidPlay().playing ? null : pos!; stopVidPlay(); seek((at ?? getVid().pos ?? 0) + 1); }} data-vnext><IbFrameNext size={15} /></button>
        <button type="button" className={"btn btn-ghost btn-sm se-vstep se-vplay" + (playWhy ? " btn-wait" : "") + (playing ? " pressed" : "")} aria-disabled={!!playWhy || undefined} aria-pressed={playing}
          title={playWhy ?? (playing ? (vp.err ? `หยุด (Ctrl+P)  ${vp.err}` : "หยุด (Ctrl+P)") : "เล่นหนังจากภาพนี้ เสียงจากแทร็กเดียวกับคลื่นเสียง (Ctrl+P)")} data-vplayerr={vp.err || undefined} aria-label={playing ? "หยุด" : "เล่นหนัง"} onClick={() => { if (!playWhy) togglePlay(); }} data-vplay>
          {playing ? <IbStop size={15} /> : <IbPlay size={15} />}</button>
        <span className={"se-vpos" + (ready && onKey ? " key" : "")} title={ready ? (onKey ? "เฟรมนี้เป็น keyframe" : "เวลาของภาพ ขีด เลขเฟรม") : undefined} data-vpos data-vkey={ready && onKey ? "1" : undefined}>
          {ready ? `${fmtMs(tNow!)} - ${playing && vp.frame != null ? vp.frame : pos}` : st.load === "busy" ? `อ่านเวลาเฟรม ${st.dur > 0 ? Math.min(99, Math.round((st.readTo / st.dur) * 100)) : 0}%` : st.load === "err" ? "อ่านเวลาเฟรมไม่ได้" : "—"}
        </span>
        <button type="button" className={"btn btn-ghost btn-sm se-auto" + (st.auto ? " pressed" : "")} aria-pressed={st.auto} title={st.auto ? "เปิดอยู่ เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดเอง กดเพื่อปิด" : "ปิดอยู่ เลือกบรรทัดแล้วภาพอยู่ที่เดิม กดเพื่อเปิด"} onClick={() => setAuto(!st.auto)} data-vauto>AUTO</button>
        <VideoMenu {...p} fitPct={Math.round(fitS * 1000) / 10} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- เมนูวิดีโอ */

function VideoMenu(p: Props & { fitPct: number }) {
  const st = useVid();
  const src = vidSrc(st);
  const keys = vidKeys(st);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const movie = src.kind === "movie" ? src.path : "";
  const sc = st.scene;
  const pct = sc.dur > 0 ? Math.min(99, Math.round((sc.t / sc.dur) * 100)) : 0;
  const keyText = src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : !movie ? "ยังไม่มีวิดีโอ"
    : `${keys.src === "scenes" ? "จุดเปลี่ยนฉากที่หาเอง" : keys.src === "file" ? `จากไฟล์ ${(keys.file ?? "").split(/[\\/]/).pop()}` : "keyframe ของหนัง"} ${keys.list.length.toLocaleString("en-US")} จุด`;
  const noMovie = movie ? undefined : src.kind === "dummy" ? "วิดีโอจำลองไม่มี keyframe" : "ยังไม่มีวิดีโอ";
  const loadFile = async () => {
    const w = window as unknown as { __vidKeysOpen?: string };
    const f = import.meta.env.DEV && w.__vidKeysOpen ? w.__vidKeysOpen : await pickKeyframes();
    if (!f) return;
    vidApi.keysLoad(f).then((list) => { setKeys(list, "file", f); setMsg(`เปิดไฟล์ keyframe แล้ว ${list.length.toLocaleString("en-US")} จุด`); }, (e) => setMsg(String(e)));
  };
  const saveFile = async () => {
    const w = window as unknown as { __vidKeysSave?: string };
    const base = movie.replace(/\.[^.\\/]+$/, "") + "_keyframes.txt";
    const f = import.meta.env.DEV && w.__vidKeysSave ? w.__vidKeysSave : await pickSave(base, "txt", "ไฟล์ keyframe");
    if (!f) return;
    vidApi.keysSave(f, keys.list).then((r) => setMsg(`บันทึกแล้ว ${r.split(/[\\/]/).pop()}`), (e) => setMsg(String(e)));
  };
  const item = (label: string, run: () => void, why?: string, data?: string, icon?: React.ReactNode) => (
    <button type="button" className={"se-vmi" + (why ? " off" : "")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) { run(); } }} data-vmi={data}>{icon}{label}</button>
  );
  const zoomVal = st.zoom ? String(st.zoom) : "0";
  return (
    <div ref={wrap} className="se-vmenuwrap">
      <button type="button" className={"btn btn-ghost btn-sm se-vstep" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title="เมนูวิดีโอ ขนาดภาพ keyframe วิดีโอจำลอง" aria-label="เมนูวิดีโอ" onClick={() => { setOpen((o) => !o); setMsg(null); }} data-vmenu>
        <IbFilm size={15} />{sc.busy && <span className="se-vbadge">{pct}%</span>}
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu" role="dialog" aria-label="เมนูวิดีโอ" style={{ position: "absolute", ...sideStyle(side, "right"), width: 330, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-vmenupanel>
          <div className="se-vmrow"><span className="se-vmh">ขนาดภาพ</span>
            <Dropdown label="ขนาดภาพ" value={ZOOMS.includes(st.zoom) || st.zoom === 0 ? zoomVal : "own"} display={() => (st.zoom ? `${st.zoom}%` : `พอดีกรอบ ${p.fitPct}%`)} sizes={["พอดีกรอบ 100.0%", "1000%"]}
              options={[{ value: "0", label: "พอดีกรอบ" }, ...ZOOMS.map((v) => ({ value: String(v), label: `${v}%` })), ...(st.zoom && !ZOOMS.includes(st.zoom) ? [{ value: "own", label: `${st.zoom}%` }] : [])]}
              onChange={(v) => { if (v !== "own") { setZoom(Number(v)); setOpen(false); } }} />
            <InfoTip title="กรอบวิดีโอ" tip={VIDEO_TIP} />
          </div>
          <div className="se-vmsec">
            <div className="se-vmrow"><span className="se-vmh">keyframe</span><InfoTip title="keyframe" tip={KEY_TIP} /><span className="small se-vmkeys" data-vkeysrc>{keyText}</span></div>
            {sc.busy ? (
              <div className="se-vmrow" data-vscenes-busy>
                <div className="se-vprog"><div style={{ width: `${pct}%` }} /></div>
                <span className="small">{`หาจุดเปลี่ยนฉาก ${pct}%`}</span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={stopScenes} data-vscenes-stop>หยุด</button>
              </div>
            ) : item("หาจุดเปลี่ยนฉากจริง (ถอดภาพทั้งเรื่อง)", () => void findScenes(), noMovie, "scenes")}
            {sc.err && <div className="small se-vmerr" role="alert">{sc.err}</div>}
            <div className="se-vmpair">
              {item("เปิดไฟล์ keyframe", () => void loadFile(), noMovie, "keysopen")}
              {item("บันทึกเป็นไฟล์", () => void saveFile(), noMovie ?? (keys.list.length ? undefined : "ยังไม่มี keyframe ให้บันทึก"), "keyssave")}
            </div>
            {movie && keys.src !== "movie" && item("กลับไปใช้ keyframe ของหนัง", () => setKeys(null), undefined, "keysmovie")}
            <div className="se-vmrow se-vmsw"><span>ซ่อนเส้น keyframe บนคลื่นเสียง</span><Switch on={st.hideKeys} onChange={setHideKeys} label="ซ่อนเส้น keyframe บนคลื่นเสียง" /></div>
          </div>
          <div className="se-vmsec">
            {item("ข้ามไปยังเฟรมหรือเวลา (Ctrl+G)", () => { setOpen(false); p.onJump(); }, vidRate(st) ? undefined : "ยังไม่มีวิดีโอ หรือยังอ่านเวลาเฟรมไม่เสร็จ", "jump", <IbJump size={15} />)}
            {item("รายละเอียดวิดีโอ", () => { setOpen(false); p.onDetails(); }, src.kind === "none" ? "ยังไม่มีวิดีโอ" : src.kind === "movie" && !st.table ? "ยังอ่านข้อมูลวิดีโอไม่เสร็จ" : undefined, "details")}
            <div className="se-vmpair">
              {item("วิดีโอจำลอง", () => { setOpen(false); p.onDummy(); }, undefined, "dummy")}
              {src.kind !== "none" ? item(src.kind === "dummy" ? "ปิดวิดีโอจำลอง" : "ปิดวิดีโอ", () => { setOpen(false); p.onClose(); closeVideo(); }, undefined, "close")
                : st.closed && st.movie ? item("เปิดวิดีโอของหนัง", () => { setOpen(false); reopenVideo(); }, undefined, "reopen") : null}
            </div>
            {st.load === "err" && movie && item("ลองอ่านเวลาเฟรมใหม่", vidRetry, undefined, "retry")}
          </div>
          {msg && <div className="small se-vmmsg" role="status" data-vmsg>{msg}</div>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- เมนูคลิกขวาบนภาพ (default_menu.json video_context ของ Aegisub) */

type FrameMenuProps = {
  x: number; y: number; at: V2; pan: boolean;
  /** เหตุผลที่ยังบันทึกหรือคัดลอกภาพไม่ได้ */
  why?: string;
  /** ที่บันทึกภาพ บอกในคำอธิบายของปุ่ม */
  where: string;
  onClose: () => void;
  onSnap: (mode: SnapReq["mode"], dest: SnapReq["dest"]) => void;
  onCoords: (at: V2) => void;
  onPan: () => void;
};

function FrameMenu(p: FrameMenuProps) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useEscClose(true, p.onClose);
  useClickOutside(true, box, p.onClose);
  // วางที่เมาส์ ขวาไม่พอกางไปซ้าย ล่างไม่พอกางขึ้น ไม่ทับแถบที่ตรึงด้านบน (สกิล popup-fit)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = window.innerWidth, H = window.innerHeight, top0 = visibleTop() + 8;
    const left = p.x + r.width + 8 <= W ? p.x : Math.max(8, p.x - r.width);
    const top = Math.max(top0, Math.min(p.y + r.height + 8 <= H ? p.y : p.y - r.height, H - 8 - r.height));
    setPlace({ left, top });
  }, [p.x, p.y]);
  useEffect(() => {
    const close = () => p.onClose();
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const it = (label: string, run: () => void, tip: string, why: string | undefined, data: string) => (
    <button type="button" role="menuitem" className={"se-vmi" + (why ? " off" : "")} aria-disabled={!!why || undefined} title={why ?? tip} onClick={() => { if (!why) run(); }} data-vctx={data}>{label}</button>
  );
  return (
    <div ref={box} className="menu pop-in se-vctx" role="menu" aria-label="เมนูของภาพ"
      style={{ position: "fixed", left: place?.left ?? p.x, top: place?.top ?? p.y, visibility: place ? "visible" : "hidden", zIndex: "var(--z-menu)" as unknown as number }} data-vctxmenu>
      {it("บันทึกภาพ PNG", () => p.onSnap("subs", "save"), `บันทึกภาพที่เห็นพร้อมซับเป็นไฟล์ PNG ${p.where} ไม่เขียนทับไฟล์เดิม`, p.why, "save")}
      {it("คัดลอกภาพ", () => p.onSnap("subs", "copy"), "คัดลอกภาพที่เห็นพร้อมซับลงคลิปบอร์ด", p.why, "copy")}
      <div className="se-vctxsep" role="separator" />
      {it("บันทึกภาพ PNG ไม่มีซับ", () => p.onSnap("raw", "save"), `บันทึกภาพที่เห็นโดยไม่มีซับเป็นไฟล์ PNG ${p.where}`, p.why, "save-raw")}
      {it("คัดลอกภาพ ไม่มีซับ", () => p.onSnap("raw", "copy"), "คัดลอกภาพที่เห็นโดยไม่มีซับลงคลิปบอร์ด", p.why, "copy-raw")}
      <div className="se-vctxsep" role="separator" />
      {it("บันทึกเฉพาะซับ พื้นโปร่งใส", () => p.onSnap("only", "save"), `บันทึกเฉพาะซับที่ขึ้นบนภาพนี้ พื้นหลังโปร่งใส เป็นไฟล์ PNG ${p.where}`, p.why, "save-only")}
      {it("คัดลอกเฉพาะซับ พื้นโปร่งใส", () => p.onSnap("only", "copy"), "คัดลอกเฉพาะซับที่ขึ้นบนภาพนี้ พื้นหลังโปร่งใส ลงคลิปบอร์ด", p.why, "copy-only")}
      <div className="se-vctxsep" role="separator" />
      <div className="se-vctxrow">
        {it(`คัดลอกพิกัด ${vStr(p.at)}`, () => p.onCoords(p.at), "คัดลอกพิกัดตรงที่คลิกขวาลงคลิปบอร์ด", undefined, "coords")}
        <InfoTip title="พิกัด" tip={COORD_TIP} />
      </div>
      {it("รีเซ็ตการเลื่อนภาพ", p.onPan, "คืนเนื้อภาพที่ขยายด้วย Ctrl กับล้อเมาส์ แล้ววางภาพกลางกรอบ", p.pan ? undefined : "ภาพไม่ได้ขยายหรือเลื่อนอยู่", "pan")}
    </div>
  );
}
