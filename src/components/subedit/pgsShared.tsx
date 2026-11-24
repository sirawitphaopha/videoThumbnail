/* ของระดับไฟล์ของหน้าต่างส่งออก PGS ขนาดภาพกับอัตราเฟรมของ Blu-ray ค่าตั้งต้น ตำแหน่งเก้าจุด ตัวดูเอฟเฟกต์ในบรรทัด และปุ่มสี
   แยกจาก PgsDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { type PgsEngine, type PgsOpts, type SrtStyle, type SubDoc } from "../../lib/api";

export const nameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;
/** ขนาดภาพของ Blu-ray */
export const BD: [number, number][] = [[1920, 1080], [1280, 720], [720, 576], [720, 480]];
/** อัตราเฟรมที่ PGS เก็บได้ */
export const FPS: { v: string; label: string; num: number; den: number }[] = [
  { v: "23.976", label: "23.976", num: 24000, den: 1001 }, { v: "24", label: "24", num: 24, den: 1 }, { v: "25", label: "25", num: 25, den: 1 },
  { v: "29.97", label: "29.97", num: 30000, den: 1001 }, { v: "50", label: "50", num: 50, den: 1 }, { v: "59.94", label: "59.94", num: 60000, den: 1001 },
];
export type Engine = PgsEngine;
/** ค่าตั้งต้นตรงกับ pgs.rs PgsOpts SrtStyle (แคลร์ตั้ง) */
export const OPTS0: PgsOpts = { colors: 255, matrix: "auto", vsfilter: true, vivid: 0, dither: false, windows: 2, compression: 80, quantizer: 3, layout: 2, redraw: 0, maxKbps: 0, allowNormal: true, ahead: true };
export const STYLE0: SrtStyle = { font: "Tahoma", size: 64, bold: false, italic: false, color: "#FFFFFF", outlineColor: "#000000", outline: 3, shadow: 1.5, shadowColor: "#000000", shadowOpacity: 50, marginV: 50,
  align: 2, marginH: 60, lineSpacing: 0, contentAlign: "center", boxType: "none", boxColor: "#000000", boxOpacity: 70, boxPadding: 5, boxRadius: 0 };
/** ตำแหน่งเก้าจุดแบบเลขของ ASS เรียงจากแถวบน */
export const ALIGN: [number, string][] = [[7, "ซ้ายบน"], [8, "กลางบน"], [9, "ขวาบน"], [4, "ซ้ายกลางภาพ"], [5, "กลางภาพ"], [6, "ขวากลางภาพ"], [1, "ซ้ายล่าง"], [2, "กลางล่าง"], [3, "ขวาล่าง"]];
export const ENG_NAME: Record<Engine, string> = { shelf: "ชั้นหนัง", super: "SUPer", seconv: "Subtitle Edit" };
export const SAMPLE0 = "ตัวอย่างซับไตเติลภาษาไทย ABC 123";
export const load = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
export const keep = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ไม่มีที่เก็บ */ } };


/** แท็กที่ทำให้ภาพเปลี่ยนระหว่างบรรทัด ตรงกับ pgs.rs animated · ดูเฉพาะในวงเล็บปีกกา */
export const tagsOf = (t: string) => (t.match(/\{[^}]*\}/g) ?? []).join(" ").toLowerCase();
export const isAnimated = (t: string) => { const g = tagsOf(t); return /\\(move|fad|fade|t)\(/.test(g) || /\\k(\d|f|o)/.test(g); };
export const isSoft = (t: string) => /\\(blur|be)\s*[1-9]|\\([1-4]a|alpha)\s*&h[0-9a-f]/i.test(tagsOf(t));
/** บรรทัดที่ขึ้นพร้อมกันมากที่สุด */
export function maxTogether(doc: SubDoc) {
  const ev: [number, number][] = [];
  for (const e of doc.events) if (!e.comment && e.end > e.start) { ev.push([e.start, 1]); ev.push([e.end, -1]); }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0, m = 0;
  for (const [, d] of ev) { n += d; m = Math.max(m, n); }
  return m;
}
export const fpsOf = (rate: string | null | undefined, fps: number | null | undefined) => {
  const m = /^(\d+)\/(\d+)$/.exec(rate ?? "");
  const f = m ? Number(m[1]) / Number(m[2]) : fps ?? 23.976;
  return FPS.reduce((b, x) => (Math.abs(x.num / x.den - f) < Math.abs(b.num / b.den - f) ? x : b), FPS[0]).v;
};
export const msText = (ms: number) => { const s = Math.max(0, ms) / 1000; const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`; };

/** ปุ่มสี · กดแล้วเปิดตัวเลือกสีของระบบ */
export function Swatch(p: { value: string; onChange: (v: string) => void; label: string; data: string }) {
  return (
    <span className="se-stcolor" data-pgs-color={p.data}>
      <label className="se-dswatch" title={`${p.label} กดเพื่อเลือกสี`}><span style={{ background: p.value }} /><input type="color" value={p.value} onChange={(e) => p.onChange(e.target.value.toUpperCase())} aria-label={p.label} /></label>
      <span className="se-stclbl">{p.label}</span>
    </span>
  );
}
