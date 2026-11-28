/* หัวข้อเมนูคลิกขวาในหน้าตั้งค่า (BUGS ข้อ 164.5 · พี่กันสั่ง "สร้างหน้าตั้งค่าเรื่องคลิกขวาด้วย ว่าอยากเพิ่มลดอะไร")
   ทุกเมนูในทะเบียน lib/ctxMenus.ts เรียงทีละเมนู บอกว่าคลิกขวาตรงไหน แล้วติ๊กข้อที่ให้ขึ้นในเมนู ติ๊กออกคือซ่อน
   เก็บในเครื่อง มีผลทันทีครั้งถัดไปที่คลิกขวา · ปุ่มกลับค่าตั้งต้นแสดงทุกข้อ */
import { Phr } from "../../components/ui";
import { IcRefresh } from "../../components/icons";
import { MENUS, isShown, resetShown, setShown, useCtxHidden } from "../../lib/ctxMenus";
import type { SetOpen } from "./setCtx";

export default function SetCtxMenus({ pg }: { pg: SetOpen }) {
  const { sec } = pg;
  const hidden = useCtxHidden();
  const none = Object.keys(hidden).length === 0;
  return (
    <div className="setcard" data-setcard="ctxmenu" hidden={sec !== "ctxmenu"}>
      <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span>เมนูคลิกขวา</span>
        <button type="button" className={"btn btn-sm " + (none ? "btn-wait" : "btn-ghost")} aria-disabled={none || undefined} title={none ? "แสดงทุกข้อของทุกเมนูอยู่แล้ว" : undefined}
          onClick={() => { if (!none) resetShown(); }} data-ctx-reset><IcRefresh size={15} />แสดงทุกข้อ</button></h3>
      <div className="small" style={{ marginBottom: 6 }}><Phr>ติ๊กข้อที่อยากให้ขึ้นในเมนู ติ๊กออกเพื่อซ่อน ส่วนข้อที่ทำไม่ได้กับเรื่องนั้นยังขึ้นจางพร้อมบอกเหตุผลเหมือนเดิม</Phr></div>
      {MENUS.map((m) => (
        <div key={m.id} className="ctxset" data-ctxset={m.id}>
          <div className="imghead">{m.title}</div>
          <div className="small" style={{ marginBottom: 6 }}><Phr>{m.where}</Phr></div>
          <div className="ctxgrid">
            {m.items.map((it) => {
              const on = isShown(m.id, it.id);
              return (
                <button key={it.id} type="button" role="checkbox" aria-checked={on} className="chk ctxchk" onClick={() => setShown(m.id, it.id, !on)} data-ctxitem={`${m.id}:${it.id}`}>
                  <span className={"box" + (on ? " on" : "")} aria-hidden="true">{on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}</span>
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
