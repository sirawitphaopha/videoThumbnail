/* ค่าของหน้าต่างแปลงซับภาพ ตัวเลือกที่จำไว้ ภาษา ที่เก็บ ตัวแปลงที่ใช้ได้ มุมมองภาพตัวอย่าง และค่าเริ่มตอนเปิดหน้าต่าง
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { imgApi, inApp, subDocApi, type ImgOut, type ImgPreview, type ImgReq, type SubImg } from "../../lib/api";
import { type AvTrack } from "../../lib/avJob";
import { ftName } from "../../lib/ftypes";
import { langOf } from "../../lib/langs";
import { OPTS0, EXT, load, keep, type Opts } from "./icvData";

export type IcvProps = { open: boolean; onClose: () => void; track: AvTrack; movie: string };

export function useIcvState(p: IcvProps) {
  const t = p.track;
  const ft = ftName("subtitle", t.codec, t.profile);
  // ซับ HD DVD ส่งไฟล์ .sup ให้ตัวแปลงตรง ๆ แบบ PGS (BUGS ข้อ 129) · VobSub ต้องหาไฟล์ .idx คู่กัน
  const kind: ImgReq["kind"] = ft === "VobSub" ? "vobsub" : "pgs";
  const srcPath = t.inMovie ? p.movie : t.src;
  const ff = t.ff ?? t.tid;
  const [opts, setOpts] = useState<Opts>(() => load("imgconv-opts", OPTS0));
  const [lang, setLang] = useState("en");
  const [path, setPath] = useState("");
  const [tools, setTools] = useState<{ bdsupOk: boolean; seconvOk: boolean } | null>(null);
  const [idx, setIdx] = useState(0);
  const [src, setSrc] = useState<{ total: number; pages: Record<number, SubImg[]>; err?: boolean } | null>(null);
  const [prev, setPrev] = useState<{ s: "idle" | "busy" | "done" | "fail"; data?: ImgPreview; err?: string }>({ s: "idle" });
  const [run, setRun] = useState<{ done: number; total: number } | null>(null);
  const [out, setOut] = useState<ImgOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const seq = useRef(0);
  const [view, setViewS] = useState<"full" | "real" | "zoom">(() => { try { const v = localStorage.getItem("imgconv-view"); return v === "real" || v === "zoom" ? v : "full"; } catch { return "full"; } });
  const setView = (v: "full" | "real" | "zoom") => { setViewS(v); try { localStorage.setItem("imgconv-view", v); } catch { /* ไม่มีที่เก็บ */ } };
  const cropSrc = useRef<HTMLDivElement>(null), cropOut = useRef<HTMLDivElement>(null);
  // BDSup2Sub++ อ่านไฟล์นี้ไม่ได้ (หยุดทำงานตอนทำภาพตัวอย่างหรือตอนแปลง) ใช้ Subtitle Edit แทนเฉพาะไฟล์นี้ ค่าที่จำไว้ยังเป็นตัวเดิม (BUGS ข้อ 128
  // พี่กันเสนอ "ถ้าเลือกชนิดซับนี้ของ bub2sub มันควรขึ้นจางให้กดไม่ได้" แล้วสั่ง "ตามคิวนะ") · ตัดสินจากข้อความอ่านซับนี้ไม่ได้ของ imgconv.rs เท่านั้น
  // การแปลงที่ล้มด้วยเหตุอื่น เช่นตัวเลือกย่อขยาย ไม่ได้แปลว่าอ่านไฟล์ไม่ได้ จึงไม่สลับเอง
  const [bdBad, setBdBad] = useState(false);
  const engine: Opts["engine"] = bdBad && tools?.seconvOk ? "seconv" : opts.engine;
  const se = engine === "seconv";
  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));
  useEffect(() => keep("imgconv-opts", opts), [opts]);
  useEffect(() => { setOut(null); setErr(null); setExists(false); }, [engine, opts.out]);

  // เปิดหน้าต่าง ตั้งที่เก็บข้างไฟล์ต้นทาง ชื่อไม่ชนไฟล์ที่มี · ภาษาของ VobSub ตามภาษาของแทร็ก
  useEffect(() => {
    if (!p.open) return;
    setRun(null); setOut(null); setErr(null); setExists(false); setIdx(0); setSrc(null); setBdBad(false);
    const l = langOf(t.lang)[3];
    setLang(l || "en");
    const base = srcPath.replace(/\.[^.\\/]+$/, "") + (t.inMovie && t.lang && t.lang !== "und" ? `.${t.lang}` : "");
    const want = `${base}.${EXT[opts.out]}`;
    const first = want.toLowerCase() === srcPath.toLowerCase() ? `${base}.แปลง.${EXT[opts.out]}` : want;
    if (inApp) {
      void subDocApi.freeName(first).then(setPath, () => setPath(first));
      imgApi.tools().then(setTools, () => setTools({ bdsupOk: false, seconvOk: false }));
    } else setPath(first);
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  // เปลี่ยนชนิดผลแล้วเปลี่ยนนามสกุลของที่เก็บตาม
  useEffect(() => { setPath((x) => (x ? x.replace(/\.(sup|idx|sub|xml)$/i, `.${EXT[opts.out]}`) : x)); }, [opts.out]);
  return { t, ft, kind, srcPath, ff, opts, setOpts, lang, setLang, path, setPath, tools, setTools, idx, setIdx, src, setSrc, prev, setPrev, run, setRun, out, setOut, err, setErr, exists, setExists, seq, view, setViewS, setView, cropSrc, cropOut, bdBad, setBdBad, engine, se, set, p };
}
