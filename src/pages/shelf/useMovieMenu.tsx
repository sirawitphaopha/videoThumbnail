/* ตัวผูกเมนูคลิกขวาของชั้นวาง (BUGS ข้อ 163.7 · ข้อ 164.5) · คลิกขวาที่ปกหรือแถวตารางของเรื่องไหน เลือกเรื่องนั้นแล้วเปิดเมนู
   ทุกข้อเรียกงานชุดเดียวกับปุ่มในแผงขวา (Detail.tsx) ไม่เขียนงานซ้ำ · เปลี่ยนชื่อเปิดช่องเปลี่ยนชื่อในแผงขวาของเรื่องนั้น
   เลือกหลายเรื่อง กด Ctrl ค้างแล้วคลิก (ROADMAP ข้อ 39 ส่วนต่อยอด) เรื่องที่เลือกมีกรอบ คลิกขวาที่เรื่องที่เลือกได้เมนูของหลายเรื่อง
   คลิกเฉย ๆ หรือกด Esc เลิกเลือก */
import { useCallback, useState } from "react";
import type { CheckReq } from "../check/CheckPage";
import type { Page } from "../../components/Sidebar";
import { api, linkApi, pairApi, playerApi, type Movie, type PlayerInfo } from "../../lib/api";
import { openLinkRow } from "../../lib/linkJob";
import { useEscClose } from "../../lib/popup";
import { useToast } from "../../components/Toasts";
import { copyText } from "../../components/CtxMenu";
import MovieMenu, { MultiMenu, type MenuAct, type MultiAct } from "./MovieMenu";

type Opts = {
  movies: Movie[]; scanning: boolean; selId: string | null; setSel: (id: string | null) => void; onPage: (p: Page) => void; onPoster: (path: string) => void; onInfo: (id: string) => void;
  onCheck: (r: CheckReq) => void; onGraph: (path: string) => void; onBitrate: (path: string) => void; onAv: (path: string) => void; play: (m: Movie) => void; reveal: (m: Movie) => void;
};

export function useMovieMenu(o: Opts) {
  const toast = useToast();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; multi: boolean } | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[] | null>(null);
  /** เรื่องที่เลือกหลายเรื่อง (Ctrl คลิก) */
  const [multi, setMulti] = useState<Set<string>>(new Set());
  /** เรื่องที่กดเปลี่ยนชื่อจากเมนู แผงขวาของเรื่องนั้นเปิดช่องเปลี่ยนชื่อแล้วล้างค่า (เลือกเรื่องอื่นทีหลังไม่เปิดเอง) */
  const [renameFor, setRenameFor] = useState<string | null>(null);
  /** เรื่องที่กดเอาปกจับคู่ออกจากเมนู แผงขวาเปิดหน้าต่างยืนยันของการ์ดปกจับคู่แล้วล้างค่า (ไม่ลบทันที หน้าต่างบอกว่าไฟล์ไหนลงถังขยะ) */
  const [unlinkFor, setUnlinkFor] = useState<string | null>(null);
  /** รูปต้นฉบับของปกจับคู่หาไม่เจอ ข้อครอปใหม่จาง (เช็กแบบการ์ดปกจับคู่ ระหว่างเช็กถือว่าเจอ) */
  const [noSource, setNoSource] = useState(false);
  const close = useCallback(() => setMenu(null), []);
  useEscClose(multi.size > 0 && !menu, () => setMulti(new Set()));
  const onContextMenu = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-mid]");
    if (!el?.dataset.mid) return;
    e.preventDefault();
    const id = el.dataset.mid;
    const inMulti = multi.size > 1 && multi.has(id);
    if (!inMulti) { setMulti(new Set()); o.setSel(id); }
    setMenu({ id, x: e.clientX, y: e.clientY, multi: inMulti });
    // รายการโปรแกรมเล่นของเครื่อง ใช้ในเมนูย่อย เปิดเล่นด้วยโปรแกรมอื่น
    if (!inMulti) playerApi.list().then((l) => setPlayers(l.players)).catch(() => setPlayers([]));
    setNoSource(false);
    const lm = o.movies.find((x) => x.id === id);
    const src = (lm?.shownLink ?? lm?.linked?.[0])?.source;
    if (!inMulti && src) pairApi.check([src]).then(([ok]) => setNoSource(!ok)).catch(() => {});
  };
  /** Ctrl คลิกเลือกหลายเรื่อง · คลิกเฉย ๆ เลิกเลือกหลายเรื่อง */
  const onClickCapture = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-mid]");
    if (!el?.dataset.mid || (e.target as HTMLElement).closest("button,input,.stars")) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      const id = el.dataset.mid;
      // เรื่องที่เลือกอยู่ก่อน (แผงขวาเปิดอยู่) นับเป็นเรื่องแรกของการเลือกหลายเรื่อง
      setMulti((s) => { const n = new Set(s); if (n.size === 0 && o.selId && o.selId !== id) n.add(o.selId); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      return;
    }
    if (multi.size) setMulti(new Set());
  };
  const m = menu ? o.movies.find((x) => x.id === menu.id) ?? null : null;
  const done = (title: string, detail?: string) => toast({ kind: "ok", title, detail });
  const fail = (title: string) => (e: unknown) => toast({ kind: "bad", title, detail: String(e) });
  const act = (a: MenuAct) => {
    if (!m) return;
    switch (a) {
      case "play": o.play(m); break;
      case "rename": o.setSel(m.id); setRenameFor(m.id); break;
      case "poster": o.onPoster(m.path); break;
      case "check": o.onCheck({ ids: [m.id] }); break;
      case "info": o.onInfo(m.id); break;
      case "reveal": o.reveal(m); break;
      case "link": openLinkRow(m.id).then(() => o.onPage("link")).catch(fail("เปิดตารางจับคู่ไม่ได้")); break;
      case "graph": o.onGraph(m.path); break;
      case "av": o.onAv(m.path); break;
      case "bitrate": o.onBitrate(m.path); break;
      case "coverPick": linkApi.coverPick(m.id, m.coverPick === "file" ? "linked" : "file").catch(fail("เปลี่ยนปกที่แสดงไม่ได้")); break;
      case "recrop": case "rechange": openLinkRow(m.id, a === "recrop").then(() => o.onPage("link")).catch(fail("เปิดตารางจับคู่ไม่ได้")); break;
      case "unlink": o.setSel(m.id); setUnlinkFor(m.id); break;
      case "copyPath": copyText(m.path).then(() => done("คัดลอกที่อยู่ไฟล์แล้ว", m.path)).catch(fail("คัดลอกไม่ได้")); break;
      case "copyName": copyText(m.name).then(() => done("คัดลอกชื่อเรื่องแล้ว", m.name)).catch(fail("คัดลอกไม่ได้")); break;
    }
  };
  const playWith = (p: PlayerInfo) => { if (m) api.playMovieWith(m.path, p.path).catch(fail(`เปิดด้วย ${p.name} ไม่ได้`)); };
  const rate = (n: number) => { if (m) api.setRating(m.id, n).catch(fail("ให้คะแนนไม่สำเร็จ")); };
  const list = o.movies.filter((x) => multi.has(x.id));
  const multiAct = (a: MultiAct) => {
    const ids = list.map((x) => x.id);
    if (a === "check") o.onCheck({ ids, mode: "quick" });
    else if (a === "checkFull") o.onCheck({ ids, mode: "full" });
    else if (a === "copyPath") copyText(list.map((x) => x.path).join("\n")).then(() => done(`คัดลอกที่อยู่ไฟล์ ${ids.length} เรื่องแล้ว`)).catch(fail("คัดลอกไม่ได้"));
    else if (a === "copyName") copyText(list.map((x) => x.name).join("\n")).then(() => done(`คัดลอกชื่อเรื่อง ${ids.length} เรื่องแล้ว`)).catch(fail("คัดลอกไม่ได้"));
    if (a !== "copyPath" && a !== "copyName") setMulti(new Set());
  };
  const multiRate = (n: number) => { Promise.all(list.map((x) => api.setRating(x.id, n))).then(() => done(`ให้ ${n} ดาว ${list.length} เรื่องแล้ว`)).catch(fail("ให้คะแนนไม่สำเร็จ")); };
  const node = !menu ? null : menu.multi
    ? <MultiMenu list={list} x={menu.x} y={menu.y} onAct={multiAct} onRate={multiRate} onClose={close} />
    : m ? <MovieMenu m={m} x={menu.x} y={menu.y} scanning={o.scanning} players={players} noSource={noSource} onAct={act} onPlayWith={playWith} onRate={rate} onClose={close} /> : null;
  return { onContextMenu, onClickCapture, multi, node, renameFor, renameDone: () => setRenameFor(null), unlinkFor, unlinkDone: () => setUnlinkFor(null) };
}
