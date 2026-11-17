/* หน้า OCR ซับรูป (แผน OCR ขั้น 11 · BUGS ข้อ 143) ยกโครงจากมอคอัป src/mockups/ocr/OcrMock.tsx ที่พี่กันไล่แก้แล้ว ต่อกับตัวคุมงานจริง (lib/ocrJob.ts ocrjob.rs)
   ไอเดียจากหน้าต่าง OCR ของ Subtitle Edit แถวเลือกตัวอ่านบนสุด ตารางเลข เวลา ภาพ ข้อความ ช่องแก้ข้อความ รายการจุดที่ต้องตรวจ แถบความคืบหน้ากับปุ่มเริ่ม หยุดชั่วคราว
   ของที่ชั้นหนังเพิ่ม ระบบชี้จุดสงสัย (㉝) ตัวช่วยตรวจ ป้ายตำแหน่งบนจอ (⑭) ตรวจทานแบบทีละจุด (⑤ พี่กันเคาะให้มีทั้งสองแบบ สลับได้ จำแบบล่าสุด)
   อ่านอย่างเดียว ไฟล์หนังและไฟล์ซับไม่ถูกแตะ */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Seg, Skel, Switch } from "../../components/ui";
import { IbBack, IbBold, IbCrop, IbItalic, IbNext, IbPencil, IbPlay, IbStop, IbSwap, IbTable, IbTick, IbWand, IcCopy, IcExpand, IcRefresh, IcSearch, IcSettings, IbSave, IcFile } from "../../components/icons";
import type { Tip } from "../../lib/codecAdv";
import { ocrApi, pickFile, pickSave, subApi, type OcrCfg, type OcrDbList, type OcrReason, type OcrTessLang, type SubImg } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";
import { getOcrJob, ocrElapsed, openSource, pauseOcr, resumeOcr, rowReasons, setOcrCfg, setRowOk, setRowText, startOcr, stopOcr, useOcrJob, type OcrRow } from "../../lib/ocrJob";
import { OcrDialogs, tessName, type OcrDlg } from "./OcrDialogs";
import "../../styles/ocr.css";

/* ---------- คำอธิบาย ⓘ (ข้อความเดียวกับมอคอัปที่พี่กันดูแล้ว ตัวเลขจากผลเทสจริง) ---------- */
export const ENGINE_TIP: Tip = { w: "ตัวอ่านคือโปรแกรมที่ดูภาพซับแล้วเขียนออกมาเป็นตัวหนังสือ ทุกตัวทำงานในเครื่อง ไม่ส่งภาพออกเน็ต", o: [
  ["PaddleOCR", "อ่านจากภาพทั้งบรรทัดด้วยโมเดลที่ฝึกมาแล้ว อ่านอังกฤษ ญี่ปุ่น จีน และภาษาไทยได้", "แม่นที่สุดตอนเทสซับอังกฤษ 439 ภาพ ถูก 436–438 ภาพ", "ไม่บอกว่าบรรทัดไหนเป็นตัวเอียง"],
  ["Tesseract", "ตัวอ่านเก่าแก่ที่ Subtitle Edit ใช้เป็นหลัก มีชุดภาษาให้โหลดกว่าร้อยภาษา", "อ่านภาษาแปลก ๆ ได้", "ซับชุดเทสถูก 360 จาก 439 ภาพ อ่านตัว I เป็นขีดตั้งบ่อย"],
  ["nOCR และ Binary OCR", "ตัวสอนเองของ Subtitle Edit จำรูปร่างตัวอักษรของซับเรื่องนั้นแล้วอ่านเองครั้งต่อไป", "บอกได้ว่าบรรทัดไหนเป็นตัวเอียง", "ฐานใหม่ต้องสอนก่อนถึงจะใช้ได้"],
  ["ตัวสอนเองของชั้นหนัง", "ตัวสอนเองที่รู้จักสระและวรรณยุกต์ไทยที่ซ้อนบนล่าง", "ใช้กับ VobSub ไทยความละเอียดต่ำได้", "ต้องสอนหรือฝึกจากฟอนต์ก่อน"],
], r: "PaddleOCR ขนาด small" };
const SIZE_TIP: Tip = { w: "ขนาดของโมเดล PaddleOCR ยิ่งใหญ่ยิ่งแม่นแต่ช้ากว่า ตัวเลขวัดจากซับอังกฤษ 439 ภาพ", o: [
  ["tiny", "โมเดลเล็กสุด", "เร็วสุด", "อ่านพลาดมากกว่าขนาดอื่น"],
  ["small", "โมเดลกลาง", "ถูก 436 ถึง 438 ภาพ", ""],
  ["medium", "โมเดลใหญ่", "ถูก 437 ภาพ แม่นสุด", "ช้ากว่า small ราวสองเท่าครึ่ง"],
], r: "small" };
const CHECK_TIP: Tip = { w: "ตัวช่วยตรวจอ่านภาพเดียวกันอีกรอบ แต่ไม่ได้เขียนลงไฟล์ ภาพที่อ่านได้ไม่ตรงกับตัวหลักขึ้นให้ตรวจ\nตอนเทสซับอังกฤษ ทุกภาพที่ตัวหลักอ่านผิดถูกชี้ครบ", r: "Tesseract หรือ PaddleOCR ขนาดที่ต่างจากตัวหลัก" };
export const FLAG_TIP: Tip = { w: "จุดที่ต้องตรวจคือบรรทัดที่ระบบสงสัยว่าอ่านผิด เห็นแล้วแก้หรือกดว่าถูกแล้ว", o: [
  ["ตัวช่วยอ่านไม่ตรง", "ตัวหลักกับตัวช่วยตรวจอ่านภาพเดียวกันได้ไม่เหมือนกัน", "", ""],
  ["คำที่ไม่รู้จัก", "คำที่ไม่มีในพจนานุกรม เช่นเว้นวรรคหายจนคำติดกัน หรือชื่อเฉพาะ", "", ""],
  ["ชื่อเขียนสองแบบ", "ชื่อเดียวกันในไฟล์เดียวกันเขียนต่างกัน เช่น Mais กับ Maïs", "", ""],
  ["ตัวอ่านไม่มั่นใจ", "PaddleOCR ให้คะแนนความมั่นใจของบรรทัดนี้ต่ำกว่าเกณฑ์", "", ""],
  ["มีตัวที่อ่านไม่ออก", "ตัวสอนเองไม่รู้จักตัวนี้ ใส่ * ไว้แทน", "", ""],
] };
export const POS_TIP: Tip = { w: "ซับบางภาพไม่ได้อยู่ล่างจอ เช่นชื่อสถานที่บนจอหรือป้ายชื่อตัวละคร โปรแกรมดูจากพิกัดในไฟล์ซับรูปแล้วติดป้ายบนจอให้\nตอนส่งออกเป็นซับตัวหนังสือ บรรทัดบนจอจะเก็บตำแหน่งไว้ให้อยู่ที่เดิม" };
const SPACE_TIP: Tip = { w: "ช่องห่างระหว่างตัวอักษรกว้างเกินกี่จุดถึงนับเป็นเว้นวรรค ใส่ 0 ให้ตัวอ่านตัดสินเองจากความสูงของตัว" };
export const LINES_TIP: Tip = { w: "ตัวสอนเองจำตัวอักษรเป็นเส้นสั้น ๆ ที่ลากผ่านภาพ ตอนอ่านจะเทียบว่าเส้นตกที่เดิมไหม", o: [
  ["เส้นเขียว", "ต้องผ่านเนื้อตัวอักษร", "", ""],
  ["เส้นแดง", "ต้องผ่านที่ว่าง ไม่โดนตัวอักษร", "", ""],
  ["จุดผิดที่ยอม", "จำนวนจุดบนเส้นที่ไม่ตรงได้ ยิ่งมากยิ่งจับคู่ง่ายแต่ผิดง่าย", "", ""],
], r: "จุดผิดที่ยอม 25 ตามค่าตั้งต้นของ Subtitle Edit" };

export const REASON_NAME: Record<OcrReason["kind"], string> = { disagree: "ตัวช่วยอ่านไม่ตรง", unknown: "คำที่ไม่รู้จัก", nameVariant: "ชื่อเขียนสองแบบ", lowConf: "ตัวอ่านไม่มั่นใจ", unreadable: "มีตัวที่อ่านไม่ออก", empty: "ไม่มีข้อความ" };
const REASON_CLS: Record<OcrReason["kind"], string> = { disagree: "", unknown: " f-word", nameVariant: " f-name", lowConf: "", unreadable: " f-word", empty: "" };
const kinds = (rs: OcrReason[]) => [...new Set(rs.map((r) => r.kind))];
const TEACH_OFF = "สอนได้เฉพาะตัวสอนเอง เลือก nOCR Binary OCR หรือตัวสอนเองของชั้นหนังก่อน";
/** รายละเอียดของเหตุ คำไหนไม่รู้จัก ชื่อไหนเขียนสองแบบ ความมั่นใจเท่าไหร่ */
export function whyText(rs: OcrReason[]): string {
  const out: string[] = [];
  for (const r of rs) {
    if (r.kind === "unknown") out.push(`ไม่รู้จัก ${r.words.join(" ")}`);
    else if (r.kind === "nameVariant") out.push(`${r.word} คล้าย ${r.other} ที่เจอ ${r.count} ครั้ง`);
    else if (r.kind === "lowConf") out.push(`ความมั่นใจ ${Math.round(r.conf * 100)}%`);
  }
  return out.join(" และ ");
}
export const FlagChips = ({ rs }: { rs: OcrReason[] }) => <>{kinds(rs).map((k) => <span key={k} className={"ocr-flag" + REASON_CLS[k]}>{REASON_NAME[k]}</span>)}</>;

/* ---------- ภาษา ---------- */
const PADDLE_LANGS: { value: string; label: string; fix: [string, string] }[] = [
  { value: "", label: "อังกฤษ ญี่ปุ่น จีน", fix: ["eng", "en_US"] }, { value: "th", label: "ไทย", fix: ["tha", ""] }, { value: "ko", label: "เกาหลี", fix: ["kor", ""] },
  { value: "latin", label: "ภาษาอักษรละตินอื่น", fix: ["", ""] }, { value: "ru", label: "รัสเซีย", fix: ["rus", ""] }, { value: "uk", label: "ยูเครน", fix: ["ukr", ""] },
  { value: "ar", label: "อาหรับ", fix: ["ara", ""] }, { value: "hi", label: "ฮินดี", fix: ["hin", ""] }, { value: "el", label: "กรีก", fix: ["ell", ""] },
  { value: "ta", label: "ทมิฬ", fix: ["tam", ""] }, { value: "te", label: "เตลูกู", fix: ["tel", ""] },
];
/** ภาษาของตัวแก้คำกับพจนานุกรมตามตัวอ่านและภาษาที่เลือก · พจนานุกรมที่แนบมามีอังกฤษ ไทยยังไม่ตรวจคำ (㉘) */
export function fixLangOf(c: OcrCfg): [string, string] {
  if (c.engine === "paddle") return PADDLE_LANGS.find((l) => l.value === c.paddle.lang)?.fix ?? ["eng", "en_US"];
  if (c.engine === "tesseract") { const l = c.tess.lang.split("+")[0]; return [l, l === "eng" ? "en_US" : ""]; }
  if (c.engine === "own") return ["tha", ""];
  return ["eng", "en_US"];
}
function setCfg(patch: Partial<OcrCfg>) {
  const next = { ...getOcrJob().cfg, ...patch };
  const [lang3, dict] = fixLangOf(next);
  setOcrCfg({ ...patch, lang3, dict });
}

/* ---------- เวลา ---------- */
const ts = (t: number) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, "0")}`; };
const dur = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* ---------- ภาพซับ ---------- */
const PER = 40;
/** ภาพซับทีละหน้า ใช้ผลถอดชุดเดียวกับตัวดูซับรูป · need(n) ขอหน้าที่มีภาพ n (นับจาก 1) */
export function useSubImgs(path: string, ff: number) {
  const [imgs, setImgs] = useState<Map<number, SubImg>>(() => new Map());
  const asked = useRef(new Set<number>());
  useEffect(() => { setImgs(new Map()); asked.current = new Set(); }, [path, ff]);
  const need = (n: number) => {
    const page = Math.floor((n - 1) / PER);
    if (asked.current.has(page)) return;
    asked.current.add(page);
    subApi.images(path, ff, page, PER).then((r) => setImgs((m) => { const x = new Map(m); r.items.forEach((it) => x.set(it.n, it)); return x; }), () => asked.current.delete(page));
  };
  return { imgs, need };
}

/** ภาพบรรทัดซับบนพื้นเทา · ปุ่มขยายมุมขวาล่างแบบ .bigbtn ของโปรแกรม (ซ่อนได้ในตารางที่ปุ่มอยู่อีกคอลัมน์) */
export function LineImg({ img, n, zoom = true }: { img: SubImg | undefined; n: number; zoom?: boolean }) {
  const [big, setBig] = useState(false);
  if (!img) return <div className="ocr-line" style={{ height: 46 }} aria-busy="true" />;
  return (<>
    <div className={zoom ? "ocr-zwrap" : undefined}><div className="ocr-line"><img src={img.png} alt={`ซับภาพ ${n}`} /></div>
      {zoom && <button type="button" className="bigbtn" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={11} /></button>}</div>
    {big && <BigView img={img} n={n} line onClose={() => setBig(false)} />}
  </>);
}
/** ภาพซับวางบนจอตามพิกัดในไฟล์ · frame ภาพจากหนังข้างหลัง */
export function ScreenImg({ img, n, frame }: { img: SubImg | undefined; n: number; frame?: string | null }) {
  const [big, setBig] = useState(false);
  if (!img) return <Skel w="100%" h={120} />;
  const [cw, ch] = img.canvas[0] > 0 ? img.canvas : [Math.max(img.w, 1), Math.max(img.h, 1)];
  const scr = (cls: string) => (
    <div className={"ocr-screen " + cls + (frame ? " withframe" : "")} style={{ aspectRatio: `${cw} / ${ch}`, ...(frame ? { backgroundImage: `url(${frame})`, backgroundSize: "cover" } : {}) }}>
      <img src={img.png} alt={`ซับภาพ ${n}`} style={{ left: `${(img.at[0] / cw) * 100}%`, top: `${(img.at[1] / ch) * 100}%`, width: `${(img.w / cw) * 100}%` }} />
    </div>);
  return (<>
    <div className="ocr-zwrap lg">{scr("")}
      <button type="button" className="bigbtn" title="ขยายดูเต็มหน้าต่าง" aria-label={`ขยายดูภาพ ${n} เต็มหน้าต่าง`} onClick={(e) => { e.stopPropagation(); setBig(true); }}><IcExpand size={15} /></button></div>
    {big && createPortal(
      <div className="ocr-zview" onClick={() => setBig(false)} role="dialog" aria-label={`ภาพ ${n} ขยาย`}>{scr("ocr-zscreen")}<span className="ocr-zcap">{`ภาพ ${n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span></div>, document.body)}
    {big && <EscClose onClose={() => setBig(false)} />}
  </>);
}
function EscClose({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return null;
}
function BigView({ img, n, onClose }: { img: SubImg; n: number; line?: boolean; onClose: () => void }) {
  return createPortal(<>
    <div className="ocr-zview" onClick={onClose} role="dialog" aria-label={`ภาพ ${n} ขยาย`}>
      <div className="ocr-line ocr-zline"><img src={img.png} alt="" /></div>
      <span className="ocr-zcap">{`ภาพ ${n} กดที่ไหนก็ได้หรือกด Esc เพื่อปิด`}</span>
    </div><EscClose onClose={onClose} /></>, document.body);
}

/** ข้อความหลายบรรทัด บรรทัดที่อยู่บนจอติดป้าย ตัวเอียงแสดงเอียง */
export function Txt({ r }: { r: OcrRow }) {
  const ls = r.text.split("\n");
  const top = (k: number) => { const a = r.line?.anLines?.[k] ?? (k === 0 ? r.item.an : 2); return a >= 7; };
  return <span className="ocr-txt">{ls.map((l, k) => (
    <span key={k} className="ocr-tl">{top(k) && <span className="ocr-pos">บนจอ</span>}{/^<i>.*<\/i>$/.test(l) ? <i>{l.replace(/<\/?i>/g, "")}</i> : l.replace(/<\/?[ib]>/g, "")}</span>))}</span>;
}
const hasTop = (r: OcrRow) => (r.line?.anLines ?? [r.item.an]).some((a) => a >= 7);

/* ---------- สีพื้นหลังของภาพซับ (BUGS ข้อ 143.2 พี่กันสั่ง "ขอปุ่มเปลี่ยนสีพื้นหลังด้วยหน่อย") ----------
   ซับตัวขาวขอบดำเห็นชัดบนพื้นเทา ซับตัวเหลืองหรือตัวดำเห็นชัดบนพื้นอื่น · ใช้กับภาพบรรทัดในตาราง หน้าต่างสอน คำที่ไม่รู้จัก แต่งภาพ · จำไว้ในเครื่อง */
type ImgBg = "gray" | "dark" | "white" | "check";
const BG_KEY = "ms.ocrImgBg";
function loadBg(): ImgBg { try { const v = localStorage.getItem(BG_KEY); return v === "dark" || v === "white" || v === "check" ? v : "gray"; } catch { return "gray"; } }
function applyBg(v: ImgBg) { document.documentElement.dataset.ocrImgbg = v; }
applyBg(loadBg());
function BgPick() {
  const [v, setV] = useState<ImgBg>(loadBg);
  const pick = (x: ImgBg) => { setV(x); applyBg(x); try { localStorage.setItem(BG_KEY, x); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } };
  return <span className="ocr-bgpick" data-ocr-bg><Dropdown label="สีพื้นหลังของภาพซับ" value={v} onChange={pick} display={(o) => `พื้น${o?.label ?? ""}`}
    options={[{ value: "gray", label: "เทา" }, { value: "dark", label: "ดำ" }, { value: "white", label: "ขาว" }, { value: "check", label: "ลายตาราง" }]} /></span>;
}

/* ---------- แถวเลือกตัวอ่าน ---------- */
const MATCH = ["nocr", "binary", "own"];
function EngineRow({ busy, dbs, tess, onDb }: { busy: boolean; dbs: OcrDbList | null; tess: OcrTessLang[]; onDb: () => void }) {
  const { cfg } = useOcrJob();
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
          <span className="ocr-f">ผิดได้</span>
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
        <Dropdown label="ภาษา" value={cfg.paddle.lang} onChange={(v) => setCfg({ paddle: { ...cfg.paddle, lang: v } })} disabled={why} options={PADDLE_LANGS.map((l) => ({ value: l.value, label: l.label }))} />
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
function OcrTable({ rows, sel, setSel, onlyFlag, onlyForced, imgs, need, current }: { rows: OcrRow[]; sel: number; setSel: (i: number) => void; onlyFlag: boolean; onlyForced: boolean; imgs: Map<number, SubImg>; need: (n: number) => void; current: number | null }) {
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
            <tr key={i} data-n={r.item.n} data-i={i} className={(sel === i ? "on" : "") + (rs.length ? " flag" : "")} onClick={() => setSel(i)}>
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
const baseName = (p: string) => p.split("/").pop()?.split(String.fromCharCode(92)).pop() ?? p;

function EditArea({ i, rows, movie, imgs, setSel, onTeach, onUnknown }: { i: number; rows: OcrRow[]; movie: string; imgs: Map<number, SubImg>; setSel: (i: number) => void; onTeach: () => void; onUnknown: (w: string, i: number) => void }) {
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
  const { cfg } = useOcrJob();
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
          <button type="button" className="btn btn-ghost btn-sm ocr-ic" title="ตัวเอียง Ctrl+I" aria-label="ตัวเอียง" disabled={r.state !== "done"} onClick={() => set(wrapTag(ta.current, r.text, "i"))}><IbItalic size={14} /></button></div>
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
function ReviewOne({ rows, movie, imgs, need, sel, setSel, onTeach }: { rows: OcrRow[]; movie: string; imgs: Map<number, SubImg>; need: (n: number) => void; sel: number; setSel: (i: number) => void; onTeach: () => void }) {
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

/* ---------- หน้า OCR ---------- */
const VIEW_KEY = "ms.ocrView";
export default function OcrPage({ track, movie }: { track: AvTrack; movie: string }) {
  const job = useOcrJob();
  const path = track.inMovie ? movie : track.src;
  const ff = track.ff ?? track.tid;
  const { imgs, need } = useSubImgs(path, ff);
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
  useEffect(() => {
    const j = getOcrJob();
    if ((j.path !== path || j.ff !== ff) && !j.running) void openSource(path, ff);
  }, [path, ff]);
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
  const ms = ocrElapsed();
  const pct = job.runIds.length ? Math.round((job.runDone / job.runIds.length) * 100) : 0;
  const eta = job.runDone > 0 ? (ms / job.runDone) * (job.runIds.length - job.runDone) : null;
  const sum = useMemo(() => {
    if (!allDone) return null;
    return `อ่านครบ ${total.toLocaleString("en-US")} ภาพแล้ว ${flagged ? `มี ${flagged.toLocaleString("en-US")} ภาพที่ควรตรวจ` : "ไม่มีภาพที่ควรตรวจ"}${tops ? ` และ ${tops.toLocaleString("en-US")} ภาพที่ซับอยู่บนจอ` : ""}`;
  }, [allDone, total, flagged, tops]);
  const teachRow = () => startOcr([sel]);
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
        if (best >= 0) setRowText(k, t.cues[best].text);
      });
      setImpMsg(null);
    } catch (e) { setImpMsg(String(e)); }
  };

  if (job.openError && job.path === path) return <section className="card ocr-page" data-ocr-page><div className="stat bad"><CardIcon kind="bad" /><div><b>เปิดซับรูปไม่ได้</b><Phr>{job.openError}</Phr></div></div></section>;
  if (!rows.length) return (
    <section className="card ocr-page" data-ocr-page aria-busy="true">
      <Skel w="100%" h={38} /><Skel w="100%" h={240} style={{ marginTop: 8 }} />
      <div className="small"><Phr>{`กำลังอ่านภาพซับจากไฟล์ ${job.openPercent}%`}</Phr></div>
    </section>);
  return (
    <section className="card ocr-page" data-ocr-page>
      <EngineRow busy={job.running} dbs={dbs} tess={tess} onDb={() => setDlg("db")} />
      {done > 0 && <div className="ocr-sum" data-ocr-sum>
        <CardIcon kind={flagged ? "warn" : "ok"} /><Phr>{sum ?? `อ่านแล้ว ${done.toLocaleString("en-US")} จาก ${total.toLocaleString("en-US")} ภาพ มี ${flagged.toLocaleString("en-US")} ภาพที่ควรตรวจ`}</Phr>
        <InfoTip title="จุดที่ต้องตรวจ" tip={FLAG_TIP} />
        <span style={{ flex: 1 }} />
        {view === "table" && forcedCount > 0 && <label className="ocr-only" data-ocr-forced><Switch on={forcedOnly} onChange={setForcedOnly} label="แสดงเฉพาะซับบังคับ" /><span>{`เฉพาะซับบังคับ ${forcedCount}`}</span></label>}
        {view === "table" && <label className="ocr-only"><Switch on={only} onChange={setOnly} label="แสดงเฉพาะจุดที่ต้องตรวจ" /><span>เฉพาะจุดที่ต้องตรวจ</span></label>}
        <Seg small label="แบบตรวจทาน" value={view} onChange={setView} options={[{ value: "table", label: <><IbTable size={14} />ตาราง</> }, { value: "one", label: <><IbNext size={14} />ทีละจุด</> }]} />
      </div>}
      {view === "one" && done > 0
        ? <ReviewOne rows={rows} movie={movie} imgs={imgs} need={need} sel={sel} setSel={setSel} onTeach={teachRow} />
        : <>
          <OcrTable rows={rows} sel={sel} setSel={setSel} onlyFlag={only} onlyForced={forcedOnly} imgs={imgs} need={need} current={job.current} />
          <EditArea i={Math.min(sel, rows.length - 1)} rows={rows} movie={movie} imgs={imgs} setSel={setSel} onTeach={teachRow} onUnknown={(word, i) => setAsk({ word, i })} />
        </>}
      {impMsg && <div className="stat bad" data-ocr-import-err><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>นำข้อความจากไฟล์ซับไม่ได้</b><Phr>{impMsg}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setImpMsg(null)}>ปิด</button></div></div></div>}
      <div className="ocr-foot" data-ocr-foot>
        {!job.running && <>
          <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setDlg("prep")} title="แต่งภาพก่อนส่งให้ตัวอ่าน" aria-label="แต่งภาพ" data-ocr-prep-open><IbCrop size={14} /><span className="ocr-tl">แต่งภาพ</span></button>
          <button type="button" className="btn btn-ghost btn-sm ocr-tool" onClick={() => setDlg("models")} title="ดูโมเดล ชุดภาษา และฐานตัวอักษรที่มี โหลดชุดภาษาเพิ่ม" aria-label="ตัวอ่านและชุดภาษา" data-ocr-models-open><IcSettings size={14} /><span className="ocr-tl">ตัวอ่านและชุดภาษา</span></button>
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
            ? <button type="button" className="btn btn-ghost" onClick={resumeOcr} data-ocr-resume><IbPlay size={15} />อ่านต่อ</button>
            : <button type="button" className="btn btn-ghost" onClick={pauseOcr} data-ocr-pause><IbStop size={15} />หยุดชั่วคราว</button>}
          <button type="button" className="btn btn-ghost" onClick={stopOcr} data-ocr-stop>หยุด</button>
        </> : <>
          <button type="button" className="btn btn-ghost ocr-tool" onClick={() => void importText()} title="นำข้อความจากไฟล์ซับตัวหนังสือที่เวลาตรงกัน แทนการอ่านภาพ" aria-label="นำข้อความจากไฟล์ซับ" data-ocr-import><IcFile size={15} /><span className="ocr-tl">นำข้อความจากไฟล์ซับ</span></button>
          {done > 0 && <button type="button" className="btn btn-ghost ocr-tool" onClick={() => setDlg("find")} title="ค้นและแทนที่ข้อความในทุกบรรทัด" aria-label="ค้นและแทนที่" data-ocr-find-open><IcSearch size={15} /><span className="ocr-tl">ค้นและแทนที่</span></button>}
          {done > 0 && <button type="button" className="btn btn-ghost" onClick={() => void startOcr([sel])} title={`อ่านภาพที่ ${rows[sel]?.item.n ?? ""} ใหม่ด้วยค่าที่ตั้งตอนนี้`} data-ocr-reread><IcRefresh size={15} />อ่านใหม่เฉพาะที่เลือก</button>}
          {!allDone && <button type="button" className="btn btn-main" onClick={() => void startOcr()} data-ocr-start><IbPlay size={15} />{done ? "อ่านต่อที่เหลือ" : "เริ่มอ่าน"}</button>}
        </>}
      </div>
      <OcrDialogs dlg={dlg} setDlg={setDlg} ask={ask} setAsk={setAsk} rows={rows} imgs={imgs} need={need} sel={sel} />
    </section>
  );
}
