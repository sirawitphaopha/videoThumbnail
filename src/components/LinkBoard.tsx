/* กระดานจับคู่ (แผนจับคู่รูปปก ขั้น 4 · มอคอัปหน้า 3 และ 3 ต่อ)
   รูปซ้าย หนังขวา · กดรูปแล้วกดหนัง 2 คลิก · ลากรูปไปวาง · คีย์บอร์ด · ลากรูปจาก Explorer มาวางบนหนังตรง ๆ
   จับคู่แล้วยังไม่บันทึก แถวขึ้นสีฟ้า ส่งไปรอยืนยันที่ตารางตรวจผล (พี่กันสั่ง 8 พ.ย. 2569 ทุกวิธีมาจบที่ตาราง)
   หัวแผงเป็นรายการโฟลเดอร์ เพิ่มได้เรื่อย ๆ แถวยาวลงมาตามจำนวน (พี่กันสั่ง *"เลือกโฟลเดอร์เพิ่มได้เรื่อยๆ"*) · โฟลเดอร์หนังคือโฟลเดอร์ของชั้นวาง (พี่กันตอบตอนทำแผน)
   สลับดูรายการกับแค่รูปได้ทั้งสองแผง จำค่าไว้ · ชี้ที่รูปเห็นชื่อไฟล์ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Dialog from "./Dialog";
import SearchBox from "./SearchBox";
import { Seg } from "./ui";
import { useToast } from "./Toasts";
import { useLibrary } from "../lib/library";
import { useSettings } from "../lib/settings";
import { inApp, linkApi, pickFile, pickFolder, thumbUrl, type LinkImage, type Movie } from "../lib/api";
import { searchByName } from "../lib/thaiSearch";
import { reloadImages, setLinkJob, setReply, thumbOf, useLinkJob } from "../lib/linkJob";
import { IcPoster } from "./icons";
import { IbTrash, IbBack } from "./icons";
import { IbTable } from "./icons";

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif"];
const extOf = (p: string) => (p.match(/\.([^.\\/]+)$/)?.[1] ?? "").toLowerCase();
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const isImage = (p: string) => IMAGE_EXT.includes(extOf(p));
const COUNT = (n: number) => n.toLocaleString("en-US");

const FolderIcon = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;

type Over = { id: string; names: string; bad: boolean } | null;

export default function LinkBoard() {
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
    if (!fresh.length) { toast({ kind: "info", title: "โฟลเดอร์นี้อยู่บนชั้นวางแล้ว", detail: dirs.join(" · ") }); return; }
    await update({ folders: [...settings.folders, ...fresh] });
    scan();
    toast({ kind: "ok", title: "เพิ่มโฟลเดอร์หนังแล้ว กำลังอ่านขึ้นชั้น", detail: fresh.join(" · ") });
  }, [settings, update, scan, toast]);
  const removeMovieFolder = async (dir: string) => {
    if (!settings) return;
    setRemoving(null);
    await update({ folders: settings.folders.filter((x) => x !== dir) });
    scan();
    toast({ kind: "ok", title: "เอาออกจากชั้นแล้ว", detail: `${dir} · ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ` });
  };

  // ---------- ลากจาก Explorer ----------
  // ตำแหน่งเมาส์ที่ได้เป็นพิกเซลจริงของจอ หารด้วยอัตราขยายของจอก่อนหาช่องใต้เมาส์ (TECH-REVIEW ข้อ 11)
  const elAt = (x: number, y: number) => document.elementFromPoint(x / devicePixelRatio, y / devicePixelRatio);
  const hover = useCallback((x: number, y: number, paths: string[]) => {
    const el = elAt(x, y);
    const id = el?.closest<HTMLElement>("[data-board-movie]")?.dataset.boardMovie ?? null;
    const pane = el?.closest<HTMLElement>("[data-board-pane]")?.dataset.boardPane as "images" | "movies" | undefined;
    setOverPane(id ? null : pane ?? null);
    if (!id) { setOver(null); return; }
    const imgs = paths.filter(isImage);
    setOver({ id, names: imgs.length ? imgs.map(baseName).join(" · ") : "", bad: paths.length > 0 && !imgs.length });
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
      if (imgs.length && imgs.length < paths.length) toast({ kind: "info", title: "ข้ามไฟล์ที่ไม่ใช่รูป", detail: paths.filter((p) => !isImage(p)).map(baseName).join(" · ") });
      return;
    }
    const pane = el?.closest<HTMLElement>("[data-board-pane]")?.dataset.boardPane;
    if (pane === "movies") {
      // แผงหนัง · โฟลเดอร์เพิ่มเข้าชั้นวาง รูปต้องวางบนหนังเรื่องใดเรื่องหนึ่ง
      const flags = await linkApi.isDir(paths);
      const dirs = paths.filter((_, i) => flags[i]);
      if (!dirs.length) { toast({ kind: "info", title: "วางรูปบนหนังเรื่องที่ต้องการ", detail: "หรือลากโฟลเดอร์หนังมาวางเพื่อเพิ่มเข้าชั้น" }); return; }
      await addMovieFolders(dirs);
      return;
    }
    await addImages(paths);
  }, [pair, addImages, addMovieFolders, toast]);
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
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

  return (
    <div className="linktable" data-link-board>
      <div className="board">
        {/* ---------- รูป ---------- */}
        <div className={"card bpane" + (imgOnly ? " only" : "") + (overPane === "images" ? " over" : "")} data-board-pane="images">
          <div className="bhead"><b>รูปที่ยังไม่ได้ใช้ · <span className="nw">{COUNT(free.length)} รูป</span></b>
            <Seg small label="มุมมองแผงรูป" value={imgOnly ? "only" : "list"} onChange={(v) => update({ linkBoardImages: v })} options={[{ value: "list", label: <><IbTable size={14} />มีชื่อไฟล์</> }, { value: "only", label: <><IcPoster size={14} />แค่รูป</> }]} /></div>
          <div className="folders" data-board-img-folders>
            {reply.imageFolders.map((f) => (
              <div key={f} className="pathline"><FolderIcon /><b title={f}>{f}</b><span className="small">{COUNT(imgCount(f))} รูป</span>
                <button type="button" className="x" aria-label={"เอาโฟลเดอร์ " + f + " ออกจากกระดาน"} title="เอาออกจากกระดาน รูปในเครื่องไม่ถูกแตะ" onClick={async () => { setReply(await linkApi.removeImages(f)); await after(); }}>×</button></div>
            ))}
            {reply.loose.length > 0 && <div className="pathline"><FolderIcon /><b>รูปที่ลากมาทีละรูป</b><span className="small">{COUNT(reply.loose.length)} รูป</span></div>}
            <div className="addfolder"><button type="button" className="addbtn" data-board-add-images onClick={async () => { const d = await pickFolder("เลือกโฟลเดอร์รูป"); if (d) addImages([d]); }}>+ เพิ่มโฟลเดอร์รูป</button><span>หรือลากโฟลเดอร์หรือรูปมาวาง</span>
              <button type="button" className="addbtn" style={{ marginLeft: "auto" }} onClick={async () => { const f = await pickFile("image"); if (f) addImages([f]); }}><IcPoster size={15} />เลือกรูป</button></div>
          </div>
          <div className="bscroll">
            {free.length === 0 ? <div className="small" style={{ padding: "18px 4px" }} data-board-noimg>ยังไม่มีรูปเหลือ · เพิ่มโฟลเดอร์รูป หรือลากรูปจาก Explorer มาวางบนหนังตรง ๆ</div> : (
              <div className="imgs" ref={imgGrid} data-board-imgs>
                {free.map((i) => <ImgCard key={i.path} i={i} sel={selected === i.path} dragging={drag?.moved && drag.path === i.path} onPick={() => setSelected((s) => (s === i.path ? null : i.path))} onDown={(e) => startDrag(e, i.path)} onKey={(e) => onImgKey(e, i.path)} />)}
              </div>
            )}
          </div>
        </div>
        {/* ---------- หนัง ---------- */}
        <div className={"card bpane" + (mvOnly ? " only" : "") + (overPane === "movies" ? " over" : "")} data-board-pane="movies">
          <div className="bhead"><b>{reply.scope === "all" ? "หนังทุกเรื่องบนชั้น" : "หนังที่ยังไม่มีปก"} · <span className="nw">{COUNT(onBoard.length)} เรื่อง</span></b>
            <Seg small label="มุมมองแผงหนัง" value={mvOnly ? "only" : "list"} onChange={(v) => update({ linkBoardMovies: v })} options={[{ value: "list", label: <><IbTable size={14} />รายการ</> }, { value: "only", label: <><IcPoster size={14} />แค่รูป</> }]} /></div>
          <div className="folders" data-board-mv-folders>
            {(settings?.folders ?? []).map((f) => (
              <div key={f} className="pathline"><FolderIcon /><b title={f}>{f}</b><span className="small">{COUNT(folderCount(f))} เรื่อง</span>
                <button type="button" className="x" aria-label={"เอาโฟลเดอร์ " + f + " ออกจากชั้น"} title="เอาออกจากชั้นวาง ไฟล์ในเครื่องไม่ถูกแตะ" data-board-rm-folder={f} onClick={() => setRemoving(f)}>×</button></div>
            ))}
            <div className="addfolder"><button type="button" className="addbtn" data-board-add-movies onClick={async () => { const d = await pickFolder("เลือกโฟลเดอร์หนัง"); if (d) addMovieFolders([d]); }}>+ เพิ่มโฟลเดอร์หนัง</button><span>หรือลากโฟลเดอร์มาวาง · หนังขึ้นชั้นวางด้วย{scanning ? " · กำลังอ่านโฟลเดอร์…" : ""}</span></div>
          </div>
          <div style={{ marginBottom: 8 }}><SearchBox value={query} onChange={setQuery} placeholder="ค้นชื่อหนัง" label="ค้นชื่อหนังบนกระดาน" swapLabel={found.swapped ? found.used : ""} width="100%" /></div>
          <div className="bscroll">
            {list.length === 0 ? <div className="small" style={{ padding: "18px 4px" }} data-board-nomovie>{query ? "ไม่มีหนังที่ชื่อตรงกับคำค้น" : "ทุกเรื่องมีปกหรือรอยืนยันอยู่แล้ว · กลับไปยืนยันที่ตารางตรวจผล"}</div>
              : <div className={mvOnly ? "mvgrid" : "mvlist"} data-board-movies>
                {list.map((m) => <MovieCell key={m.id} m={m} title={titles[m.id] ?? m.name} only={mvOnly} selected={selected} over={over?.id === m.id ? over : drag?.moved && drag.on === m.id ? { id: m.id, names: baseName(drag.path), bad: false } : null}
                  sent={sent.includes(m.id)} pick={rowOf.get(m.id)?.tall ?? rowOf.get(m.id)?.wide ?? null}
                  onPick={() => tryPick(m.id)} onUndo={() => undo(m.id)} />)}
              </div>}
          </div>
        </div>
      </div>
      <div className="linkfoot">
        <span className="small" style={{ flex: 1, minWidth: 0 }}>คีย์บอร์ด ลูกศรเลือกรูป · Enter เลือก · Tab ไปฝั่งหนัง · Enter จับคู่ · Ctrl+Z ย้อน · คู่ที่จับบนกระดานยังไม่บันทึก ไปรอยืนยันที่ตาราง</span>
        <button type="button" className="btn btn-main" data-board-back onClick={() => setLinkJob({ view: "table" })}><IbBack size={15} />กลับตารางตรวจผล{waitingManual ? ` · จับคู่ไว้ ${COUNT(waitingManual)} คู่` : ""}</button>
      </div>
      {dragImg && drag && (
        <div className="bghost" style={{ left: drag.x + 10, top: drag.y + 10 }} data-board-ghost>
          {thumbUrl(thumbOf(dragImg)) ? <img src={thumbUrl(thumbOf(dragImg)) ?? undefined} alt="" draggable={false} /> : <span className="lthumb none" />}
        </div>
      )}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} kind="work" confirm title="เอาโฟลเดอร์นี้ออกจากชั้นวางไหม"
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>ไม่เอาออก</button>
          <button type="button" className="btn btn-danger" data-board-rm-yes onClick={() => { if (removing) removeMovieFolder(removing); }}><IbTrash size={15} />เอาออกจากชั้น</button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div style={{ wordBreak: "break-all" }}>{removing}</div>
          <div>หนังในโฟลเดอร์นี้จะหายจากชั้นวาง ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</div>
        </div>
      </Dialog>
    </div>
  );
}

function ImgCard(p: { i: LinkImage; sel: boolean; dragging?: boolean; onPick: () => void; onDown: (e: React.PointerEvent) => void; onKey: (e: React.KeyboardEvent) => void }) {
  const { i } = p;
  const src = thumbUrl(thumbOf(i));
  const wide = i.width > i.height;
  return (
    <button type="button" className={"bimg" + (p.sel ? " sel" : "") + (p.dragging ? " drag" : "") + (wide ? " wide" : "")} title={i.name} aria-label={"รูป " + i.name} aria-pressed={p.sel} data-board-img={i.name}
      onClick={p.onPick} onPointerDown={p.onDown} onKeyDown={p.onKey} onDragStart={(e) => e.preventDefault()}>
      {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : <span className="bimgph">{i.error ? "อ่านไม่ได้" : ""}</span>}
      <span className="fn">{i.name}</span>
    </button>
  );
}

function MovieCell(p: { m: Movie; title: string; only: boolean; selected: string | null; over: Over; sent: boolean; pick: { thumb: string | null; name: string; path: string } | null; onPick: () => void; onUndo: () => void }) {
  const { m, over } = p;
  const pickSrc = p.sent && p.pick ? thumbUrl(thumbOf(p.pick as never)) : null;
  const cover = thumbUrl(m.thumb);
  const cls = (over ? " target" : "") + (over?.bad ? " bad" : "") + (p.sent ? " sent" : "");
  const dropText = over?.bad ? "ไม่ใช่รูป ไม่รับ" : "ปล่อยเมาส์เพื่อใช้รูปนี้";
  if (p.only) {
    return (
      <div className={"mt" + cls} title={[m.name, p.sent && p.pick ? `ส่งไปรอยืนยันที่ตารางแล้ว · ${p.pick.name}` : ""].filter(Boolean).join("\n")} data-board-movie={m.id} data-board-title={p.title}
        role="button" tabIndex={0} aria-label={p.title} onClick={() => { if (!p.sent) p.onPick(); }} onKeyDown={(e) => { if (e.key === "Enter" && !p.sent) p.onPick(); }}>
        {pickSrc ? <img className="slot" src={pickSrc} alt="" draggable={false} />
          : cover ? <img className="slot" src={cover} alt="" draggable={false} />
          : <span className="slot none"><b>{p.title}</b>{over && <em>{dropText}</em>}</span>}
        {(pickSrc || cover) && over && <span className="mtover">{dropText}</span>}
        {p.sent && <button type="button" className="btn btn-ghost btn-sm undo" data-board-undo onClick={(e) => { e.stopPropagation(); p.onUndo(); }}><IbBack size={15} />ย้อน</button>}
      </div>
    );
  }
  return (
    <div className={"mvrow" + cls} data-board-movie={m.id} data-board-title={p.title} role="button" tabIndex={0} aria-label={p.title}
      onClick={() => { if (!p.sent) p.onPick(); }} onKeyDown={(e) => { if (e.key === "Enter" && !p.sent) p.onPick(); }}>
      {pickSrc ? <img className="lthumb small" src={pickSrc} alt="" draggable={false} />
        : cover ? <img className="lthumb small" src={cover} alt="" draggable={false} />
        : <span className="lthumb small none">ไม่มีปก</span>}
      <div className="lname"><b>{p.title}</b><span className="fn" title={m.path}>{p.sent && p.pick ? `ส่งไปรอยืนยันที่ตารางแล้ว · ${p.pick.name}` : `${baseName(m.path)} · ${m.root}`}</span></div>
      {over ? <span className="small mvhint">{dropText}{over.names ? <><br />{over.names}</> : null}</span>
        : p.sent ? <button type="button" className="btn btn-ghost btn-sm" data-board-undo onClick={(e) => { e.stopPropagation(); p.onUndo(); }}><IbBack size={15} />ย้อน</button>
        : p.selected ? <span className="small mvhint">กดเพื่อใช้รูปที่เลือก</span> : null}
    </div>
  );
}
