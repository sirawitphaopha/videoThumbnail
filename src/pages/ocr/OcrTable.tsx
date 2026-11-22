/* หน้า OCR ตาราง แถวเลือกตัวอ่าน ช่องแก้ข้อความ ตรวจทานทีละภาพ
   แยกจาก OcrPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 7.1) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useRef, useState } from "react";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Seg, Switch } from "../../components/ui";
import { IbBack, IbBold, IbItalic, IbPencil, IbSwap, IbTick, IcCopy, IcExpand, IcSearch, IcSettings, IbSave, IcPaste, IbTrash } from "../../components/icons";
import { ocrApi, pickSave, subApi, type OcrCfg, type OcrDbList, type OcrReason, type OcrTessLang, type SubImg } from "../../lib/api";
import { rowReasons, setRowOk, setRowText, useOcrJob, type OcrRow } from "../../lib/ocrJob";
import { tessName } from "./OcrDialogs";
import { usePaddleLangs } from "../../lib/paddleLangs";
import { BINERR_TIP, CHECK_TIP, ENGINE_TIP, FLAG_TIP, FlagChips, LINES_TIP, PADDLE_LANGS, REASON_NAME, SIZE_TIP, SPACE_TIP, TEACH_OFF, kinds, setCfg, ts, whyText } from "./tips";
import { BgPick, BigView, LineImg, ScreenImg, Txt } from "./images";
import { POS_TIP, hasTop } from "./OcrExportDialog";

/** ปุ่มตรวจบรรทัดกดไม่ได้กับตัวอ่านที่ไม่มีฐานตัวอักษร */
const INSPECT_OFF = "ตรวจบรรทัดได้เฉพาะตัวอ่านที่สอนเอง nOCR Binary OCR และตัวสอนเอง";
/* ---------- แถวเลือกตัวอ่าน ---------- */
export const MATCH = ["nocr", "binary", "own"];
export function EngineRow({ busy, dbs, tess, onDb }: { busy: boolean; dbs: OcrDbList | null; tess: OcrTessLang[]; onDb: () => void }) {
  const { cfg } = useOcrJob();
  const plang = usePaddleLangs();
  const why = busy ? "หยุดอ่านก่อนจึงจะเปลี่ยนได้" : undefined;
  const matcher = MATCH.includes(cfg.engine);
  const dbKey = cfg.engine === "binary" ? "binDb" : cfg.engine === "own" ? "ownDb" : "nocrDb";
  const dbList = dbs ? (cfg.engine === "binary" ? dbs.binary : cfg.engine === "own" ? dbs.own : dbs.nocr) : [];
  const dbOpts = [...new Set([...dbList, cfg[dbKey]])].map((d) => ({ value: d, label: `${d}.${cfg.engine === "binary" ? "db" : "nocr"}${dbList.includes(d) ? "" : " ฐานใหม่"}` }));
  const v5 = cfg.engine === "paddle" && cfg.paddle.lang !== "";
  const helper = cfg.helpers[0] ?? "none";
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
  return (
    <div className="ocr-engine" data-ocr-engine>
      <span className="ocr-f">ตัวอ่าน<InfoTip title="ตัวอ่าน" tip={ENGINE_TIP} /></span>
      <Dropdown label="ตัวอ่าน" value={cfg.engine} onChange={(v) => setCfg({ engine: v })} disabled={why} stretch options={[
        { value: "paddle", label: "PaddleOCR" }, { value: "tesseract", label: "Tesseract 5.5.3" }, { value: "nocr", label: "nOCR สอนเอง" },
        { value: "binary", label: "Binary OCR สอนเอง" }, { value: "own", label: "ตัวสอนเองของชั้นหนัง" }]} />
      {matcher ? <>
        <span className="ocr-f">ฐาน</span>
        <Dropdown label="ฐานตัวอักษร" value={cfg[dbKey]} onChange={(v) => setCfg({ [dbKey]: v } as Partial<OcrCfg>)} disabled={why} stretch options={dbOpts} />
        <button type="button" className="btn btn-ghost ocr-dbbtn" onClick={onDb} title="ฐานใหม่ เปลี่ยนชื่อ ลบฐาน และแก้ตัวอักษรในฐาน" aria-label="จัดการฐานตัวอักษร" data-ocr-db-open><IcSettings size={15} /></button>
        {cfg.engine !== "binary" ? <>
          <span className="ocr-f">จุดผิดที่ยอม<InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} /></span>
          <input className="inp ocr-numi" inputMode="numeric" value={cfg.maxWrong} disabled={busy} title={why} aria-label="จุดผิดที่ยอม" onChange={(e) => setCfg({ maxWrong: num(e.target.value, 0, 200) })} />
        </> : <>
          <span className="ocr-f">ผิดได้<InfoTip title="เปอร์เซ็นต์ผิดสูงสุด" tip={BINERR_TIP} /></span>
          <input className="inp ocr-numi" inputMode="numeric" value={Math.round(cfg.binMaxErr * 100)} disabled={busy} title={why ?? "เปอร์เซ็นต์ที่ภาพต่างจากตัวในฐานได้"} aria-label="เปอร์เซ็นต์ผิดสูงสุด" onChange={(e) => setCfg({ binMaxErr: num(e.target.value, 0, 100) / 100 })} />
          <span className="small">%</span>
        </>}
        {cfg.engine !== "own" && <>
          <span className="ocr-f">จุดเว้นวรรค<InfoTip title="จุดที่นับเป็นเว้นวรรค" tip={SPACE_TIP} /></span>
          <input className="inp ocr-numi" inputMode="numeric" value={cfg.engine === "binary" ? cfg.binSpacePx : cfg.spacePx} disabled={busy} title={why} aria-label="จุดที่นับเป็นเว้นวรรค"
            onChange={(e) => setCfg(cfg.engine === "binary" ? { binSpacePx: num(e.target.value, 1, 99) } : { spacePx: num(e.target.value, 0, 99) })} />
        </>}
      </> : cfg.engine === "paddle" ? <>
        <span className="ocr-f">ขนาด<InfoTip title="ขนาดโมเดล" tip={SIZE_TIP} /></span>
        <Seg small label="ขนาดโมเดล" value={cfg.paddle.size} onChange={(v) => setCfg({ paddle: { ...cfg.paddle, size: v } })} disabledReason={why ?? (v5 ? "โมเดลของภาษานี้มีขนาดเดียว" : undefined)}
          options={[{ value: "tiny", label: "tiny" }, { value: "small", label: "small" }, { value: "medium", label: "medium" }]} />
        <span className="ocr-f">ภาษา</span>
        <Dropdown label="ภาษา" value={cfg.paddle.lang} onChange={(v) => setCfg({ paddle: { ...cfg.paddle, lang: v } })} disabled={why} options={PADDLE_LANGS.map((l) => ({ value: l.value, label: plang.langs.some((x) => x.code === l.value && !x.have) ? `${l.label} ต้องโหลด` : l.label }))} />
      </> : <>
        <span className="ocr-f">ภาษา</span>
        <Dropdown label="ภาษา" value={cfg.tess.lang} onChange={(v) => setCfg({ tess: { ...cfg.tess, lang: v } })} disabled={why} search hint="พิมพ์ชื่อภาษา"
          options={(tess.length ? tess.filter((l) => l.have) : [{ code: "eng", name: "อังกฤษ", have: "bundled" as const }]).map((l) => ({ value: l.code, label: `${tessName(l)} ${l.code}` }))} />
      </>}
      <span className="sv-sep" aria-hidden />
      <span className="ocr-f">ตัวช่วยตรวจ<InfoTip title="ตัวช่วยตรวจ" tip={CHECK_TIP} /></span>
      <Dropdown label="ตัวช่วยตรวจ" value={helper} onChange={(v) => setCfg({ helpers: v === "none" ? [] : [v] })} disabled={why} stretch options={[
        { value: "none", label: "ไม่ใช้" }, { value: "tesseract", label: "Tesseract 5.5.3" },
        { value: "paddle:medium", label: "PaddleOCR medium" }, { value: "paddle:small", label: "PaddleOCR small" }, { value: "paddle:tiny", label: "PaddleOCR tiny" },
        { value: "nocr", label: "nOCR" }, { value: "own", label: "ตัวสอนเองของชั้นหนัง" }]} />
    </div>
  );
}

/* ---------- ตาราง ---------- */
export function OcrTable({ rows, sel, setSel, onlyFlag, onlyForced, imgs, need, current, multi, setMulti }: { rows: OcrRow[]; sel: number; setSel: (i: number) => void; onlyFlag: boolean; onlyForced: boolean; imgs: Map<number, SubImg>; need: (n: number) => void; current: number | null; multi: Set<number>; setMulti: (s: Set<number>) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const list = rows.map((r, i) => ({ r, i })).filter(({ r }) => (!onlyFlag || rowReasons(r).length) && (!onlyForced || r.item.forced));
  // ขอภาพของแถวที่เห็นในกรอบ
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) need(Number((e.target as HTMLElement).dataset.n)); }, { root: el, rootMargin: "300px 0px" });
    el.querySelectorAll("tr[data-n]").forEach((tr) => io.observe(tr));
    return () => io.disconnect();
  });
  // แถวที่เลือกหรือกำลังอ่านเลื่อนมาให้เห็น
  useEffect(() => {
    const i = current ?? sel;
    box.current?.querySelector(`tr[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, sel]);
  return (
    <div className="ocr-grid" ref={box} data-ocr-table>
      <table>
        <colgroup><col style={{ width: 52 }} /><col style={{ width: 120 }} /><col style={{ width: 240 }} /><col style={{ width: 40 }} /><col /><col style={{ width: 176 }} /></colgroup>
        <thead><tr><th className="num">#</th><th>เวลา</th><th><span className="ocr-th">ภาพ<BgPick /></span></th><th aria-label="ขยายภาพ" /><th>ข้อความ</th><th><span className="ocr-th">ตรวจ<InfoTip title="จุดที่ต้องตรวจ" tip={FLAG_TIP} /></span></th></tr></thead>
        <tbody>{list.map(({ r, i }) => {
          const rs = rowReasons(r);
          return (
            <tr key={i} data-n={r.item.n} data-i={i} className={(sel === i || multi.has(i) ? "on" : "") + (rs.length ? " flag" : "")} aria-selected={sel === i || multi.has(i)}
              onClick={(e) => {
                // Ctrl เลือกเพิ่มหรือเอาออก Shift เลือกช่วงจากบรรทัดที่เลือกอยู่ แบบตารางของ Subtitle Edit
                // เลือกได้เฉพาะแถวที่เห็น · เปิดสวิตช์เฉพาะจุดที่ต้องตรวจแล้วแถวที่ซ่อนไม่โดนเลือกไปลบหรือเติมข้อความ (ผู้ช่วยตรวจทาน U2)
                const seen = new Set(list.map((x) => x.i));
                if (e.ctrlKey || e.metaKey) { const m = new Set(multi.size ? multi : seen.has(sel) ? [sel] : []); if (m.has(i)) m.delete(i); else m.add(i); setMulti(m); setSel(i); return; }
                if (e.shiftKey) { const m = new Set<number>(); const a = seen.has(sel) ? sel : i; for (let k = Math.min(a, i); k <= Math.max(a, i); k++) if (seen.has(k)) m.add(k); setMulti(m); return; }
                setMulti(new Set()); setSel(i);
              }}>
              <td className="num">{r.item.n}{r.item.forced && <span className="ocr-forced" title="ซับบังคับ (forced) ขึ้นแม้ปิดซับ">บังคับ</span>}</td>
              <td className="ocr-time">{ts(r.item.start)}<span>{r.item.end != null ? `${(r.item.end - r.item.start).toFixed(1)} วิ` : ""}</span></td>
              <td><LineImg img={imgs.get(r.item.n)} n={r.item.n} zoom={false} /></td>
              <td className="ocr-zcol"><ZoomCell img={imgs.get(r.item.n)} n={r.item.n} /></td>
              <td>{r.state === "done" ? (r.text ? <Txt r={r} /> : <span className="small ocr-dim">ไม่มีข้อความ</span>)
                : r.state === "work" ? <span className="small ocr-reading">กำลังอ่าน…</span>
                : r.state === "fail" ? <span className="small ocr-dim" title={r.error ?? undefined}>อ่านไม่สำเร็จ</span>
                : <span className="small ocr-dim">—</span>}</td>
              <td>{r.state === "done" ? (rs.length ? <FlagChips rs={rs} /> : <span className="ocr-ok"><IbTick size={13} />{r.ok ? "ตรวจแล้ว" : "ไม่มีจุดสงสัย"}</span>) : null}</td>
            </tr>);
        })}</tbody>
      </table>
    </div>
  );
}
function ZoomCell({ img, n }: { img: SubImg | undefined; n: number }) {
  const [big, setBig] = useState(false);
  return (<>
    <button type="button" className="btn btn-ghost btn-sm ocr-zb" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${n} เต็มหน้าต่าง`} disabled={!img} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={13} /></button>
    {big && img && <BigView img={img} n={n} line onClose={() => setBig(false)} />}
  </>);
}

/* ---------- ช่องแก้ข้อความล่างตาราง ---------- */
/** ใส่แท็กรอบส่วนที่เลือกในช่องพิมพ์ ไม่ได้เลือกใส่ทั้งข้อความ · กดซ้ำเอาแท็กออก */
function wrapTag(ta: HTMLTextAreaElement | null, text: string, tag: "i" | "b"): string {
  const open = `<${tag}>`, close = `</${tag}>`;
  if (!ta || ta.selectionStart === ta.selectionEnd) {
    const all = text.startsWith(open) && text.endsWith(close);
    return all ? text.slice(open.length, -close.length) : `${open}${text}${close}`;
  }
  const a = ta.selectionStart, b = ta.selectionEnd, mid = text.slice(a, b);
  return text.slice(0, a) + (mid.startsWith(open) && mid.endsWith(close) ? mid.slice(open.length, -close.length) : `${open}${mid}${close}`) + text.slice(b);
}
function useFrame(movie: string, r: OcrRow | undefined, on: boolean) {
  const [f, setF] = useState<string | null>(null);
  useEffect(() => {
    setF(null);
    if (!on || !movie || !r) return;
    let live = true;
    const mid = r.item.end != null ? (r.item.start + r.item.end) / 2 : r.item.start + 0.5;
    subApi.frame(movie, mid, 360).then((u) => { if (live) setF(u); }, () => {});
    return () => { live = false; };
  }, [movie, r?.item.n, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return f;
}
/** ปุ่มคัดลอกภาพกับบันทึกภาพของภาพที่เลือก (Subtitle Edit มีในเมนูคลิกขวาของตาราง) · ผลสำเร็จหายเอง ผิดพลาดค้างจนกดปิด (สกิล save-status) */
function ImgOut({ i, n }: { i: number; n: number }) {
  const [st, setSt] = useState<{ s: "busy" | "ok" | "bad"; m: string } | null>(null);
  useEffect(() => { if (st?.s !== "ok") return; const t = setTimeout(() => setSt(null), 4000); return () => clearTimeout(t); }, [st]);
  useEffect(() => setSt(null), [i]);
  const w = window as unknown as { __ocrImgDry?: boolean; __ocrImgTarget?: string };
  const copy = async () => {
    setSt({ s: "busy", m: "" });
    try { await ocrApi.imageOut(i, "copy", null, import.meta.env.DEV && !!w.__ocrImgDry); setSt({ s: "ok", m: `คัดลอกภาพ ${n} แล้ว` }); } catch (e) { setSt({ s: "bad", m: String(e) }); }
  };
  const save = async () => {
    const p = import.meta.env.DEV && w.__ocrImgTarget ? `${w.__ocrImgTarget}/ภาพซับ ${n}.png` : await pickSave(`ภาพซับ ${n}.png`, "png", "ภาพ PNG");
    if (!p) return;
    setSt({ s: "busy", m: "" });
    try { const f = await ocrApi.imageOut(i, "save", p); setSt({ s: "ok", m: `บันทึกแล้ว ${baseName(f)}` }); } catch (e) { setSt({ s: "bad", m: String(e) }); }
  };
  return (<>
    <button type="button" className="btn btn-ghost btn-sm ocr-ic" title="คัดลอกภาพซับนี้" aria-label="คัดลอกภาพ" onClick={() => void copy()} data-ocr-copyimg><IcCopy size={14} /></button>
    <button type="button" className="btn btn-ghost btn-sm ocr-ic" title="บันทึกภาพซับนี้เป็นไฟล์ PNG" aria-label="บันทึกภาพ" onClick={() => void save()} data-ocr-saveimg><IbSave size={14} /></button>
    {st && st.s !== "busy" && <span className={"small ocr-imgst " + st.s} title={st.m} data-ocr-imgst={st.s} onClick={() => { if (st.s === "bad") setSt(null); }}>{st.s === "ok" ? st.m : "ทำไม่สำเร็จ กดเพื่อปิด"}</span>}
  </>);
}
export const baseName = (p: string) => p.split("/").pop()?.split(String.fromCharCode(92)).pop() ?? p;

export function EditArea({ i, rows, movie, imgs, setSel, onTeach, onUnknown, onInspect, picked, onDelete, onFill, clipMsg }: { i: number; rows: OcrRow[]; movie: string; imgs: Map<number, SubImg>; setSel: (i: number) => void; onTeach: () => void; onUnknown: (w: string, i: number) => void; onInspect: () => void; picked: number; onDelete: () => void; onFill: () => void; clipMsg: string | null }) {
  const r = rows[i];
  const [tab, setTab] = useState<"flag" | "word" | "fix" | "guess">("flag");
  const [frameOn, setFrameOn] = useState(true);
  const ta = useRef<HTMLTextAreaElement>(null);
  const frame = useFrame(movie, r, frameOn);
  const flagged = rows.map((x, k) => ({ x, k })).filter(({ x }) => rowReasons(x).length);
  const words = rows.flatMap((x, k) => (x.line && !x.ok ? x.line.unknown.filter((w) => x.text.includes(w)).map((w) => ({ w, k })) : []));
  const fixes = rows.flatMap((x, k) => (x.line ? x.line.fixes.map((f) => ({ f, k })) : []));
  const guesses = rows.flatMap((x, k) => (x.line ? x.line.guesses.map((f) => ({ f, k })) : []));
  const helper = r?.line?.reasons.find((x) => x.kind === "disagree") as Extract<OcrReason, { kind: "disagree" }> | undefined;
  const { cfg, running } = useOcrJob();
  if (!r) return null;
  const set = (t: string) => setRowText(i, t);
  return (
    <div className="ocr-edit" data-ocr-edit>
      <div className="ocr-editl">
        {/* เวลาอยู่ในคำบอกตอนชี้ หัวช่องแคบ ใส่ปุ่มคัดลอกบันทึกภาพแล้วชื่อตกสองบรรทัด เวลาตัวอักษรถ่าง (เจอตอนดูภาพ 16 พ.ย. 2569) */}
        <div className="ocr-edhead"><b title={`${ts(r.item.start)}${r.item.end != null ? `–${ts(r.item.end)}` : ""}`} data-ocr-edtitle>ภาพ {r.item.n}</b><span style={{ flex: 1 }} />
          <ImgOut i={i} n={r.item.n} />
          <label className={"sv-frame" + (movie ? "" : " off")} title={movie ? undefined : "ซับที่เปิดจากไฟล์ซับ ไม่มีไฟล์หนังให้ดึงภาพ"}><Switch on={frameOn && !!movie} onChange={(v) => { if (movie) setFrameOn(v); }} label="ภาพจากหนังข้างหลังซับ" /><span>ภาพหนัง</span></label></div>
        <ScreenImg img={imgs.get(r.item.n)} n={r.item.n} frame={frameOn ? frame : null} />
      </div>
      <div className="ocr-editm">
        <div className="ocr-edhead"><b>ข้อความ</b><span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm ocr-ic" title="ตัวหนา Ctrl+B" aria-label="ตัวหนา" disabled={r.state !== "done"} onClick={() => set(wrapTag(ta.current, r.text, "b"))}><IbBold size={14} /></button>
          <button type="button" className="btn btn-ghost btn-sm ocr-ic" title="ตัวเอียง Ctrl+I" aria-label="ตัวเอียง" disabled={r.state !== "done"} onClick={() => set(wrapTag(ta.current, r.text, "i"))}><IbItalic size={14} /></button>
          {/* ระหว่างอ่านกดไม่ได้ · หน้าต่างตรวจบรรทัดกับงานอ่านใช้ตัวรอคำตอบสอนตัวเดียวกัน คำตอบหนึ่งหายแล้วค้าง (ผู้ช่วยตรวจทาน U7) */}
          <button type="button" className={"btn btn-sm " + (MATCH.includes(cfg.engine) && !running ? "btn-ghost" : "btn-wait")} aria-disabled={!MATCH.includes(cfg.engine) || running || undefined}
            title={running ? "หยุดอ่านก่อน แล้วค่อยตรวจบรรทัด" : MATCH.includes(cfg.engine) ? "แยกบรรทัดเป็นตัว ๆ ดูว่าแต่ละตัวจับคู่กับอะไรในฐาน แก้ ลบ เพิ่มคู่ Ctrl+Shift+I" : INSPECT_OFF} onClick={() => { if (MATCH.includes(cfg.engine) && !running) onInspect(); }} data-ocr-inspect><IcSearch size={14} />ตรวจบรรทัด</button>
          <button type="button" className={"btn btn-sm ocr-ic " + (picked > 1 && !running ? "btn-ghost" : "btn-wait")} aria-disabled={picked < 2 || running || undefined} aria-label="เติมข้อความจากคลิปบอร์ด"
            title={running ? "หยุดอ่านก่อน" : picked > 1 ? `ใส่ข้อความในคลิปบอร์ดลง ${picked} บรรทัดที่เลือก Ctrl+Shift+V` : "เลือกตั้งแต่สองบรรทัดในตาราง (กด Ctrl หรือ Shift ค้างแล้วคลิก) เพื่อใส่ข้อความในคลิปบอร์ดเหมือนกันทุกบรรทัด"}
            onClick={() => { if (picked > 1 && !running) onFill(); }} data-ocr-fill><IcPaste size={14} /></button>
          <button type="button" className={"btn btn-sm ocr-ic " + (running ? "btn-wait" : "btn-ghost")} aria-disabled={running || undefined} aria-label="ลบบรรทัด"
            title={running ? "ระหว่างอ่านลบบรรทัดไม่ได้" : picked > 1 ? `ลบ ${picked} บรรทัดที่เลือก Delete` : "ลบบรรทัดนี้ออกจากรายการ Delete"} onClick={() => { if (!running) onDelete(); }} data-ocr-del><IbTrash size={14} /></button></div>
        {clipMsg && <div className="small ocr-clipmsg" data-ocr-clipmsg>{clipMsg}</div>}
        <textarea ref={ta} className="inp ocr-ta" value={r.text} spellCheck={false} disabled={r.state !== "done"} placeholder={r.state === "done" ? "ภาพนี้ไม่มีข้อความ" : "ยังไม่ได้อ่านภาพนี้"} data-ocr-text
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => { if (e.ctrlKey && (e.key === "i" || e.key === "b")) { e.preventDefault(); set(wrapTag(ta.current, r.text, e.key as "i" | "b")); } }} />
        {hasTop(r) && <div className="small ocr-posnote"><span className="ocr-pos">บนจอ</span><Phr>บรรทัดนี้อยู่บนจอ ตอนส่งออกจะเก็บตำแหน่งไว้</Phr><InfoTip title="ตำแหน่งบนจอ" tip={POS_TIP} /></div>}
        {helper && !r.ok && <div className="small ocr-other" data-ocr-helper><span className="ocr-otherl">{helper.engine}อ่านได้</span><b>{helper.text.replace(/\n/g, " ")}</b>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set(helper.text)}>ใช้คำนี้</button></div>}
      </div>
      <div className="ocr-editr">
        <div className="ocr-edhead"><b>รายการ</b>
          <Dropdown label="รายการ" value={tab} onChange={setTab} stretch options={[{ value: "flag", label: `จุดที่ต้องตรวจ ${flagged.length} จุด` }, { value: "word", label: `คำที่ไม่รู้จัก ${words.length} คำ` }, { value: "fix", label: `ที่ตัวแก้คำแก้ให้ ${fixes.length} จุด` }, { value: "guess", label: `คำที่เดา ${guesses.length} คำ` }]} /></div>
        <div className="ocr-elist" data-ocr-list={tab}>
          {tab === "flag" && flagged.map(({ x, k }) => <button key={k} type="button" className={"ocr-eitem" + (k === i ? " on" : "")} onClick={() => setSel(k)}><b>ภาพ {x.item.n}</b><span>{kinds(rowReasons(x)).map((f) => REASON_NAME[f]).join(" และ ")}</span></button>)}
          {tab === "word" && words.map(({ w, k }) => <button key={w + k} type="button" className={"ocr-eitem" + (k === i ? " on" : "")} onClick={() => { setSel(k); onUnknown(w, k); }}><b>{w}</b><span>ภาพ {rows[k].item.n} กดเพื่อแก้</span></button>)}
          {tab === "fix" && fixes.map(({ f, k }, n) => <button key={n} type="button" className="ocr-eitem" onClick={() => setSel(k)}><b>ภาพ {rows[k].item.n}</b><span>{f[0]} → {f[1]}</span></button>)}
          {tab === "guess" && guesses.map(({ f, k }, n) => <button key={n} type="button" className="ocr-eitem" onClick={() => setSel(k)}><b>ภาพ {rows[k].item.n}</b><span>{f[0]} → {f[1]}</span></button>)}
        </div>
        <div className="ocr-eact">
          <button type="button" className={"btn ocr-w2 " + (MATCH.includes(cfg.engine) ? "btn-ghost" : "btn-wait")} aria-disabled={!MATCH.includes(cfg.engine) || undefined}
            title={MATCH.includes(cfg.engine) ? "อ่านภาพนี้ใหม่แล้วหยุดสอนทุกตัวที่ฐานไม่รู้จัก" : TEACH_OFF}
            onClick={() => { if (MATCH.includes(cfg.engine)) onTeach(); }} data-ocr-teach><IbPencil size={15} />สอนตัวอักษร</button>
          <button type="button" className={"btn ocr-w2 " + (r.state === "done" ? "btn-ghost" : "btn-wait")} aria-disabled={r.state !== "done" || undefined} title={r.state === "done" ? (r.ok ? "เอาเครื่องหมายตรวจแล้วออก" : "บรรทัดนี้ถูกแล้ว ไม่ต้องตรวจ") : "ยังไม่ได้อ่านภาพนี้"}
            onClick={() => { if (r.state !== "done") return; setRowOk(i, !r.ok); if (!r.ok) { const nx = flagged.find(({ k }) => k > i); if (nx) setSel(nx.k); } }} data-ocr-ok><IbTick size={15} /><Keep all={["ถูกแล้ว", "ยกเลิกถูก"]}>{r.ok ? "ยกเลิกถูก" : "ถูกแล้ว"}</Keep></button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ตรวจทานแบบทีละจุด ภาพซ้าย คำขวา (⑤) ---------- */
export function ReviewOne({ rows, movie, imgs, need, sel, setSel, onTeach }: { rows: OcrRow[]; movie: string; imgs: Map<number, SubImg>; need: (n: number) => void; sel: number; setSel: (i: number) => void; onTeach: () => void }) {
  const flagged = rows.map((x, k) => ({ x, k })).filter(({ x }) => rowReasons(x).length);
  const at = Math.max(0, flagged.findIndex(({ k }) => k === sel));
  const cur = flagged[at];
  const r = cur?.x;
  useEffect(() => { if (cur && cur.k !== sel) setSel(cur.k); }, [cur?.k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (r) need(r.item.n); }, [r?.item.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = useFrame(movie, r, true);
  const canTeach = MATCH.includes(useOcrJob().cfg.engine);
  if (!r || !cur) return <div className="ocr-onebody" data-ocr-one><div className="stat ok"><CardIcon kind="ok" /><div><b>ไม่มีจุดที่ต้องตรวจแล้ว</b><Phr>ทุกบรรทัดไม่มีจุดสงสัย หรือกดว่าถูกแล้วครบ ดูทุกภาพได้จากแบบตาราง</Phr></div></div></div>;
  const helper = r.line?.reasons.find((x) => x.kind === "disagree") as Extract<OcrReason, { kind: "disagree" }> | undefined;
  const go = (d: number) => { const nx = flagged[at + d]; if (nx) setSel(nx.k); };
  return (
    <div className="ocr-onebody" data-ocr-one>
      <div className="ocr-onelist">{flagged.map(({ x, k }, n) => (
        <button key={k} type="button" className={"ocr-eitem" + (k === cur.k ? " on" : "")} onClick={() => setSel(k)}>
          <b>{n + 1}. ภาพ {x.item.n}</b><span>{kinds(rowReasons(x)).map((f) => REASON_NAME[f]).join(" และ ")}</span></button>))}
      </div>
      <div className="ocr-onemain">
        <div className="ocr-fitbox"><ScreenImg img={imgs.get(r.item.n)} n={r.item.n} frame={frame} /></div>
        <div className="ocr-onefields">
          <div className="ocr-onerow"><span className="ocr-onelbl">ตัวหลักอ่านได้</span><textarea className="inp ocr-ta" value={r.text} spellCheck={false} onChange={(e) => setRowText(cur.k, e.target.value)} data-ocr-onetext /></div>
          <div className="ocr-onerow"><span className="ocr-onelbl">ตัวช่วยตรวจ</span><div className="ocr-onechk">{helper ? helper.text : r.line?.helpers[0]?.[1] ?? "—"}</div></div>
          <div className="ocr-onerow"><span className="ocr-onelbl">เหตุที่สงสัย</span><div className="ocr-why"><FlagChips rs={rowReasons(r)} /><span className="small">{whyText(rowReasons(r))}</span></div></div>
        </div>
        <div className="ocr-oneact">
          <button type="button" className={"btn btn-sm " + (at > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={at <= 0 || undefined} title={at > 0 ? undefined : "นี่คือจุดแรก"} onClick={() => go(-1)}><IbBack size={14} />จุดก่อน</button>
          <button type="button" className={"btn btn-sm " + (canTeach ? "btn-ghost" : "btn-wait")} aria-disabled={!canTeach || undefined} title={canTeach ? "อ่านภาพนี้ใหม่แล้วหยุดสอนทุกตัวที่ฐานไม่รู้จัก" : TEACH_OFF} onClick={() => { if (canTeach) onTeach(); }}><IbPencil size={14} />สอนตัวอักษร</button>
          <span style={{ flex: 1 }} />
          <button type="button" className={"btn ocr-w " + (helper ? "btn-ghost" : "btn-wait")} aria-disabled={!helper || undefined}
            title={helper ? "แทนข้อความของตัวหลักด้วยข้อความที่ตัวช่วยตรวจอ่านได้" : "ตัวช่วยตรวจอ่านได้ตรงกับตัวหลัก"} onClick={() => { if (helper) setRowText(cur.k, helper.text); }}><IbSwap size={15} />ใช้คำของตัวช่วยตรวจ</button>
          <button type="button" className="btn btn-main ocr-w" onClick={() => { setRowOk(cur.k, true); const nx = flagged[at + 1] ?? flagged[at - 1]; if (nx) setSel(nx.k); }} data-ocr-oknext><IbTick size={15} />ถูกแล้ว ไปจุดถัดไป</button>
        </div>
      </div>
    </div>
  );
}
