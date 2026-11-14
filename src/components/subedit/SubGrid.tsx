/* ตารางบรรทัดซับของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · BUGS ข้อ 109)
   แถวละหนึ่งบรรทัดแบบตารางของ Aegisub ขึ้นบรรทัดในซับแสดงเป็น ↵ แถวสูงเท่ากันทุกแถว
   วาดเฉพาะแถวที่เห็นกับเผื่อบนล่าง ที่เหลือเป็นแถวเว้นที่สูงเท่าแถวจริง (สกิล sidebar-slide ข้อ 3 ②) ไฟล์ 2,000 บรรทัดไม่หน่วง
   กดเลือกแถวเดียว Ctrl เลือกเพิ่มหรือเอาออก Shift เลือกเป็นช่วง · ลูกศรบนล่าง Home End PageUp PageDown ย้ายบรรทัด Ctrl+A เลือกทั้งหมด
   แถวที่แก้แล้วยังไม่บันทึกมีแถบสีหน้าแถว · บรรทัดความคิดเห็นของ ASS จาง มีป้าย
   เวลาเริ่มซ้อนบรรทัดก่อน กับอ่านไม่ทัน (เกิน 20 ตัวต่อวินาที) ช่องนั้นเป็นสีเตือนแบบตัวดูซับเดิม */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SubDoc, SubEvent } from "../../lib/api";
import { isEdited } from "../../lib/subEdit";
import { cps, fmtTime, gridText, isAss, type TagMode } from "../../lib/subText";
import type { Framerate } from "../../lib/vidFrames";

const ROW = 30;
/** เผื่อแถวบนล่างนอกกรอบ ราวหนึ่งกรอบ (สกิล sidebar-slide เผื่ออย่างน้อย 400 จุด) */
const PAD = 16;
/** ตัวอักษรต่อวินาทีที่เกินแล้วอ่านไม่ทัน แบบตัวดูซับเดิม */
export const CPS_MAX = 20;

/** แท็กในตารางเป็นสีจาง แยกจากข้อความที่คนอ่าน (ฟอนต์ Sarabun วาดปีกกาคล้ายวงเล็บ อ่านปนกับข้อความ) · ↵ กับ ☀ ก็จางด้วย */
function tagged(t: string, ass: boolean) {
  const parts = t.split(ass ? /(\{[^}]*\}|☀| ↵ )/ : /(<[^>]+>|☀| ↵ )/);
  return parts.map((s, i) => (i % 2 ? <span key={i} className="se-tag">{s}</span> : s));
}

export default function SubGrid(p: {
  doc: SubDoc;
  sel: number[];
  active: number | null;
  tags: TagMode;
  /** เลือกแถว · ids ทั้งหมดที่เลือก กับแถวที่กำลังแก้ */
  onSelect: (ids: number[], active: number) => void;
  height: number;
  /** โหมดเฟรมของช่องแก้บรรทัด ตารางแสดงเลขเฟรมด้วยแบบ Aegisub (SetByFrame) · null = แสดงเวลา */
  fr: Framerate | null;
  delayMs: number;
  /** ลูกศรซ้ายขวาในตาราง เดินภาพหนังทีละเฟรม (ตารางของ Aegisub ใช้ปุ่มชุดเดียวกับกรอบวิดีโอ) */
  onSideKey: (e: React.KeyboardEvent) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const ev = p.doc.events;
  const ass = isAss(p.doc);
  const sel = useMemo(() => new Set(p.sel), [p.sel]);
  const at = ev.findIndex((e) => e.id === p.active);
  /** บรรทัดที่เวลาเริ่มซ้อนกับบรรทัดก่อนในเลเยอร์เดียวกัน (ข้ามบรรทัดความคิดเห็น) · คิดรอบเดียวต่อเอกสาร
   *  ASS ป้ายในฉากกับซับพูดคนละเลเยอร์ตั้งใจให้ขึ้นพร้อมกัน ไม่นับว่าซ้อน */
  const overlaps = useMemo(() => {
    const s = new Set<number>();
    const prevEnd = new Map<number, number>();
    for (const x of ev) {
      if (x.comment) continue;
      const p = prevEnd.get(x.layer);
      if (p != null && x.start < p) s.add(x.id);
      prevEnd.set(x.layer, x.end);
    }
    return s;
  }, [ev]);

  // แถวที่กำลังแก้อยู่นอกกรอบ เลื่อนให้เห็น ค่อนไปทางบนหนึ่งในสาม
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || at < 0) return;
    const y = at * ROW, h = el.clientHeight - ROW;
    if (y < el.scrollTop || y + ROW > el.scrollTop + h) { el.scrollTop = Math.max(0, y - Math.round(h / 3)); setTop(el.scrollTop); }
  }, [at]);
  useEffect(() => { const el = box.current; if (el) setTop(el.scrollTop); }, [p.height]);

  const first = Math.max(0, Math.floor(top / ROW) - PAD);
  const last = Math.min(ev.length, Math.ceil((top + p.height) / ROW) + PAD);

  // จุดตั้งต้นของการเลือกช่วงด้วย Shift (extendRow ของ Aegisub base_grid.cpp) ตามแถวที่กำลังแก้ ยกเว้นตอนขยายช่วงด้วย Shift
  // เดิมนับจากแถวที่กำลังแก้ซึ่งย้ายไปปลายช่วงทุกครั้ง กด Shift ลงห้าครั้งได้แค่สองบรรทัดท้าย (ผู้ช่วยตรวจทาน F19)
  const anchor = useRef<number | null>(p.active ?? null);
  const extending = useRef(false);
  useEffect(() => { if (!extending.current) anchor.current = p.active ?? null; extending.current = false; }, [p.active]);
  const pick = (i: number, e: React.MouseEvent | null) => {
    const id = ev[i].id;
    if (e?.shiftKey && at >= 0) {
      const k = anchor.current == null ? -1 : ev.findIndex((x) => x.id === anchor.current);
      const s = k >= 0 ? k : at;
      const [a, b] = s < i ? [s, i] : [i, s];
      // แถวที่กำลังแก้ไม่เปลี่ยน ตัวดักข้างบนไม่ทำงาน ไม่ต้องตั้งธง ไม่งั้นค้างไปกันการเปลี่ยนครั้งถัดไป
      extending.current = id !== p.active;
      p.onSelect(ev.slice(a, b + 1).map((x) => x.id), id);
    } else if (e && (e.ctrlKey || e.metaKey)) {
      // Ctrl คลิกบรรทัดเดียวที่เลือกอยู่ ไม่เอาออก ไม่งั้นไม่มีบรรทัดที่เลือกแต่ช่องแก้ยังแสดงบรรทัดนั้น (base_grid.cpp ของ Aegisub · ผู้ช่วยตรวจทาน F21)
      if (sel.has(id) && p.sel.length === 1) return;
      p.onSelect(sel.has(id) ? p.sel.filter((x) => x !== id) : [...p.sel, id], id);
    } else p.onSelect([id], id);
  };
  const onKey = (e: React.KeyboardEvent) => {
    // Alt กับลูกศรขึ้นลงเป็นคีย์ลัดย้ายบรรทัดของหน้า (grid/move/up down ของ Aegisub) ไม่ใช่เลื่อนแถวที่เลือก
    if (!ev.length || (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown"))) return;
    const page = Math.max(1, Math.floor(p.height / ROW) - 1);
    const go = (i: number) => { e.preventDefault(); const k = Math.max(0, Math.min(ev.length - 1, i)); if (e.shiftKey && at >= 0) pick(k, { shiftKey: true } as React.MouseEvent); else p.onSelect([ev[k].id], ev[k].id); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "PageDown") go(at + page);
    else if (e.key === "PageUp") go(at - page);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(ev.length - 1);
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") { e.preventDefault(); p.onSelect(ev.map((x) => x.id), p.active ?? ev[0].id); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") p.onSideKey(e);
  };
  const fr = p.fr, dl = p.delayMs;
  const tStart = (x: SubEvent) => (fr ? String(fr.frameAt(x.start + dl, "start")) : fmtTime(x.start, p.doc.kind));
  const tEnd = (x: SubEvent) => (fr ? String(fr.frameAt(x.end + dl, "end")) : fmtTime(x.end, p.doc.kind));
  const tDur = (x: SubEvent) => (fr ? String(fr.frameAt(x.end + dl, "end") - fr.frameAt(x.start + dl, "start") + 1) : ((x.end - x.start) / 1000).toFixed(2));

  const cols = ass ? 9 : 6;
  return (
    <div className="se-grid" ref={box} style={{ height: p.height }} tabIndex={0} onKeyDown={onKey} onScroll={(e) => setTop(e.currentTarget.scrollTop)} data-sub-table aria-label="ตารางบรรทัดซับ">
      <table>
        <colgroup>
          <col style={{ width: 52 }} />
          {ass && <col style={{ width: 34 }} />}
          <col style={{ width: ass ? 86 : 104 }} /><col style={{ width: ass ? 86 : 104 }} /><col style={{ width: 58 }} /><col style={{ width: 54 }} />
          {ass && <><col style={{ width: 110 }} /><col style={{ width: 96 }} /></>}
          <col />
        </colgroup>
        <thead><tr>
          <th className="num">ลำดับ</th>{ass && <th className="num" title="เลเยอร์">ชั้น</th>}<th className="num">เริ่ม</th><th className="num">จบ</th><th className="num">ยาว</th><th className="num">ตัว/วิ</th>
          {ass && <><th>สไตล์</th><th>ตัวละคร</th></>}<th>ข้อความ</th>
        </tr></thead>
        <tbody>
          {first > 0 && <tr className="se-gap" style={{ height: first * ROW }}><td colSpan={cols} /></tr>}
          {ev.slice(first, last).map((x, k) => {
            const i = first + k;
            const overlap = overlaps.has(x.id);
            const c = cps(x), fast = !x.comment && c > CPS_MAX;
            const cls = [i === at ? "on" : sel.has(x.id) ? "sel" : "", x.comment ? "se-cmt" : "", isEdited(x) ? "se-edited" : ""].filter(Boolean).join(" ");
            return (
              <tr key={x.id} className={cls} data-i={i} data-id={x.id} onMouseDown={(e) => { if (e.button === 0) { box.current?.focus({ preventScroll: true }); pick(i, e); } }}>
                <td className="num">{i + 1}</td>
                {ass && <td className="num">{x.layer}</td>}
                <td className={"num" + (overlap ? " bad" : "")} title={overlap ? "เวลาเริ่มซ้อนกับบรรทัดก่อน" : undefined}>{tStart(x)}</td>
                <td className="num">{tEnd(x)}</td>
                <td className="num">{tDur(x)}</td>
                <td className={"num" + (fast ? " bad" : "")} title={fast ? `อ่านไม่ทัน เกิน ${CPS_MAX} ตัวอักษรต่อวินาที` : undefined}>{Math.round(c)}</td>
                {ass && <><td className="se-cut" title={x.style}>{x.style}</td><td className="se-cut" title={x.actor}>{x.actor}</td></>}
                <td className="se-cut se-txt">{x.comment && <span className="se-cmtpill">ความคิดเห็น</span>}{tagged(gridText(x.text, p.doc, p.tags), ass)}</td>
              </tr>
            );
          })}
          {last < ev.length && <tr className="se-gap" style={{ height: (ev.length - last) * ROW }}><td colSpan={cols} /></tr>}
        </tbody>
      </table>
    </div>
  );
}
