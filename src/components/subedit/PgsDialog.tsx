/* ส่งออกซับเป็น PGS ซับแบบภาพของ Blu-ray ไฟล์ .sup (BUGS ข้อ 118 · ตัวทำอยู่ pgs.rs)
   ขนาดภาพกับอัตราเฟรมตามหนังที่เปิดอยู่ เลือกขนาดของ Blu-ray เองได้ · ก่อนส่งออกไล่ซับจริงแล้วเตือนสิ่งที่จะเพี้ยนหรือหาย
   (พี่กันสั่ง "เราเข้าใจว่ามันมีข้อจำกัดก็ต้องเตือนด้วย") · ระหว่างทำบอกภาพที่วาดแล้ว หยุดได้ · ชื่อชนถามตั้งชื่อใหม่ต่อเลข ไม่เขียนทับ
   พี่กันสั่ง 14 พ.ย. 2569 "ใส่ตัวสร้าง PGS ตอนที่ส่งออกด้วย ว่ามีกี่ตัว แนะนำตัวไหนที่ดีที่สุด ข้อดีข้อเสีย และขอประโยคตัวอย่างด้วย"
   · "ขอตัวปรับสี ปรับขอบ ความหนาด้วย ถ้าแปลงจาก srt ธรรมดา" · "ถ้าแปลงจาก ass ต้องมีการเทียบสีจริงของ ass กับ PGS ก่อนส่งออก"
   · "ขอส่วนปรับแต่ง PGS ให้ละเอียด เหมือนโปรแกรมที่เป็นตัวอย่าง" (แบบ SUPer กับหน้าต่างส่งออก Blu-ray sup ของ Subtitle Edit)
   ฝั่งซ้ายตั้งค่า ฝั่งขวาภาพตัวอย่าง หน้าต่างสูงคงที่ เนื้อแต่ละฝั่งเลื่อนในตัว · ค่าที่ตั้งจำไว้ในเครื่อง (แคลร์ตั้ง)
   พี่กันสั่ง 15 พ.ย. 2569 "ทำไมเธอแนะนำชั้นหนัง มันคือตัวไหน … เขียนบอกด้วย" · ป้ายภาพบอกนามสกุลต้นทางเป็น PGS · "เขียนขนาดไฟล์ซับที่น่าจะได้ด้วย"
   · "ขอเส้นแบ่งแนวนอนด้วย" · "อยากให้สามารถดูบรรทัดซับจริงได้ ตอนที่ดูตัวอย่าง แต่ระบบพิมพ์ประโยคเทสก็ยังใช้อยู่"
   · ตัวสร้างที่สาม SeConv ของ Subtitle Edit "ใส่หมายเหตุ และภาพตัวอย่างอยู่แล้วว่ามันจะหายหมด แต่ถ้าเอามาแปลงแค่ srt ก็ใช้ได้" · ตัวเลือกของ SeConv "เอามา ให้ครบเลย" */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, pgsApi, pickSave, subDocApi, type PgsEngine, type PgsEstimate, type PgsOpts, type PgsOut, type PgsPreview, type SrtStyle, type SubDoc } from "../../lib/api";
import { playRes } from "../../lib/subStyle";
import { isAss } from "../../lib/subText";
import Dialog from "../Dialog";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, Keep, Phr, Range, Seg, Switch } from "../ui";
import { IbBack, IbBold, IbItalic, IbNext, IbRevert, IcFolder } from "../icons";
import FontDialog from "./FontDialog";
import { NumBox } from "./StyleDialogs";
import { BOX_TIP, CALIGN_TIP, COLORS_TIP, COMP_TIP, DE_TIP, DITHER_TIP, DROP_TIP, ENGINE_TIP, EST_TIP, KBPS_TIP, LAYOUT_TIP, LOOK_TIP, LSPACE_TIP, MATRIX_TIP, PGS_TIP, POS_TIP, QUANT_TIP, REDRAW_TIP, SIZE_TIP, VIVID_TIP, VSF_TIP, WIN_TIP } from "./pgsTips";

const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** ขนาดภาพของ Blu-ray */
const BD: [number, number][] = [[1920, 1080], [1280, 720], [720, 576], [720, 480]];
/** อัตราเฟรมที่ PGS เก็บได้ */
const FPS: { v: string; label: string; num: number; den: number }[] = [
  { v: "23.976", label: "23.976", num: 24000, den: 1001 }, { v: "24", label: "24", num: 24, den: 1 }, { v: "25", label: "25", num: 25, den: 1 },
  { v: "29.97", label: "29.97", num: 30000, den: 1001 }, { v: "50", label: "50", num: 50, den: 1 }, { v: "59.94", label: "59.94", num: 60000, den: 1001 },
];
type Engine = PgsEngine;
/** ค่าตั้งต้นตรงกับ pgs.rs PgsOpts SrtStyle (แคลร์ตั้ง) */
const OPTS0: PgsOpts = { colors: 255, matrix: "auto", vsfilter: true, vivid: 0, dither: false, windows: 2, compression: 80, quantizer: 3, layout: 2, redraw: 0, maxKbps: 0, allowNormal: true, ahead: true };
const STYLE0: SrtStyle = { font: "Tahoma", size: 64, bold: false, italic: false, color: "#FFFFFF", outlineColor: "#000000", outline: 3, shadow: 1.5, shadowColor: "#000000", shadowOpacity: 50, marginV: 50,
  align: 2, marginH: 60, lineSpacing: 0, contentAlign: "center", boxType: "none", boxColor: "#000000", boxOpacity: 70, boxPadding: 5, boxRadius: 0 };
/** ตำแหน่งเก้าจุดแบบเลขของ ASS เรียงจากแถวบน */
const ALIGN: [number, string][] = [[7, "ซ้ายบน"], [8, "กลางบน"], [9, "ขวาบน"], [4, "ซ้ายกลางภาพ"], [5, "กลางภาพ"], [6, "ขวากลางภาพ"], [1, "ซ้ายล่าง"], [2, "กลางล่าง"], [3, "ขวาล่าง"]];
const ENG_NAME: Record<Engine, string> = { shelf: "ชั้นหนัง", super: "SUPer", seconv: "Subtitle Edit" };
const SAMPLE0 = "ตัวอย่างซับไตเติลภาษาไทย ABC 123";
const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
const keep = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ไม่มีที่เก็บ */ } };


/** แท็กที่ทำให้ภาพเปลี่ยนระหว่างบรรทัด ตรงกับ pgs.rs animated · ดูเฉพาะในวงเล็บปีกกา */
const tagsOf = (t: string) => (t.match(/\{[^}]*\}/g) ?? []).join(" ").toLowerCase();
const isAnimated = (t: string) => { const g = tagsOf(t); return /\\(move|fad|fade|t)\(/.test(g) || /\\k(\d|f|o)/.test(g); };
const isSoft = (t: string) => /\\(blur|be)\s*[1-9]|\\([1-4]a|alpha)\s*&h[0-9a-f]/i.test(tagsOf(t));
/** บรรทัดที่ขึ้นพร้อมกันมากที่สุด */
function maxTogether(doc: SubDoc) {
  const ev: [number, number][] = [];
  for (const e of doc.events) if (!e.comment && e.end > e.start) { ev.push([e.start, 1]); ev.push([e.end, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, m = 0;
  for (const [, d] of ev) { n += d; m = Math.max(m, n); }
  return m;
}
const fpsOf = (rate: string | null | undefined, fps: number | null | undefined) => {
  const m = /^(\d+)\/(\d+)$/.exec(rate ?? "");
  const f = m ? Number(m[1]) / Number(m[2]) : fps ?? 23.976;
  return FPS.reduce((b, x) => (Math.abs(x.num / x.den - f) < Math.abs(b.num / b.den - f) ? x : b), FPS[0]).v;
};
const msText = (ms: number) => { const s = Math.max(0, ms) / 1000; const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`; };

/** ปุ่มสี · กดแล้วเปิดตัวเลือกสีของระบบ */
function Swatch(p: { value: string; onChange: (v: string) => void; label: string; data: string }) {
  return (
    <span className="se-stcolor" data-pgs-color={p.data}>
      <label className="se-dswatch" title={`${p.label} กดเพื่อเลือกสี`}><span style={{ background: p.value }} /><input type="color" value={p.value} onChange={(e) => p.onChange(e.target.value.toUpperCase())} aria-label={p.label} /></label>
      <span className="se-stclbl">{p.label}</span>
    </span>
  );
}

export default function PgsDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; base: string; movie: string | null; video: { w: number; h: number; rate?: string; fps?: number } | null; cur?: number | null; onDone: (msg: string) => void }) {
  const [path, setPath] = useState("");
  const [size, setSize] = useState("video");
  const [fps, setFps] = useState("23.976");
  const [run, setRun] = useState<{ done: number; total: number; phase: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [out, setOut] = useState<PgsOut | null>(null);
  const [engine, setEngine] = useState<Engine>(() => (load("pgs-engine", { v: "shelf" as Engine }).v));
  const [opts, setOpts] = useState<PgsOpts>(() => load("pgs-opts", OPTS0));
  const [style, setStyle] = useState<SrtStyle>(() => load("pgs-style", STYLE0));
  const [superOk, setSuperOk] = useState<boolean | null>(null);
  const [seconvOk, setSeconvOk] = useState<boolean | null>(null);
  const [font, setFont] = useState(false);
  const [line, setLine] = useState(0);
  const [sample, setSample] = useState(SAMPLE0);
  /** ซับ SRT ดูภาพตัวอย่างจากบรรทัดในไฟล์ หรือจากประโยคที่พิมพ์เอง */
  const [src, setSrc] = useState<"line" | "type">("line");
  const [fit, setFit] = useState<"fit" | "real">("fit");
  const [prev, setPrev] = useState<{ s: "idle" | "busy" | "done" | "fail"; data?: PgsPreview; err?: string }>({ s: "idle" });
  const [est, setEst] = useState<{ s: "idle" | "busy" | "done" | "fail"; data?: PgsEstimate; err?: string }>({ s: "idle" });
  const seq = useRef(0);
  const estSeq = useRef(0);
  const ass = isAss(p.doc);
  const lines = p.doc.events.filter((e) => !e.comment && e.end > e.start);
  // นามสกุลของไฟล์ต้นทาง ใช้ในป้ายภาพ · ซับในหนังหรือไฟล์ที่ไม่มีนามสกุลใช้ชนิดของเอกสาร
  const srcExt = (() => { const s = p.doc.source; const m = s && !s.inMovie ? /\.([a-z0-9]{2,5})$/i.exec(s.path) : null; return `.${m ? m[1].toLowerCase() : p.doc.kind}`; })();

  useEffect(() => {
    if (!p.open) return;
    setPath(`${p.base}.sup`); setRun(null); setErr(null); setExists(false); setOut(null);
    setSize(p.video ? "video" : (() => { const [w, h] = playRes(p.doc); return BD.some(([a, b]) => a === w && b === h) ? `${w}x${h}` : "1920x1080"; })());
    setFps(fpsOf(p.video?.rate, p.video?.fps));
    const at = lines.findIndex((e) => e.id === p.cur);
    setLine(at >= 0 ? at : 0);
    setSrc(lines.length ? "line" : "type");
    if (inApp) pgsApi.engines().then((r) => { setSuperOk(r.superOk); setSeconvOk(r.seconvOk); }, () => { setSuperOk(false); setSeconvOk(false); });
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!run || !inApp) return;
    const un = listen<{ done: number; total: number; phase: string }>("pgs-progress", (e) => setRun(e.payload));
    return () => { void un.then((f) => f()); };
  }, [run != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => keep("pgs-engine", { v: engine }), [engine]);
  // เปลี่ยนตัวสร้างแล้วล้างผลส่งออกรอบก่อน ไม่งั้นกล่อง ส่งออกแล้ว ของตัวเก่าค้างอยู่ใต้ตัวที่เลือกใหม่ (เจอจากภาพของตัวตรวจ)
  useEffect(() => { setOut(null); setErr(null); setExists(false); }, [engine]);
  useEffect(() => keep("pgs-opts", opts), [opts]);
  useEffect(() => keep("pgs-style", style), [style]);

  const busy = run != null;
  const [w, h] = size === "video" && p.video ? [p.video.w, p.video.h] : size.split("x").map(Number);
  const std = BD.some(([a, b]) => a === w && b === h);
  const f = FPS.find((x) => x.v === fps) ?? FPS[0];
  const seconv = engine === "seconv";
  // SeConv ทำจานสีกับกรอบเอง ส่งค่าตั้งต้นไปให้ฝั่ง Rust ถอดภาพตัวอย่างด้วยตารางสีที่ตัวเล่นเดา · หน้าตาที่ตั้งใช้กับ SRT และกับ SeConv ทุกชนิดซับ
  const useStyle = !ass || seconv;
  const req = { target: path, w, h, fpsNum: f.num, fpsDen: f.den, movie: p.movie, engine, opts: seconv ? OPTS0 : opts, style: useStyle ? style : null };
  const setO = <K extends keyof PgsOpts>(k: K, v: PgsOpts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  const setS = <K extends keyof SrtStyle>(k: K, v: SrtStyle[K]) => setStyle((o) => ({ ...o, [k]: v }));
  const superWhy = superOk === false ? "ยังไม่มี SUPer ในโฟลเดอร์เครื่องมือของโปรแกรม" : !std ? "SUPer รับเฉพาะขนาดภาพของ Blu-ray" : undefined;
  const seconvWhy = seconvOk === false ? "ยังไม่มี SeConv ในโฟลเดอร์เครื่องมือของโปรแกรม" : undefined;
  const engWhy = engine === "super" ? superWhy : seconv ? seconvWhy : undefined;
  const anim = lines.filter((e) => isAnimated(e.text)).length;
  const soft = lines.filter((e) => isSoft(e.text)).length;
  const together = maxTogether(p.doc);
  // SeConv ไม่วาดเอฟเฟกต์และทำจานสีเอง คำเตือนเรื่องเอฟเฟกต์กับจำนวนสีจึงไม่ใช้ (ซับ ASS มีกล่องเตือนของ SeConv แยก)
  const warns: string[] = [
    ...(lines.length === 0 ? ["ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ"] : []),
    ...(anim && !seconv ? [`มีเอฟเฟกต์เคลื่อนไหว ${anim.toLocaleString("en-US")} บรรทัด โปรแกรมวาดใหม่ทุกเฟรม ไฟล์จะใหญ่ขึ้นและเครื่องเล่น Blu-ray บางเครื่องอาจแสดงไม่ทัน`] : []),
    ...(soft && !seconv ? [`มีขอบเบลอหรือสีโปร่งใส ${soft.toLocaleString("en-US")} บรรทัด ภาพเก็บได้ไม่เกิน ${opts.colors} สี จึงอาจเห็นสีเป็นขั้น`] : []),
    ...(together > 2 ? [`มีช่วงที่ซับขึ้นพร้อมกัน ${together} บรรทัด ถ้าอยู่เกิน${opts.windows === 1 && !seconv ? "หนึ่ง" : "สอง"}ที่บนจอ ตัวสร้างจะรวมเป็นกรอบเดียวกัน`] : []),
    ...(!std ? [`ขนาด ${w} × ${h} ไม่ใช่ขนาดของ Blu-ray เครื่องเล่น Blu-ray อาจไม่รับ แต่ตัวเล่นในคอมเล่นได้`] : []),
  ];
  const why = busy ? "กำลังส่งออก" : lines.length === 0 ? "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ" : !path ? "ยังไม่ได้เลือกที่เก็บ" : engWhy;

  // ภาพตัวอย่าง วาดใหม่เมื่อค่าที่มีผลกับภาพเปลี่ยน รอให้หยุดปรับ 450 มิลลิวินาทีก่อน · ผลของรอบเก่าที่มาช้าไม่ทับรอบใหม่
  // ซับ ASS ดูจากบรรทัดในไฟล์เสมอ ซับ SRT เลือกได้ว่าดูบรรทัดในไฟล์หรือประโยคที่พิมพ์
  const useLine = ass || src === "line";
  const ev = useLine ? lines[Math.min(line, Math.max(0, lines.length - 1))] : null;
  const at = ev ? ev.start + Math.min(500, Math.floor((ev.end - ev.start) / 2)) : 0;
  const prevKey = JSON.stringify([w, h, fps, engine, req.opts, req.style, useLine ? at : sample, p.open]);
  useEffect(() => {
    if (!p.open || !inApp || busy) return;
    if (engWhy) { setPrev({ s: "fail", err: engWhy }); return; }
    if (useLine && !ev) { setPrev({ s: "idle" }); return; }
    const my = ++seq.current;
    setPrev((o) => ({ s: "busy", data: o.data }));
    const t = setTimeout(() => {
      pgsApi.preview(p.doc, req, at, useLine ? null : sample).then(
        (r) => { if (seq.current === my) setPrev({ s: "done", data: r }); },
        (e) => { if (seq.current === my) setPrev({ s: "fail", err: String(e) }); },
      );
    }, 450);
    return () => clearTimeout(t);
  }, [prevKey, superOk, seconvOk]); // eslint-disable-line react-hooks/exhaustive-deps

  // ขนาดไฟล์ที่คาด คิดใหม่เมื่อค่าที่มีผลกับขนาดเปลี่ยน รอหยุดปรับ 900 มิลลิวินาที เพราะต้องวาดภาพจริงหลายภาพ
  const estKey = JSON.stringify([w, h, fps, engine, req.opts, req.style, p.open, lines.length]);
  useEffect(() => {
    if (!p.open || !inApp || busy) return;
    if (engWhy || lines.length === 0) { setEst({ s: "idle" }); return; }
    const my = ++estSeq.current;
    setEst((o) => ({ s: "busy", data: o.data }));
    const t = setTimeout(() => {
      pgsApi.estimate(p.doc, req).then(
        (r) => { if (estSeq.current === my) setEst({ s: "done", data: r }); },
        (e) => { if (estSeq.current === my) setEst({ s: "fail", err: String(e) }); },
      );
    }, 900);
    return () => clearTimeout(t);
  }, [estKey, superOk, seconvOk]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = async (target = path) => {
    if (busy) return;
    setErr(null); setExists(false); setOut(null);
    // SeConv ส่งสัญญาณเริ่มทันทีก่อนตัวฟังของหน้าจอพร้อม ตั้งสถานะของ Subtitle Edit ไว้ก่อน ไม่งั้นปุ่มขึ้นกำลังส่งออก 0% ทั้งรอบ (เจอจากตัวตรวจ check-pgs)
    setRun({ done: 0, total: 0, phase: engine === "seconv" ? "seconv" : "draw" });
    try {
      const r = await pgsApi.export(p.doc, { ...req, target });
      setRun(null);
      setOut(r);
      p.onDone(`ส่งออก PGS แล้ว ${nameOf(r.path)} ${r.images.toLocaleString("en-US")} ภาพ`);
    } catch (e) {
      setRun(null);
      const m = String(e);
      if (m === "exists") { setPath(target); setExists(true); return; }
      if (m !== "stopped") setErr(m);
    }
  };
  const browse = async () => {
    const w2 = window as unknown as { __pgsTarget?: string };
    const r = import.meta.env.DEV && w2.__pgsTarget ? w2.__pgsTarget : await pickSave(path, "sup", "ซับ PGS");
    if (r) setPath(/\.sup$/i.test(r) ? r : `${r}.sup`);
  };
  const pct = run && run.total ? Math.round((run.done / run.total) * 100) : 0;
  // ไฟล์ซับส่วนมากเล็กกว่า 1 MB บอกเป็น KB ไม่ขึ้น 0 MB
  const fsize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024)).toLocaleString("en-US")} KB` : `${(b / 1048576).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`);
  /** ผลส่งออกเป็นประโยคเดียว ต่อด้วย โดย กับ และ */
  const doneText = (o: PgsOut) => {
    // BUGS ข้อ 126 ชุดที่เปลี่ยนแค่จานสี กับชุดที่เครื่องเล่น Blu-ray อาจถอดไม่ทัน (ตัวสร้างชั้นหนังเท่านั้น ตัวอื่นเป็น 0)
    const extra = [o.reduced ? `ลดสี ${o.reduced.toLocaleString("en-US")} ภาพที่มีสีเกิน ${opts.colors} สี` : "", o.merged ? `รวมกรอบ ${o.merged.toLocaleString("en-US")} ภาพที่ซับขึ้นเกินจำนวนกรอบ` : "",
      o.palUpdates ? `เปลี่ยนแค่จานสี ${o.palUpdates.toLocaleString("en-US")} ชุด` : "", o.late ? `มี ${o.late.toLocaleString("en-US")} ชุดที่เครื่องเล่น Blu-ray อาจถอดไม่ทัน` : ""].filter(Boolean);
    return `${o.images.toLocaleString("en-US")} ภาพ ขนาด ${fsize(o.bytes)}${extra.map((x, i) => (i ? ` และ${x}` : ` โดย${x}`)).join("")}`;
  };
  const dis = busy ? "กำลังส่งออก" : undefined;
  const d = prev.data;
  const verdict = (de: number) => (de < 2 ? ["ok", "ตรง"] : de < 5 ? ["mid", "ใกล้เคียง"] : ["bad", "ต่าง"]);

  return (
    <>
      <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="ส่งออกเป็น PGS" width={1100} height="min(760px, calc(100vh - 48px))"
        actions={<>
          {busy ? <button type="button" className="btn btn-ghost" onClick={() => void pgsApi.cancel()} data-pgs-stop>หยุด</button>
            : <button type="button" className="btn btn-ghost" onClick={p.onClose}>{out ? "ปิด" : "ยกเลิก"}</button>}
          {exists && !busy && <button type="button" className="btn btn-ghost" onClick={() => { void subDocApi.freeName(path).then((f2) => { setPath(f2); void go(f2); }); }} data-pgs-renum>ตั้งชื่อใหม่ต่อเลข</button>}
          <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) void go(); }} data-pgs-go>
            <Keep all={["ส่งออก", "กำลังส่งออก… 100%", "SUPer กำลังทำไฟล์… 100%", "Subtitle Edit กำลังทำไฟล์…"]}>{!busy ? "ส่งออก" : run.phase === "seconv" ? "Subtitle Edit กำลังทำไฟล์…" : `${run.phase === "super" ? "SUPer กำลังทำไฟล์" : "กำลังส่งออก"}… ${pct}%`}</Keep></button>
        </>}>
        <div className="se-dummy se-cdlg se-pgs" data-pgs>
          <div className="se-pgscols">
            <div className="se-pgsl" data-pgs-left>
              <div className="se-dlgtext"><Phr>วาดซับทุกบรรทัดเป็นภาพแบบแผ่น Blu-ray หน้าตาเหมือนตอนเล่น</Phr> <InfoTip title="PGS" tip={PGS_TIP} /></div>
              <div className="se-drow"><span className="se-dlbl">ที่เก็บ</span><span className="se-path small" title={path} data-pgs-path>{path}</span>
                <button type="button" className={"btn btn-ghost btn-sm" + (busy ? " btn-wait" : "")} aria-disabled={busy || undefined} onClick={() => { if (!busy) void browse(); }} data-pgs-browse><IcFolder size={15} />เปลี่ยนที่เก็บ</button></div>

              <div className="se-pgshead">ตัวสร้าง PGS มีให้เลือกสามตัว<InfoTip title="ตัวสร้าง PGS" tip={ENGINE_TIP} /></div>
              <div className="se-pgsengs" role="radiogroup" aria-label="ตัวสร้าง PGS">
                {([["shelf", "ffmpeg กับ libass วาดภาพ\nเหมือนต้นฉบับที่สุดและเร็ว", undefined], ["super", "ตรงมาตรฐาน Blu-ray\nไฟล์เล็กแต่ทำช้า", superWhy], ["seconv", "ตัวแปลง SeConv วาดซับเอง\nเหมาะกับซับ SRT", seconvWhy]] as const).map(([k, note, no]) => (
                  <button key={k} type="button" role="radio" aria-checked={engine === k} aria-disabled={busy || !!no || undefined} title={no}
                    className={"se-pgseng" + (engine === k ? " on" : "") + (no ? " off" : "")} onClick={() => { if (!busy && !no) setEngine(k); }} data-pgs-engine={k}>
                    <span className="se-pgsengt"><b>{ENG_NAME[k]}</b>{k === "shelf" && <span className="se-pgsbadge">แนะนำ</span>}</span>
                    <span className="small se-pgsengn">{no ?? note}</span>
                  </button>
                ))}
              </div>
              {ass && seconv && <div className="stat warn" style={{ margin: 0 }} data-pgs-seconv-warn><CardIcon kind="warn" /><div>
                <b>Subtitle Edit ไม่อ่านสไตล์ของซับ ASS</b>
                {/* แยกประโยคละบรรทัด เดิมตัดกลางวลี ภาพตัวอย่าง|ทางขวา */}
                <div><Phr>ฟอนต์ สี ตำแหน่ง และเอฟเฟกต์ในไฟล์จะหายหมด แล้วใช้หน้าตาที่ตั้งข้างล่างแทน</Phr></div>
                <div><Phr>ให้เทียบภาพตัวอย่างทางขวาก่อนส่งออก</Phr></div>
              </div></div>}

              <div className="se-drow"><span className="se-dlbl">ขนาดภาพ<InfoTip title="ขนาดภาพของ PGS" tip={SIZE_TIP} /></span>
                <Dropdown label="ขนาดภาพ" value={size} disabled={dis}
                  options={[...(p.video ? [{ value: "video", label: `ตามหนัง ${p.video.w} × ${p.video.h}` }] : []), ...BD.map(([a, b]) => ({ value: `${a}x${b}`, label: `${a} × ${b}` }))]}
                  onChange={setSize} />
              </div>
              <div className="se-drow"><span className="se-dlbl">อัตราเฟรม</span>
                <Dropdown label="อัตราเฟรม" value={fps} disabled={dis} options={FPS.map((x) => ({ value: x.v, label: `${x.label} fps` }))} onChange={setFps} />
                <span className="small">{p.video ? "ตามหนังที่เปิดอยู่" : "ยังไม่มีวิดีโอ เลือกให้ตรงหนังที่จะใส่"}</span>
              </div>
              <div className="se-drow"><span className="se-dlbl">ขนาดที่คาด<InfoTip title="ขนาดไฟล์ที่คาด" tip={EST_TIP} /></span>
                <span className={"se-pgsest" + (est.s === "busy" ? " busy" : "")} data-pgs-est={est.s} title={est.s === "fail" ? est.err : undefined}>{
                  engWhy || lines.length === 0 ? "—"
                    : est.data ? (est.data.images ? `ราว ${fsize(est.data.bytes)} จาก ${est.data.images.toLocaleString("en-US")} ภาพ` : "—")
                      : est.s === "fail" ? "คาดขนาดไม่ได้" : "กำลังคาดขนาด…"}</span>
              </div>

              {useStyle && <>
                <div className="se-pgshead">{ass ? "หน้าตาซับที่ Subtitle Edit วาด" : "หน้าตาซับ SRT"}<InfoTip title="หน้าตาซับ" tip={LOOK_TIP} />
                  <button type="button" className="btn btn-ghost btn-sm se-pgsreset" onClick={() => setStyle(STYLE0)} data-pgs-style-reset><IbRevert size={14} />ค่าตั้งต้น</button></div>
                <div className="se-drow"><span className="se-dlbl">ฟอนต์</span>
                  <button type="button" className="btn btn-ghost btn-sm se-stfont" onClick={() => setFont(true)} title="เลือกฟอนต์จากฟอนต์ที่ลงในเครื่อง" data-pgs-font style={{ fontFamily: `"${style.font}"` }}>{style.font}</button>
                  <label className="se-f se-pin">ขนาด<NumBox value={style.size} onChange={(x) => setS("size", Math.max(8, Math.min(300, x)))} width={56} data="pgs-size" /></label>
                  <button type="button" className={"btn btn-ghost btn-sm se-sttog" + (style.bold ? " pressed" : "")} aria-pressed={style.bold} onClick={() => setS("bold", !style.bold)} data-pgs-bold><IbBold size={14} />หนา</button>
                  {/* SeConv ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แท็กตัวเอียงในบรรทัดยังใช้ได้ */}
                  <button type="button" className={"btn btn-ghost btn-sm se-sttog" + (style.italic && !seconv ? " pressed" : "") + (seconv ? " btn-wait" : "")} aria-pressed={style.italic && !seconv}
                    aria-disabled={seconv || undefined} title={seconv ? "Subtitle Edit ไม่มีตัวเลือกตัวเอียงทั้งไฟล์ แต่แท็กตัวเอียงในบรรทัดยังใช้ได้" : undefined}
                    onClick={() => { if (!seconv) setS("italic", !style.italic); }} data-pgs-italic><IbItalic size={14} />เอียง</button>
                </div>
                <div className="se-drow"><span className="se-dlbl">สี</span>
                  <Swatch value={style.color} onChange={(v) => setS("color", v)} label="ตัวอักษร" data="color" />
                  <Swatch value={style.outlineColor} onChange={(v) => setS("outlineColor", v)} label="ขอบ" data="outline" />
                  <Swatch value={style.shadowColor} onChange={(v) => setS("shadowColor", v)} label="เงา" data="shadow" />
                </div>
                <div className="se-drow"><span className="se-dlbl">ขอบหนา</span>
                  <div className="se-pgsrange" data-pgs-outline><Range value={style.outline} min={0} max={10} step={0.5} onChange={(v) => setS("outline", v)} label="ความหนาขอบ" /></div><span className="se-pgsval">{style.outline}</span></div>
                <div className="se-drow"><span className="se-dlbl">เงา</span>
                  <div className="se-pgsrange" data-pgs-shadow><Range value={style.shadow} min={0} max={10} step={0.5} onChange={(v) => setS("shadow", v)} label="ระยะเงา" /></div><span className="se-pgsval">{style.shadow}</span>
                  <span className="se-pgssub">ทึบ</span><div className="se-pgsrange sm" data-pgs-shadowop><Range value={style.shadowOpacity} min={0} max={100} step={5} onChange={(v) => setS("shadowOpacity", v)} label="ความทึบของเงา" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.shadowOpacity}%</span></div>
                <div className="se-drow"><span className="se-dlbl">ตำแหน่ง<InfoTip title="ตำแหน่งของซับ" tip={POS_TIP} /></span>
                  <span className="se-pgsalign" role="radiogroup" aria-label="ตำแหน่งของซับ" data-pgs-align>
                    {ALIGN.map(([n, name]) => <button key={n} type="button" role="radio" aria-checked={style.align === n} aria-label={name} title={name}
                      className={style.align === n ? "on" : undefined} onClick={() => setS("align", n)} data-pgs-align-n={n}><i /></button>)}
                  </span>
                  <span className="small" data-pgs-align-name>{ALIGN.find(([n]) => n === style.align)?.[1] ?? ""}</span></div>
                <div className="se-drow"><span className="se-dlbl">ห่างขอบ</span>
                  <label className="se-f se-pin">บนล่าง<NumBox value={style.marginV} onChange={(x) => setS("marginV", Math.max(0, Math.min(500, x)))} width={60} data="pgs-margin" /></label>
                  <label className="se-f se-pin">ซ้ายขวา<NumBox value={style.marginH} onChange={(x) => setS("marginH", Math.max(0, Math.min(900, x)))} width={60} data="pgs-margin-h" /></label>
                  <span className="small">จุด เมื่อภาพสูง 1080</span></div>

                {seconv && <>
                  <div className="se-pgssubhead">เฉพาะ Subtitle Edit</div>
                  <div className="se-drow"><span className="se-dlbl">ระยะบรรทัด<InfoTip title="ระยะบรรทัด" tip={LSPACE_TIP} /></span>
                    <div className="se-pgsrange" data-pgs-lspace><Range value={style.lineSpacing} min={0} max={100} step={5} onChange={(v) => setS("lineSpacing", v)} label="ระยะบรรทัด" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.lineSpacing}%</span></div>
                  <div className="se-drow"><span className="se-dlbl">จัดบรรทัด<InfoTip title="จัดบรรทัดในก้อนซับ" tip={CALIGN_TIP} /></span>
                    <Seg small label="จัดบรรทัดในก้อนซับ" value={style.contentAlign} onChange={(v) => setS("contentAlign", v)}
                      options={[{ value: "center", label: "กึ่งกลาง" }, { value: "left", label: "ชิดซ้าย" }, { value: "right", label: "ชิดขวา" }, { value: "from-alignment", label: "ตามตำแหน่ง" }]} /></div>
                  <div className="se-drow"><span className="se-dlbl">กล่องพื้นหลัง<InfoTip title="กล่องพื้นหลัง" tip={BOX_TIP} /></span>
                    <Seg small label="กล่องพื้นหลัง" value={style.boxType} onChange={(v) => setS("boxType", v)}
                      options={[{ value: "none", label: "ไม่มี" }, { value: "one-box", label: "กล่องเดียว" }, { value: "box-per-line", label: "กล่องละบรรทัด" }]} /></div>
                  {style.boxType !== "none" && <>
                    <div className="se-drow"><span className="se-dlbl">กล่อง</span>
                      <Swatch value={style.boxColor} onChange={(v) => setS("boxColor", v)} label="สีพื้น" data="box" />
                      <span className="se-pgssub">ทึบ</span><div className="se-pgsrange sm" data-pgs-boxop><Range value={style.boxOpacity} min={0} max={100} step={5} onChange={(v) => setS("boxOpacity", v)} label="ความทึบของกล่อง" format={(v) => `${v}%`} /></div><span className="se-pgsval">{style.boxOpacity}%</span></div>
                    <div className="se-drow"><span className="se-dlbl">ขนาดกล่อง</span>
                      <label className="se-f se-pin">ขอบใน<NumBox value={style.boxPadding} onChange={(x) => setS("boxPadding", Math.max(0, Math.min(100, x)))} width={56} data="pgs-box-pad" /></label>
                      <label className="se-f se-pin">มุมมน<NumBox value={style.boxRadius} onChange={(x) => setS("boxRadius", Math.max(0, Math.min(100, x)))} width={56} data="pgs-box-radius" /></label>
                      <span className="small">จุด เมื่อภาพสูง 1080</span></div>
                  </>}
                </>}
              </>}

              <div className="se-pgshead">ปรับแต่ง PGS
                {!seconv && <button type="button" className="btn btn-ghost btn-sm se-pgsreset" onClick={() => setOpts(OPTS0)} data-pgs-opts-reset><IbRevert size={14} />ค่าตั้งต้น</button>}</div>
              {seconv ? <div className="small se-pgsnote" data-pgs-seconv-opts><Phr>Subtitle Edit ทำจานสีและกรอบของ PGS เอง ตัวเลือกส่วนนี้จึงใช้กับตัวสร้างชั้นหนังและ SUPer เท่านั้น</Phr></div> : <>
              <div className="se-drow"><span className="se-dlbl">สีต่อภาพ<InfoTip title="จำนวนสีต่อภาพ" tip={COLORS_TIP} /></span>
                <div className="se-pgsrange" data-pgs-colors><Range value={opts.colors} min={16} max={255} step={1} onChange={(v) => setO("colors", v)} label="จำนวนสีต่อภาพ" /></div><span className="se-pgsval">{opts.colors} สี</span></div>
              <div className="se-drow"><span className="se-dlbl">ความสด<InfoTip title="ความสดของสี" tip={VIVID_TIP} /></span>
                <div className="se-pgsrange" data-pgs-vivid><Range value={opts.vivid} min={0} max={50} step={5} onChange={(v) => setO("vivid", v)} label="ความสดของสี" format={(v) => `${v}%`} /></div><span className="se-pgsval">{opts.vivid}%</span></div>
              {ass && <div className="se-drow"><span className="se-dlbl">สีแบบตัวเล่น<InfoTip title="สีตามบรรทัด YCbCr Matrix" tip={VSF_TIP} /></span>
                <Switch on={opts.vsfilter} onChange={(v) => setO("vsfilter", v)} label="ทำสีตามบรรทัด YCbCr Matrix ของซับแบบตัวเล่น" /><span className="small">ทำสีตามบรรทัด YCbCr Matrix แบบ mpv</span></div>}
              <div className="se-drow"><span className="se-dlbl">ตารางสี<InfoTip title="ตารางสีของจานสี" tip={MATRIX_TIP} /></span>
                <Seg small label="ตารางสี" value={opts.matrix} onChange={(v) => setO("matrix", v)} options={[{ value: "auto", label: "อัตโนมัติ" }, { value: "709", label: "BT.709" }, { value: "601", label: "BT.601" }]} /></div>

              <div className="se-pgssubhead">{engine === "super" ? "เฉพาะ SUPer" : "เฉพาะตัวสร้างชั้นหนัง"}</div>
              {engine === "shelf" ? <>
                <div className="se-drow"><span className="se-dlbl">กระจายจุดสี<InfoTip title="กระจายจุดสี" tip={DITHER_TIP} /></span>
                  <Switch on={opts.dither} onChange={(v) => setO("dither", v)} label="กระจายจุดสีตอนลดสี" /><span className="small">ใช้เมื่อภาพมีสีเกินจำนวนที่ตั้ง</span></div>
                <div className="se-drow"><span className="se-dlbl">กรอบพร้อมกัน<InfoTip title="กรอบบนจอ" tip={WIN_TIP} /></span>
                  <Seg small label="กรอบพร้อมกัน" value={String(opts.windows)} onChange={(v) => setO("windows", Number(v))} options={[{ value: "2", label: "2 กรอบ" }, { value: "1", label: "1 กรอบ" }]} /></div>
              </> : <>
                <div className="se-drow"><span className="se-dlbl">ระดับบีบอัด<InfoTip title="ระดับบีบอัดของ SUPer" tip={COMP_TIP} /></span>
                  <div className="se-pgsrange" data-pgs-comp><Range value={opts.compression} min={0} max={100} step={5} onChange={(v) => setO("compression", v)} label="ระดับบีบอัด" /></div><span className="se-pgsval">{opts.compression}</span></div>
                <div className="se-drow"><span className="se-dlbl">ตัวลดสี<InfoTip title="ตัวลดสีของ SUPer" tip={QUANT_TIP} /></span>
                  <Dropdown label="ตัวลดสี" value={String(opts.quantizer)} disabled={dis} onChange={(v) => setO("quantizer", Number(v))}
                    options={[{ value: "3", label: "libimagequant (แนะนำ)" }, { value: "0", label: "QtzrUTC" }, { value: "2", label: "HexTree" }, { value: "1", label: "Pillow" }]} /></div>
                <div className="se-drow"><span className="se-dlbl">จัดกรอบ<InfoTip title="การจัดกรอบของ SUPer" tip={LAYOUT_TIP} /></span>
                  <Seg small label="การจัดกรอบ" value={String(opts.layout)} onChange={(v) => setO("layout", Number(v))} options={[{ value: "2", label: "เต็มที่" }, { value: "1", label: "ปกติ" }, { value: "0", label: "ปลอดภัย" }]} /></div>
                <div className="se-drow"><span className="se-dlbl">กันภาพตกหล่น<InfoTip title="กันภาพตกหล่น" tip={DROP_TIP} /></span>
                  <Switch on={opts.allowNormal} onChange={(v) => setO("allowNormal", v)} label="วาดใหม่ทีละกรอบ" /><span className="small">วาดใหม่ทีละกรอบ</span>
                  <Switch on={opts.ahead} onChange={(v) => setO("ahead", v)} label="เตรียมสีล่วงหน้า" /><span className="small">เตรียมสีล่วงหน้า</span></div>
                <div className="se-drow"><span className="se-dlbl">วาดซ้ำทุก<InfoTip title="วาดซ้ำ" tip={REDRAW_TIP} /></span>
                  <NumBox value={opts.redraw} onChange={(x) => setO("redraw", Math.max(0, Math.min(60, x)))} width={56} data="pgs-redraw" /><span className="small">วินาที</span></div>
                <div className="se-drow"><span className="se-dlbl">บิตเรตไม่เกิน<InfoTip title="ตรวจบิตเรต" tip={KBPS_TIP} /></span>
                  <NumBox value={opts.maxKbps} onChange={(x) => setO("maxKbps", Math.max(0, Math.min(48000, Math.round(x))))} width={72} data="pgs-kbps" /><span className="small">kbps</span></div>
              </>}
              </>}

              {warns.length > 0 && <div className="stat warn" style={{ margin: 0 }} data-pgs-warn><CardIcon kind="warn" /><div>
                <b>ข้อจำกัดของ PGS ที่เจอในซับนี้</b>
                <ul className="se-lostlist">{warns.map((x) => <li key={x}><Phr>{x}</Phr></li>)}</ul>
              </div></div>}
            </div>

            <div className="se-pgsr" data-pgs-right>
              <div className="se-pgshead">ภาพตัวอย่าง
                <Seg small label="ขนาดภาพตัวอย่าง" value={fit} onChange={setFit} options={[{ value: "fit", label: "พอดีกรอบ" }, { value: "real", label: "ขนาดจริง" }]} /></div>
              {!ass && <div className="se-drow" data-pgs-src><span className="se-dlbl">ข้อความ</span>
                <Seg small label="ข้อความในภาพตัวอย่าง" value={src} onChange={setSrc} options={[{ value: "line", label: "บรรทัดในไฟล์" }, { value: "type", label: "ประโยคที่พิมพ์" }]} /></div>}
              {useLine ? (
                <div className="se-pgspick" data-pgs-line>
                  <button type="button" className="btn btn-ghost btn-sm" aria-disabled={line <= 0 || undefined} title={line <= 0 ? "บรรทัดแรกแล้ว" : "บรรทัดก่อนหน้า"} onClick={() => { if (line > 0) setLine(line - 1); }} data-pgs-line-prev><IbBack size={14} /></button>
                  <span className="small">{lines.length ? `บรรทัดที่ ${(line + 1).toLocaleString("en-US")} จาก ${lines.length.toLocaleString("en-US")} เวลา ${msText(at)}` : "ซับนี้ไม่มีบรรทัดที่ขึ้นบนภาพ"}</span>
                  <button type="button" className="btn btn-ghost btn-sm" aria-disabled={line >= lines.length - 1 || undefined} title={line >= lines.length - 1 ? "บรรทัดสุดท้ายแล้ว" : "บรรทัดถัดไป"} onClick={() => { if (line < lines.length - 1) setLine(line + 1); }} data-pgs-line-next><IbNext size={14} /></button>
                </div>
              ) : (
                <label className="se-drow se-pgssample"><span className="se-dlbl">ประโยคตัวอย่าง</span>
                  <input className="inp" value={sample} onChange={(e) => setSample(e.target.value)} aria-label="ประโยคตัวอย่าง" data-pgs-sample /></label>
              )}
              <div className={"se-pgsimgs" + (fit === "real" ? " real" : "")} data-pgs-imgs data-state={prev.s}>
                {/* ป้ายบอกนามสกุลต้นทางเป็น PGS (พี่กันถาม "ส่งออก PGS มีสองรูป บอกหน่อย จากนามสกุลไหน เป็น PGS") */}
                {ass && <figure><figcaption data-pgs-cap="src">{`ต้นฉบับ ${srcExt} ตอนเล่น`}</figcaption>
                  <div className="se-pgsimg">{d?.ass ? <img src={d.ass} alt={`ภาพซับ ${srcExt} แบบที่ตัวเล่นแสดง`} data-pgs-img-ass /> : <i className="se-pgsskel skel" />}</div></figure>}
                {ass ? <figure><figcaption data-pgs-cap="pgs">{`${srcExt} เป็น PGS .sup ${engine === "shelf" ? "ที่จะได้" : `ที่ ${ENG_NAME[engine]} จะทำ`}`}</figcaption>
                  <div className="se-pgsimg">{d && !d.empty ? <img src={d.pgs} alt="ภาพ PGS ที่จะได้" data-pgs-img-pgs /> : <i className="se-pgsskel skel" />}</div></figure>
                  : ([["dark", "บนพื้นมืด"], ["light", "บนพื้นสว่าง"]] as const).map(([k, cap]) => (
                    // ซับ SRT ไม่มีภาพหนังให้เทียบ วางภาพ PGS พื้นโปร่งใสบนพื้นมืดกับพื้นสว่าง ให้เห็นว่าขอบกับเงาทำงานยังไง
                    <figure key={k}><figcaption data-pgs-cap={k}>{`${srcExt} เป็น PGS .sup ${engine === "shelf" ? "" : `ที่ ${ENG_NAME[engine]} ทำ `}${cap}`}</figcaption>
                      <div className={`se-pgsimg ${k}`}>{d && !d.empty ? <img src={d.pgsAlpha} alt={`ภาพ PGS ${cap}`} data-pgs-img-pgs={k} /> : <i className="se-pgsskel skel" />}</div></figure>
                  ))}
                {prev.s === "busy" && <span className="se-pgswait small" data-pgs-wait>{engine === "shelf" ? "กำลังทำภาพตัวอย่าง…" : `${ENG_NAME[engine]} กำลังทำภาพตัวอย่าง…`}</span>}
              </div>
              {prev.s === "fail" && <div className="stat bad" style={{ margin: 0 }} data-pgs-prev-err><CardIcon kind="bad" /><div><b>ทำภาพตัวอย่างไม่ได้</b><Phr>{prev.err ?? ""}</Phr></div></div>}
              {d?.empty && <div className="small" data-pgs-prev-empty>เวลานี้ไม่มีซับบนภาพ</div>}
              {d && !d.empty && <div className="small se-pgsnote" data-pgs-note><Phr>{`${!ass ? "" : d.bg === "movie" ? "พื้นหลังเป็นภาพจากหนังที่เวลานี้  " : "พื้นหลังเป็นสีเทา  "}ภาพนี้มี ${d.before.toLocaleString("en-US")} สี และ PGS ใช้ ${d.after.toLocaleString("en-US")} สี`}</Phr></div>}
              {/* SeConv วาดตำแหน่งและขนาดของตัวเอง เทียบสีทีละจุดกับต้นฉบับแล้วได้ตัวเลขที่ไม่จริง (ขาวกลายเป็นดำ ΔE 100) จึงไม่แสดงตาราง */}
              {ass && seconv && d && !d.empty && <div className="small se-pgsnote" data-pgs-seconv-note><Phr>Subtitle Edit วาดตำแหน่งและขนาดของตัวเอง จึงเทียบสีทีละจุดกับต้นฉบับไม่ได้ ให้ดูความต่างจากภาพข้างบน</Phr></div>}
              {ass && !seconv && d && !d.empty && d.colors.length > 0 && <div className="se-pgsctab" data-pgs-colors-table>
                <div className="se-pgscrow head"><span>{`สีใน ${srcExt}`}</span><span>สีใน PGS</span><span>ΔE<InfoTip title="ความต่างของสี ΔE" tip={DE_TIP} /></span><span>ผล</span><span>สัดส่วน</span></div>
                {d.colors.map((c) => { const [k, t] = verdict(c.de); return (
                  <div key={c.ass} className="se-pgscrow" data-pgs-crow={k}>
                    <span><i style={{ background: c.ass }} />{c.ass}</span><span><i style={{ background: c.pgs }} />{c.pgs}</span><span>{c.de.toFixed(1)}</span><span className={"se-pgsv " + k}>{t}</span><span>{c.share.toFixed(1)}%</span>
                  </div>); })}
              </div>}
              {ass && !seconv && d && !d.empty && <div className={"small se-pgssum" + (d.colors.every((c) => c.de < 2) ? " ok" : "")} data-pgs-sum><Phr>{
                // ต้นฉบับอาจเป็น .smi หรือซับแบบอื่นที่แปลงเป็น ASS ตอนเปิด จึงเรียกว่าต้นฉบับ ไม่เรียก ASS
                (d.colors.every((c) => c.de < 2) ? "สีหลักของ PGS ตรงกับต้นฉบับทุกสี" : `มี ${d.colors.filter((c) => c.de >= 2).length} สีที่ต่างจากต้นฉบับ ให้ดูตารางข้างบน`)
                + `  ทั้งภาพต่างเฉลี่ย ${d.mean.toFixed(1)} จาก 255`
                + (d.mangled ? "  ซับนี้บอกตารางสีเป็น TV.601 สีจึงปรับแบบที่ mpv แสดงบนหนัง HD" : "")
              }</Phr></div>}
            </div>
          </div>

          {(busy || exists || err || out) && <div className="se-pgsstat" data-pgs-status>
            {busy && run.phase === "seconv" && <div className="se-drow" data-pgs-prog-seconv><span className="small">Subtitle Edit กำลังวาดซับทุกบรรทัดและทำไฟล์ .sup ซึ่งไม่บอกความคืบหน้าระหว่างทำ</span></div>}
            {busy && run.phase !== "seconv" && <div className="se-drow"><div className="se-vprog" style={{ flex: 1 }} data-pgs-prog><div style={{ width: `${pct}%` }} /></div>
              <span className="small">{run.total ? (run.phase === "super" ? `SUPer หากรอบภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}` : `วาดภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}`) : "เริ่ม…"}</span></div>}
            {exists && <div className="small se-rmwarn" data-pgs-exists><Phr>{`${nameOf(path)} มีอยู่แล้ว โปรแกรมไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข หรือเลือกที่เก็บใหม่`}</Phr></div>}
            {err && <div className="stat bad" style={{ margin: 0 }} role="alert" data-pgs-err><CardIcon kind="bad" /><div><b>ส่งออกไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
            {out && <div className="stat ok" style={{ margin: 0 }} data-pgs-done><CardIcon kind="ok" /><div>
              <b>{`ส่งออกแล้ว ${nameOf(out.path)}`}</b>
              <Phr>{doneText(out)}</Phr>
            </div></div>}
          </div>}
        </div>
      </Dialog>
      <FontDialog open={font} current={{ name: style.font, size: String(style.size) }} sample={sample} onClose={() => setFont(false)} onApply={() => {}}
        onPick={(name, sz) => setStyle((o) => ({ ...o, font: name, size: parseFloat(sz) || o.size }))} />
    </>
  );
}
