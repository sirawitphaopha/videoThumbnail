/* งานใส่โปสเตอร์ที่กำลังทำ เก็บระดับโปรแกรม ไม่ผูกกับหน้า
   เดิมเก็บในหน้าใส่โปสเตอร์ เปลี่ยนหน้าระหว่างครอบแล้วกลับมา หน้าว่าง ไม่มีปุ่มหยุด งานจบแล้วผลไม่ขึ้นที่ไหน (ผู้ช่วยตรวจโค้ดเจอ)
   ไม่ซ่อนหน้าค้างไว้แทน เพราะหน้านี้ฟังการลากไฟล์ทั้งหน้าต่าง ซ่อนไว้แล้วไฟล์ที่ลากในหน้าอื่นจะหลุดมาเข้าหน้านี้
   ความคืบหน้าฟังที่นี่ที่เดียว เปลี่ยนหน้าแล้วยังรับต่อ */
import { useSyncExternalStore } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, type ApplyProblem, type ApplyResult, type MovieInfo, type PosterInfo, type PosterProgress } from "./api";

export type Run =
  | { state: "idle" }
  | { state: "working"; progress: PosterProgress | null }
  | { state: "done"; result: ApplyResult }
  | { state: "failed"; problem: ApplyProblem };

export type PosterJob = {
  run: Run;
  /** ไฟล์หนังของงานนี้ · กลับมาหน้านี้แล้วใส่กลับให้ (ครอบเสร็จแล้วเป็น null เพราะไฟล์เดิมย้ายไปแล้ว) */
  path: string | null;
  movie: MovieInfo | null;
  /** โหมดตอนกดเริ่ม · ตัวเลือกครั้งนี้หายเมื่อเปลี่ยนหน้า ปุ่มหยุดกับข้อความยืนยันหยุดต้องใช้โหมดจริงของงาน */
  mode: "cover" | "wrap" | "mp4";
  /** รูปโปสเตอร์ที่งานนี้ใช้ (ข้อมูลรูปกับแบบที่เลือกจากหน้าต่างครอป) · กลับมาหน้านี้แล้วการ์ดรูปไม่ว่าง (เดิมว่าง เจอตอนตรวจภาพ) */
  poster: PosterInfo | null;
  choice: unknown;
  /** ชื่อไฟล์ใหม่ที่พิมพ์ไว้ · กลับมาหน้านี้ระหว่างครอบแล้วช่องชื่อตรงกับงานที่ทำอยู่ */
  name: string | null;
};

let job: PosterJob = { run: { state: "idle" }, path: null, movie: null, mode: "wrap", poster: null, choice: null, name: null };
const subs = new Set<() => void>();

export function setPosterJob(patch: Partial<PosterJob>) {
  job = { ...job, ...patch };
  subs.forEach((f) => f());
}
export function getPosterJob() {
  return job;
}
export function usePosterJob() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => job);
}

if (inApp) {
  listen<PosterProgress>("poster-progress", (e) => {
    if (job.run.state === "working") setPosterJob({ run: { state: "working", progress: e.payload } });
  });
}
