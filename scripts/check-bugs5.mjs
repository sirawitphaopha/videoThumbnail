// ตัวตรวจบั๊กชุด 5 หน้ากราฟเสียง ความถี่ ข้อ 14 38 40 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// เปิดโปรแกรมโหมดพัฒนาก่อน · ไม่กดปุ่มเลือกไฟล์ ไม่กดบันทึกรูป · ภาพลง docs/report-2026-11-11/ชุด5/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด5`; mkdirSync(OUT, { recursive: true });
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const G = "[data-pageslot=graph]";
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const pill = () => q(`return [...document.querySelectorAll('${G} *')].some((e) => e.children.length === 0 && /กำลังโหลดกราฟ/.test(e.textContent || ''))`);
const zoomBtn = (lbl) => q(`const b = [...document.querySelectorAll('${G} .plothead button')].find((x) => x.innerText.trim() === ${JSON.stringify(lbl)}); if (b) b.click(); return !!b`);
const view = (k) => q(`document.querySelector('${G} [data-view=${k}]')?.click()`);

await nav("กราฟเสียง");
await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(SONG)}], position: { x: 700, y: 400 } } })`);
await waitFor(`return (document.querySelector('${G} .fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 15000); await sleep(2500);

// ---------- ข้อ 38 ปุ่มซูมยาวกว่าไฟล์ ป้ายโหลดไม่ค้าง ----------
for (const v of ["spek", "wave"]) {
  await view(v); await sleep(900);
  await zoomBtn("ทั้งไฟล์"); await sleep(600);
  const okBtn = await zoomBtn("10 นาที"); await sleep(1800);
  const p1 = await pill();
  await zoomBtn("ทั้งไฟล์"); await sleep(400);
  await zoomBtn("30 วินาที"); await sleep(1800);
  const p2 = await pill();
  check(`ข้อ 38 มุมมอง ${v} ไฟล์ยาว 30 วินาที กด 10 นาที กับ 30 วินาที (ยาวเท่าหรือเกินไฟล์) ป้ายกำลังโหลดไม่ค้าง`, okBtn && !p1 && !p2, JSON.stringify({ okBtn, p1, p2 }));
}
// กดสลับปุ่มซูมเร็ว ๆ แล้วรอ ป้ายต้องหายเอง
await view("spek"); await sleep(800);
for (let i = 0; i < 6; i++) { await zoomBtn(["4 นาที", "ทั้งไฟล์", "10 นาที", "30 วินาที"][i % 4]); await sleep(60); }
await q(`document.querySelector('${G} [data-zoomin]')?.click()`); await sleep(60);
await q(`document.querySelector('${G} [data-zoomin]')?.click()`);
const settled = await waitFor(`return ![...document.querySelectorAll('${G} *')].some((e) => e.children.length === 0 && /กำลังโหลดกราฟ/.test(e.textContent || ''))`, 15000);
check("ข้อ 38 กดสลับปุ่มซูมเร็ว ๆ 8 ครั้ง ป้ายกำลังโหลดหายเองภายใน 15 วินาที", settled);
await zoomBtn("ทั้งไฟล์"); await sleep(500);

// ---------- ข้อ 14 รวมมุมมองความถี่เข้าหน้าวิเคราะห์ ชื่อปุ่ม ความถี่ ----------
const views = await q(`return [...document.querySelectorAll('${G} [data-view]')].map((b) => b.dataset.view + ':' + b.innerText.trim())`);
check("ข้อ 14 ปุ่มมุมมองไม่มี ความถี่ แบบเดิม (spec) · หน้าวิเคราะห์เปลี่ยนชื่อเป็น ความถี่", !views.some((v) => v.startsWith("spec:")) && views.includes("spek:ความถี่") && !views.some((v) => /วิเคราะห์/.test(v)), views.join(" "));
await view("spek"); await sleep(1200);
const chs = await q(`const s = document.querySelector('${G} [data-spekchseg]'); return s ? { show: getComputedStyle(s.parentElement).display, btns: [...s.querySelectorAll('button')].map((b) => b.innerText.trim()) } : null`);
check("ข้อ 14 ปุ่มช่องที่ดูเป็นแถวปุ่ม รวมทุกช่อง L R แสดงทุกช่อง (หน้าต่างกว้าง)", !!chs && chs.show !== "none" && chs.btns.join("|") === "รวมทุกช่อง|L ซ้าย|R ขวา|แสดงทุกช่อง", JSON.stringify(chs));
await c.shot(`${OUT}/14-ความถี่-รวมทุกช่อง.png`, `${G} [data-plot]`, 0);
// แสดงทุกช่อง เรียงลงมา มีชื่อช่องในแถบ · ลองเฉพาะภาพ วัดว่ามีสองแถบจากพิกเซลขอบ
await q(`document.querySelector('${G} [data-spekchseg] [data-k="-2"]')?.click()`); await sleep(1200);
const bandAt = async (fy) => { const r = await q(`const r = document.querySelector('${G} [data-spek]').getBoundingClientRect(); return { x: r.left + r.width * 0.4, y: r.top + r.height * ${fy} }`); await sleep(600); await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y - 2 }); await sleep(150); await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y }); await sleep(500); return q(`return document.querySelector('${G} [data-spektip]')?.innerText.replace(/\s+/g, ' ') ?? ''`); };
const upper = await bandAt(0.3), lower = await bandAt(0.75);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await sleep(200);
check("ข้อ 14 แสดงทุกช่อง แถบบนเป็นช่อง L แถบล่างเป็นช่อง R (ชี้แล้วกล่องบอกช่อง)", /ช่อง L/.test(upper) && /ช่อง R/.test(lower), JSON.stringify({ upper, lower }));
await c.shot(`${OUT}/14-ความถี่-แสดงทุกช่อง.png`, `${G} [data-plot]`, 0);
// แกนล็อก ป้ายแกนเปลี่ยน · ภาพรวม
await q(`document.querySelector('${G} [data-spekaxis] [data-k=log]')?.click()`); await sleep(1000);
const ax = await q(`return { on: document.querySelector('${G} [data-spekaxis] .on')?.dataset.k, pref: JSON.parse(localStorage.getItem('graph-prefs') ?? '{}').spekAxis }`);
check("ข้อ 14 กดแกน ล็อก แล้วปุ่มติด จำค่าไว้", ax.on === "log" && ax.pref === "log", JSON.stringify(ax));
await c.shot(`${OUT}/14-ความถี่-แกนล็อก-ทุกช่อง.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-spekres] [data-k=coarse]')?.click()`); await sleep(1000);
check("ข้อ 14 กด ภาพรวม แล้วปุ่มติด", (await q(`return document.querySelector('${G} [data-spekres] .on')?.dataset.k`)) === "coarse");
await q(`document.querySelector('${G} [data-spekres] [data-k=fine]')?.click()`);
await q(`document.querySelector('${G} [data-spekaxis] [data-k=lin]')?.click()`);
await q(`document.querySelector('${G} [data-spekchseg] [data-k="-1"]')?.click()`); await sleep(800);
// หน้าตั้งค่ามีตัวเลือกความละเอียดตั้งต้น
await nav("ตั้งค่า"); await sleep(500);
await q(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'กราฟเสียง')?.click()`); await sleep(500);
const sr = await q(`const r = document.querySelector('[data-spekres-default]'); return r ? r.innerText.replace(/\\s+/g, ' ') : null`);
check("ข้อ 14 หน้าตั้งค่า หมวดกราฟเสียง มีตัวเลือก กราฟความถี่เปิดมาแบบ ละเอียด ภาพรวม", !!sr && /ละเอียด/.test(sr) && /ภาพรวม/.test(sr), sr);
await c.shot(`${OUT}/14-ตั้งค่าความละเอียดตั้งต้น.png`, `[data-spekres-default]`, 6).catch(() => {});
await nav("กราฟเสียง"); await sleep(800);

// ---------- ข้อ 40 เส้นตามเมาส์บนกราฟความถี่ ----------
await view("spek"); await sleep(800);
const box = await q(`const r = document.querySelector('${G} [data-spek]').getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.5 }`);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x, y: box.y }); await sleep(400);
const tip = await q(`const t = document.querySelector('${G} [data-spektip]'); return { line: !!document.querySelector('${G} [data-spekxh]'), txt: t ? t.innerText.replace(/\\s+/g, ' ') : null }`);
check("ข้อ 40 ชี้กราฟความถี่แล้วมีเส้นตั้งเส้นนอน กล่องบอกเวลา ความถี่ โน้ต ความดัง", tip.line && /Hz/.test(tip.txt ?? "") && /โน้ต/.test(tip.txt ?? "") && /dB|เงียบ/.test(tip.txt ?? ""), JSON.stringify(tip));
await c.shot(`${OUT}/40-เส้นตามเมาส์ความถี่.png`, `${G} [data-plot]`, 0);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await sleep(200);

console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
