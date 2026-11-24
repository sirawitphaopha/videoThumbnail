/* หน้าบิตเรตแบบใหม่ (แบบชั้นหนัง) ตัวประกอบ · เดิมเป็นคอมโพเนนต์ BitrateModern ก้อนเดียว 825 บรรทัดใน BitratePage.tsx
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 3) ค่าและงานอยู่ชุด hook useBr*.ts รวมใน useBrPage หน้าก่อนเห็นกราฟอยู่ BrHome.tsx */
import { useBrPage } from "./useBrPage";
import type { BrProps } from "./useBrState";
import { openVals } from "./brOpenVals";
import { askingView, chooseView, brStartView } from "./BrHome";
import BrControls from "./BrControls";
import BrPlot from "./BrPlot";

export default function BitrateModern(p: BrProps) {
  const pg = useBrPage(p);
  // ทางแยกเรียกเป็นฟังก์ชัน ไม่วางเป็นแท็ก JSX · ได้กล่อง div.ag.brn กับแถบชื่อไฟล์ชุดเดียวกับโค้ดเดิมที่ React ใช้ต่อตอนเปลี่ยนสภาพ
  // ไม่งั้นปุ่มกลับหน้ารวมกับรูปปกถูกสร้างใหม่ โฟกัสหลุด (ผู้ช่วยตรวจทานขั้น 13 ของ BUGS ข้อ 155) · ฟังก์ชัน *View ห้ามมี hook
  if (pg.asking) return askingView({ pg });
  if (!pg.path) return brStartView({ pg });
  if (pg.choose && pg.choose.path === pg.path) return chooseView({ pg });
  /* ---------- เปิดไฟล์แล้ว ---------- */
  const op = { ...pg, ...openVals(pg) };
  return (
    <div className="ag brn" data-brn data-brnfile>
      <BrControls pg={op} />
      <BrPlot pg={op} />
    </div>
  );
}
