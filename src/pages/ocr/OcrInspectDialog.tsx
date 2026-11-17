/* หน้าต่างตรวจบรรทัดของหน้า OCR (แผน OCR ขั้น 11 ระบบแมนนวล) ตาม NOcrInspectWindow BinaryOcrInspectWindow ของ Subtitle Edit
   บนสุด ปุ่มทีละตัวของบรรทัด (ตัวที่ฐานไม่รู้จักเป็น ?) กับภาพบรรทัดที่มีกรอบแดงรอบตัวที่เลือก
   ล่าง ตัวที่เลือก (ขนาดของภาพกับของตัวในฐาน ข้อความ ตัวเอียง บันทึก ลบ เพิ่มคู่ที่ดีกว่า)
   เส้นที่วาด (ล้าง จำนวนเส้น วาดใหม่ วาดเส้นผ่านเนื้อตัวหรือผ่านที่ว่าง) ตัวอย่าง (ภาพตัวพร้อมเส้น ลากวาดเส้นเอง ซูม Ctrl+Z Ctrl+Y)
   ฐาน Binary OCR ไม่มีเส้น ซ่อนส่วนเส้น · ตัวสอนเองของชั้นหนังจับคู่ทีละก้อนหมึก */
import { useEffect, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Phr, Seg, Switch } from "../../components/ui";
import { IbPencil, IbRedo, IbTick, IbUndo, IcClose, IcPlus, IcRefresh } from "../../components/icons";
import { ocrApi, type OcrInspView } from "../../lib/api";
import { getOcrJob, teachOnce, useOcrJob } from "../../lib/ocrJob";
import { LINES_TIP } from "./OcrPage";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";
type L4 = [number, number, number, number];
type Lines = { fg: L4[]; bg: L4[] };
const DRAW_TIP = { w: "ลากบนภาพเพื่อวาดเส้นเอง แล้วกดบันทึกจึงเก็บลงฐาน", o: [
  ["เส้นผ่านเนื้อตัว", "เส้นเขียว ต้องลากผ่านหมึกของตัวอักษร", "", ""],
  ["เส้นผ่านที่ว่าง", "เส้นแดง ต้องลากผ่านที่ว่าง ไม่โดนหมึก", "", ""],
  ["วาดใหม่", "ลบเส้นเดิมแล้วให้โปรแกรมวาดตามจำนวนเส้นที่ตั้ง", "", ""],
] as [string, string, string, string][], r: "Ctrl+Z ย้อนเส้นล่าสุด Ctrl+Y ทำซ้ำ" };

export function InspectDialog({ open, index, onClose }: { open: boolean; index: number; onClose: () => void }) {
  const { cfg } = useOcrJob();
  const [v, setV] = useState<OcrInspView | null>(null);
  const [li, setLi] = useState(-1);
  const [text, setText] = useState("");
  const [italic, setItalic] = useState(false);
  const [lines, setLines] = useState<Lines>({ fg: [], bg: [] });
  const [undo, setUndo] = useState<Lines[]>([]);
  const [redo, setRedo] = useState<Lines[]>([]);
  const [mode, setMode] = useState<"fg" | "bg">("fg");
  const [nLines, setNLines] = useState(cfg.lines);
  const [zoom, setZoom] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [drag, setDrag] = useState<L4 | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [bs, setBs] = useState<[number, number]>([240, 200]);

  const pickFirst = (view: OcrInspView, keep: number) => {
    const ok = (k: number) => k >= 0 && k < view.letters.length && !view.letters[k].special && !view.letters[k].cont;
    setLi(ok(keep) ? keep : view.letters.findIndex((_, k) => ok(k)));
  };
  useEffect(() => {
    if (!open) return;
    setV(null); setErr(null); setMsg(null); setDel(false); setNLines(getOcrJob().cfg.lines);
    ocrApi.inspect(index, getOcrJob().cfg).then((view) => { setV(view); pickFirst(view, -1); }, (e) => setErr(String(e)));
  }, [open, index]);
  const cur = v && li >= 0 ? v.letters[li] : null;
  const m = cur?.m ?? null;
  const hasLines = v?.engine !== "binary";
  useEffect(() => {
    setText(m?.text ?? ""); setItalic(!!m?.italic); setLines({ fg: m?.fg ?? [], bg: m?.bg ?? [] }); setUndo([]); setRedo([]); setDel(false);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3000); return () => clearTimeout(t); }, [msg]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBs([el.clientWidth, el.clientHeight]));
    ro.observe(el);
    return () => ro.disconnect();
  });
  const changeLines = (n: Lines) => { setUndo((u) => [...u, lines]); setRedo([]); setLines(n); };
  // Ctrl+I ตัวเอียง Ctrl+Z ย้อนเส้น Ctrl+Y ทำซ้ำ แบบ KeyDown ของ NOcrInspectViewModel
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "i") { e.preventDefault(); setItalic((x) => !x); }
      else if (k === "z" && hasLines && undo.length && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setRedo((r) => [...r, lines]); setLines(undo[undo.length - 1]); setUndo((u) => u.slice(0, -1)); }
      else if (k === "y" && hasLines && redo.length && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setUndo((u) => [...u, lines]); setLines(redo[redo.length - 1]); setRedo((r) => r.slice(0, -1)); }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, undo, redo, lines, hasLines]);

  const run = async (f: () => Promise<OcrInspView | void>, done: string) => {
    setErr(null); setMsg(null);
    try { const r = await f(); if (r) { setV(r); pickFirst(r, li); } setMsg(done); } catch (e) { setErr(String(e)); }
  };
  const linesChanged = !!m && (JSON.stringify(lines.fg) !== JSON.stringify(m.fg) || JSON.stringify(lines.bg) !== JSON.stringify(m.bg));
  const save = () => { if (m && text) void run(() => ocrApi.inspectUpdate(li, text, italic, hasLines && linesChanged ? lines : null, getOcrJob().cfg), `บันทึกตัว ${text} แล้ว`); };
  const better = async () => {
    setErr(null);
    try {
      const req = await ocrApi.inspectTeach(li, getOcrJob().cfg);
      const a = await teachOnce(req);
      if (a.kind === "learn") { const r = await ocrApi.inspectReload(getOcrJob().cfg); setV(r); pickFirst(r, li); setMsg("เพิ่มคู่ลงฐานแล้ว"); }
    } catch (e) { setErr(String(e)); }
  };
  const fit = cur ? Math.max(1, Math.min(20, Math.floor(Math.min((bs[0] - 16) / Math.max(1, cur.w), (bs[1] - 16) / Math.max(1, cur.h))))) : 1;
  const z = zoom || fit;
  const toPx = (e: React.PointerEvent): [number, number] | null => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !cur) return null;
    return [Math.max(0, Math.min(cur.w - 1, Math.floor((e.clientX - r.left) / z))), Math.max(0, Math.min(cur.h - 1, Math.floor((e.clientY - r.top) / z)))];
  };
  const canDraw = hasLines && !!m;
  const lineEls = (arr: L4[], cls: string) => arr.map(([a, b, c, d], i) => <line key={cls + i} x1={a + 0.5} y1={b + 0.5} x2={c + 0.5} y2={d + 0.5} className={cls} />);

  // ปุ่มทีละตัวแบ่งแถวตามตัวขึ้นบรรทัด · ตัวที่ถูกตัวขยายจับกินไปไม่แสดง
  const rowsOf: { k: number }[][] = [[]];
  v?.letters.forEach((l, k) => { if (l.special === "\n") rowsOf.push([]); else if (!l.cont) rowsOf[rowsOf.length - 1].push({ k }); });
  const title = v ? `ตรวจบรรทัด ภาพที่ ${v.index + 1} ${v.engine === "binary" ? "Binary OCR" : v.engine === "own" ? "ตัวสอนเอง" : "nOCR"} ${v.db}` : "ตรวจบรรทัด";
  const numBtn = (dis: boolean, why: string, label: string, onClick: () => void, child: React.ReactNode, data?: string) => (
    <button type="button" className={"btn btn-sm " + (dis ? "btn-wait" : "btn-ghost")} aria-disabled={dis || undefined} title={dis ? why : label} aria-label={label} onClick={() => { if (!dis) onClick(); }} data-insp={data}>{child}</button>);
  return (
    <Dialog open={open} onClose={() => { if (drag) setDrag(null); else onClose(); }} kind="work" title={title} width={DLG_W} height={DLG_H}
      actions={<><span style={{ flex: 1 }} /><button type="button" className="btn btn-main" onClick={onClose}><IcClose size={15} />ปิด</button></>}>
      <div className="ocr-dlg ocr-insp" data-ocr-insp-dlg>
        <div className="ocr-insptop">
          <div className="ocr-insplets" data-insp-letters>{rowsOf.map((r, ri) => (
            <div key={ri} className="ocr-insprow">{r.map(({ k }) => {
              const l = v!.letters[k];
              if (l.special) return <span key={k} className="ocr-inspgap" title="เว้นวรรค" />;
              return <button key={k} type="button" className={"ocr-insplet" + (k === li ? " on" : "") + (l.m ? "" : " miss")} onClick={() => setLi(k)} title={l.m ? `จับคู่กับ ${l.m.text} ในฐาน` : "ฐานไม่รู้จักตัวนี้"} data-insp-let={k}>
                {l.m ? (l.m.text === " " ? "␣" : l.m.text || "∅") : "?"}</button>;
            })}</div>))}
            {!v && !err && <span className="small">กำลังแยกบรรทัด…</span>}</div>
          {v && <div className="ocr-inspsent" data-insp-sentence>
            <img src={v.sentence} alt={`ภาพบรรทัดของภาพที่ ${v.index + 1}`} />
            {cur && <span className="ocr-insprect" style={{ left: `${(cur.x / Math.max(1, imgW(v))) * 100}%`, top: `${(cur.y / Math.max(1, imgH(v))) * 100}%`, width: `${(cur.w / Math.max(1, imgW(v))) * 100}%`, height: `${(cur.h / Math.max(1, imgH(v))) * 100}%` }} />}</div>}
        </div>
        {err && !cur && <div className="stat bad" data-insp-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>ตรวจบรรทัดไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
        {cur && <div className={"ocr-inspgrid" + (hasLines ? "" : " nolines")}>
          <div className="ocr-inspcol">
            <div className="icv-head">ตัวที่เลือก</div>
            <div className="small" data-insp-info>{`ภาพ ${cur.w} × ${cur.h} จุด ระยะบน ${cur.top} จุด`}</div>
            <div className="small">{m ? `ตัวในฐาน ${m.w} × ${m.h} จุด ระยะบน ${m.top} จุด${m.expand > 1 ? ` ประกอบจาก ${m.expand} ชิ้น` : ""}` : "ฐานไม่รู้จักตัวนี้ กดเพิ่มคู่เพื่อสอน"}</div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 64 }}>ตัวนี้คือ</span>
              <input className="inp" style={{ width: 80, fontSize: 18, fontStyle: italic ? "italic" : undefined }} value={text} disabled={!m} title={m ? undefined : "ตัวนี้ยังไม่มีในฐาน กดเพิ่มคู่ที่ดีกว่าเพื่อสอน"} aria-label="ข้อความของตัวนี้"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} data-insp-text /></div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 64 }}>ตัวเอียง</span><Switch on={italic} onChange={(x) => { if (m) setItalic(x); }} label="ตัวเอียง Ctrl+I" /></div>
            {del ? (
              <div className="ocr-dbask" data-insp-ask><Phr>{`ลบตัว ${m?.text ?? ""} นี้ออกจากฐาน`}</Phr>
                <div className="ocr-dbtools"><button type="button" className="btn btn-danger btn-sm" onClick={() => { setDel(false); void run(() => ocrApi.inspectDelete(li, getOcrJob().cfg), "ลบออกจากฐานแล้ว"); }} data-insp-del-ok>ลบออกจากฐาน</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDel(false)}>ยกเลิก</button></div></div>
            ) : (
              <div className="ocr-inspbtns">
                {numBtn(!m || !text || (m.text === text && m.italic === italic && !linesChanged), !m ? "ตัวนี้ยังไม่มีในฐาน" : !text ? "ข้อความของตัวว่างไม่ได้" : "ยังไม่ได้แก้อะไร", "บันทึกลงฐาน", save, <><IbTick size={14} />บันทึก</>, "save")}
                {numBtn(!m || (v?.engine === "binary" && !m.inDb), !m ? "ตัวนี้ยังไม่มีในฐาน" : "ตัวนี้มาจากการเดาตามรูปร่าง ไม่ได้อยู่ในฐาน", "ลบออกจากฐาน", () => setDel(true), <><IcClose size={14} />ลบ</>, "del")}
                {numBtn(false, "", "สอนตัวนี้ใหม่เพิ่มเป็นอีกรูปแบบในฐาน", () => void better(), <><IbPencil size={14} />เพิ่มคู่ที่ดีกว่า</>, "better")}
              </div>)}
            {/* ผลอยู่ใต้ปุ่มในคอลัมน์นี้ ไม่ดันส่วนล่างทั้งแถบให้ขยับ */}
            {err && <div className="stat bad" data-insp-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>ทำกับฐานไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
            {msg && !err && <div className="stat ok" data-insp-msg><CardIcon kind="ok" /><Phr>{msg}</Phr></div>}
          </div>
          {hasLines && <div className="ocr-inspcol">
            <div className="icv-head">เส้นที่วาด<InfoTip title="วาดเส้นเทียบเอง" tip={DRAW_TIP} /></div>
            <Seg small label="เส้นที่วาดใหม่" value={mode} onChange={setMode} options={[{ value: "fg", label: "ผ่านเนื้อตัว" }, { value: "bg", label: "ผ่านที่ว่าง" }]} />
            <div className="icv-row"><span className="icv-lbl" style={{ width: 64 }}>จำนวนเส้น</span>
              <input className="inp ocr-numi" inputMode="numeric" value={nLines} aria-label="จำนวนเส้นที่วาดเอง" onChange={(e) => setNLines(Math.max(0, Math.min(500, parseInt(e.target.value, 10) || 0)))} data-insp-n /></div>
            <div className="ocr-inspbtns">
              {numBtn(!m, "ตัวนี้ยังไม่มีในฐาน", "ลบเส้นเดิมแล้ววาดตามจำนวนที่ตั้ง", () => { void ocrApi.inspectDraw(li, nLines, getOcrJob().cfg).then((l) => changeLines(l), (e) => setErr(String(e))); }, <><IcRefresh size={14} />วาดใหม่</>, "draw")}
              {numBtn(!m || !(lines.fg.length + lines.bg.length), "ไม่มีเส้นให้ล้าง", "ล้างเส้นทั้งหมด", () => changeLines({ fg: [], bg: [] }), "ล้างทั้งหมด", "clear")}
              {numBtn(!m || !lines.fg.length, "ไม่มีเส้นผ่านเนื้อตัว", "ล้างเส้นผ่านเนื้อตัว", () => changeLines({ ...lines, fg: [] }), "ล้างเส้นเนื้อตัว", "clearfg")}
              {numBtn(!m || !lines.bg.length, "ไม่มีเส้นผ่านที่ว่าง", "ล้างเส้นผ่านที่ว่าง", () => changeLines({ ...lines, bg: [] }), "ล้างเส้นที่ว่าง", "clearbg")}
            </div>
            <div className="ocr-inspbtns">
              {numBtn(!undo.length, "ยังไม่มีเส้นให้ย้อน", "ย้อนเส้นล่าสุด Ctrl+Z", () => { setRedo((r) => [...r, lines]); setLines(undo[undo.length - 1]); setUndo((u) => u.slice(0, -1)); }, <IbUndo size={14} />, "undo")}
              {numBtn(!redo.length, "ยังไม่มีเส้นให้ทำซ้ำ", "ทำซ้ำ Ctrl+Y", () => { setUndo((u) => [...u, lines]); setLines(redo[redo.length - 1]); setRedo((r) => r.slice(0, -1)); }, <IbRedo size={14} />, "redo")}
              <span className="small">{`เขียว ${lines.fg.length} แดง ${lines.bg.length} เส้น`}</span>
            </div>
          </div>}
          <div className="ocr-inspcol">
            <div className="icv-head">ตัวอย่าง{hasLines && <InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} />}</div>
            <div className="ocr-dbcanvas" ref={box} data-insp-canvas>
              <svg ref={svg} className={"ocr-gv ocr-inspsvg" + (canDraw ? " draw" : "")} viewBox={`0 0 ${cur.w} ${cur.h}`} style={{ width: cur.w * z, height: cur.h * z }} role="img" aria-label={`ภาพตัวที่เลือกพร้อมเส้นเทียบ`}
                onPointerDown={(e) => { if (!canDraw) return; const p = toPx(e); if (p) { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag([p[0], p[1], p[0], p[1]]); } }}
                onPointerMove={(e) => { if (!drag) return; const p = toPx(e); if (p) setDrag([drag[0], drag[1], p[0], p[1]]); }}
                onPointerUp={() => { if (!drag) return; const d = drag; setDrag(null); if (d[0] !== d[2] || d[1] !== d[3]) changeLines(mode === "fg" ? { ...lines, fg: [...lines.fg, d] } : { ...lines, bg: [...lines.bg, d] }); }}>
                <rect x={0} y={0} width={cur.w} height={cur.h} fill="black" />
                <image href={cur.png} x={0} y={0} width={cur.w} height={cur.h} preserveAspectRatio="none" style={{ imageRendering: "pixelated" }} />
                {hasLines && <>{lineEls(lines.bg, "miss")}{lineEls(lines.fg, "hit")}</>}
                {drag && <line x1={drag[0] + 0.5} y1={drag[1] + 0.5} x2={drag[2] + 0.5} y2={drag[3] + 0.5} className={mode === "fg" ? "hit" : "miss"} />}
              </svg></div>
            <div className="icv-row">
              {numBtn(z <= 1, "ย่อสุดแล้ว", "ย่อ", () => setZoom(z - 1), "−", "zout")}
              <span className="small" style={{ minWidth: 44, textAlign: "center" }} data-insp-zoom>{z} เท่า</span>
              {numBtn(z >= 20, "ขยายสุดแล้ว", "ขยาย", () => setZoom(z + 1), <IcPlus size={13} />, "zin")}
              {numBtn(!zoom, "พอดีกรอบอยู่แล้ว", "ขยายให้พอดีกรอบ", () => setZoom(0), "พอดีกรอบ", "zfit")}
            </div>
          </div>
        </div>}
      </div>
    </Dialog>
  );
}

const imgW = (v: OcrInspView) => Math.max(1, v.sentW);
const imgH = (v: OcrInspView) => Math.max(1, v.sentH);
