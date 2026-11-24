/* ของระดับไฟล์ของกระดานจับคู่ปก ชื่อไฟล์ นามสกุล ตัวนับ ไอคอนโฟลเดอร์ ชนิดของช่องที่ลากผ่าน
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { IMAGE_EXT } from "../../lib/api/index";

export const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const isImage = (p: string) => IMAGE_EXT.includes(extOf(p));
export const COUNT = (n: number) => n.toLocaleString("en-US");

export const FolderIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;

export type Over = { id: string; names: string; bad: boolean } | null;
