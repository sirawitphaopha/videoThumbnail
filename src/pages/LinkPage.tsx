/* หน้าจับคู่ปก (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
   ขั้นแรก ลากโฟลเดอร์รูปมาวาง เลือกขอบเขต โปรแกรมจับคู่ให้ บอกผลรวมก่อนเปิดตาราง
   ตารางตรวจผล ที่เดียวที่เปลี่ยนรูป ครอป ยืนยัน · ทุกวิธีจับคู่มาจบที่นี่ (พี่กันสั่ง 8 พ.ย. 2569 *"ถ้าจับคู่ เเล้ว เเม้จะช้วิธีไหนก็ตาม มันจะมาหน้านี้"*)
   ยืนยันทีละเรื่อง ที่ติ๊กไว้ หรือทั้งหมด · ยังไม่ยืนยันไม่มีอะไรถูกบันทึก คู่ที่รออยู่โปรแกรมจำไว้
   แถววาดด้วย content-visibility แถวนอกจอไม่กินเวลาวาด ร้อยแถวเลื่อนลื่น */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardIcon, Phr, Seg } from "../components/ui";
import SearchBox from "../components/SearchBox";
import LinkBoard from "../components/LinkBoard";
import CropDialog, { type CropChoice } from "../components/CropDialog";
import { useSettings } from "../lib/settings";
import { useToast } from "../components/Toasts";
import { useLibrary } from "../lib/library";
import { inApp, linkApi, pickFile, pickFolder, posterApi, thumbUrl, type PosterInfo, type AutoSummary, type LinkPick, type LinkRow, type LinkStatus } from "../lib/api";
import { searchByName } from "../lib/thaiSearch";
import { getLinkJob, reloadImages, runConfirm, setLinkJob, setReply, thumbOf, useLinkJob } from "../lib/linkJob";
import "../styles/link.css";

const isImagePath = (p: string) => /\.(jpe?g|png|webp|bmp|tiff?|heic|heif)$/i.test(p);
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const COUNT = (n: number) => n.toLocaleString("en-US");

type Tab = "all" | "sure" | "manual" | "unsure" | "none" | "saved";
const inTab = (r: LinkRow, t: Tab) => t === "all" || r.status === t;

const PILL: Record<LinkStatus, string> = { sure: "p-ok", unsure: "p-warn", none: "p-bad", manual: "p-info", saved: "p-ok" };

export default function LinkPage() {
  const job = useLinkJob();
  const toast = useToast();
  const { reply, view } = job;
  const [summary, setSummary] = useState<AutoSummary | null>(null);
  const [reading, setReading] = useState(false);
  const [summarySec, setSummarySec] = useState(0);
  const { movies } = useLibrary();
  const nocover = movies.filter((m) => !m.hasCover && !m.linked?.length).length;
  const [over, setOver] = useState(false);
  const [badDrop, setBadDrop] = useState<string | null>(null);

  useEffect(() => { reloadImages().catch(() => {}); setLinkJob({ resume: false }); }, []);

  // มีคู่ค้างอยู่แล้ว เปิดหน้ามาเจอตารางเลย ไม่ต้องลากรูปใหม่
  useEffect(() => {
    const j = getLinkJob();
    if (j.view === "start" && j.reply.rows.length > 0) setLinkJob({ view: "table" });
  }, []);

  const runAuto = useCallback(async (scope: "nocover" | "all") => {
    setReading(true);
    const t0 = performance.now();
    try {
      const s = await linkApi.auto(scope);
      setReply(s.reply);
      setSummary(s);
      setSummarySec(Math.max(1, Math.round((performance.now() - t0) / 1000)));
      await reloadImages();
    } catch (e) {
      toast({ kind: "bad", title: "จับคู่ไม่สำเร็จ", detail: String(e) });
    } finally {
      setReading(false);
    }
  }, [toast]);

  /** เพิ่มโฟลเดอร์หรือรูป แล้วจับคู่ให้เลย · ไฟล์ที่ไม่ใช่รูปไม่รับ ขึ้นบอกที่ช่องวาง ของที่เป็นรูปยังเข้า */
  const addPaths = useCallback(async (paths: string[]) => {
    setBadDrop(null);
    try {
      setReply(await linkApi.addImages(paths));
    } catch (e) {
      setBadDrop(String(e));
      setReply(await linkApi.state());
    }
    await runAuto(job.reply.scope);
  }, [runAuto, job.reply.scope]);

  // ---------- ลากจาก Explorer ----------
  // ตำแหน่งเมาส์ที่ได้เป็นพิกเซลจริงของจอ หารด้วยอัตราขยายของจอก่อนหาช่องใต้เมาส์ (TECH-REVIEW ข้อ 11)
  const rowAt = (x: number, y: number) => document.elementFromPoint(x / devicePixelRatio, y / devicePixelRatio)?.closest<HTMLElement>("[data-link-row]")?.dataset.linkRow ?? null;
  const dragPaths = useRef<string[]>([]);
  const hoverRow = useCallback((x: number, y: number) => {
    const id = rowAt(x, y);
    const imgs = dragPaths.current.filter(isImagePath);
    const next = id ? { id, names: imgs.map(baseName).join(" · "), bad: dragPaths.current.length > 0 && imgs.length === 0 } : null;
    const cur = getLinkJob().overRow;
    if (cur?.id !== next?.id || cur?.names !== next?.names || cur?.bad !== next?.bad) setLinkJob({ overRow: next });
  }, []);
  const handleDrop = useCallback(async (paths: string[], x: number, y: number) => {
    setOver(false);
    setLinkJob({ overRow: null });
    dragPaths.current = [];
    if (!paths.length) return;
    const id = rowAt(x, y);
    if (id) {
      // รูปปนไฟล์อื่น รับเฉพาะรูป บอกว่าข้ามอะไร · ไฟล์ที่ไม่ใช่รูปล้วน ส่งไปให้ฝั่ง Rust ปฏิเสธพร้อมเหตุผล
      const imgs = paths.filter(isImagePath);
      try {
        setReply(await linkApi.pair(id, imgs.length ? imgs : paths, "explorer"));
        if (imgs.length && imgs.length < paths.length) toast({ kind: "info", title: "ข้ามไฟล์ที่ไม่ใช่รูป", detail: paths.filter((p) => !isImagePath(p)).map(baseName).join(" · ") });
      } catch (e) { toast({ kind: "bad", title: "ใช้ไฟล์นี้ไม่ได้", detail: String(e) }); }
      return;
    }
    addPaths(paths);
  }, [addPaths, toast]);
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      // กระดานฟังการลากของตัวเอง หาว่าวางบนหนังเรื่องไหน
      if (getLinkJob().view === "board") return;
      const t = e.payload.type;
      if (t === "over" || t === "enter") {
        setOver(true);
        if (t === "enter") dragPaths.current = e.payload.paths;
        hoverRow(e.payload.position.x, e.payload.position.y);
      } else if (t === "drop") handleDrop(e.payload.paths, e.payload.position.x, e.payload.position.y);
      else { setOver(false); setLinkJob({ overRow: null }); }
    })).then((u) => { if (live) off = u; else u(); });
    return () => { live = false; off?.(); };
  }, [handleDrop, hoverRow]);
  // ตัวเทสหน้าจอเรียกตรงนี้แทนการลากจริง (มีเฉพาะตอนทดสอบ) · ลากจริงจาก Explorer ต้องให้คนลองเอง
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__linkDrop = handleDrop;
    w.__linkHover = (paths: string[], x: number, y: number) => { dragPaths.current = paths; hoverRow(x, y); };
    return () => { delete w.__linkDrop; delete w.__linkHover; };
  }, [handleDrop, hoverRow]);

  if (view === "board") return <LinkBoard />;
  if (view === "table") return <ReviewTable />;
  return (
    <div className="pagewrap" data-link-page>
      <div className="wrapin" style={{ maxWidth: 980 }}>
        <div className="card">
          <h3><span className="step">1</span>รูปที่จะเอามาจับคู่</h3>
          <div className={"drop" + (over ? " over" : badDrop ? " bad" : "")} style={{ minHeight: 130 }} data-link-drop>
            {over ? <b>ปล่อยเมาส์เพื่อเพิ่มรูป</b>
              : badDrop ? <><b><Phr>{badDrop}</Phr></b></>
              : <><b style={{ color: "var(--txt2)" }}>ลากโฟลเดอร์รูป หรือรูปหลายรูปมาวางตรงนี้</b><div>JPG PNG WebP BMP TIFF HEIC · รูปในโฟลเดอร์ย่อยอ่านด้วย · รูปต้นฉบับไม่ถูกแก้</div></>}
          </div>
          <div className="row8" style={{ marginTop: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" data-link-pick onClick={async () => { const d = await pickFolder("เลือกโฟลเดอร์รูป"); if (d) addPaths([d]); }}>เลือกโฟลเดอร์</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const f = await pickFile("image"); if (f) addPaths([f]); }}>เลือกรูป</button>
          </div>
          {reply.imageFolders.length + reply.loose.length > 0 && (
            <div className="folders" style={{ marginTop: 10 }} data-link-folders>
              {[...reply.imageFolders, ...reply.loose].map((f) => (
                <div key={f} className="pathline" data-link-folder={f}><b title={f}>{f}</b>
                  <button type="button" className="x" aria-label={"เอา " + f + " ออก"} title="เอาออก รูปในเครื่องไม่ถูกแตะ" onClick={async () => { setReply(await linkApi.removeImages(f)); await reloadImages(); setSummary(null); }}>×</button></div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3><span className="step">2</span>จับคู่กับหนังเรื่องไหน</h3>
          <div className="row8">
            <Seg small label="ขอบเขต" value={reply.scope} disabledReason={reading ? "กำลังอ่านรูปอยู่ รอให้เสร็จก่อน" : undefined} onChange={(v) => { setReply({ ...reply, scope: v }); if (reply.imageFolders.length + reply.loose.length) runAuto(v); }}
              options={[{ value: "nocover", label: `เฉพาะเรื่องที่ยังไม่มีปก ${COUNT(nocover)}` }, { value: "all", label: `ทุกเรื่องบนชั้นวาง ${COUNT(movies.length)}` }]} />
            <span className="small">เรื่องที่มีปกในไฟล์อยู่แล้ว ข้ามให้ · เปลี่ยนเป็นทุกเรื่องถ้าจะเปลี่ยนปกด้วย</span>
          </div>
        </div>
        {reading && <div className="stat info" data-link-reading><CardIcon kind="info" /><div><b>กำลังอ่านรูปและเทียบชื่อ…</b></div></div>}
        {summary && !reading && (
          <div className="stat ok" data-link-summary><CardIcon kind="ok" /><div>
            <b>อ่านรูป <span className="nw">{COUNT(summary.images)} รูป</span> · จับคู่ได้แน่ <span className="nw">{COUNT(summary.sure)} คู่</span> · ไม่แน่ใจ <span className="nw">{COUNT(summary.unsure)}</span> · หาคู่ไม่เจอ <span className="nw">{COUNT(summary.none)}</span></b>
            รูปแนวตั้ง <span className="nw">{COUNT(summary.tall)} รูป</span> ใช้เป็นปกตั้ง · รูปแนวนอน <span className="nw">{COUNT(summary.wide)} รูป</span> ใช้เป็นปกนอน และครอปเป็นปกตั้งได้ · ใช้เวลา <span className="nw">{summarySec} วินาที</span>
          </div></div>
        )}
        <div className="linkfoot">
          <span className="small">กดดูผลแล้วยังไม่มีอะไรถูกบันทึก ต้องกดยืนยันในตารางก่อน</span>
          <button type="button" className={"btn " + (summary ? "btn-main" : "btn-ghost")} data-link-open onClick={() => setLinkJob({ view: "table" })}>{summary ? `ดูผลจับคู่ ${COUNT(reply.rows.length)} เรื่อง` : "ไปตารางตรวจผล"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ตารางตรวจผล ---------- */
function ReviewTable() {
  const job = useLinkJob();
  const toast = useToast();
  const { movies } = useLibrary();
  const { reply, run } = job;
  const working = run.state === "working";
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const { settings } = useSettings();
  const [crop, setCrop] = useState<{ id: string; orient: "tall" | "wide"; info: PosterInfo; start: CropChoice | null } | null>(null);
  /** เปิดหน้าครอปของช่องนั้น · ช่องยังไม่มีรูป ใช้รูปของอีกช่อง รูปเดียวทำได้ทั้งปกตั้งและปกนอน */
  const openCrop = async (id: string, orient: "tall" | "wide") => {
    const r = getLinkJob().reply.rows.find((x) => x.id === id);
    if (!r) return;
    const pick = (orient === "wide" ? r.wide : r.tall) ?? r.tall ?? r.wide;
    if (!pick) return;
    try {
      const info = await posterApi.open(pick.path, "link");
      const own = orient === "wide" ? r.wide : r.tall;
      const format = (settings?.posterFormat ?? "jpg") as "jpg" | "png";
      setCrop({ id, orient, info, start: own?.geo ? { geo: own.geo, format, quality: settings?.jpgQuality ?? 90, render: null as never } : null });
    } catch (e) {
      toast({ kind: "bad", title: "เปิดรูปไม่ได้", detail: String(e) });
    }
  };

  const rows = reply.rows;
  const counts = useMemo(() => {
    const c = { all: rows.length, sure: 0, manual: 0, unsure: 0, none: 0, saved: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  // แถวจากชั้นวางที่ยังไม่แตะไม่นับ เหมือนฝั่ง Rust (is_waiting)
  const waitingRows = rows.filter((r) => r.status !== "saved" && (r.tall || r.wide) && !(r.via === "shelf" && !r.touched));
  const ticked = waitingRows.filter((r) => r.ticked).length;
  const left = rows.filter((r) => r.status !== "saved" && !r.tall && !r.wide).length;
  // คู่ที่มีรูปแล้วขึ้นก่อน แถวไม่แน่ใจกับหาไม่เจอตามหลัง แบบในมอคอัป · ในกลุ่มเรียงชื่อ ยืนยันแล้วแถวไม่กระโดดที่
  const shown = useMemo(() => {
    const rank = (r: LinkRow) => (r.status === "unsure" ? 1 : r.status === "none" ? 2 : 0);
    const sorted = rows.filter((r) => inTab(r, tab)).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "th"));
    return searchByName(sorted, query, (r) => `${r.title} ${baseName(r.movie)} ${r.tall?.name ?? ""} ${r.wide?.name ?? ""}`);
  }, [rows, tab, query]);

  // มาจากปุ่มบนชั้นวาง เลื่อนไปแถวนั้น
  useEffect(() => {
    if (!job.focus) return;
    setTab("all");
    setQuery("");
    const t = setTimeout(() => {
      const id = job.focus!;
      document.querySelector(`[data-link-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "center" });
      if (job.focusCrop) { const r = getLinkJob().reply.rows.find((x) => x.id === id); if (r?.tall || r?.wide) void openCrop(id, r.tall ? "tall" : "wide"); }
      setLinkJob({ focus: null, focusCrop: false });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.focus]);

  const act = async (fn: () => Promise<{ rows: LinkRow[] } | unknown>, title: string) => {
    try {
      const r = await fn();
      if (r && typeof r === "object" && "rows" in r) setReply(r as never);
    } catch (e) {
      toast({ kind: "bad", title, detail: String(e) });
    }
  };
  const confirm = async (which: string) => {
    const r = await runConfirm(which);
    if (!r) {
      // ล้มทั้งงาน เช่น ดิสก์เต็ม · เดิมแถบหายเงียบ ไม่มีอะไรบอก (ผู้ช่วยตรวจขั้น 8)
      const st = getLinkJob().run;
      toast({ kind: "bad", title: "ยืนยันไม่สำเร็จ", detail: st.state === "failed" ? st.error : "ลองใหม่อีกครั้ง" });
      setReply(await linkApi.state().catch(() => getLinkJob().reply));
      return;
    }
    await reloadImages();
    if (r.failed) toast({ kind: "warn", title: `ยืนยันแล้ว ${COUNT(r.done)} คู่ · ไม่สำเร็จ ${COUNT(r.failed)} คู่`, detail: "แถวที่ไม่สำเร็จยังอยู่ในตารางพร้อมเหตุผล" });
    else if (r.stopped) toast({ kind: "info", title: `หยุดแล้ว · ยืนยันไป ${COUNT(r.done)} คู่`, detail: "คู่ที่เหลือยังรอยืนยันอยู่" });
    else if (r.done) toast({ kind: "ok", title: `ยืนยันแล้ว ${COUNT(r.done)} คู่ · ปกขึ้นชั้นวางแล้ว` });
    r.notes.forEach((n) => toast({ kind: "warn", title: "มีไฟล์ที่ไม่ได้ลบ", detail: n }));
  };

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "all", label: "ทั้งหมด", n: counts.all },
    { id: "sure", label: "จับคู่ได้แน่", n: counts.sure },
    { id: "manual", label: "จับคู่เอง", n: counts.manual },
    { id: "unsure", label: "ไม่แน่ใจ", n: counts.unsure },
    { id: "none", label: "หาคู่ไม่เจอ", n: counts.none },
    ...(counts.saved ? [{ id: "saved" as Tab, label: "บันทึกแล้ว", n: counts.saved }] : []),
  ];

  return (
    <div className="linktable" data-link-table>
      <div className="linkbar">
        <div className="tabs" role="tablist" aria-label="กรองแถว">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={"tabchip" + (tab === t.id ? " on" : "")} data-link-tab={t.id} onClick={() => setTab(t.id)}>{t.label} {COUNT(t.n)}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นชื่อหนังหรือชื่อไฟล์" label="ค้นชื่อหนังหรือชื่อไฟล์" swapLabel={shown.swapped ? shown.used : ""} width={240} />
        <button type="button" className="btn btn-ghost btn-sm" data-link-addmore onClick={() => setLinkJob({ view: "start" })}>เพิ่มรูป</button>
      </div>
      <div className="linkhead" aria-hidden="true"><span /><span>หนังบนชั้นวาง</span><span /><span>รูปที่เลือกให้</span><span>เหตุที่จับคู่</span><span /></div>
      <div className="linkrows" data-link-rows>
        {shown.items.length === 0 ? (
          <div className="empty-search"><div style={{ fontSize: 14 }}>{rows.length === 0 ? "ยังไม่มีคู่ให้ตรวจ ลากโฟลเดอร์รูปมาวางก่อน" : "ไม่มีแถวตามที่เลือก"}</div></div>
        ) : shown.items.map((r) => (
          <RowView key={r.id} r={r} coverThumb={(() => { const m = movies.find((x) => x.id === r.id); return m?.thumb ?? m?.linked?.find((c) => c.orient === "tall")?.thumb ?? m?.linked?.[0]?.thumb ?? null; })()} busy={working} over={job.overRow?.id === r.id ? job.overRow : null} onBoard={() => setLinkJob({ view: "board" })}
            onTick={(v) => act(() => linkApi.update(r.id, { ticked: v }), "ติ๊กไม่สำเร็จ")}
            onChoose={(p) => act(() => linkApi.update(r.id, { choose: p }), "เลือกรูปไม่สำเร็จ")}
            onCrop={() => openCrop(r.id, r.tall ? "tall" : "wide")}
            onChange={async () => { const f = await pickFile("image"); if (f) act(() => linkApi.pair(r.id, [f], "board"), "ใช้รูปนี้ไม่ได้"); }}
            onConfirm={() => confirm(r.id)}
            onSkip={() => act(() => linkApi.update(r.id, { skip: true }), "ข้ามไม่สำเร็จ")}
            onUndo={() => act(() => linkApi.undo(r.id), "ย้อนไม่สำเร็จ")}
            onUnsave={() => act(async () => { const x = await linkApi.unsave(r.id); x.notes.forEach((n) => toast({ kind: "warn", title: "มีไฟล์ที่ไม่ได้ลบ", detail: n })); return x.reply; }, "ยกเลิกไม่สำเร็จ")}
            onResolve={(how) => act(() => linkApi.resolve(r.id, how), "แก้ไม่สำเร็จ")} />
        ))}
      </div>
      <div className="linkfoot" data-link-foot>
        {working ? (
          <div style={{ flex: 1, minWidth: 0 }} data-link-progress>
            <div className="small" style={{ marginBottom: 4 }}>กำลังยืนยัน{run.progress?.title ? ` · ${run.progress.title}` : ""}{run.progress ? <> · <span className="nw">{COUNT(run.progress.done)} จาก {COUNT(run.progress.total)} คู่</span></> : null}</div>
            <div className="bar"><i style={{ width: `${run.progress ? (run.progress.done / Math.max(1, run.progress.total)) * 100 : 0}%` }} /></div>
          </div>
        ) : (
          <span className="small" style={{ flex: 1, minWidth: 0 }} data-link-count>
            บันทึกแล้ว <span className="nw">{COUNT(counts.saved)} คู่</span> · รอยืนยัน <span className="nw">{COUNT(waitingRows.length)} คู่</span> ติ๊กไว้ <span className="nw">{COUNT(ticked)} คู่</span> (โปรแกรมจำไว้ ปิดแล้วเปิดมาทำต่อได้) · ยืนยันทั้งหมด ไม่รวมแถวไม่แน่ใจที่ยังไม่ได้กดเลือกรูป กับแถวที่หาคู่ไม่เจอ · รูปต้นฉบับไม่ถูกแก้ ไฟล์หนังไม่ถูกแตะ
          </span>
        )}
        <span className="row8" style={{ flexWrap: "nowrap" }}>
          {working ? (
            <button type="button" className="btn btn-ghost" data-link-stop onClick={() => linkApi.cancel()}>หยุด</button>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" data-link-goboard onClick={() => setLinkJob({ view: "board" })}>ไปกระดาน ({COUNT(left)} ที่เหลือ)</button>
              <button type="button" className={"btn " + (ticked ? "btn-ghost" : "btn-wait")} aria-disabled={!ticked || undefined} data-link-confirm-ticked onClick={() => { if (ticked) confirm("ticked"); }}>ยืนยัน {COUNT(ticked)} คู่ที่ติ๊กไว้</button>
              <button type="button" className={"btn " + (waitingRows.length ? "btn-main" : "btn-wait")} aria-disabled={!waitingRows.length || undefined} data-link-confirm-all onClick={() => { if (waitingRows.length) confirm("all"); }}>ยืนยันทั้งหมด {COUNT(waitingRows.length)} คู่</button>
            </>
          )}
        </span>
      </div>
      {crop && (
        <CropDialog key={crop.id + crop.orient + crop.info.path} info={crop.info} start={crop.start} target="link"
          defaultFormat={(settings?.posterFormat ?? "jpg") as "jpg" | "png"} defaultQuality={settings?.jpgQuality ?? 90}
          link={{ movie: rows.find((r) => r.id === crop.id)?.title ?? "", orient: crop.orient, onOrient: async (o, keep) => {
            if (keep) await act(() => linkApi.setCrop(crop.id, crop.orient, keep.geo), "จำค่าครอปไม่สำเร็จ");
            await openCrop(crop.id, o);
          } }}
          onCancel={() => { setCrop(null); posterApi.clear("link").catch(() => {}); }}
          onChangeImage={async () => { const id = crop.id; setCrop(null); posterApi.clear("link").catch(() => {}); const f = await pickFile("image"); if (f) act(() => linkApi.pair(id, [f], "board"), "ใช้รูปนี้ไม่ได้"); }}
          onUse={(c) => { const { id, orient } = crop; setCrop(null); posterApi.clear("link").catch(() => {}); act(() => linkApi.setCrop(id, orient, c.geo), "จำค่าครอปไม่สำเร็จ"); }} />
      )}
    </div>
  );
}

function Thumb({ p, wide }: { p: LinkPick | null; wide?: boolean }) {
  const src = thumbUrl(p?.cropThumb ?? thumbOf(p));
  return src ? <img className={"lthumb" + (wide ? " wide" : "")} src={src} alt="" loading="lazy" draggable={false} /> : <span className={"lthumb none" + (wide ? " wide" : "")} />;
}

function RowView(p: {
  r: LinkRow; coverThumb: string | null; busy: boolean; over: { names: string; bad: boolean } | null; onBoard: () => void;
  onTick: (v: boolean) => void; onChoose: (path: string) => void; onCrop: () => void; onChange: () => void; onConfirm: () => void; onSkip: () => void; onUndo: () => void; onUnsave: () => void; onResolve: (how: "use" | "app") => void;
}) {
  const { r } = p;
  const has = !!(r.tall || r.wide);
  const main = r.tall ?? r.wide;
  const second = r.wide && r.tall && (r.wide.path !== r.tall.path || r.wide.geo) ? r.wide : null;
  const saved = r.status === "saved";
  const pillText = saved ? r.reason : r.reason;
  /** ระหว่างยืนยัน ห้ามแก้แถว ฝั่ง Rust กันอยู่แล้ว ปุ่มต้องบอกตั้งแต่บนจอ */
  const g = (f: () => void) => () => { if (!p.busy) f(); };
  const dis = { "aria-disabled": p.busy || undefined, title: p.busy ? "กำลังยืนยันอยู่ รอให้เสร็จก่อน" : undefined };
  const ghost = "btn btn-sm " + (p.busy ? "btn-wait" : "btn-ghost");
  return (
    <div className={"lkrow " + r.status + (p.over ? " over" + (p.over.bad ? " bad" : "") : "")} data-link-row={r.id} data-link-status={r.status}>
      <div>
        {saved ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2f7a52" strokeWidth="2.6" aria-label="บันทึกแล้ว"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          : <button type="button" role="checkbox" aria-checked={r.ticked} aria-label={"ติ๊กเลือก " + r.title} aria-disabled={!has || p.busy || undefined} className={"cbx " + (r.ticked ? "on" : "off")} data-link-tick
              onClick={() => { if (has && !p.busy) p.onTick(!r.ticked); }}>{r.ticked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</button>}
      </div>
      <div className="lpick">
        {p.coverThumb ? <img className="lthumb" src={thumbUrl(p.coverThumb) ?? undefined} alt="ปกที่เรื่องนี้มีอยู่" loading="lazy" draggable={false} /> : <span className="lthumb none">ไม่มีปก</span>}
        <div className="lname"><b>{r.title}</b><span className="fn" title={r.movie}>{baseName(r.movie)}</span></div>
      </div>
      <div className="larrow" aria-hidden="true">→</div>
      <div>
        {has ? (
          <div className="lpick" data-link-chosen>
            <Thumb p={main} wide={!r.tall} />
            {second && <Thumb p={second} wide />}
            <div className="lname">
              <span className="fn" title={main!.path}>{main!.name}</span>
              <span className="small">{main!.folder ? <span title={main!.folder}>{main!.folder} · </span> : null}<span className="nw">{main!.width} × {main!.height}</span> · {r.tall && !r.derivedTall ? "ปกตั้ง" : "ปกนอน"}{second ? " · มีปกนอนด้วย" : ""}</span>
              {r.derivedTall && <span className="small">ครอปเป็นปกตั้งให้แล้ว</span>}
              {(r.tall?.geo || r.wide?.geo) && !r.derivedTall && <span className="small" data-link-cropped>ครอปแล้ว</span>}
            </div>
          </div>
        ) : null}
        {r.candidates.length > 0 && !saved && (
          <>
            {!has && <div className="small" style={{ color: "var(--warn-ink)" }}>ชื่อใกล้เคียง {r.candidates.length} รูป กดรูปที่ใช่</div>}
            <div className="lsugg" data-link-cands style={has ? { marginTop: 6 } : undefined}>
              {r.candidates.map((c) => (
                <button key={c.path} type="button" className={"lcand" + (main?.path === c.path ? " sel" : "")} title={c.name} aria-label={"ใช้รูป " + c.name} aria-pressed={main?.path === c.path} data-link-cand={c.name} onClick={() => p.onChoose(c.path)}><Thumb p={c} /></button>
              ))}
            </div>
          </>
        )}
        {!has && r.candidates.length === 0 && <span className="small" style={{ color: "var(--bad-ink)" }}>ไม่มีรูปชื่อใกล้เคียง · <button type="button" className="addbtn" style={{ color: "inherit" }} data-link-row-board onClick={g(p.onBoard)}>ไปจับคู่เองที่กระดาน</button> หรือลากรูปมาวางบนแถวนี้</span>}
        {p.over && <div className={"hint" + (p.over.bad ? " e" : "")} style={{ marginTop: 6 }} data-link-over>{p.over.bad ? "ไฟล์นี้ไม่ใช่รูป ไม่รับ" : `ปล่อยเมาส์ ใช้รูป ${p.over.names}`}</div>}
        {r.error && (
          <div className="hint e" role="alert" style={{ marginTop: 6 }} data-link-error>{r.error}
            {r.conflict && <span className="row8" style={{ marginTop: 6 }}>
              <button type="button" className={ghost} {...dis} data-link-use onClick={g(() => p.onResolve("use"))}>ใช้ไฟล์ที่มีอยู่</button>
              <button type="button" className={ghost} {...dis} data-link-toapp onClick={g(() => p.onResolve("app"))}>เก็บในโปรแกรมแทน</button>
            </span>}
          </div>
        )}
      </div>
      <div><span className={"pill " + PILL[r.status]} data-link-reason style={{ whiteSpace: "normal" }}>{pillText}</span></div>
      <div className="lacts">
        {saved ? (
          <><span className="pill p-ok">บันทึกแล้ว</span><button type="button" className={ghost} {...dis} data-link-unsave onClick={g(p.onUnsave)}>ยกเลิก</button></>
        ) : (
          <>
            {has && <button type="button" className={ghost} {...dis} data-link-crop onClick={g(p.onCrop)}>ครอป</button>}
            {has && <button type="button" className={ghost} {...dis} data-link-change onClick={g(p.onChange)}>เปลี่ยนรูป</button>}
            {!has && <button type="button" className={ghost} {...dis} data-link-change onClick={g(p.onChange)}>เลือกรูป</button>}
            {!!r.prev && <button type="button" className={ghost} {...dis} data-link-undo onClick={g(p.onUndo)}>ย้อน</button>}
            {r.status === "unsure" && !has && <button type="button" className={ghost} {...dis} data-link-skip onClick={g(p.onSkip)}>ข้ามเรื่องนี้</button>}
            {r.via === "shelf" && <button type="button" className={ghost} aria-disabled={p.busy || undefined} data-link-skip title={p.busy ? dis.title : "ปกบนชั้นวางคงเดิม ไม่มีอะไรถูกเขียน"} onClick={g(p.onSkip)}>เลิกแก้</button>}
            {has && <button type="button" className={"btn btn-sm " + (p.busy ? "btn-wait" : "btn-ok")} aria-disabled={p.busy || undefined} data-link-confirm onClick={() => { if (!p.busy) p.onConfirm(); }}>{r.status === "unsure" ? "ยืนยันรูปที่เลือก" : "ยืนยัน"}</button>}
          </>
        )}
      </div>
    </div>
  );
}
