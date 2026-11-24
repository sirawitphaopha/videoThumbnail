/* เวลาของบรรทัดบนคลื่นเสียง ยืนยันเวลา ขยับ คำสั่งแถบเสียง
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { type SubDoc } from "../../lib/api";
import { blankEvent, edit, getSubEdit, insertEvent, select } from "../../lib/subEdit";
import { snapMs } from "../../lib/subText";
import { type AudAct } from "./AudioBar";
import { play, stopPlay } from "../../lib/audioPlay";
import { getTiming, getViewW, msPerPx, rangeOf, scrollIntoView, setLeft, setPend, type AudSource } from "../../lib/subTiming";
import { KIND_EXT, LEAD_IN, LEAD_OUT, extOf, nameOf } from "./editorParts";
import type { E2 } from "./seCtx";

export function useSeTiming(c: E2) {
  const { at, dl, doc, ev, p, tm, vst } = c;
  // goto กับ onNext ย้ายขึ้นมาจากชุดบันทึก เพราะคำสั่งแถบเสียงในชุดนี้เรียกใช้ (BUGS ข้อ 155 ขั้น 5)
  const goto = (i: number) => { if (!doc) return; const k = Math.max(0, Math.min(doc.events.length - 1, i)); const e = doc.events[k]; if (e) select([e.id], e.id); };
  /** ไปบรรทัดถัดไป · create คือ Enter ในช่องพิมพ์กับปุ่มยืนยันแล้วไปต่อ (grid/line/next/create ของ Aegisub)
      ยืนยันเวลาที่ลากค้างบนคลื่นเสียงก่อนเปลี่ยนบรรทัด (tc->Commit ใน grid.cpp) ไม่งั้นกรอบคลื่นเสียงทิ้งที่ลากไว้เงียบ ๆ (ผู้ช่วยตรวจทาน F1)
      อ่านเอกสารล่าสุดจากที่เก็บหลังยืนยัน บรรทัดใหม่จึงเริ่มที่เวลาจบที่เพิ่งยืนยัน ไม่ใช่เวลาจบของรอบวาดก่อนกด (cur->End หลัง Commit · F2) */
  const onNext = (create: boolean) => {
    if (create) commitTiming();
    const s = getSubEdit();
    const d = s.doc;
    const cur = d?.events.find((e) => e.id === s.active);
    if (!d || !cur) return;
    const i = d.events.indexOf(cur);
    if (i < d.events.length - 1) { const nx = d.events[i + 1]; select([nx.id], nx.id); return; }
    if (!create) return;
    // บรรทัดสุดท้าย Enter สร้างบรรทัดใหม่ต่อท้าย เริ่มที่เวลาจบ ยาว 3 วินาที (Timing/Default Duration ของ Aegisub)
    insertEvent(i, blankEvent(d, { start: cur.end, end: cur.end + 3000, style: cur.style }), "เพิ่มบรรทัด");
  };
  const zero = vst.table && vst.movie === p.video ? vst.table.base / 1000 : null;
  const movieAud: AudSource = p.video && p.refStream != null ? { path: p.video, map: `0:${p.refStream}`, idx: p.refIdx ?? 0, name: nameOf(p.video), own: false, zero } : null;
  const aud = tm.own ?? movieAud;
  const noAudio = aud ? undefined : p.video ? "หนังเรื่องนี้ไม่มีเสียง" : "ยังไม่มีเสียง เปิดไฟล์วิดีโอหรือไฟล์เสียงก่อน";
  const noLine = ev ? undefined : "ยังไม่ได้เลือกบรรทัด";
  /** ลงเวลาที่ลากไว้บนคลื่นเสียงลงบรรทัด (DoCommit ของ Aegisub) · ยืนยันทันทีรวมการแก้ที่ต่อกันเป็นขั้นเดียว */
  const commitTiming = (auto = false) => {
    const pd = getTiming().pend;
    if (!pd) return false;
    const by = new Map([[pd.id, pd], ...pd.links.map((l) => [l.id, l] as const)]);
    // เรียงเวลาเริ่มก่อนเวลาจบทุกบรรทัด รวมบรรทัดที่ลากตามด้วย Ctrl ซึ่งลากข้ามขอบอีกฝั่งได้ (Apply ของ TimeableLine ใน Aegisub ใช้ซ้ายสุดขวาสุด · F13)
    edit("ตั้งเวลาบนคลื่นเสียง", (dd) => ({ ...dd, events: dd.events.map((e) => { const x = by.get(e.id); return x ? { ...e, start: snapMs(Math.max(0, Math.min(x.start, x.end)), dd), end: snapMs(Math.max(0, x.start, x.end), dd) } : e; }) }), auto ? { merge: `timing:${pd.id}` } : {});
    setPend(null);
    return true;
  };
  /** ขยับขอบที่ใช้อยู่ (ลากไว้หรือของบรรทัด) แล้วยืนยันเองถ้าเปิดยืนยันทันที (SetMarkers ของ Aegisub) */
  const moveRange = (start: number, end: number) => {
    if (!ev) return;
    setPend({ id: ev.id, start: Math.round(Math.min(start, end)), end: Math.round(Math.max(start, end)), links: [] });
    if (getTiming().opts.autoCommit) commitTiming(true);
  };
  const audioAct = (a: AudAct) => {
    if (!ev && a !== "stop") return;
    const r = ev ? rangeOf(ev) : { start: 0, end: 0 };
    const src = aud;
    const pl = (a0: number, a1: number | null) => { if (src) void play({ path: src.path, map: src.map }, a0 + dl, a1 == null ? null : a1 + dl); };
    switch (a) {
      case "prev": goto(at - 1); break;
      case "next": goto(at + 1); break;
      case "playsel": pl(r.start, r.end); break;
      case "playline": if (ev) pl(ev.start, ev.end); break;
      case "stop": stopPlay(); break;
      // ครึ่งวินาทีก่อนและหลังช่วง ต้นช่วง ท้ายช่วง (audio/play/selection/before after begin end ของ Aegisub)
      case "before": pl(r.start - 500, r.start); break;
      case "after": pl(r.end, r.end + 500); break;
      case "begin": pl(r.start, Math.min(r.start + 500, r.end)); break;
      case "end": pl(Math.max(r.start, r.end - 500), r.end); break;
      case "toend": pl(r.start, null); break;
      case "leadin": moveRange(r.start - LEAD_IN, r.end); break;
      case "leadout": moveRange(r.start, r.end + LEAD_OUT); break;
      // ยืนยันแล้วไปบรรทัดถัดไป บรรทัดสุดท้ายสร้างบรรทัดใหม่ต่อท้าย (audio/commit กับ Next Line on Commit)
      case "commit": commitTiming(); if (getTiming().opts.autoNext) onNext(true); break;
      case "goto": scrollIntoView(r.start + dl, r.end + dl, getViewW(), msPerPx(getTiming().opts.hzoom)); break;
    }
  };
  /** ขยับเวลาเริ่มหรือความยาวทีละ 10 ms (ModifyStart ModifyLength ของ Aegisub) */
  const nudge = (which: "start" | "len", n: number) => {
    if (!ev) return;
    const r = rangeOf(ev);
    if (which === "start") moveRange(Math.min(r.start + n * 10, r.end), r.end);
    else moveRange(r.start, Math.max(r.end + n * 10, r.start));
  };
  const scrollBy = (px: number) => setLeft(Math.max(0, getTiming().left + px * msPerPx(getTiming().opts.hzoom)));

  const frWhy = vst.dummy ? "" :!vst.movie ? "ยังไม่มีไฟล์วิดีโอ จึงไม่รู้เวลาของแต่ละเฟรม" : vst.closed ? "ปิดวิดีโออยู่" : vst.load === "err" ? "อ่านเวลาเฟรมของวิดีโอไม่ได้" : "กำลังอ่านเวลาของทุกเฟรม รอสักครู่";
  const sameKind = (d: SubDoc) => { const s = d.source; return !!s && !s.inMovie && extOf(s.path) === KIND_EXT[d.kind] || (!!s && !s.inMovie && d.kind === "srt" && extOf(s.path) === "txt"); };

  /** บันทึก · คืน true เมื่อบันทึกแล้ว · "choose" ต้องให้คนเลือกเพิ่ม (หน้าต่างถามขึ้นในหน้านี้) · false ล้ม
      ตัวกันปิดโปรแกรมแยกต้องเลือกออกจากล้ม พาไปหน้านี้ให้เห็นหน้าต่างถาม ไม่ขึ้นว่าบันทึกไม่สำเร็จ (ผู้ช่วยตรวจทาน F17) */
  return { goto, onNext, zero, movieAud, aud, noAudio, noLine, commitTiming, moveRange, audioAct, nudge, scrollBy, frWhy, sameKind };
}
