// ตรวจของงานปรับหน้าตาบนตัวโปรแกรมที่สร้างจริง ภายใต้กติกาความปลอดภัย (CSP) ซึ่งโหมดพัฒนาไม่ใช้
// ใช้: เปิด scripts/dev-app.ps1 -Built แล้ว node scripts/check-look-built.mjs
// ปุ่มขยายอ่านสีมุมรูปผ่าน asset · ตัวดูรูปเต็มจอ · โทนสี · ปุ่มเวลาคงที่ · ปิดลำโพง · เมนูชั้นวาง · ไม่มีอะไรโดน CSP
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/โปรแกรมจริง";
mkdirSync(OUT, { recursive: true });
const MOVIES = resolve("test-media", "สร้าง", "หนัง");
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(500); };

await c.send("Page.enable");
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));" });
const before = await q("return (await window.__TAURI_INTERNALS__.invoke('get_settings')).settings.tone;");
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { folders: [${JSON.stringify(MOVIES)}], viewMode: 'grid', coverOrient: 'tall', coverSize: 'm' } });`);
await q("location.reload();").catch(() => null);
await sleep(3000);
await waitFor("return document.querySelectorAll('.book[data-movie]').length > 5;", 60000);
check("ตัวจริงเปิดจาก tauri.localhost ใช้กติกาความปลอดภัยจริง", (await q("return location.host;")) === "tauri.localhost", await q("return location.host;"));

/* ---------- ปุ่มขยายอ่านสีมุมรูปผ่าน asset ---------- */
await c.book("Harbor Lights (2021)"); await sleep(800);
const big = await q(`const im = document.querySelector('.dpbig img'), b = document.querySelector('.dpbig [data-bigbtn]'); return { src: im?.src.slice(0, 40), loaded: im?.naturalWidth > 0, style: b?.getAttribute('style') ?? '' };`);
check("รูปในแผงขวาโหลดได้ใต้ CSP", big.loaded, big.src);
check("ปุ่มขยายอ่านสีมุมรูปได้ สีปุ่มเปลี่ยนตามรูป", /background|color/.test(big.style), big.style);
await c.hover(".dpbig"); await sleep(300);
await c.shot(`${OUT}/21-ตัวจริง-ปุ่มขยาย.png`, "[data-detail]", 0);
await q("document.querySelector('.dpbig [data-bigbtn]').click();");
const iv = await waitFor("return !!document.querySelector('.ivw-btn');", 8000);
check("ปุ่มขยายเปิดตัวดูรูปเต็มจอ", iv); await sleep(1200);
const viewerImg = await q("const area = (x) => { const r = x.getBoundingClientRect(); return r.width * r.height; }; const im = [...document.images].filter((x) => x.complete && x.naturalWidth > 0).sort((a, b) => area(b) - area(a))[0]; return im ? { w: im.naturalWidth, h: im.naturalHeight, จอ: Math.round(area(im)) } : null;");
check("ตัวดูรูปโหลดรูปเต็ม (poster_view) ใต้ CSP", viewerImg && viewerImg.w > 0 && viewerImg.จอ > 100000, JSON.stringify(viewerImg));
await c.shot(`${OUT}/22-ตัวจริง-ตัวดูรูป.png`);
await c.key("Escape"); await sleep(400);

/* ---------- โทนสี ---------- */
await nav("ตั้งค่า");
await c.setNav("tone");
const a0 = await q("return getComputedStyle(document.documentElement).getPropertyValue('--accent');");
const idx = await q("return [...document.querySelectorAll('.tncard')].findIndex((e) => !e.classList.contains('on'));");
await q(`document.querySelectorAll('.tncard')[${idx}].click();`); await sleep(500);
const toneNow = await q("return { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent'), side: getComputedStyle(document.querySelector('.side')).backgroundColor, btn: getComputedStyle(document.querySelector('.tncard.on') ?? document.body).borderTopColor };");
check("โทนสีเปลี่ยนได้ในตัวจริง สไตล์แปลงได้ใต้ CSP", toneNow.accent !== a0, `${a0} → ${toneNow.accent}`);
await c.shot(`${OUT}/23-ตัวจริง-โทนสี.png`);
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { tone: ${JSON.stringify(before)} } }); window.__applyTone(${JSON.stringify(before)});`); await sleep(300);

/* ---------- กราฟ ปุ่มเวลา ปิดลำโพง ---------- */
await nav("ชั้นวางหนัง");
await c.book("ดาวเหนือ (2023)"); await sleep(400);
await q("document.querySelector('[data-shelfgraph]').click();");
// โปรแกรมจำมุมมองล่าสุด เริ่มจากรูปคลื่นเสมอ
await waitFor("return !!document.querySelector('[data-view]');", 30000);
await q("document.querySelector('[data-view=wave]').click();");
await waitFor("return !!document.querySelector('[data-graphview] [data-lanes] canvas');", 120000);
await c.click("[data-graphtrack] button"); await sleep(300);
await q("[...document.querySelectorAll('[role=option]')].find((o) => /5\\.1/.test(o.innerText))?.click();");
check("กราฟในตัวจริง แทร็ก 5.1 ครบ 6 ช่อง", await waitFor("return document.querySelectorAll('[data-graphview] [data-lanes] canvas.cv').length >= 6;", 120000));
await sleep(600);
const lane = await q("const r = document.querySelector('[data-lanes]').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top };");
const widths = new Set();
for (const f of [0.02, 0.5, 0.95]) { await c.move(lane.l + 100 + (lane.r - lane.l - 110) * f, lane.t + 30); await sleep(120); widths.add(await q("return document.querySelector('[data-graphplay]').getBoundingClientRect().width;")); }
await c.move(5, 5);
check("ปุ่มเปิดเล่นกว้างคงที่ในตัวจริง", widths.size === 1, [...widths].join(", "));
await c.click('.spk .s[aria-label="ซ่อนช่อง LFE"]'); await sleep(400);
const off = await q("const s = document.querySelector('.spk .s[aria-label^=\"แสดงช่อง\"] rect, .spk .s[aria-label^=\"แสดงช่อง\"] circle'); return { all: document.querySelectorAll('[data-lanes] [data-lane]').length, off: document.querySelectorAll('[data-lanes] [data-off]').length, fill: s?.getAttribute('fill') };");
check("ปิดลำโพงในตัวจริง แถบครบ ขึ้นปิดลำโพง ลำโพงสีขาว", off.all === 6 && off.off === 1 && off.fill === "#fff", JSON.stringify(off));
await c.shot(`${OUT}/24-ตัวจริง-ปิดลำโพง.png`);
await c.click('.spk .s[aria-label^="แสดงช่อง"]'); await sleep(300);

/* ---------- เมนูชั้นวางจากหน้าข้อมูลไฟล์ ---------- */
await nav("ชั้นวางหนัง");
await c.book("ดาวเหนือ (2023)"); await sleep(400);
await q("[...document.querySelectorAll('[data-detail] button')].find((b) => b.textContent.includes('ข้อมูลไฟล์')).click();");
await waitFor("return !!document.querySelector('[data-info-page]');", 15000);
await c.click("button.nav:first-of-type"); await sleep(500);
const back = await q("return { info: !!document.querySelector('[data-info-page]'), books: document.querySelectorAll('.book[data-movie]').length };");
check("อยู่หน้าข้อมูลไฟล์ กดเมนูชั้นวางแล้วกลับชั้นวาง", !back.info && back.books > 5, JSON.stringify(back));

const csp = await q("return window.__csp ?? null;");
check("ไม่มีอะไรโดนกติกาความปลอดภัยตลอดการตรวจ", Array.isArray(csp) && csp.length === 0, JSON.stringify((csp ?? []).slice(0, 4)));
const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส-ตัวจริง.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
