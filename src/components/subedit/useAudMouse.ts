/* เมาส์บนคลื่นเสียง ลากขอบเวลา ดูดติดเส้น เลื่อนทั้งบรรทัด ล้อเมาส์ ลากปรับความสูง และซูมจากแถบเลื่อน
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect } from "react";
import { getTiming, msPerPx, rangeOf, setLeft, setOpt, setPend, type Pend } from "../../lib/subTiming";
import { getVid, vidKeys, vidRate } from "../../lib/vidFrames";
import type { Au1 } from "./audCtx";

export function useAudMouse(hk: Au1) {
  const { bump, cv, d, drag, left, mpp, o, p, right, setCursor, setMouse, src, w } = hk;
  // ---------------------------------------------------------------- เมาส์

  const subAt = (clientX: number) => { const b = cv.current!.getBoundingClientRect(); return left + (clientX - b.left) * mpp - d; };
  /** เส้นที่ขอบดูดติดได้ (เวลาซับ) · keyframe ขอบเฟรมของภาพที่แสดง ขอบของบรรทัดอื่นที่เห็น (SnapMarkers ของ Aegisub) */
  const candidates = (skip: Set<number>) => {
    const c: number[] = [];
    const f = vidRate(), v = getVid();
    if (f) {
      for (const k of v.hideKeys ? [] : vidKeys(v).list) { const t = f.timeAt(k, "start"); if (t >= left - 2000 && t <= right + 2000) c.push(t - d); }
      if (v.pos != null) c.push(f.timeAt(v.pos, "start") - d, f.timeAt(v.pos, "end") - d);
    }
    for (const x of p.doc.events) {
      if (x.comment || skip.has(x.id)) continue;
      if (x.end + d < left - 2000 || x.start + d > right + 2000) continue;
      c.push(x.start, x.end);
    }
    return c;
  };
  const snap = (t: number, cand: number[], on: boolean) => {
    if (!on) return t;
    let best = t, bd = 8 * mpp + 0.001;
    for (const c of cand) { const dd = Math.abs(c - t); if (dd < bd) { bd = dd; best = c; } }
    return Math.round(best);
  };
  const near = (t: number) => {
    if (!p.ev) return null;
    const r = rangeOf(p.ev), sens = 8 * mpp;
    const dl = Math.abs(r.start - t), dr = Math.abs(r.end - t);
    if (dl > sens && dr > sens) return null;
    return dl <= dr ? "start" : "end";
  };

  const apply = (start: number, end: number, links: Pend["links"]) => {
    if (!p.ev) return;
    const a = Math.round(Math.min(start, end)), b = Math.round(Math.max(start, end));
    setPend({ id: p.ev.id, start: a, end: b, links });
  };

  const onDown = (e: React.MouseEvent) => {
    if (!p.ev || !src) return;
    cv.current?.focus({ preventScroll: true });
    const t = subAt(e.clientX);
    if (e.button === 1) { e.preventDefault(); p.onSeekVideo(t + d); return; }
    const r = rangeOf(p.ev);
    const snapOn = !e.shiftKey;
    if (e.button === 0 && e.altKey) {
      drag.current = { k: "shift", clicked: t, base: r, cand: candidates(new Set([p.ev.id])) };
    } else if (e.button === 2) {
      const cand = candidates(new Set([p.ev.id]));
      const at = snap(t, cand, snapOn);
      apply(r.start, at, []);
      drag.current = { k: "edge", fixed: r.start, moving: at, links: [], linkSide: [], cand };
    } else if (e.button === 0) {
      const which = near(t);
      if (!which) {
        // กดไกลจากขอบ ขอบเริ่มกระโดดมาที่จุดกด แล้วลากขอบอีกข้างหาจุดจบ (Drag Timing ของ Aegisub)
        const cand = candidates(new Set([p.ev.id]));
        const at = snap(t, cand, snapOn);
        apply(at, r.end, []);
        drag.current = { k: "edge", fixed: at, moving: r.end, links: [], linkSide: [], cand };
      } else {
        const pos = which === "start" ? r.start : r.end;
        // Ctrl ลากขอบของบรรทัดอื่นที่อยู่ตรงเดียวกันไปด้วย
        const links: Pend["links"] = [], side: ("start" | "end")[] = [];
        if (e.ctrlKey || e.metaKey) for (const x of p.doc.events) {
          if (x.id === p.ev.id || x.comment) continue;
          if (x.start === pos) { links.push({ id: x.id, start: x.start, end: x.end }); side.push("start"); }
          else if (x.end === pos) { links.push({ id: x.id, start: x.start, end: x.end }); side.push("end"); }
        }
        const skip = new Set([p.ev.id, ...links.map((l) => l.id)]);
        const cand = candidates(skip);
        // กดใกล้ขอบเริ่ม ขอบเริ่มมาที่จุดกดทันที (ขอบจบไม่กระโดด) แบบ Aegisub
        const moving = which === "start" ? snap(t, cand, snapOn) : r.end;
        const fixed = which === "start" ? r.end : r.start;
        const lk = links.map((l, i) => (side[i] === "start" ? { ...l, start: moving } : { ...l, end: moving }));
        apply(fixed, moving, lk);
        drag.current = { k: "edge", fixed, moving, links, linkSide: side, cand };
      }
    }
    const move = (ev: MouseEvent) => {
      const dr = drag.current;
      if (!dr || !p.ev) return;
      const tt = subAt(ev.clientX);
      const on = !ev.shiftKey;
      if (dr.k === "shift") {
        // เลื่อนทั้งบรรทัด ดูดติดด้วยขอบที่ใกล้เส้นกว่า
        let delta = tt - dr.clicked;
        const s = snap(dr.base.start + delta, dr.cand, on), en = snap(dr.base.end + delta, dr.cand, on);
        const ds = s - (dr.base.start + delta), de = en - (dr.base.end + delta);
        delta += Math.abs(ds) <= Math.abs(de) ? ds : de;
        apply(dr.base.start + delta, dr.base.end + delta, []);
        return;
      }
      const at = snap(tt, dr.cand, on);
      dr.moving = at;
      apply(dr.fixed, at, dr.links.map((l, i) => (dr.linkSide[i] === "start" ? { ...l, start: at } : { ...l, end: at })));
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      drag.current = null;
      // ปล่อยใกล้ขอบภาพไม่เกิน 5% เลื่อนภาพไปทางนั้นหนึ่งในสาม
      const b = cv.current?.getBoundingClientRect();
      if (b) {
        const x = ev.clientX - b.left;
        if (x < b.width * 0.05) setLeft(Math.max(0, getTiming().left - (w * mpp) / 3));
        else if (x > b.width * 0.95) setLeft(getTiming().left + (w * mpp) / 3);
      }
      if (getTiming().opts.autoCommit && getTiming().pend) p.onAutoCommit();
      bump((x) => x + 1);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const onHover = (e: React.MouseEvent) => {
    if (drag.current) return;
    const t = subAt(e.clientX);
    setMouse(t + d);
    setCursor(e.altKey ? "move" : near(t) ? "ew-resize" : "default");
  };

  // ล้อเมาส์ เลื่อนซ้ายขวา · Ctrl กับล้อซูมโดยเวลาตรงเมาส์อยู่ที่เดิม · ตัวดักแบบไม่ passive ถึงกันหน้าเลื่อนได้
  useEffect(() => {
    const el = cv.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const tmn = getTiming(), m = msPerPx(tmn.opts.hzoom);
      const b = el.getBoundingClientRect(), x = e.clientX - b.left;
      if (e.ctrlKey) {
        const lv = Math.max(-50, Math.min(30, tmn.opts.hzoom + (e.deltaY < 0 ? 1 : -1)));
        const at = tmn.left + x * m;
        setOpt("hzoom", lv);
        setLeft(Math.max(0, at - x * msPerPx(lv)));
      } else setLeft(Math.max(0, tmn.left + (e.deltaY + e.deltaX) * m));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [src?.path]);

  // ลากขอบล่างปรับความสูง 80 ถึง 360 จุด จำไว้
  const grip = (e: React.MouseEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = o.height;
    const move = (ev: MouseEvent) => setOpt("height", Math.max(80, Math.min(360, Math.round(h0 + ev.clientY - y0))));
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // ซูมแนวนอนจากแถบเลื่อน เวลากลางภาพอยู่ที่เดิม
  const zoomTo = (lv: number) => { const mid = left + (w * mpp) / 2; setOpt("hzoom", lv); setLeft(Math.max(0, mid - (w * msPerPx(lv)) / 2)); };
  return { subAt, candidates, snap, near, apply, onDown, onHover, grip, zoomTo };
}
