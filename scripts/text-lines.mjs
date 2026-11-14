// อ่านว่าข้อความในกล่องบนจอตัดบรรทัดตรงไหน (ไล่ตัวอักษรทีละตัวด้วย Range ดูตำแหน่งแนวตั้ง) · ไว้ตรวจกฎตัดบรรทัดตามความหมายโดยไม่ต้องเพ่งภาพ
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/text-lines.mjs "<ตัวเลือกกล่อง>" [--click "<ตัวเลือกปุ่มที่กดก่อนอ่าน>"] [--size 1280x800]
// ผล หนึ่งย่อหน้าต่อหนึ่งบรรทัดของผล ⏎ คือจุดที่บรรทัดตัด · ทุกจุดต้องอยู่ตรงรอยต่อของความหมาย ไม่ตัดกลางวลีหรือกลางคำประสม
// ข้อความของโปรแกรมตัดบรรทัดได้ทุกเว้นวรรคและทุกขอบคำไทย ก้อนประโยค (.clause) เลิกใช้แล้ว แก้ด้วยการเกลาคำ หรือขึ้นบรรทัดใหม่ (\n) ตรงจุดที่บรรทัดตัดอยู่แล้ว
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

const args = process.argv.slice(2);
const sel = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
if (!sel) { console.log('ใช้: node scripts/text-lines.mjs "<ตัวเลือกกล่อง>" [--click "<ปุ่ม>"] [--size 1280x800]'); process.exit(2); }
const [w, h] = (opt("--size") ?? "1280x800").split("x").map(Number);
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
try {
  if (opt("--click")) { await c.click(opt("--click")); await sleep(500); }
  const lines = await linesOf(q, sel);
  if (!lines) console.log("ไม่เจอกล่อง", sel);
  for (const l of lines ?? []) console.log("•", l);
} finally { await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {}); c.close(); }
