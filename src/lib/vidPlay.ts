/* เล่นวิดีโอคร่าว ๆ ในหน้าแก้ซับ แบบ Aegisub (video_controller.cpp Play OnPlayTimer · พี่กันขอ 14 พ.ย. 2569 "เราให้มันเล่นไฟล์ เหมือนเปิดหนังไง")
   ① เสียงเล่นจากไฟล์หนังตั้งแต่เวลาของเฟรมที่อยู่จนจบเรื่อง ด้วยตัวเล่นเสียงเดิมของหน้าแก้ซับ (audioPlay.ts PlayToEnd ของ Aegisub)
   ② ภาพอ่านจากไฟล์หนังต่อเนื่องตั้งแต่เฟรมนั้น (vid_play ใน vidplay.rs) ได้ทีละเฟรมตามลำดับ เฟรมที่ k คือเฟรม n0 + k
   ③ ทุกเฟรมของจอ (requestAnimationFrame แทนนาฬิกา 10 ms ของ Aegisub) ดูเวลาของเสียง แปลงเป็นเลขเฟรม แล้ววาดเฟรมนั้น เฟรมที่เลยเวลาแล้วทิ้ง
   ไม่มีแทร็กเสียง ใช้นาฬิกาของเครื่องนับจากตอนกดเล่น (steady_clock ของ Aegisub)
   หยุด กดอีกครั้ง เสียงถูกสั่งเล่นอย่างอื่น หรือถึงเฟรมสุดท้าย ภาพหยุดที่เฟรมที่เห็นอยู่ แล้วกรอบภาพปกติแสดงเฟรมนั้นต่อ (seek) */
import { useSyncExternalStore } from "react";
import { vidApi, type VidTable } from "./api";
import { getPlay, play as playAudio, playNow, playRun, stopPlay, type AudSrc } from "./audioPlay";
import { seek, seekOf, type Framerate } from "./vidFrames";

type St = { playing: boolean; frame: number | null; err: string };
let st: St = { playing: false, frame: null, err: "" };
const subs = new Set<() => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useVidPlay = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const getVidPlay = () => st;

/** ตัวสลับเล่นหยุดของกรอบวิดีโอที่เปิดอยู่ ให้คีย์ลัด Ctrl+P ของหน้าแก้ซับเรียก (video/play ของ Aegisub) */
let toggler: (() => void) | null = null;
export const setPlayToggle = (f: (() => void) | null) => { toggler = f; };
export const toggleVidPlay = () => toggler?.();

/** ผืนวาดของกรอบภาพ หน้าจอผูกไว้ตอนเล่น */
let canvas: HTMLCanvasElement | null = null;
export const bindPlayCanvas = (c: HTMLCanvasElement | null) => { canvas = c; };

let run = 0;
let raf = 0;
let queue: { n: number; bmp: ImageBitmap }[] = [];
let shown: number | null = null;

function clear() {
  cancelAnimationFrame(raf);
  for (const q of queue) q.bmp.close();
  queue = [];
}

/** หยุดเล่น ภาพค้างที่เฟรมที่เห็นอยู่ · keepPos ไม่ย้ายภาพ (หยุดเพื่อเริ่มใหม่จากตำแหน่งอื่น ไม่งั้นภาพเด้งกลับไปเฟรมเก่าแล้วเล่นใหม่วนไปมา) */
export function stopVidPlay(keepAudio = false, keepPos = false) {
  if (!st.playing) return;
  run++;
  void vidApi.playStop().catch(() => {});
  if (!keepAudio) stopPlay();
  clear();
  const at = shown;
  set({ playing: false, frame: null });
  if (at != null && !keepPos) seek(at);
}

/** เล่นจากเฟรม n0 · aud แทร็กเสียงที่หน้าแก้ซับใช้ (ไม่มี = เล่นภาพอย่างเดียว) · h ความสูงภาพที่ขอ */
export async function startVidPlay(movie: string, t: VidTable, fr: Framerate, n0: number, aud: AudSrc | null, h: number) {
  stopVidPlay(false, true);
  const my = ++run;
  const last = (fr.count || t.times.length) - 1;
  if (n0 >= last) return;
  queue = []; shown = n0;
  set({ playing: true, frame: n0, err: "" });
  let k = 0;
  const onFrame = (b: ArrayBuffer) => {
    if (run !== my) return;
    const n = n0 + k++;
    void createImageBitmap(new Blob([b], { type: "image/jpeg" })).then((bmp) => {
      if (run !== my) { bmp.close(); return; }
      queue.push({ n, bmp });
      queue.sort((a, c) => a.n - c.n);
    }, () => {});
  };
  vidApi.play(movie, seekOf(t, n0), h, onFrame).then(() => {}, (e) => { if (run === my) { set({ err: String(e) }); stopVidPlay(); } });
  const t0 = fr.timeAt(n0);
  // play เรียก stopPlay ก่อนรอใด ๆ เลขรอบของเสียงจึงเปลี่ยนทันทีหลังเรียก จดไว้ดูว่ายังเป็นเสียงของเราไหม
  if (aud) void playAudio(aud, t0, null);
  const myAud = playRun();
  const wall = performance.now();
  let heard = false;
  const tick = () => {
    if (run !== my) return;
    // เวลาตอนนี้ · มีเสียงใช้เวลาของเสียง (เสียงยังไม่ดัง ภาพรอที่เฟรมแรก) · ไม่มีเสียงใช้นาฬิกาของเครื่อง
    let now: number | null;
    if (aud) {
      // มีการสั่งเล่นเสียงอย่างอื่นหรือหยุดเสียง (เล่นบรรทัด ปุ่มหยุด) หรือเสียงจบไฟล์ ภาพหยุดตาม
      if (playRun() !== myAud) { stopVidPlay(true); return; }
      const a = playNow();
      if (a != null) heard = true;
      if (heard && !getPlay().playing) { stopVidPlay(true); return; }
      now = a;
    } else now = t0 + (performance.now() - wall);
    if (now != null) {
      const want = Math.min(last, fr.frameAt(now));
      if (want >= last) { draw(last); stopVidPlay(); return; }
      draw(want);
    } else draw(n0);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/** วาดเฟรมที่ใกล้ want ที่สุดที่มีแล้วโดยไม่เกิน · เฟรมเก่ากว่านั้นทิ้ง */
function draw(want: number) {
  let pick: { n: number; bmp: ImageBitmap } | null = null;
  while (queue.length && queue[0].n <= want) {
    if (pick) pick.bmp.close();
    pick = queue.shift()!;
  }
  if (!pick) return;
  const c = canvas;
  if (c) {
    if (c.width !== pick.bmp.width || c.height !== pick.bmp.height) { c.width = pick.bmp.width; c.height = pick.bmp.height; }
    c.getContext("2d")?.drawImage(pick.bmp, 0, 0);
  }
  pick.bmp.close();
  shown = pick.n;
  if (st.frame !== pick.n) set({ frame: pick.n });
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __vidPlay: () => ({ ...st, queue: queue.length }), __vidPlayStop: () => stopVidPlay() });
