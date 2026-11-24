/* หน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 3 · BUGS ข้อ 109 · แบบ 1 ที่พี่กันเลือก ช่องแก้บรรทัดอยู่ระหว่างภาพหนังกับตาราง แบบ Aegisub)
   แถบเครื่องมือ เลิกทำ ทำซ้ำ · บอกจำนวนบรรทัดที่แก้ยังไม่บันทึก · ฉบับบันทึกอัตโนมัติ · รหัสอักษร · บันทึกเป็นไฟล์ใหม่ · บันทึก
   ภาพหนังกับคลื่นเสียงบน ช่องแก้บรรทัดกลาง ตารางล่างสูงเต็มที่ว่างที่เหลือของหน้าต่าง อย่างน้อยหัวตารางกับสองแถว (หน้าต่าง 1280 × 800 เห็นราวสองแถวตามมอคอัปที่พี่กันเลือก)
   บันทึก (ทางที่แคลร์เลือก แผนติดป้ายว่าพี่กันยังไม่ได้เคาะ)
     ไฟล์ซับ เขียนทับ ไฟล์เดิมลงถังขยะ (กู้คืนได้) · ไฟล์ถูกแก้จากที่อื่นหลังเปิด ถามก่อน · ไฟล์มีอักษรที่อ่านไม่ออก ถามก่อน
     ซับในหนัง หรือเปลี่ยนชนิดแล้ว ต้องบันทึกเป็นไฟล์ใหม่ · ชื่อชนไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข
     บันทึกเป็น SRT เตือนก่อนว่าอะไรหาย (พี่กัน "ตอน export srt ต้องบอกว่าอะไรจะหายไปมั่ง")
   ปุ่มบันทึกบอกสถานะทุกจังหวะ สำเร็จหายเอง ผิดพลาดค้างไว้ (สกิล save-status)
   คีย์ลัด Ctrl+Z เลิกทำ Ctrl+Y หรือ Ctrl+Shift+Z ทำซ้ำ Ctrl+S บันทึก Ctrl+Shift+S บันทึกเป็นไฟล์ใหม่ (ใช้ได้ตอนพิมพ์ในช่องด้วย)
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 5) ค่าและงานอยู่ชุด hook useSe*.ts รวมใน useSePage ส่วนหน้าจออยู่ SeTools SeTabs SeDialogs */
import { CardIcon, Phr, Skel } from "../ui";
import "../../styles/subedit.css";
import type { SubEditorProps } from "./editorParts";
import { useSePage } from "./useSePage";
import { seVals } from "./seVals";
import SeTools from "./SeTools";
import SeTabs from "./SeTabs";
import SeDialogs from "./SeDialogs";

export default function SubEditor(p: SubEditorProps) {
  const pg = useSePage(p);
  const { doc, load, root } = pg;
  if (load.s === "failed") return <div className="stat bad" data-se-loaderr><CardIcon kind="bad" /><div><b>เปิดซับไม่ได้</b><Phr>{load.err}</Phr></div></div>;
  if (load.s === "busy" || !doc) return <section className="card se" aria-busy="true" data-subedit><Skel w="60%" h={30} /><div className="aegtop se-top" style={{ marginTop: 12 }}><Skel w="100%" h={203} r={0} /><Skel w="100%" h={150} /></div><Skel w="100%" h={160} style={{ marginTop: 12 }} /></section>;

  const e = { ...pg, ...seVals(pg) };
  return (
    <section className="card se" ref={root} data-subedit data-se-kind={doc.kind}>
      <SeTools pg={e} />
      <SeTabs pg={e} />
      <SeDialogs pg={e} />
    </section>
  );
}
