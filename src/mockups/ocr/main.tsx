/* มอคอัประบบ OCR ซับรูป (BUGS ข้อ 143 ข้อย่อย ㉙ ㉞ · พี่กันสั่ง 16 พ.ย. 2569 "งั้นทำม๊อคอัปกาอนก็ได้ เพราะเราชอบปรับ" · "แต่ไอเดีย ยกจาก subtitles edit")
   โปรแกรมจริงทั้งตัว (src/main.tsx) แล้วเสียบหน้า OCR ที่ยังไม่ได้ลงโปรแกรมเข้าไปในหน้าซับไตเติลจริง
   เปิดผ่าน docs/mockups/theme-live-app.html?ocr=<สภาพ> · หน้าเลือกแบบ docs/mockups/ocr-pick.html พาไปหน้าซับไตเติลแล้วเปิดหนังตัวอย่างให้ */
import "../../main.tsx";
import "./ocr.css";
import { createRoot } from "react-dom/client";
import OcrMock from "./OcrMock";

const host = document.createElement("div");
host.id = "ocrmock-root";
document.body.appendChild(host);
createRoot(host).render(<OcrMock state={new URLSearchParams(location.search).get("ocr") ?? "now"} />);
