// แผงขวาของชั้นวาง สถานะที่ชุดทดสอบไม่มีมาเอง ใช้: node scripts/check-panel-states.mjs หลัง check-panel.mjs
// ตรวจละเอียดไฟล์ทดสอบ ขาดท้าย (2022) จริงให้ขึ้นการ์ดไฟล์เสียหาย · การ์ดปกจับคู่ชุดทดสอบไม่มี ใส่ปุ่มชุดเดียวกันชั่วคราววัดแล้วเอาออก ไม่ได้แตะไฟล์หนัง
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/แผงชั้นวาง";
const NAME = "ขาดท้าย (2022)";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(600); };
const open = async () => { if ((await q("return document.querySelector('.book.sel')?.dataset.movie ?? '';")) !== NAME) await c.book(NAME); await sleep(300); };
const measure = (sel) => q(`const r2 = (v) => Math.round(v * 10) / 10;
  return [...document.querySelectorAll(${JSON.stringify(sel)})].map((b) => { const x = b.getBoundingClientRect(), s = b.querySelector('svg')?.getBoundingClientRect(); return { t: b.textContent.trim(), left: r2(x.left), w: r2(x.width), icon: s ? r2(s.left - x.left) : null, over: b.scrollWidth > b.clientWidth, wide: b.classList.contains('wide') }; });`);

await nav("ชั้นวางหนัง");
await open();
if (!(await q("return (document.querySelector('.detail .stat b')?.innerText ?? '').includes('ไฟล์เสียหาย');"))) {
  await q("[...document.querySelectorAll('.detail .minirow .btn')].find((b) => b.textContent.includes('ตรวจละเอียด')).click();");
  const t = Date.now();
  while (Date.now() - t < 120000) {
    await sleep(1500);
    await nav("ชั้นวางหนัง");
    await open();
    if (await q("return (document.querySelector('.detail .stat b')?.innerText ?? '').includes('ไฟล์เสียหาย');")) break;
    await nav("ตรวจไฟล์");
  }
}
const state = await q("return document.querySelector('.detail .stat b')?.innerText ?? '';");
check("ไฟล์ทดสอบขึ้นการ์ดไฟล์เสียหาย", state.includes("ไฟล์เสียหาย"), state);
const bad = await measure(".detail .minirow.half .btn, .detail .actions .btn");
const halves = bad.filter((b) => !b.wide);
check("การ์ดไฟล์เสียหาย ขอบซ้ายสองแนว กว้างเท่ากัน ไอคอนแนวเดียว ไม่ล้นปุ่ม",
  new Set(bad.map((b) => b.left)).size === 2 && new Set(halves.map((b) => b.w)).size === 1 && new Set(bad.map((b) => b.icon)).size === 1 && !bad.some((b) => b.over),
  `${bad.length} ปุ่ม · ขอบซ้าย ${[...new Set(bad.map((b) => b.left))].join(" ")} · ไอคอนห่างขอบ ${[...new Set(bad.map((b) => b.icon))].join(" ")}`);
await q("document.querySelector('.detail').scrollTop = 99999;");
await sleep(150);
await c.shot(`${OUT}/03-ไฟล์เสียหาย.png`, ".detail");

// การ์ดปกจับคู่ ปุ่มเล็กชุดเดียวกับ LinkCard
await q(`const box = document.createElement('div'); box.className = 'actions'; box.id = '__probe';
  box.innerHTML = ['ครอปใหม่', 'เปลี่ยนรูป', 'เอาปกออก', 'รวมเข้าไฟล์'].map((t) => '<button class="btn btn-sm btn-ghost"><svg width="15" height="15"></svg>' + t + '</button>').join('');
  document.querySelector('.detail').appendChild(box);`);
const link = await measure("#__probe .btn");
await q("document.getElementById('__probe')?.remove();");
check("ปุ่มชุดปกจับคู่ ไอคอนห่างขอบเท่าปุ่มอื่น ไม่ล้นปุ่ม", new Set(link.map((b) => b.icon)).size === 1 && link[0].icon === bad[0].icon && !link.some((b) => b.over), `ไอคอนห่างขอบ ${link[0].icon}`);

await q("document.querySelector('.detail').scrollTop = 0;");
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
