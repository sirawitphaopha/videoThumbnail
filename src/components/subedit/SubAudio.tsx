/* กรอบคลื่นเสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109 · แบบ audio_display.cpp กับ audio_timing_dialogue.cpp ของ Aegisub)
   วาด ช่วงของทุกบรรทัดจาง ช่วงของบรรทัดที่เลือกไว้หลายบรรทัดอีกสี ช่วงของบรรทัดที่กำลังแก้เข้ม รูปคลื่นหรือภาพความถี่
     เส้นทุกหนึ่งวินาที เส้น keyframe เส้นตำแหน่งภาพหนังกับช่วงของเฟรม ขอบเริ่ม (แดง) ขอบจบ (น้ำเงิน) เส้นที่กำลังเล่น เส้นตามเมาส์พร้อมเวลา
   ลากเวลา ใกล้ขอบไม่เกิน 8 จุดลากขอบนั้น · กดซ้ายไกลจากขอบ เริ่มช่วงใหม่ที่จุดกดแล้วลากหาจุดจบ · กดขวา ขอบจบมาที่จุดกด
     Ctrl ลากขอบของบรรทัดอื่นที่อยู่ที่เดียวกันไปด้วย · Alt เลื่อนทั้งบรรทัด · Shift ระหว่างลาก ปิดเปิดการดูดติดเส้นชั่วคราว
     ดูดติด keyframe ขอบเฟรมของภาพที่แสดง และขอบของบรรทัดอื่น ระยะ 8 จุด · ปุ่มกลางพาภาพหนังไปเวลานั้น · ปล่อยใกล้ขอบภาพเลื่อนภาพไปหนึ่งในสาม
   ที่ลากไว้ยังไม่ลงบรรทัดจนกดยืนยัน (เปิดยืนยันทันทีแล้วลงเลย) · ล้อเมาส์เลื่อนซ้ายขวา Ctrl กับล้อซูม
   แถบเลื่อนตั้งสามอันทางขวา ซูมแนวนอน ซูมแนวตั้ง ความดัง กับปุ่มโซ่ผูกสองอันหลัง · ลากขอบล่างปรับความสูง จำไว้
   รูปคลื่นขอทีละแผ่น 512 จุด (sub_peaks) เก็บไว้ เลื่อนกลับมาไม่ถอดซ้ำ · ภาพความถี่ขอเฉพาะช่วงที่เห็น (graph_window) */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { audApi, graphApi, pickFile, pickSave, type GWindow, type SubDoc, type SubEvent } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { playNow, setVolume, usePlay } from "../../lib/audioPlay";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { cube, getTiming, msPerPx, rangeOf, scrollIntoView, setLeft, setOpt, setOwnAudio, setPend, setViewW, useTiming, zoomFactor, type AudSource, type Pend } from "../../lib/subTiming";
import { fmtMs, getVid, useVid, vidKeys, vidRate } from "../../lib/vidFrames";
import InfoTip from "../InfoTip";
import { IcFile } from "../icons";

/** สีภาพความถี่ เงียบเข้ม ดังสว่าง (โทนเดียวกับหน้ากราฟเสียง) · เป็นเนื้อหาของกราฟ ไม่เปลี่ยนตามโทนสี */
const RAMP = ["#160c22", "#4a1d5c", "#a8327a", "#ef6f6c", "#fde3a7"];
const LUT = (() => { const o = new Uint8ClampedArray(256 * 3); for (let i = 0; i < 256; i++) { const q = (i / 255) * (RAMP.length - 1), k = Math.min(RAMP.length - 2, Math.floor(q)), f = q - k; for (let j = 0; j < 3; j++) { const a = parseInt(RAMP[k].slice(1 + j * 2, 3 + j * 2), 16), b = parseInt(RAMP[k + 1].slice(1 + j * 2, 3 + j * 2), 16); o[i * 3 + j] = a * (1 - f) + b * f; } } return o; })();
const WAVE_TIP: Tip = {
  w: "แถบสีจางคือเวลาของแต่ละบรรทัด เลขบนแถบคือลำดับบรรทัด แถบเข้มคือบรรทัดที่กำลังแก้ เส้นแดงคือเวลาเริ่ม เส้นน้ำเงินคือเวลาจบ  เส้นประสีม่วงคือ keyframe ซึ่งมักตรงจุดเปลี่ยนฉาก เส้นสีเขียวคือตำแหน่งของภาพหนัง และเส้นสีเทาเข้มคือจุดที่กำลังเล่นเสียง  ลากเส้นแดงหรือเส้นน้ำเงินเพื่อเปลี่ยนเวลา กดซ้ายที่ว่างเริ่มช่วงใหม่ กดขวาตั้งเวลาจบ แล้วกดยืนยัน (Enter หรือ G) เวลาถึงลงบรรทัด",
  o: [
    ["Ctrl กับลาก", "ลากขอบของบรรทัดอื่นที่อยู่ตรงเดียวกันไปด้วย", "บรรทัดที่ต่อกันยังต่อกัน", "ต้องกดตรงขอบที่ซ้อนกันพอดี"],
    ["Alt กับลาก", "เลื่อนทั้งบรรทัด ความยาวเท่าเดิม", "ย้ายซับที่ยาวพอดีแล้วไปที่ใหม่", "—"],
    ["Shift ระหว่างลาก", "ปิดการดูดติดเส้นชั่วคราว ปกติขอบที่ลากดูดติด keyframe ขอบเฟรม และขอบบรรทัดอื่นที่ห่างไม่เกิน 8 จุด", "วางขอบตรงที่ต้องการได้ละเอียด", "—"],
  ],
  r: "ล้อเมาส์เลื่อนซ้ายขวา Ctrl กับล้อซูม ปุ่มกลางของเมาส์พาภาพหนังไปเวลานั้น",
};
const SLIDER_TIP: Tip = {
  w: "แถบเลื่อนตั้งสามอันข้างคลื่นเสียง ลากขึ้นเพิ่ม ลากลงลด",
  o: [
    ["ซูมแนวนอน", "ถ่างหรือหดเวลาบนจอ 100% คือ 50 จุดต่อวินาที ถ่างได้ถึง 850%", "ซูมเข้าวางขอบเวลาได้ละเอียด", "ซูมมากเห็นช่วงสั้นลง"],
    ["ซูมแนวตั้ง", "ขยายความสูงของคลื่น เสียงเบาก็เห็นชัด", "เห็นจุดเริ่มพูดของเสียงเบา", "ขยายมากคลื่นเสียงดังล้นกรอบ"],
    ["ความดัง", "ความดังตอนเล่นเสียงในหน้านี้", "ฟังเสียงพูดเบาได้ชัด", "—"],
  ],
  r: "เปิดโซ่ไว้ ซูมแนวตั้งกับความดังเลื่อนพร้อมกัน แบบค่าตั้งต้นของ Aegisub",
};

const TILE = 512;
/** แผ่นรูปคลื่นที่ขอแล้ว เก็บตามลำดับใช้ล่าสุด ไม่เกิน 300 แผ่น */
const tiles = new Map<string, number[]>();
const inflight = new Set<string>();
const putTile = (k: string, v: number[]) => { tiles.delete(k); tiles.set(k, v); while (tiles.size > 300) tiles.delete(tiles.keys().next().value!); };

const fmtRuler = (ms: number, step: number) => {
  const s = Math.max(0, ms / 1000), m = Math.floor(s / 60), sec = s - m * 60;
  return step >= 1000 ? `${m}:${String(Math.round(sec)).padStart(2, "0")}` : `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

type Props = {
  doc: SubDoc;
  ev: SubEvent | null;
  sel: number[];
  delayMs: number;
  /** เสียงของหนัง (ไม่มี = null) · ไฟล์เสียงแยกที่ผู้ใช้เปิดมาแทนอยู่ใน store */
  movie: AudSource;
  noAudio: string;
  /** ยืนยันอัตโนมัติหลังปล่อยเมาส์ (เปิดยืนยันทันทีอยู่) */
  onAutoCommit: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** ปุ่มกลางของเมาส์ พาภาพหนังไปเวลานี้ (เวลาของหนัง ms) */
  onSeekVideo: (ms: number) => void;
};

type Drag =
  | { k: "edge"; fixed: number; moving: number; links: Pend["links"]; linkSide: ("start" | "end")[]; cand: number[] }
  | { k: "shift"; clicked: number; base: { start: number; end: number }; cand: number[] };

export default function SubAudio(p: Props) {
  const tm = useTiming();
  const vs = useVid();
  const pl = usePlay();
  const o = tm.opts;
  const src = tm.own ?? p.movie;
  const d = p.delayMs;
  const mpp = msPerPx(o.hzoom);
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);
  const [spec, setSpec] = useState<{ key: string; t0: number; t1: number; w: GWindow } | null>(null);
  const [, bump] = useState(0);
  const [mouse, setMouse] = useState<number | null>(null);
  const [cursor, setCursor] = useState("default");
  const drag = useRef<Drag | null>(null);
  const tileMs = TILE * mpp;
  const left = tm.left;
  const right = left + w * mpp;
  const h = o.height;

  // ความกว้างจริงของภาพคลื่นเสียง
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setW(Math.max(100, Math.floor(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src?.path]);

  useEffect(() => setViewW(w), [w]);
  // ความดังตอนเล่น · ผูกโซ่อยู่ใช้ค่าซูมแนวตั้ง
  useEffect(() => setVolume(cube(o.link ? o.vzoom : o.volume)), [o.link, o.vzoom, o.volume]);

  // เปลี่ยนบรรทัดก่อนยืนยัน ทิ้งที่ลากไว้ (Revert ของ Aegisub) · เลื่อนตามบรรทัดที่เลือก (AUTO เลื่อนตาม)
  useEffect(() => {
    const pd = getTiming().pend;
    if (pd && pd.id !== p.ev?.id) setPend(null);
    if (!p.ev) return;
    if (getTiming().opts.autoScroll || getTiming().left === 0) scrollToLine();
  }, [p.ev?.id, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToLine = () => {
    if (!p.ev) return;
    const r = rangeOf(p.ev);
    scrollIntoView(r.start + d, r.end + d, w, mpp);
  };

  // ขอแผ่นรูปคลื่นที่เห็นกับข้างละหนึ่งแผ่น ทีละไม่เกินสามคำขอ · แผ่นเสร็จแล้ววาดใหม่ตราบที่กรอบยังเปิดอยู่
  // (เดิมใช้ตัวบอกของแต่ละรอบ ตัวดักนี้รันทุกครั้งที่วาด รอบเก่าถูกปิดก่อนแผ่นมาถึง รูปคลื่นจึงไม่ขึ้น)
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!src || o.spectrum) return;
    const k0 = Math.floor(left / tileMs) - 1, k1 = Math.floor(right / tileMs) + 1;
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const key = `${src.path}|${src.map}|${src.zero ?? ""}|${mpp}|${k}`;
      if (tiles.has(key) || inflight.has(key) || inflight.size >= 3) continue;
      inflight.add(key);
      audApi.peaks(src.path, src.map, (k * tileMs) / 1000, ((k + 1) * tileMs) / 1000, TILE, src.zero ?? null)
        .then((v) => putTile(key, v), () => putTile(key, []))
        .finally(() => { inflight.delete(key); if (alive.current) bump((x) => x + 1); });
    }
  });

  // ภาพความถี่ของช่วงที่เห็น รอหยุดเลื่อนก่อนขอ
  useEffect(() => {
    if (!src || !o.spectrum) return;
    const key = `${src.path}|${src.idx}|${Math.round(left)}|${Math.round(right)}|${w}`;
    if (spec?.key === key) return;
    let live = true;
    const t = setTimeout(() => graphApi.window(src.path, src.idx, Math.max(0, left) / 1000, right / 1000, Math.min(1200, w), 128, true)
      .then((g) => { if (live && g) setSpec({ key, t0: left, t1: right, w: g }); }, () => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [src?.path, src?.idx, o.spectrum, left, right, w]); // eslint-disable-line react-hooks/exhaustive-deps

  // เส้นที่กำลังเล่นขยับทุกเฟรมระหว่างเล่น
  useEffect(() => {
    if (!pl.playing) return;
    let raf = 0;
    const tick = () => { bump((x) => x + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pl.playing]);

  const X = (t: number) => (t - left) / mpp;
  const fr = vidRate(vs);

  // ภาพความถี่ทำครั้งเดียวต่อข้อมูลชุดหนึ่ง (ถอด base64 ทุกช่องแล้วลงสี) · รอบวาดแค่แปะภาพ
  // เดิมทำใหม่ทุกรอบวาด ระหว่างเล่นเสียงหรือขยับเมาส์ถอดใหม่ 60 ครั้งต่อวินาที เส้นเล่นสะดุด (ผู้ช่วยตรวจทาน F11)
  const specImg = useMemo(() => {
    if (!spec || !spec.w.spec.length) return null;
    const chs = spec.w.spec.map((b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))), cols = spec.w.cols, bins = spec.w.bins;
    const off = document.createElement("canvas"); off.width = cols; off.height = bins;
    const og = off.getContext("2d")!, img = og.createImageData(cols, bins);
    for (let row = 0; row < bins; row++) for (let col = 0; col < cols; col++) {
      let v = 0; for (const a of chs) v = Math.max(v, a[col * bins + (bins - 1 - row)] ?? 0);
      const q = (row * cols + col) * 4; img.data[q] = LUT[v * 3]; img.data[q + 1] = LUT[v * 3 + 1]; img.data[q + 2] = LUT[v * 3 + 2]; img.data[q + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    return off;
  }, [spec]);

  // วาดทั้งภาพ
  useLayoutEffect(() => {
    const el = cv.current;
    if (!el || !src) return;
    const r = window.devicePixelRatio || 1;
    el.width = Math.round(w * r); el.height = Math.round(h * r);
    const g = el.getContext("2d")!;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    const sp = o.spectrum && spec ? spec : null;
    if (sp && specImg) {
      g.imageSmoothingEnabled = true;
      g.drawImage(specImg, X(sp.t0), 0, (sp.t1 - sp.t0) / mpp, h);
    }
    // ช่วงของบรรทัด · บรรทัดอื่นจาง บรรทัดที่เลือกไว้หลายบรรทัดอีกสี บรรทัดที่กำลังแก้เข้ม
    const sel = new Set(p.sel);
    const act = p.ev ? rangeOf(p.ev) : null;
    p.doc.events.forEach((x, i) => {
      if (x.comment) return;
      const rr = x.id === p.ev?.id && act ? act : x;
      const a = rr.start + d, b = rr.end + d;
      if (b < left || a > right) return;
      const on = x.id === p.ev?.id;
      g.fillStyle = on ? "rgba(233,138,172,.34)" : sel.has(x.id) ? "rgba(140,170,230,.30)" : "rgba(233,138,172,.13)";
      g.fillRect(X(a), 0, X(b) - X(a), h);
      if (!on) { g.fillStyle = "rgba(120,120,120,.45)"; g.fillRect(Math.round(X(a)), 0, 1, h); g.fillRect(Math.round(X(b)), 0, 1, h); }
      g.fillStyle = sp ? "#ffffff" : on ? "#7a2346" : "#b28a9a"; g.font = `${on ? 700 : 600} 11px Sarabun`; g.fillText(String(i + 1), X(a) + 4, 13);
    });
    // รูปคลื่น
    if (!sp) {
      const mid = h / 2, scale = cube(o.vzoom);
      g.fillStyle = "rgba(74,43,56,.10)"; g.fillRect(0, Math.round(mid), w, 1);
      g.fillStyle = "#d9719a";
      for (let x = 0; x < w; x++) {
        const t = left + x * mpp;
        if (t < 0) continue;
        const k = Math.floor(t / tileMs), v = tiles.get(`${src.path}|${src.map}|${src.zero ?? ""}|${mpp}|${k}`);
        if (!v || !v.length) continue;
        const a = v[Math.min(v.length - 1, Math.floor((t - k * tileMs) / mpp))] ?? 0;
        const y = Math.min(1, a * scale) * (mid - 2);
        g.fillRect(x, mid - y, 1, Math.max(1, y * 2));
      }
    }
    // เส้นทุกหนึ่งวินาที (Seconds Line ของ Aegisub) ซูมออกมากจนเส้นชิดกันไม่วาด
    if (1000 / mpp >= 12) {
      g.fillStyle = sp ? "rgba(255,255,255,.25)" : "rgba(0,100,255,.16)";
      for (let s = Math.ceil(left / 1000) * 1000; s <= right; s += 1000) g.fillRect(Math.round(X(s)), 0, 1, h);
    }
    // เส้น keyframe ที่เวลาเริ่มของเฟรม (ใช้ START แบบ Aegisub)
    const kl = vs.hideKeys ? [] : vidKeys(vs).list;
    if (fr && kl.length) {
      const a = fr.frameAt(left), b = fr.frameAt(right) + 1;
      let i = 0, j = kl.length;
      while (i < j) { const m = (i + j) >> 1; if (kl[m] < a) i = m + 1; else j = m; }
      g.strokeStyle = sp ? "#ffffff" : "#6b4fd6"; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      for (; i < kl.length && kl[i] <= b; i++) { const x = Math.round(X(fr.timeAt(kl[i], "start"))) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.setLineDash([]);
    }
    // ตำแหน่งภาพหนัง กับแถบบางของช่วงเฟรมนี้และเฟรมก่อน
    if (fr && vs.pos != null) {
      const t = fr.timeAt(vs.pos), tp = fr.timeAt(vs.pos - 1), tn = fr.timeAt(vs.pos + 1);
      g.fillStyle = "rgba(31,138,112,.10)"; g.fillRect(X(t), 0, Math.max(1, X(tn) - X(t)), h);
      g.fillStyle = "rgba(31,138,112,.05)"; g.fillRect(X(tp), 0, Math.max(1, X(t) - X(tp)), h);
      const x = X(t);
      if (x >= 0 && x <= w) { g.fillStyle = sp ? "#9df2c8" : "#1f8a70"; g.fillRect(Math.round(x) - 1, 0, 2, h); }
    }
    // ขอบเริ่มกับขอบจบของบรรทัดที่กำลังแก้ มีหัวเล็กชี้เข้าหากัน (Line boundary Start แดง End น้ำเงิน)
    if (act) {
      const xa = Math.round(X(act.start + d)), xb = Math.round(X(act.end + d));
      g.fillStyle = "#d22b2b"; g.fillRect(xa - 1, 0, 2, h);
      g.beginPath(); g.moveTo(xa + 1, 0); g.lineTo(xa + 8, 0); g.lineTo(xa + 1, 7); g.fill();
      g.beginPath(); g.moveTo(xa + 1, h); g.lineTo(xa + 8, h); g.lineTo(xa + 1, h - 7); g.fill();
      g.fillStyle = "#2440c8"; g.fillRect(xb - 1, 0, 2, h);
      g.beginPath(); g.moveTo(xb - 1, 0); g.lineTo(xb - 8, 0); g.lineTo(xb - 1, 7); g.fill();
      g.beginPath(); g.moveTo(xb - 1, h); g.lineTo(xb - 8, h); g.lineTo(xb - 1, h - 7); g.fill();
    }
    // จุดที่กำลังเล่น
    const now = playNow();
    if (now != null) { const x = X(now); if (x >= 0 && x <= w) { g.fillStyle = sp ? "#ffffff" : "#3a3a3a"; g.fillRect(Math.round(x), 0, 1.5, h); } }
    // เส้นตามเมาส์พร้อมเวลา
    if (mouse != null && !drag.current) {
      const x = X(mouse);
      g.fillStyle = sp ? "rgba(255,255,255,.7)" : "rgba(58,37,44,.55)"; g.fillRect(Math.round(x), 0, 1, h);
      const label = fmtMs(Math.max(0, mouse));
      g.font = "600 11px Sarabun";
      const tw = g.measureText(label).width + 8, lx = Math.min(w - tw - 2, Math.max(2, x + 6));
      g.fillStyle = "rgba(255,255,255,.88)"; g.fillRect(lx, h - 18, tw, 15);
      g.fillStyle = "#3a252c"; g.fillText(label, lx + 4, h - 7);
    }
  });

  // ---------------------------------------------------------------- เมาส์

  const subAt = (clientX: number) => { const b = cv.current!.getBoundingClientRect(); return left + (clientX - b.left) * mpp - d; };
  /** เส้นที่ขอบดูดติดได้ (เวลาซับ) · keyframe ขอบเฟรมของภาพที่แสดง ขอบของบรรทัดอื่นที่เห็น (SnapMarkers ของ Aegisub) */
  const candidates = (skip: Set<number>) => {
    const c: number[] = [];
    const f = vidRate(), v = getVid();
    if (f) {
      for (const k of v.hideKeys ? [] : vidKeys(v).list) { const t = f.timeAt(k, "start"); if (t >= left - 2000 && t <= right + 2000) c.push(t - d); }
      if (v.pos != null) c.push(f.timeAt(v.pos, "start") - d, f.timeAt(v.pos, "end") - d);
    }
    for (const x of p.doc.events) {
      if (x.comment || skip.has(x.id)) continue;
      if (x.end + d < left - 2000 || x.start + d > right + 2000) continue;
      c.push(x.start, x.end);
    }
    return c;
  };
  const snap = (t: number, cand: number[], on: boolean) => {
    if (!on) return t;
    let best = t, bd = 8 * mpp + 0.001;
    for (const c of cand) { const dd = Math.abs(c - t); if (dd < bd) { bd = dd; best = c; } }
    return Math.round(best);
  };
  const near = (t: number) => {
    if (!p.ev) return null;
    const r = rangeOf(p.ev), sens = 8 * mpp;
    const dl = Math.abs(r.start - t), dr = Math.abs(r.end - t);
    if (dl > sens && dr > sens) return null;
    return dl <= dr ? "start" : "end";
  };

  const apply = (start: number, end: number, links: Pend["links"]) => {
    if (!p.ev) return;
    const a = Math.round(Math.min(start, end)), b = Math.round(Math.max(start, end));
    setPend({ id: p.ev.id, start: a, end: b, links });
  };

  const onDown = (e: React.MouseEvent) => {
    if (!p.ev || !src) return;
    cv.current?.focus({ preventScroll: true });
    const t = subAt(e.clientX);
    if (e.button === 1) { e.preventDefault(); p.onSeekVideo(t + d); return; }
    const r = rangeOf(p.ev);
    const snapOn = !e.shiftKey;
    if (e.button === 0 && e.altKey) {
      drag.current = { k: "shift", clicked: t, base: r, cand: candidates(new Set([p.ev.id])) };
    } else if (e.button === 2) {
      const cand = candidates(new Set([p.ev.id]));
      const at = snap(t, cand, snapOn);
      apply(r.start, at, []);
      drag.current = { k: "edge", fixed: r.start, moving: at, links: [], linkSide: [], cand };
    } else if (e.button === 0) {
      const which = near(t);
      if (!which) {
        // กดไกลจากขอบ ขอบเริ่มกระโดดมาที่จุดกด แล้วลากขอบอีกข้างหาจุดจบ (Drag Timing ของ Aegisub)
        const cand = candidates(new Set([p.ev.id]));
        const at = snap(t, cand, snapOn);
        apply(at, r.end, []);
        drag.current = { k: "edge", fixed: at, moving: r.end, links: [], linkSide: [], cand };
      } else {
        const pos = which === "start" ? r.start : r.end;
        // Ctrl ลากขอบของบรรทัดอื่นที่อยู่ตรงเดียวกันไปด้วย
        const links: Pend["links"] = [], side: ("start" | "end")[] = [];
        if (e.ctrlKey || e.metaKey) for (const x of p.doc.events) {
          if (x.id === p.ev.id || x.comment) continue;
          if (x.start === pos) { links.push({ id: x.id, start: x.start, end: x.end }); side.push("start"); }
          else if (x.end === pos) { links.push({ id: x.id, start: x.start, end: x.end }); side.push("end"); }
        }
        const skip = new Set([p.ev.id, ...links.map((l) => l.id)]);
        const cand = candidates(skip);
        // กดใกล้ขอบเริ่ม ขอบเริ่มมาที่จุดกดทันที (ขอบจบไม่กระโดด) แบบ Aegisub
        const moving = which === "start" ? snap(t, cand, snapOn) : r.end;
        const fixed = which === "start" ? r.end : r.start;
        const lk = links.map((l, i) => (side[i] === "start" ? { ...l, start: moving } : { ...l, end: moving }));
        apply(fixed, moving, lk);
        drag.current = { k: "edge", fixed, moving, links, linkSide: side, cand };
      }
    }
    const move = (ev: MouseEvent) => {
      const dr = drag.current;
      if (!dr || !p.ev) return;
      const tt = subAt(ev.clientX);
      const on = !ev.shiftKey;
      if (dr.k === "shift") {
        // เลื่อนทั้งบรรทัด ดูดติดด้วยขอบที่ใกล้เส้นกว่า
        let delta = tt - dr.clicked;
        const s = snap(dr.base.start + delta, dr.cand, on), en = snap(dr.base.end + delta, dr.cand, on);
        const ds = s - (dr.base.start + delta), de = en - (dr.base.end + delta);
        delta += Math.abs(ds) <= Math.abs(de) ? ds : de;
        apply(dr.base.start + delta, dr.base.end + delta, []);
        return;
      }
      const at = snap(tt, dr.cand, on);
      dr.moving = at;
      apply(dr.fixed, at, dr.links.map((l, i) => (dr.linkSide[i] === "start" ? { ...l, start: at } : { ...l, end: at })));
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      drag.current = null;
      // ปล่อยใกล้ขอบภาพไม่เกิน 5% เลื่อนภาพไปทางนั้นหนึ่งในสาม
      const b = cv.current?.getBoundingClientRect();
      if (b) {
        const x = ev.clientX - b.left;
        if (x < b.width * 0.05) setLeft(Math.max(0, getTiming().left - (w * mpp) / 3));
        else if (x > b.width * 0.95) setLeft(getTiming().left + (w * mpp) / 3);
      }
      if (getTiming().opts.autoCommit && getTiming().pend) p.onAutoCommit();
      bump((x) => x + 1);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const onHover = (e: React.MouseEvent) => {
    if (drag.current) return;
    const t = subAt(e.clientX);
    setMouse(t + d);
    setCursor(e.altKey ? "move" : near(t) ? "ew-resize" : "default");
  };

  // ล้อเมาส์ เลื่อนซ้ายขวา · Ctrl กับล้อซูมโดยเวลาตรงเมาส์อยู่ที่เดิม · ตัวดักแบบไม่ passive ถึงกันหน้าเลื่อนได้
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const tmn = getTiming(), m = msPerPx(tmn.opts.hzoom);
      const b = el.getBoundingClientRect(), x = e.clientX - b.left;
      if (e.ctrlKey) {
        const lv = Math.max(-50, Math.min(30, tmn.opts.hzoom + (e.deltaY < 0 ? 1 : -1)));
        const at = tmn.left + x * m;
        setOpt("hzoom", lv);
        setLeft(Math.max(0, at - x * msPerPx(lv)));
      } else setLeft(Math.max(0, tmn.left + (e.deltaY + e.deltaX) * m));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src?.path]);

  // ลากขอบล่างปรับความสูง 80 ถึง 360 จุด จำไว้
  const grip = (e: React.MouseEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = o.height;
    const move = (ev: MouseEvent) => setOpt("height", Math.max(80, Math.min(360, Math.round(h0 + ev.clientY - y0))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ซูมแนวนอนจากแถบเลื่อน เวลากลางภาพอยู่ที่เดิม
  const zoomTo = (lv: number) => { const mid = left + (w * mpp) / 2; setOpt("hzoom", lv); setLeft(Math.max(0, mid - (w * msPerPx(lv)) / 2)); };

  if (!src) return <div className="se-audio"><div className="small se-anone" data-se-noaudio>{p.noAudio}</div></div>;

  // ขีดบอกเวลาใต้ภาพ ห่างกันอย่างน้อย 80 จุด
  const step = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000, 120000, 300000, 600000].find((s) => s / mpp >= 80) ?? 600000;
  const ticks: number[] = [];
  for (let s = Math.ceil(left / step) * step; s <= right && ticks.length < 40; s += step) ticks.push(s);

  return (
    <div className="se-audio" data-se-audio>
      <div className="se-arow">
        <div className="se-wavebox" ref={wrap}>
          <canvas ref={cv} className="se-aud" style={{ height: h, cursor }} tabIndex={0} aria-label="คลื่นเสียง ลากเส้นแดงหรือน้ำเงินเพื่อเปลี่ยนเวลาเริ่มหรือจบ" data-aud
            onMouseDown={onDown} onMouseMove={onHover} onMouseLeave={() => setMouse(null)} onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); p.onPrev(); } else if (e.key === "ArrowRight") { e.preventDefault(); p.onNext(); } }} />
          <span className="se-wavebtns">
            <AudioMenu src={src} ev={p.ev} delayMs={d} />
            <InfoTip title="อ่านภาพคลื่นเสียง" tip={WAVE_TIP} />
          </span>
          <div className="se-ruler" aria-hidden="true">{ticks.map((s) => <span key={s} style={{ left: X(s), transform: X(s) < 18 ? "none" : X(s) > w - 18 ? "translateX(-100%)" : undefined }}>{fmtRuler(s, step)}</span>)}</div>
        </div>
        <div className="se-sl" data-se-sliders>
          <div className="se-slcols">
          <label className="se-slc" title={`ซูมแนวนอน ${zoomFactor(o.hzoom)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M7.5 10.5h6" /></svg>
            <input type="range" min={-50} max={30} step={1} value={o.hzoom} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="ซูมแนวนอน" data-se-hzoom />
          </label>
          <label className="se-slc" title={`ซูมแนวตั้ง ${Math.round(cube(o.vzoom) * 100)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.8-4.8M10.5 7.5v6" /></svg>
            <input type="range" min={0} max={100} step={1} value={o.vzoom} onChange={(e) => setOpt("vzoom", Number(e.target.value))} aria-label="ซูมแนวตั้ง" data-se-vzoom />
          </label>
          <label className="se-slc" title={o.link ? "ความดังผูกกับซูมแนวตั้งอยู่ กดปุ่มโซ่เพื่อแยก" : `ความดัง ${Math.round(cube(o.volume) * 100)}%`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 010 6" /></svg>
            <input type="range" min={0} max={100} step={1} value={o.link ? o.vzoom : o.volume} disabled={o.link} onChange={(e) => setOpt("volume", Number(e.target.value))} aria-label="ความดัง" data-se-volume />
          </label>
          </div>
          <span className="se-slfoot">
            <button type="button" className={"se-slbtn" + (o.link ? " on" : "")} aria-pressed={o.link} title={o.link ? "ผูกซูมแนวตั้งกับความดังอยู่ กดเพื่อแยก" : "กดเพื่อผูกซูมแนวตั้งกับความดัง"} onClick={() => setOpt("link", !o.link)} data-se-link>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>
            </button>
            <InfoTip title="แถบเลื่อนข้างคลื่นเสียง" tip={SLIDER_TIP} />
          </span>
        </div>
      </div>
      <div className="se-grip" onMouseDown={grip} title="ลากขึ้นลงเพื่อปรับความสูงของคลื่นเสียง" role="separator" aria-orientation="horizontal" aria-label="ปรับความสูงของคลื่นเสียง" data-se-grip><i /></div>
    </div>
  );
}

/* ---------------------------------------------------------------- เมนูเสียง เปิดไฟล์เสียงแยก บันทึกเสียงของบรรทัด */

function AudioMenu(p: { src: NonNullable<AudSource>; ev: SubEvent | null; delayMs: number }) {
  const tm = useTiming();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  const openFile = async () => {
    const w = window as unknown as { __audOpen?: string };
    const f = import.meta.env.DEV && w.__audOpen ? w.__audOpen : await pickFile("media");
    if (!f) return;
    const info = await graphApi.info(f).catch((e) => { setMsg(String(e)); return null; });
    if (!info) return;
    if (!info.tracks.length) { setMsg("ไฟล์นี้ไม่มีเสียง"); return; }
    setOwnAudio({ path: f, map: "0:a:0", idx: 0, name: f.split(/[\\/]/).pop() ?? f, own: true });
    setMsg(null); setOpen(false);
  };
  const saveClip = async () => {
    if (!p.ev) return;
    const r = rangeOf(p.ev);
    const w = window as unknown as { __audSave?: string };
    const base = p.src.path.replace(/\.[^.\\/]+$/, "") + `_บรรทัด_${(r.start / 1000).toFixed(2)}.wav`;
    const f = import.meta.env.DEV && w.__audSave ? w.__audSave : await pickSave(base, "wav", "ไฟล์เสียง WAV");
    if (!f) return;
    audApi.save(p.src.path, p.src.map, (r.start + p.delayMs) / 1000, (r.end + p.delayMs) / 1000, /\.wav$/i.test(f) ? f : `${f}.wav`, p.src.zero ?? null)
      .then((x) => setMsg(`บันทึกแล้ว ${x.split(/[\\/]/).pop()}`), (e) => setMsg(String(e)));
  };
  return (
    <span ref={wrap} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className={"btn btn-ghost btn-sm se-amenu" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title={`เสียงจาก ${p.src.name}`} onClick={() => { setOpen((x) => !x); setMsg(null); }} data-se-amenu>
        <IcFile size={14} />เสียง
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu" role="dialog" aria-label="เมนูเสียง" style={{ position: "absolute", ...sideStyle(side, "right"), width: 300, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-se-amenupanel>
          <div className="se-vmrow"><span className="se-vmh">เสียงจาก</span><span className="small se-vmkeys" data-se-asrc>{p.src.name}</span></div>
          <div className="se-vmsec">
            <button type="button" className="se-vmi" onClick={() => void openFile()} data-se-aopen>เปิดไฟล์เสียงแยก</button>
            {tm.own && <button type="button" className="se-vmi" onClick={() => { setOwnAudio(null); setOpen(false); }} data-se-amovie>กลับไปใช้เสียงของหนัง</button>}
            <button type="button" className={"se-vmi" + (p.ev ? "" : " off")} aria-disabled={!p.ev || undefined} title={p.ev ? undefined : "ยังไม่ได้เลือกบรรทัด"} onClick={() => void saveClip()} data-se-asave>บันทึกเสียงของบรรทัดเป็นไฟล์ WAV</button>
          </div>
          {msg && <div className="small se-vmmsg" role="status" data-se-amsg>{msg}</div>}
        </div>
      )}
    </span>
  );
}
