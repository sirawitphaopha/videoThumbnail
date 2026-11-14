/* เปลี่ยนความละเอียดของคำบรรยาย (Resample Resolution) แผนหน้าแก้ซับ ขั้น 7 · BUGS ข้อ 109
   แปลจากซอร์ส Aegisub resolution_resampler.cpp (ResampleResolution resample_style resample_line resample_tags transform_drawing)
   ตารางแท็กกับชนิดตัวเลขจาก ass_override.cpp (AssOverrideTagProto) เรียงตามลำดับเดิม เพราะ Aegisub จับชื่อแท็กตัวแรกที่ขึ้นต้นตรงกัน
   ไม่ทำ แปลงสีตาม YCbCr Matrix (Aegisub มีตัวเลือกนี้ สีเปลี่ยนน้อยมาก ใช้กับงานแปลงมาตรฐานภาพโทรทัศน์)
   แท็กที่ตัวเลขไม่เปลี่ยน เขียนกลับตามข้อความเดิมทุกตัวอักษร */
import type { SubDoc, SubEvent } from "./api";
import { infoGet, infoSet, readStyle, setStyle, type StyleV } from "./subStyle";

export type ArMode = "stretch" | "add" | "remove" | "manual";
export type ResampleSettings = { srcW: number; srcH: number; dstW: number; dstH: number; mode: ArMode; /** ซ้าย ขวา บน ล่าง (เฉพาะแบบกำหนดเอง) */ margin: [number, number, number, number] };
const LEFT = 0, RIGHT = 1, TOP = 2, BOTTOM = 3;

/** ทศนิยมแบบ float_to_string ของ Aegisub สามตำแหน่ง ตัดศูนย์ท้าย */
export const f3 = (v: number) => { let s = v.toFixed(3); s = s.replace(/0+$/, "").replace(/\.$/, ""); return s === "-0" ? "0" : s; };
/** แปลงเป็น int แบบ C++ (ตัดเศษเข้าหาศูนย์) */
const cint = (v: number) => Math.trunc(v);

type St = { margin: number[]; rx: number; ry: number; rm: number; ar: number };
/** ชนิดตัวเลขของแท็ก sx sy sxy ขนาด · px py ตำแหน่ง · rx ย่อขยายแนวนอน · n ไม่เปลี่ยน · f ทศนิยม i จำนวนเต็ม */
type P = [cls: "sx" | "sy" | "sxy" | "px" | "py" | "rx" | "n", type: "f" | "i"];
const N: P = ["n", "f"];
const PROTO: [string, P[] | "clip" | "t"][] = [
  ["alpha", [N]], ["bord", [["sy", "f"]]], ["xbord", [["sx", "f"]]], ["ybord", [["sy", "f"]]], ["shad", [["sy", "f"]]], ["xshad", [["sx", "f"]]], ["yshad", [["sy", "f"]]],
  ["fade", [N]], ["move", [["px", "f"], ["py", "f"], ["px", "f"], ["py", "f"], N, N]], ["clip", "clip"], ["iclip", "clip"],
  ["fscx", [["rx", "f"]]], ["fscy", [N]], ["pos", [["px", "f"], ["py", "f"]]], ["org", [["px", "f"], ["py", "f"]]], ["pbo", [["sy", "i"]]], ["fad", [N]], ["fsp", [["sy", "f"]]],
  ["frx", [N]], ["fry", [N]], ["frz", [N]], ["fr", [N]], ["fax", [N]], ["fay", [N]], ["1c", [N]], ["2c", [N]], ["3c", [N]], ["4c", [N]], ["1a", [N]], ["2a", [N]], ["3a", [N]], ["4a", [N]],
  ["fe", [N]], ["ko", [N]], ["kf", [N]], ["be", [N]], ["blur", [N]], ["fn", [N]], ["fs+", [N]], ["fs-", [N]], ["fs", [["sy", "f"]]], ["an", [N]], ["c", [N]],
  ["b", [N]], ["i", [N]], ["u", [N]], ["s", [N]], ["a", [N]], ["k", [N]], ["K", [N]], ["q", [N]], ["p", [N]], ["r", [N]], ["t", "t"],
];

/** รูปวาด ตัวเลขสลับ x y คำสั่งตัวเดียว m n l b s p c เริ่มที่ x ใหม่ ของอื่นตัดทิ้ง (transform_drawing) */
export function transformDrawing(drawing: string, sx: number, sy: number, kx: number, ky: number) {
  let isX = true;
  const out: string[] = [];
  for (const cur of drawing.split(" ")) {
    const v = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cur) ? parseFloat(cur) : NaN;
    if (!Number.isNaN(v)) { out.push(f3(isX ? (v + sx) * kx : (v + sy) * ky)); isX = !isX; }
    else if (cur.length === 1 && "mnlbspc".includes(cur.toLowerCase())) { isX = true; out.push(cur.toLowerCase()); }
  }
  return out.join(" ");
}

const isNum = (s: string) => /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/.test(s);
/** ตัวเลขหนึ่งตัวตามชนิด (resample_tags) · ค่าที่ไม่ใช่ตัวเลขคืนตามเดิม */
function one(s: string, p: P, st: St): string {
  if (p[0] === "n" || !isNum(s)) return s;
  let k = 1, shift = 0;
  switch (p[0]) {
    case "sx": k = st.rx; break;
    case "sy": k = st.ry; break;
    case "sxy": k = st.rm; break;
    case "px": k = st.rx; shift = st.margin[LEFT]; break;
    case "py": k = st.ry; shift = st.margin[TOP]; break;
    case "rx": k = st.ar; break;
  }
  const v = parseFloat(s);
  return p[1] === "i" ? String(cint((cint(v) + shift) * k + 0.5)) : f3((v + shift) * k);
}

/** แยกแท็กในบล็อก {…} ทีละตัว ตัดที่ \ ที่ไม่อยู่ในวงเล็บ */
function splitTags(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "\\" && depth === 0) { if (cur) out.push(cur); cur = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** แท็กหนึ่งตัว เช่น \pos(640,90) \fs60 \t(0,500,\fs80) · คืนข้อความใหม่ และค่า \p ถ้าเป็นแท็ก p */
function oneTag(tag: string, st: St): { s: string; p?: number } {
  if (!tag.startsWith("\\")) return { s: tag };
  const body = tag.slice(1);
  const hit = PROTO.find(([n]) => body.startsWith(n));
  if (!hit) return { s: tag };
  const [name, spec] = hit;
  const rest = body.slice(name.length);
  if (name === "p") { const v = parseInt(rest, 10); return { s: tag, p: Number.isFinite(v) ? v : 0 }; }
  const paren = /^\s*\(/.test(rest);
  if (spec === "t") {
    if (!paren) return { s: tag };
    const open = rest.indexOf("("), close = rest.lastIndexOf(")");
    const inner = rest.slice(open + 1, close < 0 ? undefined : close);
    const bs = inner.indexOf("\\");
    if (bs < 0) return { s: tag };
    const nested = splitTags(inner.slice(bs)).map((t) => oneTag(t, st).s).join("");
    return { s: `\\${name}${rest.slice(0, open + 1)}${inner.slice(0, bs)}${nested}${close < 0 ? "" : rest.slice(close)}` };
  }
  if (!paren) {
    if (spec === "clip") return { s: tag };
    const v = one(rest, spec[0], st);
    return { s: v === rest ? tag : `\\${name}${v}` };
  }
  const open = rest.indexOf("("), close = rest.lastIndexOf(")");
  const inner = rest.slice(open + 1, close < 0 ? undefined : close);
  const parts = inner.split(",");
  let next: string[];
  if (spec === "clip") {
    // สี่ตัวเลขคือสี่เหลี่ยม (จำนวนเต็ม ตำแหน่ง) · นอกนั้นคือรูปวาด (ตัวสุดท้าย) เลื่อนตามระยะขอบแล้วย่อขยาย
    if (parts.length === 4 && parts.every(isNum)) next = parts.map((x, i) => one(x, [i % 2 ? "py" : "px", "i"], st));
    else next = parts.map((x, i) => (i === parts.length - 1 ? transformDrawing(x.trim(), st.margin[LEFT], st.margin[TOP], st.rx, st.ry) : x));
  } else next = parts.map((x, i) => (spec[i] ? one(x, spec[i], st) : x));
  if (next.every((x, i) => x === parts[i])) return { s: tag };
  return { s: `\\${name}${rest.slice(0, open + 1)}${next.join(",")}${close < 0 ? "" : rest.slice(close)}` };
}

/** ข้อความของบรรทัด · บล็อกแท็ก {…} ที่มี \ แก้ตัวเลข · ข้อความระหว่าง \p1 ถึง \p0 เป็นรูปวาด (ParseTags) · บล็อก {…} ไม่มี \ เป็นหมายเหตุ ไม่แตะ */
export function resampleText(text: string, st: St): string {
  let out = "", draw = 0, i = 0;
  while (i < text.length) {
    if (text[i] === "{") {
      const j = text.indexOf("}", i);
      if (j < 0) { out += text.slice(i); break; }
      const inner = text.slice(i + 1, j);
      if (inner.includes("\\")) {
        out += "{" + splitTags(inner).map((t) => { const r = oneTag(t, st); if (r.p != null) draw = r.p; return r.s; }).join("") + "}";
      } else out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const j = text.indexOf("{", i);
    const plain = text.slice(i, j < 0 ? undefined : j);
    out += draw ? transformDrawing(plain, 0, 0, st.rx / st.ar, st.ry) : plain;
    i = j < 0 ? text.length : j;
  }
  return out;
}

function resampleEvent(e: SubEvent, st: St): SubEvent {
  if (e.comment && (e.effect.startsWith("template") || e.effect.startsWith("code"))) return e;
  const text = resampleText(e.text, st);
  const m = (v: number, i: number) => (v ? cint((v + st.margin[i]) * (i < 2 ? st.rx : st.ry) + 0.5) : v);
  const mL = m(e.marginL, 0), mR = m(e.marginR, 1), mV = m(e.marginV, 2);
  return text === e.text && mL === e.marginL && mR === e.marginR && mV === e.marginV ? e : { ...e, text, marginL: mL, marginR: mR, marginV: mV };
}
function resampleStyle(v: StyleV, st: St): StyleV {
  return {
    ...v, size: cint(v.size * st.ry + 0.5), outlineW: v.outlineW * st.ry, shadowW: v.shadowW * st.ry, spacing: v.spacing * st.ry, scaleX: v.scaleX * st.ar,
    mL: cint((v.mL + st.margin[0]) * st.rx + 0.5), mR: cint((v.mR + st.margin[1]) * st.rx + 0.5), mV: cint((v.mV + st.margin[2]) * st.ry + 0.5),
  };
}

/** สัดส่วนภาพต่างกันเกิน 1% ไหม (เปิดตัวเลือกการจัดสัดส่วน) */
export const arChanged = (s: Pick<ResampleSettings, "srcW" | "srcH" | "dstW" | "dstH">) => { const a = s.srcW / s.srcH, b = s.dstW / s.dstH; return Math.abs(a - b) / b > 0.01; };

/** ResampleResolution · คืนเอกสารใหม่ */
export function resample(d: SubDoc, s: ResampleSettings): SubDoc {
  const margin = s.mode === "manual" ? [...s.margin] : [0, 0, 0, 0];
  let sx = s.srcW, sy = s.srcH;
  let hs = 1, oldAr = sx / sy;
  const newAr = s.dstW / s.dstH;
  let borderH = newAr > oldAr;
  if (Math.abs(oldAr - newAr) / newAr > 0.01) {
    // ตัดขอบกลับทิศของเพิ่มขอบ แล้วคิดแบบเดียวกัน (Aegisub ใช้ fallthrough)
    if (s.mode === "remove" || s.mode === "add") {
      if (s.mode === "remove") borderH = !borderH;
      if (borderH) margin[LEFT] = margin[RIGHT] = cint((sy * newAr - sx) / 2);
      else margin[TOP] = margin[BOTTOM] = cint((sx / newAr - sy) / 2);
    } else if (s.mode === "stretch") hs = newAr / oldAr;
    else {
      oldAr = (sx + margin[LEFT] + margin[RIGHT]) / (sy + margin[TOP] + margin[BOTTOM]);
      if (Math.abs(oldAr - newAr) / newAr > 0.01) hs = newAr / oldAr;
    }
  }
  const lrx = parseInt(infoGet(d, "LayoutResX") ?? "", 10) || 0, lry = parseInt(infoGet(d, "LayoutResY") ?? "", 10) || 0;
  let nlrx = 0, nlry = 0;
  if (lrx && lry) {
    nlry = lry + Math.round((lry * (margin[TOP] + margin[BOTTOM])) / sy);
    nlrx = Math.round(lrx * (nlry / lry) * (s.dstW / s.dstH) / (sx / sy));
  }
  sx += margin[LEFT] + margin[RIGHT];
  sy += margin[TOP] + margin[BOTTOM];
  const rx = s.dstW / sx, ry = s.dstH / sy;
  const st: St = { margin, rx, ry, rm: rx === ry ? rx : Math.sqrt(rx * ry), ar: hs };
  let out: SubDoc = d;
  for (const style of d.styles) out = setStyle(out, style.id, resampleStyle(readStyle(d, style), st));
  out = { ...out, events: out.events.map((e) => resampleEvent(e, st)) };
  out = infoSet(infoSet(out, "PlayResX", String(s.dstW)), "PlayResY", String(s.dstH));
  if (lrx && lry) out = infoSet(infoSet(out, "LayoutResX", String(nlrx)), "LayoutResY", String(nlry));
  return out;
}

// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ (check-subtools.mjs)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__subResampleLib = { resample, resampleText, transformDrawing, arChanged, f3 };
