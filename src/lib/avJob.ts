/* ทุกอย่างของหน้าเสียงและซับ เก็บระดับโปรแกรม ไม่ผูกกับหน้า (แบบ posterJob.ts)
   ไปหน้าอื่นแล้วกลับมา ไฟล์หนัง แทร็กที่เพิ่ม ค่าที่ตั้ง ปก งานที่กำลังรวม และผล ยังอยู่ครบ (แผนขั้น 2 *"ไปหน้าอื่นแล้วงานไม่หาย"*)
   ความคืบหน้าฟังที่นี่ที่เดียว เปลี่ยนหน้าแล้วยังรับต่อ */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, type AddedFile, type ApplyProblem, type Chapter, type CoverPreview, type FontFile, type FontHit, type MergeAttachment, type MergeMovie, type MergeResult, type MergeTrack, type PosterInfo, type PosterProgress } from "./api";
import type { CropChoice } from "../components/CropDialog";

/** แถวในตารางแทร็ก · key ไม่ซ้ำตลอดหน้า · base = ค่าตอนเปิดไฟล์ ใช้ดูว่าแก้อะไรไปแล้ว */
export type AvTrack = MergeTrack & {
  key: string;
  base: Pick<MergeTrack, "lang" | "name" | "default" | "delay" | "keep">;
  /** ไฟล์ที่เพิ่ม · ดีเลย์มาจากชื่อไฟล์ */
  delayFromName?: number | null;
  longerBy?: number | null;
  notes?: string[];
  /** ซับ ASS ที่เพิ่ม · ฟอนต์ที่ซับใช้กับไฟล์ที่หาเจอ (fonts.rs) */
  fonts?: FontHit[];
};

export type CoverSlot = {
  /** keep ใช้ของเดิม (หรือไม่มีปก) · remove เอาออก · new ใช้รูปใหม่ */
  mode: "keep" | "remove" | "new";
  old: { att: MergeAttachment; preview: CoverPreview | null } | null;
  neu: { info: PosterInfo; choice: CropChoice } | null;
};

export type AvRun =
  | { state: "idle" }
  | { state: "working"; progress: PosterProgress | null }
  | { state: "done"; result: MergeResult }
  | { state: "failed"; problem: ApplyProblem };

export type AvState = {
  movie: MergeMovie | null;
  tracks: AvTrack[];
  /** แถวที่เลือก ตั้งค่าในการ์ดล่างตาราง */
  sel: string | null;
  covers: { cover: CoverSlot; cover_land: CoverSlot };
  /** ค่าที่เปลี่ยนเฉพาะครั้งนี้ ไม่แตะค่าตั้งต้นในหน้าตั้งค่า (แบบหน้าใส่โปสเตอร์) */
  once: { output?: "mkv" | "mp4"; original?: "keep" | "trash" };
  run: AvRun;
  /** ไฟล์ของงานที่รวมอยู่ · ปุ่มหยุดกับข้อความยืนยันใช้ชื่อนี้ */
  runMovie: string | null;
  /** ไฟล์ฟอนต์ที่ลากมาเพิ่มเอง (ฟอนต์ที่ซับใช้แต่หาในเครื่องไม่เจอ) */
  fontExtra: FontFile[];
  /** ไฟล์ฟอนต์ที่ผู้ใช้เอาติ๊กออก ไม่ฝัง */
  fontOff: string[];
  /** วิธี รวมเข้าไฟล์หนัง จับคู่ไว้ หรือแยกออกจากหนัง · เก็บที่นี่ เปลี่ยนเมนูแล้วกลับมายังเป็นวิธีเดิม (BUGS ข้อ 9 กับ 35) */
  method: "merge" | "pair" | "extract";
  /** ชิ้นที่ติ๊กไว้จะแยก ชื่อแบบ audio:2 text:1 attachment:1 menu:1 (ชนิดกับลำดับในชนิดเดียวกันตาม MediaInfo) · เปิดหนังเรื่องใหม่แล้วล้าง */
  xPick: string[];
  /** แทร็กภาพที่เลือกแยกเป็นสตรีมล้วน (.h264 .h265) แทน .mkv ชื่อแบบ video:1 (BUGS ข้อ 35 ต่อ) · เปิดหนังเรื่องใหม่แล้วล้าง */
  xRaw: string[];
  /** บทที่แก้ในหน้าต่างดูและแก้บท · null = ไม่ได้แก้ บทเดิมติดไปตามเดิม (BUGS ข้อ 99) */
  chapters: Chapter[] | null;
};

const EMPTY_SLOT: CoverSlot = { mode: "keep", old: null, neu: null };
const START: AvState = { movie: null, tracks: [], sel: null, covers: { cover: EMPTY_SLOT, cover_land: EMPTY_SLOT }, once: {}, run: { state: "idle" }, runMovie: null, fontExtra: [], fontOff: [], method: "merge", xPick: [], xRaw: [], chapters: null };

let st: AvState = START;
const subs = new Set<() => void>();
let seq = 0;
export const nextKey = () => `t${++seq}`;

export function setAv(patch: Partial<AvState> | ((s: AvState) => Partial<AvState>)) {
  st = { ...st, ...(typeof patch === "function" ? patch(st) : patch) };
  subs.forEach((f) => f());
}
export function getAv() {
  return st;
}
export function resetAv(keepRun = false) {
  st = { ...START, run: keepRun ? st.run : { state: "idle" }, runMovie: keepRun ? st.runMovie : null };
  subs.forEach((f) => f());
}
export function useAv() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => st);
}

export function trackFrom(t: MergeTrack, extra: Partial<AvTrack> = {}): AvTrack {
  return { ...t, key: nextKey(), base: { lang: t.lang, name: t.name, default: t.default, delay: t.delay, keep: t.keep }, ...extra };
}
export function tracksOfAdded(f: AddedFile): AvTrack[] {
  return f.tracks.map((t) => trackFrom(t, { delayFromName: f.delayFromName, longerBy: f.longerBy, notes: f.notes, fonts: t.kind === "subtitle" && f.fonts?.length ? f.fonts : undefined }));
}

if (inApp) {
  listen<PosterProgress>("merge-progress", (e) => {
    if (st.run.state === "working") setAv({ run: { state: "working", progress: e.payload } });
  });
}
