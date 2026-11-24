/* ลากไฟล์จาก Explorer ลากรูปบนกระดาน คีย์ลัดของรูป และรายการที่รอจับคู่เอง
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useRef } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { inApp, linkApi } from "../../lib/api/index";
import { baseName, isImage } from "./boardShared";
import type { Bo0 } from "./boardCtx";

export function useBoardDrag(c: Bo0) {
  const { addImages, addMovieFolders, drag, dragPaths, folders, images, movies, pair, reply, selected, sent, setDrag, setOver, setOverPane, setSelected, toast, undo } = c;
  const elAt = (x: number, y: number) => document.elementFromPoint(x / devicePixelRatio, y / devicePixelRatio);
  const hover = useCallback((x: number, y: number, paths: string[]) => {
    const el = elAt(x, y);
    const id = el?.closest<HTMLElement>("[data-board-movie]")?.dataset.boardMovie ?? null;
    const pane = el?.closest<HTMLElement>("[data-board-pane]")?.dataset.boardPane as "images" | "movies" | undefined;
    setOverPane(id ? null : pane ?? null);
    if (!id) { setOver(null); return; }
    const imgs = paths.filter(isImage);
    setOver({ id, names: imgs.length ? imgs.map(baseName).join(", ") : "", bad: paths.length > 0 && !imgs.length });
  }, []);
  const handleDrop = useCallback(async (paths: string[], x: number, y: number) => {
    setOver(null);
    setOverPane(null);
    dragPaths.current = [];
    if (!paths.length) return;
    const el = elAt(x, y);
    const id = el?.closest<HTMLElement>("[data-board-movie]")?.dataset.boardMovie;
    if (id) {
      // รูปปนไฟล์อื่น รับเฉพาะรูป บอกว่าข้ามอะไร · เดิมบนจอขึ้นกรอบปกติ แต่ปล่อยแล้วโดนปฏิเสธทั้งชุด
      const imgs = paths.filter(isImage);
      await pair(id, imgs.length ? imgs : paths, "explorer");
      if (imgs.length && imgs.length < paths.length) toast({ kind: "warn", ms: 6000, key: "board-drop", title: "ข้ามไฟล์ที่ไม่ใช่รูป", detail: paths.filter((p) => !isImage(p)).map(baseName).join(", ") });
      return;
    }
    const pane = el?.closest<HTMLElement>("[data-board-pane]")?.dataset.boardPane;
    if (pane === "movies") {
      // แผงหนัง · โฟลเดอร์เพิ่มเข้าชั้นวาง รูปต้องวางบนหนังเรื่องใดเรื่องหนึ่ง
      const flags = await linkApi.isDir(paths);
      const dirs = paths.filter((_, i) => flags[i]);
      if (!dirs.length) { toast({ kind: "warn", ms: 6000, key: "board-drop", title: "วางรูปบนหนังเรื่องที่ต้องการ", detail: "หรือลากโฟลเดอร์หนังมาวางเพื่อเพิ่มเข้าชั้น" }); return; }
      await addMovieFolders(dirs);
      return;
    }
    await addImages(paths);
  }, [pair, addImages, addMovieFolders, toast]);
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
      const t = e.payload.type;
      if (t === "enter") { dragPaths.current = e.payload.paths; hover(e.payload.position.x, e.payload.position.y, e.payload.paths); }
      else if (t === "over") hover(e.payload.position.x, e.payload.position.y, dragPaths.current);
      else if (t === "drop") handleDrop(e.payload.paths, e.payload.position.x, e.payload.position.y);
      else { setOver(null); setOverPane(null); dragPaths.current = []; }
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, [handleDrop, hover]);
  // ตัวเทสหน้าจอเรียกตรงนี้แทนการลากจริง (มีเฉพาะตอนทดสอบ)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__boardDrop = handleDrop;
    w.__boardHover = hover;
    return () => { delete w.__boardDrop; delete w.__boardHover; };
  }, [handleDrop, hover]);

  // ---------- ลากรูปในกระดาน ----------
  const startDrag = (e: React.PointerEvent, path: string) => {
    if (e.button !== 0) return;
    setDrag({ path, x: e.clientX, y: e.clientY, on: null, moved: false });
  };
  useEffect(() => {
    if (!drag) return;
    // ตัวผูกนี้อยู่ตลอดการลากหนึ่งครั้ง จำว่าขยับแล้วไว้ที่นี่ · อ่านจาก drag ได้ค่าตอนเริ่มกด ปล่อยแล้วไม่จับคู่ (เจอตอนเทส)
    const start = { x: drag.x, y: drag.y, path: drag.path };
    let moved = false;
    const move = (e: PointerEvent) => {
      moved = moved || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6;
      const on = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-board-movie]")?.dataset.boardMovie ?? null;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, on, moved } : d));
    };
    const up = (e: PointerEvent) => {
      setDrag(null);
      const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-board-movie]")?.dataset.boardMovie;
      if (moved && id) pair(id, [start.path], "board");
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setDrag(null); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("keydown", esc); };
    // ผูกใหม่ตอนเริ่มลากครั้งใหม่ ไม่ใช่ทุกครั้งที่เมาส์ขยับ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.path, pair]);
  const dragImg = drag?.moved ? images.find((i) => i.path === drag.path) : null;

  // ---------- คีย์บอร์ด ----------
  const imgGrid = useRef<HTMLDivElement>(null);
  const onImgKey = (e: React.KeyboardEvent, path: string) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected((s) => (s === path ? null : path)); return; }
    const all = [...(imgGrid.current?.querySelectorAll<HTMLElement>("[data-board-img]") ?? [])];
    const i = all.indexOf(e.currentTarget as HTMLElement);
    const cols = Math.max(1, Math.round((imgGrid.current?.clientWidth ?? 1) / Math.max(1, all[0]?.offsetWidth ?? 1)));
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "ArrowDown" ? i + cols : e.key === "ArrowUp" ? i - cols : -1;
    if (to >= 0 && to < all.length && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) { e.preventDefault(); all[to].focus(); }
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับปุ่มลัด (BUGS ข้อ 9)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && sent.length && !(e.target as HTMLElement)?.closest("input,textarea")) {
        e.preventDefault();
        undo(sent[sent.length - 1]);
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [sent, undo]);

  const waitingManual = reply.rows.filter((r) => r.status === "manual" && (r.tall || r.wide)).length;
  const tryPick = (id: string) => { if (selected) pair(id, [selected], "board"); };
  const folderCount = (dir: string) => folders.find((f) => f.path === dir)?.count ?? movies.filter((m) => m.root === dir).length;
  const imgCount = (dir: string) => images.filter((i) => i.folder === dir).length;

  return { elAt, hover, handleDrop, pageOn, startDrag, dragImg, imgGrid, onImgKey, waitingManual, tryPick, folderCount, imgCount };
}
