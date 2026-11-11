/* ดรอปดาวน์ที่ทำเอง ใช้แทนช่องเลือกของระบบทุกที่ที่มีข้อความไทย (form-input 6.12 ⑧)
   ✓ วัดที่ว่างก่อนกางด้วยตัววัดกลาง ล่างไม่พอพลิกขึ้น (popup-fit)
   ✓ ลูกศรขึ้นลงเลื่อน Enter เลือก Esc ปิด กดข้างนอกปิด (เมนูเลือกค่า ไม่มีงานค้าง)
   ✓ ตัวหนังสือในปุ่มไม่มีอะไรตัด ตัดที่ขอบปุ่มที่เดียว หัว ไ ใ โ ไม่โดนเฉือน
   ✓ ปุ่มกว้างเท่าตัวเลือกที่ยาวที่สุด ไม่หดกระตุกตอนเปลี่ยนค่า */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose } from "../lib/popup";
import { IcChevronDown, IcSearch } from "./icons";

/** group หัวกลุ่มใหญ่ · sub หัวย่อยในกลุ่ม · ตัวเลือกเรียงตามกลุ่มมาแล้ว หัวขึ้นตอนกลุ่มเปลี่ยน */
export type DdOption<T extends string> = { value: T; label: string; group?: string; sub?: string };

export default function Dropdown<T extends string>(p: {
  options: DdOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** ข้อความบนปุ่ม · ไม่ส่ง = ใช้ป้ายของตัวเลือกที่เลือกอยู่ */
  display?: (opt: DdOption<T> | undefined) => string;
  /** ปุ่มยืดเต็มช่องไหม · ไม่ยืด = กว้างเท่าตัวเลือกที่ยาวที่สุด */
  stretch?: boolean;
  /** ช่องพิมพ์ค้นบนสุดของรายการ ค้นทั้งป้าย หัวกลุ่ม หัวย่อย (BUGS ข้อ 27 พี่กัน "ดีเลยย เอา") */
  search?: boolean;
  /** รายการลอยบนสุดของหน้า ไม่โดนกรอบที่เลื่อนได้ตัด (ใช้ในแถวของรายการที่เลื่อนในกรอบ เช่นคิวแปลงเสียง) */
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const [qy, setQy] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // โฟกัสช่องค้นโดยไม่ให้หน้าเลื่อน (autoFocus ทำให้หน้าเลื่อนนิดหนึ่ง ตัวปิดเมนูตอนหน้าเลื่อนเลยปิดเมนูทันที เจอตอนตรวจ)
  useEffect(() => { if (!open || !p.search) return; const id = requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true })); return () => cancelAnimationFrame(id); }, [open, p.search]);
  const words = qy.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = words.length ? p.options.filter((o) => { const t = `${o.label} ${o.group ?? ""} ${o.sub ?? ""}`.toLowerCase(); return words.every((w) => t.includes(w)); }) : p.options;
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  useEscClose(open, close);
  useClickOutside(open && !p.portal, wrap, () => setOpen(false));
  // ลอยบนสุดของหน้า กดนอกปุ่มและนอกรายการปิด · หน้าเลื่อนปิด (ตำแหน่งยึดกับจอ)
  const [fixedPos, setFixedPos] = useState<{ left: number; right: number; top: number; bottom: number; width: number } | null>(null);
  useEffect(() => {
    if (!open || !p.portal) return;
    // กว้างถึงขอบขวาของกลุ่มที่ปุ่มอยู่ (เช่นถึงปุ่มตั้งค่าข้างดรอปดาวน์ในแถวคิว · พี่กันสั่ง "ขยายให้ยาวถึงปุ่มตั้ค่าได้")
    const r = wrap.current?.getBoundingClientRect(), pr = wrap.current?.parentElement?.getBoundingClientRect(); if (r) { const right = Math.max(r.right, pr?.right ?? r.right); setFixedPos({ left: r.left, right, top: r.top, bottom: r.bottom, width: right - r.left }); }
    const down = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    const scroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", down); window.addEventListener("scroll", scroll, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("scroll", scroll, true); };
  }, [open, p.portal]);

  const cur = p.options.find((o) => o.value === p.value);
  const text = p.display ? p.display(cur) : cur?.label ?? "";
  const shown = p.display ? p.options.map((o) => p.display!(o)) : p.options.map((o) => o.label);

  useEffect(() => {
    if (open) { setQy(""); setHi(Math.max(0, p.options.findIndex((o) => o.value === p.value))); }
  }, [open, p.options, p.value]);
  useEffect(() => { if (open && words.length) setHi(list.length ? 0 : -1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [qy]);

  useEffect(() => {
    if (!open || hi < 0) return;
    panel.current?.querySelectorAll<HTMLElement>("[role=option]")[hi]?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (v: T) => { p.onChange(v); close(); };

  const onKey = (e: React.KeyboardEvent) => {
    const n = list.length;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault(); setOpen(true); return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % n); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h <= 0 ? n - 1 : h - 1)); }
    if (e.key === "Enter" || (e.key === " " && !p.search)) { e.preventDefault(); if (hi >= 0 && list[hi]) pick(list[hi].value); }
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
          // ตัดที่ขอบปุ่มที่เดียว ตัวหนังสือห้ามตัดเอง ไม่งั้นหัว ไ ใ โ ที่ยื่นซ้ายโดนเฉือน (สกิล form-input ⑧ · พี่กันทัก 11 พ.ย. 2569 "หัว ไ ขาด")
          <span style={{ whiteSpace: "nowrap", minWidth: 0, flex: "1 1 auto" }}>{text}</span>
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
      {open && (() => { const menu = (
        <div
          ref={panel}
          className="menu pop-in"
          role="listbox"
          aria-label={p.label}
          style={p.portal && fixedPos
            ? { position: "fixed", left: fixedPos.left, minWidth: fixedPos.width, maxWidth: window.innerWidth - fixedPos.left - 8, zIndex: "var(--z-menu)" as unknown as number, maxHeight: place.max, ...(place.up ? { bottom: window.innerHeight - fixedPos.top + 6 } : { top: fixedPos.bottom + 6 }) }
            : { position: "absolute", right: 0, minWidth: "100%", zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }}
        >
          {p.search && (
            <div className="ddsearch" onMouseDown={(e) => e.stopPropagation()}>
              <IcSearch size={14} />
              <input ref={searchRef} value={qy} onChange={(e) => setQy(e.target.value)} onKeyDown={onKey} placeholder="พิมพ์ค้น เช่น alac 5.1 320" aria-label={"ค้นใน" + p.label} data-ddsearch />
            </div>
          )}
          {p.search && !list.length && <div className="ddempty">ไม่เจอตัวเลือกที่ตรงกับ “{qy}”</div>}
          {list.map((o, i) => (<div key={o.value} style={{ display: "contents" }}>
            {o.group && o.group !== list[i - 1]?.group && <div className="ddgroup" role="presentation">{o.group}</div>}
            {o.sub && (o.sub !== list[i - 1]?.sub || o.group !== list[i - 1]?.group) && <div className="ddsub" role="presentation">{o.sub}</div>}
            <div
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
          </div>))}
        </div>); return p.portal ? createPortal(menu, document.body) : menu; })()}
    </div>
  );
}
