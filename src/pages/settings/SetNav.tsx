/* เมนูหัวข้อซ้ายของหน้าตั้งค่า
   แยกจาก SettingsPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import { SET_GROUPS } from "./data";
import type { SetOpen } from "./setCtx";

export default function SetNav({ pg }: { pg: SetOpen }) {
  const { goSec, sec } = pg;
  return (
    <>
      <nav className="setnav" aria-label="หัวข้อตั้งค่า"><div className="setnav-in">
        {SET_GROUPS.map((g) => (
          <div key={g.title} className="setnav-g">
            <div className="setnav-t">{g.title}</div>
            {g.items.map((it) => (
              <button key={it.id} type="button" className={"setnav-b" + (sec === it.id ? " on" : "")} aria-current={sec === it.id ? "true" : undefined} data-setnav={it.id} onClick={() => goSec(it.id)}>{it.icon}<span>{it.label}</span></button>
            ))}
          </div>
        ))}
      </div></nav>
    </>
  );
}
