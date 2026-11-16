// BUGS ข้อ 150 แยกซับ VobSub ออกจากหนังได้ทั้ง .idx กับ .sub และข้อความไม่สำเร็จบอกสาเหตุเป็นภาษาไทย · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-extract150.mjs
// ทำงานกับสำเนาหนังทดสอบ ซับรูป (2024).mkv ใน D:\dev\tmp\ชั้นแยกVobSub ลบตอนจบ · ตั้งรูปแบบชื่อเป็นค่าตั้งต้นระหว่างตรวจ แล้วคืนค่าเดิม
// ทางไม่สำเร็จ สร้างโฟลเดอร์ชื่อเดียวกับไฟล์ชั่วคราวไว้ก่อน mkvextract จึงสร้างไฟล์ไม่ได้จริง
// ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 ข้ามด่านหน้าต่างหน้าสุด
import { mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const NOGATE = process.env.NOGATE === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();

const TMP = "D:/dev/tmp/ชั้นแยกVobSub";
const MOVIE = `${TMP}/ซับรูป (2024).mkv`;
const OUT = `${TMP}/แยกไฟล์`;
const SHOT = "docs/report-2026-11-16/แยกVobSub";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync("D:/movie-shelf/test-media/สร้าง/เสียงซับ/ซับรูป (2024).mkv", MOVIE);

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const ls = () => existsSync(OUT) ? readdirSync(OUT).sort() : [];
const cardText = () => q("return document.querySelector('[data-extract]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
const pickText2 = async () => {
  await waitFor("return !!document.querySelector('[data-xpick=\"text:2\"]')", 20000);
  await q("for (const e of [...document.querySelectorAll('[data-xpick][aria-checked=true]')]) { e.click(); await new Promise((r) => setTimeout(r, 60)); } return 1;"); await sleep(200);
  await q("document.querySelector('[data-xpick=\"text:2\"]').click(); return 1;"); await sleep(200);
};
const again = async () => { await q("[...document.querySelectorAll('[data-extract] button')].find((b) => /แยกอย่างอื่นต่อ|กลับไปเลือกใหม่/.test(b.innerText))?.click(); return 1;"); await sleep(300); };

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const pat0 = (await inv("get_settings")).settings.extractPattern;
try {
  await inv("set_settings", { patch: { extractPattern: "{Filename}.{Type}{Number}.{Language}{Delay}" } });
  await q("location.reload(); return 1;"); await sleep(3500);
  await nav("เสียงและซับ"); await sleep(500);
  await q(`window.__avDrop([${JSON.stringify(MOVIE)}], 400, 300); return 1;`);
  await waitFor("return (document.querySelector('[data-movie-chip]')?.innerText ?? '').includes('ซับรูป')", 20000);
  await q("[...document.querySelectorAll('[data-method] .avm-card')].find((b) => b.innerText.includes('แยกออกจากหนัง')).click(); return 1;");
  await pickText2();

  /* ---------------------------------------------------------------- แยกได้สองไฟล์ */
  await click("[data-extract-start]");
  check("แยกซับ VobSub บอกว่าแยกครบ 2 ไฟล์", await waitFor("return (document.querySelector('[data-extract]')?.innerText ?? '').includes('แยกครบ 2 ไฟล์')", 30000), await cardText());
  const t1 = await cardText();
  check("การ์ดบอกชื่อทั้ง .idx และ .sub", t1.includes("ซับรูป (2024).Text2.en.idx") && t1.includes("ซับรูป (2024).Text2.en.sub"), t1);
  check("ในโฟลเดอร์มีสองไฟล์ชื่อถูก ไม่มีไฟล์ชั่วคราวค้าง", JSON.stringify(ls()) === JSON.stringify(["ซับรูป (2024).Text2.en.idx", "ซับรูป (2024).Text2.en.sub"]), JSON.stringify(ls()));
  check("ไฟล์ .idx เป็นดัชนีของ VobSub", readFileSync(`${OUT}/ซับรูป (2024).Text2.en.idx`, "utf8").includes("VobSub index file"));
  check("ไม่มีคำว่ารหัสบนการ์ด", !t1.includes("รหัส"));
  await c.shot(`${SHOT}/01-แยกได้สองไฟล์.png`, "[data-extract]", 6);

  /* ---------------------------------------------------------------- ชื่อชน ตั้งชื่อใหม่ได้คู่เลข 2 */
  await again(); await pickText2();
  await click("[data-extract-start]");
  check("แยกซ้ำ ขึ้นว่ามีไฟล์ชื่อเดียวกันอยู่แล้ว", await waitFor("return !!document.querySelector('[data-conflict]')", 30000), await cardText());
  await q("[...document.querySelectorAll('[data-extract] button')].find((b) => b.innerText.includes('ตั้งชื่อใหม่ต่อท้ายเลข 2')).click(); return 1;");
  await waitFor("return (document.querySelector('[data-extract]')?.innerText ?? '').includes('แยกครบ 2 ไฟล์')", 30000);
  check("ตั้งชื่อใหม่ได้คู่เลข 2 ครบทั้งสองไฟล์", ["ซับรูป (2024).Text2.en 2.idx", "ซับรูป (2024).Text2.en 2.sub"].every((f) => ls().includes(f)) && ls().length === 4, JSON.stringify(ls()));

  /* ---------------------------------------------------------------- ไม่สำเร็จ บอกสาเหตุเป็นภาษาไทย ข้อความเครื่องมืออยู่ในปุ่ม ⓘ */
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(`${OUT}/ซับรูป (2024).Text2.en.sub.partial.sub`, { recursive: true });
  await again(); await pickText2();
  await click("[data-extract-start]");
  check("เครื่องมือล้ม ขึ้นการ์ดไม่สำเร็จ", await waitFor("return !!document.querySelector('[data-extract-error]')", 30000), await cardText());
  const err = await q("return document.querySelector('[data-extract-error]').innerText.replace(/\\s+/g, ' ')");
  check("หัวการ์ดบอกชิ้นที่แยกไม่สำเร็จ", err.startsWith("แยก Text #2 ไม่สำเร็จ"), err);
  check("สาเหตุเป็นประโยคไทย ไม่ใช่แค่รหัส", err.includes("เปิดไฟล์ปลายทางเพื่อเขียนไม่ได้") && !err.includes("รหัส"), err);
  check("หัวการ์ดมีปุ่ม ⓘ ข้อความจากเครื่องมือ", await q("return !!document.querySelector('[data-extract-error] b [data-info]')"));
  await q("document.querySelector('[data-extract-error] b [data-info]').click(); return 1;"); await sleep(400);
  const tip = await q("return document.querySelector('.infotip')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  // ข้อความจริงของ mkvextract ตอนแยก VobSub "Failed to create the VobSub data file '…': open file error"
  check("ปุ่ม ⓘ แสดงบรรทัดสุดท้ายของ mkvextract", tip.includes("Failed to create the VobSub data file") && tip.includes("open file error"), tip);
  check("ข้อความเครื่องมือย่อที่อยู่เหลือชื่อไฟล์", !tip.includes("D:/") && !tip.includes("D:\\") && tip.includes("'ซับรูป (2024).Text2.en.sub.partial.sub'"), tip);
  // ข้อความดิบของเครื่องมือชิดซ้าย ไม่กระจายแบบไทยจนตัวอักษรถ่าง (ภาพรอบแรก 'ซ ั บ ร ู ป ห่างกัน)
  const align = await q("const p = document.querySelector('.infotip .tw'); const s = getComputedStyle(p); return [document.querySelector('.infotip').classList.contains('plain'), s.textAlign, s.textJustify].join(' ')");
  check("กล่อง ⓘ ข้อความเครื่องมือจัดชิดซ้าย", align.startsWith("true left"), align);
  await c.shot(`${SHOT}/02-ไม่สำเร็จ-บอกสาเหตุ.png`, "[data-extract]", 6);
  await c.shot(`${SHOT}/03-กล่องข้อความเครื่องมือ.png`, ".infotip", 8);
  await q("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1;");
  check("ล้มแล้วไม่เหลือไฟล์ชั่วคราว", JSON.stringify(ls()) === JSON.stringify(["ซับรูป (2024).Text2.en.sub.partial.sub"]), JSON.stringify(ls()));
  await again();
} finally {
  await inv("set_settings", { patch: { extractPattern: pat0 } });
  await q("location.reload(); return 1;").catch(() => {}); await sleep(3000);
}
check("คืนรูปแบบชื่อเดิมตอนจบ", (await inv("get_settings")).settings.extractPattern === pat0);
rmSync(TMP, { recursive: true, force: true });
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ · ภาพอยู่ ${SHOT}`);
process.exit(ok === results.length ? 0 : 1);
