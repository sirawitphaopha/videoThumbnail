/* ภาพในกรอบครอปที่หมุน พลิก และปรับเอียงแล้ว กับภาพตัวอย่างหลังครอปสามแบบ
   แยกจาก CropDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { thumbUrl, type PosterInfo } from "../../lib/api";
import { SW, SH, tiltScale, layout, type View } from "./cropCalc";

/** ภาพตัวอย่าง หมุนแล้วพลิก วางให้จุดกลางภาพอยู่ที่ originX originY คูณขนาดด้วย k */
export function ImageLayer(p: { info: PosterInfo; view: View; k: number; originX: number; originY: number }) {
  const L = layout(p.info, p.view);
  const w = p.info.width * L.s * p.k, h = p.info.height * L.s * p.k;
  const turn = `${p.view.flip ? "scaleX(-1) " : ""}rotate(${p.view.rotate}deg)`;
  const t = p.view.tilt;
  if (!t) {
    return (
      <img src={thumbUrl(p.info.preview) ?? undefined} alt="" draggable={false}
        style={{ left: p.originX - w / 2, top: p.originY - h / 2, width: w, height: h, transform: turn }} />
    );
  }
  // ปรับเอียง · ขยายให้เต็มกรอบแล้วตัดส่วนเกิน ให้เห็นแบบเดียวกับรูปจริง ไม่มีมุมว่าง
  const fw = L.bw * p.k, fh = L.bh * p.k;
  return (
    <div style={{ position: "absolute", left: p.originX - fw / 2, top: p.originY - fh / 2, width: fw, height: fh, overflow: "hidden" }}>
      <img src={thumbUrl(p.info.preview) ?? undefined} alt="" draggable={false}
        style={{ left: fw / 2 - w / 2, top: fh / 2 - h / 2, width: w, height: h, transform: `rotate(${t}deg) scale(${tiltScale(L.bw, L.bh, t)}) ${turn}` }} />
    </div>
  );
}

/** ตัวอย่างหลังครอปขนาด w × h · ตัด = ส่วนในกรอบเต็มช่อง · เติมขอบ = ทั้งรูปอยู่กลางช่อง ที่ว่างเป็นสีขอบ
    ตามรูปเดิม = สูงเท่าเดิม กว้างตามสัดส่วนรูป (ไม่เกิน 16:9) แบบเดียวกับที่ชั้นวางวาง */
export function Preview(p: { info: PosterInfo; view: View; lay: ReturnType<typeof layout>; mode: "crop" | "pad" | "original"; pad: string; w: number; h: number }) {
  const L = p.lay;
  if (p.mode === "original") {
    // กล่องสูงเท่าแบบอื่น รูปอยู่กลางกล่อง สลับแบบปกแล้วรูปอยู่ตำแหน่งเดิม ไม่กระโดด
    const ar = Math.min(L.bw / L.bh, 16 / 9), h = Math.round(Math.min(p.h, p.w / ar)), w = Math.round(h * ar), k = Math.min(w / L.bw, h / L.bh);
    return <div style={{ width: p.w, height: p.h, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}><div className="pv" style={{ width: w, height: h }}><ImageLayer info={p.info} view={p.view} k={k} originX={w / 2} originY={h / 2} /></div></div>;
  }
  if (p.mode === "pad") {
    const k = Math.min(p.w / L.bw, p.h / L.bh);
    return <div className="pv" style={{ width: p.w, height: p.h, background: p.pad }}><ImageLayer info={p.info} view={p.view} k={k} originX={p.w / 2} originY={p.h / 2} /></div>;
  }
  const k = p.w / L.boxW;
  return (
    <div className="pv" style={{ width: p.w, height: p.h }}>
      <ImageLayer info={p.info} view={p.view} k={k} originX={(SW / 2 - L.boxL) * k} originY={(SH / 2 - L.boxT) * k} />
    </div>
  );
}
