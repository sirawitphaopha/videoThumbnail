/* ข้อมูลของหัวข้อบรรทัดโค้ดในหน้าตั้งค่า (BUGS ข้อ 160 · docs/PLAN-2026-11-27-นับบรรทัด.md)
   ตัวเลขมาจาก scripts/line-stats.mjs ที่ npm run dev กับ npm run build สั่งนับก่อนทุกครั้ง ผลอยู่ src/generated/lineStats.json (ไม่ขึ้น git)
   ไฟล์ยังไม่มี (โคลนใหม่ยังไม่ได้สั่งนับ) import.meta.glob คืนว่าง หน้าขึ้นวิธีสั่งนับแทน ไม่พัง */

/** [โค้ดจริง, คอมเมนต์, บรรทัดว่าง, จำนวนไฟล์] */
export type Cnt = [number, number, number, number];
export type GroupId = "ui" | "style" | "rust" | "langs" | "rtest" | "check" | "script" | "mock" | "doc";
export type Group = { id: GroupId; name: string; live: boolean };
/** หนึ่ง commit · vm 1 คือ commit ที่ขยับเลขรุ่น */
export type Point = { h: string; d: string; s: string; v: string | null; vm: 0 | 1; n: Partial<Record<GroupId, Cnt>> };
export type LineStats = { ok: boolean; why?: string; generated?: string; groups: Group[]; points: Point[]; now?: { d: string; v: string | null; n: Partial<Record<GroupId, Cnt>> } };

const files = import.meta.glob<LineStats>("../../../generated/lineStats.json", { eager: true, import: "default" });
export const STATS: LineStats | null = Object.values(files)[0] ?? null;

/** สีของแต่ละกลุ่ม ชุดสีแปดสีที่ผ่านตัวตรวจสีของสกิลกราฟ (แยกได้ทั้งตาปกติและตาบอดสี) เรียงตามลำดับกลุ่มตายตัว
    ข้อมูลภาษาเป็นกลุ่มเล็กใช้สีเทากลาง ไม่สร้างสีที่เก้าเอง · สีเขียนในโค้ด ไม่อยู่ไฟล์สไตล์ ตัวแปลงโทนจะได้ไม่เปลี่ยนสี
    พื้นมืด (โทนกลางคืน) ใช้ชุดที่ปรับความสว่างให้พื้นมืด */
const LIGHT: Record<GroupId, string> = { ui: "#257de0", style: "#f47230", rust: "#00b894", langs: "#9a9a9a", rtest: "#f2a600", check: "#ee7fac", script: "#008a17", mock: "#6a4ce2", doc: "#ec4647" };
const DARK: Record<GroupId, string> = { ui: "#338ced", style: "#e76624", rust: "#00a888", langs: "#8c8c8c", rtest: "#d28e05", check: "#e24d8b", script: "#0aac23", mock: "#9887ef", doc: "#eb6263" };
/** ชนิดบรรทัด โค้ดจริง คอมเมนต์ บรรทัดว่าง */
const KIND_LIGHT = ["#257de0", "#f2a600", "#b5b5b5"], KIND_DARK = ["#338ced", "#d28e05", "#6e6e6e"];

/** พื้นของหน้าเป็นสีมืดไหม ดูจากสีพื้นของหน้าต่างที่โทนตั้งไว้ */
export function darkBg(): boolean {
  const c = getComputedStyle(document.documentElement).getPropertyValue("--win").trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 110;
}
export const groupColor = (id: GroupId, dark: boolean) => (dark ? DARK : LIGHT)[id];
export const kindColor = (k: 0 | 1 | 2, dark: boolean) => (dark ? KIND_DARK : KIND_LIGHT)[k];
export const KIND_NAMES = ["โค้ดจริง", "คอมเมนต์", "บรรทัดว่าง"] as const;
/** 0.10.1-3 เก็บแบบ semver แสดงเป็น 0.10.1.3 แบบเดียวกับป้ายรุ่นใต้เมนู (Sidebar.tsx shownVersion) */
export const shownVer = (v: string | null) => (v ? v.replace("-", ".") : "");
