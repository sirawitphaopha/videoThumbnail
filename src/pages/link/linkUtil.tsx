/* ตัวช่วยร่วมของหน้าจับคู่ปก ตารางตรวจผล และแถว (แยกจาก LinkPage.tsx ตอนไฟล์ใกล้ 600 บรรทัด BUGS ข้อ 161 ชุด 3) */
import { type LinkRow, type LinkStatus } from "../../lib/api/index";

export const isImagePath = (p: string) => /\.(jpe?g|png|webp|bmp|tiff?|heic|heif)$/i.test(p);
export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const COUNT = (n: number) => n.toLocaleString("en-US");
/** ที่อยู่โฟลเดอร์ ตัดบรรทัดได้เฉพาะหลังเครื่องหมาย \ ชื่อโฟลเดอร์ไม่ขาดกลางคำ (เจอ "ชั้นจับ|คู่" ตอนอ่านภาพ 11 พ.ย. 2569) · ชื่อยาวกว่า 28 ตัวยอมตัดข้างใน กันล้นช่อง */
export const pathNodes = (p: string) => p.split("\\").map((s, i, a) => (
  <span key={i}><span className={s.length <= 28 ? "nw" : undefined}>{s}{i < a.length - 1 ? "\\" : ""}</span>{i < a.length - 1 && <wbr />}</span>
));

export type Tab = "all" | "sure" | "manual" | "unsure" | "none" | "saved";
export const inTab = (r: LinkRow, t: Tab) => t === "all" || r.status === t;

export const PILL: Record<LinkStatus, string> = { sure: "p-ok", unsure: "p-warn", none: "p-bad", manual: "p-info", saved: "p-ok" };
