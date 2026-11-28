/* เมนูคลิกขวาที่หนังบนชั้นวาง ทั้งแบบปกและแบบตาราง (BUGS ข้อ 163.7 · ข้อ 164.5 · ROADMAP ข้อ 39)
   พี่กันแทรก 10 พ.ย. 2569 "คลิกขวาที่หนั มันก็จุะเลือกวิธีได้ทุกอย่างเลย" แล้วชี้ "เพราะจถุดพวกนี้ มันคลิกควาดูได้"
   ส่วนแรกเป็นปุ่มชุดเดียวกับแผงขวาของชั้นวาง ชื่อและลำดับเดียวกัน · เปิดเล่นด้วยโปรแกรมอื่นเป็นเมนูย่อย (BUGS ข้อ 164.5)
   ใต้เส้นคั่นเป็นส่วนเสริม สลับปกที่แสดง ให้ดาว คัดลอกที่อยู่ไฟล์ คัดลอกชื่อเรื่อง · เลือกหลายเรื่องแล้วได้เมนูของหลายเรื่อง
   หน้าตาและการกดอยู่ตัวกลาง components/CtxMenu.tsx ข้อที่ซ่อนในหน้าตั้งค่าไม่ขึ้น */
import CtxMenu, { type CtxItem } from "../../components/CtxMenu";
import type { Movie, PlayerInfo } from "../../lib/api";
import { IbPencil, IbPlay, IcBitrate, IcCheck, IcCopy, IcFolder, IcGraph, IcInfo, IcLink, IcMix, IcPoster } from "../../components/icons";

export type MenuAct = "play" | "rename" | "poster" | "check" | "info" | "reveal" | "link" | "graph" | "av" | "bitrate" | "copyPath" | "copyName" | "coverPick";

/** รายการในเมนูของหนังเรื่องนี้ · why คือเหตุผลที่กดไม่ได้ (null = กดได้) */
export function menuItems(m: Movie, scanning: boolean, act: (a: MenuAct) => void, players: PlayerInfo[] | null, playWith: (p: PlayerInfo) => void, rate: (n: number) => void): CtxItem[][] {
  const gone = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  const it = (a: MenuAct, label: string, icon: React.ReactNode, why: string | null = null): CtxItem => ({ id: a, label, icon, why, run: () => act(a) });
  const others = (players ?? []).filter((p) => p.exists && !p.isDefault);
  const main: CtxItem[] = [
    it("play", "เปิดเล่น", <IbPlay size={15} />, gone),
    { id: "playWith", label: "เปิดเล่นด้วยโปรแกรมอื่น", icon: <IbPlay size={15} />, why: gone ?? (players == null ? "กำลังหาโปรแกรมเล่นในเครื่อง" : others.length === 0 ? "ไม่เจอโปรแกรมเล่นอื่นในเครื่อง เพิ่มได้ในหน้าตั้งค่าหัวข้อเปิดเล่นหนัง" : null),
      sub: others.map((p) => ({ id: `with:${p.name}`, label: p.name, run: () => playWith(p) })) },
    it("rename", "เปลี่ยนชื่อ", <IbPencil size={15} />, gone ?? (scanning ? "กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน" : null)),
    it("poster", "เปลี่ยนโปสเตอร์", <IcPoster size={15} />, gone),
    it("check", "ตรวจไฟล์", <IcCheck size={15} />),
    it("info", "MediaInfo", <IcInfo size={15} />, gone),
    it("reveal", "เปิดโฟลเดอร์", <IcFolder size={15} />),
  ];
  // แผงขวามีปุ่มจับคู่รูปปกเฉพาะเรื่องที่ยังไม่มีปกจับคู่ เมนูใช้กติกาเดียวกัน
  if (!m.linked?.length) main.push(it("link", "จับคู่รูปปก", <IcLink size={15} />, gone));
  main.push(
    it("graph", "กราฟเสียง", <IcGraph size={15} />, gone ?? (m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null)),
    it("av", "เสียงและซับ", <IcMix size={15} />, gone),
    it("bitrate", "Bitrate", <IcBitrate size={15} />, gone),
  );
  const more: CtxItem[] = [];
  // สลับปกที่แสดง เฉพาะเรื่องที่มีทั้งปกในไฟล์และปกจับคู่ (ปุ่มเดียวกับ ปกที่แสดง ในการ์ดปกจับคู่ของแผงขวา)
  if (m.fileCover && m.linked?.length) more.push(it("coverPick", m.coverPick === "file" ? "แสดงปกจับคู่แทนปกในไฟล์" : "แสดงปกในไฟล์แทนปกจับคู่", <IcPoster size={15} />));
  more.push({ id: "rate", label: "ให้ดาว", stars: { value: m.rating ?? 0, onRate: rate } },
    it("copyPath", "คัดลอกที่อยู่ไฟล์", <IcCopy size={15} />), it("copyName", "คัดลอกชื่อเรื่อง", <IcCopy size={15} />));
  return [main, more];
}

export default function MovieMenu({ m, x, y, scanning, players, onAct, onPlayWith, onRate, onClose }: { m: Movie; x: number; y: number; scanning: boolean; players: PlayerInfo[] | null; onAct: (a: MenuAct) => void; onPlayWith: (p: PlayerInfo) => void; onRate: (n: number) => void; onClose: () => void }) {
  return <CtxMenu menu="shelf" title={m.name} x={x} y={y} groups={menuItems(m, scanning, onAct, players, onPlayWith, onRate)} onClose={onClose} attrs={{ "data-moviemenu": m.name }} />;
}

export type MultiAct = "check" | "checkFull" | "copyPath" | "copyName" | "clear";
/** เมนูของหนังหลายเรื่องที่เลือกไว้ (กด Ctrl ค้างแล้วคลิก) */
export function MultiMenu({ list, x, y, onAct, onRate, onClose }: { list: Movie[]; x: number; y: number; onAct: (a: MultiAct) => void; onRate: (n: number) => void; onClose: () => void }) {
  const it = (a: MultiAct, label: string, icon: React.ReactNode): CtxItem => ({ id: a, label, icon, run: () => onAct(a) });
  const groups: CtxItem[][] = [
    [it("check", `ตรวจไฟล์แบบเร็ว ${list.length} เรื่อง`, <IcCheck size={15} />), it("checkFull", `ตรวจไฟล์แบบละเอียด ${list.length} เรื่อง`, <IcCheck size={15} />)],
    [{ id: "rate", label: "ให้ดาวทุกเรื่อง", stars: { value: 0, onRate } }, it("copyPath", "คัดลอกที่อยู่ไฟล์ทุกเรื่อง", <IcCopy size={15} />), it("copyName", "คัดลอกชื่อเรื่องทุกเรื่อง", <IcCopy size={15} />)],
    [it("clear", "เลิกเลือก", null)],
  ];
  return <CtxMenu menu="shelfMulti" title={`เลือกไว้ ${list.length} เรื่อง`} x={x} y={y} groups={groups} onClose={onClose} attrs={{ "data-multimenu": String(list.length) }} />;
}
