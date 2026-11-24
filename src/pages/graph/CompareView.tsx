/* หน้ากราฟเสียง หน้าเทียบไฟล์ สูงสุด 4 ไฟล์ (CompareView)
   แยกจาก GraphPage.tsx ตอนแบ่งไฟล์ทั้งโปรเจกต์ (BUGS ข้อ 153 · แผนแบ่งไฟล์ขั้น 1.9) ย้ายมาทั้งก้อน เนื้อโค้ดไม่เปลี่ยน
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 7) ค่าอยู่ useCmpData useCmpView ตัวกราฟอยู่ cmpBody ชื่อไฟล์บนจอ cmpLabels ความถี่เฉลี่ยของไฟล์ที่เทียบ PsdCmp */
import { SavingCtx } from "./draw";
import { useCmpData, type CmpProps } from "./useCmpData";
import { useCmpView } from "./useCmpView";
import { cmpBody } from "./cmpBody";


/* ---------- เทียบไฟล์ สูงสุด 4 ไฟล์ (แผนเสียงและซับ ขั้น 8 · มอคอัปหัวข้อ 7 เทียบก่อนกับหลังแปลง · ขยายเป็นหลายไฟล์ 9 พ.ย. 2569) ----------
   กดเทียบความถี่ในคิวแปลง เปิดหน้านี้พร้อมสองไฟล์ · แท็บเดิมทั้ง 6 แท็บ ทุกกราฟแสดงสองไฟล์ ต้นฉบับสีฟ้า หลังแปลงสีส้ม
   แผงซ้ายช่องเสียงกับข้อมูลเสียงเทียบสองคอลัมน์ · ซูม ช่วงเวลา ช่องที่ซ่อน ใช้กับสองไฟล์พร้อมกัน
   อ่านภาพรวมทีละไฟล์ (ฝั่ง Rust คำขอใหม่หยุดคำขอเก่า อ่านพร้อมกันไม่ได้) · ซูมใช้ข้อมูลภาพรวม ละเอียดเท่าที่ภาพรวมมี */
export function CompareView(p: CmpProps) {
  const d = useCmpData(p);
  const v = { ...d, ...useCmpView(d) };
  const pg = { ...v, ...cmpBody(v) };
  const { body, ctl, head, n, panel, saving, tab, wide } = pg;
  return (
    <SavingCtx.Provider value={saving}><div className="ag" data-graph data-compare data-graphview={tab}>
      <div className="agstick">{head}{ctl}</div>
      <div className={"agb" + (wide ? " wide" : n > 2 ? " many" : "")}>{wide ? null : panel}{body}</div>
    </div></SavingCtx.Provider>
  );
}
