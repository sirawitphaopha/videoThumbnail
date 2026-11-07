// เทสปุ่มขยาย คืนขนาด ย่อ ของหน้าต่างชั้นหนัง ดูสถานะจริงจาก Windows (scripts/winstate.ps1)
// ใช้: node scripts/check-window.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 จะ -Built หรือไม่ก็ได้)
//      node scripts/check-window.mjs --front  (เปิดด้วย scripts/dev-app.ps1 -Front แบบขึ้นหน้าจอปกติ เหมือนตัวติดตั้งจริง)
// ผ่านเมื่อ เปิดแบบทดสอบแล้วไม่แย่งโฟกัส · กดขยาย หน้าต่างยังมองเห็นและขยายจริง · กดคืนขนาด ยังมองเห็น · กดย่อ ลงแถบงาน กดที่แถบงานแล้วกลับมา
// ที่มา พี่กันเจอ 7 พ.ย. 2569 *"จริงๆนะะ เรากดขยายจอ เเล้วมันปิดโปรแกรมมมม"* หน้าต่างถูกซ่อน ไม่ได้ปิด (winutil.rs show_behind)
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const PS = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/winstate.ps1"];
const win = (restore = false) => JSON.parse(execFileSync("powershell", restore ? [...PS, "-Restore"] : PS, { encoding: "utf8" }).trim());
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const btn = ".titlebar .ctl button:nth-child(2)";

// --front = โปรแกรมเปิดด้วย scripts/dev-app.ps1 -Front ขึ้นหน้าจอแบบตัวติดตั้งจริง ไม่เช็กเรื่องแย่งโฟกัส
const FRONT = process.argv.includes("--front");
const s0 = win();
if (FRONT) check("เปิดแบบขึ้นหน้าจอปกติ หน้าต่างมองเห็น", s0.visible, JSON.stringify(s0));
else check("เปิดแบบทดสอบ หน้าต่างมองเห็น ไม่แย่งโฟกัสจากงานที่ทำอยู่", s0.visible && !s0.foreground, JSON.stringify(s0));
if (s0.zoomed) { await c.click(btn); await sleep(1000); }
await c.click(btn); await sleep(1000);
const s1 = win();
check("กดปุ่มขยายเต็มจอ หน้าต่างยังมองเห็น และขยายจริง", s1.visible && s1.zoomed, JSON.stringify(s1));
await c.click(btn); await sleep(1000);
const s2 = win();
check("กดปุ่มคืนขนาด หน้าต่างยังมองเห็น และไม่ขยายแล้ว", s2.visible && !s2.zoomed, JSON.stringify(s2));
for (let i = 0; i < 2; i++) { await c.click(btn); await sleep(800); }
const s3 = win();
check("กดขยายกับคืนขนาดซ้ำอีก 2 รอบ หน้าต่างยังมองเห็น", s3.visible && !s3.zoomed, JSON.stringify(s3));
await c.click(".titlebar .ctl button:nth-child(1)"); await sleep(1000);
const s4 = win();
check("กดปุ่มย่อ หน้าต่างลงไปอยู่แถบงาน", s4.iconic, JSON.stringify(s4));
const s5 = win(true);
check("กดที่แถบงาน (คืนหน้าต่าง) หน้าต่างกลับมามองเห็น", s5.visible && !s5.iconic, JSON.stringify(s5));
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
c.close();
process.exit(pass === results.length ? 0 : 1);
