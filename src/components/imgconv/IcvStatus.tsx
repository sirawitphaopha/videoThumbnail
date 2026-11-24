/* แถบสถานะท้ายหน้าต่างแปลงซับภาพ ความคืบหน้า ชื่อไฟล์ชน แปลงไม่สำเร็จ และแปลงแล้ว
   แยกจาก ImgConvDialog.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 9) เนื้อโค้ดยกมาทั้งก้อน */
import { CardIcon, Phr } from "../ui";
import { IcFolder } from "../icons";
import { nameOf, fsize } from "./icvData";
import type { IcvCtx } from "./icvCtx";

export function IcvStatus({ pg }: { pg: IcvCtx }) {
  const { busy, err, exists, out, path, pct, reveal } = pg;
  const run = pg.run!;
  return (
    <>
        {(busy || exists || err || out) && <div className="icv-stat" data-icv-status>
          {busy && <div className="icv-row"><div className="icv-prog" data-icv-prog><div style={{ width: `${pct}%` }} /></div>
            <span className="small">{run.total ? `แปลงภาพที่ ${run.done.toLocaleString("en-US")} จาก ${run.total.toLocaleString("en-US")}` : "กำลังเริ่ม…"}</span></div>}
          {exists && <div className="small icv-bad" data-icv-exists><Phr>{`มีไฟล์ชื่อ ${nameOf(path)} อยู่แล้ว โปรแกรมจึงไม่เขียนทับ กดตั้งชื่อใหม่ต่อเลข หรือเลือกที่เก็บใหม่`}</Phr></div>}
          {err && <div className="stat bad" style={{ margin: 0 }} role="alert" data-icv-err><CardIcon kind="bad" /><div><b>แปลงไม่สำเร็จ</b><Phr>{err}</Phr></div></div>}
          {out && <div className="stat ok" style={{ margin: 0 }} data-icv-done><CardIcon kind="ok" /><div style={{ flex: 1, minWidth: 0 }}>
            <b>{`แปลงแล้ว ${out.files.map(nameOf).join(" กับ ")}`}</b>
            <Phr>{`ได้ ${out.images.toLocaleString("en-US")} ภาพ ไฟล์ขนาด ${fsize(out.bytes)}${out.w ? ` จอ ${out.w} × ${out.h}` : ""}`}</Phr>
            <div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => reveal(out.files[0])} data-icv-reveal><IcFolder size={15} />เปิดโฟลเดอร์</button></div>
          </div></div>}
        </div>}
    </>
  );
}
