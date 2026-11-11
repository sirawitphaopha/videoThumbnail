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
import { keepNodes, thaiKeep } from "./ui";

/** ตัวขยายตัวย่อ · หนึ่งตัวต่อหนึ่งการ์ดหรือหนึ่งกล่อง ขยายครั้งแรกที่เจอ คำที่ขยายแล้วไม่ขยายซ้ำ (มอคอัป expander) */
export function abbrer() {
  const seen = new Set<string>();
  return (raw?: string | null): ReactNode => {
    if (!raw) return null;
    // ตัดบรรทัดได้เฉพาะตรงเว้นวรรค คำไทยไม่ขาดกลางคำ (พี่กันทัก 11 พ.ย. 2569 "เเบ่งบรรทัดอะไรของเธอ")
    // เว้นวรรคสองช่องในข้อความ = รอยต่อประโยค (แทนจุดคั่น · ที่ห้ามใช้บนจอ) · แต่ละประโยคเป็นก้อน ไม่พอที่ย้ายลงบรรทัดใหม่ทั้งก้อน
    // ประโยคสั้นยังต่อกันในบรรทัดเดียว ไม่กินที่ (พี่กันทัก "รวมทุกช่อง เเบ่งลงมาทำไม" · ก่อนหน้านี้ตีตกการแยกทุกประโยคเป็นบรรทัด)
    let k = 0;
    // แตกเป็นคำตามเว้นวรรค แล้วรวมคำที่ต้องอยู่ด้วยกันเป็นก้อน (span.phr ไม่ตัดกลางก้อน)
    // · เว้นวรรคหน้า ๆ ไม่ใช่จุดตัด "เรื่อย ๆ" อยู่ด้วยกัน
    // · ตัวเลขติดกับคำข้างหน้าและข้างหลัง "เสียง 5.1" "ราว 256" "512 kbps"
    // · คำแรกของคำเต็มในวงเล็บติดกับตัวย่อ "dB (decibel)" ส่วนคำที่เหลือในวงเล็บไหลต่อตามปกติ
    // (พี่กันทัก 11 พ.ย. 2569 "เเบ่งบรรทัดอะไรของเธอ" "แบ่งเหี้ยไรเนี่ย" · CLAUDE.md ตัดบรรทัดตามความหมาย)
    type Tok = { w: string; ab?: boolean; bind?: boolean };
    const isNum = (w: string) => /^[−+≈-]?\d/.test(w);
    // หน่วยหลังตัวเลข · คำอื่นหลังตัวเลขตัดบรรทัดได้ ไม่งั้นต่อกันยาวเป็นก้อนเดียว
    const UNIT = /^(kbps|kHz|Hz|ms|dB|LUFS|KB|MB|GB|%|ช่อง|บิต|วินาที|นาที|fps|เท่า|ระดับ)[),]?$/;
    const toks = (t: string, ab = false): Tok[] => t.split(/(?<!ๆ) +(?!ๆ)/).filter(Boolean).map((w) => ({ w, ab }));
    const render = (list: Tok[]): ReactNode[] => {
      const groups: Tok[][] = [];
      for (const t of list) {
        const g = groups[groups.length - 1];
        const prev = g?.[g.length - 1];
        if (g && (t.bind || isNum(t.w) || (prev && isNum(prev.w) && UNIT.test(t.w)))) g.push(t);
        else groups.push([t]);
      }
      return groups.flatMap((g, i) => {
        const inner = g.flatMap((t, j) => [j ? " " : "", t.ab ? <span key={k++} className="ab">{t.w}</span> : t.w]);
        // ล็อกเฉพาะก้อนที่มีหลายคำ (ตัวเลขกับหน่วย "พอ ๆ กัน" ตัวย่อกับวงเล็บ) คำเดี่ยวตัดที่ขอบคำไทยได้ตามปกติ
        const keep = g.length > 1 || g[0].w.includes(" ");
        // ล็อกแค่คำที่ติดตัวเลขหรือไม้ยมก ไม่ล็อกทั้งวลีไทย · ก้อนที่มีวงเล็บคำเต็มล็อกทั้งก้อน (สั้น)
        // คำที่ไม่มีตัวไทย (ตัวอังกฤษ ตัวเลข) เป็นกล่อง ไม่ถูกถ่างตอนกระจายแบบไทย
        const node = !keep ? (/[฀-๿]/.test(g[0].w) && !g[0].ab ? <span key={k++} className="phr">{thaiKeep(g[0].w, () => k++)}</span> : <span key={k++} className={/[฀-๿]/.test(g[0].w) ? "phr" : "phr keep"}>{inner}</span>)
          : g.some((t) => t.ab) ? <span key={k++} className="phr keep">{inner}</span>
          : <span key={k++} className="phr">{keepNodes(g.map((t) => t.w).join(" "), () => k++)}</span>;
        return i ? [" ", node] : [node];
      });
    };
    const clause = (s: string, wrap: boolean): ReactNode => {
      const list: Tok[] = [];
      let last = 0;
      for (const m of s.matchAll(ABBR_RE)) {
        const a = m[1];
        if (seen.has(a)) continue;
        seen.add(a);
        const end = (m.index ?? 0) + a.length;
        list.push(...toks(s.slice(last, end)));
        const ex = toks(`(${ABBR[a]})`, true);
        // ตัดบรรทัดระหว่างตัวย่อกับวงเล็บได้ ผูกไว้แล้วก้อนใหญ่ย้ายลงทั้งก้อน บรรทัดบนเหลือช่อง กระจายแล้วถ่าง (พี่กันส่งภาพกล่อง TAK 11 พ.ย. 2569)
        list.push(...ex);
        last = end;
      }
      list.push(...toks(s.slice(last)));
      const out = render(list);
      // ประโยคเดียวไม่ห่อเป็นก้อน หน้าตาเหมือนเดิม
      return wrap ? <span key={k++} className="clause">{out}</span> : <span key={k++}>{out}</span>;
    };
    return raw.split("\n").flatMap((line, i): ReactNode[] => {
      const cs = line.split(/ {2,}/);
      return [...(i ? [<br key={k++} />] : []), ...cs.flatMap((c, j): ReactNode[] => (j ? [" ", clause(c, cs.length > 1)] : [clause(c, cs.length > 1)]))];
    });
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
