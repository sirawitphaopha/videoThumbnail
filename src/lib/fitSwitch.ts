/* สลับแถวปุ่มเป็นดรอปดาวน์ตามที่ว่างจริง ไม่ใช้เลขความกว้างตายตัว
   เลขตายตัวพลาดมาแล้ว หัวกราฟเสียงตอนขยายหน้าต่างกว้างราว 1,110 จุด แคบกว่าเกณฑ์ 1,120 นิดเดียว ขึ้นดรอปดาวน์ทั้งที่ปุ่มแถววางพอ
   (BUGS ข้อ 76 · พี่กันทัก 13 พ.ย. 2569 "เราบอกว่า ให้เปลี่ยนปุ่มเป็นดรอปดาวน์ ตอนที่มันจอเล็กนะ เเต่ตอนนี้เราขยายเเล้ว มันเเสดงทั้หมดได้นี่นา")
   วิธี · ตอนแสดงแบบเต็ม ถ้าของในแถวกว้างกว่าแถว (scrollWidth เกิน) จำความกว้างที่ต้องใช้แล้วสลับเป็นแบบย่อ
   ตอนแบบย่อ กลับเป็นแบบเต็มเมื่อแถวกว้างพอความกว้างที่จำไว้ · ของในแถวต้องไม่หด (flex: none) ความกว้างที่ล้นจึงวัดได้จริง */
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** ความกว้างที่ของในแถวต้องการจริง · รวมความกว้างลูกทุกตัว ช่องว่าง ขอบใน
    บวกส่วนที่ลูกโดนบีบ ข้อความที่ถูกตัด (scrollWidth เกิน) กับแถบซูม .hzoom ที่หดต่ำกว่า 200 จุด
    ชิ้นที่หดได้ซ้อนหรือหดลงโดยไม่ล้น scrollWidth ของแถวจึงพิสูจน์ไม่ได้ (กฎ CLAUDE.md) */
export function needWidth(el: HTMLElement) {
  const cs = getComputedStyle(el), gap = parseFloat(cs.columnGap) || 0;
  const kids = [...el.children].filter((k) => getComputedStyle(k).display !== "none") as HTMLElement[];
  let w = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + gap * Math.max(0, kids.length - 1);
  for (const k of kids) {
    w += k.offsetWidth + Math.max(0, k.scrollWidth - k.clientWidth);
    // แถบซูมหดจาก 200 ได้ถึง 130 เท่ากับตอนหัวกราฟแคบ ก่อนนับว่าวางไม่พอ · เดิมนับตั้งแต่ต่ำกว่า 200 หน้าความถี่เฉลี่ยตอนขยายเต็มจอ 1600 × 852
    // หัวกราฟกว้าง 1,120 ขาด 24 จุดก็เป็นดรอปดาวน์ (BUGS ข้อ 102 พี่กันทัก 13 พ.ย. 2569 "ขยายจอสุดเเเล้วทำไมมันยังเป็นดรอปดาว หน้านี้")
    k.querySelectorAll<HTMLElement>(".hzoom").forEach((h) => { if (getComputedStyle(h).display !== "none") w += Math.max(0, 130 - h.offsetWidth); });
  }
  return w;
}

/** ใส่คลาส narrow ให้ทุกแถวที่ตรงตัวเลือก เมื่อของในแถววางไม่พอจริง · ถอดออกเมื่อแถวกว้างพอความกว้างที่จำไว้ตอนแบบเต็ม
    ใช้กับหัวกราฟหน้ากราฟเสียง ทุกชิ้นในหัวกราฟเดียวกันสลับพร้อมกัน (BUGS ข้อ 76) · วัดหลังวาดก่อนจอติด ไม่เห็นกระโดด */
export function useFitClass(selector: string, cls = "narrow") {
  useLayoutEffect(() => {
    const run = () => document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (!el.isConnected || !el.clientWidth) return;
      // ของในหัวกราฟเปลี่ยน (สลับมุมมอง โหมดช่อง) ความกว้างที่จำไว้ใช้ไม่ได้ วัดใหม่จากแบบเต็ม
      const key = `${el.childElementCount}:${el.textContent?.length ?? 0}`;
      if (el.dataset.fitKey !== key) { el.dataset.fitKey = key; el.classList.remove(cls); }
      if (el.classList.contains(cls)) {
        if (Number(el.dataset.fitNeed || 0) > el.clientWidth) return;
        el.classList.remove(cls); // กว้างพอแล้ว ลองแบบเต็ม ไม่พอก็กลับเป็นแบบแคบ ในจังหวะเดียวกันก่อนจอติด
      }
      const need = needWidth(el);
      if (need > el.clientWidth + 1) { el.dataset.fitNeed = String(Math.ceil(need)); el.classList.add(cls); }
    });
    run();
    const ro = new ResizeObserver(run);
    document.querySelectorAll(selector).forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  });
}

export function useFitSwitch(ref: RefObject<HTMLElement | null>, key: unknown = 0) {
  const [compact, setCompact] = useState(false);
  const need = useRef(0);
  const lastKey = useRef(key);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    // ของในแถวเปลี่ยน (เช่นเปิดไฟล์เสียงแทนวิดีโอ) ความกว้างที่จำไว้ใช้ไม่ได้ ลองแบบเต็มใหม่
    if (lastKey.current !== key) { lastKey.current = key; need.current = 0; if (compact) { setCompact(false); return; } }
    const check = () => {
      if (!compact) { if (el.scrollWidth > el.clientWidth + 1) { need.current = el.scrollWidth; setCompact(true); } }
      else if (need.current && el.clientWidth >= need.current) setCompact(false);
    };
    check();
    const ro = new ResizeObserver(check); ro.observe(el);
    return () => ro.disconnect();
  });
  return compact;
}
