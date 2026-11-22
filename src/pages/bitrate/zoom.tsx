/* หน้าบิตเรต ปุ่มช่วงซูมเวลา กับแถบซูมแนวตั้ง
   แยกจาก BitratePage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 3.2) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useEffect, useRef } from "react";
import { clock } from "./common";

/** ปุ่มช่วงซูมบนหัวกราฟ (BUGS ข้อ 103) */
export const Z_OPTS = [{ value: "all", label: "ทั้งไฟล์" }, { value: "60", label: "1 นาที" }, { value: "10", label: "10 วินาที" }];

/** ช่วงสั้นสุดที่ซูมเข้าได้ (วินาที) */
export const HZ_MIN = 0.5;
/** แถบซูมแนวนอน · สเกลล็อก ซ้ายสุดทั้งไฟล์ ขวาสุด 0.5 วินาที · ลาก กด หมุนล้อ ลูกศร (หน้าตาเดียวกับ HZoom ของหน้ากราฟเสียง) */
export function BrHZoom({ total, span, onSpan, off }: { total: number; span: number; onSpan: (s: number) => void; off: boolean }) {
  const root = useRef<HTMLSpanElement>(null), track = useRef<HTMLSpanElement>(null), drag = useRef(false);
  const ok = !off && total > HZ_MIN * 1.01, Lg = Math.log(Math.max(total, HZ_MIN * 1.01) / HZ_MIN);
  const pos = ok ? Math.max(0, Math.min(1, Math.log(total / Math.max(HZ_MIN, Math.min(total, span))) / Lg)) : 0;
  const fromX = (x: number) => { const r = track.current!.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); return total * Math.exp(-p * Lg); };
  const cur = useRef(span); cur.current = span;
  useEffect(() => {
    const el = root.current; if (!el || !ok) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); onSpan(cur.current * (e.deltaY < 0 ? 0.8 : 1.25)); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onSpan, ok]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowRight: 0.8, ArrowUp: 0.8, ArrowLeft: 1.25, ArrowDown: 1.25, PageUp: 0.5, PageDown: 2 };
    if (m[e.key]) { e.preventDefault(); onSpan(span * m[e.key]); }
    else if (e.key === "Home") { e.preventDefault(); onSpan(total); }
    else if (e.key === "End") { e.preventDefault(); onSpan(HZ_MIN); }
  };
  const txt = `ช่วงที่ดู ${clock(Math.min(total, span))}`;
  return (
    <span className={"hzoom" + (ok ? "" : " off")} ref={root} data-brnhzoom>
      <span className="track" ref={track}
        onPointerDown={(e) => { if (!ok) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onSpan(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current) onSpan(fromX(e.clientX)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <span className="fill" style={{ width: pos * 100 + "%" }} />
        <span className="knob" role="slider" aria-orientation="horizontal" aria-label="ซูมเวลา" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)} aria-valuetext={txt}
          tabIndex={ok ? 0 : -1} title={`${txt} ลากไปขวาเพื่อซูมเข้า ลากไปซ้ายเพื่อซูมออก`} style={{ left: pos * 100 + "%" }} onKeyDown={key} data-brnhknob />
      </span>
    </span>
  );
}

const VZ_MAX = 16;
const vzClamp = (v: number) => { const c = Math.max(1, Math.min(VZ_MAX, v)); return [1, 2, 4, 8, 16].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
export const vzTxt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + "×";
/** แถบขยายแนวตั้งขวามือกราฟ · ลากขึ้นขยาย ลากลงกลับ 1 เท่า · สเกลล็อก 1 ถึง 16 เท่า · ดับเบิลคลิกกลับ 1 เท่า (หน้าตาเดียวกับ VZoom ของหน้ากราฟเสียง) */
export function BrVZoom({ value, onChange, top, bottom }: { value: number; onChange: (v: number) => void; top: number; bottom: number }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false);
  const Lg = Math.log(VZ_MAX), pos = (v: number) => (Math.log(v) / Lg) * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); const p = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height)); return vzClamp(Math.exp(p * Lg)); };
  const cur = useRef(value); cur.current = value;
  useEffect(() => {
    const el = root.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); onChange(vzClamp(cur.current * (e.deltaY < 0 ? 1.25 : 0.8))); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onChange]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowUp: 1.25, ArrowRight: 1.25, ArrowDown: 0.8, ArrowLeft: 0.8, PageUp: 2, PageDown: 0.5 };
    if (m[e.key]) { e.preventDefault(); onChange(vzClamp(value * m[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(1); }
    else if (e.key === "End") { e.preventDefault(); onChange(VZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom brn-vzoom" ref={root} style={{ paddingTop: top - 18, paddingBottom: bottom - 18 }} data-brnvzoom>
      <span className="ic" title="ลากขึ้น ขยายแนวตั้ง">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ขยายแนวตั้ง" aria-valuemin={1} aria-valuemax={VZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ขยายแนวตั้ง ${vzTxt(value)} ลากขึ้นเพื่อขยาย ลากลงเพื่อกลับ หรือดับเบิลคลิกเพื่อกลับเป็น 1 เท่า`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-brnvknob />
      </div>
      <span className="ic" title="ลากลง กลับ 1 เท่า">{ic("M4 12h16")}</span>
    </div>
  );
}