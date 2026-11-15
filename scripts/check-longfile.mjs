// AUDIT 12 พ.ย. 2569 ข้อ 34 ชื่อไฟล์หนังยาวที่ไม่มีเว้นวรรค (ชื่อไฟล์ที่ใช้จุดคั่น) ต้องไม่ล้นแผงขวา ตาราง และหัวหน้าข้อมูลไฟล์
// ลอกหนังทดสอบหนึ่งเรื่องไป D:\dev\tmp\ชั้นชื่อยาว ตั้งชื่อยาว ตั้งโฟลเดอร์หนังชั่วคราว แล้วคืนเป็นชุดทดสอบมาตรฐานกับมุมมองเดิมตอนจบ ลบโฟลเดอร์ชั่วคราว
// เปิดโปรแกรมโหมดพัฒนาก่อน · ภาพลง docs/report-2026-11-15/AUDIT-กลุ่ม3/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const OUT = "D:/movie-shelf/docs/report-2026-11-15/AUDIT-กลุ่ม3"; mkdirSync(OUT, { recursive: true });
const STD = resolve("D:/movie-shelf/test-media", "สร้าง", "หนัง");
const DIR = "D:\\dev\\tmp\\ชั้นชื่อยาว";
const NAME = "Interstellar.2014.2160p.UHD.BluRay.x265-TERMiNAL";
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ากำลังโหลด */ } await sleep(200); } return false; };
const scan = async (want) => { await inv("scan_library"); for (let i = 0; i < 120; i++) { const r = await inv("get_library"); if (!r.scanning && want(r.movies)) return; await sleep(400); } };
// กล่องนี้ล้นกรอบที่ครอบไหม · ขอบขวาของตัวหนังสือเทียบขอบขวาของกรอบ
const overflow = (sel, box) => q(`const e = document.querySelector(${JSON.stringify(sel)}), b = e?.closest(${JSON.stringify(box)}); if (!e || !b) return null; const r = document.createRange(); r.selectNodeContents(e); const t = r.getBoundingClientRect(), bb = b.getBoundingClientRect(); return { text: e.innerText.replace(/\\s+/g, ' '), right: Math.round(t.right), boxRight: Math.round(bb.right), lines: Math.round(t.height / parseFloat(getComputedStyle(e).lineHeight || '20')), scroll: e.scrollWidth > e.clientWidth + 1 }`);

// คำระหว่างตัวคั่น (จุด ขีด ขีดล่าง) ที่ขึ้นสองบรรทัด · ว่าง = ไม่มีคำขาดกลาง
const splitWords = (sel) => q(`const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.innerText.includes('Interstellar')); if (!e) return null;
  const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const ch = []; let n;
  while ((n = w.nextNode())) for (let i = 0; i < n.data.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const b = r.getBoundingClientRect(); ch.push({ c: n.data[i], top: Math.round(b.top) }); }
  const bad = []; let seg = [];
  const end = () => { if (seg.length > 1 && new Set(seg.map((x) => x.top)).size > 1) bad.push(seg.map((x) => x.c).join('')); seg = []; };
  for (const x of ch) { if (/[._-]/.test(x.c)) { end(); continue; } seg.push(x); } end();
  return bad;`);
const before = await inv("get_settings");
let viewWas = "ภาพปก";
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
copyFileSync(join(STD, "Harbor Lights (2021).mkv"), join(DIR, NAME + ".mkv"));
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await inv("set_settings", { patch: { folders: [DIR], viewMode: "grid" } });
  await scan((ms) => ms.some((m) => m.name === NAME));
  await c.evaluate("location.reload()"); await sleep(2500);
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.includes('ชั้นวางหนัง'))?.click(); return 1`);
  await waitFor("return !!document.querySelector('.book[data-movie]') || !!document.querySelector('table')");
  // จำมุมมองบนหน้าตอนเริ่ม คืนด้วยการกดปุ่มตอนจบ (ตั้งผ่านคำสั่งตรงหน้าไม่รับ ชั้นวางค้างเป็นตาราง เจอ 15 พ.ย. 2569)
  viewWas = await q(`return [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "ตาราง")?.className.includes("on") ? "ตาราง" : "ภาพปก"`);
  await q(`[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "ภาพปก")?.click(); return 1`); await sleep(600);
  await waitFor("return !!document.querySelector('.book[data-movie]')");
  // ---------- แผงขวา ----------
  await q("if (!document.querySelector('.book.sel')) document.querySelector('.book[data-movie]')?.click(); return 1"); await sleep(600);
  const p = await overflow("[data-detail] .fname .nm", "[data-detail]");
  const btn = await q(`const b = [...document.querySelectorAll('[data-detail] .fname button')][0], d = document.querySelector('[data-detail]'); if (!b) return null; const r = b.getBoundingClientRect(), dr = d.getBoundingClientRect(); return { right: Math.round(r.right), boxRight: Math.round(dr.right), w: Math.round(r.width) }`);
  check("แผงขวา ชื่อยาวไม่มีเว้นวรรคตัดบรรทัดอยู่ในแผง ไม่ล้นขวา", !!p && p.right <= p.boxRight && p.lines >= 2 && p.text.includes(".mkv"), JSON.stringify(p));
  check("แผงขวา ปุ่มข้างชื่อยังอยู่ในแผงครบ", !btn || (btn.right <= btn.boxRight && btn.w > 10), JSON.stringify(btn));
  const ext = await q(`const nm = document.querySelector('[data-detail] .fname .nm'), e = nm?.querySelector('.ext'); if (!e) return null; const r = document.createRange(); r.selectNodeContents(nm); const rects = [...r.getClientRects()]; const last = rects[rects.length - 1], er = e.getBoundingClientRect(); return { sameLine: Math.abs(er.top - last.top) < 4 }`);
  check("แผงขวา นามสกุลอยู่บรรทัดเดียวกับท้ายชื่อ", !!ext && ext.sameLine, JSON.stringify(ext));
  const ws = await splitWords("[data-detail] .fname .nm");
  check("แผงขวา ตัดบรรทัดตรงตัวคั่น ไม่มีคำขาดกลาง", Array.isArray(ws) && ws.length === 0, JSON.stringify(ws));
  await c.shot(`${OUT}/34-แผงขวาชื่อยาว.png`, "[data-detail] .fname", 8);
  // ---------- หน้าข้อมูลไฟล์ ----------
  await q(`[...document.querySelectorAll('[data-detail] button')].find((b) => b.innerText.trim() === 'MediaInfo')?.click(); return 1`);
  if (await waitFor(`return [...document.querySelectorAll('div')].some((d) => d.style.fontSize === '17px' && d.innerText.includes(${JSON.stringify(NAME.slice(0, 12))}))`, 8000)) {
    const h = await q(`const d = [...document.querySelectorAll('div')].find((x) => x.style.fontSize === '17px' && x.innerText.includes(${JSON.stringify(NAME.slice(0, 12))})); const r = document.createRange(); r.selectNodeContents(d); const t = r.getBoundingClientRect(), page = null; return { right: Math.round(t.right), pageRight: innerWidth, docOver: document.documentElement.scrollWidth > innerWidth }`);
    check("หน้าข้อมูลไฟล์ หัวชื่อยาวไม่ล้นขวา ไม่มีแถบเลื่อนแนวนอน", h.right <= h.pageRight && !h.docOver, JSON.stringify(h));
    await c.shot(`${OUT}/34-หน้าข้อมูลไฟล์ชื่อยาว.png`, `div[style*="font-size: 17px"]`, 2).catch((e) => console.log("ถ่ายภาพหน้าข้อมูลไฟล์ไม่ได้", String(e)));
    await q(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'กลับไปชั้นวาง')?.click(); return 1`); await sleep(500);
  } else check("เปิดหน้าข้อมูลไฟล์ได้", false);
  // ---------- ตาราง ----------
  await q(`[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "ตาราง")?.click(); return 1`); await sleep(800);
  await q("document.querySelector('.dclose')?.click(); return 1"); await sleep(300);
  const cell = await q(`const td = [...document.querySelectorAll('table td')].find((x) => x.innerText.includes(${JSON.stringify(NAME.slice(0, 12))})); if (!td) return null; const r = document.createRange(); r.selectNodeContents(td.firstElementChild ?? td); const t = r.getBoundingClientRect(), b = td.getBoundingClientRect(); return { right: Math.round(t.right), cellRight: Math.round(b.right) }`);
  if (!cell) console.log(await q("return { tables: document.querySelectorAll('table').length, view: document.querySelector('[data-pageslot=shelf]')?.innerText.slice(0, 120) }"));
  check("ตาราง ชื่อยาวไม่ล้นทับคอลัมน์ถัดไป", !!cell && cell.right <= cell.cellRight + 1, JSON.stringify(cell));
  const wt = await splitWords("table td");
  check("ตาราง ตัดบรรทัดตรงตัวคั่น ไม่มีคำขาดกลาง", Array.isArray(wt) && wt.length === 0, JSON.stringify(wt));
  await c.shot(`${OUT}/34-ตารางชื่อยาว.png`, "table", 0).catch(() => {});
} finally {
  await inv("set_settings", { patch: { folders: before.folders?.length ? before.folders : [STD], viewMode: before.viewMode } });
  await scan((ms) => !ms.some((m) => m.name === NAME));
  rmSync(DIR, { recursive: true, force: true });
  await q(`[...document.querySelectorAll("button")].find((b) => b.innerText.trim() === ${JSON.stringify(viewWas)})?.click(); return 1`); await sleep(400);
  await c.send("Emulation.clearDeviceMetricsOverride", {});
  await c.evaluate("location.reload()"); await sleep(2000);
}
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
