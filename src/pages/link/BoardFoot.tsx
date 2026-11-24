/* แถบล่างของกระดานกับหน้าต่างยืนยันเอาโฟลเดอร์ออก
   แยกจาก LinkBoard.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 8) เนื้อโค้ดยกมาทั้งก้อน */
import Dialog from "../../components/Dialog";
import { Keep, Phr } from "../../components/ui";
import { thumbUrl } from "../../lib/api/index";
import { setLinkJob, thumbOf } from "../../lib/linkJob";
import { IbTrash, IbBack } from "../../components/icons";
import { COUNT } from "./boardShared";
import type { BoCtx } from "./boardCtx";

export default function BoardFoot({ pg }: { pg: BoCtx }) {
  const { drag, dragImg, removeMovieFolder, removing, setRemoving, waitingManual } = pg;
  return (
    <>
      <div className="linkfoot">
        <span className="small" style={{ flex: 1, minWidth: 0 }}><Phr>ใช้คีย์บอร์ดได้ กดลูกศรเลือกรูปแล้วกด Enter จากนั้นกด Tab ไปฝั่งหนังแล้วกด Enter เพื่อจับคู่ และกด Ctrl+Z เพื่อย้อน คู่ที่จับบนกระดานยังไม่บันทึก แต่จะไปรอยืนยันที่ตาราง</Phr></span>
        <button type="button" className="btn btn-main" data-board-back onClick={() => setLinkJob({ view: "table" })}><Keep icon={<IbBack size={15} />} all={["กลับตารางตรวจผล (จับคู่ไว้ 000 คู่)"]}>กลับตารางตรวจผล{waitingManual ? ` (จับคู่ไว้ ${COUNT(waitingManual)} คู่)` : ""}</Keep></button>
      </div>
      {dragImg && drag && (
        <div className="bghost" style={{ left: drag.x + 10, top: drag.y + 10 }} data-board-ghost>
          {thumbUrl(thumbOf(dragImg)) ? <img src={thumbUrl(thumbOf(dragImg)) ?? undefined} alt="" draggable={false} /> : <span className="lthumb none" />}
        </div>
      )}
      <Dialog open={!!removing} onClose={() => setRemoving(null)} kind="work" confirm title="เอาโฟลเดอร์นี้ออกจากชั้นวางไหม"
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>ไม่เอาออก</button>
          <button type="button" className="btn btn-danger" data-board-rm-yes onClick={() => { if (removing) removeMovieFolder(removing); }}><IbTrash size={15} />เอาออกจากชั้น</button>
        </>}>
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div style={{ wordBreak: "break-all" }}>{removing}</div>
          <div>หนังในโฟลเดอร์นี้จะหายจากชั้นวาง ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ</div>
        </div>
      </Dialog>
    </>
  );
}
