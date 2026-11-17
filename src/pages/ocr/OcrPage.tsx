/* หน้า OCR ซับรูป (แผน OCR ขั้น 11 · BUGS ข้อ 143) ยกโครงจากมอคอัป src/mockups/ocr/OcrMock.tsx ที่พี่กันไล่แก้แล้ว ต่อกับตัวคุมงานจริง (lib/ocrJob.ts ocrjob.rs)
   ไอเดียจากหน้าต่าง OCR ของ Subtitle Edit แถวเลือกตัวอ่านบนสุด ตารางเลข เวลา ภาพ ข้อความ ช่องแก้ข้อความ รายการจุดที่ต้องตรวจ แถบความคืบหน้ากับปุ่มเริ่ม หยุดชั่วคราว
   ของที่ชั้นหนังเพิ่ม ระบบชี้จุดสงสัย (㉝) ตัวช่วยตรวจ ป้ายตำแหน่งบนจอ (⑭) ตรวจทานแบบทีละจุด (⑤ พี่กันเคาะให้มีทั้งสองแบบ สลับได้ จำแบบล่าสุด)
   อ่านอย่างเดียว ไฟล์หนังและไฟล์ซับไม่ถูกแตะ */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { CardIcon, Keep, Phr, Seg, Skel, Switch } from "../../components/ui";
import { IbBack, IbBold, IbCrop, IbItalic, IbNext, IbPencil, IbPlay, IbStop, IbSwap, IbTable, IbTick, IbWand, IcCopy, IcExpand, IcRefresh, IcSearch, IcSettings, IbSave, IcFile, IcPalette, IcPaste, IbTrash, IcExtract, IcClose } from "../../components/icons";
import type { Tip } from "../../lib/codecAdv";
import { infoApi, ocrApi, pickFile, pickSave, subApi, type OcrCfg, type OcrDbList, type OcrReason, type OcrTessLang, type SubImg } from "../../lib/api";
import type { AvTrack } from "../../lib/avJob";
import { clearWordErr, fillRows, importRowText, getOcrJob, lineAns, ocrElapsed, removeRows, openSource, pauseOcr, resumeOcr, rowReasons, setOcrCfg, setRowOk, setRowText, startOcr, stopOcr, useOcrJob, type OcrRow } from "../../lib/ocrJob";
import { OcrDialogs, tessName, type OcrDlg } from "./OcrDialogs";
import { InspectDialog } from "./OcrInspectDialog";
import { VobColorDialog, storedVobColors } from "./OcrVobColorDialog";
import { ExportDialog, expRows, loadExpFormats } from "./OcrExportDialog";
import Dialog from "../../components/Dialog";
import { autosaveStrict, getSubEdit, openDoc } from "../../lib/subEdit";
import { useHotkeys } from "../../lib/hotkeys";
import { useEscClose } from "../../lib/popup";
import { usePageActiveRef } from "../../lib/pageActive";
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
const BINERR_TIP: Tip = { w: "Binary OCR เทียบภาพตัวอักษรกับภาพในฐานทีละจุด\nค่านี้คือเปอร์เซ็นต์ของจุดที่ต่างได้มากสุดที่ยังนับเป็นตัวเดียวกัน", r: "ใช้ค่าตั้งต้นก่อน ถ้าหยุดสอนบ่อยจึงค่อยเพิ่มทีละน้อย ตั้งสูงไปตัวที่คล้ายกันจะอ่านสลับกัน" };
const FORCED_TIP: Tip = { w: "ซับบังคับ (forced) คือบรรทัดที่ขึ้นบนจอแม้ผู้ชมปิดซับ เช่นคำแปลป้ายหรือบทพูดภาษาต่างประเทศในเรื่อง ไฟล์ซับรูปติดธงนี้ไว้ทีละภาพ" };
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
  // รุ่นของชุดภาพ · คำขอที่ส่งก่อนวาดสีใหม่หรือก่อนเปลี่ยนซับ ตอบทีหลังแล้วทิ้ง ไม่ให้ภาพสีเดิมกลับมาทับ (ผู้ช่วยตรวจทาน U21)
  const gen = useRef(0);
  useEffect(() => { gen.current++; setImgs(new Map()); asked.current = new Set(); }, [path, ff]);
  const need = (n: number) => {
    const page = Math.floor((n - 1) / PER);
    if (asked.current.has(page)) return;
    asked.current.add(page);
    const my = gen.current;
    subApi.images(path, ff, page, PER).then((r) => { if (my === gen.current) setImgs((m) => { const x = new Map(m); r.items.forEach((it) => x.set(it.n, it)); return x; }); }, () => { if (my === gen.current) asked.current.delete(page); });
  };
  /** ภาพถูกวาดใหม่ (สีของ VobSub) ล้างที่จำไว้แล้วขอใหม่ */
  const reload = () => { gen.current++; setImgs(new Map()); asked.current = new Set(); };
  return { imgs, need, reload };
}

/** ภาพบรรทัดซับบนพื้นเทา · ปุ่มขยายมุมขวาล่างแบบ .bigbtn ของโปรแกรม (ซ่อนได้ในตารางที่ปุ่มอยู่อีกคอลัมน์) */
/** ภาพที่ตัดช่องว่างแนวตั้งกว้างออกแล้ว จำตามภาพต้นฉบับ */
const compactCache = new Map<string, string>();
/** ภาพซับที่มีป้ายบนจอกับบทพูดล่างจอในภาพเดียว ช่องว่างตรงกลางสูงเกือบทั้งจอ ย่อลงแถวแล้วตัวหนังสืออ่านไม่ออก
 *  ตัดช่องว่างที่กว้างเกิน 60 จุดให้เหลือ 16 จุด ช่องระหว่างบรรทัดปกติกับสระบนล่างไม่แตะ · ภาพขยายยังเป็นภาพจริง */
function useCompact(src: string | undefined): { url: string | undefined; cut: boolean } {
  const [out, setOut] = useState<string | undefined>(() => (src ? compactCache.get(src) : undefined));
  useEffect(() => {
    if (!src) return;
    const hit = compactCache.get(src);
    if (hit) { setOut(hit); return; }
    let live = true;
    const im = new Image();
    im.onload = () => {
      let url = src;
      try {
        const w = im.naturalWidth, h = im.naturalHeight;
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        const g = cv.getContext("2d");
        if (g && w > 0 && h > 0) {
          g.drawImage(im, 0, 0);
          const d = g.getImageData(0, 0, w, h).data;
          const runs: [number, number][] = [];
          for (let y = 0, start = -1; y <= h; y++) {
            let ink = false;
            if (y < h) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { ink = true; break; }
            if (ink && start < 0) start = y;
            if (!ink && start >= 0) { runs.push([start, y]); start = -1; }
          }
          // ต่อแถบที่ห่างกันไม่เกิน 60 จุด (สระบน วรรณยุกต์ บรรทัดถัดไปของบทพูดเดียวกัน) เป็นก้อนเดียว
          const groups: [number, number][] = [];
          for (const r of runs) { const last = groups[groups.length - 1]; if (last && r[0] - last[1] <= 60) last[1] = r[1]; else groups.push([r[0], r[1]]); }
          if (groups.length > 1) {
            const GAP = 16, PAD = 4;
            const oh = groups.reduce((s, [a, b]) => s + b - a, 0) + GAP * (groups.length - 1) + PAD * 2;
            const c2 = document.createElement("canvas"); c2.width = w; c2.height = oh;
            const g2 = c2.getContext("2d");
            if (g2) {
              let y = PAD;
              for (const [a, b] of groups) { g2.drawImage(cv, 0, a, w, b - a, 0, y, w, b - a); y += b - a + GAP; }
              url = c2.toDataURL("image/png");
            }
          }
        }
      } catch { url = src; }
      compactCache.set(src, url);
      if (live) setOut(url);
    };
    im.onerror = () => { compactCache.set(src, src); if (live) setOut(src); };
    im.src = src;
    return () => { live = false; };
  }, [src]);
  return { url: out ?? src, cut: !!src && !!out && out !== src };
}

export function LineImg({ img, n, zoom = true }: { img: SubImg | undefined; n: number; zoom?: boolean }) {
  const [big, setBig] = useState(false);
  const shown = useCompact(img?.png);
  if (!img) return <div className="ocr-line" style={{ height: 46 }} aria-busy="true" />;
  return (<>
    <div className={zoom ? "ocr-zwrap" : undefined}><div className="ocr-line"><img src={shown.url} alt={`ซับภาพ ${n}`} data-compact={shown.cut || undefined}
      title={shown.cut ? "ตัดช่องว่างระหว่างป้ายบนจอกับบทพูดออกให้อ่านง่าย กดขยายเพื่อดูภาพจริง" : undefined} /></div>
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
/** Esc ปิดภาพขยาย ผ่านชั้น Esc กลางของโปรแกรม (useEscClose) · เดิมดักที่หน้าต่างเอง ผิดกฎชั้น Esc (ผู้ช่วยตรวจทาน U13) */
function EscClose({ onClose }: { onClose: () => void }) {
  useEscClose(true, onClose);
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
  // ลำดับในบรรทัดที่มีข้อความ ตรงกับ lineAns ที่ไฟล์ส่งออกใช้ (ผู้ช่วยตรวจทาน T10)
  const an = lineAns(r);
  const idx = ls.map((_, k) => ls.slice(0, k).filter((l) => l.trim()).length);
  const top = (k: number) => !!ls[k].trim() && (an[idx[k]] ?? 2) >= 7;
  return <span className="ocr-txt">{ls.map((l, k) => (
    <span key={k} className="ocr-tl">{top(k) && <span className="ocr-pos">บนจอ</span>}{/^<i>.*<\/i>$/.test(l) ? <i>{l.replace(/<\/?i>/g, "")}</i> : l.replace(/<\/?[ib]>/g, "")}</span>))}</span>;
}
const hasTop = (r: OcrRow) => lineAns(r).some((a) => a >= 7);

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

/** ปุ่มตรวจบรรทัดกดไม่ได้กับตัวอ่านที่ไม่มีฐานตัวอักษร */
const INSPECT_OFF = "ตรวจบรรทัดได้เฉพาะตัวอ่านที่สอนเอง nOCR Binary OCR และตัวสอนเอง";
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
function OcrTable({ rows, sel, setSel, onlyFlag, onlyForced, imgs, need, current, multi, setMulti }: { rows: OcrRow[]; sel: number; setSel: (i: number) => void; onlyFlag: boolean; onlyForced: boolean; imgs: Map<number, SubImg>; need: (n: number) => void; current: number | null; multi: Set<number>; setMulti: (s: Set<number>) => void }) {
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
const baseName = (p: string) => p.split("/").pop()?.split(String.fromCharCode(92)).pop() ?? p;

function EditArea({ i, rows, movie, imgs, setSel, onTeach, onUnknown, onInspect, picked, onDelete, onFill, clipMsg }: { i: number; rows: OcrRow[]; movie: string; imgs: Map<number, SubImg>; setSel: (i: number) => void; onTeach: () => void; onUnknown: (w: string, i: number) => void; onInspect: () => void; picked: number; onDelete: () => void; onFill: () => void; clipMsg: string | null }) {
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
export default function OcrPage({ track, movie, onEdit }: { track: AvTrack; movie: string; onEdit?: () => void }) {
  const job = useOcrJob();
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
          {!allDone && <button type="button" className={"btn " + (done ? "btn-ghost" : "btn-main")} onClick={() => void startOcr()} data-ocr-start><Keep all={["อ่านต่อที่เหลือ", "เริ่มอ่าน"]} icon={<IbPlay size={15} />}>{done ? "อ่านต่อที่เหลือ" : "เริ่มอ่าน"}</Keep></button>}
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
