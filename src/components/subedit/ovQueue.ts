/* คิววาดซับจริงบนภาพนิ่งด้วย libass ทีละภาพ เก็บภาพที่วาดแล้วตามเอกสาร เวลา และขนาด
   แยกจาก SubVideo.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { type SubDoc } from "../../lib/api";

/* ---------------------------------------------------------------- ซับจริงบนภาพนิ่ง (libass ผ่าน subshot.rs) */

export const docIds = new WeakMap<SubDoc, number>();
export let docSeq = 0;
export const docId = (d: SubDoc) => { let v = docIds.get(d); if (v == null) { v = ++docSeq; docIds.set(d, v); } return v; };
/** ภาพซับที่วาดแล้ว ตามเอกสาร เวลา ขนาด · เดินเฟรมกลับไปมาขึ้นทันที */
export const ovCache = new Map<string, string>();
export type OvReq = { key: string; run: () => Promise<string>; ok: (u: string) => void; bad: (e: unknown) => void };
export let ovBusy = false;
export let ovNext: OvReq | null = null;
/** วาดทีละภาพ ระหว่างวาดมีคำขอใหม่ เก็บไว้แค่คำขอล่าสุด (ลากซับแล้วไม่สั่ง ffmpeg ซ้อนกันเป็นสิบตัว) · คำขอที่ถูกข้ามตอบ "skip" */
export function ovQueue(key: string, run: () => Promise<string>): Promise<string> {
  return new Promise((ok, bad) => {
    ovNext?.bad("skip");
    ovNext = { key, run, ok, bad };
    ovPump();
  });
}
export function ovPump() {
  if (ovBusy || !ovNext) return;
  const r = ovNext;
  ovNext = null;
  ovBusy = true;
  r.run().then((u) => {
    ovCache.set(r.key, u);
    if (ovCache.size > 40) ovCache.delete(ovCache.keys().next().value!);
    r.ok(u);
  }, r.bad).finally(() => { ovBusy = false; ovPump(); });
}
