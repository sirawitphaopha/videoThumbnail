/* บรรทัดที่เลือก เหตุผลที่กดไม่ได้ และคำสั่งทุกตัวของบรรทัด ใช้หลังมีเอกสารแล้ว (ฟังก์ชันธรรมดา ไม่ใช่ hook)
   แยกจาก LineCmds.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { infoApi, type SubDoc, type SubEvent } from "../../lib/api";
import { deleteEvents, edit, getSubEdit, select } from "../../lib/subEdit";
import { adjoin, adjoinable, copyText, duplicate, insertLine, join, moveLines, parsePaste, pasteOver, shiftToFrame, snapScene, snapVideo, splitAt, swapLines, visibleAt, type OverField } from "../../lib/subCmds";
import { fromBox, isAss } from "../../lib/subText";
import { n0 } from "./lineData";
import type { Ln0 } from "./lineCtx";

export function lineRun(hk: Ln0) {
  const { c, clip, dl, doc, fr, pos, setDlg, setNote } = hk;
  const selSet = new Set(c.sel);
  const ev = doc.events.find((e) => e.id === c.active) ?? null;
  const at = ev ? doc.events.indexOf(ev) : -1;
  const ass = isAss(doc);

  /** เลือกบรรทัดจากคำสั่ง · AUTO พาภาพไปเวลาเริ่มของบรรทัดที่เลือกตามปกติ */
  const pick = (ids: number[], active?: number) => select(ids, active ?? ids[0] ?? null);
  const cur = () => getSubEdit().doc ?? doc;

  // ---------------------------------------------------------------- เหตุผลที่กดไม่ได้
  const noSel = c.sel.length ? undefined : "ยังไม่ได้เลือกบรรทัด";
  const noLine = ev ? undefined : "ยังไม่ได้เลือกบรรทัด";
  const noVid = !fr ? c.frWhy || "ยังไม่มีวิดีโอ" : pos == null ? "ยังไม่มีภาพ" : undefined;
  const noKeys = noVid ?? (c.keys.length ? undefined : "วิดีโอนี้ยังไม่มี keyframe");
  const adjWhy = noSel ?? (adjoinable(doc, selSet) ? undefined : "บรรทัดที่เลือกต้องอยู่ติดกัน");
  const joinIds = c.sel.length > 1 ? selSet : new Set([ev?.id, doc.events[at + 1]?.id].filter((x): x is number => x != null));
  const joinWhy = noLine ?? (joinIds.size < 2 ? "บรรทัดนี้เป็นบรรทัดสุดท้าย ไม่มีบรรทัดถัดไปให้รวม" : undefined);
  const swapWhy = c.sel.length === 2 ? undefined : "เลือกให้ครบสองบรรทัดก่อน";
  const vidT = fr && pos != null ? fr.timeAt(pos, "start") - dl : null;

  // ---------------------------------------------------------------- คำสั่ง
  const timed = (label: string, fn: (d: SubDoc) => SubDoc) => { edit(label, fn); };
  const run = {
    snapStart: () => { if (!noSel && !noVid && fr && pos != null) timed("สอดเวลาเริ่มกับภาพ", (d) => snapVideo(d, selSet, fr, pos, true, dl)); },
    snapEnd: () => { if (!noSel && !noVid && fr && pos != null) timed("สอดเวลาจบกับภาพ", (d) => snapVideo(d, selSet, fr, pos, false, dl)); },
    snapScene: () => { if (!noSel && !noKeys && fr && pos != null) timed("สอดเวลาไปยังฉาก", (d) => snapScene(d, selSet, fr, pos, c.keys, dl)); },
    toFrame: () => { if (!noLine && !noVid && fr && pos != null && ev) timed("เลื่อนไปยังเฟรมปัจจุบัน", (d) => shiftToFrame(d, selSet, ev.id, fr, pos, dl)); },
    adjoin: (start: boolean) => { if (!adjWhy) timed(start ? "ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม" : "ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ", (d) => adjoin(d, selSet, start)); },
    insert: (after: boolean, atVideo: boolean) => {
      if (!ev) return;
      const r = insertLine(cur(), ev.id, after, atVideo ? vidT : null);
      if (r) edit(after ? "แทรกบรรทัดหลัง" : "แทรกบรรทัดก่อน", () => r.doc, { sel: [r.id], active: r.id });
    },
    duplicate: (shift: 0 | 1 | -1) => {
      if (noSel || (shift && noVid)) return;
      const r = duplicate(cur(), selSet, shift, fr, pos, dl);
      edit(shift ? (shift > 0 ? "แยกหลังเฟรมที่แสดง" : "แยกก่อนเฟรมที่แสดง") : "ทำสำเนาบรรทัด", () => r.doc, { sel: r.sel, active: r.sel[0] ?? null });
    },
    split: (mode: "estimate" | "preserve" | "video", boxCur?: number) => {
      if (!ev || (mode === "video" && noVid)) return;
      const ta = c.textBox.current as HTMLTextAreaElement | null;
      const box = ta?.value ?? "", k = boxCur ?? ta?.selectionStart ?? box.length;
      // ตำแหน่งในช่องพิมพ์ (ขึ้นบรรทัดจริง) แปลงเป็นตำแหน่งในข้อความดิบ (\N ของ ASS)
      const rawAt = fromBox(box.slice(0, k), doc).length;
      const r = splitAt(cur(), ev.id, rawAt, mode, fr, pos, dl);
      if (r) edit("แยกบรรทัด", () => r.doc, { sel: [r.id], active: r.id });
    },
    join: (keepFirst: boolean) => {
      if (joinWhy) return;
      const r = join(cur(), joinIds, keepFirst);
      if (r) edit("รวมบรรทัด", () => r.doc, { sel: [r.id], active: r.id });
    },
    move: (dir: -1 | 1) => { if (!noSel) edit(dir < 0 ? "ย้ายบรรทัดขึ้น" : "ย้ายบรรทัดลง", (d) => moveLines(d, selSet, dir)); },
    swap: () => { if (!swapWhy) edit("สลับสองบรรทัด", (d) => swapLines(d, selSet)); },
    del: () => { if (!noSel) deleteEvents(c.sel, c.sel.length > 1 ? `ลบ ${c.sel.length} บรรทัด` : "ลบบรรทัด"); },
    visible: () => { if (!noVid && fr && pos != null) { const ids = visibleAt(cur(), fr, pos, dl); pick(ids); setNote({ t: ids.length ? `เลือกบรรทัดที่ขึ้นบนภาพ ${n0(ids.length)} บรรทัด` : "เฟรมนี้ไม่มีซับขึ้น", bad: false }); } },
    copy: async (cut: boolean) => {
      if (noSel) return;
      try {
        const text = copyText(cur(), selSet);
        // ตัวตรวจรับข้อความไว้เอง ไม่เขียนทับคลิปบอร์ดของคนที่ใช้คอมอยู่
        const w = window as unknown as { __subClipOut?: string[] };
        if (import.meta.env.DEV && w.__subClipOut) w.__subClipOut.push(text);
        else await navigator.clipboard.writeText(text);
        if (cut) deleteEvents(c.sel, c.sel.length > 1 ? `ตัด ${c.sel.length} บรรทัด` : "ตัดบรรทัด");
        setNote({ t: `${cut ? "ตัด" : "คัดลอก"} ${n0(c.sel.length)} บรรทัดแล้ว`, bad: false });
      } catch (e) { setNote({ t: `คัดลอกไม่สำเร็จ ${String(e)}`, bad: true }); }
    },
    /** อ่านคลิปบอร์ด · ตัวตรวจส่งข้อความเองได้ (ไม่แตะคลิปบอร์ดของคนที่ใช้คอม) */
    clipLines: async (): Promise<SubEvent[] | null> => {
      const w = window as unknown as { __subClip?: string };
      const text = import.meta.env.DEV && w.__subClip != null ? w.__subClip : await infoApi.clipboardText().catch(() => "");
      const base = ev ?? doc.events[0];
      const lines = base ? parsePaste(cur(), text, base) : [];
      if (!lines.length) { setNote({ t: "คลิปบอร์ดว่าง หรือไม่มีข้อความที่วางเป็นบรรทัดได้", bad: true }); return null; }
      return lines;
    },
    paste: async () => {
      const lines = await run.clipLines();
      if (!lines) return;
      // วางก่อนบรรทัดที่กำลังแก้ แล้วเลือกบรรทัดที่วาง (edit_line_paste ของ Aegisub)
      edit(`วาง ${lines.length} บรรทัด`, (d) => { const k = d.events.findIndex((e) => e.id === c.active); const events = d.events.slice(); events.splice(k < 0 ? events.length : k, 0, ...lines); return { ...d, events }; }, { sel: lines.map((l) => l.id), active: lines[0].id });
      setNote({ t: `วาง ${n0(lines.length)} บรรทัดแล้ว`, bad: false });
    },
    pasteOver: async () => {
      if (noLine) return;
      const lines = await run.clipLines();
      if (!lines) return;
      clip.current = lines;
      setDlg("over");
    },
  };
  const doOver = (f: Set<OverField>) => {
    if (!ev) return;
    const r = pasteOver(cur(), selSet, ev.id, clip.current, f);
    if (r.n) edit(`วางทับ ${r.n} บรรทัด`, () => r.doc);
    setNote({ t: r.n ? `วางทับ ${n0(r.n)} บรรทัดแล้ว` : "ไม่มีบรรทัดให้วางทับ", bad: !r.n });
  };
  return { selSet, ev, at, ass, pick, cur, noSel, noLine, noVid, noKeys, adjWhy, joinIds, joinWhy, swapWhy, vidT, timed, run, doOver };
}
