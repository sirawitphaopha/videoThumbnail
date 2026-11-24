/* หน้า 2 ใส่โปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 725–931 · แผนขั้น 4)
   การ์ด ① ไฟล์หนัง ② รูปโปสเตอร์ ③ หน้าตาที่จะได้ · ตัวเลือก · ไฟล์ที่ได้ MKV / MP4 · ปุ่มล่าง
   ลากไฟล์จาก Explorer มาวางที่ช่อง หรือที่ไหนก็ได้ในหน้า (เลือกช่องตามชนิดไฟล์) · วางผิดชนิดช่องแดงค้างจนกว่าจะวางใหม่
   วางรูปแล้วหน้าต่างครอปขึ้นเองทุกครั้ง · MKV อยู่แล้วเปลี่ยนแค่รูปแนบ · ไฟล์อื่นครอบเป็น MKV ไม่แปลงภาพเสียงใหม่
   กำลังทำ บอกเปอร์เซ็นต์ เวลาที่เหลือ ขั้นถัดไป ปุ่มหยุด (ถามก่อน) · เลือกลบไฟล์เดิม ยืนยัน 2 ขั้นตอนกดเริ่ม
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 8) ค่าและงานอยู่ชุด hook usePosterBase, usePosterFiles, usePosterRun ส่วนหน้าจออยู่ PosterCards PosterOptions PosterDialogs */
import { type Geometry } from "../../lib/api/index";
import { usePosterBase, type PoProps } from "./usePosterBase";
import { usePosterFiles } from "./usePosterFiles";
import { usePosterRun } from "./usePosterRun";
import PosterCards from "./PosterCards";
import PosterOptions from "./PosterOptions";
import PosterDialogs from "./PosterDialogs";




/** ปุ่มรวมเข้าไฟล์ของปกจับคู่ · รูปกับค่าครอปที่ทำไว้แล้ว ไม่ต้องครอปซ้ำ · เปิดหน้าครอปแก้ต่อได้จากการ์ดรูป */
export type PosterStart = { path: string; geo: Geometry };

export default function PosterPage(p: PoProps) {
  const c0 = usePosterBase(p);
  const c1 = { ...c0, ...usePosterFiles(c0) };
  const c2 = { ...c1, ...usePosterRun(c1) };
  const pg = c2;
  return (
    <div className="pagewrap" data-poster-page>
      <div className="wrapin">
        <PosterCards pg={pg} />
        <PosterOptions pg={pg} />
      </div>
      <PosterDialogs pg={pg} />
    </div>
  );
}
