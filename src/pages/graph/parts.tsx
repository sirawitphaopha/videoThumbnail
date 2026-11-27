/* หน้ากราฟเสียง ชิ้นส่วนที่ทุกมุมมองใช้ · ปุ่มตัวเลือกกราฟ ช่วงแนวตั้งกับแถบเลื่อน ตัวจับลาก ลำโพง แถบช่อง เส้นเล็ง ป้ายจุดสังเกต
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.4) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type GOverview, type GWindow } from "../../lib/api";
import { Switch } from "../../components/ui";
import { dropStyle, sideStyle, useDropPlacement, useSideFit } from "../../lib/popupFit";
import { useClickOutside, useEscClose } from "../../lib/popup";
import { Theme, WARN, label, minus, spanDigits, tfmtD } from "./common";
import { RUL_W, Src, useCanvas } from "./draw";


export function GraphOptions({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const side = useSideFit(open, wrap, panel, "right");
  useEscClose(open, () => setOpen(false));
  useClickOutside(open, wrap, () => setOpen(false));
  return (
    <div ref={wrap} style={{ position: "relative", flex: "none" }}>
      <button type="button" className={"btn btn-ghost btn-sm" + (open ? " pressed" : "")} title="ตัวเลือกกราฟ" aria-label="ตัวเลือกกราฟ" style={{ width: 32, padding: 0, flex: "none" }} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)} data-graphopts>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </button>
      {open && (
        <div ref={panel} className="menu pop-in" role="dialog" aria-label="ตัวเลือกกราฟ" style={{ position: "absolute", ...sideStyle(side, "right"), width: 320, padding: "6px 14px", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}>
          <div className="setrow" style={{ borderTop: 0 }}><div className="lbl">ซูมเหมือนกันทุกกราฟ</div><span data-zoomall style={{ display: "inline-flex" }}><Switch on={on} onChange={onChange} label="ซูมเหมือนกันทุกกราฟ" /></span></div>
        </div>
      )}
    </div>
  );
}

/** ซูมแกนตั้งของกราฟเส้น z เท่า ขอบล่างของช่วงที่เห็น b เป็นสัดส่วน · ซูมแล้วคงกึ่งกลางเดิม */
export function useVRange(resetN: number) {
  const [z, setZRaw] = useState(1), [b, setB] = useState(0), now = useRef(1); now.current = z;
  const clampB = (v: number, k: number) => Math.max(0, Math.min(1 - 1 / k, v));
  const setZ = useCallback((k: number) => { const old = now.current; if (k === old) return; setB((v) => clampB(v + 1 / old / 2 - 1 / k / 2, k)); setZRaw(k); }, []);
  useEffect(() => { if (resetN) { setZRaw(1); setB(0); } }, [resetN]);
  const wheel = (e: React.WheelEvent) => { if (z <= 1 || e.ctrlKey) return; e.stopPropagation(); setB((v) => clampB(v + (e.deltaY < 0 ? 0.25 : -0.25) / z, z)); };
  return { z, b, setZ, setB, clampB, wheel };
}
export type VRange = ReturnType<typeof useVRange>;
/** ช่วงค่าของแกนตั้งตามซูม กับระยะเส้น ปกติไม่เกินราว 6 เส้น ช่วงกว้างกว่า 72 ใช้ระยะ 12 จึงได้มากกว่านั้น เช่นช่วง 120 dB ได้ 10 เส้น (AUDIT ข้อ 101) */
export const vWindow = (lo: number, hi: number, v: VRange) => { const f = hi - lo, l = lo + v.b * f, h = l + f / v.z; return { lo: l, hi: h, step: [1, 2, 5, 10, 12].find((k) => (h - l) / k <= 6) ?? 12 }; };
/** แถบเลื่อนช่วงแกนตั้ง ขึ้นเมื่อซูมเกิน 1 เท่า ทับขอบขวาของกราฟ ไม่ดันเนื้อหา */
export function VBar({ v, right, top = 12, bottom = 12, dark }: { v: VRange; right: number; top?: number; bottom?: number; dark?: boolean }) {
  const ref = useRef<HTMLDivElement>(null), drag = useRef(false);
  if (v.z <= 1) return null;
  const to = (y: number) => { const r = ref.current!.getBoundingClientRect(); v.setB(v.clampB(1 - (y - r.top) / r.height - 1 / v.z / 2, v.z)); };
  return <div ref={ref} className={"spekvs" + (dark ? "" : " light")} style={{ top, bottom, right }} title="ลากเพื่อเลื่อนช่วงขึ้นลง หรือหมุนล้อเมาส์บนกราฟก็ได้" data-vbar
    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = true; to(e.clientY); }} onPointerMove={(e) => { if (drag.current) to(e.clientY); }} onPointerUp={() => { drag.current = false; }} onPointerCancel={() => { drag.current = false; }}>
    <i style={{ height: 100 / v.z + "%", bottom: v.b * 100 + "%" }} /></div>;
}

/** กดเมาส์ลากบนกราฟที่ซูมอยู่ กราฟขยับตามมือ ซ้ายขวาคือเวลา ขึ้นลงคือแกนตั้ง · ไม่ได้ซูมแกนไหน แกนนั้นไม่ขยับ
    ขยับเกิน 3 จุดถึงเริ่มลาก กดเฉย ๆ ยังเป็นการชี้ตามเดิม · ปรับค่าเฟรมละครั้ง (พี่กันสั่ง 9 พ.ย. 2569 "เราขอเอาเมาส์กดลากได้ที ขอทุกกราฟที่ซูม") */
type GrabOpt = { canX: boolean; canY: boolean; span: number; center: number; z: number; b: number; left: number; right: number; top?: number; bottom?: number; onX?: (c: number) => void; onY?: (b: number) => void; onBusy?: (on: boolean) => void };
export function useGrab(o: GrabOpt) {
  const now = useRef(o); now.current = o;
  const st = useRef<{ x: number; y: number; lx: number; ly: number; c: number; b: number; span: number; z: number; pw: number; ph: number; moved: boolean } | null>(null);
  const raf = useRef(0);
  const [on, setOn] = useState(false);
  const apply = () => {
    raf.current = 0;
    const s = st.current, g = now.current; if (!s) return;
    if (g.canX) g.onX?.(s.c - (s.lx - s.x) / s.pw * s.span);
    if (g.canY) g.onY?.(s.b + (s.ly - s.y) / s.ph / s.z);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    const g = now.current;
    if (e.button !== 0 || (!g.canX && !g.canY) || (e.target as HTMLElement).closest("button,input,a,[role=slider],.spekvs,.spektools")) return;
    const r = e.currentTarget.getBoundingClientRect();
    st.current = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, c: g.center, b: g.b, span: g.span, z: g.z, pw: Math.max(1, r.width - g.left - g.right), ph: Math.max(1, r.height - (g.top ?? 0) - (g.bottom ?? 0)), moved: false };
  };
  /** คืนจริงเมื่อกดค้างอยู่ ตัวเรียกไม่ต้องทำเส้นชี้ต่อ */
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const s = st.current; if (!s) return false;
    s.lx = e.clientX; s.ly = e.clientY;
    if (!s.moved) {
      if (Math.hypot(s.lx - s.x, s.ly - s.y) < 3) return true;
      s.moved = true; e.currentTarget.setPointerCapture(e.pointerId); setOn(true); now.current.onBusy?.(true);
    }
    if (!raf.current) raf.current = requestAnimationFrame(apply);
    return true;
  };
  const end = () => {
    const s = st.current; if (!s) return;
    if (raf.current) { cancelAnimationFrame(raf.current); apply(); }
    st.current = null;
    if (s.moved) { setOn(false); now.current.onBusy?.(false); }
  };
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  const pannable = o.canX || o.canY;
  return { move, cls: pannable ? "grabok" + (on ? " grabbing" : "") : "", props: { onPointerDown, onPointerMove: (e: React.PointerEvent<HTMLElement>) => { move(e); }, onPointerUp: end, onPointerCancel: end } };
}
export type Grab = ReturnType<typeof useGrab>;
/** ค่าตั้งแต่ 0 ถึง 1 ค่อย ๆ ขึ้นทุกครั้งที่ข้อมูลใหม่มา ใช้ให้กราฟเติบโตขึ้นแทนการแวบมา · เผื่อหน้าต่างอยู่หลังสุดเฟรมไม่เดิน มีตัวตั้งเวลาปิดท้าย */
export function useRise(data: unknown, ms = 450) {
  const [rise, setRise] = useState(1);
  useLayoutEffect(() => {
    if (!data || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setRise(1); return; }
    const start = performance.now(); let id = 0;
    const tick = (n: number) => { const k = Math.min(1, (n - start) / ms); setRise(1 - Math.pow(1 - k, 3)); if (k < 1) id = requestAnimationFrame(tick); };
    setRise(0); id = requestAnimationFrame(tick);
    const stop = setTimeout(() => setRise(1), ms + 150);
    return () => { cancelAnimationFrame(id); clearTimeout(stop); };
  }, [data, ms]);
  return rise;
}
/** ข้อมูลระหว่างลาก ตรงที่มีช่วงซูมเดิมใช้ตัวคม ตรงที่เพิ่งโผล่ใช้ภาพรวมไปก่อน ปล่อยเมาส์แล้วอ่านช่วงใหม่มาแทน */
export function mixSrc(held: GWindow, ov: GOverview, t0: number, t1: number, cols: number): Src {
  const ovc = ov.cols, hc = held.cols, hs = held.t1 - held.t0 || 1, env = ov.env.map((oe, ch) => {
    const he = held.env[ch], out = new Array<number>(cols * 3);
    for (let c = 0; c < cols; c++) {
      const tm = t0 + (t1 - t0) * (c + 0.5) / cols, inHeld = tm >= held.t0 && tm <= held.t1;
      const e = inHeld ? he : oe, k = inHeld ? Math.min(hc - 1, Math.floor((tm - held.t0) / hs * hc)) : Math.max(0, Math.min(ovc - 1, Math.floor(tm / ov.duration * ovc)));
      out[c * 3] = e[k * 3]; out[c * 3 + 1] = e[k * 3 + 1]; out[c * 3 + 2] = e[k * 3 + 2];
    }
    return out;
  });
  return { env, cols, t0, t1 };
}

export function axisY(g: CanvasRenderingContext2D, x0: number, w: number, h: number, pad: number, lo: number, hi: number, step: number, unit: string) {
  g.font = "11px Sarabun, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle";
  const top = Math.floor(hi / step) * step;
  for (let v = top; v >= lo; v -= step) { const y = pad + (hi - v) / (hi - lo) * (h - pad * 2); g.fillStyle = "#f3e2e9"; g.fillRect(x0, Math.round(y), w - x0, 1); g.fillStyle = "#a88595"; g.fillText(minus(String(v)) + (v === top ? " " + unit : ""), x0 - 4, y); }
}

/* ---------- ชิ้นส่วน ---------- */
export function Speakers({ names, th, levels, hidden, onToggle }: { names: string[]; th: Theme; levels: number[]; hidden: string[]; onToggle: (c: string) => void }) {
  const has = (c: string) => names.includes(c);
  const surround = names.length >= 5;
  const VH = surround ? 184 : names.length === 1 ? 62 : 150;
  const pos = (c: string, i: number): [number, number] => {
    if (names.length === 2) return c === "FL" ? [52, 38] : [148, 38];
    if (names.length === 1) return [100, 31];
    const P: Record<string, [number, number]> = { FC: [100, 24], FL: [48, 38], FR: [152, 38], LFE: [100, 68], BL: [50, 160], BR: [150, 160], BC: [100, 166], FLC: [74, 30], FRC: [126, 30],
      SL: has("BL") ? [20, 110] : [28, 146], SR: has("BR") ? [180, 110] : [172, 146] };
    return P[c] ?? [20 + (i % 6) * 32, 120 + Math.floor(i / 6) * 30];
  };
  const hy = surround ? 114 : 92;
  return (
    <svg className="spk" width="200" height={VH} viewBox={`0 0 200 ${VH}`} role="img" aria-label={`แผนผังลำโพง ${names.length} ช่อง`}>
      {names.length > 1 && <g aria-hidden="true">
        {/* วงเสียงรอบที่นั่งฟัง */}
        {[58, 40, 24].map((r, k) => <circle key={r} cx="100" cy={hy} r={r} fill={th.rms} fillOpacity={0.035 + k * 0.025} />)}
        <circle cx="100" cy={hy - 6} r="6" fill={th.rms} fillOpacity="0.75" />
        <path d={`M88 ${hy + 11} a12 10 0 0 1 24 0 z`} fill={th.rms} fillOpacity="0.75" />
        <text x="100" y={hy + 24} textAnchor="middle" fontSize="10" fill="#8a6474" fontFamily="Sarabun">ที่นั่งฟัง</text>
      </g>}
      {names.map((c, i) => {
        const [x, y] = pos(c, i), off = hidden.includes(c), a = off ? 0 : 0.25 + 0.75 * Math.min(1, (levels[i] ?? 0) * 3) /* ระหว่างอ่านยังไม่มีค่า ขึ้นจาง (ค่าว่างเคยทำให้ทึบทุกตัว) */, d = label(names, c).code;
        const toggle = () => onToggle(c);
        // ไฟล์ช่องเดียว ซ่อนช่องสุดท้ายไม่ได้ ลำโพงจึงไม่เป็นปุ่ม (เดิมชี้แล้วขึ้นว่ากดเพื่อปิดช่อง แต่กดแล้วไม่เกิดอะไร เจอตอนตรวจ 11 พ.ย. 2569)
        const solo = names.length === 1;
        const btn = solo ? {} : { tabIndex: 0, role: "button", "aria-label": (off ? "แสดง" : "ซ่อน") + "ช่อง " + d, onClick: toggle, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } } };
        const lfe = c === "LFE";
        // คลื่นเสียงแผ่ไปทางที่นั่งฟัง ช่องเดียวแผ่ลงล่าง · ดังมากคลื่นมาก ดังน้อยคลื่นน้อย ช่องที่ซ่อนไม่มีคลื่น
        const dir = names.length > 1 ? Math.atan2(hy - y, 100 - x) : Math.PI / 2;
        const waves = off ? 0 : Math.max(1, Math.ceil(a * 3));
        const R = lfe ? 11 : 15, half = lfe ? 0.8 : 0.62;
        return (
          <g key={c} className={solo ? "s solo" : "s"} {...btn}>
            <title>{solo ? "ช่อง " + d : (off ? "กดเพื่อเปิดช่อง " : "กดเพื่อปิดช่อง ") + d}</title>
            {Array.from({ length: waves }, (_, k) => {
              const r = R + 4 + k * 4, x1 = x + r * Math.cos(dir - half), y1 = y + r * Math.sin(dir - half), x2 = x + r * Math.cos(dir + half), y2 = y + r * Math.sin(dir + half);
              return <path key={k} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} fill="none" stroke={th.rms} strokeWidth="2" strokeLinecap="round" strokeOpacity={0.85 - k * 0.25} />;
            })}
            {lfe ? <rect x={x - 15} y={y - 11} width="30" height="22" rx="6" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />
              : <><circle cx={x} cy={y} r="15" fill={off ? "#fff" : th.rms} fillOpacity={off ? 1 : a} stroke={off ? "#e5b7c8" : th.rms} strokeWidth="1.5" strokeDasharray={off ? "3 3" : undefined} />
                {!off && <circle cx={x} cy={y} r="11.5" fill="none" stroke={a > 0.55 ? "#fff" : th.rms} strokeOpacity="0.45" strokeWidth="1" />}</>}
            <text x={x} y={y + 4} textAnchor="middle" fontSize={d.length > 2 ? 9.5 : 11} fontWeight="700" fontFamily="Sarabun" fill={off ? "#b28a9a" : a > 0.55 ? "#fff" : "#4a2b38"}>{d}</text>
          </g>
        );
      })}
    </svg>
  );
}

export type Mark = { from: number; to: number; text: string };

export type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
/** ปุ่มปิดเปิดลำโพงของช่องที่ป้ายชื่อช่อง ทำงานเหมือนกดลำโพงในผังช่องเสียง · ช่องสุดท้ายที่ยังเปิดอยู่ปิดไม่ได้ บอกเหตุผลที่ปุ่ม
 *  (BUGS ข้อ 148 พี่กันสั่ง 16 พ.ย. 2569 "อยากให้มีปุ่มปิดช่อง ที่จุดนี้ด้วย") */
type LaneTog = { onToggle?: () => void; last?: boolean };
function LaneBtn({ code, off, onToggle, last }: LaneTog & { code: string; off: boolean }) {
  if (!onToggle) return null;
  const why = !off && last ? "ต้องเปิดอย่างน้อยหนึ่งช่อง จึงปิดช่องนี้ไม่ได้" : undefined;
  return (
    <button type="button" className={"lanetog" + (why ? " wait" : "")} aria-pressed={!off} aria-disabled={why ? true : undefined}
      title={why ?? (off ? `เปิดลำโพงช่อง ${code}` : `ปิดลำโพงช่อง ${code}`)} aria-label={off ? `เปิดลำโพงช่อง ${code}` : `ปิดลำโพงช่อง ${code}`}
      onClick={() => { if (!why) onToggle(); }} data-lanetog={code}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" fillOpacity=".15" />
        {off ? <path d="m16 9 5 6M21 9l-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  );
}
export function Lane({ code, th: thai, peak, height, draw, deps, ruler, room, onToggle, last }: { code: string; th: string; peak: string; height: number; draw: Draw; deps: unknown[]; ruler?: Draw; room?: boolean } & LaneTog) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return (
    <div className="lane" data-lane={code} style={ruler || room ? { gridTemplateColumns: `96px ${RUL_W}px 1fr` } : undefined}>
      <div className="lab"><b>{code}<LaneBtn code={code} off={false} onToggle={onToggle} last={last} /></b><span>{thai}</span><em>{peak}</em></div>
      {ruler ? <RulerCv height={height} draw={ruler} deps={deps} /> : room ? <span aria-hidden="true" /> : null}
      <canvas className="cv" style={{ height }} ref={ref} data-rawdraw />
    </div>
  );
}
/** ช่องที่ปิดลำโพง แถบยังอยู่ที่เดิมสูงเท่าเดิม กราฟช่องอื่นไม่ขยับ */
export function LaneOff({ code, th: thai, peak, height, onToggle }: { code: string; th: string; peak: string; height: number } & LaneTog) {
  return (
    <div className="lane" data-lane={code} data-off>
      <div className="lab"><b>{code}<LaneBtn code={code} off onToggle={onToggle} /></b><span>{thai}</span><em>{peak}</em></div>
      <div className="laneoff" style={{ height }}>ปิดลำโพง</div>
    </div>
  );
}
function RulerCv({ height, draw, deps }: { height: number; draw: Draw; deps: unknown[] }) {
  const ref = useCanvas((g, w, h) => draw(g, w, h), deps);
  return <canvas className="vrul" style={{ height }} ref={ref} data-vrul />;
}

export function Crosshair({ box, left, right, t0, t1, at, rows }: { box: HTMLDivElement | null; left: number; right: number; t0: number; t1: number; at: number; rows: { v: string; k: string; color?: string }[] }) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipLeft, setTipLeft] = useState(0);
  const W = (box?.clientWidth ?? 0) - left - right, x = left + (at - t0) / (t1 - t0 || 1) * W;
  useLayoutEffect(() => { const tw = tipRef.current?.offsetWidth ?? 0; setTipLeft(x + 12 + tw > (box?.clientWidth ?? 0) ? x - 12 - tw : x + 12); });
  if (!box || W <= 0) return null;
  return (<>
    <div className="xh" style={{ left: x }} />
    <div className="tip" ref={tipRef} style={{ left: tipLeft }}>
      <div className="t">{tfmtD(at, spanDigits(t1 - t0))}</div>
      <div className="r">{rows.map((r) => <Fragment2 key={r.k} v={r.v} k={r.k} color={r.color} />)}</div>
    </div>
  </>);
}
export function Fragment2({ v, k, color }: { v: string; k: string; color?: string }) {
  return <><b>{v}</b><span>{color && <i className="key" style={{ background: color }} />}{k}</span></>;
}

/** ความกว้างป้ายเครื่องหมายโดยประมาณ (ตัวอักษร 600 11.5px ไอคอน 12 ช่องไฟ 4 ระยะใน 12 เส้นขอบ 2) */
let markCtx: CanvasRenderingContext2D | null = null;
function markLabelW(text: string) {
  markCtx ??= document.createElement("canvas").getContext("2d");
  if (!markCtx) return text.length * 7 + 30;
  markCtx.font = `600 11.5px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(markCtx.measureText(text).width) + 30;
}
/** จัดกลุ่มป้ายที่จะทับกัน · ป้ายแบบลอยเหนือกราฟอยู่กลางกลุ่ม · แบบในกราฟ (inline) อยู่ข้างแถบแรกของกลุ่ม */
function markGroups(items: { m: Mark; a: number; b: number }[], inline?: boolean) {
  const out: { first: number; n: number; center: number }[] = [];
  const GAP = 6;
  let cur: { first: number; n: number; a: number; b: number } | null = null;
  const box = (g: { first: number; n: number; a: number; b: number }) => {
    const t = items[g.first].m.text + (g.n > 1 ? ` และอีก ${g.n - 1} จุดใกล้กัน` : "");
    const w = markLabelW(t);
    if (inline) return [g.a + 6, g.a + 6 + w];
    const c = (g.a + g.b) / 2;
    return [c - w / 2, c + w / 2];
  };
  items.forEach((it, i) => {
    if (cur) {
      const [, r] = box(cur);
      const next = { first: i, n: 1, a: it.a, b: it.b };
      const [l2] = box(next);
      if (l2 < r + GAP) { cur.n += 1; cur.b = Math.max(cur.b, it.b); return; }
      out.push({ first: cur.first, n: cur.n, center: (cur.a + cur.b) / 2 });
    }
    cur = { first: i, n: 1, a: it.a, b: it.b };
  });
  if (cur) { const g = cur as { first: number; n: number; a: number; b: number }; out.push({ first: g.first, n: g.n, center: (g.a + g.b) / 2 }); }
  return out;
}

export function Marks({ marks, t0, t1, left, right, inline }: { marks: Mark[]; t0: number; t1: number; left: number; right: number; inline?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => { const p = ref.current?.parentElement; if (p) setW(p.clientWidth); });
  const W = w - left - right;
  // ป้ายที่อยู่ใกล้กันจนทับกัน รวมเป็นป้ายเดียวของกลุ่ม แถบสีของทุกจุดยังอยู่ครบ
  // (BUGS ข้อ 147 พี่กันทัก 16 พ.ย. 2569 "มันดูทัยซ้อนกันแปลกๆนะ" ป้ายเงียบทุกช่อง 4.7 กับ 1.0 วินาทีทับกัน)
  const items = W > 0 ? marks.filter((m) => m.to > t0 && m.from < t1).map((m) => ({ m, a: Math.max(0, (m.from - t0) / (t1 - t0) * W), b: Math.min(W, (m.to - t0) / (t1 - t0) * W) })).sort((x, y) => x.a - y.a) : [];
  const groups = markGroups(items, inline);
  return <div ref={ref} style={{ display: "contents" }}>{items.map(({ m, a, b }, i) => {
    const g = groups.find((x) => x.first === i);
    const near = left + a > w * 0.6;
    const label = g && (g.n > 1 ? `${m.text} และอีก ${g.n - 1} จุดใกล้กัน` : m.text);
    return (
      <div key={i} className="mark" data-mark style={{ left: left + a, width: Math.max(3, b - a), ...(inline ? { top: 8, bottom: 8 } : {}) }}>
        {label && <span className="ml" data-mark-label style={inline ? (near ? { top: 0, left: "auto", right: "calc(100% + 6px)", transform: "none" } : { top: 0, left: "calc(100% + 6px)", transform: "none" }) : { left: g.center - a }}>{WARN}{label}</span>}
      </div>
    );
  })}</div>;
}
