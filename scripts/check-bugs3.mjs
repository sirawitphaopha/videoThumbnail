// ตัวตรวจบั๊กชุด 3 ข้อ 8 หน้าใส่โปสเตอร์ (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// รูปไม่ใช่ 2 : 3 ยังไม่ครอปเอง ขึ้นกล่องเลือกแบบปกบนการ์ด · ครอปเองแล้วไม่ขึ้น · เลือก ตามรูปเดิม ในหน้าต่างครอปขึ้นคำเตือนตรงนั้น · กล่อง PNG สีตามโทน
// เปิดโปรแกรมโหมดพัฒนาก่อน · ไม่กดปุ่มเลือกไฟล์ ไม่กดครอบ · ไฟล์หนังเป็นสำเนาใน D:\dev\tmp\ชั้นชุด3
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด3`; mkdirSync(OUT, { recursive: true });
const DIR = "D:\\dev\\tmp\\ชั้นชุด3"; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
const MOVIE = join(DIR, "The Last Orchard (2022).mp4"); copyFileSync(`${ROOT}/test-media/สร้าง/หนัง/The Last Orchard (2022).mp4`, MOVIE);
const WIDE = `${ROOT}/test-media/สร้าง/รูป/wide.jpg`;

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await c.evaluate("location.hash = ''; location.reload()"); await sleep(3000);
await nav("ใส่โปสเตอร์");
const S = "[data-pageslot=poster]";
const pdrop = (path, zone) => c.evaluate(`(() => { const r = document.querySelector('${S} [data-drop=${zone}]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(path)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
await pdrop(MOVIE, "movie"); await waitFor(`return (document.querySelector('${S} [data-card=movie]')?.innerText ?? '').includes('The Last Orchard')`, 20000);
await pdrop(WIDE, "poster"); await waitFor("return !!document.querySelector('[data-use]')", 20000); await sleep(800);
await q(`document.querySelector('[data-use]').click()`); await waitFor(`return !document.querySelector('[data-crop]')`, 20000); await sleep(800);
// ลากรูปแล้วหน้าต่างครอปเปิดให้เลือกทุกครั้ง กดใช้รูปนี้ = ผู้ใช้เลือกในหน้าต่างครอปแล้ว (พี่กันเคาะ "เเต่ผู้ใช้ก็ปรับ เเละเลือกเเล้วนะ ใน poup")
check("ข้อ 8 รูปไม่ใช่ 2 : 3 เลือกในหน้าต่างครอปแล้ว (กดใช้รูปทันที) การ์ดไม่ขึ้นกล่องเหลือง", await q(`return !document.querySelector('${S} [data-not23]')`));
// เปิดหน้าต่างครอป เลือก ตามรูปเดิม · PNG
await q(`[...document.querySelectorAll('${S} button')].find(b => b.innerText.includes('ครอป/แปลงรูป'))?.click()`); await waitFor("return !!document.querySelector('[data-crop]')", 10000); await sleep(800);
await q(`[...document.querySelectorAll('.dlg .seg button')].find(b => b.innerText.includes('ตามรูปเดิม'))?.click()`); await sleep(500);
const ow = await q(`return document.querySelector('[data-origwarn]')?.innerText.replace(/\\s+/g, ' ')`);
check("ข้อ 8 หน้าต่างครอป เลือก ตามรูปเดิม กับรูปไม่ใช่ 2 : 3 ขึ้นคำเตือนตรงจุดที่เลือก", /ไม่เต็มช่อง/.test(ow ?? ""), ow);
await q(`[...document.querySelectorAll('.dlg .seg button')].find(b => b.innerText.trim() === 'PNG')?.click()`); await sleep(700);
const png = await q(`const e = document.querySelector('[data-pngnote]'); return e ? { cls: e.className, bg: getComputedStyle(e).backgroundColor } : null`);
check("ข้อ 8 กล่อง PNG ไม่ลดคุณภาพ ใช้สีตามโทน ไม่ใช่สีเตือน", png && /tone/.test(png.cls) && !/warn/.test(png.cls), JSON.stringify(png));
const fit = await q(`const d = document.querySelector('.dlg'), r = d.getBoundingClientRect(); return { h: Math.round(r.height), over: d.scrollHeight > d.clientHeight + 2, win: innerHeight }`);
check("ข้อ 8 คำเตือนใหม่ไม่ดันหน้าต่างครอปจนล้นจอ", !fit.over && fit.h <= fit.win, JSON.stringify(fit));
await c.shot(`${OUT}/08-หน้าต่างครอป-ตามรูปเดิม-PNG.png`, ".dlg", 0);
await q(`[...document.querySelectorAll('.dlg .seg button')].find(b => b.innerText.trim() === 'JPG')?.click()`); await sleep(300);
await q(`document.querySelector('[data-use]').click()`); await waitFor(`return !document.querySelector('[data-crop]')`, 20000); await sleep(800);
check("ข้อ 8 ครอปเองในหน้าต่างครอปแล้ว กล่องเหลืองบนการ์ดไม่ขึ้น", await q(`return !document.querySelector('${S} [data-not23]')`));
await c.shot(`${OUT}/08-ครอปแล้วไม่ขึ้นกล่องเหลือง.png`, `${S} [data-card=poster]`, 6);
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
