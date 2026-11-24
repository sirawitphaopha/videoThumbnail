/* ค่าของหน้าต่างส่งออก PGS ที่เก็บ ขนาด อัตราเฟรม ตัวสร้าง ค่าที่จำไว้ ภาพตัวอย่าง และค่าเริ่มตอนเปิดหน้าต่าง
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { inApp, pgsApi, type PgsEstimate, type PgsOpts, type PgsOut, type PgsPreview, type SrtStyle, type SubDoc } from "../../lib/api";
import { playRes } from "../../lib/subStyle";
import { isAss } from "../../lib/subText";
import { BD, OPTS0, STYLE0, SAMPLE0, load, keep, fpsOf, type Engine } from "./pgsShared";

export type PgProps = { open: boolean; onClose: () => void; doc: SubDoc; base: string; movie: string | null; video: { w: number; h: number; rate?: string; fps?: number } | null; cur?: number | null; onDone: (msg: string) => void };

export function usePgsState(p: PgProps) {
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
  return { path, setPath, size, setSize, fps, setFps, run, setRun, err, setErr, exists, setExists, out, setOut, engine, setEngine, opts, setOpts, style, setStyle, superOk, setSuperOk, seconvOk, setSeconvOk, font, setFont, line, setLine, sample, setSample, src, setSrc, fit, setFit, prev, setPrev, est, setEst, seq, estSeq, ass, lines, srcExt, p };
}
