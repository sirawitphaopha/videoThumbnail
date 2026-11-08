/* คิวแปลงเสียงของหน้ากราฟเสียง (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7) เก็บระดับโปรแกรม ไม่ผูกกับหน้า
   เปลี่ยนหน้าระหว่างแปลงแล้วกลับมา คิว ความคืบหน้า ผล อยู่ครบ (แบบ posterJob.ts)
   แปลงทีละไฟล์ตามลำดับ · ฝั่ง Rust (convert.rs) ทำทีละไฟล์ หน้าจอเป็นคนเรียกไฟล์ถัดไป
   หยุดทั้งคิว = สั่งหยุดไฟล์ที่กำลังทำ แล้วไม่เรียกไฟล์ถัดไป ไฟล์ที่ยังไม่เริ่มรออยู่ในคิวเหมือนเดิม */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { convertApi, inApp, type ApplyProblem, type AudioFile, type ConvProgress, type ConvResult, type EncodeSpec } from "./api";

export type QState = "wait" | "work" | "done" | "fail" | "stop";
export type QItem = {
  id: string;
  path: string;
  /** ข้อมูลไฟล์ · null = กำลังอ่าน */
  file: AudioFile | null;
  /** อ่านไฟล์ไม่ได้ (ไม่มีแทร็กเสียง ไฟล์เสีย) แปลงไม่ได้ */
  bad: string | null;
  /** รูปปก (data URL) · undefined = ยังไม่ได้อ่าน · null = ไม่มีรูปปก */
  thumb?: string | null;
  spec: EncodeSpec;
  state: QState;
  progress: ConvProgress | null;
  result: ConvResult | null;
  problem: ApplyProblem | null;
};
export type ConvQueue = {
  items: QItem[];
  /** ค่าที่ตั้งทีเดียวทั้งคิวครั้งล่าสุด · ไฟล์ที่เพิ่มใหม่ใช้ค่านี้ */
  all: EncodeSpec;
  /** โฟลเดอร์ที่เลือก · null = ข้างไฟล์เดิม */
  outDir: string | null;
  running: boolean;
  stopping: boolean;
};

const ALL_KEY = "ms.convAll";
/** ค่าตั้งต้นของคิว FLAC Level 5 ตัวต้นฉบับ (ไม่เสียคุณภาพ ไม่ว่าไฟล์ต้นทางเป็นอะไร) · แคลร์ตั้ง */
const DEFAULT_SPEC: EncodeSpec = { codec: "flac", encoder: "native", channels: null, bits: null, rate: null, gain: 0, loudnorm: false, speed: null, p: { level: 5, threads: 4, verify: "On", block: "Auto" } };
function loadAll(): EncodeSpec {
  try { const v = JSON.parse(localStorage.getItem(ALL_KEY) ?? "null"); if (v && typeof v.codec === "string") return v; } catch { /* ใช้ค่าตั้งต้น */ }
  return DEFAULT_SPEC;
}

let q: ConvQueue = { items: [], all: loadAll(), outDir: null, running: false, stopping: false };
const subs = new Set<() => void>();
let seq = 0;

function set(patch: Partial<ConvQueue>) {
  q = { ...q, ...patch };
  subs.forEach((f) => f());
}
function patchItem(id: string, patch: Partial<QItem>) {
  set({ items: q.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
}
export function getConvQueue() {
  return q;
}
export function useConvQueue() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => q);
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** เพิ่มไฟล์เข้าคิว · ไฟล์ที่อยู่ในคิวแล้วและยังไม่เสร็จ ไม่เพิ่มซ้ำ · คืนจำนวนที่ข้าม */
export function addFiles(paths: string[]): number {
  let skipped = 0;
  const add: QItem[] = [];
  for (const p of paths) {
    if (q.items.some((x) => same(x.path, p) && x.state !== "done") || add.some((x) => same(x.path, p))) { skipped++; continue; }
    add.push({ id: `q${++seq}`, path: p, file: null, bad: null, spec: q.all, state: "wait", progress: null, result: null, problem: null });
  }
  if (!add.length) return skipped;
  set({ items: [...q.items, ...add] });
  for (const it of add) {
    convertApi.probe(it.path).then((f) => {
      patchItem(it.id, { file: f, thumb: f.cover ? undefined : null });
      if (f.cover) convertApi.cover(it.path).then((c) => patchItem(it.id, { thumb: c?.url ?? null }), () => patchItem(it.id, { thumb: null }));
    }, (e) => patchItem(it.id, { bad: String(e), state: "fail" }));
  }
  return skipped;
}

/** ตั้งทีเดียวทั้งคิว · ใช้กับทุกไฟล์ที่ยังไม่เริ่ม (รอคิว ไม่สำเร็จ หยุดแล้ว) และไฟล์ที่เพิ่มต่อจากนี้ */
export function setAll(spec: EncodeSpec) {
  try { localStorage.setItem(ALL_KEY, JSON.stringify(spec)); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ }
  set({ all: spec, items: q.items.map((x) => (x.state === "work" || x.state === "done" ? x : { ...x, spec })) });
}
export function setItemSpec(id: string, spec: EncodeSpec) {
  const it = q.items.find((x) => x.id === id);
  if (!it || it.state === "work") return;
  patchItem(id, { spec, ...(it.state === "done" ? {} : { state: it.bad ? "fail" : "wait", problem: null }) });
}
export function setOutDir(dir: string | null) {
  set({ outDir: dir });
}
export function removeItem(id: string) {
  set({ items: q.items.filter((x) => x.id !== id || x.state === "work") });
}
export function clearDone() {
  set({ items: q.items.filter((x) => x.state !== "done") });
}
/** ลองไฟล์ที่ไม่สำเร็จหรือหยุดไว้ใหม่ (ไฟล์ที่อ่านไม่ได้ลองไม่ได้) */
export function retry(id: string) {
  const it = q.items.find((x) => x.id === id);
  if (it && !it.bad && (it.state === "fail" || it.state === "stop")) patchItem(id, { state: "wait", problem: null, progress: null });
}

/** เริ่มแปลงไฟล์ที่รอคิวทีละไฟล์ตามลำดับ · ไฟล์ที่ยังอ่านข้อมูลไม่เสร็จรอให้อ่านเสร็จก่อน */
export async function startQueue() {
  if (q.running) return;
  set({ running: true, stopping: false });
  try {
    for (;;) {
      if (q.stopping) break;
      const next = q.items.find((x) => x.state === "wait");
      if (!next) break;
      if (!next.file && !next.bad) { await new Promise((r) => setTimeout(r, 150)); continue; }
      if (next.bad) { patchItem(next.id, { state: "fail" }); continue; }
      patchItem(next.id, { state: "work", progress: { id: next.id, percent: 0, eta: null, phase: "กำลังเริ่ม" }, problem: null, result: null });
      try {
        const r = await convertApi.one({ id: next.id, path: next.path, spec: next.spec, outDir: q.outDir });
        patchItem(next.id, { state: "done", result: r, progress: null });
      } catch (e) {
        const p = (e && typeof e === "object" && "kind" in e ? e : { kind: "other", title: "แปลงไม่สำเร็จ", detail: [String(e)] }) as ApplyProblem;
        patchItem(next.id, { state: p.kind === "cancelled" ? "stop" : "fail", problem: p, progress: null });
        if (p.kind === "cancelled") break;
      }
    }
  } finally {
    set({ running: false, stopping: false });
  }
}

/** หยุดทั้งคิว · ไฟล์ที่กำลังทำหยุดแล้วลบไฟล์ทำค้าง ไฟล์ที่ยังไม่เริ่มรออยู่ในคิว */
export function stopQueue() {
  if (!q.running) return;
  set({ stopping: true });
  convertApi.cancel().catch(() => {});
}

if (inApp) {
  listen<ConvProgress>("convert-progress", (e) => {
    const it = q.items.find((x) => x.id === e.payload.id);
    if (it && it.state === "work") patchItem(it.id, { progress: e.payload });
  });
}
