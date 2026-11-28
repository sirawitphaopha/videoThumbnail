/* ทะเบียนเมนูคลิกขวาทั้งโปรแกรม (BUGS ข้อ 164.5 · ROADMAP ข้อ 39)
   พี่กันสั่ง 28 พ.ย. 2569 "39 คลิกขวาตามนั้น และจุดไหนควรทำได้ ก็ทำ และสร้างหน้าตั้งค่าเรื่องคลิกขวาด้วย ว่าอยากเพิ่มลดอะไร"
   ทุกเมนูมีรหัส ชื่อ และรายการข้อ · หน้าตั้งค่าหัวข้อเมนูคลิกขวาติ๊กซ่อนหรือแสดงทีละข้อ เก็บในเครื่อง (ms.ctxHidden) มีผลทันที
   เมนูใหม่ เพิ่มที่นี่แล้วใช้ CtxMenu ส่งรหัสเมนู ข้อที่ซ่อนจะไม่ขึ้นเอง */
import { useSyncExternalStore } from "react";

export type MenuItemDef = { id: string; label: string };
export type MenuDef = { id: string; title: string; where: string; items: MenuItemDef[] };

export const MENUS: MenuDef[] = [
  { id: "shelf", title: "หนังบนชั้นวาง", where: "คลิกขวาที่ปกหรือแถวในตารางของชั้นวาง", items: [
    { id: "play", label: "เปิดเล่น" }, { id: "playWith", label: "เปิดเล่นด้วยโปรแกรมอื่น" }, { id: "rename", label: "เปลี่ยนชื่อ" },
    { id: "poster", label: "เปลี่ยนโปสเตอร์" }, { id: "check", label: "ตรวจไฟล์" }, { id: "info", label: "MediaInfo" }, { id: "reveal", label: "เปิดโฟลเดอร์" },
    { id: "link", label: "จับคู่รูปปก" }, { id: "graph", label: "กราฟเสียง" }, { id: "av", label: "เสียงและซับ" }, { id: "bitrate", label: "Bitrate" },
    { id: "coverPick", label: "สลับปกที่แสดง" }, { id: "rate", label: "ให้ดาว" }, { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์" }, { id: "copyName", label: "คัดลอกชื่อเรื่อง" },
  ] },
  { id: "shelfMulti", title: "หนังหลายเรื่องบนชั้นวาง", where: "กด Ctrl ค้างแล้วคลิกเลือกหลายเรื่อง จากนั้นคลิกขวาที่เรื่องที่เลือก", items: [
    { id: "check", label: "ตรวจไฟล์แบบเร็ว" }, { id: "checkFull", label: "ตรวจไฟล์แบบละเอียด" }, { id: "rate", label: "ให้ดาว" },
    { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์" }, { id: "copyName", label: "คัดลอกชื่อเรื่อง" }, { id: "clear", label: "เลิกเลือก" },
  ] },
  { id: "recent", title: "รายการเปิดล่าสุดของหน้ากราฟเสียง", where: "คลิกขวาที่ไฟล์ในรายการเปิดล่าสุด", items: [
    { id: "open", label: "ดูกราฟเสียง" }, { id: "bitrate", label: "Bitrate" }, { id: "convert", label: "ใส่คิวแปลงเสียง" },
    { id: "reveal", label: "เปิดโฟลเดอร์" }, { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์" }, { id: "forget", label: "เอาออกจากรายการ" },
  ] },
  { id: "queue", title: "คิวแปลงเสียง", where: "คลิกขวาที่แถวในคิวแปลงเสียง", items: [
    { id: "graphSrc", label: "ดูกราฟของไฟล์ต้นทาง" }, { id: "graphOut", label: "ดูกราฟของไฟล์ที่แปลงแล้ว" }, { id: "compare", label: "เทียบก่อนกับหลังแปลง" },
    { id: "revealOut", label: "เปิดโฟลเดอร์ของไฟล์ที่แปลงแล้ว" }, { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์ต้นทาง" }, { id: "remove", label: "เอาออกจากคิว" },
  ] },
  { id: "checkRow", title: "ตารางหน้าตรวจไฟล์", where: "คลิกขวาที่แถวในตารางของหน้าตรวจไฟล์", items: [
    { id: "quick", label: "ตรวจแบบเร็ว" }, { id: "full", label: "ตรวจแบบละเอียด" }, { id: "play", label: "เปิดเล่น" },
    { id: "graph", label: "กราฟเสียง" }, { id: "info", label: "MediaInfo" }, { id: "reveal", label: "เปิดโฟลเดอร์" }, { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์" },
  ] },
  { id: "linkRow", title: "ตารางจับคู่ปก", where: "คลิกขวาที่แถวในตารางตรวจผลของหน้าจับคู่ปก", items: [
    { id: "confirm", label: "ยืนยันแถวนี้" }, { id: "crop", label: "ครอป" }, { id: "change", label: "เปลี่ยนรูป" }, { id: "skip", label: "ข้ามเรื่องนี้" },
    { id: "reveal", label: "เปิดโฟลเดอร์ของไฟล์หนัง" }, { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์หนัง" }, { id: "copyImg", label: "คัดลอกที่อยู่รูป" },
  ] },
];

const KEY = "ms.ctxHidden";
type Hidden = Record<string, string[]>;
function load(): Hidden {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "null"); return v && typeof v === "object" ? v as Hidden : {}; } catch { return {}; }
}
let hidden = load();
const subs = new Set<() => void>();
export const useCtxHidden = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => hidden);
export const isShown = (menu: string, item: string) => !(hidden[menu] ?? []).includes(item);
export function setShown(menu: string, item: string, on: boolean) {
  const cur = new Set(hidden[menu] ?? []);
  if (on) cur.delete(item); else cur.add(item);
  hidden = { ...hidden, [menu]: [...cur] };
  if (!hidden[menu].length) { const { [menu]: _, ...rest } = hidden; hidden = rest; }
  try { if (Object.keys(hidden).length) localStorage.setItem(KEY, JSON.stringify(hidden)); else localStorage.removeItem(KEY); } catch { /* จำไม่ได้ ใช้ค่านี้ถึงปิดโปรแกรม */ }
  subs.forEach((f) => f());
}
export function resetShown() {
  hidden = {};
  try { localStorage.removeItem(KEY); } catch { /* ไม่มีที่เก็บ */ }
  subs.forEach((f) => f());
}
