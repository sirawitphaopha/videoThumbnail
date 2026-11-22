/* หน้าแก้ซับ ส่วนประกอบของตัวแก้ซับ · ชื่อไฟล์ ชนิดไฟล์ ช่วงเผื่อเล่นเสียง ชุดอักขระ ข้อความของที่หายตอนเปลี่ยนชนิด คำอธิบายรหัสอักขระ ชนิดสถานะบันทึก props
   แยกจาก SubEditor.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { type SubDoc, type SubLost } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";

export const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
export const KIND_EXT: Record<SubDoc["kind"], string> = { ass: "ass", ssa: "ssa", srt: "srt", vtt: "vtt" };
/** เผื่อหน้า เผื่อท้าย ms (Audio/Lead/IN OUT ของ Aegisub) */
export const LEAD_IN = 100, LEAD_OUT = 350;
export const CHARSETS = ["UTF-8", "TIS-620", "Windows-1252", "UTF-16LE", "UTF-16BE"] as const;
/** สิ่งที่หายตอนบันทึกเป็น SRT เป็นประโยค (subdoc.rs to_srt ส่งคีย์มา) */
export const LOST: Record<string, string> = {
  comment: "บรรทัดความคิดเห็น", actor: "ชื่อตัวละคร", layer: "ลำดับชั้น (เลเยอร์)", style: "สไตล์ของแต่ละบรรทัด ซับ SRT ทุกบรรทัดใช้หน้าตาตั้งต้นของโปรแกรมเล่น",
  effect: "เอฟเฟกต์", margin: "ระยะขอบของแต่ละบรรทัด", tags: "แท็กฟอนต์ ขนาด สี ตำแหน่ง และแท็กอื่นที่ไม่ใช่ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า", fonts: "ฟอนต์หรือรูปที่ฝังไว้ในไฟล์ ASS", settings: "ค่าตั้งตำแหน่งของ VTT",
};
export const ENC_TIP = {
  w: "รหัสที่ใช้เก็บตัวอักษรในไฟล์ โปรแกรมเดาให้ตอนเปิด และบันทึกกลับด้วยรหัสเดิม ถ้าภาษาไทยขึ้นเป็นตัวแปลก ๆ ให้เปิดด้วยรหัสอื่น",
  o: [
    ["UTF-8", "รหัสสากล เก็บได้ทุกภาษา", "โปรแกรมเล่นทุกตัวอ่านได้", "ไฟล์ไทยใหญ่กว่า TIS-620 ราวสามเท่า"] as [string, string, string, string],
    ["TIS-620", "รหัสไทยแบบเก่า ซับไทยเก่า ๆ ใช้กันเยอะ", "ไฟล์เล็ก", "เก็บได้แค่ไทยกับอังกฤษ ตัวอื่นต้องบันทึกเป็น UTF-8"] as [string, string, string, string],
    ["Windows-1252", "รหัสภาษายุโรปแบบเก่า", "ซับฝรั่งเศส เยอรมัน สเปนเก่าอ่านถูก", "เก็บภาษาไทยไม่ได้"] as [string, string, string, string],
    ["UTF-16", "รหัสสากลอีกแบบ ตัวละสองไบต์", "เก็บได้ทุกภาษา", "โปรแกรมเล่นบางตัวอ่านไม่ได้"] as [string, string, string, string],
  ],
  r: "เปิดแล้วอ่านออกถูกต้องอยู่แล้ว ไม่ต้องเปลี่ยน",
};

export type Save = { s: "idle" } | { s: "saving" } | { s: "done"; note: string | null } | { s: "failed"; err: string };
export type Ask =
  | { k: "changed" }
  | { k: "inexact" }
  | { k: "saveas"; to: SubDoc["kind"]; lost: SubLost[] | null; path: string }
  | { k: "exists"; path: string; to: SubDoc["kind"] };

export type SubEditorProps = {
  track: AvTrack;
  /** ชื่อที่แสดงและใช้ตั้งชื่อฉบับบันทึกอัตโนมัติ */
  label: string;
  /** ไฟล์หนังที่ซับนี้อยู่ข้างใน (ซับในหนัง) */
  moviePath: string;
  /** หนังที่ใช้ดูภาพกับฟังเสียง · ว่าง = ยังไม่มีวิดีโอ */
  video: string;
  refStream: number | null;
  refIdx: number | null;
  fps: number | null;
  /** ขนาดภาพของหนัง ใช้เป็นขนาดภาพของซับตอนเปลี่ยน SRT เป็น ASS */
  playRes: [number, number] | null;
  tab: "aeg" | "long" | "pad";
  onAddMovie?: () => void;
  /** ใส่ซับกลับเข้าหนังแล้วไฟล์หนังได้ชื่อใหม่ (หนัง MP4 กับซับ ASS ได้ไฟล์ .mkv) หน้าซับไตเติลชี้ไฟล์ใหม่ (ผู้ช่วยตรวจทาน F9) */
  onMovieMoved?: (from: string, to: string) => void;
  /** ปุ่มตั้งค่าในแถบปุ่มย่อ พาไปหน้าตั้งค่าหัวข้อเสียงและซับ (app/options ของ Aegisub · BUGS ข้อ 113) */
  onSettings?: () => void;
};