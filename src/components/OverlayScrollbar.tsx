import { useEffect } from "react";

/**
 * แถบเลื่อนลอยที่วาดเอง ใช้ทั้งโปรแกรม (สกิล web-craft 6.23)
 * ยกจาก warfarin-dash components/ui/OverlayScrollbar.tsx ทั้งชุด รวมจุดที่แก้แล้วทุกจุด
 * แถบเลื่อนของระบบซ่อนไว้ใน styles/app.css · ตัวนี้ตัวเดียวคุมทุกกล่องที่เลื่อนได้ หน้าใหม่ไม่ต้องทำอะไรเพิ่ม
 * จังหวะ เลื่อนแล้วโผล่ 0.6 วินาที · หยุด 0.4 วินาทีแล้วเริ่มจาง · จางหมดใน 1.3 วินาที · ชี้หรือลากอยู่ ค้างไว้
 * 🔴 แถบแนวนอนไม่จางเอง เพราะล้อเมาส์เลื่อนแนวนอนไม่ได้ ต้องลากแถบอย่างเดียว
 * 🔴 กล่องพ้นจอหรือลอดใต้แถบชื่อ ต้องซ่อน ห้ามบีบตำแหน่งกลับเข้ามา
 * 🔴 ระหว่างจาง ยังเอาเมาส์ไปโดนได้ ตัดการรับเมาส์หลังจางหมดจริงเท่านั้น
 */
type Thumb = HTMLDivElement & {
  _el?: HTMLElement;
  _k?: ReturnType<typeof setTimeout>;
  _k2?: ReturnType<typeof setTimeout>;
  _drag?: boolean;
  _hov?: boolean;
};

const NEAR = 16;
const THICK = 7;
const MIN_LEN = 24;
const MIN_LEN_H = 40;

export default function OverlayScrollbar() {
  useEffect(() => {
    const make = (): Thumb => {
      const d = document.createElement("div") as Thumb;
      d.className = "ovthumb";
      d.setAttribute("aria-hidden", "true");
      document.body.appendChild(d);
      return d;
    };
    const vt = make();
    vt.style.width = `${THICK}px`;
    const ht = make();
    ht.style.height = `${THICK}px`;
    ht.classList.add("ovthumb-h");

    const topBand = () =>
      Math.max(
        document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
        ...[...document.querySelectorAll<HTMLElement>("[data-sticky-top]")].map((x) => x.getBoundingClientRect().bottom),
      );

    const scrollableV = (el: HTMLElement | null): HTMLElement | null => {
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 1) {
          const o = getComputedStyle(el).overflowY;
          if (o === "auto" || o === "scroll") return el;
        }
        el = el.parentElement;
      }
      return null;
    };
    const scrollableH = (el: HTMLElement | null): HTMLElement | null => {
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth + 1 && !el.hasAttribute("data-no-ovbar")) {
          const o = getComputedStyle(el).overflowX;
          if (o === "auto" || o === "scroll") return el;
        }
        el = el.parentElement;
      }
      return null;
    };

    /** หัวตารางที่ตรึงอยู่ในกล่อง แถบเลื่อนต้องเริ่มใต้หัวตาราง */
    const stickyHead = (el: HTMLElement) => {
      const th = el.querySelector("thead th");
      if (!th || getComputedStyle(th).position !== "sticky") return 0;
      return Math.round(th.getBoundingClientRect().height);
    };

    const hideNow = (t: Thumb) => {
      if (t._k) clearTimeout(t._k);
      if (t._k2) clearTimeout(t._k2);
      t.style.transition = "none";
      t.style.opacity = "0";
      t.style.pointerEvents = "none";
      t._el = undefined;
    };

    const posV = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const head = stickyHead(el);
      const track = Math.max(MIN_LEN, el.clientHeight - head);
      const len = Math.max(MIN_LEN, (track * el.clientHeight) / el.scrollHeight);
      const run = el.scrollHeight - el.clientHeight;
      const at = run > 0 ? (el.scrollTop / run) * (track - len) : 0;
      const top = r.top + head + at;
      const left = r.right - THICK - 2;
      if (top + len < topBand() || top > window.innerHeight || left < 0 || left > window.innerWidth) { hideNow(vt); return false; }
      vt.style.height = `${len}px`;
      vt.style.top = `${top}px`;
      vt.style.left = `${left}px`;
      vt._el = el;
      return true;
    };

    const posH = (el: HTMLElement): boolean => {
      const o = getComputedStyle(el).overflowX;
      if ((o !== "auto" && o !== "scroll") || el.scrollWidth <= el.clientWidth + 1) { hideNow(ht); return false; }
      const r = el.getBoundingClientRect();
      const bandW = Math.max(40, r.right - r.left);
      const len = Math.max(MIN_LEN_H, (bandW * el.clientWidth) / el.scrollWidth);
      const run = el.scrollWidth - el.clientWidth;
      const at = run > 0 ? (el.scrollLeft / run) * (bandW - len) : 0;
      const left = r.left + at;
      const top = r.bottom - THICK - 2;
      if (left + len < 0 || left > window.innerWidth || top < topBand() || top > window.innerHeight) { hideNow(ht); return false; }
      ht.style.width = `${len}px`;
      ht.style.left = `${left}px`;
      ht.style.top = `${top}px`;
      ht._el = el;
      return true;
    };

    const show = (t: Thumb) => {
      t.style.transition = "opacity .6s ease";
      t.style.opacity = "1";
      t.style.pointerEvents = "auto";
      if (t._k) clearTimeout(t._k);
      if (t._k2) clearTimeout(t._k2);
      if (t === ht) return;
      t._k = setTimeout(() => {
        if (t._drag || t._hov) return;
        t.style.transition = "opacity 1.3s ease";
        t.style.opacity = "0";
        t._k2 = setTimeout(() => {
          if (t._drag || t._hov) return;
          t.style.pointerEvents = "none";
        }, 1350);
      }, 400);
    };

    const onScroll = (e: Event) => {
      const box = e.target as HTMLElement | null;
      if (!box || !(box instanceof HTMLElement) || box.hasAttribute("data-no-ovbar")) return;
      if (box.scrollHeight > box.clientHeight + 1 && posV(box)) show(vt);
      if (box.scrollWidth > box.clientWidth + 1 && posH(box)) show(ht);
      if (ht._el && ht._el !== box && !ht._drag) { if (ht._el.isConnected) posH(ht._el); else hideNow(ht); }
      if (vt._el && vt._el !== box && !vt._drag) { if (vt._el.isConnected) posV(vt._el); else hideNow(vt); }
    };

    const onMove = (e: MouseEvent) => {
      if (vt._drag || ht._drag) return;
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (!under || under === vt || under === ht) return;
      const ev = scrollableV(under);
      if (ev) {
        const r = ev.getBoundingClientRect();
        if (e.clientX >= r.right - NEAR && e.clientX <= r.right + 4 && e.clientY >= r.top && e.clientY <= r.bottom) {
          if (posV(ev)) show(vt);
        }
      }
      const eh = scrollableH(under);
      if (eh) {
        const r = eh.getBoundingClientRect();
        if (e.clientY >= r.bottom - NEAR && e.clientY <= r.bottom + 4 && e.clientX >= r.left && e.clientX <= r.right) {
          if (posH(eh)) show(ht);
        }
      }
    };

    const hoverOn = (t: Thumb) => () => { t._hov = true; t.style.transition = "opacity .6s ease"; t.style.opacity = "1"; t.style.pointerEvents = "auto"; };
    const hoverOff = (t: Thumb) => () => { t._hov = false; show(t); };
    const onVEnter = hoverOn(vt), onVLeave = hoverOff(vt), onHEnter = hoverOn(ht), onHLeave = hoverOff(ht);
    vt.addEventListener("mouseenter", onVEnter);
    vt.addEventListener("mouseleave", onVLeave);
    ht.addEventListener("mouseenter", onHEnter);
    ht.addEventListener("mouseleave", onHLeave);

    const drag = (t: Thumb, axis: "y" | "x") => (e: MouseEvent) => {
      e.preventDefault();
      const el = t._el;
      if (!el) return;
      t._drag = true;
      const start = axis === "y" ? e.clientY : e.clientX;
      const startPos = axis === "y" ? el.scrollTop : el.scrollLeft;
      const len = axis === "y" ? t.offsetHeight : t.offsetWidth;
      const run = axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      const track = (axis === "y" ? el.clientHeight - stickyHead(el) : el.clientWidth) - len;
      const move = (ev: MouseEvent) => {
        if (track <= 0) return;
        const d = ((axis === "y" ? ev.clientY : ev.clientX) - start) / track;
        if (axis === "y") el.scrollTop = startPos + d * run;
        else el.scrollLeft = startPos + d * run;
      };
      const up = () => {
        t._drag = false;
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        show(t);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
    const dragV = drag(vt, "y"), dragH = drag(ht, "x");
    vt.addEventListener("mousedown", dragV);
    ht.addEventListener("mousedown", dragH);

    let queued = 0;
    const follow = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        if (document.querySelector("[role=dialog]")) { hideNow(ht); hideNow(vt); return; }
        for (const t of [vt, ht]) {
          if (t._drag) continue;
          if (!t._el || !t._el.isConnected) { hideNow(t); continue; }
          if (t === vt) posV(t._el); else posH(t._el);
        }
      });
    };
    const gone = new MutationObserver(() => {
      for (const t of [vt, ht]) if (t._el && !t._el.isConnected) hideNow(t);
      follow();
    });
    gone.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", follow);
    const bodyRo = new ResizeObserver(follow);
    bodyRo.observe(document.body);
    const navEl = document.querySelector("[data-navbar]");
    const navRo = navEl ? new ResizeObserver(follow) : null;
    if (navEl && navRo) navRo.observe(navEl);

    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousemove", onMove);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", follow);
      bodyRo.disconnect();
      navRo?.disconnect();
      gone.disconnect();
      if (queued) cancelAnimationFrame(queued);
      vt.removeEventListener("mouseenter", onVEnter);
      vt.removeEventListener("mouseleave", onVLeave);
      ht.removeEventListener("mouseenter", onHEnter);
      ht.removeEventListener("mouseleave", onHLeave);
      vt.removeEventListener("mousedown", dragV);
      ht.removeEventListener("mousedown", dragH);
      for (const t of [vt, ht]) { if (t._k) clearTimeout(t._k); if (t._k2) clearTimeout(t._k2); t.remove(); }
    };
  }, []);

  return null;
}
