/* ตัวเล่นเสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109)
   ฝั่ง Rust ถอดเสียงทีละก้อน 4 วินาที (sub_pcm ส่งไบต์ s16le สองช่อง 48 kHz ตรง ๆ) หน้าจอต่อก้อนเล่นด้วย Web Audio ไม่มีช่องว่างระหว่างก้อน
   ก้อนถัดไปขอล่วงหน้าตอนเสียงที่ต่อไว้เหลือไม่ถึง 2 วินาที เล่นจนจบไฟล์ได้โดยไม่ต้องถอดทั้งเรื่องก่อน
   เวลาเป็นเวลาของหนัง มิลลิวินาที · ความดังแบบ Aegisub (ค่าตัวเลื่อน ÷ 50 ยกกำลังสาม) ผู้เรียกคิดมาแล้ว
   กดเล่นใหม่ระหว่างเล่น หยุดของเดิมก่อนเสมอ (เลขรอบ run) */
import { useSyncExternalStore } from "react";
import { audApi } from "./api";

const RATE = 48000;
const CHUNK_MS = 4000;
const AHEAD_S = 2;

export type AudSrc = { path: string; map: string; zero?: number | null };
type St = { playing: boolean; err: string };

let st: St = { playing: false, err: "" };
const subs = new Set<() => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const usePlay = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const getPlay = () => st;
/** เลขรอบของการเล่น · เปลี่ยนเมื่อมีการสั่งเล่นใหม่หรือหยุด (ตัวเล่นหนังใช้ดูว่าเสียงที่ตัวเองสั่งยังเล่นอยู่ไหม) */
export const playRun = () => run;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let run = 0;
let nodes: AudioBufferSourceNode[] = [];
/** เวลาของ AudioContext ที่เสียงเวลา startMs ดังออกลำโพง */
let startCtx = 0;
let startMs = 0;
let endMs = Infinity;
let vol = 1;

export function setVolume(v: number) { vol = v; if (gain) gain.gain.value = v; }
/** ความดังตอนนี้ (ตัวคูณแบบเส้นตรง) ตัวเล่น mpv ใช้ค่าเดียวกัน */
export const getVolume = () => vol;

/** เวลาที่กำลังเล่นตอนนี้ (เวลาของหนัง ms) · ไม่ได้เล่นอยู่ = null */
export function playNow(): number | null {
  if (!st.playing || !ctx || !startCtx) return null;
  const t = startMs + (ctx.currentTime - startCtx) * 1000;
  return t < startMs ? null : Math.min(t, endMs);
}

export function stopPlay() {
  run++;
  for (const n of nodes) { try { n.stop(); } catch { /* ยังไม่เริ่มหรือจบแล้ว */ } }
  nodes = [];
  startCtx = 0;
  if (st.playing) set({ playing: false });
}

/** ไบต์ s16le สองช่องสลับกัน เป็น AudioBuffer */
function toBuffer(c: AudioContext, ab: ArrayBuffer): AudioBuffer | null {
  const n = Math.floor(ab.byteLength / 4);
  if (n <= 0) return null;
  const v = new DataView(ab);
  const b = c.createBuffer(2, n, RATE);
  const l = b.getChannelData(0), r = b.getChannelData(1);
  for (let i = 0; i < n; i++) { l[i] = v.getInt16(i * 4, true) / 32768; r[i] = v.getInt16(i * 4 + 2, true) / 32768; }
  return b;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** เล่นเวลา t0 ถึง t1 ของหนัง (ms) · t1 = null เล่นจนจบไฟล์ · คืนเมื่อเริ่มดังแล้ว (หรือเล่นไม่ได้) */
export async function play(src: AudSrc, t0: number, t1: number | null) {
  stopPlay();
  const my = run;
  try {
    if (!ctx) { ctx = new AudioContext({ sampleRate: RATE }); gain = ctx.createGain(); gain.connect(ctx.destination); gain.gain.value = vol; }
    if (ctx.state === "suspended") await ctx.resume();
  } catch (e) { set({ err: `เปิดลำโพงไม่ได้ ${e}` }); return; }
  const c = ctx, g = gain!;
  const from = Math.max(0, t0);
  endMs = t1 == null ? Infinity : Math.max(from, t1);
  if (endMs - from < 1) return;
  set({ playing: true, err: "" });
  let next = from, schedAt = 0;
  for (;;) {
    const want = Math.min(CHUNK_MS, endMs - next);
    if (want <= 0) break;
    let ab: ArrayBuffer;
    try { ab = await audApi.pcm(src.path, src.map, next / 1000, want / 1000, src.zero ?? null); } catch (e) { if (run === my) set({ playing: false, err: String(e) }); return; }
    if (run !== my) return;
    const b = toBuffer(c, ab);
    if (!b) break;
    if (!startCtx) { startCtx = c.currentTime + 0.03; startMs = from; schedAt = startCtx; }
    const s = c.createBufferSource();
    s.buffer = b; s.connect(g); s.start(schedAt);
    // ก้อนที่ดังจบแล้วเอาออกจากรายการ คืนหน่วยความจำ (ก้อนละราว 1.5 MB เล่นจนจบเรื่องสองชั่วโมงเดิมค้างเกิน 2.5 GB · ผู้ช่วยตรวจทาน F10)
    s.onended = () => { const i = nodes.indexOf(s); if (i >= 0) nodes.splice(i, 1); s.disconnect(); };
    nodes.push(s);
    schedAt += b.duration;
    next += b.duration * 1000;
    // ก้อนสั้นกว่าที่ขอคือถึงท้ายไฟล์แล้ว
    if (b.duration * 1000 < want - 30) { endMs = Math.min(endMs, next); break; }
    // รอจนเสียงที่ต่อไว้เหลือไม่ถึง 2 วินาทีค่อยขอก้อนถัดไป
    while (run === my && schedAt - c.currentTime > AHEAD_S) await wait(100);
    if (run !== my) return;
  }
  // เล่นจนจบแล้วปิดสถานะเอง
  const last = nodes[nodes.length - 1];
  if (!last) { if (run === my) { startCtx = 0; set({ playing: false }); } return; }
  const drop = last.onended;
  last.onended = (ev) => { drop?.call(last, ev); if (run === my) { nodes = []; startCtx = 0; set({ playing: false }); } };
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ · อ่านเวลาที่กำลังเล่น
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__audioNow = () => ({ playing: st.playing, now: playNow(), err: st.err, nodes: nodes.length });
