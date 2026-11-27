/* ตารางตรวจผลของหน้าจับคู่ปก ที่เดียวที่เปลี่ยนรูป ครอป ยืนยัน (แยกจาก LinkPage.tsx BUGS ข้อ 161 ชุด 3) */
import { useEffect, useMemo, useState } from "react";
import { Keep } from "../../components/ui";
import SearchBox from "../../components/SearchBox";
import CropDialog, { type CropChoice } from "../../components/CropDialog";
import { useSettings } from "../../lib/settings";
import { useToast } from "../../components/Toasts";
import { useLibrary } from "../../lib/library";
import { linkApi, pickFile, posterApi, type PosterInfo, type LinkRow } from "../../lib/api/index";
import { searchByName } from "../../lib/thaiSearch";
import { getLinkJob, reloadImages, runConfirm, setLinkJob, setReply, useLinkJob } from "../../lib/linkJob";
import { IcPlus } from "../../components/icons";
import { IbStop, IcLink, IbTick, IbTrash } from "../../components/icons";
import Dialog from "../../components/Dialog";
import { COUNT, baseName, inTab, type Tab } from "./linkUtil";
import { RowView } from "./RowView";

/* ---------- ตารางตรวจผล ---------- */
export default function ReviewTable() {
  const job = useLinkJob();
  const toast = useToast();
  const { movies } = useLibrary();
  // เลขหนังไปภาพปกที่มีอยู่ ทำครั้งเดียวต่อคลัง เดิมทุกแถวค้นทั้งคลังทุกครั้งที่วาด หนังพันเรื่องกับภาพเล็กทยอยเสร็จช้ามาก (AUDIT ข้อ 69)
  const coverOf = useMemo(() => new Map(movies.map((m) => [m.id, m.thumb ?? m.linked?.find((c) => c.orient === "tall")?.thumb ?? m.linked?.[0]?.thumb ?? null])), [movies]);
  const { reply, run } = job;
  const working = run.state === "working";
  // กำลังอ่านรูปเพื่อจับคู่ แถวแก้ไม่ได้จนอ่านเสร็จ (AUDIT 12 พ.ย. 2569 ข้อ 10)
  const reading = job.reading && !working;
  // กดหยุดแล้วบอกว่ารับคำสั่ง ปุ่มกดซ้ำไม่ได้จนงานจบ (AUDIT ข้อ 70)
  const [stopping, setStopping] = useState(false);
  useEffect(() => { if (!working) setStopping(false); }, [working]);
  const busyWhy = working ? "กำลังยืนยันอยู่ รอให้เสร็จก่อน" : reading ? "กำลังอ่านรูปเพื่อจับคู่อยู่ รอให้เสร็จก่อน" : "";
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

  // ปุ่มเอาปกออกในแถวที่บันทึกแล้ว ถามก่อนเสมอ (AUDIT 12 พ.ย. 2569 ข้อ 13 · เดิมปุ่มชื่อยกเลิก กดแล้วเอาปกออกทันทีโดยไม่ถาม)
  const [askOut, setAskOut] = useState<{ id: string; title: string } | null>(null);
  /** แถวที่กำลังจำค่าครอป (AUDIT ข้อ 9) */
  const [cropping, setCropping] = useState<string[]>([]);
  const [outBusy, setOutBusy] = useState(false);
  const doOut = async () => {
    if (!askOut || outBusy) return;
    setOutBusy(true);
    await act(async () => { const x = await linkApi.unsave(askOut.id); x.notes.forEach((n) => toast({ kind: "warn", title: "มีไฟล์ที่ไม่ได้ลบ", detail: n })); return x.reply; }, "เอาปกออกไม่สำเร็จ");
    setOutBusy(false);
    setAskOut(null);
  };
  const act = async (fn: () => Promise<{ rows: LinkRow[] } | unknown>, title: string) => {
    try {
      const r = await fn();
      if (r && typeof r === "object" && "rows" in r) setReply(r as never);
    } catch (e) {
      toast({ kind: "bad", title, detail: String(e) });
    }
  };
  const confirm = async (which: string) => {
    if (cropping.length) { toast({ kind: "warn", ms: 6000, key: "link-busy", title: "กำลังจำค่าครอป", detail: "รอให้เสร็จก่อน แล้วค่อยกดยืนยัน" }); return; }
    const r = await runConfirm(which);
    if (!r) {
      // ล้มทั้งงาน เช่น ดิสก์เต็ม · เดิมแถบหายเงียบ ไม่มีอะไรบอก (ผู้ช่วยตรวจขั้น 8)
      const st = getLinkJob().run;
      toast({ kind: "bad", title: "ยืนยันไม่สำเร็จ", detail: st.state === "failed" ? st.error : "ลองใหม่อีกครั้ง" });
      setReply(await linkApi.state().catch(() => getLinkJob().reply));
      return;
    }
    await reloadImages();
    if (r.failed) toast({ kind: "warn", title: `ยืนยันแล้ว ${COUNT(r.done)} คู่ และไม่สำเร็จ ${COUNT(r.failed)} คู่`, detail: "แถวที่ไม่สำเร็จยังอยู่ในตารางพร้อมเหตุผล" });
    else if (r.stopped) toast({ kind: "info", ms: 6000, title: `หยุดแล้ว ยืนยันไป ${COUNT(r.done)} คู่`, detail: "คู่ที่เหลือยังรอยืนยันอยู่" });
    else if (r.done) toast({ kind: "ok", title: `ยืนยันแล้ว ${COUNT(r.done)} คู่ และปกขึ้นชั้นวางแล้ว` });
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
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={"tabchip" + (tab === t.id ? " on" : "")} data-link-tab={t.id} onClick={() => setTab(t.id)}><Keep all={[`${t.label} 000`]}>{t.label} {COUNT(t.n)}</Keep></button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นชื่อหนังหรือชื่อไฟล์" label="ค้นชื่อหนังหรือชื่อไฟล์" swapLabel={shown.swapped ? shown.used : ""} width={240} />
        <button type="button" className="btn btn-ghost btn-sm" data-link-addmore onClick={() => setLinkJob({ view: "start" })}><IcPlus size={15} />เพิ่มรูป</button>
      </div>
      <div className="linkhead" aria-hidden="true"><span /><span>หนังบนชั้นวาง</span><span /><span>รูปที่เลือกให้</span><span>เหตุที่จับคู่</span><span /></div>
      <div className="linkrows" data-link-rows>
        {shown.items.length === 0 ? (
          <div className="empty-search"><div style={{ fontSize: 14 }}>{rows.length === 0 ? "ยังไม่มีคู่ให้ตรวจ ลากโฟลเดอร์รูปมาวางก่อน" : "ไม่มีแถวตามที่เลือก"}</div></div>
        ) : shown.items.map((r) => (
          <RowView key={r.id} r={r} coverThumb={coverOf.get(r.id) ?? null} busy={working || reading} busyWhy={busyWhy} cropping={cropping.includes(r.id)} over={job.overRow?.id === r.id ? job.overRow : null} onBoard={() => setLinkJob({ view: "board" })}
            onTick={(v) => act(() => linkApi.update(r.id, { ticked: v }), "ติ๊กไม่สำเร็จ")}
            onChoose={(p) => act(() => linkApi.update(r.id, { choose: p }), "เลือกรูปไม่สำเร็จ")}
            onCrop={() => openCrop(r.id, r.tall ? "tall" : "wide")}
            onChange={async () => { const f = await pickFile("image"); if (f) act(() => linkApi.pair(r.id, [f], "board"), "ใช้รูปนี้ไม่ได้"); }}
            onConfirm={() => confirm(r.id)}
            onSkip={() => act(() => linkApi.update(r.id, { skip: true }), "ข้ามไม่สำเร็จ")}
            onUndo={() => act(() => linkApi.undo(r.id), "ย้อนไม่สำเร็จ")}
            onUnsave={() => setAskOut({ id: r.id, title: r.title })}
            onResolve={(how) => act(() => linkApi.resolve(r.id, how), "แก้ไม่สำเร็จ")} />
        ))}
      </div>
      <div className="linkfoot" data-link-foot>
        {working ? (
          <div style={{ flex: 1, minWidth: 0 }} data-link-progress>
            <div className="small" style={{ marginBottom: 4 }}>กำลังยืนยัน{run.progress?.title ? ` ${run.progress.title}` : ""}{run.progress ? <> <span className="nw">({COUNT(run.progress.done)} จาก {COUNT(run.progress.total)} คู่)</span></> : null}</div>
            <div className="bar"><i style={{ width: `${run.progress ? (run.progress.done / Math.max(1, run.progress.total)) * 100 : 0}%` }} /></div>
          </div>
        ) : (
          reading ? <span className="small" style={{ flex: 1, minWidth: 0 }} data-link-reading-table>กำลังอ่านรูปเพื่อจับคู่ แถวในตารางแก้ได้อีกครั้งเมื่ออ่านเสร็จ</span> :
          <span className="small" style={{ flex: 1, minWidth: 0 }} title="รูปต้นฉบับไม่ถูกแก้ ไฟล์หนังไม่ถูกแตะ" data-link-count>
            บันทึกแล้ว <span className="nw">{COUNT(counts.saved)} คู่</span> รอยืนยัน <span className="nw">{COUNT(waitingRows.length)} คู่</span> และติ๊กไว้ <span className="nw">{COUNT(ticked)} คู่</span> ปิดโปรแกรมแล้วกลับมาทำต่อได้
          </span>
        )}
        <span className="row8" style={{ flexWrap: "nowrap" }}>
          {working ? (
            <button type="button" className={"btn " + (stopping ? "btn-wait" : "btn-ghost")} aria-disabled={stopping || undefined} title={stopping ? "คู่ที่ทำอยู่ต้องทำให้จบก่อน แล้วจะหยุดเอง" : undefined} data-link-stop
              onClick={() => { if (stopping) return; setStopping(true); void linkApi.cancel(); }}><Keep icon={<IbStop size={15} />} all={["หยุด", "กำลังหยุดหลังคู่นี้…"]}>{stopping ? "กำลังหยุดหลังคู่นี้…" : "หยุด"}</Keep></button>
          ) : (
            <>
              <button type="button" className={"btn " + (reading ? "btn-wait" : "btn-ghost")} aria-disabled={reading || undefined} title={reading ? busyWhy : undefined} data-link-goboard onClick={() => { if (!reading) setLinkJob({ view: "board" }); }}><Keep icon={<IcLink size={15} />} all={["ไปกระดาน (000 ที่เหลือ)"]}>ไปกระดาน ({COUNT(left)} ที่เหลือ)</Keep></button>
              <button type="button" className={"btn " + (ticked && !reading ? "btn-ghost" : "btn-wait")} aria-disabled={!ticked || reading || undefined} title={reading ? busyWhy : !ticked ? "ยังไม่ได้ติ๊กแถวไหน ติ๊กช่องหน้าแถวที่จะยืนยันก่อน" : undefined} data-link-confirm-ticked onClick={() => { if (ticked && !reading) confirm("ticked"); }}><Keep icon={<IbTick size={15} />} all={["ยืนยัน 000 คู่ที่ติ๊กไว้"]}>ยืนยัน {COUNT(ticked)} คู่ที่ติ๊กไว้</Keep></button>
              <button type="button" className={"btn " + (waitingRows.length && !reading ? "btn-main" : "btn-wait")} aria-disabled={!waitingRows.length || reading || undefined} title={reading ? busyWhy : "ไม่รวมแถวไม่แน่ใจที่ยังไม่ได้เลือกรูป กับแถวที่หาคู่ไม่เจอ"} data-link-confirm-all onClick={() => { if (waitingRows.length && !reading) confirm("all"); }}><Keep icon={<IbTick size={15} />} all={["ยืนยันทั้งหมด 000 คู่"]}>ยืนยันทั้งหมด {COUNT(waitingRows.length)} คู่</Keep></button>
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
          onPickImage={async (f) => { const { id, orient } = crop; setCrop(null); posterApi.clear("link").catch(() => {}); await act(() => linkApi.pair(id, [f], "board"), "ใช้รูปนี้ไม่ได้"); openCrop(id, orient); }}
          onUse={async (c) => {
            const { id, orient } = crop; setCrop(null); posterApi.clear("link").catch(() => {});
            // รอจำค่าครอปให้เสร็จ ระหว่างนั้นปุ่มยืนยันของแถวนี้กดไม่ได้ (AUDIT 12 พ.ย. 2569 ข้อ 9 · เดิมกดยืนยันแซงได้ ปกที่เขียนเป็นแบบก่อนครอป)
            setCropping((s) => [...s, id]);
            try { await act(() => linkApi.setCrop(id, orient, c.geo), "จำค่าครอปไม่สำเร็จ"); } finally { setCropping((s) => s.filter((x) => x !== id)); }
          }} />
      )}
      <Dialog open={!!askOut} onClose={() => { if (!outBusy) setAskOut(null); }} kind="work" confirm width={540} title={<>เอาปกจับคู่ของ {askOut?.title ?? ""} ออก</>}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => { if (!outBusy) setAskOut(null); }}>ไม่เอาออก</button>
          <button type="button" className={"btn " + (outBusy ? "btn-wait" : "btn-bad")} aria-disabled={outBusy || undefined} data-link-unsave-ok onClick={doOut}><Keep icon={<IbTrash size={15} />} all={["กำลังเอาออก…", "เอาปกออก"]}>{outBusy ? "กำลังเอาออก…" : "เอาปกออก"}</Keep></button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }} data-link-unsave-text>
          {/* สองประโยค ประโยคละบรรทัด สิ่งที่จะเกิด กับสิ่งที่ไม่ถูกแตะ (พี่กันทัก 15 พ.ย. 2569 "แบ่งแปลกๆ" ตอนเป็นสามบรรทัดยาวไม่เท่ากัน) */}
          <div>ปกนี้จะหายจากชั้นวาง และรูปที่โปรแกรมทำไว้จะย้ายลงถังขยะซึ่งกู้คืนได้</div>
          <div>รูปต้นฉบับกับไฟล์หนังไม่ถูกแตะ แต่ปกที่เรื่องนี้มีก่อนยืนยันจะไม่กลับมา</div>
        </div>
      </Dialog>
    </div>
  );
}
