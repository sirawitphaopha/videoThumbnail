/* หน้า 4 ตั้งค่า (ต้นแบบบรรทัด 1002–1100 · สเปกข้อ 9 · ขั้น 7)
   ตั้งแล้วมีผลทันที ไม่ต้องกดบันทึก · สวิตช์ชมพู = เปิด · ค่าเก็บในไฟล์ค่าตั้งของโปรแกรมผ่าน set_settings (store.rs เขียนแบบปลอดภัยมีสำรอง)
   ค่าที่นี่คือค่าตั้งต้น ทุกครั้งที่ใส่โปสเตอร์หรือตรวจไฟล์ยังเปลี่ยนเฉพาะครั้งนั้นได้
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 8) ค่าอยู่ useSetBase useSetChecks ตัวจัดการค่าอยู่ setBits การ์ดอยู่ SetCards* เมนูหัวข้ออยู่ SetNav */
import "../../styles/av.css";
import { Skel } from "../../components/ui";
import { useSetBase } from "./useSetBase";
import { useSetChecks } from "./useSetChecks";
import { setBits } from "./setBits";
import SetNav from "./SetNav";
import SetCardsFiles from "./SetCardsFiles";
import SetCardsLinkAv from "./SetCardsLinkAv";
import SetCardsShelf from "./SetCardsShelf";
import SetCardsMedia from "./SetCardsMedia";
import SetThanks from "./SetThanks";
import SetLines from "./lines/SetLines";
import SetKeys from "./keys/SetKeys";

export default function SettingsPage() {
  const c0 = useSetBase();
  const c1 = { ...c0, ...useSetChecks(c0) };
  const { settings } = c1;
  if (!settings) return <div className="setwrap" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="setcard"><Skel w="40%" h={14} /><Skel w="90%" h={12} style={{ marginTop: 14 }} /><Skel w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>;

  const pg = { ...c1, ...setBits(c1) };
  return (
    <div className="setpage">
      <SetNav pg={pg} />
    <div className="setwrap" data-settings>
      <SetCardsFiles pg={pg} />
      <SetCardsLinkAv pg={pg} />
      <SetCardsShelf pg={pg} />
      <SetCardsMedia pg={pg} />
      <SetThanks pg={pg} />
      <SetKeys pg={pg} />
      <SetLines pg={pg} />
    </div>
    </div>
  );
}
