/* แบบ notepad แก้ซับทั้งไฟล์ด้วยมือ (แผนหน้าแก้ซับ ขั้น 8 · BUGS ข้อ 109 · แบบ 3 ที่พี่กันเคาะ)
   ข้อความทั้งไฟล์ตามที่จะบันทึก (subdoc_render) แก้ได้ทุกตัวอักษร พิมพ์หยุดครู่หนึ่งแล้วแปลงกลับเป็นเอกสาร (subdoc_parse_text)
   ในช่องพิมพ์ตัวจบบรรทัดเป็น \n เสมอ (ช่องพิมพ์ของหน้าเว็บแปลง \r\n เอง) ตอนแปลงกลับใส่ตัวจบบรรทัดของไฟล์คืน ไฟล์ที่ปนสองแบบจะเหลือแบบหลักแบบเดียวหลังแก้ในแบบนี้
   การแก้ตั้งแต่เข้าแบบนี้จนออกรวมเป็นขั้นเลิกทำเดียว (edit sticky) · Ctrl+Z ในช่องพิมพ์เป็นเลิกทำของช่องพิมพ์เอง
   บรรทัดที่อ่านไม่ออก (เวลาผิดรูปแบบ) ไม่หาย ตัวอ่านเก็บไว้ทั้งบรรทัดและเขียนกลับตามเดิม · รหัสบรรทัดที่ข้อความไม่เปลี่ยนคงเดิม ตารางจึงยังจำแถวที่แก้
   ด้านขวา ภาพหนังของบรรทัดที่เคอร์เซอร์อยู่ กับรายการปัญหา (เวลาผิดรูปแบบ เวลาจบก่อนเริ่ม เวลาซ้อน อ่านไม่ทัน) กดแล้วไปบรรทัดนั้น */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { subDocApi, type SubDoc, type SubEvent } from "../../lib/api";
import { edit, getSubEdit } from "../../lib/subEdit";
import { isAss, parseTime, plain } from "../../lib/subText";
import type { Tip } from "../../lib/codecAdv";
import InfoTip from "../InfoTip";
import { Skel } from "../ui";
import { CPS_MAX } from "./SubGrid";

let pending: (() => Promise<void>) | null = null;
/** ใส่ข้อความที่พิมพ์ค้างลงเอกสารทันที (ก่อนบันทึก) */
export const flushPad = () => (pending ? pending() : Promise.resolve());

const key = (e: SubEvent) => JSON.stringify([e.comment, e.layer, e.start, e.end, e.style, e.actor, e.marginL, e.marginR, e.marginV, e.effect, e.text, e.ident, e.suffix]);
/** รหัสบรรทัดเดิม ① บรรทัดที่ทุกช่องไม่เปลี่ยน ไล่ตามลำดับ มองข้างหน้าไม่เกิน 60 บรรทัด
    ② ช่วงระหว่างบรรทัดที่ตรงกันสองบรรทัด ถ้าจำนวนบรรทัดที่ไม่ตรงทั้งสองฝั่งเท่ากัน ถือว่าเป็นบรรทัดเดิมที่ถูกแก้ จับคู่ตามลำดับ
       ตารางจึงยังจำว่าบรรทัดนั้นแก้แล้ว และแสดงต้นฉบับได้ · จำนวนไม่เท่ากัน (เพิ่มหรือลบบรรทัด) บรรทัดในช่วงนั้นได้รหัสใหม่ */
export function keepIds(base: SubDoc, parsed: SubDoc): SubDoc {
  let n = 0;
  for (const e of base.events) n = Math.max(n, e.id);
  for (const s of base.styles) n = Math.max(n, s.id);
  for (const e of parsed.events) n = Math.max(n, e.id);
  for (const s of parsed.styles) n = Math.max(n, s.id);
  const to: (number | null)[] = parsed.events.map(() => null);
  let j = 0;
  parsed.events.forEach((e, i) => {
    const k = key(e);
    for (let s = j; s < Math.min(base.events.length, j + 60); s++) if (key(base.events[s]) === k) { to[i] = s; j = s + 1; return; }
  });
  // ช่วงที่ไม่ตรง ระหว่างคู่ที่ตรงกัน (รวมหัวกับท้าย)
  let pi = -1, bi = -1;
  for (let i = 0; i <= parsed.events.length; i++) {
    if (i < parsed.events.length && to[i] == null) continue;
    const bNext = i < parsed.events.length ? (to[i] as number) : base.events.length;
    if (i - pi - 1 > 0 && i - pi - 1 === bNext - bi - 1) for (let k = 1; k < i - pi; k++) to[pi + k] = bi + k;
    pi = i; bi = bNext;
  }
  const events = parsed.events.map((e, i) => ({ ...e, id: to[i] == null ? ++n : base.events[to[i] as number].id }));
  const styles = parsed.styles.map((s) => { const o = base.styles.find((x) => x.fields[0] === s.fields[0]); return { ...s, id: o ? o.id : ++n }; });
  return { ...parsed, events, styles };
}

/** เวลาแบบที่ตัวอ่าน ASS ของ Aegisub อ่าน (subdoc.rs parse_time) ตัวที่ไม่ใช่ตัวเลขข้ามไป · ไว้บอกว่าเวลาที่เขียนผิดรูปแบบถูกอ่านเป็นเท่าไหร่ */
export function aegTime(text: string): number {
  let time = 0, cur = 0, after = -1;
  for (const c of text) {
    if (c === ":") { time = time * 60 + cur; cur = 0; }
    else if (c === "." || c === ",") { time = (time * 60 + cur) * 1000; cur = 0; after = 100; }
    else if (c >= "0" && c <= "9") { const d = c.charCodeAt(0) - 48; if (after < 0) cur = cur * 10 + d; else { time += d * after; after = Math.floor(after / 10); } }
  }
  if (after < 0) time = (time * 60 + cur) * 1000;
  return Math.min(Math.max(time, 0), 36_000_000 - 6);
}
const assTimeOk = (s: string) => /^\s*\d+:\d{1,2}:\d{1,2}([.,]\d+)?\s*$/.test(s);
const hms = (ms: number) => `${Math.floor(ms / 3_600_000)}:${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 10)).padStart(2, "0")}`;

/** detail บรรทัดที่สองของรายการ (เช่นเวลาที่อ่านได้) แสดงเป็นก้อนเดียวไม่ตัดกลางตัวเลข */
export type Prob = { line: number; kind: "time" | "order" | "overlap" | "fast" | "cut"; msg: string; detail?: string };
/** ปัญหาในข้อความทั้งไฟล์ · line เริ่มที่ 1
    ASS เวลาที่เขียนผิดรูปแบบ ตัวอ่านแบบ Aegisub ยังอ่านได้ (ข้ามตัวที่ไม่ใช่ตัวเลข) บรรทัดยังอยู่ในตาราง จึงบอกเวลาที่อ่านได้ แล้วตรวจข้ออื่นต่อด้วยเวลานั้น
    SRT บรรทัดเวลาที่ผิดรูปแบบตัวอ่านไม่รับ บล็อกนั้นไม่ขึ้นในตาราง แต่ยังอยู่ในไฟล์ */
export function problems(text: string, ass: boolean): Prob[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Prob[] = [];
  const prevEnd = new Map<number, number>();
  const timed = (i: number, start: number | null, end: number | null, layer: number, body: string, comment: boolean) => {
    if (start == null || end == null) { out.push({ line: i + 1, kind: "time", msg: "รูปแบบเวลาผิด บล็อกนี้ไม่ขึ้นในตาราง" }); return; }
    if (end < start) { out.push({ line: i + 1, kind: "order", msg: "เวลาจบก่อนเวลาเริ่ม" }); return; }
    if (comment) return;
    const p = prevEnd.get(layer);
    if (p != null && start < p) out.push({ line: i + 1, kind: "overlap", msg: "เวลาเริ่มซ้อนกับบรรทัดก่อน" });
    prevEnd.set(layer, end);
    const c = plain(body).length / (Math.max(10, end - start) / 1000);
    if (c > CPS_MAX) out.push({ line: i + 1, kind: "fast", msg: `อ่านไม่ทัน ${Math.round(c)} ตัวต่อวินาที` });
  };
  if (ass) {
    let inEv = false;
    lines.forEach((l, i) => {
      if (/^\s*\[.*\]\s*$/.test(l)) { inEv = /^\s*\[events\]\s*$/i.test(l); return; }
      if (!inEv) return;
      const m = /^\s*(Dialogue|Comment)\s*:\s*(.*)$/i.exec(l);
      if (!m) return;
      const f = m[2].split(",");
      if (f.length < 10) { out.push({ line: i + 1, kind: "cut", msg: "ช่องไม่ครบ 10 ช่อง" }); return; }
      const s = aegTime(f[1]), e = aegTime(f[2]);
      if (!assTimeOk(f[1]) || !assTimeOk(f[2])) out.push({ line: i + 1, kind: "time", msg: "รูปแบบเวลาผิด", detail: `อ่านได้เป็น ${hms(s)} ถึง ${hms(e)}` });
      timed(i, s, e, parseInt(f[0], 10) || 0, f.slice(9).join(","), m[1].toLowerCase() === "comment");
    });
  } else {
    lines.forEach((l, i) => {
      if (!l.includes("-->")) return;
      const [a, b] = l.split("-->");
      const body: string[] = [];
      for (let k = i + 1; k < lines.length && lines[k].trim(); k++) body.push(lines[k]);
      timed(i, parseTime(a), parseTime((b ?? "").trim().split(/\s+/)[0] ?? ""), 0, body.join(""), false);
    });
  }
  return out;
}
/** เวลาเริ่มของบรรทัดที่เคอร์เซอร์อยู่ ASS บรรทัด Dialogue SRT บรรทัดเวลาเหนือเคอร์เซอร์ในบล็อกเดียวกัน */
function startAt(lines: string[], row: number, ass: boolean): number | null {
  if (ass) { const m = /^\s*(Dialogue|Comment)\s*:\s*(.*)$/i.exec(lines[row] ?? ""); return m ? parseTime(m[2].split(",")[1] ?? "") : null; }
  for (let i = row; i >= 0 && (i === row || lines[i].trim()); i--) if (lines[i].includes("-->")) return parseTime(lines[i].split("-->")[0]);
  for (let i = row + 1; i < lines.length && lines[i].trim(); i++) if (lines[i].includes("-->")) return parseTime(lines[i].split("-->")[0]);
  return null;
}

const PAD_TIP: Tip = {
  w: "ข้อความทั้งไฟล์ตามที่จะบันทึก แก้ได้ทุกตัวอักษรเหมือนเปิดใน notepad พิมพ์หยุดครู่หนึ่งแล้วตารางกับช่องแก้บรรทัดเปลี่ยนตาม การแก้ทั้งหมดตั้งแต่เข้าแบบนี้รวมเป็นขั้นเลิกทำเดียว ปุ่มเลิกทำด้านบนย้อนได้ทีเดียว",
  o: [
    ["รูปแบบเวลาผิด", "ไฟล์ ASS อ่านแบบ Aegisub โดยข้ามตัวที่ไม่ใช่ตัวเลข บรรทัดยังอยู่ในตารางด้วยเวลาที่อ่านได้ ซึ่งอาจไม่ใช่เวลาที่ตั้งใจ ส่วนไฟล์ SRT บล็อกที่อ่านเวลาไม่ออกไม่ขึ้นในตาราง แต่ยังอยู่ในไฟล์ตอนบันทึก ไม่หาย", "", ""],
    ["เวลาซ้อน", "เวลาเริ่มอยู่ก่อนเวลาจบของบรรทัดก่อนในชั้นเดียวกัน ซับสองบรรทัดขึ้นพร้อมกัน", "", ""],
    ["อ่านไม่ทัน", `ตัวอักษรต่อวินาทีเกิน ${CPS_MAX} คนดูอ่านไม่ทันก่อนซับหาย`, "", ""],
  ],
  r: "กดปัญหาในรายการเพื่อไปบรรทัดนั้น",
};

export default function PadView(p: { doc: SubDoc; delay: number; video: React.ReactNode; onSeek: (ms: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [row, setRow] = useState(0);
  const applied = useRef<SubDoc | null>(null);
  const baseText = useRef<string | null>(null);
  const session = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const gut = useRef<HTMLPreElement>(null);
  const ass = isAss(p.doc);
  // สูงเต็มที่ว่างที่เหลือของกรอบหน้า หน้าไม่ต้องเลื่อน · วิธีเดียวกับตารางของหน้าแก้ซับ (SubEditor fit)
  // ใต้กรอบนี้ = ของในการ์ดใต้กรอบนี้ บวกขอบล่างของทุกชั้นตั้งแต่การ์ดถึงกรอบหน้า · ไม่ใช้เลขหักขอบตายตัว (เดิมหัก 24 จุด หน้าเลื่อนเกิน 8 จุด)
  // ไม่ใช้ความสูงเนื้อหาทั้งหมดของกรอบหน้า ตอนเนื้อหาสั้นกว่าจอค่านั้นเท่าจอ กรอบไม่ขยายตาม (ลองแล้วค้างที่ 420 จุดทั้งที่หน้าต่าง 1920 × 1032)
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(420);
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current, card = el?.closest<HTMLElement>("[data-subedit]"), sc = card?.closest<HTMLElement>(".pagewrap");
      if (!el || !card || !sc) return;
      const r = el.getBoundingClientRect();
      let extra = card.getBoundingClientRect().bottom - r.bottom;
      for (let e: HTMLElement | null = card; e && e !== sc; e = e.parentElement) {
        extra += parseFloat(getComputedStyle(e).marginBottom) || 0;
        const pr = e.parentElement;
        if (pr) { const ps = getComputedStyle(pr); extra += (parseFloat(ps.paddingBottom) || 0) + (pr === sc ? 0 : parseFloat(ps.borderBottomWidth) || 0); }
      }
      const top = r.top - sc.getBoundingClientRect().top - sc.clientTop + sc.scrollTop;
      setH(Math.max(300, Math.floor(sc.clientHeight - top - Math.max(0, extra))));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [text == null]);

  // เข้าแบบนี้ หรือเอกสารเปลี่ยนจากที่อื่น (เลิกทำ ทำซ้ำ) วาดข้อความใหม่ แล้วนับเป็นการแก้รอบใหม่
  useEffect(() => {
    if (p.doc === applied.current) return;
    let live = true;
    // ช่องพิมพ์ของหน้าเว็บเก็บตัวจบบรรทัดเป็น \n เสมอ (\r\n ถูกแปลงเอง) จึงแสดงแบบ \n แล้วคืนเป็นตัวจบบรรทัดของไฟล์ตอนแปลงกลับ
    subDocApi.render(p.doc).then((r) => { if (!live) return; const t = r.replace(/\r\n?/g, "\n"); applied.current = p.doc; baseText.current = t; latest.current = t; setText(t); session.current++; });
    return () => { live = false; };
  }, [p.doc]);

  const commit = async () => {
    window.clearTimeout(timer.current);
    pending = null;
    const t = latest.current, base = getSubEdit().doc;
    if (t == null || !base || base !== applied.current || t === baseText.current) return;
    // คืนตัวจบบรรทัดของไฟล์ (เช่น \r\n) ไม่งั้นบันทึกแล้วไฟล์เปลี่ยนตัวจบบรรทัดทั้งไฟล์
    const parsed = await subDocApi.parseText(base.eol === "\n" ? t : t.replace(/\n/g, base.eol), base.kind, base.enc, base.source);
    if (getSubEdit().doc !== base) return;
    const next = keepIds(base, { ...parsed, exact: base.exact });
    applied.current = next;
    baseText.current = t;
    // บรรทัดที่เลือกหายไป เลือกบรรทัดที่อยู่ตำแหน่งเดิม
    const st = getSubEdit();
    const keepSel = st.active != null && next.events.some((e) => e.id === st.active);
    const at = Math.max(0, base.events.findIndex((e) => e.id === st.active));
    const fallback = next.events[Math.min(at, next.events.length - 1)]?.id ?? null;
    edit("แก้ในแบบ notepad", () => next, { merge: `pad:${session.current}`, sticky: true, ...(keepSel ? {} : { sel: fallback == null ? [] : [fallback], active: fallback }) });
  };
  const change = (t: string) => {
    setText(t);
    latest.current = t;
    window.clearTimeout(timer.current);
    pending = commit;
    timer.current = window.setTimeout(() => void commit(), 500);
  };
  // ออกจากแบบนี้ (สลับแบบ เปลี่ยนหน้า) ใส่ที่พิมพ์ค้างลงเอกสาร
  useEffect(() => () => { if (pending) void pending(); }, []);

  const lines = useMemo(() => (text ?? "").split(/\r\n|\r|\n/), [text]);
  const [probs, setProbs] = useState<Prob[]>([]);
  useEffect(() => { const t = window.setTimeout(() => setProbs(problems(text ?? "", ass)), 250); return () => window.clearTimeout(t); }, [text, ass]);
  const nums = useMemo(() => lines.map((_, i) => i + 1).join("\n"), [lines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const where = () => {
    const t = ta.current;
    if (!t) return;
    const r = t.value.slice(0, t.selectionStart).split(/\r\n|\r|\n/).length - 1;
    if (r === row) return;
    setRow(r);
    const ms = startAt(t.value.split(/\r\n|\r|\n/), r, ass);
    if (ms != null) p.onSeek(ms);
  };
  const go = (line: number) => {
    const t = ta.current;
    if (!t) return;
    const at = lines.slice(0, line - 1).reduce((a, l) => a + l.length + 1, 0);
    t.focus();
    t.setSelectionRange(at, at + (lines[line - 1]?.length ?? 0));
    const lh = parseFloat(getComputedStyle(t).lineHeight) || 21;
    t.scrollTop = Math.max(0, (line - 1) * lh - t.clientHeight / 3);
    where();
  };

  if (text == null) return <div className="se-pad2"><Skel w="100%" h={300} /></div>;
  return (
    <div ref={box} className="se-pad2" style={{ height: h }} data-notepad-view>
      <div className="se-padmain">
        <pre ref={gut} className="se-padgut" aria-hidden="true">{nums}</pre>
        <textarea ref={ta} className="se-padtext" value={text} spellCheck={false} wrap="off" aria-label="ข้อความทั้งไฟล์" data-pad-text
          onChange={(e) => change(e.target.value)} onSelect={where} onClick={where} onKeyUp={where}
          onScroll={(e) => { if (gut.current) gut.current.scrollTop = e.currentTarget.scrollTop; }}
          // Ctrl+Z Ctrl+Y ในช่องนี้เป็นเลิกทำของช่องพิมพ์ ไม่ใช่เลิกทำทั้งเอกสาร
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && (e.code === "KeyZ" || e.code === "KeyY")) e.stopPropagation(); }} />
      </div>
      <div className="se-padside">
        {p.video}
        <div className="se-padhead"><b>{probs.length ? `ปัญหา ${probs.length.toLocaleString("en-US")} จุด` : "ไม่มีปัญหา"}</b><InfoTip title="แบบ notepad" tip={PAD_TIP} /></div>
        <div className="small se-padsum">{`${lines.length.toLocaleString("en-US")} บรรทัด ${p.doc.kind.toUpperCase()} รหัส ${p.doc.enc.charset}  เคอร์เซอร์บรรทัด ${(row + 1).toLocaleString("en-US")}`}</div>
        <div className="se-padprobs" role="list" data-pad-probs>
          {probs.length === 0 ? <div className="small se-padnone"><span>ไม่มีเวลาผิดรูปแบบหรือเวลาซ้อน</span><span>และไม่มีบรรทัดที่อ่านไม่ทัน</span></div>
            : probs.slice(0, 300).map((x, i) => (
              <button key={i} type="button" role="listitem" className={`se-padprob se-pp-${x.kind}`} onClick={() => go(x.line)} data-pad-prob={x.kind} data-line={x.line}>
                <span className="se-ppl">{`บรรทัด ${x.line.toLocaleString("en-US")}`}</span><span className="se-ppm">{x.msg}{x.detail && <span className="se-ppd">{x.detail.split(" ถึง ").map((s, k) => <span key={k} className="keep">{k ? ` ถึง ${s}` : s}</span>)}</span>}</span>
              </button>
            ))}
          {probs.length > 300 && <div className="small">{`แสดง 300 จุดแรกจาก ${probs.length.toLocaleString("en-US")} จุด`}</div>}
        </div>
      </div>
    </div>
  );
}
