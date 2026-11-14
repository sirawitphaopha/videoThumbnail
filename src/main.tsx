// ฟอนต์ Sarabun ฝังในโปรแกรม ไม่โหลดจากเน็ต (น้ำหนักตามต้นแบบ 400 500 600 700)
import "@fontsource/sarabun/thai-400.css";
import "@fontsource/sarabun/thai-500.css";
import "@fontsource/sarabun/thai-600.css";
import "@fontsource/sarabun/thai-700.css";
import "@fontsource/sarabun/latin-400.css";
import "@fontsource/sarabun/latin-500.css";
import "@fontsource/sarabun/latin-600.css";
import "@fontsource/sarabun/latin-700.css";
import "./styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { browserBlocked } from "./lib/browserKeys";
import App from "./App";
import { applySavedTone } from "./lib/tones";

applySavedTone();
// กดเข้าช่องกรอกตัวเลขแล้วคลุมค่าเดิมทั้งหมด พิมพ์ทับได้เลย ทุกช่องตัวเลขในโปรแกรม (inputMode numeric) กับช่องที่ติด data-select-all เช่นรหัส Hex · ช่องค้นหากับช่องชื่อไม่คลุม (พี่กันสั่ง 9 พ.ย. 2569 "ปุ่มกรอก ตอนกดเข้าไปมันจะไฮไลต์เลย" · "เอาทุกจุดในโปรแกรมนะ")
// รอให้เมาส์วางเคอร์เซอร์เสร็จก่อนค่อยคลุม · กดซ้ำตอนอยู่ในช่องแล้วเลื่อนเคอร์เซอร์ได้ตามปกติ
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && (t.inputMode === "numeric" || t.dataset.selectAll != null) && !t.readOnly) setTimeout(() => { if (document.activeElement === t) t.select(); }, 0);
});
// ตัวจริงไม่มีเมนูคลิกขวาของเบราว์เซอร์ (ย้อนกลับ รีเฟรช บันทึกเป็น พิมพ์ เครื่องมือเพิ่มเติม) · รีเฟรชแล้วของที่เลือกไว้หาย บันทึกเป็น html ได้ทั้งหน้า (BUGS ข้อ 28)
// ช่องพิมพ์ยังคลิกขวาคัดลอกวางได้ · ปุ่ม F5 Ctrl+R Ctrl+P Ctrl+S ไม่รีเฟรช ไม่พิมพ์ ไม่บันทึกหน้า (F5 ของหน้าแบบ Bitrate Viewer ยังทำงาน ตัวดักของหน้ายังได้รับ)
// โหมดพัฒนาเก็บไว้ใช้ตรวจ
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => {
    if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true']")) return;
    e.preventDefault();
  });
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    // เทียบรหัสปุ่ม (e.code) ด้วย แป้นเป็นไทย e.key เป็นตัวไทย (Ctrl+R ได้ "พ") แต่เบราว์เซอร์ยังรีเฟรชตามรหัสปุ่ม ที่แก้หาย (ผู้ช่วยตรวจทาน F15)
    const ctrlKey = (e.ctrlKey || e.metaKey) && !e.altKey && (["KeyR", "KeyP", "KeyS"].includes(e.code) || ["r", "p", "s"].includes(k));
    // จดไว้ว่าตัวนี้กันเพื่อเบราว์เซอร์ คีย์ลัดของโปรแกรมที่ใช้ปุ่มเดียวกันยังทำงาน (browserKeys.ts)
    if (e.key === "F5" || e.code === "F5" || e.key === "BrowserRefresh" || ctrlKey) { browserBlocked.add(e); e.preventDefault(); }
  }, true);
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
