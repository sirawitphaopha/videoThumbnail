/* หน้าซับไตเติล (BUGS ข้อ 101 พี่กันสั่ง 13 พ.ย. 2569 "สร้าเมนู ซับไตเติลไว้รอด้วย เพราะตามโร๊ดเเมพจะทำอยู่เเล้ว")
   ข้อ 104 ใส่ไฟล์แล้วดูซับในหน้านี้ได้เลย (พี่กันสั่ง "ดูได้หน้านี้เลย" · "ทำปุ่มอัปไฟล์ เหมือนจุดอื่นเลย")
   จุดลากไฟล์กับปุ่มเลือกไฟล์แบบหน้า MediaInfo · รับไฟล์หนัง (อ่านซับในไฟล์ด้วย merge_inspect ตัวเดียวกับหน้าเสียงและซับ) หรือไฟล์ซับ (merge_add_file)
   แต่ละซับมีปุ่มดูซับ เปิดตัวดูซับตัวเดียวกับหน้าเสียงและซับ · ไฟล์ซับไฟล์เดียวเปิดตัวดูซับให้เลย · อ่านอย่างเดียว ไฟล์ไม่ถูกแตะ
   ข้อ 107 ไฟล์ซับอย่างเดียวเพิ่มไฟล์วิดีโอคู่ได้ เห็นภาพหนังกับคลื่นเสียง (พี่กัน "ขอปุ่มเพิ่มวิดีโอมาด้วย")
   ข้อ 108 ซับในไฟล์หนังมีปุ่ม Export ได้ไฟล์ซับชนิดเดิม ใช้ตัวแยกไฟล์ตัวเดียวกับหน้าเสียงและซับ (extract.rs) เก็บที่โฟลเดอร์ <ชื่อหนัง> แยกไฟล์ ข้างไฟล์หนัง
   ชื่อชนถามก่อน ไม่เขียนทับ (พี่กัน "ขอปุ่ม export ไฟล์ซับด้วย")
   ข้อ 109 ซับตัวหนังสือเปิดเป็นหน้าแก้ซับแบบ Aegisub (แผนหน้าแก้ซับ · components/subedit/SubEditor.tsx) ซับรูปยังเป็นตัวดูเดิม
   เปลี่ยนแทร็กหรือเปิดไฟล์อื่นตอนซับที่แก้ยังไม่บันทึก ถามก่อน บันทึก ไม่บันทึก (เก็บฉบับอัตโนมัติให้) หรือยกเลิก
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 8) ค่าและงานอยู่ชุด hook useSubPageFile, useSubPageView ส่วนหน้าจออยู่ SubPageBody */
import { createPortal } from "react-dom";
import { useSubPageFile, type SpProps } from "./useSubPageFile";
import { useSubPageView } from "./useSubPageView";
import SubPageBody from "./SubPageBody";

export default function SubtitlePage(p: SpProps) {
  const c0 = useSubPageFile(p);
  const c1 = { ...c0, ...useSubPageView(c0) };
  const pg = c1;
  const { active, imgMode, isImage, st, top, ttl } = pg;
  return (
    <div className="pagewrap" data-subtitle-page data-ocr-on={(st && isImage(st) && imgMode === "ocr") || undefined}>
      {active && ttl && createPortal(top, ttl)}
      <SubPageBody pg={pg} />
    </div>
  );
}
