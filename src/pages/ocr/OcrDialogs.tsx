/* หน้าต่างซ้อนของหน้า OCR (แผน OCR ขั้น 11) ยกจากมอคอัปที่พี่กันไล่แก้แล้ว · ทุกหน้าต่างขนาดเท่ากัน (พี่กันสั่ง "กรอบ popup ต้องขนาดเท่ากันทั้งหมด")
   สอนตัวอักษร ตาม NOcrCharacterAddWindow ของ Subtitle Edit ปุ่มจำตัวนี้ ใช้ครั้งเดียว ข้ามใส่ * หยุดอ่าน หดขยายกรอบ ตัวที่สอนในรอบนี้ (พี่กันเคาะ "ก็ระบบนี้แหละ")
   คำที่ไม่รู้จัก ตาม PromptUnknownWordWindow · แต่งภาพก่อนอ่าน ตาม PreProcessingWindow · ตัวอ่านและชุดภาษา (โมเดลที่แนบมา ชุดภาษา Tesseract ที่โหลดเพิ่มได้ ฐานตัวอักษร) */
import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Dialog from "../../components/Dialog";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Switch } from "../../components/ui";
import { IbBack, IbNext, IbJump, IbStop, IbSwap, IbTick, IcClock, IcClose, IcRefresh } from "../../components/icons";
import type { Tip } from "../../lib/codecAdv";
import { inApp, ocrApi, type OcrDbList, type OcrPrep, type OcrTaught, type OcrTessLang, type SubImg } from "../../lib/api";
import { answerTeach, answerWord, forgetWord, getOcrJob, setOcrCfg, setPromptUnknown, setRowText, useOcrJob, __ocrJobLib, type OcrRow } from "../../lib/ocrJob";
import Dropdown from "../../components/Dropdown";
import { LineImg, ScreenImg } from "./OcrPage";
import { DbDialog } from "./OcrDbDialog";

/** หน้าต่างซ้อนที่เปิดอยู่ของหน้า OCR */
export type OcrDlg = null | "prep" | "models" | "options" | "find" | "db";

const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";

const PREP_TIP: Tip = { w: "แต่งภาพก่อนส่งให้ตัวอ่าน ช่วยตอนซับมีขอบหนา สีแปลก หรือภาพเล็ก เช่น VobSub ของ DVD", o: [
  ["ครอปส่วนใส", "ตัดพื้นใสรอบตัวหนังสือออก", "", ""],
  ["กลับสี", "ทำเป็นตัวดำพื้นขาว ตัวอ่านบางตัวอ่านแบบนี้ได้ดีกว่า", "", ""],
  ["ลบขอบ", "ลบเส้นขอบรอบตัวหนังสือตามความหนาที่ตั้ง", "", ""],
  ["สีเดียว", "จุดที่มืดกว่าเกณฑ์กลายเป็นใส ที่สว่างกว่ากลายเป็นสีขาว", "", ""],
  ["ขาวดำ", "เปลี่ยนเป็นสองสีด้วยเกณฑ์ที่หาเองจากภาพ", "", ""],
  ["ขยายภาพ", "ขยายภาพเล็กก่อนอ่านจนบรรทัดสูงตามที่ตั้ง ช่วย VobSub 480p", "", ""],
] };

/* ---------- สอนตัวอักษร ---------- */
function TeachDialog() {
  const { teach: req, cfg, rows } = useOcrJob();
  const [text, setText] = useState("");
  const [italic, setItalic] = useState(false);
  const [expand, setExpand] = useState(0);
  const [hist, setHist] = useState<OcrTaught[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!req) return;
    setText(req.guess); setItalic(false); setExpand(0); setBusy(false);
    ocrApi.history().then(setHist, () => {});
    setTimeout(() => input.current?.select(), 0);
  }, [req]);
  const img = useMemo(() => req?.image ?? "", [req]);
  if (!req) return null;
  const sel = req.boxes.slice(req.letter, req.letter + expand + 1).filter((b): b is [number, number, number, number] => !!b);
  const x0 = Math.min(...sel.map((b) => b[0])), y0 = Math.min(...sel.map((b) => b[1]));
  const x1 = Math.max(...sel.map((b) => b[0] + b[2])), y1 = Math.max(...sel.map((b) => b[1] + b[3]));
  // ภาพทั้งบรรทัดย่อให้พอดีกว้างหน้าต่าง ภาพเล็กขยายได้ถึงสามเท่า
  const k = Math.min(3, 820 / Math.max(1, req.width), 150 / Math.max(1, req.height));
  const zc = Math.min(130 / Math.max(1, x1 - x0), 130 / Math.max(1, y1 - y0));
  const nth = req.boxes.slice(0, req.letter + 1).filter(Boolean).length, all = req.boxes.filter(Boolean).length;
  const row = rows[req.index];
  const send = (a: Parameters<typeof answerTeach>[0]) => { if (busy) return; setBusy(true); answerTeach(a); };
  const learn = () => send({ kind: "learn", text, italic, expand });
  return (
    <Dialog open onClose={() => send({ kind: "stop" })} kind="work" width={DLG_W} height={DLG_H}
      title={`สอนตัวอักษร ภาพที่ ${row?.item.n ?? req.index + 1} ตัวที่ ${nth} จาก ${all} ฐาน ${req.db}`}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={() => send({ kind: "stop" })} data-teach-stop><IbStop size={15} />หยุดอ่าน</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={() => send({ kind: "skip" })} title="ใส่ * แทนตัวนี้ แล้วอ่านต่อ ไม่จำลงฐาน" data-teach-skip><IbNext size={15} />ข้าม ใส่ *</button>
        <button type="button" className={"btn " + (text ? "btn-ghost" : "btn-wait")} aria-disabled={!text || undefined} title={text ? "ใช้ข้อความนี้กับตัวนี้ครั้งเดียว ไม่จำลงฐาน" : "พิมพ์ว่าตัวนี้คือตัวอะไรก่อน"} onClick={() => { if (text) send({ kind: "once", text, expand }); }} data-teach-once><IcClock size={15} />ใช้ครั้งเดียว</button>
        <button type="button" className="btn btn-main" onClick={learn} title={text ? `จำรูปร่างนี้เป็น ${text} ลงฐาน ${req.db}` : "จำว่ารูปร่างนี้ไม่ใช่ตัวอักษร ตอนอ่านจะข้ามไป"} data-teach-learn>
          <IbTick size={15} /><Keep all={["จำตัวนี้แล้วอ่านต่อ", "จำว่าไม่ใช่ตัวอักษร"]}>{text ? "จำตัวนี้แล้วอ่านต่อ" : "จำว่าไม่ใช่ตัวอักษร"}</Keep></button>
      </>}>
      <div className="ocr-dlg" data-ocr-teach-dlg>
        <div className="small"><Phr>ตัวอ่านไม่รู้จักตัวในกรอบ พิมพ์ว่าเป็นตัวอะไร โปรแกรมจะจำรูปร่างนี้ไว้ แล้วอ่านเองครั้งต่อไป  ตัวที่แยกเป็นหลายชิ้น เช่นเครื่องหมายคำพูด กดขยายกรอบให้คลุมทุกชิ้น</Phr></div>
        <div className="ocr-teachimg" style={{ width: req.width * k + 16 }}>
          <img src={img} alt="ภาพที่ตัวอ่านเห็น" draggable={false} style={{ width: req.width * k, height: req.height * k, imageRendering: "pixelated" }} />
          {req.boxes.map((b, n) => b && n !== req.letter && <span key={n} className="ocr-pbox" style={{ left: 8 + b[0] * k, top: 8 + b[1] * k, width: b[2] * k, height: b[3] * k }} />)}
          <span className="ocr-teachbox" style={{ left: x0 * k, width: (x1 - x0) * k, top: 8 + y0 * k - 2, height: (y1 - y0) * k + 4, bottom: "auto" }} />
        </div>
        <div className="ocr-teachrow">
          <div className="ocr-teachchar"><div className="ocr-crop" style={{ width: (x1 - x0) * zc, height: (y1 - y0) * zc }}>
            <img src={img} alt="ตัวที่เลือก" draggable={false} style={{ width: req.width * zc, marginLeft: -x0 * zc, marginTop: -y0 * zc }} /></div></div>
          <div className="ocr-teachf">
            <div className="icv-row"><span className="icv-lbl">ตัวนี้คือ</span>
              <input ref={input} className="inp" style={{ width: 110, fontSize: 18 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); learn(); } }} data-select-all data-teach-text />
              <span className="small">{req.guess ? `ตัวในฐานที่ใกล้ที่สุดคือ ${req.guess}` : "ฐานยังไม่มีตัวที่ใกล้เคียง"}</span></div>
            <div className="icv-row"><span className="icv-lbl">ตัวเอียง</span><Switch on={italic} onChange={setItalic} label="ตัวเอียง" /></div>
            <div className="icv-row"><span className="icv-lbl">กรอบตัวอักษร</span>
              <span className="small">{expand ? `รวม ${expand + 1} ชิ้น` : "ชิ้นเดียว"}</span>
              <button type="button" className={"btn btn-sm " + (expand > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={expand <= 0 || undefined} title={expand > 0 ? "เอาชิ้นสุดท้ายออกจากกรอบ" : "กรอบเหลือชิ้นเดียวแล้ว"} onClick={() => setExpand((e) => Math.max(0, e - 1))} data-teach-shrink>หดกรอบ</button>
              <button type="button" className={"btn btn-sm " + (expand < req.expandMax ? "btn-ghost" : "btn-wait")} aria-disabled={expand >= req.expandMax || undefined} title={expand < req.expandMax ? "รวมชิ้นถัดไปเข้ากรอบ" : "ไม่มีชิ้นที่ติดกันให้รวมแล้ว"} onClick={() => setExpand((e) => Math.min(req.expandMax, e + 1))} data-teach-expand>ขยายกรอบ</button></div>
            <div className="icv-row"><span className="icv-lbl">ฐานตัวอักษร</span><span className="small">{`${req.db} เส้นที่ใช้เทียบ ${cfg.lines} เส้นต่อตัว`}</span></div>
            {row?.text && <div className="icv-row"><span className="icv-lbl">อ่านได้ก่อนหน้า</span><span className="small">{row.text.replace(/\n/g, " ")}</span></div>}
          </div>
        </div>
        <div className="ocr-fill"><div className="icv-head">ตัวที่สอนในรอบนี้<span className="small" style={{ fontWeight: 400 }}>{hist.length ? `${hist.length} ตัว` : "ยังไม่ได้สอน"}</span></div>
          <div className="ocr-learned">{hist.slice(-40).reverse().map((h, n) => (
            <div key={n} className="ocr-lch"><b>{h.text || "ไม่ใช่ตัวอักษร"}</b><span className="small">{`ภาพ ${rows[h.index]?.item.n ?? h.index + 1}${h.italic ? " ตัวเอียง" : ""}`}</span></div>))}</div></div>
      </div>
    </Dialog>
  );
}

/* ---------- คำที่ไม่รู้จัก ---------- */
/** ระหว่างอ่าน (job.ask) ตอบกลับให้ตัวคุมงาน · กดจากรายการคำที่ไม่รู้จักหลังอ่าน (manual) แก้ข้อความของบรรทัดนั้นเอง */
function UnknownDialog({ manual, onClose, rows, imgs, need }: { manual: { word: string; i: number } | null; onClose: () => void; rows: OcrRow[]; imgs: Map<number, SubImg>; need: (n: number) => void }) {
  const { ask } = useOcrJob();
  const cur = ask ? { word: ask.word, i: ask.index, sugg: ask.suggestions } : manual ? { word: manual.word, i: manual.i, sugg: null as string[] | null } : null;
  const [to, setTo] = useState("");
  const [sugg, setSugg] = useState<string[]>([]);
  const [line, setLine] = useState("");
  useEffect(() => {
    if (!cur) return;
    setLine(rows[cur.i]?.text ?? "");
    need(rows[cur.i]?.item.n ?? 1);
    // ช่องเปลี่ยนเป็นตั้งต้นเป็นคำเดิม คำแนะนำแรกของชื่อเฉพาะมักผิด (Bādon ได้ Bordon) กดเลือกคำแนะนำเองได้
    setTo(cur.word);
    if (cur.sugg) setSugg(cur.sugg);
    else ocrApi.suggest(cur.word).then(setSugg, () => setSugg([]));
  }, [cur?.word, cur?.i]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null;
  const r = rows[cur.i];
  const others = rows.map((x, k) => ({ x, k })).filter(({ x, k }) => k !== cur.i && x.text.includes(cur.word)).slice(0, 30);
  const rep = (t: string, a: string, b: string) => __ocrJobLib.replaceWord(t, a, b);
  const act = async (kind: "useOnce" | "changeAll" | "skipOnce" | "skipAll" | "addWord" | "addName" | "editLine" | "stop") => {
    if (ask) {
      if (kind === "useOnce" || kind === "changeAll") answerWord({ kind, to });
      else if (kind === "editLine") answerWord({ kind, text: line });
      else answerWord({ kind } as Parameters<typeof answerWord>[0]);
      return;
    }
    if (kind === "useOnce") setRowText(cur.i, rep(r.text, cur.word, to));
    if (kind === "changeAll") { await ocrApi.word("changeAll", cur.word, to).catch(() => {}); forgetWord(cur.word); getOcrJob().rows.forEach((x, k) => { if (x.text.includes(cur.word)) setRowText(k, rep(x.text, cur.word, to)); }); }
    if (kind === "skipAll" || kind === "addWord" || kind === "addName") { await ocrApi.word(kind, cur.word).catch(() => {}); forgetWord(cur.word); }
    if (kind === "editLine") setRowText(cur.i, line);
    onClose();
  };
  return (
    <Dialog open onClose={() => void act("stop")} kind="work" title={`คำที่ไม่รู้จัก ภาพที่ ${r?.item.n ?? ""}`} width={DLG_W} height={DLG_H}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={() => void act("stop")} data-unk-stop><IcClose size={15} />{ask ? "หยุดอ่าน" : "ปิด"}</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={() => void act("skipOnce")} data-unk-skip><IbNext size={15} />ข้ามคำนี้</button>
        <button type="button" className="btn btn-ghost" onClick={() => void act("skipAll")} title="ไม่ถามคำนี้อีกในงานนี้" data-unk-skipall><IbJump size={15} />ข้ามทุกที่</button>
        <button type="button" className="btn btn-ghost" onClick={() => void act("changeAll")} title={`เปลี่ยน ${cur.word} เป็น ${to} ทุกที่ และจำไว้ในรายการแก้คำของเครื่องนี้`} data-unk-changeall><IbSwap size={15} />เปลี่ยนทุกที่</button>
        <button type="button" className="btn btn-main" onClick={() => void act("useOnce")} data-unk-change><IbTick size={15} />เปลี่ยน</button>
      </>}>
      <div className="ocr-dlg" data-ocr-unknown-dlg>
        <LineImg img={r ? imgs.get(r.item.n) : undefined} n={r?.item.n ?? 0} />
        <div className="icv-row"><span className="icv-lbl">อ่านได้</span><span className="ocr-word">{cur.word}</span></div>
        <div className="icv-row"><span className="icv-lbl">เปลี่ยนเป็น</span><input className="inp" style={{ width: 240 }} value={to} onChange={(e) => setTo(e.target.value)} data-unk-to /></div>
        <div className="icv-row"><span className="icv-lbl">คำแนะนำ</span><div className="ocr-sugg">{sugg.length ? sugg.slice(0, 8).map((s) => <button key={s} type="button" className="btn btn-ghost btn-sm" onClick={() => setTo(s)}>{s}</button>) : <span className="small">พจนานุกรมไม่มีคำที่ใกล้เคียง</span>}</div></div>
        <div className="icv-row"><span className="icv-lbl">จำไว้</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act("addName")} data-unk-name>เพิ่มเป็นชื่อเฉพาะ</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void act("addWord")} data-unk-word>เพิ่มเข้าพจนานุกรม</button></div>
        <div className="ocr-fill ocr-two">
          <div className="ocr-side" style={{ borderLeft: 0, paddingLeft: 0 }}>
            <div className="icv-head">ทั้งบรรทัด</div>
            <textarea className="inp ocr-ta" value={line} onChange={(e) => setLine(e.target.value)} spellCheck={false} data-unk-line />
            <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => void act("editLine")} data-unk-editline>ใช้ข้อความนี้ทั้งบรรทัด</button></div>
          </div>
          <div className="ocr-side">
            <div className="icv-head">เจอคำนี้ที่อื่นในไฟล์</div>
            <div className="ocr-elist">{others.length ? others.map(({ x, k }) => <div key={k} className="ocr-eitem"><b>ภาพ {x.item.n}</b><span>{x.text.replace(/\n/g, " ")}</span></div>) : <span className="small">ไม่เจอที่อื่น</span>}</div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- แต่งภาพก่อนอ่าน ---------- */
function PrepDialog({ open, onClose, rows, imgs, need, sel }: { open: boolean; onClose: () => void; rows: OcrRow[]; imgs: Map<number, SubImg>; need: (n: number) => void; sel: number }) {
  const { cfg, running } = useOcrJob();
  const [p, setP] = useState<OcrPrep>(cfg.prep);
  const [pi, setPi] = useState(sel);
  const [prev, setPrev] = useState<string | null>(null);
  useEffect(() => { if (open) { setP(cfg.prep); setPi(sel); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || !rows[pi]) return;
    need(rows[pi].item.n);
    let live = true;
    ocrApi.prepPreview(pi, p).then((u) => { if (live) setPrev(u); }, () => { if (live) setPrev(null); });
    return () => { live = false; };
  }, [open, pi, p]); // eslint-disable-line react-hooks/exhaustive-deps
  const sw: [keyof OcrPrep, string][] = [["cropTransparent", "ครอปส่วนใส"], ["invert", "กลับสีเป็นตัวดำพื้นขาว"], ["removeBorders", "ลบขอบ"], ["toOneColor", "ทำเป็นสีเดียว"], ["binarize", "ทำเป็นขาวดำ"]];
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, parseInt(v, 10) || 0));
  const r = rows[pi];
  return (
    <Dialog open={open} onClose={onClose} kind="work" title="แต่งภาพก่อนอ่าน" width={DLG_W} height={DLG_H}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={() => setP({ cropTransparent: false, invert: false, binarize: false, removeBorders: false, borderSize: 2, toOneColor: false, oneColorThreshold: 128, upscaleTo: 0 })} title="กลับเป็นไม่แต่งภาพ"><IcRefresh size={15} />ค่าตั้งต้น</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={onClose}><IcClose size={15} />ยกเลิก</button>
        <button type="button" className={"btn " + (running ? "btn-wait" : "btn-main")} aria-disabled={running || undefined} title={running ? "หยุดอ่านก่อนจึงจะเปลี่ยนได้" : "ใช้ค่านี้กับภาพที่อ่านต่อจากนี้"} onClick={() => { if (running) return; setOcrCfg({ prep: p }); onClose(); }} data-prep-apply><IbTick size={15} />ใช้ค่านี้</button>
      </>}>
      <div className="ocr-dlg ocr-prep" data-ocr-prep-dlg>
        <div className="ocr-prepl">
          <div className="small"><Phr>แต่งภาพก่อนส่งให้ตัวอ่าน ภาพต้นฉบับไม่ถูกแก้</Phr> <InfoTip title="แต่งภาพก่อนอ่าน" tip={PREP_TIP} /></div>
          {sw.map(([k, l]) => <div key={k} className="icv-row"><Switch on={!!p[k]} onChange={(v) => setP({ ...p, [k]: v })} label={l} /><span>{l}</span></div>)}
          <div className="icv-row"><span className="icv-lbl">ความหนาขอบ</span><input className="inp" style={{ width: 60 }} value={p.borderSize} inputMode="numeric" onChange={(e) => setP({ ...p, borderSize: num(e.target.value, 1, 20) })} /><span className="small">จุด</span></div>
          <div className="icv-row"><span className="icv-lbl">เกณฑ์ความมืด</span><input className="inp" style={{ width: 60 }} value={p.oneColorThreshold} inputMode="numeric" onChange={(e) => setP({ ...p, oneColorThreshold: num(e.target.value, 0, 255) })} /><span className="small">0 ถึง 255 ใช้กับสีเดียว</span></div>
          <div className="icv-row"><span className="icv-lbl">ขยายภาพจนสูง</span><input className="inp" style={{ width: 60 }} value={p.upscaleTo} inputMode="numeric" onChange={(e) => setP({ ...p, upscaleTo: num(e.target.value, 0, 200) })} /><span className="small">จุดต่อบรรทัด ใส่ 0 คือไม่ขยาย</span></div>
        </div>
        <div className="ocr-prepr">
          <div className="icv-pick"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPi(Math.max(0, pi - 1))} title="ภาพก่อนหน้า" aria-label="ภาพก่อนหน้า"><IbBack size={14} /></button>
            <span className="small">{`ภาพตัวอย่างที่ ${r?.item.n ?? ""} จาก ${rows.length.toLocaleString("en-US")}`}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPi(Math.min(rows.length - 1, pi + 1))} title="ภาพถัดไป" aria-label="ภาพถัดไป"><IbNext size={14} /></button></div>
          <figure className="icv-fig"><figcaption>ภาพบนจอ</figcaption><ScreenImg img={r ? imgs.get(r.item.n) : undefined} n={r?.item.n ?? 0} /></figure>
          <figure className="icv-fig"><figcaption>ภาพต้นฉบับ</figcaption><LineImg img={r ? imgs.get(r.item.n) : undefined} n={r?.item.n ?? 0} /></figure>
          <figure className="icv-fig"><figcaption>ภาพที่ส่งให้ตัวอ่าน</figcaption>{prev ? <div className="ocr-line" data-prep-preview><img src={prev} alt="ภาพที่แต่งแล้ว" /></div> : <div className="ocr-line" style={{ height: 46 }} aria-busy="true" />}</figure>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- ตัวอ่านและชุดภาษา ---------- */
/** ชื่อภาษาไทยของโมเดล PP-OCRv5 (ชื่อโฟลเดอร์) กับชุดภาษา Tesseract ที่ใช้บ่อย · ที่เหลือใช้ชื่ออังกฤษจากรายการของ Subtitle Edit */
const V5_TH: Record<string, string> = { th: "ไทย", en: "อังกฤษ", latin: "อักษรละติน", korean: "เกาหลี", cyrillic: "ซีริลลิก", arabic: "อาหรับ", devanagari: "เทวนาครี", el: "กรีก", eslav: "สลาฟตะวันออก", ta: "ทมิฬ", te: "เตลูกู" };
const TESS_TH: Record<string, string> = { eng: "อังกฤษ", tha: "ไทย", jpn: "ญี่ปุ่น", jpn_vert: "ญี่ปุ่นแนวตั้ง", chi_sim: "จีนตัวย่อ", chi_tra: "จีนตัวเต็ม", chi_sim_vert: "จีนตัวย่อแนวตั้ง", chi_tra_vert: "จีนตัวเต็มแนวตั้ง", kor: "เกาหลี", kor_vert: "เกาหลีแนวตั้ง", fra: "ฝรั่งเศส", deu: "เยอรมัน", spa: "สเปน", ita: "อิตาลี", por: "โปรตุเกส", rus: "รัสเซีย", vie: "เวียดนาม", lao: "ลาว", khm: "เขมร", mya: "พม่า", ind: "อินโดนีเซีย", msa: "มลายู", ara: "อาหรับ", hin: "ฮินดี" };
export const tessName = (l: OcrTessLang) => TESS_TH[l.code] ?? l.name;
function ModelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [models, setModels] = useState<string[]>([]);
  const [tess, setTess] = useState<OcrTessLang[]>([]);
  const [dbs, setDbs] = useState<OcrDbList | null>(null);
  const [dl, setDl] = useState<{ code: string; pct: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const load = () => { ocrApi.paddleModels().then(setModels, () => {}); ocrApi.tessLangs().then(setTess, () => {}); ocrApi.dbs().then(setDbs, () => {}); };
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => {
    if (!inApp) return;
    const un = listen<{ code: string; percent: number }>("ocr-tess-progress", (e) => setDl({ code: e.payload.code, pct: e.payload.percent }));
    return () => { void un.then((f) => f()); };
  }, []);
  const get = async (code: string) => {
    setErr(null); setDl({ code, pct: 0 });
    try { await ocrApi.tessDownload(code); setPick(""); load(); } catch (e) { setErr(String(e)); }
    setDl(null);
  };
  const v6 = ["tiny", "small", "medium"].filter((z) => models.includes(`PP-OCRv6_${z}_rec`));
  const v5 = models.filter((m) => m.endsWith("_PP-OCRv5_mobile_rec")).map((m) => V5_TH[m.replace("_PP-OCRv5_mobile_rec", "")] ?? m);
  const ori = models.some((m) => m.includes("textline_ori")), det = models.some((m) => m.endsWith("_det"));
  const have = tess.filter((l) => l.have), more = tess.filter((l) => !l.have);
  const ok = <span className="ocr-ok"><IbTick size={13} />มีแล้ว</span>;
  const row = (k: string, name: string, note: string, end: React.ReactNode = ok) => <div key={k} className="ocr-mrow"><span>{name}</span><span className="small">{note}</span>{end}</div>;
  return (
    <Dialog open={open} onClose={onClose} kind="work" title="ตัวอ่านและชุดภาษา" width={DLG_W} height={DLG_H}
      actions={<><span style={{ flex: 1 }} /><button type="button" className="btn btn-main" onClick={onClose}><IcClose size={15} />ปิด</button></>}>
      <div className="ocr-dlg ocr-models" data-ocr-models-dlg>
        <div className="small"><Phr>ทุกตัวทำงานในเครื่อง โมเดลกับชุดภาษาหลักแนบมากับโปรแกรมแล้ว ปุ่มโหลดออกเน็ตเฉพาะตอนกด</Phr></div>
        {err && <div className="stat bad"><CardIcon kind="bad" /><div><b>โหลดชุดภาษาไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
        <div className="ocr-mgrid">
          <div className="ocr-mcard"><div className="ocr-mhead"><b>PaddleOCR</b><span className="small">ตัวรัน ONNX Runtime แนบมากับโปรแกรม</span></div>
            {row("v6", "PP-OCRv6 อังกฤษ ญี่ปุ่น จีน", v6.join(" "))}
            {row("v5", "PP-OCRv5 ภาษาอื่น", `${v5.length} ภาษา`)}
            <div className="small ocr-mlist">{v5.join(" ")}</div>
            {row("det", "ตัวหาบรรทัดของซับแนวตั้ง", "", det ? ok : <span />)}
            {row("ori", "ตัวหมุนบรรทัดที่กลับหัว", "", ori ? ok : <span />)}</div>
          <div className="ocr-mcard"><div className="ocr-mhead"><b>Tesseract 5.5.3</b><span className="small">ชุดภาษาที่มีในเครื่อง</span></div>
            {have.map((l) => row(l.code, `${tessName(l)} ${l.code}`, l.have === "bundled" ? "แนบมา" : "โหลดแล้ว"))}
            <div className="ocr-mrow ocr-mdl"><Dropdown label="ชุดภาษาที่โหลดเพิ่มได้" value={pick} onChange={setPick} search stretch hint="พิมพ์ชื่อภาษา"
              display={(o) => o?.label ?? `เลือกจาก ${more.length} ภาษา`} options={more.map((l) => ({ value: l.code, label: `${tessName(l)} ${l.code}` }))} />
              <span className="small">{dl ? `${Math.round(dl.pct)}%` : ""}</span>
              {dl ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void ocrApi.tessCancel()} data-tess-cancel>หยุดโหลด</button>
                : <button type="button" className={"btn btn-sm " + (pick ? "btn-ghost" : "btn-wait")} aria-disabled={!pick || undefined} title={pick ? `โหลดชุดภาษา ${pick} จาก tessdata_best` : "เลือกภาษาก่อน"} onClick={() => { if (pick) void get(pick); }} data-tess-get>โหลด</button>}</div></div>
          <div className="ocr-mcard"><div className="ocr-mhead"><b>nOCR และ Binary OCR</b><span className="small">ฐานตัวอักษรจาก Subtitle Edit และฐานที่สอนเอง</span></div>
            {row("n", "ฐาน nOCR", `${dbs?.nocr.length ?? 0} ฐาน`)}
            <div className="small ocr-mlist">{(dbs?.nocr ?? []).map((d) => `${d}.nocr`).join(" ")}</div>
            {row("b", "ฐาน Binary OCR", `${dbs?.binary.length ?? 0} ฐาน`)}
            <div className="small ocr-mlist">{(dbs?.binary ?? []).map((d) => `${d}.db`).join(" ")}</div></div>
          <div className="ocr-mcard"><div className="ocr-mhead"><b>ตัวสอนเองของชั้นหนัง</b><span className="small">ฐานที่สอนหรือฝึกจากฟอนต์</span></div>
            {dbs?.own.length ? dbs.own.map((d) => row(d, `${d}.nocr`, "")) : row("none", "ยังไม่มีฐาน", "สอนจากหน้าต่างสอนตัวอักษร", <span />)}</div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- ตัวเลือกการอ่าน (ช่องติ๊กของหน้าต่าง OCR ใน Subtitle Edit กับหน้าต่างตั้งค่า nOCR) ---------- */
const OPT_TIP: Tip = { w: "ตัวเลือกที่ใช้ตอนอ่าน ค่าที่ตั้งจำไว้ในเครื่อง ใช้กับการอ่านครั้งต่อไป", o: [
  ["แก้คำ OCR", "แก้คำที่ตัวอ่านมักอ่านผิด เช่นขีดตั้งที่ควรเป็นตัว I ด้วยรายการแก้คำของ Subtitle Edit และพจนานุกรม", "", ""],
  ["เดาคำที่ไม่รู้จัก", "คำที่พจนานุกรมไม่รู้จัก ลองเปลี่ยนตัวที่มักอ่านผิดจนได้คำที่รู้จัก", "", ""],
  ["ถามคำที่ไม่รู้จักทีละคำ", "หยุดถามทุกคำที่พจนานุกรมไม่รู้จักระหว่างอ่าน ปิดไว้แล้วตรวจจากรายการหลังอ่านได้", "", ""],
  ["หยุดสอนตัวที่ไม่รู้จัก", "ตัวสอนเองเจอตัวที่ฐานไม่รู้จักแล้วเปิดหน้าต่างสอน ปิดไว้ใส่ * แทน", "", ""],
  ["ฐานสำรอง", "nOCR อ่านไม่ออกให้ Binary OCR ลอง หรือกลับกัน", "", ""],
  ["ตัดบรรทัดเอง", "ข้อความที่อ่านได้เกินสองบรรทัด รวมเป็นบรรทัดเดียวแล้วตัดใหม่ให้เหลือสองบรรทัด บรรทัดละไม่เกิน 43 ตัว โดยให้บรรทัดล่างยาวกว่านิดหน่อยแบบ Subtitle Edit", "บทพูดสองคนที่ขึ้นด้วยขีด เพลงที่มี ♪ และภาพที่มีป้ายบนจอแยกจากบทพูดข้างล่าง ไม่ถูกตัดใหม่", ""],
] };
function OptionsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { cfg, promptUnknown, running } = useOcrJob();
  const why = running ? "หยุดอ่านก่อนจึงจะเปลี่ยนได้" : undefined;
  const sw = (on: boolean, set: (v: boolean) => void, label: string, note: string, key: string) => (
    <div className="icv-row" key={key} title={why}><Switch on={on} onChange={(v) => { if (!running) set(v); }} label={label} /><span>{label}</span><span className="small">{note}</span></div>);
  return (
    <Dialog open={open} onClose={onClose} kind="work" title="ตัวเลือกการอ่าน" width={DLG_W} height={DLG_H}
      actions={<><span style={{ flex: 1 }} /><button type="button" className="btn btn-main" onClick={onClose}><IcClose size={15} />ปิด</button></>}>
      <div className="ocr-dlg" data-ocr-options-dlg>
        <div className="small"><Phr>ค่าที่ตั้งจำไว้ในเครื่อง ใช้กับการอ่านครั้งต่อไป</Phr> <InfoTip title="ตัวเลือกการอ่าน" tip={OPT_TIP} /></div>
        <div className="icv-head">ตัวแก้คำ</div>
        {sw(cfg.fix, (v) => setOcrCfg({ fix: v }), "แก้คำ OCR", cfg.dict ? `ภาษา ${cfg.lang3} พจนานุกรม ${cfg.dict}` : `ภาษา ${cfg.lang3 || "ไม่มีรายการแก้คำ"} ยังไม่มีพจนานุกรม`, "fix")}
        {sw(cfg.guess, (v) => setOcrCfg({ guess: v }), "เดาคำที่ไม่รู้จัก", "ใช้กับคำที่พจนานุกรมไม่รู้จัก", "guess")}
        {sw(promptUnknown, setPromptUnknown, "ถามคำที่ไม่รู้จักทีละคำ", "หยุดถามระหว่างอ่าน", "prompt")}
        {sw(cfg.autoBreak, (v) => setOcrCfg({ autoBreak: v }), "ตัดบรรทัดเอง", "อ่านได้เกินสองบรรทัดแล้วตัดใหม่ให้เหลือสองบรรทัด", "ab")}
        <div className="icv-head">ตัวสอนเอง</div>
        {sw(cfg.teach, (v) => setOcrCfg({ teach: v }), "หยุดสอนตัวที่ไม่รู้จัก", "ปิดไว้ใส่ * แทน", "teach")}
        {sw(cfg.fallback, (v) => setOcrCfg({ fallback: v }), "ฐานสำรอง", "nOCR กับ Binary OCR ช่วยกันอ่าน", "fb")}
        {sw(cfg.italic, (v) => setOcrCfg({ italic: v }), "ลองบิดตัวเอียง", "จับคู่ไม่ได้แล้วลองบิดให้ตั้งตรง", "it")}
        {sw(cfg.lastDitch, (v) => setOcrCfg({ lastDitch: v }), "เดาตัวที่ใกล้ที่สุด", "ไม่หยุดสอน ใช้ตัวที่ใกล้ที่สุดในฐานแทน", "ld")}
        <div className="icv-row"><span className="icv-lbl">เส้นตอนสอน<InfoTip title="เส้นที่ใช้เทียบ" tip={{ w: "จำนวนเส้นที่โปรแกรมวาดเองตอนสอนตัวอักษรหนึ่งตัว ยิ่งมากยิ่งแยกตัวคล้ายได้ดี แต่ฐานใหญ่ขึ้น", r: "60 ตามค่าตั้งต้นของ Subtitle Edit" }} /></span>
          <input className="inp" style={{ width: 70 }} inputMode="numeric" value={cfg.lines} disabled={running} onChange={(e) => setOcrCfg({ lines: Math.max(5, Math.min(300, parseInt(e.target.value, 10) || 0)) })} data-opt-lines />
          <span className="icv-lbl" style={{ width: "auto" }}>วิธีวาด</span>
          <Dropdown label="วิธีวาดเส้น" value={cfg.algo} onChange={(v) => setOcrCfg({ algo: v })} disabled={why} options={[{ value: "Random", label: "สุ่มเส้น" }, { value: "SkeletonDistance", label: "ตามโครงตัวอักษร" }, { value: "EdgeHough", label: "ตามขอบตัวอักษร" }]} /></div>
      </div>
    </Dialog>
  );
}

/* ---------- ค้นและแทนที่ (FindReplace ของหน้าต่าง OCR ใน Subtitle Edit) ---------- */
function FindDialog({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: OcrRow[] }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [done, setDone] = useState<number | null>(null);
  useEffect(() => { if (open) setDone(null); }, [open]);
  const hits = a ? rows.filter((r) => r.text.includes(a)).length : 0;
  const run = () => {
    if (!a) return;
    let n = 0;
    rows.forEach((r, k) => { if (r.text.includes(a)) { setRowText(k, r.text.split(a).join(b)); n++; } });
    setDone(n);
  };
  return (
    <Dialog open={open} onClose={onClose} kind="work" title="ค้นและแทนที่" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={onClose}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} />
        <button type="button" className={"btn " + (hits ? "btn-main" : "btn-wait")} aria-disabled={!hits || undefined} title={hits ? `แทนที่ใน ${hits} บรรทัด` : "ไม่เจอคำที่ค้นในบรรทัดไหน"} onClick={() => { if (hits) run(); }} data-find-run><IbSwap size={15} />แทนที่ทั้งหมด</button></>}>
      <div className="ocr-dlg" data-ocr-find-dlg>
        <div className="small"><Phr>แทนที่ข้อความในทุกบรรทัดที่อ่านแล้ว ตรงตัวพิมพ์เล็กใหญ่ ไฟล์ยังไม่ถูกแตะจนกว่าจะส่งออก</Phr></div>
        <div className="icv-row"><span className="icv-lbl">ค้นหา</span><input className="inp" style={{ width: 320 }} value={a} onChange={(e) => { setA(e.target.value); setDone(null); }} data-find-a /></div>
        <div className="icv-row"><span className="icv-lbl">แทนที่ด้วย</span><input className="inp" style={{ width: 320 }} value={b} onChange={(e) => setB(e.target.value)} data-find-b /></div>
        <div className="small" data-find-status>{done != null ? `แทนที่แล้ว ${done} บรรทัด` : a ? `เจอใน ${hits} บรรทัด` : "พิมพ์คำที่จะค้น"}</div>
      </div>
    </Dialog>
  );
}

export function OcrDialogs({ dlg, setDlg, ask, setAsk, rows, imgs, need, sel }: {
  dlg: OcrDlg; setDlg: (d: OcrDlg) => void; ask: { word: string; i: number } | null; setAsk: (a: null) => void;
  rows: OcrRow[]; imgs: Map<number, SubImg>; need: (n: number) => void; sel: number;
}) {
  return (<>
    <TeachDialog />
    <UnknownDialog manual={ask} onClose={() => setAsk(null)} rows={rows} imgs={imgs} need={need} />
    <PrepDialog open={dlg === "prep"} onClose={() => setDlg(null)} rows={rows} imgs={imgs} need={need} sel={sel} />
    <ModelsDialog open={dlg === "models"} onClose={() => setDlg(null)} />
    <OptionsDialog open={dlg === "options"} onClose={() => setDlg(null)} />
    <FindDialog open={dlg === "find"} onClose={() => setDlg(null)} rows={rows} />
    <DbDialog open={dlg === "db"} onClose={() => setDlg(null)} />
  </>);
}
