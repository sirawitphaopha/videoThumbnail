/* หน้าที่เคยเปิดแล้วเก็บไว้ ซ่อนตอนไปเมนูอื่น ของที่เลือก กรอก ปรับ ไว้ไม่หาย (BUGS ข้อ 9 · พี่กันสั่ง 10 พ.ย. 2569
   "หน้าหาย ต้องทำกับทุกหน้าที่มีการแก้ไข เเละช้งานนะ")
   หน้าที่ซ่อนอยู่ยังติดตั้งตัวดักระดับหน้าต่างไว้ (ลากไฟล์จาก Explorer ปุ่มลัด) ต้องเช็ก usePageActiveRef ก่อนทำอะไร
   ไม่งั้นลากไฟล์ลงหน้าหนึ่ง แล้วหน้าที่ซ่อนอยู่รับไปด้วย */
import { createContext, useContext, useEffect, useRef } from "react";

export const PageActiveCtx = createContext(true);

/** หน้านี้เปิดอยู่บนจอไหม · ของที่ไม่ได้อยู่ในหน้าใดหน้าหนึ่งได้ true เสมอ */
export const usePageActive = () => useContext(PageActiveCtx);

/** แบบตัวผูก ใช้ในตัวดักที่ติดตั้งครั้งเดียว ค่าล่าสุดเสมอโดยไม่ต้องติดตั้งตัวดักใหม่ */
export function usePageActiveRef() {
  const active = useContext(PageActiveCtx);
  const ref = useRef(active);
  useEffect(() => { ref.current = active; }, [active]);
  return ref;
}
