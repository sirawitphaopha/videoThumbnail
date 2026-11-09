// ปุ่มเปิดปิดภาพจากหนังในเรื่องที่ยังไม่มีปก (พี่กันสั่ง 9 พ.ย. 2569)
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-frames.mjs · --built บนตัวโปรแกรมที่สร้างจริง
// ผ่านเมื่อ กดเปิดเห็นภาพจากหนัง · กดปิดเป็นแถบทะแยง · จำค่าไว้ · เรื่องที่มีปกไม่เปลี่ยน · ไม่นับเป็นปก · ไฟล์หนังไม่ถูกแตะ
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const BUILT = process.argv.includes("--built");
const OUT = "docs/report-2026-11-09/โปรแกรมจริง";
mkdirSync(OUT, { recursive: true });
const MOVIES = resolve("test-media", "สร้าง", "หนัง");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const hashes = () => Object.fromEntries(readdirSync(MOVIES).filter((n) => statSync(join(MOVIES, n)).isFile()).map((n) => [n, sha(join(MOVIES, n))]));
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(200); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(500); };
const before = hashes();

await c.send("Page.enable");
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));" });
await q(`await window.__TAURI_INTERNALS__.invoke('set_settings', { patch: { folders: [${JSON.stringify(MOVIES)}], showFrames: false, viewMode: 'grid', coverOrient: 'tall', coverSize: 'm' } });`);
await q("location.reload();").catch(() => null);
await sleep(2500);
await waitFor("return document.querySelectorAll('.book[data-movie]').length > 5;", 60000);
await nav("ชั้นวางหนัง");
await q("document.querySelector('[data-detailclose]')?.click();"); await sleep(200);

const counts = () => q("const v = [...document.querySelectorAll('.book[data-movie]')]; return { books: v.length, frames: document.querySelectorAll('.book [data-frame]').length, stripes: document.querySelectorAll('.book .cover.none').length, tabs: [...document.querySelectorAll('[data-shelf-tab], .topbar .seg button')].map((b) => b.innerText.trim()).filter((t) => /ปก/.test(t)).slice(0, 3).join(' · ') };");
const off0 = await counts();
check("ปิดอยู่ เรื่องที่ไม่มีปกเป็นแถบทะแยงทั้งหมด ไม่มีภาพจากหนัง", off0.frames === 0 && off0.stripes > 5, JSON.stringify(off0));

// กดเปิดที่ปุ่มจริงในแผงการแสดงผลบนชั้นวาง
await q("[...document.querySelectorAll('.topbar button')].at(-1).click();"); await sleep(300);
check("แผงการแสดงผลบนชั้นวางมีปุ่มนี้", await q("return !!document.querySelector('[data-showframes] [role=switch]');"));
await c.shot(`${OUT}/40-ปุ่มภาพจากหนัง.png`, ".menu", 6);
await c.click("[data-showframes] [role=switch]"); await sleep(300);
const saved = await q("return (await window.__TAURI_INTERNALS__.invoke('get_settings')).settings.showFrames;");
check("กดเปิดแล้วจำค่าลงการตั้งค่า", saved === true);
await q("document.body.click();"); await c.key("Escape"); await sleep(200);
const appeared = await waitFor("return document.querySelectorAll('.book [data-frame] img').length >= 4;", 90000);
await waitFor("return [...document.querySelectorAll('.book [data-frame] img')].every((i) => i.complete && i.naturalWidth > 0);", 15000);
const on = await counts();
check("เปิดแล้ว เรื่องที่ไม่มีปกขึ้นภาพจากหนัง", appeared, JSON.stringify(on));
const loaded = await q("const a = [...document.querySelectorAll('.book [data-frame] img')]; return { all: a.length, ok: a.filter((i) => i.complete && i.naturalWidth > 0).length, src: a[0]?.src.slice(0, 30) };");
check("ภาพจากหนังโหลดขึ้นจริงทุกรูป", loaded.all > 0 && loaded.all === loaded.ok, JSON.stringify(loaded));
check("ตัวกรองยังนับตามเดิม ภาพจากหนังไม่นับเป็นปก", on.tabs === off0.tabs, on.tabs);
// รอให้เรื่องที่เห็นบนจอดึงภาพครบก่อนถ่าย
await waitFor("const h = innerHeight; return ![...document.querySelectorAll('.book .cover.none')].some((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < h - 40; });", 45000);
await sleep(400);
await c.shot(`${OUT}/41-ภาพจากหนัง-เปิด.png`);
const coverSame = await q(`const b = document.querySelector('.book[data-movie="Harbor Lights (2021)"]'); return b ? !b.querySelector('[data-frame]') : true;`);
check("เรื่องที่มีปกแล้ว ยังใช้ปกเดิม", coverSame);

// แผงขวาบอกว่าไม่ใช่ปก
await c.book("ดาวเหนือ (2023)"); await sleep(600);
await waitFor("return !!document.querySelector('[data-detail] [data-frame] img');", 30000);
const dp = await q("const d = document.querySelector('[data-detail]'); return { frame: !!d.querySelector('[data-frame] img'), text: d.innerText.includes('ยังไม่ใช่ปก') };");
check("แผงขวาแสดงภาพจากหนัง บอกว่ายังไม่ใช่ปก", dp.frame && dp.text, JSON.stringify(dp));
await c.shot(`${OUT}/42-ภาพจากหนัง-แผงขวา.png`, "[data-detail]", 0);
await q("document.querySelector('[data-detailclose]')?.click();"); await sleep(200);

// ตาราง
await q("[...document.querySelectorAll('.topbar .seg button')].find((b) => b.textContent.trim() === 'ตาราง').click();"); await sleep(500);
await waitFor("return document.querySelectorAll('.lv img[data-frame]').length >= 4;", 40000);
check("ตารางชั้นวางขึ้นภาพจากหนังด้วย", await q("return document.querySelectorAll('.lv img[data-frame]').length >= 4;"));
await c.shot(`${OUT}/43-ภาพจากหนัง-ตาราง.png`);
await q("[...document.querySelectorAll('.topbar .seg button')].find((b) => b.textContent.trim() === 'ภาพปก').click();"); await sleep(400);

// ภาพเดิมเมื่อโหลดใหม่ ไม่สุ่มใหม่ทุกครั้ง
const src1 = await q(`return document.querySelector('.book[data-movie="ดาวเหนือ (2023)"] [data-frame] img')?.src ?? '';`);
await q("location.reload();").catch(() => null); await sleep(2500);
await waitFor(`return !!document.querySelector('.book[data-movie="ดาวเหนือ (2023)"] [data-frame] img');`, 30000);
const src2 = await q(`return document.querySelector('.book[data-movie="ดาวเหนือ (2023)"] [data-frame] img')?.src ?? '';`);
check("เปิดโปรแกรมใหม่ ค่าเปิดยังอยู่ ไฟล์เดิมได้ภาพเดิม", !!src1 && src1 === src2);

// กดปิด
await q("[...document.querySelectorAll('.topbar button')].at(-1).click();"); await sleep(300);
await c.click("[data-showframes] [role=switch]"); await sleep(400);
await q("document.body.click();"); await c.key("Escape"); await sleep(300);
const off1 = await counts();
check("กดปิด กลับเป็นแถบทะแยงตามเดิมทันที", off1.frames === 0 && off1.stripes === off0.stripes, JSON.stringify(off1));
await c.shot(`${OUT}/44-ภาพจากหนัง-ปิด.png`);

const after = hashes();
check("ไฟล์หนังทุกไฟล์ค่า hash เท่าเดิม", JSON.stringify(before) === JSON.stringify(after), `${Object.keys(after).length} ไฟล์`);
if (BUILT) { const csp = await q("return window.__csp ?? [];"); check("ไม่มีอะไรโดนกติกาความปลอดภัยกัน", csp.length === 0, JSON.stringify(csp.slice(0, 3))); }
const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส-ภาพจากหนัง${BUILT ? "-ตัวจริง" : ""}.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
