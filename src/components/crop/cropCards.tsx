/* การ์ดเตือนครอปเหลือน้อย การ์ด PNG ป้ายแปลงชนิดรูป และระยะแถวฝั่งขวา คิดตอนวาดทุกครั้ง (ไม่ใช่ hook)
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon } from "../ui";
import { IcPoster } from "../icons";
import { FORMAT_ROOM } from "./cropCalc";
import type { Cr1 } from "./cropCtx";

export function cropCards(hk: Cr1) {
  const { cropping, format, info, jpgBytes, p, pickNew, pickOrient, render, setSmallOk, short, smallOk } = hk;
  /** การ์ดเตือนครอปเหลือน้อย · PNG ไม่มีตารางคุณภาพ ไปอยู่ที่ว่างฝั่งซ้าย · JPG อยู่ท้ายฝั่งขวา */
  const smallCard = render?.small && !smallOk && cropping ? (
    <div className="stat warn" style={{ alignItems: "center" }} data-small><CardIcon kind="warn" />
      <div style={{ flex: 1, minWidth: 0 }}><b>ครอปเหลือ <span className="nw">{render.cropW} × {render.cropH} px</span></b><div>ปกอาจเบลอ</div></div>
      <span style={{ display: "flex", gap: 6, flex: "none" }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSmallOk(true)}>ใช้ต่อ</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={pickNew}><IcPoster size={15} />เปลี่ยนรูป</button>
      </span>
    </div>
  ) : null;
  const smallLeft = format === "png" && !short && !p.link;
  // PNG ไม่ลดคุณภาพเป็นข้อดี ไม่ใช่คำเตือน ใช้สีตามโทนของโปรแกรม (BUGS ข้อ 8 · พี่กันเคาะ "เปลี่ยนเป็นสีตามธีมโปรแกรมละกัน")
  const pngCard = <div className="stat tone" style={short ? { minHeight: FORMAT_ROOM } : undefined} data-pngnote><CardIcon kind="ok" /><div><b style={short ? { display: "inline" } : undefined}>PNG ไม่ลดคุณภาพ</b>{render && jpgBytes ? <>{short ? " " : <div />}{render.bytes / jpgBytes >= 1.5 ? <>ใหญ่กว่า JPG ราว {Math.round(render.bytes / jpgBytes)} เท่า</> : "ไฟล์ใหญ่กว่า JPG"}</> : null}</div></div>;
  const name = info.name;
  const tag = info.attachable ? null : `.${info.ext}→.${format}`;
  /* หน้าครอปของหน้าใส่โปสเตอร์มีแถว ปก เพิ่ม (ข้อ 58) คอลัมน์ขวาสูงขึ้นจนกล่องเตือนครอปเหลือน้อยโดนแถบปุ่มล่างตัด
     ระยะระหว่างแถว ปก แบบปก ไฟล์รูปที่ได้ ลดราวครึ่ง จากราว 17 เหลือราว 9 จุด แถวแรกยังห่างเส้นแบ่งเท่าเดิม
     (BUGS ข้อ 58 ต่อ พี่กันสั่ง 12 พ.ย. 2569 "เเต่ห้ามให้มันเลื่อนขึ้นบนนะ ไปลดระยะห่างเเทน" · "ลดระยะห่าง สักครึ่งนึ") */
  const edge = short ? 11 : 7, tight = pickOrient ? (short ? 6 : 3) : edge;
  return { smallCard, smallLeft, pngCard, name, tag, edge, tight };
}
