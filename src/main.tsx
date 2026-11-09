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
import App from "./App";
import { applySavedTone } from "./lib/tones";

applySavedTone();
// กดเข้าช่องกรอกตัวเลขแล้วคลุมค่าเดิมทั้งหมด พิมพ์ทับได้เลย ทุกช่องตัวเลขในโปรแกรม (inputMode numeric) กับช่องที่ติด data-select-all เช่นรหัส Hex · ช่องค้นหากับช่องชื่อไม่คลุม (พี่กันสั่ง 9 พ.ย. 2569 "ปุ่มกรอก ตอนกดเข้าไปมันจะไฮไลต์เลย" · "เอาทุกจุดในโปรแกรมนะ")
// รอให้เมาส์วางเคอร์เซอร์เสร็จก่อนค่อยคลุม · กดซ้ำตอนอยู่ในช่องแล้วเลื่อนเคอร์เซอร์ได้ตามปกติ
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t instanceof HTMLInputElement && (t.inputMode === "numeric" || t.dataset.selectAll != null) && !t.readOnly) setTimeout(() => { if (document.activeElement === t) t.select(); }, 0);
});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
