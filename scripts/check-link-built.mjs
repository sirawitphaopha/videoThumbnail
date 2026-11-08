// ระบบจับคู่รูปปก กับตัวโปรแกรมที่สร้างจริง · รูปทุกชนิดต้องขึ้นภายใต้กติกาความปลอดภัย CSP (TECH-REVIEW ข้อ 5)
// tauri dev ไม่ใช้กติกาตัวจริง check-link.mjs จึงจับเรื่องนี้ไม่ได้ · ตัวจริงไม่มีตัวรับลากจำลอง จึงสั่งผ่านคำสั่งตรงแล้วดูผลบนจอ
// ลอกชุดทดสอบไปไว้ D:\dev\tmp\ชั้นจับคู่ตัวจริง ไม่แตะของจริง · ไม่กดปุ่มเลือกไฟล์ ไม่กดปิดโปรแกรมจริง
// ใช้: node scripts/check-link-built.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 -Built)
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "จับคู่");
const OUT = "docs/report-2026-11-08/จับคู่ปก-ตัวจริง";
const DIR = "D:\\dev\\tmp\\ชั้นจับคู่ตัวจริง";
const MOV = join(DIR, "หนัง"), IMG = join(DIR, "รูป");

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "✅" : "❌"} ${name}${detail !== "" ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = (label) => c.evaluate(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.includes(${JSON.stringify(label)})).click()`);
const shot = async (f, sel, h = 1000) => {
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  await c.move(5, h - 5);
  await sleep(200);
  await c.shot(`${OUT}/${f}`, sel, 4);
  await c.send("Emulation.clearDeviceMetricsOverride");
  await sleep(150);
};
const rowSel = (title) => `[...document.querySelectorAll('[data-link-row]')].find((r) => r.querySelector('.lname b')?.textContent === ${JSON.stringify(title)})`;
const reload = async () => { await c.evaluate("location.hash = ''; location.reload()"); await sleep(1500); await waitFor("return !!document.querySelector('.side .nav')"); await sleep(400); };
const seg = async (label) => { await c.evaluate(`[...document.querySelectorAll('.shelfhead .seg button')].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`); await sleep(250); };
const allLoaded = (sel) => `const i = [...document.querySelectorAll(${JSON.stringify(sel)})]; return i.length > 0 && i.every((x) => x.complete && x.naturalWidth > 0)`;

// จดทุกอย่างที่โดนกติกาความปลอดภัยกัน ตั้งแต่ก่อนหน้าโหลด
await c.send("Page.enable");
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI }));" });
await reload();
check("เป็นตัวโปรแกรมที่สร้างจริง ไม่ใช่ dev server", (await q("return location.origin")) === "http://tauri.localhost");
check("ตัวจริงไม่มีตัวรับลากจำลองของตัวตรวจ", await q("return window.__linkDrop === undefined && window.__boardDrop === undefined"));

// เตรียมชุดทดสอบ · เอาโฟลเดอร์ออกจากคลังก่อนลบ คลังจำหนังตามที่อยู่ไฟล์ด้วย
await inv("set_settings", { patch: { folders: [], linkStore: "beside" } });
await inv("scan_library");
for (let i = 0; i < 100; i++) { await sleep(200); const l = await inv("get_library"); if (!l.scanning && l.movies.length === 0) break; }
await inv("dev_clear_parked");
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, DIR, { recursive: true });
await inv("set_settings", { patch: { folders: [MOV] } });
await inv("scan_library");
for (let i = 0; i < 200; i++) { await sleep(200); const l = await inv("get_library"); if (!l.scanning && l.movies.length >= 14) break; }
await inv("link_add_images", { paths: [IMG] });
await inv("link_images");
await inv("link_auto", { scope: "nocover" });
await reload();
await nav("จับคู่ปก");
await waitFor("return !!document.querySelector('[data-link-table]')");

// ภาพเล็กรูปต้นทาง ทำเบื้องหลัง ทยอยขึ้น
check("ตาราง ภาพเล็กรูปต้นทางขึ้นภายใต้กติกาตัวจริง", await waitFor(`const i = [...document.querySelectorAll('[data-link-chosen] img')]; return i.length >= 8 && i.slice(0, 8).every((x) => x.complete && x.naturalWidth > 0)`, 60000));
await shot("1-ตาราง.png", "[data-link-table]", 1000);

// หน้าครอป ภาพหลัก ตัวอย่าง เอียงแล้วภาพหลังครอปในแถว
await c.evaluate(`${rowSel("Tidal (2021)")}.scrollIntoView({ block: 'center' })`);
await c.evaluate(`${rowSel("Tidal (2021)")}.querySelector('[data-link-crop]').click()`);
await waitFor("return !!document.querySelector('[data-crop] .cropbox')");
check("หน้าครอป ภาพหลักกับตัวอย่างขึ้น", await waitFor(allLoaded("[data-crop] .stage img, [data-crop] .pv img"), 10000));
for (let i = 0; i < 6; i++) await c.evaluate("document.querySelector('[data-tilt-plus]').click()");
await sleep(600);
check("เอียงแล้วภาพยังขึ้น", await waitFor(allLoaded("[data-crop] .stage img, [data-crop] .pv img"), 5000));
await shot("2-ครอป.png", ".dlg", 900);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]')");
check("ภาพหลังครอปในแถวขึ้น", await waitFor(`const i = ${rowSel("Tidal (2021)")}.querySelector('[data-link-chosen] img'); return decodeURIComponent(i.src).includes('crop-') && i.complete && i.naturalWidth > 0`, 8000));

// ยืนยันทั้งหมด ปกขึ้นชั้นวาง
await c.evaluate("document.querySelector('[data-link-confirm-all]').click()");
await waitFor("return !document.querySelector('[data-link-progress]') && /รอยืนยัน 0 คู่/.test(document.querySelector('[data-link-count]')?.innerText)", 90000);
check("ยืนยันทั้งหมด ได้ไฟล์ -poster ข้างหนัง", existsSync(join(MOV, "Tidal.2021.1080p-poster.jpg")) && existsSync(join(MOV, "Night.Bus.2020-poster.jpg")));
await nav("ชั้นวางหนัง");
await waitFor("return !!document.querySelector('[data-shelf-filter]')");
await seg("ภาพปก");
await seg("ปกตั้ง");
await c.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1400, deviceScaleFactor: 1, mobile: false });
check("ปกจับคู่ทุกเล่มบนชั้นวางขึ้น", await waitFor(allLoaded("[data-shelf] .book img"), 15000), await q("return document.querySelectorAll('[data-shelf] .book img').length + ' เล่ม'"));
await c.send("Emulation.clearDeviceMetricsOverride");
await sleep(200);
check("มีป้ายโซ่บนชั้นวาง", await q("return document.querySelectorAll('[data-shelf] [data-linkb]').length > 0"));
await shot("3-ชั้นวาง.png", ".main", 1000);
await seg("ปกนอน");
check("สลับปกนอน รูปปกนอนขึ้น", await waitFor(`const b = document.querySelector('[data-movie^="Silent.Orbit"]'); const i = b?.querySelector('img'); return b.classList.contains('wide') && i.complete && i.naturalWidth > 0`, 8000));
await seg("ปกตั้ง");
await c.evaluate(`document.querySelector('[data-movie^="Tidal"]').click()`);
await waitFor("return !!document.querySelector('[data-link-card]')");
check("แผงขวา รูปปกจับคู่ขึ้น", await waitFor(allLoaded("[data-detail] img.dposter"), 8000));
await shot("4-แผงขวา.png", "[data-detail]", 1100);

// แถบทำต่อกับหน้าต่างถาม · กดปุ่มปิดจริง แล้วกลับไปดูก่อน ไม่ปิดโปรแกรม
const mv = (await inv("get_library")).movies.find((m) => m.name.startsWith("Tidal"));
// แถวจากชั้นวางที่ยังไม่แตะไม่นับว่ารอ · ใช้จับคู่เองแทน
await inv("link_pair", { id: mv.id, paths: [join(IMG, "tidal_alt.jpg")], via: "board" });
await reload();
check("เปิดใหม่มีคู่ค้าง ขึ้นแถบทำต่อ", await waitFor("return !!document.querySelector('[data-link-resume]')", 8000));
await c.click(".titlebar .ctl button.close");
check("กดปิด ขึ้นหน้าต่างถาม โปรแกรมไม่ปิด", await waitFor("return !!document.querySelector('[data-closepairs]')", 4000));
await c.evaluate("document.querySelector('[data-closepairs-back]').click()");
await waitFor("return !!document.querySelector('[data-link-table]')");
await inv("link_row_update", { id: mv.id, patch: { skip: true } });

const csp = await q("return window.__csp ?? null");
check("ไม่มีอะไรโดนกติกาความปลอดภัยกันตลอดการเทส", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));

const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
c.close();
process.exit(pass === results.length ? 0 : 1);
