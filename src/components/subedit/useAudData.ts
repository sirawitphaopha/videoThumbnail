/* ค่าหลักของกรอบคลื่นเสียง ความกว้าง ความดัง เลื่อนตามบรรทัด ขอรูปคลื่นทีละแผ่น ภาพความถี่ และเส้นที่กำลังเล่น
   แยกจาก SubAudio.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 10) เนื้อโค้ดยกมาทั้งก้อน */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { audApi, graphApi, type GWindow } from "../../lib/api";
import { setVolume, usePlay } from "../../lib/audioPlay";
import { cube, getTiming, msPerPx, rangeOf, scrollIntoView, setPend, setViewW, useTiming } from "../../lib/subTiming";
import { useVid, vidRate } from "../../lib/vidFrames";
import { LUT, TILE, tiles, inflight, putTile, type Props, type Drag } from "./audShared";

export function useAudData(p: Props) {
  const tm = useTiming();
  const vs = useVid();
  const pl = usePlay();
  const o = tm.opts;
  const src = tm.own ?? p.movie;
  const d = p.delayMs;
  const mpp = msPerPx(o.hzoom);
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);
  const [spec, setSpec] = useState<{ key: string; t0: number; t1: number; w: GWindow } | null>(null);
  const [, bump] = useState(0);
  const [mouse, setMouse] = useState<number | null>(null);
  const [cursor, setCursor] = useState("default");
  const drag = useRef<Drag | null>(null);
  const tileMs = TILE * mpp;
  const left = tm.left;
  const right = left + w * mpp;
  const h = o.height;

  // ความกว้างจริงของภาพคลื่นเสียง
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setW(Math.max(100, Math.floor(el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src?.path]);

  useEffect(() => setViewW(w), [w]);
  // ความดังตอนเล่น · ผูกโซ่อยู่ใช้ค่าซูมแนวตั้ง
  useEffect(() => setVolume(cube(o.link ? o.vzoom : o.volume)), [o.link, o.vzoom, o.volume]);

  // เปลี่ยนบรรทัดก่อนยืนยัน ทิ้งที่ลากไว้ (Revert ของ Aegisub) · เลื่อนตามบรรทัดที่เลือก (AUTO เลื่อนตาม)
  useEffect(() => {
    const pd = getTiming().pend;
    if (pd && pd.id !== p.ev?.id) setPend(null);
    if (!p.ev) return;
    if (getTiming().opts.autoScroll || getTiming().left === 0) scrollToLine();
  }, [p.ev?.id, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToLine = () => {
    if (!p.ev) return;
    const r = rangeOf(p.ev);
    scrollIntoView(r.start + d, r.end + d, w, mpp);
  };

  // ขอแผ่นรูปคลื่นที่เห็นกับข้างละหนึ่งแผ่น ทีละไม่เกินสามคำขอ · แผ่นเสร็จแล้ววาดใหม่ตราบที่กรอบยังเปิดอยู่
  // (เดิมใช้ตัวบอกของแต่ละรอบ ตัวดักนี้รันทุกครั้งที่วาด รอบเก่าถูกปิดก่อนแผ่นมาถึง รูปคลื่นจึงไม่ขึ้น)
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!src || o.spectrum) return;
    const k0 = Math.floor(left / tileMs) - 1, k1 = Math.floor(right / tileMs) + 1;
    for (let k = Math.max(0, k0); k <= k1; k++) {
      const key = `${src.path}|${src.map}|${src.zero ?? ""}|${mpp}|${k}`;
      if (tiles.has(key) || inflight.has(key) || inflight.size >= 3) continue;
      inflight.add(key);
      audApi.peaks(src.path, src.map, (k * tileMs) / 1000, ((k + 1) * tileMs) / 1000, TILE, src.zero ?? null)
        .then((v) => putTile(key, v), () => putTile(key, []))
        .finally(() => { inflight.delete(key); if (alive.current) bump((x) => x + 1); });
    }
  });

  // ภาพความถี่ของช่วงที่เห็น รอหยุดเลื่อนก่อนขอ
  useEffect(() => {
    if (!src || !o.spectrum) return;
    const key = `${src.path}|${src.idx}|${Math.round(left)}|${Math.round(right)}|${w}`;
    if (spec?.key === key) return;
    let live = true;
    const t = setTimeout(() => graphApi.window(src.path, src.idx, Math.max(0, left) / 1000, right / 1000, Math.min(1200, w), 128, true)
      .then((g) => { if (live && g) setSpec({ key, t0: left, t1: right, w: g }); }, () => {}), 200);
    return () => { live = false; clearTimeout(t); };
  }, [src?.path, src?.idx, o.spectrum, left, right, w]); // eslint-disable-line react-hooks/exhaustive-deps

  // เส้นที่กำลังเล่นขยับทุกเฟรมระหว่างเล่น
  useEffect(() => {
    if (!pl.playing) return;
    let raf = 0;
    const tick = () => { bump((x) => x + 1); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pl.playing]);

  const X = (t: number) => (t - left) / mpp;
  const fr = vidRate(vs);

  // ภาพความถี่ทำครั้งเดียวต่อข้อมูลชุดหนึ่ง (ถอด base64 ทุกช่องแล้วลงสี) · รอบวาดแค่แปะภาพ
  // เดิมทำใหม่ทุกรอบวาด ระหว่างเล่นเสียงหรือขยับเมาส์ถอดใหม่ 60 ครั้งต่อวินาที เส้นเล่นสะดุด (ผู้ช่วยตรวจทาน F11)
  const specImg = useMemo(() => {
    if (!spec || !spec.w.spec.length) return null;
    const chs = spec.w.spec.map((b64) => Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))), cols = spec.w.cols, bins = spec.w.bins;
    const off = document.createElement("canvas"); off.width = cols; off.height = bins;
    const og = off.getContext("2d")!, img = og.createImageData(cols, bins);
    for (let row = 0; row < bins; row++) for (let col = 0; col < cols; col++) {
      let v = 0; for (const a of chs) v = Math.max(v, a[col * bins + (bins - 1 - row)] ?? 0);
      const q = (row * cols + col) * 4; img.data[q] = LUT[v * 3]; img.data[q + 1] = LUT[v * 3 + 1]; img.data[q + 2] = LUT[v * 3 + 2]; img.data[q + 3] = 255;
    }
    og.putImageData(img, 0, 0);
    return off;
  }, [spec]);
  return { tm, vs, pl, o, src, d, mpp, wrap, cv, w, setW, spec, setSpec, bump, mouse, setMouse, cursor, setCursor, drag, tileMs, left, right, h, scrollToLine, alive, X, fr, specImg, p };
}
