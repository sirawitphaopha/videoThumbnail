/* สไตล์ของซับ ASS SSA (แผนหน้าแก้ซับ ขั้น 7 · BUGS ข้อ 109)
   แปลจากซอร์ส Aegisub ass_style.cpp (ค่าตั้งต้น UpdateData) dialog_style_editor.cpp (StyleRenamer) dialog_style_manager.cpp (unique_name)
   สไตล์ในเอกสารเก็บเป็นช่องข้อความตามบรรทัด Format ของไฟล์ · อ่านเป็นค่าตามชื่อช่อง แก้แล้วเขียนกลับเฉพาะช่องที่ค่าเปลี่ยน
   ช่องที่ค่าเท่าเดิมเก็บข้อความเดิมทุกตัวอักษร บรรทัดสไตล์ที่ไม่ได้แก้จึงเขียนกลับเหมือนเดิมทุกไบต์ (subdoc.rs เทียบช่องกับบรรทัดเดิม) */
import type { SubDoc, SubStyle } from "./api";

export type Rgba = { r: number; g: number; b: number; a: number };
export type StyleV = {
  name: string; font: string; size: number;
  primary: Rgba; secondary: Rgba; outline: Rgba; shadow: Rgba;
  bold: boolean; italic: boolean; underline: boolean; strike: boolean;
  scaleX: number; scaleY: number; spacing: number; angle: number;
  border: number; outlineW: number; shadowW: number; align: number;
  mL: number; mR: number; mV: number; enc: number;
};
type Key = keyof StyleV;
/** ชื่อช่องในบรรทัด Format (ตัวพิมพ์เล็ก) กับค่าในโปรแกรม · SSA ใช้ TertiaryColour แทน OutlineColour */
const COL: Record<string, Key> = {
  name: "name", fontname: "font", fontsize: "size", primarycolour: "primary", secondarycolour: "secondary", outlinecolour: "outline", tertiarycolour: "outline",
  backcolour: "shadow", bold: "bold", italic: "italic", underline: "underline", strikeout: "strike", scalex: "scaleX", scaley: "scaleY", spacing: "spacing",
  angle: "angle", borderstyle: "border", outline: "outlineW", shadow: "shadowW", alignment: "align", marginl: "mL", marginr: "mR", marginv: "mV", encoding: "enc",
};
const COLORS: Key[] = ["primary", "secondary", "outline", "shadow"];
const BOOLS: Key[] = ["bold", "italic", "underline", "strike"];
const TEXTS: Key[] = ["name", "font"];
const INTS: Key[] = ["border", "align", "mL", "mR", "mV", "enc"];

/** ค่าตั้งต้นของสไตล์ใหม่ (AssStyle ของ Aegisub) */
export const STYLE_DEFAULT: StyleV = {
  name: "Default", font: "Arial", size: 48,
  primary: { r: 255, g: 255, b: 255, a: 0 }, secondary: { r: 255, g: 0, b: 0, a: 0 }, outline: { r: 0, g: 0, b: 0, a: 0 }, shadow: { r: 0, g: 0, b: 0, a: 0 },
  bold: false, italic: false, underline: false, strike: false, scaleX: 100, scaleY: 100, spacing: 0, angle: 0,
  border: 1, outlineW: 2, shadowW: 2, align: 2, mL: 10, mR: 10, mV: 10, enc: 1,
};

/** สีของ ASS · &HAABBGGRR หรือ &HBBGGRR หรือเลขฐานสิบ (SSA) · อ่านไม่ออกได้ดำทึบ (agi::Color) */
export function parseColor(s: string): Rgba {
  const t = s.trim();
  let n: number;
  const hex = /^&?H([0-9a-fA-F]+)&?$/i.exec(t);
  if (hex) n = parseInt(hex[1].slice(-8), 16);
  else if (/^-?\d+$/.test(t)) n = parseInt(t, 10) >>> 0;
  else return { r: 0, g: 0, b: 0, a: 0 };
  return { r: n & 255, g: (n >>> 8) & 255, b: (n >>> 16) & 255, a: (n >>> 24) & 255 };
}
const h2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
/** แบบที่ Aegisub เขียนในบรรทัดสไตล์ (GetAssStyleFormatted) */
export const fmtColor = (c: Rgba) => `&H${h2(c.a)}${h2(c.b)}${h2(c.g)}${h2(c.r)}`;
/** ตัวเลขแบบ %g ของ C (ทศนิยมไม่เกิน 6 หลักสำคัญ ไม่มีศูนย์ท้าย) */
export const fmtG = (v: number) => { const x = Number(v.toPrecision(6)); return Object.is(x, -0) ? "0" : String(x); };
const num = (s: string) => { const v = parseFloat(s); return Number.isFinite(v) ? v : 0; };

function parseField(k: Key, s: string): StyleV[Key] {
  if (TEXTS.includes(k)) return s;
  if (COLORS.includes(k)) return parseColor(s);
  if (BOOLS.includes(k)) return num(s) !== 0;
  if (INTS.includes(k)) return Math.trunc(num(s));
  return num(s);
}
function fmtField(k: Key, v: StyleV[Key]): string {
  if (TEXTS.includes(k)) return String(v).replace(/,/g, ";");
  if (COLORS.includes(k)) return fmtColor(v as Rgba);
  if (BOOLS.includes(k)) return v ? "-1" : "0";
  if (INTS.includes(k)) return String(Math.trunc(v as number));
  return fmtG(v as number);
}
const same = (a: StyleV[Key], b: StyleV[Key]) => (typeof a === "object" ? JSON.stringify(a) === JSON.stringify(b) : a === b);

/** ช่องที่ไฟล์นี้มี (ตามบรรทัด Format) · SSA ไม่มีขีดเส้นใต้ ขีดฆ่า ย่อขยาย ระยะตัวอักษร หมุน */
export const styleKeys = (d: SubDoc): Key[] => d.styleFormat.map((f) => COL[f.toLowerCase()]).filter((k): k is Key => !!k);

/** อ่านสไตล์เป็นค่า · ช่องที่ไฟล์ไม่มีใช้ค่าตั้งต้น */
export function readStyle(d: SubDoc, s: SubStyle): StyleV {
  const v: StyleV = { ...STYLE_DEFAULT };
  d.styleFormat.forEach((f, i) => { const k = COL[f.toLowerCase()]; if (k) (v as Record<Key, unknown>)[k] = parseField(k, s.fields[i] ?? ""); });
  return v;
}

/** เขียนค่ากลับเป็นช่อง · ช่องที่ค่าเท่าเดิมใช้ข้อความเดิม ไม่จัดรูปใหม่ */
export function writeStyle(d: SubDoc, v: StyleV, old?: SubStyle): string[] {
  return d.styleFormat.map((f, i) => {
    const k = COL[f.toLowerCase()];
    const prev = old?.fields[i];
    if (!k) return prev ?? "0";
    if (prev != null && same(parseField(k, prev), v[k])) return prev;
    return fmtField(k, v[k]);
  });
}

function nextId(d: SubDoc) {
  let n = 0;
  for (const e of d.events) n = Math.max(n, e.id);
  for (const s of d.styles) n = Math.max(n, s.id);
  return n + 1;
}
export const styleName = (s: SubStyle) => s.fields[0] ?? "";
/** ชื่อซ้ำไม่สนตัวพิมพ์ (AssFile::GetStyle) */
export const findStyle = (d: SubDoc, name: string) => d.styles.find((s) => styleName(s).toLowerCase() === name.toLowerCase()) ?? null;
/** ชื่อไม่ซ้ำสำหรับสำเนา "ชื่อ - สำเนา" แล้ว "ชื่อ - สำเนา (2)" (unique_name ของ Aegisub) */
export function uniqueName(d: SubDoc, name: string) {
  if (!findStyle(d, name)) return name;
  let n = `${name} - สำเนา`;
  for (let i = 2; findStyle(d, n); i++) n = `${name} - สำเนา (${i})`;
  return n;
}
/** สไตล์ใหม่ต่อท้าย */
export function addStyle(d: SubDoc, v: StyleV): { doc: SubDoc; id: number } {
  const id = nextId(d);
  return { doc: { ...d, styles: [...d.styles, { id, fields: writeStyle(d, v), pre: [], raw: [] }] }, id };
}
export function setStyle(d: SubDoc, id: number, v: StyleV): SubDoc {
  return { ...d, styles: d.styles.map((s) => (s.id === id ? { ...s, fields: writeStyle(d, v, s) } : s)) };
}

/** แท็ก \r<ชื่อสไตล์> ในข้อความ (StyleRenamer ดูแท็ก \r ที่เป็นชื่อ) */
const rTag = /\\r([^\\}]*)/g;
/** บรรทัดที่ใช้สไตล์นี้ ทั้งช่องสไตล์และแท็ก \r */
export function styleUses(d: SubDoc, name: string) {
  let n = 0;
  for (const e of d.events) if (e.style === name || [...e.text.matchAll(/\{[^}]*\}/g)].some((m) => [...m[0].matchAll(rTag)].some((r) => r[1] === name))) n++;
  return n;
}
/** เปลี่ยนชื่อสไตล์ในบรรทัดทั้งหมด (StyleRenamer::Replace) */
export function renameUses(d: SubDoc, from: string, to: string): SubDoc {
  return { ...d, events: d.events.map((e) => {
    const text = e.text.replace(/\{[^}]*\}/g, (b) => b.replace(rTag, (m, nm: string) => (nm === from ? `\\r${to}` : m)));
    return e.style === from || text !== e.text ? { ...e, style: e.style === from ? to : e.style, text } : e;
  }) };
}
export function deleteStyles(d: SubDoc, ids: Set<number>): SubDoc {
  return { ...d, styles: d.styles.filter((s) => !ids.has(s.id)) };
}
export function moveStyle(d: SubDoc, id: number, to: number): SubDoc {
  const i = d.styles.findIndex((s) => s.id === id);
  if (i < 0) return d;
  const st = d.styles.slice();
  const [x] = st.splice(i, 1);
  st.splice(Math.max(0, Math.min(st.length, to)), 0, x);
  return { ...d, styles: st };
}
/** เรียงตามชื่อ ไม่สนตัวพิมพ์ (OnCurrentSort) */
export function sortStyles(d: SubDoc): SubDoc {
  return { ...d, styles: d.styles.slice().sort((a, b) => styleName(a).toLowerCase().localeCompare(styleName(b).toLowerCase())) };
}

/* ---------------------------------------------------------------- [Script Info]
   ขนาดภาพของซับ PlayResX PlayResY อยู่ในส่วนนี้ · แก้ทีละแถว ส่วนอื่นเหมือนเดิมทุกไบต์ */
const INFO = "[script info]";
const isHead = (t: string) => /^\s*\[.*\]\s*$/.test(t);
export function infoGet(d: SubDoc, key: string): string | null {
  const sk = d.skeleton;
  const h = sk.findIndex((x) => x.k === "line" && x.t.trim().toLowerCase() === INFO);
  if (h < 0) return null;
  for (let i = h + 1; i < sk.length; i++) {
    const x = sk[i];
    if (x.k !== "line" || isHead(x.t)) break;
    const m = /^([^:;]+):\s?(.*)$/.exec(x.t);
    if (m && m[1].trim().toLowerCase() === key.toLowerCase()) return m[2].trim();
  }
  return null;
}
export function infoSet(d: SubDoc, key: string, value: string): SubDoc {
  const sk = d.skeleton.slice();
  const eol = d.eol || "\r\n";
  const h = sk.findIndex((x) => x.k === "line" && x.t.trim().toLowerCase() === INFO);
  if (h < 0) return d;
  let end = h + 1, lastText = h;
  while (end < sk.length) { const x = sk[end]; if (x.k !== "line" || isHead(x.t)) break; if (x.t.trim()) lastText = end; end++; }
  for (let i = h + 1; i < end; i++) {
    const x = sk[i];
    const m = x.k === "line" ? /^([^:;]+):/.exec(x.t) : null;
    if (m && m[1].trim().toLowerCase() === key.toLowerCase()) {
      if (x.k === "line") sk[i] = { k: "line", t: `${m[1]}: ${value}`, e: x.e };
      return { ...d, skeleton: sk };
    }
  }
  const prev = sk[lastText];
  sk.splice(lastText + 1, 0, { k: "line", t: `${key}: ${value}`, e: prev.k === "line" && prev.e ? prev.e : eol });
  return { ...d, skeleton: sk };
}
/** ขนาดภาพของซับ ไม่มีใช้กติกาเดียวกับ Aegisub (AssFile::GetResolution) */
export function playRes(d: SubDoc): [number, number] {
  let w = parseInt(infoGet(d, "PlayResX") ?? "", 10) || 0, h = parseInt(infoGet(d, "PlayResY") ?? "", 10) || 0;
  if (!w && !h) { w = 384; h = 288; } else if (!w) w = h === 1024 ? 1280 : Math.trunc((h * 4) / 3); else if (!h) h = w === 1280 ? 1024 : Math.trunc((w * 3) / 4);
  return [w, h];
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ (check-subtools.mjs)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subStyleLib = { parseColor, fmtColor, fmtG, readStyle, writeStyle, styleUses, renameUses, uniqueName, playRes, infoGet, infoSet };
