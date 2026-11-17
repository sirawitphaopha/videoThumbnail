/* หน้าต่างฐานตัวอักษรของหน้า OCR (แผน OCR ขั้น 11 ระบบแมนนวล) · หน้าตาตามมอคอัปแก้ฐานที่พี่กันไล่แก้แล้ว
   ปุ่มฐานใหม่ เปลี่ยนชื่อ ลบฐาน ตาม NOcrSettingsWindow BinaryOcrSettingsWindow กับ NOcrDbNewWindow ของ Subtitle Edit
   ส่วนแก้ฐาน ตาม NOcrDbEditWindow BinaryOcrDbEditWindow ซ้ายเลือกตัวอักษร เห็นทุกรูปแบบที่สอนไว้ ขวาแก้รูปแบบที่เลือก (ข้อความ ตัวเอียง ลบ ซูม)
   ปุ่มวาดเส้นของหน้าต่างแก้ฐานใน Subtitle Edit ไม่ได้ทำ เพราะต้นฉบับไม่บันทึกเส้นที่วาด (Update เก็บแค่ข้อความกับตัวเอียง) */
import { useEffect, useMemo, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import InfoTip from "../../components/InfoTip";
import Dropdown from "../../components/Dropdown";
import { CardIcon, Phr, Switch } from "../../components/ui";
import { IbTick, IcClose, IcPlus } from "../../components/icons";
import { ocrApi, type OcrDbChars, type OcrDbItem, type OcrDbKind } from "../../lib/api";
import { setOcrCfg, useOcrJob } from "../../lib/ocrJob";
import { LINES_TIP } from "./OcrPage";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";
const EXT: Record<OcrDbKind, string> = { nocr: "nocr", binary: "db", own: "nocr" };
const DB_KEY = { nocr: "nocrDb", binary: "binDb", own: "ownDb" } as const;
const ZOOM_KEY = "ms.ocrDbZoom";

/** รูปแบบหนึ่งตัว · nOCR วาดเส้นเทียบบนพื้นเทา (ฐานไม่เก็บภาพ) Binary OCR แสดงภาพ · เส้นเขียวผ่านเนื้อตัว เส้นแดงผ่านที่ว่าง */
export function GlyphView({ it, box, zoom }: { it: OcrDbItem; box?: number; zoom?: number }) {
  const w = Math.max(1, it.w), h = Math.max(1, it.h);
  const k = zoom ?? Math.max(1, Math.min(8, (box ?? 60) / Math.max(w, h)));
  const style = { width: w * k, height: h * k };
  if (it.png) return <img className="ocr-gv ocr-gvimg" src={it.png} alt={`ภาพของ ${it.text}`} style={style} />;
  return (
    <svg className="ocr-gv" viewBox={`0 0 ${w} ${h}`} style={style} role="img" aria-label={`เส้นเทียบของ ${it.text}`}>
      <rect x={0} y={0} width={w} height={h} className="ocr-gvbg" />
      {it.bg.map(([a, b, c, d], i) => <line key={"b" + i} x1={a + 0.5} y1={b + 0.5} x2={c + 0.5} y2={d + 0.5} className="miss" />)}
      {it.fg.map(([a, b, c, d], i) => <line key={"f" + i} x1={a + 0.5} y1={b + 0.5} x2={c + 0.5} y2={d + 0.5} className="hit" />)}
    </svg>);
}

type Ask = null | { kind: "new" | "rename"; value: string } | { kind: "delete" } | { kind: "delItem" };

export function DbDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cfg, running } = useOcrJob();
  const kind = (cfg.engine === "binary" ? "binary" : cfg.engine === "own" ? "own" : "nocr") as OcrDbKind;
  const name = cfg[DB_KEY[kind]];
  const [db, setDb] = useState<OcrDbChars | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ch, setCh] = useState("");
  const [key, setKey] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [italic, setItalic] = useState(false);
  const [ask, setAsk] = useState<Ask>(null);
  // ซูม 0 คือพอดีกรอบ (ค่าตั้งต้น แคลร์ตั้ง) · กดย่อขยายแล้วจำเป็นจำนวนเท่า แบบ NOcrZoomFactor ของ Subtitle Edit
  const [zoom, setZoom] = useState(() => { try { return Math.max(0, Math.min(20, Number(localStorage.getItem(ZOOM_KEY)) || 0)); } catch { return 0; } });
  const canvas = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<[number, number]>([400, 200]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const nameBox = useRef<HTMLInputElement>(null);
  const why = running ? "หยุดอ่านก่อนจึงจะแก้ฐานได้" : undefined;

  const load = (keep?: string) => {
    setErr(null);
    ocrApi.dbChars(kind, name).then((d) => {
      setDb(d);
      const chars = [...new Set(d.items.map((i) => i.text).filter((t) => t.trim()))].sort();
      setCh((c) => (keep && chars.includes(keep) ? keep : chars.includes(c) ? c : chars[0] ?? ""));
    }, (e) => { setDb(null); setErr(String(e)); });
  };
  useEffect(() => { if (open) { setAsk(null); setMsg(null); load(); } }, [open, kind, name]); // eslint-disable-line react-hooks/exhaustive-deps

  const chars = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of db?.items ?? []) if (i.text.trim()) m.set(i.text, (m.get(i.text) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }, [db]);
  const vars = useMemo(() => (db?.items ?? []).filter((i) => i.text === ch), [db, ch]);
  useEffect(() => { setKey(vars[0]?.key ?? null); }, [vars]);
  const cur = vars.find((v) => v.key === key) ?? null;
  useEffect(() => { setText(cur?.text ?? ""); setItalic(!!cur?.italic); }, [cur]);
  useEffect(() => { if (ask && (ask.kind === "new" || ask.kind === "rename")) setTimeout(() => nameBox.current?.select(), 0); }, [ask]);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }, [msg]);
  const zoomTo = (z: number) => { const v = Math.max(0, Math.min(20, z)); setZoom(v); try { localStorage.setItem(ZOOM_KEY, String(v)); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } };

  const run = async (f: () => Promise<unknown>, done: string, after?: () => void) => {
    setErr(null); setMsg(null);
    try { await f(); setMsg(done); after?.(); } catch (e) { setErr(String(e)); }
  };
  const submitName = () => {
    if (!ask || (ask.kind !== "new" && ask.kind !== "rename")) return;
    const v = ask.value.trim();
    if (!v) return;
    if (ask.kind === "new") void run(() => ocrApi.dbNew(kind, v), `สร้างฐาน ${v}.${EXT[kind]} แล้ว`, () => { setAsk(null); setOcrCfg({ [DB_KEY[kind]]: v }); });
    else void run(() => ocrApi.dbRename(kind, name, v), `เปลี่ยนชื่อเป็น ${v}.${EXT[kind]} แล้ว`, () => { setAsk(null); setOcrCfg({ [DB_KEY[kind]]: v }); });
  };
  const save = () => { if (cur && text.trim()) void run(() => ocrApi.dbCharUpdate(kind, name, cur.key, cur.text, text, italic), `บันทึกตัว ${text} แล้ว`, () => load(text)); };
  const delItem = () => { if (cur) void run(() => ocrApi.dbCharDelete(kind, name, cur.key, cur.text), `ลบรูปแบบของตัว ${cur.text} แล้ว`, () => { setAsk(null); load(cur.text); }); };
  const delDb = () => void run(() => ocrApi.dbDelete(kind, name), `ลบฐาน ${name}.${EXT[kind]} ลงถังขยะแล้ว`, () => { setAsk(null); onClose(); });

  const fit = cur ? Math.max(1, Math.min(20, Math.floor(Math.min((box[0] - 18) / Math.max(1, cur.w), (box[1] - 18) / Math.max(1, cur.h))))) : 1;
  const z = zoom || fit;
  const label = kind === "binary" ? "Binary OCR" : kind === "own" ? "ตัวสอนเอง" : "nOCR";
  const fileWhy = db?.bundled ? "ฐานที่แนบมากับโปรแกรมเปลี่ยนชื่อหรือลบไม่ได้ แก้หรือสอนตัวอักษรแล้วจะได้สำเนาในเครื่องที่เปลี่ยนชื่อและลบได้"
    : db && !db.saved ? "ฐานนี้ยังไม่มีไฟล์ สอนตัวอักษรก่อนจึงจะเปลี่ยนชื่อหรือลบได้" : undefined;
  const tbtn = (txt: string, onClick: () => void, dis: string | undefined, data: string) => (
    <button type="button" className={"btn btn-sm " + (dis ? "btn-wait" : "btn-ghost")} aria-disabled={!!dis || undefined} title={dis} onClick={() => { if (!dis) onClick(); }} data-db={data}>{txt}</button>);
  return (
    <Dialog open={open} onClose={onClose} kind="work" title={`ฐานตัวอักษร ${label} ${name}.${EXT[kind]}`} width={DLG_W} height={DLG_H}
      actions={<><span style={{ flex: 1 }} /><button type="button" className="btn btn-main" onClick={onClose}><IcClose size={15} />ปิด</button></>}>
      <div className="ocr-dlg ocr-db" data-ocr-db-dlg>
        <div className="ocr-dbl">
          <div className="icv-head">ตัวอักษร<span className="small" style={{ fontWeight: 400 }}>{db ? `${chars.length.toLocaleString("en-US")} ตัว ${db.total.toLocaleString("en-US")} รูปแบบ` : ""}</span></div>
          <div style={{ display: "flex" }}><Dropdown label="ตัวอักษร" value={ch} onChange={setCh} search stretch hint="พิมพ์ตัวที่หา" disabled={chars.length ? undefined : "ฐานนี้ยังไม่มีตัวอักษร"}
            display={(o) => o?.label ?? "ฐานว่าง"} options={chars.map(([c, n]) => ({ value: c, label: `${c}  ${n} รูปแบบ` }))} /></div>
          <div className="ocr-dbvars" data-db-vars>{vars.map((v, i) => (
            <button key={v.key} type="button" className={"ocr-lch" + (key === v.key ? " on" : "")} onClick={() => setKey(v.key)} data-db-var={v.key}>
              <GlyphView it={v} box={56} /><span className="small">{v.italic ? "ตัวเอียง" : v.expand > 1 ? `${v.expand} ชิ้น` : `รูปแบบ ${i + 1}`}</span></button>))}
            {db && !chars.length && <span className="small ocr-dbempty"><Phr>ฐานนี้ยังว่าง สอนตัวอักษรระหว่างอ่านหรือฝึกจากฟอนต์แล้วตัวจะขึ้นที่นี่</Phr></span>}</div>
          {ask && (ask.kind === "new" || ask.kind === "rename") ? (
            <div className="icv-row" data-db-ask>
              <input ref={nameBox} className="inp" style={{ flex: 1, minWidth: 0 }} value={ask.value} aria-label={ask.kind === "new" ? "ชื่อฐานใหม่" : "ชื่อใหม่ของฐาน"} placeholder="ชื่อฐาน"
                onChange={(e) => setAsk({ ...ask, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitName(); } else if (e.key === "Escape") { e.stopPropagation(); setAsk(null); } }} data-db-name />
              <button type="button" className={"btn btn-sm " + (ask.value.trim() ? "btn-main" : "btn-wait")} aria-disabled={!ask.value.trim() || undefined} title={ask.value.trim() ? undefined : "พิมพ์ชื่อฐานก่อน"} onClick={submitName} data-db-ok>ตกลง</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>ยกเลิก</button></div>
          ) : ask?.kind === "delete" ? (
            <div className="ocr-dbask" data-db-ask><Phr>{`ลบฐาน ${name}.${EXT[kind]} ที่มี ${(db?.total ?? 0).toLocaleString("en-US")} รูปแบบลงถังขยะ`}</Phr>
              <div className="ocr-dbtools"><button type="button" className="btn btn-danger btn-sm" onClick={delDb} data-db-del-ok>ลบฐาน</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>ยกเลิก</button></div></div>
          ) : (
            <div className="ocr-dbtools">
              {tbtn("ฐานใหม่", () => setAsk({ kind: "new", value: "" }), why, "new")}
              {tbtn("เปลี่ยนชื่อ", () => setAsk({ kind: "rename", value: name }), why ?? fileWhy, "rename")}
              {tbtn("ลบฐาน", () => setAsk({ kind: "delete" }), why ?? fileWhy, "delete")}
            </div>)}
        </div>
        <div className="ocr-dbr">
          <div className="icv-head">รูปแบบที่เลือก{kind !== "binary" && <InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} />}</div>
          {err && <div className="stat bad" data-db-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>ทำกับฐานไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
          {msg && !err && <div className="stat ok" data-db-msg><CardIcon kind="ok" /><Phr>{msg}</Phr></div>}
          {cur ? <>
            <div className="ocr-dbcanvas" ref={canvas} data-db-canvas><GlyphView it={cur} zoom={z} /></div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>ซูม</span>
              <button type="button" className={"btn btn-sm " + (z > 1 ? "btn-ghost" : "btn-wait")} aria-disabled={z <= 1 || undefined} title={z > 1 ? "ย่อ" : "ย่อสุดแล้ว"} aria-label="ย่อ" onClick={() => { if (z > 1) zoomTo(z - 1); }} data-db-zout>−</button>
              <span className="small" style={{ minWidth: 44, textAlign: "center" }} data-db-zoom>{z} เท่า</span>
              <button type="button" className={"btn btn-sm " + (z < 20 ? "btn-ghost" : "btn-wait")} aria-disabled={z >= 20 || undefined} title={z < 20 ? "ขยาย" : "ขยายสุดแล้ว"} aria-label="ขยาย" onClick={() => { if (z < 20) zoomTo(z + 1); }} data-db-zin><IcPlus size={13} /></button>
              <button type="button" className={"btn btn-sm " + (zoom ? "btn-ghost" : "btn-wait")} aria-disabled={!zoom || undefined} title={zoom ? "ขยายให้พอดีกรอบทุกตัว" : "พอดีกรอบอยู่แล้ว"} onClick={() => { if (zoom) zoomTo(0); }} data-db-zfit>พอดีกรอบ</button></div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>ตัวนี้คือ</span>
              <input className="inp" style={{ width: 90, fontSize: 18 }} value={text} disabled={running} title={why} aria-label="ข้อความของตัวนี้" onChange={(e) => setText(e.target.value)} data-db-text /></div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>ตัวเอียง</span><Switch on={italic} onChange={(v) => { if (!running) setItalic(v); }} label="ตัวเอียง" /></div>
            <div className="small" data-db-info>{`ขนาด ${cur.w} × ${cur.h} จุด ระยะจากบน ${cur.top} จุด`}{cur.expand > 1 ? ` ตัวนี้ประกอบจาก ${cur.expand} ชิ้นในภาพ` : ""}</div>
            {ask?.kind === "delItem" ? (
              <div className="ocr-dbask" data-db-ask><Phr>{`ลบรูปแบบนี้ของตัว ${cur.text} ออกจากฐาน`}</Phr>
                <div className="ocr-dbtools"><button type="button" className="btn btn-danger btn-sm" onClick={delItem} data-db-delitem-ok>ลบรูปแบบนี้</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setAsk(null)}>ยกเลิก</button></div></div>
            ) : (
              <div className="ocr-dbtools">
                <button type="button" className={"btn btn-sm " + (why || !text.trim() ? "btn-wait" : "btn-ghost")} aria-disabled={!!why || !text.trim() || undefined} title={why ?? (text.trim() ? undefined : "ข้อความของตัวว่างไม่ได้")} onClick={() => { if (!why) save(); }} data-db-save><IbTick size={14} />บันทึก</button>
                <button type="button" className={"btn btn-sm " + (why ? "btn-wait" : "btn-ghost")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) setAsk({ kind: "delItem" }); }} data-db-delitem><IcClose size={14} />ลบรูปแบบนี้</button></div>)}
          </> : <span className="small">{db ? (chars.length ? "เลือกตัวอักษรทางซ้าย" : "ฐานนี้ยังไม่มีตัวอักษร") : err ? "" : "กำลังเปิดฐาน…"}</span>}
        </div>
      </div>
    </Dialog>
  );
}
