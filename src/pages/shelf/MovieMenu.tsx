/* เมนูคลิกขวาที่หนังบนชั้นวาง ทั้งแบบปกและแบบตาราง (BUGS ข้อ 163.7 · ROADMAP ข้อ 39)
   พี่กันแทรก 10 พ.ย. 2569 "คลิกขวาที่หนั มันก็จุะเลือกวิธีได้ทุกอย่างเลย" แล้วชี้ "เพราะจถุดพวกนี้ มันคลิกควาดูได้"
   ส่วนแรกเป็นปุ่มชุดเดียวกับแผงขวาของชั้นวาง ชื่อและลำดับเดียวกัน ใต้เส้นคั่นเป็นส่วนเสริม ให้ดาว คัดลอกที่อยู่ไฟล์ คัดลอกชื่อเรื่อง
   ข้อที่ทำไม่ได้กับเรื่องนั้นจางเป็นสีปุ่มที่กดไม่ได้ ชี้แล้วบอกเหตุผลแบบปุ่มในแผงขวา · ชื่อเรื่องยาวจัดด้วยตัวกลาง longName · เมนูพอดีจอ กางกลับทางเมื่อชิดขอบ · Esc หรือกดข้างนอกปิด · ลูกศรขึ้นลงเลื่อนข้อ */
import { useLayoutEffect, useRef, useState } from "react";
import type { Movie } from "../../lib/api";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { IbPencil, IbPlay, IcBitrate, IcCheck, IcCopy, IcFolder, IcGraph, IcInfo, IcLink, IcMix, IcPoster } from "../../components/icons";

export type MenuAct = "play" | "rename" | "poster" | "check" | "info" | "reveal" | "link" | "graph" | "av" | "bitrate" | "copyPath" | "copyName";
type Item = { act: MenuAct; label: string; icon: React.ReactNode; why?: string | null };

/** รายการในเมนูของหนังเรื่องนี้ · why คือเหตุผลที่กดไม่ได้ (null = กดได้) */
export function menuItems(m: Movie, scanning: boolean): Item[][] {
  const gone = m.missing ? "หาไฟล์ไม่เจอ ไดรฟ์อาจถอดออกอยู่" : null;
  const main: Item[] = [
    { act: "play", label: "เปิดเล่น", icon: <IbPlay size={15} />, why: gone },
    { act: "rename", label: "เปลี่ยนชื่อ", icon: <IbPencil size={15} />, why: gone ?? (scanning ? "กำลังอ่านโฟลเดอร์อยู่ รอให้เสร็จก่อน" : null) },
    { act: "poster", label: "เปลี่ยนโปสเตอร์", icon: <IcPoster size={15} />, why: gone },
    { act: "check", label: "ตรวจไฟล์", icon: <IcCheck size={15} /> },
    { act: "info", label: "MediaInfo", icon: <IcInfo size={15} />, why: gone },
    { act: "reveal", label: "เปิดโฟลเดอร์", icon: <IcFolder size={15} /> },
  ];
  // แผงขวามีปุ่มจับคู่รูปปกเฉพาะเรื่องที่ยังไม่มีปกจับคู่ เมนูใช้กติกาเดียวกัน
  if (!m.linked?.length) main.push({ act: "link", label: "จับคู่รูปปก", icon: <IcLink size={15} />, why: gone });
  main.push(
    { act: "graph", label: "กราฟเสียง", icon: <IcGraph size={15} />, why: gone ?? (m.audio.length === 0 ? "ไฟล์นี้ไม่มีแทร็กเสียง" : null) },
    { act: "av", label: "เสียงและซับ", icon: <IcMix size={15} />, why: gone },
    { act: "bitrate", label: "Bitrate", icon: <IcBitrate size={15} />, why: gone },
  );
  const more: Item[] = [
    { act: "copyPath", label: "คัดลอกที่อยู่ไฟล์", icon: <IcCopy size={15} /> },
    { act: "copyName", label: "คัดลอกชื่อเรื่อง", icon: <IcCopy size={15} /> },
  ];
  return [main, more];
}

const STAR = "M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z";

export default function MovieMenu({ m, x, y, scanning, onAct, onRate, onClose }: { m: Movie; x: number; y: number; scanning: boolean; onAct: (a: MenuAct) => void; onRate: (n: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEscClose(true, onClose);
  useClickOutside(true, ref, onClose);
  // วัดขนาดเมนูก่อนจอติด · ชิดขอบขวาหรือล่างกางกลับไปทางซ้ายหรือขึ้นบน ไม่ล้นจอ (สกิล popup-fit)
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight, pad = 8;
    const left = x + w + pad > W ? Math.max(pad, x - w) : x;
    const top = y + h + pad > H ? Math.max(pad, Math.min(y - h, H - h - pad)) : y;
    setPos({ left, top });
  }, [x, y]);
  // โฟกัสข้อแรกที่กดได้หลังเมนูขึ้นจอแล้ว (ตอนวัดขนาดเมนูยังซ่อนอยู่ โฟกัสไม่ได้)
  useLayoutEffect(() => { if (pos) ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([aria-disabled=true])")?.focus(); }, [pos]);
  // เลื่อนหน้าหรือย่อขยายหน้าต่าง เมนูไม่ตามตำแหน่งเดิม ปิดไปเลยแบบโปรแกรมทั่วไป
  useLayoutEffect(() => {
    const close = () => onClose();
    window.addEventListener("resize", close); window.addEventListener("blur", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
  }, [onClose]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
    all[j]?.focus();
  };
  const groups = menuItems(m, scanning);
  const rating = m.rating ?? 0;
  const btn = (it: Item) => (
    <button key={it.act} type="button" role="menuitem" className={"mm-item" + (it.why ? " off" : "")} aria-disabled={it.why ? true : undefined}
      title={it.why ? `${it.label}ไม่ได้ ${it.why}` : undefined} onClick={() => { if (it.why) return; onClose(); onAct(it.act); }} data-mm={it.act}>
      <span className="mm-ic">{it.icon}</span><span className="mm-lbl">{it.label}</span>
    </button>
  );
  return (
    <div ref={ref} className="mm pop-in" role="menu" aria-label={`เมนูของ ${m.name}`} onKeyDown={keys} onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }} data-moviemenu={m.name}>
      <div className="mm-head" title={m.name}>{m.name}</div>
      {groups[0].map(btn)}
      <div className="mm-sep" role="separator" />
      {/* ให้ดาวเป็นแถวในเมนู กดดวงที่ให้อยู่แล้วซ้ำเพื่อล้าง แบบดาวบนชั้นวาง */}
      <div className="mm-stars" role="group" aria-label={`ให้ดาว ตอนนี้ ${rating} ดาว`} data-mmstars={rating}>
        <span className="mm-lbl">ให้ดาว</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="menuitem" className={"star" + (n <= rating ? " on" : "")} aria-label={rating === n ? `ล้างคะแนน ${n} ดาว` : `ให้ ${n} ดาว`}
            title={rating === n ? "กดอีกครั้งเพื่อล้างคะแนน" : `ให้ ${n} ดาว`} onClick={() => { onClose(); onRate(rating === n ? 0 : n); }} data-mmstar={n}>
            <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d={STAR} /></svg>
          </button>
        ))}
      </div>
      {groups[1].map(btn)}
    </div>
  );
}
