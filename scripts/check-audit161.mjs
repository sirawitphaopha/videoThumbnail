// ตัวตรวจงานเก็บ AUDIT 99 ข้อ (BUGS ข้อ 161 · docs/PLAN-2026-11-27-AUDIT.md · รายงาน docs/REPORT-2026-11-27-AUDIT-99ข้อ.md)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ
// node scripts/check-audit161.mjs           ตรวจทุกข้อ
// node scripts/check-audit161.mjs 37 38     ตรวจเฉพาะข้อที่บอก (เลขข้อใน AUDIT)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
// ตรรกะล้วนตรวจด้วยการ import ไฟล์ ts ผ่าน vite ในหน้า (`await import("/src/...")`) ไม่ต้องคอมไพล์เอง
import { spawn } from "child_process";
import { createRequire } from "module";

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const MOVIE = "D:\\หนัง\\ดาวเหนือ (2023).mkv";
const up = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };

// ---------------------------------------------------------------- ตัวช่วย
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const click = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("ไม่เจอ " + s); e.click(); }, sel);
const clickText = (p, text, sel = "button,[role=tab],a") => p.evaluate(([t, s]) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll(s)].filter(vis);
  const hit = all.find((e) => e.innerText.trim() === t) ?? all.find((e) => e.innerText.trim().startsWith(t));
  if (!hit) throw new Error("ไม่เจอปุ่ม " + t);
  hit.click();
}, [text, sel]);
const pick = (p, path) => p.evaluate((x) => { window.__pickNext = x; }, path);
/** สลับคำตอบของคำสั่งในระบบจำลอง · body เป็นฟังก์ชัน async ได้ตัวแปร a · เรียกตัวเดิมด้วย await window.__fxOverBase.<คำสั่ง>(a) */
const over = (p, cmd, body) => p.evaluate(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const wait = (p, ms) => p.waitForTimeout(ms);
/** เรียกฟังก์ชันจากไฟล์ ts ในหน้า · fn เป็นข้อความ body ที่ได้ตัวแปร m (โมดูล) กับ a (ค่าที่ส่ง) */
const mod = (p, file, body, arg) => p.evaluate(async ([f, b, a]) => new Function("m", "a", b)(await import(f), a), [file, body, arg]);

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};

// ชุด 1 ----------------------------------------------------------------
T[37] = async (p, check) => {
  await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.click());
  await p.waitForSelector("[data-link-remove]"); await click(p, "[data-link-remove]"); await wait(p, 300);
  const t = await text(p, ".dialog, [role=dialog]");
  check("37 หน้าต่างถามก่อนเอาปกจับคู่ออกบอกสิ่งที่จะเกิด ไม่บอกว่าย้ายไปแล้ว", !!t && t.includes("จะย้ายลงถังขยะ") && !t.includes("ถังขยะแล้ว"), t);
};
T[38] = async (p, check) => {
  const folders = [{ path: "D:\\หนัง", ok: true, count: 0, error: null }];
  await p.evaluate((f) => window.__emit("scan-finished", { movies: [], folders: f, scanning: false }), folders); await wait(p, 300);
  const t = await text(p, "[data-shelf-nomovies]");
  const go = await p.evaluate(() => !!document.querySelector("[data-shelf-nomovies-go]"));
  check("38 โฟลเดอร์ไม่มีไฟล์หนัง ชั้นวางบอกเหตุพร้อมปุ่มไปตั้งค่าโฟลเดอร์และปุ่มอ่านใหม่", !!t && t.includes("ยังไม่มีไฟล์หนัง") && t.includes("อ่านโฟลเดอร์ใหม่") && go, t);
  // ทุกโฟลเดอร์หาไม่เจอ มีการ์ดโฟลเดอร์หายบอกอยู่แล้ว ไม่ขึ้นซ้ำ
  await p.evaluate(() => window.__emit("scan-finished", { movies: [], folders: [{ path: "E:\\ไม่มี", ok: false, count: 0, error: "หาไม่เจอ" }], scanning: false })); await wait(p, 300);
  const t2 = await text(p, "[data-shelf-nomovies]");
  check("38 ทุกโฟลเดอร์หาไม่เจอ ไม่ขึ้นคำว่าโฟลเดอร์ไม่มีหนังซ้อนกับการ์ดโฟลเดอร์หาย", t2 === null, t2);
  await p.evaluate((f) => window.__emit("scan-finished", { movies: [], folders: f, scanning: false }), folders); await wait(p, 300);
};
T[39] = async (p, check) => {
  const name = await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.dataset.movie);
  const word = name.split(" (")[0];
  await p.fill("input[aria-label='ค้นหาชื่อหนัง']", word); await wait(p, 300);
  await click(p, "[data-shelf-tab=none]"); await wait(p, 300);
  const t = await text(p, "[data-shelf-hidden]");
  check("39 ค้นชื่อที่มีจริงแต่ตัวกรองปกซ่อน บอกว่าเจอกี่เรื่องแต่อยู่นอกตัวกรอง ไม่โทษคำค้น", !!t && t.includes(word) && /1 เรื่อง/.test(t) && t.includes("นอกตัวกรอง"), t);
  await clickText(p, "ดูทั้งหมด"); await wait(p, 300);
  const n = await p.evaluate(() => document.querySelectorAll(".book").length);
  check("39 ปุ่มดูทั้งหมดล้างตัวกรอง หนังที่ค้นขึ้นชั้น", n >= 1, n);
  await click(p, "[data-shelf-tab=none]"); await wait(p, 300);
};
T[61] = async (p, check) => {
  const r = await mod(p, "/src/lib/status.ts", `
    const now = Date.now() / 1000, mk = (status, at) => ({ ext: "mkv", status, check: at ? { at } : null });
    return { legend: m.SHELF_LABEL.warn, due: m.labelOf(mk("ok", now - 40 * 86400), 30), un: m.labelOf(mk("unchecked"), 30),
      ch: m.labelOf(mk("changed", now), 30), part: m.labelOf(mk("partial", now), 30), ok: m.labelOf(mk("ok", now), 30) };`);
  check("61 ป้ายจุดเหลืองในแถบล่างนับเหตุถึงเวลาตรวจซ้ำด้วย", r.legend.includes("ถึงเวลาตรวจซ้ำ") && r.legend.includes("ยังไม่เคยตรวจ"), r.legend);
  check("61 ป้ายบนปกบอกเหตุของเรื่องนั้น ถึงเวลาตรวจซ้ำ ยังไม่เคยตรวจ ไฟล์เปลี่ยน ตรวจได้บางส่วน", r.due.includes("ถึงเวลาตรวจซ้ำ") && r.un.includes("ยังไม่เคยตรวจ") && r.ch.includes("เปลี่ยน") && r.part.includes("บางส่วน") && r.ok === "ไฟล์สมบูรณ์", JSON.stringify(r));
  const bar = await p.evaluate(() => { const b = document.querySelector("[data-legend=warn]")?.parentElement; return b ? b.scrollWidth - b.clientWidth : -1; });
  check("61 แถบป้ายสีล่างชั้นวางไม่ล้นหลังป้ายยาวขึ้น", bar === 0, bar);
};
T[43] = async (p, check) => {
  await over(p, "poster_open", `const r = await window.__fxOverBase.poster_open(a); return { ...r, width: 1500, height: 1000, twoThree: false, aspect: "แนวนอน 3 : 2", crop: [0, 0, 1500, 1000] };`);
  // การ์ดเลือกแบบปกขึ้นกับรูปที่ส่งมาจากปกจับคู่ (ไม่ได้ครอปเอง) · เริ่มจากปุ่มรวมเข้าไฟล์ของเรื่องที่มีปกจับคู่บนชั้นวาง
  await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.click());
  await p.waitForSelector("[data-link-merge]"); await click(p, "[data-link-merge]");
  await p.waitForSelector("[data-not23]", { timeout: 8000 }); await wait(p, 300);
  await over(p, "poster_render", `await new Promise((ok) => setTimeout(ok, 1500)); return await window.__fxOverBase.poster_render(a);`);
  await p.evaluate(() => [...document.querySelectorAll("[data-not23] .seg button")].find((b) => b.innerText.includes("เติมขอบ"))?.click()); await wait(p, 200);
  const mid = await p.evaluate(() => { const b = document.querySelector("[data-start]"); return { dis: b.getAttribute("aria-disabled"), title: b.title }; });
  check("43 ระหว่างทำรูปแบบใหม่ ปุ่มเริ่มกดไม่ได้พร้อมเหตุผล", mid.dis === "true" && mid.title === "รอทำรูปให้เสร็จก่อน", JSON.stringify(mid));
  await wait(p, 1800);
  const after = await p.evaluate(() => document.querySelector("[data-start]").title);
  check("43 ทำรูปเสร็จ เหตุผลรอทำรูปหายไป", after !== "รอทำรูปให้เสร็จก่อน", after);
};
T[45] = async (p, check) => {
  await nav(p, "ใส่โปสเตอร์"); await wait(p, 300);
  await pick(p, "D:\\รูปปก\\รูปไม่มีนามสกุล"); await click(p, "[data-drop=poster]"); await wait(p, 400);
  const t = await text(p, "[data-drop=poster]");
  check("45 รูปไม่มีนามสกุล ขึ้นเป็นประโยค ไม่มีเครื่องหมายคำถามแทนคำ", !!t && t.includes("ไฟล์ที่ไม่มีนามสกุลใช้ไม่ได้") && !t.includes(".?"), t);
};

// ---------------------------------------------------------------- ตัวรัน
const want = process.argv.slice(2).map(Number).filter(Boolean);
const ids = Object.keys(T).map(Number).filter((n) => !want.length || want.includes(n)).sort((a, b) => a - b);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
let vite = null;
if (!(await up())) {
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const { chromium } = createRequire(import.meta.url)("playwright");
const b = await chromium.launch();
try {
  for (const n of ids) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
    // ตัวเดิมของคำสั่งที่สลับ เรียกจากตัวสลับได้ (window.__fxOverBase)
    await p.evaluate(() => { window.__fxOverBase = new Proxy({}, { get: (_, c) => (a) => { const o = window.__fxOver; window.__fxOver = undefined; const r = window.__TAURI_INTERNALS__.invoke(c, a); window.__fxOver = o; return r; } }); });
    try { await T[n](p, check); } catch (e) { check(`${n} ตรวจจบไม่ได้`, false, e.message.split("\n")[0]); }
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-${n}.png` }).catch(() => {});
    if (errs.length) check(`${n} ไม่มีข้อผิดพลาดในหน้า`, false, errs.join(" | "));
    await p.close();
  }
} finally { await b.close(); vite?.kill(); }
console.log(`\nผ่าน ${pass} ตก ${fail}`);
process.exit(fail ? 1 : 0);
