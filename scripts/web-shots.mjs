// ระบบจำลองหน้าโปรแกรมบนเว็บ ถ่ายภาพทุกหน้าทุกสภาพ (แผนแบ่งไฟล์ขั้น 0 · BUGS ข้อ 153 · docs/PLAN-2026-11-22-แบ่งไฟล์.md)
// พี่กันสั่ง 22 พ.ย. 2569 "เอาแบบเธอสร้างระบบจำลองหน้าโปรแกรมแยกออกมาเหมือนเว็บได้ไหม เอาไว้เทส ถ่ายรูป"
// ใช้ได้ทั้งบนเครื่องคลาวด์ (Linux มี Chromium กับ Playwright ติดมา) และบนคอมพี่กัน ไม่ต้องเปิดโปรแกรมจริง
//
// ใช้:  node scripts/web-shots.mjs <โฟลเดอร์ภาพ> [ชื่อภาพ,ชื่อภาพ]
//       ไม่มีเซิร์ฟเวอร์ 1420 เปิดอยู่ สคริปต์เปิด vite เองแล้วปิดตอนจบ
//       เทียบสองชุดด้วย node scripts/web-diff.mjs <ชุดก่อน> <ชุดหลัง>
//
// หน้าที่ถ่ายคือหน้าจอจริงของโปรแกรม (src/main.tsx) ใน docs/mockups/theme-live-app.html ที่แทนฝั่ง Rust ด้วยข้อมูลตัวอย่าง
// ภาพจึงพิสูจน์เฉพาะหน้าจอ ไม่ได้พิสูจน์งานฝั่ง Rust
// ให้ภาพตรงกันทุกรอบ ตรึงเวลาเป็น 22 พ.ย. 2569 10:00 ปิดภาพเคลื่อนไหวกับเคอร์เซอร์กะพริบเฉพาะตอนถ่าย รอฟอนต์โหลดครบ
// ภาพจาก Linux ฟอนต์เรนเดอร์ต่างจาก Windows นิดหน่อย ใช้เทียบก่อนกับหลังในเครื่องเดียวกันเท่านั้น
import { createRequire } from "module";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { join } from "path";

const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = process.argv[2];
if (!OUT) { console.error("ใส่โฟลเดอร์ภาพ เช่น node scripts/web-shots.mjs /tmp/ภาพ"); process.exit(2); }
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const BASE = "http://127.0.0.1:1420";
const URL = `${BASE}/docs/mockups/theme-live-app.html`;
const SIZES = (process.env.SIZES ?? "1280x800,1920x1032").split(",").map((s) => s.split("x").map(Number));
mkdirSync(OUT, { recursive: true });

const MOVIE = "D:\\หนัง\\ดาวเหนือ (2023).mkv";
const SONG = "D:\\เพลง\\เพลงตัวอย่าง.flac";
const SUB_MOVIE = "D:\\หนัง\\ฉากตัด (2024).mkv"; // ข้อมูลตัวอย่างของหน้าแก้ซับ (SE_PATH ใน theme-live-app.html)
const IMG_MOVIE = "D:\\หนัง\\ซับรูปตัวอย่าง (2024).mkv"; // ซับรูป PGS ตัวอย่าง 36 ภาพ (OCR_PATH)

// ---------------------------------------------------------------- เซิร์ฟเวอร์
async function up() { try { return (await fetch(URL)).ok; } catch { return false; } }
let vite = null;
if (!(await up())) {
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) { console.error("เปิด vite ที่พอร์ต 1420 ไม่ขึ้น"); process.exit(1); }
}
// เซิร์ฟเวอร์ที่พอร์ต 1420 ต้องเสิร์ฟโฟลเดอร์นี้ ไม่ใช่โปรเจกต์ชุดอื่นที่เปิดค้าง ไม่งั้นชุดก่อนกับชุดหลังมาจากโค้ดเดียวกัน เทียบผ่านเสมอ (ผู้ช่วยตรวจทานแบ่งไฟล์ขั้น 13.5)
{
  const tok = join(fileURLToPath(import.meta.url), "../../docs/mockups/web-shots-token.txt"), val = String(process.pid) + "-" + Date.now();
  writeFileSync(tok, val);
  const got = await fetch(`${BASE}/docs/mockups/web-shots-token.txt`).then((r) => r.text()).catch(() => "");
  rmSync(tok, { force: true });
  if (got.trim() !== val) { console.error("เซิร์ฟเวอร์ที่พอร์ต 1420 ไม่ได้เสิร์ฟโฟลเดอร์นี้ ปิดตัวที่เปิดค้างแล้วรันใหม่"); vite?.kill(); process.exit(1); }
}

// ---------------------------------------------------------------- ตัวช่วยกด
const STILL = `*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}`;
/** กดปุ่มที่มองเห็นตัวแรกที่ข้อความตรง (ตัดช่องว่างหัวท้าย) หรือขึ้นต้นด้วยข้อความ */
const clickText = (p, text, sel = "button,[role=tab],a") => p.evaluate(([t, s]) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const all = [...document.querySelectorAll(s)].filter(vis);
  const hit = all.find((e) => e.innerText.trim() === t) ?? all.find((e) => e.innerText.trim().startsWith(t)) ?? all.find((e) => e.getAttribute("aria-label") === t);
  if (!hit) throw new Error("ไม่เจอปุ่ม " + t);
  hit.click();
}, [text, sel]);
const click = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("ไม่เจอ " + s); e.click(); }, sel);
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const drop = (p, path) => p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), path);
const call = (p, fn, arg) => p.evaluate(([f, a]) => window[f](a), [fn, arg]);
const waitSel = (p, sel, ms = 15000) => p.waitForSelector(sel, { timeout: ms, state: "attached" });

// ---------------------------------------------------------------- รายการภาพ
// แต่ละภาพเริ่มจากหน้าต่างใหม่ ข้อมูลตัวอย่างชุดเดิม ไม่มีค่าที่จำในเครื่องค้างจากภาพก่อน
const SHOTS = [
  // ขั้น 0.5 ชั้นวาง ใส่โปสเตอร์ จับคู่ปก ตั้งค่า
  ["ชั้นวาง-ปก", async () => {}],
  ["ชั้นวาง-ตาราง", async (p) => { await clickText(p, "ตาราง"); }],
  ["ชั้นวาง-แผงขวา", async (p) => { await click(p, ".shelf .card, [data-movie]"); }],
  ["ชั้นวาง-ปกนอน-เล็ก", async (p) => { await clickText(p, "ปกนอน"); await clickText(p, "เล็ก"); }],
  ["ใส่โปสเตอร์", async (p) => { await nav(p, "ใส่โปสเตอร์"); }],
  ["จับคู่ปก", async (p) => { await nav(p, "จับคู่ปก"); }],
  ["จับคู่ปก-กระดาน", async (p) => { await nav(p, "จับคู่ปก"); await p.waitForTimeout(400); await click(p, "[data-link-goboard]"); }],
  ...[["folders", "โฟลเดอร์หนัง"], ["shelf", "ชั้นวาง"], ["tone", "โทนสี"], ["player", "เปิดเล่นหนัง"], ["poster", "ใส่โปสเตอร์"], ["link", "เก็บรูปที่จับคู่"], ["av", "เสียงและซับ"], ["check", "ตรวจไฟล์"], ["graph", "กราฟเสียง"], ["tools", "เครื่องมือเบื้องหลัง"], ["encoders", "ตัวแปลงเสียง"], ["log", "บันทึกการใช้งาน"], ["types", "ชนิดไฟล์"], ["thanks", "ขอบคุณ"]]
    .map(([id, th]) => [`ตั้งค่า-${th}`, async (p) => { await nav(p, "ตั้งค่า"); await waitSel(p, `[data-setnav=${id}]`); await click(p, `[data-setnav=${id}]`); }]),
  ["เมนูพับ", async (p) => { await clickText(p, "ย่อเมนู"); }],
  ["ข้อมูลไฟล์", async (p) => { await click(p, ".shelf .card, [data-movie]"); await p.waitForTimeout(300); await clickText(p, "MediaInfo", "[data-detail] button"); }],
  ["โทนกลางคืน-ชั้นวาง", async (p) => { await nav(p, "ตั้งค่า"); await p.waitForTimeout(300); await waitSel(p, "[data-setnav=tone]"); await click(p, "[data-setnav=tone]"); await p.waitForTimeout(200); await p.evaluate(() => document.querySelector("[data-tone=night], [data-tone*=night]")?.click()); await p.waitForTimeout(300); await nav(p, "ชั้นวางหนัง"); }],
  // ขั้น 0.6 กราฟเสียง
  ...[["รูปคลื่น", "wave"], ["ความดัง", "loud"], ["ความถี่", "spek"], ["ความถี่เฉลี่ย", "psd"]].map(([th, v]) => [`กราฟเสียง-${th}`, async (p) => {
    await nav(p, "กราฟเสียง"); await p.waitForTimeout(300); await drop(p, MOVIE); await waitSel(p, "[data-plot]"); await p.waitForTimeout(600);
    await click(p, `.agviews [data-view=${v}]`); await p.waitForTimeout(900);
  }]),
  ["กราฟเสียง-เพลงสเตอริโอ", async (p) => { await nav(p, "กราฟเสียง"); await p.waitForTimeout(300); await drop(p, SONG); await waitSel(p, "[data-plot]"); await p.waitForTimeout(900); }],
  ["กราฟเสียง-หน้าแรก", async (p) => { await nav(p, "กราฟเสียง"); }],
  ["กราฟเสียง-แปลงเสียง", async (p) => { await nav(p, "กราฟเสียง"); await p.waitForTimeout(300); await click(p, "[data-gmode=convert]"); }],
  // ขั้น 0.7 เสียงและซับ บิตเรต MediaInfo ตรวจไฟล์ ใส่โปสเตอร์ที่มีไฟล์
  ["เสียงและซับ-หน้าแรก", async (p) => { await nav(p, "เสียงและซับ"); }],
  ["เสียงและซับ-หนัง", async (p) => { await nav(p, "เสียงและซับ"); await p.waitForTimeout(300); await drop(p, MOVIE); await p.waitForTimeout(1500); }],
  ["เสียงและซับ-ตั้งค่าแทร็ก", async (p) => { await nav(p, "เสียงและซับ"); await p.waitForTimeout(300); await drop(p, MOVIE); await p.waitForTimeout(1500); await p.evaluate(() => { const r = [...document.querySelectorAll("[data-trk]")].find((x) => x.innerText.includes("E-AC-3")); if (!r) throw new Error("ไม่เจอแถว E-AC-3"); r.click(); }); await waitSel(p, "[data-track-detail], .trk.sel"); }], // เดิมหาแถวด้วย tr ที่ไม่มีในหน้า ภาพนี้จึงซ้ำกับ เสียงและซับ-หนัง (ผู้ช่วยตรวจทานขั้น 13.5)
  ["เสียงและซับ-แยกออก", async (p) => { await nav(p, "เสียงและซับ"); await p.waitForTimeout(300); await drop(p, MOVIE); await p.waitForTimeout(1500); await clickText(p, "แยกออกจากหนัง"); }],
  ["บิตเรต-หน้าแรก", async (p) => { await nav(p, "บิตเรต"); }],
  ["บิตเรต-กราฟ", async (p) => { await nav(p, "บิตเรต"); await p.waitForTimeout(300); await p.evaluate((x) => { window.__pickNext = x; }, MOVIE); await clickText(p, "เลือกไฟล์จากเครื่อง"); await p.waitForFunction(() => window.__brDone === true, null, { timeout: 15000 }); }],
  ["บิตเรต-แบบเดิม", async (p) => { await nav(p, "บิตเรต"); await p.waitForTimeout(300); await p.evaluate((x) => { window.__pickNext = x; }, MOVIE); await clickText(p, "เลือกไฟล์จากเครื่อง"); await p.waitForFunction(() => window.__brDone === true, null, { timeout: 15000 }); await clickText(p, "แบบ Bitrate Viewer"); await p.waitForFunction(() => window.__brDone === true, null, { timeout: 15000 }); }],
  ["MediaInfo", async (p) => { await nav(p, "MediaInfo"); await p.waitForTimeout(300); await drop(p, MOVIE); await p.waitForTimeout(1200); }],
  ["ตรวจไฟล์", async (p) => { await nav(p, "ตรวจไฟล์"); }],
  ["ใส่โปสเตอร์-หนัง", async (p) => { await nav(p, "ใส่โปสเตอร์"); await p.waitForTimeout(300); await drop(p, MOVIE); await p.waitForTimeout(1200); }],
  // ขั้น 0.8 ซับไตเติล หน้าแก้ซับ ซับรูป OCR
  ["ซับไตเติล-หน้าแรก", async (p) => { await nav(p, "ซับไตเติล"); }],
  ["ซับไตเติล-แก้ซับ", async (p) => { await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", SUB_MOVIE); await p.waitForTimeout(2500); }],
  ["ซับไตเติล-notepad", async (p) => { await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", SUB_MOVIE); await p.waitForTimeout(2500); await clickText(p, "แบบ notepad"); await p.waitForTimeout(500); }],
  ["ซับไตเติล-ซ่อนภาพและเสียง", async (p) => { await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", SUB_MOVIE); await p.waitForTimeout(2500); await clickText(p, "ซ่อนภาพและเสียง"); await p.waitForTimeout(500); }],
  ["ซับรูป-ดูซับ", async (p) => { await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", IMG_MOVIE); await p.waitForTimeout(2500); }],
  ["ซับรูป-แปลงซับภาพ", async (p) => { await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", IMG_MOVIE); await p.waitForTimeout(2500); await clickText(p, "แปลงซับภาพ"); await p.waitForTimeout(800); }],
  ["OCR", async (p) => { await openOcr(p); }],
];
async function openOcr(p) {
  await nav(p, "ซับไตเติล"); await p.waitForTimeout(300); await call(p, "__subOpen", IMG_MOVIE); await p.waitForTimeout(2500);
  await clickText(p, "ดูซับ"); await p.waitForTimeout(300); await clickText(p, "OCR เป็นตัวหนังสือ", "button,[role=option],li"); await p.waitForTimeout(2500);
}

// ---------------------------------------------------------------- ถ่าย
// วาดด้วยซีพียูเธรดเดียว ขอบมนกับตัวอักษรได้สีเดิมทุกรอบ (ไม่ตั้ง ภาพสองรอบติดกันต่างกันราว 50 จุดภาพที่สีห่างกัน 1 ระดับ)
const browser = await chromium.launch({ args: ["--disable-gpu", "--disable-gpu-rasterization", "--disable-gpu-compositing", "--num-raster-threads=1", "--disable-partial-raster", "--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"] });
const fails = [];
let n = 0;
const jobs = SIZES.flatMap(([w, h]) => SHOTS.map(([name, act]) => ({ w, h, name, act, file: `${w}x${h}-${name}.png` })))
  .filter((j) => !ONLY || ONLY.has(j.name) || ONLY.has(j.file));
async function shoot({ w, h, act, file }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "th-TH", timezoneId: "Asia/Bangkok" });
  const p = await ctx.newPage();
  await p.clock.setFixedTime(new Date("2026-11-22T10:00:00+07:00"));
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  try {
    await p.goto(URL);
    await waitSel(p, "[data-navbar]");
    await p.addStyleTag({ content: STILL });
    // กราฟบนผืนภาพ (canvas) ไม่สั่งโหลดฟอนต์เอง โหลด Sarabun ทุกน้ำหนักก่อน ไม่งั้นบางรอบตัวหนังสือบนกราฟเป็นฟอนต์สำรอง
    await p.evaluate(() => Promise.all(["400", "500", "600", "700"].flatMap((wt) => [document.fonts.load(`${wt} 12px Sarabun`, "กขค abc 123"), document.fonts.load(`italic ${wt} 12px Sarabun`, "abc")])));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    await act(p);
    await p.waitForTimeout(700);
    await p.evaluate(() => document.fonts.ready);
    // รูปทุกรูปโหลดและถอดเสร็จก่อนถ่าย ไม่งั้นตอนเครื่องทำงานหนัก รูปย่อบางรูปยังเป็นภาพหยาบ (เจอที่รูปตัวอย่างในหน้าตั้งค่า เสียงและซับ)
    await p.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? i.decode().catch(() => {}) : new Promise((r) => { i.onload = i.onerror = r; })))));
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    // ถ่ายซ้ำจนสองภาพติดกันตรงกัน (สูงสุด 6 รอบ) ตอนเครื่องทำงานหนัก เบราว์เซอร์วาดรูปย่อแบบหยาบก่อนแล้วค่อยวาดละเอียดทีหลัง
    let shot = await p.screenshot();
    for (let k = 0; k < 6; k++) { await p.waitForTimeout(250); const again = await p.screenshot(); if (again.equals(shot)) break; shot = again; }
    writeFileSync(join(OUT, file), shot);
    n++;
    if (errs.length) fails.push(`${file} หน้าเว็บฟ้อง ${errs[0]}`);
  } catch (e) {
    fails.push(`${file} ${String(e.message ?? e).split("\n")[0]}`);
  }
  const miss = await p.evaluate(() => [...(window.__missing ?? [])]).catch(() => []);
  if (miss.length) writeFileSync(join(OUT, `${file}.missing.txt`), miss.join("\n")); else rmSync(join(OUT, `${file}.missing.txt`), { force: true });
  await ctx.close();
}
// ถ่ายพร้อมกันหลายหน้าต่าง (JOBS ค่าตั้งต้น 3) แต่ละหน้าต่างแยกกัน ภาพไม่ปนกัน
const JOBS = Number(process.env.JOBS ?? 3);
let next = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, async () => { while (next < jobs.length) await shoot(jobs[next++]); }));
await browser.close();
if (vite) vite.kill();
console.log(`ถ่ายแล้ว ${n} ภาพ ลง ${OUT}`);
if (fails.length) { console.log(`ถ่ายไม่ได้หรือหน้าเว็บฟ้อง ${fails.length} ภาพ`); for (const f of fails) console.log("  " + f); process.exit(1); }
