// การ์ดควรตรวจในแผงขวา กดแล้วไปหน้าตรวจไฟล์พร้อมเลือกเรื่องนี้ ไม่เริ่มตรวจเอง ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-statgo.mjs
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/แผงชั้นวาง";
const NAME = "ดาวเหนือ (2023)";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };

await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
await sleep(700);
if ((await q("return document.querySelector('.book.sel')?.dataset.movie ?? '';")) !== NAME) await c.book(NAME);
await sleep(300);
const card = await q("const e = document.querySelector('[data-statgo]'); if (!e) return null; e.scrollIntoView({ block: 'center' }); return { tag: e.tagName, text: e.innerText, cursor: getComputedStyle(e).cursor, bg: getComputedStyle(e).backgroundColor };");
check("การ์ดเป็นปุ่มกดได้ เคอร์เซอร์เป็นรูปมือ", card?.tag === "BUTTON" && card.cursor === "pointer", JSON.stringify(card));
await sleep(150);
await c.shot(`${OUT}/04-การ์ดกดได้.png`, ".detail");
await c.hover("[data-statgo]");
await sleep(300);
const hoverBg = await q("return getComputedStyle(document.querySelector('[data-statgo]')).backgroundColor;");
check("ชี้แล้วพื้นเปลี่ยน", hoverBg !== card?.bg, `${card?.bg} → ${hoverBg}`);
await c.shot(`${OUT}/05-การ์ดตอนชี้.png`, ".detail");
await c.click("[data-statgo]");
await sleep(800);
const after = await q(`const on = document.querySelector('.nav.on, .nav.active, .nav[aria-current]');
  const row = [...document.querySelectorAll('tr, [role="row"], .ckrow')].find((r) => r.textContent.includes(${JSON.stringify(NAME)}));
  const box = row?.querySelector('input[type="checkbox"], .cb, [role="checkbox"]');
  return { หน้า: on?.textContent.trim(), แถว: !!row, ติ๊ก: box ? (box.checked ?? box.getAttribute('aria-checked')) : null, กำลังตรวจ: !!document.querySelector('[data-check-running], .ckprog') };`);
check("กดแล้วไปหน้าตรวจไฟล์", String(after.หน้า).includes("ตรวจไฟล์"), JSON.stringify(after));
check("เรื่องนี้ถูกเลือกไว้ ไม่เริ่มตรวจเอง", (after.ติ๊ก === true || after.ติ๊ก === "true") && !after.กำลังตรวจ, JSON.stringify(after));
await c.shot(`${OUT}/06-หน้าตรวจหลังกดการ์ด.png`);
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
