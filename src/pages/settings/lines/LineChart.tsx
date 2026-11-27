/* กราฟพื้นที่ซ้อนของหัวข้อบรรทัดโค้ด ทุก commit ตามลำดับ ปักหมุดเลขรุ่น ชี้แล้วขึ้นตัวเลขของ commit นั้น (BUGS ข้อ 160)
   แกนนอนเว้นระยะเท่ากันทุก commit ไม่ใช่ตามเวลา (หลาย commit ในวันเดียวกันจะได้ไม่เบียด) ป้ายวันที่ใต้แกนบอกเวลา
   แต่ละชั้นเว้นเส้นสีพื้นบาง ๆ คั่น (สกิลกราฟ ข้อเว้นช่องระหว่างพื้นที่ซ้อน) · สีของชั้นตามกลุ่มหรือชนิดบรรทัด ไม่เปลี่ยนตามจำนวนที่เลือก */
import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_NAMES, groupColor, kindColor, shownVer, type Group, type Point } from "./lineData";
import { cntOf, fmt, niceTicks, type Filter } from "./lineCalc";
import type { Stack } from "./useLineFilter";

const H = 280, ML = 58, MR = 14, MT = 34, MB = 28;
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** 2026-11-24 เป็น 24 พ.ย. */
export const thDate = (d: string) => { const [, m, day] = d.slice(0, 10).split("-").map(Number); return `${day} ${MONTHS[m - 1] ?? ""}`; };

/** ชื่องานจากข้อความ commit · จุดกลางที่ใช้คั่นวลีเปลี่ยนเป็นจุลภาค ตามกฎข้อความบนจอ */
const subj = (s: string) => s.replace(/\s*·\s*/g, ", ");

type Series = { key: string; name: string; color: string; vals: number[] };
type Pt = { d: string; v: string | null; vm: 0 | 1; s: string; n: Point["n"]; now?: boolean };

export default function LineChart({ points, now, groups, filter, stack, dark }: { points: Point[]; now?: Pt; groups: Group[]; filter: Filter; stack: Stack; dark: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(320, Math.round(el.clientWidth))));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const pts: Pt[] = useMemo(() => (now ? [...points, now] : points), [points, now]);
  const series: Series[] = useMemo(() => {
    if (stack === "group") return groups.filter((g) => filter.groups.includes(g.id)).map((g) => ({ key: g.id, name: g.name, color: groupColor(g.id, dark), vals: pts.map((p) => cntOf(p.n[g.id], filter)) }));
    return ([0, 1, 2] as const).filter((k) => filter.kinds[k]).map((k) => ({ key: "k" + k, name: KIND_NAMES[k], color: kindColor(k, dark), vals: pts.map((p) => filter.groups.reduce((s, g) => s + (p.n[g]?.[k] ?? 0), 0)) }));
  }, [pts, groups, filter, stack, dark]);

  const N = pts.length, pw = w - ML - MR, ph = H - MT - MB;
  const tot = pts.map((_, i) => series.reduce((s, x) => s + x.vals[i], 0));
  const ticks = niceTicks(Math.max(1, ...tot));
  const top = ticks[ticks.length - 1] || 1;
  const X = (i: number) => ML + (N <= 1 ? pw / 2 : (i / (N - 1)) * pw);
  const Y = (v: number) => MT + ph - (v / top) * ph;

  // พื้นที่ซ้อนจากล่างขึ้นบน ชั้นแรกอยู่ล่างสุด
  const cum = new Array(N).fill(0);
  const areas = series.map((s) => {
    const lo = cum.slice(); s.vals.forEach((v, i) => { cum[i] += v; });
    const up = pts.map((_, i) => `${X(i).toFixed(1)},${Y(cum[i]).toFixed(1)}`);
    const down = pts.map((_, i) => `${X(i).toFixed(1)},${Y(lo[i]).toFixed(1)}`).reverse();
    return { s, d: `M${up.join("L")}L${down.join("L")}Z`, edge: `M${up.join("L")}` };
  });

  // หมุดรุ่น ป้ายสองแถวสลับกัน ป้ายที่ชิดป้ายก่อนหน้าในแถวเดียวกันเกินไปไม่เขียน (ชี้ที่กราฟยังเห็นเลขรุ่น)
  const rowEnd = [-1e9, -1e9];
  const marks = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.vm).map(({ p, i }) => {
    const x = X(i), label = shownVer(p.v), wid = label.length * 6.4 + 6;
    const row = x - wid / 2 > rowEnd[0] + 4 ? 0 : x - wid / 2 > rowEnd[1] + 4 ? 1 : -1;
    if (row >= 0) rowEnd[row] = x + wid / 2;
    return { x, label, row };
  });
  // ป้ายวันที่ใต้แกน ราวห้าตำแหน่งเว้นเท่ากัน ไม่ซ้ำวันกัน
  const dateIdx: number[] = [];
  for (let k = 0; k < 6 && N > 0; k++) { const i = Math.round((k / 5) * (N - 1)); const lab = pts[i].now ? "ตอนนี้" : thDate(pts[i].d); if (!dateIdx.some((j) => (pts[j].now ? "ตอนนี้" : thDate(pts[j].d)) === lab)) dateIdx.push(i); }

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const i = N <= 1 ? 0 : Math.round(((e.clientX - r.left - ML) / pw) * (N - 1));
    setHover(Math.max(0, Math.min(N - 1, i)));
  };
  const hp = hover != null ? pts[hover] : null;
  const tipLeft = hover != null && X(hover) > w * 0.62;

  return (
    <div className="lst-chart" ref={box} data-lines-chart>
      <svg width={w} height={H} role="img" aria-label={`กราฟบรรทัดโค้ด ${N} จุด ตั้งแต่ ${N ? thDate(pts[0].d) : ""} ถึงตอนนี้ ล่าสุดรวม ${fmt(tot[N - 1] ?? 0)} บรรทัด`}>
        {ticks.map((t) => <g key={t}><line x1={ML} x2={w - MR} y1={Y(t)} y2={Y(t)} className="lst-grid" /><text x={ML - 8} y={Y(t) + 4} textAnchor="end" className="lst-axis">{fmt(t)}</text></g>)}
        {areas.map((a) => <path key={a.s.key} d={a.d} fill={a.s.color} opacity={hover != null ? 0.92 : 1} data-lines-area={a.s.key} />)}
        {areas.map((a) => <path key={a.s.key + "e"} d={a.edge} className="lst-edge" />)}
        {marks.map((m) => <g key={m.label + m.x} data-lines-mark={m.label}>
          <line x1={m.x} x2={m.x} y1={MT - 4} y2={MT + ph} className="lst-mark" />
          {m.row >= 0 && <text x={m.x} y={m.row === 0 ? 13 : 26} textAnchor="middle" className="lst-mlab">{m.label}</text>}
        </g>)}
        <line x1={ML} x2={w - MR} y1={MT + ph} y2={MT + ph} className="lst-base" />
        {dateIdx.map((i) => <text key={i} x={X(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === N - 1 ? "end" : "middle"} className="lst-axis">{pts[i].now ? "ตอนนี้" : thDate(pts[i].d)}</text>)}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={MT - 4} y2={MT + ph} className="lst-cross" />}
        <rect x={ML} y={MT - 4} width={pw} height={ph + 4} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} data-lines-hit />
      </svg>
      {hp && <div className={"lst-tip" + (tipLeft ? " left" : "")} style={{ left: tipLeft ? undefined : X(hover!) + 12, right: tipLeft ? w - X(hover!) + 12 : undefined }} data-lines-tip>
        <div className="lst-tip-h">{hp.now ? "ตอนนี้ งานที่ยังไม่ขึ้นรุ่น" : `${thDate(hp.d)} ${hp.d.slice(11, 16)} น.`}{hp.v && <span className="lst-tip-v">รุ่น {shownVer(hp.v)}</span>}</div>
        {!hp.now && <div className="lst-tip-s">{subj(hp.s)}</div>}
        {series.slice().reverse().map((s) => <div key={s.key} className="lst-tip-r"><i style={{ background: s.color }} />{s.name}<b>{fmt(s.vals[hover!])}</b></div>)}
        <div className="lst-tip-r lst-tip-t">รวม<b>{fmt(tot[hover!])}</b></div>
      </div>}
    </div>
  );
}
