/* หน้าเสียงและซับ (แผนเสียงและซับ ขั้น 2 · มอคอัป docs/mockups/audio-merge.html หัวข้อ 1 กับ 6)
   ใส่เสียงหรือซับที่โหลดแยกเข้าหนัง เรียงลำดับ ตั้งภาษา ชื่อ แทร็กหลัก ดีเลย์ เอาแทร็กเดิมออก ใส่ปกตั้งปกนอน แล้วรวมรอบเดียว
   พี่กัน *"หัวข้อ เสียงและซับ มันก็ใส่ภาพได้นะ ถ้าเธอแยกหัวข้อแบบนี้เราต้อง merge ไฟล์สองรอบเหรอ"* → ปกอยู่ในคำสั่งรวมเดียวกัน
   ลากไฟล์จาก Explorer มาวางที่ไหนก็ได้ในหน้า โปรแกรมแยกเองว่าไฟล์ไหนเป็นหนัง เสียง ซับ หรือรูป
   ทุกอย่างเก็บใน lib/avJob.ts ไปหน้าอื่นแล้วกลับมายังอยู่ · งานรวมทำเป็นไฟล์ชั่วคราว ตรวจแล้วค่อยเป็นไฟล์จริง แบบหน้าใส่โปสเตอร์
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 2) ตัวนี้ประกอบส่วนอย่างเดียว ค่าและงานอยู่ชุด hook use*.ts รวมใน useAvPage ส่วนของหน้าอยู่ไฟล์ตามชื่อส่วน */
import "../../styles/av.css";
import { useAvPage } from "./useAvPage";
import type { AvProps } from "./useAvBase";
import AvEmpty from "./AvEmpty";
import AvTop from "./AvTop";
import TrackTable from "./TrackTable";
import PosterCard from "./PosterCard";
import TrackPanels from "./TrackSettings";
import FontsCard from "./FontsCard";
import AvNotes from "./AvNotes";
import AvDock from "./AvDock";
import AvDialogs from "./AvDialogs";

export default function AvPage(p: AvProps) {
  const pg = useAvPage(p);
  // ---------- หน้าว่าง ----------
  if (!pg.movie) return <AvEmpty pg={pg} />;
  return (
    <div className="pagewrap" data-av-page ref={pg.pageRef}>
      <div className="avwrap">
        <AvTop pg={pg} />
        <TrackTable pg={pg} />
        <PosterCard pg={pg} />
        <TrackPanels pg={pg} />
        <FontsCard pg={pg} />
        <AvNotes pg={pg} />
        <AvDock pg={pg} />
      </div>
      <AvDialogs pg={pg} />
    </div>
  );
}
