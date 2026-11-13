/* ภาพหนังทีละเฟรมของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109)
   ① Framerate แปลงเวลากับเลขเฟรมแบบ Aegisub · ② ตารางเฟรมกับ keyframe ของหนังที่เปิด (อ่านครั้งเดียวต่อไฟล์ ฝั่ง Rust เก็บไว้ในเครื่อง)
   ③ เส้น keyframe จากหนัง จากจุดเปลี่ยนฉากที่หาเอง หรือจากไฟล์ keyframe · ④ ภาพตรงเฟรมพร้อมเก็บภาพใกล้ ๆ ไว้ล่วงหน้า · ⑤ วิดีโอจำลอง
   store ระดับไฟล์ ข้ามหน้าแล้วกลับมาเฟรมเดิม keyframe ชุดเดิมยังอยู่

   Framerate แปลจากซอร์ส Aegisub libaegisub/common/vfr.cpp
   Copyright (c) 2010, Thomas Goyne <plorkyeran@aegisub.org>
   Permission to use, copy, modify, and distribute this software for any purpose with or without fee is hereby granted,
   provided that the above copyright notice and this permission notice appear in all copies.
   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED
   WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
   CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
   NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE. */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, vidApi, type VidTable } from "./api";

/* ---------------------------------------------------------------- ① Framerate (vfr.cpp) */

/** START คือเวลาที่ซับต้องเริ่มเพื่อขึ้นบนเฟรมนั้น · END คือเวลาที่ซับต้องจบเพื่อขึ้นถึงเฟรมนั้น · EXACT เวลาที่เฟรมเริ่มแสดงจริง */
export type FrType = "exact" | "start" | "end";
const DEN = 1000000000n;

export class Framerate {
  /** เวลาเริ่มของแต่ละเฟรม ms (อัตราคงที่มีแค่ [0]) */
  readonly tc: number[];
  private readonly num: bigint;
  private readonly den: bigint;
  private readonly last: bigint;
  /** จำนวนเฟรมที่รู้จริง (ตารางของหนัง หรือความยาววิดีโอจำลอง) */
  readonly count: number;

  private constructor(tc: number[], num: bigint, den: bigint, last: bigint, count: number) {
    this.tc = tc; this.num = num; this.den = den; this.last = last; this.count = count;
  }
  /** อัตราคงที่จากทศนิยม (Aegisub checked_fps_numerator) */
  static fps(fps: number, count = 0): Framerate | null {
    if (!isFinite(fps) || fps <= 0 || fps > 1000) return null;
    return new Framerate([0], BigInt(Math.trunc(fps * 1e9)), DEN, 0n, count);
  }
  /** อัตราคงที่แบบเศษส่วน เช่น 24000/1001 */
  static ratio(n: number, d: number, count = 0): Framerate | null {
    if (!(n > 0) || !(d > 0) || n / d > 1000) return null;
    return new Framerate([0], BigInt(Math.trunc(n)), BigInt(Math.trunc(d)), 0n, count);
  }
  /** จากตารางเวลาเฟรมของหนัง (SetFromTimecodes) · น้อยกว่าสองเฟรมหรือเวลาเท่ากันหมด ใช้ 25 fps แบบ Aegisub */
  static times(times: number[]): Framerate {
    const back = times[times.length - 1] ?? 0;
    if (times.length < 2 || back - times[0] <= 0) return Framerate.fps(25, times.length)!;
    const tc = times[0] ? times.map((t) => t - times[0]) : times;
    const n = BigInt(tc.length - 1);
    return new Framerate(tc, (n * DEN * 1000n) / BigInt(tc[tc.length - 1]), DEN, n * DEN * 1000n, tc.length);
  }
  get value() { return Number(this.num) / Number(this.den); }

  frameAt(msIn: number, type: FrType = "exact"): number {
    if (type === "start") return this.frameAt(msIn - 1) + 1;
    if (type === "end") return this.frameAt(msIn - 1);
    const ms = Math.round(msIn);
    const tc = this.tc;
    if (ms < 0) return Number(((BigInt(ms) * this.num) / this.den - 999n) / 1000n);
    if (ms > tc[tc.length - 1]) return Number(((BigInt(ms) + 1n) * this.num - this.last - this.num / 2n + (1000n * this.den - 1n)) / (1000n * this.den)) + tc.length - 2;
    // เฟรมสุดท้ายที่เวลาเริ่มไม่เกิน ms
    let lo = 0, hi = tc.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (tc[m] <= ms) lo = m + 1; else hi = m; }
    return lo - 1;
  }

  timeAt(f: number, type: FrType = "exact"): number {
    if (type === "start") { const prev = this.timeAt(f - 1), cur = this.timeAt(f); return prev + Math.trunc((cur - prev + 1) / 2); }
    if (type === "end") { const cur = this.timeAt(f), next = this.timeAt(f + 1); return cur + Math.trunc((next - cur + 1) / 2); }
    if (this.num === 0n) return 0;
    if (f < 0) return Number((BigInt(f) * this.den * 1000n) / this.num);
    const tc = this.tc;
    if (f >= tc.length) return Number((BigInt(f - tc.length + 1) * 1000n * this.den + this.last + this.num / 2n) / this.num);
    return tc[f];
  }
}

/* ---------------------------------------------------------------- ⑤ วิดีโอจำลอง (video_provider_dummy.cpp · dialog_dummy_video.cpp) */

export type DummySpec = { fps: string; frames: number; w: number; h: number; r: number; g: number; b: number; pattern: boolean };
/** ค่าตั้งต้นของ Aegisub (default_config.json) */
export const DUMMY_DEFAULT: DummySpec = { fps: "24000/1001", frames: 40000, w: 1280, h: 720, r: 47, g: 163, b: 254, pattern: false };
/** ขนาดสำเร็จรูป 12 ขนาดตามหน้าต่างวิดีโอจำลองของ Aegisub */
export const DUMMY_SIZES: { w: number; h: number; label: string }[] = [
  { w: 640, h: 480, label: "SD จอ 4:3" }, { w: 704, h: 480, label: "SD anamorphic" }, { w: 640, h: 360, label: "SD จอกว้าง" }, { w: 704, h: 396, label: "SD จอกว้าง" },
  { w: 640, h: 352, label: "SD จอกว้าง MOD16" }, { w: 704, h: 400, label: "SD จอกว้าง MOD16" }, { w: 1024, h: 576, label: "SuperPAL จอกว้าง" }, { w: 1280, h: 720, label: "HD 720p" },
  { w: 1920, h: 1080, label: "FHD 1080p" }, { w: 2560, h: 1440, label: "QHD 1440p" }, { w: 3840, h: 2160, label: "4K UHD 2160p" }, { w: 1080, h: 1920, label: "FHD แนวตั้ง" },
];

/** อัตราเฟรมของวิดีโอจำลอง ทศนิยมหรือเศษส่วน (TryParseFramerate) · ใช้ไม่ได้ = null */
export function dummyRate(fps: string, frames = 0): Framerate | null {
  const s = fps.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Framerate.fps(parseFloat(s), frames);
  const m = /^(\d+)\/(\d+)$/.exec(s);
  return m ? Framerate.ratio(parseInt(m[1], 10), parseInt(m[2], 10), frames) : null;
}

/** ชื่อแบบที่ Aegisub จำไว้ในไฟล์ ASS `?dummy:fps:เฟรม:กว้าง:สูง:r:g:b:c` */
export const dummyName = (d: DummySpec) => `?dummy:${d.fps}:${d.frames}:${d.w}:${d.h}:${d.r}:${d.g}:${d.b}:${d.pattern ? "c" : ""}`;
export function parseDummy(s: string): DummySpec | null {
  const p = s.trim().split(":");
  if (p[0] !== "?dummy" || p.length < 8) return null;
  const n = p.slice(2, 8).map((x) => parseInt(x, 10));
  if (n.some((x) => !isFinite(x)) || !dummyRate(p[1])) return null;
  const [frames, w, h, r, g, b] = n;
  if (frames < 1 || w < 1 || h < 1) return null;
  return { fps: p[1], frames, w, h, r: r & 255, g: g & 255, b: b & 255, pattern: p[8] === "c" };
}

/** สีอ่อนของตารางหมากรุก · Aegisub แปลงเป็น HSL เพิ่มความสว่าง 24 จาก 255 ล้นแล้วลด 48 แทน */
export function dummyLight(r: number, g: number, b: number): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  let h = 0, s = 0;
  const l0 = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l0 > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === R ? (G - B) / d + (G < B ? 6 : 0) : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h /= 6;
  }
  // เพิ่ม 24 แบบตัวเลข 0 ถึง 255 · ล้นแล้ว Aegisub ลด 48 จากค่าที่ล้น จึงได้ค่าเดิมลบ 24 (สีสว่างมากได้สีเข้มขึ้นแทน)
  let l8 = Math.round(l0 * 255) + 24;
  if (l8 > 255) l8 -= 48;
  const l = l8 / 255;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

/* ---------------------------------------------------------------- ② ③ store */

export type KeySrc = "movie" | "scenes" | "file";
export type VideoSrc = { kind: "movie"; path: string } | { kind: "dummy"; spec: DummySpec } | { kind: "none" };

type St = {
  /** หนังของเอกสารที่เปิดอยู่ ("" = ไม่มี) */
  movie: string;
  table: VidTable | null;
  load: "idle" | "busy" | "ok" | "err";
  /** วินาทีที่อ่านถึงกับความยาวเรื่อง ระหว่างอ่านตาราง */
  readTo: number; dur: number; err: string;
  /** keyframe ที่ผู้ใช้เปลี่ยนเอง แยกตามหนัง · ไม่มี = ใช้ keyframe ของหนัง */
  keysBy: Record<string, { src: KeySrc; list: number[]; file?: string }>;
  hideKeys: boolean;
  scene: { busy: boolean; t: number; dur: number; err: string };
  /** เฟรมที่ภาพแสดงอยู่ */
  pos: number | null;
  /** เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดเอง (Aegisub ปุ่ม AUTO) */
  auto: boolean;
  /** ขนาดภาพ % · 0 = พอดีกรอบ */
  zoom: number;
  dummy: DummySpec | null;
  /** ผู้ใช้กดปิดวิดีโอ */
  closed: boolean;
};

const ls = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ไม่มีที่เก็บก็ใช้ค่าตั้งต้น */ } };

let st: St = {
  movie: "", table: null, load: "idle", readTo: 0, dur: 0, err: "", keysBy: {}, hideKeys: ls("se-vhidekeys") === "1",
  scene: { busy: false, t: 0, dur: 0, err: "" }, pos: null, auto: ls("se-vauto") !== "0", zoom: Number(ls("se-vzoom") ?? 0) || 0, dummy: null, closed: false,
};
const subs = new Set<() => void>();
function set(p: Partial<St>) { st = { ...st, ...p }; subs.forEach((f) => f()); }
export const getVid = () => st;
export function useVid() { return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st); }

if (inApp) {
  listen<{ movie: string; t: number; dur: number }>("vid-table-progress", (e) => { if (e.payload.movie === st.movie && st.load === "busy") set({ readTo: e.payload.t, dur: e.payload.dur }); });
  listen<{ movie: string; t: number; dur: number }>("vid-scenes-progress", (e) => { if (e.payload.movie === st.movie && st.scene.busy) set({ scene: { ...st.scene, t: e.payload.t, dur: e.payload.dur } }); });
}

/** เปิดเอกสารใหม่ · movie หนังที่จับคู่ ("" ไม่มี) · dummy วิดีโอจำลองที่ไฟล์ ASS จำไว้ (ใช้เมื่อไม่มีหนัง) */
export function vidOpen(movie: string, dummy: DummySpec | null) {
  if (st.movie !== movie) {
    if (st.load === "busy") void vidApi.tableStop();
    if (st.scene.busy) void vidApi.scenesStop();
    set({ movie, table: null, load: "idle", readTo: 0, dur: 0, err: "", pos: null, scene: { busy: false, t: 0, dur: 0, err: "" } });
  }
  set({ dummy: movie ? null : dummy, closed: false });
  if (movie) void loadTable();
}

async function loadTable() {
  const movie = st.movie;
  if (!movie || st.load === "busy" || st.load === "ok") return;
  set({ load: "busy", err: "", readTo: 0 });
  try {
    const t = await vidApi.table(movie);
    if (st.movie === movie) set({ table: t, load: "ok" });
  } catch (e) {
    if (st.movie !== movie) return;
    const msg = String(e);
    set(msg === "stopped" ? { load: "idle" } : { load: "err", err: msg });
  }
}
export const vidRetry = () => { if (st.load !== "busy") { set({ load: "idle" }); void loadTable(); } };

/** แหล่งภาพตอนนี้ */
export function vidSrc(s: St = st): VideoSrc {
  if (s.dummy) return { kind: "dummy", spec: s.dummy };
  if (!s.movie || s.closed) return { kind: "none" };
  return { kind: "movie", path: s.movie };
}

const frCache = new WeakMap<object, Framerate>();
/** ตัวแปลงเวลากับเลขเฟรม · ยังอ่านตารางไม่เสร็จหรือไม่มีวิดีโอ = null */
export function vidRate(s: St = st): Framerate | null {
  if (s.dummy) {
    const k = s.dummy as object;
    let f = frCache.get(k);
    if (!f) { const r = dummyRate(s.dummy.fps, s.dummy.frames); if (!r) return null; f = r; frCache.set(k, f); }
    return f;
  }
  if (!s.table || s.closed) return null;
  let f = frCache.get(s.table);
  if (!f) { f = Framerate.times(s.table.times); frCache.set(s.table, f); }
  return f;
}

/** keyframe ที่ใช้ตอนนี้ เรียงจากน้อยไปมาก · วิดีโอจำลองไม่มี */
export function vidKeys(s: St = st): { src: KeySrc; list: number[]; file?: string } {
  if (s.dummy || !s.movie) return { src: "movie", list: [] };
  return s.keysBy[s.movie] ?? { src: "movie", list: s.table?.keys ?? [] };
}
export const isKey = (list: number[], f: number) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] < f) lo = m + 1; else hi = m; } return list[lo] === f; };

export function setKeys(list: number[] | null, src: KeySrc = "file", file?: string) {
  if (!st.movie) return;
  const keysBy = { ...st.keysBy };
  if (list) keysBy[st.movie] = { src, list, file }; else delete keysBy[st.movie];
  set({ keysBy });
}
export function setHideKeys(v: boolean) { lsSet("se-vhidekeys", v ? "1" : "0"); set({ hideKeys: v }); }
export function setAuto(v: boolean) { lsSet("se-vauto", v ? "1" : "0"); set({ auto: v }); }
export function setZoom(v: number) { lsSet("se-vzoom", String(v)); set({ zoom: v }); }
export function setDummy(d: DummySpec | null) { set({ dummy: d, closed: false, pos: d ? 0 : null }); }
export function closeVideo() { set({ dummy: null, closed: true, pos: null }); }
export function reopenVideo() { set({ closed: false, dummy: null }); if (st.movie) void loadTable(); }

/** ย้ายภาพไปเฟรม f · ไม่เกินเฟรมสุดท้าย */
export function seek(f: number) {
  const fr = vidRate();
  if (!fr) return;
  const n = Math.max(0, fr.count ? Math.min(fr.count - 1, Math.round(f)) : Math.round(f));
  if (n !== st.pos) set({ pos: n });
}
/** ย้ายภาพไปเวลา ms (JumpToTime ของ Aegisub ค่าตั้งต้นแบบ START) */
export function seekTime(ms: number, type: FrType = "start") { const fr = vidRate(); if (fr) seek(fr.frameAt(ms, type)); }

/** หาจุดเปลี่ยนฉากจริง แล้วใช้เป็นเส้น keyframe */
export async function findScenes() {
  const movie = st.movie;
  if (!movie || st.scene.busy) return;
  set({ scene: { busy: true, t: 0, dur: st.table?.duration ?? 0, err: "" } });
  try {
    const list = await vidApi.scenes(movie);
    if (st.movie !== movie) return;
    set({ scene: { busy: false, t: 0, dur: 0, err: "" } });
    setKeys(list, "scenes");
  } catch (e) {
    if (st.movie !== movie) return;
    const msg = String(e);
    set({ scene: { busy: false, t: 0, dur: 0, err: msg === "stopped" ? "" : msg } });
  }
}
export const stopScenes = () => { void vidApi.scenesStop(); };

/* ---------------------------------------------------------------- ④ ภาพตรงเฟรม */

/** เวลาที่สั่ง ffmpeg ไปหาเฟรม n · เวลาเฟรมในไฟล์ (ตัดเศษเป็น ms แล้ว) ลบครึ่ง ms ให้เฟรมก่อนหน้าถูกทิ้งแต่เฟรม n ไม่ถูกทิ้ง
    คิดแบบเดียวกับ seek_of ในเทสของ vidframes.rs */
export function seekOf(t: VidTable, n: number) {
  const i = Math.max(0, Math.min(t.times.length - 1, n));
  return Math.max(0, (t.times[i] + t.base) / 1000 - t.start - 0.0005);
}

/** ภาพที่ดึงแล้ว เก็บตามลำดับใช้ล่าสุด ไม่เกินราว 40 MB */
const imgs = new Map<string, string>();
let imgBytes = 0;
const LIMIT = 40 * 1024 * 1024;
const inflight = new Map<string, Promise<void>>();
const ikey = (movie: string, h: number, n: number) => `${movie}|${h}|${n}`;
function put(k: string, v: string) {
  const old = imgs.get(k);
  if (old) { imgBytes -= old.length; imgs.delete(k); }
  imgs.set(k, v); imgBytes += v.length;
  for (const [kk, vv] of imgs) { if (imgBytes <= LIMIT) break; imgs.delete(kk); imgBytes -= vv.length; }
}
export function cachedFrame(movie: string, h: number, n: number) {
  const k = ikey(movie, h, n), v = imgs.get(k);
  if (v) { imgs.delete(k); imgs.set(k, v); }
  return v ?? null;
}

/** ดึงภาพทีละชุด 4 เฟรมในการเปิดไฟล์ครั้งเดียว · ถอยหลังดึงชุดที่จบที่เฟรมนั้น เดินหน้าดึงชุดที่เริ่มที่เฟรมนั้น */
function fetchRun(movie: string, t: VidTable, n0: number, h: number): Promise<void> {
  const k = `${movie}|${h}|${n0}`;
  const had = inflight.get(k);
  if (had) return had;
  const p = vidApi.frames(movie, seekOf(t, n0), 4, h).then((urls) => { urls.forEach((u, i) => put(ikey(movie, h, n0 + i), u)); }).finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

export async function frameImage(movie: string, t: VidTable, n: number, h: number, dir: 1 | -1 = 1): Promise<string> {
  const hit = cachedFrame(movie, h, n);
  if (hit) return hit;
  await fetchRun(movie, t, dir < 0 ? Math.max(0, n - 3) : n, h);
  const v = cachedFrame(movie, h, n);
  if (!v) throw new Error("ดึงภาพหนังไม่ได้");
  return v;
}

/** เก็บภาพถัดไปตามทิศที่เดินไว้ก่อน กดเดินต่อแล้วขึ้นทันที */
export function prefetch(movie: string, t: VidTable, n: number, h: number, dir: 1 | -1) {
  const next = n + dir;
  if (next < 0 || next >= t.times.length || cachedFrame(movie, h, next)) return;
  void fetchRun(movie, t, dir < 0 ? Math.max(0, next - 3) : next, h).catch(() => {});
}

/* ---------------------------------------------------------------- เวลาแบบ Aegisub บนแถบใต้ภาพ */

/** 0:00:01.542 (GetAssFormatted แบบมิลลิวินาที) */
export function fmtMs(ms: number) {
  const neg = ms < 0, a = Math.abs(Math.round(ms));
  const h = Math.floor(a / 3600000), m = Math.floor(a / 60000) % 60, s = Math.floor(a / 1000) % 60, x = a % 1000;
  return `${neg ? "-" : ""}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(x).padStart(3, "0")}`;
}
/** +0ms หรือ -2900ms */
export const signedMs = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v)}ms`;

/* ---------------------------------------------------------------- เดินเฟรมแบบคีย์ลัดของ Aegisub (command/video.cpp) */

/** keyframe ถัดไปหรือก่อนหน้า · ไม่มีถัดไปแล้วไปเฟรมสุดท้าย ไม่มีก่อนหน้าไปเฟรม 0 */
export function jumpKeyframe(dir: 1 | -1) {
  const fr = vidRate();
  const pos = st.pos;
  if (!fr || pos == null) return;
  const list = vidKeys().list;
  if (dir > 0) { const k = list.find((x) => x > pos); seek(k ?? (fr.count ? fr.count - 1 : pos)); return; }
  let k = 0;
  for (const x of list) { if (x < pos) k = x; else break; }
  seek(k);
}

/** ขนาดภาพทีละขั้น 12.5% (Ctrl+บวก Ctrl+ลบ บนแป้นตัวเลข) · จากพอดีกรอบเริ่มที่ขั้นใกล้ขนาดตอนนี้ */
let fitPctNow = 50;
/** กรอบวิดีโอบอกว่าพอดีกรอบตอนนี้กี่เปอร์เซ็นต์ (คีย์ลัดซูมใช้) */
export const setFitPct = (v: number) => { fitPctNow = v; };
export function zoomStep(dir: 1 | -1) {
  const now = st.zoom || Math.max(12.5, Math.round(fitPctNow / 12.5) * 12.5);
  setZoom(Math.min(300, Math.max(12.5, now + dir * 12.5)));
}
