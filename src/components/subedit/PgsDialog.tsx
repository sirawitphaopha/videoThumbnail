/* ส่งออกซับเป็น PGS ซับแบบภาพของ Blu-ray ไฟล์ .sup (BUGS ข้อ 118 · ตัวทำอยู่ pgs.rs)
   ขนาดภาพกับอัตราเฟรมตามหนังที่เปิดอยู่ เลือกขนาดของ Blu-ray เองได้ · ก่อนส่งออกไล่ซับจริงแล้วเตือนสิ่งที่จะเพี้ยนหรือหาย
   (พี่กันสั่ง "เราเข้าใจว่ามันมีข้อจำกัดก็ต้องเตือนด้วย") · ระหว่างทำบอกภาพที่วาดแล้ว หยุดได้ · ชื่อชนถามตั้งชื่อใหม่ต่อเลข ไม่เขียนทับ
   พี่กันสั่ง 14 พ.ย. 2569 "ใส่ตัวสร้าง PGS ตอนที่ส่งออกด้วย ว่ามีกี่ตัว แนะนำตัวไหนที่ดีที่สุด ข้อดีข้อเสีย และขอประโยคตัวอย่างด้วย"
   · "ขอตัวปรับสี ปรับขอบ ความหนาด้วย ถ้าแปลงจาก srt ธรรมดา" · "ถ้าแปลงจาก ass ต้องมีการเทียบสีจริงของ ass กับ PGS ก่อนส่งออก"
   · "ขอส่วนปรับแต่ง PGS ให้ละเอียด เหมือนโปรแกรมที่เป็นตัวอย่าง" (แบบ SUPer กับหน้าต่างส่งออก Blu-ray sup ของ Subtitle Edit)
   ฝั่งซ้ายตั้งค่า ฝั่งขวาภาพตัวอย่าง หน้าต่างสูงคงที่ เนื้อแต่ละฝั่งเลื่อนในตัว · ค่าที่ตั้งจำไว้ในเครื่อง (แคลร์ตั้ง)
   พี่กันสั่ง 15 พ.ย. 2569 "ทำไมเธอแนะนำชั้นหนัง มันคือตัวไหน … เขียนบอกด้วย" · ป้ายภาพบอกนามสกุลต้นทางเป็น PGS · "เขียนขนาดไฟล์ซับที่น่าจะได้ด้วย"
   · "ขอเส้นแบ่งแนวนอนด้วย" · "อยากให้สามารถดูบรรทัดซับจริงได้ ตอนที่ดูตัวอย่าง แต่ระบบพิมพ์ประโยคเทสก็ยังใช้อยู่"
   · ตัวสร้างที่สาม SeConv ของ Subtitle Edit "ใส่หมายเหตุ และภาพตัวอย่างอยู่แล้วว่ามันจะหายหมด แต่ถ้าเอามาแปลงแค่ srt ก็ใช้ได้" · ตัวเลือกของ SeConv "เอามา ให้ครบเลย"
   จัดโครงตามความหมาย 24 พ.ย. 2569 (BUGS ข้อ 155 ขั้น 10) ค่าอยู่ชุด hook usePgsState usePgsRun ส่วนหน้าจออยู่ PgsSetup PgsTune PgsPreview ของระดับไฟล์อยู่ pgsShared */
import { pgsApi, subDocApi } from "../../lib/api";
import Dialog from "../Dialog";
import { Keep } from "../ui";
import FontDialog from "./FontDialog";
import { usePgsState, type PgProps } from "./usePgsState";
import { usePgsRun } from "./usePgsRun";
import { PgsBasics, PgsLook } from "./PgsSetup";
import { PgsTune } from "./PgsTune";
import { PgsRight, PgsStatus } from "./PgsPreview";

export default function PgsDialog(p: PgProps) {
  const c0 = usePgsState(p);
  const c1 = { ...c0, ...usePgsRun(c0) };
  const pg = c1;
  const { busy, exists, font, go, out, path, pct, sample, setFont, setPath, setStyle, style, why } = pg;
  const run = pg.run!;
  return (
    <>
      <Dialog open={p.open} onClose={() => { if (!busy) p.onClose(); }} kind="work" title="ส่งออกเป็น PGS" width={1100} height="min(760px, calc(100vh - 48px))"
        actions={<>
          {busy ? <button type="button" className="btn btn-ghost" onClick={() => void pgsApi.cancel()} data-pgs-stop>หยุด</button>
            : <button type="button" className="btn btn-ghost" onClick={p.onClose}>{out ? "ปิด" : "ยกเลิก"}</button>}
          {exists && !busy && <button type="button" className="btn btn-ghost" onClick={() => { void subDocApi.freeName(path).then((f2) => { setPath(f2); void go(f2); }); }} data-pgs-renum>ตั้งชื่อใหม่ต่อเลข</button>}
          <button type="button" className={"btn " + (why ? "btn-wait" : "btn-main")} aria-disabled={!!why || undefined} title={why} onClick={() => { if (!why) void go(); }} data-pgs-go>
            <Keep all={["ส่งออก", "กำลังส่งออก… 100%", "SUPer กำลังทำไฟล์… 100%", "Subtitle Edit กำลังทำไฟล์…"]}>{!busy ? "ส่งออก" : run.phase === "seconv" ? "Subtitle Edit กำลังทำไฟล์…" : `${run.phase === "super" ? "SUPer กำลังทำไฟล์" : "กำลังส่งออก"}… ${pct}%`}</Keep></button>
        </>}>
        <div className="se-dummy se-cdlg se-pgs" data-pgs>
          <div className="se-pgscols">
            <div className="se-pgsl" data-pgs-left>
              <PgsBasics pg={pg} />

              <PgsLook pg={pg} />

              <PgsTune pg={pg} />
            </div>

            <div className="se-pgsr" data-pgs-right>
              <PgsRight pg={pg} />
            </div>
          </div>

          <PgsStatus pg={pg} />
        </div>
      </Dialog>
      <FontDialog open={font} current={{ name: style.font, size: String(style.size) }} sample={sample} onClose={() => setFont(false)} onApply={() => {}}
        onPick={(name, sz) => setStyle((o) => ({ ...o, font: name, size: parseFloat(sz) || o.size }))} />
    </>
  );
}
