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
