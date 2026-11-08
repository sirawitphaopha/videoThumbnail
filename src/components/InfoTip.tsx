/* ปุ่ม ⓘ กับกล่องคำอธิบาย (มอคอัปแผงตั้งค่าเสียง infoBtn tipHtml placeTip)
   กดเปิด กดซ้ำ กดที่อื่น หรือ Esc ปิด · เปิดได้ทีละกล่อง · Esc ปิดเฉพาะกล่อง ไม่ปิดหน้าต่างที่อยู่ข้างหลัง
   วางตามกฎ popup-fit วัดที่ว่างจริงทุกครั้งก่อนจอติด ① ล่างพอกางลง ② บนพอกางขึ้น ไม่ทับแถบบน
   ③ ไม่พอทั้งคู่ ค่อย ๆ เลื่อนกล่องที่เลื่อนได้ (หน้าต่างแผง) ขึ้นแล้วกางลงเต็ม ④ เลื่อนไม่ได้ เลือกฝั่งที่กว้างกว่า สูงไม่ต่ำกว่า 160 แล้วเลื่อนในกล่อง
   กล่องอยู่ชั้นบนสุดของหน้า (portal) เพราะหน้าต่างแผงตัดของที่ล้นขอบ */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { visibleTop } from "../lib/popupFit";
import { ABBR, ABBR_RE, type Tip } from "../lib/codecAdv";
import { IcClose } from "./icons";

/** ตัวขยายตัวย่อ · หนึ่งตัวต่อหนึ่งการ์ดหรือหนึ่งกล่อง ขยายครั้งแรกที่เจอ คำที่ขยายแล้วไม่ขยายซ้ำ (มอคอัป expander) */
export function abbrer() {
  const seen = new Set<string>();
  return (raw?: string | null): ReactNode => {
    if (!raw) return null;
    // จุดคั่นติดคำข้างหน้า ไม่ขึ้นต้นบรรทัดใหม่ (เคยเจอบรรทัดขึ้นต้นด้วย · ในแผงแบบง่าย แก้แบบเดียวกัน)
    const s = raw.replace(/ · /g, " · ");
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of s.matchAll(ABBR_RE)) {
      const k = m[1];
      if (seen.has(k)) continue;
      seen.add(k);
      const end = (m.index ?? 0) + k.length;
      out.push(s.slice(last, end), <span key={end} className="ab"> ({ABBR[k]})</span>);
      last = end;
    }
    out.push(s.slice(last));
    return out;
  };
}

const INFO = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>;
let closeOpen: (() => void) | null = null;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

export default function InfoTip({ title, tip }: { title: string; tip: Tip }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; max: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const gliding = useRef(false);
  const close = useRef(() => { setOpen(false); setPos(null); }).current;

  const place = (allowScroll: boolean) => {
    const b = btn.current?.getBoundingClientRect(), el = box.current;
    if (!b || !el) return;
    const H = el.scrollHeight, W = el.offsetWidth;
    const top0 = visibleTop() + 8, bot0 = window.innerHeight - 8, gap = 6;
    const below = bot0 - b.bottom - gap, above = b.top - gap - top0;
    let up = false, max = H;
    if (H <= below) up = false;
    else if (H <= above) up = true;
    else {
      const sc = scrollParent(btn.current), need = Math.ceil(H - below);
      if (allowScroll && sc && need <= sc.scrollHeight - sc.clientHeight - sc.scrollTop && b.top - need >= top0) {
        // ค่อย ๆ เลื่อน ห้ามวาร์บ · มีตัวกันเผื่อหน้าต่างอยู่หลังสุดแล้วเฟรมไม่เดิน ให้จบที่ปลายทางเสมอ
        gliding.current = true;
        setPos(null);
        const y0 = sc.scrollTop, t0 = performance.now(), D = 220;
        let fin = false;
        const end = () => { if (fin) return; fin = true; sc.scrollTop = y0 + need; gliding.current = false; place(false); };
        const step = (t: number) => { if (fin) return; const k = Math.min(1, (t - t0) / D); sc.scrollTop = y0 + need * (1 - Math.pow(1 - k, 3)); if (k < 1) requestAnimationFrame(step); else end(); };
        requestAnimationFrame(step);
        setTimeout(end, D + 120);
        return;
      }
      up = above > below;
      max = Math.max(160, up ? above : below);
    }
    const h = Math.min(H, max);
    const left = Math.min(Math.max(b.left - 18, 8), window.innerWidth - W - 8);
    setPos((p) => {
      const n = { top: up ? b.top - gap - h : b.bottom + gap, left, max, up };
      return p && p.top === n.top && p.left === n.left && p.max === n.max ? p : n;
    });
  };

  // วัดหลังวาดแต่ก่อนจอติด
  useLayoutEffect(() => { if (open && !pos && !gliding.current) place(true); });

  useEffect(() => {
    if (!open) return;
    closeOpen = close;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const again = () => { if (!gliding.current) place(false); };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    return () => {
      if (closeOpen === close) closeOpen = null;
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const ex = abbrer();
  return (
    <>
      <button ref={btn} type="button" className="infob" aria-label={`${title} คืออะไร`} title={`${title} คืออะไร`} aria-expanded={open} data-info={title}
        onClick={(e) => { e.stopPropagation(); if (open) { close(); return; } closeOpen?.(); setPos(null); setOpen(true); }}>{INFO}</button>
      {open && createPortal(
        <div ref={box} className="infotip pop-in" role="dialog" aria-label={`คำอธิบาย ${title}`} data-tip={title} data-side={pos?.up ? "บน" : "ล่าง"}
          style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.max } : { top: 0, left: 0, visibility: "hidden" }}>
          <div className="tiph"><b>{ex(title)}</b>
            <button type="button" className="icon-btn" style={{ width: 26, height: 26, flex: "none" }} aria-label="ปิดคำอธิบาย" onClick={close}><IcClose /></button></div>
          <p className="tw">{ex(tip.w)}</p>
          {tip.o?.map(([n, e, p, c]) => (
            <div className="to" key={n}><b>{ex(n)}</b> {ex(e)}
              {p && <div className="tp"><span>ข้อดี</span><div>{ex(p)}</div></div>}
              {c && <div className="tc"><span>ข้อเสีย</span><div>{ex(c)}</div></div>}</div>
          ))}
          {tip.p && <div className="tp top"><span>ข้อดี</span><div>{ex(tip.p)}</div></div>}
          {tip.c && <div className="tc top"><span>ข้อเสีย</span><div>{ex(tip.c)}</div></div>}
          {tip.r && <div className="tr"><span>แนะนำ</span>{ex(tip.r)}</div>}
        </div>, document.body)}
    </>
  );
}
