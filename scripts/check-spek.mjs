// ปุ่มสีบนกราฟวิเคราะห์ ปุ่มพื้นสว่าง ไม่มีคำว่าชั้นหนัง ชื่อไฟล์ยาวไม่ชนปุ่ม รูปที่บันทึกเต็มชื่อ
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-spek.mjs
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/ปุ่มสีกราฟดำ";
mkdirSync(OUT, { recursive: true });
const TMP = "D:/dev/tmp/ชั้นชื่อยาว";
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const LONG = "ดาวเหนือ ฉบับผู้กำกับตัดต่อใหม่ (2023) 2160p UHD BluRay REMUX HEVC DTS-HD MA 7.1-TEAM.mkv";
const longPath = join(TMP, LONG);
copyFileSync(resolve("test-media", "สร้าง", "หนัง", "ดาวเหนือ (2023).mkv"), longPath);

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(600); };
/* สีของจุดบนกราฟ ที่พิกัดในกรอบกราฟ */
const pixel = (x, y) => q(`const v = document.querySelector('[data-spek]'), g = v.getContext('2d'), r = v.width / v.clientWidth, d = g.getImageData(${x} * r, ${y} * r, 1, 1).data; return [d[0], d[1], d[2]];`);

const seed = [{ path: longPath.replace(/\//g, "\\"), name: LONG, size: 1, duration: 20, audioOnly: false, layout: "5.1", at: 1 }];
await q(`localStorage.setItem('graph-recent', ${JSON.stringify(JSON.stringify(seed))}); localStorage.setItem('graph-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('graph-prefs') ?? '{}'), spekLight: false, scmap: 'heat' })); location.reload();`).catch(() => null);
await sleep(3000); await waitFor("return !!document.querySelector('.nav');");

/* ---------- ชื่อสั้น ---------- */
await nav("ชั้นวางหนัง");
await c.book("ดาวเหนือ (2023)"); await sleep(400);
await q("document.querySelector('[data-shelfgraph]').click();");
await waitFor("return !!document.querySelector('[data-view]');");
await q("document.querySelector('[data-view=spek]').click();");
check("เปิดหน้าวิเคราะห์ได้", await waitFor("return !!document.querySelector('[data-spek]');", 90000));
await sleep(800);
const geo = () => q(`const cv = document.querySelector('[data-spek]').getBoundingClientRect(), t = document.querySelector('[data-plottools]').getBoundingClientRect(), o = document.querySelector('.agb .plotstick')?.getBoundingClientRect(); return { canvasW: cv.width, toolRight: t.right - cv.left, frameRight: cv.width - 92, toolTop: t.top - cv.top, toolBottom: t.bottom - cv.top, toolLeft: t.left - cv.left, buttons: document.querySelectorAll('[data-plottools] [data-scmap]').length, tick: !!document.querySelector('[data-speklight]'), texts: [...document.querySelectorAll('[data-plottools] [data-scmap]')].map((b) => b.textContent), inStick: !!document.querySelector('.plotstick [data-plottools]') };`);
const g1 = await geo();
check("ขอบขวาแถวปุ่มตรงเส้นขาวกรอบกราฟ", Math.abs(g1.toolRight - g1.frameRight) <= 1, `${g1.toolRight} กับ ${g1.frameRight}`);
check("ปุ่มอยู่ในหัวกราฟ ไม่ทับกรอบ", g1.toolTop >= 0 && g1.toolBottom <= 58, JSON.stringify([g1.toolTop, g1.toolBottom]));
check("ปุ่มสีครบ 4 พร้อมชื่อ มีปุ่มติ๊กพื้นสว่าง ไม่ได้อยู่แถวบน", g1.buttons === 4 && g1.tick && !g1.inStick && g1.texts.join() === "สีความร้อน,สีรุ้ง,ขาวดำ,สีตามชุด", g1.texts.join());
const dark = await pixel(5, 5);
check("ค่าตั้งต้นพื้นดำ", dark.join() === "0,0,0", dark.join());
const wm = await pixel(g1.canvasW - 30, 18);
check("ไม่มีคำว่าชั้นหนังมุมขวาบน", wm.join() === "0,0,0", wm.join());
await q("document.querySelector('[data-speklight]').blur?.();");
await c.shot(`${OUT}/01-พื้นดำ.png`, "[data-plot]", 0);

/* ---------- ปุ่มสี ---------- */
const before = await q("return document.querySelector('[data-spek]').toDataURL().length;");
await c.click('[data-scmap="rainbow"]'); await sleep(600);
const after = await q("return document.querySelector('[data-spek]').toDataURL().length;");
check("กดสีรุ้ง กราฟเปลี่ยนจริง", before !== after && await q("return document.querySelector('[data-scmap=rainbow]').classList.contains('on');"));
await c.click('[data-scmap="heat"]'); await sleep(400);

/* ---------- พื้นสว่าง ---------- */
await c.click("[data-speklight]"); await sleep(600);
const light = await pixel(5, 5);
const inside = await pixel(120, 100);
check("ติ๊กแล้วพื้นเป็นสว่าง", light.join() === "255,255,255", light.join());
check("ช่วงเงียบในกรอบเป็นสีอ่อน ไม่เป็นก้อนดำ", inside[0] > 200 && inside[1] > 200, inside.join());
const tk = await q("const b = document.querySelector('[data-speklight]'); return { checked: b.getAttribute('aria-checked'), svg: !!b.querySelector('svg'), saved: JSON.parse(localStorage.getItem('graph-prefs')).spekLight };");
check("ปุ่มขึ้นติ๊ก จำค่าไว้", tk.checked === "true" && tk.svg && tk.saved === true, JSON.stringify(tk));
const lg = await geo();
check("ติ๊กแล้วปุ่มไม่ขยับ ไม่เปลี่ยนขนาด", Math.abs(lg.toolLeft - g1.toolLeft) <= 1, `${lg.toolLeft} กับ ${g1.toolLeft}`);
await c.shot(`${OUT}/02-พื้นสว่าง.png`, "[data-plot]", 0);
await c.click('[data-scmap="rainbow"]'); await sleep(500); await c.shot(`${OUT}/03-พื้นสว่าง-สีรุ้ง.png`, "[data-plot]", 0);
await c.click('[data-scmap="mono"]'); await sleep(500); await c.shot(`${OUT}/04-พื้นสว่าง-ขาวดำ.png`, "[data-plot]", 0);
await c.click('[data-scmap="theme"]'); await sleep(500); await c.shot(`${OUT}/05-พื้นสว่าง-สีตามชุด.png`, "[data-plot]", 0);
await c.click('[data-scmap="heat"]'); await sleep(300);
await c.click("[data-speklight]"); await sleep(500);
check("เอาติ๊กออก กลับพื้นดำ", (await pixel(5, 5)).join() === "0,0,0");

/* ---------- ซูมแนวตั้ง ---------- */
await q("document.querySelector('[data-speklight]').getAttribute('aria-checked') === 'true' && document.querySelector('[data-speklight]').click();"); await sleep(300);
const fz0 = await q("return { knob: !!document.querySelector('[data-fzknob]'), val: document.querySelector('[data-fzval]').textContent, vs: !!document.querySelector('[data-spekvs]'), url: document.querySelector('[data-spek]').toDataURL().length, h: document.querySelector('[data-fzoom]').getBoundingClientRect().height, cv: document.querySelector('[data-spek]').getBoundingClientRect().height };");
check("มีแถบซูมแนวตั้ง เริ่ม 1× ยังไม่มีแถบเลื่อน สูงเท่ากราฟ", fz0.knob && fz0.val === "1×" && !fz0.vs && Math.abs(fz0.h - fz0.cv) <= 1, JSON.stringify(fz0));
await q("document.querySelector('[data-fzknob]').focus();"); await c.key("PageUp"); await sleep(500); await c.key("PageUp"); await sleep(700);
const fz1 = await q("const v = document.querySelector('[data-spekvs]'), th = document.querySelector('[data-spekthumb]'); return { val: document.querySelector('[data-fzval]').textContent, vs: !!v, ratio: v && th.getBoundingClientRect().height / v.getBoundingClientRect().height, url: document.querySelector('[data-spek]').toDataURL().length };");
check("กด PageUp สองครั้ง ซูม 4× แถบเลื่อนกินหนึ่งในสี่ กราฟเปลี่ยน", fz1.val === "4×" && Math.abs(fz1.ratio - 0.25) < 0.02 && fz1.url !== fz0.url, JSON.stringify(fz1));
const mid = await q("const th = document.querySelector('[data-spekthumb]').getBoundingClientRect(), v = document.querySelector('[data-spekvs]').getBoundingClientRect(); return Math.abs((th.top + th.bottom) / 2 - (v.top + v.bottom) / 2);");
check("ซูมแล้วคงกึ่งกลางเดิม ไม่กระโดด", mid <= 2, mid);
await c.shot(`${OUT}/07-ซูมแนวตั้ง-4เท่า.png`, "[data-plot]", 0);
const box = await q("const r = document.querySelector('[data-spekvs]').getBoundingClientRect(); return { x: r.left + 5, top: r.top + 3, bottom: r.bottom - 3 };");
await c.move(box.x, box.top); await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.top, button: "left", clickCount: 1 }); await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.top, button: "left", clickCount: 1 }); await sleep(600);
const top = await q("const th = document.querySelector('[data-spekthumb]').getBoundingClientRect(), v = document.querySelector('[data-spekvs]').getBoundingClientRect(); return { gap: th.top - v.top, url: document.querySelector('[data-spek]').toDataURL().length };");
check("กดบนสุดของแถบเลื่อน ไปย่านความถี่สูงสุด กราฟเปลี่ยน", Math.abs(top.gap) <= 1 && top.url !== fz1.url, JSON.stringify(top));
await c.shot(`${OUT}/08-ซูมแนวตั้ง-ย่านสูง.png`, "[data-plot]", 0);
/* ลากบนกราฟ */
const drag = async (dx, dy) => { const r = await q("const r = document.querySelector('[data-spek]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };"); const M = (type, x, y, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra }); await c.move(r.x, r.y); await M("mousePressed", r.x, r.y, { clickCount: 1 }); for (let i = 1; i <= 5; i++) { await M("mouseMoved", r.x + dx * i / 5, r.y + dy * i / 5, { buttons: 1 }); await sleep(30); } await M("mouseReleased", r.x + dx, r.y + dy, { clickCount: 1 }); await sleep(500); };
const thumbPos = () => q("const th = document.querySelector('[data-spekthumb]').getBoundingClientRect(), v = document.querySelector('[data-spekvs]').getBoundingClientRect(); return Math.round(th.top - v.top);");
check("ซูมแล้วเคอร์เซอร์เป็นรูปมือ", (await q("return getComputedStyle(document.querySelector('[data-spek]')).cursor;")) === "grab");
const y0 = await thumbPos();
await drag(0, 120);
const y1 = await thumbPos();
check("ลากลง กราฟตามมือ ไปย่านความถี่สูงขึ้น", y1 < y0 || (y0 === 0 && y1 === 0), `${y0} ไป ${y1}`);
await drag(0, -200);
const y2 = await thumbPos();
check("ลากขึ้น ไปย่านความถี่ต่ำลง", y2 > y1, `${y1} ไป ${y2}`);
check("ปล่อยเมาส์แล้วเลิกลาก", (await q("return document.querySelector('[data-spek]').classList.contains('dragging');")) === false);
await q("document.querySelector('[data-zoomin]').click();"); await sleep(400); await q("document.querySelector('[data-zoomin]').click();"); await sleep(1500);
const tTh = () => q("const e = document.querySelector('.tscroll .thumb'); return e ? e.getBoundingClientRect().left : null;");
const x0 = await tTh();
await drag(-150, 0); await sleep(800);
const x1 = await tTh();
check("ซูมเวลาแล้วลากซ้าย เลื่อนไปเวลาถัดไป", x0 != null && x1 > x0, `${x0} ไป ${x1}`);
const y3 = await thumbPos();
check("ลากซ้ายขวาล้วน ย่านความถี่ไม่ขยับ", y3 === y2, `${y2} ไป ${y3}`);
await c.click('[data-zoom="all"]'); await sleep(600);
await q("document.querySelector('[data-fzknob]').focus();"); await c.key("Home"); await sleep(600);
await sleep(100);
check("ไม่ได้ซูมแกนไหนเลย ลากไม่ได้ เคอร์เซอร์ปกติ", (await q("return document.querySelector('[data-spek]').classList.contains('spekpan');")) === false);
const fz2 = await q("return { val: document.querySelector('[data-fzval]').textContent, vs: !!document.querySelector('[data-spekvs]') };");
check("Home กลับ 1× แถบเลื่อนหาย", fz2.val === "1×" && !fz2.vs, JSON.stringify(fz2));
const g2 = await geo();
check("ซูมแล้วขอบขวาปุ่มยังตรงเส้นกรอบ", Math.abs(g2.toolRight - g2.frameRight) <= 1, `${g2.toolRight} กับ ${g2.frameRight}`);

/* ---------- ชื่อไฟล์ยาว ---------- */
await q("document.querySelector('[data-graphhome]').click();");
const pickLong = `[...document.querySelectorAll('[data-graphrecentpick]')].find((b) => b.dataset.graphrecentpick === ${JSON.stringify(LONG)})`;
await waitFor(`return !!${pickLong};`);
await q(`${pickLong}.click();`);
await waitFor("return !!document.querySelector('[data-spek]');", 90000); await sleep(1200);
check("เปิดไฟล์ชื่อยาวจริง", await q(`return document.querySelector('[data-graphtags]')?.textContent.startsWith('ดาวเหนือ ฉบับผู้กำกับ');`), await q("return document.querySelector('[data-graphtags]')?.textContent.slice(0, 40);"));
const room = await q(`const t = document.querySelector('[data-plottools]').getBoundingClientRect(), cv = document.querySelector('[data-spek]'), r = cv.getBoundingClientRect(), g = cv.getContext('2d'), sc = cv.width / cv.clientWidth, x = t.left - r.left - 4; const col = []; for (let y = 10; y < 46; y += 2) { const d = g.getImageData(x * sc, y * sc, 1, 1).data; col.push(d[0] + d[1] + d[2]); } return { max: Math.max(...col), x };`);
check("ชื่อไฟล์ยาวตัดก่อนถึงปุ่ม", room.max === 0, JSON.stringify(room));
await c.shot(`${OUT}/06-ชื่อยาว.png`, "[data-plot]", 0);
// รูปที่จะบันทึกต้องเต็มชื่อ ไม่ติดปุ่ม · ใช้ window.__saveDry ห้ามกดโดยไม่ตั้งค่านี้ กล่องเลือกที่บันทึกจะเด้งขึ้นจอ (invoke ของ Tauri แก้ทับไม่ได้ เคยพลาด 9 พ.ย. 2569)
const exported = await q(`let cv = null; window.__saveDry = (x) => { cv = x; };
  [...document.querySelectorAll('[data-plot] .agfoot button')].find((b) => b.textContent.includes('บันทึกเป็นรูป')).click();
  const t0 = Date.now(); while (!cv && Date.now() - t0 < 5000) await new Promise((res) => setTimeout(res, 50));
  delete window.__saveDry;
  if (!cv) return null;
  const t = document.querySelector('[data-plottools]').getBoundingClientRect(), r = document.querySelector('[data-spek]').getBoundingClientRect(), sc = cv.width / r.width, g = cv.getContext('2d');
  let ink = 0; const d = g.getImageData(Math.round((t.left - r.left + 6) * sc), Math.round(12 * sc), Math.round((t.width - 12) * sc), Math.round(14 * sc)).data; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 300) ink++;
  return { ink, size: [cv.width, cv.height] };`);
check("ปุ่มบันทึกเป็นรูปส่งรูปออกมา ไม่มีกล่องเด้ง", exported && exported.size[0] > 0, JSON.stringify(exported));
check("รูปที่บันทึกมีชื่อไฟล์เต็ม ไม่โดนตัดตามปุ่ม", exported && exported.ink > 50, exported && exported.ink);

await q(`const p = JSON.parse(localStorage.getItem('graph-prefs')); p.view = 'wave'; p.spekLight = false; localStorage.setItem('graph-prefs', JSON.stringify(p)); localStorage.removeItem('graph-recent'); location.reload();`).catch(() => null);
await sleep(2500); await waitFor("return !!document.querySelector('.nav');");
rmSync(TMP, { recursive: true, force: true });
const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
