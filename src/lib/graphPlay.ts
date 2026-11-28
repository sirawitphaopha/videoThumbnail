/* ตัวเล่นเสียงของหน้ากราฟเสียง (BUGS ข้อ 163.4 · ROADMAP ข้อ 35 เล่นเสียงจากกราฟ มีขีดเลื่อนตาม)
   พี่กันสั่ง 10 พ.ย. 2569 "เล่นจากกราฟนี้เลย คือเล่นไปจะมีขีดเลื่อนไปด้วย" แล้วเคาะ "ได้ ปุ่มลำโพงด้วย เเละเราอยากห้มันเล่นได้ทุกเสียง"
   ฝั่ง Rust ถอดทีละก้อน 4 วินาที (graph_pcm ffmpeg ถอดได้ทุกชนิดที่หน้ากราฟเปิดได้) ได้ครบทุกช่องของแทร็ก ไม่รวมช่องก่อน
   หน้าจอต่อก้อนเล่นด้วย Web Audio แบบตัวเล่นของหน้าแก้ซับ (audioPlay.ts) เล่นได้ก่อนถอดจบทั้งไฟล์ ไม่เขียนไฟล์ชั่วคราว
   ทางเดินเสียง ก้อนเสียง → แยกช่อง → ตัวปิดเปิดของแต่ละช่อง (ปุ่มลำโพง) → ตัววัดระดับของช่อง
                                                          → รวมเป็นซ้ายขวา → ความดังลำโพง → ลำโพง
   ตัววัดระดับอยู่ก่อนความดังลำโพง แถบวัดจึงบอกระดับของไฟล์จริงเสมอ (พี่กันเคาะ "ปุ่มลดเสียง เเค่ลดเสียงจากลำโพงง") */
import { useSyncExternalStore } from "react";
import { graphApi } from "./api";

const RATE = 48000;
const CHUNK_S = 4;
const AHEAD_S = 2;
const VOL_KEY = "ms.graphVol";
const LOOP_KEY = "ms.graphLoop";

export type GSrc = { path: string; track: number; names: string[] };
/** paused หยุดชั่วคราวอยู่ที่เวลา pos (ปุ่มเล่นแบบ Audacity BUGS ข้อ 163.5) · loop เล่นวน จำไว้ครั้งหน้า */
type St = { playing: boolean; err: string; vol: number; path: string | null; paused: boolean; pos: number; loop: boolean };

const readVol = () => { try { const v = Number(localStorage.getItem(VOL_KEY)); return localStorage.getItem(VOL_KEY) != null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1; } catch { return 1; } };
const readLoop = () => { try { return localStorage.getItem(LOOP_KEY) === "1"; } catch { return false; } };
let st: St = { playing: false, err: "", vol: readVol(), path: null, paused: false, pos: 0, loop: readLoop() };
const subs = new Set<() => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useGPlay = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const getGPlay = () => st;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** ชุดทางเดินเสียงของการเล่นครั้งนี้ สร้างใหม่ทุกครั้งที่จำนวนหรือชื่อช่องเปลี่ยน */
let chain: { key: string; split: ChannelSplitterNode; mute: GainNode[]; meter: AnalyserNode[] } | null = null;
let run = 0;
let nodes: AudioBufferSourceNode[] = [];
let startCtx = 0;
let startS = 0;
let endS = Infinity;
let muted = new Set<string>();
let names: string[] = [];
let onEnd: ((from: number) => void) | null = null;

/** ช่องนี้ไปลำโพงซ้ายขวาเท่าไร · ช่องซ้ายไปซ้าย ช่องขวาไปขวา ช่องกลางกับ LFE ไปทั้งสองข้าง ช่องรอบทิศลดลงราว 3 dB */
export function coef(name: string, n: number): [number, number] {
  if (n === 1) return [1, 1];
  if (name === "FL" || name === "FLC") return [1, 0];
  if (name === "FR" || name === "FRC") return [0, 1];
  if (name === "SL" || name === "BL") return [0.707, 0];
  if (name === "SR" || name === "BR") return [0, 0.707];
  if (name === "LFE") return [0.5, 0.5];
  return [0.707, 0.707];
}

function ensure() {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: RATE });
    master = ctx.createGain(); master.gain.value = st.vol; master.connect(ctx.destination);
  }
  const key = names.join(",");
  if (chain?.key === key) return;
  chain?.split.disconnect();
  chain?.mute.forEach((g) => g.disconnect());
  const n = Math.max(1, names.length), c = ctx;
  const split = c.createChannelSplitter(n), merge = c.createChannelMerger(2);
  // ช่องรวมกันแล้วไม่ให้ดังเกินช่องเดียว (5.1 รวมเป็นสองช่องแบบที่ ffmpeg ทำ)
  const sums = [0, 1].map((k) => names.reduce((a, nm) => a + coef(nm, n)[k], 0));
  const norm = 1 / Math.max(1, ...sums);
  const mute: GainNode[] = [], meter: AnalyserNode[] = [];
  names.forEach((nm, i) => {
    const g = c.createGain(); g.gain.value = muted.has(nm) ? 0 : 1;
    split.connect(g, i);
    const a = c.createAnalyser(); a.fftSize = 1024; g.connect(a);
    const [l, r] = coef(nm, n);
    if (l) { const gl = c.createGain(); gl.gain.value = l * norm; g.connect(gl); gl.connect(merge, 0, 0); }
    if (r) { const gr = c.createGain(); gr.gain.value = r * norm; g.connect(gr); gr.connect(merge, 0, 1); }
    mute.push(g); meter.push(a);
  });
  merge.connect(master!);
  chain = { key, split, mute, meter };
}

/** เวลาที่กำลังเล่นตอนนี้ (วินาทีของไฟล์) · ไม่ได้เล่นอยู่ = null */
export function gNow(): number | null {
  if (st.paused) return st.pos;
  if (!st.playing || !ctx || !startCtx) return null;
  const t = startS + (ctx.currentTime - startCtx);
  return t < startS ? null : Math.min(t, endS);
}

/** หยุดเล่น · คืนเวลาที่หยุด (ไม่ได้เล่นอยู่ = null) */
export function gStop(): number | null {
  const at = gNow();
  run++;
  for (const n of nodes) { try { n.stop(); } catch { /* ยังไม่เริ่มหรือจบแล้ว */ } }
  nodes = [];
  startCtx = 0;
  if (st.playing || st.paused) set({ playing: false, paused: false });
  return at;
}

/** หยุดชั่วคราว · ขีดตำแหน่งเล่นค้างที่เวลานั้น คืนเวลาที่หยุด */
export function gPause(): number | null {
  const at = gNow();
  if (at == null || st.paused) return at;
  gStop();
  set({ paused: true, pos: at });
  return at;
}

/** เล่นวน เปิดปิด จำไว้ครั้งหน้า */
export function gSetLoop(on: boolean) {
  try { localStorage.setItem(LOOP_KEY, on ? "1" : "0"); } catch { /* จำไม่ได้ ใช้ค่าในหน้าไปก่อน */ }
  set({ loop: on });
}

/** ปิดเปิดช่องตอนเล่นได้ทันที (ปุ่มลำโพงของหน้ากราฟ) */
export function gSetMuted(hidden: string[]) {
  muted = new Set(hidden);
  chain?.mute.forEach((g, i) => { g.gain.value = muted.has(names[i]) ? 0 : 1; });
}

/** ความดังลำโพง 0 ถึง 1 จำไว้ครั้งหน้า · ไม่แก้ไฟล์ ไม่เปลี่ยนแถบวัดระดับ */
export function gSetVol(v: number) {
  const x = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = x;
  try { localStorage.setItem(VOL_KEY, String(x)); } catch { /* จำไม่ได้ ใช้ค่าในหน้าไปก่อน */ }
  set({ vol: x });
}

const buf = new Float32Array(1024);
/** ระดับสูงสุดของแต่ละช่องในช่วงสั้นล่าสุด 0 ถึง 1 · ไม่ได้เล่นได้ศูนย์ */
export function gLevels(): number[] {
  if (!chain || !st.playing) return names.map(() => 0);
  return chain.meter.map((a) => { a.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > m) m = v; } return m; });
}

/** ไบต์ s16le n ช่องสลับกัน เป็น AudioBuffer */
function toBuffer(c: AudioContext, ab: ArrayBuffer, n: number): AudioBuffer | null {
  const frames = Math.floor(ab.byteLength / (2 * n));
  if (frames <= 0) return null;
  const v = new DataView(ab), b = c.createBuffer(n, frames, RATE);
  const ch = Array.from({ length: n }, (_, k) => b.getChannelData(k));
  for (let i = 0; i < frames; i++) for (let k = 0; k < n; k++) ch[k][i] = v.getInt16((i * n + k) * 2, true) / 32768;
  return b;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เล่นจากเวลา from (วินาที) จนจบไฟล์ · end เล่นจบเองแล้วเรียกพร้อมเวลาที่เริ่มเล่น */
export async function gPlay(src: GSrc, from: number, end?: (from: number) => void) {
  gStop();
  const my = run;
  names = src.names.slice(0, 8);
  onEnd = end ?? null;
  try {
    ensure();
    if (ctx!.state === "suspended") await ctx!.resume();
  } catch (e) { set({ err: `เปิดลำโพงไม่ได้ ${e}` }); return; }
  const c = ctx!, n = Math.max(1, names.length), split = chain!.split;
  const t0 = Math.max(0, from);
  endS = Infinity;
  set({ playing: true, paused: false, err: "", path: src.path });
  let next = t0, schedAt = 0;
  for (;;) {
    let ab: ArrayBuffer;
    try { ab = await graphApi.pcm(src.path, src.track, next, CHUNK_S, n); } catch (e) { if (run === my) set({ playing: false, err: String(e) }); return; }
    if (run !== my) return;
    const b = toBuffer(c, ab, n);
    if (!b) { endS = next; break; }
    if (!startCtx) { startCtx = c.currentTime + 0.03; startS = t0; schedAt = startCtx; }
    const s = c.createBufferSource();
    s.buffer = b; s.connect(split); s.start(schedAt);
    s.onended = () => { const i = nodes.indexOf(s); if (i >= 0) nodes.splice(i, 1); s.disconnect(); };
    nodes.push(s);
    schedAt += b.duration;
    next += b.duration;
    // ก้อนสั้นกว่าที่ขอคือถึงท้ายไฟล์แล้ว
    if (b.duration < CHUNK_S - 0.03) { endS = next; break; }
    while (run === my && schedAt - c.currentTime > AHEAD_S) await wait(100);
    if (run !== my) return;
  }
  const last = nodes[nodes.length - 1];
  const done = () => { if (run !== my) return; nodes = []; startCtx = 0; set({ playing: false }); onEnd?.(t0); };
  if (!last) { done(); return; }
  const drop = last.onended;
  last.onended = (ev) => { drop?.call(last, ev); done(); };
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__graphPlay = () => ({ ...st, now: gNow(), nodes: nodes.length, names, muted: [...muted], gains: chain?.mute.map((g) => g.gain.value) ?? [] });
