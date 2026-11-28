/* เมนูคลิกขวาของหน้ากราฟเสียง (BUGS ข้อ 164.5 · ROADMAP ข้อ 39 ส่วนต่อยอด "คลิกขวาที่รายการเปิดล่าสุด คิวแปลง")
   ① รายการเปิดล่าสุด ดูกราฟ Bitrate ใส่คิวแปลง เปิดโฟลเดอร์ คัดลอกที่อยู่ เอาออกจากรายการ
   ② คิวแปลงเสียง ดูกราฟต้นทาง ดูกราฟไฟล์ที่แปลงแล้ว เทียบก่อนกับหลัง เปิดโฟลเดอร์ของไฟล์ใหม่ คัดลอกที่อยู่ เอาออกจากคิว
   ทุกข้อเรียกงานเดียวกับปุ่มที่มีอยู่แล้วในหน้า · หน้าตาอยู่ตัวกลาง components/CtxMenu.tsx ข้อที่ซ่อนในหน้าตั้งค่าไม่ขึ้น */
import CtxMenu, { copyText, type CtxItem } from "../../components/CtxMenu";
import { api } from "../../lib/api";
import { IbTrash, IcBitrate, IcCopy, IcFolder, IcGraph, IcMix } from "../../components/icons";
import type { QItem } from "../../lib/convertJob";

type Toast = (t: { kind: "ok" | "bad" | "warn"; title: string; detail?: string }) => void;
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function RecentMenu({ r, lost, x, y, onClose, open, bitrate, convert, forget, toast }: { r: { path: string; name: string }; lost: boolean; x: number; y: number; onClose: () => void; open: () => void; bitrate?: () => void; convert: () => void; forget: () => void; toast: Toast }) {
  const gone = lost ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  const groups: CtxItem[][] = [
    [{ id: "open", label: "ดูกราฟเสียง", icon: <IcGraph size={15} />, why: gone, run: open },
      ...(bitrate ? [{ id: "bitrate", label: "Bitrate", icon: <IcBitrate size={15} />, why: gone, run: bitrate }] : []),
      { id: "convert", label: "ใส่คิวแปลงเสียง", icon: <IcMix size={15} />, why: gone, run: convert }],
    [{ id: "reveal", label: "เปิดโฟลเดอร์", icon: <IcFolder size={15} />, why: gone, run: () => { api.revealMovie(r.path).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) })); } },
      { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์", icon: <IcCopy size={15} />, run: () => { copyText(r.path).then(() => toast({ kind: "ok", title: "คัดลอกที่อยู่ไฟล์แล้ว", detail: r.path })).catch((e) => toast({ kind: "bad", title: "คัดลอกไม่ได้", detail: String(e) })); } },
      { id: "forget", label: "เอาออกจากรายการ", icon: <IbTrash size={15} />, run: forget }],
  ];
  return <CtxMenu menu="recent" title={r.name} x={x} y={y} groups={groups} onClose={onClose} />;
}

export function QueueMenu({ it, x, y, onClose, openGraph, compare, toast, remove }: { it: QItem; x: number; y: number; onClose: () => void; openGraph: (path: string) => void; compare: () => void; toast: Toast; remove: () => void }) {
  const out = it.state === "done" && it.result ? it.result.out : null;
  const notYet = "ยังแปลงไม่เสร็จ จึงยังไม่มีไฟล์ใหม่";
  const groups: CtxItem[][] = [
    [{ id: "graphSrc", label: "ดูกราฟของไฟล์ต้นทาง", icon: <IcGraph size={15} />, why: it.bad ? "อ่านไฟล์นี้ไม่ได้" : null, run: () => openGraph(it.path) },
      { id: "graphOut", label: "ดูกราฟของไฟล์ที่แปลงแล้ว", icon: <IcGraph size={15} />, why: out ? null : notYet, run: () => out && openGraph(out) },
      { id: "compare", label: "เทียบก่อนกับหลังแปลง", icon: <IcGraph size={15} />, why: out ? null : notYet, run: compare }],
    [{ id: "revealOut", label: "เปิดโฟลเดอร์ของไฟล์ที่แปลงแล้ว", icon: <IcFolder size={15} />, why: out ? null : notYet, run: () => { if (out) api.revealMovie(out).catch((e) => toast({ kind: "bad", title: "เปิดโฟลเดอร์ไม่ได้", detail: String(e) })); } },
      { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์ต้นทาง", icon: <IcCopy size={15} />, run: () => { copyText(it.path).then(() => toast({ kind: "ok", title: "คัดลอกที่อยู่ไฟล์แล้ว", detail: it.path })).catch((e) => toast({ kind: "bad", title: "คัดลอกไม่ได้", detail: String(e) })); } },
      { id: "remove", label: "เอาออกจากคิว", icon: <IbTrash size={15} />, why: it.state === "work" ? "กำลังแปลง กดหยุดทั้งคิวก่อน" : null, run: remove }],
  ];
  return <CtxMenu menu="queue" title={base(it.path)} x={x} y={y} groups={groups} onClose={onClose} attrs={{ "data-queuemenu": base(it.path) }} />;
}
