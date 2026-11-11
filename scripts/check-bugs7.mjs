// ตัวตรวจบั๊กชุด 7 หน้ากราฟเสียง ข้อ 39 เต็มจอ · 41 ชุดสีกำหนดเอง (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// เปิดโปรแกรมโหมดพัฒนาก่อน · เต็มจอตั้ง window.__fullDry ไม่ให้หน้าต่างเต็มจอจริง (ห้ามเด้งขึ้นจอ) · ภาพลง docs/report-2026-11-11/ชุด7/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด7`; mkdirSync(OUT, { recursive: true });
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const G = "[data-pageslot=graph]";
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };

await nav("กราฟเสียง");
await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(SONG)}], position: { x: 700, y: 400 } } })`);
await waitFor(`return (document.querySelector('${G} .fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 15000); await sleep(2000);
await q(`document.querySelector('${G} [data-view=wave]')?.click()`); await sleep(800);

// ---------- ข้อ 39 เต็มจอ (จำลอง ไม่สั่งหน้าต่างจริง) ----------
await q(`window.__fullCalls = []; window.__fullDry = (v) => window.__fullCalls.push(v);`);
await q(`document.querySelector('${G} [data-fullbtn]')?.click()`); await sleep(500);
const on = await q(`const m = document.querySelector('main.main').getBoundingClientRect(); return { attr: document.documentElement.hasAttribute('data-full'), calls: window.__fullCalls, tb: getComputedStyle(document.querySelector('.titlebar')).display, side: getComputedStyle(document.querySelector('.sidewrap')).display, left: Math.round(m.left), w: Math.round(m.width), inner: innerWidth }`);
check("ข้อ 39 กดเต็มจอ ซ่อนแถบชื่อหน้าต่างกับเมนูซ้าย เนื้อหาเริ่มที่ 0 กว้างเต็มหน้าต่าง · สั่งหน้าต่างเต็มจอหนึ่งครั้ง", on.attr && on.calls.join() === "true" && on.tb === "none" && on.side === "none" && on.left === 0 && on.w === on.inner, JSON.stringify(on));
await c.shot(`${OUT}/39-เต็มจอ.png`, null).catch(() => {});
await c.key("Escape"); await sleep(400);
const off = await q(`return { attr: document.documentElement.hasAttribute('data-full'), calls: window.__fullCalls }`);
check("ข้อ 39 กด Esc ออกจากเต็มจอ แถบกลับมา", !off.attr && off.calls.join() === "true,false", JSON.stringify(off));
await q(`delete window.__fullDry; delete window.__fullCalls;`);

// ---------- ข้อ 41 ชุดสีกำหนดเอง ----------
const before = await q(`return JSON.parse(localStorage.getItem('graph-prefs') ?? '{}').theme ?? null`);
await q(`document.querySelector('${G} [data-sw-custom]')?.click()`); await sleep(500);
const panel = await q(`const p = document.querySelector('${G} [data-pad-rgb]'); if (!p) return null; const r = p.getBoundingClientRect(); return { right: Math.round(r.right), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight }`);
check("ข้อ 41 กดวงกลมที่ห้า กางแผงเลือกสีตัวเดียวกับหน้าครอป ไม่ล้นขอบจอ", !!panel && panel.right <= panel.w && panel.bottom <= panel.h, JSON.stringify(panel));
await c.shot(`${OUT}/41-แผงเลือกสีกำหนดเอง.png`, null).catch(() => {});
// พิมพ์รหัสสีเขียว แล้วกดตกลง
await q(`const i = document.querySelector('${G} [data-pad-hex]'); i.focus(); i.select();`);
await c.type("2E9E5B"); await sleep(400);
await q(`document.querySelector('${G} [data-pad-ok]')?.click()`); await sleep(800);
const after = await q(`const p = JSON.parse(localStorage.getItem('graph-prefs') ?? '{}'); return { theme: p.theme, color: p.customColor, on: document.querySelector('${G} [data-sw-custom]')?.classList.contains('on') }`);
check("ข้อ 41 พิมพ์สี #2E9E5B กดตกลง ชุดสีกลายเป็นกำหนดเอง จำสีไว้ วงกลมที่ห้าติด", after.theme === "กำหนดเอง" && /2e9e5b/i.test(after.color ?? "") && after.on, JSON.stringify(after));
await c.shot(`${OUT}/41-กราฟสีกำหนดเอง.png`, `${G} [data-plot]`, 0);
// คืนชุดสีเดิม
await q(`const p = JSON.parse(localStorage.getItem('graph-prefs') ?? '{}'); p.theme = ${JSON.stringify(before ?? "ชมพู")}; localStorage.setItem('graph-prefs', JSON.stringify(p));`);
await q(`[...document.querySelectorAll('${G} .sws .sw')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify("ชุดสี" + (before ?? "ชมพู"))})?.click()`); await sleep(300);

console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
