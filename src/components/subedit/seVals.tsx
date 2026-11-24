/* ค่าที่คิดตอนเปิดเอกสารแล้ว จำนวนบรรทัดที่แก้ กรอบวิดีโอ เลิกทำ เหตุผลปุ่มบันทึก
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { editedCount } from "../../lib/subEdit";
import SubVideo from "./SubVideo";
import { nameOf } from "./editorParts";
import type { SeCtx } from "./seCtx";

export function seVals(pg: SeCtx) {
  const { ask, aud, dl, ev, onCloseVideo, p, sameKind, save, setVdlg, sideKey, st } = pg;
  const doc = pg.doc!;
  const n = editedCount();
  const videoEl = <SubVideo delayMs={dl} doc={doc} ev={ev} audio={aud} name={nameOf(p.video)} onAddMovie={p.onAddMovie} onKey={sideKey}
    onDummy={() => setVdlg("dummy")} onDetails={() => setVdlg("details")} onJump={() => setVdlg("jump")} onClose={onCloseVideo} />;
  const undoTop = st.undo.at(-1), redoTop = st.redo.at(-1);
  const saving = save.s === "saving";
  const saveWhy = !st.dirty && sameKind(doc) ? "ยังไม่ได้แก้อะไร" : undefined;
  const lostOf = ask?.k === "saveas" ? ask.lost : null;
  return { n, videoEl, undoTop, redoTop, saving, saveWhy, lostOf };
}
