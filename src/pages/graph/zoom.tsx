/* หน้ากราฟเสียง แถบภาพรวมทั้งไฟล์ ปุ่มซูมเวลา ซูมแนวตั้ง ซูมความถี่ แถบเลื่อนเวลา และตัวต่อแถบช่องเป็นรูปเดียว
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.5) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { type CSSProperties, useEffect, useRef } from "react";
import { type GOverview, type GWindow } from "../../lib/api";
import { IcChevronDown } from "../../components/icons";
import { useOvFold } from "../../lib/ovFold";
import { Theme, dec, tfmt } from "./common";
import { HiCanvas, Src, drawMatrix, drawRuler, hiCopy, sample, screenK, useCanvas } from "./draw";


/** แถบทั้งไฟล์ · กดเพื่อกระโดด */
/* แถบภาพรวมทั้งไฟล์พับเก็บได้ ทุกมุมมองใช้ค่าเดียวกัน (BUGS ข้อ 17 · พี่กัน "เราอยากให้ เจ้ากราฟนี้ มันพับเก็บได้")
   ค่าตอนเปิดโปรแกรมตั้งได้ในหน้าตั้งค่า (BUGS ข้อ 50 · useOvFold ใน lib/ovFold.ts) */
type OvProps = { ov: GOverview; th: Theme; t0: number; t1: number; onPick: (t: number) => void; left: number; right?: number; caption?: string };
/** ผืนวาดแถบภาพรวมแยกเป็นชิ้นของตัวเอง กางทีไรสร้างใหม่ ตัววัดขนาดติดใหม่ วาดใหม่
    (เดิมอยู่ในชิ้นเดียวกับแถบตอนพับ เปิดหน้ามาตอนพับอยู่ ตัววัดขนาดไม่ได้ติดเพราะยังไม่มีผืนวาด กางแล้วแถบว่าง ไม่มีคลื่น · พี่กันทัก 11 พ.ย. 2569 "กราฟตัวอย่างหายย") */
function OverviewCanvas({ ov, th, t0, t1, onPick }: OvProps) {
  const ref = useCanvas((g, w, h) => {
    g.fillStyle = th.lane; g.fillRect(0, 0, w, h);
    const all: Src = { env: ov.env, cols: ov.cols, t0: 0, t1: ov.duration };
    const ds = ov.env.map((_, i) => sample(all, i, 0, ov.duration, w)), mid = h / 2;
    for (const [col, key] of [[th.peak, "mx"], [th.rms, "rm"]] as const) {
      g.fillStyle = col;
      for (let x = 0; x < w; x++) { let m = 0; for (const d of ds) m = Math.max(m, d[key][x]); g.fillRect(x, mid - m * (mid - 2), 1, m * (mid - 2) * 2); }
    }
    if (t1 - t0 < ov.duration * 0.999) {
      const a = t0 / ov.duration * w, b = t1 / ov.duration * w; g.fillStyle = "rgba(255,250,252,.72)"; g.fillRect(0, 0, a, h); g.fillRect(b, 0, w - b, h);
      g.strokeStyle = "#d9719a"; g.lineWidth = 2; g.strokeRect(a + 1, 1, Math.max(4, b - a - 2), h - 2);
    }
  }, [ov, th, t0, t1]);
  return <div className="ovw" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onPick((e.clientX - r.left) / r.width * ov.duration); }} title="กดเพื่อไปช่วงนั้น" data-ovw><canvas ref={ref} /></div>;
}
export function Overview(p: OvProps) {
  const { ov, left, right = 0 } = p;
  const [fold, setFold] = useOvFold();
  // ปุ่มพับกางอยู่นอกแถบ ในช่องว่างข้างแถบ ไม่ทับคลื่น (พี่กันทัก "บัง" ตอนปุ่มอยู่มุมซ้ายบนในแถบ · ชี้ช่องว่างขวา "ตรงนี้ก็ว่าง")
  // หน้ากราฟหลักมีช่องว่างขวาเหนือแท่งซูมแนวตั้ง วางกลางช่องนั้น · หน้าเทียบสองไฟล์ไม่มีช่องขวา วางในช่องว่างซ้าย · ที่เดียวกันทั้งตอนพับและตอนกาง
  // ลูกศรกว้าง 24 วางกลางแถบซูมแนวตั้งกว้าง 30 ที่ชิดขวาสุดของช่องขวา (ข้อ 87 ตรงแนวปุ่ม ⓘ)
  const togPos: CSSProperties = right >= 24 ? { right: -(right - 3) } : { left: -30 };
  // พับแล้วเหลือเส้นเดียวหนา 10 จุด ไม่มีตัวหนังสือ กดตรงเส้นก็กาง (พี่กันสั่ง "เอาเส้นเดียว หนา 10" · BUGS ข้อ 17)
  if (fold) return (
    <div className="ovfold" style={{ marginLeft: left, marginRight: right }} onClick={() => setFold(false)} title={`กดเพื่อแสดงภาพรวมทั้งไฟล์ ${tfmt(ov.duration)}`} data-ovfold>
      {p.t1 - p.t0 < ov.duration * 0.999 && <i className="ovfoldwin" style={{ background: "#d9719a", left: `${p.t0 / ov.duration * 100}%`, width: `max(6px, ${(p.t1 - p.t0) / ov.duration * 100}%)` }} title={`ช่วงที่ดูอยู่ ${tfmt(p.t0)} ถึง ${tfmt(p.t1)}`} data-ovfoldwin />}
      {left >= 90 && <span className="ovfoldtxt" style={{ width: left - 12 }}>แสดงภาพรวมทั้งไฟล์ {tfmt(ov.duration)}</span>}
      <button type="button" className="ovtog out" style={togPos} aria-expanded={false} aria-label="แสดงภาพรวมทั้งไฟล์" title="แสดงภาพรวมทั้งไฟล์" onClick={(e) => { e.stopPropagation(); setFold(false); }} data-ovtoggle><IcChevronDown size={14} stroke="currentColor" /></button>
    </div>
  );
  return (<>
    <div className="ovwrap" style={{ marginLeft: left, marginRight: right }}>
      <OverviewCanvas {...p} />
      {/* ปุ่มพับฝั่งซ้ายอีกปุ่ม อยู่ช่องว่างซ้ายตรงกับข้อความตอนพับ (พี่กันสั่ง "ขอปุ่มยุบฝั่งนี้ด้วย") */}
      {left >= 90 && <button type="button" className="ovtog ovleft" style={{ maxWidth: left - 12 }} aria-expanded={true} title="พับแถบภาพรวมทั้งไฟล์ กราฟได้ที่สูงเพิ่ม" onClick={() => setFold(true)} data-ovtoggle-left>พับภาพรวม<IcChevronDown size={14} stroke="currentColor" /></button>}
      <button type="button" className="ovtog out up" style={togPos} aria-expanded={true} aria-label="พับแถบภาพรวมทั้งไฟล์" title="พับแถบภาพรวมทั้งไฟล์ กราฟได้ที่สูงเพิ่ม" onClick={() => setFold(true)} data-ovtoggle><IcChevronDown size={14} stroke="currentColor" /></button>
    </div>
    <div className="ovrul" style={{ marginLeft: left, marginRight: right }}><span>0:00</span><span style={{ left: "50%" }}>{p.caption ?? `ทั้งไฟล์ ${tfmt(ov.duration)}`}{ov.readTo < ov.duration - 1 ? ` อ่านได้ถึง ${tfmt(ov.readTo)}` : ""}</span><span style={{ left: "100%" }}>{tfmt(ov.duration)}</span></div>
  </>);
}

/** แถบเลื่อนซูมเวลาแนวนอน อยู่ระหว่างปุ่มแว่นขยายซูมออกกับซูมเข้า (พี่กัน 7 พ.ย. 2569 *"เรามีย่อขยายเเนวตั้งเเล้ว ยังเหลือย่อขยายเเนวนอนนะ"* · *"เอาตอนนี้เลย"*)
   ซ้ายสุดเห็นทั้งไฟล์ ขวาสุดครึ่งวินาที สเกลล็อก · ซูมรอบกลางช่วงที่ดูอยู่ · กดที่แถบกระโดด · หมุนล้อเมาส์บนแถบ · ลูกศรซ้ายขวา · Home ทั้งไฟล์ End ครึ่งวินาที */
/** ซูมแนวนอนลึกสุด 0.01 วินาที เห็นทีละตัวอย่างเสียง (เดิม 0.5 วินาที พี่กันถาม 11 พ.ย. 2569 "ซูมได้มากกว่านี้ได้มั้ย") */
export const HZ_MIN = 0.01;
/** หน่วยช่วงของการซูมแกนความถี่ในหน้าความถี่เฉลี่ย คงค่าเดิม ไม่ผูกกับซูมแนวนอน */
export const PSD_HZ_UNIT = 0.5;
export function HZoom({ dur, span, onSpan, name = "ซูมเวลา", text, onBusy }: { dur: number; span: number; onSpan: (s: number) => void; name?: string; text?: string; onBusy?: (on: boolean) => void }) {
  const root = useRef<HTMLSpanElement>(null), track = useRef<HTMLSpanElement>(null), drag = useRef(false);
  const ok = dur > HZ_MIN * 1.01, L = Math.log(Math.max(dur, HZ_MIN * 1.01) / HZ_MIN);
  const pos = ok ? Math.max(0, Math.min(1, Math.log(dur / Math.max(HZ_MIN, Math.min(dur, span))) / L)) : 0;
  const fromX = (x: number) => { const r = track.current!.getBoundingClientRect(); const p = Math.max(0, Math.min(1, (x - r.left) / r.width)); return dur * Math.exp(-p * L); };
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
    else if (e.key === "Home") { e.preventDefault(); onSpan(dur); }
    else if (e.key === "End") { e.preventDefault(); onSpan(HZ_MIN); }
  };
  return (
    <span className={"hzoom" + (ok ? "" : " off")} ref={root} data-hzoom>
      <span className="track" ref={track}
        onPointerDown={(e) => { if (!ok) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onBusy?.(true); onSpan(fromX(e.clientX)); }}
        onPointerMove={(e) => { if (drag.current) onSpan(fromX(e.clientX)); }}
        onPointerUp={() => { if (drag.current) onBusy?.(false); drag.current = false; }} onPointerCancel={() => { if (drag.current) onBusy?.(false); drag.current = false; }}>
        <span className="fill" style={{ width: pos * 100 + "%" }} />
        <span className="knob" role="slider" aria-orientation="horizontal" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos * 100)}
          aria-valuetext={text ?? `ช่วงที่ดู ${tfmt(Math.min(dur, span))}`} tabIndex={ok ? 0 : -1} title={`${text ?? `ช่วงที่ดู ${tfmt(Math.min(dur, span))}`} ลากขวาเพื่อซูมเข้า ลากซ้ายเพื่อซูมออก`}
          style={{ left: pos * 100 + "%" }} onKeyDown={key} data-hzknob />
      </span>
    </span>
  );
}

// ช่วงซูมแนวตั้งสมมาตร 1/8 ถึง 8 เท่า ค่า 1 เท่าอยู่กลางแถบพอดี (เดิม 0.25 ถึง 8 เท่า 1 เท่าอยู่ต่ำกว่ากลาง พี่กันทัก 11 พ.ย. 2569 "ซูมเเนวตั้ง มันไม่อยู่กลาง")
const VZ_MIN = 0.125, VZ_MAX = 8;
/** ค่าขยายแนวตั้งในช่วงที่รับ · ใกล้ 1 2 4 เท่า (ไม่เกิน 4%) ดูดเข้าหา ปุ่ม 1× 2× 4× จะติดตาม */
const vzClamp = (v: number) => { const c = Math.max(VZ_MIN, Math.min(VZ_MAX, v)); return [1, 2, 4].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
export const vzTxt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")) + "×";

/** แถบเลื่อนแนวตั้งขวามือรูปคลื่น บีบหรือยืดคลื่น (พี่กัน 7 พ.ย. 2569 *"ขอเส้นเเนวตั้ง ที่เอาไว้เลื่อนบีบเส้นกราฟด้วย เพราะตามรูป ตัวกราฟมันเกินกรอบไป"*)
   ลากขึ้นยืด ลากลงบีบ · สเกลล็อก 0.25 ถึง 8 เท่า · ขีดขวางคือ 1 เท่า ยอดเต็มสเกลชนขอบกรอบพอดี ต่ำกว่านั้นคลื่นไม่ล้นกรอบ
   กดที่แถบกระโดดไปจุดนั้น · หมุนล้อเมาส์บนแถบ · ลูกศรขึ้นลง · PageUp PageDown ทีละสองเท่า · ดับเบิลคลิกกลับ 1 เท่า */
export function VZoom({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false);
  const L = Math.log(VZ_MAX / VZ_MIN), pos = (v: number) => Math.log(v / VZ_MIN) / L * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); const p = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height)); return vzClamp(VZ_MIN * Math.exp(p * L)); };
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
    else if (e.key === "Home") { e.preventDefault(); onChange(VZ_MIN); }
    else if (e.key === "End") { e.preventDefault(); onChange(VZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom" ref={root} data-vzoom>
      <span className="ic" title="ลากขึ้น ยืดคลื่น">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <i className="fit" style={{ bottom: pos(1) + "%" }} title="1 เท่า ยอดเต็มสเกลชนขอบพอดี" />
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ขยายแนวตั้ง" aria-valuemin={VZ_MIN} aria-valuemax={VZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ขยายแนวตั้ง ${vzTxt(value)} ลากขึ้นเพื่อยืด ลากลงเพื่อบีบ และดับเบิลคลิกเพื่อกลับเป็น 1 เท่า`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-vzknob />
      </div>
      <span className="ic" title="ลากลง บีบคลื่น">{ic("M4 12h16M12 3v5M9 5.5l3 3 3-3M12 21v-5M9 18.5l3-3 3 3")}</span>
    </div>
  );
}

const FZ_MAX = 16;
const fzClamp = (v: number) => { const c = Math.max(1, Math.min(FZ_MAX, v)); return [1, 2, 4, 8, 16].find((k) => Math.abs(c / k - 1) < 0.04) ?? Math.round(c * 100) / 100; };
/** ซูมแนวตั้งหน้าวิเคราะห์ (พี่กันขอ 9 พ.ย. 2569 "มีซูมตามเเนวนอนเเล้ว เเต่ไม่มีซูมเเนวตั้งเเฮะ") · หน้าตาแบบแถบบีบยืดหน้ารูปคลื่น · 1 ถึง 16 เท่า ดับเบิลคลิกกลับ 1 เท่า */
export function FZoom({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), drag = useRef(false), cur = useRef(value); cur.current = value;
  const L = Math.log(FZ_MAX), pos = (v: number) => Math.log(v) / L * 100;
  const fromY = (y: number) => { const r = track.current!.getBoundingClientRect(); return fzClamp(Math.exp((1 - Math.max(0, Math.min(1, (y - r.top) / r.height))) * L)); };
  useEffect(() => {
    const el = root.current; if (!el) return;
    const fn = (e: WheelEvent) => { e.preventDefault(); e.stopPropagation(); onChange(fzClamp(cur.current * (e.deltaY < 0 ? 1.25 : 0.8))); };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [onChange]);
  const key = (e: React.KeyboardEvent) => {
    const m: Record<string, number> = { ArrowUp: 1.25, ArrowRight: 1.25, ArrowDown: 0.8, ArrowLeft: 0.8, PageUp: 2, PageDown: 0.5 };
    if (m[e.key]) { e.preventDefault(); onChange(fzClamp(value * m[e.key])); }
    else if (e.key === "Home") { e.preventDefault(); onChange(1); }
    else if (e.key === "End") { e.preventDefault(); onChange(FZ_MAX); }
  };
  const ic = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
  return (
    <div className="vzoom" ref={root} data-fzoom>
      <span className="ic" title="ลากขึ้น ขยาย">{ic("M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4")}</span>
      <div className="track" ref={track} onDoubleClick={() => onChange(1)}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; onChange(fromY(e.clientY)); }}
        onPointerMove={(e) => { if (drag.current) onChange(fromY(e.clientY)); }}
        onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
        <div className="knob" role="slider" aria-orientation="vertical" aria-label="ซูมแนวตั้ง" aria-valuemin={1} aria-valuemax={FZ_MAX} aria-valuenow={value} aria-valuetext={vzTxt(value)} tabIndex={0}
          title={`ซูมแนวตั้ง ${vzTxt(value)} ลากขึ้นเพื่อขยาย ลากลงเพื่อย่อ และดับเบิลคลิกเพื่อกลับเป็น 1 เท่า`} style={{ bottom: pos(value) + "%" }} onKeyDown={key} data-fzknob />
      </div>
      <span className="fzval" data-fzval>{vzTxt(value)}</span>
    </div>
  );
}

/** แถบเลื่อนซ้ายขวา แบบ Audacity · ก้อนกว้างตามช่วงที่ซูม ลากเพื่อเลื่อน กดที่แถบเพื่อกระโดด · ลูกศรซ้ายขวาเลื่อนทีละหนึ่งในสิบ */
export function TimeScroll({ dur, t0, t1, left, right, onPan, onBusy }: { dur: number; t0: number; t1: number; left: number; right: number; onPan: (center: number) => void; onBusy?: (on: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; c: number } | null>(null);
  // ลากแล้วขยับกราฟไม่เกินหนึ่งครั้งต่อเฟรมจอ เมาส์ส่งตำแหน่งถี่กว่าเฟรม วาดกราฟใหม่ทุกครั้งแล้วกระตุก (พี่กันทัก 11 พ.ย. 2569 "เเถบเลื่อนนี้โคตรเลล็ก เเละกระตุก")
  const pend = useRef<{ c: number; raf: number } | null>(null);
  const panSoon = (c: number) => {
    if (pend.current) { pend.current.c = c; return; }
    pend.current = { c, raf: requestAnimationFrame(() => { const p = pend.current; pend.current = null; if (p) onPan(p.c); }) };
  };
  const panNow = () => { const p = pend.current; if (!p) return; cancelAnimationFrame(p.raf); pend.current = null; onPan(p.c); };
  const all = !dur || t1 - t0 >= dur * 0.999, span = t1 - t0, mid = (t0 + t1) / 2;
  const toTime = (dx: number) => dx / Math.max(1, ref.current?.clientWidth ?? 1) * dur;
  return (
    <div className="tscroll" ref={ref} style={{ marginLeft: left, marginRight: right }} data-tscroll
      onPointerDown={(e) => { if (all || (e.target as HTMLElement).dataset.thumb) return; const r = e.currentTarget.getBoundingClientRect(); onPan((e.clientX - r.left) / r.width * dur); }}>
      <div className={"thumb" + (all ? " all" : "")} data-thumb="1" style={{ left: (dur ? t0 / dur * 100 : 0) + "%", width: Math.max(dur ? span / dur * 100 : 100, 2) + "%" }}
        role="scrollbar" aria-orientation="horizontal" aria-label="เลื่อนช่วงที่ดู" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t0)} tabIndex={all ? -1 : 0}
        onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); onPan(mid - span / 10); } if (e.key === "ArrowRight") { e.preventDefault(); onPan(mid + span / 10); } }}
        onPointerDown={(e) => { if (all) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, c: mid }; onBusy?.(true); }}
        onPointerMove={(e) => { if (drag.current) panSoon(drag.current.c + toTime(e.clientX - drag.current.x)); }}
        onPointerUp={() => { panNow(); if (drag.current) onBusy?.(false); drag.current = null; }} onPointerCancel={() => { panNow(); if (drag.current) onBusy?.(false); drag.current = null; }} />
    </div>
  );
}

/** ความถี่ของช่องหนึ่งในแถบ · แกนตั้งแบบล็อก 20 Hz ถึงครึ่งอัตราสุ่ม */
export function drawSpecLane(g: CanvasRenderingContext2D, w: number, h: number, ch: number, win: GWindow | null, ov: GOverview, t0: number, t1: number, rate: number, colors: Uint8ClampedArray, z = 1, b = 0, held: GWindow | null = null) {
  g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
  if (win) {
    const d = dec(win.spec[ch]); const cols = Math.round(d.length / win.bins);
    const r0 = Math.min(win.bins - 1, Math.floor(b * win.bins)), nr = Math.max(2, Math.min(win.bins - r0, Math.ceil(win.bins / z)));
    drawMatrix(g, 0, 0, w, h, cols, nr, colors, (row, col) => d[col * win.bins + r0 + row]);
    return;
  }
  // ระหว่างรอช่วงที่ซูม ใช้ความถี่ของภาพรวม (เส้นตรง) แปลงเป็นแกนล็อก
  const d = dec(ov.spec[ch]), B = ov.specBins, nyq = rate / 2, rows = 96;
  const c0 = Math.floor(t0 / ov.duration * ov.specCols), c1 = Math.max(c0 + 1, Math.ceil(t1 / ov.duration * ov.specCols));
  const binOf = (row: number) => Math.min(B - 1, Math.floor(20 * Math.pow(nyq / 20, b + (row + 0.5) / rows / z) / nyq * B));
  drawMatrix(g, 0, 0, w, h, c1 - c0, rows, colors, (row, col) => d[(c0 + col) * B + binOf(row)]);
  // ระหว่างลาก ส่วนที่เคยอ่านคมแล้ววาดทับตรงตำแหน่งใหม่
  if (held) {
    const hd = dec(held.spec[ch]), hc = Math.round(hd.length / held.bins), r0 = Math.min(held.bins - 1, Math.floor(b * held.bins)), nr = Math.max(2, Math.min(held.bins - r0, Math.ceil(held.bins / z))), k = w / (t1 - t0 || 1);
    drawMatrix(g, (held.t0 - t0) * k, 0, (held.t1 - held.t0) * k, h, hc, nr, colors, (row, col) => hd[col * held.bins + r0 + row]);
  }
}

/** รูปกราฟทุกแถบรวมเป็นรูปเดียว ไว้บันทึก */
export function composeLanes(box: HTMLDivElement | null, outW: number): HTMLCanvasElement | null {
  if (!box) return null;
  const lanes = [...box.querySelectorAll<HTMLDivElement>("[data-lane]")];
  if (!lanes.length) return null;
  const ruler = box.closest("[data-plot]")?.querySelector(".ruler"), axis = ruler ? 24 : 0;
  const W = box.clientWidth, H = lanes.reduce((sum, l) => sum + l.clientHeight + 6, 8) + axis, k = outW ? outW / W : screenK();
  const out = document.createElement("canvas"); out.width = Math.round(W * k); out.height = Math.round(H * k);
  const g = out.getContext("2d"); if (!g) return null;
  g.scale(k, k); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  let y = 4, cvX = 0, cvW = W;
  for (const l of lanes) {
    const mid = y + l.clientHeight / 2, sub = l.querySelector(".lab span")?.textContent ?? "";
    g.textBaseline = "middle"; g.fillStyle = "#4a2b38"; g.font = "700 13px Sarabun, sans-serif"; g.fillText(l.dataset.lane ?? "", 6, sub ? mid - 8 : mid);
    if (sub) { g.fillStyle = "#6b4a58"; g.font = "12px Sarabun, sans-serif"; g.fillText(sub, 6, mid + 8); }
    // รูปคลื่นกับไม้บรรทัดตัวเลข (แบบ Audacity) วางตามตำแหน่งจริงบนจอ
    for (const cv of l.querySelectorAll<HiCanvas>("canvas.vrul, canvas.cv")) {
      g.drawImage(hiCopy(cv, k), cv.offsetLeft, y, cv.clientWidth, cv.clientHeight);
      if (cv.classList.contains("cv")) { cvX = cv.offsetLeft; cvW = cv.clientWidth; }
    }
    if (l.dataset.off !== undefined) { g.fillStyle = "#8a6474"; g.font = "600 13px Sarabun, sans-serif"; g.textAlign = "center"; g.fillText("ปิดลำโพง", W / 2, mid); g.textAlign = "left"; }
    y += l.clientHeight + 6;
  }
  drawRuler(g, ruler, cvX, cvW, y + 10);
  return out;
}