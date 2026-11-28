/* เมนูคลิกขวากลางของทั้งโปรแกรม (BUGS ข้อ 163.7 ทำครั้งแรกที่ชั้นวาง · ข้อ 164.5 ย้ายมาเป็นตัวกลาง ใช้ทุกจุดที่คลิกขวาได้)
   รายการข้อของแต่ละเมนูอยู่ทะเบียน lib/ctxMenus.ts ข้อที่ซ่อนในหน้าตั้งค่าไม่ขึ้นเอง
   ข้อที่ทำไม่ได้จางเป็นสีปุ่มที่กดไม่ได้ ชี้แล้วบอกเหตุผล · ข้อที่มีเมนูย่อยกดแล้วกางข้อย่อยใต้ข้อนั้น
   วัดขนาดก่อนขึ้นจอ ชิดขอบกางกลับทาง (สกิล popup-fit) · Esc ปิดชั้นบนสุด กดข้างนอกหรือย่อขยายหน้าต่างปิด · ลูกศรขึ้นลง Home End เลื่อนข้อ */
import { Fragment, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useClickOutside, useEscClose } from "../lib/popup";
import { isShown, useCtxHidden } from "../lib/ctxMenus";

export type CtxItem = {
  id: string; label: string; icon?: ReactNode;
  /** เหตุผลที่กดไม่ได้ · null หรือไม่ส่ง = กดได้ */
  why?: string | null;
  run?: () => void;
  /** ข้อย่อย กดข้อนี้แล้วกาง */
  sub?: CtxItem[];
  /** แถวให้ดาวห้าดวง */
  stars?: { value: number; onRate: (n: number) => void };
};

const STAR = "M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4l-5.6 3 1.1-6.3L3 9.7l6.2-.9z";

export default function CtxMenu({ menu, title, x, y, groups, onClose, attrs }: { menu: string; title: string; x: number; y: number; groups: CtxItem[][]; onClose: () => void; attrs?: Record<string, string> }) {
  useCtxHidden();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEscClose(true, onClose);
  useClickOutside(true, ref, onClose);
  const shown = groups.map((g) => g.filter((it) => isShown(menu, it.id))).filter((g) => g.length);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, W = window.innerWidth, H = window.innerHeight, pad = 8;
    const left = x + w + pad > W ? Math.max(pad, x - w) : x;
    const top = y + h + pad > H ? Math.max(pad, Math.min(y - h, H - h - pad)) : y;
    setPos({ left, top });
  }, [x, y, open]);
  // โฟกัสข้อแรกที่กดได้หลังเมนูขึ้นจอแล้ว (ตอนวัดขนาดเมนูยังซ่อนอยู่ โฟกัสไม่ได้)
  const focused = useRef(false);
  useLayoutEffect(() => { if (pos && !focused.current) { focused.current = true; ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not([aria-disabled=true])")?.focus(); } }, [pos]);
  useLayoutEffect(() => {
    const close = () => onClose();
    window.addEventListener("resize", close); window.addEventListener("blur", close);
    return () => { window.removeEventListener("resize", close); window.removeEventListener("blur", close); };
  }, [onClose]);
  const keys = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const all = [...(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const j = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length;
    all[j]?.focus();
  };
  const btn = (it: CtxItem, sub = false): ReactNode => {
    if (it.stars) {
      const v = it.stars.value, rate = it.stars.onRate;
      return (
        <div key={it.id} className="mm-stars" role="group" aria-label={`${it.label} ตอนนี้ ${v} ดาว`} data-mmstars={v}>
          <span className="mm-lbl">{it.label}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="menuitem" className={"star" + (n <= v ? " on" : "")} aria-label={v === n ? `ล้างคะแนน ${n} ดาว` : `ให้ ${n} ดาว`}
              title={v === n ? "กดอีกครั้งเพื่อล้างคะแนน" : `ให้ ${n} ดาว`} onClick={() => { onClose(); rate(v === n ? 0 : n); }} data-mmstar={n}>
              <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d={STAR} /></svg>
            </button>
          ))}
        </div>
      );
    }
    const hasSub = !!it.sub?.length;
    const isOpen = open === it.id;
    return (
      <Fragment key={it.id}>
        <button type="button" role="menuitem" className={"mm-item" + (it.why ? " off" : "") + (sub ? " sub" : "")} aria-disabled={it.why ? true : undefined} aria-expanded={hasSub ? isOpen : undefined}
          title={it.why ? `${it.label}ไม่ได้ ${it.why}` : undefined}
          onClick={() => { if (it.why) return; if (hasSub) { setOpen(isOpen ? null : it.id); return; } onClose(); it.run?.(); }} data-mm={it.id}>
          <span className="mm-ic">{it.icon}</span><span className="mm-lbl">{it.label}</span>
          {hasSub && <svg className="mm-more" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={isOpen ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} /></svg>}
        </button>
        {hasSub && isOpen && it.sub!.map((s) => btn(s, true))}
      </Fragment>
    );
  };
  return (
    <div ref={ref} className="mm pop-in" role="menu" aria-label={`เมนูของ ${title}`} onKeyDown={keys} onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos?.left ?? x, top: pos?.top ?? y, visibility: pos ? "visible" : "hidden" }} data-ctxmenu={menu} {...attrs}>
      <div className="mm-head" title={title}>{title}</div>
      {shown.length === 0
        ? <div className="mm-empty small" data-mmempty>ซ่อนทุกข้อของเมนูนี้ไว้ เปิดได้ในหน้าตั้งค่าหัวข้อเมนูคลิกขวา</div>
        : shown.map((g, i) => <Fragment key={i}>{i > 0 && <div className="mm-sep" role="separator" />}{g.map((it) => btn(it))}</Fragment>)}
    </div>
  );
}

/** คัดลอกข้อความ · ตัวตรวจในโหมดพัฒนาเก็บลง __shelfClipOut ไม่แตะคลิปบอร์ดของคนที่ใช้คอม */
export async function copyText(text: string) {
  const w = window as unknown as { __shelfClipOut?: string[] };
  if (import.meta.env.DEV && w.__shelfClipOut) { w.__shelfClipOut.push(text); return; }
  await navigator.clipboard.writeText(text);
}

/** สถานะเมนูที่เปิดอยู่ · open(x, y, ค่าเฉพาะของเมนู) */
export function useCtx<T>() {
  const [at, setAt] = useState<{ x: number; y: number; v: T } | null>(null);
  return { at, open: (e: { clientX: number; clientY: number; preventDefault: () => void }, v: T) => { e.preventDefault(); setAt({ x: e.clientX, y: e.clientY, v }); }, close: () => setAt(null) };
}
