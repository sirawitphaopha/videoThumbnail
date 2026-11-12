// ตรวจความครบถ้วนของงานปรับหน้าตาบนโปรแกรมจริง (พี่กันสั่ง 9 พ.ย. 2569 "เธอตรวจเทสความครบท่วนที่แก้มาให้ครบ")
// ใช้: เปิด scripts/dev-app.ps1 แบบอยู่หลังสุดก่อน แล้ว node scripts/check-look.mjs
// ใช้ไฟล์ test-media เท่านั้น · ไฟล์ผลแปลงเสียงลง D:\dev\tmp · ภาพลง docs/report-2026-11-09/โปรแกรมจริง
import { mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/โปรแกรมจริง";
mkdirSync(OUT, { recursive: true });
const MOVIES = resolve("test-media", "สร้าง", "หนัง");
const TMP = "D:\\dev\\tmp\\ตรวจหน้าตา";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
copyFileSync(join("test-media", "สร้าง", "เสียงซับ", "เพลงทดสอบ.wav"), join(TMP, "เพลงทดสอบ.wav"));

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "ผ่าน" : "ไม่ผ่าน"} · ${name}${note !== "" ? " · " + note : ""}`); };
const skip = (name, why) => { results.push({ name, ok: null, note: why }); console.log(`ยังไม่ได้ตรวจ · ${name} · ${why}`); };
const shot = (n, sel, pad = 4) => c.shot(`${OUT}/${n}.png`, sel, pad);
const waitFor = async (js, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const R = "const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };";
const nav = async (label) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click();`); await sleep(500); };
const bySel = (s) => JSON.stringify(s);
const overflowRight = () => q("return [...document.querySelectorAll('#root *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).length;");

await q(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));`);

// ใช้หนังชุดทดสอบ
const before = await q("const s = await window.__TAURI_INTERNALS__.invoke('get_settings'); return { tone: s.settings.tone, stores: s.settings.linkStores };");
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { folders: [${JSON.stringify(MOVIES)}] } }); await window.__TAURI_INTERNALS__.invoke('scan_library').catch(() => null);`);
await q("location.reload();").catch(() => null);
await sleep(3000);
await waitFor("return !!document.querySelector('.nav');", 30000);
await waitFor("return document.querySelectorAll('.book[data-movie]').length > 5;", 60000);
await q(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));`);

/* ---------- ชั้นวาง ---------- */
const shelf = await q(`${R} const top = document.querySelector('.topbar'), wrap = document.querySelector('.shelfwrap'), st = document.querySelector('[data-statusbar]'), books = [...document.querySelectorAll('.book[data-movie]')];
  const t0 = R(top).t; wrap.scrollTop = 200; await new Promise((r) => setTimeout(r, 200)); const t1 = R(top).t; wrap.scrollTop = 0;
  const first = books.filter((b) => R(b).t === R(books[0]).t);
  const img = books[0].querySelector('img, .cover');
  return { t0, t1, st: R(st), wrap: R(wrap), n: books.length, inRow: first.length, lastR: R(first[first.length - 1]).r, topR: R(top).r, firstL: R(first[0]).l, topL: R(top).l, cols: getComputedStyle(top).gridTemplateColumns, radius: img ? getComputedStyle(img).borderRadius : '', btnRadius: getComputedStyle(document.querySelector('.btn, .nav')).borderRadius, inner: innerHeight };`);
check("ชั้นวาง แถบบนอยู่นอกกล่องเลื่อน เลื่อนแล้วไม่ขยับ", shelf.t0 === shelf.t1, `${shelf.t0} → ${shelf.t1}`);
check("ชั้นวาง แถบสถานะชิดล่างหน้าต่าง", shelf.st && shelf.st.b >= shelf.inner - 1, shelf.st && `ล่าง ${shelf.st.b} จาก ${shelf.inner}`);
check("ชั้นวาง แถวปกเต็มถึงแนวแถบค้นหา", Math.abs(shelf.lastR - (shelf.topR - 18)) <= 22, `ปกขวาสุด ${shelf.lastR} แถบบนขวา ${shelf.topR}`);
check("รูปปกเหลี่ยม ปุ่มยังมน", (shelf.radius === "0px" || shelf.radius === "") && shelf.btnRadius !== "0px", `รูป ${shelf.radius} ปุ่ม ${shelf.btnRadius}`);
await shot("01-ชั้นวาง");
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(400);
check("กดปกครั้งแรก แผงรายละเอียดเปิด", await q("return !!document.querySelector('[data-detail]');"));
await shot("02-แผงขวา-ไม่มีปก");
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(400);
check("กดปกเดิมซ้ำ แผงรายละเอียดปิด", await q("return !document.querySelector('[data-detail]');"));
// เรื่องที่มีปกในไฟล์ มีปุ่มขยายรูป เปิดตัวดูรูปเต็มจอ
await c.click('.book[data-movie="Harbor Lights (2021)"]'); await sleep(500);
check("แผงรายละเอียดเรื่องที่มีปก มีรูปกับปุ่มขยาย", await q("return !!document.querySelector('.dpbig img');"));
await c.hover(".dpbig"); await sleep(300);
await shot("02-แผงขวา-มีปก");
const opened = await q("const b = document.querySelector('.dpbig button'); if (!b) return false; b.click(); return true;");
check("ปุ่มขยายรูปกดได้", opened);
if (opened) {
  const iv = await waitFor("return !!document.querySelector('.ivw-btn');", 8000);
  check("กดปุ่มขยายแล้วเปิดตัวดูรูปเต็มจอ", iv); await sleep(800);
  await shot("02-ตัวดูรูป");
  const pctW = await q("const b = [...document.querySelectorAll('.ivw-btn')].find((x) => /%/.test(x.textContent)); return b ? [b.textContent.trim(), b.getBoundingClientRect().width] : null;");
  if (pctW) {
    await q("[...document.querySelectorAll('.ivw-btn')].find((x) => x.getAttribute('title')?.includes('ขยาย') || x.getAttribute('aria-label')?.includes('ขยาย'))?.click();"); await sleep(300);
    const pctW2 = await q("const b = [...document.querySelectorAll('.ivw-btn')].find((x) => /%/.test(x.textContent)); return b ? [b.textContent.trim(), b.getBoundingClientRect().width] : null;");
    check("ตัวดูรูป เปอร์เซ็นต์เปลี่ยนแล้วปุ่มกว้างเท่าเดิม", pctW[1] === pctW2[1], `${pctW.join(" ")} → ${pctW2.join(" ")}`);
  }
  await c.key("Escape"); await sleep(400);
}
await c.click('.book[data-movie="Harbor Lights (2021)"]'); await sleep(300);
check("ชั้นวาง ไม่ล้นขวา", (await overflowRight()) === 0);

/* ---------- ตั้งค่า ---------- */
await nav("ตั้งค่า");
await c.click('[data-setnav="tone"]'); await sleep(400);
const toneN = await q("return document.querySelectorAll('.tncard').length;");
check("ตั้งค่า หัวข้อโทนสีมีการ์ดให้เลือก", toneN >= 2, `${toneN} แบบ`);
const acc0 = await q("return getComputedStyle(document.documentElement).getPropertyValue('--accent');");
const offIdx = await q("return [...document.querySelectorAll('.tncard')].findIndex((e) => !e.classList.contains('on'));");
await q(`document.querySelectorAll('.tncard')[${offIdx}].click();`); await sleep(400);
const acc1 = await q("return getComputedStyle(document.documentElement).getPropertyValue('--accent');");
check("กดการ์ดโทนแล้วสีทั้งโปรแกรมเปลี่ยน", acc0 !== acc1, `${acc0} → ${acc1}`);
await shot("03-โทนสี");
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { tone: ${JSON.stringify(before.tone)} } }); window.__applyTone(${JSON.stringify(before.tone)});`); await sleep(300);
await c.click('[data-setnav="link"]'); await sleep(400);
const modes = await q("return [...document.querySelectorAll('[data-link-mode]')].map((e) => [e.dataset.linkMode, e.getAttribute('aria-checked')]);");
check("ที่เก็บรูปมีตัวเลือกติ๊กครบ 3 แบบ", modes.length === 3, JSON.stringify(modes));
const offMode = modes.find((m) => m[1] === "false")?.[0];
if (offMode) {
  await c.click(`[data-link-mode="${offMode}"]`); await sleep(400);
  const on2 = await q("return [...document.querySelectorAll('[data-link-mode]')].filter((e) => e.getAttribute('aria-checked') === 'true').length;");
  check("ติ๊กที่เก็บรูปได้หลายแบบพร้อมกัน", on2 >= 2, `ติ๊กอยู่ ${on2} แบบ`);
  await shot("04-เก็บรูปหลายแบบ");
  await c.click(`[data-link-mode="${offMode}"]`); await sleep(400);
}

/* ---------- ตรวจไฟล์ ---------- */
await nav("ตรวจไฟล์");
const ck0 = await q("return [...document.querySelectorAll('[data-ckrow]')].map((e) => e.textContent.slice(0, 18));");
const sorts = await q("return document.querySelectorAll('[data-cksort]').length;");
check("ตรวจไฟล์ หัวคอลัมน์กดเรียงได้", sorts >= 2, `${sorts} คอลัมน์`);
if (sorts) {
  await q("document.querySelector('[data-cksort=\"size\"]').click();"); await sleep(300);
  const ck1 = await q("return [...document.querySelectorAll('[data-ckrow]')].map((e) => e.textContent.slice(0, 18));");
  check("กดหัวคอลัมน์แล้วลำดับเปลี่ยน", ck0.join() !== ck1.join());
}
const ckPin = await q(`${R} const w = document.querySelector('.ckwrap'); if (!w) return null; const sc = [...document.querySelectorAll('[data-check] *')].find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)); return { head: R(document.querySelector('[data-ckstart], [data-ckstop]')), sc: sc ? sc.className : '', page: document.querySelector('.pagewrap')?.scrollHeight - document.querySelector('.pagewrap')?.clientHeight };`);
check("ตรวจไฟล์ ก้อนหัวตรึง เลื่อนเฉพาะแถว", ckPin && ckPin.page <= 2, ckPin && `หน้าเลื่อนได้ ${ckPin.page} จุด กล่องเลื่อน ${ckPin.sc}`);
await shot("05-ตรวจไฟล์");

/* ---------- กราฟเสียง ---------- */
await q("document.querySelector('[data-cksort=\"name\"]')?.click();"); await sleep(200);
await nav("ชั้นวางหนัง");
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(400);
await q("document.querySelector('[data-shelfgraph]').click();"); await sleep(500);
// โปรแกรมจำมุมมองล่าสุด เริ่มจากรูปคลื่นเสมอ
await waitFor("return !!document.querySelector('[data-view]');", 30000);
await q("document.querySelector('[data-view=wave]').click();");
await waitFor("return !!document.querySelector('[data-graphview] [data-lanes] canvas');", 180000);
// แทร็ก 5.1 ไว้ลองปิดลำโพง
await c.click("[data-graphtrack] button"); await sleep(300);
await q("[...document.querySelectorAll('[role=option]')].find((o) => /5\\.1/.test(o.innerText))?.click();");
const loaded = await waitFor("return document.querySelectorAll('[data-graphview] [data-lanes] canvas.cv').length >= 6;", 180000);
check("กราฟเสียง เปิดไฟล์จริง แทร็ก 5.1 วาดครบ 6 ช่อง", loaded);
await sleep(800);
const g = await q(`${R} const ag = document.querySelector('[data-graphview]'), p = document.querySelector('.agb > .plot'), a = document.querySelector('.apanel'), ft = p.querySelector('.agfoot'), head = document.querySelector('.agstick');
  const f0 = R(ft); p.scrollTop = 99999; await new Promise((r) => setTimeout(r, 150)); const f1 = R(ft); const stick = R(p.querySelector('.plotstick')); const pH = R(p); p.scrollTop = 0;
  return { agScroll: ag.scrollHeight - ag.clientHeight, f0, f1, pH, stick, head: R(head), border: getComputedStyle(p).borderTopWidth, aRight: getComputedStyle(a).borderRightWidth, codec: document.querySelector('[data-graphinfo]')?.innerText.includes('Codec') };`);
check("กราฟ แบ่งสองฝั่ง กล่องนอกไม่เลื่อน", g.agScroll <= 1, `${g.agScroll} จุด`);
check("กราฟ แถวปุ่มตรึงล่าง เลื่อนแล้วไม่ขยับ", g.f0.b === g.f1.b, `ล่าง ${g.f0.b} → ${g.f1.b}`);
check("กราฟ หัวกราฟกับแถวเวลาตรึงบน", g.stick.t <= g.pH.t + 1, `หัว ${g.stick.t} กล่อง ${g.pH.t}`);
check("กราฟ ไม่มีกรอบซ้อน มีเส้นแบ่งสองฝั่ง", g.border === "0px" && g.aRight !== "0px", `กรอบ ${g.border} เส้นแบ่ง ${g.aRight}`);
check("กราฟ ข้อมูลเสียงเป็นภาษาอังกฤษ", g.codec);
await shot("06-กราฟหลัก");
// ปุ่มเปิดเล่น ความกว้างคงที่
const W = (sel) => q(`return document.querySelector(${bySel(sel)})?.getBoundingClientRect().width ?? null;`);
const w0 = await W("[data-graphplay]");
const widths = new Set([w0]);
const lane = await q(`${R} return R(document.querySelector('[data-lanes]'));`);
for (const f of [0.02, 0.2, 0.5, 0.95]) {
  await c.move(lane.l + 100 + (lane.r - lane.l - 110) * f, lane.t + 30); await sleep(120);
  widths.add(await W("[data-graphplay]"));
}
const txt = await q("return document.querySelector('[data-graphplay]').innerText.trim();");
await c.move(5, 5);
check("ปุ่มเปิดเล่น ชี้กราฟหลายจุด ความกว้างเท่าเดิม", widths.size === 1, `${[...widths].join(", ")} จุด · ล่าสุด ${txt}`);
const graphPlayStyle = await q("return getComputedStyle(document.querySelector('.tfix')).fontVariantNumeric;");
check("ตัวเลขเวลาบนปุ่มกว้างเท่ากันทุกหลัก", graphPlayStyle.includes("tabular"), graphPlayStyle);
// ปิดลำโพง
const spk = await q("return [...document.querySelectorAll('.spk .s')].map((e) => e.getAttribute('aria-label'));");
const l0 = await q(`${R} return [...document.querySelectorAll('[data-lanes] [data-lane]')].map((e) => [e.dataset.lane, R(e).t, R(e).h]);`);
await c.click(`.spk .s[aria-label="${spk[spk.length - 1]}"]`); await sleep(500);
const off = await q(`${R} const s = document.querySelector('.spk .s[aria-label^="แสดงช่อง"] circle, .spk .s[aria-label^="แสดงช่อง"] rect'); return { lanes: [...document.querySelectorAll('[data-lanes] [data-lane]')].map((e) => [e.dataset.lane, R(e).t, R(e).h]), off: document.querySelectorAll('[data-lanes] [data-off]').length, text: document.querySelector('[data-off] .laneoff')?.innerText, fill: s?.getAttribute('fill') };`);
check("ปิดลำโพง แถบยังอยู่ครบ ตำแหน่งเดิม", JSON.stringify(off.lanes) === JSON.stringify(l0), `${off.lanes.length} แถบ`);
check("ปิดลำโพง ไม่มีกราฟ ขึ้นว่าปิดลำโพง", off.off === 1 && off.text === "ปิดลำโพง", off.text);
check("ลำโพงที่ปิดเป็นสีขาวเส้นประ ไม่โดนสีเดิมทับ", off.fill === "#fff", off.fill);
await shot("07-ปิดลำโพง");
await c.click(`.spk .s[aria-label^="แสดงช่อง"]`); await sleep(500);
const reOn = await q(`const cv = document.querySelectorAll('[data-lanes] canvas.cv'); const n = document.querySelectorAll('[data-lanes] [data-off]').length; const last = cv[cv.length - 1]; const d = last.getContext('2d').getImageData(0, 0, last.width, last.height).data; let ink = 0; for (let i = 3; i < d.length; i += 400) if (d[i] > 0) ink++; return { n, ink };`);
check("เปิดลำโพงคืน กราฟกลับมาวาด", reOn.n === 0 && reOn.ink > 0, `จุดสี ${reOn.ink}`);
// ขยายเต็ม
await c.click("[data-graphwide]"); await sleep(400);
check("ปุ่มขยายพับแผงลำโพง", await q("return !document.querySelector('.apanel');"));
await c.click("[data-graphwide]"); await sleep(400);
// ทุกมุมมอง
for (const v of await q("return [...document.querySelectorAll('[data-view]')].map((e) => e.dataset.view);")) {
  await q(`document.querySelector('[data-view="${v}"]').click();`); await sleep(1400);
  const st = await q(`${R} const p = document.querySelector('.agb > .plot'), ft = p.querySelector('.agfoot'), lastB = ft ? ft.lastElementChild : null; return { ft: R(ft), pb: R(p).b, pr: R(p).r, btnR: lastB ? R(lastB).r : null, over: p.scrollWidth - p.clientWidth };`);
  check(`มุมมอง ${v} แถวปุ่มชิดล่าง ปุ่มชิดขวา ไม่ล้นขวา`, st.ft && st.ft.b <= st.pb && st.pb - st.ft.b <= 1 && st.over <= 1 && st.pr - st.btnR <= 20, JSON.stringify(st));
  await shot(`08-มุมมอง-${v}`);
}
await q(`document.querySelector('[data-view="loud"]')?.click();`); await sleep(1200);
if (await q("return !!document.querySelector('[data-table]');")) {
  const a = await W("[data-table]"); await c.click("[data-table]"); await sleep(300); const b = await W("[data-table]"); await c.click("[data-table]"); await sleep(200);
  check("ปุ่มดูเป็นตาราง สลับแล้วความกว้างเท่าเดิม", a === b, `${a} → ${b}`);
}
await q(`document.querySelector('[data-view="wave"]')?.click();`); await sleep(800);
const swHover = await q("return getComputedStyle(document.querySelector('.sws .sw')).transform;");
await c.hover(".sws .sw:not(.on)"); await sleep(200);
const swT = await q("return getComputedStyle(document.querySelector('.sws .sw:not(.on)')).transform;");
await c.move(5, 5);
check("ปุ่มชุดสีไม่ขยายตอนชี้", swT === "none", `${swHover} → ${swT}`);

/* ---------- แปลงเสียง เทียบสองไฟล์ ---------- */
await q("document.querySelector('[data-gmode=\"convert\"]').click();").catch(() => null);
await sleep(400);
if (!(await q("return !!document.querySelector('[data-qadd], [data-qall]');"))) { await nav("ตั้งค่า"); await nav("กราฟเสียง"); await q("document.querySelector('[data-gmode=\"convert\"], [data-graphconvert]')?.click();"); await sleep(400); }
const inConvert = await waitFor("return !!document.querySelector('[data-qall]');", 8000);
check("เปิดหน้าแปลงเสียงได้", inConvert);
await q(`const u = performance.getEntriesByType('resource').map((r) => r.name).find((n) => n.includes('/src/lib/convertJob.ts')) ?? '/src/lib/convertJob.ts'; const j = await import(u); window.__conv = j; j.setOutDir(${JSON.stringify(TMP)}); j.addFiles([${JSON.stringify(join(resolve(TMP), "เพลงทดสอบ.wav"))}]);`);
await waitFor("return !!document.querySelector('[data-qrow]');", 15000);
await sleep(800);
const cq = await q(`${R} const ft = document.querySelector('.cqfoot'), wrap = document.querySelector('.pagewrap') || document.querySelector('[data-graph]'); return { ft: R(ft), inner: innerHeight, dd: !!document.querySelector('[data-qall] .dd, [data-qall].dd, .cq .dd') };`);
check("หน้าแปลงเสียง แถวปุ่มตรึงล่าง", cq.ft && cq.ft.b >= cq.inner - 2, cq.ft && `ล่าง ${cq.ft.b} จาก ${cq.inner}`);
check("หน้าแปลงเสียง ตัวเลือกค่าเป็นดรอปดาวน์จริง", cq.dd);
await shot("09-คิวแปลง");
// หน้าต่างตั้งค่าเสียง ขนาดเดียวทุกแท็บ
const openPanel = await q("const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('เปิดแผงตั้งค่าเสียง')); if (!b) return false; b.click(); return true;");
if (openPanel) {
  await waitFor("return !!document.querySelector('[data-codec-panel]');", 5000); await sleep(400);
  const sizes = [];
  sizes.push(await q(`${R} return R(document.querySelector('[data-codec-panel]').closest('.dlg, [role=dialog]'));`));
  const tabs = await q("return [...document.querySelectorAll('[data-codec-panel] .seg button, .dlg .seg button')].map((b) => b.textContent.trim()).slice(0, 6);");
  for (const t of tabs) {
    await q(`[...document.querySelectorAll('[data-codec-panel] .seg button, .dlg .seg button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)})?.click();`); await sleep(250);
    sizes.push(await q(`${R} return R(document.querySelector('[data-codec-panel]').closest('.dlg, [role=dialog]'));`));
  }
  const uniq = new Set(sizes.map((s) => `${s.w}x${s.h}`));
  check("หน้าต่างตั้งค่าเสียง ทุกแท็บขนาดเดียว", uniq.size === 1, [...uniq].join(" · "));
  await shot("10-ตั้งค่าเสียง", ".dlg");
  await c.key("Escape"); await sleep(300);
} else skip("หน้าต่างตั้งค่าเสียง ทุกแท็บขนาดเดียว", "หาปุ่มเปิดแผงไม่เจอ");
await q("window.__conv.startQueue();");
const done = await waitFor("return !!document.querySelector('[data-qcmp]');", 90000);
check("แปลงเสียงจริงจบ มีปุ่มเทียบความถี่", done);
if (done) {
  await c.click("[data-qcmp]");
  const ready = await waitFor("return !!document.querySelector('[data-compare]') && !document.querySelector('[data-cmploading]') && !!document.querySelector('[data-plot]');", 120000);
  check("หน้าเทียบสองไฟล์เปิดจากไฟล์จริง", ready); await sleep(800);
  const cmp = await q(`${R} const ag = document.querySelector('[data-compare]'), p = document.querySelector('[data-compare] .agb > .plot'), a = document.querySelector('[data-compare] .apanel'), svg = document.querySelector('[data-compare] .spk'); return { agScroll: ag.scrollHeight - ag.clientHeight, border: getComputedStyle(p).borderTopWidth, aRight: getComputedStyle(a).borderRightWidth, svgH: R(svg).h, wide: !!document.querySelector('[data-graphwide]'), stick: !!p.querySelector('.plotstick') };`);
  check("หน้าเทียบ แบ่งสองฝั่ง ไม่มีกรอบซ้อน", cmp.agScroll <= 1 && cmp.border === "0px" && cmp.aRight !== "0px", JSON.stringify(cmp));
  const nSpk = await q("return document.querySelectorAll('[data-compare] .spk .s').length;");
  // ไฟล์ช่องเดียว แผนผังมีลำโพงตัวเดียว เตี้ยกว่าแบบหลายช่อง ตรวจว่าขึ้นครบไม่โดนตัด
  check("หน้าเทียบ วงที่นั่งฟังไม่โดนตัด", nSpk > 1 ? cmp.svgH >= 150 : cmp.svgH >= 50, `ลำโพง ${nSpk} ตัว สูง ${cmp.svgH}`);
  check("หน้าเทียบ มีปุ่มขยาย ตรึงหัวกราฟ", cmp.wide && cmp.stick);
  for (const k of await q("return [...document.querySelectorAll('[data-cmptab]')].map((e) => e.dataset.cmptab);")) {
    await q(`document.querySelector('[data-cmptab="${k}"]').click();`); await sleep(k === "psd" ? 2500 : 900);
    const st = await q(`${R} const p = document.querySelector('.agb > .plot'), ft = p.querySelector('.agfoot'); const f0 = R(ft); const over = p.scrollWidth - p.clientWidth; const last = [...p.children].at(-1) === ft; return { h: [p.scrollHeight, p.clientHeight], ftB: f0.b, pB: R(p).b, over, last };`);
    check(`หน้าเทียบ ${k} แถวปุ่มอยู่ล่างสุด ไม่ล้น`, st.last && st.pB - st.ftB <= 1 && st.over <= 1 && st.h[0] <= st.h[1] + 2, JSON.stringify(st));
    await shot(`11-เทียบ-${k}`);
  }
  await q(`document.querySelector('[data-cmptab="wave"]').click();`); await sleep(600);
  const cw = await q("return [...document.querySelectorAll('.agfoot button')].map((b) => b.getBoundingClientRect().width);");
  await q(`document.querySelector('[data-cmpzoom]:not(.on)')?.click();`); await sleep(500);
  await q(`[...document.querySelectorAll('[data-cmpzoom]')].at(-1)?.click();`); await sleep(500);
  const cw2 = await q("return [...document.querySelectorAll('.agfoot button')].map((b) => b.getBoundingClientRect().width);");
  check("หน้าเทียบ ปุ่มเปิดเล่นกว้างเท่าเดิมเมื่อเวลาเปลี่ยน", cw.join() === cw2.join(), `${cw.join(", ")} → ${cw2.join(", ")}`);
  await q(`[...document.querySelectorAll('[data-cmpzoom]')][0]?.click();`); await sleep(400);
  if (nSpk > 1) {
    await c.click(`[data-compare] .spk .s[aria-label^="ซ่อนช่อง"]`); await sleep(400);
    const co = await q("return { off: document.querySelectorAll('[data-compare] [data-lanes] [data-off]').length, all: document.querySelectorAll('[data-compare] [data-lanes] [data-lane]').length };");
    check("หน้าเทียบ ปิดลำโพงคงแถบทั้งสองไฟล์", co.off === 2 && co.all >= 4, JSON.stringify(co));
  } else {
    const one = await q("return document.querySelector('[data-compare] .apanel')?.innerText.includes('ไฟล์นี้มีเสียงช่องเดียว');");
    check("หน้าเทียบ ไฟล์เสียงช่องเดียว บอกว่ามีช่องเดียว ไม่มีปุ่มปิดลำโพง", one && !(await q("return !!document.querySelector('[data-compare] .spk .s[aria-label^=\"ซ่อนช่อง\"]');")));
  }
  await shot("12-เทียบ-ปิดลำโพง");
  await q("document.querySelector('[data-cmpback]').click();"); await sleep(400);
}
await q("window.__conv.clearDone?.();"); await sleep(200);

/* ---------- เสียงและซับ ---------- */
await nav("เสียงและซับ");
await q(`await window.__avDrop([${JSON.stringify(join(MOVIES, "ดาวเหนือ (2023).mkv"))}], 400, 300);`);
const avOk = await waitFor("return !!document.querySelector('.trk:not(.head)');", 30000);
check("เสียงและซับ เปิดไฟล์จริงแล้วขึ้นแทร็ก", avOk); await sleep(500);
// ไฟล์ทดสอบ 6 แทร็กที่ 1280 × 800 หน้าไม่ยาวพอให้เลื่อน (ย้ายการ์ดผลลัพธ์ไปแถบล่างแล้ว BUGS ข้อ 63) · ใส่ที่ว่างชั่วคราวเหนือกรอบตรึงล่างให้หน้าเลื่อนได้ แล้ววัดว่าแถบบนกับแถบล่างตรึงจริง เสร็จแล้วเอาออก
const av = await q(`${R} const s = document.querySelector('[data-pageslot=av] .pagewrap') || document.querySelector('.pagewrap'), top = R(document.querySelector('.avtop')), row = R(document.querySelector('.trk:not(.head)')), f0 = R(document.querySelector('.avfoot')); const short = s.scrollHeight <= s.clientHeight; let sp = null; if (short) { sp = document.createElement('div'); sp.style.height = '900px'; const dock = document.querySelector('.avdock'); (dock ? dock.parentNode : document.querySelector('.avwrap')).insertBefore(sp, dock); } s.scrollTop = 99999; await new Promise((r) => setTimeout(r, 200)); const f1 = R(document.querySelector('.avfoot')); const t1 = R(document.querySelector('.avtop')); const moved = s.scrollTop; s.scrollTop = 0; sp?.remove(); await new Promise((r) => setTimeout(r, 100)); return { top, row, f0, f1, t1, sc: R(s), short, moved };`);
check("เสียงและซับ ตารางตรงแนวแถบชื่อไฟล์", av.top.l === av.row.l && av.top.r === av.row.r, `${av.top.l}–${av.top.r} กับ ${av.row.l}–${av.row.r}`);
check("เสียงและซับ แถบปุ่มล่างไม่ขยับตอนเลื่อนสุด", av.f0.b === av.f1.b && av.f1.b === av.sc.b, `${av.f0.b} → ${av.f1.b} กล่อง ${av.sc.b}`);
check("เสียงและซับ แถบชื่อไฟล์ตรึงบน", av.moved > 0 && av.t1.t <= av.sc.t + 1, `${av.t1.t} กล่อง ${av.sc.t} เลื่อนไป ${av.moved}${av.short ? " (ใส่ที่ว่างชั่วคราวเพราะหน้าสั้น)" : ""}`);
await shot("13-เสียงซับ");
const mw = await q("const b = [...document.querySelectorAll('.avfoot button')].at(-1); return b.getBoundingClientRect().width;");
const mp4 = await q("const b = [...document.querySelectorAll('.seg button')].find((x) => x.textContent.trim() === 'MP4'); if (!b) return false; b.click(); return true;"); await sleep(500);
if (mp4) {
  const mw2 = await q("const b = [...document.querySelectorAll('.avfoot button')].at(-1); return b.getBoundingClientRect().width;");
  check("ปุ่มรวม สลับ MKV กับ MP4 กว้างเท่าเดิม", mw === mw2, `${mw} → ${mw2}`);
  await q("[...document.querySelectorAll('.seg button')].find((x) => x.textContent.includes('MKV')).click();"); await sleep(300);
}
await q("[...document.querySelectorAll('button')].find((x) => x.textContent.includes('ล้างทั้งหมด'))?.click();"); await sleep(300);

/* ---------- ใส่โปสเตอร์ ข้อมูลไฟล์ ---------- */
await nav("ใส่โปสเตอร์");
await q(`await window.__posterDrop([${JSON.stringify(join(MOVIES, "ดาวเหนือ (2023).mkv"))}], 400, 300);`); await sleep(1500);
const pst = await q(`${R} const a = document.querySelector('[data-poster-page] .pactions'); const s = document.querySelector('.pagewrap'); return a ? { a: R(a), sc: R(s), scroll: s.scrollHeight - s.clientHeight } : null;`);
check("ใส่โปสเตอร์ ปุ่มเริ่มตรึงล่าง", pst && pst.a.b <= pst.sc.b && pst.sc.b - pst.a.b <= 20, JSON.stringify(pst));
await shot("14-ใส่โปสเตอร์");

/* ---------- เมนูชั้นวางจากหน้าข้อมูลไฟล์ (พี่กันสั่งแก้ 9 พ.ย. 2569) ---------- */
await nav("ชั้นวางหนัง");
if (!(await q("return !!document.querySelector('[data-detail]');"))) await c.click('.book[data-movie="ดาวเหนือ (2023)"]');
await sleep(400);
await q("[...document.querySelectorAll('[data-detail] button')].find((b) => b.textContent.includes('MediaInfo')).click();");
const infoOpen = await waitFor("return !!document.querySelector('[data-info-page]');", 15000);
check("เปิดหน้าข้อมูลไฟล์จากแผงขวาได้", infoOpen);
await c.click("button.nav:first-of-type"); await sleep(600);
const backShelf = await q("return { info: !!document.querySelector('[data-info-page]'), shelf: document.querySelectorAll('.book[data-movie], .lv tbody tr').length, detail: !!document.querySelector('[data-detail]') };");
check("อยู่หน้าข้อมูลไฟล์ กดเมนูชั้นวางแล้วกลับชั้นวาง แผงขวายังอยู่", !backShelf.info && backShelf.shelf > 5 && backShelf.detail, JSON.stringify(backShelf));

const errs = await q("return window.__errs;");
check("ไม่มีข้อผิดพลาดในหน้าโปรแกรมตลอดการตรวจ", errs.length === 0, errs.slice(0, 4).join(" | "));
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { tone: ${JSON.stringify(before.tone)} } });`);
await nav("ชั้นวางหนัง");

skip("ลากรูปจาก Explorer จริง", "พี่กันต้องลองเอง เทสอัตโนมัติจำลองได้แค่ตัวรับไฟล์");
skip("ปุ่มขยายอ่านสีมุมรูปภายใต้ CSP", "ต้องลองกับตัวโปรแกรมที่สร้างจริง");
const fail = results.filter((r) => r.ok === false);
console.log(`\nรวม ผ่าน ${results.filter((r) => r.ok).length} · ไม่ผ่าน ${fail.length} · ยังไม่ได้ตรวจ ${results.filter((r) => r.ok === null).length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = fail.length ? 1 : 0;
