/* หน้าต่างถามตอนกดปิดโปรแกรม (แผนขั้น 1 · TECH-REVIEW ข้อ 7 · มอคอัปจับคู่ปก หน้าต่างถาม)
   ฝั่ง Rust กันปิดไว้แล้วส่งเหตุการณ์มา · หน้านี้แค่ถาม · หน้าจอไม่มีสิทธิ์ปิดหน้าต่างเองข้ามตัวกัน
   close-blocked มีงานกำลังทำ · กดยืนยัน = สั่ง force_close ให้หยุดทุกงาน รองานลบไฟล์ที่ทำค้างเอง (ไม่เกิน 20 วินาที) แล้วปิด
   ระหว่างรอ ปุ่มเปลี่ยนเป็นกำลังหยุดงาน กดซ้ำหรือกดทำงานต่อไม่ได้
   close-pairs ไม่มีงาน แต่มีคู่รูปปกที่ยังไม่ยืนยัน (พี่กันเคาะ *"แค่ต้องห้ามด้วยถ้าเผลอปิดโปรแกรม"*) · ปิดโดยไม่ยืนยันก็ไม่หาย คู่ที่รอจดลงไฟล์ไว้แล้ว เปิดมาครั้งหน้ามีแถบทำต่อ */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, inApp } from "../lib/api";
import { runConfirm, useLinkJob } from "../lib/linkJob";
import { autosaveNow, requestSave } from "../lib/subEdit";
import { CardIcon, Keep } from "./ui";
import Dialog from "./Dialog";
import { IbSave, IbStop } from "./icons";

/** รุ่นทดสอบ ตัวตรวจตั้ง window.__closeDry ให้ไม่ปิดจริง จดไว้ที่ window.__closedDry แทน · ตัวจริงไม่มีทางนี้ */
function closeNow() {
  const w = window as unknown as { __closeDry?: boolean; __closedDry?: boolean };
  if (import.meta.env.DEV && w.__closeDry) { w.__closedDry = true; return; }
  void api.forceClose();
}

export default function CloseGuard({ onGoLink, onGoSub }: { onGoLink: () => void; onGoSub: () => void }) {
  /** close-subdirty ซับในหน้าแก้ซับแก้แล้วยังไม่บันทึก (แผนหน้าแก้ซับ ขั้น 2) · ชื่อไฟล์ที่แก้ */
  const [subName, setSubName] = useState<string | null>(null);
  const [subSaving, setSubSaving] = useState(false);
  const [subFailed, setSubFailed] = useState<string | null>(null);
  const [jobs, setJobs] = useState(0);
  /** กดปิดแล้ว ฝั่ง Rust รองานหยุดเองและลบไฟล์ที่ทำค้างก่อนปิด (ไม่เกิน 20 วินาที) */
  const [closing, setClosing] = useState(false);
  const [pairs, setPairs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const job = useLinkJob();
  const waiting = job.reply.waiting;
  const ticked = job.reply.rows.filter((r) => r.ticked && r.status !== "saved" && (r.tall || r.wide)).length;
  const prog = job.run.state === "working" ? job.run.progress : null;

  useEffect(() => {
    if (!inApp) return;
    let live = true;
    const offs: (() => void)[] = [];
    const keep = (u: () => void) => { if (live) offs.push(u); else u(); };
    listen<number>("close-blocked", (e) => setJobs(e.payload || 1)).then(keep);
    listen<number>("close-pairs", () => { setFailed(null); setPairs(true); }).then(keep);
    listen<string>("close-subdirty", (e) => { setSubFailed(null); setSubName(e.payload || "ซับ"); }).then(keep);
    return () => { live = false; offs.forEach((u) => u()); };
  }, []);

  const confirmAndClose = async () => {
    if (saving || ticked === 0) return;
    setSaving(true);
    setFailed(null);
    const r = await runConfirm("ticked");
    setSaving(false);
    if (!r) { setFailed("ยืนยันไม่สำเร็จ ยังไม่ปิดโปรแกรม"); return; }
    if (r.failed) { setFailed(`ยืนยันแล้ว ${r.done} คู่ ไม่สำเร็จ ${r.failed} คู่ ยังไม่ปิดโปรแกรม เหตุผลอยู่ในตารางตรวจผล`); return; }
    setPairs(false);
    closeNow();
  };

  const saveSubAndClose = async () => {
    if (subSaving) return;
    setSubSaving(true);
    setSubFailed(null);
    const ok = await requestSave();
    setSubSaving(false);
    // ยังไม่มีหน้าแก้ซับ หรือต้องเลือกชื่อไฟล์ใหม่ (ซับในหนัง) ไปหน้าแก้ซับให้บันทึกเอง
    if (ok === null) { setSubName(null); onGoSub(); return; }
    if (!ok) { setSubFailed("บันทึกไม่สำเร็จ ยังไม่ปิดโปรแกรม ดูเหตุผลที่หน้าซับไตเติล"); return; }
    setSubName(null);
    closeNow();
  };
  const closeSubWithoutSave = async () => {
    // เก็บฉบับบันทึกอัตโนมัติล่าสุดก่อนปิด เปิดคืนได้จากหน้าซับไตเติล
    await autosaveNow();
    setSubName(null);
    closeNow();
  };

  return (
    <>
      <Dialog
        open={jobs > 0}
        onClose={() => { if (!closing) setJobs(0); }}
        kind="work"
        confirm
        title={`ยังมีงานที่กำลังทำอยู่ ${jobs} งาน`}
        actions={
          <>
            {!closing && <button type="button" className="btn btn-main" onClick={() => setJobs(0)}>ทำงานต่อ</button>}
            {closing
              ? <button type="button" className="btn btn-wait" aria-disabled="true" data-closing>กำลังหยุดงานและลบไฟล์ที่ทำค้าง…</button>
              : <button type="button" className="btn btn-danger" onClick={() => { setClosing(true); api.forceClose(); }}><IbStop size={15} />หยุดงานแล้วปิดโปรแกรม</button>}
          </>
        }
      >
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
          <div>ถ้าปิดตอนนี้ งานจะหยุดกลางทาง</div>
          <div>โปรแกรมรอลบไฟล์ใหม่ที่ทำค้างไว้ก่อนปิด</div>
          <div>ถ้ากำลังเปลี่ยนรูปแนบ รอให้เขียนเสร็จก่อน ไม่กี่วินาที</div>
          <div>ไฟล์หนังเดิมไม่ถูกแตะ</div>
        </div>
      </Dialog>
      <Dialog
        open={pairs && !jobs}
        onClose={() => { if (!saving) setPairs(false); }}
        kind="work"
        confirm
        width={560}
        title={<span data-closepairs>ยังไม่ได้ยืนยัน <span className="nw">{waiting} คู่</span></span>}
        actions={saving ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" data-closepairs-saving><Keep all={["กำลังยืนยัน 000 จาก 000 คู่…", "ยืนยัน 000 คู่ที่ติ๊กแล้วปิด"]}>{prog ? `กำลังยืนยัน ${prog.done} จาก ${prog.total} คู่…` : "กำลังยืนยัน…"}</Keep></button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" data-closepairs-skip onClick={() => { setPairs(false); closeNow(); }}>ปิดโดยไม่ยืนยัน</button>
            <button type="button" className="btn btn-ghost" data-closepairs-back onClick={() => { setPairs(false); onGoLink(); }}>กลับไปดูก่อน</button>
            <button type="button" className={"btn " + (ticked ? "btn-main" : "btn-wait")} aria-disabled={!ticked || undefined} title={ticked ? undefined : "ยังไม่ได้ติ๊กคู่ไหน"} data-closepairs-ok onClick={confirmAndClose}><Keep all={["กำลังยืนยัน 000 จาก 000 คู่…", "ยืนยัน 000 คู่ที่ติ๊กแล้วปิด"]}>{`ยืนยัน ${ticked} คู่ที่ติ๊กแล้วปิด`}</Keep></button>
          </>
        )}
      >
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)", marginBottom: 10 }}>รอยืนยันอยู่ในตารางตรวจผล <span className="nw">{waiting} คู่</span> ติ๊กไว้ <span className="nw">{ticked} คู่</span> ปกยังไม่ขึ้นชั้นวาง</div>
        <div className="stat info" style={{ margin: 0 }}><CardIcon kind="info" /><div>ปิดโดยไม่ยืนยันก็ไม่หาย โปรแกรมจำคู่ที่ติ๊กไว้ เปิดมาครั้งหน้ามีแถบ <b style={{ display: "inline", whiteSpace: "nowrap" }}>ทำต่อ {waiting} คู่ที่ค้างไว้</b></div></div>
        {failed && <div className="hint e" role="alert" style={{ marginTop: 10 }} data-closepairs-failed>{failed}</div>}
      </Dialog>
      <Dialog
        open={!!subName && !jobs && !pairs}
        onClose={() => { if (!subSaving) setSubName(null); }}
        kind="work"
        confirm
        width={560}
        title={<span data-closesub>ซับยังไม่ได้บันทึก</span>}
        actions={subSaving ? (
          <button type="button" className="btn btn-wait" aria-disabled="true" data-closesub-saving><Keep all={["กำลังบันทึก…", "บันทึกแล้วปิด"]}>กำลังบันทึก…</Keep></button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" data-closesub-skip onClick={() => void closeSubWithoutSave()}>ปิดโดยไม่บันทึก</button>
            <button type="button" className="btn btn-ghost" data-closesub-back onClick={() => { setSubName(null); onGoSub(); }}>กลับไปดูก่อน</button>
            <button type="button" className="btn btn-main" data-closesub-ok onClick={() => void saveSubAndClose()}><IbSave size={15} /><Keep all={["กำลังบันทึก…", "บันทึกแล้วปิด"]}>บันทึกแล้วปิด</Keep></button>
          </>
        )}
      >
        <div className="small" style={{ fontSize: 14, color: "var(--txt2)", marginBottom: 10 }} data-closesub-name>แก้ <b style={{ display: "inline" }}>{subName}</b> ไปแล้ว แต่ยังไม่ได้บันทึกลงไฟล์</div>
        <div className="stat info" style={{ margin: 0 }}><CardIcon kind="info" /><div>ถ้าปิดโดยไม่บันทึก โปรแกรมเก็บฉบับบันทึกอัตโนมัติไว้ให้ เปิดคืนได้จากหน้าซับไตเติล</div></div>
        {subFailed && <div className="hint e" role="alert" style={{ marginTop: 10 }} data-closesub-failed>{subFailed}</div>}
      </Dialog>
    </>
  );
}
