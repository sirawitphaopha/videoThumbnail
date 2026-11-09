/* ภาพสุ่มจากหนัง แสดงแทนแถบทะแยงในเรื่องที่ยังไม่มีปก (พี่กันสั่ง 9 พ.ย. 2569)
   ดึงเฉพาะเรื่องที่เห็นบนจอ ทีละ 2 เรื่อง เครื่องไม่กระตุก · จำผลไว้ เปิดปิดซ้ำขึ้นทันที · ดึงไม่ได้เป็นแถบทะแยงตามเดิม */
import { useEffect, useRef, useState } from "react";
import { frameApi, type Movie } from "./api";

const got = new Map<string, string | null>();
const waiting: (() => void)[] = [];
let running = 0;
const MAX = 2;

function next() {
  while (running < MAX && waiting.length) { running++; waiting.shift()!(); }
}
function fetchFrame(m: Movie, key: string): Promise<string | null> {
  return new Promise((resolve) => {
    waiting.push(() => {
      frameApi.movie(m.path, m.duration ?? 0)
        .then((p) => p, () => null)
        .then((p) => { got.set(key, p); running--; next(); resolve(p); });
    });
    next();
  });
}

/** on = เปิดปุ่มไว้ และเรื่องนี้ไม่มีปก · url คือไฟล์ภาพ · ref ติดกับช่องแถบทะแยง ใช้ดูว่าช่องอยู่บนจอแล้ว */
export function useMovieFrame(m: Movie, on: boolean) {
  const key = m.path + "|" + m.size;
  const ref = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(() => (on ? got.get(key) ?? null : null));
  useEffect(() => {
    if (!on || m.missing) { setUrl(null); return; }
    if (got.has(key)) { setUrl(got.get(key) ?? null); return; }
    const el = ref.current;
    if (!el) return;
    let live = true;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      fetchFrame(m, key).then((p) => { if (live) setUrl(p); });
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key, m.missing]);
  return { url: on ? url : null, ref };
}
