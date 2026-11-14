/* ชั้นเครื่องมือบนภาพของหน้าแก้ซับ (BUGS ข้อ 111 ส่วนที่สองและสาม · แบบ Aegisub visual_tool_cross.cpp visual_tool_drag.cpp)
   เครื่องมือกากบาท (A) เส้นกากบาทเต็มภาพกับพิกัดสคริปต์ข้างเมาส์ กด Shift แสดงพิกัดกลับด้าน
     ดับเบิลคลิก ย้ายบรรทัดที่เลือกให้ตำแหน่งของบรรทัดที่กำลังแก้มาอยู่ตรงที่คลิก
   เครื่องมือลาก (S) จุดจับของทุกบรรทัดที่ขึ้นบนภาพ สี่เหลี่ยมคือ \pos หรือจุดตั้งต้นของ \move วงกลมคือจุดปลายของ \move สามเหลี่ยมคือ \org
     ลากแล้วแก้แท็กของบรรทัด จุดที่เลือกไว้หลายจุดเลื่อนไปด้วยกัน กด Shift ลากแกนเดียว ทั้งการลากเป็นการแก้ขั้นเดียว เลิกทำทีเดียวได้
     คลิกจุดเลือกบรรทัดนั้นในตาราง Ctrl คลิกเพิ่มหรือเอาออก คลิกที่ว่างเหลือบรรทัดที่กำลังแก้บรรทัดเดียว
     ดับเบิลคลิก ย้ายบรรทัดที่เลือกไปตามระยะจากจุดจับที่กดล่าสุด
   สีจุดจับตามค่าตั้งต้นของ Aegisub (Colour/Visual Tools) · ระหว่างเล่นหนังชั้นนี้ไม่ทำงาน · คลิกขวาเปิดเมนูของภาพ (SubVideo) */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SubDoc } from "../../lib/api";
import { edit, select, useSubEdit } from "../../lib/subEdit";
import { playRes } from "../../lib/subStyle";
import { isAss } from "../../lib/subText";
import {
  crossText, dragText, hitFeat, linePosition, makeFeatures, shiftText, shownAt, singleAxis, toScript, vStr, type Feat, type Lay, type V2,
} from "../../lib/subVisual";
import type { Framerate } from "../../lib/vidFrames";

export type VTool = "cross" | "drag";

/** สีของเครื่องมือบนภาพ ค่าตั้งต้นของ Aegisub (default_config.json Colour/Visual Tools) · เป็นเนื้อหาบนภาพ ไม่เปลี่ยนตามโทน */
const C = { hiP: "rgb(255,169,40)", hiS: "rgb(255,253,185)", lineP: "rgb(187,0,0)", lineS: "rgb(106,32,19)" };

type Props = {
  doc: SubDoc;
  delay: number;
  fr: Framerate | null;
  pos: number | null;
  /** เวลาของภาพ ms */
  tNow: number;
  /** ที่อยู่ของภาพบนชั้นนี้ */
  lay: Lay;
  w: number;
  h: number;
  tool: VTool;
  /** คลิกขวา · at พิกัดสคริปต์ตรงที่คลิก */
  onMenu: (e: React.MouseEvent, at: V2) => void;
  onFocus: () => void;
};

type Drag = { id: number; start: V2; starts: Map<string, V2>; keys: Set<string>; key: string; moved: boolean; selChanged: boolean };
let dragSeq = 0;

export default function VideoTools(p: Props) {
  const se = useSubEdit();
  const sel = se.sel, active = se.active;
  const { doc, lay } = p;
  const res = playRes(doc);
  const ass = isAss(doc);
  const svg = useRef<SVGSVGElement>(null);
  const [mouse, setMouse] = useState<V2 | null>(null);
  const [shift, setShift] = useState(false);
  const lines = useMemo(() => doc.events.filter((e) => shownAt(e, p.delay, p.tNow, p.fr, p.pos)), [doc, p.delay, p.tNow, p.fr, p.pos]);
  const base = useMemo(() => (p.tool === "drag" && ass ? makeFeatures(doc, lines, lay) : []), [p.tool, ass, doc, lines, lay]);
  const [work, setWork] = useState<Feat[] | null>(null);
  const feats = work ?? base;
  const [selKeys, setSelKeys] = useState<Set<string>>(() => new Set());
  const drag = useRef<Drag | null>(null);
  const primary = useRef<string | null>(null);
  const prevSel = useRef<number[]>(sel);
  const selRef = useRef(sel);
  selRef.current = sel;

  // บรรทัดที่เลือกในตารางเปลี่ยน จุดของบรรทัดที่เลิกเลือกหลุดออก บรรทัดที่เพิ่งเลือกได้จุดตั้งต้น (OnSelectedSetChanged)
  // ตั้งก่อนวาดจอ ไม่งั้นจุดที่เลือกขึ้นสีปกติหนึ่งเฟรมแล้วค่อยเปลี่ยนสี
  useLayoutEffect(() => {
    const before = new Set(prevSel.current);
    prevSel.current = sel;
    const now = new Set(sel);
    setSelKeys((old) => {
      const next = new Set([...old].filter((k) => now.has(Number(k.split(":")[0]))));
      for (const f of base) if (f.kind === "start" && now.has(f.line) && !before.has(f.line) && ![...next].some((k) => k.startsWith(`${f.line}:`))) next.add(f.key);
      return next.size === old.size && [...next].every((k) => old.has(k)) ? old : next;
    });
  }, [sel, base]);
  // เปิดไฟล์ใหม่หรือเปลี่ยนเครื่องมือ จุดที่เลือกเริ่มจากจุดตั้งต้นของบรรทัดที่เลือก (OnFileChanged)
  useLayoutEffect(() => {
    const now = new Set(selRef.current);
    setSelKeys(new Set(base.filter((f) => f.kind === "start" && now.has(f.line)).map((f) => f.key)));
    primary.current = null;
  }, [p.tool, doc.source?.path]); // eslint-disable-line react-hooks/exhaustive-deps

  const pt = (e: React.MouseEvent | React.PointerEvent): V2 => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // แก้แท็กของทุกบรรทัดที่มีจุดถูกลาก เป็นการแก้ขั้นเดียวต่อการลากหนึ่งครั้ง (Aegisub รวมการแก้ระหว่างลากด้วย commit_id)
  const apply = (d: Drag, fs: Feat[]) => {
    edit("จัดซับบนภาพ", (cur) => {
      let changed = false;
      const events = cur.events.map((ev) => {
        let t = ev.text;
        for (const f of fs) if (d.keys.has(f.key) && f.line === ev.id) t = dragText(t, f, fs, lay, res);
        if (t === ev.text) return ev;
        changed = true;
        return { ...ev, text: t };
      });
      return changed ? { ...cur, events } : cur;
    }, { merge: `vdrag:${d.id}`, sticky: true });
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    p.onFocus();
    if (p.tool !== "drag" || !ass) return;
    const m = pt(e);
    const f = hitFeat(feats, m);
    if (!f) {
      // คลิกที่ว่าง เหลือบรรทัดที่กำลังแก้บรรทัดเดียว (เริ่ม hold ของ VisualTool) · กด Alt ไว้ไม่เปลี่ยน
      if (!e.altKey && feats.length > 1 && active != null) { setSelKeys(new Set()); select([active], active); }
      return;
    }
    e.preventDefault();
    let keys = selKeys;
    let selChanged = false;
    if (!keys.has(f.key)) {
      selChanged = true;
      keys = e.ctrlKey ? new Set([...keys, f.key]) : new Set([f.key]);
      select(e.ctrlKey ? [...new Set([...sel, f.line])] : [f.line], f.line);
    } else select(sel, f.line);
    setSelKeys(keys);
    primary.current = f.key;
    // เวลาของจุดที่กดเป็นเวลาของเฟรมที่เห็น จุดอื่นที่เลือกเลื่อนเวลาเท่ากัน (InitializeDrag) · \org ไม่มีเวลา
    let fs = feats.map((x) => ({ ...x }));
    const line = doc.events.find((x) => x.id === f.line);
    if (f.kind !== "org" && p.fr && p.pos != null && line) {
      const change = Math.round(p.fr.timeAt(p.pos) - (line.start + p.delay)) - f.time;
      fs = fs.map((x) => (keys.has(x.key) ? { ...x, time: x.time + change } : x));
    }
    drag.current = { id: ++dragSeq, start: m, starts: new Map(fs.map((x) => [x.key, x.pos])), keys, key: f.key, moved: false, selChanged };
    setWork(fs);
    svg.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const m = pt(e);
    setMouse(m);
    setShift(e.shiftKey);
    const d = drag.current;
    if (!d || !work || !(e.buttons & 1)) return;
    let dv = { x: m.x - d.start.x, y: m.y - d.start.y };
    if (e.shiftKey) dv = singleAxis(dv);
    const fs = work.map((x) => { const s = d.starts.get(x.key)!; return d.keys.has(x.key) ? { ...x, pos: { x: s.x + dv.x, y: s.y + dv.y } } : x; });
    if (dv.x || dv.y) d.moved = true;
    setWork(fs);
    apply(d, fs);
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setWork(null);
    if (d.moved || d.selChanged) return;
    // คลิกจุดที่เลือกอยู่แล้วโดยไม่ลาก Ctrl เอาออก ไม่กด Ctrl เหลือจุดนั้นจุดเดียว
    const f = feats.find((x) => x.key === d.key);
    if (!f) return;
    if (e.ctrlKey) {
      const next = new Set(selKeys);
      next.delete(f.key);
      setSelKeys(next);
      if ([...next].some((k) => k.startsWith(`${f.line}:`)) || sel.length <= 1) return;
      const rest = sel.filter((x) => x !== f.line);
      select(rest, active === f.line ? rest[0] : active);
    } else {
      setSelKeys(new Set([f.key]));
      select([f.line], f.line);
    }
  };

  // ดับเบิลคลิก ย้ายบรรทัดที่เลือก (OnDoubleClick ของสองเครื่องมือ) · ไฟล์ SRT ไม่มีแท็กตำแหน่ง ไม่ทำ
  const onDbl = (e: React.MouseEvent) => {
    if (!ass || active == null) return;
    const act = doc.events.find((x) => x.id === active);
    if (!act) return;
    const m = toScript(pt(e), lay, res);
    let from = linePosition(doc, act);
    if (p.tool === "drag") { const pf = feats.find((x) => x.key === primary.current); if (pf) from = toScript(pf.pos, lay, res); }
    const by = { x: m.x - from.x, y: m.y - from.y };
    const fmt = p.tool === "cross" ? (v: V2) => crossText(v, lay, res) : vStr;
    const ids = new Set(sel.length ? sel : [active]);
    edit("จัดตำแหน่ง", (cur) => ({ ...cur, events: cur.events.map((ev) => (ids.has(ev.id) ? { ...ev, text: shiftText(cur, ev, by, fmt) } : ev)) }));
  };

  const hover = !drag.current && mouse ? hitFeat(feats, mouse) : null;
  const activeKey = drag.current?.key ?? hover?.key ?? null;

  // เส้นกากบาทกับข้อความพิกัด (VisualToolCross::Draw) ข้อความอยู่มุมของกากบาทที่ใกล้กลางภาพ
  let cross: React.ReactNode = null;
  if (p.tool === "cross" && mouse) {
    const v = toScript(shift ? { x: 2 * lay.x + lay.w - mouse.x, y: 2 * lay.y + lay.h - mouse.y } : mouse, lay, res);
    const right = mouse.x > p.w / 2, top = mouse.y < p.h / 2;
    cross = <>
      <g className="se-vxline"><path d={`M0 ${mouse.y + 0.5}H${p.w}M${mouse.x + 0.5} 0V${p.h}`} /></g>
      <text className="se-vxtext" x={right ? mouse.x - 4 : mouse.x + 4} y={top ? mouse.y + 3 : mouse.y - 3} textAnchor={right ? "end" : "start"} dominantBaseline={top ? "hanging" : "auto"} data-vxtext>
        {crossText(v, lay, res)}
      </text>
    </>;
  }

  return (
    <svg ref={svg} className={"se-vtools" + (p.tool === "cross" ? " cross" : "")} width={p.w} height={p.h} viewBox={`0 0 ${p.w} ${p.h}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { if (!drag.current) setMouse(null); }} onDoubleClick={onDbl}
      onContextMenu={(e) => { e.preventDefault(); p.onMenu(e, toScript(pt(e), lay, res)); }} data-vtools={p.tool}>
      {p.tool === "drag" && <Feats feats={feats} selKeys={selKeys} activeKey={activeKey} />}
      {cross}
    </svg>
  );
}

/** จุดจับกับเส้นเชื่อม (DrawAllFeatures กับ VisualToolDrag::Draw) */
function Feats(p: { feats: Feat[]; selKeys: Set<string>; activeKey: string | null }) {
  const out: React.ReactNode[] = [];
  for (const f of p.feats) {
    const fill = f.key === p.activeKey ? C.hiS : p.selKeys.has(f.key) ? C.lineP : C.hiP;
    const { x, y } = f.pos;
    const common = { fill, fillOpacity: 0.3, stroke: C.lineS, strokeWidth: 1 };
    const data = { "data-vfeat": f.kind, "data-vline": f.line, "data-vsel": p.selKeys.has(f.key) ? "1" : undefined };
    if (f.kind === "start") out.push(<g key={f.key} {...data}><rect x={x - 6} y={y - 6} width={12} height={12} {...common} /><path d={`M${x} ${y - 12}V${y + 12}M${x - 12} ${y}H${x + 12}`} stroke={C.lineS} /></g>);
    else if (f.kind === "end") out.push(<g key={f.key} {...data}><circle cx={x} cy={y} r={6} {...common} /><path d={`M${x} ${y - 12}V${y + 12}M${x - 12} ${y}H${x + 12}`} stroke={C.lineS} /></g>);
    else out.push(<g key={f.key} {...data}><path d={`M${x - 9} ${y - 6}L${x + 9} ${y - 6}L${x} ${y + 10}Z`} {...common} /><path d={`M${x} ${y}V${y - 16}M${x} ${y}L${x - 14} ${y + 8}M${x} ${y}L${x + 14} ${y + 8}`} stroke={C.lineS} /></g>);
  }
  // เส้นเชื่อม จุดปลาย \move มีหัวลูกศร \org เป็นเส้นประ จุดใกล้กันไม่วาด
  for (const f of p.feats) {
    if (f.kind === "start") continue;
    const s = p.feats.find((x) => x.line === f.line && x.kind === "start");
    if (!s) continue;
    const arrow = f.kind === "end" ? 10 : 0;
    const dx = f.pos.x - s.pos.x, dy = f.pos.y - s.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 20 + arrow) continue;
    const ux = dx / len, uy = dy / len;
    const a = { x: s.pos.x + ux * 10, y: s.pos.y + uy * 10 };
    const b = { x: f.pos.x - ux * (10 + arrow), y: f.pos.y - uy * (10 + arrow) };
    if (arrow) {
      const tip = { x: b.x + ux * arrow, y: b.y + uy * arrow }, nx = -uy * 4, ny = ux * 4;
      out.push(<g key={`ln-${f.key}`} stroke={C.lineP} strokeOpacity={0.8} strokeWidth={2} fill={C.lineP} fillOpacity={0.8}>
        <path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} /><path d={`M${tip.x} ${tip.y}L${b.x + nx} ${b.y + ny}L${b.x - nx} ${b.y - ny}Z`} strokeWidth={0} />
      </g>);
    } else out.push(<path key={`ln-${f.key}`} d={`M${a.x} ${a.y}L${b.x} ${b.y}`} stroke={C.lineP} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="6 6" />);
  }
  return <>{out}</>;
}
