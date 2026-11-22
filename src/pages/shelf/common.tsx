/* ชั้นวาง ส่วนกลาง · ตัวเลือกเรียง ขนาดปก ตัวกรองที่มาของปก ตัวกรองดาว ตัวเรียงหนัง ข้อความเสียงกับซับ ชื่อหนังที่ไฮไลต์คำค้น
   แยกจาก ShelfPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 4.3) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   ค่าที่จำระหว่างเปลี่ยนหน้า filterMemo starMemo driveLater อยู่ ShelfPage.tsx เพราะหน้าชั้นวางกำหนดค่าใหม่ */
import { Phrases, chText } from "../../components/ui";
import { IcLink } from "../../components/icons";
import { type Movie } from "../../lib/api";
import { highlightParts } from "../../lib/thaiSearch";
import { kindOf, KIND_ORDER } from "../../lib/status";

export const SORTS = [
  { value: "name-asc", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "year", label: "ปีที่ออกฉาย ใหม่ไปเก่า" },
  { value: "added", label: "เพิ่มเข้าชั้นล่าสุด" },
  { value: "size", label: "ขนาดไฟล์ ใหญ่ไปเล็ก" },
  { value: "status", label: "สภาพไฟล์ ที่เสียขึ้นก่อน" },
  { value: "rating", label: "ดาวมากไปน้อย" },
];
export const SIZES = { s: { w: 100, gap: 14 }, m: { w: 140, gap: 18 }, l: { w: 180, gap: 20 } } as const;
export const byName = (a: Movie, b: Movie) => a.name.localeCompare(b.name, "th");
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** ตัวกรองที่มาของปก (พี่กันเคาะ *"ชั้นวางกรองได้ว่าเรื่องไหนปกมาจากการรวม เรื่องไหนจับคู่"*) · จำไว้ระหว่างเปลี่ยนหน้า ปิดโปรแกรมกลับเป็นทั้งหมด จะได้ไม่งงว่าหนังหาย */
export type CoverFilter = "all" | "file" | "linked" | "none";
/** นับตามปกที่กำลังแสดง เรื่องหนึ่งอยู่หมวดเดียว ยอดสามหมวดรวมกันเท่าทั้งหมด */
export const coverFrom = (m: Movie): Exclude<CoverFilter, "all"> => (m.shownLink ? "linked" : m.thumb ? "file" : "none");
/** ตัวกรองคะแนนดาว · จำไว้ระหว่างเปลี่ยนหน้าแบบเดียวกับตัวกรองปก */
export type StarFilter = "all" | "5" | "4" | "3" | "2" | "1" | "none";
export const STAR_FILTERS: { value: StarFilter; label: string }[] = [
  { value: "all", label: "ทุกดาว" }, { value: "5", label: "5 ดาว" }, { value: "4", label: "4 ดาวขึ้นไป" }, { value: "3", label: "3 ดาวขึ้นไป" }, { value: "2", label: "2 ดาวขึ้นไป" }, { value: "1", label: "1 ดาวขึ้นไป" }, { value: "none", label: "ยังไม่ให้ดาว" },
];
export const passStars = (m: Movie, f: StarFilter) => (f === "all" ? true : f === "none" ? !m.rating : (m.rating ?? 0) >= Number(f));
export const LinkMark = () => <span className="linkb" title="ปกจับคู่ไว้ ไม่ได้อยู่ในไฟล์" data-linkb><IcLink size={13} stroke="#b0355f" /></span>;

export function sortMovies(list: Movie[], key: string, reminder: number): Movie[] {
  const l = list.slice();
  switch (key) {
    case "name-desc": return l.sort((a, b) => byName(b, a));
    case "year": return l.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byName(a, b));
    case "added": return l.sort((a, b) => b.added - a.added || byName(a, b));
    case "size": return l.sort((a, b) => b.size - a.size || byName(a, b));
    case "rating": return l.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b));
    case "status": return l.sort((a, b) => KIND_ORDER[kindOf(a, reminder)] - KIND_ORDER[kindOf(b, reminder)] || byName(a, b));
    default: return l.sort(byName);
  }
}

export const tracks = (t: Movie["audio"], withLayout: boolean) =>
  t.map((x) => [x.lang, x.codec, withLayout ? chText(x.layout) : null].filter(Boolean).join(" ")).join(", ");

/** ชื่อหนังพร้อมไฮไลต์คำที่ค้น · ตัดบรรทัดตรงเว้นวรรค (ui.tsx Phrases) · tail ต่อท้ายวลีสุดท้ายไม่แยกบรรทัด */
export function Hl({ text, used, head, tail }: { text: string; used: string; head?: React.ReactNode; tail?: React.ReactNode }) {
  return <Phrases parts={highlightParts(text, used).map((p) => ({ text: p.text, hit: p.hit }))} head={head} tail={tail} />;
}