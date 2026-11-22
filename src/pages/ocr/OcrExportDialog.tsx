/* หน้าต่างส่งออกผล OCR (แผน OCR ขั้น 12) ตาม ExportTextAsSubtitle กับ SaveAllImagesWithHtmlIndex ของ Subtitle Edit
   ซ้ายตั้งค่า ขวาเลื่อนดูไฟล์ที่จะได้ทั้งไฟล์ (พี่กันสั่งตอนดูมอคอัป "แบ่งสองส่วน ฝั่งนึงเลื่อนดูซับ ฝั่งนึงตั้งค่า")
   ชนิดไฟล์ SubRip กับ Advanced SubStation เขียนเอง ชนิดอื่นตามที่ SeConv ของ Subtitle Edit เขียนได้ (ข้อ 143 ㉕)
   ซับที่อยู่บนจอเตือนและเลือกได้ว่าแยกแถวเก็บไว้บนจอหรือรวมไว้ล่างจอ (ข้อ 143 ⑭) · ไม่เขียนทับไฟล์เดิม ชื่อชนให้ตั้งชื่อใหม่
   ภาพทุกภาพพร้อมหน้า HTML ลงโฟลเดอร์ใหม่ เปิดในเบราว์เซอร์ไว้ตรวจทาน */
import { useEffect, useMemo, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Seg, Switch } from "../../components/ui";
import { IcClose, IcExtract, IcFolder } from "../../components/icons";
import { listen } from "@tauri-apps/api/event";
import { api, ocrApi, pickFolder, pickSave, subDocApi, type OcrExpFormat, type OcrExpReq, type OcrExpRow } from "../../lib/api";
import { lineAns, type OcrRow } from "../../lib/ocrJob";
import type { Tip } from "../../lib/codecAdv";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";
const KEY = "ms.ocrExport";
type Enc = OcrExpReq["enc"];
type Saved = { fmt: string; top: "tag" | "down"; italic: boolean; enc: Enc };
const DEF: Saved = { fmt: "SubRip", top: "tag", italic: true, enc: "utf8bom" };
/** รายชื่อชนิดไฟล์ของ SeConv ถามครั้งเดียวแล้วจำ · หน้า OCR เรียกตั้งแต่เปิด ชนิดที่จำไว้จึงขึ้นทันทีตอนเปิดหน้าต่าง ไม่ขึ้น SubRip ก่อนแล้วสลับเอง */
const BASE_FMTS: OcrExpFormat[] = [{ id: "SubRip", name: "SubRip", ext: ".srt" }, { id: "AdvancedSubStationAlpha", name: "Advanced Sub Station Alpha", ext: ".ass" }];
let fmtCache: OcrExpFormat[] | null = null;
let fmtLoad: Promise<OcrExpFormat[]> | null = null;
export function loadExpFormats(): Promise<OcrExpFormat[]> {
  fmtLoad ??= ocrApi.exportFormats().then((v) => (fmtCache = v), () => (fmtCache = BASE_FMTS));
  return fmtLoad;
}
function load(): Saved { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return DEF; } }

export const ENC_TIP: Tip = { w: "รหัสอักษรคือวิธีเก็บตัวหนังสือลงไฟล์ ถ้าโปรแกรมเล่นอ่านด้วยรหัสอื่น ตัวหนังสือจะเพี้ยนเป็นตัวแปลก ๆ", o: [
  ["UTF-8 มี BOM", "เก็บได้ทุกภาษา มีป้ายบอกรหัสไว้หัวไฟล์", "โปรแกรมเล่นแทบทุกตัวรู้เองว่าเป็นรหัสนี้", ""],
  ["UTF-8 ไม่มี BOM", "เก็บได้ทุกภาษา ไม่มีป้ายหัวไฟล์", "เข้ากับเว็บและโปรแกรมใหม่ ๆ", "โปรแกรมเล่นเก่าบางตัวอ่านไทยเพี้ยน"],
  ["UTF-16", "เก็บได้ทุกภาษา ไฟล์ใหญ่ขึ้นราวสองเท่า", "", "บางโปรแกรมอ่านไม่ได้"],
  ["TIS-620", "รหัสเก่าของภาษาไทย", "เครื่องเล่นรุ่นเก่าที่อ่าน UTF-8 ไม่ได้", "เก็บได้แค่ไทยกับอังกฤษ"],
], r: "UTF-8 มี BOM" };
export const POS_TIP: Tip = { w: "ซับแถวเดียวมีได้ตำแหน่งเดียว ป้ายบนจอกับบทพูดล่างจอที่ขึ้นพร้อมกันจึงต้องแยกเป็นสองแถว ถ้าอยากให้อยู่คนละที่", o: [
  ["แยกแถว เก็บไว้บนจอ", "ป้ายบนจอเป็นอีกแถวที่เวลาเดียวกัน ใส่แท็ก {\\an8} ให้ขึ้นบนจอเหมือนต้นฉบับ", "เหมือนต้นฉบับ", "โปรแกรมเล่นเก่าบางตัวแสดงแท็กเป็นตัวหนังสือ"],
  ["รวมไว้ล่างจอ", "ป้ายบนจอต่อเป็นบรรทัดแรกของบทพูดล่างจอ", "อ่านได้ทุกโปรแกรม", "ป้ายที่ควรอยู่บนลงมาเบียดบทพูด"],
], r: "แยกแถว เก็บไว้บนจอ" };
const FMT_TIP: Tip = { w: "ชนิดไฟล์ซับตัวหนังสือที่จะได้ SubRip กับ Advanced SubStation ชั้นหนังเขียนเอง ชนิดอื่นให้ SeConv ของ Subtitle Edit แปลงจากผลเดียวกัน", o: [
  ["SubRip .srt", "ชนิดที่โปรแกรมเล่นทุกตัวอ่านได้ เก็บตัวเอียงกับตำแหน่งบนจอเป็นแท็ก", "", ""],
  ["Advanced SubStation .ass", "เก็บตำแหน่ง ขนาดจอ และสไตล์ตัวอักษร แก้ต่อในหน้าแก้ซับได้ครบ", "", ""],
], r: "SubRip ถ้าจะเอาไปใส่หนังหรือเปิดในโปรแกรมเล่น" };
const HTML_TIP: Tip = { w: "บันทึกภาพซับทุกภาพเป็นไฟล์ PNG คู่กับหน้า index.html ที่วางภาพกับข้อความที่อ่านได้เทียบกันทีละบรรทัด เปิดในเบราว์เซอร์ไว้ตรวจทาน ค้นคำ และกรองเฉพาะภาพที่ไม่มีข้อความได้\nไฟล์ทั้งหมดอยู่ในโฟลเดอร์ใหม่ชื่อ ชื่อซับ OCR ในโฟลเดอร์ที่เลือก ไม่ทับของเดิม" };

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, "");
const anOf = (r: OcrRow) => r.line?.anLines ?? [r.item.an];
export const hasTop = (r: OcrRow) => lineAns(r).some((a) => a >= 7);
/** รายการเลขภาพแบบประโยค "3, 9 และ 16" ไม่เกินหกเลข เกินนั้นต่อท้ายจำนวนที่เหลือ */
function listNums(ns: number[]): string {
  if (ns.length <= 1) return ns.join("");
  if (ns.length <= 6) return `${ns.slice(0, -1).join(", ")} และ ${ns[ns.length - 1]}`;
  return `${ns.slice(0, 6).join(", ")} และอีก ${ns.length - 6} ภาพ`;
}
/** จำนวนแถวที่จะได้ ตามกติกาเดียวกับ lines_of ใน ocrexport.rs */
function countLines(rows: OcrRow[], top: "tag" | "down"): number {
  let n = 0;
  for (const r of rows) {
    const ls = r.text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
    if (!ls.length) continue;
    if (top !== "tag") { n++; continue; }
    const an = lineAns(r);
    let prev = -1;
    ls.forEach((_, i) => { const a = an[i] ?? 2; if (a !== prev) { n++; prev = a; } });
  }
  return n;
}
export function expRows(rows: OcrRow[]): OcrExpRow[] {
  return rows.map((r) => ({ start: r.item.start, end: r.item.end, text: r.state === "done" ? r.text : "", an: anOf(r) }));
}

type Run = { s: "idle" } | { s: "busy" } | { s: "done"; path: string; lines: number } | { s: "exists"; path: string } | { s: "failed"; err: string };
type HtmlRun = { s: "idle" } | { s: "busy"; pct: number } | { s: "done"; folder: string; images: number } | { s: "failed"; err: string };

export function ExportDialog({ open, onClose, rows, canvas, base, source }: { open: boolean; onClose: () => void; rows: OcrRow[]; canvas: [number, number]; base: string; source: string }) {
  const [cfg, setCfgState] = useState<Saved>(load);
  const setCfg = (p: Partial<Saved>) => setCfgState((c) => { const n = { ...c, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* จำไม่ได้ก็ใช้รอบนี้ */ } return n; });
  const [fmts, setFmts] = useState<OcrExpFormat[] | null>(fmtCache);
  useEffect(() => { if (open && !fmts) void loadExpFormats().then(setFmts); }, [open, fmts]);
  // ชนิดที่จำไว้ยังไม่อยู่ในรายชื่อที่โหลด ใช้ SubRip · ระหว่างโหลดรายชื่อไม่เดา ปุ่มส่งออกรอ
  const list = fmts ?? BASE_FMTS;
  const fmt = list.find((f) => f.id === cfg.fmt) ?? (fmts || BASE_FMTS.some((f) => f.id === cfg.fmt) ? list[0] : { id: cfg.fmt, name: cfg.fmt, ext: "" });
  const fmtReady = !!fmts || BASE_FMTS.some((f) => f.id === cfg.fmt);
  // ที่เก็บ · ตั้งต้นข้างไฟล์ซับหรือไฟล์หนัง ชื่อเดียวกัน นามสกุลตามชนิด · เลือกเองแล้วเปลี่ยนชนิด เปลี่ยนแค่นามสกุล
  const [picked, setPicked] = useState<string | null>(null);
  // ที่อยู่แสดงด้วยทับแบบ Windows แบบเดียว (ชื่อที่ตั้งใหม่ต่อเลขท้ายได้ทับอีกแบบปนมา)
  const target = ((picked ?? base) + fmt.ext).replace(/\//g, String.fromCharCode(92));
  const [run, setRun] = useState<Run>({ s: "idle" });
  const [html, setHtml] = useState<HtmlRun>({ s: "idle" });
  // การ์ดผลที่ขึ้นใหม่เลื่อนเข้ามาให้เห็นในคอลัมน์ตั้งค่า (การ์ดผลบันทึกภาพอยู่ท้ายคอลัมน์ เดิมต้องเลื่อนลงเอง)
  const left = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (run.s === "idle" && html.s === "idle") return;
    const el = left.current?.querySelector<HTMLElement>(html.s === "done" || html.s === "failed" ? "[data-ocr-html-done], [data-ocr-html-err]" : "[data-ocr-exp-done], [data-ocr-exp-exists], [data-ocr-exp-err]");
    const box = left.current;
    if (!el || !box) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
    else if (r.top < b.top) box.scrollTop -= b.top - r.top + 4;
  }, [run.s, html.s]);
  // เปิดหน้าต่างทุกครั้งอ่านค่าที่จำไว้ใหม่ (หน้า OCR ของซับอื่นอาจเปลี่ยนไว้)
  useEffect(() => { if (open) { setRun({ s: "idle" }); setHtml({ s: "idle" }); setCfgState(load()); } }, [open]);
  // ผลสำเร็จหายเองหลัง 8 วินาที ผิดพลาดค้างไว้จนกดปิด (สกิล save-status)
  useEffect(() => { if (run.s !== "done") return; const t = setTimeout(() => setRun({ s: "idle" }), 8000); return () => clearTimeout(t); }, [run]);
  useEffect(() => { if (html.s !== "done") return; const t = setTimeout(() => setHtml({ s: "idle" }), 8000); return () => clearTimeout(t); }, [html]);

  const req = useMemo<OcrExpReq>(() => ({ rows: expRows(rows), fmt: fmt.id, top: cfg.top, italic: cfg.italic, enc: cfg.enc, canvas }), [rows, fmt.id, cfg.top, cfg.italic, cfg.enc, canvas]);
  const [prev, setPrev] = useState<{ text: string | null; err: string | null }>({ text: null, err: null });
  useEffect(() => {
    if (!open || !fmtReady) return;
    let live = true;
    const t = setTimeout(() => { ocrApi.exportPreview(req).then((text) => { if (live) setPrev({ text, err: null }); }, (e) => { if (live) setPrev({ text: null, err: String(e) }); }); }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [open, req, fmtReady]);

  const tops = rows.filter((r) => r.state === "done" && r.text.trim() && hasTop(r)).map((r) => r.item.n);
  const unread = rows.filter((r) => r.state !== "done").length;
  const empty = rows.filter((r) => r.state === "done" && !r.text.trim()).length;
  const lines = countLines(rows.filter((r) => r.state === "done"), cfg.top);

  const changeTarget = async () => {
    const w = window as unknown as { __ocrExpTarget?: string };
    const p = import.meta.env.DEV && w.__ocrExpTarget != null ? w.__ocrExpTarget : await pickSave(nameOf(target), fmt.ext.replace(/^\./, ""), fmt.name);
    if (p) { setPicked(p.replace(/\.[^.\\/]+$/, "")); setRun({ s: "idle" }); }
  };
  const doExport = async (to = target) => {
    if (run.s === "busy" || !lines) return;
    setRun({ s: "busy" });
    try {
      const r = await ocrApi.exportFile(req, to);
      setRun({ s: "done", path: r.path, lines: r.lines });
    } catch (e) {
      const m = String(e);
      setRun(m === "exists" ? { s: "exists", path: to } : { s: "failed", err: m });
    }
  };
  const renum = async () => {
    if (run.s !== "exists") return;
    const free = await subDocApi.freeName(run.path).catch(() => null);
    if (!free) return;
    setPicked(free.slice(0, free.length - fmt.ext.length));
    void doExport(free);
  };
  const reveal = (p: string) => {
    // รุ่นทดสอบ ตัวตรวจตั้ง window.__openDry ไว้ จดว่ากดแทนการเปิด Explorer ที่จะเด้งขึ้นจอ
    const w = window as unknown as { __openDry?: boolean; __openDryLog?: string[] };
    if (import.meta.env.DEV && w.__openDry) { (w.__openDryLog ??= []).push(p); return; }
    void api.revealMovie(p).catch(() => {});
  };
  const saveHtml = async () => {
    if (html.s === "busy") return;
    const w = window as unknown as { __ocrHtmlFolder?: string };
    const folder = import.meta.env.DEV && w.__ocrHtmlFolder != null ? w.__ocrHtmlFolder : await pickFolder("เลือกโฟลเดอร์ที่จะเก็บภาพพร้อมหน้า HTML");
    if (!folder) return;
    setHtml({ s: "busy", pct: 0 });
    const un = listen<number>("ocr-html-progress", (e) => setHtml((h) => (h.s === "busy" ? { s: "busy", pct: e.payload } : h)));
    try {
      const r = await ocrApi.saveHtml(rows.map((x) => (x.state === "done" ? x.text : "")), folder, source);
      setHtml({ s: "done", folder: r.html, images: r.images });
    } catch (e) { setHtml({ s: "failed", err: String(e) }); }
    void un.then((f) => f());
  };
  const busy = run.s === "busy";
  const why = busy ? "กำลังส่งออก" : !fmtReady ? "กำลังอ่านรายชื่อชนิดไฟล์" : !lines ? "ยังไม่มีบรรทัดที่อ่านแล้วและมีข้อความ" : undefined;

  return (
    <Dialog open={open} onClose={() => { if (!busy && html.s !== "busy") onClose(); }} kind="work" title="ส่งออกเป็นซับตัวหนังสือ" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className={"btn " + (busy || html.s === "busy" ? "btn-wait" : "btn-ghost")} aria-disabled={busy || html.s === "busy" || undefined}
        title={busy ? "กำลังส่งออก รอให้เสร็จก่อน" : html.s === "busy" ? "กำลังบันทึกภาพ รอให้เสร็จก่อน" : undefined} onClick={() => { if (!busy && html.s !== "busy") onClose(); }}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} />
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? `เขียน ${nameOf(target)} ไม่ทับไฟล์เดิม`}
          onClick={() => { if (!why) void doExport(); }} data-ocr-exp-go><Keep all={["ส่งออก", "กำลังส่งออก…"]} icon={<IcExtract size={15} />}>{busy ? "กำลังส่งออก…" : "ส่งออก"}</Keep></button></>}>
      <div className="ocr-exp" data-ocr-exp>
        <div className="ocr-expl" ref={left}>
          <div className="icv-head">ชนิดไฟล์<InfoTip title="ชนิดไฟล์" tip={FMT_TIP} /></div>
          {/* ห่ออีกชั้น ดรอปดาวน์แบบเต็มความกว้างตั้ง flex 1 ไว้ในตัว วางในคอลัมน์แล้วยืดลงเป็นช่องว่าง */}
          <div style={{ display: "flex" }} data-ocr-exp-fmt><Dropdown label="ชนิดไฟล์" value={fmt.id} onChange={(v) => { setCfg({ fmt: v }); setRun({ s: "idle" }); }} search stretch hint="พิมพ์ค้น เช่น srt หรือ vtt"
            options={(list.some((f) => f.id === fmt.id) ? list : [fmt, ...list]).map((f) => ({ value: f.id, label: `${f.name} ${f.ext}`.trim() }))} /></div>
          <span className="small"><Phr>{fmts ? `ชนิดอื่นตามที่ Subtitle Edit เขียนได้ ${fmts.length.toLocaleString("en-US")} ชนิด พิมพ์ค้นในช่องได้` : "กำลังอ่านรายชื่อชนิดไฟล์ของ Subtitle Edit…"}</Phr></span>
          <div className="icv-head">ที่เก็บ</div>
          <div className="ocr-pathrow"><span className="small icv-path ocr-pathbox" data-ocr-exp-target>{target}</span>
            <button type="button" className={"btn " + (busy ? "btn-wait" : "btn-ghost")} aria-disabled={busy || undefined} title={busy ? "กำลังส่งออก รอให้เสร็จก่อน" : "เลือกโฟลเดอร์และชื่อไฟล์ที่จะเขียน"} onClick={() => { if (!busy) void changeTarget(); }} data-ocr-exp-pick><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>
          {tops.length > 0 && <div className="stat warn ocr-posw" data-ocr-exp-top><CardIcon kind="warn" /><div style={{ flex: 1 }}><b>{`มี ${tops.length.toLocaleString("en-US")} ภาพที่ซับอยู่บนจอ`}</b>
            <Phr>{`ภาพ ${listNums(tops)} มีข้อความอยู่บนจอ เลือกว่าจะเก็บไว้อย่างไร`}</Phr>
            <div className="ocr-posopts">
              <Seg small label="ตำแหน่งบนจอ" value={cfg.top} onChange={(v) => setCfg({ top: v })} options={[{ value: "tag", label: "แยกแถว เก็บไว้บนจอ" }, { value: "down", label: "รวมไว้ล่างจอ" }]} />
              <InfoTip title="ตำแหน่งบนจอตอนส่งออก" tip={POS_TIP} />
            </div></div></div>}
          {(unread > 0 || empty > 0) && <div className="stat info" data-ocr-exp-skip><CardIcon kind="info" /><div style={{ flex: 1 }}>
            <Phr>{[unread ? `ยังไม่ได้อ่าน ${unread.toLocaleString("en-US")} ภาพ` : "", empty ? `ไม่มีข้อความ ${empty.toLocaleString("en-US")} ภาพ` : ""].filter(Boolean).join(" และ") + "  ภาพเหล่านี้ไม่ถูกส่งออก"}</Phr></div></div>}
          <div className="icv-row"><span className="icv-lbl">ตัวเอียง</span><Switch on={cfg.italic} onChange={(v) => setCfg({ italic: v })} label="เก็บตัวเอียง" /><span className="small">{cfg.italic ? "เก็บเป็นแท็กตัวเอียง" : "ตัดตัวเอียงออก"}</span></div>
          <div className="icv-row"><span className="icv-lbl">รหัสอักษร<InfoTip title="รหัสอักษร" tip={ENC_TIP} /></span>
            <Dropdown label="รหัสอักษร" value={cfg.enc} onChange={(v) => setCfg({ enc: v })} options={[{ value: "utf8bom", label: "UTF-8 มี BOM" }, { value: "utf8", label: "UTF-8 ไม่มี BOM" }, { value: "utf16", label: "UTF-16" }, { value: "tis", label: "TIS-620 ภาษาไทย" }]} /></div>
          {run.s === "done" && <div className="stat ok" data-ocr-exp-done><CardIcon kind="ok" /><div style={{ flex: 1, minWidth: 0 }}><b>{`ส่งออกแล้ว ${run.lines.toLocaleString("en-US")} แถว`}</b><Phr>{nameOf(run.path)}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(run.path)} data-ocr-exp-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button></div></div></div>}
          {run.s === "exists" && <div className="stat warn" data-ocr-exp-exists><CardIcon kind="warn" /><div style={{ flex: 1, minWidth: 0 }}><b>ในโฟลเดอร์มีไฟล์ชื่อนี้อยู่แล้ว</b>
            <Phr>{`${nameOf(run.path)}  ตั้งชื่อใหม่โดยต่อเลขท้าย หรือเลือกที่เก็บเอง ไฟล์เดิมไม่ถูกเขียนทับ`}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => void renum()} data-ocr-exp-renum>ตั้งชื่อใหม่</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void changeTarget()}>เลือกที่เก็บเอง</button></div></div></div>}
          {run.s === "failed" && <div className="stat bad" data-ocr-exp-err><CardIcon kind="bad" /><div style={{ flex: 1, minWidth: 0 }}><b>ส่งออกไม่สำเร็จ</b><Phr>{run.err}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setRun({ s: "idle" })}>ปิด</button></div></div></div>}
          <div className="icv-head ocr-exphtml">ภาพพร้อมหน้า HTML<InfoTip title="ภาพพร้อมหน้า HTML" tip={HTML_TIP} /></div>
          <div className="ocr-pathrow">
            <span className="small ocr-htmlnote"><Phr>{html.s === "busy" ? `กำลังบันทึกภาพ ${html.pct}%` : "ภาพซับทุกภาพคู่กับข้อความ เปิดในเบราว์เซอร์ไว้ตรวจทาน"}</Phr></span>
            <button type="button" className={"btn " + (html.s === "busy" ? "btn-wait" : "btn-ghost")} aria-disabled={html.s === "busy" || undefined} onClick={() => void saveHtml()} data-ocr-html-go>
              <Keep all={["บันทึกภาพ", "กำลังบันทึก…"]} icon={<IcFolder size={15} />}>{html.s === "busy" ? "กำลังบันทึก…" : "บันทึกภาพ"}</Keep></button></div>
          {html.s === "done" && <div className="stat ok" data-ocr-html-done><CardIcon kind="ok" /><div style={{ flex: 1, minWidth: 0 }}><b>{`บันทึกภาพแล้ว ${html.images.toLocaleString("en-US")} ภาพ`}</b><Phr>{nameOf(dirOf(html.folder))}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(html.folder)} data-ocr-html-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button></div></div></div>}
          {html.s === "failed" && <div className="stat bad" data-ocr-html-err><CardIcon kind="bad" /><div style={{ flex: 1, minWidth: 0 }}><b>บันทึกภาพไม่สำเร็จ</b><Phr>{html.err}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setHtml({ s: "idle" })}>ปิด</button></div></div></div>}
        </div>
        <div className="ocr-expr" data-ocr-exp-prev>
          <div className="icv-head">ไฟล์ที่จะได้<span className="small" style={{ fontWeight: 400 }}>{`${lines.toLocaleString("en-US")} แถว เลื่อนดูได้ทั้งไฟล์`}</span></div>
          {prev.err ? <div className="stat bad"><CardIcon kind="bad" /><div style={{ flex: 1, minWidth: 0 }}><b>ทำตัวอย่างไม่ได้</b><Phr>{prev.err}</Phr></div></div>
            : <pre className="ocr-pre" data-ocr-exp-text>{prev.text ?? "กำลังทำตัวอย่าง…"}</pre>}
        </div>
      </div>
    </Dialog>
  );
}
