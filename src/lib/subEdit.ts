/* store ของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 2 · BUGS ข้อ 109)
   เอกสารซับที่เปิด บรรทัดที่เลือก ประวัติเลิกทำทำซ้ำ 200 ขั้นพร้อมชื่อการแก้ ข้อความเดิมของแต่ละบรรทัด (แสดงต้นฉบับ)
   สถานะแก้แล้วยังไม่บันทึก บอกฝั่ง Rust ทุกครั้งที่เปลี่ยน ให้ตัวกันปิดถามก่อนปิดโปรแกรม
   บันทึกอัตโนมัติทุก 60 วินาทีที่มีการแก้ ลงโฟลเดอร์ autosave ของโปรแกรม (subdoc.rs เก็บ 10 ฉบับล่าสุดต่อไฟล์)
   ค่าอยู่ระดับโมดูล สลับหน้าแล้วไม่หาย แบบ avJob.ts
   เอกสารไม่แก้ทับของเดิม ทุกการแก้สร้างเอกสารใหม่ บรรทัดที่ไม่ได้แก้คงเป็นตัวเดิม ใช้เทียบได้ว่าบรรทัดไหนแก้แล้ว */
import { useSyncExternalStore } from "react";
import { inApp, subDocApi, type SubAutosave, type SubDoc, type SubEvent } from "./api";

export type SubEditMeta = {
  /** ชื่อที่แสดงและใช้ตั้งชื่อฉบับบันทึกอัตโนมัติ เช่น ชื่อไฟล์ซับ หรือ ชื่อหนัง แทร็ก 2 */
  name: string;
  /** หนังที่ใช้ดูภาพกับฟังเสียง · ว่าง = ยังไม่มีวิดีโอ */
  movie: string;
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

function set(patch: Partial<SubEditState>) {
  st = { ...st, ...patch };
  subs.forEach((f) => f());
  const want = st.dirty && st.meta ? st.meta.name : null;
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
  // ฉบับบันทึกอัตโนมัติเปิดแล้วนับว่ายังไม่บันทึก (ยังไม่ได้เขียนลงไฟล์เดิม)
  baseUnsaved = !!opts?.dirty;
  set({ ...START, doc, meta, saved: doc, orig, sel: first ? [first.id] : [], active: first?.id ?? null, dirty: baseUnsaved });
}

export function closeDoc() {
  last = null;
  autosaved = null;
  baseUnsaved = false;
  set({ ...START });
}

/** แก้เอกสาร · label ชื่อการแก้ที่ขึ้นในปุ่มเลิกทำ · merge = คีย์ของการพิมพ์ต่อเนื่อง (เช่น text:12) */
export function edit(label: string, fn: (d: SubDoc) => SubDoc, opts?: { merge?: string; sel?: number[]; active?: number | null }) {
  const prev = st.doc;
  if (!prev) return;
  const next = fn(prev);
  if (next === prev) return;
  const now = Date.now();
  const same = !!opts?.merge && last?.merge === opts.merge && now - last.at < MERGE_MS && st.undo.length > 0;
  const undo = same ? st.undo : [...st.undo, { doc: prev, sel: st.sel, active: st.active, label }].slice(-LIMIT);
  last = opts?.merge ? { merge: opts.merge, at: now } : null;
  set({ doc: next, undo, redo: [], dirty: next !== st.saved || baseUnsaved, sel: opts?.sel ?? st.sel, active: opts?.active !== undefined ? opts.active : st.active });
}

export function undo() {
  const top = st.undo.at(-1);
  if (!top || !st.doc) return;
  last = null;
  set({ doc: top.doc, sel: top.sel, active: top.active, undo: st.undo.slice(0, -1), redo: [...st.redo, { doc: st.doc, sel: st.sel, active: st.active, label: top.label }], dirty: top.doc !== st.saved || baseUnsaved });
}

export function redo() {
  const top = st.redo.at(-1);
  if (!top || !st.doc) return;
  last = null;
  set({ doc: top.doc, sel: top.sel, active: top.active, redo: st.redo.slice(0, -1), undo: [...st.undo, { doc: st.doc, sel: st.sel, active: st.active, label: top.label }], dirty: top.doc !== st.saved || baseUnsaved });
}

export function select(ids: number[], active?: number | null) {
  last = null;
  set({ sel: ids, active: active !== undefined ? active : ids.at(-1) ?? null });
}

/** บันทึกสำเร็จ · เอกสารที่บันทึกแล้ว (ที่มาใหม่ ขนาดกับเวลาแก้ใหม่) เป็นจุดเทียบใหม่ ประวัติเลิกทำยังอยู่ */
export function markSaved(doc: SubDoc, meta?: SubEditMeta) {
  autosaved = doc;
  baseUnsaved = false;
  set({ doc, saved: doc, dirty: false, meta: meta ?? st.meta });
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
  const events = d.events.filter((e) => !drop.has(e.id));
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
   คืน true บันทึกแล้ว false ไม่สำเร็จหรือต้องให้คนเลือกเพิ่ม · ยังไม่มีหน้าแก้ซับ = null */
let saver: (() => Promise<boolean>) | null = null;
export function setSaver(f: (() => Promise<boolean>) | null) {
  saver = f;
}
export async function requestSave(): Promise<boolean | null> {
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

/* ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ */
if (import.meta.env.DEV) {
  (window as unknown as { __subEdit: unknown }).__subEdit = { get: getSubEdit, edit, undo, redo, select, updateEvent, insertEvent, deleteEvents, blankEvent, autosaveNow, editedCount, openDoc, closeDoc, markSaved };
}
