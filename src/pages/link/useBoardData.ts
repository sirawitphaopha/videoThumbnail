/* รายการหนังและรูปบนกระดาน ค้นหา จับคู่ เลิกจับคู่ เพิ่มรูป เพิ่มลบโฟลเดอร์
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../../components/Toasts";
import { useLibrary } from "../../lib/library";
import { useSettings } from "../../lib/settings";
import { linkApi } from "../../lib/api/index";
import { searchByName } from "../../lib/thaiSearch";
import { reloadImages, setReply, useLinkJob } from "../../lib/linkJob";
import { type Over } from "./boardShared";

export function useBoardData() {
  const job = useLinkJob();
  const toast = useToast();
  const { movies, folders, scan, scanning } = useLibrary();
  const { settings, update } = useSettings();
  const { reply, images } = job;
  const imgOnly = settings?.linkBoardImages === "only";
  const mvOnly = settings?.linkBoardMovies === "only";
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [titles, setTitles] = useState<Record<string, string>>({});
  /** เรื่องที่จับคู่บนกระดานรอบนี้ ขึ้นแถวสีฟ้ากับปุ่มย้อน · ลำดับล่าสุดท้ายสุด ใช้กับ Ctrl+Z */
  const [sent, setSent] = useState<string[]>([]);
  const [over, setOver] = useState<Over>(null);
  const [overPane, setOverPane] = useState<"images" | "movies" | null>(null);
  const [drag, setDrag] = useState<{ path: string; x: number; y: number; on: string | null; moved: boolean } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const dragPaths = useRef<string[]>([]);

  useEffect(() => { reloadImages().catch(() => {}); }, []);
  // ชื่อเรื่องที่ตัดปีกับชื่อทีมทำไฟล์แล้ว ใช้ตัวเทียบชื่อเดียวกับฝั่ง Rust ไม่เขียนซ้ำในหน้าจอ
  const pathsKey = movies.map((m) => m.path).join("|");
  useEffect(() => {
    let live = true;
    linkApi.titles(movies.map((m) => m.path)).then((t) => { if (live) setTitles(Object.fromEntries(movies.map((m, i) => [m.id, t[i] || m.name]))); }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey]);

  const rowOf = useMemo(() => new Map(reply.rows.map((r) => [r.id, r])), [reply.rows]);
  /** หนังบนกระดาน · ยังไม่มีปก ยังไม่มีคู่รอยืนยัน · แบบทุกเรื่องบนชั้นรวมเรื่องที่มีปกด้วย · เรื่องที่เพิ่งจับคู่อยู่ต่อให้เห็นแถวสีฟ้า */
  const onBoard = useMemo(() => movies.filter((m) => {
    if (m.missing) return false;
    if (sent.includes(m.id)) return true;
    const r = rowOf.get(m.id);
    if (r && (r.tall || r.wide)) return false;
    return reply.scope === "all" || (!m.hasCover && !(m.linked?.length));
  }), [movies, rowOf, sent, reply.scope]);
  const found = useMemo(() => searchByName(onBoard, query, (m) => `${titles[m.id] ?? m.name} ${m.name}`), [onBoard, query, titles]);
  const list = useMemo(() => [...found.items].sort((a, b) => (titles[a.id] ?? a.name).localeCompare(titles[b.id] ?? b.name, "th")), [found.items, titles]);
  const free = useMemo(() => images.filter((i) => !i.used), [images]);

  const after = async () => { await reloadImages(); };
  const pair = useCallback(async (id: string, paths: string[], via: "board" | "explorer") => {
    try {
      setReply(await linkApi.pair(id, paths, via));
      setSent((s) => [...s.filter((x) => x !== id), id]);
      setSelected(null);
      await after();
    } catch (e) {
      toast({ kind: "bad", title: "ใช้ไฟล์นี้ไม่ได้", detail: String(e) });
    }
  }, [toast]);
  const undo = useCallback(async (id: string) => {
    try {
      setReply(await linkApi.undo(id));
      setSent((s) => s.filter((x) => x !== id));
      await after();
    } catch (e) {
      toast({ kind: "bad", title: "ย้อนไม่สำเร็จ", detail: String(e) });
    }
  }, [toast]);

  const addImages = useCallback(async (paths: string[]) => {
    try { setReply(await linkApi.addImages(paths)); }
    catch (e) { toast({ kind: "bad", title: "มีไฟล์ที่ไม่รับ", detail: String(e) }); setReply(await linkApi.state()); }
    await after();
  }, [toast]);
  const addMovieFolders = useCallback(async (dirs: string[]) => {
    if (!settings) return;
    const fresh = dirs.filter((d, i) => !settings.folders.some((x) => x.toLowerCase() === d.toLowerCase()) && dirs.findIndex((o) => o.toLowerCase() === d.toLowerCase()) === i);
    if (!fresh.length) { toast({ kind: "warn", ms: 6000, key: "board-drop", title: "โฟลเดอร์นี้อยู่บนชั้นวางแล้ว", detail: dirs.join(", ") }); return; }
    // บันทึกไม่สำเร็จ ตัวบันทึกขึ้นแถบแดงเองแล้ว ไม่อ่านโฟลเดอร์ ไม่ขึ้นแถบเขียว (AUDIT ข้อ 135 ต้นเหตุเดียวกับหน้าตั้งค่า)
    if (!(await update({ folders: [...settings.folders, ...fresh] }))) return;
    scan();
    toast({ kind: "ok", title: "เพิ่มโฟลเดอร์หนังแล้ว กำลังอ่านขึ้นชั้น", detail: fresh.join(", ") });
  }, [settings, update, scan, toast]);
  const removeMovieFolder = async (dir: string) => {
    if (!settings) return;
    setRemoving(null);
    if (!(await update({ folders: settings.folders.filter((x) => x !== dir) }))) return;
    scan();
    toast({ kind: "ok", title: "เอาออกจากชั้นแล้ว", detail: `${dir} ส่วนไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ` });
  };

  // ---------- ลากจาก Explorer ----------
  // ตำแหน่งเมาส์ที่ได้เป็นพิกเซลจริงของจอ หารด้วยอัตราขยายของจอก่อนหาช่องใต้เมาส์ (TECH-REVIEW ข้อ 11)
  return { job, toast, movies, folders, scan, scanning, settings, update, reply, images, imgOnly, mvOnly, selected, setSelected, query, setQuery, titles, setTitles, sent, setSent, over, setOver, overPane, setOverPane, drag, setDrag, removing, setRemoving, dragPaths, pathsKey, rowOf, onBoard, found, list, free, after, pair, undo, addImages, addMovieFolders, removeMovieFolder };
}
