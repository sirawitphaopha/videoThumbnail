/* แถบเลื่อนเวลาใต้ภาพหนัง ลากดูทั้งเรื่อง (BUGS ข้อ 113)
   แปลวิธีจาก src/video_slider.cpp ของ Aegisub
   GetValueAtX = (x − 5) × เฟรมสุดท้าย ÷ (กว้าง − 10) ปัดลง · GetXAtValue กลับกัน · ขอบซ้ายขวาเว้นข้างละ 5 จุด
   กดหรือลาก ภาพไปเฟรมนั้น · Shift ดูดไป keyframe ที่ใกล้ที่สุด · ยังไม่ได้คลิกแถบแล้วคลิกห่างตัวชี้ไม่ถึง 4 จุด แค่เลือกแถบ ไม่ย้ายภาพ
   หมุนล้อบนแถบ ทีละหนึ่งเฟรม · Shift ไป keyframe ถัดไปหรือก่อนหน้า · ขีดบนแถบคือ keyframe
   หน้าตาวาดเองในโทนของโปรแกรม ไม่ลอกหน้าตาของ Aegisub

   Copyright (c) 2005, Rodrigo Braz Monteiro
   All rights reserved.

   Redistribution and use in source and binary forms, with or without
   modification, are permitted provided that the following conditions are met:

     * Redistributions of source code must retain the above copyright notice,
       this list of conditions and the following disclaimer.
     * Redistributions in binary form must reproduce the above copyright notice,
       this list of conditions and the following disclaimer in the documentation
       and/or other materials provided with the distribution.
     * Neither the name of the Aegisub Group nor the names of its contributors
       may be used to endorse or promote products derived from this software
       without specific prior written permission.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
   AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
   IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
   ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
   LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
   CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
   INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
   CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
   ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
   POSSIBILITY OF SUCH DAMAGE.

   Aegisub Project http://www.aegisub.org/ */
import { useEffect, useRef, useState } from "react";
import { jumpKeyframe, seek } from "../../lib/vidFrames";

/** เฟรมที่ใกล้ที่สุดในรายการ keyframe (lower_bound แล้วเทียบตัวถัดไป แบบ VideoSlider::OnMouse) */
/** keyframe ที่ใกล้เฟรม f ที่สุด ห่างเท่ากันเลือกตัวหลัง
 *  ต่างจาก Aegisub ที่เดียว ซอร์สเขียน `(*pos + 1) - clickedFrame` แทน `*(pos + 1)` เงื่อนไขไม่มีวันจริง
 *  Aegisub ของจริงจึงดูดไป keyframe ตัวแรกที่ตรงหรือหลังจุดคลิกเสมอ ที่นี่ทำตามที่คอมเมนต์ของ Aegisub ตั้งใจ (แคลร์ตั้ง 14 พ.ย. 2569) */
export function nearestKey(keys: number[], f: number) {
  if (!keys.length) return f;
  let i = keys.findIndex((k) => k >= f);
  if (i < 0) i = keys.length - 1;
  else if (i > 0 && f - keys[i - 1] < keys[i] - f) i--;
  return keys[i];
}
export const valueAtX = (x: number, w: number, max: number) => (w <= 10 ? 0 : Math.max(0, Math.min(max, Math.floor(((x - 5) * max) / (w - 10)))));
export const xAtValue = (v: number, w: number, max: number) => (max <= 0 ? 0 : (v * (w - 10)) / max + 5);
// ทางลัดให้ตัวตรวจ เฉพาะรุ่นทดสอบ (check-q113.mjs)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__vsLib = { nearestKey, valueAtX, xAtValue };

export default function VideoSlider(p: { pos: number | null; max: number; keys: number[]; why?: string; onKey: (e: React.KeyboardEvent) => void; onBeforeSeek?: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const drag = useRef(false);
  const wheelAcc = useRef(0);
  useEffect(() => {
    const e = el.current;
    if (!e) return;
    const f = () => setW(e.clientWidth);
    f();
    const ro = new ResizeObserver(f);
    ro.observe(e);
    return () => ro.disconnect();
  }, []);
  const val = p.pos ?? 0;
  const off = !!p.why || p.max <= 0;
  const go = (x: number, shift: boolean) => {
    let f = valueAtX(x, w, p.max);
    if (shift && p.keys.length) f = nearestKey(p.keys, f);
    if (f === val) return;
    p.onBeforeSeek?.();
    seek(f);
  };
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (off || e.button !== 0) return;
    const had = document.activeElement === el.current;
    el.current?.focus({ preventScroll: true });
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    drag.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    // ยังไม่ได้เลือกแถบ คลิกใกล้ตัวชี้ แค่เลือกแถบ (กันภาพกระโดดตอนตั้งใจแค่คลิกเพื่อใช้ลูกศร)
    if (!had && Math.abs(x - xAtValue(val, w, p.max)) < 4) return;
    go(x, e.shiftKey);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || off) return;
    go(e.clientX - e.currentTarget.getBoundingClientRect().left, e.shiftKey);
  };
  const up = () => { drag.current = false; };
  // ล้อเมาส์ ตัวดักไม่ passive ถึงกันหน้าเลื่อนได้ · นับเป็นรอบล้อ ทัชแพดสะสมจนครบรอบ
  const wheelNow = useRef<(e: WheelEvent) => void>(() => {});
  wheelNow.current = (e: WheelEvent) => {
    if (off) return;
    e.preventDefault();
    const dy = (e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
    wheelAcc.current += dy;
    const steps = Math.trunc(wheelAcc.current / 100);
    if (!steps) return;
    wheelAcc.current -= steps * 100;
    p.onBeforeSeek?.();
    if (e.shiftKey) { jumpKeyframe(steps > 0 ? 1 : -1); return; }
    seek(Math.max(0, Math.min(p.max, val + steps)));
  };
  useEffect(() => {
    const e = el.current;
    if (!e) return;
    const f = (ev: WheelEvent) => wheelNow.current(ev);
    e.addEventListener("wheel", f, { passive: false });
    return () => e.removeEventListener("wheel", f);
  }, []);
  const cx = xAtValue(val, w, p.max);
  return (
    <div ref={el} className={"se-vslider" + (off ? " off" : "")} role="slider" tabIndex={off ? -1 : 0} aria-label="แถบเลื่อนเวลาของหนัง" aria-valuemin={0} aria-valuemax={Math.max(0, p.max)} aria-valuenow={val}
      aria-disabled={off || undefined} title={p.why ?? "ลากดูทั้งเรื่อง  Shift ดูดไป keyframe  หมุนล้อทีละเฟรม"}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={(e) => { if (!off) p.onKey(e); }} data-vslider data-vsval={val}>
      {w > 10 && p.max > 0 && <>
        <span className="se-vstrack" />
        {p.keys.length <= 4000 && p.keys.map((k) => <span key={k} className="se-vskey" style={{ left: Math.round(xAtValue(k, w, p.max)) }} />)}
        {!off && <span className="se-vsthumb" style={{ left: Math.round(cx) }} data-vsthumb />}
      </>}
    </div>
  );
}
