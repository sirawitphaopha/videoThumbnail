/* ค่าที่ใช้ตอนเปิดไฟล์แล้ว ป้ายของตัวเลือก ภาพปก ค่าที่ชี้ และจำนวนเฟรมแต่ละชนิด
   แยกจาก BitratePage.tsx (คอมโพเนนต์ BitrateModern) ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 3) เนื้อโค้ดยกมาทั้งก้อน */
import { PKT_MAX, RES_STEPS, Res, kbps } from "./common";
import type { BrCtx } from "./brCtx";

export function openVals(pg: BrCtx) {
  const { S, box, fd, hb, hi, hover, r, st, thumbOf } = pg;
  const path = pg.path!;
  const audioWhy = "แทร็กเสียงคิดได้แบบต่อวินาทีอย่างเดียว เพราะเสียงไม่มีคีย์เฟรมกับชนิดเฟรม I P B";
  // ทีละเฟรมบอกความยาวเฟรมจริงของไฟล์ เช่น FLAC 96 kHz 42.7 ms (BUGS ข้อ 42 ต่อ)
  const fms = r && r.t.length > 1 ? +(fd * 1000).toFixed(fd * 1000 < 10 ? 2 : 1) : 0;
  // ปุ่มขึ้นแค่ ทีละเฟรม ความยาวเฟรมอยู่ท้ายแถวในรายการกับป้ายในกรอบกราฟ ปุ่มแคบลง แถวตัวเลือกมีที่วางวงกลมสี
  const pktLabel = "ทีละเฟรม";
  const resOpts = [...RES_STEPS.map((x) => ({ value: x.value, label: x.label, note: x.note })),
    { value: "pkt" as Res, label: pktLabel, note: fms ? `${fms} ms เนิร์ดสุด` : "เนิร์ดสุด", off: r && r.t.length > PKT_MAX ? `ไฟล์นี้มี ${r.t.length.toLocaleString()} เฟรม มากเกินกว่าจะแสดงทีละเฟรมทั้งไฟล์ ใช้อัตโนมัติแล้วซูมเข้าแทน` : undefined },
    { value: "auto" as Res, label: "อัตโนมัติตามซูม", note: "ซูมเข้าละเอียดขึ้น" }];
  // ปุ่มขึ้นแค่ อัตโนมัติ ระดับที่ใช้อยู่บอกในหัวกราฟ แท่งละ … (แถวตัวเลือกที่หน้าต่าง 1280 ไม่พอ ปุ่มท้ายแถวตกขอบ เจอตอนตรวจ)
  const resShow = (o?: { value: Res; label: string }) => (o?.value === "auto" ? "อัตโนมัติ" : o?.label ?? "");
  const resSizes: string[] = [];
  const th = thumbOf(path);
  const gopAvg = S.keys.length > 1 ? (S.keys[S.keys.length - 1] - S.keys[0]) / (S.keys.length - 1) : 0;
  const tipLeft = hover ? (hover.x > box.w - 220 ? hover.x - 210 : hover.x + 14) : 0;
  const hv = hi >= 0 ? kbps(S.b[hi], S.t1[hi] - S.t0[hi]) : hb?.v ?? 0;
  const pct = (v: number) => (st.avg ? Math.round((v / st.avg - 1) * 100) : 0);
  const typeName: Record<string, string> = { I: "I เฟรม (ภาพเต็ม)", P: "P เฟรม (อ้างภาพก่อนหน้า)", B: "B เฟรม (อ้างทั้งก่อนและหลัง)" };
  const tTotal = st.types.I + st.types.P + st.types.B;
  return { audioWhy, fms, pktLabel, resOpts, resShow, resSizes, th, gopAvg, tipLeft, hv, pct, typeName, tTotal };
}
