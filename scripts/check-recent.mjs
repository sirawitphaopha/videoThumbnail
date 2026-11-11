// งานแก้รอบ 9 พ.ย. 2569 ช่วงบ่าย ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-recent.mjs
// รายการเปิดล่าสุดบอกไฟล์หายก่อนกด · สวิตช์ภาพจากหนังบนชั้นวางไม่มีคำอธิบาย · ปุ่มหน้ารูปคลื่นกับหน้าความถี่อยู่แถวปุ่มมุมมอง · การ์ดโทนวงกลมไม่มีขอบ
import { copyFileSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/แก้รอบบ่าย";
mkdirSync(OUT, { recursive: true });
const MOVIES = resolve("test-media", "สร้าง", "หนัง");
const TMP = "D:/dev/tmp/ชั้นล่าสุด";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const src = join(MOVIES, "ดาวเหนือ (2023).mkv");
const movable = join(TMP, "ไฟล์ย้ายได้.mkv"), moved = join(TMP, "ย้ายไปแล้ว.mkv"), lost = join(TMP, "ไม่มีไฟล์นี้.mkv");
copyFileSync(src, movable);
const size = statSync(movable).size;

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(500); };
const row = (name) => `[...document.querySelectorAll('.recentrow')].find((r) => r.querySelector('[data-graphrecentpick]')?.dataset.graphrecentpick === ${JSON.stringify(name)})`;

/* ---------- รายการเปิดล่าสุด ---------- */
const seed = [src, movable, lost].map((p, i) => ({ path: p.replace(/\//g, "\\"), name: p.split(/[\\/]/).pop(), size, duration: 20, audioOnly: false, layout: "5.1", at: i }));
await q(`localStorage.setItem('graph-recent', ${JSON.stringify(JSON.stringify(seed))}); location.reload();`).catch(() => null);
await sleep(3000);
await waitFor("return !!document.querySelector('.nav');");
await nav("กราฟเสียง");
await q("document.querySelector('[data-graphhome]')?.click();");
check("รายการขึ้นครบ 3 แถว", await waitFor("return document.querySelectorAll('.recentrow').length === 3;"));
check("ไฟล์ที่หายขึ้นว่าหาไฟล์ไม่เจอ ก่อนกด", await waitFor(`return ${row("ไม่มีไฟล์นี้.mkv")}?.querySelector('.lostmark')?.textContent === 'หาไฟล์ไม่เจอ';`, 8000));
check("ไฟล์ที่ยังอยู่ไม่ขึ้น", await q(`return !${row("ดาวเหนือ (2023).mkv")}?.querySelector('.lostmark') && !${row("ไฟล์ย้ายได้.mkv")}?.querySelector('.lostmark');`));
await c.shot(`${OUT}/01-รายการเปิดล่าสุด.png`);
await q(`${row("ไม่มีไฟล์นี้.mkv")}.querySelector('[data-graphrecentpick]').click();`); await sleep(500);
check("กดแถวที่หาย ไม่เปิดหน้ากราฟ ไม่ขึ้นข้อความผิด", await q("return !!document.querySelector('[data-graphrecent]') && !document.querySelector('[data-view]');"));
renameSync(movable, moved);
await q("window.dispatchEvent(new Event('focus'));");
check("ย้ายไฟล์ระหว่างเปิดอยู่ กลับมาที่โปรแกรมแล้วขึ้นว่าหาย", await waitFor(`return !!${row("ไฟล์ย้ายได้.mkv")}?.querySelector('.lostmark');`, 8000));
renameSync(moved, movable);
await q("window.dispatchEvent(new Event('focus'));");
check("เอาไฟล์กลับมา ป้ายหายเอง", await waitFor(`return !${row("ไฟล์ย้ายได้.mkv")}?.querySelector('.lostmark');`, 8000));
await q(`${row("ไม่มีไฟล์นี้.mkv")}.querySelector('[data-graphforget]').click();`); await sleep(300);
check("กากบาทเอาแถวที่หายออกจากรายการได้", await q("return document.querySelectorAll('.recentrow').length === 2;"));
check("ค่าตั้งเก็บเฉพาะแถวที่เหลือ", await q("return JSON.parse(localStorage.getItem('graph-recent')).length === 2;"));

/* ---------- ปุ่มเลือกแบบ อยู่แถวปุ่มมุมมอง ยกเว้นหน้าวิเคราะห์ ---------- */
await q(`${row("ดาวเหนือ (2023).mkv")}.querySelector('[data-graphrecentpick]').click();`);
await waitFor("return !!document.querySelector('[data-view]');", 30000);
const place = async (v, attr) => {
  await q(`document.querySelector('[data-view=${v}]').click();`);
  await waitFor(`return !!document.querySelector('[${attr}]');`, 60000); await sleep(600);
  return q(`const b = document.querySelector('[${attr}]'); const row = b.closest('.agctl'), plot = b.closest('[data-plot]'); const r = document.querySelector('.agctl').getBoundingClientRect(); return { inCtl: !!row, inPlot: !!plot, one: r.height < 60, h: Math.round(r.height), over: [...document.querySelectorAll('.agctl > *')].some((e) => e.getBoundingClientRect().right > innerWidth) };`);
};
const w = await place("wave", "data-style");
check("ปุ่มเส้นละเอียด แท่ง Audacity อยู่แถวปุ่มมุมมอง ไม่อยู่ในกรอบกราฟ", w.inPlot && w.one && !w.over, JSON.stringify(w));
await c.shot(`${OUT}/02-รูปคลื่น-ปุ่มที่เดิม.png`);
await waitFor("return [...document.querySelectorAll('[data-lanes] canvas')].some((x) => x.clientHeight > 0);", 30000);
const laneW = await q("return Math.max(0, ...[...document.querySelectorAll('[data-lanes] canvas')].map((x) => x.clientHeight));");
// ชุด 5 รวมมุมมองความถี่เข้าหน้าวิเคราะห์ ไม่มีแท็บ spec แยกแล้ว
const k = await place("spek", "data-scmap");
check("ปุ่มสีหน้าวิเคราะห์อยู่บนกราฟ ไม่อยู่แถวปุ่มมุมมอง", !k.inCtl && k.inPlot, JSON.stringify(k));
check("แถบกราฟสูงพอ ได้ที่คืนจากการย้าย", laneW >= 72, laneW);
await q("document.querySelector('[data-view=wave]').click();");

/* ---------- สวิตช์ภาพจากหนัง ---------- */
await nav("ชั้นวางหนัง");
await q("document.querySelector('[aria-label=\"การแสดงผล\"]')?.click();");
await waitFor("return !!document.querySelector('[data-showframes]');", 5000);
await sleep(500); // รอแอนิเมชันกางจบ ภาพไม่โปร่ง
const menu = await q("const r = document.querySelector('[data-showframes]').closest('.setrow'), l = r.querySelector('.lbl'), g = document.createRange(); g.selectNodeContents(l); const m = r.closest('.menu').getBoundingClientRect(); return { small: !!r.querySelector('.small'), text: l.textContent, h: Math.round(g.getBoundingClientRect().height), lh: parseFloat(getComputedStyle(l).lineHeight), w: Math.round(m.width), right: m.right <= innerWidth };");
check("สวิตช์บนชั้นวางไม่มีคำอธิบาย", !menu.small && menu.text === "ภาพจากหนังในเรื่องที่ยังไม่มีปก", JSON.stringify(menu));
check("ชื่อสวิตช์บรรทัดเดียว", menu.h <= menu.lh + 2, JSON.stringify(menu));
const mb = await q("const m = document.querySelector('[data-showframes]').closest('.menu').getBoundingClientRect(); return { x: m.left, y: m.top, width: m.width, height: m.height };");
await c.shotRect(`${OUT}/04-สวิตช์ชั้นวาง.png`, mb.x - 8, mb.y - 8, mb.width + 16, mb.height + 16);
await c.key("Escape"); await sleep(300);

/* ---------- ตั้งค่า ---------- */
await nav("ตั้งค่า");
await c.setNav("shelf");
const set = await q("const r = [...document.querySelectorAll('[data-setcard=shelf] .setrow')].find((x) => x.textContent.includes('ภาพจากหนัง')); return { text: r?.querySelector('.small')?.textContent ?? '', y: r?.getBoundingClientRect().top };");
check("หน้าตั้งค่าอธิบายยาว", set.text.length > 80 && set.text.includes("ไม่เขียนลงไฟล์หนัง"), set.text.length + " ตัวอักษร");
await c.shot(`${OUT}/05-สวิตช์ตั้งค่า.png`);
await c.setNav("tone");
const dot = await q("const i = document.querySelector('.tnrgb i'), s = getComputedStyle(i); const all = [...document.querySelectorAll('.tnrgb > span')]; return { radius: s.borderRadius, border: s.borderTopWidth, w: i.offsetWidth, h: i.offsetHeight, bg: s.backgroundColor, code: all[2]?.textContent, n: all.length };");
check("การ์ดโทน วงกลมไม่มีขอบ", dot.radius === "50%" && parseFloat(dot.border) === 0 && dot.w === dot.h, JSON.stringify(dot));
check("คงรหัสสีครบทุกการ์ด 5 โทน โทนละ 3 สี", dot.n === 15 && /#[0-9A-F]{6}/.test(dot.code), dot.code);
await c.shot(`${OUT}/06-การ์ดโทน.png`, ".tncards", 12);

await nav("ชั้นวางหนัง");
await q("localStorage.removeItem('graph-recent');");
rmSync(TMP, { recursive: true, force: true });
const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
