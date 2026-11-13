// ตัวตรวจบั๊กชุด 6 หน้ากราฟเสียง ความถี่เฉลี่ย ความดัง ข้อ 15 16 19 20 21 22 24 25 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// เปิดโปรแกรมโหมดพัฒนาก่อน · ไม่กดปุ่มเลือกไฟล์ ไม่กดบันทึกรูป ไม่กดส่งออกตาราง · ภาพลง docs/report-2026-11-11/ชุด6/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด6`; mkdirSync(OUT, { recursive: true });
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const G = "[data-pageslot=graph]";
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const view = (k) => q(`document.querySelector('${G} [data-view=${k}]')?.click()`);
const metrics = (w, h) => c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });

// ค่าจำของสวิตช์สีทึบใต้เส้นอาจค้างจากรอบที่ล้มกลางทาง ข้อ 20 ต้องเริ่มจากค่าตั้งต้น · ล้างแล้วโหลดหน้าใหม่ (11 พ.ย. 2569)
await q(`setTimeout(() => { localStorage.removeItem('graph-psd-fill'); location.reload(); }, 50); return 1`);
await sleep(1500); await waitFor(`return !!document.querySelector('.side .nav')`, 20000); await sleep(800);
await nav("กราฟเสียง");
await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(SONG)}], position: { x: 700, y: 400 } } })`);
await waitFor(`return (document.querySelector('${G} .fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 15000); await sleep(2500);
await view("psd"); await waitFor(`return !!document.querySelector('${G} [data-psdchecks]')`, 20000); await sleep(800);

// ---------- ข้อ 15 แถบซูมแกนความถี่อยู่แถวบน · แคบแล้วปุ่มช่องเป็นดรอปดาวน์ ----------
const head = await q(`const h = document.querySelector('${G} .plothead'); const z = h.querySelector('[data-psdhzoom]'); return { inHead: !!z, inRead: !!document.querySelector('${G} [data-psdreadout] [data-psdhzoom]'), seg: getComputedStyle(h.querySelector('.psdch-seg')).display, dd: getComputedStyle(h.querySelector('.psdch-dd')).display, over: h.scrollWidth > h.clientWidth + 1, w: Math.round(h.clientWidth) }`);
check("ข้อ 15 แถบซูมแกนความถี่อยู่แถวหัวการ์ด ไม่อยู่แถวบอกค่า · หัวการ์ดไม่ล้น", head.inHead && !head.inRead && !head.over, JSON.stringify(head));
await c.shot(`${OUT}/15-หัวการ์ดความถี่เฉลี่ย.png`, `${G} .plotstick`, 0);
await metrics(1280, 800); await sleep(900);
const narrow = await q(`const h = document.querySelector('${G} .plothead'); return { seg: getComputedStyle(h.querySelector('.psdch-seg')).display, dd: getComputedStyle(h.querySelector('.psdch-dd')).display, over: h.scrollWidth > h.clientWidth + 1, w: Math.round(h.clientWidth) }`);
check("ข้อ 15 หน้าต่าง 1280 ปุ่มช่องเป็นดรอปดาวน์ หัวการ์ดไม่ล้น", narrow.seg === "none" && narrow.dd !== "none" && !narrow.over, JSON.stringify(narrow));
await c.shot(`${OUT}/15-หัวการ์ดแคบเป็นดรอปดาวน์.png`, `${G} .plotstick`, 0);
await c.send("Emulation.clearDeviceMetricsOverride"); await sleep(900);

if (await q(`return !!document.querySelector('${G} [data-ovfold]')`)) { await q(`document.querySelector('${G} [data-ovfold] [data-ovtoggle]')?.click()`); await sleep(800); }
// ---------- ข้อ 16 ป้ายช่วงที่เอามาเฉลี่ย · ช่องตำแหน่งชี้ไม่ค้าง · ป้ายช่วงความถี่ที่ซูม ----------
const cap = await q(`return document.querySelector('${G} .ovrul span:nth-child(2)')?.innerText`);
const cursor = await q(`return document.querySelector('${G} [data-psdcursor]')?.innerText`);
check("ข้อ 16 ป้ายใต้แถบบนบอก เฉลี่ยทั้งไฟล์ · ช่องตำแหน่งชี้ตอนไม่ได้ชี้บอกให้ชี้ ไม่ค้าง 1,000 Hz", /เฉลี่ยทั้งไฟล์/.test(cap ?? "") && /ชี้ที่กราฟ/.test(cursor ?? ""), JSON.stringify({ cap, cursor }));
await q(`[...document.querySelectorAll('${G} .plothead button')].find((x) => x.innerText.trim() === '10 วินาที')?.click()`); await sleep(1500);
const cap2 = await q(`return document.querySelector('${G} .ovrul span:nth-child(2)')?.innerText`);
check("ข้อ 16 เลือกช่วง 10 วินาที ป้ายบอก ช่วงที่เอามาเฉลี่ย ตามช่วงจริง", /ช่วงที่เอามาเฉลี่ย .+ ถึง .+/.test(cap2 ?? ""), cap2);
await q(`[...document.querySelectorAll('${G} .plothead button')].find((x) => x.innerText.trim() === 'ทั้งไฟล์')?.click()`); await sleep(1200);
await q(`document.querySelector('${G} [data-psdhzoom] [aria-label="ซูมแกนความถี่เข้า"]')?.click()`); await sleep(500);
const rng = await q(`return document.querySelector('${G} [data-psdhzrange]')?.innerText`);
check("ข้อ 16 ซูมแกนความถี่แล้วมีป้ายช่วงความถี่ที่เห็นอยู่", /–.+Hz/.test(rng ?? ""), rng);
await q(`document.querySelector('${G} .plothead [data-zoom-reset]')?.click()`); await sleep(500);

// ---------- ข้อ 19 21 ป้ายสีเส้นอยู่แถวบอกค่า ปุ่มเล็ก · ⓘ M S ----------
await q(`document.querySelector('${G} [data-psdch=all]')?.click()`); await sleep(1800);
const lg = await q(`const l = document.querySelector('${G} [data-psdreadout] [data-psdlegend]'); return l ? { n: l.querySelectorAll('[data-psdkey]').length, h: Math.round(l.querySelector('[data-psdkey]').getBoundingClientRect().height), info: !!l.querySelector('button:not([data-psdkey])'), old: !!document.querySelector('${G} [data-plot] > [data-psdlegend]') } : null`);
check("ข้อ 19 21 ซ้อนทุกช่อง ป้ายสีเส้น 4 ปุ่มอยู่แถวบอกค่า สูง 24 จุด มีปุ่ม ⓘ อธิบาย M S · แถวป้ายเดิมใต้กราฟหายไป", !!lg && lg.n === 4 && lg.h <= 24 && lg.info && !lg.old, JSON.stringify(lg));

// ---------- ข้อ 20 สีทึบใต้เส้น ค่าตั้งต้นปิด เปิดแล้วจำค่า ----------
const fill0 = await q(`return document.querySelector('${G} [data-psdfill] [role=switch]')?.getAttribute('aria-checked')`);
await c.shot(`${OUT}/19-20-ซ้อนทุกช่อง-ไม่มีสีทึบ.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-psdfill] [role=switch]')?.click()`); await sleep(700);
const fill1 = await q(`return { sw: document.querySelector('${G} [data-psdfill] [role=switch]')?.getAttribute('aria-checked'), mem: localStorage.getItem('graph-psd-fill') }`);
check("ข้อ 20 สวิตช์สีทึบใต้เส้น ค่าตั้งต้นปิด กดแล้วเปิด จำค่าไว้", fill0 === "false" && fill1.sw === "true" && fill1.mem === "1", JSON.stringify({ fill0, fill1 }));
await c.shot(`${OUT}/20-ซ้อนทุกช่อง-มีสีทึบ.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-psdfill] [role=switch]')?.click()`); await sleep(300);

// ---------- ข้อ 22 ⓘ แถวตั้งค่าใต้กราฟ ----------
const tips = await q(`return document.querySelectorAll('${G} .agfoot .infob').length`);
check("ข้อ 22 แถวตั้งค่าใต้กราฟมีปุ่ม ⓘ ครบ 5 ปุ่ม (แกน ความละเอียด ช่วง เส้นตาราง สีทึบ)", tips >= 5, `เจอ ${tips}`);

// ---------- ข้อ 25 ผลตรวจ ----------
const ck = await q(`return [...document.querySelectorAll('${G} [data-psdcheck]')].map((e) => e.dataset.psdcheck + ':' + e.innerText.replace(/\\s+/g, ' ').slice(0, 70))`);
check("ข้อ 25 แถบผลตรวจไม่มีคำว่า ฮัม แบบเดิม · มีผลตรวจอย่างน้อยหนึ่งข้อพร้อมปุ่ม ⓘ", ck.length >= 1 && !ck.some((x) => /เสียงฮัม/.test(x)), ck.join(" | "));
await q(`document.querySelector('${G} [data-psdch=mix]')?.click()`); await sleep(1200);
await c.shot(`${OUT}/25-ผลตรวจความถี่เฉลี่ย.png`, `${G} [data-plot]`, 0);

// ---------- ข้อ 24 รวมความดังกับซ้อนเทียบ ----------
const vs = await q(`return [...document.querySelectorAll('${G} [data-view]')].map((b) => b.dataset.view)`);
await view("loud"); await sleep(1200);
const lm = await q(`return { btns: [...document.querySelectorAll('${G} [data-loudmode] button[data-k]')].map((b) => b.innerText.trim()), head: document.querySelector('${G} .plothead b')?.innerText }`);
await c.shot(`${OUT}/24-ความดัง-รวมทุกช่อง.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-loudmode] [data-k=lr]')?.click()`); await sleep(1200);
const lr = await q(`return { on: document.querySelector('${G} [data-loudmode] .on')?.dataset.k, unit: /L ซ้าย/.test(document.querySelector('${G} .agfoot .lg')?.innerText ?? '') && /R ขวา/.test(document.querySelector('${G} .agfoot .lg')?.innerText ?? '') }`);
check("ข้อ 24 ไม่มีปุ่มมุมมอง ซ้อนเทียบ · หน้าความดังมีปุ่ม รวมทุกช่อง L R เทียบซ้ายขวา · เทียบซ้ายขวาเป็นกราฟซ้อนเทียบเดิม (หน่วย dB) ป้าย L R", !vs.includes("cmp") && lm.btns.join("|") === "รวมทุกช่อง|L ซ้าย|R ขวา|เทียบซ้ายขวา" && lr.on === "lr" && lr.unit, JSON.stringify({ vs, lm, lr }));
await c.shot(`${OUT}/24-ความดัง-เทียบซ้ายขวา.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-loudmode] [data-k=mix]')?.click()`); await sleep(500);

// ข้อ 25 ตรวจเกณฑ์กับไฟล์ที่ทำให้ตัดจริง (ทำด้วย ffmpeg ใน D:/dev/tmp/ชั้นตรวจ6 · ผ่าน MP3 128 kb/s แล้วกลับเป็น FLAC · อัปแซมเปิล 44.1 เป็น 96 kHz)
import { existsSync } from "node:fs";
for (const [file, want] of [["D:/dev/tmp/ชั้นตรวจ6/ตัดแบบ mp3.flac", "lossy"], ["D:/dev/tmp/ชั้นตรวจ6/อัปแซมเปิล 96k.flac", "upsample"]]) {
  if (!existsSync(file)) { check(`ข้อ 25 ไฟล์ทดสอบ ${file} ไม่มี ข้าม`, false); continue; }
  await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(file)}], position: { x: 700, y: 400 } } })`);
  await waitFor(`return (document.querySelector('${G} .fchip .nm')?.innerText ?? '').startsWith(${JSON.stringify(file.split("/").pop().replace(/\.flac$/, ""))})`, 20000);
  await view("psd"); await sleep(1500);
  await q(`document.querySelector('${G} [data-psdch=mix]')?.click()`);
  await waitFor(`return !!document.querySelector('${G} [data-psdcheck]')`, 30000); await sleep(1200);
  const got = await q(`return [...document.querySelectorAll('${G} [data-psdcheck]')].map((e) => e.dataset.psdcheck + ':' + e.innerText.replace(/\\s+/g, ' ').slice(0, 80))`);
  check(`ข้อ 25 ${file.split("/").pop()} ขึ้นเตือน ${want === "lossy" ? "อาจเคยเป็น MP3" : "อาจเป็นไฟล์อัปแซมเปิล"}`, got.some((x) => x.startsWith(want + ":")), got.join(" | "));
  await c.shot(`${OUT}/25-${want === "lossy" ? "ตรวจเจอรอยตัด-mp3" : "ตรวจเจออัปแซมเปิล"}.png`, `${G} [data-psdchecks]`, 6);
}

console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
