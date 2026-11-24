// ตัวตรวจว่าตอนหน้าเปลี่ยนสภาพ React ใช้กล่องบนชุดเดิมต่อ ไม่สร้างใหม่ (BUGS ข้อ 155 ขั้น 13 ผู้ช่วยตรวจทานเจอ)
// เดิมโค้ดของหน้าเขียนทุกทางแยกเป็น JSX ในฟังก์ชันเดียว ปุ่มโหมด แถบชื่อไฟล์ กรอบเลื่อนจึงเป็นชิ้นเดิมตลอด
// หลังจัดโครง ถ้าทางแยกเป็นคอมโพเนนต์คนละตัว React จะลบแล้วสร้างใหม่ สีปุ่มเปลี่ยนทันทีไม่ค่อย ๆ จาง โฟกัสคีย์บอร์ดหลุด กรอบเลื่อนกลับบนสุด
// วิธีตรวจ แปะเครื่องหมายลงชิ้นบนจอ แล้วเปลี่ยนสภาพหน้า ชิ้นที่หาเจอหลังเปลี่ยนต้องยังมีเครื่องหมาย
// ใช้ระบบจำลองหน้าโปรแกรม (theme-live-app.html บนเซิร์ฟเวอร์ 1420) ไม่ต้องเปิดโปรแกรมจริง · ใช้: node scripts/check-keepdom.mjs
import { createRequire } from "module";
if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = createRequire(import.meta.url)("playwright");

const URL = "http://127.0.0.1:1420/docs/mockups/theme-live-app.html";
const MOVIE = "D:\\หนัง\\ดาวเหนือ (2023).mkv";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : " · " + detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function page() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector("[data-navbar]");
  await sleep(500);
  return p;
}
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const mark = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; e.__keep = 1; return true; }, sel);
const kept = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.__keep === 1 : null; }, sel);

try {
  // หน้ากราฟเสียง ยังไม่เปิดไฟล์ สลับดูกราฟกับแปลงเสียง ปุ่มโหมดต้องเป็นชิ้นเดิม (สีค่อย ๆ จางได้ โฟกัสไม่หลุด)
  {
    const p = await page();
    await nav(p, "กราฟเสียง"); await sleep(400);
    const m1 = await mark(p, "[data-gmode=convert]");
    const m2 = await mark(p, "[data-graph]");
    await p.click("[data-gmode=convert]"); await sleep(400);
    check("หน้ากราฟเสียง กดแปลงเสียง ปุ่มโหมดเป็นชิ้นเดิม ไม่ถูกสร้างใหม่", m1 && (await kept(p, "[data-gmode=convert]")) === true, String(await kept(p, "[data-gmode=convert]")));
    check("หน้ากราฟเสียง กดแปลงเสียง กล่องหน้า div.ag เป็นชิ้นเดิม", m2 && (await kept(p, "[data-graph]")) === true, String(await kept(p, "[data-graph]")));
    const f = await p.evaluate(() => document.activeElement?.getAttribute("data-gmode"));
    check("หน้ากราฟเสียง โฟกัสยังอยู่ที่ปุ่มแปลงเสียงที่เพิ่งกด", f === "convert", String(f));
    await p.click("[data-gmode=graph]"); await sleep(400);
    check("หน้ากราฟเสียง กดดูกราฟกลับ ปุ่มโหมดยังเป็นชิ้นเดิม", (await kept(p, "[data-gmode=convert]")) === true, String(await kept(p, "[data-gmode=convert]")));
    await p.context().close();
  }
  // หน้าเสียงและซับ ใส่หนังจากหน้าว่าง กรอบเลื่อน .pagewrap ต้องเป็นชิ้นเดิม
  {
    const p = await page();
    await nav(p, "เสียงและซับ"); await sleep(400);
    const m = await mark(p, "[data-av-page]");
    await p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), MOVIE);
    await p.waitForSelector("[data-trk]", { timeout: 10000 }); await sleep(300);
    check("หน้าเสียงและซับ ใส่หนังแล้ว กรอบเลื่อน .pagewrap เป็นชิ้นเดิม", m && (await kept(p, "[data-av-page]")) === true, String(await kept(p, "[data-av-page]")));
    await p.context().close();
  }
  // หน้าบิตเรต (กำลังถามแทร็ก เลือกแทร็ก เปิดไฟล์แล้ว ใช้แถบชื่อไฟล์ชุดเดียวกัน) ระบบจำลองไม่มีข้อมูลไฟล์หลายแทร็ก หน้าเลือกแทร็กไม่ขึ้น จึงตรวจจากการอ่านโค้ด BitrateModern.tsx
} finally {
  await browser.close();
}
console.log(`ผ่าน ${pass} จาก ${pass + fail} ข้อ`);
process.exit(fail ? 1 : 0);
