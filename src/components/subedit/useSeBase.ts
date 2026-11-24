/* ค่าหลักของตัวแก้ซับ เอกสาร สถานะโหลดและบันทึก หน้าต่างที่เปิด ขนาดตาราง วิดีโอ
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { useRef, useState } from "react";
import { type SubAutosave } from "../../lib/api";
import { useSubEdit } from "../../lib/subEdit";
import { usePageActiveRef } from "../../lib/pageActive";
import { type TagMode } from "../../lib/subText";
import { useVid, vidRate } from "../../lib/vidFrames";
import { Ask, Save } from "./editorParts";
import type { SubEditorProps } from "./editorParts";

export function useSeBase(p: SubEditorProps) {
  const st = useSubEdit();
  const doc = st.doc;
  const key = p.track.key;
  const [load, setLoad] = useState<{ s: "busy" } | { s: "ok" } | { s: "failed"; err: string }>({ s: "busy" });
  const [save, setSave] = useState<Save>({ s: "idle" });
  const [ask, setAsk] = useState<Ask | null>(null);
  const [autoList, setAutoList] = useState<SubAutosave[] | null>(null);
  /** ซับในหนัง ถามสองทาง บันทึกข้างหนัง หรือใส่กลับเข้าหนัง (ขั้น 9) */
  const [remux, setRemux] = useState(false);
  /** หน้าต่างส่งออกเป็น PGS (BUGS ข้อ 118) เปิดจากชนิดไฟล์ PGS ในหน้าต่างบันทึกเป็นไฟล์ใหม่ */
  const [pgs, setPgs] = useState(false);
  const [tags, setTags] = useState<TagMode>("full");
  const [font, setFont] = useState<{ apply: (tag: string, reset: string) => void; current: { name: string; size: string } } | null>(null);
  const [gridH, setGridH] = useState(240);
  const [unit, setUnit] = useState<"time" | "frame">("time");
  const [vdlg, setVdlg] = useState<"jump" | "details" | "dummy" | null>(null);
  const vst = useVid();
  const fr = vidRate(vst);
  /** เลือกบรรทัดจากคำสั่งไปขอบบรรทัด ไม่ให้ AUTO พาภาพกลับไปเวลาเริ่มทับ */
  const skipAuto = useRef(false);
  const root = useRef<HTMLElement>(null);
  const gridAt = useRef<HTMLDivElement>(null);
  /** แถวเหนือตาราง · แคบไม่พอให้แถบปุ่มย่อเห็นสองกลุ่มแรก ปุ่มคำสั่งกับเมนูเหลือไอคอน (BUGS ข้อ 113) */
  const gbar = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const labelW = useRef(0);
  const pageOn = usePageActiveRef();
  const path = p.track.inMovie ? p.moviePath : p.track.src;
  const base = (p.track.inMovie ? p.moviePath : p.track.src).replace(/\.[^.\\/]+$/, "") + (p.track.inMovie && p.track.lang ? `.${p.track.lang}` : "");

  return { st, doc, key, load, setLoad, save, setSave, ask, setAsk, autoList, setAutoList, remux, setRemux, pgs, setPgs, tags, setTags, font, setFont, gridH, setGridH, unit, setUnit, vdlg, setVdlg, vst, fr, skipAuto, root, gridAt, gbar, compact, setCompact, labelW, pageOn, path, base, p };
}
