// แผงเลือกสีใช้ร่วม แยกจากหน้าครอป (สีขอบเอง) ไปใช้กับสีกำหนดเองของหน้ากราฟเสียงด้วย (BUGS ข้อ 41 พี่กัน "เราก็ทำระบบสีแบบกำหนดเองไว้เลเล้วนี่นะ ที่ตอนครอปรูป")
import { useEffect, useRef, useState } from "react";
import { useEscClose } from "../lib/popup";
import { IbTick, IcCopy } from "./icons";

/** แป้นไทยกดแป้นเลขแล้วได้ตัวอักษรไทย ช่องเลขทิ้งหมดจนเหมือนพิมพ์ไม่ได้ · ดูจากตำแหน่งแป้นแทน ใส่เลขให้ */
export function digitKey(e: React.KeyboardEvent<HTMLInputElement>, apply: (text: string) => void, max = 3, hexLetters = false) {
  const m = (hexLetters ? /^(?:Digit|Numpad|Key)([\dA-F])$/ : /^(?:Digit|Numpad)(\d)$/).exec(e.code);
  if (!m || /^[\da-fA-F]$/.test(e.key) && hexLetters || /\d/.test(e.key) || e.ctrlKey || e.altKey || e.shiftKey) return;
  e.preventDefault();
  const el = e.currentTarget, from = el.selectionStart ?? el.value.length, to = el.selectionEnd ?? from;
  apply((el.value.slice(0, from) + m[1] + el.value.slice(to)).slice(0, max));
}

export const toHex = (v: number[]) => "#" + v.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
export const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
/** ฮิว 0 ถึง 360 · อิ่มตัวกับความสว่าง 0 ถึง 1 */
export function hslRgb(h: number, s: number, l: number) {
  const f = (n: number) => { const k = (n + h / 30) % 12; return 255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
export function rgbHsl([r, g, b]: number[]) {
  const R = r / 255, G = g / 255, B = b / 255, mx = Math.max(R, G, B), mn = Math.min(R, G, B), d = mx - mn, l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const h = d === 0 ? 0 : mx === R ? ((G - B) / d + 6) % 6 * 60 : mx === G ? ((B - R) / d + 2) * 60 : ((R - G) / d + 4) * 60;
  return { h, s, l };
}
/** รังผึ้งสี กลางขาว ขอบเข้ม เรียง 13 แถว · แถวสีเทาใต้รังผึ้ง */
const HONEY = (() => {
  const rows: string[][] = [];
  for (let r = -6; r <= 6; r++) {
    const n = 13 - Math.abs(r), row: string[] = [];
    for (let i = 0; i < n; i++) {
      const x = i - (n - 1) / 2, y = r * 0.87, d = Math.min(1, Math.hypot(x, y) / 6.2);
      row.push(toHex(hslRgb(((Math.atan2(y, x) * 180) / Math.PI + 390) % 360, 1, 1 - d * 0.62)));
    }
    rows.push(row);
  }
  return rows;
})();
const GRAYS = Array.from({ length: 11 }, (_, i) => toHex(Array(3).fill(255 - i * 25.5)));

/** ปุ่มเลือกสีขอบเอง กางแผงเลือกสี · เลือกแล้วตัวอย่างเปลี่ยนทันที · ยกเลิกกับ Esc คืนสีเดิม
    กางลงใต้แถวสีขอบ กว้างเท่าฝั่งซ้าย ทับปุ่มหมุนกับตาราง ไม่บังรูป (พี่กันห้าม) · ความสูงกำหนดให้พอดีกรอบหน้าต่างครอป ไม่ใช้ตัววัดขอบจอ เพราะขอบที่ห้ามเกินคือกรอบหน้าต่าง กรอบต้องไม่มีแถบเลื่อน */
export function PadCustom(p: { pad: string; onPad: (c: string) => void; custom: boolean; short: boolean; what?: string; trigger?: (open: boolean, toggle: () => void) => React.ReactNode; panelStyle?: React.CSSProperties }) {
  const { short } = p, what = p.what ?? "สีขอบ";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"std" | "own">("own");
  const [old, setOld] = useState(p.pad);
  // เก็บฮิวไว้เอง สีขาวดำไม่มีฮิว ลากความสว่างลงสุดแล้วกลับขึ้นสีเดิมต้องไม่หาย
  const [hsl, setHsl] = useState(() => rgbHsl(hexRgb(p.pad)));
  const [hexText, setHexText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null), panel = useRef<HTMLDivElement>(null);
  const cancel = () => { p.onPad(old); setOpen(false); };
  const toggle = () => { if (open) { setOpen(false); return; } setOld(p.pad); setHsl(rgbHsl(hexRgb(p.pad))); setHexText(null); setOpen(true); };
  useEscClose(open, cancel);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", out);
    return () => document.removeEventListener("pointerdown", out);
  }, [open]);
  const rgb = hexRgb(p.pad);
  const setHslAll = (n: { h: number; s: number; l: number }) => { setHsl(n); setHexText(null); p.onPad(toHex(hslRgb(n.h, n.s, n.l))); };
  const setRgbAll = (v: number[]) => { setHsl(rgbHsl(v)); setHexText(null); p.onPad(toHex(v)); };
  const setCh = (i: number, n: number) => setRgbAll(rgb.map((x, j) => (j === i ? Math.min(255, Math.max(0, n)) : x)));
  const typeHex = (t: string) => { const c = t.replace(/[^\da-fA-F]/g, "").slice(0, 6); setHexText("#" + c); if (c.length === 6) { const v = hexRgb("#" + c); setHsl(rgbHsl(v)); p.onPad(toHex(v)); } };
  const drag = (fn: (x: number, y: number) => void) => (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, go = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); };
    go(e);
    if (e.buttons !== 1) return;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => go(ev);
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  return (
    <span ref={wrap} style={{ display: "inline-flex", ...(p.trigger ? { position: "relative" } : {}) }} data-colorpick={p.trigger ? "" : undefined}>
      {p.trigger ? p.trigger(open, toggle) : <button type="button" className={"btn btn-ghost btn-sm" + (p.custom ? " pressed" : "")} aria-expanded={open} data-pad-custom onClick={toggle}>
        {p.custom && <span className="padchip" style={{ background: p.pad }} />}เลือกเอง
      </button>}
      {open && (
        <div ref={panel} className={"padrgb pop-in" + (short ? " short" : "")} style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", ...p.panelStyle }} data-pad-rgb>
          <div className="padbody">
            <div style={{ minWidth: 0 }}>
              <div className="padtabs">
                <button type="button" className={tab === "std" ? "on" : ""} onClick={() => setTab("std")} data-pad-tab="std">มาตรฐาน</button>
                <button type="button" className={tab === "own" ? "on" : ""} onClick={() => setTab("own")} data-pad-tab="own">กำหนดเอง</button>
              </div>
              <div className="padarea">
                {tab === "std" ? (
                  <div className="honey">
                    {HONEY.map((row, i) => <div key={i} className="honeyrow">{row.map((c) => <button type="button" key={c + i} className={p.pad === c ? "on" : ""} style={{ background: c }} aria-label={"สี " + c} onClick={() => setRgbAll(hexRgb(c))} />)}</div>)}
                    <div className="honeyrow gray">{GRAYS.map((c) => <button type="button" key={c} className={p.pad === c ? "on" : ""} style={{ background: c }} aria-label={"สี " + c} onClick={() => setRgbAll(hexRgb(c))} />)}</div>
                  </div>
                ) : (
                  <div className="padmix">
                    <div className="padbox" onPointerDown={drag((x, y) => setHslAll({ ...hsl, h: x * 360, s: 1 - y, l: hsl.l === 0 || hsl.l === 1 ? 0.5 : hsl.l }))} data-pad-box>
                      <span className="padmark" style={{ left: (hsl.h / 360) * 100 + "%", top: (1 - hsl.s) * 100 + "%" }} />
                    </div>
                    <div className="padlight" style={{ background: `linear-gradient(to bottom, white, ${toHex(hslRgb(hsl.h, hsl.s, 0.5))}, black)` }} onPointerDown={drag((_x, y) => setHslAll({ ...hsl, l: 1 - y }))} data-pad-light>
                      <span className="padarrow" style={{ top: (1 - hsl.l) * 100 + "%" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="padside">
              <div className="padfields">
                {["แดง", "เขียว", "น้ำเงิน"].map((ch, i) => (
                  <label key={ch}><span>{ch}</span>
                    <input value={rgb[i]} inputMode="numeric" maxLength={3} aria-label={what + " " + ch + " พิมพ์เลข 0 ถึง 255"} data-pad-ch={i}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => digitKey(e, (t) => setCh(i, Number(t) || 0))}
                      onChange={(e) => setCh(i, Number(e.target.value.replace(/\D/g, "")) || 0)} />
                  </label>
                ))}
                <label><span>Hex</span>
                  <input className="hex" value={hexText ?? p.pad.toUpperCase()} maxLength={7} aria-label={what + " รหัส Hex"} data-select-all data-pad-hex
                    onFocus={(e) => e.currentTarget.select()} onBlur={() => setHexText(null)}
                    onKeyDown={(e) => digitKey(e, typeHex, 7, true)}
                    onChange={(e) => typeHex(e.target.value)} />
                  <button type="button" className="padcopy" aria-label={copied ? "คัดลอกรหัสสีแล้ว" : "คัดลอกรหัสสี"} title={copied ? "คัดลอกแล้ว" : "คัดลอก"} data-pad-copy
                    onClick={(e) => { e.preventDefault(); navigator.clipboard?.writeText(p.pad.toUpperCase()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
                    {copied ? <IbTick size={14} /> : <IcCopy size={14} />}
                  </button>
                </label>
              </div>
              <div className="padfoot">
                <div className="padcmp"><span><i style={{ background: p.pad }} data-pad-new />สีใหม่</span><span><i style={{ background: old }} />สีเดิม</span></div>
                <div className="padbtns">
                  <button type="button" className="btn btn-main btn-sm" onClick={() => setOpen(false)} data-pad-ok>ตกลง</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancel} data-pad-cancel>ยกเลิก</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

