// เครื่องมือบนภาพของหน้าแก้ซับกับตัวโปรแกรมที่สร้างจริง ใต้กติกาความปลอดภัย CSP (BUGS ข้อ 111 ส่วนที่สองและสาม)
// ใช้: เปิด scripts/dev-app.ps1 -Built ก่อน แล้ว node scripts/check-subvtools-built.mjs
// ภาพซับที่ libass วาด (data:image/png) ขึ้นบนภาพนิ่ง · กากบาทกับจุดจับขึ้น · บันทึกภาพ PNG สามแบบลงสำเนาหนังใน D:\dev\tmp · ไม่มีการละเมิด CSP
// ตัวจริงไม่มีทางลัดของโหมดพัฒนา (__vidLib __snapDry) จึงพาภาพไปบรรทัดป้ายด้วย AUTO และไม่กดคัดลอกภาพ (จะแตะคลิปบอร์ดของคนที่ใช้คอม)
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const TMP = "D:/dev/tmp/ชั้นแก้ซับเครื่องมือภาพตัวจริง";
const MOVIE = `${TMP}/ฉากตัด (2025).mkv`;
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
copyFileSync("D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv", MOVIE);

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const mouse = (type, x, y, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  check("เป็นตัวจริง ไม่มีทางลัดของโหมดพัฒนา", await q("return !window.__vidLib && !window.__subVisualLib"));
  await q(`window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); return 1;`);
  await q("[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().startsWith('ซับไตเติล'))?.click(); return 1;");
  await sleep(300);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  check("เปิดสำเนาหนัง อ่านเวลาเฟรมเสร็จ", await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 30000));
  // AUTO เปิดอยู่ เลือกบรรทัดป้าย \pos(640,90) แล้วภาพไปเวลาเริ่มของบรรทัด (4.00 วินาที)
  if (await q("return document.querySelector('[data-vauto]')?.getAttribute('aria-pressed') !== 'true'")) await c.click("[data-vauto]");
  // ตัวจริงไม่มี __subEdit เลือกแถวป้าย (เริ่ม 0:00:04.00) ด้วยเมาส์จริงในตาราง ตารางเลือกแถวตอนกดเมาส์ลง
  const id = await q("return [...document.querySelectorAll('[data-sub-table] tbody tr')].find((x) => x.cells[2]?.innerText.trim() === '0:00:04.00')?.dataset.id ?? null;");
  check("เจอแถวป้ายในตาราง", !!id);
  await c.click(`[data-sub-table] tr[data-id="${id}"]`);
  const ov = await waitFor("const i = document.querySelector('[data-vsubimg][data-vsubnow]'); return !!i && i.complete && i.naturalWidth > 0 && i.src.startsWith('data:image/png');", 20000);
  check("ภาพซับที่ libass วาดขึ้นใต้ CSP (data:image/png โหลดสำเร็จ)", ov, await q("const i = document.querySelector('[data-vsubimg]'); return i ? i.naturalWidth + ' × ' + i.naturalHeight : 'ไม่มีภาพ';"));
  const b = await c.box("[data-vtools]");
  await mouse("mouseMoved", b.left + 80, b.top + 45);
  await sleep(200);
  check("กากบาทกับพิกัดขึ้น", !!(await q("return document.querySelector('[data-vxtext]')?.textContent")), await q("return document.querySelector('[data-vxtext]')?.textContent"));
  await c.click("[data-vtool=drag]");
  await sleep(300);
  check("เครื่องมือลาก จุดจับขึ้น", (await q("return document.querySelectorAll('[data-vfeat]').length")) >= 1);
  for (const mode of ["save", "save-raw", "save-only"]) {
    await mouse("mouseMoved", b.x, b.y);
    await mouse("mousePressed", b.x, b.y, { button: "right", buttons: 2, clickCount: 1 });
    await mouse("mouseReleased", b.x, b.y, { button: "right", buttons: 0, clickCount: 1 });
    await sleep(250);
    await c.click(`[data-vctx=${mode}]`);
    await waitFor("return document.querySelector('[data-vnote]')?.dataset.vnote === 'ok'", 20000);
    await sleep(100);
  }
  const files = readdirSync(TMP).filter((f) => f.endsWith(".png"));
  check("บันทึกภาพ PNG สามแบบข้างสำเนาหนัง", files.length === 3, files.join(" "));
  await c.click("[data-vtool=cross]");
  const csp = await q("return window.__csp;");
  check("ไม่มีการละเมิด CSP ระหว่างทั้งหมด", csp.length === 0, csp.join(" | "));
} finally {
  await q("window.__subClear(); return 1;").catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
  try { rmSync(TMP, { recursive: true, force: true }); } catch { console.log("ลบโฟลเดอร์ทดสอบไม่ได้"); }
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
process.exit(pass === results.length ? 0 : 1);
