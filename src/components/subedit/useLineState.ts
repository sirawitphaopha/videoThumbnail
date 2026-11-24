/* ค่าที่คำสั่งบรรทัดจำไว้ หน้าต่างที่เปิด ข้อความผล คำค้นกับคำแทนที่ จุดที่เจอล่าสุด และบรรทัดที่คัดลอกไว้รอวางทับ
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useRef, useState } from "react";
import { type SubEvent } from "../../lib/api";
import { type Hit } from "../../lib/subCmds";
import { FIND_DEF, type FindSt } from "./CmdDialogs";
import { type LineCtx, type Msg } from "./lineData";

export function useLineState(c: LineCtx) {
  const { fr, pos, delay: dl } = c;
  const [dlg, setDlg] = useState<"shift" | "post" | "select" | "find" | "replace" | "over" | "goto" | "sort" | "styles" | "resample" | "translate" | "props" | null>(null);
  const [note, setNote] = useState<Msg>(null);
  // ค้นและแทนที่ จำคำค้นไว้ตลอดที่เปิดหน้า F3 ค้นต่อด้วยค่าเดิม
  const [find, setFind] = useState("");
  const [repl, setRepl] = useState("");
  const [fopts, setFopts] = useState<FindSt>(() => { try { return { ...FIND_DEF, ...JSON.parse(localStorage.getItem("se-find") ?? "{}") }; } catch { return FIND_DEF; } });
  const [fmsg, setFmsg] = useState<Msg>(null);
  const hit = useRef<Hit | null>(null);
  const clip = useRef<SubEvent[]>([]);
  useEffect(() => { try { localStorage.setItem("se-find", JSON.stringify(fopts)); } catch { /* ไม่มีที่เก็บ */ } }, [fopts]);
  // ข้อความผลของคำสั่ง หายเองแบบผลสำเร็จ ผิดพลาดค้างไว้จนกดคำสั่งอื่น
  useEffect(() => { if (!note || note.bad) return; const t = setTimeout(() => setNote((x) => (x === note ? null : x)), 5000); return () => clearTimeout(t); }, [note]);
  return { fr, pos, dl, dlg, setDlg, note, setNote, find, setFind, repl, setRepl, fopts, setFopts, fmsg, setFmsg, hit, clip, c };
}
