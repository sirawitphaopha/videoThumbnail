/* ชิ้นส่วนเล็กที่ใช้ทั้งโปรแกรม · สีอยู่ใน styles/app.css ทั้งหมด ในแท็กเก็บแค่ตำแหน่งกับขนาด */
import { useRef } from "react";

/* ---------- ปุ่มคู่ ปุ่มสาม ---------- */
type SegOpt<T extends string> = { value: T; label: React.ReactNode; aria?: string };
export function Seg<T extends string>(p: {
  options: SegOpt<T>[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
  /** ปิดอยู่พร้อมเหตุผล · เหตุผลขึ้นตอนชี้ (ต้นแบบ: ขนาดปกใช้ได้ตอนดูแบบภาพปก) */
  disabledReason?: string;
  label: string;
}) {
  const off = !!p.disabledReason;
  return (
    <div className={"seg" + (p.small ? " sm" : "") + (off ? " seg-off" : "")} role="group" aria-label={p.label} title={p.disabledReason}>
      {p.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={p.value === o.value ? "on" : ""}
          aria-pressed={p.value === o.value}
          aria-disabled={off || undefined}
          aria-label={o.aria}
          onClick={() => { if (!off) p.onChange(o.value); }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- สวิตช์ ---------- */
export function Switch(p: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={p.on}
      aria-label={p.label}
      className={"switch " + (p.on ? "on" : "off")}
      onClick={() => p.onChange(!p.on)}
    />
  );
}

/* ---------- แถบเลื่อนค่า (ซูม คุณภาพ JPG) ---------- */
export function Range(p: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const step = p.step ?? 1;
  const pct = ((p.value - p.min) / (p.max - p.min)) * 100;
  const set = (v: number) => p.onChange(Math.min(p.max, Math.max(p.min, Math.round(v / step) * step)));
  const fromX = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    set(p.min + ((x - r.left) / r.width) * (p.max - p.min));
  };
  return (
    <div
      ref={ref}
      className="range"
      role="slider"
      tabIndex={0}
      aria-label={p.label}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={p.value}
      aria-valuetext={p.format ? p.format(p.value) : String(p.value)}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromX(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons & 1) fromX(e.clientX); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(p.value + step); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(p.value - step); }
        if (e.key === "Home") { e.preventDefault(); set(p.min); }
        if (e.key === "End") { e.preventDefault(); set(p.max); }
      }}
    >
      <i style={{ width: `${pct}%` }} />
      <b style={{ left: `${pct}%` }} />
    </div>
  );
}

/* ---------- โครงจาง ---------- */
export function Skel(p: { w: number | string; h: number; r?: number; style?: React.CSSProperties }) {
  return <div className="skel" aria-hidden="true" style={{ width: p.w, height: p.h, borderRadius: p.r ?? 6, ...p.style }} />;
}

/* ---------- ไอคอนเส้นในการ์ดสถานะของแผงรายละเอียด (ต้นแบบบรรทัด 400 418 421 424) ---------- */
export function CardIcon({ kind }: { kind: "ok" | "bad" | "warn" | "info" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      {kind === "ok" && <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>}
      {kind === "bad" && <><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4.5M12 17.5h.01" /></>}
      {kind === "warn" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5h.01" /></>}
      {kind === "info" && <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>}
    </svg>
  );
}

/* ---------- จุดสีบอกสภาพไฟล์หน้าชื่อบนชั้นวาง (ต้นแบบบรรทัด 86–87 · 269–270) ---------- */
export function Badge({ kind, title }: { kind: "ok" | "bad" | "warn" | "info"; title: string }) {
  return (
    <span className={"badge b-" + kind} title={title} aria-label={title} role="img">
      {kind === "ok" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
      {kind === "bad" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M7 7l10 10M17 7L7 17" /></svg>}
      {kind === "warn" && <svg width="14" height="14" viewBox="0 0 24 24" fill="#7a5410"><rect x="10" y="3.5" width="4" height="11" rx="2" /><circle cx="12" cy="19" r="2.3" /></svg>}
      {kind === "info" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M12 6v12M6 12h12" /></svg>}
    </span>
  );
}

/* ---------- ไอคอนในการ์ดสถานะ (ต้นแบบใช้วงกลมสีทึบกับเครื่องหมายสีขาว) ---------- */
export function StatIcon({ kind }: { kind: "ok" | "bad" | "warn" | "info" }) {
  const fill = { ok: "var(--ok)", bad: "var(--bad)", warn: "var(--warn)", info: "var(--info)" }[kind];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={fill} />
      {kind === "ok" && <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "bad" && <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
      {kind === "warn" && <path d="M12 6.5v7M12 17.2v.3" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />}
      {kind === "info" && <path d="M12 7v10M7 12h10" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
    </svg>
  );
}

/* ---------- ข้อความไทยตัดบรรทัดตรงเว้นวรรค ----------
   ภาษาไทยเว้นวรรคระหว่างวลี แต่เบราว์เซอร์ตัดกลางวลีได้ตามพจนานุกรม (ขาด|ท้าย · คุณภาพเท่า|เดิม)
   ยิ่งเปิด text-wrap: balance ยิ่งตัดกลางวลีบ่อย · word-break: keep-all ไม่มีผลกับภาษาไทยใน WebView2 (ลองแล้ว)
   ทางแก้ แต่ละวลีเป็นกล่อง .phr (inline-block กว้างไม่เกินช่อง) บรรทัดจึงขึ้นใหม่เฉพาะตรงเว้นวรรค
   วลีที่ยาวกว่าช่องเองค่อยตัดในวลีตามพจนานุกรม · ไม้ยมก ๆ ติดกับวลีหน้าเสมอ ห้ามขึ้นต้นบรรทัด
   head = ของที่นำหน้าวลีแรก (จุดสีบนชั้น) ไม่ให้ค้างอยู่บรรทัดเดียวโดด ๆ · tail = ของที่ต่อท้ายวลีสุดท้าย (นามสกุลไฟล์) */
type Part = { text: string; hit?: boolean };
export function Phrases({ parts, head, tail }: { parts: Part[]; head?: React.ReactNode; tail?: React.ReactNode }) {
  const out: React.ReactNode[] = [];
  let k = 0;
  let cur: React.ReactNode[] = head ? [<span key={k++}>{head}</span>] : [];
  const flush = () => { if (cur.length) out.push(<span key={k++} className="phr">{cur}</span>); cur = []; };
  for (const p of parts) {
    for (const s of p.text.split(/( +)(?!ๆ)/)) {
      if (!s) continue;
      if (!s.trim()) { flush(); out.push(s); continue; }
      cur.push(p.hit ? <span key={k++} className="hl">{s}</span> : s);
    }
  }
  if (tail) cur.push(<span key={k++}>{tail}</span>);
  flush();
  return <>{out}</>;
}
export const Phr = ({ children, tail }: { children: string; tail?: React.ReactNode }) => <Phrases parts={[{ text: children }]} tail={tail} />;
