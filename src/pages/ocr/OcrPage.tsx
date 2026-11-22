/* หน้า OCR ซับรูป (แผน OCR ขั้น 11 · BUGS ข้อ 143) ยกโครงจากมอคอัป src/mockups/ocr/OcrMock.tsx ที่พี่กันไล่แก้แล้ว ต่อกับตัวคุมงานจริง (lib/ocrJob.ts ocrjob.rs)
   ไอเดียจากหน้าต่าง OCR ของ Subtitle Edit แถวเลือกตัวอ่านบนสุด ตารางเลข เวลา ภาพ ข้อความ ช่องแก้ข้อความ รายการจุดที่ต้องตรวจ แถบความคืบหน้ากับปุ่มเริ่ม หยุดชั่วคราว
   ของที่ชั้นหนังเพิ่ม ระบบชี้จุดสงสัย (㉝) ตัวช่วยตรวจ ป้ายตำแหน่งบนจอ (⑭) ตรวจทานแบบทีละจุด (⑤ พี่กันเคาะให้มีทั้งสองแบบ สลับได้ จำแบบล่าสุด)
   อ่านอย่างเดียว ไฟล์หนังและไฟล์ซับไม่ถูกแตะ */
import { useEffect, useMemo, useRef, useState } from "react";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Seg, Skel, Switch } from "../../components/ui";
import { IbCrop, IbNext, IbPlay, IbStop, IbTable, IbWand, IcRefresh, IcSearch, IcSettings, IcFile, IcPalette, IcExtract, IcClose } from "../../components/icons";
import { infoApi, ocrApi, pickFile, subApi, type OcrDbList, type OcrTessLang } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";
import { clearWordErr, fillRows, importRowText, getOcrJob, ocrElapsed, removeRows, openSource, pauseOcr, resumeOcr, rowReasons, startOcr, stopOcr, useOcrJob } from "../../lib/ocrJob";
import { OcrDialogs, type OcrDlg } from "./OcrDialogs";
import { InspectDialog } from "./OcrInspectDialog";
import { VobColorDialog, storedVobColors } from "./OcrVobColorDialog";
import { ExportDialog, expRows, loadExpFormats } from "./OcrExportDialog";
import Dialog from "../../components/Dialog";
import { autosaveStrict, getSubEdit, openDoc } from "../../lib/subEdit";
import { useHotkeys } from "../../lib/hotkeys";
import { usePageActiveRef } from "../../lib/pageActive";
import { cancelPaddleLang, clearPaddleErr, downloadPaddleLang, loadPaddleLangs, usePaddleLangs } from "../../lib/paddleLangs";
import "../../styles/ocr.css";
import { EditArea, EngineRow, MATCH, OcrTable, ReviewOne, baseName } from "./OcrTable";
import { hasTop, useSubImgs } from "./images";
import { FLAG_TIP, FORCED_TIP, dur } from "./tips";

/* ---------- หน้า OCR ---------- */
const VIEW_KEY = "ms.ocrView";
export default function OcrPage({ track, movie, onEdit }: { track: AvTrack; movie: string; onEdit?: () => void }) {
  const job = useOcrJob();
  // โมเดลภาษาของ PaddleOCR ที่ต้องโหลดก่อนอ่าน (BUGS ข้อ 152)
  const plang = usePaddleLangs();
  useEffect(() => { void loadPaddleLangs(); }, []);
  const usesPaddle = job.cfg.engine === "paddle" || job.cfg.helpers.some((h) => h.startsWith("paddle"));
  const needLang = usesPaddle ? plang.langs.find((x) => x.code === job.cfg.paddle.lang && !x.have) ?? null : null;
  const path = track.inMovie ? movie : track.src;
  const ff = track.ff ?? track.tid;
  // ชื่อตั้งต้นของไฟล์ที่ส่งออกกับเอกสารของหน้าแก้ซับ แบบ base ของ SubEditor · ซับในหนังต่อรหัสภาษาของแทร็ก
  const expBase = path.replace(/\.[^.\\/]+$/, "") +(track.inMovie && track.lang ? `.${track.lang}` : "");
  const [expOpen, setExpOpen] = useState(false);
  useEffect(() => { void loadExpFormats(); }, []);
  const [editAsk, setEditAsk] = useState(false);
  const { imgs, need, reload } = useSubImgs(path, ff);
  const [vob, setVob] = useState(false);
  // VobSub ที่เปิดใหม่ใช้สีที่จำไว้เอง แบบ ApplyStoredVobSubColors ของ Subtitle Edit
  const vobApplied = useRef("");
  useEffect(() => {
    const k = `${path}|${ff}`;
    if (job.kind !== "vobsub" || !job.rows.length || vobApplied.current === k) return;
    vobApplied.current = k;
    const c = storedVobColors();
    if (c) void ocrApi.vobsubRecolor(path, ff, c).then(() => reload(), () => {});
  }, [job.kind, job.rows.length, path, ff]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(0);
  const [only, setOnly] = useState(false);
  const [forcedOnly, setForcedOnly] = useState(false);
  const [view, setView] = useState<"table" | "one">(() => { try { return localStorage.getItem(VIEW_KEY) === "one" ? "one" : "table"; } catch { return "table"; } });
  const [dlg, setDlg] = useState<OcrDlg>(null);
  const [ask, setAsk] = useState<{ word: string; i: number } | null>(null);
  const [dbs, setDbs] = useState<OcrDbList | null>(null);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [tess, setTess] = useState<OcrTessLang[]>([]);
  const [, tick] = useState(0);
  // เปิดซับรูปนี้ในตัวคุมงาน · กลับมาที่หน้าเดิม งานเดิมยังอยู่
  // ตัวคุมงานเก็บได้ทีละซับ · ซับอื่นยังอ่านอยู่หรืออ่านไว้แล้ว ไม่เปิดทับเงียบ ๆ ถามก่อน (ผู้ช่วยตรวจทาน U1 U4 · เดิมเปลี่ยนแทร็กแล้วผลที่อ่านกับที่แก้หายทันที และระหว่างอ่านอยู่หน้าค้างเป็นโครงจาง)
  const [other, setOther] = useState<{ name: string; done: number; total: number; running: boolean } | null>(null);
  useEffect(() => {
    const j = getOcrJob();
    if (j.path === path && j.ff === ff) { setOther(null); return; }
    const done = j.rows.filter((r) => r.state === "done").length;
    if (j.running || done > 0) { setOther({ name: baseName(j.path ?? ""), done, total: j.rows.length, running: j.running }); return; }
    setOther(null);
    void openSource(path, ff);
  }, [path, ff]);
  const openHere = async () => {
    if (getOcrJob().running) {
      stopOcr();
      for (let k = 0; k < 100 && getOcrJob().running; k++) await new Promise((r) => setTimeout(r, 100));
    }
    if (getOcrJob().running) return;
    setOther(null);
    void openSource(path, ff);
  };
  useEffect(() => { ocrApi.dbs().then(setDbs, () => {}); ocrApi.tessLangs().then(setTess, () => {}); }, [dlg]);
  useEffect(() => { if (!job.running) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [job.running]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* จำไม่ได้ก็ไม่เป็นไร */ } }, [view]);
  const rows = job.path === path && job.ff === ff ? job.rows : [];
  const total = rows.length;
  const done = rows.filter((r) => r.state === "done").length;
  const flagged = rows.filter((r) => rowReasons(r).length).length;
  const tops = rows.filter((r) => r.state === "done" && hasTop(r)).length;
  const forcedCount = rows.filter((r) => r.item.forced).length;
  const allDone = total > 0 && done === total;
  const canvas: [number, number] = rows.find((r) => r.item.canvas[0] > 0)?.item.canvas ?? [1920, 1080];
  // ส่งผล OCR ไปหน้าแก้ซับ (ขั้น 12 ตาม Ok ของ OcrWindow) · เอกสาร ASS ขนาดภาพตามจอของซับรูป บรรทัดบนจอแยกแถวติด {\an8}
  // ยังไม่มีไฟล์ของตัวเอง นับว่ายังไม่บันทึก กดบันทึกในหน้าแก้ซับแล้วถามที่เก็บ · หน้าแก้ซับมีที่แก้ค้างอยู่ ถามก่อนแทนที่
  const [editErr, setEditErr] = useState<string | null>(null);
  const toEditor = async (force = false) => {
    const s = getSubEdit();
    if (!force && s.doc && s.dirty) { setEditAsk(true); return; }
    setEditAsk(false);
    setEditErr(null);
    try {
      const doc = await ocrApi.exportDoc({ rows: expRows(rows), fmt: "AdvancedSubStationAlpha", top: "tag", italic: true, enc: "utf8bom", canvas });
      // แทนที่ซับที่แก้ค้างอยู่ เก็บฉบับบันทึกอัตโนมัติไว้ก่อน แบบด่านของหน้าซับไตเติล (ผู้ช่วยตรวจทาน U11 · เดิมที่แก้ไว้หายถาวร)
      if (force && s.doc && s.dirty) await autosaveStrict();
      openDoc(doc, { name: `${baseName(expBase)} OCR`, movie, key: track.key, base: expBase }, { dirty: true });
      onEdit?.();
    } catch (e) { setEditErr(String(e instanceof Error ? e.message : e)); }
  };
  const ms = ocrElapsed();
  const pct = job.runIds.length ? Math.round((job.runDone / job.runIds.length) * 100) : 0;
  const eta = job.runDone > 0 ? (ms / job.runDone) * (job.runIds.length - job.runDone) : null;
  const sum = useMemo(() => {
    if (!allDone) return null;
    return `อ่านครบ ${total.toLocaleString("en-US")} ภาพแล้ว ${flagged ? `มี ${flagged.toLocaleString("en-US")} ภาพที่ควรตรวจ` : "ไม่มีภาพที่ควรตรวจ"}${tops ? ` และ ${tops.toLocaleString("en-US")} ภาพที่ซับอยู่บนจอ` : ""}`;
  }, [allDone, total, flagged, tops]);
  const teachRow = () => startOcr([sel]);
  const [insp, setInsp] = useState<number | null>(null);
  // เลือกหลายบรรทัด (Ctrl Shift) สำหรับลบบรรทัดกับเติมจากคลิปบอร์ด · ไม่ได้เลือกเพิ่ม ใช้บรรทัดที่เลือกอยู่
  const [multi, setMulti] = useState<Set<number>>(() => new Set());
  const picked = multi.size ? [...multi].sort((a, b) => a - b) : rows.length ? [Math.min(sel, rows.length - 1)] : [];
  const [delAsk, setDelAsk] = useState(false);
  const [clipMsg, setClipMsg] = useState<string | null>(null);
  const doDelete = async () => { setDelAsk(false); const keep = picked[0]; await removeRows(picked); setMulti(new Set()); setSel(Math.max(0, Math.min(keep, getOcrJob().rows.length - 1))); };
  const fillClip = async () => {
    if (picked.length < 2) return;
    const w = window as unknown as { __ocrClip?: string };
    const t = import.meta.env.DEV && w.__ocrClip != null ? w.__ocrClip : await infoApi.clipboardText().catch(() => "");
    if (!t) { setClipMsg("คลิปบอร์ดไม่มีข้อความ"); return; }
    fillRows(picked, t); setClipMsg(`ใส่ข้อความจากคลิปบอร์ดแล้ว ${picked.length} บรรทัด`);
  };
  useEffect(() => { if (!clipMsg) return; const t = setTimeout(() => setClipMsg(null), 3000); return () => clearTimeout(t); }, [clipMsg]);
  useEffect(() => { setMulti(new Set()); setDelAsk(false); }, [path, ff]);
  // เปลี่ยนตัวกรองแล้วล้างที่เลือกไว้ แถวที่เพิ่งถูกซ่อนไม่ค้างอยู่ในที่เลือก (ผู้ช่วยตรวจทาน U2)
  useEffect(() => { setMulti(new Set()); setDelAsk(false); }, [only, forcedOnly]);
  // คีย์ลัดของหน้า OCR ผ่านตัวกลาง useHotkeys · ทำงานเฉพาะตอนหน้านี้เปิดอยู่ ไม่มีหน้าต่างซ้อน และไม่ได้พิมพ์ในช่อง
  // (ผู้ช่วยตรวจทาน U6 · เดิมดักที่หน้าต่างเอง กด Ctrl+Shift+V ในหน้าอื่นแล้วข้อความคลิปบอร์ดทับบรรทัดที่เลือกไว้เงียบ ๆ)
  // Delete ลบบรรทัด (เฉพาะแบบตาราง แถบยืนยันอยู่ในแบบตาราง · U19) · Ctrl+Shift+V เติมจากคลิปบอร์ด · Ctrl+Shift+I ตรวจบรรทัด · ลูกศรขึ้นลงเลือกบรรทัดแบบตารางของ Subtitle Edit (U18)
  const pageOn = usePageActiveRef();
  const free = () => !dlg && insp == null && !job.running && rows.length > 0;
  const seenIdx = () => rows.map((r, i) => ({ r, i })).filter(({ r }) => (!only || rowReasons(r).length) && (!forcedOnly || r.item.forced)).map((x) => x.i);
  const moveSel = (d: number) => {
    const v = seenIdx();
    if (!v.length) return;
    const at = v.indexOf(sel);
    const k = at < 0 ? 0 : Math.max(0, Math.min(v.length - 1, at + d));
    setMulti(new Set()); setSel(v[k]);
  };
  useHotkeys([
    { code: "Delete", run: () => { if (free() && view === "table") setDelAsk(true); } },
    { code: "KeyV", ctrl: true, shift: true, run: () => { if (free() && picked.length > 1) void fillClip(); } },
    { code: "KeyI", ctrl: true, shift: true, run: () => { if (free() && MATCH.includes(job.cfg.engine)) setInsp(Math.min(sel, rows.length - 1)); } },
    { code: "ArrowDown", noButton: true, run: () => { if (view === "table" && rows.length) moveSel(1); } },
    { code: "ArrowUp", noButton: true, run: () => { if (view === "table" && rows.length) moveSel(-1); } },
  ], pageOn);
  useEffect(() => { if (view !== "table") setDelAsk(false); }, [view]);
  /** นำข้อความจากไฟล์ซับที่เวลาซ้อนกันมากที่สุดมาใส่แต่ละบรรทัด (Import text with matching time codes ของ Subtitle Edit)
      ไม่ทับบรรทัดที่ไม่มีซับเวลาตรงกัน · ตัวตรวจส่งไฟล์ผ่าน window.__ocrImport ไม่เปิดกล่องเลือกไฟล์ */
  const importText = async () => {
    const w = window as unknown as { __ocrImport?: string };
    const p = import.meta.env.DEV && w.__ocrImport ? w.__ocrImport : await pickFile("subtitle");
    if (!p) return;
    try {
      const t = await subApi.text(p, false, 0, 0);
      rows.forEach((r, k) => {
        const s0 = r.item.start, e0 = r.item.end ?? r.item.start + 2;
        let best = -1, bo = 0;
        t.cues.forEach((c, ci) => { const o = Math.min(e0, c.end) - Math.max(s0, c.start); if (o > bo) { bo = o; best = ci; } });
        if (best >= 0) importRowText(k, t.cues[best].text);
      });
      setImpMsg(null);
    } catch (e) { setImpMsg(String(e)); }
  };

  if (other) return (
    <section className="card ocr-page" data-ocr-page>
      <div className="stat warn" data-ocr-other><CardIcon kind="warn" /><div style={{ flex: 1, minWidth: 0 }}>
        <b>{other.running ? `กำลังอ่าน ${other.name} อยู่` : `ผล OCR ของ ${other.name} ยังค้างอยู่`}</b>
        <Phr>{`${other.running ? "อ่านไปแล้ว" : "อ่านแล้ว"} ${other.done.toLocaleString("en-US")} จาก ${other.total.toLocaleString("en-US")} ภาพ  ตัวคุมงานเก็บผลได้ทีละซับ เปิดซับนี้แล้วผลเดิมจะหาย ถ้ายังไม่ได้ส่งออก ให้เลือกแทร็กเดิมแล้วส่งออกก่อน`}</Phr>
        <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void openHere()} data-ocr-other-open>{other.running ? "หยุดอ่านแล้วเปิดซับนี้" : "เปิดซับนี้ ทิ้งผลเดิม"}</button></div>
      </div></div>
    </section>);
  if (job.openError && job.path === path) return <section className="card ocr-page" data-ocr-page><div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดซับรูปไม่ได้</b><Phr>{job.openError}</Phr></div></div></section>;
  if (!rows.length) return (
    <section className="card ocr-page" data-ocr-page aria-busy="true">
      <Skel w="100%" h={38} /><Skel w="100%" h={240} style={{ marginTop: 8 }} />
      <div className="small"><Phr>{`${job.openPercent >= 85 ? "กำลังเก็บภาพซับ" : "กำลังอ่านภาพซับจากไฟล์"} ${job.openPercent}%`}</Phr></div>
    </section>);
  return (
    <section className="card ocr-page" data-ocr-page>
      <EngineRow busy={job.running} dbs={dbs} tess={tess} onDb={() => setDlg("db")} />
      {done > 0 && <div className="ocr-sum" data-ocr-sum>
        <CardIcon kind={flagged ? "warn" : "ok"} /><Phr>{sum ?? `อ่านแล้ว ${done.toLocaleString("en-US")} จาก ${total.toLocaleString("en-US")} ภาพ มี ${flagged.toLocaleString("en-US")} ภาพที่ควรตรวจ`}</Phr>
        <InfoTip title="จุดที่ต้องตรวจ" tip={FLAG_TIP} />
        <span style={{ flex: 1 }} />
        {view === "table" && forcedCount > 0 && <label className="ocr-only" data-ocr-forced><Switch on={forcedOnly} onChange={setForcedOnly} label="แสดงเฉพาะซับบังคับ" /><span>{`เฉพาะซับบังคับ ${forcedCount}`}</span><InfoTip title="ซับบังคับ" tip={FORCED_TIP} /></label>}
        {view === "table" && <label className="ocr-only"><Switch on={only} onChange={setOnly} label="แสดงเฉพาะจุดที่ต้องตรวจ" /><span>เฉพาะจุดที่ต้องตรวจ</span></label>}
        <Seg small label="แบบตรวจทาน" value={view} onChange={setView} options={[{ value: "table", label: <><IbTable size={14} />ตาราง</> }, { value: "one", label: <><IbNext size={14} />ทีละจุด</> }]} />
      </div>}
      {view === "one" && done > 0
        ? <ReviewOne rows={rows} movie={movie} imgs={imgs} need={need} sel={sel} setSel={setSel} onTeach={teachRow} />
        : <>
          {delAsk && <div className="ocr-delask" data-ocr-del-ask><Phr>{picked.length > 1 ? `ลบ ${picked.length} บรรทัดที่เลือกออกจากรายการ ภาพเหล่านี้จะไม่ถูกส่งออก` : `ลบภาพที่ ${rows[picked[0]]?.item.n ?? ""} ออกจากรายการ ภาพนี้จะไม่ถูกส่งออก`}</Phr>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void doDelete()} data-ocr-del-ok>ลบ</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDelAsk(false)}>ยกเลิก</button></div>}
          <OcrTable rows={rows} sel={sel} setSel={setSel} onlyFlag={only} onlyForced={forcedOnly} imgs={imgs} need={need} current={job.current} multi={multi} setMulti={setMulti} />
          <EditArea i={Math.min(sel, rows.length - 1)} rows={rows} movie={movie} imgs={imgs} setSel={setSel} onTeach={teachRow} onUnknown={(word, i) => setAsk({ word, i })} onInspect={() => setInsp(Math.min(sel, rows.length - 1))} picked={picked.length} onDelete={() => setDelAsk(true)} onFill={() => void fillClip()} clipMsg={clipMsg} />
        </>}
      {editErr && <div className="stat bad" data-ocr-edit-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>ส่งไปหน้าแก้ซับไม่ได้</b><Phr>{editErr}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditErr(null)}>ปิด</button></div></div></div>}
      {needLang && <div className="stat warn" data-ocr-need-lang><CardIcon kind="warn" /><div style={{ flex: 1 }}><b>{`โมเดลภาษา${needLang.name}ยังไม่ได้โหลด`}</b>
        <Phr>{`ภาษานี้ไม่ได้แนบมากับตัวติดตั้ง ต้องโหลดก่อนอ่าน ขนาดราว ${needLang.mb} MB และโหลดครั้งเดียวใช้ได้ตลอด`}</Phr>
        <div className="minirow">{plang.dl?.code === needLang.code
          ? <><span className="small" data-ocr-need-pct>{`กำลังโหลด ${Math.round(plang.dl.pct)}%`}</span><button type="button" className="btn btn-ghost btn-sm" onClick={cancelPaddleLang}>หยุดโหลด</button></>
          : <button type="button" className={"btn btn-sm " + (plang.dl ? "btn-wait" : "btn-main")} aria-disabled={!!plang.dl || undefined} title={plang.dl ? "กำลังโหลดภาษาอื่นอยู่ รอให้เสร็จก่อน" : undefined}
              onClick={() => { if (!plang.dl) void downloadPaddleLang(needLang.code); }} data-ocr-need-get>{`โหลดโมเดลภาษา${needLang.name}`}</button>}</div></div></div>}
      {plang.err && <div className="stat bad" data-ocr-lang-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>โหลดโมเดลภาษาไม่สำเร็จ</b><Phr>{plang.err}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={clearPaddleErr}>ปิด</button></div></div></div>}
      {job.wordErr && <div className="stat bad" data-ocr-word-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>บันทึกรายการคำไม่ได้</b><Phr>{job.wordErr}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={clearWordErr}>ปิด</button></div></div></div>}
      {impMsg && <div className="stat bad" data-ocr-import-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>นำข้อความจากไฟล์ซับไม่ได้</b><Phr>{impMsg}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setImpMsg(null)}>ปิด</button></div></div></div>}
      <div className="ocr-foot" data-ocr-foot>
        {!job.running && <>
          <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setDlg("prep")} title="แต่งภาพก่อนส่งให้ตัวอ่าน" aria-label="แต่งภาพ" data-ocr-prep-open><IbCrop size={14} /><span className="ocr-tl">แต่งภาพ</span></button>
          <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setDlg("models")} title="ดูโมเดล ชุดภาษา และฐานตัวอักษรที่มี โหลดชุดภาษาเพิ่ม" aria-label="ตัวอ่านและชุดภาษา" data-ocr-models-open><IcSettings size={14} /><span className="ocr-tl">ตัวอ่านและชุดภาษา</span></button>
          {job.kind === "vobsub" && <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setVob(true)} title="ตั้งสีที่ใช้วาดภาพซับ DVD แทนจานสีของไฟล์" aria-label="สีของ VobSub" data-ocr-vob-open><IcPalette size={14} /><span className="ocr-tl">สีของ VobSub</span></button>}
          <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setDlg("options")} title="แก้คำ OCR ถามคำที่ไม่รู้จัก ตัดบรรทัดเอง หยุดสอน ฐานสำรอง" aria-label="ตัวเลือก" data-ocr-options-open><IbWand size={14} /><span className="ocr-tl">ตัวเลือก</span></button>
          <span className="sv-sep" aria-hidden />
        </>}
        {job.running ? <div className="ocr-prog" data-ocr-prog><div className="ocr-bar2"><span style={{ width: `${pct}%` }} /></div>
          <span className="small">{job.teach ? `อ่านไป ${job.runDone.toLocaleString("en-US")} จาก ${job.runIds.length.toLocaleString("en-US")} ภาพ หยุดรอสอนตัวอักษรของภาพที่ ${rows[job.teach.index]?.item.n ?? ""}`
            : job.paused ? `หยุดชั่วคราวที่ ${job.runDone.toLocaleString("en-US")} จาก ${job.runIds.length.toLocaleString("en-US")} ภาพ ใช้ไป ${dur(ms)}`
            : `อ่านไป ${job.runDone.toLocaleString("en-US")} จาก ${job.runIds.length.toLocaleString("en-US")} ภาพ ${pct}% ใช้ไป ${dur(ms)}${eta != null ? ` เหลือราว ${dur(eta)}` : ""}`}</span></div>
          : <span className="small"><Phr>{done ? `อ่าน ${done.toLocaleString("en-US")} ภาพ ใช้เวลา ${dur(job.elapsedMs)}` : `ซับรูป ${total.toLocaleString("en-US")} ภาพ ยังไม่ได้อ่าน กดเริ่มอ่านแล้วตรวจทานได้ทีละภาพ`}</Phr></span>}
        <span style={{ flex: 1 }} />
        {job.running ? <>
          {job.paused
            ? <button type="button" className="btn btn-ghost" onClick={resumeOcr} data-ocr-resume><Keep all={["อ่านต่อ", "หยุดชั่วคราว"]} icon={<IbPlay size={15} />}>อ่านต่อ</Keep></button>
            : <button type="button" className="btn btn-ghost" onClick={pauseOcr} data-ocr-pause><Keep all={["อ่านต่อ", "หยุดชั่วคราว"]} icon={<IbStop size={15} />}>หยุดชั่วคราว</Keep></button>}
          <button type="button" className="btn btn-ghost" onClick={stopOcr} data-ocr-stop>หยุด</button>
        </> : <>
          <button type="button" className="btn btn-ghost ocr-tool" onClick={() => void importText()} title="นำข้อความจากไฟล์ซับตัวหนังสือที่เวลาตรงกัน แทนการอ่านภาพ" aria-label="นำข้อความจากไฟล์ซับ" data-ocr-import><IcFile size={15} /><span className="ocr-tl">นำข้อความจากไฟล์ซับ</span></button>
          {done > 0 && <button type="button" className="btn btn-ghost ocr-tool" onClick={() => setDlg("find")} title="ค้นและแทนที่ข้อความในทุกบรรทัด" aria-label="ค้นและแทนที่" data-ocr-find-open><IcSearch size={15} /><span className="ocr-tl">ค้นและแทนที่</span></button>}
          {done > 0 && <button type="button" className="btn btn-ghost" onClick={() => void startOcr([sel])} title={`อ่านภาพที่ ${rows[sel]?.item.n ?? ""} ใหม่ด้วยค่าที่ตั้งตอนนี้${rows[sel]?.edited ? " ข้อความที่แก้เองจะถูกแทนด้วยผลอ่านใหม่" : ""}`} data-ocr-reread><IcRefresh size={15} />อ่านใหม่เฉพาะที่เลือก</button>}
          {!allDone && <button type="button" className={"btn " + (needLang ? "btn-wait" : done ? "btn-ghost" : "btn-main")} aria-disabled={!!needLang || undefined}
            title={needLang ? `โหลดโมเดลภาษา${needLang.name}ก่อนจึงจะอ่านได้` : undefined} onClick={() => { if (!needLang) void startOcr(); }} data-ocr-start><Keep all={["อ่านต่อที่เหลือ", "เริ่มอ่าน"]} icon={<IbPlay size={15} />}>{done ? "อ่านต่อที่เหลือ" : "เริ่มอ่าน"}</Keep></button>}
          {/* อ่านแล้วตรวจทานในหน้านี้ แล้วเลือกไปหน้าแก้ซับหรือส่งออก (ข้อ 143 ㉕) */}
          {done > 0 && <>
            <span className="sv-sep" aria-hidden />
            {onEdit && <button type="button" className="btn btn-ghost ocr-tool" onClick={() => void toEditor()} title="เปิดผลที่อ่านในหน้าแก้ซับกับวิดีโอ แก้เวลาและข้อความต่อ แล้วบันทึกเป็นไฟล์ซับ" aria-label="ไปหน้าแก้ซับ" data-ocr-to-edit><IbTable size={15} /><span className="ocr-tl">ไปหน้าแก้ซับ</span></button>}
            <button type="button" className="btn btn-main" onClick={() => setExpOpen(true)} title="ส่งออกเป็นไฟล์ซับตัวหนังสือ หรือบันทึกภาพพร้อมหน้า HTML" data-ocr-export><IcExtract size={15} />ส่งออก</button>
          </>}
        </>}
      </div>
      <ExportDialog open={expOpen} onClose={() => setExpOpen(false)} rows={rows} canvas={canvas} base={expBase} source={path} />
      <Dialog open={editAsk} onClose={() => setEditAsk(false)} kind="work" title="หน้าแก้ซับมีซับที่แก้ไว้ยังไม่บันทึก" width={560}
        actions={<><button type="button" className="btn btn-ghost" onClick={() => setEditAsk(false)}><IcClose size={15} />ยกเลิก</button><span style={{ flex: 1 }} />
          {getSubEdit().meta?.key === track.key && <button type="button" className="btn btn-ghost" onClick={() => { setEditAsk(false); onEdit?.(); }} data-ocr-edit-old>ไปหน้าแก้ซับเดิม</button>}
          <button type="button" className="btn btn-main" onClick={() => void toEditor(true)} data-ocr-edit-replace>แทนที่ด้วยผล OCR</button></>}>
        <div className="small"><Phr>{`${getSubEdit().meta?.name ?? "ซับ"} ยังไม่ได้บันทึกเป็นไฟล์ ส่งผล OCR ไปแทนแล้วที่แก้ไว้ในหน้าแก้ซับจะหาย`}</Phr></div>
      </Dialog>
      <InspectDialog open={insp != null} index={insp ?? 0} onClose={() => setInsp(null)} />
      <VobColorDialog open={vob} onClose={() => setVob(false)} path={path} ff={ff} n={rows[Math.min(sel, rows.length - 1)]?.item.n ?? 1} onApplied={reload} />
      <OcrDialogs dlg={dlg} setDlg={setDlg} ask={ask} setAsk={setAsk} rows={rows} imgs={imgs} need={need} sel={sel} />
    </section>
  );
}
