// ตัวตรวจคำว่า อ่านแล้ว X จาก N บนชั้นวาง ต้องตรงกับจำนวนปกที่ขึ้นชั้นจริงทุกจังหวะ (BUGS ข้อ 157 เจอ 24 พ.ย. 2569)
// ฝั่ง Rust อ่านสามไฟล์พร้อมกัน (app/library/scan.rs) เธรดที่ได้เลข 5 ส่งความคืบหน้าก่อนเธรดเลข 4 ส่งหนังได้
// เดิมหน้าจอใช้เลขของ Rust คำบอกขึ้น 5 ขณะปกบนชั้นมี 4 (check-stage2 ตกเป็นบางรอบ) · ตัวตรวจนี้จำลองลำดับนั้นตรง ๆ ให้แดงทุกครั้งกับโค้ดเดิม
// ใช้ระบบจำลองหน้าโปรแกรม (theme-live-app.html บนเซิร์ฟเวอร์ 1420) ส่งเหตุการณ์ด้วย window.__emit · ใช้: node scripts/check-shelf-count.mjs
import { createRequire } from "module";
if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const { chromium } = createRequire(import.meta.url)("playwright");

const URL = "http://127.0.0.1:1420/docs/mockups/theme-live-app.html";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name} · ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForSelector(".shelfwrap");
  await sleep(500);
  // หนังทดสอบห้าเรื่อง ลอกรูปร่างจากเรื่องแรกของคลังจำลอง เปลี่ยนรหัส ที่อยู่ ชื่อ
  await p.evaluate(async () => {
    const lib = await window.__TAURI_INTERNALS__.invoke("get_library");
    const b = lib.movies[0];
    window.__tm = (i) => ({ ...b, id: `นับ${i}`, path: `D:\\หนัง\\ทดสอบนับ${i} (2020).mkv`, name: `ทดสอบนับ${i} (2020)` });
  });
  const emit = (ev, payload) => p.evaluate(([e, x]) => window.__emit(e, x), [ev, payload]);
  const movie = (i) => p.evaluate((n) => window.__emit("movie-updated", window.__tm(n)), i);
  const read = async () => { await sleep(150); return p.evaluate(() => {
    const h = document.querySelector(".shelfwrap .hint")?.innerText ?? "";
    const m = h.match(/อ่านแล้ว (\d+) จาก (\d+)/);
    return { said: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null, books: document.querySelectorAll('.book[data-movie^="ทดสอบนับ"]').length };
  }); };

  await emit("scan-started", ["D:\\หนัง"]);
  await emit("scan-progress", { done: 0, total: 5 });
  for (const i of [1, 2, 3]) await movie(i);
  let r = await read();
  check("หนังขึ้นชั้นสามเรื่อง คำบอกว่าอ่านแล้ว 3 จาก 5", r.said === 3 && r.total === 5 && r.books === 3, JSON.stringify(r));

  // ลำดับที่ฝั่ง Rust ส่งได้จริง เรื่องที่ 5 กับความคืบหน้า 5 มาก่อนเรื่องที่ 4
  await movie(5);
  await emit("scan-progress", { done: 5, total: 5 });
  r = await read();
  check("ความคืบหน้าของ Rust บอก 5 แต่หนังขึ้นชั้น 4 เรื่อง คำบอกต้องเป็น 4 ตามปกบนชั้น", r.said === 4 && r.books === 4, JSON.stringify(r));

  await movie(4);
  r = await read();
  check("เรื่องที่ 4 มาถึง คำบอกเป็น 5 จาก 5 ตรงกับปกบนชั้น", r.said === 5 && r.books === 5, JSON.stringify(r));

  // รอบอ่านใหม่เริ่มนับจากศูนย์
  await emit("scan-started", ["D:\\หนัง"]);
  await emit("scan-progress", { done: 1, total: 5 });
  r = await read();
  check("รอบอ่านใหม่ยังไม่มีหนังมาถึง คำบอกเริ่มที่ 0 ไม่ค้างเลขรอบก่อน", r.said === 0, JSON.stringify(r));
  await ctx.close();
} finally {
  await browser.close();
}
console.log(`ผ่าน ${pass} จาก ${pass + fail} ข้อ`);
process.exit(fail ? 1 : 0);
