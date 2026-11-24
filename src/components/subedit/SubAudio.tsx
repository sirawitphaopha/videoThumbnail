/* กรอบคลื่นเสียงของหน้าแก้ซับ (แผนหน้าแก้ซับ ขั้น 5 · BUGS ข้อ 109 · แบบ audio_display.cpp กับ audio_timing_dialogue.cpp ของ Aegisub)
   วาด ช่วงของทุกบรรทัดจาง ช่วงของบรรทัดที่เลือกไว้หลายบรรทัดอีกสี ช่วงของบรรทัดที่กำลังแก้เข้ม รูปคลื่นหรือภาพความถี่
     เส้นทุกหนึ่งวินาที เส้น keyframe เส้นตำแหน่งภาพหนังกับช่วงของเฟรม ขอบเริ่ม (แดง) ขอบจบ (น้ำเงิน) เส้นที่กำลังเล่น เส้นตามเมาส์พร้อมเวลา
   ลากเวลา ใกล้ขอบไม่เกิน 8 จุดลากขอบนั้น · กดซ้ายไกลจากขอบ เริ่มช่วงใหม่ที่จุดกดแล้วลากหาจุดจบ · กดขวา ขอบจบมาที่จุดกด
     Ctrl ลากขอบของบรรทัดอื่นที่อยู่ที่เดียวกันไปด้วย · Alt เลื่อนทั้งบรรทัด · Shift ระหว่างลาก ปิดเปิดการดูดติดเส้นชั่วคราว
     ดูดติด keyframe ขอบเฟรมของภาพที่แสดง และขอบของบรรทัดอื่น ระยะ 8 จุด · ปุ่มกลางพาภาพหนังไปเวลานั้น · ปล่อยใกล้ขอบภาพเลื่อนภาพไปหนึ่งในสาม
   ที่ลากไว้ยังไม่ลงบรรทัดจนกดยืนยัน (เปิดยืนยันทันทีแล้วลงเลย) · ล้อเมาส์เลื่อนซ้ายขวา Ctrl กับล้อซูม
   แถบเลื่อนตั้งสามอันทางขวา ซูมแนวนอน ซูมแนวตั้ง ความดัง กับปุ่มโซ่ผูกสองอันหลัง · ลากขอบล่างปรับความสูง จำไว้
   รูปคลื่นขอทีละแผ่น 512 จุด (sub_peaks) เก็บไว้ เลื่อนกลับมาไม่ถอดซ้ำ · ภาพความถี่ขอเฉพาะช่วงที่เห็น (graph_window)
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 10) ค่าอยู่ชุด hook useAudData useAudDraw useAudMouse ส่วนหน้าจออยู่ AudView เมนูเสียงอยู่ AudioMenu ของระดับไฟล์อยู่ audShared */
import { type Props } from "./audShared";
import { useAudData } from "./useAudData";
import { useAudDraw } from "./useAudDraw";
import { useAudMouse } from "./useAudMouse";
import { AudWave, AudSliders } from "./AudView";

export default function SubAudio(p: Props) {
  const c0 = useAudData(p);
  const c1 = { ...c0, ...useAudDraw(c0) };
  const c2 = { ...c1, ...useAudMouse(c1) };
  const pg = c2;
  const { grip, src } = pg;
  if (!src) return <div className="se-audio"><div className="small se-anone" data-se-noaudio>{p.noAudio}</div></div>;

  return (
    <div className="se-audio" data-se-audio>
      <div className="se-arow">
        <AudWave pg={pg} />
        <AudSliders pg={pg} />
      </div>
      <div className="se-grip" onMouseDown={grip} title="ลากขึ้นลงเพื่อปรับความสูงของคลื่นเสียง" role="separator" aria-orientation="horizontal" aria-label="ปรับความสูงของคลื่นเสียง" data-se-grip><i /></div>
    </div>
  );
}
