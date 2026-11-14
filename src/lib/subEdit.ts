/* store ของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 2 · BUGS ข้อ 109)
   เอกสารซับที่เปิด บรรทัดที่เลือก ประวัติเลิกทำทำซ้ำ 200 ขั้นพร้อมชื่อการแก้ ข้อความเดิมของแต่ละบรรทัด (แสดงต้นฉบับ)
   สถานะแก้แล้วยังไม่บันทึก บอกฝั่ง Rust ทุกครั้งที่เปลี่ยน ให้ตัวกันปิดถามก่อนปิดโปรแกรม
   บันทึกอัตโนมัติทุก 60 วินาทีที่มีการแก้ ลงโฟลเดอร์ autosave ของโปรแกรม (subdoc.rs เก็บ 10 ฉบับล่าสุดต่อไฟล์)
   ค่าอยู่ระดับโมดูล สลับหน้าแล้วไม่หาย แบบ avJob.ts
   เอกสารไม่แก้ทับของเดิม ทุกการแก้สร้างเอกสารใหม่ บรรทัดที่ไม่ได้แก้คงเป็นตัวเดิม ใช้เทียบได้ว่าบรรทัดไหนแก้แล้ว */
import { useSyncExternalStore } from "react";
import { inApp, subDocApi, type SubAutosave, type SubDoc, type SubEvent } from "./api";
import { setOwnAudio, setPend } from "./subTiming";

export type SubEditMeta = {
  /** ชื่อที่แสดงและใช้ตั้งชื่อฉบับบันทึกอัตโนมัติ เช่น ชื่อไฟล์ซับ หรือ ชื่อหนัง แทร็ก 2 */
  name: string;
  /** หนังที่ใช้ดูภาพกับฟังเสียง · ว่าง = ยังไม่มีวิดีโอ */
  movie: string;
  /** ซับที่เปิดอยู่ (แทร็กในหน้าซับไตเติล) · หน้าแก้ซับใช้รู้ว่าต้องเปิดใหม่ไหม */
  key?: string;
  /** ที่เก็บตั้งต้นของปุ่มบันทึกเป็นไฟล์ใหม่ · ชื่อไฟล์ไม่มีนามสกุล เช่น D:\หนัง\เรื่อง.th */
  base?: string;
};

type Snap = { doc: SubDoc; sel: number[]; active: number | null; label: string };

export type SubEditState = {
  doc: SubDoc | null;
  meta: SubEditMeta | null;
  /** เอกสารตอนเปิดหรือตอนบันทึกล่าสุด ใช้บอกว่าแก้แล้วยังไม่บันทึก และบรรทัดไหนแก้ */
  saved: SubDoc | null;
  /** ข้อความเดิมของแต่ละบรรทัดตอนเปิดไฟล์ ตามรหัสบรรทัด (แสดงต้นฉบับ แทรกต้นฉบับ) */
  orig: Record<number, string>;
  sel: number[];
  active: number | null;
  undo: Snap[];
  redo: Snap[];
  dirty: boolean;
  autosave: { at: string | null; err: string | null };
};

const LIMIT = 200;
/** พิมพ์ต่อกันในช่องเดียวกันภายในเวลานี้ นับเป็นการแก้ขั้นเดียว เลิกทำทีเดียวได้ทั้งคำ (แคลร์ตั้ง) */
const MERGE_MS = 1500;
const AUTOSAVE_MS = 60_000;

const START: SubEditState = { doc: null, meta: null, saved: null, orig: {}, sel: [], active: null, undo: [], redo: [], dirty: false, autosave: { at: null, err: null } };
let st: SubEditState = START;
const subs = new Set<() => void>();
let last: { merge: string; at: number } | null = null;
let autosaved: SubDoc | null = null;
let dirtySent: string | null = null;
/** เอกสารที่เปิดยังไม่ได้เขียนลงไฟล์เดิม (เปิดจากฉบับบันทึกอัตโนมัติ) · ยังไม่บันทึกแม้เลิกทำกลับไปจุดเปิด */
let baseUnsaved = false;

/** มีที่พิมพ์ในแบบ notepad ยังไม่ลงเอกสาร · ตัวกันปิดโปรแกรมต้องนับว่ายังไม่บันทึก (ผู้ช่วยตรวจทาน F8) */
let typing = false;
export function setTyping(v: boolean) {
  if (typing === v) return;
  typing = v;
  set({});
}

function set(patch: Partial<SubEditState>) {
  st = { ...st, ...patch };
  subs.forEach((f) => f());
  const want = (st.dirty || typing) && st.meta ? st.meta.name : null;
  if (want !== dirtySent && inApp) {
    dirtySent = want;
    void subDocApi.setDirty(want).catch(() => {});
  }
}

export function getSubEdit() {
  return st;
}
export function useSubEdit() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => st);
}

/** เปิดเอกสารใหม่ ล้างประวัติ · บรรทัดแรกที่ไม่ใช่ความคิดเห็นถูกเลือก */
export function openDoc(doc: SubDoc, meta: SubEditMeta, opts?: { dirty?: boolean }) {
  const orig: Record<number, string> = {};
  for (const e of doc.events) orig[e.id] = e.text;
  const first = doc.events.find((e) => !e.comment) ?? doc.events[0];
  last = null;
  autosaved = doc;
  // เวลาที่ลากค้างของเอกสารเดิมไม่ติดมา (รหัสบรรทัดอาจตรงกัน) · ไฟล์เสียงแยกผูกกับซับที่เปิด เปิดซับอื่นแล้วกลับไปใช้เสียงของหนัง (ผู้ช่วยตรวจทาน F14 F12)
  setPend(null);
  if (st.meta?.key !== meta.key) setOwnAudio(null);
  // ฉบับบันทึกอัตโนมัติเปิดแล้วนับว่ายังไม่บันทึก (ยังไม่ได้เขียนลงไฟล์เดิม)
  baseUnsaved = !!opts?.dirty;
  set({ ...START, doc, meta, saved: doc, orig, sel: first ? [first.id] : [], active: first?.id ?? null, dirty: baseUnsaved });
}

export function closeDoc() {
  last = null;
  setPend(null);
  autosaved = null;
  baseUnsaved = false;
  set({ ...START });
}

/** แก้เอกสาร · label ชื่อการแก้ที่ขึ้นในปุ่มเลิกทำ · merge = คีย์ของการพิมพ์ต่อเนื่อง (เช่น text:12) */
export function edit(label: string, fn: (d: SubDoc) => SubDoc, opts?: { merge?: string; sel?: number[]; active?: number | null; /** รวมเป็นขั้นเดียวไม่ว่าห่างกันนานแค่ไหน จนกว่าจะมีการแก้หรือเลือกอื่นคั่น (แบบ notepad ขั้น 8) */ sticky?: boolean }) {
  const prev = st.doc;
  if (!prev) return;
  const next = fn(prev);
  if (next === prev) return;
  const now = Date.now();
  const same = !!opts?.merge && last?.merge === opts.merge && (opts.sticky || now - last.at < MERGE_MS) && st.undo.length > 0;
  const undo = same ? st.undo : [...st.undo, { doc: prev, sel: st.sel, active: st.active, label }].slice(-LIMIT);
  last = opts?.merge ? { merge: opts.merge, at: now } : null;
  set({ doc: next, undo, redo: [], dirty: next !== st.saved || baseUnsaved, sel: opts?.sel ?? st.sel, active: opts?.active !== undefined ? opts.active : st.active });
}

/** ที่มาของไฟล์ (ที่อยู่ ขนาด เวลาแก้ เลขแทร็ก) รหัสอักษร และเข้ารหัสได้ครบไหม ไม่ใช่การแก้ที่เลิกทำได้
    เอกสารที่ย้อนคืนจากประวัติใช้ค่าของเอกสารปัจจุบัน ไม่งั้นเลิกทำหลังบันทึกแล้วได้ที่มาของก่อนบันทึกคืน
    กดบันทึกแล้วเตือนว่าไฟล์ถูกแก้จากที่อื่น หรือเขียนทับไฟล์เดิมหลังบันทึกเป็นไฟล์ใหม่ (ผู้ช่วยตรวจทาน F3) */
function keepFile(d: SubDoc): SubDoc {
  const c = st.doc;
  if (!c || (d.source === c.source && d.enc === c.enc && d.exact === c.exact)) return d;
  return { ...d, source: c.source, enc: c.enc, exact: c.exact };
}

export function undo() {
  const top = st.undo.at(-1);
  if (!top || !st.doc) return;
  last = null;
  // เวลาที่ลากค้างทิ้งตอนเลิกทำ ไม่ไปลงทับเอกสารที่ย้อนแล้ว (F14)
  setPend(null);
  const doc = keepFile(top.doc);
  set({ doc, sel: top.sel, active: top.active, undo: st.undo.slice(0, -1), redo: [...st.redo, { doc: st.doc, sel: st.sel, active: st.active, label: top.label }], dirty: doc !== st.saved || baseUnsaved });
}

export function redo() {
  const top = st.redo.at(-1);
  if (!top || !st.doc) return;
  last = null;
  setPend(null);
  const doc = keepFile(top.doc);
  set({ doc, sel: top.sel, active: top.active, redo: st.redo.slice(0, -1), undo: [...st.undo, { doc: st.doc, sel: st.sel, active: st.active, label: top.label }], dirty: doc !== st.saved || baseUnsaved });
}

export function select(ids: number[], active?: number | null) {
  last = null;
  set({ sel: ids, active: active !== undefined ? active : ids.at(-1) ?? null });
}

/** บันทึกสำเร็จ · written คือเอกสารที่เขียนลงไฟล์จริง (ตอนกดบันทึก) · file ที่มาใหม่ของไฟล์ รหัสอักษร เข้ารหัสได้ครบ
    เอกสารที่บันทึกแล้วเป็นจุดเทียบใหม่ ประวัติเลิกทำยังอยู่
    พิมพ์ต่อระหว่างรอบันทึก เอกสารปัจจุบันได้ที่มาใหม่ด้วย แต่ยังนับว่ายังไม่บันทึก (ไม่งั้นตัวที่พิมพ์ระหว่างรอถูกนับว่าบันทึกแล้วทั้งที่ไม่ได้ลงไฟล์ · F4) */
export function markSaved(written: SubDoc, file: Pick<SubDoc, "source" | "enc" | "exact">, meta?: SubEditMeta) {
  const saved: SubDoc = { ...written, ...file };
  const now = st.doc;
  const doc = !now || now === written ? saved : { ...now, ...file };
  autosaved = saved;
  baseUnsaved = false;
  set({ doc, saved, dirty: doc !== saved, meta: meta ?? st.meta });
}

/** รหัสบรรทัดใหม่ที่ไม่ซ้ำกับทุกบรรทัดและสไตล์ในเอกสาร */
export function nextId(d: SubDoc) {
  let m = 0;
  for (const e of d.events) m = Math.max(m, e.id);
  for (const s of d.styles) m = Math.max(m, s.id);
  return m + 1;
}

/** แก้ช่องของบรรทัดเดียว */
export function updateEvent(id: number, patch: Partial<SubEvent>, label: string, merge?: string) {
  edit(label, (d) => {
    let hit = false;
    const events = d.events.map((e) => {
      if (e.id !== id) return e;
      const changed = (Object.keys(patch) as (keyof SubEvent)[]).some((k) => e[k] !== patch[k]);
      if (!changed) return e;
      hit = true;
      return { ...e, ...patch };
    });
    return hit ? { ...d, events } : d;
  }, { merge });
}

/** บรรทัดว่างใหม่ที่ใส่ในเอกสารได้ · ช่องที่ฝั่ง Rust ต้องการครบ ไม่มีข้อความเดิม */
export function blankEvent(d: SubDoc, at: Partial<SubEvent>): SubEvent {
  return {
    id: nextId(d), comment: false, layer: 0, start: 0, end: 0, style: d.kind === "ass" || d.kind === "ssa" ? (d.styles[0]?.fields[0] ?? "Default") : "",
    actor: "", marginL: 0, marginR: 0, marginV: 0, effect: "", text: "", ident: null, suffix: "", pre: [], raw: [], ...at,
  };
}

/** แทรกบรรทัดหลังตำแหน่งที่กำหนด (−1 = บนสุด) แล้วเลือกบรรทัดใหม่ */
export function insertEvent(after: number, e: SubEvent, label: string) {
  edit(label, (d) => {
    const events = d.events.slice();
    events.splice(after + 1, 0, e);
    return { ...d, events };
  }, { sel: [e.id], active: e.id });
}

/** ลบบรรทัด แล้วเลือกบรรทัดที่อยู่ตำแหน่งเดิม */
export function deleteEvents(ids: number[], label: string) {
  const d = st.doc;
  if (!d || ids.length === 0) return;
  const drop = new Set(ids);
  const firstAt = d.events.findIndex((e) => drop.has(e.id));
  // บรรทัดในไฟล์ที่ตารางไม่แสดง (บรรทัดอ่านไม่ออก ความเห็น ;) เก็บติดหน้าบรรทัดซับถัดไป ลบบรรทัดซับนั้นแล้วย้ายไปติดหน้าบรรทัดที่เหลือถัดไป
  // ไม่หายไปเงียบ ๆ (ผู้ช่วยตรวจทาน R8) · บรรทัดว่างอย่างเดียวไม่ย้าย
  const events: SubEvent[] = [];
  let carry: SubEvent["pre"] = [];
  for (const e of d.events) {
    if (drop.has(e.id)) { if (e.pre.some((r) => r.t.trim())) carry = [...carry, ...e.pre]; continue; }
    events.push(carry.length ? { ...e, pre: [...carry, ...e.pre] } : e);
    carry = [];
  }
  const next = events[Math.min(firstAt, events.length - 1)];
  edit(label, (x) => ({ ...x, events }), { sel: next ? [next.id] : [], active: next?.id ?? null });
}

/** ตารางรหัสบรรทัดของเอกสารที่บันทึกล่าสุด · คำนวณครั้งเดียวต่อเอกสาร */
const savedMap = new WeakMap<SubDoc, Map<number, SubEvent>>();
/** บรรทัดนี้แก้แล้วยังไม่บันทึกไหม · บรรทัดใหม่ก็นับว่าแก้ */
export function isEdited(e: SubEvent) {
  const s = st.saved;
  if (!s) return false;
  let m = savedMap.get(s);
  if (!m) { m = new Map(s.events.map((x) => [x.id, x])); savedMap.set(s, m); }
  return m.get(e.id) !== e;
}
/** จำนวนบรรทัดที่แก้ (รวมบรรทัดที่ลบ) เทียบกับที่บันทึกล่าสุด */
export function editedCount() {
  const d = st.doc, s = st.saved;
  if (!d || !s) return 0;
  const now = new Set(d.events.map((e) => e.id));
  return d.events.filter(isEdited).length + s.events.filter((e) => !now.has(e.id)).length;
}

/* ตัวบันทึกของหน้าแก้ซับ · หน้าต่างถามตอนปิดโปรแกรมเรียกผ่านทางนี้ (หน้าแก้ซับเป็นคนรู้ว่าบันทึกทับหรือต้องถามชื่อไฟล์ใหม่)
   คืน true บันทึกแล้ว "choose" หน้าแก้ซับขึ้นหน้าต่างให้คนเลือกต่อ false ไม่สำเร็จ · ยังไม่มีหน้าแก้ซับ = null (ผู้ช่วยตรวจทาน F17) */
export type SaveResult = boolean | "choose";
let saver: (() => Promise<SaveResult>) | null = null;
export function setSaver(f: (() => Promise<SaveResult>) | null) {
  saver = f;
}
export async function requestSave(): Promise<SaveResult | null> {
  return saver ? saver() : null;
}

/* บันทึกอัตโนมัติ ทุก 60 วินาทีเฉพาะตอนมีการแก้ที่ยังไม่ได้เก็บ */
export async function autosaveNow(): Promise<SubAutosave | null> {
  const d = st.doc, m = st.meta;
  if (!d || !m || !st.dirty || d === autosaved) return null;
  try {
    const r = await subDocApi.autosave(d, m.name);
    autosaved = d;
    set({ autosave: { at: r.at, err: null } });
    return r;
  } catch (e) {
    set({ autosave: { at: st.autosave.at, err: String(e) } });
    return null;
  }
}
if (inApp) setInterval(() => { void autosaveNow(); }, AUTOSAVE_MS);

/** เก็บที่แก้เป็นฉบับบันทึกอัตโนมัติก่อนทิ้งเอกสาร (ไม่บันทึก เปิดฉบับอัตโนมัติ ปิดโปรแกรมแบบไม่บันทึก)
    เก็บไม่ได้โยนข้อผิดพลาด ทางเรียกต้องหยุดและบอกคน ไม่ทิ้งที่แก้ทั้งที่ยังไม่มีฉบับให้เปิดคืน (ผู้ช่วยตรวจทาน F7) */
export async function autosaveStrict(): Promise<void> {
  const d = st.doc, m = st.meta;
  if (!d || !m || !st.dirty || d === autosaved) return;
  try {
    const r = await subDocApi.autosave(d, m.name);
    autosaved = d;
    set({ autosave: { at: r.at, err: null } });
  } catch (e) {
    set({ autosave: { at: st.autosave.at, err: String(e) } });
    throw new Error(`เก็บฉบับบันทึกอัตโนมัติไม่สำเร็จ ยังไม่ทิ้งที่แก้  ${String(e)}`);
  }
}

/* ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ */
if (import.meta.env.DEV) {
  (window as unknown as { __subEdit: unknown }).__subEdit = { get: getSubEdit, edit, undo, redo, select, updateEvent, insertEvent, deleteEvents, blankEvent, autosaveNow, editedCount, openDoc, closeDoc, markSaved };
}
