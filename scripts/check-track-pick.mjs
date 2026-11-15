// AUDIT 12 พ.ย. 2569 ข้อ 22 ดูแทร็กเสียงที่ 2 อยู่แล้วกดเทียบหรือแปลงเสียง ต้องได้แทร็กที่ 2 ไม่ใช่แทร็กแรก
// หนังดาวเหนือ (2023) แทร็กแรกเสียงไทย AAC 1 ช่อง แทร็กที่สองเสียงอังกฤษ AC-3 5.1
// เปิดโปรแกรมโหมดพัฒนาก่อน (scripts/dev-app.ps1) · ไม่เปิดกล่องเลือกไฟล์ (ส่งไฟล์เทียบผ่าน window.__cmpPick) · ไม่กดปุ่มเริ่มแปลง · แถวที่เพิ่มเข้าคิวเอาออกตอนจบ
// ภาพลง docs/report-2026-11-15/AUDIT-กลุ่ม1/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-15/AUDIT-กลุ่ม1`; mkdirSync(OUT, { recursive: true });
const MOVIE = `${ROOT}/test-media/สร้าง/หนัง/ดาวเหนือ (2023).mkv`;
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ.mp3`;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ากำลังโหลด */ } await sleep(200); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const drop = (p) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(p)}], position: { x: 700, y: 400 } } })`);

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const before = await q("return document.querySelectorAll('[data-qrow]').length");
try {
  await nav("กราฟเสียง");
  await q("document.querySelector('[data-cmpclose]')?.click(); document.querySelector('[data-gmode=graph]')?.click(); return 1"); await sleep(400);
  await drop(MOVIE);
  await waitFor("return (document.querySelector('.ag[data-graph]')?.innerText ?? '').includes('ดาวเหนือ (2023)') && !!document.querySelector('[data-graphtrack]')", 60000);
  await q("document.querySelector('[data-graphtrack] button.dd')?.click(); return 1"); await sleep(300);
  await q("[...document.querySelectorAll('[role=option]')].find((o) => /5\.1/.test(o.innerText))?.click(); return 1"); await sleep(400);
  await waitFor("return !!document.querySelector('[data-plot]') && !document.querySelector('[data-graphloading]')", 90000);
  const tr = await q("return document.querySelector('[data-graphtrack]')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''");
  check("หน้ากราฟเลือกแทร็กเสียงที่ 2 เสียง 5.1 แล้ว", /เสียง 2/.test(tr) && /5\.1/.test(tr), tr);

  // ---------- เทียบกับไฟล์อื่น ----------
  await q(`window.__cmpPick = ${JSON.stringify(SONG)}; return 1`);
  await c.click("[data-graphcompare]");
  await waitFor("return document.querySelectorAll('[data-cmpfile]').length === 2 && !!document.querySelector('[data-cmpfile=a] .meta') && /เสียง 2/.test(document.querySelector('[data-cmpfile=a] .meta').innerText)", 60000);
  await waitFor("return [...document.querySelectorAll('.ag[data-compare] .card h3')].some((h) => /ช่องเสียง/.test(h.innerText) && /\\d+ ช่อง/.test(h.innerText))", 60000);
  const cmp = await q(`const a = document.querySelector('[data-cmpfile=a] .meta')?.innerText ?? '', h = [...document.querySelectorAll('.ag[data-compare] .card h3')].find((x) => /ช่องเสียง/.test(x.innerText))?.innerText.replace(/\\s+/g, ' ') ?? ''; return { a, h }`);
  check("หน้าเทียบ ชิปไฟล์หนังบอกว่าใช้เสียงแทร็กที่ 2", /เสียง 2/.test(cmp.a), cmp.a);
  check("หน้าเทียบอ่านเสียงแทร็กที่ 2 จริง ช่องเสียง 5.1 รวม 6 ช่อง (แทร็กแรกมี 1 ช่อง)", /5\.1/.test(cmp.h) && /6 ช่อง/.test(cmp.h), cmp.h);
  await sleep(800);
  await c.shot(`${OUT}/22-หน้าเทียบใช้แทร็กที่2.png`, ".ag[data-compare] .fbar, .ag[data-compare]", 0).catch(() => c.shot(`${OUT}/22-หน้าเทียบใช้แทร็กที่2.png`, ".ag[data-compare]", 0));
  // กดชิปไฟล์หนัง กลับมากราฟเดี่ยวต้องยังเป็นแทร็กที่ 2
  await c.click("[data-cmpfile=a]");
  await waitFor("return !document.querySelector('.ag[data-compare]') && !!document.querySelector('[data-graphtrack]')", 30000); await sleep(800);
  const back = await q("return document.querySelector('[data-graphtrack]')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''");
  check("กดชิปไฟล์ในหน้าเทียบ กลับกราฟเดี่ยวยังเป็นแทร็กที่ 2", /เสียง 2/.test(back), back);
  await q("delete window.__cmpPick; return 1");

  // ---------- แปลงเสียง ----------
  await waitFor("return !!document.querySelector('[data-plot]') && !document.querySelector('[data-graphloading]')", 90000);
  await c.click("[data-graphconvert]");
  await waitFor("return document.querySelectorAll('[data-qrow]').length > 0", 15000);
  await waitFor("const r = [...document.querySelectorAll('[data-qrow]')].pop(); return !!r && /ดาวเหนือ/.test(r.innerText) && !r.querySelector('.skel')", 30000);
  const row = await q("const r = [...document.querySelectorAll('[data-qrow]')].pop(); return r?.querySelector('.dt')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check("คิวแปลงเสียงได้เสียงแทร็กที่ 2 AC-3 5.1 บอกว่าแทร็กเสียงที่ 2 จาก 2", /5\.1/.test(row) && /แทร็กเสียงที่ 2 จาก 2 ในไฟล์หนัง/.test(row), row);
  await c.shot(`${OUT}/22-คิวแปลงใช้แทร็กที่2.png`, "[data-qlist]", 4);
} finally {
  // เอาแถวที่ตัวตรวจเพิ่มออก ไม่แตะแถวเดิมในคิว
  for (let i = 0; i < 5; i++) {
    const n = await q("return document.querySelectorAll('[data-qrow]').length");
    if (n <= before) break;
    await q("[...document.querySelectorAll('[data-qrow]')].pop()?.querySelector('[data-qremove]')?.click(); return 1"); await sleep(300);
  }
  await q("delete window.__cmpPick; document.querySelector('[data-gmode=graph]')?.click(); return 1");
  await c.send("Emulation.clearDeviceMetricsOverride", {});
}
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
