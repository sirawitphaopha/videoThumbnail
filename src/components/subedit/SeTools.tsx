/* แถบเครื่องมือบนสุด แถวบันทึกกับเลิกทำ และแถบแจ้งบันทึกไม่สำเร็จหรือไฟล์ที่อ่านไม่ตรง
   แยกจาก SubEditor.tsx ตอนจัดโครงไฟล์ตามความหมาย (BUGS ข้อ 155 ขั้น 5) เนื้อโค้ดยกมาทั้งก้อน */
import { subDocApi } from "../../lib/api";
import { redo, undo } from "../../lib/subEdit";
import Dropdown from "../Dropdown";
import InfoTip from "../InfoTip";
import { CardIcon, Keep, Phr } from "../ui";
import { IbRedo, IbSave, IbTick, IbUndo, IcClock, IcCollapse, IcExpand, IcFile } from "../icons";
import { padBusy } from "./PadView";
import { CHARSETS, ENC_TIP, nameOf } from "./editorParts";
import type { SeOpen } from "./seCtx";
import { keyLabel } from "../../lib/keymap";

export default function SeTools({ pg }: { pg: SeOpen }) {
  const { doSave, fold, n, openAs, openSaveAs, p, redoTop, sameKind, save, saveWhy, saving, setAutoList, setFold, setSave, st, undoTop } = pg;
  const doc = pg.doc!;
  return (
    <>
      <div className="se-tools" data-se-tools>
        <button type="button" className={"btn btn-ghost btn-sm" + (undoTop ? "" : " btn-wait")} aria-disabled={!undoTop || undefined} title={undoTop ? `เลิกทำ ${undoTop.label} (${keyLabel("sub.undo")})` : "ยังไม่มีอะไรให้เลิกทำ"} onClick={() => undo()} data-se-undo><IbUndo size={15} />เลิกทำ</button>
        <button type="button" className={"btn btn-ghost btn-sm" + (redoTop ? "" : " btn-wait")} aria-disabled={!redoTop || undefined} title={redoTop ? `ทำซ้ำ ${redoTop.label} (${keyLabel("sub.redo")})` : "ยังไม่มีอะไรให้ทำซ้ำ"} onClick={() => redo()} data-se-redo><IbRedo size={15} />ทำซ้ำ</button>
        <span className="se-sep" />
        <span className="se-enc">
          <Dropdown label="รหัสอักษร" value={doc.enc.charset} display={() => `รหัส ${doc.enc.charset}`} sizes={CHARSETS.map((c) => `รหัส ${c}`)}
            options={CHARSETS.map((c) => ({ value: c, label: c }))} onChange={(c) => { if (c !== doc.enc.charset) { if (st.dirty) setSave({ s: "failed", err: "บันทึกหรือเลิกทำการแก้ก่อน แล้วค่อยเปิดด้วยรหัสอื่น ไม่งั้นที่แก้ไว้จะหาย" }); else openAs(c); } }} />
          <InfoTip title="รหัสอักษร" tip={ENC_TIP} />
        </span>
        {p.tab === "aeg" && <button type="button" className={"btn btn-ghost btn-sm" + (fold ? " pressed" : "")} aria-pressed={fold} onClick={() => setFold(!fold)}
          title={fold ? "แสดงภาพหนังกับคลื่นเสียงกลับมา" : "ซ่อนภาพหนังกับคลื่นเสียง ตารางยาวเต็มหน้า คีย์ลัดเสียงยังใช้ได้"} data-se-fold>
          {fold ? <IcExpand size={15} /> : <IcCollapse size={15} />}<Keep all={["ซ่อนภาพและเสียง", "แสดงภาพและเสียง"]}>{fold ? "แสดงภาพและเสียง" : "ซ่อนภาพและเสียง"}</Keep></button>}
        <span style={{ flex: 1 }} />
        <span className="se-state" data-se-state>
          {save.s === "saving" ? "กำลังบันทึก…" : save.s === "done" ? <span className="se-ok"><IbTick size={14} />{save.note ?? "บันทึกแล้ว"}</span>
            : st.dirty ? <span className="se-dirty">{n ? `แก้แล้ว ${n} บรรทัด ยังไม่บันทึก` : "ยังไม่บันทึก"}</span> : st.autosave.at ? `บันทึกอัตโนมัติล่าสุด ${st.autosave.at.slice(11, 16)}` : ""}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => subDocApi.autosaves().then(setAutoList, (e) => setSave({ s: "failed", err: String(e) }))} title="ฉบับที่โปรแกรมบันทึกเองทุก 60 วินาทีระหว่างแก้ เปิดคืนได้" data-se-autos><IcClock size={15} />ฉบับอัตโนมัติ</button>
        <button type="button" className={"btn btn-ghost btn-sm" + (saving ? " btn-wait" : "")} aria-disabled={saving || undefined} onClick={() => !saving && openSaveAs(doc.kind)} title={`บันทึกเป็นไฟล์ใหม่ เลือกชนิดไฟล์ได้ (${keyLabel("sub.save-as")})`} data-se-saveas><IcFile size={15} />บันทึกเป็นไฟล์ใหม่</button>
        <button type="button" className={"btn btn-sm " + (saving || saveWhy ? "btn-wait" : "btn-main")} aria-disabled={saving || !!saveWhy || undefined}
          title={saveWhy ?? (sameKind(doc) ? `บันทึกทับ ${nameOf(doc.source!.path)} ไฟล์เดิมลงถังขยะ (${keyLabel("sub.save")})` : "ซับนี้ยังไม่มีไฟล์ของตัวเอง ต้องบันทึกเป็นไฟล์ใหม่")}
          onClick={() => { if (!saving && (!saveWhy || padBusy())) void doSave(); }} data-se-save>
          <IbSave size={15} /><Keep all={["บันทึก", "กำลังบันทึก…"]}>{saving ? "กำลังบันทึก…" : "บันทึก"}</Keep>
        </button>
      </div>
      {save.s === "failed" && <div className="stat bad se-saveerr" role="alert" data-se-saveerr><CardIcon kind="bad" /><div style={{ flex: 1 }}><b>บันทึกไม่สำเร็จ</b><Phr>{save.err}</Phr><div className="minirow"><button type="button" className="btn btn-ghost btn-sm" onClick={() => setSave({ s: "idle" })}>ปิด</button></div></div></div>}
      {(!doc.exact || doc.bad > 0) && <div className="stat warn se-note" data-se-inexact><CardIcon kind="warn" /><div><Phr>{[!doc.exact ? `ไฟล์นี้มีตัวอักษรที่รหัส ${doc.enc.charset} อ่านไม่ออก บันทึกแล้วตัวนั้นจะเปลี่ยน ถ้าภาษาไทยขึ้นผิด ลองเปิดด้วยรหัสอื่น` : "", doc.bad > 0 ? `มี ${doc.bad} บรรทัดที่อ่านไม่ออก ไม่ขึ้นในตารางแต่ยังอยู่ในไฟล์ตอนบันทึก` : ""].filter(Boolean).join("  ")}</Phr></div></div>}

    </>
  );
}
