/* หน้าจับคู่ปก (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
   ขั้นแรก ลากโฟลเดอร์รูปมาวาง เลือกขอบเขต โปรแกรมจับคู่ให้ บอกผลรวมก่อนเปิดตาราง
   ตารางตรวจผล ที่เดียวที่เปลี่ยนรูป ครอป ยืนยัน · ทุกวิธีจับคู่มาจบที่นี่ (พี่กันสั่ง 8 พ.ย. 2569 *"ถ้าจับคู่ เเล้ว เเม้จะช้วิธีไหนก็ตาม มันจะมาหน้านี้"*)
   ยืนยันทีละเรื่อง ที่ติ๊กไว้ หรือทั้งหมด · ยังไม่ยืนยันไม่มีอะไรถูกบันทึก คู่ที่รออยู่โปรแกรมจำไว้
   แถววาดด้วย content-visibility แถวนอกจอไม่กินเวลาวาด ร้อยแถวเลื่อนลื่น */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageActiveRef } from "../../lib/pageActive";
import { CardIcon, Phr, Seg, dropClick } from "../../components/ui";
import LinkBoard from "./LinkBoard";
import { useToast } from "../../components/Toasts";
import { useLibrary } from "../../lib/library";
import { inApp, linkApi, pickFile, pickFolder, type AutoSummary } from "../../lib/api/index";
import { getLinkJob, reloadImages, setLinkJob, setReply, useLinkJob } from "../../lib/linkJob";
import "../../styles/link.css";
import { IcPoster, IcFolder } from "../../components/icons";
import { IbEye } from "../../components/icons";

import { COUNT, baseName, isImagePath } from "./linkUtil";
import ReviewTable from "./ReviewTable";

export default function LinkPage() {
  const job = useLinkJob();
  const toast = useToast();
  const { reply, view } = job;
  const [summary, setSummary] = useState<AutoSummary | null>(null);
  // กำลังอ่านรูปอยู่ในสถานะกลาง ตารางตรวจผลเห็นด้วย (AUDIT ข้อ 10)
  const reading = job.reading;
  const setReading = (v: boolean) => setLinkJob({ reading: v });
  const [summarySec, setSummarySec] = useState(0);
  const { movies } = useLibrary();
  // ไม่นับเรื่องที่ไดรฟ์ถอดออกอยู่ ตัวจับคู่ฝั่ง Rust ข้ามเรื่องพวกนี้ (AUDIT ข้อ 75)
  const nocover = movies.filter((m) => !m.missing && !m.hasCover && !m.linked?.length).length;
  const [over, setOver] = useState(false);
  const [badDrop, setBadDrop] = useState<string | null>(null);

  useEffect(() => { reloadImages().catch(() => {}); setLinkJob({ resume: false }); }, []);

  // มีคู่ค้างอยู่แล้ว เปิดหน้ามาเจอตารางเลย ไม่ต้องลากรูปใหม่
  useEffect(() => {
    const j = getLinkJob();
    if (j.view === "start" && j.reply.rows.length > 0) setLinkJob({ view: "table" });
  }, []);

  const runAuto = useCallback(async (scope: "nocover" | "all") => {
    if (getLinkJob().reading) return;
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
    const next = id ? { id, names: imgs.map(baseName).join(", "), bad: dragPaths.current.length > 0 && imgs.length === 0 } : null;
    const cur = getLinkJob().overRow;
    if (cur?.id !== next?.id || cur?.names !== next?.names || cur?.bad !== next?.bad) setLinkJob({ overRow: next });
  }, []);
  const handleDrop = useCallback(async (paths: string[], x: number, y: number) => {
    setOver(false);
    setLinkJob({ overRow: null });
    dragPaths.current = [];
    if (!paths.length) return;
    // ระหว่างอ่านรูปเพื่อจับคู่ ไม่รับไฟล์ ผลของงานที่อ่านอยู่จะทับสิ่งที่แก้ (AUDIT ข้อ 10)
    if (getLinkJob().reading) { toast({ kind: "warn", ms: 6000, key: "link-drop", title: "กำลังอ่านรูปเพื่อจับคู่อยู่ รอให้เสร็จก่อน", detail: "อ่านเสร็จแล้วค่อยลากรูปมาวางอีกครั้ง" }); return; }
    const id = rowAt(x, y);
    if (id) {
      // รูปปนไฟล์อื่น รับเฉพาะรูป บอกว่าข้ามอะไร · ไฟล์ที่ไม่ใช่รูปล้วน ส่งไปให้ฝั่ง Rust ปฏิเสธพร้อมเหตุผล
      const imgs = paths.filter(isImagePath);
      try {
        setReply(await linkApi.pair(id, imgs.length ? imgs : paths, "explorer"));
        if (imgs.length && imgs.length < paths.length) toast({ kind: "warn", ms: 6000, key: "link-drop", title: "ข้ามไฟล์ที่ไม่ใช่รูป", detail: paths.filter((p) => !isImagePath(p)).map(baseName).join(", ") });
      } catch (e) { toast({ kind: "bad", title: "ใช้ไฟล์นี้ไม่ได้", detail: String(e) }); }
      return;
    }
    // ในตาราง วางไม่โดนแถว ไม่เอาไปเพิ่มเป็นแหล่งรูปแล้วจับคู่ใหม่ทั้งชุดเงียบ ๆ บอกให้วางบนแถว (AUDIT 12 พ.ย. 2569 ข้อ 12)
    if (getLinkJob().view === "table") {
      if (!paths.some(isImagePath)) { toast({ kind: "warn", ms: 6000, key: "link-drop", title: "ไฟล์ที่ลากมาไม่ใช่รูป", detail: "รับเฉพาะรูป JPG PNG WebP BMP TIFF และ HEIC" }); return; }
      toast({ kind: "warn", ms: 6000, key: "link-drop", title: "วางรูปบนแถวของเรื่องที่ต้องการ", detail: "รูปที่วางนอกแถวยังไม่ถูกใช้ ถ้าต้องการเพิ่มเป็นแหล่งรูปเพื่อจับคู่ใหม่ กดปุ่มเพิ่มรูปด้านบน" });
      return;
    }
    addPaths(paths);
  }, [addPaths, toast]);
  const pageOn = usePageActiveRef();
  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    let live = true;
    import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((e) => {
      if (!pageOn.current) return; // หน้านี้ซ่อนอยู่ (ไปเมนูอื่นแล้ว) ไม่รับไฟล์ที่ลากมา (BUGS ข้อ 9)
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
    // ตั้งหน้าจอเป็นกำลังอ่านรูป ไม่ต้องรอโฟลเดอร์รูปใหญ่ (AUDIT ข้อ 10 · ตัวตรวจคืนเป็น false ตอนจบ)
    w.__linkReading = (v: boolean) => setLinkJob({ reading: v });
    return () => { delete w.__linkDrop; delete w.__linkHover; delete w.__linkReading; };
  }, [handleDrop, hoverRow]);

  if (view === "board") return <LinkBoard />;
  if (view === "table") return <ReviewTable />;
  return (
    <div className="pagewrap" data-link-page>
      <div className="wrapin">
        <div className="card">
          <h3><span className="step">1</span>รูปที่จะเอามาจับคู่</h3>
          <div className={"drop" + (reading ? " wait" : over ? " over" : badDrop ? " bad" : "")} style={{ minHeight: 130 }} data-link-drop aria-disabled={reading || undefined} onClick={dropClick(async () => { if (reading) return; const d = await pickFolder("เลือกโฟลเดอร์รูป"); if (d) addPaths([d]); })}>
            {reading ? <b>กำลังอ่านรูปเพื่อจับคู่ อ่านเสร็จแล้วค่อยเพิ่มรูปอีก</b>
              : over ? <b>ปล่อยเมาส์เพื่อเพิ่มรูป</b>
              : badDrop ? <><b><Phr>{badDrop}</Phr></b></>
              : <><b style={{ color: "var(--txt2)" }}>ลากโฟลเดอร์รูป หรือรูปหลายรูปมาวางตรงนี้</b><div><Phr>รับ JPG PNG WebP BMP TIFF และ HEIC รวมถึงรูปในโฟลเดอร์ย่อย โดยรูปต้นฉบับไม่ถูกแก้</Phr></div></>}
            <div className="row8" style={{ justifyContent: "center" }}>
              <button type="button" className={"btn btn-sm " + (reading ? "btn-wait" : "btn-ghost")} aria-disabled={reading || undefined} title={reading ? "กำลังอ่านรูปเพื่อจับคู่อยู่ รอให้เสร็จก่อน" : undefined} data-link-pick onClick={async () => { if (reading) return; const d = await pickFolder("เลือกโฟลเดอร์รูป"); if (d) addPaths([d]); }}><IcFolder size={15} />เลือกโฟลเดอร์</button>
              <button type="button" className={"btn btn-sm " + (reading ? "btn-wait" : "btn-ghost")} aria-disabled={reading || undefined} title={reading ? "กำลังอ่านรูปเพื่อจับคู่อยู่ รอให้เสร็จก่อน" : undefined} data-link-pickimg onClick={async () => { if (reading) return; const f = await pickFile("image"); if (f) addPaths([f]); }}><IcPoster size={15} />เลือกรูป</button>
            </div>
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
            <span className="small"><Phr>เรื่องที่มีปกในไฟล์อยู่แล้วจะข้ามให้ ถ้าจะเปลี่ยนปกด้วยให้เลือกทุกเรื่อง</Phr></span>
          </div>
        </div>
        {/* การ์ดสรุปอยู่ที่เดิมระหว่างอ่านใหม่ ไม่หายแล้วกลับมา หน้าจึงไม่ขยับ · ขึ้นการ์ดกำลังอ่านเฉพาะรอบแรก */}
        {reading && !summary && <div className="stat info" data-link-reading><CardIcon kind="info" /><div><b>กำลังอ่านรูปและเทียบชื่อ…</b></div></div>}
        {summary && (
          <div className="stat ok" data-link-summary><CardIcon kind="ok" /><div>
            <b>อ่านรูป <span className="nw">{COUNT(summary.images)} รูป</span> จับคู่ได้แน่ <span className="nw">{COUNT(summary.sure)} คู่</span> ไม่แน่ใจ <span className="nw">{COUNT(summary.unsure)} เรื่อง</span> และหาคู่ไม่เจอ <span className="nw">{COUNT(summary.none)} เรื่อง</span></b>
            รูปแนวตั้ง <span className="nw">{COUNT(summary.tall)} รูป</span> ใช้เป็นปกตั้ง ส่วนรูปแนวนอน <span className="nw">{COUNT(summary.wide)} รูป</span> ใช้เป็นปกนอนและครอปเป็นปกตั้งได้ ใช้เวลา <span className="nw">{summarySec} วินาที</span>
          </div></div>
        )}
        <div className="linkfoot">
          <span className="small">กดดูผลแล้วยังไม่มีอะไรถูกบันทึก ต้องกดยืนยันในตารางก่อน</span>
          <button type="button" className={"btn " + (summary ? "btn-main" : "btn-ghost")} data-link-open onClick={() => setLinkJob({ view: "table" })}><IbEye size={15} />{summary ? `ดูผลจับคู่ ${COUNT(reply.rows.length)} เรื่อง` : "ไปตารางตรวจผล"}</button>
        </div>
      </div>
    </div>
  );
}

