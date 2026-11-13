/* คำสั่งของบรรทัดในหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 6 · BUGS ข้อ 109 · ไฟล์ค้นคว้าหัวข้อ 4 กับ 9)
   แถบเหนือตาราง ค้นหา เลื่อนเวลา ปรับเวลาทั้งไฟล์ เมนูเวลา เมนูบรรทัด เมนูเลือก · ตรรกะทุกคำสั่งอยู่ lib/subCmds.ts
   วางปุ่มไว้แถบเหนือตาราง ต่างจากมอคอัปที่วางแถบบน เพราะแถบบนที่หน้าต่าง 1280 × 800 ตอนกางเมนูซ้ายเหลือที่ราว 200 จุด (แคลร์ตั้ง)
   คีย์ลัดตาม default_hotkey.json ของ Aegisub
     Ctrl+I เลื่อนเวลา · Ctrl+3 4 5 6 สอดกับภาพ · Ctrl+D แยกก่อนเฟรม · Ctrl+Shift+D แยกหลังเฟรม · Alt+↑ ↓ ย้ายบรรทัด
     Ctrl+C X V คัดลอก ตัด วางบรรทัด (ตอนไม่ได้พิมพ์ในช่อง) · Ctrl+Shift+V วางทับ · Ctrl+Delete ลบบรรทัด · Ctrl+F ค้นหา · Ctrl+H ค้นและแทนที่ · F3 ค้นต่อไป */
import { useEffect, useRef, useState, type RefObject } from "react";
import { infoApi, type SubDoc, type SubEvent } from "../../lib/api";
import type { Hotkey } from "../../lib/hotkeys";
import { deleteEvents, edit, getSubEdit, select } from "../../lib/subEdit";
import {
  adjoin, adjoinable, copyText, duplicate, findAll, gotoTarget, insertLine, join, moveLines, parsePaste, pasteOver, postProcess, replaceAll, replaceOne,
  selectLines, shiftTimes, shiftToFrame, snapScene, snapVideo, sortLines, splitAt, swapLines, visibleAt,
  type FindOpts, type Hit, type OverField, type PostOpts, type SelectOpts, type ShiftOpts, type SortKey,
} from "../../lib/subCmds";
import { fromBox, isAss } from "../../lib/subText";
import type { Framerate } from "../../lib/vidFrames";
import { dropStyle, useDropPlacement } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { FIND_DEF, FindDialog, GotoDialog, OverDialog, PostDialog, SelectDialog, ShiftDialog, SortDialog, type FindSt } from "./CmdDialogs";
import type { Tip } from "../../lib/codecAdv";
import InfoTip from "../InfoTip";
import { IbRows, IbSelect, IbShiftTime, IbWand, IcChevronDown, IcClock, IcSearch } from "../icons";

export type LineCtx = {
  doc: SubDoc | null;
  sel: number[];
  active: number | null;
  fr: Framerate | null;
  /** เหตุผลที่ยังใช้เวลาของเฟรมไม่ได้ · ว่าง = ใช้ได้ */
  frWhy: string;
  /** เฟรมที่ภาพแสดงอยู่ */
  pos: number | null;
  keys: number[];
  delay: number;
  /** ช่องพิมพ์ข้อความของบรรทัด ใช้หาตำแหน่งเคอร์เซอร์ตอนแยกบรรทัด */
  textBox: RefObject<HTMLElement | null>;
};
type Item = { label: string; key?: string; why?: string; run: () => void; data: string };
/** แถวในเมนู ปุ่มเดียวหรือคู่ซ้ายขวา (คำสั่งที่เป็นคู่กัน เมนูสั้นลงจนไม่ต้องเลื่อนที่หน้าต่าง 1280 × 800) */
type MRow = Item | [Item, Item];
type Msg = { t: string; bad: boolean } | null;
const n0 = (n: number) => n.toLocaleString("en-US");

const TIME_TIP: Tip = {
  w: "คำสั่งที่ใช้เฟรมของภาพหนังตั้งเวลาให้บรรทัดที่เลือก เลื่อนภาพไปเฟรมที่ต้องการก่อนแล้วค่อยกด เลิกทำได้ทุกคำสั่ง",
  o: [
    ["สอดเวลาเริ่มกับภาพ", "บรรทัดที่เลือกเริ่มที่เฟรมที่ภาพแสดงอยู่ ถ้าเวลาจบอยู่ก่อนเฟรมนั้น เวลาจบเลื่อนตามมาด้วย", "ตั้งเวลาเริ่มตรงเฟรมที่คนเริ่มพูดได้แม่น", ""],
    ["สอดเวลาจบกับภาพ", "บรรทัดที่เลือกจบที่เฟรมที่ภาพแสดงอยู่ ถ้าเวลาเริ่มอยู่หลังเฟรมนั้น เวลาเริ่มเลื่อนตามมาด้วย", "ซับหายตรงเฟรมที่ฉากตัด", ""],
    ["สอดเวลาไปยังฉาก", "บรรทัดที่เลือกยาวเต็มฉากที่ภาพแสดงอยู่ ตั้งแต่ keyframe ก่อนหน้าถึงเฟรมก่อน keyframe ถัดไป", "ป้ายหรือคำบรรยายที่ต้องขึ้นตลอดฉาก", "ต้องมี keyframe ของวิดีโอ"],
    ["เลื่อนไปยังเฟรมปัจจุบัน", "เลื่อนบรรทัดที่เลือกไปพร้อมกัน ให้บรรทัดที่กำลังแก้เริ่มที่เฟรมที่แสดง ระยะห่างระหว่างบรรทัดเท่าเดิม", "ซับทั้งช่วงคลาดเท่ากัน แก้ทีเดียว", ""],
    ["ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม", "บรรทัดที่เลือกซึ่งอยู่ติดกัน เวลาเริ่มของแต่ละบรรทัดเปลี่ยนเป็นเวลาจบของบรรทัดก่อน", "ซับไม่กะพริบระหว่างประโยค", ""],
    ["ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ", "บรรทัดที่เลือกซึ่งอยู่ติดกัน เวลาจบของแต่ละบรรทัดเปลี่ยนเป็นเวลาเริ่มของบรรทัดถัดไป", "ซับค้างจนประโยคถัดไปขึ้น", ""],
    ["เรียงบรรทัด", "เรียงลำดับบรรทัดในไฟล์ตามเวลาเริ่ม เวลาจบ หรือช่องอื่น ทั้งไฟล์หรือเฉพาะที่เลือก", "ไฟล์ที่บรรทัดสลับลำดับกันอ่านง่ายขึ้น", ""],
  ],
};
const LINE_TIP: Tip = {
  w: "คำสั่งแก้บรรทัดที่เลือกในตาราง เลิกทำได้ทุกคำสั่ง",
  o: [
    ["แทรกก่อน แทรกหลัง", "เพิ่มบรรทัดว่างก่อนหรือหลังบรรทัดที่กำลังแก้ ยาวไม่เกิน 3 วินาทีและไม่ล้ำบรรทัดข้างเคียง", "", ""],
    ["แทรก ที่เวลาภาพ", "เพิ่มบรรทัดว่างที่เริ่มตรงเฟรมที่ภาพแสดง ยาว 3 วินาที", "ตั้งเวลาจากภาพแล้วค่อยพิมพ์ข้อความ", ""],
    ["ทำสำเนาบรรทัด", "สร้างบรรทัดซ้ำต่อท้ายบรรทัดที่เลือก ทุกช่องเหมือนเดิม", "", ""],
    ["แยกก่อนเฟรมที่แสดง", "แบ่งเป็นสองบรรทัดข้อความเดิม บรรทัดแรกจบที่เฟรมก่อนเฟรมที่แสดง บรรทัดหลังเริ่มที่เฟรมที่แสดง", "เปลี่ยนสีหรือตำแหน่งซับกลางประโยค", ""],
    ["แยกหลังเฟรมที่แสดง", "บรรทัดแรกจบที่เฟรมที่แสดง บรรทัดหลังเริ่มที่เฟรมถัดไป", "", ""],
    ["แยกตรงเคอร์เซอร์ แบ่งเวลาตามความยาวข้อความ", "ตัดข้อความตรงเคอร์เซอร์ในช่องพิมพ์เป็นสองบรรทัด เวลาแบ่งตามสัดส่วนจำนวนตัวอักษรของสองท่อน", "แยกประโยคยาวได้เร็ว", "เวลาเป็นค่าประมาณ ควรฟังแล้วปรับอีกที"],
    ["แยกตรงเคอร์เซอร์ ใช้เวลาเดิมทั้งสองบรรทัด", "ตัดข้อความเป็นสองบรรทัด ทั้งสองบรรทัดเวลาเท่าเดิม", "ไปตั้งเวลาบนคลื่นเสียงเองทีหลัง", ""],
    ["แยกตรงเคอร์เซอร์ ที่เฟรมที่แสดง", "ตัดข้อความเป็นสองบรรทัด บรรทัดแรกจบที่เฟรมที่แสดง บรรทัดหลังเริ่มต่อทันที", "", ""],
    ["รวม ต่อข้อความ", "รวมบรรทัดที่เลือก ถ้าเลือกไว้บรรทัดเดียวรวมกับบรรทัดถัดไป ข้อความต่อกันด้วยเว้นวรรค เวลาตั้งแต่เริ่มบรรทัดแรกถึงเวลาจบที่ช้าที่สุด", "", ""],
    ["รวม เก็บข้อความบรรทัดแรก", "รวมเวลาแบบเดียวกัน แต่เก็บไว้แค่ข้อความของบรรทัดแรก", "ซับซ้ำกันสองบรรทัด", ""],
    ["ย้ายขึ้น ย้ายลง", "เลื่อนบรรทัดที่เลือกขึ้นหรือลงหนึ่งแถวในตาราง เวลาไม่เปลี่ยน", "", ""],
    ["สลับสองบรรทัด", "สลับตำแหน่งในตารางของสองบรรทัดที่เลือก", "", ""],
    ["คัดลอก ตัด วาง", "คัดลอกบรรทัดเป็นข้อความแบบบรรทัด Dialogue ของ ASS วางในหน้านี้หรือใน Aegisub ได้ บรรทัดที่วางแทรกก่อนบรรทัดที่กำลังแก้", "ย้ายบรรทัดข้ามไฟล์ได้ครบทุกช่อง", ""],
    ["วางทับ", "เอาบรรทัดที่คัดลอกไว้ทับบรรทัดที่มีอยู่ทีละบรรทัด เลือกได้ว่าทับช่องไหน", "ยกเวลาจากซับอีกภาษามาใช้ ข้อความเดิมอยู่ครบ", ""],
  ],
};
const SEL_TIP: Tip = {
  w: "เลือกบรรทัดทีละหลายบรรทัด แล้วใช้คำสั่งอื่นกับบรรทัดที่เลือกทั้งหมดทีเดียว",
  o: [
    ["เลือกบรรทัดตามเงื่อนไข", "เลือกบรรทัดที่ข้อความ สไตล์ ตัวละคร หรือเอฟเฟกต์ตรงกับคำที่พิมพ์", "เลือกทุกบรรทัดของตัวละครเดียวกันแล้วเลื่อนเวลาพร้อมกัน", ""],
    ["เลือกบรรทัดที่ขึ้นบนภาพ", "เลือกทุกบรรทัดที่ขึ้นอยู่ในเฟรมที่ภาพแสดง", "", ""],
    ["ไปที่บรรทัดหรือเวลา", "พิมพ์เลขบรรทัดหรือเวลาแล้วกระโดดไปบรรทัดนั้น", "", ""],
  ],
};

/** เมนูของแถบเหนือตาราง · กางตามที่ว่างบนจอ (popup-fit) · Esc ปิดเฉพาะเมนู */
function CmdMenu(p: { label: string; icon: React.ReactNode; title: string; head: string; tip: Tip; sections: MRow[][]; data: string; width: number }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} className="se-vmenuwrap">
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} aria-haspopup="true" aria-expanded={open} title={p.title} onClick={() => setOpen((o) => !o)} data-cmdmenu={p.data}>
        {p.icon}{p.label}<IcChevronDown size={13} />
      </button>
      {open && (
        <div ref={panel} className="menu pop-in se-vmenu se-cmenu" role="menu" aria-label={p.title} style={{ position: "absolute", left: 0, width: p.width, zIndex: "var(--z-menu)" as unknown as number, overflowY: "auto", ...dropStyle(place) }} data-cmdpanel={p.data}>
          <div className="se-vmrow se-cmh"><span className="se-vmh">{p.head}</span><InfoTip title={p.head} tip={p.tip} /></div>
          {p.sections.map((sec, i) => (
            <div key={i} className="se-vmsec">
              {sec.map((row) => {
                const btn = (it: Item) => (
                  <button key={it.data} type="button" role="menuitem" className={"se-vmi" + (it.why ? " off" : "")} aria-disabled={!!it.why || undefined} title={it.why}
                    onClick={() => { if (it.why) return; setOpen(false); it.run(); }} data-cmd={it.data}>
                    <span className="se-cml">{it.label}</span>{it.key && <span className="se-ckey">{it.key}</span>}
                  </button>
                );
                return Array.isArray(row) ? <div key={row[0].data} className="se-vmpair">{btn(row[0])}{btn(row[1])}</div> : btn(row);
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** คำสั่งของบรรทัดทั้งหมด · คืนแถบปุ่ม หน้าต่าง และคีย์ลัดให้หน้าแก้ซับ */
export function useLineCmds(c: LineCtx) {
  const { fr, pos, delay: dl } = c;
  const [dlg, setDlg] = useState<"shift" | "post" | "select" | "find" | "replace" | "over" | "goto" | "sort" | null>(null);
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
  // ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ · ยังไม่มีเอกสาร ตัวแปรข้างล่างยังไม่ถูกสร้าง จึงต้องเช็กก่อน
  useEffect(() => {
    if (!import.meta.env.DEV || !c.doc) return;
    (window as unknown as Record<string, unknown>).__subCmds = { run, findNext, doReplace, doReplaceAll, setFind, setRepl, setFopts, setDlg };
  });

  const doc = c.doc;
  if (!doc) return { bar: null, note: null, dialogs: null, hotkeys: [] as Hotkey[], split: () => {}, join: () => {}, insertAfter: () => {} };
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
        await navigator.clipboard.writeText(copyText(cur(), selSet));
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

  // ---------------------------------------------------------------- ค้นและแทนที่
  const fo = (): FindOpts => ({ ...fopts, find, replace: repl });
  /** หาจุดถัดไปจากจุดที่เจอล่าสุด ถ้าไม่มีเริ่มจากบรรทัดที่กำลังแก้ วนกลับต้นไฟล์ */
  const findNext = () => {
    const d = cur();
    const hits = findAll(d, new Set(getSubEdit().sel), fo());
    if (typeof hits === "string") { setFmsg({ t: hits, bad: true }); return null; }
    if (!hits.length) { setFmsg({ t: "ไม่เจอคำนี้", bad: true }); hit.current = null; return null; }
    const order = new Map(d.events.map((e, i) => [e.id, i]));
    const FI = { text: 0, style: 1, actor: 2, effect: 3 };
    const key = (h: Hit) => [order.get(h.id) ?? 0, FI[h.field], h.at] as const;
    const after = (a: readonly number[], b: readonly number[]) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const h0 = hit.current;
    const from = h0 && order.has(h0.id) ? key(h0) : [(order.get(getSubEdit().active ?? -1) ?? 0), -1, -1] as const;
    const nx = hits.find((h) => after(key(h), from) > 0) ?? hits[0];
    hit.current = nx;
    const line = (order.get(nx.id) ?? 0) + 1;
    pick([nx.id], nx.id);
    setFmsg({ t: `เจอที่บรรทัด ${n0(line)} จากทั้งหมด ${n0(hits.length)} จุด`, bad: false });
    return nx;
  };
  const doReplace = () => {
    const h = hit.current;
    const d = cur();
    // จุดที่เจอล่าสุดยังตรงอยู่ แทนที่แล้วค้นต่อ ไม่งั้นค้นหาจุดแรกก่อน
    const still = h && findAll(d, new Set(getSubEdit().sel), fo());
    if (!h || typeof still === "string" || !still || !still.some((x) => x.id === h.id && x.field === h.field && x.at === h.at)) { findNext(); return; }
    edit("แทนที่", (x) => replaceOne(x, h, fo()));
    const e = getSubEdit().doc?.events.find((x) => x.id === h.id);
    const grow = e ? e[h.field].length - d.events.find((x) => x.id === h.id)![h.field].length : 0;
    hit.current = { ...h, at: h.at + h.len + grow - 1, len: 1 };
    findNext();
  };
  const doReplaceAll = () => {
    const r = replaceAll(cur(), new Set(getSubEdit().sel), fo());
    if (typeof r === "string") { setFmsg({ t: r, bad: true }); return; }
    if (r.n) edit(`แทนที่ทั้งหมด ${r.n} จุด`, () => r.doc);
    hit.current = null;
    setFmsg({ t: r.n ? `แทนที่แล้ว ${n0(r.n)} จุด` : "ไม่เจอคำนี้", bad: !r.n });
  };
  const openFind = (replace: boolean) => {
    // ข้อความที่ลากเลือกไว้ในช่องพิมพ์เป็นคำค้น (แบบ Aegisub)
    const ta = c.textBox.current as HTMLTextAreaElement | null;
    const s = ta && document.activeElement === ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd) : "";
    if (s && !s.includes("\n")) setFind(s);
    setFmsg(null);
    setDlg(replace ? "replace" : "find");
  };

  // ---------------------------------------------------------------- เมนู
  const timeMenu: MRow[][] = [
    [
      { label: "สอดเวลาเริ่มกับภาพ", key: "Ctrl+3", why: noSel ?? noVid, run: run.snapStart, data: "snapstart" },
      { label: "สอดเวลาจบกับภาพ", key: "Ctrl+4", why: noSel ?? noVid, run: run.snapEnd, data: "snapend" },
      { label: "สอดเวลาไปยังฉาก", key: "Ctrl+5", why: noSel ?? noKeys, run: run.snapScene, data: "snapscene" },
      { label: "เลื่อนไปยังเฟรมปัจจุบัน", key: "Ctrl+6", why: noLine ?? noVid, run: run.toFrame, data: "toframe" },
    ],
    [
      { label: "ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม", why: adjWhy, run: () => run.adjoin(true), data: "adjstart" },
      { label: "ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ", why: adjWhy, run: () => run.adjoin(false), data: "adjend" },
    ],
    [{ label: "เรียงบรรทัด…", why: doc.events.length > 1 ? undefined : "มีบรรทัดเดียว", run: () => setDlg("sort"), data: "sort" }],
  ];
  const lineMenu: MRow[][] = [
    [
      [{ label: "แทรกก่อน", why: noLine, run: () => run.insert(false, false), data: "insbefore" },
        { label: "แทรกหลัง", why: noLine, run: () => run.insert(true, false), data: "insafter" }],
      [{ label: "แทรกก่อน ที่เวลาภาพ", why: noLine ?? noVid, run: () => run.insert(false, true), data: "insbeforev" },
        { label: "แทรกหลัง ที่เวลาภาพ", why: noLine ?? noVid, run: () => run.insert(true, true), data: "insafterv" }],
    ],
    [
      { label: "ทำสำเนาบรรทัด", why: noSel, run: () => run.duplicate(0), data: "dup" },
      [{ label: "แยกก่อนเฟรมที่แสดง", key: "Ctrl+D", why: noSel ?? noVid, run: () => run.duplicate(-1), data: "splitbefore" },
        { label: "แยกหลังเฟรมที่แสดง", key: "Ctrl+Shift+D", why: noSel ?? noVid, run: () => run.duplicate(1), data: "splitafter" }],
      { label: "แยกตรงเคอร์เซอร์ แบ่งเวลาตามความยาวข้อความ", why: noLine, run: () => run.split("estimate"), data: "splitest" },
      { label: "แยกตรงเคอร์เซอร์ ใช้เวลาเดิมทั้งสองบรรทัด", why: noLine, run: () => run.split("preserve"), data: "splitkeep" },
      { label: "แยกตรงเคอร์เซอร์ ที่เฟรมที่แสดง", why: noLine ?? noVid, run: () => run.split("video"), data: "splitvid" },
      [{ label: "รวม ต่อข้อความ", why: joinWhy, run: () => run.join(false), data: "joincat" },
        { label: "รวม เก็บข้อความบรรทัดแรก", why: joinWhy, run: () => run.join(true), data: "joinfirst" }],
    ],
    [
      [{ label: "ย้ายขึ้น", key: "Alt+↑", why: noSel, run: () => run.move(-1), data: "moveup" },
        { label: "ย้ายลง", key: "Alt+↓", why: noSel, run: () => run.move(1), data: "movedown" }],
      { label: "สลับสองบรรทัด", why: swapWhy, run: run.swap, data: "swap" },
    ],
    [
      [{ label: "คัดลอก", key: "Ctrl+C", why: noSel, run: () => void run.copy(false), data: "copy" },
        { label: "ตัด", key: "Ctrl+X", why: noSel, run: () => void run.copy(true), data: "cut" }],
      [{ label: "วาง", key: "Ctrl+V", run: () => void run.paste(), data: "paste" },
        { label: "วางทับ…", key: "Ctrl+Shift+V", why: noLine, run: () => void run.pasteOver(), data: "pasteover" }],
      { label: "ลบบรรทัด", key: "Ctrl+Delete", why: noSel, run: run.del, data: "delete" },
    ],
  ];
  const selMenu: MRow[][] = [
    [
      { label: "เลือกบรรทัดตามเงื่อนไข…", run: () => setDlg("select"), data: "select" },
      { label: "เลือกบรรทัดที่ขึ้นบนภาพ", why: noVid, run: run.visible, data: "visible" },
      { label: "เลือกทุกบรรทัด", key: "Ctrl+A", run: () => pick(doc.events.map((e) => e.id), c.active ?? doc.events[0]?.id), data: "all" },
    ],
    [{ label: "ไปที่บรรทัดหรือเวลา…", run: () => setDlg("goto"), data: "goto" }],
  ];

  const bar = (
    <div className="se-cmds" data-se-cmds>
      <button type="button" className="btn btn-ghost btn-sm" title="ค้นหา (Ctrl+F) หรือค้นและแทนที่ (Ctrl+H)" onClick={() => openFind(true)} data-se-find><IcSearch size={15} width={2.2} />ค้นหา</button>
      <button type="button" className="btn btn-ghost btn-sm" title="เลื่อนเวลาของบรรทัดไปข้างหน้าหรือถอยหลัง (Ctrl+I)" onClick={() => setDlg("shift")} data-se-shift><IbShiftTime size={15} />เลื่อนเวลา</button>
      <button type="button" className="btn btn-ghost btn-sm" title="ปรับเวลาทุกบรรทัดตามกติกาของ Aegisub เผื่อหน้า เผื่อท้าย ต่อบรรทัดที่ใกล้กัน ดูดเข้า keyframe" onClick={() => setDlg("post")} data-se-post><IbWand size={15} />ปรับเวลา</button>
      <CmdMenu label="เวลา" icon={<IcClock size={15} />} title="เมนูเวลา สอดเวลากับภาพ ทำให้เวลาต่อกัน เรียงบรรทัด" head="เมนูเวลา" tip={TIME_TIP} sections={timeMenu} data="time" width={330} />
      <CmdMenu label="บรรทัด" icon={<IbRows size={15} />} title="เมนูบรรทัด แทรก แยก รวม ย้าย คัดลอก วาง" head="เมนูบรรทัด" tip={LINE_TIP} sections={lineMenu} data="line" width={460} />
      <CmdMenu label="เลือก" icon={<IbSelect size={15} />} title="เมนูเลือกบรรทัด และไปที่บรรทัดหรือเวลา" head="เมนูเลือก" tip={SEL_TIP} sections={selMenu} data="sel" width={300} />
    </div>
  );

  const dialogs = <>
    <ShiftDialog open={dlg === "shift"} onClose={() => setDlg(null)} frames={!!fr} selCount={c.sel.length} kind={doc.kind}
      onRun={(o: ShiftOpts) => {
        const d = cur(), s = new Set(getSubEdit().sel);
        const first = d.events.findIndex((e) => s.has(e.id));
        const n = o.affect === 0 ? d.events.length : o.affect === 1 ? s.size : first < 0 ? 0 : d.events.length - first;
        edit("เลื่อนเวลา", (x) => shiftTimes(x, s, o, fr, dl));
        setNote({ t: `เลื่อนเวลา ${n0(n)} บรรทัดแล้ว`, bad: false });
        return n;
      }} />
    <PostDialog open={dlg === "post"} onClose={() => setDlg(null)} doc={doc} keys={!!fr && c.keys.length > 0} selCount={c.sel.length}
      onRun={(o: PostOpts) => {
        const r = postProcess(cur(), new Set(getSubEdit().sel), o, fr, c.keys, dl);
        if (typeof r === "string") return r;
        const before = cur();
        const n = r.events.filter((e, i) => e !== before.events[i]).length;
        edit("ปรับเวลาทั้งไฟล์", () => r);
        setNote({ t: n ? `ปรับเวลาแล้ว ${n0(n)} บรรทัด` : "ไม่มีบรรทัดที่ต้องปรับ", bad: false });
        return null;
      }} />
    <SelectDialog open={dlg === "select"} onClose={() => setDlg(null)} ass={ass}
      onRun={(o: SelectOpts) => {
        const r = selectLines(cur(), getSubEdit().sel, o);
        if (typeof r === "string") return r;
        pick(r, r.includes(getSubEdit().active ?? -1) ? getSubEdit().active! : r[0]);
        return r.length ? `เลือกไว้ ${n0(r.length)} บรรทัด` : "ไม่มีบรรทัดที่ตรง";
      }} />
    <FindDialog open={dlg === "find" || dlg === "replace"} replace={dlg === "replace"} onClose={() => setDlg(null)} ass={ass} find={find} repl={repl}
      setFind={(s) => { setFind(s); hit.current = null; }} setRepl={setRepl} opts={fopts} setOpts={(o) => { setFopts(o); hit.current = null; }} msg={fmsg}
      onNext={() => { findNext(); }} onReplace={doReplace} onReplaceAll={doReplaceAll} />
    <OverDialog open={dlg === "over"} onClose={() => setDlg(null)} ass={ass} onRun={doOver} />
    <GotoDialog open={dlg === "goto"} onClose={() => setDlg(null)} onGo={(q) => { const id = gotoTarget(cur(), q); if (id == null) return false; pick([id], id); return true; }} />
    <SortDialog open={dlg === "sort"} onClose={() => setDlg(null)} ass={ass} selCount={c.sel.length}
      onRun={(k: SortKey, only: boolean) => { edit("เรียงบรรทัด", (d) => sortLines(d, k, only ? new Set(getSubEdit().sel) : null)); }} />
  </>;

  const hotkeys: Hotkey[] = [
    { code: "KeyI", ctrl: true, run: () => setDlg("shift") },
    { code: "Digit3", ctrl: true, field: true, run: run.snapStart },
    { code: "Digit4", ctrl: true, field: true, run: run.snapEnd },
    { code: "Digit5", ctrl: true, field: true, run: run.snapScene },
    { code: "Digit6", ctrl: true, field: true, run: run.toFrame },
    { code: "KeyD", ctrl: true, field: true, run: () => run.duplicate(-1) },
    { code: "KeyD", ctrl: true, shift: true, field: true, run: () => run.duplicate(1) },
    { code: "ArrowUp", alt: true, run: () => run.move(-1) },
    { code: "ArrowDown", alt: true, run: () => run.move(1) },
    { code: "KeyC", ctrl: true, run: () => void run.copy(false) },
    { code: "KeyX", ctrl: true, run: () => void run.copy(true) },
    { code: "KeyV", ctrl: true, run: () => void run.paste() },
    { code: "KeyV", ctrl: true, shift: true, run: () => void run.pasteOver() },
    { code: "Delete", ctrl: true, run: run.del },
    { code: "KeyF", ctrl: true, field: true, run: () => openFind(false) },
    { code: "KeyH", ctrl: true, field: true, run: () => openFind(true) },
    { code: "F3", field: true, run: () => { if (find) findNext(); else openFind(false); } },
  ];

  /** ผลของคำสั่ง ขึ้นแทนที่ตัวนับบรรทัดชั่วคราว แถบไม่แน่นขึ้น */
  const noteEl = note ? <span className={"small se-cnote" + (note.bad ? " bad" : "")} role={note.bad ? "alert" : "status"} title={note.t} data-se-cnote>{note.t}</span> : null;
  return { bar, note: noteEl, dialogs, hotkeys, split: run.split, join: run.join, insertAfter: () => run.insert(true, false) };
}
