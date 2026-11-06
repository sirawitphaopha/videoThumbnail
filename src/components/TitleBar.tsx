/* แถบชื่อที่วาดเอง สูง 34 ตามต้นแบบ · หน้าต่างตั้ง decorations:false ไว้ใน tauri.conf.json
   🔴 ติดป้ายลากหน้าต่างที่ตัวแถบและข้อความชื่อด้วย เพราะป้ายไม่ส่งต่อถึงของข้างใน · ห้ามติดที่ปุ่ม (TECH-REVIEW ข้อ 7)
   ปุ่มปิดเรียก close() ซึ่งผ่านตัวกันปิดฝั่ง Rust ทางเดียวกับ Alt+F4 */
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inApp } from "../lib/api";
import { TbClose, TbMax, TbMin, TbRestore } from "./icons";

export default function TitleBar() {
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    if (!inApp) return;
    const w = getCurrentWindow();
    let off: (() => void) | undefined;
    w.isMaximized().then(setMaxed).catch(() => {});
    w.onResized(() => { w.isMaximized().then(setMaxed).catch(() => {}); }).then((u) => { off = u; });
    return () => off?.();
  }, []);

  const win = () => (inApp ? getCurrentWindow() : null);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="ttl-text" data-tauri-drag-region>ชั้นหนัง</span>
      <div className="ctl">
        <button type="button" aria-label="ย่อหน้าต่าง" title="ย่อหน้าต่าง" onClick={() => win()?.minimize()}>
          <TbMin />
        </button>
        <button
          type="button"
          aria-label={maxed ? "คืนขนาดหน้าต่าง" : "ขยายเต็มจอ"}
          title={maxed ? "คืนขนาดหน้าต่าง" : "ขยายเต็มจอ"}
          onClick={() => win()?.toggleMaximize()}
        >
          {maxed ? <TbRestore /> : <TbMax />}
        </button>
        <button type="button" className="close" aria-label="ปิดโปรแกรม" title="ปิดโปรแกรม" onClick={() => win()?.close()}>
          <TbClose />
        </button>
      </div>
    </header>
  );
}
