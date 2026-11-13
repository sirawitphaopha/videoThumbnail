/* คำสั่งเมนูเวลาและแก้ไขของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 6 · BUGS ข้อ 109 · ไฟล์ค้นคว้าหัวข้อ 4 กับ 9)
   ทุกฟังก์ชันรับเอกสารแล้วคืนเอกสารใหม่ ไม่แตะ store เอง หน้าแก้ซับเรียกผ่าน edit() ให้เลิกทำได้ทีละคำสั่ง
   แปลจากซอร์ส Aegisub ทีละคำสั่ง
     เลื่อนเวลา dialog_shift_times.cpp Process Shift · ปรับเวลาทั้งไฟล์ dialog_timing_processor.cpp Process safe_time get_closest_kf
     สอดเวลาไปยังภาพ ไปยังฉาก เลื่อนไปเฟรมปัจจุบัน ทำให้เวลาต่อกัน command/time.cpp
     แทรก ทำสำเนา แยกที่เฟรม รวม คัดลอก วาง วางทับ command/subtitle.cpp edit.cpp · เรียง ย้าย สลับ command/grid.cpp ass_file.cpp
     เลือกบรรทัด dialog_selection.cpp · ค้นและแทนที่ search_replace_engine.cpp
   เวลาบนภาพหนัง = เวลาซับ + ดีเลย์ของแทร็ก (d) คิดเฟรมจากเวลาบนภาพ แล้วลบดีเลย์กลับเป็นเวลาซับ
   เวลาที่คำนวณได้ปัดแบบที่ไฟล์เก็บ (ASS หนึ่งในร้อยวินาที) และไม่ต่ำกว่าศูนย์ */
import type { SubDoc, SubEvent } from "./api";
import { fmtTime, isAss, parseTime, snapMs } from "./subText";
import type { Framerate } from "./vidFrames";

const T = (ms: number, d: SubDoc) => snapMs(Math.max(0, Math.round(ms)), d);
/** ระยะเวลาตั้งต้นของบรรทัดใหม่ (Timing/Default Duration ของ Aegisub) */
export const DEFAULT_DUR = 3000;

function newIds(d: SubDoc) {
  let n = 0;
  for (const e of d.events) n = Math.max(n, e.id);
  for (const s of d.styles) n = Math.max(n, s.id);
  return () => ++n;
}
/** บรรทัดใหม่จากบรรทัดเดิม · ล้างข้อความดิบที่อ่านจากไฟล์ ตัวเขียนจะเขียนบรรทัดนี้ใหม่ทั้งบรรทัด */
const fresh = (e: SubEvent, id: number, patch: Partial<SubEvent> = {}): SubEvent => ({ ...e, id, ident: null, pre: [], raw: [], ...patch });

/* ---------------------------------------------------------------- เลื่อนเวลา */

export type ShiftOpts = {
  /** เลื่อนเป็นเวลา (ms) หรือเป็นเฟรม */
  byTime: boolean;
  amount: number;
  back: boolean;
  /** 0 ทุกบรรทัด · 1 บรรทัดที่เลือก · 2 ตั้งแต่บรรทัดที่เลือกลงไป */
  affect: 0 | 1 | 2;
  /** 0 ทั้งเริ่มและจบ · 1 เฉพาะเริ่ม · 2 เฉพาะจบ */
  times: 0 | 1 | 2;
};
export function shiftTimes(d: SubDoc, sel: Set<number>, o: ShiftOpts, fr: Framerate | null, delay: number): SubDoc {
  const n = o.back ? -o.amount : o.amount;
  if (!n || (!o.byTime && !fr)) return d;
  const sh = (t: number, type: "start" | "end") => o.byTime ? t + n : fr!.timeAt(n + fr!.frameAt(t + delay, type), type) - delay;
  let seen = false;
  return { ...d, events: d.events.map((e) => {
    const on = sel.has(e.id);
    if (on) seen = true;
    if (!on && (o.affect === 1 || (o.affect === 2 && !seen))) return e;
    return { ...e, start: o.times !== 2 ? T(sh(e.start, "start"), d) : e.start, end: o.times !== 1 ? T(sh(e.end, "end"), d) : e.end };
  }) };
}

/* ---------------------------------------------------------------- ปรับเวลาทั้งไฟล์ (Timing Post-Processor) */

export type PostOpts = {
  leadIn: number | null;
  leadOut: number | null;
  /** ต่อบรรทัดที่ใกล้กัน gap ห่างไม่เกิน overlap ซ้อนไม่เกิน bias จุดต่อ 0 ถึง 1 */
  adjacent: { gap: number; overlap: number; bias: number } | null;
  /** ดูดเข้า keyframe · เริ่มก่อน หลัง จบก่อน หลัง ms */
  keys: { sb: number; sa: number; eb: number; ea: number } | null;
  onlySel: boolean;
  /** สไตล์ที่ทำ (ASS) · null = ทุกสไตล์ */
  styles: Set<string> | null;
};
/** ค่าตั้งต้นของ Aegisub (Tool/Timing Post Processor ใน default_config.json) */
export const POST_DEFAULT: PostOpts = { leadIn: 100, leadOut: 350, adjacent: { gap: 300, overlap: 50, bias: 0.9 }, keys: { sb: 200, sa: 150, eb: 200, ea: 250 }, onlySel: false, styles: null };

type Box = { e: SubEvent; start: number; end: number };
const collides = (a: Box, b: Box) => (a.start < b.start ? b.start < a.end : a.start < b.end);

/** คืนเอกสารใหม่ หรือข้อความผิดพลาดเมื่อมีบรรทัดที่เวลาจบก่อนเริ่ม (Aegisub หยุดทั้งหมด) */
export function postProcess(d: SubDoc, sel: Set<number>, o: PostOpts, fr: Framerate | null, keys: number[], delay: number): SubDoc | string {
  const ok = (e: SubEvent) => !e.comment && (!o.styles || !isAss(d) || o.styles.has(e.style)) && (!o.onlySel || sel.has(e.id));
  const list: Box[] = d.events.filter(ok).map((e) => ({ e, start: e.start, end: e.end }));
  const bad = list.find((b) => b.start > b.end);
  if (bad) return `บรรทัดที่ ${d.events.indexOf(bad.e) + 1} เวลาจบก่อนเวลาเริ่ม แก้บรรทัดนั้นก่อนแล้วค่อยปรับเวลา`;
  if (!list.length) return d;
  list.sort((a, b) => a.start - b.start);
  // ทุกครั้งที่ตั้งเวลา ปัดแบบที่ไฟล์เก็บทันที (AssTime ของ Aegisub ปัดเป็นหนึ่งในร้อยวินาทีตอนตั้งค่า ขั้นถัดไปเทียบกับค่าที่ปัดแล้ว)
  // เผื่อหน้า ไม่ล้ำเวลาจบของบรรทัดก่อนหน้าที่ไม่ได้ซ้อนกันอยู่แล้ว (safe_time เทียบทุกบรรทัดก่อนหน้า)
  if (o.leadIn) for (let i = 0; i < list.length; i++) {
    let t = list[i].start - o.leadIn;
    for (let j = i - 1; j >= 0; j--) if (!collides(list[i], list[j])) t = Math.max(t, list[j].end);
    list[i].start = T(t, d);
  }
  if (o.leadOut) for (let i = 0; i < list.length; i++) {
    let t = list[i].end + o.leadOut;
    for (let j = i + 1; j < list.length; j++) if (!collides(list[i], list[j])) t = Math.min(t, list[j].start);
    list[i].end = T(t, d);
  }
  // ต่อบรรทัดที่ใกล้กัน จุดต่ออยู่ที่ bias ของช่องว่าง (ตัดเศษแบบ int ของ C++)
  if (o.adjacent) for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1], cur = list[i];
    const dist = cur.start - prev.end;
    if ((dist < 0 && -dist <= o.adjacent.overlap) || (dist > 0 && dist <= o.adjacent.gap)) {
      const at = T(prev.end + Math.trunc(dist * o.adjacent.bias), d);
      cur.start = at; prev.end = at;
    }
  }
  // ดูดเข้า keyframe ที่ใกล้ที่สุด เวลาจบไปที่เฟรมก่อน keyframe หนึ่งเฟรม ซับไม่ค้างข้ามฉาก
  if (o.keys && fr) {
    const kf = [...keys];
    if (fr.count) kf.push(fr.count - 1);
    kf.sort((a, b) => a - b);
    const closest = (f: number) => {
      let lo = 0, hi = kf.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (kf[m] <= f) lo = m + 1; else hi = m; }
      if (lo >= kf.length) return kf[kf.length - 1];
      return lo === 0 || kf[lo] - f < f - kf[lo - 1] ? kf[lo] : kf[lo - 1];
    };
    if (kf.length) for (const b of list) {
      const s = b.start + delay, en = b.end + delay;
      const sf = fr.frameAt(s, "start"), ef = fr.frameAt(en, "end");
      let c = closest(sf), t = fr.timeAt(c, "start");
      if ((c > sf && t - s <= o.keys.sb) || (c < sf && s - t <= o.keys.sa)) b.start = T(t - delay, d);
      c = closest(ef) - 1; t = fr.timeAt(c, "end");
      if ((c > ef && t - en <= o.keys.eb) || (c < ef && en - t <= o.keys.ea)) b.end = T(t - delay, d);
    }
  }
  const by = new Map(list.map((b) => [b.e.id, b]));
  return { ...d, events: d.events.map((e) => { const b = by.get(e.id); return b ? { ...e, start: T(b.start, d), end: T(b.end, d) } : e; }) };
}

/* ---------------------------------------------------------------- สอดเวลากับภาพ (Ctrl+3 4 5 6) */

/** Ctrl+3 เริ่มที่เฟรมที่แสดง (จบอย่างน้อยถึงเฟรมนั้น) · Ctrl+4 จบที่เฟรมที่แสดง (เริ่มไม่ช้ากว่าเฟรมนั้น) */
export function snapVideo(d: SubDoc, sel: Set<number>, fr: Framerate, pos: number, setStart: boolean, delay: number): SubDoc {
  const s = fr.timeAt(pos, "start") - delay, en = fr.timeAt(pos, "end") - delay;
  return { ...d, events: d.events.map((e) => {
    if (!sel.has(e.id)) return e;
    let start = e.start, end = e.end;
    if (setStart || start > s) start = s;
    if (!setStart || end < en) end = en;
    return { ...e, start: T(start, d), end: T(end, d) };
  }) };
}

/** Ctrl+5 ยาวเต็มฉาก จาก keyframe ก่อนเฟรมที่แสดงถึงเฟรมก่อน keyframe ถัดไป */
export function snapScene(d: SubDoc, sel: Set<number>, fr: Framerate, pos: number, keys: number[], delay: number): SubDoc {
  if (!keys.length) return d;
  let prev = 0, next = 0;
  if (pos < keys[0]) next = keys[0];
  else if (pos >= keys[keys.length - 1]) { prev = keys[keys.length - 1]; next = fr.count || pos + 1; }
  else {
    let lo = 0, hi = keys.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (keys[m] < pos) lo = m + 1; else hi = m; }
    if (keys[lo] === pos) { prev = keys[lo]; next = keys[lo + 1]; } else { prev = keys[lo - 1]; next = keys[lo]; }
  }
  const s = fr.timeAt(prev, "start") - delay, en = fr.timeAt(next - 1, "end") - delay;
  return { ...d, events: d.events.map((e) => (sel.has(e.id) ? { ...e, start: T(s, d), end: T(en, d) } : e)) };
}

/** Ctrl+6 เลื่อนบรรทัดที่เลือกทั้งหมดให้บรรทัดที่กำลังแก้เริ่มที่เฟรมที่แสดง ระยะห่างระหว่างบรรทัดเท่าเดิม */
export function shiftToFrame(d: SubDoc, sel: Set<number>, active: number, fr: Framerate, pos: number, delay: number): SubDoc {
  const a = d.events.find((e) => e.id === active);
  if (!a) return d;
  const by = Math.max(0, fr.timeAt(pos, "start")) - delay - a.start;
  return { ...d, events: d.events.map((e) => (sel.has(e.id) ? { ...e, start: T(e.start + by, d), end: T(e.end + by, d) } : e)) };
}

/** ทำให้เวลาต่อกัน · setStart เริ่มเท่าเวลาจบของบรรทัดก่อน · ไม่งั้นจบเท่าเวลาเริ่มของบรรทัดถัดไป
    เลือกบรรทัดเดียว ทำกับบรรทัดก่อนหรือถัดไปของบรรทัดนั้น (adjoin_lines ของ Aegisub) */
export function adjoin(d: SubDoc, sel: Set<number>, setStart: boolean): SubDoc {
  const ev = d.events.map((e) => ({ ...e }));
  let seen = 0, prevSel = false;
  for (let i = 0; i < ev.length; i++) {
    const cur = sel.has(ev[i].id);
    if (i > 0) {
      if (setStart && cur && (sel.size === 1 || prevSel)) ev[i].start = ev[i - 1].end;
      else if (!setStart && prevSel && (cur || sel.size === 1)) ev[i - 1].end = ev[i].start;
    }
    if (seen === sel.size) break;
    if (cur) seen++;
    prevSel = cur;
  }
  return { ...d, events: ev.map((e, i) => (e.start === d.events[i].start && e.end === d.events[i].end ? d.events[i] : e)) };
}
/** ทำให้เวลาต่อกันได้เฉพาะบรรทัดที่เลือกติดกัน (validate_adjoinable) */
export function adjoinable(d: SubDoc, sel: Set<number>) {
  if (!sel.size) return false;
  if (sel.size === 1 || sel.size === d.events.length) return true;
  const idx = d.events.map((e, i) => (sel.has(e.id) ? i : -1)).filter((i) => i >= 0);
  return idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
}

/* ---------------------------------------------------------------- แทรก ทำสำเนา แยก รวม */

/** แทรกบรรทัดว่างก่อนหรือหลังบรรทัดที่กำลังแก้ ยาว 3 วินาทีแต่ไม่ล้ำบรรทัดอื่น · atVideo = เริ่มที่เวลาของภาพ (เวลาซับ) */
export function insertLine(d: SubDoc, active: number, after: boolean, atVideo: number | null): { doc: SubDoc; id: number } | null {
  const i = d.events.findIndex((e) => e.id === active);
  if (i < 0) return null;
  const a = d.events[i], id = newIds(d)();
  let start: number, end: number;
  if (atVideo != null) { start = atVideo; end = atVideo + DEFAULT_DUR; }
  else if (after) {
    start = a.end; end = start + DEFAULT_DUR;
    for (const e of d.events) if (e.start >= start) end = Math.min(end, e.start);
  } else {
    end = a.start; start = end - DEFAULT_DUR;
    for (const e of d.events) if (e.end <= end) start = Math.max(start, e.end);
  }
  const ne: SubEvent = fresh({ ...a, comment: false, layer: 0, actor: "", marginL: 0, marginR: 0, marginV: 0, effect: "", text: "", suffix: "" }, id, { start: T(start, d), end: T(end, d) });
  const events = d.events.slice();
  events.splice(after ? i + 1 : i, 0, ne);
  return { doc: { ...d, events }, id };
}

/** ทำสำเนาบรรทัดที่เลือก วางต่อท้ายแต่ละกลุ่มที่เลือกติดกัน · shift 1 แยกหลังเฟรมที่แสดง −1 แยกก่อนเฟรมที่แสดง (Ctrl+Shift+D Ctrl+D)
    เฟรมที่แสดงอยู่นอกช่วงบรรทัด สำเนาเป็นแค่เฟรมนั้น (duplicate_lines ของ Aegisub) */
export function duplicate(d: SubDoc, sel: Set<number>, shift: 0 | 1 | -1, fr: Framerate | null, pos: number | null, delay: number): { doc: SubDoc; sel: number[] } {
  const id = newIds(d);
  const out: SubEvent[] = [], made: number[] = [];
  const ev = d.events;
  for (let i = 0; i < ev.length;) {
    if (!sel.has(ev[i].id)) { out.push(ev[i]); i++; continue; }
    let j = i;
    while (j < ev.length && sel.has(ev[j].id)) j++;
    const olds = ev.slice(i, j).map((e) => ({ ...e }));
    const news = olds.map((e) => fresh(e, id()));
    if (shift && fr && pos != null) news.forEach((n, k) => {
      const o = olds[k];
      const os = fr.frameAt(o.start + delay, "start"), oe = fr.frameAt(o.end + delay, "end");
      if (pos < os || pos > oe) { n.start = T(fr.timeAt(pos, "start") - delay, d); n.end = T(fr.timeAt(pos, "end") - delay, d); }
      else if (shift < 0) { o.end = T(fr.timeAt(pos - 1, "end") - delay, d); n.start = T(fr.timeAt(pos, "start") - delay, d); }
      else { o.end = T(fr.timeAt(pos, "end") - delay, d); n.start = T(fr.timeAt(pos + 1, "start") - delay, d); }
    });
    olds.forEach((o, k) => out.push(o.end === ev[i + k].end ? ev[i + k] : o));
    out.push(...news);
    made.push(...news.map((n) => n.id));
    i = j;
  }
  return { doc: { ...d, events: out }, sel: made };
}

/** แยกบรรทัดที่กำลังแก้ตรงเคอร์เซอร์ (ตำแหน่งในข้อความดิบ) · estimate แบ่งเวลาตามสัดส่วนความยาวข้อความ · preserve สองบรรทัดเวลาเดิม · video ที่เฟรมที่แสดง */
export function splitAt(d: SubDoc, active: number, pos: number, mode: "estimate" | "preserve" | "video", fr: Framerate | null, vpos: number | null, delay: number): { doc: SubDoc; id: number } | null {
  const i = d.events.findIndex((e) => e.id === active);
  if (i < 0) return null;
  const a = d.events[i];
  // Aegisub ตัดแค่ช่องว่าง ช่องพิมพ์ของเราแสดง \N เป็นการขึ้นบรรทัดจริง เคอร์เซอร์ต้นบรรทัดที่สองจึงต้องตัด \N ที่ค้างด้วย
  const t1 = a.text.slice(0, pos).replace(/(\s|\\[Nn])+$/, ""), t2 = a.text.slice(pos).replace(/^(\s|\\[Nn])+/, "");
  const id = newIds(d)();
  const n1 = { ...a, text: t1 }, n2 = fresh(a, id, { text: t2 });
  if (mode === "estimate") {
    const len = t1.length + t2.length;
    if (len) { const at = Math.trunc((a.end - a.start) * (t1.length / len)) + a.start; n1.end = n2.start = T(at, d); }
  } else if (mode === "video" && fr && vpos != null) {
    const f = Math.min(Math.max(fr.frameAt(a.start + delay, "start"), vpos), fr.frameAt(a.end + delay, "end"));
    n1.end = n2.start = T(fr.timeAt(f, "end") - delay, d);
  }
  const events = d.events.slice();
  events.splice(i, 1, n1, n2);
  return { doc: { ...d, events }, id };
}

/** รวมบรรทัดที่เลือกเป็นบรรทัดแรก · concat ต่อข้อความด้วยเว้นวรรค · keepFirst เก็บข้อความบรรทัดแรก · เวลาจบมากสุด (combine_lines) */
export function join(d: SubDoc, sel: Set<number>, keepFirst: boolean): { doc: SubDoc; id: number } | null {
  const lines = d.events.filter((e) => sel.has(e.id));
  if (lines.length < 2) return null;
  const first = lines[0];
  const merged = { ...first, text: keepFirst ? first.text : lines.map((e) => e.text).join(" "), end: Math.max(...lines.map((e) => e.end)) };
  const drop = new Set(lines.slice(1).map((e) => e.id));
  return { doc: { ...d, events: d.events.filter((e) => !drop.has(e.id)).map((e) => (e.id === first.id ? merged : e)) }, id: first.id };
}

/* ---------------------------------------------------------------- เรียง ย้าย สลับ */

export type SortKey = "start" | "end" | "style" | "actor" | "effect" | "layer";
const cmp: Record<SortKey, (a: SubEvent, b: SubEvent) => number> = {
  start: (a, b) => a.start - b.start, end: (a, b) => a.end - b.end, layer: (a, b) => a.layer - b.layer,
  style: (a, b) => (a.style < b.style ? -1 : a.style > b.style ? 1 : 0),
  actor: (a, b) => (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0),
  effect: (a, b) => (a.effect < b.effect ? -1 : a.effect > b.effect ? 1 : 0),
};
/** เรียงแบบคงลำดับเดิมเมื่อค่าเท่ากัน · onlySel เรียงแต่ละกลุ่มที่เลือกติดกันแยกกัน ที่เหลืออยู่ที่เดิม (AssFile::Sort) */
export function sortLines(d: SubDoc, key: SortKey, sel: Set<number> | null): SubDoc {
  const c = cmp[key];
  if (!sel) return { ...d, events: d.events.slice().sort(c) };
  const ev = d.events.slice();
  for (let i = 0; i < ev.length;) {
    if (!sel.has(ev[i].id)) { i++; continue; }
    let j = i;
    while (j < ev.length && sel.has(ev[j].id)) j++;
    const part = ev.slice(i, j).sort(c);
    ev.splice(i, j - i, ...part);
    i = j;
  }
  return { ...d, events: ev };
}

/** ย้ายบรรทัดที่เลือกขึ้นหรือลงหนึ่งแถว (move_one ของ Aegisub) · ไม่มีที่ให้ย้ายคืนเอกสารเดิม */
export function moveLines(d: SubDoc, sel: Set<number>, dir: -1 | 1): SubDoc {
  const ev = dir < 0 ? d.events.slice() : d.events.slice().reverse();
  let prev = -1, moved = 0;
  for (let i = 0; i < ev.length; i++) {
    if (!sel.has(ev[i].id)) prev = i;
    else if (prev >= 0) { [ev[i], ev[prev]] = [ev[prev], ev[i]]; prev = i; if (++moved === sel.size) break; }
  }
  if (!moved) return d;
  return { ...d, events: dir < 0 ? ev : ev.reverse() };
}

/** สลับสองบรรทัดที่เลือก */
export function swapLines(d: SubDoc, sel: Set<number>): SubDoc {
  const idx = d.events.map((e, i) => (sel.has(e.id) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 2) return d;
  const ev = d.events.slice();
  [ev[idx[0]], ev[idx[1]]] = [ev[idx[1]], ev[idx[0]]];
  return { ...d, events: ev };
}

/* ---------------------------------------------------------------- เลือกบรรทัด */

export type Field = "text" | "style" | "actor" | "effect";
export type MatchMode = "contains" | "exact" | "regex";
export type SelectOpts = { find: string; field: Field; mode: MatchMode; caseSens: boolean; invert: boolean; dialogue: boolean; comment: boolean; action: "set" | "add" | "sub" | "and" };

/** ตัวเทียบข้อความ · regex ผิดรูปแบบคืนข้อความผิดพลาด */
export function matcher(find: string, mode: MatchMode, caseSens: boolean): ((s: string) => boolean) | string {
  if (mode === "regex") {
    try { const re = new RegExp(find, caseSens ? "u" : "iu"); return (s) => re.test(s); } catch (e) { return `รูปแบบค้นหาไม่ถูกต้อง ${(e as Error).message}`; }
  }
  const f = caseSens ? find : find.toLowerCase();
  return mode === "exact" ? (s) => (caseSens ? s : s.toLowerCase()) === f : (s) => (caseSens ? s : s.toLowerCase()).includes(f);
}

/** เลือกบรรทัดตามเงื่อนไข (dialog_selection.cpp) · คืนเลขบรรทัดที่เลือกใหม่ หรือข้อความผิดพลาด */
export function selectLines(d: SubDoc, cur: number[], o: SelectOpts): number[] | string {
  const m = matcher(o.find, o.mode, o.caseSens);
  if (typeof m === "string") return m;
  const hit = new Set(d.events.filter((e) => (e.comment ? o.comment : o.dialogue) && m(e[o.field]) !== o.invert).map((e) => e.id));
  const c = new Set(cur);
  const keep = (id: number) => o.action === "set" ? hit.has(id) : o.action === "add" ? c.has(id) || hit.has(id) : o.action === "sub" ? c.has(id) && !hit.has(id) : c.has(id) && hit.has(id);
  return d.events.filter((e) => keep(e.id)).map((e) => e.id);
}

/** บรรทัดที่ขึ้นอยู่บนเฟรมที่แสดง (subtitle/select/visible) */
export function visibleAt(d: SubDoc, fr: Framerate, pos: number, delay: number) {
  return d.events.filter((e) => fr.frameAt(e.start + delay, "start") <= pos && fr.frameAt(e.end + delay, "end") >= pos).map((e) => e.id);
}

/* ---------------------------------------------------------------- คัดลอก วาง */

const assTime = (ms: number) => fmtTime(ms, "ass");
/** บรรทัดเป็นข้อความแบบบรรทัด Dialogue ของ ASS (GetEntryData) · ซับ SRT ขึ้นบรรทัดเป็น \N */
export function copyText(d: SubDoc, sel: Set<number>) {
  const ass = isAss(d);
  return d.events.filter((e) => sel.has(e.id)).map((e) => {
    const text = ass ? e.text : e.text.replace(/\r?\n/g, "\\N");
    const f = (s: string) => s.replace(/,/g, ";");
    return `${e.comment ? "Comment" : "Dialogue"}: ${e.layer},${assTime(e.start)},${assTime(e.end)},${f(ass ? e.style || "Default" : "Default")},${f(e.actor)},${e.marginL},${e.marginR},${e.marginV},${f(e.effect)},${text}`;
  }).join("\r\n");
}

/** อ่านข้อความที่วาง · บรรทัด Dialogue หรือ Comment ของ ASS ได้ทุกช่อง บรรทัดอื่นเป็นข้อความของบรรทัดใหม่ (get_dialogue ของ Aegisub) */
export function parsePaste(d: SubDoc, text: string, base: SubEvent): SubEvent[] {
  const id = newIds(d);
  const ass = isAss(d);
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = /^(Dialogue|Comment):\s*(.*)$/.exec(l);
    if (m) {
      const p = m[2].split(",");
      if (p.length >= 10) {
        const [layer, s, e, style, actor, ml, mr, mv, effect] = p;
        const txt = p.slice(9).join(",");
        const st = parseTime(s), en = parseTime(e);
        if (st != null && en != null) {
          return fresh(base, id(), {
            comment: m[1] === "Comment", layer: parseInt(layer, 10) || 0, start: T(st, d), end: T(en, d),
            style: ass ? style : base.style, actor: ass ? actor : "", marginL: parseInt(ml, 10) || 0, marginR: parseInt(mr, 10) || 0, marginV: parseInt(mv, 10) || 0,
            effect: ass ? effect : "", text: ass ? txt : txt.replace(/\\N/g, "\n"),
          });
        }
      }
    }
    return fresh(base, id(), { comment: false, layer: 0, start: 0, end: 0, actor: "", marginL: 0, marginR: 0, marginV: 0, effect: "", text: l, suffix: "" });
  });
}

/** ช่องที่วางทับได้ (Tool/Paste Lines Over/Fields ของ Aegisub เรียงตามนี้) */
export const OVER_FIELDS = ["comment", "layer", "start", "end", "style", "actor", "marginL", "marginR", "marginV", "effect", "text"] as const;
export type OverField = (typeof OVER_FIELDS)[number];
/** วางทับ เฉพาะช่องที่เลือก · เลือกไว้บรรทัดเดียว ทับตั้งแต่บรรทัดที่กำลังแก้ลงไป · เลือกหลายบรรทัด ทับเฉพาะบรรทัดที่เลือกตามลำดับในตาราง (edit_line_paste_over) */
export function pasteOver(d: SubDoc, sel: Set<number>, active: number, lines: SubEvent[], fields: Set<OverField>): { doc: SubDoc; n: number } {
  const i0 = d.events.findIndex((e) => e.id === active);
  const at = sel.size >= 2 ? d.events.map((e, i) => (sel.has(e.id) ? i : -1)).filter((i) => i >= 0)
    : i0 < 0 ? [] : d.events.map((_, i) => i).filter((i) => i >= i0);
  const events = d.events.slice();
  let n = 0;
  for (let k = 0; k < lines.length && k < at.length; k++) {
    const old = events[at[k]], src = lines[k];
    const nx = { ...old } as SubEvent & Record<string, unknown>;
    for (const f of fields) (nx as Record<string, unknown>)[f] = src[f];
    events[at[k]] = nx;
    n++;
  }
  return { doc: n ? { ...d, events } : d, n };
}

/* ---------------------------------------------------------------- ค้นและแทนที่ */

export type FindOpts = { find: string; replace: string; fields: Field[]; caseSens: boolean; regex: boolean; wholeWord: boolean; skipTags: boolean; skipComments: boolean; onlySel: boolean };

/** รูปแบบค้นหาแบบ global · ตรงทั้งคำ ใช้ขอบที่ไม่ใช่ตัวอักษรหรือตัวเลขทุกภาษา (ภาษาไทยไม่เว้นวรรคระหว่างคำ จึงเจอเฉพาะคำที่มีเว้นวรรคหรือเครื่องหมายคั่น) */
export function findRegex(o: FindOpts): RegExp | string {
  if (!o.find) return "พิมพ์คำที่จะค้นก่อน";
  const body = o.regex ? o.find : o.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const src = o.wholeWord ? `(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])` : body;
  try { return new RegExp(src, `g${o.caseSens ? "" : "i"}u`); } catch (e) { return `รูปแบบค้นหาไม่ถูกต้อง ${(e as Error).message}`; }
}

/** ช่วงที่ข้ามได้ (แท็ก ASS ในปีกกา แท็ก HTML ของ SRT) */
const tagSpans = (s: string, ass: boolean) => { const out: [number, number][] = []; const re = ass ? /\{[^}]*\}/g : /<[^>]*>/g; let m; while ((m = re.exec(s))) out.push([m.index, m.index + m[0].length]); return out; };
const inSpan = (i: number, sp: [number, number][]) => sp.some(([a, b]) => i >= a && i < b);

export type Hit = { id: number; field: Field; at: number; len: number };
/** ที่เจอทั้งหมดเรียงตามบรรทัดและตำแหน่ง */
export function findAll(d: SubDoc, sel: Set<number>, o: FindOpts): Hit[] | string {
  const re = findRegex(o);
  if (typeof re === "string") return re;
  const ass = isAss(d), out: Hit[] = [];
  for (const e of d.events) {
    if (o.skipComments && e.comment) continue;
    if (o.onlySel && !sel.has(e.id)) continue;
    for (const f of o.fields) {
      const s = e[f];
      const sp = f === "text" && o.skipTags ? tagSpans(s, ass) : [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        if (!inSpan(m.index, sp)) out.push({ id: e.id, field: f, at: m.index, len: m[0].length });
      }
    }
  }
  return out;
}

/** ข้อความแทนที่แบบรูปแบบค้นหา $& ทั้งที่เจอ $1 ถึง $99 กลุ่มที่จับ $$ เครื่องหมาย $ · แบบธรรมดาใช้ตามที่พิมพ์ */
const expand = (o: FindOpts, m: RegExpExecArray | string[]) => o.regex ? o.replace.replace(/\$(\$|&|\d{1,2})/g, (_, k: string) => (k === "$" ? "$" : k === "&" ? m[0] : m[parseInt(k, 10)] ?? "")) : o.replace;

/** แทนที่ทั้งหมด · คืนเอกสารใหม่กับจำนวนที่แทน */
export function replaceAll(d: SubDoc, sel: Set<number>, o: FindOpts): { doc: SubDoc; n: number } | string {
  const re = findRegex(o);
  if (typeof re === "string") return re;
  const ass = isAss(d);
  let n = 0;
  const events = d.events.map((e) => {
    if ((o.skipComments && e.comment) || (o.onlySel && !sel.has(e.id))) return e;
    let ne = e;
    for (const f of o.fields) {
      const s = ne[f];
      const sp = f === "text" && o.skipTags ? tagSpans(s, ass) : [];
      let out = "", last = 0, m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(s))) {
        if (!m[0].length) { re.lastIndex++; continue; }
        if (inSpan(m.index, sp)) continue;
        out += s.slice(last, m.index) + expand(o, m);
        last = m.index + m[0].length;
        n++;
      }
      if (last) ne = { ...ne, [f]: out + s.slice(last) };
    }
    return ne;
  });
  return { doc: n ? { ...d, events } : d, n };
}

/** แทนที่หนึ่งจุด · จับใหม่ตรงตำแหน่งเดิมในข้อความเต็ม กลุ่มที่จับกับขอบคำจึงตรงกับตอนค้น */
export function replaceOne(d: SubDoc, h: Hit, o: FindOpts): SubDoc {
  const e = d.events.find((x) => x.id === h.id);
  if (!e) return d;
  const s = e[h.field];
  const re = findRegex(o);
  let m: RegExpExecArray | string[] = [s.slice(h.at, h.at + h.len)];
  if (typeof re !== "string") { const r2 = new RegExp(re.source, re.flags.replace("g", "") + "y"); r2.lastIndex = h.at; m = r2.exec(s) ?? m; }
  const ns = s.slice(0, h.at) + expand(o, m) + s.slice(h.at + m[0].length);
  return { ...d, events: d.events.map((x) => (x.id === h.id ? { ...x, [h.field]: ns } : x)) };
}

/** ไปที่บรรทัดหรือเวลา · เลขบรรทัด (เริ่ม 1) หรือเวลา (บรรทัดแรกที่ขึ้นอยู่ตอนนั้น ไม่มีใช้บรรทัดที่เริ่มหลังเวลานั้น) */
export function gotoTarget(d: SubDoc, q: string): number | null {
  const s = q.trim();
  if (/^\d+$/.test(s)) { const e = d.events[parseInt(s, 10) - 1]; return e ? e.id : null; }
  const t = parseTime(s);
  if (t == null) return null;
  const on = d.events.find((e) => !e.comment && e.start <= t && t < e.end) ?? d.events.find((e) => !e.comment && e.start >= t);
  return on ? on.id : null;
}
