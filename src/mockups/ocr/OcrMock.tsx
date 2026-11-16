/* หน้าจอ OCR ของมอคอัป (BUGS ข้อ 143) · ยังไม่ได้ลงโปรแกรม ใช้ชิ้นส่วนจริงของโปรแกรมทั้งหมด (ปุ่ม การ์ด Dropdown Seg Switch InfoTip Dialog)
   ไอเดียยกจากหน้าต่าง OCR ของ Subtitle Edit (ซอร์ส se5 src/UI/Features/Ocr/OcrWindow.cs NOcrCharacterAddWindow.cs PromptUnknownWordWindow.cs PreProcessingWindow.cs)
   แถวเลือกตัวอ่านบนสุด ตารางเลข เวลา ภาพ ข้อความ ช่องแก้ข้อความกับแท็บคำที่ไม่รู้จัก รายการที่แก้ให้ คำที่เดา แถบความคืบหน้ากับปุ่มเริ่ม หยุดชั่วคราว ตรวจบรรทัด ส่งออก
   ของชั้นหนังที่เพิ่มจาก Subtitle Edit ระบบชี้จุดที่น่าสงสัยสามแบบ (ข้อ 143 ㉝) ตัวช่วยตรวจ ป้ายตำแหน่งบนจอ (ข้อ ⑭)
   สภาพ (state) มาจาก ?ocr= ของหน้า · ข้อมูลภาพซับมาจาก window.__ocrSample ใน theme-live-app.html */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dialog from "../../components/Dialog";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Phr, Seg, Switch } from "../../components/ui";
import { IbBack, IbBold, IbCrop, IbItalic, IbNext, IbPencil, IbPlay, IbResample, IbJump, IbRevert, IbStop, IbSwap, IbTable, IbTick, IbWand, IcClock, IcClose, IcExpand, IcExtract, IcFolder, IcMix, IcRefresh, IcSettings, IcSubtitle } from "../../components/icons";
import type { Tip } from "../../lib/codecAdv";

type Cue = { n: number; start: number; end: number; lines: string[]; top: string | null; side: string };
type Img = { n: number; start: number; end: number; w: number; h: number; canvas: [number, number]; at: [number, number]; png: string; line: string };
const sample = () => (window as unknown as { __ocrSample: { cues: Cue[]; all: () => Img[] } }).__ocrSample;

/* ---------- ผลอ่านตัวอย่าง ตัวหลัก PP-OCRv6 small กับตัวช่วยตรวจ PP-OCRv6 medium ----------
   ผิดแบบที่เจอจริงตอนเทสซับ ACCA (docs/research/ocr-ซับรูป.md) จุดสามจุดเหลือสองจุด เว้นวรรคหาย ขีดบนหาย จุดบนสระหาย
   ข้อความตัวอย่างแคลร์แต่งเอง ไม่ใช้บทของหนังจริง เพราะ repo เป็นแบบสาธารณะ */
type Flag = "diff" | "word" | "name" | "conf";
type Row = { n: number; start: number; end: number; img: Img; truth: string; main: string; check: string; conf: number; flags: Flag[]; top: string | null; fix?: [string, string]; guess?: [string, string] };
const ERR: Record<number, Partial<Pick<Row, "main" | "check" | "conf" | "flags" | "fix" | "guess">>> = {
  3: { main: "Rodan Station\nTrains are running on time today.", flags: ["diff", "name"] },
  5: { main: "I.. I see.", flags: ["diff"] },
  10: { main: "Isee...", check: "Isee..", flags: ["diff", "word"] },
  13: { fix: ["|t's too sudden.", "It's too sudden."] },
  15: { conf: 0.71, flags: ["conf"] },
  22: { main: "A naive cafe owner in such quiet times?", flags: ["diff"] },
  25: { guess: ["ifthat's", "if that's"] },
};
const FLAG_NAME: Record<Flag, string> = { diff: "สองตัวอ่านไม่ตรงกัน", word: "คำที่ไม่รู้จัก", name: "ชื่อเขียนสองแบบ", conf: "ตัวอ่านไม่มั่นใจ" };
const plain = (s: string) => s.replace(/<\/?i>/g, "");
function rowsOf(): Row[] {
  const s = sample();
  const imgs = s.all();
  return s.cues.map((c, i) => {
    const truth = [c.top, ...c.lines].filter(Boolean).join("\n") as string;
    const e = ERR[c.n] ?? {};
    return { n: c.n, start: c.start, end: c.end, img: imgs[i], truth, main: e.main ?? truth, check: e.check ?? truth, conf: e.conf ?? 0.97, flags: e.flags ?? [], top: c.top, fix: e.fix, guess: e.guess };
  });
}
const ts = (t: number) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };

/* ---------- คำอธิบาย ⓘ ---------- */
const ENGINE_TIP: Tip = { w: "ตัวอ่านคือโปรแกรมที่ดูภาพซับแล้วเขียนออกมาเป็นตัวหนังสือ ทุกตัวทำงานในเครื่อง ไม่ส่งภาพออกเน็ต", o: [
  ["PaddleOCR", "อ่านจากภาพทั้งบรรทัดด้วยโมเดลที่ฝึกมาแล้ว อ่านอังกฤษ ญี่ปุ่น จีน และภาษาไทยได้", "แม่นที่สุดตอนเทสซับอังกฤษ 439 ภาพ ถูก 436–437 ภาพ", "ต้องโหลดโมเดลแยกตามภาษา"],
  ["Tesseract", "ตัวอ่านเก่าแก่ที่ Subtitle Edit ใช้เป็นหลัก มีชุดภาษาให้โหลดกว่าร้อยภาษา", "อ่านภาษาแปลก ๆ ได้", "ซับชุดเทสถูก 360 จาก 439 ภาพ อ่านตัว I เป็นขีดตั้งบ่อย"],
  ["nOCR และ Binary OCR", "ตัวสอนเอง จำรูปร่างตัวอักษรของซับเรื่องนั้นแล้วอ่านเองครั้งต่อไป", "บอกได้ว่าบรรทัดไหนเป็นตัวเอียง", "ต้องสอนก่อนถึงจะใช้ได้"],
  ["ตัวสอนเองของชั้นหนัง", "ตัวสอนเองที่รู้จักสระและวรรณยุกต์ไทยที่ซ้อนบนล่าง", "ใช้กับ VobSub ไทยความละเอียดต่ำได้", "ต้องสอนทีละตัวอักษร"],
], r: "PaddleOCR ขนาด small" };
const SIZE_TIP: Tip = { w: "ขนาดของโมเดล PaddleOCR ยิ่งใหญ่ยิ่งแม่นแต่ช้ากว่า เวลาที่บอกวัดจากซับ 24 นาทีบนเครื่องนี้", o: [
  ["tiny", "โมเดลเล็กสุด 4.4 MB", "เร็วสุด ราว 12 วินาที", "ถูก 410 จาก 439 ภาพ"],
  ["small", "โมเดลกลาง 21 MB", "ราว 20 วินาที ถูก 436 ภาพ", ""],
  ["medium", "โมเดลใหญ่ 74 MB", "ถูก 437 ภาพ แม่นสุด", "ราว 53 วินาที"],
], r: "small" };
const CHECK_TIP: Tip = { w: "ตัวช่วยตรวจอ่านภาพเดียวกันอีกรอบ แต่ไม่ได้เขียนลงไฟล์ ภาพที่อ่านได้ไม่ตรงกับตัวหลักขึ้นให้ตรวจ\nตอนเทส ตัวช่วยตรวจชี้ 4 ภาพ ซึ่งตรงกับทุกภาพที่อ่านผิด", r: "ใช้ขนาดที่ต่างจากตัวหลัก เช่นตัวหลัก small ตัวช่วยตรวจ medium" };
const FLAG_TIP: Tip = { w: "จุดที่ต้องตรวจคือบรรทัดที่ระบบสงสัยว่าอ่านผิด เห็นแล้วแก้หรือกดว่าถูกแล้ว", o: [
  ["สองตัวอ่านไม่ตรงกัน", "ตัวหลักกับตัวช่วยตรวจอ่านภาพเดียวกันได้ไม่เหมือนกัน", "", ""],
  ["คำที่ไม่รู้จัก", "คำที่ไม่มีในพจนานุกรม เช่นเว้นวรรคหายจนคำติดกัน", "", ""],
  ["ชื่อเขียนสองแบบ", "ชื่อเดียวกันในไฟล์เดียวกันเขียนต่างกัน เช่น Rodan กับ Rōdan", "", ""],
  ["ตัวอ่านไม่มั่นใจ", "ตัวอ่านให้คะแนนความมั่นใจของบรรทัดนี้ต่ำ", "", ""],
] };
const POS_TIP: Tip = { w: "ซับบางภาพไม่ได้อยู่ล่างจอ เช่นชื่อสถานที่บนจอหรือป้ายชื่อตัวละคร โปรแกรมดูจากพิกัดในไฟล์ซับรูปแล้วติดป้ายบนจอให้\nตอนส่งออกเป็นซับตัวหนังสือ บรรทัดบนจอจะเก็บตำแหน่งไว้ให้อยู่ที่เดิม" };
const PREP_TIP: Tip = { w: "แต่งภาพก่อนส่งให้ตัวอ่าน ช่วยตอนซับมีขอบหนา สีแปลก หรือภาพเล็ก เช่น VobSub ของ DVD", o: [
  ["ครอปส่วนใส", "ตัดพื้นใสรอบตัวหนังสือออก", "", ""],
  ["กลับสี", "ทำเป็นตัวดำพื้นขาว ตัวอ่านบางตัวอ่านแบบนี้ได้ดีกว่า", "", ""],
  ["ลบขอบ", "ลบเส้นขอบรอบตัวหนังสือตามความหนาที่ตั้ง", "", ""],
  ["ขาวดำ", "เปลี่ยนเป็นสองสีตามเกณฑ์ความมืด", "", ""],
  ["ขยายภาพ", "ขยายภาพเล็กก่อนอ่าน ช่วย VobSub 480p", "", ""],
] };

/* ---------- ชิ้นที่ใช้ซ้ำ ---------- */
/** ปุ่มขยายแยกคอลัมน์ในตาราง ปุ่มไอคอนแบบปุ่มเล็กของโปรแกรม (พี่กันสั่ง "เอาปุ่มไปไว้อีกคอลัม บัง") */
function ZoomBtn({ img }: { img: Img }) {
  const [big, setBig] = useState(false);
  return (<>
    <button type="button" className="btn btn-ghost btn-sm ocm-zb" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${img.n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={13} /></button>
    {big && <BigView img={img} line onClose={() => setBig(false)} />}
  </>);
}
function BigView({ img, line, invert, frame, onClose }: { img: Img; line?: boolean; invert?: boolean; frame?: boolean; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  const [cw, ch] = img.canvas;
  return createPortal(
    <div className="ocm-zview" onClick={onClose} role="dialog" aria-label={`ภาพ ${img.n} ขยาย`}>
      {line ? <div className={"ocm-line ocm-zline" + (invert ? " inv" : "")}><img src={img.line} alt="" /></div>
        : <div className={"ocm-screen ocm-zscreen" + (frame ? " withframe" : "")} style={{ aspectRatio: `${cw} / ${ch}` }}>
          <img src={img.png} alt="" style={{ left: `${(img.at[0] / cw) * 100}%`, top: `${(img.at[1] / ch) * 100}%`, width: `${(img.w / cw) * 100}%` }} /></div>}
      <span className="ocm-zcap">{`ภาพ ${img.n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span>
    </div>, document.body);
}

/** ภาพซับ · ปุ่มขยายมุมภาพ กดแล้วขยายเต็มหน้าต่าง กดอีกครั้งหรือ Esc ปิด (พี่กันขอ "ซูมขยายได้" · "กดขยายได้") · side = ปุ่มอยู่คอลัมน์อื่น (ตาราง) */
function SubImgView({ img, frame, fit = "line", invert, side }: { img: Img; frame?: boolean; fit?: "line" | "screen"; invert?: boolean; side?: boolean }) {
  const [big, setBig] = useState(false);
  if (side) return <div className="ocm-line"><img src={img.line} alt={`ซับภาพ ${img.n}`} /></div>;
  useEffect(() => {
    if (!big) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setBig(false); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [big]);
  const [cw, ch] = img.canvas;
  const screen = (cls: string) => (
    <div className={"ocm-screen " + cls + (frame ? " withframe" : "")} style={{ aspectRatio: `${cw} / ${ch}` }}>
      <img src={img.png} alt={`ซับภาพ ${img.n}`} style={{ left: `${(img.at[0] / cw) * 100}%`, top: `${(img.at[1] / ch) * 100}%`, width: `${(img.w / cw) * 100}%` }} />
    </div>);
  const small = fit === "line"
    ? <div className={"ocm-line" + (invert ? " inv" : "")}><img src={img.line} alt={`ซับภาพ ${img.n}`} /></div>
    : screen("");
  return (<>
    {/* ปุ่มขยายแบบเดียวกับที่โปรแกรมใช้ (.bigbtn ของหน้าใส่โปสเตอร์ จับคู่ปก หน้าครอป) สี่เหลี่ยมเล็กสีเข้มโปร่งมุมขวาล่าง เห็นตลอด
        (พี่กันสั่ง "ให้มันมีปุ่มขยายสือบอกหน่อยสิ" แล้วทัก "บังงงงงงง ไปดูมาในโปรแกรมมันทำยังไง" ป้ายที่แคลร์ทำเองมีคำว่าขยาย บังภาพ) */}
    <div className={"ocm-zwrap" + (fit === "screen" ? " lg" : "")}>{small}
      <button type="button" className="bigbtn" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${img.n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={fit === "screen" ? 15 : 11} /></button></div>
    {big && createPortal(
      <div className="ocm-zview" onClick={() => setBig(false)} role="dialog" aria-label={`ภาพ ${img.n} ขยาย`}>
        {fit === "line" ? <div className={"ocm-line ocm-zline" + (invert ? " inv" : "")}><img src={img.line} alt="" /></div> : screen("ocm-zscreen")}
        <span className="ocm-zcap">{`ภาพ ${img.n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span>
      </div>, document.body)}
  </>);
}
/** ข้อความหลายบรรทัด บรรทัดแรกที่เป็นป้ายบนจอติดป้าย ตัวเอียงแสดงเอียง */
function Txt({ s, top }: { s: string; top: string | null }) {
  return <span className="ocm-txt">{s.split("\n").map((l, i) => (
    <span key={i} className="ocm-tl">{i === 0 && top ? <span className="ocm-pos">บนจอ</span> : null}{/^<i>.*<\/i>$/.test(l) ? <i>{plain(l)}</i> : plain(l)}</span>))}</span>;
}
const FlagChips = ({ r }: { r: Row }) => <>{r.flags.map((f) => <span key={f} className={"ocm-flag f-" + f}>{FLAG_NAME[f]}</span>)}</>;

/* ---------- แถวบนของหน้าซับไตเติล เลือกงาน (ข้อ 143 ㉔) ---------- */
type Mode = "view" | "ocr" | "edit";
const MODES = (has: boolean) => [
  { value: "view" as Mode, label: <><IcSubtitle size={14} />ดูซับ</> },
  { value: "ocr" as Mode, label: <><IbWand size={14} />OCR เป็นตัวหนังสือ</> },
  { value: "edit" as Mode, label: <><IbTable size={14} />แก้ซับกับวิดีโอ</>, off: has ? undefined : "ซับรูปต้อง OCR เป็นตัวหนังสือก่อน จึงจะแก้กับวิดีโอได้" },
];
/** เลือกแทร็กซับ แทนแถวแทร็กเดิมที่กินที่ด้านบน (BUGS ข้อ 149 พี่กันสั่ง "ย้ายไปอยู่จุดอื่น มันกินที่ส่วนบน") · เพิ่มไฟล์ซับอยู่ท้ายรายการ */
function TrackDd() {
  const [t, setT] = useState("t1");
  return <Dropdown label="ซับที่แก้" value={t} onChange={(v) => { if (v !== "add") setT(v); }} options={[
    { value: "t1", label: "ซับที่ 1 PGS อังกฤษ English" }, { value: "add", label: "เพิ่มไฟล์ซับที่แยกจากหนัง" }]} />;
}
/** ของทั้งแถวบนของหน้าซับไตเติลอยู่ในแถบชื่อโปรแกรม แถวบนเดิมไม่มีแล้ว
 *  (BUGS ข้อ 149 พี่กันสั่ง "ย้ายขึ้นไป เเถบนี้" แล้ว "ย้ายขึ้นไปบนสุดให้หมด") · แบบ 2 ปุ่มเลือกงานเป็นแถบสามช่องในหน้า ไม่อยู่ในแถบชื่อ */
function TitleItems({ seg, mode, setMode, done }: { seg: boolean; mode: Mode; setMode: (m: Mode) => void; done: boolean }) {
  return (<>
    <span className="sv-sep" aria-hidden />
    <button type="button" className="btn btn-ghost btn-sm"><IcMix size={14} />ไปหน้าเสียงและซับ</button>
    <b data-tauri-drag-region>ซับรูปตัวอย่าง (2024).mkv</b>
    <TrackDd />
    <span className="ocm-ttlgap" data-tauri-drag-region />
    {seg && <Seg small label="งานที่ทำกับซับนี้" value={mode} onChange={setMode} options={MODES(done)} />}
    <button type="button" className="btn btn-ghost btn-sm"><IcFolder size={14} />เปิดไฟล์อื่น</button>
  </>);
}
function BarTabs({ mode, setMode, done }: { mode: Mode; setMode: (m: Mode) => void; done: boolean }) {
  const T: [Mode, React.ReactNode, string, string, string?][] = [
    ["view", <IcSubtitle size={18} />, "ดูซับ", "ดูภาพซับทีละหน้า และดูภาพเต็มพร้อมภาพจากหนัง"],
    ["ocr", <IbWand size={18} />, "OCR เป็นตัวหนังสือ", "อ่านซับรูปเป็นตัวหนังสือ ตรวจทาน แล้วส่งออก"],
    ["edit", <IbTable size={18} />, "แก้ซับกับวิดีโอ", "แก้เวลาและข้อความแบบ Aegisub", done ? undefined : "ต้อง OCR ก่อน"],
  ];
  return (<>
    <div className="ocm-tabs" role="tablist" aria-label="งานที่ทำกับซับนี้">
      {T.map(([v, ic, name, what, off]) => (
        // แถวเดียว ไอคอนกับชื่องาน คำบอกขึ้นตอนชี้ (พี่กันทัก "ปุ่มใหญ่เกิ้นน")
        <button key={v} type="button" role="tab" aria-selected={mode === v} aria-disabled={!!off || undefined} title={off ? `ซับรูปต้อง OCR เป็นตัวหนังสือก่อน จึงจะแก้กับวิดีโอได้` : what}
          className={"ocm-tab" + (mode === v ? " on" : "") + (off ? " off" : "")} onClick={() => { if (!off) setMode(v); }}>
          {ic}<b>{name}</b>
        </button>))}
    </div>
  </>);
}

/* ---------- หน้า OCR แบบ Subtitle Edit ---------- */
type Phase = "setup" | "run" | "done";
function EngineRow({ phase, manual }: { phase: Phase; manual?: boolean }) {
  const [eng, setEng] = useState(manual ? "nocr" : "paddle");
  const [size, setSize] = useState<"tiny" | "small" | "medium">("small");
  const [lang, setLang] = useState("eng");
  const [chk, setChk] = useState("medium");
  const busy = phase === "run";
  const why = busy ? "หยุดอ่านก่อนจึงจะเปลี่ยนได้" : undefined;
  return (
    <div className="ocm-engine">
      <span className="ocm-f">ตัวอ่าน<InfoTip title="ตัวอ่าน" tip={ENGINE_TIP} /></span>
      {/* ดรอปดาวน์ยืดเต็มแถวซ้ายถึงขวา (พี่กันสั่ง "ขยายให้เต็มซ้ายขวา") */}
      <Dropdown label="ตัวอ่าน" value={eng} onChange={setEng} disabled={why} stretch options={[
        { value: "paddle", label: "PaddleOCR PP-OCRv6" }, { value: "tess", label: "Tesseract 5.5.3" }, { value: "nocr", label: "nOCR สอนเอง" },
        { value: "bin", label: "Binary OCR สอนเอง" }, { value: "own", label: "ตัวสอนเองของชั้นหนัง" }]} />
      {/* ตัวสอนเองมีฐานตัวอักษรกับค่าเทียบ แทนขนาดโมเดล (แถวบนของหน้าต่าง OCR ใน Subtitle Edit) */}
      {eng === "nocr" || eng === "bin" || eng === "own" ? <>
        <span className="ocm-f">ฐาน</span>
        <Dropdown label="ฐานตัวอักษร" value="seg" onChange={() => {}} disabled={why} stretch options={[{ value: "seg", label: "อังกฤษ-Segoe.nocr" }, { value: "latin", label: "Latin.nocr" }]} />
        <span className="ocm-f">จุดผิดที่ยอม<InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} /></span>
        <input className="inp ocm-numi" inputMode="numeric" defaultValue="1" aria-label="จุดผิดที่ยอม" />
        <span className="ocm-f">จุดเว้นวรรค</span>
        <input className="inp ocm-numi" inputMode="numeric" defaultValue="8" aria-label="จุดที่นับเป็นเว้นวรรค" title="ช่องห่างระหว่างตัวกว้างเกินกี่จุดถึงนับเป็นเว้นวรรค" />
      </> : <>
        <span className="ocm-f">ขนาด<InfoTip title="ขนาดโมเดล" tip={SIZE_TIP} /></span>
        <Seg small label="ขนาดโมเดล" value={size} onChange={setSize} disabledReason={why} options={[{ value: "tiny", label: "tiny" }, { value: "small", label: "small" }, { value: "medium", label: "medium" }]} />
        <span className="ocm-f">ภาษา</span>
        <Dropdown label="ภาษา" value={lang} onChange={setLang} disabled={why} options={[{ value: "eng", label: "อังกฤษ" }, { value: "jpn", label: "ญี่ปุ่น" }, { value: "tha", label: "ไทย" }]} />
      </>}
      <span className="sv-sep" aria-hidden />
      <span className="ocm-f">ตัวช่วยตรวจ<InfoTip title="ตัวช่วยตรวจ" tip={CHECK_TIP} /></span>
      <Dropdown label="ตัวช่วยตรวจ" value={chk} onChange={setChk} disabled={why} stretch options={[{ value: "medium", label: "PP-OCRv6 medium" }, { value: "tess", label: "Tesseract 5.5.3" }, { value: "none", label: "ไม่ใช้" }]} />
    </div>
  );
}
/** ปุ่มเครื่องมือซ้ายของแถบล่าง (แถวบนแคบไม่พอที่หน้าต่าง 1280 × 800) */
function Tools({ onPrep, onModels }: { onPrep: () => void; onModels: () => void }) {
  return (<>
    <button type="button" className="btn btn-ghost btn-sm ocm-tool" onClick={onPrep} title="แต่งภาพก่อนส่งให้ตัวอ่าน"><IbCrop size={14} />แต่งภาพ</button>
    <button type="button" className="btn btn-ghost btn-sm ocm-tool" onClick={onModels} title="โหลดโมเดลและชุดภาษาเพิ่ม เช็กรุ่นล่าสุด"><IcSettings size={14} />ตัวอ่านและชุดภาษา</button>
    <span className="sv-sep" aria-hidden />
  </>);
}

function OcrTable({ rows, phase, upto, sel, setSel, onlyFlag }: { rows: Row[]; phase: Phase; upto: number; sel: number; setSel: (n: number) => void; onlyFlag: boolean }) {
  const list = onlyFlag ? rows.filter((r) => r.flags.length) : rows;
  return (
    <div className="ocm-grid">
      <table>
        {/* ปุ่มขยายอยู่คอลัมน์ของตัวเองข้างภาพ ไม่ทับภาพ (พี่กันสั่ง "เอาปุ่มไปไว้อีกคอลัม บัง") */}
        <colgroup><col style={{ width: 44 }} /><col style={{ width: 128 }} /><col style={{ width: 240 }} /><col style={{ width: 40 }} /><col /><col style={{ width: 168 }} /></colgroup>
        <thead><tr><th className="num">#</th><th>เวลา</th><th>ภาพ</th><th aria-label="ขยายภาพ" /><th>ข้อความ</th><th><span className="ocm-th">ตรวจ<InfoTip title="จุดที่ต้องตรวจ" tip={FLAG_TIP} /></span></th></tr></thead>
        <tbody>{list.map((r) => {
          const read = phase === "done" || r.n <= upto;
          const now = phase === "run" && r.n === upto + 1;
          return (
            <tr key={r.n} className={(sel === r.n ? "on" : "") + (read && r.flags.length && phase === "done" ? " flag" : "")} onClick={() => setSel(r.n)}>
              <td className="num">{r.n}</td>
              <td className="ocm-time">{ts(r.start)}<span>{(r.end - r.start).toFixed(1)} วิ</span></td>
              <td><SubImgView img={r.img} side /></td>
              <td className="ocm-zcol"><ZoomBtn img={r.img} /></td>
              <td>{read ? <Txt s={r.main} top={r.top} /> : now ? <span className="small ocm-reading">กำลังอ่าน…</span> : <span className="small ocm-dim">—</span>}</td>
              <td>{phase === "done" ? (r.flags.length ? <FlagChips r={r} /> : <span className="ocm-ok"><IbTick size={13} />ไม่มีจุดสงสัย</span>) : null}</td>
            </tr>);
        })}</tbody>
      </table>
    </div>
  );
}

function EditArea({ r, rows, onTeach, onUnknown, setSel }: { r: Row; rows: Row[]; onTeach: () => void; onUnknown: () => void; setSel: (n: number) => void }) {
  const [tab, setTab] = useState<"flag" | "word" | "fix" | "guess">("flag");
  const [frame, setFrame] = useState(true);
  const flagged = rows.filter((x) => x.flags.length);
  const words = [["Isee", 10]] as const;
  const fixes = rows.filter((x) => x.fix);
  const guesses = rows.filter((x) => x.guess);
  return (
    <div className="ocm-edit">
      <div className="ocm-editl">
        <div className="ocm-edhead"><b>ภาพที่ {r.n}</b><span className="small">{ts(r.start)}–{ts(r.end)}</span><span style={{ flex: 1 }} />
          <label className="sv-frame"><Switch on={frame} onChange={setFrame} label="ภาพจากหนังข้างหลังซับ" /><span>ภาพหนัง</span></label></div>
        <SubImgView img={r.img} frame={frame} fit="screen" />
      </div>
      <div className="ocm-editm">
        <div className="ocm-edhead"><b>ข้อความ</b><span style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost btn-sm ocm-ic" title="ตัวหนา Ctrl+B"><IbBold size={14} /></button>
          <button type="button" className="btn btn-ghost btn-sm ocm-ic" title="ตัวเอียง Ctrl+I"><IbItalic size={14} /></button></div>
        <textarea className="inp ocm-ta" defaultValue={plain(r.main)} key={r.n} spellCheck={false} />
        {r.top && <div className="small ocm-posnote"><span className="ocm-pos">บนจอ</span><Phr>{`บรรทัดแรกอยู่บนจอ ตอนส่งออกจะเก็บตำแหน่งไว้`}</Phr><InfoTip title="ตำแหน่งบนจอ" tip={POS_TIP} /></div>}
        {r.flags.includes("diff") && <div className="small ocm-other"><span className="ocm-otherl">ตัวช่วยตรวจอ่านได้</span><b>{plain(r.check).replace(/\n/g, " ")}</b>
          <button type="button" className="btn btn-ghost btn-sm">ใช้คำนี้</button></div>}
      </div>
      <div className="ocm-editr">
        {/* Subtitle Edit เป็นแท็บสามแท็บ ที่นี่แคบ ใช้ดรอปดาวน์แทน (กฎหัวกราฟแคบใช้ดรอปดาวน์ใน CLAUDE.md) */}
        <div className="ocm-edhead"><b>รายการ</b>
          <Dropdown label="รายการ" value={tab} onChange={setTab} stretch options={[{ value: "flag", label: `จุดที่ต้องตรวจ ${flagged.length} จุด` }, { value: "word", label: `คำที่ไม่รู้จัก ${words.length} คำ` }, { value: "fix", label: `ที่ตัวแก้คำแก้ให้ ${fixes.length} จุด` }, { value: "guess", label: `คำที่เดา ${guesses.length} คำ` }]} /></div>
        <div className="ocm-elist">
          {tab === "flag" && flagged.map((x) => <button key={x.n} type="button" className={"ocm-eitem" + (x.n === r.n ? " on" : "")} onClick={() => setSel(x.n)}><b>ภาพ {x.n}</b><span>{x.flags.map((f) => FLAG_NAME[f]).join(" และ ")}</span></button>)}
          {tab === "word" && words.map(([w, n]) => <button key={w} type="button" className="ocm-eitem" onClick={() => { setSel(n); onUnknown(); }}><b>{w}</b><span>ภาพ {n} กดเพื่อแก้</span></button>)}
          {tab === "fix" && fixes.map((x) => <div key={x.n} className="ocm-eitem"><b>ภาพ {x.n}</b><span>{x.fix![0]} → {x.fix![1]}</span></div>)}
          {tab === "guess" && guesses.map((x) => <div key={x.n} className="ocm-eitem"><b>ภาพ {x.n}</b><span>{x.guess![0]} → {x.guess![1]}</span></div>)}
        </div>
        <div className="ocm-eact">
          <button type="button" className="btn btn-ghost ocm-w2" onClick={onTeach}><IbPencil size={15} />สอนตัวอักษร</button>
          <button type="button" className="btn btn-ghost ocm-w2"><IbTick size={15} />ถูกแล้ว</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- ระบบสอนเองแบบแมนนวล ยกจาก Subtitle Edit (พี่กันสั่ง "ระบบเเมนนวล ยดจาก subtitile edit") ----------
   NOcrInspectWindow ตรวจบรรทัด แยกบรรทัดเป็นตัว ๆ ดูว่าแต่ละตัวจับคู่กับอะไรในฐาน แก้ ลบ เพิ่มคู่ที่ดีกว่า
   NOcrDbEditWindow แก้ฐานตัวอักษร · NOcrCharacterAddWindow สอนตัวที่ไม่รู้จัก · ฝึกจากฟอนต์ในเครื่อง
   ภาพตัวอักษรขยายมีเส้นที่ใช้เทียบ เส้นเขียวต้องผ่านเนื้อตัว เส้นแดงต้องผ่านที่ว่าง แบบ nOCR */
const STRIP = "Kōbe Street".split("");
const STRIP_ST: Record<number, "ok" | "new" | "weak"> = { 1: "new", 8: "weak" };
const LINES_TIP: Tip = { w: "ตัวสอนเองจำตัวอักษรเป็นเส้นสั้น ๆ ที่ลากผ่านภาพ ตอนอ่านจะเทียบว่าเส้นตกที่เดิมไหม", o: [
  ["เส้นเขียว", "ต้องผ่านเนื้อตัวอักษร", "", ""],
  ["เส้นแดง", "ต้องผ่านที่ว่าง ไม่โดนตัวอักษร", "", ""],
  ["จุดผิดที่ยอม", "จำนวนจุดบนเส้นที่ไม่ตรงได้ ยิ่งมากยิ่งจับคู่ง่ายแต่ผิดง่าย", "", ""],
], r: "จุดผิดที่ยอม 0–2 สำหรับซับ Blu-ray ที่ภาพคม" };
/** ตัวอักษรขยายพร้อมเส้นเทียบ · ตำแหน่งเส้นเป็นสัดส่วนของกรอบ */
/** ตัวอักษรตัดเฉพาะเนื้อตัว พร้อมเส้นเทียบแบบ nOCR ของ Subtitle Edit
 *  สุ่มเส้นแล้วเก็บเฉพาะเส้นที่ทุกจุดอยู่บนเนื้อตัว (เขียว) หรือทุกจุดอยู่บนที่ว่าง (แดง) คิดจากภาพจริง
 *  เส้นกับภาพใช้กรอบเดียวกัน เส้นจึงทับตัวอักษรตรงตำแหน่ง (เดิมเส้นตายตัวไม่ตรงตัว พี่กันทัก "เส้นขีด การทับ") */
function glyphOf(c: string, italic: boolean) {
  const fs = 80, cv = document.createElement("canvas"), g = cv.getContext("2d")!;
  const font = `${italic ? "italic " : ""}600 ${fs}px "Segoe UI", Arial, sans-serif`;
  cv.width = fs * 2; cv.height = fs * 2;
  g.font = font; g.lineJoin = "round"; g.textBaseline = "top"; g.lineWidth = 7; g.strokeStyle = "#101010"; g.strokeText(c, 20, 20); g.fillStyle = "#f1f1f1"; g.fillText(c, 20, 20);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  out.getContext("2d")!.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
  const ink = (u: number, v: number) => d[((y0 + Math.min(h - 1, Math.round(v * (h - 1)))) * cv.width + x0 + Math.min(w - 1, Math.round(u * (w - 1)))) * 4 + 3] > 128;
  let seed = c.charCodeAt(0) * 9301 + (italic ? 7 : 0);
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const fg: number[][] = [], bg: number[][] = [];
  for (let k = 0; k < 4000 && (fg.length < 6 || bg.length < 6); k++) {
    const a = [rnd(), rnd(), rnd(), rnd()];
    if (Math.hypot((a[2] - a[0]) * w, (a[3] - a[1]) * h) < Math.min(w, h) * 0.3) continue;
    let all = 0;
    for (let t = 0; t <= 20; t++) if (ink(a[0] + (a[2] - a[0]) * t / 20, a[1] + (a[3] - a[1]) * t / 20)) all++;
    if (all === 21 && fg.length < 6) fg.push(a); else if (all === 0 && bg.length < 6) bg.push(a);
  }
  return { png: out.toDataURL(), w, h, fg, bg };
}
function GlyphLines({ c, italic, size = 150 }: { c: string; italic?: boolean; size?: number }) {
  const g = useMemo(() => glyphOf(c, !!italic), [c, italic]);
  const k = (size - 24) / Math.max(g.w, g.h);
  return (
    <div className="ocm-glines" style={{ width: size, height: size }}>
      <div className="ocm-gbox" style={{ width: g.w * k, height: g.h * k }}>
        <img src={g.png} alt={`ตัวอักษร ${c}`} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
          {g.fg.map(([a, b, x, y], i) => <line key={"f" + i} x1={a} y1={b} x2={x} y2={y} className="fg" />)}
          {g.bg.map(([a, b, x, y], i) => <line key={"b" + i} x1={a} y1={b} x2={x} y2={y} className="bg" />)}
        </svg>
      </div>
    </div>);
}
function ManualArea({ onTeach, onDb, onTrain }: { onTeach: () => void; onDb: () => void; onTrain: () => void }) {
  const [pick, setPick] = useState(1);
  const st = STRIP_ST[pick] ?? "ok";
  return (
    <div className="ocm-edit ocm-manual">
      <div className="ocm-editl ocm-mstrip">
        <div className="ocm-edhead"><b>ตรวจบรรทัด ภาพที่ 9</b><span className="small">แยกบรรทัดเป็นตัว ๆ แล้วเทียบกับฐาน</span></div>
        <div className="ocm-strip">{STRIP.map((c, i) => c === " " ? <span key={i} className="ocm-sgap" title="เว้นวรรค" /> : (
          <button key={i} type="button" className={"ocm-sch s-" + (STRIP_ST[i] ?? "ok") + (pick === i ? " on" : "")} onClick={() => setPick(i)}>
            <GlyphImg c={c} italic={false} /><b>{STRIP_ST[i] === "new" ? "?" : c}</b></button>))}</div>
        <div className="small ocm-mleg"><span className="ocm-dot ok" />จับคู่ได้ <span className="ocm-dot weak" />จับคู่ได้แต่ไม่ตรงนัก <span className="ocm-dot new" />ไม่รู้จัก ต้องสอน</div>
      </div>
      <div className="ocm-editm ocm-mpick">
        <div className="ocm-edhead"><b>ตัวที่เลือก</b><InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} /></div>
        <div className="ocm-mrow2">
          <GlyphLines c={STRIP[pick]} size={120} />
          <div className="ocm-mfields">
            <div className="small">{st === "new" ? "ยังไม่มีในฐาน" : st === "weak" ? `จับคู่กับ ${STRIP[pick]} ในฐาน ผิด 3 จุด` : `จับคู่กับ ${STRIP[pick]} ในฐาน ผิด 0 จุด`}</div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 70 }}>ตัวนี้คือ</span><input className="inp" style={{ width: 70, fontSize: 18 }} defaultValue={st === "new" ? "" : STRIP[pick]} key={pick} data-select-all /></div>
            <div className="icv-row"><span className="icv-lbl" style={{ width: 70 }}>ตัวเอียง</span><Switch on={false} onChange={() => {}} label="ตัวเอียง" /></div>
          </div>
        </div>
      </div>
      <div className="ocm-editr">
        <div className="ocm-edhead"><b>ทำกับตัวนี้</b></div>
        <div className="ocm-mbtns">
          {st === "new" ? <button type="button" className="btn btn-main" onClick={onTeach}><IbPencil size={15} />สอนตัวนี้</button>
            : <><button type="button" className="btn btn-ghost" onClick={onDb}><IbTick size={15} />แก้ในฐาน</button>
              <button type="button" className="btn btn-ghost"><IbPlay size={15} />เพิ่มคู่ที่ดีกว่า</button>
              <button type="button" className="btn btn-ghost"><IcClose size={15} />ลบออกจากฐาน</button></>}
        </div>
        {/* ทำกับทั้งฐาน · เดิมอยู่แถบล่างแล้วดันปุ่มส่งออกล้นขวา คำบอกเวลาอ่านหายไป */}
        <div className="ocm-edhead ocm-mbase"><b>ทั้งฐาน</b></div>
        <div className="ocm-mbtns2"><button type="button" className="btn btn-ghost btn-sm" onClick={onDb}><IbTable size={14} />ฐานตัวอักษร</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onTrain}><IbWand size={14} />ฝึกจากฟอนต์</button></div>
      </div>
    </div>);
}

function OcrPage({ phase, dlg, manual }: { phase: Phase; dlg: string | null; manual?: boolean }) {
  const rows = useMemo(rowsOf, []);
  // ตัวสอนเองอ่านทีละแถวเองแล้วหยุดที่ตัวที่ฐานไม่รู้จัก รอสอนก่อนอ่านต่อ (แบบ RunNOcrLoop ของ Subtitle Edit)
  const upto = phase === "run" ? (manual ? 8 : 14) : phase === "done" ? rows.length : 0;
  const [sel, setSel] = useState(phase === "done" ? 3 : 1);
  const [only, setOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(dlg);
  const r = rows.find((x) => x.n === sel) ?? rows[0];
  const flagged = rows.filter((x) => x.flags.length).length;
  const pct = Math.round((upto / rows.length) * 100);
  return (
    <section className="card ocm-page" data-ocrmock-page>
      <EngineRow phase={phase} manual={manual} />
      {phase === "done" && <div className="ocm-sum">
        <CardIcon kind="warn" /><Phr>{`อ่านครบ ${rows.length} ภาพแล้ว มี ${flagged} ภาพที่ควรตรวจ และ 3 ภาพที่ซับอยู่บนจอ`}</Phr>
        <span style={{ flex: 1 }} />
        <label className="ocm-only"><Switch on={only} onChange={setOnly} label="แสดงเฉพาะจุดที่ต้องตรวจ" /><span>เฉพาะจุดที่ต้องตรวจ</span></label>
        <button type="button" className="btn btn-ghost btn-sm"><IbNext size={14} />จุดถัดไป</button>
      </div>}
      <OcrTable rows={rows} phase={phase} upto={upto} sel={sel} setSel={setSel} onlyFlag={only} />
      {phase === "done" && (manual ? <ManualArea onTeach={() => setOpen("teach")} onDb={() => setOpen("db")} onTrain={() => setOpen("train")} />
        : <EditArea r={r} rows={rows} setSel={setSel} onTeach={() => setOpen("teach")} onUnknown={() => setOpen("unknown")} />)}
      <div className="ocm-foot">
        {phase !== "run" && <Tools onPrep={() => setOpen("prep")} onModels={() => setOpen("models")} />}
        {phase === "run" ? <div className="ocm-prog"><div className="ocm-bar2"><span style={{ width: `${pct}%` }} /></div><span className="small">{manual ? `อ่านไป ${upto} จาก ${rows.length} ภาพ ${pct}% หยุดรอสอนตัวอักษรตัวที่ 2 ของภาพที่ 9` : `อ่านไป ${upto} จาก ${rows.length} ภาพ ${pct}% ใช้ไป 0:08 เหลือราว 12 วินาที ตัวช่วยตรวจอ่านตามหลัง`}</span></div>
          : phase === "setup" ? <span className="small"><Phr>{`ซับ PGS ${rows.length} ภาพ ภาษาอังกฤษ ยังไม่ได้อ่าน กดเริ่มอ่านแล้วตรวจทานได้ทีละภาพ`}</Phr></span>
          : <span className="small"><Phr>{`อ่าน 19.8 วินาที และตรวจซ้ำ 52.8 วินาที`}</Phr></span>}
        <span style={{ flex: 1 }} />
        {phase === "run" ? <button type="button" className="btn btn-ghost"><IbStop size={15} />หยุดชั่วคราว</button>
          : phase === "setup" ? <button type="button" className="btn btn-main"><IbPlay size={15} />เริ่มอ่าน</button>
          : <>
            <button type="button" className="btn btn-ghost"><IcRefresh size={15} />อ่านใหม่เฉพาะที่เลือก</button>
            <span className="sv-sep" aria-hidden />
            <button type="button" className="btn btn-ghost ocm-w2"><IbTable size={15} />ไปหน้าแก้ซับ</button>
            <button type="button" className="btn btn-main ocm-w2" onClick={() => setOpen("export")}><IcExtract size={15} />ส่งออก</button>
          </>}
      </div>
      <Dialogs open={open} setOpen={setOpen} rows={rows} running={manual && phase === "run"} />
    </section>
  );
}

/* ---------- ตรวจทานแบบทีละจุด ภาพซ้าย คำขวา (ข้อ 143 ⑤) ---------- */
function ReviewOne() {
  const rows = useMemo(rowsOf, []);
  const flagged = rows.filter((x) => x.flags.length);
  const [cur, setCur] = useState(flagged[0].n);
  const [open, setOpen] = useState<string | null>(null);
  const r = rows.find((x) => x.n === cur)!;
  const i = flagged.findIndex((x) => x.n === cur);
  return (
    <section className="card ocm-page ocm-one" data-ocrmock-page>
      <div className="ocm-sum">
        <CardIcon kind="warn" /><Phr>{`อ่านครบ ${rows.length} ภาพแล้ว ตรวจจุดที่ ${i + 1} จาก ${flagged.length} จุด`}</Phr><InfoTip title="จุดที่ต้องตรวจ" tip={FLAG_TIP} />
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-sm"><IbTable size={14} />ดูทุกภาพเป็นตาราง</button>
      </div>
      <div className="ocm-onebody">
        <div className="ocm-onelist">{flagged.map((x, k) => (
          <button key={x.n} type="button" className={"ocm-eitem" + (x.n === cur ? " on" : "")} onClick={() => setCur(x.n)}>
            <b>{k + 1}. ภาพ {x.n}</b><span>{x.flags.map((f) => FLAG_NAME[f]).join(" และ ")}</span></button>))}
        </div>
        <div className="ocm-onemain">
          {/* ภาพหดตามที่เหลือ ปุ่มใต้ภาพไม่ล้นลงไปทับแถบล่าง (ตัวหาของทับในโครมเจอ ตอนหน้ามีแถวแทร็กซับ) */}
          <div className="ocm-fitbox"><SubImgView img={r.img} frame fit="screen" /></div>
          <div className="ocm-onefields">
            <div className="ocm-onerow"><span className="ocm-onelbl">ตัวหลักอ่านได้</span><textarea className="inp ocm-ta" defaultValue={plain(r.main)} key={r.n} spellCheck={false} /></div>
            <div className="ocm-onerow"><span className="ocm-onelbl">ตัวช่วยตรวจ</span><div className="ocm-onechk"><Txt s={r.check} top={null} /></div></div>
            <div className="ocm-onerow"><span className="ocm-onelbl">เหตุที่สงสัย</span><div><FlagChips r={r} /></div></div>
          </div>
          <div className="ocm-oneact">
            <button type="button" className={"btn btn-sm " + (i > 0 ? "btn-ghost" : "btn-wait")} aria-disabled={i <= 0 || undefined} onClick={() => i > 0 && setCur(flagged[i - 1].n)}><IbBack size={14} />จุดก่อน</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen("teach")}><IbPencil size={14} />สอนตัวอักษร</button>
            <span style={{ flex: 1 }} />
            {/* ปุ่มคู่ขวากว้างและสูงเท่าปุ่มคู่ล่างของแถบล่าง (พี่กันสั่ง "ยาวเท่ากัน") · จุดที่ตัวช่วยตรวจอ่านตรงกัน ปุ่มยังอยู่แต่กดไม่ได้พร้อมเหตุผล ปุ่มไม่หายไม่ขยับ */}
            <button type="button" className={"btn ocm-w " + (r.flags.includes("diff") ? "btn-ghost" : "btn-wait")} aria-disabled={!r.flags.includes("diff") || undefined}
              title={r.flags.includes("diff") ? "แทนคำของตัวหลักด้วยคำที่ตัวช่วยตรวจอ่านได้" : "ตัวช่วยตรวจอ่านได้ตรงกับตัวหลัก"}><IbSwap size={15} />ใช้คำของตัวช่วยตรวจ</button>
            <button type="button" className="btn btn-main ocm-w" onClick={() => i < flagged.length - 1 && setCur(flagged[i + 1].n)}><IbTick size={15} />ถูกแล้ว ไปจุดถัดไป</button>
          </div>
        </div>
      </div>
      <div className="ocm-foot">
        <span className="small"><Phr>ตรวจครบทุกจุดแล้วเลือกปลายทางได้ ส่วนภาพที่ไม่มีจุดสงสัยยังเปิดดูได้จากตาราง</Phr></span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost ocm-w"><IbTable size={15} />ไปหน้าแก้ซับ</button>
        <button type="button" className="btn btn-main ocm-w" onClick={() => setOpen("export")}><IcExtract size={15} />ส่งออก</button>
      </div>
      <Dialogs open={open} setOpen={setOpen} rows={rows} />
    </section>
  );
}

/* ---------- หน้าต่างซ้อน ---------- */
function drawText(s: string, italic = false, fs = 54) {
  const c = document.createElement("canvas"), g = c.getContext("2d")!;
  const font = `${italic ? "italic " : ""}600 ${fs}px "Segoe UI", Arial, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(s).width) + 20, h = Math.round(fs * 1.4);
  c.width = w; c.height = h;
  g.font = font; g.lineJoin = "round"; g.textBaseline = "top"; g.lineWidth = 7; g.strokeStyle = "#101010"; g.strokeText(s, 10, fs * 0.15); g.fillStyle = "#f1f1f1"; g.fillText(s, 10, fs * 0.15);
  // กรอบตัวอักษรตัวที่สอง (ō ใน Kōbe) วัดจากความกว้างของตัวก่อนหน้า
  const x0 = 10 + g.measureText(s.slice(0, 1)).width, x1 = 10 + g.measureText(s.slice(0, 2)).width;
  return { png: c.toDataURL(), w, h, box: [x0, x1] as [number, number] };
}

/** ไฟล์ SRT จากผลอ่าน · ภาพที่มีป้ายบนจอ แยกแถว ใส่ {\an8} หรือรวมเป็นบรรทัดแรก · เลขแถวเรียงต่อกันไม่ซ้ำ */
function srtOf(rows: Row[], pos: string) {
  const t = (s: number) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, x = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
  const out: string[] = [];
  const add = (r: Row, body: string) => out.push(`${out.length + 1}\n${t(r.start)} --> ${t(r.end)}\n${body}`);
  for (const r of rows) {
    const ls = r.main.split("\n");
    if (r.top && pos === "tag") { add(r, `{\\an8}${ls[0]}`); add(r, ls.slice(1).join("\n")); } else add(r, ls.join("\n"));
  }
  return { text: out.join("\n\n"), count: out.length };
}

const ENC_TIP: Tip = { w: "รหัสอักษรคือวิธีเก็บตัวหนังสือลงไฟล์ ถ้าโปรแกรมเล่นอ่านด้วยรหัสอื่น ตัวหนังสือจะเพี้ยนเป็นตัวแปลก ๆ", o: [
  ["UTF-8 มี BOM", "เก็บได้ทุกภาษา มีป้ายบอกรหัสไว้หัวไฟล์", "โปรแกรมเล่นแทบทุกตัวรู้เองว่าเป็นรหัสนี้", ""],
  ["UTF-8 ไม่มี BOM", "เก็บได้ทุกภาษา ไม่มีป้ายหัวไฟล์", "เข้ากับเว็บและโปรแกรมใหม่ ๆ", "โปรแกรมเล่นเก่าบางตัวอ่านไทยเพี้ยน"],
  ["UTF-16", "เก็บได้ทุกภาษา ไฟล์ใหญ่ขึ้นราวสองเท่า", "", "บางโปรแกรมอ่านไม่ได้"],
  ["TIS-620 และ Shift-JIS", "รหัสเก่าของไทยกับญี่ปุ่น", "เครื่องเล่นรุ่นเก่าที่อ่าน UTF-8 ไม่ได้", "เก็บได้ภาษาเดียว"],
], r: "UTF-8 มี BOM" };

/** ตัวที่สอนไปแล้วในรอบนี้ (ตัว ตัวเอียงไหม มาจากภาพไหน) */
const TAUGHT: [string, boolean, string][] = [["ā", false, "ภาพ 2"], ["ō", false, "ภาพ 9"], ["ï", false, "ภาพ 22"], ["é", false, "ภาพ 22"], ["E", true, "ภาพ 6"], ["w", true, "ภาพ 6"]];
function GlyphImg({ c, italic }: { c: string; italic: boolean }) {
  const g = useMemo(() => drawText(c, italic, 54), [c, italic]);
  return <span className="ocm-glyph"><img src={g.png} alt="" /></span>;
}

/** หน้าต่างซ้อนของ OCR ทุกหน้าต่างขนาดเท่ากัน สลับหน้าต่างแล้วกรอบไม่ยืดหด เนื้อยาวกว่าเลื่อนในหน้าต่าง
 *  (พี่กันสั่ง 16 พ.ย. 2569 "กรอบ popup ต้องขนาดเท่ากันทั้งหมด") */
const DLG_W = 880, DLG_H = "min(640px, calc(100vh - 48px))";

function Dialogs({ open, setOpen, rows, running }: { open: string | null; setOpen: (s: string | null) => void; rows: Row[]; running?: boolean }) {
  const close = () => setOpen(null);
  const [fmt, setFmt] = useState("srt");
  const [pos, setPos] = useState("tag");
  const [italic, setItalic] = useState(false);
  const [ch, setCh] = useState("ō");
  const teach = useMemo(() => drawText("Kōbe Street"), []);
  const [box, setBox] = useState<[number, number]>(() => [Math.round(teach.box[0]), Math.round(teach.box[1])]);
  const drag = useRef<"l" | "r" | null>(null);
  const [prep, setPrep] = useState({ crop: true, invert: false, border: false, bw: false, up: false });
  const word = rows.find((r) => r.n === 10)!;
  const [pi, setPi] = useState(1);
  const [enc, setEnc] = useState("utf8bom");
  const [dbc, setDbc] = useState("e");
  const [dbv, setDbv] = useState(0);
  const [draw, setDraw] = useState("fg");
  const [font, setFont] = useState("Segoe UI");
  return (<>
    {/* ส่งออก · ตำแหน่งซับบนจอ (ข้อ 143 ⑭) · ชนิดไฟล์ตามที่ Subtitle Edit มี (ข้อ ㉕) */}
    <Dialog open={open === "export"} onClose={close} kind="work" title="ส่งออกเป็นซับตัวหนังสือ" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IcClose size={15} />ยกเลิก</button><button type="button" className="btn btn-main"><IcExtract size={15} />ส่งออก</button></>}>
      {/* แบ่งสองฝั่ง ซ้ายตั้งค่า ขวาเลื่อนดูซับทั้งไฟล์ที่จะได้ (พี่กันสั่ง "แบ่งสองส่วน ฝั่งนึงเลื่อนดูซับ ฝั่งนึงตั้งค่า") */}
      <div className="ocm-exp">
        <div className="ocm-expl">
          <div className="icv-head">ชนิดไฟล์</div>
          {/* ห่ออีกชั้น ดรอปดาวน์แบบเต็มความกว้างตั้ง flex 1 ไว้ในตัว วางในคอลัมน์แล้วยืดลงเป็นช่องว่าง */}
          <div style={{ display: "flex" }}><Dropdown label="ชนิดไฟล์" value={fmt} onChange={setFmt} search stretch hint="พิมพ์ค้น เช่น srt หรือ ass" options={[{ value: "srt", label: "SubRip .srt" }, { value: "ass", label: "Advanced SubStation .ass" }, { value: "vtt", label: "WebVTT .vtt" }, { value: "sbv", label: "YouTube .sbv" }, { value: "ttml", label: "TTML .ttml" }, { value: "txt", label: "ข้อความล้วน .txt" }]} /></div>
          <span className="small"><Phr>ชนิดอื่นตามที่ Subtitle Edit เขียนได้ พิมพ์ค้นในช่องได้</Phr></span>
          <div className="icv-head">ที่เก็บ</div>
          {/* ที่อยู่ไฟล์ในกรอบ ปุ่มเปลี่ยนที่เก็บขวาสุดแถวเดียวกัน (พี่กันสั่ง "ย้ายไปอยู่ขวาสุดถัดจากที่อยู่ไฟล์ เเละใส่กรอบที่อยู่ไฟล์ด้วย") */}
          <div className="ocm-pathrow"><span className="small icv-path ocm-pathbox">D:\หนัง\ซับรูปตัวอย่าง (2024).en.srt</span>
            <button type="button" className="btn btn-ghost"><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>
          <div className="stat warn ocm-posw"><CardIcon kind="warn" /><div style={{ flex: 1 }}><b>มี 3 ภาพที่ซับอยู่บนจอ</b>
            <span className="ocm-br">{"ภาพ 3, 9 และ 16 มีป้ายบนจอขึ้นพร้อมบทพูดล่างจอ\nเลือกว่าจะเก็บไว้อย่างไร"}</span>
            <div className="ocm-posopts">
              <Seg small label="ตำแหน่งบนจอ" value={pos} onChange={setPos} options={[{ value: "tag", label: "แยกแถว เก็บไว้บนจอ" }, { value: "down", label: "รวมไว้ล่างจอ" }]} />
              <InfoTip title="ตำแหน่งบนจอตอนส่งออก" tip={{ w: "ซับแถวเดียวของ SRT มีได้ตำแหน่งเดียว ป้ายบนจอกับบทพูดล่างจอที่ขึ้นพร้อมกันจึงต้องแยกเป็นสองแถว ถ้าอยากให้อยู่คนละที่", o: [
                ["แยกแถว เก็บไว้บนจอ", "ป้ายบนจอเป็นอีกแถวที่เวลาเดียวกัน ใส่แท็ก {\\an8} ให้ขึ้นบนจอเหมือนต้นฉบับ", "เหมือนต้นฉบับ", "โปรแกรมเล่นเก่าบางตัวแสดงแท็กเป็นตัวหนังสือ"],
                ["รวมไว้ล่างจอ", "ป้ายบนจอต่อเป็นบรรทัดแรกของบทพูดล่างจอ", "อ่านได้ทุกโปรแกรม", "ป้ายที่ควรอยู่บนลงมาเบียดบทพูด"],
              ], r: "แยกแถว เก็บไว้บนจอ" }} />
            </div></div></div>
          <div className="icv-row"><span className="icv-lbl">ตัวเอียง</span><Switch on label="เก็บตัวเอียง" onChange={() => {}} /><span className="small">เก็บเป็นแท็ก i</span></div>
          {/* เลือกรหัสอักษรได้ (พี่กันถาม "ให้เปลี่ยนได้ไหม") */}
          <div className="icv-row"><span className="icv-lbl">รหัสอักษร<InfoTip title="รหัสอักษร" tip={ENC_TIP} /></span>
            <Dropdown label="รหัสอักษร" value={enc} onChange={setEnc} options={[{ value: "utf8bom", label: "UTF-8 มี BOM" }, { value: "utf8", label: "UTF-8 ไม่มี BOM" }, { value: "utf16", label: "UTF-16" }, { value: "tis", label: "TIS-620 ภาษาไทย" }, { value: "sjis", label: "Shift-JIS ภาษาญี่ปุ่น" }]} /></div>
        </div>
        <div className="ocm-expr">
          <div className="icv-head">ไฟล์ที่จะได้<span className="small" style={{ fontWeight: 400 }}>{`${srtOf(rows, pos).count} แถว เลื่อนดูได้ทั้งไฟล์`}</span></div>
          <pre className="ocm-pre">{srtOf(rows, pos).text}</pre>
        </div>
      </div>
    </Dialog>

    {/* สอนตัวอักษร แบบ nOCR ของ Subtitle Edit (NOcrCharacterAddWindow) */}
    {/* ระหว่างอ่านด้วยตัวสอนเอง ตัวอ่านหยุดที่ตัวที่ฐานไม่รู้จักแล้วเปิดหน้าต่างนี้ หัวบอกภาพ ตัวที่เท่าไหร่ และฐานที่ใช้ (SetTitle ของ NOcrCharacterAddViewModel)
        ปุ่มห้าทางตาม Subtitle Edit จำตัวนี้ลงฐานแล้วอ่านต่อ ใช้ครั้งเดียวไม่ลงฐาน ข้ามใส่ * หยุดอ่าน และตัวที่สอนในรอบนี้ (พี่กันเคาะ "ก็ระบบนี้แหละ") */}
    <Dialog open={open === "teach"} onClose={close} kind="work" title={running ? "สอนตัวอักษร ภาพที่ 9 ตัวที่ 2 จาก 11 ฐาน อังกฤษ-Segoe.nocr" : "สอนตัวอักษร"} width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IbStop size={15} />{running ? "หยุดอ่าน" : "ปิด"}</button><span style={{ flex: 1 }} /><button type="button" className="btn btn-ghost" onClick={close}><IbNext size={15} />ข้าม ใส่ *</button><button type="button" className="btn btn-ghost" onClick={close}><IcClock size={15} />ใช้ครั้งเดียว</button><button type="button" className="btn btn-main" onClick={close}><IbTick size={15} />{running ? "จำตัวนี้แล้วอ่านต่อ" : "จำตัวนี้"}</button></>}>
      <div className="ocm-dlg">
        <div className="small"><Phr>ตัวอ่านไม่รู้จักตัวในกรอบ พิมพ์ว่าเป็นตัวอะไร โปรแกรมจะจำรูปร่างนี้ไว้ แล้วอ่านเองครั้งต่อไป  ลากขอบซ้ายขวาของกรอบเพื่อปรับเองได้</Phr></div>
        {/* กรอบตัวอักษรลากขอบซ้ายขวาเองได้ (พี่กันขอ "ขอเเมนนวลด้วย") */}
        <div className="ocm-teachimg" onPointerMove={(e) => { if (!drag.current) return; const r = e.currentTarget.getBoundingClientRect(); const x = Math.round(e.clientX - r.left - 8); setBox((b) => drag.current === "l" ? [Math.min(x, b[1] - 6), b[1]] : [b[0], Math.max(x, b[0] + 6)]); }}
          onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
          <img src={teach.png} alt="Kōbe Street" draggable={false} />
          <span className="ocm-teachbox" style={{ left: box[0], width: box[1] - box[0] }}>
            <span className="ocm-hdl l" onPointerDown={(e) => { e.preventDefault(); drag.current = "l"; }} title="ลากเพื่อย้ายขอบซ้าย" />
            <span className="ocm-hdl r" onPointerDown={(e) => { e.preventDefault(); drag.current = "r"; }} title="ลากเพื่อย้ายขอบขวา" />
          </span>
        </div>
        <div className="ocm-teachrow">
          {/* กรอบสี่เหลี่ยมว่าง วางเฉพาะส่วนที่อยู่ในกรอบเลือกไว้กลางกรอบ ไม่เอาตัวข้าง ๆ มาด้วย
              (พี่กันสั่ง "เอากรอบว่างสี่เหลี่ยมมา เเละเอาภาพที่เลือก มาไว้ตรกลาง ไม่ใช่ขยายเอาตัวข้างๆมา") */}
          <div className="ocm-teachchar">{(() => { const cw = box[1] - box[0], z = Math.min(130 / cw, 130 / teach.h); return (
            <div className="ocm-crop" style={{ width: cw * z, height: teach.h * z }}>
              <img src={teach.png} alt={`ตัวที่เลือก ${ch}`} draggable={false} style={{ width: teach.w * z, marginLeft: -box[0] * z }} />
            </div>); })()}</div>
          <div className="ocm-teachf">
            <div className="icv-row"><span className="icv-lbl">ตัวนี้คือ</span><input className="inp" style={{ width: 90, fontSize: 18 }} value={ch} onChange={(e) => setCh(e.target.value)} data-select-all />
              <span className="small">คลิกขวาในช่องเพื่อใส่ตัวพิเศษ เช่น ā ō ï é</span></div>
            <div className="icv-row"><span className="icv-lbl">ตัวเอียง</span><Switch on={italic} onChange={setItalic} label="ตัวเอียง" /></div>
            <div className="icv-row"><span className="icv-lbl">กรอบตัวอักษร</span>
              <label className="icv-f">ซ้าย<input className="inp" style={{ width: 56 }} inputMode="numeric" value={box[0]} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setBox([Math.min(v, box[1] - 6), box[1]]); }} /></label>
              <label className="icv-f">ขวา<input className="inp" style={{ width: 56 }} inputMode="numeric" value={box[1]} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v)) setBox([box[0], Math.max(v, box[0] + 6)]); }} /></label>
              <span className="small">จุด</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBox([box[0] + 2, box[1] - 2])}>หดกรอบ</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBox([Math.max(0, box[0] - 2), box[1] + 2])}>ขยายกรอบ</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBox([Math.round(teach.box[0]), Math.round(teach.box[1])])} title="กลับไปกรอบที่โปรแกรมหาให้"><IbRevert size={14} /></button></div>
            <div className="icv-row"><span className="icv-lbl">ฐานตัวอักษร</span><span className="small">อังกฤษ-Segoe.nocr มี 86 ตัว สอนเพิ่มรอบนี้ 4 ตัว</span></div>
            <div className="icv-row"><span className="icv-lbl">หลังสอนอ่านได้</span><b className="ocm-after">K{ch || "?"}be Street</b></div>
          </div>
        </div>
        {/* ตัวที่สอนในรอบนี้ แบบ Inspect additions ของ Subtitle Edit กดเพื่อแก้หรือลบ */}
        <div className="ocm-fill"><div className="icv-head">ตัวที่สอนในรอบนี้<span className="small" style={{ fontWeight: 400 }}>กดตัวไหนเพื่อแก้หรือลบ</span></div>
          <div className="ocm-learned">{TAUGHT.map(([c, it, from]) => (
            <button key={c + from} type="button" className="ocm-lch"><GlyphImg c={c} italic={it} /><b>{c}</b><span className="small">{from}</span></button>))}</div></div>
      </div>
    </Dialog>

    {/* คำที่ไม่รู้จัก (PromptUnknownWordWindow) */}
    <Dialog open={open === "unknown"} onClose={close} kind="work" title="คำที่ไม่รู้จัก" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} /><button type="button" className="btn btn-ghost" onClick={close}><IbNext size={15} />ข้ามคำนี้</button><button type="button" className="btn btn-ghost"><IbJump size={15} />ข้ามทุกที่</button><button type="button" className="btn btn-ghost"><IbSwap size={15} />เปลี่ยนทุกที่</button><button type="button" className="btn btn-main"><IbTick size={15} />เปลี่ยน</button></>}>
      <div className="ocm-dlg">
        <SubImgView img={word.img} />
        <div className="icv-row"><span className="icv-lbl">อ่านได้</span><span className="ocm-word">Isee...</span></div>
        <div className="icv-row"><span className="icv-lbl">เปลี่ยนเป็น</span><input className="inp" style={{ width: 220 }} defaultValue="I see" /></div>
        <div className="icv-row"><span className="icv-lbl">คำแนะนำ</span><div className="ocm-sugg"><button type="button" className="btn btn-ghost btn-sm">I see</button><button type="button" className="btn btn-ghost btn-sm">Isle</button><button type="button" className="btn btn-ghost btn-sm">Ise</button></div></div>
        <div className="icv-row"><span className="icv-lbl">จำไว้</span><button type="button" className="btn btn-ghost btn-sm">เพิ่มเป็นชื่อเฉพาะ</button><button type="button" className="btn btn-ghost btn-sm">เพิ่มเข้าพจนานุกรม</button><button type="button" className="btn btn-ghost btn-sm">เพิ่มเป็นคู่แก้คำ OCR</button></div>
        {/* ภาพบนจอของบรรทัดนี้ กับที่อื่นในไฟล์ที่เจอคำเดียวกัน (ใช้ที่ว่างของหน้าต่างที่ขนาดเท่ากัน) */}
        <div className="ocm-fill ocm-two">
          <div className="ocm-fitbox"><SubImgView img={word.img} frame fit="screen" /></div>
          <div className="ocm-side">
            <div className="icv-head">เจอคำนี้ที่อื่นในไฟล์</div>
            <div className="ocm-elist">
              <div className="ocm-eitem on"><b>ภาพ 10</b><span>Isee... บรรทัดนี้</span></div>
              <div className="ocm-eitem"><b>ภาพ 36</b><span>ตัวช่วยตรวจอ่านได้ I see... ไม่สงสัย</span></div>
            </div>
            <span className="small"><Phr>เทียบกับพจนานุกรมอังกฤษ และชื่อเฉพาะที่จดไว้ 12 คำ</Phr></span>
          </div>
        </div>
      </div>
    </Dialog>

    {/* แต่งภาพก่อนอ่าน (PreProcessingWindow) */}
    <Dialog open={open === "prep"} onClose={close} kind="work" title="แต่งภาพก่อนอ่าน" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IcClose size={15} />ยกเลิก</button><button type="button" className="btn btn-main" onClick={close}><IbTick size={15} />ใช้ค่านี้</button></>}>
      <div className="ocm-dlg ocm-prep">
        <div className="ocm-prepl">
          <div className="small"><Phr>แต่งภาพก่อนส่งให้ตัวอ่าน ภาพต้นฉบับไม่ถูกแก้</Phr> <InfoTip title="แต่งภาพก่อนอ่าน" tip={PREP_TIP} /></div>
          {([["crop", "ครอปส่วนใส"], ["invert", "กลับสีเป็นตัวดำพื้นขาว"], ["border", "ลบขอบ"], ["bw", "ทำเป็นขาวดำ"], ["up", "ขยายภาพสองเท่า"]] as const).map(([k, l]) => (
            <div key={k} className="icv-row"><Switch on={prep[k]} onChange={(v) => setPrep({ ...prep, [k]: v })} label={l} /><span>{l}</span></div>))}
          <div className="icv-row"><span className="icv-lbl">ความหนาขอบ</span><input className="inp" style={{ width: 60 }} defaultValue="2" inputMode="numeric" /><span className="small">จุด</span></div>
          <div className="icv-row"><span className="icv-lbl">เกณฑ์ความมืด</span><input className="inp" style={{ width: 60 }} defaultValue="128" inputMode="numeric" /></div>
          {/* ผลอ่านก่อนกับหลังแต่งภาพของภาพตัวอย่างที่เลือก ใช้ที่ว่างฝั่งซ้าย */}
          <div className="ocm-fill"><div className="icv-head">ตัวอ่านอ่านได้</div>
            <div className="ocm-cmp"><span className="small">ก่อนแต่งภาพ</span><span>{plain(rows[pi].main).replace(/\n/g, " ")}</span></div>
            <div className="ocm-cmp"><span className="small">หลังแต่งภาพ</span><span>{plain(rows[pi].truth).replace(/\n/g, " ")}</span></div>
            <span className="small"><Phr>กดอ่านภาพนี้ใหม่เพื่อเทียบ ภาพอื่นยังไม่ถูกอ่านจนกว่าจะกดใช้ค่านี้</Phr></span>
            <div><button type="button" className="btn btn-ghost btn-sm"><IcRefresh size={14} />อ่านภาพนี้ใหม่</button></div></div>
        </div>
        <div className="ocm-prepr">
          <div className="icv-pick"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setPi(Math.max(0, pi - 1))} title="ภาพก่อนหน้า"><IbBack size={14} /></button>
            <span className="small">{`ภาพตัวอย่างที่ ${pi + 1} จาก ${rows.length}`}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPi(Math.min(rows.length - 1, pi + 1))} title="ภาพถัดไป"><IbNext size={14} /></button></div>
          <figure className="icv-fig"><figcaption>ภาพบนจอ</figcaption><SubImgView img={rows[pi].img} frame fit="screen" /></figure>
          <figure className="icv-fig"><figcaption>ภาพต้นฉบับ</figcaption><SubImgView img={rows[pi].img} /></figure>
          <figure className="icv-fig"><figcaption>ภาพที่ส่งให้ตัวอ่าน</figcaption><SubImgView img={rows[pi].img} invert={prep.invert} /></figure>
        </div>
      </div>
    </Dialog>

    {/* ตัวอ่านและชุดภาษาที่โหลดเพิ่มได้ (ข้อ 143 ② ⑫) */}
    <Dialog open={open === "models"} onClose={close} kind="work" title="ตัวอ่านและชุดภาษา" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost"><IcRefresh size={15} />เช็กรุ่นล่าสุด</button><button type="button" className="btn btn-main" onClick={close}><IcClose size={15} />ปิด</button></>}>
      <div className="ocm-dlg ocm-models">
        <div className="small"><Phr>ทุกตัวทำงานในเครื่อง โหลดครั้งเดียวแล้วใช้ได้ตลอด ปุ่มโหลดออกเน็ตเฉพาะตอนกด</Phr></div>
        <div className="ocm-mgrid">{([
          ["PaddleOCR PP-OCRv6", "ตัวรัน ONNX Runtime 1.32 แนบมากับโปรแกรม", [["tiny อังกฤษ ญี่ปุ่น จีน", "4.4 MB", true], ["small อังกฤษ ญี่ปุ่น จีน", "21 MB", true], ["medium อังกฤษ ญี่ปุ่น จีน", "74 MB", false], ["ไทย PP-OCRv5 mobile", "โหลดเพิ่ม", false]]],
          ["Tesseract 5.5.3", "รุ่นเดียวกับที่ Subtitle Edit ใช้", [["อังกฤษ eng", "15 MB", true], ["ไทย tha", "โหลดเพิ่ม", false], ["ญี่ปุ่น jpn", "โหลดเพิ่ม", false]]],
          ["nOCR และ Binary OCR", "ฐานตัวอักษรจาก Subtitle Edit และฐานที่สอนเอง", [["Latin.nocr", "มีแล้ว", true], ["Latin.db", "มีแล้ว", true], ["อังกฤษ-Segoe.nocr ที่สอนเอง", "86 ตัว", true]]],
          ["ตัวสอนเองของชั้นหนัง", "ฐานที่สอนจากซับไทย", [["ยังไม่มีฐาน", "สอนจากหน้าสอนตัวอักษร", null]]],
        ] as [string, string, [string, string, boolean | null][]][]).map(([name, what, items]) => (
          <div key={name} className="ocm-mcard">
            <div className="ocm-mhead"><b>{name}</b><span className="small">{what}</span></div>
            {items.map(([l, sz, ok]) => (
              <div key={l} className="ocm-mrow"><span>{l}</span><span className="small">{sz}</span>
                {ok ? <span className="ocm-ok"><IbTick size={13} />มีแล้ว</span> : ok === false ? <button type="button" className="btn btn-ghost btn-sm">โหลด</button> : <span />}</div>))}
          </div>))}</div>
      </div>
    </Dialog>

    {/* แก้ฐานตัวอักษร ยกจาก NOcrDbEditWindow ของ Subtitle Edit · ซ้ายเลือกตัว เห็นทุกรูปแบบที่สอนไว้ ขวาแก้รูปแบบที่เลือก */}
    <Dialog open={open === "db"} onClose={close} kind="work" title="ฐานตัวอักษร อังกฤษ-Segoe.nocr" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} /><button type="button" className="btn btn-main" onClick={close}><IbTick size={15} />บันทึกฐาน</button></>}>
      <div className="ocm-dlg ocm-db">
        <div className="ocm-dbl">
          <div className="icv-head">ตัวอักษร<span className="small" style={{ fontWeight: 400 }}>86 ตัว 214 รูปแบบ</span></div>
          <div style={{ display: "flex" }}><Dropdown label="ตัวอักษร" value={dbc} onChange={setDbc} search stretch hint="พิมพ์ตัวที่หา" options={DB_CHARS.map((c) => ({ value: c, label: `${c}  ${DB_COUNT[c] ?? 2} รูปแบบ` }))} /></div>
          <div className="ocm-dbvars">{Array.from({ length: DB_COUNT[dbc] ?? 2 }, (_, i) => (
            <button key={i} type="button" className={"ocm-lch" + (dbv === i ? " on" : "")} onClick={() => setDbv(i)}><GlyphImg c={dbc} italic={i === 2} /><span className="small">{i === 2 ? "ตัวเอียง" : `รูปแบบ ${i + 1}`}</span></button>))}</div>
          <div className="ocm-dbtools"><button type="button" className="btn btn-ghost btn-sm">ฐานใหม่</button><button type="button" className="btn btn-ghost btn-sm">เปลี่ยนชื่อ</button><button type="button" className="btn btn-ghost btn-sm" title="รวมรูปแบบที่ซ้ำกัน ฐานเล็กลง อ่านเร็วขึ้น">ย่อฐาน</button></div>
        </div>
        <div className="ocm-dbr">
          <div className="icv-head">รูปแบบที่เลือก<InfoTip title="เส้นที่ใช้เทียบ" tip={LINES_TIP} /></div>
          <div className="ocm-mrow2">
            <GlyphLines c={dbc} italic={dbv === 2} size={190} />
            <div className="ocm-mfields">
              <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>ตัวนี้คือ</span><input className="inp" style={{ width: 70, fontSize: 18 }} value={dbc} readOnly /></div>
              <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>ตัวเอียง</span><Switch on={dbv === 2} onChange={() => {}} label="ตัวเอียง" /></div>
              <div className="small">ขนาด 28 × 40 จุด ระยะจากบน 6 จุด</div>
              <div className="small">สอนจากภาพ 9 ของซับรูปตัวอย่าง</div>
              <div className="ocm-dbtools"><button type="button" className="btn btn-ghost btn-sm"><IbTick size={14} />แก้</button><button type="button" className="btn btn-ghost btn-sm"><IcClose size={14} />ลบรูปแบบนี้</button></div>
            </div>
          </div>
          <div className="icv-row"><span className="icv-lbl" style={{ width: 80 }}>วาดเส้น</span><Seg small label="วาดเส้น" value={draw} onChange={setDraw} options={[{ value: "fg", label: "เส้นผ่านเนื้อตัว" }, { value: "bg", label: "เส้นผ่านที่ว่าง" }]} />
            <button type="button" className="btn btn-ghost btn-sm" title="ลบเส้นทั้งหมดแล้ววาดให้ใหม่">วาดใหม่อัตโนมัติ</button></div>
          <span className="small"><Phr>ลากบนภาพเพื่อวาดเส้นเอง เส้นเขียวต้องผ่านเนื้อตัว เส้นแดงต้องผ่านที่ว่าง</Phr></span>
        </div>
      </div>
    </Dialog>

    {/* ฝึกจากฟอนต์ในเครื่อง ยกจากหน้าฝึก nOCR ของ Subtitle Edit · สร้างฐานได้โดยไม่ต้องสอนทีละตัว */}
    <Dialog open={open === "train"} onClose={close} kind="work" title="ฝึกจากฟอนต์ในเครื่อง" width={DLG_W} height={DLG_H}
      actions={<><button type="button" className="btn btn-ghost" onClick={close}><IcClose size={15} />ปิด</button><span style={{ flex: 1 }} /><button type="button" className="btn btn-main"><IbPlay size={15} />เริ่มฝึก</button></>}>
      <div className="ocm-dlg ocm-train">
        <div className="ocm-trl">
          <div className="small"><Phr>เลือกฟอนต์ที่ซับเรื่องนี้ใช้ โปรแกรมวาดตัวอักษรทุกตัวแล้วจำไว้ในฐาน ใช้แทนการสอนทีละตัว</Phr></div>
          <div className="icv-row"><span className="icv-lbl">ฟอนต์</span><div style={{ display: "flex", flex: 1 }}><Dropdown label="ฟอนต์" value={font} onChange={setFont} search stretch hint="พิมพ์ชื่อฟอนต์" options={["Segoe UI", "Arial", "Tahoma", "Sarabun", "Leelawadee UI", "Noto Sans Thai"].map((x) => ({ value: x, label: x }))} /></div></div>
          <div className="icv-row"><span className="icv-lbl">ขนาด</span><input className="inp ocm-numi" inputMode="numeric" defaultValue="40" aria-label="ขนาดเล็กสุด" /><span className="small">–</span><input className="inp ocm-numi" inputMode="numeric" defaultValue="64" aria-label="ขนาดใหญ่สุด" /><span className="small">จุด</span></div>
          <div className="icv-row"><span className="icv-lbl">แบบตัว</span><label className="ocm-only"><Switch on onChange={() => {}} label="ตัวปกติ" /><span>ปกติ</span></label><label className="ocm-only"><Switch on onChange={() => {}} label="ตัวเอียง" /><span>เอียง</span></label><label className="ocm-only"><Switch on={false} onChange={() => {}} label="ตัวหนา" /><span>หนา</span></label></div>
          <div className="icv-head">ตัวอักษรที่จะฝึก</div>
          <textarea className="inp ocm-ta ocm-trchars" defaultValue={"ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789 .,!?'\"-:;()… āōïéü"} spellCheck={false} />
          <div className="icv-row"><span className="icv-lbl">ตัวที่มักติดกัน</span><input className="inp" style={{ flex: 1 }} defaultValue="rn ff fi fl ft tt" /></div>
          <div className="icv-row"><span className="icv-lbl">ฐาน</span><Seg small label="ฐาน" value="add" onChange={() => {}} options={[{ value: "add", label: "ต่อจากฐานเดิม" }, { value: "new", label: "เริ่มจากว่าง" }]} /></div>
          <div><button type="button" className="btn btn-ghost btn-sm">นำตัวอักษรจากซับนี้มาใส่</button></div>
        </div>
        <div className="ocm-trr">
          <div className="icv-head">ตัวอย่างที่จะฝึก<span className="small" style={{ fontWeight: 400 }}>{font} ขนาด 54</span></div>
          <div className="ocm-trgrid">{"AaBbKkōāïé.,?!".split("").map((c, i) => <GlyphImg key={i} c={c} italic={false} />)}</div>
        </div>
      </div>
    </Dialog>
  </>);
}
const DB_CHARS = ["a", "b", "e", "K", "ō", "r", "S", "t"];
const DB_COUNT: Record<string, number> = { e: 3, t: 3, r: 4, "ō": 1 };

/* ---------- ตัวเสียบเข้าหน้าซับไตเติลจริง ---------- */
function useMount(sel: string) {
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => { const x = document.querySelector(sel); if (x) setEl(x); else t = window.setTimeout(tick, 150); };
    tick();
    return () => clearTimeout(t);
  }, [sel]);
  return el;
}
/** กล่องที่สร้างไว้ในหน้าจริง · before = ใส่ก่อนชิ้นนั้น · after = ต่อท้ายชิ้นนั้น */
function useSlot(anchor: Element | null, where: "before" | "after" | "afterEl", cls: string) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!anchor) return;
    const s = document.createElement(where === "afterEl" ? "span" : "div");
    s.className = cls;
    if (where === "before") anchor.parentElement!.insertBefore(s, anchor);
    else if (where === "afterEl") anchor.after(s);
    else anchor.appendChild(s);
    setSlot(s);
    return () => s.remove();
  }, [anchor, where, cls]);
  return slot;
}

export default function OcrMock({ state }: { state: string }) {
  const bar = useMount("[data-sub-bar]");
  const viewer = useMount("[data-subviewer-inline]");
  const conv = useMount("[data-imgconv-open]");
  const barSlot = useSlot(bar, "before", "ocm-barslot");
  const pageSlot = useSlot(viewer, "before", "ocm-pageslot");
  const btnSlot = useSlot(conv, "afterEl", "ocm-btnslot");
  const ttl = useMount(".titlebar .ttl-text");
  const ttlSlot = useSlot(ttl, "afterEl", "ocm-ttlslot");
  const variant = state === "bar2" ? "tabs" : "seg";
  const initMode: Mode = ["now", "bar1", "bar2"].includes(state) ? "view" : "ocr";
  const [mode, setMode] = useState<Mode>(initMode);
  // หน้าที่เสียบแล้ว ซ่อนแถวบนเดิมกับตัวดูซับรูปตอนอยู่ในงาน OCR
  useEffect(() => {
    document.documentElement.toggleAttribute("data-ocrmock", state !== "now");
    document.documentElement.toggleAttribute("data-ocrmock-ocr", state !== "now" && mode === "ocr");
  }, [state, mode]);
  if (state === "now") return null;
  const phase: Phase = state === "setup" ? "setup" : state === "run" || state === "mrun" ? "run" : "done";
  const dlg = ["export", "teach", "unknown", "prep", "models", "db", "train"].includes(state) ? state : state === "mrun" ? "teach" : null;
  const manual = ["manual", "mrun", "db", "train"].includes(state);
  return (<>
    {ttlSlot && createPortal(<TitleItems seg={variant !== "tabs"} mode={mode} setMode={setMode} done={false} />, ttlSlot)}
    {barSlot && variant === "tabs" && createPortal(<BarTabs mode={mode} setMode={setMode} done={false} />, barSlot)}
    {btnSlot && createPortal(<><button type="button" className="btn btn-ghost btn-sm" title="เก็บซับที่ 1 เป็นไฟล์ .sup ไว้ที่โฟลเดอร์ แยกไฟล์ ข้างไฟล์หนัง"><IcExtract size={14} />Export</button><button type="button" className="btn btn-main btn-sm" onClick={() => setMode("ocr")} title="อ่านซับรูปเป็นตัวหนังสือ แล้วตรวจทานก่อนส่งออก"><IbWand size={14} />OCR เป็นตัวหนังสือ</button></>, btnSlot)}
    {pageSlot && mode === "ocr" && createPortal(state === "one" ? <ReviewOne /> : <OcrPage phase={phase} dlg={dlg} manual={manual} />, pageSlot)}
    {/* ปุ่ม IbResample ใช้แค่ให้ตัวตรวจชนิดไม่ฟ้องว่าไม่ได้ใช้ */}
    <span hidden><IbResample size={1} /></span>
  </>);
}
