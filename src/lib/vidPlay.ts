/* เล่นหนังในหน้าแก้ซับ มีตัวเล่นสองแบบ เลือกในหน้าตั้งค่า (BUGS ข้อ 111 · พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้")

   แบบ mpv (ค่าตั้งต้น แบบ Subtitle Edit) · mpvplay.rs
   ① mpv เปิดไฟล์หนังเอง ถอดภาพด้วยการ์ดจอเต็มความละเอียด เสียงออกลำโพงจาก mpv ซับที่กำลังแก้ส่งเป็นข้อความในหน่วยความจำ mpv วาดเองครบทุกแท็ก
   ② ภาพวาดในหน้าต่างลูกที่วางทับกรอบวิดีโอ ทุก 50 ms หน้าจอส่งตำแหน่งกรอบไป ถ้ามีของอื่นเปิดทับกรอบ (เมนู กล่องอธิบาย หน้าต่างซ้อน) ซ่อนภาพไว้ก่อน หนังเล่นต่อ
   ③ ทุก 50 ms ถามเวลาที่ mpv เล่นถึง แปลงเป็นเลขเฟรมให้ช่องเวลาใต้ภาพ
   ④ หยุดแล้วปิดไฟล์ (ไฟล์หนังไม่ค้างเปิด ย้ายหรือแทนไฟล์ได้) ภาพนิ่งไปเฟรมที่ mpv หยุด
   เปิด mpv ไม่ได้ (ไม่มี libmpv-2.dll) เล่นด้วยแบบ Aegisub แทน แล้วบอกเหตุผลใต้ภาพ

   แบบ Aegisub (video_controller.cpp Play OnPlayTimer · พี่กันขอ 14 พ.ย. 2569 "เราให้มันเล่นไฟล์ เหมือนเปิดหนังไง")
   ① เสียงเล่นจากไฟล์หนังตั้งแต่เวลาของเฟรมที่อยู่จนจบเรื่อง ด้วยตัวเล่นเสียงเดิมของหน้าแก้ซับ (audioPlay.ts PlayToEnd ของ Aegisub)
   ② ภาพอ่านจากไฟล์หนังต่อเนื่องตั้งแต่เฟรมนั้น (vid_play ใน vidplay.rs) ได้ทีละเฟรมตามลำดับ เฟรมที่ k คือเฟรม n0 + k
   ③ ทุกเฟรมของจอ (requestAnimationFrame แทนนาฬิกา 10 ms ของ Aegisub) ดูเวลาของเสียง แปลงเป็นเลขเฟรม แล้ววาดเฟรมนั้น เฟรมที่เลยเวลาแล้วทิ้ง
   ไม่มีแทร็กเสียง ใช้นาฬิกาของเครื่องนับจากตอนกดเล่น (steady_clock ของ Aegisub)

   ทั้งสองแบบ หยุด กดอีกครั้ง เสียงถูกสั่งเล่นอย่างอื่น (เล่นบรรทัด ปุ่มหยุด) หรือถึงเฟรมสุดท้าย ภาพหยุดที่เฟรมที่เห็นอยู่ แล้วกรอบภาพปกติแสดงเฟรมนั้นต่อ (seek)
   ไม่เขียนไฟล์ ไม่แปลงไฟล์ ไม่แก้ภาพหรือเสียงของหนัง */
import { useSyncExternalStore } from "react";
import { vidApi, type MpvRect, type VidTable } from "./api";
import { getPlay, getVolume, play as playAudio, playNow, playRun, stopPlay, type AudSrc } from "./audioPlay";
import { seek, seekOf, type Framerate } from "./vidFrames";

export type Engine = "mpv" | "aegisub";
type St = { playing: boolean; frame: number | null; err: string; engine: Engine | null };
let st: St = { playing: false, frame: null, err: "", engine: null };
const subs = new Set<() => void>();
const set = (p: Partial<St>) => { st = { ...st, ...p }; subs.forEach((f) => f()); };
export const useVidPlay = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => st);
export const getVidPlay = () => st;

/** ตัวสลับเล่นหยุดของกรอบวิดีโอที่เปิดอยู่ ให้คีย์ลัด Ctrl+P ของหน้าแก้ซับเรียก (video/play ของ Aegisub) */
let toggler: (() => void) | null = null;
export const setPlayToggle = (f: (() => void) | null) => { toggler = f; };
export const toggleVidPlay = () => toggler?.();

/** ผืนวาดของกรอบภาพ หน้าจอผูกไว้ตอนเล่นแบบ Aegisub */
let canvas: HTMLCanvasElement | null = null;
export const bindPlayCanvas = (c: HTMLCanvasElement | null) => { canvas = c; };
/** กล่องตรงตำแหน่งภาพ หน้าจอผูกไว้ตอนเล่นแบบ mpv หน้าต่างภาพของ mpv วางทับกล่องนี้ (ส่วนที่อยู่ในกรอบวิดีโอ) */
let mpvBox: HTMLElement | null = null;
export const bindMpvBox = (el: HTMLElement | null) => { mpvBox = el; };

let run = 0;
let raf = 0;
let timer = 0;
let queue: { n: number; bmp: ImageBitmap }[] = [];
let shown: number | null = null;
/** ตัวเล่นของรอบที่เล่นอยู่ · แบบ mpv จำตารางเฟรมไว้แปลงเวลาตอนหยุด */
let engine: Engine | null = null;
let mpvTable: VidTable | null = null;
let mpvFr: Framerate | null = null;

function clear() {
  cancelAnimationFrame(raf);
  clearInterval(timer);
  for (const q of queue) q.bmp.close();
  queue = [];
}

/** เวลาของ mpv (วินาทีนับจาก start_time ของไฟล์) เป็นเลขเฟรม · เวลาเฟรมของโปรแกรมนับจากเฟรมแรก (times + base คือเวลาในไฟล์) */
function mpvFrame(t: VidTable, fr: Framerate, sec: number) {
  const ms = (sec + t.start) * 1000 - t.base;
  const last = (fr.count || t.times.length) - 1;
  return Math.max(0, Math.min(last, fr.frameAt(ms + 0.5)));
}

/** หยุดเล่น ภาพค้างที่เฟรมที่เห็นอยู่ · keepPos ไม่ย้ายภาพ (หยุดเพื่อเริ่มใหม่จากตำแหน่งอื่น ไม่งั้นภาพเด้งกลับไปเฟรมเก่าแล้วเล่นใหม่วนไปมา)
    keepAudio ไม่หยุดเสียงของหน้าแก้ซับ (เสียงถูกสั่งเล่นอย่างอื่นอยู่แล้ว) */
export function stopVidPlay(keepAudio = false, keepPos = false) {
  if (!st.playing) return;
  run++;
  clear();
  if (engine === "mpv") {
    // เริ่มใหม่จากตำแหน่งอื่นด้วยตัวเล่นเดิม ไฟล์ยังเปิดไว้ คำสั่งเล่นถัดไปแค่ไปเวลาใหม่
    if (!keepPos) {
      const t = mpvTable, fr = mpvFr, my = run;
      void vidApi.mpvStop(true).then((sec) => { if (run === my && sec != null && t && fr) seek(mpvFrame(t, fr, sec)); }, () => {});
    }
  } else {
    void vidApi.playStop().catch(() => {});
    if (!keepAudio) stopPlay();
  }
  const at = shown;
  set({ playing: false, frame: null, engine: null });
  if (engine !== "mpv" && at != null && !keepPos) seek(at);
}

/** ตัวเล่นที่ต้องการกับของที่แบบ mpv ใช้ (ซับที่กำลังแก้ ดีเลย์ของซับ) */
export type PlayOpts = { engine: Engine; sub: () => Promise<string | null>; delayMs: number };

/** เล่นจากเฟรม n0 · aud แทร็กเสียงที่หน้าแก้ซับใช้ (ไม่มี = เล่นภาพอย่างเดียว) · h ความสูงภาพที่ขอ (แบบ Aegisub) */
export async function startVidPlay(movie: string, t: VidTable, fr: Framerate, n0: number, aud: AudSrc | null, h: number, o?: PlayOpts) {
  const restart = st.playing && engine === (o?.engine ?? "aegisub");
  const was = st.playing ? engine : null;
  stopVidPlay(false, true);
  // เปลี่ยนตัวเล่นระหว่างเล่น ปิดไฟล์ของ mpv ที่ยังเปิดค้าง
  if (was === "mpv" && !restart) void vidApi.mpvStop(true).catch(() => {});
  if (o?.engine === "mpv") return startMpv(movie, t, fr, n0, aud, h, o);
  return startAegisub(movie, t, fr, n0, aud, h);
}

async function startAegisub(movie: string, t: VidTable, fr: Framerate, n0: number, aud: AudSrc | null, h: number, why = "") {
  const my = ++run;
  engine = "aegisub";
  const last = (fr.count || t.times.length) - 1;
  if (n0 >= last) return;
  queue = []; shown = n0;
  set({ playing: true, frame: n0, err: why, engine: "aegisub" });
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

/* ---------------------------------------------------------------- แบบ mpv */

/** ตำแหน่งหน้าต่างภาพของ mpv · ส่วนของภาพที่อยู่ในกรอบวิดีโอ (จุดจริงของจอ) กับค่าซูมและเลื่อนภาพให้ภาพที่ซูมเกินกรอบตรงกับภาพนิ่ง
    กล่องไม่แสดงอยู่ (ออกจากหน้า) = null · มีของอื่นเปิดทับกรอบ = show เป็นเท็จ */
function mpvGeom(): MpvRect | null {
  const box = mpvBox;
  if (!box || !box.isConnected) return null;
  const frame = (box.closest("[data-vframe]") as HTMLElement | null) ?? box;
  const r = box.getBoundingClientRect(), c = frame.getBoundingClientRect();
  if (r.width < 2 || r.height < 2 || c.width < 2 || c.height < 2) return null;
  const x0 = Math.max(r.left, c.left, 0), y0 = Math.max(r.top, c.top, 0);
  const x1 = Math.min(r.right, c.right, innerWidth), y1 = Math.min(r.bottom, c.bottom, innerHeight);
  const vw = x1 - x0, vh = y1 - y0;
  if (vw < 2 || vh < 2) return { x: 0, y: 0, w: 1, h: 1, show: false, zoom: 0, panX: 0, panY: 0 };
  // mpv วางภาพพอดีกรอบตามอัตราส่วน (keepaspect) แล้วขยายด้วย video-zoom (log2) เลื่อนด้วย video-pan (สัดส่วนของขนาดภาพที่ขยายแล้ว)
  const fitW = Math.min(vw, (vh * r.width) / r.height);
  const zoom = Math.log2(r.width / fitW);
  const panX = (r.left + r.width / 2 - (x0 + vw / 2)) / r.width;
  const panY = (r.top + r.height / 2 - (y0 + vh / 2)) / r.height;
  // มีของอื่นทับกรอบไหม · ดู 9 จุดในกรอบ ของบนสุดต้องอยู่ในกรอบวิดีโอ
  let covered = false;
  for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.08, 0.5, 0.92]) {
    const top = document.elementFromPoint(x0 + vw * fx, y0 + vh * fy);
    if (!top || !frame.contains(top)) covered = true;
  }
  const d = devicePixelRatio || 1;
  return { x: Math.round(x0 * d), y: Math.round(y0 * d), w: Math.round(vw * d), h: Math.round(vh * d), show: !covered, zoom, panX, panY };
}
const sameGeom = (a: MpvRect | null, b: MpvRect | null) => !!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.show === b.show
  && Math.abs(a.zoom - b.zoom) < 1e-4 && Math.abs(a.panX - b.panX) < 1e-4 && Math.abs(a.panY - b.panY) < 1e-4;

/** ความดังของหน้าแก้ซับ (ตัวคูณเส้นตรง) เป็นค่าของ mpv (mpv ยกกำลังสามในตัว) */
const mpvVol = (v: number) => Math.max(0, Math.min(200, 100 * Math.cbrt(Math.max(0, v))));
/** ดีเลย์ของซับสำหรับ mpv วินาที · เวลาซับของโปรแกรมนับจากเฟรมแรก mpv นับจาก start_time ของไฟล์ */
const mpvDelay = (t: VidTable, delayMs: number) => (delayMs + t.base) / 1000 - t.start;

/** รอให้หน้าจอวาดกล่องตรงตำแหน่งภาพเสร็จ (กล่องขึ้นหลังสถานะเป็นกำลังเล่น) ไม่เกินครึ่งวินาที */
async function waitBox(my: number) {
  for (let i = 0; i < 30; i++) {
    if (run !== my) return null;
    const g = mpvGeom();
    if (g) return g;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

async function startMpv(movie: string, t: VidTable, fr: Framerate, n0: number, aud: AudSrc | null, h: number, o: PlayOpts) {
  const my = ++run;
  const last = (fr.count || t.times.length) - 1;
  if (n0 >= last) return;
  engine = "mpv"; mpvTable = t; mpvFr = fr; shown = n0;
  // เสียงของหน้าแก้ซับหยุดก่อน mpv เล่นเสียงเอง · จดเลขรอบไว้ ถ้ามีการสั่งเล่นเสียงอย่างอื่น ภาพหยุดตาม
  stopPlay();
  const myAud = playRun();
  set({ playing: true, frame: n0, err: "", engine: "mpv" });
  const g = await waitBox(my);
  if (run !== my) return;
  if (!g) { stopVidPlay(); return; }
  let audioFf: number | null = null, audioFile: string | null = null;
  if (aud) {
    if (aud.path !== movie) audioFile = aud.path;
    else { const m = /^0:(\d+)$/.exec(aud.map); if (m) audioFf = Number(m[1]); }
  }
  let sub: string | null = null;
  try { sub = await o.sub(); } catch { sub = null; }
  if (run !== my) return;
  let vol = getVolume();
  try {
    // ตัวตรวจจำลองว่าเปิด mpv ไม่ได้ (รุ่นทดสอบเท่านั้น) ดูว่าเล่นแบบ Aegisub แทนจริง
    if (import.meta.env.DEV && (window as unknown as { __mpvFail?: string }).__mpvFail) throw new Error((window as unknown as { __mpvFail: string }).__mpvFail);
    await vidApi.mpvPlay({ movie, t0: seekOf(t, n0), audioFf, audioFile, sub, subDelay: mpvDelay(t, o.delayMs), ...g, volume: mpvVol(vol) });
  } catch (e) {
    if (run !== my) return;
    // เปิด mpv ไม่ได้ เล่นแบบ Aegisub แทน แล้วบอกเหตุผลใต้ภาพ
    set({ playing: false, engine: null });
    return startAegisub(movie, t, fr, n0, aud, h, `เล่นด้วย mpv ไม่ได้ จึงเล่นแบบ Aegisub แทน (${String(e)})`);
  }
  // รอบนี้ถูกแทนระหว่างรอ mpv · ถ้ารอบใหม่เล่นด้วย mpv อยู่ ห้ามหยุด mpv ทับรอบใหม่ (คำสั่งเล่นของรอบใหม่ต่อคิวอยู่หลังรอบนี้)
  if (run !== my) { if (!(st.playing && engine === "mpv")) void vidApi.mpvStop(true).catch(() => {}); return; }
  let geo: MpvRect | null = g;
  let busy = false;
  timer = window.setInterval(() => {
    if (run !== my || busy) return;
    if (playRun() !== myAud) { stopVidPlay(true); return; }
    const ng = mpvGeom();
    if (!ng) { stopVidPlay(); return; }
    if (!sameGeom(ng, geo)) { geo = ng; void vidApi.mpvRect(ng).catch(() => {}); }
    const v = getVolume();
    if (v !== vol) { vol = v; void vidApi.mpvVolume(mpvVol(v)).catch(() => {}); }
    busy = true;
    vidApi.mpvState().then((s) => {
      busy = false;
      if (run !== my) return;
      if (s.t != null) { const n = mpvFrame(t, fr, s.t); shown = n; if (st.frame !== n) set({ frame: n }); }
      if (s.eof) stopVidPlay();
    }, () => { busy = false; });
  }, 50);
}

/** ซับที่กำลังแก้เปลี่ยนระหว่างเล่นแบบ mpv ส่งฉบับใหม่ให้ mpv */
export function mpvSubUpdate(sub: string | null, t: VidTable, delayMs: number) {
  if (!st.playing || engine !== "mpv") return;
  void vidApi.mpvSub(sub, mpvDelay(t, delayMs)).catch(() => {});
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __vidPlay: () => ({ ...st, queue: queue.length }), __vidPlayStop: () => stopVidPlay() });
