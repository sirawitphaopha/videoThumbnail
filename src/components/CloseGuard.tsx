/* หน้าต่างถามตอนกดปิดโปรแกรมขณะมีงานกำลังทำ (แผนขั้น 1 · TECH-REVIEW ข้อ 7)
   ฝั่ง Rust กันปิดไว้แล้วส่งเหตุการณ์ close-blocked มา · หน้านี้แค่ถาม
   กดยืนยัน = สั่ง force_close ฝั่ง Rust ให้หยุดทุกงานแล้วปิด · หน้าจอไม่มีสิทธิ์ปิดหน้าต่างเองข้ามตัวกัน */
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api, inApp } from "../lib/api";
import Dialog from "./Dialog";

export default function CloseGuard() {
  const [jobs, setJobs] = useState(0);

  useEffect(() => {
    if (!inApp) return;
    let off: (() => void) | undefined;
    listen<number>("close-blocked", (e) => setJobs(e.payload || 1)).then((u) => { off = u; });
    return () => off?.();
  }, []);

  return (
    <Dialog
      open={jobs > 0}
      onClose={() => setJobs(0)}
      kind="work"
      confirm
      title={`ยังมีงานที่กำลังทำอยู่ ${jobs} งาน`}
      actions={
        <>
          <button type="button" className="btn btn-main" onClick={() => setJobs(0)}>ทำงานต่อ</button>
          <button type="button" className="btn btn-danger" onClick={() => api.forceClose()}>หยุดงานแล้วปิดโปรแกรม</button>
        </>
      }
    >
      <div className="small" style={{ fontSize: 14, color: "var(--txt2)" }}>
        <div>ถ้าปิดตอนนี้ งานจะหยุดกลางทาง ไฟล์ใหม่ที่ทำค้างไว้ถูกลบทิ้ง</div>
        <div>ไฟล์หนังเดิมไม่ถูกแตะ</div>
      </div>
    </Dialog>
  );
}
