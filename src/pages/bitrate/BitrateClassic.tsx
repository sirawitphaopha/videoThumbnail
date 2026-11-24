/* หน้าบิตเรตวิดีโอ แบบ Bitrate Viewer
   พี่กันสั่ง 9 พ.ย. 2569 "สร้าง bitrate viewer จากรูปที่ให้ไป UI UX เหมือนกันขึ้นมาเลย เอาใส่สักหน้านึงในโปรแกรมก่อน ค่อยย้าย"
   · "ตอนที่มันรัน มันจะค่อย ๆ อ่านจากซ้ายมาขวานะ" · "ระบบอ่าน bitrate แปลงจาก ffmpeg เลย"
   10 พ.ย. 2569 หลังแกะตัวจริงรุ่น 2.3 พี่กันสั่ง "แปลงระบบการรันบิตเรต ตามเขาเลย และ UXUI ก็เอาตามเขา" · "เอามาให้หมด ปรับเป็นของเรา"
   ทำตามคู่มือของตัวจริง (vendor/bitrate-viewer/แกะ/)
   - วิธีคิด 4 แบบ ต่อวินาที Ctrl+S · ต่อ GOP Ctrl+G · GOP แบบถ่วง Ctrl+X · ต่อเฟรม Ctrl+F · ป้ายวิธีอยู่ใต้ชนิดไฟล์ทางซ้าย
   - จำผลของไฟล์ที่อ่านแล้ว สลับวิธีไม่ต้องอ่านใหม่ · F5 อ่านใหม่ · ต่อเฟรมต้องถอดภาพเอาชนิดเฟรม จึงอ่านอีกรอบครั้งแรก
   - ซูม ลากเลือกช่วงแล้วคลิกขวาเข้าไป ซ้อนได้ · ล้อขึ้นถอยออกหนึ่งชั้น ล้อลงซูมเข้าครึ่งหนึ่งตรงเมาส์ · คลิกซ้ายยกเลิกช่วงที่เลือก
   - Ctrl+คลิก เส้นค่าเฉลี่ยสีเขียว · Shift+คลิก เส้นค่าสูงสุดสีน้ำตาล · Alt+คลิก เส้นค่าต่ำสุดสีน้ำเงิน · สามปุ่มพร้อมกันสลับทั้งสามเส้น
   - Shift+คลิกขวา สลับสีไล่โทน · Ctrl+คลิกขวา หยุดหรือให้เคอร์เซอร์ตามเมาส์ · Alt+คลิกขวา ซ่อนเส้นเคอร์เซอร์ · ดับเบิลคลิก ปรับสเกลตามข้อมูล
   - ขีดล่างสีแดงตรงจุดสูงสุด สีดำตรงจุดต่ำสุด · เมาส์อยู่แถบบนของกราฟ ขึ้นขีดทุก 5% ของความกว้าง
   - ต่อเฟรม ชนิดเฟรมขึ้นข้างเวลาเคอร์เซอร์ กดแล้วกระโดดไป I เฟรมถัดไป Ctrl+กด ย้อนไป I เฟรมก่อน
   - Ctrl+Alt+Shift+คลิกขวา ซูมให้หนึ่งช่องเท่าหนึ่งจุดภาพตรงตำแหน่งที่คลิก (คู่มือตัวจริง "Enter zoom at 1 sample/display unit at current position")
   ปรับเป็นของเรา · เส้นแดง Max คิดจากบิตเรตเฉลี่ยของไฟล์ ไม่ตายตัว 10,000 kbps แบบแผ่น DVD (ไฟล์ HEVC บิตเรตต่ำกว่านั้นมาก)
   · เว้นช่องระหว่างแท่งเมื่อแท่งกว้างพอ ปิดได้ในเมนู Separate bars (พี่กันสั่ง 10 พ.ย. 2569 "ต้นฉบับ เราขอเเบ่งเเท่งตามวิด้วยหน่อย" BUGS ข้อ 44)
   · ทุกแถวเมนูมีคำอธิบายภาษาไทยในแถบท้ายเมนู (พี่กันสั่ง 10 พ.ย. 2569 "อยากให้มีคำอธิบายทุกฟังชั่นด้วย" BUGS ข้อ 36)
   สีวัดจากภาพหน้าจอตัวจริง · สีเป็นเนื้อหา ไม่เปลี่ยนตามโทน · สีที่วาดและ inline อยู่ในไฟล์นี้ รากของหน้าติด data-keepcolor ตัวแปลงโทนไม่แตะ
   สีของปุ่มกับเมนูอยู่ styles/bitrate-classic.css เขียนด้วย hsl() (แท็ก style ที่สร้างตอนรันโดนกติกาความปลอดภัยของตัวจริงกัน AUDIT ข้อ 27)
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 7) ค่าและงานอยู่ชุด hook useBv*.ts ส่วนหน้าจออยู่ BvTop BvPlot */
import { C, FONT } from "./classicParts";
import "../../styles/bitrate-classic.css";
import { useBvState, type BvProps } from "./useBvState";
import { useBvData } from "./useBvData";
import { useBvStats } from "./useBvStats";
import { useBvPlot } from "./useBvPlot";
import { useBvView } from "./useBvView";
import BvTop from "./BvTop";
import BvPlot from "./BvPlot";


/** แบบเดิม หน้าตาแบบโปรแกรม Bitrate Viewer · onModern สลับไปแบบชั้นหนัง ไฟล์ที่เปิดอยู่ตามไปด้วย */
export default function BitrateClassic(p: BvProps = {}) {
  const v0 = useBvState(p);
  const v1 = { ...v0, ...useBvData(v0) };
  const v2 = { ...v1, ...useBvStats(v1) };
  const v3 = { ...v2, ...useBvPlot(v2) };
  const pg = { ...v3, ...useBvView(v3) };
  return (
    <div data-bitrate data-keepcolor style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.win, color: C.text, fontFamily: FONT, fontSize: 12.5, padding: "12px 14px 12px 6px", gap: 8 }}>
      <BvTop pg={pg} />
      <BvPlot pg={pg} />
    </div>
  );
}
