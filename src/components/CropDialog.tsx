/* หน้าต่างครอปรูปโปสเตอร์ (สเปกข้อ 7 · ต้นแบบบรรทัด 847–915)
   ภาพอยู่ในกรอบ 520 × 293 แบบไม่ตัด · กรอบครอปล็อก 2 : 3 เส้นแบ่งสาม มุมจับ 4 มุม นอกกรอบมืด
   ลากกรอบเลื่อน · ลากมุมย่อขยาย · ล้อเมาส์ซูม · แถบซูม 100–400% · หมุนซ้าย หมุนขวา พลิกซ้ายขวา กลับเป็นแบบเดิม
   ตัวอย่างหลังครอป 3 จุด (บนชั้นวาง แผงรายละเอียด ไอคอน Windows · ระบบจับคู่รูปปกมี 2 จุดแรก) วาดจากภาพตัวอย่างทันทีที่ลาก
   ขนาดไฟล์ที่บอกมาจากการเข้ารหัสจริงฝั่ง Rust (poster_render) ไม่ใช่การเดา · รูปเดิมในเครื่องไม่ถูกแก้
   หมุนแล้วพลิก ลำดับเดียวกับฝั่ง Rust (poster_image.rs render) กรอบเป็นสัดส่วนของรูปหลังหมุนและพลิก
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 9) ค่าอยู่ชุด hook crop/useCropState crop/useCropDrag การ์ดอยู่ crop/cropCards ส่วนหน้าจออยู่ crop/CropLeft CropRight ภาพตัวอย่างอยู่ crop/CropPreview ค่าคงที่กับฟังก์ชันล้วนอยู่ crop/cropCalc */
import Dialog from "./Dialog";
import { Keep } from "./ui";
import { IbTick, IcPoster } from "./icons";
import CropSettings from "./CropSettings";
import { SW } from "./crop/cropCalc";
import { useCropState, type CrProps } from "./crop/useCropState";
import { useCropDrag } from "./crop/useCropDrag";
import { cropCards } from "./crop/cropCards";
import { CropLeft } from "./crop/CropLeft";
import { CropRight } from "./crop/CropRight";

/** ค่าครอปที่หน้าเจ้าของได้กลับไป (ย้ายไป crop/cropCalc.ts ส่งต่อจากที่เดิม หน้าอื่น import จากที่นี่) */
export type { CropChoice } from "./crop/cropCalc";

export default function CropDialog(p: CrProps) {
  const c0 = useCropState(p);
  const c1 = { ...c0, ...useCropDrag(c0) };
  const c2 = { ...c1, ...cropCards(c1) };
  const pg = c2;
  const { info, name, pickNew, short, use, useErr, using, wideSlot } = pg;
  return (
    <Dialog open onClose={p.onCancel} width={1000} title={
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span>{p.link ? `ครอปรูปปกของ ${p.link.movie}` : "ครอปรูปโปสเตอร์"}</span>
        <span className="small" style={{ fontWeight: 400, display: "flex", gap: 12 }}><span>{name}</span><span>ขนาด <span className="nw">{info.width} × {info.height} px</span></span><span>{/* พอดีปก บอกเฉพาะช่องปกตั้ง · ช่องปกนอนรูป 2 : 3 ต้องครอปเป็น 16 : 9 อยู่ดี (เจอตอนตรวจภาพ BUGS ข้อ 32) */}{info.aspect === "2 : 3" ? (wideSlot ? "สัดส่วน 2 : 3" : "สัดส่วน 2 : 3 พอดีปก") : /^รูป/.test(info.aspect) ? "เป็น" + info.aspect : info.aspect}</span></span>
      </span>
    } actions={<>
      {useErr && <div className="hint e" role="alert" style={{ margin: "0 auto 0 0", maxWidth: 520 }} data-use-err>{useErr}</div>}
      {/* ปุ่มตั้งค่ารูป ชิดซ้ายใต้รูป (BUGS ข้อ 55 ต่อ) · หน้าครอปของหน้าจับคู่ปกไม่ได้ทำรูปตอนนี้ จึงไม่มีปุ่มนี้ */}
      {!p.link && <div style={{ marginRight: "auto" }}><CropSettings /></div>}
      {/* ซ้ายตรงแนวเนื้อหาฝั่งขวา (รูปใหญ่ 520 บวกระยะกับเส้นแบ่ง 24) */}
      <div style={{ width: `calc(100% - ${SW + 24}px)`, flex: "none", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} data-crop-acts>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-ghost")} aria-disabled={using || undefined} onClick={pickNew} data-new-image><IcPoster size={15} />เลือกรูปใหม่</button>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-ghost")} aria-disabled={using || undefined} onClick={() => { if (!using) p.onCancel(); }}>ยกเลิก</button>
      <button type="button" className={"btn btn-sm " + (using ? "btn-wait" : "btn-main")} aria-disabled={using || undefined} onClick={use} data-use><Keep icon={<IbTick size={15} />} all={["กำลังทำรูป…", "ใช้ค่านี้", "ใช้รูปนี้"]}>{using ? "กำลังทำรูป…" : p.link ? "ใช้ค่านี้" : "ใช้รูปนี้"}</Keep></button>
      </div>
    </>}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", height: p.link ? (short ? 450 : 575) : short ? 458 : 622 }} data-crop>
        <CropLeft pg={pg} />
        <CropRight pg={pg} />
      </div>
    </Dialog>
  );
}
