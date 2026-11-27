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
import { MIN_LEN, MIN_LEN_H, NEAR, THICK, allowBox, makeThumb, scrollableH, scrollableV, stickyBands, topBand, type Thumb } from "./ovbar/ovCalc";

export default function OverlayScrollbar() {
  useEffect(() => {
    const vt = makeThumb();
    vt.style.width = `${THICK}px`;
    const ht = makeThumb();
    ht.style.height = `${THICK}px`;
    ht.classList.add("ovthumb-h");

    const hideNow = (t: Thumb) => {
      if (t._k) clearTimeout(t._k);
      if (t._k2) clearTimeout(t._k2);
      t.style.transition = "none";
      t.style.opacity = "0";
      t.style.pointerEvents = "none";
      t._el = undefined;
    };

    // เฝ้าขนาดของกล่องที่แถบเกาะอยู่ กล่องสูงหรือกว้างขึ้นโดยไม่ได้เลื่อน แถบต้องตามไปที่ขอบใหม่
    // (เจอ 15 พ.ย. 2569 หน้าต่างแปลงซับภาพ สลับมุมมองขนาดจริงเป็นขยาย 2 เท่า กรอบสูง 150 เป็น 210 แถบแนวนอนค้างกลางกรอบทับตัวซับ)
    const elRo = new ResizeObserver(() => follow());
    const watch = (t: Thumb, el: HTMLElement) => {
      if (t._el === el) return;
      const other = t === vt ? ht : vt;
      if (t._el && t._el !== other._el) elRo.unobserve(t._el);
      elRo.observe(el);
    };

    const posV = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      const { top: head, bottom: foot } = stickyBands(el);
      const track = Math.max(MIN_LEN, el.clientHeight - head - foot);
      const len = Math.max(MIN_LEN, (track * el.clientHeight) / el.scrollHeight);
      const run = el.scrollHeight - el.clientHeight;
      const at = run > 0 ? (el.scrollTop / run) * (track - len) : 0;
      const top = r.top + head + at;
      const left = r.right - THICK - 2;
      if (top + len < topBand() || top > window.innerHeight || left < 0 || left > window.innerWidth) { hideNow(vt); return false; }
      vt.style.height = `${len}px`;
      vt.style.top = `${top}px`;
      vt.style.left = `${left}px`;
      watch(vt, el);
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
      watch(ht, el);
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
      if (!box || !(box instanceof HTMLElement) || box.hasAttribute("data-no-ovbar") || !allowBox(box)) return;
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
      if (ev && allowBox(ev)) {
        const r = ev.getBoundingClientRect();
        if (e.clientX >= r.right - NEAR && e.clientX <= r.right + 4 && e.clientY >= r.top && e.clientY <= r.bottom) {
          if (posV(ev)) show(vt);
        }
      }
      const eh = scrollableH(under);
      if (eh && allowBox(eh)) {
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
      const sb = axis === "y" ? stickyBands(el) : { top: 0, bottom: 0 };
      const track = (axis === "y" ? el.clientHeight - sb.top - sb.bottom : el.clientWidth) - len;
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
        // มีหน้าต่างซ้อนอยู่ ซ่อนแถบของกล่องที่อยู่หลังหน้าต่าง ส่วนกล่องในหน้าต่างจัดตำแหน่งตามปกติ
        for (const t of [vt, ht]) {
          if (t._drag) continue;
          if (!t._el || !t._el.isConnected) { hideNow(t); continue; }
          if (!allowBox(t._el)) { hideNow(t); continue; }
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
      elRo.disconnect();
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
