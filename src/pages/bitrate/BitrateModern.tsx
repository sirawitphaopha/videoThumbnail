/* หน้าบิตเรตแบบใหม่ (แบบชั้นหนัง) ตัวประกอบ · เดิมเป็นคอมโพเนนต์ BitrateModern ก้อนเดียว 825 บรรทัดใน BitratePage.tsx
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 3) ค่าและงานอยู่ชุด hook useBr*.ts รวมใน useBrPage หน้าก่อนเห็นกราฟอยู่ BrHome.tsx */
import { useBrPage } from "./useBrPage";
import type { BrProps } from "./useBrState";
import { openVals } from "./brOpenVals";
import { BrAsking, BrChoose, BrStart } from "./BrHome";
import BrControls from "./BrControls";
import BrPlot from "./BrPlot";

export default function BitrateModern(p: BrProps) {
  const pg = useBrPage(p);
  if (pg.asking) return <BrAsking pg={pg} />;
  if (!pg.path) return <BrStart pg={pg} />;
  if (pg.choose && pg.choose.path === pg.path) return <BrChoose pg={pg} />;
  /* ---------- เปิดไฟล์แล้ว ---------- */
  const op = { ...pg, ...openVals(pg) };
  return (
    <div className="ag brn" data-brn data-brnfile>
      <BrControls pg={op} />
      <BrPlot pg={op} />
    </div>
  );
}
