/* เมนูคลิกขวาของแถวในตารางตรวจผลของหน้าจับคู่ปก (BUGS ข้อ 164.5 · ROADMAP ข้อ 39 ส่วนต่อยอด "แถวในตารางจับคู่ปก")
   ยืนยันแถวนี้ ครอป เปลี่ยนรูป ข้าม (งานเดียวกับปุ่มในแถว) เปิดโฟลเดอร์ของไฟล์หนัง คัดลอกที่อยู่ไฟล์หนังกับที่อยู่รูป
   ระหว่างยืนยันหรืออ่านรูป ข้อที่แก้แถวกดไม่ได้พร้อมเหตุผล แบบปุ่มในแถว · หน้าตาอยู่ตัวกลาง components/CtxMenu.tsx */
import CtxMenu, { copyText, type CtxItem } from "../../components/CtxMenu";
import { api, type LinkRow } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import { IbCrop, IbTick, IcCopy, IcFolder, IcPoster } from "../../components/icons";

export function LinkRowMenu({ r, x, y, busyWhy, onClose, confirm, crop, change, skip }: { r: LinkRow; x: number; y: number; busyWhy: string | null; onClose: () => void; confirm: () => void; crop: () => void; change: () => void; skip: () => void }) {
  const toast = useToast();
  const img = r.tall ?? r.wide;
  const saved = r.status === "saved";
  const noImg = img ? null : "แถวนี้ยังไม่มีรูป";
  const fail = (title: string) => (e: unknown) => toast({ kind: "bad", title, detail: String(e) });
  const copy = (t: string, what: string) => copyText(t).then(() => toast({ kind: "ok", title: `คัดลอก${what}แล้ว`, detail: t })).catch(fail("คัดลอกไม่ได้"));
  const groups: CtxItem[][] = [
    [{ id: "confirm", label: "ยืนยันแถวนี้", icon: <IbTick size={15} />, why: busyWhy ?? (saved ? "บันทึกแล้ว" : noImg), run: confirm },
      { id: "crop", label: "ครอป", icon: <IbCrop size={15} />, why: busyWhy ?? (saved ? "บันทึกแล้ว" : noImg), run: crop },
      { id: "change", label: "เปลี่ยนรูป", icon: <IcPoster size={15} />, why: busyWhy ?? (saved ? "บันทึกแล้ว" : null), run: change },
      { id: "skip", label: "ข้ามเรื่องนี้", icon: null, why: busyWhy ?? (saved ? "บันทึกแล้ว" : null), run: skip }],
    [{ id: "reveal", label: "เปิดโฟลเดอร์ของไฟล์หนัง", icon: <IcFolder size={15} />, run: () => { api.revealMovie(r.movie).catch(fail("เปิดโฟลเดอร์ไม่ได้")); } },
      { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์หนัง", icon: <IcCopy size={15} />, run: () => copy(r.movie, "ที่อยู่ไฟล์หนัง") },
      { id: "copyImg", label: "คัดลอกที่อยู่รูป", icon: <IcCopy size={15} />, why: noImg, run: () => img && copy(img.path, "ที่อยู่รูป") }],
  ];
  return <CtxMenu menu="linkRow" title={r.title} x={x} y={y} groups={groups} onClose={onClose} attrs={{ "data-linkmenu": r.id }} />;
}
