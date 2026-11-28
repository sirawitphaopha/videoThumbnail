/* ตัวผูกเมนูคลิกขวาของชั้นวาง (BUGS ข้อ 163.7) · คลิกขวาที่ปกหรือแถวตารางของเรื่องไหน เลือกเรื่องนั้นแล้วเปิดเมนู
   ทุกข้อเรียกงานชุดเดียวกับปุ่มในแผงขวา (Detail.tsx) ไม่เขียนงานซ้ำ · เปลี่ยนชื่อเปิดช่องเปลี่ยนชื่อในแผงขวาของเรื่องนั้น */
import { useCallback, useState } from "react";
import type { CheckReq } from "../check/CheckPage";
import type { Page } from "../../components/Sidebar";
import { api, type Movie } from "../../lib/api";
import { openLinkRow } from "../../lib/linkJob";
import { useToast } from "../../components/Toasts";
import MovieMenu, { type MenuAct } from "./MovieMenu";

type Opts = {
  movies: Movie[]; scanning: boolean; setSel: (id: string | null) => void; onPage: (p: Page) => void; onPoster: (path: string) => void; onInfo: (id: string) => void;
  onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onBitrate: (path: string) => void; onAv: (path: string) => void; play: (m: Movie) => void; reveal: (m: Movie) => void;
};

/** คัดลอกข้อความ · ตัวตรวจในโหมดพัฒนาเก็บลง __shelfClipOut ไม่แตะคลิปบอร์ดของคนที่ใช้คอม */
async function copy(text: string) {
  const w = window as unknown as { __shelfClipOut?: string[] };
  if (import.meta.env.DEV && w.__shelfClipOut) { w.__shelfClipOut.push(text); return; }
  await navigator.clipboard.writeText(text);
}

export function useMovieMenu(o: Opts) {
  const toast = useToast();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** เรื่องที่กดเปลี่ยนชื่อจากเมนู แผงขวาของเรื่องนั้นเปิดช่องเปลี่ยนชื่อแล้วล้างค่า (เลือกเรื่องอื่นทีหลังไม่เปิดเอง) */
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-mid]");
    if (!el?.dataset.mid) return;
    e.preventDefault();
    o.setSel(el.dataset.mid);
    setMenu({ id: el.dataset.mid, x: e.clientX, y: e.clientY });
  };
  const m = menu ? o.movies.find((x) => x.id === menu.id) ?? null : null;
  const act = (a: MenuAct) => {
    if (!m) return;
    switch (a) {
      case "play": o.play(m); break;
      case "rename": o.setSel(m.id); setRenameFor(m.id); break;
      case "poster": o.onPoster(m.path); break;
      case "check": o.onCheck({ ids: [m.id] }); break;
      case "info": o.onInfo(m.id); break;
      case "reveal": o.reveal(m); break;
      case "link": openLinkRow(m.id).then(() => o.onPage("link")).catch((e) => toast({ kind: "bad", title: "เปิดตารางจับคู่ไม่ได้", detail: String(e) })); break;
      case "graph": o.onGraph(m.path); break;
      case "av": o.onAv(m.path); break;
      case "bitrate": o.onBitrate(m.path); break;
      case "copyPath": copy(m.path).then(() => toast({ kind: "ok", title: "คัดลอกที่อยู่ไฟล์แล้ว", detail: m.path })).catch((e) => toast({ kind: "bad", title: "คัดลอกไม่ได้", detail: String(e) })); break;
      case "copyName": copy(m.name).then(() => toast({ kind: "ok", title: "คัดลอกชื่อเรื่องแล้ว", detail: m.name })).catch((e) => toast({ kind: "bad", title: "คัดลอกไม่ได้", detail: String(e) })); break;
    }
  };
  const rate = (n: number) => { if (m) api.setRating(m.id, n).catch((e) => toast({ kind: "bad", title: "ให้คะแนนไม่สำเร็จ", detail: String(e) })); };
  const node = m && menu ? <MovieMenu m={m} x={menu.x} y={menu.y} scanning={o.scanning} onAct={act} onRate={rate} onClose={close} /> : null;
  return { onContextMenu, node, renameFor, renameDone: () => setRenameFor(null) };
}
