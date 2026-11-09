/* ดรอปดาวน์ที่ทำเอง ใช้แทนช่องเลือกของระบบทุกที่ที่มีข้อความไทย (form-input 6.12 ⑧)
   ✓ วัดที่ว่างก่อนกางด้วยตัววัดกลาง ล่างไม่พอพลิกขึ้น (popup-fit)
   ✓ ลูกศรขึ้นลงเลื่อน Enter เลือก Esc ปิด กดข้างนอกปิด (เมนูเลือกค่า ไม่มีงานค้าง)
   ✓ ตัวหนังสือในปุ่มไม่มีอะไรตัด ตัดที่ขอบปุ่มที่เดียว หัว ไ ใ โ ไม่โดนเฉือน
   ✓ ปุ่มกว้างเท่าตัวเลือกที่ยาวที่สุด ไม่หดกระตุกตอนเปลี่ยนค่า */
import { useCallback, useEffect, useRef, useState } from "react";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose } from "../lib/popup";
import { IcChevronDown } from "./icons";

export type DdOption<T extends string> = { value: T; label: string };

export default function Dropdown<T extends string>(p: {
  options: DdOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** ข้อความบนปุ่ม · ไม่ส่ง = ใช้ป้ายของตัวเลือกที่เลือกอยู่ */
  display?: (opt: DdOption<T> | undefined) => string;
  /** ปุ่มยืดเต็มช่องไหม · ไม่ยืด = กว้างเท่าตัวเลือกที่ยาวที่สุด */
  stretch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  useEscClose(open, close);
  useClickOutside(open, wrap, () => setOpen(false));

  const cur = p.options.find((o) => o.value === p.value);
  const text = p.display ? p.display(cur) : cur?.label ?? "";
  const shown = p.display ? p.options.map((o) => p.display!(o)) : p.options.map((o) => o.label);

  useEffect(() => {
    if (open) setHi(Math.max(0, p.options.findIndex((o) => o.value === p.value)));
  }, [open, p.options, p.value]);

  useEffect(() => {
    if (!open || hi < 0) return;
    panel.current?.querySelectorAll<HTMLElement>("[role=option]")[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (v: T) => { p.onChange(v); close(); };

  const onKey = (e: React.KeyboardEvent) => {
    const n = p.options.length;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % n); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h <= 0 ? n - 1 : h - 1)); }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (hi >= 0) pick(p.options[hi].value); }
    if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrap} style={{ position: "relative", flex: p.stretch ? 1 : "none", minWidth: 0 }}>
      <button
        ref={btn}
        type="button"
        className="dd"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${p.label}: ${text}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        style={{ width: p.stretch ? "100%" : undefined }}
      >
        {p.stretch ? (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" }}>{text}</span>
        ) : (
          <span style={{ display: "grid", minWidth: 0 }}>
            {shown.map((s) => (
              <span key={s} aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden", whiteSpace: "nowrap" }}>{s}</span>
            ))}
            <span style={{ gridArea: "1 / 1", whiteSpace: "nowrap", minWidth: 0 }}>{text}</span>
          </span>
        )}
        <IcChevronDown />
      </button>
      {open && (
        <div
          ref={panel}
          className="menu pop-in"
          role="listbox"
          aria-label={p.label}
          style={{ position: "absolute", right: 0, minWidth: "100%", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}
        >
          {p.options.map((o, i) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === p.value}
              className={"opt" + (o.value === p.value ? " on" : "") + (i === hi ? " hi" : "")}
              onMouseEnter={() => setHi(i)}
              onMouseLeave={() => setHi(-1)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.value)}
            >
              <span style={{ whiteSpace: "nowrap" }}>{o.label}</span>
              {o.value === p.value && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
