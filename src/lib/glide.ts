/* เลื่อนกล่องแบบค่อย ๆ เลื่อน ห้ามวาร์บ และไม่พึ่ง behavior: "smooth" (web-craft 6.21 ⑩)
   ยกจาก warfarin-dash lib/glideScroll.ts · โปรแกรมนี้ไม่เลื่อนทั้งหน้า เลื่อนเฉพาะกล่องข้างใน จึงเหลือแค่ตัวเลื่อนกล่อง
   🔴 คนใช้หมุนล้อ แตะจอ หรือกดคีย์เมื่อไหร่ ปล่อยมือทันที
   🔴 หน้าต่างที่ไม่ได้แสดงผลอยู่ ไปถึงปลายทางทันที เพราะเบราว์เซอร์หยุดยิงจังหวะวาดจอ */

const durationOf = (dist: number) => Math.min(620, Math.max(280, Math.abs(dist) * 0.42));
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const runs = new WeakMap<HTMLElement, () => void>();

/** เลื่อนกล่อง el ไปที่ตำแหน่ง to (จุดจากบนสุดของกล่อง) */
export function glideBox(el: HTMLElement, to: number) {
  runs.get(el)?.();
  const start = el.scrollTop;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const end = Math.min(Math.max(0, to), max);
  const dist = end - start;
  if (Math.abs(dist) < 2 || document.hidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.scrollTop = end;
    return;
  }
  const dur = durationOf(dist);
  const t0 = performance.now();
  let raf = 0;
  const release = () => {
    cancelAnimationFrame(raf);
    el.removeEventListener("wheel", release);
    el.removeEventListener("touchstart", release);
    window.removeEventListener("keydown", release);
    runs.delete(el);
  };
  el.addEventListener("wheel", release, { passive: true });
  el.addEventListener("touchstart", release, { passive: true });
  window.addEventListener("keydown", release);
  runs.set(el, release);
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    el.scrollTop = start + dist * ease(k);
    if (k < 1) raf = requestAnimationFrame(frame);
    else release();
  };
  raf = requestAnimationFrame(frame);
}

/** วางกล่องไว้บนสุดทันที ใช้ตอนเปลี่ยนหน้า (การวาง ไม่ใช่การเลื่อน) */
export function placeTop(el: HTMLElement | null) {
  if (!el) return;
  runs.get(el)?.();
  el.scrollTop = 0;
}
