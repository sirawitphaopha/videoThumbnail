/* ช่องเลือกภาษาของแทร็ก (หน้าเสียงและซับ · มอคอัป langDemo)
   แบบ MKVToolNix กลุ่มใช้บ่อย (ไทย อังกฤษ) อยู่บนสุดเสมอ ตามด้วยไม่ระบุภาษา แล้วทุกภาษาเรียงตามชื่ออังกฤษ
   พี่กัน *"ใน mkvtool มันมีให้เลือกเยอะเลยนะ แต่ให้สองตัวใช้บ่อยคือ ไทย อังกิด"*
   ✓ พิมพ์ค้นได้ทั้งชื่อไทย ชื่ออังกฤษ รหัส · ลืมสลับแป้นพิมพ์ก็หาเจอ (ตัวค้นเดียวกับชั้นวาง)
   ✓ วัดที่ว่างก่อนกางด้วยตัววัดกลาง ล่างไม่พอพลิกขึ้น (popup-fit) · ลูกศรขึ้นลง Enter เลือก Esc ปิด กดข้างนอกปิด */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dropStyle, useDropPlacement } from "../lib/popupFit";
import { useClickOutside, useEscClose } from "../lib/popup";
import { searchByName } from "../lib/thaiSearch";
import { LANG_ALL, LANG_OFTEN, LANG_UND, langCode, langName, type Lang } from "../lib/langs";
import { IcChevronDown, IcSearch } from "./icons";

type Row = { group: string; lang: Lang };

export default function LangPicker(p: { value: string; onChange: (code: string) => void; label: string; width?: number; disabled?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const place = useDropPlacement(open, wrap, panel);
  const close = useCallback(() => { setOpen(false); setQ(""); btn.current?.focus(); }, []);
  useEscClose(open, close);
  useClickOutside(open, wrap, () => { setOpen(false); setQ(""); });

  const rows: Row[] = useMemo(() => {
    const all: Row[] = [
      ...LANG_OFTEN.map((lang) => ({ group: "ใช้บ่อย", lang })),
      { group: "ไม่ระบุ", lang: LANG_UND },
      ...LANG_ALL.map((lang) => ({ group: "ทุกภาษา เรียงตามชื่ออังกฤษแบบ MKVToolNix", lang })),
    ];
    if (!q.trim()) return all;
    return searchByName(all, q, (r) => `${r.lang[0]} ${r.lang[1]} ${r.lang[2]} ${r.lang[3]}`).items;
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const i = rows.findIndex((r) => r.lang[2] === p.value);
    setHi(q.trim() ? 0 : Math.max(0, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  const pick = (code: string) => { p.onChange(code); close(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    if (e.key === "Enter") { e.preventDefault(); const r = rows[hi]; if (r) pick(r.lang[2]); }
    if (e.key === "Tab") { setOpen(false); setQ(""); }
  };

  let lastGroup = "";
  return (
    <div ref={wrap} style={{ position: "relative", minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" className={"dd" + (p.disabled ? " btn-wait" : "")} aria-haspopup="listbox" aria-expanded={open} aria-label={`${p.label}: ${langName(p.value)}`}
        aria-disabled={p.disabled ? true : undefined} title={p.disabled}
        style={{ width: p.width ?? "100%" }} onClick={() => { if (!p.disabled) setOpen((o) => !o); }}
        onKeyDown={(e) => { if (!open && !p.disabled && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); setOpen(true); } }} data-lang-btn>
        <span style={{ whiteSpace: "nowrap", minWidth: 0 }}>{langName(p.value)}</span>
        <IcChevronDown />
      </button>
      {open && (
        <div ref={panel} className="lpop pop-in" role="dialog" aria-label={p.label}
          style={{ position: "absolute", left: 0, zIndex: "var(--z-menu)" as unknown as number, ...dropStyle(place) }} data-lang-pop>
          <div className="lsearch"><IcSearch size={14} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="ค้นชื่อไทย ชื่ออังกฤษ หรือรหัส" aria-label="ค้นภาษา" />
          </div>
          <div className="llist" role="listbox" aria-label="ภาษา" style={{ maxHeight: Math.max(100, place.max - 46) }}>
            {rows.length === 0 && <div className="lnone">ไม่เจอภาษานี้ ลองพิมพ์ชื่ออังกฤษหรือรหัส 3 ตัว</div>}
            {rows.map((r, i) => {
              const head = r.group !== lastGroup ? <div className="lgrp" key={"g" + i}>{r.group}</div> : null;
              lastGroup = r.group;
              const on = r.lang[2] === p.value;
              return [head,
                <div key={r.group + r.lang[2]} data-i={i} role="option" aria-selected={on} className={"lrow" + (on ? " on" : "") + (i === hi ? " hi" : "")}
                  onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.lang[2])}>
                  <span>{r.lang[0] || r.lang[1]}</span>
                  <span className="en">{r.lang[0] ? r.lang[1] : ""}</span>
                  <span className="cd">{langCode(r.lang)}</span>
                  {on ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : <span />}
                </div>];
            })}
          </div>
        </div>
      )}
    </div>
  );
}
