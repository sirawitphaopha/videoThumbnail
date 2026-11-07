/* หน้าต่างถามตอนกดปิดโปรแกรมขณะมีงานกำลังทำ (แผนขั้น 1 · TECH-REVIEW ข้อ 7)
   ฝั่ง Rust กันปิดไว้แล้วส่งเหตุการณ์ close-blocked มา · หน้านี้แค่ถาม
   กดยืนยัน = สั่ง force_close ฝั่ง Rust ให้หยุดทุกงาน รองานลบไฟล์ที่ทำค้างเอง (ไม่เกิน 20 วินาที) แล้วปิด
   ระหว่างรอ ปุ่มเปลี่ยนเป็นกำลังหยุดงาน กดซ้ำหรือกดทำงานต่อไม่ได้ · หน้าจอไม่มีสิทธิ์ปิดหน้าต่างเองข้ามตัวกัน */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, inApp } from "../lib/api";
import Dialog from "./Dialog";

export default function CloseGuard() {
  const [jobs, setJobs] = useState(0);
  /** กดปิดแล้ว ฝั่ง Rust รองานหยุดเองและลบไฟล์ที่ทำค้างก่อนปิด (ไม่เกิน 20 วินาที) */
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    listen<number>("close-blocked", (e) => setJobs(e.payload || 1)).then((u) => { off = u; });
    return () => off?.();
  }, []);

  return (
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
            : <button type="button" className="btn btn-danger" onClick={() => { setClosing(true); api.forceClose(); }}>หยุดงานแล้วปิดโปรแกรม</button>}
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
  );
}
