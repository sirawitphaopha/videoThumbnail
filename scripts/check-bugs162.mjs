// ตัวตรวจงาน BUGS ข้อ 162 (งานจาก ROADMAP ที่ทำบนเครื่องคลาวด์ได้ 28 พ.ย. 2569)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ · ตัวช่วยกับตัวรันยกจาก check-audit161.mjs
// node scripts/check-bugs162.mjs            ตรวจทุกข้อ
// node scripts/check-bugs162.mjs 1 2        ตรวจเฉพาะข้อย่อย 162.1 162.2 (ส่งเลขหลังจุด)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
import { spawn } from "child_process";
import { createRequire } from "module";
import { linesOf } from "./lib/lines.mjs";

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

/** เปิดหน้าแก้ซับด้วยซับตัวอย่าง */
const subEdit = async (p) => { await nav(p, "ซับไตเติล"); await wait(p, 300); await p.evaluate((x) => window.__subOpen(x), SUB_MOVIE); await p.waitForSelector("[data-se-cps]", { timeout: 8000 }); await wait(p, 600); };

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};
/** จุดตัดบรรทัดของกล่อง ⓘ ที่อ่านด้วยตาแล้ว · แก้คำแล้วรัน DUMP=1 อ่านจุดตัดใหม่ก่อนแก้ตารางนี้ */
const TIP_LINES = {
  cps: [
    "จำนวนตัวอักษรที่ต้องอ่านต่อหนึ่งวินาที",
    "นับแบบที่ตาเห็น สระบนล่างกับวรรณยุกต์นับรวมกับพยัญชนะ ⏎ ส่วนแท็ก ช่องว่าง วรรคตอน และตัวขึ้นบรรทัดไม่นับ",
    "เกณฑ์เตือน เกิน 20 ตัวต่อวินาทีคนส่วนใหญ่อ่านไม่ทัน ⏎ ช่องนี้กับช่องในตารางจะเป็นสีเตือน",
    "แนะนำยืดเวลาจบ ตัดคำ หรือแยกเป็นสองบรรทัด",
  ],
};

// 162.1 นับตัวอักษรต่อวินาทีแบบไทย -------------------------------------
T[1] = async (p, check) => {
  const r = await mod(p, "/src/lib/subText.ts", `const B = String.fromCharCode(92);
    return { thi: m.readChars("ที่"), tiao: m.readChars("เที่ยว"), nam: m.readChars("น้ำใจ"), punct: m.readChars("ไป!? ไหน... (ครับ)"), en: m.readChars("Hello, world."), mixed: m.readChars("ฉัน OK นะ"),
      cps: m.cps({ text: "{" + B + "i1}ที่นี่{" + B + "i0}" + B + "Nเที่ยว", start: 0, end: 1000 }) };`);
  check("162.1 สระบน สระล่าง วรรณยุกต์ สระอำ นับรวมกับพยัญชนะ ที่ 1 เที่ยว 4 น้ำใจ 3 แบบ Aegisub", r.thi === 1 && r.tiao === 4 && r.nam === 3, JSON.stringify(r));
  check("162.1 ไม่นับวรรคตอนกับช่องว่าง ไป!? ไหน... (ครับ) ได้ 8 Hello, world. ได้ 10", r.punct === 8 && r.en === 10 && r.mixed === 6, JSON.stringify(r));
  check("162.1 ตัวต่อวินาทีของหน้าแก้ซับไม่นับแท็กกับตัวขึ้นบรรทัด ที่นี่ เที่ยว ใน 1 วินาทีได้ 6", r.cps === 6, JSON.stringify(r));
  const v = await mod(p, "/src/components/SubViewer.tsx", `return [m.cpsChars("ที่นี่ไม่มีใครรู้"), m.cpsChars("น้ำใจ ไม่เคยเปลี่ยน!")];`);
  check("162.1 ตัวดูซับใช้ตัวนับเดียวกัน ที่นี่ไม่มีใครรู้ 9 น้ำใจ ไม่เคยเปลี่ยน! 13", v[0] === 9 && v[1] === 13, JSON.stringify(v));
  // ช่องตัวต่อวินาทีใต้ช่องพิมพ์กับคอลัมน์ในตารางใช้ตัวนับใหม่
  await subEdit(p);
  const ui = await p.evaluate(async () => {
    const m = await import("/src/lib/subText.ts");
    const row = document.querySelector("[data-se-grid] tbody tr.sel, [data-se-grid] tbody tr[aria-selected=true]") ?? document.querySelector("[data-se-grid] tbody tr");
    return { box: document.querySelector("[data-se-cps]")?.innerText ?? null, row: !!row };
  });
  check("162.1 ช่องตัวต่อวินาทีใต้ช่องพิมพ์ขึ้นตัวเลข", !!ui.box && /\d+ ตัวต่อวินาที/.test(ui.box), JSON.stringify(ui));
  // กล่อง ⓘ ของช่องนี้บอกวิธีนับใหม่ จุดตัดบรรทัดตรงความหมาย (หน้าต่าง 1280 × 800)
  await click(p, '[data-info="ตัวอักษรต่อวินาที"]'); await p.waitForSelector('[data-tip="ตัวอักษรต่อวินาที"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="ตัวอักษรต่อวินาที"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  const want = TIP_LINES.cps;
  check("162.1 กล่อง ⓘ ตัวอักษรต่อวินาทีบอกว่าสระบนล่างวรรณยุกต์นับรวมกับพยัญชนะ ตัดบรรทัดตามที่ตรวจไว้", !!lines && JSON.stringify(lines) === JSON.stringify(want), JSON.stringify(lines));
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
