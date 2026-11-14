/* ช่องแก้บรรทัดของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · BUGS ข้อ 109 · ทำแบบช่องแก้ของ Aegisub subs_edit_box.cpp)
   ① เลเยอร์ เวลาเริ่ม เวลาจบ ความยาว สลับเวลากับเลขเฟรม · ปุ่มแทรก แยก รวม ลบ
   ② สไตล์ ตัวละคร เอฟเฟกต์ ระยะขอบสามช่อง (มีเฉพาะ ASS · SRT กดไม่ได้พร้อมเหตุผล และมีปุ่มเปลี่ยนเป็น ASS)
   ③ ตัวหนา ตัวเอียง ขีดเส้นใต้ ขีดฆ่า สีสี่ปุ่ม ปุ่ม fn ฟอนต์กับขนาด · แสดงต้นฉบับ แทรกต้นฉบับ ย้อน ลบข้อความ
   ④ ช่องพิมพ์ใหญ่หลายบรรทัด (พี่กัน "ปุ่มพิม ขอหญ่ๆแบบนี้") Enter ยืนยันแล้วไปบรรทัดถัดไป Shift+Enter ขึ้นบรรทัดใหม่
   ความยาวพิมพ์แก้ได้ เปลี่ยนเวลาจบอย่างเดียวแบบ Aegisub (พี่กันเคาะว่าเอาตามที่แคลร์เสนอ)
   พิมพ์ข้อความแล้วบรรทัดในตารางเปลี่ยนตามทันที พิมพ์ต่อกันนับเป็นการแก้ขั้นเดียว เลิกทำทีเดียวได้ทั้งคำ (subEdit.ts) */
import { useEffect, useMemo, useRef, useState } from "react";
import type { SubDoc, SubEvent } from "../../lib/api";
import type { Tip } from "../../lib/codecAdv";
import { getSubEdit, updateEvent, edit } from "../../lib/subEdit";
import { assToCss, cps, cssToAss, fmtTime, fromBox, insertAss, isAss, lastTag, parseTime, snapMs, styleField, toBox, wrapTag } from "../../lib/subText";
import { CPS_MAX } from "./SubGrid";
import { highlight, isTemplateLine } from "../../lib/subSyntax";
import type { Framerate } from "../../lib/vidFrames";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { Seg } from "../ui";
import { IbBack, IbBold, IbDrop, IbEraser, IbFont, IbItalic, IbMerge, IbNext, IbOriginal, IbRevert, IbSplit, IbStrike, IbTrash, IbUnderline, IcPlus } from "../icons";

const ASS_TIP: Tip = {
  w: "ช่องเหล่านี้มีเฉพาะซับ ASS ซับ SRT ไม่มีที่เก็บ บันทึกเป็น SRT แล้วหายทั้งหมด",
  o: [
    ["สไตล์", "ชุดฟอนต์ ขนาด สี ขอบ และตำแหน่งที่ตั้งชื่อไว้ในไฟล์ บรรทัดนี้ใช้ชุดไหน", "เปลี่ยนหน้าตาทุกบรรทัดที่ใช้สไตล์เดียวกันได้ที่เดียว", "ต้องมีสไตล์ชื่อนั้นในไฟล์"],
    ["ตัวละคร", "ชื่อคนพูดของบรรทัดนี้ โปรแกรมเล่นไม่แสดงบนจอ ใช้ค้นและเลือกบรรทัดของคนพูดคนเดียวกัน", "หาบทของคนหนึ่งคนได้เร็ว", "บันทึกเป็น SRT แล้วหาย"],
    ["เอฟเฟกต์", "ข้อมูลเสริมของบรรทัด ใช้กับซับคาราโอเกะ และตัวหนังสือวิ่งแบบเก่าของ SSA เช่น Banner", "โปรแกรมเล่นบางตัวทำตัวหนังสือวิ่งได้", "ซับพูดธรรมดาไม่ใช้"],
    ["ชั้น (เลเยอร์)", "ลำดับชั้นตอนซับหลายบรรทัดขึ้นพร้อมกัน เลขมากวาดทับเลขน้อย", "ป้ายในฉากกับซับพูดซ้อนกันได้ถูกลำดับ", "ซับพูดธรรมดาใช้ 0 ทุกบรรทัด"],
    ["ระยะขอบ ซ้าย ขวา บนล่าง", "ขยับบรรทัดนี้จากขอบภาพ เป็นจุดตามขนาดภาพของซับ ใส่ 0 คือใช้ตามสไตล์", "หลบป้ายบนจอได้โดยไม่ต้องสร้างสไตล์ใหม่", "ค่ามากเกินไปซับหลุดจอ"],
  ],
  r: "ซับหนังทั่วไปใช้แค่สไตล์ Default ช่องอื่นปล่อยว่างหรือ 0 ได้",
};
const TIME_TIP: Tip = {
  w: "ช่องเวลาเริ่ม เวลาจบ และความยาว พิมพ์เป็นเวลาหรือเป็นเลขเฟรมของวิดีโอก็ได้ ค่าเดียวกัน แค่แสดงต่างกัน",
  o: [
    ["เวลา", "ชั่วโมง นาที วินาที แบบที่ไฟล์ซับเก็บ ซับ ASS ละเอียดถึงหนึ่งในร้อยวินาที ซับ SRT ถึงหนึ่งในพันวินาที", "ตรงกับที่ไฟล์เก็บจริง", "เทียบกับภาพทีละเฟรมยาก"],
    ["เฟรม", "ลำดับภาพของวิดีโอ คิดจากเวลาจริงของทุกเฟรมในไฟล์วิดีโอ เริ่มคือเฟรมแรกที่ซับขึ้น จบคือเฟรมสุดท้ายที่ซับยังอยู่ ความยาวคือจำนวนเฟรม", "ตั้งซับให้ขึ้นตรงเฟรมที่ฉากเปลี่ยนได้พอดี", "ต้องมีไฟล์วิดีโอหรือวิดีโอจำลอง"],
  ],
  r: "ใช้เวลาเป็นหลัก สลับเป็นเฟรมตอนต้องการให้ซับขึ้นหรือหายตรงภาพพอดี",
};
const TYPE_TIP: Tip = {
  w: "กด Enter ยืนยันแล้วไปบรรทัดถัดไป บรรทัดสุดท้ายกด Enter แล้วได้บรรทัดใหม่ต่อท้าย ส่วน Shift+Enter ขึ้นบรรทัดใหม่ในซับเดียวกัน  Ctrl+Z เลิกทำ Ctrl+Y ทำซ้ำ Ctrl+S บันทึก ใช้ได้แม้กำลังพิมพ์  ในตาราง ลูกศรขึ้นลงเปลี่ยนบรรทัด Ctrl หรือ Shift กับคลิกเลือกหลายบรรทัด",
};
const CPS_TIP: Tip = {
  w: `จำนวนตัวอักษรที่ต้องอ่านต่อหนึ่งวินาที ไม่นับแท็ก ช่องว่าง และตัวขึ้นบรรทัด เกิน ${CPS_MAX} ตัวต่อวินาทีคนส่วนใหญ่อ่านไม่ทัน ช่องนี้กับช่องในตารางจะเป็นสีเตือน`,
  r: "ยืดเวลาจบ ตัดคำ หรือแยกเป็นสองบรรทัด",
};

/** สีสี่ปุ่ม · แท็ก ASS กับช่องสีของสไตล์ */
const COLORS: { tag: string; name: string; field: string }[] = [
  { tag: "1c", name: "สีตัวอักษร", field: "PrimaryColour" },
  { tag: "2c", name: "สีรอง (คาราโอเกะ)", field: "SecondaryColour" },
  { tag: "3c", name: "สีขอบ", field: "OutlineColour" },
  { tag: "4c", name: "สีเงา", field: "BackColour" },
];

type Props = {
  doc: SubDoc;
  ev: SubEvent;
  orig: string | undefined;
  savedEv: SubEvent | undefined;
  /** ตัวแปลงเวลากับเลขเฟรมของวิดีโอที่เปิด · null = ยังไม่มี (frWhy บอกเหตุผล) */
  fr: Framerate | null;
  frWhy: string;
  /** ดีเลย์ของแทร็ก เวลาบนภาพ = เวลาซับ + ดีเลย์ */
  delayMs: number;
  unit: "time" | "frame";
  onUnit: (u: "time" | "frame") => void;
  onPrev: () => void;
  onNext: (create: boolean) => void;
  onInsert: () => void;
  onSplit: (at: number) => void;
  onJoin: () => void;
  onDelete: () => void;
  onToAss: () => void;
  onFont: (apply: (tag: string, reset: string) => void, current: { name: string; size: string }) => void;
  /** เหตุผลที่ปุ่มกดไม่ได้ (บรรทัดแรก บรรทัดสุดท้าย ยังไม่ได้เลือกบรรทัด) · ไม่มี = กดได้ (ผู้ช่วยตรวจทาน F21) */
  why?: { prev?: string; next?: string; join?: string; del?: string };
};

/** แปลงเวลาของช่องเป็นเลขเฟรมและกลับ (TimeEdit ของ Aegisub) · null = ช่องแสดงเป็นเวลา */
type FrameIO = { show: (ms: number) => number; set: (f: number) => number };

/** ช่องเวลา · พิมพ์แล้วยืนยันตอน Enter หรือออกจากช่อง · Esc คืนค่าเดิม · อ่านไม่ออกขอบแดง ไม่เปลี่ยนค่า */
function TimeField(p: { label: string; ms: number; doc: SubDoc; fio: FrameIO | null; onSet: (ms: number) => void; dur?: boolean; data: string }) {
  const show = p.fio ? String(p.fio.show(p.ms)) : p.dur ? (p.ms / 1000).toFixed(isAss(p.doc) ? 2 : 3) : fmtTime(p.ms, p.doc.kind);
  const [text, setText] = useState(show);
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(show); setBad(false); }, [show]);
  const commit = () => {
    const t = text.trim();
    const v = p.fio ? (/^\d+$/.test(t) ? p.fio.set(parseInt(t, 10)) : null) : p.dur ? (/^\d+(\.\d+)?$/.test(t) ? Math.round(parseFloat(t) * 1000) : null) : parseTime(t);
    if (v == null) { setBad(true); return; }
    setBad(false);
    if (t !== show && v !== p.ms) p.onSet(v); else setText(show);
  };
  return (
    <label className="se-f">{p.label}
      <input className={"inp se-time" + (bad ? " err" : "")} value={text} inputMode="decimal" aria-invalid={bad || undefined} title={bad ? (p.fio ? "พิมพ์เป็นเลขเฟรม" : p.dur ? "พิมพ์เป็นวินาที เช่น 2.50" : "พิมพ์เวลาแบบ 0:01:02.50") : undefined}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } else if (e.key === "Escape") { setText(show); setBad(false); } }} data-se-time={p.data} />
    </label>
  );
}

export default function SubEditBox(p: Props) {
  const { doc, ev } = p;
  const ass = isAss(doc);
  const ta = useRef<HTMLTextAreaElement>(null);
  const [showOrig, setShowOrig] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  const colorTag = useRef("1c");
  // โหมดเฟรมแบบ Aegisub · เริ่มคือเฟรมแรกที่ซับขึ้น (START) จบคือเฟรมสุดท้ายที่ซับยังอยู่ (END) ความยาวคือจำนวนเฟรม
  // พิมพ์ความยาว n เฟรม เวลาจบ = เวลาจบของเฟรม (เฟรมเริ่ม + n − 1) แบบ subs_edit_box.cpp
  const fr = p.unit === "frame" ? p.fr : null;
  const d = p.delayMs;
  const fStart: FrameIO | null = fr && { show: (ms) => fr.frameAt(ms + d, "start"), set: (f) => fr.timeAt(f, "start") - d };
  const fEnd: FrameIO | null = fr && { show: (ms) => fr.frameAt(ms + d, "end"), set: (f) => fr.timeAt(f, "end") - d };
  const fDur: FrameIO | null = fr && {
    show: () => fr.frameAt(ev.end + d, "end") - fr.frameAt(ev.start + d, "start") + 1,
    set: (n) => fr.timeAt(fr.frameAt(ev.start + d, "start") + Math.max(1, n) - 1, "end") - d - ev.start,
  };
  const box = toBox(ev.text, doc);
  // สีอักษรแบบ Aegisub เฉพาะไฟล์ ASS SSA (BUGS ข้อ 112) · ชั้นสีวางใต้ช่องพิมพ์ ตัวอักษรของช่องพิมพ์โปร่งใส เคอร์เซอร์กับการเลือกยังเป็นของช่องพิมพ์
  const hl = useMemo(() => (ass ? highlight(box, isTemplateLine(ev.comment, ev.effect)) : null), [ass, box, ev.comment, ev.effect]);
  const hlPre = useRef<HTMLPreElement>(null);
  const syncHl = () => { const t = ta.current, h = hlPre.current; if (t && h) { h.scrollTop = t.scrollTop; h.scrollLeft = t.scrollLeft; } };
  useEffect(syncHl);
  const id = ev.id;
  const noAss = ass ? undefined : "ซับ SRT ไม่มีช่องนี้ เปลี่ยนเป็น ASS ก่อน";

  const set = (patch: Partial<SubEvent>, label: string, merge?: string) => updateEvent(id, patch, label, merge);
  const setStart = (ms: number) => { const s = snapMs(ms, doc); set({ start: s, end: Math.max(s, ev.end) }, "แก้เวลาเริ่ม"); };
  const setEnd = (ms: number) => { const e = snapMs(ms, doc); set({ end: e, start: Math.min(ev.start, e) }, "แก้เวลาจบ"); };
  const setDur = (ms: number) => set({ end: snapMs(ev.start + Math.max(0, ms), doc) }, "แก้ความยาว");

  /** ข้อความใหม่จากตัวช่วยแท็ก แล้วคืนเคอร์เซอร์ให้ตรงที่เดิม */
  const applyBox = (r: { text: string; a: number; b: number }, label: string) => {
    set({ text: fromBox(r.text, doc) }, label);
    requestAnimationFrame(() => { const t = ta.current; if (t) { t.focus(); t.setSelectionRange(r.a, r.b); } });
  };
  const sel = () => { const t = ta.current; return t ? [t.selectionStart, t.selectionEnd] as const : [box.length, box.length] as const; };
  const wrap = (tag: "b" | "i" | "u" | "s", label: string) => { const [a, b] = sel(); applyBox(wrapTag(box, a, b, tag, doc), label); };
  const style = doc.styles.find((s) => s.fields[0] === ev.style) ?? doc.styles[0];
  const colorNow = (c: (typeof COLORS)[number]) => {
    const [a] = sel();
    const v = lastTag(box, a, c.tag) ?? (c.tag === "1c" ? lastTag(box, a, "c") : null);
    return assToCss(v || (style ? styleField(doc, style.fields, c.field) : "") || "&H00FFFFFF");
  };
  const openColor = (c: (typeof COLORS)[number]) => {
    colorTag.current = c.tag;
    const i = pick.current;
    if (!i) return;
    i.value = colorNow(c);
    i.click();
  };
  const onColor = (hex: string) => {
    const [a, b] = sel();
    const tag = colorTag.current === "1c" ? "c" : colorTag.current;
    applyBox(insertAss(box, a, b, `{\\${tag}${cssToAss(hex)}}`, `{\\${tag}}`), "ใส่สี");
  };
  // ใส่สีตอนเลือกสีเสร็จ (เหตุการณ์ change ของหน้าเว็บ เกิดครั้งเดียวตอนปิดกล่องสี) ไม่ใช้ onChange ของ React ที่ทำงานทุกครั้งที่ลากในกล่องสี
  // เดิมลากเลือกสีแล้วแท็กสีซ้อนกันหลายชั้นและเลิกทำหลายขั้น (ผู้ช่วยตรวจทาน F20)
  const colorRef = useRef(onColor);
  colorRef.current = onColor;
  useEffect(() => {
    const el = pick.current;
    if (!el) return;
    const h = () => colorRef.current(el.value);
    el.addEventListener("change", h);
    return () => el.removeEventListener("change", h);
  }, []);
  const font = () => {
    const [a, b] = sel();
    p.onFont((tag, reset) => applyBox(insertAss(box, a, b, tag, reset), "เปลี่ยนฟอนต์"), {
      name: lastTag(box, a, "fn") || (style ? styleField(doc, style.fields, "Fontname") : ""),
      size: lastTag(box, a, "fs") || (style ? styleField(doc, style.fields, "Fontsize") : ""),
    });
  };
  const c = cps(ev);
  const actors = [...new Set(doc.events.map((e) => e.actor).filter(Boolean))].sort();
  const reverted = !p.savedEv || p.savedEv === ev;

  return (
    <div className="se-edit" data-se-edit>
      <div className="se-erow">
        <span className="se-f se-no">บรรทัด <b data-se-no>{doc.events.findIndex((e) => e.id === id) + 1}</b></span>
        {ass && <label className="se-f">ชั้น<input className="inp se-num" type="number" value={ev.layer} min={0} onChange={(e) => set({ layer: Math.max(0, parseInt(e.target.value || "0", 10) || 0) }, "แก้เลเยอร์", `layer:${id}`)} data-se-layer /></label>}
        <TimeField label="เริ่ม" ms={ev.start} doc={doc} fio={fStart} onSet={setStart} data="start" />
        <TimeField label="จบ" ms={ev.end} doc={doc} fio={fEnd} onSet={setEnd} data="end" />
        <TimeField label="ยาว" ms={ev.end - ev.start} doc={doc} fio={fDur} onSet={setDur} dur data="dur" />
        <Seg small label="หน่วยเวลา" value={fr ? "frame" : "time"} onChange={p.onUnit}
          options={[{ value: "time", label: "เวลา" }, { value: "frame", label: "เฟรม", off: p.fr ? undefined : p.frWhy }]} />
        <InfoTip title="เวลากับเฟรม" tip={TIME_TIP} />
      </div>
      <div className={"se-erow" + (ass ? "" : " se-off")} title={noAss}>
        <label className="se-f">สไตล์
          <Dropdown label="สไตล์" value={ev.style || (style?.fields[0] ?? "")} disabled={noAss ?? (doc.styles.length ? undefined : "ไฟล์นี้ไม่มีสไตล์")}
            options={(ass ? doc.styles : []).map((s) => ({ value: s.fields[0], label: s.fields[0] }))} onChange={(v) => set({ style: v }, "เปลี่ยนสไตล์")} />
        </label>
        <label className="se-f">ตัวละคร<input className="inp se-actor" list="se-actors" value={ev.actor} disabled={!ass} onChange={(e) => set({ actor: e.target.value }, "แก้ตัวละคร", `actor:${id}`)} data-se-actor /></label>
        <datalist id="se-actors">{actors.map((a) => <option key={a} value={a} />)}</datalist>
        <label className="se-f">เอฟเฟกต์<input className="inp se-effect" value={ev.effect} disabled={!ass} onChange={(e) => set({ effect: e.target.value }, "แก้เอฟเฟกต์", `effect:${id}`)} data-se-effect /></label>
        <span className="se-f">ระยะขอบ
          {(["marginL", "marginR", "marginV"] as const).map((k, i) => (
            <input key={k} className="inp se-num" type="number" value={ev[k]} disabled={!ass} aria-label={["ระยะขอบซ้าย", "ระยะขอบขวา", "ระยะขอบบนหรือล่าง"][i]} title={["ซ้าย", "ขวา", "บนหรือล่าง"][i]}
              onChange={(e) => set({ [k]: parseInt(e.target.value || "0", 10) || 0 } as Partial<SubEvent>, "แก้ระยะขอบ", `${k}:${id}`)} data-se-margin={i} />
          ))}
        </span>
        <InfoTip title="ช่องของซับ ASS" tip={ASS_TIP} />
        {!ass && <button type="button" className="btn btn-ghost btn-sm" onClick={p.onToAss} title="เปลี่ยนซับนี้เป็น ASS ในหน้านี้ก่อน แล้วบันทึกเป็นไฟล์ .ass ใหม่ ไฟล์ SRT เดิมไม่ถูกแตะ" data-se-toass>เปลี่ยนเป็น ASS</button>}
      </div>
      <div className="se-erow">
        {([["b", "ตัวหนา", IbBold], ["i", "ตัวเอียง", IbItalic], ["u", "ขีดเส้นใต้", IbUnderline], ["s", "ขีดฆ่า", IbStrike]] as const).map(([t, name, Ic]) => (
          <button key={t} type="button" className="btn btn-ghost btn-sm se-ib" title={`${name} ห่อข้อความที่เลือก`} aria-label={name} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap(t, name)} data-se-tag={t}><Ic size={15} /></button>
        ))}
        <span className="se-sep" />
        {COLORS.map((cl) => (
          <button key={cl.tag} type="button" className={"btn btn-ghost btn-sm se-ib" + (ass ? "" : " btn-wait")} aria-disabled={!ass || undefined} title={ass ? `${cl.name} ของข้อความที่เลือก` : noAss} aria-label={cl.name}
            onMouseDown={(e) => e.preventDefault()} onClick={() => ass && openColor(cl)} data-se-color={cl.tag}>
            <IbDrop size={15} /><i className="se-swatch" style={{ background: ass ? colorNow(cl) : "transparent" }} />
          </button>
        ))}
        <input ref={pick} type="color" className="se-colorpick" tabIndex={-1} aria-hidden="true" />
        <button type="button" className={"btn btn-ghost btn-sm" + (ass ? "" : " btn-wait")} aria-disabled={!ass || undefined} title={ass ? "เลือกฟอนต์กับขนาดของข้อความที่เลือก" : noAss} onMouseDown={(e) => e.preventDefault()} onClick={() => ass && font()} data-se-fn><IbFont size={15} />fn</button>
        <span style={{ flex: 1 }} />
        <button type="button" className={"btn btn-sm " + (showOrig ? "btn-main" : "btn-ghost")} aria-pressed={showOrig} onClick={() => setShowOrig(!showOrig)} title="แสดงข้อความของบรรทัดนี้ตอนเปิดไฟล์ ไว้เทียบกับที่แก้" data-se-showorig><IbOriginal size={15} />แสดงต้นฉบับ</button>
        <button type="button" className={"btn btn-sm " + (p.orig != null ? "btn-ghost" : "btn-wait")} aria-disabled={p.orig == null || undefined} title={p.orig != null ? "แทนข้อความที่เลือกด้วยข้อความตอนเปิดไฟล์" : "บรรทัดนี้เพิ่มใหม่ ไม่มีต้นฉบับ"}
          onMouseDown={(e) => e.preventDefault()} onClick={() => { if (p.orig == null) return; const [a, b] = sel(); const o = toBox(p.orig, doc); applyBox({ text: box.slice(0, a) + o + box.slice(b), a: a + o.length, b: a + o.length }, "แทรกต้นฉบับ"); }} data-se-insorig>แทรกต้นฉบับ</button>
        <button type="button" className={"btn btn-sm " + (reverted ? "btn-wait" : "btn-ghost")} aria-disabled={reverted || undefined} title={!p.savedEv ? "บรรทัดนี้เพิ่มใหม่ ย้อนไม่ได้ ลบบรรทัดแทน" : reverted ? "บรรทัดนี้ยังไม่ได้แก้" : "คืนทุกช่องของบรรทัดนี้เป็นแบบที่บันทึกล่าสุด"}
          onClick={() => { const s = p.savedEv; if (!s || reverted) return; edit("ย้อนบรรทัด", (d) => ({ ...d, events: d.events.map((e) => (e.id === id ? s : e)) })); }} data-se-revert><IbRevert size={15} />ย้อน</button>
        <button type="button" className={"btn btn-sm " + (ev.text ? "btn-ghost" : "btn-wait")} aria-disabled={!ev.text || undefined} title={ev.text ? "ลบข้อความของบรรทัดนี้ เวลายังอยู่" : "ไม่มีข้อความให้ลบ"} onClick={() => ev.text && set({ text: "" }, "ลบข้อความ")} data-se-clear><IbEraser size={15} />ลบข้อความ</button>
      </div>
      {showOrig && <div className="se-orig" data-se-orig><b>ต้นฉบับ</b><span>{p.orig != null ? toBox(p.orig, doc) || "บรรทัดนี้ไม่มีข้อความตอนเปิดไฟล์" : "บรรทัดนี้เพิ่มใหม่ ไม่มีต้นฉบับ"}</span></div>}
      <div className={"se-textwrap" + (hl ? " se-hlon" : "")} data-se-textwrap>
      {/* ขึ้นบรรทัดท้ายเผื่อไว้ ช่องพิมพ์ที่ข้อความจบด้วยขึ้นบรรทัดสูงกว่าหนึ่งบรรทัด ความสูงของสองชั้นต้องเท่ากันถึงเลื่อนตรงกัน */}
      {hl && <pre ref={hlPre} className="se-texthl" aria-hidden="true" data-se-texthl>{hl.map((x, i) => <span key={i} className={"sx-" + x.s}>{x.t}</span>)}{"\n"}</pre>}
      <textarea ref={ta} className="se-text" value={box} spellCheck={false} aria-label="ข้อความของบรรทัด" rows={2} onScroll={syncHl}
        onChange={(e) => set({ text: fromBox(e.target.value, doc) }, "แก้ข้อความ", `text:${id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); p.onNext(true); }
        }} data-se-text />
      </div>
      <div className="se-erow se-foot">
        <button type="button" className={"btn btn-sm " + (p.why?.prev ? "btn-wait" : "btn-ghost")} aria-disabled={!!p.why?.prev || undefined} onClick={() => { if (!p.why?.prev) p.onPrev(); }} title={p.why?.prev ?? "บรรทัดก่อน (ลูกศรขึ้นในตาราง)"} data-se-prev><IbBack size={15} />บรรทัดก่อน</button>
        <button type="button" className={"btn btn-sm " + (p.why?.next ? "btn-wait" : "btn-ghost")} aria-disabled={!!p.why?.next || undefined} onClick={() => { if (!p.why?.next) p.onNext(false); }} title={p.why?.next ?? "บรรทัดถัดไป (ลูกศรลงในตาราง)"} data-se-next><IbNext size={15} />บรรทัดถัดไป</button>
        <InfoTip title="วิธีพิมพ์และคีย์ลัด" tip={TYPE_TIP} />
        <span className="se-sep" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onInsert} title="แทรกบรรทัดว่างต่อจากบรรทัดนี้ เริ่มที่เวลาจบของบรรทัดนี้ ยาว 3 วินาที" data-se-insert><IcPlus size={15} />แทรกบรรทัด</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onSplit(sel()[0])} title="ตัดข้อความตรงเคอร์เซอร์เป็นสองบรรทัด แบ่งเวลาตามสัดส่วนความยาวข้อความ" data-se-split><IbSplit size={15} />แยก</button>
        <button type="button" className={"btn btn-sm " + (p.why?.join ? "btn-wait" : "btn-ghost")} aria-disabled={!!p.why?.join || undefined} onClick={() => { if (!p.why?.join) p.onJoin(); }} title={p.why?.join ?? "รวมบรรทัดที่เลือกไว้ (เลือกบรรทัดเดียวรวมกับบรรทัดถัดไป) ต่อข้อความด้วยเว้นวรรคแบบ Aegisub เวลาตั้งแต่เริ่มบรรทัดแรกถึงจบบรรทัดสุดท้าย"} data-se-join><IbMerge size={15} />รวมกับถัดไป</button>
        <button type="button" className={"btn btn-sm " + (p.why?.del ? "btn-wait" : "btn-bad")} aria-disabled={!!p.why?.del || undefined} onClick={() => { if (!p.why?.del) p.onDelete(); }} title={p.why?.del ?? "ลบบรรทัดที่เลือก เลิกทำได้"} data-se-delete><IbTrash size={15} />ลบ</button>
        <span style={{ flex: 1 }} />
        <span className={"se-cps" + (c > CPS_MAX ? " bad" : "")} data-se-cps><span className="nw">{Math.round(c)} ตัวต่อวินาที</span></span>
        <InfoTip title="ตัวอักษรต่อวินาที" tip={CPS_TIP} />
      </div>
    </div>
  );
}

/** แถวเดิมของบรรทัดนี้ตอนบันทึกล่าสุด */
export function savedOf(id: number) {
  return getSubEdit().saved?.events.find((e) => e.id === id);
}
