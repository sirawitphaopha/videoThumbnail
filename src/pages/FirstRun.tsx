/* ตอนเปิดโปรแกรมครั้งแรก ยังไม่ได้เลือกโฟลเดอร์ (สเปกข้อ 10 ชั้นว่าง · ต้นแบบบรรทัด 1102–1112)
   ไม่มีเมนู · คนละอย่างกับอ่านโฟลเดอร์ไม่สำเร็จ ชั้นว่างคือยังไม่ได้เลือกโฟลเดอร์ */
import { pickFolder } from "../lib/api";
import { useSettings } from "../lib/settings";
import { useLibrary } from "../lib/library";
import { Phr } from "../components/ui";
import { IcFolder } from "../components/icons";

export default function FirstRun() {
  const { update } = useSettings();
  const { scan } = useLibrary();
  const choose = async () => {
    const dir = await pickFolder("เลือกโฟลเดอร์ที่เก็บหนัง");
    if (!dir) return;
    if (await update({ folders: [dir] })) scan();
  };
  return (
    <div className="firstrun">
      <div className="firstrun-card">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e07a9f" strokeWidth="1.6" aria-hidden="true"><path d="M3 20h18M5 20V6h4v14M11 20V4h4v16M17 20l2-12 3 .6-2 11.4" /></svg>
        <div style={{ fontSize: 19, fontWeight: 700 }}>ชั้นยังว่างอยู่</div>
        <div style={{ color: "var(--txt2)", maxWidth: 440, textWrap: "balance" }}><Phr>{"เลือกโฟลเดอร์ที่เก็บหนังไว้ แล้วโปรแกรมจะเรียงทุกเรื่องขึ้นชั้นให้\nโดยไฟล์ในเครื่องไม่ถูกย้ายหรือแก้จนกว่าจะสั่งเอง"}</Phr></div>
        <button type="button" className="btn btn-main" style={{ height: 44, padding: "0 24px" }} onClick={choose}><IcFolder size={15} />เลือกโฟลเดอร์หนัง</button>
      </div>
    </div>
  );
}
