/* เมนูคลิกขวาของแถวในตารางหน้าตรวจไฟล์ (BUGS ข้อ 164.5 · พี่กันสั่ง "จุดไหนควรทำได้ ก็ทำ")
   ตรวจแบบเร็ว ตรวจแบบละเอียด เปิดเล่น กราฟเสียง MediaInfo เปิดโฟลเดอร์ คัดลอกที่อยู่ · หน้าตาอยู่ตัวกลาง components/CtxMenu.tsx */
import CtxMenu, { copyText, type CtxItem } from "../../components/CtxMenu";
import { api, type CheckMode, type Movie } from "../../lib/api";
import { useToast } from "../../components/Toasts";
import { IbPlay, IcCheck, IcCopy, IcFolder, IcGraph, IcInfo } from "../../components/icons";

export function CheckRowMenu({ m, x, y, running, onClose, start, onGraph, onInfo }: { m: Movie; x: number; y: number; running: boolean; onClose: () => void; start: (mode: CheckMode) => void; onGraph: (path: string) => void; onInfo?: (id: string) => void }) {
  const toast = useToast();
  const gone = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  const busy = running ? "กำลังตรวจเรื่องอื่นอยู่ รอให้เสร็จก่อน" : null;
  const fail = (title: string) => (e: unknown) => toast({ kind: "bad", title, detail: String(e) });
  const groups: CtxItem[][] = [
    [{ id: "quick", label: "ตรวจแบบเร็ว", icon: <IcCheck size={15} />, why: gone ?? busy, run: () => start("quick") },
      { id: "full", label: "ตรวจแบบละเอียด", icon: <IcCheck size={15} />, why: gone ?? busy, run: () => start("full") }],
    [{ id: "play", label: "เปิดเล่น", icon: <IbPlay size={15} />, why: gone, run: () => { api.playMovie(m.path).catch(fail("เปิดเล่นไม่ได้")); } },
      { id: "graph", label: "กราฟเสียง", icon: <IcGraph size={15} />, why: gone ?? (m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null), run: () => onGraph(m.path) },
      ...(onInfo ? [{ id: "info", label: "MediaInfo", icon: <IcInfo size={15} />, why: gone, run: () => onInfo(m.id) }] : []),
      { id: "reveal", label: "เปิดโฟลเดอร์", icon: <IcFolder size={15} />, why: gone, run: () => { api.revealMovie(m.path).catch(fail("เปิดโฟลเดอร์ไม่ได้")); } },
      { id: "copyPath", label: "คัดลอกที่อยู่ไฟล์", icon: <IcCopy size={15} />, run: () => { copyText(m.path).then(() => toast({ kind: "ok", title: "คัดลอกที่อยู่ไฟล์แล้ว", detail: m.path })).catch(fail("คัดลอกไม่ได้")); } }],
  ];
  return <CtxMenu menu="checkRow" title={`${m.name}.${m.ext}`} x={x} y={y} groups={groups} onClose={onClose} attrs={{ "data-checkmenu": m.name }} />;
}
