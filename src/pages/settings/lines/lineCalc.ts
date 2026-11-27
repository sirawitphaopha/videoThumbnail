/* คำนวณของหัวข้อบรรทัดโค้ด ฟังก์ชันล้วน ไม่เกี่ยวหน้าจอ (BUGS ข้อ 160) */
import type { Cnt, GroupId, LineStats, Point } from "./lineData";

/** ตัวกรอง กลุ่มที่เลือกกับชนิดบรรทัดที่เลือก (โค้ดจริง คอมเมนต์ บรรทัดว่าง) */
export type Filter = { groups: GroupId[]; kinds: [boolean, boolean, boolean] };

/** บรรทัดของกลุ่มเดียว นับเฉพาะชนิดที่เลือก */
export const cntOf = (c: Cnt | undefined, f: Filter) => (c ? (f.kinds[0] ? c[0] : 0) + (f.kinds[1] ? c[1] : 0) + (f.kinds[2] ? c[2] : 0) : 0);
/** บรรทัดรวมของกลุ่มที่เลือก */
export const totalOf = (n: Point["n"], f: Filter) => f.groups.reduce((s, g) => s + cntOf(n[g], f), 0);
/** แยกสามชนิดของกลุ่มที่เลือก (ไม่สนชนิดที่ติ๊ก) */
export function kindsOf(n: Point["n"], groups: GroupId[]): [number, number, number] {
  const r: [number, number, number] = [0, 0, 0];
  for (const g of groups) { const c = n[g]; if (c) { r[0] += c[0]; r[1] += c[1]; r[2] += c[2]; } }
  return r;
}
export const filesOf = (n: Point["n"], groups: GroupId[]) => groups.reduce((s, g) => s + (n[g]?.[3] ?? 0), 0);

/** แถวของตาราง รุ่นที่ขยับเลข จากล่าสุดลงไป · แถวแรกคืองานในเครื่องที่ยังไม่ขึ้นรุ่น · แถวท้ายคือ commit แรกของโปรเจกต์ */
export type Row = { key: string; label: string; date: string; n: Point["n"]; now?: boolean; first?: boolean; h?: string };
export function versionRows(st: LineStats): Row[] {
  const pts = st.points;
  const rows: Row[] = [];
  if (st.now) rows.push({ key: "now", label: "ตอนนี้", date: st.now.d.slice(0, 10), n: st.now.n, now: true });
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    if (p.vm) rows.push({ key: p.h, label: p.v ?? "", date: p.d.slice(0, 10), n: p.n, h: p.h });
  }
  if (pts.length) rows.push({ key: "first", label: pts[0].v ?? "", date: pts[0].d.slice(0, 10), n: pts[0].n, first: true, h: pts[0].h });
  return rows;
}

/** ตัวเลขแกนตั้งที่อ่านง่าย 0 10,000 20,000 … ไม่เกินราว 5 เส้น */
export function niceTicks(max: number, want = 5): number[] {
  if (max <= 0) return [0];
  const raw = max / want, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(Math.round(v));
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + Math.round(step));
  return out;
}
export const fmt = (n: number) => n.toLocaleString("en-US");
/** เพิ่มหรือลด มีเครื่องหมาย + − เสมอ ศูนย์เป็น 0 */
export const signed = (n: number) => (n > 0 ? "+" + fmt(n) : n < 0 ? "−" + fmt(-n) : "0");
