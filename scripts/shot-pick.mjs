// ถ่ายภาพแบบให้พี่กันเลือกจากโปรแกรมจริง ไม่เด้งขึ้นจอ · ใส่สไตล์ทับชั่วคราว ไม่แก้ของจริง รีโหลดแล้วหาย
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/shot-pick.mjs · ตรวจหน้าเลือกแบบ pick-ui.html ด้วย
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { DROP, PICK } from "../docs/mockups/pick-variants.mjs";

const OUT = "docs/report-2026-11-09/มอคอัป-เลือก";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const waitFor = async (js, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(600); };
const style = (kind, v) => q(`let el = document.getElementById('${kind}-style'); if (!el) { el = document.createElement('style'); el.id = '${kind}-style'; document.head.appendChild(el); } el.textContent = ${JSON.stringify(v.css)};`);
const bad = [];
const expect = (name, ok, note = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); if (!ok) bad.push(name); };

/* ---------- จุดลากไฟล์ ---------- */
await nav("ใส่โปสเตอร์");
for (const v of DROP) { await style("drop", v); await sleep(250); await c.shot(`${OUT}/ลาก-${v.id}.png`); }
const rec = DROP.find((v) => v.rec);
await style("drop", rec);
const cases = [["จับคู่ปก", "จับคู่ปก"], ["เสียงซับ", "เสียงและซับ"]];
for (const [f, n] of cases) { await nav(n); await c.shot(`${OUT}/ลาก-${rec.id}-${f}.png`); }
await nav("กราฟเสียง");
await q("document.querySelector('[data-graphhome]')?.click();"); await sleep(500);
await c.shot(`${OUT}/ลาก-${rec.id}-หน้ารวมกราฟ.png`);
await q("[...document.querySelectorAll('.gmodebar button')].find((b) => b.textContent.includes('แปลงเสียง'))?.click();"); await sleep(500);
await c.shot(`${OUT}/ลาก-${rec.id}-แปลงเสียง.png`);
await q("[...document.querySelectorAll('.gmodebar button')].find((b) => b.textContent.includes('ดูกราฟ'))?.click();"); await sleep(300);
await q("document.documentElement.setAttribute('data-sim-over', '');");
await nav("ใส่โปสเตอร์"); await c.shot(`${OUT}/ลาก-${rec.id}-ตอนลากค้าง.png`);
await q("document.documentElement.removeAttribute('data-sim-over');");
await style("drop", DROP[0]);

/* ---------- ปุ่มเลือกสีบนกราฟดำ ---------- */
await nav("ชั้นวางหนัง");
await c.book("ดาวเหนือ (2023)"); await sleep(400);
await q("document.querySelector('[data-shelfgraph]').click();");
await waitFor("return !!document.querySelector('[data-view]');");
await q("document.querySelector('[data-view=spek]').click();");
expect("เปิดหน้าวิเคราะห์ได้", await waitFor("return !!document.querySelector('[data-spek]');", 90000));
await sleep(1000);
const hNow = await q("return document.querySelector('[data-spek]').clientHeight;");
for (const v of PICK) {
  await style("pick", v); await sleep(500);
  await c.shot(`${OUT}/สี-${v.id}.png`, "[data-plot]", 0);
  const m = await q("const p = document.querySelector('[data-plottools]').getBoundingClientRect(), cv = document.querySelector('[data-spek]').getBoundingClientRect(); return { w: Math.round(p.width), h: Math.round(p.height), inside: p.top >= cv.top && p.right <= cv.right, cvH: cv.height };");
  console.log(v.id, JSON.stringify(m), "กราฟสูงขึ้น", Math.round(m.cvH - hNow));
  if (v.id !== "now") expect(`แบบ ${v.id} อยู่ในกราฟดำ`, m.inside, JSON.stringify(m));
}
/* แบบ ค ตอนกาง */
await style("pick", PICK.find((v) => v.id === "c"));
await q("document.querySelector('[data-plottools] .seg').classList.add('open');"); await sleep(300);
await c.shot(`${OUT}/สี-c-กาง.png`, "[data-plot]", 0);
await q("document.querySelector('[data-plottools] .seg').classList.remove('open');");
/* ปุ่มยังเป็นของจริง กดแล้วเปลี่ยนสี */
await style("pick", PICK.find((v) => v.id === "a"));
await q("document.querySelector('[data-scmap=rainbow]').click();"); await sleep(800);
expect("แบบ ก กดสีรุ้งแล้วเปลี่ยนจริง", await q("return document.querySelector('[data-scmap=rainbow]').classList.contains('on');"));
await c.shot(`${OUT}/สี-a-สีรุ้ง.png`, "[data-plot]", 0);
await q("document.querySelector('[data-scmap=heat]').click();"); await sleep(300);
await style("pick", PICK[0]);
await q("document.querySelector('[data-view=wave]').click();");

/* ---------- หน้าเลือกแบบในเว็บ เปิดในหน้าต่างโปรแกรมที่ซ่อนอยู่ ---------- */
const home = await q("return location.href;");
await q("location.href = '/docs/mockups/pick-ui.html';").catch(() => null);
await sleep(4000);
expect("หน้าเลือกแบบขึ้นการ์ดจุดลากไฟล์ครบ", await waitFor(`return document.querySelectorAll('.card').length === ${DROP.length};`));
const inFrame = (js) => q(`const d = document.getElementById('app').contentDocument; ${js}`);
expect("กรอบหน้าจอจริงโหลด", await waitFor("const d = document.getElementById('app').contentDocument; return !!d?.querySelector('.nav');"));
await sleep(1500);
await q("document.querySelector('[data-v=d]').click();"); await sleep(400);
expect("กดการ์ดแล้วสไตล์เข้าหน้าจอจริง", await inFrame("return !!d.getElementById('drop-style')?.textContent.includes('rgba(255,255,255,.75)');"));
await q("document.querySelector('[data-tab=pick]').click();"); await sleep(500);
expect("แท็บปุ่มเลือกสีเปิดหน้าวิเคราะห์", await waitFor("const d = document.getElementById('app').contentDocument; return !!d.querySelector('[data-spek]');", 40000));
expect("แท็บปุ่มเลือกสีมีการ์ดครบ", await q(`return document.querySelectorAll('.card').length === ${PICK.length};`));
await q(`location.href = ${JSON.stringify(home)};`).catch(() => null);
await sleep(3000);
await waitFor("return !!document.querySelector('.nav');");
console.log(bad.length ? `ไม่ผ่าน ${bad.length} ข้อ` : "ผ่านครบ");
c.close();
process.exitCode = bad.length ? 1 : 0;
