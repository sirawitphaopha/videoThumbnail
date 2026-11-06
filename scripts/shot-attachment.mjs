// ถ่ายภาพหัวข้อ Attachment ในหน้าข้อมูลไฟล์ (ขั้น 5 · File name · MIME type · Size · Dimensions ตามต้นแบบ)
// ใช้: โปรแกรมเปิดผ่าน scripts/dev-app.ps1 · รัน check-stage5.mjs ก่อน (โฟลเดอร์ทดสอบมี Harbor Lights ที่มีปก)
import { connect, sleep } from "./lib/cdp-client.mjs";

const DIR = "D:\\dev\\tmp\\ชั้นข้อมูลไฟล์";
const OUT = "docs/report-2026-11-06/ขั้น5/11-ไฟล์แนบ.png";
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
await c.evaluate(`window.__TAURI_INTERNALS__.invoke("set_settings", { patch: { folders: [${JSON.stringify(DIR)}] } })`);
await c.evaluate("location.reload()"); await sleep(2500);
await c.click('.book[data-movie="Harbor Lights (2021)"]'); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('ข้อมูลไฟล์')).click()");
for (let i = 0; i < 60 && !(await q("return !!document.querySelector('[data-mi]')")); i++) await sleep(150);
// หัวข้อ Attachment กับแถวข้างใต้จนถึงหัวข้อถัดไป
const r = await q(`
  const heads = [...document.querySelectorAll('[data-mi] .mih')];
  const h = heads.find((e) => e.innerText.includes('Attachment'));
  if (!h) return null;
  h.scrollIntoView({ block: 'center' });
  const rows = [];
  for (let n = h.nextElementSibling; n && !n.classList.contains('mih'); n = n.nextElementSibling) rows.push(n);
  const all = [h, ...rows].map((e) => e.getBoundingClientRect());
  const top = Math.min(...all.map((b) => b.top)), bottom = Math.max(...all.map((b) => b.bottom));
  const left = Math.min(...all.map((b) => b.left)), right = Math.max(...all.map((b) => b.right));
  return { x: left - 12, y: top, w: right - left + 24, h: bottom - top + 10, text: rows.map((e) => e.innerText.replace(/\\s+/g, ' ')).join(' | ') };
`);
console.log(JSON.stringify(r));
if (r) {
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 700 }); await sleep(250);
  await c.shotRect(OUT, r.x, r.y, r.w, r.h);
  console.log("ถ่ายแล้ว " + OUT);
}
await c.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'กลับไปชั้นวาง')?.click()");
c.close();
