/* หน้าต่างของคำสั่งเวลาและแก้ไขในหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 6 · BUGS ข้อ 109)
   เลื่อนเวลา (dialog_shift_times.cpp) · ปรับเวลาทั้งไฟล์ (dialog_timing_processor.cpp) · เลือกบรรทัด (dialog_selection.cpp)
   ค้นและแทนที่ (dialog_search_replace.cpp) · วางทับ (dialog_paste_over.cpp) · ไปที่บรรทัดหรือเวลา · เรียงบรรทัด
   ค่าที่ตั้งล่าสุดจำในเครื่องของผู้ชมแบบที่ Aegisub จำ · ตัวหน้าต่างไม่แก้เอกสารเอง ส่งค่าให้หน้าแก้ซับ */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { SubDoc } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { fmtTime, isAss, parseTime } from "../../lib/subText";
import { OVER_FIELDS, POST_DEFAULT, type Field, type FindOpts, type MatchMode, type OverField, type PostOpts, type SelectOpts, type ShiftOpts, type SortKey } from "../../lib/subCmds";
import Dialog from "../Dialog";
import InfoTip from "../InfoTip";
import { Seg, Switch } from "../ui";

const load = <T,>(k: string, def: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? "null"); return v && typeof v === "object" ? { ...def, ...v } : def; } catch { return def; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ไม่มีที่เก็บก็ใช้ได้รอบนี้ */ } };
const num = (s: string) => (/^-?\d+$/.test(s.trim()) ? parseInt(s, 10) : null);

/** แถวในหน้าต่าง ชื่อซ้ายช่องขวา */
const Row = (p: { label: string; tip?: Tip; children: React.ReactNode }) => (
  <div className="se-drow"><span className="se-dlbl">{p.label}{p.tip && <InfoTip title={p.label} tip={p.tip} />}</span>{p.children}</div>
);
const Sw = (p: { on: boolean; set: (v: boolean) => void; label: string; data?: string }) => (
  <span className="se-dsw2" data-sw={p.data}><Switch on={p.on} onChange={p.set} label={p.label} />{p.label}</span>
);
/** เปิดหน้าต่างแล้วเคอร์เซอร์อยู่ในช่องแรกที่ต้องพิมพ์ ไม่ใช่ที่ปุ่ม ⓘ · หน้าต่างโฟกัสปุ่มแรกหลังลูก จึงรอหนึ่งจังหวะ */
function useFocusOpen(open: boolean, ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { ref.current?.focus(); ref.current?.select(); }, 0);
    return () => clearTimeout(t);
  }, [open, ref]);
}
const Status = (p: { msg: string | null; bad?: boolean }) => p.msg ? <div className={"small se-dlgmsg" + (p.bad ? " bad" : "")} role={p.bad ? "alert" : "status"} data-dlgmsg>{p.msg}</div> : null;

/* ---------------------------------------------------------------- เลื่อนเวลา */

const SHIFT_TIP: Tip = {
  w: "เลื่อนเวลาของบรรทัดไปข้างหน้าหรือถอยหลังเท่ากันทุกบรรทัด ใช้ตอนซับทั้งเรื่องขึ้นเร็วหรือช้ากว่าเสียง",
  o: [
    ["ทุกบรรทัด", "เลื่อนทั้งไฟล์", "ซับทั้งเรื่องช้าเท่ากัน", ""],
    ["บรรทัดที่เลือก", "เลื่อนเฉพาะที่เลือกในตาราง", "แก้ช่วงเดียว", ""],
    ["ตั้งแต่ที่เลือกลงไป", "เลื่อนบรรทัดที่เลือกกับทุกบรรทัดที่อยู่ใต้บรรทัดแรกที่เลือก", "ซับคลาดหลังช่วงโฆษณาหรือฉากที่ถูกตัด", ""],
  ],
  r: "ไม่แน่ใจว่าเลื่อนเท่าไหร่ ลองฟังบรรทัดแรกบนคลื่นเสียงก่อน แล้วเลิกทำได้ทีเดียว",
};
export type ShiftHist = ShiftOpts & { at: string; n: number };
const SH_DEF: ShiftOpts = { byTime: true, amount: 0, back: false, affect: 0, times: 0 };

export function ShiftDialog(p: { open: boolean; onClose: () => void; frames: boolean; selCount: number; kind: SubDoc["kind"]; onRun: (o: ShiftOpts) => number }) {
  const [o, setO] = useState<ShiftOpts>(SH_DEF);
  const [txt, setTxt] = useState("");
  const [hist, setHist] = useState<ShiftHist[]>([]);
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  useEffect(() => {
    if (!p.open) return;
    const v = load("se-shift", SH_DEF);
    const f = { ...v, byTime: v.byTime || !p.frames };
    setO(f); setTxt(f.byTime ? fmtTime(f.amount, p.kind) : String(f.amount));
    try { setHist(JSON.parse(localStorage.getItem("se-shift-hist") ?? "[]")); } catch { setHist([]); }
  }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const amount = o.byTime ? parseTime(txt) : num(txt);
  const why = amount == null ? (o.byTime ? "พิมพ์เวลาแบบ 0:00:01.50" : "พิมพ์จำนวนเฟรม") : amount === 0 ? "ใส่ระยะที่จะเลื่อนก่อน" : o.affect !== 0 && !p.selCount ? "ยังไม่ได้เลือกบรรทัด" : null;
  const run = () => {
    if (why || amount == null) return;
    const opts = { ...o, amount: Math.abs(amount) };
    const n = p.onRun(opts);
    save("se-shift", opts);
    const h = [{ ...opts, at: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }), n }, ...hist].slice(0, 10);
    try { localStorage.setItem("se-shift-hist", JSON.stringify(h)); } catch { /* ไม่มีที่เก็บ */ }
    p.onClose();
  };
  const desc = (h: ShiftHist) => `${h.at} ${h.back ? "ถอยหลัง" : "ไปข้างหน้า"} ${h.byTime ? fmtTime(h.amount, p.kind) : `${h.amount} เฟรม`} ${["ทุกบรรทัด", "บรรทัดที่เลือก", "ตั้งแต่ที่เลือกลงไป"][h.affect]} ${["", "เฉพาะเริ่ม", "เฉพาะจบ"][h.times]} ${h.n} บรรทัด`.replace(/\s+/g, " ");
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="เลื่อนเวลา" width={600}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={run} data-shift-run>เลื่อนเวลา</button>
      </>}>
      <div className="se-dummy se-cdlg" data-shift onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); run(); } }}>
        <Row label="เลื่อนเป็น" tip={SHIFT_TIP}>
          <Seg small label="เลื่อนเป็น" value={o.byTime ? "t" : "f"} onChange={(v) => { setO({ ...o, byTime: v === "t" }); setTxt(v === "t" ? fmtTime(0, p.kind) : "0"); }}
            options={[{ value: "t", label: "เวลา" }, { value: "f", label: "เฟรม", off: p.frames ? undefined : "ยังไม่มีวิดีโอ จึงไม่รู้เวลาของแต่ละเฟรม" }]} />
          <input className={"inp se-time" + (amount == null ? " err" : "")} value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="ระยะที่เลื่อน" ref={first} data-shift-amount />
          <Seg small label="ทิศ" value={o.back ? "b" : "f"} onChange={(v) => setO({ ...o, back: v === "b" })} options={[{ value: "f", label: "ไปข้างหน้า" }, { value: "b", label: "ถอยหลัง" }]} />
        </Row>
        <Row label="บรรทัด">
          <Seg small label="บรรทัดที่เลื่อน" value={String(o.affect)} onChange={(v) => setO({ ...o, affect: Number(v) as 0 | 1 | 2 })}
            options={[{ value: "0", label: "ทุกบรรทัด" }, { value: "1", label: "ที่เลือก" }, { value: "2", label: "ตั้งแต่ที่เลือกลงไป" }]} />
        </Row>
        <Row label="เวลา">
          <Seg small label="เวลาที่เลื่อน" value={String(o.times)} onChange={(v) => setO({ ...o, times: Number(v) as 0 | 1 | 2 })}
            options={[{ value: "0", label: "ทั้งเริ่มและจบ" }, { value: "1", label: "เฉพาะเริ่ม" }, { value: "2", label: "เฉพาะจบ" }]} />
        </Row>
        {hist.length > 0 && <div className="se-dhist" data-shift-hist>
          <div className="small">ที่เคยเลื่อน กดเพื่อใช้ค่าเดิม</div>
          {hist.map((h, i) => <button key={i} type="button" className="se-vmi" onClick={() => { setO(h); setTxt(h.byTime ? fmtTime(h.amount, p.kind) : String(h.amount)); }}>{desc(h)}</button>)}
        </div>}
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- ปรับเวลาทั้งไฟล์ */

const POST_TIP: Tip = {
  w: "ปรับเวลาของทุกบรรทัดทีเดียวตามกติกาสี่ข้อของ Aegisub ทำต่อกันตามลำดับ เลิกทำได้ทีเดียว",
  o: [
    ["เผื่อหน้า", "เลื่อนเวลาเริ่มให้เร็วขึ้น แต่ไม่ล้ำเวลาจบของบรรทัดก่อนที่ไม่ได้ซ้อนกันอยู่แล้ว", "ซับขึ้นก่อนคนพูดนิดหนึ่ง อ่านทัน", ""],
    ["เผื่อท้าย", "เลื่อนเวลาจบให้ช้าลง แต่ไม่ล้ำเวลาเริ่มของบรรทัดถัดไป", "ซับค้างให้อ่านจบ", ""],
    ["ต่อบรรทัดที่ใกล้กัน", "บรรทัดที่ห่างกันหรือซ้อนกันนิดเดียว ให้จบกับเริ่มเป็นเวลาเดียวกัน จุดต่ออยู่ตามร้อยละที่ตั้ง (90 คือค่อนไปทางยืดบรรทัดแรก)", "ซับไม่กะพริบระหว่างประโยค", ""],
    ["ดูดเข้า keyframe", "เวลาเริ่มหรือจบที่ห่าง keyframe ไม่เกินระยะที่ตั้ง ย้ายไปตรง keyframe เวลาจบไปที่เฟรมก่อน keyframe หนึ่งเฟรม", "ซับไม่ค้างข้ามฉาก", "ต้องมีวิดีโอ"],
  ],
  r: "ค่าตั้งต้นเป็นของ Aegisub ใช้ได้กับซับหนังทั่วไป",
};
type PostSt = { li: boolean; liv: string; lo: boolean; lov: string; adj: boolean; gap: string; ov: string; bias: string; kf: boolean; sb: string; sa: string; eb: string; ea: string; onlySel: boolean };
const PS_DEF: PostSt = { li: true, liv: "100", lo: true, lov: "350", adj: true, gap: "300", ov: "50", bias: "90", kf: true, sb: "200", sa: "150", eb: "200", ea: "250", onlySel: false };

export function PostDialog(p: { open: boolean; onClose: () => void; doc: SubDoc; keys: boolean; selCount: number; onRun: (o: PostOpts) => string | null }) {
  const [s, setS] = useState<PostSt>(PS_DEF);
  const [styles, setStyles] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  const names = isAss(p.doc) ? p.doc.styles.map((x) => x.fields[0]) : [];
  useEffect(() => { if (p.open) { setS(load("se-post", PS_DEF)); setStyles(new Set(names)); setErr(null); } }, [p.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = (k: keyof PostSt) => num(String(s[k]));
  const inp = (k: keyof PostSt, label: string, on: boolean, unit = "ms") => (
    <label className="se-f se-pin">{label}<input ref={k === "liv" ? first : undefined} className={"inp se-num4" + (on && n(k) == null ? " err" : "")} value={String(s[k])} disabled={!on} onChange={(e) => setS({ ...s, [k]: e.target.value })} aria-label={`${label || "ระยะ"} ${unit}`} data-post={k} />{unit}</label>
  );
  const bad = (s.li && n("liv") == null) || (s.lo && n("lov") == null) || (s.adj && [n("gap"), n("ov"), n("bias")].some((x) => x == null)) || (s.kf && p.keys && [n("sb"), n("sa"), n("eb"), n("ea")].some((x) => x == null));
  const why = bad ? "ตัวเลขบางช่องอ่านไม่ออก" : s.onlySel && !p.selCount ? "ยังไม่ได้เลือกบรรทัด" : !(s.li || s.lo || s.adj || (s.kf && p.keys)) ? "ยังไม่ได้เปิดกติกาสักข้อ" : null;
  const run = () => {
    if (why) return;
    save("se-post", s);
    const r = p.onRun({
      leadIn: s.li ? n("liv") : null, leadOut: s.lo ? n("lov") : null,
      adjacent: s.adj ? { gap: n("gap")!, overlap: n("ov")!, bias: Math.min(100, Math.max(0, n("bias")!)) / 100 } : null,
      keys: s.kf && p.keys ? { sb: n("sb")!, sa: n("sa")!, eb: n("eb")!, ea: n("ea")! } : null,
      onlySel: s.onlySel, styles: names.length && styles.size !== names.length ? styles : null,
    });
    if (r) setErr(r); else p.onClose();
  };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="ปรับเวลาทั้งไฟล์" width={700}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={() => { setS(PS_DEF); setStyles(new Set(names)); }} data-post-reset>ค่าตั้งต้นของ Aegisub</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={run} data-post-run>ปรับเวลา</button>
      </>}>
      <div className="se-dummy se-cdlg" data-post>
        <Row label="เผื่อหน้า" tip={POST_TIP}><Sw on={s.li} set={(v) => setS({ ...s, li: v })} label="เปิด" data="li" />{inp("liv", "", s.li)}</Row>
        <Row label="เผื่อท้าย"><Sw on={s.lo} set={(v) => setS({ ...s, lo: v })} label="เปิด" data="lo" />{inp("lov", "", s.lo)}</Row>
        <Row label="ต่อบรรทัด"><Sw on={s.adj} set={(v) => setS({ ...s, adj: v })} label="เปิด" data="adj" />{inp("gap", "ห่างไม่เกิน", s.adj)}{inp("ov", "ซ้อนไม่เกิน", s.adj)}{inp("bias", "จุดต่อ", s.adj, "%")}</Row>
        <Row label="keyframe">
          <span title={p.keys ? undefined : "ยังไม่มีวิดีโอหรือ keyframe"} style={{ display: "contents" }}><Sw on={s.kf && p.keys} set={(v) => p.keys && setS({ ...s, kf: v })} label="เปิด" data="kf" /></span>
        </Row>
        <Row label="เวลาเริ่ม">{inp("sb", "ก่อน keyframe ไม่เกิน", s.kf && p.keys)}{inp("sa", "หลังไม่เกิน", s.kf && p.keys)}</Row>
        <Row label="เวลาจบ">{inp("eb", "ก่อน keyframe ไม่เกิน", s.kf && p.keys)}{inp("ea", "หลังไม่เกิน", s.kf && p.keys)}</Row>
        <Row label="บรรทัด"><Sw on={s.onlySel} set={(v) => setS({ ...s, onlySel: v })} label={`เฉพาะที่เลือก (${p.selCount} บรรทัด)`} data="onlySel" /></Row>
        {names.length > 1 && <Row label="สไตล์">
          <span className="se-dstyles">{names.map((nm) => <label key={nm} className="se-dchk"><input type="checkbox" checked={styles.has(nm)} onChange={(e) => { const x = new Set(styles); if (e.target.checked) x.add(nm); else x.delete(nm); setStyles(x); }} />{nm}</label>)}</span>
        </Row>}
        <Status msg={err} bad />
      </div>
    </Dialog>
  );
}
export { POST_DEFAULT };

/* ---------------------------------------------------------------- เลือกบรรทัด */

const FIELDS: { value: Field; label: string }[] = [{ value: "text", label: "ข้อความ" }, { value: "style", label: "สไตล์" }, { value: "actor", label: "ตัวละคร" }, { value: "effect", label: "เอฟเฟกต์" }];
const MODE_TIP: Tip = {
  w: "วิธีเทียบคำที่พิมพ์กับช่องของแต่ละบรรทัด",
  o: [
    ["มีคำนี้", "ช่องมีคำที่พิมพ์อยู่ตรงไหนก็ได้", "ค้นง่ายที่สุด", ""],
    ["ตรงทั้งช่อง", "ช่องต้องเป็นคำที่พิมพ์ทั้งหมด", "เลือกสไตล์หรือตัวละครชื่อเดียวกันพอดี", ""],
    ["รูปแบบค้นหา", "พิมพ์รูปแบบแบบ regular expression เช่น ^ตัว ขึ้นต้นด้วยคำว่าตัว", "ค้นได้ซับซ้อน", "ต้องรู้วิธีเขียนรูปแบบ"],
  ],
  r: "ใช้มีคำนี้เป็นหลัก",
};
type SelSt = Omit<SelectOpts, "find">;
const SEL_DEF: SelSt = { field: "text", mode: "contains", caseSens: false, invert: false, dialogue: true, comment: false, action: "set" };

export function SelectDialog(p: { open: boolean; onClose: () => void; ass: boolean; onRun: (o: SelectOpts) => string }) {
  const [find, setFind] = useState("");
  const [o, setO] = useState<SelSt>(SEL_DEF);
  const [msg, setMsg] = useState<{ t: string; bad: boolean } | null>(null);
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  useEffect(() => { if (p.open) { setO(load("se-select", SEL_DEF)); setMsg(null); } }, [p.open]);
  const run = () => { save("se-select", o); const r = p.onRun({ ...o, find }); setMsg({ t: r, bad: r.startsWith("รูปแบบ") }); };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" title="เลือกบรรทัด" width={600}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ปิด</button>
        <button type="button" className="btn btn-main" onClick={run} data-select-run>เลือก</button>
      </>}>
      <div className="se-dummy se-cdlg" data-select onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); run(); } }}>
        <Row label="คำที่หา"><input className="inp se-dwide" value={find} onChange={(e) => setFind(e.target.value)} aria-label="คำที่หา" ref={first} data-select-find /></Row>
        <Row label="ในช่อง"><Seg small label="ช่องที่หา" value={o.field} onChange={(v) => setO({ ...o, field: v })} options={FIELDS.map((f) => ({ ...f, off: !p.ass && f.value !== "text" ? "ซับ SRT มีแต่ข้อความ" : undefined }))} /></Row>
        <Row label="เทียบแบบ" tip={MODE_TIP}><Seg small label="เทียบแบบ" value={o.mode} onChange={(v) => setO({ ...o, mode: v as MatchMode })} options={[{ value: "contains", label: "มีคำนี้" }, { value: "exact", label: "ตรงทั้งช่อง" }, { value: "regex", label: "รูปแบบค้นหา" }]} /></Row>
        <Row label="ตัวเลือก">
          <Sw on={o.caseSens} set={(v) => setO({ ...o, caseSens: v })} label="ตัวพิมพ์ใหญ่เล็กต้องตรง" />
          <Sw on={o.invert} set={(v) => setO({ ...o, invert: v })} label="เลือกบรรทัดที่ไม่ตรง" />
        </Row>
        <Row label="ชนิด">
          <Sw on={o.dialogue} set={(v) => setO({ ...o, dialogue: v })} label="บรรทัดซับ" />
          {p.ass && <Sw on={o.comment} set={(v) => setO({ ...o, comment: v })} label="บรรทัดความคิดเห็น" />}
        </Row>
        <Row label="ผลที่ได้"><Seg small label="ผลที่ได้" value={o.action} onChange={(v) => setO({ ...o, action: v })}
          options={[{ value: "set", label: "เลือกใหม่" }, { value: "add", label: "เพิ่มเข้าที่เลือก" }, { value: "sub", label: "เอาออกจากที่เลือก" }, { value: "and", label: "เฉพาะที่เลือกไว้แล้ว" }]} /></Row>
        <Status msg={msg?.t ?? null} bad={msg?.bad} />
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- ค้นและแทนที่ */

const FIND_TIP: Tip = {
  w: "ค้นคำในบรรทัดซับแล้วแทนที่ทีละจุดหรือทั้งหมด แทนที่ทั้งหมดเลิกทำได้ทีเดียว",
  o: [
    ["ตรงทั้งคำ", "เจอเฉพาะคำที่มีเว้นวรรคหรือเครื่องหมายคั่นหน้าหลัง", "ค้นคำว่า the แล้วไม่ไปเจอในคำว่า there", "ภาษาไทยไม่เว้นวรรคระหว่างคำ จึงเจอเฉพาะคำที่เว้นวรรคไว้"],
    ["รูปแบบค้นหา", "พิมพ์แบบ regular expression ช่องแทนที่ใช้ $1 แทนกลุ่มที่จับได้", "แก้ทีเดียวได้หลายแบบ", "ต้องรู้วิธีเขียนรูปแบบ"],
    ["ข้ามแท็ก", "ไม่ค้นในแท็กของ ASS ในปีกกา หรือแท็กของ SRT", "แทนคำโดยไม่ทำแท็กเสีย", ""],
  ],
  r: "ลองกดค้นต่อไปดูทีละจุดก่อนกดแทนที่ทั้งหมด",
};
export type FindSt = Omit<FindOpts, "find" | "replace">;
export const FIND_DEF: FindSt = { fields: ["text"], caseSens: false, regex: false, wholeWord: false, skipTags: false, skipComments: false, onlySel: false };

export function FindDialog(p: { open: boolean; replace: boolean; onClose: () => void; ass: boolean; find: string; repl: string; setFind: (s: string) => void; setRepl: (s: string) => void; opts: FindSt; setOpts: (o: FindSt) => void; msg: { t: string; bad: boolean } | null;
  onNext: () => void; onReplace: () => void; onReplaceAll: () => void }) {
  const o = p.opts, set = p.setOpts;
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  const tog = (f: Field, v: boolean) => set({ ...o, fields: v ? [...new Set([...o.fields, f])] : o.fields.filter((x) => x !== f) });
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" title={p.replace ? "ค้นและแทนที่" : "ค้นหา"} width={640}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ปิด</button>
        <span style={{ flex: 1 }} />
        {p.replace && <button type="button" className="btn btn-ghost" onClick={p.onReplaceAll} data-find-all>แทนที่ทั้งหมด</button>}
        {p.replace && <button type="button" className="btn btn-ghost" onClick={p.onReplace} data-find-one>แทนที่</button>}
        <button type="button" className="btn btn-main" onClick={p.onNext} title="ค้นต่อไป (F3)" data-find-next>ค้นต่อไป</button>
      </>}>
      <div className="se-dummy se-cdlg" data-find onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") { e.preventDefault(); p.onNext(); } }}>
        <Row label="คำที่ค้น" tip={FIND_TIP}><input className="inp se-dwide" value={p.find} onChange={(e) => p.setFind(e.target.value)} aria-label="คำที่ค้น" ref={first} data-find-text /></Row>
        {p.replace && <Row label="แทนด้วย"><input className="inp se-dwide" value={p.repl} onChange={(e) => p.setRepl(e.target.value)} aria-label="แทนด้วย" data-find-repl /></Row>}
        <Row label="ในช่อง"><span className="se-dstyles">{FIELDS.filter((f) => p.ass || f.value === "text").map((f) => <label key={f.value} className="se-dchk"><input type="checkbox" checked={o.fields.includes(f.value)} onChange={(e) => tog(f.value, e.target.checked)} />{f.label}</label>)}</span></Row>
        <Row label="ตัวเลือก">
          <span className="se-dstyles">
            <Sw on={o.caseSens} set={(v) => set({ ...o, caseSens: v })} label="ตัวพิมพ์ใหญ่เล็กต้องตรง" />
            <Sw on={o.wholeWord} set={(v) => set({ ...o, wholeWord: v })} label="ตรงทั้งคำ" />
            <Sw on={o.regex} set={(v) => set({ ...o, regex: v })} label="รูปแบบค้นหา" />
            <Sw on={o.skipTags} set={(v) => set({ ...o, skipTags: v })} label="ข้ามแท็ก" />
            {p.ass && <Sw on={o.skipComments} set={(v) => set({ ...o, skipComments: v })} label="ข้ามบรรทัดความคิดเห็น" />}
            <Sw on={o.onlySel} set={(v) => set({ ...o, onlySel: v })} label="เฉพาะบรรทัดที่เลือก" />
          </span>
        </Row>
        <Status msg={p.msg?.t ?? null} bad={p.msg?.bad} />
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- วางทับ */

const OVER_LABEL: Record<OverField, string> = { comment: "ความคิดเห็น", layer: "ชั้น", start: "เวลาเริ่ม", end: "เวลาจบ", style: "สไตล์", actor: "ตัวละคร", marginL: "ขอบซ้าย", marginR: "ขอบขวา", marginV: "ขอบบนล่าง", effect: "เอฟเฟกต์", text: "ข้อความ" };
export function OverDialog(p: { open: boolean; onClose: () => void; ass: boolean; onRun: (f: Set<OverField>) => void }) {
  const [f, setF] = useState<Set<OverField>>(new Set(["text"]));
  useEffect(() => { if (p.open) { try { setF(new Set(JSON.parse(localStorage.getItem("se-over") ?? '["text"]'))); } catch { setF(new Set(["text"])); } } }, [p.open]);
  const list = OVER_FIELDS.filter((x) => p.ass || ["start", "end", "text"].includes(x));
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  const why = f.size ? null : "เลือกช่องที่จะวางทับก่อน";
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="วางทับ" width={560}
      actions={<>
        <button type="button" className="btn btn-ghost" onClick={() => setF(new Set(list))}>เลือกทุกช่อง</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={() => { if (why) return; try { localStorage.setItem("se-over", JSON.stringify([...f])); } catch { /* ไม่มีที่เก็บ */ } p.onRun(f); p.onClose(); }} data-over-run>วางทับ</button>
      </>}>
      <div className="se-dummy se-cdlg" data-over>
        <div className="small se-dlgtext">บรรทัดที่คัดลอกไว้ทับบรรทัดที่กำลังแก้กับบรรทัดถัดลงไปทีละบรรทัด เฉพาะช่องที่ติ๊ก</div>
        <span className="se-dstyles">{list.map((x) => <label key={x} className="se-dchk"><input type="checkbox" checked={f.has(x)} ref={x === list[0] ? first : undefined} onChange={(e) => { const s = new Set(f); if (e.target.checked) s.add(x); else s.delete(x); setF(s); }} data-over-field={x} />{OVER_LABEL[x]}</label>)}</span>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- ไปที่บรรทัดหรือเวลา */

export function GotoDialog(p: { open: boolean; onClose: () => void; onGo: (q: string) => boolean }) {
  const [q, setQ] = useState("");
  const [bad, setBad] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useFocusOpen(p.open, first);
  useEffect(() => { if (p.open) { setQ(""); setBad(false); } }, [p.open]);
  const go = () => { if (p.onGo(q)) p.onClose(); else setBad(true); };
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="menu" title="ไปที่บรรทัดหรือเวลา" width={440}
      actions={<><button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button><button type="button" className="btn btn-main" onClick={go} data-goto-go>ไป</button></>}>
      <div className="se-dummy se-cdlg" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); go(); } }}>
        <Row label="ไปที่"><input className={"inp se-time" + (bad ? " err" : "")} value={q} onChange={(e) => { setQ(e.target.value); setBad(false); }} aria-label="เลขบรรทัดหรือเวลา" ref={first} data-goto-q /></Row>
        <div className="small se-dlgtext">{bad ? "ไม่เจอบรรทัดนั้น พิมพ์เลขบรรทัด เช่น 25 หรือเวลา เช่น 0:01:30.00" : "พิมพ์เลขบรรทัด เช่น 25 หรือเวลา เช่น 0:01:30.00 แล้วกด Enter"}</div>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- เรียงบรรทัด */

export function SortDialog(p: { open: boolean; onClose: () => void; ass: boolean; selCount: number; onRun: (k: SortKey, onlySel: boolean) => void }) {
  const [k, setK] = useState<SortKey>("start");
  const [only, setOnly] = useState(false);
  const why = only && p.selCount < 2 ? "เลือกอย่างน้อยสองบรรทัดก่อน" : null;
  return (
    <Dialog open={p.open} onClose={p.onClose} kind="work" title="เรียงบรรทัด" width={600}
      actions={<><button type="button" className="btn btn-ghost" onClick={p.onClose}>ยกเลิก</button>
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why ?? undefined} onClick={() => { if (!why) { p.onRun(k, only); p.onClose(); } }} data-sort-run>เรียง</button></>}>
      <div className="se-dummy se-cdlg" data-sort>
        <Row label="เรียงตาม"><Seg small label="เรียงตาม" value={k} onChange={setK} options={[
          { value: "start", label: "เวลาเริ่ม" }, { value: "end", label: "เวลาจบ" },
          ...(p.ass ? [{ value: "style" as SortKey, label: "สไตล์" }, { value: "actor" as SortKey, label: "ตัวละคร" }, { value: "effect" as SortKey, label: "เอฟเฟกต์" }, { value: "layer" as SortKey, label: "ชั้น" }] : []),
        ]} /></Row>
        <Row label="บรรทัด"><Seg small label="บรรทัดที่เรียง" value={only ? "s" : "a"} onChange={(v) => setOnly(v === "s")} options={[{ value: "a", label: "ทั้งไฟล์" }, { value: "s", label: "เฉพาะที่เลือก" }]} /></Row>
        <div className="small se-dlgtext">ค่าเท่ากันอยู่ลำดับเดิม เฉพาะที่เลือกเรียงแต่ละกลุ่มที่เลือกติดกันแยกกัน บรรทัดอื่นอยู่ที่เดิม</div>
      </div>
    </Dialog>
  );
}
