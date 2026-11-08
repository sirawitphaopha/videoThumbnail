/* ระบบจับคู่รูปปก เก็บสถานะระดับโปรแกรม ไม่ผูกกับหน้า (แบบ lib/posterJob.ts)
   คู่ที่รอยืนยันอยู่ฝั่ง Rust (pending.json) ที่นี่เป็นสำเนาบนจอ · เมนูซ้าย ชั้นวาง และหน้าต่างกันปิดใช้ตัวเลขชุดเดียวกัน
   ภาพเล็กทำเบื้องหลังแล้วแจ้งทีละรูป (link-thumb) · ความคืบหน้าตอนยืนยันฟังที่นี่ที่เดียว เปลี่ยนหน้าแล้วยังรับต่อ */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, linkApi, type ConfirmResult, type LinkImage, type LinkPick, type LinkProgress, type LinkReplyData } from "./api";

export type LinkRun =
  | { state: "idle" }
  | { state: "working"; progress: LinkProgress | null }
  | { state: "done"; result: ConfirmResult }
  | { state: "failed"; error: string };

export type LinkView = "start" | "table" | "board";

export type LinkJob = {
  reply: LinkReplyData;
  images: LinkImage[];
  /** ภาพเล็กที่เพิ่งทำเสร็จ ตามที่อยู่รูป · แถวในตารางใช้ตัวนี้ก่อนของที่จำไว้ */
  thumbs: Record<string, string>;
  run: LinkRun;
  view: LinkView;
  /** แถวที่พาไปจากปุ่มบนชั้นวาง */
  focus: string | null;
};

const EMPTY: LinkReplyData = { rows: [], imageFolders: [], loose: [], scope: "nocover", waiting: 0 };
let job: LinkJob = { reply: EMPTY, images: [], thumbs: {}, run: { state: "idle" }, view: "start", focus: null };
const subs = new Set<() => void>();

export function setLinkJob(patch: Partial<LinkJob>) {
  job = { ...job, ...patch };
  subs.forEach((f) => f());
}
export function getLinkJob() {
  return job;
}
export function useLinkJob() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => job);
}
export function setReply(reply: LinkReplyData) {
  setLinkJob({ reply });
}
export function thumbOf(p: LinkPick | LinkImage | null | undefined): string | null {
  if (!p) return null;
  return job.thumbs[p.path] ?? p.thumb;
}
/** อ่านรายการรูปใหม่ · เริ่มทำภาพเล็กของรูปที่ยังไม่มีเอง */
export async function reloadImages() {
  setLinkJob({ images: await linkApi.images() });
}

/** ยืนยัน · งานอยู่ระดับโปรแกรม เปลี่ยนหน้าแล้วไม่หาย */
export async function runConfirm(which: string): Promise<ConfirmResult | null> {
  setLinkJob({ run: { state: "working", progress: null } });
  try {
    const result = await linkApi.confirm(which);
    setLinkJob({ reply: result.reply, run: { state: "done", result } });
    return result;
  } catch (e) {
    setLinkJob({ run: { state: "failed", error: String(e) } });
    return null;
  }
}

if (inApp) {
  linkApi.state().then(setReply).catch(() => {});
  listen<LinkImage>("link-thumb", (e) => {
    const m = e.payload;
    const images = job.images.map((i) => (i.path === m.path ? { ...i, ...m, used: i.used } : i));
    setLinkJob({ images, thumbs: m.thumb ? { ...job.thumbs, [m.path]: m.thumb } : job.thumbs });
  });
  listen<LinkProgress>("link-progress", (e) => {
    if (job.run.state === "working") setLinkJob({ run: { state: "working", progress: e.payload } });
  });
}
