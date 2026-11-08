/* ช่องค้นหาตัวกลาง (สกิล search-system ข้อ 7–11 · ต้นแบบบรรทัด 560–577)
   ✓ แว่นขยาย · ปุ่มล้างโผล่เฉพาะตอนมีคำ · ป้าย "ค้นว่า ..." ตอนระบบแปลงแป้นให้ · Esc ล้างคำ
   ✓ โครงสามชั้นกันวรรณยุกต์ไทยโดนตัด ช่องพิมพ์ของระบบตัดตัวอักษรที่ล้นเสมอ ปิดไม่ได้
     ① กรอบที่ตาเห็น ② ชั้นวาดตัวหนังสือ ปล่อยล้นได้ สูงเกินกรอบบนล่าง 7 จุด ③ ช่องพิมพ์จริง ตัวหนังสือโปร่งใส เหลือแต่ขีดกะพริบ
   ✓ ชั้นวาดเลื่อนตามช่องพิมพ์ตอนพิมพ์ยาวเกินช่อง · เลิกโฟกัสเลื่อนกลับต้นคำ */
import { useRef, useState } from "react";

export default function SearchBox(p: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  /** คำที่ระบบใช้ค้นจริงตอนแปลงแป้น · ว่าง = ไม่ขึ้นป้าย */
  swapLabel?: string;
  width?: number | string;
}) {
  const draw = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [focus, setFocus] = useState(false);
  const sync = () => { if (draw.current && input.current) draw.current.scrollLeft = input.current.scrollLeft; };
  const has = !!p.value;

  return (
    <div
      className={"search" + (focus ? " focus" : "") + (has ? " has" : "")}
      style={{ width: p.width ?? 200 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a0768a" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ flex: "none", pointerEvents: "none" }}>
        <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
      </svg>
      <div className="sb-field">
        <div ref={draw} className="sb-draw" aria-hidden="true">
          <span className={has ? "" : "ph"}>{p.value || p.placeholder}</span>
        </div>
        <input
          ref={input}
          value={p.value}
          aria-label={p.label}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => { p.onChange(e.target.value); requestAnimationFrame(sync); }}
          onScroll={sync}
          onKeyUp={sync}
          onFocus={() => setFocus(true)}
          onBlur={() => { setFocus(false); if (input.current) input.current.scrollLeft = 0; sync(); }}
          onKeyDown={(e) => { if (e.key === "Escape" && p.value) { e.stopPropagation(); p.onChange(""); } }}
        />
      </div>
      {!!p.swapLabel && <span className="swap">ค้นว่า {p.swapLabel}</span>}
      {has && (
        <button type="button" className="clr" aria-label="ล้างคำค้น" title="ล้างคำค้น" onClick={() => { p.onChange(""); input.current?.focus(); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}
