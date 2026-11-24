/* คำสั่งของบรรทัดในหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 6 · BUGS ข้อ 109 · ไฟล์ค้นคว้าหัวข้อ 4 กับ 9)
   แถบเหนือตาราง ค้นหา เลื่อนเวลา ปรับเวลาทั้งไฟล์ เมนูเวลา เมนูบรรทัด เมนูเลือก · ตรรกะทุกคำสั่งอยู่ lib/subCmds.ts
   วางปุ่มไว้แถบเหนือตาราง ต่างจากมอคอัปที่วางแถบบน เพราะแถบบนที่หน้าต่าง 1280 × 800 ตอนกางเมนูซ้ายเหลือที่ราว 200 จุด (แคลร์ตั้ง)
   คีย์ลัดตาม default_hotkey.json ของ Aegisub
     Ctrl+I เลื่อนเวลา · Ctrl+3 4 5 6 สอดกับภาพ · Ctrl+D แยกก่อนเฟรม · Ctrl+Shift+D แยกหลังเฟรม · Alt+↑ ↓ ย้ายบรรทัด
     Ctrl+C X V คัดลอก ตัด วางบรรทัด (ตอนไม่ได้พิมพ์ในช่อง) · Ctrl+Shift+V วางทับ · Ctrl+Delete ลบบรรทัด · Ctrl+F ค้นหา · Ctrl+H ค้นและแทนที่ · F3 ค้นต่อไป
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 10) ค่าที่จำอยู่ useLineState คำสั่งอยู่ lineRun ค้นหาอยู่ lineFind เมนูกับแถบปุ่มอยู่ lineMenus หน้าต่างกับคีย์ลัดอยู่ lineDialogs เมนูอยู่ CmdMenu ชนิดกับคำอธิบาย ⓘ อยู่ lineData */
import { useEffect } from "react";
import type { Hotkey } from "../../lib/hotkeys";
import type { LineCtx } from "./lineData";
import { useLineState } from "./useLineState";
import { lineRun } from "./lineRun";
import { lineFind } from "./lineFind";
import { lineMenus } from "./lineMenus";
import { lineDialogs } from "./lineDialogs";

/** ชนิดของค่าที่หน้าแก้ซับส่งมากับคำสั่งของแถบปุ่มย่อ ย้ายไป lineData.ts ส่งต่อจากที่เดิม */
export type { LineCtx, ToolCmd } from "./lineData";

/** คำสั่งของบรรทัดทั้งหมด · คืนแถบปุ่ม หน้าต่าง และคีย์ลัดให้หน้าแก้ซับ */
export function useLineCmds(c: LineCtx) {
  const c0 = useLineState(c);
  const { setDlg, setFind, setFopts, setRepl } = c0;
  // ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ · ยังไม่มีเอกสาร ตัวแปรข้างล่างยังไม่ถูกสร้าง จึงต้องเช็กก่อน
  useEffect(() => {
    if (!import.meta.env.DEV || !c.doc) return;
    (window as unknown as Record<string, unknown>).__subCmds = { run, findNext, doReplace, doReplaceAll, setFind, setRepl, setFopts, setDlg };
  });

  const doc = c.doc;
  if (!doc) return { bar: null, note: null, dialogs: null, hotkeys: [] as Hotkey[], split: () => {}, join: () => {}, insertAfter: () => {}, tools: null };
  const d0 = { ...c0, doc };
  const c1 = { ...d0, ...lineRun(d0) };
  const c2 = { ...c1, ...lineFind(c1) };
  const c3 = { ...c2, ...lineMenus(c2) };
  const c4 = { ...c3, ...lineDialogs(c3) };
  const { bar, dialogs, doReplace, doReplaceAll, findNext, hotkeys, noteEl, run, tools } = c4;
  return { bar, note: noteEl, dialogs, hotkeys, split: run.split, join: run.join, insertAfter: () => run.insert(true, false), tools };
}
