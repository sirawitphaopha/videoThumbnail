/* งาน OCR ซับรูป (แผน OCR ขั้น 10 · ocrjob.rs) เก็บระดับโปรแกรม ไม่ผูกกับหน้า เปลี่ยนหน้าแล้วกลับมา ผล ความคืบหน้า ตัวที่รอสอน อยู่ครบ (แบบ convertJob.ts)
   หน้าจอเดินทีละภาพ Rust อ่านหนึ่งภาพต่อคำสั่ง · หยุดชั่วคราวคือไม่เรียกภาพถัดไป อ่านต่อคือเรียกต่อ · อ่านเฉพาะบรรทัดที่เลือกส่งลำดับมาเอง
   ตัวอ่านแบบเทียบภาพที่เปิดหยุดสอน ได้คำขอสอนแทนผล งานรอคำตอบจากหน้าต่างสอน (answerTeach) แล้วอ่านภาพเดิมซ้ำ แบบ RunNOcrLoop ของ Subtitle Edit
   เปิดถามคำที่ไม่รู้จัก งานรอคำตอบทีละคำ (answerWord) แบบ PromptUnknownWordWindow · ค่าตั้งจำไว้ในเครื่อง */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, ocrApi, type OcrCfg, type OcrItem, type OcrLine, type OcrReason, type OcrSource, type OcrTeachAnswer, type OcrTeachReq } from "./api";

export type OcrRowState = "wait" | "work" | "done" | "fail";
export type OcrRow = {
  item: OcrItem;
  state: OcrRowState;
  /** ข้อความที่ใช้ (ผลอ่านหลังตัวแก้คำ หรือที่ผู้ใช้แก้) */
  text: string;
  /** ผลอ่านล่าสุดจาก Rust · ยังไม่อ่านเป็น null */
  line: OcrLine | null;
  /** ผู้ใช้แก้ข้อความเองแล้ว · อ่านซ้ำไม่ทับเว้นแต่สั่งอ่านบรรทัดนั้นเอง */
  edited: boolean;
  /** ชื่อเดียวกันเขียนสองแบบ คิดจากทั้งไฟล์หลังอ่านจบรอบ */
  names: OcrReason[];
  /** ผู้ใช้กดว่าถูกแล้ว ไม่นับเป็นจุดที่ต้องตรวจ */
  ok: boolean;
  error: string | null;
};
/** คำที่ไม่รู้จักที่รอถาม · ปุ่มตาม PromptUnknownWordWindow ของ Subtitle Edit */
export type OcrAsk = { index: number; word: string; suggestions: string[] };
export type OcrWordAnswer =
  | { kind: "useOnce"; to: string }
  | { kind: "changeAll"; to: string }
  | { kind: "skipOnce" }
  | { kind: "skipAll" }
  | { kind: "addWord" }
  | { kind: "addName" }
  | { kind: "editLine"; text: string }
  | { kind: "stop" };

export type OcrJob = {
  path: string | null;
  ff: number;
  kind: OcrSource["kind"] | null;
  rows: OcrRow[];
  opening: boolean;
  openPercent: number;
  openError: string | null;
  running: boolean;
  paused: boolean;
  stopping: boolean;
  /** ลำดับภาพที่สั่งอ่านในรอบนี้ กับจำนวนที่ทำแล้ว */
  runIds: number[];
  runDone: number;
  /** เวลาที่เดินของรอบนี้ · ตอนหยุดชั่วคราวเก็บสะสมไว้ใน elapsedMs */
  startedAt: number | null;
  elapsedMs: number;
  current: number | null;
  teach: OcrTeachReq | null;
  ask: OcrAsk | null;
  cfg: OcrCfg;
  /** ถามคำที่ไม่รู้จักทีละคำระหว่างอ่าน (PromptForUnknownWords ของ Subtitle Edit ค่าตั้งต้นปิด) */
  promptUnknown: boolean;
  error: string | null;
};

const CFG_KEY = "ms.ocrCfg";
const PROMPT_KEY = "ms.ocrPrompt";
/** ค่าตั้งต้นตรงกับ OcrCfg::default ใน ocrjob.rs · ตัวหลัก PaddleOCR small (แม่นสุดในผลเทียบ ACCA) */
export const DEFAULT_OCR_CFG: OcrCfg = {
  engine: "paddle",
  paddle: { lang: "", size: "small", vertical: "auto", orientation: false },
  tess: { lang: "eng", oem: 3, perLine: false, vertical: "auto" },
  nocrDb: "Latin", maxWrong: 25, italic: true, spacePx: 0, lastDitch: false,
  binDb: "Latin", binMaxErr: 0.5, binSpacePx: 12, ownDb: "Thai",
  fallback: false, teach: true, lines: 60, algo: "Random",
  helpers: [],
  prep: { cropTransparent: false, invert: false, binarize: false, removeBorders: false, borderSize: 2, toOneColor: false, oneColorThreshold: 128, upscaleTo: 0 },
  fix: true, lang3: "eng", dict: "en_US", guess: true, confMin: 0.9,
};

function loadCfg(): OcrCfg {
  try {
    const v = JSON.parse(localStorage.getItem(CFG_KEY) ?? "null");
    if (v && typeof v.engine === "string") {
      return { ...DEFAULT_OCR_CFG, ...v, paddle: { ...DEFAULT_OCR_CFG.paddle, ...v.paddle }, tess: { ...DEFAULT_OCR_CFG.tess, ...v.tess }, prep: { ...DEFAULT_OCR_CFG.prep, ...v.prep } };
    }
  } catch { /* ใช้ค่าตั้งต้น */ }
  return DEFAULT_OCR_CFG;
}
function loadPrompt(): boolean {
  try { return localStorage.getItem(PROMPT_KEY) === "1"; } catch { return false; }
}

let j: OcrJob = {
  path: null, ff: 0, kind: null, rows: [], opening: false, openPercent: 0, openError: null,
  running: false, paused: false, stopping: false, runIds: [], runDone: 0, startedAt: null, elapsedMs: 0, current: null,
  teach: null, ask: null, cfg: loadCfg(), promptUnknown: loadPrompt(), error: null,
};
const subs = new Set<() => void>();

function set(patch: Partial<OcrJob>) {
  j = { ...j, ...patch };
  subs.forEach((f) => f());
}
function patchRow(i: number, patch: Partial<OcrRow>) {
  set({ rows: j.rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
}
export function getOcrJob() {
  return j;
}
export function useOcrJob() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => j);
}

/** เวลาที่เดินของรอบนี้ (มิลลิวินาที) · หน้าจอเรียกทุกวินาทีเอง */
export function ocrElapsed(now = Date.now()) {
  return j.elapsedMs + (j.startedAt != null ? now - j.startedAt : 0);
}

// ---------------------------------------------------------------- เปิดซับรูป

function rowsOf(src: OcrSource): OcrRow[] {
  return src.items.map((item) => ({ item, state: "wait", text: "", line: null, edited: false, names: [], ok: false, error: null }));
}

/** เปิดซับรูป (ไฟล์ .sup .idx .xml หรือแทร็กในหนัง ff) · งานเดิมที่ยังอ่านอยู่ต้องหยุดก่อน */
export async function openSource(path: string, ff = 0) {
  if (j.running) throw new Error("กำลังอ่านอยู่ หยุดก่อนแล้วค่อยเปิดไฟล์ใหม่");
  set({ path, ff, kind: null, rows: [], opening: true, openPercent: 0, openError: null, runDone: 0, runIds: [], elapsedMs: 0, startedAt: null, current: null, error: null });
  try {
    const src = await ocrApi.source(path, ff);
    if (j.path !== path || j.ff !== ff) return;
    set({ kind: src.kind, rows: rowsOf(src), opening: false, openPercent: 100 });
  } catch (e) {
    if (j.path === path && j.ff === ff) set({ opening: false, openError: String(e) });
  }
}

/** นำเข้าภาพ PNG ทีละไฟล์ */
export async function openPngs(files: string[]) {
  if (j.running) throw new Error("กำลังอ่านอยู่ หยุดก่อนแล้วค่อยเปิดไฟล์ใหม่");
  const key = files[0] ?? "";
  set({ path: key, ff: 0, kind: null, rows: [], opening: true, openPercent: 0, openError: null, runDone: 0, runIds: [], elapsedMs: 0, startedAt: null, current: null, error: null });
  try {
    const src = await ocrApi.sourcePngs(files);
    if (j.path !== key) return;
    set({ kind: src.kind, rows: rowsOf(src), opening: false, openPercent: 100 });
  } catch (e) {
    if (j.path === key) set({ opening: false, openError: String(e) });
  }
}

// ---------------------------------------------------------------- ค่าตั้ง

export function setOcrCfg(patch: Partial<OcrCfg>) {
  const cfg = { ...j.cfg, ...patch };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ }
  set({ cfg });
}
export function setPromptUnknown(on: boolean) {
  try { localStorage.setItem(PROMPT_KEY, on ? "1" : "0"); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ }
  set({ promptUnknown: on });
}

// ---------------------------------------------------------------- แก้ข้อความ

export function setRowText(i: number, text: string) {
  if (!j.rows[i]) return;
  patchRow(i, { text, edited: true });
}
/** กดว่าบรรทัดนี้ถูกแล้ว หรือเอาออก */
export function setRowOk(i: number, ok: boolean) {
  if (j.rows[i]) patchRow(i, { ok });
}
/** เหตุที่สงสัยของบรรทัด รวมชื่อสองแบบ · กดถูกแล้วไม่มีเหตุ */
export function rowReasons(r: OcrRow): OcrReason[] {
  return r.ok || !r.line ? [] : [...r.line.reasons, ...r.names];
}
/** คำที่ผู้ใช้จำแล้ว (เพิ่มชื่อ เพิ่มพจนานุกรม ข้ามทุกที่ เปลี่ยนทุกที่) ไม่นับเป็นคำที่ไม่รู้จักอีกในทุกบรรทัด ไม่ต้องอ่านใหม่ */
export function forgetWord(w: string) {
  set({ rows: j.rows.map((r) => {
    if (!r.line || !r.line.unknown.includes(w)) return r;
    const reasons = r.line.reasons.map((x) => (x.kind === "unknown" ? { ...x, words: x.words.filter((y) => y !== w) } : x)).filter((x) => x.kind !== "unknown" || x.words.length);
    return { ...r, line: { ...r.line, unknown: r.line.unknown.filter((y) => y !== w), reasons } };
  }) });
}
/** คิดชื่อสองแบบใหม่ทั้งไฟล์ · เรียกหลังอ่านจบรอบและหลังแก้ข้อความ */
export async function refreshNames() {
  if (!j.rows.length) return;
  try {
    const names = await ocrApi.names(j.rows.map((r) => r.text));
    set({ rows: j.rows.map((r, k) => ({ ...r, names: names[k] ?? [] })) });
  } catch { /* ไม่มีผลชื่อก็ไม่เป็นไร */ }
}
/** บรรทัดที่ยังไม่มีข้อความ (ภาพว่าง หรืออ่านไม่ได้) · หน้าต่างส่งออกถามก่อนบันทึก */
export function emptyRows() {
  return j.rows.map((r, k) => (r.text.trim() ? -1 : k)).filter((k) => k >= 0);
}

// ---------------------------------------------------------------- คำตอบจากหน้าต่าง

let teachWait: ((a: OcrTeachAnswer) => void) | null = null;
let askWait: ((a: OcrWordAnswer) => void) | null = null;
let pauseWait: (() => void) | null = null;

/** คำตอบของหน้าต่างสอนตัวอักษร */
export function answerTeach(a: OcrTeachAnswer) {
  const f = teachWait;
  teachWait = null;
  set({ teach: null });
  f?.(a);
}
/** คำตอบของหน้าต่างคำที่ไม่รู้จัก */
export function answerWord(a: OcrWordAnswer) {
  const f = askWait;
  askWait = null;
  set({ ask: null });
  f?.(a);
}

/** แทนคำทั้งคำในข้อความ (ไม่แทนคำที่เป็นส่วนของคำอื่น) */
function replaceWord(text: string, from: string, to: string) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(^|[^\\p{L}\\p{N}'])${esc}(?=$|[^\\p{L}\\p{N}'])`, "gu"), (_, pre) => pre + to);
}

/** ถามคำที่ไม่รู้จักของบรรทัดนี้ทีละคำ · คืน false เมื่อผู้ใช้กดหยุด */
async function askWords(i: number, words: string[]): Promise<boolean> {
  const skipped = new Set<string>();
  for (const w of words) {
    if (skipped.has(w) || !j.rows[i].text.includes(w)) continue;
    const suggestions = await ocrApi.suggest(w).catch(() => [] as string[]);
    const a = await new Promise<OcrWordAnswer>((res) => { askWait = res; set({ ask: { index: i, word: w, suggestions } }); });
    switch (a.kind) {
      case "stop": return false;
      case "useOnce": patchRow(i, { text: replaceWord(j.rows[i].text, w, a.to) }); break;
      case "changeAll":
        await ocrApi.word("changeAll", w, a.to).catch(() => {}); forgetWord(w);
        patchRow(i, { text: replaceWord(j.rows[i].text, w, a.to) });
        break;
      case "skipOnce": skipped.add(w); break;
      case "skipAll": await ocrApi.word("skipAll", w).catch(() => {}); forgetWord(w); skipped.add(w); break;
      case "addWord": await ocrApi.word("addWord", w).catch(() => {}); forgetWord(w); skipped.add(w); break;
      case "addName": await ocrApi.word("addName", w).catch(() => {}); forgetWord(w); skipped.add(w); break;
      case "editLine": patchRow(i, { text: a.text, edited: true }); return true;
    }
  }
  return true;
}

// ---------------------------------------------------------------- อ่าน

/** อ่านหนึ่งภาพจนได้ผล · คำขอสอนรอคำตอบแล้วอ่านซ้ำ · คืน false เมื่อผู้ใช้กดหยุดสอน */
async function readOne(i: number): Promise<boolean> {
  for (;;) {
    const r = await ocrApi.read(i, j.cfg);
    if (r.kind === "teach") {
      const a = await new Promise<OcrTeachAnswer>((res) => { teachWait = res; set({ teach: r }); });
      await ocrApi.teach(a, j.cfg);
      if (a.kind === "stop") return false;
      continue;
    }
    const { kind: _k, ...line } = r;
    void _k;
    // สั่งอ่านบรรทัดนี้เอง ผลใหม่แทนข้อความที่แก้ไว้ (บรรทัดที่อ่านแล้วไม่อยู่ในรอบอ่านทั้งไฟล์ จึงไม่ถูกทับเอง)
    patchRow(i, { state: "done", line, text: line.text, edited: false, ok: false, error: null });
    if (j.promptUnknown && line.unknown.length) return askWords(i, line.unknown);
    return true;
  }
}

/** เริ่มอ่าน · ไม่ส่ง ids อ่านทุกภาพที่ยังไม่ได้อ่าน · ส่ง ids อ่านเฉพาะบรรทัดนั้น (อ่านเฉพาะที่เลือก อ่านซ้ำ)
    กำลังอ่านอยู่แล้ว ภาพที่สั่งต่อท้ายรอบเดิม */
export async function startOcr(ids?: number[]) {
  const want = ids ?? j.rows.map((r, k) => (r.state === "done" ? -1 : k)).filter((k) => k >= 0);
  if (!want.length) return;
  if (j.running) { set({ runIds: [...j.runIds, ...want.filter((x) => !j.runIds.includes(x))] }); return; }
  set({ running: true, paused: false, stopping: false, runIds: want, runDone: 0, startedAt: Date.now(), elapsedMs: 0, error: null });
  try {
    for (let n = 0; n < j.runIds.length; n++) {
      if (j.stopping) break;
      if (j.paused) {
        await new Promise<void>((res) => { pauseWait = res; });
        if (j.stopping) break;
      }
      const i = j.runIds[n];
      if (!j.rows[i]) continue;
      set({ current: i });
      patchRow(i, { state: "work", error: null });
      try {
        const go = await readOne(i);
        if (!go) { if (j.rows[i].state === "work") patchRow(i, { state: "wait" }); set({ stopping: true }); break; }
      } catch (e) {
        patchRow(i, { state: "fail", error: String(e) });
      }
      set({ runDone: j.runDone + 1 });
    }
  } finally {
    const acc = ocrElapsed();
    for (const [k, r] of j.rows.entries()) if (r.state === "work") patchRow(k, { state: "wait" });
    set({ running: false, paused: false, stopping: false, current: null, startedAt: null, elapsedMs: acc, teach: null, ask: null });
    teachWait = null;
    askWait = null;
    ocrApi.stop().catch(() => {});
    await refreshNames();
  }
}

/** หยุดชั่วคราว · ภาพที่กำลังอ่านอ่านให้จบก่อน แล้วไม่เรียกภาพถัดไป */
export function pauseOcr() {
  if (!j.running || j.paused) return;
  set({ paused: true, elapsedMs: ocrElapsed(), startedAt: null });
}
/** อ่านต่อจากที่หยุดชั่วคราว */
export function resumeOcr() {
  if (!j.running || !j.paused) return;
  set({ paused: false, startedAt: Date.now() });
  const f = pauseWait;
  pauseWait = null;
  f?.();
}
/** หยุดทั้งรอบ · ตัวที่รอสอนหรือคำที่รอถามตอบเป็นหยุด */
export function stopOcr() {
  if (!j.running) return;
  set({ stopping: true });
  if (teachWait) answerTeach({ kind: "stop" });
  if (askWait) answerWord({ kind: "stop" });
  if (pauseWait) { const f = pauseWait; pauseWait = null; f(); }
}

if (inApp) {
  listen<{ path: string; ff: number; percent: number }>("subimg-progress", (e) => {
    if (j.opening && e.payload.path === j.path && e.payload.ff === j.ff) set({ openPercent: e.payload.percent });
  });
}

/** รุ่นทดสอบ ตัวตรวจคุมงานผ่านตัวนี้แทนการกดดรอปดาวน์ทีละชั้น · ตัวจริงไม่มี */
if (import.meta.env.DEV) (window as unknown as { __ocrJob: object }).__ocrJob = { get: getOcrJob, setCfg: setOcrCfg, start: startOcr, pause: pauseOcr, resume: resumeOcr, stop: stopOcr, answerTeach, answerWord, setText: setRowText, setPrompt: setPromptUnknown };

/** ตรรกะล้วนให้ตัวตรวจเรียกตรง (ไม่แตะ Rust) */
export const __ocrJobLib = { replaceWord };
