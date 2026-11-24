/* หน้ากราฟเสียงตอนอ่านไฟล์ไม่ได้ กับตอนกำลังอ่าน
   แยกจาก GraphPage.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 4) เนื้อโค้ดยกมาทั้งก้อน */
import { graphApi } from "../../lib/api";
import { IbStop, IcRefresh } from "../../components/icons";
import { LoadLanes } from "./common";
import { Elapsed } from "./compareParts";
import type { B3 } from "./graphCtx";

export function errorView({ pg }: { pg: B3 }) {
  const { head, setNonce, tagDlg } = pg;
  const error = pg.error!;
    const stopped = error === "หยุดอ่านเสียงแล้ว";
    return (
      <div className="ag" data-graph>{head}{tagDlg}
        <div className={"stat " + (stopped ? "info" : "bad")} data-grapherror>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.5" /></svg>
          <div><b>{error}</b>{stopped ? "ยังไม่ได้วาดกราฟ กดอ่านใหม่เพื่อเริ่มอีกครั้ง" : error.includes("ไม่มีแทร็กเสียง") ? "วิดีโออัดหน้าจอบางแบบไม่ได้อัดเสียงไว้" : "ลองเปิดไฟล์อื่น หรือตรวจไฟล์นี้ที่หน้าตรวจไฟล์"}
            {!error.includes("ไม่มีแทร็กเสียง") && <div style={{ marginTop: 8 }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => setNonce((n) => n + 1)} data-graphretry><IcRefresh size={15} />อ่านใหม่</button></div>}</div>
        </div>
      </div>
    );
}


export function loadingView({ pg }: { pg: B3 }) {
  const { ctl, head, names, panel, prefs, progress, readSince, tagDlg, view } = pg;
    // ตอนโหลดใช้โครงเดียวกับหน้าที่มีกราฟ (data-graphview) กรอบสูงเต็มจอ เส้นแบ่งแผงซ้ายอยู่ตลอด โครงจางเต็มความสูงรูปเดียวกับแถบช่อง
    // (BUGS ข้อ 75 · พี่กันทัก 13 พ.ย. 2569 "ตอนเราให้มันโหลดกราฟ หน้ากระดูดมันควรหญ่กว่านี้ เเล้วเส้นเเย่งข้อมูลฝั่งซ้ายันหายไป")
    return (
      <div className="ag" data-graph data-graphview={view} data-graphloadview><div className="agstick">{head}{ctl}</div>{tagDlg}
        <div className={"agb" + (prefs.wide ? " wide" : "")}>{prefs.wide ? null : panel}
          <div className="plot" data-graphloading>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 13.5 }}>อ่านเสียง {names.length || ""} ช่อง <b>{Math.round(progress ?? 0)}%</b> <Elapsed since={readSince} /></div>
              <button type="button" className="btn btn-bad btn-sm" onClick={() => graphApi.cancel()}><IbStop size={15} />หยุด</button>
            </div>
            <div className="bar"><i style={{ width: `${progress ?? 0}%` }} /></div>
            <LoadLanes n={names.length || 2} />
            <div className="small" style={{ marginTop: 8 }}>อ่านเฉพาะเสียงโดยไม่ถอดภาพ อ่านครั้งเดียวแล้วเปิดซ้ำขึ้นทันที และไฟล์ไม่ถูกแก้</div>
          </div>
        </div>
      </div>
    );
}
