/* หน้าตั้งค่า แถวตั้งค่าที่เป็นชิ้นของตัวเอง · บรรทัดรุ่นล่าสุด ความละเอียดกราฟความถี่ แถบภาพรวมตอนเปิด ชื่อยาวเกินช่อง ตัวเล่นหนัง รูปกราฟที่บันทึก รูปแบบชื่อไฟล์
   แยกจาก SettingsPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 5.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useRef, useState } from "react";
import { GRAPH_IMG_DEFAULT, pickFolder, type LatestInfo, type GraphImg } from "../../lib/api";
import Dropdown from "../../components/Dropdown";
import InfoTip from "../../components/InfoTip";
import { OV_START_TIP, SPEK_RES_TIP } from "../../lib/graphTips";
import { ovStart, setOvStart, type OvStart } from "../../lib/ovFold";
import { setLongName, useLongName, type LongName } from "../../lib/longName";
import { IcFolder } from "../../components/icons";
import { J, Keep, Phr, Range, Seg, Switch } from "../../components/ui";
import { DEFAULT_PATTERN, PATTERN_TOKENS, patternName } from "../../lib/extractName";
import type { Tip } from "../../lib/codecAdv";
import { IcRefresh } from "../../components/icons";
import { IbTick } from "../../components/icons";

/** บรรทัดรุ่นล่าสุดใต้ตัวแปลงแต่ละตัว */
export function LatestLine({ l, onOpen }: { l: LatestInfo; onOpen: (name: string) => void }) {
  const page = <button type="button" className="latlink" onClick={() => onOpen(l.name)} data-latest-page>เปิดหน้าโหลด</button>;
  if (l.state === "ok") return <span className="small" data-latest="ok"><b className="latok">ล่าสุดแล้ว</b> เว็บ {l.from} ก็เป็นรุ่น {l.latest}</span>;
  if (l.state === "new") return <span className="small" data-latest="new"><b className="latnew">มีรุ่นใหม่ {l.latest}</b> ที่ใช้อยู่คือ {l.installed} {page}</span>;
  if (l.state === "ahead") return <span className="small" data-latest="ahead"><b className="latok">ใหม่กว่าหน้าเว็บ</b> เว็บ {l.from} ยังเป็น {l.latest}</span>;
  if (l.state === "missing") return <span className="small" data-latest="missing">รุ่นล่าสุดบนเว็บคือ {l.latest} {page}</span>;
  return <span className="small" data-latest="error"><b className="latbad">เช็กไม่ได้</b> {l.error}</span>;
}

/** ความละเอียดตั้งต้นของกราฟความถี่ เก็บในเครื่อง (graph-spek-res ตัวเดียวกับ SPEK_RES_KEY ใน GraphPage.tsx) · กดสลับในหน้ากราฟใช้เฉพาะตอนนั้น
    (BUGS ข้อ 14 พี่กัน "อันนี้ตั้งค่าได้ ว่าจะให้เเสดงกราฟไหนตั้งต้น" · ค่าตั้งต้นละเอียด แคลร์ตั้ง) */
export function SpekResRow() {
  const [v, setV] = useState<"fine" | "coarse">(() => { try { return localStorage.getItem("graph-spek-res") === "coarse" ? "coarse" : "fine"; } catch { return "fine"; } });
  const pick = (n: "fine" | "coarse") => { setV(n); try { localStorage.setItem("graph-spek-res", n); } catch { /* เก็บไม่ได้ ใช้ค่าในหน้าไปก่อน */ } };
  return (
    <div className="setrow" data-spekres-default><div className="lbl"><span>ความละเอียดตั้งต้นของกราฟความถี่ <InfoTip title="ละเอียด กับ ภาพรวม" tip={SPEK_RES_TIP} /></span><span className="small">ใช้เมื่อเปิดหน้ากราฟเสียง และเปลี่ยนได้ที่แถบใต้กราฟความถี่</span></div>
      <Seg label="ความละเอียดตั้งต้นของกราฟความถี่" value={v} onChange={pick} options={[{ value: "fine", label: "ละเอียด" }, { value: "coarse", label: "ภาพรวม" }]} /></div>
  );
}

/** แถบภาพรวมทั้งไฟล์ของหน้ากราฟเปิดมาพับหรือกาง เก็บในเครื่อง (BUGS ข้อ 50 · ค่าตั้งต้นกางไว้ แคลร์ตั้ง) */
export function OvStartRow() {
  const [v, setV] = useState<OvStart>(ovStart);
  const pick = (n: OvStart) => { setV(n); setOvStart(n); };
  return (
    <div className="setrow" data-ovstart><div className="lbl"><span>การแสดงแถบภาพรวมทั้งไฟล์ <InfoTip title="แถบภาพรวมทั้งไฟล์" tip={OV_START_TIP} /></span><span className="small">ใช้เมื่อเปิดโปรแกรม และพับหรือกางได้ที่ปุ่มข้างแถบในหน้ากราฟเสียง</span></div>
      <Seg label="การแสดงแถบภาพรวมทั้งไฟล์" value={v} onChange={pick} options={[{ value: "open", label: "กางไว้" }, { value: "fold", label: "พับไว้" }]} /></div>
  );
}

/** ชื่อที่ยาวเกินช่อง แทนจุดสามจุด (BUGS ข้อ 51 · พี่กันเลือก 15 พ.ย. 2569 "เอาทุกตัว กดเปลี่ยนได้ที่หน้าตังค่า เเต่เเบบ 4 คือตัวหลัก") */
const LONG_NAME_TIP: Tip = {
  // ขึ้นบรรทัดใหม่ (\n) ตรงรอยต่อความหมายที่บรรทัดตัดอยู่แล้วในกล่อง (วัดด้วยตัวอ่านจุดตัดบรรทัด 15 พ.ย. 2569)
  w: "ชื่อเรื่องหรือชื่อไฟล์ที่ยาวเกินช่อง ใช้กับทุกจุดในโปรแกรม\nเช่นชื่อใต้ปก ชื่อไฟล์ในหน้าเสียงและซับ และคิวแปลงเสียง",
  o: [
    ["เลื่อนให้อ่านจบตอนชี้", "ท้ายชื่อที่ล้นจางหาย\nและเอาเมาส์ชี้แล้วชื่อค่อย ๆ เลื่อนจนเห็นท้ายชื่อ", "อ่านชื่อเต็มได้โดยไม่ต้องเปิดอะไร", "ต้องชี้ทีละชื่อ"],
    ["จางท้าย", "ท้ายชื่อที่ล้นจางหายแทนจุดสามจุด", "หน้าตาเรียบเหมือนเดิม", "ท้ายชื่อมองไม่เห็น"],
    ["เก็บปีไว้ท้าย", "ชื่อใต้ปกจางตรงที่ล้น และปีในวงเล็บอยู่ท้ายเสมอ\nส่วนจุดอื่นจางท้าย", "รู้ว่าเป็นเรื่องปีไหนแม้ชื่อยาว", "ใช้ได้กับชื่อที่มีปีท้ายเท่านั้น"],
    ["ขึ้นสองบรรทัด", "ชื่อใต้ปกขึ้นบรรทัดที่สองได้\nโดยทุกเรื่องจองที่สองบรรทัดเท่ากัน ส่วนจุดอื่นจางท้าย", "เห็นชื่อเต็มเกือบทุกเรื่อง", "ใต้ปกสูงขึ้นหนึ่งบรรทัด"],
  ] as [string, string, string, string][],
  r: "เลื่อนให้อ่านจบตอนชี้",
};
export function LongNameRow() {
  const v = useLongName();
  return (
    <div className="setrow" data-longname-set><div className="lbl"><span>ชื่อที่ยาวเกินช่อง <InfoTip title="ชื่อที่ยาวเกินช่อง" tip={LONG_NAME_TIP} /></span><span className="small">ใช้กับชื่อเรื่องและชื่อไฟล์ทุกจุดในโปรแกรม</span></div>
      <span data-seg260><Dropdown label="ชื่อที่ยาวเกินช่อง" value={v} onChange={(n) => setLongName(n as LongName)}
        options={[{ value: "slide", label: "เลื่อนให้อ่านจบตอนชี้" }, { value: "fade", label: "จางท้าย" }, { value: "year", label: "เก็บปีไว้ท้าย" }, { value: "two", label: "ขึ้นสองบรรทัด" }]} /></span></div>
  );
}

/** คำอธิบายตัวเล่นหนังสองแบบของหน้าแก้ซับ */
export const SUB_PLAYER_TIP = {
  // ขึ้นบรรทัดใหม่ (\n) ตรงจุดที่บรรทัดตัดอยู่แล้วที่กล่องกว้าง 380 จุด ให้ตัดตรงรอยต่อของความหมาย ไม่ตัดกลางวลี (วัดด้วยตัวอ่านจุดตัดบรรทัด 14 พ.ย. 2569)
  w: "ตัวที่เล่นหนังเมื่อกดปุ่มเล่นใต้ภาพหนังของหน้าแก้ซับ\nหรือกด Ctrl+P โดยทั้งสองแบบอ่านไฟล์หนังอย่างเดียว\nไม่เขียน ไม่แปลง และไม่แก้ไฟล์หนัง",
  o: [
    ["mpv", "ใช้ mpv ตัวเดียวกับที่ Subtitle Edit ฝังไว้ ถอดภาพด้วยการ์ดจอ เล่นเต็มความละเอียด และวาดซับที่กำลังแก้ครบทุกแท็กของ ASS", "ภาพลื่นและคม ซับขึ้นครบทั้งสี ตำแหน่ง และฟอนต์", "ภาพอยู่ในหน้าต่างแยกของ mpv ถ้ามีเมนูเปิดทับกรอบภาพ ภาพจะซ่อนไว้ก่อน"],
    ["แบบ Aegisub", "ทำแบบ Aegisub คือเสียงจากไฟล์หนังเป็นนาฬิกาหลัก\nแล้วอ่านภาพจากไฟล์ทีละเฟรมให้เดินตามเวลาของเสียง", "ภาพวาดในหน้าจอของโปรแกรมเอง ไม่มีหน้าต่างแยก", "ภาพสูงไม่เกิน 720 จุด และเครื่องช้าอาจข้ามเฟรม\nซับเป็นข้อความธรรมดา ไม่มีสีหรือตำแหน่งตามแท็ก"],
  ] as [string, string, string, string][],
  r: "ใช้ mpv เป็นหลัก และถ้าเปิด mpv ไม่ได้\nโปรแกรมจะเล่นแบบ Aegisub แทน",
};
/** ตั้งค่ารูปกราฟที่บันทึก (พี่กันสั่ง 9 พ.ย. 2569 "bit dpi เลือกได้ เราขอละเอียดแบบเนิร์ดไปเลย") · ค่าตั้งต้นแคลร์ตั้ง กว้าง 2560 PNG 8 bit 300 dpi */
const IMG_WIDTHS = [0, 1920, 2560, 3840, 7680], IMG_DPIS = [72, 96, 150, 300, 600];
const WIDTH_STOPS = [320, 640, 1280, 1920, 2560, 3200, 3840, 5120, 6400, 7680, 8192], DPI_STOPS = [72, 96, 150, 200, 300, 400, 600, 800, 1200], QUALITY_STOPS = [1, 25, 50, 60, 70, 75, 80, 85, 90, 92, 95, 98, 100];
/** ช่องที่ใช้กับชนิดไฟล์นี้ไม่ได้ จางไว้ ชี้แล้วขึ้นเหตุผลและเคอร์เซอร์บอกว่ากดไม่ได้ · กันกดในโค้ด ไม่ใช้ pointer-events: none ที่ทำให้ชี้แล้วเงียบ (AUDIT ข้อ 155) */
const blockOff = (reason?: string) => reason ? {
  title: reason,
  onPointerDownCapture: (e: React.PointerEvent) => { e.preventDefault(); e.stopPropagation(); },
  onClickCapture: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); },
  onKeyDownCapture: (e: React.KeyboardEvent) => { if (e.key !== "Tab") { e.preventDefault(); e.stopPropagation(); } },
} : {};
function NumField({ value, min, max, label, unit, onCommit, data, reason }: { value: number; min: number; max: number; label: string; unit: string; onCommit: (v: number) => void; data: string; reason?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const off = !!reason;
  const done = () => { if (txt == null) return; const v = parseInt(txt, 10); if (!Number.isNaN(v)) onCommit(Math.max(min, Math.min(max, v))); setTxt(null); };
  return <label className={"imgnum" + (off ? " off" : "")} {...blockOff(reason)}><input value={txt ?? String(value)} inputMode="numeric" readOnly={off} tabIndex={off ? -1 : undefined} aria-label={label} aria-disabled={off || undefined} onChange={(e) => setTxt(e.target.value.replace(/[^0-9]/g, ""))} onBlur={done} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} {...{ [data]: "" }} /><span>{unit}</span></label>;
}
/** แถบเลื่อนเป็นขั้น ขีดกับป้ายตามระดับแบบแผงตั้งค่าเสียง · ลากแล้วเลขในช่องขยับตาม บันทึกเมื่อหยุดลาก ไม่เขียนไฟล์ตั้งค่าทุกเฟรม
    (พี่กันสั่ง 9 พ.ย. 2569 "ขอเส้นยาว ๆ ที และแบ่งตามช่อง แบ่งตามระดับได้" · "ตอนเลื่อนบาร์ เลขมันจะขยับด้วย") */
function ImgSlide({ value, stops, major, fineMarks, label, onDrag, onCommit, reason, data }: { value: number; stops: number[]; major?: number[]; fineMarks: number[]; label: string; onDrag: (v: number) => void; onCommit: (v: number) => void; reason?: string; data: string }) {
  const off = !!reason;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // ติ๊กแล้วเลื่อนละเอียดทีละ 1 ไม่ติดขั้น (พี่กันสั่ง 9 พ.ย. 2569 "เราขอทุกบาร์ มีติ๊กแล้วมันจะเปลี่ยนเป็นเลื่อนละเอียด") · จำแยกแต่ละแถบในเครื่องนี้
  const key = "ms.imgFine." + data;
  const [fine, setFine] = useState(() => { try { return localStorage.getItem(key) === "1"; } catch { return false; } });
  const toggle = () => { const v = !fine; setFine(v); try { localStorage.setItem(key, v ? "1" : "0"); } catch { /* จำไม่ได้ก็ใช้ค่านี้ไปก่อน */ } };
  const push = (v: number) => { onDrag(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => onCommit(v), 250); };
  const n = stops.length, lo = stops[0], hi = stops[n - 1], marks = major ?? stops;
  const stepPct = (i: number) => (i / (n - 1)) * 100 + "%", finePct = (x: number) => ((x - lo) / (hi - lo)) * 100 + "%";
  const at = stops.reduce((best, x, i) => (Math.abs(x - value) < Math.abs(stops[best] - value) ? i : best), 0);
  return <div className={"imgslidebox" + (off ? " off" : "")} aria-hidden={off || undefined} {...blockOff(reason)}>
    <button type="button" role="checkbox" aria-checked={fine} className={"imgfine" + (fine ? " on" : "")} tabIndex={off ? -1 : undefined} title="ติ๊กแล้วเลื่อนละเอียดทีละ 1 ไม่ติดขั้น" onClick={toggle} {...{ [data + "-fine"]: "" }}>
      <i aria-hidden="true">{fine && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>}</i>ละเอียด</button>
    <div className="stepw imgslide" {...{ [data]: "" }}>
      {fine
        ? <Range label={label + " แบบละเอียด"} min={lo} max={hi} value={Math.max(lo, Math.min(hi, value))} format={(v) => String(v)} onChange={push} />
        : <Range label={label} min={0} max={n - 1} value={at} format={(i) => String(stops[i])} onChange={(i) => push(stops[i])} />}
      <div className="ticks" aria-hidden="true">{fine ? fineMarks.map((x) => <i key={x} className="mj" style={{ left: finePct(x) }} />) : stops.map((x, i) => <i key={x} style={{ left: stepPct(i) }} className={marks.includes(x) ? "mj" : undefined} />)}</div>
      <div className="tlabels" aria-hidden="true">{fine ? fineMarks.map((x) => <span key={x} style={{ left: finePct(x) }}>{x}</span>) : marks.map((x) => <span key={x} style={{ left: stepPct(stops.indexOf(x)) }}>{x}</span>)}</div>
    </div>
  </div>;
}
export function GraphImgRows({ value: saved, onChange }: { value: GraphImg; onChange: (v: GraphImg) => Promise<boolean> }) {
  // ค่าระหว่างลากแถบ ยังไม่บันทึก ช่องตัวเลข ปุ่ม และขนาดพิมพ์อ่านจากค่านี้ เลขจึงขยับตาม
  const [draft, setDraftNow] = useState<Partial<GraphImg>>({});
  // ค่าที่ส่งไปแล้วแต่หน้าจอยังไม่ได้ค่าใหม่กลับมา · ทุกการส่งรวมค่าที่ค้างอยู่ด้วย ค่าที่กดก่อนจึงไม่โดนค่าที่ส่งทีหลังทับคืน
  // (AUDIT ข้อ 136 · เดิมลากแถบคุณภาพแล้วรีบกด JPG ตัวตั้งเวลาของแถบส่งทั้งก้อนจากค่าเก่า ชนิดไฟล์เด้งกลับเป็น PNG)
  const pending = useRef<Partial<GraphImg>>({});
  const draftRef = useRef<Partial<GraphImg>>({});
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const setDraft = (p: Partial<GraphImg>) => { draftRef.current = { ...draftRef.current, ...p }; setDraftNow(draftRef.current); };
  useEffect(() => {
    // ค่าที่บันทึกแล้วตรงกับที่ค้าง เอาออกจากที่ค้าง · ค่าแถบที่ยังลากค้างอยู่เก็บไว้
    for (const k of Object.keys(pending.current) as (keyof GraphImg)[]) if (saved[k] === pending.current[k]) delete pending.current[k];
  }, [saved]);
  const o: GraphImg = { ...saved, ...pending.current, ...draft };
  const up = (p: Partial<GraphImg>) => {
    // ค่าแถบที่ลากค้างไปด้วยในครั้งเดียว ตัวตั้งเวลาของแถบที่ตามมาทีหลังเห็นว่าส่งไปแล้วจะไม่ส่งซ้ำ
    pending.current = { ...pending.current, ...draftRef.current, ...p };
    draftRef.current = {};
    setDraftNow({});
    void onChange({ ...savedRef.current, ...pending.current }).then((ok) => { if (!ok) pending.current = {}; });
  };
  /** ตัวตั้งเวลาของแถบ ส่งเฉพาะเมื่อค่านั้นยังค้างอยู่ ถ้าการกดค่าอื่นส่งไปพร้อมกันแล้วไม่ส่งซ้ำ */
  const commitSlide = (k: "width" | "dpi" | "quality", v: number) => { if (draftRef.current[k] === v) up({ [k]: v }); };
  /** ปุ่มกลับค่าตั้งต้น (BUGS ข้อ 7) · ตรงกับค่าตั้งต้นทุกช่อง = กดไม่ได้ จางไว้ */
  const isDefault = (Object.keys(GRAPH_IMG_DEFAULT) as (keyof GraphImg)[]).every((k) => o[k] === GRAPH_IMG_DEFAULT[k]);
  const [resetDone, setResetDone] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const reset = async () => {
    if (isDefault) return;
    draftRef.current = {};
    setDraftNow({});
    pending.current = { ...GRAPH_IMG_DEFAULT };
    const ok = await onChange({ ...GRAPH_IMG_DEFAULT });
    if (!ok) { pending.current = {}; return; }
    setResetDone(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setResetDone(false), 1800);
  };
  const pickDir = async () => { const d = await pickFolder("เลือกโฟลเดอร์เก็บรูปกราฟ"); if (d) up({ dirMode: "folder", dir: d }); };
  // ทุกแถวอยู่ตลอด เปลี่ยนชนิดไฟล์แล้วเพจไม่เลื่อน อันที่ใช้ไม่ได้จางไว้ เหตุผลขึ้นตอนชี้ (พี่กันสั่ง 9 พ.ย. 2569 "ตอนเราเลือกแต่ละนามสกุล ตัวเพจมันเลื่อน เราอยากให้มัน fix และอันไหนปรับไม่ได้จะจางไว้")
  // แรมตอนบันทึก 16 bit ฝั่ง Rust ถือภาพราวสามชุด ชุดละ 6 ไบต์ต่อจุด ความสูงราวครึ่งหนึ่งของความกว้าง (graphimg.rs · AUDIT ข้อ 113) เตือนเมื่อเกินราว 300 MB
  const ram16Raw = o.width && o.bits === 16 && (o.format === "png" || o.format === "tiff") ? Math.round(o.width * o.width * 0.54 * 18 / 1e6 / 50) * 50 : 0;
  const ram16 = ram16Raw >= 300 ? ram16Raw.toLocaleString("en-US") : "";
  const f = o.format, deepOk = f === "png" || f === "tiff", dpiOk = f === "png" || f === "jpg" || f === "tiff", qualOk = f === "jpg" || f === "heic", subOk = f === "jpg", packOk = f === "png";
  const name = f === "webp" ? "WebP" : f === "heic" ? "HEIC" : f.toUpperCase();
  const cm = o.width && dpiOk ? ` เมื่อ${J}พิมพ์จะ${J}กว้าง ${(o.width / o.dpi * 2.54).toFixed(1)} เซนติเมตร` : "";
  return <>
    <h4 className="imghead">รูปกราฟที่บันทึก</h4>
    <div className="setrow" data-img-row="width"><div className="lbl">ความกว้างรูป<span className="small"><Phr>{"ความสูงตามสัดส่วนกราฟ ตอนบันทึกโปรแกรมจะอ่านเสียงใหม่ที่ความละเอียดนี้โดยไม่ต้องซูมก่อน แต่รูปใหญ่ใช้เวลานานขึ้น" + cm}</Phr></span></div>
      <span className="imgstack"><span className="imgctl"><Seg small label="ความกว้างรูป" value={String(IMG_WIDTHS.includes(o.width) ? o.width : "own")} onChange={(v) => { if (v !== "own") up({ width: Number(v) }); }}
        options={[{ value: "0", label: "ตามจอ" }, { value: "1920", label: "1920" }, { value: "2560", label: "2560" }, { value: "3840", label: "3840" }, { value: "7680", label: "7680" }]} />
        <NumField value={o.width} min={0} max={8192} label="พิมพ์ความกว้างเอง" unit="px" onCommit={(width) => up({ width: width && width < 320 ? 320 : width })} data="data-img-width" /></span>
        <ImgSlide value={o.width || 320} stops={WIDTH_STOPS} major={[320, 1280, 2560, 3840, 6400, 8192]} fineMarks={[320, 1920, 3840, 5760, 8192]} label="ความกว้างรูป" onDrag={(width) => setDraft({ width })} onCommit={(width) => commitSlide("width", width)} data="data-img-slide-width" /></span></div>
    <div className="setrow" data-img-row="format"><div className="lbl">ชนิดไฟล์<span className="small"><Phr>PNG TIFF และ WebP ไม่เสียคุณภาพ ส่วน JPG กับ HEIC ไฟล์เล็กกว่า แต่ขอบตัวหนังสือกับเส้นอาจฟุ้ง</Phr></span></div>
      <Seg small label="ชนิดไฟล์" value={o.format} onChange={(format) => up({ format })} options={[{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }, { value: "webp", label: "WebP" }, { value: "heic", label: "HEIC" }, { value: "tiff", label: "TIFF" }]} /></div>
    <div className="setrow" data-img-row="bits"><div className="lbl">ความลึกสี<span className="small" data-img-bits-note={ram16 ? "ram" : undefined} style={ram16 ? { color: "var(--warn-ink)" } : undefined}><Phr>{ram16
        ? `ความกว้าง ${o.width.toLocaleString("en-US")} จุดแบบ 16 bit ใช้แรมตอนบันทึกราว ${ram16} MB เครื่องแรมน้อยอาจหน่วง ส่วน 8 bit ได้รายละเอียดเท่ากัน`
        : "ใช้ได้กับ PNG และ TIFF กราฟวาดจาก 8 bit ต่อช่องสี ถ้าเลือก 16 bit ไฟล์จะใหญ่ขึ้นแต่รายละเอียดสีไม่ได้เพิ่ม"}</Phr></span></div>
      <Seg small label="ความลึกสี" value={String(deepOk ? o.bits : 8)} onChange={(v) => up({ bits: Number(v) as 8 | 16 })} disabledReason={deepOk ? undefined : `${name} เก็บได้ 8 bit`} options={[{ value: "8", label: "8 bit" }, { value: "16", label: "16 bit" }]} /></div>
    <div className="setrow" data-img-row="gray"><div className="lbl">ชุดสี<span className="small"><Phr>ขาวดำเก็บช่องสีเดียว เส้นของแต่ละไฟล์จะแยกกันด้วยสีไม่ได้</Phr></span></div>
      <Seg small label="ชุดสี" value={o.gray ? "gray" : "rgb"} onChange={(v) => up({ gray: v === "gray" })} options={[{ value: "rgb", label: "RGB" }, { value: "gray", label: "ขาวดำ" }]} /></div>
    {/* พื้นหลังโปร่งใส (พี่กันสั่ง 10 พ.ย. 2569 "เราชอบตอนบันทึกแล้วพื้นหลังโปร่งใสจัง เอาไปที่ตั้งค่าหน่อย") */}
    <div className="setrow" data-img-row="bg"><div className="lbl">พื้นหลัง<span className="small"><Phr>พื้นโปร่งใสใช้ได้กับ PNG WebP และ TIFF วางบนสไลด์หรือเอกสารสีอื่นแล้วไม่มีกรอบขาว แต่กราฟสเปกตรัมที่พื้นดำยังทึบ</Phr></span></div>
      <Seg small label="พื้นหลัง" value={o.transparent && o.format !== "jpg" && o.format !== "heic" ? "clear" : "solid"} onChange={(v) => up({ transparent: v === "clear" })} disabledReason={o.format === "jpg" || o.format === "heic" ? `${name} เก็บพื้นโปร่งใสไม่ได้ ให้ใช้ PNG WebP หรือ TIFF` : undefined} options={[{ value: "solid", label: "ทึบ" }, { value: "clear", label: "โปร่งใส" }]} /></div>
    <div className="setrow" data-img-row="dpi"><div className="lbl">DPI<span className="small"><Phr>ใช้ได้กับ PNG JPG และ TIFF โดยไม่เปลี่ยนจำนวนพิกเซล เป็นค่าบอกขนาดตอนพิมพ์ที่เก็บในไฟล์จริง</Phr></span></div>
      <span className="imgstack"><span className="imgctl"><Seg small label="DPI" value={String(IMG_DPIS.includes(o.dpi) ? o.dpi : "own")} disabledReason={dpiOk ? undefined : `ไฟล์ ${name} ไม่มีที่เก็บค่า DPI`} onChange={(v) => { if (v !== "own") up({ dpi: Number(v) }); }}
        options={IMG_DPIS.map((d) => ({ value: String(d), label: String(d) }))} />
        <NumField reason={dpiOk ? undefined : `ไฟล์ ${name} ไม่มีที่เก็บค่า DPI`} value={o.dpi} min={1} max={9600} label="พิมพ์ DPI เอง" unit="dpi" onCommit={(dpi) => up({ dpi })} data="data-img-dpi" /></span>
        <ImgSlide reason={dpiOk ? undefined : `ไฟล์ ${name} ไม่มีที่เก็บค่า DPI`} value={o.dpi} stops={DPI_STOPS} fineMarks={[72, 300, 600, 900, 1200]} label="DPI" onDrag={(dpi) => setDraft({ dpi })} onCommit={(dpi) => commitSlide("dpi", dpi)} data="data-img-slide-dpi" /></span></div>
    <div className="setrow" data-img-row="quality"><div className="lbl">คุณภาพ<span className="small"><Phr>ใช้ได้กับ JPG และ HEIC ตั้งได้ตั้งแต่ 1 ถึง 100 ค่าตั้งต้นคือ 92 ซึ่งเห็นต่างจากต้นฉบับยากแล้ว</Phr></span></div>
      <span className="imgstack"><NumField reason={qualOk ? undefined : `ไฟล์ ${name} ไม่ลดคุณภาพ ช่องนี้ใช้ได้กับ JPG และ HEIC`} value={o.quality} min={1} max={100} label="คุณภาพ" unit="/ 100" onCommit={(quality) => up({ quality })} data="data-img-quality" />
        <ImgSlide reason={qualOk ? undefined : `ไฟล์ ${name} ไม่ลดคุณภาพ ช่องนี้ใช้ได้กับ JPG และ HEIC`} value={o.quality} stops={QUALITY_STOPS} major={[1, 25, 50, 70, 80, 90, 100]} fineMarks={[1, 25, 50, 75, 100]} label="คุณภาพ" onDrag={(quality) => setDraft({ quality })} onCommit={(quality) => commitSlide("quality", quality)} data="data-img-slide-quality" /></span></div>
    <div className="setrow" data-img-row="sub"><div className="lbl">Chroma subsampling<span className="small"><Phr>ใช้ได้กับ JPG แบบ 4:4:4 เก็บสีครบ เส้นสีบนกราฟคมกว่า แบบ 4:2:0 ไฟล์เล็กลง ส่วน HEIC ใช้ 4:2:0 เพื่อให้เปิดได้ทุกโปรแกรม</Phr></span></div>
      <Seg small label="Chroma subsampling" value={f === "heic" ? "420" : o.subsampling} disabledReason={subOk ? undefined : "ใช้ได้กับ JPG"} onChange={(subsampling) => up({ subsampling })} options={[{ value: "444", label: "4:4:4" }, { value: "420", label: "4:2:0" }]} /></div>
    <div className="setrow" data-img-row="compress"><div className="lbl">การบีบอัด PNG<span className="small"><Phr>ใช้ได้กับ PNG ภาพเหมือนกันทุกระดับ ต่างกันแค่ขนาดไฟล์กับเวลาบันทึก</Phr></span></div>
      <Seg small label="การบีบอัด PNG" value={o.compress} disabledReason={packOk ? undefined : "ใช้ได้กับ PNG"} onChange={(compress) => up({ compress })} options={[{ value: "fast", label: "เร็ว" }, { value: "default", label: "ปกติ" }, { value: "best", label: "เล็กสุด" }]} /></div>
    {/* พี่กันสั่ง 9 พ.ย. 2569 "เอาที่อยู่ไฟล์เป็นค่าตั้งต้นด้วย" · "เราหมายถึงตั้งค่านี้ ที่อยู่ตรงนี้" */}
    <div className="setrow" data-img-row="dir"><div className="lbl">ที่เก็บรูป<span className="small" style={{ overflowWrap: "anywhere" }}>{o.dirMode === "folder" && o.dir ? o.dir : <Phr>โฟลเดอร์เดียวกับไฟล์ที่ดูอยู่ ส่วนหน้าเทียบใช้โฟลเดอร์ของไฟล์ที่ 1</Phr>}</span></div>
      <span className="imgctl"><Seg small label="ที่เก็บรูป" value={o.dirMode === "folder" && o.dir ? "folder" : "beside"} onChange={(v) => { if (v === "beside") up({ dirMode: "beside" }); else void pickDir(); }}
        options={[{ value: "beside", label: "ข้างไฟล์ที่ดูอยู่" }, { value: "folder", label: "โฟลเดอร์ที่เลือก" }]} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void pickDir()} data-img-dir><IcFolder size={15} />เปลี่ยน</button></span></div>
    <div className="setrow" data-img-row="ask"><div className="lbl">ถามที่เก็บทุกครั้ง<span className="small"><Phr>เปิดไว้จะขึ้นกล่องเลือกที่เก็บและแก้ชื่อได้ ส่วนเมื่อปิด กดบันทึกแล้วเก็บเลย ถ้าชื่อซ้ำจะต่อท้ายด้วย (2) ไม่เขียนทับ</Phr></span></div>
      <Switch on={o.ask} onChange={(ask) => up({ ask })} label="ถามที่เก็บทุกครั้ง" /></div>
    <div className="setrow" data-img-row="title"><div className="lbl">แถบหัวรูป<span className="small"><Phr>ชื่อไฟล์กับช่วงเวลาบนรูป หน้าเทียบจะบอกสีของแต่ละไฟล์ด้วย ส่วนกราฟความถี่มีชื่อในตัวอยู่แล้ว</Phr></span></div>
      <Switch on={o.title} onChange={(title) => up({ title })} label="แถบหัวรูป" /></div>
    <div className="setrow" data-img-row="name"><div className="lbl">ใส่ชื่อกราฟในชื่อไฟล์<span className="small"><Phr>ชื่อไฟล์จะเป็นแบบ เพลง รูปคลื่น.png ถ้าชื่อซ้ำจะต่อท้ายด้วย (2) ไม่เขียนทับ</Phr></span></div>
      <Switch on={o.nameGraph} onChange={(nameGraph) => up({ nameGraph })} label="ใส่ชื่อกราฟในชื่อไฟล์" /></div>
    <div className="setrow"><div className="lbl">กลับค่าตั้งต้น<span className="small"><Phr>กลับเป็นกว้าง 2560 px, PNG, 8 bit, RGB, 300 dpi, เก็บข้างไฟล์ และถามที่เก็บทุกครั้ง</Phr></span></div>
      {/* BUGS ข้อ 7 พี่กันสั่ง "ตอนกดกลับค่าเดิม มันจะมี animation บอก เเล้วมีเครื่องหมายติ๊กถูก ว่าเสร็จเเล้ว ส่วนถ้าปรับเเล้ว มันจะกดไม่ได้ จางไว้เลย"
          มีค่าที่ปรับไว้ กดได้ · กดแล้วไอคอนหมุนแล้วติ๊กถูกเด้งขึ้น ขึ้นว่ากลับค่าแล้ว · ค่าเป็นค่าตั้งต้นอยู่แล้ว จางและกดไม่ได้ ข้อความบนปุ่มเป็นเหตุผลในตัว ความกว้างคงที่ทุกสถานะ */}
      <button type="button" className={"btn btn-ghost btn-sm resetbtn" + (resetDone ? " done" : isDefault ? " idle" : "")} aria-disabled={isDefault || undefined}
        title={isDefault ? "ทุกช่องเป็นค่าตั้งต้นอยู่แล้ว" : undefined} onClick={() => void reset()} data-img-reset={resetDone ? "done" : isDefault ? "idle" : "ready"}>
        <Keep icon={resetDone || isDefault ? <IbTick size={15} /> : <IcRefresh size={15} />} all={["กลับค่าตั้งต้น", "กลับค่าแล้ว", "เป็นค่าตั้งต้นแล้ว"]}>{resetDone ? "กลับค่าแล้ว" : isDefault ? "เป็นค่าตั้งต้นแล้ว" : "กลับค่าตั้งต้น"}</Keep></button></div>
  </>;
}

/* ---------- รูปแบบชื่อไฟล์ที่แยก (BUGS ข้อ 130) ---------- */
export const PATTERN_TIP: Tip = {
  w: "ตัวแทนในวงเล็บปีกกาเปลี่ยนเป็นค่าของแต่ละแทร็ก แล้วโปรแกรมต่อนามสกุลให้เอง\nโดยพิมพ์ข้อความอื่นปนได้ ส่วนตัวแทนที่ไม่มีค่าเว้นไว้และไม่ทิ้งจุดซ้อน",
  o: PATTERN_TOKENS.map(([k, v]) => [k, v, "", ""] as [string, string, string, string]),
  r: "ค่าตั้งต้น ได้ชื่อแบบเดิมและต่อท้ายดีเลย์ของเสียงให้หน้าเสียงและซับอ่านกลับได้",
};

/** ช่องพิมพ์รูปแบบ บันทึกตอนกดออกหรือ Enter · ตัวอย่างชื่อที่จะได้เปลี่ยนตามที่พิมพ์ */
export function PatternRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [txt, setTxt] = useState(value);
  useEffect(() => setTxt(value), [value]);
  const commit = () => { const v = txt.trim() || DEFAULT_PATTERN; setTxt(v); if (v !== value) onChange(v); };
  const sample = patternName(txt, "ดาวเหนือ (2023)", { type: "Audio", nth: 1, lang: "th", ext: "ac3", delay: -120, name: "พากย์ไทย" });
  const isDefault = value === DEFAULT_PATTERN && txt === DEFAULT_PATTERN;
  return (
    <div className="patrow">
      <div className="patline">
        <input className="inp patinp" value={txt} spellCheck={false} aria-label="รูปแบบชื่อไฟล์ที่แยก" onChange={(e) => setTxt(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} data-pattern-input />
        <button type="button" className={"btn btn-ghost btn-sm" + (isDefault ? " btn-wait" : "")} aria-disabled={isDefault || undefined} title={isDefault ? "ใช้ค่าตั้งต้นอยู่แล้ว" : "กลับไปใช้รูปแบบตั้งต้น"}
          onClick={() => { if (!isDefault) { setTxt(DEFAULT_PATTERN); onChange(DEFAULT_PATTERN); } }} data-pattern-reset>ค่าตั้งต้น</button>
      </div>
      <div className="small" data-pattern-preview><Phr>{`ตัวอย่าง เสียงที่ 1 ภาษาไทยดีเลย์ -120 มิลลิวินาที ได้ชื่อ`}</Phr> <b className="patsample">{sample}</b></div>
    </div>
  );
}