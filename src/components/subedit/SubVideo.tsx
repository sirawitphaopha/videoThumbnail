/* กรอบภาพหนังของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 4 · BUGS ข้อ 109 · แบบกรอบวิดีโอของ Aegisub video_box.cpp)
   ภาพตรงเฟรม ซับที่ขึ้นบนเฟรมนั้นทับภาพ มุมขวาบนบอกระยะห่างจากเวลาเริ่มและจบของบรรทัดที่กำลังแก้ (เช่น +0ms; -2900ms)
   แถบล่าง ถอยหรือเดินทีละเฟรม · ช่องเวลากับเลขเฟรม (เฟรมนั้นเป็น keyframe ช่องเปลี่ยนสี) · AUTO เลือกบรรทัดแล้วภาพไปเวลาเริ่มเอง · เมนูวิดีโอ
   ขนาดภาพ พอดีกรอบ หรือ 12.5% ถึง 300% ขั้นละ 12.5% · ล้อเมาส์บนภาพแบบ Aegisub หมุนเปล่าปรับขนาดภาพทีละ 12.5% ได้ถึง 1000% Ctrl ขยายเนื้อภาพในกรอบเดิม Shift เลื่อนภาพ
   คลิกภาพแล้วลูกศรซ้ายขวาเดินทีละเฟรม Shift ไป keyframe Ctrl ไปขอบบรรทัด Alt ทีละ 10 เฟรม (ตารางก็ใช้ปุ่มชุดเดียวกัน)
   ยังอ่านเวลาเฟรมไม่เสร็จ ขึ้นภาพตามเวลาแบบเดิมก่อน · ไม่มีวิดีโอบอกในกรอบพร้อมปุ่มเพิ่มไฟล์วิดีโอกับวิดีโอจำลอง (BUGS ข้อ 107)
   ปุ่มเล่น (Ctrl+P แบบ Aegisub) เล่นหนังในกรอบนี้ ตัวเล่นตามหน้าตั้งค่า mpv (ค่าตั้งต้น) หรือแบบ Aegisub ที่ภาพเดินตามเวลาของเสียง (vidPlay.ts)
   ภาพหยุดอยู่ ซับบนภาพวาดด้วย libass (subshot.rs) ตำแหน่ง สี ฟอนต์ แท็กตรงกับตอนเล่น · แถบซ้ายของภาพเลือกเครื่องมือกากบาท (A) กับลากจัดตำแหน่ง (S) (VideoTools.tsx · BUGS ข้อ 111)
   คลิกขวาบนภาพ บันทึกภาพ PNG หรือคัดลอกภาพ แบบมีซับ ไม่มีซับ เฉพาะซับ คัดลอกพิกัด รีเซ็ตการเลื่อนภาพ (เมนู video_context ของ Aegisub) · กดล้อเมาส์ค้างแล้วลากเลื่อนภาพที่ขยายเกินกรอบ
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 10) ค่าอยู่ชุด hook useVidBox useVidPlayback useVidWheel useVidLayer ส่วนหน้าจออยู่ VidView VidBars วิดีโอจำลองอยู่ VidDummy คิววาดซับอยู่ ovQueue ของระดับไฟล์อยู่ vidShared */
import { type Props } from "./vidShared";
import { useVidBox } from "./useVidBox";
import { useVidPlayback } from "./useVidPlayback";
import { useVidWheel } from "./useVidWheel";
import { useVidLayer } from "./useVidLayer";
import { VidToolbar, VidBar } from "./VidBars";
import { VidView } from "./VidView";

/** ข้อความที่ตาเห็นบนภาพกับชนิดของ props ย้ายไป vidShared.ts ส่งต่อจากที่เดิม (SeDialogs SeTabs VideoMenus import จากที่นี่) */
export { shownText } from "./vidShared";
export type { Props } from "./vidShared";

export default function SubVideo(p: Props) {
  const c0 = useVidBox(p);
  const c1 = { ...c0, ...useVidPlayback(c0) };
  const c2 = { ...c1, ...useVidWheel(c1) };
  const c3 = { ...c2, ...useVidLayer(c2) };
  const pg = c3;
  const { host } = pg;
  return (
    <div className="se-video" ref={host} data-vbox>
      <div className="se-vrow">
        <VidToolbar pg={pg} />
        <VidView pg={pg} />
      </div>
      <VidBar pg={pg} />
    </div>
  );
}
