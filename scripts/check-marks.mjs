// BUGS ข้อ 51 เครื่องหมายต้องห้ามในข้อความบนจอ ไล่ทุกหน้า ทุกหัวข้อของหน้าตั้งค่า และเปิดกล่อง ⓘ ทุกกล่องที่เห็น
// หา ① จุดกลาง · ② เครื่องหมายคำถามติดคำไทย ③ ขีดยาว — ที่คั่นระหว่างคำไทย (ขีดยาวตัวเดียวในช่องที่ไม่มีค่ายังใช้ได้ ตามที่พี่กันเลือก 11 พ.ย. 2569)
// ลูกศร ขีดช่วงตัวเลข จุดสามจุดท้ายคำว่ากำลังทำ และทับ ใช้ได้ ไม่นับ · อ่านเฉพาะข้อความที่มองเห็น กับ title และ aria-label ของปุ่ม
// ใช้: เปิด scripts/dev-app.ps1 ก่อน · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 · ไม่กดปุ่มที่เขียนไฟล์ กดแค่เมนู หัวข้อตั้งค่า และปุ่ม ⓘ
import { connect, sleep } from "./lib/cdp-client.mjs";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

// ข้อความที่ตาเห็นในกรอบที่ส่งมา แยกทีละโหนดข้อความ พร้อม title กับ aria-label · คืนรายการที่เจอเครื่องหมายต้องห้าม
const SCAN = (root) => `
  const BAD = [[/·/, 'จุดกลาง'], [/[\\u0E00-\\u0E7F]\\s?\\?|\\?\\s?[\\u0E00-\\u0E7F]/, 'คำถามติดคำไทย'], [/[\\u0E00-\\u0E7F] ?— ?[\\u0E00-\\u0E7F]/, 'ขีดยาวคั่นคำไทย']];
  const root = ${root};
  if (!root) return [];
  const out = [];
  const seen = (t) => out.some((x) => x.t === t);
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !vis(el) || el.closest('script, style, [data-nomarks]')) continue;
    const t = (el.innerText || n.data).trim(); if (!t) continue;
    for (const [re, why] of BAD) if (re.test(n.data) && !seen(t)) out.push({ why, t: t.slice(0, 160) });
  }
  for (const el of root.querySelectorAll('[title], [aria-label]')) {
    if (!vis(el)) continue;
    for (const a of ['title', 'aria-label']) { const t = el.getAttribute(a); if (!t) continue; for (const [re, why] of BAD) if (re.test(t) && !seen(t)) out.push({ why: why + ' ใน ' + a, t: t.slice(0, 160) }); }
  }
  return out;`;

const tipsIn = async (where) => {
  // เปิดกล่อง ⓘ ทีละกล่องที่มองเห็น อ่านข้อความ แล้วปิดด้วย Esc
  const n = await q(`return [...document.querySelectorAll('${where} .infob, ${where} [data-info]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;`);
  const bad = [];
  for (let i = 0; i < n; i++) {
    const name = await q(`const bs = [...document.querySelectorAll('${where} .infob, ${where} [data-info]')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const b = bs[${i}]; if (!b) return null; b.scrollIntoView({ block: 'center' }); b.click(); return b.dataset.info ?? b.getAttribute('aria-label');`);
    if (name == null) continue;
    await sleep(250);
    for (const x of await q(SCAN("document.querySelector('.infotip')"))) bad.push({ ...x, why: `กล่อง ⓘ ${name} ${x.why}` });
    await q("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1;"); await sleep(150);
  }
  return { n, bad };
};

const PAGES = ["ชั้นวางหนัง", "ใส่โปสเตอร์", "จับคู่ปก", "เสียงและซับ", "ซับไตเติล", "ตรวจไฟล์", "กราฟเสียง", "บิตเรต", "MediaInfo"];
for (const p of PAGES) {
  const ok = await q(`const b = [...document.querySelectorAll('.side .nav')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(p)}) || x.getAttribute('aria-label') === ${JSON.stringify(p)}); if (!b) return false; b.click(); return true;`);
  if (!ok) { check(`หน้า${p} เปิดได้`, false, "ไม่เจอปุ่มในเมนูซ้าย"); continue; }
  await sleep(700);
  const bad = await q(SCAN("document.querySelector('.main') ?? document.body"));
  const tips = await tipsIn(".main");
  const all = [...bad, ...tips.bad];
  check(`หน้า${p} ไม่มีเครื่องหมายต้องห้ามในข้อความที่เห็น (กล่อง ⓘ ${tips.n} กล่อง)`, all.length === 0, all.length ? JSON.stringify(all) : "");
}
await q("[...document.querySelectorAll('.side .nav')].find((x) => x.innerText.trim().startsWith('ตั้งค่า')).click(); return 1;"); await sleep(600);
const secs = await q("return [...document.querySelectorAll('[data-setnav]')].map((b) => b.dataset.setnav);");
for (const s of secs) {
  await c.setNav(s); await sleep(400);
  const bad = await q(SCAN(`document.querySelector('[data-setcard="${s}"]')`));
  const tips = await tipsIn(`[data-setcard="${s}"]`);
  const all = [...bad, ...tips.bad];
  check(`ตั้งค่า หัวข้อ ${s} ไม่มีเครื่องหมายต้องห้าม (กล่อง ⓘ ${tips.n} กล่อง)`, all.length === 0, all.length ? JSON.stringify(all) : "");
}
await q("[...document.querySelectorAll('.side .nav')].find((x) => x.innerText.trim().startsWith('ชั้นวาง')).click(); return 1;");
await c.send("Emulation.clearDeviceMetricsOverride");
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
process.exit(pass === results.length ? 0 : 1);
