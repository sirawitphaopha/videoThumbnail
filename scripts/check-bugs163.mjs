// ตัวตรวจงาน BUGS ข้อ 163 (เคาะรายการเลข 16 ถึง 53 รอบแรก 28 พ.ย. 2569)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ · ตัวช่วยกับตัวรันยกจาก check-bugs162.mjs
// node scripts/check-bugs163.mjs            ตรวจทุกข้อ
// node scripts/check-bugs163.mjs 2          ตรวจเฉพาะข้อย่อย 163.2 (ส่งเลขหลังจุด)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
import { spawn } from "child_process";
import { createRequire } from "module";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const SUB_MOVIE = "D:\\หนัง\\ฉากตัด (2024).mkv"; // ข้อมูลตัวอย่างของหน้าแก้ซับ (SE_PATH ใน theme-live-app.html)
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
/** สลับคำตอบตั้งแต่ก่อนหน้าโหลด (คำสั่งที่โปรแกรมเรียกตอนเปิด) แล้วโหลดหน้าใหม่ */
const overBoot = async (p, cmd, body) => {
  await p.addInitScript(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
  await p.reload(); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
};
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const wait = (p, ms) => p.waitForTimeout(ms);
/** เรียกฟังก์ชันจากไฟล์ ts ในหน้า · fn เป็นข้อความ body ที่ได้ตัวแปร m (โมดูล) กับ a (ค่าที่ส่ง) */
const mod = (p, file, body, arg) => p.evaluate(async ([f, b, a]) => new Function("m", "a", b)(await import(f), a), [file, body, arg]);

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};
const ROOT = fileURLToPath(new globalThis.URL("..", import.meta.url));
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; };
/** บรรทัดที่เป็นคอมเมนต์ล้วน ไม่ใช่ข้อความบนจอ */
const isComment = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l);

/** 163.2 (เลข 16) คำฝั่งวิดีโอ ครอบเป็น MKV เปลี่ยนเป็น ห่อเป็น MKV ทั้งโปรแกรม */
T[2] = async (p, check) => {
  // ① ซอร์สหน้าจอกับข้อความจากฝั่ง Rust ไม่มีคำว่าครอบในความหมายห่อไฟล์เหลือ (ครอบครัว ที่ครอบ ครอบภาพ เป็นคนละความหมาย)
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "src-tauri", "src"))].filter((f) => /\.(tsx?|rs)$/.test(f));
  const left = [];
  for (const f of files) readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (!isComment(l) && /ครอบ(เป็น| ?MKV|เสร็จ|ใหม่|ไฟล์|\$\{J\})|ยังไม่ได้ครอบ|หลังครอบ|ก่อนครอบ|ระหว่างครอบ/.test(l)) left.push(`${f.slice(ROOT.length)}:${i + 1}`); });
  check("163.2 ซอร์สไม่มีข้อความบนจอที่ใช้คำว่าครอบในความหมายห่อเป็น MKV", left.length === 0, left.join(" , "));
  // ② ป้ายอธิบายสีของชั้นวาง
  const legend = await p.evaluate(() => document.body.innerText.includes("ยังไม่ได้ห่อเป็น MKV"));
  check("163.2 ชั้นวางขึ้นป้ายอธิบายสี ยังไม่ได้ห่อเป็น MKV", legend, "");
  // ③ หน้าตั้งค่าหัวข้อใส่โปสเตอร์ ป้ายสามแถวใช้คำใหม่ และอยู่บรรทัดเดียวที่หน้าต่าง 1280 × 800
  await nav(p, "ตั้งค่า"); await wait(p, 600);
  await p.evaluate(() => [...document.querySelectorAll("button,a,[role=tab],li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "ใส่โปสเตอร์")?.click()); await wait(p, 500);
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-setcard=poster] .setrow > .lbl")].map((l) => { const t = [...l.childNodes].find((n) => n.nodeType === 3); if (!t) return null; const r = document.createRange(); r.selectNodeContents(t); return { t: t.textContent.trim(), lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size }; }).filter(Boolean));
  const wantRows = ["ตรวจไฟล์ต้นทางก่อนห่อเป็น MKV", "ตรวจไฟล์ใหม่หลังห่อเป็น MKV", "ไฟล์เดิมหลังห่อเป็น MKV"];
  check("163.2 หน้าตั้งค่า ป้ายสามแถวใช้คำว่าห่อเป็น MKV และอยู่บรรทัดเดียว", wantRows.every((w) => rows.some((r) => r.t === w && r.lines === 1)) && !rows.some((r) => r.t.includes("ครอบ")), JSON.stringify(rows));
  // ④ หน้าใส่โปสเตอร์ ปุ่มเริ่มกับหัวข้อไฟล์เดิม
  await nav(p, "ใส่โปสเตอร์"); await wait(p, 600);
  const pg = await p.evaluate(() => document.body.innerText);
  check("163.2 หน้าใส่โปสเตอร์ ปุ่มเริ่มเป็น ห่อเป็น MKV พร้อมโปสเตอร์ และหัวข้อไฟล์เดิมหลังห่อเป็น MKV", pg.includes("ห่อเป็น MKV พร้อมโปสเตอร์") && pg.includes("ไฟล์เดิมหลังห่อเป็น MKV") && !/ครอบ/.test(pg), "");
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
