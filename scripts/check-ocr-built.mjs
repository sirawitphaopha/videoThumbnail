// หน้า OCR กับตัวโปรแกรมที่สร้างจริง ใต้กติกาความปลอดภัย CSP (แผน OCR ขั้น 13) · ใช้: เปิด scripts/dev-app.ps1 -Built ก่อน แล้ว node scripts/check-ocr-built.mjs
// โหมดพัฒนาไม่ใช้ CSP ตัวจริง ภาพซับที่ส่งเป็น data URL กับ onnxruntime.dll ที่โหลดเองต้องลองกับตัวจริง
// ตรวจ เปิดซับไทยทดสอบ ภาพในตารางขึ้น อ่านจริงด้วย PaddleOCR ไทย (โหลด onnxruntime.dll ในตัวจริง) ข้อความขึ้นครบ
//   หน้าต่างส่งออกทำตัวอย่าง SRT ได้ ไปหน้าแก้ซับเปิดผลได้ ไม่มีการละเมิด CSP · ไม่เขียนไฟล์ส่งออก (ตัวจริงไม่มีทางลัดเลือกที่เก็บ)
// คืนค่าตั้ง OCR กับค่าส่งออกที่จำในเครื่องตอนจบ · ด่านหน้าต่างหน้าสุดตอนพี่กันเลิกงาน ตอนพี่กันทำงานอยู่ส่ง NOGATE=1
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

if (process.env.NOGATE !== "1") {
  try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts", "fg-gate.ps1")], { stdio: "inherit" }); }
  catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); }
}
const TH = resolve("test-media", "สร้าง", "ocr", "th.sup").replace(/\\/g, "/");
const SHOT = "docs/report-2026-11-17/OCR-ขั้น13";
mkdirSync(SHOT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(200); } return false; };

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const keep = await q("return { cfg: localStorage.getItem('ms.ocrCfg'), exp: localStorage.getItem('ms.ocrExport') };");
try {
  check("เป็นตัวโปรแกรมที่สร้างจริง ไม่ใช่โหมดพัฒนา", await q("return !location.href.startsWith('http://localhost:1420') && !window.__ocrJob;"), await q("return location.href;"));
  // ตัวอ่าน PaddleOCR ภาษาไทย ตั้งผ่านค่าที่จำในเครื่อง (ตัวจริงไม่มี __ocrJob) · ชนิดส่งออกกลับเป็นค่าตั้งต้น SubRip
  await q(`const c0 = JSON.parse(localStorage.getItem('ms.ocrCfg') ?? '{}'); localStorage.setItem('ms.ocrCfg', JSON.stringify({ ...c0, engine: 'paddle', paddle: { ...(c0.paddle ?? {}), lang: 'th', size: 'small', vertical: 'auto', orientation: false }, helpers: [], lang3: 'tha', dict: '' })); localStorage.removeItem('ms.ocrExport'); return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await q("window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); return 1;");
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ซับไตเติล')?.click(); return 1;`);
  await sleep(500);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(TH)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-ocr-open]') || !!document.querySelector('[data-ocr-table]');", 30000);
  if (!(await q("return !!document.querySelector('[data-ocr-table]');"))) await c.click("[data-ocr-open]");
  check("เปิดซับไทยทดสอบ หน้า OCR ขึ้น 17 ภาพ", await waitFor("return document.querySelectorAll('[data-ocr-table] tbody tr').length === 17;", 30000));
  check("ภาพซับในตารางขึ้นใต้ CSP", await waitFor("const im = [...document.querySelectorAll('[data-ocr-table] tbody img')]; return im.length > 3 && im.every((i) => i.complete && i.naturalWidth > 0);", 15000),
    await q("return String(document.querySelectorAll('[data-ocr-table] tbody img').length);"));
  await c.click("[data-ocr-start]");
  const read = await waitFor("return !document.querySelector('[data-ocr-prog]') && !!document.querySelector('[data-ocr-export]');", 120000);
  const first = await q("return document.querySelector('[data-ocr-table] tbody tr .ocr-txt')?.innerText.trim() ?? '';");
  check("อ่านจริงด้วย PaddleOCR ไทยในตัวจริง (โหลด onnxruntime.dll ได้) ข้อความภาพแรกถูก", read && first.replace(/\s/g, "") === "สวัสดีครับผู้ใหญ่บ้านอยู่ไหม", first);
  await c.shot(`${SHOT}/1-ตัวจริง-อ่านครบ.png`);
  await c.click("[data-ocr-export]");
  check("หน้าต่างส่งออกทำตัวอย่าง SRT ได้ในตัวจริง", await waitFor("return (document.querySelector('[data-ocr-exp-text]')?.innerText ?? '').includes('-->');", 15000));
  await c.shot(`${SHOT}/2-ตัวจริง-ส่งออก.png`, ".dlg");
  await c.key("Escape"); await sleep(400);
  await c.click("[data-ocr-to-edit]");
  check("ไปหน้าแก้ซับเปิดผล OCR เป็น ASS ในตัวจริง", await waitFor("return !!document.querySelector('[data-subedit][data-se-kind=ass]') && (document.querySelector('[data-se-count]')?.innerText ?? '').includes('บรรทัด');", 15000),
    await q("return document.querySelector('[data-se-count]')?.innerText ?? '';"));
  await c.shot(`${SHOT}/3-ตัวจริง-หน้าแก้ซับ.png`);
  const csp = await q("return window.__csp;");
  check("ไม่มีการละเมิด CSP ระหว่างทั้งหมด", csp.length === 0, JSON.stringify(csp.slice(0, 4)));
} finally {
  await q(`${keep.cfg == null ? "localStorage.removeItem('ms.ocrCfg')" : `localStorage.setItem('ms.ocrCfg', ${JSON.stringify(keep.cfg)})`}; ${keep.exp == null ? "localStorage.removeItem('ms.ocrExport')" : `localStorage.setItem('ms.ocrExport', ${JSON.stringify(keep.exp)})`}; return 1;`).catch(() => {});
  await q("window.__subClear?.(); return 1;").catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
}
console.log(`\nผ่าน ${results.filter(Boolean).length} จาก ${results.length} ข้อ`);
process.exit(results.every(Boolean) ? 0 : 1);
