/* สวิตช์ แสดงโครงจางค้างไว้ ในหน้าตั้งค่า (สเปกข้อ 9 · สกิล loading-skeleton)
   เปิดแล้วชั้นวางขึ้นโครงจางแบบตอนรออ่านโฟลเดอร์ค้างไว้ ไว้ดูหน้าตา · ไม่เก็บลงไฟล์ค่าตั้ง ปิดโปรแกรมแล้วกลับเป็นปิดเอง */
import { useSyncExternalStore } from "react";

let on = false;
const subs = new Set<() => void>();

export function setSkelPreview(v: boolean) {
  on = v;
  subs.forEach((f) => f());
}

export function useSkelPreview(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => on);
}
