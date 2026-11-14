/* เครื่องมือบนภาพของหน้าแก้ซับ ตัวคิดพิกัดกับแท็กตำแหน่ง (BUGS ข้อ 111 ส่วนที่สองและสาม)
   แปลจากซอร์ส Aegisub ทีละฟังก์ชัน
   - src/visual_tool.cpp ToScriptCoords FromScriptCoords GetLinePosition GetLineOrigin GetLineMove SetOverride
   - src/visual_tool_cross.cpp เครื่องมือกากบาท ข้อความพิกัด ดับเบิลคลิกย้ายบรรทัดที่เลือก
   - src/visual_tool_drag.cpp เครื่องมือลากจัดตำแหน่ง จุดจับ \pos \move \org สลับ \move กับ \pos
   - src/visual_feature.cpp ขนาดจุดจับ · src/utils.cpp float_to_string · src/vector2d.cpp Str PStr DStr
   ต่างจาก Aegisub ที่เดียว แก้แท็กเฉพาะในกลุ่มแท็กแรกตามตัวอักษรเดิม ไม่จัดรูปแท็กอื่นของบรรทัดใหม่ทั้งบรรทัด
   ซับของโปรแกรมนี้มีดีเลย์ได้ (เวลาภาพ = เวลาซับ + ดีเลย์) Aegisub ไม่มี เวลาที่เทียบกับภาพจึงบวกดีเลย์ก่อนทุกที่

   Copyright (c) 2011, 2013, Thomas Goyne <plorkyeran@aegisub.org>

   Permission to use, copy, modify, and distribute this software for any
   purpose with or without fee is hereby granted, provided that the above
   copyright notice and this permission notice appear in all copies.

   THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

   Aegisub Project http://www.aegisub.org/ */
import type { SubDoc, SubEvent } from "./api";
import { findStyle, playRes, readStyle } from "./subStyle";
import type { Framerate } from "./vidFrames";

export type V2 = { x: number; y: number };
/** ที่อยู่ของภาพบนชั้นเครื่องมือ (video_pos video_size ของ Aegisub) เป็นจุดบนจอ */
export type Lay = { x: number; y: number; w: number; h: number };

/* ---------------------------------------------------------------- ตัวเลข */

/** float_to_string ทศนิยมไม่เกิน precision ตำแหน่ง ตัดศูนย์ท้าย ไม่เหลือจุดเปล่า (640.000 เป็น 640) */
export function fts(v: number, precision = 3) {
  const s = v.toFixed(precision);
  const dot = s.indexOf(".");
  if (dot < 0) return s;
  let end = s.length;
  while (end > dot + 1 && s[end - 1] === "0") end--;
  return end === dot + 1 ? s.slice(0, dot) : s.slice(0, end);
}
export const vStr = (v: V2) => `${fts(v.x)},${fts(v.y)}`;
export const pStr = (v: V2) => `(${vStr(v)})`;
/** DStr ตัดทศนิยมทิ้งแบบ (int) ของ C++ */
export const dStr = (v: V2) => `${Math.trunc(v.x)},${Math.trunc(v.y)}`;

const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });

/* ---------------------------------------------------------------- พิกัด */

export const toScript = (p: V2, lay: Lay, res: [number, number]): V2 => ({ x: ((p.x - lay.x) * res[0]) / lay.w, y: ((p.y - lay.y) * res[1]) / lay.h });
export const fromScript = (p: V2, lay: Lay, res: [number, number]): V2 => ({ x: (p.x * lay.w) / res[0] + lay.x, y: (p.y * lay.h) / res[1] + lay.y });

/** ข้อความพิกัดของเครื่องมือกากบาท ภาพบนจอใหญ่กว่าความละเอียดสคริปต์แสดงทศนิยม 3 ตำแหน่ง ไม่งั้นจำนวนเต็ม (VisualToolCross::Text) */
export const crossText = (v: V2, lay: Lay, res: [number, number]) => (lay.w > res[0] ? vStr(v) : dStr(v));

/* ---------------------------------------------------------------- อ่านแท็ก */

type Tag = { name: string; params: string[]; a: number; b: number };
type Block = { a: number; b: number; tags: Tag[] };

/** แยกแท็กชั้นนอกในข้อความของกลุ่ม {…} ที่ตำแหน่ง off · แท็กที่ซ้อนใน \t(…) ไม่นับ */
function splitTags(text: string, a: number, b: number): Tag[] {
  const out: Tag[] = [];
  let depth = 0, start = -1;
  const push = (end: number) => {
    if (start < 0) return;
    const raw = text.slice(start + 1, end);
    const m = /^(pos|move|org|an|a|fad|fade|clip|iclip)(?![a-z])\s*(.*)$/is.exec(raw) ?? /^([a-z0-9]+)(.*)$/is.exec(raw);
    let name = m ? m[1].toLowerCase() : "";
    let rest = m ? m[2].trim() : "";
    // \a ตามด้วยตัวเลขเท่านั้น (\alpha ไม่ใช่) · \an ตามด้วยตัวเลข
    if (name === "a" && !/^\d/.test(rest)) name = "?";
    if (rest.startsWith("(")) rest = rest.slice(1, rest.endsWith(")") ? -1 : undefined);
    out.push({ name, params: rest === "" ? [] : rest.split(",").map((s) => s.trim()), a: start, b: end });
  };
  for (let i = a; i < b; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === "\\" && depth === 0) { push(i); start = i; }
  }
  push(b);
  return out;
}

/** กลุ่มแท็กทุกกลุ่ม · กลุ่ม {…} ที่ไม่มี \ เป็นความเห็น ไม่ใช่กลุ่มแท็ก (AssDialogue::ParseTags) */
function blocks(text: string): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < text.length) {
    const o = text.indexOf("{", i);
    if (o < 0) break;
    const c = text.indexOf("}", o + 1);
    if (c < 0) break;
    if (text.slice(o + 1, c).includes("\\")) out.push({ a: o, b: c, tags: splitTags(text, o + 1, c) });
    i = c + 1;
  }
  return out;
}

/** ค่าของแท็กแรกที่เจอในทุกกลุ่ม (find_tag) */
function findTag(text: string, name: string): string[] | null {
  for (const b of blocks(text)) for (const t of b.tags) if (t.name === name) return t.params;
  return null;
}

const num = (s: string | undefined) => { if (s === undefined || s.trim() === "") return NaN; return Number(s); };
/** จุดจากค่าของแท็ก ตำแหน่ง xi yi · ค่าไม่ครบหรือไม่ใช่ตัวเลขได้ null (vec_or_bad) */
function vecOrBad(p: string[] | null, xi: number, yi: number): V2 | null {
  if (!p || p.length <= xi || p.length <= yi) return null;
  const x = num(p[xi]), y = num(p[yi]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
const int = (s: string | undefined, def: number) => { const v = num(s); return Number.isFinite(v) ? Math.trunc(v) : def; };

/** การจัดวางของ SSA เป็นของ ASS (AssStyle::SsaToAss) */
export function ssaToAss(a: number) {
  return ({ 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 } as Record<number, number>)[a] ?? 2;
}

/** ตำแหน่งของบรรทัดเป็นพิกัดสคริปต์ \pos ก่อน แล้ว \move แล้วคิดจากการจัดวางกับระยะขอบ (GetLinePosition) */
export function linePosition(d: SubDoc, e: SubEvent): V2 {
  const pos = vecOrBad(findTag(e.text, "pos"), 0, 1);
  if (pos) return pos;
  const mv = vecOrBad(findTag(e.text, "move"), 0, 1);
  if (mv) return mv;
  const res = playRes(d);
  const margin = [e.marginL, e.marginR, e.marginV];
  let align = 2;
  const st = findStyle(d, e.style);
  if (st) {
    const v = readStyle(d, st);
    align = d.kind === "ssa" ? ssaToAss(v.align) : v.align;
    const sm = [v.mL, v.mR, v.mV];
    for (let i = 0; i < 3; i++) if (margin[i] === 0) margin[i] = sm[i];
  }
  let ovr = 0;
  const an = findTag(e.text, "an");
  if (an) ovr = int(an[0], ovr);
  else { const a = findTag(e.text, "a"); if (a) ovr = ssaToAss(int(a[0], 2)); }
  if (ovr > 0 && ovr <= 9) align = ovr;
  const hor = (align - 1) % 3, vert = Math.trunc((align - 1) / 3);
  const x = hor === 0 ? margin[0] : hor === 1 ? Math.trunc((res[0] + margin[0] - margin[1]) / 2) : res[0] - margin[1];
  const y = vert === 0 ? res[1] - margin[2] : vert === 1 ? Math.trunc(res[1] / 2) : margin[2];
  return { x, y };
}

export const lineOrigin = (e: SubEvent) => vecOrBad(findTag(e.text, "org"), 0, 1);

/** \move(x1,y1,x2,y2[,t1,t2]) · เวลาไม่ใส่เป็น 0 (GetLineMove) */
export function lineMove(e: SubEvent): { p1: V2; p2: V2; t1: number; t2: number } | null {
  const p = findTag(e.text, "move");
  if (!p) return null;
  const p1 = vecOrBad(p, 0, 1), p2 = vecOrBad(p, 2, 3);
  if (!p1 || !p2) return null;
  return { p1, p2, t1: int(p[4], 0), t2: int(p[5], 0) };
}

/* ---------------------------------------------------------------- ใส่แท็ก */

export type PosTag = "pos" | "move" | "org";

/** ใส่แท็กในกลุ่มแท็กแรก ลบแท็กชื่อเดียวกันกับแท็กคู่ (\pos กับ \move) ในกลุ่มนั้นก่อน ต่อแท็กใหม่ท้ายกลุ่ม
    บรรทัดที่ไม่ได้ขึ้นต้นด้วยกลุ่มแท็ก ใส่กลุ่มใหม่หน้าบรรทัด (SetOverride) · value เช่น (640,90) */
export function setOverride(text: string, tag: PosTag, value: string): string {
  const pair = tag === "pos" ? "move" : tag === "move" ? "pos" : null;
  const first = text.startsWith("{") ? blocks(text)[0] : undefined;
  if (!first || first.a !== 0) return `{\\${tag}${value}}${text}`;
  let inner = "";
  let at = first.a + 1;
  for (const t of first.tags) {
    if (t.name === tag || (pair && t.name === pair)) { inner += text.slice(at, t.a); at = t.b; }
  }
  inner += text.slice(at, first.b);
  return `{${inner}\\${tag}${value}${text.slice(first.b)}`;
}

/* ---------------------------------------------------------------- บรรทัดที่ขึ้นบนภาพ */

/** บรรทัดที่ขึ้นในเฟรม pos · มีตารางเฟรมคิดแบบ Aegisub (IsDisplayed) ไม่มีคิดจากเวลา · d ดีเลย์ของซับ */
export function shownAt(e: SubEvent, d: number, tVideo: number, fr: Framerate | null, pos: number | null) {
  if (e.comment) return false;
  if (fr && pos != null) return fr.frameAt(e.start + d, "start") <= pos && pos <= fr.frameAt(e.end + d, "end");
  return e.start + d <= tVideo && tVideo < e.end + d;
}

/* ---------------------------------------------------------------- จุดจับของเครื่องมือลาก */

export type FeatKind = "start" | "end" | "org";
export type Feat = {
  key: string; kind: FeatKind; line: number; pos: V2;
  /** เวลาของจุด ms นับจากเวลาเริ่มของบรรทัด (t1 t2 ของ \move) */
  time: number;
  /** ลำดับชั้นตอนชี้ทับกัน จุดตั้งต้นต่ำสุด จุดปลาย \move สูงสุด */
  layer: number;
};
export const featKey = (line: number, kind: FeatKind) => `${line}:${kind}`;

/** จุดจับของทุกบรรทัดที่ขึ้นบนภาพ เรียงตามบรรทัดในไฟล์ (VisualToolDrag::MakeFeatures) */
export function makeFeatures(d: SubDoc, lines: SubEvent[], lay: Lay): Feat[] {
  const res = playRes(d);
  const out: Feat[] = [];
  for (const e of lines) {
    const mv = lineMove(e);
    out.push({ key: featKey(e.id, "start"), kind: "start", line: e.id, pos: fromScript(linePosition(d, e), lay, res), time: mv ? mv.t1 : 0, layer: 0 });
    if (mv) out.push({ key: featKey(e.id, "end"), kind: "end", line: e.id, pos: fromScript(mv.p2, lay, res), time: mv.t2, layer: 1 });
    const org = lineOrigin(e);
    if (org) out.push({ key: featKey(e.id, "org"), kind: "org", line: e.id, pos: fromScript(org, lay, res), time: 0, layer: -1 });
  }
  return out;
}

/** เมาส์อยู่บนจุดจับไหม (VisualDraggableFeature::IsMouseOver) สี่เหลี่ยม ±6 วงกลมรัศมี 6 สามเหลี่ยมหัวลง */
export function overFeat(f: Feat, m: V2) {
  const dx = m.x - f.pos.x, dy = m.y - f.pos.y;
  if (f.kind === "start") return Math.abs(dx) < 6 && Math.abs(dy) < 6;
  if (f.kind === "end") return dx * dx + dy * dy < 36;
  if (dy < -10 || dy > 6) return false;
  const y = dy - 6;
  return 16 * dx + 9 * y < 0 && 16 * dx - 9 * y > 0;
}

/** จุดจับใต้เมาส์ ชั้นสูงกว่าชนะ ชั้นเท่ากันตัวหลังชนะ */
export function hitFeat(feats: Feat[], m: V2): Feat | null {
  let best: Feat | null = null, max = -Infinity;
  for (const f of feats) if (overFeat(f, m) && f.layer >= max) { best = f; max = f.layer; }
  return best;
}

/** ลากโดยกด Shift เลื่อนแกนเดียว แกนที่ลากไกลกว่า (Vector2D::SingleAxis) */
export const singleAxis = (v: V2): V2 => (Math.abs(v.x) < Math.abs(v.y) ? { x: 0, y: v.y } : { x: v.x, y: 0 });

/** ข้อความใหม่ของบรรทัดหลังลากจุด f (VisualToolDrag::UpdateDrag) · feats คือจุดทุกจุดตอนนี้ (ตำแหน่งระหว่างลาก) */
export function dragText(text: string, f: Feat, feats: Feat[], lay: Lay, res: [number, number]): string {
  if (f.kind === "org") return setOverride(text, "org", pStr(toScript(f.pos, lay, res)));
  const start = f.kind === "start" ? f : feats.find((x) => x.line === f.line && x.kind === "start");
  const end = feats.find((x) => x.line === f.line && x.kind === "end");
  if (!start) return text;
  if (!end) return setOverride(text, "pos", pStr(toScript(start.pos, lay, res)));
  return setOverride(text, "move", `(${vStr(toScript(start.pos, lay, res))},${vStr(toScript(end.pos, lay, res))},${start.time},${end.time})`);
}

/** ย้ายบรรทัดไป d พิกัดสคริปต์ (ดับเบิลคลิกของสองเครื่องมือ) · fmt ตัวแปลงจุดเป็นข้อความ เครื่องมือกากบาทใช้ crossText เครื่องมือลากใช้ vStr */
export function shiftText(d: SubDoc, e: SubEvent, by: V2, fmt: (v: V2) => string): string {
  let text = e.text;
  const mv = lineMove(e);
  if (mv) {
    const a = fmt(add(mv.p1, by)), b = fmt(add(mv.p2, by));
    text = setOverride(text, "move", mv.t1 > 0 || mv.t2 > 0 ? `(${a},${b},${mv.t1},${mv.t2})` : `(${a},${b})`);
  } else text = setOverride(text, "pos", `(${fmt(add(linePosition(d, e), by))})`);
  const org = lineOrigin(e);
  if (org) text = setOverride(text, "org", `(${fmt(add(org, by))})`);
  return text;
}

/** ระยะที่ดับเบิลคลิกย้าย จุดที่ชี้ลบตำแหน่งของบรรทัดที่กำลังแก้ หรือจุดจับที่กดล่าสุด */
export const dblDelta = (mouse: V2, from: V2) => sub(mouse, from);

/** ปุ่มสลับ \move กับ \pos ของบรรทัดที่เลือก (VisualToolDrag::OnSubTool)
    มี \move เปลี่ยนเป็น \pos ที่จุดตั้งต้น · ไม่มี ใส่ \move อยู่กับที่ เวลาปัดเข้าขอบเฟรมตามเวลาเริ่มของบรรทัด */
export function togglePosMove(d: SubDoc, e: SubEvent, delay: number, fr: Framerate | null): string {
  const mv = lineMove(e);
  if (mv) return setOverride(e.text, "pos", pStr(mv.p1));
  const p = linePosition(d, e);
  const s = e.start + delay;
  const t1 = fr ? fr.timeAt(fr.frameAt(s, "start")) - s : 0;
  const t2 = fr ? fr.timeAt(fr.frameAt(s, "end")) - s : 0;
  return setOverride(e.text, "move", `(${vStr(p)},${vStr(p)},${Math.round(t1)},${Math.round(t2)})`);
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subVisualLib = { fts, vStr, dStr, toScript, fromScript, crossText, linePosition, lineOrigin, lineMove, setOverride, makeFeatures, overFeat, hitFeat, dragText, shiftText, togglePosMove, ssaToAss };
