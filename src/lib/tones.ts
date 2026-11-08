/* โทนสีทั้งโปรแกรม เลือกในหน้าตั้งค่า (พี่กันสั่ง 8 พ.ย. 2569 "เอาโทนสีนี้ ไปใส่ตั้งค่า พร้อมรูป")
   ไฟล์สไตล์ของโปรแกรมเขียนสีชมพูตรง ๆ หลายร้อยจุด จึงเปลี่ยนตอนรัน ตั้งตัวแปรหลัก แล้วแปลงสีตระกูลชมพูในกฎกับ inline ตาม hue ของสีเน้น
   สีสถานะ เขียว เหลือง แดง ฟ้า กับสีในรูปโปสเตอร์และกราฟเสียงไม่แตะ · ยกจากมอคอัป theme-live ที่พี่กันเลือกดูแล้ว */
export type Tone = { id: string; name: string; rec?: boolean; dark?: boolean; how: string; why: string; v: Record<string, string> };
export const TONES: Tone[] = [
  { id: "quartz", name: "โรสควอตซ์", rec: true, how: "สีตระกูลเดียว ไล่น้ำหนักจากขาวอมชมพูถึงไวน์เข้ม", why: "สว่าง สะอาด ละมุน เปลี่ยนจากของเดิมน้อยสุด ชมพูเหลือแค่จุดเน้น",
    v: { canvas: "#fdf8f8", surface: "#ffffff", panel: "#faf0f2", line: "#f0e1e5", "line-s": "#e2cad1", txt: "#3a1d29", txt2: "#6c4a57", txt3: "#86636f", accent: "#a8436a", "accent-h": "#8f3558", on: "#ffffff", soft: "#f7e4ea", "soft-ink": "#8f3558", gold: "#a8436a", side: "#ffffff", "side-txt": "#3a1d29", "side-txt2": "#86636f", "side-line": "#f0e1e5", "side-hover": "#fbf1f4", "side-on": "#f7e4ea", "side-ontxt": "#8f3558", "side-brand": "#8f3558", st1: "#ffffff", st2: "#fbeef2", dash: "#e3bcc9", "ok-bg": "#e8f4ec", "ok-line": "#b9dcc6", "ok-ink": "#2c6e4a", "warn-bg": "#fbf1dc", "warn-ink": "#815a0c" } },
  { id: "wine", name: "ไวน์กับทอง", how: "ชมพูเข้มถึงไวน์ คู่ทองแชมเปญ เป็นสีโลหะที่เข้ากับโทนอุ่น", why: "หรูสุด เมนูซ้ายสีไวน์ช่วยยึดหน้าจอ พื้นครีมอมชมพูปล่อยให้โปสเตอร์เด่น",
    v: { canvas: "#fbf6f3", surface: "#fffdfb", panel: "#f6ece8", line: "#ecdfd9", "line-s": "#dcc9bf", txt: "#3b1a26", txt2: "#6b4852", txt3: "#85626c", accent: "#7d2445", "accent-h": "#661a37", on: "#ffffff", soft: "#f3e0e4", "soft-ink": "#7d2445", gold: "#d9b97c", side: "#3f1626", "side-txt": "#f6e6ea", "side-txt2": "#cfaab6", "side-line": "#55202f", "side-hover": "#4d1d30", "side-on": "#5c2338", "side-ontxt": "#f3d9a4", "side-brand": "#f3d9a4", st1: "#fffdfb", st2: "#f7ecea", dash: "#dcbcc4", "ok-bg": "#e9f2e9", "ok-line": "#bcd8bf", "ok-ink": "#2e6b45", "warn-bg": "#f9efd9", "warn-ink": "#7d560b" } },
  { id: "night", dark: true, name: "กุหลาบกลางคืน", how: "ชมพูบนพื้นไวน์เกือบดำ แบบห้องฉายหนัง", why: "โปสเตอร์เด่นที่สุดในทุกแบบ เพราะรอบรูปมืด เหมาะตอนดูกลางคืน กลางวันแสงจ้าอ่านยากกว่า",
    v: { canvas: "#1b0f15", surface: "#241620", panel: "#2c1b25", line: "#3e2a35", "line-s": "#533a47", txt: "#f8ecf0", txt2: "#d4bcc6", txt3: "#ad929e", accent: "#eb8fb0", "accent-h": "#f3a9c4", on: "#2a0d19", soft: "#442431", "soft-ink": "#f5b4cb", gold: "#d8b27a", side: "#160b11", "side-txt": "#f1dfe6", "side-txt2": "#ad929e", "side-line": "#33222b", "side-hover": "#25151d", "side-on": "#351d28", "side-ontxt": "#f5b4cb", "side-brand": "#f5b4cb", st1: "#241620", st2: "#2f1d28", dash: "#6d4858", "ok-bg": "#17352a", "ok-line": "#2c5a48", "ok-ink": "#9be0bf", "warn-bg": "#3a2d12", "warn-ink": "#f0cd80" } },
  { id: "sage", name: "บลัชกับเสจ", how: "คู่สีตรงข้าม ชมพูคู่เขียวเสจหม่น ตัดกันแบบนุ่ม", why: "สดชื่นกว่าแบบอื่น เขียวใช้เฉพาะสถานะไฟล์ดี ดูมีมิติ ไม่หวานเกิน",
    v: { canvas: "#fcf8f6", surface: "#ffffff", panel: "#f7eeeb", line: "#eee1dc", "line-s": "#dfccc6", txt: "#3a2127", txt2: "#68494f", txt3: "#82646b", accent: "#b24a6c", "accent-h": "#973a59", on: "#ffffff", soft: "#f8e6ea", "soft-ink": "#973a59", gold: "#5f7d6b", side: "#ffffff", "side-txt": "#3a2127", "side-txt2": "#82646b", "side-line": "#eee1dc", "side-hover": "#faf1ef", "side-on": "#f8e6ea", "side-ontxt": "#973a59", "side-brand": "#973a59", st1: "#ffffff", st2: "#f9eeec", dash: "#e6c3c9", "ok-bg": "#e6f0ea", "ok-line": "#b4cfbf", "ok-ink": "#3f6650", "warn-bg": "#f9f0dc", "warn-ink": "#7d5c12" } },
  { id: "mauve", name: "มอฟหรู", how: "สีเพื่อนบ้าน ชมพูอมม่วง โทนเย็นกว่าแบบอื่น", why: "ดูเป็นผู้ใหญ่ นิ่ง คล้ายโปรแกรมตัดต่อระดับสูง แต่ออกม่วงมากกว่าชมพู",
    v: { canvas: "#fbf8fa", surface: "#ffffff", panel: "#f5eef3", line: "#ebe0e8", "line-s": "#d9c8d4", txt: "#33202e", txt2: "#5f4a5a", txt3: "#7b6476", accent: "#8c3f73", "accent-h": "#743160", on: "#ffffff", soft: "#f1e3ec", "soft-ink": "#743160", gold: "#8c3f73", side: "#ffffff", "side-txt": "#33202e", "side-txt2": "#7b6476", "side-line": "#ebe0e8", "side-hover": "#f9f3f7", "side-on": "#f1e3ec", "side-ontxt": "#743160", "side-brand": "#743160", st1: "#ffffff", st2: "#f5ecf2", dash: "#d9bcd0", "ok-bg": "#e7f2ec", "ok-line": "#b8d9c6", "ok-ink": "#2d6b4a", "warn-bg": "#f9f0dc", "warn-ink": "#7d5c12" } },
];
export const DEFAULT_TONE = "quartz";
const KEY = "ms.tone";

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHsl = ([r0, g0, b0]: number[]): [number, number, number] => {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255, a = Math.max(r, g, b), z = Math.min(r, g, b), l = (a + z) / 2, d = a - z;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = a === r ? ((g - b) / d + 6) % 6 : a === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};
const fromHsl = (h: number, s: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [a, b, d] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [a, b, d].map((v) => Math.round((v + m) * 255));
};
let tone: Tone | null = null;
function mapRgb(rgb: number[]) {
  if (!tone) return rgb;
  const [h, s, l] = toHsl(rgb), chroma = Math.max(...rgb) - Math.min(...rgb), pure = chroma === 0;
  const family = (h >= 300 && h <= 352 && chroma > 2) || ((h > 352 || h <= 30) && chroma > 2 && chroma < 40);
  if (!family && !pure && tone.dark && l < 0.6) return fromHsl(h, Math.min(s, 0.75), 0.78);
  if (!family && !(pure && (l === 1 || tone.dark))) return rgb;
  if (pure && l === 1) return hexRgb(tone.v.surface);
  const [th, ts] = toHsl(hexRgb(tone.v.accent));
  let L = l, S = Math.min(s, ts + 0.12);
  if (l > 0.82) S = Math.min(S, ts * 0.9);
  if (l < 0.4) S = Math.min(S, ts * 0.75);
  if (tone.dark) { L = 1 - l * 0.92; S = Math.min(S, 0.3); if (L > 0.55 && chroma > 60) { S = ts; L = Math.max(L, 0.72); } }
  return fromHsl(th, S, L);
}
const mapColors = (val: string) => val
  .replace(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)((?:[ ,/]+[\d.]+%?)?)\s*\)/g, (_m, r, g, b, rest: string) => { const c = mapRgb([+r, +g, +b]); const al = rest.replace(/[ ,/]+/, "").trim(); return al ? `rgba(${c.join(",")},${al})` : `rgb(${c.join(",")})`; })
  .replace(/#[0-9a-fA-F]{6}\b/g, (m) => "#" + mapRgb(hexRgb(m)).map((x) => x.toString(16).padStart(2, "0")).join(""));

const saved: [CSSStyleRule, string, string, string][] = [];
const seen = new WeakSet<CSSRule>();
function walk(rules: CSSRuleList) {
  for (const r of Array.from(rules)) {
    const sr = r as CSSStyleRule;
    if (sr.style && !seen.has(r)) {
      seen.add(r);
      for (let i = 0; i < sr.style.length; i++) {
        const p = sr.style[i];
        if (p.startsWith("--") || p === "box-shadow" || p === "text-shadow") continue;
        const v = sr.style.getPropertyValue(p);
        if (/rgb|#[0-9a-f]{6}/i.test(v)) saved.push([sr, p, v, sr.style.getPropertyPriority(p)]);
      }
    }
    const inner = (r as CSSGroupingRule).cssRules;
    if (inner) walk(inner);
  }
}
const collect = () => { for (const sh of Array.from(document.styleSheets)) { try { walk(sh.cssRules); } catch { /* ข้ามชุดที่อ่านไม่ได้ */ } } };
const inlineOrig = new WeakMap<Element, { style: string | null; stroke: string | null; fill: string | null }>();
function paintInline() {
  document.querySelectorAll("#root [style], #root svg[stroke], #root svg [stroke], #root svg[fill], #root svg [fill]").forEach((e) => {
    if (e.closest(".cover, .dposter, [data-keepcolor]")) return;
    let o = inlineOrig.get(e);
    if (!o) { o = { style: e.getAttribute("style"), stroke: e.getAttribute("stroke"), fill: e.getAttribute("fill") }; inlineOrig.set(e, o); }
    for (const a of ["stroke", "fill"] as const) { const c = o[a]; if (c && c[0] === "#" && c.length === 7) e.setAttribute(a, mapColors(c)); }
    if (o.style && /rgb|#[0-9a-f]{6}/i.test(o.style)) {
      const cur = e.getAttribute("style") ?? "";
      const next = mapColors(cur);
      if (next !== cur) e.setAttribute("style", next);
    }
  });
}
function paint() {
  collect();
  for (const [r, p, v, pr] of saved) r.style.setProperty(p, tone ? mapColors(v) : v, pr);
  paintInline();
}
// กฎของเมนูซ้าย · แยกเป็นชุดสไตล์ต่างหาก ไม่ปนกับกฎที่ถูกแปลงสี
const sheet = new CSSStyleSheet();
let watching = false;
export function applyTone(id: string) {
  const t = TONES.find((x) => x.id === id) ?? TONES[0];
  tone = t;
  const v = t.v, root = document.documentElement.style;
  const VARS: Record<string, string> = { "--bg": v.canvas, "--ink": v.txt, "--muted": v.txt2, "--win": v.surface, "--win2": v.panel, "--line": v.line, "--txt": v.txt, "--txt2": v.txt2, "--txt3": v.txt3, "--accent": v.accent, "--accent-d": v["accent-h"], "--accent-soft": v.soft, "--accent-ink": v["soft-ink"], "--info-soft": v.soft, "--info-ink": v["soft-ink"], "--ok-soft": v["ok-bg"], "--ok-ink": v["ok-ink"], "--warn-soft": v["warn-bg"], "--warn-ink": v["warn-ink"] };
  for (const [k, c] of Object.entries(VARS)) root.setProperty(k, c);
  sheet.replaceSync(`html,body{background:${v.canvas}}
.side{background:${v.side}!important;color:${v["side-txt"]}!important;border-color:${v["side-line"]}!important}
.side .brand{color:${v["side-brand"]}!important}
.side .nav{color:${v["side-txt"]}!important;background-color:transparent}
.side .nav:hover{background-color:${v["side-hover"]}!important;color:${v["side-ontxt"]}!important}
.side .nav.on,.side .nav.on:hover{background-color:${v["side-on"]}!important;color:${v["side-ontxt"]}!important}
.side .foot{color:${v["side-txt2"]}!important}`);
  if (!document.adoptedStyleSheets.includes(sheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  paint();
  try { localStorage.setItem(KEY, t.id); } catch { /* ที่เก็บของหน้าใช้ไม่ได้ ไม่เป็นไร */ }
  if (!watching) {
    watching = true;
    // ของที่วาดใหม่กับไฟล์สไตล์ที่โหลดทีหลัง ต้องได้สีตามโทนด้วย
    let timer = 0;
    new MutationObserver(() => { clearTimeout(timer); timer = window.setTimeout(paint, 60); }).observe(document, { childList: true, subtree: true });
    window.addEventListener("load", paint);
  }
}
/** ใช้โทนที่จำไว้ก่อนวาดหน้าแรก จอจะได้ไม่กะพริบสีเดิม */
export function applySavedTone() {
  let id = DEFAULT_TONE;
  try { id = localStorage.getItem(KEY) ?? DEFAULT_TONE; } catch { /* ใช้ค่าตั้งต้น */ }
  applyTone(id);
}
// หน้าเลือกโทนในมอคอัปเรียกตัวนี้ข้ามกรอบ
(window as unknown as { __applyTone: (t: Tone | string) => void }).__applyTone = (t) => applyTone(typeof t === "string" ? t : t.id);

const lum = (h: string) => { const c = hexRgb(h).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** คู่สีที่จางสุดของโทนนี้ เกณฑ์ 4.5 */
export function minContrast(t: Tone) {
  const v = t.v;
  const list: string[][] = [["ตัวหนังสือ", v.txt, v.canvas], ["ตัวรอง", v.txt2, v.canvas], ["ตัวจาง", v.txt3, v.surface], ["ตัวจางบนพื้นรอง", v.txt3, v.panel], ["ปุ่มหลัก", v.on, v.accent], ["ปุ่มหลักตอนชี้", v.on, v["accent-h"]], ["ที่เลือก", v["soft-ink"], v.soft], ["เมนู", v["side-txt"], v.side], ["เมนูจาง", v["side-txt2"], v.side], ["เมนูที่เลือก", v["side-ontxt"], v["side-on"]], ["ป้ายดี", v["ok-ink"], v["ok-bg"]], ["ป้ายเตือน", v["warn-ink"], v["warn-bg"]], ["ปุ่มยืนยันตอนชี้", v.surface, v["ok-ink"]], ["ตัวเน้นบนขาว", v["soft-ink"], v.surface], ["ตัวเน้นบนพื้นรอง", v["soft-ink"], v.panel], ["ตัวจางบนแถบเอียง", v.txt3, v.st2], ["ตัวรองบนพื้นรอง", v.txt2, v.panel], ["ตัวจางบนพื้น", v.txt3, v.canvas], ["สีเน้นบนพื้น", v.accent, v.canvas], ["สีเน้นบนขาว", v.accent, v.surface], ["ตัวรองในที่เลือก", v.txt2, v.soft], ["เมนูจางตอนชี้", v["side-txt2"], v["side-hover"]], ["เมนูตอนชี้", v["side-txt"], v["side-hover"]]];
  return Math.min(...list.map(([, a, b]) => ratio(a, b)));
}
