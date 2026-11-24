/* กระดานจับคู่ (แผนจับคู่รูปปก ขั้น 4 · มอคอัปหน้า 3 และ 3 ต่อ)
   รูปซ้าย หนังขวา · กดรูปแล้วกดหนัง 2 คลิก · ลากรูปไปวาง · คีย์บอร์ด · ลากรูปจาก Explorer มาวางบนหนังตรง ๆ
   จับคู่แล้วยังไม่บันทึก แถวขึ้นสีฟ้า ส่งไปรอยืนยันที่ตารางตรวจผล (พี่กันสั่ง 8 พ.ย. 2569 ทุกวิธีมาจบที่ตาราง)
   หัวแผงเป็นรายการโฟลเดอร์ เพิ่มได้เรื่อย ๆ แถวยาวลงมาตามจำนวน (พี่กันสั่ง *"เลือกโฟลเดอร์เพิ่มได้เรื่อยๆ"*) · โฟลเดอร์หนังคือโฟลเดอร์ของชั้นวาง (พี่กันตอบตอนทำแผน)
   สลับดูรายการกับแค่รูปได้ทั้งสองแผง จำค่าไว้ · ชี้ที่รูปเห็นชื่อไฟล์
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 8) ค่าและงานอยู่ชุด hook useBoardData, useBoardDrag ส่วนหน้าจออยู่ BoardGrid BoardFoot */
import { useBoardData } from "./useBoardData";
import { useBoardDrag } from "./useBoardDrag";
import BoardGrid from "./BoardGrid";
import BoardFoot from "./BoardFoot";

export default function LinkBoard() {
  const c0 = useBoardData();
  const c1 = { ...c0, ...useBoardDrag(c0) };
  const pg = c1;
  return (
    <div className="linktable" data-link-board>
      <BoardGrid pg={pg} />
      <BoardFoot pg={pg} />
    </div>
  );
}
