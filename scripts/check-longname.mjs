// BUGS ข้อ 51 ชื่อที่ยาวเกินช่อง แทนจุดสามจุด · ตัวกลาง src/lib/longName.ts กับแถวในหน้าตั้งค่า หัวข้อชั้นวาง
// ตรวจ ① ค่าตั้งต้นแบบเลื่อนให้อ่านจบตอนชี้ ② ไม่มีจุดสามจุดที่มองเห็นในทุกหน้า ③ ชื่อที่ล้นได้ป้าย ชื่อสั้นไม่ได้
// ④ แบบเลื่อน ชี้แล้วชื่อเลื่อน เอาเมาส์ออกกลับที่เดิม ⑤ แบบจางท้ายไม่เลื่อน ⑥ แบบเก็บปีไว้ท้ายแยกชื่อกับปี ⑦ แบบสองบรรทัดทุกเรื่องสูงเท่ากัน
// ⑧ ดรอปดาวน์ในหน้าตั้งค่าเปลี่ยนแบบได้และจำไว้ ⑨ จุดตัดบรรทัดกล่อง ⓘ · ใช้ชื่อจริงในชุดทดสอบบนชั้นวาง (ชื่อแบบไฟล์ที่ยาวเกินช่อง)
// ใช้: เปิด scripts/dev-app.ps1 ก่อน · คืนแบบที่เลือกไว้เดิมตอนจบ · DUMP=1 พิมพ์จุดตัดบรรทัดของกล่อง ⓘ
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const nav = (t) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(t)}))?.click(); return 1;`);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const was = await q("return localStorage.getItem('long-name');");
let sizeWas = null;
try {
  // ① ไม่มีค่าที่เก็บไว้ เปิดโปรแกรมแล้วเป็นแบบเลื่อนให้อ่านจบตอนชี้
  await q("localStorage.removeItem('long-name'); location.reload(); return 1;"); await sleep(3500);
  await nav("ชั้นวาง"); await sleep(1200);
  check("ค่าตั้งต้นเป็นแบบเลื่อนให้อ่านจบตอนชี้", (await q("return document.documentElement.dataset.longname;")) === "slide");

  // ② ไม่มีจุดสามจุดที่มองเห็นในทุกหน้า (กล่องที่ตั้งตัดท้ายเป็นจุดสามจุดและมองเห็นอยู่)
  const ELL = "return [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; return getComputedStyle(e).textOverflow === 'ellipsis'; }).map((e) => e.className || e.tagName).slice(0, 5);";
  for (const p of ["ชั้นวาง", "ใส่โปสเตอร์", "จับคู่ปก", "เสียงและซับ", "ซับไตเติล", "ตรวจไฟล์", "กราฟเสียง", "บิตเรต", "MediaInfo", "ตั้งค่า"]) {
    await nav(p); await sleep(600);
    const left = await q(ELL);
    check(`หน้า${p} ไม่มีกล่องที่ตัดท้ายเป็นจุดสามจุด`, left.length === 0, JSON.stringify(left));
  }
  await nav("ชั้นวาง"); await sleep(800);
  // ปกขนาดเล็กชื่อยาวถึงล้นช่อง · ตั้งเองไม่พึ่งค่าที่ตัวตรวจอื่นทิ้งไว้ คืนขนาดเดิมตอนจบ (check-table ทิ้งปกกลางไว้ ข้อนี้ตก เจอ 15 พ.ย. 2569)
  const SZ = "[aria-label='ขนาดปก'] button";
  sizeWas = await q(`return [...document.querySelectorAll(${JSON.stringify(SZ)})].find((b) => b.className.includes("on"))?.innerText.trim() ?? null`);
  await q(`[...document.querySelectorAll(${JSON.stringify(SZ)})].find((b) => b.innerText.trim() === "เล็ก")?.click(); return 1`); await sleep(600);

  // ③ ชื่อที่ล้นได้ป้าย data-ov ชื่อสั้นไม่ได้
  const names = await q("window.__longName.scan(); return [...document.querySelectorAll('.bn1')].map((e) => ({ t: e.textContent, over: e.scrollWidth > e.clientWidth + 1, ov: e.dataset.ov ?? '' }));");
  const longs = names.filter((n) => n.over), shorts = names.filter((n) => !n.over);
  check("ชื่อใต้ปกที่ล้นได้ป้ายจางท้าย ชื่อที่พอดีช่องไม่ได้ป้าย", longs.length >= 2 && longs.every((n) => n.ov === "m") && shorts.every((n) => n.ov === ""), JSON.stringify({ longs: longs.map((n) => n.t), bad: names.filter((n) => n.over !== !!n.ov).map((n) => n.t) }));

  // ④ แบบเลื่อน ชี้ชื่อที่ล้นแล้วชื่อค่อย ๆ เลื่อน เอาเมาส์ออกกลับที่เดิม
  const pt = await q("const e = [...document.querySelectorAll('.bn1')].find((x) => x.dataset.ov === 'm'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: e.textContent };");
  await sleep(300);
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }); await sleep(2500);
  const hov = await q(`const e = [...document.querySelectorAll('.bn1')].find((x) => x.textContent === ${JSON.stringify(pt.t)}); return { ti: parseFloat(getComputedStyle(e).textIndent), ov: parseFloat(e.style.getPropertyValue('--ov')) };`);
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await sleep(800);
  const back = await q(`const e = [...document.querySelectorAll('.bn1')].find((x) => x.textContent === ${JSON.stringify(pt.t)}); return parseFloat(getComputedStyle(e).textIndent);`);
  check("แบบเลื่อน ชี้ชื่อที่ล้นแล้วชื่อเลื่อนไปทางซ้าย เอาเมาส์ออกกลับที่เดิม", hov.ti < -10 && back === 0, JSON.stringify({ ...hov, back, t: pt.t }));

  // ⑤ แบบจางท้าย ชี้แล้วไม่เลื่อน ยังจางท้าย
  await q("window.__longName.set('fade'); return 1;"); await sleep(400);
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y }); await sleep(1500);
  const fd = await q(`const e = [...document.querySelectorAll('.bn1')].find((x) => x.textContent === ${JSON.stringify(pt.t)}); const cs = getComputedStyle(e); return { ti: parseFloat(cs.textIndent), mask: cs.webkitMaskImage || cs.maskImage };`);
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  check("แบบจางท้าย ชี้แล้วชื่อไม่เลื่อน และท้ายชื่อจาง", fd.ti === 0 && /gradient/.test(fd.mask), JSON.stringify(fd));

  // ⑥ แบบเก็บปีไว้ท้าย ชื่อที่มีปีในวงเล็บแยกเป็นชื่อกับปี ชื่อแบบไฟล์ที่ไม่มีวงเล็บคงเดิม
  await q("window.__longName.set('year'); return 1;"); await sleep(600);
  const yr = await q("return [...document.querySelectorAll('.bn1')].map((e) => ({ t: e.textContent, y: e.querySelector('.bn1-y')?.textContent ?? null }));");
  const withYear = yr.filter((x) => /\(\d{4}\)$/.test(x.t));
  check("แบบเก็บปีไว้ท้าย ชื่อที่ลงท้ายด้วยปีในวงเล็บแยกปีไว้ท้าย ชื่ออื่นไม่แยก", withYear.length >= 2 && withYear.every((x) => x.y && x.t.endsWith(x.y)) && yr.filter((x) => !/\(\d{4}\)$/.test(x.t)).every((x) => x.y === null), JSON.stringify(withYear.slice(0, 3)));

  // ⑦ แบบสองบรรทัด ทุกชื่อใต้ปกสูงสองบรรทัดเท่ากัน ชื่อที่ล้นขึ้นบรรทัดที่สอง ไม่มีจุดสามจุด
  await q("window.__longName.set('two'); return 1;"); await sleep(600);
  const tw = await q("const b = [...document.querySelectorAll('.bn1')].filter((e) => e.getBoundingClientRect().width > 0); const lh = parseFloat(getComputedStyle(b[0]).lineHeight); return { hs: [...new Set(b.map((e) => Math.round(e.getBoundingClientRect().height)))], lh: Math.round(lh * 2), wrapped: b.filter((e) => e.textContent.length > 25).map((e) => getComputedStyle(e).whiteSpace) };");
  check("แบบสองบรรทัด ชื่อใต้ปกทุกเรื่องสูงสองบรรทัดเท่ากัน ชื่อยาวขึ้นบรรทัดใหม่", tw.hs.length === 1 && Math.abs(tw.hs[0] - tw.lh) <= 1 && tw.wrapped.every((w) => w === "normal"), JSON.stringify(tw));

  // ⑧ หน้าตั้งค่า หัวข้อชั้นวาง ดรอปดาวน์บอกแบบตอนนี้ เลือกแล้วเปลี่ยนแบบและจำไว้
  await nav("ตั้งค่า"); await sleep(500); await c.setNav("shelf"); await sleep(400);
  const ddText = await q("return document.querySelector('[data-longname-set] .dd')?.innerText.trim() ?? '';");
  check("หน้าตั้งค่า แถวชื่อที่ยาวเกินช่องบอกแบบตอนนี้ (ขึ้นสองบรรทัด)", ddText.includes("ขึ้นสองบรรทัด"), ddText);
  await q("document.querySelector('[data-longname-set] .dd').click(); return 1;"); await sleep(300);
  await q("[...document.querySelectorAll('.menu .opt')].find((o) => o.innerText.trim() === 'เลื่อนให้อ่านจบตอนชี้')?.click(); return 1;"); await sleep(400);
  const picked = await q("return { mode: document.documentElement.dataset.longname, saved: localStorage.getItem('long-name'), dd: document.querySelector('[data-longname-set] .dd')?.innerText.trim() };");
  check("เลือกเลื่อนให้อ่านจบตอนชี้จากดรอปดาวน์ แบบเปลี่ยนและจำไว้", picked.mode === "slide" && picked.saved === "slide" && picked.dd.includes("เลื่อนให้อ่านจบตอนชี้"), JSON.stringify(picked));
  const ddw = await q("return Math.round(document.querySelector('[data-longname-set] .dd').getBoundingClientRect().width);");
  check("ดรอปดาวน์กว้าง 260 เท่าแถวอื่นของหน้าตั้งค่า", ddw === 260, ddw);

  // ⑨ กล่อง ⓘ ตัดบรรทัดตรงความหมาย
  await q("document.querySelector('[data-longname-set] .lbl button').click(); return 1;"); await sleep(400);
  const tip = await linesOf(q, ".infotip");
  if (process.env.DUMP) console.log(JSON.stringify(tip, null, 1));
  // ตารางจุดตัดทั้งกล่อง (รุ่นแรกตัด "ชื่อใต้ ⏎ ปก" "ชื่อ ⏎ ค่อย ๆ เลื่อน" "ส่วน ⏎ จุดอื่น" ข้อตรวจคำตกบรรทัดแบบนับตัวอักษรจับไม่ได้ จึงเทียบทั้งตาราง)
  const WANT = [
    "ชื่อเรื่องหรือชื่อไฟล์ที่ยาวเกินช่อง ใช้กับทุกจุดในโปรแกรม ⏎ เช่นชื่อใต้ปก ชื่อไฟล์ในหน้าเสียงและซับ และคิวแปลงเสียง",
    "เลื่อนให้อ่านจบตอนชี้ ท้ายชื่อที่ล้นจางหาย ⏎ และเอาเมาส์ชี้แล้วชื่อค่อย ๆ เลื่อนจนเห็นท้ายชื่อ ⏎ ข้อดีอ่านชื่อเต็มได้โดยไม่ต้องเปิดอะไร ⏎ ข้อเสียต้องชี้ทีละชื่อ",
    "จางท้าย ท้ายชื่อที่ล้นจางหายแทนจุดสามจุด ⏎ ข้อดีหน้าตาเรียบเหมือนเดิม ⏎ ข้อเสียท้ายชื่อมองไม่เห็น",
    "เก็บปีไว้ท้าย ชื่อใต้ปกจางตรงที่ล้น และปีในวงเล็บอยู่ท้ายเสมอ ⏎ ส่วนจุดอื่นจางท้าย ⏎ ข้อดีรู้ว่าเป็นเรื่องปีไหนแม้ชื่อยาว ⏎ ข้อเสียใช้ได้กับชื่อที่มีปีท้ายเท่านั้น",
    "ขึ้นสองบรรทัด ชื่อใต้ปกขึ้นบรรทัดที่สองได้ ⏎ โดยทุกเรื่องจองที่สองบรรทัดเท่ากัน ส่วนจุดอื่นจางท้าย ⏎ ข้อดีเห็นชื่อเต็มเกือบทุกเรื่อง ⏎ ข้อเสียใต้ปกสูงขึ้นหนึ่งบรรทัด",
    "แนะนำเลื่อนให้อ่านจบตอนชี้",
  ];
  check("กล่อง ⓘ ทุกย่อหน้าตัดบรรทัดตรงรอยต่อความหมาย", JSON.stringify(tip) === JSON.stringify(WANT), JSON.stringify(tip));
  await q("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1;");
} finally {
  if (sizeWas) await q(`[...document.querySelectorAll("[aria-label='ขนาดปก'] button")].find((b) => b.innerText.trim() === ${JSON.stringify(sizeWas)})?.click(); return 1`).catch(() => null);
  await q(`${was == null ? "localStorage.removeItem('long-name')" : `localStorage.setItem('long-name', ${JSON.stringify(was)})`}; window.__longName?.set(${JSON.stringify(was ?? "slide")}); return 1;`).catch(() => null);
  await nav("ชั้นวาง").catch(() => null);
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
process.exit(pass === results.length ? 0 : 1);
