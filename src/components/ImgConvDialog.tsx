/* แปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125 · ตัวทำอยู่ imgconv.rs)
   พี่กันสั่ง 15 พ.ย. 2569 "เอามาก็ดีนะ ตอนระบบแปลงจากซับภาพเป็นซับภาพ" แล้ว "ส่วนของ UXUI เอามาจากเจ้านั้นได้นะ แปลงมา เเละเสริมของเราถ้ามีจุดที่อยากเพิ่ม
   เเละดูว่า subtitle edit หน้า UI เป้นยังไงก็ปรับๆมา"
   หน้าตายกจาก BDSup2Sub++ (bdsup2sub.ui กับ conversiondialog.ui) แถบบนของหน้าต่างหลักคือชนิดผล จานสี ตัวย่อขยาย ภาษาและเกณฑ์ของ VobSub
   หน้าต่าง Conversion Options แบ่งกลุ่มขนาดภาพ ย่อขยายอิสระ อัตราเฟรม เวลา ป้ายบังคับ และหน้าต่าง Move all captions คือการย้ายตำแหน่ง
   ภาพต้นทางกับภาพปลายทางวางคู่กันพร้อมป้ายข้อมูลขนาดจอ ตำแหน่ง เวลา · ของ Subtitle Edit เอาแบบติ๊กเปิดทีละกลุ่ม ปิดแล้วไม่ส่งค่ากลุ่มนั้น
   ส่วนที่ของเราเสริม ภาพปลายทางแปลงจริงทั้งไฟล์ ภาพตัวอย่างจึงตรงผลทุกชนิด รวม VobSub ที่เหลือ 4 สี · ตัวแปลงสำรอง Subtitle Edit · ไม่เขียนทับ · จำค่าที่ตั้ง
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 9) ค่าอยู่ชุด hook imgconv/useIcvState imgconv/useIcvRun ส่วนหน้าจออยู่ imgconv/IcvLeft IcvRight IcvStatus ภาพอยู่ imgconv/IcvImages ค่าตั้งต้นกับคำอธิบาย ⓘ อยู่ imgconv/icvData */
import { imgApi, subDocApi } from "../lib/api";
import Dialog from "./Dialog";
import { Keep } from "./ui";
import { useIcvState, type IcvProps } from "./imgconv/useIcvState";
import { useIcvRun } from "./imgconv/useIcvRun";
import { IcvLeft } from "./imgconv/IcvLeft";
import { IcvRight } from "./imgconv/IcvRight";
import { IcvStatus } from "./imgconv/IcvStatus";

export default function ImgConvDialog(p: IcvProps) {
  const c0 = useIcvState(p);
  const c1 = { ...c0, ...useIcvRun(c0) };
  const pg = c1;
  const { busy, exists, go, out, path, pct, setPath, why } = pg;
  return (
    <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="แปลงซับภาพ" width={1120} height="calc(100vh - 48px)"
      actions={<>
        {busy ? <button type="button" className="btn btn-ghost" onClick={() => void imgApi.cancel()} data-icv-stop>หยุด</button>
          : <button type="button" className="btn btn-ghost" onClick={p.onClose}>{out ? "ปิด" : "ยกเลิก"}</button>}
        {exists && !busy && <button type="button" className="btn btn-ghost" onClick={() => { void subDocApi.freeName(path).then((f2) => { setPath(f2); void go(f2); }); }} data-icv-renum>ตั้งชื่อใหม่ต่อเลข</button>}
        <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) void go(); }} data-icv-go>
          <Keep all={["แปลง", "กำลังแปลง… 100%"]}>{busy ? `กำลังแปลง… ${pct}%` : "แปลง"}</Keep></button>
      </>}>
      <div className="icv" data-icv>
        <div className="icv-cols">
          <IcvLeft pg={pg} />

          <IcvRight pg={pg} />
        </div>

        <IcvStatus pg={pg} />
      </div>
    </Dialog>
  );
}
