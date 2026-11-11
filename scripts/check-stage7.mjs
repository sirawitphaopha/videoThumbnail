// เทสขั้น 7 หน้าตั้งค่า ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก (แผนขั้น 7 · สเปกข้อ 9)
// ผ่านเมื่อ ทุกค่าเปลี่ยนแล้วมีผลทันที เก็บลงไฟล์ค่าตั้ง โหลดหน้าใหม่แล้วยังอยู่ · ซ่อนเครื่องมือไปหนึ่งตัว ป้ายเปลี่ยนเป็นไม่พร้อม
//          แสดงโครงจางค้างไว้กลับเป็นปิดหลังโหลดใหม่ · เอาโฟลเดอร์ออก ยืนยันขั้นเดียว ไฟล์ในเครื่องยังอยู่ · โปรแกรมเล่นหาไม่เจอ พากลับมาตั้ง
// ไม่มีขั้นไหนเปิดหน้าต่างภายนอก (พี่กันลงเวร คนอื่นใช้คอม) ไม่กดเปิดเล่นด้วยโปรแกรมจริง ไม่กดเปิดหน้าเว็บ ไม่เปิดกล่องเลือกไฟล์ของ Windows
// ใช้: node scripts/check-stage7.mjs [--built]  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด)
import { mkdirSync, rmSync, readdirSync, copyFileSync, writeFileSync, existsSync, renameSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const BUILT = process.argv.includes("--built");
const OUT = BUILT ? "docs/report-2026-11-07/ขั้น7-ตัวจริง" : "docs/report-2026-11-07/ขั้น7";
const SRC = resolve("test-media", "สร้าง", "หนัง");
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นตั้งค่า")) rmSync(join(TMP, d), { recursive: true, force: true });
const DIR = join(TMP, `ชั้นตั้งค่า-${Date.now()}`), A = join(DIR, "หนังหลัก"), B = join(DIR, "หนังเก่า");
mkdirSync(OUT, { recursive: true }); mkdirSync(A, { recursive: true }); mkdirSync(B, { recursive: true });
copyFileSync(join(SRC, "Harbor Lights (2021).mkv"), join(A, "Harbor Lights (2021).mkv"));
copyFileSync(join(SRC, "ดาวเหนือ (2023).mkv"), join(B, "ดาวเหนือ (2023).mkv"));
const SETTINGS_FILE = join(process.env.APPDATA, "com.pkh.movieshelf", "settings.json");
const TOOLS = resolve("src-tauri", "target", "debug", "tools");

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const text = (sel) => q(`return document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { if (await q(js)) return true; await sleep(150); } return false; };
const shot = async (f, sel) => { await c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())"); await c.move(5, 790); await sleep(300); return c.shot(`${OUT}/${f}`, sel, 0); };
const nav = (label) => c.evaluate(`[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes(${JSON.stringify(label)})).click()`);
const card = (k) => `[data-setcard="${k}"]`;
/** กดปุ่มในการ์ดตามตัวหนังสือ (ปุ่มคู่ ปุ่มสาม) */
const pressText = (k, t) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(card(k) + " button")})].find(b => b.innerText.trim() === ${JSON.stringify(t)})?.click()`);
const pressSwitch = (label) => c.evaluate(`document.querySelector('[role=switch][aria-label=${JSON.stringify(label)}]').click()`);
const getS = async () => (await inv("get_settings")).settings;
const fileS = () => JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));

// ค่าตั้งต้นของเทส
const DEFAULTS = { folders: [A, B], rescanOnStart: true, checkSourceBefore: true, checkOutputAfter: true, outputFormat: "mkv", originalAfter: "keep", originalsFolder: "",
  posterFormat: "jpg", jpgQuality: 90, shrinkLargePosters: true, defaultCheck: "quick", quickCheckOnStart: false, recheckReminderDays: 30,
  coverSize: "m", showNames: true, showDots: true, playerPath: "", viewMode: "grid", coverOrient: "tall" };
await inv("set_settings", { patch: DEFAULTS });
if (BUILT) {
  await c.send("Page.enable");
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI }));" });
}
await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book').length >= 2", 60000);

/* ---------- 1 หน้าตั้งค่าครบทุกการ์ด ---------- */
await nav("ตั้งค่า");
await waitFor("return !!document.querySelector('[data-settings]') && document.querySelectorAll('[data-tool]').length >= 7", 30000);
const cards = await q("return [...document.querySelectorAll('[data-setcard] h3')].map((h) => h.innerText)");
const folderRows = await q("return [...document.querySelectorAll('[data-folder]')].map((f) => f.innerText.replace(/\\s+/g, ' '))");
check("หน้าตั้งค่ามีการ์ดครบตามต้นแบบ (โฟลเดอร์หนัง ใส่โปสเตอร์ ตรวจไฟล์ ชั้นวาง เปิดเล่นหนัง เครื่องมือเบื้องหลัง) และการ์ดกราฟเสียงที่เพิ่ม",
  ["โฟลเดอร์หนัง", "ใส่โปสเตอร์", "ตรวจไฟล์", "ชั้นวาง", "เปิดเล่นหนัง", "เครื่องมือเบื้องหลัง", "กราฟเสียง"].every((t) => cards.includes(t)), cards.join(" · "));
check("การ์ดโฟลเดอร์ บอกโฟลเดอร์ทั้งสองพร้อมจำนวนเรื่อง", folderRows.length === 2 && folderRows.every((r) => r.includes("1 เรื่อง")), folderRows.join(" | "));
const tools = await q("return [...document.querySelectorAll('[data-tool]')].map((r) => r.dataset.tool + ' ' + (r.querySelector('.toolok, .toolwarn, .toolbad')?.innerText ?? ''))");
check("เครื่องมือเบื้องหลัง 6 ตัวพร้อมใช้งาน · Icaros บอกว่าลงหรือยัง", tools.filter((t) => t.endsWith("พร้อมใช้งาน")).length === 6 && tools.some((t) => /^Icaros (ลงแล้ว|ยังไม่ได้ลง)$/.test(t)), tools.join(" · "));
await c.evaluate("document.querySelector('[data-settingsscroll]').scrollTop = 0");
await shot("01-หน้าตั้งค่า-บน.png");
await c.evaluate("const s = document.querySelector('[data-settingsscroll]'); s.scrollTop = s.scrollHeight");
await shot("02-หน้าตั้งค่า-ล่าง.png");
await c.evaluate("document.querySelector('[data-settingsscroll]').scrollTop = 0");

/* ---------- 2 ทุกค่ามีผลทันที เก็บลงไฟล์ โหลดใหม่ยังอยู่ ---------- */
await pressSwitch("อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม");
await pressSwitch("ตรวจไฟล์ต้นทางก่อนครอบ");
await pressSwitch("ตรวจไฟล์ใหม่หลังครอบเสร็จ");
await pressText("poster", "MP4");
await pressText("poster", "ลบเมื่อตรวจผ่าน");
await pressText("poster", "PNG");
await pressSwitch("ย่อรูปโปสเตอร์ที่ใหญ่เกิน");
await pressText("check", "ตรวจละเอียด");
await pressSwitch("ตรวจแบบเร็วทุกเรื่องตอนเปิดโปรแกรม");
await pressText("shelf", "ใหญ่");
await pressText("shelf", "ปกนอน");
await pressSwitch("ชื่อไฟล์ใต้ปก");
await pressSwitch("จุดสีบอกสภาพไฟล์");
// คุณภาพ JPG ลูกศรซ้ายสามครั้ง 90 → 87 · เก็บตอนหยุด 0.3 วินาที
await c.setNav("poster");
await c.evaluate("document.querySelector('[role=slider][aria-label=\"คุณภาพ JPG\"]').focus()");
for (let i = 0; i < 3; i++) await c.key("ArrowLeft");
// เตือนให้ตรวจซ้ำ ทุก 7 วัน (รายการกางแล้วเลือก)
await c.setNav("check");
await c.click("[data-recheck] button"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('[role=option]')].find((o) => o.innerText.includes('7 วัน'))?.click()");
await sleep(900);
const s1 = await getS(), f1 = fileS();
const want = { rescanOnStart: false, checkSourceBefore: false, checkOutputAfter: false, outputFormat: "mp4", originalAfter: "trash", posterFormat: "png", shrinkLargePosters: false,
  defaultCheck: "full", quickCheckOnStart: true, coverSize: "l", coverOrient: "wide", showNames: false, showDots: false, jpgQuality: 87, recheckReminderDays: 7 };
const bad = Object.entries(want).filter(([k, v]) => s1[k] !== v || f1[k] !== v).map(([k]) => `${k} โปรแกรม ${s1[k]} ไฟล์ ${f1[k]}`);
check("กดเปลี่ยนทุกค่า 15 ค่า มีผลทันทีและเก็บลงไฟล์ค่าตั้งในเครื่องครบ ไม่ต้องกดบันทึก", bad.length === 0, bad.join(" · ") || `ไฟล์ ${SETTINGS_FILE.split("\\").slice(-2).join("\\")}`);
await shot("03-เปลี่ยนค่าแล้ว.png");
// มีผลกับหน้าอื่นทันที · ชั้นวางขนาดใหญ่ ไม่มีชื่อใต้ปก
await nav("ชั้นวางหนัง"); await sleep(600);
const shelfNow = await q("return { size: document.querySelector('[data-shelf]')?.className ?? '', names: document.querySelectorAll('.bname').length }");
check("ค่าที่ตั้งมีผลกับชั้นวางทันที ปกขนาดใหญ่ ไม่มีชื่อไฟล์ใต้ปก", shelfNow.size.includes("size-l") && shelfNow.names === 0, JSON.stringify(shelfNow));
// โหลดหน้าใหม่ (เหมือนเปิดโปรแกรมใหม่) ค่ายังอยู่บนหน้าจอ
await c.evaluate("location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book').length >= 2", 60000);
await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-settings]')", 10000); await sleep(400);
const ui = await q(`const on = (l) => document.querySelector('[role=switch][aria-label="' + l + '"]')?.getAttribute('aria-checked');
  const seg = (k) => [...document.querySelectorAll('[data-setcard="' + k + '"] .seg button.on')].map((b) => b.innerText.trim());
  return { rescan: on('อ่านโฟลเดอร์ใหม่ทุกครั้งที่เปิดโปรแกรม'), names: on('ชื่อไฟล์ใต้ปก'), poster: seg('poster'), check: seg('check'), shelf: seg('shelf'), jpg: document.querySelector('[data-jpgq]')?.innerText, recheck: document.querySelector('[data-recheck] button')?.innerText.trim() };`);
check("โหลดหน้าใหม่แล้วหน้าตั้งค่าขึ้นค่าที่ตั้งไว้", ui.rescan === "false" && ui.names === "false" && ui.poster.join(" ") === "MP4 ลบเมื่อตรวจผ่าน PNG" && ui.check.join(" ") === "ตรวจละเอียด" && ui.shelf.join(" ") === "ใหญ่ ปกนอน" && ui.jpg === "87%" && ui.recheck.includes("7 วัน"), JSON.stringify(ui));
await inv("set_settings", { patch: DEFAULTS });
await c.evaluate("location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book').length >= 2", 60000);

/* ---------- 3 เอาโฟลเดอร์ออก ยืนยันขั้นเดียว ---------- */
await nav("ตั้งค่า"); await waitFor("return document.querySelectorAll('[data-folder]').length === 2", 10000);
await c.evaluate("[...document.querySelectorAll('[data-folder]')].find((r) => r.dataset.folder.endsWith('หนังเก่า')).querySelector('[data-removefolder]').click()");
await waitFor("return !!document.querySelector('[data-confirmremove]')", 5000);
const dlg = await text(".dlg");
check("กดเอาออกจากชั้น ขึ้นหน้าต่างยืนยันพร้อมข้อความว่าไฟล์ในเครื่องยังอยู่ครบ", dlg.includes("หนังเก่า") && dlg.includes("ไฟล์ในเครื่องยังอยู่ครบ ไม่ถูกลบ"), dlg);
await shot("04-ยืนยันเอาโฟลเดอร์ออก.png", ".dlg");
await c.click("[data-confirmremove]");
await waitFor("return document.querySelectorAll('[data-folder]').length === 1", 10000);
await sleep(1500);
await nav("ชั้นวางหนัง"); await sleep(800);
const books = await q("return [...document.querySelectorAll('.book[data-movie]')].map((b) => b.dataset.movie)");
check("เอาโฟลเดอร์ออกแล้ว หนังในโฟลเดอร์นั้นหายจากชั้น ไฟล์ในเครื่องยังอยู่", books.length === 1 && books[0] === "Harbor Lights (2021)" && existsSync(join(B, "ดาวเหนือ (2023).mkv")) && (await getS()).folders.length === 1, `บนชั้น ${books.join(" · ")} · ไฟล์ ${existsSync(join(B, "ดาวเหนือ (2023).mkv")) ? "ยังอยู่" : "หาย"}`);

/* ---------- 4 โครงจางค้างไว้ กลับเป็นปิดหลังโหลดใหม่ ---------- */
await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-skelpreview]')", 10000);
await c.setNav("shelf");
await c.click("[data-skelpreview] [role=switch]"); await sleep(300);
await nav("ชั้นวางหนัง"); await sleep(600);
const skelOn = await q("return { skel: document.querySelectorAll('[data-shelf] .skel, [aria-label=\"กำลังอ่านโฟลเดอร์\"] .skel').length, books: document.querySelectorAll('.book[data-movie]').length }");
await shot("05-ชั้นวาง-โครงจางค้างไว้.png");
await c.evaluate("location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book[data-movie]').length >= 1", 60000);
const skelOff = await q("return document.querySelectorAll('.book[data-movie]').length");
check("แสดงโครงจางค้างไว้ ชั้นวางขึ้นโครงจางแทนหนัง · โหลดใหม่แล้วกลับเป็นปิดเอง ไม่เก็บลงไฟล์", skelOn.skel > 0 && skelOn.books === 0 && skelOff === 1 && !("skelPreview" in fileS()), `เปิด ${JSON.stringify(skelOn)} · โหลดใหม่ หนัง ${skelOff} เรื่อง`);

/* ---------- 5 ซ่อนเครื่องมือหนึ่งตัว ป้ายเปลี่ยนเป็นไม่พร้อม ---------- */
let hidOk = false;
const mi = join(TOOLS, "MediaInfo.exe"), miHidden = join(TOOLS, "MediaInfo.exe.ซ่อนเทส");
if (BUILT && existsSync(mi)) {
  renameSync(mi, miHidden); hidOk = true;
  try {
    await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-retools]')", 10000);
    await c.setNav("tools"); await c.click("[data-retools]"); await sleep(300);
    await waitFor("return document.querySelector('[data-retools]')?.innerText.includes('ตรวจเครื่องมือใหม่')", 30000);
    const miRow = await text('[data-tool="MediaInfo"]');
    check("ซ่อน MediaInfo ไปหนึ่งตัว กดตรวจเครื่องมือใหม่ ป้ายเปลี่ยนเป็นไม่พร้อม", miRow.includes("ไม่พร้อม"), miRow);
    await shot("06-เครื่องมือไม่พร้อม.png", card("tools"));
  } finally { renameSync(miHidden, mi); }
  await c.setNav("tools"); await c.click("[data-retools]"); await sleep(300);
  await waitFor("return document.querySelector('[data-retools]')?.innerText.includes('ตรวจเครื่องมือใหม่')", 30000);
  check("คืนไฟล์แล้วกดตรวจใหม่ กลับเป็นพร้อมใช้งาน", (await text('[data-tool="MediaInfo"]')).includes("พร้อมใช้งาน"), await text('[data-tool="MediaInfo"]'));
} else console.log("ข้าม ซ่อนเครื่องมือ · ใช้กับตัวที่สร้างจริงเท่านั้น (--built)");

/* ---------- 6 วิธีลง Icaros (ไม่กดเปิดหน้าเว็บ) ---------- */
await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-tool=\"Icaros\"]')", 10000);
// รอผลเช็ก Icaros ก่อน (ระหว่างเช็กป้ายเป็นโครงจาง ไม่มีทั้งปุ่มวิธีลงและคำว่าลงแล้ว · รอบเทสรวม 8 พ.ย. 2569 อ่านตอนยังเช็กไม่เสร็จ ข้อล้มผิด)
await waitFor("const t = document.querySelector('[data-tool=\"Icaros\"]')?.innerText ?? ''; return t.includes('ลงแล้ว') || t.includes('ยังไม่ได้ลง')", 30000);
if (await q("return !!document.querySelector('[data-icaroshelp]')")) {
  await c.setNav("tools"); await c.click("[data-icaroshelp]"); await waitFor("return !!document.querySelector('[data-openicaros]')", 5000);
  const help = await q("return { steps: document.querySelectorAll('.dlg ol.steps li').length, btns: [...document.querySelectorAll('.dlg .acts button')].map((b) => b.innerText.trim()) }");
  check("Icaros ยังไม่ได้ลง กดวิธีลง ขึ้น 4 ขั้น ปุ่ม ปิด กับ เปิดหน้าเว็บ Icaros", help.steps === 4 && help.btns.join(" ") === "ปิด เปิดหน้าเว็บ Icaros", JSON.stringify(help));
  await shot("07-วิธีลง-Icaros.png", ".dlg");
  await c.evaluate("[...document.querySelectorAll('.dlg .acts button')].find((b) => b.innerText.trim() === 'ปิด').click()"); await sleep(300);
} else check("Icaros ลงแล้ว ป้ายบอกลงแล้ว ไม่มีปุ่มวิธีลง", (await text('[data-tool="Icaros"]')).includes("ลงแล้ว"));

/* ---------- 7 โปรแกรมเล่นที่เลือกเองหาไม่เจอ พากลับมาตั้ง (ไม่เปิดโปรแกรมเล่นจริง) ---------- */
await inv("set_settings", { patch: { playerPath: "C:\\ไม่มีโปรแกรมนี้\\vlc.exe" } });
await c.evaluate("location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book[data-movie]').length >= 1", 60000);
await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-player]')", 10000);
await c.setNav("player");
await waitFor("return !!document.querySelector('[data-player-default][data-player*=\"vlc.exe\"]')", 10000);
const playerRow = await text('[data-player-default][data-player*="vlc.exe"]');
check("โปรแกรมเล่นที่ตั้งไว้หาไม่เจอ ยังขึ้นในรายการเป็นค่าตั้งต้น พร้อมบอกว่าหาไฟล์ไม่เจอ", playerRow.includes("vlc.exe") && playerRow.includes("ค่าตั้งต้น") && playerRow.includes("หาไฟล์ไม่เจอ"), playerRow);
await shot("08-โปรแกรมเล่นเลือกเอง.png", card("player"));
await nav("ชั้นวางหนัง"); await sleep(500);
await c.book("Harbor Lights (2021)"); await sleep(400);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find((b) => b.innerText.includes('เปิดเล่น')).click()");
const back = await waitFor("return [...document.querySelectorAll('.toast')].some((t) => t.innerText.includes('หาโปรแกรมเล่นหนัง')) && document.querySelector('[data-settings]')?.offsetParent != null", 8000);
const toastTxt = await q("return [...document.querySelectorAll('.toast')].map((t) => t.innerText).find((t) => t.includes('หาโปรแกรมเล่นหนัง')) ?? ''");
check("โปรแกรมเล่นที่เลือกไว้หาไม่เจอ กดเปิดเล่นแล้วบอก และพากลับมาหน้าตั้งค่า", back && toastTxt.includes("หาโปรแกรมเล่นหนัง"), toastTxt);
await inv("set_settings", { patch: { playerPath: "" } });

/* ---------- 8 ผลอ่านคลื่นที่เก็บไว้ ล้างได้ ---------- */
await nav("ตั้งค่า"); await waitFor("return !!document.querySelector('[data-clearcache]')", 10000);
await c.setNav("graph"); await c.click("[data-clearcache]"); await sleep(600);
const cache = await text("[data-graphcache]");
check("การ์ดกราฟเสียง กดล้าง ผลอ่านคลื่นที่เก็บไว้เหลือ 0 ไฟล์", cache.includes("เก็บไว้ 0 ไฟล์"), cache);

if (BUILT) {
  const csp = await q("return window.__csp ?? null");
  check("ตัวโปรแกรมที่สร้างจริง ไม่มีอะไรโดนกติกาความปลอดภัยกัน", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
}
await inv("set_settings", { patch: DEFAULTS });
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exit(pass === results.length ? 0 : 1);
