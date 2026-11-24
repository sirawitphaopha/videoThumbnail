/* ของระดับไฟล์ของหน้าซับไตเติล นามสกุลหนัง ชื่อไฟล์ ชนิดของไฟล์ที่เปิด ระบบที่วางไว้ ข้อมูลภาพกับเสียงอ้างอิง
   แยกจาก SubtitlePage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { type ExtractItem, type MergeTrack } from "../../lib/api/index";
import { trackFrom, type AvTrack } from "../../lib/avJob";

export const MOVIE_EXT = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
export const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** path ไฟล์ที่ใส่ · movie ใส่ไฟล์หนัง · video ไฟล์วิดีโอที่เพิ่มคู่กับไฟล์ซับ (ข้อ 107) · ref แทร็กเสียงที่ใช้วาดคลื่น · items ชิ้นที่ Export ได้ เรียงตามซับ (ข้อ 108) */
export type Vid = { fps: number | null; res: [number, number] | null };
export type Loaded = { path: string; movie: boolean; subs: AvTrack[]; video: string | null; ref: AvTrack | null; refIdx: number | null; items: (ExtractItem | null)[] | null; vid: Vid | null };
/** pair ไฟล์ที่สองของชิ้นเดียวกัน ซับ VobSub ได้ .idx กับ .sub · detail ข้อความจากเครื่องมือตอนไม่สำเร็จ (BUGS ข้อ 150) */
export type Exp = { key: string; label: string; item: ExtractItem } & ({ s: "busy" } | { s: "done"; file: string; pair?: string | null } | { s: "conflict"; file: string } | { s: "failed"; err: string; detail?: string | null });

export const PLANNED = [
  "ลากเวลาบนคลื่นเสียง ฟังเสียงเป็นช่วง และเส้นแบ่งฉากแบบ Aegisub",
  "เลื่อนเวลาทั้งไฟล์ ปรับเวลาทั้งไฟล์ และเครื่องมือของซับ ASS",
  "ใส่ซับที่แก้กลับเข้าไฟล์หนังจากหน้านี้ได้โดยไม่ต้องไปหน้าเสียงและซับ",
  "ซับรูป PGS กับ VobSub แปลงเป็นข้อความด้วยการอ่านจากภาพ",
];

/** อัตราเฟรมกับขนาดภาพของวิดีโอแทร็กแรก */
export function vidOf(tracks: MergeTrack[]): Vid | null {
  const v = tracks.find((t) => t.kind === "video");
  return v ? { fps: v.fps, res: v.width && v.height ? [v.width, v.height] : null } : null;
}


/** แทร็กเสียงที่ใช้วาดคลื่น · เสียงหลักก่อน ไม่มีใช้เสียงแรก · ลำดับในเสียงด้วยกันใช้กับภาพความถี่ */
export function refOf(tracks: MergeTrack[]) {
  const auds = tracks.filter((t) => t.kind === "audio");
  const a = auds.find((t) => t.default) ?? auds[0] ?? null;
  return { ref: a ? trackFrom(a) : null, refIdx: a ? auds.indexOf(a) : null };
}
