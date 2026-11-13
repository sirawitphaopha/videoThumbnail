/* ตัวช่วยข้อความซับของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3) · เวลาเป็นมิลลิวินาที
   ASS ขึ้นบรรทัดด้วย \N เก็บในไฟล์ ช่องพิมพ์แสดงเป็นบรรทัดจริง · SRT VTT ขึ้นบรรทัดจริงทั้งในไฟล์และในช่อง */
import type { SubDoc, SubEvent } from "./api";

export const isAss = (d: SubDoc | null | undefined) => d?.kind === "ass" || d?.kind === "ssa";

/** เวลาแบบที่ไฟล์ใช้ · ASS h:mm:ss.cc · SRT VTT hh:mm:ss,mmm (VTT ใช้จุด) */
export function fmtTime(ms: number, kind: SubDoc["kind"]) {
  const ass = kind === "ass" || kind === "ssa";
  const raw = Math.max(0, Math.round(ms));
  // ASS ปัดเซนติวินาทีแบบเดียวกับตัวเขียนฝั่ง Rust (ass_time) เวลาในจอกับในไฟล์จึงตรงกัน
  const t = ass ? raw + 5 - ((raw + 5) % 10) : raw;
  const h = Math.floor(t / 3_600_000), m = Math.floor(t / 60_000) % 60, s = Math.floor(t / 1000) % 60;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  if (ass) return `${h}:${p(m)}:${p(s)}.${p((t % 1000) / 10)}`;
  return `${p(h)}:${p(m)}:${p(s)}${kind === "vtt" ? "." : ","}${p(t % 1000, 3)}`;
}

/** เวลาที่พิมพ์ · รับ h:mm:ss.cc hh:mm:ss,mmm m:ss.s หรือวินาทีล้วน · อ่านไม่ออก = null */
export function parseTime(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 1000);
  const m = t.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) return null;
  const v = (parseInt(m[1] ?? "0", 10) * 3600 + parseInt(m[2], 10) * 60 + parseFloat(m[3])) * 1000;
  return Number.isFinite(v) ? Math.round(v) : null;
}

/** ASS ปัดเป็นเซนติวินาทีแบบที่ไฟล์เก็บ (ms + 5 ปัดลง) ไม่ให้เวลาในจอกับในไฟล์ต่างกัน */
export function snapMs(ms: number, d: SubDoc) {
  const t = Math.max(0, Math.round(ms));
  return isAss(d) ? t + 5 - ((t + 5) % 10) : t;
}

/** ข้อความในไฟล์เป็นข้อความในช่องพิมพ์ */
export function toBox(text: string, d: SubDoc) {
  return isAss(d) ? text.replace(/\\N/g, "\n") : text;
}
/** ข้อความในช่องพิมพ์เป็นข้อความในไฟล์ */
export function fromBox(text: string, d: SubDoc) {
  return isAss(d) ? text.replace(/\r?\n/g, "\\N") : text.replace(/\r\n/g, "\n");
}

/** ตัวอักษรที่คนอ่าน ไม่นับแท็ก ตัวขึ้นบรรทัด และช่องว่าง (ใช้คิดตัวต่อวินาที) */
export function plain(text: string) {
  return text.replace(/\{[^}]*\}/g, "").replace(/<[^>]*>/g, "").replace(/\\[Nnh]/g, "").replace(/\s/g, "");
}
/** ตัวอักษรต่อวินาที · ระยะไม่ถึง 10 ms นับเป็น 10 ms */
export function cps(e: SubEvent) {
  return plain(e.text).length / (Math.max(10, e.end - e.start) / 1000);
}

/** แท็กในตาราง · full แสดงเต็ม · sym ย่อเป็น ☀ แบบ Aegisub · hide ซ่อน · ขึ้นบรรทัดเป็น ↵ ให้แถวสูงเท่ากัน */
export type TagMode = "full" | "sym" | "hide";
export function gridText(text: string, d: SubDoc, mode: TagMode) {
  let t = text;
  if (isAss(d)) {
    if (mode === "sym") t = t.replace(/\{[^}]*\}/g, "☀");
    if (mode === "hide") t = t.replace(/\{[^}]*\}/g, "");
    t = t.replace(/\\[Nn]/g, " ↵ ").replace(/\\h/g, " ");
  } else {
    if (mode === "sym") t = t.replace(/<[^>]+>/g, "☀");
    if (mode === "hide") t = t.replace(/<[^>]+>/g, "");
    t = t.replace(/\r?\n/g, " ↵ ");
  }
  return t;
}

/** ห่อข้อความที่เลือกด้วยแท็กตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า · ไม่ได้เลือกใส่แท็กเปิดที่เคอร์เซอร์ */
export function wrapTag(text: string, a: number, b: number, tag: "b" | "i" | "u" | "s", d: SubDoc) {
  const [open, close] = isAss(d) ? [`{\\${tag}1}`, `{\\${tag}0}`] : [`<${tag}>`, `</${tag}>`];
  if (a === b) return { text: text.slice(0, a) + open + text.slice(a), a: a + open.length, b: a + open.length };
  return { text: text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b), a: a + open.length, b: b + open.length };
}

/** ใส่แท็กของ ASS ตรงเคอร์เซอร์ หรือห่อข้อความที่เลือก (ฟอนต์ ขนาด สี) · reset คือแท็กปิดท้ายข้อความที่เลือก */
export function insertAss(text: string, a: number, b: number, tag: string, reset?: string) {
  if (a === b || !reset) return { text: text.slice(0, a) + tag + text.slice(a), a: a + tag.length, b: b + tag.length };
  return { text: text.slice(0, a) + tag + text.slice(a, b) + reset + text.slice(b), a: a + tag.length, b: b + tag.length };
}

/** สีหน้าจอ #RRGGBB เป็นสีแท็ก ASS &HBBGGRR& */
export function cssToAss(hex: string) {
  const h = hex.replace("#", "").toUpperCase();
  return `&H${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`;
}
/** สีของ ASS (&HAABBGGRR หรือ &HBBGGRR&) เป็น #RRGGBB */
export function assToCss(v: string) {
  const h = v.replace(/[&H]/gi, "").padStart(6, "0").slice(-6);
  return `#${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toLowerCase();
}

/** ค่าของแท็กตัวสุดท้ายในข้อความก่อนตำแหน่ง · ไม่มี = null (ใช้หาสีและฟอนต์ที่ใช้อยู่ตรงเคอร์เซอร์) */
export function lastTag(text: string, upto: number, name: string) {
  const re = new RegExp(`\\\\${name}([^\\\\}]*)`, "g");
  let v: string | null = null;
  for (const m of text.slice(0, upto).matchAll(re)) v = m[1];
  return v;
}

/** ชื่อช่องของสไตล์ตามบรรทัด Format · หาตำแหน่งแบบไม่สนตัวพิมพ์ */
export function styleField(d: SubDoc, fields: string[], name: string) {
  const i = d.styleFormat.findIndex((f) => f.toLowerCase() === name.toLowerCase());
  return i >= 0 ? fields[i] ?? "" : "";
}
