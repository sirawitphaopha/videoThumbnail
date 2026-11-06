/* ช่องพิมพ์ข้อความไทยที่สระบนวรรณยุกต์ไม่โดนตัด (สกิล form-input · ต้นแบบ .inp บรรทัด 110–115)
   ช่องพิมพ์ของระบบตัดตัวอักษรที่ล้นกรอบเสมอ ปิดไม่ได้ จึงทำสามชั้นแบบเดียวกับช่องค้นหา (SearchBox)
     ① กรอบที่ตาเห็น ② ชั้นวาดตัวหนังสือ ปล่อยล้นบนล่างได้ ③ ช่องพิมพ์จริง ตัวหนังสือโปร่งใส เหลือแต่ขีดกะพริบ
   ชั้นวาดเลื่อนตามช่องพิมพ์ตอนพิมพ์ยาวเกินกรอบ · suffix = ของที่ล็อกไว้ทางขวา พิมพ์ทับไม่ได้ (นามสกุลไฟล์) */
import { useRef, useState } from "react";

export default function ThaiInput(p: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  suffix?: React.ReactNode;
  err?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  describedBy?: string;
}) {
  const draw = useRef<HTMLDivElement>(null);
  const own = useRef<HTMLInputElement>(null);
  const input = p.inputRef ?? own;
  const [focus, setFocus] = useState(false);
  const sync = () => { if (draw.current && input.current) draw.current.scrollLeft = input.current.scrollLeft; };
  return (
    <div
      className={"inp" + (focus && !p.readOnly ? " focus" : "") + (p.err ? " err" : "")}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); input.current?.focus(); } }}
    >
      <div className="sb-field">
        <div ref={draw} className="sb-draw" aria-hidden="true"><span>{p.value}</span></div>
        <input
          ref={input}
          value={p.value}
          aria-label={p.label}
          aria-invalid={p.err || undefined}
          aria-describedby={p.describedBy}
          readOnly={p.readOnly}
          autoFocus={p.autoFocus}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => { p.onChange(e.target.value); requestAnimationFrame(sync); }}
          onScroll={sync}
          onKeyUp={sync}
          onSelect={sync}
          onFocus={(e) => { setFocus(true); const el = e.currentTarget; el.setSelectionRange(el.value.length, el.value.length); el.scrollLeft = el.scrollWidth; sync(); }}
          onBlur={() => setFocus(false)}
          onKeyDown={p.onKeyDown}
        />
      </div>
      {p.suffix != null && <span className="ext">{p.suffix}</span>}
    </div>
  );
}
